// verify-edge.mjs — edge cases and content: v2 save migration, base/staff/production, research tiers, buying and
// using all weapons, grenades, healing, crouch, flashlight, map/inventory overlays, all three operations, abort.
import { openGame, richProfile } from "./browser-lib.mjs"

// 1) migration of an old v2 save
{
  const legacy = { key: "ironVeil.profile.v2", value: { version: 2, callsign: "ALT-01", money: 4321, resources: 70, xp: 0, level: 2, stash: { ammo: 3, medkit: 1, armor: 0, parts: 2, intel: 0, electronics: 0, medical: 0, relic: 0 }, buildings: { hq: 2, workshop: 0, lab: 0, clinic: 0 }, staff: { workshop: 0, lab: 0, clinic: 0 }, production: { workshop: 0, clinic: 0 }, research: [], activeResearch: null, loadout: { armor: 55, medkits: 1 }, stats: { raids: 3, extracts: 2, kills: 4, earned: 900, deaths: 1 }, lastTick: Date.now() } }
  const g = await openGame({ profile: legacy })
  try {
    const p = await g.profile()
    g.check(p.version === 3 && p.money === 4321 && p.callsign === "ALT-01" && p.loadout.armorMax === 55 && p.weapons.includes("mk4"), "Alter Spielstand (v2) wird übernommen")
    g.check(await g.page.locator(".intro-card").count() === 0, "Keine Kurzeinweisung für erfahrene Spieler")
    g.check(g.errors.length === 0, "Keine Fehler bei der Übernahme")
  } finally { await g.close() }
}

const g = await openGame({ profile: richProfile() })
const { page, check } = g
const profile = g.profile, snapshot = g.snapshot
const fire = async (n, ms = 60) => { for (let i = 0; i < n; i++) { await page.mouse.move(640, 360); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(ms) } }
try {
  // base: HQ to level 3, staff, clinic production
  await g.action("base")
  await g.action("build", "hq"); await g.action("build", "hq")
  check((await profile()).buildings.hq === 3, "Kommandozentrale zweimal ausgebaut")
  await page.locator('[data-action=staff][data-id=clinic][data-delta="1"]').click(); await page.locator('[data-action=staff][data-id=workshop][data-delta="-1"]').click(); await page.waitForTimeout(80)
  check((await profile()).staff.clinic === 1 && (await profile()).staff.workshop === 0, "Personal zuweisen und abziehen")
  const medBefore = (await profile()).stash.medkit
  await page.evaluate(() => { const key = "ironVeil.profile.v3"; const p = JSON.parse(localStorage.getItem(key)); p.lastTick = Date.now() - 100000; localStorage.setItem(key, JSON.stringify(p)) })
  await g.reload()
  check((await profile()).stash.medkit === medBefore + 1, "Feldlazarett produziert Trauma-Sets")
  // research: lab 1 programs, then lab 2 unlocks the next tier
  for (const id of ["ballistics", "plating", "fieldmed"]) {
    await g.action("base"); await g.action("research", id)
    await page.evaluate(() => { const key = "ironVeil.profile.v3"; const p = JSON.parse(localStorage.getItem(key)); p.activeResearch.endsAt = Date.now() - 1; localStorage.setItem(key, JSON.stringify(p)) })
    await g.reload(); check((await profile()).research.includes(id), `Forschung abgeschlossen: ${id}`)
  }
  await g.action("base")
  check(await page.locator('[data-action=research][data-id=broker]').isDisabled(), "Graumarkt braucht Labor Ebene 2")
  await g.action("build", "lab"); await page.waitForTimeout(80)
  check(!(await page.locator('[data-action=research][data-id=broker]').isDisabled()), "Labor Ebene 2 schaltet die nächste Forschung frei")

  // trader: weapons and supplies
  await g.action("trader")
  const partsMoney = await profile(); await g.action("sell-all", "parts"); const afterSell = await profile()
  check(afterSell.stash.parts === 0 && afterSell.money - partsMoney.money === 3 * 140, "Gesamtverkauf einer Sorte")
  await g.action("buy-weapon", "kv12"); await g.action("buy-weapon", "dr7"); await g.action("buy-weapon", "vx9")
  const pw = await profile()
  check(["kv12", "dr7", "vx9"].every(w => pw.weapons.includes(w)) && pw.loadout.primary === "vx9", "Drei Waffen gekauft, die letzte ist ausgerüstet")
  await g.action("buy", "plate"); await g.action("buy", "grenade")
  await g.action("inventory"); await g.action("equip", "plate"); await g.action("equip", "grenade"); await g.action("equip", "grenade")
  const lo = (await profile()).loadout
  check(lo.armorMax === 85 && lo.grenades === 2, "Plattenträger und zwei Granaten ausgerüstet")
  check((await profile()).stash.armor === 2, "Alte Weste kommt zurück ins Lager")
  await g.action("select-weapon", "kv12")
  check((await profile()).loadout.primary === "kv12", "Schrotflinte als Hauptwaffe gewählt")

  // harbor with the shotgun
  await g.action("missions"); await g.action("select-mission", "harbor"); await g.action("deploy"); await page.waitForTimeout(700)
  await page.evaluate(() => window.__ironVeil.godMode(true))
  let s = await snapshot()
  check(s.mission === "harbor" && s.enemiesAlive === 8, "Stahlhafen mit 8 Gegnern")
  check(s.weapon === "kv12" && s.ammo === 6, "Schrotflinte geladen")
  check(s.hud.armor === 85 + 25, "Verbundplatten-Bonus auf die Rüstung")
  await fire(1); await page.waitForTimeout(200)
  check((await snapshot()).ammo === 5, "Schrotflinte verbraucht eine Patrone pro Schuss")
  await page.keyboard.press("KeyR"); await g.until(() => window.__ironVeil.snapshot().ammo === 6, null, 6000)
  check(true, "Patronenweises Nachladen")
  // grenade
  await page.keyboard.press("KeyG")
  await g.until(() => window.__ironVeil.snapshot().hud.grenades === 1, null, 8000)
  await page.waitForTimeout(3000)
  check(true, "Granate geworfen")
  // healing with field medicine (65)
  await page.evaluate(() => window.__ironVeil.damage(70)); await page.waitForTimeout(150)
  const hpLow = (await snapshot()).health
  await page.keyboard.press("KeyQ")
  await g.until(h => window.__ironVeil.snapshot().health >= h, Math.min(100, hpLow + 64), 15000)
  check((await snapshot()).hud.medkits === 1, "Feldmedizin heilt 65 Gesundheit und verbraucht ein Trauma-Set")
  // crouch, flashlight, map, inventory
  await page.keyboard.press("KeyC"); await page.waitForTimeout(200)
  check((await snapshot()).crouched === true, "C duckt")
  await page.keyboard.press("KeyC"); await page.keyboard.press("KeyF"); await page.waitForTimeout(150)
  await page.keyboard.press("KeyM"); await page.waitForTimeout(300)
  check(await page.locator("canvas.tac-map").count() === 1, "M öffnet die taktische Karte")
  await g.shot("09-map.png")
  await page.keyboard.press("KeyM"); await page.waitForTimeout(300)
  check((await snapshot()).screen === "playing", "M schließt die Karte wieder")
  await page.keyboard.press("Tab"); await page.waitForTimeout(300)
  check(await page.locator(".raid-bag").count() === 1, "Tab öffnet das Raid-Inventar")
  await page.keyboard.press("Tab"); await page.waitForTimeout(300)
  await page.keyboard.press("Escape"); await page.waitForTimeout(300); await g.action("abort")
  check((await snapshot()).screen === "result" && await page.locator(".result-failure").count() === 1, "Abbrechen erzeugt einen Fehlschlag")

  // blacksite at night with the DMR
  await g.action("menu"); await g.action("inventory"); await g.action("select-weapon", "dr7")
  await g.action("missions"); await g.action("select-mission", "blacksite"); await g.action("deploy"); await page.waitForTimeout(700)
  s = await snapshot()
  check(s.mission === "blacksite" && s.enemiesAlive === 10 && s.weapon === "dr7", "Nachtgitter mit 10 Gegnern und Präzisionsgewehr")
  await page.mouse.down({ button: "right" }); await page.waitForTimeout(700)
  check((await snapshot()).hud.scoped === true, "Zielfernrohr beim Zielen")
  await g.shot("10-scope.png")
  await page.mouse.up({ button: "right" })
  await page.keyboard.press("Escape"); await page.waitForTimeout(300); await g.action("abort")
  check(g.errors.length === 0, `Keine Laufzeitfehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("EDGEVERIFY OK")
} finally { await g.close() }
