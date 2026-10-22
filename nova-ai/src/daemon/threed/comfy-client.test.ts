// Tests for ComfyClient against an in-test 127.0.0.1 HTTP server: request shapes, German errors, timeouts/abort,
// streamed /view downloads, the polling fallback of watch() and the WebSocket path – once with an injected fake socket
// and once with Node's real global WebSocket against a minimal RFC 6455 server (handshake + unmasked frames).
// History payloads come from tests/fixtures/comfyui/history_samples.json (recorded from a real ComfyUI).
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import historySamples from '../../../tests/fixtures/comfyui/history_samples.json';
import systemStatsJson from '../../../tests/fixtures/comfyui/system_stats.json';
import { NovaError, isAbortError } from '../core/errors';
import {
  ComfyClient,
  isOutOfMemory,
  outputFiles,
  parsePromptRejection,
  safeUploadName,
  type ComfyErrorDetails,
  type ComfyHistoryEntry,
  type ComfyWatchEvent,
  type WebSocketLike,
} from './comfy-client';

// ---------------------------------------------------------------------------------------------------------------------
// Test server: records raw requests, optional WebSocket upgrade with a minimal RFC 6455 frame writer
// ---------------------------------------------------------------------------------------------------------------------

interface Rec {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

interface TestServer {
  url: string;
  requests: Rec[];
  close(): Promise<void>;
}

const servers: TestServer[] = [];

afterEach(async () => {
  while (servers.length) await (servers.pop() as TestServer).close();
});

async function startServer(handler: (req: Rec, res: ServerResponse) => void | Promise<void>, onUpgrade?: (req: IncomingMessage, socket: Duplex) => void): Promise<TestServer> {
  const requests: Rec[] = [];
  const upgraded = new Set<Duplex>();
  const server = http.createServer((raw, res) => {
    const chunks: Buffer[] = [];
    raw.on('data', (c: Buffer) => chunks.push(c));
    raw.on('end', () => {
      const url = new URL(raw.url ?? '/', 'http://127.0.0.1');
      const rec: Rec = { method: raw.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), headers: raw.headers, body: Buffer.concat(chunks) };
      requests.push(rec);
      Promise.resolve(handler(rec, res)).catch((e: unknown) => {
        if (!res.headersSent) json(res, 500, { error: String(e) });
      });
    });
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    upgraded.add(socket);
    socket.on('error', () => undefined);
    if (onUpgrade) onUpgrade(req, socket);
    else socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const s: TestServer = {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        for (const sock of upgraded) sock.destroy();
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
  servers.push(s);
  return s;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function acceptWebSocket(req: IncomingMessage, socket: Duplex): void {
  const key = String(req.headers['sec-websocket-key']);
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
}

/** Server → client frame (unmasked, FIN set). opcode 1 = text, 2 = binary. */
function wsFrame(payload: string | Buffer, opcode = 1): Buffer {
  const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  let header: Buffer;
  if (data.length < 126) header = Buffer.from([0x80 | opcode, data.length]);
  else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

const msg = (type: string, data: Record<string, unknown>) => JSON.stringify({ type, data });
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function unusedUrl(): Promise<string> {
  const s = http.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return `http://127.0.0.1:${port}`;
}

async function rejection(p: Promise<unknown>): Promise<NovaError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(NovaError);
    return e as NovaError;
  }
  throw new Error('expected a rejection');
}

const SAVE3D = historySamples.save3d.entry as unknown as ComfyHistoryEntry;
const EXEC_ERROR = historySamples.executionError.entry as unknown as ComfyHistoryEntry;
const INTERRUPTED = historySamples.interrupted.entry as unknown as ComfyHistoryEntry;

function client(url: string, extra: Partial<ConstructorParameters<typeof ComfyClient>[0]> = {}): ComfyClient {
  return new ComfyClient({ baseUrl: url, clientId: 'nova-test', webSocketFactory: null, pollIntervalMs: 10, safetyPollIntervalMs: 50, ...extra });
}

// ---------------------------------------------------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------------------------------------------------

describe('ComfyClient basics', () => {
  it('accepts only local http(s) endpoints', () => {
    for (const bad of ['http://192.168.1.20:8188', 'https://comfy.example.com', 'ftp://127.0.0.1:8188', 'kein-url']) {
      expect(() => new ComfyClient({ baseUrl: bad, clientId: 'x' })).toThrow(/auf diesem PC/);
    }
    const c = new ComfyClient({ baseUrl: 'http://localhost:8000/', clientId: 'abc def' });
    expect(c.baseUrl).toBe('http://localhost:8000');
    expect(c.webSocketUrl()).toBe('ws://localhost:8000/ws?clientId=abc+def');
    expect(() => new ComfyClient({ baseUrl: 'http://127.0.0.1:8188', clientId: ' ' })).toThrow(/Client-ID/);
  });

  it('systemStats parses the recorded /system_stats', async () => {
    const s = await startServer((req, res) => json(res, 200, systemStatsJson));
    const stats = await client(s.url).systemStats();
    expect(stats.version).toBe('0.42.0');
    expect(stats.devices[0]).toMatchObject({ name: 'cpu', type: 'cpu', index: null });
    expect(typeof stats.devices[0].vramTotalBytes).toBe('number');
    expect(s.requests[0].path).toBe('/system_stats');
  });

  it('systemStats rejects something that is not ComfyUI', async () => {
    const s = await startServer((req, res) => json(res, 200, { hello: 'world' }));
    expect((await rejection(client(s.url).systemStats())).message).toMatch(/kein ComfyUI/);
  });

  it('objectInfo fetches per class; unknown classes are absent', async () => {
    const s = await startServer((req, res) => {
      const name = decodeURIComponent(req.path.slice('/object_info/'.length));
      json(res, 200, name === 'Unbekannt' ? {} : { [name]: { input: { required: {} }, output: ['X'], name } });
    });
    const info = await client(s.url).objectInfo(['KSampler', 'Unbekannt', 'Save3DAdvanced', 'KSampler']);
    expect(Object.keys(info).sort()).toEqual(['KSampler', 'Save3DAdvanced']);
    expect(s.requests.map((r) => r.path).sort()).toEqual(['/object_info/KSampler', '/object_info/Save3DAdvanced', '/object_info/Unbekannt']);
  });

  it('listModels returns the file list, null for a folder ComfyUI does not know', async () => {
    const s = await startServer((req, res) => {
      if (req.path === '/models/vae') json(res, 200, ['ae.safetensors', 'sub\\x.safetensors']);
      else {
        res.writeHead(404);
        res.end();
      }
    });
    const c = client(s.url);
    expect(await c.listModels('vae')).toEqual(['ae.safetensors', 'sub\\x.safetensors']);
    expect(await c.listModels('geometry_estimation')).toBeNull();
  });

  it('uploadImage sends multipart (subfolder nova, overwrite) and returns the LoadImage value', async () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a]), randomBytes(5000)]);
    let parts: Record<string, { filename?: string; type?: string; data: Buffer }> = {};
    const s = await startServer((req, res) => {
      const boundary = /boundary=(.+)$/.exec(String(req.headers['content-type']))?.[1] as string;
      parts = parseMultipart(req.body, boundary);
      json(res, 200, { name: parts.image.filename, subfolder: 'nova', type: 'input' });
    });
    const value = await client(s.url).uploadImage(bytes, 'C:\\Users\\Max\\Bilder\\mein bild (1).png');
    expect(value).toBe('nova/mein_bild_1_.png');
    expect(parts.image.filename).toBe('mein_bild_1_.png');
    expect(parts.image.type).toBe('image/png');
    expect(Buffer.compare(parts.image.data, bytes)).toBe(0);
    expect(parts.subfolder.data.toString()).toBe('nova');
    expect(parts.overwrite.data.toString()).toBe('true');
    expect(parts.type.data.toString()).toBe('input');
    expect(s.requests[0].path).toBe('/upload/image');
  });

  it('safeUploadName keeps a safe base name with extension', () => {
    expect(safeUploadName('/home/u/a b.webp')).toBe('a_b.webp');
    expect(safeUploadName('..\\..\\x.jpg')).toBe('x.jpg');
    expect(safeUploadName('ohne-endung')).toBe('ohne-endung.png');
    expect(safeUploadName('')).toBe('bild.png');
  });

  it('interrupt, deleteFromQueue and free send the documented bodies', async () => {
    const s = await startServer((req, res) => {
      res.writeHead(200);
      res.end();
    });
    const c = client(s.url);
    await c.interrupt('p-1');
    await c.interrupt();
    await c.deleteFromQueue('p-2');
    await c.free();
    expect(s.requests.map((r) => [r.method, r.path, JSON.parse(r.body.toString())])).toEqual([
      ['POST', '/interrupt', { prompt_id: 'p-1' }],
      ['POST', '/interrupt', {}],
      ['POST', '/queue', { delete: ['p-2'] }],
      ['POST', '/free', { unload_models: true, free_memory: true }],
    ]);
  });

  it('history parses entries (null when unknown) and outputFiles finds 3D and image files', async () => {
    const s = await startServer((req, res) => json(res, 200, req.path.endsWith('/p-3d') ? { 'p-3d': { ...SAVE3D, prompt: [1, 'p-3d'] } } : {}));
    const c = client(s.url);
    const entry = await c.history('p-3d');
    expect(entry?.status?.status_str).toBe('success');
    expect(outputFiles(entry as ComfyHistoryEntry)).toEqual([{ nodeId: '5', kind: '3d', filename: 'job_demo_00001.glb', subfolder: 'nova', type: 'output' }]);
    expect(outputFiles(historySamples.saveImage.entry as unknown as ComfyHistoryEntry)[0]).toMatchObject({ kind: 'images', subfolder: 'nova', type: 'output' });
    expect(await c.history('nope')).toBeNull();
  });

  it('queue lists running and pending ids in queue order', async () => {
    const s = await startServer((req, res) =>
      json(res, 200, {
        queue_running: [[5, 'run-1', {}, {}, []]],
        queue_pending: [
          [9, 'pend-b', {}, {}, []],
          [7, 'pend-a', {}, {}, []],
        ],
      }),
    );
    expect(await client(s.url).queue()).toEqual({ running: ['run-1'], pending: ['pend-a', 'pend-b'] });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Errors, timeouts, abort, streaming
// ---------------------------------------------------------------------------------------------------------------------

describe('ComfyClient errors and transfers', () => {
  it('connection refused → TOOL_MISSING with a German hint', async () => {
    const e = await rejection(client(await unusedUrl()).systemStats());
    expect(e.code).toBe('TOOL_MISSING');
    expect(e.message).toMatch(/ComfyUI ist nicht erreichbar/);
    expect((e.details as ComfyErrorDetails).networkCode).toBe('ECONNREFUSED');
  });

  it('HTTP 500 → DEPENDENCY_FAILED with status and message', async () => {
    const s = await startServer((req, res) => json(res, 500, { error: { message: 'kaputt' } }));
    const e = await rejection(client(s.url).systemStats());
    expect(e.code).toBe('DEPENDENCY_FAILED');
    expect(e.message).toContain('HTTP 500');
    expect(e.message).toContain('kaputt');
    expect((e.details as ComfyErrorDetails).status).toBe(500);
  });

  it('times out slow requests and honours an AbortSignal', async () => {
    const s = await startServer(async (req, res) => {
      await delay(400);
      json(res, 200, {});
    });
    const timedOut = await rejection(client(s.url, { timeoutMs: 50 }).queue());
    expect(timedOut.code).toBe('DEPENDENCY_FAILED');
    expect((timedOut.details as ComfyErrorDetails).timedOut).toBe(true);

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    const aborted = await rejection(client(s.url).queue({ signal: ac.signal }));
    expect(aborted.code).toBe('CANCELLED');
    expect(isAbortError(aborted)).toBe(true);
    const pre = await rejection(client(s.url).queue({ signal: AbortSignal.abort() }));
    expect(pre.code).toBe('CANCELLED');
  });

  it('view streams large files with an idle timeout (not an overall limit) and reports progress', async () => {
    const data = randomBytes(3 * 1024 * 1024 + 17);
    const s = await startServer(async (req, res) => {
      if (req.query.filename !== 'job_00001.glb') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': data.length });
      for (let off = 0; off < data.length; off += 512 * 1024) {
        res.write(data.subarray(off, off + 512 * 1024));
        await delay(40);
      }
      res.end();
    });
    const c = client(s.url);
    const progress: number[] = [];
    // Total transfer ≈ 280 ms, longer than the 150 ms idle timeout: must still succeed.
    const buf = await c.view({ filename: 'job_00001.glb', subfolder: 'nova', type: 'output' }, { idleTimeoutMs: 150, onProgress: (r) => progress.push(r) });
    expect(Buffer.compare(buf, data)).toBe(0);
    expect(progress.at(-1)).toBe(data.length);
    expect(s.requests[0].query).toEqual({ filename: 'job_00001.glb', subfolder: 'nova', type: 'output' });
    expect((await rejection(c.view({ filename: 'fehlt.glb' }))).code).toBe('NOT_FOUND');
    expect((await rejection(c.view({ filename: 'job_00001.glb' }, { maxBytes: 1024 }))).message).toMatch(/zu groß/);
  });

  it('view fails when the transfer stalls longer than the idle timeout', async () => {
    const s = await startServer(async (req, res) => {
      res.writeHead(200, { 'content-length': 100 });
      res.write(Buffer.alloc(10));
      await delay(500);
      res.end(Buffer.alloc(90));
    });
    const e = await rejection(client(s.url).view({ filename: 'x.glb' }, { idleTimeoutMs: 80 }));
    expect((e.details as ComfyErrorDetails).timedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// POST /prompt
// ---------------------------------------------------------------------------------------------------------------------

const MISSING_MODEL_BODY = {
  error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation', details: '', extra_info: {} },
  node_errors: {
    '40': {
      errors: [
        {
          type: 'value_not_in_list',
          message: 'Value not in list',
          details: "unet_name: 'trellis_2_int8_convrot.safetensors' not in []",
          extra_info: { input_name: 'unet_name', input_config: null, received_value: 'trellis_2_int8_convrot.safetensors' },
        },
      ],
      dependent_outputs: ['322'],
      class_type: 'UNETLoader',
    },
  },
};

describe('ComfyClient.queuePrompt', () => {
  it('posts prompt + client_id and returns the prompt id', async () => {
    const s = await startServer((req, res) => json(res, 200, { prompt_id: 'abc-123', number: 4, node_errors: {} }));
    const prompt = { '1': { class_type: 'EmptyImage', inputs: { width: 8 } } };
    expect(await client(s.url).queuePrompt(prompt)).toEqual({ promptId: 'abc-123', number: 4, nodeErrors: {} });
    expect(JSON.parse(s.requests[0].body.toString())).toEqual({ prompt, client_id: 'nova-test' });
  });

  it('missing model files → VALIDATION naming file and folder', async () => {
    const s = await startServer((req, res) => json(res, 400, MISSING_MODEL_BODY));
    const e = await rejection(client(s.url).queuePrompt({ '40': { class_type: 'UNETLoader', inputs: {} } }));
    expect(e.code).toBe('VALIDATION');
    expect(e.message).toBe('ComfyUI kann den Auftrag nicht starten: Es fehlen Modelldateien – „trellis_2_int8_convrot.safetensors“ (Ordner „diffusion_models“).');
    expect(e.userAction).toMatch(/3D-Modelle/);
    expect((e.details as ComfyErrorDetails).missingModels).toEqual([
      { nodeId: '40', classType: 'UNETLoader', input: 'unet_name', name: 'trellis_2_int8_convrot.safetensors', folder: 'diffusion_models' },
    ]);
  });

  it('missing node class → VALIDATION asking for a ComfyUI update', async () => {
    const body = {
      error: {
        type: 'missing_node_type',
        message: "Node 'ID #91' not found. The custom node may not be installed.",
        details: "Node ID '#91'",
        extra_info: { node_id: '91', class_type: 'Trellis2ShapeStage', node_title: 'Trellis2ShapeStage' },
      },
      node_errors: {},
    };
    const s = await startServer((req, res) => json(res, 400, body));
    const e = await rejection(client(s.url).queuePrompt({}));
    expect(e.message).toContain('fehlt der Knoten „Trellis2ShapeStage“');
    expect(e.userAction).toMatch(/aktualisieren/);
  });

  it('other node errors → German list with node, input and the original text', async () => {
    const body = {
      error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation', details: '', extra_info: {} },
      node_errors: {
        '186': {
          errors: [{ type: 'value_bigger_than_max', message: 'Value 90000000 bigger than max of 50000000', details: 'target_face_count', extra_info: { input_name: 'target_face_count' } }],
          dependent_outputs: ['322'],
          class_type: 'DecimateMesh',
        },
      },
    };
    const s = await startServer((req, res) => json(res, 400, body));
    const e = await rejection(client(s.url).queuePrompt({}));
    expect(e.message).toBe(
      'ComfyUI hat den Auftrag abgelehnt: Knoten „DecimateMesh“ (#186), Eingabe „target_face_count“: Wert ist größer als erlaubt (Value 90000000 bigger than max of 50000000: target_face_count).',
    );
  });

  it('parsePromptRejection resolves the model name from the prompt when ComfyUI omits it', () => {
    const body = structuredClone(MISSING_MODEL_BODY);
    delete (body.node_errors['40'].errors[0].extra_info as Record<string, unknown>).received_value;
    const parsed = parsePromptRejection(body, { '40': { class_type: 'UNETLoader', inputs: { unet_name: 'x.safetensors' } } });
    expect(parsed.missingModels[0]).toMatchObject({ name: 'x.safetensors', folder: 'diffusion_models' });
    expect(parsed.topLevel?.type).toBe('prompt_outputs_failed_validation');
  });

  it('isOutOfMemory recognises CUDA/ROCm/CPU allocation failures', () => {
    expect(isOutOfMemory('torch.OutOfMemoryError', 'Allocation on device')).toBe(true);
    expect(isOutOfMemory('RuntimeError', 'CUDA out of memory. Tried to allocate 2.00 GiB')).toBe(true);
    expect(isOutOfMemory('RuntimeError', 'HIP out of memory')).toBe(true);
    expect(isOutOfMemory(null, "DefaultCPUAllocator: can't allocate memory")).toBe(true);
    expect(isOutOfMemory('safetensors._safetensors_rust.SafetensorError', 'Error while deserializing header: header too small')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// watch(): polling fallback
// ---------------------------------------------------------------------------------------------------------------------

function scriptedComfy(steps: Array<'pending' | 'running' | 'gone' | ComfyHistoryEntry>) {
  let i = 0;
  const current = () => steps[Math.min(i, steps.length - 1)];
  return (req: Rec, res: ServerResponse) => {
    const step = current();
    if (req.path.startsWith('/history/')) {
      const id = decodeURIComponent(req.path.slice('/history/'.length));
      if (typeof step === 'object') return json(res, 200, { [id]: step });
      return json(res, 200, {});
    }
    if (req.path === '/queue') {
      i++;
      if (step === 'pending') return json(res, 200, { queue_running: [[1, 'other', {}, {}, []]], queue_pending: [[2, 'p1', {}, {}, []]] });
      if (step === 'running') return json(res, 200, { queue_running: [[2, 'p1', {}, {}, []]], queue_pending: [] });
      return json(res, 200, { queue_running: [], queue_pending: [] });
    }
    res.writeHead(404);
    res.end();
  };
}

describe('ComfyClient.watch – polling fallback', () => {
  it('follows queue position and running state until the history entry arrives', async () => {
    const s = await startServer(scriptedComfy(['pending', 'pending', 'running', 'running', SAVE3D]));
    const events: ComfyWatchEvent[] = [];
    const entry = await client(s.url).watch('p1', (e) => events.push(e));
    expect(entry.outputs['5']).toEqual(SAVE3D.outputs['5']);
    expect(events).toEqual([{ type: 'transport', transport: 'polling', reason: 'Kein WebSocket verfügbar' }, { type: 'queued', position: 0 }, { type: 'execution_start' }]);
  });

  it('turns an error entry into a German error, OOM into VRAM_INSUFFICIENT', async () => {
    const s1 = await startServer(scriptedComfy([EXEC_ERROR]));
    const e1 = await rejection(client(s1.url).watch('p1', () => undefined));
    expect(e1.code).toBe('DEPENDENCY_FAILED');
    expect(e1.message).toBe('ComfyUI meldet einen Fehler im Knoten „VAELoader“ (#117): Error while deserializing header: header too small');

    const oom = structuredClone(EXEC_ERROR);
    const data = (oom.status?.messages.find((m) => m[0] === 'execution_error') as [string, Record<string, unknown>])[1];
    data.exception_type = 'torch.OutOfMemoryError';
    data.exception_message = 'CUDA out of memory. Tried to allocate 1.50 GiB';
    data.node_type = 'Trellis2TextureStage';
    const s2 = await startServer(scriptedComfy([oom]));
    const e2 = await rejection(client(s2.url).watch('p1', () => undefined));
    expect(e2.code).toBe('VRAM_INSUFFICIENT');
    expect(e2.message).toContain('Grafikspeicher');
    expect(e2.userAction).toContain('„Entwurf“');
    expect((e2.details as ComfyErrorDetails).outOfMemory).toBe(true);
  });

  it('reports an interrupted prompt as CANCELLED', async () => {
    const s = await startServer(scriptedComfy([INTERRUPTED]));
    const e = await rejection(client(s.url).watch('p1', () => undefined));
    expect(e.code).toBe('CANCELLED');
    expect((e.details as ComfyErrorDetails).interrupted).toBe(true);
  });

  it('gives up when the prompt is neither queued, running nor in the history', async () => {
    const s = await startServer(scriptedComfy(['gone']));
    const e = await rejection(client(s.url).watch('p1', () => undefined));
    expect(e.message).toMatch(/nicht mehr vorhanden/);
  });

  it('gives up with TOOL_MISSING when ComfyUI keeps failing during the job', async () => {
    // A failing server instead of a closed port: refused connections take about a second each on Windows.
    const s = await startServer((req, res) => json(res, 503, { error: 'busy' }));
    const e = await rejection(client(s.url, { pollIntervalMs: 1 }).watch('p1', () => undefined));
    expect(e.code).toBe('TOOL_MISSING');
    expect(e.message).toMatch(/abgebrochen/);
    expect(s.requests.length).toBeGreaterThanOrEqual(15);
  });

  it('also detects a response that is cut off mid-transfer', async () => {
    const s = await startServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': 100 });
      res.write('{"queue_running": [');
      setTimeout(() => res.destroy(), 20);
    });
    const e = await rejection(client(s.url).queue());
    expect(e.code).toBe('DEPENDENCY_FAILED');
    expect(e.message).toMatch(/unterbrochen/);
  });

  it('rejects with CANCELLED when the caller aborts', async () => {
    const s = await startServer(scriptedComfy(['running']));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const e = await rejection(client(s.url).watch('p1', () => undefined, ac.signal));
    expect(isAbortError(e)).toBe(true);
    expect((await rejection(client(s.url).watch('p1', () => undefined, AbortSignal.abort()))).code).toBe('CANCELLED');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// watch(): WebSocket
// ---------------------------------------------------------------------------------------------------------------------

type Listener = (event: { data?: unknown }) => void;

class FakeSocket implements WebSocketLike {
  readyState = 0;
  binaryType = 'blob';
  closed = false;
  private listeners: Record<string, Listener[]> = {};
  constructor(readonly url: string) {}
  addEventListener(type: string, l: Listener): void {
    (this.listeners[type] ??= []).push(l);
  }
  close(): void {
    this.closed = true;
  }
  fire(type: 'open' | 'message' | 'error' | 'close', data?: unknown): void {
    if (type === 'open') this.readyState = 1;
    for (const l of this.listeners[type] ?? []) l({ data });
  }
}

describe('ComfyClient.watch – WebSocket', () => {
  it('parses progress/executing/success messages for its prompt only and resolves from /history', async () => {
    let finished = false;
    const s = await startServer((req, res) => json(res, 200, finished ? { p1: SAVE3D } : {}));
    let socket: FakeSocket | null = null;
    const c = client(s.url, { webSocketFactory: (url) => (socket = new FakeSocket(url)), safetyPollIntervalMs: 10_000 });
    const events: ComfyWatchEvent[] = [];
    const done = c.watch('p1', (e) => events.push(e));
    const ws = socket as unknown as FakeSocket;
    expect(ws.url).toBe(`${s.url.replace('http', 'ws')}/ws?clientId=nova-test`);
    expect(ws.binaryType).toBe('arraybuffer');
    ws.fire('open');
    await delay(20);
    ws.fire('message', msg('status', { status: { exec_info: { queue_remaining: 1 } }, sid: 'nova-test' }));
    ws.fire('message', msg('execution_start', { prompt_id: 'p1' }));
    ws.fire('message', msg('progress', { prompt_id: 'other', node: '3', value: 1, max: 2 }));
    ws.fire('message', msg('executing', { node: '3', prompt_id: 'p1' }));
    ws.fire('message', msg('progress', { prompt_id: 'p1', node: '3', value: 5, max: 12 }));
    ws.fire('message', new ArrayBuffer(8));
    ws.fire('message', 'kein json');
    ws.fire('message', msg('executed', { node: '322', output: SAVE3D.outputs['5'], prompt_id: 'p1' }));
    finished = true;
    ws.fire('message', msg('execution_success', { prompt_id: 'p1' }));
    const entry = await done;
    expect(entry.outputs).toEqual(SAVE3D.outputs);
    expect(events.map((e) => e.type)).toEqual(['transport', 'execution_start', 'executing', 'progress', 'executed', 'execution_success']);
    expect(events[3]).toEqual({ type: 'progress', node: '3', value: 5, max: 12 });
    expect(ws.closed).toBe(true);
  });

  it('rejects immediately on execution_error (OOM → VRAM_INSUFFICIENT)', async () => {
    const s = await startServer((req, res) => json(res, 200, {}));
    let socket: FakeSocket | null = null;
    const c = client(s.url, { webSocketFactory: (url) => (socket = new FakeSocket(url)), safetyPollIntervalMs: 10_000 });
    const events: ComfyWatchEvent[] = [];
    const done = c.watch('p1', (e) => events.push(e));
    const ws = socket as unknown as FakeSocket;
    ws.fire('open');
    ws.fire('message', msg('execution_error', { prompt_id: 'p1', node_id: '98', node_type: 'Trellis2TextureStage', exception_type: 'torch.OutOfMemoryError', exception_message: 'Allocation on device' }));
    const e = await rejection(done);
    expect(e.code).toBe('VRAM_INSUFFICIENT');
    expect(events.at(-1)).toEqual({ type: 'execution_error', nodeId: '98', nodeType: 'Trellis2TextureStage', exceptionType: 'torch.OutOfMemoryError', exceptionMessage: 'Allocation on device' });
  });

  it('falls back to polling when the socket fails or does not open in time', async () => {
    const s1 = await startServer(scriptedComfy(['running', SAVE3D]));
    let socket: FakeSocket | null = null;
    const events: ComfyWatchEvent[] = [];
    const done = client(s1.url, { webSocketFactory: (url) => (socket = new FakeSocket(url)) }).watch('p1', (e) => events.push(e));
    (socket as unknown as FakeSocket).fire('error');
    await done;
    expect(events[0]).toEqual({ type: 'transport', transport: 'polling', reason: 'WebSocket-Fehler' });

    const s2 = await startServer(scriptedComfy([SAVE3D]));
    const events2: ComfyWatchEvent[] = [];
    await client(s2.url, { webSocketFactory: (url) => new FakeSocket(url), wsConnectTimeoutMs: 30 }).watch('p1', (e) => events2.push(e));
    expect(events2[0]).toMatchObject({ transport: 'polling', reason: 'WebSocket-Verbindung kam nicht zustande' });

    const s3 = await startServer(scriptedComfy([SAVE3D]));
    const events3: ComfyWatchEvent[] = [];
    await client(s3.url, {
      webSocketFactory: () => {
        throw new Error('nope');
      },
    }).watch('p1', (e) => events3.push(e));
    expect(events3[0]).toMatchObject({ transport: 'polling' });
  });

  it('catches a prompt that finished before the socket opened (history check after open)', async () => {
    const s = await startServer((req, res) => json(res, 200, req.path.startsWith('/history/') ? { p1: SAVE3D } : {}));
    let socket: FakeSocket | null = null;
    const done = client(s.url, { webSocketFactory: (url) => (socket = new FakeSocket(url)), safetyPollIntervalMs: 10_000 }).watch('p1', () => undefined);
    (socket as unknown as FakeSocket).fire('open');
    expect((await done).outputs).toEqual(SAVE3D.outputs);
  });

  it("works with Node's real WebSocket against an RFC 6455 server", async () => {
    if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') return; // Node < 22
    let finished = false;
    let wsQuery = '';
    const s = await startServer(
      (req, res) => json(res, 200, finished ? { p1: SAVE3D } : {}),
      (req, socket) => {
        wsQuery = req.url ?? '';
        acceptWebSocket(req, socket);
        setTimeout(() => {
          socket.write(wsFrame(msg('status', { status: { exec_info: { queue_remaining: 0 } }, sid: 'nova-test' })));
          socket.write(wsFrame(msg('execution_start', { prompt_id: 'p1' })));
          socket.write(wsFrame(msg('executing', { node: '91', prompt_id: 'p1' })));
          socket.write(wsFrame(msg('progress', { value: 3, max: 12, prompt_id: 'p1', node: '91' })));
          socket.write(wsFrame(randomBytes(300), 2));
          socket.write(wsFrame(msg('progress', { value: 1, max: 1, prompt_id: 'p1', node: '91', pad: 'x'.repeat(70_000) })));
          finished = true;
          socket.write(wsFrame(msg('execution_success', { prompt_id: 'p1' })));
        }, 50);
      },
    );
    const events: ComfyWatchEvent[] = [];
    const c = new ComfyClient({ baseUrl: s.url, clientId: 'nova-test', pollIntervalMs: 10, safetyPollIntervalMs: 10_000 });
    const entry = await c.watch('p1', (e) => events.push(e));
    expect(entry.outputs).toEqual(SAVE3D.outputs);
    expect(wsQuery).toBe('/ws?clientId=nova-test');
    expect(events[0]).toEqual({ type: 'transport', transport: 'websocket' });
    expect(events.filter((e) => e.type === 'progress')).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'execution_success' });
  });
});

// ---------------------------------------------------------------------------------------------------------------------

function parseMultipart(body: Buffer, boundary: string): Record<string, { filename?: string; type?: string; data: Buffer }> {
  const out: Record<string, { filename?: string; type?: string; data: Buffer }> = {};
  const sep = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(sep);
  while (pos !== -1) {
    const start = pos + sep.length;
    if (body.subarray(start, start + 2).toString() === '--') break;
    const next = body.indexOf(sep, start);
    const part = body.subarray(start + 2, next - 2); // skip CRLF after boundary and before the next one
    const headerEnd = part.indexOf('\r\n\r\n');
    const headers = part.subarray(0, headerEnd).toString('utf8');
    const name = /name="([^"]+)"/.exec(headers)?.[1] as string;
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    const type = /Content-Type: (.+)/i.exec(headers)?.[1]?.trim();
    out[name] = { filename, type, data: part.subarray(headerEnd + 4) };
    pos = next;
  }
  return out;
}
