// Dev tool: screenshot of every enemy model in a line-up (verification-shots/lineup.png).
import { openGame } from "./browser-lib.mjs"
const g = await openGame({ viewport: { width: 1600, height: 900 }, settings: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, quality: "high", shadows: true, showFps: false, cameraShake: false } })
const page = g.page
try {
  await g.click("characters"); await g.click("new"); await g.click("create")
  await page.evaluate(() => window.__lastKingdom.game.startExpedition("village"))
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate(() => { window.__lastKingdom.setMaxFrame(0.5); window.__lastKingdom.setHour(11); window.__lastKingdom.setWeather("clear"); window.__lastKingdom.killAll(); window.__lastKingdom.godMode(true); window.__lastKingdom.lineup() })
  await g.frames(6)
  await g.shot("lineup.png")
  // Player close-up: look at the player from the front
  await page.evaluate(() => { const e = window.__lastKingdom.game.expedition; e.camera.yaw = 0; e.camera.targetDistance = e.camera.distance = 3; e.camera.pitch = 0.1 })
  await g.frames(4)
  await g.shot("lineup-player.png")
} finally { await g.close() }
