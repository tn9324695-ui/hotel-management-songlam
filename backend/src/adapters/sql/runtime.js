import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { SqlTestSetupError, validateSqlTestProfile } from './test-profile.js';
import { createSqlSessionStore } from './session-store.js';
import { createPasswordVerifier } from '../../modules/auth/password-verifier.js';
import { prepareApprovedTestAuth } from './auth-bootstrap.js';
import { loadWindowsSqlProvider } from './windows-provider.js';
import { createCatalogSqlGateway } from './catalog-gateway.js';
import { createPricingSqlGateway } from './pricing-gateway.js';
import { createBookingsSqlGateway } from './bookings-gateway.js';
import { createStaysSqlGateway } from './stays-gateway.js';
import { createStayPricingSqlGateway } from './stay-pricing-gateway.js';
import { createOperationsSqlGateway } from './operations-gateway.js';
import { createConsumptionSqlGateway } from './consumption-gateway.js';
import { createFinanceSqlGateway } from './finance-gateway.js';
import { createManagementSqlGateway } from './management-gateway.js';
import { createBookingTestSqlGateway } from './booking-test-gateway.js';

const factories = Object.freeze({ catalogGateway:createCatalogSqlGateway, pricingGateway:createPricingSqlGateway, bookingsGateway:createBookingsSqlGateway,
  staysGateway:createStaysSqlGateway, stayPricingGateway:createStayPricingSqlGateway, operationsGateway:createOperationsSqlGateway,
  consumptionGateway:createConsumptionSqlGateway, financeGateway:createFinanceSqlGateway, managementGateway:createManagementSqlGateway });
const fail = code => { throw new SqlTestSetupError(code); };
const ref = value => typeof value === 'string' && value.trim().length > 0;
const disabledStatus = () => ({ mode:'disabled', configured:false, sqlConnected:false, identityVerified:false, authentication:false, modules:[], businessWritesEnabled:false });
export function readSqlRuntimeManifest(file) {
  try {
    if (!isAbsolute(file) || statSync(file).size > 524288) throw new Error();
    const text = readFileSync(file,'utf8'); if (Buffer.byteLength(text)>524288) throw new Error();
    return JSON.parse(text.replace(/^\uFEFF/,''));
  } catch { fail('SQL_RUNTIME_FILE_INVALID'); }
}
export function validateSqlRuntimeManifest({ config, env = process.env, manifest } = {}) {
  if (config?.environment !== 'test') fail('SQL_RUNTIME_TEST_ENVIRONMENT_REQUIRED');
  let plan;
  try { plan=structuredClone(manifest); } catch { fail('SQL_RUNTIME_MANIFEST_INVALID'); }
  const fields=['format','approved','approvalReference','expectedPrincipal','principalApprovalReference','odbcDriver','profile','sessions','passwordFormats','passwordFormatApprovalReference','contracts','bookingTest'];
  if (!plan || Array.isArray(plan) || Object.keys(plan).some(key=>!fields.includes(key)) || plan.format!=='songlam.sql-runtime.v1'
    || plan.approved!==true || !ref(plan.approvalReference)) fail('SQL_RUNTIME_APPROVAL_REQUIRED');
  const profile=validateSqlTestProfile(plan.profile);
  if(profile.auth.mode!=='windows')fail('SQL_RUNTIME_WINDOWS_AUTH_REQUIRED');
  if(profile.target.database!==config.sql.database||profile.target.server!==config.sql.server||profile.transport.port!==config.sql.port)fail('SQL_RUNTIME_TARGET_MISMATCH');
  if(!/^[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+$/.test(plan.expectedPrincipal||'')||!ref(plan.principalApprovalReference))fail('SQL_SERVICE_PRINCIPAL_APPROVAL_REQUIRED');
  if(!ref(plan.passwordFormatApprovalReference)||!Array.isArray(plan.passwordFormats)||!createPasswordVerifier({formats:plan.passwordFormats}).configured)fail('SQL_PASSWORD_FORMAT_REQUIRED');
  if(!plan.contracts||typeof plan.contracts!=='object'||Array.isArray(plan.contracts)||Object.keys(plan.contracts).some(key=>!Object.hasOwn(factories,key)))fail('SQL_RUNTIME_CONTRACT_INVALID');
  for(const contract of Object.values(plan.contracts)){
    if(contract==null)continue;
    if(contract.approved!==true||!ref(contract.approvalReference)||contract.database!==profile.target.database||contract.environment!=='test'||contract.testOnly===true)fail('SQL_RUNTIME_CONTRACT_INVALID');
  }
  // S0 approval/epoch validation occurs before even loading a native provider.
  const validationTypes={BigInt:true,Int:true,VarChar:()=>{},DateTime2:()=>{}};
  let epoch;
  try { epoch=env.SONGLAM_SESSION_EPOCH; } catch { fail('SQL_SESSION_CONFIG_REQUIRED'); }
  if(!createSqlSessionStore({pool:{},types:validationTypes,manifest:plan.sessions,database:profile.target.database,environment:'test',epoch}).configured)fail('SQL_SESSION_CONFIG_REQUIRED');
  return {plan,profile,epoch};
}
export async function startSqlRuntime({ config, env = process.env, logger = {}, manifest,
  providerLoader = loadWindowsSqlProvider } = {}) {
  if (!config?.sql?.runtimeFile && manifest === undefined) return Object.freeze({ appDependencies:{}, status:disabledStatus, close:async()=>{} });
  const {plan,profile,epoch}=validateSqlRuntimeManifest({config,env,manifest:manifest??readSqlRuntimeManifest(config.sql.runtimeFile)});
  let provider;
  try { provider=providerLoader({expectedPrincipal:plan.expectedPrincipal,principalApprovalReference:plan.principalApprovalReference,odbcDriver:plan.odbcDriver,
    onPoolError:()=>logger.error?.({event:'sql.pool_error',code:'SQL_POOL_UNAVAILABLE'})});
    if(typeof provider.verifyPrincipal!=='function'||provider.verifyPrincipal()!==true)fail('SQL_SERVICE_PRINCIPAL_MISMATCH'); }
  catch(error){fail(error instanceof SqlTestSetupError?error.code:'SQL_NATIVE_DRIVER_UNAVAILABLE');}
  let openedPool;
  const createPool=options=>{openedPool=provider.createPool(options);
    const request=openedPool.request.bind(openedPool);
    openedPool.request=(...args)=>{const r=request(...args),execute=r.execute.bind(r);r.execute=async(procedure,...rest)=>{try{return await execute(procedure,...rest);}catch(error){logger.error?.({event:'sql.rpc_failed',procedure:/^pms\.[A-Za-z0-9_]+$/.test(procedure)?procedure:'REDACTED',number:error.number??error.originalError?.info?.number??null,code:/^[A-Z_]+$/.test(error.code||'')?error.code:'SQL_ERROR'});throw error;}};return r;};
    return openedPool;};
  const prepared=await prepareApprovedTestAuth({config,profile,sessionManifest:plan.sessions,epoch,passwordFormats:plan.passwordFormats,
    createPool,types:provider.types,secrets:env});
  try {
    const dependencies={authRuntime:prepared.authRuntime}, modules=[];
    for(const [key,factory] of Object.entries(factories)){
      const gateway=factory({pool:openedPool,types:provider.types,contract:plan.contracts[key]??undefined,environment:'test'});
      if(plan.contracts[key]&&gateway.configured!==true)fail('SQL_RUNTIME_CONTRACT_INVALID');
      dependencies[key]=gateway;if(gateway.configured)modules.push(key);
    }
    const bookingTestGateway=createBookingTestSqlGateway({pool:openedPool,types:provider.types,contract:plan.bookingTest,environment:'test'});
    if(plan.bookingTest?.checkIn){
      const c=plan.contracts.staysGateway;
      if(!dependencies.staysGateway?.configured||c?.procedures?.read!=='pms.usp_AppStayRead016'||c?.procedures?.prepare!=='pms.usp_AppCheckInPrepare'||c?.procedures?.commit!=='pms.usp_AppCheckInCommit'
        ||c.checkInFolioCreation?.approved!==true||c.checkInFolioCreation?.profile!=='ATOMIC_ROOM_FOLIO_V1'
        ||!c.policyApprovals?.some(p=>p.id===plan.bookingTest.checkIn.policy?.id&&p.hash===plan.bookingTest.checkIn.policy?.hash)
        ||!Array.isArray(c.operations)||!c.operations.includes('check-in')||c.operations.some(op=>!['list','detail','readiness','arrivals','check-in'].includes(op)))fail('SQL_RUNTIME_CONTRACT_INVALID');
    }
    if(plan.bookingTest){if(!bookingTestGateway.configured)fail('SQL_RUNTIME_CONTRACT_INVALID');await bookingTestGateway.inspect();dependencies.bookingTestGateway=bookingTestGateway;modules.push('customersGateway');}
    return Object.freeze({appDependencies:Object.freeze(dependencies),close:prepared.close,
      async status(){
        let authentication=false;try{authentication=(await prepared.authRuntime.status()).loginEnabled===true;}catch{}
        return {mode:'test-only',configured:true,sqlConnected:openedPool.connected===true,identityVerified:prepared.targetIdentityVerified,
          authentication,modules:[...modules],businessWritesEnabled:config.cutover.mode==='test-booking'&&bookingTestGateway.configured,
          ...(bookingTestGateway.configured?{writeScope:'TEST_CUSTOMERS_AND_BOOKING_ONLY',operationalCutover:false}:{})};
      }});
  } catch(error){await prepared.close();fail(error instanceof SqlTestSetupError?error.code:'SQL_RUNTIME_INITIALIZATION_FAILED');}
}
