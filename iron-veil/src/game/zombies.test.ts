/**
 * zombies.test.ts — the infected: pure decision logic (zombieAi.ts) and headless InfectedManager behaviour on simple
 * obstacle worlds (CollisionWorld + NavGrid, no renderer): noise, path finding around walls, attacks only in range
 * and never through walls, dismemberment → crawler, populate placement and budget, hordes, acid, determinism.
 */
import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { CollisionWorld, collides, type Obstacle } from "./collision"
import { GoreSystem, type GoreLevel } from "./gore"
import type { AttackEvent, BodyPartId, Hostile, HostileHit, PlayerState } from "./hostiles"
import { NavGrid } from "./nav"
import type { Difficulty, ThemeId } from "./types"
import type { World } from "./world"
import { FlowField, SPAWN_RULES, findSpawnPoint, goreOutcome, inViewCone, makeRng, nextMind, rayCapsule, separation, spawnAllowed, zoneTarget, type GoreInput } from "./zombieAi"
import { GORE_RULES, InfectedManager, type Infected, type InfectedZone } from "./zombies"

// ------------------------------------------------------------------ helpers

function testWorld(obstacles: Obstacle[], half = 60, theme: ThemeId = "dusk"): World {
  const bounds = { minX: -half, maxX: half, minZ: -half, maxZ: half }
  return {
    layout: { id: "greyzone", bounds, solids: [], playerSpawns: [], lootSpawns: [], enemySpawns: [], extractions: [], reinforcementSpawns: [] },
    theme, group: new THREE.Group(), obstacles, collision: new CollisionWorld(obstacles), nav: new NavGrid(bounds, obstacles, 0.45, 1),
    coverPoints: [], exposure: 1, surfaceAt: () => "asphalt", update() {}, setExtraction() {}, dispose() {},
  }
}

type TestPlayer = PlayerState & { yaw: number }
function player(x: number, z: number, o: Partial<TestPlayer> = {}): TestPlayer {
  return { position: new THREE.Vector3(x, 0, z), eyeY: 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: true, yaw: 0, ...o }
}

function setup(world: World, o: { seed?: number; gore?: GoreLevel; difficulty?: Difficulty } = {}) {
  const log = { attacks: [] as Array<AttackEvent & { t: number }>, deaths: [] as Hostile[], sounds: [] as string[] }
  const gore = new GoreSystem(new THREE.Scene(), world.collision, o.gore ?? "brutal")
  let t = 0
  const mgr = new InfectedManager(world.group, world, {
    difficulty: o.difficulty ?? "normal", seed: o.seed ?? 1, gore,
    events: { attack: a => log.attacks.push({ ...a, t }), died: d => log.deaths.push(d), sound: (_s, s) => log.sounds.push(s) },
  })
  const run = (pl: PlayerState, seconds: number, each?: () => void) => { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { t += 1 / 60; mgr.update(1 / 60, pl); each?.() } }
  return { mgr, log, gore, run, time: () => t }
}

function limbHit(e: Infected, part: BodyPartId): HostileHit {
  e.group.updateMatrixWorld(true)
  const c = e.rig.capsules.find(c => c.part === part)!
  const point = new THREE.Vector3((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2).applyMatrix4(c.frame.matrixWorld)
  return { target: e, distance: 3, part: part === "head" ? "head" : part === "torso" ? "body" : "limb", bodyPart: part, point }
}
const shot = (amount: number, kind: "bullet" | "pellet" | "melee" = "bullet", sever = 0) => ({ amount, from: { x: 0, y: 1.6, z: -5 }, dir: { x: 0, y: 0, z: 1 }, penetration: 0.25, kind, sever })

// ------------------------------------------------------------------ pure logic

describe("zombieAi: perception and states", () => {
  it("makeRng is deterministic per seed", () => {
    const a = makeRng(42), b = makeRng(42), c = makeRng(43)
    const sa = Array.from({ length: 8 }, a), sb = Array.from({ length: 8 }, b), sc = Array.from({ length: 8 }, c)
    expect(sa).toEqual(sb); expect(sa).not.toEqual(sc)
    for (const v of sa) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it("state transitions", () => {
    expect(nextMind("idle", "see", 0, false, true)).toBe("chase")
    expect(nextMind("wander", "smell", 0, false, true)).toBe("chase")
    expect(nextMind("idle", "hear", 0, false, true)).toBe("investigate")
    expect(nextMind("chase", "hear", 5, false, true)).toBe("chase")
    expect(nextMind("chase", "none", 10, false, true)).toBe("chase")
    expect(nextMind("chase", "none", 21, false, true)).toBe("wander")
    expect(nextMind("investigate", "none", 3, true, true)).toBe("wander")
    expect(nextMind("hunt", "none", 3, false, true)).toBe("hunt")
    expect(nextMind("chase", "see", 0, false, false)).toBe("wander")
    expect(nextMind("idle", "see", 0, false, false)).toBe("idle")
  })
})

describe("zombieAi: dismemberment decisions (GORE_RULES)", () => {
  const base: GoreInput = { part: "armL", dealt: 10, limbTotal: 10, maxHealth: 65, healthAfter: 40, kind: "bullet", sever: 0, roll: 0.5, brutal: true, blastDamage: 0, distance: 10, boss: false }
  it("severs a limb once it took 35 % of max health (brutal only)", () => {
    expect(goreOutcome(GORE_RULES, { ...base, limbTotal: 22 })).toBe("none")
    expect(goreOutcome(GORE_RULES, { ...base, limbTotal: 23 })).toBe("sever")
    expect(goreOutcome(GORE_RULES, { ...base, limbTotal: 60, brutal: false })).toBe("none")
  })
  it("blades/heavy rounds add a sever chance", () => {
    expect(goreOutcome(GORE_RULES, { ...base, sever: 0.6, roll: 0.5 })).toBe("sever")
    expect(goreOutcome(GORE_RULES, { ...base, sever: 0.6, roll: 0.7 })).toBe("none")
  })
  it("bursts heads on big hits and kills instantly at every gore level; the boss is never one-shot", () => {
    const head: GoreInput = { ...base, part: "head", dealt: 96, limbTotal: 96, healthAfter: -31 }
    expect(goreOutcome(GORE_RULES, head)).toBe("burst")
    expect(goreOutcome(GORE_RULES, { ...head, brutal: false })).toBe("burst")
    expect(goreOutcome(GORE_RULES, { ...head, dealt: 60, healthAfter: 5 })).toBe("none")
    // brute: a third of its health is needed (420 → 147)
    expect(goreOutcome(GORE_RULES, { ...head, maxHealth: 420, dealt: 130, healthAfter: 200 })).toBe("none")
    expect(goreOutcome(GORE_RULES, { ...head, maxHealth: 420, dealt: 150, healthAfter: 200 })).toBe("burst")
    expect(goreOutcome(GORE_RULES, { ...head, maxHealth: 2600, dealt: 400, healthAfter: 1000, boss: true })).toBe("none")
    expect(goreOutcome(GORE_RULES, { ...head, maxHealth: 2600, dealt: 400, healthAfter: -1, boss: true })).toBe("burst")
  })
  it("machete kill on the head decapitates", () => {
    expect(goreOutcome(GORE_RULES, { ...base, part: "head", kind: "melee", dealt: 58, healthAfter: -2, sever: 0.6, roll: 0.3 })).toBe("decap")
  })
  it("point-blank shotgun kills gib the body", () => {
    const blast: GoreInput = { ...base, part: "torso", kind: "pellet", dealt: 14, healthAfter: -5, blastDamage: 70, distance: 3 }
    expect(goreOutcome(GORE_RULES, blast)).toBe("gib")
    expect(goreOutcome(GORE_RULES, { ...blast, distance: 9 })).toBe("none")
    expect(goreOutcome(GORE_RULES, { ...blast, blastDamage: 30 })).toBe("none")
    expect(goreOutcome(GORE_RULES, { ...blast, healthAfter: 5 })).toBe("none")
    expect(goreOutcome(GORE_RULES, { ...blast, brutal: false })).toBe("none")
  })
})

describe("zombieAi: populate placement rules", () => {
  it("spawnAllowed: never close, hidden or far outside the view", () => {
    expect(spawnAllowed(25, false, true)).toBe(false)
    expect(spawnAllowed(35, false, true)).toBe(true)
    expect(spawnAllowed(35, false, false)).toBe(false)
    expect(spawnAllowed(50, false, false)).toBe(true)
    expect(spawnAllowed(50, true, false)).toBe(false)
    expect(spawnAllowed(120, false, true)).toBe(false)
    expect(zoneTarget(30, 0.005)).toBe(14)
  })
  it("findSpawnPoint in an open world respects distance and view cone", () => {
    const w = testWorld([], 150), rng = makeRng(5), out = { x: 0, z: 0 }, eye = { x: 0, y: 1.62, z: 0 }, facing = { x: 0, z: -1 }
    let found = 0
    for (let i = 0; i < 300; i++) {
      if (!findSpawnPoint(0, 0, 120, eye, facing, w.nav, w.collision, rng, out, 6)) continue
      found++
      const d = Math.hypot(out.x, out.z)
      expect(d).toBeGreaterThan(SPAWN_RULES.openDist); expect(d).toBeLessThanOrEqual(SPAWN_RULES.maxDist)
      expect(inViewCone(0, 0, 0, -1, out.x, out.z)).toBe(false)
    }
    expect(found).toBeGreaterThan(100)
    // unknown facing in the open: nothing qualifies
    expect(findSpawnPoint(0, 0, 120, eye, null, w.nav, w.collision, rng, out, 50)).toBe(false)
  })
  it("findSpawnPoint accepts closer spots only when hidden behind obstacles", () => {
    // a wall ring 32 m in front of the player
    const w = testWorld([{ minX: -30, maxX: 30, minZ: -34, maxZ: -32, height: 4 }], 100), rng = makeRng(9), out = { x: 0, z: 0 }, eye = { x: 0, y: 1.62, z: 0 }
    let hidden = 0
    for (let i = 0; i < 300; i++) {
      if (!findSpawnPoint(0, -40, 8, eye, { x: 0, z: -1 }, w.nav, w.collision, rng, out, 6)) continue
      const d = Math.hypot(out.x, out.z)
      expect(d).toBeGreaterThanOrEqual(SPAWN_RULES.minDist)
      expect(w.collision.segmentBlocked3D(eye, { x: out.x, y: 1.6, z: out.z })).toBe(true)
      hidden++
    }
    expect(hidden).toBeGreaterThan(50)
  })
})

describe("zombieAi: hordes and steering", () => {
  it("separation resolves a stacked horde of 30", () => {
    const n = 30, xs = new Float32Array(n), zs = new Float32Array(n), rs = new Float32Array(n).fill(0.32), rng = makeRng(3), out = { x: 0, z: 0 }
    for (let i = 0; i < n; i++) { xs[i] = rng() * 1.2; zs[i] = rng() * 1.2 }
    xs[1] = xs[0]; zs[1] = zs[0] // two exactly on top of each other
    for (let it = 0; it < 400; it++) {
      const dx = new Float32Array(n), dz = new Float32Array(n)
      for (let i = 0; i < n; i++) { separation(i, xs, zs, rs, n, out); dx[i] = out.x * 0.05; dz[i] = out.z * 0.05 }
      for (let i = 0; i < n; i++) { xs[i] += dx[i]; zs[i] += dz[i] }
    }
    let min = Infinity
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) min = Math.min(min, Math.hypot(xs[i] - xs[j], zs[i] - zs[j]))
    expect(min).toBeGreaterThan(0.6)
  })
  it("flow field steers around a wall to the target", () => {
    const wall: Obstacle = { minX: -8, maxX: 8, minZ: -1, maxZ: 1, height: 3 }
    const w = testWorld([wall], 40), flow = new FlowField(w.nav, 30), dir = { x: 0, z: 0 }, p = { x: 0, z: 0 }
    expect(flow.build(0, -10)).toBe(true)
    let x = 0, z = 10
    for (let i = 0; i < 2000 && Math.hypot(x, z + 10) > 0.8; i++) {
      expect(flow.steer(x, z, dir)).toBe(true)
      w.collision.moveCircle(x, z, dir.x * 0.05, dir.z * 0.05, 0.32, p); x = p.x; z = p.z
      expect(collides(x, z, 0.3, [wall])).toBe(false)
    }
    expect(Math.hypot(x, z + 10)).toBeLessThan(0.8)
    expect(flow.costAt(0, 10)).toBeGreaterThan(20)
  })
  it("rayCapsule agrees with brute-force sampling", () => {
    const r = makeRng(11)
    for (let i = 0; i < 400; i++) {
      const a = [r() * 2 - 1, r() * 2, r() * 2 - 1], b = [r() * 2 - 1, r() * 2, r() * 2 - 1], rad = 0.05 + r() * 0.3
      const o = [r() * 8 - 4, r() * 3, r() * 8 - 4], t = [r() * 2 - 1, r() * 2, r() * 2 - 1]
      const d = [t[0] - o[0], t[1] - o[1], t[2] - o[2]], dl = Math.hypot(d[0], d[1], d[2]); d[0] /= dl; d[1] /= dl; d[2] /= dl
      const hit = rayCapsule(o[0], o[1], o[2], d[0], d[1], d[2], a[0], a[1], a[2], b[0], b[1], b[2], rad)
      let brute = -1
      for (let s = 0; s < 3000; s++) {
        const u = s * 0.004, px = o[0] + d[0] * u, py = o[1] + d[1] * u, pz = o[2] + d[2] * u
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [px - a[0], py - a[1], pz - a[2]]
        const k = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)))
        if (Math.hypot(px - a[0] - ab[0] * k, py - a[1] - ab[1] * k, pz - a[2] - ab[2] * k) <= rad) { brute = u; break }
      }
      if (brute < 0) expect(hit < 0 || hit > 11.99).toBe(true)
      else if (brute > 0) expect(Math.abs(hit - brute)).toBeLessThan(0.02)
    }
  })
})

// ------------------------------------------------------------------ manager behaviour

describe("InfectedManager behaviour", () => {
  it("noise draws an infected around a wall instead of into it", () => {
    const wall: Obstacle = { minX: -7, maxX: 7, minZ: -0.5, maxZ: 0.5, height: 3 }
    const w = testWorld([wall]), { mgr, run } = setup(w)
    const e = mgr.spawn("walker", 0, 6, { state: "idle" })
    const pl = player(45, 45)
    run(pl, 0.5)
    mgr.hearNoise({ x: 0, y: 1, z: -8 }, 40)
    let best = Infinity, inside = 0
    run(pl, 30, () => { best = Math.min(best, Math.hypot(e.position.x, e.position.z + 8)); if (collides(e.position.x, e.position.z, 0.28, [wall])) inside++ })
    expect(inside).toBe(0)
    expect(best).toBeLessThan(3)
  })

  it("chasers path around walls to reach the player", () => {
    const wall: Obstacle = { minX: -6, maxX: 6, minZ: -0.5, maxZ: 0.5, height: 3 }
    const w = testWorld([wall]), { mgr, run } = setup(w)
    const e = mgr.spawn("runner", 0, 5, { state: "idle" })
    const pl = player(0, -4)
    e.mode = "chase"; e.lastContact = 0; e.lastKnownX = 0; e.lastKnownZ = -4
    let reached = false, inside = 0
    run(pl, 12, () => { if (Math.hypot(e.position.x - pl.position.x, e.position.z - pl.position.z) < 2) reached = true; if (collides(e.position.x, e.position.z, 0.26, [wall])) inside++ })
    expect(inside).toBe(0)
    expect(reached).toBe(true)
  })

  it("attacks in range after a wind-up, with difficulty damage", () => {
    const w = testWorld([]), { mgr, run, log, time } = setup(w, { difficulty: "hard" })
    const e = mgr.spawn("walker", 0, 1.2, { state: "idle" })
    e.yaw = 0; e.feeding = false
    const pl = player(0, 0)
    let actionAt = -1
    run(pl, 4, () => { if (actionAt < 0 && (e.action === "claw" || e.action === "bite")) actionAt = time() })
    expect(log.attacks.length).toBeGreaterThan(0)
    const a = log.attacks[0]
    expect(a.source).toBe(e)
    expect(a.damage).toBeCloseTo(12 * 1.35, 5)
    expect(["claw", "bite"]).toContain(a.kind)
    expect(a.t - actionAt).toBeGreaterThanOrEqual(0.25)
  })

  it("never attacks through a wall, and never an inactive player", () => {
    const wall: Obstacle = { minX: -30, maxX: 30, minZ: -0.25, maxZ: 0.05, height: 3 }
    const w = testWorld([wall]), { mgr, run, log } = setup(w)
    mgr.spawn("walker", 0, 0.5, { state: "idle" })
    mgr.spawn("brute", 3, 1.0, { state: "idle" })
    run(player(1, -0.75), 6)
    expect(log.attacks.length).toBe(0)
    const w2 = testWorld([]), s2 = setup(w2)
    s2.mgr.spawn("walker", 0, 1, { state: "idle" })
    s2.run(player(0, 0, { active: false }), 5)
    expect(s2.log.attacks.length).toBe(0)
  })

  it("an infected that loses both legs becomes a crawler and keeps attacking", () => {
    const w = testWorld([]), { mgr, run, log } = setup(w, { gore: "brutal" })
    const e = mgr.spawn("walker", 0, 4, { state: "idle" })
    const r1 = mgr.applyDamage(limbHit(e, "legL"), shot(28))
    expect(r1.severed).toBe("legL")
    expect(e.gait).toBe("hobble")
    const r2 = mgr.applyDamage(limbHit(e, "legR"), shot(28))
    expect(r2.severed).toBe("legR"); expect(r2.killed).toBe(false)
    expect(e.legless).toBe(true); expect(e.gait).toBe("drag")
    expect(e.gore.parts.legL!.visible).toBe(false)
    // hit tests ignore the severed parts
    const origin = new THREE.Vector3(3, 0.5, 4), dir = new THREE.Vector3(-1, 0, 0)
    const h = mgr.hitTest(origin, dir, 10)
    if (h) expect(["legL", "legR"]).not.toContain(h.bodyPart)
    // from the ground it still bites a player standing next to it
    const pl = player(0, 2.6)
    run(pl, 12)
    expect(log.attacks.length).toBeGreaterThan(0)
    expect(log.attacks[0].kind).toBe("bite")
  })

  it("loses an arm → half claw damage; normal gore never dismembers", () => {
    const w = testWorld([]), { mgr } = setup(w, { gore: "brutal" })
    const e = mgr.spawn("walker", 0, 4, { state: "idle" })
    expect(mgr.applyDamage(limbHit(e, "armR"), shot(26)).severed).toBe("armR")
    expect(e.armsLost).toBe(2)
    const n = setup(testWorld([]), { gore: "normal" })
    const f = n.mgr.spawn("walker", 0, 4, { state: "idle" })
    expect(n.mgr.applyDamage(limbHit(f, "legL"), shot(28)).severed).toBe(null)
    expect(n.mgr.applyDamage(limbHit(f, "legR"), shot(28)).severed).toBe(null)
    expect(f.legless).toBe(false); expect(f.gore.severed.size).toBe(0)
  })

  it("a big head hit bursts the head: instant kill with headshotKill", () => {
    for (const level of ["brutal", "normal"] as GoreLevel[]) {
      const { mgr, log } = setup(testWorld([]), { gore: level })
      const e = mgr.spawn("brute", 0, 5, { state: "idle" })
      const r = mgr.applyDamage(limbHit(e, "head"), shot(330))
      expect(r.killed).toBe(true); expect(r.headshotKill).toBe(true)
      expect(e.alive).toBe(false); expect(log.deaths).toContain(e)
      expect(e.gore.severed.has("head")).toBe(level === "brutal")
    }
  })

  it("explosions kill, gib close bodies (brutal) and are blocked by walls", () => {
    const wall: Obstacle = { minX: 4, maxX: 5, minZ: -5, maxZ: 5, height: 3 }
    const { mgr } = setup(testWorld([wall]), { gore: "brutal" })
    const near = mgr.spawn("walker", 1, 0, { state: "idle" }), mid = mgr.spawn("walker", 0, 4.5, { state: "idle" }), behind = mgr.spawn("walker", 6, 0, { state: "idle" })
    const killed = mgr.applyExplosion({ x: 0, y: 0.3, z: 0 }, 8, 200)
    expect(killed).toContain(near); expect(killed).toContain(mid)
    expect(near.gibbed).toBe(true); expect(mid.gibbed).toBe(false)
    expect(behind.alive).toBe(true); expect(behind.health).toBe(behind.maxHealth)
  })

  it("meleeTest hits in front, not behind walls or outside the arc", () => {
    const wall: Obstacle = { minX: -3, maxX: -2.6, minZ: -3, maxZ: 3, height: 3 }
    const { mgr } = setup(testWorld([wall]))
    const front = mgr.spawn("walker", 0, -1.6, { state: "idle" }), back = mgr.spawn("walker", 0, 1.6, { state: "idle" }), walled = mgr.spawn("walker", -3.6, 0, { state: "idle" })
    const hits = mgr.meleeTest(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, -0.3, -1).normalize(), 2.2, 80, 3)
    const ids = hits.map(h => h.target)
    expect(ids).toContain(front); expect(ids).not.toContain(back); expect(ids).not.toContain(walled)
    const side = mgr.meleeTest(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(-1, 0, 0), 4, 80, 3).map(h => h.target)
    expect(side).not.toContain(walled)
  })

  it("populate respects budget, spawn distances and despawns far calm infected", () => {
    const obstacles: Obstacle[] = []
    for (let i = 0; i < 40; i++) { const x = ((i * 37) % 200) - 100, z = ((i * 53) % 200) - 100; obstacles.push({ minX: x, maxX: x + 6, minZ: z, maxZ: z + 3, height: 4 }) }
    const w = testWorld(obstacles, 260), { mgr, run } = setup(w, { seed: 4 })
    const zones: InfectedZone[] = [
      { x: 0, z: -15, radius: 12, density: 0.02 }, { x: 60, z: 0, radius: 25, density: 0.01 }, { x: -50, z: 50, radius: 20, density: 0.01 },
      { x: 0, z: 70, radius: 30, density: 0.012 }, { x: 220, z: 220, radius: 20, density: 0.05 },
    ]
    const pl = player(0, 0, { yaw: 0 }), eye = { x: 0, y: 1.62, z: 0 }, budget = 22
    const seen = new Set<Infected>()
    for (let k = 0; k < 12; k++) {
      mgr.populate(zones, pl, budget)
      for (const e of mgr.list) {
        if (seen.has(e)) continue
        seen.add(e)
        const d = Math.hypot(e.position.x, e.position.z)
        expect(d).toBeGreaterThanOrEqual(SPAWN_RULES.minDist - 0.01); expect(d).toBeLessThanOrEqual(SPAWN_RULES.maxDist + 3)
        const hidden = w.collision.segmentBlocked3D(eye, { x: e.position.x, y: 1.6, z: e.position.z })
        expect(hidden || (d > SPAWN_RULES.openDist - 3 && !inViewCone(0, 0, 0, -1, e.position.x, e.position.z))).toBe(true)
      }
      expect(mgr.aliveCount()).toBeLessThanOrEqual(budget)
      run(pl, 1.05)
    }
    expect(seen.size).toBeGreaterThan(5)
    // nothing from the zone 300 m away, nothing inside the 30 m ring
    for (const e of seen) expect(Math.hypot(e.position.x - 220, e.position.z - 220)).toBeGreaterThan(20)
    // walk away: calm infected beyond 160 m vanish
    const far = player(0, 0, { yaw: 0, active: false })
    far.position.set(-240, 0, -240)
    run(far, 1.1); mgr.populate([], far, budget)
    for (const e of mgr.list) expect(Math.hypot(e.position.x + 240, e.position.z + 240) <= SPAWN_RULES.despawnDist || e.mode === "chase").toBe(true)
  })

  it("a horde of 30 walks to its target and spreads out", () => {
    const { mgr, run } = setup(testWorld([], 80))
    // active player far away and out of sight (inactive players make every infected merely wander)
    const pl = player(0, 75)
    run(pl, 0.1)
    expect(mgr.spawnHorde({ x: -30, z: -30 }, 30, { x: 0, z: 0 })).toBe(30)
    run(pl, 25)
    const alive = mgr.list.filter(e => e.alive)
    expect(alive.length).toBe(30)
    let near = 0, min = Infinity
    for (const e of alive) if (Math.hypot(e.position.x, e.position.z) < 15) near++
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) min = Math.min(min, Math.hypot(alive[i].position.x - alive[j].position.x, alive[i].position.z - alive[j].position.z))
    expect(near).toBeGreaterThan(20)
    expect(min).toBeGreaterThan(0.35)
  })

  it("spitters lob acid that hurts (direct hit or puddle)", () => {
    const { mgr, run, log } = setup(testWorld([]))
    const e = mgr.spawn("spitter", 0, -9, { state: "idle" })
    e.yaw = Math.PI; e.feeding = false
    run(player(0, 0), 8)
    const acid = log.attacks.filter(a => a.kind === "acid")
    expect(acid.length).toBeGreaterThan(0)
    expect(log.sounds).toContain("spit")
  })

  it("screamers scream and call a horde", () => {
    const { mgr, run, log } = setup(testWorld([], 90))
    const e = mgr.spawn("screamer", 0, -12, { state: "idle" })
    e.yaw = Math.PI; e.feeding = false
    const before = mgr.aliveCount()
    run(player(0, 0, { yaw: Math.PI }), 4)
    expect(log.sounds).toContain("scream")
    expect(mgr.aliveCount()).toBeGreaterThan(before)
  })

  it("the boss changes phase and summons runners", () => {
    const { mgr, run } = setup(testWorld([], 90))
    const boss = mgr.spawn("boss", 0, -10, { state: "idle" })
    const pl = player(0, 0)
    run(pl, 0.5)
    boss.health = boss.maxHealth * 0.6
    run(pl, 0.2)
    expect(boss.bossPhase).toBe(2)
    boss.health = boss.maxHealth * 0.3
    const before = mgr.list.filter(e => e.kind === "runner").length
    run(pl, 2.5)
    expect(boss.bossPhase).toBe(3)
    expect(mgr.list.filter(e => e.kind === "runner").length).toBeGreaterThan(before)
  })

  it("is deterministic for the same seed and inputs", () => {
    const sim = () => {
      const { mgr, run } = setup(testWorld([{ minX: -3, maxX: 3, minZ: -1, maxZ: 1, height: 3 }]), { seed: 77 })
      mgr.spawnHorde({ x: 10, z: 10 }, 12, { x: 0, z: -8 })
      mgr.spawn("stalker", -8, 8, { state: "wander" })
      run(player(0, -8), 8)
      return mgr.list.map(e => [e.kind, +e.position.x.toFixed(4), +e.position.z.toFixed(4), e.state])
    }
    expect(sim()).toEqual(sim())
  })

  it("dispose() frees everything", () => {
    const w = testWorld([]), { mgr, run } = setup(w)
    mgr.spawnHorde({ x: 10, z: 10 }, 10, { x: 0, z: 0 })
    run(player(0, 0), 1)
    mgr.dispose()
    expect(mgr.list.length).toBe(0)
    expect(w.group.children.length).toBe(0)
  })
})
