// No SQL/activation. A real separately approved deployment receipt is required.
import{readFile,writeFile}from'node:fs/promises';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--prepare'||!args[1].startsWith('--approval='))throw Error('EXPLICIT_APPROVAL_REQUIRED');
const approval=args[1].slice(11),root=new URL('../../',import.meta.url),dir=new URL('tools/sql/private/lifecycle/',root);
const review=JSON.parse(await readFile(new URL('docs/artifacts/checkin-016-review.json',root),'utf8'));
let receipt;try{receipt=JSON.parse(await readFile(new URL('deployment-016.json',dir),'utf8'));}catch{throw Error('ACTUAL_APPROVED_016_RECEIPT_REQUIRED');}
if(!approval||receipt.approvalReference!==approval||receipt.status!=='SQL_016_COMMITTED'||receipt.packageSha256!==review.packageSha256
 ||receipt.baseDeploymentId!==review.baseDeploymentId||receipt.target?.databaseGuid!==review.target.databaseGuid||receipt.backupVerifyOnlyPassed!==true
 ||receipt.policy?.id!==review.policy.id||receipt.policy?.hash!==review.policy.hash||receipt.sourcePolicyVersionId!==review.sourcePolicyVersionId
 ||receipt.definitions?.length!==8||!/^[a-f0-9-]{36}$/i.test(receipt.backupSetUuid||'')||receipt.operationalCutover!==false)throw Error('ACTUAL_APPROVED_016_RECEIPT_REQUIRED');
const baseDir=new URL('tools/sql/private/booking012/',root),manifest=JSON.parse(await readFile(new URL('manifest.json',baseDir),'utf8')),release=JSON.parse(await readFile(new URL('booking-test-release.json',baseDir),'utf8'));
const extension={approved:true,protocol:'songlam.check-in.v1',database:'SongLamPms_Design',environment:'test',approvalReference:approval,
 baseDeploymentId:receipt.baseDeploymentId,packageSha256:receipt.packageSha256,backupSetUuid:receipt.backupSetUuid,definitions:receipt.definitions,policy:receipt.policy,sourcePolicyVersionId:receipt.sourcePolicyVersionId};
manifest.bookingTest.checkIn=extension;
manifest.contracts.staysGateway={approved:true,approvalReference:approval,database:'SongLamPms_Design',environment:'test',protocol:'songlam.stays.v1',actorMode:'app-user-parameter',
 procedures:{read:'pms.usp_AppStayRead016',prepare:'pms.usp_AppCheckInPrepare',commit:'pms.usp_AppCheckInCommit'},operations:['list','detail','arrivals','readiness','check-in'],
 policyApprovals:[{id:receipt.policy.id,hash:receipt.policy.hash,reference:approval}],checkInFolioCreation:{approved:true,profile:'ATOMIC_ROOM_FOLIO_V1',reference:approval},
 limits:{maxChanges:500,maxChangeBytes:4000000,maxUnits:25},guarantees:{roomEligibility:'ROOM_ELIGIBILITY_V1',inventoryLock:'SongLam:Inventory',idempotency:'ACTOR_OPERATION_INTENT_SHA256',
 readOnlyPrepare:true,atomicBatch:true,versionAndSegmentSetRechecked:true,currentOccupancyUnique:true,singleEffectiveDemand:true,noCashWrites:true,folioNotClosed:true,noHiddenMutationItems:true,auditActorAtomic:true,
 readinessAndAllocationRechecked:true,selectedRoomsAtomic:true,lockedPriceSnapshotCopied:true,guestsAndRoomChargesAtomic:true,verifiedDepositOnly:true,authorizedUpgradeRechecked:true,checkInFolioCreationAtomic:true}};
// Reads may be activated after deployment, but writes require separate live
// business-date verification. Never open writes just because DDL committed.
const verification=JSON.parse(await readFile(new URL('verification-016.json',dir),'utf8'));
release.checkIn={approvalReference:approval,packageSha256:receipt.packageSha256,backupSetUuid:receipt.backupSetUuid,writesEnabled:false,
 writeBlocker:verification.checkInDateReady===false?'BUSINESS_DATE_REVIEW_REQUIRED':'CHECK_IN_WRITES_NOT_RELEASED'};release.allowedOperations=release.allowedOperations.filter(op=>op!=='stays.checkIn');
await writeFile(new URL('manifest-016.prepared.json',dir),JSON.stringify(manifest,null,2));await writeFile(new URL('release-016.prepared.json',dir),JSON.stringify(release,null,2));
console.log(JSON.stringify({status:'CHECKIN_PROFILE_PREPARED_NOT_ACTIVATED',operationalCutover:false}));
