/**
 * ai-bench.ts — soldier model + mercenary AI bench (dev-ai.html, not shipped). Renders the zone's lighting for a time of
 * day with hand-driven soldier models so poses, gear, gore stumps and effects can be inspected up close, and runs the
 * real EnemyManager on the full 600 m zone for performance numbers. window.__bench (for Playwright):
 *
 *   dev-ai.html?time=dusk|night|day|dawn          (legacy: ?mission=blacksite → night, others → dusk)
 *   __bench.load(time)                            zone world lighting / sky / ground for that time of day
 *   __bench.add(kind, x, z, yaw) → index          soldier at (x, z) facing yaw (0 = -Z). Bench coordinates are
 *                                                 shifted so z = 38 is the open town square at the zone centre.
 *   __bench.drive(i, { aim, crouch, velX, velZ, aimYaw, aimPitch, look, alert, turnRate })
 *   __bench.travel(i, true)                       move the soldier by its velocity while stepping
 *   __bench.step(seconds)                         advance all soldiers at 60 Hz and render
 *   __bench.fire(i) / hit(i, dx, dz) / die(i, fallX, fallZ) / mark(i, "?"|"!"|"") / laser(i, on, length)
 *   __bench.sever(i, part) / unarm(i, dx, dz)     hide a gore part (stump check) / drop the weapon
 *   __bench.cam(x, y, z, tx, ty, tz, fov?)        free camera (bench coordinates)
 *   __bench.info()                                draw calls / triangles of the last frame
 *   __bench.perf(px, pz, frames, { flashlight })  EnemyManager with ~40 mercs over the zone's camps (world coords):
 *                                                 update timings, awake/combat counts, draw calls from the player's eye
 */
import * as THREE from "three"
import type { TimeOfDay } from "../game/baseData"
import type { EnemyKind } from "../game/types"
import type { BodyPartId, PlayerState } from "../game/hostiles"
import { EnemyManager } from "../game/enemies"
import { GoreSystem } from "../game/gore"
import { acquireSoldierAssets, makeDrive, SoldierModel, type SoldierDrive } from "../game/soldier"
import { createWorld, type World } from "../game/world"
import type { ZoneLayout } from "../game/zone"

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
/** Bench coordinates → world: the old lineup scripts use z ≈ 38; the zone's town square is at the origin. */
const OFFSET_Z = -38

interface Unit { group: THREE.Group; model: SoldierModel; drive: SoldierDrive; travel: boolean }
let world: World | null = null
let units: Unit[] = []
let time = 0
let mgr: EnemyManager | null = null
let gore: GoreSystem | null = null

function initialTime(): TimeOfDay {
  const t = params.get("time") as TimeOfDay | null
  if (t) return t
  return params.get("mission") === "blacksite" ? "night" : "dusk"
}

function load(t: TimeOfDay | string = initialTime()): void {
  const tod: TimeOfDay = t === "blacksite" ? "night" : t === "greyzone" || t === "harbor" ? "dusk" : t as TimeOfDay
  for (const u of units) { u.group.removeFromParent(); u.model.dispose() }
  units = []
  if (mgr) { mgr.dispose(); mgr = null }
  if (world) world.dispose()
  world = createWorld("zone", scene, "high", { time: tod })
  renderer.toneMappingExposure = world.exposure
}

function add(kind: EnemyKind, x: number, z: number, yaw = 0): number {
  const group = new THREE.Group(); group.position.set(x, 0, z + OFFSET_Z); group.rotation.y = yaw
  const model = new SoldierModel(kind, assets, units.length + 1)
  group.add(model.root); world!.group.add(group)
  model.setNight(world!.night)
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

const perfPlayer: PlayerState = { position: new THREE.Vector3(), eyeY: 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: true }

/** ~40 mercs: the layout's camps plus extra squads at district centres and crossroads all over the zone. */
function makeManager(): EnemyManager {
  const w = world!
  gore = new GoreSystem(scene, w.collision, "brutal")
  const m = new EnemyManager(w.group, w, { difficulty: "normal", seed: 77, gore, events: { died() {}, shoot() {} } })
  const layout = w.layout as ZoneLayout
  const pool: EnemyKind[] = ["rifleman", "scout", "heavy", "rifleman", "marksman"]
  let n = 0
  const squad = (x: number, z: number, size: number, patrol: { x: number; z: number }[]) => {
    const kinds = Array.from({ length: size }, (_, i) => pool[(n + i) % pool.length]); n += size
    const spot = w.nav.nearestWalkable(x, z, 12) ?? { x, z }
    m.spawnSquad(kinds, spot.x, spot.z, patrol)
  }
  for (const c of layout.mercCamps) squad(c.x, c.z, c.squad, c.patrol)
  const extra = [[-200, -200], [-200, 0], [-200, 200], [0, -200], [200, 200], [0, 0], [-100, 100], [100, -100], [100, 100]]
  for (const [x, z] of extra) { if (n >= 40) break; squad(x + 14, z + 14, Math.min(4, 40 - n), [{ x: x + 6, z: z + 18 }, { x: x + 22, z: z + 10 }]) }
  return m
}

const bench = {
  THREE, scene, camera, renderer, ready: false,
  get units() { return units }, get world() { return world }, get manager() { return mgr },
  load,
  add,
  drive(i: number, d: Partial<SoldierDrive>) { Object.assign(units[i].drive, d) },
  yaw(i: number, yaw: number) { units[i].group.rotation.y = yaw },
  travel(i: number, on: boolean) { units[i].travel = on },
  step(seconds: number) { const n = Math.max(1, Math.round(seconds * 60)); for (let k = 0; k < n; k++) stepAll(1 / 60); render() },
  fire(i: number) { units[i].model.fire() },
  hit(i: number, dx: number, dz: number) { units[i].model.hit(dx, dz) },
  die(i: number, fx: number, fz: number) { units[i].model.die(fx, fz) },
  sever(i: number, part: BodyPartId) { const m = units[i].model, s = m.severed as Set<string>; m.parts[part].visible = false; s.add(part); m.showStump(part) },
  unarm(i: number, dx: number, dz: number) { units[i].model.dropWeapon(dx, dz) },
  mark(i: number, m: "" | "?" | "!", size = 0.42) { units[i].model.setIndicator(m, size) },
  laser(i: number, on: boolean, len = 30) { units[i].model.setLaser(on, len) },
  cam(x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 50) {
    camera.position.set(x, y, z + OFFSET_Z); camTarget.set(tx, ty, tz + OFFSET_Z); camera.lookAt(camTarget); camera.fov = fov; camera.updateProjectionMatrix(); render()
  },
  info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } },
  /** Runs the real manager on the zone (world coordinates) and returns timings in ms. */
  perf(px: number, pz: number, frames = 600, o: { flashlight?: boolean; speed?: number; shootEvery?: number } = {}) {
    if (!mgr) mgr = makeManager()
    perfPlayer.position.set(px, 0, pz); perfPlayer.flashlight = !!o.flashlight; perfPlayer.speed = o.speed ?? 0
    // time spent in path finding per frame (to tell A* spikes from the rest)
    const nav = world!.nav, find = nav.findPath.bind(nav)
    let pathMs = 0, paths = 0, worstPath = 0
    nav.findPath = (...a: Parameters<typeof find>) => { const t0 = performance.now(); const r = find(...a); const d = performance.now() - t0; pathMs += d; paths++; worstPath = Math.max(worstPath, d); return r }
    const times: number[] = []
    let worst = 0, worstPathPart = 0
    for (let k = 0; k < frames; k++) {
      if (o.shootEvery && k % o.shootEvery === 0) mgr.hearNoise({ x: px, y: 1.5, z: pz }, 48)
      const p0 = pathMs, t0 = performance.now()
      mgr.update(1 / 60, perfPlayer)
      const d = performance.now() - t0
      times.push(d)
      if (d > worst) { worst = d; worstPathPart = pathMs - p0 }
    }
    nav.findPath = find
    times.sort((a, b) => a - b)
    camera.position.set(px, 1.62, pz); camera.lookAt(px, 1.5, pz - 10); render()
    const sum = times.reduce((a, b) => a + b, 0)
    return {
      mercs: mgr.enemies.length, alive: mgr.aliveCount(), awake: mgr.awakeCount, combat: mgr.combatCount(), visible: mgr.enemies.filter(e => e.group.visible).length,
      avg: +(sum / frames).toFixed(3), p50: +times[frames >> 1].toFixed(3), p95: +times[Math.floor(frames * 0.95)].toFixed(3), max: +times[frames - 1].toFixed(3),
      calls: renderer.info.render.calls, over4: times.filter(t => t > 4).length,
      paths, pathAvg: paths ? +(pathMs / paths).toFixed(3) : 0, worstPath: +worstPath.toFixed(2), worstFramePathMs: +worstPathPart.toFixed(2),
    }
  },
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
  /** A plain box (cover) in the scene (bench coordinates). */
  box(x: number, z: number, w: number, d: number, h: number, color = 0x6d6a5e) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))
    m.position.set(x, h / 2, z + OFFSET_Z); m.castShadow = m.receiveShadow = true; world!.group.add(m)
  },
}
;(window as unknown as { __bench: typeof bench }).__bench = bench

load(); resize(); render(); bench.ready = true
