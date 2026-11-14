import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadConfig, ConfigurationError } from '../src/config/environment.js';
import { exampleEnv } from './helpers.js';

test('missing required runtime fields are rejected by name only', () => {
  assert.throws(() => loadConfig({}), error => error instanceof ConfigurationError && error.fields.includes('PORT') && error.fields.includes('PUBLIC_ORIGIN'));
});
test('example starts HTTP foundation with unconfigured SQL dependencies', () => {
  const config = loadConfig(exampleEnv);
  assert.equal(config.sql.server, null);
  assert.equal(config.sql.port, null);
  assert.equal(config.sql.database, 'SongLamPms_Design');
  assert.ok(Object.isFrozen(config.sql));
});
test('SQL_SERVER accepts a named instance but rejects embedded connection properties and multiline values', () => {
  assert.equal(loadConfig({ ...exampleEnv, SQL_SERVER: '.\\SQLEXPRESS' }).sql.server, '.\\SQLEXPRESS');
  for (const value of ['server;Password=private-value', 'server\nprivate-value', 'x'.repeat(256)]) {
    assert.throws(() => loadConfig({ ...exampleEnv, SQL_SERVER: value }), error => error.fields.includes('SQL_SERVER') && !error.message.includes(value));
  }
});
for (const [field, value] of Object.entries({ PORT: '0', HOST: 'host/with/path', NODE_ENV: 'unknown', PUBLIC_ORIGIN: 'http://user:secret@localhost', SQL_PORT: '99999', DATABASE_PROVIDER: 'postgres', SQL_DATABASE: 'some-other-db' })) {
  test(`invalid ${field} never echoes the supplied value`, () => {
    assert.throws(() => loadConfig({ ...exampleEnv, [field]: value }), error => error.fields.includes(field) && !error.message.includes(value));
  });
}
test('production requires an HTTPS public origin', () => {
  assert.throws(() => loadConfig({ ...exampleEnv, NODE_ENV: 'production' }), ConfigurationError);
  assert.equal(loadConfig({ ...exampleEnv, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://pms.example.test' }).publicOrigin, 'https://pms.example.test');
});
test('server entry exits safely before listening when config is absent', () => {
  const env = { ...process.env };
  for (const name of Object.keys(exampleEnv)) delete env[name];
  env.PUBLIC_ORIGIN = 'http://secret-user:secret-password@localhost';
  const result = spawnSync(process.execPath, ['src/server.js'], { cwd: new URL('../', import.meta.url), env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CONFIG_INVALID/);
  assert.doesNotMatch(result.stderr + result.stdout, /secret-password|secret-user|server.listening/);
});
