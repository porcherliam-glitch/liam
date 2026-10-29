/**
 * model-bench.ts — studio bench for character models (dev-models.html, not part of the shipped game): one infected
 * variant in a neutral pose under daylight, with camera presets for the whole body, the face, a hand and the back.
 *
 *   __models.show(kind, variant)      __models.view("body" | "face" | "hand" | "back" | "side")
 *   __models.pose({ jaw, headPitch, … })   __models.triangles()   __models.ready
 */
import * as THREE from "three"
import type { InfectedKind } from "../game/infectedData"
import { applyPose, createRig, InfectedAssets, P, POSE_N, type PoseKey, type Rig } from "../game/zombieModel"

document.body.style.cssText = "margin:0;background:#0d0f11;overflow:hidden"
const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block"
document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(1)
renderer.shadowMap.enabled = true
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x7d8c99)
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 100)
scene.add(new THREE.HemisphereLight(0xc4d2de, 0x4a4236, 1.2))
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.position.set(-3, 6, -4); sun.castShadow = true; scene.add(sun)
const rim = new THREE.DirectionalLight(0xbcd0ff, 0.8); rim.position.set(3, 2, 4); scene.add(rim)
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x55584f, roughness: 0.95 }))
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)

const assets = new InfectedAssets()
let root = new THREE.Group(), rig: Rig | null = null
const pose = new Float32Array(POSE_N)
function show(kind: InfectedKind, variant = 0): void {
  scene.remove(root); root = new THREE.Group(); root.rotation.y = Math.PI // face the camera (+Z)
  rig = createRig(assets, kind, variant, root)
  for (const m of rig.meshes) { m.castShadow = true; m.receiveShadow = true }
  pose.fill(0); applyPose(rig, pose); scene.add(root); view(current)
}
let current = "body"
function view(name: string): void {
  current = name
  if (!rig) return
  root.updateMatrixWorld(true)
  const head = rig.head.getWorldPosition(new THREE.Vector3()), S = rig.spec, h = S.headR
  const hand = rig.elbowR.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -S.foreArm - S.hand * 0.4, 0))
  const H = S.height
  const v: Record<string, [THREE.Vector3, THREE.Vector3]> = {
    body: [new THREE.Vector3(0.25 * H, H * 0.62, H * 1.75), new THREE.Vector3(0, H * 0.52, 0)],
    face: [head.clone().add(new THREE.Vector3(h * 1.2, h * 1.2, h * 7.5)), head.clone().add(new THREE.Vector3(0, h * 1.05, 0))],
    hand: [hand.clone().add(new THREE.Vector3(-0.25, 0.05, 0.45)), hand],
    back: [new THREE.Vector3(-0.35 * H, H * 0.7, -H * 1.6), new THREE.Vector3(0, H * 0.55, 0)],
    side: [new THREE.Vector3(H * 1.7, H * 0.6, 0.2), new THREE.Vector3(0, H * 0.52, 0)],
  }
  const [eye, at] = v[name] ?? v.body
  camera.position.copy(eye); camera.lookAt(at); render()
}
function render(): void {
  const w = innerWidth, hgt = innerHeight; renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix()
  renderer.render(scene, camera)
}
const api = {
  ready: false,
  show, view,
  pose(o: Partial<Record<PoseKey, number>>): void { for (const [k, v] of Object.entries(o)) pose[P[k as PoseKey]] = v as number; if (rig) applyPose(rig, pose); render() },
  triangles(): number { let t = 0; root.traverse(o => { if (o instanceof THREE.Mesh && o.visible) { const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3 } }); return t },
}
;(window as unknown as { __models: typeof api }).__models = api
addEventListener("resize", render)
show("walker", 0); api.ready = true
