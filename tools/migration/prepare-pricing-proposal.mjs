// Produces a review artifact only. No SQL driver/import, API activation or seed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isAbsolute, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const sourceHash = '2e1e523b3c0463e07a744a78b68fe9ec1c7d3dc05bacb7bb974b95f19daade5d';
const codes = ['SUP-K', 'DLX-T', 'PRE-K', 'PRE-T', 'JRS', 'CLS', 'EXS', 'GRS', 'RYS', 'PRS'];
export function pricingProposal(review, workbookBytes) {
  if (createHash('sha256').update(workbookBytes).digest('hex') !== sourceHash || review.sourceSha256 !== sourceHash || review.projectUseApproved !== true) throw new Error('APPROVED_SOURCE_REQUIRED');
  if (!Array.isArray(review.prices) || review.prices.length !== 10 || new Set(review.prices.map(row => row.code)).size !== 10) throw new Error('RATE_SOURCE_INVALID');
  const rates = review.prices.map(row => {
    if (!codes.includes(row.code) || !/^[1-9]\d{0,18}$/.test(row.nightlyVnd || '') || !/^[1-9]\d{0,18}$/.test(row.hourlySixHourVnd || '')
      || row.validFrom !== '2026-11-01' || row.validThrough !== '2027-12-31') throw new Error('RATE_SOURCE_REQUIRES_REVIEW');
    return { roomTypeCode: row.code, nightlyVnd: row.nightlyVnd, hourlySixHourVnd: row.hourlySixHourVnd,
      validFrom: row.validFrom, validToExclusive: '2028-01-01', sourceValidThroughInclusive: row.validThrough, currency: 'VND' };
  }).sort((a, b) => codes.indexOf(a.roomTypeCode) - codes.indexOf(b.roomTypeCode));
  return { kind: 'PRICING_SOURCE_REVIEW_NOT_A_SQL_SEED', sqlExecutionApproved: false, writesEnabled: false,
    source: { sha256: sourceHash, projectUseApproved: true, declaredClassification: review.sourceDeclaredClassification, independentlyVerifiedHotelData: false },
    target: { server: '.\\SQLEXPRESS', database: 'SongLamPms_Design', environment: 'test' },
    businessDate: '2026-10-11', timeZone: 'Asia/Ho_Chi_Minh', rates,
    excluded: ['DLX-TR', '501', '902', '1303', '1704', '2105'],
    blockers: ['NO_PRICE_2026_10_11_THROUGH_2026_10_31', 'PRICING_POLICY_AND_CALENDAR_APPROVAL_REQUIRED', 'EXTRA_GUEST_AGE_AND_BED_POLICY_CONTRACT_REQUIRED',
      'SAME_DAY_OVER_SIX_HOURS_NIGHTLY_TRANSITION_CONTRACT_REQUIRED', 'CUSTOMER_RPC_REQUIRED', 'ATOMIC_BOOKING_RECEIPT_AND_ACTOR_CONTRACT_REQUIRED'],
    policyExtensionsImplementedButNotActivated: { lateDepartureInterval: 'LEFT_CLOSED_RIGHT_OPEN', hourlyMaximumMinutes: 360 },
    bookingAcceptance: { requiredRoomField: 'acceptedQuoteHash', from: 'G4 acceptanceHash', onChange: '409 BOOKING_QUOTE_CHANGED', pricesFromBrowserAccepted: false } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args.some(path => !isAbsolute(path))) throw new Error('ABSOLUTE_REVIEW_WORKBOOK_OUTPUT_PATHS_REQUIRED');
  const [reviewPath, workbookPath, outputPath] = args;
  const [text, bytes] = await Promise.all([readFile(reviewPath, 'utf8'), readFile(workbookPath)]);
  const result = pricingProposal(JSON.parse(text.replace(/^\uFEFF/, '')), bytes);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'PRICING_PROPOSAL_PREPARED_NO_SQL', rates: result.rates.length, sqlExecutionApproved: false }));
}
