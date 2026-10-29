/**
 * prop-bench.ts — developer bench for world props (dev-props.html, not part of the shipped game): every loot
 * container closed and opened, side by side under game-like daylight, with orbit presets for screenshots.
 *
 *   __propBench.view(name) — "all" | "front" | "<kind>"   (camera preset)
 *   __propBench.camera([x, y, z, tx, ty, tz, fov?])        (free camera)
 *   __propBench.ready / triangles()
 */
import * as THREE from "three"
import { airdropModel, ContainerField, groundBagModel } from "../game/loot"
import { buildHandItem } from "../game/weaponModels"
import type { ContainerKind, LootSpot } from "../game/zone"

document.body.style.cssText = "margin:0;background:#0d0f11;overflow:hidden"
const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block"
document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(1)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fa3b5)
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200)
scene.add(new THREE.HemisphereLight(0xc4d2de, 0x4a4236, 1.25))
const sun = new THREE.DirectionalLight(0xfff0dc, 2.2); sun.position.set(-6, 10, 7); sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); scene.add(sun)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x5d6056, roughness: 0.95 }))
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.BoxGeometry(24, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 }))
wall.position.set(0, 1.5, -1.1); wall.receiveShadow = true; scene.add(wall)

const KINDS: ContainerKind[] = ["crate", "cabinet", "fridge", "toolbox", "weaponcase", "medcab", "safe", "duffel"]
const X: Record<ContainerKind, number> = { crate: -9, cabinet: -6.4, fridge: -4.6, toolbox: -2.9, weaponcase: -1.2, medcab: 1, safe: 2.8, duffel: 4.8 }
const spots: { spot: LootSpot; items: [] }[] = []
for (const k of KINDS) for (const row of [0, 1]) spots.push({ spot: { x: X[k] + row * 0, z: row === 0 ? -0.4 : 2.2, yaw: 0, tier: 0, category: "civil", container: k, indoor: true, y: k === "medcab" ? 0 : 0 }, items: [] })
const field = new ContainerField(scene, spots)
for (const r of field.list) if (r.position.z > 1) field.open(r)
for (let i = 0; i < 30; i++) field.update(0.05)

// ground props: supply drop under its chute and landed, dropped backpack, thrown grenade and molotov
const dropAir = airdropModel(); dropAir.position.set(9, 2.2, -0.2); scene.add(dropAir)
const dropLanded = airdropModel(); dropLanded.position.set(9, 0.45, 2.6); dropLanded.children[1].visible = false; dropLanded.rotation.y = 0.4; scene.add(dropLanded)
const bag = groundBagModel(); bag.position.set(6.6, 0, 1.6); bag.rotation.set(-0.12, 0.5, 0, "YXZ"); scene.add(bag)
for (const [i, id] of (["grenade", "molotov", "smoke", "flashbang", "decoy"] as const).entries()) { const m = buildHandItem(id, "world").group; m.scale.setScalar(1.5); m.position.set(6.3 + i * 0.35, 0.15, 2.6); scene.add(m) }

const views: Record<string, number[]> = {
  drop: [12.5, 3.2, 8.5, 8.6, 2.4, 0.8, 50],
  bag: [7.4, 0.7, 3.4, 6.6, 0.25, 2.0, 30],

  all: [-2, 4.2, 9.5, -2, 0.6, 0.8, 50],
  front: [-2, 1.4, 7.5, -2, 0.8, 0.8, 55],
}
for (const k of KINDS) views[k] = [X[k] + 1.6, 1.7, 4.6, X[k], 0.75, 0.9, 38]
let cam = views.all
function render(): void {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h
  camera.fov = cam[6] ?? 40; camera.updateProjectionMatrix()
  camera.position.set(cam[0], cam[1], cam[2]); camera.lookAt(cam[3], cam[4], cam[5])
  renderer.render(scene, camera)
}
const api = {
  ready: false,
  view(name: string): void { cam = views[name] ?? views.all; render() },
  camera(v: number[]): void { cam = v; render() },
  triangles(): Record<string, number> {
    const out: Record<string, number> = {}
    scene.traverse(o => { if (o instanceof THREE.InstancedMesh) { const g = o.geometry; out[`${o.uuid.slice(0, 4)}`] = (g.index ? g.index.count : g.attributes.position.count) / 3 } })
    return out
  },
  scene,
}
;(window as unknown as { __propBench: typeof api }).__propBench = api
addEventListener("resize", render)
render(); api.ready = true
