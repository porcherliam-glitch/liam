/**
 * effects.ts — pooled world-space effects: travelling tracers, impact particles (dust, sparks, blood), bullet-hole
 * decals, explosions (flash, fire, smoke, debris) and the muzzle-flash light. Everything is allocated once; the hot
 * path only rewrites buffers.
 */
import * as THREE from "three"
import type { Vec3 } from "./types"

const MAX_PARTICLES = 900
const MAX_TRACERS = 40
const MAX_DECALS = 96

type ParticleKind = 0 | 1 // 0 = alpha blended (dust, smoke, blood), 1 = additive (sparks, fire)

function softDotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.45, "rgba(255,255,255,0.55)"); grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function decalTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, "rgba(8,8,8,1)"); grad.addColorStop(0.22, "rgba(20,18,16,0.95)"); grad.addColorStop(0.45, "rgba(40,36,32,0.45)"); grad.addColorStop(1, "rgba(60,55,50,0)")
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  g.strokeStyle = "rgba(25,22,20,0.6)"; g.lineWidth = 1.5
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; g.beginPath(); g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.lineTo(32 + Math.cos(a) * (14 + (i % 3) * 5), 32 + Math.sin(a) * (14 + (i % 3) * 5)); g.stroke() }
  return new THREE.CanvasTexture(c)
}

const particleVertex = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor;
uniform float uScale;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`
const particleFragment = `
uniform sampler2D uMap; varying vec4 vColor;
void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.01) discard; }`

class ParticlePool {
  readonly points: THREE.Points
  private pos: Float32Array
  private col: Float32Array
  private size: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private maxLife: Float32Array
  private grow: Float32Array
  private drag: Float32Array
  private gravity: Float32Array
  private baseSize: Float32Array
  private alpha0: Float32Array
  private next = 0
  private geometry = new THREE.BufferGeometry()
  readonly material: THREE.ShaderMaterial

  constructor(count: number, additive: boolean, map: THREE.Texture) {
    this.pos = new Float32Array(count * 3); this.col = new Float32Array(count * 4); this.size = new Float32Array(count)
    this.vel = new Float32Array(count * 3); this.life = new Float32Array(count); this.maxLife = new Float32Array(count)
    this.grow = new Float32Array(count); this.drag = new Float32Array(count); this.gravity = new Float32Array(count)
    this.baseSize = new Float32Array(count); this.alpha0 = new Float32Array(count)
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -1000
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } }, vertexShader: particleVertex, fragmentShader: particleFragment,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false
    this.points.renderOrder = additive ? 5 : 4
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, r: number, g: number, b: number, a: number, drag: number, gravity: number): void {
    const i = this.next; this.next = (this.next + 1) % this.life.length
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
    this.life[i] = life; this.maxLife[i] = life; this.baseSize[i] = size; this.grow[i] = grow; this.drag[i] = drag; this.gravity[i] = gravity
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.alpha0[i] = a; this.col[i * 4 + 3] = a; this.size[i] = size
  }

  update(dt: number): void {
    const n = this.life.length
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1000; this.col[i * 4 + 3] = 0; continue }
      const k = Math.max(0, 1 - this.drag[i] * dt)
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt; this.vel[i * 3 + 2] *= k
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (this.pos[i * 3 + 1] < 0.02 && this.gravity[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6 }
      const t = 1 - this.life[i] / this.maxLife[i]
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * t)
      this.col[i * 4 + 3] = this.alpha0[i] * (1 - t) * (1 - t * 0.3)
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aColor.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
  }

  dispose(): void { this.geometry.dispose(); this.material.dispose() }
}

interface Tracer { mesh: THREE.Mesh; from: THREE.Vector3; dir: THREE.Vector3; length: number; travelled: number; speed: number; active: boolean }

export type ImpactKind = "concrete" | "metal" | "dirt" | "flesh"

export class Effects {
  readonly group = new THREE.Group()
  private dotTexture = softDotTexture()
  private decalTex = decalTexture()
  private alpha = new ParticlePool(MAX_PARTICLES, false, this.dotTexture)
  private additive = new ParticlePool(Math.floor(MAX_PARTICLES / 2), true, this.dotTexture)
  private tracers: Tracer[] = []
  private tracerGeo = new THREE.BoxGeometry(1, 1, 1)
  private playerTracerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  private enemyTracerMat = new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  private decals: THREE.InstancedMesh
  private decalNext = 0
  private decalGeo = new THREE.PlaneGeometry(1, 1)
  private decalMat: THREE.MeshBasicMaterial
  private explosionLight = new THREE.PointLight(0xffa04a, 0, 22, 2)
  private explosionLightTime = 0
  readonly muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2)
  private muzzleTime = 0
  private rand = Math.random

  constructor(parent: THREE.Object3D) {
    parent.add(this.group)
    this.group.add(this.alpha.points, this.additive.points, this.explosionLight, this.muzzleLight)
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mesh = new THREE.Mesh(this.tracerGeo, this.playerTracerMat); mesh.visible = false; mesh.frustumCulled = false; this.group.add(mesh)
      this.tracers.push({ mesh, from: new THREE.Vector3(), dir: new THREE.Vector3(), length: 0, travelled: 0, speed: 0, active: false })
    }
    this.decalMat = new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.9 })
    this.decals = new THREE.InstancedMesh(this.decalGeo, this.decalMat, MAX_DECALS)
    this.decals.count = 0; this.decals.frustumCulled = false; this.group.add(this.decals)
  }

  /** Scales particle size with viewport height (call on resize). */
  setViewportHeight(h: number): void { this.alpha.material.uniforms.uScale.value = h * 0.55; this.additive.material.uniforms.uScale.value = h * 0.55 }

  /** A tracer streak travelling from a to b. Player tracers start slightly ahead of the camera. */
  tracer(a: Vec3, b: Vec3, enemy = false): void {
    const t = this.tracers.find(v => !v.active) ?? this.tracers[0]
    t.from.set(a.x, a.y, a.z)
    t.dir.set(b.x - a.x, b.y - a.y, b.z - a.z)
    t.length = t.dir.length(); if (t.length < 0.5) return
    t.dir.divideScalar(t.length)
    t.travelled = enemy ? 0 : Math.min(2.5, t.length * 0.3)
    t.speed = enemy ? 220 : 380
    t.active = true; t.mesh.visible = true
    t.mesh.material = enemy ? this.enemyTracerMat : this.playerTracerMat
    t.mesh.quaternion.setFromUnitVectors(_z, t.dir)
  }

  /** Puff of particles where a bullet hit. normal points away from the surface. */
  impact(p: Vec3, n: Vec3, kind: ImpactKind, decal = true): void {
    const r = this.rand
    if (kind === "flesh") {
      for (let i = 0; i < 9; i++) this.alpha.emit(p.x, p.y, p.z, n.x * 1.5 + (r() - 0.5) * 2, n.y * 1.5 + r() * 1.2, n.z * 1.5 + (r() - 0.5) * 2, 0.35 + r() * 0.25, 0.09 + r() * 0.08, 2.2, 0.45, 0.04, 0.03, 0.85, 3, 4)
      return
    }
    const dust = kind === "metal" ? [0.5, 0.5, 0.48] : kind === "dirt" ? [0.42, 0.36, 0.28] : [0.62, 0.6, 0.56]
    for (let i = 0; i < 7; i++) this.alpha.emit(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * (1 + r() * 2) + (r() - 0.5), n.y * (1 + r() * 2) + r() * 0.8, n.z * (1 + r() * 2) + (r() - 0.5), 0.5 + r() * 0.5, 0.12 + r() * 0.1, 3.5, dust[0], dust[1], dust[2], 0.55, 2.5, 0.6)
    const sparks = kind === "metal" ? 10 : kind === "concrete" ? 4 : 0
    for (let i = 0; i < sparks; i++) this.additive.emit(p.x, p.y, p.z, n.x * 4 + (r() - 0.5) * 6, n.y * 4 + r() * 4, n.z * 4 + (r() - 0.5) * 6, 0.18 + r() * 0.2, 0.035, 0, 1, 0.75, 0.35, 1, 1.5, 9)
    if (decal) this.addDecal(p, n)
  }

  private addDecal(p: Vec3, n: Vec3): void {
    const i = this.decalNext; this.decalNext = (this.decalNext + 1) % MAX_DECALS
    _n.set(n.x, n.y, n.z)
    _q.setFromUnitVectors(_z, _n)
    _q2.setFromAxisAngle(_n, this.rand() * Math.PI * 2); _q.premultiply(_q2)
    const s = 0.09 + this.rand() * 0.05
    _m.compose(_p.set(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012), _q, _s.set(s, s, s))
    this.decals.setMatrixAt(i, _m)
    this.decals.count = Math.min(MAX_DECALS, Math.max(this.decals.count, i + 1))
    this.decals.instanceMatrix.needsUpdate = true
  }

  /** Short-lived flash light at the player's muzzle (world space). */
  muzzleFlash(p: Vec3, strength = 1): void { this.muzzleLight.position.set(p.x, p.y, p.z); this.muzzleLight.intensity = 6 * strength; this.muzzleTime = 0.05 }

  /** Small smoke puff at an enemy muzzle (the flash itself is part of the soldier model). */
  muzzleSmoke(p: Vec3): void { for (let i = 0; i < 2; i++) this.alpha.emit(p.x, p.y, p.z, (this.rand() - 0.5) * 0.4, 0.3 + this.rand() * 0.3, (this.rand() - 0.5) * 0.4, 0.6, 0.12, 3, 0.7, 0.7, 0.68, 0.25, 1.5, -0.2) }

  explosion(p: Vec3): void {
    const r = this.rand
    this.explosionLight.position.set(p.x, p.y + 1, p.z); this.explosionLight.intensity = 60; this.explosionLightTime = 0.35
    for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, s = 2 + r() * 7; this.additive.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * s, 1 + r() * 6, Math.sin(a) * s, 0.25 + r() * 0.35, 0.5 + r() * 0.6, 1.5, 1, 0.55 + r() * 0.3, 0.2, 1, 3.5, -1) }
    for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, s = 1 + r() * 4; this.alpha.emit(p.x, p.y + 0.4, p.z, Math.cos(a) * s, 0.8 + r() * 3, Math.sin(a) * s, 1.6 + r() * 1.6, 0.8 + r() * 0.9, 3.2, 0.2, 0.19, 0.18, 0.75, 1.4, -0.4) }
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, s = 4 + r() * 9; this.alpha.emit(p.x, p.y + 0.2, p.z, Math.cos(a) * s, 3 + r() * 7, Math.sin(a) * s, 0.9 + r() * 0.6, 0.06, 0, 0.12, 0.1, 0.08, 1, 0.3, 14) }
    for (let i = 0; i < 24; i++) { const a = r() * Math.PI * 2, s = 6 + r() * 10; this.additive.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * s, 2 + r() * 8, Math.sin(a) * s, 0.4 + r() * 0.5, 0.05, 0, 1, 0.7, 0.3, 1, 0.8, 12) }
  }

  /** Red smoke flare (extraction) — call each frame while active. */
  flareSmoke(p: Vec3, dt: number): void {
    if (this.rand() > dt * 30) return
    const r = this.rand
    this.alpha.emit(p.x + (r() - 0.5) * 0.2, p.y + 0.2, p.z + (r() - 0.5) * 0.2, (r() - 0.5) * 0.6 + 0.4, 1.4 + r() * 0.8, (r() - 0.5) * 0.6, 3 + r() * 2, 0.6 + r() * 0.4, 4, 0.75, 0.16, 0.12, 0.5, 0.4, -0.15)
  }

  /** camera: tracers are clipped so they never pass closer than ~1.6 m to the viewer (no screen-filling streaks). */
  update(dt: number, camera?: Vec3): void {
    this.alpha.update(dt); this.additive.update(dt)
    for (const t of this.tracers) {
      if (!t.active) continue
      t.travelled += t.speed * dt
      const streak = Math.min(t.length, t.speed * 0.022)
      let head = Math.min(t.length, t.travelled), tail = Math.max(0, head - streak)
      if (camera) {
        // parameter of the closest approach to the camera along the tracer
        const along = (camera.x - t.from.x) * t.dir.x + (camera.y - t.from.y) * t.dir.y + (camera.z - t.from.z) * t.dir.z
        const cx = t.from.x + t.dir.x * along - camera.x, cy = t.from.y + t.dir.y * along - camera.y, cz = t.from.z + t.dir.z * along - camera.z
        const miss = Math.sqrt(cx * cx + cy * cy + cz * cz)
        if (miss < 1.6 && along > 0) {
          const cut = along - Math.sqrt(Math.max(0, 1.6 * 1.6 - miss * miss))
          if (tail >= cut) { t.active = false; t.mesh.visible = false; continue }
          head = Math.min(head, cut)
        }
      }
      if (tail >= t.length - 0.01) { t.active = false; t.mesh.visible = false; continue }
      const mid = (head + tail) / 2, len = Math.max(0.05, head - tail)
      t.mesh.position.copy(t.from).addScaledVector(t.dir, mid)
      t.mesh.scale.set(0.022, 0.022, len)
    }
    if (this.muzzleTime > 0) { this.muzzleTime -= dt; if (this.muzzleTime <= 0) this.muzzleLight.intensity = 0 }
    if (this.explosionLightTime > 0) { this.explosionLightTime -= dt; this.explosionLight.intensity = Math.max(0, this.explosionLightTime / 0.35) * 60 }
  }

  /** Removes decals and active particles (new raid). */
  clear(): void {
    this.decals.count = 0; this.decalNext = 0
    for (const t of this.tracers) { t.active = false; t.mesh.visible = false }
  }

  dispose(): void {
    this.group.parent?.remove(this.group)
    this.alpha.dispose(); this.additive.dispose(); this.tracerGeo.dispose(); this.playerTracerMat.dispose(); this.enemyTracerMat.dispose()
    this.decalGeo.dispose(); this.decalMat.dispose(); this.decals.dispose(); this.dotTexture.dispose(); this.decalTex.dispose()
  }
}

const _z = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3()
