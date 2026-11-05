// Soak test: every enemy type, hordes, boss abilities, ranged combat, weather and night, several simulated minutes.
import { openGame } from "./browser-lib.mjs"

const g = await openGame({ settings: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, quality: "low", shadows: true, showFps: true, cameraShake: false } })
const page = g.page
const sim = async (seconds) => {
  const t0 = await page.evaluate(() => window.__lastKingdom.game.expedition?.elapsed ?? 0)
  await page.waitForFunction((t) => !window.__lastKingdom.game.expedition || window.__lastKingdom.game.expedition.elapsed >= t, t0 + seconds, { timeout: 300000 })
  const alive = await page.evaluate(() => !!window.__lastKingdom.game.expedition)
  if (!alive) throw new Error(`Expedition endete vorzeitig (Spieler gestorben?) bei sim(${seconds})`)
}
try {
  await g.click("characters"); await g.click("new"); await page.fill("#char-name", "Soak"); await g.click("class", '[data-id="ranger"]'); await g.click("create")
  await page.evaluate(() => window.__lastKingdom.game.startExpedition("village"))
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate(() => { window.__lastKingdom.setMaxFrame(0.5); window.__lastKingdom.setHour(14); window.__lastKingdom.setWeather("clear") })
  await g.frames(3)
  await g.shot("x01-day-shadows.png")
  // Ranged: draw the bow and release
  await page.mouse.click(640, 360)
  await g.frames(2)
  await page.mouse.down()
  await sim(1.2)
  await page.mouse.up()
  await g.frames(2)
  const arrows = await page.evaluate(() => window.__lastKingdom.profile().loadout.slots.reduce((n, s) => n + (s && s.defId === "arrow" ? s.qty : 0), 0))
  g.check(arrows < 40, `Bogen verschießt Pfeile (${arrows} übrig)`)
  // Every enemy type attacks the player
  const types = ["walker", "walker_villager", "walker_monk", "walker_soldier", "sprinter", "sprinter_hound", "brute", "brute_butcher", "knight", "knight_captain"]
  await page.evaluate((types) => { types.forEach((t, i) => window.__lastKingdom.spawnZombie(t, 4 + (i % 3) * 2, (i - 5) * 2)) }, types)
  await sim(4)
  let s = await g.snapshot()
  g.check(s.expedition && s.expedition.player.hp < s.expedition.player.maxHp, `Gegner treffen den Spieler (HP ${Math.round(s.expedition?.player.hp)}/${s.expedition?.player.maxHp})`)
  g.check(s.expedition.alerted >= 5, `Gegner verfolgen (${s.expedition.alerted} alarmiert)`)
  // Survive: god mode and fight back with the sword from the quick slot
  await page.evaluate(() => window.__lastKingdom.godMode(true))
  await sim(8)
  await g.shot("x02-horde.png")
  await page.keyboard.press("Digit1") // quick slot 1: shortsword
  await g.frames(2)
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("KeyT")
    await page.mouse.down(); await g.frames(1); await page.mouse.up(); await g.frames(2)
  }
  s = await g.snapshot()
  g.check(s.expedition.kills >= 2, `Nahkampf tötet Gegner in der Horde (${s.expedition.kills})`)
  // Night with a torch in the off hand, storm, fog visibility
  const torch = await page.evaluate(() => window.__lastKingdom.equipItem("torch_item"))
  g.check(torch === true, "Fackel in die linke Hand genommen")
  await page.evaluate(() => { window.__lastKingdom.setHour(23.5); window.__lastKingdom.setWeather("storm") })
  await sim(6)
  const carries = await page.evaluate(() => window.__lastKingdom.game.expedition.player.carriesTorch)
  g.check(carries === true, "Fackel leuchtet")
  await g.shot("x03-night-storm.png")
  await page.evaluate(() => window.__lastKingdom.setWeather("fog"))
  await sim(3)
  await g.shot("x04-fog.png")
  // Boss fight: teleport to the arena and face a fresh boss
  await page.evaluate(() => { window.__lastKingdom.killAll(); window.__lastKingdom.setHour(12); window.__lastKingdom.setWeather("clear") })
  const arena = await page.evaluate(() => { const e = window.__lastKingdom.game.expedition; return e.world.bossArena })
  await page.evaluate(({ x, z }) => window.__lastKingdom.teleport(x + 6, z + 6), arena)
  await page.evaluate(() => window.__lastKingdom.spawnZombie("boss_elder", 8, 0))
  await sim(25)
  s = await g.snapshot()
  const boss = await page.evaluate(() => { const b = window.__lastKingdom.game.expedition.zombies.find((z) => z.isBoss && !z.dead); return b ? { hp: b.hp, state: b.state, alerted: b.alerted, phase: b.phase, dead: b.dead } : null })
  console.log("  Boss:", JSON.stringify(boss), "Zombies", s.expedition.zombies)
  g.check(boss && (boss.alerted || boss.dead || boss.state === "chase"), "Boss reagiert auf den Spieler")
  await g.shot("x05-boss.png")
  // Damage the boss into phase 2 and let him summon
  await page.evaluate(() => { const e = window.__lastKingdom.game.expedition; const b = e.zombies.find((z) => z.isBoss && !z.dead); if (b) b.takeHit(Math.round(b.maxHp * 0.55), false, 0, false, e.player.pos.x, e.player.pos.z) })
  await sim(30)
  const boss2 = await page.evaluate(() => { const b = window.__lastKingdom.game.expedition.zombies.find((z) => z.isBoss && z.phase >= 2) ?? window.__lastKingdom.game.expedition.zombies.find((z) => z.isBoss); return b ? { hp: b.hp, phase: b.phase, dead: b.dead } : null })
  s = await g.snapshot()
  console.log("  Boss nach Phase 2:", JSON.stringify(boss2), "Zombies gesamt", s.expedition.zombiesTotal)
  g.check(boss2 && boss2.phase >= 2, `Boss-Phase 2 erreicht (${boss2?.phase})`)
  // Catacombs (underground) and a hazard area
  await page.evaluate(() => window.__lastKingdom.game.goToCamp())
  await g.frames(2)
  await page.evaluate(() => { const p = window.__lastKingdom.profile(); p.unlockedAreas = ["village", "forest", "castle", "graveyard", "monastery", "catacombs", "city", "fortress"]; window.__lastKingdom.game.startExpedition("catacombs") })
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate(() => window.__lastKingdom.setMaxFrame(0.5))
  await sim(4)
  await g.shot("x06-catacombs.png")
  await page.evaluate(() => window.__lastKingdom.game.goToCamp())
  await g.frames(2)
  await page.evaluate(() => window.__lastKingdom.game.startExpedition("forest"))
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate(() => { window.__lastKingdom.setMaxFrame(0.5); window.__lastKingdom.godMode(false) })
  const hz = await page.evaluate(() => window.__lastKingdom.game.expedition.world.hazards[0])
  await page.evaluate(({ x, z }) => window.__lastKingdom.teleport(x, z), hz)
  await sim(3)
  const plague = await page.evaluate(() => window.__lastKingdom.game.expedition.player.plague)
  g.check(plague > 0, `Pestnebel vergiftet (${plague.toFixed(1)} s)`)
  s = await g.snapshot()
  g.check(s.expedition.player.hp < s.expedition.player.maxHp, "Pest richtet Schaden an")
  await g.shot("x07-plague.png")
  // Long soak in the city at night: hordes, abilities, weather changes
  await page.evaluate(() => window.__lastKingdom.game.goToCamp())
  await g.frames(2)
  await page.evaluate(() => { const p = window.__lastKingdom.profile(); p.clearedBosses = ["city"]; window.__lastKingdom.game.startExpedition("city", true) })
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate(() => { window.__lastKingdom.setMaxFrame(0.5); window.__lastKingdom.godMode(true) })
  const before = (await g.snapshot()).expedition.zombies
  for (let i = 0; i < 6; i++) {
    await sim(25)
    await page.evaluate(() => { const e = window.__lastKingdom.game.expedition; const p = e.player.pos; window.__lastKingdom.teleport(p.x + (Math.random() - 0.5) * 60, p.z + (Math.random() - 0.5) * 60) })
  }
  s = await g.snapshot()
  console.log(`  Stadt bei Nacht nach 150 s: ${s.expedition.zombies} Zombies (Start ${before}), ${s.expedition.kills} Kills, Draw-Calls ${s.expedition.drawCalls}`)
  g.check(s.expedition.zombies >= before * 0.5, "Stadt-Soak ohne Abbruch")
  await g.shot("x08-city-night.png")
  const errs = g.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) console.log("  Konsolenfehler:", errs.join("\n"))
  g.check(errs.length === 0, `Keine Konsolenfehler (${errs.length})`)
  console.log("verify-stress: alles bestanden")
} catch (e) {
  console.error(e)
  await g.shot("x-error.png").catch(() => undefined)
  process.exitCode = 1
} finally {
  await g.close()
}
