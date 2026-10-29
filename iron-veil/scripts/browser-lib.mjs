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

export async function openGame({ settings, profile, viewport = { width: 1280, height: 720 }, initScript } = {}) {
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
  // software rendering of the big zone can take seconds per frame: give clicks and waits room
  page.setDefaultTimeout(90000)
  await page.addInitScript(([s, p]) => {
    if (s && !sessionStorage.getItem("iv-init")) localStorage.setItem("ironVeil.settings.v1", JSON.stringify(s))
    if (p && !sessionStorage.getItem("iv-init")) localStorage.setItem(p.key, JSON.stringify(p.value))
    sessionStorage.setItem("iv-init", "1")
    // software rendering draws the big zone at ~1 fps: let the fixed-step loop catch up a full second per frame
    window.__ivMaxFrame = 1
  }, [settings ?? { sensitivity: 0.75, adsSensitivity: 0.8, volume: 0.5, muted: true, quality: "low", invertY: false, fov: 75, difficulty: "normal", screenShake: false, showFps: false }, profile ?? null])
  if (initScript) await page.addInitScript(initScript)
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
    async shot(name) { await page.screenshot({ path: join(SHOTS, name), timeout: 120000 }) },
    async reload() { await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 }) },
    /** Waits for n rendered frames (the first frames of a raid can stall while shaders compile). */
    frames: (n = 3) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n),
    /** Waits until fn() (evaluated in the page) is truthy. */
    async until(fn, arg, timeout = 45000) { await page.waitForFunction(fn, arg, { timeout }) },
    async close() { await browser.close(); server.close() },
  }
  return api
}

/** A v4 profile with plenty of money, materials and a built-up base for tests. overrides are merged shallowly. */
export function richProfile(overrides = {}) {
  const structures = { hq: 2, bunks: 1, storage: 1, workshop: 1, armory: 2, workbench: 2, clinic: 1, kitchen: 1, generator: 1, lab: 1, radio: 1, walls: 1, tower: 1 }
  return {
    key: "ironVeil.profile.v4",
    value: {
      version: 4, callsign: "VEIL-TEST", money: 50000, xp: 0, level: 8,
      stash: { ammo_556: 400, ammo_9mm: 300, ammo_762: 200, ammo_12buck: 60, ammo_556ap: 60, bandage: 10, medkit: 4, painkiller: 2, antiviral: 2, canned: 5, water: 5, grenade: 4, molotov: 3, scrap: 80, cloth: 40, chem: 20, parts: 20, electronics: 10, tools: 5, wood: 40, att_reddot: 1, att_suppressor: 1, att_extmag: 1, att_vgrip: 1, w_kv12: 1, w_machete: 1, helmet: 1 },
      loadout: { primary: "mk4", primaryMods: {}, primaryAmmo: "ammo_556", secondary: "p9", secondaryMods: {}, secondaryAmmo: "ammo_9mm", melee: "knife", armor: 55, armorMax: 55, helmet: 0, backpack: "pack_small",
        bag: [{ id: "ammo_556", qty: 60 }, { id: "ammo_556", qty: 60 }, { id: "ammo_9mm", qty: 30 }, { id: "bandage", qty: 3 }, { id: "medkit", qty: 1 }, { id: "water", qty: 1 }, { id: "canned", qty: 1 }, { id: "grenade", qty: 2 }, { id: "molotov", qty: 1 }], secure: [] },
      structures, staff: { workshop: 1, clinic: 1, kitchen: 0, lab: 1, tower: 1 },
      production: { workshop: 0, clinic: 0, kitchen: 0 }, workshopAmmo: "ammo_9mm", crafting: [], research: [], activeResearch: null,
      contracts: { offers: [], active: [], refreshAt: 0 }, base: { threat: 10, attackPending: false, lastAttack: Date.now() },
      infection: 0, raidStarted: 0, raidSecure: [], emergencyCooldown: 0,
      stats: { raids: 3, extracts: 2, deaths: 1, kills: 10, infectedKills: 8, mercKills: 2, headshots: 3, dismembered: 1, earned: 0, bestRaid: 0, contracts: 0, defenses: 0 },
      tutorialDone: true, lastTick: Date.now(), ...overrides,
    },
  }
}
