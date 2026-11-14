// Dedicated test identity, approved auth/session RPCs only; no secret output.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {loadWindowsSqlProvider} from '../../backend/src/adapters/sql/windows-provider.js';
import {createSqlContractAdapter} from '../../backend/src/adapters/sql/approved-contracts.js';
import {createSqlSessionStore} from '../../backend/src/adapters/sql/session-store.js';
const root=new URL('../../runtime/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8').replace(/^\uFEFF/,''));
const provider=loadWindowsSqlProvider(manifest),types=provider.types;
const pool=provider.createPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',auth:{mode:'windows'},transport:manifest.profile.transport,pool:{min:0,max:1,idleTimeoutMs:1000},connectionTimeoutMs:5000,requestTimeoutMs:5000});
let phase='connect',store,key;
try{
 await pool.connect();phase='lookup';
 const raw=await pool.request().input('Username',types.NVarChar(100),'SONGLAM_TEST_B20261112_UI01_ADMIN').execute('pms.usp_AppAuthLookup');
 const row=raw.recordset[0];console.log(JSON.stringify({phase,types:Object.fromEntries(Object.entries(row||{}).map(([k,v])=>[k,typeof v])),hashLength:row?.PasswordHash?.length,versionShape:/^0x[0-9a-fA-F]{16}$/.test(row?.RowVer||''),versionLength:row?.RowVer?.length,upperPrefix:/^0X[0-9a-fA-F]{16}$/.test(row?.RowVer||''),hexOnly:/^[0-9a-fA-F]{16}$/.test(row?.RowVer||''),trimmedShape:/^0x[0-9a-fA-F]{16}$/i.test(row?.RowVer?.trim()||'')}));
 const identity=createSqlContractAdapter({pool,types,contracts:manifest.profile.contracts,environment:'test'});
 const credentials=await identity.findCredentials('SONGLAM_TEST_B20261112_UI01_ADMIN');phase='identity';
 const person=await identity.getCurrentIdentity(credentials.appUserId);console.log(JSON.stringify({phase,valid:Boolean(person),active:person?.active,permissionsCount:person?.permissions.length}));
 phase='session-create';store=createSqlSessionStore({pool,types,manifest:manifest.sessions,database:'SongLamPms_Design',environment:'test',epoch:readFileSync(new URL('session-epoch.secret',root),'utf8').trim()});
 key=randomBytes(32).toString('hex');const csrf=randomBytes(32).toString('base64url');
 await store.create(key,{appUserId:person.appUserId,securityVersion:person.securityVersion,csrfToken:csrf,expiresAt:Date.now()+60000},60000);
 phase='session-get';const record=await store.get(key);console.log(JSON.stringify({phase,valid:record?.appUserId===person.appUserId}));
}catch(error){console.log(JSON.stringify({phase,status:'FAILED',code:error?.code,number:Number.isInteger(error?.number)?error.number:null}));process.exitCode=1;}
finally{if(store&&key){try{await store.destroy(key);}catch{}}await pool.close();}
