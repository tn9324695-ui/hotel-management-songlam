// Test-only dependencies. Never imported by src/server.js; no real SQL or user data.
import { pbkdf2Sync, scryptSync } from 'node:crypto';
import { createSqlContractAdapter } from '../../src/adapters/sql/approved-contracts.js';
import { createAuthRuntime } from '../../src/modules/auth/runtime.js';
import { createPasswordVerifier } from '../../src/modules/auth/password-verifier.js';
import { createSessionManager } from '../../src/modules/auth/sessions.js';
import { rejectClientActor, requireOrigin } from '../../src/modules/auth/security.js';
import { testConfig, startTestServer } from '../helpers.js';

export const fixturePassword = 'fixture-only-password';
const salt = Buffer.alloc(16, 0x41);
export const fixtureHashes = {
  pbkdf2: `$pbkdf2-sha256-v1$210000$${salt.toString('base64url')}$${pbkdf2Sync(fixturePassword, salt, 210000, 32, 'sha256').toString('base64url')}`,
  scrypt: `$scrypt-v1$16384$8$1$${salt.toString('base64url')}$${scryptSync(fixturePassword, salt, 32).toString('base64url')}`
};
export const fixtureTypes = { BigInt: 'BigInt', MAX: 'MAX', NVarChar: length => `NVarChar(${length})`, VarChar: length => `VarChar(${length})` };
export const fixtureContracts = Object.fromEntries(['credentials', 'identity', 'command'].map(name => [name, {
  approved: true, testOnly: true, approvalReference: 'fixture-only:NOT-a-production-approval',
  database: 'SongLamPms_Design', environment: 'test', procedure: 'pms.fixture_' + name
}]));

export async function authFixture(t, { https = false, ttlMs = 60000, logger, publicOrigin, listenPort = 0 } = {}) {
  const config = testConfig({ ...(https ? { PUBLIC_ORIGIN: 'https://pms.example.test' } : {}), ...(publicOrigin ? { PUBLIC_ORIGIN: publicOrigin } : {}) });
  const state = { now: 1000000, credentialError: false, identityError: false, sessionError: false, commandError: false,
    delay: 0, commandDelay: 0, createError: false, destroyError: false, getError: false, calls: [], audit: [], cancelled: 0, requests: new Set(), physicalConnections: new Set() };
  const people = new Map([
    ['9007199254740993', { UserId: '9007199254740993', Username: 'nhanvien_a', FullName: 'Nhân viên A', PasswordHash: fixtureHashes.pbkdf2, IsActive: true, RowVer: 'version1', permissions: ['fixture.write', 'viewRooms'] }],
    ['2', { UserId: '2', Username: 'nhanvien_b', FullName: 'Nhân viên B', PasswordHash: fixtureHashes.scrypt, IsActive: true, RowVer: 'version1', permissions: ['fixture.write'] }],
    ['3', { UserId: '3', Username: 'locked', FullName: 'Đã khóa', PasswordHash: fixtureHashes.pbkdf2, IsActive: false, RowVer: 'version1', permissions: [] }]
  ]);
  let queue = Promise.resolve();
  // Simulates ONE reused physical SQL connection, with separate driver requests.
  const pool = { connected: true, request() {
    const parameters = {}, parameterTypes = {}; let cancelled = false;
    const request = {
      input(name, type, value) { parameters[name] = value; parameterTypes[name] = type; return this; },
      cancel() { cancelled = true; state.cancelled++; },
      execute(procedure) {
        state.requests.add(request);
        state.calls.push({ procedure, parameters: { ...parameters }, parameterTypes });
        const pending = queue.then(async () => {
          state.physicalConnections.add('fixture-physical-connection-1');
          const delay = state.delay || (procedure === fixtureContracts.command.procedure ? state.commandDelay : 0);
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          if (cancelled) throw new Error('fixture cancelled with secret=do-not-log');
          if (procedure === fixtureContracts.credentials.procedure) {
            if (state.credentialError) throw new Error('SQL password=do-not-log');
            const found = [...people.values()].filter(person => person.Username === parameters.Username);
            return { recordsets: [found.map(person => ({ ...person }))] };
          }
          const person = people.get(parameters.AppUserId);
          if (procedure === fixtureContracts.identity.procedure) {
            if (state.identityError) throw new Error('SQL hash=do-not-log');
            return { recordsets: [person ? [{ ...person }] : [], (person?.permissions || []).map(PermissionCode => ({ PermissionCode }))] };
          }
          if (procedure === fixtureContracts.command.procedure) {
            state.beforeCommand?.();
            if (state.commandError || !person?.IsActive || !person.permissions.includes('fixture.write')) throw new Error('SQL rejected actor=do-not-log');
            const entry = { ActorId: person.UserId, RequestId: parameters.RequestId, Status: 'COMPLETED' };
            state.audit.push(entry);
            return { recordsets: [[{ ...entry }]] };
          }
          throw new Error('Unknown fixture procedure');
        });
        queue = pending.catch(() => {});
        return pending;
      }
    };
    return request;
  } };
  const records = new Map();
  const store = {
    testOnly: true, durable: false,
    async probe() { if (state.sessionError) throw new Error('private session backend'); return true; },
    async create(key, record) { if (state.sessionError || state.createError || records.has(key)) throw new Error('fixture write failed'); records.set(key, { ...record }); },
    async get(key) { if (state.sessionError || state.getError) throw new Error('private session backend'); return records.get(key); },
    async destroy(key) { if (state.sessionError || state.destroyError) throw new Error('fixture logout failed'); records.delete(key); }
  };
  const adapter = createSqlContractAdapter({ pool, types: fixtureTypes, contracts: fixtureContracts, environment: 'test', testOnly: true, timeoutMs: 100,
    operations: { 'fixture.write': { permission: 'fixture.write', validate: changes => changes && typeof changes.value === 'string' && Object.keys(changes).length === 1 } } });
  const sessions = createSessionManager({ store, secure: https, ttlMs, now: () => state.now });
  const runtime = createAuthRuntime({ config, identity: adapter, verifier: createPasswordVerifier({ formats: ['pbkdf2-sha256-v1', 'scrypt-v1'] }), sessions, mode: 'fixture' });
  const server = await startTestServer(t, { config, authRuntime: runtime, logger, listenPort,
    registerRoutes(app, auth) {
      app.post('/api/v1/fixture-command', auth.authenticate, rejectClientActor, requireOrigin(config.publicOrigin), auth.csrf, auth.requirePermission('fixture.write'), async (req, res) => {
        const result = await adapter.executeForActor(req.auth.actor, { operation: 'fixture.write', ...req.body }, req.requestId);
        res.json({ data: result, requestId: req.requestId });
      });
    }
  });
  const login = async (username = 'nhanvien_a', password = fixturePassword, extra = {}) => {
    const response = await fetch(server.url + '/api/v1/auth/login', { method: 'POST',
      headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json', ...extra.headers },
      body: JSON.stringify({ username, password, ...extra.body }) });
    const body = await response.json();
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    return { response, body, cookie, csrf: body.data?.csrfToken };
  };
  const request = (path, loginState, { method = 'GET', headers = {}, body } = {}) => fetch(server.url + path, {
    method, headers: { Origin: config.publicOrigin, ...(loginState?.cookie ? { Cookie: loginState.cookie } : {}),
      ...(loginState?.csrf ? { 'X-CSRF-Token': loginState.csrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { ...server, config, state, people, records, pool, adapter, store, runtime, login, request };
}
