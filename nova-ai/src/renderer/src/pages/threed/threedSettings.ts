// Saving the "3D-Werkstatt" settings section (Einstellungen and the 3D page): engineUrl / modelsDir go through
// threed.configure, which checks them (local address, real ComfyUI models folder) before storing; all other fields
// use the normal settings.update patch.
import type { Settings, SettingsPatch } from '@shared/settings';
import { api, NovaRpcError } from '../../lib/api';
import { isMethodSupported } from '../../stores/daemon';
import { rpcIssues } from '../settings/shared/forms';

type ConfigureParams = { engineUrl?: string; modelsDir?: string };

/** Maps errors of threed.configure ("engineUrl"/"modelsDir") to the settings field paths ("threeD.engineUrl"). */
function toFieldError(e: unknown, keys: Array<keyof ConfigureParams>): unknown {
  if (!(e instanceof NovaRpcError)) return e;
  const issues = Object.entries(rpcIssues(e)).map(([path, message]) => ({ path: path.startsWith('threeD.') ? path : `threeD.${path}`, message }));
  if (issues.length === 0) {
    // A plain message (no field path): attribute it to the only changed field, otherwise show it for the section.
    if (keys.length !== 1) return e;
    issues.push({ path: `threeD.${keys[0]}`, message: e.message });
  }
  return new NovaRpcError('VALIDATION', e.message, { details: { issues }, info: e.info, method: e.method });
}

/**
 * Saves a settings patch of the 3D section. Rejects with a VALIDATION NovaRpcError whose issue paths are settings
 * field paths, so the settings form can show the message next to the field.
 */
export async function saveThreeDPatch(patch: SettingsPatch): Promise<Settings> {
  const threeD = { ...(patch.threeD ?? {}) };
  const configure: ConfigureParams = {};
  if (threeD.engineUrl !== undefined) configure.engineUrl = threeD.engineUrl;
  if (threeD.modelsDir !== undefined) configure.modelsDir = threeD.modelsDir;
  const keys = Object.keys(configure) as Array<keyof ConfigureParams>;

  if (keys.length > 0 && isMethodSupported('threed.configure')) {
    delete threeD.engineUrl;
    delete threeD.modelsDir;
    try {
      await api('threed.configure', configure);
    } catch (e) {
      throw toFieldError(e, keys);
    }
  }

  const rest: SettingsPatch = { ...patch };
  if (Object.keys(threeD).length > 0) rest.threeD = threeD;
  else delete rest.threeD;
  if (Object.keys(rest).length === 0) return api('settings.get');
  return api('settings.update', rest);
}
