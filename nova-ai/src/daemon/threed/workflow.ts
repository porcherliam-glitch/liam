// ComfyUI workflow helpers for the 3D workshop (docs/SPEC-3D.md §4): converts the bundled UI-format template into
// ComfyUI's API format, patches it for one job (image, generator branch, seed, quality, file prefix), builds the
// hand-made Z-Image Turbo text → image graph and lists the model files a prompt needs. Pure functions, no I/O.
//
// Key decisions (verified against a real ComfyUI 0.42.0, see tests/fixtures/comfyui/VERIFICATION.md):
// - Widget mapping follows the frontend's serialisation: an object_info input is a widget when the UI node does not
//   list it as a socket in `inputs` (sockets are always listed, linked or not) or lists it with `widget`. Linked widget
//   inputs KEEP their slot in `widgets_values` in current frontends (value ignored, link wins). INT inputs with
//   `control_after_generate` (or named seed/noise_seed) are followed by a control value ("fixed", "randomize" …), upload
//   combos (LoadImage) by the upload button value ("image"). COMFY_DYNAMICCOMBO_V3 inputs (DecimateMesh.placement_mode,
//   RemeshMesh.sign_mode) are followed by the selected option's sub-inputs, sent as "<combo>.<sub>" keys. Ambiguous
//   cases (old frontends that dropped linked widget values, custom widget types such as LOAD_3D) are decided by
//   simulating the variants and picking the one that consumes `widgets_values` exactly.
// - In this ComfyUI version PreviewImage and MaskPreview are PASS-THROUGH nodes (they have an output that feeds the
//   rest of the template). "Dropping UI-only nodes" therefore means bypassing them: consumers are rewired to the
//   preview's input of the same type, exactly like ComfyUI's bypass mode (mode 4). Muted nodes (mode 2) disappear and
//   their consumers lose the link.
// - Constant ComfySwitchNodes (switch is a widget, a PrimitiveBoolean or a legacy PrimitiveNode) are resolved by
//   rewiring their consumers to the selected input; afterwards only nodes upstream of the chosen output nodes are kept,
//   so the other generator's model files are never referenced.
// - Subgraphs (`definitions.subgraphs`) are flattened with API node ids "<instance>:<inner>" like the frontend does.
//   Promoted subgraph widgets are best effort (the bundled template has no subgraphs).
// - Quality presets clamp every value to the node's min/max from object_info. Texture size drives the UV atlas and
//   the colour bake (they share one PrimitiveInt in the template), the normal map uses the same size, ambient
//   occlusion half of it (low-frequency data, expensive to bake). ImageCropToMask.pad_factor follows the node docs:
//   1.0 for TRELLIS.2, 1.1 for Pixal3D.
import { z } from 'zod';
import type { ThreeDGenerator, ThreeDQuality } from '@shared/schemas';
import { NovaError, validation } from '../core/errors';
import templateJson from './workflows/3d_pixal3d_trellis2_image_to_model.json';

// ---------------------------------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------------------------------

/** A link in API format: [source node id, output index]. */
export type ApiLink = [string, number];

export interface ApiNode {
  class_type: string;
  /** Constant values or links ([nodeId, outputIndex]). Constant arrays are wrapped as { __value__: [...] }. */
  inputs: Record<string, unknown>;
  _meta?: { title: string };
}

/** ComfyUI API-format prompt (the body's `prompt` of POST /prompt). */
export type ApiPrompt = Record<string, ApiNode>;

/** One entry of GET /object_info/<class> (only the fields NOVA uses are typed). */
export interface ObjectInfoNode {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
    hidden?: Record<string, unknown>;
  };
  input_order?: { required?: string[]; optional?: string[]; hidden?: string[] };
  output?: unknown[];
  output_name?: unknown[];
  output_node?: boolean;
  display_name?: string;
  [key: string]: unknown;
}

/** Class name → object_info entry. Classes the running ComfyUI does not know are absent. */
export type ObjectInfo = Record<string, ObjectInfoNode>;

export interface ConvertOptions {
  /** Keep only nodes upstream of these node ids (UI ids as strings; flattened subgraph nodes "<instance>:<inner>"). */
  outputNodeIds?: string[];
  /** Otherwise keep nodes upstream of all nodes of these classes (e.g. ["Save3DAdvanced"]). */
  outputClassTypes?: string[];
}

export interface QualityPreset {
  /** DecimateMesh.target_face_count */
  targetFaces: number;
  /** UV atlas (UnwrapMesh.resolution) and colour/metal/roughness bake (BakeTextureFromVoxel.texture_size). */
  textureSize: number;
  /** BakeNormalMapFromMesh.resolution */
  normalMapSize: number;
  /** BakeAmbientOcclusion.resolution */
  occlusionSize: number;
}

/** Quality presets of SPEC-3D §4 (draft 200k/1024, standard 700k/2048, high 1.5M/4096). */
export const QUALITY_PRESETS: Record<ThreeDQuality, QualityPreset> = {
  draft: { targetFaces: 200_000, textureSize: 1024, normalMapSize: 1024, occlusionSize: 512 },
  standard: { targetFaces: 700_000, textureSize: 2048, normalMapSize: 2048, occlusionSize: 1024 },
  high: { targetFaces: 1_500_000, textureSize: 4096, normalMapSize: 4096, occlusionSize: 2048 },
};

export interface ImageTo3dOptions {
  /** LoadImage value as returned by ComfyClient.uploadImage, e.g. "nova/job_1.png". */
  image: string;
  generator: ThreeDGenerator;
  seed: number;
  quality: ThreeDQuality;
  /** Save3DAdvanced filename prefix relative to ComfyUI's output folder, e.g. "nova/<jobId>". */
  filenamePrefix: string;
}

export interface TextToImageOptions {
  /** The user's description (German or English). It is extended for a clean single-object reference image. */
  prompt: string;
  seed: number;
  /** SaveImage filename prefix relative to ComfyUI's output folder, e.g. "nova/<jobId>-ref". */
  filenamePrefix: string;
}

export interface BuiltPrompt {
  prompt: ApiPrompt;
  /** Id of the node whose outputs (history) contain the generated file. */
  outputNodeId: string;
}

export interface RequiredModelFile {
  /** ComfyUI models sub folder, e.g. "diffusion_models". */
  folder: string;
  /** File name as referenced by the loader, e.g. "trellis_2_int8_convrot.safetensors". */
  name: string;
  /** First node that references the file. */
  nodeId: string;
  classType: string;
  input: string;
}

/** The bundled official UI-format template (Comfy-Org/workflow_templates, MIT, see workflows/README.md). */
export const IMAGE_TO_3D_TEMPLATE: unknown = templateJson;

/** Node classes of the hand-built text → image graph (fetch their object_info for diagnostics). */
export const TEXT_TO_IMAGE_NODE_CLASSES: readonly string[] = [
  'UNETLoader',
  'ModelSamplingAuraFlow',
  'CLIPLoader',
  'CLIPTextEncode',
  'ConditioningZeroOut',
  'EmptySD3LatentImage',
  'KSampler',
  'VAELoader',
  'VAEDecode',
  'SaveImage',
];

/** Model files of the text → image graph (SPEC-3D §3, model z_image_turbo). */
export const Z_IMAGE_FILES = {
  unet: 'z_image_turbo_int8_convrot.safetensors',
  textEncoder: 'qwen_3_4b_fp8_mixed.safetensors',
  vae: 'ae.safetensors',
} as const;

/** Appended to the user's description so the reference image suits image → 3D (SPEC-3D §4). */
export const REFERENCE_IMAGE_SUFFIX =
  'A single object, centered, complete and fully visible, plain white background, soft even studio lighting, no text, no shadows.';

// ---------------------------------------------------------------------------------------------------------------------
// Node classes with special meaning
// ---------------------------------------------------------------------------------------------------------------------

/** Frontend-only nodes without any function in the API graph. */
const UI_ONLY_TYPES = new Set(['Note', 'MarkdownNote']);
/** Preview nodes: output nodes for the canvas, pass-through for data in current ComfyUI. Bypassed during conversion. */
const PREVIEW_TYPES = new Set(['PreviewImage', 'MaskPreview', 'Preview3D', 'Preview3DAdvanced', 'PreviewAny']);
/** Frontend-only pass-through. */
const REROUTE_TYPE = 'Reroute';
/** Legacy frontend-only primitive whose value is copied into the connected widget inputs. */
const LEGACY_PRIMITIVE_TYPE = 'PrimitiveNode';
const SWITCH_TYPE = 'ComfySwitchNode';
const BOOLEAN_PRIMITIVE_TYPE = 'PrimitiveBoolean';

const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO', 'COMFY_DYNAMICCOMBO_V3']);
const DYNAMIC_COMBO_TYPE = 'COMFY_DYNAMICCOMBO_V3';
const CONTROL_VALUES = new Set(['fixed', 'increment', 'decrement', 'randomize']);
const UPLOAD_OPTION_KEYS = ['image_upload', 'video_upload', 'audio_upload', 'animated_image_upload', 'mesh_upload', 'file_upload'];
const UPLOAD_VALUES = new Set(['image', 'video', 'audio', 'animated_image', 'mesh', 'file']);
const MODEL_FILE_RE = /\.(safetensors|sft|ckpt|pt|pth|bin|gguf|onnx)$/i;

/** Loader inputs that reference files in a ComfyUI models sub folder. */
const LOADER_INPUTS: Record<string, Record<string, string>> = {
  UNETLoader: { unet_name: 'diffusion_models' },
  CLIPLoader: { clip_name: 'text_encoders' },
  DualCLIPLoader: { clip_name1: 'text_encoders', clip_name2: 'text_encoders' },
  TripleCLIPLoader: { clip_name1: 'text_encoders', clip_name2: 'text_encoders', clip_name3: 'text_encoders' },
  VAELoader: { vae_name: 'vae' },
  CLIPVisionLoader: { clip_name: 'clip_vision' },
  CheckpointLoaderSimple: { ckpt_name: 'checkpoints' },
  LoraLoader: { lora_name: 'loras' },
  LoraLoaderModelOnly: { lora_name: 'loras' },
  ControlNetLoader: { control_net_name: 'controlnet' },
  UpscaleModelLoader: { model_name: 'upscale_models' },
  LoadMoGeModel: { model_name: 'geometry_estimation' },
  LoadBackgroundRemovalModel: { bg_removal_name: 'background_removal' },
};

/** ComfyUI models sub folder of a loader input (null when the input does not reference a model file). */
export function modelFolderFor(classType: string, inputName: string): string | null {
  return LOADER_INPUTS[classType]?.[inputName] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// UI workflow schema (lenient: only the fields the converter needs)
// ---------------------------------------------------------------------------------------------------------------------

const NodeIdSchema = z.union([z.number(), z.string()]);
const UiInputSchema = z.object({
  name: z.string(),
  type: z.unknown().optional(),
  link: z.number().nullable().optional(),
  widget: z.object({ name: z.string() }).nullable().optional(),
});
const UiOutputSchema = z.object({
  name: z.string().optional(),
  type: z.unknown().optional(),
  links: z.array(z.number()).nullable().optional(),
});
const UiNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.string(),
  mode: z.number().optional(),
  title: z.string().optional(),
  inputs: z.array(UiInputSchema).optional(),
  outputs: z.array(UiOutputSchema).optional(),
  widgets_values: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).nullable().optional(),
});
const UiLinkTupleSchema = z.tuple([z.number(), NodeIdSchema, z.number(), NodeIdSchema, z.number()]).rest(z.unknown());
const UiLinkObjectSchema = z.object({
  id: z.number(),
  origin_id: NodeIdSchema,
  origin_slot: z.number(),
  target_id: NodeIdSchema,
  target_slot: z.number(),
});
const UiLinkSchema = z.union([UiLinkTupleSchema, UiLinkObjectSchema]);
const UiSubgraphIoSchema = z.object({ name: z.string(), type: z.unknown().optional() });
const UiSubgraphSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(UiNodeSchema),
  links: z.array(UiLinkSchema).optional(),
  inputs: z.array(UiSubgraphIoSchema).optional(),
  outputs: z.array(UiSubgraphIoSchema).optional(),
});
const UiWorkflowSchema = z.object({
  nodes: z.array(UiNodeSchema),
  links: z.array(UiLinkSchema).optional(),
  definitions: z.object({ subgraphs: z.array(UiSubgraphSchema).optional() }).nullable().optional(),
});

type UiNode = z.infer<typeof UiNodeSchema>;
type UiLink = z.infer<typeof UiLinkSchema>;
type UiWorkflow = z.infer<typeof UiWorkflowSchema>;
type UiSubgraph = z.infer<typeof UiSubgraphSchema>;

/** Ids of the virtual input/output nodes inside a subgraph definition. */
const SUBGRAPH_INPUT_NODE = -10;
const SUBGRAPH_OUTPUT_NODE = -20;
const MAX_SUBGRAPH_DEPTH = 16;

function parseWorkflow(ui: unknown): UiWorkflow {
  const parsed = UiWorkflowSchema.safeParse(ui);
  if (!parsed.success) {
    throw validation('Der ComfyUI-Workflow hat ein unbekanntes Format (erwartet: UI-Workflow mit „nodes“ und „links“).', {
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------------------------------
// Intermediate graph
// ---------------------------------------------------------------------------------------------------------------------

type IrSource =
  | { kind: 'node'; nodeId: string; slot: number }
  | { kind: 'const'; value: unknown }
  | { kind: 'instance'; key: string; slot: number };

interface IrInput {
  name: string;
  type: string;
  /** The UI listed this input as a widget (`widget` set). */
  widget: boolean;
  source: IrSource | null;
}

interface IrNode {
  id: string;
  type: string;
  mode: number;
  title: string | null;
  inputs: IrInput[];
  outputTypes: string[];
  widgets: unknown[] | Record<string, unknown> | null;
}

type Graph = Map<string, IrNode>;

function typeName(t: unknown): string {
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return 'COMBO';
  return '*';
}

function typesMatch(a: string, b: string): boolean {
  if (a === '*' || b === '*' || a === b) return true;
  const as = a.split(',').map((s) => s.trim());
  const bs = new Set(b.split(',').map((s) => s.trim()));
  return as.some((x) => bs.has(x));
}

interface LinkInfo {
  originId: string;
  originSlot: number;
}

function linkMap(links: UiLink[] | undefined): Map<number, LinkInfo> {
  const map = new Map<number, LinkInfo>();
  for (const l of links ?? []) {
    if (Array.isArray(l)) map.set(l[0], { originId: String(l[1]), originSlot: l[2] });
    else map.set(l.id, { originId: String(l.origin_id), originSlot: l.origin_slot });
  }
  return map;
}

/** Builds the flat graph: top-level nodes plus the contents of every subgraph instance. */
function buildGraph(wf: UiWorkflow): Graph {
  const graph: Graph = new Map();
  const subgraphs = new Map<string, UiSubgraph>();
  for (const sg of wf.definitions?.subgraphs ?? []) subgraphs.set(sg.id, sg);
  /** "<instance key>" → sources feeding the subgraph outputs. */
  const instanceOutputs = new Map<string, Array<IrSource | null>>();

  const addGraph = (nodes: UiNode[], links: UiLink[] | undefined, prefix: string, boundary: Array<IrSource | null>, depth: number): void => {
    if (depth > MAX_SUBGRAPH_DEPTH) throw validation('Der ComfyUI-Workflow verschachtelt Untergraphen zu tief.');
    const lm = linkMap(links);
    const ids = new Set(nodes.map((n) => String(n.id)));
    const sourceOf = (linkId: number | null | undefined): IrSource | null => {
      if (linkId === null || linkId === undefined) return null;
      const l = lm.get(linkId);
      if (!l) return null;
      if (Number(l.originId) === SUBGRAPH_INPUT_NODE) return boundary[l.originSlot] ?? null;
      if (!ids.has(l.originId)) return null;
      const origin = nodes.find((n) => String(n.id) === l.originId);
      if (origin && subgraphs.has(origin.type)) return { kind: 'instance', key: prefix + l.originId, slot: l.originSlot };
      return { kind: 'node', nodeId: prefix + l.originId, slot: l.originSlot };
    };

    for (const n of nodes) {
      const id = prefix + String(n.id);
      const sg = subgraphs.get(n.type);
      if (sg) {
        const mode = n.mode ?? 0;
        const uiInputs = n.inputs ?? [];
        const widgetValues = Array.isArray(n.widgets_values) ? [...n.widgets_values] : [];
        const inner: Array<IrSource | null> = (sg.inputs ?? []).map((sgIn, idx) => {
          const ui = uiInputs[idx]?.name === sgIn.name ? uiInputs[idx] : uiInputs.find((i) => i.name === sgIn.name);
          const linked = sourceOf(ui?.link);
          if (linked) return linked;
          if (ui?.widget && widgetValues.length) return { kind: 'const', value: widgetValues.shift() };
          return null;
        });
        if (mode === 2) {
          instanceOutputs.set(id, []);
          continue;
        }
        if (mode === 4) {
          // Bypassed subgraph: every output takes the first input of the same type.
          const outs = (sg.outputs ?? []).map((o) => {
            const t = typeName(o.type);
            const idx = (sg.inputs ?? []).findIndex((i) => typesMatch(typeName(i.type), t));
            return idx >= 0 ? (inner[idx] ?? null) : null;
          });
          instanceOutputs.set(id, outs);
          continue;
        }
        const innerLinks = linkMap(sg.links);
        const outs: Array<IrSource | null> = (sg.outputs ?? []).map(() => null);
        for (const l of sg.links ?? []) {
          const targetId = Array.isArray(l) ? l[3] : l.target_id;
          const targetSlot = Array.isArray(l) ? l[4] : l.target_slot;
          const linkId = Array.isArray(l) ? l[0] : l.id;
          if (Number(targetId) !== SUBGRAPH_OUTPUT_NODE) continue;
          const info = innerLinks.get(linkId);
          if (!info) continue;
          const innerPrefix = `${id}:`;
          if (Number(info.originId) === SUBGRAPH_INPUT_NODE) outs[targetSlot] = inner[info.originSlot] ?? null;
          else {
            const origin = sg.nodes.find((x) => String(x.id) === info.originId);
            outs[targetSlot] =
              origin && subgraphs.has(origin.type)
                ? { kind: 'instance', key: innerPrefix + info.originId, slot: info.originSlot }
                : { kind: 'node', nodeId: innerPrefix + info.originId, slot: info.originSlot };
          }
        }
        instanceOutputs.set(id, outs);
        addGraph(sg.nodes, sg.links, `${id}:`, inner, depth + 1);
        continue;
      }
      graph.set(id, {
        id,
        type: n.type,
        mode: n.mode ?? 0,
        title: n.title ?? null,
        inputs: (n.inputs ?? []).map((i) => ({ name: i.name, type: typeName(i.type), widget: !!i.widget, source: sourceOf(i.link) })),
        outputTypes: (n.outputs ?? []).map((o) => typeName(o.type)),
        widgets: n.widgets_values ?? null,
      });
    }
  };

  addGraph(wf.nodes, wf.links, '', [], 0);

  // Resolve references to subgraph outputs (they may point to further instances).
  const resolve = (src: IrSource | null, guard = 0): IrSource | null => {
    if (!src || src.kind !== 'instance') return src;
    if (guard > 64) return null;
    return resolve(instanceOutputs.get(src.key)?.[src.slot] ?? null, guard + 1);
  };
  for (const node of graph.values()) for (const input of node.inputs) input.source = resolve(input.source);
  return graph;
}

function consumersOf(graph: Graph, nodeId: string): Array<{ node: IrNode; input: IrInput }> {
  const out: Array<{ node: IrNode; input: IrInput }> = [];
  for (const node of graph.values()) {
    for (const input of node.inputs) if (input.source?.kind === 'node' && input.source.nodeId === nodeId) out.push({ node, input });
  }
  return out;
}

/** Source that replaces output `slot` of a bypassed node: input at the same index if the type matches, else the first matching input. */
function bypassSource(node: IrNode, slot: number): IrSource | null {
  const t = node.outputTypes[slot] ?? '*';
  const same = node.inputs[slot];
  if (same && typesMatch(same.type, t) && same.source) return same.source;
  const match = node.inputs.find((i) => i.source && typesMatch(i.type, t));
  return match?.source ?? null;
}

function rewireConsumers(graph: Graph, node: IrNode, replacement: (slot: number) => IrSource | null): void {
  for (const { input } of consumersOf(graph, node.id)) {
    const src = input.source;
    if (src?.kind !== 'node') continue;
    input.source = replacement(src.slot);
  }
}

/** Removes frontend-only, muted, bypassed and preview nodes; rewires their consumers (see header). */
function removeNonExecutingNodes(graph: Graph, keep: Set<string>): void {
  for (const node of [...graph.values()]) {
    if (keep.has(node.id)) continue;
    if (UI_ONLY_TYPES.has(node.type)) {
      rewireConsumers(graph, node, () => null);
      graph.delete(node.id);
    } else if (node.type === LEGACY_PRIMITIVE_TYPE) {
      const value = Array.isArray(node.widgets) ? node.widgets[0] : undefined;
      rewireConsumers(graph, node, () => (value === undefined ? null : { kind: 'const', value }));
      graph.delete(node.id);
    }
  }
  // Pass-through nodes may form chains: repeat until nothing changes.
  for (let changed = true; changed; ) {
    changed = false;
    for (const node of [...graph.values()]) {
      if (keep.has(node.id)) continue;
      if (node.mode === 2) {
        rewireConsumers(graph, node, () => null);
      } else if (node.mode === 4 || node.type === REROUTE_TYPE || PREVIEW_TYPES.has(node.type)) {
        rewireConsumers(graph, node, (slot) => bypassSource(node, slot));
      } else continue;
      graph.delete(node.id);
      changed = true;
    }
  }
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return null;
}

/** Constant value of a switch input: own widget, PrimitiveBoolean or a constant source. */
function switchValue(graph: Graph, node: IrNode, objectInfo: ObjectInfo): boolean | null {
  const input = node.inputs.find((i) => i.name === 'switch');
  const src = input?.source ?? null;
  if (src?.kind === 'const') return asBoolean(src.value);
  if (src?.kind === 'node') {
    const origin = graph.get(src.nodeId);
    if (!origin || origin.type !== BOOLEAN_PRIMITIVE_TYPE || origin.mode !== 0) return null;
    const w = origin.widgets;
    return asBoolean(Array.isArray(w) ? w[0] : w?.value);
  }
  const def = objectInfo[node.type];
  if (def) {
    const mapped = mapWidgets(node, def).values;
    if ('switch' in mapped) return asBoolean(mapped.switch);
  }
  const w = node.widgets;
  return asBoolean(Array.isArray(w) ? w[0] : w?.switch);
}

function resolveConstantSwitches(graph: Graph, objectInfo: ObjectInfo, keep: Set<string>): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const node of [...graph.values()]) {
      if (node.type !== SWITCH_TYPE || node.mode !== 0 || keep.has(node.id)) continue;
      const value = switchValue(graph, node, objectInfo);
      if (value === null) continue;
      const selected = node.inputs.find((i) => i.name === (value ? 'on_true' : 'on_false'))?.source ?? null;
      rewireConsumers(graph, node, () => selected);
      graph.delete(node.id);
      changed = true;
    }
  }
}

function upstreamOf(graph: Graph, roots: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    const node = graph.get(id);
    if (!node) continue;
    seen.add(id);
    for (const input of node.inputs) if (input.source?.kind === 'node') stack.push(input.source.nodeId);
  }
  return seen;
}

// ---------------------------------------------------------------------------------------------------------------------
// Widget mapping
// ---------------------------------------------------------------------------------------------------------------------

interface InputSpecInfo {
  type: unknown;
  options: Record<string, unknown>;
}

function specInfo(spec: unknown): InputSpecInfo {
  if (!Array.isArray(spec)) return { type: spec, options: {} };
  const options = spec[1] && typeof spec[1] === 'object' && !Array.isArray(spec[1]) ? (spec[1] as Record<string, unknown>) : {};
  return { type: spec[0], options };
}

type InputGroups = { required?: Record<string, unknown>; optional?: Record<string, unknown> };

function orderedInputs(groups: InputGroups | undefined, order?: { required?: string[]; optional?: string[] }): Array<{ name: string; spec: InputSpecInfo; required: boolean }> {
  const out: Array<{ name: string; spec: InputSpecInfo; required: boolean }> = [];
  for (const cat of ['required', 'optional'] as const) {
    const defs = groups?.[cat];
    if (!defs || typeof defs !== 'object') continue;
    const listed = order?.[cat];
    const names = Array.isArray(listed) ? listed.filter((n) => typeof n === 'string' && n in defs) : Object.keys(defs);
    for (const name of names) out.push({ name, spec: specInfo(defs[name]), required: cat === 'required' });
  }
  return out;
}

function dynamicOptions(spec: InputSpecInfo): Array<{ key: string; inputs: InputGroups }> {
  const options = spec.options.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((o) => {
    if (!o || typeof o !== 'object') return [];
    const rec = o as Record<string, unknown>;
    if (typeof rec.key !== 'string') return [];
    return [{ key: rec.key, inputs: (rec.inputs ?? {}) as InputGroups }];
  });
}

type WidgetKind = 'widget' | 'socket' | 'uncertain';

function classifyInput(spec: InputSpecInfo, ui: IrInput | undefined): WidgetKind {
  if (ui) return ui.widget ? 'widget' : 'socket';
  if (spec.options.forceInput === true) return 'socket';
  if (Array.isArray(spec.type)) return 'widget';
  if (typeof spec.type === 'string' && WIDGET_TYPES.has(spec.type)) return 'widget';
  if (spec.options.socketless === true) return 'widget';
  return 'uncertain';
}

function hasControlValue(name: string, spec: InputSpecInfo): boolean {
  if (spec.options.control_after_generate) return true;
  return spec.type === 'INT' && (name === 'seed' || name === 'noise_seed');
}

function hasUploadValue(spec: InputSpecInfo): boolean {
  return UPLOAD_OPTION_KEYS.some((k) => spec.options[k] === true);
}

interface WidgetMapping {
  /** Input name (incl. "<combo>.<sub>" for dynamic combo sub-inputs) → widget value. */
  values: Record<string, unknown>;
  /** Number of widgets_values consumed. */
  consumed: number;
  /** Widget inputs for which no value was left. */
  missing: string[];
}

function simulate(node: IrNode, def: ObjectInfoNode, values: unknown[], includeLinked: boolean, includeUncertain: boolean): WidgetMapping {
  const byName = new Map(node.inputs.map((i) => [i.name, i]));
  const result: WidgetMapping = { values: {}, consumed: 0, missing: [] };
  let idx = 0;
  const walk = (groups: InputGroups | undefined, order: { required?: string[]; optional?: string[] } | undefined, prefix: string) => {
    for (const { name, spec } of orderedInputs(groups, order)) {
      const full = prefix ? `${prefix}.${name}` : name;
      const ui = byName.get(full);
      const kind = classifyInput(spec, ui);
      if (kind === 'socket' || (kind === 'uncertain' && !includeUncertain)) continue;
      const linked = !!ui?.source;
      if (linked && !includeLinked) continue;
      if (idx >= values.length) {
        result.missing.push(full);
        continue;
      }
      const value = values[idx++];
      if (!linked) result.values[full] = value;
      if (hasControlValue(name, spec) && typeof values[idx] === 'string' && CONTROL_VALUES.has(values[idx] as string)) idx++;
      if (hasUploadValue(spec) && typeof values[idx] === 'string' && UPLOAD_VALUES.has(values[idx] as string)) idx++;
      if (spec.type === DYNAMIC_COMBO_TYPE && !linked) {
        const option = dynamicOptions(spec).find((o) => o.key === value);
        if (option) walk(option.inputs, undefined, full);
      }
    }
  };
  walk(def.input, def.input_order, '');
  result.consumed = idx;
  return result;
}

/** Maps a node's widgets_values to input names using object_info (see header for the rules). */
function mapWidgets(node: IrNode, def: ObjectInfoNode): WidgetMapping {
  const w = node.widgets;
  if (w && !Array.isArray(w)) {
    // Dict-style widgets_values (some custom frontends): map by name.
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(w)) values[k] = v;
    return { values, consumed: Object.keys(values).length, missing: [] };
  }
  const values = w ?? [];
  const variants: Array<[boolean, boolean]> = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];
  const results = variants.map(([linked, uncertain]) => simulate(node, def, values, linked, uncertain));
  const exact = results.find((r) => r.consumed === values.length && r.missing.length === 0);
  if (exact) return exact;
  const complete = results.find((r) => r.missing.length === 0);
  return complete ?? results[0];
}

function defaultOf(spec: InputSpecInfo): unknown {
  if ('default' in spec.options) return spec.options.default;
  if (Array.isArray(spec.type) && spec.type.length) return spec.type[0];
  const v3Options = spec.options.options;
  if (spec.type === 'COMBO' && Array.isArray(v3Options) && v3Options.length) return v3Options[0];
  return undefined;
}

function wrapConstant(value: unknown): unknown {
  return Array.isArray(value) ? { __value__: value } : value;
}

/** Required inputs (incl. sub-inputs of the selected dynamic combo options) that a node must have. */
function requiredInputNames(def: ObjectInfoNode, inputs: Record<string, unknown>): Array<{ name: string; spec: InputSpecInfo }> {
  const out: Array<{ name: string; spec: InputSpecInfo }> = [];
  const walk = (groups: InputGroups | undefined, order: { required?: string[]; optional?: string[] } | undefined, prefix: string, parentRequired: boolean) => {
    for (const { name, spec, required } of orderedInputs(groups, order)) {
      const full = prefix ? `${prefix}.${name}` : name;
      if (required && parentRequired) out.push({ name: full, spec });
      if (spec.type === DYNAMIC_COMBO_TYPE && typeof inputs[full] === 'string') {
        const option = dynamicOptions(spec).find((o) => o.key === inputs[full]);
        if (option) walk(option.inputs, undefined, full, parentRequired && required);
      }
    }
  };
  walk(def.input, def.input_order, '', true);
  return out;
}

function titleOf(node: IrNode, def: ObjectInfoNode | undefined): string {
  return node.title ?? (typeof def?.display_name === 'string' ? def.display_name : node.type);
}

function compareIds(a: string, b: string): number {
  const pa = a.split(':').map(Number);
  const pb = b.split(':').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b);
    if (x !== y) return x - y;
  }
  return 0;
}

function nodeLabel(classType: string, id: string): string {
  return `„${classType}“ (#${id})`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Converts a UI-format workflow into an API-format prompt (SPEC-3D §4 steps 2–5). Throws a German NovaError when the
 * workflow references node classes the running ComfyUI does not have (TOOL_MISSING) or cannot be converted (VALIDATION).
 */
export function convertUiWorkflow(ui: unknown, objectInfo: ObjectInfo, opts: ConvertOptions = {}): ApiPrompt {
  const wf = parseWorkflow(ui);
  const graph = buildGraph(wf);
  const explicit = new Set((opts.outputNodeIds ?? []).map(String));
  removeNonExecutingNodes(graph, explicit);
  resolveConstantSwitches(graph, objectInfo, explicit);

  let outputs: string[];
  if (explicit.size) {
    outputs = [...explicit];
    const unknown = outputs.filter((id) => !graph.has(id));
    if (unknown.length) throw validation(`Der Ausgabeknoten ${unknown.map((u) => `#${u}`).join(', ')} ist im Workflow nicht vorhanden oder deaktiviert.`, { outputNodeIds: unknown });
  } else if (opts.outputClassTypes?.length) {
    const classes = new Set(opts.outputClassTypes);
    outputs = [...graph.values()].filter((n) => classes.has(n.type)).map((n) => n.id);
  } else {
    outputs = [...graph.values()].filter((n) => objectInfo[n.type]?.output_node === true).map((n) => n.id);
  }
  if (!outputs.length) throw validation('Der ComfyUI-Workflow hat keinen Ausgabeknoten (z. B. „Save3DAdvanced“).', { outputClassTypes: opts.outputClassTypes ?? null });

  const kept = upstreamOf(graph, outputs);
  const missingTypes = [...new Set([...kept].map((id) => graph.get(id)?.type ?? '').filter((t) => t && !objectInfo[t]))].sort();
  if (missingTypes.length) {
    throw new NovaError('TOOL_MISSING', `In ComfyUI fehlen Knoten, die der Workflow braucht: ${missingTypes.map((t) => `„${t}“`).join(', ')}. Bitte ComfyUI aktualisieren.`, {
      severity: 'blocker',
      userAction: 'ComfyUI auf die neueste Version aktualisieren (die 3D-Knoten TRELLIS.2/Pixal3D gibt es seit August 2026) und neu starten.',
      details: { missingNodeTypes: missingTypes },
    });
  }

  const prompt: ApiPrompt = {};
  for (const id of [...kept].sort(compareIds)) {
    const node = graph.get(id) as IrNode;
    const def = objectInfo[node.type] as ObjectInfoNode;
    const mapping = mapWidgets(node, def);
    const inputs: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(mapping.values)) inputs[name] = wrapConstant(value);
    for (const input of node.inputs) {
      const src = input.source;
      if (!src) continue;
      if (src.kind === 'const') inputs[input.name] = wrapConstant(src.value);
      else if (src.kind === 'node') inputs[input.name] = [src.nodeId, src.slot] satisfies ApiLink;
    }
    for (const { name, spec } of requiredInputNames(def, inputs)) {
      if (name in inputs) continue;
      const kind = classifyInput(spec, node.inputs.find((i) => i.name === name));
      const fallback = kind === 'socket' ? undefined : defaultOf(spec);
      if (fallback !== undefined) inputs[name] = wrapConstant(fallback);
    }
    prompt[id] = { class_type: node.type, inputs, _meta: { title: titleOf(node, def) } };
  }
  assertPromptComplete(prompt, objectInfo);
  return prompt;
}

/** Throws VALIDATION (German) when a link points to a missing node/output or a required input is missing. */
export function assertPromptComplete(prompt: ApiPrompt, objectInfo: ObjectInfo): void {
  const problems: string[] = [];
  for (const [id, node] of Object.entries(prompt)) {
    const def = objectInfo[node.class_type];
    for (const [name, value] of Object.entries(node.inputs)) {
      if (!isApiLink(value)) continue;
      const source = prompt[value[0]];
      if (!source) problems.push(`${nodeLabel(node.class_type, id)}: Eingabe „${name}“ ist mit dem fehlenden Knoten #${value[0]} verbunden`);
      else {
        const outs = objectInfo[source.class_type]?.output;
        if (Array.isArray(outs) && (value[1] < 0 || value[1] >= outs.length)) {
          problems.push(`${nodeLabel(node.class_type, id)}: Eingabe „${name}“ nutzt den nicht vorhandenen Ausgang ${value[1]} von #${value[0]}`);
        }
      }
    }
    if (!def) continue;
    for (const { name } of requiredInputNames(def, node.inputs)) {
      if (!(name in node.inputs)) problems.push(`${nodeLabel(node.class_type, id)}: Pflichteingabe „${name}“ fehlt`);
    }
  }
  if (problems.length) {
    throw validation(`Der ComfyUI-Workflow ist unvollständig: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (und ${problems.length - 5} weitere)` : ''}.`, { problems });
  }
}

export function isApiLink(value: unknown): value is ApiLink {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number';
}

/** Returns a copy that keeps only nodes upstream of the given output nodes. */
export function pruneToOutputs(prompt: ApiPrompt, outputNodeIds: string[]): ApiPrompt {
  const seen = new Set<string>();
  const stack = [...outputNodeIds];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id) || !prompt[id]) continue;
    seen.add(id);
    for (const value of Object.values(prompt[id].inputs)) if (isApiLink(value)) stack.push(value[0]);
  }
  const out: ApiPrompt = {};
  for (const id of Object.keys(prompt)) if (seen.has(id)) out[id] = prompt[id];
  return out;
}

/** Node classes a UI workflow needs from ComfyUI (for GET /object_info/<class>); frontend-only and preview nodes excluded. */
export function workflowNodeClasses(ui: unknown): string[] {
  const wf = parseWorkflow(ui);
  const subgraphIds = new Set((wf.definitions?.subgraphs ?? []).map((s) => s.id));
  const classes = new Set<string>();
  const add = (nodes: UiNode[]) => {
    for (const n of nodes) {
      if (subgraphIds.has(n.type) || UI_ONLY_TYPES.has(n.type) || PREVIEW_TYPES.has(n.type)) continue;
      if (n.type === REROUTE_TYPE || n.type === LEGACY_PRIMITIVE_TYPE) continue;
      classes.add(n.type);
    }
  };
  add(wf.nodes);
  for (const sg of wf.definitions?.subgraphs ?? []) add(sg.nodes);
  return [...classes].sort();
}

// ---------------------------------------------------------------------------------------------------------------------
// Job prompts
// ---------------------------------------------------------------------------------------------------------------------

function inputSpec(objectInfo: ObjectInfo, classType: string, input: string): InputSpecInfo | null {
  const groups = objectInfo[classType]?.input;
  const spec = groups?.required?.[input] ?? groups?.optional?.[input];
  return spec === undefined ? null : specInfo(spec);
}

/** Clamps a number to the input's min/max from object_info (INT inputs are rounded). */
export function clampToSpec(objectInfo: ObjectInfo, classType: string, input: string, value: number): number {
  const spec = inputSpec(objectInfo, classType, input);
  let v = value;
  if (spec?.type === 'INT') v = Math.round(v);
  const min = spec?.options.min;
  const max = spec?.options.max;
  if (typeof min === 'number' && v < min) v = min;
  if (typeof max === 'number' && v > max) v = max;
  return v;
}

function nodesOfClass(prompt: ApiPrompt, classType: string): string[] {
  return Object.keys(prompt).filter((id) => prompt[id].class_type === classType);
}

function setNumber(prompt: ApiPrompt, objectInfo: ObjectInfo, classType: string, input: string, value: number): void {
  for (const id of nodesOfClass(prompt, classType)) {
    if (!(input in prompt[id].inputs) && !inputSpec(objectInfo, classType, input)) continue;
    prompt[id].inputs[input] = clampToSpec(objectInfo, classType, input, value);
  }
}

function assertSafePrefix(prefix: string): void {
  const p = prefix.trim();
  if (!p || p.includes('..') || p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p) || p.includes('\\')) {
    throw validation(`Ungültiger Dateiname für die ComfyUI-Ausgabe: „${prefix}“.`);
  }
}

function setSwitchBoolean(ui: unknown, value: boolean): number {
  const wf = ui as { nodes?: Array<Record<string, unknown>>; links?: unknown[] };
  const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const lm = linkMap(parseWorkflow(ui).links);
  const controllers = new Set<string>();
  for (const n of nodes) {
    if (n.type !== SWITCH_TYPE || !Array.isArray(n.inputs)) continue;
    const sw = (n.inputs as Array<Record<string, unknown>>).find((i) => i.name === 'switch');
    const link = typeof sw?.link === 'number' ? lm.get(sw.link) : undefined;
    if (link && byId.get(link.originId)?.type === BOOLEAN_PRIMITIVE_TYPE) controllers.add(link.originId);
  }
  for (const id of controllers) {
    const node = byId.get(id) as Record<string, unknown>;
    node.widgets_values = [value];
  }
  return controllers.size;
}

/**
 * Builds the image → 3D prompt from the bundled template: chooses the TRELLIS.2 or Pixal3D branch (template switch
 * "true = Trellis.2", verified by the conditioning node that remains), sets the uploaded image, all KSampler seeds,
 * the quality preset and the Save3DAdvanced prefix.
 */
export function buildImageTo3dPrompt(template: unknown, objectInfo: ObjectInfo, o: ImageTo3dOptions): BuiltPrompt {
  if (!o.image.trim()) throw validation('Für Bild zu 3D fehlt das Eingabebild.');
  assertSafePrefix(o.filenamePrefix);
  const wanted = o.generator === 'trellis2' ? 'Trellis2Conditioning' : 'Pixal3DConditioning';
  const other = o.generator === 'trellis2' ? 'Pixal3DConditioning' : 'Trellis2Conditioning';

  let prompt: ApiPrompt | null = null;
  for (const switchValue of [o.generator === 'trellis2', o.generator !== 'trellis2']) {
    const ui = structuredClone(template);
    if (setSwitchBoolean(ui, switchValue) === 0) {
      throw validation('Die 3D-Vorlage hat keinen Umschalter zwischen TRELLIS.2 und Pixal3D (PrimitiveBoolean).');
    }
    const candidate = convertUiWorkflow(ui, objectInfo, { outputClassTypes: ['Save3DAdvanced'] });
    if (nodesOfClass(candidate, wanted).length && !nodesOfClass(candidate, other).length) {
      prompt = candidate;
      break;
    }
  }
  if (!prompt) throw validation(`Die 3D-Vorlage enthält keinen eindeutigen Zweig für „${o.generator}“.`);

  const savers = nodesOfClass(prompt, 'Save3DAdvanced');
  if (savers.length !== 1) throw validation(`Die 3D-Vorlage muss genau einen „Save3DAdvanced“-Knoten haben (gefunden: ${savers.length}).`);
  const outputNodeId = savers[0];
  const loaders = nodesOfClass(prompt, 'LoadImage');
  if (loaders.length !== 1) throw validation(`Die 3D-Vorlage muss genau einen „LoadImage“-Knoten haben (gefunden: ${loaders.length}).`);
  prompt[loaders[0]].inputs.image = o.image;
  prompt[outputNodeId].inputs.filename_prefix = o.filenamePrefix;

  const samplers = [...nodesOfClass(prompt, 'KSampler'), ...nodesOfClass(prompt, 'KSamplerAdvanced')];
  if (!samplers.length) throw validation('Die 3D-Vorlage enthält keinen KSampler.');
  for (const id of samplers) {
    const cls = prompt[id].class_type;
    const key = cls === 'KSamplerAdvanced' ? 'noise_seed' : 'seed';
    prompt[id].inputs[key] = clampToSpec(objectInfo, cls, key, o.seed);
  }

  const preset = QUALITY_PRESETS[o.quality];
  setNumber(prompt, objectInfo, 'DecimateMesh', 'target_face_count', preset.targetFaces);
  setNumber(prompt, objectInfo, 'UnwrapMesh', 'resolution', preset.textureSize);
  setNumber(prompt, objectInfo, 'BakeTextureFromVoxel', 'texture_size', preset.textureSize);
  setNumber(prompt, objectInfo, 'BakeNormalMapFromMesh', 'resolution', preset.normalMapSize);
  setNumber(prompt, objectInfo, 'BakeAmbientOcclusion', 'resolution', preset.occlusionSize);
  setNumber(prompt, objectInfo, 'ImageCropToMask', 'pad_factor', o.generator === 'trellis2' ? 1.0 : 1.1);

  // Constants replaced links (e.g. the shared PrimitiveInt texture size): drop nodes nobody uses any more.
  prompt = pruneToOutputs(prompt, [outputNodeId]);
  assertPromptComplete(prompt, objectInfo);
  return { prompt, outputNodeId };
}

/** The user's description extended for a clean, single-object reference image (SPEC-3D §4). */
export function referenceImagePrompt(description: string): string {
  const text = description.trim().replace(/[\s.!?;:,]+$/u, '');
  return text ? `${text}. ${REFERENCE_IMAGE_SUFFIX}` : REFERENCE_IMAGE_SUFFIX;
}

/** Hand-built Z-Image Turbo text → image graph equivalent to the official template image_z_image_turbo_int8. */
export function buildTextToImagePrompt(o: TextToImageOptions): BuiltPrompt {
  if (!o.prompt.trim()) throw validation('Für Text zu 3D fehlt die Beschreibung.');
  assertSafePrefix(o.filenamePrefix);
  const seed = Math.max(0, Math.round(o.seed));
  const prompt: ApiPrompt = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: Z_IMAGE_FILES.unet, weight_dtype: 'default' }, _meta: { title: 'Z-Image Turbo laden' } },
    '2': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 }, _meta: { title: 'ModelSamplingAuraFlow' } },
    '3': { class_type: 'CLIPLoader', inputs: { clip_name: Z_IMAGE_FILES.textEncoder, type: 'lumina2', device: 'default' }, _meta: { title: 'Text-Encoder laden' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: referenceImagePrompt(o.prompt), clip: ['3', 0] }, _meta: { title: 'Beschreibung' } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] }, _meta: { title: 'Negativ (leer)' } },
    '6': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 }, _meta: { title: 'Leeres Bild 1024×1024' } },
    '7': {
      class_type: 'KSampler',
      inputs: {
        model: ['2', 0],
        seed,
        steps: 8,
        cfg: 1,
        sampler_name: 'res_multistep',
        scheduler: 'simple',
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['6', 0],
        denoise: 1,
      },
      _meta: { title: 'KSampler' },
    },
    '8': { class_type: 'VAELoader', inputs: { vae_name: Z_IMAGE_FILES.vae }, _meta: { title: 'VAE laden' } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['8', 0] }, _meta: { title: 'VAE dekodieren' } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: o.filenamePrefix }, _meta: { title: 'Referenzbild speichern' } },
  };
  return { prompt, outputNodeId: '10' };
}

/** Model files referenced by loader nodes of an API prompt (unique per folder/name, in node order). */
export function requiredModelFiles(prompt: ApiPrompt): RequiredModelFile[] {
  const out: RequiredModelFile[] = [];
  const seen = new Set<string>();
  for (const id of Object.keys(prompt).sort(compareIds)) {
    const node = prompt[id];
    const loader = LOADER_INPUTS[node.class_type];
    if (!loader) continue;
    for (const [input, folder] of Object.entries(loader)) {
      const name = node.inputs[input];
      if (typeof name !== 'string' || !MODEL_FILE_RE.test(name)) continue;
      const key = `${folder}/${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ folder, name, nodeId: id, classType: node.class_type, input });
    }
  }
  return out;
}
