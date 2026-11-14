// Isolated demo regression host; never serves config, SQL or private directories.
import {createApp} from '../../backend/src/app.js';
import {loadConfig} from '../../backend/src/config/environment.js';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../../',import.meta.url));
const config=loadConfig({NODE_ENV:'test',HOST:'127.0.0.1',PORT:'3000',PUBLIC_ORIGIN:'http://127.0.0.1:3000',DATABASE_PROVIDER:'sqlserver',SQL_DATABASE:'SongLamPms_Design'});
const server=createApp({config,registerRoutes:app=>app.get('/test_runner.html',async(_req,res)=>{
  // This legacy test page has inline test code. Give only that static code a
  // nonce; the application CSP and production static allowlist stay unchanged.
  const nonce=randomBytes(16).toString('base64');
  const html=await readFile(new URL('../../test_runner.html',import.meta.url),'utf8');
  res.set('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`);
  res.type('html').send(html.replaceAll('<script>',`<script nonce="${nonce}">`));
})}).listen(0,'127.0.0.1');
let child;
try{
  await once(server,'listening');
  child=spawn('python',['run_suite.py'],{cwd:root,env:{...process.env,SONGLAM_TEST_URL:'http://127.0.0.1:'+server.address().port+'/test_runner.html'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',bytes=>process.stdout.write(bytes));child.stderr.on('data',()=>{});
  const [code]=await once(child,'exit');process.exitCode=code===0?0:1;
}finally{
  if(child&&child.exitCode===null)child.kill();
  await new Promise(resolve=>server.close(resolve));server.closeAllConnections();
}
