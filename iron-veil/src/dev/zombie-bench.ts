/**
 * zombie-bench.ts — test bench for the infected (dev-zombies.html, not part of the shipped game). Renders a mission world
 * with a GoreSystem, a simulated player (blue marker), the InfectedManager and a button panel (spawn per kind, horde,
 * populate, shoot/explode/melee, gore level, time of day). Exposes window.__zombieBench for Playwright scripts:
 *
 *   dev-zombies.html?world=zone&time=night&gore=brutal&ui=0&seed=7
 *   __zombieBench.spawn(kind, x, z, { state, target }) → id      __zombieBench.get(id) → Infected
 *   __zombieBench.horde(cx, cz, n, tx, tz, kinds?)                 __zombieBench.populate(zones, budget)
 *   __zombieBench.setPlayer(x, z, { yaw, pitch, active, crouched, sprinting, flashlight, speed })
 *   __zombieBench.frameOn(id, { angle, dist, height, lookY })     camera looking at an infected (angle 0 = its front)
 *   __zombieBench.setCamera(x, y, z, tx, ty, tz) / setView("orbit" | "player" | "free" | "top")
 *   __zombieBench.step(seconds) / tick(seconds) (no render) / pause(bool) / render()
 *   __zombieBench.noise(x, z, r) / shoot(o, d, dmg, kind, sever) / shootAt(id, part, dmg, kind, sever) / explode(x, z, r, dmg)
 *   __zombieBench.melee(dmg, sever) / setGore(level) / debug(id, action) / addWall(minX, maxX, minZ, maxZ, h)
 *   __zombieBench.measure(frames) → { avg, max, p95 } ms per InfectedManager.update
 *   __zombieBench.log → { attacks, sounds, deaths, spotted, footsteps, impacts }   __zombieBench.ready
 */
import * as THREE from "three"
import type { Obstacle } from "../game/collision"
import { GoreSystem, type GoreLevel } from "../game/gore"
import type { AttackEvent, BodyPartId, DamageInfo, HostileSound, PlayerState } from "../game/hostiles"
import type { InfectedKind } from "../game/infectedData"
import type { Vec2 } from "../game/types"
import { createWorld, type World } from "../game/world"
import type { Action } from "../game/zombieAnim"
import type { ClipName } from "../game/zombieAnim"
import { InfectedManager, type Infected, type InfectedZone } from "../game/zombies"

type View = "orbit" | "player" | "free" | "top"
const params = new URLSearchParams(location.search)
const quality = params.get("quality") === "low" ? "low" : "high"
let view: View = (params.get("view") as View) || "orbit"
let mission: "zone" | "base" = params.get("world") === "base" ? "base" : "zone"
let goreLevel: GoreLevel = (params.get("gore") as GoreLevel) || "brutal"
const seed = Number(params.get("seed") ?? 7)

const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block"
document.body.style.cssText = "margin:0;background:#000;font:12px system-ui,sans-serif"; document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = quality === "high"; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setPixelRatio(1)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500); scene.add(camera)
// player's weapon light (as in the raid): follows the camera, only on with player.flashlight
const flashlight = new THREE.SpotLight(0xfff1d6, 0, 45, 0.48, 0.55, 1.4); flashlight.position.set(0.15, -0.1, 0); camera.add(flashlight); flashlight.target.position.set(0, -0.15, -1); camera.add(flashlight.target)

const log = { attacks: [] as Array<{ id: number; kind: string; type: AttackEvent["kind"]; damage: number; bleed: string; t: number }>, sounds: {} as Record<string, number>, deaths: 0, spotted: 0, footsteps: 0, impacts: 0 }
const player: PlayerState & { yaw: number } = { position: new THREE.Vector3(), eyeY: 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: params.get("active") !== "0", yaw: 0 }
let pitch = 0, time = 0, paused = params.get("paused") === "1"
const freeCam = { pos: new THREE.Vector3(0, 6, 12), target: new THREE.Vector3(0, 1, 0) }
let world: World, gore: GoreSystem, mgr: InfectedManager
let populateOn = false
const demoZones: InfectedZone[] = []

// player marker (visible in third-person views)
const marker = new THREE.Group()
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f7dff, roughness: 0.6, emissive: 0x0a2a66 })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 8), mat); body.position.y = 0.85; marker.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), mat); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 1.45, -0.35); marker.add(nose)
  scene.add(marker)
}

function load(id: "zone" | "base"): void {
  if (mgr) mgr.dispose()
  if (gore) gore.dispose()
  if (world) world.dispose()
  mission = id
  world = createWorld(id, scene, quality, { time: (params.get("time") as "dawn" | "day" | "dusk" | "night") || "dusk" })
  renderer.toneMappingExposure = world.exposure
  gore = new GoreSystem(scene, world.collision, goreLevel)
  const spawn = world.layout.kind === "zone" ? world.layout.insertions[0] : world.layout.spawn
  player.position.set(spawn.x, 0, spawn.z); player.yaw = spawn.yaw
  mgr = new InfectedManager(world.group, world, {
    difficulty: "normal", seed, gore,
    events: {
      attack: a => { log.attacks.push({ id: a.source.id, kind: a.source.kind, type: a.kind, damage: Math.round(a.damage * 10) / 10, bleed: a.bleed, t: Math.round(time * 100) / 100 }) },
      died: () => { log.deaths++ },
      spotted: () => { log.spotted++ },
      footstep: () => { log.footsteps++ },
      sound: (_t, s: HostileSound) => { log.sounds[s] = (log.sounds[s] ?? 0) + 1 },
    },
  })
  mgr.onImpact = () => { log.impacts++ }
  demoZones.length = 0
  for (const [fx, fz] of [[-40, -40], [40, -35], [-35, 40], [35, 35], [0, -60]]) demoZones.push({ x: spawn.x + fx, z: spawn.z + fz - 40, radius: 14, density: 0.012 })
}

function update(dt: number): void {
  time += dt
  player.eyeY = player.crouched ? 1.05 : 1.62
  if (populateOn) mgr.populate(demoZones, player, 40)
  const t0 = performance.now()
  mgr.update(dt, player)
  lastUpdateMs = performance.now() - t0
  gore.update(dt, camera)
}
let lastUpdateMs = 0

function placeCamera(): void {
  camera.rotation.order = "YXZ"
  const p = player.position
  if (view === "top") { camera.position.set(p.x, 70, p.z + 0.01); camera.lookAt(p.x, 0, p.z) }
  else if (view === "orbit") { const t = time * 0.12; camera.position.set(p.x + Math.sin(t) * 16, 8, p.z + Math.cos(t) * 16); camera.lookAt(p.x, 1, p.z) }
  else if (view === "player") { camera.position.set(p.x, player.eyeY, p.z); camera.rotation.set(pitch, player.yaw, 0) }
  else { camera.position.copy(freeCam.pos); camera.lookAt(freeCam.target) }
  marker.position.set(p.x, 0, p.z); marker.rotation.y = player.yaw; marker.visible = view !== "player"
  mgr.viewer = camera.position
  flashlight.intensity = player.flashlight ? 60 : 0
  world.update(1 / 60, time, camera)
}

function render(): void { placeCamera(); renderer.render(scene, camera) }
function resize(): void { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false) }
addEventListener("resize", resize)

let last = performance.now(), acc = 0
function frame(now: number): void {
  const delta = Math.min(0.25, (now - last) / 1000); last = now
  if (!paused) { acc += delta; while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60 } }
  render(); bench.ready = true
  if (statsEl && (Math.floor(now / 250) !== Math.floor((now - delta * 1000) / 250))) refreshStats()
  requestAnimationFrame(frame)
}

function forward(yaw = player.yaw, p = pitch): THREE.Vector3 { return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p, yaw, 0, "YXZ")) }
function eye(): THREE.Vector3 { return new THREE.Vector3(player.position.x, player.eyeY, player.position.z) }

function damage(amount: number, dir: THREE.Vector3, kind: DamageInfo["kind"], sever: number, penetration = 0.25): DamageInfo {
  return { amount, from: { x: player.position.x, y: player.eyeY, z: player.position.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, penetration, kind, sever }
}

const bench = {
  THREE, scene, camera, renderer, player, log, ready: false,
  get world() { return world }, get mgr() { return mgr }, get gore() { return gore }, get mission() { return mission }, get time() { return time },
  load(id: "zone" | "base") { load(id); render() },
  spawn(kind: InfectedKind, x: number, z: number, opts: { state?: "idle" | "wander" | "hunt"; target?: Vec2; yaw?: number } = {}) {
    const e = mgr.spawn(kind, x, z, opts)
    if (opts.yaw !== undefined) { e.yaw = opts.yaw; e.group.rotation.y = opts.yaw }
    return e.id
  },
  get(id: number): Infected | undefined { return mgr.list.find(e => e.id === id) },
  info() {
    return mgr.list.map(e => ({ id: e.id, kind: e.kind, state: e.state, mode: e.mode, alive: e.alive, x: +e.position.x.toFixed(2), z: +e.position.z.toFixed(2), health: Math.round(e.health), severed: [...e.gore.severed], legless: e.legless, gait: e.gait, lod: e.lodOn, visible: e.group.visible }))
  },
  horde(cx: number, cz: number, n: number, tx: number, tz: number, kinds?: InfectedKind[]) { return mgr.spawnHorde({ x: cx, z: cz }, n, { x: tx, z: tz }, kinds) },
  populate(zones: InfectedZone[], budget: number) { mgr.populate(zones, player, budget) },
  setPopulate(on: boolean) { populateOn = on },
  demoZones,
  clear() { load(mission); render() },
  setPlayer(x: number, z: number, o: Partial<{ yaw: number; pitch: number; active: boolean; crouched: boolean; sprinting: boolean; flashlight: boolean; speed: number; alive: boolean }> = {}) {
    player.position.set(x, 0, z)
    if (o.yaw !== undefined) player.yaw = o.yaw
    if (o.pitch !== undefined) pitch = o.pitch
    for (const k of ["active", "crouched", "sprinting", "flashlight", "speed", "alive"] as const) if (o[k] !== undefined) (player as unknown as Record<string, unknown>)[k] = o[k]
  },
  setView(v: View) { view = v; placeCamera() },
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number) { freeCam.pos.set(x, y, z); freeCam.target.set(tx, ty, tz); view = "free"; placeCamera() },
  /** Free camera looking at an infected: angle 0 = from its front, π/2 = from its right side. */
  frameOn(id: number, o: Partial<{ angle: number; dist: number; height: number; lookY: number; offsetX: number }> = {}) {
    const e = bench.get(id); if (!e) return
    const a = e.yaw + (o.angle ?? 0), d = o.dist ?? 3, h = o.height ?? 1.5
    const fx = -Math.sin(a), fz = -Math.cos(a)
    const ox = o.offsetX ?? 0
    freeCam.pos.set(e.position.x + fx * d + Math.cos(a) * ox, h, e.position.z + fz * d - Math.sin(a) * ox)
    freeCam.target.set(e.position.x + Math.cos(a) * ox, o.lookY ?? 1, e.position.z - Math.sin(a) * ox)
    view = "free"; placeCamera()
  },
  step(seconds: number) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { update(1 / 60); if (i % 6 === 0) placeCamera() } render() },
  /** Advances the simulation without rendering (fast scripted stepping). */
  tick(seconds: number) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { update(1 / 60); if (i % 6 === 0) placeCamera() } },
  render() { render() },
  pause(p: boolean) { paused = p },
  noise(x: number, z: number, radius: number) { mgr.hearNoise({ x, y: 1, z }, radius) },
  shoot(o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, dmg = 30, kind: DamageInfo["kind"] = "bullet", sever = 0, penetration = 0.25) {
    const origin = new THREE.Vector3(o.x, o.y, o.z), dir = new THREE.Vector3(d.x, d.y, d.z).normalize()
    const hit = mgr.hitTest(origin, dir, 200)
    if (!hit) return null
    const r = mgr.applyDamage(hit, damage(dmg, dir, kind, sever, penetration))
    return { id: hit.target.id, part: hit.part, bodyPart: hit.bodyPart, distance: +hit.distance.toFixed(2), ...r }
  },
  /** Shoots from the player's eye at the centre of a body part's hit capsule. */
  shootAt(id: number, part: BodyPartId, dmg = 30, kind: DamageInfo["kind"] = "bullet", sever = 0, penetration = 0.25) {
    const e = bench.get(id); if (!e || !e.alive) return null
    e.group.updateMatrixWorld(true)
    const c = e.rig.capsules.find(c => c.part === part); if (!c) return null
    const p = new THREE.Vector3((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2).applyMatrix4(c.frame.matrixWorld)
    const o = eye(), dir = p.clone().sub(o).normalize()
    return bench.shoot(o, dir, dmg, kind, sever, penetration)
  },
  shootForward(dmg = 30, kind: DamageInfo["kind"] = "bullet", sever = 0) { return bench.shoot(eye(), forward(), dmg, kind, sever) },
  explode(x: number, z: number, radius = 6, dmg = 160) { return mgr.applyExplosion({ x, y: 0.3, z }, radius, dmg).map(h => h.id) },
  melee(dmg = 58, sever = 0.6, range = 2.2, arc = 80) {
    const hits = mgr.meleeTest(eye(), forward(), range, arc, 2)
    return hits.map(h => ({ id: h.target.id, part: h.bodyPart, ...mgr.applyDamage(h, damage(dmg, forward(), "melee", sever, 0)) }))
  },
  setGore(level: GoreLevel) { goreLevel = level; gore.level = level },
  debug(id: number, action: Action | "knockdown" | "die" | "dieBlast" | ClipName) { const e = bench.get(id); if (e) mgr.debugAction(e, action) },
  addWall(minX: number, maxX: number, minZ: number, maxZ: number, h = 3) {
    const o: Obstacle = { minX, maxX, minZ, maxZ, height: h }
    world.obstacles.push(o); world.collision.add(o); world.nav.rebuildRegion(minX - 1, minZ - 1, maxX + 1, maxZ + 1, world.obstacles)
    const m = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, h, maxZ - minZ), new THREE.MeshStandardMaterial({ color: 0x6a6f64, roughness: 0.9 }))
    m.position.set((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2); m.castShadow = m.receiveShadow = true; world.group.add(m)
  },
  measure(frames = 300) {
    const times: number[] = []
    for (let i = 0; i < frames; i++) { update(1 / 60); times.push(lastUpdateMs) }
    render()
    times.sort((a, b) => a - b)
    const avg = times.reduce((s, v) => s + v, 0) / times.length
    return { avg: +avg.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), max: +times[times.length - 1].toFixed(3), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  },
  stats() { return { ...mgr.stats(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, updateMs: +lastUpdateMs.toFixed(3) } },
}
;(window as unknown as { __zombieBench: typeof bench }).__zombieBench = bench

// ------------------------------------------------------------------ panel
let statsEl: HTMLDivElement | null = null
function refreshStats(): void {
  if (!statsEl) return
  const s = bench.stats()
  statsEl.textContent = `lebend ${s.alive} · Leichen ${s.corpses} · jagen ${s.chasing} · LOD ${s.lod} · Draw Calls ${s.calls} · KI ${s.updateMs} ms · Angriffe ${log.attacks.length}`
}
if (params.get("ui") !== "0") {
  const panel = document.createElement("div")
  panel.style.cssText = "position:fixed;left:8px;top:8px;max-width:560px;display:flex;flex-wrap:wrap;gap:4px;background:rgba(8,10,12,.72);color:#dde;padding:8px;border-radius:6px"
  const btn = (label: string, fn: () => void) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "background:#2a3036;color:#eee;border:1px solid #556;border-radius:4px;padding:3px 7px;cursor:pointer"; b.onclick = fn; panel.appendChild(b) }
  const ahead = (d = 12) => { const f = forward(player.yaw, 0); return { x: player.position.x + f.x * d, z: player.position.z + f.z * d } }
  const names: Record<InfectedKind, string> = { walker: "Infizierter", runner: "Läufer", brute: "Brut", screamer: "Schreier", spitter: "Speier", bloater: "Gasbläher", riot: "Gepanzerter", stalker: "Pirscher", crawler: "Kriecher", boss: "Koloss" }
  for (const k of Object.keys(names) as InfectedKind[]) btn(names[k], () => { const p = ahead(k === "boss" ? 18 : 12); bench.spawn(k, p.x, p.z, { state: "wander" }) })
  btn("Horde 30", () => { const p = ahead(30); bench.horde(p.x, p.z, 30, player.position.x, player.position.z) })
  btn("Bevölkern an/aus", () => { populateOn = !populateOn })
  btn("Schuss", () => bench.shootForward(30))
  btn("Schrot", () => { for (let i = 0; i < 9; i++) bench.shoot(eye(), forward(player.yaw + (Math.sin(i * 7.1) * 0.05), pitch + Math.cos(i * 3.3) * 0.04), 14, "pellet", 0.1) })
  btn("Explosion", () => { const p = ahead(8); bench.explode(p.x, p.z) })
  btn("Machete", () => bench.melee())
  btn("Lärm", () => bench.noise(player.position.x, player.position.z, 50))
  for (const g of ["off", "normal", "brutal"] as GoreLevel[]) btn(`Gore ${g}`, () => bench.setGore(g))
  btn("Zone", () => bench.load("zone")); btn("Basis", () => bench.load("base"))
  btn("Spieler aktiv", () => { player.active = !player.active })
  btn("Lampe", () => { player.flashlight = !player.flashlight })
  btn("Ansicht", () => { view = view === "orbit" ? "player" : view === "player" ? "top" : "orbit" })
  btn("Pause", () => { paused = !paused })
  btn("Leeren", () => bench.clear())
  statsEl = document.createElement("div"); statsEl.style.cssText = "width:100%;margin-top:4px;color:#9fc"
  panel.appendChild(statsEl)
  document.body.appendChild(panel)
  addEventListener("keydown", e => {
    const s = 0.5
    if (e.key === "w") player.position.add(forward(player.yaw, 0).multiplyScalar(s))
    if (e.key === "s") player.position.add(forward(player.yaw, 0).multiplyScalar(-s))
    if (e.key === "a") player.yaw += 0.1
    if (e.key === "d") player.yaw -= 0.1
  })
}

load(mission); resize(); requestAnimationFrame(frame)
