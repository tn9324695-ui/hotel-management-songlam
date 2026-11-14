// Read-only evidence for the labelled G6 test transaction.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),dir=new URL('tools/sql/private/lifecycle/',root);
const state=JSON.parse(await readFile(new URL('checkin-live.json',dir),'utf8'));
assert.match(state.batch,/^SONGLAM_TEST_G6_/);assert.ok(state.bookingId&&state.checkIn?.result?.stays?.length===1);
const require=createRequire(new URL('backend/package.json',root)),sql=require('mssql/msnodesqlv8');
const pool=new sql.ConnectionPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',driver:'ODBC Driver 17 for SQL Server',options:{trustedConnection:true,encrypt:true,trustServerCertificate:true},beforeConnect:c=>{c.conn_str+=';TrustServerCertificate=Yes;';}});
try{await pool.connect();const request=pool.request();request.input('bid',sql.BigInt,state.bookingId);request.input('rid',sql.UniqueIdentifier,state.checkIn.requestId);
 const data=await request.query(`SELECT DB_NAME() DbName,CONVERT(varchar(36),DATABASEPROPERTYEX(DB_NAME(),'ServiceBrokerGuid')) DbGuid;
 SELECT b.BookingId,b.Status BookingStatus,br.BookingRoomId,br.Status RoomStatus,s.StayId,s.Status StayStatus,s.CheckedInBy,s.CheckedInAtUtc,
  (SELECT COUNT(*) FROM pms.StayRoomSegment x WHERE x.StayId=s.StayId AND x.DepartedAtUtc IS NULL) CurrentSegments,
  (SELECT COUNT(*) FROM pms.StayGuest x WHERE x.StayId=s.StayId AND x.IsLead=1) LeadGuests,
  (SELECT COUNT(*) FROM pms.Folio f WHERE f.BookingRoomId=br.BookingRoomId AND f.Kind='ROOM' AND f.Status='OPEN') RoomFolios,
  (SELECT COUNT(*) FROM pms.FolioEntry e JOIN pms.Folio f ON f.FolioId=e.FolioId WHERE f.BookingRoomId=br.BookingRoomId AND e.StayId=s.StayId AND e.Kind='CHARGE' AND e.Category='ROOM') RoomCharges
 FROM pms.Booking b JOIN pms.BookingRoom br ON br.BookingId=b.BookingId LEFT JOIN pms.Stay s ON s.BookingRoomId=br.BookingRoomId WHERE b.BookingId=@bid;
 SELECT RequestId,ActorId,Operation,Status FROM pms.ApiRequest WHERE RequestId=@rid;
 SELECT COUNT(*) AuditCount,MIN(ActorId) MinActor,MAX(ActorId) MaxActor FROM pms.AuditLog WHERE RequestId=@rid;
 SELECT (SELECT COUNT(*) FROM pms.Payment WHERE BookingId=@bid) Payments,(SELECT COUNT(*) FROM pms.DepositAccount WHERE BookingId=@bid) Deposits;
 SELECT v.StayStatus,v.CleanStatus,v.ExploitationStatus FROM pms.vRoomStatus v JOIN pms.StayRoomSegment s ON s.RoomId=v.RoomId AND s.DepartedAtUtc IS NULL JOIN pms.Stay st ON st.StayId=s.StayId JOIN pms.BookingRoom br ON br.BookingRoomId=st.BookingRoomId WHERE br.BookingId=@bid;`);
 const rows=data.recordsets[1],receipt=data.recordsets[2],audit=data.recordsets[3][0],cash=data.recordsets[4][0];
 assert.equal(data.recordsets[0][0].DbName,'SongLamPms_Design');assert.equal(rows.length,1);const row=rows[0];
 assert.equal(String(row.StayId),state.checkIn.result.stays[0].id);assert.equal(row.StayStatus,'IN_HOUSE');assert.equal(row.RoomStatus,'IN_HOUSE');
 assert.equal(row.BookingStatus,'CHECKED_IN');assert.equal(row.CurrentSegments,1);assert.equal(row.LeadGuests,1);assert.equal(row.RoomFolios,1);assert.equal(row.RoomCharges,1);
 assert.equal(receipt.length,1);assert.equal(receipt[0].Status,'SUCCEEDED');assert.equal(Number(receipt[0].ActorId),Number(row.CheckedInBy));
 assert.ok(audit.AuditCount>=1);assert.equal(Number(audit.MinActor),Number(row.CheckedInBy));assert.equal(Number(audit.MaxActor),Number(row.CheckedInBy));
 assert.equal(cash.Payments,0);assert.equal(cash.Deposits,0);
 assert.equal(data.recordsets[5].length,1);assert.equal(data.recordsets[5][0].StayStatus,'OCCUPIED');
 const report={status:'PASS',source:'REAL_SQL_CHECKIN_016_READBACK',bookingId:state.bookingId,stayId:String(row.StayId),roomFolios:row.RoomFolios,roomCharges:row.RoomCharges,
  currentSegments:row.CurrentSegments,leadGuests:row.LeadGuests,auditCount:audit.AuditCount,occupancy:data.recordsets[5][0].StayStatus,payments:cash.Payments,deposits:cash.Deposits,requestId:state.checkIn.requestId};
 await writeFile(new URL('checkin-live-sql-reconciliation.json',dir),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await pool.close();}
