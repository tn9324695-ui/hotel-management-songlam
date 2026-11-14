// Run only as the dedicated Windows test account. No employee seed/login.
import {randomBytes,createHash} from 'node:crypto';
import {loadWindowsSqlProvider,currentWindowsPrincipal} from '../../backend/src/adapters/sql/windows-provider.js';
import {createSqlSessionStore} from '../../backend/src/adapters/sql/session-store.js';
const expected='desktop-9epi86k\\songlam_pms_test';
const certificateApproval='USER-20261112-TEST-CERTIFICATE-EXCEPTION';
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!==`--certificate-exception=${certificateApproval}`))throw new Error('SERVICE_PROBE_ARGUMENTS_REJECTED');
// Explicit approval, fixed test target only. Encryption is never disabled.
const trustTestCertificate=args.length===1;
const absentUserId='9223372036854775807';
const checks=[];let pool,phase='identity';
const check=(name,ok)=>{if(!ok)throw Object.assign(new Error('Probe rejected'),{code:'SERVICE_PROBE_FAILED'});checks.push(name);};
const sqlNumber=e=>e?.number??e?.originalError?.info?.number;
try{
  check('DEDICATED_WINDOWS_IDENTITY',currentWindowsPrincipal().toLowerCase()===expected);
  const provider=loadWindowsSqlProvider({expectedPrincipal:'DESKTOP-9EPI86K\\songlam_pms_test',principalApprovalReference:'USER-20261112-MODULES-3-4',odbcDriver:'ODBC Driver 17 for SQL Server'});
  provider.verifyPrincipal();const types=provider.types;
  phase='encrypted-pool-connect';
  pool=provider.createPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',auth:{mode:'windows'},transport:{encrypt:true,trustServerCertificate:trustTestCertificate,port:null},
    pool:{min:0,max:1,idleTimeoutMs:10000},connectionTimeoutMs:10000,requestTimeoutMs:5000});
  await pool.connect();check('REAL_POOL_CONNECTED',pool.connected===true);
  phase='identity-and-rights';
  const identity=(await pool.request().query(`SELECT DB_NAME() AS DatabaseName,ORIGINAL_LOGIN() AS SqlLogin,USER_NAME() AS DatabaseUser,
    IS_SRVROLEMEMBER('sysadmin') AS IsSysadmin,IS_MEMBER('db_owner') AS IsDbOwner,
    IS_SRVROLEMEMBER('securityadmin') AS IsSecurityAdmin,IS_MEMBER('db_datareader') AS IsDataReader,
    ISNULL(HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER'),0) AS ControlServer,
    CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')) AS Transport,@@SPID AS SessionId;`)).recordset[0];
  check('SQL_LOGIN_AND_DATABASE',identity.DatabaseName==='SongLamPms_Design'&&identity.SqlLogin.toLowerCase()===expected&&identity.DatabaseUser==='pms_web_auth_test');
  check('NO_ADMIN_OR_DATAREADER',identity.IsSysadmin===0&&identity.IsDbOwner===0&&identity.IsSecurityAdmin===0&&identity.IsDataReader===0&&identity.ControlServer===0);
  const env=(await pool.request().execute('pms.usp_AppEnvironment')).recordset;
  check('AUTH_ENVIRONMENT_RPC',env.length===1&&env[0].ServerIdentity==='DESKTOP-9EPI86K\\SQLEXPRESS'&&env[0].DatabaseName==='SongLamPms_Design'&&env[0].DatabaseIdentity==='eb18c6f2-373d-4a83-a34f-d9809f1cbc7a'&&env[0].Environment==='test');
  let denied=false;try{await pool.request().query('SELECT TOP (0) UserId FROM pms.AppUser;');}catch(error){denied=sqlNumber(error)===229;}
  check('DIRECT_ACCOUNT_READ_DENIED',denied);
  const rights=(await pool.request().query(`SELECT
    ISNULL(HAS_PERMS_BY_NAME(N'pms.WebSession',N'OBJECT',N'SELECT'),0) AS DirectRead,
    ISNULL(HAS_PERMS_BY_NAME(N'pms.WebSession',N'OBJECT',N'INSERT'),0) AS DirectInsert,
    ISNULL(HAS_PERMS_BY_NAME(N'pms.WebSession',N'OBJECT',N'UPDATE'),0) AS DirectUpdate,
    ISNULL(HAS_PERMS_BY_NAME(N'pms.WebSession',N'OBJECT',N'DELETE'),0) AS DirectDelete,
    ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'EXECUTE'),0) AS DatabaseExecute,
    ISNULL(HAS_PERMS_BY_NAME(N'pms',N'SCHEMA',N'EXECUTE'),0) AS SchemaExecute;`)).recordset[0];
  check('NO_DIRECT_SESSION_DML_OR_BROAD_EXECUTE',Object.values(rights).every(value=>value===0));
  const credentials=await pool.request().input('Username',types.NVarChar(100),'SONGLAM_TEST_PREFLIGHT_NO_ACCOUNT').execute('pms.usp_AppAuthLookup');
  check('AUTH_LOOKUP_EMPTY',credentials.recordset.length===0);
  const person=await pool.request().input('AppUserId',types.BigInt,absentUserId).execute('pms.usp_AppIdentity');
  check('IDENTITY_EMPTY',person.recordsets.length===2&&person.recordsets.every(rows=>rows.length===0));
  phase='session-rpc';
  const epoch=randomBytes(32).toString('base64url'),key=createHash('sha256').update(randomBytes(32)).digest('hex');
  const manifest={approved:true,approvalReference:'USER-20261112-MODULES-3-4',protocol:'songlam.session.v1',environment:'test',database:'SongLamPms_Design',
    sessionWritesApproved:true,sessionWriteApprovalReference:'USER-20261112-MODULES-3-4-SESSION-WRITES',
    procedures:{probe:'pms.usp_WebSessionProbe',create:'pms.usp_WebSessionCreate',get:'pms.usp_WebSessionGet',destroy:'pms.usp_WebSessionDestroy'}};
  const store=createSqlSessionStore({pool,types,manifest,database:'SongLamPms_Design',environment:'test',epoch});
  check('SESSION_STORE_PROBE',await store.probe()===true);
  check('UNKNOWN_SESSION_EMPTY',await store.get(key)===null);
  await store.destroy(key);await store.destroy(key);check('DESTROY_UNKNOWN_SESSION_IDEMPOTENT',true);
  let invalidUserDenied=false;
  try{
    await pool.request().input('EpochHash',types.VarChar(64),createHash('sha256').update(epoch).digest('hex')).input('SessionKeyHash',types.VarChar(64),key)
      .input('AppUserId',types.BigInt,absentUserId).input('SecurityVersion',types.VarChar(18),'0x0000000000000001')
      .input('CsrfToken',types.VarChar(43),randomBytes(32).toString('base64url')).input('ExpiresAtUtc',types.DateTime2(3),new Date(Date.now()+60000)).input('TtlMs',types.Int,60000)
      .execute('pms.usp_WebSessionCreate');
  }catch(error){invalidUserDenied=sqlNumber(error)===53213;}
  check('NONEXISTENT_EMPLOYEE_CANNOT_CREATE_SESSION',invalidUserDenied);
  console.log(JSON.stringify({status:'SERVICE_SQL_PROBE_PASSED',checks,principal:expected,sqlUser:identity.DatabaseUser,transport:identity.Transport,
    encryptedConnection:true,strictCertificateValidation:!trustTestCertificate,certificateExceptionApprovalReference:trustTestCertificate?certificateApproval:null,
    employeeSeeded:false,validSessionCreated:false,fullSessionLifecycleTested:false}));
}catch(error){
  const messages=[error?.message,error?.originalError?.message,...(error?.odbcErrors||[]).map(x=>x.message)].filter(Boolean).join(' ');
  console.log(JSON.stringify({status:'SERVICE_SQL_PROBE_FAILED',phase,checks,code:/certificate|ssl|tls|trust/i.test(messages)?'SQL_TLS_VALIDATION_FAILED':'SQL_CONNECTION_OR_PROBE_FAILED',
    sqlErrorNumber:sqlNumber(error)??null,errorType:/^[A-Za-z0-9_.-]{1,48}$/.test(error?.name||'')?error.name:'UNCLASSIFIED',
    driverCode:/^[A-Za-z0-9_-]{1,32}$/.test(String(error?.code||''))?String(error.code):null,
    failureKind:/login failed|authentication|SSPI/i.test(messages)?'AUTHENTICATION':/network|timeout|server.*not.*found/i.test(messages)?'NETWORK':/driver|data source|DSN/i.test(messages)?'DRIVER':/undefined|null|property|function/i.test(messages)?'PROVIDER_CONFIGURATION':'OTHER',
    strictCertificateValidation:!trustTestCertificate}));process.exitCode=1;
}finally{try{await pool?.close();}catch{}}
