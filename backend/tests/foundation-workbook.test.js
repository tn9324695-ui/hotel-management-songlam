// Workbook-shaped fixtures only. No SQL and no real source/credentials read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFoundationWorkbook} from '../../tools/migration/map-foundation-workbook.mjs';
import {applyFoundationDecisions} from '../../tools/migration/apply-foundation-decisions.mjs';
function fixture(){
 const names=['1_KhachSan_VanHanh','2_HangPhong','3_Phong','4_DichVu_Minibar','5_GiaPhong_PhuThu'];
 const inputs=[{B6:'Fixture hotel',B8:'Fixture address',B16:'14:00',B17:'12:00'},
  {B3:'Mã hạng phòng\n(Trên PMS)',A4:'1',B4:'chưa chốt',C4:'SUGGESTED',D4:'Fixture type',E4:'2 - 3 người lớn',F4:'chưa chốt',G4:'Fixture bed',H4:'24.5'},
  {A3:'Số phòng',A4:'chưa chốt',B4:'Tổng 425 phòng',A7:'Fixture ballroom'},
  {F3:'Đơn giá (VND)',A4:'1',B4:'chưa chốt',C4:'Free fixture benefit',F4:'0',A5:'2',B5:'chưa chốt',C5:'Unpriced fixture',F5:'chưa chốt'},
  {A18:'B. CHÍNH SÁCH',B6:'Fixture type',C6:'100000',D6:'90000',F6:'chưa chốt'}];
 return {sourceSha256:'a'.repeat(64),sheets:names.map((name,i)=>{
  const rows=new Map();for(const [cell,value] of Object.entries(inputs[i])){const n=Number(cell.match(/\d+/)[0]);if(!rows.has(n))rows.set(n,{row:n,cells:[]});rows.get(n).cells.push({cell,value,formula:null});}
  return {name,rows:[...rows.values()]};
 })};
}
test('suggested PMS code, uncertain occupancy and aggregate/meeting rooms never become live records',()=>{
 const input=fixture(),before=structuredClone(input),{candidate,review}=mapFoundationWorkbook(input);
 assert.deepEqual(input,before);assert.equal(candidate.roomTypes[0].code,null);assert.equal(candidate.roomTypes[0].standardOccupancy,null);
 assert.equal(candidate.roomTypes[0].areaM2,'24.5');assert.equal(candidate.roomTypes[0].active,null);assert.deepEqual(candidate.rooms,[]);
 assert.equal(review.provenance[0].suggestedCode,'SUGGESTED');assert.equal(review.provenance[0].proposedCodeApproved,false);
 assert.equal(candidate.reviewedByOperator,false);assert.equal(review.sqlWritesEnabled,false);
});
test('explicit free service is zero while missing price/effective date remain unknown',()=>{
 const {candidate,review}=mapFoundationWorkbook(fixture());
 assert.equal(candidate.services[0].priceVnd,'0');assert.equal(candidate.services[1].priceVnd,null);
 assert.equal(review.referenceRates[0].publicPriceVnd,'100000');assert.equal(review.referenceRates[0].agencyPriceVnd,'90000');
 assert.equal(review.referenceRates[0].effectiveDate,null);assert.equal(candidate.pricing,null);assert.equal(candidate.hotel.workingDate,null);
});
test('changed workbook layout is rejected; formula cache cannot silently become a price',()=>{
 const input=fixture();input.sheets[3].rows.find(r=>r.row===4).cells.find(c=>c.cell==='F4').formula='1-1';
 const {candidate,review}=mapFoundationWorkbook(input);assert.equal(candidate.services[0].priceVnd,null);assert.ok(review.issues.some(i=>i.code==='FORMULA_NOT_EVALUATED'));
 input.sheets[3].rows.find(r=>r.row===3).cells[0].value='Changed schema';assert.throws(()=>mapFoundationWorkbook(input),/WORKBOOK_LAYOUT_CHANGED/);
});

test('explicit code approval cannot imply year, active state, whole-source review or SQL write approval',()=>{
 const input=mapFoundationWorkbook(fixture()),before=structuredClone(input);
 const decision={kind:'SOURCE_DATA_DECISIONS_NOT_SQL_EXECUTION_APPROVAL',sourceSha256:'a'.repeat(64),approvalReference:'FIXTURE_ONLY',roomTypeCodesApproved:true,
  roomTypeCodes:{XLSX_HANG_4:'SUGGESTED'},workingDateInput:'11/10',workingDate:null,workingDateStatus:'YEAR_REQUIRED',sqlExecutionApproved:false};
 const applied=applyFoundationDecisions(input.candidate,input.review,decision);
 assert.deepEqual(input,before);assert.equal(applied.candidate.roomTypes[0].code,'SUGGESTED');
 assert.equal(applied.candidate.hotel.workingDate,null);assert.equal(applied.candidate.roomTypes[0].active,null);
 assert.equal(applied.candidate.reviewedByOperator,false);assert.equal(applied.review.sqlWritesEnabled,false);assert.deepEqual(applied.candidate.rooms,[]);
 assert.throws(()=>applyFoundationDecisions(input.candidate,input.review,{...decision,sourceSha256:'b'.repeat(64)}),/SOURCE_DECISION_NOT_BOUND/);
 assert.throws(()=>applyFoundationDecisions(input.candidate,input.review,{...decision,roomTypeCodes:{XLSX_HANG_4:'OTHER'}}),/CODE_DIFFERS_FROM_APPROVED_SUGGESTION/);
 assert.throws(()=>applyFoundationDecisions(input.candidate,input.review,{...decision,workingDate:'2026-10-11'}),/DATE_YEAR_CONFIRMATION_REQUIRED/);
});
