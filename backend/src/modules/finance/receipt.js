import { canonicalIntent, intentHash } from '../bookings/intent.js';
import { sqlId, sqlText, sqlUtc } from '../bookings/dto.js';
import { financeRecord, entryDto, movementDto, paymentDto, refundDto, folioDto, dayDto, previewDto, contextDto, list } from './dto.js';
import { invalidFinanceSql, equal, money, amount, sum, financeError } from './money.js';

const same = (a, b) => { if (canonicalIntent(a) !== canonicalIntent(b)) throw invalidFinanceSql(); };
const only = (rows, count) => { if (rows.length !== count) throw invalidFinanceSql(); return rows[0]; };
function noMoney(effects) { if (effects.entries.length || effects.movements.length || effects.payments.length) throw invalidFinanceSql(); }
function unique(rows) { if (new Set(rows.map(row => row.id)).size !== rows.length) throw invalidFinanceSql(); }
export function validateCheckoutMinibarCoverage(before, after, maximum) {
  list(before, maximum); const audited = list(after, maximum);
  if (audited.length !== before.length || new Set(audited.map(item => item.segmentId)).size !== audited.length
    || audited.some(item => item.status !== 'CONFIRMED' || !before.some(segment => segment.segmentId === item.segmentId))) throw invalidFinanceSql();
  for (const item of audited) {
    sqlId(item.auditId); money(item.amountVnd);
    const prior = before.find(segment => segment.segmentId === item.segmentId);
    // Confirmed 0 VND is real coverage, not a missing inspection. A successful
    // settlement cannot silently swap the audit or change its charge amount.
    if (prior.status === 'CONFIRMED' && (prior.auditId !== item.auditId || prior.amountVnd !== item.amountVnd)) throw invalidFinanceSql();
  }
}
function effectDto(raw, actor, maxLines) {
  if (!raw) throw invalidFinanceSql();
  const result = { entries: list(raw.entries, maxLines).map(entryDto), movements: list(raw.movements, maxLines).map(movementDto),
    payments: list(raw.payments, maxLines).map(paymentDto), refunds: list(raw.refunds, maxLines).map(refundDto) };
  for (const rows of Object.values(result)) unique(rows);
  if (result.entries.some(row => row.createdById !== actor.appUserId) || result.movements.some(row => row.createdById !== actor.appUserId)
    || result.payments.some(row => row.recordedById !== actor.appUserId)) throw invalidFinanceSql();
  return result;
}
function transfer(entries, sourceId, targetId, amountVnd) {
  if (entries.length !== 2) throw invalidFinanceSql();
  const from = entries.find(row => row.folioId === sourceId && row.kind === 'TRANSFER_CREDIT'), to = entries.find(row => row.folioId === targetId && row.kind === 'TRANSFER_DEBIT');
  if (!from || !to || !from.transferPairId || from.transferPairId !== to.transferPairId || from.amountVnd !== amountVnd || to.amountVnd !== amountVnd) throw invalidFinanceSql();
  equal(BigInt(from.signedAmountVnd) + BigInt(to.signedAmountVnd), '0');
}
function allocatedPayment(payment, input, effects) {
  if (payment.status !== 'SUCCEEDED') {
    if (effects.entries.length || effects.movements.length) throw invalidFinanceSql(); return;
  }
  if (effects.entries.length + effects.movements.length !== input.allocations.length) throw invalidFinanceSql();
  for (const allocation of input.allocations) {
    const rows = allocation.folioId ? effects.entries.filter(row => row.folioId === allocation.folioId && row.kind === 'PAYMENT' && row.paymentId === payment.id)
      : effects.movements.filter(row => row.depositAccountId === allocation.depositAccountId && row.kind === 'RECEIVE' && row.paymentId === payment.id);
    const row = only(rows, 1); if (row.amountVnd !== allocation.amountVnd) throw invalidFinanceSql();
  }
  equal(sum([...effects.entries, ...effects.movements].map(row => row.amountVnd)), payment.amountVnd);
}
export function financeReceipt(raw, actor, resource, operation, input, key, digest, gateway) {
  if (!raw || raw.committed !== true || typeof raw.replayed !== 'boolean' || raw.actorId !== actor.appUserId || raw.resource !== resource || raw.operation !== operation
    || raw.idempotencyKey !== key || raw.intentHash !== digest) throw invalidFinanceSql();
  const row = financeRecord(resource, raw.row), before = raw.before === null ? null : financeRecord(resource, raw.before);
  const context = contextDto(raw.contextBefore, resource, operation, input.id);
  if (context.contextToken !== input.contextToken || !raw.replayed && context.policyReference !== gateway.policies.businessClock?.reference
    || before && resource !== 'deposits' && context.subjectVersion !== input.expectedVersion) throw invalidFinanceSql();
  const effects = effectDto(raw.effects, actor, gateway.limits.maxLines), event = {
    actorId: sqlId(raw.event?.actorId), operation: sqlText(raw.event?.operation, 24), atUtc: sqlUtc(raw.event?.atUtc), reason: sqlText(raw.event?.reason, 1000, true)
  };
  if (event.actorId !== actor.appUserId || event.operation !== operation || event.reason !== (input.reason ?? null)) throw invalidFinanceSql();
  if ([...effects.entries, ...effects.movements, ...effects.payments].some(item => item.businessDate !== context.businessDate)
    || ['payments', 'cashier', 'days'].includes(resource) && row.businessDate !== context.businessDate) throw invalidFinanceSql();
  if (['create', 'open'].includes(operation)) { if (before !== null) throw invalidFinanceSql(); }
  else if (!before || before.id !== row.id || row.id !== input.id || resource !== 'deposits' && (before.version !== input.expectedVersion || before.version === row.version)) throw invalidFinanceSql();
  if (before && ['folios', 'deposits', 'payments', 'checkouts'].includes(resource) && before.bookingId !== row.bookingId) throw invalidFinanceSql();
  if (resource !== 'checkouts' && effects.refunds.length) throw invalidFinanceSql();
  if (before) {
    const immutable = resource === 'refunds' ? ['originalPaymentId', 'folioId', 'depositAccountId', 'amountVnd', 'requestedById', 'requestedAtUtc', 'reason']
      : resource === 'payments' ? ['code', 'purpose', 'method', 'direction', 'amountVnd', 'originalPaymentId', 'refundRequestId', 'shiftId', 'recordedById', 'createdAtUtc']
        : resource === 'folios' ? ['code', 'kind', 'bookingRoomId', 'payerCustomerId', 'payerOrganizationId'] : [];
    for (const field of immutable) same(before[field], row[field]);
  }
  if (resource === 'payments') {
    if (operation === 'create') {
      if (row.bookingId !== input.bookingId || row.direction !== 'IN' || row.purpose !== input.purpose || row.method !== input.method || row.amountVnd !== input.amountVnd
        || row.status !== (input.method === 'CASH' ? 'SUCCEEDED' : 'PENDING') || row.shiftId !== input.shiftId || row.recordedById !== actor.appUserId) throw invalidFinanceSql();
      same(only(effects.payments, 1), row); allocatedPayment(row, input, effects);
    } else {
      if (before.status !== 'PENDING' || before.method === 'CASH' || row.status !== 'CANCELLED' || row.amountVnd !== before.amountVnd || row.method !== before.method) throw invalidFinanceSql();
      noMoney(effects);
    }
  } else if (resource === 'refunds') {
    if (operation === 'create') {
      const source = paymentDto(raw.sourcePayment);
      if (row.status !== 'PENDING' || row.requestedById !== actor.appUserId || row.originalPaymentId !== input.originalPaymentId || row.amountVnd !== input.amountVnd
        || row.folioId !== input.folioId || row.depositAccountId !== input.depositAccountId || source.id !== row.originalPaymentId || source.status !== 'SUCCEEDED' || source.direction !== 'IN' || BigInt(row.amountVnd) > BigInt(source.amountVnd)) throw invalidFinanceSql();
      noMoney(effects);
    } else if (operation === 'decide') {
      if (before.status !== 'PENDING' || row.status !== input.decision || before.requestedById === actor.appUserId || row.amountVnd !== before.amountVnd
        || row.originalPaymentId !== before.originalPaymentId || row.folioId !== before.folioId || row.depositAccountId !== before.depositAccountId
        || input.decision === 'APPROVED' && row.approvedById !== actor.appUserId) throw invalidFinanceSql();
      noMoney(effects);
    } else {
      const payment = only(effects.payments, 1);
      if (before.status !== 'APPROVED' || before.requestedById === before.approvedById || row.status !== 'COMPLETED' || row.refundPaymentId !== payment.id
        || payment.status !== 'SUCCEEDED' || payment.method !== 'CASH' || payment.direction !== 'OUT' || payment.amountVnd !== row.amountVnd
        || row.amountVnd !== before.amountVnd || row.originalPaymentId !== before.originalPaymentId || payment.originalPaymentId !== before.originalPaymentId || payment.refundRequestId !== row.id || payment.shiftId !== input.shiftId) throw invalidFinanceSql();
      const link = row.folioId ? only(effects.entries, 1) : only(effects.movements, 1);
      if (row.folioId && effects.movements.length || row.depositAccountId && effects.entries.length || link.kind !== 'REFUND' || link.paymentId !== payment.id || link.amountVnd !== row.amountVnd
        || row.folioId && link.folioId !== row.folioId || row.depositAccountId && link.depositAccountId !== row.depositAccountId) throw invalidFinanceSql();
    }
  } else if (resource === 'folios') {
    if (before.status !== 'OPEN') throw invalidFinanceSql();
    if (operation === 'transfer') {
      const targetBefore = folioDto(raw.targetBefore), targetAfter = folioDto(raw.targetAfter);
      if (targetBefore.id !== input.targetFolioId || targetBefore.version !== input.targetVersion || targetAfter.id !== targetBefore.id || targetAfter.version === targetBefore.version
        || targetBefore.bookingId !== before.bookingId || targetAfter.bookingId !== before.bookingId || targetBefore.status !== 'OPEN' || targetAfter.status !== 'OPEN'
        || BigInt(input.amountVnd) > BigInt(before.balanceVnd) || row.status !== 'OPEN') throw invalidFinanceSql();
      transfer(effects.entries, row.id, targetAfter.id, input.amountVnd);
      equal(row.balanceVnd, BigInt(before.balanceVnd) - BigInt(input.amountVnd)); equal(targetAfter.balanceVnd, BigInt(targetBefore.balanceVnd) + BigInt(input.amountVnd));
      const provenance = list(raw.transferProvenance, gateway.limits.maxLines).map(part => {
        const source = entryDto(part.sourceEntry), allocatedVnd = amount(part.amountVnd, { positive: true, sql: true });
        if (source.folioId !== before.id || source.kind !== 'CHARGE' || BigInt(allocatedVnd) > BigInt(source.amountVnd)) throw invalidFinanceSql();
        return { id: source.id, amountVnd: allocatedVnd };
      }); unique(provenance); equal(sum(provenance.map(part => part.amountVnd)), input.amountVnd);
      if (effects.payments.length || effects.movements.length) throw invalidFinanceSql();
    } else if (operation === 'credit') {
      const original = entryDto(raw.originalEntry), credit = only(effects.entries, 1);
      if (original.kind !== 'CHARGE' || original.id !== input.originalEntryId || original.folioId !== row.id || original.category === 'ROOM'
        || credit.kind !== 'CHARGE_CREDIT' || credit.reversesEntryId !== original.id || credit.folioId !== row.id || credit.category !== original.category || credit.stayId !== original.stayId
        || credit.amountVnd !== input.amountVnd || effects.payments.length || effects.movements.length) throw invalidFinanceSql();
      equal(row.balanceVnd, BigInt(before.balanceVnd) - BigInt(input.amountVnd));
    } else { if (row.status !== 'CLOSED' || before.balanceVnd !== '0') throw invalidFinanceSql(); noMoney(effects); }
  } else if (resource === 'deposits') {
    if (row.stateToken === before.stateToken) throw invalidFinanceSql();
    if (operation === 'allocate') {
      // Requires a separately approved DepositMovement extension; never fabricate RECEIVE.
      const outgoing = effects.movements.filter(item => item.kind === 'ALLOCATE_OUT'), incoming = effects.movements.filter(item => item.kind === 'ALLOCATE_IN');
      if (!outgoing.length || incoming.length !== outgoing.length || effects.movements.length !== outgoing.length * 2 || effects.entries.length || effects.payments.length) throw invalidFinanceSql();
      if (new Set(outgoing.map(item => item.allocationPairId)).size !== outgoing.length) throw invalidFinanceSql();
      for (const out of outgoing) {
        const received = incoming.filter(item => item.allocationPairId === out.allocationPairId), leg = only(received, 1);
        if (out.depositAccountId !== row.id || leg.depositAccountId !== input.targetDepositAccountId || out.amountVnd !== leg.amountVnd
          || out.counterpartyDepositAccountId !== leg.depositAccountId || leg.counterpartyDepositAccountId !== out.depositAccountId || out.originalReceiveMovementId !== leg.originalReceiveMovementId) throw invalidFinanceSql();
      }
      equal(sum(outgoing.map(item => item.amountVnd)), input.amountVnd);
      equal(row.balanceVnd, BigInt(before.balanceVnd) - BigInt(input.amountVnd));
      const targetBefore = financeRecord('deposits', raw.targetBefore), targetAfter = financeRecord('deposits', raw.targetAfter);
      if (targetBefore.id !== input.targetDepositAccountId || targetAfter.id !== targetBefore.id || targetAfter.stateToken === targetBefore.stateToken
        || targetBefore.bookingId !== row.bookingId || targetAfter.bookingId !== row.bookingId || before.kind !== 'BOOKING' || targetBefore.kind !== 'BOOKING' || targetAfter.kind !== targetBefore.kind) throw invalidFinanceSql();
      equal(targetAfter.balanceVnd, BigInt(targetBefore.balanceVnd) + BigInt(input.amountVnd));
    } else {
      const movement = only(effects.movements, 1), entry = only(effects.entries, 1);
      if (effects.payments.length || movement.depositAccountId !== row.id || entry.depositMovementId !== movement.id || entry.amountVnd !== movement.amountVnd) throw invalidFinanceSql();
      if (operation === 'apply') {
        if (movement.kind !== 'APPLY' || entry.kind !== 'DEPOSIT_APPLY' || entry.folioId !== input.targetFolioId || movement.amountVnd !== input.amountVnd) throw invalidFinanceSql();
        equal(row.balanceVnd, BigInt(before.balanceVnd) - BigInt(input.amountVnd));
        if (BigInt(input.amountVnd) > BigInt(before.availableVnd)) throw invalidFinanceSql();
        const targetBefore = folioDto(raw.targetBefore), targetAfter = folioDto(raw.targetAfter);
        if (targetBefore.id !== input.targetFolioId || targetBefore.version !== input.targetVersion || targetBefore.status !== 'OPEN' || targetAfter.status !== 'OPEN'
          || targetAfter.id !== targetBefore.id || targetBefore.bookingId !== row.bookingId || targetAfter.bookingId !== row.bookingId
          || before.kind === 'GUARANTEE' && targetBefore.bookingRoomId !== before.bookingRoomId) throw invalidFinanceSql();
        equal(targetAfter.balanceVnd, BigInt(targetBefore.balanceVnd) - BigInt(input.amountVnd));
      } else {
        const original = movementDto(raw.originalMovement), originalEntry = entryDto(raw.originalEntry);
        if (original.id !== input.originalMovementId || original.kind !== 'APPLY' || original.depositAccountId !== row.id || originalEntry.depositMovementId !== original.id
          || originalEntry.kind !== 'DEPOSIT_APPLY' || originalEntry.amountVnd !== original.amountVnd
          || movement.kind !== 'UNAPPLY' || movement.reversesMovementId !== original.id || movement.amountVnd !== original.amountVnd || entry.kind !== 'DEPOSIT_UNAPPLY' || entry.folioId !== originalEntry.folioId) throw invalidFinanceSql();
        equal(row.balanceVnd, BigInt(before.balanceVnd) + BigInt(movement.amountVnd));
      }
    }
  } else if (resource === 'cashier') {
    if (row.cashierId !== actor.appUserId || before && before.cashierId !== actor.appUserId) throw invalidFinanceSql();
    if (operation === 'open' && (row.status !== 'OPEN' || row.openingCashVnd !== input.openingCashVnd)
      || operation === 'close' && (before.status !== 'OPEN' || row.status !== 'CLOSED' || row.countedCashVnd !== input.countedCashVnd)) throw invalidFinanceSql();
    if (operation === 'close') {
      const preview = previewDto(resource, raw.previewProof);
      if (!preview.canComplete || preview.previewToken !== input.previewToken || preview.subjectId !== row.id || preview.countedCashVnd !== input.countedCashVnd
        || preview.planDigest !== intentHash({ id: input.id, contextToken: input.contextToken, expectedVersion: input.expectedVersion, countedCashVnd: input.countedCashVnd })) throw invalidFinanceSql();
    }
    noMoney(effects);
  } else if (resource === 'days') {
    if (before.status !== 'OPEN' || row.status !== 'CLOSED' || row.closedById !== actor.appUserId) throw invalidFinanceSql();
    const next = dayDto(raw.nextBusinessDay); if (next.status !== 'OPEN' || next.id <= row.id) throw invalidFinanceSql(); noMoney(effects);
    const preview = previewDto(resource, raw.previewProof);
    if (!preview.canComplete || preview.previewToken !== input.previewToken || preview.subjectId !== row.id || preview.nextBusinessDate !== next.id
      || preview.planDigest !== intentHash({ id: input.id, contextToken: input.contextToken, expectedVersion: input.expectedVersion })) throw invalidFinanceSql();
  } else if (resource === 'invoices') {
    if (operation === 'create' && (row.status !== 'DRAFT' || row.sourceType !== input.sourceType || row.sourceId !== input.sourceId || row.createdById !== actor.appUserId)
      || operation === 'issue' && (before.status !== 'DRAFT' || row.status !== 'ISSUED' || row.internalNumber !== before.internalNumber || row.totalVnd !== before.totalVnd || row.sourceType !== before.sourceType || row.sourceId !== before.sourceId)) throw invalidFinanceSql();
    const source = raw.documentSource;
    if (!source || source.type !== row.sourceType || source.id !== row.sourceId || !['SUCCEEDED', 'COMPLETED', 'CHECKED_OUT'].includes(source.status) || source.amountVnd !== row.totalVnd) throw invalidFinanceSql();
    noMoney(effects);
  } else if (resource === 'checkouts') {
    const proof = raw.checkoutProof, preview = previewDto('checkouts', proof?.preview), roomFolio = folioDto(proof?.roomFolio);
    if (before.status !== 'IN_HOUSE' || row.status !== 'CHECKED_OUT' || preview.subjectId !== row.id || preview.previewToken !== input.previewToken
      || preview.contextToken !== input.contextToken || !preview.canComplete || preview.expectedVersion !== input.expectedVersion
      || preview.planDigest !== intentHash(input.plan)
      || roomFolio.id !== row.folioId || roomFolio.kind === 'MASTER' || roomFolio.status !== 'CLOSED' || roomFolio.balanceVnd !== '0'
      || proof.settlementStayId !== row.id || !/^[a-f0-9]{64}$/.test(proof.beforePriceSnapshotHash || '') || proof.beforePriceSnapshotHash !== proof.afterPriceSnapshotHash) throw invalidFinanceSql();
    same(preview.before, before.summary); same(preview.after, row.summary);
    for (const key of ['roomVnd', 'serviceVnd', 'minibarVnd', 'surchargeVnd', 'discountVnd', 'chargesVnd']) if (before.summary[key] !== row.summary[key]) throw invalidFinanceSql();
    const released = proof.releasedRoom;
    if (!released || released.roomId !== row.roomId || released.occupancyStatus !== 'VACANT' || released.cleanlinessStatus !== 'DIRTY') throw invalidFinanceSql();
    sqlId(proof.departureTaskId); sqlId(proof.departedSegmentId); sqlUtc(row.checkedOutAtUtc);
    validateCheckoutMinibarCoverage(preview.minibarCoverage, proof.minibarCoverageAfter, gateway.limits.maxLines);
    if (preview.master) { const master = folioDto(proof.masterFolio); if (master.id !== preview.master.folioId || master.kind !== 'MASTER' || master.status !== 'OPEN' || master.balanceVnd !== preview.master.balanceAfterVnd || master.bookingId !== row.bookingId) throw invalidFinanceSql(); }
    else if (proof.masterFolio !== null) throw invalidFinanceSql();
    if ((effects.entries.length || effects.movements.length || effects.payments.length) && !actor.permissions.includes('collectPayment')) throw invalidFinanceSql();
    for (const payment of effects.payments) if (payment.method !== 'CASH' || payment.status !== 'SUCCEEDED' || payment.bookingId !== row.bookingId) throw invalidFinanceSql();
    const cashIn = effects.payments.filter(payment => payment.direction === 'IN'), cashOut = effects.payments.filter(payment => payment.direction === 'OUT');
    if (input.plan.cashReceipt) {
      const paid = only(cashIn, 1); if (paid.amountVnd !== input.plan.cashReceipt.amountVnd || paid.shiftId !== input.plan.cashReceipt.shiftId || paid.purpose !== 'SETTLEMENT') throw invalidFinanceSql();
    } else if (cashIn.length) throw invalidFinanceSql();
    same(effects.refunds.map(refund => refund.id).sort(), [...input.plan.refundRequestIds].sort());
    if (cashOut.length !== input.plan.refundRequestIds.length) throw invalidFinanceSql();
    const applications = effects.movements.filter(movement => movement.kind === 'APPLY');
    if (applications.length !== input.plan.depositApplications.length || effects.movements.some(movement => !['APPLY', 'REFUND'].includes(movement.kind))) throw invalidFinanceSql();
    for (const application of input.plan.depositApplications) {
      const matched = only(applications.filter(movement => movement.depositAccountId === application.depositAccountId), 1);
      if (matched.amountVnd !== application.amountVnd) throw invalidFinanceSql();
    }
    const transferEntries = effects.entries.filter(entry => ['TRANSFER_DEBIT', 'TRANSFER_CREDIT'].includes(entry.kind));
    if (input.plan.transferToMaster) {
      if (!preview.master || preview.master.folioId !== input.plan.transferToMaster.targetFolioId || preview.master.transferredVnd !== input.plan.transferToMaster.amountVnd) throw invalidFinanceSql();
    } else if (transferEntries.length || preview.master && preview.master.transferredVnd !== '0') throw invalidFinanceSql();
    if (effects.payments.some(item => item.direction === 'OUT')) gateway.assertPolicy('refunds', 'complete');
    if (effects.entries.some(item => ![row.folioId, preview.master?.folioId].includes(item.folioId)) || effects.entries.some(item => ['CHARGE', 'CHARGE_CREDIT'].includes(item.kind))) throw invalidFinanceSql();
    const scopedEntries = effects.entries.filter(item => item.folioId === row.folioId);
    const delta = kind => BigInt(sum(scopedEntries.filter(item => item.kind === kind).map(item => item.amountVnd)));
    equal(BigInt(row.summary.paymentsVnd) - BigInt(before.summary.paymentsVnd), delta('PAYMENT'));
    equal(BigInt(row.summary.refundsVnd) - BigInt(before.summary.refundsVnd), delta('REFUND'));
    equal(BigInt(row.summary.depositAppliedVnd) - BigInt(before.summary.depositAppliedVnd), delta('DEPOSIT_APPLY') - delta('DEPOSIT_UNAPPLY'));
    equal(BigInt(row.summary.transferOutVnd) - BigInt(before.summary.transferOutVnd), delta('TRANSFER_CREDIT'));
    equal(BigInt(row.summary.transferInVnd) - BigInt(before.summary.transferInVnd), delta('TRANSFER_DEBIT'));
    if (preview.master?.transferredVnd !== undefined && preview.master.transferredVnd !== '0') transfer(effects.entries.filter(item => ['TRANSFER_DEBIT', 'TRANSFER_CREDIT'].includes(item.kind)), row.folioId, preview.master.folioId, preview.master.transferredVnd);
    for (const refund of effects.refunds) if (refund.status !== 'COMPLETED' || refund.requestedById === refund.approvedById || !effects.payments.some(payment => payment.id === refund.refundPaymentId && payment.refundRequestId === refund.id && payment.originalPaymentId === refund.originalPaymentId && payment.amountVnd === refund.amountVnd)) throw invalidFinanceSql();
  }
  // All actual cash movements in the receipt must be allocated once, in full.
  for (const payment of effects.payments) if (payment.status === 'SUCCEEDED') {
    const linked = [...effects.entries.filter(entry => entry.paymentId === payment.id), ...effects.movements.filter(movement => movement.paymentId === payment.id)];
    equal(sum(linked.map(part => part.amountVnd)), payment.amountVnd);
    if (linked.some(part => part.kind !== (payment.direction === 'IN' ? part.folioId ? 'PAYMENT' : 'RECEIVE' : 'REFUND'))) throw invalidFinanceSql();
  }
  for (const entry of effects.entries) if (entry.paymentId && !effects.payments.some(payment => payment.id === entry.paymentId && payment.status === 'SUCCEEDED')) throw invalidFinanceSql();
  for (const entry of effects.entries) if (entry.depositMovementId) {
    const movement = effects.movements.find(item => item.id === entry.depositMovementId);
    if (!movement || movement.amountVnd !== entry.amountVnd || entry.kind !== (movement.kind === 'APPLY' ? 'DEPOSIT_APPLY' : movement.kind === 'UNAPPLY' ? 'DEPOSIT_UNAPPLY' : 'INVALID')) throw invalidFinanceSql();
  }
  for (const movement of effects.movements) if (['APPLY', 'UNAPPLY'].includes(movement.kind) && effects.entries.filter(entry => entry.depositMovementId === movement.id).length !== 1) throw invalidFinanceSql();
  for (const movement of effects.movements) if (movement.paymentId && !effects.payments.some(payment => payment.id === movement.paymentId && payment.status === 'SUCCEEDED')) throw invalidFinanceSql();
  return { committed: true, replayed: raw.replayed, row, effects, event };
}
