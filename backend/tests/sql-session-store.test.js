// S0 adapter fixtures only. Does not connect, deploy pending SQL or persist any SQL data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSqlSessionStore } from '../src/adapters/sql/session-store.js';

const procedures = { probe: 'pms.usp_WebSessionProbe', create: 'pms.usp_WebSessionCreate', get: 'pms.usp_WebSessionGet', destroy: 'pms.usp_WebSessionDestroy' };
const types = { BigInt: 'BigInt', Int: 'Int', VarChar: n => `VarChar(${n})`, DateTime2: n => `DateTime2(${n})` };
const key = 'b'.repeat(64), epoch = randomBytes(32).toString('base64url'), time = Date.parse('2026-11-11T13:00:00Z');
const record = { appUserId: '9007199254740993', securityVersion: '0x0000000000000001', csrfToken: randomBytes(32).toString('base64url'), expiresAt: time + 3600000 };
function fixture() {
  const rows = new Map(), calls = []; let failure = false, hang = false, resultOverride;
  const pool = { request() {
    const p = {};
    return { input(k, _type, v) { p[k] = v; return this; }, cancel() { calls.push({ cancelled: true }); },
      async execute(procedure) {
        calls.push({ procedure, parameters: p });
        if (failure) throw new Error('private-session-password'); if (hang) return new Promise(() => {});
        if (resultOverride !== undefined) return { recordsets: [resultOverride] };
        const id = `${p.EpochHash}:${p.SessionKeyHash}`, ack = Status => ({ recordsets: [[{ EpochHash: p.EpochHash, SessionKeyHash: p.SessionKeyHash, Status }]] });
        if (procedure === procedures.probe) return { recordsets: [[{ Ready: true }]] };
        if (procedure === procedures.create) {
          if (rows.has(id)) throw new Error('duplicate');
          rows.set(id, { ...p, ExpiresAtMs: String(p.ExpiresAtUtc.getTime()) }); return ack('CREATED');
        }
        if (procedure === procedures.destroy) { rows.delete(id); return ack('DESTROYED'); }
        return { recordsets: [rows.has(id) ? [rows.get(id)] : []] };
      } };
  } };
  const options = { pool, types, environment: 'test', database: 'SongLamPms_Test', epoch, now: () => time, timeoutMs: 15,
    manifest: { approved: true, approvalReference: 'FIXTURE_ONLY', protocol: 'songlam.session.v1', environment: 'test', database: 'SongLamPms_Test',
      sessionWritesApproved: true, sessionWriteApprovalReference: 'FIXTURE_ONLY', procedures } };
  return { options, rows, calls, store: createSqlSessionStore(options), fail: () => { failure = true; }, hang: () => { hang = true; }, override: value => { resultOverride = value; } };
}
test('S0 stays disabled without separate session-write approval, explicit target or external epoch', async () => {
  const f = fixture();
  for (const change of [{ epoch: undefined }, { database: undefined, manifest: { ...f.options.manifest, database: undefined } },
    { manifest: { ...f.options.manifest, sessionWritesApproved: false } }, { environment: 'production' }]) {
    const s = createSqlSessionStore({ ...f.options, ...change }); assert.equal(s.configured, false); assert.equal(await s.probe(), false);
    await assert.rejects(s.get(key), { code: 'SQL_SESSION_UNAVAILABLE' });
  }
  assert.equal(f.calls.length, 0);
});
test('session RPCs are typed, preserve bigint identity, create-if-absent and destroy idempotently', async () => {
  const f = fixture(); assert.equal(await f.store.probe(), true);
  await f.store.create(key, record, 3600000); assert.deepEqual(await f.store.get(key), record);
  await assert.rejects(f.store.create(key, record, 3600000), { code: 'SQL_SESSION_UNAVAILABLE' }); assert.equal(f.rows.size, 1);
  await f.store.destroy(key); await f.store.destroy(key); assert.equal(await f.store.get(key), null);
  assert.equal(f.calls.every(c => !c.procedure || Object.values(procedures).includes(c.procedure)), true);
  assert.equal(f.calls.find(c => c.procedure === procedures.create).parameters.TtlMs, 3600000);
  assert.doesNotMatch(JSON.stringify(f.calls), new RegExp(epoch));
});
test('epoch rotation isolates even a restored old fixture session snapshot; no raw cookie or epoch is persisted', async () => {
  const f = fixture(); await f.store.create(key, record, 3600000);
  const backup = new Map(f.rows); await f.store.destroy(key); assert.equal(f.rows.size, 0);
  // Simulate restoring a stale DB snapshot after logout, without touching SQL.
  for (const [id, row] of backup) f.rows.set(id, row);
  const rotated = createSqlSessionStore({ ...f.options, epoch: randomBytes(32).toString('base64url') });
  assert.equal(await rotated.get(key), null); assert.equal(f.rows.size, 1); assert.deepEqual(await f.store.get(key), record);
  assert.equal([...f.rows.values()].some(r => Object.values(r).includes(epoch)), false);
});
test('duplicate/malformed/unsafe identity and expired SQL rows cannot become authenticated sessions', async () => {
  for (const mode of ['duplicate', 'numeric-id', 'expired', 'wrong-epoch', 'null']) {
    const f = fixture(); await f.store.create(key, record, 3600000); const row = [...f.rows.values()][0];
    if (mode === 'duplicate') f.override([row, row]);
    if (mode === 'numeric-id') f.override([{ ...row, AppUserId: 9007199254740992 }]);
    if (mode === 'wrong-epoch') f.override([{ ...row, EpochHash: '0'.repeat(64) }]);
    if (mode === 'null') f.override([null]);
    if (mode === 'expired') { f.override([{ ...row, ExpiresAtMs: String(time - 1) }]); assert.equal(await f.store.get(key), null); }
    else await assert.rejects(f.store.get(key), { code: 'SQL_SESSION_UNAVAILABLE' });
  }
});
test('session outage/timeout/invalid acknowledgements never report create or destroy success', async () => {
  const f = fixture(); f.fail(); await assert.rejects(f.store.create(key, record, 3600000), e => e.code === 'SQL_SESSION_UNAVAILABLE' && !e.message.includes('private-session-password'));
  const h = fixture(); h.hang(); await assert.rejects(h.store.destroy(key), { code: 'SQL_SESSION_UNAVAILABLE' }); assert.ok(h.calls.some(c => c.cancelled));
  const a = fixture(); a.override([{ Status: 'PENDING' }]); await assert.rejects(a.store.create(key, record, 3600000), { code: 'SQL_SESSION_UNAVAILABLE' });
});
