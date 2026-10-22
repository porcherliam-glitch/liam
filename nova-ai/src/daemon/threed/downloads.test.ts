// Tests for the 3D model downloads against a local HTTP server that imitates Hugging Face (paths-info API, resolve
// redirect with X-Linked-ETag to a CDN host, Range requests): network approval (pending → approve once/always, deny,
// allowed hosts), resume after a dropped connection and from an existing .part, sha256 and size mismatch, disk space,
// cancel, https-only redirects, missing files, and downloadModel through the service (operation + models.changed).
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { createApprovalService } from '../approvals/approval-service';
import type { Services } from '../contracts';
import { THREED_CATALOG, type CatalogFile } from './catalog';
import { downloadFiles, hostKey, type DownloadDeps, type DownloadProgress } from './downloads';
import { createThreeDHarness, homeEnv, type ThreeDHarness } from './test-support';

interface FakeHf {
  url: string;
  files: Map<string, Buffer>;
  /** sha256 reported by paths-info per repo path (null = API answers 500). */
  sha: Map<string, string | null>;
  /** Close the connection after this many bytes of the next file response. */
  cutAfter: number | null;
  /** Delay between 16 KiB chunks (ms). */
  chunkDelayMs: number;
  /** Override the size the server reports in paths-info / X-Linked-Size. */
  reportedSize: Map<string, number>;
  redirectTo: string;
  ranges: string[];
  requests: string[];
  close(): Promise<void>;
}

async function startFakeHf(): Promise<FakeHf> {
  const state: Omit<FakeHf, 'url' | 'close'> = {
    files: new Map(),
    sha: new Map(),
    cutAfter: null,
    chunkDelayMs: 0,
    reportedSize: new Map(),
    redirectTo: 'https://us.aws.cdn.hf.co/xet-bridge-us',
    ranges: [],
    requests: [],
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      state.requests.push(`${req.method} ${url.pathname}`);
      const paths = /^\/api\/models\/(.+)\/paths-info\/main$/.exec(url.pathname);
      if (req.method === 'POST' && paths) {
        const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        const p = body.get('paths') ?? '';
        const sha = state.sha.has(p) ? state.sha.get(p) : undefined;
        const name = p.split('/').pop() ?? '';
        const data = state.files.get(name);
        if (sha === null || !data) {
          res.writeHead(500).end('nope');
          return;
        }
        const size = state.reportedSize.get(name) ?? data.length;
        const json = JSON.stringify([{ type: 'file', oid: 'x', size, lfs: { oid: sha ?? createHash('sha256').update(data).digest('hex'), size, pointerSize: 134 }, path: p }]);
        res.writeHead(200, { 'content-type': 'application/json' }).end(json);
        return;
      }
      const resolve = /^\/(.+)\/resolve\/main\/(.+)$/.exec(url.pathname);
      if (req.method === 'GET' && resolve) {
        const name = resolve[2].split('/').pop() ?? '';
        const data = state.files.get(name);
        if (!data) {
          res.writeHead(404).end('Entry not found');
          return;
        }
        res.writeHead(302, {
          location: `${state.redirectTo}/${encodeURIComponent(name)}`,
          'x-linked-etag': `"${createHash('sha256').update(data).digest('hex')}"`,
          'x-linked-size': String(state.reportedSize.get(name) ?? data.length),
        });
        res.end();
        return;
      }
      const cdn = /^\/cdn\/.+\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && cdn) {
        const name = decodeURIComponent(cdn[1]);
        const data = state.files.get(name);
        if (!data) {
          res.writeHead(404).end();
          return;
        }
        const range = req.headers.range;
        let start = 0;
        if (range) {
          state.ranges.push(range);
          start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
          if (start >= data.length) {
            res.writeHead(416, { 'content-range': `bytes */${data.length}` }).end();
            return;
          }
          res.writeHead(206, { 'content-length': data.length - start, 'content-range': `bytes ${start}-${data.length - 1}/${data.length}`, 'accept-ranges': 'bytes' });
        } else {
          res.writeHead(200, { 'content-length': data.length, 'accept-ranges': 'bytes' });
        }
        const cut = state.cutAfter;
        state.cutAfter = null;
        let sent = 0;
        for (let off = start; off < data.length; off += 16 * 1024) {
          const piece = data.subarray(off, Math.min(data.length, off + 16 * 1024));
          if (cut !== null && sent + piece.length > cut) {
            res.write(piece.subarray(0, cut - sent));
            await new Promise((r) => setTimeout(r, 20));
            res.destroy();
            return;
          }
          if (res.destroyed) return;
          res.write(piece);
          sent += piece.length;
          if (state.chunkDelayMs) await new Promise((r) => setTimeout(r, state.chunkDelayMs));
        }
        res.end();
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return Object.assign(state, {
    url: base,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  });
}

/** fetch that routes the Hugging Face hosts to the local fake (the logical https URLs stay visible to the downloader). */
function routedFetch(hf: FakeHf): typeof fetch {
  return ((input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    let target: string;
    if (u.hostname === 'huggingface.co') target = `${hf.url}${u.pathname}${u.search}`;
    else if (u.hostname.endsWith('.hf.co') || u.hostname === 'evil.example.com') target = `${hf.url}/cdn/${u.hostname}${u.pathname}${u.search}`;
    else if (u.protocol === 'http:') target = `${hf.url}/cdn/plain${u.pathname}`;
    else throw new Error(`unexpected host in test: ${u.hostname}`);
    return fetch(target, init);
  }) as typeof fetch;
}

function file(name: string, size: number, folder = 'vae'): { spec: CatalogFile; data: Buffer } {
  const data = Buffer.alloc(size);
  for (let i = 0; i < size; i++) data[i] = (i * 31 + name.length) & 0xff;
  return {
    data,
    spec: { key: `${folder}/${name}`, folder, name, repo: 'Comfy-Org/Test', repoPath: `${folder}/${name}`, url: `https://huggingface.co/Comfy-Org/Test/resolve/main/${folder}/${name}`, sizeBytes: size, sha256: null },
  };
}

let t: TestCore | null = null;
let hf: FakeHf | null = null;
let models: { dir: string; cleanup(): void } | null = null;
let harness: ThreeDHarness | null = null;
afterEach(async () => {
  await hf?.close();
  hf = null;
  t?.cleanup();
  t = null;
  models?.cleanup();
  models = null;
  if (harness) {
    await harness.svc.shutdown();
    harness.cleanup();
  }
  harness = null;
});

async function setup(free: number | null = 1e15) {
  t = createTestCore();
  hf = await startFakeHf();
  models = tempDir('nova-dl-');
  const s: Services = makeServices(t.core, {});
  s.approvals = createApprovalService(s);
  const deps: DownloadDeps = { s, fetch: routedFetch(hf), freeBytes: async () => free, retryDelaysMs: [0, 0], progressIntervalMs: 0, idleTimeoutMs: 5000 };
  const progress: DownloadProgress[] = [];
  const run = (files: CatalogFile[], signal = new AbortController().signal) =>
    downloadFiles(deps, { files, modelsDir: models!.dir, title: 'Testmodell', signal, onProgress: (p) => progress.push(p) });
  return { s, deps, progress, run, core: t.core };
}

async function waitForPending(s: Services): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const p = s.approvals.list({ status: 'pending' });
    if (p.length) return p[0].id;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no pending approval');
}

describe('downloads – network approval', () => {
  it('waits for the Hugging Face approval, downloads via the CDN redirect and verifies sha256; once = ask again next time', async () => {
    const { s, run, progress } = await setup();
    const a = file('a.safetensors', 100_000);
    hf!.files.set('a.safetensors', a.data);
    const p = run([a.spec]);
    const id = await waitForPending(s);
    const approval = s.approvals.get(id)!;
    expect(approval).toMatchObject({ kind: 'network', projectId: null, taskId: null });
    expect(approval.action).toContain('huggingface.co');
    expect(approval.action).toContain('*.hf.co');
    expect(progress.some((x) => x.message.includes('Freigabe'))).toBe(true);
    s.approvals.decide(id, 'approve', 'once');
    expect(await p).toEqual({ downloaded: ['vae/a.safetensors'] });
    expect(readFileSync(join(models!.dir, 'vae', 'a.safetensors')).equals(a.data)).toBe(true);
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors.part'))).toBe(false);
    expect(progress.at(-1)?.percent).toBeGreaterThan(99);
    // The CDN host of the redirect is covered by the same decision (one approval only).
    expect(s.approvals.list().length).toBe(1);
    // once → the next download asks again; "always" creates a rule.
    const b = file('b.safetensors', 1000);
    hf!.files.set('b.safetensors', b.data);
    const p2 = run([b.spec]);
    const id2 = await waitForPending(s);
    expect(id2).not.toBe(id);
    s.approvals.decide(id2, 'approve', 'always');
    await p2;
    const c = file('c.safetensors', 1000);
    hf!.files.set('c.safetensors', c.data);
    await run([c.spec]);
    expect(s.approvals.list({ status: 'pending' })).toHaveLength(0);
    expect(s.approvals.rules()).toHaveLength(1);
  });

  it('a denial ends the download with NETWORK_BLOCKED; allowed hosts need no approval', async () => {
    const { s, run, core } = await setup();
    const a = file('a.safetensors', 1000);
    hf!.files.set('a.safetensors', a.data);
    const p = run([a.spec]);
    s.approvals.decide(await waitForPending(s), 'deny', 'once');
    await expect(p).rejects.toMatchObject({ code: 'NETWORK_BLOCKED', message: expect.stringContaining('abgelehnt') });
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors'))).toBe(false);
    core.settings.update({ network: { allowedHosts: [...core.settings.section('network').allowedHosts, 'huggingface.co', '*.hf.co'] } });
    await run([a.spec]);
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors'))).toBe(true);
    expect(s.approvals.list({ status: 'pending' })).toHaveLength(0);
    expect(hostKey('cdn-lfs.huggingface.co')).toBe('huggingface.co');
    expect(hostKey('us.aws.cdn.hf.co')).toBe('huggingface.co');
    expect(hostKey('Example.org')).toBe('example.org');
  });

  it('refuses redirects to plain http and asks separately for foreign hosts', async () => {
    const { s, run, core } = await setup();
    core.settings.update({ network: { allowedHosts: ['huggingface.co', '*.hf.co'] } });
    const a = file('a.safetensors', 1000);
    hf!.files.set('a.safetensors', a.data);
    hf!.redirectTo = 'http://cdn.hf.co/plain';
    await expect(run([a.spec])).rejects.toMatchObject({ code: 'NETWORK_BLOCKED', message: expect.stringContaining('https') });
    hf!.redirectTo = 'https://evil.example.com/files';
    const p = run([a.spec]);
    const id = await waitForPending(s);
    expect(s.approvals.get(id)?.action).toContain('evil.example.com');
    s.approvals.decide(id, 'deny', 'once');
    await expect(p).rejects.toMatchObject({ code: 'NETWORK_BLOCKED' });
  });
});

describe('downloads – transfer', () => {
  async function allowed() {
    const ctx = await setup();
    ctx.core.settings.update({ network: { allowedHosts: ['huggingface.co', '*.hf.co'] } });
    return ctx;
  }

  it('resumes after a dropped connection with an HTTP range request', async () => {
    const { run } = await allowed();
    const a = file('a.safetensors', 200_000);
    hf!.files.set('a.safetensors', a.data);
    hf!.cutAfter = 70_000;
    await run([a.spec]);
    expect(readFileSync(join(models!.dir, 'vae', 'a.safetensors')).equals(a.data)).toBe(true);
    expect(hf!.ranges).toHaveLength(1);
    expect(Number(/bytes=(\d+)-/.exec(hf!.ranges[0])![1])).toBeGreaterThan(0);
  });

  it('continues an existing .part file and verifies the whole file', async () => {
    const { run } = await allowed();
    const a = file('a.safetensors', 120_000);
    hf!.files.set('a.safetensors', a.data);
    mkdirSync(join(models!.dir, 'vae'), { recursive: true });
    writeFileSync(join(models!.dir, 'vae', 'a.safetensors.part'), a.data.subarray(0, 50_000));
    await run([a.spec]);
    expect(hf!.ranges).toEqual(['bytes=50000-']);
    expect(readFileSync(join(models!.dir, 'vae', 'a.safetensors')).equals(a.data)).toBe(true);
    // A complete .part is only verified and renamed (416 from the server).
    const b = file('b.safetensors', 5000);
    hf!.files.set('b.safetensors', b.data);
    writeFileSync(join(models!.dir, 'vae', 'b.safetensors.part'), b.data);
    await run([b.spec]);
    expect(readFileSync(join(models!.dir, 'vae', 'b.safetensors')).equals(b.data)).toBe(true);
  });

  it('rejects a sha256 mismatch and deletes the broken file; falls back to the size without sha', async () => {
    const { run } = await allowed();
    const a = file('a.safetensors', 10_000);
    hf!.files.set('a.safetensors', a.data);
    hf!.sha.set('vae/a.safetensors', 'f'.repeat(64));
    await expect(run([a.spec])).rejects.toMatchObject({ code: 'PROVIDER_ERROR', message: expect.stringContaining('Prüfsumme') });
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors.part'))).toBe(false);
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors'))).toBe(false);
    // API down → X-Linked-ETag of the redirect is used.
    hf!.sha.set('vae/a.safetensors', null);
    await run([a.spec]);
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors'))).toBe(true);
  });

  it('rejects a file larger than announced (size check)', async () => {
    const { run } = await allowed();
    const a = file('a.safetensors', 40_000);
    hf!.files.set('a.safetensors', a.data);
    hf!.sha.set('vae/a.safetensors', null);
    hf!.reportedSize.set('a.safetensors', 20_000);
    await expect(run([a.spec])).rejects.toMatchObject({ code: 'PROVIDER_ERROR', message: expect.stringContaining('falsche Größe') });
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors.part'))).toBe(false);
  });

  it('checks the free disk space for the remaining bytes + 1 GB before downloading', async () => {
    const { run } = await setup(500_000_000);
    const a = file('a.safetensors', 1000);
    hf!.files.set('a.safetensors', a.data);
    await expect(run([{ ...a.spec, sizeBytes: 5_000_000_000 }])).rejects.toMatchObject({ code: 'DISK_FULL', message: expect.stringContaining('Speicherplatz') });
    expect(hf!.requests).toHaveLength(0);
  });

  it('cancel keeps the .part for a later resume', async () => {
    const { run } = await allowed();
    const a = file('a.safetensors', 400_000);
    hf!.files.set('a.safetensors', a.data);
    hf!.chunkDelayMs = 20;
    const ac = new AbortController();
    const p = run([a.spec], ac.signal);
    for (let i = 0; i < 200 && !existsSync(join(models!.dir, 'vae', 'a.safetensors.part')); i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 60));
    ac.abort(new Error('abgebrochen'));
    await expect(p).rejects.toBeTruthy();
    expect(existsSync(join(models!.dir, 'vae', 'a.safetensors'))).toBe(false);
    expect(statSync(join(models!.dir, 'vae', 'a.safetensors.part')).size).toBeGreaterThan(0);
  });

  it('reports files that are no longer on Hugging Face', async () => {
    const { run } = await allowed();
    const a = file('fehlt.safetensors', 10);
    await expect(run([a.spec])).rejects.toMatchObject({ code: 'PROVIDER_ERROR', message: expect.stringContaining('HTTP 404') });
  });

  it('skips files that are already present', async () => {
    const { run } = await allowed();
    const a = file('a.safetensors', 10);
    mkdirSync(join(models!.dir, 'vae'), { recursive: true });
    writeFileSync(join(models!.dir, 'vae', 'a.safetensors'), 'schon da');
    expect(await run([a.spec])).toEqual({ downloaded: [] });
    expect(hf!.requests).toHaveLength(0);
  });
});

describe('ThreeDService.downloadModel', () => {
  it('runs as operation threed_download with progress and emits threed.models.changed', async () => {
    hf = await startFakeHf();
    harness = createThreeDHarness({ installed: ['trellis2'], service: { freeBytes: async () => 1e15, downloadRetryDelaysMs: [0, 0] } });
    // Serve tiny stand-ins for the real Z-Image files (sha/size come from the fake API, so they verify).
    for (const f of THREED_CATALOG.find((m) => m.id === 'z_image_turbo')!.files) hf.files.set(f.name, Buffer.from(`inhalt ${f.name}`));
    harness.t.core.settings.update({ network: { allowedHosts: ['huggingface.co', '*.hf.co'] } });
    const svc = (await import('./threed-service')).createThreeDService(harness.s, {
      platform: process.platform,
      env: homeEnv(harness.home.dir),
      clientFactory: harness.comfy.factory,
      fetch: routedFetch(hf),
      freeBytes: async () => 1e15,
      downloadRetryDelaysMs: [0, 0],
    });
    const ops: Array<{ status: string; progress: number | null; kind: string }> = [];
    harness.t.core.bus.on('operation.updated', (o) => ops.push({ status: o.status, progress: o.progress, kind: o.kind }));
    const op = svc.downloadModel('z_image_turbo');
    expect(op).toMatchObject({ kind: 'threed_download', title: '3D-Modell „Z-Image Turbo“ herunterladen', status: 'running', cancellable: true });
    expect(svc.downloadModel('z_image_turbo').id).toBe(op.id); // same model → same operation
    for (let i = 0; i < 300 && !ops.some((o) => o.status === 'done'); i++) await new Promise((r) => setTimeout(r, 10));
    expect(ops.at(-1)).toMatchObject({ status: 'done', progress: 100, kind: 'threed_download' });
    for (let i = 0; i < 100 && harness.events.modelsChanged === 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(harness.events.modelsChanged).toBeGreaterThan(0);
    expect((await svc.models()).find((m) => m.id === 'z_image_turbo')?.installed).toBe(true);
    expect(readFileSync(join(harness.models.dir, 'text_encoders', 'qwen_3_4b_fp8_mixed.safetensors'), 'utf8')).toBe('inhalt qwen_3_4b_fp8_mixed.safetensors');
  });
});
