// Controller check: a fake gamepad drives every menu, creates a character, plays and fights.
import { openGame } from "./browser-lib.mjs"

const padScript = () => {
  const pad = {
    id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: { playEffect: () => Promise.resolve("complete") },
  }
  window.__pad = pad
  window.__padEnabled = false
  navigator.getGamepads = () => (window.__padEnabled ? [pad, null, null, null] : [null, null, null, null])
  window.__press = (i) => {
    pad.buttons[i].pressed = true
    pad.buttons[i].value = 1
  }
  window.__release = (i) => {
    pad.buttons[i].pressed = false
    pad.buttons[i].value = 0
  }
  window.__axes = (a) => {
    pad.axes = a
  }
}

const g = await openGame({ initScript: padScript })
const page = g.page
const frames = (n) => g.frames(n)
const tap = async (i) => {
  await page.evaluate((i) => window.__press(i), i)
  await frames(2)
  await page.evaluate((i) => window.__release(i), i)
  await frames(2)
}
try {
  await page.evaluate(() => {
    window.__padEnabled = true
    window.dispatchEvent(new Event("gamepadconnected"))
  })
  await tap(0) // any press makes the pad the active device
  await frames(2)
  let s = await g.snapshot()
  g.check(s.device === "xbox", `Xbox-Controller erkannt (${s.device})`)
  const glyphs = await page.evaluate(() => document.querySelector(".hintbar")?.textContent)
  g.check(glyphs && glyphs.includes("A"), `Hinweisleiste zeigt Controller-Tasten: ${glyphs?.trim()}`)
  await g.shot("g01-main-pad.png")
  // Main menu: first entry "Charaktere" → A
  await tap(0)
  s = await g.snapshot()
  g.check(s.screen === "characters", "Charakterauswahl per A geöffnet")
  // "Neuer Charakter" is the first focusable → A
  await tap(0)
  s = await g.snapshot()
  await g.shot("g02-create-pad.png")
  // Navigate: name field focused; dpad down to "Name würfeln"? Layout: name input, roll button, class cards, create.
  // Press down until the create button is focused (max 8 steps)
  for (let i = 0; i < 8; i++) {
    const f = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
    if (f === "create") break
    if (f === "cancel") await tap(14) // dpad left: "Ins Lager" sits left of "Abbrechen"
    else await tap(13) // dpad down
  }
  let focused = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
  g.check(focused === "create", `Mit Steuerkreuz zum Erstellen-Knopf navigiert (${focused})`)
  await tap(0)
  s = await g.snapshot()
  g.check(s.state === "camp", "Charakter per Controller erstellt")
  // Camp: navigate down to "Fähigkeiten" and open it, then B back
  for (let i = 0; i < 4; i++) await tap(13)
  focused = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
  console.log("  Fokus im Lager:", focused)
  await tap(0)
  s = await g.snapshot()
  g.check(s.screen !== "camp", `Lager-Unterbildschirm per A geöffnet (${s.screen})`)
  await tap(1) // B = back
  s = await g.snapshot()
  g.check(s.screen === "camp", "B schließt den Bildschirm")
  // Right into the buildings panel, open the smithy
  await tap(15)
  focused = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
  g.check(focused === "building", `Steuerkreuz rechts erreicht die Gebäude (${focused})`)
  await tap(0)
  s = await g.snapshot()
  g.check(s.screen === "building", "Gebäude-Bildschirm geöffnet")
  await g.shot("g03-building-pad.png")
  await tap(1)
  // Start expedition: focus "Expedition planen" (first button) → up presses then A
  for (let i = 0; i < 14; i++) {
    focused = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
    if (focused === "map") break
    if (focused === "building") await tap(14)
    else await tap(12)
  }
  focused = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
  g.check(focused === "map", `Expedition planen fokussiert (${focused})`)
  await tap(0)
  s = await g.snapshot()
  g.check(s.screen === "map", "Kartenübersicht offen")
  // Right to the detail panel, find "start"
  for (let i = 0; i < 12; i++) {
    const f = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
    if (f === "start") break
    if (f === "select") await tap(15) // into the detail panel
    else if (f === "back") await tap(12) // "Expedition starten" sits above "Zurück"
    else await tap(13)
  }
  focused = await page.evaluate(() => document.querySelector(".screen:not(.hidden) .focused")?.getAttribute("data-action"))
  g.check(focused === "start", `Expedition starten fokussiert (${focused})`)
  await tap(0)
  await tap(0) // confirm "go"
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 120000 })
  await page.evaluate(() => window.__lastKingdom.setMaxFrame(0.5))
  await frames(4)
  s = await g.snapshot()
  g.check(s.state === "expedition", "Expedition per Controller gestartet")
  const p0 = s.expedition.player
  // Left stick forward for a while
  await page.evaluate(() => window.__axes([0, -1, 0, 0]))
  await frames(12)
  await page.evaluate(() => window.__axes([0, 0, 0, 0]))
  await frames(2)
  s = await g.snapshot()
  const moved = Math.hypot(s.expedition.player.x - p0.x, s.expedition.player.z - p0.z)
  g.check(moved > 1.5, `Linker Stick bewegt den Spieler (${moved.toFixed(1)} m)`)
  // Right stick turns the camera
  const yaw0 = await page.evaluate(() => window.__lastKingdom.game.expedition.camera.yaw)
  await page.evaluate(() => window.__axes([0, 0, 1, 0]))
  await frames(6)
  await page.evaluate(() => window.__axes([0, 0, 0, 0]))
  const yaw1 = await page.evaluate(() => window.__lastKingdom.game.expedition.camera.yaw)
  g.check(Math.abs(yaw1 - yaw0) > 0.1, `Rechter Stick dreht die Kamera (${(yaw1 - yaw0).toFixed(2)})`)
  // A = jump, RT = attack, LT = block, X = interact, Y = inventory, Start = pause
  await tap(0)
  await frames(2)
  s = await g.snapshot()
  console.log("  Spielerzustand nach A:", s.expedition.player.state, "y", s.expedition.player.y.toFixed(2))
  await page.evaluate(() => window.__lastKingdom.spawnZombie("walker", 1.8, 0))
  await tap(11) // R3 lock on
  let kills = 0
  for (let i = 0; i < 16; i++) {
    await tap(7) // RT
    await frames(3)
    s = await g.snapshot()
    kills = s.expedition.kills
    if (kills >= 1) break
  }
  g.check(kills >= 1, `RT greift an und tötet (${kills})`)
  await page.evaluate(() => window.__press(6))
  await frames(3)
  s = await g.snapshot()
  const blocking = await page.evaluate(() => window.__lastKingdom.game.expedition.player.blocking)
  await page.evaluate(() => window.__release(6))
  g.check(blocking === true, "LT blockt")
  await tap(3) // Y inventory
  s = await g.snapshot()
  g.check(s.screen === "inventory", "Y öffnet das Inventar")
  await g.shot("g04-inventory-pad.png")
  await tap(1)
  s = await g.snapshot()
  g.check(s.screen === null, "B schließt das Inventar")
  await tap(9) // Start
  s = await g.snapshot()
  g.check(s.screen === "pause", "Start öffnet die Pause")
  await tap(1)
  // Hot-plug: disconnect → keyboard glyphs; reconnect as PlayStation → PS glyphs
  await page.evaluate(() => {
    window.__padEnabled = false
    window.dispatchEvent(new Event("gamepaddisconnected"))
  })
  await frames(3)
  await page.keyboard.press("KeyM")
  await frames(2)
  s = await g.snapshot()
  g.check(s.device === "keyboard", "Nach dem Abstecken: Tastatur aktiv")
  await page.keyboard.press("Escape")
  await frames(2)
  await page.evaluate(() => {
    window.__pad.id = "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
    window.__padEnabled = true
    window.dispatchEvent(new Event("gamepadconnected"))
  })
  await tap(9)
  s = await g.snapshot()
  g.check(s.device === "playstation", `PlayStation-Controller nach Hot-Plug erkannt (${s.device})`)
  const psGlyphs = await page.evaluate(() => document.querySelector(".hintbar")?.textContent)
  g.check(psGlyphs && (psGlyphs.includes("✕") || psGlyphs.includes("○")), `PlayStation-Symbole in der Hinweisleiste: ${psGlyphs?.trim()}`)
  await g.shot("g05-pause-ps.png")
  const errs = g.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) console.log("  Konsolenfehler:", errs.join("\n"))
  g.check(errs.length === 0, `Keine Konsolenfehler (${errs.length})`)
  console.log("verify-gamepad: alles bestanden")
} catch (e) {
  console.error(e)
  await g.shot("g-error.png").catch(() => undefined)
  process.exitCode = 1
} finally {
  await g.close()
}
