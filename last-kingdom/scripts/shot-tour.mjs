// Standardised screenshot tour for before/after comparisons: every area at the same hour and weather,
// plus night, rain, the enemy line-up, the camp and the main menu. Usage: node scripts/shot-tour.mjs <folder> [quality]
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { openGame, SHOTS } from "./browser-lib.mjs"

const folder = process.argv[2] ?? "tour"
const quality = process.argv[3] ?? "high"
mkdirSync(join(SHOTS, folder), { recursive: true })
const g = await openGame({ viewport: { width: 1280, height: 720 }, settings: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, quality, shadows: true, showFps: false, cameraShake: false } })
const page = g.page
const shot = (name) => g.shot(`${folder}/${name}.png`)
const stats = []
try {
  await g.frames(4)
  await shot("00-main-menu")
  await g.click("characters"); await g.click("new"); await page.fill("#char-name", "Tour"); await g.click("class", '[data-id="knight"]'); await g.click("create")
  await g.frames(6)
  await shot("01-camp")
  await page.evaluate(() => { window.__lastKingdom.profile().unlockedAreas = ["village", "forest", "castle", "graveyard", "monastery", "catacombs", "city", "fortress"] })
  const views = [
    { area: "village", hour: 10, weather: "clear", name: "10-village-day" },
    { area: "village", hour: 22.5, weather: "clear", name: "11-village-night" },
    { area: "forest", hour: 9, weather: "rain", name: "12-forest-rain" },
    { area: "forest", hour: 15, weather: "fog", name: "13-forest-fog" },
    { area: "castle", hour: 17.5, weather: "clear", name: "14-castle-evening" },
    { area: "graveyard", hour: 21, weather: "cloudy", name: "15-graveyard-dusk" },
    { area: "monastery", hour: 11, weather: "clear", name: "16-monastery-day" },
    { area: "catacombs", hour: 12, weather: "clear", name: "17-catacombs" },
    { area: "city", hour: 13, weather: "storm", name: "18-city-storm" },
    { area: "fortress", hour: 7, weather: "clear", name: "19-fortress-dawn" },
  ]
  for (const v of views) {
    await page.evaluate((a) => window.__lastKingdom.game.startExpedition(a), v.area)
    await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
    await page.evaluate(({ hour, weather }) => {
      const h = window.__lastKingdom
      const e = h.game.expedition
      h.setMaxFrame(0.5); h.setHour(hour); h.setWeather(weather); h.killAll()
      // look from the spawn toward the map centre, slightly from above
      const p = e.player.pos
      const yaw = Math.atan2(-p.x, -p.z)
      e.player.yaw = yaw
      e.camera.yaw = yaw + Math.PI
      e.camera.pitch = 0.18
      e.camera.targetDistance = e.camera.distance = 5.5
    }, v)
    await g.frames(8)
    await shot(v.name)
    const s = await g.snapshot()
    stats.push({ view: v.name, drawCalls: s.expedition.drawCalls, triangles: s.expedition.triangles })
    if (v.area === "village" && v.hour === 10) {
      // enemy line-up and a combat moment in the same world
      await page.evaluate(() => { window.__lastKingdom.lineup() })
      await g.frames(6)
      await shot("20-lineup")
      await page.evaluate(() => { const h = window.__lastKingdom; h.killAll(); for (let i = 0; i < 4; i++) h.spawnZombie(i % 2 ? "walker" : "sprinter", 3 + i, (i - 2) * 1.5); h.godMode(true) })
      await g.frames(10)
      await page.mouse.down(); await g.frames(3); await page.mouse.up(); await g.frames(2)
      await shot("21-combat")
      await page.evaluate(() => { const h = window.__lastKingdom; h.killAll(); h.equipItem("torch_item"); h.setHour(23); h.setWeather("clear") })
      await g.frames(8)
      await shot("22-torch-night")
    }
    await page.evaluate(() => window.__lastKingdom.game.goToCamp())
    await g.frames(3)
  }
  console.log(JSON.stringify(stats))
  const errs = g.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) console.log("Konsolenfehler:", errs.slice(0, 5).join("\n"))
} finally {
  await g.close()
}
