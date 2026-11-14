import { createHash } from 'node:crypto';
import { readFile, open, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';

export class MigrationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireThat(condition, code) {
  if (!condition) throw new MigrationError(code);
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(v => canonical(v) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex');
export const textDigest = value => createHash('sha256').update(value, 'utf8').digest('hex');
export const pointerPart = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export async function readJson(file) {
  requireThat(typeof file === 'string' && file.length > 0, 'FILE_REQUIRED');
  const stat = await lstat(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 100 * 1024 * 1024, 'INVALID_FILE_OR_SIZE');
  try { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw new MigrationError('INVALID_JSON'); }
}
// Create-new only. No source, report, receipt or checkpoint is ever overwritten.
export async function writeNew(file, value) {
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
}
export async function newDirectory(directory) {
  requireThat(typeof directory === 'string' && directory.length > 0, 'OUTPUT_DIRECTORY_REQUIRED');
  await mkdir(directory, { recursive: false, mode: 0o700 });
}
export function inside(directory, filename) {
  requireThat(/^[a-zA-Z0-9_.-]+$/.test(filename), 'INVALID_ARTIFACT_NAME');
  return path.join(directory, filename);
}
export function vnd(value) {
  if (typeof value === 'number') {
    requireThat(Number.isSafeInteger(value), 'INVALID_VND');
    return BigInt(value);
  }
  requireThat(typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value), 'INVALID_VND');
  return BigInt(value);
}
export function sourceRef(pointer) { return `src:${textDigest(pointer)}`; }

export async function loadSource(sourceFile, manifestFile) {
  const source = await readJson(sourceFile);
  const manifest = await readJson(manifestFile);
  return verifySource(source, manifest);
}
export function verifySource(source, manifest) {
  requireThat(isObject(source) && isObject(manifest), 'SOURCE_AND_MANIFEST_REQUIRED');
  requireThat(manifest.format === 'songlam-migration/1' && manifest.schemaVersion === 1, 'MANIFEST_FORMAT');
  requireThat(/^[0-9a-f-]{36}$/i.test(manifest.batchId), 'BATCH_ID_REQUIRED');
  requireThat(manifest.sourceKey === 'songlam_hotel_pms_data_v2', 'SOURCE_KEY_NOT_ALLOWED');
  requireThat(manifest.exportedSourceSha256 === digest(source), 'SOURCE_CHECKSUM_MISMATCH');
  requireThat(Array.isArray(manifest.datasets) && Array.isArray(manifest.redactions), 'MANIFEST_INCOMPLETE');
  requireThat(manifest.redactions.every(r => isObject(r) && typeof r.pointer === 'string' && r.pointer.startsWith('/') && typeof r.reason === 'string'), 'REDACTION_FORMAT');
  requireThat(typeof manifest.exportedAtUtc === 'string' && Number.isFinite(Date.parse(manifest.exportedAtUtc))
    && /^[a-f0-9]{64}$/.test(manifest.originalUtf8Sha256), 'EXPORT_IDENTITY_INCOMPLETE');
  requireThat(isObject(source), 'SOURCE_OBJECT_REQUIRED');
  const keys = Object.keys(source).sort();
  requireThat(canonical(keys) === canonical(manifest.datasets.map(d => d.name).sort()), 'DATASET_COVERAGE_MISMATCH');
  for (const key of keys) {
    const descriptor = manifest.datasets.find(d => d.name === key);
    const value = source[key];
    requireThat(descriptor.sha256 === digest(value) && descriptor.count === (Array.isArray(value) ? value.length : 1), 'DATASET_CHECKSUM_MISMATCH');
  }
  return { source, manifest, manifestSha256: digest(manifest) };
}
