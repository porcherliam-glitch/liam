import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
const ROOT = fileURLToPath(new URL("../", import.meta.url)), DIST = join(ROOT, "dist")
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }
const server = createServer(async (req, res) => { try { const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0]; const file = resolve(DIST, "." + decodeURIComponent(raw)); if (file !== DIST && !file.startsWith(DIST + sep)) return res.writeHead(403).end(); const data = await readFile(file); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(data) } catch { res.writeHead(404).end() } })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--use-gl=swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.addInitScript(() => {
  localStorage.setItem("ironVeil.settings.v1", JSON.stringify({ sensitivity: .75, volume: .5, muted: true, quality: "low", invertY: false }))
  if (!localStorage.getItem("ironVeil.profile.v2")) localStorage.setItem("ironVeil.profile.v2", JSON.stringify({ version: 2, callsign: "VEIL-TEST", money: 10000, resources: 500, xp: 0, level: 1, stash: { ammo: 8, medkit: 1, armor: 1, parts: 3, intel: 0, electronics: 0, medical: 0, relic: 0 }, buildings: { hq: 1, workshop: 1, lab: 1, clinic: 1 }, staff: { workshop: 1, lab: 1, clinic: 0 }, production: { workshop: 0, clinic: 0 }, research: [], activeResearch: null, loadout: { armor: 55, medkits: 2 }, stats: { raids: 0, extracts: 0, kills: 0, earned: 0, deaths: 0 }, lastTick: Date.now() }))
})
const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
const check = (v, m) => { if (!v) throw new Error(m); console.log(`PASS ${m}`) }, profile = () => page.evaluate(() => window.__ironVeil.profile()), snapshot = () => page.evaluate(() => window.__ironVeil.snapshot())
const action = async name => { await page.locator(`button[data-action="${name}"]`).first().click(); await page.waitForTimeout(100) }
try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" }); await page.waitForFunction(() => window.__GAME_READY__ === true)
  await action("base"); await page.locator('[data-action=build][data-id=hq]').click(); await page.locator('[data-action=build][data-id=hq]').click(); check((await profile()).buildings.hq === 3, "Zwei Gebäudeausbauten")
  await page.locator('[data-action=staff][data-id=clinic][data-delta="1"]').click(); await page.locator('[data-action=staff][data-id=workshop][data-delta="-1"]').click()
  check((await profile()).staff.clinic === 1 && (await profile()).staff.workshop === 0, "Personal zuweisen und abziehen")
  const medBefore = (await profile()).stash.medkit; await page.evaluate(() => { const key = "ironVeil.profile.v2"; const p = JSON.parse(localStorage.getItem(key)); p.lastTick = Date.now() - 100000; localStorage.setItem(key, JSON.stringify(p)) }); await page.reload({ waitUntil: "networkidle" }); await page.waitForFunction(() => window.__GAME_READY__ === true)
  check((await profile()).stash.medkit === medBefore + 1, "Feldlazarett-Produktion")
  for (const id of ["ballistics", "plating", "broker"]) { await action("base"); await page.locator(`[data-action=research][data-id=${id}]`).click(); await page.evaluate(() => { const key = "ironVeil.profile.v2"; const p = JSON.parse(localStorage.getItem(key)); p.activeResearch.endsAt = Date.now() - 1; localStorage.setItem(key, JSON.stringify(p)) }); await page.reload({ waitUntil: "networkidle" }); await page.waitForFunction(() => window.__GAME_READY__ === true); check((await profile()).research.includes(id), `Forschung abgeschlossen: ${id}`) }
  await action("trader"); const richBefore = await profile(); await page.locator('[data-action=sell-all][data-id=parts]').click(); const richAfter = await profile(); check(richAfter.stash.parts === 0 && richAfter.money - richBefore.money === 504, "Gesamtverkauf mit Forschungsbonus")
  await action("settings"); await page.locator('[data-setting=sensitivity]').evaluate(el => { el.value = "1.25"; el.dispatchEvent(new Event("input", { bubbles: true })) }); await action("invert")
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("ironVeil.settings.v1")).sensitivity === 1.25), "Empfindlichkeitsregler")
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("ironVeil.settings.v1")).invertY === true), "Y-Invertierung")
  await action("missions"); check(await page.locator(".mission-card.locked").count() === 0, "Alle Missionsfreischaltungen")
  await page.locator('[data-action=select-mission][data-id=harbor]').click(); await action("deploy"); await page.waitForTimeout(300); check((await snapshot()).enemiesAlive === 7, "Stahlhafen-Gegneranzahl"); check(await page.locator('[data-hud=armor]').textContent() === "80", "Verbundplatten-Forschungsbonus")
  await page.evaluate(() => window.__ironVeil.damage(40)); await page.keyboard.press("KeyQ"); await page.waitForFunction(() => window.__ironVeil.snapshot().health > 60, null, { timeout: 5000 }); check(await page.locator('[data-hud=medkits]').textContent() === "1", "Heilung und Medkit-Verbrauch")
  await page.keyboard.press("Escape"); await action("abort"); await action("menu"); await action("missions"); await page.locator('[data-action=select-mission][data-id=blacksite]').click(); await action("deploy"); await page.waitForTimeout(300); check((await snapshot()).enemiesAlive === 9, "Nachtgitter-Gegneranzahl")
  await page.keyboard.press("Escape"); await action("abort"); check((await snapshot()).screen === "result", "Abbrechen erzeugt Fehlschlag")
  check(errors.length === 0, `Keine Laufzeitfehler (${errors.length})`); console.log("EDGEVERIFY OK")
} finally { await browser.close(); server.close() }
