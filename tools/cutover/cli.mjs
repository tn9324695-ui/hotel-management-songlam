#!/usr/bin/env node
// OFFLINE evidence review only. No SQL, shell, configuration write or activation.
import { readJson, writeNew, digest, requireThat, MigrationError, vnd } from '../migration/lib/core.mjs';
import { releaseGates } from '../../backend/src/modules/cutover/runtime.js';
import { cutoverOperations } from '../../backend/src/modules/cutover/operations.js';

async function main() {
  const [command, ...args] = process.argv.slice(2), options = Object.create(null);
  if (!command || command === '--help') {
    process.stdout.write('G12 OFFLINE ONLY\nnode tools/cutover/cli.mjs review --release <release.json> --baseline <G11-report.json> --baseline-target <G11-verification.json> [--delta <post-switch-readback.json>] --out <NEW-report.json>\nNo activation, SQL, restore or rollback commands.\n');
    return;
  }
  requireThat(command === 'review', 'OFFLINE_REVIEW_ONLY');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    requireThat(args[i].startsWith('--') && ['release', 'baseline', 'baseline-target', 'delta', 'out'].includes(key)
      && args[i + 1] && !args[i + 1].startsWith('--') && !(key in options), 'INVALID_OPTION');
    options[key] = args[i + 1];
  }
  const release = await readJson(options.release), baseline = await readJson(options.baseline), target = await readJson(options['baseline-target']);
  const issues = [];
  const check = (ok, code, reference = null) => { if (!ok) issues.push({ code, reference }); };
  check(release.format === 'songlam-cutover-release/1' && release.approvalReference && release.buildId && release.deploymentId, 'RELEASE_UNCONFIRMED');
  check(release.target?.confirmed === true && release.target.server && release.target.database && release.target.fingerprint && release.target.environment, 'TARGET_UNCONFIRMED');
  check(baseline.status === 'PASS' && baseline.issues?.length === 0 && baseline.moneyDifferences?.length === 0
    && baseline.quarantine?.length === 0 && baseline.batchId === release.g11?.batchId
    && baseline.sourceSha256 === release.g11?.finalSourceSha256 && digest(baseline) === release.g11?.reportSha256, 'FINAL_G11_NOT_PASS');
  check(target.complete === true && target.databaseFingerprint === release.target?.fingerprint
    && target.environment === release.target?.environment && target.sourceSha256 === baseline.sourceSha256
    && target.batchId === baseline.batchId && digest(target) === release.g11?.verificationSha256
    && baseline.targetSha256 === digest(target), 'BASELINE_TARGET_MISMATCH');
  const gateRows = releaseGates.map(name => {
    const row = release.gates?.[name];
    const passed = row?.status === 'PASS' && row.owner && row.evidence && row.approvalReference && row.decision === 'CONTINUE'
      && Number.isFinite(Date.parse(row.startedAtUtc)) && Number.isFinite(Date.parse(row.finishedAtUtc))
      && Date.parse(row.finishedAtUtc) >= Date.parse(row.startedAtUtc);
    check(passed, 'GATE_NOT_VERIFIED', name);
    return { gate: name, status: passed ? 'EVIDENCE_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED' : 'NOT_CHECKED_OR_FAIL' };
  });
  check(Array.isArray(release.acceptedOperations) && release.acceptedOperations.length > 0, 'NO_ACCEPTED_OPERATIONS');
  for (const id of release.acceptedOperations || []) check(cutoverOperations.some(o => o.operation === id)
    && release.operationEvidence?.[id]?.status === 'PASS' && release.operationEvidence[id].evidence
    && release.operationEvidence[id].approvalReference, 'OPERATION_ACCEPTANCE_MISSING', id);
  let deltaSummary = { status: 'NOT_CHECKED', reason: 'NO_POST_SWITCH_READ_CONTRACT_SNAPSHOT' };
  if (options.delta) {
    const delta = await readJson(options.delta);
    requireThat(Array.isArray(delta.receipts) && Array.isArray(delta.balances) && Array.isArray(delta.exceptions), 'DELTA_STRUCTURE_INVALID');
    check(delta.format === 'songlam-cutover-delta/1' && delta.complete === true && delta.approvalReference && delta.readContractVersion, 'DELTA_CONTRACT_UNVERIFIED');
    check(delta.deploymentId === release.deploymentId && delta.databaseFingerprint === release.target?.fingerprint
      && delta.baselineTargetSha256 === digest(target) && delta.writesEnabledAtUtc === release.writesEnabledAtUtc
      && delta.fromWatermark && delta.toWatermark && Number.isFinite(Date.parse(delta.asOfUtc)), 'DELTA_SCOPE_MISMATCH');
    check(Array.isArray(delta.receipts) && Array.isArray(delta.balances) && Array.isArray(delta.exceptions), 'DELTA_COVERAGE_INVALID');
    check(delta.coverageVerified === true && delta.sourceLinksVerified === true && delta.moneyLinksVerified === true, 'DELTA_LINKS_NOT_VERIFIED');
    const requestIds = new Set(), keys = new Set();
    for (const receipt of delta.receipts || []) {
      const requestKey = `${receipt.actorAppUserId}:${receipt.operation}:${receipt.idempotencyKeySha256}`;
      check(!requestIds.has(receipt.requestId) && !keys.has(requestKey), 'DUPLICATE_COMMIT', receipt.requestId);
      check(receipt.status === 'COMMITTED' && /^[a-f0-9]{64}$/.test(receipt.idempotencyKeySha256 || '')
        && /^[1-9]\d*$/.test(String(receipt.actorAppUserId)) && cutoverOperations.some(o => o.operation === receipt.operation)
        && Number.isFinite(Date.parse(receipt.committedAtUtc)) && Date.parse(receipt.committedAtUtc) >= Date.parse(release.writesEnabledAtUtc), 'RECEIPT_INVALID', receipt.requestId);
      requestIds.add(receipt.requestId); keys.add(requestKey);
    }
    // Each signed change must come from the approved source-ledger verification RPC,
    // never browser values or summing list pages. No rounding/missing-as-zero.
    const balanceKeys = new Set();
    const metrics = new Set(['DEPOSIT_RECEIVE', 'DEPOSIT_APPLY', 'DEPOSIT_UNAPPLY', 'DEPOSIT_REFUND', 'CASH_IN', 'CASH_OUT',
      'CHARGE', 'CHARGE_CREDIT', 'PAYMENT', 'REFUND', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'FOLIO_BALANCE', 'MASTER_BALANCE']);
    for (const balance of delta.balances || []) {
      try {
        const key = `${balance.scopeKind}:${balance.scopeReference}:${balance.metric}`;
        check(!balanceKeys.has(key), 'DUPLICATE_SCOPE_BALANCE', balance.scopeReference); balanceKeys.add(key);
        check(['BOOKING', 'STAY', 'MASTER'].includes(balance.scopeKind) && balance.scopeReference && metrics.has(balance.metric)
          && vnd(balance.openingVnd) + vnd(balance.changeVnd) === vnd(balance.closingVnd), 'BALANCE_DIFFERENCE', balance.scopeReference);
      } catch { check(false, 'BALANCE_UNKNOWN', balance.scopeReference); }
    }
    for (const exception of delta.exceptions || []) check(exception.resolved === true && exception.approvalReference, 'UNRESOLVED_POST_SWITCH_EXCEPTION', exception.reference);
    check(delta.moneyDifferenceCount === 0 && delta.unknownOutcomeCount === 0 && delta.dualWriteCount === 0, 'STOP_OPERATIONS_REQUIRED');
    deltaSummary = { status: issues.length ? 'FAIL' : 'EVIDENCE_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED',
      snapshotSha256: digest(delta), receipts: delta.receipts?.length || 0, scopes: delta.balances?.length || 0,
      fromWatermark: delta.fromWatermark, toWatermark: delta.toWatermark };
  } else check(false, 'POST_SWITCH_MONITORING_NOT_CHECKED');
  const report = { format: 'songlam-cutover-review/1', generatedAtUtc: new Date().toISOString(),
    status: issues.length ? 'FAIL' : 'REQUIRES_OPERATOR_APPROVAL', activationPerformed: false,
    releaseSha256: digest(release), baselineSha256: digest(baseline), baselineTargetSha256: digest(target),
    gates: gateRows, delta: deltaSummary, issues };
  await writeNew(options.out, report);
  process.stdout.write(`${report.status}; issues=${issues.length}; no configuration/SQL changed.\n`);
  if (issues.length) process.exitCode = 2;
}
main().catch(error => {
  process.stderr.write('STOPPED: ' + (error instanceof MigrationError ? error.code : 'INVALID_INPUT_OR_OUTPUT_NOT_OVERWRITTEN') + '\n');
  process.exitCode = 1;
});
