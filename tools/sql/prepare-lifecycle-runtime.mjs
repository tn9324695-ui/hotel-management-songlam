// No SQL and no inferred approval. Accept ONLY a separately applied 015 receipt.
// Live startup independently verifies the database receipt and module hashes.
import { readFile, writeFile } from 'node:fs/promises';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--prepare' || !args[1].startsWith('--approval=')) throw new Error('EXPLICIT_APPROVAL_REQUIRED');
const approval = args[1].slice('--approval='.length), dir = new URL('./private/', import.meta.url);
const receipt = JSON.parse(await readFile(new URL('lifecycle/deployment-015.json', dir), 'utf8'));
const review = JSON.parse(await readFile(new URL('../../docs/artifacts/lifecycle-015-review.json', import.meta.url), 'utf8'));
if (!approval || receipt.approvalReference !== approval || approval === 'USER-20261112-REAL-PRICING-CUSTOMER-BOOKING'
  || receipt.status !== 'SQL_015_COMMITTED' || receipt.target?.server !== '.\\SQLEXPRESS' || receipt.target?.database !== 'SongLamPms_Design'
  || receipt.target?.databaseGuid !== review.target.databaseGuid || receipt.packageSha256 !== review.packageSha256
  || receipt.backupVerifyOnlyPassed !== true || !/^[a-f0-9-]{36}$/i.test(receipt.backupSetUuid || '') || receipt.definitions?.length !== 4
  || receipt.baseDeploymentId !== review.baseDeploymentId || receipt.operationalCutover !== false) throw new Error('ACTUAL_APPROVED_015_RECEIPT_REQUIRED');
const manifest = JSON.parse(await readFile(new URL('booking012/manifest.json', dir), 'utf8'));
const release = JSON.parse(await readFile(new URL('booking012/booking-test-release.json', dir), 'utf8'));
const mutation = { approved: true, protocol: 'songlam.booking-mutations.v1', database: 'SongLamPms_Design', environment: 'test',
  approvalReference: approval, packageSha256: receipt.packageSha256, backupSetUuid: receipt.backupSetUuid, baseDeploymentId: receipt.baseDeploymentId, definitions: receipt.definitions };
manifest.bookingTest.mutations = mutation;
const booking = manifest.contracts.bookingsGateway;
booking.operations = [...new Set([...booking.operations, 'assign', 'cancel', 'cancel-rooms'])];
booking.operationProcedures = Object.fromEntries(['assign', 'cancel', 'cancel-rooms'].map(operation => [operation, { prepare: 'pms.usp_AppBookingMutationPrepare', commit: 'pms.usp_AppBookingMutationCommit' }]));
booking.guarantees.partialCancelPreservesReceivedDeposits = true;
booking.guarantees.cancellationAccounting = 'ATOMIC_PENDING_OBLIGATIONS_NO_CASH';
release.allowedOperations = [...new Set([...release.allowedOperations, ...review.proposedOperations])];
release.mutations = { approvalReference: approval, packageSha256: receipt.packageSha256, backupSetUuid: receipt.backupSetUuid };
// These are private prepared files only. Nothing is copied to staging or started.
await writeFile(new URL('lifecycle/manifest.prepared.json', dir), JSON.stringify(manifest, null, 2));
await writeFile(new URL('lifecycle/release.prepared.json', dir), JSON.stringify(release, null, 2));
console.log(JSON.stringify({ status: 'LIFECYCLE_PROFILE_PREPARED_NOT_ACTIVATED', operations: review.proposedOperations, operationalCutover: false }));
