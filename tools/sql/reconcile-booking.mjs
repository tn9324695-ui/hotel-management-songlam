// Read-only reconciliation of the explicitly labelled real SQL rehearsal.
import{readFile,writeFile}from'node:fs/promises';import{createRequire}from'node:module';import{createHash}from'node:crypto';import assert from'node:assert/strict';import{currentWindowsPrincipal}from'../../backend/src/adapters/sql/windows-provider.js';
if(process.argv.slice(2).join(' ')!=='--read-only')throw new Error('READ_ONLY_REQUIRED');if(currentWindowsPrincipal().toLowerCase()!=='desktop-9epi86k\\thang dz')throw new Error('READ_ONLY_OPERATOR_REQUIRED');
const dir=new URL('./private/booking012/',import.meta.url),ui=JSON.parse(await readFile(new URL('ui-progress.json',dir),'utf8')),integrity=JSON.parse(await readFile(new URL('integrity-progress.json',dir),'utf8')),timeout=JSON.parse(await readFile(new URL('timeout-progress.json',dir),'utf8')),deployment=JSON.parse(await readFile(new URL('deployment.json',dir),'utf8'));
const report={source:'REAL_SQL_READBACK_RECONCILIATION',batch:ui.batch,checks:[],inspectedAtUtc:new Date().toISOString(),moneyMeaning:'QUOTED_ACCOMMODATION_NOT_REVENUE_NOT_CASH'},check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sql=require('mssql/msnodesqlv8');
const p=new sql.ConnectionPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',driver:'ODBC Driver 17 for SQL Server',pool:{max:1,min:0},options:{trustedConnection:true,encrypt:true,trustServerCertificate:true},beforeConnect:c=>{c.conn_str+=';TrustServerCertificate=Yes;';}});p.on('error',()=>{});
try{await p.connect();const target=(await p.request().query(`SELECT DB_NAME() db,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) serverName,CONVERT(varchar(36),database_guid) guid FROM sys.database_recovery_status WHERE database_id=DB_ID();`)).recordset[0];check('EXACT_AUTHORIZED_TARGET',target.db==='SongLamPms_Design'&&target.serverName==='DESKTOP-9EPI86K\\SQLEXPRESS'&&target.guid.toUpperCase()==='C4DD399E-5661-4741-A424-5ABFEEFBC1AC');
const loser=[integrity.operations.concurrentA,integrity.operations.concurrentB].find(op=>!op.result?.bookingId);
const result=await p.request().input('batch',sql.NVarChar(160),ui.batch).input('customer',sql.BigInt,ui.customerId).input('failedGroup',sql.UniqueIdentifier,integrity.operations.rollback.requestId).input('loser',sql.UniqueIdentifier,loser.requestId).query(`
 SELECT CONVERT(varchar(20),b.BookingId) BookingId,b.Code,b.BookingKind,b.Status,CONVERT(varchar(20),b.CreatedBy) CreatedBy,b.Notes
 FROM pms.Booking b WHERE CHARINDEX(@batch,b.Notes)=1 ORDER BY b.BookingId;
 SELECT CONVERT(varchar(20),r.BookingRoomId) BookingRoomId,CONVERT(varchar(20),r.BookingId) BookingId,CONVERT(varchar(20),r.RoomTypeId) RoomTypeId,CONVERT(varchar(20),r.RatePlanId) RatePlanId,r.StayType,r.Status,
 CONVERT(char(10),r.ArrivalDate,23) ArrivalDate,CONVERT(char(10),r.DepartureDate,23) DepartureDate,CONVERT(varchar(30),r.QuotedTotalVnd) QuotedTotalVnd,r.RateSnapshotJson,
 CONVERT(varchar(18),CONVERT(binary(8),r.RowVer),1) RowVer
 FROM pms.BookingRoom r JOIN pms.Booking b ON b.BookingId=r.BookingId WHERE CHARINDEX(@batch,b.Notes)=1 ORDER BY r.BookingRoomId;
 SELECT CONVERT(varchar(20),n.BookingRoomId) BookingRoomId,CONVERT(char(10),n.NightDate,23) NightDate,CONVERT(varchar(30),n.PriceVnd) PriceVnd FROM pms.BookingNightRate n JOIN pms.BookingRoom r ON r.BookingRoomId=n.BookingRoomId JOIN pms.Booking b ON b.BookingId=r.BookingId WHERE CHARINDEX(@batch,b.Notes)=1 ORDER BY n.BookingRoomId,n.NightDate;
 SELECT CONVERT(varchar(20),a.AllocationId) AllocationId,CONVERT(varchar(20),a.BookingRoomId) BookingRoomId,CONVERT(varchar(20),a.RoomId) RoomId,CONVERT(varchar(20),a.CreatedBy) CreatedBy,a.IsCancelled,
 CONVERT(varchar(23),a.StartsAtUtc,126)+'Z' StartsAtUtc,CONVERT(varchar(23),a.EndsAtUtc,126)+'Z' EndsAtUtc FROM pms.RoomAllocation a JOIN pms.BookingRoom r ON r.BookingRoomId=a.BookingRoomId JOIN pms.Booking b ON b.BookingId=r.BookingId WHERE CHARINDEX(@batch,b.Notes)=1 ORDER BY a.AllocationId;
 SELECT CONVERT(varchar(36),a.RequestId) RequestId,CONVERT(varchar(20),a.ActorId) ActorId,a.Operation,a.Status,a.IdempotencyKey,JSON_VALUE(a.ResponseJson,'$.booking.id') BookingId,JSON_VALUE(a.ResponseJson,'$.customer.id') CustomerId,
 JSON_VALUE(a.ResponseJson,'$.committed') Committed,JSON_VALUE(a.ResponseJson,'$.atomic') AtomicFlag,JSON_QUERY(a.ResponseJson,'$.rooms') RoomsJson
 FROM pms.ApiRequest a WHERE (a.Operation='WEB_BOOKING_CREATE' AND JSON_VALUE(a.ResponseJson,'$.booking.id') IN(SELECT CONVERT(varchar(20),b.BookingId) FROM pms.Booking b WHERE CHARINDEX(@batch,b.Notes)=1)) OR (a.Operation='WEB_CUSTOMER_CREATE' AND JSON_VALUE(a.ResponseJson,'$.customer.id')=CONVERT(varchar(20),@customer));
 SELECT CONVERT(varchar(20),a.AuditLogId) AuditLogId,CONVERT(varchar(20),a.ActorId) ActorId,a.Action,a.EntityType,a.EntityKey,CONVERT(varchar(36),a.RequestId) RequestId,JSON_VALUE(a.AfterJson,'$.priceSnapshotSha256') SnapshotSha256
 FROM pms.AuditLog a WHERE a.RequestId IN(SELECT RequestId FROM pms.ApiRequest r WHERE (r.Operation='WEB_BOOKING_CREATE' AND JSON_VALUE(r.ResponseJson,'$.booking.id') IN(SELECT CONVERT(varchar(20),b.BookingId) FROM pms.Booking b WHERE CHARINDEX(@batch,b.Notes)=1)) OR (r.Operation='WEB_CUSTOMER_CREATE' AND JSON_VALUE(r.ResponseJson,'$.customer.id')=CONVERT(varchar(20),@customer))) ORDER BY a.AuditLogId;
 SELECT CONVERT(varchar(20),c.CustomerId) CustomerId,c.Code,CASE WHEN CHARINDEX('[SONGLAM_TEST:BOOKING012]',c.Notes)=1 AND c.FullName=@batch THEN 1 ELSE 0 END TestLabelMatches FROM pms.Customer c WHERE c.CustomerId=@customer;
 SELECT (SELECT COUNT(*) FROM pms.Room) RoomCount,(SELECT COUNT(*) FROM pms.Room WHERE Number IN('501','902','1303','1704','2105')) QuarantinedRoomsInserted,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM pms.Room ORDER BY RoomId FOR JSON PATH,INCLUDE_NULL_VALUES)),2) RoomSha256,
 (SELECT COUNT(*) FROM pms.CommandExecution) OpenCommandContexts,(SELECT COUNT(*) FROM pms.PrincipalBinding) PrincipalBindings,
 (SELECT COUNT(*) FROM pms.vRoomStatus WHERE StayStatus='OCCUPIED') CurrentOccupiedRooms,
 IS_SRVROLEMEMBER('sysadmin',N'DESKTOP-9EPI86K\\songlam_pms_test') ServiceSysadmin,IS_ROLEMEMBER('db_owner','pms_web_auth_test') ServiceDbOwner;
 SELECT (SELECT COUNT(*) FROM pms.Payment p JOIN pms.Booking b ON b.BookingId=p.BookingId WHERE CHARINDEX(@batch,b.Notes)=1) Payments,
 (SELECT COUNT(*) FROM pms.DepositAccount p JOIN pms.Booking b ON b.BookingId=p.BookingId WHERE CHARINDEX(@batch,b.Notes)=1) DepositAccounts,
 (SELECT COUNT(*) FROM pms.Folio p JOIN pms.Booking b ON b.BookingId=p.BookingId WHERE CHARINDEX(@batch,b.Notes)=1) Folios,
 (SELECT COUNT(*) FROM pms.Stay s JOIN pms.BookingRoom r ON r.BookingRoomId=s.BookingRoomId JOIN pms.Booking b ON b.BookingId=r.BookingId WHERE CHARINDEX(@batch,b.Notes)=1) Stays;
 SELECT CONVERT(varchar(20),g.BookingRoomId) BookingRoomId,CONVERT(varchar(20),g.CustomerId) CustomerId,g.IsLead FROM pms.BookingGuest g JOIN pms.BookingRoom r ON r.BookingRoomId=g.BookingRoomId JOIN pms.Booking b ON b.BookingId=r.BookingId WHERE CHARINDEX(@batch,b.Notes)=1;
 SELECT CONVERT(varchar(30),COUNT_BIG(*)) FailedGroupRows FROM pms.Booking WHERE Notes=@batch+'_ROLLBACK_EXPECTED';
 SELECT o.name,p.state_desc,p.permission_name FROM sys.database_permissions p JOIN sys.objects o ON o.object_id=p.major_id WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID('pms_web_auth_test') AND p.class=1;
 SELECT (SELECT COUNT(*) FROM pms.PolicyVersion WHERE Code='SL-OPERATIONS-2026-11' AND Version=1) PolicyVersions,(SELECT COUNT(*) FROM pms.RatePlan WHERE Code IN('SL-NIGHT-2026-V1','SL-HOUR6-2026-V1')) RatePlans,
 (SELECT COUNT(*) FROM pms.RateRule r JOIN pms.RatePlan p ON p.RatePlanId=r.RatePlanId WHERE p.Code IN('SL-NIGHT-2026-V1','SL-HOUR6-2026-V1')) RateRules;
 SELECT t.Code TypeCode,p.StayType,CONVERT(varchar(30),r.PriceVnd) PriceVnd,CONVERT(char(10),r.ValidFrom,23) ValidFrom,CONVERT(char(10),r.ValidTo,23) ValidTo,r.DayKind,v.Version
 FROM pms.RateRule r JOIN pms.RatePlan p ON p.RatePlanId=r.RatePlanId JOIN pms.RoomType t ON t.RoomTypeId=r.RoomTypeId JOIN pms.PolicyVersion v ON v.PolicyVersionId=p.PolicyVersionId WHERE p.Code IN('SL-NIGHT-2026-V1','SL-HOUR6-2026-V1') ORDER BY t.Code,p.StayType;
 SELECT COUNT(*) FailedRequestsRemaining FROM pms.ApiRequest WHERE RequestId IN(@failedGroup,@loser);
 `);
const [bookings,rooms,nights,allocations,receipts,audit,customers,foundation,finance,guests,failed,permissions,pricing,tariffs,failedRequests]=result.recordsets;
check('FIVE_LABELLED_BOOKINGS',bookings.length===5);check('SIX_ROOM_LINES_ATOMIC',rooms.length===6);check('TEN_NIGHTLY_RATE_ROWS',nights.length===10);check('SIX_ROOM_ALLOCATIONS',allocations.length===6);check('ONE_LABELLED_UI_CUSTOMER',customers.length===1&&customers[0].TestLabelMatches===1);
check('ROOM_REGISTER_UNCHANGED',foundation[0].RoomCount===420&&foundation[0].RoomSha256===deployment.roomSha256&&foundation[0].QuarantinedRoomsInserted===0);
check('NO_COMMAND_CONTEXT_OR_PRINCIPAL_LEAK',foundation[0].OpenCommandContexts===0&&foundation[0].PrincipalBindings===0);
check('FUTURE_BOOKINGS_DO_NOT_CREATE_OCCUPANCY',foundation[0].CurrentOccupiedRooms===0&&finance[0].Stays===0);
check('SERVICE_NOT_ADMIN',foundation[0].ServiceSysadmin===0&&foundation[0].ServiceDbOwner===0);
check('NO_CASH_DEPOSIT_OR_FOLIO_FABRICATION',finance[0].Payments===0&&finance[0].DepositAccounts===0&&finance[0].Folios===0);
check('NO_PARTIAL_FAILED_GROUP',failed[0].FailedGroupRows==='0');check('SIX_COMMITTED_RECEIPTS',receipts.length===6&&receipts.every(r=>r.Status==='SUCCEEDED'&&r.Committed==='true'));
const expected=new Map([[ui.bookingId,'4'],[timeout.bookingId,timeout.actorId]]);
for(const op of Object.values(integrity.operations))if(op.result?.bookingId)expected.set(op.result.bookingId,op===integrity.operations.concurrentB?'3':'4');
let baseTotal=0n,boundaryTotal=0n,total=0n;
for(const b of bookings){const receipt=receipts.find(r=>r.BookingId===b.BookingId),lines=rooms.filter(r=>r.BookingId===b.BookingId);check('RECEIPT_ACTOR_AND_BOOKING_'+b.BookingId,Boolean(receipt)&&receipt.ActorId===b.CreatedBy&&receipt.ActorId===expected.get(b.BookingId)&&receipt.AtomicFlag==='true');
 check('AUDIT_SAME_COMMIT_'+b.BookingId,audit.some(a=>a.RequestId.toLowerCase()===receipt.RequestId.toLowerCase()&&a.ActorId===b.CreatedBy&&a.EntityType==='Booking'&&a.EntityKey===b.BookingId));
 const linked=JSON.parse(receipt.RoomsJson);check('RECEIPT_LINE_LINKS_'+b.BookingId,linked.length===lines.length&&linked.every(x=>lines.some(r=>r.BookingRoomId===x.id&&r.Status===x.status&&r.RowVer===x.version)));
}
for(const r of rooms){const snapshot=JSON.parse(r.RateSnapshotJson),rates=nights.filter(n=>n.BookingRoomId===r.BookingRoomId),snapshotRates=snapshot.breakdown.filter(n=>n.kind==='NIGHT'),a=allocations.filter(a=>a.BookingRoomId===r.BookingRoomId),b=bookings.find(b=>b.BookingId===r.BookingId);
 check('EXACT_NIGHTLY_SNAPSHOT_'+r.BookingRoomId,rates.length===snapshotRates.length&&rates.every(n=>snapshotRates.some(x=>x.date===n.NightDate&&x.amountPerRoomVnd===n.PriceVnd)));
 check('FROZEN_VND_BASE_'+r.BookingRoomId,r.QuotedTotalVnd===snapshot.roomBaseVnd&&(r.StayType==='HOURLY'?rates.length===0:rates.reduce((s,n)=>s+BigInt(n.PriceVnd),0n).toString()===snapshot.roomBaseVnd));
 check('SOURCE_ROOM_GUEST_ACTOR_LINK_'+r.BookingRoomId,a.length===1&&!a[0].IsCancelled&&a[0].CreatedBy===b.CreatedBy&&guests.some(g=>g.BookingRoomId===r.BookingRoomId&&g.CustomerId===ui.customerId));
 const digest=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');check('AUDIT_SNAPSHOT_HASH_'+r.BookingRoomId,audit.some(x=>x.EntityType==='BookingRoom'&&x.EntityKey===r.BookingRoomId&&x.SnapshotSha256===digest));
 baseTotal+=BigInt(snapshot.roomBaseVnd);boundaryTotal+=BigInt(snapshot.boundarySurchargesVnd);total+=BigInt(snapshot.accommodationTotalVnd);
}
check('QUOTE_TOTAL_CONSERVATION',baseTotal+boundaryTotal===total&&baseTotal===67250000n&&boundaryTotal===4500000n&&total===71750000n);
check('BOTH_EMPLOYEES_AUDITED_BY_SESSION',audit.some(x=>x.ActorId==='3'&&x.Action==='WEB_BOOKING_CREATE')&&audit.some(x=>x.ActorId==='4'&&x.Action==='WEB_BOOKING_CREATE'));
check('NEW_OBJECT_EXECUTE_ONLY',permissions.filter(p=>p.state_desc==='GRANT').every(p=>p.permission_name==='EXECUTE')&&permissions.some(p=>p.name==='usp_ApplyCommand'&&p.state_desc==='DENY'));
check('OWN_VERSIONED_TARIFF_COUNTS',pricing[0].PolicyVersions===1&&pricing[0].RatePlans===2&&pricing[0].RateRules===20);
check('FAILED_BATCHES_LEAVE_NO_PROCESSING_RECEIPTS',failedRequests[0].FailedRequestsRemaining===0);
const proposed=JSON.parse(await readFile(new URL('../../docs/artifacts/pricing-data-proposed.json',import.meta.url),'utf8')).rates;
for(const expected of proposed)check('TARIFF_SQL_EQUALS_OWN_DECISION_'+expected.roomTypeCode,['NIGHTLY','HOURLY'].every(kind=>tariffs.some(t=>t.TypeCode===expected.roomTypeCode&&t.StayType===kind&&t.PriceVnd===(kind==='NIGHTLY'?expected.nightlyVnd:expected.hourlySixHourVnd)&&t.ValidFrom==='2026-11-01'&&t.ValidTo==='2028-01-01'&&t.DayKind==='BASE'&&t.Version===1)));
const unicode='{"fullName":"SONGLAM_TEST_Khách mô phỏng"}',digest=(await p.request().input('text',sql.NVarChar(sql.MAX),unicode).query("SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(max),@text COLLATE Latin1_General_100_BIN2_UTF8)),2)) Digest")).recordset[0].Digest;
check('UNICODE_CANONICAL_SHA256_MATCHES_NODE',digest===createHash('sha256').update(unicode,'utf8').digest('hex'));
const parity=[];for(const [start,end,extra]of[['05:59:59','12:00:00','1100000'],['06:00:00','12:00:00','550000'],['09:00:00','12:00:00','330000'],['12:00:00','12:00:00','330000'],['14:00:00','12:00:00','0'],['14:00:00','14:00:00','330000'],['14:00:00','15:00:00','550000'],['14:00:00','18:00:00','1100000']]){
 const row=(await p.request().input('type',sql.Int,Number(rooms[0].RoomTypeId)).input('plan',sql.Int,Number(rooms[0].RatePlanId)).input('start',sql.DateTimeOffset(3),new Date('2027-02-01T'+start+'+07:00')).input('end',sql.DateTimeOffset(3),new Date('2027-02-02T'+end+'+07:00'))
  .query('SELECT CONVERT(varchar(30),EarlyVnd+LateVnd) Surcharge,Valid FROM pms.fn_WebQuotedAmounts(@type,@plan,@start,@end)')).recordset[0];check('SQL_VALIDATOR_BOUNDARY_'+start+'_'+end,row.Valid===true&&row.Surcharge===extra);parity.push({start,end,surchargeVnd:row.Surcharge});}
report.status='PASS';report.target=target;report.counts={bookings:bookings.length,roomLines:rooms.length,nightRates:nights.length,allocations:allocations.length,guestLinks:guests.length,customers:customers.length,receipts:receipts.length,auditRows:audit.length};report.money={quotedBaseVnd:baseTotal.toString(),boundarySurchargesVnd:boundaryTotal.toString(),quotedAccommodationVnd:total.toString(),receivedVnd:'0',depositReceivedVnd:'0',recognizedRevenue:'NOT_RECOGNIZED_BY_BOOKING'};report.bookings=bookings.map(({Notes,...b})=>b);report.boundaryParity=parity;
}catch(e){report.status='FAIL';report.failure=String(e.message).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,'[REDACTED]').slice(0,160);report.sqlNumber=e.number??null;process.exitCode=1;}
finally{await p.close().catch(()=>{});await writeFile(new URL('reconciliation.json',dir),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,counts:report.counts,money:report.money,failure:report.failure}));}
