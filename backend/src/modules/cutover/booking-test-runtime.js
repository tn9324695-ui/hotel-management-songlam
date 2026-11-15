// Real SQL test activation, distinct from G12 operational cutover. Never accepts
// manufactured G11 PASS gates. Mutations require their own live SQL proof.
import { readFileSync } from 'node:fs';
import { AppError } from '../../shared/errors.js';
import { nonBusinessWrite, matchOperation, cutoverOperations } from './operations.js';
const baseAllowed=['customers.create','bookings.create','bookings.group'];
export function createBookingTestRuntime({config,gateway,auth,logger}) {
  if(config.environment!=='test'||config.cutover.mode!=='test-booking'||!gateway?.configured||auth.fixture)throw new AppError(503,'BOOKING_TEST_RUNTIME_REQUIRED','Chưa cấu hình phạm vi chạy thử SQL.');
  let release;try{release=JSON.parse(readFileSync(config.cutover.releaseFile,'utf8').replace(/^\uFEFF/,''));}catch{throw new AppError(503,'BOOKING_TEST_RELEASE_REQUIRED','Thiếu hồ sơ mở thử đặt phòng.');}
  const operationsOps = release.operations?.writesEnabled === true ? (release.operations.allowedOperations || []) : [];
  const consumptionOps = release.consumption?.writesEnabled === true ? (release.consumption.allowedOperations || []) : [];
  const financeOps = release.finance?.writesEnabled === true ? (release.finance.allowedOperations || []) : [];
  const stayOps = release.stays?.writesEnabled === true ? (release.stays.allowedOperations || []) : [];
  const allowed = [...baseAllowed, ...(gateway.mutationOperations || []), ...(release.checkIn?.writesEnabled === true ? (gateway.checkInOperations || []) : []), ...operationsOps, ...consumptionOps, ...financeOps, ...stayOps];
  if(release.format!=='songlam.booking-test-release.v1'||release.approved!==true||release.approvalReference!==gateway.manifest.approvalReference
    ||release.deploymentId!==gateway.manifest.deploymentId||release.packageSha256!==gateway.manifest.packageSha256||release.backupSetUuid!==gateway.manifest.backupSetUuid
    ||release.target?.server!==config.sql.server||release.target?.database!==config.sql.database||release.target?.environment!=='test'
    ||release.operationalCutover!==false||release.allowedOperations?.length!==allowed.length||allowed.some(id=>!release.allowedOperations.includes(id)))throw new AppError(503,'BOOKING_TEST_RELEASE_INVALID','Phạm vi chạy thử chưa được xác minh.');
  if(gateway.manifest.mutations && (release.mutations?.packageSha256!==gateway.manifest.mutations.packageSha256
    ||release.mutations?.approvalReference!==gateway.manifest.mutations.approvalReference||release.mutations?.backupSetUuid!==gateway.manifest.mutations.backupSetUuid))throw new AppError(503,'BOOKING_TEST_RELEASE_INVALID','Hồ sơ đổi/hủy phòng chưa khớp hợp đồng đã triển khai.');
  if(gateway.manifest.checkIn && (release.checkIn?.packageSha256!==gateway.manifest.checkIn.packageSha256||release.checkIn?.approvalReference!==gateway.manifest.checkIn.approvalReference||release.checkIn?.backupSetUuid!==gateway.manifest.checkIn.backupSetUuid))throw new AppError(503,'BOOKING_TEST_RELEASE_INVALID','Hồ sơ nhận phòng chưa khớp SQL đã triển khai.');
  const pending=new Set();let stopped=false;
  async function status(){let verified=false,at=null;try{const [sql,identity]=await Promise.all([gateway.inspect(),auth.status()]);verified=sql.verified===true&&identity.loginEnabled===true;at=sql.verifiedAtUtc;}catch{}
    const writable=verified&&!stopped&&pending.size===0;
    return {mode:'sql',testOnly:true,operationalCutover:false,writable,legacyWritable:false,buildId:config.cutover.buildId,deploymentId:release.deploymentId,
      status:writable?'TEST_BOOKING_WRITES_ENABLED':'TEST_BOOKING_WRITES_LOCKED',blockers:[...(!verified?['BOOKING_SQL_VERIFICATION_FAILED']:[]),...(stopped?['OPERATOR_STOP']:[]),...(pending.size?['UNKNOWN_REQUEST_REQUIRES_LOOKUP']:[])],
      operations:writable?cutoverOperations.filter(x=>allowed.includes(x.operation)):[],mutationOperationsVerified:verified&&(gateway.mutationOperations?.length===3),checkInOperationsVerified:verified&&release.checkIn?.writesEnabled===true&&(gateway.checkInOperations?.length===1),checkInReadVerified:verified&&(gateway.checkInOperations?.length===1),
      checkInWriteBlocker:release.checkIn?.writesEnabled===true?null:(release.checkIn?.writeBlocker==='BUSINESS_DATE_REVIEW_REQUIRED'?'BUSINESS_DATE_REVIEW_REQUIRED':'CHECK_IN_WRITES_NOT_RELEASED'),verifiedAtUtc:at,counters:{unknownCount:pending.size}};
  }
  return Object.freeze({mode:'sql',testOnly:true,release,status,publicState:status,receiptGateway:gateway,canLookup:()=>gateway.configured,
    observe(req,res,next){
      const unknown=()=>{if(req.cutoverCommand){pending.add(req.requestId);logger.error?.({event:'booking-test.outcome_unknown',requestId:req.requestId,operation:req.cutoverCommand});}};
      res.on('close',()=>{if(!res.writableFinished)unknown();});res.on('finish',()=>{if(res.statusCode>=500)unknown();});next();
    },
    async guard(req,_res,next){if(nonBusinessWrite(req.method,req.path))return next();try{const s=await status(),op=matchOperation(req.method,req.path);
      if(!s.writable||!op||!allowed.includes(op.operation))throw new AppError(503,'CUTOVER_WRITE_LOCKED','Chỉ mở thao tác trong hồ sơ SQL chạy thử đã xác minh. Nghiệp vụ khác chưa khả dụng.');
      if(req.get('X-PMS-Deployment')!==release.deploymentId)throw new AppError(409,'DEPLOYMENT_CHANGED','Nguồn ghi đã thay đổi. Tải lại màn hình.');
      if(!/^[A-Za-z0-9._:-]{1,120}$/.test(req.get('Idempotency-Key')||'')||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.get('X-Request-ID')||'')||req.get('X-Request-ID')!==req.requestId)throw new AppError(400,'IDEMPOTENCY_REQUIRED','Cần UUID yêu cầu gốc và khóa chống gửi lặp.');
      req.cutoverCommand=op.operation;next();}catch(error){next(error);}},
    resolveReceipt(originalRequestId,result){if(result==='COMMITTED'||result==='REJECTED')pending.delete(originalRequestId);},
    stop(){stopped=true;}
  });
}
