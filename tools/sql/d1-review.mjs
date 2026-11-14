#!/usr/bin/env node
// Offline evidence checks only. No SQL client, subprocess, runtime flags or writes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reference = value => typeof value === 'string' && value.trim().length > 0;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export function reviewD1(plan, receipt = null) {
  if (plan?.kind !== 'PROPOSAL_ONLY_NOT_RUNTIME_CONFIGURATION' || plan.databaseTestUseApproved !== true ||
      !reference(plan.testUseReference) || !reference(plan.serverIdentity) || !reference(plan.database) ||
      !uuid.test(plan.databaseGuid) || !uuid.test(plan.proposedTestIdentity) ||
      !reference(plan.mediaName) || !reference(plan.backupPath) ||
      !plan.backupPath.endsWith('\\' + plan.mediaName + '.bak') || /[\r\n]/.test(plan.backupPath)) {
    throw new Error('D1_PLAN_INVALID');
  }
  const backupVerified = receipt?.status === 'BACKUP_VERIFYONLY_SUCCEEDED_NOT_RESTORE_TESTED' &&
    uuid.test(receipt.backupSetUuid) && same(receipt.serverIdentity, plan.serverIdentity) &&
    same(receipt.database, plan.database) && same(receipt.databaseGuid, plan.databaseGuid) &&
    receipt.mediaName === plan.mediaName && same(receipt.backupPath, plan.backupPath) &&
    receipt.position === 1 && receipt.copyOnly === true && receipt.checksums === true &&
    receipt.verifyOnlySucceeded === true && reference(receipt.finishedAt) &&
    Number.isFinite(Date.parse(receipt.finishedAt));
  return Object.freeze({ scope: 'ORIGINAL_000_004_PROPOSAL_CHECK_NOT_LIVE_DEPLOYMENT_STATUS', databaseTestUse: 'CONFIRMED',
    backupExecution: reference(plan.backupExecutionApproval) ? 'APPROVAL_RECORDED_NOT_EXECUTED_BY_THIS_TOOL' : 'PENDING_SEPARATE_APPROVAL',
    backupEvidence: backupVerified ? 'RECEIPT_CONSISTENT_NOT_INDEPENDENTLY_SQL_VERIFIED' : 'MISSING_OR_INCONSISTENT',
    markerApproval: reference(plan.markerExecutionApproval) ? 'RECORDED' : 'PENDING_SEPARATE_APPROVAL',
    stoppedWriterEvidence: receipt?.writersStoppedConfirmed === true ? 'DECLARED_REQUIRES_DBA_REVERIFY' : 'NOT_CONFIRMED',
    markerExecution: reference(plan.backupExecutionApproval) && reference(plan.markerExecutionApproval) && backupVerified && receipt?.writersStoppedConfirmed === true
      ? 'EVIDENCE_RECORDED_REQUIRES_DBA_REVERIFY' : 'BLOCKED',
    sqlConnected: false, writesExecuted: false, restoreRehearsal: 'NOT_VERIFIED' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [planFile, receiptFile, ...extra] = process.argv.slice(2);
    if (!planFile || extra.length) throw new Error();
    const plan = JSON.parse(await readFile(planFile, 'utf8'));
    const receipt = receiptFile ? JSON.parse(await readFile(receiptFile, 'utf8')) : null;
    process.stdout.write(JSON.stringify(reviewD1(plan, receipt), null, 2) + '\n');
  } catch {
    // Do not echo raw JSON, paths, errors or receipt payloads into logs.
    process.stderr.write('D1_REVIEW_INVALID_INPUT\n'); process.exitCode = 1;
  }
}
