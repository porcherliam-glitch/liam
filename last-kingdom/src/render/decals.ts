// Blood decals on the ground: a small pool of textured quads, recycled oldest-first, fading over time.

import * as THREE from "three"
import { tex } from "./textures"
import { cosmetic } from "../core/rng"

const POOL = 48

export class Decals {
  private meshes: THREE.Mesh[] = []
  private ages: number[] = []
  private next = 0
  enabled = true

  constructor(private scene: THREE.Scene, private heightAt: (x: number, z: number) => number) {
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex("blood"), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0x7a1010 })
      const m = new THREE.Mesh(geo, mat)
      m.visible = false
      m.renderOrder = 1
      scene.add(m)
      this.meshes.push(m)
      this.ages.push(999)
    }
  }

  spawn(x: number, z: number, size = 1): void {
    if (!this.enabled) return
    const i = this.next
    this.next = (this.next + 1) % POOL
    const m = this.meshes[i]
    m.position.set(x + cosmetic.range(-0.3, 0.3), this.heightAt(x, z) + 0.03, z + cosmetic.range(-0.3, 0.3))
    m.rotation.y = cosmetic.range(0, Math.PI * 2)
    const s = size * cosmetic.range(0.7, 1.4)
    m.scale.set(s, 1, s)
    m.visible = true
    this.ages[i] = 0
    ;(m.material as THREE.MeshBasicMaterial).opacity = 0.85
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if (!this.meshes[i].visible) continue
      this.ages[i] += dt
      const a = this.ages[i]
      if (a > 60) {
        this.meshes[i].visible = false
        continue
      }
      if (a > 40) (this.meshes[i].material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - (a - 40) / 20)
    }
  }

  dispose(): void {
    for (const m of this.meshes) {
      ;(m.material as THREE.Material).dispose()
      m.removeFromParent()
    }
    this.meshes[0]?.geometry.dispose()
  }
}
