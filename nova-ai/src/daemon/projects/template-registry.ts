// TemplateRegistry – modular registry of project templates (built-ins registered by the factory).
// Key decisions: `list()` computes missingTools from ONE integrations.list() call (cached there for 10 min); if the
// integration service fails, missingTools is [] and a warning is logged (never a made-up "missing" list).
// Registering an id twice replaces the earlier template (lets extensions override built-ins deliberately).
import type { ProjectTemplateInfo } from '@shared/schemas';
import type { ProjectTemplate, Services, TemplateRegistry } from '../contracts';
import { errorMessage, validation } from '../core/errors';
import { builtinTemplates } from './templates';

export function createTemplateRegistry(s: Services): TemplateRegistry {
  const log = s.core.log.child('templates');
  const templates = new Map<string, ProjectTemplate>();

  const registry: TemplateRegistry = {
    register(template) {
      if (!template?.info?.id || !/^[a-z0-9][a-z0-9-]*$/.test(template.info.id)) {
        throw validation('Vorlagen-Kennung ungültig: nur Kleinbuchstaben, Ziffern und Bindestriche.');
      }
      templates.set(template.info.id, template);
    },
    get(id) {
      return templates.get(id) ?? null;
    },
    async list() {
      let available: Map<string, boolean> | null = null;
      try {
        const statuses = await s.integrations.list(false);
        available = new Map(statuses.map((st) => [st.id, st.available]));
      } catch (e) {
        log.warn('Werkzeugstatus für Vorlagen nicht verfügbar', { error: errorMessage(e) });
      }
      const out: ProjectTemplateInfo[] = [];
      for (const t of templates.values()) {
        const missingTools = available ? t.info.requiredTools.filter((tool) => available!.get(tool) !== true) : [];
        out.push({ ...t.info, technologies: [...t.info.technologies], requiredTools: [...t.info.requiredTools], missingTools });
      }
      return out;
    },
  };

  for (const t of builtinTemplates({
    resolveUnity: async () => {
      try {
        return await s.integrations.resolvePath('unity');
      } catch (e) {
        log.warn('Unity-Pfad konnte nicht ermittelt werden', { error: errorMessage(e) });
        return null;
      }
    },
  })) {
    registry.register(t);
  }
  return registry;
}
