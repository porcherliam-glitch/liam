// browser-lib.mjs — shared helpers for the Playwright verification scripts: serves dist/, launches Chromium
// (bundled Playwright browser, or CHROMIUM_PATH), collects console errors and provides check/step helpers.
import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync, mkdirSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = fileURLToPath(new URL("../", import.meta.url))
export const DIST = join(ROOT, "dist")
export const SHOTS = join(ROOT, "verification-shots")
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }

export async function openGame({ settings, profile, viewport = { width: 1280, height: 720 } } = {}) {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("Build fehlt – zuerst `npm run build` ausführen")
  mkdirSync(SHOTS, { recursive: true })
  const server = createServer(async (req, res) => {
    try {
      const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0]
      const file = resolve(DIST, "." + decodeURIComponent(raw))
      if (file !== DIST && !file.startsWith(DIST + sep)) return res.writeHead(403).end()
      const data = await readFile(file)
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(data)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(r => server.listen(0, "127.0.0.1", r))
  const url = `http://127.0.0.1:${server.address().port}/`
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
  })
  const page = await browser.newPage({ viewport })
  await page.addInitScript(([s, p]) => {
    if (s && !sessionStorage.getItem("iv-init")) localStorage.setItem("ironVeil.settings.v1", JSON.stringify(s))
    if (p && !sessionStorage.getItem("iv-init")) localStorage.setItem(p.key, JSON.stringify(p.value))
    sessionStorage.setItem("iv-init", "1")
  }, [settings ?? { sensitivity: 0.75, adsSensitivity: 0.8, volume: 0.5, muted: true, quality: "low", invertY: false, fov: 75, difficulty: "normal", screenShake: false, showFps: false }, profile ?? null])
  const errors = []
  page.on("pageerror", e => errors.push(String(e)))
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
  await page.goto(url, { waitUntil: "load" })
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 })
  const api = {
    page, errors,
    check(condition, message) { if (!condition) throw new Error(`PRÜFUNG FEHLGESCHLAGEN: ${message}`); console.log(`PASS ${message}`) },
    snapshot: () => page.evaluate(() => window.__ironVeil.snapshot()),
    profile: () => page.evaluate(() => window.__ironVeil.profile()),
    async action(name, id) { await page.locator(id ? `button[data-action="${name}"][data-id="${id}"]` : `button[data-action="${name}"]`).first().click(); await page.waitForTimeout(80) },
    async shot(name) { await page.screenshot({ path: join(SHOTS, name) }) },
    async reload() { await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 }) },
    /** Waits for n rendered frames (the first frames of a raid can stall while shaders compile). */
    frames: (n = 3) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n),
    /** Waits until fn() (evaluated in the page) is truthy. */
    async until(fn, arg, timeout = 15000) { await page.waitForFunction(fn, arg, { timeout }) },
    async close() { await browser.close(); server.close() },
  }
  return api
}

/** A v3 profile with plenty of money for tests. */
export function richProfile(overrides = {}) {
  return {
    key: "ironVeil.profile.v3",
    value: {
      version: 3, callsign: "VEIL-TEST", money: 20000, resources: 600, xp: 0, level: 3,
      stash: { ammo: 8, medkit: 2, armor: 1, plate: 0, grenade: 2, parts: 3, intel: 0, electronics: 0, medical: 0, relic: 0 },
      weapons: ["p9", "mk4"], buildings: { hq: 1, workshop: 1, lab: 1, clinic: 1 }, staff: { workshop: 1, lab: 1, clinic: 0 },
      production: { workshop: 0, clinic: 0 }, research: [], activeResearch: null,
      loadout: { primary: "mk4", armor: 55, armorMax: 55, medkits: 2, grenades: 0 },
      stats: { raids: 1, extracts: 1, kills: 0, earned: 0, deaths: 0, headshots: 0, bestRaid: 0, contracts: 0 },
      tutorialDone: true, lastTick: Date.now(), ...overrides,
    },
  }
}
