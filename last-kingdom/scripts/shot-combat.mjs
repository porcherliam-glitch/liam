// Dev tool: action screenshots (swing trail, telegraph rings, enemy bars, hit flash, night torch).
import { openGame } from "./browser-lib.mjs"
const g = await openGame({ viewport: { width: 1600, height: 900 }, settings: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, quality: "high", shadows: true, showFps: false, cameraShake: false } })
const page = g.page
const sim = async (seconds) => {
  const t0 = await page.evaluate(() => window.__lastKingdom.game.expedition?.elapsed ?? 0)
  await page.waitForFunction((t) => !window.__lastKingdom.game.expedition || window.__lastKingdom.game.expedition.elapsed >= t, t0 + seconds, { timeout: 120000 })
}
try {
  await g.click("characters"); await g.click("new"); await g.click("create")
  await page.evaluate(() => window.__lastKingdom.game.startExpedition("village"))
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate(() => { window.__lastKingdom.setMaxFrame(0.1); window.__lastKingdom.setHour(16); window.__lastKingdom.setWeather("clear"); window.__lastKingdom.killAll(); window.__lastKingdom.godMode(true) })
  await g.frames(3)
  await page.evaluate(() => { window.__lastKingdom.spawnZombie("walker", 2.2, 0.6); window.__lastKingdom.spawnZombie("walker_villager", 3.5, -1.5); window.__lastKingdom.spawnZombie("brute", 4.5, 1.5) })
  await page.mouse.click(800, 450)
  await g.frames(2)
  await page.keyboard.press("KeyT")
  // swing and capture mid-swing
  await page.mouse.down(); await g.frames(1); await page.mouse.up()
  await g.frames(2)
  await g.shot("c01-swing.png")
  await sim(2)
  await g.shot("c02-fight.png")
  await sim(2)
  await g.shot("c03-fight2.png")
  // night torch
  await page.evaluate(() => { window.__lastKingdom.equipItem("torch_item"); window.__lastKingdom.setHour(23) })
  await sim(2)
  await g.shot("c04-torch.png")
} finally { await g.close() }
