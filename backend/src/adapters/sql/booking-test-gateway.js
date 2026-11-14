import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
import { createBookingMutationExtension, createCheckInExtension } from './booking-mutation-extension.js';
export function createBookingTestSqlGateway({pool,types,contract,environment}={}) {
  const m=structuredClone(contract||{}),expected={runtime:'pms.usp_WebBookingRuntime',receipt:'pms.usp_WebReceiptLookup',customer:'pms.usp_AppCustomerCreate'};
  const mutationExtension=createBookingMutationExtension({pool,types,manifest:m.mutations,baseDeploymentId:m.deploymentId});
  const checkInExtension=createCheckInExtension({pool,types,manifest:m.checkIn,baseDeploymentId:m.deploymentId});
  const configured=Boolean(pool&&types&&environment==='test'&&m.approved===true&&m.approvalReference==='USER-20261112-REAL-PRICING-CUSTOMER-BOOKING'
    &&m.database==='SongLamPms_Design'&&m.protocol==='songlam.booking-test.v1'&&m.actorMode==='app-user-parameter'
    &&m.deploymentId==='f916e0c6-20d4-477c-966f-dcd278dfb083'&&/^[a-f0-9]{64}$/.test(m.packageSha256||'')
    &&Array.isArray(m.definitions)&&m.definitions.length>=22&&Object.entries(expected).every(([key,value])=>m.procedures?.[key]===value)
    &&(!m.mutations||mutationExtension.configured)&&(!m.checkIn||checkInExtension.configured));
  async function call(kind,parameters={}) {
    if(!configured||pool.connected!==true)throw new AppError(503,'BOOKING_RUNTIME_UNAVAILABLE','Kết nối/hợp đồng SQL đặt phòng chưa sẵn sàng.');
    const request=pool.request();request.timeout=10000;
    for(const [name,type,value]of Object.values(parameters))request.input(name,type,value);
    try{return await request.execute(expected[kind]);}catch(error){
      const n=error.number??error.originalError?.info?.number;
      if(n===229||n===52403)throw new AppError(403,'FORBIDDEN','SQL Server từ chối quyền thao tác.');
      if(n===52404)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Khóa yêu cầu đã dùng cho nội dung khác.');
      if(n===54104)throw new AppError(409,'CUSTOMER_POSSIBLE_DUPLICATE','Số điện thoại/email đã có hồ sơ. Hãy tìm và chọn khách hiện có.');
      if(n===54100)throw new AppError(422,'CUSTOMER_INPUT_INVALID','Dữ liệu khách hoặc yêu cầu chưa hợp lệ.');
      throw new AppError(503,kind==='customer'?'CUSTOMER_OUTCOME_UNKNOWN':'BOOKING_RUNTIME_UNAVAILABLE',kind==='customer'?'Chưa xác định kết quả tạo khách. Giữ mã yêu cầu để tra cứu, không tạo lại với khóa mới.':'Không thể kiểm chứng SQL đặt phòng.');
    }
  }
  function payload(result){const rows=result?.recordsets?.[0];if(rows?.length!==1||typeof rows[0].PayloadJson!=='string'||rows[0].PayloadJson.length>1048576)throw new AppError(502,'SQL_RESPONSE_INVALID','Phản hồi SQL không đúng hợp đồng.');try{return JSON.parse(rows[0].PayloadJson);}catch{throw new AppError(502,'SQL_RESPONSE_INVALID','Phản hồi SQL không đúng JSON.');}}
  return Object.freeze({configured,manifest:m,mutationOperations:mutationExtension.operations,checkInOperations:checkInExtension.operations,
    async inspect(){
      const result=await call('runtime'),row=result.recordsets?.[0]?.[0],defs=result.recordsets?.[1];let release;
      try{release=JSON.parse(row.ReleaseJson);}catch{throw new AppError(503,'BOOKING_RELEASE_INVALID','Chưa xác minh bản SQL được phép chạy.');}
      if(row.DatabaseName!=='SongLamPms_Design'||row.ServerName!=='DESKTOP-9EPI86K\\SQLEXPRESS'||row.DatabaseGuid?.toUpperCase()!=='C4DD399E-5661-4741-A424-5ABFEEFBC1AC'
        ||release.deploymentId!==m.deploymentId||release.packageSha256!==m.packageSha256||release.backupSetUuid!==m.backupSetUuid||release.operationalCutover!==false
        ||!Array.isArray(defs)||defs.length!==m.definitions.length||m.definitions.some(d=>!defs.some(x=>x.Name===d.Name&&x.DefinitionSha256===d.DefinitionSha256&&Boolean(x.AnsiNullsOn)&&Boolean(x.QuotedIdentifierOn))))throw new AppError(503,'BOOKING_RELEASE_DRIFT','Target hoặc định nghĩa SQL đã thay đổi. Khóa ghi để rà soát.');
      if(m.mutations)await mutationExtension.inspect();
      if(m.checkIn)await checkInExtension.inspect();
      return {verified:true,releaseId:release.releaseId,deploymentId:m.deploymentId,verifiedAtUtc:new Date().toISOString(),testOnly:true,operationalCutover:false};
    },
    async createCustomer(actor,input,digest,key,requestId){assertActor(actor);if(!actor.permissions.includes('createBooking'))throw new AppError(403,'FORBIDDEN','Không có quyền tạo khách đặt phòng.');return payload(await call('customer',{
      actor:['AppUserId',types.BigInt,actor.appUserId],input:['InputJson',types.NVarChar(types.MAX),input],digest:['IntentHash',types.VarChar(64),digest],key:['IdempotencyKey',types.VarChar(120),key],request:['RequestId',types.NVarChar(80),requestId]}));},
    async lookup(actor,input,requestId){assertActor(actor);if(checkInExtension.operations.includes(input.operation))return checkInExtension.lookup(actor,input,requestId);if(mutationExtension.operations.includes(input.operation))return mutationExtension.lookup(actor,input,requestId);return payload(await call('receipt',{
      actor:['AppUserId',types.BigInt,actor.appUserId],operation:['Operation',types.VarChar(80),input.operation],key:['IdempotencyKey',types.VarChar(120),input.idempotencyKey],original:['OriginalRequestId',types.NVarChar(80),input.originalRequestId],request:['RequestId',types.NVarChar(80),requestId]}));}
  });
}
