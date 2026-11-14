import { isAbsolute } from 'node:path';

export class ConfigurationError extends Error {
  constructor(fields) {
    super(`Cấu hình không hợp lệ: ${fields.join(', ')}. Kiểm tra backend/.env theo .env.example.`);
    this.name = 'ConfigurationError';
    this.fields = fields;
  }
}

// Runtime config errors stop startup; absent G2 dependencies leave readiness false.
// Never put values (which may contain secrets) in configuration error messages.
export function loadConfig(env = process.env) {
  const errors = new Set();
  const required = ['NODE_ENV', 'HOST', 'PORT', 'PUBLIC_ORIGIN', 'DATABASE_PROVIDER', 'SQL_DATABASE'];
  for (const name of required) if (typeof env[name] !== 'string' || !env[name].trim()) errors.add(name);
  if (!['development', 'test', 'production'].includes(env.NODE_ENV)) errors.add('NODE_ENV');
  if (env.HOST && !/^(localhost|[a-zA-Z0-9.-]+|::1)$/.test(env.HOST)) errors.add('HOST');
  const port = Number(env.PORT);
  if (!/^\d+$/.test(env.PORT || '') || !Number.isInteger(port) || port < 1 || port > 65535) errors.add('PORT');
  let publicOrigin;
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error();
    publicOrigin = url.origin;
  } catch { errors.add('PUBLIC_ORIGIN'); }
  if (env.DATABASE_PROVIDER !== 'sqlserver') errors.add('DATABASE_PROVIDER');
  if (env.SQL_DATABASE !== 'SongLamPms_Design') errors.add('SQL_DATABASE');
  const sqlServer = env.SQL_SERVER?.trim() || null;
  if (sqlServer && (sqlServer.length > 255 || /[;\r\n\u0000]/.test(sqlServer))) errors.add('SQL_SERVER');
  const sqlPort = env.SQL_PORT?.trim() || null;
  if (sqlPort && (!/^\d+$/.test(sqlPort) || Number(sqlPort) < 1 || Number(sqlPort) > 65535)) errors.add('SQL_PORT');
  const cutoverMode = env.PMS_WRITE_MODE?.trim() || 'demo';
  if (!['demo', 'frozen', 'api-readonly', 'sql', 'test-booking'].includes(cutoverMode)) errors.add('PMS_WRITE_MODE');
  if (cutoverMode === 'test-booking' && env.NODE_ENV !== 'test') errors.add('PMS_WRITE_MODE');
  if (['api-readonly', 'sql', 'test-booking'].includes(cutoverMode) && (!env.PMS_RELEASE_FILE?.trim() || !env.PMS_BUILD_ID?.trim())) errors.add('PMS_RELEASE_FILE/PMS_BUILD_ID');
  if (env.PMS_BUILD_ID && !/^[A-Za-z0-9._-]{1,100}$/.test(env.PMS_BUILD_ID)) errors.add('PMS_BUILD_ID');
  if (env.PMS_RELEASE_FILE?.trim() && !isAbsolute(env.PMS_RELEASE_FILE.trim())) errors.add('PMS_RELEASE_FILE');
  const runtimeFile = env.SQL_RUNTIME_FILE?.trim() || null;
  if (runtimeFile && (!isAbsolute(runtimeFile) || env.NODE_ENV !== 'test')) errors.add('SQL_RUNTIME_FILE');
  if (runtimeFile && !sqlServer) errors.add('SQL_SERVER');
  if (errors.size) throw new ConfigurationError([...errors]);
  return Object.freeze({
    environment: env.NODE_ENV, host: env.HOST, port, publicOrigin,
    cutover: Object.freeze({ mode: cutoverMode, releaseFile: env.PMS_RELEASE_FILE?.trim() || null, buildId: env.PMS_BUILD_ID?.trim() || null }),
    sql: Object.freeze({
      provider: 'sqlserver', database: 'SongLamPms_Design',
      server: sqlServer, port: sqlPort ? Number(sqlPort) : null, runtimeFile
    })
  });
}
