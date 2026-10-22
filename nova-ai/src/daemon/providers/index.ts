// Barrel of the providers module (models, Ollama, cloud providers, budget). Used by src/daemon/app.ts.
// Wiring: createBudgetService(s), createProviderRegistry(s), createModelClient(s), createOllamaService(s) – none of
// them calls another service during construction. After the container is filled: providers.ensureDefaults(), then
// (optional but recommended) budget.start(), providers.start(), ollama.start(); on shutdown ollama.stop(),
// providers.stop(), budget.stop(). registerProvidersRpc registers providers.*, models.*, ollama.*, budget.*.
export { createProviderRegistry, OLLAMA_LOCAL_ID, normalizeBaseUrl, sanitizeProviderOptions, secretIdFor } from './registry';
export type { ProviderRegistryService, ProviderRegistryOptions } from './registry';
export { createModelClient, estimateInputTokens, redactMessages } from './model-client';
export type { ModelClientOptions, ResolveOptions } from './model-client';
export { createBudgetService, BUDGET_RESUME_SUBJECT, formatUsd } from './budget';
export type { BudgetServiceImpl } from './budget';
export { createOllamaService } from './ollama-service';
export type { OllamaServiceImpl, OllamaServiceOptions } from './ollama-service';
export { registerProvidersRpc } from './rpc';
export { ollamaFactory } from './ollama-provider';
export { openAiCompatibleFactory } from './openai-provider';
export { anthropicFactory } from './anthropic-provider';
export { DEFAULT_OLLAMA_URL } from './ollama-api';
export { providerErrorDetails } from './http';
export type { ProviderErrorDetails } from './http';
export { ProviderRateLimiter } from './rate-limit';
