import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppProtocolHandler, mimeTypeFor, resolveRendererPath } from './app-protocol';

describe('resolveRendererPath', () => {
  const root = '/srv/renderer';

  it('maps / to index.html and nested assets', () => {
    expect(resolveRendererPath(root, 'app://nova/')).toEqual({ ok: true, file: '/srv/renderer/index.html' });
    expect(resolveRendererPath(root, 'app://nova/index.html')).toEqual({ ok: true, file: '/srv/renderer/index.html' });
    expect(resolveRendererPath(root, 'app://nova/assets/index-abc.js?x=1#y')).toEqual({ ok: true, file: '/srv/renderer/assets/index-abc.js' });
    expect(resolveRendererPath(root, 'app://nova/assets/a%20b.css')).toEqual({ ok: true, file: '/srv/renderer/assets/a b.css' });
  });

  it('rejects traversal, encoded separators, drive letters and other hosts', () => {
    // The WHATWG URL parser removes ".." and "%2e%2e" dot segments itself: the result stays inside the root.
    expect(resolveRendererPath(root, 'app://nova/../secret.txt')).toEqual({ ok: true, file: '/srv/renderer/secret.txt' });
    expect(resolveRendererPath(root, 'app://nova/%2e%2e/secret.txt')).toEqual({ ok: true, file: '/srv/renderer/secret.txt' });
    expect(resolveRendererPath(root, 'app://nova/assets/%2e%2e%2f%2e%2e%2fetc/passwd')).toEqual({ ok: false, status: 403 });
    expect(resolveRendererPath(root, 'app://nova/..%5C..%5Cwindows')).toEqual({ ok: false, status: 400 });
    expect(resolveRendererPath(root, 'app://nova/C:%5Cx')).toEqual({ ok: false, status: 400 });
    expect(resolveRendererPath(root, 'app://nova/a%00b')).toEqual({ ok: false, status: 400 });
    expect(resolveRendererPath(root, 'app://nova/%E0%A4%A')).toEqual({ ok: false, status: 400 });
    expect(resolveRendererPath(root, 'app://other/index.html')).toEqual({ ok: false, status: 404 });
    expect(resolveRendererPath(root, 'https://nova/index.html')).toEqual({ ok: false, status: 404 });
    expect(resolveRendererPath(root, 'not-a-url')).toEqual({ ok: false, status: 400 });
  });

  it('the URL parser already collapses plain ".." so the result stays inside the root', () => {
    const r = resolveRendererPath(root, 'app://nova/../../etc/passwd');
    expect(r).toEqual({ ok: true, file: '/srv/renderer/etc/passwd' });
  });
});

describe('mimeTypeFor', () => {
  it('knows the types the renderer needs', () => {
    expect(mimeTypeFor('index.html')).toBe('text/html; charset=utf-8');
    expect(mimeTypeFor('a.JS')).toBe('text/javascript; charset=utf-8');
    expect(mimeTypeFor('editor.worker.mjs')).toBe('text/javascript; charset=utf-8');
    expect(mimeTypeFor('x.css')).toBe('text/css; charset=utf-8');
    expect(mimeTypeFor('x.woff2')).toBe('font/woff2');
    expect(mimeTypeFor('x.wasm')).toBe('application/wasm');
    expect(mimeTypeFor('x.svg')).toBe('image/svg+xml');
    expect(mimeTypeFor('x.unknown')).toBe('application/octet-stream');
  });
});

describe('createAppProtocolHandler', () => {
  let dir: string;
  let root: string;
  const csp = "default-src 'self'";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nova-proto-'));
    root = join(dir, 'renderer');
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><p>NOVA</p>');
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(dir, 'secret.txt'), 'geheim');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('serves files with MIME type, CSP and security headers', async () => {
    const handler = createAppProtocolHandler({ root, csp });
    const res = await handler(new Request('app://nova/index.html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(csp);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toContain('NOVA');
    const js = await handler(new Request('app://nova/assets/app.js'));
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await js.text()).toBe('console.log(1)');
  });

  it('HEAD without body, other methods 405, missing files 404, directories 404', async () => {
    const handler = createAppProtocolHandler({ root, csp });
    const head = await handler(new Request('app://nova/index.html', { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String('<!doctype html><p>NOVA</p>'.length));
    expect(await head.text()).toBe('');
    const post = await handler(new Request('app://nova/index.html', { method: 'POST', body: 'x' }));
    expect(post.status).toBe(405);
    expect((await handler(new Request('app://nova/nope.js'))).status).toBe(404);
    expect((await handler(new Request('app://nova/assets'))).status).toBe(404);
  });

  it('never serves files outside the root (encoded traversal, symlinks)', async () => {
    const handler = createAppProtocolHandler({ root, csp });
    const dotted = await handler(new Request('app://nova/%2e%2e/secret.txt'));
    expect(dotted.status).toBe(404); // normalised to <root>/secret.txt, which does not exist
    expect((await handler(new Request('app://nova/assets/%2e%2e%2f%2e%2e%2fsecret.txt'))).status).toBe(403);
    symlinkSync(join(dir, 'secret.txt'), join(root, 'assets', 'link.txt'));
    const viaLink = await handler(new Request('app://nova/assets/link.txt'));
    expect(viaLink.status).toBe(403);
    expect(await viaLink.text()).not.toContain('geheim');
  });

  it('maps file system errors to safe status codes', async () => {
    const eacces = Object.assign(new Error('denied'), { code: 'EACCES' });
    const handler = createAppProtocolHandler({
      root,
      csp,
      fs: {
        stat: async () => {
          throw eacces;
        },
        readFile: async () => Buffer.from(''),
        realpath: async (p: string) => p,
      } as never,
    });
    expect((await handler(new Request('app://nova/index.html'))).status).toBe(403);
  });
});
