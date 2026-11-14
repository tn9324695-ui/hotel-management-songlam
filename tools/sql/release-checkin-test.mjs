// Test-only G6 switch. SQL objects and business date must already be verified.
// This does not deploy SQL or enable operational cutover.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (process.argv.slice(2).join(' ') !== '--release=USER-20261114-G6-G7') throw Error('EXPLICIT_G6_RELEASE_REQUIRED');
const root = new URL('../../', import.meta.url);
const lifecycle = new URL('tools/sql/private/lifecycle/', root);
const booking = new URL('tools/sql/private/booking012/', root);
const read = async url => JSON.parse((await readFile(url, 'utf8')).replace(/^\uFEFF/, ''));
const [receipt, verification, release, manifest] = await Promise.all([
  read(new URL('deployment-016.json', lifecycle)), read(new URL('verification-016.json', lifecycle)),
  read(new URL('booking-test-release.json', booking)), read(new URL('manifest.json', booking))
]);
assert.equal(receipt.status, 'SQL_016_COMMITTED');
assert.equal(receipt.operationalCutover, false);
assert.equal(receipt.target.databaseGuid, 'C4DD399E-5661-4741-A424-5ABFEEFBC1AC');
assert.equal(verification.status, 'PASS');
assert.equal(verification.checkInDateReady, true);
assert.equal(verification.clock.WorkingDate, verification.clock.ActualHotelDate);
assert.equal(verification.clock.BusinessDayStatus, 'OPEN');
assert.ok(Date.now() - Date.parse(verification.inspectedAtUtc) < 15 * 60_000, 'LIVE_SQL_VERIFICATION_STALE');
assert.equal(manifest.bookingTest.checkIn.packageSha256, receipt.packageSha256);
assert.equal(release.checkIn.packageSha256, receipt.packageSha256);
assert.equal(release.target.database, 'SongLamPms_Design');
assert.equal(release.target.environment, 'test');
assert.equal(release.operationalCutover, false);
assert.ok(release.allowedOperations.every(op => typeof op === 'string'));
if (release.checkIn.writesEnabled === true) {
  assert.equal(release.checkIn.releaseReference, 'USER-20261114-G6-G7');
  assert.equal(release.allowedOperations.filter(op => op === 'stays.checkIn').length, 1);
  console.log(JSON.stringify({ status: 'G6_TEST_RELEASE_ALREADY_PREPARED', operations: release.allowedOperations.length, testOnly: true, operationalCutover: false }));
  process.exit(0);
}
assert.ok(release.allowedOperations.every(op => op !== 'stays.checkIn'));
release.checkIn.writesEnabled = true;
release.checkIn.writeBlocker = null;
release.checkIn.releaseReference = 'USER-20261114-G6-G7';
release.allowedOperations.push('stays.checkIn');
await writeFile(new URL('booking-test-release.json', booking), JSON.stringify(release, null, 2));
console.log(JSON.stringify({ status: 'G6_TEST_RELEASE_PREPARED', operations: release.allowedOperations.length, testOnly: true, operationalCutover: false }));
