import { createHash } from 'node:crypto';

// Protocol requirement for the future SQL adapter: compare this canonical UTF-8
// intent, not Changes (which contains newly generated quote IDs/timestamps).
export function canonicalIntent(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalIntent).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalIntent(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const intentHash = value => createHash('sha256').update(canonicalIntent(value), 'utf8').digest('hex');
