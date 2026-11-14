// Fixed local test listener. No real user credentials or successful login.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8093',checks=[];
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!=='--catalog-approved=USER-20261112-MODULES-5-6'))throw new Error('HTTP_PROBE_ARGUMENTS_REJECTED');
const expectedModules=args.length?['catalogGateway']:[];
async function request(path,options){const r=await fetch(base+path,{signal:AbortSignal.timeout(10000),...options});return {status:r.status,body:await r.json(),cookieIssued:r.headers.has('set-cookie')};}
let r=await request('/health');assert.equal(r.status,200);checks.push('HTTP_HEALTH');
r=await request('/api/v1/connection/status');assert.equal(r.status,200);
assert.deepEqual(r.body.data,{mode:'test-only',configured:true,sqlConnected:true,identityVerified:true,authentication:true,modules:expectedModules,businessWritesEnabled:false});
checks.push('REAL_SQL_RUNTIME_NO_BUSINESS_WRITES');
r=await request('/api/v1/auth/status');assert.equal(r.status,200);assert.equal(r.body.data.fixture,false);assert.equal(r.body.data.loginEnabled,true);checks.push('REAL_AUTH_DEPENDENCIES_CONFIGURED');
r=await request('/api/v1/auth/me');assert.equal(r.status,401);assert.equal(r.cookieIssued,false);checks.push('UNAUTHENTICATED_ME_DENIED');
r=await request('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:base},
  body:JSON.stringify({username:'SONGLAM_TEST_PREFLIGHT_NO_ACCOUNT',password:'INVALID_PREFLIGHT_NOT_A_REAL_SECRET'})});
assert.equal(r.status,401);assert.equal(r.cookieIssued,false);checks.push('NONEXISTENT_ACCOUNT_DENIED_NO_COOKIE');
r=await request('/ready');assert.equal(r.status,503);assert.equal(r.body.data.ready,false);checks.push('OPERATIONAL_READINESS_STAYS_BLOCKED');
const html=await fetch(base+'/login.html');assert.equal(html.status,200);assert.match(await html.text(),/SongLam/);checks.push('REAL_LISTENER_SERVES_FRONTEND');
console.log(JSON.stringify({status:'SERVICE_HTTP_PREFLIGHT_PASSED',base,checks,positiveEmployeeLoginTested:false,businessFlowsTested:false}));
