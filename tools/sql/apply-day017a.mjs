// Approved one-shot retry of the Day017 transaction after backup VERIFYONLY.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const approval = 'USER-20261114-DAY017A';
if (process.argv.slice(2).join(' ') !== '--apply --approval=' + approval) throw new Error('EXACT_APPROVAL_REQUIRED');
if (execFileSync('whoami.exe', { encoding: 'utf8', windowsHide: true }).trim().toLowerCase()
  !== 'desktop-9epi86k\\thang dz') throw new Error('OPERATOR_REQUIRED');
const root = new URL('../../', import.meta.url);
const source = await readFile(new URL('database/proposals/business-day/017a-align-test-day-sqlvariant.sql.pending', root));
assert.equal(createHash('sha256').update(source).digest('hex').toUpperCase(),
  '679AE3CCD6CCDDBF7FD202E0ED61EB7A64420B345365EC8FAB49C496290D182C');
const uuid = 'D1E9B4E7-0F29-4A3A-B8A6-91B8FD099C1B';
const path = 'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Backup\\SongLamPms_Design_Day017_20261114_7bb2fadc.bak';
const require = createRequire(new URL('backend/package.json', root));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({ server: '.\\SQLEXPRESS', database: 'SongLamPms_Design',
  driver: 'ODBC Driver 17 for SQL Server',
  options: { trustedConnection: true, encrypt: true, trustServerCertificate: true },
  beforeConnect: connection => { connection.conn_str += ';TrustServerCertificate=Yes;'; } });
async function query(text, timeout = 30000) { const request = pool.request(); request.timeout = timeout; return request.query(text); }
try {
  await pool.connect();
  const state = await query(`SELECT DB_NAME() DatabaseName,CONVERT(varchar(36),database_guid) DatabaseGuid FROM sys.database_recovery_status WHERE database_id=DB_ID();
    SELECT COUNT(*) OtherSessions FROM sys.dm_exec_sessions WHERE is_user_process=1 AND database_id=DB_ID() AND session_id<>@@SPID;
    SELECT CONVERT(char(10),h.WorkingDate,23) WorkingDate,CONVERT(char(10),SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE h.TimeZoneId,23) HotelToday,
      CONVERT(varchar(18),CONVERT(binary(8),h.RowVer),1) SettingsVersion FROM pms.HotelSettings h WHERE HotelId=1;
    SELECT b.backup_set_uuid,b.is_copy_only,b.has_backup_checksums,m.physical_device_name FROM msdb.dbo.backupset b
    JOIN msdb.dbo.backupmediafamily m ON m.media_set_id=b.media_set_id WHERE b.backup_set_uuid='${uuid}';`);
  assert.equal(state.recordsets[0][0].DatabaseName, 'SongLamPms_Design');
  assert.equal(state.recordsets[0][0].DatabaseGuid.toUpperCase(), 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC');
  assert.equal(state.recordsets[1][0].OtherSessions, 0);
  assert.deepEqual(state.recordsets[2][0], { WorkingDate: '2026-10-11', HotelToday: '2026-11-14', SettingsVersion: '0x0000000000014063' });
  const backup = state.recordsets[3][0];
  assert.equal(backup.backup_set_uuid.toUpperCase(), uuid);
  assert.equal(backup.physical_device_name, path);
  assert.equal(Boolean(backup.is_copy_only), true);
  assert.equal(Boolean(backup.has_backup_checksums), true);
  await query(`RESTORE VERIFYONLY FROM DISK=N'${path}' WITH CHECKSUM;`, 300000);
  console.log(JSON.stringify({ phase: 'BACKUP_REVERIFY_PASS', backupSetUuid: uuid }));
  const second = await query(`SELECT COUNT(*) OtherSessions FROM sys.dm_exec_sessions WHERE is_user_process=1 AND database_id=DB_ID() AND session_id<>@@SPID;`);
  assert.equal(second.recordset[0].OtherSessions, 0);
  const script = source.toString('utf8').replaceAll('$(Day017ApprovalReference)', approval)
    .replaceAll('$(Day017BackupSetUuid)', uuid);
  assert.equal(script.includes('$('), false);
  const result = await query(script, 60000);
  const receipt = JSON.parse(result.recordsets.at(-1)?.[0]?.ReceiptJson || 'null');
  assert.equal(receipt?.approvalReference, approval);
  assert.equal(receipt?.backupSetUuid?.toUpperCase(), uuid);
  assert.equal(receipt?.committed, true);
  console.log(JSON.stringify({ phase: 'DAY017A_COMMIT_ACK', requestId: receipt.requestId,
    oldWorkingDate: receipt.oldWorkingDate, newWorkingDate: receipt.newWorkingDate,
    actorId: receipt.actorId, backupSetUuid: uuid }));
} finally { await pool.close(); }
