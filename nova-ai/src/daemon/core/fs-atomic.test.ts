// atomicWriteFile failure paths with a controllable node:fs (disk full while writing the temp file, a target held by
// another program so that the rename keeps failing): no temp file is left behind, and with allowInPlace: false the
// target is never rewritten non-atomically.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFile } from './fs-atomic';

const ctl = vi.hoisted(() => ({ renameCode: null as string | null, writeCode: null as string | null }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const fail = (code: string) => Object.assign(new Error(`${code}: simulated`), { code });
  const mocked = {
    ...actual,
    renameSync: (from: string, to: string) => {
      if (ctl.renameCode) throw fail(ctl.renameCode);
      return actual.renameSync(from, to);
    },
    writeSync: ((fd: number, buf: Buffer, offset?: number, length?: number) => {
      if (ctl.writeCode) {
        actual.writeSync(fd, buf, offset ?? 0, Math.min(length ?? buf.length, 2)); // part of the data reached the disk
        throw fail(ctl.writeCode);
      }
      return actual.writeSync(fd, buf, offset, length);
    }) as typeof actual.writeSync,
  };
  return { ...mocked, default: mocked };
});

let dir: string;
afterEach(() => {
  ctl.renameCode = null;
  ctl.writeCode = null;
  rmSync(dir, { recursive: true, force: true });
});

describe('atomicWriteFile failure paths', () => {
  it('removes the half-written temp file when the disk is full and leaves the target unchanged', () => {
    dir = mkdtempSync(join(tmpdir(), 'nova-atomic-'));
    writeFileSync(join(dir, 'a.txt'), 'old content');
    ctl.writeCode = 'ENOSPC';
    expect(() => atomicWriteFile(join(dir, 'a.txt'), 'new content that does not fit')).toThrow(/ENOSPC/);
    expect(readdirSync(dir)).toEqual(['a.txt']);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('old content');
  });

  it('allowInPlace: false → FILE_IN_USE when the target stays locked, never an in-place rewrite', () => {
    dir = mkdtempSync(join(tmpdir(), 'nova-atomic-'));
    writeFileSync(join(dir, 'b.txt'), 'old');
    ctl.renameCode = 'EBUSY';
    expect(() => atomicWriteFile(join(dir, 'b.txt'), 'new', { allowInPlace: false })).toThrow(expect.objectContaining({ code: 'FILE_IN_USE' }));
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('old');
    expect(readdirSync(dir)).toEqual(['b.txt']);
    // default (data-dir files): the in-place fallback still keeps them writable
    expect(atomicWriteFile(join(dir, 'b.txt'), 'new')).toEqual({ inPlaceFallback: true });
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['b.txt']);
  });
});
