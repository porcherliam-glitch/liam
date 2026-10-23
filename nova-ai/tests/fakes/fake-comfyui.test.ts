// Tests for the fake ComfyUI test double itself: valid GLB/PNG assets, object_info from the recorded fixture,
// ComfyUI-like /prompt validation (node_errors for missing model files, unknown classes), execution with history and
// /view, WebSocket progress (Node's global WebSocket), queue delete, interrupt, failures and /free.
import { afterEach, describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { modelFilesFor, startFakeComfyUI, tinyGlb, tinyPng, type FakeComfyUI } from './fake-comfyui';

let comfy: FakeComfyUI | null = null;
afterEach(async () => {
  await comfy?.close();
  comfy = null;
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function textPrompt(unet = 'z_image_turbo_int8_convrot.safetensors') {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: unet, weight_dtype: 'default' } },
    '2': { class_type: 'KSampler', inputs: { model: ['1', 0], seed: 1, steps: 8 } },
    '3': { class_type: 'SaveImage', inputs: { images: ['2', 0], filename_prefix: 'nova/job-ref' } },
  };
}

async function history(url: string, id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const h = await json(await fetch(`${url}/history/${id}`));
    if (h[id]) return h[id] as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no history');
}

describe('fake ComfyUI', () => {
  it('builds a structurally valid GLB (glTF 2.0) and PNG', () => {
    const glb = tinyGlb();
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const jsonLen = glb.readUInt32LE(12);
    expect(glb.readUInt32LE(16)).toBe(0x4e4f534a);
    const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8')) as { asset: { version: string }; accessors: Array<{ count: number }>; buffers: Array<{ byteLength: number }> };
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.accessors[0].count).toBe(3);
    const binOff = 20 + jsonLen;
    expect(glb.readUInt32LE(binOff + 4)).toBe(0x004e4942);
    expect(glb.readUInt32LE(binOff)).toBeGreaterThanOrEqual(gltf.buffers[0].byteLength);
    expect(jsonLen % 4).toBe(0);
    const png = tinyPng(4, 2);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    const idatLen = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
    expect(inflateSync(png.subarray(41, 41 + idatLen)).length).toBe((4 * 3 + 1) * 2);
  });

  it('serves system_stats, object_info from the fixture and model lists', async () => {
    comfy = await startFakeComfyUI({ modelFiles: modelFilesFor(['trellis2']) });
    const stats = await json(await fetch(`${comfy.url}/system_stats`));
    expect((stats.system as { comfyui_version: string }).comfyui_version).toBe('0.42.0');
    expect(await json(await fetch(`${comfy.url}/object_info/Trellis2ShapeStage`))).toHaveProperty('Trellis2ShapeStage');
    expect(await json(await fetch(`${comfy.url}/object_info/GibtEsNicht`))).toEqual({});
    expect(await json(await fetch(`${comfy.url}/object_info`))).not.toHaveProperty('_source');
    expect(await (await fetch(`${comfy.url}/models/diffusion_models`)).json()).toEqual(['trellis_2_int8_convrot.safetensors']);
    expect((await fetch(`${comfy.url}/models/unbekannt`)).status).toBe(404);
    comfy.setSupports3d(false);
    expect(await json(await fetch(`${comfy.url}/object_info/Trellis2ShapeStage`))).toEqual({});
  });

  it('rejects prompts like ComfyUI: missing model file → node_errors, unknown class → invalid_prompt', async () => {
    comfy = await startFakeComfyUI({ modelFiles: { diffusion_models: ['andere.safetensors'] } });
    const bad = await post(`${comfy.url}/prompt`, { prompt: textPrompt(), client_id: 'c1' });
    expect(bad.status).toBe(400);
    const body = await json(bad);
    expect((body.error as { type: string }).type).toBe('prompt_outputs_failed_validation');
    expect(body.node_errors).toMatchObject({ '1': { class_type: 'UNETLoader', errors: [{ type: 'value_not_in_list', extra_info: { input_name: 'unet_name', received_value: 'z_image_turbo_int8_convrot.safetensors' } }] } });
    const unknown = await post(`${comfy.url}/prompt`, { prompt: { '1': { class_type: 'GibtEsNicht', inputs: {} } } });
    expect(unknown.status).toBe(400);
    expect(((await json(unknown)).error as { type: string }).type).toBe('invalid_prompt');
  });

  it('executes prompts with WebSocket progress, history outputs and /view; uploads, free, queue delete', async () => {
    comfy = await startFakeComfyUI({ modelFiles: modelFilesFor(['z_image_turbo']), steps: 3 });
    const messages: Array<{ type: string; data: Record<string, unknown> }> = [];
    const ws = new WebSocket(`${comfy.url.replace('http', 'ws')}/ws?clientId=c1`);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws error')));
    });
    ws.addEventListener('message', (ev) => messages.push(JSON.parse(String(ev.data))));
    const res = await json(await post(`${comfy.url}/prompt`, { prompt: textPrompt(), client_id: 'c1' }));
    const id = res.prompt_id as string;
    const entry = await history(comfy.url, id);
    expect(entry.status).toMatchObject({ status_str: 'success', completed: true });
    const file = (entry.outputs as Record<string, { images: Array<{ filename: string; subfolder: string; type: string }> }>)['3'].images[0];
    expect(file).toEqual({ filename: 'job-ref_00001_.png', subfolder: 'nova', type: 'output' });
    const view = await fetch(`${comfy.url}/view?filename=${file.filename}&subfolder=nova&type=output`);
    expect(Buffer.from(await view.arrayBuffer()).subarray(1, 4).toString('ascii')).toBe('PNG');
    for (let i = 0; i < 100 && !messages.some((m) => m.type === 'execution_success'); i++) await new Promise((r) => setTimeout(r, 10));
    const types = messages.map((m) => m.type);
    expect(types[0]).toBe('status');
    expect(types).toEqual(expect.arrayContaining(['execution_start', 'executing', 'progress', 'executed', 'execution_success']));
    expect(messages.filter((m) => m.type === 'progress').map((m) => m.data.value)).toEqual([1, 2, 3]);
    ws.close();

    // upload (multipart) + view of the input
    const form = new FormData();
    form.append('image', new Blob([tinyPng()]), 'bild.png');
    form.append('subfolder', 'nova');
    form.append('overwrite', 'true');
    expect(await json(await fetch(`${comfy.url}/upload/image`, { method: 'POST', body: form }))).toEqual({ name: 'bild.png', subfolder: 'nova', type: 'input' });
    expect(comfy.uploads.get('nova/bild.png')?.equals(tinyPng())).toBe(true);
    expect((await post(`${comfy.url}/free`, { unload_models: true, free_memory: true })).status).toBe(200);
    expect(comfy.frees).toEqual([{ unload_models: true, free_memory: true }]);
    expect((await fetch(`${comfy.url}/view?filename=fehlt.glb&type=output`)).status).toBe(404);
  });

  it('simulates out of memory, interruption and deleting pending prompts', async () => {
    comfy = await startFakeComfyUI({ modelFiles: modelFilesFor(['z_image_turbo']) });
    comfy.failNext('oom');
    const a = (await json(await post(`${comfy.url}/prompt`, { prompt: textPrompt() }))).prompt_id as string;
    const ha = await history(comfy.url, a);
    const msgs = (ha.status as { status_str: string; messages: Array<[string, Record<string, unknown>]> }).messages;
    expect((ha.status as { status_str: string }).status_str).toBe('error');
    expect(msgs.find((m) => m[0] === 'execution_error')?.[1]).toMatchObject({ exception_type: 'torch.OutOfMemoryError', node_type: 'KSampler' });

    comfy.setDelays({ stepDelayMs: 30, steps: 30 });
    const b = (await json(await post(`${comfy.url}/prompt`, { prompt: textPrompt() }))).prompt_id as string;
    const c = (await json(await post(`${comfy.url}/prompt`, { prompt: textPrompt() }))).prompt_id as string;
    const q = await json(await fetch(`${comfy.url}/queue`));
    expect((q.queue_pending as unknown[][]).map((r) => r[1])).toContain(c);
    await post(`${comfy.url}/queue`, { delete: [c] });
    await new Promise((r) => setTimeout(r, 50));
    await post(`${comfy.url}/interrupt`, { prompt_id: b });
    const hb = await history(comfy.url, b);
    expect((hb.status as { messages: Array<[string]> }).messages.map((m) => m[0])).toContain('execution_interrupted');
    await comfy.idle();
    expect(comfy.prompts.find((p) => p.id === c)?.status).toBe('deleted');
    expect(comfy.interrupts()).toBe(1);
  });
});
