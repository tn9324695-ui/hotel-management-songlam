// Driver-shaped fixture only. No real SQL connection, schema changes or accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createWindowsSqlProvider, loadWindowsSqlProvider } from '../src/adapters/sql/windows-provider.js';
import { startSqlRuntime, readSqlRuntimeManifest } from '../src/adapters/sql/runtime.js';
import { testConfig, startTestServer, exampleEnv } from './helpers.js';
import { loadConfig } from '../src/config/environment.js';

function fixture() {
  const plan=JSON.parse(readFileSync(new URL('../../deploy/sql-runtime.example.json',import.meta.url),'utf8'));
  plan.approved=true;plan.approvalReference='FIXTURE_ONLY';plan.expectedPrincipal='FIXTURE\\service';plan.principalApprovalReference='FIXTURE_ONLY';
  plan.passwordFormats=['pbkdf2-sha256-v1'];plan.passwordFormatApprovalReference='FIXTURE_ONLY';
  plan.profile.approved=true;plan.profile.approvalReference='FIXTURE_ONLY';plan.profile.target.backupReference='FIXTURE_ONLY';
  plan.profile.target.expectedDatabaseIdentity='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';plan.profile.target.expectedServerIdentity='fixture-server';
  for(const contract of Object.values(plan.profile.contracts))Object.assign(contract,{approved:true,approvalReference:'FIXTURE_ONLY'});
  Object.assign(plan.sessions,{approved:true,approvalReference:'FIXTURE_ONLY',sessionWritesApproved:true,sessionWriteApprovalReference:'FIXTURE_ONLY'});
  const state={created:0,connected:0,closed:0,calls:[],events:{},configs:[],probe:true,principal:plan.expectedPrincipal}, logs=[];
  const sql={BigInt:'BigInt',Int:'Int',MAX:'MAX',NVarChar:n=>'NVarChar('+n+')',VarChar:n=>'VarChar('+n+')',DateTime2:n=>'DateTime2('+n+')',ConnectionPool:class{
    constructor(config){state.created++;state.configs.push(config);this.connected=false;}
    on(name,listener){state.events[name]=listener;return this;}
    async connect(){state.connected++;this.connected=true;return this;}
    async close(){state.closed++;this.connected=false;}
    request(){return {input(){throw new Error('No input expected in startup probes');},async execute(proc){state.calls.push(proc);return {recordsets:[[proc.endsWith('AppEnvironment')?{DatabaseName:plan.profile.target.database,ServerIdentity:plan.profile.target.expectedServerIdentity,DatabaseIdentity:plan.profile.target.expectedDatabaseIdentity,Environment:'test',ContractVersion:'songlam.auth.v1'}:{Ready:state.probe}]]};}};}
  }};
  const config=testConfig({SQL_SERVER:plan.profile.target.server});
  const env={SONGLAM_SESSION_EPOCH:randomBytes(32).toString('base64url')};
  return {plan,state,logs,sql,options:{config,env,manifest:plan,logger:{error:row=>logs.push(row)},providerLoader:options=>createWindowsSqlProvider({...options,sql,principalProbe:()=>state.principal})}};
}
test('absent runtime file never loads native provider or connects; missing approvals are checked first',async()=>{
  let loaded=0;
  const runtime=await startSqlRuntime({config:testConfig(),providerLoader(){loaded++;}});
  assert.equal((await runtime.status()).sqlConnected,false);assert.equal(loaded,0);await runtime.close();
  for(const mutate of [f=>{f.plan.approved=false;},f=>{f.plan.sessions.sessionWritesApproved=false;},f=>{f.options.env={};},f=>{f.plan.principalApprovalReference='';},f=>{f.plan.passwordFormats=[];},f=>{f.plan.profile.target.server='other';}]){
    const f=fixture();mutate(f);f.options.providerLoader=()=>{loaded++;throw new Error('Must not load');};
    await assert.rejects(startSqlRuntime(f.options));assert.equal(loaded,0);assert.equal(f.state.created,0);
  }
});
test('service identity mismatch rejects BEFORE pool construction or connect, never adopts metadata Windows account',async()=>{
  const f=fixture();f.state.principal='FIXTURE\\metadata-admin';
  await assert.rejects(startSqlRuntime(f.options),{code:'SQL_SERVICE_PRINCIPAL_MISMATCH'});
  assert.equal(f.state.created,0);assert.equal(f.state.connected,0);
});
test('Windows driver options use same native types, explicit encryption and ODBC certificate policy; errors are safe',async()=>{
  const f=fixture(), runtime=await startSqlRuntime(f.options);
  const driver=f.state.configs[0];assert.equal(driver.driver,'ODBC Driver 17 for SQL Server');assert.equal(driver.options.trustedConnection,true);assert.equal(driver.options.encrypt,true);
  assert.equal(driver.options.trustServerCertificate,false);assert.equal(driver.user,undefined);assert.equal(driver.password,undefined);assert.equal(driver.connectionString,undefined);
  const connection={conn_str:'Driver={fixture};Encrypt=Yes'};driver.beforeConnect(connection);assert.match(connection.conn_str,/TrustServerCertificate=No;/);
  f.state.events.error(new Error('PRIVATE SQL PASSWORD'));assert.deepEqual(f.logs,[{event:'sql.pool_error',code:'SQL_POOL_UNAVAILABLE'}]);
  await runtime.close();assert.equal(f.state.closed,1);
});

test('test certificate exception needs its own reference and keeps native encryption enabled',async()=>{
  const f=fixture();f.plan.profile.transport.trustServerCertificate=true;
  await assert.rejects(startSqlRuntime(f.options),{code:'SQL_CERTIFICATE_APPROVAL_REQUIRED'});
  assert.equal(f.state.created,0);
  f.plan.profile.transport.certificateExceptionApprovalReference='FIXTURE_TEST_CERTIFICATE_EXCEPTION';
  const runtime=await startSqlRuntime(f.options);
  try{
    const config=f.state.configs[0];assert.equal(config.options.encrypt,true);assert.equal(config.options.trustServerCertificate,true);
    const native={conn_str:'Driver={fixture};Encrypt=Yes'};config.beforeConnect(native);
    assert.match(native.conn_str,/Encrypt=Yes/);assert.match(native.conn_str,/TrustServerCertificate=Yes;/);
    assert.equal((await runtime.status()).businessWritesEnabled,false);
  }finally{await runtime.close();}
});
test('runtime wires approved gateways into app but does not enable domain writes or create any session on startup',async t=>{
  const f=fixture();f.plan.contracts.catalogGateway={approved:true,approvalReference:'FIXTURE_ONLY',database:'SongLamPms_Design',environment:'test',protocol:'songlam.catalog.v1',actorMode:'app-user-parameter',procedure:'pms.fixtureCatalog',resources:{}};
  const runtime=await startSqlRuntime(f.options);t.after(runtime.close);
  assert.equal(runtime.appDependencies.catalogGateway.configured,true);assert.equal(runtime.appDependencies.bookingsGateway.configured,false);
  const status=await runtime.status();assert.equal(status.identityVerified,true);assert.equal(status.businessWritesEnabled,false);assert.deepEqual(status.modules,['catalogGateway']);
  assert.ok(f.state.calls.every(proc=>['pms.usp_AppEnvironment','pms.usp_WebSessionProbe'].includes(proc)));
  const {url}=await startTestServer(t,{config:f.options.config,...runtime.appDependencies,sqlRuntime:runtime});
  const res=await fetch(url+'/api/v1/connection/status');assert.equal(res.status,200);
  const text=await res.text();assert.doesNotMatch(text,/FIXTURE\\\\service|SONGLAM_SESSION|odbcDriver|approvalReference|profile/);
  const ready=await fetch(url+'/ready');assert.equal(ready.status,503);assert.equal((await ready.json()).data.ready,false);
});
test('failed S0 probe closes pool; bad or cross-target gateway manifests never open a provider',async()=>{
  const f=fixture();f.state.probe=false;await assert.rejects(startSqlRuntime(f.options),{code:'SQL_AUTH_BOOTSTRAP_UNAVAILABLE'});assert.equal(f.state.closed,1);
  const bad=fixture();bad.plan.contracts.catalogGateway={approved:true,approvalReference:'FIXTURE_ONLY',database:'other',environment:'test'};
  await assert.rejects(startSqlRuntime(bad.options),{code:'SQL_RUNTIME_CONTRACT_INVALID'});assert.equal(bad.state.created,0);
  const malformed=fixture();malformed.plan.contracts.catalogGateway={approved:true,approvalReference:'FIXTURE_ONLY',database:'SongLamPms_Design',environment:'test'};
  await assert.rejects(startSqlRuntime(malformed.options),{code:'SQL_RUNTIME_CONTRACT_INVALID'});assert.equal(malformed.state.closed,1);
});
test('startup rejects unsafe runtime file before listening; config errors never include secret path',()=>{
  assert.throws(()=>loadConfig({...exampleEnv,NODE_ENV:'development',SQL_SERVER:'.\\SQLEXPRESS',SQL_RUNTIME_FILE:'C:\\private\\runtime.json'}),error=>error.fields.includes('SQL_RUNTIME_FILE')&&!error.message.includes('private'));
  const result=spawnSync(process.execPath,['src/server.js'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:10000,env:{...process.env,...exampleEnv,SQL_SERVER:'.\\SQLEXPRESS',SQL_RUNTIME_FILE:'C:\\missing-private-runtime.json'}});
  assert.equal(result.status,1);assert.match(result.stderr,/SQL_RUNTIME_FILE_INVALID/);assert.doesNotMatch(result.stderr+result.stdout,/missing-private|server.listening/);
  assert.throws(()=>readSqlRuntimeManifest('relative.json'),{code:'SQL_RUNTIME_FILE_INVALID'});
});
test('installed native driver loads types without connecting (Windows only)',{skip:process.platform!=='win32'},()=>{
  const provider=loadWindowsSqlProvider({expectedPrincipal:'FIXTURE\\never-used',principalApprovalReference:'FIXTURE_ONLY',odbcDriver:'ODBC Driver 17 for SQL Server'});
  assert.equal(typeof provider.types.ConnectionPool,'function');assert.equal(typeof provider.types.NVarChar,'function');
});
