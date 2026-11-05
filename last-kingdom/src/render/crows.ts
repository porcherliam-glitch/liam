// Crows: a few small flocks circling high above the map, rendered as one point cloud with a bird-shaped sprite.

import * as THREE from "three"
import { Rng } from "../core/rng"

const FLOCKS = 4
const PER_FLOCK = 7

export class Crows {
  private points: THREE.Points
  private pos: Float32Array
  private centres: { x: number; z: number; y: number; r: number; speed: number; phase: number }[] = []
  private t = 0

  constructor(scene: THREE.Scene, size: number, seed: number) {
    const rng = new Rng(seed ^ 0xc70)
    for (let i = 0; i < FLOCKS; i++) this.centres.push({ x: rng.range(-size * 0.7, size * 0.7), z: rng.range(-size * 0.7, size * 0.7), y: rng.range(26, 40), r: rng.range(10, 24), speed: rng.range(0.15, 0.3), phase: rng.range(0, 6) })
    const n = FLOCKS * PER_FLOCK
    this.pos = new Float32Array(n * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    const c = document.createElement("canvas")
    c.width = c.height = 32
    const ctx = c.getContext("2d")!
    ctx.strokeStyle = "#111"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(3, 18)
    ctx.quadraticCurveTo(10, 8, 16, 16)
    ctx.quadraticCurveTo(22, 8, 29, 18)
    ctx.stroke()
    const tex = new THREE.CanvasTexture(c)
    const mat = new THREE.PointsMaterial({ size: 1.6, map: tex, transparent: true, depthWrite: false, sizeAttenuation: true, color: 0x111111 })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  update(dt: number): void {
    this.t += dt
    let k = 0
    for (let f = 0; f < FLOCKS; f++) {
      const c = this.centres[f]
      for (let i = 0; i < PER_FLOCK; i++) {
        const a = this.t * c.speed + c.phase + i * 0.35
        const r = c.r + Math.sin(a * 2.3 + i) * 2
        this.pos[k++] = c.x + Math.cos(a) * r
        this.pos[k++] = c.y + Math.sin(a * 1.7 + i) * 1.5
        this.pos[k++] = c.z + Math.sin(a) * r
      }
    }
    ;(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }

  set visible(v: boolean) {
    this.points.visible = v
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.points.removeFromParent()
  }
}
