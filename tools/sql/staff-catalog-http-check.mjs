// Explicit test-only HTTP integration, not a fixture. Credentials stay in RAM;
// never write cookies/CSRF/passwords or full responses to evidence/logs.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
if(process.argv.slice(2).join(' ')!=='--approved=USER-20261112-MODULES-5-6')throw new Error('TEST_APPROVAL_REQUIRED');
const base='http://127.0.0.1:8093',checks=[],roles=[];
const bundle=JSON.parse(readFileSync(new URL('./private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
let cookie='',csrf='',last;
async function call(path,{method='GET',body,token=csrf,sendCookie=true}={}){
 const response=await fetch(base+'/api/v1'+path,{method,signal:AbortSignal.timeout(10000),
   headers:{...(method==='POST'?{'content-type':'application/json',origin:base}:{}),...(sendCookie&&cookie?{cookie}:{}),...(token?{'x-csrf-token':token}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=await response.json();last={path,status:response.status,code:/^[A-Z0-9_]+$/.test(json.error?.code||'')?json.error.code:null};
 return {status:response.status,json,newCookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function logout(){if(!cookie)return;const r=await call('/auth/logout',{method:'POST',body:{}});assert.equal(r.status,200);checks.push('LOGOUT_CONFIRMED');const old=cookie;cookie='';csrf='';return old;}
try{
 const status=await call('/connection/status',{sendCookie:false,token:''});
 assert.equal(status.json.data.sqlConnected,true);assert.equal(status.json.data.identityVerified,true);
 assert.equal(status.json.data.businessWritesEnabled,false);assert.deepEqual(status.json.data.modules,['catalogGateway']);checks.push('REAL_SQL_CATALOG_RUNTIME');
 for(const account of bundle.accounts){
   cookie='';csrf='';
   const login=await call('/auth/login',{method:'POST',sendCookie:false,token:'',body:{username:account.username,password:account.password}});
   assert.equal(login.status,200);assert.ok(login.newCookie);cookie=login.newCookie;csrf=login.json.data.csrfToken;
   const id=login.json.data.user.appUserId;checks.push('LOGIN_'+account.roleCode);
   const me=await call('/auth/me');assert.equal(me.status,200);assert.equal(me.json.data.user.appUserId,id);assert.equal(me.json.data.user.username,account.username);
   const permissions=await call('/auth/permissions');assert.equal(permissions.status,200);const rights=permissions.json.data.permissions;assert.ok(Array.isArray(rights));
   const results=[];
   for(const [path,needed,singleton] of [['/room-types',['viewRoomRack']],['/rooms',['viewRoomRack']],['/services',['addServiceOrder','manageHousekeepingTasks']],
     ['/hotel-settings',['viewRoomRack'],true],['/business-days',['viewDailyRevenue']],['/business-days/current',['viewDailyRevenue'],true]]){
     const r=await call(path);const allowed=needed.some(p=>rights.includes(p));
     assert.equal(r.status,allowed?(singleton?404:200):403);
     if(allowed&&!singleton){assert.deepEqual(r.json.data,[]);assert.equal(r.json.meta.total,'0');}
     assert.doesNotMatch(JSON.stringify(r.json),/PasswordHash|passwordHash|SecurityVersion|CsrfToken|EpochHash|SessionKeyHash/);
     results.push({path,status:r.status});checks.push('CATALOG_'+account.roleCode+'_'+path);
   }
   const forged=await call('/rooms?role=admin&userId=1');assert.equal(forged.status,400);checks.push('FORGED_ACTOR_REJECTED_'+account.roleCode);
   const badCsrf=await call('/auth/logout',{method:'POST',body:{},token:''});assert.equal(badCsrf.status,403);checks.push('CSRF_REQUIRED_'+account.roleCode);
   const old=await logout();cookie=old;const after=await call('/auth/me',{token:''});assert.equal(after.status,401);cookie='';checks.push('OLD_SESSION_DENIED_'+account.roleCode);
   roles.push({role:account.roleCode,userId:id,permissionsCount:rights.length,reads:results});
 }
 const bad=await call('/auth/login',{method:'POST',sendCookie:false,token:'',body:{username:bundle.accounts[0].username,password:'INVALID_TEST_PASSWORD'}});
 assert.equal(bad.status,401);assert.equal(bad.newCookie,undefined);checks.push('WRONG_PASSWORD_NO_SESSION');
 const output={status:'REAL_SQL_STAFF_CATALOG_HTTP_PASSED',checks,roles,fixture:false,businessWritesEnabled:false,emptyCatalogExpected:true};
 writeFileSync(new URL('./private/modules-5-6-20261112/http-integration.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({status:output.status,checks:checks.length,roles:roles.length,fixture:false}));
}catch(error){
 const failedRequest=last;
 try{await logout();}catch{}
 const failure={status:'NOT_PASSED',checksPassed:checks.length,rolesCompleted:roles.length,last:failedRequest,assertion:error?.code==='ERR_ASSERTION'};
 writeFileSync(new URL('./private/modules-5-6-20261112/http-integration-failure.json',import.meta.url),JSON.stringify(failure,null,2)+'\n');
 console.log(JSON.stringify(failure));process.exitCode=1;
}
