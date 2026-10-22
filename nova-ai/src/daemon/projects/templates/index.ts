// Built-in project templates (SPEC §4.8 templates 1–6). Each template is an independent module implementing the
// ProjectTemplate contract; further templates can be added at runtime via TemplateRegistry.register().
import type { ProjectTemplate } from '../../contracts';
import { createWebGameTemplate } from './web-game';
import { createWebAppTemplate } from './web-app';
import { createUnityTemplate } from './unity';
import { createDesktopDotnetTemplate } from './desktop-dotnet';
import { createBackendApiTemplate } from './backend-api';
import { createEmptyTemplate } from './empty';

export interface BuiltinTemplateDeps {
  /** Newest installed Unity editor (integrations.resolvePath('unity')), null if none. Called at scaffold time only. */
  resolveUnity(): Promise<string | null>;
}

export function builtinTemplates(deps: BuiltinTemplateDeps): ProjectTemplate[] {
  return [createWebGameTemplate(), createWebAppTemplate(), createUnityTemplate(deps.resolveUnity), createDesktopDotnetTemplate(), createBackendApiTemplate(), createEmptyTemplate()];
}

export { createWebGameTemplate, createWebAppTemplate, createUnityTemplate, createDesktopDotnetTemplate, createBackendApiTemplate, createEmptyTemplate };
