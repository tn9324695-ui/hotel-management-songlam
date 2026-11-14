import { pbkdf2, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivePbkdf2 = promisify(pbkdf2);
const deriveScrypt = promisify(scrypt);
const algorithms = new Set(['pbkdf2-sha256-v1', 'scrypt-v1']);
// These explicitly versioned encodings are supported application formats, NOT an
// assertion about existing AppUser.PasswordHash values. No format is enabled by default.
function decode(text, minimum, maximum) {
  if (!/^[A-Za-z0-9_-]+$/.test(text || '')) return null;
  const bytes = Buffer.from(text, 'base64url');
  return bytes.length >= minimum && bytes.length <= maximum && bytes.toString('base64url') === text ? bytes : null;
}
function parse(hash, formats) {
  if (typeof hash !== 'string' || hash.length > 512) return null;
  const p = hash.split('$');
  if (p[0] !== '') return null;
  if (p[1] === 'pbkdf2-sha256-v1' && formats.has(p[1]) && p.length === 5) {
    const iterations = Number(p[2]), salt = decode(p[3], 16, 64), expected = decode(p[4], 32, 64);
    if (!/^\d+$/.test(p[2]) || iterations < 210000 || iterations > 1000000 || !salt || !expected) return null;
    return { expected, derive: password => derivePbkdf2(password, salt, iterations, expected.length, 'sha256') };
  }
  if (p[1] === 'scrypt-v1' && formats.has(p[1]) && p.length === 7) {
    const [N, r, parallelism] = p.slice(2, 5).map(Number), salt = decode(p[5], 16, 64), expected = decode(p[6], 32, 64);
    if (p.slice(2, 5).some(x => !/^\d+$/.test(x)) || ![16384, 32768].includes(N) || r !== 8 || parallelism !== 1 || !salt || !expected) return null;
    return { expected, derive: password => deriveScrypt(password, salt, expected.length, { N, r, p: parallelism, maxmem: 64 * 1024 * 1024 }) };
  }
  return null;
}

export function createPasswordVerifier({ formats = [] } = {}) {
  if (formats.some(name => !algorithms.has(name))) throw new TypeError('Unsupported password verifier configuration.');
  const enabled = new Set(formats);
  return Object.freeze({
    configured: enabled.size > 0,
    async verify(password, encodedHash) {
      const parsed = parse(encodedHash, enabled);
      if (!parsed) {
        // Do comparable work for absent users, unknown formats and missing hashes.
        // This never accepts a password and never rehashes or updates SQL.
        await derivePbkdf2(password, Buffer.alloc(16, 0x73), 210000, 32, 'sha256');
        return false;
      }
      const result = await parsed.derive(password);
      return timingSafeEqual(result, parsed.expected);
    }
  });
}
