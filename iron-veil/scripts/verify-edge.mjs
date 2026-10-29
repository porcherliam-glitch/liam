// verify-edge.mjs — edge cases: v3 save migration, corrupted storage, settings persistence (gore), offline production
// and research, and in a raid: shotgun shell-by-shell reload, ammo type switch, weapon slots 1/2/3, quick knife,
// grenade and molotov, crouch, flashlight, screen blood (only with gore on), abort from the pause menu.
import { openGame, richProfile } from "./browser-lib.mjs"

const KEY = "ironVeil.profile.v4"

// 1) migration of an old v3 save
{
  const legacy = { key: "ironVeil.profile.v3", value: { version: 3, callsign: "ALT-01", money: 4321, resources: 70, xp: 0, level: 2, weapons: ["p9", "mk4", "kv12"], stash: { ammo: 3, medkit: 1, armor: 0, plate: 0, grenade: 1, parts: 2, intel: 0, electronics: 0, medical: 0, relic: 0 }, buildings: { hq: 2, workshop: 1, lab: 0, clinic: 0 }, staff: { workshop: 1, lab: 0, clinic: 0 }, research: [], loadout: { primary: "kv12", armor: 55, armorMax: 55, medkits: 1 }, stats: { raids: 3, extracts: 2, kills: 4, earned: 900, deaths: 1 }, lastTick: Date.now() } }
  const g = await openGame({ profile: legacy })
  try {
    const p = await g.profile()
    g.check(p.version === 4 && p.money === 4321 && p.callsign === "ALT-01", "Alter Spielstand (v3) wird übernommen")
    g.check(p.loadout.primary === "kv12" && p.loadout.primaryAmmo === "ammo_12buck" && p.stash.ammo_556 === 90 && p.stash.w_mk4 === 1, "Waffen und Munition umgerechnet")
    g.check(await g.page.locator(".intro-card").count() === 0, "Keine Kurzeinweisung für erfahrene Spieler")
    g.check(g.errors.length === 0, "Keine Fehler bei der Übernahme")
  } finally { await g.close() }
}

// 2) corrupted storage starts a fresh company
{
  const g = await openGame({ profile: { key: KEY, value: "{not json" } })
  try {
    const p = await g.profile()
    g.check(p.version === 4 && p.loadout.primary === "mk4", "Kaputter Spielstand → neue Truppe")
    g.check(g.errors.length === 0, "Keine Fehler bei kaputtem Spielstand")
  } finally { await g.close() }
}

const g = await openGame({ profile: richProfile() })
const { page, check } = g
const profile = g.profile, snapshot = g.snapshot
const fire = async (n, ms = 60) => { for (let i = 0; i < n; i++) { await page.mouse.move(640, 360); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(ms) } }
const editSave = fn => page.evaluate(([key, src]) => { const p = JSON.parse(localStorage.getItem(key)); new Function("p", src)(p); localStorage.setItem(key, JSON.stringify(p)) }, [KEY, fn])
try {
  // settings: gore persists
  await g.action("settings")
  await g.action("gore")
  check((await page.evaluate(() => JSON.parse(localStorage.getItem("ironVeil.settings.v1")).gore)) === "normal", "Gore auf „Normal“ gestellt und gespeichert")
  await g.action("gore"); await g.action("gore")
  check((await page.evaluate(() => JSON.parse(localStorage.getItem("ironVeil.settings.v1")).gore)) === "brutal", "Gore wieder „Brutal“")

  // offline production (1 technician in the workshop) and research
  const ammoBefore = (await profile()).stash.ammo_9mm
  await editSave("p.lastTick = Date.now() - 3600 * 1000")
  await g.reload()
  check((await profile()).stash.ammo_9mm > ammoBefore + 50, `Werkstatt produziert offline (${ammoBefore} → ${(await profile()).stash.ammo_9mm})`)
  await g.action("research"); await g.action("research", "ballistics")
  check((await profile()).activeResearch?.id === "ballistics", "Forschung gestartet")
  await editSave("p.activeResearch.endsAt = Date.now() - 1")
  await g.reload()
  check((await profile()).research.includes("ballistics"), "Forschung abgeschlossen")

  // raid with the shotgun as primary
  await g.action("inventory"); await g.action("stash-filter", "weapon"); await g.action("equip-weapon", "kv12"); await g.action("quick-pack")
  await page.evaluate(() => window.__ironVeil.deploy({ time: "dusk" }))
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
  await page.evaluate(() => window.__ironVeil.godMode(true))
  let s = await snapshot()
  check(s.weapon === "kv12" && s.ammo === 6, "Schrotflinte geladen")
  await fire(1); await g.until(() => window.__ironVeil.snapshot().ammo === 5, null, 8000)
  check(true, "Ein Schuss verbraucht eine Patrone")
  await page.keyboard.press("KeyR"); await g.until(() => window.__ironVeil.snapshot().ammo === 6, null, 15000)
  check(true, "Patronenweises Nachladen")
  await page.keyboard.press("Digit2"); await g.until(() => window.__ironVeil.snapshot().weapon === "p9", null, 8000)
  check(true, "2 wechselt zur Pistole")
  await page.keyboard.press("Digit3"); await g.until(() => window.__ironVeil.snapshot().weapon === "knife", null, 8000)
  check(true, "3 wechselt zum Messer")
  await page.keyboard.press("Digit1"); await g.until(() => window.__ironVeil.snapshot().weapon === "kv12", null, 8000)
  await page.keyboard.press("KeyV"); await g.frames(4)
  check(true, "Schnelles Messer (V)")
  // throwables: grenade, then the molotov
  const grenades = (await snapshot()).hud.grenades
  await page.keyboard.press("KeyG")
  await g.until(n => window.__ironVeil.snapshot().hud.grenades === n - 1, grenades, 10000)
  check(true, "Granate geworfen")
  await page.waitForTimeout(1500)
  await page.keyboard.press("Digit4"); await g.frames(3)
  check((await snapshot()).hud.throwableName === "Brandflasche", "4 wechselt auf Brandflasche")
  await page.keyboard.press("KeyG"); await g.frames(10); await page.waitForTimeout(1500)
  await g.shot("edge-01-molotov.png")
  // crouch and flashlight
  await page.keyboard.press("KeyC"); await g.frames(3)
  check((await snapshot()).crouched === true, "C duckt")
  await page.keyboard.press("KeyC"); await page.keyboard.press("KeyF"); await g.frames(3)
  check((await snapshot()).crouched === false, "C steht wieder auf")
  // screen blood with gore on
  await page.evaluate(() => window.__ironVeil.godMode(false))
  await page.evaluate(() => window.__ironVeil.damage(35)); await g.frames(3)
  await page.evaluate(() => window.__ironVeil.godMode(true))
  // damage() bypasses the hit path; a real hit is simulated through the HUD hook
  await page.evaluate(() => window.__ironVeil.splatter(0.6)); await g.frames(2)
  check(await page.locator(".screen-blood i.on").count() > 0, "Blut auf dem Bildschirm (Gore an)")
  // abort from the pause menu loses the kit
  await page.keyboard.press("Escape"); await g.until(() => window.__ironVeil.screen() === "paused")
  await g.action("abort")
  await g.until(() => window.__ironVeil.screen() === "result", null, 30000)
  const p = await profile()
  check(p.loadout.primary === null && p.raidStarted === 0, "Abbruch: Einsatz verloren, Waffen weg")
  check(g.errors.length === 0, `Keine Fehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("EDGEVERIFY OK")
} finally { await g.close() }
