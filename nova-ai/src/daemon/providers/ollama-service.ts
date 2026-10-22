// OllamaService: local model management for the "Modelle" page – status with binary detection and German fix
// instructions, model list/details, streaming pulls with progress events and cancel, delete, loaded models (/api/ps)
// and the VRAM fit estimate (SPEC §4.2 OllamaService, §6.2).
// Key decisions:
// - The endpoint is the base URL of provider row "ollama-local" (single source of truth). status(baseUrl) tests a
//   candidate URL without saving; lastStatus is only updated for the configured endpoint.
// - Binary detection: findExecutable('ollama') (where.exe / command -v), on Windows additionally the default install
//   path %LOCALAPPDATA%\Programs\Ollama\ollama.exe. Cached 60 s. Platform, lookup and file checks are injectable so
//   the Windows branch is unit-tested on Linux.
// - Pulls: at most 2 at the same time (a third is rejected with CONFLICT; pulling a model that is already being
//   pulled returns the running pull), governor.canWrite on the Ollama models folder before starting, progress
//   aggregated over all layers, events throttled to ≥ 250 ms, idle timeout 10 min, cancel via AbortController,
//   'ollama.models.changed' after success. Finished pulls are kept for 1 h (max 50).
// - Disk space during a pull (local Ollama only): as soon as Ollama reports layer sizes, and again at most every 5 s,
//   free space on the models drive must cover the bytes still to download (of all running pulls) plus
//   settings.resources.minFreeDiskMb; otherwise the pull is stopped with DISK_FULL before the drive runs full.
// - fit(): required ≈ size × 1.2 + KV cache (2 × layers × KV heads × head dim × 2 bytes × num_ctx; 64 KiB per token
//   when the model metadata is missing), available = free VRAM of the GPU with the largest VRAM plus the VRAM held by
//   loaded Ollama models (the model itself and others – Ollama unloads idle models when a new one needs the space),
//   capped at the GPU total, from a fresh resources.sample(). fits=null without GPU data. A model already fully loaded in VRAM fits. estimated=true
//   when GPU numbers or model metadata are estimates. Alternatives: installed completion models that fit, smallest
//   first.
// - lastStatus() never touches the network; a 60 s background refresh (unref'd timer) runs after start() or the first
//   lastStatus() call.
import { existsSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import { join, win32 } from 'node:path';
import type { ModelInfo, OllamaPull, OllamaRunningModel, OllamaStatus } from '@shared/schemas';
import type { OllamaFit, OllamaService, Services } from '../contracts';
import { NovaError, conflict, errorMessage, isAbortError, notFound } from '../core/errors';
import { findExecutable as coreFindExecutable } from '../core/exec';
import { newId } from '../core/ids';
import { isLocalEndpoint } from '../core/net';
import { redactString } from '../core/redact';
import { defaultDiskDeps, diskUsage } from '../resources/disk';
import { providerErrorDetails, providerFetch } from './http';
import {
  DEFAULT_OLLAMA_URL,
  OllamaApi,
  assertModelName,
  forgetOllamaDetails,
  listOllamaModels,
  sameOllamaModel,
  showModelInfo,
  type OllamaModelDetail,
} from './ollama-api';
import { OLLAMA_LOCAL_ID } from './registry';

export interface OllamaServiceOptions {
  platform?: NodeJS.Platform;
  findExecutable?: (name: string, platform: NodeJS.Platform) => Promise<string | null>;
  fileExists?: (path: string) => boolean;
  env?: Record<string, string | undefined>;
  homedir?: () => string;
  fetch?: typeof fetch;
  /** Background status refresh interval (default 60 s). */
  statusIntervalMs?: number;
  /** Abort a pull when no data arrived for this long (default 10 min). */
  pullIdleTimeoutMs?: number;
  /** Minimum time between two progress events of one pull (default 250 ms). */
  pullEventIntervalMs?: number;
  /** Free space of the drive holding a path (default: statfs); null = unknown. */
  diskFree?: (path: string) => { path: string; freeBytes: number } | null;
  /** Minimum time between two disk-space checks of a running pull (default 5 s; new layer sizes are checked at once). */
  pullDiskCheckIntervalMs?: number;
}

export interface OllamaServiceImpl extends OllamaService {
  /** Immediate background status check + refresh every 60 s. */
  start(): void;
  /** Stops the background refresh and cancels running pulls. */
  stop(): void;
}

const MAX_CONCURRENT_PULLS = 2;
const KV_FALLBACK_BYTES_PER_TOKEN = 64 * 1024;
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

interface PullEntry {
  pull: OllamaPull;
  controller: AbortController;
  cancelRequested: boolean;
  /** Bytes still to download over all layers Ollama has announced so far. */
  remainingBytes: number;
}

export function formatGb(bytes: number): string {
  return `${(bytes / GiB).toFixed(1).replace('.', ',')} GB`;
}

/** KV cache bytes for a context size (f16 keys + values). */
export function kvCacheBytes(detail: Pick<OllamaModelDetail, 'kv'>, numCtx: number): { bytes: number; estimated: boolean } {
  if (!detail.kv) return { bytes: numCtx * KV_FALLBACK_BYTES_PER_TOKEN, estimated: true };
  const { layers, kvHeads, headDim } = detail.kv;
  return { bytes: Math.ceil(2 * layers * kvHeads * headDim * 2 * numCtx), estimated: false };
}

export function requiredVramBytes(detail: Pick<OllamaModelDetail, 'kv' | 'info'>, numCtx: number): { bytes: number | null; estimated: boolean } {
  const size = detail.info.sizeBytes;
  if (size === null || size <= 0) return { bytes: null, estimated: true };
  const kv = kvCacheBytes(detail, numCtx);
  return { bytes: Math.ceil(size * 1.2 + kv.bytes), estimated: kv.estimated };
}

export function createOllamaService(s: Services, options: OllamaServiceOptions = {}): OllamaServiceImpl {
  const core = s.core;
  const log = core.log.child('ollama');
  const fetchImpl = options.fetch ?? providerFetch;
  const platform = () => options.platform ?? core.platform;
  const env = () => options.env ?? process.env;
  const fileExists = options.fileExists ?? ((p: string) => existsSync(p));
  const find = options.findExecutable ?? coreFindExecutable;
  const home = options.homedir ?? osHomedir;
  const idleTimeout = options.pullIdleTimeoutMs ?? 10 * 60_000;
  const eventInterval = options.pullEventIntervalMs ?? 250;
  const diskCheckInterval = options.pullDiskCheckIntervalMs ?? 5_000;
  const diskFree = options.diskFree ?? ((p: string) => diskUsage(p, defaultDiskDeps(process.platform)));
  const pulls = new Map<string, PullEntry>();
  let last: OllamaStatus | null = null;
  let binaryCache: { at: number; path: string | null } | null = null;
  let statusTimer: NodeJS.Timeout | null = null;
  let statusInflight: Promise<OllamaStatus> | null = null;

  // A changed endpoint makes the cached status meaningless: forget it and re-check in the background.
  core.bus.on('provider.updated', (cfg) => {
    if (cfg.id !== OLLAMA_LOCAL_ID || !last || last.baseUrl === cfg.baseUrl) return;
    last = null;
    if (statusTimer) refreshInBackground();
  });

  const baseUrl = (): string => {
    try {
      return s.providers.getConfig(OLLAMA_LOCAL_ID)?.baseUrl ?? DEFAULT_OLLAMA_URL;
    } catch {
      return DEFAULT_OLLAMA_URL;
    }
  };

  const api = (url = baseUrl()) => new OllamaApi(url, fetchImpl, OLLAMA_LOCAL_ID);

  const snapshot = (e: PullEntry): OllamaPull => ({ ...e.pull });

  const emitPull = (e: PullEntry) => core.bus.emit('ollama.pull', snapshot(e));

  const prunePulls = () => {
    const cutoff = core.clock.now() - 60 * 60_000;
    const finished = [...pulls.values()].filter((p) => p.pull.status !== 'running').sort((a, b) => b.pull.updatedAt - a.pull.updatedAt);
    finished.forEach((p, i) => {
      if (p.pull.updatedAt < cutoff || i >= 50) pulls.delete(p.pull.id);
    });
  };

  const detectBinary = async (): Promise<string | null> => {
    if (binaryCache && Date.now() - binaryCache.at < 60_000) return binaryCache.path;
    const plat = platform();
    let path: string | null = null;
    try {
      path = await find('ollama', plat);
    } catch {
      path = null;
    }
    if (!path) {
      const candidates: string[] = [];
      if (plat === 'win32') {
        const local = env().LOCALAPPDATA;
        if (local) candidates.push(win32.join(local, 'Programs', 'Ollama', 'ollama.exe'));
        const programFiles = env().ProgramFiles;
        if (programFiles) candidates.push(win32.join(programFiles, 'Ollama', 'ollama.exe'));
      } else if (plat === 'darwin') {
        candidates.push('/Applications/Ollama.app/Contents/Resources/ollama', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama');
      } else {
        candidates.push('/usr/local/bin/ollama', '/usr/bin/ollama');
      }
      path = candidates.find((c) => fileExists(c)) ?? null;
    }
    binaryCache = { at: Date.now(), path };
    return path;
  };

  const statusMessage = (installed: boolean, running: boolean, version: string | null, url: string, notOllama: boolean): string => {
    const plat = platform();
    if (running) {
      const base = `Ollama läuft (Version ${version ?? 'unbekannt'}) unter ${url}.`;
      return installed ? base : `${base} Die Programmdatei wurde auf diesem PC nicht gefunden – Ollama läuft vermutlich unter einem anderen Pfad.`;
    }
    if (notOllama) return `Unter ${url} antwortet ein anderes Programm, aber kein Ollama-Server. Bitte die Adresse unter „Modelle“ prüfen.`;
    const installHint =
      plat === 'win32'
        ? 'Bitte Ollama von https://ollama.com/download installieren oder im Terminal „winget install Ollama.Ollama“ ausführen.'
        : 'Bitte Ollama von https://ollama.com/download installieren.';
    const otherUrl = url !== DEFAULT_OLLAMA_URL ? ' Falls Ollama unter einer anderen Adresse läuft, bitte die Adresse unter „Modelle“ anpassen.' : '';
    if (!installed) return `Ollama ist nicht installiert und unter ${url} nicht erreichbar. ${installHint} Danach Ollama starten.${otherUrl}`;
    const startHint =
      plat === 'win32'
        ? 'Bitte Ollama über das Startmenü starten (oder im Terminal „ollama serve“ ausführen).'
        : 'Bitte Ollama starten (zum Beispiel im Terminal mit „ollama serve“).';
    return `Ollama ist installiert, aber unter ${url} nicht erreichbar. ${startHint}${otherUrl}`;
  };

  const checkStatus = async (candidate?: string): Promise<OllamaStatus> => {
    const configured = baseUrl();
    const url = candidate ? normalizeCandidate(candidate) : configured;
    const [probe, binaryPath] = await Promise.all([
      (async () => {
        try {
          return { running: true, version: await api(url).version(undefined, 5000), notOllama: false };
        } catch (e) {
          const d = providerErrorDetails(e);
          // Something answered (HTTP status or unusable 2xx body) → it is not an Ollama server.
          return { running: false, version: null, notOllama: d?.requestSent === true && (d.status !== undefined || !d.retryable) };
        }
      })(),
      detectBinary(),
    ]);
    const status: OllamaStatus = {
      installed: binaryPath !== null,
      running: probe.running,
      baseUrl: url,
      version: probe.version,
      binaryPath,
      message: statusMessage(binaryPath !== null, probe.running, probe.version, url, probe.notOllama),
      checkedAt: core.clock.now(),
    };
    if (url === configured) last = status;
    return status;
  };

  const normalizeCandidate = (raw: string): string => {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new NovaError('VALIDATION', 'Die Adresse ist ungültig.', { severity: 'warning' });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new NovaError('VALIDATION', 'Die Adresse muss mit http:// oder https:// beginnen.', { severity: 'warning' });
    return url.toString().replace(/\/+$/, '');
  };

  const refreshInBackground = () => {
    if (statusInflight) return;
    statusInflight = checkStatus().finally(() => {
      statusInflight = null;
    });
    statusInflight.catch((e) => log.debug('Ollama-Status konnte nicht geprüft werden', { error: errorMessage(e) }));
  };

  const ensureTimer = () => {
    if (statusTimer) return;
    statusTimer = setInterval(refreshInBackground, Math.max(1000, options.statusIntervalMs ?? 60_000));
    statusTimer.unref?.();
  };

  const modelsDir = (): string => {
    const e = env();
    const h = home();
    const candidates = [e.OLLAMA_MODELS, join(h, '.ollama', 'models'), join(h, '.ollama'), h].filter((x): x is string => !!x);
    return candidates.find((c) => fileExists(c)) ?? h;
  };

  /** Throws DISK_FULL when the models drive cannot hold what the running pulls still download plus the reserve. */
  const ensureDiskSpace = (entry: PullEntry) => {
    if (!isLocalEndpoint(baseUrl())) return; // the model is stored on the Ollama host, not on this PC
    let needed = 0;
    let others = 0;
    for (const e of pulls.values()) {
      if (e.pull.status !== 'running' || e.remainingBytes <= 0) continue;
      needed += e.remainingBytes;
      if (e !== entry) others++;
    }
    if (needed <= 0) return;
    const disk = diskFree(modelsDir());
    if (!disk) return;
    const minMb = core.settings.section('resources').minFreeDiskMb;
    if (disk.freeBytes - needed >= minMb * MiB) return;
    const where = platform() === 'win32' ? `auf dem Laufwerk ${disk.path}` : `auf dem Datenträger von ${disk.path}`;
    const together = others > 0 ? ` (zusammen mit dem anderen laufenden Download ca. ${formatGb(needed)})` : '';
    throw new NovaError(
      'DISK_FULL',
      `Zu wenig Speicherplatz: „${entry.pull.model}“ braucht noch ca. ${formatGb(entry.remainingBytes)}${together}, ${where} sind nur ${formatGb(disk.freeBytes)} frei (mindestens ${minMb.toLocaleString('de-DE')} MB sollen frei bleiben). Der Download wurde angehalten, bevor das Laufwerk voll ist – bitte Speicherplatz freigeben und erneut starten.`,
      { severity: 'blocker', userAction: 'Speicherplatz freigeben und den Download erneut starten.' },
    );
  };

  const runPull = async (entry: PullEntry) => {
    const p = entry.pull;
    const layers = new Map<string, { total: number; completed: number }>();
    let lastEmit = 0;
    let lastDiskCheck = 0;
    let success = false;
    try {
      await api().pull(p.model, entry.controller.signal, idleTimeout, (ev) => {
        const phaseChanged = typeof ev.status === 'string' && ev.status !== p.phase;
        if (typeof ev.status === 'string') p.phase = ev.status;
        if (ev.digest && typeof ev.total === 'number' && ev.total > 0) {
          const newLayer = !layers.has(ev.digest);
          layers.set(ev.digest, { total: ev.total, completed: Math.min(ev.total, typeof ev.completed === 'number' ? ev.completed : 0) });
          let total = 0;
          let completed = 0;
          for (const l of layers.values()) {
            total += l.total;
            completed += l.completed;
          }
          p.totalBytes = total;
          p.completedBytes = completed;
          p.percent = total > 0 ? Math.min(100, Math.round((completed / total) * 1000) / 10) : null;
          entry.remainingBytes = Math.max(0, total - completed);
          const t = Date.now();
          if (newLayer || t - lastDiskCheck >= diskCheckInterval) {
            lastDiskCheck = t;
            ensureDiskSpace(entry);
          }
        }
        if (ev.status === 'success') success = true;
        p.updatedAt = core.clock.now();
        const t = Date.now();
        if (phaseChanged || t - lastEmit >= eventInterval) {
          lastEmit = t;
          emitPull(entry);
        }
      });
      if (!success) throw new NovaError('PROVIDER_ERROR', 'Der Download wurde vorzeitig beendet.', { severity: 'warning' });
      p.status = 'done';
      p.phase = 'success';
      p.percent = 100;
      if (p.totalBytes !== null) p.completedBytes = p.totalBytes;
      p.updatedAt = core.clock.now();
      forgetOllamaDetails(baseUrl(), p.model);
      emitPull(entry);
      core.bus.emit('ollama.models.changed', { providerId: OLLAMA_LOCAL_ID });
      log.info('Modell heruntergeladen', { model: p.model });
    } catch (e) {
      if (entry.cancelRequested || isAbortError(e) || (e instanceof NovaError && e.code === 'CANCELLED')) {
        p.status = 'cancelled';
        p.error = null;
      } else {
        p.status = 'failed';
        p.error = `Download fehlgeschlagen: ${redactString(errorMessage(e)).slice(0, 400)}`;
        log.warn('Modell-Download fehlgeschlagen', { model: p.model, error: errorMessage(e) });
      }
      p.updatedAt = core.clock.now();
      emitPull(entry);
    } finally {
      prunePulls();
    }
  };

  const service: OllamaServiceImpl = {
    baseUrl,

    status(candidate?: string) {
      return checkStatus(candidate);
    },

    lastStatus() {
      ensureTimer();
      return last ? { ...last } : null;
    },

    async models(): Promise<ModelInfo[]> {
      let provider = null;
      try {
        provider = s.providers.get(OLLAMA_LOCAL_ID);
      } catch {
        provider = null;
      }
      if (provider) return provider.listModels();
      const url = baseUrl();
      return (await listOllamaModels(api(url), OLLAMA_LOCAL_ID, isLocalEndpoint(url))).map((d) => d.info);
    },

    async show(model: string) {
      assertModelName(model);
      const url = baseUrl();
      const { info, show } = await showModelInfo(api(url), model, OLLAMA_LOCAL_ID, isLocalEndpoint(url));
      const cap = (v: string | undefined) => (typeof v === 'string' && v.length ? v.slice(0, 100_000) : null);
      return { model: info, modelfile: cap(show.modelfile), license: cap(show.license), parameters: cap(show.parameters) };
    },

    pull(model: string): OllamaPull {
      assertModelName(model);
      const running = [...pulls.values()].filter((p) => p.pull.status === 'running');
      const same = running.find((p) => sameOllamaModel(p.pull.model, model));
      if (same) return snapshot(same);
      if (running.length >= MAX_CONCURRENT_PULLS) throw conflict('Es laufen bereits zwei Downloads. Bitte warten, bis einer abgeschlossen ist.');
      const disk = s.governor.canWrite(modelsDir());
      if (!disk.ok) {
        throw new NovaError('DISK_FULL', disk.reason ?? 'Zu wenig freier Speicherplatz für den Download.', {
          severity: 'blocker',
          userAction: 'Speicherplatz freigeben und den Download erneut starten.',
        });
      }
      const now = core.clock.now();
      const entry: PullEntry = {
        pull: { id: newId('pull'), model, status: 'running', phase: 'starting', completedBytes: null, totalBytes: null, percent: null, error: null, startedAt: now, updatedAt: now },
        controller: new AbortController(),
        cancelRequested: false,
        remainingBytes: 0,
      };
      pulls.set(entry.pull.id, entry);
      emitPull(entry);
      void runPull(entry);
      return snapshot(entry);
    },

    pulls() {
      prunePulls();
      return [...pulls.values()]
        .map(snapshot)
        .sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.startedAt - a.startedAt);
    },

    cancelPull(id: string) {
      const entry = pulls.get(id);
      if (!entry) throw notFound('Download', id);
      if (entry.pull.status === 'running') {
        entry.cancelRequested = true;
        entry.controller.abort(new NovaError('CANCELLED', 'Der Download wurde abgebrochen.', { severity: 'warning' }));
        entry.pull.status = 'cancelled';
        entry.pull.updatedAt = core.clock.now();
        emitPull(entry);
      }
      return snapshot(entry);
    },

    async delete(model: string) {
      assertModelName(model);
      const url = baseUrl();
      try {
        await api(url).delete(model);
      } catch (e) {
        if (e instanceof NovaError && e.code === 'MODEL_UNAVAILABLE') throw new NovaError('NOT_FOUND', `Das Modell „${model}“ ist nicht installiert.`, { severity: 'warning' });
        throw e;
      }
      forgetOllamaDetails(url, model);
      core.bus.emit('ollama.models.changed', { providerId: OLLAMA_LOCAL_ID });
      log.info('Modell gelöscht', { model });
    },

    async running(): Promise<OllamaRunningModel[]> {
      const list = await api().ps();
      return list.map((m) => ({
        model: m.name,
        sizeBytes: m.size ?? 0,
        vramBytes: m.size_vram ?? 0,
        expiresAt: m.expires_at ?? null,
        contextLength: typeof m.context_length === 'number' ? m.context_length : null,
      }));
    },

    async fit(model: string, numCtx?: number): Promise<OllamaFit> {
      assertModelName(model);
      const ctx = Math.max(256, Math.floor(numCtx ?? core.settings.section('models').ollamaNumCtx));
      const url = baseUrl();
      const details = await listOllamaModels(api(url), OLLAMA_LOCAL_ID, isLocalEndpoint(url));
      const target = details.find((d) => d.info.id === model) ?? details.find((d) => sameOllamaModel(d.info.id, model));
      if (!target) throw new NovaError('MODEL_UNAVAILABLE', `Das Modell „${model}“ ist nicht installiert.`, { severity: 'warning' });
      const required = requiredVramBytes(target, ctx);
      // A fresh sample: GPU numbers are probed only rarely while the PC is idle (ResourceMonitor), and a VRAM decision
      // must not rest on numbers that are minutes old.
      let snap = null;
      try {
        snap = await s.resources.sample();
      } catch (e) {
        log.debug('Ressourcendaten nicht verfügbar', { error: errorMessage(e) });
        try {
          snap = s.resources.latest();
        } catch {
          snap = null;
        }
      }
      const loadedModels = snap?.ollamaLoaded ?? [];
      const loaded = loadedModels.find((r) => sameOllamaModel(r.model, target.info.id)) ?? null;
      // VRAM of OTHER loaded Ollama models is reclaimable: Ollama unloads them when a new model needs the space.
      const reclaimable = loadedModels.filter((r) => r !== loaded).reduce((sum, r) => sum + Math.max(0, r.vramBytes), 0);
      const gpu = (snap?.gpus ?? [])
        .filter((g) => typeof g.vramTotalBytes === 'number' && g.vramTotalBytes > 0)
        .sort((a, b) => (b.vramTotalBytes ?? 0) - (a.vramTotalBytes ?? 0))[0];
      // Free VRAM + memory the model itself already occupies + other Ollama models (never more than the GPU has).
      const usable = (total: number): number => Math.min(total, Math.max(0, total - (gpu?.vramUsedBytes ?? 0)) + (loaded?.vramBytes ?? 0) + reclaimable);
      if (loaded && loaded.sizeBytes > 0 && loaded.vramBytes >= loaded.sizeBytes) {
        return {
          fits: true,
          requiredBytes: required.bytes,
          availableBytes: gpu?.vramTotalBytes != null ? usable(gpu.vramTotalBytes) : null,
          estimated: required.estimated || Boolean(gpu?.estimated),
          message: 'Das Modell ist bereits vollständig im Grafikspeicher geladen.',
          alternatives: [],
        };
      }
      if (!gpu || gpu.vramTotalBytes == null) {
        const note = snap?.gpuNote ? ` (${snap.gpuNote})` : '';
        return {
          fits: null,
          requiredBytes: required.bytes,
          availableBytes: null,
          estimated: true,
          message: `Keine GPU-Messwerte verfügbar${note} – ob das Modell in den Grafikspeicher passt, ist unbekannt. Ollama nutzt dann teilweise den Prozessor (langsamer).`,
          alternatives: [],
        };
      }
      if (required.bytes === null) {
        return {
          fits: null,
          requiredBytes: null,
          availableBytes: usable(gpu.vramTotalBytes),
          estimated: true,
          message: 'Die Modellgröße ist unbekannt – ob das Modell in den Grafikspeicher passt, lässt sich nicht abschätzen.',
          alternatives: [],
        };
      }
      const usedEstimated = gpu.vramUsedBytes == null;
      const available = usable(gpu.vramTotalBytes);
      const estimated = required.estimated || gpu.estimated || usedEstimated;
      const fits = required.bytes <= available;
      const alternatives = details
        .filter((d) => d !== target && d.info.capabilities.includes('completion'))
        .map((d) => ({ d, req: requiredVramBytes(d, ctx).bytes }))
        .filter((x): x is { d: OllamaModelDetail; req: number } => x.req !== null && x.req <= available)
        .sort((a, b) => (a.d.info.sizeBytes ?? 0) - (b.d.info.sizeBytes ?? 0) || a.req - b.req)
        .map((x) => x.d.info.id);
      const est = estimated ? ' (geschätzt)' : '';
      const swap = reclaimable > 0 ? `, davon ${formatGb(Math.min(reclaimable, available))} von anderen geladenen Modellen, die Ollama bei Bedarf entlädt` : '';
      const message = fits
        ? `Passt in den Grafikspeicher: benötigt ca. ${formatGb(required.bytes)}, frei ${formatGb(available)}${est}${swap}.`
        : `Passt nicht in den Grafikspeicher: benötigt ca. ${formatGb(required.bytes)}, frei nur ${formatGb(available)}${est}${swap}.${
            alternatives.length ? ` Kleinere installierte Modelle, die passen: ${alternatives.slice(0, 5).join(', ')}.` : ' Ein kleineres Modell oder eine geringere Kontextgröße wählen.'
          }`;
      return { fits, requiredBytes: required.bytes, availableBytes: available, estimated, message, alternatives };
    },

    start() {
      ensureTimer();
      refreshInBackground();
    },

    stop() {
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = null;
      for (const e of pulls.values()) {
        if (e.pull.status === 'running') {
          e.cancelRequested = true;
          e.controller.abort(new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.'));
        }
      }
    },
  };
  return service;
}

