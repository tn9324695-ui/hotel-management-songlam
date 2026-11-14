// In-memory gateway fixtures and crypto only. No SQL or real credential files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildStaffBundle,validateStaffBundle,validateStaffApproval,importStaff,staffBatch} from '../../tools/sql/test-staff.mjs';
let bundlePromise;
const bundle=()=>bundlePromise ||= buildStaffBundle();
function approval(){return {...JSON.parse(fs.readFileSync(new URL('../../deploy/test-staff-seed.example.json',import.meta.url),'utf8')),
  approved:true,approvalReference:'FIXTURE_ONLY',seedWritesApproved:true,seedWriteApprovalReference:'FIXTURE_ONLY',
  maintenancePrincipal:'FIXTURE\\maintenance',maintenancePrincipalApprovalReference:'FIXTURE_ONLY'};}
async function fixture({wrongMarker=false,timeout=false,replay=false,badAck=false}={}){
  const b=await bundle(),state={open:0,seed:0,close:0};
  return {state,gateway:{
    async open(){state.open++;},async close(){state.close++;},
    async probe(){return {ServerIdentity:'DESKTOP-9EPI86K\\SQLEXPRESS',DatabaseName:'SongLamPms_Design',DatabaseGuid:'C4DD399E-5661-4741-A424-5ABFEEFBC1AC',
      Environment:'test',TestIdentity:wrongMarker?null:'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a',SeedReady:true};},
    async seed(batch,json){state.seed++;const accounts=JSON.parse(json);
      assert.equal(accounts.length,5);assert.equal(accounts.some(a=>Object.hasOwn(a,'password')),false);
      assert.equal(batch,staffBatch);if(timeout)throw new Error('PRIVATE_DRIVER_DETAIL');
      return accounts.map((a,i)=>({BatchCode:staffBatch,Username:a.username,RoleCode:a.roleCode,UserId:String(badAck?1:i+1),Created:!replay}));}
  }};
}
test('staff preparation has five unique secrets and verifies the actual supported encoding without SQL',async()=>{
  const b=await bundle();await validateStaffBundle(b);
  assert.equal(new Set(b.accounts.map(a=>a.password)).size,5);
  assert.equal(new Set(b.accounts.map(a=>a.passwordHash)).size,5);
  assert.equal(b.accounts.every(a=>a.passwordHash.length===91),true);
  const altered=structuredClone(b);altered.accounts[0].password='a'.repeat(32);
  await assert.rejects(validateStaffBundle(altered),{code:'STAFF_BUNDLE_INVALID'});
});
test('unapproved import cannot open a gateway; missing marker cannot call seed',async()=>{
  const b=await bundle(),first=await fixture();const m=approval();m.approved=false;
  await assert.rejects(importStaff({bundle:b,approval:m,gateway:first.gateway}),{code:'STAFF_IMPORT_APPROVAL_REQUIRED'});
  assert.equal(first.state.open,0);
  const second=await fixture({wrongMarker:true});
  await assert.rejects(importStaff({bundle:b,approval:approval(),gateway:second.gateway}),{code:'STAFF_IMPORT_TARGET_UNVERIFIED'});
  assert.equal(second.state.seed,0);assert.equal(second.state.close,1);
});

test('maintenance Windows account accepts internal spaces but rejects control characters and delimiters',()=>{
  const m=approval();m.maintenancePrincipal='FIXTURE\\Maintenance Operator';
  assert.equal(validateStaffApproval(m),m);
  for(const name of ['FIXTURE\\ Operator','FIXTURE\\Operator ','FIXTURE\\Operator\n','FIXTURE\\Operator;secret','FIXTURE\\Operator\\Other']){
    assert.throws(()=>validateStaffApproval({...m,maintenancePrincipal:name}),{code:'STAFF_IMPORT_APPROVAL_REQUIRED'});
  }
});

test('SQL write failure exposes numeric diagnostics only and remains outcome unknown without retry',async()=>{
  const f=await fixture();let calls=0;
  f.gateway.seed=async()=>{calls++;throw Object.assign(new Error('PRIVATE_PASSWORD_HASH_AND_PAYLOAD'),{number:53706});};
  await assert.rejects(importStaff({bundle:await bundle(),approval:approval(),gateway:f.gateway}),error=>{
    assert.equal(error.code,'STAFF_IMPORT_OUTCOME_UNKNOWN');assert.equal(error.sqlErrorNumber,53706);
    assert.doesNotMatch(JSON.stringify(error)+error.message,/PRIVATE|PAYLOAD/);return true;
  });
  assert.equal(calls,1);assert.equal(f.state.close,1);
});
test('seed fixture acknowledges creation/replay with IDs only and no secret output',async()=>{
  for(const replay of [false,true]){
    const f=await fixture({replay});const result=await importStaff({bundle:await bundle(),approval:approval(),gateway:f.gateway});
    assert.equal(result.createdCount,replay?0:5);assert.equal(result.replayed,replay);
    assert.equal(/password|Hash|PRIVATE/i.test(JSON.stringify(result)),false);
    assert.equal(f.state.seed,1);assert.equal(f.state.close,1);
  }
});
test('timeout or mismatched seed ACK stays unknown and never retries automatically',async()=>{
  for(const options of [{timeout:true},{badAck:true}]){
    const f=await fixture(options);
    await assert.rejects(importStaff({bundle:await bundle(),approval:approval(),gateway:f.gateway}),{code:'STAFF_IMPORT_OUTCOME_UNKNOWN'});
    assert.equal(f.state.seed,1);assert.equal(f.state.close,1);
  }
});
