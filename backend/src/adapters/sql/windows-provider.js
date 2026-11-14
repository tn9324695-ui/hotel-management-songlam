import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { SqlTestSetupError } from './test-profile.js';

const require = createRequire(import.meta.url);
// Windows account names may contain internal spaces (e.g. the maintenance
// operator). Still reject delimiters, control characters and noncanonical ends.
export const isWindowsPrincipal = value => typeof value === 'string'
  && /^[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+(?: [A-Za-z0-9_.-]+)*$/.test(value);
export function currentWindowsPrincipal() {
  if (process.platform !== 'win32') throw new SqlTestSetupError('SQL_WINDOWS_IDENTITY_REQUIRED');
  try {
    return execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), [],
      { encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { throw new SqlTestSetupError('SQL_WINDOWS_IDENTITY_UNVERIFIED'); }
}

// Importing native types does not connect. There is no global sql.connect(),
// raw query, connection string, impersonation, SQL login or metadata-account fallback.
export function createWindowsSqlProvider({ sql, expectedPrincipal, principalApprovalReference, odbcDriver,
  principalProbe = currentWindowsPrincipal, onPoolError = () => {} } = {}) {
  if (!isWindowsPrincipal(expectedPrincipal) || typeof principalApprovalReference !== 'string'
    || !principalApprovalReference.trim()) throw new SqlTestSetupError('SQL_SERVICE_PRINCIPAL_APPROVAL_REQUIRED');
  if (!['ODBC Driver 17 for SQL Server', 'ODBC Driver 18 for SQL Server'].includes(odbcDriver)) throw new SqlTestSetupError('SQL_ODBC_DRIVER_REQUIRED');
  if (typeof sql?.ConnectionPool !== 'function' || typeof sql.NVarChar !== 'function') throw new SqlTestSetupError('SQL_DRIVER_PROVIDER_REQUIRED');
  const verifyPrincipal = () => {
    let principal;
    try { principal = principalProbe(); } catch { throw new SqlTestSetupError('SQL_WINDOWS_IDENTITY_UNVERIFIED'); }
    if (typeof principal !== 'string' || principal.toLowerCase() !== expectedPrincipal.toLowerCase()) throw new SqlTestSetupError('SQL_SERVICE_PRINCIPAL_MISMATCH');
    return true;
  };
  return Object.freeze({ types: sql, verifyPrincipal, createPool(options) {
    verifyPrincipal();
    if (options?.auth?.mode !== 'windows' || options.transport?.encrypt !== true) throw new SqlTestSetupError('SQL_WINDOWS_TLS_REQUIRED');
    const config = { server: options.server, database: options.database, driver: odbcDriver,
      connectionTimeout: options.connectionTimeoutMs, requestTimeout: options.requestTimeoutMs,
      pool: { min: options.pool.min, max: options.pool.max, idleTimeoutMillis: options.pool.idleTimeoutMs },
      options: { trustedConnection: true, encrypt: true, trustServerCertificate: options.transport.trustServerCertificate === true, useUTC: true },
      // mssql's native driver builds its own ODBC string. Set this TLS option
      // explicitly there as well; never expose or log that connection string.
      beforeConnect: connection => { connection.conn_str += ';TrustServerCertificate=' + (options.transport.trustServerCertificate === true ? 'Yes' : 'No') + ';'; },
      ...(options.transport.port == null ? {} : { port: options.transport.port }) };
    const pool = new sql.ConnectionPool(config);
    pool.on('error', () => { try { onPoolError(); } catch { /* Logging failure cannot expose a raw driver error. */ } });
    return pool;
  } });
}

export function loadWindowsSqlProvider(options) {
  let sql;
  try { sql = require('mssql/msnodesqlv8'); }
  catch { throw new SqlTestSetupError('SQL_NATIVE_DRIVER_UNAVAILABLE'); }
  return createWindowsSqlProvider({ ...options, sql });
}
