import { requireManagementPermission, managementError, invalidManagementSql } from '../management/model.js';
import { readManagementClock } from '../management/service.js';
import { pageDto, managementClock } from '../management/dto.js';
import { metrics, reportMetrics, allowedMetricKeys, definitionsVersion } from './definitions.js';
import { unavailableMetric, reportFrame, dailyRows, debtRow } from './dto.js';
export function createReportsService({ gateway }) {
  const definitions = (actor, report) => allowedMetricKeys(actor, report).map(key => { const { permissions, ...definition } = metrics[key]; return { key, ...definition }; });
  return Object.freeze({
    capabilities(actor) {
      return { definitionsVersion, maxLimit: gateway.limits.maxLimit, maxRangeDays: gateway.limits.maxRangeDays,
        reports: Object.fromEntries(Object.keys(reportMetrics).map(report => { let visible = false; try { requireManagementPermission(actor, 'reports', report); visible = true; } catch {}
          return [report, { visible, supported: visible && gateway.supports('reports', report), metrics: visible ? allowedMetricKeys(actor, report).map(key => ({ key, supported: gateway.supportsMetric(key) })) : [] }]; })) };
    },
    definitions(actor, report) { requireManagementPermission(actor, 'reports', report); return { version: definitionsVersion, metrics: definitions(actor, report) }; },
    context: (actor, requestId) => readManagementClock(gateway, actor, requestId),
    async read(actor, report, input, requestId) {
      requireManagementPermission(actor, 'reports', report);
      const clock = await readManagementClock(gateway, actor, requestId);
      if (clock.timeZone !== input.timeZone) throw managementError('REPORT_TIME_ZONE_CONFLICT', 'Múi giờ bộ lọc không khớp múi giờ khách sạn từ SQL.', 409);
      const keys = allowedMetricKeys(actor, report), supported = keys.filter(key => gateway.supportsMetric(key));
      const period = { from: input.from, to: input.to, timeZone: clock.timeZone, interval: '[from,to)', dateBasis: 'SQL_BUSINESS_DATE', currentBusinessDate: clock.businessDate };
      if (!gateway.supports('reports', report) || !supported.length) return { data: { status: 'UNAVAILABLE', definitionsVersion, period, asOfUtc: clock.asOfUtc,
        reportReference: null, metrics: keys.map(key => unavailableMetric(key)), rows: null, snapshotBasis: report === 'receivables' ? 'CURRENT_NOT_HISTORICAL' : 'PER_DEFINITION' }, meta: { total: null, hasMore: null } };
      const raw = await gateway.read(actor, 'reports', report, { ...input, metricKeys: supported, clockReference: { businessDate: clock.businessDate, policyReference: clock.policyReference } }, requestId);
      if (raw.resource !== 'reports' || raw.operation !== report) throw invalidManagementSql();
      const frame = reportFrame(raw, input, clock, supported), map = new Map(frame.metrics.map(item => [item.key, item]));
      frame.metrics = keys.map(key => map.get(key) || unavailableMetric(key));
      const result = { ...frame, status: frame.metrics.every(item => item.status === 'AVAILABLE') ? 'AVAILABLE' : frame.metrics.every(item => item.status === 'UNAVAILABLE') ? 'UNAVAILABLE' : 'PARTIAL', rows: null, snapshotBasis: report === 'receivables' ? 'CURRENT_NOT_HISTORICAL' : 'PER_DEFINITION' };
      if (report === 'dashboard') return { data: result, meta: { total: null, hasMore: null } };
      if (raw.rows === null) {
        if (!frame.metrics.some(item => item.status === 'UNAVAILABLE')) throw invalidManagementSql();
        return { data: result, meta: { total: null, hasMore: null } };
      }
      if (!Array.isArray(raw.rows) || raw.rows.length > input.limit) throw invalidManagementSql();
      result.rows = report === 'receivables' ? raw.rows.map(row => debtRow(row, input)) : dailyRows(raw.rows, input, supported);
      const identities = result.rows.map(row => report === 'receivables' ? row.folioId : row.businessDate); if (new Set(identities).size !== identities.length) throw invalidManagementSql();
      if (input.offset === 0 && raw.page?.hasMore === false && (raw.page?.total === null || raw.page?.total === String(result.rows.length))) {
        for (const metric of frame.metrics.filter(item => item.status === 'AVAILABLE')) {
          let actual;
          if (report === 'receivables') actual = result.rows.reduce((sum, row) => sum + BigInt(metric.key === 'receivableVnd' ? row.dueVnd : row.creditVnd), 0n);
          else {
            const cells = result.rows.map(row => row.metrics.find(item => item.key === metric.key));
            if (cells.some(cell => cell?.status !== 'AVAILABLE')) throw invalidManagementSql();
            actual = cells.reduce((sum, cell) => sum + BigInt(cell.value), 0n);
          }
          if (actual !== BigInt(metric.value)) throw invalidManagementSql();
        }
      }
      return { data: result, meta: pageDto(raw.page, result.rows.length, input) };
    }
  });
}
