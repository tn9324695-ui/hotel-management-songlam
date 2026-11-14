// Fixture importer only. No real SQL objects/accounts/data are touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildFoundationPayload,importFoundation} from '../../tools/sql/foundation-batch.mjs';
const sourceHash='2e1e523b3c0463e07a744a78b68fe9ec1c7d3dc05bacb7bb974b95f19daade5d';
function fixture(){
 const codes=['SUP-K','DLX-T','PRE-K','PRE-T','JRS','CLS','EXS','GRS','RYS','PRS','DLX-TR'],quarantine=['501','902','1303','1704','2105'];
 const roomTypes=codes.map((code,i)=>({sourceId:'T'+i,code,name:'Fixture '+code,areaM2:null,standardOccupancy:2,maxOccupancy:3,bedConfiguration:null,description:null,active:null}));
 const rooms=[...quarantine,...Array.from({length:420},(_,i)=>'F-'+i)].map((number,i)=>({sourceId:'R'+i,number,roomTypeCode:'SUP-K',floor:'Fixture',cleanlinessStatus:'DIRTY',active:i<5?null:true,notes:null}));
 const services=Array.from({length:15},(_,i)=>({sourceId:'S'+i,code:'S'+i,name:'Fixture service',category:'FNB',unit:'Unit',priceVnd:String(i),active:null}));
 const candidate={format:'songlam.foundation-source.v1',batchId:'FIXTURE',sourceKind:'test',reviewedByOperator:false,
  hotel:{name:'Fixture',address:null,phone:null,email:null,taxCode:null,timeZoneId:'SE Asia Standard Time',currency:'VND',workingDate:'2026-10-11',checkInTime:'14:00:00',checkOutTime:'12:00:00'},businessDay:null,roomTypes,rooms,services,pricing:null};
 const decisions={sourceSha256:'a'.repeat(64),workingDate:'2026-10-11',completedWorkbook:{useAsProjectDataApproved:true,sourceSha256:sourceHash,roomImportCountApproved:420,quarantineMaintenanceRoomsApproved:quarantine}};
 const review={sourceSha256:sourceHash,maintenance:quarantine.map(number=>({number}))};
 const payload=buildFoundationPayload(candidate,review,decisions),digest=createHash('sha256').update(JSON.stringify(payload),'utf16le').digest('hex').toUpperCase();
 const approval={approved:true,deploymentConfirmed:true,dataWritesApproved:true,approvalReference:'FIXTURE_ONLY',server:'.\\SQLEXPRESS',database:'SongLamPms_Design',procedure:'pms.usp_SeedFoundationBatch',payloadSha256:digest,
  maintenancePrincipal:'DESKTOP-9EPI86K\\Thang DZ',maintenancePrincipalApprovalReference:'FIXTURE_ONLY',certificateExceptionApprovalReference:'USER-20261112-TEST-CERTIFICATE-EXCEPTION'};
 const state={opened:0,seeded:0,closed:0};
 const gateway={async open(){state.opened++;},async close(){state.closed++;},async probe(){return {ServerName:'DESKTOP-9EPI86K\\SQLEXPRESS',DatabaseName:'SongLamPms_Design',DatabaseGuid:'C4DD399E-5661-4741-A424-5ABFEEFBC1AC',Environment:'test',TestIdentity:'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a',Ready:true};},
  async seed(){state.seeded++;return [[{Status:'FOUNDATION_BATCH_CONFIRMED',Created:false,PayloadSha256:digest,RoomCount:420,RoomTypeCount:11,ServiceCount:15}],
   ...['roomTypes','rooms','services'].map(k=>payload[k].map((r,i)=>({SourceId:r.sourceId,SqlId:String(i+1),[k==='rooms'?'Number':'Code']:k==='rooms'?r.number:r.code})))];}};
 return {candidate,review,decisions,payload,approval,gateway,state};
}
test('foundation preparation quarantines exactly five rooms and cannot activate pricing or financial policies',()=>{
 const f=fixture();assert.equal(f.candidate.rooms.length,425);assert.equal(f.payload.rooms.length,420);assert.equal(f.payload.roomTypes.find(r=>r.code==='DLX-TR').active,false);
 assert.equal(f.payload.hotel.taxCode,null);assert.equal(f.payload.pricingImported,false);assert.equal(f.payload.policiesImported,false);
 assert.equal(f.payload.services[0].priceVnd,'0');assert.equal(f.payload.businessDay.date,'2026-10-11');
});
test('unapproved deployment/writes or changed canonical payload never opens SQL',async()=>{
 for(const patch of [{approved:false},{deploymentConfirmed:false},{dataWritesApproved:false},{payloadSha256:'0'.repeat(64)}]){
  const f=fixture();await assert.rejects(importFoundation({...f,approval:{...f.approval,...patch}}),{code:'FOUNDATION_IMPORT_NOT_APPROVED'});assert.equal(f.state.opened,0);
 }
});
test('fixture replay returns all source-to-SQL mappings, without re-inserting or silently dropping rooms',async()=>{
 const f=fixture(),result=await importFoundation(f);assert.equal(result.created,false);assert.equal(result.mapping.rooms.length,420);assert.equal(result.mapping.roomTypes.length,11);assert.equal(f.state.closed,1);
});
test('timeout/partial receipt remains unknown and is never retried automatically',async()=>{
 const f=fixture();f.gateway.seed=async()=>{f.state.seeded++;throw new Error('PRIVATE_SQL_DETAILS');};
 await assert.rejects(importFoundation(f),error=>{assert.equal(error.code,'FOUNDATION_OUTCOME_UNKNOWN');assert.doesNotMatch(error.message,/PRIVATE/);return true;});assert.equal(f.state.seeded,1);assert.equal(f.state.closed,1);
});
