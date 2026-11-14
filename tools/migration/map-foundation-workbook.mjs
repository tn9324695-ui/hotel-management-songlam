// Source-specific, read-only review. Workbook notes are data, not executable instructions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeFoundation} from './foundation-plan.mjs';
const names=['1_KhachSan_VanHanh','2_HangPhong','3_Phong','4_DichVu_Minibar','5_GiaPhong_PhuThu'];
const absent=v=>v==null||String(v).trim()===''||String(v).normalize('NFC').trim().toLowerCase().startsWith('chưa chốt');
const text=v=>absent(v)?null:String(v).trim();
const money=v=>!absent(v)&&/^\d{1,19}$/.test(String(v))?String(BigInt(v)):null;
const area=v=>!absent(v)&&/^\d{1,6}(?:\.\d{1,2})?$/.test(String(v))?String(v):null;
const time=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text(v)||'')?text(v)+':00':null;
const scalarPeople=v=>{const m=String(v).match(/^(\d+) người lớn$/);return m?Number(m[1]):null;};
const maxPeople=v=>{const m=String(v).match(/^Tối đa (\d+) người/);return m?Number(m[1]):null;};
export function mapFoundationWorkbook(extracted){
 if(!names.every(name=>extracted.sheets.some(s=>s.name===name)))throw new Error('WORKBOOK_LAYOUT_CHANGED');
 const sheets=Object.fromEntries(extracted.sheets.map(s=>[s.name,s]));
 const get=(sheet,address)=>sheets[sheet].rows.flatMap(r=>r.cells).find(c=>c.cell===address);
 const value=(sheet,address)=>{const c=get(sheet,address);return c?.formula?null:c?.value??null;};
 const issues=[],add=(code,sheet,range,reason)=>issues.push({code,sheet,range,reason});
 const provenance=[];const hotelSheet=names[0],typeSheet=names[1],roomSheet=names[2],serviceSheet=names[3],priceSheet=names[4];
 if(!String(value(typeSheet,'B3')).startsWith('Mã hạng phòng')||value(roomSheet,'A3')!=='Số phòng'
  ||value(serviceSheet,'F3')!=='Đơn giá (VND)'||!String(value(priceSheet,'A18')).startsWith('B. CHÍNH SÁCH'))throw new Error('WORKBOOK_LAYOUT_CHANGED');
 const hotel={name:text(value(hotelSheet,'B6')),address:text(value(hotelSheet,'B8')),phone:null,email:null,taxCode:null,timeZoneId:null,currency:null,
  workingDate:null,checkInTime:time(value(hotelSheet,'B16')),checkOutTime:time(value(hotelSheet,'B17'))};
 add('OPERATIONAL_DAY_MISSING',hotelSheet,'B15','Ngày nghiệp vụ chưa chốt; không dùng ngày khai trương hoặc ngày hiện tại thay thế.');
 add('CONTACT_SELECTION_REQUIRED',hotelSheet,'B9:B11','Có nhiều số điện thoại, email và mã số thuế trong cùng ô; cần chọn giá trị chính, không cắt chuỗi để vừa cột SQL.');
 add('HOTEL_ZONE_CURRENCY_CONFIRMATION_REQUIRED',hotelSheet,'A4:E19','Cần xác nhận múi giờ/tiền tệ theo cấu hình đích; không lấy giờ máy làm ngày nghiệp vụ.');
 const roomTypes=sheets[typeSheet].rows.filter(r=>/^\d+$/.test(value(typeSheet,'A'+r.row)||'')).map(r=>{
  const n=r.row,code=text(value(typeSheet,'B'+n)),suggestedCode=text(value(typeSheet,'C'+n));
  const row={sourceId:'XLSX_HANG_'+n,code,name:text(value(typeSheet,'D'+n)),areaM2:area(value(typeSheet,'H'+n)),
   standardOccupancy:scalarPeople(value(typeSheet,'E'+n)),maxOccupancy:maxPeople(value(typeSheet,'F'+n)),
   bedConfiguration:text(value(typeSheet,'G'+n)),description:text(value(typeSheet,'I'+n)),active:null};
  provenance.push({entity:'roomType',sourceId:row.sourceId,sheet:typeSheet,row:n,suggestedCode,proposedCodeApproved:false,
    occupancySource:{standard:value(typeSheet,'E'+n),maximum:value(typeSheet,'F'+n)}});
  if(code===null)add('PMS_ROOM_TYPE_CODE_UNCONFIRMED',typeSheet,'B'+n,'Mã cột C chỉ là gợi ý; chưa tự dùng thay mã PMS.');
  if(row.standardOccupancy===null||row.maxOccupancy===null)add('OCCUPANCY_NOT_SINGLE_VALUE',typeSheet,'E'+n+':F'+n,'Sức chứa chưa đủ một giá trị hợp lệ; không tự lấy min/max của khoảng.');
  return row;
 });
 const roomRows=sheets[roomSheet].rows.filter(r=>r.row>=4&&r.row<=9).map(r=>({sheet:roomSheet,row:r.row,
  classification:r.row<=6?'AGGREGATE_NOT_ROOM':'MEETING_FACILITY_NOT_GUEST_ROOM',source:Object.fromEntries(r.cells.map(c=>[c.cell,c.value]))}));
 add('NO_GUEST_ROOM_REGISTER',roomSheet,'A4:F9','Ba dòng tổng hợp và ba phòng hội nghị không phải danh sách phòng lưu trú; không mở rộng tổng 425 thành số phòng giả.');
 const services=sheets[serviceSheet].rows.filter(r=>/^\d+$/.test(value(serviceSheet,'A'+r.row)||'')).map(r=>{
  const n=r.row,p=money(value(serviceSheet,'F'+n));
  const item={sourceId:'XLSX_DV_'+n,code:text(value(serviceSheet,'B'+n)),name:text(value(serviceSheet,'C'+n)),category:null,unit:text(value(serviceSheet,'E'+n)),priceVnd:p,active:null};
  provenance.push({entity:'service',sourceId:item.sourceId,sheet:serviceSheet,row:n,sourceGroup:value(serviceSheet,'D'+n),notes:value(serviceSheet,'G'+n),
    classification:n<=6?'ACCOMMODATION_OR_BREAKFAST_FEE':n<=8?'COMPLIMENTARY_BENEFIT':n<=14?'VENUE_OR_SERVICE_GROUP':'SERVICE_FAMILY_NO_ITEM_PRICE'});
  if(item.code===null)add('SERVICE_CODE_UNCONFIRMED',serviceSheet,'B'+n,'Cần chốt mã dịch vụ và mã nhóm phù hợp trước nhập.');
  if(p===null)add('SERVICE_PRICE_UNCONFIRMED',serviceSheet,'F'+n,'Giá chưa chốt không được thay bằng 0.');
  return item;
 });
 add('FEE_CLASSIFICATION_AND_DEDUP_REQUIRED',serviceSheet,'A4:G17','Tách phụ thu chính sách, tiện ích miễn phí, địa điểm dịch vụ và SKU minibar; không tạo phí trùng từ phụ thu + ServiceOrder.');
 const rates=sheets[priceSheet].rows.filter(r=>r.row>=6&&r.row<=16).map(r=>({sheet:priceSheet,row:r.row,name:text(value(priceSheet,'B'+r.row)),
  publicPriceVnd:money(value(priceSheet,'C'+r.row)),agencyPriceVnd:money(value(priceSheet,'D'+r.row)),hourlyPriceVnd:money(value(priceSheet,'E'+r.row)),
  effectiveDate:text(value(priceSheet,'F'+r.row)),notes:text(value(priceSheet,'G'+r.row)),kind:'REFERENCE_NOT_APPROVED_RATE'}));
 add('RATE_BASIS_AND_EFFECTIVE_DATE_REQUIRED',priceSheet,'C6:F16','Giá công bố/đại lý là hai nguồn khác nhau; chưa có ngày hiệu lực/phiên bản chính sách, chưa bật tính giá.');
 add('EXACT_18_BOUNDARY_UNDEFINED',priceSheet,'C24:C25','Trước 18:00 và sau 18:00 để trống trường hợp đúng 18:00; cần chốt điều kiện biên.');
 add('BREAKFAST_UNIT_CONFLICT',priceSheet,'C27:E27','Nội dung ghi tiền/trẻ/bữa sáng nhưng cột đơn vị ghi trẻ/đêm; cần xác nhận đơn vị và cách tính.');
 for(const s of extracted.sheets)for(const r of s.rows)for(const c of r.cells)if(c.formula)add('FORMULA_NOT_EVALUATED',s.name,c.cell,'Không dùng cached formula làm dữ liệu đã chốt.');
 const candidate={format:'songlam.foundation-source.v1',batchId:'XLSX_'+extracted.sourceSha256.slice(0,16).toUpperCase(),sourceKind:'real',reviewedByOperator:false,
  hotel,businessDay:null,roomTypes,rooms:[],services,pricing:null};
 const validation=analyzeFoundation(candidate);
 const review={status:'BLOCKED_REVIEW_REQUIRED_NOT_IMPORTED',sourceSha256:extracted.sourceSha256,sqlWritesEnabled:false,externalVerificationPerformed:false,
  counts:{sheets:extracted.sheets.length,roomTypes:roomTypes.length,guestRooms:0,aggregateRoomRows:roomRows.filter(r=>r.classification==='AGGREGATE_NOT_ROOM').length,meetingFacilities:roomRows.filter(r=>r.classification==='MEETING_FACILITY_NOT_GUEST_ROOM').length,serviceReferences:services.length,
   serviceReferencesWithPrice:services.filter(s=>s.priceVnd!==null).length,explicitZeroPrices:services.filter(s=>s.priceVnd==='0').length,
   publicNightPrices:rates.filter(r=>r.publicPriceVnd!==null).length,agencyNightPrices:rates.filter(r=>r.agencyPriceVnd!==null).length,rateRowsWithEffectiveDate:rates.filter(r=>r.effectiveDate!==null).length},
  issues,provenance,excludedRoomRows:roomRows,referenceRates:rates,policyRows:sheets[priceSheet].rows.filter(r=>r.row>=20&&r.row<=29),validation};
 return {candidate,review};
}
async function main(){
 const [input,output,...extra]=process.argv.slice(2);if(extra.length||!isAbsolute(input||'')||!isAbsolute(output||''))throw new Error('ABSOLUTE_PATHS_REQUIRED');
 const extracted=JSON.parse((await readFile(input,'utf8')).replace(/^\uFEFF/,''));const {candidate,review}=mapFoundationWorkbook(extracted);
 await mkdir(output,{recursive:true});
 for(const [file,data] of [['foundation-candidate.local.json',candidate],['workbook-review.local.json',review]])await writeFile(join(output,file),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:review.status,counts:review.counts,sourceIssues:review.issues.length,validationIssues:review.validation.issues.length,sqlWritesEnabled:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error(JSON.stringify({status:'NOT_CONFIRMED',code:'WORKBOOK_MAPPING_REJECTED'}));process.exitCode=1;});
