// Independent fixtures. No real source files or database accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {excelDate,reviewCompletedWorkbook} from '../../tools/migration/review-completed-workbook.mjs';
function fixture(){
 const names=['Khách sạn - vận hành','Hạng phòng','Phòng thực tế','Dịch vụ - minibar','Giá phòng','Phụ thu','Nguồn và phạm vi'];
 const data=[{B2:'Tên',C2:'Fixture',B3:'Địa chỉ',C3:'Fixture',B4:'Điện thoại',C4:'123',B5:'Email',C5:'fixture@example.test',B7:'Ngày bắt đầu nghiệp vụ PMS',C7:'46327',B8:'Giờ nhận phòng',C8:'14:00',B9:'Giờ trả phòng',C9:'12:00',B12:'Thời điểm trạng thái phòng',C12:'Asia/Ho_Chi_Minh',B13:'Tiền tệ và làm tròn',C13:'VND; fixture'},
 {A1:'Mã nội bộ đề xuất',A2:'PDK',B2:'Fixture premium',C2:'43',D2:'Fixture bed',E2:'2',F2:'3',I2:'1',J2:'Fixture'},
 {A1:'Số phòng mô phỏng',A2:'501',B2:'PDK',C2:'5',D2:'Bẩn',E2:'Bảo trì',F2:'Giả định đồ án',G2:'Fixture'},
 {A1:'Header',A2:'FREE-01',B2:'Fixture free item',C2:'Miễn phí',D2:'Chai',E2:'0'},
 {C1:'Giá đêm (VND)',A2:'PDK',C2:'1500000',D2:'900000',E2:'46327',F2:'46752',G2:'Giá giả định'},
 {A1:'Header'}, {A1:'Header'}];
 const source={sourceSha256:'b'.repeat(64),date1904:false,sheets:names.map((name,i)=>{
  const rows=new Map();for(const [address,value] of Object.entries(data[i])){const row=Number(address.match(/\d+/)[0]);if(!rows.has(row))rows.set(row,{row,cells:[]});rows.get(row).cells.push({cell:address,value,type:address==='C7'||address==='E2'||address==='F2'?'n':'inlineStr',formula:null});}
  return {name,rows:[...rows.values()].sort((a,b)=>a.row-b.row)};
 })};
 const decisions={roomTypeCodesApproved:true,roomTypeCodes:{a:'PRE-K',b:'DLX-TR'},workingDateStatus:'CONFIRMED',workingDate:'2026-10-11',sqlExecutionApproved:false};
 const prior={roomTypes:[{sourceId:'OLD_TRIPLE',code:'DLX-TR',name:'Fixture triple',areaM2:null,standardOccupancy:3,maxOccupancy:4,bedConfiguration:null,description:null,active:null}]};
 return {source,decisions,prior};
}
test('Excel date serials preserve epochs without accepting the fictional 1900 leap day',()=>{
 const c={type:'n',value:'46327',formula:null};assert.equal(excelDate(c),'2026-11-01');
 assert.equal(excelDate({...c,value:'60'}),null);assert.equal(excelDate({...c,formula:'TODAY()'}),null);
 assert.equal(excelDate({...c,value:'0'},true),'1904-01-01');
});
test('operator date/codes override workbook without erasing absent type or flattening maintenance',()=>{
 const {source,decisions,prior}=fixture(),before=structuredClone(source);
 const {candidate,review}=reviewCompletedWorkbook(source,decisions,prior);
 assert.deepEqual(source,before);assert.equal(candidate.hotel.workingDate,'2026-10-11');assert.equal(review.workbookWorkingDate,'2026-11-01');
 assert.equal(candidate.rooms[0].roomTypeCode,'PRE-K');assert.equal(candidate.rooms[0].active,null);assert.equal(review.maintenance.length,1);
 assert.ok(candidate.roomTypes.some(r=>r.code==='DLX-TR'));assert.equal(candidate.services[0].priceVnd,'0');
 assert.equal(candidate.sourceKind,'test');assert.equal(candidate.reviewedByOperator,false);assert.equal(review.sqlWritesEnabled,false);
 assert.ok(review.issues.some(i=>i.code==='NO_RATE_FOR_EARLIER_BUSINESS_DAYS'));assert.equal(candidate.pricing,null);
});
test('duplicate room numbers, count mismatches and unapproved type codes stop review',()=>{
 const first=fixture();first.source.sheets[2].rows.push(structuredClone(first.source.sheets[2].rows[1]));
 assert.throws(()=>reviewCompletedWorkbook(first.source,first.decisions,first.prior),/DECLARED_ROOM_COUNT_MISMATCH|DUPLICATE_ROOM_NUMBER/);
 const second=fixture();second.source.sheets[1].rows[1].cells.find(c=>c.cell==='A2').value='UNKNOWN';
 assert.throws(()=>reviewCompletedWorkbook(second.source,second.decisions,second.prior),/UNAPPROVED_ROOM_TYPE_CODE/);
});
