// verify-systems.mjs — full game loop in a real browser: menus, trader, loadout, raid (shooting, reload, weapon
// switch, searching crates with E, calling and holding the extraction), result booking, selling, base building,
// research with time skip, offline production, death and settings persistence.
import { openGame } from "./browser-lib.mjs"

const g = await openGame()
const { page, check } = g
const profile = g.profile, snapshot = g.snapshot
try {
  check((await snapshot()).screen === "menu", "Hauptmenü erreicht")
  await g.action("intro-close")
  await page.locator(".hero [data-action=missions]").click(); await page.waitForTimeout(150)
  check(await page.locator(".mission-card").count() === 3, "Drei Operationen wählbar")
  check(await page.locator(".mission-card.locked").count() === 2, "Zwei Operationen noch gesperrt")
  check(await page.locator(".contract-card").count() === 1, "Nebenauftrag im Briefing")

  await g.action("trader")
  const beforeBuy = await profile(); await g.action("buy", "ammo"); const afterBuy = await profile()
  check(afterBuy.stash.ammo === beforeBuy.stash.ammo + 1 && afterBuy.money === beforeBuy.money - 60, "Händlerkauf verändert Geld und Lager")
  check(await page.locator("[data-action=buy-weapon]").count() === 0 || await page.locator(".weapon-card").count() === 4, "Waffenangebot sichtbar")
  await g.action("inventory"); await g.action("equip", "armor"); await g.action("equip", "medkit")
  const lo = (await profile()).loadout
  check(lo.armor === 55 && lo.medkits === 2, "Weste und zweites Trauma-Set ausgerüstet")

  await g.action("missions"); await g.action("deploy"); await page.waitForTimeout(800)
  check((await snapshot()).screen === "playing", "Einsatz gestartet")
  await page.evaluate(() => window.__ironVeil.godMode(true))
  const hud = (await snapshot()).hud
  check(hud && hud.weaponName.startsWith("MK-4") && hud.armor === 55 && hud.medkits === 2, "HUD zeigt Waffe, Rüstung und Trauma-Sets")
  check((await profile()).stash.ammo === 1 && (await snapshot()).reserve === 150, "Sechs Munitionspakete mitgenommen (30 im Magazin, 150 Reserve)")

  // combat: put an enemy in front, aim and fire until it falls
  const alive0 = (await snapshot()).enemiesAlive
  await page.evaluate(() => window.__ironVeil.placeEnemy(9))
  for (let i = 0; i < 40 && (await snapshot()).enemiesAlive === alive0; i++) {
    await page.evaluate(() => { window.__ironVeil.placeEnemy(9); window.__ironVeil.aim() })
    await page.mouse.move(640, 360); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); await page.waitForTimeout(60)
  }
  check((await snapshot()).enemiesAlive === alive0 - 1, "Treffer neutralisieren einen Gegner")
  await g.shot("04-combat.png")
  const ammoAfter = (await snapshot()).ammo
  check(ammoAfter < 30, `Munition verbraucht (${ammoAfter} im Magazin)`)
  await page.keyboard.press("KeyR")
  await g.until(() => window.__ironVeil.snapshot().ammo === 30, null, 8000)
  check((await snapshot()).reserve === 150 - (30 - ammoAfter), "Nachladen füllt das Magazin aus der Reserve")
  await page.keyboard.press("Digit2"); await page.waitForTimeout(900)
  check((await snapshot()).weapon === "p9", "Taste 2 wechselt zur Pistole")
  await page.keyboard.press("Digit1"); await page.waitForTimeout(900)
  check((await snapshot()).weapon === "mk4", "Taste 1 wechselt zurück zum Gewehr")

  // search a crate for real: stand next to it, look at it, hold E
  const crate = (await page.evaluate(() => window.__ironVeil.crates()))[0]
  await page.evaluate(c => { window.__ironVeil.teleport(c.x + 1.3, c.z); window.__ironVeil.lookAt(c.x, c.z) }, crate)
  await page.waitForTimeout(200)
  check(((await snapshot()).hud?.interaction || "").includes("Kiste"), "Hinweis „Kiste durchsuchen“ erscheint")
  await page.keyboard.down("KeyE"); await g.until(() => window.__ironVeil.snapshot().lootCollected === 1, null, 6000); await page.keyboard.up("KeyE")
  check((await snapshot()).lootCollected === 1, "Kiste per gehaltenem E durchsucht")
  await page.evaluate(() => window.__ironVeil.collect())
  check((await snapshot()).extractionReady, "Bergungsziel öffnet die Extraktion")

  // call the evac and hold the zone until the helicopter is there
  const ex = await page.evaluate(() => window.__ironVeil.extraction())
  await page.evaluate(e => window.__ironVeil.teleport(e.x, e.z), ex); await page.waitForTimeout(200)
  await page.keyboard.down("KeyE"); await g.until(() => window.__ironVeil.snapshot().extractionProgress > 0, null, 6000); await page.keyboard.up("KeyE")
  check((await snapshot()).extractionProgress > 0, "Evakuierung angefordert")
  await g.shot("05-extraction.png")
  await page.evaluate(e => window.__ironVeil.teleport(e.x, e.z), ex)
  await g.until(() => window.__ironVeil.snapshot().screen === "result", null, 30000)
  check(await page.locator(".result-success").count() === 1, "Extraktion führt zum Erfolgsbildschirm")
  const p1 = await profile()
  check(p1.stats.extracts === 1 && p1.stats.raids === 1, "Erfolgreiche Extraktion im Profil verbucht")
  check(Object.entries(p1.stash).some(([id, n]) => ["parts", "intel", "electronics", "medical", "relic"].includes(id) && n > 0), "Beute ins Lager übertragen")
  check(p1.loadout.armor === 55, "Unbeschädigte Weste bleibt ausgerüstet")
  await g.shot("06-result.png")

  // economy and base
  await g.action("menu"); await g.action("trader")
  const sellBefore = await profile(); await g.action("sell-everything"); const sellAfter = await profile()
  check(sellAfter.money > sellBefore.money, "Gesamte Beute verkauft")
  // top up the account so the base test does not depend on the random loot value
  await page.evaluate(() => { const key = "ironVeil.profile.v3"; const p = JSON.parse(localStorage.getItem(key)); p.money += 3000; p.resources += 100; localStorage.setItem(key, JSON.stringify(p)) })
  await g.reload(); await g.action("base")
  await g.action("build", "workshop"); await page.locator('[data-action=staff][data-id=workshop][data-delta="1"]').click(); await page.waitForTimeout(80)
  await g.action("build", "lab"); await page.locator('[data-action=staff][data-id=lab][data-delta="1"]').click(); await page.waitForTimeout(80)
  const p2 = await profile()
  check(p2.buildings.workshop === 1 && p2.staff.workshop === 1 && p2.buildings.lab === 1 && p2.staff.lab === 1, "Gebäude errichtet und Personal eingeteilt")
  await g.action("research", "ballistics")
  check((await profile()).activeResearch?.id === "ballistics", "Forschung gestartet")
  await g.shot("07-base.png")
  await page.evaluate(() => { const key = "ironVeil.profile.v3"; const p = JSON.parse(localStorage.getItem(key)); p.lastTick = Date.now() - 100000; p.activeResearch.endsAt = Date.now() - 1; localStorage.setItem(key, JSON.stringify(p)) })
  const ammoBefore = (await profile()).stash.ammo
  await g.reload()
  const p3 = await profile()
  check(p3.research.includes("ballistics") && !p3.activeResearch, "Forschung nach dem Neuladen abgeschlossen")
  check(p3.stash.ammo >= ammoBefore + 2, `Munitionswerkstatt produziert auch offline (${ammoBefore} → ${p3.stash.ammo})`)

  // death
  await page.evaluate(() => window.__ironVeil.start("greyzone")); await page.waitForTimeout(400)
  await page.evaluate(() => window.__ironVeil.damage(500))
  await g.until(() => window.__ironVeil.snapshot().screen === "result", null, 10000)
  const p4 = await profile()
  check(p4.stats.deaths === 1 && p4.loadout.armor === 0, "Tod: Fehlschlag verbucht, Weste verloren")
  await g.shot("08-death.png")

  // settings persistence
  await g.action("menu"); await g.action("settings"); await g.action("quality"); await g.action("difficulty")
  check(await page.locator('[data-action=quality]').textContent() === "HOCH", "Grafikqualität umschaltbar")
  await g.reload(); await g.action("settings")
  check(await page.locator('[data-action=quality]').textContent() === "HOCH", "Einstellungen überstehen das Neuladen")
  check(await page.locator('[data-action=difficulty]').textContent() === "SCHWER", "Schwierigkeit gespeichert")
  check(g.errors.length === 0, `Keine Konsolen- oder Laufzeitfehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("SYSTEMVERIFY OK")
} finally { await g.close() }
