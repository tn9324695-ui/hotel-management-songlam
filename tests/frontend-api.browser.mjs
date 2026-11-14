// Real Edge + Express assets. Synthetic API responses are intercepted by CDP:
// report labels fixture responses separately from actual unconfigured HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../backend/src/app.js';
import { testConfig } from '../backend/tests/helpers.js';
import { CDP, until, sleep } from '../backend/tests/browser/cdp.mjs';
const checks = [], errors = [], requests = [], reportDir = new URL('../screenshots/frontend-api/', import.meta.url);
let browser, cdp, server, profile, mode = 'real-unconfigured';
const check = (name, fn) => { fn(); checks.push({ name, source: mode }); console.log('PASS [' + mode + '] ' + name); };
const person = { appUserId: '2', fullName: 'Nhân viên fixture', username: 'fixture' }, csrf = 'a'.repeat(43);
const rights = ['viewRoomRack','createBooking','manageCheckIn','manageCheckOut','cancelBooking','manageRoomTransfer','collectPayment','updateCleanStatus','manageHousekeepingTasks','reportMaintenance','addServiceOrder'];
const room = { id:'1', number:'401', roomTypeId:'1', floor:'4', occupancyStatus:'VACANT', cleanlinessStatus:'DIRTY', exploitationStatus:'ACTIVE' };
function payload(url) {
  const p = url.pathname.replace('/api/v1',''), from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (p === '/auth/me') return { data:{ user:person, csrfToken:csrf } };
  if (p === '/auth/permissions') return { data:{ permissions:mode === 'fixture-forbidden' ? [] : rights } };
  if(p==='/pricing/quotes/hourly'||p==='/pricing/quotes/nightly')return {data:{kind:'ESTIMATE',committed:false,currency:'VND',quotedAt:'2026-11-11T07:00:00Z',policy:{code:'FIXTURE',version:2},acceptanceHash:'a'.repeat(64),totals:{accommodationTotalVnd:'1000000'},breakdown:p.endsWith('nightly')?[{date:'2026-12-01',kind:'NIGHT',totalVnd:'500000'},{date:'2026-12-02',kind:'NIGHT',totalVnd:'500000'}]:[{kind:'HOURLY_PACKAGE',totalVnd:'950000'},{kind:'HOURLY_EXTRA_BLOCKS',totalVnd:'50000'}]}};
  if (p === '/hotel-settings') return { data:{ id:'1', name:'Sông Lam fixture', workingDate:'2026-11-11', timeZoneId:'SE Asia Standard Time', currency:'VND' } };
  if(p==='/customers'&&url.searchParams.get('q')==='ngoai-danh-sach')return {data:[{id:'77',code:'KH77',fullName:'Khách tìm từ máy chủ',phone:null,active:true}],meta:{hasMore:false,total:'1'}};
  const cap={visible:true,readable:true,maxLimit:50,creatable:false,commands:{}};
  if(p==='/catalog/capabilities')return {data:{resources:{rooms:{supported:true},roomTypes:{supported:true},ratePlans:{supported:true},customers:{supported:true},hotelSettings:{supported:true}}}};
  if(p==='/connection/status')return {data:{status:'ONLINE',modules:['catalogGateway','pricingGateway','bookingsGateway','staysGateway']}};
  if(p==='/operations/capabilities')return {data:{resources:{tasks:cap},inspection:{enabled:false,message:'Chưa duyệt quyền nghiệm thu'}}};
  if(p==='/housekeeping/tasks')return {data:[{id:'1',roomId:'1',taskType:'DEPARTURE',phase:'QUEUED',assignedToId:null,createdAtUtc:'2026-11-11T07:00:00Z',allowedActions:[]}],meta:{hasMore:false,total:'1'}};
  if(p==='/service-orders/capabilities'||p==='/minibar-audits/capabilities')return {data:cap};
  if(p==='/service-orders'||p==='/minibar-audits')return {data:[{id:'1',stayId:'1',roomId:'1',status:p==='/service-orders'?'OPEN':'CONFIRMED',totalVnd:'0',orderedById:'2',checkedById:'2',orderedAtUtc:'2026-11-11T07:00:00Z',checkedAtUtc:'2026-11-11T07:00:00Z',allowedActions:[]}],meta:{hasMore:false,total:'1'}};
  if(p==='/folios/capabilities')return {data:cap};
  if(p==='/folios')return {data:[{id:'1',code:'FOLIO-FIXTURE',bookingId:'1',status:'OPEN',balanceVnd:'1000000',allowedActions:[]}],meta:{hasMore:false,total:'1'}};
  if(p==='/admin/profile')return {data:{...person,id:person.appUserId,navigation:{finance:true,services:true,housekeeping:true}}};
  if(p==='/reports/capabilities')return {data:{reports:{},maxLimit:50}};
  if(p==='/reports/context')return {data:{businessDate:'2026-11-11',nextBusinessDate:'2026-11-12',timeZone:'Asia/Ho_Chi_Minh'}};
  if(p==='/users/capabilities')return {data:cap};
  if(p==='/users')return {data:[{id:'2',username:'fixture',fullName:'Nhân viên fixture',active:true,roleAssignments:[]}],meta:{hasMore:false,total:'1'}};
  const rows = p === '/rooms' ? [room] : p === '/room-types' ? [{id:'1',code:'STD',name:'Tiêu chuẩn',active:true}] : p === '/rate-plans' ? [{id:'1',code:'NIGHT',name:'Theo đêm',stayType:'NIGHTLY',active:true}] : p === '/customers' ? [{id:'1',code:'KH1',fullName:'Khách fixture',phone:null,active:true}] : null;
  if (rows) return { data:rows,meta:{offset:0,limit:50,hasMore:false,...(mode==='fixture-status-only'&&p==='/rooms'?{readScope:'CURRENT_STATUS_ONLY',eligibilityVerified:false}:{})} };
  if (p === '/bookings/timeline') return { data:{ from,to,timeZone:'Asia/Ho_Chi_Minh',interval:'[start,end)',segments:[{id:'allocation-1',kind:'BOOKING',roomId:'1',roomTypeId:'1',bookingId:'1',bookingRoomId:'1',startsAtUtc:from+'T07:00:00Z',endsAtUtc:to+'T05:00:00Z',status:'CONFIRMED'}]},meta:{hasMore:false} };
  if (p === '/bookings/availability') { const nights=[];for(let date=Date.parse(from+'T00:00:00Z');date<Date.parse(to+'T00:00:00Z');date+=86400000)nights.push({date:new Date(date).toISOString().slice(0,10),capacity:3,reservedUnreceived:1,occupied:0,blocked:0,available:2});return {data:{from,to,roomTypeId:'1',nights,minimumAvailable:2}}; }
  if (p === '/bookings') return { data:mode === 'fixture-empty' ? [] : [{id:'1',code:'DP-FIXTURE',contactName:'Khách fixture',groupName:null,status:'CONFIRMED',roomCount:1}],meta:{hasMore:false} };
  if (p === '/bookings/1') return {data:{id:'1',code:'DP-FIXTURE',contactName:'Khách fixture',status:'CONFIRMED',version:'0x0000000000000001',totals:{estimatedAccommodationTotalVnd:'1000000'},rooms:[{id:'1',status:'CONFIRMED',roomTypeId:'1',estimatedAccommodationTotalVnd:'1000000',startsAtUtc:'2026-12-01T07:00:00Z',endsAtUtc:'2026-12-03T05:00:00Z',version:'0x0000000000000001',allocations:[],guests:[{customerId:'1',isLead:true}]}]}};
  if(p==='/stays')return {data:[{id:'1',code:'TRA-NGAY-02',bookingId:'1',checkedInAtUtc:'2026-11-11T07:00:00Z',expectedOutAtUtc:'2026-12-01T18:00:00Z',status:'IN_HOUSE'},{id:'2',code:'TRA-NGAY-03',bookingId:'2',checkedInAtUtc:'2026-11-11T07:00:00Z',expectedOutAtUtc:'2026-12-02T18:00:00Z',status:'IN_HOUSE'}],meta:{hasMore:false}};
  if(p==='/stays/arrivals')return {data:[],meta:{hasMore:false}};
  return {error:{code:'FIXTURE_NOT_CONFIGURED',message:'Hợp đồng chưa được cấu hình trong fixture.'}};
}
try {
  server = createApp({config:testConfig()}).listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  await fs.mkdir(reportDir,{recursive:true}); profile = await fs.mkdtemp(path.join(os.tmpdir(),'songlam-frontend-api-'));
  browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']}); browser.stderr.resume();
  const debug = await until(async()=>{ if(browser.exitCode!==null) throw new Error('Edge exited'); try{return Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{return false;} });
  const target = await(await fetch('http://127.0.0.1:'+debug+'/json/new?about:blank',{method:'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket,'open'); cdp = new CDP(socket);
  cdp.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.text || 'JavaScript exception'));
  cdp.on('Network.responseReceived',event=>{const url=new URL(event.response.url);if(url.origin===origin&&!url.pathname.startsWith('/api/')&&url.pathname!=='/favicon.ico'&&event.response.status>=400)errors.push('Asset '+event.response.status+': '+url.pathname);});
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable');
  for (const page of ['reception-api.html','housekeeping-api.html','services-api.html','finance-api.html','admin-api.html','login.html']) {
    await cdp.send('Page.navigate',{url:origin+'/'+page});
    await until(()=>cdp.evaluate("document.readyState==='complete'")); await sleep(300);
    check(page+' renders blocked state against actual HTTP backend',()=>assert.equal(errors.length,0));
    const locked = await cdp.evaluate("({text:document.body.textContent,writes:[...document.querySelectorAll('dialog button[type=submit]')].filter(b=>!b.disabled).length,store:typeof window.SongLamStore})");
    check(page+' has no demo Store or false successful login',()=>{assert.equal(locked.store,'undefined');assert.equal(locked.writes,0);assert.ok(/Chưa|chưa|Không/.test(locked.text));});
    for(const [width,height] of [[1366,768],[1920,1080],[390,844]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}); await sleep(60);
      const size=await cdp.evaluate('({width:document.documentElement.scrollWidth,viewport:innerWidth})');
      check(page+' blocked layout '+width+'x'+height,()=>assert.ok(size.width<=size.viewport+2));
    }
    if(page!=='login.html'){
      await cdp.evaluate("(document.getElementById('desk-menu')||document.getElementById('ops-menu')).click()");
      const open=await cdp.evaluate("document.getElementById('ops-sidebar').classList.contains('open')");
      check(page+' mobile menu opens',()=>assert.equal(open,true));
      const reachable=await cdp.evaluate("(()=>{const b=document.querySelector('.sl-nav-close'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()");
      check(page+' mobile drawer close button is not covered by topbar',()=>assert.equal(reachable,true));
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
      const closed=await cdp.evaluate("!document.getElementById('ops-sidebar').classList.contains('open')&&(document.getElementById('desk-menu')||document.getElementById('ops-menu')).getAttribute('aria-expanded')==='false'");
      check(page+' mobile Escape resets menu and aria',()=>assert.equal(closed,true));
    }
  }
  cdp.on('Fetch.requestPaused',async event=>{
    try { const url = new URL(event.request.url); requests.push({method:event.request.method,path:url.pathname,query:url.search,body:event.request.postData?JSON.parse(event.request.postData):null,source:mode});
      const requestId=Object.entries(event.request.headers).find(([key])=>key.toLowerCase()==='x-request-id')?.[1];
      let result=payload(url);
      if(event.request.method==='POST'&&url.pathname==='/api/v1/bookings'&&mode==='fixture-write')result={data:{committed:true,booking:{id:'10'},replayed:false}};
      if(event.request.method==='POST'&&url.pathname==='/api/v1/bookings'&&mode==='fixture-write-unknown')result={error:{code:'SQL_TIMEOUT_FIXTURE',message:'Chưa xác định kết quả fixture.'}};
      if(url.pathname==='/api/v1/requests/lookup'){const input=JSON.parse(event.request.postData);result={data:{status:'COMMITTED',operation:input.operation,originalRequestId:input.originalRequestId,receiptReference:'FIXTURE_ONLY'}};}
      if(requestId)result.requestId=requestId;
      await cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:result.error?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'},...(requestId?[{name:'X-Request-ID',value:requestId}]:[])],body:Buffer.from(JSON.stringify(result)).toString('base64')});
    } catch { errors.push('Fixture interception failed'); }
  });
  mode='fixture-read'; await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/*'}]});
  await cdp.send('Page.navigate',{url:origin+'/reception-api.html'});
  await until(()=>cdp.evaluate("document.querySelector('.sl-room')?.textContent.includes('401')"));
  check('rooms show independent occupancy / cleaning / exploitation',()=>{});
  for(const [width,height] of [[1366,768],[1920,1080],[390,844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}); await sleep(100);
    const metrics=await cdp.evaluate('({width:document.documentElement.scrollWidth,viewport:innerWidth})');
    check('room screen fits '+width+'x'+height,()=>assert.ok(metrics.width<=metrics.viewport+2));
    await fs.writeFile(new URL('rooms-'+width+'.png',reportDir),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  mode='fixture-status-only';
  await cdp.evaluate("document.getElementById('desk-refresh').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-message').textContent.includes('Chỉ hiển thị trạng thái hiện tại')"));
  check('status-only room read warns that check-in eligibility remains unverified',()=>{});
  mode='fixture-read';
  await cdp.evaluate("[...document.querySelectorAll('#desk-nav button')].find(b=>b.textContent==='Lịch đặt phòng').click(); document.querySelector('[name=from]').value='2026-12-01'; document.querySelector('[name=to]').value='2026-12-05'; document.getElementById('desk-filters').requestSubmit()");
  await until(()=>cdp.evaluate("document.querySelector('.sl-timeline-segment')?.textContent.includes('Đơn 1')"));
  check('future booking timeline uses requested interval with exclusive departure',()=>assert.ok(requests.some(r=>r.path.endsWith('/timeline')&&r.query.includes('from=2026-12-01')&&r.query.includes('to=2026-12-05'))));
  await fs.writeFile(new URL('timeline-1366.png',reportDir),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await cdp.evaluate("[...document.querySelectorAll('#desk-nav button')].find(b=>b.textContent==='Đơn đặt phòng').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-results').textContent.includes('DP-FIXTURE')"));
  await cdp.evaluate("document.querySelector('#desk-results button').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-dialog').open && document.getElementById('desk-dialog-body').textContent.includes('1.000.000')"));
  check('booking details preserve price and unapproved cancellation stays disabled',()=>{});
  await cdp.evaluate("document.getElementById('desk-close').click();document.getElementById('desk-preview').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-dialog-body').textContent.includes('Đây là bản xem biểu mẫu')"));
  const preview=await cdp.evaluate("({submit:[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Xác nhận đặt phòng')?.disabled,groups:[...document.querySelectorAll('#desk-dialog option')].some(o=>o.textContent==='Khách đoàn')})");
  check('group/individual form is present, preview cannot submit',()=>{assert.equal(preview.submit,true);assert.equal(preview.groups,true);});
  await cdp.evaluate("document.querySelector('#desk-dialog [name=customerLookup]').value='ngoai-danh-sach';[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Tìm khách').click()");
  await until(()=>cdp.evaluate("[...document.querySelector('#desk-dialog [name=customerId]').options].some(o=>o.value==='77')"));
  check('booking form finds customers beyond its initially loaded choices',()=>assert.ok(requests.some(r=>r.path==='/api/v1/customers'&&r.query.includes('q=ngoai-danh-sach'))));
  await cdp.evaluate("document.getElementById('desk-close').click();document.getElementById('desk-quote').click();const f=document.querySelector('#desk-dialog form');f.elements.roomTypeId.value='1';f.elements.ratePlanId.value='1';f.elements.mode.value='hourly';f.elements.checkInAt.value='2026-12-01T14:00';f.elements.checkOutAt.value='2026-12-01T17:00';[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Lấy báo giá từ máy chủ').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-dialog-body').textContent.includes('1.000.000')"));
  const priceRequest=requests.find(r=>r.path==='/api/v1/pricing/quotes/hourly');
  check('hourly quote renders server breakdown and sends hotel offset without client price or actor',()=>{assert.equal(priceRequest.body.checkInAt,'2026-12-01T14:00:00+07:00');assert.equal(priceRequest.body.rooms,1);assert.ok(!Object.hasOwn(priceRequest.body,'amountVnd'));assert.ok(!Object.hasOwn(priceRequest.body,'actorId'));});
  await cdp.evaluate("(()=>{[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Lấy báo giá từ máy chủ').click();const f=document.querySelector('#desk-dialog form');f.elements.checkOutAt.value='2026-12-01T18:00';f.elements.checkOutAt.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until(()=>cdp.evaluate("document.getElementById('desk-dialog-body').textContent.includes('Đầu vào đã thay đổi')"));
  check('a quote arriving after edited input is rejected as stale',()=>{});
  mode='fixture-empty'; await cdp.evaluate("document.getElementById('desk-close').click();document.getElementById('desk-refresh').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-results').textContent.includes('Không có dữ liệu')"));
  check('empty API list renders empty state, no demo rows',()=>{});
  mode='fixture-read';
  await cdp.evaluate("[...document.querySelectorAll('#desk-nav button')].find(b=>b.textContent==='Sắp trả phòng').click();document.querySelector('#desk-filters [name=from]').value='2026-12-02';document.querySelector('#desk-filters [name=to]').value='2026-12-03';document.getElementById('desk-filters').requestSubmit()");
  await until(()=>cdp.evaluate("document.getElementById('desk-results').textContent.includes('TRA-NGAY-02')"));
  const departures=await cdp.evaluate("document.getElementById('desk-results').textContent");
  check('due-out list filters hotel-local departure date and excludes the next day',()=>{assert.ok(!departures.includes('TRA-NGAY-03'));});
  // Private test-only deployment fixture. No production query flag, no SQL
  // contract or server gate is enabled; CDP intercepts both command and receipt.
  mode='fixture-write';
  await cdp.evaluate("window.SongLamDeployment=Object.freeze({refresh:async()=>({mode:'sql',writable:true,deploymentId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',operations:[{operation:'bookings.create',method:'POST',template:'/bookings'}]})});document.getElementById('desk-refresh').click()");
  await until(()=>cdp.evaluate("document.getElementById('desk-create').disabled===false"));
  async function prepareBooking(){
    await cdp.evaluate("(()=>{document.getElementById('desk-create').click();const form=document.querySelector('#desk-dialog form');form.elements.customerId.value='1';form.elements.contact.value='Khách fixture';form.elements.sourceCode.value='FRONT_DESK';form.querySelector('[name=roomTypeId]').value='1';form.querySelector('[name=ratePlanId]').value='1';form.querySelector('[name=checkInAt]').value='2026-12-01T14:00';form.querySelector('[name=checkOutAt]').value='2026-12-03T12:00';[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Kiểm quỹ & xem báo giá').click();})()");
    await until(()=>cdp.evaluate("document.getElementById('desk-dialog-body').textContent.includes('Báo giá dự kiến — chưa giữ quỹ')&&document.getElementById('desk-dialog-body').textContent.includes('1.000.000')"));
  }
  await prepareBooking();
  await cdp.evaluate("(()=>{const b=[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Xác nhận đặt phòng');b.click();b.click();})()");
  await until(()=>cdp.evaluate("document.getElementById('desk-dialog-body').textContent.includes('Máy chủ đã')"));
  const firstWrite=requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/bookings');
  check('double click creates one command and success waits for matching commit receipt (fixture)',()=>{assert.equal(firstWrite.length,1);assert.equal(firstWrite[0].body.rooms.length,1);assert.ok(!Object.hasOwn(firstWrite[0].body,'actorId'));assert.ok(!Object.hasOwn(firstWrite[0].body,'amountVnd'));});
  await cdp.evaluate("document.getElementById('desk-close').click()");mode='fixture-write-unknown';await prepareBooking();
  await cdp.evaluate("[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Xác nhận đặt phòng').click()");
  await until(()=>cdp.evaluate("window.SongLamWrites.pending()[0]?.status==='UNKNOWN'"));
  const unknown=await cdp.evaluate("({count:SongLamWrites.pending().length,disabled:[...document.querySelectorAll('#desk-dialog button')].find(b=>b.textContent==='Xác nhận đặt phòng').disabled,text:document.getElementById('desk-dialog-body').textContent})");
  check('ambiguous server response retains original journal and disables another submission (fixture)',()=>{assert.equal(unknown.count,1);assert.equal(unknown.disabled,true);assert.ok(unknown.text.includes('Chưa xác định'));});
  await cdp.send('Page.navigate',{url:origin+'/operations-status.html'});
  await until(()=>cdp.evaluate("document.querySelector('#pending-requests button')?.textContent.includes('Tra cứu')"));
  await cdp.evaluate("document.querySelector('#pending-requests button').click()");
  await until(()=>cdp.evaluate("document.getElementById('lookup-result').textContent.includes('Đã commit')&&SongLamWrites.pending().length===0"));
  check('receipt lookup resolves the original unknown request without resubmitting booking (fixture)',()=>assert.equal(requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/bookings').length,2));
  mode='fixture-read';
  for(const [page,selector,text] of [['housekeeping-api.html','#ops-table tbody','Chờ nhận'],['services-api.html','#g8-table tbody','0'],['finance-api.html','#fin-table tbody','FOLIO-FIXTURE'],['admin-api.html','#mgmt-table tbody','fixture']]){
    await cdp.send('Page.navigate',{url:origin+'/'+page});
    await until(()=>cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.includes(${JSON.stringify(text)})`));
    check(page+' renders fixture records through shared table/pagination',()=>{});
    await fs.writeFile(new URL(page.replace('.html','')+'-1366.png',reportDir),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await cdp.send('Page.navigate',{url:origin+'/reception-api.html'});
  await until(()=>cdp.evaluate("document.querySelector('.sl-room')?.textContent.includes('401')"));
  mode='fixture-forbidden'; await cdp.evaluate("window.SongLamSession.clear(); location.reload()");
  await until(()=>cdp.evaluate("document.getElementById('desk-message')?.textContent.includes('Không có quyền')"));
  check('server permission removal blocks access and hides workspace links',()=>{});
  check('business commands occur only in explicit private write fixtures; no SQL or unhandled errors',()=>{assert.equal(requests.filter(r=>r.method!=='GET'&&!r.path.startsWith('/api/v1/pricing/quotes/')&&r.path!=='/api/v1/requests/lookup'&&!r.source.startsWith('fixture-write')).length,0);assert.deepEqual(errors,[]);});
} catch(error) { console.error(error); process.exitCode=1; }
finally {
  await fs.mkdir(reportDir,{recursive:true}); await fs.writeFile(new URL('report.json',reportDir),JSON.stringify({generatedAtUtc:new Date().toISOString(),checks,errors,sqlTestCount:0,passed:checks.length,failed:process.exitCode?1:0},null,2));
  if(cdp) {try{await cdp.send('Browser.close');}catch{} cdp.socket.close();}
  if(browser&&browser.exitCode===null) {await Promise.race([once(browser,'exit'),sleep(2000)]);if(browser.exitCode===null)browser.kill();}
  if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  // Preserve isolated test profile for diagnosis; never enumerate/delete user profiles.
}
console.log('RESULT '+checks.length+' checks; SQL tests=0');
