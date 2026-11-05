// Builds every area once, checks population, containers, extraction points and takes a screenshot of each.
import { openGame } from "./browser-lib.mjs"
import { AREAS } from "./areas-list.mjs"

const g = await openGame()
const page = g.page
try {
  await g.click("characters")
  await g.click("new")
  await g.click("create")
  await page.evaluate((ids) => {
    const p = window.__lastKingdom.profile()
    p.unlockedAreas = ids
    p.level = 25
    window.__lastKingdom.game.saveProfile()
  }, AREAS)
  for (const id of AREAS) {
    const t0 = Date.now()
    await page.evaluate((id) => window.__lastKingdom.game.startExpedition(id), id)
    await page.waitForFunction(() => window.__lastKingdom.snapshot().expedition !== null, null, { timeout: 180000 })
    await page.evaluate(() => {
      window.__lastKingdom.setMaxFrame(0.5)
      window.__lastKingdom.setHour(13)
      window.__lastKingdom.setWeather("clear")
      window.__lastKingdom.godMode(true)
    })
    await g.frames(4)
    const s = (await g.snapshot()).expedition
    const build = Date.now() - t0
    console.log(`  ${id}: ${s.zombies} Zombies, ${s.containers} Container, ${s.extractions.length} Extraktionen, ${s.drawCalls} Draw-Calls, ${s.triangles} Dreiecke, Aufbau ${build} ms`)
    g.check(s.zombies >= 20, `${id}: bevölkert`)
    g.check(s.containers >= 15, `${id}: Beute vorhanden`)
    g.check(s.extractions.length >= 3, `${id}: Extraktionspunkte`)
    g.check(s.drawCalls < 1500, `${id}: Draw-Calls im Rahmen (${s.drawCalls})`)
    // Player must stand on free ground and be able to move
    const p0 = s.player
    await g.hold("KeyW", 2.5)
    const p1 = (await g.snapshot()).expedition.player
    g.check(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, `${id}: Startplatz begehbar`)
    // Boss reachable: nav path from spawn to the boss arena
    const path = await page.evaluate(() => {
      const e = window.__lastKingdom.game.expedition
      const r = e.world.nav.findPath(e.world.playerSpawn.x, e.world.playerSpawn.z, e.world.bossArena.x, e.world.bossArena.z, 400000)
      return r ? r.length : null
    })
    g.check(path !== null, `${id}: Weg vom Start zum Boss gefunden (${path} Wegpunkte)`)
    // every extraction reachable, and the beacon itself must not sit inside a collider (prompt radius 3.2 m)
    const ex = await page.evaluate(() => {
      const e = window.__lastKingdom.game.expedition
      return e.world.extractions.map((x) => {
        const nav = e.world.nav
        const path = nav.findPath(e.world.playerSpawn.x, e.world.playerSpawn.z, x.x, x.z, 400000)
        // nearest walkable cell to the beacon: must be close enough for the 3.2 m prompt radius
        const cell = nav.nearestFree(x.x, x.z)
        const w = cell ? nav.toWorld(cell[0], cell[1]) : null
        const freeDist = w ? Math.round(Math.hypot(w[0] - x.x, w[1] - x.z) * 10) / 10 : null
        return { id: x.def.id, ok: !!path, freeDist }
      })
    })
    for (const x of ex) {
      g.check(x.ok, `${id}: Extraktion ${x.id} erreichbar`)
      g.check(x.freeDist !== null && x.freeDist <= 1.5, `${id}: Extraktion ${x.id} frei begehbar (nächste freie Zelle ${x.freeDist} m vom Punkt)`)
    }
    await g.shot(`w-${id}.png`)
    await page.evaluate(() => window.__lastKingdom.game.goToCamp())
    await g.frames(2)
  }
  const errs = g.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) console.log("  Konsolenfehler:", errs.join("\n"))
  g.check(errs.length === 0, `Keine Konsolenfehler (${errs.length})`)
  console.log("verify-worlds: alles bestanden")
} catch (e) {
  console.error(e)
  await g.shot("w-error.png").catch(() => undefined)
  process.exitCode = 1
} finally {
  await g.close()
}
