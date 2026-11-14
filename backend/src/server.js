import { createApp } from './app.js';
import { loadConfig } from './config/environment.js';
import { startSqlRuntime } from './adapters/sql/runtime.js';

const logger = {
  info: event => process.stdout.write(JSON.stringify(event) + '\n'),
  error: event => process.stderr.write(JSON.stringify(event) + '\n')
};

let config;
try { config = loadConfig(); }
catch (error) {
  // ConfigurationError contains field names only. Never print environment values.
  logger.error({ event: 'startup.configuration_rejected', code: 'CONFIG_INVALID', fields: error.fields || [] });
  process.exitCode = 1;
}
async function start(config) {
  let runtime;
  try { runtime = await startSqlRuntime({ config, logger }); }
  catch (error) {
    logger.error({event:'startup.sql_runtime_rejected',code:/^SQL_[A-Z0-9_]+$/.test(error?.code||'')?error.code:'SQL_RUNTIME_INITIALIZATION_FAILED'});
    process.exitCode=1; return;
  }
  let server, closing;
  const closeRuntime = () => closing ||= Promise.resolve().then(()=>runtime.close()).catch(()=>logger.error({event:'sql.close_failed',code:'SQL_POOL_CLOSE_FAILED'}));
  try {
    server = createApp({ config, logger, ...runtime.appDependencies, sqlRuntime:runtime }).listen(config.port, config.host, () => {
      logger.info({ event: 'server.listening', port: config.port, stage: config.cutover.mode==='test-booking'?'BOOKING_SQL_TEST':'G12', ready: false, writeMode: config.cutover.mode, sqlRuntime:config.sql.runtimeFile?'test-only':'disabled' });
    });
  } catch {
    await closeRuntime(); logger.error({event:'startup.failed',code:'APPLICATION_START_FAILED'}); process.exitCode=1; return;
  }
  server.on('error', () => {
    logger.error({ event: 'server.listen_failed', code: 'LISTEN_FAILED' });
    void closeRuntime();
    process.exitCode = 1;
  });
  let stopping=false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    if(stopping)return;stopping=true;
    const timer = setTimeout(() => process.exit(1), 8000);
    server.close(() => { void closeRuntime().finally(()=>clearTimeout(timer)); });
    server.closeIdleConnections();
    timer.unref();
  });
}
if (config) await start(config);
