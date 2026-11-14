#!/usr/bin/env node
// Offline only: deliberately no --connect or SQL driver import.
import { readJson } from '../migration/lib/core.mjs';
import { validateSqlTestProfile } from '../../backend/src/adapters/sql/test-profile.js';
try {
  const [option, file, ...extra] = process.argv.slice(2);
  if (option === '--help') process.stdout.write('node tools/sql/check-profile.mjs --profile <private-profile.json>\nOffline validation only; no SQL connection or writes.\n');
  else {
    if (option !== '--profile' || !file || extra.length) throw new Error();
    validateSqlTestProfile(await readJson(file));
    process.stdout.write('PROFILE_STRUCTURE_VALID_ONLY; SQL_NOT_CONNECTED; BUSINESS_WRITES_DISABLED\n');
  }
} catch (error) {
  const code = /^SQL_[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'SQL_PROFILE_INVALID';
  process.stderr.write(code + '\n'); process.exitCode = 1;
}
