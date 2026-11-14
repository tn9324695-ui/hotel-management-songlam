import { SqlTestSetupError, validateSqlTestProfile, sqlTestConnectionOptions } from './test-profile.js';

// Explicitly injected provider only. Runtime startup requires separate approved
// configuration. No native driver import or default instance/database here.
export async function openApprovedTestPool({ profile, createPool, types, secrets, timeoutMs = 5000 } = {}) {
  const checked = validateSqlTestProfile(profile);
  if (typeof createPool !== 'function' || !types || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new SqlTestSetupError('SQL_DRIVER_PROVIDER_REQUIRED');
  const options = sqlTestConnectionOptions(checked, secrets);
  let pool, connectTimer, requestTimer, request, abandoned = false;
  async function close() {
    let timer;
    try { await Promise.race([Promise.resolve().then(() => pool?.close()), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); }
    catch { /* raw driver messages are never surfaced */ }
    finally { clearTimeout(timer); }
  }
  try {
    pool = createPool(options);
    if (!pool || ['connect', 'request', 'close'].some(k => typeof pool[k] !== 'function')) throw new Error();
    const connecting = Promise.resolve().then(() => pool.connect());
    connecting.then(() => { if (abandoned) void close(); }, () => {});
    await Promise.race([connecting, new Promise((_, reject) => { connectTimer = setTimeout(() => reject(new Error()), timeoutMs); })]);
    clearTimeout(connectTimer);
    if (pool.connected !== true) throw new Error();
    request = pool.request(); request.timeout = timeoutMs;
    const result = await Promise.race([request.execute(checked.contracts.environment.procedure), new Promise((_, reject) => {
      requestTimer = setTimeout(() => { try { request.cancel(); } catch {} reject(new Error()); }, timeoutMs);
    })]);
    const rows = result.recordsets?.[0];
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].DatabaseName !== checked.target.database
      || rows[0].ServerIdentity !== checked.target.expectedServerIdentity || rows[0].DatabaseIdentity !== checked.target.expectedDatabaseIdentity
      || rows[0].Environment !== 'test' || rows[0].ContractVersion !== 'songlam.auth.v1') throw new Error();
    return Object.freeze({ pool, types, profile: checked, close, identityVerified: true,
      // Identity verified is NOT login readiness, a working session store or a domain approval.
      businessWritesEnabled: false });
  } catch { abandoned = true; await close(); throw new SqlTestSetupError('SQL_TEST_CONNECTION_OR_IDENTITY_UNVERIFIED'); }
  finally { clearTimeout(connectTimer); clearTimeout(requestTimer); }
}
