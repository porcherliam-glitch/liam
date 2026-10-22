// Integration test of the 3D workshop with the REAL ComfyClient and workflow converter (bundled official template +
// object_info recorded from a real ComfyUI) against the scripted fake ComfyUI server (tests/fakes/fake-comfyui.ts –
// a test double over real HTTP and WebSocket): text → 3D into a project, image → 3D with Pixal3D into the library,
// model files ComfyUI does not see, out of GPU memory, cancel, and the engine status.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from '../../src/daemon/app';
import { DaemonClient } from '../../src/daemon/client';
import { testEndpoint } from '../helpers/endpoint';
import { startFakeComfyUI, modelFilesFor, tinyPng, type FakeComfyUI } from '../fakes/fake-comfyui';
import { ComfyClient } from '../../src/daemon/threed/comfy-client';
import { isGlb } from '../../src/daemon/threed/threed-service';
import { createThreeDHarness, type ThreeDHarness } from '../../src/daemon/threed/test-support';

let comfy: FakeComfyUI | null = null;
let h: ThreeDHarness | null = null;
afterEach(async () => {
  if (h) {
    await h.svc.shutdown();
    h.cleanup();
  }
  h = null;
  await comfy?.close();
  comfy = null;
});

async function setup(files = modelFilesFor(['trellis2', 'pixal3d', 'z_image_turbo'])) {
  comfy = await startFakeComfyUI({ modelFiles: files, nodeDelayMs: 1, stepDelayMs: 1, steps: 3 });
  h = createThreeDHarness({
    installed: ['trellis2', 'pixal3d', 'z_image_turbo'],
    service: {
      clientFactory: (o) => new ComfyClient({ baseUrl: o.baseUrl, clientId: o.clientId, pollIntervalMs: 100, safetyPollIntervalMs: 500 }),
      workflow: {},
    },
  });
  h.t.core.settings.update({ threeD: { engineUrl: comfy.url } });
  return { comfy, h };
}

describe('3D workshop with the real ComfyClient + workflow and the fake ComfyUI', () => {
  it('reads the engine status from /system_stats and /object_info', async () => {
    const { h, comfy } = await setup();
    const st = await h.svc.status(true);
    expect(st).toMatchObject({ running: true, version: '0.42.0', supports3d: true, baseUrl: comfy.url, gpu: { name: 'NVIDIA GeForce RTX 4080' } });
    expect(st.message).toContain('bereit');
    comfy.setSupports3d(false);
    const old = await h.svc.status(true);
    expect(old.supports3d).toBe(false);
    expect(old.message).toContain('aktualisieren');
  });

  it('text → 3D: Z-Image reference image, TRELLIS.2 model, files in the project through the journal', async () => {
    const { h, comfy } = await setup();
    const job = await h.svc.generate({ mode: 'text', prompt: 'Eine kleine Holzkiste', name: 'kiste', projectId: h.project.id, quality: 'draft', seed: 1234 });
    const done = await h.svc.wait(job.id);
    expect(done.error).toBeNull();
    expect(done).toMatchObject({ status: 'done', outputRel: 'assets/3d/kiste.glb' });
    expect(isGlb(readFileSync(done.outputPath!))).toBe(true);
    expect(readFileSync(done.imagePath!).subarray(0, 4).toString('latin1')).toBe('\x89PNG');
    expect(comfy.prompts.map((p) => p.status)).toEqual(['success', 'success']);
    const [textPrompt, modelPrompt] = comfy.prompts.map((p) => p.prompt);
    expect(Object.values(textPrompt).map((n) => n.class_type)).toEqual(expect.arrayContaining(['UNETLoader', 'CLIPLoader', 'KSampler', 'SaveImage']));
    const classes = Object.values(modelPrompt).map((n) => n.class_type);
    expect(classes).toContain('Trellis2Conditioning');
    expect(classes).not.toContain('Pixal3DConditioning');
    expect(classes).toContain('Save3DAdvanced');
    const load = Object.values(modelPrompt).find((n) => n.class_type === 'LoadImage')!;
    expect(load.inputs.image).toBe(`nova/${job.id}.png`);
    expect(comfy.uploads.has(`nova/${job.id}.png`)).toBe(true);
    const save = Object.values(modelPrompt).find((n) => n.class_type === 'Save3DAdvanced')!;
    expect(save.inputs.filename_prefix).toBe(`nova/${job.id}`);
    const decimate = Object.values(modelPrompt).find((n) => n.class_type === 'DecimateMesh');
    expect(decimate?.inputs.target_face_count).toBe(200_000);
    expect(comfy.frees.length).toBeGreaterThanOrEqual(1);
    expect(h.s.journal.list({ projectId: h.project.id }).map((c) => c.path).sort()).toEqual(['assets/3d/kiste.glb', 'assets/3d/kiste.png']);
    // Progress reached the texture phase through WebSocket/polling events.
    const phases = new Set(h.events.jobs.filter((e) => e.id === job.id).map((e) => e.phase));
    // „Textur wird gebacken“ only comes from per-node events (WebSocket), never from NOVA's own phase switches.
    for (const p of ['Bild wird erzeugt', 'Bild wird übertragen', 'Form wird berechnet', 'Textur wird gebacken', 'Modell wird gespeichert']) expect(phases).toContain(p);
  });

  it('image → 3D with Pixal3D into the library', async () => {
    const { h, comfy } = await setup();
    const job = await h.svc.generate({ mode: 'image', imageBase64: tinyPng(32, 32).toString('base64'), model: 'pixal3d', name: 'figur' });
    const done = await h.svc.wait(job.id);
    expect(done.error).toBeNull();
    expect(done.status).toBe('done');
    expect(done.outputRel).toBeNull();
    expect(h.svc.readFile(done.id, 'model').mimeType).toBe('model/gltf-binary');
    const classes = Object.values(comfy.prompts[0].prompt).map((n) => n.class_type);
    expect(classes).toContain('Pixal3DConditioning');
    expect(classes).not.toContain('Trellis2Conditioning');
  });

  it('model files ComfyUI does not see fail the job before anything is queued', async () => {
    const files = modelFilesFor(['trellis2', 'z_image_turbo']);
    files.background_removal = [];
    const { h, comfy } = await setup(files);
    const done = await h.svc.wait((await h.svc.generate({ mode: 'image', imageBase64: tinyPng().toString('base64') })).id);
    expect(done.status).toBe('failed');
    expect(done.error).toContain('birefnet.safetensors');
    expect(done.error).toContain('background_removal');
    expect(comfy.prompts).toHaveLength(0);
  });

  it('out of GPU memory in ComfyUI fails the job with the German hint', async () => {
    const { h, comfy } = await setup();
    comfy.failNext('oom', 'Trellis2ShapeStage');
    const done = await h.svc.wait((await h.svc.generate({ mode: 'image', imageBase64: tinyPng().toString('base64') })).id);
    expect(done.status).toBe('failed');
    expect(done.error).toContain('Grafikspeicher');
    expect(comfy.frees.length).toBeGreaterThanOrEqual(1);
  });

  it('cancel interrupts the running prompt in ComfyUI', async () => {
    const { h, comfy } = await setup();
    comfy.setDelays({ stepDelayMs: 40, steps: 20 });
    const job = await h.svc.generate({ mode: 'image', imageBase64: tinyPng().toString('base64') });
    for (let i = 0; i < 300 && !h.events.jobs.some((e) => e.id === job.id && e.phase === 'Form wird berechnet'); i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 100));
    h.svc.cancel(job.id);
    const done = await h.svc.wait(job.id);
    expect(done.status).toBe('cancelled');
    expect(comfy.interrupts()).toBeGreaterThanOrEqual(1);
    await comfy.idle();
    expect(comfy.prompts[0].status).toBe('interrupted');
  });

  it('is wired into the daemon: threed.* over the real RPC transport, tool registered for the coder', async () => {
    comfy = await startFakeComfyUI({ modelFiles: modelFilesFor(['trellis2']) });
    const base = mkdtempSync(join(tmpdir(), 'nova-3d-'));
    const app = await startDaemon({ dataDir: join(base, 'data'), endpoint: testEndpoint(base), manualLoop: true, secretScheme: 'memory' });
    const client = new DaemonClient({ endpoint: app.endpoint, tokenPath: join(app.dataDir, 'daemon.token') });
    try {
      expect(app.status().methods).toEqual(expect.arrayContaining(['threed.status', 'threed.generate', 'threed.downloadModel', 'threed.readFile']));
      expect(app.services.tools.names()).toContain('generate_3d_model');
      const st = await client.rpc('threed.configure', { engineUrl: comfy.url });
      expect(st).toMatchObject({ running: true, supports3d: true, version: '0.42.0' });
      expect(await client.rpc('threed.models', {})).toHaveLength(3);
      expect(await client.rpc('threed.jobs', {})).toEqual([]);
      await expect(client.rpc('threed.job', { id: 'tdj_fehlt' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      client.close();
      await app.stop('test');
      rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
