// End-to-end test of the built NOVA AI app (UI-SPEC §5): Electron main + preload + renderer + the real daemon.
// Flow: start with a temporary data dir → daemon pill shows "Läuft" → sidebar navigation → project from the
// "Webanwendung" template via the dialog → studio → keepRunningWhenUiClosed=false → quit → the daemon process exits.
// Requirements: `npm run build` (npm run e2e does it), on Linux a display (`xvfb-run -a npx playwright test`).
// Key decisions:
// - Fully isolated: temporary NOVA_DATA_DIR (daemon), NOVA_USER_DATA_DIR (Electron profile, window state, single
//   instance lock) and projects folder; NOVA_DEV / NOVA_RENDERER_URL of a developer shell are removed.
// - Selectors use roles and the German labels of the renderer (no data-testid exists in the renderer); the data dir
//   lives in os.tmpdir() because unix socket paths are limited to ~100 characters.
// - NOVA_E2E_APP_DIR (optional) points to another app directory with package.json + out/** (e.g. a staging copy).
// - Cleanup never leaves a daemon behind: if it survives the test it is killed and the failure is reported.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DaemonConnectionState, NovaBridge } from '../src/shared/bridge';

/** App directory to launch (package.json + out/**). NOVA_E2E_APP_DIR allows testing another build output. */
const ROOT = process.env.NOVA_E2E_APP_DIR ? resolve(process.env.NOVA_E2E_APP_DIR) : resolve(__dirname, '..');
const isLinux = process.platform === 'linux';

const NAV: Array<{ label: RegExp; hash: RegExp }> = [
  { label: /^Projekte/, hash: /#\/projects$/ },
  { label: /^Agenten/, hash: /#\/agents$/ },
  { label: /^Aufgaben/, hash: /#\/tasks$/ },
  { label: /^Freigaben/, hash: /#\/approvals$/ },
  { label: /^Modelle/, hash: /#\/models$/ },
  { label: /^Kosten/, hash: /#\/costs$/ },
  { label: /^Wissen/, hash: /#\/knowledge$/ },
  { label: /^Werkzeuge/, hash: /#\/integrations$/ },
  { label: /^Einstellungen/, hash: /#\/settings$/ },
  { label: /^Protokolle/, hash: /#\/logs$/ },
  { label: /^Übersicht/, hash: /#\/$/ },
];

/** True while the process exists and is not a zombie (Linux containers do not always reap orphans). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (isLinux) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
      if (state === 'Z' || state === 'X') return false;
    } catch {
      return false;
    }
  }
  return true;
}

function removeDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    /* best effort (Windows may still hold a log file for a moment) */
  }
}

/** PID from the daemon's lock file (<dataDir>/daemon.lock), if any. */
function pidFromLock(dir: string): number | null {
  try {
    const lock = JSON.parse(readFileSync(join(dir, 'daemon.lock'), 'utf8')) as { pid?: unknown };
    return typeof lock.pid === 'number' ? lock.pid : null;
  } catch {
    return null;
  }
}

/** Typed access to window.nova inside page.evaluate (the node tsconfig has no DOM lib). */
type NovaGlobal = { nova: NovaBridge; require?: unknown; process?: unknown };

test.describe('NOVA AI (Electron)', () => {
  let app: ElectronApplication | null = null;
  let page: Page;
  let dataDir = '';
  let userDataDir = '';
  let projectsDir = '';
  let daemonPid: number | null = null;

  test.beforeAll(() => {
    for (const file of ['out/main/index.cjs', 'out/preload/index.cjs', 'out/daemon/index.cjs', 'out/renderer/index.html']) {
      if (!existsSync(join(ROOT, file))) throw new Error(`${file} fehlt – bitte zuerst "npm run build" ausführen.`);
    }
    dataDir = mkdtempSync(join(tmpdir(), 'nova-e2e-'));
    userDataDir = mkdtempSync(join(tmpdir(), 'nova-e2e-ui-'));
    projectsDir = mkdtempSync(join(tmpdir(), 'nova-e2e-proj-'));
  });

  test.afterAll(async () => {
    // Stop a daemon that survived a failed test first (it would keep running: keepRunningWhenUiClosed), then the app.
    const pid = daemonPid ?? pidFromLock(dataDir);
    if (pid !== null && isProcessAlive(pid)) {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
    if (app) {
      const running = app;
      app = null;
      const closed = await Promise.race([running.close().then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 15_000))]);
      if (!closed) running.process().kill();
    }
    for (const dir of [dataDir, userDataDir, projectsDir]) if (dir) removeDir(dir);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && app && page && !page.isClosed()) {
      const shot = await page.screenshot().catch(() => null);
      if (shot) await testInfo.attach('screenshot', { body: shot, contentType: 'image/png' });
      const log = join(dataDir, 'logs', 'ui-main.log');
      if (existsSync(log)) await testInfo.attach('ui-main.log', { path: log, contentType: 'text/plain' });
      const startLog = join(dataDir, 'logs', 'daemon-start.log');
      if (existsSync(startLog)) await testInfo.attach('daemon-start.log', { path: startLog, contentType: 'text/plain' });
    }
  });

  test('startet, navigiert, legt ein Projekt an, öffnet das Studio und beendet den Hintergrunddienst', async () => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'NOVA_DEV' && k !== 'NOVA_RENDERER_URL' && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
    env.NOVA_DATA_DIR = dataDir;
    env.NOVA_USER_DATA_DIR = userDataDir;

    await test.step('App starten', async () => {
      app = await electron.launch({
        args: [ROOT, ...(isLinux ? ['--no-sandbox', '--disable-gpu'] : [])],
        env,
        timeout: 60_000,
      });
      page = await app.firstWindow({ timeout: 60_000 });
      // The window exists before the renderer is loaded (lazy loading): wait for the app origin.
      await page.waitForURL(/^app:\/\/nova\//, { timeout: 60_000 });
      await page.waitForLoadState('domcontentloaded');
    });

    await test.step('Renderer ist abgeschottet', async () => {
      const probe = await page.evaluate(() => {
        const g = globalThis as unknown as NovaGlobal;
        return { nova: typeof g.nova, keys: Object.keys(g.nova).sort(), require: typeof g.require, process: typeof g.process };
      });
      expect(probe).toEqual({ nova: 'object', keys: ['app', 'daemon', 'invoke', 'onEvent'], require: 'undefined', process: 'undefined' });
    });

    await test.step('Hintergrunddienst läuft', async () => {
      // "Läuft" – or "Pausiert" if the daemon starts with a paused work cycle (the service itself runs either way).
      await expect(page.getByRole('link', { name: /^Hintergrunddienst: (Läuft|Pausiert)/ })).toBeVisible({ timeout: 90_000 });
      const state = await page.evaluate(() => (globalThis as unknown as NovaGlobal).nova.daemon.state());
      expect(state.state).toBe('connected');
      expect(state.daemonPid).toEqual(expect.any(Number));
      daemonPid = (state as DaemonConnectionState).daemonPid;
    });

    await test.step('Navigation in der Seitenleiste', async () => {
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      await expect(nav).toBeVisible();
      for (const item of NAV) {
        await nav.getByRole('link', { name: item.label }).first().click();
        await expect(page).toHaveURL(item.hash);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      }
    });

    await test.step('Projekt aus der Vorlage „Webanwendung“ anlegen', async () => {
      const updated = await page.evaluate(
        (dir) => (globalThis as unknown as NovaGlobal).nova.invoke('settings.update', { general: { projectsDir: dir } }),
        projectsDir,
      );
      expect(updated.ok).toBe(true);
      await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: /^Projekte/ }).first().click();
      await expect(page).toHaveURL(/#\/projects$/);
      await page.getByRole('button', { name: /^(Neues Projekt|Projekt erstellen)$/ }).first().click();
      const dialog = page.getByRole('dialog').filter({ hasText: 'Neues Projekt' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('tab', { name: 'Vorlage' }).click();
      const webApp = dialog.locator('input[name="project-template"][value="web-app"]');
      await expect(webApp).toHaveCount(1, { timeout: 30_000 });
      await webApp.check({ force: true });
      await dialog.getByLabel('Projektname').fill('E2E Webanwendung');
      await dialog.getByRole('button', { name: 'Projekt anlegen' }).click();
      await expect(page).toHaveURL(/#\/projects\/[^/?#]+(\?[^#]*)?$/, { timeout: 180_000 });
      const projects = await page.evaluate(() => (globalThis as unknown as NovaGlobal).nova.invoke('projects.list'));
      expect(projects.ok).toBe(true);
      expect(JSON.stringify(projects)).toContain('E2E Webanwendung');
    });

    await test.step('Studio öffnen', async () => {
      await page.getByRole('button', { name: 'Studio öffnen' }).first().click();
      await expect(page).toHaveURL(/#\/projects\/[^/?#]+\/studio/);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    await test.step('keepRunningWhenUiClosed=false und beenden → Hintergrunddienst endet', async () => {
      const res = await page.evaluate(() =>
        (globalThis as unknown as NovaGlobal).nova.invoke('settings.update', { background: { keepRunningWhenUiClosed: false } }),
      );
      expect(res.ok).toBe(true);
      expect(daemonPid).not.toBeNull();
      const running = app!;
      const exited = new Promise<number | null>((r) => running.process().once('exit', (code) => r(code)));
      // The promise of quit() may never settle (the window closes); do not await it inside the page.
      await page.evaluate(() => {
        void (globalThis as unknown as NovaGlobal).nova.app.quit();
      });
      await exited;
      app = null;
      await expect.poll(() => isProcessAlive(daemonPid!), { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(false);
      if (isLinux) expect(existsSync(join(dataDir, 'daemon.sock'))).toBe(false);
    });
  });
});
