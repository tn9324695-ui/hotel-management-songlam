// Explicit maintenance deployment on the existing authorized test database only.
// Never imported by the web server. No customers/rooms/bookings seeded here.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { currentWindowsPrincipal } from '../../backend/src/adapters/sql/windows-provider.js';
const approval='USER-20261112-REAL-PRICING-CUSTOMER-BOOKING';
if(process.argv.slice(2).join(' ')!==`--apply --approval=${approval}`)throw new Error('EXPLICIT_BOOKING_DEPLOYMENT_APPROVAL_REQUIRED');
if(currentWindowsPrincipal().toLowerCase()!=='desktop-9epi86k\\thang dz')throw new Error('MAINTENANCE_OPERATOR_REQUIRED');
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sql=require('mssql/msnodesqlv8');
const folder=new URL('../../database/migrations/012-booking/',import.meta.url),evidence=new URL('./private/booking012/',import.meta.url);
const decision=JSON.parse(await readFile(new URL('../../deploy/booking-pricing-decision.json',import.meta.url),'utf8'));
const rates=JSON.parse(await readFile(new URL('../../docs/artifacts/pricing-data-proposed.json',import.meta.url),'utf8')).rates;
if(decision.approvalReference!==approval||decision.validFrom!=='2026-11-01'||rates.length!==10||rates.some(r=>r.validFrom!==decision.validFrom||r.validToExclusive!==decision.validToExclusive))throw new Error('PRICING_DECISION_MISMATCH');
const policy={schema:'songlam.policy.v1',moneyRounding:'HALF_UP',occupancy:'INCLUDED_UP_TO_MAX',effectiveBasis:'ARRIVAL_TIME',
 selection:{order:'DAY_KIND_THEN_PRIORITY',priority:'HIGHER_WINS',dayKindOrder:['SPECIFIC','HOLIDAY','WEEKEND','BASE'],fallback:'ALLOW_ELIGIBLE_RULES'},
 boundaryClock:'HOTEL_WALL_CLOCK',earlyArrival:[{fromMinutes:0,toMinutes:300,numerator:'30',denominator:'100'},{fromMinutes:300,toMinutes:480,numerator:'50',denominator:'100'},{fromMinutes:480,toMinutes:null,numerator:'100',denominator:'100'}],
 lateDeparture:[{fromMinutes:0,toMinutes:180,numerator:'30',denominator:'100'},{fromMinutes:180,toMinutes:360,numerator:'50',denominator:'100'},{fromMinutes:360,toMinutes:null,numerator:'100',denominator:'100'}],
 lateDepartureInterval:'LEFT_CLOSED_RIGHT_OPEN',hourlyRateBasis:'ARRIVAL_DATE',hourlyMaximumMinutes:360,
 earlyDeparture:{nightly:{unusedNights:'REMOVE',minimumChargeNights:1,earlyArrivalCharge:'KEEP',lateDepartureCharge:'RECALCULATE'},hourly:{unusedTime:'KEEP'}}};
const bookingPolicy={id:'SL-FRONTDESK-CONFIRM-V1',status:'CONFIRMED',depositIsPayment:false,source:'STAFF_FRONTDESK',atomic:true,receipt:'ACTOR_OPERATION_INTENT_SHA256'};
const hash=x=>createHash('sha256').update(x).digest('hex'),q=x=>x.replaceAll("'","''");
const names=(await readdir(folder)).filter(x=>/^0[1-5]-.*\.sql$/.test(x)).sort(),files=await Promise.all(names.map(async name=>({name,text:await readFile(new URL(name,folder),'utf8')})));
const packageSha256=hash(JSON.stringify({files,decision,rates,policy,bookingPolicy}));
const pool=new sql.ConnectionPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',driver:'ODBC Driver 17 for SQL Server',connectionTimeout:10000,requestTimeout:30000,pool:{min:0,max:1},
 options:{trustedConnection:true,encrypt:true,trustServerCertificate:true,useUTC:true},beforeConnect:c=>{c.conn_str+=';TrustServerCertificate=Yes;';}});
pool.on('error',()=>{});let transaction,committed=false;
await mkdir(evidence,{recursive:true});
try{
 await pool.connect();
 const target=(await pool.request().query(`SELECT DB_NAME() db,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) serverName,CONVERT(varchar(36),database_guid) guid,
 (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment') env,
 (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity') marker,
 CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath')) backupPath FROM sys.database_recovery_status WHERE database_id=DB_ID();`)).recordset[0];
 if(target.db!=='SongLamPms_Design'||target.serverName!=='DESKTOP-9EPI86K\\SQLEXPRESS'||target.guid?.toUpperCase()!=='C4DD399E-5661-4741-A424-5ABFEEFBC1AC'||target.env!=='test'||target.marker!=='eb18c6f2-373d-4a83-a34f-d9809f1cbc7a')throw new Error('DEPLOYMENT_TARGET_MISMATCH');
 const service=(await pool.request().query(`SELECT IS_SRVROLEMEMBER('sysadmin',N'DESKTOP-9EPI86K\\songlam_pms_test') sysadminMember,IS_ROLEMEMBER('db_owner','pms_web_auth_test') ownerMember,
 (SELECT COUNT(*) FROM pms.Room) rooms,(SELECT COUNT(*) FROM pms.RoomType) types,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM pms.Room ORDER BY RoomId FOR JSON PATH,INCLUDE_NULL_VALUES)),2) roomSha256,
 (SELECT CONVERT(nvarchar(max),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Booking012.Release') existingRelease;`)).recordset[0];
 if(service.sysadminMember!==0||service.ownerMember!==0||service.rooms!==420||service.types!==11)throw new Error('SERVICE_OR_FOUNDATION_SCOPE_MISMATCH');
 if(service.existingRelease){const old=JSON.parse(service.existingRelease);if(old.packageSha256!==packageSha256)throw new Error('EXISTING_DEPLOYMENT_HASH_CHANGED_REVIEW_UPGRADE');console.log(JSON.stringify({status:'ALREADY_DEPLOYED_NO_MUTATIONS',releaseId:old.releaseId}));process.exitCode=0;}
 else{
  const objects=files.flatMap(f=>[...f.text.matchAll(/CREATE\s+(?:FUNCTION|PROCEDURE)\s+pms\.([A-Za-z0-9_]+)/gi)].map(m=>m[1]));
  for(const name of objects){const row=(await pool.request().input('Name',sql.NVarChar(128),'pms.'+name).query('SELECT OBJECT_ID(@Name) objectId')).recordset[0];if(row.objectId!==null)throw new Error('NEW_CONTRACT_ALREADY_EXISTS');}
  if(!/^[A-Za-z]:\\/.test(target.backupPath||''))throw new Error('SQL_BACKUP_PATH_UNVERIFIED');
  const backupFile=target.backupPath.replace(/[\\/]$/,'')+'\\SongLamPms_Design_Booking012_'+Date.now()+'.bak';
  await pool.request().input('BackupFile',sql.NVarChar(4000),backupFile).query('BACKUP DATABASE [SongLamPms_Design] TO DISK=@BackupFile WITH COPY_ONLY,CHECKSUM; RESTORE VERIFYONLY FROM DISK=@BackupFile WITH CHECKSUM;');
  const backup=(await pool.request().input('BackupFile',sql.NVarChar(4000),backupFile).query(`SELECT TOP(1) CONVERT(varchar(36),b.backup_set_uuid) backupSetUuid,b.has_backup_checksums checksums,b.is_copy_only copyOnly,b.backup_finish_date finishedAt,m.physical_device_name backupFile
    FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily m ON m.media_set_id=b.media_set_id WHERE b.database_name=DB_NAME() AND m.physical_device_name=@BackupFile ORDER BY b.backup_set_id DESC;`)).recordset[0];
  if(!backup?.backupSetUuid||!backup.checksums||!backup.copyOnly)throw new Error('BACKUP_EVIDENCE_INVALID');
  await writeFile(new URL('backup-'+Date.now()+'.json',evidence),JSON.stringify({...backup,verifyOnlyPassed:true,restoreTested:false},null,2),{flag:'wx'});
  console.log(JSON.stringify({status:'FRESH_BACKUP_VERIFYONLY_PASSED',backupSetUuid:backup.backupSetUuid}));
  transaction=new sql.Transaction(pool);await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  const request=()=>new sql.Request(transaction);
  await request().batch('SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET XACT_ABORT ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;');
  for(const file of files){let source=file.text.replaceAll('__POLICY_JSON__',q(JSON.stringify(policy))).replaceAll('__RATES_JSON__',q(JSON.stringify(rates))).replaceAll('__BOOKING_POLICY_HASH__',hash(JSON.stringify(bookingPolicy))).replaceAll('__PACKAGE_HASH__',packageSha256).replaceAll('__BACKUP_UUID__',backup.backupSetUuid);
   for(const batch of source.split(/^GO\s*$/mi).filter(s=>s.trim()))await request().batch(batch);
  }
  const unchanged=(await request().query(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM pms.Room ORDER BY RoomId FOR JSON PATH,INCLUDE_NULL_VALUES)),2) roomSha256;`)).recordset[0];
  if(unchanged.roomSha256!==service.roomSha256)throw new Error('EXISTING_ROOM_DATA_CHANGED');
  await transaction.commit();committed=true;
  console.log(JSON.stringify({status:'BOOKING012_SQL_COMMITTED',pricePlans:2,priceRules:20,policyVersions:1,roomsInserted:0,customersSeeded:0,bookingsSeeded:0}));
 }
 const release=JSON.parse((await pool.request().query(`SELECT CONVERT(nvarchar(max),value) ReleaseJson FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Booking012.Release';`)).recordset[0].ReleaseJson);
 const definitions=(await pool.request().query(`SELECT o.name Name,CONVERT(varchar(64),HASHBYTES('SHA2_256',m.definition),2) DefinitionSha256,m.uses_ansi_nulls AnsiNullsOn,m.uses_quoted_identifier QuotedIdentifierOn
 FROM sys.objects o JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE o.schema_id=SCHEMA_ID('pms') AND o.name IN('usp_AppPricingContext','usp_AppReferenceRead','usp_AppBookingRead','usp_AppBookingPrepare','usp_AppBookingCommit','usp_AppCustomerCreate','usp_WebReceiptLookup','usp_WebBookingRuntime','usp_WebAuthorize','fn_WebPermission','fn_WebPricingContext','fn_WebQuotedAmounts','fn_WebInventoryUsage','fn_WebZeroDeposits','fn_WebBookingJson','usp_AssertBusinessState','usp_AssertInventory','tr_Booking_CommandOnly','tr_BookingRoom_CommandOnly','tr_BookingNightRate_CommandOnly','tr_RoomAllocation_CommandOnly','tr_AuditLog_CommandOnly') ORDER BY o.name;`)).recordset;
 if(definitions.some(d=>!d.AnsiNullsOn||!d.QuotedIdentifierOn))throw new Error('SQL_MODULE_SET_OPTIONS_NOT_VERIFIED');
 const receiptText=JSON.stringify({status:'SQL_COMMITTED_NOT_YET_APP_VERIFIED',approval,packageSha256,release,definitions,roomSha256:service.roomSha256},null,2);
 try{await writeFile(new URL('deployment.json',evidence),receiptText,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;await writeFile(new URL('deployment-readback-'+Date.now()+'.json',evidence),receiptText,{flag:'wx'});}
 await writeFile(new URL('policy.json',evidence),JSON.stringify(policy,null,2));
 console.log(JSON.stringify({status:'DEPLOYMENT_RECORDED',packageSha256,objects:definitions.length,phase:'SQL_ONLY_NOT_BROWSER_ACCEPTANCE'}));
}catch(error){if(transaction&&!committed)await transaction.rollback().catch(()=>{});const info=error.originalError?.info||error;
 console.error(JSON.stringify({status:committed?'SQL_COMMITTED_POSTCHECK_FAILED':'DEPLOYMENT_FAILED_NO_SUCCESS_CLAIM',code:/^[A-Z_]+$/.test(error.message)?error.message:'SQL_DEPLOYMENT_ERROR',sqlNumber:info.number||error.number||null,line:info.lineNumber||error.lineNumber||null,
  message:typeof info.message==='string'?info.message.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,'[REDACTED]').slice(0,240):undefined}));process.exitCode=1;
}finally{await pool.close().catch(()=>{});}
