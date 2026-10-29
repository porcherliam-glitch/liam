/**
 * maps.ts — hand-authored map layouts per mission as pure data (no three.js). world.ts turns a layout into geometry.
 * CONTRACT (used by raid.ts, enemies.ts and the layout tests):
 *  - bounds: playable rectangle; world.ts adds perimeter obstacles just outside it (see layoutObstacles).
 *  - solids: every blocking box; each becomes one Obstacle (AABB, y from `y` (default 0) to y + h).
 *  - playerSpawns: insertion points (raid picks one at random), with the initial yaw (0 = facing -Z).
 *  - lootSpawns: crate positions (raid picks `MISSIONS[id].crates` of them); tier 2 = high-value spots (inside buildings).
 *    Optional `yaw` (rotation around Y; 0 = crate's 1.25 m side along X) aligns the crate with the wall/cover behind it.
 *  - enemySpawns: start positions with a looping patrol route (2–4 points, each walkable), >= 25 m from player spawns.
 *  - extractions: 2–3 evac zones (radius 4–5 m, open ground, >= 45 m from every player spawn); raid activates one.
 *  - reinforcementSpawns: map-edge points where reinforcements enter after the evac is called.
 * Additions (optional fields, used by world.ts and maps.test.ts):
 *  - MapSolid.tint / .v: colour and visual variant for the renderer (no effect on collision).
 *  - areas (ground patches, later entries win: surface for footsteps + look for the texture), props (visual-only
 *    decoration; anything that blocks walking is also a solid), lights (real point/spot lights, most important first,
 *    max 4), doorways (walkable wall openings), buildings (enterable building footprints), perimeter (per-side edge
 *    style and obstacle height), water (harbour), gates (closed perimeter gates where roads leave the map).
 *  - layoutObstacles(layout): the exact Obstacle list world.ts uses (solids in order, then perimeter n, e, s, w).
 *  - computeCoverPoints(layout, nav): the cover spots world.ts exposes as world.coverPoints.
 * Solid styles starting with "proxy" are invisible collision boxes for round props (tanks, barrel groups, tyres).
 * Fences are 0.35 m concrete plinths (block walking) with see-through chain-link above (does not block bullets/sight).
 */
import type { Obstacle } from "./collision"
import type { Bounds, NavGrid } from "./nav"
import type { MissionId, Surface, Vec2 } from "./types"
import { CAR_CABIN_REAR, CAR_LENGTH, CAR_WIDTH, type CarStyle } from "./vehicleModels"

export type Side = "n" | "s" | "e" | "w"

export interface MapSolid { x: number; z: number; w: number; d: number; h: number; y?: number; style: string; tint?: number; v?: number; /** Far-visible landmark (drawn with weaker fog, never distance-culled). */ far?: boolean }
export interface EnemySpawn { x: number; z: number; patrol: Vec2[] }
export interface ExtractionPoint { id: string; name: string; x: number; z: number; radius: number }
export interface LootSpawn { x: number; z: number; tier: 0 | 1 | 2; yaw?: number }
export interface PlayerSpawn { x: number; z: number; yaw: number }

/** Ground patch (axis-aligned). `look` picks the ground texture (defaults to the surface). */
export interface MapArea { x: number; z: number; w: number; d: number; surface: Surface; look?: string }
/** Visual-only decoration. Meaning of the optional fields depends on `kind` (see world.ts / props.ts). */
export interface MapProp {
  kind: string; x: number; z: number; y?: number
  w?: number; d?: number; h?: number; r?: number; rot?: number
  x2?: number; z2?: number; tint?: number; v?: number; face?: Side; text?: string
  /** Secondary colour (gable end walls, …). */
  tint2?: number
  /** Far-visible landmark (see MapSolid.far). */
  far?: boolean
}
/** Real light. Spot light when tx/tz are set (aims at tx, ty, tz), point light otherwise. */
export interface MapLight { x: number; y: number; z: number; color: number; intensity: number; distance: number; tx?: number; ty?: number; tz?: number; angle?: number }
/** Walkable opening in a building wall: centre on the wall line, outward normal, clear width. */
export interface Doorway { x: number; z: number; nx: number; nz: number; w: number; building: string }
export interface BuildingInfo { id: string; name: string; x0: number; z0: number; x1: number; z1: number; h: number; style: string; tint?: number; upper: number; roof: string
  /** Closed block (not enterable): facade windows on every storey and a door panel on `face`. */
  solid?: boolean; face?: Side
  /** Lamps above the doors (default true). */
  doorLamps?: boolean
}
export interface PerimeterSide { h: number; style: "fence" | "wall" | "quay" | "double" }

export interface MapLayout {
  id: MissionId
  bounds: Bounds
  solids: MapSolid[]
  playerSpawns: PlayerSpawn[]
  lootSpawns: LootSpawn[]
  enemySpawns: EnemySpawn[]
  extractions: ExtractionPoint[]
  reinforcementSpawns: Vec2[]
  /** Default ground everywhere not covered by an area. */
  ground?: { surface: Surface; look: string }
  areas?: MapArea[]
  props?: MapProp[]
  lights?: MapLight[]
  doorways?: Doorway[]
  buildings?: BuildingInfo[]
  perimeter?: Partial<Record<Side, PerimeterSide>>
  /** Water beyond these sides of the bounds (harbor), surface at `level` (m). */
  water?: { sides: Side[]; level: number }
  /** Closed gates in the perimeter where roads leave the map (`at` = coordinate along the side). */
  gates?: Array<{ side: Side; at: number; w: number }>
}

const cache = new Map<MissionId, MapLayout>()

export function getLayout(id: MissionId): MapLayout {
  let layout = cache.get(id)
  if (!layout) { layout = id === "harbor" ? harborLayout() : id === "blacksite" ? blacksiteLayout() : greyzoneLayout(); cache.set(id, layout) }
  return layout
}

/** Obstacles exactly as the world uses them: one AABB per solid, then the four perimeter boxes (n, e, s, w). */
export function layoutObstacles(layout: MapLayout): Obstacle[] {
  const out: Obstacle[] = layout.solids.map(s => ({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2, height: (s.y ?? 0) + s.h, minY: s.y ?? 0 }))
  const b = layout.bounds, p = layout.perimeter ?? {}, m = 8
  out.push(
    { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.minZ, height: p.n?.h ?? 3 },
    { minX: b.maxX, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m, height: p.e?.h ?? 3 },
    { minX: b.minX - m, maxX: b.maxX + m, minZ: b.maxZ, maxZ: b.maxZ + m, height: p.s?.h ?? 3 },
    { minX: b.minX - m, maxX: b.minX, minZ: b.minZ - m, maxZ: b.maxZ + m, height: p.w?.h ?? 3 },
  )
  return out
}

export interface CoverSpot { x: number; z: number; height: number; nx: number; nz: number }

/**
 * Standing spots next to every ground-based solid that (with whatever is stacked on it, e.g. a car cabin) is >= 1 m
 * tall: about every 3 m along each side that is long enough, 0.7–1.2 m out from the face (the first offset that lands
 * on a walkable nav cell), normal pointing away from the solid. `height` is the top of the cover. De-duplicated.
 * Grid-accelerated (stack lookup and de-duplication), so it scales to zone-sized solid lists.
 */
export function computeCoverPoints(layout: { solids: readonly MapSolid[] }, nav: NavGrid): CoverSpot[] {
  const out: CoverSpot[] = []
  const G = 8, key = (x: number, z: number) => Math.floor(x / G) * 100003 + Math.floor(z / G)
  const outGrid = new Map<number, CoverSpot[]>()
  const add = (x: number, z: number, height: number, nx: number, nz: number) => {
    for (const off of [0.7, 0.95, 1.2]) {
      const px = Math.round((x + nx * off) * 100) / 100, pz = Math.round((z + nz * off) * 100) / 100
      if (!nav.walkable(px, pz)) continue
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
        for (const c of outGrid.get(key(px + gx * G, pz + gz * G)) ?? []) if (Math.abs(c.x - px) < 1.1 && Math.abs(c.z - pz) < 1.1) return
      }
      const c = { x: px, z: pz, height, nx, nz }
      out.push(c)
      const k = key(px, pz); let list = outGrid.get(k); if (!list) { list = []; outGrid.set(k, list) } list.push(c)
      return
    }
  }
  const solids = layout.solids
  // solids that start above the ground, bucketed by cell for the "stacked on top" lookup
  const raised = new Map<number, MapSolid[]>()
  for (const o of solids) {
    if (!(o.y ?? 0) || o.style.startsWith("proxy")) continue
    const x0 = Math.floor((o.x - o.w / 2) / G), x1 = Math.floor((o.x + o.w / 2) / G), z0 = Math.floor((o.z - o.d / 2) / G), z1 = Math.floor((o.z + o.d / 2) / G)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) continue
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx * 100003 + gz; let l = raised.get(k); if (!l) { l = []; raised.set(k, l) } l.push(o) }
  }
  for (const s of solids) {
    const y = s.y ?? 0
    let top = y + s.h
    if (y > 1.2 || Math.max(s.w, s.d) < 0.9 || s.style.startsWith("proxy-water")) continue
    for (const o of raised.get(key(s.x, s.z)) ?? []) {
      if (o === s || Math.abs((o.y ?? 0) - top) > 0.05) continue
      if (Math.abs(o.x - s.x) < (o.w + s.w) / 2 - 0.2 && Math.abs(o.z - s.z) < (o.d + s.d) / 2 - 0.2) top = Math.max(top, (o.y ?? 0) + o.h)
    }
    if (top < 1) continue
    const x0 = s.x - s.w / 2, x1 = s.x + s.w / 2, z0 = s.z - s.d / 2, z1 = s.z + s.d / 2
    const along = (len: number) => { const n = Math.max(1, Math.round(len / 3)); return Array.from({ length: n }, (_, i) => (i + 0.5) / n) }
    if (s.w >= 0.9) for (const t of along(s.w)) { const x = x0 + t * s.w; add(x, z0, top, 0, -1); add(x, z1, top, 0, 1) }
    if (s.d >= 0.9) for (const t of along(s.d)) { const z = z0 + t * s.d; add(x0, z, top, -1, 0); add(x1, z, top, 1, 0) }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------------------------------------------

export type OpeningKind = "door" | "gate" | "window" | "dock" | "closed"
/** Opening in a wall; `at` is the absolute centre coordinate along the wall. */
export interface Opening { at: number; w: number; kind?: OpeningKind; top?: number; sill?: number }
export interface BuildingSpec {
  id: string; name: string; x0: number; z0: number; x1: number; z1: number; h: number
  style: string; tint?: number; t?: number; roof?: string
  floor?: Surface; floorLook?: string
  n?: Opening[]; s?: Opening[]; e?: Opening[]; w?: Opening[]
  /** Non-enterable upper storey block on top of the ground floor. */
  upper?: number
  /** Ceiling light panels. */
  lamps?: Array<[number, number]>
}

export const PAINT = {
  red: 0x9a3328, blue: 0x2d557f, green: 0x3f6c48, orange: 0xc4651f, grey: 0x7c8186, white: 0xc4c2b8, teal: 0x2f7174,
  brown: 0x6e4b33, yellow: 0xc69c2c, navy: 0x253a5a, olive: 0x59603f, maroon: 0x6a2a2a, sand: 0xa89470,
} as const

export interface SolidOpts { y?: number; tint?: number; v?: number; far?: boolean }

/** Everything a Draft collected (the render/collision data of a layout without its mission fields). */
export interface DraftData { solids: MapSolid[]; areas: MapArea[]; props: MapProp[]; lights: MapLight[]; doorways: Doorway[]; buildings: BuildingInfo[] }

export class Draft {
  solids: MapSolid[] = []
  areas: MapArea[] = []
  props: MapProp[] = []
  lights: MapLight[] = []
  doorways: Doorway[] = []
  buildings: BuildingInfo[] = []

  solid(x: number, z: number, w: number, d: number, h: number, style: string, o: SolidOpts = {}): MapSolid {
    const s: MapSolid = { x, z, w, d, h, style }
    if (o.y) s.y = o.y
    if (o.tint !== undefined) s.tint = o.tint
    if (o.v !== undefined) s.v = o.v
    if (o.far) s.far = true
    this.solids.push(s); return s
  }
  /** Solid from corner coordinates. */
  rect(x0: number, z0: number, x1: number, z1: number, h: number, style: string, o: SolidOpts = {}): MapSolid {
    return this.solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, style, o)
  }
  area(x0: number, z0: number, x1: number, z1: number, surface: Surface, look?: string): void {
    const a: MapArea = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, surface }
    if (look) a.look = look
    this.areas.push(a)
  }
  prop(kind: string, x: number, z: number, o: Omit<MapProp, "kind" | "x" | "z"> = {}): void { this.props.push({ kind, x, z, ...o }) }
  light(l: MapLight): void { this.lights.push(l) }

  /**
   * Straight axis-aligned wall from (ax, az) to (bx, bz), thickness t, centred on the line, with openings.
   * `out` is the outward normal used for doorway records.
   */
  wall(ax: number, az: number, bx: number, bz: number, h: number, t: number, style: string, openings: Opening[] = [], o: { tint?: number; id?: string; out?: [number, number] } = {}): void {
    const alongX = Math.abs(az - bz) < 1e-6
    const c = alongX ? az : ax
    const s0 = alongX ? Math.min(ax, bx) : Math.min(az, bz), s1 = alongX ? Math.max(ax, bx) : Math.max(az, bz)
    const piece = (a: number, b: number, y0: number, y1: number, st = style) => {
      if (b - a < 0.02 || y1 - y0 < 0.02) return
      const opt = { y: y0, tint: o.tint }
      if (alongX) this.rect(a, c - t / 2, b, c + t / 2, y1 - y0, st, opt)
      else this.rect(c - t / 2, a, c + t / 2, b, y1 - y0, st, opt)
    }
    let cur = s0
    for (const op of [...openings].sort((p, q) => p.at - q.at)) {
      const a = op.at - op.w / 2, b = op.at + op.w / 2, kind = op.kind ?? "door"
      piece(cur, a, 0, h)
      const top = op.top ?? (kind === "gate" ? 4.4 : kind === "window" ? 2.25 : kind === "dock" ? 4 : kind === "closed" ? 4.4 : 2.5)
      if (kind === "window" || kind === "dock") {
        const sill = op.sill ?? (kind === "dock" ? 1.2 : 1.05)
        piece(a, b, 0, sill)
        this.prop("frame", alongX ? op.at : c, alongX ? c : op.at, { y: sill, w: op.w, h: top - sill, d: t, face: alongX ? "n" : "e" })
      }
      if (kind === "closed") piece(a, b, 0, top, "rollup")
      piece(a, b, top, h)
      if ((kind === "door" || kind === "gate") && o.out) {
        this.doorways.push({ x: alongX ? op.at : c, z: alongX ? c : op.at, nx: o.out[0], nz: o.out[1], w: op.w, building: o.id ?? "" })
        if (kind === "gate") this.prop("rolldoor", alongX ? op.at : c, alongX ? c : op.at, { y: top, w: op.w, d: t, face: alongX ? "n" : "e", tint: o.tint })
      }
      cur = b
    }
    piece(cur, s1, 0, h)
  }

  building(b: BuildingSpec): void {
    const t = b.t ?? 0.3, h = b.h
    const opt = { tint: b.tint, id: b.id }
    this.wall(b.x0, b.z0 + t / 2, b.x1, b.z0 + t / 2, h, t, b.style, b.n, { ...opt, out: [0, -1] })
    this.wall(b.x0, b.z1 - t / 2, b.x1, b.z1 - t / 2, h, t, b.style, b.s, { ...opt, out: [0, 1] })
    this.wall(b.x0 + t / 2, b.z0 + t, b.x0 + t / 2, b.z1 - t, h, t, b.style, b.w, { ...opt, out: [-1, 0] })
    this.wall(b.x1 - t / 2, b.z0 + t, b.x1 - t / 2, b.z1 - t, h, t, b.style, b.e, { ...opt, out: [1, 0] })
    const roof = b.roof ?? "roof"
    if (b.upper) this.rect(b.x0, b.z0, b.x1, b.z1, b.upper, b.style, { y: h, tint: b.tint, v: 1 })
    else this.rect(b.x0, b.z0, b.x1, b.z1, 0.5, roof, { y: h })
    this.area(b.x0, b.z0, b.x1, b.z1, b.floor ?? "concrete", b.floorLook ?? "floor")
    for (const [x, z] of b.lamps ?? []) this.prop("panel", x, z, { y: h - 0.04 })
    this.buildings.push({ id: b.id, name: b.name, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h, style: b.style, tint: b.tint, upper: b.upper ?? 0, roof })
  }

  /** Shipping container (40 ft = 12.2 m, 20 ft = 6.1 m) with `tints.length` tiers stacked. */
  container(x: number, z: number, along: "x" | "z", len: number, tints: number[], v = 0): void {
    const w = along === "x" ? len : 2.44, d = along === "x" ? 2.44 : len
    tints.forEach((tint, i) => this.solid(x, z, w, d, 2.6, "container", { y: i * 2.6, tint, v: v + i }))
  }

  /** Container with both end doors open that can be walked through (inner width 2.24 m). Extra tiers on top. */
  tunnel(x: number, z: number, along: "x" | "z", len: number, tint: number, top: number[] = [], id = "box"): void {
    const t = 0.1, half = 1.22
    if (along === "z") {
      this.rect(x - half, z - len / 2, x - half + t, z + len / 2, 2.6, "container", { tint, v: 7 })
      this.rect(x + half - t, z - len / 2, x + half, z + len / 2, 2.6, "container", { tint, v: 7 })
      this.rect(x - half + t, z - len / 2, x + half - t, z + len / 2, 0.15, "container", { y: 2.45, tint, v: 7 })
      this.doorways.push({ x, z: z - len / 2, nx: 0, nz: -1, w: 2.24, building: id }, { x, z: z + len / 2, nx: 0, nz: 1, w: 2.24, building: id })
    } else {
      this.rect(x - len / 2, z - half, x + len / 2, z - half + t, 2.6, "container", { tint, v: 7 })
      this.rect(x - len / 2, z + half - t, x + len / 2, z + half, 2.6, "container", { tint, v: 7 })
      this.rect(x - len / 2, z - half + t, x + len / 2, z + half - t, 0.15, "container", { y: 2.45, tint, v: 7 })
      this.doorways.push({ x: x - len / 2, z, nx: -1, nz: 0, w: 2.24, building: id }, { x: x + len / 2, z, nx: 1, nz: 0, w: 2.24, building: id })
    }
    this.area(along === "z" ? x - half + t : x - len / 2, along === "z" ? z - len / 2 : z - half + t, along === "z" ? x + half - t : x + len / 2, along === "z" ? z + len / 2 : z + half - t, "wood", "plank")
    this.prop("cdoors", x, z, { w: along === "x" ? len : 2.44, d: along === "x" ? 2.44 : len, tint })
    top.forEach((tint2, i) => this.solid(x, z, along === "x" ? len : 2.44, along === "x" ? 2.44 : len, 2.6, "container", { y: 2.6 * (i + 1), tint: tint2, v: i + 3 }))
  }

  /** Vertical round tank: visual prop plus box proxies approximating the disc for collision. */
  tank(x: number, z: number, r: number, h: number, tint: number, label = ""): void {
    this.prop("tank", x, z, { r, h, tint, text: label })
    for (const deg of [14, 34, 56, 76]) {
      const a = deg * Math.PI / 180, hx = r * Math.cos(a) * 1.02, hz = r * Math.sin(a) * 1.02
      this.solid(x, z, hx * 2, hz * 2, h, "proxy")
    }
  }

  /** Chain-link fence on a 0.35 m concrete plinth (blocks walking, not bullets or sight above the plinth). */
  fence(ax: number, az: number, bx: number, bz: number, gaps: Array<[number, number]> = [], barbed = false): void {
    const alongX = Math.abs(az - bz) < 1e-6
    const s0 = alongX ? Math.min(ax, bx) : Math.min(az, bz), s1 = alongX ? Math.max(ax, bx) : Math.max(az, bz)
    let cur = s0
    const run = (a: number, b: number) => {
      if (b - a < 0.3) return
      if (alongX) { this.rect(a, az - 0.13, b, az + 0.13, 0.35, "plinth"); this.prop("fence", a, az, { x2: b, z2: az, v: barbed ? 1 : 0 }) }
      else { this.rect(ax - 0.13, a, ax + 0.13, b, 0.35, "plinth"); this.prop("fence", ax, a, { x2: ax, z2: b, v: barbed ? 1 : 0 }) }
    }
    for (const [at, w] of [...gaps].sort((p, q) => p[0] - q[0])) { run(cur, at - w / 2); cur = at + w / 2 }
    run(cur, s1)
  }

  /** Car (body + glass cabin as two solids so the obstacle matches the silhouette). */
  car(x: number, z: number, along: "x" | "z", tint: number, v = 0): void {
    const L = CAR_LENGTH, W = CAR_WIDTH
    // the glasshouse runs from 0.9 m ahead of the centre back to the style's tailgate (vehicleModels.ts)
    const rear = CAR_CABIN_REAR[(v % 3) as CarStyle], cl = 0.9 + rear, co = (0.9 - rear) / 2
    const cab = along === "x" ? [x + co, z] : [x, z - co]
    this.solid(x, z, along === "x" ? L : W, along === "x" ? W : L, 0.95, "car", { tint, v })
    this.solid(cab[0], cab[1], along === "x" ? cl : 1.56, along === "x" ? 1.56 : cl, 0.5, "cabin", { y: 0.95, tint, v })
  }

  /** Box truck: cab + raised cargo box (open underneath visually, but blocks walking). dir = direction the cab faces. */
  truck(x: number, z: number, dir: Side, tint: number, cargoTint: number, cargoLen = 6.6): void {
    const W = 2.45, cabL = 2.3
    const sx = dir === "e" ? 1 : dir === "w" ? -1 : 0, sz = dir === "s" ? 1 : dir === "n" ? -1 : 0
    const total = cabL + 0.1 + cargoLen
    const cx = x + sx * (total / 2 - cabL / 2), cz = z + sz * (total / 2 - cabL / 2)
    const bx = x - sx * (total / 2 - cargoLen / 2), bz = z - sz * (total / 2 - cargoLen / 2)
    const alongX = sx !== 0
    this.solid(cx, cz, alongX ? cabL : W, alongX ? W : cabL, 2.9, "truckcab", { tint, v: dir === "e" ? 0 : dir === "w" ? 1 : dir === "s" ? 2 : 3 })
    this.solid(bx, bz, alongX ? cargoLen : W + 0.05, alongX ? W + 0.05 : cargoLen, 2.75, "cargo", { y: 1.0, tint: cargoTint })
  }

  /** Semi trailer without tractor (raised box, landing legs at the front). */
  trailer(x: number, z: number, along: "x" | "z", tint: number, len = 13.2): void {
    this.solid(x, z, along === "x" ? len : 2.5, along === "x" ? 2.5 : len, 2.9, "cargo", { y: 1.15, tint, v: 1 })
  }

  /** Concrete light mast: footing solid + visual mast; `rot` = yaw the lamp heads face. */
  mast(x: number, z: number, h: number, rot: number, heads = 2, v = 0): void {
    this.solid(x, z, 0.8, 0.8, 0.55, "concrete", { tint: 0x9a968c })
    this.prop("mast", x, z, { h, rot, v: heads, tint: v })
  }

  /** Painted road line (flat). */
  line(x0: number, z0: number, x1: number, z1: number, tint = 0xd4d0c6): void { this.prop("line", (x0 + x1) / 2, (z0 + z1) / 2, { w: x1 - x0, d: z1 - z0, tint }) }
  /** Dashed line along an axis. */
  dashed(x0: number, z0: number, x1: number, z1: number, width: number, dash: number, gap: number, tint = 0xd4d0c6): void {
    const alongX = Math.abs(z0 - z1) < 1e-6
    const s0 = alongX ? x0 : z0, s1 = alongX ? x1 : z1
    for (let s = s0; s + dash <= s1 + 1e-6; s += dash + gap) {
      if (alongX) this.line(s, z0 - width / 2, s + dash, z0 + width / 2, tint)
      else this.line(x0 - width / 2, s, x0 + width / 2, s + dash, tint)
    }
  }

  /** Copies another layout's content into this draft, translated by (dx, dz) (perimeter and mission fields are not copied). */
  stamp(src: DraftData, dx: number, dz: number): void {
    for (const s of src.solids) this.solids.push({ ...s, x: s.x + dx, z: s.z + dz })
    for (const a of src.areas) this.areas.push({ ...a, x: a.x + dx, z: a.z + dz })
    for (const p of src.props) {
      const q: MapProp = { ...p, x: p.x + dx, z: p.z + dz }
      if (p.x2 !== undefined) q.x2 = p.x2 + dx
      if (p.z2 !== undefined) q.z2 = p.z2 + dz
      this.props.push(q)
    }
    for (const l of src.lights) {
      const q: MapLight = { ...l, x: l.x + dx, z: l.z + dz }
      if (l.tx !== undefined) q.tx = l.tx + dx
      if (l.tz !== undefined) q.tz = l.tz + dz
      this.lights.push(q)
    }
    for (const d of src.doorways) this.doorways.push({ ...d, x: d.x + dx, z: d.z + dz })
    for (const b of src.buildings) this.buildings.push({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, z0: b.z0 + dz, z1: b.z1 + dz })
  }

  data(): DraftData { return { solids: this.solids, areas: this.areas, props: this.props, lights: this.lights, doorways: this.doorways, buildings: this.buildings } }

  finish(base: Omit<MapLayout, "solids" | "areas" | "props" | "lights" | "doorways" | "buildings">): MapLayout {
    return { ...base, solids: this.solids, areas: this.areas, props: this.props, lights: this.lights, doorways: this.doorways, buildings: this.buildings }
  }
}

/** Yaw that looks from (x, z) toward (tx, tz) (yaw 0 = -Z, positive = counter-clockwise). */
export function yawTo(x: number, z: number, tx: number, tz: number): number { return Math.round(Math.atan2(-(tx - x), -(tz - z)) * 1000) / 1000 }
const P = (x: number, z: number): Vec2 => ({ x, z })

// ---------------------------------------------------------------------------------------------------------------
// IV-01 Grauzone — industrial outskirts at sunset. North = -Z. Main road N–S (x 0), cross road E–W (z 2).
// ---------------------------------------------------------------------------------------------------------------
function greyzoneLayout(): MapLayout {
  const m = new Draft()
  const B = 55

  // --- ground -----------------------------------------------------------------------------------------------
  m.area(-B - 30, -B - 30, B + 30, B + 30, "gravel", "gravel")
  m.area(-B - 30, 8, -40, B + 30, "dirt", "dirt")
  m.area(46, 30, B + 30, B + 30, "dirt", "dirt")
  m.area(-B - 30, -B - 30, -54, 0, "dirt", "dirt")
  m.area(-56, -56, -24, -32, "gravel", "gravel")
  m.area(-14, -24, -4.5, -10, "asphalt", "asphalt")
  m.area(4.5, -39, 17, -11, "asphalt", "asphalt")
  m.area(-42, 31, -6, 51, "asphalt", "asphalt")
  m.area(-16, 10, -4.5, 31, "concrete", "pavement")
  m.area(20, 14, 30, 30, "concrete", "pavement")
  m.area(-4.5, -B - 30, 4.5, B + 30, "asphalt", "asphalt")
  m.area(-B - 30, -1.5, B + 30, 5.5, "asphalt", "asphalt")
  m.area(26, -11, 36, -1.5, "asphalt", "asphalt")

  // road markings: centre dashes, edge lines, stop lines and a crosswalk at the junction
  m.dashed(0, -B - 20, 0, -3.5, 0.15, 3, 3)
  m.dashed(0, 7.5, 0, B + 20, 0.15, 3, 3)
  m.dashed(-B - 20, 2, -6.5, 2, 0.15, 3, 3)
  m.dashed(6.5, 2, B + 20, 2, 0.15, 3, 3)
  for (const x of [-4.1, 4.1]) { m.line(x - 0.08, -B - 20, x + 0.08, -1.5); m.line(x - 0.08, 5.5, x + 0.08, B + 20) }
  for (const z of [-1.1, 5.1]) { m.line(-B - 20, z - 0.08, -4.5, z + 0.08); m.line(4.5, z - 0.08, B + 20, z + 0.08) }
  m.line(-4.1, -3.2, 0, -2.8); m.line(0, 7.8, 4.1, 8.2)
  for (let x = -3.6; x <= 3.6; x += 1.2) m.line(x - 0.3, 9, x + 0.3, 12)
  m.line(-14, -16.5, -4.5, -16.3, 0xd8b23a); m.line(4.5, -25.1, 16, -24.9, 0xd8b23a)
  for (const x of [-38, -33, -28, -23, -18, -13]) m.line(x - 0.06, 32, x + 0.06, 37)
  for (const x of [-38, -33, -28, -23, -18, -13]) m.line(x - 0.06, 45, x + 0.06, 50)

  // --- Halle 1 (warehouse, enterable) -----------------------------------------------------------------------
  m.building({
    id: "halle1", name: "Halle 1", x0: -46, z0: -26, x1: -14, z1: -8, h: 7.5, style: "cladding", tint: 0x8c9196,
    e: [{ at: -17, w: 4.6, kind: "gate" }],
    n: [{ at: -38, w: 4.4, kind: "closed" }, { at: -25, w: 4.4, kind: "gate" }],
    s: [{ at: -40, w: 2.4 }, { at: -32, w: 2.2, kind: "window" }, { at: -24, w: 2.2, kind: "window" }],
    w: [{ at: -17, w: 4.4, kind: "closed" }],
    lamps: [[-40, -17], [-30, -13], [-30, -21], [-21, -17]],
  })
  m.rect(-38, -23, -36.8, -11, 3.4, "rack")
  m.rect(-32.2, -23, -31, -11, 3.4, "rack")
  // office cubicle in the north-east corner of the hall
  m.wall(-20, -25.7, -20, -21, 2.8, 0.2, "plaster", [], { tint: 0xbab3a2 })
  m.wall(-20.1, -20.9, -14.3, -20.9, 2.8, 0.2, "plaster", [{ at: -17.4, w: 2.4 }], { tint: 0xbab3a2, id: "halle1-office", out: [0, 1] })
  m.rect(-20.1, -25.7, -14.3, -20.8, 0.15, "roof", { y: 2.8 })
  m.rect(-16.4, -25.6, -14.4, -24.8, 0.78, "desk")
  m.rect(-27.5, -24, -25.1, -21.6, 2.1, "machine", { tint: PAINT.yellow, v: 2 })
  m.rect(-25, -12.6, -23.8, -11.4, 1.1, "pallets")
  m.rect(-23.4, -12.6, -22.2, -11.4, 1.2, "crate")
  m.rect(-44.6, -25.2, -42.2, -24, 1.1, "pallets")
  m.rect(-45.6, -12.6, -44.4, -10.2, 2.4, "crate")
  m.prop("decal", -14.0, -21, { y: 5.6, w: 4, h: 1.2, face: "e", v: 1, text: "HALLE 1" })

  // --- Halle 2 (warehouse with loading docks, enterable) ----------------------------------------------------
  m.building({
    id: "halle2", name: "Halle 2", x0: 20, z0: -36, x1: 44, z1: -14, h: 8, style: "cladding", tint: 0x6f7f8e,
    w: [{ at: -31, w: 3.2, kind: "dock" }, { at: -25, w: 3.2, kind: "dock" }, { at: -19, w: 3.2, kind: "dock" }],
    n: [{ at: 27, w: 2.4 }],
    s: [{ at: 36, w: 5, kind: "gate", top: 4.8 }, { at: 25, w: 2.2, kind: "window" }],
    e: [{ at: -22, w: 2.4 }],
    lamps: [[26, -30], [34, -30], [26, -20], [34, -20]],
  })
  m.rect(16.4, -34.5, 20, -15.5, 1.2, "dock")
  m.truck(11, -25, "w", PAINT.white, 0xd3d0c6)
  m.rect(24, -31.6, 38, -30.4, 3.6, "rack")
  m.rect(24, -25.6, 38, -24.4, 3.6, "rack")
  m.rect(24, -19.6, 34, -18.4, 3.6, "rack")
  m.rect(40.5, -35.4, 43.4, -33, 2.1, "machine", { tint: PAINT.orange, v: 2 })
  m.rect(21, -17, 22.2, -14.6, 2.4, "crate")
  m.rect(41.6, -18, 43.4, -14.6, 1.1, "pallets")
  m.prop("decal", 20, -25, { y: 5.6, w: 4.6, h: 1.4, face: "w", v: 2, text: "HALLE 2" })

  // --- Verwaltung (office block, ground floor enterable, upper storey solid) ---------------------------------
  m.building({
    id: "office", name: "Verwaltung", x0: -38, z0: 14, x1: -16, z1: 28, h: 3.4, upper: 3.5, style: "plaster", tint: 0xc9b99a,
    e: [{ at: 21, w: 2.6 }, { at: 16.8, w: 2.2, kind: "window" }, { at: 25.2, w: 2.2, kind: "window" }],
    n: [{ at: -35, w: 2, kind: "window" }, { at: -30.5, w: 2, kind: "window" }, { at: -23.5, w: 2, kind: "window" }, { at: -19, w: 2, kind: "window" }],
    s: [{ at: -35, w: 2, kind: "window" }, { at: -24, w: 2, kind: "window" }, { at: -19.5, w: 2.4 }],
    w: [{ at: 24.5, w: 2.4 }, { at: 17.5, w: 2, kind: "window" }],
    floor: "wood", floorLook: "tiles",
    lamps: [[-21, 18], [-21, 24], [-32.5, 17.5], [-32.5, 24.5]],
  })
  m.wall(-27, 14.3, -27, 27.7, 3.4, 0.2, "plaster", [{ at: 17.6, w: 2.4 }, { at: 24.4, w: 2.4 }], { tint: 0xd8d0bd, id: "office-in", out: [1, 0] })
  m.wall(-37.7, 21, -27.1, 21, 3.4, 0.2, "plaster", [{ at: -32.5, w: 2.4 }], { tint: 0xd8d0bd, id: "office-in", out: [0, 1] })
  m.rect(-23.5, 18.2, -22.2, 22.8, 1.1, "counter")
  m.rect(-37.6, 14.4, -36.9, 16.6, 1.9, "cabinet")
  m.rect(-35, 17.2, -33.4, 18.2, 0.78, "desk")
  m.rect(-30.6, 17.2, -29, 18.2, 0.78, "desk")
  m.rect(-30.2, 26.2, -28, 27.6, 1.9, "cabinet", { v: 1 })
  m.rect(-36.5, 25.8, -34.5, 27.6, 1.3, "machine", { tint: 0x3a3f45, v: 3 })
  m.rect(-26.7, 26.4, -24.5, 27.6, 0.78, "desk")
  m.prop("decal", -16, 21, { y: 2.9, w: 3, h: 0.55, face: "e", v: 3, text: "VERWALTUNG" })
  m.rect(-42.4, 17.6, -40.2, 19.4, 1.3, "machine", { tint: 0x355a3c, v: 4 })
  m.rect(-42.4, 20.2, -40.2, 22, 1.3, "machine", { tint: 0x4a4f55, v: 4 })

  // --- Werkstatt (brick workshop, enterable) -----------------------------------------------------------------
  m.building({
    id: "workshop", name: "Werkstatt", x0: 30, z0: 16, x1: 46, z1: 28, h: 5.2, style: "brick", tint: 0xa0614a,
    w: [{ at: 22, w: 4.4, kind: "gate", top: 4 }],
    n: [{ at: 42, w: 2.4 }, { at: 35, w: 2.2, kind: "window" }],
    e: [{ at: 22, w: 2.2, kind: "window" }],
    s: [{ at: 34, w: 2.2, kind: "window" }, { at: 41, w: 2.2, kind: "window" }],
    lamps: [[34, 22], [41, 22]],
  })
  m.rect(40, 26.4, 45.6, 27.6, 0.95, "desk", { v: 1 })
  m.rect(33.6, 25.4, 35.4, 27.6, 1.3, "machine", { tint: 0x4d6a6c, v: 2 })
  m.rect(45, 17, 45.7, 20.6, 2.2, "rack")
  m.car(39, 21.6, "x", PAINT.maroon, 1)
  m.prop("decal", 38, 16, { y: 4.1, w: 3.6, h: 0.7, face: "n", v: 4, text: "WERKSTATT" })

  // --- tank farm (bund wall, tanks, pump skid) ----------------------------------------------------------------
  m.wall(-53, -52.8, -26, -52.8, 1.1, 0.4, "concrete", [], { tint: 0x9d978b })
  m.wall(-53, -34.2, -26, -34.2, 1.1, 0.4, "concrete", [{ at: -41, w: 3 }, { at: -30.5, w: 3 }], { tint: 0x9d978b, id: "bund", out: [0, 1] })
  m.wall(-52.8, -52.6, -52.8, -34.4, 1.1, 0.4, "concrete", [], { tint: 0x9d978b })
  m.wall(-26.2, -52.6, -26.2, -34.4, 1.1, 0.4, "concrete", [{ at: -44, w: 3 }], { tint: 0x9d978b, id: "bund", out: [1, 0] })
  m.tank(-45, -45.5, 5, 10, 0xd9d6cc, "T-01")
  m.tank(-33, -46.5, 4, 8, 0xc9c4b4, "T-02")
  m.tank(-31.5, -38.8, 1.9, 4.5, 0x8a5a3a, "")
  m.rect(-42.4, -38.6, -39.8, -37.2, 1.25, "machine", { tint: 0x6b7a4a, v: 1 })
  m.rect(-50.8, -37.4, -49.4, -35.2, 1.0, "proxy-barrels")
  m.prop("barrels", -50.1, -36.3, { w: 1.4, d: 2.2, tint: 0x4f6a8a })
  m.prop("decal", -26, -40, { y: 0.55, w: 1.4, h: 0.5, face: "e", v: 5, text: "EX" })

  // --- pipe rack from the tank farm across the main road -----------------------------------------------------
  for (const x of [-24, -18, -12, -6.2, 6.2]) for (const z of [-31, -29]) m.rect(x - 0.15, z - 0.15, x + 0.15, z + 0.15, Math.abs(x) < 7 ? 5 : 3.6, "pillar")
  m.rect(-25, -31.3, -6.4, -28.7, 0.9, "pipes", { y: 3.6 })
  m.rect(-6.4, -31.3, 7, -28.7, 0.9, "pipes", { y: 5, v: 1 })
  m.prop("pipedrop", -25.5, -30, { y: 4.1, h: 3.5 })

  // --- north truck lot ---------------------------------------------------------------------------------------
  m.trailer(13, -47.4, "z", 0xb7b4aa)
  m.trailer(18, -47.4, "z", PAINT.blue)
  m.trailer(23, -47.4, "z", 0x8f2f26)
  m.container(52.5, -45, "z", 12.2, [PAINT.green, PAINT.grey])
  m.container(52.5, -32, "z", 12.2, [PAINT.orange])
  m.rect(30.2, -37.4, 32.6, -36.2, 1.15, "pallets")
  m.mast(30, -44, 14, Math.PI * 0.75, 2)
  m.container(29.5, -52.6, "x", 6.1, [PAINT.yellow])
  m.rect(-3.6, -50.3, -0.2, -49.7, 1.05, "jersey")
  m.rect(7.2, -51.4, 9.6, -49, 2.6, "kiosk", { tint: 0xc9c4b4 })

  // --- main road cover --------------------------------------------------------------------------------------
  m.rect(-4.3, -19.3, -0.8, -18.7, 1.05, "jersey")
  m.rect(0.8, -24.3, 4.3, -23.7, 1.05, "jersey")
  m.car(2.4, -43, "z", 0x55606a, 2)
  m.truck(-2.2, 30, "s", PAINT.blue, 0xbfbab0, 9.2)
  m.rect(-4.3, 10.7, -0.9, 11.3, 1.05, "jersey")
  m.rect(0.9, 13.7, 4.3, 14.3, 1.05, "jersey")
  m.mast(6.3, -4, 12, Math.PI * 0.75, 2)
  m.mast(-6.3, 8.6, 12, -Math.PI * 0.25, 2)
  m.rect(-9.6, -7.2, -8.4, -6, 1.2, "crate")
  m.rect(-8.2, -7.2, -6.6, -6, 1.05, "pallets")
  m.rect(6.6, 24, 7.8, 26.4, 1.15, "pallets")
  for (const z of [-48, -28, -8, 18, 38]) m.prop("streetlamp", 5.4, z, { h: 7, rot: Math.PI / 2 })
  for (const z of [-38, -18, 28, 48]) m.prop("streetlamp", -5.4, z, { h: 7, rot: -Math.PI / 2 })
  m.prop("powerline", -11.5, -B - 25, { x2: -11.5, z2: B + 25, h: 9 })
  m.prop("hydrant", 5.2, 7.2)

  // --- between Halle 1 and the road --------------------------------------------------------------------------
  m.container(-9.5, -38, "z", 6.1, [PAINT.red])
  m.rect(-12.6, -4.2, -11.4, -1.8, 2.4, "crate")
  m.car(-10.4, -14.6, "x", 0x8d8a80, 3)

  // --- east strip / cross road east ------------------------------------------------------------------------
  m.container(48.2, -8.5, "x", 12.2, [PAINT.teal])
  m.rect(24, -8.6, 27.4, -8, 1.05, "jersey")
  m.rect(36.6, -5.6, 37.8, -4.4, 1.2, "crate")
  m.mast(46, 9, 12, Math.PI * 0.6, 2)

  // --- south-east container yard ----------------------------------------------------------------------------
  m.container(16, 12, "x", 12.2, [PAINT.blue, PAINT.red])
  m.container(12, 26, "z", 12.2, [PAINT.grey])
  m.container(20, 36, "x", 6.1, [PAINT.green, PAINT.orange])
  m.container(26, 42, "z", 12.2, [PAINT.orange])
  m.container(38, 38, "x", 6.1, [PAINT.brown])
  m.container(46, 40.5, "x", 12.2, [PAINT.navy, PAINT.white])
  m.rect(17.2, 22.8, 18.4, 25.2, 1.15, "pallets")
  m.rect(30, 33.2, 32.4, 34.4, 1.2, "crate")
  m.rect(13, 45.6, 15.4, 46.8, 1.1, "pallets")
  m.rect(36.4, 47.4, 38.8, 48.6, 1.2, "crate")

  // --- south-west parking lot -----------------------------------------------------------------------------
  m.car(-35.5, 34.8, "z", PAINT.red, 0)
  m.car(-25.5, 34.8, "z", 0x9aa0a6, 1)
  m.car(-15.5, 47.2, "z", 0x2b2f35, 4)
  m.car(-30.5, 47.6, "z", 0x5d4630, 4)
  m.rect(-49.4, 33.8, -44, 34.4, 1.2, "brickwall", { tint: 0x8d5a46 })
  m.rect(-54.4, 46.8, -50.4, 47.4, 1.2, "brickwall", { tint: 0x8d5a46 })
  m.rect(-42.6, 49.4, -41.4, 50.6, 1.15, "pallets")
  m.rect(-53, 24, -51.8, 26.4, 1.15, "pallets")

  // --- extra cover ---------------------------------------------------------------------------------------------
  m.rect(-20.4, -36.6, -18, -35.4, 1.15, "pallets")
  m.rect(10.6, -6.6, 11.8, -4.2, 1.2, "crate")
  m.rect(-30, 1.6, -26.6, 2.2, 1.05, "jersey")
  m.rect(-53.2, -7.6, -52, -5.2, 1.2, "crate")
  m.rect(-12.4, 15.8, -11.2, 18.2, 1.15, "pallets")

  // --- fences ---------------------------------------------------------------------------------------------------
  m.fence(-14, -52, -14, -33.6, [], false)
  m.fence(6.5, -38.5, 6.5, -52.5, [[-44, 0]], false)

  // --- lights ---------------------------------------------------------------------------------------------------
  m.light({ x: 30, y: 13.6, z: -44, color: 0xffd9a8, intensity: 260, distance: 34, tx: 35, ty: 0, tz: -40, angle: 0.75 })
  m.light({ x: -21, y: 7.1, z: -17, color: 0xdfe8ff, intensity: 40, distance: 16 })
  m.light({ x: -21, y: 3.1, z: 21, color: 0xffe2b0, intensity: 18, distance: 11 })
  m.light({ x: 30, y: 7.6, z: -24, color: 0xdfe8ff, intensity: 45, distance: 17 })

  // --- props: clutter -------------------------------------------------------------------------------------------
  m.prop("weeds", -55, 8, { w: 14, d: 46, v: 40 })
  m.prop("weeds", 46, 30, { w: 9, d: 25, v: 24 })
  m.prop("weeds", -55, -55, { w: 30, d: 23, v: 30 })
  m.prop("weeds", 8, -55, { w: 47, d: 16, v: 30 })
  m.prop("tyres", -48, 44, {})
  m.prop("tyres", 44, 31, {})
  m.prop("pallet", 8.6, 16.5, { rot: 0.3 })
  m.prop("pallet", -12.5, 26.5, { rot: 1.2 })
  m.prop("pallet", 33, -38.8, { rot: 0.1 })
  m.prop("debris", -26, 6.5, {})
  m.prop("debris", 18, -6.5, {})
  m.prop("cones", -2.5, -16, {})

  const layout = m.finish({
    id: "greyzone",
    bounds: { minX: -B, maxX: B, minZ: -B, maxZ: B },
    ground: { surface: "gravel", look: "gravel" },
    perimeter: { n: { h: 0.35, style: "fence" }, e: { h: 0.35, style: "fence" }, s: { h: 0.35, style: "fence" }, w: { h: 2.6, style: "wall" } },
    gates: [{ side: "n", at: 0, w: 10 }, { side: "s", at: 0, w: 10 }, { side: "e", at: 2, w: 8 }, { side: "w", at: 2, w: 8 }],
    playerSpawns: [
      { x: -46, z: 52, yaw: yawTo(-46, 52, -20, 20) },
      { x: 46, z: 52, yaw: yawTo(46, 52, 25, 10) },
      { x: 1.5, z: 52.5, yaw: 0 },
    ],
    lootSpawns: [
      { x: -16.6, z: -23.8, tier: 2, yaw: 0 },
      { x: -34.4, z: -20.5, tier: 2, yaw: Math.PI / 2 },
      { x: -44.6, z: -21.5, tier: 1, yaw: Math.PI / 2 },
      { x: 29.5, z: -27.9, tier: 2, yaw: 0 },
      { x: 42.6, z: -27, tier: 1, yaw: Math.PI / 2 },
      { x: -33, z: 26.9, tier: 2, yaw: 0 },
      { x: -36.6, z: 19.6, tier: 2, yaw: Math.PI / 2 },
      { x: 44.4, z: 24.6, tier: 2, yaw: Math.PI / 2 },
      { x: -51.2, z: -43, tier: 1, yaw: Math.PI / 2 },
      { x: -29, z: -36, tier: 1, yaw: 0 },
      { x: 15.5, z: -39.6, tier: 1, yaw: Math.PI / 2 },
      { x: 9.5, z: 26, tier: 0, yaw: Math.PI / 2 },
      { x: 26, z: 49.3, tier: 0, yaw: 0 },
      { x: -25.5, z: 37.6, tier: 0, yaw: 0 },
      { x: -12, z: -38, tier: 1, yaw: Math.PI / 2 },
      { x: 48, z: -10.6, tier: 0, yaw: 0 },
    ],
    enemySpawns: [
      { x: -42, z: -20, patrol: [P(-42, -22), P(-42, -10), P(-28, -10), P(-28.5, -19)] },
      { x: -38, z: -37, patrol: [P(-30, -37), P(-47, -37.5), P(-51.3, -45)] },
      { x: -17, z: -34, patrol: [P(-22, -33.6), P(-8, -33.6), P(-8, -26.5)] },
      { x: 0, z: -36, patrol: [P(1, -50), P(-1, -14)] },
      { x: 8, z: -32, patrol: [P(8, -36), P(13.5, -16), P(8, -12)] },
      { x: 30, z: -40, patrol: [P(26, -39), P(40, -39), P(40, -52), P(25.4, -50)] },
      { x: -21, z: 21, patrol: [P(-21, 21), P(-32, 24.5), P(-32, 17.5)] },
      { x: 20, z: 20, patrol: [P(18, 17), P(19, 30), P(28, 30)] },
      { x: 34, z: 20, patrol: [P(33.5, 19.5), P(43.5, 19)] },
      { x: -10, z: 2, patrol: [P(-20, 2), P(10, 2)] },
      { x: 28, z: -5, patrol: [P(20, -5), P(42, -5), P(42, 3)] },
      { x: -22, z: -4.5, patrol: [P(-34, -4.5), P(-15, -4.5)] },
    ],
    extractions: [
      { id: "nord", name: "Nordparkplatz", x: 41, z: -47, radius: 4.5 },
      { id: "ost", name: "Osttor", x: 47, z: 2, radius: 4.5 },
      { id: "west", name: "Westzufahrt", x: -48, z: 2, radius: 4.5 },
    ],
    reinforcementSpawns: [P(1.5, 53), P(-53, 42), P(30, 53), P(-10, -53)],
  })
  return layout
}

// ---------------------------------------------------------------------------------------------------------------
// IV-02 Stahlhafen — container terminal at blue hour. Water east (x > 57) and south (z > 57); gate in the west.
// Yard: four container columns (A–D) × six rows along Z, central lane x 0, cross lanes z -18 and z 17.
// ---------------------------------------------------------------------------------------------------------------
function harborLayout(): MapLayout {
  const m = new Draft()
  const B = 56

  // --- ground -----------------------------------------------------------------------------------------------
  m.area(-B - 30, -B - 30, B + 1, B + 1, "asphalt", "asphalt")
  m.area(26, -B - 30, B + 1, B + 1, "concrete", "quay")
  m.area(-28, 49, B + 1, B + 1, "concrete", "quay")
  m.area(-B - 30, -B - 30, -26, -B, "dirt", "dirt")
  m.area(-B - 30, -B - 30, -B, 38, "gravel", "gravel")
  m.area(-B - 30, 38, B - 50, 50, "asphalt", "asphalt")
  m.area(-54, -52, -30, -30, "concrete", "pavement")
  m.area(-54, -16, -36, 2, "concrete", "pavement")
  // yard markings: block outlines (yellow), lane centre lines, bay numbers, crane rails
  for (const x of [-21.6, -13.9, -10.6, -2.9, 2.9, 10.6, 13.9, 21.6]) m.line(x - 0.06, -51, x + 0.06, 50, 0xcaa43a)
  m.dashed(0, -B, 0, B - 6, 0.14, 4, 4)
  for (const z of [-18.3, 17.1]) m.dashed(-26, z, 26, z, 0.14, 4, 4)
  for (const x of [31, 47]) m.prop("rail", x, 0, { z2: 0, d: 2 * B + 2 })
  m.dashed(-B, 44, -28, 44, 0.15, 3, 3)

  // --- container yard ------------------------------------------------------------------------------------------
  const cols: Record<string, number[]> = { A: [-20.25, -17.75, -15.25], B: [-9.25, -6.75, -4.25], C: [4.25, 6.75, 9.25], D: [15.25, 17.75, 20.25] }
  const rows = [-43.9, -27.9, -8.7, 7.5, 26.7, 42.9]
  const palette = [PAINT.red, PAINT.blue, PAINT.green, PAINT.orange, PAINT.grey, PAINT.teal, PAINT.white, PAINT.brown, PAINT.navy, PAINT.maroon, PAINT.yellow, PAINT.blue, PAINT.red]
  let k = 5
  const pick = () => palette[(k = (k * 7 + 3) % palette.length)]
  const yard: Array<[string, number, string]> = [
    ["A", 0, "232"], ["B", 0, "122"], ["C", 0, "331"], ["D", 0, "210"],
    ["A", 1, "112"], ["B", 1, "2T2"], ["C", 1, "223"], ["D", 1, "101"],
    ["A", 2, "322"], ["B", 2, "111"], ["C", 2, "232"],
    ["A", 3, "221"], ["B", 3, "332"], ["C", 3, "1t1"], ["D", 3, "222"],
    ["A", 4, "001"], ["B", 4, "212"], ["C", 4, "322"], ["D", 4, "123"],
    ["A", 5, "121"], ["B", 5, "220"], ["D", 5, "231"],
  ]
  let v = 0
  for (const [col, row, spec] of yard) {
    spec.split("").forEach((ch, i) => {
      const x = cols[col][i], z = rows[row]
      if (ch === "T" || ch === "t") m.tunnel(x, z, "z", 12.2, pick(), ch === "T" ? [pick()] : [], `tunnel-${col}${row}`)
      else { const n = Number(ch); if (n > 0) m.container(x, z, "z", 12.2, Array.from({ length: n }, pick), (v += 3)) }
    })
    m.prop("decal", (cols[col][0] + cols[col][2]) / 2, rows[row] - 7.6, { y: 0, w: 2.2, h: 1.1, face: "n", v: 20, text: `${col}${String(row + 1).padStart(2, "0")}` })
  }
  // plaza in block D3: reach stacker and cargo
  m.rect(15.2, -12.6, 19.2, -5.4, 3.1, "machine", { tint: PAINT.yellow, v: 5 })
  m.prop("stackerboom", 17.2, -9, { rot: 0 })
  m.container(20.3, -3.9, "x", 6.1, [PAINT.grey])
  m.rect(14.6, -14.2, 15.8, -13, 1.2, "crate")
  // open lot A5 with a single box and pallets
  m.rect(-21.2, 22, -18.8, 23.2, 1.1, "pallets")
  m.rect(-21.2, 30.4, -18.8, 31.6, 1.2, "crate")
  // customs check C6: site cabins
  m.rect(3.4, 37.6, 9.4, 40.2, 2.7, "portakabin", { tint: 0xd5d2c4 })
  m.rect(4, 44.2, 10, 46.8, 2.7, "portakabin", { tint: 0xd5d2c4, v: 1 })
  m.rect(3.4, 49.6, 6.8, 50.2, 1.05, "jersey")

  // --- gantry cranes (legs block; portal, boom and machinery are visual) -------------------------------------
  const craneTints = [0x2f6aa0, 0xb5452e]
  ;[-24, 20].forEach((zc, i) => {
    for (const x of [31, 47]) for (const dz of [-7, 7]) m.rect(x - 0.7, zc + dz - 0.7, x + 0.7, zc + dz + 0.7, 24, "crane", { tint: craneTints[i] })
    m.prop("crane", 39, zc, { w: 16, d: 14, h: 24, tint: craneTints[i], v: i })
  })
  m.container(39, -24, "x", 12.2, [PAINT.orange, PAINT.blue])
  m.container(36, -45, "z", 12.2, [PAINT.blue])
  m.container(34, 46, "z", 6.1, [PAINT.green, PAINT.red])
  m.trailer(36, 6, "z", PAINT.maroon)
  m.solid(36, -2, 2.4, 2.4, 2.8, "truckcab", { tint: 0xc9a227, v: 3 })
  m.rect(48, -38.4, 52, -28.4, 1.4, "hatch", { tint: 0x444a50 })
  m.rect(48.6, 24, 52.6, 34, 1.4, "hatch", { tint: 0x444a50 })
  m.rect(27.6, 18.6, 28.8, 21, 1.15, "pallets")
  m.rect(38, 30.6, 40.4, 31.8, 1.2, "crate")
  m.rect(50.6, -12.6, 51.8, -10.2, 1.2, "crate")
  m.rect(52.2, -55.4, 54.6, -54.2, 1.2, "crate")
  m.rect(52.4, 52.4, 54.8, 53.6, 1.2, "crate")
  m.rect(-52, 54.2, -48.6, 54.8, 1.05, "jersey")
  m.rect(27.6, -33.4, 30, -32.2, 1.15, "pallets")
  m.mast(28.4, -8, 20, Math.PI / 2 + 0.3, 4)
  m.mast(28.4, 36, 20, Math.PI / 2 - 0.3, 4)
  for (let z = -54; z <= 54; z += 9) m.prop("bollard", 56.6, z)
  for (let x = -24; x <= 54; x += 9) m.prop("bollard", x, 56.6)
  m.prop("ship", 150, -40, { w: 30, d: 150, h: 11 })

  // --- yard lamp masts ---------------------------------------------------------------------------------------
  m.mast(-1.8, -21.2, 20, Math.PI, 4)
  m.mast(1.8, 14.4, 20, 0, 4)
  m.mast(-24.6, -21.2, 18, -Math.PI / 2, 2)
  m.mast(24.4, 33.6, 18, Math.PI / 2, 2)
  m.mast(-24.6, 37.2, 18, Math.PI, 2)

  // --- Lagerschuppen (shed, enterable) ------------------------------------------------------------------------
  m.building({
    id: "shed", name: "Lagerschuppen", x0: -52, z0: -50, x1: -32, z1: -32, h: 8, style: "cladding", tint: 0x5e6d63,
    e: [{ at: -41, w: 5, kind: "gate", top: 4.8 }],
    s: [{ at: -46, w: 2.4 }, { at: -39, w: 2.2, kind: "window" }],
    n: [{ at: -42, w: 4.4, kind: "closed" }],
    w: [{ at: -38, w: 2.4 }],
    lamps: [[-46, -45], [-38, -45], [-46, -37], [-38, -37]],
  })
  m.rect(-50, -47.2, -39, -46, 3.4, "rack")
  m.rect(-50, -36.4, -41, -35.2, 3.4, "rack")
  m.rect(-36.4, -48.4, -34, -46, 2.1, "machine", { tint: PAINT.orange, v: 2 })
  m.rect(-37.6, -35.2, -36.4, -32.8, 1.15, "pallets")
  m.rect(-51.4, -43.6, -50.2, -41.2, 2.4, "crate")
  m.rect(-45, -41.8, -42.6, -40.6, 1.2, "crate")
  m.prop("decal", -32, -46.5, { y: 6, w: 4, h: 1.2, face: "e", v: 6, text: "LAGER 3" })

  // --- Werkstatt (maintenance, enterable) ---------------------------------------------------------------------
  m.building({
    id: "workshop", name: "Werkstatt", x0: -52, z0: -14, x1: -38, z1: 0, h: 6, style: "block", tint: 0x8d8a82,
    e: [{ at: -7, w: 4.4, kind: "gate", top: 4.2 }],
    n: [{ at: -45, w: 2.4 }],
    s: [{ at: -48, w: 2, kind: "window" }, { at: -42, w: 2, kind: "window" }],
    w: [{ at: -7, w: 2, kind: "window" }],
    lamps: [[-48, -7], [-42, -7]],
  })
  m.rect(-51.6, -13.4, -46, -12.4, 0.95, "desk", { v: 1 })
  m.rect(-51.6, -4.6, -50.8, -0.6, 2.2, "rack")
  m.rect(-44, -2.6, -40.4, -0.5, 1.5, "machine", { tint: 0x5a6e74, v: 2 })
  m.rect(-46, -9.2, -43.6, -6.8, 1.0, "proxy-tyres")
  m.prop("tyres", -44.8, -8, { v: 1 })

  // --- Torhaus (gate office, enterable) -------------------------------------------------------------------------
  m.building({
    id: "gatehouse", name: "Torhaus", x0: -50, z0: 27, x1: -41, z1: 35, h: 3.2, style: "plaster", tint: 0xd2cfc4,
    e: [{ at: 31, w: 2.4 }],
    n: [{ at: -45.5, w: 2.2, kind: "window" }],
    s: [{ at: -47, w: 2.2, kind: "window" }, { at: -43.5, w: 2.2, kind: "window" }],
    w: [{ at: 31, w: 2, kind: "window" }],
    floor: "wood", floorLook: "tiles", lamps: [[-45.5, 31]],
  })
  m.rect(-49.6, 27.4, -47.4, 28.4, 0.78, "desk")
  m.rect(-42.2, 33.4, -41.4, 34.6, 1.9, "cabinet")
  // customs canopy over the gate road
  m.rect(-40, 38.6, -29, 49.4, 0.35, "roof", { y: 4.8, v: 1 })
  for (const x of [-39.6, -29.4]) for (const z of [39, 49]) m.prop("post", x, z, { h: 4.8, r: 0.14 })
  m.rect(-35.6, 43.4, -33.4, 44.6, 2.5, "kiosk", { tint: 0xd2cfc4 })
  m.prop("boom", -48, 40.2, { w: 7.6, rot: 0 })
  m.rect(-48.25, 39.75, -47.75, 40.25, 1.1, "machine", { tint: 0xc9a227, v: 8 })
  m.rect(-55.6, 39.6, -55, 43, 1.05, "jersey")
  m.car(-46, 23, "x", 0x9aa0a6, 1)
  m.car(-36, 23, "x", PAINT.navy, 0)
  m.rect(-31.2, 25.6, -28.8, 26.8, 1.15, "pallets")

  // --- west lane cover --------------------------------------------------------------------------------------
  m.rect(-26.4, -36.2, -25.2, -33.8, 1.2, "crate")
  m.rect(-27.6, -2.4, -24.2, -1.8, 1.05, "jersey")
  m.rect(-27.4, 7.8, -26.2, 10.2, 1.15, "pallets")
  m.container(-31.6, 12, "x", 6.1, [PAINT.grey, PAINT.green])
  m.rect(-31.4, -26.4, -30.2, -24, 1.2, "crate")

  // --- fences (perimeter decoration handled by world.ts) --------------------------------------------------------
  m.fence(-30, -B + 0.4, -30, -51.6, [])

  // --- lights ---------------------------------------------------------------------------------------------------
  m.light({ x: -1.8, y: 19.4, z: -21.2, color: 0xff9a40, intensity: 650, distance: 42 })
  m.light({ x: 1.8, y: 19.4, z: 14.4, color: 0xff9a40, intensity: 650, distance: 42 })
  m.light({ x: 28.4, y: 19.4, z: -8, color: 0xff9a40, intensity: 650, distance: 42 })
  m.light({ x: -42, y: 7.2, z: -41, color: 0xdce6ff, intensity: 160, distance: 22 })

  m.prop("weeds", -B, -B, { w: 26, d: 6, v: 20 })
  m.prop("weeds", -B, -30, { w: 4, d: 60, v: 20 })
  m.prop("puddle", -6, -18, { w: 5, d: 3 })
  m.prop("puddle", 12, 17.4, { w: 4, d: 2.4 })
  m.prop("puddle", 40, 12, { w: 6, d: 3 })
  m.prop("puddle", -36, 44, { w: 5, d: 2.5 })
  m.prop("pallet", 23.4, -20.4, { rot: 0.4 })
  m.prop("pallet", -12.3, 34.8, { rot: 1.1 })
  m.prop("cones", 0, 32, {})
  m.prop("lifebuoy", 54, -20)
  m.prop("lifebuoy", 20, 54.4)

  return m.finish({
    id: "harbor",
    bounds: { minX: -B, maxX: B, minZ: -B, maxZ: B },
    ground: { surface: "asphalt", look: "asphalt" },
    perimeter: { n: { h: 0.35, style: "fence" }, w: { h: 0.35, style: "fence" }, e: { h: 1.1, style: "quay" }, s: { h: 1.1, style: "quay" } },
    water: { sides: ["e", "s"], level: -2.3 },
    gates: [{ side: "w", at: 44, w: 9 }],
    playerSpawns: [
      { x: -52, z: 44, yaw: yawTo(-52, 44, 0, 44) },
      { x: -53, z: 14, yaw: yawTo(-53, 14, 0, 0) },
      { x: -12.25, z: -53, yaw: yawTo(-12.25, -53, -12.25, 0) },
    ],
    lootSpawns: [
      { x: -44, z: -44.4, tier: 2, yaw: 0 },
      { x: -48.6, z: -34, tier: 2, yaw: 0 },
      { x: -49, z: -2, tier: 2, yaw: Math.PI / 2 },
      { x: -48.6, z: 33.6, tier: 2, yaw: 0 },
      { x: -6.5, z: -27.9, tier: 2, yaw: Math.PI / 2 },
      { x: 6.5, z: 7.5, tier: 2, yaw: Math.PI / 2 },
      { x: -12.25, z: -40, tier: 1, yaw: Math.PI / 2 },
      { x: 12.25, z: 29, tier: 1, yaw: Math.PI / 2 },
      { x: 18.9, z: -36.3, tier: 1, yaw: 0 },
      { x: -17.75, z: 25, tier: 1, yaw: 0 },
      { x: 39, z: -21.7, tier: 1, yaw: 0 },
      { x: 50, z: -27.3, tier: 1, yaw: 0 },
      { x: 32.6, z: 42, tier: 0, yaw: Math.PI / 2 },
      { x: -28.2, z: -3, tier: 0, yaw: Math.PI / 2 },
      { x: 23.2, z: 3, tier: 0, yaw: Math.PI / 2 },
      { x: 8, z: 42.4, tier: 0, yaw: 0 },
    ],
    enemySpawns: [
      { x: -38, z: -45.5, patrol: [P(-36, -41), P(-48, -41), P(-48, -34), P(-36, -38)] },
      { x: -41, z: -10, patrol: [P(-41, -7), P(-48, -5), P(-48, -9)] },
      { x: -30, z: 30, patrol: [P(-27, 20), P(-27, 34), P(-36, 37)] },
      { x: 0, z: -30, patrol: [P(0, -24), P(0, -51)] },
      { x: 0, z: 30, patrol: [P(0, 22), P(0, 47)] },
      { x: -10, z: -18.3, patrol: [P(-22, -18.3), P(22, -18.3)] },
      { x: 10, z: 17.1, patrol: [P(23, 17.1), P(-18, 17.1)] },
      { x: 40, z: -35, patrol: [P(40, -48), P(40, -30), P(43, -14)] },
      { x: 40, z: 0, patrol: [P(41, -10), P(41, 9), P(51, 4)] },
      { x: 42, z: 36, patrol: [P(42, 30), P(50, 40), P(40, 52)] },
      { x: -12.25, z: -8, patrol: [P(-12.25, -14), P(-12.25, 12)] },
      { x: 12.25, z: 30, patrol: [P(12.25, 22), P(12.25, 47)] },
      { x: 22.5, z: -8, patrol: [P(23, -14), P(23, -2), P(13, -1)] },
      { x: -10, z: 52, patrol: [P(-18, 52.5), P(20, 52.5)] },
    ],
    extractions: [
      { id: "kainord", name: "Kai Nord", x: 46, z: -46, radius: 4.5 },
      { id: "kaimitte", name: "Liegeplatz Mitte", x: 44, z: -1, radius: 4.5 },
      { id: "kaisued", name: "Kai Süd", x: 46, z: 45, radius: 4.5 },
    ],
    reinforcementSpawns: [P(-40, -53), P(10, -53), P(-53, 10), P(-53, 52)],
  })
}
// ---------------------------------------------------------------------------------------------------------------
// IV-03 Nachtgitter — military compound at night. Helipad north, command bunker centre, inner fence z 10,
// storage yard south (infiltration breaches in the south fence), checkpoint gate west, vehicle park north-east.
// ---------------------------------------------------------------------------------------------------------------
function blacksiteLayout(): MapLayout {
  const m = new Draft()
  const B = 58
  const OLIVE = 0x4d5536, SAND = 0x9a8a62, DRAB = 0x5d5a44

  // --- ground -----------------------------------------------------------------------------------------------
  m.area(-B - 40, -B - 40, B + 40, B + 40, "dirt", "grass")
  m.area(-B + 2, -B + 2, B - 2, B - 2, "dirt", "dirt")
  m.area(-B - 40, -2, 50, 5, "asphalt", "asphalt")
  m.area(-3, 5, 4, 50, "gravel", "gravel")
  m.area(-14, -8, 14, -2, "concrete", "pavement")
  m.area(-9, -53, 9, -35, "concrete", "pad")
  m.area(-2, -35, 3, -22, "gravel", "gravel")
  m.area(18, -46, 50, -22, "gravel", "gravel")
  m.area(-26, 14, 40, 50, "gravel", "gravel")
  m.area(24, -18, 40, -2, "concrete", "pavement")
  m.dashed(-B - 30, 1.5, 48, 1.5, 0.14, 3, 4)
  m.prop("helipad", 0, -44, { r: 7 })

  // --- helipad: HESCO wall, floodlights, windsock -------------------------------------------------------------
  m.rect(-12, -56.2, 12, -55.1, 2.2, "hesco")
  m.rect(-13.1, -56.2, -12, -48, 2.2, "hesco")
  m.rect(12, -56.2, 13.1, -48, 2.2, "hesco")
  m.rect(-16, -39.6, -12.4, -38.85, 1.15, "sandbag")
  m.rect(12.4, -39.6, 16, -38.85, 1.15, "sandbag")
  m.mast(-11, -34.5, 13, Math.PI * 0.85, 2)
  m.mast(11, -34.5, 13, -Math.PI * 0.85 + Math.PI * 2, 2)
  m.prop("windsock", 15.5, -50, { h: 6 })
  m.rect(-6.6, -33.6, -4.2, -32.4, 1.2, "crate", { tint: OLIVE })

  // --- watchtowers (base blocks; platforms and searchlights are visual) ---------------------------------------
  const tower = (x: number, z: number, rot: number) => { m.rect(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 2.8, "towerbase"); m.prop("tower", x, z, { h: 7, rot }) }
  tower(-52, -52, -Math.PI * 0.75); tower(52, -52, Math.PI * 0.75); tower(-52, 30, -Math.PI * 0.25); tower(52, 30, Math.PI * 0.25)
  m.prop("searchlight", -52, -52, { y: 7.9, rot: -Math.PI * 0.75, v: 0.9, r: 30 })
  m.prop("searchlight", 52, -52, { y: 7.9, rot: Math.PI * 0.75, v: 0.9, r: 30 })
  m.prop("searchlight", -52, 30, { y: 7.9, rot: Math.PI * 1.15, v: 0.8, r: 26 })
  m.prop("searchlight", 52, 30, { y: 7.9, rot: Math.PI * 0.85, v: 0.8, r: 26 })

  // --- Kaserne A + B (barracks, enterable) ---------------------------------------------------------------------
  m.building({
    id: "barracksA", name: "Kaserne A", x0: -46, z0: -40, x1: -22, z1: -31, h: 3.6, style: "siding", tint: 0x5c6449, t: 0.25,
    s: [{ at: -40, w: 2.4 }, { at: -28, w: 2.4 }, { at: -44, w: 1.6, kind: "window" }, { at: -34, w: 2, kind: "window" }, { at: -24, w: 1.6, kind: "window" }],
    n: [{ at: -34, w: 2.4 }, { at: -42, w: 2, kind: "window" }, { at: -26, w: 2, kind: "window" }],
    e: [{ at: -35.5, w: 2.4 }],
    floor: "wood", floorLook: "plank", lamps: [[-41, -35.5], [-34, -35.5], [-27, -35.5]],
  })
  for (const x of [-44.6, -38.6, -29.4]) m.rect(x - 0.45, -39.7, x + 0.45, -37.7, 1.8, "bunk")
  for (const x of [-36.6, -31.4, -24.4]) m.rect(x - 0.45, -33.3, x + 0.45, -31.3, 1.8, "bunk")
  m.rect(-45.7, -34.2, -45.1, -31.6, 1.9, "cabinet", { v: 2 })
  m.building({
    id: "barracksB", name: "Kaserne B", x0: -46, z0: -22, x1: -22, z1: -13, h: 3.6, style: "siding", tint: 0x59614a, t: 0.25,
    n: [{ at: -40, w: 2.4 }, { at: -28, w: 2.4 }, { at: -34, w: 2, kind: "window" }],
    s: [{ at: -34, w: 2.4 }, { at: -42, w: 2, kind: "window" }, { at: -26, w: 2, kind: "window" }],
    w: [{ at: -17.5, w: 2.4 }],
    floor: "wood", floorLook: "plank", lamps: [[-41, -17.5], [-34, -17.5], [-27, -17.5]],
  })
  for (const x of [-44, -37, -31]) m.rect(x - 0.45, -15.3, x + 0.45, -13.3, 1.8, "bunk")
  for (const x of [-44.4, -24.4]) m.rect(x - 0.45, -21.7, x + 0.45, -19.7, 1.8, "bunk")
  m.rect(-32.4, -19.6, -29.6, -18.4, 0.78, "desk", { v: 2 })
  m.prop("decal", -34, -40, { y: 2.6, w: 2.6, h: 0.6, face: "n", v: 7, text: "KASERNE A" })
  m.prop("decal", -34, -13, { y: 2.6, w: 2.6, h: 0.6, face: "s", v: 7, text: "KASERNE B" })

  // --- Kommandobunker (enterable, thick concrete) --------------------------------------------------------------
  m.building({
    id: "command", name: "Kommandobunker", x0: -12, z0: -22, x1: 12, z1: -8, h: 3.8, style: "bunker", tint: 0x8e8b84, t: 0.6,
    s: [{ at: -6, w: 2.4 }, { at: 6, w: 2.4 }],
    n: [{ at: 0, w: 2.4 }],
    lamps: [[-8, -11.5], [0, -11.5], [8, -11.5], [-8, -18.5], [0, -18.5], [8, -18.5]],
  })
  m.wall(-11.4, -15, 11.4, -15, 3.8, 0.3, "concrete", [{ at: -8, w: 2.4 }, { at: 0, w: 2.4 }, { at: 8, w: 2.4 }], { tint: 0xa19d93, id: "command-in", out: [0, 1] })
  m.wall(-4, -21.4, -4, -15.15, 3.8, 0.3, "concrete", [], { tint: 0xa19d93 })
  m.wall(4, -21.4, 4, -15.15, 3.8, 0.3, "concrete", [], { tint: 0xa19d93 })
  m.rect(-11.3, -21.3, -10.3, -16.4, 1.3, "console")
  m.rect(-9.6, -21.3, -5.2, -20.5, 1.3, "console", { v: 1 })
  m.rect(1.4, -19.6, 3.4, -17.6, 0.9, "desk", { v: 3 })
  m.rect(5, -21.3, 6.2, -16.6, 1.9, "cabinet", { v: 2 })
  m.rect(10.1, -21.3, 11.3, -20.1, 1.2, "crate", { tint: OLIVE })
  m.rect(-11.3, -11.6, -10.1, -9.2, 1.2, "crate", { tint: OLIVE })
  m.rect(9.6, -9.4, 11.3, -8.7, 1.9, "cabinet", { v: 2 })
  m.rect(-1.2, -12.4, 1.2, -11.2, 0.78, "desk", { v: 2 })
  m.rect(-8.2, -6, -3.8, -5.4, 3.4, "twall")
  m.rect(3.8, -6, 8.2, -5.4, 3.4, "twall")
  m.rect(-2.4, -24.9, 2.4, -24.3, 3.4, "twall")
  m.rect(-14.6, -12.8, -13.85, -9, 1.15, "sandbag")
  m.prop("decal", 0, -8, { y: 3.1, w: 3.4, h: 0.5, face: "s", v: 8, text: "BUNKER 1" })

  // --- Munitionsbunker (enterable) ----------------------------------------------------------------------------
  m.building({
    id: "ammo", name: "Munitionsbunker", x0: 26, z0: -16, x1: 38, z1: -6, h: 3.2, style: "bunker", tint: 0x878379, t: 0.6,
    w: [{ at: -11, w: 2.4 }],
    e: [{ at: -11, w: 2.4 }],
    lamps: [[29, -11], [35, -11]],
  })
  for (const x of [27.8, 30.4, 33, 35.6]) m.rect(x - 0.6, -15.3, x + 0.6, -14.1, x === 33 ? 2.4 : 1.2, "crate", { tint: OLIVE })
  for (const x of [28.4, 31.6, 34.8]) m.rect(x - 0.6, -7.9, x + 0.6, -6.7, x === 31.6 ? 1.2 : 2.4, "crate", { tint: OLIVE })
  m.prop("decal", 26, -11, { y: 2.65, w: 1.6, h: 0.9, face: "w", v: 9, text: "M-2" })

  // --- vehicle park with carport --------------------------------------------------------------------------------
  m.rect(24, -44, 46, -34, 0.25, "roof", { y: 4, v: 2 })
  for (const x of [24.3, 35, 45.7]) for (const z of [-43.7, -34.3]) m.prop("post", x, z, { h: 4, r: 0.12 })
  m.truck(28.6, -39, "s", OLIVE, 0x5e6240, 6.2)
  m.truck(35, -39, "s", OLIVE, 0x5e6240, 6.2)
  m.truck(41.4, -39, "n", DRAB, 0x6a6448, 6.2)
  m.car(28, -27, "x", OLIVE, 5)
  m.car(40, -27.4, "z", DRAB, 5)
  m.tank(47.5, -25, 1.5, 2.6, 0x55603e, "")
  m.rect(19.6, -46, 22, -44.8, 1.2, "crate", { tint: OLIVE })
  m.mast(21.4, -24, 13, Math.PI * 0.75 + 0.2, 2)
  m.rect(44.6, -48.6, 48.8, -47.85, 1.15, "sandbag")
  m.rect(-32, -55.6, -28.4, -54.85, 1.15, "sandbag")
  m.rect(33, -55.6, 35.4, -54.4, 1.2, "crate", { tint: OLIVE })
  m.rect(54.4, -36, 55.5, -33.8, 2.2, "hesco")

  // --- west checkpoint ------------------------------------------------------------------------------------------
  m.rect(-53.1, -6.6, -50.9, -4.4, 2.6, "kiosk", { tint: 0x6a6c5c })
  m.prop("boom", -55, -1.6, { w: 6.4, rot: 0 })
  m.rect(-55.25, -1.85, -54.75, -1.35, 1.1, "machine", { tint: 0xc9a227, v: 8 })
  m.rect(-47, -2, -46.4, 1.4, 1.05, "jersey")
  m.rect(-41.3, 1.6, -40.7, 5, 1.05, "jersey")
  m.rect(-50, 7.2, -45.6, 7.95, 1.15, "sandbag")
  m.rect(-50, 7.95, -49.25, 10.4, 1.15, "sandbag")
  m.mast(-44, 8.6, 12, Math.PI * 0.8, 2)
  m.rect(-36, -7.4, -32.4, -6.8, 1.05, "jersey")
  m.prop("sign", -56, -3, { text: "SPERRGEBIET", v: 0 })

  // --- inner fence and the core forecourt ------------------------------------------------------------------------
  m.fence(-44, 10, 44, 10, [[0.5, 7], [-30, 3], [30, 3]], true)
  m.mast(-15.2, -4.6, 12, -Math.PI * 0.55, 2)
  m.rect(14, 6.6, 17.4, 7.2, 1.05, "jersey")
  m.rect(-17.4, 6.6, -14, 7.2, 1.05, "jersey")
  m.rect(18, -6.6, 19.2, -4.2, 1.2, "crate", { tint: OLIVE })
  m.rect(4.8, 12.6, 5.55, 15, 1.15, "sandbag")
  m.rect(-4.6, 12.9, -1.2, 13.5, 1.05, "jersey")

  // --- east field --------------------------------------------------------------------------------------------------
  m.rect(43.4, -19.2, 45.6, -17, 2.2, "hesco")
  m.rect(52, 6, 54.2, 8.2, 2.2, "hesco")
  m.rect(42.2, 6.8, 45.8, 7.55, 1.15, "sandbag")

  // --- south: comms mast, generators, radar, storage yard ------------------------------------------------------
  m.rect(-31.5, 18.5, -28.5, 21.5, 1.2, "concrete", { tint: 0x8c8880 })
  m.prop("lattice", -30, 20, { h: 34 })
  m.rect(-21, 15.6, -18.6, 17, 1.6, "machine", { tint: OLIVE, v: 6 })
  m.rect(-17, 15.6, -14.6, 17, 1.6, "machine", { tint: OLIVE, v: 6 })
  m.rect(21, 19, 27, 25, 3.2, "bunker", { tint: 0x8a877f })
  m.prop("radar", 24, 22, { y: 3.2 })
  m.rect(31, 17.4, 33.4, 18.8, 1.6, "machine", { tint: SAND, v: 6 })
  m.rect(31, 21, 33.4, 22.4, 1.6, "machine", { tint: SAND, v: 6 })
  m.prop("cable", 27, 22, { x2: 31, z2: 18, v: 0 })
  m.prop("cable", -14.6, 16.3, { x2: -28.5, z2: 20, v: 0 })
  m.container(-12, 30, "x", 6.1, [OLIVE, SAND])
  m.container(-22, 40, "z", 12.2, [0x6b6b5e])
  m.container(8, 26, "x", 6.1, [SAND])
  m.container(14, 40, "x", 12.2, [OLIVE, 0x6b6b5e])
  m.container(-4, 45, "z", 6.1, [DRAB])
  m.rect(-40, 32, -34.5, 33.1, 2.2, "hesco")
  m.rect(30, 40, 36.6, 41.1, 1.1, "hesco")
  m.rect(-6, 36, -2, 36.75, 1.15, "sandbag")
  m.rect(-6, 36.75, -5.25, 39, 1.15, "sandbag")
  m.rect(18, 46, 24.5, 49, 2.3, "machine", { tint: OLIVE, v: 7 })
  m.rect(26.6, 30, 27.8, 32.4, 1.2, "crate", { tint: OLIVE })
  m.rect(-30.8, 42, -28.4, 43.2, 1.2, "crate", { tint: OLIVE })
  m.rect(3.4, 33, 4.6, 35.4, 1.2, "crate", { tint: OLIVE })
  m.rect(36, 24, 38.4, 25.2, 1.15, "pallets")
  m.rect(-46, 44, -42.4, 44.75, 1.15, "sandbag")
  m.rect(42.4, 44, 46, 44.75, 1.15, "sandbag")
  m.rect(-54, 51.4, -50.4, 52.15, 1.15, "sandbag")
  m.rect(-35.4, 54.2, -33, 55.4, 1.2, "crate", { tint: OLIVE })
  m.rect(6.9, 54, 9.1, 55.1, 1.1, "hesco")
  m.rect(33.9, 54, 36.1, 55.1, 1.1, "hesco")
  m.rect(53.4, 53.4, 55.6, 54.5, 1.1, "hesco")

  // --- lights (floodlight spots; searchlights and the rest are faked) -----------------------------------------
  m.light({ x: 11, y: 12.4, z: -34.5, color: 0xe4ecff, intensity: 900, distance: 40, tx: 0, ty: 0, tz: -44, angle: 0.62 })
  m.light({ x: -15.2, y: 11.4, z: -4.6, color: 0xe4ecff, intensity: 700, distance: 34, tx: 0, ty: 0, tz: -6, angle: 0.62 })
  m.light({ x: 21.4, y: 12.4, z: -24, color: 0xe4ecff, intensity: 800, distance: 36, tx: 33, ty: 0, tz: -34, angle: 0.62 })
  m.light({ x: 0, y: 3.4, z: -12.5, color: 0xd8e2ff, intensity: 90, distance: 18 })

  m.prop("weeds", -B, -B, { w: 2 * B, d: 5, v: 40 })
  m.prop("weeds", -B, B - 6, { w: 2 * B, d: 6, v: 40 })
  m.prop("weeds", -B, -B, { w: 5, d: 2 * B, v: 30 })
  m.prop("weeds", B - 5, -B, { w: 5, d: 2 * B, v: 30 })
  m.prop("breach", -40, B, {})
  m.prop("breach", 40, B, {})
  m.prop("barrels", 47, -21.2, { w: 1.4, d: 1.4, tint: 0x4a5536 })
  m.rect(46.3, -21.9, 47.7, -20.5, 0.95, "proxy-barrels")
  m.prop("barrels", -18, 19.4, { w: 2.2, d: 1.2, tint: 0x6a2e24 })
  m.rect(-19.1, 18.8, -16.9, 20, 0.95, "proxy-barrels")

  return m.finish({
    id: "blacksite",
    bounds: { minX: -B, maxX: B, minZ: -B, maxZ: B },
    ground: { surface: "dirt", look: "dirt" },
    perimeter: { n: { h: 0.35, style: "double" }, e: { h: 0.35, style: "double" }, s: { h: 0.35, style: "double" }, w: { h: 0.35, style: "double" } },
    gates: [{ side: "w", at: 1.5, w: 8 }],
    playerSpawns: [
      { x: -40, z: 55, yaw: 0 },
      { x: 40, z: 55, yaw: 0 },
      { x: -55, z: 40, yaw: yawTo(-55, 40, -20, 20) },
    ],
    lootSpawns: [
      { x: 8, z: -20.4, tier: 2, yaw: 0 },
      { x: -6, z: -18.5, tier: 2, yaw: Math.PI / 2 },
      { x: 0, z: -9.6, tier: 1, yaw: 0 },
      { x: 32, z: -9, tier: 2, yaw: 0 },
      { x: 27.2, z: -13.4, tier: 2, yaw: Math.PI / 2 },
      { x: -44.8, z: -36.4, tier: 2, yaw: Math.PI / 2 },
      { x: -23.4, z: -19, tier: 2, yaw: Math.PI / 2 },
      { x: -10.5, z: -49, tier: 1, yaw: Math.PI / 2 },
      { x: 10.5, z: -52, tier: 1, yaw: Math.PI / 2 },
      { x: 35, z: -45.2, tier: 1, yaw: 0 },
      { x: 48.6, z: -28.4, tier: 1, yaw: 0 },
      { x: -52, z: -48.9, tier: 1, yaw: 0 },
      { x: -27.6, z: 22.5, tier: 1, yaw: 0 },
      { x: 24, z: 26, tier: 1, yaw: 0 },
      { x: -12, z: 32.2, tier: 0, yaw: 0 },
      { x: 14, z: 42.2, tier: 0, yaw: 0 },
      { x: -19.9, z: 40, tier: 0, yaw: Math.PI / 2 },
      { x: -52, z: -8.5, tier: 0, yaw: 0 },
    ],
    enemySpawns: [
      { x: 0, z: -38, patrol: [P(-8, -38), P(8, -38), P(8, -50), P(-8, -50)] },
      { x: -48, z: -46, patrol: [P(-48, -47), P(-40, -43), P(-48.5, -36)] },
      { x: 48, z: -46, patrol: [P(48, -47), P(40, -48.5), P(49, -38)] },
      { x: -34, z: -35.5, patrol: [P(-43, -35.5), P(-25, -35.5)] },
      { x: -34, z: -17.5, patrol: [P(-43, -17.5), P(-25, -17.5)] },
      { x: -3, z: -10, patrol: [P(-9, -12.5), P(9, -12.5), P(0, -18)] },
      { x: 32, z: -31, patrol: [P(22, -31), P(46, -31), P(47, -44)] },
      { x: 32, z: -11, patrol: [P(28.5, -11), P(36, -11), P(41, -4)] },
      { x: 24, z: 16, patrol: [P(18, 16), P(30, 15.5), P(29.5, 28), P(18, 28)] },
      { x: 0, z: 7, patrol: [P(-12, 7.5), P(12, 7.5)] },
      { x: -30, z: 15, patrol: [P(-36, 15), P(-24, 15), P(-24, 25)] },
      { x: -8, z: 30, patrol: [P(-18, 31), P(8, 31)] },
      { x: -48, z: -6, patrol: [P(-49, -9), P(-38, -9), P(-38, 3)] },
      { x: 24, z: 34, patrol: [P(20, 34), P(30, 36), P(20, 43)] },
      { x: 50, z: 4, patrol: [P(48, 3), P(48, -14), P(54, -12)] },
    ],
    extractions: [
      { id: "landeplatz", name: "Landeplatz", x: 0, z: -44, radius: 5 },
      { id: "nordwest", name: "Nordwestfeld", x: -40, z: -50, radius: 4.5 },
      { id: "ostfeld", name: "Ostfeld", x: 50, z: -6, radius: 4.5 },
    ],
    reinforcementSpawns: [P(0, 55), P(-55, 10), P(55, 40), P(-20, 55)],
  })
}
