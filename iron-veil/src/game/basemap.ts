/**
 * basemap.ts — the player's compound "Stützpunkt Eisenschleier" as pure data (no three.js); world.ts builds the meshes.
 * Bounds x -40..40, z -40..75 (north = -Z): walled yard x/z ±36 with the gate in the south wall (x -4..4, z 36), the
 * approach road outside (z 36..75) where infected gather for base defence.
 *  - plots: one per StructureId, fronts facing +Z (raid.ts interacts at plot.z + d/2 + 1, always left free).
 *  - stations: every StationId with its furniture (trader stall, lockers, radio desk + antenna, plan table, workbench,
 *    gun rack, med tent, lab container, gate sign); interaction points are walkable at every structure level.
 *  - structureModel(plot, level): solids + props of the plot at that level (0 = staked empty plot, 1 tents,
 *    2 containers, 3 sheds/reinforced). wallsModel(level): the perimeter (0 broken fence with holes, 1 palisade,
 *    2 concrete T-walls, 3 steel + barbed wire); the tower model adds a second tower (2) and searchlights (3).
 * Models never overlap each other, the stations, the gate passage or the interaction points (see maps.test.ts).
 */
import { STRUCTURES, type StructureId } from "./baseData"
import { Draft, type DraftData, type MapSolid } from "./maps"
import type { Surface } from "./types"
import type { BaseLayout, BasePlot, StationId } from "./zone"
import type { TreeSpot } from "./zonemap"

export interface BaseMap extends BaseLayout, Omit<DraftData, "solids"> {
  solids: MapSolid[]
  ground: { surface: Surface; look: string }
  /** Area the perimeter model covers (setStructures rebuilds nav there). */
  wallRect: { x0: number; z0: number; x1: number; z1: number }
  /** Trees and bushes around the compound (instanced like the zone's). */
  trees: TreeSpot[]
}

const HALF = 36
const GATE_W = 8

let cache: BaseMap | null = null
export function baseMap(): BaseMap { return cache ??= buildBase() }

const PLOTS: BasePlot[] = [
  { structure: "lab", x: -24, z: -27, w: 12, d: 12, yaw: 0 },
  { structure: "hq", x: 0, z: -27, w: 20, d: 14, yaw: 0 },
  { structure: "radio", x: 24, z: -27, w: 12, d: 12, yaw: 0 },
  { structure: "bunks", x: -27, z: -8, w: 12, d: 10, yaw: 0 },
  { structure: "storage", x: -12, z: -8, w: 10, d: 10, yaw: 0 },
  { structure: "kitchen", x: 12, z: -8, w: 10, d: 10, yaw: 0 },
  { structure: "clinic", x: 27, z: -8, w: 12, d: 10, yaw: 0 },
  { structure: "workshop", x: -28, z: 10, w: 10, d: 9, yaw: 0 },
  { structure: "armory", x: -15.5, z: 10, w: 9, d: 9, yaw: 0 },
  { structure: "workbench", x: 15.5, z: 10, w: 9, d: 9, yaw: 0 },
  { structure: "generator", x: 28.5, z: 10, w: 9, d: 9, yaw: 0 },
  { structure: "tower", x: -9, z: 30, w: 5, d: 5, yaw: 0 },
  { structure: "walls", x: -24, z: 31, w: 6, d: 4, yaw: 0 },
  { structure: "garage", x: -26, z: 0.5, w: 12, d: 6, yaw: 0 },
  { structure: "scrapyard", x: 26, z: 0.5, w: 11, d: 6, yaw: 0 },
  { structure: "turrets", x: 15, z: 31.5, w: 5, d: 3.5, yaw: 0 },
]
const SECOND_TOWER = { x: 9, z: 30 }
/** Gun nests left and right of the gate (the second one comes with turrets level 2). */
export const TURRET_SPOTS = [{ x: 15, z: 31.5 }, { x: -15, z: 31.5 }]
/** Height of the gun on its nest (platform + tripod). */
export const TURRET_GUN_Y = 3.55
const STATIONS: Array<{ id: StationId; name: string; x: number; z: number }> = [
  { id: "radio", name: "Funkstation · Einsatzplanung", x: 0, z: 14 },
  { id: "trader", name: "Händler", x: -8, z: 21 },
  { id: "stash", name: "Lager & Ausrüstung", x: 8, z: 21 },
  { id: "build", name: "Bauplan", x: -19, z: 21 },
  { id: "workbench", name: "Werkbank", x: 19, z: 21 },
  { id: "clinic", name: "Feldlazarett", x: -29, z: 22 },
  { id: "lab", name: "Forschungslabor", x: 29, z: 22 },
  { id: "armory", name: "Waffenwerkstatt", x: 24, z: 29 },
  { id: "gate", name: "Zur Sperrzone", x: 0, z: 34 },
]

function buildBase(): BaseMap {
  const m = new Draft()
  // ground: compound gravel, courtyard pavement, outside road and verges
  m.area(-60, -60, 60, 95, "grass", "grass")
  m.area(-HALF, -HALF, HALF, HALF, "gravel", "gravel")
  m.area(-34, 12, 34, 34, "concrete", "pavement")
  m.area(-4, 12, 4, 95, "asphalt", "asphalt")
  m.area(-40, 44, 40, 75, "dirt", "dirt")
  m.area(-5, 36, 5, 95, "asphalt", "asphalt")
  m.dashed(0, 40, 0, 74, 0.15, 3, 3)
  for (const p of PLOTS) m.area(p.x - p.w / 2 - 0.5, p.z - p.d / 2 - 0.5, p.x + p.w / 2 + 0.5, p.z + p.d / 2 + 0.5, "gravel", "pad")

  // station furniture (static; the interaction point stays 1.4+ m in front, on the +Z side)
  m.rect(-10, 18.6, -6, 19.4, 1.0, "counter"); m.prop("stall", -8, 18.4, { w: 4.4, d: 2.4, tint: 0x8a3a2a })
  for (let i = 0; i < 5; i++) m.rect(5.6 + i * 0.95, 18.6, 6.4 + i * 0.95, 19.1, 1.9, "cabinet", { v: i % 3 })
  m.rect(-1.4, 11.4, 1.4, 12.4, 0.8, "desk", { v: 1 }); m.rect(-1.2, 11.5, -0.2, 12.2, 0.5, "machine", { y: 0.8, tint: 0x3a4a3a, v: 6 }); m.prop("antenna", 2.2, 11, { h: 10 })
  m.rect(-21, 18.8, -17, 19.8, 0.85, "desk", { v: 3 })
  m.rect(17, 18.8, 21, 19.6, 0.9, "desk", { v: 2 }); m.rect(20.4, 18.8, 21.2, 19.6, 1.6, "rack")
  m.rect(-31.5, 18, -26.5, 20.6, 2.6, "proxy-tent"); m.prop("tent", -29, 19.3, { w: 5, d: 2.6, h: 2.6, tint: 0xd8dcd8, v: 1 }); m.prop("sticker", -29, 20.64, { y: 1.3, w: 0.7, h: 0.7, face: "s", text: "medic" })
  m.rect(26, 18, 32, 20.44, 2.6, "container", { tint: 0xd8dcd8, v: 9 }); m.prop("decal", 29, 20.46, { y: 1.6, w: 3.6, h: 0.5, face: "s", v: 1, text: "LABOR" })
  m.rect(22.6, 26.4, 25.4, 27, 2, "rack"); m.prop("gunrack", 24, 27.2, { w: 2.4 })
  m.prop("decal", 0, 36.4, { y: 3.4, w: 6, h: 0.8, face: "s", v: 2, text: "STÜTZPUNKT EISENSCHLEIER" })
  m.prop("flag", 4.6, 33, { h: 8, tint: 0x2d557f })
  // a few lamp posts in the yard (the base has power)
  for (const [x, z, r] of [[-14, 16, 0], [14, 16, 0], [-14, -16, Math.PI], [14, -16, Math.PI], [0, -14, Math.PI]] as const) m.prop("streetlamp", x, z, { h: 6, rot: r })
  // outside: approach road with wrecks and barricades
  m.car(-14, 52, "z", 0x5a4636, 9); m.car(16, 60, "x", 0x6a4a3a, 9)
  m.rect(-12, 44, -8, 44.6, 1.05, "jersey"); m.rect(8, 46, 12, 46.6, 1.05, "jersey")
  m.prop("stain", -6, 58, { w: 3, d: 2, v: 1 }); m.prop("stain", 10, 66, { w: 2.5, d: 2, v: 1 })
  m.rect(-26, 70, -19, 71.2, 1.5, "barricade"); m.rect(19, 64, 26, 65.2, 1.5, "barricade")
  m.prop("wireroll", -38, 41, { x2: -10, z2: 41 }); m.prop("wireroll", 10, 41, { x2: 38, z2: 41 })
  // yard clutter: crates, pallets, fuel drums, a jeep, sandbag nests by the gate, camo net, fire barrel
  m.rect(-33, 30, -31.8, 31.2, 1.2, "crate"); m.rect(-33, 31.4, -31.8, 32.6, 1.2, "crate"); m.rect(-31.6, 30, -30.4, 31.2, 2.4, "crate")
  m.rect(30.4, 31, 32.8, 32.2, 1.1, "pallets"); m.rect(31, 33, 33.4, 34.2, 1.15, "pallets")
  m.prop("barrels", 33.6, -1, { w: 1.2, d: 2.1, tint: 0x4a5536 }); m.rect(33, -2.05, 34.2, 0.05, 0.95, "proxy-barrels")
  m.prop("barrels", -33.5, -18, { w: 1.4, d: 1.4, tint: 0x6a2e24 }); m.rect(-34.2, -18.7, -32.8, -17.3, 0.95, "proxy-barrels")
  m.rect(-7.5, 31.4, -5, 32.4, 1.1, "sandbag"); m.rect(5, 31.4, 7.5, 32.4, 1.1, "sandbag")
  m.prop("campfire", 3, 27, {})
  m.prop("cable", -20, -14, { x2: 20, z2: -14 }); m.prop("cable", 33, 5, { x2: 33, z2: 1 })

  return {
    kind: "base", bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 75 }, solids: m.solids, spawn: { x: 0, z: 28, yaw: 0 }, plots: PLOTS,
    stations: STATIONS, attackSpawns: [{ x: -30, z: 68 }, { x: 30, z: 68 }, { x: 0, z: 72 }], gate: { x: 0, z: 38 },
    areas: m.areas, props: m.props, lights: m.lights, doorways: m.doorways, buildings: m.buildings,
    ground: { surface: "grass", look: "grass" }, wallRect: { x0: -HALF - 1, z0: -HALF - 1, x1: HALF + 1, z1: HALF + 1 },
    trees: surroundings(),
  }
}

/** Woods and hedges around the compound, kept off the approach road and the walls. */
function surroundings(): TreeSpot[] {
  let s = 7
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const out: TreeSpot[] = []
  for (let i = 0; i < 900 && out.length < 260; i++) {
    const a = R() * Math.PI * 2, d = 58 + R() * 120, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.9 + 15
    if (Math.abs(x) < 9 && z > 30) continue
    if (out.some(t => Math.abs(t.x - x) < 3.5 && Math.abs(t.z - z) < 3.5)) continue
    const k = R()
    out.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, h: k < 0.3 ? 1.2 + R() : 8 + R() * 8, v: k < 0.3 ? 3 : k < 0.75 ? 0 : 1, r: R() * 6.28 })
  }
  return out
}

/** Solids and props of one plot at a structure level (clamped to the structure's max). */
export function structureModel(plot: BasePlot, level: number): DraftData {
  const m = new Draft(), id = plot.structure, lvl = Math.max(0, Math.min(STRUCTURES[id].max, level))
  const x0 = plot.x - plot.w / 2, x1 = plot.x + plot.w / 2, z0 = plot.z - plot.d / 2, z1 = plot.z + plot.d / 2
  const sign = (y: number, z: number) => m.prop("decal", plot.x, z + 0.04, { y, w: Math.min(plot.w - 1, 3.4), h: 0.55, face: "s", v: 4, text: STRUCTURES[id].short })
  if (id === "walls") {
    // the plot shows the building material for the next stage
    if (lvl === 0) stakes(m, plot)
    else { m.rect(x0 + 0.5, z0 + 0.5, x0 + 2.5, z1 - 0.5, 1.1, lvl === 1 ? "logs" : lvl === 2 ? "concrete" : "cladding", { tint: 0x8a8e92 }); m.rect(x1 - 2.5, z0 + 0.5, x1 - 0.5, z0 + 2, 1.2, "pallets") }
    return m.data()
  }
  if (id === "tower") { towerModel(m, plot.x, plot.z, lvl); if (lvl >= 2) towerModel(m, SECOND_TOWER.x, SECOND_TOWER.z, lvl); if (lvl === 0) stakes(m, plot); return m.data() }
  if (id === "turrets") { if (lvl === 0) stakes(m, plot); else { turretModel(m, TURRET_SPOTS[0].x, TURRET_SPOTS[0].z, lvl); if (lvl >= 2) turretModel(m, TURRET_SPOTS[1].x, TURRET_SPOTS[1].z, lvl) } return m.data() }
  if (id === "scrapyard" && lvl > 0) {
    // scrap heaps left and right; a crushed wreck and a forklift from level 2; a sorting shed replaces the left heap at 3
    if (lvl >= 3) { m.rect(x0 + 0.3, z0 + 0.3, x0 + 3.6, z1 - 1.6, 3.0, "block", { tint: 0x8d8a82 }); m.rect(x0 + 0.2, z0 + 0.2, x0 + 3.7, z1 - 1.5, 0.3, "roof", { y: 3.0 }) }
    else { m.rect(x0 + 0.5, z0 + 0.5, x0 + 3.5, z0 + 3.5, 1.5, "proxy-heap"); m.prop("scrap", x0 + 2, z0 + 2, { w: 3.4, d: 3.4, h: 1.6 }) }
    m.rect(x1 - 3.5, z0 + 0.5, x1 - 0.5, z0 + 3.5, 1.7, "proxy-heap"); m.prop("scrap", x1 - 2, z0 + 2, { w: 3.4, d: 3.4, h: 1.8 })
    m.prop("tyres", x0 + 4.3, z1 - 1.4, {})
    if (lvl >= 2) { m.car(plot.x + 0.3, z0 + 1.5, "x", 0x6a4a3a, 9); m.rect(x1 - 3.2, z1 - 1.9, x1 - 0.6, z1 - 0.7, 1.6, "machine", { tint: 0xc89a2a, v: 2 }) }
    else m.rect(plot.x - 1, z0 + 0.8, plot.x + 1.2, z0 + 2, 1.15, "pallets")
    sign(1.6, z1 - 0.2)
    return m.data()
  }
  if (id === "garage" && lvl > 0) {
    // the jeep under a camouflage tarp; a workshop container from level 2; a second vehicle in front at 3
    m.car(plot.x + 1, z0 + 1.5, "x", 0x4d5536, 5)
    m.prop("tarp", plot.x + 1, z0 + 1.5, { w: 5.6, d: 3.2, h: 2.5, tint: 0x4d5536, rot: Math.PI })
    m.prop("barrels", x1 - 1.2, z0 + 0.9, { w: 0.9, d: 0.9, tint: 0x6a2e24 }); m.rect(x1 - 1.65, z0 + 0.45, x1 - 0.75, z0 + 1.35, 0.95, "proxy-barrels")
    if (lvl >= 2) m.rect(x0 + 0.4, z0 + 0.4, x0 + 3, z1 - 1.8, 2.6, "container", { tint: 0x59603f, v: 9 })
    else m.prop("tyres", x0 + 1.4, z0 + 1.2, {})
    if (lvl >= 3) m.car(plot.x + 1, z1 - 1.25, "x", 0x7c8186, 4)
    sign(1.6, z1 - 0.2)
    return m.data()
  }
  if (lvl === 0) { stakes(m, plot); return m.data() }
  if (lvl === 1) {
    // field tents
    const tw = plot.w - 2, td = Math.min(plot.d - 2.5, 6)
    m.rect(plot.x - tw / 2, z0 + 0.6, plot.x + tw / 2, z0 + 0.6 + td, 2.7, "tentbox", { tint: id === "clinic" ? 0xd8dcd8 : 0x5a6340 })
    m.rect(x1 - 1.8, z1 - 1.6, x1 - 0.6, z1 - 0.4, 1.2, "crate")
    if (id === "generator") m.rect(x0 + 0.8, z1 - 2.2, x0 + 3, z1 - 0.6, 1.3, "machine", { tint: 0x3f6c48, v: 2 })
    if (id === "radio") m.prop("antenna", x1 - 1, z0 + 1, { h: 8 })
    sign(1.6, z0 + 0.6 + td)
    return m.data()
  }
  if (lvl === 2) {
    // containers with an awning
    const len = plot.w >= 12 ? 12.2 : 6.1, cz = z0 + 1.6
    m.container(plot.x, cz, "x", Math.min(len, plot.w - 0.6), [id === "clinic" ? 0xd8dcd8 : id === "lab" ? 0x2d557f : 0x59603f])
    if (plot.d >= 10 && plot.w >= 12) m.container(plot.x, cz + 2.6, "x", 6.1, [0x7c8186])
    m.rect(x0 + 0.4, z1 - 1.4, x0 + 3.2, z1 - 0.8, 0.95, "sandbag")
    if (id === "generator") m.rect(x1 - 3, z1 - 2.4, x1 - 0.6, z1 - 0.6, 1.6, "machine", { tint: 0x3f6c48, v: 2 })
    if (id === "radio" || id === "hq") m.prop("antenna", x1 - 1, z0 + 0.6, { h: 12 })
    sign(1.4, cz + 1.22)
    return m.data()
  }
  // level 3: reinforced block building with sandbag front
  const bz1 = z1 - 2, bh = id === "hq" ? 4.2 : 3.4, bstyle = id === "hq" || id === "armory" ? "bunker" : "block"
  m.rect(x0 + 0.3, z0 + 0.3, x1 - 0.3, bz1, bh, bstyle, { tint: 0x8d8a82 })
  m.buildings.push({ id: `${id}-3`, name: STRUCTURES[id].name, x0: x0 + 0.3, z0: z0 + 0.3, x1: x1 - 0.3, z1: bz1, h: bh, style: "block", upper: 0, roof: "flat", solid: true, face: "s", doorLamps: false })
  m.rect(x0 + 0.2, z0 + 0.2, x1 - 0.2, bz1 + 0.1, 0.3, "roof", { y: id === "hq" ? 4.2 : 3.4 })
  m.rect(x0 + 0.5, bz1 + 0.4, plot.x - 1.2, bz1 + 1, 1.1, "sandbag"); m.rect(plot.x + 1.2, bz1 + 0.4, x1 - 0.5, bz1 + 1, 1.1, "sandbag")
  if (id === "radio" || id === "hq") m.prop("antenna", x1 - 1.2, z0 + 1.2, { y: 0, h: 16 })
  if (id === "kitchen") m.prop("chimney", x1 - 1.5, z0 + 1.5, { y: 3.4, h: 1.6 })
  if (id === "generator") m.rect(x0 + 0.6, bz1 + 0.1, x0 + 2.6, z1 - 0.2, 1.4, "proxy-tank")
  sign(id === "hq" ? 3.4 : 2.6, bz1)
  return m.data()
}

function stakes(m: Draft, p: BasePlot): void {
  const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) m.prop("post", x, z, { h: 0.9, r: 0.04 })
  m.prop("decal", p.x, z1 - 0.2, { w: Math.min(3, p.w - 1), h: 0.6, v: 21, text: STRUCTURES[p.structure].short })
}

/** Watchtower: legs block (thin), platform overhead at 4.2 m; level 3 adds sandbags and a searchlight. */
function towerModel(m: Draft, x: number, z: number, lvl: number): void {
  if (lvl <= 0) return
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) m.rect(x + dx - 0.18, z + dz - 0.18, x + dx + 0.18, z + dz + 0.18, 4.2, lvl >= 3 ? "pillar" : "logs")
  m.rect(x - 2.3, z - 2.3, x + 2.3, z + 2.3, 0.25, "roof", { y: 4.2, v: lvl >= 3 ? 1 : 3 })
  m.prop("watchtower", x, z, { v: lvl })
  if (lvl >= 3) {
    for (const [a, b, c, d] of [[-2.3, -2.3, 2.3, -1.9], [-2.3, 1.9, 2.3, 2.3], [-2.3, -1.9, -1.9, 1.9]]) m.rect(x + a, z + b, x + c, z + d, 0.9, "sandbag", { y: 4.45 })
    m.prop("searchlight", x, z + 1.6, { y: 5.6, rot: Math.PI, v: 0.9, r: 30 })
  }
}

/** Gun nest: a raised platform with sandbags on three sides and the automatic gun on top, facing the gate side (+Z). */
function turretModel(m: Draft, x: number, z: number, lvl: number): void {
  const h = 2.4
  m.rect(x - 1.3, z - 1.1, x + 1.3, z + 1.1, h, "towerbase")
  m.rect(x - 1.4, z + 0.85, x + 1.4, z + 1.35, 0.8, "sandbag", { y: h })
  for (const sx of [-1, 1]) m.rect(x + sx * 1.35 - 0.25, z - 0.9, x + sx * 1.35 + 0.25, z + 0.85, 0.8, "sandbag", { y: h })
  m.prop("turret", x, z, { y: h, v: lvl })
}

/** Perimeter at a walls level; the gate passage (x ±4 at z 36) always stays open. */
export function wallsModel(level: number): DraftData {
  const m = new Draft(), lvl = Math.max(0, Math.min(3, level)), g = GATE_W / 2
  const sides: Array<[number, number, number, number]> = [[-HALF, -HALF, HALF, -HALF], [-HALF, -HALF, -HALF, HALF], [HALF, -HALF, HALF, HALF], [-HALF, HALF, -g, HALF], [g, HALF, HALF, HALF]]
  if (lvl === 0) {
    // rusty chain-link with holes: infected (and players) slip through the gaps
    for (const [ax, az, bx, bz] of sides) {
      const alongX = az === bz, len = alongX ? bx - ax : bz - az, gaps: Array<[number, number]> = []
      for (let s = 9; s < len - 5; s += 17) gaps.push([(alongX ? ax : az) + s, 2.6])
      if (alongX) m.fence(ax, az, bx, bz, gaps); else m.fence(ax, az, bx, bz, gaps)
    }
    return m.data()
  }
  const style = lvl === 1 ? "palisade" : lvl === 2 ? "twall" : "steelwall", h = lvl === 1 ? 2.8 : lvl === 2 ? 3.4 : 3.6, t = lvl === 2 ? 0.7 : 0.45
  for (const [ax, az, bx, bz] of sides) {
    const alongX = az === bz
    if (lvl === 2) {
      // T-wall segments 1.2 m wide
      const a0 = alongX ? ax : az, a1 = alongX ? bx : bz
      for (let a = a0; a < a1 - 0.1; a += 1.2) { const e = Math.min(a1, a + 1.2); if (alongX) m.rect(a, az - t / 2, e - 0.04, az + t / 2, h, style); else m.rect(ax - t / 2, a, ax + t / 2, e - 0.04, h, style) }
    } else if (alongX) m.rect(ax, az - t / 2, bx, az + t / 2, h, style)
    else m.rect(ax - t / 2, az, ax + t / 2, bz, h, style)
  }
  for (const sx of [-g - 0.4, g + 0.4]) m.rect(sx - 0.4, HALF - 0.4, sx + 0.4, HALF + 0.4, h + 0.6, lvl === 1 ? "logs" : "pillar")
  if (lvl === 3) for (const s of [-1, 1]) m.rect(s * (g + 0.9) - 0.1, HALF + 0.5, s * (g + 0.9) + 0.1, HALF + 3.9, 3.2, "steelwall", { tint: 0x4a5056 })
  return m.data()
}

/** All structure ids in plot order (for tests). */
export const BASE_PLOT_ORDER: StructureId[] = PLOTS.map(p => p.structure)
