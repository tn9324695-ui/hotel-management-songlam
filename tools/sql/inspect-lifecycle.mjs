// Metadata/counts only. Never exports customers, credentials or session data.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { currentWindowsPrincipal } from '../../backend/src/adapters/sql/windows-provider.js';
if (process.argv.slice(2).join(' ') !== '--read-only') throw new Error('READ_ONLY_REQUIRED');
if (currentWindowsPrincipal().toLowerCase() !== 'desktop-9epi86k\\thang dz') throw new Error('METADATA_OPERATOR_REQUIRED');
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({ server: '.\\SQLEXPRESS', database: 'SongLamPms_Design', driver: 'ODBC Driver 17 for SQL Server',
  pool: { min: 0, max: 1 }, options: { trustedConnection: true, encrypt: true, trustServerCertificate: true },
  beforeConnect: config => { config.conn_str += ';TrustServerCertificate=Yes;'; } });
pool.on('error', () => {});
try {
  await pool.connect();
  const identity = (await pool.request().query(`SELECT DB_NAME() db,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) serverName,
    CONVERT(varchar(36),database_guid) guid FROM sys.database_recovery_status WHERE database_id=DB_ID()`)).recordset[0];
  if (identity.db !== 'SongLamPms_Design' || identity.serverName !== 'DESKTOP-9EPI86K\\SQLEXPRESS' || identity.guid.toUpperCase() !== 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC') throw new Error('TARGET_MISMATCH');
  const result = await pool.request().query(`
    SELECT o.name entity,c.name field,t.name type,c.max_length bytes,c.is_nullable nullable
      FROM sys.objects o JOIN sys.columns c ON c.object_id=o.object_id JOIN sys.types t ON t.user_type_id=c.user_type_id
      WHERE SCHEMA_NAME(o.schema_id)='pms' AND o.name IN('Booking','BookingRoom','RoomAllocation','Stay','StayGuest','StayRoomSegment','Folio','FolioEntry','DepositAccount','DepositMovement','Payment','RefundRequest','CashierShift','StaySettlement','HousekeepingTask','MinibarAudit') ORDER BY o.name,c.column_id;
    SELECT o.name name,CONVERT(varchar(64),HASHBYTES('SHA2_256',m.definition),2) definitionSha256
      FROM sys.objects o JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE SCHEMA_NAME(o.schema_id)='pms' AND o.name LIKE '%AppBooking%' ORDER BY o.name;
    SELECT (SELECT COUNT(*) FROM pms.Booking) bookings,(SELECT COUNT(*) FROM pms.Stay) stays,
      (SELECT COUNT(*) FROM pms.Folio) folios,(SELECT COUNT(*) FROM pms.Payment) payments,
      (SELECT COUNT(*) FROM pms.DepositAccount) deposits,(SELECT COUNT(*) FROM pms.RefundRequest) refunds,
      (SELECT COUNT(*) FROM pms.CashierShift) shifts,(SELECT COUNT(*) FROM pms.MinibarAudit) minibarAudits;
    SELECT ar.Code roleCode,p.Code permissionCode FROM pms.AppRole ar JOIN pms.RolePermission rp ON rp.RoleId=ar.RoleId JOIN pms.Permission p ON p.PermissionId=rp.PermissionId ORDER BY ar.Code,p.Code;
    SELECT o.name,CONVERT(varchar(64),HASHBYTES('SHA2_256',m.definition),2) definitionSha256
      FROM sys.objects o JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE SCHEMA_NAME(o.schema_id)='pms' AND o.type='TR' ORDER BY o.name;
  `);
  const report = { source: 'REAL_SQL_READ_ONLY_METADATA', inspectedAtUtc: new Date().toISOString(), identity,
    columns: result.recordsets[0], bookingModules: result.recordsets[1], counts: result.recordsets[2][0],
    rolePermissions: result.recordsets[3], triggers: result.recordsets[4] };
  const dir = new URL('./private/lifecycle/', import.meta.url); await mkdir(dir, { recursive: true });
  await writeFile(new URL('metadata.json', dir), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: 'READ_ONLY_INSPECTED', counts: report.counts, columns: report.columns.length, triggers: report.triggers.length }));
} catch (error) {
  console.error(JSON.stringify({ status: 'READ_ONLY_INSPECTION_FAILED', code: /^[A-Z_]+$/.test(error.message) ? error.message : 'SQL_METADATA_ERROR', number: error.number ?? null }));
  process.exitCode = 1;
} finally { await pool.close().catch(() => {}); }
