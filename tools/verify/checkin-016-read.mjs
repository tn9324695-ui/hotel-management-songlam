// Real HTTP -> dedicated pool -> SQL 016. Business reads only; G2 sessions used.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';
const origin='http://127.0.0.1:8093',dir=new URL('../sql/private/lifecycle/',import.meta.url),credentials=JSON.parse((await fs.readFile(new URL('../test-staff-B20261112_UI01/credentials.local.json',dir),'utf8')).replace(/^\uFEFF/,'')),report={source:'REAL_SQL_016_READ_ONLY_HTTP',checks:[]},sessions=[];
const check=(n,v)=>{assert.ok(v,n);report.checks.push(n);};
async function login(role){const a=credentials.accounts.find(x=>x.roleCode===role),r=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:a.username,password:a.password})}),j=await r.json();assert.equal(r.status,200);const s={cookie:r.headers.get('set-cookie').split(';')[0],csrf:j.data.csrfToken};sessions.push(s);return s;}
async function request(s,path,method='GET',body){const r=await fetch(origin+'/api/v1'+path,{method,headers:{Cookie:s.cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':s.csrf,'Idempotency-Key':randomUUID(),'X-Request-ID':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
try{const front=await login('receptionist'),house=await login('housekeeping'),deployment=(await(await fetch(origin+'/api/v1/deployment')).json()).data;
check('016_LIVE_MODULE_PROOF_VERIFIED',deployment.checkInReadVerified===true);
check('CHECKIN_WRITES_STILL_REQUIRE_SEPARATE_RELEASE',deployment.checkInWriteBlocker==='CHECK_IN_WRITES_NOT_RELEASED'&&!deployment.operations.some(o=>o.operation==='stays.checkIn'));
const stays=await request(front,'/stays?status=IN_HOUSE&limit=20');check('EMPTY_STAYS_FROM_SQL',stays.status===200&&stays.data.length===0&&stays.meta.hasMore===false);
const arrivals=await request(front,'/stays/arrivals?date=2026-12-13&limit=20');check('FUTURE_ARRIVALS_FROM_SQL',arrivals.status===200&&arrivals.data.some(r=>r.bookingRoomId==='1')&&arrivals.meta.date==='2026-12-13');
const missing=await request(front,'/stays/999999999');check('MISSING_STAY_404_NOT_FAKE_ROW',missing.status===404&&missing.error.code==='STAY_NOT_FOUND');
const readiness=await request(front,'/stays/room-readiness?bookingRoomId=1');check('READINESS_USES_SQL_WITH_FUTURE_ARRIVAL_BLOCKER',readiness.status===200&&readiness.data.blockers.includes('BEFORE_CONFIRMED_ARRIVAL'));
const forbidden=await request(house,'/stays');check('HOUSEKEEPING_CANNOT_READ_FRONTDESK_STAYS',forbidden.status===403);
const write=await request(front,'/stays/check-in','POST',{});check('CHECKIN_WRITE_FAILS_CLOSED_BEFORE_ANY_SQL_COMMAND',write.status===503&&write.error.code==='CUTOVER_WRITE_LOCKED');
const after=(await(await fetch(origin+'/api/v1/deployment')).json()).data;check('ORIGINAL_SIX_OPERATIONS_REMAIN_WRITABLE',after.writable&&after.operations.length===6);
report.status='PASS';}catch(e){report.status='FAIL';report.failure=e instanceof assert.AssertionError?e.message:'HTTP_READ_FAILED';process.exitCode=1;}finally{for(const s of sessions)await request(s,'/auth/logout','POST',{}).catch(()=>{});await fs.writeFile(new URL('http-016-read.json',dir),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure}));}
