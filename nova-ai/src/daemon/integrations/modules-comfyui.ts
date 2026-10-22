// Built-in integration module "comfyui" (docs/SPEC-3D.md §2): detects ComfyUI for the 3D workshop – Comfy Desktop
// (current multi-install app), the Legacy ComfyUI Desktop, portable installs and manual git clones – and offers the
// install hint (winget package Comfy.ComfyUI-Desktop through the existing install flow, or https://www.comfy.org/download).
// Key decisions:
// - The file layouts live in src/daemon/threed/engine.ts (detectComfyLayouts), shared with the 3D service so the
//   "Werkzeuge" page and the 3D workshop never disagree. No program is executed: ComfyUI has no version CLI; the core
//   version comes from comfyui_version.py when it is readable.
// - Whether ComfyUI is RUNNING is not part of this module (the 3D workshop probes the local API).
// - canOpen is false: NOVA never starts or controls the ComfyUI program itself.
import type { IntegrationModule } from '../contracts';
import { detectComfyLayouts, type ComfyInstall } from '../threed/engine';
import { installHint } from './modules-tools';
import type { ModuleDeps } from './helpers';

const UNKNOWN = 'unbekannt';

const KIND_LABEL: Record<ComfyInstall['kind'], string> = {
  desktop: 'Comfy Desktop',
  legacy_desktop: 'ComfyUI Desktop (ältere Version)',
  portable: 'ComfyUI (portable Version)',
  manual: 'ComfyUI (eigene Installation)',
};

export function comfyuiModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'comfyui',
    name: 'ComfyUI',
    category: 'ai',
    async detect(ctx) {
      const layouts = detectComfyLayouts(deps.fs, ctx.env, ctx.platform, ctx.manualPath);
      const note = ctx.manualPath && !deps.fs.exists(ctx.manualPath) ? `Der eingetragene Pfad wurde nicht gefunden (${ctx.manualPath}). ` : '';
      if (layouts.installs.length === 0) {
        return {
          available: false,
          version: null,
          path: null,
          message: `${note}ComfyUI wurde nicht gefunden. Es wird für die 3D-Werkstatt gebraucht (Text zu 3D, Bild zu 3D), ist kostenlos und läuft komplett auf diesem PC.`,
          installations: [],
        };
      }
      // Program entries first (Desktop app), then installs with a known ComfyUI version.
      const primary = layouts.installs.find((i) => i.path === ctx.manualPath) ?? layouts.installs[0];
      const version = primary.version ?? layouts.installs.find((i) => i.version)?.version ?? null;
      const more = layouts.installs.length - 1;
      return {
        available: true,
        version,
        path: primary.path,
        message: `${note}${KIND_LABEL[primary.kind]} ist installiert${version ? ` (ComfyUI ${version})` : ''}${
          more > 0 ? ` – insgesamt ${layouts.installs.length} Installationen gefunden` : ''
        }. Ob ComfyUI läuft und die 3D-Bausteine kennt, zeigt die 3D-Werkstatt.`,
        installations: layouts.installs.map((i) => ({ version: i.version ?? UNKNOWN, path: i.path })),
      };
    },
    installHint: (platform) => installHint('comfyui', platform, 'https://www.comfy.org/download'),
  };
}
