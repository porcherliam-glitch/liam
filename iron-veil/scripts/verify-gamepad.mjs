// verify-gamepad.mjs — simulated standard gamepad: menu navigation with D-pad/A/B (focus stays on the same button
// after a click re-renders the screen), raid movement with the left stick, turning with the right stick, firing with
// RT, the backpack with Back, pause with Start and resume with B.
import { openGame, richProfile } from "./browser-lib.mjs"

const g = await openGame({ profile: richProfile() })
const { page, check } = g
const pad = (patch) => page.evaluate(p => { const s = window.__padState; if (p.axes) s.axes = p.axes; if (p.buttons) for (const [i, v] of Object.entries(p.buttons)) s.buttons[i] = v }, patch)
// buttons are polled once per frame, so a press must last a few rendered frames
const tap = async (i) => { await pad({ buttons: { [i]: 1 } }); await g.frames(3); await page.waitForTimeout(100); await pad({ buttons: { [i]: 0 } }); await g.frames(3); await page.waitForTimeout(100) }
const screen = () => page.evaluate(() => window.__ironVeil.screen())
try {
  await page.evaluate(() => {
    window.__padState = { axes: [0, 0, 0, 0], buttons: Array(17).fill(0) }
    navigator.getGamepads = () => [{ id: "Test", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), axes: window.__padState.axes.slice(), buttons: window.__padState.buttons.map(v => ({ pressed: v > 0.5, touched: v > 0, value: v })) }]
  })
  // menu: first input focuses a button; A activates it
  await tap(13)
  check(await page.evaluate(() => document.activeElement?.tagName === "BUTTON"), "Steuerkreuz setzt den Fokus auf einen Knopf")
  await page.evaluate(() => document.querySelector(".hero [data-action=radio]").focus())
  await tap(0)
  check(await screen() === "radio", "A öffnet den fokussierten Menüpunkt")
  // trader: buying re-renders the screen; the focus must stay on the same buy button
  await tap(1)
  await page.evaluate(() => document.querySelector(".menu-layout [data-action=trader]").focus())
  await tap(0)
  check(await screen() === "trader", "Händler mit A geöffnet")
  await page.evaluate(() => document.querySelector('button[data-action="buy"][data-id="bandage"]').focus())
  const before = (await g.profile()).stash.bandage ?? 0
  await tap(0); await tap(0)
  check(((await g.profile()).stash.bandage ?? 0) === before + 2, "Zweimal A kauft zweimal (Fokus bleibt nach dem Neuzeichnen)")
  check(await page.evaluate(() => document.activeElement?.dataset.action === "buy" && document.activeElement?.dataset.id === "bandage"), "Fokus liegt wieder auf demselben Knopf")
  await tap(1)
  check(await screen() === "menu", "B geht zurück")
  // raid
  await page.evaluate(() => window.__ironVeil.deploy({ time: "day" }))
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
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
  // hold the trigger until a shot leaves (slow software rendering: wait on game state, not on wall-clock time)
  await pad({ buttons: { 7: 1 } }); await g.frames(3)
  await g.until(a => window.__ironVeil.snapshot().ammo < a, ammo, 90000).catch(() => {})
  await pad({ buttons: { 7: 0 } }); await g.frames(2)
  check((await g.snapshot()).ammo < ammo, "RT feuert")
  const hud = (await g.snapshot()).hud
  check(hud.device === "pad", `Tastenhinweise wechseln auf Controller (${hud.device})`)
  await tap(8)
  check(await screen() === "raidInventory", "Back öffnet den Rucksack")
  await tap(1)
  check(await screen() === "playing", "B schließt den Rucksack")
  await tap(9)
  check(await screen() === "paused", "Start pausiert")
  await tap(1)
  check(await screen() === "playing", "B setzt den Einsatz fort")
  check(g.errors.length === 0, `Keine Fehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("GAMEPADVERIFY OK")
} finally { await g.close() }
