/**
 * harness.ts — developer test bench (dev.html, not part of the shipped game). Renders the zone (or the base) with
 * mercenaries, infected and gore, a simulated player and a free camera, and exposes window.__dev for Playwright:
 *
 *   dev.html?world=zone&time=dusk&quality=high&enemies=1&view=orbit
 *   __dev.load("zone" | "base", time)                     rebuild the world (mercs at every camp, infected zones)
 *   __dev.setView("top" | "orbit" | "player" | "free")   camera mode
 *   __dev.setCamera(x, y, z, tx, ty, tz)                    free camera (switches to "free")
 *   __dev.setPlayer(x, z, { crouched, sprinting, flashlight, yaw, pitch })
 *   __dev.step(seconds)                                     advance the simulation synchronously at 60 Hz
 *   __dev.pause(true|false)                                 stop/start real-time simulation
 *   __dev.noise(x, z, radius) / __dev.explode(x, z)
 *   __dev.shootFromPlayer(yaw, pitch) → hit info            analytic hit test from the player's eye
 *   __dev.stats                                             { enemyShots, enemyHits, deaths }
 *   __dev.ready                                             true after the first rendered frame
 */
import * as THREE from "three"
import { AudioSystem } from "../game/audio"
import type { TimeOfDay } from "../game/baseData"
import { EnemyManager, type PlayerState } from "../game/enemies"
import { GoreSystem } from "../game/gore"
import type { HostileEvents } from "../game/hostiles"
import { createWorld, type World } from "../game/world"
import { InfectedManager } from "../game/zombies"
import type { ZoneLayout } from "../game/zone"

type View = "top" | "orbit" | "player" | "free"
const params = new URLSearchParams(location.search)
const quality = params.get("quality") === "low" ? "low" : "high"
let view: View = (params.get("view") as View) || "orbit"

const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block"
document.body.style.margin = "0"; document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = quality === "high"; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setPixelRatio(1)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500); scene.add(camera)
const audio = new AudioSystem()
const stats = { enemyShots: 0, enemyHits: 0, deaths: 0, attacks: 0 }

let world: World
let enemies: EnemyManager
let infected: InfectedManager
let gore: GoreSystem
let kind: "zone" | "base" = params.get("world") === "base" ? "base" : "zone"
let timeOfDay: TimeOfDay = (params.get("time") as TimeOfDay) || "dusk"
const player: PlayerState = { position: new THREE.Vector3(), eyeY: 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: params.get("active") !== "0" }
let yaw = 0, pitch = 0, time = 0, paused = false
const freeCam = { pos: new THREE.Vector3(0, 30, 60), target: new THREE.Vector3() }

function load(k: "zone" | "base" = kind, t: TimeOfDay = timeOfDay): void {
  enemies?.dispose(); infected?.dispose(); gore?.dispose(); world?.dispose()
  kind = k; timeOfDay = t
  world = createWorld(k, scene, quality, { time: t })
  renderer.toneMappingExposure = world.exposure
  gore = new GoreSystem(scene, world.collision, "brutal")
  const spawn = world.layout.kind === "zone" ? world.layout.insertions[0] : world.layout.spawn
  player.position.set(spawn.x, 0, spawn.z); yaw = spawn.yaw; pitch = 0
  const events: HostileEvents = {
    shoot: s => { stats.enemyShots++; if (s.hit) stats.enemyHits++; audio.play(`enemy_${s.weapon}` as const, { position: s.from }) },
    attack: () => { stats.attacks++ },
    died: () => { stats.deaths++ },
  }
  enemies = new EnemyManager(world.group, world, { difficulty: "normal", seed: 1234, events, gore })
  infected = new InfectedManager(world.group, world, { difficulty: "normal", seed: 4321, events, gore })
  if (params.get("enemies") !== "0" && world.layout.kind === "zone") for (const c of (world.layout as ZoneLayout).mercCamps) enemies.spawnSquad(Array.from({ length: c.squad }, (_, i) => (["rifleman", "scout", "heavy", "marksman"] as const)[i % 4]), c.x, c.z, c.patrol)
}

function update(dt: number): void {
  time += dt
  player.eyeY = player.crouched ? 1.05 : 1.62
  enemies.update(dt, player)
  if (world.layout.kind === "zone" && params.get("enemies") !== "0") infected.populate((world.layout as ZoneLayout).infectedZones, player, 40)
  infected.update(dt, player)
  gore.update(dt, camera)
}

function placeCamera(): void {
  const b = world.layout.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
  camera.rotation.order = "YXZ"
  if (view === "top") { camera.position.set(cx, span * 1.05, cz + 0.01); camera.lookAt(cx, 0, cz) }
  else if (view === "orbit") { const t = time * 0.05; camera.position.set(cx + Math.sin(t) * span * 0.55, span * 0.28, cz + Math.cos(t) * span * 0.55); camera.lookAt(cx, 2, cz) }
  else if (view === "player") { camera.position.set(player.position.x, player.eyeY, player.position.z); camera.rotation.set(pitch, yaw, 0) }
  else { camera.position.copy(freeCam.pos); camera.lookAt(freeCam.target) }
  world.update(1 / 60, time, camera)
  audio.setListener(camera.position, yaw)
}

function resize(): void { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false) }
addEventListener("resize", resize)

let last = performance.now(), acc = 0
function frame(now: number): void {
  const delta = Math.min(0.25, (now - last) / 1000); last = now
  if (!paused) { acc += delta; while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60 } }
  placeCamera(); renderer.render(scene, camera); dev.ready = true
  requestAnimationFrame(frame)
}

const dev = {
  THREE, scene, camera, renderer, audio, stats, player, ready: false,
  get world() { return world }, get enemies() { return enemies }, get infected() { return infected }, get gore() { return gore }, get kind() { return kind },
  load,
  setView(v: View) { view = v },
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number) { freeCam.pos.set(x, y, z); freeCam.target.set(tx, ty, tz); view = "free" },
  setPlayer(x: number, z: number, o: Partial<{ crouched: boolean; sprinting: boolean; flashlight: boolean; yaw: number; pitch: number; speed: number }> = {}) {
    player.position.set(x, 0, z); Object.assign(player, { crouched: o.crouched ?? player.crouched, sprinting: o.sprinting ?? player.sprinting, flashlight: o.flashlight ?? player.flashlight, speed: o.speed ?? player.speed })
    if (o.yaw !== undefined) yaw = o.yaw; if (o.pitch !== undefined) pitch = o.pitch
  },
  step(seconds: number) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) update(1 / 60); placeCamera(); renderer.render(scene, camera) },
  pause(p: boolean) { paused = p },
  noise(x: number, z: number, radius: number) { enemies.hearNoise({ x, y: 1, z }, radius) },
  explode(x: number, z: number) { return enemies.applyExplosion({ x, y: 0.5, z }, 7, 140).length + infected.applyExplosion({ x, y: 0.5, z }, 7, 140).length },
  shootFromPlayer(y = yaw, p = pitch) {
    const origin = new THREE.Vector3(player.position.x, player.eyeY, player.position.z)
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p, y, 0, "YXZ"))
    const a = enemies.hitTest(origin, dir, 150), b = infected.hitTest(origin, dir, 150)
    const hit = a && (!b || a.distance < b.distance) ? a : b
    return hit ? { id: hit.target.id, faction: hit.target.faction, part: hit.part, bodyPart: hit.bodyPart, distance: hit.distance } : null
  },
}
;(window as unknown as { __dev: typeof dev }).__dev = dev

load(); resize(); requestAnimationFrame(frame)
