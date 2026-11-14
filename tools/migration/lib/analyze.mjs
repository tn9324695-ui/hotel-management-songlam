import { canonical, digest, isObject, pointerPart, requireThat, sourceRef, vnd } from './core.mjs';

// Target names are verified against repository SQL scripts, not the live server.
// This is a mapping specification, NOT an approved RPC payload.
export const entities = {
  roomClasses: ['RoomType', 'RatePlan', 'RateRule'], rooms: ['Room'], customers: ['Customer', 'Organization', 'CustomerIdentity'],
  bookings: ['Booking', 'BookingRoom', 'BookingNightRate', 'BookingGuest', 'RoomAllocation'],
  stays: ['Stay', 'StayGuest', 'StayRoomSegment', 'Folio', 'FolioEntry'],
  services: ['Service'], housekeepingTasks: ['HousekeepingTask'],
  minibarAudits: ['MinibarAudit', 'MinibarAuditLine', 'FolioEntry'],
  maintenanceTickets: ['MaintenanceTicket'], lostAndFound: ['LostFound'],
  transactions: ['Payment', 'DepositMovement', 'FolioEntry'], refundRequests: ['RefundRequest'],
  cashierShifts: ['CashierShift'], dailyLedgers: ['BusinessDay'],
  auditLogs: ['AuditLog'], exceptionCases: ['ExceptionCase'],
  hotelInfo: ['HotelSettings', 'BusinessDay'], policies: ['PolicyVersion'],
  users: ['AppUser'], roles: ['AppRole']
};
const nested = {
  stays: { guest: ['Customer'], companions: ['StayGuest', 'CustomerIdentity'], servicesUsed: ['ServiceOrder', 'ServiceOrderLine', 'FolioEntry'],
    surcharges: ['FolioEntry'], nightlyRates: ['BookingNightRate'], transferHistory: ['StayRoomSegment'],
    extensionHistory: ['Stay'], folioSnapshot: ['Folio', 'FolioEntry'] },
  minibarAudits: { itemsUsed: ['MinibarAuditLine', 'FolioEntry'] },
  bookings: { nightlyRates: ['BookingNightRate'], assignedRooms: ['RoomAllocation'], checkedInRooms: ['Stay'] }
};
export function inventory(source) {
  const rows = [];
  const add = (collection, value, pointer, parentRef = null, targetEntities = entities[collection] || []) => {
    const row = { sourceRef: sourceRef(pointer), pointer, collection, parentRef,
      legacyId: isObject(value) ? String(value.id ?? value.code ?? '') : '',
      sourceHash: digest(value), targetEntities, value };
    rows.push(row);
    return row;
  };
  for (const [collection, data] of Object.entries(source)) {
    if (['version', 'updatedAt'].includes(collection)) continue;
    const root = `/${pointerPart(collection)}`;
    const values = Array.isArray(data) ? data : [data];
    values.forEach((value, i) => {
      const pointer = Array.isArray(data) ? `${root}/${i}` : root;
      const parent = add(collection, value, pointer);
      if (!isObject(value)) return;
      for (const [field, targets] of Object.entries(nested[collection] || {})) {
        if (!(field in value)) continue;
        const child = value[field];
        const p = `${pointer}/${field}`;
        if (Array.isArray(child)) child.forEach((v, n) => add(`${collection}.${field}`, v, `${p}/${n}`, parent.sourceRef, targets));
        else if (child !== null) add(`${collection}.${field}`, child, p, parent.sourceRef, targets);
      }
    });
  }
  return rows;
}
const noEvidence = 'HISTORICAL_IMPORT_CONTRACT_NOT_APPROVED';
export function analyze(bundle, review = {}, crosswalk = {}, baseline = null) {
  const { source, manifest, manifestSha256 } = bundle;
  const rows = inventory(source);
  const decisions = review.records || [];
  requireThat(!review.sourceSha256 || review.sourceSha256 === manifest.exportedSourceSha256, 'REVIEW_SOURCE_MISMATCH');
  requireThat(!review.batchId || review.batchId === manifest.batchId, 'REVIEW_BATCH_MISMATCH');
  requireThat(!crosswalk.sourceSha256 || crosswalk.sourceSha256 === manifest.exportedSourceSha256, 'CROSSWALK_SOURCE_MISMATCH');
  requireThat(!crosswalk.batchId || crosswalk.batchId === manifest.batchId, 'CROSSWALK_BATCH_MISMATCH');
  requireThat(Array.isArray(decisions) && Array.isArray(crosswalk.entries || []), 'REVIEW_FORMAT');
  if (decisions.length) requireThat(review.batchId === manifest.batchId && review.sourceSha256 === manifest.exportedSourceSha256, 'REVIEW_BINDING_REQUIRED');
  if ((crosswalk.entries || []).length) requireThat(crosswalk.batchId === manifest.batchId && crosswalk.sourceSha256 === manifest.exportedSourceSha256, 'CROSSWALK_BINDING_REQUIRED');
  const decisionMap = new Map();
  for (const decision of decisions) {
    requireThat(rows.some(r => r.sourceRef === decision.sourceRef && r.sourceHash === decision.sourceHash), 'REVIEW_UNKNOWN_OR_CHANGED_RECORD');
    requireThat(!decisionMap.has(decision.sourceRef), 'DUPLICATE_REVIEW');
    requireThat(['REAL', 'DEMO', 'UNKNOWN'].includes(decision.classification), 'CLASSIFICATION_INVALID');
    requireThat(decision.classification === 'UNKNOWN' || Boolean(decision.approvalReference), 'REVIEW_APPROVAL_REQUIRED');
    decisionMap.set(decision.sourceRef, decision);
  }
  const baselineHashes = new Set(baseline ? inventory(baseline).map(r => `${r.collection}:${r.sourceHash}`) : []);
  const idGroups = new Map();
  for (const row of rows.filter(r => r.legacyId)) {
    const key = `${row.collection}:${row.legacyId}`;
    idGroups.set(key, (idGroups.get(key) || []).concat(row.sourceRef));
  }
  const find = (collection, id) => rows.filter(r => r.collection === collection && r.legacyId === String(id));
  const entries = crosswalk.entries || [];
  const seenMappings = new Set();
  for (const entry of entries) {
    const row = rows.find(r => r.sourceRef === entry.sourceRef);
    requireThat(row && row.sourceHash === entry.sourceHash, 'CROSSWALK_SOURCE_RECORD_MISMATCH');
    requireThat(entry.approvalReference && /^[1-9]\d*$/.test(String(entry.targetId)), 'CROSSWALK_APPROVAL_OR_ID');
    requireThat(row.targetEntities.includes(entry.targetEntity) && typeof entry.component === 'string' && entry.component.length > 0, 'CROSSWALK_ENTITY_OR_COMPONENT');
    const key = canonical([entry.sourceRef, entry.targetEntity, entry.component]);
    requireThat(!seenMappings.has(key), 'CROSSWALK_DUPLICATE'); seenMappings.add(key);
  }
  const result = rows.map(row => {
    const decision = decisionMap.get(row.sourceRef);
    const classification = decision?.classification || 'UNKNOWN';
    const reasons = [];
    const value = row.value;
    if (classification === 'UNKNOWN') reasons.push('REAL_OR_DEMO_NOT_REVIEWED');
    if (!row.targetEntities.length) reasons.push('UNKNOWN_COLLECTION');
    if (row.legacyId && idGroups.get(`${row.collection}:${row.legacyId}`).length > 1) reasons.push('DUPLICATE_LEGACY_ID');
    const redactions = manifest.redactions.filter(r => r.pointer === row.pointer || r.pointer.startsWith(`${row.pointer}/`) || row.pointer.startsWith(`${r.pointer}/`));
    if (redactions.length) reasons.push('REDACTED_SOURCE_REQUIRES_SEPARATE_REVIEW');
    if (isObject(value)) {
      const ref = (collection, id, code) => { if (id === undefined || id === null || find(collection, id).length !== 1) reasons.push(code); };
      if (row.collection === 'rooms') {
        ref('roomClasses', value.classCode, 'ROOM_TYPE_REFERENCE_MISSING');
        if (!['clean', 'dirty', 'cleaning', 'inspecting'].includes(value.cleanStatus)) reasons.push('CLEAN_STATUS_UNMAPPED');
        if (value.exploitationStatus !== 'active') reasons.push('OPERATING_STATUS_NEEDS_DATED_BLOCK_HISTORY');
        if (!value.number || value.floor === undefined) reasons.push('ROOM_FIELDS_MISSING');
      }
      if (row.collection === 'roomClasses' && (!value.code || !value.name || !Number.isInteger(value.standardOccupancy)
          || !Number.isInteger(value.maxOccupancy) || value.maxOccupancy < value.standardOccupancy)) reasons.push('ROOM_TYPE_FIELDS_INVALID');
      if (row.collection === 'customers' && value.type !== 'individual') reasons.push('ORGANIZATION_MAPPING_REQUIRES_REVIEW');
      if ('identityCard' in value) reasons.push('IDENTITY_TYPE_COUNTRY_AND_ENCRYPTION_CONTRACT_REQUIRED');
      if (row.collection === 'bookings') {
        ref('roomClasses', value.roomClassCode, 'ROOM_TYPE_REFERENCE_MISSING');
        reasons.push('BOOKING_CUSTOMER_ROOM_LINES_POLICY_AND_ALLOCATION_REVIEW_REQUIRED');
        if (!Array.isArray(value.nightlyRates) || !value.nightlyRates.length) reasons.push('HISTORICAL_RATE_SNAPSHOT_MISSING');
      }
      if (row.collection === 'stays') {
        ref('bookings', value.bookingId, 'BOOKING_MISSING_OR_WALKIN_CONTRACT_REQUIRED');
        if (rows.filter(r => r.collection === 'rooms' && r.value.number === value.roomNumber).length !== 1) reasons.push('ROOM_REFERENCE_MISSING');
        reasons.push('STAY_GUEST_SEGMENTS_FOLIO_POLICY_REVIEW_REQUIRED');
        if (!Array.isArray(value.nightlyRates) || !value.nightlyRates.length) reasons.push('HISTORICAL_RATE_SNAPSHOT_MISSING');
        if (!value.folioSnapshot) reasons.push('SOURCE_FOLIO_LEDGER_INCOMPLETE');
      }
      if (row.collection === 'transactions') {
        if (value.stayId) ref('stays', value.stayId, 'PAYMENT_STAY_MISSING');
        if (value.bookingId) ref('bookings', value.bookingId, 'PAYMENT_BOOKING_MISSING');
        if (!value.stayId && !value.bookingId) reasons.push('PAYMENT_SCOPE_MISSING');
        if (!decision?.paymentEvidenceReference) reasons.push('PAYMENT_EVIDENCE_REQUIRED_BROWSER_FLAGS_NOT_PROOF');
        if (!decision?.actorMappingReference) reasons.push('CASHIER_APPUSER_MAPPING_REQUIRED');
        reasons.push('PAYMENT_FOLIO_DEPOSIT_SHIFT_BUSINESS_DAY_BINDING_REQUIRED');
      }
      if (row.collection === 'stays.servicesUsed') {
        if (value.minibarAuditId || value.isMinibar) reasons.push('MINIBAR_MIRROR_OR_ORIGIN_MUST_BE_RESOLVED');
        reasons.push('SERVICE_ORDER_LINE_PRICE_FOLIO_LINK_REQUIRED');
        if (value.paymentStatus === 'paid') reasons.push('IMMEDIATE_PAYMENT_LINE_LINK_AND_EVIDENCE_REQUIRED');
      }
      if (row.collection === 'minibarAudits') {
        ref('stays', value.stayId, 'MINIBAR_STAY_MISSING');
        reasons.push('MINIBAR_SEGMENT_INSPECTION_SCOPE_ACTOR_REQUIRED');
      }
      if (['users', 'roles', 'auditLogs'].includes(row.collection)) reasons.push('REFERENCE_ONLY_NO_ACCOUNT_GRANT_OR_AUDIT_REWRITE');
      if (['housekeepingTasks', 'maintenanceTickets', 'lostAndFound', 'refundRequests', 'cashierShifts', 'dailyLedgers', 'exceptionCases', 'policies', 'hotelInfo'].includes(row.collection)) reasons.push('OPERATIONAL_HISTORY_AND_ACTOR_CONTRACT_REQUIRED');
      if (containsLocalDate(value) && (!review.timezoneApprovalReference || !review.timezone)) reasons.push('LOCAL_TIMESTAMP_TIMEZONE_UNCONFIRMED');
      for (const field of ['amount', 'totalAmount', 'totalEstimated', 'unitPrice', 'price', 'depositAmount', 'depositPaid', 'guaranteeDeposit', 'roomRate', 'ratePerNight']) {
        if (field in value) try { requireThat(vnd(value[field]) >= 0n, 'NEGATIVE_SOURCE_MONEY'); }
        catch { reasons.push(`INVALID_VND_${field}`); }
      }
    } else if (row.parentRef === null) reasons.push('RECORD_STRUCTURE_INVALID');
    if (row.parentRef && classification === 'REAL') {
      if (decisionMap.get(row.parentRef)?.classification !== 'REAL') reasons.push('PARENT_NOT_CONFIRMED_REAL');
    }
    const status = classification === 'DEMO' && decision?.approvalReference ? 'EXCLUDED_APPROVED'
      : reasons.length ? 'QUARANTINED' : 'MAPPING_CANDIDATE';
    // No payload/PII in reports. Source remains in the restricted immutable package.
    return { sourceRef: row.sourceRef, pointer: row.pointer, collection: row.collection, sourceHash: row.sourceHash,
      parentRef: row.parentRef, classification, status, reasons: [...new Set(reasons)],
      demoHint: baselineHashes.has(`${row.collection}:${row.sourceHash}`) ? 'EXACT_BASELINE_MATCH_REQUIRES_REVIEW' : 'NOT_ESTABLISHED',
      proposedEntities: row.targetEntities, fieldMapping: draftFields(row), mappings: entries.filter(e => e.sourceRef === row.sourceRef),
      exclusionApprovalReference: classification === 'DEMO' ? decision?.approvalReference : undefined };
  });
  const money = sourceMoney(rows, decisionMap);
  const plan = {
    format: 'songlam-migration-plan/1', batchId: manifest.batchId, sourceSha256: manifest.exportedSourceSha256,
    manifestSha256, reviewSha256: digest(review), crosswalkSha256: digest(crosswalk),
    generatedAtUtc: new Date().toISOString(), sqlWriteEnabled: false,
    blockers: [noEvidence, ...(manifest.redactions.length ? ['SOURCE_REDACTIONS_REQUIRE_REVIEW'] : [])],
    records: result, money, counts: Object.fromEntries([...new Set(result.map(r => r.collection))].map(collection => [collection, {
      source: result.filter(r => r.collection === collection).length,
      quarantined: result.filter(r => r.collection === collection && r.status === 'QUARANTINED').length,
      excludedApproved: result.filter(r => r.collection === collection && r.status === 'EXCLUDED_APPROVED').length
    }]))
  };
  return { ...plan, planSha256: digest(plan) };
}
function draftFields(row) {
  // Paths and transforms only: no credentials/PII duplicated into analysis reports.
  const specs = {
    roomClasses: { Code: 'code', Name: 'name', AreaM2: 'area', StandardOccupancy: 'standardOccupancy',
      MaxOccupancy: 'maxOccupancy', BedConfiguration: 'bedConfig', AmenitiesJson: 'amenities' },
    rooms: { Number: 'number', RoomTypeId: 'classCode -> reviewed RoomType crosswalk', FloorLabel: 'floor -> string',
      CleanStatus: 'cleanStatus -> CLEAN|DIRTY|CLEANING|INSPECTING', IsActive: 'requires operating-history review' },
    customers: { Code: 'id', FullName: 'name', Phone: 'phone', Email: 'email', Address: 'address',
      CustomerIdentity: 'identityCard -> approved document classification/encryption; never plaintext SQL' },
    bookings: { Code: 'id', CustomerId: 'approved customer binding; no name/phone merge',
      BookingRoom: 'roomClassCode,roomQuantity -> individually reviewed line identities',
      BookingNightRate: 'nightlyRates -> original snapshots only', Status: 'bookingStatus -> approved lifecycle mapping' },
    stays: { Code: 'id', BookingRoomId: 'bookingId -> approved booking-room crosswalk',
      StayRoomSegment: 'roomNumber,checkInDate,transferHistory -> dated segments, no guessed times',
      StayGuest: 'guest,companions -> approved customer bindings', Folio: 'original ledger, not recalculated current prices' },
    services: { Code: 'id', Name: 'name', Unit: 'unit', PriceVnd: 'price -> exact integer; current catalogue only' },
    transactions: { Payment: 'type,status,paymentMethod,amount,timestamp -> evidence-bound historical record',
      DepositMovement: 'explicit RECEIVE/APPLY/UNAPPLY/REFUND origin; no mutable balance',
      FolioEntry: 'approved source-line binding; no operational collection replay' },
    'stays.servicesUsed': { ServiceOrderLine: 'serviceId,quantity,unitPrice,amount -> frozen values',
      FolioEntry: 'source line, folio, reversal links; resolve minibar projection first' },
    minibarAudits: { MinibarAudit: 'stayId,roomNumber,checkoutTime,inspectedBy -> approved segment/scope/AppUser',
      MinibarAuditLine: 'itemsUsed -> original quantity and price; zero audit is valid' }
  };
  return specs[row.collection] || { status: 'Requires approved entity-specific historical mapping; original source pointer preserved' };
}
function containsLocalDate(value) {
  return Object.values(value).some(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(v));
}
function sourceMoney(rows, decisions) {
  const observations = [];
  for (const row of rows) {
    if (decisions.get(row.sourceRef)?.classification === 'DEMO') continue;
    const value = row.value;
    if (!isObject(value)) continue;
    for (const field of ['amount', 'totalAmount', 'totalEstimated', 'depositAmount', 'depositPaid', 'guaranteeDeposit', 'totalSpent']) {
      if (!(field in value)) continue;
      let amountVnd = null;
      try { amountVnd = vnd(value[field]).toString(); } catch { /* unknown, never zero */ }
      observations.push({ sourceRef: row.sourceRef, field, amountVnd,
        semantic: 'SOURCE_OBSERVATION_NOT_RECONCILED_LEDGER',
        reason: row.collection === 'transactions' ? 'BROWSER_STATUS_NOT_SETTLEMENT_EVIDENCE' : 'SUMMARY_OR_MIRROR_NOT_ADDITIONAL_CASH' });
    }
  }
  return { currency: 'VND', coverage: 'UNRESOLVED', observations,
    ledger: [], blockers: ['NO_APPROVED_SOURCE_TO_FOLIO_DEPOSIT_PAYMENT_LEDGER_MAPPING'],
    definitions: {
      folioBalance: 'CHARGE-CHARGE_CREDIT-PAYMENT+REFUND-DEPOSIT_APPLY+DEPOSIT_UNAPPLY+TRANSFER_DEBIT-TRANSFER_CREDIT',
      depositBalance: 'RECEIVE+UNAPPLY-APPLY-REFUND; ALLOCATE_* requires separate approval',
      actualNetReceipts: 'SUCCEEDED IN minus SUCCEEDED OUT; exclude pending, internal allocation and deposit application',
      masterDebt: 'Same folio formula per MASTER; transfers do not create revenue or cash'
    } };
}
