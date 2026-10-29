/**
 * gore-bench.ts — gore test bench (dev-gore.html, not part of the shipped game). A lit concrete yard with walls, a crate
 * and a pillar (CollisionWorld), jointed mannequins built exactly like GoreBody models (part groups head/torso/armL/armR/
 * legL/legR with their origin at the joint), buttons for every gore call and a stress test. Exposes window.__goreBench:
 *
 *   __goreBench.reset(count?)                 five (or count) standing mannequins, gore cleared
 *   __goreBench.wound(i, part?) / sever(i, part) / headshot(i) / gib(i) / pool(i) / kill(i)   (shots come from SHOOTER)
 *   __goreBench.splatter(a) / hurt(a)         screen overlay; screenBlood(false) stops gore → overlay routing
 *   __goreBench.setLevel("off" | "normal" | "brutal")
 *   __goreBench.stress()                      20 corpses with pools and wounds, ~60 gibs, ~150 decals
 *   __goreBench.pause(true|false) / step(seconds) / render() / seed(n)
 *   __goreBench.setCamera(x, y, z, tx, ty, tz)
 *   __goreBench.info()                        renderer.info + gore.stats() + measured gore.update / render CPU times
 *   __goreBench.ready                         true after the first rendered frame
 */
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CollisionWorld, type Obstacle } from "../game/collision"
import { GoreSystem, rng32, type GoreLevel } from "../game/gore"
import { ScreenBlood } from "../game/goreOverlay"
import type { BodyPartId, GoreBody } from "../game/hostiles"

const SHOOTER = new THREE.Vector3(0, 1.6, 6)
const PARTS: BodyPartId[] = ["head", "torso", "armL", "armR", "legL", "legR"]
const PART_LABEL: Record<BodyPartId, string> = { head: "Kopf", torso: "Rumpf", armL: "Arm L", armR: "Arm R", legL: "Bein L", legR: "Bein R" }

// ───────────── renderer, scene, lights ─────────────
document.body.style.cssText = "margin:0;overflow:hidden;background:#000;font:13px system-ui,sans-serif"
const host = document.createElement("div"); host.style.cssText = "position:fixed;inset:0"
document.body.appendChild(host)
const canvas = document.createElement("canvas"); canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"
host.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setPixelRatio(1)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xb08362)
scene.fog = new THREE.Fog(0xb08362, 40, 120)
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300); scene.add(camera)
const hemi = new THREE.HemisphereLight(0x9dbbc0, 0x303326, 2.0); scene.add(hemi)
const sun = new THREE.DirectionalLight(0xffe3bc, 2.2)
sun.position.set(-8, 14, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 50 })
scene.add(sun)

function concreteTexture(seed: number, base: number): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = c.height = 256
  const g = c.getContext("2d")!, r = rng32(seed), b = new THREE.Color(base)
  g.fillStyle = `#${b.getHexString()}`; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) { const v = Math.floor(r() * 50 - 25); g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 4) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
const floorTex = concreteTexture(1, 0x76716a); floorTex.repeat.set(10, 10)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }))
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)

const obstacles: Obstacle[] = [
  { minX: -8, maxX: 8, minZ: -3.5, maxZ: -3.2, height: 3 },          // back wall
  { minX: 5, maxX: 5.3, minZ: -3.2, maxZ: 3, height: 3 },            // side wall
  { minX: -3.4, maxX: -2.4, minZ: -2.2, maxZ: -1.2, height: 1, surface: "wood" }, // crate
  { minX: 2.3, maxX: 2.7, minZ: -2.1, maxZ: -1.7, height: 2.6 },     // pillar
]
const collision = new CollisionWorld(obstacles)
const wallTex = concreteTexture(2, 0x9a948c); wallTex.repeat.set(4, 1.5)
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }), crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 })
for (const o of obstacles) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(o.maxX - o.minX, o.height, o.maxZ - o.minZ), o.surface === "wood" ? crateMat : wallMat)
  m.position.set((o.minX + o.maxX) / 2, o.height / 2, (o.minZ + o.maxZ) / 2); m.castShadow = m.receiveShadow = true; scene.add(m)
}

// ───────────── mannequins (GoreBody convention) ─────────────
const G = {
  capsule: (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10),
}
const geo = {
  thigh: G.capsule(0.075, 0.3), shin: G.capsule(0.062, 0.3), boot: new THREE.BoxGeometry(0.12, 0.1, 0.25),
  pelvis: new THREE.BoxGeometry(0.32, 0.18, 0.21), chest: G.capsule(0.15, 0.28), vest: new THREE.BoxGeometry(0.37, 0.33, 0.27),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10), head: new THREE.SphereGeometry(0.11, 16, 12), helmet: new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  upper: G.capsule(0.055, 0.2), fore: G.capsule(0.048, 0.2), hand: new THREE.SphereGeometry(0.05, 10, 8),
}
const mats = {
  cloth: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.92 }), pants: new THREE.MeshStandardMaterial({ color: 0x5a5446, roughness: 0.92 }),
  vest: new THREE.MeshStandardMaterial({ color: 0x3a3f2e, roughness: 0.8 }), skin: new THREE.MeshStandardMaterial({ color: 0xc49377, roughness: 0.65 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.7 }), helmet: new THREE.MeshStandardMaterial({ color: 0x454c37, roughness: 0.6 }),
  zombie: new THREE.MeshStandardMaterial({ color: 0x6d7a5c, roughness: 0.95 }),
}

interface Dummy { root: THREE.Group; gore: GoreBody; fall: number; fallen: boolean; pooled: boolean; infected: boolean }
const dummies: Dummy[] = []

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o
}
function buildDummy(x: number, z: number, yaw: number, infected = false): Dummy {
  const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = yaw
  const cloth = infected ? mats.zombie : mats.cloth, skin = infected ? mats.zombie : mats.skin
  const joint = (parent: THREE.Object3D, px: number, py: number, pz: number) => { const g = new THREE.Group(); g.position.set(px, py, pz); parent.add(g); return g }
  const torso = joint(root, 0, 0.92, 0)
  mesh(geo.pelvis, mats.pants, 0, 0.04, 0, torso)
  mesh(geo.chest, cloth, 0, 0.32, 0, torso, 1.2, 1, 0.75)
  if (!infected) mesh(geo.vest, mats.vest, 0, 0.38, 0.01, torso)
  const head = joint(torso, 0, 0.62, 0)
  mesh(geo.neck, skin, 0, 0.04, 0, head)
  mesh(geo.head, skin, 0, 0.17, 0, head, 0.95, 1.1, 1)
  if (!infected) mesh(geo.helmet, mats.helmet, 0, 0.2, -0.005, head)
  const arm = (side: number) => {
    const a = joint(torso, side * 0.23, 0.52, 0); a.rotation.z = side * 0.12
    mesh(geo.upper, cloth, 0, -0.15, 0, a); mesh(geo.fore, cloth, 0, -0.43, 0, a); mesh(geo.hand, skin, 0, -0.62, 0, a)
    return a
  }
  const leg = (side: number) => {
    const l = joint(root, side * 0.1, 0.92, 0)
    mesh(geo.thigh, mats.pants, 0, -0.2, 0, l); mesh(geo.shin, mats.pants, 0, -0.62, 0, l); mesh(geo.boot, mats.boot, 0, -0.87, 0.04, l)
    return l
  }
  const parts = { head, torso, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) }
  scene.add(root); root.updateMatrixWorld(true)
  const d: Dummy = { root, gore: { parts, bloodColor: infected ? 0x5a0a06 : 0x7a0b09, severed: new Set() }, fall: -1, fallen: false, pooled: false, infected }
  dummies.push(d)
  return d
}
function removeDummies(): void { for (const d of dummies) d.root.removeFromParent(); dummies.length = 0 }
/** Lying corpse (on its back, head away from the shooter). */
function corpse(x: number, z: number, yaw: number, infected = false): Dummy {
  const d = buildDummy(x, z, yaw, infected)
  d.root.rotation.set(-Math.PI / 2, yaw, 0, "YXZ"); d.root.position.y = 0.13; d.fallen = true; d.root.updateMatrixWorld(true)
  return d
}

// ───────────── gore ─────────────
const gore = new GoreSystem(scene, collision, "brutal")
const screen = new ScreenBlood(host)
let screenBlood = true
gore.onScreenSplatter = a => { stats.splatter = Math.max(stats.splatter, a); if (screenBlood) screen.splatter(a) }
const stats = { splatter: 0, updateMs: 0, updateMax: 0, renderMs: 0, frames: 0 }

const _p = new THREE.Vector3(), _d = new THREE.Vector3()
function partCenter(d: Dummy, part: BodyPartId, out: THREE.Vector3): THREE.Vector3 {
  const o = d.gore.parts[part]!
  d.root.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(o).getCenter(out)
}
function shotDir(to: THREE.Vector3): THREE.Vector3 { return _d.copy(to).sub(SHOOTER).normalize() }

function kill(i: number): void { const d = dummies[i]; if (d && !d.fallen && d.fall < 0) d.fall = 0 }
const api = {
  THREE, gore, screen, renderer, scene, camera, dummies, collision, stats, ready: false,
  reset(count = 5) {
    gore.clear(); removeDummies()
    for (let i = 0; i < count; i++) buildDummy((i - (count - 1) / 2) * 1.5, 0, 0, i % 2 === 1)
    stats.splatter = 0
  },
  setLevel(l: GoreLevel) { gore.level = l; api.reset(); updateButtons() },
  seed(n: number) { gore.random = rng32(n) },
  wound(i: number, part: BodyPartId = "torso", damage = 60) {
    const d = dummies[i]; if (!d) return
    partCenter(d, part, _p); _p.z += 0.12; _p.x += (gore.random() - 0.5) * 0.1; _p.y += (gore.random() - 0.5) * 0.1
    gore.wound(_p, shotDir(_p), damage, { color: d.gore.bloodColor })
  },
  sever(i: number, part: BodyPartId) {
    const d = dummies[i]; if (!d) return
    const o = d.gore.parts[part]; if (!o) return
    partCenter(d, part, _p)
    const side = part.endsWith("L") ? -1 : part.endsWith("R") ? 1 : 0
    const dir = shotDir(_p)
    gore.sever(o, { x: dir.x * 5 + side * 2.5, y: 2.5, z: dir.z * 5 }, { color: d.gore.bloodColor })
    if (!o.visible) d.gore.severed.add(part)
    if (part === "legL" || part === "legR" || part === "torso") kill(i)
  },
  headshot(i: number) {
    const d = dummies[i]; if (!d) return
    partCenter(d, "head", _p)
    gore.headshot(d.gore.parts.head!, shotDir(_p), { color: d.gore.bloodColor })
    if (!d.gore.parts.head!.visible) d.gore.severed.add("head")
    kill(i)
  },
  gib(i: number, force = 11) {
    const d = dummies[i]; if (!d) return
    _p.copy(d.root.position); _p.z += 0.4; _p.y = 0.3
    gore.gib(d.root, _p, force, { color: d.gore.bloodColor })
  },
  pool(i: number) {
    const d = dummies[i]; if (!d) return
    partCenter(d, "torso", _p); gore.pool(_p, 1, { color: d.gore.bloodColor }); d.pooled = true
  },
  kill,
  /** Route GoreSystem.onScreenSplatter to the overlay (as the raid does); off for clean 3D captures. */
  screenBlood(on: boolean) { screenBlood = on },
  splatter(a: number) { screen.splatter(a) },
  hurt(a: number) { screen.hurt(a) },
  /** 20 fresh corpses with wounds and pools, ~60 gibs, ~150 decals. */
  stress() {
    gore.clear(); removeDummies()
    const r = rng32(99)
    for (let k = 0; k < 20; k++) corpse(-4.5 + (k % 5) * 2.2 + (r() - 0.5) * 0.4, -2.2 + Math.floor(k / 5) * 1.6 + (r() - 0.5) * 0.3, (r() - 0.5) * 1.2, k % 2 === 1)
    for (let k = 0; k < 20; k++) { api.pool(k); api.wound(k, "torso", 70); api.wound(k, "torso", 40) }
    for (const k of [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]) api.sever(k, (["armL", "armR", "legL", "legR"] as BodyPartId[])[k % 4])
    for (const k of [1, 5, 9, 13]) api.headshot(k)
    for (const k of [3, 11]) api.gib(k, 9)
    // extra wall/floor spatter so the decal budget is used like after a long fight
    for (let k = 0; k < 24; k++) api.wound(k % 20, "torso", 90)
  },
  pause(p: boolean) { paused = p },
  step(seconds: number) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) tick(1 / 60); draw() },
  render() { draw() },
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number) { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update() },
  info() {
    const i = renderer.info
    return { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, gore: gore.stats(), updateMs: stats.updateMs, updateMax: stats.updateMax, renderMs: stats.renderMs }
  },
  /** Average CPU time of gore.update over n fixed steps (ms) and of n renders. */
  measure(n = 60) {
    let up = 0, upMax = 0, rd = 0
    for (let k = 0; k < n; k++) {
      const t0 = performance.now(); tick(1 / 60); const t1 = performance.now(); draw(); const t2 = performance.now()
      up += stats.updateMs; upMax = Math.max(upMax, stats.updateMs); rd += t2 - t1; void t0
    }
    return { updateMs: up / n, updateMax: upMax, renderMs: rd / n }
  },
}
;(window as unknown as { __goreBench: typeof api }).__goreBench = api

// ───────────── simulation loop ─────────────
let paused = false
function tick(dt: number): void {
  for (const d of dummies) {
    if (d.fall < 0 || d.fallen) continue
    d.fall += dt
    const t = Math.min(1, d.fall / 0.75), e = t * t
    d.root.rotation.set(-Math.PI / 2 * e, d.root.rotation.y, 0, "YXZ"); d.root.position.y = 0.13 * e
    if (t >= 1) { d.fallen = true; if (!d.pooled && d.root.visible) { partCenter(d, "torso", _p); gore.pool(_p, 1, { color: d.gore.bloodColor }); d.pooled = true } }
  }
  scene.updateMatrixWorld()
  const t0 = performance.now()
  gore.update(dt, camera)
  const ms = performance.now() - t0
  stats.updateMs = ms; stats.updateMax = Math.max(stats.updateMax * 0.995, ms)
  screen.update(dt)
}
function draw(): void {
  const t0 = performance.now()
  renderer.render(scene, camera)
  stats.renderMs = performance.now() - t0
  api.ready = true
}

const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 1.0, -0.5); camera.position.set(0.6, 1.75, 4.2); controls.update()

function resize(): void { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false) }
addEventListener("resize", resize)

// ───────────── UI ─────────────
const panel = document.createElement("div")
panel.style.cssText = "position:fixed;left:8px;top:8px;max-width:560px;display:flex;flex-wrap:wrap;gap:4px;z-index:10;pointer-events:auto"
document.body.appendChild(panel)
const info = document.createElement("pre")
info.style.cssText = "position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,0.55);color:#ddd;font:12px ui-monospace,monospace;z-index:10;pointer-events:none"
document.body.appendChild(info)
let target = 2
const levelButtons: HTMLButtonElement[] = []
function button(label: string, fn: () => void, title = ""): HTMLButtonElement {
  const b = document.createElement("button"); b.textContent = label; b.title = title
  b.style.cssText = "padding:4px 8px;border:1px solid #444;border-radius:4px;background:#1d1f22;color:#eee;cursor:pointer"
  b.onclick = fn; panel.appendChild(b); return b
}
const select = document.createElement("select")
select.style.cssText = "padding:3px;background:#1d1f22;color:#eee;border:1px solid #444;border-radius:4px"
for (let i = 0; i < 5; i++) { const o = document.createElement("option"); o.value = String(i); o.textContent = `Puppe ${i + 1}`; select.appendChild(o) }
select.value = "2"; select.onchange = () => { target = Number(select.value) }
panel.appendChild(select)
button("Treffer", () => api.wound(target), "Schusswunde in den Rumpf")
button("Kopfschuss", () => api.headshot(target))
for (const p of PARTS.filter(p => p !== "head" && p !== "torso")) button(`${PART_LABEL[p]} ab`, () => api.sever(target, p))
button("Zerlegen", () => api.gib(target), "Explosion direkt vor der Puppe")
button("Umfallen", () => api.kill(target))
button("Blutlache", () => api.pool(target))
button("Bildschirmblut", () => api.splatter(0.9))
button("Getroffen", () => api.hurt(0.7), "Rote Ränder, wenn der Spieler getroffen wird")
for (const l of ["off", "normal", "brutal"] as GoreLevel[]) levelButtons.push(button(l === "off" ? "Stufe: aus" : l === "normal" ? "Stufe: normal" : "Stufe: brutal", () => api.setLevel(l)))
button("Stresstest", () => api.stress(), "20 Leichen, ~60 Fleischbrocken, ~150 Flecken")
button("Zurücksetzen", () => api.reset())
function updateButtons(): void { levelButtons.forEach((b, i) => { b.style.borderColor = ["off", "normal", "brutal"][i] === gore.level ? "#c33" : "#444" }) }
updateButtons()

let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, fps = 0
function frame(now: number): void {
  const delta = Math.min(0.25, (now - last) / 1000); last = now
  if (!paused) { acc += delta; while (acc >= 1 / 60) { tick(1 / 60); acc -= 1 / 60 } }
  // paused (scripted captures): render only on demand via step()/render(), or when the orbit camera moves
  if (controls.update() || !paused) draw()
  fpsN++; fpsT += delta; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0 }
  const i = api.info(), s = i.gore
  info.textContent = `FPS ${fps.toFixed(0)} · Draw Calls ${i.calls} · Dreiecke ${i.triangles} · Punkte ${i.points}\n` +
    `Gore: Partikel ${s.particles} · Brocken ${s.gibs} (wach ${s.awakeGibs}) · Spritzer ${s.splats} · Lachen ${s.pools} · Tropfen ${s.drops} · Fontänen ${s.emitters}\n` +
    `gore.update ${stats.updateMs.toFixed(2)} ms (max ${stats.updateMax.toFixed(2)}) · render ${stats.renderMs.toFixed(1)} ms · Stufe ${gore.level}`
  requestAnimationFrame(frame)
}

api.reset(); resize(); requestAnimationFrame(frame)
