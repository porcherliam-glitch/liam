import { chromium } from "playwright"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync, mkdirSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const DIST = join(ROOT, "dist")
const SHOTS = join(ROOT, "verification-shots"); mkdirSync(SHOTS, { recursive: true })
if (!existsSync(join(DIST, "index.html"))) throw new Error("Build fehlt")
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" }
const server = createServer(async (req, res) => { try { const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0]; const file = resolve(DIST, "." + decodeURIComponent(raw)); if (file !== DIST && !file.startsWith(DIST + sep)) return res.writeHead(403).end(); const data = await readFile(file); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(data) } catch { res.writeHead(404).end() } })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--use-gl=swiftshader"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.addInitScript(() => { if (!localStorage.getItem("ironVeil.settings.v1")) localStorage.setItem("ironVeil.settings.v1", JSON.stringify({ sensitivity: 0.75, volume: 0.55, muted: true, quality: "low", invertY: false })) })
const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
const check = (condition, message) => { if (!condition) throw new Error(`SYSTEMTEST: ${message}`); console.log(`PASS ${message}`) }
const snapshot = () => page.evaluate(() => window.__ironVeil.snapshot())
const profile = () => page.evaluate(() => window.__ironVeil.profile())
const action = async name => { await page.locator(`button[data-action="${name}"]`).first().click(); await page.waitForTimeout(120) }
try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" }); await page.waitForFunction(() => window.__GAME_READY__ === true)
  check((await snapshot()).screen === "menu", "Hauptmenü erreicht")
  await page.locator(".hero [data-action=missions]").click(); await page.waitForTimeout(100)
  check(await page.locator(".mission-card").count() === 3, "Drei Missionen wählbar")
  check(await page.locator(".mission-card.locked").count() === 2, "Missionsfreischaltungen aktiv")
  await action("trader"); const beforeBuy = await profile(); await page.locator('[data-action=buy][data-id=ammo]').click(); const afterBuy = await profile()
  check(afterBuy.stash.ammo === beforeBuy.stash.ammo + 1 && afterBuy.money === beforeBuy.money - 60, "Händlerkauf verändert Geld und Lager")
  await action("inventory"); await page.locator('[data-action=equip][data-id=armor]').click(); check((await profile()).loadout.armor === 55, "Schutzweste ausgerüstet")
  await action("missions"); await action("deploy"); await page.waitForTimeout(600)
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__ironVeil.aim()); await page.waitForTimeout(120); await page.mouse.click(640, 360); await page.waitForTimeout(180) }
  check((await snapshot()).enemiesAlive === 4, "Waffentreffer neutralisieren Gegner")
  await page.keyboard.press("KeyR"); await page.waitForFunction(() => document.querySelector('[data-hud=ammo]')?.textContent === "30", null, { timeout: 7000 })
  check(await page.locator('[data-hud=ammo]').textContent() === "30", "Nachladen füllt Magazin aus Reserve")
  await page.screenshot({ path: join(SHOTS, "04-combat.png") })
  await page.evaluate(() => window.__ironVeil.teleport(-8, 28)); await page.keyboard.press("KeyE"); await page.waitForTimeout(150)
  check((await snapshot()).lootCollected === 1, "Erste Kiste per Interaktion geborgen")
  await page.evaluate(() => window.__ironVeil.teleport(11, 12)); await page.keyboard.press("KeyE"); await page.waitForTimeout(150)
  check((await snapshot()).extractionReady, "Missionsziel öffnet Extraktion")
  await page.evaluate(() => window.__ironVeil.teleport(40, -42)); await page.keyboard.down("KeyE"); await page.waitForFunction(() => window.__ironVeil.snapshot().screen === "result", null, { timeout: 10000 }); await page.keyboard.up("KeyE"); await page.waitForTimeout(300)
  check((await snapshot()).screen === "result", "Extraktion erreicht Ergebnisbildschirm")
  check((await profile()).stats.extracts === 1, "Erfolgreiche Extraktion im Profil verbucht")
  check((await profile()).stash.parts > 0 && (await profile()).stash.medical > 0, "Beute ins permanente Lager übertragen")
  await page.screenshot({ path: join(SHOTS, "05-victory.png") })
  await action("menu"); await action("trader"); await page.locator('[data-action=sell][data-id=medical]').click(); await page.locator('[data-action=sell][data-id=parts]').click(); await action("base")
  await page.locator('[data-action=build][data-id=workshop]').click(); await page.locator('[data-action=staff][data-id=workshop][data-delta="1"]').click()
  await page.locator('[data-action=build][data-id=lab]').click(); await page.locator('[data-action=staff][data-id=lab][data-delta="1"]').click()
  check((await profile()).staff.workshop === 1 && (await profile()).staff.lab === 1, "Basisbau und Personalzuweisung wirken")
  await page.locator('[data-action=research][data-id=ballistics]').click(); check((await profile()).activeResearch?.id === "ballistics", "Forschung gestartet")
  await page.screenshot({ path: join(SHOTS, "06-base.png") })
  await page.evaluate(() => { const key = "ironVeil.profile.v2"; const p = JSON.parse(localStorage.getItem(key)); p.lastTick = Date.now() - 50000; p.activeResearch.endsAt = Date.now() - 1; localStorage.setItem(key, JSON.stringify(p)) })
  await page.reload({ waitUntil: "networkidle" }); await page.waitForFunction(() => window.__GAME_READY__ === true)
  const progressed = await profile(); check(progressed.research.includes("ballistics") && !progressed.activeResearch, "Forschungsabschluss nach Laden verarbeitet")
  check(progressed.stash.ammo >= 8, "Offline-Produktion und Munitionsrückgabe gespeichert")
  await action("trader"); const sellBefore = await profile(); await page.locator('[data-action=sell][data-id=parts]').click(); const sellAfter = await profile(); check(sellAfter.money === sellBefore.money + 140, "Beuteverkauf erlöst korrekten Betrag")
  await page.evaluate(() => window.__ironVeil.start("greyzone")); await page.waitForTimeout(250); await page.evaluate(() => window.__ironVeil.damage(200)); await page.waitForTimeout(350)
  check((await snapshot()).screen === "result" && (await profile()).stats.deaths === 1, "Tod löst Fehlschlag und Statistik aus")
  check((await profile()).loadout.armor === 0, "Fehlschlag vernichtet mitgeführte Rüstung")
  await page.screenshot({ path: join(SHOTS, "07-gameover.png") })
  await action("menu"); await action("settings"); await action("quality"); await action("mute")
  check(await page.locator('[data-action=quality]').textContent() === "HOCH", "Qualitätseinstellung schaltbar")
  await page.reload({ waitUntil: "networkidle" }); await page.waitForFunction(() => window.__GAME_READY__ === true); await action("settings")
  check(await page.locator('[data-action=quality]').textContent() === "HOCH", "Einstellungen überstehen Neuladen")
  check(errors.length === 0, `Keine Konsolen- oder Laufzeitfehler (${errors.length})`)
  console.log("SYSTEMVERIFY OK")
} finally { await browser.close(); server.close() }
