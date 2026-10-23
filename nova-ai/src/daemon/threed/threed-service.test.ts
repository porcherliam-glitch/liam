// Tests for the ThreeDService job lifecycle with a scripted ComfyClient (test-support.ts): image and text mode, output
// through the ChangeJournal with numeric suffix, the library folder, one job at a time, cancel (running and queued),
// out of memory, missing models (catalog and inside ComfyUI), engine checks, recover, shutdown, deleteJob, readFile,
// status/configure and deleteModel.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ThreeDEngineStatusSchema, ThreeDJobSchema } from '@shared/schemas';
import { tinyPng } from '../../../tests/fakes/fake-comfyui';
import { tempDir } from '../../../tests/helpers/core';
import { createThreeDJobStore } from './job-store';
import { createThreeDHarness, type ThreeDHarness } from './test-support';
import { PHASES, RESTART_MESSAGE, SHUTDOWN_MESSAGE, groupPromptNodes, imageTypeOf, isGlb, jobErrorText, sanitizeName } from './threed-service';

let h: ThreeDHarness | null = null;
afterEach(async () => {
  if (h) {
    await h.svc.shutdown();
    h.cleanup();
  }
  h = null;
});

function writeProjectImage(root: string, rel = 'bilder/truhe.png'): string {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), tinyPng());
  return rel;
}

describe('helpers', () => {
  it('sanitizes names, detects image types and GLB files, groups prompt nodes', () => {
    expect(sanitizeName('Große Holztruhe!')).toBe('Grosse-Holztruhe');
    expect(sanitizeName('  ../../con ')).toBe('modell');
    expect(sanitizeName('Café déjà vu')).toBe('Cafe-deja-vu');
    expect(sanitizeName('a'.repeat(100))).toHaveLength(60);
    expect(imageTypeOf(tinyPng())).toBe('png');
    expect(imageTypeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(imageTypeOf(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(imageTypeOf(Buffer.from('GIF89a'))).toBeNull();
    expect(isGlb(Buffer.from('not a glb file at all'))).toBe(false);
    const groups = groupPromptNodes({
      '1': { class_type: 'KSampler', inputs: {} },
      '2': { class_type: 'Trellis2TextureStage', inputs: { x: ['1', 0] } },
      '3': { class_type: 'KSampler', inputs: { x: ['2', 0] } },
      '4': { class_type: 'Save3DAdvanced', inputs: { x: ['3', 0] } },
    });
    expect(Object.fromEntries(groups)).toEqual({ '1': 'shape', '2': 'texture', '3': 'texture', '4': 'save' });
    expect(jobErrorText(new Error('x'))).toContain('Unerwarteter Fehler');
  });
});

describe('ThreeDService jobs', () => {
  it('image mode: uploads, runs, saves the .glb into the project via the journal and emits all phases', async () => {
    h = createThreeDHarness();
    const image = writeProjectImage(h.root);
    const job = await h.svc.generate({ mode: 'image', imagePath: image, projectId: h.project.id, seed: 7 });
    expect(ThreeDJobSchema.parse(job)).toMatchObject({ status: 'queued', mode: 'image', name: 'truhe', model: 'trellis2', quality: 'standard', seed: 7, taskId: null });
    const done = await h.svc.wait(job.id);
    expect(done).toMatchObject({ status: 'done', progress: 100, phase: null, outputRel: 'assets/3d/truhe.glb', error: null });
    expect(isGlb(readFileSync(join(h.root, 'assets/3d/truhe.glb')))).toBe(true);
    const rec = h.s.journal.list({ projectId: h.project.id })[0];
    expect(rec).toMatchObject({ path: 'assets/3d/truhe.glb', actor: 'nova', taskId: null, op: 'create' });
    const phases = h.events.jobs.filter((e) => e.id === job.id).map((e) => e.phase);
    for (const p of [PHASES.waiting, PHASES.upload, PHASES.shape, PHASES.texture, PHASES.save]) expect(phases).toContain(p);
    const progress = h.events.jobs.filter((e) => e.id === job.id && e.progress !== null).map((e) => e.progress as number);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(h.comfy.state.uploads[0].name).toBe(`${job.id}.png`);
    expect(h.comfy.state.prompts).toHaveLength(1);
    expect(h.comfy.state.calls.map((c) => c.method)).toContain('free');
    // Ollama models were unloaded before the job.
    expect(h.fetchCalls).toEqual([{ url: 'http://127.0.0.1:11434/api/generate', body: { model: 'qwen2.5-coder:7b', keep_alive: 0 } }]);
    expect(h.notifications).toEqual([{ title: '3D-Modell fertig', level: 'success' }]);
    // Same name again → numeric suffix, the existing file stays untouched.
    const before = readFileSync(join(h.root, 'assets/3d/truhe.glb'));
    const second = await h.svc.wait((await h.svc.generate({ mode: 'image', imagePath: image, projectId: h.project.id })).id);
    expect(second.outputRel).toBe('assets/3d/truhe-2.glb');
    expect(readFileSync(join(h.root, 'assets/3d/truhe.glb')).equals(before)).toBe(true);
    // readFile for the viewer.
    expect(h.svc.readFile(job.id, 'model')).toMatchObject({ mimeType: 'model/gltf-binary', sizeBytes: before.length });
    expect(h.svc.readFile(job.id, 'image').mimeType).toBe('image/png');
  });

  it('text mode: two prompts (reference image, then 3D), saves .glb + .png pair with the agent task id', async () => {
    h = createThreeDHarness();
    writeFileSync(join(h.root, 'placeholder.txt'), 'x');
    mkdirSync(join(h.root, 'assets', '3d'), { recursive: true });
    writeFileSync(join(h.root, 'assets/3d/Roboter.png'), 'user file'); // only the .png exists → the pair gets a suffix
    const job = await h.svc.generate({ mode: 'text', prompt: 'Ein kleiner Roboter', name: 'Roboter', projectId: h.project.id, quality: 'draft' }, { taskId: 'task_a', runId: 'run_9' });
    expect(job.taskId).toBe('task_a');
    const done = await h.svc.wait(job.id);
    expect(done.status).toBe('done');
    expect(done.outputRel).toBe('assets/3d/Roboter-2.glb');
    expect(done.imagePath).toBe(join(h.root, 'assets/3d/Roboter-2.png'));
    expect(readFileSync(join(h.root, 'assets/3d/Roboter.png'), 'utf8')).toBe('user file');
    expect(h.comfy.state.prompts).toHaveLength(2);
    const first = h.comfy.state.prompts[0].prompt;
    expect(Object.values(first).map((n) => n.class_type)).toContain('SaveImage');
    expect(JSON.stringify(first)).toContain('Ein kleiner Roboter. A single object, centered');
    expect(JSON.stringify(first)).toContain(`nova/${job.id}-ref`);
    const recs = h.s.journal.list({ projectId: h.project.id });
    expect(recs.map((r) => [r.path, r.taskId, r.runId])).toEqual(
      expect.arrayContaining([
        ['assets/3d/Roboter-2.glb', 'task_a', 'run_9'],
        ['assets/3d/Roboter-2.png', 'task_a', 'run_9'],
      ]),
    );
    const phases = h.events.jobs.filter((e) => e.id === job.id).map((e) => e.phase);
    expect(phases).toContain(PHASES.image);
    expect(h.notifications).toEqual([]); // agent jobs report through the task
    expect(existsSync(join(h.t.dir, '3d', job.id, 'referenz.png'))).toBe(false);
  });

  it('without a project the files go to the 3D library folder', async () => {
    h = createThreeDHarness();
    const done = await h.svc.wait((await h.svc.generate({ mode: 'text', prompt: 'Eine Vase' })).id);
    expect(done.status).toBe('done');
    expect(done.outputRel).toBeNull();
    expect(done.outputPath).toBe(join(h.t.dir, '3d', done.id, 'eine-vase.glb'));
    expect(done.imagePath).toBe(join(h.t.dir, '3d', done.id, 'eine-vase.png'));
    expect(isGlb(readFileSync(done.outputPath!))).toBe(true);
    // deleteJob with files removes the library folder.
    h.svc.deleteJob(done.id, true);
    expect(existsSync(join(h.t.dir, '3d', done.id))).toBe(false);
    expect(h.svc.get(done.id)).toBeNull();
  });

  it('image from base64 is stored in the job folder; invalid images are rejected', async () => {
    h = createThreeDHarness();
    const job = await h.svc.generate({ mode: 'image', imageBase64: tinyPng().toString('base64'), name: 'Kiste' });
    expect(job.imagePath).toBe(join(h.t.dir, '3d', job.id, 'eingabe.png'));
    await h.svc.wait(job.id);
    await expect(h.svc.generate({ mode: 'image', imageBase64: Buffer.from('GIF89a....').toString('base64') })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.svc.generate({ mode: 'image', imageBase64: '###' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.svc.generate({ mode: 'image', imagePath: 'fehlt.png', projectId: h.project.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(h.svc.generate({ mode: 'image', imagePath: 'relativ.png' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.svc.generate({ mode: 'image', imagePath: '../draussen.png', projectId: h.project.id })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_PROJECT' });
  });

  it('runs one job at a time and cancels a queued job immediately', async () => {
    h = createThreeDHarness({ comfy: { hold: true } });
    const a = await h.svc.generate({ mode: 'text', prompt: 'Erstes' });
    const b = await h.svc.generate({ mode: 'text', prompt: 'Zweites' });
    const c = await h.svc.generate({ mode: 'text', prompt: 'Drittes' });
    await h.comfy.state.holding();
    expect(h.svc.get(a.id)?.status).toBe('running');
    expect(h.svc.get(b.id)?.status).toBe('queued');
    expect(h.svc.cancel(c.id)).toMatchObject({ status: 'cancelled' });
    expect(h.comfy.state.prompts).toHaveLength(1);
    h.comfy.state.hold = false;
    h.comfy.state.release();
    expect((await h.svc.wait(a.id)).status).toBe('done');
    expect((await h.svc.wait(b.id)).status).toBe('done');
    expect(h.svc.get(c.id)?.status).toBe('cancelled');
    expect(h.comfy.state.prompts).toHaveLength(4); // a: 2 prompts, b: 2 prompts, c: none
  });

  it('cancel of a running job interrupts the started prompt in ComfyUI', async () => {
    h = createThreeDHarness({ comfy: { hold: true } });
    const job = await h.svc.generate({ mode: 'text', prompt: 'Ein Schwert' });
    await h.comfy.state.holding();
    expect(h.svc.cancel(job.id).phase).toBe('Wird abgebrochen …');
    const done = await h.svc.wait(job.id);
    expect(done).toMatchObject({ status: 'cancelled', error: null, phase: null });
    const methods = h.comfy.state.calls.map((c) => c.method);
    expect(methods).toContain('interrupt');
    expect(methods).not.toContain('deleteFromQueue');
    expect(h.comfy.state.calls.find((c) => c.method === 'interrupt')?.args[1]).toBe('prompt-1');
    expect(methods).toContain('free');
    expect(h.svc.cancel(job.id).status).toBe('cancelled'); // idempotent
  });

  it('cancel before the prompt started removes it from the ComfyUI queue', async () => {
    h = createThreeDHarness({ comfy: { hold: true, holdBeforeStart: true } });
    const job = await h.svc.generate({ mode: 'text', prompt: 'Ein Helm' });
    await h.comfy.state.holding();
    h.svc.cancel(job.id);
    expect((await h.svc.wait(job.id)).status).toBe('cancelled');
    const methods = h.comfy.state.calls.map((c) => c.method);
    expect(methods).toContain('deleteFromQueue');
  });

  it('out of GPU memory fails the job with a German hint', async () => {
    h = createThreeDHarness({ comfy: { failNext: 'oom' } });
    const done = await h.svc.wait((await h.svc.generate({ mode: 'text', prompt: 'Ein Drache' })).id);
    expect(done.status).toBe('failed');
    expect(done.error).toContain('Grafikspeicher');
    expect(done.error).toContain('Entwurf');
    expect(h.notifications).toEqual([{ title: '3D-Modell fehlgeschlagen', level: 'error' }]);
    expect(h.comfy.state.calls.map((c) => c.method)).toContain('free');
  });

  it('an interruption from outside (ComfyUI UI) fails the job with an explanation', async () => {
    h = createThreeDHarness({ comfy: { failNext: 'interrupted' } });
    const done = await h.svc.wait((await h.svc.generate({ mode: 'text', prompt: 'Ein Ball' })).id);
    expect(done).toMatchObject({ status: 'failed' });
    expect(done.error).toContain('in ComfyUI abgebrochen');
  });

  it('missing models: generate refuses (catalog); ComfyUI not seeing a file fails the job with the download hint', async () => {
    h = createThreeDHarness({ installed: ['trellis2'] });
    await expect(h.svc.generate({ mode: 'text', prompt: 'Ein Stuhl' })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE', message: expect.stringContaining('Z-Image Turbo') });
    await expect(h.svc.generate({ mode: 'image', imageBase64: tinyPng().toString('base64'), model: 'pixal3d' })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    h.comfy.state.files.diffusion_models = [];
    const done = await h.svc.wait((await h.svc.generate({ mode: 'image', imageBase64: tinyPng().toString('base64') })).id);
    expect(done.status).toBe('failed');
    expect(done.error).toContain('trellis_2_int8_convrot.safetensors');
    expect(done.error).toContain('3D-Modelle');
    expect(h.comfy.state.prompts).toHaveLength(0);
  });

  it('engine checks: not running and too old ComfyUI are refused with TOOL_MISSING', async () => {
    h = createThreeDHarness({ comfy: { running: false } });
    await expect(h.svc.generate({ mode: 'text', prompt: 'Ein Tisch' })).rejects.toMatchObject({ code: 'TOOL_MISSING', message: expect.stringContaining('nicht erreichbar') });
    h.comfy.state.running = true;
    h.comfy.state.supports3d = false;
    await expect(h.svc.generate({ mode: 'text', prompt: 'Ein Tisch' })).rejects.toMatchObject({ code: 'TOOL_MISSING', message: expect.stringContaining('aktualisieren') });
  });

  it('recover() fails jobs of a previous run; shutdown interrupts the running job', async () => {
    h = createThreeDHarness({ comfy: { hold: true } });
    const store = createThreeDJobStore(h.t.core.db);
    const base = { projectId: null, taskId: null, mode: 'text' as const, prompt: 'x', imagePath: null, model: 'trellis2' as const, quality: 'standard' as const, seed: 1, name: 'x', phase: 'Wartet', progress: 0, outputPath: null, outputRel: null, error: null, createdAt: 1, startedAt: null, endedAt: null };
    store.insert({ ...base, id: 'tdj_old1', status: 'queued' });
    store.insert({ ...base, id: 'tdj_old2', status: 'running' });
    store.insert({ ...base, id: 'tdj_old3', status: 'done' });
    h.svc.recover();
    expect(h.svc.get('tdj_old1')).toMatchObject({ status: 'failed', error: RESTART_MESSAGE });
    expect(h.svc.get('tdj_old2')).toMatchObject({ status: 'failed', error: RESTART_MESSAGE });
    expect(h.svc.get('tdj_old3')?.status).toBe('done');
    expect(h.events.jobs.filter((e) => e.id.startsWith('tdj_old')).length).toBe(2);

    const job = await h.svc.generate({ mode: 'text', prompt: 'Eine Lampe' });
    await h.comfy.state.holding();
    await h.svc.shutdown();
    expect(h.svc.get(job.id)).toMatchObject({ status: 'failed', error: SHUTDOWN_MESSAGE });
    expect(h.comfy.state.calls.map((c) => c.method)).toContain('interrupt');
    await expect(h.svc.generate({ mode: 'text', prompt: 'Noch eine' })).rejects.toMatchObject({ code: 'INTERRUPTED' });
  });

  it('deleteJob removes project files through the journal and refuses running jobs; jobs() filters by project', async () => {
    h = createThreeDHarness();
    const done = await h.svc.wait((await h.svc.generate({ mode: 'text', prompt: 'Ein Fass', projectId: h.project.id })).id);
    expect(h.svc.jobs({ projectId: h.project.id }).map((j) => j.id)).toEqual([done.id]);
    expect(h.svc.jobs({ projectId: 'prj_other' })).toEqual([]);
    h.svc.deleteJob(done.id, true);
    await new Promise((r) => setTimeout(r, 20));
    expect(existsSync(join(h.root, 'assets/3d/ein-fass.glb'))).toBe(false);
    expect(existsSync(join(h.root, 'assets/3d/ein-fass.png'))).toBe(false);
    const deletes = h.s.journal.list({ projectId: h.project.id }).filter((r) => r.op === 'delete');
    expect(deletes.map((r) => r.actor)).toEqual(['user', 'user']);
    expect(() => h!.svc.deleteJob('tdj_missing', false)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    h.comfy.state.hold = true;
    const running = await h.svc.generate({ mode: 'text', prompt: 'Läuft' });
    await h.comfy.state.holding();
    expect(() => h!.svc.deleteJob(running.id, false)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    h.svc.cancel(running.id);
    await h.svc.wait(running.id);
  });

  it('wait() rejects with an AbortError when the signal aborts', async () => {
    h = createThreeDHarness({ comfy: { hold: true } });
    const job = await h.svc.generate({ mode: 'text', prompt: 'Ein Hut' });
    const ac = new AbortController();
    const p = h.svc.wait(job.id, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    h.svc.cancel(job.id);
    await h.svc.wait(job.id);
  });
});

describe('ThreeDService status, configure, models', () => {
  it('status reports engine, GPU, models folder and readiness; emits threed.status only on change', async () => {
    h = createThreeDHarness();
    const st = await h.svc.status(true);
    expect(ThreeDEngineStatusSchema.parse(st)).toMatchObject({
      installed: true,
      running: true,
      baseUrl: 'http://127.0.0.1:8188',
      version: '0.42.0',
      supports3d: true,
      modelsDir: h.models.dir,
      gpu: { name: 'NVIDIA GeForce RTX 4080', vramTotalBytes: 17_170_956_288 },
    });
    expect(st.message).toContain('bereit');
    const count = h.events.status;
    await h.svc.status(true);
    expect(h.events.status).toBe(count);
    h.comfy.state.running = false;
    const down = await h.svc.status(true);
    expect(down).toMatchObject({ running: false, installed: true });
    expect(down.message).toContain('starten');
    expect(h.events.status).toBe(count + 1);
    // cached without refresh
    h.comfy.state.running = true;
    expect((await h.svc.status()).running).toBe(false);
  });

  it('status explains missing install, outdated ComfyUI and missing models', async () => {
    h = createThreeDHarness({ installed: [], integrationAvailable: false, comfy: { running: false } });
    expect((await h.svc.status(true)).message).toContain('nicht gefunden');
    h.comfy.state.running = true;
    h.comfy.state.supports3d = false;
    expect((await h.svc.status(true)).message).toContain('aktualisieren');
    h.comfy.state.supports3d = true;
    expect((await h.svc.status(true)).message).toContain('TRELLIS.2 herunterladen');
  });

  it('configure accepts only local addresses and real ComfyUI models folders', async () => {
    h = createThreeDHarness();
    await expect(h.svc.configure({ engineUrl: 'http://192.168.0.5:8188' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.svc.configure({ engineUrl: 'https://example.com' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const st = await h.svc.configure({ engineUrl: 'localhost:8000/' });
    expect(h.t.core.settings.section('threeD').engineUrl).toBe('http://localhost:8000');
    expect(st.baseUrl).toBe('http://localhost:8000');
    const notModels = tempDir();
    try {
      await expect(h.svc.configure({ modelsDir: notModels.dir })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('kein ComfyUI-Modellordner') });
      await expect(h.svc.configure({ modelsDir: 'relativ/models' })).rejects.toMatchObject({ code: 'VALIDATION' });
      // The ComfyUI folder itself is accepted and resolved to its "models" sub folder.
      mkdirSync(join(notModels.dir, 'models', 'checkpoints'), { recursive: true });
      await h.svc.configure({ modelsDir: notModels.dir });
      expect(h.t.core.settings.section('threeD').modelsDir).toBe(join(notModels.dir, 'models'));
      expect(h.events.modelsChanged).toBeGreaterThan(0);
      await h.svc.configure({ modelsDir: '', engineUrl: '' });
      expect(h.t.core.settings.section('threeD')).toMatchObject({ modelsDir: '', engineUrl: '' });
    } finally {
      notModels.cleanup();
    }
  });

  it('a non-local engine address set through the settings is not used', async () => {
    h = createThreeDHarness();
    h.t.core.settings.update({ threeD: { engineUrl: 'http://10.0.0.2:8188' } });
    const st = await h.svc.status(true);
    expect(st.running).toBe(false);
    expect(st.message).toContain('Nur lokale Adressen');
    expect(h.comfy.state.calls.filter((c) => c.method === 'systemStats')).toHaveLength(0);
  });

  it('models() reports presence; deleteModel keeps files another installed model needs', async () => {
    h = createThreeDHarness({ installed: ['trellis2', 'pixal3d'] });
    const models = await h.svc.models();
    expect(models.find((m) => m.id === 'trellis2')).toMatchObject({ installed: true, missingBytes: 0 });
    expect(models.find((m) => m.id === 'z_image_turbo')).toMatchObject({ installed: false });
    await h.svc.deleteModel('trellis2');
    expect(existsSync(join(h.models.dir, 'diffusion_models', 'trellis_2_int8_convrot.safetensors'))).toBe(false);
    expect(existsSync(join(h.models.dir, 'vae', 'trellis_2_shape_vae_bf16.safetensors'))).toBe(true);
    expect(existsSync(join(h.models.dir, 'clip_vision', 'dino_v3_L_naf_fp32.safetensors'))).toBe(true);
    await h.svc.deleteModel('pixal3d');
    expect(existsSync(join(h.models.dir, 'vae', 'trellis_2_shape_vae_bf16.safetensors'))).toBe(false);
    expect(h.events.modelsChanged).toBe(2);
    expect(() => h!.svc.downloadModel('z_image_turbo')).not.toThrow();
  });

  it('downloadModel refuses an installed model and an unknown models folder', async () => {
    h = createThreeDHarness();
    expect(() => h!.svc.downloadModel('trellis2')).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    h.t.core.settings.update({ threeD: { modelsDir: '' } });
    expect(() => h!.svc.downloadModel('pixal3d')).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  it('prune keeps library jobs and removes old failed/project jobs', async () => {
    h = createThreeDHarness();
    const lib = await h.svc.wait((await h.svc.generate({ mode: 'text', prompt: 'Bibliothek' })).id);
    const prj = await h.svc.wait((await h.svc.generate({ mode: 'text', prompt: 'Projekt', projectId: h.project.id })).id);
    expect(h.svc.prune(Date.now() + 1000)).toBe(1);
    expect(h.svc.get(lib.id)).not.toBeNull();
    expect(h.svc.get(prj.id)).toBeNull();
  });
});
