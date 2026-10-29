/**
 * world.ts — builds the 3D environment: the big quarantine zone or the player's base (contract in zone.ts).
 * CONTRACT (used by raid.ts, enemies.ts, zombies.ts):
 *  - createWorld(kind, scene, quality, opts) adds world.group to the scene and sets scene.background/fog + lights.
 *  - obstacles / collision: every blocking box (CollisionWorld index — use it for all queries); nav: NavGrid over
 *    layout.bounds (agent radius 0.45 m, 1 m cells); coverPoints: standing spots next to solids ≥ 1 m tall.
 *  - lightLevel 0..1 (viewmodel lighting), visionScale (enemy sight multiplier for the time of day), night flag.
 *  - surfaceAt / districtAt / indoor: per-position queries for footsteps, HUD area name, audio reverb.
 *  - update(dt, time, camera): sky follows the camera, chunk visibility, animated props, pooled lamp lights.
 *  - setExtraction(id, state, progress): evac zone visuals ("hidden" for exfils closed this raid).
 *  - setStructures(levels) (base only): rebuilds structure meshes and their obstacles on the plots (and the nav
 *    grid/collision in those areas).
 *  - dispose(): removes the group from the scene and frees every GPU resource it created (incl. shadow maps).
 *  - zoneLayout() / baseLayout(): the (cached, deterministic) layouts without building meshes — the UI reads
 *    insertions, extractions and districts from them for raid planning. Never mutated (worlds copy obstacles).
 * Rendering: layout data (zonemap.ts / basemap.ts) → props.ts + zoneprops.ts batches → chunks.ts: one texture array
 * and one "uber" material for all static surfaces, geometry split into 64 m chunks (opaque + cut-out per chunk) that
 * update() hides beyond the fog; trees instanced per chunk; landmarks (church, towers, cranes, stack, silos, ship)
 * in one far mesh with weaker fog. Night: moonlight, a few working lamps (most are dead), fires, emissive windows;
 * 4 (high) / 1 (low) real point lights are re-assigned to the working lamps nearest to the camera.
 */
import * as THREE from "three"
import { Obscurants } from "./obscurants"
import { Rain, WEATHER, nextLightning, type WeatherId } from "./weather"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { STRUCTURES, TIMES, type StructureId, type TimeOfDay } from "./baseData"
import { baseMap, structureModel, wallsModel, type BaseMap } from "./basemap"
import { ChunkSet, TextureLayers, keyInfo, uberDepthMaterial, uberMaterial, uberize, type KeyInfo } from "./chunks"
import { CollisionWorld, type Obstacle } from "./collision"
import { createExtractions } from "./extraction"
import { computeCoverPoints, type BuildingInfo, type Doorway, type MapProp, type MapSolid } from "./maps"
import { ConeBatch, GeoBatch, GlowBatch, PoolBatch, coneMaterial, raw, type FxUniforms } from "./meshkit"
import { NavGrid } from "./nav"
import { buildBuildingDetails, buildFences, buildProp, buildSolid, disposeTemplates, emitDecals, emitWindows, place, textKey, type BuildCtx, type InstKind, type PropLook } from "./props"
import { createSky, createWater, type SkySpec, type WaterSpec } from "./sky"
import { TEX, decalAtlas, mulberry, textDecal, textureCanvas, windowCanvases, type TexName } from "./textures"
import type { Surface, ThemeId } from "./types"
import type { AnyLayout, BaseLayout, District, WorldKind, WorldOptions, ZoneLayout } from "./zone"
import { zoneMap, zoneObstacles, type Rect, type ZoneMap } from "./zonemap"
import { buildZoneFence } from "./zoneprops"

export interface CoverPoint { x: number; z: number; height: number; nx: number; nz: number }
export type ExtractionState = "hidden" | "locked" | "ready" | "called" | "done"

export interface World {
  kind: WorldKind
  layout: AnyLayout
  time: TimeOfDay
  /** Legacy lighting preset (used by older enemy code). */
  theme: ThemeId
  group: THREE.Group
  obstacles: Obstacle[]
  /** Spatial index over obstacles — use this for all movement, ray and sight queries on large maps. */
  collision: CollisionWorld
  nav: NavGrid
  coverPoints: CoverPoint[]
  exposure: number
  lightLevel: number
  visionScale: number
  night: boolean
  /** Smoke clouds that block sight (smoke grenades); filled and updated by the raid. */
  obscurants: Obscurants
  /** Current weather and its multiplier on how far hostiles see (both set by setWeather). */
  weather: WeatherId
  weatherVision: number
  /** Changes light, fog, sky and rain; "clear" restores the time-of-day look. */
  setWeather(id: WeatherId): void
  /** Called on every lightning strike during a storm (distance in metres, for the thunder delay). */
  onLightning: ((distance: number) => void) | null
  /** True when rain falls on the camera right now (outdoors in rain or storm). */
  raining: boolean
  surfaceAt(x: number, z: number): Surface
  districtAt(x: number, z: number): District | null
  indoor(x: number, z: number): boolean
  update(dt: number, time: number, camera: THREE.Camera): void
  setExtraction(id: string, state: ExtractionState, progress: number): void
  setStructures(levels: Partial<Record<StructureId, number>>): void
  dispose(): void
}

/** The cached layouts (no meshes). */
export function zoneLayout(): ZoneLayout { return zoneMap() }
export function baseLayout(): BaseLayout { return baseMap() }

// ---------------------------------------------------------------------------------------------------------------
// Times of day
// ---------------------------------------------------------------------------------------------------------------
interface Look {
  sky: SkySpec
  fog: [number, number]; exposure: number; light: number
  sun: { color: number; intensity: number }
  hemi: { sky: number; ground: number; intensity: number }
  props: PropLook
  windowGlow: number
  /** Real point-light intensity of a working lamp. */
  lampI: number
  water: Omit<WaterSpec, "lamps">
  /** Ground/foliage tint (season/light). */
  foliage: number
}

const LOOKS: Record<TimeOfDay, Look> = {
  dawn: {
    sky: { zenith: 0x2a3550, mid: 0x7c7896, horizon: 0xdca07e, glow: 0xffb070, fog: 0xc98d72, sunDir: [0.86, 0.14, -0.3], sunColor: 0xffd8b0, sunSize: 0.026, sunVisible: 1, glowStrength: 0.9, moon: false, stars: 0.12, clouds: 0.45, cloudColor: 0x6a5a6e, cloudLit: 0xffa878 },
    fog: [40, 190], exposure: 1.1, light: 0.6,
    sun: { color: 0xffc7a0, intensity: 1.6 }, hemi: { sky: 0x9aa6c0, ground: 0x5a4a40, intensity: 1.2 },
    props: { night: 0.35, lamps: 0.45, lampColor: 0xffc27a, windowLit: 0.02, shafts: 0 }, windowGlow: 0.9, lampI: 12, foliage: 0xcfc6a0,
    water: { deep: 0x1c2430, skyLow: 0xc99a80, skyHigh: 0x4a5878, glow: 0xffa060, glowDir: [0.9, -0.3], lampColor: 0xffb060 },
  },
  day: {
    sky: { zenith: 0x3a6aa2, mid: 0x7aa2c8, horizon: 0xc6d4da, glow: 0xfff2d6, fog: 0xb9c8cf, sunDir: [-0.35, 0.86, 0.36], sunColor: 0xfffbe8, sunSize: 0.022, sunVisible: 1, glowStrength: 0.35, moon: false, stars: 0, clouds: 0.5, cloudColor: 0xd8dde2, cloudLit: 0xffffff },
    fog: [70, 260], exposure: 1.0, light: 1,
    sun: { color: 0xfff3e0, intensity: 2.6 }, hemi: { sky: 0xc6d8e6, ground: 0x6a6a52, intensity: 1.8 },
    props: { night: 0, lamps: 0, lampColor: 0xffc27a, windowLit: 0, shafts: 0 }, windowGlow: 0.6, lampI: 0, foliage: 0xe6e0b8,
    water: { deep: 0x22303c, skyLow: 0xa8bcc8, skyHigh: 0x4a78a8, glow: 0xfff0d0, glowDir: [-0.4, 0.4], lampColor: 0xffc890 },
  },
  dusk: {
    sky: { zenith: 0x2a3d6e, mid: 0x8c7aa6, horizon: 0xf0a77c, glow: 0xffb45e, fog: 0xc9958a, sunDir: [-0.86, 0.2, 0.47], sunColor: 0xfff2c8, sunSize: 0.028, sunVisible: 1, glowStrength: 1, moon: false, stars: 0, clouds: 0.55, cloudColor: 0x6e5c7c, cloudLit: 0xffa070 },
    fog: [50, 210], exposure: 1.05, light: 0.8,
    sun: { color: 0xffb27a, intensity: 2.8 }, hemi: { sky: 0x9aa8d6, ground: 0x6a5446, intensity: 1.5 },
    props: { night: 0.15, lamps: 0.75, lampColor: 0xffc27a, windowLit: 0.04, shafts: 0 }, windowGlow: 1.1, lampI: 16, foliage: 0xe6dca0,
    water: { deep: 0x1a2030, skyLow: 0xd09a84, skyHigh: 0x3a4a78, glow: 0xffa060, glowDir: [-0.9, 0.45], lampColor: 0xffa040 },
  },
  night: {
    sky: { zenith: 0x02050d, mid: 0x07122a, horizon: 0x101c32, glow: 0x24345a, fog: 0x0b1220, sunDir: [0.45, 0.55, -0.7], sunColor: 0xe8eeff, sunSize: 0.024, sunVisible: 0, glowStrength: 0.6, moon: true, stars: 1, clouds: 0.28, cloudColor: 0x0b1324, cloudLit: 0x36486e },
    fog: [16, 90], exposure: 1.25, light: 0.22,
    sun: { color: 0x8fa6d6, intensity: 0.45 }, hemi: { sky: 0x34486a, ground: 0x12141a, intensity: 0.55 },
    props: { night: 1, lamps: 1, lampColor: 0xffc890, windowLit: 0.05, shafts: 1 }, windowGlow: 1.4, lampI: 22, foliage: 0x7a8668,
    water: { deep: 0x05080e, skyLow: 0x101c32, skyHigh: 0x07122a, glow: 0x24345a, glowDir: [0.45, -0.7], lampColor: 0xffa040 },
  },
}

/** Share of lamps per district that still work (generators); the rest of the zone is dark. */
const POWER: Record<string, number> = { military: 0.55, lab: 0.45, harbor: 0.14, industry: 0.12, quarry: 0.1, station: 0.08, town: 0.05, farm: 0.05, forest: 0 }
const SURFACES: Surface[] = ["asphalt", "concrete", "metal", "gravel", "dirt", "wood", "grass"]
const GLOBAL_KEYS = new Set(["decal", "window", "lamp"])
const CHUNK = 64

interface Env {
  high: boolean
  layers: TextureLayers
  mats: Record<"opaque" | "cut" | "far" | "farcut", THREE.MeshStandardMaterial> & { depth: THREE.MeshDepthMaterial }
  fx: FxUniforms
  decalMat: THREE.Material | null
  atlasRects: Map<string, { u0: number; v0: number; u1: number; v1: number }> | null
  windowMat: THREE.Material
  lampMat: THREE.Material
  own<T extends { dispose(): void }>(d: T): T
}

/** Collects batched geometry for a set of solids/props (the static world, or one base structure). */
class Builder {
  near = new Map<string, GeoBatch>(); far = new Map<string, GeoBatch>(); farMode = false
  glow = new GlowBatch(); pool = new PoolBatch(); cone = new ConeBatch()
  private tpl = new Map<InstKind, THREE.BufferGeometry>()
  ctx: BuildCtx
  constructor(data: { props: readonly MapProp[]; buildings: readonly BuildingInfo[]; doorways: readonly Doorway[] }, look: PropLook, high: boolean, seed: number, lit: (x: number, z: number) => number) {
    this.ctx = {
      data, look, high, rng: mulberry(seed), lit, lampSpots: [],
      B: key => { const m = this.farMode && !GLOBAL_KEYS.has(key) ? this.far : this.near; let b = m.get(key); if (!b) { b = new GeoBatch(); m.set(key, b) } return b },
      glow: this.glow, pool: this.pool, cone: this.cone,
      // small repeated props are merged into the chunk geometry (culled with their chunk, no extra draw calls)
      inst: (kind, x, y, z, ry, s, color, rx = 0) => {
        if (kind === "post" || kind === "chainpost") {
          const r = kind === "post" ? 0.035 : 0.05
          this.ctx.B("metal").box(x - r * s[0], y, z - r * s[2], x + r * s[0], y + s[1], z + r * s[2], { color, ao: 0, skip: 8 | 4, local: true })
          return
        }
        let g = this.tpl.get(kind); if (!g) { g = INST_GEO[kind](high); this.tpl.set(kind, g) }
        place(this.ctx.B(kind === "sandbag" ? "burlap" : "metal"), g, x, y, z, rx, ry, 0, s[0], s[1], s[2], color)
      },
      decals: [], texts: new Map(), windows: [], lines: [], searchlights: [], radars: [], weeds: [],
    }
  }
  solids(list: readonly MapSolid[]): void { for (const s of list) { this.farMode = !!s.far; buildSolid(this.ctx, s) } this.farMode = false }
  props(list: readonly MapProp[]): void { for (const p of list) { this.farMode = !!p.far; buildProp(this.ctx, p) } this.farMode = false }
  details(): void { buildFences(this.ctx); buildBuildingDetails(this.ctx) }
  disposeTemplates(): void { for (const g of this.tpl.values()) g.dispose(); this.tpl.clear() }

  /** Turns the batches into meshes: chunked opaque/cut-out, far landmark meshes and the global effect meshes. */
  meshes(env: Env, chunkSize: number): { chunks: Array<{ cx: number; cz: number; mesh: THREE.Mesh }>; globals: THREE.Object3D[] } {
    const set = new ChunkSet(chunkSize), farSet = new ChunkSet(Infinity)
    const add = (s: ChunkSet, key: string, b: GeoBatch) => {
      const info: KeyInfo = keyInfo(key), tex = info.tex as TexName
      s.addBatch(b, env.layers.layer(tex), info, 1 / TEX[tex][0], 1 / TEX[tex][1])
    }
    for (const [key, b] of this.near) if (!GLOBAL_KEYS.has(key)) add(set, key, b)
    for (const [key, b] of this.far) add(farSet, key, b)
    const chunks: Array<{ cx: number; cz: number; mesh: THREE.Mesh }> = []
    for (const c of set.build()) {
      const mesh = new THREE.Mesh(env.own(c.geometry), c.cut ? env.mats.cut : env.mats.opaque)
      if (c.cut) mesh.customDepthMaterial = env.mats.depth
      mesh.castShadow = env.high && !c.cut; mesh.receiveShadow = env.high
      chunks.push({ cx: c.cx, cz: c.cz, mesh })
    }
    const globals: THREE.Object3D[] = []
    for (const c of farSet.build()) {
      const mesh = new THREE.Mesh(env.own(c.geometry), c.cut ? env.mats.farcut : env.mats.far)
      mesh.castShadow = env.high && !c.cut; mesh.receiveShadow = env.high; mesh.name = "Landmarken"
      globals.push(mesh)
    }
    // decals, windows, lamps
    if (env.atlasRects) emitDecals(this.ctx, env.atlasRects)
    emitWindows(this.ctx)
    for (const key of GLOBAL_KEYS) {
      const g = this.near.get(key)?.build(); if (!g) continue
      env.own(g)
      const mat = key === "decal" ? env.decalMat : key === "window" ? env.windowMat : env.lampMat
      if (!mat) continue
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = env.high && key !== "lamp"
      if (key === "decal") mesh.renderOrder = 1
      globals.push(mesh)
    }
    this.disposeTemplates()
    if (this.ctx.lines.length) {
      const g = env.own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(this.ctx.lines, 3))
      globals.push(new THREE.LineSegments(g, env.own(new THREE.LineBasicMaterial({ color: 0x15171a }))))
    }
    for (const m of [this.glow.build(env.fx), this.pool.build(env.fx), env.high ? this.cone.build(env.fx) : null]) if (m) { env.own(m.geometry); env.own(m.material as THREE.Material); globals.push(m) }
    return { chunks, globals }
  }
}

const INST_GEO: Record<InstKind, (high: boolean) => THREE.BufferGeometry> = {
  // 200 l steel drum: rolled chimes at both ends, two rolling hoops, recessed lid with two bungs
  barrel: high => {
    const prof: [number, number][] = [[0, 0.425], [0.27, 0.425], [0.285, 0.44], [0.3, 0.452], [0.306, 0.44], [0.3, 0.42], [0.297, 0.25], [0.31, 0.235], [0.31, 0.205], [0.297, 0.19],
      [0.297, -0.19], [0.31, -0.205], [0.31, -0.235], [0.297, -0.25], [0.3, -0.42], [0.306, -0.44], [0.3, -0.452], [0, -0.452]]
    const body = new THREE.LatheGeometry(prof.reverse().map(([r, y]) => new THREE.Vector2(r, y)), high ? 16 : 9); scaleUv(body, 1.9, 0.9)
    const parts: THREE.BufferGeometry[] = [body]
    if (high) for (const [x, r] of [[0.17, 0.035], [-0.19, 0.022]] as const) parts.push(new THREE.CylinderGeometry(r, r, 0.02, 8).translate(x, 0.43, 0.04))
    const g = mergeGeometries(parts.map(x => x.index ? x.toNonIndexed() : x), false)!; return g
  },
  sandbag: () => pillow(),
  post: () => new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0),
  bollard: () => new THREE.CylinderGeometry(0.22, 0.28, 0.55, 10).translate(0, 0.275, 0),
  chainpost: () => new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0),
}

// ---------------------------------------------------------------------------------------------------------------
// createWorld
// ---------------------------------------------------------------------------------------------------------------
export function createWorld(kind: WorldKind, scene: THREE.Scene, quality: "high" | "low", opts: WorldOptions = {}): World {
  const time: TimeOfDay = kind === "base" ? "dusk" : opts.time ?? "dusk"
  const look = LOOKS[time]
  const high = quality === "high"
  const map: ZoneMap | BaseMap = kind === "zone" ? zoneMap() : baseMap()
  const layout = map as AnyLayout
  const group = new THREE.Group(); group.name = kind === "zone" ? "Sperrzone" : "Basis"
  const disposables: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d }
  const fx: FxUniforms = { time: { value: 0 }, fogNear: { value: look.fog[0] }, fogFar: { value: look.fog[1] } }
  scene.background = new THREE.Color(look.sky.fog)
  scene.fog = new THREE.Fog(look.sky.fog, look.fog[0], look.fog[1])

  // --- collision, navigation, cover (per-world copies; the layout itself is never touched) ---------------------
  const obstacles = zoneObstacles(map)
  const collision = new CollisionWorld(obstacles)
  const nav = new NavGrid(layout.bounds, obstacles, 0.45, 1)
  const coverPoints: CoverPoint[] = computeCoverPoints(map, nav)
  const districts = map.kind === "zone" ? map.districts : []
  const districtAt = (x: number, z: number): District | null => { for (const d of districts) if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d; return null }
  const lit = kind === "base" ? () => 1 : (x: number, z: number) => {
    const p = POWER[districtAt(x, z)?.id ?? ""] ?? 0
    const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
    return h - Math.floor(h) < p ? 1 : 0
  }

  // --- materials -----------------------------------------------------------------------------------------------
  const layers = new TextureLayers(), layerU = { value: null as THREE.Texture | null }
  const env: Env = {
    high, layers, fx, own, decalMat: null, atlasRects: null,
    mats: { opaque: own(uberMaterial(layerU, "opaque", high)), cut: own(uberMaterial(layerU, "cut", high)), far: own(uberMaterial(layerU, "far", high)), farcut: own(uberMaterial(layerU, "farcut", high)), depth: own(uberDepthMaterial(layerU)) },
    windowMat: (() => {
      const w = windowCanvases(high ? 128 : 64)
      const map = own(new THREE.CanvasTexture(w.map)), em = own(new THREE.CanvasTexture(w.emissive))
      map.colorSpace = em.colorSpace = THREE.SRGBColorSpace
      return own(new THREE.MeshStandardMaterial({ vertexColors: true, map, emissiveMap: em, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: look.windowGlow, roughness: 0.25, metalness: 0.1 }))
    })(),
    lampMat: own(new THREE.MeshBasicMaterial({ vertexColors: true })),
  }

  // --- static geometry ----------------------------------------------------------------------------------------
  const seed = kind === "zone" ? 0x2026 : 0x0ba5e
  const B = new Builder(map, look.props, high, seed, lit)
  const ctx = B.ctx
  const ground = buildGround(ctx, map, look, high)
  B.solids(map.solids)
  B.props(map.props)
  B.details()
  if (map.kind === "zone") buildZoneFence(ctx, map.bounds, map.gates, ["n", "e", "w"])
  scatterWeeds(ctx, ground, map, look, high)
  for (const l of map.lights) if (lit(l.x, l.z) > 0) ctx.lampSpots.push([l.x, l.y, l.z, l.color])

  // decal atlas (incl. every text a base structure can show)
  if (map.kind === "base") for (const p of map.plots) for (let lvl = 0; lvl <= STRUCTURES[p.structure].max; lvl++) for (const q of structureModel(p, lvl).props) if (q.kind === "decal") textKey(ctx, q.v ?? 0, q.text ?? "")
  const atlasExtra = new Map<string, ReturnType<typeof textDecal>>()
  for (const [k, [kd, text]] of ctx.texts) atlasExtra.set(k, textDecal(kd, text))
  const atlas = decalAtlas(atlasExtra, high ? 64 : 48)
  const atlasTex = own(new THREE.CanvasTexture(atlas.canvas)); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = high ? 8 : 2
  env.atlasRects = atlas.rects
  env.decalMat = own(new THREE.MeshStandardMaterial({ map: atlasTex, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))

  const built = B.meshes(env, CHUNK)
  const lampSpots = ctx.lampSpots
  // chunk records for distance culling
  interface ChunkRec { minX: number; maxX: number; minZ: number; maxZ: number; objects: THREE.Object3D[]; lods: Array<{ mesh: THREE.Mesh; hi: THREE.BufferGeometry; lo: THREE.BufferGeometry }> }
  const chunkMap = new Map<number, ChunkRec>()
  const rec = (cx: number, cz: number): ChunkRec => {
    const k = (cx + 512) * 1024 + cz + 512
    let r = chunkMap.get(k); if (!r) { r = { minX: cx * CHUNK, maxX: (cx + 1) * CHUNK, minZ: cz * CHUNK, maxZ: (cz + 1) * CHUNK, objects: [], lods: [] }; chunkMap.set(k, r) }
    return r
  }
  for (const c of built.chunks) {
    const r = rec(c.cx, c.cz), bb = c.mesh.geometry.boundingBox!
    r.minX = Math.min(r.minX, bb.min.x); r.maxX = Math.max(r.maxX, bb.max.x); r.minZ = Math.min(r.minZ, bb.min.z); r.maxZ = Math.max(r.maxZ, bb.max.z)
    r.objects.push(c.mesh); group.add(c.mesh)
  }
  for (const o of built.globals) group.add(o)
  // trees: instanced per chunk and kind
  if (map.trees.length) {
    const tpl = treeTemplates(env, look)
    const byChunk = new Map<number, Array<typeof map.trees[number]>>()
    for (const t of map.trees) { const k = (Math.floor(t.x / CHUNK) + 512) * 1024 + Math.floor(t.z / CHUNK) + 512; let l = byChunk.get(k); if (!l) { l = []; byChunk.set(k, l) } l.push(t) }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), rng = mulberry(77)
    for (const [k, list] of byChunk) {
      const cx = Math.floor(k / 1024) - 512, cz = (k % 1024) - 512, r = rec(cx, cz)
      for (const v of [0, 1, 2, 3] as const) {
        const sub = list.filter(t => t.v === v); if (!sub.length) continue
        const mesh = new THREE.InstancedMesh(tpl.hi[v], [env.mats.opaque, env.mats.cut], sub.length)
        mesh.customDepthMaterial = env.mats.depth
        sub.forEach((t, i) => {
          const w = 0.85 + rng() * 0.3
          mesh.setMatrixAt(i, m4.compose(p.set(t.x, 0, t.z), q.setFromAxisAngle(UP, t.r), s.set(t.h * w, t.h, t.h * w)))
          mesh.setColorAt(i, c.setRGB(0.8 + rng() * 0.3, 0.82 + rng() * 0.3, 0.8 + rng() * 0.25))
          r.minX = Math.min(r.minX, t.x - t.h * 0.35); r.maxX = Math.max(r.maxX, t.x + t.h * 0.35); r.minZ = Math.min(r.minZ, t.z - t.h * 0.35); r.maxZ = Math.max(r.maxZ, t.z + t.h * 0.35)
        })
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere()
        mesh.castShadow = high; mesh.receiveShadow = high
        own({ dispose: () => mesh.dispose() })
        r.objects.push(mesh); r.lods.push({ mesh, hi: tpl.hi[v], lo: tpl.lo[v] }); group.add(mesh)
      }
    }
  }
  const chunkList = [...chunkMap.values()]

  // searchlights and radar dishes (authored military compound)
  for (const m of buildSearchlights(look.props.lamps > 0 ? ctx.searchlights : [], fx, own, look.props.lamps)) group.add(m)
  const radars: THREE.Object3D[] = []
  for (const [x, y, z] of ctx.radars) {
    const dish = new THREE.Group(); dish.position.set(x, y + 1.2, z)
    const geo = own(new THREE.SphereGeometry(3.6, high ? 20 : 12, 8, 0, Math.PI * 2, 0, 0.62)); geo.scale(1, 0.5, 1); geo.rotateX(Math.PI / 2); geo.translate(0, 2.3, 0)
    const dm = own(new THREE.MeshStandardMaterial({ color: 0xd8dcdc, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }))
    const d = new THREE.Mesh(geo, dm); d.castShadow = high; dish.add(d)
    const yoke = own(new THREE.BoxGeometry(0.5, 2.4, 0.5)); const ym = new THREE.Mesh(yoke, dm); ym.position.set(0, 1.2, -0.6); dish.add(ym)
    group.add(dish); radars.push(dish)
  }

  // --- sky, outer terrain, water -----------------------------------------------------------------------------
  const sky = createSky(look.sky, fx.time); own(sky.geometry); own(sky.material as THREE.Material); group.add(sky)
  const terrain = outerTerrain(env, map, look)
  group.add(terrain)
  if (map.kind === "zone") {
    const near = lampSpots.filter(l => l[0] > 20 && l[0] < 140 && l[2] > 180).slice(0, 6).map(l => [l[0], l[1], l[2]] as [number, number, number])
    const w = createWater({ ...look.water, lamps: near }, map.water.level, fx.time, quality)
    own(w.geometry); own(w.material as THREE.Material); group.add(w)
  }

  // --- lights ------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity); group.add(hemi)
  const sunDir = new THREE.Vector3(...look.sky.sunDir).normalize()
  if (sunDir.y < 0.25) sunDir.y = 0.25
  sunDir.normalize()
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity)
  const half = 48, mapSize = 2048
  sun.castShadow = high
  sun.shadow.mapSize.set(mapSize, mapSize)
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 460 })
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05
  sun.position.copy(sunDir).multiplyScalar(220); group.add(sun, sun.target)
  const pooled: THREE.PointLight[] = []
  for (let i = 0; i < (high ? 4 : 1); i++) { const l = new THREE.PointLight(0xffc890, 0, 22, 2); l.position.set(0, -50, 0); pooled.push(l); group.add(l) }

  // --- extraction zones ------------------------------------------------------------------------------------------
  const padTex = own(new THREE.CanvasTexture(textureCanvas("padmark", 256))); padTex.colorSpace = THREE.SRGBColorSpace
  const smokeTex = own(new THREE.CanvasTexture(textureCanvas("smoke", 128)))
  const evac = createExtractions(map.kind === "zone" ? map.extractions : [], layout.bounds, fx, padTex, smokeTex, look.props.night, quality)
  group.add(evac.group)

  // texture array last: every layer is known now
  layerU.value = own(layers.build(high ? 512 : 256, high ? 8 : 2))
  disposeTemplates()

  // --- base structures --------------------------------------------------------------------------------------------
  const structures = new Map<StructureId, { level: number; group: THREE.Group; obstacles: Obstacle[]; disposables: Array<{ dispose(): void }> }>()
  const structureGroup = new THREE.Group(); structureGroup.name = "Bauten"; group.add(structureGroup)
  const setStructures = (levels: Partial<Record<StructureId, number>>) => {
    if (map.kind !== "base") return
    for (const plot of map.plots) {
      const lvl = Math.max(0, Math.min(STRUCTURES[plot.structure].max, levels[plot.structure] ?? 0))
      const cur = structures.get(plot.structure)
      if (cur && cur.level === lvl) continue
      let minX = plot.x - plot.w / 2, maxX = plot.x + plot.w / 2, minZ = plot.z - plot.d / 2, maxZ = plot.z + plot.d / 2
      const grow = (o: { minX: number; maxX: number; minZ: number; maxZ: number }) => { minX = Math.min(minX, o.minX); maxX = Math.max(maxX, o.maxX); minZ = Math.min(minZ, o.minZ); maxZ = Math.max(maxZ, o.maxZ) }
      if (cur) {
        for (const o of cur.obstacles) { collision.remove(o); const i = obstacles.indexOf(o); if (i >= 0) obstacles.splice(i, 1); grow(o) }
        structureGroup.remove(cur.group); for (const d of cur.disposables) d.dispose()
      }
      const data = structureModel(plot, lvl)
      if (plot.structure === "walls") { const w = wallsModel(lvl); data.solids.push(...w.solids); data.props.push(...w.props); grow({ minX: map.wallRect.x0, maxX: map.wallRect.x1, minZ: map.wallRect.z0, maxZ: map.wallRect.z1 }) }
      const own2: Array<{ dispose(): void }> = []
      const sub: Env = { ...env, own: <T extends { dispose(): void }>(d: T): T => { own2.push(d); return d } }
      const sb = new Builder({ props: data.props, buildings: data.buildings, doorways: [] }, look.props, high, 7 + lvl, lit)
      sb.solids(data.solids); sb.props(data.props); sb.details()
      const res = sb.meshes(sub, Infinity)
      const g = new THREE.Group(); g.name = STRUCTURES[plot.structure].name
      for (const c of res.chunks) g.add(c.mesh)
      for (const o of res.globals) g.add(o)
      for (const m of buildSearchlights(look.props.lamps > 0 ? sb.ctx.searchlights : [], fx, sub.own, look.props.lamps)) g.add(m)
      structureGroup.add(g)
      const obs = zoneObstacles({ solids: data.solids, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } }).slice(0, data.solids.length)
      for (const o of obs) { collision.add(o); obstacles.push(o); grow(o) }
      nav.rebuildRegion(minX, minZ, maxX, maxZ, collision.query(minX - 2, minZ - 2, maxX + 2, maxZ + 2, []))
      structures.set(plot.structure, { level: lvl, group: g, obstacles: obs, disposables: own2 })
      for (const l of sb.ctx.lampSpots) lampSpots.push(l)
    }
    disposeTemplates()
  }

  scene.add(group)

  // --- per-frame update (allocation-free) -------------------------------------------------------------------
  const lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
  const lu = new THREE.Vector3().crossVectors(sunDir, lr).normalize()
  const texel = (2 * half) / mapSize
  const fwd = new THREE.Vector3(), center = new THREE.Vector3()
  const best: number[] = [], bestD: number[] = []
  let lightClock = 0, lastLX = Infinity, lastLZ = Infinity

  // --- weather: everything it changes is kept so "clear" restores the time-of-day look exactly ------------
  const rain = new Rain(high ? 4200 : 1800, time === "night" ? 0x6f7a86 : 0xb8c2cc)
  own(rain); group.add(rain.mesh)
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms
  const baseLook = {
    hemi: hemi.intensity, sun: sun.intensity, fogColor: new THREE.Color(look.sky.fog),
    zenith: skyU.zenith.value.clone(), mid: skyU.mid.value.clone(), horizon: skyU.horizon.value.clone(), skyFog: skyU.fogColor.value.clone(),
    clouds: skyU.clouds.value as number, sunVisible: skyU.sunVisible.value as number, glow: skyU.glowStrength.value as number,
  }
  const greyHex = time === "night" ? 0x1b1e23 : time === "dusk" || time === "dawn" ? 0x5d6066 : 0x8e9397
  const gl = raw(greyHex), greyLin = new THREE.Vector3(gl.r, gl.g, gl.b), greyFog = new THREE.Color(greyHex)
  let wLight = 1, bolt = 0, boltNext = 12, boltRng = mulberry(4711)
  const applyLight = () => {
    const flash = bolt > 0 ? (bolt > 0.12 ? 1 : 0.35) * 3.2 : 0
    hemi.intensity = baseLook.hemi * wLight + flash
    sun.intensity = baseLook.sun * wLight * (world.weather === "clear" ? 1 : world.weather === "fog" ? 0.45 : 0.3)
  }

  const world: World = {
    weather: "clear", weatherVision: 1, onLightning: null, raining: false,
    setWeather(id) {
      const w = WEATHER[id], k = w.overcast
      world.weather = id; world.weatherVision = w.vision; wLight = w.light; bolt = 0; boltRng = mulberry(4711); boltNext = 9
      applyLight()
      const fog = scene.fog as THREE.Fog | null
      if (fog && fog.isFog) { fog.color.copy(baseLook.fogColor).lerp(greyFog, k); fog.near = look.fog[0] * w.fog; fog.far = look.fog[1] * w.fog; scene.background = fog.color }
      skyU.zenith.value.copy(baseLook.zenith).lerp(greyLin, k)
      skyU.mid.value.copy(baseLook.mid).lerp(greyLin, k)
      skyU.horizon.value.copy(baseLook.horizon).lerp(greyLin, k)
      skyU.fogColor.value.copy(baseLook.skyFog).lerp(greyLin, k)
      skyU.clouds.value = k > 0 ? Math.max(baseLook.clouds, 0.9) : baseLook.clouds
      skyU.sunVisible.value = baseLook.sunVisible * (1 - k)
      skyU.glowStrength.value = baseLook.glow * (1 - k * 0.85)
      rain.amount = w.rain
    },
    kind, layout, time, theme: time === "night" ? "night" : "dusk", group, obstacles, collision, nav, coverPoints,
    exposure: look.exposure, lightLevel: look.light, visionScale: TIMES[time].visionScale, night: time === "night", obscurants: new Obscurants(),
    surfaceAt: (x, z) => ground.surface(x, z),
    districtAt,
    indoor: (x, z) => ground.indoor(x, z),
    update(dt, t, camera) {
      fx.time.value = t
      const cp = camera.position
      sky.position.copy(cp)
      // chunks beyond the fog are invisible anyway: hide them (three frustum-culls the rest)
      const fog = scene.fog as THREE.Fog | null
      const cull = fog && fog.isFog ? fog.far + 12 : Infinity, c2 = cull * cull
      for (let i = 0; i < chunkList.length; i++) {
        const r = chunkList[i]
        const dx = cp.x < r.minX ? r.minX - cp.x : cp.x > r.maxX ? cp.x - r.maxX : 0, dz = cp.z < r.minZ ? r.minZ - cp.z : cp.z > r.maxZ ? cp.z - r.maxZ : 0
        const d2 = dx * dx + dz * dz, vis = d2 < c2
        for (let j = 0; j < r.objects.length; j++) r.objects[j].visible = vis
        // trees: simple templates beyond ~60 m
        for (let j = 0; j < r.lods.length; j++) { const l = r.lods[j]; l.mesh.geometry = d2 > 3600 ? l.lo : l.hi }
      }
      if (sun.castShadow) {
        camera.getWorldDirection(fwd); fwd.y = 0
        const fl = fwd.length(); if (fl > 1e-4) fwd.multiplyScalar(18 / fl)
        center.set(cp.x + fwd.x, 0, cp.z + fwd.z)
        const px = Math.round(center.dot(lr) / texel) * texel, py = Math.round(center.dot(lu) / texel) * texel, pz = center.dot(sunDir)
        center.copy(lr).multiplyScalar(px).addScaledVector(lu, py).addScaledVector(sunDir, pz)
        sun.target.position.copy(center); sun.position.copy(center).addScaledVector(sunDir, 220)
        sun.target.updateMatrixWorld()
      }
      // pooled real lights follow the working lamps nearest to the camera
      lightClock -= dt
      if (look.lampI > 0 && (lightClock <= 0 || Math.abs(cp.x - lastLX) + Math.abs(cp.z - lastLZ) > 6)) {
        lightClock = 0.4; lastLX = cp.x; lastLZ = cp.z
        best.length = 0; bestD.length = 0
        for (let i = 0; i < lampSpots.length; i++) {
          const l = lampSpots[i], d = (l[0] - cp.x) ** 2 + (l[2] - cp.z) ** 2
          if (d > 2500) continue
          let k = best.length
          while (k > 0 && bestD[k - 1] > d) k--
          if (k >= pooled.length) continue
          best.splice(k, 0, i); bestD.splice(k, 0, d)
          if (best.length > pooled.length) { best.pop(); bestD.pop() }
        }
        for (let i = 0; i < pooled.length; i++) {
          const l = pooled[i]
          if (i < best.length) { const s = lampSpots[best[i]]; l.position.set(s[0], s[1] - 0.3, s[2]); l.color.setHex(s[3]); l.intensity = look.lampI } else l.intensity = 0
        }
      }
      for (let i = 0; i < radars.length; i++) radars[i].rotation.y = t * 0.55 + i
      evac.update(dt, t)
      // rain around the camera (not indoors); lightning: a double flash, the raid plays the thunder
      if (rain.amount > 0) { const inside = ground.indoor(cp.x, cp.z); rain.update(t, cp, inside); world.raining = !inside } else world.raining = false
      if (WEATHER[world.weather].lightning) {
        boltNext -= dt
        if (boltNext <= 0) { const n = nextLightning(boltRng); boltNext = n.wait; bolt = 0.32; world.onLightning?.(n.distance) }
        if (bolt > 0) { bolt = Math.max(0, bolt - dt); applyLight() }
      }
    },
    setExtraction(id, state, progress) { evac.set(id, state, progress) },
    setStructures,
    dispose() {
      scene.remove(group)
      evac.dispose()
      sun.dispose(); hemi.dispose()
      for (const l of pooled) l.dispose()
      for (const s of structures.values()) for (const d of s.disposables) d.dispose()
      for (const d of disposables) d.dispose()
      disposables.length = 0
    },
  }
  if (map.kind === "base") setStructures(opts.structures ?? {})
  return world
}

const UP = new THREE.Vector3(0, 1, 0)


// ---------------------------------------------------------------------------------------------------------------
// Ground: raster of the layout areas (1 m), greedy-merged into ≤ 16 m tiles; footstep surfaces and indoor flags
// ---------------------------------------------------------------------------------------------------------------
interface Ground { surface(x: number, z: number): Surface; indoor(x: number, z: number): boolean; lookAt(x: number, z: number): string; solidAt(x: number, z: number): boolean }

function buildGround(ctx: BuildCtx, map: ZoneMap | BaseMap, look: Look, high: boolean): Ground {
  const b = map.bounds, m = 10
  const gx0 = Math.floor(b.minX - m), gz0 = Math.floor(b.minZ - m), gx1 = Math.ceil(b.maxX + m), gz1 = Math.ceil(b.maxZ + m)
  const W = gx1 - gx0, H = gz1 - gz0
  const looks: string[] = [map.ground.look], lookIndex = new Map<string, number>([[map.ground.look, 0]])
  const lookGrid = new Uint8Array(W * H), surfGrid = new Uint8Array(W * H).fill(SURFACES.indexOf(map.ground.surface)), flags = new Uint8Array(W * H)
  const cells = (x0: number, z0: number, x1: number, z1: number, fn: (i: number) => void) => {
    const c0 = Math.max(0, Math.round(x0 - gx0)), c1 = Math.min(W, Math.round(x1 - gx0)), r0 = Math.max(0, Math.round(z0 - gz0)), r1 = Math.min(H, Math.round(z1 - gz0))
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) fn(r * W + c)
  }
  for (const a of map.areas) {
    const l = a.look ?? a.surface
    if (!lookIndex.has(l)) { lookIndex.set(l, looks.length); looks.push(l) }
    const li = lookIndex.get(l)!, si = Math.max(0, SURFACES.indexOf(a.surface))
    cells(a.x - a.w / 2, a.z - a.d / 2, a.x + a.w / 2, a.z + a.d / 2, i => { lookGrid[i] = li; surfGrid[i] = si })
  }
  const metal = SURFACES.indexOf("metal")
  for (const s of map.solids) {
    if (!(s.y ?? 0) && (s.style === "container")) cells(s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2, i => { surfGrid[i] = metal })
    if ((s.y ?? 0) < 0.3 && !s.style.startsWith("proxy-water")) cells(s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2, i => { flags[i] |= 2 })
  }
  for (const bd of map.buildings) if (!bd.solid) cells(bd.x0, bd.z0, bd.x1, bd.z1, i => { flags[i] |= 1 })
  // holes: open water (and the sea beyond the zone's south edge)
  const water: Rect[] = map.kind === "zone" ? [...map.water.rects, { x0: -10000, z0: b.maxZ, x1: 10000, z1: 10000 }] : []
  for (const r of water) cells(r.x0, r.z0, r.x1, r.z1, i => { flags[i] |= 4 })

  // greedy rectangles (≤ 16 m) per look; interior floors darker
  const used = new Uint8Array(W * H)
  const interior = new Set(["floor", "tiles", "plank"])
  const tintFor = (l: string) => {
    const k = interior.has(l) ? 0.72 : 1
    if (l === "lawn") return new THREE.Color(0.86, 1.02, 0.8).multiplyScalar(k)
    if (l === "forest") return new THREE.Color(0.62, 0.62, 0.52)
    if (l === "garden") return new THREE.Color(0.85, 0.82, 0.72)
    if (l === "ballast") return new THREE.Color(0.78, 0.76, 0.74)
    if (l === "rock") return new THREE.Color(0.98, 0.94, 0.88)
    if (l === "grass") return new THREE.Color(raw(look.foliage)).lerp(new THREE.Color(1, 1, 1), 0.55)
    return new THREE.Color(k, k, k)
  }
  const colors = looks.map(tintFor)
  const macro = (x: number, z: number) => 0.9 + 0.1 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.13 + Math.sin(x * 0.05) * 2) + 0.05 * Math.sin(x * 0.53 + z * 0.37)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c
    if (used[i] || flags[i] & 4) continue
    const li = lookGrid[i]
    let e = c + 1
    while (e < W && e - c < 16 && !used[r * W + e] && !(flags[r * W + e] & 4) && lookGrid[r * W + e] === li) e++
    let h = 1
    grow: while (r + h < H && h < 16) { for (let k = c; k < e; k++) { const j = (r + h) * W + k; if (used[j] || flags[j] & 4 || lookGrid[j] !== li) break grow } h++ }
    for (let rr = r; rr < r + h; rr++) used.fill(1, rr * W + c, rr * W + e)
    const x0 = gx0 + c, x1 = gx0 + e, z0 = gz0 + r, z1 = z0 + h
    ctx.B("g:" + looks[li]).flat(x0, z0, x1, z1, 0, colors[li], [macro(x0, z1), macro(x1, z1), macro(x1, z0), macro(x0, z0)])
  }
  const idx = (x: number, z: number) => { const c = Math.floor(x - gx0), r = Math.floor(z - gz0); return c < 0 || r < 0 || c >= W || r >= H ? -1 : r * W + c }
  const g: Ground = {
    surface: (x, z) => { const i = idx(x, z); return i < 0 ? map.ground.surface : SURFACES[surfGrid[i]] },
    indoor: (x, z) => { const i = idx(x, z); return i >= 0 && (flags[i] & 1) === 1 },
    lookAt: (x, z) => { const i = idx(x, z); return i < 0 ? map.ground.look : looks[lookGrid[i]] },
    solidAt: (x, z) => { const i = idx(x, z); return i < 0 || (flags[i] & 6) !== 0 },
  }
  // ground decals: stains, cracks, manholes on hard ground; litter indoors
  const rng = ctx.rng, n = Math.round((high ? 0.004 : 0.0018) * W * H)
  for (let k = 0; k < n; k++) {
    const x = gx0 + rng() * W, z = gz0 + rng() * H, l = g.lookAt(x, z)
    if (g.solidAt(x, z)) continue
    const roll = rng()
    if (l === "asphalt" || l === "quay" || l === "pavement" || l === "pad") {
      const key = roll < 0.3 ? "oil" : roll < 0.6 ? "crack" : roll < 0.68 ? "manhole" : roll < 0.74 ? "drain" : roll < 0.86 ? "tyremark" : roll < 0.93 ? "blood" : "paper"
      const s = key === "manhole" || key === "drain" ? 0.9 : key === "tyremark" ? 5 : 1.5 + rng() * 2.5
      ctx.decals.push({ key, x, y: 0, z, w: s, h: key === "tyremark" ? 1.2 : s, face: "up", color: 0xffffff, rot: key === "manhole" ? 0 : rng() * 6.28 })
    } else if (interior.has(l)) {
      if (roll < 0.5) ctx.decals.push({ key: roll < 0.2 ? "blood" : roll < 0.35 ? "oil" : "paper", x, y: 0, z, w: 1.2, h: 1.2, face: "up", color: 0xffffff, rot: rng() * 6.28 })
    }
  }
  return g
}

/** Foliage cards: weeds/grass tufts on soft ground, denser near walls and fences (ctx.weeds). */
function scatterWeeds(ctx: BuildCtx, g: Ground, map: ZoneMap | BaseMap, look: Look, high: boolean): void {
  const fb = ctx.B("foliage"), base = new THREE.Color(raw(look.foliage)), rng = ctx.rng, b = map.bounds
  const soft = new Set(["grass", "lawn", "dirt", "forest", "field", "garden", "gravel", "ballast", "rock"])
  const area = (b.maxX - b.minX) * (b.maxZ - b.minZ)
  const n = Math.round(area * (high ? 0.03 : 0.011))
  const spots: Array<[number, number, number]> = []
  for (let i = 0; i < n; i++) spots.push([b.minX + rng() * (b.maxX - b.minX), b.minZ + rng() * (b.maxZ - b.minZ), 0.7 + rng() * 0.8])
  if (map.kind === "zone") for (let i = 0; i < (high ? 14000 : 5000); i++) spots.push([-305 + rng() * 200, -305 + rng() * 200, 0.8 + rng() * 0.9])
  const keep = high ? 1 : 0.45
  for (const w of ctx.weeds) if (rng() < keep) spots.push(w)
  for (const [x, z, s] of spots) {
    const l = g.lookAt(x, z)
    if (!soft.has(l) || g.solidAt(x, z) || g.indoor(x, z)) continue
    if ((l === "gravel" || l === "ballast" || l === "rock") && rng() < 0.6) continue
    const cell = l === "field" ? 2 : l === "forest" ? (rng() < 0.5 ? 3 : 1) : Math.floor(rng() * 4), cu = (cell % 2) * 0.5, cv = cell < 2 ? 0.5 : 0
    const w = 0.32 * s * (0.8 + rng() * 0.6), h = 0.5 * s * (0.7 + rng() * 0.6) * (l === "field" ? 1.5 : 1), a = rng() * Math.PI
    const col = base.clone().multiplyScalar(0.7 + rng() * 0.5)
    for (const rot of [a, a + Math.PI / 2]) {
      const dx = Math.cos(rot) * w, dz = Math.sin(rot) * w
      fb.quad([x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + dx, h, z + dz], [x - dx, h, z - dz], [0, 1, 0], [cu, cv, cu + 0.5, cv, cu + 0.5, cv + 0.5, cu, cv + 0.5], col, [0.6, 0.6, 1, 1])
    }
  }
}

/** Hills around the playable area (sea to the south of the zone), drawn with the far-fog material as the horizon. */
function outerTerrain(env: Env, map: ZoneMap | BaseMap, look: Look): THREE.Mesh {
  // the base sits in a wide clearing ringed by woods; the zone's hills rise right behind its fence
  const b = map.bounds, inner = 10, R = 1500, step = 30, flat = map.kind === "base" ? 190 : 0
  const sea = map.kind === "zone" ? b.maxZ : Infinity
  const n = Math.round(2 * R / step)
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  const height = (x: number, z: number) => {
    const dx = Math.max(b.minX - inner - x, x - b.maxX - inner, 0), dz = Math.max(b.minZ - inner - z, z - b.maxZ - inner, 0), d = Math.max(0, Math.hypot(dx, dz) - flat)
    if (z > sea + 6) return -7
    if (d < 1) return -0.06
    const hill = 14 + 26 * (0.5 + 0.5 * Math.sin(x * 0.006 + Math.sin(z * 0.004) * 3)) * (0.6 + 0.4 * Math.sin(z * 0.009 + x * 0.002))
    return Math.min(1, d / 140) ** 1.6 * hill * (z > sea - 40 ? Math.max(0, (sea + 6 - z) / 46) : 1)
  }
  const gc = new THREE.Color(raw(look.foliage)).lerp(new THREE.Color(0.5, 0.56, 0.42), 0.5)
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
    const x = -R + c * step + (b.minX + b.maxX) / 2, z = -R + r * step + (b.minZ + b.maxZ) / 2, y = height(x, z)
    pos.push(x, y, z); uv.push(x / 5, -z / 5)
    const k = 0.55 + 0.25 * Math.sin(x * 0.03) * Math.sin(z * 0.025) + Math.min(0.2, y * 0.004)
    col.push(gc.r * k, gc.g * k, gc.b * k)
    const e = 2, hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e), l = Math.hypot(hx, 2 * e, hz)
    nor.push(-hx / l, 2 * e / l, -hz / l)
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x0 = -R + c * step + (b.minX + b.maxX) / 2, z0 = -R + r * step + (b.minZ + b.maxZ) / 2
    if (x0 >= b.minX - inner && x0 + step <= b.maxX + inner && z0 >= b.minZ - inner && z0 + step <= b.maxZ + inner) continue
    const i = r * (n + 1) + c
    idx.push(i, i + n + 1, i + 1, i + 1, i + n + 1, i + n + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx)
  uberize(g, env.layers.layer("grass"), keyInfo("g:grass"), 1, 1, undefined)
  g.computeBoundingSphere()
  env.own(g)
  const mesh = new THREE.Mesh(g, env.mats.far); mesh.receiveShadow = false; mesh.name = "Hügel"
  // the inner square gap (between ground raster and terrain grid) is covered by a flat skirt at y = -0.02
  return mesh
}

/**
 * Tree templates (unit height): spruce, broadleaf, dead tree, bush. Each is one geometry with two groups — group 0
 * (bark, inner shade volumes) for the opaque material, group 1 (cut-out leaf and needle cards) for the cut material.
 * Leaf cards sit on a shell around the crown and carry the shell's outward normal, so the crown shades like a
 * volume while its edge breaks up into single leaves. Low detail keeps the silhouette with a few big cards.
 */
function treeTemplates(env: Env, look: Look): { hi: THREE.BufferGeometry[]; lo: THREE.BufferGeometry[] } {
  const bark = env.layers.layer("bark"), canopy = env.layers.layer("canopy"), leafL = env.layers.layer("leaves"), needleL = env.layers.layer("needles")
  const bi = keyInfo("bark"), ci = keyInfo("canopy"), li = keyInfo("leaves"), ni = keyInfo("needles")
  const leaf = new THREE.Color(raw(look.foliage)).lerp(new THREE.Color(0.42, 0.56, 0.3), 0.7)
  const needle = new THREE.Color(0.3, 0.42, 0.28)
  const trunkC = new THREE.Color(0.8, 0.74, 0.66)
  const rng = mulberry(91)
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const part = (g: THREE.BufferGeometry, layer: number, info: KeyInfo, su: number, sv: number, c: THREE.Color) => uberize(g.index ? g.toNonIndexed() : g, layer, info, su, sv, c)
  /** Tapered limb from a to b (radius r0 at a, r1 at b). */
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 5) => {
    const d = b.clone().sub(a), len = d.length()
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true).translate(0, len / 2, 0)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate(a.x, a.y, a.z)
    return part(g, bark, bi, 0.4, 1.5, trunkC)
  }
  /** Trunk (unit tree height): tapered, gently bent, with lobed root buttresses flaring into the ground. */
  const trunk = (r0: number, r1: number, h: number, seg: number, rows: number, lobes: number, flare: number, bend: number, c: THREE.Color) => {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, rows, true).translate(0, h / 2, 0), p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), f = y / h
      const k = 1 + flare * Math.exp(-f * 9) * (0.55 + 0.45 * Math.cos(a * lobes)) + 0.06 * Math.sin(a * 3 + f * 11) * (1 - f)
      p.setXYZ(i, x * k + bend * Math.sin(f * 2.6) * f, y, z * k + bend * 0.6 * Math.sin(f * 3.4 + 1) * f)
    }
    g.computeVertexNormals()
    return part(g, bark, bi, 1.6, 3, c)
  }
  /** Cut-out card centred at c spanning u (left → right) and v (bottom → top); every vertex gets normal n. */
  const card = (c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3, layer: number, info: KeyInfo, color: THREE.Color) => {
    const p = [c.clone().addScaledVector(u, -0.5).addScaledVector(v, -0.5), c.clone().addScaledVector(u, 0.5).addScaledVector(v, -0.5), c.clone().addScaledVector(u, 0.5).addScaledVector(v, 0.5), c.clone().addScaledVector(u, -0.5).addScaledVector(v, 0.5)]
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]], order = [0, 1, 2, 0, 2, 3]
    const pos = new Float32Array(18), nor = new Float32Array(18), uvs = new Float32Array(12)
    order.forEach((k, i) => { pos.set([p[k].x, p[k].y, p[k].z], i * 3); nor.set([n.x, n.y, n.z], i * 3); uvs.set(uv[k], i * 2) })
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
    return uberize(g, layer, info, 1, 1, color)
  }
  /** Leaf cards on an ellipsoid shell (centre c, radii r), facing outwards with a random roll. */
  const crown = (out: THREE.BufferGeometry[], c: THREE.Vector3, r: THREE.Vector3, count: number, size: number, minY: number, base: THREE.Color) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count, phi = Math.acos(1 - 2 * t), th = i * 2.39996 + rng() * 0.3
      const dir = V(Math.sin(phi) * Math.cos(th), Math.max(minY, Math.cos(phi)), Math.sin(phi) * Math.sin(th)).normalize()
      const k = 0.78 + rng() * 0.26, at = V(c.x + dir.x * r.x * k, c.y + dir.y * r.y * k, c.z + dir.z * r.z * k)
      const side = Math.abs(dir.y) > 0.95 ? V(1, 0, 0) : V(-dir.z, 0, dir.x).normalize(), up = new THREE.Vector3().crossVectors(dir, side)
      const roll = rng() * Math.PI * 2, s = size * (0.8 + rng() * 0.45)
      const u = side.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll)).multiplyScalar(s)
      const v = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(side, -Math.sin(roll)).multiplyScalar(s)
      // tilt every card a little off the shell so the crown is not a perfect ball of discs
      u.applyAxisAngle(side, (rng() - 0.5) * 0.35); v.applyAxisAngle(side, (rng() - 0.5) * 0.35)
      const shade = (0.72 + 0.38 * (dir.y * 0.5 + 0.5)) * (0.88 + rng() * 0.24)
      out.push(card(at, u, v, V(dir.x, dir.y * 0.7 + 0.3, dir.z).normalize(), leafL, li, base.clone().multiplyScalar(shade)))
    }
  }
  const blob = (x: number, y: number, z: number, r: number, sx: number, sy: number, sz: number, c: THREE.Color, detail = 1) => {
    const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const k = 1 + 0.16 * Math.sin(p.getX(i) * 40 + p.getZ(i) * 31) * Math.sin(p.getY(i) * 37); p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz) }
    g.computeVertexNormals(); g.translate(x, y, z)
    return part(g, canopy, ci, 3, 3, c)
  }
  const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; for (const p of parts) p.dispose(); return g }
  const tpl = (opaque: THREE.BufferGeometry[], cut: THREE.BufferGeometry[]) => {
    const groups = [merge(opaque)]; if (cut.length) groups.push(merge(cut))
    const g = mergeGeometries(groups, true)!; for (const x of groups) x.dispose()
    g.computeBoundingSphere(); return env.own(g)
  }

  // spruce: trunk, dark inner cone, ten tiers of drooping needle sprays, top shoot
  const spO = [trunk(0.028, 0.005, 0.98, 10, 6, 6, 0.5, 0.008, trunkC),
    part(new THREE.ConeGeometry(0.12, 0.66, 9, 1, true).translate(0, 0.6, 0), canopy, ci, 4, 4, needle.clone().multiplyScalar(0.7))]
  const spC: THREE.BufferGeometry[] = []
  for (let t = 0; t < 10; t++) {
    const y = 0.2 + t * 0.077, R = 0.31 * (1 - t / 10.5) + 0.035, n = t < 7 ? 8 : 6
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + t * 0.47 + rng() * 0.3, droop = 0.32 + rng() * 0.18
      const out = V(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop)).multiplyScalar(R * 1.18)
      const w = V(-Math.sin(a), 0.12, Math.cos(a)).normalize().multiplyScalar(R * 0.85 + 0.04)
      const nrm = new THREE.Vector3().crossVectors(out, w).normalize(); if (nrm.y < 0) nrm.negate()
      nrm.addScaledVector(V(Math.cos(a), 0, Math.sin(a)), 0.5).normalize()
      spC.push(card(V(0, y, 0).addScaledVector(out, 0.5), out, w, nrm, needleL, ni, needle.clone().multiplyScalar((0.85 + t * 0.03) * (0.9 + rng() * 0.2))))
    }
  }
  spO.push(part(new THREE.ConeGeometry(0.03, 0.12, 6).translate(0, 0.94, 0), canopy, ci, 4, 4, needle.clone().multiplyScalar(1.05)))

  // broadleaf: trunk with root flare, five limbs with twigs, shade volumes, 44 leaf cards
  const brO = [trunk(0.046, 0.02, 0.62, 14, 8, 5, 0.6, 0.02, trunkC)]
  for (let i = 0; i < 5; i++) { const a = i * 1.2566 + 0.3; brO.push(limb(V(0, 0.05, 0), V(Math.cos(a) * 0.085, -0.006, Math.sin(a) * 0.085), 0.022, 0.006)) }
  for (let i = 0; i < 5; i++) {
    const a = i * 1.257 + rng() * 0.4, y = 0.4 + i * 0.045, end = V(Math.cos(a) * 0.24, y + 0.2 + rng() * 0.08, Math.sin(a) * 0.24)
    brO.push(limb(V(0, y, 0), end, 0.017, 0.006))
    brO.push(limb(end.clone().multiplyScalar(0.6).setY(y + 0.12), V(end.x * 0.7 + Math.cos(a + 1) * 0.08, end.y + 0.08, end.z * 0.7 + Math.sin(a + 1) * 0.08), 0.007, 0.003, 4))
  }
  const brC: THREE.BufferGeometry[] = []
  const clumps = [[0, 0.75, 0, 0.21], [0.17, 0.66, 0.07, 0.16], [-0.16, 0.68, -0.08, 0.17], [0.05, 0.88, -0.11, 0.14], [-0.07, 0.62, 0.17, 0.14], [0.08, 0.6, -0.17, 0.13]] as const
  for (const [x, y, z, r] of clumps) {
    brO.push(blob(x, y, z, r * 0.78, 1, 0.85, 1, leaf.clone().multiplyScalar(0.42), 0))
    crown(brC, V(x, y, z), V(r * 1.15, r * 0.95, r * 1.15), Math.round(r * r * 900), 0.13 + r * 0.55, -0.6, leaf.clone().multiplyScalar(0.9))
  }

  // dead tree: bare trunk, broken top, limbs with forks
  const dc = trunkC.clone().multiplyScalar(0.78)
  const deO = [trunk(0.042, 0.012, 0.9, 10, 7, 4, 0.45, 0.025, dc)]
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + rng() * 0.5, y = 0.36 + i * 0.08, l = 0.26 - i * 0.025, end = V(Math.cos(a) * l, y + l * 0.7, Math.sin(a) * l)
    deO.push(limb(V(0, y, 0), end, 0.013, 0.004))
    deO.push(limb(V(end.x * 0.6, y + l * 0.42, end.z * 0.6), V(end.x * 0.75 + Math.cos(a - 1.2) * 0.07, end.y + 0.06, end.z * 0.75 + Math.sin(a - 1.2) * 0.07), 0.005, 0.002, 4))
  }

  // bush: woody stems from the ground, three clumps (dark cores in leaf-card shells) for an uneven outline
  const buO: THREE.BufferGeometry[] = [], buC: THREE.BufferGeometry[] = []
  const buClumps = [[0, 0.34, 0, 0.34], [0.27, 0.25, 0.12, 0.24], [-0.24, 0.27, -0.1, 0.26], [0.05, 0.22, -0.26, 0.2]] as const
  for (const [x, y, z, r] of buClumps) {
    buO.push(blob(x, y, z, r * 0.72, 1.15, 0.8, 1.1, leaf.clone().multiplyScalar(0.4), 0))
    buO.push(limb(V(x * 0.3, 0, z * 0.3), V(x, y - r * 0.3, z), 0.012, 0.006, 4))
    crown(buC, V(x, y, z), V(r * 1.2, r * 0.95, r * 1.15), Math.round(r * r * 380), 0.16 + r * 0.42, -0.25, leaf.clone().multiplyScalar(0.86 + x * 0.3))
  }

  // low detail: same silhouettes from a handful of pieces
  const spLo = [part(new THREE.CylinderGeometry(0.016, 0.032, 0.5, 6).translate(0, 0.25, 0), bark, bi, 0.6, 4, trunkC),
    part(new THREE.ConeGeometry(0.28, 0.52, 7, 1, true).translate(0, 0.46, 0), canopy, ci, 4, 4, needle.clone().multiplyScalar(0.9)),
    part(new THREE.ConeGeometry(0.16, 0.46, 7, 1, true).translate(0, 0.76, 0), canopy, ci, 4, 4, needle.clone().multiplyScalar(1.05))]
  const brLoO = [part(new THREE.CylinderGeometry(0.022, 0.045, 0.6, 6).translate(0, 0.3, 0), bark, bi, 0.6, 3, trunkC), blob(0, 0.72, 0, 0.27, 1.1, 0.85, 1.1, leaf.clone().multiplyScalar(0.62), 0)]
  const brLoC: THREE.BufferGeometry[] = []
  for (const [x, y, z, r] of clumps.slice(0, 4)) crown(brLoC, V(x, y, z), V(r * 1.2, r, r * 1.2), 4, 0.2 + r * 0.9, -0.4, leaf.clone().multiplyScalar(0.9))
  const deLo = [part(new THREE.CylinderGeometry(0.014, 0.04, 0.9, 6).translate(0, 0.45, 0), bark, bi, 0.6, 4, dc)]
  const buLoO = [blob(0, 0.3, 0, 0.4, 1.2, 0.72, 1.1, leaf.clone().multiplyScalar(0.5), 0)]
  const buLoC: THREE.BufferGeometry[] = []
  for (const [x, y, z, r] of buClumps.slice(0, 3)) crown(buLoC, V(x, y, z), V(r * 1.2, r, r * 1.15), 6, 0.28 + r * 0.6, -0.15, leaf.clone().multiplyScalar(0.9))
  return {
    hi: [tpl(spO, spC), tpl(brO, brC), tpl(deO, []), tpl(buO, buC)],
    lo: [tpl(spLo, []), tpl(brLoO, brLoC), tpl(deLo, []), tpl(buLoO, buLoC)],
  }
}

function scaleUv(g: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
}

/** Unit sandbag (1 × 1 × 1 box rounded into a pillow), scaled per instance. */
function pillow(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 1, 2)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 2, y = p.getY(i), z = p.getZ(i) * 2
    const k = 1 - 0.45 * x ** 4 - 0.35 * z ** 4
    p.setXYZ(i, p.getX(i) * (1 - 0.06 * Math.abs(y) * 2), y * Math.max(0.25, k), p.getZ(i) * (1 - 0.08 * Math.abs(y) * 2))
  }
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------------------------------------------------------
// Searchlights: one mesh for all beams, one for the ground spots, one for the housings (sweep in the shader)
// ---------------------------------------------------------------------------------------------------------------
const SWEEP_GLSL = /* glsl */`
attribute vec3 lamp; attribute vec4 sweep; attribute float pitch;
mat3 sweepRot(float t) {
  float yaw = sweep.x + sweep.y * sin(t * sweep.z + sweep.w);
  float cy = cos(yaw), sy = sin(yaw), cp = cos(-pitch), sp = sin(-pitch);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  return ry * rx;
}`

function buildSearchlights(list: Array<{ x: number; y: number; z: number; rot: number; amp: number; dist: number; phase: number }>, fx: FxUniforms, own: <T extends { dispose(): void }>(d: T) => T, k = 1): THREE.Mesh[] {
  if (!list.length) return []
  const beams = new GeoBatch(), spots = new GeoBatch(), housings = new GeoBatch()
  const attrs = { lamp: [] as number[], sweep: [] as number[], pitch: [] as number[] }
  const spotAttrs = { lamp: [] as number[], sweep: [] as number[], pitch: [] as number[] }
  const houseAttrs = { lamp: [] as number[], sweep: [] as number[], pitch: [] as number[] }
  const I = new THREE.Matrix4()
  for (const s of list) {
    const len = Math.hypot(s.dist, s.y) + 4, pitch = Math.atan2(s.y, s.dist)
    const before = beams.extras.length
    const g = new THREE.CylinderGeometry(0.22, len * 0.085, len, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0, -len / 2)
    beams.add(g, I, raw(0xd8e4ff).multiplyScalar(0.55 * k)); g.dispose()
    const n = beams.extras[before].attributes.position.count
    for (let i = 0; i < n; i++) { attrs.lamp.push(s.x, s.y, s.z); attrs.sweep.push(s.rot, s.amp, 0.35 + s.phase * 0.03, s.phase); attrs.pitch.push(pitch) }
    const sp = new THREE.PlaneGeometry(2, 2); sp.rotateX(-Math.PI / 2)
    spots.add(sp, I, raw(0xc8d8ff).multiplyScalar(0.55 * k)); sp.dispose()
    for (let i = 0; i < 4; i++) { spotAttrs.lamp.push(s.x, s.y, s.z); spotAttrs.sweep.push(s.rot, s.amp, 0.35 + s.phase * 0.03, s.phase); spotAttrs.pitch.push(pitch) }
    const hb = housings.extras.length
    const hg = new THREE.CylinderGeometry(0.38, 0.32, 0.7, 12).rotateX(Math.PI / 2)
    housings.add(hg, I, new THREE.Color(0.09, 0.1, 0.11)); hg.dispose()
    const lens = new THREE.CircleGeometry(0.34, 16).rotateY(Math.PI).translate(0, 0, -0.36)
    housings.add(lens, I, new THREE.Color(2.4, 2.4, 2.6)); lens.dispose()
    let hn = 0; for (let i = hb; i < housings.extras.length; i++) hn += housings.extras[i].attributes.position.count
    for (let i = 0; i < hn; i++) { houseAttrs.lamp.push(s.x, s.y, s.z); houseAttrs.sweep.push(s.rot, s.amp, 0.35 + s.phase * 0.03, s.phase); houseAttrs.pitch.push(pitch) }
  }
  const finish = (batch: GeoBatch, a: typeof attrs) => {
    const g = own(batch.build()!)
    g.setAttribute("lamp", new THREE.Float32BufferAttribute(a.lamp, 3))
    g.setAttribute("sweep", new THREE.Float32BufferAttribute(a.sweep, 4))
    g.setAttribute("pitch", new THREE.Float32BufferAttribute(a.pitch, 1))
    return g
  }
  const beamMat = own(coneMaterial(fx, {}, SWEEP_GLSL, "mat3 R = sweepRot(time); p = R * p + lamp; n = R * n;"))
  const beamMesh = new THREE.Mesh(finish(beams, attrs), beamMat); beamMesh.frustumCulled = false; beamMesh.renderOrder = 4
  const spotMat = own(new THREE.ShaderMaterial({
    uniforms: { time: fx.time, fogNear: fx.fogNear, fogFar: fx.fogFar },
    vertexShader: SWEEP_GLSL + /* glsl */`
      uniform float time, fogNear, fogFar; varying vec2 vUv; varying vec3 vCol;
      void main() {
        mat3 R = sweepRot(time);
        vec3 d = R * vec3(0.0, 0.0, -1.0);
        float t = lamp.y / max(-d.y, 0.05);
        vec3 hit = lamp + d * t;
        float r = t * 0.085;
        vec2 f = normalize(d.xz + 1e-5), s = vec2(-f.y, f.x);
        vec2 q = position.xz;
        vec3 wp = vec3(hit.x + f.x * q.y * r / max(-d.y, 0.2) * 0.6 + s.x * q.x * r, 0.05, hit.z + f.y * q.y * r / max(-d.y, 0.2) * 0.6 + s.y * q.x * r);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        vUv = uv; vCol = color * (1.0 - smoothstep(fogNear, fogFar, -mv.z));
      }`,
    fragmentShader: /* glsl */`varying vec2 vUv; varying vec3 vCol; void main() { float d = length(vUv * 2.0 - 1.0); float a = 1.0 - smoothstep(0.35, 1.0, d); gl_FragColor = vec4(vCol * a, 1.0); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }))
  const spotMesh = new THREE.Mesh(finish(spots, spotAttrs), spotMat); spotMesh.frustumCulled = false; spotMesh.renderOrder = 3
  const houseMat = own(new THREE.ShaderMaterial({
    uniforms: { time: fx.time },
    vertexShader: SWEEP_GLSL + /* glsl */`uniform float time; varying vec3 vCol; void main() { mat3 R = sweepRot(time); vec3 p = R * position + lamp; vCol = color; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }`,
    vertexColors: true, toneMapped: false,
  }))
  const houseMesh = new THREE.Mesh(finish(housings, houseAttrs), houseMat); houseMesh.frustumCulled = false
  return [beamMesh, spotMesh, houseMesh]
}

