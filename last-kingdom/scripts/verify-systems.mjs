// Camp economy and progression: upgrades, crafting, repair, merchant, skills, missions, death penalty, save.
import { openGame } from "./browser-lib.mjs"

const g = await openGame()
const page = g.page
try {
  await g.click("characters")
  await g.click("new")
  await page.fill("#char-name", "Schmied")
  await g.click("class", '[data-id="rogue"]')
  await g.click("create")
  let s = await g.snapshot()
  g.check(s.profile.equipment.mainHand === "dagger_1", "Schattendieb startet mit Dolch")
  // Give materials and gold
  await page.evaluate(() => {
    const p = window.__lastKingdom.profile()
    p.gold = 5000
    for (const [id, n] of [["wood", 120], ["iron", 80], ["leather", 30], ["cloth", 30], ["steel", 30], ["herbs", 40], ["bone", 30]]) window.__lastKingdom.give(id, n)
    window.__lastKingdom.game.saveProfile()
  })
  // Upgrade the smithy twice
  await g.click("building", '[data-id="smithy"]')
  await g.click("upgrade")
  s = await g.snapshot()
  g.check(s.profile.camp.smithy === 1, "Schmiede auf Stufe 1")
  g.check(s.profile.gold === 5000 - 150, `Gold abgezogen (${s.profile.gold})`)
  await g.click("upgrade")
  s = await g.snapshot()
  g.check(s.profile.camp.smithy === 2, "Schmiede auf Stufe 2")
  await g.shot("s01-smithy.png")
  // Craft a forged longsword
  await g.click("craft", '[data-id="longsword_2"]')
  s = await g.snapshot()
  g.check(s.profile.bag.some((b) => b.startsWith("longsword_2")), "Geschmiedetes Langschwert hergestellt")
  // Upgrade the dagger (equipped) at the smithy
  const uid = await page.evaluate(() => window.__lastKingdom.profile().loadout.equipment.mainHand.uid)
  await g.click("upgradeitem", `[data-uid="${uid}"]`)
  const up = await page.evaluate(() => window.__lastKingdom.profile().loadout.equipment.mainHand.upgrade)
  g.check(up === 1, `Dolch auf +${up} aufgewertet`)
  // Damage it and repair
  await page.evaluate(() => {
    const w = window.__lastKingdom.profile().loadout.equipment.mainHand
    w.durability = 5
  })
  await page.evaluate(() => window.__lastKingdom.game.ui.refresh())
  await g.click("repair", `[data-uid="${uid}"]`)
  const dur = await page.evaluate(() => {
    const w = window.__lastKingdom.profile().loadout.equipment.mainHand
    return [w.durability, w.maxDurability]
  })
  g.check(dur[0] === dur[1], `Dolch repariert (${dur[0]}/${dur[1]})`)
  await page.keyboard.press("Escape")
  await g.frames(3)
  // Workshop + alchemy crafting
  await g.click("building", '[data-id="alchemy"]')
  await g.click("upgrade")
  await g.click("craft", '[data-id="potion_small"]')
  s = await g.snapshot()
  g.check(s.profile.bag.some((b) => b.startsWith("potion_small")), "Heiltrank gebraut")
  await page.keyboard.press("Escape")
  await g.frames(3)
  // Merchant: build stand, buy and sell
  await g.click("building", '[data-id="merchant"]')
  await g.click("upgrade")
  s = await g.snapshot()
  console.log(`  Lager: ${JSON.stringify(s.profile.camp)}, Gold ${s.profile.gold}, Rucksack ${s.profile.bag.join(" ")}`)
  g.check(s.profile.camp.merchant === 1, "Händlerstand gebaut")
  await page.keyboard.press("Escape")
  await g.frames(3)
  await g.click("merchant")
  s = await g.snapshot()
  g.check(s.screen === "merchant", "Händler geöffnet")
  const goldBefore = s.profile.gold
  await g.click("buy")
  s = await g.snapshot()
  g.check(s.profile.gold < goldBefore, `Kauf zieht Gold ab (${goldBefore} → ${s.profile.gold})`)
  await g.shot("s02-merchant.png")
  await g.click("tab-sell")
  const goldBeforeSell = (await g.snapshot()).profile.gold
  await g.click("sell")
  s = await g.snapshot()
  g.check(s.profile.gold > goldBeforeSell, `Verkauf bringt Gold (${goldBeforeSell} → ${s.profile.gold})`)
  await page.keyboard.press("Escape")
  await g.frames(3)
  // Skills: give points and learn w1 then w2
  await page.evaluate(() => {
    window.__lastKingdom.profile().skillPoints = 3
  })
  await g.click("skills")
  await g.click("learn", '[data-id="w2"]') // should fail: requires w1
  s = await g.snapshot()
  g.check(!s.profile.skills.includes("w2"), "Fähigkeit ohne Voraussetzung wird abgelehnt")
  await g.click("learn", '[data-id="w1"]')
  await g.click("learn", '[data-id="w2"]')
  s = await g.snapshot()
  g.check(s.profile.skills.includes("w1") && s.profile.skills.includes("w2"), "Fähigkeiten gelernt")
  await g.shot("s03-skills.png")
  await page.keyboard.press("Escape")
  await g.frames(3)
  // Inventory: move an item to the stash and back
  await g.click("inventory")
  const bagCount = (await g.snapshot()).profile.bag.length
  await page.locator(".panel.bag .tile[data-uid]").first().click({ button: "right" })
  await page.waitForTimeout(150)
  s = await g.snapshot()
  g.check(s.profile.stash === 1 && s.profile.bag.length === bagCount - 1, "Gegenstand ins Lager gelegt (Rechtsklick)")
  await page.locator(".stash-tile[data-uid]").first().click()
  await page.waitForTimeout(150)
  s = await g.snapshot()
  g.check(s.profile.stash === 0, "Gegenstand zurück in den Rucksack")
  await g.shot("s04-inventory.png")
  await page.keyboard.press("Escape")
  await g.frames(3)
  // Death penalty: start an expedition, die, check losses and insured slot
  await page.evaluate(() => {
    const p = window.__lastKingdom.profile()
    p.camp.defense = 1 // one insured slot
    window.__lastKingdom.game.saveProfile()
  })
  await g.click("map")
  await g.click("start")
  await g.click("go")
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 120000 })
  await page.evaluate(() => window.__lastKingdom.setMaxFrame(0.5))
  await g.frames(3)
  const bagBefore = (await g.snapshot()).profile.bag
  const firstSlot = await page.evaluate(() => window.__lastKingdom.profile().loadout.slots[0]?.defId ?? null)
  // Does a weapon survive the death (insured slot 0 or stash)? Otherwise the camp hands out the class weapon.
  const weaponStays = await page.evaluate(() => {
    const p = window.__lastKingdom.profile()
    const isWeapon = (it) => !!it && /^(longsword|shortsword|greatsword|battleaxe|mace|spear|dagger|bow|crossbow)_/.test(it.defId)
    return isWeapon(p.loadout.slots[0]) || p.stash.some(isWeapon)
  })
  await page.evaluate(() => window.__lastKingdom.game.expedition.player.die("Test"))
  await page.waitForFunction(() => window.__lastKingdom.snapshot().state === "camp", null, { timeout: 60000 })
  s = await g.snapshot()
  g.check(s.screen === "results", "Ergebnisbildschirm nach dem Tod")
  g.check(s.profile.stats.deaths === 1, "Tod gezählt")
  if (weaponStays) g.check(s.profile.equipment.mainHand === null, "Ausgerüstete Waffe beim Tod verloren")
  else {
    g.check(s.profile.equipment.mainHand === "dagger_1", `Notausrüstung: Dolch nach dem Tod ohne Waffe (${s.profile.equipment.mainHand})`)
    const text = await page.locator(".screen-results").innerText()
    g.check(/Notausrüstung/.test(text), "Notausrüstung auf dem Ergebnisbildschirm genannt")
  }
  g.check(s.profile.equipment.body === "armor_rags", "Lumpen als Ersatzrüstung")
  const bagAfter = s.profile.bag
  g.check(bagAfter.length <= 1 && (firstSlot === null || bagAfter[0]?.startsWith(firstSlot)), `Nur der versicherte Platz bleibt (${bagAfter.join(", ") || "leer"}; vorher ${bagBefore.length} Stapel)`)
  await g.shot("s05-death.png")
  await g.click("camp")
  // Mission flow: accept a collect mission, give the items, extract, turn in
  await g.click("missions")
  const collectBtn = page.locator('[data-action="accept"]').filter({ hasText: "Sammeln" })
  const hasCollect = (await collectBtn.count()) > 0
  if (hasCollect) {
    await collectBtn.first().click()
    await g.frames(2)
    s = await g.snapshot()
    const m = s.profile.missions.find((x) => x.status === "active" && x.kind === "collect")
    g.check(!!m, "Sammelmission angenommen")
    await page.keyboard.press("Escape")
    await g.frames(3)
    await page.evaluate((id) => {
      const p = window.__lastKingdom.profile()
      const mm = p.missions.find((x) => x.id === id)
      window.__lastKingdom.give(mm.targetId, mm.goal)
      window.__lastKingdom.game.saveProfile()
    }, m.id)
    await g.click("map")
    await g.click("start")
    await g.click("go")
    await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 120000 })
    await page.evaluate(() => window.__lastKingdom.setMaxFrame(0.5))
    await g.frames(3)
    s = await g.snapshot()
    const ex = s.expedition.extractions.find((e) => e.active)
    await page.evaluate(({ x, z }) => {
      window.__lastKingdom.teleport(x + 1, z)
      window.__lastKingdom.godMode(true)
    }, ex)
    await g.frames(3)
    await page.keyboard.press("KeyE")
    await page.waitForFunction(() => window.__lastKingdom.snapshot().state === "camp", null, { timeout: 60000 })
    s = await g.snapshot()
    const done = s.profile.missions.find((x) => x.id === m.id)
    g.check(done && done.status === "completed", `Sammelmission nach Extraktion abgeschlossen (${done?.status})`)
    await g.click("camp")
    await g.click("missions")
    const goldBeforeTurnIn = (await g.snapshot()).profile.gold
    await g.click("turnin")
    s = await g.snapshot()
    g.check(s.profile.gold > goldBeforeTurnIn, `Belohnung erhalten (${goldBeforeTurnIn} → ${s.profile.gold})`)
    await page.keyboard.press("Escape")
  } else console.log("  (keine Sammelmission im Angebot, Missionsabgabe übersprungen)")
  // Export/import roundtrip
  const json = await page.evaluate(() => JSON.stringify(window.__lastKingdom.profile()))
  const ok = await page.evaluate((j) => window.__lastKingdom.game.importProfile(j, 2), json)
  g.check(ok === true, "Spielstand-Import in Platz 3")
  const errs = g.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) console.log("  Konsolenfehler:", errs.join("\n"))
  g.check(errs.length === 0, `Keine Konsolenfehler (${errs.length})`)
  console.log("verify-systems: alles bestanden")
} catch (e) {
  console.error(e)
  console.error("Konsolenfehler:", g.errors.slice(0, 10))
  await g.shot("s-error.png").catch(() => undefined)
  process.exitCode = 1
} finally {
  await g.close()
}
