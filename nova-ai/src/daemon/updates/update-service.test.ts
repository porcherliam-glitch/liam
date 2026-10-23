// Tests for the UpdateService: feed handling against a real 127.0.0.1 server, host policy (no request to blocked
// hosts), redirects, failures returned as German messages, semver precedence, the daily timer and "notify once".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Notification, ProviderConfig } from '@shared/schemas';
import { UpdateInfoSchema } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { NotificationService, ProviderRegistry } from '../contracts';
import { createUpdateService, META_LAST_CHECK, META_NOTIFIED_VERSION, NO_FEED_MESSAGE, type UpdateServiceOptions } from './update-service';
import { compareSemver, parseSemver } from './semver';

let t: TestCore | null = null;
let server: Server | null = null;
afterEach(async () => {
  vi.useRealTimers();
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  t?.cleanup();
  t = null;
});

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function startServer(handler: Handler): Promise<{ url: string; hits: string[] }> {
  const hits: string[] = [];
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    handler(req, res);
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, hits };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function fakeNotifications() {
  const sent: Array<Omit<Notification, 'id' | 'ts' | 'readAt'>> = [];
  const svc: NotificationService = {
    notify(input) {
      sent.push(input);
      return { ...input, id: `ntf_${sent.length}`, ts: Date.now(), readAt: null };
    },
    list: () => [],
    markRead: () => undefined,
    unreadCount: () => 0,
    prune: () => 0,
  };
  return { svc, sent };
}

function fakeProviders(list: Partial<ProviderConfig>[] = []): ProviderRegistry {
  return { list: () => list as ProviderConfig[] } as unknown as ProviderRegistry;
}

function setup(opts: UpdateServiceOptions = {}, providers: Partial<ProviderConfig>[] = []) {
  t = createTestCore();
  const notifications = fakeNotifications();
  const s = makeServices(t.core, { notifications: notifications.svc, providers: fakeProviders(providers) });
  (t.core as { version: string }).version = '1.2.0';
  const updates = createUpdateService(s, opts);
  return { core: t.core, updates, sent: notifications.sent };
}

describe('semver', () => {
  it('parses and orders versions by semver precedence', () => {
    const v = (x: string) => parseSemver(x)!;
    expect(parseSemver('v1.2.3+build.7')).toMatchObject({ major: 1, minor: 2, patch: 3, prerelease: [], text: '1.2.3' });
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('01.2.3')).toBeNull();
    expect(parseSemver('1.2.3-')).toBeNull();
    expect(parseSemver('neueste')).toBeNull();
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.10.0', '2.0.0'];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareSemver(v(ordered[i]), v(ordered[i - 1]))).toBeGreaterThan(0);
      expect(compareSemver(v(ordered[i - 1]), v(ordered[i]))).toBeLessThan(0);
    }
    expect(compareSemver(v('1.0.0+a'), v('1.0.0+b'))).toBe(0);
  });
});

describe('UpdateService.check', () => {
  it('without a feed URL reports "Keine Update-Quelle eingerichtet." and makes no request', async () => {
    const fetchSpy = vi.fn();
    const { updates } = setup({ fetch: fetchSpy as unknown as typeof fetch });
    const info = await updates.check();
    expect(UpdateInfoSchema.parse(info)).toEqual({
      currentVersion: '1.2.0',
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      notes: null,
      checkedAt: null,
      message: NO_FEED_MESSAGE,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a newer version with link and notes (never downloads the link)', async () => {
    const srv = await startServer((req, res) => json(res, 200, { version: 'v1.3.0', url: 'https://example.org/NOVA-1.3.0.exe', notes: 'Neu:\r\n- schneller\u0007' }));
    const { updates, core, sent } = setup();
    core.settings.update({ updates: { feedUrl: `${srv.url}/feed.json` } });
    const info = await updates.check();
    expect(info).toMatchObject({ currentVersion: '1.2.0', latestVersion: '1.3.0', updateAvailable: true, downloadUrl: 'https://example.org/NOVA-1.3.0.exe', notes: 'Neu:\n- schneller' });
    expect(info.message).toContain('NOVA 1.3.0 ist verfügbar');
    expect(info.message).toContain('nie automatisch installiert');
    expect(info.checkedAt).toEqual(expect.any(Number));
    expect(srv.hits).toEqual(['/feed.json']);
    // manual check: no toast, but the version counts as known
    expect(sent).toHaveLength(0);
    expect(core.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META_NOTIFIED_VERSION])?.value).toBe('1.3.0');
    expect(JSON.parse(core.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META_LAST_CHECK])!.value)).toMatchObject({ feedUrl: `${srv.url}/feed.json` });
    expect(updates.lastInfo()).toEqual(info);
  });

  it('same or older feed versions and pre-releases of the installed version are not updates', async () => {
    let version = '1.2.0';
    const srv = await startServer((req, res) => json(res, 200, { version, url: 'http://example.org/insecure.exe' }));
    const { updates, core } = setup();
    core.settings.update({ updates: { feedUrl: `${srv.url}/f` } });
    let info = await updates.check();
    expect(info).toMatchObject({ updateAvailable: false, latestVersion: '1.2.0', downloadUrl: null });
    expect(info.message).toBe('NOVA ist auf dem neuesten Stand (Version 1.2.0).');
    version = '1.2.0-rc.1';
    expect((await updates.check()).updateAvailable).toBe(false);
    version = '1.1.9';
    expect((await updates.check()).updateAvailable).toBe(false);
    (core as { version: string }).version = '1.2.0-beta.1';
    version = '1.2.0';
    expect((await updates.check()).updateAvailable).toBe(true);
    (core as { version: string }).version = '0.0.0-dev+local';
    expect((await updates.check()).updateAvailable).toBe(true);
  });

  it('blocked hosts are never contacted; allowed hosts and provider hosts pass the host policy', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ version: '9.0.0' }), { status: 200 }));
    const { updates, core } = setup({ fetch: fetchSpy as unknown as typeof fetch }, [
      { id: 'p1', enabled: true, baseUrl: 'https://api.provider.example/v1' },
      { id: 'p2', enabled: false, baseUrl: 'https://disabled.example/v1' },
    ]);
    core.settings.update({ updates: { feedUrl: 'https://updates.example.com/nova.json' } });
    const blocked = await updates.check();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(blocked.updateAvailable).toBe(false);
    expect(blocked.message).toContain('„updates.example.com“ ist nicht freigegeben (Update-Prüfung)');
    expect(blocked.message).toContain('Einstellungen → Netzwerk');

    core.settings.update({ updates: { feedUrl: 'https://disabled.example/nova.json' } });
    await updates.check();
    expect(fetchSpy).not.toHaveBeenCalled();

    core.settings.update({ updates: { feedUrl: 'https://api.provider.example/nova.json' } });
    expect((await updates.check()).latestVersion).toBe('9.0.0');
    core.settings.update({ network: { allowedHosts: ['*.example.com'] }, updates: { feedUrl: 'https://updates.example.com/nova.json' } });
    expect((await updates.check()).latestVersion).toBe('9.0.0');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://updates.example.com/nova.json');
    expect(init.redirect).toBe('manual');
  });

  it('refuses plain http to remote hosts and URLs with credentials', async () => {
    const fetchSpy = vi.fn();
    const { updates, core } = setup({ fetch: fetchSpy as unknown as typeof fetch });
    core.settings.update({ network: { allowedHosts: ['github.com'] }, updates: { feedUrl: 'http://github.com/feed.json' } });
    expect((await updates.check()).message).toBe('Die Update-Quelle muss eine https-Adresse sein.');
    core.settings.update({ updates: { feedUrl: 'https://user:pw@github.com/feed.json' } });
    expect((await updates.check()).message).toBe('Die Adresse der Update-Quelle darf keine Zugangsdaten enthalten.');
    core.settings.update({ updates: { feedUrl: 'kein link' } });
    expect((await updates.check()).message).toBe('Die Adresse der Update-Quelle ist ungültig.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('follows redirects only to allowed hosts and at most 3 times', async () => {
    const srv = await startServer((req, res) => {
      if (req.url === '/a') {
        res.writeHead(302, { location: '/b' });
        return res.end();
      }
      if (req.url === '/b') return json(res, 200, { version: '2.0.0' });
      if (req.url === '/evil') {
        res.writeHead(301, { location: 'https://evil.example.net/feed.json' });
        return res.end();
      }
      if (req.url?.startsWith('/loop')) {
        res.writeHead(302, { location: `/loop${(req.url.length % 7) + 1}` });
        return res.end();
      }
      json(res, 404, {});
    });
    const { updates, core } = setup();
    core.settings.update({ updates: { feedUrl: `${srv.url}/a` } });
    expect((await updates.check()).latestVersion).toBe('2.0.0');
    core.settings.update({ updates: { feedUrl: `${srv.url}/evil` } });
    const evil = await updates.check();
    expect(evil.latestVersion).toBeNull();
    expect(evil.message).toContain('evil.example.net');
    core.settings.update({ updates: { feedUrl: `${srv.url}/loop` } });
    expect((await updates.check()).message).toBe('Die Update-Quelle leitet zu oft weiter.');
    expect(srv.hits.filter((h) => h.startsWith('/loop'))).toHaveLength(4);
  });

  it('returns German messages for HTTP errors, bad JSON, missing/invalid versions, oversize bodies and timeouts', async () => {
    let mode = 'http500';
    const srv = await startServer((req, res) => {
      if (mode === 'http500') return json(res, 500, { error: 'x' });
      if (mode === 'badjson') return json(res, 200, '{"version": ');
      if (mode === 'noversion') return json(res, 200, { name: 'NOVA' });
      if (mode === 'badversion') return json(res, 200, { version: 'neu' });
      if (mode === 'huge') return json(res, 200, { version: '9.9.9', notes: 'x'.repeat(5000) });
      // 'hang': never answer
    });
    const { updates, core } = setup({ timeoutMs: 300, maxBytes: 2048 });
    core.settings.update({ updates: { feedUrl: `${srv.url}/feed` } });
    const msg = async (m: string) => {
      mode = m;
      const info = await updates.check();
      expect(UpdateInfoSchema.parse(info).updateAvailable).toBe(false);
      expect(info.latestVersion).toBeNull();
      return info.message;
    };
    expect(await msg('http500')).toBe('Die Update-Quelle antwortet mit einem Fehler (HTTP 500).');
    expect(await msg('badjson')).toBe('Die Update-Quelle liefert kein gültiges JSON.');
    expect(await msg('noversion')).toContain('keine Versionsangabe');
    expect(await msg('badversion')).toContain('keine gültige Versionsnummer („neu“)');
    expect(await msg('huge')).toBe('Die Antwort der Update-Quelle ist zu groß.');
    expect(await msg('hang')).toBe('Die Update-Quelle hat nicht innerhalb von 300 Millisekunden geantwortet.');
    expect(core.db.get('SELECT value FROM meta WHERE key = ?', [META_LAST_CHECK])).toBeUndefined();
  });

  it('an unreachable feed is reported without throwing; concurrent checks share one request', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const { updates, core } = setup({ fetch: fetchImpl });
    core.settings.update({ updates: { feedUrl: 'https://github.com/nova/feed.json' } });
    const [a, b] = await Promise.all([updates.check(), updates.check()]);
    expect(calls).toBe(1);
    expect(a.message).toBe('Die Update-Quelle ist nicht erreichbar. Bitte Internetverbindung und Adresse prüfen.');
    expect(b).toEqual(a);
  });
});

describe('UpdateService timer', () => {
  const okFetch = (version: () => string) => vi.fn(async () => new Response(JSON.stringify({ version: version() }), { status: 200 }));

  it('does nothing while checkForUpdates is off', async () => {
    vi.useFakeTimers();
    const fetchSpy = okFetch(() => '2.0.0');
    const { updates, core } = setup({ fetch: fetchSpy as unknown as typeof fetch, firstCheckDelayMs: 1000, tickMs: 5000 });
    core.settings.update({ updates: { feedUrl: 'https://github.com/feed.json' } });
    updates.start();
    expect(updates.isRunning()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchSpy).not.toHaveBeenCalled();
    updates.stop();
    expect(updates.isRunning()).toBe(false);
  });

  it('checks after the start delay, at most daily, notifies once per version and stops cleanly', async () => {
    vi.useFakeTimers();
    let version = '2.0.0';
    const fetchSpy = okFetch(() => version);
    const { updates, core, sent } = setup({ fetch: fetchSpy as unknown as typeof fetch, firstCheckDelayMs: 1000, tickMs: 60_000, checkEveryMs: 10 * 60_000 });
    core.settings.update({ updates: { checkForUpdates: true, feedUrl: 'https://github.com/feed.json' } });
    updates.start();
    updates.start(); // idempotent
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ category: 'update', level: 'info', title: 'Update verfügbar', projectId: null, taskId: null });
    expect(sent[0].body).toContain('2.0.0');
    expect(sent[0].body).not.toContain('https://');

    await vi.advanceTimersByTimeAsync(5 * 60_000); // ticks, but not due yet
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6 * 60_000); // due again → same version → no second toast
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(1);

    version = '2.1.0';
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sent).toHaveLength(2);
    expect(core.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META_NOTIFIED_VERSION])?.value).toBe('2.1.0');

    updates.stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('a manual check marks the version as known, so the daily check does not repeat it', async () => {
    const fetchSpy = okFetch(() => '3.0.0');
    const { updates, core, sent } = setup({ fetch: fetchSpy as unknown as typeof fetch, checkEveryMs: 0 });
    core.settings.update({ updates: { checkForUpdates: true, feedUrl: 'https://github.com/feed.json' } });
    await updates.check();
    await updates.tickNow();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(0);
  });

  it('the daily rule survives restarts (meta), a changed feed URL is due immediately, failures wait before retrying', async () => {
    let fail = false;
    const fetchSpy = vi.fn(async () => {
      if (fail) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 });
    });
    const { updates, core } = setup({ fetch: fetchSpy as unknown as typeof fetch, retryAfterFailureMs: 60_000 });
    core.settings.update({ updates: { checkForUpdates: true, feedUrl: 'https://github.com/a.json' } });
    await updates.tickNow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const second = createUpdateService(makeServices(core, { providers: fakeProviders(), notifications: fakeNotifications().svc }), { fetch: fetchSpy as unknown as typeof fetch });
    await second.tickNow(); // checked less than 24 h ago (persisted)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    core.settings.update({ updates: { feedUrl: 'https://github.com/b.json' } });
    fail = true;
    await second.tickNow(); // other feed → due → fails
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await second.tickNow(); // within the retry wait
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('turning the setting on triggers a check a few seconds later', async () => {
    vi.useFakeTimers();
    const fetchSpy = okFetch(() => '1.0.0');
    const { updates, core } = setup({ fetch: fetchSpy as unknown as typeof fetch, firstCheckDelayMs: 3_600_000, settingsCheckDelayMs: 2000 });
    updates.start();
    core.settings.update({ updates: { checkForUpdates: true, feedUrl: 'https://github.com/feed.json' } });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    updates.stop();
  });
});
