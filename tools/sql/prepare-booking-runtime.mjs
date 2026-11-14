// Build the real test activation profile from the actual SQL deployment receipt.
// No SQL, fake PASS, secret generation, account/fixture seed or G12 activation.
import { readFile,writeFile } from 'node:fs/promises';
import { catalogResources } from '../../backend/src/modules/catalog/resources.js';
const approval='USER-20261112-REAL-PRICING-CUSTOMER-BOOKING';
if(process.argv.slice(2).join(' ')!==`--prepare --approval=${approval}`)throw new Error('EXPLICIT_APPROVAL_REQUIRED');
const directory=new URL('./private/booking012/',import.meta.url);
let deployed;try{deployed=JSON.parse(await readFile(new URL('current-deployment.json',directory),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;deployed=JSON.parse(await readFile(new URL('deployment.json',directory),'utf8'));}
if(deployed.approval!==approval||deployed.status!=='SQL_COMMITTED_NOT_YET_APP_VERIFIED'||deployed.definitions.length<22)throw new Error('REAL_SQL_DEPLOYMENT_RECEIPT_REQUIRED');
const old=JSON.parse((await readFile('C:/ProgramData/SongLamPmsTest/20261112-modules-3-4/runtime/manifest.json','utf8')).replace(/^\uFEFF/,''));
const m=structuredClone(old),r=deployed.release;
const scope={approved:true,approvalReference:approval,database:'SongLamPms_Design',environment:'test',actorMode:'app-user-parameter'};
m.contracts.catalogGateway={...m.contracts.catalogGateway,...scope,procedure:'pms.usp_AppReferenceRead'};
m.contracts.catalogGateway.resourceProcedures=Object.fromEntries(['roomTypes','rooms','services','hotelSettings','businessDays'].map(name=>[name,'pms.usp_AppCatalogRead']));
for(const name of ['ratePlans','rateRules','policyVersions','customers'])m.contracts.catalogGateway.resources[name]={operations:['list','detail'],filters:Object.keys(catalogResources[name].filters),pagination:true,maxLimit:catalogResources[name].maxLimit};
m.contracts.pricingGateway={...scope,protocol:'songlam.pricing.v1',procedure:'pms.usp_AppPricingContext',operations:['nightly','hourly'],
 policyApprovals:[{policyVersionId:r.policyVersionId,version:1,rulesSha256:r.policyHash,reference:approval}],
 calendarApprovals:[{sourceId:'SONGLAM_OWN_BASE_20261101',version:'1',reference:approval}],timeZoneMappings:{'SE Asia Standard Time':'Asia/Ho_Chi_Minh'}};
m.contracts.bookingsGateway={...scope,protocol:'songlam.bookings.v1',procedures:{read:'pms.usp_AppBookingRead',prepare:'pms.usp_AppBookingPrepare',commit:'pms.usp_AppBookingCommit'},
 operations:['availability','timeline','list','detail','create'],policyApprovals:[{id:r.bookingPolicyId,hash:r.bookingPolicyHash,reference:approval}],
 limits:{maxChanges:500,maxChangeBytes:4000000,maxRooms:50,maxGuestLinks:300},guarantees:{roomEligibility:'ROOM_ELIGIBILITY_V1',effectiveDemand:'HALF_OPEN_SINGLE_COUNT_V1',readOnlyPrepare:true,
 atomicBatch:true,inventoryLock:'SongLam:Inventory',inventoryRecheckedAtCommit:true,roomConflictsRecheckedAtCommit:true,groupAllOrNothing:true,optimisticVersions:true,allocationSetComparedAtCommit:true,
 noCashWrites:true,noHiddenMutationItems:true,idempotency:'ACTOR_OPERATION_INTENT_SHA256',g4SnapshotsValidatedAtCommit:true}};
m.bookingTest={...scope,protocol:'songlam.booking-test.v1',deploymentId:r.deploymentId,packageSha256:deployed.packageSha256,backupSetUuid:r.backupSetUuid,definitions:deployed.definitions,
 procedures:{runtime:'pms.usp_WebBookingRuntime',receipt:'pms.usp_WebReceiptLookup',customer:'pms.usp_AppCustomerCreate'}};
const release={format:'songlam.booking-test-release.v1',approved:true,approvalReference:approval,deploymentId:r.deploymentId,packageSha256:deployed.packageSha256,
 backupSetUuid:r.backupSetUuid,target:{server:'.\\SQLEXPRESS',database:'SongLamPms_Design',environment:'test'},allowedOperations:['customers.create','bookings.create','bookings.group'],operationalCutover:false};
await writeFile(new URL('manifest.json',directory),JSON.stringify(m,null,2)+'\n');await writeFile(new URL('booking-test-release.json',directory),JSON.stringify(release,null,2)+'\n');
console.log(JSON.stringify({status:'REAL_SQL_TEST_PROFILE_PREPARED_NOT_YET_STARTED',operations:release.allowedOperations,g12Activated:false}));
