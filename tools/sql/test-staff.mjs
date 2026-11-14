// Internal CLI only. No public import API; prepare never opens SQL.
import { randomBytes, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPasswordVerifier } from '../../backend/src/modules/auth/password-verifier.js';
import { loadWindowsSqlProvider, currentWindowsPrincipal, isWindowsPrincipal } from '../../backend/src/adapters/sql/windows-provider.js';

const derive = promisify(pbkdf2);
export const staffBatch = 'B20261112_UI01';
const roles = ['admin','manager','receptionist','cashier','housekeeping'];
const names = ['Quản trị thử','Quản lý thử','Lễ tân thử','Thu ngân thử','Buồng phòng thử'];
const directory = fileURLToPath(new URL('./private/test-staff-' + staffBatch + '/', import.meta.url));
const bundlePath = path.join(directory, 'credentials.local.json');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

export async function buildStaffBundle() {
  const accounts = [];
  for (let i=0;i<roles.length;i++) {
    const password=randomBytes(24).toString('base64url'),salt=randomBytes(16),key=await derive(password,salt,600000,32,'sha256');
    accounts.push({username:'SONGLAM_TEST_'+staffBatch+'_'+roles[i].toUpperCase(),fullName:names[i],roleCode:roles[i],password,
      passwordHash:'$pbkdf2-sha256-v1$600000$'+salt.toString('base64url')+'$'+key.toString('base64url')});
  }
  return {format:'songlam.test-staff.private.v1',batchCode:staffBatch,createdAt:new Date().toISOString(),accounts};
}
export async function validateStaffBundle(bundle) {
  if (!closed(bundle,['format','batchCode','createdAt','accounts']) || bundle.format!=='songlam.test-staff.private.v1' || bundle.batchCode!==staffBatch
    || !Number.isFinite(Date.parse(bundle.createdAt)) || !Array.isArray(bundle.accounts) || bundle.accounts.length!==5) fail('STAFF_BUNDLE_INVALID');
  const verifier=createPasswordVerifier({formats:['pbkdf2-sha256-v1']}),seen=new Set(),passwords=new Set();
  for(const account of bundle.accounts){
    const index=roles.indexOf(account?.roleCode);
    if(!closed(account,['username','fullName','roleCode','password','passwordHash']) || index<0 || seen.has(account.roleCode)
      || account.username!=='SONGLAM_TEST_'+staffBatch+'_'+account.roleCode.toUpperCase() || account.fullName!==names[index]
      || !/^[A-Za-z0-9_-]{32}$/.test(account.password||'') || passwords.has(account.password)
      || !/^\$pbkdf2-sha256-v1\$600000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(account.passwordHash||'')
      || !await verifier.verify(account.password,account.passwordHash))fail('STAFF_BUNDLE_INVALID');
    seen.add(account.roleCode);passwords.add(account.password);
  }
  return bundle;
}
export function validateStaffApproval(m) {
  if(!closed(m,['approved','approvalReference','environment','server','database','databaseGuid','testIdentity','procedure','batchCode','seedWritesApproved',
    'seedWriteApprovalReference','maintenancePrincipal','maintenancePrincipalApprovalReference','odbcDriver','trustServerCertificate','certificateExceptionApprovalReference'])
    || m.approved!==true || !m.approvalReference?.trim() || m.environment!=='test' || m.server!=='.\\SQLEXPRESS' || m.database!=='SongLamPms_Design'
    || m.databaseGuid!=='C4DD399E-5661-4741-A424-5ABFEEFBC1AC' || m.testIdentity!=='eb18c6f2-373d-4a83-a34f-d9809f1cbc7a'
    || m.procedure!=='pms.usp_SeedTestStaffBatch' || m.batchCode!==staffBatch || m.seedWritesApproved!==true || !m.seedWriteApprovalReference?.trim()
    || !isWindowsPrincipal(m.maintenancePrincipal) || !m.maintenancePrincipalApprovalReference?.trim()
    || !['ODBC Driver 17 for SQL Server','ODBC Driver 18 for SQL Server'].includes(m.odbcDriver)
    || !(m.trustServerCertificate===false || m.trustServerCertificate===true && m.certificateExceptionApprovalReference?.trim()))fail('STAFF_IMPORT_APPROVAL_REQUIRED');
  return m;
}
export async function importStaff({bundle,approval,gateway}={}) {
  validateStaffApproval(approval);await validateStaffBundle(bundle);
  let issued=false;
  try {
    await gateway.open(approval);
    const identity=await gateway.probe();
    if(identity?.ServerIdentity!=='DESKTOP-9EPI86K\\SQLEXPRESS' || identity.DatabaseName!==approval.database
      || identity.DatabaseGuid?.toUpperCase()!==approval.databaseGuid || identity.TestIdentity!==approval.testIdentity
      || identity.Environment!=='test' || identity.SeedReady!==true)fail('STAFF_IMPORT_TARGET_UNVERIFIED');
    // Secrets are typed parameters, never SQL text, argv, logs or output.
    const accounts=bundle.accounts.map(({password,...account})=>account);
    issued=true;
    const rows=await gateway.seed(bundle.batchCode,JSON.stringify(accounts));
    if(!Array.isArray(rows)||rows.length!==5)fail('STAFF_IMPORT_OUTCOME_UNKNOWN');
    const ids=new Set(),seen=new Set();
    for(const row of rows){
      const expected=accounts.find(account=>account.username===row.Username);
      if(!expected||seen.has(row.Username)||row.RoleCode!==expected.roleCode||row.BatchCode!==staffBatch
        || !/^[1-9]\d{0,18}$/.test(String(row.UserId)) || BigInt(String(row.UserId))>9223372036854775807n
        || typeof row.UserId==='number'&&!Number.isSafeInteger(row.UserId) || ids.has(String(row.UserId))
        || ![true,false,0,1].includes(row.Created)||Boolean(row.Created)!==Boolean(rows[0].Created))fail('STAFF_IMPORT_OUTCOME_UNKNOWN');
      seen.add(row.Username);ids.add(String(row.UserId));
    }
    return {status:'STAFF_BATCH_CONFIRMED',batchCode:staffBatch,createdCount:rows[0].Created?5:0,replayed:!rows[0].Created,
      accounts:rows.map(row=>({username:row.Username,roleCode:row.RoleCode,userId:String(row.UserId)}))};
  } catch(error){
    if(issued){
      // A SQL exception may contain payloads/driver secrets. Preserve only its
      // numeric diagnostic; never log the message or retry an uncertain write.
      const number=error?.number??error?.originalError?.info?.number;
      throw Object.assign(new Error('STAFF_IMPORT_OUTCOME_UNKNOWN'),{code:'STAFF_IMPORT_OUTCOME_UNKNOWN',
        ...(Number.isInteger(number)?{sqlErrorNumber:number}:{})});
    }
    fail(error?.code==='STAFF_IMPORT_TARGET_UNVERIFIED'?error.code:'STAFF_IMPORT_UNAVAILABLE');
  } finally {try{await gateway.close();}catch{/* no raw driver details */}}
}
export function createMaintenanceGateway() {
  let pool,types;
  return {
    async open(m){
      const provider=loadWindowsSqlProvider({expectedPrincipal:m.maintenancePrincipal,principalApprovalReference:m.maintenancePrincipalApprovalReference,odbcDriver:m.odbcDriver});
      provider.verifyPrincipal();types=provider.types;
      pool=provider.createPool({server:m.server,database:m.database,auth:{mode:'windows'},transport:{encrypt:true,trustServerCertificate:m.trustServerCertificate,port:null},
        pool:{min:0,max:1,idleTimeoutMs:10000},connectionTimeoutMs:5000,requestTimeoutMs:10000});
      await pool.connect();
    },
    async probe(){
      const response=await pool.request().query(`SELECT DB_NAME() AS DatabaseName,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS ServerIdentity,
       CONVERT(varchar(36),r.database_guid) AS DatabaseGuid,
       (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment') AS Environment,
       (SELECT CONVERT(nvarchar(128),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity') AS TestIdentity,
       CONVERT(bit,CASE WHEN OBJECT_ID(N'pms.usp_SeedTestStaffBatch',N'P') IS NOT NULL THEN 1 ELSE 0 END) AS SeedReady
       FROM sys.database_recovery_status r WHERE r.database_id=DB_ID();`);
      return response.recordsets?.[0]?.length===1?response.recordsets[0][0]:null;
    },
    async seed(batch,json){const request=pool.request();request.timeout=10000;
      request.input('BatchCode',types.VarChar(40),batch);request.input('AccountsJson',types.NVarChar(types.MAX),json);
      return (await request.execute('pms.usp_SeedTestStaffBatch')).recordsets?.[0];},
    async close(){await pool?.close();}
  };
}
async function protectPrivateDirectory() {
  // Agent sandbox identities differ from the desktop owner. Never produce a
  // secret readable only by a sandbox account and call it an operator file.
  if(process.platform==='win32' && currentWindowsPrincipal().toLowerCase()!==((process.env.USERDOMAIN||'')+'\\'+(process.env.USERNAME||'')).toLowerCase())
    fail('STAFF_OPERATOR_IDENTITY_REQUIRED');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  if((await fs.lstat(directory)).isSymbolicLink())fail('STAFF_PRIVATE_PATH_INVALID');
  try {if((await fs.lstat(bundlePath)).isSymbolicLink())fail('STAFF_PRIVATE_PATH_INVALID');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(process.platform!=='win32'){await fs.chmod(directory,0o700);return;}
  // Replace the DACL before secrets are written. No inherited/broad ACEs remain.
  const ps=script=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
    {windowsHide:true,timeout:10000,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const acl=(target,...args)=>execFileSync('icacls.exe',[target,...args],{windowsHide:true,timeout:10000,stdio:'ignore'});
  const readAcl=target=>JSON.parse(ps(`$a=Get-Acl -LiteralPath '${target.replaceAll("'","''")}';
    @{protected=$a.AreAccessRulesProtected;owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;
      rules=@($a.Access|ForEach-Object{@{sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights}})}|ConvertTo-Json -Depth 4 -Compress`));
  try{
    const sid=ps('[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
    if(!/^S-1-5-[0-9-]+$/.test(sid))throw new Error();
    const paths=[directory];try{await fs.access(bundlePath);paths.push(bundlePath);}catch(error){if(error.code!=='ENOENT')throw error;}
    for(const target of paths){
      acl(target,'/grant:r','*'+sid+(target===directory?':(OI)(CI)F':':F'));
      acl(target,'/setowner','*'+sid);acl(target,'/inheritance:r');
      for(const other of new Set(readAcl(target).rules.map(rule=>rule.sid).filter(value=>value!==sid))){
        if(!/^S-1-[0-9-]+$/.test(other))throw new Error();acl(target,'/remove','*'+other);
      }
      const verified=readAcl(target);
      if(verified.protected!==true||verified.owner!==sid||verified.rules.length!==1
        ||verified.rules[0].sid!==sid||verified.rules[0].type!=='Allow'||(verified.rules[0].rights&0x1f01ff)!==0x1f01ff)throw new Error();
    }
  }catch{fail('STAFF_PRIVATE_ACL_FAILED');}
}
async function readBundle(){
  const stat=await fs.lstat(bundlePath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)fail('STAFF_BUNDLE_INVALID');
  return validateStaffBundle(JSON.parse((await fs.readFile(bundlePath,'utf8')).replace(/^\uFEFF/,'')));
}
async function main(){
  const [command,file,...extra]=process.argv.slice(2);
  if(extra.length || !['prepare','import'].includes(command) || command==='prepare'&&file || command==='import'&&(!file||!path.isAbsolute(file)))fail('STAFF_CLI_ARGUMENTS_INVALID');
  await protectPrivateDirectory();
  if(command==='prepare'){
    let reused=false;
    try{await readBundle();reused=true;}catch(error){
      if(error.code!=='ENOENT')throw error;
      const bundle=await buildStaffBundle();const handle=await fs.open(bundlePath,'wx',0o600);
      try{await handle.writeFile(JSON.stringify(bundle,null,2)+'\n','utf8');}finally{await handle.close();}
    }
    console.log(JSON.stringify({status:'PREPARED_NOT_IMPORTED',accountsPrepared:5,sqlAccountsCreated:0,reused,credentialsFile:bundlePath}));return;
  }
  const stat=await fs.stat(file);if(stat.size>32768)fail('STAFF_IMPORT_APPROVAL_REQUIRED');
  const approval=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
  const result=await importStaff({bundle:await readBundle(),approval,gateway:createMaintenanceGateway()});
  const receipt=path.join(directory,'import-receipt-'+Date.now()+'.local.json');
  try{await fs.writeFile(receipt,JSON.stringify({...result,confirmedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx',mode:0o600});}
  catch{fail('STAFF_RECEIPT_WRITE_FAILED_SQL_CONFIRMED');}
  console.log(JSON.stringify({status:result.status,createdCount:result.createdCount,replayed:result.replayed,receipt}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(JSON.stringify({status:error?.code==='STAFF_RECEIPT_WRITE_FAILED_SQL_CONFIRMED'?'SQL_CONFIRMED_LOCAL_RECEIPT_FAILED':'NOT_CONFIRMED',code:/^STAFF_[A-Z_]+$/.test(error?.code||'')?error.code:'STAFF_CLI_FAILED',
    ...(Number.isInteger(error?.sqlErrorNumber)?{sqlErrorNumber:error.sqlErrorNumber}:{}),retryWithNewBatch:false}));process.exitCode=1;});
}
