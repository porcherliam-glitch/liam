// ThreeDService (contract src/daemon/contracts.ts, docs/SPEC-3D.md §2–§5): engine status, model catalog and
// downloads, and the 3D job queue (text → image → 3D, image → 3D) on top of a local ComfyUI.
// Key decisions:
// - One GPU job at a time (FIFO queue in memory, rows in threed_jobs). Phases (German) and an overall percentage:
//   text mode „Bild wird erzeugt“ 0–30, „Bild wird übertragen“ 30–33, „Form wird berechnet“ 33–75, „Textur wird
//   gebacken“ 75–95, „Modell wird gespeichert“ 95–100; image mode upload 0–4, shape 4–65, texture 65–94, save 94–100.
//   Inside a ComfyUI prompt the nodes are grouped by graph position (everything downstream of the texture stage or a
//   bake/unwrap node is "texture", Save3DAdvanced is "save"); progress = executed nodes of the group + the running
//   node's step progress. Progress events are throttled (500 ms), phase/status changes are emitted at once.
// - Before a job (settings threeD.unloadLanguageModels): loaded Ollama models are unloaded (keep_alive 0) when Ollama
//   is local; after the job ComfyUI gets POST /free. Agents may be slower meanwhile (they reload their model).
// - Missing model files are found BEFORE queueing (GET /models/<folder> for every file the prompt references) and
//   reported as MODEL_UNAVAILABLE with the download hint. Engine problems are TOOL_MISSING, out of GPU memory
//   VRAM_INSUFFICIENT (from ComfyClient), cancel CANCELLED.
// - Cancel: queued jobs end at once; a running prompt is interrupted (/interrupt with prompt_id) when it already
//   started in ComfyUI, otherwise removed from ComfyUI's queue (/queue delete) – the job ends 'cancelled'.
// - Output: the .glb (and the reference .png in text mode) is written into the project through the ChangeJournal
//   (actor 'nova', taskId/runId of the agent run or null) under settings threeD.outputFolder, never over an existing
//   file (numeric suffix "-2", "-3" … for the pair), so it shows up in „Änderungen“ and can be reverted. Without a
//   project the files go to NOVA's 3D library <dataDir>/3d/<jobId>/.
// - recover(): queued/running rows of a previous run → failed „Abgebrochen, weil NOVA neu gestartet wurde.“
//   shutdown(): the running prompt is interrupted, the job ends failed „Abgebrochen, weil NOVA beendet wurde.“
// - ComfyClient, the workflow builders, fs/env/platform, fetch and statfs are injectable (unit tests use fakes).
// Honest limits: generation needs a capable GPU; quality depends on the input image; ComfyUI is a separate program
// NOVA only drives through its local API; whether a running ComfyUI can really load the weights is only known when a
// job runs.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ThreeDGenerateInputSchema, type Operation, type ThreeDEngineStatus, type ThreeDGenerateInput, type ThreeDJob, type ThreeDModel, type ThreeDModelId } from '@shared/schemas';
import type { Services, ThreeDService } from '../contracts';
import { NovaError, conflict, errorMessage, isAbortError, isNovaError, notFound, validation } from '../core/errors';
import { atomicWriteFile, removeDirWithRetry, unlinkWithRetry } from '../core/fs-atomic';
import { newId } from '../core/ids';
import { isLocalEndpoint } from '../core/net';
import { nodeFs, type FsLike } from '../integrations/helpers';
import { catalogModel, filePath, filesExclusiveTo, formatSize, modelsWithPresence, regularFileExists, type FileExists } from './catalog';
import { ComfyClient, outputFiles, type ComfyErrorDetails, type ComfyHistoryEntry, type ComfyWatchEvent } from './comfy-client';
import { downloadFiles, statfsFreeBytes } from './downloads';
import { detectComfyLayouts, endpointCandidates, isModelsFolder, normalizeEngineUrl, statusMessage, type ComfyLayouts } from './engine';
import { createThreeDJobStore, type ThreeDJobStore } from './job-store';
import {
  IMAGE_TO_3D_TEMPLATE,
  buildImageTo3dPrompt,
  buildTextToImagePrompt,
  requiredModelFiles,
  workflowNodeClasses,
  type ApiPrompt,
  type BuiltPrompt,
  type ImageTo3dOptions,
  type ObjectInfo,
  type RequiredModelFile,
  type TextToImageOptions,
} from './workflow';

// ---------------------------------------------------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------------------------------------------------

/** The ComfyClient surface the service uses (tests provide fakes). */
export type ComfyClientLike = Pick<ComfyClient, 'systemStats' | 'objectInfo' | 'listModels' | 'uploadImage' | 'queuePrompt' | 'interrupt' | 'deleteFromQueue' | 'free' | 'view' | 'watch'>;

export interface WorkflowApi {
  template: unknown;
  workflowNodeClasses(ui: unknown): string[];
  buildImageTo3dPrompt(template: unknown, objectInfo: ObjectInfo, o: ImageTo3dOptions): BuiltPrompt;
  buildTextToImagePrompt(o: TextToImageOptions): BuiltPrompt;
  requiredModelFiles(prompt: ApiPrompt): RequiredModelFile[];
}

export interface ThreeDServiceOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  /** File system for the ComfyUI layout detection. */
  fs?: FsLike;
  /** Presence check of model files. */
  fileExists?: FileExists;
  clientFactory?: (o: { baseUrl: string; clientId: string }) => ComfyClientLike;
  workflow?: Partial<WorkflowApi>;
  /** fetch for model downloads and the Ollama unload. */
  fetch?: typeof fetch;
  freeBytes?: (dir: string) => Promise<number | null>;
  /** Timeout of one status probe request (default 3 s). */
  probeTimeoutMs?: number;
  /** Throttle of progress events (default 500 ms). */
  progressIntervalMs?: number;
  downloadIdleTimeoutMs?: number;
  downloadRetryDelaysMs?: number[];
  random?: () => number;
}

export interface ThreeDServiceImpl extends ThreeDService {
  /** Deletes old ended jobs (failed/cancelled, and done jobs saved in a project); library jobs stay. */
  prune(olderThanMs: number): number;
  /** Test hook: resolves when no job is running or queued. */
  idle(): Promise<void>;
}

export const PHASES = {
  waiting: 'Wartet',
  image: 'Bild wird erzeugt',
  upload: 'Bild wird übertragen',
  shape: 'Form wird berechnet',
  texture: 'Textur wird gebacken',
  save: 'Modell wird gespeichert',
} as const;

export const RESTART_MESSAGE = 'Abgebrochen, weil NOVA neu gestartet wurde.';
export const SHUTDOWN_MESSAGE = 'Abgebrochen, weil NOVA beendet wurde.';
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_READ_BYTES = 150 * 1024 * 1024;

type Range = [number, number];
const RANGES: Record<'text' | 'image', { image?: Range; upload: Range; shape: Range; texture: Range; save: Range }> = {
  text: { image: [0, 30], upload: [30, 33], shape: [33, 75], texture: [75, 95], save: [95, 100] },
  image: { upload: [0, 4], shape: [4, 65], texture: [65, 94], save: [94, 100] },
};

/** Nodes that start the texture part of the image → 3D graph (everything downstream of them is texture work). */
const TEXTURE_ANCHORS = /^(Trellis2TextureStage|VaeDecodeTextureTrellis|UnwrapMesh|BakeTextureFromVoxel|BakeNormalMapFromMesh|BakeAmbientOcclusion|RenderUVAtlas|ApplyTextureToMesh|PaintMesh)$/;
const SAVE_CLASSES = /^(Save3DAdvanced|SaveGLB)$/;

interface ProbeResult {
  running: boolean;
  baseUrl: string;
  version: string | null;
  gpu: ThreeDEngineStatus['gpu'];
  supports3d: boolean;
  /** German text when the configured address is not allowed. */
  urlError: string | null;
}

interface ActiveJob {
  id: string;
  controller: AbortController;
  promptId: string | null;
  started: boolean;
  client: ComfyClientLike | null;
  /** 'cancel' (user) or 'shutdown'. */
  reason: 'cancel' | 'shutdown' | null;
  done: Promise<void>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------------------------------------------------

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** Safe ASCII file base name: umlauts transliterated, other characters → "-", max 60 chars, never a reserved name. */
export function sanitizeName(raw: string): string {
  let s = raw
    .normalize('NFC')
    .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60).replace(/[-_]+$/, '');
  if (!s || /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$|clock\$)$/i.test(s)) return 'modell';
  return s;
}

export function imageTypeOf(buf: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function isGlb(buf: Buffer): boolean {
  return buf.length >= 20 && buf.readUInt32LE(0) === 0x46546c67 && buf.readUInt32LE(4) === 2;
}

function mimeOfPath(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith('.glb')) return 'model/gltf-binary';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function abortError(message: string): Error {
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

/** Nodes of an API prompt grouped by work phase (graph position). */
export function groupPromptNodes(prompt: ApiPrompt): Map<string, 'shape' | 'texture' | 'save'> {
  const consumers = new Map<string, string[]>();
  for (const [id, node] of Object.entries(prompt)) {
    for (const v of Object.values(node.inputs ?? {})) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number') {
        const list = consumers.get(v[0]) ?? [];
        list.push(id);
        consumers.set(v[0], list);
      }
    }
  }
  const texture = new Set<string>();
  const stack = Object.keys(prompt).filter((id) => TEXTURE_ANCHORS.test(prompt[id].class_type));
  while (stack.length) {
    const id = stack.pop() as string;
    if (texture.has(id)) continue;
    texture.add(id);
    for (const c of consumers.get(id) ?? []) stack.push(c);
  }
  const out = new Map<string, 'shape' | 'texture' | 'save'>();
  for (const [id, node] of Object.entries(prompt)) out.set(id, SAVE_CLASSES.test(node.class_type) ? 'save' : texture.has(id) ? 'texture' : 'shape');
  return out;
}

/** German job error text from any thrown value: message + what to do. */
export function jobErrorText(e: unknown): string {
  if (isNovaError(e)) return [e.message, e.userAction].filter(Boolean).join(' ');
  return `Unerwarteter Fehler: ${errorMessage(e)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------------------

export function createThreeDService(s: Services, opts: ThreeDServiceOptions = {}): ThreeDServiceImpl {
  const core = s.core;
  const log = core.log.child('threed');
  const store: ThreeDJobStore = createThreeDJobStore(core.db);
  const platform = () => opts.platform ?? core.platform;
  const env = () => opts.env ?? process.env;
  const fsLike = opts.fs ?? nodeFs;
  const fileExists = opts.fileExists ?? regularFileExists;
  const clientFactory = opts.clientFactory ?? ((o: { baseUrl: string; clientId: string }) => new ComfyClient({ baseUrl: o.baseUrl, clientId: o.clientId }));
  const wf: WorkflowApi = {
    template: opts.workflow?.template ?? IMAGE_TO_3D_TEMPLATE,
    workflowNodeClasses: opts.workflow?.workflowNodeClasses ?? workflowNodeClasses,
    buildImageTo3dPrompt: opts.workflow?.buildImageTo3dPrompt ?? buildImageTo3dPrompt,
    buildTextToImagePrompt: opts.workflow?.buildTextToImagePrompt ?? buildTextToImagePrompt,
    requiredModelFiles: opts.workflow?.requiredModelFiles ?? requiredModelFiles,
  };
  const fetchImpl = opts.fetch ?? fetch;
  const probeTimeout = opts.probeTimeoutMs ?? 3000;
  const progressInterval = opts.progressIntervalMs ?? 500;
  const random = opts.random ?? Math.random;
  const libraryRoot = () => join(core.paths.root, '3d');
  const jobDir = (id: string) => join(libraryRoot(), id);

  const queue: string[] = [];
  const runIds = new Map<string, string | null>();
  const waiters = new Map<string, Set<(job: ThreeDJob) => void>>();
  const idleWaiters = new Set<() => void>();
  const modelOps = new Map<ThreeDModelId, string>();
  const fileLocks = new Map<string, Promise<void>>();
  const objectInfoCache = new Map<string, ObjectInfo>();
  let active: ActiveJob | null = null;
  let stopping = false;
  let probeCache: ProbeResult | null = null;
  let probeInflight: Promise<ProbeResult> | null = null;
  let lastEmittedStatus = '';
  let layoutsCache: { at: number; manualPath: string | null; value: ComfyLayouts } | null = null;
  let manualPath: string | null = null;

  // ------------------------------------------------------------------------------------------------- engine/status

  const layouts = (fresh = false): ComfyLayouts => {
    if (!fresh && layoutsCache && layoutsCache.manualPath === manualPath && Date.now() - layoutsCache.at < 30_000) return layoutsCache.value;
    const value = detectComfyLayouts(fsLike, env(), platform(), manualPath);
    layoutsCache = { at: Date.now(), manualPath, value };
    return value;
  };

  /** Models folder NOVA works with: settings first, else auto-detected. invalid = configured but unusable. */
  const resolveModelsDir = (fresh = false): { dir: string | null; invalid: boolean } => {
    const configured = core.settings.section('threeD').modelsDir.trim();
    if (configured) return { dir: configured, invalid: !isModelsFolder(fsLike, configured, platform()) };
    return { dir: layouts(fresh).modelsDirs[0] ?? null, invalid: false };
  };

  const usableModelsDir = (): string | null => {
    const md = resolveModelsDir();
    return md.dir && !md.invalid ? md.dir : null;
  };

  const currentModels = (): ThreeDModel[] => modelsWithPresence(usableModelsDir(), fileExists);

  const probe = async (): Promise<ProbeResult> => {
    const settings = core.settings.section('threeD');
    let candidates: string[];
    try {
      candidates = endpointCandidates(settings.engineUrl, layouts().ports);
    } catch (e) {
      return { running: false, baseUrl: settings.engineUrl.trim(), version: null, gpu: null, supports3d: false, urlError: jobErrorText(e) };
    }
    for (const baseUrl of candidates) {
      let client: ComfyClientLike;
      try {
        client = clientFactory({ baseUrl, clientId: 'nova-status' });
      } catch (e) {
        log.debug('ComfyUI-Adresse nicht verwendbar', { baseUrl, error: errorMessage(e) });
        continue;
      }
      try {
        const stats = await client.systemStats({ timeoutMs: probeTimeout });
        const device = stats.devices.find((d) => d.type !== 'cpu') ?? stats.devices[0] ?? null;
        const gpu: ThreeDEngineStatus['gpu'] = device
          ? device.type === 'cpu'
            ? { name: 'Prozessor (keine Grafikkarte)', vramTotalBytes: null, vramFreeBytes: null }
            : { name: device.name.replace(/^[a-z]+:\d+\s+/i, '').replace(/\s+:\s+\S+$/, '').trim() || device.name, vramTotalBytes: device.vramTotalBytes, vramFreeBytes: device.vramFreeBytes }
          : null;
        let supports3d = false;
        try {
          const info = await client.objectInfo(['Trellis2ShapeStage'], { timeoutMs: Math.max(probeTimeout, 5000) });
          supports3d = 'Trellis2ShapeStage' in info;
        } catch (e) {
          log.debug('object_info nicht abrufbar', { baseUrl, error: errorMessage(e) });
        }
        return { running: true, baseUrl, version: stats.version, gpu, supports3d, urlError: null };
      } catch (e) {
        log.debug('ComfyUI nicht erreichbar', { baseUrl, error: errorMessage(e) });
      }
    }
    return { running: false, baseUrl: candidates[0] ?? '', version: null, gpu: null, supports3d: false, urlError: null };
  };

  const installedInfo = async (refresh: boolean): Promise<boolean> => {
    try {
      const st = await s.integrations.get('comfyui', refresh);
      manualPath = st.manualPath;
      return st.available;
    } catch (e) {
      log.debug('Werkzeugstatus von ComfyUI nicht verfügbar', { error: errorMessage(e) });
      return layouts(refresh).installs.length > 0;
    }
  };

  const buildStatus = async (refresh: boolean): Promise<ThreeDEngineStatus> => {
    let p: ProbeResult;
    if (refresh || !probeCache) {
      probeInflight ??= probe().finally(() => {
        probeInflight = null;
      });
      p = await probeInflight;
      probeCache = p;
    } else p = probeCache;
    const installed = (await installedInfo(refresh)) || p.running;
    const md = resolveModelsDir(refresh);
    const models = modelsWithPresence(md.dir && !md.invalid ? md.dir : null, fileExists);
    const generatorInstalled = models.some((m) => m.purpose === 'image_to_3d' && m.installed);
    const configuredUrl = core.settings.section('threeD').engineUrl.trim() !== '';
    const status: ThreeDEngineStatus = {
      installed,
      running: p.running,
      baseUrl: p.baseUrl,
      version: p.version,
      supports3d: p.supports3d,
      modelsDir: md.dir,
      gpu: p.gpu,
      message:
        p.urlError ??
        statusMessage({
          platform: platform(),
          installed,
          running: p.running,
          baseUrl: p.baseUrl,
          configuredUrl,
          version: p.version,
          supports3d: p.supports3d,
          modelsDir: md.dir,
          modelsDirInvalid: md.invalid,
          generatorInstalled,
          gpu: p.gpu,
        }),
      checkedAt: core.clock.now(),
    };
    const key = JSON.stringify({ ...status, checkedAt: 0, gpu: status.gpu ? { ...status.gpu, vramFreeBytes: null } : null });
    if (key !== lastEmittedStatus) {
      lastEmittedStatus = key;
      core.bus.emit('threed.status', status);
    }
    return status;
  };

  const ensureEngineReady = async (): Promise<ThreeDEngineStatus> => {
    const st = await buildStatus(true);
    if (!st.running || !st.supports3d) {
      throw new NovaError('TOOL_MISSING', st.message, { severity: 'warning', details: { baseUrl: st.baseUrl, running: st.running, supports3d: st.supports3d } });
    }
    return st;
  };

  // ------------------------------------------------------------------------------------------------- jobs: events

  const isEnded = (j: ThreeDJob) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled';

  const emitJob = (job: ThreeDJob): void => {
    core.bus.emit('threed.job', job);
    if (isEnded(job)) {
      const set = waiters.get(job.id);
      if (set) {
        waiters.delete(job.id);
        for (const fn of set) fn(job);
      }
    }
  };

  const updateJob = (id: string, patch: Partial<Omit<ThreeDJob, 'id' | 'createdAt'>>): ThreeDJob => {
    const job = store.update(id, patch);
    emitJob(job);
    return job;
  };

  const notifyIdle = () => {
    if (active || queue.length > 0) return;
    for (const fn of idleWaiters) fn();
    idleWaiters.clear();
  };

  // ------------------------------------------------------------------------------------------------- jobs: models

  const missingModelError = (ids: ThreeDModelId[], mode: 'text' | 'image'): NovaError | null => {
    const md = resolveModelsDir();
    if (!md.dir || md.invalid) {
      return new NovaError('MODEL_UNAVAILABLE', 'Der Modellordner von ComfyUI ist nicht bekannt, deshalb kann NOVA die 3D-Modelle nicht prüfen.', {
        severity: 'warning',
        userAction: 'In der 3D-Werkstatt unter „Einstellungen“ den Ordner „models“ von ComfyUI wählen.',
      });
    }
    const models = currentModels();
    const missing = ids.map((id) => models.find((m) => m.id === id) as ThreeDModel).filter((m) => !m.installed);
    if (missing.length === 0) return null;
    const list = missing.map((m) => `„${m.name}“ (noch ${m.files.filter((f) => !f.present).length} Dateien, ${formatSize(m.missingBytes)})`).join(' und ');
    return new NovaError('MODEL_UNAVAILABLE', `Für „${mode === 'text' ? 'Text zu 3D' : 'Bild zu 3D'}“ fehlt ${missing.length === 1 ? 'das Modell' : 'die Modelle'} ${list}.`, {
      severity: 'warning',
      userAction: 'Unter „Modelle“ → „3D-Modelle“ herunterladen.',
      details: { missing: missing.map((m) => m.id) },
    });
  };

  /** Checks that ComfyUI itself sees every model file a prompt references (GET /models/<folder>). */
  const assertComfyHasFiles = async (client: ComfyClientLike, prompt: ApiPrompt, signal: AbortSignal): Promise<void> => {
    const needed = wf.requiredModelFiles(prompt);
    const byFolder = new Map<string, RequiredModelFile[]>();
    for (const f of needed) byFolder.set(f.folder, [...(byFolder.get(f.folder) ?? []), f]);
    const missing: Array<{ folder: string; name: string; unknownFolder: boolean }> = [];
    for (const [folder, files] of byFolder) {
      const list = await client.listModels(folder, { signal });
      const names = new Set((list ?? []).map((n) => n.replace(/\\/g, '/').toLowerCase()));
      for (const f of files) if (!list || !names.has(f.name.replace(/\\/g, '/').toLowerCase())) missing.push({ folder, name: f.name, unknownFolder: list === null });
    }
    if (missing.length === 0) return;
    if (missing.some((m) => m.unknownFolder)) {
      const folders = [...new Set(missing.filter((m) => m.unknownFolder).map((m) => m.folder))];
      throw new NovaError('TOOL_MISSING', `Diese ComfyUI-Version kennt den Modellordner ${folders.map((f) => `„${f}“`).join(', ')} nicht.`, {
        severity: 'warning',
        userAction: 'ComfyUI aktualisieren und neu starten.',
      });
    }
    throw new NovaError('MODEL_UNAVAILABLE', `ComfyUI findet diese Modelldateien nicht: ${missing.map((m) => `„${m.name}“ (Ordner „${m.folder}“)`).join(', ')}.`, {
      severity: 'warning',
      userAction:
        'Unter „Modelle“ → „3D-Modelle“ herunterladen. Sind die Dateien schon geladen, ComfyUI neu starten oder in den Einstellungen der 3D-Werkstatt prüfen, ob der Modellordner zu dieser ComfyUI-Installation gehört.',
      details: { missing },
    });
  };

  const objectInfoFor = async (client: ComfyClientLike, baseUrl: string, version: string | null, signal: AbortSignal): Promise<ObjectInfo> => {
    const key = `${baseUrl}|${version ?? '?'}`;
    const cached = objectInfoCache.get(key);
    if (cached) return cached;
    const info = await client.objectInfo(wf.workflowNodeClasses(wf.template), { signal, timeoutMs: 60_000 });
    if (objectInfoCache.size > 4) objectInfoCache.clear();
    objectInfoCache.set(key, info);
    return info;
  };

  // ------------------------------------------------------------------------------------------------- jobs: running

  const unloadLanguageModels = async (jobId: string): Promise<void> => {
    let base: string;
    let running: Array<{ model: string }>;
    try {
      base = s.ollama.baseUrl();
      if (!isLocalEndpoint(base)) return;
      running = await s.ollama.running();
    } catch (e) {
      log.debug('Geladene Sprachmodelle nicht abrufbar', { error: errorMessage(e) });
      return;
    }
    for (const m of running) {
      try {
        await fetchImpl(`${base.replace(/\/+$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: m.model, keep_alive: 0 }),
          signal: AbortSignal.timeout(15_000),
        });
        log.info('Sprachmodell vor dem 3D-Auftrag entladen', { jobId, model: m.model });
      } catch (e) {
        log.warn('Sprachmodell konnte nicht entladen werden', { jobId, model: m.model, error: errorMessage(e) });
      }
    }
  };

  /**
   * Queues a prompt and follows it; progress goes to onEvent. Records promptId/started so a cancel can stop the prompt
   * inside ComfyUI. queuePrompt itself is not aborted (it is short): a prompt that reached ComfyUI is always cancelled
   * there, never left running as an orphan.
   */
  const runPrompt = async (a: ActiveJob, client: ComfyClientLike, built: BuiltPrompt, onEvent: (ev: ComfyWatchEvent) => void): Promise<ComfyHistoryEntry> => {
    const signal = a.controller.signal;
    if (signal.aborted) throw abortError('abgebrochen');
    let queued;
    try {
      queued = await client.queuePrompt(built.prompt);
    } catch (e) {
      const d = isNovaError(e) ? (e.details as ComfyErrorDetails | undefined) : undefined;
      if (isNovaError(e) && d?.missingModels?.length) {
        throw new NovaError('MODEL_UNAVAILABLE', e.message, { severity: 'warning', userAction: e.userAction, details: d });
      }
      throw e;
    }
    a.promptId = queued.promptId;
    a.started = false;
    try {
      if (signal.aborted) throw abortError('abgebrochen');
      return await client.watch(
        queued.promptId,
        (ev) => {
          if (ev.type === 'execution_start' || ev.type === 'executing' || ev.type === 'progress' || ev.type === 'execution_cached') a.started = true;
          onEvent(ev);
        },
        signal,
      );
    } catch (e) {
      if (signal.aborted) await cancelInComfy(a);
      throw e;
    } finally {
      a.promptId = null;
    }
  };

  /** Cancels the job's prompt inside ComfyUI (interrupt when started, else delete from the queue). */
  const cancelInComfy = async (a: ActiveJob): Promise<void> => {
    const client = a.client;
    const promptId = a.promptId;
    if (!client || !promptId) return;
    try {
      if (!a.started) await client.deleteFromQueue(promptId, { timeoutMs: 5000 });
      await client.interrupt(promptId, { timeoutMs: 5000 });
    } catch (e) {
      log.warn('Abbruch in ComfyUI fehlgeschlagen', { jobId: a.id, error: errorMessage(e) });
    }
  };

  /** Progress tracker for one prompt: maps ComfyUI events to phase + overall percent. */
  const tracker = (job: ThreeDJob, groups: Map<string, 'image' | 'shape' | 'texture' | 'save'>) => {
    const ranges = RANGES[job.mode];
    const order: Array<'image' | 'shape' | 'texture' | 'save'> = ['image', 'shape', 'texture', 'save'];
    const totals = new Map<string, number>();
    for (const g of groups.values()) totals.set(g, (totals.get(g) ?? 0) + 1);
    const done = new Set<string>();
    let current: string | null = null;
    let fraction = 0;
    let phase: 'image' | 'shape' | 'texture' | 'save' = groups.size && [...groups.values()].every((g) => g === 'image') ? 'image' : 'shape';
    let lastEmit = 0;
    let lastPhase = '';
    const publish = () => {
      const range = ranges[phase] ?? ranges.shape;
      const total = totals.get(phase) ?? 1;
      let count = 0;
      for (const id of done) if (groups.get(id) === phase) count++;
      if (current && groups.get(current) === phase) count += Math.min(1, Math.max(0, fraction));
      // 100 % only when the job is really done (the file still has to be fetched and saved).
      const pct = Math.min(99, range[0] + (range[1] - range[0]) * Math.min(1, count / Math.max(1, total)));
      const label = PHASES[phase];
      const now = Date.now();
      if (label !== lastPhase || now - lastEmit >= progressInterval) {
        lastEmit = now;
        lastPhase = label;
        updateJob(job.id, { phase: label, progress: Math.round(pct * 10) / 10 });
      }
    };
    return (ev: ComfyWatchEvent) => {
      if (ev.type === 'execution_cached') for (const n of ev.nodes) done.add(n);
      else if (ev.type === 'executing') {
        if (current) done.add(current);
        current = ev.node;
        fraction = 0;
        const g = ev.node ? groups.get(ev.node) : undefined;
        if (g && order.indexOf(g) > order.indexOf(phase)) phase = g;
      } else if (ev.type === 'progress') {
        if (ev.node && ev.node !== current) {
          if (current) done.add(current);
          current = ev.node;
        }
        fraction = ev.max > 0 ? ev.value / ev.max : 0;
      } else if (ev.type === 'executed') {
        done.add(ev.node);
      } else return;
      publish();
    };
  };

  /** Phase change; the overall progress never goes backwards. */
  const setPhase = (id: string, phase: keyof typeof PHASES, progress: number) => updateJob(id, { phase: PHASES[phase], progress: Math.max(store.get(id)?.progress ?? 0, progress) });

  /** Free base name in the project for "<folder>/<name>.glb" (+ ".png"), "-2", "-3" … */
  const freeProjectNames = (projectRoot: string, folder: string, name: string, withPng: boolean): { glb: string; png: string | null } => {
    for (let n = 1; n < 1000; n++) {
      const base = n === 1 ? name : `${name}-${n}`;
      const glb = `${folder}/${base}.glb`;
      const png = withPng ? `${folder}/${base}.png` : null;
      const taken = [glb, png].some((rel) => rel !== null && existsSync(s.pathGuard.resolve(projectRoot, rel).abs));
      if (!taken) return { glb, png };
    }
    throw conflict(`Im Ausgabeordner gibt es bereits zu viele Dateien mit dem Namen „${name}“.`);
  };

  const outputFolder = (): string => {
    const raw = core.settings.section('threeD').outputFolder.replace(/\\/g, '/').trim();
    const folder = raw.replace(/^\.?\/+/, '').replace(/\/+$/, '');
    if (!folder || folder.split('/').some((seg) => seg === '..' || seg === '')) {
      throw validation(`Der Ausgabeordner „${raw}“ ist ungültig. Bitte in den Einstellungen der 3D-Werkstatt einen Ordner im Projekt angeben, z. B. „assets/3d“.`);
    }
    return folder;
  };

  const saveOutputs = async (job: ThreeDJob, glb: Buffer, png: Buffer | null): Promise<Partial<ThreeDJob>> => {
    const project = job.projectId ? s.projects.get(job.projectId) : null;
    if (project) {
      const folder = outputFolder();
      const names = freeProjectNames(project.path, folder, job.name, !!png);
      const runId = runIds.get(job.id) ?? null;
      await s.journal.writeFile({ projectId: project.id, projectRoot: project.path, relPath: names.glb, content: glb, taskId: job.taskId, runId, actor: 'nova', source: 'tool' });
      let imagePath = job.imagePath;
      if (png && names.png) {
        await s.journal.writeFile({ projectId: project.id, projectRoot: project.path, relPath: names.png, content: png, taskId: job.taskId, runId, actor: 'nova', source: 'tool' });
        imagePath = s.pathGuard.resolve(project.path, names.png).abs;
        // The temporary reference image in the job folder is no longer needed.
        try {
          unlinkWithRetry(join(jobDir(job.id), 'referenz.png'));
        } catch (e) {
          log.debug('Temporäres Referenzbild nicht gelöscht', { error: errorMessage(e) });
        }
      }
      return { outputPath: s.pathGuard.resolve(project.path, names.glb).abs, outputRel: names.glb, imagePath };
    }
    if (job.projectId) log.warn('Projekt des 3D-Auftrags nicht gefunden – Ergebnis kommt in die 3D-Bibliothek', { jobId: job.id, projectId: job.projectId });
    const dir = jobDir(job.id);
    mkdirSync(dir, { recursive: true });
    const glbPath = join(dir, `${job.name}.glb`);
    atomicWriteFile(glbPath, glb);
    let imagePath = job.imagePath;
    if (png) {
      imagePath = join(dir, `${job.name}.png`);
      atomicWriteFile(imagePath, png);
      try {
        unlinkWithRetry(join(dir, 'referenz.png'));
      } catch {
        /* best effort */
      }
    }
    return { outputPath: glbPath, outputRel: null, imagePath };
  };

  const execute = async (a: ActiveJob): Promise<void> => {
    let job = store.get(a.id) as ThreeDJob;
    const signal = a.controller.signal;
    const ranges = RANGES[job.mode];
    job = updateJob(job.id, { status: 'running', startedAt: core.clock.now(), phase: job.mode === 'text' ? PHASES.image : PHASES.upload, progress: 0, error: null });
    const engine = await ensureEngineReady();
    const needed: ThreeDModelId[] = job.mode === 'text' ? [job.model, 'z_image_turbo'] : [job.model];
    const missing = missingModelError(needed, job.mode);
    if (missing) throw missing;
    if (core.settings.section('threeD').unloadLanguageModels) await unloadLanguageModels(job.id);
    if (signal.aborted) throw abortError('abgebrochen');
    const client = clientFactory({ baseUrl: engine.baseUrl, clientId: `nova-${job.id}` });
    a.client = client;
    let saved: Partial<ThreeDJob> = {};
    let savedBytes = 0;
    try {
      // 1. Text → reference image.
      let imageBytes: Buffer;
      let imageExt: string;
      let referencePng: Buffer | null = null;
      if (job.mode === 'text') {
        const built = wf.buildTextToImagePrompt({ prompt: job.prompt ?? '', seed: job.seed, filenamePrefix: `nova/${job.id}-ref` });
        await assertComfyHasFiles(client, built.prompt, signal);
        const groups = new Map<string, 'image'>(Object.keys(built.prompt).map((id) => [id, 'image']));
        const entry = await runPrompt(a, client, built, tracker(job, groups));
        const out = outputFilesOf(entry, built.outputNodeId, 'images');
        if (!out) throw new NovaError('DEPENDENCY_FAILED', 'ComfyUI hat kein Referenzbild geliefert.', { severity: 'warning', userAction: 'Den Auftrag erneut starten.' });
        imageBytes = await client.view(out, { signal });
        if (imageTypeOf(imageBytes) !== 'png') throw new NovaError('DEPENDENCY_FAILED', 'ComfyUI hat kein gültiges PNG-Referenzbild geliefert.', { severity: 'warning' });
        imageExt = 'png';
        referencePng = imageBytes;
        const dir = jobDir(job.id);
        mkdirSync(dir, { recursive: true });
        const refPath = join(dir, 'referenz.png');
        atomicWriteFile(refPath, imageBytes);
        job = updateJob(job.id, { imagePath: refPath });
      } else {
        if (!job.imagePath) throw validation('Für Bild zu 3D fehlt das Eingabebild.');
        imageBytes = readFileSync(job.imagePath);
        imageExt = imageTypeOf(imageBytes) ?? 'png';
      }

      // 2. Upload.
      job = setPhase(job.id, 'upload', ranges.upload[0]);
      const stored = await client.uploadImage(imageBytes, `${job.id}.${imageExt}`, { signal });

      // 3. Image → 3D.
      const objectInfo = await objectInfoFor(client, engine.baseUrl, engine.version, signal);
      const built = wf.buildImageTo3dPrompt(wf.template, objectInfo, { image: stored, generator: job.model, seed: job.seed, quality: job.quality, filenamePrefix: `nova/${job.id}` });
      await assertComfyHasFiles(client, built.prompt, signal);
      job = setPhase(job.id, 'shape', ranges.shape[0]);
      const entry = await runPrompt(a, client, built, tracker(job, groupPromptNodes(built.prompt)));

      // 4. Fetch + save.
      job = setPhase(job.id, 'save', ranges.save[0]);
      const out = outputFilesOf(entry, built.outputNodeId, '3d');
      if (!out) throw new NovaError('DEPENDENCY_FAILED', 'ComfyUI hat kein 3D-Modell geliefert.', { severity: 'warning', userAction: 'Den Auftrag erneut starten.' });
      const glb = await client.view(out, { signal });
      if (!isGlb(glb)) throw new NovaError('DEPENDENCY_FAILED', 'ComfyUI hat keine gültige GLB-Datei geliefert.', { severity: 'warning', userAction: 'ComfyUI aktualisieren und den Auftrag erneut starten.' });
      if (signal.aborted) throw abortError('abgebrochen');
      saved = await saveOutputs(job, glb, referencePng);
      savedBytes = glb.length;
    } finally {
      // Release graphics memory in ComfyUI after every job (also after errors and cancel).
      await client.free({ timeoutMs: 10_000 }).catch((e: unknown) => log.debug('ComfyUI /free fehlgeschlagen', { error: errorMessage(e) }));
      a.client = null;
    }
    // Reported as done only after ComfyUI released the graphics memory.
    if (!job.taskId) notify(job, true);
    updateJob(job.id, { ...saved, status: 'done', phase: null, progress: 100, endedAt: core.clock.now(), error: null });
    log.info('3D-Modell erzeugt', { jobId: job.id, bytes: savedBytes, project: job.projectId });
  };

  /** The generated file of the output node (any node of that kind as fallback). */
  function outputFilesOf(entry: ComfyHistoryEntry, nodeId: string, kind: string): { filename: string; subfolder: string; type: string } | null {
    const f = outputFiles(entry, nodeId).find((x) => x.kind === kind) ?? outputFiles(entry).find((x) => x.kind === kind);
    return f ? { filename: f.filename, subfolder: f.subfolder, type: f.type } : null;
  }

  const runJob = async (a: ActiveJob): Promise<void> => {
    try {
      await execute(a);
    } catch (e) {
      const aborted = a.controller.signal.aborted;
      const current = store.get(a.id);
      if (!current) return;
      if (aborted && a.reason === 'cancel') {
        updateJob(a.id, { status: 'cancelled', phase: null, endedAt: core.clock.now(), error: null });
        log.info('3D-Auftrag abgebrochen', { jobId: a.id });
      } else if (aborted && a.reason === 'shutdown') {
        updateJob(a.id, { status: 'failed', phase: null, endedAt: core.clock.now(), error: SHUTDOWN_MESSAGE });
      } else {
        const interrupted = isNovaError(e) && e.code === 'CANCELLED';
        const text = interrupted ? 'Die Erzeugung wurde in ComfyUI abgebrochen (z. B. über die ComfyUI-Oberfläche). Bitte den Auftrag erneut starten.' : jobErrorText(e);
        log.warn('3D-Auftrag fehlgeschlagen', { jobId: a.id, code: isNovaError(e) ? e.code : 'INTERNAL', error: errorMessage(e) });
        if (!current.taskId) notify(current, false);
        updateJob(a.id, { status: 'failed', phase: null, endedAt: core.clock.now(), error: text });
      }
    }
  };

  const notify = (job: ThreeDJob, ok: boolean) => {
    try {
      s.notifications.notify({
        level: ok ? 'success' : 'error',
        category: ok ? 'task_done' : 'error',
        title: ok ? '3D-Modell fertig' : '3D-Modell fehlgeschlagen',
        body: ok ? `Das 3D-Modell „${job.name}“ ist fertig und gespeichert.` : `Das 3D-Modell „${job.name}“ konnte nicht erzeugt werden. Details stehen in der 3D-Werkstatt.`,
        projectId: job.projectId,
        taskId: null,
      });
    } catch (e) {
      log.debug('Benachrichtigung nicht möglich', { error: errorMessage(e) });
    }
  };

  const pump = (): void => {
    if (active || stopping) return;
    const id = queue.shift();
    if (!id) {
      notifyIdle();
      return;
    }
    const job = store.get(id);
    if (!job || job.status !== 'queued') return pump();
    const a: ActiveJob = { id, controller: new AbortController(), promptId: null, started: false, client: null, reason: null, done: Promise.resolve() };
    active = a;
    a.done = runJob(a)
      .catch((e: unknown) => log.error('3D-Auftrag: unerwarteter Fehler', { jobId: id, error: errorMessage(e) }))
      .finally(() => {
        runIds.delete(id);
        active = null;
        pump();
        notifyIdle();
      });
  };

  // ------------------------------------------------------------------------------------------------- generate input

  const resolveInputImage = (input: ReturnType<typeof ThreeDGenerateInputSchema.parse>, jobId: string, projectRoot: string | null): string => {
    let path: string;
    let bytes: Buffer;
    if (input.imageBase64) {
      const clean = input.imageBase64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw validation('Das Bild ist nicht gültig kodiert (Base64 erwartet).');
      bytes = Buffer.from(clean, 'base64');
      if (bytes.length > MAX_IMAGE_BYTES) throw validation(`Das Bild ist zu groß (${formatSize(bytes.length)}, erlaubt sind 20 MB).`);
      const type = imageTypeOf(bytes);
      if (!type) throw validation('Bitte ein PNG-, JPEG- oder WebP-Bild verwenden.');
      const dir = jobDir(jobId);
      mkdirSync(dir, { recursive: true });
      path = join(dir, `eingabe.${type}`);
      atomicWriteFile(path, bytes);
      return path;
    }
    const raw = (input.imagePath ?? '').trim();
    const isAbs = platform() === 'win32' ? /^([A-Za-z]:[\\/]|\\\\)/.test(raw) : raw.startsWith('/');
    if (isAbs) path = raw;
    else if (projectRoot) path = s.pathGuard.resolve(projectRoot, raw).abs;
    else throw validation('Ein relativer Bildpfad braucht ein Projekt. Bitte das Bild auswählen oder ein Projekt angeben.');
    let st;
    try {
      st = statSync(path);
    } catch {
      throw new NovaError('NOT_FOUND', `Das Bild wurde nicht gefunden: ${raw}`, { severity: 'warning' });
    }
    if (!st.isFile()) throw validation(`„${raw}“ ist keine Bilddatei.`);
    if (st.size > MAX_IMAGE_BYTES) throw validation(`Das Bild ist zu groß (${formatSize(st.size)}, erlaubt sind 20 MB).`);
    bytes = readFileSync(path);
    if (!imageTypeOf(bytes)) throw validation('Bitte ein PNG-, JPEG- oder WebP-Bild verwenden.');
    return path;
  };

  const deriveName = (input: ReturnType<typeof ThreeDGenerateInputSchema.parse>): string => {
    if (input.name) return sanitizeName(input.name);
    if (input.mode === 'text' && input.prompt) return sanitizeName(input.prompt.split(/\s+/).slice(0, 5).join(' ').toLowerCase());
    if (input.imagePath) {
      const base = input.imagePath.replace(/\\/g, '/').split('/').pop() ?? '';
      return sanitizeName(base.replace(/\.[^.]+$/, ''));
    }
    return 'modell';
  };

  // ------------------------------------------------------------------------------------------------- downloads

  const lockFile = async (key: string, fn: () => Promise<void>): Promise<void> => {
    for (;;) {
      const running = fileLocks.get(key);
      if (!running) break;
      await running.catch(() => undefined);
    }
    const p = fn();
    fileLocks.set(key, p);
    try {
      await p;
    } finally {
      if (fileLocks.get(key) === p) fileLocks.delete(key);
    }
  };

  // ------------------------------------------------------------------------------------------------- service

  const service: ThreeDServiceImpl = {
    status(refresh = false) {
      return buildStatus(refresh);
    },

    async configure(input) {
      const patch: { engineUrl?: string; modelsDir?: string } = {};
      if (input.engineUrl !== undefined) patch.engineUrl = input.engineUrl.trim() ? normalizeEngineUrl(input.engineUrl) : '';
      if (input.modelsDir !== undefined) {
        const raw = input.modelsDir.trim().replace(/^"(.*)"$/, '$1');
        if (!raw) patch.modelsDir = '';
        else {
          const p = platform() === 'win32' ? /^[A-Za-z]:[\\/]/.test(raw) : raw.startsWith('/');
          if (!p) throw validation('Bitte den vollständigen Pfad zum Ordner „models“ von ComfyUI angeben.');
          if (!fsLike.isDir(raw)) throw validation(`Der Ordner wurde nicht gefunden: ${raw}`);
          const sep = platform() === 'win32' ? '\\' : '/';
          const nested = `${raw.replace(/[\\/]+$/, '')}${sep}models`;
          if (isModelsFolder(fsLike, raw, platform())) patch.modelsDir = raw;
          else if (isModelsFolder(fsLike, nested, platform())) patch.modelsDir = nested;
          else throw validation('Das ist kein ComfyUI-Modellordner: Es fehlen Unterordner wie „checkpoints“, „vae“ oder „diffusion_models“. Bitte den Ordner „models“ von ComfyUI wählen.');
        }
      }
      if (Object.keys(patch).length) {
        core.settings.update({ threeD: patch });
        objectInfoCache.clear();
        layoutsCache = null;
        log.info('3D-Werkstatt eingerichtet', { engineUrl: patch.engineUrl, modelsDir: patch.modelsDir });
        core.bus.emit('threed.models.changed', {});
      }
      return buildStatus(true);
    },

    async models() {
      return currentModels();
    },

    downloadModel(id: ThreeDModelId): Operation {
      const model = catalogModel(id);
      const runningOp = modelOps.get(id);
      if (runningOp) {
        const op = core.operations.get(runningOp);
        if (op && op.status === 'running') return op;
      }
      const md = resolveModelsDir(true);
      if (!md.dir || md.invalid) {
        throw validation(
          md.invalid
            ? 'Der eingestellte Modellordner ist kein ComfyUI-Modellordner. Bitte in der 3D-Werkstatt unter „Einstellungen“ den Ordner „models“ von ComfyUI wählen.'
            : 'Der Modellordner von ComfyUI ist nicht bekannt. Bitte in der 3D-Werkstatt unter „Einstellungen“ den Ordner „models“ von ComfyUI wählen.',
        );
      }
      const modelsDir = md.dir;
      const missing = model.files.filter((f) => !fileExists(filePath(modelsDir, f)));
      if (missing.length === 0) throw conflict(`Das Modell „${model.name}“ ist bereits vollständig installiert.`);
      const { operation, result } = core.operations.run({ kind: 'threed_download', title: `3D-Modell „${model.name}“ herunterladen`, projectId: null, cancellable: true }, async (ctx) =>
        downloadFiles(
          {
            s,
            fetch: fetchImpl,
            freeBytes: opts.freeBytes ?? statfsFreeBytes,
            idleTimeoutMs: opts.downloadIdleTimeoutMs,
            retryDelaysMs: opts.downloadRetryDelaysMs,
          },
          { files: missing, modelsDir, title: model.name, signal: ctx.signal, onProgress: (p) => ctx.progress(p.percent, p.message), lockFile },
        ),
      );
      modelOps.set(id, operation.id);
      result
        .then((r) => log.info('3D-Modell heruntergeladen', { id, files: r.downloaded.length }))
        .catch((e: unknown) => {
          if (isAbortError(e)) log.info('Download eines 3D-Modells abgebrochen', { id });
          else log.warn('Download eines 3D-Modells fehlgeschlagen', { id, error: errorMessage(e) });
        })
        .finally(() => {
          if (modelOps.get(id) === operation.id) modelOps.delete(id);
          core.bus.emit('threed.models.changed', {});
          void buildStatus(false).catch(() => undefined);
        });
      return operation;
    },

    async deleteModel(id) {
      const model = catalogModel(id);
      if (modelOps.has(id)) throw conflict(`„${model.name}“ wird gerade heruntergeladen. Bitte den Download zuerst abbrechen.`);
      if (active) throw conflict('Gerade läuft ein 3D-Auftrag. Modelle können erst danach gelöscht werden.');
      const modelsDir = usableModelsDir();
      if (!modelsDir) throw validation('Der Modellordner von ComfyUI ist nicht bekannt.');
      const installed = currentModels()
        .filter((m) => m.installed)
        .map((m) => m.id);
      const files = filesExclusiveTo(id, installed);
      let removed = 0;
      for (const f of files) {
        for (const p of [filePath(modelsDir, f), `${filePath(modelsDir, f)}.part`]) {
          if (!existsSync(p)) continue;
          try {
            unlinkWithRetry(p);
            removed++;
          } catch (e) {
            throw new NovaError('FILE_IN_USE', `Die Datei ${f.name} wird gerade verwendet (vermutlich von ComfyUI) und konnte nicht gelöscht werden.`, {
              severity: 'warning',
              userAction: 'ComfyUI beenden und das Löschen wiederholen.',
              cause: e,
            });
          }
        }
      }
      log.info('3D-Modell gelöscht', { id, files: removed, kept: model.files.length - files.length });
      core.bus.emit('threed.models.changed', {});
      void buildStatus(false).catch(() => undefined);
    },

    async generate(raw: ThreeDGenerateInput, origin) {
      if (stopping) throw new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.', { severity: 'warning' });
      const input = ThreeDGenerateInputSchema.parse(raw);
      const settings = core.settings.section('threeD');
      const project = input.projectId ? s.projects.require(input.projectId) : null;
      const model = input.model ?? settings.defaultModel;
      const quality = input.quality ?? settings.defaultQuality;
      const needed: ThreeDModelId[] = input.mode === 'text' ? [model, 'z_image_turbo'] : [model];
      const missing = missingModelError(needed, input.mode);
      if (missing) throw missing;
      await ensureEngineReady();
      const id = newId('tdj');
      let imagePath: string | null = null;
      try {
        if (input.mode === 'image') imagePath = resolveInputImage(input, id, project?.path ?? null);
        const now = core.clock.now();
        const job: ThreeDJob = {
          id,
          projectId: project?.id ?? null,
          taskId: origin?.taskId ?? null,
          mode: input.mode,
          prompt: input.mode === 'text' ? (input.prompt ?? null) : null,
          imagePath,
          model,
          quality,
          seed: input.seed ?? Math.floor(random() * 2_147_483_647),
          name: deriveName(input),
          status: 'queued',
          phase: PHASES.waiting,
          progress: 0,
          outputPath: null,
          outputRel: null,
          error: null,
          createdAt: now,
          startedAt: null,
          endedAt: null,
        };
        const stored = store.insert(job);
        runIds.set(id, origin?.runId ?? null);
        queue.push(id);
        emitJob(stored);
        log.info('3D-Auftrag angelegt', { jobId: id, mode: job.mode, model, quality, project: job.projectId, agent: !!job.taskId });
        pump();
        return stored;
      } catch (e) {
        if (existsSync(jobDir(id))) removeDirWithRetry(jobDir(id));
        throw e;
      }
    },

    jobs(filter = {}) {
      return store.list({ projectId: filter.projectId, limit: filter.limit ?? 100 });
    },

    get(id) {
      return store.get(id);
    },

    cancel(id) {
      const job = store.get(id);
      if (!job) throw notFound('Der 3D-Auftrag', id);
      if (job.status === 'queued') {
        const i = queue.indexOf(id);
        if (i >= 0) queue.splice(i, 1);
        runIds.delete(id);
        const updated = updateJob(id, { status: 'cancelled', phase: null, endedAt: core.clock.now() });
        notifyIdle();
        return updated;
      }
      if (job.status === 'running' && active?.id === id) {
        if (!active.controller.signal.aborted) {
          active.reason = 'cancel';
          active.controller.abort(new NovaError('CANCELLED', 'Der 3D-Auftrag wurde abgebrochen.', { severity: 'warning' }));
        }
        return updateJob(id, { phase: 'Wird abgebrochen …' });
      }
      if (job.status === 'running') {
        // Running row without an active runner (cannot happen after recover(); defensive).
        return updateJob(id, { status: 'cancelled', phase: null, endedAt: core.clock.now() });
      }
      return job;
    },

    deleteJob(id, deleteFiles) {
      const job = store.get(id);
      if (!job) throw notFound('Der 3D-Auftrag', id);
      if (job.status === 'queued' || job.status === 'running') throw conflict('Der 3D-Auftrag läuft noch. Bitte ihn zuerst abbrechen.');
      const project = job.projectId ? s.projects.get(job.projectId) : null;
      if (deleteFiles && project) {
        const rels: string[] = [];
        if (job.outputRel) rels.push(job.outputRel);
        if (job.mode === 'text' && job.imagePath && s.pathGuard.isInside(project.path, job.imagePath)) rels.push(relative(project.path, job.imagePath).replace(/\\/g, '/'));
        const deletions = rels.map(async (rel) => {
          const abs = s.pathGuard.resolve(project.path, rel).abs;
          if (!existsSync(abs)) return;
          await s.journal.deleteFile({ projectId: project.id, projectRoot: project.path, relPath: rel, actor: 'user', source: 'user' });
        });
        void Promise.all(deletions).catch((e: unknown) => {
          log.warn('Dateien des 3D-Auftrags konnten nicht gelöscht werden', { jobId: id, error: errorMessage(e) });
          core.errors.report({
            code: isNovaError(e) ? String(e.code) : 'INTERNAL',
            severity: 'warning',
            title: 'Dateien eines 3D-Modells nicht gelöscht',
            whatHappened: `Die Dateien des 3D-Modells „${job.name}“ konnten nicht aus dem Projekt gelöscht werden: ${errorMessage(e)}`,
            projectId: project.id,
            projectSafe: true,
            userAction: 'Prüfen, ob ein anderes Programm (z. B. eine Spiel-Engine) die Datei geöffnet hat, und die Datei im Explorer löschen.',
            dedupeKey: `threed-delete:${id}`,
          });
        });
      }
      const dir = jobDir(id);
      if ((deleteFiles || job.projectId) && existsSync(dir)) removeDirWithRetry(dir);
      store.delete(id);
      log.info('3D-Auftrag gelöscht', { jobId: id, deleteFiles });
    },

    readFile(id, kind) {
      const job = store.get(id);
      if (!job) throw notFound('Der 3D-Auftrag', id);
      const path = kind === 'model' ? job.outputPath : job.imagePath;
      if (!path) throw new NovaError('NOT_FOUND', kind === 'model' ? 'Für diesen Auftrag gibt es (noch) kein 3D-Modell.' : 'Für diesen Auftrag gibt es kein Bild.', { severity: 'warning' });
      let st;
      try {
        st = statSync(path);
      } catch {
        throw new NovaError('NOT_FOUND', 'Die Datei wurde nicht gefunden (verschoben oder gelöscht).', { severity: 'warning', details: { path } });
      }
      if (!st.isFile()) throw new NovaError('NOT_FOUND', 'Die Datei wurde nicht gefunden (verschoben oder gelöscht).', { severity: 'warning', details: { path } });
      if (st.size > MAX_READ_BYTES) throw validation(`Die Datei ist zu groß für die Vorschau (${formatSize(st.size)}, höchstens 150 MB).`);
      const data = readFileSync(path);
      return { dataBase64: data.toString('base64'), mimeType: mimeOfPath(path), sizeBytes: data.length };
    },

    wait(id, signal) {
      const job = store.get(id);
      if (!job) return Promise.reject(notFound('Der 3D-Auftrag', id));
      if (isEnded(job)) return Promise.resolve(job);
      if (signal?.aborted) return Promise.reject(abortError('Das Warten auf den 3D-Auftrag wurde abgebrochen.'));
      return new Promise<ThreeDJob>((resolve, reject) => {
        let set = waiters.get(id);
        if (!set) {
          set = new Set();
          waiters.set(id, set);
        }
        const onAbort = () => {
          set!.delete(done);
          if (set!.size === 0) waiters.delete(id);
          reject(abortError('Das Warten auf den 3D-Auftrag wurde abgebrochen.'));
        };
        const done = (j: ThreeDJob) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(j);
        };
        set.add(done);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },

    recover() {
      const jobs = store.failUnfinished(RESTART_MESSAGE, core.clock.now());
      for (const j of jobs) emitJob(j);
      if (jobs.length) log.info('Unterbrochene 3D-Aufträge als fehlgeschlagen markiert', { count: jobs.length });
    },

    async shutdown() {
      stopping = true;
      queue.length = 0;
      const a = active;
      if (!a) return;
      if (!a.controller.signal.aborted) {
        a.reason = 'shutdown';
        a.controller.abort(new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.'));
      }
      await a.done;
    },

    prune(olderThanMs) {
      let n = 0;
      for (const job of store.list({ status: ['failed', 'cancelled', 'done'], limit: 1000 })) {
        if ((job.endedAt ?? job.createdAt) >= olderThanMs) continue;
        if (job.status === 'done' && !job.projectId) continue; // the 3D library: deleted only by the user
        const dir = jobDir(job.id);
        try {
          if (existsSync(dir)) removeDirWithRetry(dir);
        } catch (e) {
          log.debug('Ordner eines alten 3D-Auftrags nicht gelöscht', { error: errorMessage(e) });
        }
        if (store.delete(job.id)) n++;
      }
      return n;
    },

    idle() {
      if (!active && queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.add(resolve));
    },
  };

  return service;
}
