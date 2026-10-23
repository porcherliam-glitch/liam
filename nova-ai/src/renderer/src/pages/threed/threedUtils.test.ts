import { describe, expect, it } from 'vitest';
import type { ThreeDEngineStatus, ThreeDJob, ThreeDModel } from '@shared/schemas';
import { DEMO_CRATE_GLB_BASE64, DEMO_REFERENCE_PNG_BASE64 } from '../../lib/mock-threed-assets';
import { threeDCatalog, threeDFileKey, threeDModelOf } from '../../lib/mock-data';
import {
  base64ByteLength,
  base64ToArrayBuffer,
  base64ToBytes,
  createBlocker,
  defaultJobSelection,
  engineState,
  filesFreedByDelete,
  gpuAdvice,
  outputPreview,
  sniffImageType,
  suggestName,
  timeHint,
  upsertJob,
  validateName,
} from './threedUtils';

const GiB = 1024 ** 3;

function status(patch: Partial<ThreeDEngineStatus> = {}): ThreeDEngineStatus {
  return {
    installed: true,
    running: true,
    baseUrl: 'http://127.0.0.1:8000',
    version: '0.42.0',
    supports3d: true,
    modelsDir: 'C:\\ComfyUI\\models',
    gpu: { name: 'NVIDIA GeForce RTX 4080', vramTotalBytes: 16 * GiB, vramFreeBytes: 12 * GiB },
    message: '',
    checkedAt: 0,
    ...patch,
  };
}

/** Catalog with the given models fully installed. */
function models(installed: string[]): ThreeDModel[] {
  const catalog = threeDCatalog();
  const present = new Set(catalog.filter((e) => installed.includes(e.id)).flatMap((e) => e.files.map(threeDFileKey)));
  return catalog.map((e) => threeDModelOf(e, present));
}

function job(id: string, status: ThreeDJob['status'], createdAt: number): ThreeDJob {
  return {
    id, projectId: null, taskId: null, mode: 'text', prompt: 'x', imagePath: null, model: 'trellis2', quality: 'standard', seed: 1, name: id, status,
    phase: null, progress: null, outputPath: null, outputRel: null, error: null, createdAt, startedAt: null, endedAt: null,
  };
}

describe('engine state and GPU advice', () => {
  it('prefers a running API over the install detection', () => {
    expect(engineState({ installed: false, running: false, supports3d: false })).toBe('missing');
    expect(engineState({ installed: true, running: false, supports3d: false })).toBe('stopped');
    expect(engineState({ installed: false, running: true, supports3d: false })).toBe('outdated');
    expect(engineState({ installed: false, running: true, supports3d: true })).toBe('ready');
  });

  it('follows the honest VRAM guide (16 GB recommended, 8 GB slower, other vendors very slow)', () => {
    expect(gpuAdvice(null)).toMatchObject({ tone: 'warning', label: 'Keine Grafikkarte erkannt' });
    expect(gpuAdvice({ name: 'NVIDIA GeForce RTX 4080', vramTotalBytes: 16 * GiB, vramFreeBytes: null }).tone).toBe('success');
    expect(gpuAdvice({ name: 'NVIDIA GeForce RTX 3060 Ti', vramTotalBytes: 8 * GiB, vramFreeBytes: null })).toMatchObject({ tone: 'warning', label: 'Geht, aber langsamer' });
    expect(gpuAdvice({ name: 'NVIDIA GeForce GTX 1650', vramTotalBytes: 4 * GiB, vramFreeBytes: null }).tone).toBe('danger');
    expect(gpuAdvice({ name: 'AMD Radeon RX 7900 XTX', vramTotalBytes: 24 * GiB, vramFreeBytes: null }).label).toBe('Sehr langsam oder nicht unterstützt');
    expect(gpuAdvice({ name: 'NVIDIA RTX A4000', vramTotalBytes: null, vramFreeBytes: null }).tone).toBe('neutral');
  });
});

describe('createBlocker', () => {
  it('names the engine problem first', () => {
    expect(createBlocker(status({ installed: false, running: false }), models(['trellis2']), 'image', 'trellis2')?.target).toBe('engine');
    expect(createBlocker(status({ running: false }), undefined, 'image', 'trellis2')?.reason).toContain('läuft nicht');
    expect(createBlocker(status({ supports3d: false }), undefined, 'image', 'trellis2')?.reason).toContain('aktualisieren');
  });

  it('requires the chosen generator and, for text, Z-Image Turbo', () => {
    expect(createBlocker(status(), models(['trellis2', 'z_image_turbo']), 'text', 'trellis2')).toBeNull();
    expect(createBlocker(status(), models(['trellis2', 'z_image_turbo']), 'image', 'pixal3d')).toEqual({ reason: 'Pixal3D ist noch nicht heruntergeladen.', target: 'models' });
    expect(createBlocker(status(), models(['trellis2']), 'text', 'trellis2')?.reason).toBe('Für „Text zu 3D“ fehlt noch das Bildmodell Z-Image Turbo.');
    expect(createBlocker(status(), models(['trellis2']), 'image', 'trellis2')).toBeNull();
  });

  it('never blocks on unknown data (the daemon checks again)', () => {
    expect(createBlocker(undefined, undefined, 'text', 'pixal3d')).toBeNull();
  });
});

describe('names, paths and jobs', () => {
  it('suggests ASCII file names without filler words', () => {
    expect(suggestName('Eine alte Holzkiste mit Eisenbeschlägen')).toBe('alte-holzkiste-eisenbeschlaegen');
    expect(suggestName('Ein Heiltrank für Größe')).toBe('heiltrank-groesse');
    expect(suggestName('Foto 2026-10-01.PNG')).toBe('foto-2026-10');
    expect(suggestName('   ')).toBe('');
  });

  it('validates Windows file names', () => {
    expect(validateName('holzkiste')).toBeUndefined();
    expect(validateName('')).toBe('Bitte einen Namen eingeben.');
    expect(validateName('a/b')).toContain('nicht erlaubt');
    expect(validateName('kiste.')).toContain('Punkt');
    expect(validateName('CON')).toContain('reserviert');
    expect(validateName('x'.repeat(81))).toContain('80');
  });

  it('builds the project-relative output path', () => {
    expect(outputPreview('assets/3d', 'kiste')).toBe('assets/3d/kiste.glb');
    expect(outputPreview('/Assets\\Models/', 'kiste')).toBe('Assets/Models/kiste.glb');
    expect(outputPreview('', 'kiste')).toBe('kiste.glb');
  });

  it('upserts event payloads newest first and picks the job to show', () => {
    const list = [job('b', 'done', 2), job('a', 'failed', 1)];
    const next = upsertJob(list, job('c', 'queued', 3));
    expect(next.map((j) => j.id)).toEqual(['c', 'b', 'a']);
    expect(upsertJob(next, { ...job('a', 'cancelled', 1) }).find((j) => j.id === 'a')?.status).toBe('cancelled');
    expect(defaultJobSelection(next)).toBe('b');
    expect(defaultJobSelection([...next, job('r', 'running', 0)])).toBe('r');
    expect(defaultJobSelection([])).toBeNull();
  });

  it('adds the reference image step to the time hint in text mode', () => {
    expect(timeHint('draft', 'image')).toContain('etwa 1–3 Min. (geschätzt');
    expect(timeHint('high', 'text')).toContain('plus etwa 1 Min. für das Bild');
  });

  it('only frees files no other installed model needs', () => {
    const all = models(['trellis2', 'pixal3d']);
    const pixal = all.find((m) => m.id === 'pixal3d')!;
    expect(filesFreedByDelete(pixal, all).map((f) => f.name)).toEqual(['pixal3d_int8_convrot.safetensors', 'moge_2_vitl_normal_fp16.safetensors']);
    const onlyTrellis = models(['trellis2']);
    expect(filesFreedByDelete(onlyTrellis.find((m) => m.id === 'trellis2')!, onlyTrellis)).toHaveLength(5);
  });
});

describe('images and base64', () => {
  it('recognizes PNG, JPEG and WebP by their first bytes', () => {
    expect(sniffImageType(base64ToBytes(DEMO_REFERENCE_PNG_BASE64))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
  });

  it('decodes base64 exactly (also in chunks larger than one block)', () => {
    const bytes = new Uint8Array(3 * 400_000 + 2).map((_, i) => (i * 7) % 256);
    const b64 = Buffer.from(bytes).toString('base64');
    expect(base64ByteLength(b64)).toBe(bytes.length);
    expect(Buffer.from(base64ToBytes(b64)).equals(Buffer.from(bytes))).toBe(true);
    const glb = base64ToArrayBuffer(DEMO_CRATE_GLB_BASE64);
    expect(new DataView(glb).getUint32(0, true)).toBe(0x46546c67); // "glTF"
    expect(glb.byteLength).toBe(Buffer.from(DEMO_CRATE_GLB_BASE64, 'base64').length);
  });
});
