// Balance runs: the automated player plays scenarios and reports kills, damage, loot and outcome.
// Usage: node scripts/balance.mjs [area] [class] [difficulty] [seconds] [level|auto] [gear]
//   level: character level (default "auto" = the area's unlock level)
//   gear: comma-separated item ids equipped before the run, e.g. longsword_2,armor_chain
import { openGame } from "./browser-lib.mjs"

const area = process.argv[2] ?? "village"
const cls = process.argv[3] ?? "knight"
const difficulty = process.argv[4] ?? "normal"
const seconds = parseInt(process.argv[5] ?? "300", 10)
const levelArg = process.argv[6] ?? "auto"
const gear = (process.argv[7] ?? "").split(",").map((s) => s.trim()).filter(Boolean)

const g = await openGame({ settings: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, quality: "low", shadows: false, showFps: false, cameraShake: false, difficulty } })
const page = g.page
try {
  await g.click("characters"); await g.click("new"); await page.fill("#char-name", "Bot"); await g.click("class", `[data-id="${cls}"]`); await g.click("create")
  const level = await page.evaluate(({ area, levelArg, gear }) => {
    const h = window.__lastKingdom
    const p = h.profile()
    p.unlockedAreas = ["village", "forest", "castle", "graveyard", "monastery", "catacombs", "city", "fortress"]
    const fallback = { village: 1, forest: 3, castle: 6, graveyard: 8, monastery: 10, catacombs: 12, city: 15, fortress: 18 }
    const unlock = h.areas ? h.areas().find((a) => a.id === area)?.unlockLevel : fallback[area]
    const lvl = levelArg === "auto" ? (unlock ?? 1) : parseInt(levelArg, 10)
    p.level = Math.max(1, lvl)
    p.skillPoints = p.level - 1
    for (const id of gear) h.equipItem(id)
    h.equipItem("potion_small", "quick1")
    h.game.startExpedition(area)
    return p.level
  }, { area, levelArg, gear })
  console.log(`  level=${level} gear=${gear.join(",") || "-"}`)
  await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
  await page.evaluate((s) => { window.__lastKingdom.setMaxFrame(0.5); window.__lastKingdom.startBot({ lootGoal: 8, maxSeconds: s }) }, seconds)
  const t0 = Date.now()
  let last = 0
  while (true) {
    await page.waitForTimeout(4000)
    const st = await page.evaluate(() => window.__lastKingdom.botStats())
    const snap = await g.snapshot()
    if (!st) break
    if (Math.floor(st.seconds / 30) !== last) {
      last = Math.floor(st.seconds / 30)
      console.log(`  t=${Math.round(st.seconds)}s hp=${snap.expedition ? Math.round(snap.expedition.player.hp) : "-"} kills=${st.kills} dmg=${Math.round(st.damageTaken)} container=${st.containers} items=${st.items} gold=${st.gold} state=${snap.state}/${snap.screen}`)
    }
    if (st.done || snap.state !== "expedition" || Date.now() - t0 > 1500000) {
      const final = (await page.evaluate(() => window.__lastKingdom.botStats())) ?? st
      console.log(`RESULT ${area} ${cls} ${difficulty} L${level}: ${JSON.stringify({ ...final, outcome: snap.state !== "expedition" && final.outcome === "running" ? "extracted" : final.outcome })}`)
      break
    }
  }
  await g.shot(`b-${area}-${cls}.png`)
  const errs = g.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) console.log("  Konsolenfehler:", errs.slice(0, 5).join("\n"))
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  await g.close()
}
