// Preparation only: no file loading, driver loading, SQL calls or secret logging.
export class SqlTestSetupError extends Error {
  constructor(code) { super(code); this.name = 'SqlTestSetupError'; this.code = code; }
}
const demand = (ok, code) => { if (!ok) throw new SqlTestSetupError(code); };
const procedures = Object.freeze({ environment: 'pms.usp_AppEnvironment', credentials: 'pms.usp_AppAuthLookup',
  identity: 'pms.usp_AppIdentity', actorProbe: 'pms.usp_AppActorProbe' });
const safeName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value);
const ref = value => typeof value === 'string' && value.trim().length > 0;
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));

export function validateSqlTestProfile(input) {
  demand(input?.format === 'songlam.sql-test-profile.v1', 'SQL_TEST_PROFILE_FORMAT');
  demand(closed(input, ['format', 'approved', 'approvalReference', 'environment', 'target', 'transport', 'auth', 'contracts', 'testWritesAllowed']), 'SQL_PROFILE_MUST_NOT_CONTAIN_SECRETS');
  demand(input.approved === true && ref(input.approvalReference), 'SQL_TEST_APPROVAL_REQUIRED');
  demand(input.environment === 'test', 'SQL_TEST_ENVIRONMENT_REQUIRED');
  const t = input.target;
  demand(closed(t, ['confirmed', 'testOnly', 'server', 'database', 'expectedServerIdentity', 'expectedDatabaseIdentity', 'existingDatabaseTestApprovalReference', 'backupReference']), 'SQL_TEST_TARGET_REQUIRED');
  demand(t?.confirmed === true && t.testOnly === true && ref(t.server) && t.server.length <= 255
    && !/[;\r\n\u0000]/.test(t.server), 'SQL_TEST_TARGET_REQUIRED');
  demand(safeName(t.database) && !['master', 'model', 'msdb', 'tempdb'].includes(t.database.toLowerCase()), 'SQL_OPERATIONAL_TARGET_FORBIDDEN');
  if (['songlampms_design', 'qlkhachsan'].includes(t.database.toLowerCase()) || !/test|rehearsal|sandbox/i.test(t.database)) {
    demand(ref(t.existingDatabaseTestApprovalReference) && ref(t.backupReference), 'SQL_EXISTING_DATABASE_TEST_APPROVAL_REQUIRED');
  }
  demand(ref(t.expectedServerIdentity) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.expectedDatabaseIdentity || ''), 'SQL_TEST_IDENTITY_REQUIRED');
  demand(input.transport?.encrypt === true, 'SQL_ENCRYPTION_REQUIRED');
  demand(closed(input.transport, ['port', 'encrypt', 'trustServerCertificate', 'certificateExceptionApprovalReference']), 'SQL_PROFILE_MUST_NOT_CONTAIN_SECRETS');
  demand(input.transport.trustServerCertificate === false || input.transport.trustServerCertificate === true
    && ref(input.transport.certificateExceptionApprovalReference), 'SQL_CERTIFICATE_APPROVAL_REQUIRED');
  demand(input.transport.port === null || Number.isInteger(input.transport.port) && input.transport.port >= 1 && input.transport.port <= 65535, 'SQL_PORT_INVALID');
  demand(input.auth?.mode === 'windows' || input.auth?.mode === 'sql-login', 'SQL_AUTH_MODE_REQUIRED');
  if (input.auth.mode === 'sql-login') {
    for (const field of ['usernameEnv', 'passwordEnv']) demand(/^SONGLAM_[A-Z0-9_]{1,70}$/.test(input.auth[field] || ''), 'SQL_SECRET_REFERENCE_REQUIRED');
    demand(input.auth.usernameEnv !== input.auth.passwordEnv, 'SQL_SECRET_REFERENCES_DISTINCT');
  }
  // No passwords, connection strings, tokens or unreviewed properties in this profile.
  const authKeys = input.auth.mode === 'windows' ? ['mode'] : ['mode', 'usernameEnv', 'passwordEnv'];
  demand(Object.keys(input.auth).every(k => authKeys.includes(k)), 'SQL_PROFILE_MUST_NOT_CONTAIN_SECRETS');
  demand(input.contracts && typeof input.contracts === 'object' && !Array.isArray(input.contracts), 'SQL_CONTRACTS_REQUIRED');
  demand(Object.keys(input.contracts).every(k => Object.hasOwn(procedures, k)), 'SQL_CONTRACTS_REQUIRED');
  const contracts = {};
  for (const [key, expected] of Object.entries(procedures)) {
    const c = input.contracts[key];
    if (key === 'actorProbe' && c === undefined) continue;
    demand(closed(c, ['approved', 'approvalReference', 'procedure', 'database', 'environment']), 'SQL_CONTRACT_APPROVAL_REQUIRED');
    if (key === 'actorProbe' && c.approved === false) continue;
    demand(c?.approved === true && ref(c.approvalReference) && c.procedure === expected
      && c.database === t.database && c.environment === 'test', 'SQL_CONTRACT_APPROVAL_REQUIRED');
    contracts[key] = Object.freeze({ ...c });
  }
  demand(input.testWritesAllowed === false, 'SQL_AUTH_PREFLIGHT_READ_ONLY');
  return Object.freeze({ format: input.format, approved: true, approvalReference: input.approvalReference, environment: 'test',
    target: Object.freeze({ ...t }), transport: Object.freeze({ ...input.transport }), auth: Object.freeze({ ...input.auth }),
    contracts: Object.freeze(contracts), testWritesAllowed: false });
}

export function sqlTestConnectionOptions(profile, secrets = process.env) {
  const p = validateSqlTestProfile(profile);
  const auth = { mode: p.auth.mode };
  if (auth.mode === 'sql-login') {
    let username, password;
    try { username = secrets[p.auth.usernameEnv]; password = secrets[p.auth.passwordEnv]; }
    catch { throw new SqlTestSetupError('SQL_SECRETS_UNAVAILABLE'); }
    demand(typeof username === 'string' && username.length > 0 && typeof password === 'string' && password.length > 0, 'SQL_SECRETS_MISSING');
    auth.username = username; auth.password = password;
  }
  // Internal provider-neutral options. Never serialize this object into an API/log.
  return { server: p.target.server, database: p.target.database, auth,
    transport: { encrypt: true, trustServerCertificate: p.transport.trustServerCertificate, port: p.transport.port },
    pool: { min: 0, max: 5, idleTimeoutMs: 30000 }, connectionTimeoutMs: 5000, requestTimeoutMs: 3000 };
}
