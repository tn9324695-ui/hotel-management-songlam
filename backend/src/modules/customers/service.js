import { AppError } from '../../shared/errors.js';
import { assertActor } from '../auth/security.js';
import { shape,label,idempotencyKey } from '../bookings/validation.js';
import { canonicalIntent,intentHash } from '../bookings/intent.js';
export function createCustomersService({gateway}){
 return Object.freeze({async create(actor,body,key,requestId){
  assertActor(actor);if(!actor.permissions.includes('createBooking'))throw new AppError(403,'FORBIDDEN','Không có quyền tạo khách đặt phòng.');
  shape(body,['fullName','phone','email','notes','isTest'],['fullName']);
  const input={fullName:label(body.fullName,160,'fullName'),phone:label(body.phone,30,'phone',true),email:label(body.email,254,'email',true),notes:label(body.notes,800,'notes',true),isTest:body.isTest??false};
  if(typeof input.isTest!=='boolean'||input.phone&&!/^[+0-9][0-9 ()-]{4,29}$/.test(input.phone)||input.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))throw new AppError(422,'CUSTOMER_INPUT_INVALID','Điện thoại, email hoặc nhãn kiểm thử chưa hợp lệ.');
  if(input.phone)input.phone=input.phone.replace(/[ ()-]/g,'');
  if(!gateway?.configured)throw new AppError(503,'CUSTOMER_CONTRACT_PENDING','Chưa có hợp đồng SQL tạo khách.');
  const raw=await gateway.createCustomer(actor,canonicalIntent(input),intentHash(input),idempotencyKey(key),requestId),customer=raw?.customer;
  if(raw?.committed!==true||typeof raw.replayed!=='boolean'||typeof raw.operationId!=='string'||!customer||!/^[1-9]\d*$/.test(customer.id)||typeof customer.code!=='string'||typeof customer.fullName!=='string'||customer.active!==true)throw new AppError(502,'CUSTOMER_RECEIPT_INVALID','Chưa nhận receipt tạo khách hợp lệ. Giữ mã yêu cầu để đối chiếu.');
  return{committed:true,replayed:raw.replayed,operationId:raw.operationId,customer:{id:customer.id,code:customer.code,fullName:customer.fullName,phone:customer.phone??null,active:true}};
 }});
}
