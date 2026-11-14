import { sqlId, sqlText, sqlUtc } from '../bookings/dto.js';
import { metrics, definitionsVersion } from './definitions.js';
import { integer, array, pick, reference } from '../management/dto.js';
import { invalidManagementSql } from '../management/model.js';
import { isCalendarDate } from '../catalog/validation.js';
const missingCodes = ['G9_LEDGER_SCOPE_MISSING', 'G9_VERIFICATION_MISSING', 'MISSING_SOURCE_LINKS', 'UNBALANCED_TRANSFERS', 'SETTLEMENT_SCOPE_MISSING', 'G7_ELIGIBILITY_MISSING', 'READ_CONTRACT_PENDING', 'CLOCK_POLICY_PENDING', 'SOURCE_RECONCILIATION_PENDING'];
export function unavailableMetric(key, reasonCode = 'READ_CONTRACT_PENDING') { return { key, title: metrics[key].title, unit: metrics[key].unit, basis: metrics[key].basis, status: 'UNAVAILABLE', value: null, reasonCode, message: 'Chưa có dữ liệu đối soát' }; }
export function metricDto(raw, key) {
  const definition = metrics[key];
  if (!raw || raw.key !== key) throw invalidManagementSql();
  if (raw.status === 'UNAVAILABLE') {
    if (raw.value !== null) throw invalidManagementSql(); return unavailableMetric(key, pick(raw.reasonCode, missingCodes));
  }
  if (raw.status !== 'AVAILABLE' || raw.reconciled !== true || raw.dependency !== definition.dependency) throw invalidManagementSql();
  const value = integer(raw.value, definition.unit === 'VND_SIGNED', definition.unit.startsWith('VND') ? 38 : 19);
  // Missing reconciliation is not the same as an empty (zero) dataset.
  for (const field of ['unlinkedSourceCount', 'unverifiedSuccessCount', 'unbalancedTransferCount', 'unbalancedSettlementCount']) if (raw.proof?.[field] !== '0') throw invalidManagementSql();
  return { key, title: definition.title, unit: definition.unit, basis: definition.basis, status: 'AVAILABLE', value, reasonCode: null, message: null };
}
export function periodDto(raw, input, clock) {
  if (!raw || raw.from !== input.from || raw.to !== input.to || raw.timeZone !== input.timeZone || raw.timeZone !== clock.timeZone || raw.currentBusinessDate !== clock.businessDate || raw.interval !== '[from,to)' || raw.dateBasis !== 'SQL_BUSINESS_DATE') throw invalidManagementSql();
  return { from: input.from, to: input.to, timeZone: clock.timeZone, interval: '[from,to)', dateBasis: 'SQL_BUSINESS_DATE', currentBusinessDate: clock.businessDate };
}
export function reportFrame(raw, input, clock, keys) {
  if (!raw || raw.definitionsVersion !== definitionsVersion || raw.snapshotConsistent !== true) throw invalidManagementSql();
  const period = periodDto(raw.period, input, clock), source = array(raw.metrics, keys.length);
  if (source.length !== keys.length || new Set(source.map(row => row.key)).size !== source.length || source.some(row => !keys.includes(row.key))) throw invalidManagementSql();
  const result = { definitionsVersion, period, asOfUtc: sqlUtc(raw.asOfUtc), reportReference: reference(raw.reportReference), metrics: keys.map(key => metricDto(source.find(row => row.key === key), key)) };
  const byKey = Object.fromEntries(result.metrics.map(row => [row.key, row]));
  if (['receiptsVnd', 'refundsVnd', 'netReceiptsVnd'].every(key => byKey[key]?.status === 'AVAILABLE') && BigInt(byKey.netReceiptsVnd.value) !== BigInt(byKey.receiptsVnd.value) - BigInt(byKey.refundsVnd.value)) throw invalidManagementSql();
  return result;
}
export function dailyRows(raw, input, metricKeys) {
  return array(raw, input.limit).map(row => {
    if (!isCalendarDate(row.businessDate) || row.businessDate < input.from || row.businessDate >= input.to || !Array.isArray(row.metrics) || row.metrics.length !== metricKeys.length || new Set(row.metrics.map(item => item.key)).size !== row.metrics.length) throw invalidManagementSql();
    const values = {};
    for (const key of metricKeys) values[key] = metricDto(row.metrics?.find(item => item.key === key), key);
    if (['receiptsVnd', 'refundsVnd', 'netReceiptsVnd'].every(key => values[key]?.status === 'AVAILABLE') && BigInt(values.netReceiptsVnd.value) !== BigInt(values.receiptsVnd.value) - BigInt(values.refundsVnd.value)) throw invalidManagementSql();
    return { businessDate: row.businessDate, metrics: metricKeys.map(key => values[key]) };
  });
}
export function debtRow(raw, input) {
  const balanceVnd = integer(raw.balanceVnd, true), dueVnd = integer(raw.dueVnd), creditVnd = integer(raw.creditVnd), n = BigInt(balanceVnd);
  if (BigInt(dueVnd) !== (n > 0n ? n : 0n) || BigInt(creditVnd) !== (n < 0n ? -n : 0n)) throw invalidManagementSql();
  const result = { folioId: sqlId(raw.folioId), folioCode: sqlText(raw.folioCode, 40), bookingId: sqlId(raw.bookingId), kind: pick(raw.kind, ['ROOM', 'MASTER', 'INCIDENTAL']), status: pick(raw.status, ['OPEN', 'CLOSED']), balanceVnd, dueVnd, creditVnd };
  if (result.status === 'CLOSED' && balanceVnd !== '0' || input.bookingId && input.bookingId !== result.bookingId || input.folioKind && input.folioKind !== result.kind) throw invalidManagementSql();
  return result;
}
