import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
export const bookingMutationOperations = Object.freeze(['bookings.assign', 'bookings.cancel', 'bookings.cancelRooms']);
const names = Object.freeze(['usp_AppBookingMutationPrepare', 'usp_AppBookingMutationCommit', 'usp_WebBookingMutationRuntime', 'usp_WebBookingMutationReceipt']);
const bookingSpec = Object.freeze({ names, operations: bookingMutationOperations, protocol: 'songlam.booking-mutations.v1', runtime: 'pms.usp_WebBookingMutationRuntime', receipt: 'pms.usp_WebBookingMutationReceipt',
  code: 'BOOKING_MUTATION_CONTRACT_PENDING', message: 'Chưa xác minh hợp đồng SQL đổi/hủy phần phòng chưa nhận.', rights: operation => operation === 'bookings.assign' ? ['createBooking', 'viewRoomRack'] : ['cancelBooking'] });
const checkInSpec = Object.freeze({ names: Object.freeze(['fn_WebStay016Json','usp_WebCheckInContext','usp_AppStayArrivals','usp_AppCheckInPrepare','usp_AppCheckInCommit','usp_AppStayRead016','usp_WebCheckInRuntime','usp_WebCheckInReceipt']),
  operations: Object.freeze(['stays.checkIn']), protocol: 'songlam.check-in.v1', runtime: 'pms.usp_WebCheckInRuntime', receipt: 'pms.usp_WebCheckInReceipt',
  code: 'CHECK_IN_CONTRACT_PENDING', message: 'Chưa xác minh hợp đồng SQL nhận phòng 016.', rights: () => ['manageCheckIn'] });
// Optional proof. A release file alone cannot activate mutations: verify the
// actual SQL deployment receipt AND all four live module definition hashes.
export const createBookingMutationExtension = options => createVerifiedExtension(options, bookingSpec);
export const createCheckInExtension = options => createVerifiedExtension(options, checkInSpec);
function createVerifiedExtension({ pool, types, manifest, baseDeploymentId }, spec) {
  const names = spec.names, unavailable = () => new AppError(503, spec.code, spec.message);
  const m = structuredClone(manifest || {});
  const configured = Boolean(manifest && m.approved === true && m.protocol === spec.protocol
    && typeof m.approvalReference === 'string' && m.approvalReference.trim()
    && m.database === 'SongLamPms_Design' && m.environment === 'test' && m.baseDeploymentId === baseDeploymentId
    && (spec !== checkInSpec || typeof m.policy?.id === 'string' && m.policy.id.length > 0 && /^[a-f0-9]{64}$/.test(m.policy?.hash || '') && /^[1-9]\d{0,18}$/.test(m.sourcePolicyVersionId || ''))
    && /^[a-f0-9]{64}$/.test(m.packageSha256 || '') && /^[a-f0-9-]{36}$/i.test(m.backupSetUuid || '')
    && Array.isArray(m.definitions) && m.definitions.length === names.length
    && names.every(name => m.definitions.filter(d => d.Name === name && /^[a-f0-9]{64}$/i.test(d.DefinitionSha256 || '')).length === 1));
  async function execute(procedure, parameters = []) {
    if (!configured || !pool?.connected) throw unavailable();
    const request = pool.request(); request.timeout = 5000;
    for (const [key, type, value] of parameters) request.input(key, type, value);
    try { return await request.execute(procedure); }
    catch (error) {
      if ([229, 52403].includes(error.number ?? error.originalError?.info?.number)) throw new AppError(403, 'FORBIDDEN', 'SQL từ chối quyền tra cứu thao tác.');
      throw unavailable();
    }
  }
  return Object.freeze({ configured, operations: configured ? spec.operations : Object.freeze([]),
    async inspect() {
      const result = await execute(spec.runtime);
      let receipt; try { receipt = JSON.parse(result.recordsets[0][0].ReleaseJson); } catch { throw unavailable(); }
      const definitions = result.recordsets?.[1];
      if (spec === checkInSpec && (receipt.policy?.id !== m.policy.id || receipt.policy?.hash !== m.policy.hash || receipt.sourcePolicyVersionId !== m.sourcePolicyVersionId)) throw unavailable();
      if (receipt.baseDeploymentId !== baseDeploymentId || receipt.approvalReference !== m.approvalReference || receipt.packageSha256 !== m.packageSha256
        || receipt.backupSetUuid !== m.backupSetUuid || receipt.operationalCutover !== false
        || !Array.isArray(definitions) || definitions.length !== names.length || m.definitions.some(d => !definitions.some(actual => actual.Name === d.Name
          && actual.DefinitionSha256 === d.DefinitionSha256 && Boolean(actual.AnsiNullsOn) && Boolean(actual.QuotedIdentifierOn)))) throw unavailable();
      return { verified: true, packageSha256: m.packageSha256 };
    },
    async lookup(actor, input, requestId) {
      assertActor(actor);
      const rights = spec.rights(input.operation);
      if (!spec.operations.includes(input.operation) || !rights.every(right => actor.permissions.includes(right))) throw new AppError(403, 'FORBIDDEN', 'Không có quyền tra cứu thao tác.');
      const result = await execute(spec.receipt, [['AppUserId', types.BigInt, actor.appUserId], ['Operation', types.VarChar(80), input.operation],
        ['IdempotencyKey', types.VarChar(120), input.idempotencyKey], ['OriginalRequestId', types.NVarChar(80), input.originalRequestId], ['RequestId', types.NVarChar(80), requestId]]);
      const rows = result?.recordsets?.[0];
      if (rows?.length !== 1 || typeof rows[0].PayloadJson !== 'string' || rows[0].PayloadJson.length > 8192) throw unavailable();
      try { return JSON.parse(rows[0].PayloadJson); } catch { throw unavailable(); }
    }
  });
}
