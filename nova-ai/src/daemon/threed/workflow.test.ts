// Tests for the ComfyUI workflow converter and job prompt builders: the bundled official template against the
// object_info recorded from a real ComfyUI 0.42.0 (tests/fixtures/comfyui), plus small synthetic workflows for rules the
// template does not exercise (bypass/mute, Reroute, legacy PrimitiveNode, subgraphs, old frontends, defaults).
// comfyStyleProblems() replicates ComfyUI's constant/link validation offline so regressions show up without a server.
import { describe, expect, it } from 'vitest';
import objectInfoJson from '../../../tests/fixtures/comfyui/object_info.json';
import { NovaError } from '../core/errors';
import {
  IMAGE_TO_3D_TEMPLATE,
  QUALITY_PRESETS,
  REFERENCE_IMAGE_SUFFIX,
  TEXT_TO_IMAGE_NODE_CLASSES,
  assertPromptComplete,
  buildImageTo3dPrompt,
  buildTextToImagePrompt,
  clampToSpec,
  convertUiWorkflow,
  isApiLink,
  modelFolderFor,
  pruneToOutputs,
  referenceImagePrompt,
  requiredModelFiles,
  workflowNodeClasses,
  type ApiPrompt,
  type ObjectInfo,
} from './workflow';

/** The object_info recorded from a real ComfyUI 0.42.0 (CPU mode), without the _source note. */
function realInfo(): ObjectInfo {
  const copy = structuredClone(objectInfoJson) as Record<string, unknown>;
  delete copy._source;
  return copy as ObjectInfo;
}

const INFO = realInfo();
const UI_ONLY = ['Note', 'MarkdownNote', 'PreviewImage', 'MaskPreview', 'Preview3DAdvanced', 'ComfySwitchNode', 'PrimitiveBoolean', 'Reroute', 'PrimitiveNode'];

function classes(prompt: ApiPrompt): string[] {
  return Object.values(prompt).map((n) => n.class_type);
}

function nodesOf(prompt: ApiPrompt, cls: string): Array<[string, ApiPrompt[string]]> {
  return Object.entries(prompt).filter(([, n]) => n.class_type === cls);
}

function one(prompt: ApiPrompt, cls: string): ApiPrompt[string] {
  const found = nodesOf(prompt, cls);
  expect(found, cls).toHaveLength(1);
  return found[0][1];
}

function specOf(info: ObjectInfo, cls: string, input: string): unknown[] | undefined {
  const groups = info[cls]?.input;
  return (groups?.required?.[input] ?? groups?.optional?.[input]) as unknown[] | undefined;
}

/** Offline replica of the checks ComfyUI's validate_inputs performs (link types, combos, min/max, required inputs). */
function comfyStyleProblems(prompt: ApiPrompt, info: ObjectInfo): string[] {
  const problems: string[] = [];
  for (const [id, node] of Object.entries(prompt)) {
    const def = info[node.class_type];
    if (!def) {
      problems.push(`${id}: unknown class ${node.class_type}`);
      continue;
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const spec = specOf(info, node.class_type, name) ?? (name.includes('.') ? undefined : null);
      if (spec === null) {
        problems.push(`${id}.${name}: not an input of ${node.class_type}`);
        continue;
      }
      if (!spec) continue; // dynamic combo sub-input
      const [type, opts = {}] = spec as [unknown, Record<string, unknown>?];
      if (isApiLink(value)) {
        const src = prompt[value[0]];
        const outType = String((info[src?.class_type ?? '']?.output ?? [])[value[1]] ?? '');
        const accepted = typeof type === 'string' ? type.split(',') : ['COMBO'];
        const ok = accepted.includes('*') || outType === '*' || accepted.includes(outType) || type === 'COMFY_MATCHTYPE_V3';
        if (!ok) problems.push(`${id}.${name}: ${outType} → ${String(type)}`);
        continue;
      }
      if (node.class_type === 'LoadImage') continue; // validated by LoadImage.VALIDATE_INPUTS in ComfyUI
      if (Array.isArray(type) && !type.includes(value)) problems.push(`${id}.${name}: ${String(value)} not in list`);
      if (type === 'COMBO' && Array.isArray(opts.options) && !(opts.options as unknown[]).includes(value)) problems.push(`${id}.${name}: ${String(value)} not in options`);
      if ((type === 'INT' || type === 'FLOAT') && typeof value === 'number') {
        if (typeof opts.min === 'number' && value < opts.min) problems.push(`${id}.${name}: ${value} < ${opts.min}`);
        if (typeof opts.max === 'number' && value > opts.max) problems.push(`${id}.${name}: ${value} > ${opts.max}`);
      }
    }
  }
  return problems;
}

const BASE = { image: 'nova/job_1.png', seed: 987654, filenamePrefix: 'nova/job_1' } as const;

describe('workflowNodeClasses', () => {
  it('lists every executable class of the bundled template, all present in the recorded object_info', () => {
    const list = workflowNodeClasses(IMAGE_TO_3D_TEMPLATE);
    expect(list).toContain('Trellis2ShapeStage');
    expect(list).toContain('Pixal3DConditioning');
    expect(list).toContain('Save3DAdvanced');
    for (const uiOnly of ['Note', 'MarkdownNote', 'PreviewImage', 'MaskPreview', 'Preview3DAdvanced']) expect(list).not.toContain(uiOnly);
    expect(list.filter((c) => !INFO[c])).toEqual([]);
    expect(TEXT_TO_IMAGE_NODE_CLASSES.filter((c) => !INFO[c])).toEqual([]);
  });
});

describe('convertUiWorkflow with the real template', () => {
  it('converts the template as saved (switch false = Pixal3D) into a complete API prompt without UI-only nodes', () => {
    const prompt = convertUiWorkflow(IMAGE_TO_3D_TEMPLATE, INFO, { outputClassTypes: ['Save3DAdvanced'] });
    for (const cls of UI_ONLY) expect(classes(prompt)).not.toContain(cls);
    expect(classes(prompt)).toContain('Pixal3DConditioning');
    expect(classes(prompt)).not.toContain('Trellis2Conditioning');
    expect(() => assertPromptComplete(prompt, INFO)).not.toThrow();
    expect(comfyStyleProblems(prompt, INFO)).toEqual([]);
  });

  it('rewires consumers of pass-through preview nodes to the preview input', () => {
    const prompt = convertUiWorkflow(IMAGE_TO_3D_TEMPLATE, INFO, { outputClassTypes: ['Save3DAdvanced'] });
    // PreviewImage 302 sat between ImageCropToMask 312 and the conditioning/MoGe nodes.
    expect(prompt['298'].inputs.image).toEqual(['312', 0]);
    expect(prompt['56'].inputs.image).toEqual(['312', 0]);
    // MaskPreview 303 → switch 248 (constant true) → RemoveBackground 192.
    expect(prompt['312'].inputs.masks).toEqual(['192', 0]);
    // PreviewImage 164/207/208/226/235 sat between the bakes and ApplyTextureToMesh.
    expect(prompt['210'].inputs).toMatchObject({ base_color: ['147', 0], metallic: ['147', 1], roughness: ['147', 2], occlusion: ['233', 0], normal_map: ['224', 0] });
  });

  it('maps widgets_values by object_info order incl. seed control values, linked widgets and dynamic combos', () => {
    const prompt = convertUiWorkflow(IMAGE_TO_3D_TEMPLATE, INFO, { outputClassTypes: ['Save3DAdvanced'] });
    expect(prompt['18'].inputs).toMatchObject({ seed: 42, steps: 20, cfg: 7.5, sampler_name: 'euler', scheduler: 'normal', denoise: 1 });
    expect(prompt['12'].inputs).toMatchObject({ seed: 43, steps: 12, cfg: 1 });
    expect(prompt['23'].inputs).toMatchObject({ scheduler: 'simple' });
    expect(prompt['241'].inputs).toMatchObject({
      resolution: 768,
      sign_mode: 'solid',
      'sign_mode.fill': 20,
      'sign_mode.qef': false,
      band: 1,
      project_back: 0,
      fix_poles: false,
      smooth_iters: 20,
      drop_small_components: 0.01,
      precluster_max_verts: 20000000,
    });
    expect(prompt['186'].inputs).toMatchObject({ target_face_count: 700000, placement_mode: 'midpoint' });
    expect(prompt['312'].inputs).toMatchObject({ width: 1024, height: 1024, pad_factor: 1.1, grow_mask: 0, background: '#000000' });
    expect(prompt['122'].inputs).toEqual({ image: 'viking_wolf_rune_axe.png' });
    expect(prompt['322'].inputs).toMatchObject({ filename_prefix: '3d/ComfyUI', viewport_state: '', width: 1024, height: 1024, model_3d: ['285', 0] });
    // Linked widget inputs keep their link (the widget value is skipped, not shifted onto the next input).
    expect(prompt['196'].inputs).toMatchObject({ segmenter: 'pec', resolution: ['288', 0], padding: 1, weld_distance: 0.0002 });
    expect(prompt['147'].inputs.texture_size).toEqual(['288', 0]);
    expect(prompt['288'].inputs).toEqual({ value: 4096 });
    expect(prompt['298'].inputs.camera_angle_x).toEqual(['242', 0]);
    expect(prompt['56'].inputs).toMatchObject({ resolution_level: 9, fov_x_degrees: 0, batch_size: 4, force_projection: true, apply_mask: true, refine_steps: 3 });
  });

  it('every link resolves to an existing node output', () => {
    const prompt = convertUiWorkflow(IMAGE_TO_3D_TEMPLATE, INFO, { outputClassTypes: ['Save3DAdvanced'] });
    for (const [id, node] of Object.entries(prompt)) {
      for (const value of Object.values(node.inputs)) {
        if (!isApiLink(value)) continue;
        expect(prompt[value[0]], `${id} → ${value[0]}`).toBeDefined();
        expect(value[1]).toBeLessThan((INFO[prompt[value[0]].class_type].output ?? []).length);
      }
    }
  });
});

describe('buildImageTo3dPrompt', () => {
  it('TRELLIS.2: keeps only the TRELLIS.2 branch and needs exactly its model files', () => {
    const { prompt, outputNodeId } = buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, generator: 'trellis2', quality: 'standard' });
    expect(prompt[outputNodeId].class_type).toBe('Save3DAdvanced');
    expect(classes(prompt)).toContain('Trellis2Conditioning');
    for (const cls of ['Pixal3DConditioning', 'LoadMoGeModel', 'MoGeInference', 'MoGeGeometryToFOV', 'PrimitiveInt', ...UI_ONLY]) expect(classes(prompt)).not.toContain(cls);
    expect(one(prompt, 'UNETLoader').inputs.unet_name).toBe('trellis_2_int8_convrot.safetensors');
    expect(requiredModelFiles(prompt).map((m) => `${m.folder}/${m.name}`).sort()).toEqual([
      'background_removal/birefnet.safetensors',
      'clip_vision/dino_v3_L_naf_fp32.safetensors',
      'diffusion_models/trellis_2_int8_convrot.safetensors',
      'vae/trellis_2_shape_vae_bf16.safetensors',
      'vae/trellis_2_texture_vae_bf16.safetensors',
    ]);
    // All model chains use the TRELLIS.2 UNET through the resolved switch.
    for (const [, cfg] of nodesOf(prompt, 'CFGOverride')) expect(cfg.inputs.model).toEqual(['40', 0]);
    expect(prompt['12'].inputs.model).toEqual(['40', 0]);
    expect(one(prompt, 'ImageCropToMask').inputs.pad_factor).toBe(1);
    expect(comfyStyleProblems(prompt, INFO)).toEqual([]);
  });

  it('Pixal3D: keeps MoGe and Pixal3D conditioning, drops TRELLIS.2 conditioning and its UNET', () => {
    const { prompt } = buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, generator: 'pixal3d', quality: 'standard' });
    for (const cls of ['Pixal3DConditioning', 'LoadMoGeModel', 'MoGeInference', 'MoGeGeometryToFOV']) expect(classes(prompt)).toContain(cls);
    expect(classes(prompt)).not.toContain('Trellis2Conditioning');
    expect(nodesOf(prompt, 'UNETLoader').map(([, n]) => n.inputs.unet_name)).toEqual(['pixal3d_int8_convrot.safetensors']);
    const pixal = one(prompt, 'Pixal3DConditioning');
    expect(prompt[(pixal.inputs.camera_angle_x as [string, number])[0]].class_type).toBe('MoGeGeometryToFOV');
    expect(requiredModelFiles(prompt).map((m) => `${m.folder}/${m.name}`).sort()).toEqual([
      'background_removal/birefnet.safetensors',
      'clip_vision/dino_v3_L_naf_fp32.safetensors',
      'diffusion_models/pixal3d_int8_convrot.safetensors',
      'geometry_estimation/moge_2_vitl_normal_fp16.safetensors',
      'vae/trellis_2_shape_vae_bf16.safetensors',
      'vae/trellis_2_texture_vae_bf16.safetensors',
    ]);
    expect(one(prompt, 'ImageCropToMask').inputs.pad_factor).toBe(1.1);
    expect(comfyStyleProblems(prompt, INFO)).toEqual([]);
  });

  it('patches image, all KSampler seeds and the Save3DAdvanced prefix; constants replace the shared texture PrimitiveInt', () => {
    const { prompt, outputNodeId } = buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, generator: 'trellis2', quality: 'draft' });
    expect(one(prompt, 'LoadImage').inputs.image).toBe('nova/job_1.png');
    const samplers = nodesOf(prompt, 'KSampler');
    expect(samplers).toHaveLength(4);
    for (const [, s] of samplers) expect(s.inputs.seed).toBe(987654);
    expect(prompt[outputNodeId].inputs.filename_prefix).toBe('nova/job_1');
    expect(classes(prompt)).not.toContain('PrimitiveInt');
  });

  it.each(['draft', 'standard', 'high'] as const)('quality %s sets faces and texture sizes', (quality) => {
    const p = QUALITY_PRESETS[quality];
    for (const generator of ['trellis2', 'pixal3d'] as const) {
      const { prompt } = buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, generator, quality });
      expect(one(prompt, 'DecimateMesh').inputs.target_face_count).toBe(p.targetFaces);
      expect(one(prompt, 'UnwrapMesh').inputs.resolution).toBe(p.textureSize);
      expect(one(prompt, 'BakeTextureFromVoxel').inputs.texture_size).toBe(p.textureSize);
      expect(one(prompt, 'BakeNormalMapFromMesh').inputs.resolution).toBe(p.normalMapSize);
      expect(one(prompt, 'BakeAmbientOcclusion').inputs.resolution).toBe(p.occlusionSize);
      expect(comfyStyleProblems(prompt, INFO)).toEqual([]);
    }
  });

  it('clamps preset values to the limits object_info reports', () => {
    const info = realInfo();
    const decimate = info.DecimateMesh.input?.required?.target_face_count as [string, Record<string, unknown>];
    decimate[1].max = 1_000_000;
    const unwrap = info.UnwrapMesh.input?.required?.resolution as [string, Record<string, unknown>];
    unwrap[1].max = 2048;
    const { prompt } = buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, info, { ...BASE, generator: 'trellis2', quality: 'high' });
    expect(one(prompt, 'DecimateMesh').inputs.target_face_count).toBe(1_000_000);
    expect(one(prompt, 'UnwrapMesh').inputs.resolution).toBe(2048);
    expect(clampToSpec(INFO, 'KSampler', 'steps', 0)).toBe(1);
    expect(clampToSpec(INFO, 'KSampler', 'seed', 12.6)).toBe(13);
    expect(clampToSpec(INFO, 'Unknown', 'x', 5)).toBe(5);
  });

  it('rejects unsafe prefixes and an empty image', () => {
    for (const filenamePrefix of ['../evil', '/abs/x', 'C:/x', 'nova\\x', '']) {
      expect(() => buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, filenamePrefix, generator: 'trellis2', quality: 'draft' })).toThrow(NovaError);
    }
    expect(() => buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, image: ' ', generator: 'trellis2', quality: 'draft' })).toThrow(/Eingabebild/);
  });

  it('reports node classes the running ComfyUI lacks as TOOL_MISSING (German, with the class names)', () => {
    const info = realInfo();
    delete info.Trellis2ShapeStage;
    try {
      buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, info, { ...BASE, generator: 'trellis2', quality: 'draft' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NovaError);
      expect((e as NovaError).code).toBe('TOOL_MISSING');
      expect((e as NovaError).message).toContain('„Trellis2ShapeStage“');
      expect((e as NovaError).details).toEqual({ missingNodeTypes: ['Trellis2ShapeStage'] });
    }
  });

  it('does not modify the template object', () => {
    const before = JSON.stringify(IMAGE_TO_3D_TEMPLATE);
    buildImageTo3dPrompt(IMAGE_TO_3D_TEMPLATE, INFO, { ...BASE, generator: 'trellis2', quality: 'high' });
    expect(JSON.stringify(IMAGE_TO_3D_TEMPLATE)).toBe(before);
  });
});

describe('buildTextToImagePrompt', () => {
  it('builds the Z-Image Turbo graph that matches the recorded object_info', () => {
    const { prompt, outputNodeId } = buildTextToImagePrompt({ prompt: 'Eine rote Teekanne.', seed: 7, filenamePrefix: 'nova/job_2-ref' });
    expect(prompt[outputNodeId]).toMatchObject({ class_type: 'SaveImage', inputs: { filename_prefix: 'nova/job_2-ref' } });
    expect(one(prompt, 'UNETLoader').inputs).toEqual({ unet_name: 'z_image_turbo_int8_convrot.safetensors', weight_dtype: 'default' });
    expect(one(prompt, 'ModelSamplingAuraFlow').inputs.shift).toBe(3);
    expect(one(prompt, 'CLIPLoader').inputs).toEqual({ clip_name: 'qwen_3_4b_fp8_mixed.safetensors', type: 'lumina2', device: 'default' });
    expect(one(prompt, 'EmptySD3LatentImage').inputs).toEqual({ width: 1024, height: 1024, batch_size: 1 });
    expect(one(prompt, 'KSampler').inputs).toMatchObject({ seed: 7, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1 });
    expect(one(prompt, 'ConditioningZeroOut').inputs.conditioning).toEqual(['4', 0]);
    expect(one(prompt, 'CLIPTextEncode').inputs.text).toBe(`Eine rote Teekanne. ${REFERENCE_IMAGE_SUFFIX}`);
    expect(() => assertPromptComplete(prompt, INFO)).not.toThrow();
    expect(comfyStyleProblems(prompt, INFO)).toEqual([]);
    expect(requiredModelFiles(prompt).map((m) => `${m.folder}/${m.name}`)).toEqual([
      'diffusion_models/z_image_turbo_int8_convrot.safetensors',
      'text_encoders/qwen_3_4b_fp8_mixed.safetensors',
      'vae/ae.safetensors',
    ]);
  });

  it('extends the description without doubled punctuation and rejects empty text', () => {
    expect(referenceImagePrompt('  a wooden chair!! ')).toBe(`a wooden chair. ${REFERENCE_IMAGE_SUFFIX}`);
    expect(referenceImagePrompt('Schwert')).toBe(`Schwert. ${REFERENCE_IMAGE_SUFFIX}`);
    expect(() => buildTextToImagePrompt({ prompt: '   ', seed: 1, filenamePrefix: 'nova/x' })).toThrow(NovaError);
  });
});

describe('requiredModelFiles', () => {
  it('lists loader files once, ignores links and virtual names', () => {
    const prompt: ApiPrompt = {
      '1': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
      '2': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
      '3': { class_type: 'VAELoader', inputs: { vae_name: 'pixel_space' } },
      '4': { class_type: 'UNETLoader', inputs: { unet_name: ['9', 0], weight_dtype: 'default' } },
      '5': { class_type: 'KSampler', inputs: { seed: 1 } },
      '10': { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: 'birefnet.safetensors' } },
    };
    expect(requiredModelFiles(prompt)).toEqual([
      { folder: 'vae', name: 'ae.safetensors', nodeId: '1', classType: 'VAELoader', input: 'vae_name' },
      { folder: 'background_removal', name: 'birefnet.safetensors', nodeId: '10', classType: 'LoadBackgroundRemovalModel', input: 'bg_removal_name' },
    ]);
    expect(modelFolderFor('LoadMoGeModel', 'model_name')).toBe('geometry_estimation');
    expect(modelFolderFor('KSampler', 'seed')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Synthetic workflows for converter rules the bundled template does not exercise
// ---------------------------------------------------------------------------------------------------------------------

const TOY_INFO: ObjectInfo = {
  Src: { input: { required: { value: ['INT', { default: 1, min: 0, max: 10 }] } }, output: ['IMAGE'], output_node: false },
  Blur: {
    input: { required: { image: ['IMAGE'], radius: ['INT', { default: 1, min: 1, max: 31 }] }, optional: { mask: ['MASK'] } },
    input_order: { required: ['image', 'radius'], optional: ['mask'] },
    output: ['IMAGE'],
    output_node: false,
  },
  MaskSrc: { input: { required: {} }, output: ['MASK'], output_node: false },
  IntSrc: { input: { required: { value: ['INT', { default: 0 }] } }, output: ['INT'], output_node: false },
  Save: { input: { required: { images: ['IMAGE'], filename_prefix: ['STRING', { default: 'x' }] } }, output: [], output_node: true },
  ComfySwitchNode: INFO.ComfySwitchNode,
  PrimitiveBoolean: INFO.PrimitiveBoolean,
  PreviewImage: INFO.PreviewImage,
};

type ToyNode = { id: number; type: string; mode?: number; inputs?: Array<{ name: string; type: string; link: number | null; widget?: { name: string } }>; outputs?: Array<{ name: string; type: string; links: number[] | null }>; widgets_values?: unknown };

function toy(nodes: ToyNode[], links: Array<[number, number, number, number, number, string]>, definitions?: unknown) {
  return { nodes, links, ...(definitions ? { definitions } : {}), version: 0.4 };
}

const out = (type: string, links: number[]) => [{ name: type, type, links }];

describe('convertUiWorkflow rules', () => {
  it('bypassed (mode 4) nodes pass their matching input through, muted (mode 2) nodes drop the link', () => {
    const wf = toy(
      [
        { id: 1, type: 'Src', widgets_values: [3], outputs: out('IMAGE', [1]) },
        { id: 2, type: 'Blur', mode: 4, inputs: [{ name: 'image', type: 'IMAGE', link: 1 }], widgets_values: [5], outputs: out('IMAGE', [2]) },
        { id: 3, type: 'MaskSrc', mode: 2, outputs: out('MASK', [3]) },
        {
          id: 4,
          type: 'Blur',
          inputs: [
            { name: 'image', type: 'IMAGE', link: 2 },
            { name: 'mask', type: 'MASK', link: 3 },
          ],
          widgets_values: [7],
          outputs: out('IMAGE', [4]),
        },
        { id: 5, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 4 }], widgets_values: ['nova/x'] },
      ],
      [
        [1, 1, 0, 2, 0, 'IMAGE'],
        [2, 2, 0, 4, 0, 'IMAGE'],
        [3, 3, 0, 4, 1, 'MASK'],
        [4, 4, 0, 5, 0, 'IMAGE'],
      ],
    );
    const prompt = convertUiWorkflow(wf, TOY_INFO);
    expect(Object.keys(prompt).sort()).toEqual(['1', '4', '5']);
    expect(prompt['4'].inputs).toEqual({ image: ['1', 0], radius: 7 });
    expect(prompt['5'].inputs).toEqual({ images: ['4', 0], filename_prefix: 'nova/x' });
    expect(prompt['1']._meta?.title).toBe('Src');
  });

  it('resolves a switch with its own constant widget, Reroute and legacy PrimitiveNode values', () => {
    const wf = toy(
      [
        { id: 1, type: 'Src', widgets_values: [1], outputs: out('IMAGE', [1]) },
        { id: 2, type: 'Src', widgets_values: [2], outputs: out('IMAGE', [2]) },
        {
          id: 3,
          type: 'ComfySwitchNode',
          inputs: [
            { name: 'on_false', type: 'IMAGE', link: 1 },
            { name: 'on_true', type: 'IMAGE', link: 2 },
          ],
          widgets_values: [true],
          outputs: out('IMAGE', [3]),
        },
        { id: 4, type: 'Reroute', inputs: [{ name: '', type: '*', link: 3 }], outputs: out('IMAGE', [4]) },
        { id: 5, type: 'PrimitiveNode', widgets_values: [9, 'fixed'], outputs: [{ name: 'INT', type: 'INT', links: [5] }] },
        {
          id: 6,
          type: 'Blur',
          inputs: [
            { name: 'image', type: 'IMAGE', link: 4 },
            { name: 'radius', type: 'INT', link: 5, widget: { name: 'radius' } },
          ],
          widgets_values: [1],
          outputs: out('IMAGE', [6]),
        },
        { id: 7, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 6 }], widgets_values: ['p'] },
        { id: 8, type: 'Note', widgets_values: ['hello'] },
      ],
      [
        [1, 1, 0, 3, 0, 'IMAGE'],
        [2, 2, 0, 3, 1, 'IMAGE'],
        [3, 3, 0, 4, 0, 'IMAGE'],
        [4, 4, 0, 6, 0, 'IMAGE'],
        [5, 5, 0, 6, 1, 'INT'],
        [6, 6, 0, 7, 0, 'IMAGE'],
      ],
    );
    const prompt = convertUiWorkflow(wf, TOY_INFO);
    expect(Object.keys(prompt).sort()).toEqual(['2', '6', '7']);
    expect(prompt['6'].inputs).toEqual({ image: ['2', 0], radius: 9 });
  });

  it('handles old frontends that dropped linked widget values and dict-style widgets_values', () => {
    const wf = toy(
      [
        { id: 1, type: 'Src', widgets_values: { value: 4 }, outputs: out('IMAGE', [1]) },
        { id: 2, type: 'IntSrc', widgets_values: [6], outputs: [{ name: 'INT', type: 'INT', links: [2] }] },
        {
          id: 3,
          type: 'Blur',
          // "radius" is linked and has no slot in widgets_values at all (old frontend): nothing to consume.
          inputs: [
            { name: 'image', type: 'IMAGE', link: 1 },
            { name: 'radius', type: 'INT', link: 2, widget: { name: 'radius' } },
          ],
          widgets_values: [],
          outputs: out('IMAGE', [3]),
        },
        { id: 4, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 3 }], widgets_values: ['p'] },
      ],
      [
        [1, 1, 0, 3, 0, 'IMAGE'],
        [2, 2, 0, 3, 1, 'INT'],
        [3, 3, 0, 4, 0, 'IMAGE'],
      ],
    );
    const prompt = convertUiWorkflow(wf, TOY_INFO);
    expect(prompt['1'].inputs).toEqual({ value: 4 });
    expect(prompt['3'].inputs).toEqual({ image: ['1', 0], radius: ['2', 0] });
  });

  it('fills missing widget values from object_info defaults', () => {
    const wf = toy(
      [
        { id: 1, type: 'Src', outputs: out('IMAGE', [1]) },
        { id: 2, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 1 }] },
      ],
      [[1, 1, 0, 2, 0, 'IMAGE']],
    );
    const prompt = convertUiWorkflow(wf, TOY_INFO);
    expect(prompt['1'].inputs).toEqual({ value: 1 });
    expect(prompt['2'].inputs).toEqual({ images: ['1', 0], filename_prefix: 'x' });
  });

  it('flattens subgraphs with "<instance>:<inner>" ids', () => {
    const definitions = {
      subgraphs: [
        {
          id: 'a1b2c3d4-0000-4000-8000-000000000001',
          name: 'Weichzeichner',
          nodes: [{ id: 1, type: 'Blur', inputs: [{ name: 'image', type: 'IMAGE', link: 11 }], widgets_values: [12], outputs: out('IMAGE', [12]) }],
          links: [
            { id: 11, origin_id: -10, origin_slot: 0, target_id: 1, target_slot: 0, type: 'IMAGE' },
            { id: 12, origin_id: 1, origin_slot: 0, target_id: -20, target_slot: 0, type: 'IMAGE' },
          ],
          inputs: [{ name: 'image', type: 'IMAGE' }],
          outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
        },
      ],
    };
    const wf = toy(
      [
        { id: 1, type: 'Src', widgets_values: [2], outputs: out('IMAGE', [1]) },
        { id: 2, type: 'a1b2c3d4-0000-4000-8000-000000000001', inputs: [{ name: 'image', type: 'IMAGE', link: 1 }], outputs: out('IMAGE', [2]) },
        { id: 3, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 2 }], widgets_values: ['p'] },
      ],
      [
        [1, 1, 0, 2, 0, 'IMAGE'],
        [2, 2, 0, 3, 0, 'IMAGE'],
      ],
      definitions,
    );
    expect(workflowNodeClasses(wf)).toEqual(['Blur', 'Save', 'Src']);
    const prompt = convertUiWorkflow(wf, TOY_INFO);
    expect(Object.keys(prompt).sort()).toEqual(['1', '2:1', '3']);
    expect(prompt['2:1'].inputs).toEqual({ image: ['1', 0], radius: 12 });
    expect(prompt['3'].inputs.images).toEqual(['2:1', 0]);
  });

  it('honours explicit output node ids and rejects unknown ones', () => {
    const wf = toy(
      [
        { id: 1, type: 'Src', widgets_values: [2], outputs: out('IMAGE', [1, 2]) },
        { id: 2, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 1 }], widgets_values: ['a'] },
        { id: 3, type: 'Blur', inputs: [{ name: 'image', type: 'IMAGE', link: 2 }], widgets_values: [3], outputs: out('IMAGE', [3]) },
        { id: 4, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 3 }], widgets_values: ['b'] },
      ],
      [
        [1, 1, 0, 2, 0, 'IMAGE'],
        [2, 1, 0, 3, 0, 'IMAGE'],
        [3, 3, 0, 4, 0, 'IMAGE'],
      ],
    );
    expect(Object.keys(convertUiWorkflow(wf, TOY_INFO, { outputNodeIds: ['2'] }))).toEqual(['1', '2']);
    expect(Object.keys(convertUiWorkflow(wf, TOY_INFO)).sort()).toEqual(['1', '2', '3', '4']);
    expect(() => convertUiWorkflow(wf, TOY_INFO, { outputNodeIds: ['99'] })).toThrow(/#99/);
    expect(() => convertUiWorkflow({ nodes: 'kaputt' }, TOY_INFO)).toThrow(/unbekanntes Format/);
  });

  it('reports a missing required input in German instead of sending a broken prompt', () => {
    const wf = toy(
      [
        { id: 1, type: 'MaskSrc', mode: 2, outputs: out('IMAGE', [1]) },
        { id: 2, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 1 }], widgets_values: ['a'] },
      ],
      [[1, 1, 0, 2, 0, 'IMAGE']],
    );
    expect(() => convertUiWorkflow(wf, TOY_INFO)).toThrow(/Pflichteingabe „images“ fehlt/);
  });

  it('pruneToOutputs keeps only upstream nodes', () => {
    const prompt: ApiPrompt = {
      '1': { class_type: 'Src', inputs: { value: 1 } },
      '2': { class_type: 'Src', inputs: { value: 2 } },
      '3': { class_type: 'Save', inputs: { images: ['1', 0], filename_prefix: 'x' } },
    };
    expect(Object.keys(pruneToOutputs(prompt, ['3']))).toEqual(['1', '3']);
  });
});
