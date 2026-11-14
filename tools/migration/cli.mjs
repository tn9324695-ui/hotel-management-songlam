#!/usr/bin/env node
import { readJson, writeNew, newDirectory, inside, digest, requireThat, verifySource, loadSource, MigrationError } from './lib/core.mjs';
import { analyze, inventory } from './lib/analyze.mjs';
import { reconcile, validatePlan } from './lib/reconcile.mjs';
import { validateRehearsal, importBatches } from './lib/import-engine.mjs';
import { createApprovedImportAdapter } from './sql-adapter.mjs';
import { randomUUID } from 'node:crypto';

const help = `SongLam PMS G11 — internal offline CLI (Node >=22)
  unpack    --package <export.json> --out <NEW-directory>
  analyze   --source <source.json> --manifest <manifest.json> --out <NEW-directory>
            [--review <review.json>] [--crosswalk <crosswalk.json>] [--baseline <reviewed-baseline-source.json>]
  reconcile --plan <plan.json> --out <NEW-directory> [--target <verification.json>]
  import    --environment rehearsal --config <rehearsal.json> --source <source.json>
            --manifest <manifest.json> --plan <plan.json> --aggregates <approved-aggregates.json>
            --checkpoints <existing-private-directory>
SQL import is LOCKED: no approved historical import adapter. No production/G12 command.
No command reads a browser. Output directories/files are create-new, never overwritten.`;
const allowed = {
  unpack: ['package', 'out'], analyze: ['source', 'manifest', 'out', 'review', 'crosswalk', 'baseline'],
  reconcile: ['plan', 'out', 'target'], import: ['environment', 'config', 'source', 'manifest', 'plan', 'aggregates', 'checkpoints']
};
function options(args, command) {
  const output = Object.create(null);
  requireThat(command in allowed, 'UNKNOWN_COMMAND');
  for (let i = 0; i < args.length; i += 2) {
    requireThat(args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--'), 'ARGUMENT_VALUE_REQUIRED');
    const name = args[i].slice(2);
    requireThat(allowed[command].includes(name) && !(name in output), 'UNKNOWN_OR_DUPLICATE_OPTION');
    output[name] = args[i + 1];
  }
  return output;
}
async function optionalJson(file) { return file ? readJson(file) : {}; }
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help') { process.stdout.write(`${help}\n`); return; }
  const opt = options(args, command);
  if (command === 'unpack') {
    const packet = await readJson(opt.package);
    const { source, manifest } = verifySource(packet.source, packet.manifest);
    await newDirectory(opt.out);
    await writeNew(inside(opt.out, 'source.json'), source);
    await writeNew(inside(opt.out, 'manifest.json'), manifest);
    await writeNew(inside(opt.out, 'package-integrity.json'), { packageSha256: digest(packet), sourceSha256: digest(source), manifestSha256: digest(manifest) });
    process.stdout.write('UNPACKED — immutable files created; no classification/import performed.\n');
    return;
  }
  if (command === 'analyze') {
    const bundle = await loadSource(opt.source, opt.manifest);
    const review = await optionalJson(opt.review), crosswalk = await optionalJson(opt.crosswalk);
    const baseline = opt.baseline ? await readJson(opt.baseline) : null;
    const plan = analyze(bundle, review, crosswalk, baseline);
    await newDirectory(opt.out);
    await writeNew(inside(opt.out, 'plan.json'), plan);
    await writeNew(inside(opt.out, 'quarantine.json'), { batchId: plan.batchId, sourceSha256: plan.sourceSha256,
      records: plan.records.filter(r => r.status === 'QUARANTINED') });
    await writeNew(inside(opt.out, 'review-template.json'), { batchId: plan.batchId, sourceSha256: plan.sourceSha256,
      timezone: null, timezoneApprovalReference: null,
      records: plan.records.map(r => ({ sourceRef: r.sourceRef, sourceHash: r.sourceHash, classification: 'UNKNOWN',
        approvalReference: null, paymentEvidenceReference: null, actorMappingReference: null })) });
    await writeNew(inside(opt.out, 'crosswalk-template.json'), { batchId: plan.batchId, sourceSha256: plan.sourceSha256,
      sourceIndex: inventory(bundle.source).map(r => ({ sourceRef: r.sourceRef, sourceHash: r.sourceHash,
        collection: r.collection, legacyId: r.legacyId || null, pointer: r.pointer, parentRef: r.parentRef })), entries: [] });
    await writeNew(inside(opt.out, 'preflight-reconciliation.json'), reconcile(plan, null));
    process.stdout.write(`ANALYZED — records=${plan.records.length}; quarantined=${plan.records.filter(r => r.status === 'QUARANTINED').length}; SQL_LOCKED\n`);
    return;
  }
  if (command === 'reconcile') {
    const plan = await readJson(opt.plan);
    const target = opt.target ? await readJson(opt.target) : null;
    const report = reconcile(plan, target);
    await newDirectory(opt.out);
    await writeNew(inside(opt.out, 'reconciliation.json'), report);
    process.stdout.write(`${report.status} — issues=${report.issues.length}; no SQL performed.\n`);
    if (report.status !== 'PASS') process.exitCode = 2;
    return;
  }
  requireThat(opt.environment === 'rehearsal', 'EXPLICIT_REHEARSAL_REQUIRED');
  const bundle = await loadSource(opt.source, opt.manifest);
  const plan = await readJson(opt.plan), config = await readJson(opt.config);
  validatePlan(plan);
  requireThat(plan.batchId === bundle.manifest.batchId && plan.sourceSha256 === bundle.manifest.exportedSourceSha256
    && plan.manifestSha256 === bundle.manifestSha256, 'IMPORT_SOURCE_PLAN_MISMATCH');
  validateRehearsal(config, plan);
  // Always throws in this release. No flags/config can load external code or enable SQL.
  const adapter = createApprovedImportAdapter();
  try {
    const aggregates = await readJson(opt.aggregates);
    const target = await importBatches({ adapter, config, plan, aggregates,
      checkpointDirectory: opt.checkpoints, progress: event => process.stdout.write(`BATCH ${event.ordinal}: ${event.status}\n`) });
    const artifactId = randomUUID();
    await writeNew(inside(opt.checkpoints, `verification-${artifactId}.json`), target);
    await writeNew(inside(opt.checkpoints, `crosswalk-${artifactId}.json`), {
      batchId: plan.batchId, sourceSha256: plan.sourceSha256, planSha256: plan.planSha256,
      entries: target.records.map(r => ({ sourceRef: r.sourceRef, sourceHash: r.sourceHash,
        targetEntity: r.targetEntity, component: r.component, targetId: r.targetId,
        approvalReference: target.approvalReference }))
    });
    const report = reconcile(plan, target);
    await writeNew(inside(opt.checkpoints, `final-${artifactId}.json`), report);
    if (report.status !== 'PASS') process.exitCode = 2;
  } finally { await adapter.close(); }
}
main().catch(error => {
  // No error.message/stack/SQL text/file contents/paths/credentials in operator logs.
  const code = error instanceof MigrationError ? error.code
    : error?.code === 'EEXIST' ? 'OUTPUT_EXISTS_NOT_OVERWRITTEN' : 'IO_OR_INTERNAL_ERROR_REVIEW_PRIVATE_INPUT';
  process.stderr.write(`STOPPED: ${code}\n`);
  process.exitCode = 1;
});
