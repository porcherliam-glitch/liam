// Playwright harness for DEAD ZONE: EXTRACTION.
// Opens the built index.html over file://, collects console/page errors and offers helpers
// around the window.DZ debug API (see SPEC.md §26).
//
// Usage in a test:
//   import { openGame } from './harness.mjs';
//   const g = await openGame();            // { browser, page, errors, dz, close }
//   await g.dz('newGame');                 // calls window.DZ.newGame() and awaits a returned promise
//   await g.step(60);                      // 60 fixed updates
//   g.assertNoErrors();
//   await g.close();
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const INDEX_PATH = path.resolve(here, '..', '..', 'index.html');
export const INDEX_URL = 'file://' + INDEX_PATH;

export async function openGame(opts = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 720 },
    hasTouch: !!opts.touch,
    isMobile: !!opts.mobile,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e && e.message ? e.message : String(e))));
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error') errors.push('console.error: ' + msg.text());
    else if (t === 'warning') warnings.push(msg.text());
  });
  if (opts.clearStorage !== false) {
    // Fresh localStorage for every run: navigate once, clear, reload.
    await page.goto(INDEX_URL);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  }
  await page.goto(INDEX_URL);
  await page.waitForFunction(() => !!window.DZ, null, { timeout: 15000 });
  // Deterministic stepping: stop rAF-driven updates unless the test wants realtime.
  if (!opts.realtime) await page.evaluate(() => window.DZ.setAuto(false));

  const g = {
    browser, context, page, errors, warnings,
    // Call a DZ function by name with args; awaits a promise result if any.
    async dz(name, ...args) {
      return page.evaluate(async ({ name, args }) => {
        const fn = window.DZ[name];
        if (typeof fn !== 'function') throw new Error('DZ.' + name + ' is not a function');
        const r = fn(...args);
        const v = (r && typeof r.then === 'function') ? await r : r;
        // Return only JSON-safe data.
        try { return JSON.parse(JSON.stringify(v === undefined ? null : v, (k, val) => (typeof val === 'function' ? undefined : val))); }
        catch (e) { return String(v); }
      }, { name, args });
    },
    // Evaluate arbitrary code with access to DZ (string or function).
    async eval(fnOrString, arg) {
      return page.evaluate(fnOrString, arg);
    },
    async step(n = 1, dt = 1 / 60) {
      return page.evaluate(({ n, dt }) => window.DZ.step(dt, n), { n, dt });
    },
    async key(code, down = true) {
      return page.evaluate(({ code, down }) => window.DZ.key(code, down), { code, down });
    },
    async tap(code, steps = 2) {
      await g.key(code, true); await g.step(1); await g.key(code, false); await g.step(steps);
    },
    async player() {
      return page.evaluate(() => {
        const p = window.DZ.player();
        if (!p) return null;
        return { x: p.x, y: p.y, hp: p.hp, hpMax: p.hpMax, stamina: p.stamina, dead: !!p.dead, angle: p.angle,
          weight: p.totalWeight ? p.totalWeight() : null, activeSlot: p.activeSlot,
          inventory: p.inventory ? p.inventory.all().map(i => ({ id: i.id, count: i.count })) : null };
      });
    },
    async screen() { return page.evaluate(() => window.DZ.screen()); },
    async state() { return page.evaluate(() => window.DZ.state()); },
    async screenshot(file) { return page.screenshot({ path: file }); },
    assertNoErrors(label = '') {
      if (errors.length) {
        throw new Error(`Console/page errors${label ? ' (' + label + ')' : ''}:\n  ` + errors.join('\n  '));
      }
    },
    async close() { await browser.close(); },
  };
  return g;
}

// Tiny assertion helpers (no dependency on a test framework).
export function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); }
export function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`Assertion failed: ${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}
export function assertClose(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error(`Assertion failed: ${msg} (got ${a}, expected ~${b})`);
}

// Runs named test functions sequentially; returns {passed, failed, failures}.
export async function runTests(tests) {
  let passed = 0, failed = 0; const failures = [];
  for (const [name, fn] of Object.entries(tests)) {
    const t0 = Date.now();
    try {
      await fn();
      passed++;
      console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
    } catch (e) {
      failed++;
      failures.push({ name, error: e && e.stack ? e.stack : String(e) });
      console.log(`  FAIL ${name}\n       ${String(e && e.message ? e.message : e).split('\n').join('\n       ')}`);
    }
  }
  return { passed, failed, failures };
}
