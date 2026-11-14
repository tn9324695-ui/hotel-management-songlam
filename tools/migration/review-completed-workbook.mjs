// Read-only review for the second workbook layout. No SQL imports or policy activation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeFoundation} from './foundation-plan.mjs';
const sheets=['Khách sạn - vận hành','Hạng phòng','Phòng thực tế','Dịch vụ - minibar','Giá phòng','Phụ thu','Nguồn và phạm vi'];
const aliases=Object.freeze({PDK:'PRE-K',PDT:'PRE-T'});
const integer=v=>typeof v==='string'&&/^\d+$/.test(v)?Number(v):null;
const money=v=>typeof v==='string'&&/^\d{1,19}$/.test(v)?String(BigInt(v)):null;
export function excelDate(cell,date1904=false){
 if(!cell||cell.formula||cell.type!=='n'||!/^\d+$/.test(cell.value||''))return null;
 const days=Number(cell.value);if(!Number.isSafeInteger(days)||days<0||(!date1904&&days<=60))return null;
 const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30),stamp=epoch+days*86400000;
 if(!Number.isFinite(stamp)||stamp>Date.UTC(9999,11,31))return null;
 return new Date(stamp).toISOString().slice(0,10);
}
export function reviewCompletedWorkbook(source,decisions,priorCandidate){
 const byName=Object.fromEntries(source.sheets.map(s=>[s.name,s]));
 if(!sheets.every(name=>byName[name]))throw new Error('COMPLETED_WORKBOOK_LAYOUT_CHANGED');
 const cells=name=>byName[name].rows.flatMap(r=>r.cells),cell=(name,address)=>cells(name).find(c=>c.cell===address);
 const get=(name,address)=>{const c=cell(name,address);return c?.formula?null:c?.value??null;};
 if(get(sheets[1],'A1')!=='Mã nội bộ đề xuất'||get(sheets[2],'A1')!=='Số phòng mô phỏng'||get(sheets[4],'C1')!=='Giá đêm (VND)')throw new Error('COMPLETED_WORKBOOK_LAYOUT_CHANGED');
 if(decisions.workingDateStatus!=='CONFIRMED'||decisions.sqlExecutionApproved!==false||decisions.roomTypeCodesApproved!==true)throw new Error('EXPLICIT_OPERATOR_DECISIONS_REQUIRED');
 const approvedCodes=new Set(Object.values(decisions.roomTypeCodes));
 const targetCode=raw=>{const target=aliases[raw]||raw;if(!approvedCodes.has(target))throw new Error('UNAPPROVED_ROOM_TYPE_CODE');return target;};
 const countBy=(rows,key)=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].map(k=>[k,rows.filter(r=>r[key]===k).length]));
 const issues=[],add=(code,message,refs)=>issues.push({code,message,refs});
 const stateRows=byName[sheets[0]].rows.slice(1);
 const operation=field=>{const row=stateRows.find(r=>r.cells.some(c=>c.cell.startsWith('B')&&c.value===field));return row?get(sheets[0],'C'+row.row):null;};
 const operationalDate=excelDate(cell(sheets[0],'C7'),source.date1904);
 const hotel={name:operation('Tên'),address:operation('Địa chỉ'),phone:operation('Điện thoại'),email:operation('Email'),taxCode:null,
  timeZoneId:String(operation('Thời điểm trạng thái phòng')||'').includes('Asia/Ho_Chi_Minh')?'SE Asia Standard Time':null,
  currency:String(operation('Tiền tệ và làm tròn')||'').startsWith('VND;')?'VND':null,workingDate:decisions.workingDate,
  checkInTime:operation('Giờ nhận phòng')==='14:00'?'14:00:00':null,checkOutTime:operation('Giờ trả phòng')==='12:00'?'12:00:00':null};
 add('SIMULATION_SCOPE_CONFIRMATION_REQUIRED','Số phòng, giá và chính sách được nguồn đánh dấu giả định; chưa duyệt dùng làm dữ liệu thử.',['Nguồn và phạm vi!B9:B15']);
 const projectUseApproved=decisions.completedWorkbook?.sourceSha256===source.sourceSha256&&decisions.completedWorkbook.useAsProjectDataApproved===true;
 if(projectUseApproved)issues.splice(issues.findIndex(i=>i.code==='SIMULATION_SCOPE_CONFIRMATION_REQUIRED'),1);
 if(operationalDate!==hotel.workingDate)add('WORKING_DATE_OVERRIDDEN_BY_USER','Giữ ngày người dùng xác nhận; không để ngày trong file ghi đè.',['Khách sạn - vận hành!C7']);
 add('TEST_TAX_ID_NOT_LEGAL_ID','MST-DEMO-SONGLAM là mã giả; không dùng làm MST thật.',['Khách sạn - vận hành!C6:F6']);
 const declared=[],typeRows=byName[sheets[1]].rows.slice(1).map(r=>{
  const n=r.row,raw=get(sheets[1],'A'+n),code=targetCode(raw);declared.push({sourceCode:raw,code,count:integer(get(sheets[1],'I'+n))});
  return {sourceId:'XLSX2_TYPE_'+raw,code,name:get(sheets[1],'B'+n),areaM2:get(sheets[1],'C'+n),standardOccupancy:integer(get(sheets[1],'E'+n)),maxOccupancy:integer(get(sheets[1],'F'+n)),
   bedConfiguration:get(sheets[1],'D'+n),description:get(sheets[1],'J'+n),active:null};
 });
 const typeCodes=new Set(typeRows.map(r=>r.code)),retained=[];
 for(const code of approvedCodes)if(!typeCodes.has(code)){
  const prior=priorCandidate?.roomTypes.find(r=>r.code===code);if(!prior)throw new Error('APPROVED_MASTER_TYPE_MISSING');
  typeRows.push({...structuredClone(prior),active:null});retained.push(code);
 }
 if(retained.length)add('PRIOR_APPROVED_TYPES_RETAINED','Giữ hạng đã chốt nhưng vắng trong bản mới; không tự tạo phòng hoặc giá cho hạng này.',retained);
 const maintenance=[],rows=byName[sheets[2]].rows.slice(1).map(r=>{
  const n=r.row,rawCode=get(sheets[2],'B'+n),exploitation=get(sheets[2],'E'+n),clean=get(sheets[2],'D'+n);
  if(get(sheets[2],'F'+n)!=='Giả định đồ án')throw new Error('ROOM_SOURCE_CLASSIFICATION_CHANGED');
  const cleanlinessStatus={'Sạch':'CLEAN','Bẩn':'DIRTY','Đang dọn':'CLEANING'}[clean];
  if(!cleanlinessStatus||!['Khai thác','Bảo trì','Ngừng'].includes(exploitation))throw new Error('UNKNOWN_INITIAL_ROOM_STATE');
  const room={sourceId:'XLSX2_ROOM_'+get(sheets[2],'A'+n),number:get(sheets[2],'A'+n),roomTypeCode:targetCode(rawCode),floor:get(sheets[2],'C'+n),
    cleanlinessStatus,active:exploitation==='Bảo trì'?null:exploitation==='Khai thác',notes:get(sheets[2],'G'+n)};
  if(exploitation==='Bảo trì')maintenance.push({sourceRow:n,number:room.number,exploitationStatus:'MAINTENANCE',source:sheets[2]+'!A'+n+':G'+n,intervalApproved:false});
  return room;
 });
 const actualByType=countBy(rows,'roomTypeCode');
 for(const item of declared)if((actualByType[item.code]||0)!==item.count)throw new Error('DECLARED_ROOM_COUNT_MISMATCH');
 if(new Set(rows.map(r=>r.number)).size!==rows.length)throw new Error('DUPLICATE_ROOM_NUMBER');
 if(maintenance.length)add('MAINTENANCE_CANNOT_BE_FLATTENED','Cần block/ticket đúng khoảng thời gian và actor theo hợp đồng G7; không đổi maintenance thành inactive hoặc sạch.',maintenance.map(r=>r.source));
 add('TYPE_AND_SERVICE_ACTIVE_UNSPECIFIED','Cột trạng thái nguồn là phân loại dữ liệu, không phải IsActive; cần chốt trạng thái kích hoạt.',['Hạng phòng!G2:G11','Dịch vụ - minibar!F2:F16']);
 const groupCodes={'Ẩm thực':'FNB','Spa':'SPA','Vận chuyển':'TRANSPORT','Giặt là':'LAUNDRY','Minibar':'MINIBAR','Miễn phí':'COMPLIMENTARY'};
 const services=byName[sheets[3]].rows.slice(1).map(r=>{const n=r.row;return {sourceId:'XLSX2_SERVICE_'+get(sheets[3],'A'+n),code:get(sheets[3],'A'+n),name:get(sheets[3],'B'+n),category:groupCodes[get(sheets[3],'C'+n)]||null,
  unit:get(sheets[3],'D'+n),priceVnd:money(get(sheets[3],'E'+n)),active:null};});
 add('SERVICE_GROUP_MAPPING_PROPOSED','Mã nhóm FNB/SPA/TRANSPORT/LAUNDRY/MINIBAR/COMPLIMENTARY là ánh xạ đề xuất, chưa áp dụng.',[]);
 const prices=byName[sheets[4]].rows.slice(1).map(r=>{const n=r.row;return {sourceCode:get(sheets[4],'A'+n),code:targetCode(get(sheets[4],'A'+n)),nightlyVnd:money(get(sheets[4],'C'+n)),hourlySixHourVnd:money(get(sheets[4],'D'+n)),
  validFrom:excelDate(cell(sheets[4],'E'+n),source.date1904),validThrough:excelDate(cell(sheets[4],'F'+n),source.date1904),status:get(sheets[4],'G'+n),kind:'SIMULATED_POLICY_NOT_ACTIVATED'};});
 if(prices.some(p=>p.validFrom&&hotel.workingDate<p.validFrom))add('NO_RATE_FOR_EARLIER_BUSINESS_DAYS','Giá bắt đầu sau ngày nghiệp vụ; không tự kéo lùi ngày hiệu lực hoặc bổ sung giá cho khoảng trống.',['Giá phòng!E2:F11']);
 add('PRICING_AND_POLICY_CONTRACT_PENDING','Giá, gói 6 giờ, chuyển giá đêm, cọc/hủy/hoàn và phụ thu cần duyệt riêng; không kích hoạt từ văn bản Excel.',['Khách sạn - vận hành!C14:C34','Phụ thu!A2:H11']);
 const candidate={format:'songlam.foundation-source.v1',batchId:'XLSX2_'+source.sourceSha256.slice(0,16).toUpperCase(),sourceKind:'test',reviewedByOperator:false,
   hotel,businessDay:null,roomTypes:typeRows,rooms:rows,services,pricing:null};
 return {candidate,review:{status:projectUseApproved?'PROJECT_SOURCE_ACCEPTED_IMPORT_CONTRACT_PENDING':'SIMULATED_SOURCE_PENDING_APPROVAL_NOT_IMPORTED',sourceSha256:source.sourceSha256,projectUseApproved,
  sourceDeclaredClassification:'Giả định đồ án',independentlyVerifiedHotelData:false,sqlWritesEnabled:false,operatorWorkingDate:hotel.workingDate,workbookWorkingDate:operationalDate,
  typeCodeAliases:aliases,retainedPriorCodes:retained,counts:{sourceRoomTypes:declared.length,candidateMasterRoomTypes:typeRows.length,rooms:rows.length,uniqueRooms:new Set(rows.map(r=>r.number)).size,services:services.length,prices:prices.length},
  roomCountsByType:actualByType,roomCountsByCleanliness:countBy(rows,'cleanlinessStatus'),maintenance,prices,issues,validation:analyzeFoundation(candidate),
  policies:byName[sheets[5]],scope:byName[sheets[6]],sourceStateSnapshot:operation('Thời điểm trạng thái phòng'),proposedTimeZoneMapping:'Asia/Ho_Chi_Minh -> SE Asia Standard Time'}};
}
async function main(){
 const [sourceFile,decisionsFile,priorFile,out,...extra]=process.argv.slice(2);
 if(extra.length||![sourceFile,decisionsFile,priorFile,out].every(p=>isAbsolute(p||'')))throw new Error('ABSOLUTE_PATHS_REQUIRED');
 const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
 const result=reviewCompletedWorkbook(await load(sourceFile),await load(decisionsFile),await load(priorFile));await mkdir(out,{recursive:true});
 for(const [name,value] of [['foundation-candidate.local.json',result.candidate],['workbook-review.local.json',result.review]])await writeFile(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.review.status,counts:result.review.counts,workingDate:result.candidate.hotel.workingDate,retained:result.review.retainedPriorCodes,maintenanceRooms:result.review.maintenance.length,sqlWritesEnabled:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error(JSON.stringify({status:'NOT_CONFIRMED',code:'COMPLETED_WORKBOOK_REVIEW_REJECTED'}));process.exitCode=1;});
