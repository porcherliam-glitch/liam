// Heightmap terrain per area: a vertex-coloured plane with a repeating ground texture.
// heightAt() is the single source of truth for ground height used by movement, placement and the camera.

import * as THREE from "three"
import { Noise2D } from "../core/noise"
import { clamp, smoothstep } from "../core/math"
import type { AreaDef } from "../core/types"
import { groundTexture } from "../render/textures"

export interface TerrainFeature {
  kind: "flatten" | "raise" | "river" | "lake" | "road"
  x: number
  z: number
  /** Radius for round features. */
  r?: number
  /** For rivers / roads: second point. */
  x2?: number
  z2?: number
  width?: number
  height?: number
}

export class Terrain {
  readonly size: number
  readonly mesh: THREE.Mesh
  private noise: Noise2D
  private features: TerrainFeature[]
  private heightCache: Float32Array
  private res: number
  private step: number
  readonly waterLevel: number

  constructor(private area: AreaDef, features: TerrainFeature[] = []) {
    this.size = area.size
    this.noise = new Noise2D(area.seed)
    this.features = features
    this.res = Math.round((this.size * 2) / 2) // 2 m per sample
    this.step = (this.size * 2) / this.res
    this.waterLevel = area.biome === "forest" || area.biome === "monastery" || area.biome === "village" || area.biome === "city" ? -0.9 : -50
    this.heightCache = new Float32Array((this.res + 1) * (this.res + 1))
    for (let j = 0; j <= this.res; j++) {
      for (let i = 0; i <= this.res; i++) {
        const x = -this.size + i * this.step
        const z = -this.size + j * this.step
        this.heightCache[j * (this.res + 1) + i] = this.rawHeight(x, z)
      }
    }
    this.mesh = this.buildMesh()
  }

  private rawHeight(x: number, z: number): number {
    const b = this.area.biome
    const n = this.noise
    let h = 0
    const amp = b === "forest" ? 3.2 : b === "graveyard" ? 1.2 : b === "catacombs" ? 0 : b === "city" ? 0.5 : b === "castle" || b === "fortress" ? 1.6 : 1.8
    const freq = b === "forest" ? 0.012 : 0.009
    h = n.fbm(x * freq, z * freq, 4) * amp + n.fbm(x * 0.05 + 7, z * 0.05 + 3, 2) * 0.25
    // Bowl: edges rise so the world has a natural boundary.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / this.size
    h += smoothstep(0.82, 1.0, edge) * 14
    // Features
    for (const f of this.features) {
      if (f.kind === "flatten" || f.kind === "raise") {
        const d = Math.hypot(x - f.x, z - f.z)
        const w = 1 - smoothstep((f.r ?? 10) * 0.6, f.r ?? 10, d)
        if (w > 0) {
          const target = f.kind === "flatten" ? (f.height ?? 0) : h + (f.height ?? 2)
          h = h + (target - h) * w
        }
      } else if (f.kind === "lake") {
        const d = Math.hypot(x - f.x, z - f.z)
        const w = 1 - smoothstep((f.r ?? 10) * 0.5, f.r ?? 10, d)
        if (w > 0) h = h + (-(f.height ?? 3) - h) * w
      } else if (f.kind === "river" || f.kind === "road") {
        const d = distToSegment(x, z, f.x, f.z, f.x2 ?? f.x, f.z2 ?? f.z)
        const width = f.width ?? 6
        const w = 1 - smoothstep(width * 0.5, width, d)
        if (w > 0) {
          if (f.kind === "river") h = h + (-(f.height ?? 2.5) - h) * w
          else h = h + (f.height ?? h) * 0 // roads keep height but get flattened by the colour pass
        }
      }
    }
    return h
  }

  /** Bilinear interpolation of the cached grid; clamps outside the map. */
  heightAt(x: number, z: number): number {
    const fx = clamp((x + this.size) / this.step, 0, this.res - 0.001)
    const fz = clamp((z + this.size) / this.step, 0, this.res - 0.001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const w = this.res + 1
    const h00 = this.heightCache[j * w + i]
    const h10 = this.heightCache[j * w + i + 1]
    const h01 = this.heightCache[(j + 1) * w + i]
    const h11 = this.heightCache[(j + 1) * w + i + 1]
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
  }

  normalAt(x: number, z: number): THREE.Vector3 {
    const e = 0.5
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z)
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e)
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize()
  }

  slopeAt(x: number, z: number): number {
    return 1 - this.normalAt(x, z).y
  }

  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < this.waterLevel
  }

  private buildMesh(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(this.size * 2, this.size * 2, this.res, this.res)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const b = this.area.biome
    const base = new THREE.Color(b === "forest" ? 0x6a8a4c : b === "graveyard" ? 0x9a9680 : b === "catacombs" ? 0x6a6872 : b === "castle" || b === "fortress" ? 0xa09c8c : b === "city" ? 0xa09c90 : b === "monastery" ? 0x8a9a62 : 0x8aa45a)
    const dark = new THREE.Color(0x3a4030)
    const rockC = new THREE.Color(0x76726a)
    const roadC = new THREE.Color(0x8a7a62)
    const mudC = new THREE.Color(0x4a3e30)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = this.heightAt(x, z)
      pos.setY(i, h)
      const slope = this.slopeAt(x, z)
      const n = this.noise.fbm(x * 0.03 + 11, z * 0.03 + 5, 3) * 0.5 + 0.5
      tmp.copy(base).lerp(dark, n * 0.35)
      if (slope > 0.25) tmp.lerp(rockC, smoothstep(0.25, 0.6, slope))
      if (h < this.waterLevel + 1.2) tmp.lerp(mudC, smoothstep(this.waterLevel + 1.2, this.waterLevel, h))
      for (const f of this.features) {
        if (f.kind !== "road") continue
        const d = distToSegment(x, z, f.x, f.z, f.x2 ?? f.x, f.z2 ?? f.z)
        const width = f.width ?? 5
        const w = 1 - smoothstep(width * 0.35, width * 0.6, d)
        if (w > 0) tmp.lerp(roadC, w * 0.85)
      }
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const texture = groundTexture(b).clone()
    const tile = b === "city" || b === "catacombs" ? 1.5 : b === "castle" || b === "fortress" ? 2 : 3
    texture.repeat.set(this.size / tile, this.size / tile)
    texture.needsUpdate = true
    const material = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1, metalness: 0 })
    const mesh = new THREE.Mesh(geo, material)
    mesh.receiveShadow = true
    mesh.castShadow = false
    mesh.matrixAutoUpdate = false
    return mesh
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0
  t = clamp(t, 0, 1)
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}
