// Barrel of the projects module (SPEC §2): ProjectService, TemplateRegistry (+ built-in templates), ProjectDetector,
// CheckService, PreviewService and the RPC registrar for projects.*, templates.list, checks.*, preview.*.
// Wiring (app.ts): createTemplateRegistry → createProjectDetector → createProjectService → createCheckService →
// createPreviewService (any order; factories never call other services). Shutdown: preview.stopAll().
export { createProjectService, safeFolderName, type ProjectServiceOptions } from './project-service';
export { createTemplateRegistry } from './template-registry';
export { createProjectDetector, type DetectorOptions } from './detector';
export { registerProjectsRpc } from './rpc';
export { chooseTemplate, normalizeText, templateDisplayName, type BuiltinTemplateId, type TemplateChoice, type TemplateChoiceInput } from './template-choice';
export { defaultConfig, mergeConfig, emptyCommands, parseStoredConfig } from './config';
export { checkProjectRoot, canonicalize, pathKey, ROOT_REJECT_PREFIX, type RootSafetyEnv, type KnownFolderProvider } from './root-safety';
export { builtinTemplates } from './templates';
export { createCheckService, type CheckServiceOptions } from '../checks';
export { createPreviewService, type PreviewServiceOptions } from '../preview';
