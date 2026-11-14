// Pure fixtures. Does not run or approve SQL 016.
import test from 'node:test';import assert from 'node:assert/strict';
import { calculateQuote } from '../src/modules/pricing/engine.js';
import { compileCheckIn } from '../src/modules/stays/commands.js';
import { mintActor } from '../src/modules/auth/security.js';
import { readinessDto } from '../src/modules/stays/dto.js';
const version='0x0000000000000001',start='2026-11-13T07:00:00.000Z',end='2026-11-14T05:00:00.000Z',now='2026-11-13T08:00:00.000Z';
function fixture(){
 const policy={schema:'songlam.policy.v1',moneyRounding:'HALF_UP',occupancy:'INCLUDED_UP_TO_MAX',effectiveBasis:'ARRIVAL_TIME',selection:{order:'DAY_KIND_THEN_PRIORITY',priority:'HIGHER_WINS',dayKindOrder:['SPECIFIC','HOLIDAY','WEEKEND','BASE'],fallback:'ALLOW_ELIGIBLE_RULES'},boundaryClock:'HOTEL_WALL_CLOCK',earlyArrival:[],lateDeparture:[],hourlyRateBasis:'ARRIVAL_DATE'};
 const input={roomTypeId:'1',ratePlanId:'1',checkInAt:'2026-11-13T14:00:00+07:00',checkOutAt:'2026-11-14T12:00:00+07:00',rooms:1,adultsPerRoom:1,childrenPerRoom:0};
 const context={schema:'songlam.pricing.context.v1',ratesComplete:true,calendarComplete:true,calendarSource:{id:'FIXTURE_ONLY',version:'1'},hotel:{HotelId:'1',Currency:'VND',TimeZoneId:'SE Asia Standard Time',TimeZoneIana:'Asia/Ho_Chi_Minh',CheckInTime:'14:00:00',CheckOutTime:'12:00:00'},roomType:{RoomTypeId:'1',MaxOccupancy:2,IsActive:true},ratePlan:{RatePlanId:'1',Code:'FIXTURE',StayType:'NIGHTLY',PolicyVersionId:'1',IsActive:true},policy:{PolicyVersionId:'1',Code:'FIXTURE',Version:1,EffectiveFromUtc:'2026-11-01T00:00:00Z',RulesJson:JSON.stringify(policy)},rules:[{RateRuleId:'1',RatePlanId:'1',RoomTypeId:'1',ValidFrom:'2026-11-01',ValidTo:'2028-01-01',DayKind:'BASE',Priority:0,PriceVnd:'1000000',IncludedMinutes:null,ExtraBlockMinutes:null,ExtraBlockPriceVnd:null}],calendar:[{date:'2026-11-13',kinds:['BASE']}]};
 const quote=calculateQuote(context,input,'NIGHTLY',now),unit={bookingRoom:{id:'2',bookingId:'1',status:'CONFIRMED',version,roomTypeId:'1',ratePlanId:'1',policyVersionId:'1',stayType:'NIGHTLY',startsAtUtc:start,endsAtUtc:end,adults:1,children:0,pricingSnapshot:quote.snapshotCandidate,quotedRoomBaseVnd:'1000000'},room:{id:'3',roomTypeId:'1',version,occupancyStatus:'VACANT',cleanlinessStatus:'CLEAN',exploitationStatus:'ACTIVE',maxOccupancy:2},allocation:{id:'4',roomId:'3',bookingRoomId:'2',version,isCancelled:false,startsAtUtc:start,endsAtUtc:end},existingStayId:null,folio:null,folioCreation:{profile:'ATOMIC_ROOM_FOLIO_V1',kind:'ROOM',bookingId:'1',bookingRoomId:'2',payerCustomerId:'5',payerOrganizationId:null},guestRosterVerified:true,depositRequirement:{required:false,satisfied:false,paymentState:'NOT_REQUIRED'}};
 return {unit,prepared:{booking:{id:'1',customerId:'5',version},checkedInAtUtc:now,chargingMode:'FROZEN_ROOM_AND_AGREED_EARLY_V1',hourlyBillingAnchor:'BOOKED_INTERVAL',units:[unit]},input:{bookingId:'1',expectedVersion:version,rooms:[{bookingRoomId:'2',expectedVersion:version,roomId:'3',roomVersion:version,allocationId:'4',allocationVersion:version,guestCustomerIds:['5'],leadCustomerId:'5'}]}};
}
const actor=mintActor({appUserId:'4',permissions:['manageCheckIn']}),limits={maxChanges:500,maxChangeBytes:4000000};
test('016 compiler emits folio, stay, guests, segment and frozen charge in one batch',()=>{
 const f=fixture(),result=compileCheckIn(f.prepared,f.input,limits,actor,'fixture-key',Date.parse(now),'ATOMIC_ROOM_FOLIO_V1');
 const rows=result.batch.changes;assert.equal(rows.length,6);assert.equal(rows[0].entity,'Folio');assert.equal(rows[0].data.PayerCustomerId,'5');
 const charge=rows.find(r=>r.entity==='FolioEntry');assert.equal(charge.data.AmountVnd,'1000000');assert.equal(charge.data.StayId,'$stay_0');assert.equal(charge.data.FolioId,'$checkin_folio_0');
 assert.ok(!rows.some(r=>['Payment','DepositMovement'].includes(r.entity)));
});
test('016 refuses an unapproved folio profile or payer mismatch before any SQL call',()=>{
 const f=fixture();assert.throws(()=>compileCheckIn(f.prepared,f.input,limits,actor,'key',Date.parse(now)),e=>e.code==='CHECK_IN_FOLIO_CONTRACT_MISSING');
 f.unit.folioCreation.payerCustomerId='6';assert.throws(()=>compileCheckIn(f.prepared,f.input,limits,actor,'key',Date.parse(now),'ATOMIC_ROOM_FOLIO_V1'),e=>e.code==='CHECK_IN_FOLIO_CONTRACT_MISSING');
});
test('016 readiness surfaces wrong room type and capacity as blockers',()=>{
 const f=fixture(),raw={bookingRoomId:'2',bookingRoomStatus:'CONFIRMED',bookingRoomVersion:version,startsAtUtc:start,endsAtUtc:end,asOfUtc:now,room:f.unit.room,allocation:f.unit.allocation,intervalConflict:false,roomTypeCompatible:false,capacityFits:false};
 const result=readinessDto(raw,{bookingRoomId:'2',roomId:'3'});assert.ok(result.blockers.includes('ROOM_TYPE_MISMATCH'));assert.ok(result.blockers.includes('ROOM_CAPACITY_EXCEEDED'));
});
