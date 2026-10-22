// Tests for the OllamaService: status with binary detection (Windows branch via injected platform/env/fs), lastStatus,
// model list/show/ps, streaming pulls (progress, errors, cancel, concurrency, disk check), delete and the VRAM fit.
import { afterEach, describe, expect, it } from 'vitest';
import type { OllamaPull } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { startFakeOllama, type FakeOllama, type FakeOllamaModel } from '../../../tests/fakes/fake-ollama';
import { startFakeHttpServer, sendText, unusedLocalUrl } from '../../../tests/fakes/fake-http';
import { NovaError } from '../core/errors';
import type { ConcurrencyGovernor } from '../contracts';
import { createProviderRegistry, OLLAMA_LOCAL_ID } from './registry';
import { createOllamaService, type OllamaServiceOptions } from './ollama-service';
import { fakeGovernor, fakeResources, fakeSecrets, snapshotWithGpu } from './test-fakes';

let t: TestCore | null = null;
const servers: Array<{ close(): Promise<void> }> = [];
const services: Array<{ stop(): void }> = [];
afterEach(async () => {
  for (const s of services.splice(0)) s.stop();
  for (const s of servers.splice(0)) await s.close();
  t?.cleanup();
  t = null;
});

const GB = 1024 ** 3;

async function setup(o: { models?: Array<FakeOllamaModel | string>; url?: string; governor?: Partial<ConcurrencyGovernor>; service?: OllamaServiceOptions; pullStepDelayMs?: number } = {}) {
  t = createTestCore();
  const core = t.core;
  const fake: FakeOllama = await startFakeOllama({ models: o.models ?? ['qwen2.5-coder:7b'], pullStepDelayMs: o.pullStepDelayMs });
  servers.push(fake);
  const resources = fakeResources(null);
  const governor = fakeGovernor(o.governor);
  const s = makeServices(core, { secrets: fakeSecrets(), resources, governor });
  s.providers = createProviderRegistry(s);
  s.providers.ensureDefaults();
  s.providers.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: o.url ?? fake.url });
  const ollama = createOllamaService(s, { findExecutable: async () => '/usr/local/bin/ollama', pullEventIntervalMs: 0, ...o.service });
  s.ollama = ollama;
  services.push(ollama);
  const pullEvents: OllamaPull[] = [];
  const changed: string[] = [];
  core.bus.on('ollama.pull', (p) => pullEvents.push(p));
  core.bus.on('ollama.models.changed', (p) => changed.push(p.providerId));
  return { s, core, fake, ollama, resources, governor, pullEvents, changed };
}

async function until(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('ollama service – status', () => {
  it('running: version, binary path, German message; lastStatus only for the configured endpoint', async () => {
    const { ollama, fake } = await setup();
    expect(ollama.baseUrl()).toBe(fake.url);
    expect(ollama.lastStatus()).toBeNull();
    const other = await startFakeOllama({ version: '0.1.0' });
    servers.push(other);
    const tested = await ollama.status(other.url);
    expect(tested).toMatchObject({ running: true, version: '0.1.0', baseUrl: other.url });
    expect(ollama.lastStatus()).toBeNull();
    const st = await ollama.status();
    expect(st).toMatchObject({ installed: true, running: true, version: '0.12.6', binaryPath: '/usr/local/bin/ollama' });
    expect(st.message).toMatch(/^Ollama läuft \(Version 0\.12\.6\)/);
    expect(ollama.lastStatus()).toEqual(st);
  });

  it('changing the endpoint of ollama-local forgets the cached status', async () => {
    const { ollama, s } = await setup();
    await ollama.status();
    expect(ollama.lastStatus()).not.toBeNull();
    s.providers.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: 'http://127.0.0.1:1' });
    expect(ollama.lastStatus()).toBeNull();
  });

  it('Windows: finds %LOCALAPPDATA%\\Programs\\Ollama\\ollama.exe and explains how to start Ollama', async () => {
    const down = await unusedLocalUrl();
    const checked: string[] = [];
    const { ollama } = await setup({
      url: down,
      service: {
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' },
        findExecutable: async (name, platform) => {
          expect([name, platform]).toEqual(['ollama', 'win32']);
          return null;
        },
        fileExists: (p) => {
          checked.push(p);
          return p === 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
        },
      },
    });
    const st = await ollama.status();
    expect(st).toMatchObject({ installed: true, running: false, binaryPath: 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Ollama\\ollama.exe', version: null });
    expect(st.message).toContain('installiert, aber');
    expect(st.message).toContain('Startmenü');
    expect(checked[0]).toBe('C:\\Users\\Ana\\AppData\\Local\\Programs\\Ollama\\ollama.exe');
  });

  it('Windows, not installed: download link and winget command', async () => {
    const { ollama } = await setup({
      url: await unusedLocalUrl(),
      service: { platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' }, findExecutable: async () => null, fileExists: () => false },
    });
    const st = await ollama.status();
    expect(st).toMatchObject({ installed: false, running: false, binaryPath: null });
    expect(st.message).toContain('https://ollama.com/download');
    expect(st.message).toContain('winget install Ollama.Ollama');
  });

  it('Linux, not installed: no winget hint; a non-Ollama server is recognised', async () => {
    const { ollama } = await setup({ url: await unusedLocalUrl(), service: { platform: 'linux', findExecutable: async () => null, fileExists: () => false } });
    const st = await ollama.status();
    expect(st.message).toContain('https://ollama.com/download');
    expect(st.message).not.toContain('winget');
    const other = await startFakeHttpServer((_req, res) => sendText(res, 404, 'nope'));
    servers.push(other);
    const foreign = await ollama.status(other.url);
    expect(foreign.running).toBe(false);
    expect(foreign.message).toContain('kein Ollama-Server');
    await expect(ollama.status('ftp://x')).rejects.toThrow(/http/);
  });
});

describe('ollama service – models, pull, delete', () => {
  it('lists, shows and reports running models', async () => {
    const { ollama, fake } = await setup({ models: [{ name: 'qwen2.5-coder:7b', license: 'MIT License' }] });
    fake.setRunning([{ name: 'qwen2.5-coder:7b', size: 5 * GB, size_vram: 4 * GB, context_length: 8192 }]);
    expect((await ollama.models()).map((m) => m.id)).toEqual(['qwen2.5-coder:7b']);
    const shown = await ollama.show('qwen2.5-coder:7b');
    expect(shown.model).toMatchObject({ id: 'qwen2.5-coder:7b', contextLength: 32768, capabilities: ['completion', 'tools'] });
    expect(shown.license).toBe('MIT License');
    expect(shown.modelfile).toContain('FROM qwen2.5-coder:7b');
    await expect(ollama.show('missing:1b')).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await expect(ollama.show('bad name!')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await ollama.running()).toEqual([{ model: 'qwen2.5-coder:7b', sizeBytes: 5 * GB, vramBytes: 4 * GB, expiresAt: '2026-10-22T12:05:00.000000+02:00', contextLength: 8192 }]);
  });

  it('pull streams progress events and announces the new model', async () => {
    const { ollama, fake, pullEvents, changed, governor } = await setup();
    const pull = ollama.pull('llama3.2:3b');
    expect(pull).toMatchObject({ model: 'llama3.2:3b', status: 'running' });
    await until(() => pullEvents.some((p) => p.status === 'done'));
    const done = pullEvents.at(-1)!;
    expect(done).toMatchObject({ id: pull.id, status: 'done', percent: 100, phase: 'success', totalBytes: 1_000_000, completedBytes: 1_000_000 });
    expect(pullEvents.some((p) => p.phase === 'pulling manifest')).toBe(true);
    expect(pullEvents.some((p) => p.percent === 50)).toBe(true);
    expect(changed).toEqual([OLLAMA_LOCAL_ID]);
    expect(fake.models().some((m) => m.name === 'llama3.2:3b')).toBe(true);
    expect(governor.canWriteCalls).toHaveLength(1);
    expect(ollama.pulls()[0]).toMatchObject({ id: pull.id, status: 'done' });
    const body = fake.requests.find((r) => r.path === '/api/pull')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'llama3.2:3b', stream: true });
  });

  it('pull errors from Ollama end as failed with a German message', async () => {
    const { ollama, fake, pullEvents, changed } = await setup();
    fake.pullScript('nope:1b', [{ status: 'pulling manifest' }, { error: 'pull model manifest: file does not exist' }]);
    const pull = ollama.pull('nope:1b');
    await until(() => pullEvents.some((p) => p.id === pull.id && p.status === 'failed'));
    const failed = ollama.pulls().find((p) => p.id === pull.id)!;
    expect(failed.error).toMatch(/^Download fehlgeschlagen: .*file does not exist/);
    expect(changed).toEqual([]);
  });

  it('a stream that ends without success fails', async () => {
    const { ollama, fake, pullEvents } = await setup();
    fake.pullScript('cut:1b', [{ status: 'pulling manifest' }]);
    const pull = ollama.pull('cut:1b');
    await until(() => pullEvents.some((p) => p.id === pull.id && p.status === 'failed'));
    expect(ollama.pulls()[0].error).toContain('vorzeitig');
  });

  it('cancel, at most two concurrent pulls, same model returns the running pull', async () => {
    const { ollama, fake, pullEvents } = await setup();
    const slow = [{ status: 'pulling manifest' }, { status: 'pulling x', digest: 'sha256:x', total: 100, completed: 10, delayMs: 2000 }, { status: 'success' }];
    fake.pullScript('a:1b', slow);
    fake.pullScript('b:1b', slow);
    const a = ollama.pull('a:1b');
    const b = ollama.pull('b:1b');
    expect(ollama.pull('a:1b').id).toBe(a.id);
    expect(() => ollama.pull('c:1b')).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    await until(() => pullEvents.some((p) => p.id === a.id && p.phase === 'pulling manifest'));
    const cancelled = ollama.cancelPull(a.id);
    expect(cancelled.status).toBe('cancelled');
    await until(() => ollama.pulls().filter((p) => p.status === 'running').length === 1);
    expect(ollama.pulls().find((p) => p.id === a.id)).toMatchObject({ status: 'cancelled', error: null });
    expect(() => ollama.cancelPull('pull_unknown')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    ollama.cancelPull(b.id);
  });

  it('refuses a pull when the disk is full', async () => {
    const { ollama } = await setup({ governor: { canWrite: () => ({ ok: false, reason: 'Nur noch 200 MB frei.' }) } });
    expect(() => ollama.pull('x:1b')).toThrow(expect.objectContaining({ code: 'DISK_FULL', message: 'Nur noch 200 MB frei.' }));
    expect(ollama.pulls()).toEqual([]);
  });

  it('delete removes the model and emits ollama.models.changed', async () => {
    const { ollama, fake, changed } = await setup({ models: ['a:1b', 'b:1b'] });
    await ollama.delete('a:1b');
    expect(fake.models().map((m) => m.name)).toEqual(['b:1b']);
    expect(changed).toEqual([OLLAMA_LOCAL_ID]);
    await expect(ollama.delete('a:1b')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ollama service – VRAM fit', () => {
  const models: FakeOllamaModel[] = [
    { name: 'small:1b', size: Math.round(1.0 * GB), parameterSize: '1.5B' },
    { name: 'medium:7b', size: Math.round(4.5 * GB), parameterSize: '7.6B' },
    { name: 'big:14b', size: Math.round(9 * GB), parameterSize: '14B' },
    { name: 'embed:1b', size: Math.round(0.3 * GB), capabilities: ['embedding'] },
  ];

  it('size × 1.2 + KV cache against the free VRAM of the largest GPU, alternatives smallest first', async () => {
    const { ollama, resources } = await setup({ models });
    resources.set(snapshotWithGpu({ totalBytes: 8 * GB, usedBytes: 1 * GB }));
    const kv = 2 * 28 * 4 * 128 * 2 * 4096;
    const medium = await ollama.fit('medium:7b', 4096);
    expect(medium.fits).toBe(true);
    expect(medium.requiredBytes).toBe(Math.ceil(4.5 * GB * 1.2 + kv));
    expect(medium.availableBytes).toBe(7 * GB);
    expect(medium.estimated).toBe(false);
    expect(medium.message).toContain('Passt in den Grafikspeicher');
    const big = await ollama.fit('big:14b', 4096);
    expect(big.fits).toBe(false);
    expect(big.alternatives).toEqual(['small:1b', 'medium:7b']);
    expect(big.message).toContain('small:1b');
    await expect(ollama.fit('missing:1b')).rejects.toBeInstanceOf(NovaError);
  });

  it('larger contexts need more memory; estimated GPU numbers are flagged', async () => {
    const { ollama, resources } = await setup({ models });
    resources.set(snapshotWithGpu({ totalBytes: 8 * GB, usedBytes: null, estimated: true }));
    const small = await ollama.fit('medium:7b', 4096);
    const large = await ollama.fit('medium:7b', 65536);
    expect(large.requiredBytes!).toBeGreaterThan(small.requiredBytes!);
    expect(large.fits).toBe(false);
    expect(small.estimated).toBe(true);
    expect(small.message).toContain('(geschätzt)');
  });

  it('unknown without GPU data; a model already loaded in VRAM fits', async () => {
    const { ollama, resources } = await setup({ models });
    expect(await ollama.fit('big:14b')).toMatchObject({ fits: null, availableBytes: null, alternatives: [] });
    resources.set(snapshotWithGpu(null));
    expect((await ollama.fit('big:14b')).message).toContain('nvidia-smi');
    resources.set(snapshotWithGpu({ totalBytes: 12 * GB, usedBytes: 11 * GB }, [{ model: 'big:14b', sizeBytes: 9 * GB, vramBytes: 9 * GB, expiresAt: null, contextLength: 4096 }]));
    expect(await ollama.fit('big:14b')).toMatchObject({ fits: true });
  });
});
