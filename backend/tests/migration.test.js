// Synthetic offline G11 data/adapter only. No SQL, browser or customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { digest, verifySource } from '../../tools/migration/lib/core.mjs';
import { analyze } from '../../tools/migration/lib/analyze.mjs';
import { reconcile } from '../../tools/migration/lib/reconcile.mjs';
import { importBatches } from '../../tools/migration/lib/import-engine.mjs';
import { createApprovedImportAdapter } from '../../tools/migration/sql-adapter.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function source() {
  const data = { version: '2.1.0', rooms: [{ id: '401', number: '401', floor: 4, classCode: 'SUP-K', cleanStatus: 'clean', exploitationStatus: 'active' }],
    transactions: [{ id: 'tx-1', amount: 1000000, status: 'success', gatewayVerified: true, paymentMethod: 'bank_transfer' }] };
  const manifest = { format: 'songlam-migration/1', schemaVersion: 1, batchId: '97d023d5-19ea-4d1d-9372-b0fb3e34a97a',
    sourceKey: 'songlam_hotel_pms_data_v2', exportedAtUtc: '2026-11-09T12:00:00Z', originalUtf8Sha256: '0'.repeat(64),
    exportedSourceSha256: digest(data), redactions: [], datasets: Object.entries(data).map(([name, value]) => ({ name, count: Array.isArray(value) ? value.length : 1, sha256: digest(value) })) };
  return { data, manifest };
}
test('offline manifest detects changed source/counts; analysis quarantines browser bank-success without evidence', () => {
  const { data, manifest } = source(), bundle = verifySource(data, manifest);
  const plan = analyze(bundle);
  const payment = plan.records.find(r => r.collection === 'transactions');
  assert.equal(payment.status, 'QUARANTINED'); assert.ok(payment.reasons.includes('PAYMENT_EVIDENCE_REQUIRED_BROWSER_FLAGS_NOT_PROOF'));
  assert.equal(reconcile(plan, null).status, 'FAIL');
  data.transactions[0].amount = 0;
  assert.throws(() => verifySource(data, manifest), { code: 'SOURCE_CHECKSUM_MISMATCH' });
});
test('no config flag can enable the unapproved historical SQL importer', () => {
  assert.throws(() => createApprovedImportAdapter({ approved: true }), { code: 'SQL_IMPORT_LOCKED_NO_APPROVED_CONTRACT_OR_REHEARSAL_ADAPTER' });
});
test('browser exporter reads only an operator-selected fixture call, never initializes Store, strips secrets and preserves manifest', async () => {
  let reads = 0, blob;
  const raw = JSON.stringify({ version: '2.1.0', users: [{ id: 'u1', username: 'fixture', password: 'REDACT_THIS', token: 'REDACT_TOKEN' }],
    transactions: [{ id: 't1', amount: 1000, notes: 'REDACT_FREE_TEXT' }] });
  const context = { crypto: webcrypto, TextEncoder, Blob, setTimeout: fn => { fn(); }, confirm: () => true,
    location: { origin: 'http://fixture.test' }, URL: { createObjectURL(value) { blob = value; return 'blob:fixture'; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) },
    localStorage: { getItem(key) { reads++; assert.equal(key, 'songlam_hotel_pms_data_v2'); return raw; } } };
  Object.defineProperty(context, 'SongLamStore', { get() { throw new Error('Exporter must not initialize Store'); } });
  vm.createContext(context); vm.runInContext(fs.readFileSync(new URL('../../tools/migration/browser-export.js', import.meta.url), 'utf8'), context);
  assert.equal(reads, 0); await context.SongLamMigrationExport(); assert.equal(reads, 1);
  const text = await blob.text(), packet = JSON.parse(text);
  assert.doesNotMatch(text, /REDACT_THIS|REDACT_TOKEN|REDACT_FREE_TEXT/);
  assert.equal(packet.source.transactions[0].amount, 1000); assert.ok(packet.manifest.redactions.length >= 3);
  assert.doesNotThrow(() => verifySource(packet.source, packet.manifest));
});
function importFixture(status) {
  const plan = { format: 'songlam-migration-plan/1', batchId: 'fixture-only', sourceSha256: 'source', manifestSha256: 'manifest',
    blockers: [], money: { coverage: 'COMPLETE', ledger: [] }, records: [{ sourceRef: 'r1', status: 'IMPORT_READY', mappings: [] }] };
  plan.planSha256 = digest(plan);
  const config = { environment: 'rehearsal', testOnly: true, server: 'fixture-NOT-SQL', database: 'SongLamPms_Rehearsal',
    expectedDatabaseFingerprint: 'fixture', operatorAppUserId: '1', contractApprovalReference: 'fixture-not-approval', actorMappingApprovalReference: 'fixture-not-approval',
    backupAttestation: { approvalReference: 'fixture', restoredDatabaseFingerprint: 'fixture' } };
  let commits = 0, saved = null;
  const adapter = {
    async capabilities() { return { atomicBatch: true, durableIdempotency: true, sourceDigestRegistry: true, historicalOnly: true, rollbackOnFailure: true, completeReadback: true, maxRecords: 10, maxPayloadBytes: 10000 }; },
    async verifyEnvironment() { return { environment: 'rehearsal', server: config.server, database: config.database, databaseFingerprint: 'fixture' }; },
    async registerSource() {}, async getReceipt() { return saved || { status: 'UNKNOWN' }; },
    async importAtomicBatch(args) { commits++; saved = { ...args, status, committedAtUtc: '2026-11-09T12:00:00Z' }; if (status === 'COMMITTED') throw new Error('fixture lost response'); return saved; },
    async readback() { return { status: 'fixture-only' }; }
  };
  return { plan, config, adapter, commits: () => commits, aggregates: [{ atomic: true, sourceRefs: ['r1'], records: [{ fixture: true }] }] };
}
test('historical batch replay after a fixture timeout reads committed receipt, never reimports', async () => {
  const f = importFixture('COMMITTED');
  const checkpointDirectory = await mkdtemp(path.join(os.tmpdir(), 'songlam-migration-test-'));
  await importBatches({ ...f, checkpointDirectory }); await importBatches({ ...f, checkpointDirectory });
  assert.equal(f.commits(), 1); assert.equal((await readdir(checkpointDirectory)).filter(f => f.startsWith('checkpoint-')).length, 2);
});
test('a pending/invalid receipt must never create a COMMITTED checkpoint', async () => {
  const f = importFixture('PENDING');
  const checkpointDirectory = await mkdtemp(path.join(os.tmpdir(), 'songlam-migration-test-'));
  await assert.rejects(importBatches({ ...f, checkpointDirectory }), { code: 'RECEIPT_CONTENT_CHANGED_OR_INVALID' });
  assert.equal((await readdir(checkpointDirectory)).filter(f => f.startsWith('checkpoint-')).length, 0);
});
