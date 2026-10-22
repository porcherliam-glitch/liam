// aes-local fallback of the SecretStore (Linux/macOS only, never chosen automatically on Windows).
// Key decisions:
// - AES-256-GCM with a random 256-bit key in <dataDir>/secret.key (hex, mode 0600, written atomically). The key file is
//   NEVER regenerated when it exists but is unreadable/corrupt – that would silently destroy every stored secret; the
//   store reports SECRET_STORE instead.
// - Ciphertext format "v1:" + base64(iv[12] | tag[16] | ciphertext); AAD = "NOVA AI|" + id, so a ciphertext copied to
//   another id fails authentication.
// - Honest limit: anybody who can read the data dir can decrypt (secure=false, reported as warning
//   'secret-store-insecure'). It only keeps keys out of plain-text database dumps and exports.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, chmodSync } from 'node:fs';
import { atomicWriteFile } from '../core/fs-atomic';

const VERSION = 'v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

export type KeyLoadResult = { ok: true; key: Buffer; created: boolean } | { ok: false; reason: 'corrupt' | 'unreadable' };

/** Reads the key file or creates it (only if it does not exist). */
export function loadOrCreateKey(path: string, platform: NodeJS.Platform = process.platform): KeyLoadResult {
  if (existsSync(path)) {
    let text: string;
    try {
      text = readFileSync(path, 'utf8').trim();
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    if (!/^[0-9a-f]{64}$/i.test(text)) return { ok: false, reason: 'corrupt' };
    if (platform !== 'win32') {
      try {
        chmodSync(path, 0o600); // tighten permissions if someone loosened them
      } catch {
        /* best effort */
      }
    }
    return { ok: true, key: Buffer.from(text, 'hex'), created: false };
  }
  const key = randomBytes(32);
  atomicWriteFile(path, key.toString('hex'), { mode: 0o600 });
  if (platform !== 'win32') {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best effort */
    }
  }
  return { ok: true, key, created: true };
}

function aad(id: string): Buffer {
  return Buffer.from(`NOVA AI|${id}`, 'utf8');
}

export function aesEncrypt(key: Buffer, id: string, plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(id));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION + Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Returns null when the ciphertext is malformed or fails authentication (wrong key, wrong id, tampering). */
export function aesDecrypt(key: Buffer, id: string, ciphertext: string): string | null {
  if (!ciphertext.startsWith(VERSION)) return null;
  let raw: Buffer;
  try {
    raw = Buffer.from(ciphertext.slice(VERSION.length), 'base64');
  } catch {
    return null;
  }
  if (raw.length < IV_LEN + TAG_LEN) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_LEN));
    decipher.setAAD(aad(id));
    decipher.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN));
    return Buffer.concat([decipher.update(raw.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
