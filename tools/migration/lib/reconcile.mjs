import { canonical, digest, isObject, requireThat, vnd } from './core.mjs';

export function validatePlan(plan) {
  const { planSha256, ...content } = plan;
  requireThat(plan.format === 'songlam-migration-plan/1' && digest(content) === planSha256, 'PLAN_CHECKSUM_MISMATCH');
  requireThat(Array.isArray(plan.records) && Array.isArray(plan.blockers) && isObject(plan.money)
    && Array.isArray(plan.money.ledger) && plan.records.every(r => isObject(r) && Array.isArray(r.mappings)), 'PLAN_STRUCTURE_INVALID');
}
const key = row => canonical([row.sourceRef, row.targetEntity, row.component]);
const moneyKey = row => canonical([row.scopeKind, row.scopeSourceRef, row.sourceRef, row.metric, row.component]);
const metrics = new Set(['DEPOSIT_RECEIVE', 'DEPOSIT_APPLY', 'DEPOSIT_UNAPPLY', 'DEPOSIT_REFUND',
  'CASH_IN', 'CASH_OUT', 'CHARGE', 'CHARGE_CREDIT', 'PAYMENT', 'REFUND', 'TRANSFER_DEBIT',
  'TRANSFER_CREDIT', 'DEPOSIT_ALLOCATION_IN', 'DEPOSIT_ALLOCATION_OUT', 'FOLIO_BALANCE', 'MASTER_BALANCE']);

// target is a complete, source-bound verification snapshot, never a paginated UI result.
export function reconcile(plan, target) {
  validatePlan(plan);
  if (target) requireThat(isObject(target) && Array.isArray(target.records) && Array.isArray(target.money)
    && target.records.every(r => isObject(r) && typeof r.sourceRef === 'string' && typeof r.targetEntity === 'string'
      && typeof r.component === 'string' && /^[1-9]\d*$/.test(String(r.targetId)))
    && target.money.every(r => isObject(r) && typeof r.sourceRef === 'string'), 'VERIFICATION_STRUCTURE_INVALID');
  const issues = [];
  const issue = (code, ref = null, component = null) => issues.push({ code, sourceRef: ref, component });
  if (!target) issue('TARGET_SNAPSHOT_NOT_PROVIDED');
  if (target && (target.format !== 'songlam-migration-verification/1' || target.batchId !== plan.batchId
      || target.sourceSha256 !== plan.sourceSha256 || target.planSha256 !== plan.planSha256)) issue('TARGET_IDENTITY_MISMATCH');
  if (target && (target.complete !== true || target.environment !== 'rehearsal' || !target.databaseFingerprint
      || !target.approvalReference || !target.readContractVersion || !Array.isArray(target.records) || !Array.isArray(target.money))) issue('TARGET_CONTRACT_OR_COVERAGE_INCOMPLETE');
  for (const blocker of plan.blockers || []) issue(blocker);
  if (plan.money?.coverage !== 'COMPLETE') issue('SOURCE_FINANCIAL_COVERAGE_UNRESOLVED');
  const expected = plan.records.flatMap(r => r.classification === 'REAL' ? r.mappings.map(m => ({ ...m, sourceHash: r.sourceHash })) : []);
  for (const row of plan.records) {
    if (row.status === 'QUARANTINED' || row.classification === 'UNKNOWN') issue('SOURCE_QUARANTINED_OR_UNCLASSIFIED', row.sourceRef);
    if (row.classification === 'REAL' && !row.mappings.length) issue('REAL_SOURCE_UNMAPPED', row.sourceRef);
    if (row.classification === 'DEMO' && !row.exclusionApprovalReference) issue('EXCLUSION_NOT_APPROVED', row.sourceRef);
  }
  const index = (rows, getKey, code) => {
    const map = new Map();
    for (const row of rows) {
      const id = getKey(row);
      if (map.has(id)) issue(code, row.sourceRef);
      map.set(id, row);
    }
    return map;
  };
  const expectedIndex = index(expected, key, 'EXPECTED_MAPPING_DUPLICATE');
  const actualIndex = index(target?.records || [], key, 'TARGET_MAPPING_DUPLICATE');
  const missing = [], extra = [], different = [];
  for (const [id, row] of expectedIndex) {
    const actual = actualIndex.get(id);
    if (!actual) { missing.push({ sourceRef: row.sourceRef, entity: row.targetEntity, component: row.component }); issue('TARGET_RECORD_MISSING', row.sourceRef, row.component); }
    else if (String(actual.targetId) !== String(row.targetId) || actual.sourceHash !== row.sourceHash
        || actual.relationshipsVerified !== true || actual.valuesVerified !== true) {
      different.push({ sourceRef: row.sourceRef, entity: row.targetEntity, component: row.component });
      issue('TARGET_ID_CONTENT_OR_RELATIONSHIP_DIFF', row.sourceRef, row.component);
    }
  }
  for (const [id, row] of actualIndex) if (!expectedIndex.has(id)) {
    extra.push({ sourceRef: row.sourceRef, entity: row.targetEntity, component: row.component }); issue('TARGET_RECORD_EXTRA', row.sourceRef, row.component);
  }
  const expectedMoney = index(plan.money?.ledger || [], moneyKey, 'SOURCE_MONEY_DUPLICATE');
  const actualMoney = index(target?.money || [], moneyKey, 'TARGET_MONEY_DUPLICATE');
  const moneyDifferences = [];
  for (const id of new Set([...expectedMoney.keys(), ...actualMoney.keys()])) {
    const before = expectedMoney.get(id), after = actualMoney.get(id), row = before || after;
    let differenceVnd = null;
    try {
      requireThat(before && after && metrics.has(row.metric)
        && ['BOOKING', 'STAY', 'MASTER'].includes(row.scopeKind) && row.scopeSourceRef && row.sourceRef && row.component, 'MONEY_LINK_MISSING');
      differenceVnd = (vnd(after.amountVnd) - vnd(before.amountVnd)).toString();
    } catch { issue('MONEY_VALUE_OR_SCOPE_MISSING', row.sourceRef); }
    if (differenceVnd !== '0') {
      moneyDifferences.push({ sourceRef: row.sourceRef, scopeKind: row.scopeKind, scopeSourceRef: row.scopeSourceRef,
        metric: row.metric, component: row.component, expectedVnd: before?.amountVnd ?? null,
        actualVnd: after?.amountVnd ?? null, differenceVnd });
      issue('MONEY_DIFFERENCE_OR_UNKNOWN', row.sourceRef, row.component);
    }
  }
  // Per-source comparison above prevents equal/opposite differences cancelling out.
  const totals = rows => {
    const sums = new Map();
    for (const row of rows) {
      const id = canonical([row.scopeKind, row.scopeSourceRef, row.metric]);
      try { sums.set(id, (sums.get(id) || 0n) + vnd(row.amountVnd)); }
      catch { issue('INVALID_SCOPE_MONEY', row.sourceRef); }
    }
    return [...sums].map(([id, amount]) => ({ scope: JSON.parse(id), amountVnd: amount.toString() }));
  };
  const scopeTotalsBefore = totals(plan.money?.ledger || []), scopeTotalsAfter = totals(target?.money || []);
  const entityCounts = [...new Set([...expected, ...(target?.records || [])].map(r => r.targetEntity))].map(entity => ({
    entity, expected: expected.filter(r => r.targetEntity === entity).length,
    actual: (target?.records || []).filter(r => r.targetEntity === entity).length,
    missing: missing.filter(r => r.entity === entity).length, extra: extra.filter(r => r.entity === entity).length
  }));
  return { format: 'songlam-migration-reconciliation/1', generatedAtUtc: new Date().toISOString(),
    batchId: plan.batchId, sourceSha256: plan.sourceSha256, planSha256: plan.planSha256,
    targetSha256: target ? digest(target) : null,
    targetDatabaseFingerprint: target?.databaseFingerprint || null,
    status: issues.length ? 'FAIL' : 'PASS', issues, sourceCounts: plan.counts, entityCounts,
    missing, extra, different, moneyDifferences, scopeTotalsBefore, scopeTotalsAfter,
    unresolvedMoney: plan.money?.coverage !== 'COMPLETE' ? plan.money?.observations : [],
    quarantine: plan.records.filter(r => r.status === 'QUARANTINED').map(r => ({ sourceRef: r.sourceRef, pointer: r.pointer, reasons: r.reasons })) };
}
