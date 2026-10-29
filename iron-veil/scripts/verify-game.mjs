// verify-game.mjs — smoke test of the main loop: the build renders, the main menu and intro show, the walkable base
// works (WASD relative to the view, E at a station opens it, Escape returns to the base), a raid starts from the radio
// screen with the packed kit, Escape pauses, and no console errors occur. Screenshots go to verification-shots/.
// Usage: npm run build && npm run verify
import { openGame } from "./browser-lib.mjs"

const g = await openGame()
const { page, check } = g
const mode = async () => (await g.snapshot()).mode
try {
  const lit = await page.evaluate(() => {
    const el = document.getElementById("game-canvas"); const gl = el.getContext("webgl2") || el.getContext("webgl")
    const px = new Uint8Array(4); let n = 0
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) { gl.readPixels((gl.drawingBufferWidth * fx) | 0, (gl.drawingBufferHeight * fy) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (px[0] + px[1] + px[2] > 8) n++ }
    return n
  })
  check(lit >= 2, `3D-Bild wird gezeichnet (${lit}/5 Messpunkte farbig)`)
  check((await g.snapshot()).screen === "menu", "Hauptmenü sichtbar")
  check(await page.locator(".intro-card").count() === 1, "Kurzeinweisung beim ersten Start")
  await g.shot("01-title.png")
  await g.action("intro-close")

  // the walkable base
  await g.action("enter-base"); await g.frames(3)
  check(await mode() === "base" && (await g.snapshot()).screen === "playing", "Basis betreten")
  const move = async key => {
    const before = await g.snapshot()
    await page.keyboard.down(key); await g.frames(3); await page.waitForTimeout(500); await page.keyboard.up(key); await page.waitForTimeout(150)
    const after = await g.snapshot()
    const dx = after.player.x - before.player.x, dz = after.player.z - before.player.z, yaw = before.yaw
    return { forward: dx * -Math.sin(yaw) + dz * -Math.cos(yaw), right: dx * Math.cos(yaw) + dz * -Math.sin(yaw) }
  }
  const w = await move("KeyW"); check(w.forward > 0.3 && Math.abs(w.right) < w.forward * 0.3, `W bewegt nach vorn (${w.forward.toFixed(2)} m)`)
  const d = await move("KeyD"); check(d.right > 0.3 && Math.abs(d.forward) < d.right * 0.3, `D bewegt nach rechts (${d.right.toFixed(2)} m)`)
  const s = await move("KeyS"); check(s.forward < -0.3, "S bewegt zurück")
  const a = await move("KeyA"); check(a.right < -0.3, "A bewegt nach links")
  await g.shot("02-base.png")
  // walk up to the trader station and press E
  const station = await page.evaluate(() => window.__ironVeil.stations().find(s => s.id === "trader"))
  await page.evaluate(st => { window.__ironVeil.teleport(st.x, st.z + 1.4); window.__ironVeil.lookAt(st.x, st.z, 1) }, station)
  await g.until(() => window.__ironVeil.snapshot().hud?.interaction?.includes("Händler"))
  await page.keyboard.press("KeyE")
  await g.until(() => window.__ironVeil.screen() === "trader")
  check(true, "E an der Station öffnet den Händler")
  await g.shot("03-trader.png")
  await page.keyboard.press("Escape")
  await g.until(() => window.__ironVeil.screen() === "playing")
  check(await mode() === "base", "Escape führt zurück in die Basis")

  // raid from the radio screen
  await page.evaluate(() => window.__ironVeil.toMenu()); await g.frames(2)
  await g.action("radio")
  check((await g.snapshot()).screen === "radio", "Funk: Einsatzplanung")
  await g.action("plan-time", "night")
  await g.action("deploy")
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
  const raid = await g.snapshot()
  check(raid.ammo > 0 && raid.reserve > 0, `Waffe geladen, Ersatzmunition im Rucksack (${raid.ammo}/${raid.reserve})`)
  check(raid.hud?.clock === "02:20", "Tageszeit Nacht gewählt")
  check(raid.enemiesAlive > 0, `Söldner in der Zone (${raid.enemiesAlive})`)
  await page.evaluate(() => window.__ironVeil.godMode(true))
  await g.frames(5); await g.shot("04-raid.png")
  await page.keyboard.press("Escape"); await page.waitForTimeout(300)
  check((await g.snapshot()).screen === "paused", "Escape pausiert")
  await g.shot("05-paused.png")
  check(g.errors.length === 0, `Keine Konsolenfehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("VERIFY OK")
} finally { await g.close() }
