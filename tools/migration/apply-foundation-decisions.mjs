// Apply only explicit data decisions to a new local candidate. Never opens SQL.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeFoundation} from './foundation-plan.mjs';
export function applyFoundationDecisions(inputCandidate,inputReview,decision){
 if(decision.kind!=='SOURCE_DATA_DECISIONS_NOT_SQL_EXECUTION_APPROVAL'||decision.sourceSha256!==inputReview.sourceSha256
  ||decision.roomTypeCodesApproved!==true||!decision.approvalReference||decision.sqlExecutionApproved!==false)throw new Error('SOURCE_DECISION_NOT_BOUND');
 const candidate=structuredClone(inputCandidate),review=structuredClone(inputReview),codes=decision.roomTypeCodes;
 if(!codes||Object.keys(codes).length!==candidate.roomTypes.length||new Set(Object.values(codes)).size!==candidate.roomTypes.length)throw new Error('INCOMPLETE_CODE_DECISION');
 for(const row of candidate.roomTypes){
  const source=review.provenance.find(p=>p.entity==='roomType'&&p.sourceId===row.sourceId);
  if(!source||codes[row.sourceId]!==source.suggestedCode||!(/^[A-Za-z0-9_.-]{1,30}$/.test(codes[row.sourceId])))throw new Error('CODE_DIFFERS_FROM_APPROVED_SUGGESTION');
  row.code=codes[row.sourceId];source.proposedCodeApproved=true;source.confirmedCode=row.code;source.approvalReference=decision.approvalReference;
 }
 if(decision.workingDate!==null){
  if(decision.workingDateStatus!=='CONFIRMED')throw new Error('DATE_YEAR_CONFIRMATION_REQUIRED');
  const v=decision.workingDate;
  if(!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new Error('INVALID_CONFIRMED_DATE');
  const [,month,day]=v.split('-');const parts=String(decision.workingDateInput).split('/');
  if(parts.length<2||Number(parts[0])!==Number(day)||Number(parts[1])!==Number(month))throw new Error('DATE_DIFFERS_FROM_USER_INPUT');
  if(parts.length===3&&Number(parts[2])!==Number(v.slice(0,4)))throw new Error('DATE_YEAR_DIFFERS_FROM_USER_INPUT');
  candidate.hotel.workingDate=v;
  // Opening a BusinessDay is a separate data decision, not implied by a date.
 }
 candidate.reviewedByOperator=false;
 review.issues=review.issues.filter(i=>i.code!=='PMS_ROOM_TYPE_CODE_UNCONFIRMED');
 review.operatorDecisions=structuredClone(decision);review.sqlWritesEnabled=false;
 review.validation=analyzeFoundation(candidate);
 return {candidate,review};
}
async function main(){
 const [inputDir,decisionsFile,outputDir,...extra]=process.argv.slice(2);
 if(extra.length||![inputDir,decisionsFile,outputDir].every(p=>isAbsolute(p||''))||resolve(inputDir)===resolve(outputDir))throw new Error('DISTINCT_ABSOLUTE_PATHS_REQUIRED');
 const read=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
 const {candidate,review}=applyFoundationDecisions(await read(join(inputDir,'foundation-candidate.local.json')),await read(join(inputDir,'workbook-review.local.json')),await read(decisionsFile));
 await mkdir(outputDir,{recursive:true});
 for(const [name,data] of [['foundation-candidate.local.json',candidate],['workbook-review.local.json',review]])await writeFile(join(outputDir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:review.status,codesConfirmed:candidate.roomTypes.length,workingDate:candidate.hotel.workingDate,sqlWritesEnabled:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error(JSON.stringify({status:'NOT_CONFIRMED',code:'FOUNDATION_DECISION_REJECTED'}));process.exitCode=1;});
