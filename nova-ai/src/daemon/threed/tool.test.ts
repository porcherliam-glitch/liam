// Tests for the agent tool generate_3d_model: disabled setting, engine/model problems as tool errors, the success path
// (project-relative .glb, task files, German summary), image input validation and cancel through the run's signal.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tinyPng } from '../../../tests/fakes/fake-comfyui';
import { createThreeDHarness, type ThreeDHarness } from './test-support';
import { createGenerate3dModelTool } from './tool';

let h: ThreeDHarness | null = null;
afterEach(async () => {
  if (h) {
    await h.svc.shutdown();
    h.cleanup();
  }
  h = null;
});

describe('generate_3d_model', () => {
  it('has the agent tool shape (not read-only, exactly one of description/image)', () => {
    h = createThreeDHarness();
    const tool = createGenerate3dModelTool(h.s);
    expect(tool).toMatchObject({ name: 'generate_3d_model', readOnly: false });
    expect(tool.schema.safeParse({ name: 'x' }).success).toBe(false);
    expect(tool.schema.safeParse({ name: 'x', description: 'Ein Hut', image: 'a.png' }).success).toBe(false);
    expect(tool.schema.safeParse({ name: 'x', description: 'Ein Hut', quality: 'draft', model: 'pixal3d' }).success).toBe(true);
    expect(tool.describe({ name: 'truhe', description: 'Eine Truhe' })).toBe('Erzeugt das 3D-Modell „truhe“ aus einer Beschreibung');
  });

  it('is refused when agents may not generate 3D models', async () => {
    h = createThreeDHarness();
    h.t.core.settings.update({ threeD: { agentsMayGenerate: false } });
    const r = await createGenerate3dModelTool(h.s).execute({ name: 'truhe', description: 'Eine Truhe' }, h.ctx());
    expect(r).toMatchObject({ status: 'error', code: 'TOOL_MISSING' });
    expect(r.content).toContain('ausgeschaltet');
    expect(h.comfy.state.prompts).toHaveLength(0);
  });

  it('reports a missing engine and missing models as tool errors the model can act on', async () => {
    h = createThreeDHarness({ comfy: { running: false } });
    const tool = createGenerate3dModelTool(h.s);
    const down = await tool.execute({ name: 'truhe', description: 'Eine Truhe' }, h.ctx());
    expect(down).toMatchObject({ status: 'error', code: 'TOOL_MISSING' });
    expect(down.content).toContain('ComfyUI');
    h.comfy.state.running = true;
    h.t.core.settings.update({ threeD: { modelsDir: '' } });
    const noModels = await tool.execute({ name: 'truhe', description: 'Eine Truhe' }, h.ctx());
    expect(noModels).toMatchObject({ status: 'error', code: 'MODEL_UNAVAILABLE' });
  });

  it('creates the model in the project, adds the files to the task and returns the relative path', async () => {
    h = createThreeDHarness();
    const r = await createGenerate3dModelTool(h.s).execute({ name: 'Schatztruhe', description: 'Eine hölzerne Schatztruhe', quality: 'draft' }, h.ctx());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.content).toContain('3D-Modell erstellt: assets/3d/Schatztruhe.glb');
    expect(r.content).toContain('Qualität Entwurf');
    expect(r.content).toContain('Referenzbild: assets/3d/Schatztruhe.png');
    expect(r.filesChanged).toEqual(['assets/3d/Schatztruhe.glb', 'assets/3d/Schatztruhe.png']);
    expect(r.data).toMatchObject({ path: 'assets/3d/Schatztruhe.glb', referenceImage: 'assets/3d/Schatztruhe.png' });
    expect(h.addedFiles.get('task_a')).toEqual(['assets/3d/Schatztruhe.glb', 'assets/3d/Schatztruhe.png']);
    const job = h.svc.jobs()[0];
    expect(job).toMatchObject({ taskId: 'task_a', projectId: h.project.id, quality: 'draft' });
    expect(h.s.journal.list({ projectId: h.project.id }).every((c) => c.taskId === 'task_a' && c.runId === 'run_1')).toBe(true);
  });

  it('image to 3D from a project image; absolute paths are refused', async () => {
    h = createThreeDHarness();
    mkdirSync(join(h.root, 'bilder'), { recursive: true });
    writeFileSync(join(h.root, 'bilder', 'helm.png'), tinyPng());
    const tool = createGenerate3dModelTool(h.s);
    const abs = await tool.execute({ name: 'helm', image: join(h.root, 'bilder', 'helm.png') }, h.ctx());
    expect(abs).toMatchObject({ status: 'error', code: 'VALIDATION' });
    const r = await tool.execute({ name: 'helm', image: 'bilder/helm.png' }, h.ctx());
    expect(r).toMatchObject({ status: 'ok', filesChanged: ['assets/3d/helm.glb'] });
    const outside = await tool.execute({ name: 'x', image: '../geheim.png' }, h.ctx());
    expect(outside).toMatchObject({ status: 'error', code: 'PATH_OUTSIDE_PROJECT' });
  });

  it('cancels the job when the agent run is aborted', async () => {
    h = createThreeDHarness({ comfy: { hold: true } });
    const ac = new AbortController();
    const p = createGenerate3dModelTool(h.s).execute({ name: 'lampe', description: 'Eine Lampe' }, h.ctx('task_a', ac.signal));
    await h.comfy.state.holding();
    ac.abort();
    expect(await p).toMatchObject({ status: 'error', code: 'CANCELLED' });
    await h.svc.idle();
    expect(h.svc.jobs()[0].status).toBe('cancelled');
  });

  it('a failed job becomes a tool error with the German reason', async () => {
    h = createThreeDHarness({ comfy: { failNext: 'oom' } });
    const r = await createGenerate3dModelTool(h.s).execute({ name: 'drache', description: 'Ein Drache' }, h.ctx());
    expect(r).toMatchObject({ status: 'error', code: 'DEPENDENCY_FAILED' });
    expect(r.content).toContain('Grafikspeicher');
  });
});
