const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync('js/pms-data.js','utf8'),context);
const view=context.window.SongLamViewData;
const day='2026-11-06';
const addDays=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const data={
  rooms:[
    {id:'P1',number:'101',classCode:'A',floor:1,stayStatus:'occupied',cleanStatus:'clean',exploitationStatus:'active'},
    {id:'P2',number:'102',classCode:'A',floor:1,stayStatus:'vacant',cleanStatus:'clean',exploitationStatus:'active'},
    {id:'P3',number:'103',classCode:'A',floor:1,stayStatus:'vacant',cleanStatus:'dirty',exploitationStatus:'active'},
    {id:'P4',number:'104',classCode:'A',floor:1,stayStatus:'vacant',cleanStatus:'clean',exploitationStatus:'maintenance'},
    {id:'P5',number:'105',classCode:'A',floor:1,stayStatus:'vacant',cleanStatus:'inspecting',exploitationStatus:'inactive'}
  ],
  bookings:[
    {id:'B1',roomClassCode:'A',checkInDate:day,checkOutDate:'2026-11-08',bookingStatus:'partially_checked_in',roomQuantity:3,checkedInRooms:['101'],assignedRooms:['101','104']},
    {id:'CANCEL',checkInDate:day,bookingStatus:'cancelled'},
    {id:'NOSHOW',checkInDate:day,bookingStatus:'no_show'}
  ],
  stays:[
    {id:'S1',status:'in_house',expectedCheckOutDate:day+' 12:00'},
    {id:'S2',status:'checked_out',actualCheckOutDate:day+'T10:00:00',folioSnapshot:{totalAmount:700}},
    {id:'S3',status:'checked_out',actualCheckOutDate:'2026-11-07 00:00'},
    {id:'S4',status:'checked_out',actualCheckOutDate:'2026-11-05 12:00'}
  ],
  transactions:[
    {id:'T1',status:'success',timestamp:day+' 09:00',type:'deposit',amount:1000},
    {id:'T2',status:'success',timestamp:day+'T09:01:00',type:'refund',amount:1500},
    {id:'T3',status:'pending',timestamp:day,type:'payment',amount:9999},
    {id:'T4',status:'success',timestamp:day,type:'guarantee_deposit_deduction',amount:9999},
    {id:'T5',status:'success',timestamp:day,type:'deposit',isInternalAllocation:true,amount:9999},
    {id:'T6',status:'success',timestamp:day,type:'deposit',referenceCode:'ALLOC-X',amount:9999},
    {id:'T7',status:'success',timestamp:'2026-11-07 00:00',type:'payment',amount:9999}
  ]
};
const folios={S1:{totalAmount:800,remainingDue:300},S2:{totalAmount:999,remainingDue:0},S3:{totalAmount:1100,remainingDue:0},S4:{totalAmount:500,remainingDue:0,billedToMaster:true,masterFolio:{balanceDue:400},incidentalFolio:{balanceDue:0}}};
const store={getData:()=>data,getWorkingDate:()=>day,addDays,calculateStayFolio:id=>folios[id]};
test('Room readiness separates occupancy, cleaning and operations',()=>{
 const s=view.snapshot(store);assert.equal(s.ready,1);assert.equal(s.occupied,1);assert.equal(s.dirty,1);assert.equal(s.inspecting,1);assert.equal(s.unavailable,2);
});
test('Arrivals exclude cancelled/no-show and already received rooms',()=>{
 const s=view.snapshot(store);assert.equal(s.arrivals.length,1);assert.equal(s.arrivalRooms,2);assert.equal(s.unassigned.length,1);assert.equal(s.notReady.length,1);assert.equal(s.departures.length,1);
});
test('Cash flow excludes internal allocations/pending and preserves a negative result',()=>{
 const s=view.snapshot(store);assert.equal(s.income,1000);assert.equal(s.expense,1500);assert.equal(s.cashflow,-500);
});
test('Revenue uses closed snapshot and excludes next-day or earlier checkout',()=>{
 const s=view.snapshot(store);assert.equal(s.closed.length,1);assert.equal(s.revenue,700);
});
test('Transferred master debt survives physical checkout without double-counting',()=>{
 const s=view.snapshot(store);assert.equal(s.receivable,700);assert.equal(s.debt.length,2);
 assert.equal(view.outstanding({status:'in_house'},{billedToMaster:true,remainingDue:999,masterFolio:{balanceDue:400},incidentalFolio:{balanceDue:50}}),450);
});
test('Empty data yields zero, never fabricated metrics',()=>{
 const s=view.snapshot({...store,getData:()=>({})});assert.equal(s.revenue,0);assert.equal(s.ready,0);assert.equal(s.receivable,0);assert.equal(s.income,0);
});
const timelineStore={...store,getData:()=>({...data,stays:[],bookings:[
 {id:'A',guestName:'Khách A',bookingStatus:'confirmed',assignedRooms:['102'],checkInDate:'2026-11-06',checkOutDate:'2026-11-08'},
 {id:'B',guestName:'Khách B',bookingStatus:'confirmed',assignedRooms:['102'],checkInDate:'2026-11-08',checkOutDate:'2026-11-09'},
 {id:'C',guestName:'Khách C',bookingStatus:'confirmed',assignedRooms:['102'],checkInDate:'2026-11-07',checkOutDate:'2026-11-08'},
 {id:'LAST',guestName:'Ngày cuối',bookingStatus:'confirmed',assignedRooms:['101'],checkInDate:'2026-11-19',checkOutDate:'2026-11-20'}
]})};
test('Timeline includes last visible day and uses guestName',()=>{
 const t=view.timeline(timelineStore,day,14);assert.equal(t.rows[0].events[0].id,'LAST');assert.equal(t.rows[1].events[0].title,'Khách A');
});
test('Overlapping bookings occupy separate lanes; adjacent bookings do not conflict',()=>{
 const e=view.timeline(timelineStore,day,14).rows[1].events;
 assert.equal(e.find(x=>x.id==='A').conflict,true);assert.equal(e.find(x=>x.id==='C').conflict,true);assert.equal(e.find(x=>x.id==='B').conflict,false);
 assert.notEqual(e.find(x=>x.id==='A').lane,e.find(x=>x.id==='C').lane);
});
console.log(`RESULT: ${passed}/${passed} PASSED`);
