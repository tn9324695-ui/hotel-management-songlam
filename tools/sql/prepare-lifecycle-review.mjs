// Offline packaging only: no driver import, SQL connection, marker or activation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
if (process.argv.slice(2).join(' ') !== '--prepare') throw new Error('PREPARE_ONLY');
const files = ['015-backup.sql.pending', '015-preflight-and-grants.sql.pending', '015-booking-mutation-prepare.sql.pending', '015-booking-mutation-commit.sql.pending', '015-proof-and-receipt.sql.pending'];
const hashes = [];
for (const file of files) {
  const path = 'database/proposals/booking-lifecycle/' + file, contents = await readFile(new URL('../../' + path, import.meta.url));
  hashes.push({ path, sha256: createHash('sha256').update(contents).digest('hex'), bytes: contents.length });
}
const baseline = JSON.parse(await readFile(new URL('./private/booking012/current-deployment.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(await readFile(new URL('./private/lifecycle/metadata.json', import.meta.url), 'utf8'));
if (metadata.source !== 'REAL_SQL_READ_ONLY_METADATA' || metadata.identity.db !== 'SongLamPms_Design' || baseline.definitions.length !== 22) throw new Error('BASELINE_REQUIRED');
const report = { format: 'songlam.lifecycle-015-review.v1', preparedAtUtc: new Date().toISOString(), approved: false, sqlExecuted: false,
  target: { server: '.\\SQLEXPRESS', database: 'SongLamPms_Design', databaseGuid: metadata.identity.guid, environment: 'test' },
  baseDeploymentId: baseline.release.deploymentId, baselineDefinitions: baseline.definitions, metadataInspectedAtUtc: metadata.inspectedAtUtc,
  businessDataCountsAtInspection: metadata.counts, sqlFiles: hashes,
  packageSha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  proposedExecuteGrants: ['pms.usp_AppBookingMutationPrepare', 'pms.usp_AppBookingMutationCommit', 'pms.usp_WebBookingMutationRuntime', 'pms.usp_WebBookingMutationReceipt'],
  serviceUser: 'pms_web_auth_test', scope: 'UNRECEIVED_SAME_TYPE_ASSIGNMENT_AND_ZERO_FINANCE_CANCELLATION',
  proposedOperations: ['bookings.assign', 'bookings.cancel', 'bookings.cancelRooms'], activationRequiresRealSqlReceipt: true,
  financialCancellationEnabled: false, staysEnabled: false, financialWritesEnabled: false, operationalCutover: false };
const output = new URL('../../docs/artifacts/lifecycle-015-review.json', import.meta.url); await mkdir(new URL('./', output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'REVIEW_PREPARED_NOT_EXECUTED', files: hashes.length, packageSha256: report.packageSha256 }));
