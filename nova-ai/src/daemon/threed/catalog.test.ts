// Tests for the 3D model catalog: exact files/sizes/URLs from SPEC-3D §3, shared files, presence and exclusive files.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ThreeDModelSchema } from '@shared/schemas';
import { THREED_CATALOG, allCatalogFiles, catalogModel, filesExclusiveTo, formatSize, modelsWithPresence } from './catalog';

describe('3D catalog', () => {
  it('lists the exact files, folders, sizes and Hugging Face URLs of SPEC-3D §3', () => {
    const files = Object.fromEntries(THREED_CATALOG.map((m) => [m.id, m.files.map((f) => `${f.folder}/${f.name} ${f.sizeBytes}`)]));
    expect(files.trellis2).toEqual([
      'diffusion_models/trellis_2_int8_convrot.safetensors 5253048192',
      'clip_vision/dino_v3_L_naf_fp32.safetensors 1215214176',
      'vae/trellis_2_shape_vae_bf16.safetensors 1095844024',
      'vae/trellis_2_texture_vae_bf16.safetensors 948461364',
      'background_removal/birefnet.safetensors 444473596',
    ]);
    expect(files.pixal3d).toEqual([
      'diffusion_models/pixal3d_int8_convrot.safetensors 5584555824',
      'geometry_estimation/moge_2_vitl_normal_fp16.safetensors 661859924',
      'clip_vision/dino_v3_L_naf_fp32.safetensors 1215214176',
      'vae/trellis_2_shape_vae_bf16.safetensors 1095844024',
      'vae/trellis_2_texture_vae_bf16.safetensors 948461364',
      'background_removal/birefnet.safetensors 444473596',
    ]);
    expect(files.z_image_turbo).toEqual([
      'diffusion_models/z_image_turbo_int8_convrot.safetensors 6201001296',
      'text_encoders/qwen_3_4b_fp8_mixed.safetensors 5631994051',
      'vae/ae.safetensors 335304388',
    ]);
    const urls = allCatalogFiles().map((f) => f.url);
    expect(urls).toContain('https://huggingface.co/Comfy-Org/TRELLIS.2/resolve/main/diffusion_models/trellis_2_int8_convrot.safetensors');
    expect(urls).toContain('https://huggingface.co/Comfy-Org/Pixal3D/resolve/main/clip_vision/dino_v3_L_naf_fp32.safetensors');
    expect(urls).toContain('https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors');
    expect(urls).toContain('https://huggingface.co/Comfy-Org/MoGe/resolve/main/geometry_estimation/moge_2_vitl_normal_fp16.safetensors');
    expect(urls).toContain('https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors');
    expect(allCatalogFiles()).toHaveLength(10); // shared files once
    for (const f of allCatalogFiles()) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(catalogModel('trellis2')).toMatchObject({ source: 'microsoft/TRELLIS.2-4B', license: expect.stringContaining('MIT') });
    expect(catalogModel('pixal3d')).toMatchObject({ source: 'TencentARC/Pixal3D', license: expect.stringContaining('MIT') });
    expect(catalogModel('z_image_turbo')).toMatchObject({ source: 'Tongyi-MAI/Z-Image-Turbo', license: 'Apache-2.0', purpose: 'text_to_image' });
  });

  it('reports presence per file and installed/missing bytes', () => {
    const dir = '/models';
    const present = new Set([join(dir, 'diffusion_models', 'trellis_2_int8_convrot.safetensors'), join(dir, 'vae', 'ae.safetensors')]);
    const models = modelsWithPresence(dir, (p) => present.has(p));
    for (const m of models) expect(ThreeDModelSchema.safeParse(m).success).toBe(true);
    const t = models.find((m) => m.id === 'trellis2')!;
    expect(t.installed).toBe(false);
    expect(t.files.filter((f) => f.present).map((f) => f.name)).toEqual(['trellis_2_int8_convrot.safetensors']);
    expect(t.totalBytes).toBe(5_253_048_192 + 1_215_214_176 + 1_095_844_024 + 948_461_364 + 444_473_596);
    expect(t.missingBytes).toBe(t.totalBytes - 5_253_048_192);
    expect(modelsWithPresence(null).every((m) => !m.installed && m.files.every((f) => !f.present))).toBe(true);
    const all = modelsWithPresence(dir, () => true);
    expect(all.every((m) => m.installed && m.missingBytes === 0)).toBe(true);
  });

  it('keeps files another installed model needs when deleting', () => {
    expect(filesExclusiveTo('trellis2', ['trellis2', 'pixal3d']).map((f) => f.name)).toEqual(['trellis_2_int8_convrot.safetensors']);
    expect(filesExclusiveTo('trellis2', ['trellis2']).map((f) => f.name)).toHaveLength(5);
    expect(filesExclusiveTo('z_image_turbo', ['trellis2', 'z_image_turbo']).map((f) => f.name)).toEqual([
      'z_image_turbo_int8_convrot.safetensors',
      'qwen_3_4b_fp8_mixed.safetensors',
      'ae.safetensors',
    ]);
  });

  it('formats sizes in German', () => {
    expect(formatSize(5_253_048_192)).toBe('5,3 GB');
    expect(formatSize(444_473_596)).toBe('444 MB');
    expect(formatSize(1500)).toBe('2 KB');
    expect(formatSize(12)).toBe('12 B');
  });
});
