// Read-only preflight for a future, separately approved test-day alignment.
// This does not stop writers, back up, or change the SQL Server database.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({ server: '.\\SQLEXPRESS', database: 'SongLamPms_Design',
  driver: 'ODBC Driver 17 for SQL Server',
  options: { trustedConnection: true, encrypt: true, trustServerCertificate: true },
  beforeConnect: connection => { connection.conn_str += ';TrustServerCertificate=Yes;'; } });
try {
  await pool.connect();
  const result = await pool.request().query(`
    SELECT DB_NAME() DatabaseName,CONVERT(varchar(36),d.database_guid) DatabaseGuid,
      CONVERT(nvarchar(128),e.value) EnvironmentMarker
    FROM sys.database_recovery_status d
    LEFT JOIN sys.extended_properties e ON e.class=0 AND e.name=N'SongLam.Environment'
    WHERE d.database_id=DB_ID();
    SELECT CONVERT(char(10),h.WorkingDate,23) WorkingDate,d.Status,
      CONVERT(char(10),SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE h.TimeZoneId,23) HotelToday,
      h.TimeZoneId,h.Currency,CONVERT(varchar(18),CONVERT(binary(8),h.RowVer),1) SettingsVersion,
      CONVERT(varchar(18),CONVERT(binary(8),d.RowVer),1) DayVersion
    FROM pms.HotelSettings h JOIN pms.BusinessDay d ON d.BusinessDate=h.WorkingDate WHERE h.HotelId=1;
    SELECT CONVERT(char(10),BusinessDate,23) BusinessDate,Status,
      COALESCE(CONVERT(varchar(40),CollectedVnd),'NULL') CollectedVnd,
      COALESCE(CONVERT(varchar(40),RefundedVnd),'NULL') RefundedVnd,
      COALESCE(CONVERT(varchar(40),SettledRevenueVnd),'NULL') SettledRevenueVnd,
      COALESCE(CONVERT(varchar(40),OutstandingVnd),'NULL') OutstandingVnd
    FROM pms.BusinessDay ORDER BY BusinessDate;
    SELECT (SELECT COUNT_BIG(*) FROM pms.Stay) Stays,
      (SELECT COUNT_BIG(*) FROM pms.StaySettlement) Settlements,
      (SELECT COUNT_BIG(*) FROM pms.Folio) Folios,
      (SELECT COUNT_BIG(*) FROM pms.FolioEntry) FolioEntries,
      (SELECT COUNT_BIG(*) FROM pms.DepositAccount) DepositAccounts,
      (SELECT COUNT_BIG(*) FROM pms.DepositMovement) DepositMovements,
      (SELECT COUNT_BIG(*) FROM pms.Payment) Payments,
      (SELECT COUNT_BIG(*) FROM pms.RefundRequest) Refunds,
      (SELECT COUNT_BIG(*) FROM pms.CashierShift) Shifts,
      (SELECT COUNT_BIG(*) FROM pms.Invoice) Invoices,
      (SELECT COUNT_BIG(*) FROM pms.ServiceOrder) ServiceOrders,
      (SELECT COUNT_BIG(*) FROM pms.MinibarAudit) MinibarAudits;
    SELECT COALESCE(SUM(CollectedVnd),0) CollectedVnd,
      COALESCE(SUM(RefundedVnd),0) RefundedVnd FROM pms.vCashFlowDaily;
    SELECT COALESCE(SUM(SettledRevenueVnd),0) SettledRevenueVnd FROM pms.vSettledRevenueDaily;
    SELECT COALESCE(SUM(CASE WHEN BalanceVnd>0 THEN BalanceVnd ELSE 0 END),0) OutstandingVnd FROM pms.vFolioBalance;
    SELECT MIN(ArrivalDate) EarliestArrival,MAX(DepartureDate) LatestDeparture,
      SUM(CASE WHEN Status IN('HELD','CONFIRMED') THEN 1 ELSE 0 END) HeldOrConfirmed
    FROM pms.BookingRoom;
    SELECT UserId FROM pms.AppUser u WHERE u.UserId=2 AND u.IsActive=1 AND EXISTS(
      SELECT 1 FROM pms.UserRole ur JOIN pms.AppRole ar ON ar.RoleId=ur.RoleId
      JOIN pms.RolePermission rp ON rp.RoleId=ar.RoleId JOIN pms.Permission p ON p.PermissionId=rp.PermissionId
      WHERE ur.UserId=u.UserId AND ar.IsActive=1 AND p.Code='systemConfig');
    SELECT (SELECT COUNT(*) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Day017.Release') ReleaseProperties,
      (SELECT COUNT(*) FROM pms.ApiRequest WHERE Operation='TEST_DAY_ALIGNMENT' AND IdempotencyKey='DAY017-20261114') DayRequests,
      (SELECT COUNT(*) FROM pms.AuditLog WHERE Action='TEST_DAY_ALIGNMENT') DayAuditRows;`);
  const sets = result.recordsets, target = sets[0][0], clock = sets[1][0], counts = sets[3][0];
  assert.equal(target.DatabaseName, 'SongLamPms_Design');
  assert.equal(String(target.DatabaseGuid).toUpperCase(), 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC');
  assert.equal(target.EnvironmentMarker, 'test');
  const noOperationalRows = Object.values(counts).every(value => Number(value) === 0);
  const totals = { cash: sets[4][0], revenue: sets[5][0], outstanding: sets[6][0] };
  const totalsZero = Object.values(totals).every(row => Object.values(row).every(value => Number(value) === 0));
  const report = { source: 'REAL_SQL_READ_ONLY_DAY_PREFLIGHT', target, checkedAtUtc: new Date().toISOString(),
    clock, days: sets[2], counts, totals, bookings: sets[7][0],
    maintenanceActor2HasSystemConfig: sets[8].length === 1, receiptState: sets[9][0],
    eligibleForSeparateReview: noOperationalRows && totalsZero && sets[2].length === 1 &&
      sets[2][0].Status === 'OPEN' && clock?.WorkingDate === '2026-10-11' &&
      clock?.HotelToday !== clock?.WorkingDate && sets[8].length === 1,
    writersStoppedConfirmed: false, backupVerified: false, sqlChangeApproved: false };
  console.log(JSON.stringify(report));
} finally { await pool.close(); }
