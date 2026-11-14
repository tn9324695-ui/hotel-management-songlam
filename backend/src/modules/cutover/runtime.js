import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { AppError } from '../../shared/errors.js';
import { cutoverOperations, matchOperation, nonBusinessWrite } from './operations.js';

const modes = ['demo', 'frozen', 'api-readonly', 'sql'];
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fail = (code, message) => new AppError(503, code, message);
const proof = value => value?.status === 'PASS' && typeof value?.owner === 'string' && value.owner.trim()
  && typeof value?.evidence === 'string' && value.evidence.trim() && Number.isFinite(Date.parse(value.startedAtUtc))
  && Number.isFinite(Date.parse(value.finishedAtUtc)) && Date.parse(value.finishedAtUtc) >= Date.parse(value.startedAtUtc)
  && value.decision === 'CONTINUE' && typeof value.approvalReference === 'string' && value.approvalReference.trim();
export const releaseGates = Object.freeze(['build', 'access', 'target', 'backup', 'legacyFreeze', 'finalExport', 'import', 'reconciliation', 'roles', 'monitoring', 'goLiveApproval']);

export function loadRelease(file) {
  if (!file) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error();
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch { throw fail('CUTOVER_RELEASE_INVALID', 'Không đọc được hồ sơ cắt chuyển. Không bật ghi.'); }
}
export function createCutoverRuntime({ config, logger = { info() {}, error() {} }, dependencies = null, receiptGateway = null } = {}) {
  const mode = config.cutover?.mode || 'demo';
  if (!modes.includes(mode)) throw fail('CUTOVER_CONFIG_INVALID', 'Chế độ nguồn ghi không hợp lệ.');
  const release = loadRelease(config.cutover?.releaseFile);
  let stopped = false, unknownCount = 0, failedRequests = 0, lastState = null;
  const releaseProblems = () => {
    if (!['sql', 'api-readonly'].includes(mode)) return [];
    const reasons = [];
    if (!release || release.format !== 'songlam-cutover-release/1') return ['RELEASE_NOT_APPROVED'];
    if (release.buildId !== config.cutover.buildId || !config.cutover.buildId) reasons.push('BUILD_NOT_CONFIRMED');
    if (!/^[0-9a-f-]{36}$/i.test(release.deploymentId || '') || !release.approvalReference || !Number.isFinite(Date.parse(release.writesEnabledAtUtc))) reasons.push('DEPLOYMENT_NOT_CONFIRMED');
    if (!config.sql.server || release.target?.server !== config.sql.server || release.target?.database !== config.sql.database
      || !release.target?.fingerprint || release.target.environment !== config.environment || release.target.confirmed !== true) reasons.push('TARGET_NOT_CONFIRMED');
    for (const name of releaseGates) if (!proof(release.gates?.[name])) reasons.push('GATE_' + name.toUpperCase() + '_PENDING');
    if (!Array.isArray(release.acceptedOperations) || release.acceptedOperations.some(id => !cutoverOperations.some(o => o.operation === id))) reasons.push('OPERATIONS_NOT_CONFIRMED');
    else for (const id of release.acceptedOperations) if (!proof(release.operationEvidence?.[id])) reasons.push('OPERATION_ACCEPTANCE_PENDING');
    const g11 = release.g11;
    if (!g11?.reportFile || !isAbsolute(g11.reportFile) || !g11.verificationFile || !isAbsolute(g11.verificationFile)
      || !/^[a-f0-9]{64}$/.test(g11.reportSha256 || '')) reasons.push('G11_REPORT_REQUIRED');
    else try {
      const report = JSON.parse(readFileSync(g11.reportFile, 'utf8'));
      if (hash(report) !== g11.reportSha256 || report.status !== 'PASS' || report.batchId !== g11.batchId
        || report.sourceSha256 !== g11.finalSourceSha256 || !Array.isArray(report.issues) || report.issues.length
        || !Array.isArray(report.moneyDifferences) || report.moneyDifferences.length || !Array.isArray(report.quarantine) || report.quarantine.length) reasons.push('G11_NOT_PASSED');
      const verification = JSON.parse(readFileSync(g11.verificationFile, 'utf8'));
      if (hash(verification) !== g11.verificationSha256 || verification.complete !== true || verification.environment !== release.target.environment
        || verification.databaseFingerprint !== release.target.fingerprint || verification.sourceSha256 !== g11.finalSourceSha256
        || verification.batchId !== g11.batchId || report.targetSha256 !== g11.verificationSha256) reasons.push('G11_TARGET_NOT_BOUND');
    } catch { reasons.push('G11_NOT_VERIFIED'); }
    return reasons;
  };
  const staticProblems = releaseProblems();
  function canLookup() {
    const m = receiptGateway?.manifest;
    return receiptGateway?.approved === true && typeof receiptGateway.lookup === 'function' && m?.approved === true
      && typeof m.approvalReference === 'string' && m.approvalReference.trim() && m.protocol === 'songlam.cutover-receipt.v1'
      && m.environment === config.environment && m.database === config.sql.database && m.actorMode === 'app-user-parameter'
      && m.databaseFingerprint === release?.target?.fingerprint && Boolean(m.databaseFingerprint)
      && ['recheckCurrentRights', 'actorScopedReceipts', 'sourceIntentBound', 'readOnlyLookup'].every(key => m.guarantees?.[key] === true);
  }
  async function status() {
    const blockers = [...staticProblems];
    if (mode === 'sql' && release?.writesEnabledAtUtc && Date.now() < Date.parse(release.writesEnabledAtUtc)) blockers.push('ACTIVATION_TIME_NOT_REACHED');
    let live = null;
    if (['sql', 'api-readonly'].includes(mode)) {
      if (staticProblems.length || !dependencies?.inspect || !canLookup()) blockers.push('APPROVED_RUNTIME_AND_RECEIPT_CONTRACT_REQUIRED');
      else {
        let timer;
        try {
          live = await Promise.race([dependencies.inspect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 3000); })]);
          const fresh = Number.isFinite(Date.parse(live?.verifiedAtUtc)) && Date.now() - Date.parse(live.verifiedAtUtc) >= 0 && Date.now() - Date.parse(live.verifiedAtUtc) <= 15000;
          if (!fresh || live?.deploymentId !== release?.deploymentId || live?.databaseFingerprint !== release?.target?.fingerprint) blockers.push('LIVE_TARGET_NOT_VERIFIED');
          if (live?.baselineTargetSha256 !== release?.g11?.verificationSha256 || live?.activationAtUtc !== release?.writesEnabledAtUtc) blockers.push('LIVE_BASELINE_OR_ACTIVATION_NOT_VERIFIED');
          for (const key of ['sqlConnected', 'authentication', 'durableSessions', 'actorDelegation', 'durableReceipts', 'durableMonitoring', 'reconciliationCurrent', 'noMoneyDifferences', 'noDualWrites', 'noUnknownOutcomes', 'postSwitchWatermarkVerified']) {
            if (live?.[key] !== true) blockers.push('DEPENDENCY_' + key.toUpperCase());
          }
          if (release?.acceptedOperations?.some(id => !live?.verifiedOperations?.includes(id))) blockers.push('ACCEPTED_OPERATION_NOT_VERIFIED');
          if (live?.noMoneyDifferences === false || live?.noDualWrites === false || live?.noUnknownOutcomes === false) stopped = true;
        } catch { blockers.push('SQL_OR_MONITOR_UNAVAILABLE'); }
        finally { clearTimeout(timer); }
      }
    }
    if (stopped) blockers.push('OPERATION_STOP_LATCHED');
    const writable = mode === 'sql' && blockers.length === 0;
    const stateHash = hash({ mode, writable, blockers });
    if (stateHash !== lastState) { lastState = stateHash; logger.info?.({ event: 'cutover.status', mode, writable, blockers, persistence: 'APPLICATION_LOG_REQUIRES_DURABLE_COLLECTOR' }); }
    return { mode, writable, legacyWritable: mode === 'demo', buildId: config.cutover?.buildId || null,
      deploymentId: release?.deploymentId || null, status: writable ? 'WRITE_ENABLED' : 'WRITES_LOCKED', blockers,
      operations: writable ? cutoverOperations.filter(o => release.acceptedOperations.includes(o.operation)) : [],
      counters: { scope: 'PROCESS_ONLY_NOT_AUDIT', failedRequests, unknownCount },
      verifiedAtUtc: live?.verifiedAtUtc || null };
  }
  function observe(req, res, next) {
    res.on('close', () => {
      if (req.cutoverCommand && !res.writableFinished) {
        stopped = true; unknownCount++;
        logger.error?.({ event: 'cutover.response_lost', requestId: req.requestId, operation: req.cutoverCommand, action: 'STOP_WRITES' });
      }
    });
    res.on('finish', () => {
      if (res.statusCode >= 500) failedRequests++;
      if (!req.cutoverCommand) return;
      if (res.statusCode >= 500 || /OUTCOME_UNKNOWN$/.test(res.locals.outcomeCode || '')) {
        stopped = true; unknownCount++;
        logger.error?.({ event: 'cutover.transaction_unknown', requestId: req.requestId, operation: req.cutoverCommand, action: 'STOP_WRITES', persistence: 'PROCESS_LOG_REQUIRES_DURABLE_COLLECTOR' });
      } else if (res.statusCode < 400) logger.info?.({ event: 'cutover.command_response', requestId: req.requestId,
        operation: req.cutoverCommand, deploymentId: release?.deploymentId, persistence: 'APPLICATION_LOG_NOT_COMMIT_RECEIPT' });
    }); next();
  }
  async function guard(req, _res, next) {
    if (nonBusinessWrite(req.method, req.path)) return next();
    try {
      const state = await status();
      const operation = matchOperation(req.method, req.path);
      if (!state.writable || !operation || !state.operations.some(o => o.operation === operation.operation)) throw fail('CUTOVER_WRITE_LOCKED', 'Chức năng chưa được nghiệm thu hoặc nguồn ghi đang khóa. Không ghi sang localStorage.');
      if (Date.now() < Date.parse(release.writesEnabledAtUtc)) throw fail('CUTOVER_WRITE_LOCKED', 'Chưa đến thời điểm mở ghi đã được duyệt.');
      if (req.get('X-PMS-Deployment') !== state.deploymentId) throw fail('DEPLOYMENT_CHANGED', 'Phiên bản nguồn ghi đã thay đổi. Tải lại và đối chiếu yêu cầu cũ trước khi thao tác.');
      if (!/^[A-Za-z0-9._:-]{1,120}$/.test(req.get('Idempotency-Key') || '')) throw new AppError(400, 'IDEMPOTENCY_REQUIRED', 'Cần khóa yêu cầu cố định.');
      req.cutoverCommand = operation.operation;
      next();
    } catch (error) { next(error); }
  }
  return Object.freeze({ mode, status, observe, guard, release, receiptGateway, canLookup,
    publicState: async () => { const { counters, verifiedAtUtc, ...state } = await status(); return state; },
    stop: code => { stopped = true; logger.error?.({ event: 'cutover.stop', code: /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'OPERATOR_STOP_REQUIRED' }); } });
}
