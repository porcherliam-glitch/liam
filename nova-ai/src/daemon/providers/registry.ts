// ProviderRegistry: provider rows (table `providers`), model list cache + user pricing (table `model_profiles`),
// API keys via the SecretStore (`provider:<id>`), cached health and the factory extension point.
// Key decisions:
// - upsert follows the merge semantics of UpsertProviderInputSchema: create → enabled=true,
//   paid = type!=='ollama' && !isLocalEndpoint(baseUrl), approved = type==='ollama'; update → omitted fields keep
//   their stored values, `options` (when given) replaces the stored options; the type cannot change; ollama rows are
//   always paid=false/approved=true. Non-local base URLs must use https. Ids without input are slugs of the name.
// - Options are restricted to authHeader, maxConcurrent, maxRequestsPerMinute, organization; keys or values that look
//   like credentials are rejected (keys belong in the SecretStore). Empty values remove an option.
// - get(id) returns a wrapper around the factory instance: wrapper.listModels() is a live query that merges
//   local/paid flags and user pricing, persists the result in model_profiles and refreshes the cache, so the
//   ModelClient's availability checks and the UI's model list always agree. Pricing: user pricing (model_profiles.
//   pricing) overrides provider-reported pricing (kept inside the info JSON).
// - listModels(refresh) uses a 60 s per-provider cache; when a provider is unreachable its last persisted list is
//   returned (UI keeps showing models; availability for routing is decided live by the ModelClient).
// - Health: lastHealth() never touches the network. A background timer (60 s, unref'd, started lazily on the first
//   lastHealth() call or by start()) refreshes it while someone looked at it in the last 5 minutes.
// - Ollama model set changes detected while listing emit 'ollama.models.changed'.
// - remove() also deletes the provider's model profiles and API key and drops its models from the model selection.
import type { ModelInfo, ModelPricing, ModelRef, ProviderConfig, ProviderHealth, ProviderType, UpsertProviderInput } from '@shared/schemas';
import { ModelInfoSchema, ModelPricingSchema, UpsertProviderInputSchema } from '@shared/schemas';
import type { ModelProvider, ProviderFactory, ProviderRegistry, Services } from '../contracts';
import { bool, fromJson, int, toJson } from '../db/database';
import { NovaError, errorMessage, notFound, validation } from '../core/errors';
import { isLocalEndpoint } from '../core/net';
import { containsSecret } from '../core/redact';
import { DEFAULT_OLLAMA_URL } from './ollama-api';
import { ollamaFactory } from './ollama-provider';
import { openAiCompatibleFactory } from './openai-provider';
import { anthropicFactory } from './anthropic-provider';

export const OLLAMA_LOCAL_ID = 'ollama-local';
export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const SUPPORTED_PROVIDER_OPTIONS = ['authHeader', 'maxConcurrent', 'maxRequestsPerMinute', 'organization'] as const;
const SECRET_OPTION_KEY = /(api[_-]?key|apikey|authorization|passw(or)?d|secret|private[_-]?key|token|cookie|credential|bearer)/i;

export function secretIdFor(providerId: string): string {
  return `provider:${providerId}`;
}

export interface ProviderRegistryOptions {
  /** Injected into every provider (tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Background health refresh interval (default 60 s). */
  healthIntervalMs?: number;
  /** Model list cache TTL (default 60 s). */
  modelCacheTtlMs?: number;
}

export interface ProviderRegistryService extends ProviderRegistry {
  /** Starts the background health refresh (immediate refresh + every 60 s while the cache is being read). */
  start(): void;
  stop(): void;
}

interface ProviderRow {
  id: string;
  type: string;
  name: string;
  base_url: string;
  enabled: number;
  paid: number;
  approved: number;
  options: string;
  created_at: number;
  updated_at: number;
}

interface ProfileRow {
  provider_id: string;
  model_id: string;
  info: string;
  pricing: string | null;
}

/** Normalises and validates a provider base URL (http/https, https for non-local endpoints, no trailing slash). */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw validation('Die Adresse des Anbieters ist ungültig.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw validation('Die Adresse des Anbieters muss mit http:// oder https:// beginnen.');
  if (url.username || url.password) throw validation('Die Adresse darf keine Zugangsdaten enthalten. Bitte den API-Schlüssel separat eintragen.');
  if (url.search || url.hash) throw validation('Die Adresse darf keine Parameter (?…) enthalten.');
  const normalized = url.toString().replace(/\/+$/, '');
  if (!isLocalEndpoint(normalized) && url.protocol !== 'https:') {
    throw validation('Anbieter außerhalb dieses PCs müssen über https:// angebunden werden (verschlüsselte Verbindung).');
  }
  return normalized;
}

/** Validates provider options (no secrets, only supported keys, sane values). Empty values are dropped. */
export function sanitizeProviderOptions(options: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(options)) {
    const value = String(rawValue ?? '').trim();
    if (SECRET_OPTION_KEY.test(key) || containsSecret(value) || containsSecret(`${key}=${value}`)) {
      throw validation('Anbieter-Optionen dürfen keine Schlüssel, Tokens oder Passwörter enthalten. Bitte das Feld „API-Schlüssel“ verwenden.');
    }
    if (!(SUPPORTED_PROVIDER_OPTIONS as readonly string[]).includes(key)) {
      throw validation(`Unbekannte Anbieter-Option „${key.slice(0, 40)}“. Erlaubt sind: ${SUPPORTED_PROVIDER_OPTIONS.join(', ')}.`);
    }
    if (!value) continue;
    if (/[\u0000-\u001f\u007f]/.test(value)) throw validation(`Die Option „${key}“ enthält unzulässige Zeichen.`);
    switch (key) {
      case 'authHeader':
        if (!/^[A-Za-z0-9-]{1,64}$/.test(value)) throw validation('„authHeader“ muss ein gültiger HTTP-Headername sein (z. B. api-key).');
        break;
      case 'maxConcurrent': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 64) throw validation('„maxConcurrent“ muss eine ganze Zahl zwischen 1 und 64 sein.');
        break;
      }
      case 'maxRequestsPerMinute': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 100_000) throw validation('„maxRequestsPerMinute“ muss eine ganze Zahl zwischen 1 und 100000 sein.');
        break;
      }
      case 'organization':
        if (value.length > 200) throw validation('„organization“ ist zu lang.');
        break;
    }
    out[key] = value;
  }
  return out;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base && PROVIDER_ID_PATTERN.test(base) ? base : 'anbieter';
}

function minimalInfo(cfg: ProviderConfig, modelId: string): ModelInfo {
  return {
    providerId: cfg.id,
    id: modelId,
    displayName: modelId,
    local: isLocalEndpoint(cfg.baseUrl),
    paid: cfg.type !== 'ollama' && cfg.paid,
    sizeBytes: null,
    parameterSize: null,
    quantization: null,
    family: null,
    contextLength: null,
    capabilities: ['completion'],
    pricing: null,
    modifiedAt: null,
  };
}

export function createProviderRegistry(s: Services, options: ProviderRegistryOptions = {}): ProviderRegistryService {
  const core = s.core;
  const db = core.db;
  const log = core.log.child('providers');
  const factories = new Map<ProviderType, ProviderFactory>();
  for (const f of [ollamaFactory, openAiCompatibleFactory, anthropicFactory]) factories.set(f.type, f);
  const instances = new Map<string, { key: string; raw: ModelProvider }>();
  const wrappers = new Map<string, ModelProvider>();
  const modelCache = new Map<string, { at: number; models: ModelInfo[] }>();
  const inflight = new Map<string, Promise<ModelInfo[]>>();
  const knownModelSets = new Map<string, string>();
  const health = new Map<string, ProviderHealth>();
  const ttl = options.modelCacheTtlMs ?? 60_000;
  const healthInterval = Math.max(1000, options.healthIntervalMs ?? 60_000);
  let healthTimer: NodeJS.Timeout | null = null;
  let healthInflight: Promise<ProviderHealth[]> | null = null;
  let lastHealthReadAt = 0;
  let lastHealthRefreshAt = 0;
  let emittingModelsChanged = false;
  let warnedSecrets = false;

  // Bus subscriptions are allowed in factories (core).
  core.bus.on('ollama.models.changed', (p) => {
    if (emittingModelsChanged) return;
    modelCache.delete(p.providerId);
  });

  const getRow = (id: string) => db.get<ProviderRow>('SELECT * FROM providers WHERE id = ?', [id]);

  const hasKey = (id: string): boolean => {
    try {
      return s.secrets.has(secretIdFor(id));
    } catch (e) {
      if (!warnedSecrets) {
        warnedSecrets = true;
        log.warn('Schlüsselspeicher nicht verfügbar', { error: errorMessage(e) });
      }
      return false;
    }
  };

  const toConfig = (r: ProviderRow): ProviderConfig => ({
    id: r.id,
    type: r.type as ProviderType,
    name: r.name,
    baseUrl: r.base_url,
    enabled: bool(r.enabled),
    paid: r.type === 'ollama' ? false : bool(r.paid),
    approved: r.type === 'ollama' ? true : bool(r.approved),
    hasApiKey: hasKey(r.id),
    options: fromJson<Record<string, string>>(r.options, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const getConfig = (id: string): ProviderConfig | null => {
    const r = getRow(id);
    return r ? toConfig(r) : null;
  };

  const invalidate = (id: string) => {
    instances.delete(id);
    modelCache.delete(id);
  };

  const rawProvider = (id: string): ModelProvider => {
    const row = getRow(id);
    if (!row) throw notFound('Anbieter', id);
    const factory = factories.get(row.type as ProviderType);
    if (!factory) throw new NovaError('MODEL_UNAVAILABLE', `Der Anbietertyp „${row.type}“ wird nicht unterstützt.`, { severity: 'blocker' });
    const key = `${row.updated_at}|${row.base_url}|${row.options}|${row.paid}|${row.name}`;
    const cached = instances.get(id);
    if (cached && cached.key === key) return cached.raw;
    const raw = factory.create(toConfig(row), {
      getApiKey: async () => {
        try {
          return await s.secrets.get(secretIdFor(id));
        } catch (e) {
          log.warn('API-Schlüssel konnte nicht gelesen werden', { provider: id, error: errorMessage(e) });
          return null;
        }
      },
      log: log.child(id),
      fetch: options.fetch,
    });
    instances.set(id, { key, raw });
    return raw;
  };

  const profiles = (providerId: string): Map<string, ProfileRow> => {
    const rows = db.all<ProfileRow>('SELECT provider_id, model_id, info, pricing FROM model_profiles WHERE provider_id = ?', [providerId]);
    return new Map(rows.map((r) => [r.model_id, r]));
  };

  const userPricing = (row: ProfileRow | undefined): ModelPricing | null => {
    if (!row?.pricing) return null;
    const parsed = ModelPricingSchema.safeParse(fromJson<unknown>(row.pricing, null));
    return parsed.success ? parsed.data : null;
  };

  const merge = (cfg: ProviderConfig, model: ModelInfo, profile: ProfileRow | undefined): ModelInfo => ({
    ...model,
    providerId: cfg.id,
    local: isLocalEndpoint(cfg.baseUrl),
    paid: cfg.type !== 'ollama' && cfg.paid,
    pricing: userPricing(profile) ?? model.pricing ?? null,
  });

  const persistedModels = (cfg: ProviderConfig): ModelInfo[] => {
    const out: ModelInfo[] = [];
    for (const row of profiles(cfg.id).values()) {
      const parsed = ModelInfoSchema.safeParse(fromJson<unknown>(row.info, null));
      if (parsed.success) out.push(merge(cfg, parsed.data, row));
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };

  const fetchModels = (id: string): Promise<ModelInfo[]> => {
    const running = inflight.get(id);
    if (running) return running;
    const p = (async () => {
      const cfg = getConfig(id);
      if (!cfg) throw notFound('Anbieter', id);
      const models = await rawProvider(id).listModels();
      const existing = profiles(id);
      const now = core.clock.now();
      const merged: ModelInfo[] = [];
      const seen = new Set<string>();
      db.transaction(() => {
        for (const m of models) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          const info: ModelInfo = { ...m, providerId: id };
          db.run(
            `INSERT INTO model_profiles(provider_id, model_id, info, pricing, updated_at) VALUES (?, ?, ?, NULL, ?)
             ON CONFLICT(provider_id, model_id) DO UPDATE SET info = excluded.info, updated_at = excluded.updated_at`,
            [id, m.id, toJson(info), now],
          );
          merged.push(merge(cfg, info, existing.get(m.id)));
        }
        for (const [modelId, row] of existing) {
          if (!seen.has(modelId) && !row.pricing) db.run('DELETE FROM model_profiles WHERE provider_id = ? AND model_id = ?', [id, modelId]);
        }
      });
      modelCache.set(id, { at: core.clock.now(), models: merged });
      if (cfg.type === 'ollama') {
        const signature = [...seen].sort().join('\n');
        const previous = knownModelSets.get(id);
        knownModelSets.set(id, signature);
        if (previous !== undefined && previous !== signature) {
          emittingModelsChanged = true;
          try {
            core.bus.emit('ollama.models.changed', { providerId: id });
          } finally {
            emittingModelsChanged = false;
          }
        }
      }
      return merged;
    })();
    inflight.set(id, p);
    p.then(
      () => inflight.delete(id),
      () => inflight.delete(id),
    );
    return p;
  };

  const checkHealth = async (id: string, live: boolean): Promise<ProviderHealth> => {
    const cfg = getConfig(id);
    if (!cfg) throw notFound('Anbieter', id);
    let h: ProviderHealth;
    if (!live && !cfg.enabled) {
      h = { providerId: id, status: 'disabled', message: 'Der Anbieter ist deaktiviert.', version: null, checkedAt: core.clock.now(), latencyMs: null };
    } else {
      try {
        h = await rawProvider(id).health();
      } catch (e) {
        h = { providerId: id, status: 'error', message: errorMessage(e), version: null, checkedAt: core.clock.now(), latencyMs: null };
      }
      h = { ...h, providerId: id, checkedAt: core.clock.now() };
      if (!cfg.enabled) h = { ...h, message: `${h.message} (Anbieter ist deaktiviert.)` };
    }
    if (getRow(id)) health.set(id, h);
    return h;
  };

  const wrapperFor = (id: string): ModelProvider => {
    let w = wrappers.get(id);
    if (!w) {
      const row = getRow(id)!;
      const type = row.type as ProviderType;
      w = {
        id,
        type,
        config: () => getConfig(id) ?? toConfig(row),
        health: () => checkHealth(id, true),
        listModels: () => fetchModels(id),
        chat: (req) => rawProvider(id).chat(req),
      };
      wrappers.set(id, w);
    }
    return w;
  };

  const emitUpdated = (id: string) => {
    const cfg = getConfig(id);
    if (cfg) core.bus.emit('provider.updated', cfg);
  };

  /** A removed provider must not stay in the model selection (it could never be used again). */
  const removeFromSelection = (id: string) => {
    const m = core.settings.section('models');
    const keep = (r: ModelRef | null) => (r && r.providerId === id ? null : r);
    const fallbacks = m.fallbacks.filter((r) => r.providerId !== id);
    const roleOverrides = {
      planner: keep(m.roleOverrides.planner),
      coder: keep(m.roleOverrides.coder),
      tester: keep(m.roleOverrides.tester),
      reviewer: keep(m.roleOverrides.reviewer),
    };
    const changed =
      keep(m.defaultModel) !== m.defaultModel ||
      fallbacks.length !== m.fallbacks.length ||
      (Object.keys(roleOverrides) as (keyof typeof roleOverrides)[]).some((k) => roleOverrides[k] !== m.roleOverrides[k]);
    if (!changed) return;
    try {
      core.settings.update({ models: { defaultModel: keep(m.defaultModel), fallbacks, roleOverrides } });
      log.info('Modellauswahl bereinigt (Anbieter entfernt)', { provider: id });
    } catch (e) {
      log.warn('Modellauswahl konnte nicht bereinigt werden', { provider: id, error: errorMessage(e) });
    }
  };

  const healthAll = async (): Promise<ProviderHealth[]> => {
    if (healthInflight) return healthInflight;
    healthInflight = (async () => {
      const ids = db.all<{ id: string }>('SELECT id FROM providers ORDER BY created_at, id').map((r) => r.id);
      const result = await Promise.all(ids.map((id) => checkHealth(id, false)));
      lastHealthRefreshAt = Date.now();
      return result;
    })();
    try {
      return await healthInflight;
    } finally {
      healthInflight = null;
    }
  };

  const refreshHealthInBackground = () => {
    healthAll().catch((e) => log.warn('Statusprüfung der Anbieter fehlgeschlagen', { error: errorMessage(e) }));
  };

  const ensureTimer = () => {
    if (healthTimer) return;
    healthTimer = setInterval(() => {
      const readRecently = Date.now() - lastHealthReadAt < 5 * 60_000;
      if (readRecently || lastHealthRefreshAt === 0) refreshHealthInBackground();
    }, healthInterval);
    healthTimer.unref?.();
  };

  const registry: ProviderRegistryService = {
    registerFactory(factory) {
      factories.set(factory.type, factory);
      instances.clear();
    },

    ensureDefaults() {
      if (getRow(OLLAMA_LOCAL_ID)) return;
      const now = core.clock.now();
      db.run(
        `INSERT OR IGNORE INTO providers(id, type, name, base_url, enabled, paid, approved, options, created_at, updated_at)
         VALUES (?, 'ollama', 'Ollama (lokal)', ?, 1, 0, 1, '{}', ?, ?)`,
        [OLLAMA_LOCAL_ID, DEFAULT_OLLAMA_URL, now, now],
      );
      emitUpdated(OLLAMA_LOCAL_ID);
    },

    list() {
      return db.all<ProviderRow>('SELECT * FROM providers ORDER BY created_at, id').map(toConfig);
    },

    getConfig,

    get(id) {
      const row = getRow(id);
      if (!row || !factories.has(row.type as ProviderType)) return null;
      return wrapperFor(id);
    },

    upsert(input: UpsertProviderInput) {
      const parsed = UpsertProviderInputSchema.safeParse(input);
      if (!parsed.success) {
        throw validation(`Ungültige Anbieterdaten: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'Eingabe'}: ${i.message}`).join('; ')}`, parsed.error.issues);
      }
      const v = parsed.data;
      if (!factories.has(v.type)) throw validation(`Der Anbietertyp „${v.type}“ wird nicht unterstützt.`);
      const baseUrl = normalizeBaseUrl(v.baseUrl);
      const name = v.name.trim();
      if (!name) throw validation('Bitte einen Namen für den Anbieter angeben.');
      const existing = v.id ? getRow(v.id) : undefined;
      const now = core.clock.now();
      let id: string;
      if (existing) {
        id = existing.id;
        if (existing.type !== v.type) throw validation('Der Typ eines vorhandenen Anbieters kann nicht geändert werden. Bitte einen neuen Anbieter anlegen.');
        const options = v.options !== undefined ? sanitizeProviderOptions(v.options) : fromJson<Record<string, string>>(existing.options, {});
        const isOllama = v.type === 'ollama';
        const enabled = v.enabled ?? bool(existing.enabled);
        const paid = isOllama ? false : (v.paid ?? bool(existing.paid));
        const approved = isOllama ? true : (v.approved ?? bool(existing.approved));
        db.run('UPDATE providers SET name = ?, base_url = ?, enabled = ?, paid = ?, approved = ?, options = ?, updated_at = ? WHERE id = ?', [
          name,
          baseUrl,
          int(enabled),
          int(paid),
          int(approved),
          toJson(options),
          Math.max(now, existing.updated_at + 1),
          id,
        ]);
        health.delete(id);
      } else {
        if (v.id) id = v.id;
        else {
          const base = slugify(name);
          id = base;
          for (let n = 2; getRow(id); n++) id = `${base}-${n}`;
        }
        const isOllama = v.type === 'ollama';
        const options = sanitizeProviderOptions(v.options ?? {});
        const enabled = v.enabled ?? true;
        const paid = isOllama ? false : (v.paid ?? !isLocalEndpoint(baseUrl));
        const approved = isOllama ? true : (v.approved ?? false);
        db.run(
          `INSERT INTO providers(id, type, name, base_url, enabled, paid, approved, options, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, v.type, name, baseUrl, int(enabled), int(paid), int(approved), toJson(options), now, now],
        );
      }
      invalidate(id);
      const cfg = getConfig(id)!;
      core.bus.emit('provider.updated', cfg);
      return cfg;
    },

    remove(id) {
      if (id === OLLAMA_LOCAL_ID) throw validation('Der lokale Ollama-Anbieter kann nicht entfernt werden. Bitte stattdessen deaktivieren.');
      if (!getRow(id)) throw notFound('Anbieter', id);
      db.transaction(() => {
        db.run('DELETE FROM model_profiles WHERE provider_id = ?', [id]);
        db.run('DELETE FROM providers WHERE id = ?', [id]);
      });
      invalidate(id);
      wrappers.delete(id);
      health.delete(id);
      knownModelSets.delete(id);
      if (hasKey(id)) {
        s.secrets.delete(secretIdFor(id)).catch((e) => log.warn('API-Schlüssel konnte nicht gelöscht werden', { provider: id, error: errorMessage(e) }));
      }
      removeFromSelection(id);
      core.bus.emit('provider.removed', { id });
    },

    async setApiKey(providerId, apiKey) {
      if (!getRow(providerId)) throw notFound('Anbieter', providerId);
      const key = apiKey.trim();
      if (!key || key.length > 4096 || /[\s\u0000-\u001f]/.test(key)) throw validation('Der API-Schlüssel ist ungültig (leer, zu lang oder mit Leerzeichen).');
      await s.secrets.set(secretIdFor(providerId), key);
      invalidate(providerId);
      health.delete(providerId);
      emitUpdated(providerId);
    },

    async clearApiKey(providerId) {
      if (!getRow(providerId)) throw notFound('Anbieter', providerId);
      await s.secrets.delete(secretIdFor(providerId));
      invalidate(providerId);
      health.delete(providerId);
      emitUpdated(providerId);
    },

    async test(providerId) {
      return checkHealth(providerId, true);
    },

    healthAll,

    lastHealth() {
      lastHealthReadAt = Date.now();
      ensureTimer();
      const ids = db.all<{ id: string }>('SELECT id FROM providers ORDER BY created_at, id').map((r) => r.id);
      const out: ProviderHealth[] = [];
      for (const id of ids) {
        const h = health.get(id);
        if (h) out.push(h);
      }
      return out;
    },

    async listModels(refresh = false) {
      const cfgs = registry.list().filter((c) => c.enabled && factories.has(c.type));
      const lists = await Promise.all(
        cfgs.map(async (cfg) => {
          const cached = modelCache.get(cfg.id);
          if (!refresh && cached && core.clock.now() - cached.at < ttl) return cached.models;
          try {
            return await fetchModels(cfg.id);
          } catch (e) {
            log.debug('Modellliste nicht abrufbar – letzte bekannte Liste wird verwendet', { provider: cfg.id, error: errorMessage(e) });
            return persistedModels(cfg);
          }
        }),
      );
      return lists.flat();
    },

    async getModel(ref: ModelRef) {
      const cfg = getConfig(ref.providerId);
      if (!cfg) return null;
      const cached = modelCache.get(cfg.id);
      if (cached && core.clock.now() - cached.at < ttl) return cached.models.find((m) => m.id === ref.modelId) ?? null;
      const profile = profiles(cfg.id).get(ref.modelId);
      if (profile) {
        const parsed = ModelInfoSchema.safeParse(fromJson<unknown>(profile.info, null));
        if (parsed.success) return merge(cfg, parsed.data, profile);
      }
      try {
        return (await fetchModels(cfg.id)).find((m) => m.id === ref.modelId) ?? null;
      } catch {
        return null;
      }
    },

    async setPricing(ref: ModelRef, pricing: ModelPricing | null) {
      const cfg = getConfig(ref.providerId);
      if (!cfg) throw notFound('Anbieter', ref.providerId);
      const modelId = ref.modelId.trim();
      if (!modelId || modelId.length > 300) throw validation('Bitte eine gültige Modellkennung angeben.');
      let price: ModelPricing | null = null;
      if (pricing) {
        const parsed = ModelPricingSchema.safeParse(pricing);
        if (!parsed.success) throw validation('Ungültiger Preis: Werte müssen Zahlen ≥ 0 sein.');
        price = parsed.data;
      }
      const existing = profiles(cfg.id).get(modelId);
      let baseInfo: ModelInfo | null = null;
      if (existing) {
        const parsed = ModelInfoSchema.safeParse(fromJson<unknown>(existing.info, null));
        if (parsed.success) baseInfo = parsed.data;
      }
      if (!baseInfo) {
        const live = await registry.getModel({ providerId: cfg.id, modelId }).catch(() => null);
        baseInfo = live ? { ...live, pricing: null } : minimalInfo(cfg, modelId);
      }
      const now = core.clock.now();
      db.run(
        `INSERT INTO model_profiles(provider_id, model_id, info, pricing, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider_id, model_id) DO UPDATE SET pricing = excluded.pricing, updated_at = excluded.updated_at`,
        [cfg.id, modelId, toJson(baseInfo), price ? toJson(price) : null, now],
      );
      const profile = profiles(cfg.id).get(modelId);
      const result = merge(cfg, baseInfo, profile);
      const cached = modelCache.get(cfg.id);
      if (cached) cached.models = cached.models.map((m) => (m.id === modelId ? merge(cfg, { ...m, pricing: baseInfo!.pricing }, profile) : m));
      core.bus.emit('provider.updated', cfg);
      return result;
    },

    start() {
      ensureTimer();
      refreshHealthInBackground();
    },

    stop() {
      if (healthTimer) clearInterval(healthTimer);
      healthTimer = null;
    },
  };
  return registry;
}
