// All evidence here is synthetic. Never connects to SQL or proves a backup exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewD1 } from '../../tools/sql/d1-review.mjs';

const reviewedPlan = () => JSON.parse(readFileSync(new URL('../../deploy/d1-review.json', import.meta.url), 'utf8'));
// Unit scenarios must not inherit live approvals from the review document.
const plan = () => ({ ...reviewedPlan(), backupExecutionApproval: null, markerExecutionApproval: null });
function receipt(p) {
  return { status: 'BACKUP_VERIFYONLY_SUCCEEDED_NOT_RESTORE_TESTED', backupSetUuid: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    serverIdentity: p.serverIdentity, database: p.database, databaseGuid: p.databaseGuid, mediaName: p.mediaName,
    backupPath: p.backupPath, position: 1, copyOnly: true, checksums: true, verifyOnlySucceeded: true,
    finishedAt: '2026-11-11T15:00:00Z', writersStoppedConfirmed: true };
}
test('confirmed test database never implies approval of backup or marker execution', () => {
  const state = reviewD1(plan());
  assert.equal(state.databaseTestUse, 'CONFIRMED');
  assert.equal(state.backupExecution, 'PENDING_SEPARATE_APPROVAL');
  assert.equal(state.markerExecution, 'BLOCKED'); assert.equal(state.writesExecuted, false);
});
test('marker approval cannot bypass missing or failed backup evidence', () => {
  const p = plan(); p.markerExecutionApproval = 'FIXTURE_ONLY';
  assert.equal(reviewD1(p).markerExecution, 'BLOCKED');
  const r = receipt(p); r.verifyOnlySucceeded = false;
  assert.equal(reviewD1(p, r).markerExecution, 'BLOCKED');
});
test('receipt must match target GUID, server, media and checksum flags, not only database name', () => {
  const p = plan(); p.markerExecutionApproval = 'FIXTURE_ONLY';
  for (const patch of [{ databaseGuid: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }, { serverIdentity: 'another-server' },
    { backupSetUuid: null }, { copyOnly: false }, { checksums: false }, { position: 2 },
    { mediaName: 'other' }, { backupPath: 'other' }, { finishedAt: 'invalid' }]) {
    assert.equal(reviewD1(p, { ...receipt(p), ...patch }).backupEvidence, 'MISSING_OR_INCONSISTENT');
  }
});
test('consistent synthetic receipt still does not prove SQL backup, restore or authorize live execution', () => {
  const p = plan(); p.markerExecutionApproval = 'FIXTURE_ONLY';
  assert.equal(reviewD1(p, receipt(p)).markerExecution, 'BLOCKED');
  p.backupExecutionApproval = 'FIXTURE_ONLY';
  assert.equal(reviewD1(p, { ...receipt(p), writersStoppedConfirmed: false }).markerExecution, 'BLOCKED');
  const state = reviewD1(p, receipt(p));
  assert.equal(state.markerExecution, 'EVIDENCE_RECORDED_REQUIRES_DBA_REVERIFY');
  assert.equal(state.sqlConnected, false); assert.equal(state.restoreRehearsal, 'NOT_VERIFIED');
});
test('executed auth approvals match sources; original 004 remains disabled and is not confused with 004r', () => {
  const p = reviewedPlan();
  const sql = name => readFileSync(new URL('../../database/proposals/auth-v1/' + name, import.meta.url), 'utf8');
  const backup = sql('000-backup-plan.sql.pending'), marker = sql('004-test-marker.sql.pending');
  for (const script of [backup, marker]) {
    assert.ok(script.includes(p.backupPath)); assert.ok(script.includes(p.mediaName));
    assert.ok(script.includes(p.databaseGuid.toUpperCase())); assert.ok(script.includes(p.serverIdentity));
  }
  assert.ok(backup.includes(`@BackupApprovalReference nvarchar(200)=N'${p.backupExecutionApproval}'`));
  assert.ok(marker.includes(`@MarkerExecutionApprovalReference nvarchar(200)=N'${p.markerExecutionApproval}'`));
  assert.match(marker, /@VerifiedBackupSetUuid uniqueidentifier='[A-F0-9-]{36}'/);
  assert.match(marker, /@WritersStoppedConfirmed bit=0/);
  assert.ok(marker.indexOf('@WritersStoppedConfirmed<>1') < marker.indexOf('RESTORE VERIFYONLY'));
  assert.ok(marker.includes(p.proposedTestIdentity));
  assert.ok(marker.indexOf('RESTORE VERIFYONLY') < marker.indexOf('BEGIN TRANSACTION'));
  for (const name of ['001-auth-read.sql.pending', '003-rpc-permissions.sql.pending']) {
    const script = sql(name);
    const decisions = JSON.parse(readFileSync(new URL('../../deploy/login-sql-decisions.json', import.meta.url), 'utf8'));
    assert.ok(script.includes(`@ApprovalReference nvarchar(200) = N'${decisions.firstTwoApprovalReference}'`));
    assert.ok(script.includes("@ApprovedDatabase sysname = N'SongLamPms_Design'"));
    assert.ok(script.includes('Approved D1 marker required.'));
    assert.ok(script.includes(p.proposedTestIdentity)); assert.ok(script.includes(p.serverIdentity));
  }
});

test('recorded marker approval is distinct from verified stopped-writer evidence', () => {
  const p = plan(); p.backupExecutionApproval = p.markerExecutionApproval = 'FIXTURE_ONLY';
  const state = reviewD1(p, { ...receipt(p), writersStoppedConfirmed: false });
  assert.equal(state.markerApproval, 'RECORDED');
  assert.equal(state.stoppedWriterEvidence, 'NOT_CONFIRMED');
  assert.equal(state.markerExecution, 'BLOCKED');
  assert.equal(state.writesExecuted, false);
});
test('invalid or mismatched proposal metadata is rejected before any action', () => {
  for (const patch of [{ databaseTestUseApproved: false }, { testUseReference: '' },
    { proposedTestIdentity: null }, { backupPath: 'C:\\different.bak' }]) {
    assert.throws(() => reviewD1({ ...plan(), ...patch }), /D1_PLAN_INVALID/);
  }
});
