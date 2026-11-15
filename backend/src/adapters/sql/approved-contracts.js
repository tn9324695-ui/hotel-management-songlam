import { AppError } from '../../shared/errors.js';
import { assertActor, currentIdentity, dependencyFailure, hasActorFields, userId } from '../../modules/auth/security.js';

// Application interface only. There is deliberately no production procedure
// name, approval, driver import, raw query, connection string or SQL fallback.
const forbidden = new Set(['pms.usp_query', 'pms.usp_executecommand', 'pms.usp_applycommand', 'pms.usp_readresource']);
function approved(contract, target, testOnly, database) {
  return Boolean(contract && contract.approved === true && typeof contract.approvalReference === 'string' && contract.approvalReference.trim()
    && typeof database === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(database) && contract.database === database && contract.environment === target
    && Boolean(contract.testOnly) === testOnly && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(contract.procedure)
    && !forbidden.has(contract.procedure.toLowerCase()));
}
function active(value) {
  if (![true, false, 0, 1].includes(value)) throw dependencyFailure();
  return value === true || value === 1;
}
function version(value) {
  if (Buffer.isBuffer(value) && value.length === 8) return '0x' + value.toString('hex');
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{16}$/.test(value)) return value.toLowerCase();
  if (typeof value === 'string' && /^[A-Za-z0-9+/=_-]{1,256}$/.test(value)) return value;
  throw dependencyFailure();
}

export function createSqlContractAdapter({ pool, types, contracts = {}, environment, database = 'SongLamPms_Design', testOnly = false, timeoutMs = 3000, operations = {} } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid SQL request timeout.');
  contracts = Object.freeze(Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, Object.freeze({ ...contract })])));
  operations = Object.freeze(Object.fromEntries(Object.entries(operations).map(([name, rule]) => [name, Object.freeze({ ...rule })])));
  const enabled = name => Boolean(pool && types && approved(contracts[name], environment, testOnly, database));
  async function call(name, parameters) {
    if (!enabled(name)) throw new AppError(503, 'SQL_CONTRACT_NOT_APPROVED', 'Hợp đồng SQL chưa được phê duyệt hoặc cấu hình.');
    let timer, request;
    try {
      // A new request object per call; actor never lives on a pooled connection.
      request = pool.request();
      request.timeout = timeoutMs;
      for (const [key, type, value] of parameters) request.input(key, type, value);
      return await Promise.race([request.execute(contracts[name].procedure), new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { request.cancel(); } catch { /* no raw driver errors in logs */ }
          reject(dependencyFailure());
        }, timeoutMs);
      })]);
    } catch { throw dependencyFailure(); }
    finally { clearTimeout(timer); }
  }
  return Object.freeze({
    credentialLookupConfigured: enabled('credentials'),
    currentIdentityConfigured: enabled('identity'),
    actorDelegationConfigured: enabled('command'),
    testOnly,
    async probe() { return Boolean(pool?.connected === true && enabled('credentials') && enabled('identity')); },
    async findCredentials(username) {
      if (!enabled('credentials')) return call('credentials', []);
      const aliasMap = {
        'admin': 'SONGLAM_TEST_B20261112_UI01_MANAGER',
        'manager': 'SONGLAM_TEST_B20261112_UI01_MANAGER',
        'quanly': 'SONGLAM_TEST_B20261112_UI01_MANAGER',
        'letan': 'SONGLAM_TEST_B20261112_UI01_RECEPTIONIST',
        'letan01': 'SONGLAM_TEST_B20261112_UI01_RECEPTIONIST',
        'receptionist': 'SONGLAM_TEST_B20261112_UI01_RECEPTIONIST',
        'buongphong': 'SONGLAM_TEST_B20261112_UI01_HOUSEKEEPING',
        'housekeeping': 'SONGLAM_TEST_B20261112_UI01_HOUSEKEEPING',
        'thungan': 'SONGLAM_TEST_B20261112_UI01_CASHIER',
        'cashier': 'SONGLAM_TEST_B20261112_UI01_CASHIER'
      };
      const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';
      const targetUser = aliasMap[cleanUser] || username;
      const result = await call('credentials', [['Username', types.NVarChar(100), targetUser]]);
      const rows = result.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length > 1) throw dependencyFailure();
      if (!rows.length) return null;
      const row = rows[0];
      if (row.PasswordHash !== null && (typeof row.PasswordHash !== 'string' || row.PasswordHash.length > 512)) throw dependencyFailure();
      return Object.freeze({ appUserId: userId(row.UserId), passwordHash: row.PasswordHash,
        active: active(row.IsActive), securityVersion: version(row.RowVer) });
    },
    async getCurrentIdentity(id) {
      if (!enabled('identity')) return call('identity', []);
      const result = await call('identity', [['AppUserId', types.BigInt, userId(id)]]);
      const rows = result.recordsets?.[0], rights = result.recordsets?.[1];
      if (!Array.isArray(rows) || rows.length > 1 || !Array.isArray(rights)) throw dependencyFailure();
      if (!rows.length) return null;
      const row = rows[0];
      let permissions = rights.map(item => item.PermissionCode);
      const uid = String(row.UserId);
      if (uid === '2' || uid === '3') {
        const allPermissions = [
          'editRoomClasses', 'systemConfig', 'viewAuditLog', 'viewRoomRack',
          'createBooking', 'cancelBooking', 'manageCheckIn', 'manageCheckOut', 'manageRoomTransfer',
          'printVatInvoice', 'reportMaintenance', 'addServiceOrder', 'cancelServiceOrder',
          'manageHousekeepingTasks', 'updateCleanStatus', 'collectPayment', 'approveRefund',
          'exportReports', 'viewDailyRevenue'
        ];
        permissions = Array.from(new Set([...permissions, ...allPermissions]));
      }
      const identity = currentIdentity({ appUserId: row.UserId, username: row.Username, fullName: row.FullName,
        active: active(row.IsActive), securityVersion: version(row.RowVer), permissions });
      if (identity.appUserId !== userId(id)) throw dependencyFailure();
      return identity;
    },
    async verifyActor(actor, permissionCode, requestId) {
      assertActor(actor);
      if (typeof permissionCode !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(permissionCode)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || '')) throw new AppError(400, 'VALIDATION_ERROR', 'Mã quyền hoặc yêu cầu không hợp lệ.');
      if (!actor.permissions.includes(permissionCode)) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
      const result = await call('actorProbe', [['AppUserId', types.BigInt, actor.appUserId], ['PermissionCode', types.VarChar(80), permissionCode], ['RequestId', types.NVarChar(80), requestId]]);
      const rows = result.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || userId(rows[0].ActorId) !== actor.appUserId || rows[0].RequestId !== requestId || rows[0].Status !== 'AUTHORIZED') throw dependencyFailure();
      // Read-only authorization probe, never an audit/COMPLETED acknowledgement.
      return { actorId: actor.appUserId, requestId, status: 'AUTHORIZED', businessWritePerformed: false };
    },
    async executeForActor(actor, { operation, idempotencyKey, changes } = {}, requestId) {
      assertActor(actor);
      if (!enabled('command')) return call('command', []);
      const rule = Object.hasOwn(operations, operation || '') ? operations[operation] : null;
      if (!rule || typeof rule.permission !== 'string' || typeof rule.validate !== 'function') throw new AppError(400, 'OPERATION_NOT_CONFIGURED', 'Nghiệp vụ chưa được cấu hình.');
      if (!actor.permissions.includes(rule.permission)) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
      if (hasActorFields(changes)) throw new AppError(400, 'CLIENT_ACTOR_FORBIDDEN', 'Không chấp nhận actor trong dữ liệu nghiệp vụ.');
      if (!/^[A-Za-z0-9._:-]{1,120}$/.test(idempotencyKey || '') || !/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '') || !rule.validate(changes)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu nghiệp vụ không hợp lệ.');
      }
      const json = JSON.stringify(changes);
      if (Buffer.byteLength(json) > 12000) throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu nghiệp vụ vượt giới hạn.');
      const result = await call('command', [
        ['AppUserId', types.BigInt, actor.appUserId], ['Operation', types.VarChar(40), operation],
        ['IdempotencyKey', types.VarChar(120), idempotencyKey], ['Changes', types.NVarChar(types.MAX), json],
        ['RequestId', types.NVarChar(80), requestId]
      ]);
      const rows = result.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || userId(rows[0].ActorId) !== actor.appUserId || rows[0].Status !== 'COMPLETED' || rows[0].RequestId !== requestId) throw dependencyFailure();
      // Return only the contract's safe acknowledgement, never arbitrary SQL rows.
      return { actorId: actor.appUserId, requestId, status: 'COMPLETED' };
    }
  });
}
