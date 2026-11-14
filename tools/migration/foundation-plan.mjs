// Read-only internal planner. No SQL driver, browser access or import command.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const fields=['format','batchId','sourceKind','reviewedByOperator','hotel','businessDay','roomTypes','rooms','services','pricing'];
const date=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v;
const code=(v,max)=>text(v,max)&&/^[A-Za-z0-9_.-]+$/.test(v);
const closed=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
export function analyzeFoundation(source){
 const issues=[],bad=(path,reason)=>issues.push({path,reason});
 if(!closed(source,fields)||source.format!=='songlam.foundation-source.v1')return {status:'BLOCKED',issues:[{path:'$',reason:'SOURCE_FORMAT_INVALID'}],sqlWritesEnabled:false};
 if(!code(source.batchId,60))bad('batchId','EXPLICIT_BATCH_REQUIRED');
 if(!['real','test'].includes(source.sourceKind))bad('sourceKind','REAL_OR_TEST_MUST_BE_DECLARED');
 if(source.reviewedByOperator!==true)bad('reviewedByOperator','OPERATOR_DATA_REVIEW_REQUIRED');
 const h=source.hotel;
 if(!closed(h,['name','address','phone','email','taxCode','timeZoneId','currency','workingDate','checkInTime','checkOutTime']))bad('hotel','HOTEL_SETTINGS_REQUIRED');
 else{
  if(!text(h.name,200))bad('hotel.name','NAME_REQUIRED');
  if(h.timeZoneId!=='SE Asia Standard Time')bad('hotel.timeZoneId','EXISTING_SQL_CHECK_REQUIRES_SE_ASIA_STANDARD_TIME');
  if(h.currency!=='VND')bad('hotel.currency','EXISTING_SQL_CHECK_REQUIRES_VND');
  if(!date(h.workingDate))bad('hotel.workingDate','EXPLICIT_VALID_WORKING_DATE_REQUIRED');
  for(const key of ['checkInTime','checkOutTime'])if(!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(h[key]||''))bad('hotel.'+key,'EXPLICIT_TIME_REQUIRED');
  for(const [key,max] of [['address',500],['phone',30],['email',254],['taxCode',30]])if(h[key]!==null&&!text(h[key],max))bad('hotel.'+key,'EXPLICIT_TEXT_OR_NULL_REQUIRED');
 }
 if(!closed(source.businessDay,['date','status'])||!date(source.businessDay.date)||source.businessDay.status!=='OPEN'||source.businessDay.date!==h?.workingDate)bad('businessDay','MATCHING_EXPLICIT_OPEN_DAY_REQUIRED_NO_CLOSED_DAY_IMPORT');
 const maps={roomTypes:[],rooms:[],services:[]},typeCodes=new Set(),naturalKeys={roomTypes:new Set(),rooms:new Set(),services:new Set()};
 for(const resource of Object.keys(maps)){
  const rows=source[resource];if(!Array.isArray(rows)){bad(resource,'ARRAY_REQUIRED');continue;}
  if(resource!=='services'&&!rows.length)bad(resource,'EXPLICIT_RECORDS_REQUIRED');
  rows.forEach((row,index)=>{
   const path=resource+'['+index+']',keys=resource==='roomTypes'?['sourceId','code','name','areaM2','standardOccupancy','maxOccupancy','bedConfiguration','description','active']:resource==='rooms'?['sourceId','number','roomTypeCode','floor','cleanlinessStatus','active','notes']:['sourceId','code','name','category','unit','priceVnd','active'];
   if(!closed(row,keys)){bad(path,'CLOSED_RECORD_REQUIRED');return;}
   if(!code(row.sourceId,60))bad(path+'.sourceId','STABLE_SOURCE_ID_REQUIRED');
   const natural=resource==='rooms'?row.number:row.code,max=resource==='rooms'?20:resource==='roomTypes'?30:40;
   if(!code(natural,max)||naturalKeys[resource].has(String(natural).toLowerCase()))bad(path,'INVALID_OR_DUPLICATE_NATURAL_KEY');
   naturalKeys[resource].add(String(natural).toLowerCase());
   if(typeof row.active!=='boolean')bad(path+'.active','EXPLICIT_BOOLEAN_REQUIRED');
   if(resource==='roomTypes'){
    typeCodes.add(row.code);
    if(!text(row.name,120)||!Number.isInteger(row.standardOccupancy)||row.standardOccupancy<1||!Number.isInteger(row.maxOccupancy)||row.maxOccupancy<row.standardOccupancy||row.maxOccupancy>32767)bad(path,'INVALID_NAME_OR_OCCUPANCY');
    if(row.areaM2!==null&&!(typeof row.areaM2==='string'&&/^\d{1,6}(?:\.\d{1,2})?$/.test(row.areaM2)&&Number(row.areaM2)>0))bad(path+'.areaM2','EXPLICIT_POSITIVE_DECIMAL_OR_NULL_REQUIRED');
    for(const [key,max] of [['bedConfiguration',250],['description',1000]])if(row[key]!==null&&!text(row[key],max))bad(path+'.'+key,'EXPLICIT_TEXT_OR_NULL_REQUIRED');
   }else if(resource==='rooms'){
    if(!text(row.floor,30)||!['CLEAN','DIRTY','CLEANING','INSPECTING'].includes(row.cleanlinessStatus))bad(path,'EXPLICIT_FLOOR_AND_CLEANLINESS_REQUIRED');
    if(!typeCodes.has(row.roomTypeCode))bad(path+'.roomTypeCode','MISSING_ROOM_TYPE_REFERENCE');
    if(row.notes!==null&&!text(row.notes,500))bad(path+'.notes','EXPLICIT_TEXT_OR_NULL_REQUIRED');
   }else{
    if(!text(row.name,160)||!code(row.category,30)||!text(row.unit,30))bad(path,'INVALID_SERVICE_FIELDS');
    if(typeof row.priceVnd!=='string'||!/^\d{1,19}$/.test(row.priceVnd)||BigInt(row.priceVnd)>9999999999999999999n)bad(path+'.priceVnd','EXPLICIT_INTEGER_VND_REQUIRED_NOT_ZERO_DEFAULT');
   }
   maps[resource].push({sourceId:row.sourceId,naturalKey:natural});
  });
  if(new Set(maps[resource].map(row=>row.sourceId)).size!==maps[resource].length)bad(resource,'DUPLICATE_SOURCE_ID');
 }
 if(source.pricing!==null)bad('pricing','PRICING_CONTRACT_AND_POLICY_REVIEW_REQUIRED');
 return {status:issues.length?'BLOCKED':'SOURCE_VALIDATED_NOT_IMPORTED',issues,counts:Object.fromEntries(Object.keys(maps).map(k=>[k,Array.isArray(source[k])?source[k].length:0])),mapping:maps,
   sourceKind:source.sourceKind,sqlWritesEnabled:false,sqlBlockers:['FOUNDATION_IMPORT_RPC_NOT_APPROVED','ATOMIC_REPLAY_AND_RECEIPT_CONTRACT_REQUIRED']};
}
async function main(){
 const [input,output,...extra]=process.argv.slice(2);
 if(extra.length||!isAbsolute(input||'')||!isAbsolute(output||'')||resolve(input)===resolve(output))throw new Error('ABSOLUTE_DISTINCT_INPUT_OUTPUT_REQUIRED');
 const bytes=await readFile(input);if(bytes.length>2*1024*1024)throw new Error('SOURCE_TOO_LARGE');
 const result=analyzeFoundation(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));
 await writeFile(output,JSON.stringify({...result,sourceSha256:createHash('sha256').update(bytes).digest('hex'),plannedAtUtc:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.status,issues:result.issues.length,sqlWritesEnabled:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error(JSON.stringify({status:'NOT_CONFIRMED',code:'FOUNDATION_PLAN_REJECTED'}));process.exitCode=1;});
