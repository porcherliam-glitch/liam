/**
 * maps.test.ts — layout validation for the quarantine zone (zonemap.ts) and the base (basemap.ts): builds the
 * obstacles exactly like world.ts (zoneObstacles + structure models) plus the enemy NavGrid and checks districts,
 * reachability from every insertion, extraction circles, loot spots, camps, objectives, airdrops, doorways, cover,
 * and for the base every station and plot interaction point at every structure level.
 */
import { describe, expect, it } from "vitest"
import { STRUCTURES, STRUCTURE_ORDER, type StructureId } from "./baseData"
import { baseMap, structureModel, wallsModel } from "./basemap"
import type { Obstacle } from "./collision"
import { computeCoverPoints, type MapSolid } from "./maps"
import { NavGrid } from "./nav"
import type { Vec2 } from "./types"
import type { ContainerKind, StationId } from "./zone"
import { zoneMap, zoneObstacles } from "./zonemap"

/** Flood fill over open nav cells with the same moves A* uses (8 directions, no corner cutting). */
function flood(nav: NavGrid, x: number, z: number): Uint8Array {
  const seen = new Uint8Array(nav.cols * nav.rows)
  const s = nav.nearestWalkable(x, z, 3)
  if (!s) return seen
  const start = nav.rowOf(s.z) * nav.cols + nav.colOf(s.x)
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

function boxDistance(x: number, z: number, o: Obstacle): number {
  const dx = Math.max(o.minX - x, 0, x - o.maxX), dz = Math.max(o.minZ - z, 0, z - o.maxZ)
  return Math.hypot(dx, dz)
}
const blocksWalking = (o: Obstacle) => (o.minY ?? 0) <= 1.6
const DEPTH: Record<ContainerKind, number> = { crate: 0.85, cabinet: 0.5, fridge: 0.7, toolbox: 0.3, weaponcase: 0.45, medcab: 0.3, safe: 0.65, duffel: 0.44 }
const WIDTH: Record<ContainerKind, number> = { crate: 1.25, cabinet: 0.8, fridge: 0.75, toolbox: 0.6, weaponcase: 1.3, medcab: 0.7, safe: 0.7, duffel: 1.05 }

describe("zone", () => {
  const Z = zoneMap()
  const obstacles = zoneObstacles(Z)
  const nav = new NavGrid(Z.bounds, obstacles, 0.45, 1)
  const b = Z.bounds
  const floods = Z.insertions.map(i => flood(nav, i.x, i.z))
  const cell = (p: Vec2) => nav.rowOf(p.z) * nav.cols + nav.colOf(p.x)
  const reachable = (p: Vec2) => nav.walkable(p.x, p.z) && floods.every(f => f[cell(p)] === 1)
  /** Nearest walkable cell within r is reachable (points next to props, e.g. pump handles). */
  const reachableNear = (p: Vec2, r = 1.5) => { const w = nav.nearestWalkable(p.x, p.z, r); return !!w && floods.every(f => f[cell(w)] === 1) }
  const ground = obstacles.filter(blocksWalking)
  const districtAt = (x: number, z: number) => Z.districts.find(d => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ)
  const clearOf = (x: number, z: number, r: number) => !ground.some(o => boxDistance(x, z, o) < r)

  it("is a ~620 m square with nine districts that tile it exactly", () => {
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(600); expect(b.maxX - b.minX).toBeLessThanOrEqual(660)
    expect(b.maxZ - b.minZ).toBeGreaterThanOrEqual(600); expect(b.maxZ - b.minZ).toBeLessThanOrEqual(660)
    expect(new Set(Z.districts.map(d => d.id))).toEqual(new Set(["town", "industry", "harbor", "military", "lab", "farm", "station", "forest", "quarry"]))
    let area = 0
    for (const d of Z.districts) {
      area += (d.maxX - d.minX) * (d.maxZ - d.minZ)
      for (const e of Z.districts) if (e !== d) {
        const ox = Math.min(d.maxX, e.maxX) - Math.max(d.minX, e.minX), oz = Math.min(d.maxZ, e.maxZ) - Math.max(d.minZ, e.minZ)
        expect(ox <= 0 || oz <= 0, `${d.id} overlaps ${e.id}`).toBe(true)
      }
    }
    expect(area).toBe((b.maxX - b.minX) * (b.maxZ - b.minZ))
    expect(Z.districts.find(d => d.id === "town")!.danger).toBe(1)
    expect(Z.districts.find(d => d.id === "lab")!.danger).toBe(3)
    expect(Z.labels.map(l => l.name).sort()).toEqual(Z.districts.map(d => d.name).sort())
  })

  it("is one connected walkable area: every insertion reaches every other walkable cell", () => {
    let walkable = 0, unreachable = 0
    for (let i = 0; i < nav.blocked.length; i++) if (!nav.blocked[i]) { walkable++; if (!floods.every(f => f[i] === 1)) unreachable++ }
    expect(walkable).toBeGreaterThan(200000)
    expect(unreachable).toBe(0)
  })

  it("has four insertions at the edge with HQ gates 1/1/2/2", () => {
    expect(Z.insertions.map(i => i.id)).toEqual(["south_road", "west_field", "north_wood", "east_rail"])
    expect(Z.insertions.map(i => i.hq)).toEqual([1, 1, 2, 2])
    for (const i of Z.insertions) {
      expect(reachable(i), i.id).toBe(true)
      expect(Math.min(i.x - b.minX, b.maxX - i.x, i.z - b.minZ, b.maxZ - i.z), i.id).toBeLessThan(20)
      expect(districtAt(i.x, i.z)?.id, i.id).toBe(i.district)
      expect(clearOf(i.x, i.z, 1.5), i.id).toBe(true)
    }
  })

  it("keeps the five exits (ids, kinds, requirements) on open, reachable ground", () => {
    expect(Z.extractions.map(e => [e.id, e.kind, JSON.stringify(e.requirement)])).toEqual([
      ["heli_town", "heli", "null"], ["boat", "boat", JSON.stringify({ item: "fuel" })], ["tunnel", "tunnel", JSON.stringify({ item: "key_tunnel" })],
      ["gate", "gate", JSON.stringify({ money: 600 })], ["heli_farm", "heli", "null"],
    ])
    for (const e of Z.extractions) {
      expect(reachable(e), e.id).toBe(true)
      const hit = ground.find(o => boxDistance(e.x, e.z, o) < e.radius)
      expect(hit, `${e.id} circle overlaps an obstacle`).toBeUndefined()
      expect(districtAt(e.x, e.z), e.id).toBeTruthy()
    }
    expect(districtAt(Z.extractions[0].x, Z.extractions[0].z)!.id).toBe("town")
    expect(districtAt(Z.extractions[1].x, Z.extractions[1].z)!.id).toBe("harbor")
  })

  it("places objectives, the boss arena and supply-drop spots where they belong", () => {
    const where: Record<string, string> = { generator: "station", radio_mast: "military", pump: "farm", lab_terminal: "lab" }
    expect(Z.objectives.map(o => o.id)).toEqual(["generator", "radio_mast", "pump", "lab_terminal"])
    for (const o of Z.objectives) { expect(reachableNear(o, 0.8), o.id).toBe(true); expect(districtAt(o.x, o.z)?.id, o.id).toBe(where[o.id]) }
    expect(districtAt(Z.bossArena.x, Z.bossArena.z)?.id).toBe("lab")
    expect(clearOf(Z.bossArena.x, Z.bossArena.z, Z.bossArena.radius)).toBe(true)
    expect(reachable(Z.bossArena)).toBe(true)
    expect(Z.airdropSpots.length).toBeGreaterThanOrEqual(5)
    for (const a of Z.airdropSpots) { expect(reachable(a), `${a.x},${a.z}`).toBe(true); expect(clearOf(a.x, a.z, 3.5), `airdrop ${a.x},${a.z}`).toBe(true) }
  })

  it("has 5–7 mercenary camps with walkable patrols and one infected zone per district", () => {
    expect(Z.mercCamps.length).toBeGreaterThanOrEqual(5); expect(Z.mercCamps.length).toBeLessThanOrEqual(7)
    for (const c of Z.mercCamps) {
      expect(c.squad).toBeGreaterThanOrEqual(3); expect(c.squad).toBeLessThanOrEqual(6)
      expect(reachable(c), c.id).toBe(true)
      for (const p of c.patrol) expect(reachable(p), `${c.id} patrol ${p.x},${p.z}`).toBe(true)
    }
    expect(new Set(Z.infectedZones.map(z => z.district))).toEqual(new Set(Z.districts.map(d => d.id)))
    const dens = (id: string) => Z.infectedZones.find(z => z.district === id)!.density
    expect(dens("town")).toBeGreaterThan(dens("farm")); expect(dens("lab")).toBeGreaterThan(dens("industry"))
  })

  it("has 250–400 loot spots, each free-standing, reachable, with tiers following the danger", () => {
    expect(Z.lootSpots.length).toBeGreaterThanOrEqual(250); expect(Z.lootSpots.length).toBeLessThanOrEqual(400)
    const tiers = new Map<number, number[]>()
    for (const s of Z.lootSpots) {
      const yaw = s.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw), d = DEPTH[s.container], w = WIDTH[s.container]
      const access = { x: s.x + fx * (d / 2 + 0.7), z: s.z + fz * (d / 2 + 0.7) }
      expect(reachableNear(access, 0.9), `loot ${s.container} at ${s.x},${s.z}`).toBe(true)
      // the container's footprint (axis-aligned for yaw multiples of 90°) is free of walls and furniture
      const across = Math.abs(fx) > 0.5
      const hw = (across ? d : w) / 2 - 0.02, hd = (across ? w : d) / 2 - 0.02
      if ((s.y ?? 0) < 0.3 && s.container !== "medcab") {
        const hit = ground.find(o => o.maxX > s.x - hw && o.minX < s.x + hw && o.maxZ > s.z - hd && o.minZ < s.z + hd)
        expect(hit, `loot ${s.container} at ${s.x},${s.z} overlaps an obstacle`).toBeUndefined()
      }
      const dz = districtAt(s.x, s.z)!
      if (!tiers.has(dz.danger)) tiers.set(dz.danger, [])
      tiers.get(dz.danger)!.push(s.tier)
      const inBuilding = Z.buildings.some(bd => !bd.solid && s.x > bd.x0 && s.x < bd.x1 && s.z > bd.z0 && s.z < bd.z1)
      if (s.indoor) expect(inBuilding || s.container === "duffel", `indoor flag at ${s.x},${s.z}`).toBe(true)
    }
    const avg = (k: number) => { const t = tiers.get(k)!; return t.reduce((a, b) => a + b, 0) / t.length }
    expect(avg(1)).toBeLessThan(avg(2)); expect(avg(2)).toBeLessThan(avg(3))
    expect(Z.lootSpots.filter(s => s.indoor).length).toBeGreaterThan(Z.lootSpots.length * 0.5)
    for (const d of Z.districts) expect(Z.lootSpots.filter(s => districtAt(s.x, s.z)?.id === d.id).length, d.id).toBeGreaterThanOrEqual(6)
  })

  it("has walkable doorways (both sides reachable) and plenty of cover", () => {
    expect(Z.doorways.length).toBeGreaterThan(150)
    for (const d of Z.doorways) {
      for (const s of [-1, 1]) {
        const p = { x: d.x + d.nx * s * 1.1, z: d.z + d.nz * s * 1.1 }
        expect(reachableNear(p, 0.8), `doorway ${d.building} at ${d.x},${d.z}`).toBe(true)
      }
    }
    const cover = computeCoverPoints(Z, nav)
    expect(cover.length).toBeGreaterThan(1500)
    for (const c of cover.slice(0, 400)) expect(nav.walkable(c.x, c.z)).toBe(true)
  })

  it("keeps solids inside the bounds and the layout immutable", () => {
    for (const s of Z.solids) {
      expect(s.x - s.w / 2, s.style).toBeGreaterThanOrEqual(b.minX - 0.01); expect(s.x + s.w / 2, s.style).toBeLessThanOrEqual(b.maxX + 0.01)
      expect(s.z - s.d / 2, s.style).toBeGreaterThanOrEqual(b.minZ - 0.01); expect(s.z + s.d / 2, s.style).toBeLessThanOrEqual(b.maxZ + 0.01)
    }
    expect(zoneMap()).toBe(Z)
    const again = zoneObstacles(Z)
    expect(again).not.toBe(obstacles); expect(again.length).toBe(obstacles.length)
    expect(obstacles.length).toBe(Z.solids.length + 4)
  })
})

describe("base", () => {
  const B = baseMap()
  const levelsAll = (n: number): Record<StructureId, number> => Object.fromEntries(STRUCTURE_ORDER.map(id => [id, Math.min(n, STRUCTURES[id].max)])) as Record<StructureId, number>
  const solidsAt = (levels: Record<StructureId, number>): MapSolid[] => {
    const out = [...B.solids]
    for (const p of B.plots) { out.push(...structureModel(p, levels[p.structure]).solids); if (p.structure === "walls") out.push(...wallsModel(levels.walls).solids) }
    return out
  }
  const configs: Array<[string, Record<StructureId, number>]> = [["all 0", levelsAll(0)], ["all 1", levelsAll(1)], ["all 2", levelsAll(2)], ["all max", levelsAll(3)], ["mixed", { ...levelsAll(3), walls: 0, tower: 2, hq: 1, generator: 0 }]]

  it("has every station and one plot per structure, fronts facing the yard", () => {
    const ids: StationId[] = ["trader", "stash", "radio", "workbench", "armory", "clinic", "build", "lab", "gate"]
    expect(new Set(B.stations.map(s => s.id))).toEqual(new Set(ids))
    expect(B.plots.map(p => p.structure).sort()).toEqual([...STRUCTURE_ORDER].sort())
    expect(B.bounds.maxX - B.bounds.minX).toBeGreaterThanOrEqual(70)
    expect(B.bounds.maxZ - B.bounds.minZ).toBeGreaterThanOrEqual(100)
    for (const a of B.attackSpawns) expect(a.z).toBeGreaterThan(B.gate.z + 20)
  })

  for (const [name, levels] of configs) {
    it(`keeps stations, plot fronts, spawn and the gate reachable (${name})`, () => {
      const solids = solidsAt(levels)
      const obstacles = zoneObstacles({ solids, bounds: B.bounds })
      const nav = new NavGrid(B.bounds, obstacles, 0.45, 1)
      const f = flood(nav, B.spawn.x, B.spawn.z)
      const ok = (p: Vec2, r = 0.8) => { const w = nav.nearestWalkable(p.x, p.z, r); return !!w && f[nav.rowOf(w.z) * nav.cols + nav.colOf(w.x)] === 1 }
      expect(nav.walkable(B.spawn.x, B.spawn.z)).toBe(true)
      expect(ok({ x: B.spawn.x, z: B.spawn.z - 6 }, 0.5)).toBe(true)
      for (const s of B.stations) expect(ok(s), `station ${s.id}`).toBe(true)
      for (const p of B.plots) expect(ok({ x: p.x, z: p.z + p.d / 2 + 1 }), `plot ${p.structure}`).toBe(true)
      for (const a of B.attackSpawns) expect(ok(a) && ok(B.gate), `attack ${a.x},${a.z}`).toBe(true)
      // structure solids stay on their plots (walls/second tower excepted) and never cover a station
      for (const p of B.plots) {
        if (p.structure === "walls" || p.structure === "tower" || p.structure === "turrets") continue
        for (const s of structureModel(p, levels[p.structure]).solids) {
          expect(s.x - s.w / 2, p.structure).toBeGreaterThanOrEqual(p.x - p.w / 2 - 0.01); expect(s.x + s.w / 2, p.structure).toBeLessThanOrEqual(p.x + p.w / 2 + 0.01)
          expect(s.z - s.d / 2, p.structure).toBeGreaterThanOrEqual(p.z - p.d / 2 - 0.01); expect(s.z + s.d / 2, p.structure).toBeLessThanOrEqual(p.z + p.d / 2 + 0.01)
        }
      }
    })
  }

  it("changes the perimeter with the walls level (broken fence has holes, higher levels are closed)", () => {
    const inside = (lvl: number) => {
      const solids = solidsAt({ ...levelsAll(0), walls: lvl })
      const nav = new NavGrid(B.bounds, zoneObstacles({ solids, bounds: B.bounds }), 0.45, 1)
      // block the gate passage: is the yard still reachable from outside?
      const gateBlock = { minX: -6, maxX: 6, minZ: 35, maxZ: 37.5, height: 3 }
      const nav2 = new NavGrid(B.bounds, [...zoneObstacles({ solids, bounds: B.bounds }), gateBlock], 0.45, 1)
      const f = flood(nav2, 0, 70)
      return { open: nav.walkable(0, 36), reach: f[nav2.rowOf(0) * nav2.cols + nav2.colOf(0)] === 1 }
    }
    expect(inside(0)).toEqual({ open: true, reach: true })
    for (const l of [1, 2, 3]) expect(inside(l)).toEqual({ open: true, reach: false })
    expect(wallsModel(3).solids.length).toBeGreaterThan(4)
    expect(structureModel(B.plots.find(p => p.structure === "tower")!, 2).solids.length).toBeGreaterThan(structureModel(B.plots.find(p => p.structure === "tower")!, 1).solids.length)
  })
})
