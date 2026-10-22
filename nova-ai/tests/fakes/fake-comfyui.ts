// Fake ComfyUI server – a clearly marked TEST DOUBLE for daemon tests, the e2e screenshot demo and UI development.
// It speaks the subset of the real ComfyUI HTTP/WebSocket API that NOVA uses (docs/SPEC-3D.md §4):
//   GET  /system_stats                     version + one GPU (configurable)
//   GET  /object_info, /object_info/<cls>  from tests/fixtures/comfyui/object_info.json (recorded from a real ComfyUI)
//                                          when it exists, else a small built-in subset; unknown class → {}
//   GET  /models, /models/<folder>         configurable model file lists
//   POST /upload/image                     multipart (field "image", "subfolder", "overwrite") → {name, subfolder, type}
//   POST /prompt {prompt, client_id}       validates node classes (when object_info is known) and model file names
//                                          against the file lists → HTTP 400 with node_errors exactly like ComfyUI
//   GET  /history[/<id>], GET/POST /queue, POST /interrupt, POST /free
//   GET  /view?filename=&subfolder=&type=  generated outputs: a tiny valid binary glTF (.glb, one textured-looking
//                                          triangle with a PBR material) and a small PNG; uploaded inputs
//   WS   /ws?clientId=<id>                 status, execution_start, executing, progress, executed, execution_success,
//                                          execution_error, execution_interrupted (minimal RFC 6455 server, text frames)
// Prompts run one at a time in topological order; sampler-like nodes report `steps` progress events. Delays and
// failures (out of GPU memory, generic node error, interruption) are scriptable.
//
// Usage:
//   const comfy = await startFakeComfyUI({ modelFiles: modelFilesFor(['trellis2', 'z_image_turbo']) });
//   ... point settings.threeD.engineUrl at comfy.url ...
//   comfy.failNext('oom');
//   await comfy.close();
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { THREED_CATALOG } from '../../src/daemon/threed/catalog';

export type FakeComfyFailure = 'oom' | 'error' | 'interrupted';

export interface FakeComfyDevice {
  name: string;
  type: string;
  index?: number;
  vram_total: number;
  vram_free: number;
}

export interface FakeComfyOptions {
  /** Fixed port (e.g. 8188 for the e2e demo); default random. */
  port?: number;
  /** ComfyUI version reported by /system_stats (default "0.42.0", the version the fixture was recorded with). */
  version?: string;
  devices?: FakeComfyDevice[];
  /** Model files per ComfyUI models sub folder. */
  modelFiles?: Record<string, string[]>;
  /** false = an old ComfyUI without the TRELLIS.2 / Pixal3D nodes. */
  supports3d?: boolean;
  /** Override the object_info data (default: fixture or built-in subset). */
  objectInfo?: Record<string, unknown>;
  /** Delay per executed node in ms (default 5). */
  nodeDelayMs?: number;
  /** Progress events per sampler-like node (default 4). */
  steps?: number;
  /** Delay per progress step in ms (default 5). */
  stepDelayMs?: number;
  /** Serve /ws (default true). */
  websocket?: boolean;
}

export interface FakeComfyPromptRecord {
  id: string;
  number: number;
  clientId: string | null;
  prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  status: 'pending' | 'running' | 'success' | 'error' | 'interrupted' | 'deleted';
}

export interface FakeComfyRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

export interface FakeComfyUI {
  url: string;
  port: number;
  requests: FakeComfyRequest[];
  prompts: FakeComfyPromptRecord[];
  /** Uploaded input images by "subfolder/name". */
  uploads: Map<string, Buffer>;
  /** Bodies of POST /free. */
  frees: unknown[];
  /** Number of POST /interrupt calls. */
  interrupts(): number;
  setModelFiles(folder: string, files: string[]): void;
  setVersion(version: string): void;
  setSupports3d(value: boolean): void;
  setDelays(d: { nodeDelayMs?: number; stepDelayMs?: number; steps?: number }): void;
  /** The next executed prompt fails with this failure (at the first sampler-like node, or at `nodeClass`). */
  failNext(kind: FakeComfyFailure, nodeClass?: string): void;
  /** Every request answers HTTP `status` (null = normal operation). */
  failAll(status: number | null): void;
  /** Resolves when no prompt is pending or running. */
  idle(): Promise<void>;
  close(): Promise<void>;
}

/** The recorded object_info fixture (next to this file in a CommonJS loader, else relative to the repo root). */
function fixturePath(): string | null {
  const candidates = [typeof __dirname === 'string' ? join(__dirname, '..', 'fixtures', 'comfyui', 'object_info.json') : null, join(process.cwd(), 'tests', 'fixtures', 'comfyui', 'object_info.json')];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}
const MODEL_EXT = /\.(safetensors|ckpt|pt|pth|bin|gguf|sft|onnx)$/i;
const SAMPLER_LIKE = /Sampler|Stage|Inference|Bake|RemoveBackground/;
const DEFAULT_FOLDERS = ['checkpoints', 'clip', 'clip_vision', 'configs', 'controlnet', 'diffusion_models', 'embeddings', 'loras', 'text_encoders', 'unet', 'upscale_models', 'vae', 'background_removal', 'geometry_estimation'];
/** Which input of which loader refers to which models folder (other model-like values are checked against all folders). */
const LOADER_FOLDERS: Record<string, Record<string, string>> = {
  UNETLoader: { unet_name: 'diffusion_models' },
  CLIPLoader: { clip_name: 'text_encoders' },
  DualCLIPLoader: { clip_name1: 'text_encoders', clip_name2: 'text_encoders' },
  VAELoader: { vae_name: 'vae' },
  CLIPVisionLoader: { clip_name: 'clip_vision' },
  CheckpointLoaderSimple: { ckpt_name: 'checkpoints' },
  LoadMoGeModel: { model_name: 'geometry_estimation' },
  LoadBackgroundRemovalModel: { bg_removal_name: 'background_removal' },
};
const THREE_D_CLASS = /Trellis|Pixal3D|MoGe|Mesh|Voxel|3D|UVAtlas|BackgroundRemoval/;

/** Model files (folder → names) of the given NOVA catalog models, for `modelFiles`. */
export function modelFilesFor(ids: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of THREED_CATALOG) {
    if (!ids.includes(m.id)) continue;
    for (const f of m.files) {
      out[f.folder] ??= [];
      if (!out[f.folder].includes(f.name)) out[f.folder].push(f.name);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ test assets

/** A tiny valid binary glTF 2.0 file: one triangle with a PBR material. */
export function tinyGlb(): Buffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = Buffer.from(positions.buffer);
  const gltf = {
    asset: { version: '2.0', generator: 'NOVA fake ComfyUI (test double)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Dreieck' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: 'Material', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.45, 0.2, 1], metallicFactor: 0.1, roughnessFactor: 0.7 } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, target: 34962 }],
    buffers: [{ byteLength: bin.length }],
  };
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const binPadded = bin.length % 4 ? Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]) : bin;
  const total = 12 + 8 + json.length + 8 + binPadded.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"
  return Buffer.concat([header, jsonHeader, json, binHeader, binPadded]);
}

/** A small valid RGB PNG (default 8×8, orange). */
export function tinyPng(width = 8, height = 8, rgb: [number, number, number] = [230, 120, 40]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------------------------------------ object_info

function info(name: string, required: Record<string, unknown[]>, outputs: string[], extra: Record<string, unknown> = {}) {
  return {
    [name]: {
      input: { required, optional: {} },
      input_order: { required: Object.keys(required), optional: [] },
      output: outputs,
      output_is_list: outputs.map(() => false),
      output_name: outputs,
      name,
      display_name: name,
      description: '',
      python_module: 'nodes',
      category: 'fake',
      output_node: false,
      ...extra,
    },
  };
}

/** Minimal object_info for the text → image graph and the 3D capability check (used when no fixture exists). */
function builtinObjectInfo(files: () => Record<string, string[]>): Record<string, unknown> {
  const f = files();
  return {
    ...info('UNETLoader', { unet_name: [f.diffusion_models ?? []], weight_dtype: [['default', 'fp8_e4m3fn', 'fp8_e5m2']] }, ['MODEL']),
    ...info('CLIPLoader', { clip_name: [f.text_encoders ?? []], type: [['stable_diffusion', 'lumina2', 'qwen_image']] }, ['CLIP']),
    ...info('VAELoader', { vae_name: [f.vae ?? []] }, ['VAE']),
    ...info('ModelSamplingAuraFlow', { model: ['MODEL'], shift: ['FLOAT', { default: 1.73, min: 0, max: 100 }] }, ['MODEL']),
    ...info('CLIPTextEncode', { text: ['STRING', { multiline: true }], clip: ['CLIP'] }, ['CONDITIONING']),
    ...info('ConditioningZeroOut', { conditioning: ['CONDITIONING'] }, ['CONDITIONING']),
    ...info('EmptySD3LatentImage', { width: ['INT', { default: 1024 }], height: ['INT', { default: 1024 }], batch_size: ['INT', { default: 1 }] }, ['LATENT']),
    ...info(
      'KSampler',
      {
        model: ['MODEL'],
        seed: ['INT', { default: 0, min: 0, max: 18446744073709551615, control_after_generate: true }],
        steps: ['INT', { default: 20, min: 1, max: 10000 }],
        cfg: ['FLOAT', { default: 8, min: 0, max: 100 }],
        sampler_name: [['euler', 'res_multistep']],
        scheduler: [['normal', 'simple']],
        positive: ['CONDITIONING'],
        negative: ['CONDITIONING'],
        latent_image: ['LATENT'],
        denoise: ['FLOAT', { default: 1, min: 0, max: 1 }],
      },
      ['LATENT'],
    ),
    ...info('VAEDecode', { samples: ['LATENT'], vae: ['VAE'] }, ['IMAGE']),
    ...info('SaveImage', { images: ['IMAGE'], filename_prefix: ['STRING', { default: 'ComfyUI' }] }, [], { output_node: true }),
    ...info('LoadImage', { image: [[], { image_upload: true }] }, ['IMAGE', 'MASK']),
    ...info('Trellis2ShapeStage', { positive: ['CONDITIONING'], negative: ['CONDITIONING'], voxel: ['VOXEL'] }, ['CONDITIONING', 'CONDITIONING', 'LATENT']),
    ...info('Save3DAdvanced', { model_3d: ['*'], filename_prefix: ['STRING', { default: '3d/ComfyUI' }], viewport_state: ['LOAD_3D'], width: ['INT', { default: 1024 }], height: ['INT', { default: 1024 }] }, ['*'], {
      output_node: true,
    }),
  };
}

// ------------------------------------------------------------------------------------------------ server

interface WsClient {
  socket: Socket;
  clientId: string;
}

function wsFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  let header: Buffer;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function parseMultipart(body: Buffer, contentType: string): Map<string, { filename: string | null; data: Buffer }> {
  const out = new Map<string, { filename: string | null; data: Buffer }>();
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return out;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let pos = body.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (body.subarray(start, start + 2).toString() === '--') break;
    const headerEnd = body.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headers = body.subarray(start, headerEnd).toString('utf8');
    const next = body.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;
    const data = body.subarray(headerEnd + 4, next - 2); // strip trailing \r\n
    const name = /name="([^"]*)"/i.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1] ?? null;
    if (name) out.set(name, { filename, data: Buffer.from(data) });
    pos = next;
  }
  return out;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function startFakeComfyUI(opts: FakeComfyOptions = {}): Promise<FakeComfyUI> {
  let version = opts.version ?? '0.42.0';
  let supports3d = opts.supports3d ?? true;
  let nodeDelayMs = opts.nodeDelayMs ?? 5;
  let stepDelayMs = opts.stepDelayMs ?? 5;
  let steps = opts.steps ?? 4;
  let failAllStatus: number | null = null;
  let nextFailure: { kind: FakeComfyFailure; nodeClass?: string } | null = null;
  let interruptCount = 0;
  let interruptRequested = false;
  let counter = 0;
  const devices: FakeComfyDevice[] = opts.devices ?? [{ name: 'cuda:0 NVIDIA GeForce RTX 4080 : cudaMallocAsync', type: 'cuda', index: 0, vram_total: 17_170_956_288, vram_free: 15_900_000_000 }];
  const modelFiles: Record<string, string[]> = Object.fromEntries(DEFAULT_FOLDERS.map((f) => [f, [] as string[]]));
  for (const [folder, files] of Object.entries(opts.modelFiles ?? {})) modelFiles[folder] = [...files];
  const fixtureFile = opts.objectInfo ? null : fixturePath();
  const loaded: Record<string, unknown> | null = opts.objectInfo ?? (fixtureFile ? (JSON.parse(readFileSync(fixtureFile, 'utf8')) as Record<string, unknown>) : null);
  // The fixture carries recording notes under "_source" – not a node class.
  const fixture = loaded ? Object.fromEntries(Object.entries(loaded).filter(([k]) => !k.startsWith('_'))) : null;
  const objectInfo = (): Record<string, unknown> => {
    const all = fixture ?? builtinObjectInfo(() => modelFiles);
    if (supports3d) return all;
    return Object.fromEntries(Object.entries(all).filter(([k]) => !/Trellis|Pixal3D/.test(k)));
  };
  const requests: FakeComfyRequest[] = [];
  const prompts: FakeComfyPromptRecord[] = [];
  const uploads = new Map<string, Buffer>();
  const outputs = new Map<string, Buffer>(); // "type/subfolder/filename"
  const history = new Map<string, unknown>();
  const frees: unknown[] = [];
  const ws = new Set<WsClient>();
  const prefixCounters = new Map<string, number>();
  let running: FakeComfyPromptRecord | null = null;
  let idleWaiters: Array<() => void> = [];

  const broadcast = (clientId: string | null, msg: unknown) => {
    const frame = wsFrame(JSON.stringify(msg));
    for (const c of ws) if (!clientId || c.clientId === clientId) c.socket.write(frame);
  };
  const queueRemaining = () => prompts.filter((p) => p.status === 'pending' || p.status === 'running').length;
  const sendStatus = () => broadcast(null, { type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } });

  const topoOrder = (prompt: FakeComfyPromptRecord['prompt']): string[] => {
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string, depth: number) => {
      if (seen.has(id) || depth > 1000 || !prompt[id]) return;
      seen.add(id);
      for (const v of Object.values(prompt[id].inputs ?? {})) if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') visit(v[0], depth + 1);
      order.push(id);
    };
    for (const id of Object.keys(prompt).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))) visit(id, 0);
    return order;
  };

  const savedName = (prefix: string, ext: string, trailing: string) => {
    const clean = prefix.replace(/\\/g, '/');
    const slash = clean.lastIndexOf('/');
    const subfolder = slash >= 0 ? clean.slice(0, slash) : '';
    const base = slash >= 0 ? clean.slice(slash + 1) : clean;
    const n = (prefixCounters.get(clean) ?? 0) + 1;
    prefixCounters.set(clean, n);
    return { filename: `${base}_${String(n).padStart(5, '0')}${trailing}.${ext}`, subfolder, type: 'output' };
  };

  const finish = (p: FakeComfyPromptRecord, status: FakeComfyPromptRecord['status'], outs: Record<string, unknown>, messages: unknown[]) => {
    p.status = status;
    const outputNodes = Object.keys(outs);
    history.set(p.id, {
      prompt: [p.number, p.id, p.prompt, { client_id: p.clientId }, outputNodes],
      outputs: outs,
      status: { status_str: status === 'success' ? 'success' : 'error', completed: status === 'success', messages },
      meta: Object.fromEntries(outputNodes.map((n) => [n, { node_id: n, display_node: n, parent_node: null, real_node_id: n }])),
    });
  };

  const execute = async (p: FakeComfyPromptRecord) => {
    running = p;
    p.status = 'running';
    interruptRequested = false;
    const failure = nextFailure;
    nextFailure = null;
    const ts = () => Date.now();
    const messages: unknown[] = [['execution_start', { prompt_id: p.id, timestamp: ts() }], ['execution_cached', { nodes: [], prompt_id: p.id, timestamp: ts() }]];
    broadcast(p.clientId, { type: 'execution_start', data: { prompt_id: p.id, timestamp: ts() } });
    broadcast(p.clientId, { type: 'execution_cached', data: { nodes: [], prompt_id: p.id, timestamp: ts() } });
    const outs: Record<string, unknown> = {};
    const order = topoOrder(p.prompt);
    const failAt = failure ? (order.find((id) => (failure.nodeClass ? p.prompt[id].class_type === failure.nodeClass : SAMPLER_LIKE.test(p.prompt[id].class_type))) ?? order[0]) : null;
    const executed: string[] = [];
    for (const id of order) {
      const node = p.prompt[id];
      broadcast(p.clientId, { type: 'executing', data: { node: id, display_node: id, prompt_id: p.id } });
      const isSampler = SAMPLER_LIKE.test(node.class_type);
      const n = isSampler ? steps : 0;
      for (let i = 1; i <= n; i++) {
        if (interruptRequested) break;
        await delay(stepDelayMs);
        broadcast(p.clientId, { type: 'progress', data: { value: i, max: n, prompt_id: p.id, node: id } });
      }
      if (!isSampler) await delay(nodeDelayMs);
      if (interruptRequested || (failure?.kind === 'interrupted' && id === failAt)) {
        const data = { prompt_id: p.id, node_id: id, node_type: node.class_type, executed: [...executed], timestamp: ts() };
        messages.push(['execution_interrupted', data]);
        broadcast(p.clientId, { type: 'execution_interrupted', data });
        finish(p, 'interrupted', outs, messages);
        return;
      }
      if (failure && id === failAt && failure.kind !== 'interrupted') {
        const oom = failure.kind === 'oom';
        const data = {
          prompt_id: p.id,
          node_id: id,
          node_type: node.class_type,
          executed: [...executed],
          exception_message: oom
            ? 'Allocation on device 0 would exceed allowed memory. (out of memory)\nCurrently allocated     : 14.52 GiB\nRequested               : 2.00 GiB\nDevice limit            : 15.99 GiB'
            : `Fake failure in ${node.class_type}`,
          exception_type: oom ? 'torch.OutOfMemoryError' : 'RuntimeError',
          traceback: ['  File "execution.py", line 496, in execute\n', `  File "nodes.py", line 1, in ${node.class_type}\n`],
          current_inputs: {},
          current_outputs: {},
          timestamp: ts(),
        };
        messages.push(['execution_error', data]);
        broadcast(p.clientId, { type: 'execution_error', data });
        finish(p, 'error', outs, messages);
        return;
      }
      const prefix = typeof node.inputs?.filename_prefix === 'string' ? node.inputs.filename_prefix : 'ComfyUI';
      if (node.class_type === 'SaveImage' || node.class_type === 'PreviewImage') {
        const file = savedName(node.class_type === 'PreviewImage' ? `ComfyUI_temp_${id}` : prefix, 'png', '_');
        if (node.class_type === 'PreviewImage') file.type = 'temp';
        outputs.set(`${file.type}/${file.subfolder}/${file.filename}`, tinyPng(16, 16));
        outs[id] = { images: [file] };
      } else if (node.class_type === 'Save3DAdvanced' || node.class_type === 'SaveGLB') {
        const file = savedName(prefix, 'glb', '');
        outputs.set(`output/${file.subfolder}/${file.filename}`, tinyGlb());
        outs[id] = { '3d': [file], camera_info: [null], model_3d_info: [] };
      }
      if (outs[id]) broadcast(p.clientId, { type: 'executed', data: { node: id, display_node: id, output: outs[id], prompt_id: p.id } });
      executed.push(id);
    }
    broadcast(p.clientId, { type: 'executing', data: { node: null, prompt_id: p.id } });
    messages.push(['execution_success', { prompt_id: p.id, timestamp: ts() }]);
    broadcast(p.clientId, { type: 'execution_success', data: { prompt_id: p.id, timestamp: ts() } });
    finish(p, 'success', outs, messages);
  };

  let pumping = false;
  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const next = prompts.find((p) => p.status === 'pending');
        if (!next) break;
        await execute(next);
        running = null;
        sendStatus();
      }
    } finally {
      pumping = false;
      running = null;
      if (queueRemaining() === 0) {
        const w = idleWaiters;
        idleWaiters = [];
        for (const fn of w) fn();
      }
    }
  };

  const validate = (prompt: FakeComfyPromptRecord['prompt']): { status: number; body: unknown } | null => {
    if (!prompt || typeof prompt !== 'object' || Object.keys(prompt).length === 0) {
      return { status: 400, body: { error: { type: 'invalid_prompt', message: 'Cannot execute because the prompt is empty.', details: '', extra_info: {} }, node_errors: {} } };
    }
    const known = objectInfo();
    const validateClasses = fixture !== null || !supports3d;
    for (const [id, node] of Object.entries(prompt)) {
      if (!node || typeof node.class_type !== 'string') {
        return { status: 400, body: { error: { type: 'invalid_prompt', message: `Cannot execute because a node is missing the class_type property.`, details: `Node ID '#${id}'`, extra_info: {} }, node_errors: {} } };
      }
      const unknownClass = validateClasses ? !(node.class_type in known) : !supports3d && THREE_D_CLASS.test(node.class_type) && !(node.class_type in known);
      if (unknownClass) {
        return {
          status: 400,
          body: { error: { type: 'invalid_prompt', message: `Cannot execute because node ${node.class_type} does not exist.`, details: `Node ID '#${id}'`, extra_info: {} }, node_errors: {} },
        };
      }
    }
    const nodeErrors: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(prompt)) {
      const map = LOADER_FOLDERS[node.class_type];
      const errors: unknown[] = [];
      for (const [input, val] of Object.entries(node.inputs ?? {})) {
        if (typeof val !== 'string' || !MODEL_EXT.test(val)) continue;
        const folder = map?.[input] ?? null;
        const allowed = folder ? (modelFiles[folder] ?? []) : Object.values(modelFiles).flat();
        if (!allowed.includes(val)) {
          errors.push({
            type: 'value_not_in_list',
            message: 'Value not in list',
            details: `${input}: '${val}' not in ${JSON.stringify(allowed)}`,
            extra_info: { input_name: input, input_config: [allowed], received_value: val },
          });
        }
      }
      if (errors.length) nodeErrors[id] = { errors, dependent_outputs: [], class_type: node.class_type };
    }
    if (Object.keys(nodeErrors).length) {
      return { status: 400, body: { error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation', details: '', extra_info: {} }, node_errors: nodeErrors } };
    }
    return null;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse, raw: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname.replace(/^\/api(?=\/)/, '');
    const isJson = (req.headers['content-type'] ?? '').includes('json');
    let body: unknown = null;
    if (raw.length && isJson) {
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        body = raw.toString('utf8');
      }
    }
    requests.push({ method: req.method ?? 'GET', path, query: Object.fromEntries(url.searchParams), body });
    if (failAllStatus !== null) return sendJson(res, failAllStatus, { error: 'fake failure' });
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/system_stats') {
      return sendJson(res, 200, {
        system: {
          os: 'nt',
          ram_total: 34_359_738_368,
          ram_free: 20_000_000_000,
          comfyui_version: version,
          required_frontend_version: '1.30.0',
          python_version: '3.12.10 (fake)',
          pytorch_version: '2.9.0+cu128',
          embedded_python: true,
          argv: ['main.py'],
        },
        devices: devices.map((d, i) => ({ index: i, torch_vram_total: d.vram_total, torch_vram_free: d.vram_free, ...d })),
      });
    }
    if (method === 'GET' && path === '/object_info') return sendJson(res, 200, objectInfo());
    if (method === 'GET' && path.startsWith('/object_info/')) {
      const cls = decodeURIComponent(path.slice('/object_info/'.length));
      const all = objectInfo();
      return sendJson(res, 200, cls in all ? { [cls]: all[cls] } : {});
    }
    if (method === 'GET' && path === '/models') return sendJson(res, 200, Object.keys(modelFiles));
    if (method === 'GET' && path.startsWith('/models/')) {
      const folder = decodeURIComponent(path.slice('/models/'.length));
      if (!(folder in modelFiles)) return sendJson(res, 404, { error: 'unknown folder' });
      return sendJson(res, 200, modelFiles[folder]);
    }
    if (method === 'POST' && path === '/upload/image') {
      const parts = parseMultipart(raw, req.headers['content-type'] ?? '');
      const image = parts.get('image');
      if (!image || !image.filename) return sendJson(res, 400, { error: 'no image' });
      const subfolder = parts.get('subfolder')?.data.toString('utf8') ?? '';
      const overwrite = parts.get('overwrite')?.data.toString('utf8') === 'true';
      let name = image.filename.replace(/[\\/]/g, '_');
      const key = (n: string) => (subfolder ? `${subfolder}/${n}` : n);
      if (!overwrite) {
        let i = 1;
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        while (uploads.has(key(name))) name = `${base} (${i++})${ext}`;
      }
      uploads.set(key(name), image.data);
      return sendJson(res, 200, { name, subfolder, type: parts.get('type')?.data.toString('utf8') || 'input' });
    }
    if (method === 'POST' && path === '/prompt') {
      const b = (body ?? {}) as { prompt?: FakeComfyPromptRecord['prompt']; client_id?: string };
      const invalid = validate(b.prompt as FakeComfyPromptRecord['prompt']);
      if (invalid) return sendJson(res, invalid.status, invalid.body);
      const rec: FakeComfyPromptRecord = { id: randomUUID(), number: counter++, clientId: b.client_id ?? null, prompt: b.prompt as FakeComfyPromptRecord['prompt'], status: 'pending' };
      prompts.push(rec);
      sendJson(res, 200, { prompt_id: rec.id, number: rec.number, node_errors: {} });
      sendStatus();
      setTimeout(() => void pump(), 0);
      return;
    }
    if (method === 'GET' && path === '/queue') {
      const row = (p: FakeComfyPromptRecord) => [p.number, p.id, p.prompt, { client_id: p.clientId }, []];
      return sendJson(res, 200, { queue_running: prompts.filter((p) => p.status === 'running').map(row), queue_pending: prompts.filter((p) => p.status === 'pending').map(row) });
    }
    if (method === 'POST' && path === '/queue') {
      const b = (body ?? {}) as { delete?: string[]; clear?: boolean };
      for (const p of prompts) {
        if (p.status !== 'pending') continue;
        if (b.clear || (Array.isArray(b.delete) && b.delete.includes(p.id))) p.status = 'deleted';
      }
      sendStatus();
      res.writeHead(200).end();
      return;
    }
    if (method === 'POST' && path === '/interrupt') {
      interruptCount++;
      const target = (body as { prompt_id?: string } | null)?.prompt_id;
      if (running && (!target || target === running.id)) interruptRequested = true;
      res.writeHead(200).end();
      return;
    }
    if (method === 'POST' && path === '/free') {
      frees.push(body);
      res.writeHead(200).end();
      return;
    }
    if (method === 'GET' && (path === '/history' || path.startsWith('/history/'))) {
      if (path === '/history') return sendJson(res, 200, Object.fromEntries(history));
      const id = decodeURIComponent(path.slice('/history/'.length));
      return sendJson(res, 200, history.has(id) ? { [id]: history.get(id) } : {});
    }
    if (method === 'GET' && path === '/view') {
      const filename = url.searchParams.get('filename') ?? '';
      const subfolder = url.searchParams.get('subfolder') ?? '';
      const type = url.searchParams.get('type') ?? 'output';
      const data = type === 'input' ? uploads.get(subfolder ? `${subfolder}/${filename}` : filename) : outputs.get(`${type}/${subfolder}/${filename}`);
      if (!data) return sendJson(res, 404, { error: 'not found' });
      const mime = filename.endsWith('.glb') ? 'model/gltf-binary' : filename.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime, 'content-length': data.length });
      res.end(data);
      return;
    }
    sendJson(res, 404, { error: `fake ComfyUI: unknown endpoint ${method} ${path}` });
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      handle(req, res, Buffer.concat(chunks)).catch((e: unknown) => {
        if (!res.headersSent) sendJson(res, 500, { error: `fake server error: ${e instanceof Error ? e.message : String(e)}` });
        else res.destroy();
      });
    });
  });

  server.on('upgrade', (req, socket: Socket) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = req.headers['sec-websocket-key'];
    if (opts.websocket === false || url.pathname !== '/ws' || typeof key !== 'string') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client: WsClient = { socket, clientId: url.searchParams.get('clientId') ?? randomUUID() };
    ws.add(client);
    socket.write(wsFrame(JSON.stringify({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } }, sid: client.clientId } })));
    socket.on('data', (buf: Buffer) => {
      // Only control frames matter: close (8) → answer and end; ping (9) → pong.
      const opcode = buf[0] & 0x0f;
      if (opcode === 8) {
        socket.end(Buffer.from([0x88, 0x00]));
      } else if (opcode === 9) {
        socket.write(Buffer.from([0x8a, 0x00]));
      }
    });
    const drop = () => ws.delete(client);
    socket.on('close', drop);
    socket.on('error', drop);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    prompts,
    uploads,
    frees,
    interrupts: () => interruptCount,
    setModelFiles(folder, files) {
      modelFiles[folder] = [...files];
    },
    setVersion(v) {
      version = v;
    },
    setSupports3d(v) {
      supports3d = v;
    },
    setDelays(d) {
      if (d.nodeDelayMs !== undefined) nodeDelayMs = d.nodeDelayMs;
      if (d.stepDelayMs !== undefined) stepDelayMs = d.stepDelayMs;
      if (d.steps !== undefined) steps = d.steps;
    },
    failNext(kind, nodeClass) {
      nextFailure = { kind, nodeClass };
    },
    failAll(status) {
      failAllStatus = status;
    },
    idle() {
      if (queueRemaining() === 0 && !running) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of ws) c.socket.destroy();
        ws.clear();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
