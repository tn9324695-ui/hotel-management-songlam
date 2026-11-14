// Real HTTP/SQL reconciliation against the exact approved foundation payload.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
if(process.argv.slice(2).join(' ')!=='--approved=USER-FOUNDATION-011')throw new Error('EXPLICIT_APPROVAL_REQUIRED');
const dir=new URL('./private/foundation-base420-20261112/',import.meta.url),base='http://127.0.0.1:8093';
const payload=JSON.parse(readFileSync(new URL('payload.local.json',dir),'utf8'));
const bundle=JSON.parse(readFileSync(new URL('./private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
let cookie='',csrf='',last;const checks=[],roles=[];
async function call(path,method='GET',body){const r=await fetch(base+'/api/v1'+path,{method,signal:AbortSignal.timeout(10000),headers:{...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...(method==='POST'?{origin:base,'content-type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const json=await r.json();last={path,status:r.status,code:json.error?.code||null,requestId:json.requestId};return {status:r.status,json,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function list(path,expected){const rows=[];for(let offset=0;;offset+=200){const r=await call(path+'?limit=200&offset='+offset);assert.equal(r.status,200);assert.equal(r.json.meta.total,String(expected));rows.push(...r.json.data);if(!r.json.meta.hasMore)break;if(offset>1000)throw new Error('PAGE_LIMIT');}assert.equal(rows.length,expected);assert.equal(new Set(rows.map(r=>r.id||r.date)).size,expected);return rows;}
const decimal=v=>v===null?null:String(v).replace(/\.0+$/,'');
try{
 for(const account of bundle.accounts){
  cookie='';csrf='';const login=await call('/auth/login','POST',{username:account.username,password:account.password});assert.equal(login.status,200);cookie=login.cookie;csrf=login.json.data.csrfToken;
  const rights=(await call('/auth/permissions')).json.data.permissions;
  const types=await list('/room-types',11),typeId=new Map(types.map(t=>[t.code,t.id]));
  for(const source of payload.roomTypes){const row=types.find(t=>t.code===source.code);assert.ok(row);for(const key of ['name','standardOccupancy','maxOccupancy','bedConfiguration','description','active'])assert.equal(row[key],source[key]);assert.equal(decimal(row.areaM2),decimal(source.areaM2));}
  checks.push('ALL_ROOM_TYPES_'+account.roleCode);
  const rooms=await list('/rooms',420);for(const source of payload.rooms){const row=rooms.find(r=>r.number===source.number);assert.ok(row);assert.equal(row.roomTypeId,typeId.get(source.roomTypeCode));assert.equal(row.floor,source.floor);assert.equal(row.cleanlinessStatus,source.cleanlinessStatus);assert.equal(row.exploitationStatus,'ACTIVE');assert.equal(row.occupancyStatus,'VACANT');}
  for(const number of payload.quarantinedRooms)assert.equal(rooms.some(r=>r.number===number),false);checks.push('ALL_ROOMS_AND_QUARANTINE_'+account.roleCode);
  for(const [state,total] of [['CLEAN',405],['DIRTY',9],['CLEANING',6]]){const r=await call('/rooms?cleanlinessStatus='+state+'&limit=1');assert.equal(r.status,200);assert.equal(r.json.meta.total,String(total));}checks.push('INDEPENDENT_ROOM_FILTER_TOTALS_'+account.roleCode);
  const h=await call('/hotel-settings');assert.equal(h.status,200);for(const key of ['name','address','phone','email','currency','timeZoneId','workingDate','checkInTime','checkOutTime'])assert.equal(h.json.data[key],payload.hotel[key]);checks.push('HOTEL_SETTINGS_'+account.roleCode);
  const first=await call('/rooms/'+rooms[0].id);assert.equal(first.status,200);assert.equal(first.json.data.number,rooms[0].number);checks.push('ROOM_DETAIL_'+account.roleCode);
  if(rights.some(p=>['addServiceOrder','manageHousekeepingTasks'].includes(p))){const services=await list('/services',15);for(const source of payload.services){const s=services.find(r=>r.code===source.code);assert.ok(s);for(const key of ['name','category','unit','priceVnd','active'])assert.equal(s[key],source[key]);}checks.push('ALL_SERVICE_PRICES_'+account.roleCode);}else{assert.equal((await call('/services')).status,403);checks.push('SERVICE_PERMISSION_DENIED_'+account.roleCode);}
  const day=await call('/business-days/current');assert.equal(day.status,rights.includes('viewDailyRevenue')?200:403);if(day.status===200){assert.equal(day.json.data.date,'2026-10-11');assert.equal(day.json.data.status,'OPEN');}checks.push('BUSINESS_DAY_'+account.roleCode);
  assert.equal((await call('/auth/logout','POST',{})).status,200);cookie='';csrf='';roles.push(account.roleCode);
 }
 const report={status:'FOUNDATION_HTTP_RECONCILIATION_PASSED',roles,checks,roomsMatched:420,roomTypesMatched:11,servicesMatched:15,quarantined:payload.quarantinedRooms,businessWritesEnabled:false,fixture:false,completedAtUtc:new Date().toISOString()};
 writeFileSync(new URL('http-reconciliation.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,roles:roles.length}));
}catch{const failure=last;try{if(cookie)await call('/auth/logout','POST',{});}catch{}
 writeFileSync(new URL('http-reconciliation-failure.json',dir),JSON.stringify({status:'NOT_PASSED',last:failure,checksPassed:checks.length,rolesCompleted:roles.length},null,2)+'\n');console.log(JSON.stringify({status:'NOT_PASSED',last:failure,checksPassed:checks.length,rolesCompleted:roles.length}));process.exitCode=1;
}
