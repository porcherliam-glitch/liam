// verify-gamepad.mjs — simulated standard gamepad: menu navigation with D-pad/A/B, raid movement with the left stick,
// turning with the right stick, firing with RT, pause with Start and resume with B.
import { openGame, richProfile } from "./browser-lib.mjs"

const g = await openGame({ profile: richProfile() })
const { page, check } = g
const pad = (patch) => page.evaluate(p => { const s = window.__padState; if (p.axes) s.axes = p.axes; if (p.buttons) for (const [i, v] of Object.entries(p.buttons)) s.buttons[i] = v }, patch)
const tap = async (i) => { await pad({ buttons: { [i]: 1 } }); await page.waitForTimeout(250); await pad({ buttons: { [i]: 0 } }); await page.waitForTimeout(250) }
try {
  await page.evaluate(() => {
    window.__padState = { axes: [0, 0, 0, 0], buttons: Array(17).fill(0) }
    navigator.getGamepads = () => [{ id: "Test", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), axes: window.__padState.axes.slice(), buttons: window.__padState.buttons.map(v => ({ pressed: v > 0.5, touched: v > 0, value: v })) }]
  })
  // menu: first input focuses a button; A activates it
  await tap(13)
  check(await page.evaluate(() => document.activeElement?.tagName === "BUTTON"), "Steuerkreuz setzt den Fokus auf einen Knopf")
  await page.evaluate(() => document.querySelector(".hero [data-action=missions]").focus())
  await tap(0)
  check((await g.snapshot()).screen === "missions", "A öffnet den fokussierten Menüpunkt")
  await tap(1)
  check((await g.snapshot()).screen === "menu", "B geht zurück")
  // raid
  await page.evaluate(() => window.__ironVeil.start("greyzone")); await page.waitForTimeout(500)
  await page.evaluate(() => window.__ironVeil.godMode(true)); await g.frames(4)
  const s0 = await g.snapshot()
  await pad({ axes: [0, -1, 0, 0] }); await g.frames(3); await page.waitForTimeout(500); await pad({ axes: [0, 0, 0, 0] }); await page.waitForTimeout(150)
  const s1 = await g.snapshot()
  const forward = (s1.player.x - s0.player.x) * -Math.sin(s0.yaw) + (s1.player.z - s0.player.z) * -Math.cos(s0.yaw)
  check(forward > 0.3, `Linker Stick nach vorn bewegt vorwärts (${forward.toFixed(2)} m)`)
  await pad({ axes: [0, 0, 1, 0] }); await g.frames(3); await page.waitForTimeout(300); await pad({ axes: [0, 0, 0, 0] }); await page.waitForTimeout(100)
  const s2 = await g.snapshot()
  check(s2.yaw < s1.yaw - 0.1, "Rechter Stick nach rechts dreht nach rechts")
  const ammo = s2.ammo
  await pad({ buttons: { 7: 1 } }); await page.waitForTimeout(400); await pad({ buttons: { 7: 0 } }); await page.waitForTimeout(150)
  check((await g.snapshot()).ammo < ammo, "RT feuert")
  check((await g.snapshot()).hud.device === "pad", "Tastenhinweise wechseln auf Controller")
  await tap(9)
  check((await g.snapshot()).screen === "paused", "Start pausiert")
  await tap(1)
  check((await g.snapshot()).screen === "playing", "B setzt den Einsatz fort")
  check(g.errors.length === 0, `Keine Fehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("GAMEPADVERIFY OK")
} finally { await g.close() }
