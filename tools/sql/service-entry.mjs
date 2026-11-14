// Private staged test deployment only. Never run under the metadata operator.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {currentWindowsPrincipal} from '../../backend/src/adapters/sql/windows-provider.js';
if(currentWindowsPrincipal().toLowerCase()!=='desktop-9epi86k\\songlam_pms_test')throw new Error('SQL_SERVICE_PRINCIPAL_MISMATCH');
const runtime=new URL('../../runtime/',import.meta.url);
const epoch=readFileSync(new URL('session-epoch.secret',runtime),'utf8').trim();
if(!/^[A-Za-z0-9_-]{43}$/.test(epoch))throw new Error('SQL_SESSION_CONFIG_REQUIRED');
// Isolated test listener: no operational .env or G12 release is read.
Object.assign(process.env,{NODE_ENV:'test',HOST:'127.0.0.1',PORT:'8093',PUBLIC_ORIGIN:'http://127.0.0.1:8093',
  DATABASE_PROVIDER:'sqlserver',SQL_SERVER:'.\\SQLEXPRESS',SQL_DATABASE:'SongLamPms_Design',SQL_PORT:'',
  SQL_RUNTIME_FILE:fileURLToPath(new URL('manifest.json',runtime)),SONGLAM_SESSION_EPOCH:epoch,
  PMS_WRITE_MODE:'frozen',PMS_BUILD_ID:'',PMS_RELEASE_FILE:''});
await import('../../backend/src/server.js');
