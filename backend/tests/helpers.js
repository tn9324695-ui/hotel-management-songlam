import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/environment.js';

export const exampleEnv = {
  NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000', PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
  DATABASE_PROVIDER: 'sqlserver', SQL_DATABASE: 'SongLamPms_Design', SQL_SERVER: '', SQL_PORT: ''
};
export const testConfig = overrides => loadConfig({ ...exampleEnv, ...overrides });
export async function startTestServer(t, options = {}) {
  const { listenPort = 0, ...appOptions } = options;
  const app = createApp({ config: testConfig(), ...appOptions });
  const server = app.listen(listenPort, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return { app, server, url: `http://127.0.0.1:${server.address().port}` };
}
