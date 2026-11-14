// Same dedicated service identity/epoch as the authenticated SQL test listener.
// Narrow test activation; no operational .env or G12 release is loaded.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {currentWindowsPrincipal} from '../../backend/src/adapters/sql/windows-provider.js';
if(currentWindowsPrincipal().toLowerCase()!=='desktop-9epi86k\\songlam_pms_test')throw new Error('SQL_SERVICE_PRINCIPAL_MISMATCH');
const runtime=new URL('../../runtime/',import.meta.url),epoch=readFileSync(new URL('session-epoch.secret',runtime),'utf8').trim();
if(!/^[A-Za-z0-9_-]{43}$/.test(epoch))throw new Error('SQL_SESSION_CONFIG_REQUIRED');
Object.assign(process.env,{NODE_ENV:'test',HOST:'127.0.0.1',PORT:'8093',PUBLIC_ORIGIN:'http://127.0.0.1:8093',
 DATABASE_PROVIDER:'sqlserver',SQL_SERVER:'.\\SQLEXPRESS',SQL_DATABASE:'SongLamPms_Design',SQL_PORT:'',
 SQL_RUNTIME_FILE:fileURLToPath(new URL('manifest.json',runtime)),SONGLAM_SESSION_EPOCH:epoch,
 PMS_WRITE_MODE:'test-booking',PMS_BUILD_ID:'SONGLAM_BOOKING012_V1',PMS_RELEASE_FILE:fileURLToPath(new URL('booking-test-release.json',runtime))});
await import('../../backend/src/server.js');
