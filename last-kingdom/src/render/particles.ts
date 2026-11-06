// Pooled point-sprite particles for blood, dust, sparks, embers and plague fog.

import * as THREE from "three"
import { cosmetic } from "../core/rng"
import { tex } from "./textures"

const MAX = 4000

interface P {
  life: number
  maxLife: number
  vx: number
  vy: number
  vz: number
  gravity: number
  size: number
  drag: number
}

export class Particles {
  readonly points: THREE.Points
  private pos: Float32Array
  private col: Float32Array
  private sizes: Float32Array
  private parts: P[] = []
  private free: number[] = []
  private material: THREE.ShaderMaterial
  /** With gore disabled, blood becomes grey dust. */
  gore = true

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX * 3)
    this.col = new Float32Array(MAX * 4)
    this.sizes = new Float32Array(MAX)
    for (let i = 0; i < MAX; i++) {
      this.parts.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, gravity: 0, size: 0, drag: 0 })
      this.free.push(i)
      this.pos[i * 3 + 1] = -1000
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage))
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex("particle") }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float uScale;
        void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec4 vColor;
        void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
  }

  setViewport(height: number): void {
    this.material.uniforms.uScale.value = height * 0.6
  }

  emit(x: number, y: number, z: number, opts: { count: number; color: number; spread: number; speed: number; up?: number; life: number; size: number; gravity?: number; drag?: number; alpha?: number }): void {
    const c = new THREE.Color(opts.color)
    for (let i = 0; i < opts.count; i++) {
      const idx = this.free.pop()
      if (idx === undefined) return
      const p = this.parts[idx]
      const a = cosmetic.range(0, Math.PI * 2)
      const el = cosmetic.range(-0.4, 1)
      const sp = opts.speed * cosmetic.range(0.4, 1.2)
      p.vx = Math.cos(a) * sp * opts.spread
      p.vz = Math.sin(a) * sp * opts.spread
      p.vy = (opts.up ?? 1) * sp * el
      p.life = p.maxLife = opts.life * cosmetic.range(0.6, 1.3)
      p.gravity = opts.gravity ?? 9
      p.size = opts.size * cosmetic.range(0.7, 1.4)
      p.drag = opts.drag ?? 1
      this.pos[idx * 3] = x + cosmetic.range(-0.1, 0.1)
      this.pos[idx * 3 + 1] = y + cosmetic.range(-0.1, 0.1)
      this.pos[idx * 3 + 2] = z + cosmetic.range(-0.1, 0.1)
      const v = cosmetic.range(0.75, 1.1)
      this.col[idx * 4] = c.r * v
      this.col[idx * 4 + 1] = c.g * v
      this.col[idx * 4 + 2] = c.b * v
      this.col[idx * 4 + 3] = opts.alpha ?? 1
      this.sizes[idx] = p.size
    }
  }

  /** Cone-shaped emission along a direction (blood sprays, arterial spurts). */
  spray(x: number, y: number, z: number, dx: number, dy: number, dz: number, opts: { count: number; color: number; cone: number; speed: number; life: number; size: number; gravity?: number; drag?: number; alpha?: number }): void {
    const c = new THREE.Color(this.gore || opts.color === 0x6a6a66 ? opts.color : 0x6a6a66)
    const len = Math.hypot(dx, dy, dz) || 1
    for (let i = 0; i < opts.count; i++) {
      const idx = this.free.pop()
      if (idx === undefined) return
      const p = this.parts[idx]
      const sp = opts.speed * cosmetic.range(0.45, 1.25)
      const vx = dx / len + cosmetic.range(-opts.cone, opts.cone)
      const vy = dy / len + cosmetic.range(-opts.cone, opts.cone) * 0.7
      const vz = dz / len + cosmetic.range(-opts.cone, opts.cone)
      const vl = Math.hypot(vx, vy, vz) || 1
      p.vx = (vx / vl) * sp
      p.vy = (vy / vl) * sp
      p.vz = (vz / vl) * sp
      p.life = p.maxLife = opts.life * cosmetic.range(0.6, 1.3)
      p.gravity = opts.gravity ?? 9
      p.size = opts.size * cosmetic.range(0.6, 1.5)
      p.drag = opts.drag ?? 0.6
      this.pos[idx * 3] = x
      this.pos[idx * 3 + 1] = y
      this.pos[idx * 3 + 2] = z
      const v = cosmetic.range(0.7, 1.15)
      this.col[idx * 4] = c.r * v
      this.col[idx * 4 + 1] = c.g * v
      this.col[idx * 4 + 2] = c.b * v
      this.col[idx * 4 + 3] = opts.alpha ?? 1
      this.sizes[idx] = p.size
    }
  }

  blood(x: number, y: number, z: number, amount = 14): void {
    this.emit(x, y, z, { count: amount, color: this.gore ? 0x6a0a10 : 0x6a6a66, spread: 1, speed: 3.5, life: 0.7, size: 0.16, gravity: 14 })
  }

  dust(x: number, y: number, z: number, amount = 8): void {
    this.emit(x, y, z, { count: amount, color: 0x9a8a70, spread: 1, speed: 1.2, life: 0.9, size: 0.5, gravity: -0.5, alpha: 0.35, drag: 2 })
  }

  sparks(x: number, y: number, z: number): void {
    this.emit(x, y, z, { count: 12, color: 0xffc060, spread: 1, speed: 5, life: 0.35, size: 0.08, gravity: 12 })
  }

  embers(x: number, y: number, z: number, amount = 2): void {
    this.emit(x, y, z, { count: amount, color: 0xff8030, spread: 0.3, speed: 0.6, up: 2, life: 1.4, size: 0.1, gravity: -1.5, alpha: 0.9 })
  }

  plague(x: number, y: number, z: number, amount = 3): void {
    this.emit(x, y, z, { count: amount, color: 0x4a8a3a, spread: 1, speed: 0.5, life: 2.5, size: 1.6, gravity: -0.2, alpha: 0.18, drag: 1 })
  }

  smoke(x: number, y: number, z: number, amount = 3): void {
    this.emit(x, y, z, { count: amount, color: 0x3a3a3a, spread: 0.4, speed: 0.4, up: 2, life: 2.2, size: 1.0, gravity: -0.6, alpha: 0.3, drag: 1 })
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i]
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) {
        this.pos[i * 3 + 1] = -1000
        this.free.push(i)
        continue
      }
      p.vy -= p.gravity * dt
      const drag = Math.exp(-p.drag * dt)
      p.vx *= drag
      p.vz *= drag
      this.pos[i * 3] += p.vx * dt
      this.pos[i * 3 + 1] += p.vy * dt
      this.pos[i * 3 + 2] += p.vz * dt
      const f = p.life / p.maxLife
      this.col[i * 4 + 3] = Math.min(this.col[i * 4 + 3], f * 1.5)
      this.sizes[i] = p.size * (p.gravity < 0 ? 1 + (1 - f) * 1.5 : 1)
    }
    const g = this.points.geometry
    ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true
    ;(g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.material.dispose()
    this.points.removeFromParent()
  }
}
