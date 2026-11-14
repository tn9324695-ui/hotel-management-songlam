// Real HTTP/SQL integration rehearsal, NOT unit tests or mock providers.
// Re-running uses persisted intent/key/request UUID; never creates fresh copies.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {randomUUID}from'node:crypto';
const approval='USER-20261112-REAL-PRICING-CUSTOMER-BOOKING';if(process.argv.slice(2).join(' ')!==`--approved=${approval}`)throw new Error('APPROVAL_REQUIRED');
const dir=new URL('../sql/private/booking012/',import.meta.url),origin='http://127.0.0.1:8093',ui=JSON.parse(await fs.readFile(new URL('ui-progress.json',dir),'utf8'));
let state;try{state=JSON.parse(await fs.readFile(new URL('integrity-progress.json',dir),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={batch:ui.batch,operations:{}};}
const report={source:'REAL_HTTP_SQL_NO_FIXTURE',batch:state.batch,checks:[],bookings:[],requests:[],roles:[],startedAtUtc:new Date().toISOString()},sessions=[];
const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);},save=()=>fs.writeFile(new URL('integrity-progress.json',dir),JSON.stringify(state,null,2));
const deployment=(await(await fetch(origin+'/api/v1/deployment')).json()).data;
async function request(account,path,{method='GET',body,operation}={}){
 const headers={Origin:origin,Accept:'application/json','X-Request-ID':operation?.requestId||randomUUID(),...(account?.cookie?{Cookie:account.cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),
 ...(method!=='GET'?{'X-CSRF-Token':account.csrf,'X-PMS-Deployment':deployment.deploymentId,'Idempotency-Key':operation?.key||randomUUID()}: {})};
 const response=await fetch(origin+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),payload=await response.json();
 report.requests.push({path,status:response.status,requestId:payload.requestId});return{status:response.status,...payload};
}
async function quote(account,room){const r=await request(account,'/api/v1/pricing/quotes/'+(room.stayType==='HOURLY'?'hourly':'nightly'),{method:'POST',body:{roomTypeId:room.roomTypeId,ratePlanId:room.ratePlanId,checkInAt:room.checkInAt,checkOutAt:room.checkOutAt,rooms:1,adultsPerRoom:room.adults,childrenPerRoom:room.children}});assert.equal(r.status,200,'SQL quote');return r.data;}
async function operation(name,path,body){if(!state.operations[name]){state.operations[name]={path,body,key:randomUUID(),requestId:randomUUID()};await save();}return state.operations[name];}
async function send(account,op){const response=await request(account,op.path,{method:'POST',body:op.body,operation:op});op.lastStatus=response.status;op.result=response.data?{bookingId:response.data.booking?.id,bookingCode:response.data.booking?.code,operationId:response.data.operationId,replayed:response.data.replayed}: {code:response.error?.code};await save();return response;}
try{
 check('SCOPED_TEST_ONLY_NO_G12',deployment.writable&&deployment.testOnly&&deployment.operationalCutover===false&&deployment.operations.length===3);
 const credentials=JSON.parse((await fs.readFile(new URL('../test-staff-B20261112_UI01/credentials.local.json',dir),'utf8')).replace(/^\uFEFF/,''));
 for(const a of credentials.accounts){const response=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:a.username,password:a.password})}),payload=await response.json();assert.equal(response.status,200,'Real login '+a.roleCode);
  const account={role:a.roleCode,cookie:response.headers.get('set-cookie').split(';')[0],csrf:payload.data.csrfToken,user:payload.data.user,permissions:payload.data.permissions};
  const me=await request(account,'/api/v1/auth/me');account.id=me.data.user.appUserId;account.permissions=(await request(account,'/api/v1/auth/permissions')).data.permissions;sessions.push(account);
  report.roles.push({role:account.role,appUserId:account.id,canBook:account.permissions.includes('createBooking')});check('ROLE_LOGIN_'+a.roleCode,true);
 }
 const reception=sessions.find(a=>a.role==='receptionist'),manager=sessions.find(a=>a.role==='manager');assert.ok(reception&&manager);
 const types=(await request(reception,'/api/v1/room-types?limit=200')).data,plans=(await request(reception,'/api/v1/rate-plans?limit=200')).data;
 const sup=types.find(t=>t.code==='SUP-K'),prs=types.find(t=>t.code==='PRS'),night=plans.find(p=>p.code==='SL-NIGHT-2026-V1'),hour=plans.find(p=>p.code==='SL-HOUR6-2026-V1');
 const supRooms=(await request(reception,'/api/v1/rooms?roomTypeId='+sup.id+'&limit=200')).data.filter(r=>r.exploitationStatus==='ACTIVE'),prsRooms=(await request(reception,'/api/v1/rooms?roomTypeId='+prs.id+'&limit=200')).data.filter(r=>r.exploitationStatus==='ACTIVE');
 check('PRESERVED_SINGLE_PRS_CAPACITY',prsRooms.length===1);assert.ok(supRooms.length>=2);
 function room(type,physical,line,from='2027-01-20T14:00:00+07:00',to='2027-01-22T12:00:00+07:00',stay='NIGHTLY') {return{lineKey:line,roomTypeId:type.id,ratePlanId:stay==='NIGHTLY'?night.id:hour.id,stayType:stay,checkInAt:from,checkOutAt:to,adults:2,children:0,guestCustomerIds:[ui.customerId],leadCustomerId:ui.customerId,plannedRoomId:physical.id};}
 async function body(name,rooms){const lines=[];for(const r of rooms)lines.push({...r,acceptedQuoteHash:(await quote(reception,r)).acceptanceHash});return{kind:rooms.length>1?'GROUP':'INDIVIDUAL',customerId:ui.customerId,contact:{name:state.batch,phone:null},groupName:rooms.length>1?state.batch+'_'+name:null,sourceCode:'SONGLAM_TEST',notes:state.batch+'_'+name,rooms:lines};}
 const concurrentBody=await body('CONCURRENT',[room(prs,prsRooms[0],'prs')]);
 const a=await operation('concurrentA','/api/v1/bookings',{...concurrentBody,notes:state.batch+'_CONCURRENT_A'}),b=await operation('concurrentB','/api/v1/bookings',{...concurrentBody,notes:state.batch+'_CONCURRENT_B'});
 const [ra,rb]=await Promise.all([send(reception,a),send(manager,b)]);
 const successes=[{response:ra,account:reception,op:a},{response:rb,account:manager,op:b}].filter(x=>[200,201].includes(x.response.status));
 check('CONCURRENT_SAME_SINGLE_ROOM_ONLY_ONE_COMMIT',successes.length===1&&[ra.status,rb.status].includes(409));
 const winner=successes[0];report.bookings.push({scenario:'CONCURRENCY_WINNER',id:winner.response.data.booking.id,code:winner.response.data.booking.code,actorId:winner.account.id,requestId:winner.op.requestId});
 const replay=await send(winner.account,winner.op);check('REAL_SQL_REPLAY_SAME_BOOKING_NO_SECOND_INSERT',replay.status===200&&replay.data.replayed&&replay.data.booking.id===winner.response.data.booking.id);
 const groupBody=await body('GROUP',[room(sup,supRooms[0],'group-1','2027-01-10T14:00:00+07:00','2027-01-12T12:00:00+07:00'),room(sup,supRooms[1],'group-2','2027-01-10T14:00:00+07:00','2027-01-12T12:00:00+07:00')]);
 const groupOp=await operation('group','/api/v1/bookings/groups',groupBody),group=await send(reception,groupOp);
 check('GROUP_ATOMIC_RECEIPT_TWO_ROOMS',[200,201].includes(group.status)&&group.data.rooms.length===2);
 report.bookings.push({scenario:'GROUP_TWO_ROOMS',id:group.data.booking.id,code:group.data.booking.code,actorId:reception.id,requestId:groupOp.requestId});
 const failedBody=await body('ROLLBACK_EXPECTED',[room(sup,supRooms[0],'rollback-first'),room(prs,prsRooms[0],'rollback-conflict')]);
 const failOp=await operation('rollback','/api/v1/bookings/groups',failedBody),failed=await send(reception,failOp);check('GROUP_SECOND_ROOM_CONFLICT_RETURNS_409',failed.status===409);
 const hourBody=await body('HOURLY',[room(sup,supRooms[0],'hour','2027-01-25T14:00:00+07:00','2027-01-25T20:00:00+07:00','HOURLY')]);
 const hourOp=await operation('hourly','/api/v1/bookings',hourBody),hourly=await send(reception,hourOp);check('HOURLY_COMMIT_NO_NIGHTLY_LATE_FEE',[200,201].includes(hourly.status));
 const hourDetail=await request(reception,'/api/v1/bookings/'+hourly.data.booking.id);check('HOURLY_FROZEN_TOTAL_650000',hourDetail.data.totals.estimatedAccommodationTotalVnd==='650000');
 report.bookings.push({scenario:'HOURLY_SIX_HOURS',id:hourly.data.booking.id,code:hourly.data.booking.code,actorId:reception.id,requestId:hourOp.requestId});
 for(const[time,surcharge]of[['05:59:59','1100000'],['06:00:00','550000'],['09:00:00','330000'],['12:00:00','330000'],['14:00:00','0']]){const q=await quote(reception,room(sup,supRooms[0],'boundary','2027-02-01T'+time+'+07:00','2027-02-02T12:00:00+07:00'));check('SQL_QUOTE_EARLY_'+time,q.perRoom.boundarySurchargesVnd===surcharge);}
 for(const[time,surcharge]of[['12:00:00','0'],['14:00:00','330000'],['15:00:00','550000'],['18:00:00','1100000']]){const q=await quote(reception,room(sup,supRooms[0],'boundary','2027-02-01T14:00:00+07:00','2027-02-02T'+time+'+07:00'));check('SQL_QUOTE_LATE_'+time,q.perRoom.boundarySurchargesVnd===surcharge);}
 for(const account of sessions){const read=await request(account,'/api/v1/rate-plans');check('READ_OWN_RATES_'+account.role,read.status===200);
  if(!account.permissions.includes('createBooking')){const denied=await request(account,'/api/v1/bookings',{method:'POST',body:concurrentBody});check('DIRECT_WRITE_PERMISSION_DENIED_'+account.role,denied.status===403);}}
 const forged=await request(reception,'/api/v1/bookings',{method:'POST',body:{...concurrentBody,actorId:manager.id}});check('BROWSER_ACTOR_SPOOF_REJECTED',forged.status===400);
 const wrong=structuredClone(concurrentBody);wrong.rooms[0].acceptedQuoteHash='0'.repeat(64);const stale=await request(reception,'/api/v1/bookings',{method:'POST',body:wrong});check('STALE_PRICE_REFUSED_BEFORE_COMMIT',stale.status===409&&stale.error.code==='BOOKING_QUOTE_CHANGED');
 const noCsrf=await fetch(origin+'/api/v1/bookings',{method:'POST',headers:{Origin:origin,Cookie:reception.cookie,'Content-Type':'application/json','X-PMS-Deployment':deployment.deploymentId,'X-Request-ID':randomUUID(),'Idempotency-Key':randomUUID()},body:JSON.stringify(concurrentBody)});check('REAL_CSRF_MISSING_REJECTED',noCsrf.status===403);
 check('NO_SESSION_CANNOT_READ_BOOKINGS',(await request(null,'/api/v1/bookings')).status===401);
 report.status='HTTP_SQL_PASSED_DATABASE_RECONCILIATION_REQUIRED';
}catch(error){report.status='NOT_PASSED';report.failure=String(error.message).slice(0,180);process.exitCode=1;}
finally{for(const account of sessions)try{await request(account,'/api/v1/auth/logout',{method:'POST',body:{}});}catch{}
 await fs.writeFile(new URL('http-integrity.json',dir),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,bookings:report.bookings,failure:report.failure}));}
