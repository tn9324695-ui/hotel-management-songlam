// Source validation only; no SQL, writes or hotel policy defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeFoundation} from '../../tools/migration/foundation-plan.mjs';
const source=()=>({format:'songlam.foundation-source.v1',batchId:'FIXTURE_ONLY',sourceKind:'test',reviewedByOperator:true,
 hotel:{name:'Fixture only',address:null,phone:null,email:null,taxCode:null,timeZoneId:'SE Asia Standard Time',currency:'VND',workingDate:'2026-11-12',checkInTime:'14:00:00',checkOutTime:'12:00:00'},
 businessDay:{date:'2026-11-12',status:'OPEN'},roomTypes:[{sourceId:'T1',code:'TEST',name:'Fixture type',areaM2:null,standardOccupancy:1,maxOccupancy:2,bedConfiguration:null,description:null,active:true}],
 rooms:[{sourceId:'R1',number:'TEST-101',roomTypeCode:'TEST',floor:'TEST',cleanlinessStatus:'DIRTY',active:true,notes:null}],services:[],pricing:null});
test('empty foundation template cannot become data or enable SQL writes',()=>{
 const result=analyzeFoundation(JSON.parse(readFileSync(new URL('../../deploy/foundation-data.example.json',import.meta.url),'utf8')));
 assert.equal(result.status,'BLOCKED');assert.equal(result.sqlWritesEnabled,false);assert.ok(result.issues.some(i=>i.path==='hotel'));
});
test('foundation plan preserves explicit state/date and stable mappings without importing',()=>{
 const input=source(),before=structuredClone(input),result=analyzeFoundation(input);
 assert.equal(result.status,'SOURCE_VALIDATED_NOT_IMPORTED');assert.deepEqual(input,before);
 assert.deepEqual(result.mapping.rooms,[{sourceId:'R1',naturalKey:'TEST-101'}]);assert.equal(result.sqlWritesEnabled,false);
});
test('missing references, duplicated IDs, absent service price and impossible dates are quarantined as issues',()=>{
 const input=source();input.rooms[0].roomTypeCode='MISSING';input.rooms.push({...input.rooms[0]});
 input.hotel.workingDate='2026-02-30';input.services=[{sourceId:'S1',code:'S1',name:'Test',category:'TEST',unit:'Test',active:true}];
 const result=analyzeFoundation(input);assert.equal(result.status,'BLOCKED');
 for(const reason of ['MISSING_ROOM_TYPE_REFERENCE','DUPLICATE_SOURCE_ID','EXPLICIT_INTEGER_VND_REQUIRED_NOT_ZERO_DEFAULT','EXPLICIT_VALID_WORKING_DATE_REQUIRED'])assert.ok(result.issues.some(i=>i.reason===reason),reason);
});
