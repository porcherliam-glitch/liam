// Shared helpers for the verification scripts: serves dist/, launches Chromium, collects errors.
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync, mkdirSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  ;({ chromium } = require("/opt/node-tools/node_modules/playwright"))
}

export const ROOT = fileURLToPath(new URL("../", import.meta.url))
export const DIST = join(ROOT, "dist")
export const SHOTS = join(ROOT, "verification-shots")
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }

export async function openGame({ viewport = { width: 1280, height: 720 }, initScript, settings } = {}) {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("Build fehlt – zuerst `npm run build` ausführen")
  mkdirSync(SHOTS, { recursive: true })
  const server = createServer(async (req, res) => {
    try {
      const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0]
      const file = resolve(DIST, "." + decodeURIComponent(raw))
      if (file !== DIST && !file.startsWith(DIST + sep)) return res.writeHead(403).end()
      const data = await readFile(file)
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" })
      res.end(data)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const url = `http://127.0.0.1:${server.address().port}/`
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist"],
  })
  const page = await browser.newPage({ viewport })
  page.setDefaultTimeout(120000)
  await page.addInitScript((s) => {
    localStorage.setItem("lastKingdom.settings", JSON.stringify(s))
  }, settings ?? { masterVolume: 0, musicVolume: 0, sfxVolume: 0, quality: "low", shadows: false, showFps: true, cameraShake: false })
  if (initScript) await page.addInitScript(initScript)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto(url, { waitUntil: "load" })
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 })
  const api = {
    page,
    errors,
    check(condition, message) {
      if (!condition) throw new Error(`PRÜFUNG FEHLGESCHLAGEN: ${message}`)
      console.log(`PASS ${message}`)
    },
    snapshot: () => page.evaluate(() => window.__lastKingdom.snapshot()),
    async click(action, extra = "") {
      const loc = page.locator(`[data-action="${action}"]${extra}`).first()
      await loc.evaluate((e) => e.scrollIntoView({ block: "center", inline: "nearest" }))
      await loc.click()
      await page.waitForTimeout(120)
    },
    async shot(name) {
      await page.screenshot({ path: join(SHOTS, name), timeout: 300000 })
      console.log(`shot ${name}`)
    },
    /** Waits for n rendered frames. */
    frames: (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n),
    async until(fn, arg, timeout = 60000) {
      await page.waitForFunction(fn, arg, { timeout })
    },
    /** Holds a key until the expedition clock advanced by `seconds` (independent of frame rate). */
    async hold(key, seconds) {
      const t0 = await page.evaluate(() => window.__lastKingdom.game.expedition?.elapsed ?? 0)
      await page.keyboard.down(key)
      await page.waitForFunction((t) => (window.__lastKingdom.game.expedition?.elapsed ?? 0) >= t, t0 + seconds, { timeout: 120000 })
      await page.keyboard.up(key)
      await api.frames(1)
    },
    async close() {
      await browser.close()
      server.close()
    },
  }
  return api
}
