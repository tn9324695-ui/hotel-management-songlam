// Diagnostic runtime fixtures only. No real SQL/acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startTestServer} from './helpers.js';
const next=(_req,_res,continueRequest)=>continueRequest();
const auth={fixture:false,status:async()=>({loginEnabled:true}),authenticate:next,csrf:next,requireAvailable:next,requirePermission:()=>next,login:next,logout:next};
test('live configured diagnostics do not imply login tested or writable cutover',async t=>{
  const {url}=await startTestServer(t,{authRuntime:auth,sqlRuntime:{status:async()=>({configured:true,sqlConnected:true,identityVerified:true,authentication:true,modules:['catalogGateway'],businessWritesEnabled:false})}});
  const response=await fetch(url+'/ready'),body=await response.json();
  assert.equal(response.status,503);assert.equal(body.data.ready,false);
  assert.equal(body.data.checks.authentication.status,'configured');
  assert.equal(body.data.checks.sessionStore.status,'configured');
  assert.equal(body.data.checks.catalogRead.status,'configured_not_exercised');
  assert.equal(body.data.cutover.writable,false);
});
test('unavailable auth runtime cannot inherit enabled state from an inconsistent SQL snapshot',async t=>{
  const {url}=await startTestServer(t,{sqlRuntime:{status:async()=>({sqlConnected:true,identityVerified:true,authentication:true,modules:[]})}});
  const response=await fetch(url+'/ready'),body=await response.json();
  assert.equal(response.status,503);assert.equal(body.data.ready,false);
  assert.equal(body.data.checks.authentication.status,'pending_approval');
});
