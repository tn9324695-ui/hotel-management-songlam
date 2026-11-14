// Provider-shaped fixture only. No SQL connection or G7 readiness verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCatalogSqlGateway} from '../src/adapters/sql/catalog-gateway.js';
import {createCatalogService} from '../src/modules/catalog/service.js';
import {mintActor} from '../src/modules/auth/security.js';
import {fixtureTypes,authFixture} from './fixtures/auth-fixture.js';
const actor=()=>mintActor({appUserId:'1',username:'fixture',fullName:'Fixture',active:true,securityVersion:'0x0000000000000001',permissions:['viewRoomRack']});
function setup(patch={}){
  const contract={...JSON.parse(fs.readFileSync(new URL('../../deploy/catalog-read.example.json',import.meta.url),'utf8')),approved:true,approvalReference:'FIXTURE_ONLY',...patch};
  let executed=0;
  const pool={connected:true,request(){return {input(){return this;},async execute(){executed++;return {recordsets:[[{RoomId:1,Number:'101',RoomTypeId:1,FloorLabel:'1',StayStatus:'VACANT',CleanStatus:'DIRTY',ExploitationStatus:'ACTIVE'}],[{TotalCount:'1'}]]};}};}};
  return {gateway:createCatalogSqlGateway({pool,types:{...fixtureTypes,Int:'Int'},contract,environment:'test'}),executed:()=>executed};
}
test('explicit current-status contract exposes three states with an unverified eligibility marker',async()=>{
  const f=setup();const result=await createCatalogService({gateway:f.gateway}).list(actor(),'rooms',{},'fixture-read-1');
  assert.equal(f.executed(),1);assert.equal(result.data[0].occupancyStatus,'VACANT');assert.equal(result.data[0].cleanlinessStatus,'DIRTY');
  assert.equal(result.data[0].exploitationStatus,'ACTIVE');assert.equal(result.meta.eligibilityVerified,false);
  assert.equal(result.meta.readScope,'CURRENT_STATUS_ONLY');assert.equal(Object.hasOwn(result.data[0],'isAvailable'),false);
});
test('partial/missing scope cannot bypass the prior eligibility gate or execute SQL',async()=>{
  for(const patch of [{roomReadScope:undefined},{roomEligibility:undefined}]){
    const f=setup(patch);
    await assert.rejects(createCatalogService({gateway:f.gateway}).list(actor(),'rooms',{},'fixture-read-2'),{code:'ROOM_ELIGIBILITY_CONTRACT_MISSING'});
    assert.equal(f.executed(),0);
  }
});

test('catalog capabilities filter by server actor and cannot claim room eligibility or missing contracts',()=>{
  const f=setup(),service=createCatalogService({gateway:f.gateway});
  const caps=service.capabilities(actor());assert.equal(caps.readOnly,true);
  assert.equal(caps.resources.rooms.supported,true);assert.equal(caps.resources.rooms.eligibilityVerified,false);
  assert.equal(caps.resources.ratePlans.supported,false);assert.equal(Object.hasOwn(caps.resources,'services'),false);
  assert.doesNotMatch(JSON.stringify(caps),/procedure|approvalReference|AppUserId|PasswordHash/);
  assert.equal(f.executed(),0);
  assert.throws(()=>service.capabilities({appUserId:'1',permissions:['viewRoomRack']}),{code:'UNAUTHENTICATED'});
  assert.equal(createCatalogService({gateway:createCatalogSqlGateway()}).capabilities(actor()).resources.rooms.supported,false);
});

test('catalog capability HTTP endpoint requires a session and rejects client-supplied role',async t=>{
  const f=await authFixture(t);
  assert.equal((await f.request('/api/v1/catalog/capabilities')).status,401);
  const login=await f.login();const response=await f.request('/api/v1/catalog/capabilities',login);
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.readOnly,true);
  assert.equal((await f.request('/api/v1/catalog/capabilities?role=admin',login)).status,400);
});
