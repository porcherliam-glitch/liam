// verify-systems.mjs — the economy and raid systems in the real build: trader, packing, armory, crafting, building,
// contracts; in a raid: killing infected, searching a container (hold E → loot window → take all), healing,
// extracting through a paid exit; a lost raid keeps only the secure container; a reload mid-raid counts as lost;
// a base defence. Usage: npm run build && npm run verify:systems
import { openGame, richProfile } from "./browser-lib.mjs"

const g = await openGame({ profile: richProfile() })
const { page, check } = g
const api = (fn, arg) => page.evaluate(fn, arg)
const profile = () => g.profile()
const count = async id => (await profile()).stash[id] ?? 0
try {
  // ── base screens ──
  await g.action("trader"); await g.action("trader-tab", "supply")
  const money0 = (await profile()).money, band0 = await count("bandage")
  await g.action("buy", "bandage")
  check(await count("bandage") === band0 + 1 && (await profile()).money < money0, "Händler: Verband gekauft")
  await g.action("trader-tab", "sell")
  await g.action("inventory")
  await g.action("unpack-all")
  check((await profile()).loadout.bag.length === 0, "Rucksack ausgepackt")
  await g.action("quick-pack")
  const bag = (await profile()).loadout.bag
  check(bag.some(s => s.id === "ammo_556") && bag.some(s => s.id === "bandage"), `Schnell packen: Munition und Verbände (${bag.length} Plätze)`)
  await api(() => window.__ironVeil.grant("gold", 2))
  await g.action("stash-filter", "valuable")
  await g.action("pack-secure", "gold")
  check((await profile()).loadout.secure.some(s => s.id === "gold"), "Wertsache im sicheren Behälter")
  await g.action("armory")
  await g.action("attach", "att_reddot")
  check((await profile()).loadout.primaryMods.optic === "att_reddot", "Waffenwerkstatt: Rotpunktvisier montiert")
  await g.action("crafting"); await g.action("craft-station", "workbench")
  await g.action("craft", "bandage")
  check((await profile()).crafting.length === 1, "Werkbank stellt Verbände her")
  await g.action("build")
  const walls = (await profile()).structures.walls
  await g.action("build-structure", "walls")
  check((await profile()).structures.walls === walls + 1, "Schutzwall ausgebaut")
  await g.action("radio")
  const offers = (await profile()).contracts.offers
  check(offers.length >= 3, `Funk: ${offers.length} Auftragsangebote`)
  await page.locator('button[data-action="accept"]').first().click(); await page.waitForTimeout(100)
  check((await profile()).contracts.active.length === 1, "Auftrag angenommen")
  await g.shot("sys-01-radio.png")

  // ── raid: combat, loot, healing, extraction ──
  await g.action("deploy")
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
  check((await profile()).raidStarted > 0 && (await profile()).loadout.primary === null, "Ausrüstung ist im Einsatz (nicht mehr im Lager)")
  await api(() => window.__ironVeil.godMode(true))
  await api(() => window.__ironVeil.spawnInfected("walker", 9)); await g.frames(3)
  // only the spawned walker counts: the zone may hold other infected far away
  const nearInfected = () => api(() => { const t = window.__ironVeil.nearest("infected"), p = window.__ironVeil.snapshot().player; return t && Math.hypot(t.x - p.x, t.z - p.z) < 25 ? t : null })
  for (let i = 0; i < 12; i++) {
    const t = await nearInfected()
    if (!t) break
    await api(t => window.__ironVeil.aimAt(t.chest.x, t.chest.y, t.chest.z), t)
    await page.mouse.move(640, 360); await page.mouse.down(); await g.frames(4); await page.mouse.up(); await g.frames(3)
  }
  const left = await nearInfected()
  check(!left, `Infizierter erledigt${left ? ` (noch ${left.kind} mit ${left.health} LP)` : ""}`)
  await g.shot("sys-02-kill.png")
  // container: teleport next to the nearest one, look at it, hold E
  const box = await api(() => { const p = window.__ironVeil.snapshot().player; return window.__ironVeil.containers().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] })
  await api(b => { window.__ironVeil.teleport(b.x + 1.3, b.z); window.__ironVeil.lookAt(b.x, b.z, 0.4) }, box)
  await g.until(() => window.__ironVeil.snapshot().hud?.interaction?.includes("durchsuchen"))
  await page.keyboard.down("KeyE")
  await g.until(() => window.__ironVeil.screen() === "loot", null, 30000)
  await page.keyboard.up("KeyE")
  check(true, `Behälter durchsucht (${box.kind})`)
  await g.shot("sys-03-loot.png")
  await g.action("loot-all")
  await page.keyboard.press("KeyE")
  await g.until(() => window.__ironVeil.screen() === "playing")
  check(true, "Beutefenster mit E geschlossen")
  // healing (god mode stays on: it only blocks hits, so a stray infected cannot undo the heal being measured)
  await api(() => window.__ironVeil.damage(40)); await g.frames(2)
  const hurt = (await g.snapshot()).health
  await page.keyboard.press("KeyQ")
  await g.until(h => window.__ironVeil.snapshot().health > h, hurt, 30000)
  check(true, `Q heilt (${Math.round(hurt)} → ${Math.round((await g.snapshot()).health)})`)
  // extraction through the paid border post (instant after holding E)
  const exits = await api(() => window.__ironVeil.exits())
  const gate = exits.find(e => e.kind === "gate") ?? exits.find(e => !e.requirement)
  await api(e => { window.__ironVeil.teleport(e.x, e.z) }, gate)
  await g.until(() => window.__ironVeil.snapshot().hud?.interaction?.includes("halten"))
  await page.keyboard.down("KeyE")
  await g.until(() => window.__ironVeil.screen() === "result" || window.__ironVeil.snapshot().hud?.extraction > 0, null, 60000)
  await page.keyboard.up("KeyE")
  await g.until(() => window.__ironVeil.screen() === "result", null, 120000)
  const p1 = await profile()
  check(p1.raidStarted === 0 && p1.loadout.primary === "mk4", `Extraktion über ${gate.id}: Ausrüstung zurück`)
  check((p1.stash.gold ?? 0) >= 2, "Sicherer Behälter ins Lager")
  check(p1.stats.infectedKills >= 1 && p1.stats.extracts === 3, "Statistik: Infizierte und Extraktionen")
  await g.shot("sys-04-result.png")

  // ── lost raid: only the secure container survives ──
  await g.action("menu")
  await g.action("inventory")
  await g.action("stash-filter", "valuable")
  await api(() => window.__ironVeil.grant("watch", 1))
  await g.action("stash-filter", "valuable")
  await g.action("pack-secure", "watch")
  await g.action("pack", "gold")
  await api(() => window.__ironVeil.deploy({ time: "day" }))
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
  await api(() => window.__ironVeil.damage(500))
  await g.until(() => window.__ironVeil.screen() === "result", null, 60000)
  const p2 = await profile()
  check(p2.loadout.primary === null && (p2.stash.watch ?? 0) >= 1, "Tod: Waffen weg, sicherer Behälter (Uhr) bleibt")
  check((p2.stash.gold ?? 0) === (p1.stash.gold ?? 0) - 1, "Tod: Rucksack-Beute verloren")

  // ── reload during a raid counts as lost ──
  await g.action("menu")
  await g.action("inventory")
  await g.action("stash-filter", "weapon")
  await g.action("equip-weapon", "kv12")
  await api(() => window.__ironVeil.deploy({ time: "day" }))
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
  await g.reload()
  const p3 = await profile()
  check(p3.raidStarted === 0 && p3.loadout.primary === null && p3.stats.deaths === p2.stats.deaths + 1, "Neuladen im Einsatz zählt als verloren")

  // ── base defence ──
  await api(() => window.__ironVeil.grant("w_mk4", 1))
  await api(() => window.__ironVeil.setThreat(80, true))
  await g.reload()
  await g.action("inventory"); await g.action("stash-filter", "weapon"); await g.action("equip-weapon", "mk4"); await g.action("quick-pack")
  await g.action("menu")
  check(await page.locator(".attack-banner").count() === 1, "Hauptmenü warnt vor dem Angriff")
  await g.action("attack")
  check((await g.snapshot()).screen === "attack", "Angriffsbildschirm")
  await g.action("defend")
  await g.until(() => window.__ironVeil.snapshot().mode === "defense", null, 60000)
  await api(() => window.__ironVeil.godMode(true))
  await g.until(() => (window.__ironVeil.defense()?.wave ?? 0) >= 1, null, 60000)
  for (let i = 0; i < 180 && (await g.snapshot()).mode === "defense"; i++) { await api(() => window.__ironVeil.killAllInfected()); await page.waitForTimeout(1000) }
  await g.until(() => window.__ironVeil.screen() === "menu", null, 120000)
  const p4 = await profile()
  check(!p4.base.attackPending && p4.stats.defenses === 1, "Basis verteidigt (3 Wellen)")
  check(g.errors.length === 0, `Keine Fehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("SYSTEMSVERIFY OK")
} finally { await g.close() }
