/**
 * enemies.test.ts — behaviour tests for EnemyManager on a mocked world (simple boxes + NavGrid) and for the posed hit
 * zones of SoldierModel: detection, reaction delay, low cover, noise, path finding, cover use, laser telegraph,
 * flank token, alerts, reinforcements, attract mode, corpses, explosions and determinism.
 */
import * as THREE from "three"
import { describe, expect, it } from "vitest"
import type { Obstacle } from "./collision"
import { DIFFICULTY } from "./data"
import { EnemyManager, type Enemy, type EnemyShot, type PlayerState } from "./enemies"
import type { EnemySpawn, MapLayout } from "./maps"
import { NavGrid } from "./nav"
import { acquireSoldierAssets, makeDrive, releaseSoldierAssets, SoldierModel } from "./soldier"
import type { EnemyKind, ThemeId, Vec2 } from "./types"
import type { CoverPoint, World } from "./world"

const box = (x: number, z: number, w: number, d: number, h: number): Obstacle => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h })

function mockWorld(o: { solids?: Obstacle[]; spawns?: EnemySpawn[]; theme?: ThemeId; reinforcements?: Vec2[] } = {}): World {
  const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }
  const obstacles: Obstacle[] = [...(o.solids ?? []),
    { minX: -48, maxX: -40, minZ: -48, maxZ: 48, height: 6 }, { minX: 40, maxX: 48, minZ: -48, maxZ: 48, height: 6 },
    { minX: -48, maxX: 48, minZ: -48, maxZ: -40, height: 6 }, { minX: -48, maxX: 48, minZ: 40, maxZ: 48, height: 6 }]
  const nav = new NavGrid(bounds, obstacles, 0.45, 1)
  const coverPoints: CoverPoint[] = []
  for (const b of o.solids ?? []) {
    if (b.height < 1) continue
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2
    for (const [nx, nz, x, z] of [[1, 0, b.maxX + 0.7, cz], [-1, 0, b.minX - 0.7, cz], [0, 1, cx, b.maxZ + 0.7], [0, -1, cx, b.minZ - 0.7]]) {
      if (nav.walkable(x, z)) coverPoints.push({ x, z, height: b.height, nx, nz })
    }
  }
  const layout: MapLayout = {
    id: "greyzone", bounds, solids: [], playerSpawns: [{ x: 0, z: 30, yaw: 0 }], lootSpawns: [], enemySpawns: o.spawns ?? [],
    extractions: [], reinforcementSpawns: o.reinforcements ?? [{ x: 0, z: -36 }],
  }
  return {
    layout, theme: o.theme ?? "dusk", group: new THREE.Group(), obstacles, nav, coverPoints, exposure: 1,
    surfaceAt: () => "asphalt", update() {}, setExtraction() {}, dispose() {},
  }
}

function player(x: number, z: number, o: Partial<PlayerState> = {}): PlayerState {
  return { position: new THREE.Vector3(x, 0, z), eyeY: o.crouched ? 1.05 : 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: true, ...o }
}

interface Log { t: number; shots: Array<EnemyShot & { t: number }>; spotted: Array<{ id: number; t: number }>; died: Array<{ id: number; part: string; cause: string }>; steps: number }

function setup(world: World, roster: EnemyKind[], seed = 1234, difficulty: "easy" | "normal" | "hard" = "normal") {
  const log: Log = { t: 0, shots: [], spotted: [], died: [], steps: 0 }
  const m = new EnemyManager(world.group, world, {
    difficulty, seed,
    events: {
      shoot: s => log.shots.push({ ...s, from: s.from.clone(), to: s.to.clone(), t: log.t }),
      died: (e, cause, part) => log.died.push({ id: e.id, cause, part }),
      spotted: e => log.spotted.push({ id: e.id, t: log.t }),
      footstep: () => { log.steps++ },
    },
  })
  m.spawn(roster)
  const run = (p: PlayerState, seconds: number, each?: () => void) => {
    const n = Math.round(seconds * 60)
    for (let i = 0; i < n; i++) { log.t += 1 / 60; m.update(1 / 60, p); each?.() }
  }
  return { m, log, run }
}

const near = (list: Enemy[], x: number, z: number) => list.reduce((a, b) => Math.hypot(a.position.x - x, a.position.z - z) <= Math.hypot(b.position.x - x, b.position.z - z) ? a : b)
const spawnAt = (x: number, z: number, faceX: number, faceZ: number): EnemySpawn => ({ x, z, patrol: [{ x, z }, { x: faceX, z: faceZ }] })
const guardAt = (x: number, z: number, faceX: number, faceZ: number): EnemySpawn => ({ x, z, patrol: [{ x, z }, { x: x + (faceX - x) * 0.02, z: z + (faceZ - z) * 0.02 }] })

describe("perception and shooting", () => {
  it("spots a player in the open at 20 m and fires only after the reaction delay, from the muzzle", () => {
    const world = mockWorld({ spawns: [guardAt(0, 0, 0, 10)] })
    const { m, log, run } = setup(world, ["rifleman"])
    const p = player(0, 20)
    run(p, 5)
    expect(log.spotted.length).toBe(1)
    expect(log.spotted[0].t).toBeLessThan(1.7)
    expect(log.shots.length).toBeGreaterThan(0)
    const first = log.shots[0]
    expect(first.t - log.spotted[0].t).toBeGreaterThanOrEqual(DIFFICULTY.normal.reaction * 0.9 - 0.02)
    const e = m.enemies[0]
    for (const s of log.shots) {
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

  it("does not see a crouched player behind low cover, but sees him standing", () => {
    const solids = [box(0, 15, 6, 0.4, 1.1)]
    const hidden = setup(mockWorld({ solids, spawns: [guardAt(0, 0, 0, 10)] }), ["rifleman"])
    hidden.run(player(0, 15.8, { crouched: true }), 6)
    expect(hidden.log.spotted.length).toBe(0)
    expect(hidden.log.shots.length).toBe(0)
    expect(hidden.m.enemies[0].state).not.toBe("combat")
    const visible = setup(mockWorld({ solids, spawns: [guardAt(0, 0, 0, 10)] }), ["rifleman"])
    visible.run(player(0, 15.8), 3)
    expect(visible.log.spotted.length).toBe(1)
  })

  it("sees much less at night unless the flashlight is on", () => {
    const dark = setup(mockWorld({ theme: "night", spawns: [guardAt(0, 0, 0, 10)] }), ["rifleman"])
    dark.run(player(0, 26), 4)
    expect(dark.log.spotted.length).toBe(0)
    const lit = setup(mockWorld({ theme: "night", spawns: [guardAt(0, 0, 0, 10)] }), ["rifleman"])
    lit.run(player(0, 26, { flashlight: true }), 4)
    expect(lit.log.spotted.length).toBe(1)
  })

  it("carries a weapon light at night that stops at walls (and none at dusk)", () => {
    const find = (e: Enemy, name: string) => { let o: THREE.Object3D | null = null; e.group.traverse(c => { if (c.name === name) o = c }); return o as unknown as THREE.Object3D }
    const open = setup(mockWorld({ theme: "night", spawns: [guardAt(0, 0, 0, -10)] }), ["rifleman"])
    open.run(player(30, 30), 0.5)
    const free = find(open.m.enemies[0], "lightCone")
    expect(free.visible).toBe(true)
    expect(free.scale.z).toBeLessThan(1)          // the lowered beam ends on the ground
    const walled = setup(mockWorld({ theme: "night", solids: [box(0, -0.7, 6, 0.15, 3)], spawns: [guardAt(0, 0, 0, -10)] }), ["rifleman"])
    walled.run(player(30, 30), 0.5)
    expect(find(walled.m.enemies[0], "lightCone").scale.z).toBeLessThan(free.scale.z * 0.7) // and earlier at a wall
    const dusk = setup(mockWorld({ spawns: [guardAt(0, 0, 0, -10)] }), ["rifleman"])
    dusk.run(player(30, 30), 0.2)
    expect(find(dusk.m.enemies[0], "lightCone").visible).toBe(false)
  })

  it("never shoots without line of sight from the muzzle", () => {
    // player standing behind a tall wall: seen nowhere, shot never
    const { log, run, m } = setup(mockWorld({ solids: [box(0, 12, 8, 0.6, 3)], spawns: [guardAt(0, 0, 0, 10)] }), ["rifleman"])
    m.applyDamage({ enemy: m.enemies[0], distance: 15, part: "limb", point: new THREE.Vector3() }, 5, { x: 0, y: 1.6, z: 18 })
    run(player(0, 18), 5)
    expect(log.shots.length).toBe(0)
  })

  it("marksmen show the laser for ~1 s before each shot", () => {
    const { m, log, run } = setup(mockWorld({ spawns: [guardAt(0, -10, 0, 0)] }), ["marksman"])
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
    const a = setup(mockWorld({ spawns: [guardAt(0, 0, 0, 10)] }), ["rifleman"])
    const p = player(0, 15)
    a.run(p, 3)
    const n = a.log.shots.length
    p.alive = false
    a.run(p, 4)
    expect(a.log.shots.length).toBe(n)

    const b = setup(mockWorld({ spawns: [spawnAt(0, 0, 0, 8)] }), ["rifleman", "scout"])
    const q = player(0, 5, { active: false })
    b.run(q, 10, () => { for (const e of b.m.enemies) expect(["patrol", "idle"]).toContain(e.state) })
    expect(b.log.shots.length).toBe(0)
    expect(b.log.spotted.length).toBe(0)
    expect(b.log.steps).toBeGreaterThan(0)
  })

  it("is deterministic for a given seed", () => {
    const go = () => {
      const s = setup(mockWorld({ solids: [box(6, 10, 2, 2, 1.2)], spawns: [guardAt(0, 0, 0, 10), guardAt(-4, 2, 0, 10)] }), ["rifleman", "scout"], 99)
      s.run(player(0, 20, { speed: 2 }), 8)
      return s.log.shots.map(x => [x.t.toFixed(4), x.hit, x.to.x.toFixed(4), x.to.z.toFixed(4)].join())
    }
    const a = go(), b = go()
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(b)
  })
})

describe("states and movement", () => {
  it("investigates a noise and walks around obstacles on the way", () => {
    const solids = [box(0, 10, 20, 1, 3)]
    const { m, run } = setup(mockWorld({ solids, spawns: [guardAt(0, 0, 0, -10)] }), ["rifleman"])
    const e = m.enemies[0]
    m.hearNoise({ x: 0, y: 1, z: 20 }, 50)
    expect(e.state).toBe("investigate")
    let minClear = Infinity
    run(player(30, -30, { active: true }), 16, () => {
      for (const o of solids) {
        const cx = Math.max(o.minX, Math.min(e.position.x, o.maxX)), cz = Math.max(o.minZ, Math.min(e.position.z, o.maxZ))
        minClear = Math.min(minClear, Math.hypot(e.position.x - cx, e.position.z - cz))
      }
    })
    expect(minClear).toBeGreaterThan(0.3)
    expect(Math.hypot(e.position.x - 0, e.position.z - 20)).toBeLessThan(10)
  })

  it("goes from suspicious to investigate when a footstep is heard but nothing is seen", () => {
    const { m, run } = setup(mockWorld({ spawns: [guardAt(0, 0, 0, -10)] }), ["scout"])
    const e = m.enemies[0]
    m.hearNoise({ x: 0, y: 0, z: 6 }, 8)
    expect(e.state).toBe("suspicious")
    run(player(0, 6, { active: true, alive: false }), 3)
    expect(["investigate", "search", "patrol", "idle"]).toContain(e.state)
  })

  it("alerts allies within 25 m when one enemy spots the player", () => {
    const { m, run } = setup(mockWorld({ spawns: [guardAt(0, 0, 0, 10), guardAt(12, -6, 12, -20)] }), ["rifleman", "rifleman"])
    const a = near(m.enemies, 0, 0), b = near(m.enemies, 12, -6)
    run(player(0, 18), 2.5)
    expect(a.state).toBe("combat")
    expect(["investigate", "combat"]).toContain(b.state)
    expect(b.awareness).toBeGreaterThan(0.5)
  })

  it("searches after losing the player and returns to patrol with raised awareness", () => {
    const { m, run } = setup(mockWorld({ solids: [box(0, 12, 12, 0.6, 3)], spawns: [guardAt(0, 0, 0, 10)] }), ["scout"])
    const e = m.enemies[0]
    const p = player(-8, 13)
    run(p, 2)
    expect(e.state).toBe("combat")
    p.position.set(35, 0, -38)  // vanish: far away, out of sight of the search area
    const seen = new Set<string>()
    run(p, 45, () => seen.add(e.state))
    expect(seen.has("search")).toBe(true)
    expect(["patrol", "idle"]).toContain(e.state)
    expect(e.brain.floor).toBeGreaterThan(0)
  })

  it("riflemen take low cover, crouch behind it and fire from it", () => {
    const solids = [box(2, 9.5, 3, 0.6, 1.1)]  // cover spot on its south face at (2, 8.5)
    const { m, log, run } = setup(mockWorld({ solids, spawns: [guardAt(0, 4, 0, 20)] }), ["rifleman"])
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

  it("lets at most one enemy flank at a time when more than two fight", () => {
    const spawns = [guardAt(-4, 0, 0, 10), guardAt(-1.5, 0, 0, 10), guardAt(1.5, 0, 0, 10), guardAt(4, 0, 0, 10)]
    const { m, run } = setup(mockWorld({ spawns }), ["scout", "scout", "scout", "scout"])
    let maxFlank = 0, fought = false
    run(player(0, 16), 12, () => {
      const fighting = m.enemies.filter(e => e.alive && e.state === "combat").length
      if (fighting > 2) { fought = true; maxFlank = Math.max(maxFlank, m.enemies.filter(e => e.state === "combat" && e.brain.mode === "flank").length) }
    })
    expect(fought).toBe(true)
    expect(maxFlank).toBeLessThanOrEqual(1)
    // and nobody stands on top of the player or of each other
    for (const e of m.enemies) expect(Math.hypot(e.position.x, e.position.z - 16)).toBeGreaterThan(1.1)
  })

  it("sends reinforcements alerted toward the target", () => {
    const { m, run } = setup(mockWorld({ reinforcements: [{ x: 0, z: -36 }] }), [])
    m.spawnReinforcements(["scout", "rifleman"], { x: 0, z: -10 })
    expect(m.enemies.length).toBe(2)
    for (const e of m.enemies) { expect(e.state).toBe("investigate"); expect(e.awareness).toBeGreaterThanOrEqual(0.8) }
    run(player(30, 30), 9)
    for (const e of m.enemies) expect(Math.hypot(e.position.x, e.position.z + 10)).toBeLessThan(7)
  })
})

describe("damage and hit zones", () => {
  it("hit zones follow the pose (idle, walking, crouched)", () => {
    const assets = acquireSoldierAssets()
    const group = new THREE.Group(), model = new SoldierModel("rifleman", assets, 3)
    group.add(model.root)
    const drive = makeDrive(); drive.alert = 1
    const pose = (secs: number) => { for (let i = 0; i < secs * 60; i++) { model.update(1 / 60, drive); group.updateMatrixWorld(true); model.capture() } }
    const ray = (x: number, y: number) => model.rayTest({ x, y, z: -10 }, { x: 0, y: 0, z: 1 }, 50)
    pose(1)
    expect(ray(model.head.x, model.head.y)?.part).toBe("head")
    expect(ray(model.chestPos.x, model.chestPos.y)?.part).toBe("body")
    expect(ray(model.kneeLPos.x, (model.hipLPos.y + model.kneeLPos.y) / 2)?.part).toBe("limb")
    expect(ray(model.ankleRPos.x, (model.kneeRPos.y + model.ankleRPos.y) / 2)?.part).toBe("limb")
    expect(ray(0, 2.2)).toBeNull()
    const standingHead = model.head.y
    // walking (mid-stride)
    drive.velZ = -1.8; pose(0.8)
    expect(ray(model.head.x, model.head.y)?.part).toBe("head")
    expect(ray(model.chestPos.x, model.chestPos.y)?.part).toBe("body")
    // crouched
    drive.velZ = 0; drive.crouch = 1; pose(1.5)
    expect(model.head.y).toBeLessThan(standingHead - 0.35)
    expect(ray(model.head.x, model.head.y)?.part).toBe("head")
    expect(ray(model.head.x, standingHead)).toBeNull()
    expect(ray(model.chestPos.x, model.chestPos.y)?.part).toBe("body")
    model.dispose(); releaseSoldierAssets()
  })

  it("applies armour to body hits only, kills, ignores corpses and lets them settle flat", () => {
    const { m, log, run } = setup(mockWorld({ spawns: [guardAt(0, 0, 0, -10)] }), ["heavy"])
    const e = m.enemies[0]
    const origin = new THREE.Vector3(0, 1.6, -12)
    const dirTo = (p: THREE.Vector3) => p.clone().sub(origin).normalize()
    const chest = e.chestPosition(new THREE.Vector3())
    const hit = m.hitTest(origin, dirTo(chest), 100)!
    expect(hit.part).toBe("body")
    expect(m.applyDamage(hit, 40, origin).dealt).toBeCloseTo(40 * (1 - 0.35))
    const head = e.headPosition(new THREE.Vector3())
    const hh = m.hitTest(origin, dirTo(head), 100)!
    expect(hh.part).toBe("head")
    const res = m.applyDamage(hh, 500, origin)
    expect(res.killed).toBe(true)
    expect(log.died).toEqual([{ id: e.id, cause: "player", part: "head" }])
    expect(m.hitTest(origin, dirTo(head), 100)).toBeNull()
    expect(m.aliveCount()).toBe(0)
    const pos = e.position.clone()
    run(player(30, 30), 2)
    expect(e.model!.settled).toBe(true)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.model!.root.quaternion)
    expect(Math.abs(up.y)).toBeLessThan(0.02)           // lying flat
    const restY = e.model!.root.position.y
    expect(restY).toBeGreaterThan(0.1); expect(restY).toBeLessThan(0.3)
    run(player(30, 30), 3)
    expect(e.model!.root.position.y).toBe(restY)       // stays put
    expect(e.position.distanceTo(pos)).toBe(0)
  })

  it("explosions fall off linearly and are blocked by walls", () => {
    const solids = [box(0, -2, 6, 0.5, 3)]
    const { m, log } = setup(mockWorld({ solids, spawns: [guardAt(3, 0, 3, 5), guardAt(0, -4.5, 0, -10)] }), ["rifleman", "rifleman"])
    const open = near(m.enemies, 3, 0), walled = near(m.enemies, 0, -4.5)
    const killed = m.applyExplosion({ x: 0, y: 0.3, z: 0 }, 7, 100)
    expect(killed.length).toBe(0)
    const d = Math.hypot(open.position.x, open.position.z)
    expect(open.health).toBeCloseTo(95 - 100 * (1 - d / 7), 5)
    expect(walled.health).toBe(95)
    const k2 = m.applyExplosion({ x: open.position.x, y: 0.3, z: open.position.z }, 7, 200)
    expect(k2).toEqual([open])
    expect(log.died[0]).toEqual({ id: open.id, cause: "explosion", part: "body" })
  })

  it("being shot puts an unaware enemy into combat facing the attacker", () => {
    const { m, run } = setup(mockWorld({ spawns: [guardAt(0, 0, 0, -10)] }), ["rifleman"])
    const e: Enemy = m.enemies[0]
    const from = new THREE.Vector3(0, 1.6, 15)
    const hit = m.hitTest(from, e.chestPosition(new THREE.Vector3()).sub(from).normalize(), 50)!
    m.applyDamage(hit, 10, from)
    expect(e.state).toBe("combat")
    run(player(0, 15), 1.5)
    expect(Math.abs(Math.atan2(Math.sin(e.yaw - Math.PI), Math.cos(e.yaw - Math.PI)))).toBeLessThan(0.5) // turned to +Z
  })
})
