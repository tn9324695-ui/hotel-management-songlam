// Metadata inspection only, under the maintenance operator, never an app pool.
// No migrations, markers, seed, transactions, fixture writes or ALTER rights.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { currentWindowsPrincipal } from '../../backend/src/adapters/sql/windows-provider.js';
if (process.argv.slice(2).join(' ') !== '--read-only') throw new Error('EXPLICIT_READ_ONLY_REQUIRED');
if (currentWindowsPrincipal().toLowerCase() !== 'desktop-9epi86k\\thang dz') throw new Error('READ_ONLY_OPERATOR_REQUIRED');
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({ server: '.\\SQLEXPRESS', database: 'SongLamPms_Design', driver: 'ODBC Driver 17 for SQL Server',
  connectionTimeout: 10000, requestTimeout: 10000, pool: { min: 0, max: 1 },
  options: { trustedConnection: true, encrypt: true, trustServerCertificate: true, useUTC: true },
  beforeConnect: connection => { connection.conn_str += ';TrustServerCertificate=Yes;'; } });
pool.on('error', () => {});
try {
  await pool.connect();
  const identity = (await pool.request().query(`SELECT DB_NAME() AS databaseName, CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS serverName,
    CONVERT(varchar(36),database_guid) AS databaseGuid,
    (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment') AS environment,
    (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity') AS testIdentity
    FROM sys.database_recovery_status WHERE database_id=DB_ID()`)).recordset[0];
  if (identity?.databaseName !== 'SongLamPms_Design' || identity.serverName !== 'DESKTOP-9EPI86K\\SQLEXPRESS'
    || identity.databaseGuid?.toUpperCase() !== 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC' || identity.environment !== 'test'
    || identity.testIdentity !== 'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a') throw new Error('READ_ONLY_TARGET_MISMATCH');
  const entities = ['RoomType', 'Room', 'HotelSettings', 'BusinessDay', 'Customer', 'PolicyVersion', 'RatePlan', 'RateRule', 'Booking', 'BookingRoom', 'BookingNightRate', 'BookingGuest', 'RoomAllocation', 'Stay', 'PrincipalBinding'];
  const counts = {};
  for (const name of entities) {
    // Names are constants above; never accept identifiers from CLI/source data.
    const result = await pool.request().query(`IF OBJECT_ID(N'pms.${name}',N'U') IS NOT NULL SELECT CONVERT(varchar(30),COUNT_BIG(*)) AS total FROM pms.[${name}];`);
    counts[name] = result.recordset?.[0]?.total ?? null;
  }
  const objects = (await pool.request().query(`SELECT o.name, o.type_desc, CONVERT(varchar(64),HASHBYTES('SHA2_256',m.definition),2) AS definitionSha256,
    m.uses_ansi_nulls AS ansiNullsOn, m.uses_quoted_identifier AS quotedIdentifierOn
    FROM sys.objects o LEFT JOIN sys.sql_modules m ON m.object_id=o.object_id
    WHERE o.schema_id=SCHEMA_ID(N'pms') AND (o.name IN(N'usp_AppPricingContext',N'usp_AppBookingRead',N'usp_AppBookingPrepare',N'usp_AppBookingCommit',N'usp_ApplyCommand',N'usp_LockInventory',N'usp_AssertInventory',N'usp_AssertBusinessState')
      OR o.name LIKE N'tr[_]%[_]CommandOnly') ORDER BY o.name`)).recordset;
  const permissions = (await pool.request().query(`SELECT USER_NAME(dp.grantee_principal_id) AS principalName, dp.state_desc, dp.permission_name, OBJECT_SCHEMA_NAME(dp.major_id) AS schemaName, OBJECT_NAME(dp.major_id) AS objectName
    FROM sys.database_permissions dp WHERE dp.class=1 AND dp.grantee_principal_id IN(
      SELECT principal_id FROM sys.database_principals WHERE name=N'pms_web_auth_test' UNION
      SELECT role_principal_id FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(N'pms_web_auth_test')) ORDER BY principalName,objectName`)).recordset;
  const report = { kind: 'READ_ONLY_METADATA_NOT_BUSINESS_INTEGRATION', inspectedAtUtc: new Date().toISOString(), identity, counts, objects, permissions,
    applicationRpcNamesAreProposed: true, writesPerformed: false, transactionsTested: false };
  const directory = new URL('./private/pricing-booking-code-20261112/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('sql-readonly-' + Date.now() + '.json', directory), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const proposed = ['usp_AppPricingContext', 'usp_AppBookingRead', 'usp_AppBookingPrepare', 'usp_AppBookingCommit'];
  console.log(JSON.stringify({ status: 'READ_ONLY_PREFLIGHT_RECORDED', counts, proposedRpcPresent: objects.filter(row => proposed.includes(row.name)).map(row => row.name), writesPerformed: false }));
} catch (error) {
  console.error(JSON.stringify({ status: 'READ_ONLY_PREFLIGHT_FAILED', code: /^[A-Z_]+$/.test(error.message) ? error.message : 'SQL_INSPECTION_FAILED', sqlNumber: Number.isSafeInteger(error.number) ? error.number : null }));
  process.exitCode = 1;
} finally { await pool.close().catch(() => {}); }
