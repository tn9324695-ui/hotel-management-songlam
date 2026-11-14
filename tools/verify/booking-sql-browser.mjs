// Real Chrome -> same-origin frontend -> Express -> dedicated SQL pool.
// Explicitly labelled test customer/booking only. No interception/mock/provider.
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn}from'node:child_process';import{once}from'node:events';import assert from'node:assert/strict';
import{CDP,until,sleep}from'../../backend/tests/browser/cdp.mjs';
if(process.argv.slice(2).join(' ')!=='--approved=USER-20261112-REAL-PRICING-CUSTOMER-BOOKING')throw new Error('REAL_BOOKING_TEST_APPROVAL_REQUIRED');
const origin='http://127.0.0.1:8093',out=new URL('../../screenshots/booking-sql/',import.meta.url),privateDir=new URL('../sql/private/booking012/',import.meta.url),progressFile=new URL('ui-progress.json',privateDir);
let progress;try{progress=JSON.parse(await fs.readFile(progressFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;progress={batch:'SONGLAM_TEST_BOOKING012_'+new Date().toISOString().replace(/\D/g,'').slice(0,14)};}
const report={source:'REAL_BROWSER_HTTP_SQL_BOOKING',startedAtUtc:new Date().toISOString(),batch:progress.batch,checks:[],requests:[],errors:[],writes:[]};
let browser,cdp,profile;
const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};const saveProgress=()=>fs.writeFile(progressFile,JSON.stringify(progress,null,2));
try{
 const credentials=JSON.parse((await fs.readFile(new URL('../sql/private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const account=credentials.accounts.find(a=>a.roleCode==='receptionist');if(!account)throw new Error('RECEPTIONIST_REQUIRED');
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'songlam-booking-sql-'));
 browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const port=await until(async()=>{try{return Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{return false;}});
 const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json(),socket=new WebSocket(tab.webSocketDebuggerUrl);await once(socket,'open');cdp=new CDP(socket);
 cdp.on('Runtime.exceptionThrown',()=>report.errors.push('JAVASCRIPT_EXCEPTION'));
 cdp.on('Network.requestWillBeSent',e=>{const u=new URL(e.request.url);if(u.origin!==origin||!['/api/v1/customers','/api/v1/bookings','/api/v1/bookings/groups'].includes(u.pathname)||e.request.method!=='POST')return;
  const header=name=>Object.entries(e.request.headers).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];
  report.writes.push({path:u.pathname,requestId:header('X-Request-ID'),idempotencyKey:header('Idempotency-Key'),body:JSON.parse(e.request.postData||'{}')});});
 cdp.on('Network.responseReceived',e=>{const u=new URL(e.response.url);if(u.origin!==origin)return;if(u.pathname.startsWith('/api/'))report.requests.push({path:u.pathname,status:e.response.status,requestId:Object.entries(e.response.headers).find(([key])=>key.toLowerCase()==='x-request-id')?.[1]});else if(e.response.status>=400)report.errors.push('ASSET_ERROR');});
 await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Network.enable');await fs.mkdir(out,{recursive:true});
 await cdp.send('Page.navigate',{url:origin+'/login.html'});await until(()=>cdp.evaluate("document.getElementById('login-fields')?.disabled===false"));
 await cdp.evaluate(`document.getElementById('username').value=${JSON.stringify(account.username)};document.getElementById('password').value=${JSON.stringify(account.password)};document.getElementById('login-form').requestSubmit();true`);
 await until(()=>cdp.evaluate("location.pathname.endsWith('/reception-api.html')&&Boolean(window.SongLamSession?.current())&&document.getElementById('desk-results')?.getAttribute('aria-busy')==='false'"));
 check('SQL_LOGIN_RECEPTIONIST',true);check('SCOPED_REAL_SQL_WRITES_ENABLED',await cdp.evaluate("SongLamDeployment.snapshot().testOnly===true&&SongLamDeployment.snapshot().writable===true&&!document.getElementById('desk-create').disabled"));
 await cdp.evaluate("document.getElementById('desk-create').click();true");await until(()=>cdp.evaluate("document.querySelector('#desk-dialog-body [name=customerId]')&&[...document.querySelectorAll('#desk-dialog-body button')].some(b=>b.textContent==='Xác nhận đặt phòng')"));
 if(!progress.customerId){
  await cdp.evaluate(`(()=>{const p=document.querySelector('#desk-dialog-body details');p.open=true;p.querySelector('[name=newCustomerName]').value=${JSON.stringify(progress.batch)};p.querySelector('[name=newCustomerTest]').checked=true;[...p.querySelectorAll('button')].find(b=>b.textContent==='Lưu khách vào SQL và chọn').click();return true;})()`);
  await until(()=>cdp.evaluate("Boolean(document.querySelector('#desk-dialog-body select[name=customerId]').value)"));
  progress.customerId=await cdp.evaluate("document.querySelector('#desk-dialog-body select[name=customerId]').value");await saveProgress();check('CUSTOMER_CREATED_BY_UI_SQL_COMMIT',true);
 }else{
  await cdp.evaluate(`(()=>{const input=document.querySelector('#desk-dialog-body [name=customerLookup]');input.value=${JSON.stringify(progress.batch)};[...document.querySelectorAll('#desk-dialog-body button')].find(b=>b.textContent==='Tìm khách').click();return true;})()`);
  await until(()=>cdp.evaluate(`Boolean(document.querySelector('#desk-dialog-body select[name=customerId] option[value="${progress.customerId}"]'))`));
  await cdp.evaluate(`(()=>{const select=document.querySelector('#desk-dialog-body select[name=customerId]');select.value=${JSON.stringify(progress.customerId)};select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);check('EXISTING_LABELLED_TEST_CUSTOMER_REUSED',true);
 }
 const refs=await cdp.evaluate("(async()=>{const c=SongLamSession.client;return {types:(await c.request('/room-types?limit=200')).data,plans:(await c.request('/rate-plans?limit=200')).data};})()");
 const type=refs.types.find(t=>t.code==='SUP-K'),plan=refs.plans.find(p=>p.code==='SL-NIGHT-2026-V1');check('SQL_OWN_TARIFF_AND_ROOM_TYPE',Boolean(type&&plan));
 await cdp.evaluate(`(()=>{const form=document.querySelector('#desk-dialog-body form');form.elements.sourceCode.value='SONGLAM_TEST';form.elements.notes.value=${JSON.stringify(progress.batch)};const r=form.querySelector('fieldset');const type=r.querySelector('[name=roomTypeId]');type.value=${JSON.stringify(type.id)};type.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
 await until(()=>cdp.evaluate("document.querySelector('#desk-dialog-body [name=plannedRoomId]').options.length>1&&!document.querySelector('#desk-dialog-body [name=plannedRoomId]').disabled"));
 const room=await cdp.evaluate(`(async()=>{const result=await SongLamSession.client.request('/rooms?roomTypeId=${type.id}&limit=200');return result.data.find(room=>room.cleanlinessStatus==='CLEAN'&&room.exploitationStatus==='ACTIVE');})()`);check('EXISTING_PROJECT_ROOM_SELECTED',Boolean(room));progress.roomId=room.id;progress.roomNumber=room.number;
 await cdp.evaluate(`(()=>{const r=document.querySelector('#desk-dialog-body fieldset');const values={ratePlanId:${JSON.stringify(plan.id)},plannedRoomId:${JSON.stringify(room.id)},checkInAt:'2026-12-13T14:00',checkOutAt:'2026-12-15T12:00',adults:'2',children:'0',leadCustomerId:${JSON.stringify(progress.customerId)}};for(const[name,value]of Object.entries(values)){const c=r.querySelector('[name='+name+']');c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()`);
 const quote=async()=>{await cdp.evaluate("[...document.querySelectorAll('#desk-dialog-body button')].find(b=>b.textContent==='Kiểm quỹ & xem báo giá').click();true");await until(()=>cdp.evaluate("document.querySelector('#desk-dialog-body .sl-quote')?.textContent.includes('Tổng dự kiến toàn đơn')"));};
 await quote();check('REAL_SQL_QUOTE_2_NIGHTS',await cdp.evaluate("document.querySelector('#desk-dialog-body .sl-quote').textContent.includes('2.200.000')"));
 await cdp.evaluate("(()=>{const c=document.querySelector('#desk-dialog-body fieldset [name=adults]');c.value='1';c.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
 check('CHANGING_BOOKING_INVALIDATES_OLD_QUOTE',await cdp.evaluate("!document.querySelector('#desk-dialog-body .sl-quote').textContent"));
 await cdp.evaluate("(()=>{const c=document.querySelector('#desk-dialog-body fieldset [name=adults]');c.value='2';c.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");await quote();
 await cdp.evaluate("[...document.querySelectorAll('#desk-dialog-body button')].find(b=>b.textContent==='Xác nhận đặt phòng').click();true");
 await until(()=>cdp.evaluate("[...document.querySelectorAll('#desk-dialog-body button')].some(b=>b.textContent.startsWith('Mở đơn SL-'))"));
 progress.bookingCode=await cdp.evaluate("[...document.querySelectorAll('#desk-dialog-body button')].find(b=>b.textContent.startsWith('Mở đơn SL-')).textContent.slice(7)");await saveProgress();check('BOOKING_UI_SHOWS_COMMIT_AND_REAL_CODE',true);
 const result=await cdp.evaluate(`(async()=>{const r=await SongLamBookingsApi.createBookingsApi({client:SongLamSession.client}).listBookings({code:${JSON.stringify(progress.bookingCode)},limit:50});return r.data[0];})()`);check('BOOKING_RELOADED_FROM_SQL',Boolean(result?.id));progress.bookingId=result.id;await saveProgress();
 await cdp.evaluate("[...document.querySelectorAll('#desk-dialog-body button')].find(b=>b.textContent.startsWith('Mở đơn SL-')).click();true");
 await until(()=>cdp.evaluate(`document.getElementById('desk-dialog-body').textContent.includes(${JSON.stringify(progress.bookingCode)})&&document.querySelectorAll('#desk-dialog-body tbody tr').length===1`));check('SQL_BOOKING_DETAIL_RENDERED',true);
 const detail=await cdp.evaluate(`SongLamBookingsApi.createBookingsApi({client:SongLamSession.client}).getBooking('${progress.bookingId}').then(r=>r.data)`);progress.bookingRoomIds=detail.rooms.map(r=>r.id);check('FROZEN_SQL_TOTAL_EQUALS_QUOTE',detail.totals.estimatedAccommodationTotalVnd==='2200000');
 for(const[width,height]of[[1366,768],[1920,1080],[390,844]]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await sleep(50);check('BOOKING_DETAIL_VIEWPORT_'+width,await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+2'));const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('booking-detail-'+width+'.png',out),Buffer.from(shot.data,'base64'));}
 const timeline=await cdp.evaluate(`SongLamBookingsApi.createBookingsApi({client:SongLamSession.client}).getTimeline({from:'2026-12-13',to:'2026-12-16',roomId:'${room.id}',limit:200}).then(r=>r.data)`);
 check('FUTURE_TIMELINE_READS_SQL_ALLOCATION',timeline.segments.some(s=>s.bookingId===progress.bookingId&&s.roomId===room.id));
 check('FUTURE_BOOKING_NOT_OCCUPIED_TODAY',await cdp.evaluate(`SongLamSession.client.request('/rooms/${room.id}').then(r=>r.data.occupancyStatus==='VACANT')`));
 check('NO_BROWSER_BUSINESS_STORE',await cdp.evaluate("typeof SongLamStore==='undefined'&&!localStorage.getItem('songlam_rooms')"));
 check('NO_JS_OR_ASSET_ERRORS',report.errors.length===0);report.status='UI_BOOKING_SQL_COMMITTED_SQL_RECONCILIATION_REQUIRED';
}catch(error){report.status='NOT_PASSED';report.failedCheck=error.message==='Browser fixture timed out'?'BROWSER_WAIT_TIMEOUT':String(error.message).slice(0,160);process.exitCode=1;
 if(cdp)try{report.failureContext=await cdp.evaluate("({path:location.pathname,title:document.getElementById('desk-dialog-title')?.textContent,messages:[...document.querySelectorAll('#desk-dialog-body [role=alert],#desk-dialog-body .alert,#desk-message')].map(e=>e.textContent).slice(0,8),quote:document.querySelector('#desk-dialog-body .sl-quote')?.textContent?.slice(0,400)})");}catch{}
}finally{
 await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('ui-run-'+Date.now()+'.json',privateDir),JSON.stringify({...report,progress},null,2));
 const safe={...report,progress,writes:report.writes.map(w=>({path:w.path,requestId:w.requestId})),finishedAtUtc:new Date().toISOString()};await fs.writeFile(new URL('report.json',out),JSON.stringify(safe,null,2));
 if(cdp){try{await cdp.evaluate('(async()=>{if(window.SongLamSession?.current())await SongLamSession.logout();return true})()');}catch{}try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}if(browser?.exitCode===null)browser.kill();
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,errors:report.errors.length,failedCheck:report.failedCheck,report:'screenshots/booking-sql/report.json'}));
}
