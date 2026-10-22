// Tests of FileWatcher: real fs.watch events, ignore rules, journal suppression, EMFILE/error fallback to polling,
// idempotence/limits/unwatch and Windows path normalization.
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NovaEventMap } from '@shared/events';
import { createHarness, type Harness } from './test-support';
import { createFileWatcher, normalizeWatchPath, type WatchFn } from './watcher';
import type { FileWatcher } from '../../contracts';

let h: Harness;
let w: FileWatcher | null = null;
afterEach(() => {
  w?.unwatchAll();
  w = null;
  h?.cleanup();
});

type Changed = NovaEventMap['files.changed'];

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}

function collect(h: Harness): Changed[] {
  const events: Changed[] = [];
  h.t.core.bus.on('files.changed', (e) => events.push(e));
  return events;
}

describe('FileWatcher', () => {
  it('reports external changes (debounced), ignores ignored folders and suppresses paths the journal just wrote', async () => {
    h = createHarness();
    mkdirSync(join(h.root, 'node_modules'));
    const events = collect(h);
    w = createFileWatcher(h.s, { debounceMs: 60 });
    w.watch(h.project.id, h.project.path);
    await new Promise((r) => setTimeout(r, 100)); // let the watcher settle
    writeFileSync(join(h.root, 'outside-edit.txt'), 'x');
    writeFileSync(join(h.root, 'node_modules', 'dep.js'), 'x');
    await waitFor(() => events.some((e) => e.actor === 'external'));
    const ext = events.filter((e) => e.actor === 'external');
    expect(ext.flatMap((e) => e.paths)).toContain('outside-edit.txt');
    expect(ext.flatMap((e) => e.paths).some((p) => p.startsWith('node_modules'))).toBe(false);
    events.length = 0;
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'by-nova.txt', content: 'n', actor: 'nova' });
    await new Promise((r) => setTimeout(r, 400));
    expect(events).toEqual([{ projectId: h.project.id, paths: ['by-nova.txt'], actor: 'nova' }]);
  });

  it('falls back to polling on EMFILE and after a watcher error', async () => {
    h = createHarness();
    const events = collect(h);
    const emfile: WatchFn = () => {
      throw Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    };
    w = createFileWatcher(h.s, { watchFn: emfile, pollIntervalMs: 80, debounceMs: 20 });
    w.watch(h.project.id, h.project.path);
    await new Promise((r) => setTimeout(r, 150)); // initial poll snapshot
    writeFileSync(join(h.root, 'polled.txt'), 'p');
    await waitFor(() => events.some((e) => e.actor === 'external' && e.paths.includes('polled.txt')));

    const emitter = new EventEmitter() as EventEmitter & { close(): void };
    let closed = false;
    emitter.close = () => {
      closed = true;
    };
    const w2 = createFileWatcher(h.s, { watchFn: () => emitter, pollIntervalMs: 80, debounceMs: 20 });
    w2.watch('prj_second', h.project.path);
    emitter.emit('error', Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }));
    expect(closed).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(join(h.root, 'after-error.txt'), 'e');
    await waitFor(() => events.some((e) => e.projectId === 'prj_second' && e.paths.includes('after-error.txt')));
    w2.unwatchAll();
  });

  it('is idempotent per root, limits the number of watched projects and stops after unwatch', async () => {
    h = createHarness();
    const events = collect(h);
    const listeners = new Map<string, (t: string, f: string | null) => void>();
    let created = 0;
    const fake: WatchFn = (root, _o, listener) => {
      created++;
      listeners.set(root, listener);
      return { close() {}, on() {} };
    };
    w = createFileWatcher(h.s, { watchFn: fake, debounceMs: 10, maxProjects: 1 });
    w.watch(h.project.id, h.project.path);
    w.watch(h.project.id, h.project.path);
    expect(created).toBe(1);
    w.watch('prj_two', h.project.path); // over the limit → ignored
    expect(created).toBe(1);
    const listener = listeners.get(h.root)!;
    listener('change', 'src/a.ts');
    listener('rename', '.a.ts.nova-0123abcd.tmp~');
    listener('change', 'build/out.js');
    await waitFor(() => events.length > 0);
    expect(events).toEqual([{ projectId: h.project.id, paths: ['src/a.ts'], actor: 'external' }]);
    w.unwatch(h.project.id);
    listener('change', 'src/b.ts');
    await new Promise((r) => setTimeout(r, 60));
    expect(events).toHaveLength(1);
  });

  it('skips archived projects and missing roots', () => {
    h = createHarness({ projectPatch: { status: 'archived' } });
    let created = 0;
    w = createFileWatcher(h.s, {
      watchFn: () => {
        created++;
        return { close() {}, on() {} };
      },
    });
    w.watch(h.project.id, h.project.path);
    w.watch('prj_missing', join(h.root, 'does-not-exist'));
    expect(created).toBe(0);
  });

  it('normalizes Windows watcher paths (platform injection)', () => {
    expect(normalizeWatchPath('src\\App.ts', 'win32')).toBe('src/App.ts');
    expect(normalizeWatchPath('node_modules\\x\\y.js', 'win32')).toBeNull();
    expect(normalizeWatchPath('Library\\ShaderCache\\a', 'win32')).toBeNull();
    expect(normalizeWatchPath('.git\\index', 'win32')).toBeNull();
    expect(normalizeWatchPath('Assets\\.Player.cs.nova-89abcdef.tmp~', 'win32')).toBeNull();
    expect(normalizeWatchPath('Assets\\Player.cs', 'win32')).toBe('Assets/Player.cs');
    expect(normalizeWatchPath('a\\b', 'linux')).toBe('a\\b');
  });
});
