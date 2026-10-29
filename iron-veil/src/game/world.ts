/**
 * world.ts — builds the 3D environment for a mission from its MapLayout (maps.ts).
 * CONTRACT (used by raid.ts and enemies.ts):
 *  - createWorld(mission, scene, quality) adds world.group to the scene and sets scene.background/fog + lights.
 *  - obstacles: one AABB per layout solid plus perimeter walls just outside layout.bounds.
 *  - nav: NavGrid over layout.bounds (agent radius 0.45 m, 1 m cells).
 *  - coverPoints: standing spots right next to solids >= 1 m tall (normal points away from the solid).
 *  - surfaceAt(x, z): ground material for footstep sounds.
 *  - update(dt, time, camera): per frame — sky follows the camera, animated props.
 *  - setExtraction(id, state, progress): drives the evac zone visuals ("hidden" for zones not used this raid).
 *  - dispose(): removes the group from the scene and frees GPU resources it created.
 * PLACEHOLDER: the environment pass replaces this with themed, merged geometry.
 */
import * as THREE from "three"
import { MISSIONS } from "./data"
import type { Obstacle } from "./collision"
import { getLayout, type MapLayout } from "./maps"
import { NavGrid } from "./nav"
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

export function createWorld(missionId: MissionId, scene: THREE.Scene, quality: "high" | "low"): World {
  const layout = getLayout(missionId)
  const theme = MISSIONS[missionId].theme
  const group = new THREE.Group(); group.name = "Einsatzgebiet"
  const disposables: Array<{ dispose(): void }> = []
  const obstacles: Obstacle[] = []
  const night = theme === "night"
  const horizon = new THREE.Color(night ? 0x0b1220 : theme === "harbor" ? 0x3a4a5c : 0xb08362)
  scene.background = horizon.clone()
  scene.fog = new THREE.Fog(horizon, night ? 18 : 40, night ? 70 : 120)

  const hemi = new THREE.HemisphereLight(night ? 0x34486a : 0x9dbbc0, 0x303326, night ? 0.6 : 2.0); group.add(hemi)
  const sun = new THREE.DirectionalLight(night ? 0x8fa6d6 : 0xffe3bc, night ? 0.5 : 2.2)
  sun.position.set(-28, 45, 20); sun.castShadow = quality === "high"
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 120 }); sun.shadow.bias = -0.0003
  group.add(sun)

  const skyGeo = new THREE.SphereGeometry(400, 24, 12); disposables.push(skyGeo)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: new THREE.Color(night ? 0x02040a : 0x1d353e) }, bottom: { value: horizon } },
    vertexShader: "varying vec3 vPos; void main(){vPos=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}",
    fragmentShader: "uniform vec3 top;uniform vec3 bottom;varying vec3 vPos;void main(){float h=clamp(normalize(vPos).y*1.6,0.,1.);gl_FragColor=vec4(mix(bottom,top,h),1.);}",
  }); disposables.push(skyMat)
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky)

  const groundGeo = new THREE.PlaneGeometry(400, 400); disposables.push(groundGeo)
  const groundMat = new THREE.MeshStandardMaterial({ color: night ? 0x2a302c : 0x50564f, roughness: 1 }); disposables.push(groundMat)
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground)

  const mats = new Map<string, THREE.MeshStandardMaterial>()
  const matFor = (style: string) => {
    let m = mats.get(style)
    if (!m) { m = new THREE.MeshStandardMaterial({ color: style === "container" ? 0x765044 : 0x4f5946, roughness: 0.85 }); mats.set(style, m); disposables.push(m) }
    return m
  }
  for (const s of layout.solids) {
    const geo = new THREE.BoxGeometry(s.w, s.h, s.d); disposables.push(geo)
    const mesh = new THREE.Mesh(geo, matFor(s.style)); mesh.position.set(s.x, (s.y ?? 0) + s.h / 2, s.z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh)
    obstacles.push({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2, height: (s.y ?? 0) + s.h, minY: s.y ?? 0 })
  }
  const b = layout.bounds
  obstacles.push(
    { minX: b.minX - 8, maxX: b.minX, minZ: b.minZ - 8, maxZ: b.maxZ + 8, height: 6 }, { minX: b.maxX, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.maxZ + 8, height: 6 },
    { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.minZ, height: 6 }, { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.maxZ, maxZ: b.maxZ + 8, height: 6 },
  )

  const extractions = new Map<string, { group: THREE.Group; ring: THREE.Mesh; mat: THREE.MeshBasicMaterial }>()
  for (const e of layout.extractions) {
    const g = new THREE.Group(); g.position.set(e.x, 0.05, e.z)
    const ringGeo = new THREE.RingGeometry(e.radius - 0.4, e.radius, 48); disposables.push(ringGeo)
    const mat = new THREE.MeshBasicMaterial({ color: 0xe9b85e, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }); disposables.push(mat)
    const ring = new THREE.Mesh(ringGeo, mat); ring.rotation.x = -Math.PI / 2; g.add(ring); group.add(g)
    extractions.set(e.id, { group: g, ring, mat })
  }

  const nav = new NavGrid(layout.bounds, obstacles, 0.45, 1)
  const coverPoints: CoverPoint[] = []
  for (const o of obstacles) {
    if (o.height < 1 || o.maxX - o.minX > 30) continue
    const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2
    for (const [nx, nz, x, z] of [[1, 0, o.maxX + 0.7, cz], [-1, 0, o.minX - 0.7, cz], [0, 1, cx, o.maxZ + 0.7], [0, -1, cx, o.minZ - 0.7]]) {
      if (nav.walkable(x, z)) coverPoints.push({ x, z, height: o.height, nx, nz })
    }
  }

  scene.add(group)
  return {
    layout, theme, group, obstacles, nav, coverPoints, exposure: night ? 1.25 : 1.05,
    surfaceAt: () => "asphalt",
    update: (_dt, time, camera) => {
      sky.position.copy(camera.position)
      for (const e of extractions.values()) e.ring.rotation.z = time * 0.3
    },
    setExtraction: (id, state) => {
      const e = extractions.get(id); if (!e) return
      e.group.visible = state !== "hidden"
      e.mat.color.setHex(state === "locked" ? 0xe9b85e : 0x66e0b4)
    },
    dispose: () => { scene.remove(group); for (const d of disposables) d.dispose() },
  }
}
