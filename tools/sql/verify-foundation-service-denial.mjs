// Runs only in the dedicated staged Windows identity; no valid import payload.
import {readFileSync} from 'node:fs';
import {loadWindowsSqlProvider} from '../../backend/src/adapters/sql/windows-provider.js';
const plan=JSON.parse(readFileSync(new URL('../../runtime/manifest.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const provider=loadWindowsSqlProvider(plan),pool=provider.createPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',auth:{mode:'windows'},transport:plan.profile.transport,
 pool:{min:0,max:1,idleTimeoutMs:1000},connectionTimeoutMs:5000,requestTimeoutMs:5000});
try{await pool.connect();let denied=false;
 try{await pool.request().input('PayloadJson',provider.types.NVarChar(provider.types.MAX),'{}').execute('pms.usp_SeedFoundationBatch');}
 catch(e){denied=(e?.number??e?.originalError?.info?.number)===229;}
 if(!denied)throw new Error('NOT_DENIED');console.log(JSON.stringify({status:'SERVICE_MAINTENANCE_RPC_DENIED',sqlErrorNumber:229,fixture:false}));
}catch{console.log(JSON.stringify({status:'SERVICE_DENIAL_NOT_VERIFIED'}));process.exitCode=1;}finally{await pool.close();}
