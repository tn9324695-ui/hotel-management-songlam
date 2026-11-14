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
    SELECT CONVERT(char(10),BusinessDate,23) BusinessDate,Status,CollectedVnd,RefundedVnd,
      SettledRevenueVnd,OutstandingVnd,SnapshotJson FROM pms.BusinessDay ORDER BY BusinessDate;
    SELECT CONVERT(char(10),WorkingDate,23) WorkingDate FROM pms.HotelSettings WHERE HotelId=1;
    SELECT CONVERT(varchar(36),RequestId) RequestId,ActorId,Status,ResponseJson FROM pms.ApiRequest
      WHERE Operation='TEST_DAY_ALIGNMENT' AND IdempotencyKey='DAY017-20261114';
    SELECT CONVERT(varchar(36),RequestId) RequestId,ActorId,EntityType FROM pms.AuditLog
      WHERE Action='TEST_DAY_ALIGNMENT' ORDER BY AuditLogId;
    SELECT CONVERT(nvarchar(3750),value) ReceiptJson FROM sys.extended_properties
      WHERE class=0 AND name=N'SongLam.Day017.Release';
    SELECT (SELECT COUNT(*) FROM pms.CommandExecution) InFlight,
      (SELECT COUNT(*) FROM pms.Booking) Bookings,(SELECT COUNT(*) FROM pms.BookingRoom) BookingRooms,
      (SELECT COUNT(*) FROM pms.Room) Rooms,(SELECT COUNT(*) FROM pms.Stay) Stays,
      (SELECT COUNT(*) FROM pms.Folio) Folios,(SELECT COUNT(*) FROM pms.Payment) Payments,
      (SELECT COUNT(*) FROM pms.DepositAccount) Deposits,(SELECT COUNT(*) FROM pms.CashierShift) Shifts;
    BEGIN TRANSACTION;
    DECLARE @lock int;
    EXEC @lock=sys.sp_getapplock @Resource=N'SongLam:Inventory',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
    IF @lock<0 THROW 51002,'Inventory lock unavailable.',1;
    EXEC pms.usp_AssertBusinessState;
    ROLLBACK TRANSACTION;`);
  const [days,settings,requests,audit,properties,counts] = result.recordsets;
  assert.equal(days.length,2);
  assert.deepEqual(days.map(d=>[d.BusinessDate,d.Status]),[['2026-10-11','CLOSED'],['2026-11-14','OPEN']]);
  for(const value of ['CollectedVnd','RefundedVnd','SettledRevenueVnd','OutstandingVnd']) assert.equal(Number(days[0][value]),0);
  const snapshot=JSON.parse(days[0].SnapshotJson);
  assert.equal(snapshot.skippedCalendarDates,'2026-10-12..2026-11-13');
  assert.equal(settings[0].WorkingDate,'2026-11-14');
  assert.equal(requests.length,1);assert.equal(requests[0].Status,'SUCCEEDED');assert.equal(String(requests[0].ActorId),'2');
  assert.equal(audit.length,2);assert.ok(audit.every(row=>row.RequestId===requests[0].RequestId&&String(row.ActorId)==='2'));
  assert.deepEqual(audit.map(row=>row.EntityType).sort(),['BusinessDay','HotelSettings']);
  assert.equal(properties.length,1);
  const receipt=JSON.parse(properties[0].ReceiptJson);
  assert.deepEqual(receipt,JSON.parse(requests[0].ResponseJson));
  assert.equal(receipt.approvalReference,'USER-20261114-DAY017A');
  assert.equal(receipt.backupSetUuid,'D1E9B4E7-0F29-4A3A-B8A6-91B8FD099C1B');
  assert.deepEqual(counts[0],{InFlight:0,Bookings:7,BookingRooms:10,Rooms:420,Stays:0,Folios:0,Payments:0,Deposits:0,Shifts:0});
  console.log(JSON.stringify({status:'PASS',source:'REAL_SQL_DAY017_READBACK',requestId:receipt.requestId,
    backupSetUuid:receipt.backupSetUuid,days:days.map(row=>[row.BusinessDate,row.Status]),
    auditRows:2,receiptMatches:true,businessStateValidated:true,counts:counts[0]}));
} finally { await pool.close(); }
