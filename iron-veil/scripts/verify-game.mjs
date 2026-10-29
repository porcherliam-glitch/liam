// verify-game.mjs — smoke test: the build renders (canvas not black), Space starts a raid, W/D move the player in
// the right directions relative to the view, Escape pauses, and no console errors occur. Screenshots go to
// verification-shots/. Usage: npm run build && npm run verify
import { openGame } from "./browser-lib.mjs"

const g = await openGame()
const { page, check } = g
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
  await page.keyboard.press("Space"); await page.waitForTimeout(600)
  check((await g.snapshot()).screen === "playing", "Leertaste startet einen Einsatz")
  await page.evaluate(() => window.__ironVeil.godMode(true)); await g.frames(4)
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
  await g.shot("02-gameplay.png")
  await page.keyboard.press("Escape"); await page.waitForTimeout(300)
  check((await g.snapshot()).screen === "paused", "Escape pausiert")
  await g.shot("03-paused.png")
  check(g.errors.length === 0, `Keine Konsolenfehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("VERIFY OK")
} finally { await g.close() }
