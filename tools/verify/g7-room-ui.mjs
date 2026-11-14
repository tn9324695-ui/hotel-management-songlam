// Live browser, SQL R1 room status; G7 commands remain disabled.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { CDP, until } from '../../backend/tests/browser/cdp.mjs';
const origin='http://127.0.0.1:8093';
const credentials=JSON.parse(await fs.readFile(new URL('../sql/private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8'));
const staff=credentials.accounts.find(a=>a.roleCode==='housekeeping');
let browser,cdp,profile;const errors=[];
try{
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'songlam-g7-ui-'));
 browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const port=await until(async()=>{try{return Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{return false;}});
 const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 const socket=new WebSocket(tab.webSocketDebuggerUrl);await once(socket,'open');cdp=new CDP(socket);
 cdp.on('Runtime.exceptionThrown',()=>errors.push('JS_EXCEPTION'));
 await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Network.enable');
 await cdp.send('Page.navigate',{url:origin+'/login.html'});
 await until(()=>cdp.evaluate("document.getElementById('login-fields')?.disabled===false"));
 await cdp.evaluate(`document.getElementById('username').value=${JSON.stringify(staff.username)};document.getElementById('password').value=${JSON.stringify(staff.password)};document.getElementById('login-form').requestSubmit();true`);
 await until(()=>cdp.evaluate("Boolean(window.SongLamSession?.current())"));
 await cdp.send('Page.navigate',{url:origin+'/housekeeping-api.html'});
 await until(()=>cdp.evaluate("document.querySelectorAll('#ops-table tbody tr').length>=40"));
 const result=await cdp.evaluate("({rows:document.querySelectorAll('#ops-table tbody tr').length,source:document.getElementById('ops-message').textContent,createHidden:document.getElementById('ops-create').hidden,first:document.querySelector('#ops-table tbody tr')?.textContent?.slice(0,80)})");
 assert.equal(result.rows,50);assert.match(result.source,/SQL chỉ đọc/);assert.equal(result.createHidden,true);assert.equal(errors.length,0);
 console.log(JSON.stringify({status:'PASS',source:'LIVE_BROWSER_HTTP_SQL_R1',rows:result.rows,writeButtonHidden:result.createHidden,jsErrors:errors.length}));
}finally{if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}if(browser?.exitCode===null)browser.kill();if(profile)await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
