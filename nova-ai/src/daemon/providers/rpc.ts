// RPC handlers of the providers module: providers.*, models.*, ollama.*, budget.* (src/shared/rpc.ts).
// Params arrive zod-parsed by the router. models.setSelection validates the merged selection (every referenced
// provider must exist) before it is stored, and removes duplicate fallbacks while keeping the user's order.
import type { ModelRef } from '@shared/schemas';
import { ModelSettingsSchema, type ModelSettings } from '@shared/settings';
import type { RpcRegistrar, Services } from '../contracts';
import { deepMerge } from '../core/settings';
import { validation } from '../core/errors';

function validateSelection(s: Services, next: ModelSettings): void {
  const refs: ModelRef[] = [];
  if (next.defaultModel) refs.push(next.defaultModel);
  refs.push(...next.fallbacks);
  for (const r of Object.values(next.roleOverrides)) if (r) refs.push(r);
  for (const ref of refs) {
    if (!ref.modelId.trim()) throw validation('Bitte ein Modell auswählen (leere Modellkennung).');
    if (!s.providers.getConfig(ref.providerId)) throw validation(`Der Anbieter „${ref.providerId}“ ist nicht eingerichtet.`);
  }
}

export const registerProvidersRpc: RpcRegistrar = (router, s) => {
  // --- providers ------------------------------------------------------------------------------------------------
  router.register('providers.list', () => s.providers.list());
  router.register('providers.upsert', (params) => s.providers.upsert(params));
  router.register('providers.remove', ({ id }) => {
    s.providers.remove(id);
    return { ok: true as const };
  });
  router.register('providers.setApiKey', async ({ providerId, apiKey }) => {
    await s.providers.setApiKey(providerId, apiKey);
    return { ok: true as const };
  });
  router.register('providers.clearApiKey', async ({ providerId }) => {
    await s.providers.clearApiKey(providerId);
    return { ok: true as const };
  });
  router.register('providers.test', ({ providerId }) => s.providers.test(providerId));
  router.register('providers.health', () => s.providers.healthAll());

  // --- models ---------------------------------------------------------------------------------------------------
  router.register('models.list', ({ refresh }) => s.providers.listModels(refresh));
  router.register('models.getSelection', () => s.core.settings.section('models'));
  router.register('models.setSelection', (patch) => {
    const current = s.core.settings.section('models');
    const merged = ModelSettingsSchema.safeParse(deepMerge(current as unknown as Record<string, unknown>, patch as Record<string, unknown>));
    if (!merged.success) {
      throw validation(`Ungültige Modellauswahl: ${merged.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, merged.error.issues);
    }
    validateSelection(s, merged.data);
    const toStore: Record<string, unknown> = { ...patch };
    if (patch.fallbacks) {
      const seen = new Set<string>();
      toStore.fallbacks = merged.data.fallbacks.filter((r) => {
        const k = `${r.providerId}/${r.modelId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return s.core.settings.update({ models: toStore }).models;
  });
  router.register('models.setPricing', ({ providerId, modelId, pricing }) => s.providers.setPricing({ providerId, modelId }, pricing));

  // --- ollama ---------------------------------------------------------------------------------------------------
  router.register('ollama.status', ({ baseUrl }) => s.ollama.status(baseUrl));
  router.register('ollama.models', () => s.ollama.models());
  router.register('ollama.show', ({ model }) => s.ollama.show(model));
  router.register('ollama.pull', ({ model }) => s.ollama.pull(model.trim()));
  router.register('ollama.pulls', () => s.ollama.pulls());
  router.register('ollama.cancelPull', ({ id }) => s.ollama.cancelPull(id));
  router.register('ollama.delete', async ({ model }) => {
    await s.ollama.delete(model.trim());
    return { ok: true as const };
  });
  router.register('ollama.running', () => s.ollama.running());
  router.register('ollama.fit', ({ model }) => s.ollama.fit(model.trim()));

  // --- budget ---------------------------------------------------------------------------------------------------
  router.register('budget.status', () => s.budget.status());
  router.register('budget.usage', ({ from, to, projectId, limit }) => s.budget.usage({ from, to, projectId, limit }));
  router.register('budget.setLimits', (params) => s.budget.setLimits(params));
  router.register('budget.resumePaid', ({ projectId }) => s.budget.resumePaid(projectId ?? null));
  router.register('budget.breakdown', (params) => s.budget.breakdown(params));
};
