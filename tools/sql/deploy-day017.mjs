// Exact, one-shot deployment of the separately approved Day017 test package.
// Must run as the operator after stop-for-day017.ps1, never as the service pool.
import { createRequire } from 'node:module';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const approval = 'USER-20261114-DAY017';
if (process.argv.slice(2).join(' ') !== '--apply --approval=' + approval) throw new Error('EXACT_APPROVAL_REQUIRED');
if (execFileSync('whoami.exe', { encoding: 'utf8', windowsHide: true }).trim().toLowerCase()
  !== 'desktop-9epi86k\\thang dz') throw new Error('OPERATOR_REQUIRED');
const root = new URL('../../', import.meta.url);
const files = [
  ['database/proposals/business-day/017-backup.sql.pending', '66C2EB5F3C1F10D5A5981FADF4AD154C1508F3CDFEEDE577B0487FC2D15106C7'],
  ['database/proposals/business-day/017-align-test-day.sql.pending', 'A8090729014CE905A08D64F866241BDE0FC896649237166D43DDF18A975A40D6']
];
const source = [];
for (const [path, hash] of files) {
  const data = await readFile(new URL(path, root));
  assert.equal(createHash('sha256').update(data).digest('hex').toUpperCase(), hash, 'PACKAGE_HASH_CHANGED');
  source.push(data.toString('utf8'));
}
const backupPath = 'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Backup\\SongLamPms_Design_Day017_20261114_7bb2fadc.bak';
try { await access(backupPath); throw new Error('BACKUP_PATH_ALREADY_EXISTS'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const require = createRequire(new URL('backend/package.json', root));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({ server: '.\\SQLEXPRESS', database: 'SongLamPms_Design',
  driver: 'ODBC Driver 17 for SQL Server',
  options: { trustedConnection: true, encrypt: true, trustServerCertificate: true },
  beforeConnect: connection => { connection.conn_str += ';TrustServerCertificate=Yes;'; } });
async function request(query, timeout = 30000) { const r = pool.request(); r.timeout = timeout; return r.query(query); }
async function noOtherSessions(phase) {
  const result = await request(`SELECT COUNT(*) OtherSessions FROM sys.dm_exec_sessions
    WHERE is_user_process=1 AND database_id=DB_ID() AND session_id<>@@SPID;`);
  if (result.recordset[0].OtherSessions !== 0) throw new Error('OTHER_SQL_SESSIONS_' + phase);
}
try {
  await pool.connect();
  await noOtherSessions('BEFORE_BACKUP');
  const pre = await request(`SELECT DB_NAME() DatabaseName,CONVERT(varchar(36),database_guid) DatabaseGuid
    FROM sys.database_recovery_status WHERE database_id=DB_ID();
    SELECT CONVERT(char(10),h.WorkingDate,23) WorkingDate,
      CONVERT(char(10),SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE h.TimeZoneId,23) HotelToday
    FROM pms.HotelSettings h WHERE HotelId=1;`);
  assert.equal(pre.recordsets[0][0].DatabaseName, 'SongLamPms_Design');
  assert.equal(pre.recordsets[0][0].DatabaseGuid.toUpperCase(), 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC');
  assert.deepEqual(pre.recordsets[1][0], { WorkingDate: '2026-10-11', HotelToday: '2026-11-14' });
  const backup = await request(source[0], 300000);
  const row = backup.recordsets.at(-1)?.[0];
  const uuid = row?.BackupSetUuid;
  assert.match(uuid || '', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  assert.equal(Boolean(row.has_backup_checksums), true);
  assert.equal(Boolean(row.is_copy_only), true);
  assert.equal(row.physical_device_name, backupPath);
  console.log(JSON.stringify({ phase: 'BACKUP_VERIFYONLY_PASS', backupSetUuid: uuid, file: backupPath }));
  await noOtherSessions('BEFORE_TRANSACTION');
  const script = source[1].replaceAll('$(Day017ApprovalReference)', approval)
    .replaceAll('$(Day017BackupSetUuid)', uuid);
  if (script.includes('$(')) throw new Error('UNEXPANDED_SQLCMD_VARIABLE');
  const applied = await request(script, 60000);
  const receipt = JSON.parse(applied.recordsets.at(-1)?.[0]?.ReceiptJson || 'null');
  assert.equal(receipt?.approvalReference, approval);
  assert.equal(receipt?.backupSetUuid?.toUpperCase(), uuid.toUpperCase());
  assert.equal(receipt?.committed, true);
  console.log(JSON.stringify({ phase: 'DAY017_COMMIT_ACK', requestId: receipt.requestId,
    backupSetUuid: uuid, oldWorkingDate: receipt.oldWorkingDate,
    newWorkingDate: receipt.newWorkingDate, actorId: receipt.actorId }));
} finally { await pool.close(); }
