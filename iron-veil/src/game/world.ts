/**
 * world.ts — builds the 3D environment: the big quarantine zone or the player's base (contract in zone.ts).
 * CONTRACT (used by raid.ts, enemies.ts, zombies.ts):
 *  - createWorld(kind, scene, quality, opts) adds world.group to the scene and sets scene.background/fog + lights.
 *  - obstacles / collision: every blocking box (CollisionWorld index — use it for all queries); nav: NavGrid over
 *    layout.bounds (agent radius 0.45 m, 1 m cells); coverPoints: standing spots next to solids ≥ 1 m tall.
 *  - lightLevel 0..1 (viewmodel lighting), visionScale (enemy sight multiplier for the time of day), night flag.
 *  - surfaceAt / districtAt / indoor: per-position queries for footsteps, HUD area name, audio reverb.
 *  - update(dt, time, camera): sky follows the camera, chunk visibility, animated props.
 *  - setExtraction(id, state, progress): evac zone visuals ("hidden" for exfils closed this raid).
 *  - setStructures(levels) (base only): rebuilds structure meshes and their obstacles on the plots (and the nav
 *    grid/collision in those areas).
 *  - dispose(): removes the group from the scene and frees every GPU resource it created (incl. shadow maps).
 *  - zoneLayout() / baseLayout(): the (cached, deterministic) layouts without building meshes — the UI reads
 *    insertions, extractions and districts from them for raid planning.
 * PLACEHOLDER: the environment pass replaces this with authored districts, textures and merged geometry.
 */
import * as THREE from "three"
import { TIMES, type StructureId, type TimeOfDay } from "./baseData"
import { CollisionWorld, type Obstacle } from "./collision"
import { getLayout } from "./maps"
import { NavGrid } from "./nav"
import type { MissionId, Surface, ThemeId } from "./types"
import type { AnyLayout, BaseLayout, District, WorldKind, WorldOptions, ZoneLayout } from "./zone"
import type { MapLayout } from "./maps"

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
  surfaceAt(x: number, z: number): Surface
  districtAt(x: number, z: number): District | null
  indoor(x: number, z: number): boolean
  update(dt: number, time: number, camera: THREE.Camera): void
  setExtraction(id: string, state: ExtractionState, progress: number): void
  setStructures(levels: Partial<Record<StructureId, number>>): void
  dispose(): void
}

const SKY: Record<TimeOfDay, { top: number; horizon: number; sun: number; sunI: number; hemi: number; hemiI: number; fog: [number, number]; exposure: number; light: number }> = {
  dawn: { top: 0x2a3550, horizon: 0xc98d72, sun: 0xffc7a0, sunI: 1.4, hemi: 0x9aa6c0, hemiI: 1.2, fog: [40, 190], exposure: 1.1, light: 0.6 },
  day: { top: 0x4b78a8, horizon: 0xb9c8cf, sun: 0xfff3e0, sunI: 2.6, hemi: 0xc6d8e6, hemiI: 1.8, fog: [70, 260], exposure: 1.0, light: 1 },
  dusk: { top: 0x1d353e, horizon: 0xb08362, sun: 0xffc896, sunI: 1.9, hemi: 0x9dbbc0, hemiI: 1.6, fog: [50, 210], exposure: 1.05, light: 0.8 },
  night: { top: 0x02040a, horizon: 0x0b1220, sun: 0x8fa6d6, sunI: 0.45, hemi: 0x34486a, hemiI: 0.55, fog: [16, 90], exposure: 1.25, light: 0.22 },
}

export function createWorld(kind: WorldKind, scene: THREE.Scene, quality: "high" | "low", opts: WorldOptions = {}): World {
  const time: TimeOfDay = kind === "base" ? "dusk" : opts.time ?? "dusk"
  const layout: AnyLayout = kind === "zone" ? zoneLayout() : baseLayout()
  const sky = SKY[time]
  const group = new THREE.Group(); group.name = kind === "zone" ? "Sperrzone" : "Basis"
  const disposables: Array<{ dispose(): void }> = []
  const obstacles: Obstacle[] = []
  const horizon = new THREE.Color(sky.horizon)
  scene.background = horizon.clone(); scene.fog = new THREE.Fog(horizon, sky.fog[0], sky.fog[1])
  const hemi = new THREE.HemisphereLight(sky.hemi, 0x303326, sky.hemiI); group.add(hemi)
  const sun = new THREE.DirectionalLight(sky.sun, sky.sunI)
  sun.position.set(-28, 45, 20); sun.castShadow = quality === "high"
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 160 }); sun.shadow.bias = -0.0003
  group.add(sun, sun.target)
  const skyGeo = new THREE.SphereGeometry(400, 24, 12); disposables.push(skyGeo)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: new THREE.Color(sky.top) }, bottom: { value: horizon } },
    vertexShader: "varying vec3 vPos; void main(){vPos=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}",
    fragmentShader: "uniform vec3 top;uniform vec3 bottom;varying vec3 vPos;void main(){float h=clamp(normalize(vPos).y*1.6,0.,1.);gl_FragColor=vec4(mix(bottom,top,h),1.);}",
  }); disposables.push(skyMat)
  const skyMesh = new THREE.Mesh(skyGeo, skyMat); skyMesh.renderOrder = -10; skyMesh.frustumCulled = false; group.add(skyMesh)
  const groundGeo = new THREE.PlaneGeometry(1600, 1600); disposables.push(groundGeo)
  const groundMat = new THREE.MeshStandardMaterial({ color: kind === "base" ? 0x55584c : 0x4e5a45, roughness: 1 }); disposables.push(groundMat)
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground)

  const mats = new Map<string, THREE.MeshStandardMaterial>()
  const colors: Record<string, number> = { house: 0x8a7d6a, warehouse: 0x4f5946, container: 0x765044, wall: 0x6d6d66, bunker: 0x5c6157, tree: 0x2f4a2a, rock: 0x6a6a64, lab: 0xb8bcb8, fence: 0x55524c, structure: 0x7c6a52 }
  const matFor = (style: string) => {
    let m = mats.get(style)
    if (!m) { m = new THREE.MeshStandardMaterial({ color: colors[style] ?? 0x5a5f55, roughness: 0.85 }); mats.set(style, m); disposables.push(m) }
    return m
  }
  const solidMeshes = new THREE.Group(); group.add(solidMeshes)
  const addSolid = (s: { x: number; z: number; w: number; d: number; h: number; y?: number; style: string }, target: THREE.Object3D = solidMeshes): Obstacle => {
    const geo = new THREE.BoxGeometry(s.w, s.h, s.d); disposables.push(geo)
    const mesh = new THREE.Mesh(geo, matFor(s.style)); mesh.position.set(s.x, (s.y ?? 0) + s.h / 2, s.z); mesh.castShadow = mesh.receiveShadow = true; target.add(mesh)
    const o: Obstacle = { minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2, height: (s.y ?? 0) + s.h, minY: s.y ?? 0, surface: s.style === "container" || s.style === "fence" ? "metal" : s.style === "tree" ? "wood" : "concrete" }
    obstacles.push(o); return o
  }
  for (const s of layout.solids) addSolid(s)
  const b = layout.bounds
  obstacles.push(
    { minX: b.minX - 8, maxX: b.minX, minZ: b.minZ - 8, maxZ: b.maxZ + 8, height: 6 }, { minX: b.maxX, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.maxZ + 8, height: 6 },
    { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.minZ, height: 6 }, { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.maxZ, maxZ: b.maxZ + 8, height: 6 },
  )
  const collision = new CollisionWorld(obstacles)

  // extraction markers
  const extractions = new Map<string, { group: THREE.Group; ring: THREE.Mesh; mat: THREE.MeshBasicMaterial; beam: THREE.Mesh }>()
  if (layout.kind === "zone") for (const e of layout.extractions) {
    const g = new THREE.Group(); g.position.set(e.x, 0.05, e.z)
    const ringGeo = new THREE.RingGeometry(e.radius - 0.4, e.radius, 48); disposables.push(ringGeo)
    const mat = new THREE.MeshBasicMaterial({ color: 0xe9b85e, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }); disposables.push(mat)
    const ring = new THREE.Mesh(ringGeo, mat); ring.rotation.x = -Math.PI / 2; g.add(ring)
    const beamGeo = new THREE.CylinderGeometry(0.4, 0.4, 60, 8, 1, true); disposables.push(beamGeo)
    const beam = new THREE.Mesh(beamGeo, mat); beam.position.y = 30; g.add(beam)
    group.add(g); extractions.set(e.id, { group: g, ring, mat, beam })
  }

  // base structures (rebuilt on demand)
  const structureGroup = new THREE.Group(); group.add(structureGroup)
  let structureObstacles: Obstacle[] = []
  let nav = new NavGrid(layout.bounds, obstacles, 0.45, 1)
  const setStructures = (levels: Partial<Record<StructureId, number>>) => {
    if (layout.kind !== "base") return
    for (const o of structureObstacles) { collision.remove(o); obstacles.splice(obstacles.indexOf(o), 1) }
    structureObstacles = []
    structureGroup.clear()
    for (const plot of layout.plots) {
      const lvl = levels[plot.structure] ?? 0
      if (lvl <= 0) {
        const geo = new THREE.BoxGeometry(plot.w, 0.08, plot.d); disposables.push(geo)
        const m = new THREE.Mesh(geo, matFor("fence")); m.position.set(plot.x, 0.04, plot.z); structureGroup.add(m)
        continue
      }
      const h = 1.6 + lvl * 1.1
      const o = addSolid({ x: plot.x, z: plot.z, w: plot.w * (0.6 + lvl * 0.13), d: plot.d * (0.6 + lvl * 0.13), h, style: "structure" }, structureGroup)
      collision.add(o); structureObstacles.push(o)
    }
    nav = new NavGrid(layout.bounds, obstacles, 0.45, 1)
    world.nav = nav
  }

  const coverPoints: CoverPoint[] = []
  for (const o of obstacles) {
    if (o.height < 1 || o.maxX - o.minX > 30 || (o.minY ?? 0) > 1) continue
    const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2
    for (const [nx, nz, x, z] of [[1, 0, o.maxX + 0.7, cz], [-1, 0, o.minX - 0.7, cz], [0, 1, cx, o.maxZ + 0.7], [0, -1, cx, o.minZ - 0.7]]) if (nav.walkable(x, z)) coverPoints.push({ x, z, height: o.height, nx, nz })
  }

  scene.add(group)
  const districts = layout.kind === "zone" ? layout.districts : []
  const world: World = {
    kind, layout, time, theme: time === "night" ? "night" : "dusk", group, obstacles, collision, nav, coverPoints,
    exposure: sky.exposure, lightLevel: sky.light, visionScale: TIMES[time].visionScale, night: time === "night",
    surfaceAt: (x, z) => (Math.abs(x % 100) < 6 || Math.abs(z % 100) < 6 ? "asphalt" : "grass"),
    districtAt: (x, z) => districts.find(d => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) ?? null,
    indoor: () => false,
    update: (_dt, t, camera) => {
      skyMesh.position.copy(camera.position)
      sun.position.set(camera.position.x - 28, 45, camera.position.z + 20); sun.target.position.set(camera.position.x, 0, camera.position.z)
      for (const e of extractions.values()) e.ring.rotation.z = t * 0.3
    },
    setExtraction: (id, state) => {
      const e = extractions.get(id); if (!e) return
      e.group.visible = state !== "hidden"
      e.mat.color.setHex(state === "locked" ? 0xe9b85e : state === "called" ? 0xff5a3a : 0x66e0b4)
    },
    setStructures,
    dispose: () => { scene.remove(group); sun.dispose(); for (const d of disposables) d.dispose() },
  }
  if (layout.kind === "base") setStructures(opts.structures ?? {})
  return world
}

// ───────────────────────────── placeholder layouts ─────────────────────────────

let zoneCache: ZoneLayout | null = null, baseCache: BaseLayout | null = null
export function zoneLayout(): ZoneLayout { return zoneCache ??= placeholderZone() }
export function baseLayout(): BaseLayout { return baseCache ??= placeholderBase() }

function placeholderZone(): ZoneLayout {
  if (zoneCache) return zoneCache
  const solids: ZoneLayout["solids"] = []
  const lootSpots: ZoneLayout["lootSpots"] = []
  const districts: District[] = [
    { id: "town", name: "Altstadt", minX: -100, maxX: 100, minZ: -100, maxZ: 100, danger: 1 },
    { id: "industry", name: "Industriegebiet", minX: 100, maxX: 300, minZ: -100, maxZ: 100, danger: 2 },
    { id: "harbor", name: "Hafen", minX: -100, maxX: 100, minZ: 100, maxZ: 300, danger: 2 },
    { id: "military", name: "Militäranlage", minX: 100, maxX: 300, minZ: -300, maxZ: -100, danger: 3 },
    { id: "lab", name: "Forschungslabor", minX: -100, maxX: 100, minZ: -300, maxZ: -100, danger: 3 },
    { id: "farm", name: "Bauernhof", minX: -300, maxX: -100, minZ: -100, maxZ: 100, danger: 1 },
    { id: "station", name: "Bahnhof", minX: -300, maxX: -100, minZ: 100, maxZ: 300, danger: 2 },
    { id: "forest", name: "Nordwald", minX: -300, maxX: -100, minZ: -300, maxZ: -100, danger: 1 },
    { id: "quarry", name: "Steinbruch", minX: 100, maxX: 300, minZ: 100, maxZ: 300, danger: 2 },
  ]
  let seed = 9
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const cats: Record<string, ZoneLayout["lootSpots"][number]["category"]> = { town: "civil", industry: "industrial", harbor: "industrial", military: "military", lab: "lab", farm: "food", station: "civil", forest: "civil", quarry: "industrial" }
  for (const d of districts) {
    const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2
    const style = d.id === "forest" ? "tree" : d.id === "harbor" ? "container" : d.id === "military" ? "bunker" : d.id === "lab" ? "lab" : d.id === "industry" ? "warehouse" : "house"
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if ((i === 0 && j === 0) || rnd() < 0.25) continue
      const x = cx + i * 32 + (rnd() - 0.5) * 6, z = cz + j * 32 + (rnd() - 0.5) * 6
      const w = style === "tree" ? 1 : 8 + rnd() * 8, dd = style === "tree" ? 1 : 8 + rnd() * 8
      solids.push({ x, z, w, d: dd, h: style === "tree" ? 9 : 3 + rnd() * 5, style })
      lootSpots.push({ x: x + w / 2 + 1.2, z, tier: (d.danger - 1 + (rnd() < 0.2 ? 1 : 0)) as 0 | 1 | 2, category: cats[d.id], container: d.id === "military" ? "weaponcase" : d.id === "lab" ? "medcab" : rnd() < 0.5 ? "crate" : "cabinet", indoor: false })
    }
  }
  zoneCache = {
    kind: "zone", bounds: { minX: -310, maxX: 310, minZ: -310, maxZ: 310 }, districts, solids, lootSpots,
    mercCamps: [{ id: "camp_mil", x: 200, z: -200, radius: 25, squad: 5, patrol: [{ x: 190, z: -190 }, { x: 215, z: -210 }] }, { id: "camp_ind", x: 200, z: 0, radius: 20, squad: 4, patrol: [{ x: 190, z: 10 }, { x: 212, z: -8 }] }, { id: "camp_harbor", x: 0, z: 200, radius: 20, squad: 3, patrol: [{ x: -10, z: 190 }, { x: 12, z: 212 }] }],
    infectedZones: districts.map(d => ({ district: d.id, x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2, radius: 90, density: d.danger * 0.0009 })),
    insertions: [
      { id: "south_road", name: "Südstraße", x: 0, z: 295, yaw: 0, district: "harbor", hq: 1 }, { id: "west_field", name: "Westfelder", x: -295, z: 0, yaw: -Math.PI / 2, district: "farm", hq: 1 },
      { id: "north_wood", name: "Nordwald", x: -200, z: -295, yaw: Math.PI, district: "forest", hq: 2 }, { id: "east_rail", name: "Ostgleis", x: 295, z: 200, yaw: Math.PI / 2, district: "quarry", hq: 2 },
    ],
    extractions: [
      { id: "heli_town", name: "Landeplatz Altstadt", x: 40, z: -40, radius: 5, kind: "heli", requirement: null, chance: 1, holdTime: 12 },
      { id: "boat", name: "Bootsanleger", x: 60, z: 290, radius: 4, kind: "boat", requirement: { item: "fuel" }, chance: 0.8, holdTime: 6 },
      { id: "tunnel", name: "Versorgungstunnel", x: -200, z: 150, radius: 3, kind: "tunnel", requirement: { item: "key_tunnel" }, chance: 1, holdTime: 3 },
      { id: "gate", name: "Grenzposten Ost", x: 300, z: -60, radius: 4, kind: "gate", requirement: { money: 600 }, chance: 0.7, holdTime: 4 },
      { id: "heli_farm", name: "Feld-Landezone", x: -220, z: -20, radius: 6, kind: "heli", requirement: null, chance: 0.6, holdTime: 14 },
    ],
    objectives: [{ id: "generator", name: "Notstromgenerator", x: -200, z: 200, holdTime: 6 }, { id: "radio_mast", name: "Funkmast", x: 220, z: -220, holdTime: 6 }, { id: "pump", name: "Wasserpumpe", x: -190, z: 10, holdTime: 5 }, { id: "lab_terminal", name: "Laborterminal", x: 10, z: -200, holdTime: 8 }],
    bossArena: { x: 0, z: -230, radius: 20 },
    airdropSpots: [{ x: 0, z: 40 }, { x: -150, z: -150 }, { x: 150, z: 150 }],
    labels: districts.map(d => ({ name: d.name, x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 })),
  }
  return zoneCache
}

function placeholderBase(): BaseLayout {
  const solids: BaseLayout["solids"] = []
  const half = 38
  for (const [x, z, w, d] of [[0, -half, 76, 1], [-half, 0, 1, 76], [half, 0, 1, 76], [-22, half, 32, 1], [22, half, 32, 1]] as const) solids.push({ x, z, w, d, h: 3, style: "wall" })
  const ids: StructureId[] = ["hq", "bunks", "storage", "workbench", "workshop", "armory", "clinic", "kitchen", "generator", "lab", "radio", "walls", "tower"]
  const plots = ids.map((structure, i) => ({ structure, x: -24 + (i % 5) * 12, z: -24 + Math.floor(i / 5) * 14, w: 8, d: 8, yaw: 0 }))
  return {
    kind: "base", bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 75 }, solids, spawn: { x: 0, z: 28, yaw: 0 }, plots,
    stations: [
      { id: "trader", name: "Händler", x: -8, z: 22 }, { id: "stash", name: "Lager & Ausrüstung", x: 8, z: 22 }, { id: "radio", name: "Funkstation · Einsatzplanung", x: 0, z: 16 },
      { id: "build", name: "Bauplan", x: -16, z: 16 }, { id: "workbench", name: "Werkbank", x: 16, z: 16 }, { id: "armory", name: "Waffenwerkstatt", x: 22, z: 22 }, { id: "gate", name: "Zur Sperrzone", x: 0, z: 36 },
    ],
    attackSpawns: [{ x: -30, z: 68 }, { x: 30, z: 68 }, { x: 0, z: 72 }], gate: { x: 0, z: 38 },
  }
}

/** Legacy accessor for the original operation areas (dev bench). */
export function legacyLayout(id: MissionId): MapLayout { return getLayout(id) }
