// Diagnostic review reproductions only. Does not modify application code.
// Synthetic responses below are never evidence of SQL authentication.
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {createApp} from '../../backend/src/app.js';
import {loadConfig} from '../../backend/src/config/environment.js';

const report={source:'SYNTHETIC_REVIEW_REPRODUCTIONS_NOT_SQL',findings:[],sqlExecuted:false};
let releaseRights,requestedRights=false;
const rights=new Promise(resolve=>{releaseRights=resolve;});
const root={dispatchEvent(){},addEventListener(){},SongLamHttp:{getClient:()=>({async request(route){
  if(route==='/auth/me')return {data:{user:{appUserId:'1',username:'fixture'},csrfToken:'a'.repeat(43)}};
  requestedRights=true;return rights;
}})}};
vm.runInNewContext(await fs.readFile(new URL('../../js/services/session-service.js',import.meta.url),'utf8'),{window:root,CustomEvent:class{constructor(type){this.type=type;}}});
const restoring=root.SongLamSession.restore();
for(let i=0;i<10&&!requestedRights;i++)await Promise.resolve();
root.SongLamSession.clear();releaseRights({data:{permissions:['viewRoomRack']}});
let rejectedStale=false;try{await restoring;}catch(error){rejectedStale=error.code==='SESSION_CHANGED';}
report.findings.push({id:'REVIEW-SESSION-RACE',file:'js/services/session-service.js',
  reproduced:root.SongLamSession.current()!==null,staleResponseRejected:rejectedStale,
  description:'An already pending restore repopulates frontend session state after clear(). Backend authorization is not bypassed by this probe.'});

const config=loadConfig({NODE_ENV:'test',HOST:'127.0.0.1',PORT:'3000',PUBLIC_ORIGIN:'http://127.0.0.1:3000',DATABASE_PROVIDER:'sqlserver',SQL_DATABASE:'SongLamPms_Design',SQL_SERVER:'fixture'});
const next=(_req,_res,continueRequest)=>continueRequest();
const auth={fixture:false,status:async()=>({status:'configured',loginEnabled:true}),authenticate:next,csrf:next,requireAvailable:next,requirePermission:()=>next,login:next,logout:next};
const server=createApp({config,authRuntime:auth,sqlRuntime:{status:async()=>({mode:'test-only',configured:true,sqlConnected:true,identityVerified:true,authentication:true,modules:['catalogGateway'],businessWritesEnabled:false})}}).listen(0,'127.0.0.1');
try{
  await once(server,'listening');const response=await fetch('http://127.0.0.1:'+server.address().port+'/ready');const data=(await response.json()).data;
  report.findings.push({id:'REVIEW-READINESS-DIAGNOSTICS',file:'backend/src/app.js',
    reproduced:data.connection.authentication===true&&data.checks.authentication.status==='pending_approval',
    description:'Readiness copies live SQL connection status but keeps hard-coded pending authentication/session/catalog checks. Fixture tests diagnostic consistency only.'});
}finally{await new Promise(resolve=>server.close(resolve));server.closeAllConnections();}
await fs.mkdir(new URL('../../screenshots/audit/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../../screenshots/audit/review-probes.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
