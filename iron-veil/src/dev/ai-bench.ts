/**
 * ai-bench.ts — soldier model bench (dev-ai.html, not shipped). Renders a mission's lighting with hand-driven soldier
 * models so poses, gear and effects can be inspected up close. window.__bench (for Playwright):
 *
 *   dev-ai.html?mission=greyzone
 *   __bench.load(mission)                         world lighting / sky / ground of that mission
 *   __bench.add(kind, x, z, yaw) → index          soldier at (x, z) facing yaw (0 = -Z)
 *   __bench.drive(i, { aim, crouch, velX, velZ, aimYaw, aimPitch, look, alert, turnRate })
 *   __bench.travel(i, true)                       move the soldier by its velocity while stepping
 *   __bench.step(seconds)                         advance all soldiers at 60 Hz and render
 *   __bench.fire(i) / hit(i, dx, dz) / die(i, fallX, fallZ) / mark(i, "?"|"!"|"") / laser(i, on, length)
 *   __bench.cam(x, y, z, tx, ty, tz, fov?)        free camera
 *   __bench.info()                                draw calls / triangles of the last frame
 *   __bench.spawnSpot()                           an open spot (player spawn of the mission)
 */
import * as THREE from "three"
import { MISSIONS, THEMES } from "../game/data"
import { acquireSoldierAssets, makeDrive, SoldierModel, type SoldierDrive } from "../game/soldier"
import type { EnemyKind, MissionId } from "../game/types"
import { createWorld, type World } from "../game/world"

const params = new URLSearchParams(location.search)
const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block"
document.body.style.margin = "0"; document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = params.get("quality") !== "low"; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setPixelRatio(1)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500); scene.add(camera)
const assets = acquireSoldierAssets()

interface Unit { group: THREE.Group; model: SoldierModel; drive: SoldierDrive; travel: boolean }
let world: World | null = null
let units: Unit[] = []
let night = false
let time = 0

function load(id: MissionId): void {
  for (const u of units) { u.group.removeFromParent(); u.model.dispose() }
  units = []
  if (world) world.dispose()
  world = createWorld(id, scene, "high")
  renderer.toneMappingExposure = world.exposure
  night = THEMES[MISSIONS[id].theme].night
}

function add(kind: EnemyKind, x: number, z: number, yaw = 0): number {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = yaw
  const model = new SoldierModel(kind, assets, units.length + 1)
  group.add(model.root); world!.group.add(group)
  model.setNight(night)
  const drive = makeDrive(); drive.yaw = yaw; drive.aimYaw = yaw; drive.alert = 1
  units.push({ group, model, drive, travel: false })
  stepAll(1 / 60)
  return units.length - 1
}

function stepAll(dt: number): void {
  time += dt
  for (const u of units) {
    u.drive.yaw = u.group.rotation.y
    if (u.travel) { u.group.position.x += u.drive.velX * dt; u.group.position.z += u.drive.velZ * dt }
    u.model.update(dt, u.drive)
    u.group.updateMatrixWorld(true)
    u.model.capture()
    u.model.tick(dt)
  }
}

function resize(): void { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false) }
addEventListener("resize", resize)
const camTarget = new THREE.Vector3()
function render(): void { if (world) world.update(1 / 60, time, camera); renderer.render(scene, camera) }

const bench = {
  THREE, scene, camera, renderer, ready: false,
  get units() { return units }, get world() { return world },
  load,
  add,
  drive(i: number, d: Partial<SoldierDrive>) { Object.assign(units[i].drive, d) },
  yaw(i: number, yaw: number) { units[i].group.rotation.y = yaw },
  travel(i: number, on: boolean) { units[i].travel = on },
  step(seconds: number) { const n = Math.max(1, Math.round(seconds * 60)); for (let k = 0; k < n; k++) stepAll(1 / 60); render() },
  fire(i: number) { units[i].model.fire() },
  hit(i: number, dx: number, dz: number) { units[i].model.hit(dx, dz) },
  die(i: number, fx: number, fz: number) { units[i].model.die(fx, fz) },
  mark(i: number, m: "" | "?" | "!", size = 0.42) { units[i].model.setIndicator(m, size) },
  laser(i: number, on: boolean, len = 30) { units[i].model.setLaser(on, len) },
  cam(x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 50) {
    camera.position.set(x, y, z); camTarget.set(tx, ty, tz); camera.lookAt(camTarget); camera.fov = fov; camera.updateProjectionMatrix(); render()
  },
  info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } },
  spawnSpot() { const s = world!.layout.playerSpawns[0]; return { x: s.x, z: s.z } },
  points(i: number) {
    const m = units[i].model, v = (p: THREE.Vector3) => [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]
    return { head: v(m.head), neck: v(m.neckBase), pelvis: v(m.pelvisPos), muzzle: v(m.muzzle), ankleL: v(m.ankleLPos), ankleR: v(m.ankleRPos), kneeL: v(m.kneeLPos), kneeR: v(m.kneeRPos) }
  },
  /** World-space lowest point (y) of every body mesh: a settled corpse should rest at ≈ 0 with no part below it. */
  partHeights(i: number) {
    const out: Record<string, [number, number]> = {}
    const v = new THREE.Vector3()
    units[i].group.updateMatrixWorld(true)
    units[i].group.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !o.name || o.name === "muzzleFlash" || !o.visible) return
      const pos = mesh.geometry.attributes.position
      let lo = Infinity, hi = -Infinity
      for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y) }
      out[o.name] = [+lo.toFixed(3), +hi.toFixed(3)]
    })
    return out
  },
  /** A plain box (cover) in the scene. */
  box(x: number, z: number, w: number, d: number, h: number, color = 0x6d6a5e) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))
    m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; world!.group.add(m)
  },
}
;(window as unknown as { __bench: typeof bench }).__bench = bench

load((params.get("mission") as MissionId) || "greyzone"); resize(); render(); bench.ready = true
