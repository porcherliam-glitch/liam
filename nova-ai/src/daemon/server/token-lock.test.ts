// Tests for the token file and the daemon lock file.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tempDir } from '../../../tests/helpers/core';
import { dataPaths, type DataPaths } from '../core/paths';
import { ensureToken, generateToken, readToken, writeToken } from './token';
import { readLock, removeLock, writeLock } from './lock';

let tmp: { dir: string; cleanup(): void };
let paths: DataPaths;

beforeEach(() => {
  tmp = tempDir('nova-srv-files-');
  paths = dataPaths(tmp.dir);
});
afterEach(() => tmp.cleanup());

describe('token', () => {
  it('generates 64 hex characters, different every time', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('writes atomically with mode 0600 and reads it back', () => {
    const token = generateToken();
    writeToken(paths, token);
    expect(readFileSync(paths.token, 'utf8')).toBe(token);
    if (process.platform !== 'win32') expect(statSync(paths.token).mode & 0o777).toBe(0o600);
    expect(readToken(paths)).toBe(token);
    const next = ensureToken(paths);
    expect(next).not.toBe(token);
    expect(readToken(paths)).toBe(next);
  });

  it('returns null for missing or malformed token files and refuses to write invalid tokens', () => {
    expect(readToken(paths)).toBeNull();
    writeFileSync(paths.token, 'not-a-token');
    expect(readToken(paths)).toBeNull();
    writeFileSync(paths.token, `${generateToken()}\n`);
    expect(readToken(paths)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => writeToken(paths, 'short')).toThrow();
  });
});

describe('lock file', () => {
  const info = { pid: 1234, instanceId: 'inst_a', endpoint: '/tmp/x.sock', startedAt: 1_700_000_000_000, version: '1.0.0' };

  it('writes, reads and removes only the own lock', () => {
    writeLock(paths, info);
    expect(readLock(paths)).toEqual(info);
    expect(removeLock(paths, 'inst_other')).toBe(false);
    expect(existsSync(paths.lock)).toBe(true);
    expect(removeLock(paths, 'inst_a')).toBe(true);
    expect(existsSync(paths.lock)).toBe(false);
    expect(removeLock(paths, 'inst_a')).toBe(false);
  });

  it('returns null for missing, corrupt or incomplete lock files', () => {
    expect(readLock(paths)).toBeNull();
    writeFileSync(paths.lock, '{ not json');
    expect(readLock(paths)).toBeNull();
    writeFileSync(paths.lock, JSON.stringify({ pid: 'x', instanceId: 'a' }));
    expect(readLock(paths)).toBeNull();
    expect(removeLock(paths, 'a')).toBe(false);
    expect(existsSync(paths.lock)).toBe(true);
  });

  it('keeps a Windows named-pipe endpoint unchanged', () => {
    const windows = { ...info, endpoint: '\\\\.\\pipe\\nova-ai-daemon-0123456789abcdef01234567' };
    writeLock(paths, windows);
    expect(readLock(paths)).toEqual(windows);
    expect(removeLock(paths, 'inst_a')).toBe(true);
  });

  it('rejects invalid lock info', () => {
    expect(() => writeLock(paths, { ...info, pid: -1 })).toThrow();
  });
});
