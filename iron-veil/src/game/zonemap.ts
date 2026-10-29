/**
 * zonemap.ts — the quarantine zone "Sperrzone Kesselbrück" as pure data (no three.js); world.ts builds the meshes.
 * ~620 × 620 m (bounds ±310), north = -Z. Nine districts on a 3 × 3 grid:
 *   forest (Nordwald)      | lab (Forschungslabor)  | military (Militäranlage = authored "Nachtgitter")
 *   farm (Bauernhof)       | town (Altstadt)        | industry (Industriegebiet = authored "Grauzone")
 *   station (Bahnhof)      | harbor (Hafen = "Stahlhafen" + basin) | quarry (Steinbruch)
 * Roads: R2 (z 0) west–east, R1 (x 0) lab gate – town square – harbour gate, R4 (z -118) along the forest edge to the
 * industry, R5 (x 120) to the military gate, R7 (x -200) north–south through forest, farm and station, R6 (z 297)
 * coastal road, R8 (x 200) to the quarry. Railway (tracks z 133 / 137) west–east. Sea south of the zone, harbour basin
 * x 56..105, z 198..310 (blocked by an invisible "proxy-water" solid, quay edges are visual).
 * Everything that blocks is a solid (one obstacle each); props are visual only; trees are data for instancing (their
 * trunks are "proxy-tree" solids). Deterministic: the same seed always produces the same zone.
 * zoneObstacles(map) is the exact obstacle list world.ts uses (solids in order, then the perimeter n, e, s, w).
 */
import type { Obstacle } from "./collision"
import { Draft, PAINT, getLayout, type BuildingSpec, type DraftData, type MapLayout, type MapProp, type MapSolid, type Opening, type Side } from "./maps"
import type { Surface, Vec2 } from "./types"
import type { ContainerKind, District, ExtractionDef, InfectedZoneDef, Insertion, LootCategory, LootSpot, MercCamp, ObjectiveAnchor, ZoneLayout } from "./zone"

export interface Rect { x0: number; z0: number; x1: number; z1: number }
/** Tree for instancing: v 0 spruce, 1 broadleaf, 2 dead, 3 bush; h height (m); r yaw. */
export interface TreeSpot { x: number; z: number; h: number; v: 0 | 1 | 2 | 3; r: number }
export interface ZoneMap extends ZoneLayout, Omit<DraftData, "solids"> {
  solids: MapSolid[]
  ground: { surface: Surface; look: string }
  /** Open water (below the ground plane) — the harbour basin; the sea lies south of bounds.maxZ. */
  water: { rects: Rect[]; level: number }
  trees: TreeSpot[]
  roads: Rect[]
  /** Openings in the zone's outer fence (visual: closed gates). */
  gates: Array<{ side: Side; at: number; w: number }>
}

const BOUND = 310
const P = (x: number, z: number): Vec2 => ({ x, z })
const PASTEL = [0xd8c8a4, 0xc9b28c, 0xb9c2b0, 0xd6b8a0, 0xc4ccd0, 0xe0d6be, 0xb8a890, 0xccb8b0, 0xa8b4a0, 0xd2c0a0]
const ROOF = [0x9a4a32, 0x8a3e2c, 0x6e5a50, 0x5a5c60, 0xa65a3a, 0x7a3a30]
const DISTRICTS: District[] = [
  { id: "town", name: "Altstadt", minX: -105, maxX: 105, minZ: -105, maxZ: 100, danger: 1 },
  { id: "industry", name: "Industriegebiet", minX: 105, maxX: 310, minZ: -105, maxZ: 100, danger: 2 },
  { id: "harbor", name: "Hafen", minX: -105, maxX: 105, minZ: 100, maxZ: 310, danger: 2 },
  { id: "military", name: "Militäranlage", minX: 105, maxX: 310, minZ: -310, maxZ: -105, danger: 3 },
  { id: "lab", name: "Forschungslabor", minX: -105, maxX: 105, minZ: -310, maxZ: -105, danger: 3 },
  { id: "farm", name: "Bauernhof", minX: -310, maxX: -105, minZ: -105, maxZ: 100, danger: 1 },
  { id: "station", name: "Bahnhof", minX: -310, maxX: -105, minZ: 100, maxZ: 310, danger: 2 },
  { id: "forest", name: "Nordwald", minX: -310, maxX: -105, minZ: -310, maxZ: -105, danger: 1 },
  { id: "quarry", name: "Steinbruch", minX: 105, maxX: 310, minZ: 100, maxZ: 310, danger: 2 },
]

/** Container depth along its facing axis (local Z), see loot.ts. */
const DEPTH: Record<ContainerKind, number> = { crate: 0.85, cabinet: 0.5, fridge: 0.7, toolbox: 0.3, weaponcase: 0.45, medcab: 0.3, safe: 0.65, duffel: 0.44 }
/** Container width along local X. */
const WIDTH: Record<ContainerKind, number> = { crate: 1.25, cabinet: 0.8, fridge: 0.75, toolbox: 0.6, weaponcase: 1.3, medcab: 0.7, safe: 0.7, duffel: 1.05 }
const CONTAINERS: Record<LootCategory, ContainerKind[]> = {
  civil: ["cabinet", "crate", "cabinet", "duffel"], food: ["fridge", "crate", "fridge"], medical: ["medcab", "cabinet", "medcab"],
  industrial: ["toolbox", "crate", "crate"], military: ["weaponcase", "crate", "duffel", "weaponcase"], tech: ["safe", "cabinet"], lab: ["medcab", "safe", "fridge"],
}
/** Facing yaw for a container standing against a wall on `side` (front points away from the wall). */
const FACE_YAW: Record<Side, number> = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

let cache: ZoneMap | null = null
/** The zone (cached; never mutated after creation). */
export function zoneMap(): ZoneMap { return cache ??= buildZone() }

/** Obstacles exactly as the world uses them: one AABB per solid, then four perimeter boxes 8 m outside the bounds. */
export function zoneObstacles(z: { solids: ZoneMap["solids"]; bounds: ZoneMap["bounds"] }): Obstacle[] {
  const out: Obstacle[] = z.solids.map(s => {
    const o: Obstacle = { minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2, height: (s.y ?? 0) + s.h, minY: s.y ?? 0 }
    const sf = SURFACE_OF[s.style]; if (sf) o.surface = sf
    return o
  })
  const b = z.bounds, m = 8
  out.push(
    { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.minZ, height: 6 },
    { minX: b.maxX, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m, height: 6 },
    { minX: b.minX - m, maxX: b.maxX + m, minZ: b.maxZ, maxZ: b.maxZ + m, height: 6 },
    { minX: b.minX - m, maxX: b.minX, minZ: b.minZ - m, maxZ: b.maxZ + m, height: 6 },
  )
  return out
}
export const SURFACE_OF: Record<string, Obstacle["surface"]> = {
  container: "metal", cargo: "metal", truckcab: "metal", car: "metal", cabin: "metal", machine: "metal", rack: "metal", crane: "metal",
  rollup: "metal", cabinet: "metal", kiosk: "metal", portakabin: "metal", hatch: "metal", pipes: "metal", wagon: "metal", apc: "metal",
  tractor: "metal", fuelpump: "metal", "proxy-tank": "metal", "proxy-metal": "metal",
  crate: "wood", pallets: "wood", boards: "wood", logs: "wood", bale: "wood", "proxy-tree": "wood", desk: "wood", counter: "wood", bench: "wood", pew: "wood",
  sandbag: "dirt", hesco: "dirt", "proxy-heap": "dirt", "proxy-bale": "dirt",
}

// ---------------------------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------------------------
function buildZone(): ZoneMap {
  const m = new Draft()
  const R = rng(0x5eed2026)
  const pick = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]
  const loot: LootSpot[] = []
  const trees: TreeSpot[] = []
  const roads: Rect[] = []
  const roadAreas: Array<[number, number, number, number, Surface, string]> = []
  const clear: Array<[number, number, number]> = []   // x, z, radius: no trees/scatter
  const noTree: Rect[] = []
  let uid = 0
  const districtOf = (x: number, z: number) => DISTRICTS.find(d => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) ?? DISTRICTS[0]
  const tierFor = (x: number, z: number, bonus = 0): 0 | 1 | 2 => {
    const d = districtOf(x, z).danger, r = R()
    const t = d === 1 ? (r < 0.8 ? 0 : 1) : d === 2 ? (r < 0.2 ? 0 : r < 0.8 ? 1 : 2) : (r < 0.3 ? 1 : 2)
    return Math.max(0, Math.min(2, t + bonus)) as 0 | 1 | 2
  }
  const addLoot = (x: number, z: number, yaw: number, category: LootCategory, container: ContainerKind, indoor: boolean, o: { tier?: 0 | 1 | 2; y?: number } = {}) => {
    const s: LootSpot = { x: round(x), z: round(z), yaw: round(yaw), tier: o.tier ?? tierFor(x, z), category, container, indoor }
    if (o.y) s.y = o.y
    loot.push(s)
  }
  /** Container against the inner face of a wall: side = the wall's side of the room, along = coordinate along the wall. */
  const lootAt = (room: Rect, side: Side, along: number, category: LootCategory, container: ContainerKind = pick(CONTAINERS[category]), tier?: 0 | 1 | 2) => {
    const dep = DEPTH[container] / 2 + 0.03
    const x = side === "w" ? room.x0 + dep : side === "e" ? room.x1 - dep : along
    const z = side === "n" ? room.z0 + dep : side === "s" ? room.z1 - dep : along
    addLoot(x, z, FACE_YAW[side], category, container, true, { tier })
  }
  const outdoorLoot = (x: number, z: number, yaw: number, category: LootCategory, container: ContainerKind = pick(CONTAINERS[category])) => addLoot(x, z, yaw, category, container, false)

  /** Door centres sit on nav-cell centres (k + 0.5) so 1.2 m doors stay passable on the 1 m grid (agent radius 0.45). */
  const snap = (v: number) => Math.round(v - 0.5) + 0.5
  const snapOps = (ops: Opening[] = []) => ops.map(o => (!o.kind || o.kind === "door" || o.kind === "gate") ? { ...o, at: snap(o.at) } : o)
  const wall = (ax: number, az: number, bx: number, bz: number, h: number, t: number, style: string, ops: Opening[] = [], o: { tint?: number } = {}) => m.wall(ax, az, bx, bz, h, t, style, snapOps(ops), o)

  // --- roads ---------------------------------------------------------------------------------------------------
  /** Road along X (z centre) or Z (x centre): asphalt with markings, optional pavements. */
  const roadX = (z: number, x0: number, x1: number, w = 8, o: { walk?: number; dirt?: boolean; lines?: boolean } = {}) => {
    const h = w / 2, walk = o.walk ?? 0
    if (walk) roadAreas.push([x0, z - h - walk, x1, z + h + walk, "concrete", "pavement"])
    roadAreas.push([x0, z - h, x1, z + h, o.dirt ? "dirt" : "asphalt", o.dirt ? "dirt" : "asphalt"])
    roads.push({ x0, z0: z - h - walk, x1, z1: z + h + walk })
    if (o.dirt || o.lines === false) return
    m.dashed(x0 + 2, z, x1 - 2, z, 0.15, 3, 3)
    for (const e of [z - h + 0.35, z + h - 0.35]) m.line(x0, e - 0.07, x1, e + 0.07)
  }
  const roadZ = (x: number, z0: number, z1: number, w = 8, o: { walk?: number; dirt?: boolean; lines?: boolean } = {}) => {
    const h = w / 2, walk = o.walk ?? 0
    if (walk) roadAreas.push([x - h - walk, z0, x + h + walk, z1, "concrete", "pavement"])
    roadAreas.push([x - h, z0, x + h, z1, o.dirt ? "dirt" : "asphalt", o.dirt ? "dirt" : "asphalt"])
    roads.push({ x0: x - h - walk, z0, x1: x + h + walk, z1 })
    if (o.dirt || o.lines === false) return
    m.dashed(x, z0 + 2, x, z1 - 2, 0.15, 3, 3)
    for (const e of [x - h + 0.35, x + h - 0.35]) m.line(e - 0.07, z0, e + 0.07, z1)
  }
  const lampsX = (z: number, x0: number, x1: number, off: number, step = 28) => { let i = 0; for (let x = x0; x <= x1; x += step, i++) m.prop("streetlamp", x, z + (i % 2 ? off : -off), { h: 7, rot: i % 2 ? 0 : Math.PI }) }
  const lampsZ = (x: number, z0: number, z1: number, off: number, step = 28) => { let i = 0; for (let z = z0; z <= z1; z += step, i++) m.prop("streetlamp", x + (i % 2 ? off : -off), z, { h: 7, rot: i % 2 ? Math.PI / 2 : -Math.PI / 2 }) }

  // --- enclosures ----------------------------------------------------------------------------------------------
  type Gap = [number, number]
  /** Fence/wall around a rectangle; gaps per side as [centre, width] (open gates with posts). */
  const enclose = (r: Rect, style: Partial<Record<Side, "fence" | "double" | "wall" | "none">>, gaps: Partial<Record<Side, Gap[]>> = {}, barbed = false, wallStyle = "brickwall", wallH = 2.62) => {
    for (const side of ["n", "s", "w", "e"] as Side[]) {
      const st = style[side] ?? "fence"; if (st === "none") continue
      const g = gaps[side] ?? []
      const alongX = side === "n" || side === "s"
      const c = side === "n" ? r.z0 : side === "s" ? r.z1 : side === "w" ? r.x0 : r.x1
      const a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1
      const seg = (off: number, bb: boolean) => {
        const cc = c + off * (side === "n" || side === "w" ? -1 : 1)
        const s0 = a0 - (off ? off : 0), s1 = a1 + (off ? off : 0)
        if (alongX) m.fence(s0, cc, s1, cc, g, bb); else m.fence(cc, s0, cc, s1, g, bb)
      }
      if (st === "wall") {
        const t = 0.3, ops: Opening[] = g.map(([at, w]) => ({ at, w, kind: "gate" as const, top: wallH }))
        if (alongX) m.wall(a0, c, a1, c, wallH, t, wallStyle, ops, { tint: wallStyle === "brickwall" ? undefined : 0xb8b6ae }); else m.wall(c, a0, c, a1, wallH, t, wallStyle, ops, { tint: wallStyle === "brickwall" ? undefined : 0xb8b6ae })
      } else {
        seg(0, barbed || st === "double")
        if (st === "double") seg(4.2, true)
      }
      for (const [at, w] of g) for (const s of [-1, 1]) {
        const p = at + s * (w / 2 + 0.15)
        m.prop("post", alongX ? p : c, alongX ? c : p, { h: 2.7, r: 0.1 })
      }
    }
  }

  // --- buildings -------------------------------------------------------------------------------------------------
  const opposite: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" }
  const gable = (r: Rect, y: number, alongX: boolean, tint: number, steep = 0.42, far = false, wallStyle = "plaster", wallTint?: number) => {
    const span = alongX ? r.z1 - r.z0 : r.x1 - r.x0
    const p: Omit<MapProp, "kind" | "x" | "z"> = { y, w: r.x1 - r.x0 + 0.7, d: r.z1 - r.z0 + 0.7, h: span * steep, v: alongX ? 0 : 1, tint, text: wallStyle }
    if (wallTint !== undefined) p.tint2 = wallTint
    if (far) p.far = true
    m.prop("gable", (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, p)
  }
  interface HouseSpec { r: Rect; face: Side; floors: number; enter: boolean; style?: string; tint?: number; name?: string; cat?: LootCategory; loot?: number; sign?: string; roof?: number }
  /** Town house: enterable ground floor (door + windows on the street side, a partition with a door, loot against the side walls) or a closed block. */
  const house = (s: HouseSpec) => {
    const id = `h${uid++}`, r = s.r, h = 3.2, upper = (s.floors - 1) * 3
    const style = s.style ?? (R() < 0.3 ? "brick" : "plaster")
    const tint = s.tint ?? (style === "brick" ? undefined : pick(PASTEL))
    const alongX = s.face === "n" || s.face === "s"
    const lo = alongX ? r.x0 : r.z0, hi = alongX ? r.x1 : r.z1, len = hi - lo
    const roofTint = s.roof ?? pick(ROOF)
    if (s.enter) {
      const t = 0.25
      const doorAt = snap(lo + len * (0.25 + R() * 0.5))
      const faceOps: Opening[] = [{ at: doorAt, w: 1.4 }]
      for (let a = lo + 1.6; a < hi - 1.4; a += 2.7) if (Math.abs(a - doorAt) > 2.1) faceOps.push(s.sign ? { at: a, w: 2.2, kind: "window", sill: 0.6, top: 2.4 } : { at: a, w: 1.2, kind: "window" })
      const backOps: Opening[] = []
      const backDoor = R() < 0.4 ? snap(lo + len * (0.2 + R() * 0.6)) : null
      if (backDoor !== null) backOps.push({ at: backDoor, w: 1.2 })
      for (let a = lo + 1.8; a < hi - 1.6; a += 3.2) if (backDoor === null || Math.abs(a - backDoor) > 2) backOps.push({ at: a, w: 1.1, kind: "window" })
      const spec: BuildingSpec = { id, name: s.name ?? "Wohnhaus", x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h, upper, style, tint, t, floor: "wood", floorLook: R() < 0.5 ? "plank" : "tiles" }
      spec[s.face] = faceOps; spec[opposite[s.face]] = backOps
      m.building(spec)
      m.buildings[m.buildings.length - 1].doorLamps = false
      // partition parallel to the street with a door; rooms front/back
      const dep = alongX ? r.z1 - r.z0 : r.x1 - r.x0
      const mid = (alongX ? r.z0 : r.x0) + dep * (0.45 + R() * 0.1)
      const pd = snap(lo + len * (0.2 + R() * 0.6))
      if (alongX) wall(r.x0 + t, mid, r.x1 - t, mid, h, 0.14, "plaster", [{ at: pd, w: 1.1 }], { tint: 0xd8d0c0 })
      else wall(mid, r.z0 + t, mid, r.z1 - t, h, 0.14, "plaster", [{ at: pd, w: 1.1 }], { tint: 0xd8d0c0 })
      const inner: Rect = { x0: r.x0 + t, z0: r.z0 + t, x1: r.x1 - t, z1: r.z1 - t }
      const roomA: Rect = alongX ? (s.face === "n" ? { ...inner, z1: mid - 0.07 } : { ...inner, z0: mid + 0.07 }) : (s.face === "w" ? { ...inner, x1: mid - 0.07 } : { ...inner, x0: mid + 0.07 })
      const roomB: Rect = alongX ? (s.face === "n" ? { ...inner, z0: mid + 0.07 } : { ...inner, z1: mid - 0.07 }) : (s.face === "w" ? { ...inner, x0: mid + 0.07 } : { ...inner, x1: mid - 0.07 })
      const n = s.loot ?? (R() < 0.55 ? 2 : 1), cat = s.cat ?? "civil"
      const sides: Side[] = alongX ? ["w", "e"] : ["n", "s"]
      const centre = (q: Rect) => alongX ? (q.z0 + q.z1) / 2 : (q.x0 + q.x1) / 2
      lootAt(roomA, sides[0], centre(roomA), cat)
      if (n > 1) lootAt(roomB, sides[1], centre(roomB), R() < 0.5 ? "food" : cat, R() < 0.5 ? "fridge" : undefined)
      if (n > 2) lootAt(roomB, sides[0], centre(roomB), cat)
      if (R() < 0.6) { // furniture: table / shelf against the back wall of room B
        const q = roomB, w0 = alongX ? q.x0 + 1.2 : q.z0 + 1.2
        if (alongX) m.rect(w0, s.face === "n" ? q.z1 - 0.6 : q.z0, w0 + 1.6, s.face === "n" ? q.z1 : q.z0 + 0.6, 0.8, "desk")
        else m.rect(s.face === "w" ? q.x1 - 0.6 : q.x0, w0, s.face === "w" ? q.x1 : q.x0 + 0.6, w0 + 1.6, 0.8, "desk")
      }
      gable(r, upper ? h + upper : h + 0.5, alongX, roofTint, 0.42, false, style, tint)
    } else {
      m.rect(r.x0, r.z0, r.x1, r.z1, h + upper, style, { tint })
      m.buildings.push({ id, name: s.name ?? "Wohnhaus", x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h, style, tint, upper, roof: "gable", solid: true, face: s.face })
      gable(r, h + upper, alongX, roofTint, 0.42, false, style, tint)
    }
    if (s.sign) {
      const f = s.face, x = f === "w" ? r.x0 : f === "e" ? r.x1 : (r.x0 + r.x1) / 2, z = f === "n" ? r.z0 : f === "s" ? r.z1 : (r.z0 + r.z1) / 2
      m.prop("decal", x + (f === "e" ? 0.05 : f === "w" ? -0.05 : 0), z + (f === "s" ? 0.05 : f === "n" ? -0.05 : 0), { y: 2.75, w: Math.min(len - 1, 4.2), h: 0.55, face: f, v: 3, text: s.sign })
    }
    if (R() < 0.5) {
      const cx = alongX ? lo + len * (0.2 + R() * 0.6) : (r.x0 + r.x1) / 2, cz = alongX ? (r.z0 + r.z1) / 2 : lo + len * (0.2 + R() * 0.6)
      m.prop("chimney", cx, cz, { y: h + upper, h: (alongX ? r.z1 - r.z0 : r.x1 - r.x0) * 0.42 + 1.2 })
    }
  }
  /** Fills a street-side strip with houses (widths 8–12 m, occasional alleys). */
  const houseRow = (r: Rect, face: Side, o: { enter?: number; floors?: [number, number]; cat?: LootCategory } = {}) => {
    const alongX = face === "n" || face === "s"
    const lo = alongX ? r.x0 : r.z0, hi = alongX ? r.x1 : r.z1
    let a = lo
    while (hi - a >= 7) {
      let w = 8 + R() * 4
      if (hi - a - w < 7) w = hi - a
      const q: Rect = alongX ? { x0: a, z0: r.z0, x1: a + w, z1: r.z1 } : { x0: r.x0, z0: a, x1: r.x1, z1: a + w }
      const fl = o.floors ?? [2, 3]
      house({ r: q, face, floors: fl[0] + Math.floor(R() * (fl[1] - fl[0] + 1)), enter: R() < (o.enter ?? 0.6), cat: o.cat })
      a += w + (R() < 0.35 ? 2 + R() * 1.5 : 0.02)
    }
  }
  /** Simple enterable hall (warehouse/barn/garage) with gates and windows, optional loot. */
  const hall = (id: string, name: string, r: Rect, h: number, style: string, tint: number | undefined, ops: Partial<Record<Side, Opening[]>>, o: { upper?: number; floorLook?: string; roof?: "gable" | "flat"; roofTint?: number; lamps?: boolean } = {}) => {
    const spec: BuildingSpec = { id, name, ...r, h, style, tint, upper: o.upper, floor: "concrete", floorLook: o.floorLook ?? "floor", n: snapOps(ops.n), s: snapOps(ops.s), e: snapOps(ops.e), w: snapOps(ops.w) }
    m.building(spec)
    if (!o.lamps) m.buildings[m.buildings.length - 1].doorLamps = false
    if (o.roof === "gable") gable(r, o.upper ? h + o.upper : h + 0.5, r.x1 - r.x0 >= r.z1 - r.z0, o.roofTint ?? 0x6a6e70, 0.3, false, style, tint)
    return { x0: r.x0 + 0.3, z0: r.z0 + 0.3, x1: r.x1 - 0.3, z1: r.z1 - 0.3 }
  }
  const tree = (x: number, z: number, v: 0 | 1 | 2, h: number) => {
    trees.push({ x: round(x), z: round(z), h: round(h), v, r: round(R() * 6.28) })
    m.solid(x, z, v === 0 ? 0.45 : 0.55, v === 0 ? 0.45 : 0.55, Math.min(h, 7), "proxy-tree")
  }
  const car = (x: number, z: number, along: "x" | "z") => m.car(x, z, along, pick([PAINT.red, PAINT.blue, PAINT.grey, PAINT.white, PAINT.green, PAINT.navy, 0x3a3a3a, 0x8a8a7a]), Math.floor(R() * 3))
  const wreck = (x: number, z: number, along: "x" | "z") => {
    m.car(x, z, along, pick([0x6a4a3a, 0x5a4636, 0x4a4038, 0x7a5a40]), 9)
    if (R() < 0.6) outdoorLoot(along === "x" ? x + 3.2 : x + 1.6, along === "x" ? z + 1.5 : z + 3, R() * 6, R() < 0.5 ? "civil" : "food", R() < 0.6 ? "duffel" : "crate")
  }

  // =================================================================================================================
  // Ground
  // =================================================================================================================
  m.area(-BOUND - 40, -BOUND - 40, BOUND + 40, BOUND + 40, "grass", "grass")
  m.area(-305, -305, -105, -105, "dirt", "forest")                     // forest floor
  m.area(105, 100, 310, 310, "gravel", "gravel")                       // quarry district
  m.area(-105, 100, 105, 197, "gravel", "gravel")                      // harbour hinterland
  m.area(105, -310, 310, -105, "dirt", "dirt")                         // military district
  // railway ballast (two main tracks z 133 / 137)
  m.area(-BOUND - 40, 129, BOUND + 40, 141, "gravel", "ballast")
  for (const z of [133, 137]) m.prop("track", -BOUND - 30, z, { x2: BOUND + 30, z2: z })

  // =================================================================================================================
  // Authored districts (phase 1 maps): Grauzone = industry, Stahlhafen = harbour, Nachtgitter = military
  // =================================================================================================================
  const stampLegacy = (L: MapLayout, dx: number, dz: number, drop: (p: MapProp) => boolean = () => false) => {
    const b = L.bounds
    const clip = (a: { x: number; z: number; w: number; d: number }) => {
      const x0 = Math.max(a.x - a.w / 2, b.minX), x1 = Math.min(a.x + a.w / 2, b.maxX), z0 = Math.max(a.z - a.d / 2, b.minZ), z1 = Math.min(a.z + a.d / 2, b.maxZ)
      return x1 > x0 && z1 > z0 ? { ...a, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 } : null
    }
    m.stamp({
      solids: L.solids, areas: (L.areas ?? []).map(clip).filter(a => a !== null) as DraftData["areas"],
      props: (L.props ?? []).filter(p => !drop(p) && p.kind !== "breach").map(p => p.kind === "weeds" ? { ...p, ...clipWeeds(p, b) } : p),
      lights: L.lights ?? [], doorways: L.doorways ?? [], buildings: L.buildings ?? [],
    }, dx, dz)
    const inside = (x: number, z: number) => (L.buildings ?? []).some(bd => x > bd.x0 && x < bd.x1 && z > bd.z0 && z < bd.z1)
    for (const s of L.lootSpawns) {
      const id = districtOf(s.x + dx, s.z + dz).id
      const cat: LootCategory = id === "military" ? (R() < 0.75 ? "military" : "medical") : id === "harbor" ? (R() < 0.6 ? "industrial" : R() < 0.5 ? "civil" : "food") : (R() < 0.65 ? "industrial" : R() < 0.5 ? "tech" : "civil")
      const tier = (id === "military" ? Math.max(1, s.tier) : s.tier) as 0 | 1 | 2
      const kind: ContainerKind = cat === "military" ? (s.tier === 2 ? "weaponcase" : pick(["crate", "duffel", "weaponcase"])) : cat === "tech" ? "safe" : pick(CONTAINERS[cat])
      addLoot(s.x + dx, s.z + dz, s.yaw ?? 0, cat, kind === "safe" && !inside(s.x, s.z) ? "crate" : kind, inside(s.x, s.z), { tier })
    }
  }

  // Grauzone (industrial outskirts) — centre (200, -2): its cross road (local z 2) continues R2 (z 0)
  const GZ = { x: 200, z: -2 }
  stampLegacy(getLayout("greyzone"), GZ.x, GZ.z)
  enclose({ x0: 145, z0: -57, x1: 255, z1: 53 }, { n: "fence", e: "fence", s: "fence", w: "wall" }, { n: [[200, 10]], s: [[200, 10]], e: [[0, 8]], w: [[0, 8]] })

  // Stahlhafen (container terminal) — centre (0, 253): quay east (basin) and south (sea)
  const SH = { x: 0, z: 253 }
  stampLegacy(getLayout("harbor"), SH.x, SH.z, p => p.kind === "ship" || (p.kind === "weeds" && p.z < -50))
  enclose({ x0: -56, z0: 197, x1: 56, z1: 309 }, { n: "fence", w: "fence", e: "none", s: "none" }, { n: [[0, 10]], w: [[297, 9]] })

  // Nachtgitter (military compound) — centre (200, -200), double fence, checkpoint west (local z 1.5), breaches south
  const NG = { x: 200, z: -200 }
  stampLegacy(getLayout("blacksite"), NG.x, NG.z)
  enclose({ x0: 142, z0: -258, x1: 258, z1: -142 }, { n: "double", e: "double", s: "double", w: "double" }, { w: [[-198.5, 8]], s: [[160, 3.2], [240, 3.2]] })

  // =================================================================================================================
  // Road network
  // =================================================================================================================
  roadX(0, -BOUND, -102, 8)
  roadX(0, 102, 145, 8)
  roadX(0, 255, BOUND, 8)
  roadZ(0, -128, -102, 8)
  roadZ(0, 100, 197, 8)
  roadX(-118, -203.5, 203.5, 7)
  roadZ(200, -114.5, -57, 7)
  roadZ(120, -195, -121.5, 7)
  roadX(-198.5, 116.5, 138, 7, { lines: false })
  roadZ(-200, -BOUND, -121.5, 6, { dirt: true })
  roadZ(-200, -114.5, -4, 7)
  roadZ(-200, 4, 293.5, 7)
  roadX(297, -BOUND, -56, 7)
  roadZ(200, 53, 192, 7)
  // level crossings
  for (const x of [-200, 0, 200]) { m.area(x - 4, 129, x + 4, 141, "asphalt", "asphalt"); for (const s of [-1, 1]) m.prop("crossing", x + s * 5, 135 - s * 7.5, { rot: s > 0 ? 0 : Math.PI }) }
  // lamp posts along the main roads (most are dead; world.ts lights a few)
  lampsX(0, -300, -110, 6, 36); lampsX(0, 110, 140, 6); lampsX(0, 262, 300, 6)
  lampsZ(0, -122, -110, 6); lampsZ(0, 105, 190, 6, 30)
  lampsX(-118, -190, 190, 5.5, 40)

  // =================================================================================================================
  // Town (Altstadt) — blocks between streets x -52 / 0 / 52 and z -52 / 0 / 48, market square |x|,|z| < 16
  // =================================================================================================================
  {
    m.area(-102, -102, 102, 100, "grass", "lawn")
    // streets with pavements
    roadX(0, -102, -16, 8, { walk: 2 }); roadX(0, 16, 102, 8, { walk: 2 })
    roadZ(0, -102, -16, 8, { walk: 2 }); roadZ(0, 16, 100, 8, { walk: 2 })
    for (const x of [-52, 52]) roadZ(x, -102, 100, 6, { walk: 1 })
    for (const z of [-52, 48]) roadX(z, -102, 102, 6, { walk: 1 })
    m.area(-16, -16, 16, 16, "concrete", "pavement")
    m.area(-4, -16, 4, 16, "asphalt", "asphalt"); m.area(-16, -4, 16, 4, "asphalt", "asphalt")
    for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) { m.solid(x, z, 1.2, 1.2, 0.5, "concrete", { tint: 0xb0aca2 }); tree(x, z, 1, 9 + R() * 2) }
    m.rect(-9.5, -9.5, -6.5, -8.5, 0.45, "bench"); m.rect(6.5, 8.5, 9.5, 9.5, 0.45, "bench")
    // street furniture: advertising pillars, phone box, bus stop, bins
    m.rect(-13.7, -7.7, -12.3, -6.3, 2.8, "litfass"); m.rect(12.3, 6.3, 13.7, 7.7, 2.8, "litfass")
    m.rect(12, -8.6, 13.1, -7.5, 2.4, "phonebox")
    m.rect(30, -7.6, 33.4, -6.2, 2.5, "shelter")
    for (const [x, z] of [[-5.4, -30], [5.4, 30], [-5.4, 70], [5.4, -80], [-30, 5.4], [30, -5.4], [-70, -5.4], [70, 5.4], [-49.5, 20], [49.5, -20]]) m.rect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.95, "bin")
    lampsZ(0, -96, -20, 5.3, 26); lampsZ(0, 22, 96, 5.3, 26); lampsX(0, -96, -20, 5.3, 26); lampsX(0, 22, 96, 5.3, 26)
    for (const x of [-52, 52]) lampsZ(x, -90, 90, 3.6, 36)
    for (const z of [-52, 48]) lampsX(z, -90, 90, 3.6, 36)

    // block (1,1) NW of the square: Rathaus + row on the west street
    const rh = hall("rathaus", "Rathaus", { x0: -36, z0: -46, x1: -17, z1: -24 }, 4, "plaster", 0xd9cfb4, {
      s: [{ at: -22, w: 2.4 }, { at: -33, w: 1.6, kind: "window" }, { at: -29.5, w: 1.6, kind: "window" }, { at: -19.2, w: 1.4, kind: "window" }],
      e: [{ at: -35, w: 1.4 }, { at: -41, w: 1.6, kind: "window" }, { at: -29, w: 1.6, kind: "window" }],
      n: [{ at: -32, w: 1.6, kind: "window" }, { at: -22, w: 1.6, kind: "window" }],
    }, { upper: 4, floorLook: "tiles", roof: "gable", roofTint: 0x6e5a50 })
    wall(-27, -45.7, -27, -24.3, 4, 0.18, "plaster", [{ at: -30, w: 1.2 }, { at: -40, w: 1.2 }], { tint: 0xd8d0c0 })
    wall(-35.7, -35, -27.1, -35, 4, 0.18, "plaster", [{ at: -31, w: 1.2 }], { tint: 0xd8d0c0 })
    m.rect(-25.6, -45.6, -23.2, -44.8, 0.78, "desk"); m.rect(-35.6, -27, -34.8, -25, 0.78, "desk")
    lootAt({ ...rh, x1: -27.1, z1: -35.1 }, "n", -31, "tech", "safe", 1); lootAt({ ...rh, x1: -27.1, z0: -34.9 }, "w", -30, "civil", "cabinet")
    lootAt({ ...rh, x0: -26.9 }, "n", -20, "medical", "medcab"); lootAt({ ...rh, x0: -26.9 }, "e", -42.5, "civil", "cabinet")
    m.prop("decal", -26.5, -23.95, { y: 3.2, w: 4.4, h: 0.6, face: "s", v: 2, text: "RATHAUS" })
    houseRow({ x0: -48, z0: -48, x1: -38, z1: -6 }, "w")
    houseRow({ x0: -36, z0: -16, x1: -16, z1: -6 }, "s", { enter: 1, floors: [3, 3] })
    // block (2,1) NE: church with tower (landmark), graveyard, houses on the north street
    m.area(6, -48, 48, -6, "grass", "lawn")
    m.rect(18, -26, 26, -18, 26, "plaster", { tint: 0xc8c2b4, far: true })
    m.prop("steeple", 22, -22, { y: 26, w: 8.6, h: 13, far: true, tint: 0x4a5a58 })
    m.prop("decal", 22, -17.95, { y: 19.5, w: 2.6, h: 2.6, face: "s", v: 7, text: "XII" })
    const nave = hall("church", "St.-Martin-Kirche", { x0: 26, z0: -32, x1: 46, z1: -14 }, 9, "plaster", 0xd6d0c2, {
      s: [{ at: 36, w: 2.6, top: 3.6 }, { at: 30, w: 1.4, kind: "window", sill: 2.6, top: 7.2 }, { at: 42, w: 1.4, kind: "window", sill: 2.6, top: 7.2 }],
      n: [{ at: 30, w: 1.4, kind: "window", sill: 2.6, top: 7.2 }, { at: 36, w: 1.4, kind: "window", sill: 2.6, top: 7.2 }, { at: 42, w: 1.4, kind: "window", sill: 2.6, top: 7.2 }],
      e: [{ at: -23, w: 1.6, kind: "window", sill: 3, top: 7.5 }],
    }, { floorLook: "tiles" })
    gable({ x0: 26, z0: -32, x1: 46, z1: -14 }, 9.5, true, 0x4a5a58, 0.55, true, "plaster", 0xd6d0c2)
    for (let x = 29; x < 42; x += 2.2) for (const z of [-27.5, -20.5]) m.rect(x, z - 1.6, x + 0.7, z + 1.6, 0.9, "pew")
    m.rect(43.4, -25, 45, -21, 1.1, "counter")
    lootAt(nave, "e", -28.5, "civil", "crate"); lootAt(nave, "n", 44, "medical", "cabinet")
    for (let i = 0; i < 7; i++) m.solid(29 + i * 2.6, -35.2, 0.6, 0.18, 0.9, "concrete", { tint: 0x9a9890 })
    houseRow({ x0: 6, z0: -48, x1: 48, z1: -38 }, "n")
    // block (1,2) SW
    houseRow({ x0: -48, z0: 6, x1: -27, z1: 16 }, "n", { enter: 0.8, floors: [2, 3] })
    houseRow({ x0: -48, z0: 18, x1: -38, z1: 44 }, "w")
    houseRow({ x0: -34, z0: 34, x1: -6, z1: 44 }, "s")
    houseRow({ x0: -16, z0: 18, x1: -6, z1: 32 }, "e", { enter: 1 })
    // shops on the square
    house({ r: { x0: -15, z0: -26, x1: -6, z1: -17 }, face: "e", floors: 3, enter: true, sign: "APOTHEKE", cat: "medical", loot: 3, name: "Apotheke" })
    house({ r: { x0: 6, z0: 17, x1: 16, z1: 26 }, face: "n", floors: 3, enter: true, sign: "BÄCKEREI", cat: "food", loot: 2, name: "Bäckerei" })
    house({ r: { x0: -26, z0: 6, x1: -16.5, z1: 15 }, face: "n", floors: 2, enter: true, sign: "GASTHAUS LINDE", cat: "food", loot: 2, name: "Gasthaus" })
    // block (2,2) SE: park with the town helicopter landing zone
    m.area(6, 6, 48, 44, "grass", "lawn")
    m.area(6, 6, 48, 9, "concrete", "pavement")
    for (let x = 14; x <= 46; x += 5.5) { tree(x, 41.5, 1, 8 + R() * 4); if (x > 20) tree(x, 11.5, 1, 8 + R() * 3) }
    for (let z = 16; z <= 36; z += 6) tree(46, z, 1, 9 + R() * 3)
    m.rect(40, 30, 40.6, 33, 0.45, "bench"); m.rect(18, 36, 21, 36.6, 0.45, "bench")
    clear.push([27, 25, 10])
    m.prop("helipad", 27, 25, { r: 5.5 })
    // block (3,1) gas station on R2
    m.area(56, -48, 100, -6, "asphalt", "asphalt")
    m.rect(64, -36, 88, -22, 0.6, "roof", { y: 4.4, v: 1 })
    for (const x of [65, 87]) for (const z of [-35, -23]) m.rect(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 4.4, "pillar")
    for (const x of [70, 76, 82]) m.rect(x - 0.5, -29.4, x + 0.5, -28.6, 1.6, "fuelpump")
    m.prop("decal", 76, -36.1, { y: 4.45, w: 6, h: 0.55, face: "n", v: 4, text: "TANKSTELLE" })
    const kiosk = hall("kiosk", "Tankstellenshop", { x0: 88, z0: -44, x1: 99, z1: -30 }, 3.4, "plaster", 0xd8d8d0, { w: [{ at: -37, w: 1.6 }, { at: -41.5, w: 2.2, kind: "window", sill: 0.5 }, { at: -33, w: 2.2, kind: "window", sill: 0.5 }] })
    m.rect(91, -38, 92, -34, 1.05, "counter")
    lootAt(kiosk, "e", -40, "food", "fridge"); lootAt(kiosk, "n", 95, "food", "crate"); lootAt(kiosk, "s", 95, "civil", "cabinet")
    wreck(72, -16, "x"); car(94, -14, "z")
    // block (3,2) supermarket + parking
    m.area(56, 6, 100, 44, "asphalt", "asphalt")
    const sm = hall("market", "Supermarkt", { x0: 70, z0: 12, x1: 99, z1: 40 }, 4.6, "cladding", 0xc9c4b8, {
      n: [{ at: 78, w: 3 }, { at: 73, w: 2.4, kind: "window", sill: 0.4, top: 3 }, { at: 84, w: 2.4, kind: "window", sill: 0.4, top: 3 }, { at: 90, w: 2.4, kind: "window", sill: 0.4, top: 3 }],
      s: [{ at: 94, w: 3.6, kind: "gate", top: 3.6 }], w: [{ at: 33, w: 1.4 }],
    })
    m.prop("decal", 85, 11.95, { y: 3.4, w: 9, h: 1, face: "n", v: 5, text: "FRISCHMARKT" })
    for (const x of [75, 80.5, 86, 91.5]) m.rect(x, 18, x + 1.2, 33, 1.8, "rack")
    for (const x of [73, 78]) m.rect(x, 14, x + 2.4, 15, 1, "counter")
    lootAt(sm, "e", 18, "food", "fridge"); lootAt(sm, "e", 24, "food", "fridge"); lootAt(sm, "s", 82, "food", "crate")
    lootAt(sm, "w", 22, "civil", "cabinet"); lootAt(sm, "s", 76, "food", "crate"); lootAt(sm, "e", 30, "medical", "cabinet")
    for (let i = 0; i < 4; i++) car(60, 12 + i * 7, "x")
    wreck(62, 40.5, "x")
    // other blocks: houses along the streets
    houseRow({ x0: -66, z0: -100, x1: -56, z1: -56 }, "e"); houseRow({ x0: -100, z0: -66, x1: -68, z1: -56 }, "s")
    houseRow({ x0: -48, z0: -66, x1: -6, z1: -56 }, "s"); houseRow({ x0: -48, z0: -100, x1: -38, z1: -68 }, "w"); houseRow({ x0: -16, z0: -100, x1: -6, z1: -68 }, "e")
    houseRow({ x0: 6, z0: -66, x1: 48, z1: -56 }, "s"); houseRow({ x0: 6, z0: -100, x1: 16, z1: -68 }, "w"); houseRow({ x0: 38, z0: -100, x1: 48, z1: -68 }, "e")
    houseRow({ x0: 56, z0: -100, x1: 66, z1: -56 }, "w"); houseRow({ x0: 68, z0: -66, x1: 100, z1: -56 }, "s")
    houseRow({ x0: -66, z0: -48, x1: -56, z1: -6 }, "e"); houseRow({ x0: -100, z0: -16, x1: -68, z1: -6 }, "s")
    houseRow({ x0: -66, z0: 6, x1: -56, z1: 44 }, "e"); houseRow({ x0: -100, z0: 6, x1: -68, z1: 16 }, "n")
    houseRow({ x0: -100, z0: 52, x1: -90, z1: 62 }, "n", { floors: [1, 2] }); houseRow({ x0: -66, z0: 52, x1: -56, z1: 98 }, "e")
    houseRow({ x0: -48, z0: 52, x1: -6, z1: 62 }, "n"); houseRow({ x0: -16, z0: 64, x1: -6, z1: 98 }, "e"); houseRow({ x0: -48, z0: 66, x1: -38, z1: 98 }, "w")
    houseRow({ x0: 56, z0: 52, x1: 100, z1: 62 }, "n"); houseRow({ x0: 56, z0: 64, x1: 66, z1: 98 }, "w")
    // water tower (landmark) in block (0,3)
    for (const [x, z] of [[-83, 73], [-77, 73], [-83, 79], [-77, 79]]) m.rect(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 18, "pillar", { far: true })
    m.prop("watertower", -80, 76, { y: 18, r: 5.2, h: 8, far: true, tint: 0x8a9294 })
    m.rect(-92, 84, -86, 90, 3, "block", { tint: 0x9a968c })
    m.fence(-90, 68, -70, 68, [[-80, 3]]); m.fence(-90, 68, -90, 84); m.fence(-70, 68, -70, 86)
    // school in block (2,3)
    const sch = hall("school", "Grundschule", { x0: 12, z0: 60, x1: 44, z1: 78 }, 3.6, "plaster", 0xd8c49a, {
      n: [{ at: 28, w: 2.4 }, { at: 16, w: 2, kind: "window" }, { at: 20, w: 2, kind: "window" }, { at: 36, w: 2, kind: "window" }, { at: 40, w: 2, kind: "window" }],
      s: [{ at: 16, w: 2, kind: "window" }, { at: 22, w: 2, kind: "window" }, { at: 34, w: 2, kind: "window" }, { at: 40, w: 2, kind: "window" }],
      e: [{ at: 69, w: 1.4 }],
    }, { upper: 3.4, floorLook: "tiles", roof: "gable", roofTint: 0x8a3e2c })
    wall(24, 60.3, 24, 77.7, 3.6, 0.16, "plaster", [{ at: 66, w: 1.2 }], { tint: 0xe0d8c8 }); wall(33, 60.3, 33, 77.7, 3.6, 0.16, "plaster", [{ at: 66, w: 1.2 }], { tint: 0xe0d8c8 })
    for (const x of [15, 18, 21, 36, 39]) m.rect(x, 70, x + 1.6, 70.7, 0.75, "desk")
    lootAt(sch, "n", 13.5, "civil", "cabinet"); lootAt(sch, "s", 30, "medical", "medcab"); lootAt(sch, "n", 42.5, "tech", "cabinet")
    m.prop("decal", 28, 59.95, { y: 2.85, w: 5.2, h: 0.55, face: "n", v: 3, text: "GRUNDSCHULE" })
    m.area(12, 80, 44, 96, "concrete", "pavement")
    // garage in block (3,3)
    const gar = hall("garage", "Autowerkstatt", { x0: 76, z0: 72, x1: 98, z1: 92 }, 5, "block", 0x9a968c, { w: [{ at: 78, w: 4, kind: "gate", top: 4 }, { at: 86, w: 1.4 }], n: [{ at: 87, w: 2, kind: "window" }] }, { lamps: false })
    m.rect(84, 76, 88.4, 77.8, 0.9, "car", { tint: 0x7a2a22, v: 2 }); m.rect(80, 88, 84, 91.6, 1.1, "machine", { tint: PAINT.red, v: 2 })
    lootAt(gar, "e", 80, "industrial", "toolbox"); lootAt(gar, "s", 92, "industrial", "crate"); lootAt(gar, "n", 94, "industrial", "toolbox")
    m.prop("decal", 75.95, 82, { y: 4.1, w: 5, h: 0.6, face: "w", v: 4, text: "KFZ MEISTERBETRIEB" })
    // parked cars and wrecks along the streets
    for (const [x, z, a] of [[-53.6, -30, "z"], [-53.6, 20, "z"], [53.6, 75, "z"], [-30, 49.6, "x"], [30, -50.4, "x"], [-80, 2.4, "x"], [40, 2.4, "x"], [-2.4, 60, "z"], [2.4, -70, "z"]] as const) (R() < 0.4 ? wreck : car)(x, z, a)
    m.truck(-24, -2.4, "w", PAINT.white, 0xc8c4b8)
    outdoorLoot(-24, 1.4, Math.PI, "civil", "duffel")
    m.rect(-4.5, 30, -3.6, 34, 1.05, "jersey"); m.rect(3.6, 36, 4.5, 40, 1.05, "jersey"); m.rect(-2, 45.6, 2, 46.4, 1.05, "jersey")
    // backyards: trees and sheds
    for (const [x, z] of [[-80, -80], [-28, -84], [28, -82], [80, -82], [-84, -32], [-84, 28], [-30, 26], [-95, 92], [-28, 82], [71, 70]]) {
      tree(x + (R() - 0.5) * 6, z + (R() - 0.5) * 6, 1, 7 + R() * 5)
      if (R() < 0.6) tree(x + 6 + R() * 4, z - 4 + R() * 8, R() < 0.3 ? 0 : 1, 6 + R() * 5)
      if (R() < 0.5) m.rect(x - 8, z + 2, x - 5, z + 5, 2.2, "boards", { tint: 0x8a7458 })
      for (let k = 0; k < 3; k++) { const bx = x + (R() - 0.5) * 12, bz = z + (R() - 0.5) * 12; if (!m.solids.some(q => Math.abs(q.x - bx) < q.w / 2 + 0.9 && Math.abs(q.z - bz) < q.d / 2 + 0.9)) trees.push({ x: round(bx), z: round(bz), h: round(1 + R() * 1.2), v: 3, r: round(R() * 6.28) }) }
    }
    for (let x = 15; x <= 45; x += 4.5) trees.push({ x, z: 43.2, h: 1.3, v: 3, r: x })
  }

  // =================================================================================================================
  // Industry around Grauzone: border post (gate exfil), tank farm, boiler house + smokestack, scrap yard, halls
  // =================================================================================================================
  {
    // border checkpoint on R2 east
    m.rect(287, -9.5, 292, -5.5, 2.8, "kiosk", { tint: 0xd5d2c4 })
    m.prop("boom", 301, -3, { w: 7.5 })
    for (const z of [-10, 10]) { m.rect(300, z - 1.6, 301, z + 1.6, 1.05, "jersey") }
    m.rect(282, 7, 286, 8.2, 0.95, "sandbag"); m.rect(282, -9, 283.2, -6, 0.95, "sandbag")
    m.prop("sign", 304, -6.5, {})
    m.prop("decal", 289.5, -5.45, { y: 2.2, w: 4, h: 0.5, face: "s", v: 6, text: "GRENZPOSTEN OST" })
    outdoorLoot(289.5, -11.2, Math.PI, "military", "duffel")
    // tank farm
    m.rect(264, -96, 306, -95.4, 0.8, "concrete", { tint: 0xa8a49a }); m.rect(264, -24.6, 280, -24, 0.8, "concrete", { tint: 0xa8a49a }); m.rect(290, -24.6, 306, -24, 0.8, "concrete", { tint: 0xa8a49a })
    m.rect(264, -96, 264.6, -24, 0.8, "concrete", { tint: 0xa8a49a }); m.rect(305.4, -96, 306, -24, 0.8, "concrete", { tint: 0xa8a49a })
    for (const [x, z, t] of [[276, -82, 0xd8d6cc], [295, -82, 0xc9c4b8], [276, -45, 0xd8d6cc], [295, -45, 0x9a3328]] as const) m.tank(x, z, 6.5, 11, t, "TK")
    m.prop("pipes", 285, -64, { w: 1.2, d: 30 })
    m.rect(283, -62, 287, -58, 1.3, "machine", { tint: PAINT.yellow, v: 2 })
    outdoorLoot(285, -56.6, 0, "industrial", "toolbox"); outdoorLoot(268, -64, Math.PI / 2, "industrial", "crate")
    // boiler house and smokestack (landmark)
    const boiler = hall("boiler", "Kesselhaus", { x0: 112, z0: 62, x1: 140, z1: 90 }, 9, "brick", undefined, {
      w: [{ at: 76, w: 4, kind: "gate", top: 4.2 }], n: [{ at: 120, w: 1.6 }, { at: 128, w: 2.2, kind: "window", sill: 3, top: 6.5 }, { at: 134, w: 2.2, kind: "window", sill: 3, top: 6.5 }],
      s: [{ at: 120, w: 2.2, kind: "window", sill: 3, top: 6.5 }, { at: 132, w: 2.2, kind: "window", sill: 3, top: 6.5 }],
    }, { roof: "gable", roofTint: 0x5a5c60 })
    m.rect(122, 70, 132, 78, 4.5, "machine", { tint: 0x7a3a2a, v: 2 }); m.rect(134, 82, 138, 88, 2.2, "machine", { tint: 0x6a6e72, v: 2 })
    lootAt(boiler, "n", 116, "industrial", "toolbox"); lootAt(boiler, "s", 124, "industrial", "crate"); lootAt(boiler, "e", 70, "tech", "cabinet")
    m.prop("stack", 146, 76, { r: 2.6, h: 52, far: true, tint: 0x8a5a44 })
    m.rect(144.2, 74.2, 147.8, 77.8, 3, "proxy-metal")
    // halls in the west strip
    const h1 = hall("spedition", "Spedition Nord", { x0: 110, z0: 10, x1: 140, z1: 44 }, 7, "cladding", 0x7d8a96, {
      n: [{ at: 118, w: 4.6, kind: "gate", top: 4.6 }, { at: 132, w: 4.6, kind: "closed" }], w: [{ at: 26, w: 1.4 }], e: [{ at: 36, w: 1.4 }],
    })
    for (const z of [18, 26, 34]) m.rect(124, z, 137, z + 1.2, 3.4, "rack")
    m.rect(112, 38, 116, 42, 1.2, "pallets"); m.rect(113, 14, 115.4, 15.2, 1.2, "crate")
    lootAt(h1, "w", 20, "industrial", "crate"); lootAt(h1, "s", 128, "industrial", "toolbox"); lootAt(h1, "e", 22, "civil", "cabinet")
    m.truck(126, 52, "e", PAINT.blue, 0xd0ccc0)
    const h2 = hall("lagerhalle", "Lagerhalle Nord", { x0: 110, z0: -95, x1: 140, z1: -70 }, 7.5, "cladding", 0x8c9196, {
      s: [{ at: 120, w: 4.6, kind: "gate", top: 4.6 }, { at: 132, w: 2.2, kind: "window" }], e: [{ at: -82, w: 1.4 }],
    })
    for (const x of [116, 124]) m.rect(x, -92, x + 1.2, -78, 3.4, "rack")
    lootAt(h2, "n", 132, "industrial", "crate"); lootAt(h2, "e", -90, "tech", "safe")
    // scrap yard north of Grauzone
    m.area(150, -100, 250, -62, "dirt", "dirt")
    m.fence(150, -100, 196, -100); m.fence(204, -100, 250, -100); m.fence(150, -100, 150, -62); m.fence(250, -100, 250, -62)
    for (let i = 0; i < 14; i++) {
      const x = 156 + (i % 7) * 13 + (R() - 0.5) * 3, z = i < 7 ? -90 + (R() - 0.5) * 4 : -72 + (R() - 0.5) * 4
      if (Math.abs(x - 200) < 7) continue
      if (R() < 0.5) { const h = 1.6 + R() * 1.6; m.rect(x - 2.5, z - 2, x + 2.5, z + 2, h, "proxy-heap"); m.prop("scrap", x, z, { w: 5, d: 4, h }) }
      else m.car(x, z, R() < 0.5 ? "x" : "z", pick([0x6a4a3a, 0x5a4636, 0x7a5a40]), 9)
    }
    m.container(160, -81, "x", 12.2, [PAINT.maroon, PAINT.grey]); m.container(240, -81, "x", 6.1, [PAINT.green])
    outdoorLoot(160, -78.3, 0, "industrial", "crate"); outdoorLoot(222, -66, Math.PI, "civil", "duffel")
    // truck parking east of Grauzone
    m.area(262, 20, 306, 92, "asphalt", "asphalt")
    for (let i = 0; i < 4; i++) m.trailer(270 + i * 9, 80, "z", pick([PAINT.white, PAINT.blue, PAINT.red, PAINT.grey]))
    m.truck(300, 50, "s", PAINT.orange, 0xd0ccc0)
    m.rect(264, 24, 270, 27, 2.7, "portakabin", { tint: 0xd5d2c4 })
    outdoorLoot(267, 28.4, 0, "civil", "cabinet")
    clear.push([285, 52, 8])
  }

  // =================================================================================================================
  // Military surroundings: road to the checkpoint, firing range, vehicle depot
  // =================================================================================================================
  {
    m.area(150, -302, 300, -270, "dirt", "dirt")
    for (let x = 160; x <= 290; x += 26) { m.rect(x - 4, -298, x + 4, -296.8, 1.4, "sandbag"); m.prop("target", x, -297.5, {}) }
    m.rect(156, -276, 296, -275, 0.95, "sandbag")
    const range = hall("rangehut", "Schießstand", { x0: 160, z0: -272, x1: 172, z1: -264 }, 3, "block", 0x6d7058, { s: [{ at: 166, w: 1.4 }] })
    lootAt(range, "n", 166, "military", "weaponcase")
    // vehicle depot east of the compound
    m.area(268, -255, 306, -150, "concrete", "pad")
    for (let i = 0; i < 4; i++) m.rect(274, -246 + i * 22, 281, -240 + i * 22, 2.4, "apc", { tint: 0x4d5536, v: i })
    for (let i = 0; i < 3; i++) m.truck(296, -236 + i * 28, "n", 0x4d5536, 0x5d5a44)
    m.container(288, -160, "z", 6.1, [0x4d5536])
    outdoorLoot(284.5, -160, Math.PI / 2, "military", "crate"); outdoorLoot(277.5, -194, 0, "military", "duffel")
    m.prop("decal", 140.6, -205, { y: 1.6, w: 3, h: 0.7, face: "w", v: 6, text: "SPERRGEBIET" })
  }

  // =================================================================================================================
  // Research lab (compound with wall, main building, isolation annex, decon area, boss arena, parking + helipad)
  // =================================================================================================================
  const ARENA = { x: 0, z: -172, radius: 20 }
  {
    m.area(-90, -295, 90, -128, "concrete", "pad")
    enclose({ x0: -90, z0: -295, x1: 90, z1: -128 }, { n: "wall", e: "wall", w: "wall", s: "wall" }, { s: [[0, 10]] }, false, "concrete", 3.2)
    m.prop("boom", 0, -127, { w: 9 })
    m.rect(8, -136, 13, -131, 2.8, "kiosk", { tint: 0xc8ccd0 })
    m.prop("decal", 0, -127.6, { y: 2.9, w: 6, h: 0.7, face: "s", v: 6, text: "KESSELBRÜCK BIOMEDIZIN" })
    // arena: open forecourt, containment barriers on its rim
    m.area(-24, -196, 24, -150, "concrete", "quay")
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + 0.26, x = ARENA.x + Math.cos(a) * 25, z = ARENA.z + Math.sin(a) * 25
      if (Math.abs(x) < 6 && z > ARENA.z) continue
      if (Math.abs(Math.cos(a)) > 0.7) m.rect(x - 0.45, z - 1.6, x + 0.45, z + 1.6, 1.05, "jersey"); else m.rect(x - 1.6, z - 0.45, x + 1.6, z + 0.45, 1.05, "jersey")
    }
    for (let i = 0; i < 9; i++) m.prop("stain", ARENA.x + (R() - 0.5) * 30, ARENA.z + (R() - 0.5) * 30, { w: 2 + R() * 2, d: 2 + R() * 2, v: 1 })
    m.prop("hazardring", ARENA.x, ARENA.z, { r: ARENA.radius })
    // main building
    const MB: Rect = { x0: -62, z0: -282, x1: 18, z1: -226 }
    hall("labmain", "Forschungszentrum", MB, 4.2, "cladding", 0xd0d4d6, {
      s: [{ at: -22, w: 3 }, { at: -52, w: 2.4, kind: "window" }, { at: -44, w: 2.4, kind: "window" }, { at: -34, w: 2.4, kind: "window" }, { at: -10, w: 2.4, kind: "window" }, { at: 0, w: 2.4, kind: "window" }, { at: 10, w: 2.4, kind: "window" }],
      w: [{ at: -252, w: 2 }], e: [{ at: -252, w: 2 }],
      n: [{ at: -50, w: 2.4, kind: "window" }, { at: -26, w: 2.4, kind: "window" }, { at: 6, w: 2.4, kind: "window" }],
    }, { upper: 4, floorLook: "tiles", lamps: true })
    // corridor walls (z -254 / -250) with doors into the rooms
    const doorsN = [-54, -38, -22, -6, 10], doorsS = [-54, -38, -6, 10]
    wall(-61.7, -254, 17.7, -254, 4.2, 0.2, "plaster", doorsN.map(at => ({ at, w: 1.4 })), { tint: 0xe4e6e2 })
    wall(-61.7, -250, 17.7, -250, 4.2, 0.2, "plaster", [...doorsS.map(at => ({ at, w: 1.4 })), { at: -22, w: 3 }], { tint: 0xe4e6e2 })
    for (const x of [-46, -30, -14, 2]) { wall(x, -281.7, x, -254.1, 4.2, 0.2, "plaster", [], { tint: 0xe4e6e2 }); wall(x, -249.9, x, -226.3, 4.2, 0.2, "plaster", [], { tint: 0xe4e6e2 }) }
    for (const x of [-60, -44, -28, 4]) { m.rect(x + 2, -279, x + 10, -278, 0.95, "desk"); m.rect(x + 2, -264, x + 3, -258, 0.95, "desk") }
    for (const x of [-12, -10, -8, -6, -4]) m.rect(x - 0.4, -281.6, x + 0.4, -280.4, 2, "machine", { tint: 0x2a2e34, v: 6 })
    m.rect(-12.5, -268, -3.5, -267, 0.95, "console")
    const rooms = (x0: number, x1: number, north: boolean): Rect => north ? { x0: x0 + 0.1, z0: -281.7, x1: x1 - 0.1, z1: -254.1 } : { x0: x0 + 0.1, z0: -249.9, x1: x1 - 0.1, z1: -226.3 }
    lootAt(rooms(-61.7, -46, true), "w", -266, "lab", "medcab", 2); lootAt(rooms(-46, -30, true), "e", -262, "lab", "fridge")
    lootAt(rooms(-30, -14, true), "w", -270, "tech", "safe", 2); lootAt(rooms(2, 17.7, true), "e", -270, "lab", "medcab")
    lootAt(rooms(-61.7, -46, false), "s", -54, "medical", "medcab"); lootAt(rooms(-46, -30, false), "s", -38, "lab", "safe", 2)
    lootAt(rooms(-14, 2, false), "w", -236, "lab", "fridge"); lootAt(rooms(2, 17.7, false), "s", 15, "tech", "cabinet")
    m.prop("decal", -22, -225.95, { y: 3.2, w: 7, h: 0.8, face: "s", v: 1, text: "FORSCHUNGSZENTRUM" })
    m.prop("stack", -50, -270, { y: 8.2, r: 1.4, h: 26, far: true, tint: 0xb8bcbe })
    m.prop("rooftop", -22, -254, { y: 8.2, w: 76, d: 52 })
    // isolation annex
    const iso = hall("isolation", "Isolierstation", { x0: 32, z0: -282, x1: 80, z1: -244 }, 4, "block", 0xc4c8c4, {
      s: [{ at: 50, w: 2.4 }, { at: 40, w: 2, kind: "window" }, { at: 62, w: 2, kind: "window" }, { at: 72, w: 2, kind: "window" }], w: [{ at: -262, w: 1.4 }],
    }, { floorLook: "tiles", lamps: true })
    wall(32.3, -263, 79.7, -263, 4, 0.18, "plaster", [{ at: 44, w: 1.4 }, { at: 68, w: 1.4 }], { tint: 0xe4e6e2 })
    wall(56, -281.7, 56, -263.1, 4, 0.18, "plaster", [], { tint: 0xe4e6e2 })
    for (const x of [36, 42, 60, 66, 72]) m.rect(x, -280.5, x + 2, -277, 0.7, "bunk")
    lootAt({ x0: 32.3, z0: -281.7, x1: 55.9, z1: -263.1 }, "w", -270, "medical", "medcab"); lootAt({ x0: 56.1, z0: -281.7, x1: 79.7, z1: -263.1 }, "e", -270, "lab", "medcab")
    lootAt({ x0: 32.3, z0: -262.9, x1: 79.7, z1: -244.3 }, "e", -254, "medical", "cabinet")
    // decon tents and portakabins
    for (const [x, z] of [[40, -214], [54, -214], [68, -214]]) { m.rect(x - 3, z - 2.5, x + 3, z + 2.5, 2.6, "proxy-tent"); m.prop("tent", x, z, { w: 6, d: 5, h: 2.8, tint: 0xd8dcd8 }) }
    m.rect(36, -204, 42, -201.4, 2.7, "portakabin", { tint: 0xd5d2c4 }); m.rect(70, -204, 76, -201.4, 2.7, "portakabin", { tint: 0xd5d2c4, v: 1 })
    outdoorLoot(47, -209, Math.PI, "medical", "crate"); outdoorLoot(61, -209, Math.PI, "lab", "fridge")
    // utility yard
    m.tank(70, -165, 3, 6, 0xc8ccd0, "H2O")
    for (const z of [-180, -172]) m.rect(48, z, 56, z + 3, 2.6, "machine", { tint: 0x3f6c48, v: 2 })
    outdoorLoot(52, -183.5, Math.PI, "industrial", "toolbox")
    // parking and helipad
    m.area(-86, -215, -36, -136, "asphalt", "asphalt")
    m.prop("helipad", -62, -170, { r: 7 }); clear.push([-62, -170, 9])
    for (let i = 0; i < 5; i++) car(-80, -205 + i * 6.5, "x")
    m.truck(-46, -150, "n", 0x4d5536, 0x5d5a44)
    outdoorLoot(-46, -158, Math.PI, "military", "duffel")
    for (const [x, z] of [[-82, -285], [-70, -287], [84, -232], [86, -150], [-84, -230]]) tree(x, z, 1, 7 + R() * 3)
  }

  // =================================================================================================================
  // Farm (Bauernhof): farmstead north of R2, fields, the water pump objective
  // =================================================================================================================
  {
    m.area(-190, -86, -118, -12, "dirt", "dirt")
    m.area(-300, 12, -212, 96, "dirt", "field"); m.area(-190, 12, -110, 96, "dirt", "field")
    m.area(-300, -96, -212, -12, "grass", "grass")
    noTree.push({ x0: -302, z0: 10, x1: -210, z1: 98 }, { x0: -192, z0: 10, x1: -108, z1: 98 }, { x0: -302, z0: -98, x1: -210, z1: -10 })
    // farmhouse
    const fh: Rect = { x0: -184, z0: -76, x1: -168, z1: -62 }
    house({ r: fh, face: "s", floors: 2, enter: true, style: "plaster", tint: 0xe2d8c0, name: "Bauernhaus", cat: "food", loot: 3, roof: 0x8a3e2c })
    // barn
    const barn = hall("barn", "Scheune", { x0: -160, z0: -82, x1: -134, z1: -60 }, 7, "boards", 0x8a5a3a, {
      s: [{ at: -147, w: 5.2, kind: "gate", top: 5 }], e: [{ at: -66, w: 1.4 }], n: [{ at: -147, w: 1.8, kind: "window", sill: 3.5, top: 5 }],
    }, { roof: "gable", roofTint: 0x5a5c60 })
    for (const [x, z] of [[-157, -79], [-157, -76], [-154.5, -79], [-139, -79], [-136.5, -79]]) m.rect(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 1.4, "bale")
    m.rect(-158.6, -70, -153, -64, 2.8, "bale")
    lootAt(barn, "e", -76, "food", "crate"); lootAt(barn, "w", -62.5, "industrial", "toolbox")
    // machine shed (open front)
    m.rect(-186, -46, -164, -45.6, 4.6, "boards", { tint: 0x7a5a3a })
    m.rect(-186, -45.6, -185.6, -34, 4.6, "boards", { tint: 0x7a5a3a }); m.rect(-164.4, -45.6, -164, -34, 4.6, "boards", { tint: 0x7a5a3a })
    m.rect(-186.2, -46.2, -163.8, -33.6, 0.3, "roof", { y: 4.6, v: 1 })
    m.rect(-180, -44, -176.6, -38.8, 2.6, "tractor", { tint: 0x3f7a3a })
    m.rect(-172, -44, -167, -40, 1.3, "cargo", { tint: 0x6a4a30, y: 0.5 })
    lootAt({ x0: -185.6, z0: -45.6, x1: -164.4, z1: -34 }, "e", -36, "industrial", "toolbox")
    m.buildings.push({ id: "maschinenhalle", name: "Maschinenhalle", x0: -186, z0: -46, x1: -164, z1: -34, h: 4.6, style: "boards", upper: 0, roof: "flat", doorLamps: false })
    // silos (landmark)
    for (const z of [-56, -46]) { m.prop("silo", -126, z, { r: 3.6, h: 19, far: true, tint: 0xb8b4aa }); m.rect(-128.6, z - 2.6, -123.4, z + 2.6, 19, "proxy-metal", { far: true }) }
    // water pump (objective) with pump house
    m.rect(-146, -30, -141, -25, 2.6, "block", { tint: 0xc8c0b0 })
    m.prop("handpump", -150, -26, {})
    m.rect(-150.4, -26.4, -149.6, -25.6, 1.1, "proxy-metal")
    // paddock fences, hay bales, trailer, tree line
    m.fence(-118, -84, -108, -84); m.fence(-108, -84, -108, -14)
    for (let i = 0; i < 6; i++) { const x = -298 + R() * 80, z = 18 + R() * 70; if (Math.hypot(x + 255, z - 55) < 14) continue; m.rect(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 1.6, "proxy-bale"); m.prop("bale", x, z, { r: 0.9 }) }
    m.trailer(-130, -20, "x", 0x6a4a30, 9)
    for (let x = -296; x < -112; x += 6 + R() * 4) { if (Math.abs(x + 200) < 8) continue; tree(x, 8 + R() * 1.5, 1, 8 + R() * 4) }
    for (let z = 16; z < 94; z += 7 + R() * 4) tree(-206 + R(), z, 1, 8 + R() * 4)
    outdoorLoot(-140, -22, 0, "civil", "duffel")
    clear.push([-255, 55, 12], [-255, -55, 8])
  }

  // =================================================================================================================
  // Forest (Nordwald): hunters' camp, logging site, hunting stands — trees placed at the end
  // =================================================================================================================
  {
    m.area(-268, -218, -232, -182, "dirt", "dirt")
    const lodge = hall("lodge", "Jagdhütte", { x0: -264, z0: -216, x1: -252, z1: -207 }, 3, "boards", 0x6a4a30, { s: [{ at: -258, w: 1.3 }, { at: -261.5, w: 1.2, kind: "window" }] }, { roof: "gable", roofTint: 0x4a4a46 })
    lootAt(lodge, "n", -258, "civil", "cabinet"); lootAt(lodge, "e", -211.5, "military", "duffel")
    for (const [x, z] of [[-242, -212], [-238, -200]]) { m.rect(x - 1.6, z - 1.3, x + 1.6, z + 1.3, 1.6, "proxy-tent"); m.prop("tent", x, z, { w: 3.2, d: 2.6, h: 1.7, tint: 0x5a6340 }) }
    m.prop("campfire", -248, -196, {}); m.light({ x: -248, y: 1, z: -196, color: 0xff8a3a, intensity: 30, distance: 16 })
    m.rect(-252, -190, -247, -188.8, 0.8, "logs")
    outdoorLoot(-238, -202.2, Math.PI, "military", "duffel")
    clear.push([-250, -200, 20])
    // logging site
    m.area(-168, -276, -122, -232, "dirt", "dirt")
    for (const [x, z] of [[-160, -270], [-160, -262], [-130, -270]]) m.rect(x - 4, z - 1.6, x + 4, z + 1.6, 1.8, "logs")
    m.truck(-140, -246, "e", 0x3f5a3a, 0x6a4a30, 7.2)
    outdoorLoot(-152, -244, 0, "industrial", "toolbox")
    clear.push([-145, -255, 24])
    // hunting stands
    for (const [x, z] of [[-160, -160], [-282, -140], [-180, -290]]) { m.prop("hochsitz", x, z, {}); m.rect(x - 1, z - 1, x + 1, z + 1, 1.2, "proxy-tree") }
    outdoorLoot(-160, -158.2, 0, "civil", "duffel")
    // forest ruin (old forester's house)
    const ruin = hall("forsthaus", "Altes Forsthaus", { x0: -132, z0: -196, x1: -120, z1: -184 }, 3, "brick", undefined, { w: [{ at: -190, w: 1.4 }], s: [{ at: -126, w: 1.2, kind: "window" }] })
    lootAt(ruin, "e", -190, "civil")
    clear.push([-126, -190, 10])
  }

  // =================================================================================================================
  // Station (Bahnhof): station building, platform canopy, goods shed, freight wagons, signal box + generator,
  // railway water tower, service tunnel portal (tunnel exfil), workers' houses and allotments on the coast road
  // =================================================================================================================
  {
    m.area(-300, 144.6, -150, 152, "concrete", "pavement")
    m.prop("track", -292, 127, { x2: -112, z2: 127 }); m.prop("track", -292, 143, { x2: -128, z2: 143 })
    m.area(-296, 124, -110, 144.6, "gravel", "ballast")
    const st = hall("bahnhof", "Bahnhof Kesselbrück", { x0: -248, z0: 153, x1: -216, z1: 166 }, 4, "brick", undefined, {
      n: [{ at: -232, w: 2.4 }, { at: -242, w: 1.6, kind: "window" }, { at: -238, w: 1.6, kind: "window" }, { at: -226, w: 1.6, kind: "window" }, { at: -222, w: 1.6, kind: "window" }],
      s: [{ at: -232, w: 2.4 }, { at: -242, w: 1.6, kind: "window" }, { at: -222, w: 1.6, kind: "window" }], e: [{ at: 159.5, w: 1.4 }],
    }, { upper: 3.6, floorLook: "tiles", roof: "gable", roofTint: 0x5a5c60 })
    wall(-238, 153.3, -238, 165.7, 4, 0.18, "plaster", [{ at: 159.5, w: 1.2 }], { tint: 0xd8d0c0 })
    m.rect(-246, 160, -244, 165.4, 1.05, "counter"); m.rect(-230, 158, -226, 159, 0.5, "bench")
    lootAt({ ...st, x1: -238.1 }, "w", 157, "civil", "cabinet"); lootAt({ ...st, x0: -237.9 }, "e", 162, "food", "crate"); lootAt({ ...st, x1: -238.1 }, "s", -241, "tech", "safe")
    m.prop("decal", -232, 152.95, { y: 4.4, w: 8, h: 0.8, face: "n", v: 2, text: "KESSELBRÜCK" })
    m.prop("clock", -232, 152.7, { y: 3.2 })
    // platform canopy
    for (let x = -284; x <= -164; x += 10) m.rect(x - 0.2, 147.8, x + 0.2, 148.2, 3.6, "pillar")
    m.rect(-286, 145.2, -162, 150.8, 0.25, "roof", { y: 3.6, v: 1 })
    for (const x of [-270, -250, -200, -180]) m.rect(x - 1.5, 149.2, x + 1.5, 149.8, 0.45, "bench")
    // forecourt + access road
    m.area(-252, 166, -203.5, 190, "asphalt", "asphalt")
    car(-246, 182, "z"); car(-240, 183, "z"); wreck(-222, 184, "x")
    clear.push([-228, 178, 6])
    // goods shed
    const gs = hall("gueterschuppen", "Güterschuppen", { x0: -176, z0: 153, x1: -146, z1: 172 }, 6, "brick", undefined, {
      n: [{ at: -168, w: 4, kind: "gate", top: 4 }, { at: -154, w: 4, kind: "closed" }], s: [{ at: -161, w: 1.4 }], e: [{ at: 162, w: 2, kind: "window" }],
    }, { roof: "gable", roofTint: 0x6e5a50 })
    for (const [x, z] of [[-172, 166], [-170, 168], [-150, 156]]) m.rect(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 1.2, "crate")
    m.rect(-164, 160, -158, 161.2, 1.15, "pallets")
    lootAt(gs, "w", 160, "civil", "crate"); lootAt(gs, "s", -152, "industrial", "crate"); lootAt(gs, "e", 168, "civil", "cabinet")
    // freight train on the north siding (gaps to cross)
    let wx = -288
    for (let i = 0; i < 9; i++) {
      const len = i % 3 === 2 ? 12 : 14
      if (wx + len > -207 && wx < -193) wx = -192
      if (i === 4) { m.tunnel(wx + len / 2, 127, "x", len, 0x6a3a2a, [], "wagon"); addLoot(wx + len / 2, 127, 0, "civil", "duffel", true) }
      else if (i % 3 === 2) { m.rect(wx, 125.6, wx + len, 128.4, 2.6, "proxy-tank", { y: 0.9 }); m.prop("tankwagon", wx + len / 2, 127, { w: len, tint: pick([0x2a2c30, 0xd0ccc0, 0x3a4a5a]) }) }
      else m.rect(wx, 125.5, wx + len, 128.5, 3.1, "wagon", { y: 0.95, tint: pick([0x6a3a2a, 0x5a4a3a, 0x3a4a5a, 0x7a3a2a]), v: i })
      wx += len + 2.2
    }
    // signal box and the generator (objective)
    const sb = hall("stellwerk", "Stellwerk", { x0: -126, z0: 110, x1: -118, z1: 120 }, 3.2, "brick", undefined, { w: [{ at: 116, w: 1.2 }], s: [{ at: -122, w: 1.4, kind: "window" }] }, { upper: 3, roof: "gable", roofTint: 0x5a5c60 })
    lootAt(sb, "e", 114, "tech", "cabinet")
    m.rect(-142, 106, -132, 106.4, 3, "block", { tint: 0x9a968c }); m.rect(-142, 106.4, -141.6, 116, 3, "block", { tint: 0x9a968c }); m.rect(-132.4, 106.4, -132, 116, 3, "block", { tint: 0x9a968c })
    m.rect(-142.2, 105.8, -131.8, 116.2, 0.25, "roof", { y: 3, v: 1 })
    m.rect(-140, 107, -134, 110.6, 1.8, "machine", { tint: PAINT.yellow, v: 2 })
    m.prop("decal", -137, 116.25, { y: 2.3, w: 3.6, h: 0.5, face: "s", v: 6, text: "NOTSTROM" })
    lootAt({ x0: -141.6, z0: 106.4, x1: -132.4, z1: 116 }, "w", 114, "industrial", "toolbox")
    m.buildings.push({ id: "notstrom", name: "Notstromschuppen", x0: -142, z0: 106, x1: -132, z1: 116, h: 3, style: "block", upper: 0, roof: "flat", doorLamps: false })
    // railway water tower (landmark)
    for (const [x, z] of [[-279, 158], [-273, 158], [-279, 164], [-273, 164]]) m.rect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 9, "pillar", { far: true })
    m.prop("watertower", -276, 161, { y: 9, r: 3.8, h: 6, far: true, tint: 0x5a4a3a })
    // service tunnel portal (tunnel exfil) in an embankment at the west edge
    m.rect(-310, 186, -302, 216, 7, "rock")
    m.prop("berm", -306, 201, { w: 8, d: 30, h: 7 })
    m.rect(-302.6, 196, -302, 206, 5, "concrete", { tint: 0x9a968c })
    m.prop("portal", -302, 201, { w: 5, h: 4.2 })
    m.prop("decal", -301.9, 201, { y: 4.5, w: 4.6, h: 0.6, face: "e", v: 6, text: "VERSORGUNGSTUNNEL 2" })
    // workers' houses on the coast road
    for (let x = -292; x < -215; x += 13) house({ r: { x0: x, z0: 280, x1: x + 10, z1: 291 }, face: "s", floors: 2, enter: R() < 0.7, cat: "civil" })
    for (let x = -194; x < -110; x += 13) house({ r: { x0: x, z0: 280, x1: x + 10, z1: 291 }, face: "s", floors: R() < 0.5 ? 1 : 2, enter: R() < 0.6, cat: "civil" })
    // allotment gardens with sheds
    m.area(-292, 200, -212, 268, "dirt", "garden"); m.area(-192, 200, -112, 268, "dirt", "garden")
    for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 3; gz++) {
      const x0 = (gx < 3 ? -290 : -190) + (gx % 3) * 26, z0 = 202 + gz * 22
      if (R() < 0.75) { const s = hall(`laube${gx}${gz}`, "Gartenlaube", { x0: x0 + 2, z0: z0 + 2, x1: x0 + 7, z1: z0 + 6 }, 2.4, "boards", pick([0x6a5a3a, 0x4a6a4a, 0x7a5a40]), { s: [{ at: x0 + 4.5, w: 1.1 }] }); if (R() < 0.6) lootAt(s, "n", x0 + 4.5, R() < 0.5 ? "food" : "civil") }
      tree(x0 + 15 + R() * 6, z0 + 6 + R() * 10, 1, 5 + R() * 3)
      m.fence(x0, z0 + 20, x0 + 24, z0 + 20, [[x0 + 12, 2]])
    }
  }

  // =================================================================================================================
  // Harbour surroundings: basin (water), quay edges, ship, warehouses, truck depot, boat yard
  // =================================================================================================================
  const BASIN: Rect = { x0: 56, z0: 198, x1: 105, z1: 310 }
  {
    m.rect(BASIN.x0, BASIN.z0, BASIN.x1, BASIN.z1, 1.1, "proxy-water")
    m.prop("quay", 56, 198, { x2: 105, z2: 198, face: "s" }); m.prop("quay", 105, 198, { x2: 105, z2: 310, face: "w" }); m.prop("quay", 56, 198, { x2: 56, z2: 310, face: "e" })
    m.prop("quay", -BOUND - 30, 310, { x2: BOUND + 30, z2: 310, face: "s" })
    m.prop("ship", 80.5, 256, { w: 30, d: 100, h: 9, far: true })
    m.area(56, 190, 110, 198, "concrete", "quay")
    for (let x = 60; x < 104; x += 9) m.prop("bollard", x, 197.4)
    // warehouses west of R1
    const w1 = hall("lagerhaus1", "Lagerhaus 1", { x0: -100, z0: 150, x1: -66, z1: 186 }, 9, "brick", undefined, {
      e: [{ at: 160, w: 4.6, kind: "gate", top: 4.6 }, { at: 176, w: 4.6, kind: "closed" }], n: [{ at: -90, w: 1.4 }], s: [{ at: -76, w: 2.2, kind: "window", sill: 3, top: 6 }],
    }, { roof: "gable", roofTint: 0x5a5c60 })
    for (const z of [156, 166, 176]) m.rect(-96, z, -80, z + 1.2, 3.4, "rack")
    lootAt(w1, "w", 162, "industrial", "crate"); lootAt(w1, "n", -76, "food", "crate"); lootAt(w1, "s", -94, "civil", "cabinet")
    m.prop("decal", -65.95, 168, { y: 6.4, w: 6, h: 1.1, face: "e", v: 1, text: "LAGERHAUS 1" })
    // truck depot east of R1
    m.area(14, 146, 104, 190, "asphalt", "asphalt")
    const th = hall("truckhall", "LKW-Werkstatt", { x0: 62, z0: 150, x1: 98, z1: 176 }, 7, "cladding", 0x5e6d63, {
      w: [{ at: 158, w: 4.6, kind: "gate", top: 4.8 }, { at: 168, w: 4.6, kind: "gate", top: 4.8 }], s: [{ at: 90, w: 1.4 }],
    })
    m.truck(76, 158, "e", PAINT.red, 0xd0ccc0, 5); m.rect(82, 168, 92, 170, 1.1, "machine", { tint: PAINT.yellow, v: 2 })
    lootAt(th, "n", 70, "industrial", "toolbox"); lootAt(th, "e", 172, "industrial", "crate"); lootAt(th, "s", 70, "civil", "cabinet")
    for (let i = 0; i < 4; i++) m.trailer(20 + i * 9, 170, "z", pick([PAINT.white, PAINT.blue, PAINT.grey, PAINT.green]))
    clear.push([38, 186, 6])
    // boat yard
    const bh = hall("bootshalle", "Bootshalle", { x0: -98, z0: 212, x1: -70, z1: 248 }, 8, "cladding", 0x2d557f, {
      s: [{ at: -84, w: 6, kind: "gate", top: 6 }], e: [{ at: 220, w: 1.4 }],
    }, { roof: "gable", roofTint: 0x4a4e52 })
    m.rect(-92, 222, -86, 238, 2.4, "boat", { tint: 0xd8d4c8 })
    lootAt(bh, "w", 226, "civil", "crate"); lootAt(bh, "n", -76, "industrial", "toolbox")
    for (const [x, z] of [[-90, 266], [-76, 270]]) { m.rect(x - 2, z - 6, x + 2, z + 6, 2.4, "boat", { tint: pick([0xd8d4c8, 0x9a3328, 0x2d557f]) }) }
    outdoorLoot(-83, 262, 0, "civil", "duffel")
  }

  // =================================================================================================================
  // Quarry (Steinbruch): pit with rock cliffs, gravel heaps, crusher plant, excavator, cabins, loading siding
  // =================================================================================================================
  {
    m.prop("track", 150, 147, { x2: 300, z2: 147 })
    m.area(146, 143, 304, 151, "gravel", "ballast")
    for (const [i, x] of [158, 171, 184, 206, 219, 232].entries()) m.rect(x, 145.6, x + 11, 148.4, 2.8, "wagon", { y: 0.9, tint: pick([0x5a4a3a, 0x6a5a40, 0x4a4a46]), v: 20 + i })
    for (const [x, z] of [[249, 143.5], [257, 143.5], [249, 150.5], [257, 150.5]]) m.rect(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 18, "pillar", { far: true })
    m.prop("hopper", 253, 147, { y: 9, w: 10, d: 9, h: 10, far: true })
    m.prop("conveyor", 253, 160, { x2: 228, z2: 205, h: 15, y: 1 })
    // pit floor and rim cliffs
    m.area(118, 194, 300, 300, "gravel", "rock")
    /** Rock wall in segments of varying height; only the face toward the pit (`inner`) is jagged. */
    const cliff = (x0: number, z0: number, x1: number, z1: number, inner: "x0" | "x1" | "z0" | "z1") => {
      const alongX = inner === "z0" || inner === "z1"
      let a = alongX ? x0 : z0
      const end = alongX ? x1 : z1
      while (a < end - 0.5) {
        const len = Math.min(end - a, 6 + R() * 6), h = 9 + R() * 6, j = R() * 2.4
        const r: Rect = alongX ? { x0: a, z0, x1: a + len, z1 } : { x0, z0: a, x1, z1: a + len }
        if (inner === "z1") r.z1 += j - 1.2; else if (inner === "z0") r.z0 += j - 1.2; else if (inner === "x1") r.x1 += j - 1.2; else r.x0 += j - 1.2
        m.rect(r.x0, r.z0, r.x1, r.z1, h, "rock", { v: Math.floor(R() * 4) + 10 * ({ z0: 1, z1: 2, x0: 3, x1: 4 } as const)[inner] })
        a += len
      }
    }
    cliff(105, 184, 195, 196, "z1"); cliff(205, 184, 310, 196, "z1")
    cliff(105, 190, 118, 310, "x1"); cliff(296, 190, 310, 310, "x0")
    cliff(105, 298, 310, 310, "z0")
    roadZ(200, 196, 214, 7, { dirt: true })
    // rock benches and boulders (cover)
    for (const [x, z, w, d, h] of [[140, 225, 10, 6, 3.5], [270, 230, 8, 9, 4.5], [182, 282, 14, 7, 3], [240, 284, 9, 6, 2.6], [134, 268, 6, 10, 4], [286, 270, 7, 12, 5]] as const) m.rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, "rock", { v: Math.floor(R() * 4) })
    for (let i = 0; i < 16; i++) { const x = 128 + R() * 160, z = 204 + R() * 88; if (Math.hypot(x - 215, z - 262) < 12 || Math.hypot(x - 240, z - 236) < 14 || Math.abs(x - 200) < 6) continue; const s = 0.9 + R() * 1.5; m.rect(x - s, z - s * 0.8, x + s, z + s * 0.8, 0.8 + R() * 1.4, "rock", { v: Math.floor(R() * 4) }) }
    for (const [x, z, r, h] of [[160, 260, 7, 5.5], [150, 212, 6, 4.5], [222, 290, 6.5, 5]] as const) { m.prop("heap", x, z, { r, h }); m.rect(x - r * 0.62, z - r * 0.62, x + r * 0.62, z + r * 0.62, h * 0.7, "proxy-heap") }
    // crusher plant
    m.rect(220, 200, 236, 214, 6, "machine", { tint: 0x9a7a2a, v: 2 })
    m.rect(222, 216, 234, 220, 2.4, "machine", { tint: 0x6a6e72, v: 2 })
    outdoorLoot(228, 222, 0, "industrial", "toolbox")
    // excavator, dumpers
    m.rect(253, 266, 259, 271, 3.2, "excavator", { tint: 0xc69c2c })
    m.prop("excavatorarm", 256, 268.5, { rot: -0.6, tint: 0xc69c2c })
    m.truck(180, 240, "n", 0xc69c2c, 0x8a7a50, 5.5); m.truck(270, 252, "w", 0xc69c2c, 0x8a7a50, 5.5)
    // site cabins
    for (const [x, z, v] of [[262, 200, 0], [270, 200, 1], [278, 200, 0]] as const) m.rect(x, z, x + 6, z + 2.6, 2.7, "portakabin", { tint: 0xd5d2c4, v })
    outdoorLoot(265, 204, 0, "civil", "cabinet"); outdoorLoot(281, 204, 0, "industrial", "crate")
    m.tank(288, 214, 2, 3, 0xb02820, "DIESEL")
    // bandit camp
    for (const [x, z] of [[232, 240], [246, 244]]) { m.rect(x - 1.6, z - 1.3, x + 1.6, z + 1.3, 1.6, "proxy-tent"); m.prop("tent", x, z, { w: 3.2, d: 2.6, h: 1.7, tint: 0x6a5a40 }) }
    m.prop("campfire", 240, 234, {}); m.light({ x: 240, y: 1, z: 234, color: 0xff8a3a, intensity: 30, distance: 16 })
    m.prop("barrels", 236, 228, { w: 2.2, d: 1.2, tint: 0x6a2e24 }); m.rect(234.9, 227.4, 237.1, 228.6, 0.95, "proxy-barrels")
    outdoorLoot(232, 243.4, 0, "military", "duffel"); outdoorLoot(250, 238, Math.PI / 2, "industrial", "crate")
    outdoorLoot(184, 236, Math.PI / 2, "industrial", "toolbox"); outdoorLoot(256, 274, 0, "civil", "duffel"); outdoorLoot(160, 250.6, Math.PI, "industrial", "crate")
    clear.push([215, 262, 10])
    // rim trees east/south outside the pit are on the zone edge; west shore trees
    for (let z = 104; z < 180; z += 8) if (z < 120 || z > 154) tree(300 + R() * 4, z, 0, 9 + R() * 5)
  }

  for (const [x0, z0, x1, z1, sf, look] of roadAreas) m.area(x0, z0, x1, z1, sf, look)
  for (const x of [-200, 0, 200]) m.area(x - 4, 129, x + 4, 141, "asphalt", "asphalt")

  // =================================================================================================================
  // Zone perimeter: insertion points and gates; outer fence drawn by world.ts along the bounds
  // =================================================================================================================
  const gates: ZoneMap["gates"] = [
    { side: "w", at: 0, w: 8 }, { side: "w", at: 297, w: 7 }, { side: "w", at: 135, w: 10 }, { side: "n", at: -200, w: 6 },
    { side: "e", at: 0, w: 8 }, { side: "e", at: 135, w: 10 },
  ]
  const insertions: Insertion[] = [
    { id: "south_road", name: "Küstenstraße", x: -298, z: 297, yaw: -Math.PI / 2, district: "station", hq: 1 },
    { id: "west_field", name: "Westfelder", x: -298, z: 0, yaw: -Math.PI / 2, district: "farm", hq: 1 },
    { id: "north_wood", name: "Nordwald", x: -200, z: -298, yaw: Math.PI, district: "forest", hq: 2 },
    { id: "east_rail", name: "Ostgleis", x: 298, z: 126, yaw: Math.PI / 2, district: "quarry", hq: 2 },
  ]
  for (const i of insertions) { clear.push([i.x, i.z, 6]); m.prop("insertion", i.x, i.z, { rot: i.yaw }) }
  const extractions: ExtractionDef[] = [
    { id: "heli_town", name: "Landeplatz Stadtpark", x: 27, z: 25, radius: 5, kind: "heli", requirement: null, chance: 1, holdTime: 12 },
    { id: "boat", name: "Bootsanleger Kai Süd", x: 46, z: 298, radius: 4, kind: "boat", requirement: { item: "fuel" }, chance: 0.8, holdTime: 6 },
    { id: "tunnel", name: "Versorgungstunnel", x: -298, z: 201, radius: 3, kind: "tunnel", requirement: { item: "key_tunnel" }, chance: 1, holdTime: 3 },
    { id: "gate", name: "Grenzposten Ost", x: 296, z: 0, radius: 4, kind: "gate", requirement: { money: 600 }, chance: 0.7, holdTime: 4 },
    { id: "heli_farm", name: "Feld-Landezone", x: -255, z: 55, radius: 6, kind: "heli", requirement: null, chance: 0.6, holdTime: 14 },
  ]
  for (const e of extractions) clear.push([e.x, e.z, e.radius + 4])
  const objectives: ObjectiveAnchor[] = [
    { id: "generator", name: "Notstromgenerator", x: -137, z: 112.8, holdTime: 6 },
    { id: "radio_mast", name: "Funkmast", x: 172.6, z: -176.5, holdTime: 6 },
    { id: "pump", name: "Wasserpumpe", x: -150, z: -23.8, holdTime: 5 },
    { id: "lab_terminal", name: "Laborterminal", x: -8, z: -266, holdTime: 8 },
  ]
  for (const o of objectives) clear.push([o.x, o.z, 3])

  // =================================================================================================================
  // Apocalypse dressing: barricades, checkpoints, burnt vehicles, survivor camp, body bags, trash, power lines
  // =================================================================================================================
  {
    // survivors barricaded the market square (gaps stay open)
    m.rect(-4, -17.2, -0.4, -16.2, 1.5, "barricade"); m.rect(0.4, 16.2, 4, 17.2, 1.5, "barricade")
    m.rect(-17.2, -4, -16.2, -0.4, 1.5, "barricade"); m.rect(16.2, 0.4, 17.2, 4, 1.5, "barricade")
    m.prop("bodybag", 10, -12, { v: 3, rot: 0 }); m.prop("trash", -10, 10, { v: 5 })
    // burnt-out bus in the west street
    m.solid(-52.6, -25, 2.55, 12, 3.1, "bus", { v: 9 })
    // quarantine checkpoint on R1 north of the town
    m.rect(-4, -107.4, 0.5, -106.6, 1.05, "jersey"); m.rect(-0.5, -111.4, 4, -110.6, 1.05, "jersey")
    m.rect(-9, -112, -6, -111, 1.1, "sandbag"); m.rect(6, -112, 9, -111, 1.1, "sandbag"); m.rect(-9, -111, -8, -108, 1.1, "sandbag")
    m.rect(6.5, -109.5, 9.5, -106.5, 2.8, "kiosk", { tint: 0x5d6548 })
    m.truck(-13, -108, "s", 0x4d5536, 0x5d5a44, 5.6)
    m.mast(12, -104, 9, -Math.PI / 2 - 0.4, 2)
    m.prop("wireroll", -24, -113.4, { x2: -6.5, z2: -113.4 }); m.prop("wireroll", 6.5, -113.4, { x2: 24, z2: -113.4 })
    m.prop("decal", -1.75, -106.58, { y: 0.2, w: 3.4, h: 0.6, face: "s", v: 6, text: "QUARANTÄNE · HALT" })
    m.prop("bodybag", -18, -106, { v: 4, rot: 0.1 }); m.prop("tent", -20, -110.5, { w: 4, d: 3, h: 2.2, tint: 0x5a6340 }); m.rect(-22, -112, -18, -109, 2.2, "proxy-tent")
    outdoorLoot(-15, -104.6, 0, "military", "crate")
    // checkpoint on R2 east of the town
    m.rect(104, -4, 104.8, 0.5, 1.05, "jersey"); m.rect(107.5, -0.5, 108.3, 4, 1.05, "jersey")
    m.rect(103.5, 5.5, 106.5, 6.5, 1.1, "sandbag"); m.rect(103.5, -6.5, 106.5, -5.5, 1.1, "sandbag")
    m.prop("wireroll", 106, 7.5, { x2: 106, z2: 9.5 })
    // survivor camp in the school yard
    m.rect(16, 86.5, 20, 89.5, 2.2, "proxy-tent"); m.prop("tent", 18, 88, { w: 4, d: 3, h: 2.2, tint: 0x6a5a40 })
    m.rect(24.4, 88.7, 27.6, 91.3, 1.7, "proxy-tent"); m.prop("tent", 26, 90, { w: 3.2, d: 2.6, h: 1.7, tint: 0x2d557f })
    m.prop("tarp", 36, 86, { w: 4, d: 3, h: 2.2, tint: 0x2d557f })
    m.prop("campfire", 29, 84, {}); m.prop("washline", 14, 94, { x2: 22, z2: 94 }); m.prop("trash", 42, 82, { v: 6 })
    m.prop("barrels", 40, 92, { w: 1.4, d: 1.4, tint: 0x4f6a8a }); m.rect(39.3, 91.3, 40.7, 92.7, 0.95, "proxy-barrels")
    outdoorLoot(18, 91.2, 0, "civil", "duffel"); outdoorLoot(33, 92, 0, "food", "crate")
    // trash and abandoned bags along the town streets
    for (const [x, z] of [[-50, -70], [50, -35], [-50, 30], [50, 70], [-30, 46], [30, -46], [-70, -2.5], [70, 2.5], [-3.5, -60], [3.5, 75], [-90, 46], [88, -50]]) m.prop("trash", x, z, { v: 3 + Math.floor(R() * 3) })
    // abandoned and burnt vehicles on the country roads
    for (const [x, z, a, burnt] of [[-250, 2.4, "x", 0], [-160, -2.4, "x", 1], [-198.2, -60, "z", 1], [-201.8, 230, "z", 0], [-100, -116.5, "x", 1], [60, -119.6, "x", 0], [198.2, 120, "z", 1], [150, -2.4, "x", 0]] as const) {
      if (burnt) wreck(x, z, a); else car(x, z, a)
    }
    // power lines along the country roads (dead)
    m.prop("powerline", -300, -8, { x2: -110, z2: -8, h: 9 })
    m.prop("powerline", -208, -110, { x2: -208, z2: -12, h: 9 }); m.prop("powerline", -208, 12, { x2: -208, z2: 120, h: 9 })
    m.prop("powerline", -190, -126, { x2: -12, z2: -126, h: 9 }); m.prop("powerline", 12, -126, { x2: 110, z2: -126, h: 9 })
    // lab: wrecked convoy, burnt APC, quarantine fences, floodlights, body bags, containment pods
    m.truck(-32, -186, "n", 0x4d5536, 0x5d5a44)
    m.rect(28, -196, 35, -190, 2.4, "apc", { tint: 0x2a2622, v: 1 }); m.prop("stain", 31.5, -193, { w: 9, d: 7, v: 0 })
    m.fence(-30, -198, -30, -146, [[-172, 6]], true); m.fence(30, -184, 30, -146, [[-166, 5]], true)
    m.mast(-26, -150, 12, Math.PI * 0.75, 2); m.mast(24, -150, 12, -Math.PI * 0.75, 2)
    m.prop("bodybag", 60, -224.5, { v: 5, rot: 0 }); m.prop("bodybag", 44, -224.5, { v: 3, rot: 0 })
    for (const [x, z] of [[78, -182], [83, -176]]) m.tank(x, z, 1.5, 3.2, 0xe2e4e0, "BIO")
    m.rect(44, -197, 45.2, -195.8, 1.2, "crate"); m.rect(66, -198, 67.2, -196.8, 1.2, "crate"); m.rect(46, -196, 47.2, -194.8, 1.2, "crate")
    // station: bus at the forecourt, platform edge line
    m.solid(-225, 186.2, 12, 2.55, 3.1, "bus", { tint: 0xd8c040, v: 0 })
    m.line(-286, 145.1, -162, 145.35, 0xd8b23a)
    // quarry: more gravel heaps
    for (const [x, z, r, h] of [[190, 270, 6, 4.6], [270, 286, 5, 4]] as const) { m.prop("heap", x, z, { r, h }); m.rect(x - r * 0.62, z - r * 0.62, x + r * 0.62, z + r * 0.62, h * 0.7, "proxy-heap") }
  }

  const mercCamps: MercCamp[] = [
    { id: "camp_mil", x: 200, z: -207, radius: 30, squad: 6, patrol: [P(188, -192.5), P(212, -192.5), P(208, -238), P(192, -238)] },
    { id: "camp_ind", x: 200, z: 2, radius: 22, squad: 4, patrol: [P(180, 0), P(222, 0), P(228, -4)] },
    { id: "camp_harbor", x: 0, z: 255, radius: 22, squad: 4, patrol: [P(0, 228), P(0, 286)] },
    { id: "camp_lab", x: 55, z: -198, radius: 24, squad: 5, patrol: [P(30, -190), P(80, -192), P(60, -230)] },
    { id: "camp_quarry", x: 240, z: 238, radius: 20, squad: 4, patrol: [P(215, 250), P(265, 240), P(240, 222)] },
    { id: "camp_station", x: -180, z: 120, radius: 20, squad: 3, patrol: [P(-230, 120), P(-150, 120), P(-150, 131)] },
    { id: "camp_forest", x: -245, z: -194, radius: 18, squad: 3, patrol: [P(-256, -186), P(-226, -200), P(-230, -186)] },
  ]
  for (const c of mercCamps) { clear.push([c.x, c.z, 3]); for (const q of c.patrol) clear.push([q.x, q.z, 2.5]) }
  for (const l of loot) clear.push([l.x, l.z, 1.5])

  // =================================================================================================================
  // Trees: dense forest, field hedges, scattered elsewhere (never on roads, solids, clear zones or open water)
  // =================================================================================================================
  {
    const G = 1, W = 2 * BOUND, grid = new Uint8Array(W * W)
    const mark = (x0: number, z0: number, x1: number, z1: number) => {
      const c0 = Math.max(0, Math.floor(x0 + BOUND)), c1 = Math.min(W - 1, Math.floor(x1 + BOUND)), r0 = Math.max(0, Math.floor(z0 + BOUND)), r1 = Math.min(W - 1, Math.floor(z1 + BOUND))
      for (let r = r0; r <= r1; r++) grid.fill(1, r * W + c0, r * W + c1 + 1)
    }
    for (const s of m.solids) mark(s.x - s.w / 2 - 2, s.z - s.d / 2 - 2, s.x + s.w / 2 + 2, s.z + s.d / 2 + 2)
    for (const r of roads) mark(r.x0 - 2.5, r.z0 - 2.5, r.x1 + 2.5, r.z1 + 2.5)
    for (const r of noTree) mark(r.x0, r.z0, r.x1, r.z1)
    for (const a of m.areas) if (["pavement", "asphalt", "quay", "pad", "ballast", "floor", "tiles", "plank", "field", "garden", "rock"].includes(a.look ?? "")) mark(a.x - a.w / 2 - 1.5, a.z - a.d / 2 - 1.5, a.x + a.w / 2 + 1.5, a.z + a.d / 2 + 1.5)
    for (const [x, z, r] of clear) mark(x - r, z - r, x + r, z + r)
    mark(-110, -105, 110, 100)                        // town handled by hand
    mark(140, -265, 265, -135); mark(140, -62, 260, 58); mark(-60, 192, 110, 310)   // authored districts + basin
    mark(-95, -300, 95, -122)                          // lab compound
    mark(100, 180, 310, 310)                           // quarry pit
    mark(-BOUND, -BOUND, BOUND, -BOUND + 4); mark(-BOUND, BOUND - 4, BOUND, BOUND); mark(-BOUND, -BOUND, -BOUND + 4, BOUND); mark(BOUND - 4, -BOUND, BOUND, BOUND)
    const free = (x: number, z: number) => { const c = Math.floor(x + BOUND), r = Math.floor(z + BOUND); return c >= 0 && r >= 0 && c < W && r < W && !grid[r * W + c] }
    const plant = (x: number, z: number, v: 0 | 1 | 2, h: number, gap: number) => {
      if (!free(x, z)) return false
      tree(x, z, v, h)
      mark(x - gap, z - gap, x + gap, z + gap)
      return true
    }
    // forest: jittered grid ~5 m
    for (let z = -306; z < -107; z += 4.6) for (let x = -306; x < -107; x += 4.6) {
      if (R() < 0.18) continue
      const px = x + R() * 3.4, pz = z + R() * 3.4, k = R()
      plant(px, pz, k < 0.68 ? 0 : k < 0.95 ? 1 : 2, k < 0.68 ? 11 + R() * 8 : 9 + R() * 5, 1.4)
    }
    // forest floor: bushes, boulders, fallen trunks
    const shrub = (x: number, z: number, h: number) => { if (!free(x, z)) return false; trees.push({ x: round(x), z: round(z), h: round(h), v: 3, r: round(R() * 6.28) }); mark(x - 0.7, z - 0.7, x + 0.7, z + 0.7); return true }
    for (let i = 0; i < 2200; i++) shrub(-306 + R() * 200, -306 + R() * 200, 1.1 + R() * 1.3)
    for (let i = 0; i < 70; i++) {
      const x = -300 + R() * 190, z = -300 + R() * 190
      if (!free(x, z) || !free(x + 2, z + 2) || !free(x - 2, z - 2)) continue
      if (R() < 0.5) { const w = 1.4 + R() * 1.8, d = 1.2 + R() * 1.5; m.rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0.9 + R() * 1.3, "rock", { v: Math.floor(R() * 4) }); mark(x - w, z - d, x + w, z + d) }
      else if (R() < 0.5) { m.rect(x - 3, z - 0.35, x + 3, z + 0.35, 0.7, "trunk"); mark(x - 4, z - 1, x + 4, z + 1) } else { m.rect(x - 0.35, z - 3, x + 0.35, z + 3, 0.7, "trunk"); mark(x - 1, z - 4, x + 1, z + 4) }
    }
    // copses and scattered trees elsewhere (countryside, verges)
    for (let i = 0; i < 2600; i++) {
      const x = -BOUND + R() * W, z = -BOUND + R() * W
      const d = districtOf(x, z).id
      const p = d === "farm" ? 0.16 : d === "station" ? 0.14 : d === "industry" || d === "military" ? 0.06 : d === "harbor" ? 0.05 : d === "lab" ? 0.12 : d === "quarry" ? 0.1 : 0
      if (R() > p) continue
      const k = R()
      plant(x, z, k < 0.4 ? 0 : k < 0.92 ? 1 : 2, 7 + R() * 7, 3)
    }
    // hedges and shrubs: field edges, verges, gardens
    for (let i = 0; i < 5000; i++) {
      const x = -BOUND + R() * W, z = -BOUND + R() * W
      const d = districtOf(x, z).id
      const p = d === "farm" ? 0.35 : d === "station" ? 0.3 : d === "industry" || d === "military" ? 0.08 : d === "harbor" ? 0.06 : d === "lab" ? 0.2 : d === "quarry" ? 0.12 : d === "forest" ? 0.05 : 0
      if (R() < p) shrub(x, z, 0.9 + R() * 1.2)
    }
  }

  // =================================================================================================================
  // Encounters, events, labels
  // =================================================================================================================
  const infectedZones: InfectedZoneDef[] = [
    { district: "town", x: 0, z: 0, radius: 100, density: 0.0018 },
    { district: "industry", x: 205, z: 0, radius: 95, density: 0.0013 },
    { district: "harbor", x: 0, z: 215, radius: 95, density: 0.0013 },
    { district: "military", x: 205, z: -205, radius: 95, density: 0.0012 },
    { district: "lab", x: 0, z: -210, radius: 85, density: 0.0026 },
    { district: "farm", x: -205, z: -5, radius: 95, density: 0.0008 },
    { district: "station", x: -205, z: 200, radius: 95, density: 0.0012 },
    { district: "forest", x: -205, z: -205, radius: 95, density: 0.0007 },
    { district: "quarry", x: 210, z: 215, radius: 90, density: 0.0011 },
  ]
  const airdropSpots: Vec2[] = [P(285, 52), P(-255, -55), P(-145, -255), P(215, 262), P(-62, -170), P(-228, 178), P(38, 186)]
  const labels = DISTRICTS.map(d => ({ name: d.name, x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 }))

  return {
    kind: "zone", bounds: { minX: -BOUND, maxX: BOUND, minZ: -BOUND, maxZ: BOUND }, districts: DISTRICTS, solids: m.solids, lootSpots: loot,
    mercCamps, infectedZones, insertions, extractions, objectives, bossArena: ARENA, airdropSpots, labels,
    areas: m.areas, props: m.props, lights: m.lights, doorways: m.doorways, buildings: m.buildings,
    ground: { surface: "grass", look: "grass" }, water: { rects: [BASIN], level: -2.3 }, trees, roads, gates,
  }
}

function round(v: number): number { return Math.round(v * 100) / 100 }
function clipWeeds(p: MapProp, b: { minX: number; maxX: number; minZ: number; maxZ: number }): Partial<MapProp> {
  const x0 = Math.max(p.x, b.minX), z0 = Math.max(p.z, b.minZ), x1 = Math.min(p.x + (p.w ?? 0), b.maxX), z1 = Math.min(p.z + (p.d ?? 0), b.maxZ)
  return { x: x0, z: z0, w: Math.max(0, x1 - x0), d: Math.max(0, z1 - z0) }
}
