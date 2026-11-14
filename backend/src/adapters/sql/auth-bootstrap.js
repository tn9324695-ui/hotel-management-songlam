import { openApprovedTestPool } from './test-pool.js';
import { validateSqlTestProfile, SqlTestSetupError } from './test-profile.js';
import { createSqlContractAdapter } from './approved-contracts.js';
import { createSqlSessionStore } from './session-store.js';
import { createSessionManager } from '../../modules/auth/sessions.js';
import { createPasswordVerifier } from '../../modules/auth/password-verifier.js';
import { createAuthRuntime } from '../../modules/auth/runtime.js';

// Explicit test-environment composition. runtime.js invokes this only after
// validating separately approved manifests and the selected real driver.
// No SQL deployment, employee provisioning or business commands.
export async function prepareApprovedTestAuth({ config, profile, sessionManifest, epoch, passwordFormats = [],
  createPool, types, secrets, timeoutMs = 3000, ttlMs = 8 * 60 * 60 * 1000 } = {}) {
  if (config?.environment !== 'test') throw new SqlTestSetupError('SQL_TEST_ENVIRONMENT_REQUIRED');
  const checked = validateSqlTestProfile(profile);
  if (typeof types?.NVarChar !== 'function') throw new SqlTestSetupError('SQL_DRIVER_PROVIDER_REQUIRED');
  // Freeze the reviewed S0 configuration before an asynchronous provider can
  // observe/mutate caller-owned objects while establishing the connection.
  sessionManifest = sessionManifest ? { ...sessionManifest, procedures: { ...sessionManifest.procedures } } : null;
  const verifier = createPasswordVerifier({ formats: passwordFormats });
  if (!verifier.configured) throw new SqlTestSetupError('SQL_PASSWORD_FORMAT_REQUIRED');
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 86400000) throw new SqlTestSetupError('SQL_SESSION_CONFIG_REQUIRED');
  let secure;
  try { const url = new URL(config.publicOrigin); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); secure = url.protocol === 'https:'; }
  catch { throw new SqlTestSetupError('SQL_SESSION_CONFIG_REQUIRED'); }
  // Validate S0 BEFORE contacting a provider. A placeholder pool is never called.
  const options = { types, manifest: sessionManifest, database: checked.target.database, environment: 'test', epoch, timeoutMs };
  if (!createSqlSessionStore({ ...options, pool: {} }).configured) throw new SqlTestSetupError('SQL_SESSION_CONFIG_REQUIRED');
  const opened = await openApprovedTestPool({ profile: checked, createPool, types, secrets, timeoutMs });
  try {
    const identity = createSqlContractAdapter({ pool: opened.pool, types, contracts: checked.contracts,
      environment: 'test', database: checked.target.database, timeoutMs });
    const store = createSqlSessionStore({ ...options, pool: opened.pool });
    // Read-only S0 probe; never creates a session merely by preparing the runtime.
    if (await store.probe() !== true) throw new Error();
    const sessions = createSessionManager({ store, secure, ttlMs });
    const authRuntime = createAuthRuntime({ config, identity, verifier, sessions });
    return Object.freeze({ authRuntime, identity, close: opened.close, businessWritesEnabled: false,
      // A3 is optional and read-only. No command contract/operation is installed.
      actorProbeConfigured: Boolean(checked.contracts.actorProbe),
      targetIdentityVerified: true, environment: 'test' });
  } catch {
    await opened.close();
    throw new SqlTestSetupError('SQL_AUTH_BOOTSTRAP_UNAVAILABLE');
  }
}
