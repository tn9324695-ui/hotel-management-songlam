import { randomUUID } from 'node:crypto';
import { digest, requireThat, writeNew, inside, MigrationError } from './core.mjs';
import { validatePlan } from './reconcile.mjs';

export function validateRehearsal(config, plan) {
  validatePlan(plan);
  requireThat(config.environment === 'rehearsal' && config.testOnly === true, 'EXPLICIT_REHEARSAL_REQUIRED');
  requireThat(typeof config.server === 'string' && config.server.length > 0 && typeof config.database === 'string', 'TEST_TARGET_REQUIRED');
  // Operational target is intentionally rejected, even if testOnly is hand-edited.
  requireThat(config.database.toLowerCase() !== 'songlampms_design' && /rehearsal|test|sandbox/i.test(config.database), 'OPERATIONAL_DATABASE_FORBIDDEN');
  requireThat(config.backupAttestation?.approvalReference && config.backupAttestation?.restoredDatabaseFingerprint, 'TEST_BACKUP_RESTORE_ATTESTATION_REQUIRED');
  requireThat(config.contractApprovalReference && config.actorMappingApprovalReference, 'SEPARATE_SQL_AND_ACTOR_APPROVAL_REQUIRED');
  requireThat(config.expectedDatabaseFingerprint && config.operatorAppUserId && /^[1-9]\d*$/.test(String(config.operatorAppUserId)), 'TRUSTED_OPERATOR_AND_TARGET_REQUIRED');
}

// Unwired framework: CLI cannot obtain an approved adapter yet. No SQL is performed.
// Each aggregate must be the approved complete connected booking/stay/financial graph;
// never split a group, deposit allocation, transfer or folio across transactions.
export async function importBatches({ adapter, config, plan, aggregates, checkpointDirectory, progress = () => {} }) {
  validateRehearsal(config, plan);
  requireThat(plan.blockers.length === 0 && plan.money.coverage === 'COMPLETE', 'IMPORT_PLAN_BLOCKED');
  requireThat(plan.records.every(r => r.status === 'IMPORT_READY' || r.status === 'EXCLUDED_APPROVED'), 'IMPORT_SOURCE_NOT_READY');
  const cap = await adapter.capabilities();
  requireThat(['atomicBatch', 'durableIdempotency', 'sourceDigestRegistry', 'historicalOnly', 'rollbackOnFailure', 'completeReadback'].every(k => cap[k] === true), 'IMPORT_ATOMICITY_CONTRACT_REQUIRED');
  requireThat(Number.isInteger(cap.maxRecords) && cap.maxRecords > 0 && Number.isInteger(cap.maxPayloadBytes) && cap.maxPayloadBytes > 0, 'SQL_BATCH_LIMITS_REQUIRED');
  const identity = await adapter.verifyEnvironment();
  requireThat(identity.environment === 'rehearsal' && identity.database === config.database
    && identity.server === config.server && identity.databaseFingerprint === config.expectedDatabaseFingerprint
    && identity.databaseFingerprint === config.backupAttestation.restoredDatabaseFingerprint, 'TEST_TARGET_IDENTITY_MISMATCH');
  requireThat(Array.isArray(aggregates) && aggregates.length > 0, 'APPROVED_AGGREGATE_PLAN_REQUIRED');
  const covered = new Set();
  for (const aggregate of aggregates) {
    requireThat(Array.isArray(aggregate.sourceRefs) && aggregate.sourceRefs.length > 0 && aggregate.atomic === true, 'AGGREGATE_ATOMICITY_REQUIRED');
    for (const ref of aggregate.sourceRefs) {
      requireThat(!covered.has(ref) && plan.records.some(r => r.sourceRef === ref && r.status === 'IMPORT_READY'), 'AGGREGATE_COVERAGE_INVALID');
      covered.add(ref);
    }
    requireThat(Array.isArray(aggregate.records) && aggregate.records.length > 0 && aggregate.records.length <= cap.maxRecords
      && Buffer.byteLength(JSON.stringify(aggregate), 'utf8') <= cap.maxPayloadBytes, 'AGGREGATE_EXCEEDS_APPROVED_SQL_LIMIT_NO_SPLITTING');
  }
  requireThat(plan.records.filter(r => r.status === 'IMPORT_READY').every(r => covered.has(r.sourceRef)), 'AGGREGATE_SOURCE_MISSING');
  const binding = { batchId: plan.batchId, sourceSha256: plan.sourceSha256, manifestSha256: plan.manifestSha256,
    planSha256: plan.planSha256, aggregatePlanSha256: digest(aggregates), operatorAppUserId: String(config.operatorAppUserId) };
  await adapter.registerSource(binding);
  for (let ordinal = 0; ordinal < aggregates.length; ordinal++) {
    const aggregate = aggregates[ordinal];
    const payloadSha256 = digest(aggregate);
    // Local attempt journal is advisory; SQL's unique batch+ordinal receipt is authoritative.
    const attemptId = randomUUID();
    const args = { ...binding, ordinal, payloadSha256, requestId: `${plan.batchId}:${ordinal}`, aggregate };
    await writeNew(inside(checkpointDirectory, `attempt-${ordinal}-${attemptId}.json`), { ...binding, ordinal, payloadSha256, state: 'STARTED' });
    let receipt = await adapter.getReceipt(args);
    if (receipt?.status !== 'COMMITTED') {
      requireThat(!receipt || receipt.status === 'UNKNOWN', 'BATCH_OUTCOME_NOT_RETRYABLE');
      try { receipt = await adapter.importAtomicBatch(args); }
      catch {
        // A timeout does not mean rollback. Never advance or change request identity.
        try { receipt = await adapter.getReceipt(args); } catch { receipt = null; }
        if (receipt?.status !== 'COMMITTED') {
          await writeNew(inside(checkpointDirectory, `unresolved-${ordinal}-${attemptId}.json`), { ...binding, ordinal, payloadSha256, state: 'STOPPED_OUTCOME_REQUIRES_READBACK' });
          throw new MigrationError('BATCH_FAILED_OR_OUTCOME_UNKNOWN_STOPPED');
        }
      }
    }
    requireThat(receipt?.status === 'COMMITTED' && Number.isFinite(Date.parse(receipt.committedAtUtc))
      && receipt.batchId === plan.batchId && receipt.ordinal === ordinal && receipt.sourceSha256 === plan.sourceSha256
      && receipt.planSha256 === plan.planSha256 && receipt.aggregatePlanSha256 === binding.aggregatePlanSha256
      && String(receipt.operatorAppUserId) === binding.operatorAppUserId
      && receipt.payloadSha256 === payloadSha256, 'RECEIPT_CONTENT_CHANGED_OR_INVALID');
    // Receipt adapter must whitelist metadata; never persist raw SQL result/payment payload.
    await writeNew(inside(checkpointDirectory, `checkpoint-${ordinal}-${attemptId}.json`), {
      ...binding, ordinal, payloadSha256, status: 'COMMITTED', receiptSha256: digest(receipt),
      committedAtUtc: receipt.committedAtUtc
    });
    progress({ ordinal, status: 'COMMITTED' });
  }
  return adapter.readback(binding);
}
