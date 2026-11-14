#!/usr/bin/env node
// Offline shape/approval-reference checks only. NEVER loads native driver or opens pool.
import { resolve } from 'node:path';
import { readSqlRuntimeManifest, validateSqlRuntimeManifest } from '../../backend/src/adapters/sql/runtime.js';
try {
  const [file,...extra]=process.argv.slice(2);if(!file||extra.length)throw new Error();
  const plan=readSqlRuntimeManifest(resolve(file));
  validateSqlRuntimeManifest({manifest:plan,config:{environment:'test',sql:{database:plan.profile?.target?.database,server:plan.profile?.target?.server,port:plan.profile?.transport?.port}}});
  process.stdout.write('RUNTIME_STRUCTURE_VALID_ONLY; SQL_NOT_CONNECTED; SQL_NOT_EXECUTED\n');
}catch(error){process.stderr.write((/^SQL_[A-Z0-9_]+$/.test(error?.code||'')?error.code:'SQL_RUNTIME_INPUT_INVALID')+'\n');process.exitCode=1;}
