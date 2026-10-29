/**
 * maps.test.ts — layout validation for every mission: builds the obstacles exactly like world.ts (layoutObstacles)
 * plus the enemy NavGrid and checks counts, distances, walkability/reachability, doorways, crates and cover points.
 */
import { describe, expect, it } from "vitest"
import { MISSIONS, MISSION_ORDER } from "./data"
import { computeCoverPoints, getLayout, layoutObstacles, type MapSolid } from "./maps"
import { NavGrid } from "./nav"
import type { Vec2 } from "./types"

const CRATE_W = 1.25, CRATE_D = 0.85

/** Flood fill over open nav cells with the same moves A* uses (8 directions, no corner cutting). */
function flood(nav: NavGrid, x: number, z: number): Uint8Array {
  const seen = new Uint8Array(nav.cols * nav.rows)
  const start = nav.rowOf(z) * nav.cols + nav.colOf(x)
  if (nav.blocked[start]) return seen
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < nav.cols && r < nav.rows && !nav.blocked[r * nav.cols + c]
  const stack = [start]; seen[start] = 1
  while (stack.length) {
    const cur = stack.pop()!, c = cur % nav.cols, r = (cur - c) / nav.cols
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if ((!dc && !dr) || !open(c + dc, r + dr)) continue
      if (dc && dr && (!open(c + dc, r) || !open(c, r + dr))) continue
      const n = (r + dr) * nav.cols + c + dc
      if (!seen[n]) { seen[n] = 1; stack.push(n) }
    }
  }
  return seen
}

function boxDistance(x: number, z: number, s: MapSolid): number {
  const dx = Math.max(s.x - s.w / 2 - x, 0, x - (s.x + s.w / 2)), dz = Math.max(s.z - s.d / 2 - z, 0, z - (s.z + s.d / 2))
  return Math.hypot(dx, dz)
}

for (const id of MISSION_ORDER) {
  describe(`map ${id}`, () => {
    const L = getLayout(id)
    const mission = MISSIONS[id]
    const obstacles = layoutObstacles(L)
    const nav = new NavGrid(L.bounds, obstacles, 0.45, 1)
    const b = L.bounds
    const inside = (p: Vec2, margin = 0) => p.x >= b.minX + margin && p.x <= b.maxX - margin && p.z >= b.minZ + margin && p.z <= b.maxZ - margin
    const edgeDist = (p: Vec2) => Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z)
    const floods = L.playerSpawns.map(p => flood(nav, p.x, p.z))
    const reachable = (p: Vec2) => nav.walkable(p.x, p.z) && floods.every(f => f[nav.rowOf(p.z) * nav.cols + nav.colOf(p.x)] === 1)
    const ground = L.solids.filter(s => (s.y ?? 0) <= 1.6)

    it("has a 100–120 m square playable area", () => {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ
      expect(w).toBeGreaterThanOrEqual(100); expect(w).toBeLessThanOrEqual(120)
      expect(d).toBeGreaterThanOrEqual(100); expect(d).toBeLessThanOrEqual(120)
    })

    it("has enough spawns, crates and extractions", () => {
      expect(L.id).toBe(id)
      expect(L.playerSpawns.length).toBeGreaterThanOrEqual(2)
      expect(L.extractions.length).toBeGreaterThanOrEqual(2); expect(L.extractions.length).toBeLessThanOrEqual(3)
      expect(L.lootSpawns.length).toBeGreaterThanOrEqual(mission.crates + 4)
      expect(L.enemySpawns.length).toBeGreaterThanOrEqual(mission.roster.length + 3)
      expect(L.reinforcementSpawns.length).toBeGreaterThanOrEqual(3)
      expect(L.lootSpawns.filter(l => l.tier === 2).length).toBeGreaterThanOrEqual(4)
      expect(new Set(L.extractions.map(e => e.id)).size).toBe(L.extractions.length)
    })

    it("turns every solid into one obstacle and adds four perimeter boxes", () => {
      expect(obstacles.length).toBe(L.solids.length + 4)
      L.solids.forEach((s, i) => {
        const o = obstacles[i]
        expect(o.minX).toBeCloseTo(s.x - s.w / 2); expect(o.maxX).toBeCloseTo(s.x + s.w / 2)
        expect(o.minZ).toBeCloseTo(s.z - s.d / 2); expect(o.maxZ).toBeCloseTo(s.z + s.d / 2)
        expect(o.minY ?? 0).toBeCloseTo(s.y ?? 0); expect(o.height).toBeCloseTo((s.y ?? 0) + s.h)
      })
      for (const o of obstacles.slice(-4)) expect(o.height).toBeGreaterThan(0.3)
    })

    it("keeps every solid inside the bounds with a sane size", () => {
      for (const s of L.solids) {
        expect(s.w > 0 && s.d > 0 && s.h > 0, JSON.stringify(s)).toBe(true)
        expect(s.x - s.w / 2 >= b.minX - 1e-6 && s.x + s.w / 2 <= b.maxX + 1e-6 && s.z - s.d / 2 >= b.minZ - 1e-6 && s.z + s.d / 2 <= b.maxZ + 1e-6, JSON.stringify(s)).toBe(true)
      }
    })

    it("has no unintentionally overlapping solids", () => {
      const solids = L.solids.filter(s => !s.style.startsWith("proxy"))
      const bad: string[] = []
      for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i], c = solids[j]
        const ox = Math.min(a.x + a.w / 2, c.x + c.w / 2) - Math.max(a.x - a.w / 2, c.x - c.w / 2)
        const oz = Math.min(a.z + a.d / 2, c.z + c.d / 2) - Math.max(a.z - a.d / 2, c.z - c.d / 2)
        const oy = Math.min((a.y ?? 0) + a.h, (c.y ?? 0) + c.h) - Math.max(a.y ?? 0, c.y ?? 0)
        if (ox > 0.005 && oz > 0.005 && oy > 0.005) bad.push(`${a.style}@${a.x},${a.z} × ${c.style}@${c.x},${c.z}`)
      }
      expect(bad).toEqual([])
    })

    it("keeps every point of interest inside the bounds, walkable and reachable from every player spawn", () => {
      const points: Array<[string, Vec2]> = [
        ...L.playerSpawns.map((p, i): [string, Vec2] => [`player ${i}`, p]),
        ...L.lootSpawns.map((p, i): [string, Vec2] => [`loot ${i}`, p]),
        ...L.extractions.map((p): [string, Vec2] => [`extraction ${p.id}`, p]),
        ...L.reinforcementSpawns.map((p, i): [string, Vec2] => [`reinforcement ${i}`, p]),
        ...L.enemySpawns.flatMap((e, i): Array<[string, Vec2]> => [[`enemy ${i}`, e], ...e.patrol.map((p, j): [string, Vec2] => [`patrol ${i}.${j}`, p])]),
      ]
      const bad = points.filter(([, p]) => !inside(p, 0.5) || !reachable(p)).map(([n, p]) => `${n} (${p.x}, ${p.z})`)
      expect(bad).toEqual([])
      // spot-check the real path finder as well
      const s = L.playerSpawns[0]
      for (const e of L.extractions) expect(nav.findPath(s.x, s.z, e.x, e.z, nav.cols * nav.rows), e.id).not.toBeNull()
    })

    it("places player spawns at the map edge facing into the map", () => {
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2
      for (const p of L.playerSpawns) {
        expect(edgeDist(p)).toBeLessThanOrEqual(5)
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), tx = cx - p.x, tz = cz - p.z, tl = Math.hypot(tx, tz)
        expect((fx * tx + fz * tz) / tl, `spawn ${p.x},${p.z}`).toBeGreaterThan(0.3)
      }
    })

    it("keeps extractions on open ground at least 45 m from every player spawn", () => {
      for (const e of L.extractions) {
        expect(e.radius).toBeGreaterThanOrEqual(4); expect(e.radius).toBeLessThanOrEqual(5)
        for (const p of L.playerSpawns) expect(Math.hypot(e.x - p.x, e.z - p.z), e.id).toBeGreaterThanOrEqual(45)
        for (const s of L.solids) expect(boxDistance(e.x, e.z, s), `${e.id} vs ${s.style}@${s.x},${s.z}`).toBeGreaterThan(e.radius)
        for (let r = 0; r < nav.rows; r++) for (let c = 0; c < nav.cols; c++) {
          if (Math.hypot(nav.centerX(c) - e.x, nav.centerZ(r) - e.z) > e.radius - 0.6) continue
          expect(nav.blocked[r * nav.cols + c], `${e.id} cell ${c},${r}`).toBe(0)
        }
      }
    })

    it("keeps enemy spawns 25 m from player spawns with short walkable patrol beats", () => {
      for (const e of L.enemySpawns) {
        for (const p of L.playerSpawns) expect(Math.hypot(e.x - p.x, e.z - p.z), `enemy ${e.x},${e.z}`).toBeGreaterThanOrEqual(25)
        expect(e.patrol.length).toBeGreaterThanOrEqual(2); expect(e.patrol.length).toBeLessThanOrEqual(4)
        for (let i = 0; i < e.patrol.length; i++) {
          const a = e.patrol[i], c = e.patrol[(i + 1) % e.patrol.length]
          expect(nav.findPath(a.x, a.z, c.x, c.z, nav.cols * nav.rows), `patrol leg ${a.x},${a.z} → ${c.x},${c.z}`).not.toBeNull()
        }
        expect(Math.hypot(e.patrol[0].x - e.x, e.patrol[0].z - e.z)).toBeLessThan(25)
      }
    })

    it("brings reinforcements in at the edges far from the extractions", () => {
      for (const r of L.reinforcementSpawns) {
        expect(edgeDist(r)).toBeLessThanOrEqual(5)
        for (const e of L.extractions) expect(Math.hypot(r.x - e.x, r.z - e.z)).toBeGreaterThanOrEqual(35)
      }
    })

    it("fits every crate next to cover without blocking solids or doorways", () => {
      for (const l of L.lootSpawns) {
        const rot = Math.abs(Math.sin(l.yaw ?? 0)) > 0.5
        const hw = (rot ? CRATE_D : CRATE_W) / 2 + 0.04, hd = (rot ? CRATE_W : CRATE_D) / 2 + 0.04
        for (const s of ground) {
          const hit = Math.abs(l.x - s.x) < hw + s.w / 2 && Math.abs(l.z - s.z) < hd + s.d / 2 && (s.y ?? 0) < 1
          expect(hit, `crate ${l.x},${l.z} in ${s.style}@${s.x},${s.z}`).toBe(false)
        }
        const near = Math.min(...ground.filter(s => (s.y ?? 0) + s.h >= 0.9).map(s => boxDistance(l.x, l.z, s)))
        expect(near, `crate ${l.x},${l.z} is not next to cover`).toBeLessThanOrEqual(2.5)
        for (const d of L.doorways ?? []) expect(Math.hypot(l.x - d.x, l.z - d.z), `crate ${l.x},${l.z} at a door`).toBeGreaterThan(1.9)
      }
    })

    it("has doorways at least 2.2 m wide that can be walked through", () => {
      expect((L.doorways ?? []).length).toBeGreaterThan(4)
      for (const d of L.doorways ?? []) {
        expect(d.w).toBeGreaterThanOrEqual(2.2)
        const ax = d.x + d.nx * 1.3, az = d.z + d.nz * 1.3, bx = d.x - d.nx * 1.3, bz = d.z - d.nz * 1.3
        expect(nav.walkable(ax, az) && nav.walkable(bx, bz) && nav.lineWalkable(ax, az, bx, bz), `${d.building} door at ${d.x},${d.z}`).toBe(true)
        expect(reachable({ x: ax, z: az }) && reachable({ x: bx, z: bz }), `${d.building} door at ${d.x},${d.z} reachable`).toBe(true)
      }
    })

    it("has 2–4 enterable buildings with a roof above head height and a high-value spot inside", () => {
      const buildings = L.buildings ?? []
      expect(buildings.length).toBeGreaterThanOrEqual(2); expect(buildings.length).toBeLessThanOrEqual(4)
      for (const bd of buildings) {
        expect((L.doorways ?? []).some(d => d.building === bd.id), bd.id).toBe(true)
        const roof = L.solids.find(s => (s.y ?? 0) >= 2.6 && Math.abs(s.x - (bd.x0 + bd.x1) / 2) < 0.01 && Math.abs(s.z - (bd.z0 + bd.z1) / 2) < 0.01 && Math.abs(s.w - (bd.x1 - bd.x0)) < 0.01)
        expect(roof, `${bd.id} roof`).toBeDefined()
        const tier2 = L.lootSpawns.some(l => l.tier === 2 && l.x > bd.x0 && l.x < bd.x1 && l.z > bd.z0 && l.z < bd.z1)
        expect(tier2, `${bd.id} has no tier-2 loot spot inside`).toBe(true)
      }
      const inBuildings = L.lootSpawns.filter(l => l.tier === 2 && buildings.some(bd => l.x > bd.x0 && l.x < bd.x1 && l.z > bd.z0 && l.z < bd.z1))
      expect(inBuildings.length).toBeGreaterThanOrEqual(3)
    })

    it("generates walkable cover points along solids (low and full cover)", () => {
      const cover = computeCoverPoints(L, nav)
      expect(cover.length).toBeGreaterThan(150)
      expect(cover.some(c => c.height >= 1 && c.height <= 1.3)).toBe(true)
      expect(cover.some(c => c.height > 2)).toBe(true)
      for (const c of cover) {
        expect(nav.walkable(c.x, c.z)).toBe(true)
        expect(Math.abs(c.nx) + Math.abs(c.nz)).toBe(1)
        // the solid it hides behind is right behind it (opposite the normal, 0.7–1.2 m away)
        const behind = ground.some(s => {
          const d = boxDistance(c.x, c.z, s)
          return d >= 0.65 && d <= 1.25 && boxDistance(c.x - c.nx * (d + 0.05), c.z - c.nz * (d + 0.05), s) < 0.01
        })
        expect(behind, `cover ${c.x},${c.z}`).toBe(true)
      }
    })

    it("never leaves a walkable spot more than 16 m from cover", () => {
      const cover = computeCoverPoints(L, nav)
      let worst = 0, at = ""
      for (let r = 0; r < nav.rows; r += 2) for (let c = 0; c < nav.cols; c += 2) {
        if (nav.blocked[r * nav.cols + c]) continue
        const x = nav.centerX(c), z = nav.centerZ(r)
        let best = Infinity
        for (const p of cover) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) best = d }
        if (Math.sqrt(best) > worst) { worst = Math.sqrt(best); at = `${x},${z}` }
      }
      expect(worst, `farthest from cover at ${at}`).toBeLessThanOrEqual(16)
    })

    it("sizes wooden crate stacks in whole 1.2 m crates", () => {
      for (const s of L.solids.filter(s => s.style === "crate")) for (const v of [s.w, s.d, s.h]) expect(Math.abs(v / 1.2 - Math.round(v / 1.2)), JSON.stringify(s)).toBeLessThan(0.01)
    })

    it("keeps areas, props and lights well-formed", () => {
      for (const a of L.areas ?? []) expect(a.w > 0 && a.d > 0).toBe(true)
      for (const p of L.props ?? []) expect(Number.isFinite(p.x) && Number.isFinite(p.z), p.kind).toBe(true)
      expect((L.lights ?? []).length).toBeLessThanOrEqual(4)
    })
  })
}
