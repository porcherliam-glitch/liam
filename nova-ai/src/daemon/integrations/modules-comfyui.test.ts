// Tests for the built-in integration module "comfyui": Comfy Desktop, Legacy Desktop and portable detection on a
// simulated Windows layout (path.win32 + in-memory fs), Linux, the manual path and the winget install hint.
import { describe, expect, it } from 'vitest';
import { IntegrationStatusSchema } from '@shared/schemas';
import { comfyuiModule } from './modules-comfyui';
import { detectCtx, memFs } from './test-helpers';
import { wingetCommandFor } from './winget';

const W = 'C:\\Users\\Ana';

describe('comfyui integration module', () => {
  it('detects Comfy Desktop with its ComfyUI version on Windows', async () => {
    const fs = memFs('win32', {
      [`${W}\\AppData\\Local\\Programs\\Comfy Desktop\\Comfy Desktop.exe`]: '',
      [`${W}\\AppData\\Roaming\\Comfy Desktop\\installations.json`]: JSON.stringify([{ id: 'a', installPath: `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone` }]),
      [`${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\main.py`]: '',
      [`${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\comfyui_version.py`]: '__version__ = "0.42.0"',
    });
    const r = await comfyuiModule({ fs, platform: 'win32' }).detect(detectCtx('win32'));
    expect(r).toMatchObject({ available: true, version: '0.42.0', path: `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\main.py` });
    expect(r.message).toContain('Comfy Desktop ist installiert (ComfyUI 0.42.0)');
    expect(r.message).toContain('insgesamt 2 Installationen');
    expect(r.installations).toEqual([
      { version: '0.42.0', path: `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\main.py` },
      { version: 'unbekannt', path: `${W}\\AppData\\Local\\Programs\\Comfy Desktop\\Comfy Desktop.exe` },
    ]);
  });

  it('detects the Legacy Desktop app and portable installs; reports nothing on an empty PC', async () => {
    const legacy = memFs('win32', { [`${W}\\AppData\\Local\\Programs\\ComfyUI\\ComfyUI.exe`]: '' });
    const r1 = await comfyuiModule({ fs: legacy, platform: 'win32' }).detect(detectCtx('win32'));
    expect(r1).toMatchObject({ available: true, version: null, path: `${W}\\AppData\\Local\\Programs\\ComfyUI\\ComfyUI.exe` });
    expect(r1.message).toContain('ältere Version');

    const portable = memFs('win32', { ['D:\\ComfyUI_windows_portable\\ComfyUI\\main.py']: '', ['D:\\ComfyUI_windows_portable\\run_cpu.bat']: '' });
    const r2 = await comfyuiModule({ fs: portable, platform: 'win32' }).detect(detectCtx('win32'));
    expect(r2).toMatchObject({ available: true, path: 'D:\\ComfyUI_windows_portable\\run_cpu.bat' });
    expect(r2.message).toContain('portable Version');

    const none = await comfyuiModule({ fs: memFs('win32'), platform: 'win32' }).detect(detectCtx('win32'));
    expect(none).toMatchObject({ available: false, version: null, path: null, installations: [] });
    expect(none.message).toContain('3D-Werkstatt');
  });

  it('uses a manual path and explains a missing one', async () => {
    const fs = memFs('win32', { ['E:\\Comfy\\ComfyUI\\main.py']: '', ['E:\\Comfy\\ComfyUI\\comfyui_version.py']: '__version__ = "0.41.3"' });
    const r = await comfyuiModule({ fs, platform: 'win32' }).detect(detectCtx('win32', { manualPath: 'E:\\Comfy\\ComfyUI\\main.py' }));
    expect(r).toMatchObject({ available: true, version: '0.41.3', path: 'E:\\Comfy\\ComfyUI\\main.py' });
    const missing = await comfyuiModule({ fs: memFs('win32'), platform: 'win32' }).detect(detectCtx('win32', { manualPath: 'E:\\weg\\main.py' }));
    expect(missing.available).toBe(false);
    expect(missing.message).toContain('Der eingetragene Pfad wurde nicht gefunden');
  });

  it('detects a manual clone on Linux', async () => {
    const fs = memFs('linux', { '/home/ana/ComfyUI/main.py': '', '/home/ana/ComfyUI/comfyui_version.py': "__version__ = '0.42.0'" });
    const r = await comfyuiModule({ fs, platform: 'linux' }).detect(detectCtx('linux'));
    expect(r).toMatchObject({ available: true, version: '0.42.0', path: '/home/ana/ComfyUI/main.py' });
    expect(r.message).toContain('eigene Installation');
  });

  it('offers the winget package Comfy.ComfyUI-Desktop on Windows and the download page elsewhere; category ai, no open()', () => {
    const mod = comfyuiModule({ fs: memFs('win32'), platform: 'win32' });
    expect(mod).toMatchObject({ id: 'comfyui', name: 'ComfyUI', category: 'ai' });
    expect(mod.open).toBeUndefined();
    expect(mod.installHint('win32')).toEqual({ command: wingetCommandFor('comfyui'), url: 'https://www.comfy.org/download', requiresAdmin: false });
    expect(wingetCommandFor('comfyui')).toContain('--id Comfy.ComfyUI-Desktop -e');
    expect(mod.installHint('linux')).toEqual({ command: null, url: 'https://www.comfy.org/download', requiresAdmin: false });
    const status = { id: mod.id, name: mod.name, category: mod.category, available: false, version: null, path: null, manualPath: null, installations: [], canOpen: false, message: 'x', installHint: mod.installHint('win32'), checkedAt: 0 };
    expect(IntegrationStatusSchema.safeParse(status).success).toBe(true);
  });
});
