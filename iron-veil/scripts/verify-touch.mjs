// verify-touch.mjs — the game on a phone in landscape (844 × 390, touch, no mouse): menus fit, the touch layer shows
// only while playing, the move stick walks forward, a drag on the right half turns the view, the fire button shoots,
// the pause button pauses (layer hidden) and the pause menu resumes by tap. Real touch events via the DevTools protocol.
import { openGame, richProfile } from "./browser-lib.mjs"

const g = await openGame({ profile: richProfile(), viewport: { width: 844, height: 390 }, mobile: true })
const { page, check } = g
const cdp = await page.context().newCDPSession(page)
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) })
const layerShown = () => page.evaluate(() => { const l = document.querySelector(".touch-layer"); return !!l && !l.hidden })
try {
  check(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches), "Handy erkannt (kein Hover, Finger-Zeiger)")
  check(!(await layerShown()), "Touch-Knöpfe im Menü ausgeblendet")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow <= 1, `Hauptmenü ohne seitliches Scrollen (${overflow} px)`)
  await g.shot("touch-menu.png")
  // raid
  await page.evaluate(() => window.__ironVeil.deploy({ time: "day" }))
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 90000)
  await page.evaluate(() => window.__ironVeil.godMode(true)); await g.frames(3)
  check(await layerShown(), "Touch-Knöpfe im Einsatz sichtbar")
  check(await page.evaluate(() => document.querySelector(".hud")?.classList.contains("touch")), "Anzeige im Touch-Modus angeordnet")
  await g.shot("touch-raid.png")
  // move stick: thumb down on the left, pushed up = forward
  const s0 = await g.snapshot()
  await touch("touchStart", [[160, 260]]); await touch("touchMove", [[160, 230]]); await touch("touchMove", [[160, 200]])
  await g.frames(3); await page.waitForTimeout(600)
  await touch("touchEnd", []); await page.waitForTimeout(150)
  const s1 = await g.snapshot()
  const forward = (s1.player.x - s0.player.x) * -Math.sin(s0.yaw) + (s1.player.z - s0.player.z) * -Math.cos(s0.yaw)
  check(forward > 0.3, `Stick nach oben läuft vorwärts (${forward.toFixed(2)} m)`)
  // look: drag to the right on the right half turns right
  await touch("touchStart", [[560, 170]]); for (const x of [580, 600, 620, 640]) await touch("touchMove", [[x, 170]])
  await g.frames(3); await touch("touchEnd", []); await page.waitForTimeout(100)
  const s2 = await g.snapshot()
  check(s2.yaw < s1.yaw - 0.05, `Wischen nach rechts dreht nach rechts (${(s1.yaw - s2.yaw).toFixed(2)} rad)`)
  // fire button
  const fire = await page.evaluate(() => { const r = document.querySelector(".t-fire").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
  const rounds = () => page.evaluate(() => { const w = window.__ironVeil.weapon(); return w.mag + w.reserve })
  const before = await rounds()
  await touch("touchStart", [fire]); await g.frames(3)
  await g.until(a => { const w = window.__ironVeil.weapon(); return w.mag + w.reserve < a }, before, 90000).catch(() => {})
  await touch("touchEnd", []); await g.frames(2)
  check(await rounds() < before, "Feuerknopf schießt")
  // pause button → pause menu (layer hidden) → resume by tap
  const pause = await page.evaluate(() => { const r = document.querySelector('.t-btn[data-code="Escape"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
  await touch("touchStart", [pause]); await g.frames(2); await touch("touchEnd", []); await g.frames(3)
  await g.until(() => window.__ironVeil.screen() === "paused", null, 60000)
  check(!(await layerShown()), "Pause-Knopf pausiert, Touch-Knöpfe weg")
  await g.shot("touch-pause.png")
  const resume = await page.evaluate(() => { const r = document.querySelector('[data-action="resume"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
  await page.touchscreen.tap(resume[0], resume[1]); await g.frames(3)
  await g.until(() => window.__ironVeil.screen() === "playing", null, 60000)
  check(await layerShown(), "Fortsetzen per Tippen, Touch-Knöpfe wieder da")
  check(g.errors.length === 0, `Keine Konsolenfehler (${g.errors.length})${g.errors.length ? ": " + g.errors.slice(0, 2).join(" | ") : ""}`)
  console.log("TOUCH OK")
} finally { await g.close() }
