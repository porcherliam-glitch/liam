/**
 * world.ts — builds the 3D environment for a mission from its MapLayout (maps.ts).
 * CONTRACT (used by raid.ts and enemies.ts):
 *  - createWorld(mission, scene, quality) adds world.group to the scene and sets scene.background/fog + lights.
 *  - obstacles: one AABB per layout solid plus perimeter walls just outside layout.bounds (maps.layoutObstacles).
 *  - nav: NavGrid over layout.bounds (agent radius 0.45 m, 1 m cells).
 *  - coverPoints: standing spots right next to solids >= 1 m tall (normal points away from the solid).
 *  - surfaceAt(x, z): ground material for footstep sounds.
 *  - update(dt, time, camera): per frame — sky follows the camera, animated props. Allocation-free.
 *  - setExtraction(id, state, progress): drives the evac zone visuals ("hidden" for zones not used this raid).
 *  - dispose(): removes the group from the scene and frees GPU resources it created.
 * Rendering: static geometry is merged per material (props.ts / meshkit.ts), textures are procedural (textures.ts),
 * sky/skyline/water in sky.ts, evac visuals in extraction.ts. "low" quality: no shadows, one real light, fewer props,
 * smaller textures.
 */
import * as THREE from "three"
import { MISSIONS } from "./data"
import type { Obstacle } from "./collision"
import { createExtractions } from "./extraction"
import { computeCoverPoints, getLayout, layoutObstacles, type MapLayout, type MapLight } from "./maps"
import { ConeBatch, GeoBatch, GlowBatch, PoolBatch, coneMaterial, raw, type FxUniforms } from "./meshkit"
import { NavGrid } from "./nav"
import { buildBuildingDetails, buildFences, buildPerimeter, buildProp, buildSolid, disposeTemplates, emitDecals, emitWindows, type BuildCtx, type InstKind, type PropLook } from "./props"
import { createSky, createSkyline, createWater, type SkySpec, type SkylineSpec, type WaterSpec } from "./sky"
import { TEX, decalAtlas, mulberry, textDecal, textureCanvas, windowCanvases, type TexName } from "./textures"
import type { MissionId, Surface, ThemeId } from "./types"

export interface CoverPoint { x: number; z: number; height: number; nx: number; nz: number }
export type ExtractionState = "hidden" | "locked" | "ready" | "called" | "done"

export interface World {
  layout: MapLayout
  theme: ThemeId
  group: THREE.Group
  obstacles: Obstacle[]
  nav: NavGrid
  coverPoints: CoverPoint[]
  /** Suggested renderer.toneMappingExposure for this theme. */
  exposure: number
  surfaceAt(x: number, z: number): Surface
  update(dt: number, time: number, camera: THREE.Camera): void
  setExtraction(id: string, state: ExtractionState, progress: number): void
  dispose(): void
}

interface Look {
  sky: SkySpec
  fogNear: number; fogFar: number; exposure: number
  sun: { color: number; intensity: number; dir?: [number, number, number] }
  hemi: { sky: number; ground: number; intensity: number }
  skyline: Omit<SkylineSpec, "seed">
  props: PropLook
  windowGlow: number
  foliage: number
  far: string
  water?: Omit<WaterSpec, "lamps">
}

const LOOKS: Record<ThemeId, Look> = {
  dusk: {
    sky: {
      zenith: 0x2a3d6e, mid: 0x8c7aa6, horizon: 0xf0a77c, glow: 0xffb45e, fog: 0xc9958a, sunDir: [-0.86, 0.2, 0.47], sunColor: 0xfff2c8, sunSize: 0.028,
      sunVisible: 1, glowStrength: 1, moon: false, stars: 0, clouds: 0.55, cloudColor: 0x6e5c7c, cloudLit: 0xffa070,
    },
    fogNear: 30, fogFar: 215, exposure: 1.12,
    sun: { color: 0xffb27a, intensity: 3.2 },
    hemi: { sky: 0x9aa8d6, ground: 0x6a5446, intensity: 1.5 },
    skyline: { kind: "industrial", fog: 0xc9958a, dark: 0x4a3c52, lit: 0xffc070, litChance: 0.07 },
    props: { night: 0.15, lamps: 0.75, lampColor: 0xffc27a, windowLit: 0.32, shafts: 0 },
    windowGlow: 1.1, foliage: 0xe6dca0, far: "dirt",
  },
  harbor: {
    sky: {
      zenith: 0x0b1838, mid: 0x1d3667, horizon: 0x405c8c, glow: 0xe07a4a, fog: 0x2f4369, sunDir: [-0.9, 0.02, -0.32], sunColor: 0xffc890, sunSize: 0.02,
      sunVisible: 0, glowStrength: 0.9, moon: false, stars: 0.3, clouds: 0.35, cloudColor: 0x1a2442, cloudLit: 0x8c5a62,
    },
    fogNear: 22, fogFar: 190, exposure: 1.42,
    sun: { color: 0x9fb4e8, intensity: 0.85, dir: [-0.55, 0.62, -0.3] },
    hemi: { sky: 0x5672b2, ground: 0x34303a, intensity: 1.45 },
    skyline: { kind: "harbor", fog: 0x2f4369, dark: 0x0f1a2e, lit: 0xffc890, litChance: 0.32, waterFrom: 0.85, waterTo: 3.7 },
    props: { night: 0.6, lamps: 1.0, lampColor: 0xff9a40, windowLit: 0.55, shafts: 1 },
    windowGlow: 1.5, foliage: 0x93a488, far: "asphalt",
    water: { deep: 0x0b1424, skyLow: 0x405c8c, skyHigh: 0x172a52, glow: 0xd27444, glowDir: [-0.9, -0.3], lampColor: 0xffa040 },
  },
  night: {
    sky: {
      zenith: 0x02050d, mid: 0x07122a, horizon: 0x15253f, glow: 0x2c3c60, fog: 0x0f1b31, sunDir: [0.45, 0.55, -0.7], sunColor: 0xe8eeff, sunSize: 0.024,
      sunVisible: 0, glowStrength: 0.7, moon: true, stars: 1, clouds: 0.28, cloudColor: 0x0b1324, cloudLit: 0x36486e,
      glow2: { dir: [-0.9, 0.4], color: 0x4a3a2c, strength: 0.7 },
    },
    fogNear: 14, fogFar: 140, exposure: 1.6,
    sun: { color: 0xaabcff, intensity: 0.8 },
    hemi: { sky: 0x2e4270, ground: 0x12141a, intensity: 0.95 },
    skyline: { kind: "forest", fog: 0x0f1b31, dark: 0x03060c, lit: 0xffc070, litChance: 0.12 },
    props: { night: 1, lamps: 1.0, lampColor: 0xdfe8ff, windowLit: 0.4, shafts: 1.1 },
    windowGlow: 1.3, foliage: 0x7a8668, far: "grass",
  },
}

const SURFACES: Surface[] = ["asphalt", "concrete", "metal", "gravel", "dirt", "wood"]
const GROUND_TEX: Record<string, TexName> = { asphalt: "asphalt", gravel: "gravel", dirt: "dirt", grass: "grass", pavement: "pavement", quay: "quay", pad: "pad", floor: "floor", tiles: "tiles", plank: "plank", concrete: "pavement", metal: "pad", wood: "plank" }

export function createWorld(missionId: MissionId, scene: THREE.Scene, quality: "high" | "low"): World {
  const layout = getLayout(missionId)
  const theme = MISSIONS[missionId].theme
  const look = LOOKS[theme]
  const high = quality === "high"
  const group = new THREE.Group(); group.name = "Einsatzgebiet"
  const disposables: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d }
  const fx: FxUniforms = { time: { value: 0 }, fogNear: { value: look.fogNear }, fogFar: { value: look.fogFar } }
  scene.background = new THREE.Color(look.sky.fog)
  scene.fog = new THREE.Fog(look.sky.fog, look.fogNear, look.fogFar)

  // --- collision, navigation, cover ----------------------------------------------------------------------------
  const obstacles = layoutObstacles(layout)
  const nav = new NavGrid(layout.bounds, obstacles, 0.45, 1)
  const coverPoints: CoverPoint[] = computeCoverPoints(layout, nav)

  // --- textures & materials ---------------------------------------------------------------------------------
  const texSize = high ? 512 : 256
  const textures = new Map<string, THREE.Texture>()
  const tex = (name: TexName, repeat = true): THREE.Texture => {
    const key = name + (repeat ? "" : ":1")
    let t = textures.get(key)
    if (!t) {
      t = own(new THREE.CanvasTexture(textureCanvas(name, name === "smoke" ? 128 : name === "padmark" ? 256 : texSize)))
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = high ? 8 : 2
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / TEX[name][0], 1 / TEX[name][1]) }
      textures.set(key, t)
    }
    return t
  }
  const materials = new Map<string, THREE.Material>()
  const std = (o: THREE.MeshStandardMaterialParameters) => own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o }))
  const atlasExtra = new Map<string, ReturnType<typeof textDecal>>()
  let atlasTex: THREE.Texture | null = null
  const material = (key: string): THREE.Material => {
    let m = materials.get(key)
    if (m) return m
    if (key.startsWith("g:")) m = std({ map: tex(GROUND_TEX[key.slice(2)] ?? "gravel"), roughness: key === "g:asphalt" ? 0.86 : 0.95 })
    else switch (key) {
      case "decal": m = std({ map: atlasTex!, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); break
      case "window": {
        const w = windowCanvases(high ? 128 : 64)
        const map = own(new THREE.CanvasTexture(w.map)), em = own(new THREE.CanvasTexture(w.emissive))
        map.colorSpace = em.colorSpace = THREE.SRGBColorSpace
        m = std({ map, emissiveMap: em, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: look.windowGlow, roughness: 0.25, metalness: 0.1 }); break
      }
      case "lamp": m = own(new THREE.MeshBasicMaterial({ vertexColors: true })); break
      case "fence": m = std({ map: tex("chainlink"), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }); break
      case "foliage": m = std({ map: tex("foliage", false), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }); break
      case "truss": m = std({ map: tex("truss"), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }); break
      case "concertina": m = std({ map: tex("concertina"), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }); break
      case "glass": m = std({ map: tex("glass"), roughness: 0.12, metalness: 0.3 }); break
      case "metal": m = std({ map: tex("metal"), roughness: 0.55, metalness: 0.2 }); break
      case "container": m = std({ map: tex("container"), roughness: 0.62, metalness: 0.15 }); break
      case "rubber": m = std({ map: tex("rubber"), roughness: 0.95 }); break
      case "burlap": m = std({ map: tex("burlap"), roughness: 1 }); break
      default: m = std({ map: tex(key as TexName) })
    }
    materials.set(key, m)
    return m
  }

  // --- build context ---------------------------------------------------------------------------------------
  const batches = new Map<string, GeoBatch>()
  const instances = new Map<InstKind, Array<{ m: THREE.Matrix4; c: number }>>()
  const glow = new GlowBatch(), pool = new PoolBatch(), cone = new ConeBatch()
  const ctx: BuildCtx = {
    layout, look: look.props, high, rng: mulberry(MISSIONS[missionId].seed),
    B: key => { let b = batches.get(key); if (!b) { b = new GeoBatch(); batches.set(key, b) } return b },
    glow, pool, cone,
    inst: (kind, x, y, z, ry, s, color, rx = 0) => {
      let list = instances.get(kind); if (!list) { list = []; instances.set(kind, list) }
      list.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(...s)), c: color })
    },
    decals: [], texts: new Map(), windows: [], lines: [], searchlights: [], radars: [], weeds: [],
  }

  // --- ground ----------------------------------------------------------------------------------------------
  const b = layout.bounds, margin = 34
  const water = layout.water?.sides ?? []
  const gx0 = b.minX - (water.includes("w") ? 1 : margin), gx1 = b.maxX + (water.includes("e") ? 1 : margin)
  const gz0 = b.minZ - (water.includes("n") ? 1 : margin), gz1 = b.maxZ + (water.includes("s") ? 1 : margin)
  const gcols = Math.round(gx1 - gx0), grows = Math.round(gz1 - gz0)
  const areas = layout.areas ?? []
  const def = layout.ground ?? { surface: "gravel" as Surface, look: "gravel" }
  const looks: string[] = [def.look], lookIndex = new Map<string, number>([[def.look, 0]])
  const lookGrid = new Uint8Array(gcols * grows), surfGrid = new Uint8Array(gcols * grows)
  const defSurf = SURFACES.indexOf(def.surface)
  surfGrid.fill(defSurf)
  for (const a of areas) {
    const l = a.look ?? a.surface
    if (!lookIndex.has(l)) { lookIndex.set(l, looks.length); looks.push(l) }
    const li = lookIndex.get(l)!, si = SURFACES.indexOf(a.surface)
    const c0 = Math.max(0, Math.round(a.x - a.w / 2 - gx0)), c1 = Math.min(gcols, Math.round(a.x + a.w / 2 - gx0))
    const r0 = Math.max(0, Math.round(a.z - a.d / 2 - gz0)), r1 = Math.min(grows, Math.round(a.z + a.d / 2 - gz0))
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { lookGrid[r * gcols + c] = li; surfGrid[r * gcols + c] = si }
  }
  for (const s of layout.solids) if (s.style === "container" && !(s.y ?? 0)) {
    for (let r = Math.max(0, Math.round(s.z - s.d / 2 - gz0)); r < Math.min(grows, Math.round(s.z + s.d / 2 - gz0)); r++) for (let c = Math.max(0, Math.round(s.x - s.w / 2 - gx0)); c < Math.min(gcols, Math.round(s.x + s.w / 2 - gx0)); c++) surfGrid[r * gcols + c] = 2
  }
  for (const p of layout.props ?? []) if (p.kind === "rail") for (let r = 0; r < grows; r++) for (const dx of [-0.5, 0]) { const c = Math.floor(p.x + dx - gx0); if (c >= 0 && c < gcols) surfGrid[r * gcols + c] = 2 }
  const interior = new Set(["floor", "tiles", "plank"])
  const macro = (x: number, z: number) => 0.9 + 0.1 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.13 + Math.sin(x * 0.05) * 2) + 0.05 * Math.sin(x * 0.53 + z * 0.37)
  const gc = new THREE.Color()
  for (let r = 0; r < grows; r++) {
    let c = 0
    while (c < gcols) {
      const li = lookGrid[r * gcols + c]
      let e = c + 1
      while (e < gcols && e - c < 4 && lookGrid[r * gcols + e] === li) e++
      const x0 = gx0 + c, x1 = gx0 + e, z0 = gz0 + r, z1 = z0 + 1
      const l = looks[li], k = interior.has(l) ? 0.72 : 1
      gc.setRGB(k, k, k)
      ctx.B("g:" + l).flat(x0, z0, x1, z1, 0, gc, [macro(x0, z1), macro(x1, z1), macro(x1, z0), macro(x0, z0)])
      c = e
    }
  }
  const farB = ctx.B("g:" + look.far), far = 1300, fc = new THREE.Color(0.85, 0.85, 0.85)
  farB.flat(-far, -far, water.includes("e") ? gx1 : far, gz0, -0.02, fc)
  if (!water.includes("s")) farB.flat(-far, gz1, far, far, -0.02, fc)
  if (!water.includes("w")) farB.flat(-far, gz0, gx0, gz1, -0.02, fc)
  if (!water.includes("e")) farB.flat(gx1, gz0, far, gz1, -0.02, fc)
  // scattered ground decals (stains, cracks, manholes)
  const lookAt = (x: number, z: number) => { const c = Math.floor(x - gx0), r = Math.floor(z - gz0); return c >= 0 && r >= 0 && c < gcols && r < grows ? looks[lookGrid[r * gcols + c]] : look.far }
  const solidAt = (x: number, z: number, pad = 0) => layout.solids.some(s => (s.y ?? 0) < 0.3 && Math.abs(x - s.x) < s.w / 2 + pad && Math.abs(z - s.z) < s.d / 2 + pad)
  for (let i = 0; i < (high ? 170 : 80); i++) {
    const x = b.minX + ctx.rng() * (b.maxX - b.minX), z = b.minZ + ctx.rng() * (b.maxZ - b.minZ), l = lookAt(x, z)
    if (solidAt(x, z, 0.5)) continue
    const roll = ctx.rng()
    if (l === "asphalt" || l === "quay" || l === "pavement" || l === "pad") {
      const key = roll < 0.35 ? "oil" : roll < 0.65 ? "crack" : roll < 0.75 ? "manhole" : roll < 0.82 ? "drain" : roll < 0.93 ? "tyremark" : "paper"
      const s = key === "manhole" || key === "drain" ? 0.9 : key === "tyremark" ? 5 : 1.5 + ctx.rng() * 2.5
      ctx.decals.push({ key, x, y: 0, z, w: s, h: key === "tyremark" ? 1.2 : s, face: "up", color: 0xffffff, rot: key === "manhole" ? 0 : ctx.rng() * 6.28 })
    } else if (l === "floor" || l === "tiles" || l === "plank") {
      if (roll < 0.5) ctx.decals.push({ key: roll < 0.25 ? "oil" : "paper", x, y: 0, z, w: 1.2, h: 1.2, face: "up", color: 0xffffff, rot: ctx.rng() * 6.28 })
    } else if (roll < 0.25 && look.props.night < 0.5) ctx.weeds.push([x, z, 1])
  }

  // --- solids, props, buildings, perimeter -------------------------------------------------------------------
  for (const s of layout.solids) buildSolid(ctx, s)
  for (const p of layout.props ?? []) buildProp(ctx, p)
  buildFences(ctx)
  buildBuildingDetails(ctx)
  buildPerimeter(ctx)
  for (const bd of layout.buildings ?? []) for (const [ax, az, bx, bz] of [[bd.x0, bd.z0 - 0.3, bd.x1, bd.z0 - 0.3], [bd.x0, bd.z1 + 0.3, bd.x1, bd.z1 + 0.3], [bd.x0 - 0.3, bd.z0, bd.x0 - 0.3, bd.z1], [bd.x1 + 0.3, bd.z0, bd.x1 + 0.3, bd.z1]]) {
    const len = Math.hypot(bx - ax, bz - az)
    for (let s = 0.5; s < len; s += 1.2 + ctx.rng() * 2.4) if (ctx.rng() < 0.55) ctx.weeds.push([ax + (bx - ax) * s / len, az + (bz - az) * s / len, 0.6 + ctx.rng() * 0.6])
  }

  // weeds (crossed alpha quads)
  {
    const fb = ctx.B("foliage"), base = new THREE.Color(look.foliage)
    const keep = high ? 1 : 0.4
    for (const [x, z, s] of ctx.weeds) {
      if (ctx.rng() > keep) continue
      const l = lookAt(x, z)
      if (interior.has(l) || l === "pad" || ((l === "asphalt" || l === "quay") && ctx.rng() < 0.6) || solidAt(x, z, 0.05)) continue
      const cell = Math.floor(ctx.rng() * 4), cu = (cell % 2) * 0.5, cv = cell < 2 ? 0.5 : 0
      const w = 0.32 * s * (0.8 + ctx.rng() * 0.6), h = 0.5 * s * (0.7 + ctx.rng() * 0.6), a = ctx.rng() * Math.PI
      const col = base.clone().multiplyScalar(0.7 + ctx.rng() * 0.5)
      for (const rot of [a, a + Math.PI / 2]) {
        const dx = Math.cos(rot) * w, dz = Math.sin(rot) * w
        fb.quad([x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + dx, h, z + dz], [x - dx, h, z - dz], [0, 1, 0], [cu, cv, cu + 0.5, cv, cu + 0.5, cv + 0.5, cu, cv + 0.5], col, [0.6, 0.6, 1, 1])
      }
    }
  }

  // decals (atlas built from generic decals + the map's text signs) and windows
  for (const [k, [kind, text]] of ctx.texts) atlasExtra.set(k, textDecal(kind, text))
  const atlas = decalAtlas(atlasExtra, high ? 64 : 48)
  atlasTex = own(new THREE.CanvasTexture(atlas.canvas)); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = high ? 8 : 2
  emitDecals(ctx, atlas.rects)
  emitWindows(ctx)

  // --- meshes from batches ----------------------------------------------------------------------------------
  const noShadow = new Set(["decal", "foliage", "fence", "lamp", "window", "concertina"])
  for (const [key, batch] of batches) {
    const geo = batch.build(); if (!geo) continue
    own(geo)
    const mesh = new THREE.Mesh(geo, material(key))
    mesh.name = key
    const ground = key.startsWith("g:")
    mesh.receiveShadow = high && key !== "lamp"
    mesh.castShadow = high && !ground && !noShadow.has(key)
    if (key === "decal") mesh.renderOrder = 1
    group.add(mesh)
  }

  // instanced props
  const instGeo: Record<InstKind, () => THREE.BufferGeometry> = {
    barrel: () => { const g = new THREE.CylinderGeometry(0.3, 0.3, 0.9, high ? 14 : 8); scaleUv(g, 1.9, 0.9); return g },
    sandbag: () => pillow(),
    post: () => new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0),
    bollard: () => { const g = new THREE.CylinderGeometry(0.22, 0.28, 0.55, 10).translate(0, 0.275, 0); return g },
    chainpost: () => new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0),
  }
  for (const [kind, list] of instances) {
    const g = own(instGeo[kind]())
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3))
    const mesh = new THREE.InstancedMesh(g, material(kind === "sandbag" ? "burlap" : "metal"), list.length)
    const c = new THREE.Color()
    list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, c.set(it.c)) })
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = high && kind !== "post"; mesh.receiveShadow = high
    mesh.computeBoundingSphere()
    group.add(mesh)
    disposables.push({ dispose: () => mesh.dispose() })
  }

  // wires, cables, crane rigging
  if (ctx.lines.length) {
    const g = own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(ctx.lines, 3))
    const lines = new THREE.LineSegments(g, own(new THREE.LineBasicMaterial({ color: theme === "night" ? 0x0c0e12 : 0x1c1f24 })))
    group.add(lines)
  }

  // --- light effects ----------------------------------------------------------------------------------------
  const skyline = createSkyline({ ...look.skyline, seed: MISSIONS[missionId].seed })
  own(skyline.mesh.geometry); own(skyline.mesh.material as THREE.Material)
  const glowMesh = glow.build(fx), poolMesh = pool.build(fx), coneMesh = high ? cone.build(fx) : null
  for (const m of [glowMesh, poolMesh, coneMesh]) if (m) { own(m.geometry); own(m.material as THREE.Material); group.add(m) }
  // the skyline beacons sit ~300 m away and follow the camera like the skyline: put them in their own glow mesh
  const farGlow = new GlowBatch()
  for (const [x, y, z] of skyline.beacons) farGlow.add(x, y, z, 1.5, 0xff3a22, 1.4, [3, 0.45, x])
  const farGlowMesh = farGlow.build(fx, { fog: false, grow: 0 })
  if (farGlowMesh) {
    own(farGlowMesh.geometry); own(farGlowMesh.material as THREE.Material)
    const mat = farGlowMesh.material as THREE.ShaderMaterial
    farGlowMesh.renderOrder = -998
    mat.vertexShader = mat.vertexShader.replace("gl_Position = projectionMatrix * mv;", "gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.99997;")
  }

  // searchlights (blacksite): beams, ground spots and housings sweep in the vertex shader
  const searchMeshes = buildSearchlights(ctx.searchlights, fx, own)
  for (const m of searchMeshes) group.add(m)

  // radar dishes
  const radars: THREE.Object3D[] = []
  for (const [x, y, z] of ctx.radars) {
    const dish = new THREE.Group(); dish.position.set(x, y + 1.2, z)
    const geo = own(new THREE.SphereGeometry(3.6, high ? 20 : 12, 8, 0, Math.PI * 2, 0, 0.62)); geo.scale(1, 0.5, 1); geo.rotateX(Math.PI / 2); geo.translate(0, 2.3, 0)
    const dm = own(new THREE.MeshStandardMaterial({ color: 0xd8dcdc, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }))
    const d = new THREE.Mesh(geo, dm); d.castShadow = high; dish.add(d)
    const yoke = own(new THREE.BoxGeometry(0.5, 2.4, 0.5)); const ym = new THREE.Mesh(yoke, dm); ym.position.set(0, 1.2, -0.6); dish.add(ym)
    const horn = own(new THREE.BoxGeometry(0.2, 0.2, 2.6)); const hm = new THREE.Mesh(horn, dm); hm.position.set(0, 2.3, 2.1); dish.add(hm)
    group.add(dish); radars.push(dish)
  }

  // --- sky, skyline, water -------------------------------------------------------------------------------------
  const sky = createSky(look.sky, fx.time); own(sky.geometry); own(sky.material as THREE.Material)
  group.add(sky, skyline.mesh)
  if (farGlowMesh) group.add(farGlowMesh)
  if (layout.water && look.water) {
    const lampPos = (layout.props ?? []).filter(p => p.kind === "mast" && p.x > 20).map(p => [p.x + 1, (p.h ?? 18) - 0.6, p.z] as [number, number, number])
    lampPos.push([134.5, 11.6, -80], [134.5, 11.6, -10])
    const w = createWater({ ...look.water, lamps: lampPos }, layout.water.level, fx.time, quality)
    own(w.geometry); own(w.material as THREE.Material); group.add(w)
  }

  // --- lights ------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity); group.add(hemi)
  const sunDir = new THREE.Vector3(...(look.sun.dir ?? look.sky.sunDir)).normalize()
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity)
  const half = 46, mapSize = 2048
  sun.castShadow = high
  sun.shadow.mapSize.set(mapSize, mapSize)
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 420 })
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = theme === "dusk" ? 0.06 : 0.035
  sun.position.copy(sunDir).multiplyScalar(200); group.add(sun, sun.target)
  const realLights: Array<{ light: THREE.PointLight | THREE.SpotLight; base: number; flicker: boolean }> = []
  for (const l of (layout.lights ?? []).slice(0, high ? 4 : 1)) realLights.push(makeLight(l, group))

  // --- extraction zones ------------------------------------------------------------------------------------------
  const padTex = tex("padmark", false), smokeTex = tex("smoke", false)
  const evac = createExtractions(layout, fx, padTex, smokeTex, look.props.night, quality)
  group.add(evac.group)

  disposeTemplates()
  scene.add(group)

  // --- per-frame update (allocation-free) -------------------------------------------------------------------
  const lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
  const lu = new THREE.Vector3().crossVectors(sunDir, lr).normalize()
  const texel = (2 * half) / mapSize
  const fwd = new THREE.Vector3(), center = new THREE.Vector3()
  const radarSpeed = 0.55

  return {
    layout, theme, group, obstacles, nav, coverPoints, exposure: look.exposure,
    surfaceAt(x, z) {
      const c = Math.floor(x - gx0), r = Math.floor(z - gz0)
      if (c < 0 || r < 0 || c >= gcols || r >= grows) return def.surface
      return SURFACES[surfGrid[r * gcols + c]]
    },
    update(dt, time, camera) {
      fx.time.value = time
      const cp = camera.position
      sky.position.copy(cp)
      skyline.mesh.position.set(cp.x, cp.y - 1.6, cp.z)
      if (farGlowMesh) farGlowMesh.position.set(cp.x, cp.y - 1.6, cp.z)
      if (sun.castShadow) {
        camera.getWorldDirection(fwd); fwd.y = 0
        const fl = fwd.length(); if (fl > 1e-4) fwd.multiplyScalar(16 / fl)
        center.set(cp.x + fwd.x, 0, cp.z + fwd.z)
        const px = Math.round(center.dot(lr) / texel) * texel, py = Math.round(center.dot(lu) / texel) * texel, pz = center.dot(sunDir)
        center.copy(lr).multiplyScalar(px).addScaledVector(lu, py).addScaledVector(sunDir, pz)
        sun.target.position.copy(center); sun.position.copy(center).addScaledVector(sunDir, 200)
        sun.target.updateMatrixWorld()
      }
      for (let i = 0; i < realLights.length; i++) {
        const r = realLights[i]
        if (r.flicker) r.light.intensity = r.base * (0.93 + 0.07 * Math.sin(time * 11 + i * 3.1) * Math.sin(time * 4.3 + i))
      }
      for (let i = 0; i < radars.length; i++) radars[i].rotation.y = time * radarSpeed + i
      evac.update(dt, time)
    },
    setExtraction(id, state, progress) { evac.set(id, state, progress) },
    dispose() {
      scene.remove(group)
      evac.dispose()
      sun.dispose(); hemi.dispose()
      for (const r of realLights) r.light.dispose()
      for (const d of disposables) d.dispose()
      disposables.length = 0
    },
  }
}

function makeLight(l: MapLight, group: THREE.Group): { light: THREE.PointLight | THREE.SpotLight; base: number; flicker: boolean } {
  if (l.tx !== undefined && l.tz !== undefined) {
    const s = new THREE.SpotLight(l.color, l.intensity, l.distance, l.angle ?? 0.6, 0.55, 2)
    s.position.set(l.x, l.y, l.z); s.target.position.set(l.tx, l.ty ?? 0, l.tz)
    group.add(s, s.target)
    return { light: s, base: l.intensity, flicker: false }
  }
  const p = new THREE.PointLight(l.color, l.intensity, l.distance, 2)
  p.position.set(l.x, l.y, l.z); group.add(p)
  return { light: p, base: l.intensity, flicker: true }
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

function buildSearchlights(list: Array<{ x: number; y: number; z: number; rot: number; amp: number; dist: number; phase: number }>, fx: FxUniforms, own: <T extends { dispose(): void }>(d: T) => T): THREE.Mesh[] {
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
    beams.add(g, I, raw(0xd8e4ff).multiplyScalar(0.55)); g.dispose()
    const n = beams.extras[before].attributes.position.count
    for (let i = 0; i < n; i++) { attrs.lamp.push(s.x, s.y, s.z); attrs.sweep.push(s.rot, s.amp, 0.35 + s.phase * 0.03, s.phase); attrs.pitch.push(pitch) }
    const sp = new THREE.PlaneGeometry(2, 2); sp.rotateX(-Math.PI / 2)
    spots.add(sp, I, raw(0xc8d8ff).multiplyScalar(0.55)); sp.dispose()
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

