// Read-only operator audit of the approved test database. Prints counts and
// contract metadata only; no customer fields, secrets, session IDs or SQL text.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({
  server: '.\\SQLEXPRESS', database: 'SongLamPms_Design', driver: 'ODBC Driver 17 for SQL Server',
  options: { trustedConnection: true, encrypt: true, trustServerCertificate: true },
  beforeConnect: connection => { connection.conn_str += ';TrustServerCertificate=Yes;'; }
});
try {
  await pool.connect();
  const identity = await pool.request().query(`
    SELECT DB_NAME() DatabaseName, CONVERT(varchar(36), d.database_guid) DatabaseGuid,
      CONVERT(nvarchar(128), ep.value) EnvironmentMarker
    FROM sys.database_recovery_status d
    LEFT JOIN sys.extended_properties ep ON ep.class=0 AND ep.name=N'SongLam.Environment'
    WHERE d.database_id=DB_ID();`);
  const db = identity.recordset[0];
  assert.equal(db.DatabaseName, 'SongLamPms_Design');
  assert.equal(String(db.DatabaseGuid).toUpperCase(), 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC');
  assert.equal(db.EnvironmentMarker, 'test');
  const result = await pool.request().query(`
    SELECT t.name TableName, SUM(CASE WHEN p.index_id IN (0,1) THEN p.row_count ELSE 0 END) AS RowsTotal
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.dm_db_partition_stats p ON p.object_id=t.object_id
    WHERE s.name='pms' GROUP BY t.name ORDER BY t.name;
    SELECT fk.name Name, OBJECT_NAME(fk.parent_object_id) TableName,
      fk.is_disabled Disabled, fk.is_not_trusted Untrusted
    FROM sys.foreign_keys fk JOIN sys.schemas s ON s.name=OBJECT_SCHEMA_NAME(fk.parent_object_id)
    WHERE s.name='pms' AND (fk.is_disabled=1 OR fk.is_not_trusted=1);
    SELECT name ProcedureName FROM sys.procedures
    WHERE schema_id=SCHEMA_ID('pms') AND (name LIKE 'usp_App%' OR name LIKE 'usp_Web%') ORDER BY name;
    SELECT o.name ObjectName, p.state_desc State, p.permission_name Permission
    FROM sys.database_permissions p JOIN sys.objects o ON o.object_id=p.major_id
    WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID('pms_web_auth_test')
      AND o.schema_id=SCHEMA_ID('pms') AND p.permission_name='EXECUTE'
    ORDER BY o.name;
    SELECT CONVERT(char(10),h.WorkingDate,23) WorkingDate, d.Status BusinessDayStatus,
      CONVERT(char(10),SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE h.TimeZoneId,23) ActualHotelDate
    FROM pms.HotelSettings h LEFT JOIN pms.BusinessDay d ON d.BusinessDate=h.WorkingDate WHERE h.HotelId=1;
    SELECT name ConstraintName, OBJECT_NAME(parent_object_id) TableName
    FROM sys.check_constraints WHERE (is_disabled=1 OR is_not_trusted=1) AND SCHEMA_NAME(schema_id)='pms';
    SELECT name TriggerName, OBJECT_NAME(parent_id) TableName
    FROM sys.triggers WHERE is_disabled=1 AND parent_class=1 AND OBJECT_SCHEMA_NAME(parent_id)='pms';
    SELECT Status,COUNT(*) Total FROM pms.Booking GROUP BY Status;
    SELECT Status,COUNT(*) Total FROM pms.BookingRoom GROUP BY Status;
    SELECT CleanStatus,IsActive,COUNT(*) Total FROM pms.Room
    GROUP BY CleanStatus,IsActive;`);
  const counts = Object.fromEntries(result.recordsets[0].map(row => [row.TableName, Number(row.RowsTotal)]));
  const report = { source: 'REAL_SQL_READ_ONLY', target: db, checkedAtUtc: new Date().toISOString(),
    clock: result.recordsets[4][0], tableCounts: counts, invalidForeignKeys: result.recordsets[1],
    procedures: result.recordsets[2].map(row => row.ProcedureName),
    serviceExecute: result.recordsets[3], invalidChecks: result.recordsets[5], disabledTriggers: result.recordsets[6],
    bookingStatuses: result.recordsets[7], bookingRoomStatuses: result.recordsets[8], roomStates: result.recordsets[9] };
  console.log(JSON.stringify(report));
} finally { await pool.close(); }
