// Explicit SQL test transaction. Uses only labelled project test customer and one clean room.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8093';
if(process.argv[2]!=='--approved=USER-20261114-G6-G7')throw Error('G6_TEST_WRITE_APPROVAL_REQUIRED');
const root=new URL('../sql/private/',import.meta.url),stateUrl=new URL('lifecycle/checkin-live.json',root);
const creds=JSON.parse(await fs.readFile(new URL('test-staff-B20261112_UI01/credentials.local.json',root),'utf8'));
const account=creds.accounts.find(a=>a.roleCode==='receptionist');
let state;try{state=JSON.parse(await fs.readFile(stateUrl,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={batch:'SONGLAM_TEST_G6_'+Date.now(),checks:[]};}
state.checks=[];delete state.failure;
const save=()=>fs.writeFile(stateUrl,JSON.stringify(state,null,2));
const login=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:account.username,password:account.password})});
assert.equal(login.status,200);const auth=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
const deployment=(await(await fetch(origin+'/api/v1/deployment')).json()).data;
async function api(path,method='GET',body,op){const r=await fetch(origin+'/api/v1'+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':auth.data.csrfToken,'X-PMS-Deployment':deployment.deploymentId,'X-Request-ID':op?.requestId||randomUUID(),'Idempotency-Key':op?.key||randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
function check(name,ok){assert.ok(ok,name);state.checks.push(name);}
try{
 check('G6_LIVE_SQL_RELEASE',deployment.checkInOperationsVerified&&deployment.testOnly&&deployment.operations.some(x=>x.operation==='stays.checkIn'));
 const types=await api('/room-types?limit=100'),plans=await api('/rate-plans?limit=100');
 const type=types.data.find(x=>x.id==='11'),plan=plans.data.find(x=>x.id==='2');
 check('HOURLY_RATE_AND_TYPE_FROM_SQL',Boolean(type&&plan));
 const rooms=await api('/rooms?roomTypeId='+type.id+'&limit=200');
 const room=rooms.data.find(x=>x.cleanlinessStatus==='CLEAN'&&x.exploitationStatus==='ACTIVE'&&x.occupancyStatus==='VACANT');
 check('CLEAN_ROOM_FROM_SQL',Boolean(room));
 if(!state.bookingId){
  const input={roomTypeId:type.id,ratePlanId:plan.id,checkInAt:'2026-11-14T09:00:00+07:00',checkOutAt:'2026-11-14T15:00:00+07:00',rooms:1,adultsPerRoom:1,childrenPerRoom:0};
  const quote=await api('/pricing/quotes/hourly','POST',input);check('HOURLY_QUOTE_SQL',quote.status===200);
  const body={kind:'INDIVIDUAL',customerId:'1',contact:{name:state.batch,phone:null},sourceCode:'SONGLAM_TEST',notes:state.batch,
   rooms:[{lineKey:'g6',roomTypeId:type.id,ratePlanId:plan.id,stayType:'HOURLY',checkInAt:input.checkInAt,checkOutAt:input.checkOutAt,
    adults:1,children:0,guestCustomerIds:['1'],leadCustomerId:'1',plannedRoomId:room.id,acceptedQuoteHash:quote.data.acceptanceHash}]};
  if(!state.create)state.create={key:randomUUID(),requestId:randomUUID(),body};await save();
  const created=await api('/bookings','POST',state.create.body,state.create);state.create.status=created.status;state.create.error=created.error?.code;
  if(created.status!==201&&created.status!==200)throw Error('BOOKING_CREATE_'+created.status+'_'+created.error?.code);
  state.bookingId=created.data.booking?.id||created.data.bookingId;check('TODAY_BOOKING_SQL_COMMIT',Boolean(state.bookingId));await save();
 }
 const detail=await api('/bookings/'+state.bookingId);check('BOOKING_READBACK',detail.status===200);
 if(state.checkIn?.result?.stays?.length){
  const replay=await api('/stays/check-in','POST',state.checkIn.body,state.checkIn);
  check('CHECKIN_REPLAY_NO_DUPLICATE',replay.status===200&&replay.data.replayed===true&&replay.data.stays[0].id===state.checkIn.result.stays[0].id);
  const parallel=await Promise.all([api('/stays/check-in','POST',state.checkIn.body,state.checkIn),api('/stays/check-in','POST',state.checkIn.body,state.checkIn)]);
  check('TWO_PARALLEL_REPLAYS_SAME_STAY',parallel.every(x=>x.status===200&&x.data?.replayed===true&&x.data.stays[0].id===state.checkIn.result.stays[0].id));
  const stay=await api('/stays/'+state.checkIn.result.stays[0].id);
  check('STAY_READBACK_SQL',stay.status===200&&stay.data.status==='IN_HOUSE');
  state.status='PASS';await save();
 }else{
 const part=detail.data.rooms.find(x=>x.status==='CONFIRMED');check('CONFIRMED_PART',Boolean(part));
 const ready=await api('/stays/room-readiness?bookingRoomId='+part.id);state.readiness=ready.status===200?{blockers:ready.data.blockers}:ready.error;
 check('READINESS_SQL',ready.status===200);await save();
 if(ready.data.blockers.length)throw Error('CHECKIN_BLOCKERS_'+ready.data.blockers.join(','));
 const lead=part.guests.find(x=>x.isLead)?.customerId||'1';
 const body={bookingId:detail.data.id,expectedVersion:detail.data.version,rooms:[{bookingRoomId:part.id,expectedVersion:ready.data.bookingRoomVersion,
  roomId:ready.data.room.id,roomVersion:ready.data.room.version,allocationId:ready.data.allocation.id,allocationVersion:ready.data.allocation.version,
  guestCustomerIds:part.guests.map(x=>x.customerId),leadCustomerId:lead}]};
 if(!state.checkIn){state.checkIn={key:randomUUID(),requestId:randomUUID(),body};await save();}
 const committed=await api('/stays/check-in','POST',state.checkIn.body,state.checkIn);state.checkIn.status=committed.status;state.checkIn.error=committed.error?.code;state.checkIn.result=committed.data;await save();
 check('CHECKIN_SQL_COMMIT_OR_SAME_RECEIPT',([200,201].includes(committed.status))&&committed.data.committed===true);
 const replay=await api('/stays/check-in','POST',state.checkIn.body,state.checkIn);check('CHECKIN_REPLAY_NO_DUPLICATE',replay.status===200&&replay.data.replayed===true&&replay.data.stays[0].id===committed.data.stays[0].id);
 const stay=await api('/stays/'+committed.data.stays[0].id);check('STAY_READBACK_SQL',stay.status===200&&stay.data.status==='IN_HOUSE');
 state.status='PASS';await save();
 }
}catch(e){state.status='FAIL';state.failure=String(e.message).slice(0,180);await save();process.exitCode=1;
}finally{await api('/auth/logout','POST',{}).catch(()=>{});console.log(JSON.stringify({status:state.status,checks:state.checks.length,bookingId:state.bookingId||null,error:state.failure||null}));}
