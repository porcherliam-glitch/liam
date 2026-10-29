/**
 * enemies.test.ts — behaviour tests for EnemyManager (HostileManager for mercenaries) on a mocked world (boxes,
 * CollisionWorld, NavGrid) and for the posed hit zones of SoldierModel: detection, reaction delay, low cover, night,
 * noise, path finding, cover use, laser telegraph, flank token, alerts, squads, reinforcements, sleep beyond 130 m,
 * attract mode, corpses, explosions, dismemberment per GORE_RULES, melee body parts and determinism.
 */
import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { TIMES } from "./baseData"
import { CollisionWorld, type Obstacle } from "./collision"
import { DIFFICULTY } from "./data"
import { EnemyManager, SLEEP_DIST, type Merc } from "./enemies"
import { GoreSystem, type GoreLevel } from "./gore"
import type { BodyPartId, DamageInfo, HostileHit, HostileSound, PlayerState, ShotEvent } from "./hostiles"
import { NavGrid, type Bounds } from "./nav"
import { Obscurants } from "./obscurants"
import { acquireSoldierAssets, makeDrive, releaseSoldierAssets, SoldierModel } from "./soldier"
import type { EnemyKind, Vec2 } from "./types"
import type { CoverPoint, World } from "./world"
import { GORE_RULES } from "./zombies"
import type { ZoneLayout } from "./zone"

const box = (x: number, z: number, w: number, d: number, h: number): Obstacle => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h })

function mockWorld(o: { solids?: Obstacle[]; time?: "day" | "dusk" | "night"; bounds?: Bounds } = {}): World {
  const bounds = o.bounds ?? { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }
  const b = bounds, time = o.time ?? "day"
  const obstacles: Obstacle[] = [...(o.solids ?? []),
    { minX: b.minX - 8, maxX: b.minX, minZ: b.minZ - 8, maxZ: b.maxZ + 8, height: 6 }, { minX: b.maxX, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.maxZ + 8, height: 6 },
    { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.minZ, height: 6 }, { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.maxZ, maxZ: b.maxZ + 8, height: 6 }]
  const nav = new NavGrid(bounds, obstacles, 0.45, 1)
  const coverPoints: CoverPoint[] = []
  for (const s of o.solids ?? []) {
    if (s.height < 1) continue
    const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2
    for (const [nx, nz, x, z] of [[1, 0, s.maxX + 0.7, cz], [-1, 0, s.minX - 0.7, cz], [0, 1, cx, s.maxZ + 0.7], [0, -1, cx, s.minZ - 0.7]]) {
      if (nav.walkable(x, z)) coverPoints.push({ x, z, height: s.height, nx, nz })
    }
  }
  const layout: ZoneLayout = {
    kind: "zone", bounds, districts: [], solids: [], lootSpots: [], mercCamps: [], infectedZones: [], insertions: [], extractions: [],
    objectives: [], bossArena: { x: 0, z: 0, radius: 1 }, airdropSpots: [], labels: [],
  }
  return {
    kind: "zone", layout, time, theme: time === "night" ? "night" : "dusk", group: new THREE.Group(), obstacles, collision: new CollisionWorld(obstacles),
    nav, coverPoints, exposure: 1, lightLevel: 1, visionScale: TIMES[time].visionScale, night: time === "night", obscurants: new Obscurants(), weather: "clear", weatherVision: 1, setWeather() {}, onLightning: null, raining: false,
    surfaceAt: () => "asphalt", districtAt: () => null, indoor: () => false, update() {}, setExtraction() {}, setStructures() {}, dispose() {},
  }
}

function player(x: number, z: number, o: Partial<PlayerState> = {}): PlayerState {
  return { position: new THREE.Vector3(x, 0, z), eyeY: o.crouched ? 1.05 : 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: true, ...o }
}

interface Log {
  t: number; shots: Array<ShotEvent & { t: number }>; spotted: Array<{ id: number; t: number }>; died: Array<{ id: number; part: string; cause: string }>
  steps: number; sounds: Array<{ id: number; s: HostileSound }>
  gore: { wound: number; sever: BodyPartId[]; headshot: number; gib: number; pool: number }
}

/** A merc standing at (x, z) and facing toward (fx, fz). */
const guard = (x: number, z: number, fx: number, fz: number) => ({ x, z, patrol: [{ x, z }, { x: x + (fx - x) * 0.02, z: z + (fz - z) * 0.02 }] })

function setup(world: World, squad: Array<{ kind: EnemyKind; x: number; z: number; patrol: Vec2[] }>, seed = 1234, level: GoreLevel = "brutal") {
  const log: Log = { t: 0, shots: [], spotted: [], died: [], steps: 0, sounds: [], gore: { wound: 0, sever: [], headshot: 0, gib: 0, pool: 0 } }
  const gore = new GoreSystem(new THREE.Scene(), world.collision, level)
  const sever = gore.sever.bind(gore), headshot = gore.headshot.bind(gore), gib = gore.gib.bind(gore)
  gore.wound = () => { log.gore.wound++ }
  gore.sever = (part, imp, opts) => { log.gore.sever.push(part.name as BodyPartId); sever(part, imp, opts) }
  gore.headshot = (head, dir, opts) => { log.gore.headshot++; headshot(head, dir, opts) }
  gore.gib = (root, c, f, opts) => { log.gore.gib++; gib(root, c, f, opts) }
  gore.pool = () => { log.gore.pool++ }
  const m = new EnemyManager(world.group, world, {
    difficulty: "normal", seed, gore,
    events: {
      shoot: s => log.shots.push({ ...s, from: s.from.clone(), to: s.to.clone(), t: log.t }),
      died: (e, cause, part) => log.died.push({ id: e.id, cause, part }),
      spotted: e => log.spotted.push({ id: e.id, t: log.t }),
      footstep: () => { log.steps++ },
      sound: (e, s) => log.sounds.push({ id: e.id, s }),
    },
  })
  for (const s of squad) m.spawnSquad([s.kind], s.x, s.z, s.patrol)
  const run = (p: PlayerState, seconds: number, each?: () => void) => {
    const n = Math.round(seconds * 60)
    for (let i = 0; i < n; i++) { log.t += 1 / 60; m.update(1 / 60, p); each?.() }
  }
  return { m, log, run, gore }
}
const one = (kind: EnemyKind, g: { x: number; z: number; patrol: Vec2[] }) => ({ kind, ...g })
const near = (list: Merc[], x: number, z: number) => list.reduce((a, b) => Math.hypot(a.position.x - x, a.position.z - z) <= Math.hypot(b.position.x - x, b.position.z - z) ? a : b)
const dmg = (amount: number, from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, o: Partial<DamageInfo> = {}): DamageInfo =>
  ({ amount, from, dir, penetration: 0, kind: "bullet", sever: 0, ...o })
/** A ray from `from` at a world point; returns the hit. */
function shootAt(m: EnemyManager, from: THREE.Vector3, at: THREE.Vector3): HostileHit | null {
  return m.hitTest(from, at.clone().sub(from).normalize(), 100)
}

describe("perception and shooting", () => {
  it("spots a player in the open at 20 m and fires only after the reaction delay, from the muzzle", () => {
    const { m, log, run } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, 10))])
    const p = player(0, 20)
    run(p, 5)
    expect(log.spotted.length).toBe(1)
    expect(log.spotted[0].t).toBeLessThan(1.7)
    expect(log.shots.length).toBeGreaterThan(0)
    expect(log.shots[0].t - log.spotted[0].t).toBeGreaterThanOrEqual(DIFFICULTY.normal.reaction * 0.9 - 0.02)
    const e = m.enemies[0]
    for (const s of log.shots) {
      expect(s.source).toBe(e)
      expect(s.from.y).toBeGreaterThan(0.85); expect(s.from.y).toBeLessThan(1.8)
      expect(Math.hypot(s.from.x - e.position.x, s.from.z - e.position.z)).toBeLessThan(1.3)
      const lat = Math.hypot(s.to.x - p.position.x, s.to.z - p.position.z)
      if (s.hit) { expect(lat).toBeLessThan(0.35); expect(s.to.y).toBeGreaterThan(0.9); expect(s.to.y).toBeLessThan(1.75) }
      else expect(lat >= 0.55 || s.to.y > p.eyeY + 0.55).toBe(true)
      expect(s.damage).toBeCloseTo(11)
      expect(s.weapon).toBe("rifle")
    }
    expect(e.state).toBe("combat")
    expect(m.combatCount()).toBe(1)
  })

  it("does not see the player through a smoke cloud", () => {
    const world = mockWorld()
    world.obscurants.add(0, 10); world.obscurants.update(3)
    const { log, run } = setup(world, [one("rifleman", guard(0, 0, 0, 10))])
    run(player(0, 20), 4)
    expect(log.spotted.length).toBe(0)
    expect(log.shots.length).toBe(0)
  })
  it("a flashbang blinds a merc in combat: no shots for a few seconds", () => {
    const { m, log, run } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, 10))])
    const p = player(0, 20)
    run(p, 4)
    expect(log.shots.length).toBeGreaterThan(0)
    expect(m.stun({ x: 0, y: 0.4, z: 3 }, 12, 5)).toBe(1)
    const before = log.shots.length
    run(p, 2.5)
    expect(log.shots.length).toBe(before)
    run(p, 6)
    expect(log.shots.length).toBeGreaterThan(before)
  })
  it("does not see a crouched player behind low cover, but sees him standing", () => {
    const solids = [box(0, 15, 6, 0.4, 1.1)]
    const hidden = setup(mockWorld({ solids }), [one("rifleman", guard(0, 0, 0, 10))])
    hidden.run(player(0, 15.8, { crouched: true }), 6)
    expect(hidden.log.spotted.length).toBe(0)
    expect(hidden.log.shots.length).toBe(0)
    expect(hidden.m.enemies[0].state).not.toBe("combat")
    const visible = setup(mockWorld({ solids }), [one("rifleman", guard(0, 0, 0, 10))])
    visible.run(player(0, 15.8), 3)
    expect(visible.log.spotted.length).toBe(1)
  })

  it("sees much less at night (world.visionScale) unless the flashlight is on", () => {
    const dark = setup(mockWorld({ time: "night" }), [one("rifleman", guard(0, 0, 0, 10))])
    dark.run(player(0, 26), 4)
    expect(dark.log.spotted.length).toBe(0)
    const lit = setup(mockWorld({ time: "night" }), [one("rifleman", guard(0, 0, 0, 10))])
    lit.run(player(0, 26, { flashlight: true }), 4)
    expect(lit.log.spotted.length).toBe(1)
  })

  it("carries a weapon light at night that stops at walls (and none by day)", () => {
    const find = (e: Merc, name: string) => { let o: THREE.Object3D | null = null; e.group.traverse(c => { if (c.name === name) o = c }); return o as unknown as THREE.Object3D }
    const open = setup(mockWorld({ time: "night" }), [one("rifleman", guard(0, 0, 0, -10))])
    open.run(player(30, 30), 0.5)
    const free = find(open.m.enemies[0], "lightCone")
    expect(free.visible).toBe(true)
    expect(free.scale.z).toBeLessThan(1)
    const walled = setup(mockWorld({ time: "night", solids: [box(0, -0.7, 6, 0.15, 3)] }), [one("rifleman", guard(0, 0, 0, -10))])
    walled.run(player(30, 30), 0.5)
    expect(find(walled.m.enemies[0], "lightCone").scale.z).toBeLessThan(free.scale.z * 0.7)
    const day = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, -10))])
    day.run(player(30, 30), 0.2)
    expect(find(day.m.enemies[0], "lightCone").visible).toBe(false)
  })

  it("never shoots without line of sight from the muzzle", () => {
    const { log, run, m } = setup(mockWorld({ solids: [box(0, 12, 8, 0.6, 3)] }), [one("rifleman", guard(0, 0, 0, 10))])
    const e = m.enemies[0]
    m.applyDamage({ target: e, distance: 15, part: "limb", bodyPart: "legL", point: new THREE.Vector3() }, dmg(5, { x: 0, y: 1.6, z: 18 }, { x: 0, y: 0, z: -1 }))
    run(player(0, 18), 5)
    expect(log.shots.length).toBe(0)
  })

  it("marksmen show the laser for ~1 s before each shot", () => {
    const { m, log, run } = setup(mockWorld(), [one("marksman", guard(0, -10, 0, 0))])
    const e = m.enemies[0]
    let laserSince = -1
    const starts: number[] = []
    run(player(0, 30), 10, () => {
      if (e.brain.telegraph > 0 && laserSince < 0) laserSince = log.t
      if (e.brain.telegraph <= 0 && laserSince >= 0) { starts.push(laserSince); laserSince = -1 }
    })
    expect(log.shots.length).toBeGreaterThan(0)
    for (const s of log.shots) {
      const start = starts.filter(t => t <= s.t).pop()
      expect(start).toBeDefined()
      expect(s.t - start!).toBeGreaterThanOrEqual(0.98)
    }
  })

  it("stops shooting at a dead player and never acts in attract mode", () => {
    const a = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, 10))])
    const p = player(0, 15)
    a.run(p, 3)
    const n = a.log.shots.length
    p.alive = false
    a.run(p, 4)
    expect(a.log.shots.length).toBe(n)

    const b = setup(mockWorld(), [{ kind: "rifleman", x: 0, z: 0, patrol: [{ x: 0, z: 0 }, { x: 0, z: 8 }] }, one("scout", guard(3, 0, 3, 8))])
    const q = player(0, 5, { active: false })
    b.run(q, 10, () => { for (const e of b.m.enemies) expect(["patrol", "idle"]).toContain(e.state) })
    expect(b.log.shots.length).toBe(0)
    expect(b.log.spotted.length).toBe(0)
    expect(b.log.steps).toBeGreaterThan(0)
  })

  it("is deterministic for a given seed", () => {
    const go = () => {
      const s = setup(mockWorld({ solids: [box(6, 10, 2, 2, 1.2)] }), [one("rifleman", guard(0, 0, 0, 10)), one("scout", guard(-4, 2, 0, 10))], 99)
      s.run(player(0, 20, { speed: 2 }), 8)
      return s.log.shots.map(x => [x.t.toFixed(4), x.hit, x.to.x.toFixed(4), x.to.z.toFixed(4)].join())
    }
    const a = go(), b = go()
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(b)
  })
})

describe("states, squads and movement", () => {
  it("investigates a noise and walks around obstacles on the way", () => {
    const solids = [box(0, 10, 20, 1, 3)]
    const { m, run } = setup(mockWorld({ solids }), [one("rifleman", guard(0, 0, 0, -10))])
    const e = m.enemies[0]
    m.hearNoise({ x: 0, y: 1, z: 20 }, 50)
    expect(e.state).toBe("investigate")
    let minClear = Infinity
    run(player(30, -30), 16, () => {
      for (const o of solids) {
        const cx = Math.max(o.minX, Math.min(e.position.x, o.maxX)), cz = Math.max(o.minZ, Math.min(e.position.z, o.maxZ))
        minClear = Math.min(minClear, Math.hypot(e.position.x - cx, e.position.z - cz))
      }
    })
    expect(minClear).toBeGreaterThan(0.3)
    expect(Math.hypot(e.position.x - 0, e.position.z - 20)).toBeLessThan(10)
  })

  it("goes from suspicious to investigate when a footstep is heard but nothing is seen", () => {
    const { m, run } = setup(mockWorld(), [one("scout", guard(0, 0, 0, -10))])
    const e = m.enemies[0]
    m.hearNoise({ x: 0, y: 0, z: 6 }, 8)
    expect(e.state).toBe("suspicious")
    run(player(0, 6, { alive: false }), 3)
    expect(["investigate", "search", "patrol", "idle"]).toContain(e.state)
  })

  it("alerts allies within 25 m by radio when one merc spots the player", () => {
    const { m, run, log } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, 10)), one("rifleman", guard(12, -6, 12, -20))])
    const a = near(m.enemies, 0, 0), b = near(m.enemies, 12, -6)
    run(player(0, 18), 2.5)
    expect(a.state).toBe("combat")
    expect(["investigate", "combat"]).toContain(b.state)
    expect(b.awareness).toBeGreaterThan(0.5)
    expect(log.sounds.some(s => s.id === a.id && s.s === "radio")).toBe(true)
  })

  it("searches after losing the player and returns to patrol with raised awareness", () => {
    const { m, run } = setup(mockWorld({ solids: [box(0, 12, 12, 0.6, 3)] }), [one("scout", guard(0, 0, 0, 10))])
    const e = m.enemies[0]
    const p = player(-8, 13)
    run(p, 2)
    expect(e.state).toBe("combat")
    p.position.set(35, 0, -38)
    const seen = new Set<string>()
    run(p, 45, () => seen.add(e.state))
    expect(seen.has("search")).toBe(true)
    expect(["patrol", "idle"]).toContain(e.state)
    expect(e.brain.floor).toBeGreaterThan(0)
  })

  it("riflemen take low cover, crouch behind it and fire from it", () => {
    const { m, log, run } = setup(mockWorld({ solids: [box(2, 9.5, 3, 0.6, 1.1)] }), [one("rifleman", guard(0, 4, 0, 20))])
    const e = m.enemies[0]
    let reached = false, crouched = false
    run(player(0, 25), 8, () => {
      if (Math.hypot(e.position.x - 2, e.position.z - 8.5) < 0.6) reached = true
      if (reached && e.brain.crouch) crouched = true
    })
    expect(reached).toBe(true)
    expect(crouched).toBe(true)
    expect(log.shots.length).toBeGreaterThan(0)
  })

  it("lets at most one merc flank at a time when more than two fight", () => {
    const squad = [-4, -1.5, 1.5, 4].map(x => one("scout", guard(x, 0, x, 10)))
    const { m, run } = setup(mockWorld(), squad)
    let maxFlank = 0, fought = false
    run(player(0, 16), 12, () => {
      const fighting = m.enemies.filter(e => e.alive && e.state === "combat").length
      if (fighting > 2) { fought = true; maxFlank = Math.max(maxFlank, m.enemies.filter(e => e.state === "combat" && e.brain.mode === "flank").length) }
    })
    expect(fought).toBe(true)
    expect(maxFlank).toBeLessThanOrEqual(1)
    for (const e of m.enemies) expect(Math.hypot(e.position.x, e.position.z - 16)).toBeGreaterThan(1.1)
  })

  it("spawns a squad around the camp: patrollers walk the route, guards hold their posts", () => {
    const { m, run } = setup(mockWorld(), [])
    const route = [{ x: -10, z: 0 }, { x: 10, z: 0 }]
    m.spawnSquad(["rifleman", "scout", "heavy", "marksman"], 0, -10, route)
    expect(m.enemies.length).toBe(4)
    for (const e of m.enemies) { expect(Math.hypot(e.position.x, e.position.z + 10)).toBeLessThan(6); expect(e.faction).toBe("merc") }
    const start = m.enemies.map(e => e.position.clone())
    run(player(0, 38, { active: false }), 14)
    const moved = m.enemies.map((e, i) => e.position.distanceTo(start[i]))
    expect(moved[0]).toBeGreaterThan(5)          // patroller left its spawn for the route
    expect(moved[1]).toBeLessThan(0.5)           // guard stays at its post
  })

  it("sends reinforcements from the nearest map edge, alerted, toward the target", () => {
    const { m, run } = setup(mockWorld(), [])
    m.spawnReinforcements(["scout", "rifleman"], { x: 25, z: -10 })
    expect(m.enemies.length).toBe(2)
    for (const e of m.enemies) {
      expect(e.state).toBe("investigate"); expect(e.awareness).toBeGreaterThanOrEqual(0.8)
      expect(e.position.x).toBeGreaterThan(30)       // east edge is nearest to x = 25
    }
    run(player(-30, 30), 9)
    for (const e of m.enemies) expect(Math.hypot(e.position.x - 25, e.position.z + 10)).toBeLessThan(7)
  })

  it("sleeps beyond 130 m (hidden, frozen) and wakes when the player approaches", () => {
    const bounds = { minX: -200, maxX: 200, minZ: -40, maxZ: 40 }
    const { m, run } = setup(mockWorld({ bounds }), [{ kind: "rifleman", x: 0, z: 0, patrol: [{ x: 0, z: 0 }, { x: 0, z: 10 }] }])
    const e = m.enemies[0]
    const p = player(SLEEP_DIST + 20, 0)
    run(p, 0.1)
    expect(e.asleep).toBe(true)
    expect(e.group.visible).toBe(false)
    const at = e.position.clone()
    run(p, 6)
    expect(e.position.distanceTo(at)).toBe(0)       // camp merc does nothing while asleep
    expect(m.awakeCount).toBe(0)
    p.position.set(60, 0, 0)
    run(p, 0.1)
    expect(e.asleep).toBe(false)
    expect(e.group.visible).toBe(true)
    expect(m.awakeCount).toBe(1)
  })

  it("keeps busy mercs moving while asleep (reinforcements far from the player still arrive)", () => {
    const bounds = { minX: -200, maxX: 200, minZ: -40, maxZ: 40 }
    const { m, run } = setup(mockWorld({ bounds }), [])
    m.spawnReinforcements(["rifleman"], { x: -150, z: 0 })
    const e = m.enemies[0]
    run(player(150, 0), 30)
    expect(e.asleep).toBe(true)
    expect(Math.hypot(e.position.x + 150, e.position.z)).toBeLessThan(8)
  })
})

describe("hit zones", () => {
  const posed = (crouch = 0, velZ = 0, secs = 1) => {
    const assets = acquireSoldierAssets()
    const group = new THREE.Group(), model = new SoldierModel("rifleman", assets, 3)
    group.add(model.root)
    const drive = makeDrive(); drive.alert = 1; drive.crouch = crouch; drive.velZ = velZ
    for (let i = 0; i < secs * 60; i++) { model.update(1 / 60, drive); group.updateMatrixWorld(true); model.capture() }
    return { model, drive, done: () => { model.dispose(); releaseSoldierAssets() } }
  }
  const ray = (model: SoldierModel, x: number, y: number) => model.rayTest({ x, y, z: -10 }, { x: 0, y: 0, z: 1 }, 50)

  it("follow the pose (idle, walking, crouched)", () => {
    const { model, drive, done } = posed()
    const pose = (secs: number) => { for (let i = 0; i < secs * 60; i++) { model.update(1 / 60, drive); (model.root.parent as THREE.Object3D).updateMatrixWorld(true); model.capture() } }
    expect(ray(model, model.head.x, model.head.y)?.part).toBe("head")
    expect(ray(model, model.chestPos.x, model.chestPos.y)?.bodyPart).toBe("torso")
    expect(ray(model, model.kneeLPos.x, (model.hipLPos.y + model.kneeLPos.y) / 2)?.bodyPart).toBe("legL")
    expect(ray(model, model.ankleRPos.x, (model.kneeRPos.y + model.ankleRPos.y) / 2)?.bodyPart).toBe("legR")
    expect(ray(model, 0, 2.2)).toBeNull()
    const standingHead = model.head.y
    drive.velZ = -1.8; pose(0.8)
    expect(ray(model, model.head.x, model.head.y)?.part).toBe("head")
    expect(ray(model, model.chestPos.x, model.chestPos.y)?.part).toBe("body")
    drive.velZ = 0; drive.crouch = 1; pose(1.5)
    expect(model.head.y).toBeLessThan(standingHead - 0.35)
    expect(ray(model, model.head.x, model.head.y)?.part).toBe("head")
    expect(ray(model, model.head.x, standingHead)).toBeNull()
    expect(ray(model, model.chestPos.x, model.chestPos.y)?.part).toBe("body")
    done()
  })

  it("count the neck and upper chest as torso and only the head above the jaw as head", () => {
    const { model, done } = posed()
    const h = model.head, r = model.zones.head * model.scale
    // straight-on shots from the front at decreasing heights
    expect(ray(model, h.x, h.y + r * 0.6)?.bodyPart).toBe("head")      // forehead
    expect(ray(model, h.x, h.y)?.bodyPart).toBe("head")                 // face
    expect(ray(model, h.x, h.y - r * 0.8)?.bodyPart).toBe("torso")      // under the jaw / throat
    expect(ray(model, h.x, model.neckTop.y - 0.04)?.bodyPart).toBe("torso")
    for (const y of [model.neckBase.y + 0.05, model.neckBase.y, model.chestPos.y + 0.12]) expect(ray(model, model.chestPos.x, y)?.bodyPart).toBe("torso")
    // a steep shot from above aimed at the upper chest must not be stolen by the head sphere's lower part
    const from = { x: model.chestPos.x, y: model.chestPos.y + 4, z: model.chestPos.z - 3 }
    const to = { x: model.chestPos.x, y: model.chestPos.y + 0.1, z: model.chestPos.z }
    const l = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
    expect(model.rayTest(from, { x: (to.x - from.x) / l, y: (to.y - from.y) / l, z: (to.z - from.z) / l }, 50)?.bodyPart).toBe("torso")
    done()
  })
})

describe("damage, corpses and gore", () => {
  const from = new THREE.Vector3(0, 1.6, -12)

  it("applies armour to body hits only, kills, ignores corpses and lets them settle flat", () => {
    const { m, log, run } = setup(mockWorld(), [one("heavy", guard(0, 0, 0, -10))], 1234, "normal")
    const e = m.enemies[0]
    const hit = shootAt(m, from, e.chestPosition(new THREE.Vector3()))!
    expect(hit.part).toBe("body")
    expect(m.applyDamage(hit, dmg(40, from, { x: 0, y: 0, z: 1 })).dealt).toBeCloseTo(40 * (1 - 0.35))
    expect(m.applyDamage(hit, dmg(40, from, { x: 0, y: 0, z: 1 }, { penetration: 1 })).dealt).toBeCloseTo(40)
    const head = e.headPosition(new THREE.Vector3())
    const hh = shootAt(m, from, head)!
    expect(hh.part).toBe("head")
    const res = m.applyDamage(hh, dmg(500, from, { x: 0, y: 0, z: 1 }))
    expect(res.killed).toBe(true); expect(res.headshotKill).toBe(true)
    expect(res.severed).toBeNull()                           // gore level "normal": no head burst
    expect(log.died).toEqual([{ id: e.id, cause: "bullet", part: "head" }])
    expect(log.gore.wound).toBe(3); expect(log.gore.pool).toBe(1)
    expect(shootAt(m, from, head)).toBeNull()
    expect(m.aliveCount()).toBe(0)
    const pos = e.position.clone()
    run(player(30, 30), 2)
    expect(e.model!.settled).toBe(true)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.model!.root.quaternion)
    expect(Math.abs(up.y)).toBeLessThan(0.02)
    const restY = e.model!.root.position.y
    expect(restY).toBeGreaterThan(0.1); expect(restY).toBeLessThan(0.3)
    run(player(30, 30), 3)
    expect(e.model!.root.position.y).toBe(restY)
    expect(e.position.distanceTo(pos)).toBe(0)
  })

  it("explosions fall off linearly, are blocked by walls, report every death and gib close kills", () => {
    const solids = [box(0, -2, 6, 0.5, 3)]
    const { m, log } = setup(mockWorld({ solids }), [one("rifleman", guard(3, 0, 3, 5)), one("rifleman", guard(0, -4.5, 0, -10)), one("scout", guard(-6, 3, -6, 8))])
    const open = near(m.enemies, 3, 0), walled = near(m.enemies, 0, -4.5), far = near(m.enemies, -6, 3)
    expect(m.applyExplosion({ x: 0, y: 0.3, z: 0 }, 7, 100)).toEqual([])
    const d = Math.hypot(open.position.x, open.position.z)
    expect(open.health).toBeCloseTo(95 - 100 * (1 - d / 7), 5)
    expect(walled.health).toBe(95)
    // close kill: gibbed (brutal) and still reported
    expect(m.applyExplosion({ x: open.position.x + 1, y: 0.3, z: open.position.z }, 7, 300)).toEqual([open])
    expect(log.died.find(x => x.id === open.id)).toEqual({ id: open.id, cause: "explosion", part: "body" })
    expect(log.gore.gib).toBe(1)
    expect(open.group.visible).toBe(false)
    // kill beyond the gib radius: normal death, no gib
    const killed = m.applyExplosion({ x: far.position.x + 4.5, y: 0.3, z: far.position.z }, 7, 400)
    expect(killed).toEqual([far])
    expect(log.died.find(x => x.id === far.id)?.cause).toBe("explosion")
    expect(log.gore.gib).toBe(1)
    expect(m.inRadius({ x: 0, y: 0, z: 0 }, 10)).toEqual([walled])
  })

  it("severs a leg once it took GORE_RULES.limbHealth of max health — the merc collapses and dies", () => {
    const { m, log } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, -10))])
    const e = m.enemies[0], mm = e.model!
    const thigh = mm.hipLPos.clone().lerp(mm.kneeLPos, 0.5)
    const hit = shootAt(m, from, thigh)!
    expect(hit.bodyPart).toBe("legL")
    const first = m.applyDamage(hit, dmg(20, from, { x: 0, y: 0, z: 1 }))
    expect(first.severed).toBeNull(); expect(first.killed).toBe(false)
    expect(20 + 20).toBeGreaterThanOrEqual(GORE_RULES.limbHealth * e.maxHealth)
    const second = m.applyDamage(shootAt(m, from, thigh)!, dmg(20, from, { x: 0, y: 0, z: 1 }))
    expect(second.severed).toBe("legL")
    expect(second.killed).toBe(true)
    expect(e.gore.severed.has("legL")).toBe(true)
    expect(log.gore.sever).toEqual(["thighL"])
    expect(mm.parts.legL.visible).toBe(false)
    expect(log.died[0]).toEqual({ id: e.id, cause: "bullet", part: "limb" })
  })

  it("an arm severed by a blade: the weapon drops, the merc flees screaming, never shoots and bleeds out", () => {
    const { m, log, run } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, 10))])
    const e = m.enemies[0]
    const p = player(0, 12)
    run(p, 2.5)
    expect(e.state).toBe("combat")
    const shots = log.shots.length
    const mm = e.model!
    const arm = mm.shoulderRPos.clone().lerp(mm.elbowRPos, 0.5)
    const swing = m.meleeTest(new THREE.Vector3(arm.x + 1.2, arm.y, arm.z), new THREE.Vector3(-1, 0, 0), 2, 60, 1)
    expect(swing.length).toBe(1)
    const hit = { ...swing[0], part: "limb" as const, bodyPart: "armR" as const, point: arm }
    const r = m.applyDamage(hit, dmg(25, p.position, { x: -1, y: 0, z: 0 }, { kind: "melee", sever: 1 }))
    expect(r.severed).toBe("armR"); expect(r.killed).toBe(false)
    expect(mm.unarmed).toBe(true)
    expect(e.state).toBe("flee")
    expect(log.sounds.some(s => s.id === e.id && s.s === "scream")).toBe(true)
    // severed parts are ignored by hit tests
    expect(shootAt(m, new THREE.Vector3(arm.x + 6, arm.y, arm.z), arm)?.bodyPart ?? "none").not.toBe("armR")
    const d0 = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z)
    run(p, 3)
    expect(log.shots.length).toBe(shots)
    expect(Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z)).toBeGreaterThan(d0 + 3)
    run(p, 20)
    expect(e.alive).toBe(false)
    expect(log.died).toEqual([{ id: e.id, cause: "melee", part: "limb" }])
  })

  it("bursts the head on a heavy head hit (≥ GORE_RULES.headBurst) and on killing head hits ≥ 60 % max health", () => {
    const a = setup(mockWorld(), [one("heavy", guard(0, 0, 0, -10))])
    const e = a.m.enemies[0]
    const r = a.m.applyDamage(shootAt(a.m, from, e.headPosition(new THREE.Vector3()))!, dmg(GORE_RULES.headBurst, from, { x: 0, y: 0, z: 1 }))
    expect(r).toEqual({ killed: true, dealt: GORE_RULES.headBurst, severed: "head", headshotKill: true })
    expect(a.log.gore.headshot).toBe(1)
    expect(e.gore.severed.has("head")).toBe(true)
    const b = setup(mockWorld(), [one("scout", guard(0, 0, 0, -10))])
    const s = b.m.enemies[0]
    const small = b.m.applyDamage(shootAt(b.m, from, s.headPosition(new THREE.Vector3()))!, dmg(30, from, { x: 0, y: 0, z: 1 }))
    expect(small.severed).toBeNull(); expect(small.killed).toBe(false)
    const lethal = b.m.applyDamage(shootAt(b.m, from, s.headPosition(new THREE.Vector3()))!, dmg(0.6 * s.maxHealth, from, { x: 0, y: 0, z: 1 }))
    expect(lethal.killed).toBe(true); expect(lethal.severed).toBe("head")
  })

  it("never dismembers unless the gore level is brutal", () => {
    const { m, log } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, -10))], 1234, "normal")
    const e = m.enemies[0], mm = e.model!
    const thigh = mm.hipLPos.clone().lerp(mm.kneeLPos, 0.5)
    for (let i = 0; i < 3; i++) m.applyDamage(shootAt(m, from, thigh)!, dmg(20, from, { x: 0, y: 0, z: 1 }, { sever: 1 }))
    expect(e.gore.severed.size).toBe(0)
    expect(log.gore.sever.length + log.gore.headshot).toBe(0)
    expect(mm.parts.legL.visible).toBe(true)
  })

  it("melee picks the body part by aim height and respects range and arc", () => {
    const { m } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, -10))])
    const e = m.enemies[0], mm = e.model!
    const swingAt = (y: number) => {
      const origin = new THREE.Vector3(0, 1.4, -1.5), target = new THREE.Vector3(0, y, 0)
      return m.meleeTest(origin, target.sub(origin).normalize(), 2, 70, 3)
    }
    expect(swingAt(mm.head.y)[0].bodyPart).toBe("head")
    expect(swingAt(mm.chestPos.y)[0].bodyPart).toBe("torso")
    expect(swingAt(mm.chestPos.y)[0].part).toBe("body")
    expect(["legL", "legR"]).toContain(swingAt(0.55)[0].bodyPart)
    expect(swingAt(0.55)[0].part).toBe("limb")
    // out of range / behind the swing
    expect(m.meleeTest(new THREE.Vector3(0, 1.4, -4), new THREE.Vector3(0, 0, 1), 2, 70, 3)).toEqual([])
    expect(m.meleeTest(new THREE.Vector3(0, 1.4, -1.5), new THREE.Vector3(0, 0, -1), 2, 70, 3)).toEqual([])
  })

  it("being shot puts an unaware merc into combat facing the attacker", () => {
    const { m, run } = setup(mockWorld(), [one("rifleman", guard(0, 0, 0, -10))])
    const e = m.enemies[0]
    const at = new THREE.Vector3(0, 1.6, 15)
    m.applyDamage(shootAt(m, at, e.chestPosition(new THREE.Vector3()))!, dmg(10, at, { x: 0, y: 0, z: -1 }))
    expect(e.state).toBe("combat")
    run(player(0, 15), 1.5)
    expect(Math.abs(Math.atan2(Math.sin(e.yaw - Math.PI), Math.cos(e.yaw - Math.PI)))).toBeLessThan(0.5)
  })
})
