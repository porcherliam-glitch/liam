// Blood on the ground: one instanced mesh with a large ring buffer of splats (a single draw call). Splatters can be
// stretched along the direction of a spray, pools grow over a few seconds, blood darkens as it dries and fades
// out after a few minutes.

import * as THREE from "three"
import { tex } from "./textures"
import { cosmetic } from "../core/rng"

const POOL = 320

export interface DecalOptions {
  /** Direction of the splatter on the ground; with stretch the quad is elongated along it. */
  dirX?: number
  dirZ?: number
  stretch?: number
  /** Seconds to grow from a third of the size to full size (pools under corpses). */
  grow?: number
  opacity?: number
  /** Pools are darker and stay longer. */
  pool?: boolean
}

interface Slot {
  x: number
  y: number
  z: number
  rot: number
  age: number
  grow: number
  sx: number
  sz: number
  life: number
  opacity: number
  color: THREE.Color
  live: boolean
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const DRY = new THREE.Color(0x3c0206)

export class Decals {
  private slots: Slot[] = []
  private next = 0
  private mesh: THREE.InstancedMesh
  private opacity: THREE.InstancedBufferAttribute
  enabled = true

  constructor(private scene: THREE.Scene, private heightAt: (x: number, z: number) => number) {
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1)
    this.opacity.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute("aOpacity", this.opacity)
    const mat = new THREE.MeshBasicMaterial({ map: tex("blood"), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aOpacity;\nvarying float vOpacity;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvOpacity = aOpacity;")
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vOpacity;").replace("#include <dithering_fragment>", "gl_FragColor.a *= vOpacity;\n#include <dithering_fragment>")
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, POOL)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    _m.makeScale(0, 0, 0)
    for (let i = 0; i < POOL; i++) {
      this.mesh.setMatrixAt(i, _m)
      this.mesh.setColorAt(i, new THREE.Color(0x7a1010))
      this.slots.push({ x: 0, y: 0, z: 0, rot: 0, age: 999, grow: 0, sx: 1, sz: 1, life: 120, opacity: 0, color: new THREE.Color(0x7a1010), live: false })
    }
    scene.add(this.mesh)
  }

  spawn(x: number, z: number, size = 1, opts: DecalOptions = {}): void {
    if (!this.enabled) return
    const i = this.next
    this.next = (this.next + 1) % POOL
    const slot = this.slots[i]
    const jitter = opts.stretch ? 0.05 : 0.3
    slot.x = x + cosmetic.range(-jitter, jitter)
    slot.z = z + cosmetic.range(-jitter, jitter)
    // Tiny height offsets keep overlapping splats from flickering
    slot.y = this.heightAt(slot.x, slot.z) + 0.02 + (i % 9) * 0.0015
    const s = size * cosmetic.range(0.75, 1.3)
    slot.sx = s
    slot.sz = s * (opts.stretch ?? 1)
    slot.rot = opts.dirX !== undefined && opts.dirZ !== undefined && (opts.dirX || opts.dirZ) ? Math.atan2(opts.dirX, opts.dirZ) : cosmetic.range(0, Math.PI * 2)
    slot.grow = opts.grow ?? 0
    slot.age = 0
    slot.life = opts.pool ? 260 : 170
    slot.opacity = opts.opacity ?? cosmetic.range(0.86, 1)
    slot.color.set(opts.pool ? 0x6a0309 : cosmetic.chance(0.5) ? 0xa80e16 : 0x82080e)
    slot.live = true
    this.write(i, slot, slot.grow > 0 ? 0.3 : 1)
  }

  private write(i: number, slot: Slot, k: number): void {
    _q.setFromAxisAngle(_up, slot.rot)
    _p.set(slot.x, slot.y, slot.z)
    _s.set(slot.sx * k, 1, slot.sz * k)
    _m.compose(_p, _q, _s)
    this.mesh.setMatrixAt(i, _m)
    this.mesh.setColorAt(i, slot.color)
    this.opacity.setX(i, slot.opacity)
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this.opacity.needsUpdate = true
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      const slot = this.slots[i]
      if (!slot.live) continue
      slot.age += dt
      const a = slot.age
      let dirty = false
      let k = 1
      if (slot.grow > 0 && a < slot.grow + dt) {
        k = 0.3 + 0.7 * (1 - Math.pow(1 - Math.min(1, a / slot.grow), 2))
        dirty = true
      }
      // Fresh blood is bright, it darkens while drying
      if (a < 30) {
        slot.color.lerp(DRY, dt * 0.03)
        dirty = true
      }
      if (a > slot.life) {
        slot.live = false
        _m.makeScale(0, 0, 0)
        this.mesh.setMatrixAt(i, _m)
        this.opacity.setX(i, 0)
        this.mesh.instanceMatrix.needsUpdate = true
        this.opacity.needsUpdate = true
        continue
      }
      if (a > slot.life - 20) {
        this.opacity.setX(i, slot.opacity * (1 - (a - (slot.life - 20)) / 20))
        this.opacity.needsUpdate = true
      }
      if (dirty) this.write(i, slot, k)
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.removeFromParent()
  }
}
