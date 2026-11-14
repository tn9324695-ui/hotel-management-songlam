// Pure frontend services. Fixtures only; no cookies, storage, database or server.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function setup() {
  let actor = '2', permissions = ['viewRoomRack'], fail = false; const calls = [], events = [];
  const root = { dispatchEvent: event => events.push(event.type), location:{assign(){}}, SongLamHttp:{getClient:()=>({request:async path=>{
    calls.push(path); await Promise.resolve(); if(fail) throw new Error('Unavailable');
    return {data:path==='/auth/me'?{user:{appUserId:actor},csrfToken:'a'.repeat(43)}:{permissions}};
  }}), ApiError:class extends Error {constructor(message,fields){super(message);Object.assign(this,fields);}} } };
  for(const key of ['localStorage','sessionStorage']) Object.defineProperty(root,key,{get(){throw new Error('Storage forbidden');}});
  const context = vm.createContext({window:root,CustomEvent:class {constructor(type){this.type=type;}},Intl,Date,BigInt});
  for(const file of ['session-service.js','permission-service.js','ui-service.js']) vm.runInContext(fs.readFileSync(new URL('../js/services/'+file,import.meta.url),'utf8'),context);
  return {root,calls,events,actor:value=>{actor=value;},rights:value=>{permissions=value;},fail:()=>{fail=true;}};
}
test('session requests are coalesced and permissions come only from server responses',async()=>{
  const f=setup(); await Promise.all([f.root.SongLamSession.restore(),f.root.SongLamSession.restore()]);
  assert.deepEqual(f.calls,['/auth/me','/auth/permissions','/auth/me']); assert.equal(f.root.SongLamPermissions.has('viewRoomRack'),true);
  f.rights([]); await f.root.SongLamSession.restore(); assert.equal(f.root.SongLamPermissions.has('viewRoomRack'),false);
});
test('session failure clears permissions; changed actor cannot obtain old-page CSRF',async()=>{
  const f=setup(); await f.root.SongLamSession.restore(); f.actor('3');
  await assert.rejects(f.root.SongLamSession.csrf('2'),{code:'SESSION_CHANGED'}); assert.equal(f.root.SongLamSession.current(),null);
  f.fail(); await assert.rejects(f.root.SongLamSession.restore()); assert.equal(f.root.SongLamPermissions.has('viewRoomRack'),false);
});
test('shared room-rack access does not override each staff landing page (permission fixtures only)',async()=>{
  const f=setup();
  for(const [rights,home] of [
    [['systemConfig','viewRoomRack'],'admin-api.html'],
    [['systemConfig','createBooking','collectPayment','manageHousekeepingTasks','viewRoomRack'],'admin-api.html'],
    [['createBooking','manageCheckIn','collectPayment','reportMaintenance','viewRoomRack'],'reception-api.html'],
    [['collectPayment','manageCheckOut','viewRoomRack'],'finance-api.html'],
    [['manageHousekeepingTasks','reportMaintenance','updateCleanStatus','viewRoomRack'],'housekeeping-api.html']
  ]){
    f.rights(rights);await f.root.SongLamSession.restore();
    assert.equal(f.root.SongLamPermissions.home(),home);
  }
});
test('hotel dates are independent of browser timezone and reject impossible or unconfirmed dates',()=>{
  const {root}=setup(); assert.equal(root.SongLamUi.hotelInstant('2026-12-01T14:00','SE Asia Standard Time'),'2026-12-01T14:00:00+07:00');
  assert.throws(()=>root.SongLamUi.hotelInstant('2026-02-30T14:00','SE Asia Standard Time'));
  assert.throws(()=>root.SongLamUi.hotelInstant('2026-12-01T14:00',undefined));
  assert.equal(root.SongLamUi.hotelDate('2026-12-01T18:00:00Z','SE Asia Standard Time'),'2026-12-02');
  assert.equal(root.SongLamUi.hotelDate('2026-12-02T18:00:00Z','Asia/Ho_Chi_Minh'),'2026-12-03');
});
test('VND formatting preserves bigint precision and missing money is never invented as zero',()=>{
  const {root}=setup(); assert.equal(root.SongLamUi.money('9007199254740993'),'9.007.199.254.740.993 ₫');
  assert.equal(root.SongLamUi.money(undefined),'Chưa có giá');
  for(const value of [null,'',false,9007199254740992])assert.equal(root.SongLamUi.money(value),'Chưa có giá');
});
test('write visibility requires current server permission, deployment acceptance and an available empty pending journal',async()=>{
  const f=setup(); await f.root.SongLamSession.restore(); let probes=0;
  f.root.SongLamDeployment={async refresh(){probes++;return {mode:'sql',writable:true,operations:[{method:'POST',template:'/bookings'}]};}};
  assert.equal(await f.root.SongLamPermissions.canWrite('POST','/bookings',['viewRoomRack']),false); assert.equal(probes,0);
  f.root.SongLamWrites={pending:()=>[{originalRequestId:'fixture-only'}]};
  assert.equal(await f.root.SongLamPermissions.canWrite('POST','/bookings',['viewRoomRack']),false); assert.equal(probes,0);
  f.root.SongLamWrites={pending:()=>[]};
  assert.equal(await f.root.SongLamPermissions.canWrite('POST','/bookings',['viewRoomRack']),true);
  assert.equal(await f.root.SongLamPermissions.canWrite('POST','/payments',['viewRoomRack']),false);
});
test('malformed or committed quote cannot be displayed as a valid estimate',()=>{
  const {root}=setup(), q={kind:'ESTIMATE',committed:false,currency:'VND',quotedAt:'2026-11-11T07:00:00Z',policy:{code:'FIXTURE',version:1},totals:{accommodationTotalVnd:'1000000'},breakdown:[{kind:'NIGHT',totalVnd:'1000000'}]};
  assert.equal(root.SongLamUi.quote(q),q);
  for(const change of [{committed:true},{currency:'USD'},{policy:{}},{breakdown:[]},{totals:{accommodationTotalVnd:null}}])assert.throws(()=>root.SongLamUi.quote({...q,...change}));
});

function sessionWith(request){
  const root={dispatchEvent(){},addEventListener(){},SongLamHttp:{getClient:()=>({request})}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/services/session-service.js',import.meta.url),'utf8'),{window:root,CustomEvent:class{}});
  return root.SongLamSession;
}
test('cleared in-flight restore cannot revive an old session or clear a newer one (fixtures)',async()=>{
  let releaseOld,oldRightsStarted=false,person='1';
  const oldRights=new Promise(resolve=>{releaseOld=resolve;});
  const session=sessionWith(async route=>{
    if(route==='/auth/me')return {data:{user:{appUserId:person},csrfToken:(person==='1'?'a':'b').repeat(43)}};
    if(person==='1'){oldRightsStarted=true;return oldRights;}
    return {data:{permissions:['systemConfig']}};
  });
  const first=session.restore();
  for(let i=0;i<10&&!oldRightsStarted;i++)await Promise.resolve();
  session.clear();person='2';await session.restore();
  releaseOld({data:{permissions:['viewRoomRack']}});
  await assert.rejects(first,{code:'SESSION_CHANGED'});
  assert.equal(session.current().user.appUserId,'2');
  assert.equal(session.current().permissions.includes('systemConfig'),true);
});
test('cookie identity change between me and permissions cannot publish mixed user/rights (fixture)',async()=>{
  let meCalls=0;
  const session=sessionWith(async route=>route==='/auth/permissions'?{data:{permissions:['systemConfig']}}:
    {data:{user:{appUserId:++meCalls===1?'1':'2'},csrfToken:(meCalls===1?'a':'b').repeat(43)}});
  await assert.rejects(session.restore(),{code:'SESSION_CHANGED'});
  assert.equal(session.current(),null);
});
