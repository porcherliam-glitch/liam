import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { fakePathGuard } from '../projects/test-support';
import { encodePath, parsePreviewPath, startStaticServer, type StaticServer } from './static-server';
import { mimeType } from './mime';

let t: TestCore;
let server: StaticServer | null = null;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await server?.close();
  server = null;
  while (cleanups.length) cleanups.pop()!();
  t?.cleanup();
});

function get(port: number, path: string, opts: { host?: string; method?: string } = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: { host: opts.host ?? `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function start(): Promise<{ srv: StaticServer; dir: string; outside: string }> {
  t = createTestCore();
  const d = tempDir('nova-static-');
  cleanups.push(d.cleanup);
  const out = tempDir('nova-outside-');
  cleanups.push(out.cleanup);
  writeFileSync(join(d.dir, 'index.html'), '<html>hallo</html>');
  writeFileSync(join(d.dir, 'app.js'), 'console.log(1)');
  writeFileSync(join(d.dir, 'style.css'), 'body{}');
  writeFileSync(join(d.dir, 'secrets.json'), '{"key":"x"}');
  writeFileSync(join(d.dir, '.env'), 'API_KEY=x');
  mkdirSync(join(d.dir, 'sub'));
  writeFileSync(join(d.dir, 'sub', 'index.html'), '<p>sub</p>');
  mkdirSync(join(d.dir, 'empty'));
  mkdirSync(join(d.dir, '.git'));
  writeFileSync(join(d.dir, '.git', 'config'), '[core]');
  writeFileSync(join(out.dir, 'geheim.txt'), 'geheim');
  symlinkSync(out.dir, join(d.dir, 'link'));
  const guard = fakePathGuard();
  const srv = await startStaticServer({
    root: d.dir,
    platform: process.platform,
    log: t.core.log,
    resolve: (rel) => {
      try {
        const r = guard.resolve(d.dir, rel);
        if (guard.isProtected(d.dir, r.key) || guard.isSensitive(r.rel)) return null;
        return r.abs;
      } catch {
        return null;
      }
    },
  });
  server = srv;
  return { srv, dir: d.dir, outside: out.dir };
}

describe('static preview server', () => {
  it('serves files below the random prefix with safe headers and MIME types', async () => {
    const { srv } = await start();
    expect(srv.prefix).toMatch(/^\/p\/[0-9a-f]{32}\/$/);
    expect(srv.url('index.html')).toBe(`http://127.0.0.1:${srv.port}${srv.prefix}index.html`);
    const index = await get(srv.port, `${srv.prefix}`);
    expect(index.status).toBe(200);
    expect(index.body).toBe('<html>hallo</html>');
    expect(index.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(index.headers['x-content-type-options']).toBe('nosniff');
    expect(index.headers['cache-control']).toBe('no-store');
    expect((await get(srv.port, `${srv.prefix}app.js`)).headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect((await get(srv.port, `${srv.prefix}style.css?v=2`)).headers['content-type']).toBe('text/css; charset=utf-8');
    const head = await get(srv.port, `${srv.prefix}app.js`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe('14');
  });

  it('accepts localhost and [::1] host headers, rejects others with 421', async () => {
    const { srv } = await start();
    expect((await get(srv.port, srv.prefix, { host: `localhost:${srv.port}` })).status).toBe(200);
    expect((await get(srv.port, srv.prefix, { host: `[::1]:${srv.port}` })).status).toBe(200);
    expect((await get(srv.port, srv.prefix, { host: 'evil.example' })).status).toBe(421);
    expect((await get(srv.port, srv.prefix, { host: `127.0.0.1:${srv.port + 1}` })).status).toBe(421);
    expect((await get(srv.port, srv.prefix, { host: `192.168.0.5:${srv.port}` })).status).toBe(421);
  });

  it('only GET and HEAD', async () => {
    const { srv } = await start();
    const res = await get(srv.port, srv.prefix, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
  });

  it('never serves outside the prefix, dot-segments, hidden or sensitive files, or links out of the root', async () => {
    const { srv } = await start();
    for (const path of [
      '/index.html',
      '/p/00000000000000000000000000000000/index.html',
      `${srv.prefix}%2e%2e/%2e%2e/etc/passwd`,
      `${srv.prefix}..%2f..%2fetc%2fpasswd`,
      `${srv.prefix}.env`,
      `${srv.prefix}.git/config`,
      `${srv.prefix}secrets.json`,
      `${srv.prefix}link/geheim.txt`,
      `${srv.prefix}sub//index.html`,
      `${srv.prefix}%E0%A4%A`,
      `${srv.prefix}empty/`,
      `${srv.prefix}missing.html`,
    ]) {
      const res = await get(srv.port, path);
      expect(res.status, path).toBe(404);
    }
  });

  it('directories: redirect to a trailing slash, then index.html; no listings', async () => {
    const { srv } = await start();
    const redirect = await get(srv.port, `${srv.prefix}sub`);
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe(`${srv.prefix}sub/`);
    expect((await get(srv.port, `${srv.prefix}sub/`)).body).toBe('<p>sub</p>');
    const prefixRedirect = await get(srv.port, srv.prefix.slice(0, -1));
    expect(prefixRedirect.status).toBe(301);
  });

  it('path helpers', () => {
    expect(parsePreviewPath('a/b%20c.html')).toEqual(['a', 'b c.html']);
    expect(parsePreviewPath('')).toEqual([]);
    expect(parsePreviewPath('a/')).toEqual(['a']);
    expect(parsePreviewPath('a%5cb')).toBeNull();
    expect(parsePreviewPath('a/../b')).toBeNull();
    expect(parsePreviewPath('a%00')).toBeNull();
    expect(encodePath('sub dir/ä.html')).toBe('sub%20dir/%C3%A4.html');
    expect(mimeType('x.WASM')).toBe('application/wasm');
    expect(mimeType('noext')).toBe('application/octet-stream');
  });
});
