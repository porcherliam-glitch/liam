// TEST-ONLY support for the 3D workshop tests (never imported by production code): a scripted in-memory ComfyClient,
// a small image → 3D prompt builder, a models folder with (tiny) catalog files and a harness around the real
// ChangeJournal/PathGuard (tools/files/test-support) with fakes for integrations, Ollama and notifications.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThreeDModelId } from '@shared/schemas';
import { NovaError } from '../core/errors';
import { createHarness, type Harness } from '../tools/files/test-support';
import { tinyGlb, tinyPng } from '../../../tests/fakes/fake-comfyui';
import { tempDir } from '../../../tests/helpers/core';
import { THREED_CATALOG } from './catalog';
import type { ComfyHistoryEntry, ComfySystemStats, ComfyWatchEvent, QueuedPrompt } from './comfy-client';
import { createThreeDService, type ComfyClientLike, type ThreeDServiceImpl, type ThreeDServiceOptions, type WorkflowApi } from './threed-service';
import type { ApiPrompt, BuiltPrompt, ImageTo3dOptions } from './workflow';

export interface FakeComfyState {
  running: boolean;
  supports3d: boolean;
  version: string;
  /** Model files ComfyUI "sees" per folder (null entry = folder unknown). */
  files: Record<string, string[] | null>;
  failNext: null | 'oom' | 'error' | 'interrupted';
  /** watch() waits for release() (after emitting execution_start unless holdBeforeStart). */
  hold: boolean;
  holdBeforeStart: boolean;
  calls: Array<{ method: string; args: unknown[] }>;
  prompts: Array<{ id: string; prompt: ApiPrompt; clientId: string }>;
  uploads: Array<{ name: string; bytes: Buffer }>;
  release(): void;
  /** Resolves when watch() is waiting in hold. */
  holding(): Promise<void>;
}

export function fakeComfy(init: Partial<Omit<FakeComfyState, 'calls' | 'prompts' | 'uploads' | 'release' | 'holding'>> = {}) {
  let releasers: Array<() => void> = [];
  let holdWaiters: Array<() => void> = [];
  let seq = 0;
  const state: FakeComfyState = {
    running: true,
    supports3d: true,
    version: '0.42.0',
    files: {},
    failNext: null,
    hold: false,
    holdBeforeStart: false,
    calls: [],
    prompts: [],
    uploads: [],
    ...init,
    release() {
      const r = releasers;
      releasers = [];
      for (const fn of r) fn();
    },
    holding() {
      if (releasers.length) return Promise.resolve();
      return new Promise((resolve) => holdWaiters.push(resolve));
    },
  };
  const down = () => new NovaError('TOOL_MISSING', 'ComfyUI ist unter http://127.0.0.1:8188 nicht erreichbar.', { severity: 'blocker' });
  const factory = (o: { baseUrl: string; clientId: string }): ComfyClientLike => {
    const call = (method: string, ...args: unknown[]) => state.calls.push({ method, args: [o.baseUrl, ...args] });
    const client = {
      async systemStats(): Promise<ComfySystemStats> {
        call('systemStats');
        if (!state.running) throw down();
        return {
          version: state.version,
          os: 'nt',
          pythonVersion: '3.12',
          pytorchVersion: '2.9',
          ramTotalBytes: 32e9,
          ramFreeBytes: 20e9,
          devices: [{ name: 'cuda:0 NVIDIA GeForce RTX 4080 : cudaMallocAsync', type: 'cuda', index: 0, vramTotalBytes: 17_170_956_288, vramFreeBytes: 15_000_000_000 }],
          raw: {},
        };
      },
      async objectInfo(classNames: string[]) {
        call('objectInfo', classNames);
        if (!state.running) throw down();
        const out: Record<string, { input: Record<string, unknown> }> = {};
        for (const c of classNames) if (state.supports3d || !/Trellis|Pixal3D/.test(c)) out[c] = { input: { required: {} } };
        return out;
      },
      async listModels(folder: string) {
        call('listModels', folder);
        const f = state.files[folder];
        return f === undefined ? [] : f;
      },
      async uploadImage(bytes: Buffer, filename: string) {
        call('uploadImage', filename);
        state.uploads.push({ name: filename, bytes });
        return `nova/${filename}`;
      },
      async queuePrompt(prompt: ApiPrompt): Promise<QueuedPrompt> {
        call('queuePrompt');
        const id = `prompt-${++seq}`;
        state.prompts.push({ id, prompt, clientId: o.clientId });
        return { promptId: id, number: seq, nodeErrors: {} };
      },
      async interrupt(promptId?: string) {
        call('interrupt', promptId);
      },
      async deleteFromQueue(promptId: string) {
        call('deleteFromQueue', promptId);
      },
      async free() {
        call('free');
      },
      async view(ref: { filename: string }) {
        call('view', ref.filename);
        return ref.filename.endsWith('.glb') ? tinyGlb() : tinyPng();
      },
      async watch(promptId: string, onEvent: (ev: ComfyWatchEvent) => void, signal?: AbortSignal): Promise<ComfyHistoryEntry> {
        call('watch', promptId);
        const rec = state.prompts.find((p) => p.id === promptId);
        if (!rec) throw new NovaError('DEPENDENCY_FAILED', 'unknown prompt');
        const cancelled = () => new NovaError('CANCELLED', 'Die Anfrage an ComfyUI wurde abgebrochen.', { severity: 'warning' });
        const waitHold = () =>
          new Promise<void>((resolve, reject) => {
            if (signal?.aborted) return reject(cancelled());
            releasers.push(resolve);
            signal?.addEventListener('abort', () => reject(cancelled()), { once: true });
            const w = holdWaiters;
            holdWaiters = [];
            for (const fn of w) fn();
          });
        if (state.hold && state.holdBeforeStart) await waitHold();
        onEvent({ type: 'execution_start' });
        if (state.hold && !state.holdBeforeStart) await waitHold();
        if (signal?.aborted) throw cancelled();
        const outputs: Record<string, Record<string, unknown>> = {};
        for (const [id, node] of Object.entries(rec.prompt)) {
          onEvent({ type: 'executing', node: id });
          if (node.class_type === 'KSampler') for (let i = 1; i <= 2; i++) onEvent({ type: 'progress', node: id, value: i, max: 2 });
          if (state.failNext) {
            const kind = state.failNext;
            state.failNext = null;
            if (kind === 'oom') {
              throw new NovaError('VRAM_INSUFFICIENT', `Der Grafikspeicher hat für die 3D-Erzeugung nicht gereicht (im Knoten „${node.class_type}“ (#${id})).`, {
                severity: 'blocker',
                userAction: 'Andere Programme schließen, die die Grafikkarte nutzen, die Qualität „Entwurf“ wählen und Sprachmodelle vor 3D-Aufträgen entladen lassen.',
              });
            }
            if (kind === 'interrupted') throw new NovaError('CANCELLED', 'Die Erzeugung wurde in ComfyUI abgebrochen.', { severity: 'warning', details: { interrupted: true } });
            throw new NovaError('DEPENDENCY_FAILED', `ComfyUI meldet einen Fehler im Knoten „${node.class_type}“ (#${id}): kaputt`, { severity: 'blocker' });
          }
          const prefix = String(node.inputs.filename_prefix ?? 'ComfyUI');
          const slash = prefix.lastIndexOf('/');
          const file = { subfolder: slash >= 0 ? prefix.slice(0, slash) : '', type: 'output' };
          if (node.class_type === 'SaveImage') outputs[id] = { images: [{ ...file, filename: `${prefix.slice(slash + 1)}_00001_.png` }] };
          if (node.class_type === 'Save3DAdvanced') outputs[id] = { '3d': [{ ...file, filename: `${prefix.slice(slash + 1)}_00001.glb` }] };
          if (outputs[id]) onEvent({ type: 'executed', node: id, output: outputs[id] });
        }
        onEvent({ type: 'executing', node: null });
        return { outputs, status: { status_str: 'success', completed: true, messages: [] } };
      },
    };
    return client as unknown as ComfyClientLike;
  };
  return { state, factory };
}

/** Small image → 3D graph (shape → texture → save) instead of the real template conversion. */
export function fakeImageTo3dBuilder(_template: unknown, _info: unknown, o: ImageTo3dOptions): BuiltPrompt {
  const unet = o.generator === 'trellis2' ? 'trellis_2_int8_convrot.safetensors' : 'pixal3d_int8_convrot.safetensors';
  const prompt: ApiPrompt = {
    '1': { class_type: 'LoadImage', inputs: { image: o.image } },
    '2': { class_type: 'UNETLoader', inputs: { unet_name: unet, weight_dtype: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'trellis_2_shape_vae_bf16.safetensors' } },
    '4': { class_type: 'KSampler', inputs: { model: ['2', 0], seed: o.seed } },
    '5': { class_type: 'Trellis2TextureStage', inputs: { positive: ['4', 0] } },
    '6': { class_type: 'KSampler', inputs: { model: ['5', 0], seed: o.seed } },
    '7': { class_type: 'BakeTextureFromVoxel', inputs: { mesh: ['6', 0], texture_size: 2048 } },
    '8': { class_type: 'Save3DAdvanced', inputs: { model_3d: ['7', 0], filename_prefix: o.filenamePrefix } },
  };
  return { prompt, outputNodeId: '8' };
}

export const fakeWorkflow: Partial<WorkflowApi> = {
  template: { nodes: [] },
  workflowNodeClasses: () => ['LoadImage', 'UNETLoader', 'KSampler', 'Save3DAdvanced'],
  buildImageTo3dPrompt: fakeImageTo3dBuilder,
};

/** Every catalog file of the given models as a tiny non-empty file in a fresh models folder. */
export function makeModelsDir(ids: ThreeDModelId[]): { dir: string; cleanup(): void } {
  const t = tempDir('nova-models-');
  for (const folder of ['checkpoints', 'vae', 'diffusion_models', 'clip_vision', 'text_encoders', 'background_removal', 'geometry_estimation']) mkdirSync(join(t.dir, folder), { recursive: true });
  for (const m of THREED_CATALOG) {
    if (!ids.includes(m.id)) continue;
    for (const f of m.files) writeFileSync(join(t.dir, f.folder, f.name), 'x');
  }
  return t;
}

/** ComfyUI file lists (folder → names) for the given models. */
export function comfyFilesFor(ids: ThreeDModelId[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of THREED_CATALOG) {
    if (!ids.includes(m.id)) continue;
    for (const f of m.files) out[f.folder] = [...new Set([...(out[f.folder] ?? []), f.name])];
  }
  return out;
}

export interface ThreeDHarness extends Harness {
  svc: ThreeDServiceImpl;
  comfy: ReturnType<typeof fakeComfy>;
  models: { dir: string; cleanup(): void };
  home: { dir: string; cleanup(): void };
  fetchCalls: Array<{ url: string; body: unknown }>;
  notifications: Array<{ title: string; level: string }>;
  events: { jobs: Array<{ id: string; status: string; phase: string | null; progress: number | null }>; status: number; modelsChanged: number };
}

export function createThreeDHarness(
  o: { installed?: ThreeDModelId[]; comfy?: Parameters<typeof fakeComfy>[0]; service?: ThreeDServiceOptions; integrationAvailable?: boolean } = {},
): ThreeDHarness {
  const h = createHarness();
  const installed = o.installed ?? ['trellis2', 'z_image_turbo'];
  const models = makeModelsDir(installed);
  const home = tempDir('nova-home-');
  const comfy = fakeComfy({ files: comfyFilesFor(installed), ...o.comfy });
  const fetchCalls: Array<{ url: string; body: unknown }> = [];
  const notifications: Array<{ title: string; level: string }> = [];
  const s = h.s;
  s.integrations = {
    get: async () => ({ id: 'comfyui', available: o.integrationAvailable ?? true, manualPath: null }),
  } as unknown as typeof s.integrations;
  s.ollama = {
    baseUrl: () => 'http://127.0.0.1:11434',
    running: async () => [{ model: 'qwen2.5-coder:7b', sizeBytes: 1, vramBytes: 1, expiresAt: null, contextLength: null }],
  } as unknown as typeof s.ollama;
  s.notifications = {
    notify: (n: { title: string; level: string }) => {
      notifications.push({ title: n.title, level: n.level });
      return null;
    },
  } as unknown as typeof s.notifications;
  h.t.core.settings.update({ threeD: { modelsDir: models.dir, engineUrl: 'http://127.0.0.1:8188' } });
  const events = { jobs: [] as ThreeDHarness['events']['jobs'], status: 0, modelsChanged: 0 };
  h.t.core.bus.on('threed.job', (j) => events.jobs.push({ id: j.id, status: j.status, phase: j.phase, progress: j.progress }));
  h.t.core.bus.on('threed.status', () => events.status++);
  h.t.core.bus.on('threed.models.changed', () => events.modelsChanged++);
  const svc = createThreeDService(s, {
    platform: 'linux',
    env: { HOME: home.dir },
    clientFactory: comfy.factory,
    workflow: fakeWorkflow,
    progressIntervalMs: 0,
    fetch: (async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response('{}', { status: 200 });
    }) as typeof fetch,
    ...o.service,
  });
  s.threed = svc;
  return {
    ...h,
    svc,
    comfy,
    models,
    home,
    fetchCalls,
    notifications,
    events,
    cleanup() {
      h.cleanup();
      models.cleanup();
      home.cleanup();
    },
  };
}
