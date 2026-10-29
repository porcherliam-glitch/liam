/**
 * zombieFx.ts — pooled effects owned by the infected: spitter acid blobs (visible ballistic arc with a dripping trail),
 * glowing acid puddles (~6 s) that burn the player standing in them, slam dust bursts and the boss shockwave ring.
 * Everything is allocated up front; update() only rewrites buffers. No textures/canvas (works in node tests).
 * Visual randomness uses an internal LCG so runs stay deterministic.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { CollisionWorld } from "./collision"
import type { Vec3 } from "./types"

const MAX_DUST = 360, MAX_GLOW = 260, MAX_BLOBS = 10, MAX_PUDDLES = 14, MAX_RINGS = 4
const GRAVITY = 9.8
export const PUDDLE_LIFE = 6
export const PUDDLE_RADIUS = 1.35

const vertex = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`
const fragment = `
varying vec4 vColor;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vColor.rgb, vColor.a * (1.0 - r)); }`

class Particles {
  readonly points: THREE.Points
  private pos: Float32Array; private col: Float32Array; private size: Float32Array
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private base: Float32Array; private grow: Float32Array; private grav: Float32Array; private a0: Float32Array
  private geo = new THREE.BufferGeometry()
  readonly material: THREE.ShaderMaterial
  private next = 0
  live = 0

  constructor(readonly count: number, additive: boolean) {
    this.pos = new Float32Array(count * 3); this.col = new Float32Array(count * 4); this.size = new Float32Array(count)
    this.vel = new Float32Array(count * 3); this.life = new Float32Array(count); this.max = new Float32Array(count); this.base = new Float32Array(count)
    this.grow = new Float32Array(count); this.grav = new Float32Array(count); this.a0 = new Float32Array(count)
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uScale: { value: 560 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })
    this.points = new THREE.Points(this.geo, this.material); this.points.frustumCulled = false; this.points.renderOrder = 2
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, grav: number, r: number, g: number, b: number, a: number): void {
    const i = this.next; this.next = (this.next + 1) % this.count
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
    this.life[i] = life; this.max[i] = life; this.base[i] = size; this.grow[i] = grow; this.grav[i] = grav
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a; this.a0[i] = a
  }

  update(dt: number): void {
    let live = 0
    const drag = Math.exp(-dt * 2.2)
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue }
      live++
      this.life[i] -= dt
      const u = 1 - Math.max(0, this.life[i]) / this.max[i]
      this.vel[i * 3 + 1] -= this.grav[i] * dt
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] = 0 }
      this.size[i] = this.base[i] * (1 + this.grow[i] * u)
      this.col[i * 4 + 3] = this.a0[i] * (1 - u) * Math.min(1, u * 8 + 0.3)
    }
    this.live = live
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true
  }

  clear(): void { this.life.fill(0); this.size.fill(0); this.geo.attributes.aSize.needsUpdate = true }
  dispose(): void { this.geo.dispose(); this.material.dispose() }
}

export interface AcidBlob { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; source: unknown; mesh: THREE.Mesh }
export interface AcidPuddle { active: boolean; x: number; y: number; z: number; r: number; life: number; tick: number; source: unknown; mesh: THREE.Mesh }
interface Ring { active: boolean; x: number; z: number; r: number; age: number; dur: number; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }

/** Player sample for acid hits: feet position and eye height. */
export interface AcidTarget { x: number; y: number; z: number; eyeY: number; active: boolean }

export class InfectedFx {
  readonly group = new THREE.Group()
  readonly blobs: AcidBlob[] = []
  readonly puddles: AcidPuddle[] = []
  private rings: Ring[] = []
  private dustP = new Particles(MAX_DUST, false)
  private glowP = new Particles(MAX_GLOW, true)
  private disposables: Array<{ dispose(): void }> = []
  private seed = 12345
  private _o: Vec3 = { x: 0, y: 0, z: 0 }
  private _d: Vec3 = { x: 0, y: 0, z: 0 }

  constructor(parent: THREE.Object3D) {
    this.group.name = "Infizierte-Effekte"
    this.group.add(this.dustP.points, this.glowP.points)
    const blobGeo = acidGlob(), blobMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    const puddleGeo = jaggedDisc(), puddleMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48)
    this.disposables.push(blobGeo, blobMat, puddleGeo, puddleMat, ringGeo)
    for (let i = 0; i < MAX_BLOBS; i++) {
      const mesh = new THREE.Mesh(blobGeo, blobMat); mesh.visible = false; this.group.add(mesh)
      this.blobs.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, source: null, mesh })
    }
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const mesh = new THREE.Mesh(puddleGeo, puddleMat); mesh.visible = false; mesh.renderOrder = 1; this.group.add(mesh)
      this.puddles.push({ active: false, x: 0, y: 0, z: 0, r: PUDDLE_RADIUS, life: 0, tick: 0, source: null, mesh })
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd9c9a6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }); this.disposables.push(mat)
      const mesh = new THREE.Mesh(ringGeo, mat); mesh.rotation.x = -Math.PI / 2; mesh.visible = false; this.group.add(mesh)
      this.rings.push({ active: false, x: 0, z: 0, r: 1, age: 0, dur: 1, mesh, mat })
    }
    parent.add(this.group)
  }

  private rnd(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296 }

  /** Ground dust burst (brute slam, boss charge impact). */
  dust(x: number, y: number, z: number, radius: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rnd() * Math.PI * 2, s = (0.6 + this.rnd()) * radius * 1.6
      const shade = 0.42 + this.rnd() * 0.15
      this.dustP.emit(x + Math.cos(a) * 0.3, y + 0.1 + this.rnd() * 0.3, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.6 + this.rnd() * 1.6, Math.sin(a) * s, 1.1 + this.rnd() * 0.9, 0.5 + this.rnd() * 0.5, 2.5, 0.6, shade, shade * 0.9, shade * 0.78, 0.55)
    }
  }

  /** Bright acid droplets. */
  splash(x: number, y: number, z: number, count: number, up = 2.2): void {
    for (let i = 0; i < count; i++) {
      const a = this.rnd() * Math.PI * 2, s = 0.5 + this.rnd() * 2
      this.glowP.emit(x, y + 0.05, z, Math.cos(a) * s, up * (0.3 + this.rnd()), Math.sin(a) * s, 0.5 + this.rnd() * 0.5, 0.07 + this.rnd() * 0.07, -0.5, GRAVITY, 0.45, 1, 0.2, 0.9)
    }
  }

  /** Expanding ground shockwave ring (visual only; damage is resolved by the caller). */
  ring(x: number, z: number, maxR: number, dur: number): void {
    const r = this.rings.find(o => !o.active) ?? this.rings[0]
    r.active = true; r.x = x; r.z = z; r.r = maxR; r.age = 0; r.dur = dur; r.mesh.visible = true; r.mesh.position.set(x, 0.06, z)
  }

  /** Lobs an acid blob from `from` so it lands on `to` after `flight` seconds. */
  launch(from: Vec3, to: Vec3, flight: number, source: unknown): void {
    const b = this.blobs.find(o => !o.active) ?? this.blobs[0]
    const T = Math.max(0.25, flight)
    b.active = true; b.age = 0; b.source = source
    b.x = from.x; b.y = from.y; b.z = from.z
    b.vx = (to.x - from.x) / T; b.vz = (to.z - from.z) / T; b.vy = (to.y - from.y + 0.5 * GRAVITY * T * T) / T
    b.mesh.visible = true; b.mesh.position.set(b.x, b.y, b.z)
  }

  private puddleAt(x: number, y: number, z: number, source: unknown): void {
    let p = this.puddles.find(o => !o.active)
    if (!p) { p = this.puddles[0]; for (const o of this.puddles) if (o.life < p.life) p = o }
    p.active = true; p.x = x; p.y = y; p.z = z; p.life = PUDDLE_LIFE; p.tick = 0; p.source = source
    p.mesh.visible = true; p.mesh.position.set(x, y + 0.03, z); p.mesh.rotation.set(-Math.PI / 2, 0, this.rnd() * Math.PI * 2)
    this.splash(x, y, z, 26)
  }

  /**
   * Advances blobs, puddles, rings and particles. onDirect(source) fires when a blob hits the player; onPuddle(source)
   * fires every 0.5 s while the player's feet stand in a puddle.
   */
  update(dt: number, collision: CollisionWorld, player: AcidTarget | null, onDirect: (source: unknown) => void, onPuddle: (source: unknown) => void): void {
    for (const b of this.blobs) {
      if (!b.active) continue
      b.age += dt
      const px = b.x, py = b.y, pz = b.z
      b.vy -= GRAVITY * dt
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt
      // trail
      if (this.rnd() < 0.85) this.glowP.emit(b.x, b.y, b.z, (this.rnd() - 0.5) * 0.4, -0.3, (this.rnd() - 0.5) * 0.4, 0.4 + this.rnd() * 0.3, 0.09, -0.4, 3, 0.5, 1, 0.25, 0.8)
      // player body (feet → eye) as a capsule of radius 0.45
      if (player && player.active) {
        const cy = Math.max(player.y + 0.2, Math.min(player.y + player.eyeY, b.y))
        if (Math.hypot(b.x - player.x, b.y - cy, b.z - player.z) < 0.5) {
          b.active = false; b.mesh.visible = false
          onDirect(b.source)
          this.puddleAt(player.x, player.y, player.z, b.source)
          continue
        }
      }
      const sx = b.x - px, sy = b.y - py, sz = b.z - pz, len = Math.hypot(sx, sy, sz)
      if (len > 1e-6) {
        this._o.x = px; this._o.y = py; this._o.z = pz; this._d.x = sx / len; this._d.y = sy / len; this._d.z = sz / len
        const hit = collision.raycast(this._o, this._d, len)
        if (hit) {
          const hx = px + this._d.x * hit.distance, hy = py + this._d.y * hit.distance, hz = pz + this._d.z * hit.distance
          b.active = false; b.mesh.visible = false
          if (hit.normal.y > 0.5) this.puddleAt(hx, hy, hz, b.source)
          else { this.splash(hx, hy, hz, 14); this.puddleAt(hx + hit.normal.x * 0.45, 0, hz + hit.normal.z * 0.45, b.source) }
          continue
        }
      }
      if (b.y <= 0.02 || b.age > 3) {
        b.active = false; b.mesh.visible = false
        if (b.y <= 0.02) this.puddleAt(b.x, 0, b.z, b.source)
        continue
      }
      // the glob points along its flight (droplets trail behind) and wobbles
      b.mesh.position.set(b.x, b.y, b.z); b.mesh.lookAt(_look.set(b.x + b.vx, b.y + b.vy, b.z + b.vz))
      const w = 1 + Math.sin(b.age * 31) * 0.13; b.mesh.scale.set(w, 2 - w, 1.12)
    }
    for (const p of this.puddles) {
      if (!p.active) continue
      p.life -= dt
      if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue }
      const age = PUDDLE_LIFE - p.life
      const s = p.r * Math.min(1, age / 0.25) * Math.min(1, p.life / 0.8)
      p.mesh.scale.set(s, s, 1)
      if (this.rnd() < dt * 9) { const a = this.rnd() * Math.PI * 2, d = this.rnd() * s * 0.8; this.glowP.emit(p.x + Math.cos(a) * d, p.y + 0.05, p.z + Math.sin(a) * d, 0, 0.35 + this.rnd() * 0.3, 0, 0.6 + this.rnd() * 0.5, 0.06 + this.rnd() * 0.05, 0.6, 0, 0.4, 0.95, 0.2, 0.75) }
      if (player && player.active) {
        p.tick -= dt
        const inside = Math.hypot(player.x - p.x, player.z - p.z) < s * 0.92 && Math.abs(player.y - p.y) < 0.6
        if (inside && p.tick <= 0) { p.tick = 0.5; onPuddle(p.source) }
        if (!inside) p.tick = Math.min(p.tick, 0)
      }
    }
    for (const r of this.rings) {
      if (!r.active) continue
      r.age += dt
      const u = r.age / r.dur
      if (u >= 1) { r.active = false; r.mesh.visible = false; continue }
      const rad = Math.max(0.05, r.r * (1 - (1 - u) * (1 - u)))
      r.mesh.scale.set(rad, rad, 1); r.mat.opacity = 0.75 * (1 - u)
    }
    this.dustP.update(dt); this.glowP.update(dt)
  }

  activeBlobs(): number { let n = 0; for (const b of this.blobs) if (b.active) n++; return n }
  activePuddles(): number { let n = 0; for (const p of this.puddles) if (p.active) n++; return n }

  clear(): void {
    for (const b of this.blobs) { b.active = false; b.mesh.visible = false }
    for (const p of this.puddles) { p.active = false; p.mesh.visible = false }
    for (const r of this.rings) { r.active = false; r.mesh.visible = false }
    this.dustP.clear(); this.glowP.clear()
  }

  dispose(): void {
    this.group.parent?.remove(this.group)
    this.dustP.dispose(); this.glowP.dispose()
    for (const d of this.disposables) d.dispose()
  }
}

/** Unit acid puddle: irregular edge, bright centre fading to a dark rim (vertex colours). */
const _look = new THREE.Vector3()

/** Spat acid: a lumpy glowing glob (bright core, darker bile patches) with three droplets trailing along -Z. */
function acidGlob(): THREE.BufferGeometry {
  const hot = new THREE.Color(0xd2ff72), bile = new THREE.Color(0x5e8a1a), c = new THREE.Color(), parts: THREE.BufferGeometry[] = []
  const lump = (r: number, x: number, y: number, z: number, seed: number, detail: number) => {
    const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i) / r, vy = p.getY(i) / r, vz = p.getZ(i) / r
      const n = Math.sin(vx * 4.1 + seed) * Math.cos(vy * 3.7 + seed * 2) * Math.sin(vz * 2.9 + seed * 3)
      const k = 1 + 0.2 * n; p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z)
      c.copy(hot).lerp(bile, Math.min(1, Math.max(0, 0.45 - n * 1.4))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.deleteAttribute("uv"); parts.push(g)
  }
  lump(0.12, 0, 0, 0, 1, 2); lump(0.05, 0.04, 0.02, -0.13, 2, 1); lump(0.034, -0.03, -0.02, -0.21, 3, 1); lump(0.022, 0.012, 0.01, -0.28, 4, 0)
  const g = mergeGeometries(parts, false)!; for (const p of parts) p.dispose()
  g.computeVertexNormals(); g.computeBoundingSphere()
  return g
}

function jaggedDisc(): THREE.BufferGeometry {
  const seg = 28, pos: number[] = [0, 0, 0], col: number[] = [0.62, 1, 0.22], idx: number[] = []
  let s = 777
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  for (let ring = 1; ring <= 2; ring++) {
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, r = ring === 1 ? 0.55 + rnd() * 0.1 : 0.82 + rnd() * 0.28
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0)
      if (ring === 1) col.push(0.38, 0.9, 0.12); else col.push(0.08, 0.32, 0.03)
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = 1 + i, b = 1 + (i + 1) % seg, c = 1 + seg + i, d = 1 + seg + (i + 1) % seg
    idx.push(0, a, b, a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}
