// Low-level Ollama REST client shared by the Ollama ModelProvider and the OllamaService (status, models, show, pull,
// delete, ps, chat) plus the mapping of /api/tags + /api/show into ModelInfo.
// Key decisions:
// - Model details (/api/show) are cached per endpoint + model name + digest (bounded), so listing models costs one
//   /api/tags call once the details are known. A changed digest (re-pulled model) refreshes the entry.
// - Capabilities come from /api/show `capabilities` (Ollama ≥ 0.6). Older servers: derived like Ollama itself does
//   (template mentions `.Tools` → tools; pooling_type / "embed" in the name → embedding, else completion).
// - Context length = model_info["<general.architecture>.context_length"]. KV-cache shape (layers, KV heads, head
//   dimension) is extracted for the VRAM fit estimate; null when the metadata is missing.
import { z } from 'zod';
import type { ModelCapability, ModelInfo } from '@shared/schemas';
import { ModelCapability as ModelCapabilityEnum } from '@shared/schemas';
import { NovaError } from '../core/errors';
import { invalidResponse, joinUrl, requestJson, requestNdjson, type HttpContext } from './http';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

const TagSchema = z.object({
  name: z.string(),
  model: z.string().optional(),
  modified_at: z.string().optional(),
  size: z.number().optional(),
  digest: z.string().optional(),
  details: z
    .object({
      format: z.string().optional(),
      family: z.string().optional(),
      families: z.array(z.string()).nullable().optional(),
      parameter_size: z.string().optional(),
      quantization_level: z.string().optional(),
    })
    .partial()
    .nullable()
    .optional(),
});
export type OllamaTag = z.infer<typeof TagSchema>;

const ShowSchema = z
  .object({
    license: z.string().optional(),
    modelfile: z.string().optional(),
    parameters: z.string().optional(),
    template: z.string().optional(),
    details: TagSchema.shape.details,
    model_info: z.record(z.string(), z.unknown()).nullable().optional(),
    projector_info: z.record(z.string(), z.unknown()).nullable().optional(),
    capabilities: z.array(z.string()).nullable().optional(),
    modified_at: z.string().optional(),
  })
  .passthrough();
export type OllamaShow = z.infer<typeof ShowSchema>;

const PsSchema = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        model: z.string().optional(),
        size: z.number().optional(),
        size_vram: z.number().optional(),
        expires_at: z.string().nullable().optional(),
        context_length: z.number().optional(),
      }),
    )
    .nullable()
    .optional(),
});
export type OllamaPsEntry = NonNullable<z.infer<typeof PsSchema>['models']>[number];

export interface PullEvent {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/** KV-cache geometry for the VRAM estimate. */
export interface KvShape {
  layers: number;
  kvHeads: number;
  headDim: number;
}

export interface OllamaModelDetail {
  info: ModelInfo;
  digest: string | null;
  kv: KvShape | null;
  /** /api/show failed – capabilities/context are heuristics. */
  showFailed: boolean;
}

const KNOWN_CAPS = new Set<string>(ModelCapabilityEnum.options);

/** Valid Ollama model reference: [registry/][namespace/]name[:tag]. */
export const OLLAMA_MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,199}$/;

export function assertModelName(model: string): void {
  if (!OLLAMA_MODEL_NAME.test(model) || model.includes('..') || model.includes('//')) {
    throw new NovaError('VALIDATION', `Ungültiger Modellname: „${model.slice(0, 80)}“.`, { severity: 'warning' });
  }
}

/** "llama3" and "llama3:latest" are the same model. */
export function sameOllamaModel(a: string, b: string): boolean {
  const norm = (x: string) => (x.includes(':') ? x : `${x}:latest`).toLowerCase();
  return norm(a) === norm(b);
}

export class OllamaApi {
  readonly ctx: HttpContext;

  constructor(
    readonly baseUrl: string,
    fetchImpl: typeof fetch,
    providerId = 'ollama-local',
  ) {
    this.ctx = { fetch: fetchImpl, label: 'Ollama', family: 'ollama', providerId };
  }

  private url(path: string): string {
    return joinUrl(this.baseUrl, path);
  }

  async version(signal?: AbortSignal, timeoutMs = 5000): Promise<string | null> {
    const { data } = await requestJson(this.ctx, { method: 'GET', url: this.url('/api/version'), signal, timeoutMs, notFoundMessage: `Unter ${this.baseUrl} antwortet kein Ollama-Server.` });
    if (!data || typeof data !== 'object' || typeof (data as { version?: unknown }).version !== 'string') {
      throw invalidResponse(this.ctx, 'keine Versionsangabe – vermutlich kein Ollama-Server');
    }
    return (data as { version: string }).version;
  }

  async tags(signal?: AbortSignal): Promise<OllamaTag[]> {
    const { data } = await requestJson(this.ctx, { method: 'GET', url: this.url('/api/tags'), signal, timeoutMs: 10_000 });
    const parsed = z.object({ models: z.array(z.unknown()).nullable().optional() }).safeParse(data);
    if (!parsed.success) throw invalidResponse(this.ctx, 'Modellliste unlesbar');
    const out: OllamaTag[] = [];
    for (const m of parsed.data.models ?? []) {
      const t = TagSchema.safeParse(m);
      if (t.success) out.push(t.data);
    }
    return out;
  }

  async show(model: string, signal?: AbortSignal): Promise<OllamaShow> {
    const { data } = await requestJson(this.ctx, {
      method: 'POST',
      url: this.url('/api/show'),
      body: { model, name: model },
      signal,
      timeoutMs: 15_000,
      notFoundMessage: `Das Modell „${model}“ ist in Ollama nicht installiert.`,
    });
    const parsed = ShowSchema.safeParse(data);
    if (!parsed.success) throw invalidResponse(this.ctx, 'Modelldetails unlesbar');
    return parsed.data;
  }

  async ps(signal?: AbortSignal): Promise<OllamaPsEntry[]> {
    const { data } = await requestJson(this.ctx, { method: 'GET', url: this.url('/api/ps'), signal, timeoutMs: 5000 });
    const parsed = PsSchema.safeParse(data);
    if (!parsed.success) throw invalidResponse(this.ctx, 'Liste geladener Modelle unlesbar');
    return parsed.data.models ?? [];
  }

  async delete(model: string): Promise<void> {
    await requestJson(this.ctx, {
      method: 'DELETE',
      url: this.url('/api/delete'),
      body: { model, name: model },
      timeoutMs: 30_000,
      notFoundMessage: `Das Modell „${model}“ ist nicht installiert.`,
    });
  }

  /** Streams /api/pull. Throws PROVIDER_ERROR when Ollama reports `{error}`. */
  async pull(model: string, signal: AbortSignal, idleTimeoutMs: number, onEvent: (ev: PullEvent) => void): Promise<void> {
    await requestNdjson(this.ctx, { method: 'POST', url: this.url('/api/pull'), body: { model, name: model, stream: true }, signal, timeoutMs: idleTimeoutMs }, (value) => {
      if (!value || typeof value !== 'object') return;
      const ev = value as PullEvent;
      if (typeof ev.error === 'string') {
        throw new NovaError('PROVIDER_ERROR', `Ollama meldet: ${ev.error.slice(0, 300)}`, {
          severity: 'warning',
          details: { providerId: this.ctx.providerId, requestSent: true, billable: false, retryable: false, providerMessage: ev.error.slice(0, 300) },
        });
      }
      onEvent(ev);
    });
  }

  async chat(body: Record<string, unknown>, signal: AbortSignal | undefined, timeoutMs: number, model: string): Promise<unknown> {
    const { data } = await requestJson(this.ctx, {
      method: 'POST',
      url: this.url('/api/chat'),
      body,
      signal,
      timeoutMs,
      notFoundMessage: `Das Modell „${model}“ ist in Ollama nicht installiert. Bitte unter „Modelle“ herunterladen.`,
    });
    return data;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Model detail mapping + cache
// ---------------------------------------------------------------------------------------------------------------

interface ShowDerived {
  capabilities: ModelCapability[];
  contextLength: number | null;
  kv: KvShape | null;
}

const DETAIL_CACHE_MAX = 300;
const detailCache = new Map<string, ShowDerived>();

function cacheKey(baseUrl: string, name: string, digest: string | undefined): string {
  return `${baseUrl}|${name}|${digest ?? ''}`;
}

function remember(key: string, value: ShowDerived): void {
  detailCache.delete(key);
  detailCache.set(key, value);
  while (detailCache.size > DETAIL_CACHE_MAX) {
    const first = detailCache.keys().next().value;
    if (first === undefined) break;
    detailCache.delete(first);
  }
}

/** Forget cached details of an endpoint (after pull/delete). */
export function forgetOllamaDetails(baseUrl: string, name?: string): void {
  for (const key of [...detailCache.keys()]) {
    if (!key.startsWith(`${baseUrl}|`)) continue;
    if (name && !sameOllamaModel(key.split('|')[1] ?? '', name)) continue;
    detailCache.delete(key);
  }
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v)) {
    const nums = v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    return nums.length ? Math.max(...nums) : null;
  }
  return null;
}

/** Derives capabilities, context length and KV geometry from /api/show. */
export function deriveFromShow(show: OllamaShow | null, name: string): ShowDerived {
  const info = (show?.model_info ?? {}) as Record<string, unknown>;
  const arch = typeof info['general.architecture'] === 'string' ? (info['general.architecture'] as string) : null;
  const field = (suffix: string): unknown => {
    if (arch && info[`${arch}.${suffix}`] !== undefined) return info[`${arch}.${suffix}`];
    const key = Object.keys(info).find((k) => k.endsWith(`.${suffix}`));
    return key ? info[key] : undefined;
  };

  let capabilities: ModelCapability[];
  if (Array.isArray(show?.capabilities)) {
    capabilities = show!.capabilities!.filter((c): c is ModelCapability => KNOWN_CAPS.has(c));
  } else {
    const caps = new Set<ModelCapability>();
    const isEmbedding = /embed/i.test(name) || field('pooling_type') !== undefined;
    caps.add(isEmbedding ? 'embedding' : 'completion');
    if (!isEmbedding && typeof show?.template === 'string' && show.template.includes('.Tools')) caps.add('tools');
    if (show?.projector_info && Object.keys(show.projector_info).length > 0) caps.add('vision');
    capabilities = [...caps];
  }

  const contextLength = num(field('context_length'));
  const layers = num(field('block_count'));
  const heads = num(field('attention.head_count'));
  const kvHeads = num(field('attention.head_count_kv')) ?? heads;
  const embedding = num(field('embedding_length'));
  const keyLength = num(field('attention.key_length'));
  const headDim = keyLength ?? (embedding && heads ? embedding / heads : null);
  const kv = layers && kvHeads && headDim ? { layers, kvHeads, headDim } : null;
  return { capabilities, contextLength: contextLength ? Math.floor(contextLength) : null, kv };
}

export function tagToModelInfo(tag: OllamaTag, derived: ShowDerived, providerId: string, local: boolean): ModelInfo {
  const modified = tag.modified_at ? Date.parse(tag.modified_at) : NaN;
  return {
    providerId,
    id: tag.name,
    displayName: tag.name,
    local,
    paid: false,
    sizeBytes: typeof tag.size === 'number' ? tag.size : null,
    parameterSize: tag.details?.parameter_size ?? null,
    quantization: tag.details?.quantization_level ?? null,
    family: tag.details?.family ?? null,
    contextLength: derived.contextLength,
    capabilities: derived.capabilities,
    pricing: null,
    modifiedAt: Number.isNaN(modified) ? null : modified,
  };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Installed models with details (one /api/tags call + cached /api/show calls, at most 4 in parallel). */
export async function listOllamaModels(api: OllamaApi, providerId: string, local: boolean, signal?: AbortSignal): Promise<OllamaModelDetail[]> {
  const tags = await api.tags(signal);
  return mapLimited(tags, 4, async (tag) => {
    const key = cacheKey(api.baseUrl, tag.name, tag.digest);
    let derived = detailCache.get(key);
    let showFailed = false;
    if (!derived) {
      try {
        derived = deriveFromShow(await api.show(tag.name, signal), tag.name);
        remember(key, derived);
      } catch (e) {
        if (signal?.aborted) throw e;
        derived = deriveFromShow(null, tag.name);
        showFailed = true;
      }
    }
    return { info: tagToModelInfo(tag, derived, providerId, local), digest: tag.digest ?? null, kv: derived.kv, showFailed };
  });
}

/** Model info for a single model via /api/show (+ size from /api/tags when listed). */
export async function showModelInfo(api: OllamaApi, model: string, providerId: string, local: boolean): Promise<{ info: ModelInfo; show: OllamaShow }> {
  const [show, tags] = await Promise.all([api.show(model), api.tags().catch(() => [] as OllamaTag[])]);
  const tag = tags.find((t) => sameOllamaModel(t.name, model)) ?? { name: model, details: show.details ?? undefined, modified_at: show.modified_at };
  const derived = deriveFromShow(show, model);
  return { info: tagToModelInfo(tag, derived, providerId, local), show };
}
