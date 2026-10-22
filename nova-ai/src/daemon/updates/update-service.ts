// UpdateService (contract: src/daemon/contracts.ts; SPEC §4.9, §6.9; MASTERPROMPT §17): tells the user that a newer
// NOVA version exists. It NEVER downloads or installs anything – updates are installed manually after a data backup.
// Key decisions:
// - check(): settings.updates.feedUrl empty → "Keine Update-Quelle eingerichtet." Otherwise GET of a JSON document
//   {version, url, notes} with a 10 s total timeout, at most 256 KB, https only (plain http only for loopback). The
//   feed host must pass core/net assertHostAllowed with the user's allowedHosts plus the enabled providers' base URLs
//   (the feed URL itself is NOT implicitly allowed, otherwise the check would be meaningless). Redirects are followed
//   manually (≤ 3) and every hop is checked the same way. URLs with user:password are refused.
// - The version is compared with core.version by Semantic Versioning precedence (semver.ts). `url` is only reported
//   (https/loopback only) – never fetched. Expected failures (no source, blocked host, timeout, HTTP error, bad JSON)
//   are returned as UpdateInfo with a German message instead of throwing; concurrent check() calls share one request.
// - start(): when settings.updates.checkForUpdates is on, the first automatic check runs ~1 minute after start, then a
//   due-check every hour performs at most one check per 24 h (meta `update_last_check` {at, feedUrl}; a changed feed
//   URL is due immediately; after a failed attempt the next try waits 6 h). Turning the setting on triggers a check
//   a few seconds later. Timers are unref'd; stop() clears them and aborts a running request.
// - Notifications: an automatic check notifies (category 'update', generic German body with the version only) once per
//   version (meta `update_notified_version`). A manual check shows the result directly and marks the version as known
//   so the daily check does not repeat it.
import { z } from 'zod';
import type { UpdateInfo } from '@shared/schemas';
import type { Services, UpdateService } from '../contracts';
import { NovaError, errorMessage, isAbortError } from '../core/errors';
import { assertHostAllowed, hostOf, isLocalEndpoint, type HostPolicyContext } from '../core/net';
import { compareSemver, parseSemver } from './semver';

export const META_NOTIFIED_VERSION = 'update_notified_version';
export const META_LAST_CHECK = 'update_last_check';
export const NO_FEED_MESSAGE = 'Keine Update-Quelle eingerichtet.';
const PURPOSE = 'Update-Prüfung';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
const MAX_NOTES = 4000;

export interface UpdateServiceOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Total timeout of one check (default 10 s). */
  timeoutMs?: number;
  /** Delay of the first automatic check after start() (default 60 s). */
  firstCheckDelayMs?: number;
  /** Interval of the due-check (default 1 h). */
  tickMs?: number;
  /** Minimum time between automatic checks (default 24 h). */
  checkEveryMs?: number;
  /** Wait after a failed automatic attempt (default 6 h). */
  retryAfterFailureMs?: number;
  /** Delay of the check triggered by turning the setting on (default 5 s). */
  settingsCheckDelayMs?: number;
  /** Maximum size of the feed document (default 256 KB). */
  maxBytes?: number;
}

export interface UpdateServiceImpl extends UpdateService {
  /** Result of the latest check (null before the first one). */
  lastInfo(): UpdateInfo | null;
  /** Runs the automatic due-check now (tests; respects settings and the 24 h rule). Resolves when it is done. */
  tickNow(): Promise<void>;
  isRunning(): boolean;
}

const FeedSchema = z.object({
  version: z.string().min(1).max(256),
  url: z.string().max(2048).nullable().optional(),
  notes: z.string().max(200_000).nullable().optional(),
});

const LastCheckSchema = z.object({ at: z.number(), feedUrl: z.string() });

class CheckFailure extends Error {}

function cleanNotes(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  // Remove control characters except tab/newline; normalize line ends.
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text) return null;
  return text.length > MAX_NOTES ? `${text.slice(0, MAX_NOTES - 1)}…` : text;
}

/** Only https (or http on loopback) without credentials; null otherwise. */
function safeLink(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  if (u.protocol === 'https:') return u.toString();
  if (u.protocol === 'http:' && isLocalEndpoint(u.toString())) return u.toString();
  return null;
}

export function createUpdateService(s: Services, opts: UpdateServiceOptions = {}): UpdateServiceImpl {
  const core = s.core;
  const log = core.log.child('updates');
  const fetchImpl: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const firstCheckDelayMs = opts.firstCheckDelayMs ?? 60_000;
  const tickMs = Math.max(1000, opts.tickMs ?? 60 * 60_000);
  const checkEveryMs = opts.checkEveryMs ?? DAY_MS;
  const retryAfterFailureMs = opts.retryAfterFailureMs ?? 6 * 60 * 60_000;
  const settingsCheckDelayMs = Math.max(1000, opts.settingsCheckDelayMs ?? 5_000);
  const maxBytes = opts.maxBytes ?? 256 * 1024;

  let last: UpdateInfo | null = null;
  let inFlight: Promise<{ info: UpdateInfo; ok: boolean; feedUrl: string }> | null = null;
  let controller: AbortController | null = null;
  let running = false;
  let firstTimer: NodeJS.Timeout | null = null;
  let interval: NodeJS.Timeout | null = null;
  let soonTimer: NodeJS.Timeout | null = null;
  let unsubSettings: (() => void) | null = null;
  let lastFailureAt = 0;
  let ticking: Promise<void> | null = null;

  const metaGet = (key: string): string | null => {
    try {
      return core.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value ?? null;
    } catch {
      return null;
    }
  };
  const metaSet = (key: string, value: string): void => {
    try {
      core.db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
    } catch (e) {
      log.warn('Update-Status konnte nicht gespeichert werden', { error: errorMessage(e) });
    }
  };

  const hostContext = (): HostPolicyContext => {
    const allowedHosts = core.settings.section('network').allowedHosts;
    let extraUrls: string[] = [];
    try {
      extraUrls = s.providers
        .list()
        .filter((p) => p.enabled)
        .map((p) => p.baseUrl);
    } catch {
      extraUrls = [];
    }
    return { allowedHosts, extraUrls };
  };

  const info = (patch: Partial<UpdateInfo> & { message: string }): UpdateInfo => ({
    currentVersion: core.version,
    latestVersion: null,
    updateAvailable: false,
    downloadUrl: null,
    notes: null,
    checkedAt: null,
    ...patch,
  });

  /** Throws CheckFailure (German message) when the URL may not be contacted. */
  const assertTarget = (target: string, ctx: HostPolicyContext): URL => {
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      throw new CheckFailure('Die Adresse der Update-Quelle ist ungültig.');
    }
    if (u.username || u.password) throw new CheckFailure('Die Adresse der Update-Quelle darf keine Zugangsdaten enthalten.');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocalEndpoint(u.toString()))) {
      throw new CheckFailure('Die Update-Quelle muss eine https-Adresse sein.');
    }
    try {
      assertHostAllowed(u.toString(), PURPOSE, ctx);
    } catch (e) {
      if (e instanceof NovaError) throw new CheckFailure(e.userAction ? `${e.message} ${e.userAction}` : e.message);
      throw e;
    }
    return u;
  };

  const readCapped = async (res: Response, signal: AbortSignal): Promise<string> => {
    const len = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(len) && len > maxBytes) throw new CheckFailure('Die Antwort der Update-Quelle ist zu groß.');
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
        throw signal.reason ?? new Error('aborted');
      }
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new CheckFailure('Die Antwort der Update-Quelle ist zu groß.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  };

  const fetchFeed = async (feedUrl: string, signal: AbortSignal): Promise<unknown> => {
    const ctx = hostContext();
    let target = assertTarget(feedUrl, ctx).toString();
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(target, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { Accept: 'application/json', 'User-Agent': `NOVA-AI/${core.version}` },
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => undefined);
        if (hop >= MAX_REDIRECTS) throw new CheckFailure('Die Update-Quelle leitet zu oft weiter.');
        let next: string;
        try {
          next = new URL(location, target).toString();
        } catch {
          throw new CheckFailure('Die Update-Quelle leitet auf eine ungültige Adresse weiter.');
        }
        target = assertTarget(next, ctx).toString();
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        await res.body?.cancel().catch(() => undefined);
        throw new CheckFailure(`Die Update-Quelle antwortet mit einem Fehler (HTTP ${res.status}).`);
      }
      const text = await readCapped(res, signal);
      try {
        return JSON.parse(text.replace(/^﻿/, ''));
      } catch {
        throw new CheckFailure('Die Update-Quelle liefert kein gültiges JSON.');
      }
    }
  };

  const runCheck = async (): Promise<{ info: UpdateInfo; ok: boolean; feedUrl: string }> => {
    const feedUrl = core.settings.section('updates').feedUrl.trim();
    if (!feedUrl) return { info: info({ message: NO_FEED_MESSAGE }), ok: false, feedUrl };
    const ac = new AbortController();
    controller = ac;
    const timer = setTimeout(() => ac.abort(new NovaError('COMMAND_TIMEOUT', 'Zeitüberschreitung')), timeoutMs);
    timer.unref?.();
    const checkedAt = core.clock.now();
    try {
      const raw = await fetchFeed(feedUrl, ac.signal);
      const parsed = FeedSchema.safeParse(raw);
      if (!parsed.success) throw new CheckFailure('Die Update-Quelle liefert keine Versionsangabe im erwarteten Format ({"version": "…"}).');
      const latest = parseSemver(parsed.data.version);
      if (!latest) throw new CheckFailure(`Die Update-Quelle liefert keine gültige Versionsnummer („${parsed.data.version.slice(0, 40)}“).`);
      const downloadUrl = safeLink(parsed.data.url);
      const notes = cleanNotes(parsed.data.notes);
      const current = parseSemver(core.version);
      if (!current) {
        return {
          info: info({
            latestVersion: latest.text,
            downloadUrl,
            notes,
            checkedAt,
            message: `Die installierte Version („${core.version}“) lässt sich nicht vergleichen. Neueste Version laut Update-Quelle: ${latest.text}.`,
          }),
          ok: true,
          feedUrl,
        };
      }
      const available = compareSemver(latest, current) > 0;
      return {
        info: info({
          latestVersion: latest.text,
          updateAvailable: available,
          downloadUrl,
          notes,
          checkedAt,
          message: available
            ? `NOVA ${latest.text} ist verfügbar (installiert: ${current.text}). Updates werden nie automatisch installiert: bitte zuerst „Daten jetzt sichern“ wählen und das Update dann manuell installieren.`
            : `NOVA ist auf dem neuesten Stand (Version ${current.text}).`,
        }),
        ok: true,
        feedUrl,
      };
    } catch (e) {
      let message: string;
      if (e instanceof CheckFailure) message = e.message;
      else if (ac.signal.aborted && ac.signal.reason instanceof NovaError && ac.signal.reason.code === 'COMMAND_TIMEOUT') {
        const secs = Math.round(timeoutMs / 1000);
        const span = timeoutMs < 1000 ? `${timeoutMs} Millisekunden` : secs === 1 ? '1 Sekunde' : `${secs} Sekunden`;
        message = `Die Update-Quelle hat nicht innerhalb von ${span} geantwortet.`;
      } else if (ac.signal.aborted || isAbortError(e)) message = 'Die Update-Prüfung wurde abgebrochen.';
      else message = 'Die Update-Quelle ist nicht erreichbar. Bitte Internetverbindung und Adresse prüfen.';
      log.info('Update-Prüfung fehlgeschlagen', { host: hostOf(feedUrl), reason: message, error: e instanceof CheckFailure ? undefined : errorMessage(e) });
      return { info: info({ checkedAt, message }), ok: false, feedUrl };
    } finally {
      clearTimeout(timer);
      if (controller === ac) controller = null;
    }
  };

  const check = (): Promise<{ info: UpdateInfo; ok: boolean; feedUrl: string }> => {
    if (!inFlight) {
      inFlight = runCheck()
        .then((r) => {
          last = r.info;
          if (r.ok) {
            metaSet(META_LAST_CHECK, JSON.stringify({ at: r.info.checkedAt ?? core.clock.now(), feedUrl: r.feedUrl }));
            log.info('Update-Prüfung abgeschlossen', { latest: r.info.latestVersion, available: r.info.updateAvailable });
          }
          return r;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };

  const notifyOnce = (u: UpdateInfo, sendToast: boolean): void => {
    if (!u.updateAvailable || !u.latestVersion) return;
    if (metaGet(META_NOTIFIED_VERSION) === u.latestVersion) return;
    if (sendToast) {
      try {
        s.notifications.notify({
          level: 'info',
          category: 'update',
          title: 'Update verfügbar',
          body: `NOVA ${u.latestVersion} ist verfügbar. Updates werden nie automatisch installiert – bitte vorher die Daten sichern.`,
          projectId: null,
          taskId: null,
        });
      } catch (e) {
        log.warn('Update-Benachrichtigung fehlgeschlagen', { error: errorMessage(e) });
      }
    }
    metaSet(META_NOTIFIED_VERSION, u.latestVersion);
  };

  const isDue = (feedUrl: string): boolean => {
    const now = core.clock.now();
    if (lastFailureAt && now - lastFailureAt < retryAfterFailureMs) return false;
    const raw = metaGet(META_LAST_CHECK);
    if (!raw) return true;
    let parsed: z.infer<typeof LastCheckSchema>;
    try {
      const r = LastCheckSchema.safeParse(JSON.parse(raw));
      if (!r.success) return true;
      parsed = r.data;
    } catch {
      return true;
    }
    if (parsed.feedUrl !== feedUrl) return true;
    return now - parsed.at >= checkEveryMs || parsed.at > now; // clock moved backwards → check again
  };

  const tick = (): Promise<void> => {
    if (ticking) return ticking;
    ticking = (async () => {
      const st = core.settings.section('updates');
      const feedUrl = st.feedUrl.trim();
      if (!st.checkForUpdates || !feedUrl || !isDue(feedUrl)) return;
      const r = await check();
      if (r.ok) {
        lastFailureAt = 0;
        notifyOnce(r.info, true);
      } else if (r.feedUrl) {
        lastFailureAt = core.clock.now();
      }
    })()
      .catch((e) => log.warn('Automatische Update-Prüfung fehlgeschlagen', { error: errorMessage(e) }))
      .finally(() => {
        ticking = null;
      });
    return ticking;
  };

  const service: UpdateServiceImpl = {
    async check() {
      const r = await check();
      if (r.ok) notifyOnce(r.info, false);
      return { ...r.info };
    },

    start() {
      if (running) return;
      running = true;
      firstTimer = setTimeout(() => {
        firstTimer = null;
        if (running) void tick();
      }, firstCheckDelayMs);
      firstTimer.unref?.();
      interval = setInterval(() => {
        if (running) void tick();
      }, tickMs);
      interval.unref?.();
      unsubSettings = core.settings.onChange((st, changed) => {
        if (!running || !changed.includes('updates')) return;
        if (!st.updates.checkForUpdates || !st.updates.feedUrl.trim()) return;
        lastFailureAt = 0; // the user changed something: try again
        if (soonTimer) clearTimeout(soonTimer);
        soonTimer = setTimeout(() => {
          soonTimer = null;
          if (running) void tick();
        }, settingsCheckDelayMs);
        soonTimer.unref?.();
      });
    },

    stop() {
      running = false;
      for (const t of [firstTimer, soonTimer]) if (t) clearTimeout(t);
      if (interval) clearInterval(interval);
      firstTimer = null;
      soonTimer = null;
      interval = null;
      unsubSettings?.();
      unsubSettings = null;
      controller?.abort(new NovaError('CANCELLED', 'Abgebrochen.', { severity: 'warning' }));
    },

    lastInfo() {
      return last ? { ...last } : null;
    },

    tickNow() {
      return tick();
    },

    isRunning() {
      return running;
    },
  };
  return service;
}
