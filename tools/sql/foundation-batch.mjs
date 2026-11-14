// Internal CLI. Prepare is local-only; import requires separate explicit SQL approval.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,isAbsolute,join} from 'node:path';
import {loadWindowsSqlProvider} from '../../backend/src/adapters/sql/windows-provider.js';
import {analyzeFoundation} from '../migration/foundation-plan.mjs';
const root=new URL('../../',import.meta.url),sourceHash='2e1e523b3c0463e07a744a78b68fe9ec1c7d3dc05bacb7bb974b95f19daade5d';
const hash=text=>createHash('sha256').update(text,'utf16le').digest('hex').toUpperCase();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
export function buildFoundationPayload(candidate,review,decisions){
 const approval=decisions.completedWorkbook;
 if(!approval?.useAsProjectDataApproved||approval.sourceSha256!==sourceHash||review.sourceSha256!==sourceHash
  ||approval.roomImportCountApproved!==420||decisions.workingDate!=='2026-10-11')fail('FOUNDATION_DATA_SCOPE_NOT_APPROVED');
 const quarantine=approval.quarantineMaintenanceRoomsApproved;
 if(!Array.isArray(quarantine)||quarantine.length!==5||new Set(quarantine).size!==5||review.maintenance.some(r=>!quarantine.includes(r.number)))fail('FOUNDATION_QUARANTINE_MISMATCH');
 const data=structuredClone(candidate);data.roomTypes=data.roomTypes.map(r=>({...r,active:r.code!=='DLX-TR'}));
 data.rooms=data.rooms.filter(r=>!quarantine.includes(r.number));data.services=data.services.map(s=>({...s,active:true}));
 data.businessDay={date:'2026-10-11',status:'OPEN'};data.reviewedByOperator=true;
 // These are proposed initialization values in the review package. No import or
 // SQL approval is implied by preparing this exact, checksummed projection.
 const check=analyzeFoundation(data);if(check.status!=='SOURCE_VALIDATED_NOT_IMPORTED'||data.rooms.length!==420||data.roomTypes.length!==11||data.services.length!==15)fail('FOUNDATION_PAYLOAD_INVALID');
 return {format:'songlam.foundation-seed.v1',batchCode:'FOUNDATION_2E1E523B_BASE420',sourceSha256:sourceHash,
  priorSourceSha256:decisions.sourceSha256,hotel:data.hotel,businessDay:data.businessDay,roomTypes:data.roomTypes,rooms:data.rooms,services:data.services,
  quarantinedRooms:quarantine,sourceDeclaredClassification:'Giả định đồ án',projectUseApproved:true,pricingImported:false,policiesImported:false};
}
export async function importFoundation({payload,approval,gateway}){
 const json=JSON.stringify(payload),digest=hash(json);
 if(approval?.approved!==true||approval.deploymentConfirmed!==true||approval.dataWritesApproved!==true||!approval.approvalReference?.trim()
  ||approval.server!=='.\\SQLEXPRESS'||approval.database!=='SongLamPms_Design'||approval.procedure!=='pms.usp_SeedFoundationBatch'
  ||approval.payloadSha256!==digest||payload.sourceSha256!==sourceHash
  ||approval.maintenancePrincipal!=='DESKTOP-9EPI86K\\Thang DZ'||!approval.maintenancePrincipalApprovalReference?.trim()
  ||approval.certificateExceptionApprovalReference!=='USER-20261112-TEST-CERTIFICATE-EXCEPTION')fail('FOUNDATION_IMPORT_NOT_APPROVED');
 let issued=false;
 try{
  await gateway.open();const identity=await gateway.probe();
  if(identity?.ServerName!=='DESKTOP-9EPI86K\\SQLEXPRESS'||identity.DatabaseName!=='SongLamPms_Design'
   ||identity.DatabaseGuid?.toUpperCase()!=='C4DD399E-5661-4741-A424-5ABFEEFBC1AC'||identity.Environment!=='test'
   ||identity.TestIdentity!=='eb18c6f2-373d-4a83-a34f-d9809f1cbc7a'||identity.Ready!==true)fail('FOUNDATION_TARGET_NOT_VERIFIED');
  issued=true;const result=await gateway.seed(json),ack=result?.[0]?.[0];
  if(result?.[0]?.length!==1||ack?.Status!=='FOUNDATION_BATCH_CONFIRMED'||ack.PayloadSha256!==digest||![true,false,0,1].includes(ack.Created)
   ||![420,'420'].includes(ack.RoomCount)||![11,'11'].includes(ack.RoomTypeCount)||![15,'15'].includes(ack.ServiceCount))fail('FOUNDATION_OUTCOME_UNKNOWN');
  const mapping={};for(const [index,key,natural] of [[1,'roomTypes','Code'],[2,'rooms','Number'],[3,'services','Code']]){
   const expected=payload[key],rows=result[index];if(!Array.isArray(rows)||rows.length!==expected.length)fail('FOUNDATION_OUTCOME_UNKNOWN');
   const seen=new Set(),ids=new Set();for(const row of rows){const source=expected.find(r=>r.sourceId===row.SourceId);
    if(!source||seen.has(row.SourceId)||String(row[natural])!==String(source[natural==='Number'?'number':'code'])||!(/^[1-9]\d{0,9}$/.test(row.SqlId))||BigInt(row.SqlId)>2147483647n||ids.has(row.SqlId))fail('FOUNDATION_OUTCOME_UNKNOWN');seen.add(row.SourceId);ids.add(row.SqlId);}
   mapping[key]=rows;
  }
  return {status:'FOUNDATION_BATCH_CONFIRMED',created:Boolean(ack.Created),payloadSha256:digest,mapping};
 }catch(error){if(issued)fail('FOUNDATION_OUTCOME_UNKNOWN');fail(error?.code==='FOUNDATION_TARGET_NOT_VERIFIED'?error.code:'FOUNDATION_IMPORT_UNAVAILABLE');}
 finally{try{await gateway.close();}catch{}}
}
function maintenanceGateway(approval){
 let pool,types;return {
  async open(){const provider=loadWindowsSqlProvider({expectedPrincipal:approval.maintenancePrincipal,principalApprovalReference:approval.maintenancePrincipalApprovalReference,odbcDriver:'ODBC Driver 17 for SQL Server'});
   types=provider.types;pool=provider.createPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',auth:{mode:'windows'},transport:{encrypt:true,trustServerCertificate:true,port:null},pool:{min:0,max:1,idleTimeoutMs:10000},connectionTimeoutMs:5000,requestTimeoutMs:15000});await pool.connect();},
  async probe(){return (await pool.request().query(`SELECT DB_NAME() AS DatabaseName,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS ServerName,
   CONVERT(varchar(36),database_guid) AS DatabaseGuid,
   (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment') AS Environment,
   (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity') AS TestIdentity,
   CONVERT(bit,CASE WHEN OBJECT_ID(N'pms.usp_SeedFoundationBatch',N'P') IS NULL THEN 0 ELSE 1 END) AS Ready
   FROM sys.database_recovery_status WHERE database_id=DB_ID();`)).recordset[0];},
  async seed(json){const req=pool.request();req.timeout=15000;return (await req.input('PayloadJson',types.NVarChar(types.MAX),json).execute('pms.usp_SeedFoundationBatch')).recordsets;},
  async close(){await pool?.close();}
 };
}
async function main(){
 const [command,...args]=process.argv.slice(2);
 if(command==='prepare'){
  if(args.length!==2||!args.every(isAbsolute))fail('FOUNDATION_ARGUMENTS_INVALID');const [reviewDir,out]=args;
  const decisions=await load(new URL('deploy/foundation-decisions.json',root)),candidate=await load(join(reviewDir,'foundation-candidate.local.json')),review=await load(join(reviewDir,'workbook-review.local.json'));
  const payload=buildFoundationPayload(candidate,review,decisions),digest=hash(JSON.stringify(payload));await mkdir(out,{recursive:true});
  await writeFile(join(out,'payload.local.json'),JSON.stringify(payload,null,2)+'\n',{flag:'wx'});
  await writeFile(join(out,'approval.local.json'),JSON.stringify({approved:false,deploymentConfirmed:false,dataWritesApproved:false,approvalReference:'',server:'.\\SQLEXPRESS',database:'SongLamPms_Design',procedure:'pms.usp_SeedFoundationBatch',payloadSha256:digest,
   maintenancePrincipal:'DESKTOP-9EPI86K\\Thang DZ',maintenancePrincipalApprovalReference:'',certificateExceptionApprovalReference:'USER-20261112-TEST-CERTIFICATE-EXCEPTION'},null,2)+'\n',{flag:'wx'});
  const body=(await readFile(new URL('database/proposals/auth-v1/contracts/foundation-seed-body.sql',root),'utf8')).replace('__PAYLOAD_HASH__',digest);
  const script=`-- Exact foundation batch review artifact. Never automatically loaded.\nSET ANSI_NULLS ON;\nSET QUOTED_IDENTIFIER ON;\nSET NOCOUNT ON;\nSET XACT_ABORT ON;\nDECLARE @ApprovalReference nvarchar(200)=NULL;\nIF NULLIF(@ApprovalReference,N'') IS NULL THROW 54020,'Foundation RPC deployment not approved.',1;\nIF DB_NAME()<>N'SongLamPms_Design' OR CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))<>N'DESKTOP-9EPI86K\\SQLEXPRESS'\n OR NOT EXISTS(SELECT 1 FROM sys.database_recovery_status WHERE database_id=DB_ID() AND database_guid='C4DD399E-5661-4741-A424-5ABFEEFBC1AC') THROW 54021,'Unexpected deployment target.',1;\nIF @@TRANCOUNT<>0 OR OBJECT_ID(N'pms.usp_SeedFoundationBatch') IS NOT NULL THROW 54022,'No ambient transaction or existing object adoption.',1;\nBEGIN TRY\n BEGIN TRANSACTION;\n EXEC sys.sp_executesql N'${body.replaceAll("'","''")}';\n COMMIT;\nEND TRY\nBEGIN CATCH\n IF XACT_STATE()<>0 ROLLBACK;\n THROW;\nEND CATCH;\n-- No GRANT, no service role membership and no data inserted by deployment.\n`;
  const markerGuard="IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment' AND CONVERT(nvarchar(128),value)=N'test') OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity' AND CONVERT(nvarchar(128),value)=N'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a') THROW 54023,'Reviewed test markers required.',1;\n";
  await writeFile(new URL('database/proposals/auth-v1/011-foundation-base420.sql.pending',root),script.replace('BEGIN TRY\n BEGIN TRANSACTION;',markerGuard+'BEGIN TRY\n BEGIN TRANSACTION;'),{flag:'wx'});
  console.log(JSON.stringify({status:'FOUNDATION_PACKAGE_PREPARED_NOT_EXECUTED',roomTypes:11,rooms:420,services:15,quarantined:5,payloadSha256:digest,sqlWritesEnabled:false}));return;
 }
 if(command!=='import'||args.length!==2||!args.every(isAbsolute))fail('FOUNDATION_ARGUMENTS_INVALID');
 const [payloadFile,approvalFile]=args,approval=await load(approvalFile),result=await importFoundation({payload:await load(payloadFile),approval,gateway:maintenanceGateway(approval)});
 try{await writeFile(join(resolve(payloadFile,'..'),'receipt-'+Date.now()+'.local.json'),JSON.stringify({...result,confirmedAtUtc:new Date().toISOString()},null,2)+'\n',{flag:'wx'});}
 catch{fail('FOUNDATION_RECEIPT_WRITE_FAILED_SQL_CONFIRMED');}
 console.log(JSON.stringify({status:result.status,created:result.created,rooms:420}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({status:error?.code==='FOUNDATION_RECEIPT_WRITE_FAILED_SQL_CONFIRMED'?'SQL_CONFIRMED_LOCAL_RECEIPT_FAILED':'NOT_CONFIRMED',code:/^FOUNDATION_[A-Z_]+$/.test(error?.code||'')?error.code:'FOUNDATION_CLI_FAILED',automaticRetry:false}));process.exitCode=1;});
