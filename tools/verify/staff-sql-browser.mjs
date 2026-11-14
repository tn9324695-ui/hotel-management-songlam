// Isolated Chrome, real frontend -> HTTP -> SQL. No fixtures/interception.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {CDP,until,sleep} from '../../backend/tests/browser/cdp.mjs';
const argumentsText=process.argv.slice(2).join(' '),foundation=argumentsText==='--approved=USER-FOUNDATION-011 --foundation-batch';
if(!foundation&&argumentsText!=='--approved=USER-20261112-MODULES-5-6')throw new Error('TEST_APPROVAL_REQUIRED');
const reportPath=foundation?'screenshots/foundation-sql/report.json':'screenshots/staff-sql/report.json';
const origin='http://127.0.0.1:8093',out=new URL(foundation?'../../screenshots/foundation-sql/':'../../screenshots/staff-sql/',import.meta.url);
const report={source:'REAL_BROWSER_HTTP_SQL',checks:[],requests:[],errors:[],roles:[],businessFlowsTested:false};
let browser,cdp,profile;
const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);};
try{
 // Respect the backend's 10 logins/minute; preceding HTTP verification uses six.
 // This is a test scheduling delay, not a disabled/relaxed security control.
 try{const paths=[new URL(foundation?'../sql/private/foundation-base420-20261112/http-reconciliation.json':'../sql/private/modules-5-6-20261112/http-integration.json',import.meta.url),new URL('report.json',out)];
  const times=await Promise.all(paths.map(async path=>{try{return(await fs.stat(path)).mtimeMs;}catch(error){if(error.code==='ENOENT')return 0;throw error;}}));
  const delay=Math.max(0,61000-(Date.now()-Math.max(...times)));
  if(delay>0){console.log(JSON.stringify({event:'WAITING_LOGIN_RATE_WINDOW',seconds:Math.ceil(delay/1000)}));await sleep(delay);}
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const bundle=JSON.parse((await fs.readFile(new URL('../sql/private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'songlam-staff-sql-'));
 browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const port=await until(async()=>{try{return Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{return false;}});
 const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 const socket=new WebSocket(tab.webSocketDebuggerUrl);await once(socket,'open');cdp=new CDP(socket);
 cdp.on('Runtime.exceptionThrown',()=>report.errors.push('JAVASCRIPT_EXCEPTION'));
 cdp.on('Network.responseReceived',e=>{const u=new URL(e.response.url);if(u.origin!==origin)return;
   if(u.pathname.startsWith('/api/'))report.requests.push({path:u.pathname,status:e.response.status,requestId:Object.entries(e.response.headers).find(([k])=>k.toLowerCase()==='x-request-id')?.[1]??null});
   else if(e.response.status>=400)report.errors.push('ASSET_'+e.response.status+':'+u.pathname);
 });
 await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Network.enable');await fs.mkdir(out,{recursive:true});
 for(const account of bundle.accounts){
  await cdp.send('Page.navigate',{url:origin+'/login.html'});
  await until(()=>cdp.evaluate("document.getElementById('login-form')?.dataset.authState==='configured'"));
  // Secrets enter only this private CDP channel, never console/evidence/argv.
  await cdp.evaluate(`document.getElementById('username').value=${JSON.stringify(account.username)};document.getElementById('password').value=${JSON.stringify(account.password)};document.getElementById('login-form').requestSubmit();true`);
  await until(()=>cdp.evaluate("document.readyState==='complete'&&!document.getElementById('login-form')&&!location.pathname.endsWith('/login.html')&&Boolean(window.SongLamSession?.current())"));
  check('UI_LOGIN_'+account.roleCode,await cdp.evaluate(`SongLamSession.current().user.username===${JSON.stringify(account.username)}`));
  const landing=await cdp.evaluate('location.pathname');report.roles.push({role:account.roleCode,landing});
  await cdp.send('Page.navigate',{url:origin+'/reception-api.html#rooms'});
  await until(()=>cdp.evaluate(`location.pathname.endsWith('/reception-api.html')&&document.readyState==='complete'&&Boolean(SongLamSession.current())&&document.getElementById('desk-results')?.getAttribute('aria-busy')==='false'&&Boolean(document.querySelector(${JSON.stringify(foundation?'#desk-results .sl-room-grid':'#desk-results .sl-empty')}))`));
  check((foundation?'SQL_POPULATED_ROOMS_':'SQL_EMPTY_ROOMS_')+account.roleCode,await cdp.evaluate(foundation?"document.querySelector('#desk-results .sl-room-grid').children.length===50&&typeof SongLamStore==='undefined'":"!document.querySelector('#desk-results .room-card')&&typeof SongLamStore==='undefined'"));
  check('NO_BUSINESS_WRITE_'+account.roleCode,await cdp.evaluate("document.getElementById('desk-create').disabled"));
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(60);
   check('VIEWPORT_'+account.roleCode+'_'+width,await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
   const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(account.roleCode+'-'+width+'.png',out),Buffer.from(shot.data,'base64'));
  }
  await cdp.send('Page.navigate',{url:origin+'/reception-api.html#roomTypes'});
  await until(()=>cdp.evaluate(`Boolean(SongLamSession.current())&&document.getElementById('desk-title')?.textContent==='Hạng phòng'&&${foundation?"document.querySelectorAll('#desk-results tbody tr').length===11":"Boolean(document.querySelector('#desk-results .sl-empty'))"}`));
  check((foundation?'SQL_ELEVEN_ROOM_TYPES_':'SQL_EMPTY_ROOM_TYPES_')+account.roleCode,true);
  check('UNAVAILABLE_RECEPTION_TABS_LOCKED_'+account.roleCode,await cdp.evaluate("[...document.querySelectorAll('#desk-nav button')].filter(b=>['Lịch đặt phòng','Quỹ phòng','Bảng giá & chính sách'].includes(b.textContent)).every(b=>b.disabled)"));
  if(foundation){
   await cdp.evaluate("document.getElementById('desk-quote').click();true");
   await until(()=>cdp.evaluate("document.getElementById('desk-dialog').open"));
   check('QUOTE_EXPLAINS_MISSING_SQL_'+account.roleCode,await cdp.evaluate("document.querySelector('#desk-dialog-body .sl-blocked')?.textContent.includes('SQL')"));
   check('INACTIVE_TYPE_NOT_QUOTABLE_'+account.roleCode,await cdp.evaluate("document.querySelector('#desk-dialog-body select[name=roomTypeId]').options.length===11"));
   check('QUOTE_SEND_BLOCKED_WITHOUT_RATES_'+account.roleCode,await cdp.evaluate("[...document.querySelectorAll('#desk-dialog-body button')].find(b=>b.textContent==='Lấy báo giá từ máy chủ')?.disabled===true"));
   if(account.roleCode==='receptionist')for(const [width,height] of [[1366,768],[1920,1080],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await sleep(60);
    check('QUOTE_MODAL_VIEWPORT_'+width,await cdp.evaluate("document.documentElement.scrollWidth<=innerWidth+2&&document.getElementById('desk-dialog').getBoundingClientRect().width<=innerWidth+2"));
    check('QUOTE_MODAL_CENTERED_'+width,await cdp.evaluate("(()=>{const box=document.getElementById('desk-dialog').getBoundingClientRect();return Math.abs(box.left+box.width/2-document.documentElement.clientWidth/2)<2;})()"));
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('receptionist-quote-'+width+'.png',out),Buffer.from(shot.data,'base64'));
   }
   await cdp.evaluate("document.getElementById('desk-close').click();true");
  }
  await cdp.send('Page.navigate',{url:origin+'/catalog-api.html'});
  await until(()=>cdp.evaluate("location.pathname.endsWith('/catalog-api.html')&&document.getElementById('catalog-source')?.textContent.includes('SQL Server')&&document.getElementById('catalog-results')?.getAttribute('aria-busy')==='false'"));
  check('CATALOG_SQL_SOURCE_'+account.roleCode,await cdp.evaluate(`typeof SongLamStore==='undefined'&&${foundation?"document.querySelectorAll('#catalog-results tbody tr').length===11":"document.querySelector('#catalog-results .sl-empty')!==null"}`));
  const catalogs=await cdp.evaluate("[...document.querySelectorAll('#catalog-nav button:not([disabled])')].map(b=>b.textContent)");
  for(const title of catalogs){
   await cdp.evaluate(`[...document.querySelectorAll('#catalog-nav button')].find(b=>b.textContent===${JSON.stringify(title)}).click();true`);
   await until(()=>cdp.evaluate("document.getElementById('catalog-results').getAttribute('aria-busy')==='false'"));
   check((foundation?'CATALOG_POPULATED_':'CATALOG_EMPTY_')+account.roleCode+'_'+title,await cdp.evaluate(foundation?"document.querySelectorAll('#catalog-results tbody tr').length>0":"document.querySelector('#catalog-results .sl-empty')!==null"));
   if(foundation&&title==='Phòng'){
    await cdp.evaluate("document.getElementById('catalog-filters').elements.cleanlinessStatus.value='DIRTY';document.getElementById('catalog-filters').requestSubmit();true");
    await until(()=>cdp.evaluate("document.getElementById('catalog-results').getAttribute('aria-busy')==='false'&&document.querySelectorAll('#catalog-results tbody tr').length===9"));
    check('UI_DIRTY_FILTER_NINE_'+account.roleCode,true);
    await cdp.evaluate("document.querySelector('#catalog-results tbody button').click();true");await until(()=>cdp.evaluate("document.getElementById('catalog-detail').open"));
    check('UI_ROOM_DETAIL_'+account.roleCode,await cdp.evaluate("document.getElementById('catalog-detail-body').textContent.includes('Chờ dọn')"));
    await cdp.evaluate("document.getElementById('catalog-close').click();true");
   }
   if(foundation&&title==='Danh mục dịch vụ')check('UI_EXPLICIT_FREE_ZERO_'+account.roleCode,await cdp.evaluate("[...document.querySelectorAll('#catalog-results tbody tr')].find(r=>r.cells[0].textContent==='FREE-01')?.cells[4].textContent.replace(/\\s/g,'')==='0₫'"));
  }
  for(const [width,height] of [[1366,768],[1920,1080],[390,844]]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await sleep(50);
   check('CATALOG_VIEWPORT_'+account.roleCode+'_'+width,await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
   if(foundation&&width===390){await cdp.evaluate("document.getElementById('desk-menu').click();true");check('MOBILE_MENU_OPENS_'+account.roleCode,await cdp.evaluate("document.getElementById('ops-sidebar').classList.contains('open')"));await cdp.evaluate("document.querySelector('.sl-nav-close').click();true");}
   const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('catalog-'+account.roleCode+'-'+width+'.png',out),Buffer.from(shot.data,'base64'));
  }
  for(const page of ['housekeeping-api.html','services-api.html','finance-api.html','admin-api.html']){
   await cdp.send('Page.navigate',{url:origin+'/'+page});
   await until(()=>cdp.evaluate("Boolean(document.querySelector('[data-module-unavailable]'))"));
   check('UNAVAILABLE_MODULE_MARKED_'+account.roleCode+'_'+page,true);
  }
  await cdp.evaluate('(async()=>{await SongLamSession.logout();return true})()');
  await until(()=>cdp.evaluate("location.pathname.endsWith('/login.html')&&document.getElementById('login-form')?.dataset.authState==='configured'"));
  check('UI_LOGOUT_'+account.roleCode,true);
 }
 check('NO_JAVASCRIPT_OR_ASSET_ERRORS',report.errors.length===0);
 check('REAL_CATALOG_RESPONSES',report.requests.some(r=>r.path==='/api/v1/rooms'&&r.status===200)&&report.requests.some(r=>r.path==='/api/v1/room-types'&&r.status===200));
 report.status='REAL_SQL_BROWSER_PASSED';
}catch{report.status='NOT_PASSED';process.exitCode=1;
 if(cdp){try{report.failureContext=await cdp.evaluate("({path:location.pathname,title:document.getElementById('desk-title')?.textContent,session: Boolean(window.SongLamSession?.current()),hasResults:Boolean(document.getElementById('desk-results')),viewport:innerWidth,layoutWidth:document.documentElement.clientWidth,dialog:document.getElementById('desk-dialog')?.getBoundingClientRect().toJSON()})");}catch{}}
}
finally{
 await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
 if(cdp){try{await cdp.evaluate('(async()=>{if(window.SongLamSession?.current())await SongLamSession.logout();return true})()');}catch{}
  try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}
 if(browser?.exitCode===null){await Promise.race([once(browser,'exit'),sleep(1500)]);if(browser.exitCode===null)browser.kill();}
 if(profile){const p=path.resolve(profile);if(path.dirname(p)!==path.resolve(os.tmpdir())||!path.basename(p).startsWith('songlam-staff-sql-'))throw new Error('CLEANUP_PATH_INVALID');await fs.rm(p,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});}
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,roles:report.roles.length,errors:report.errors.length,report:reportPath}));
}
