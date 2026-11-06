// Heightmap terrain per area: 4 × 4 tiles with a four-layer ground material (base, dirt, rock, road).
// heightAt() is the single source of truth for ground height used by movement, placement and the camera.

import * as THREE from "three"
import { Noise2D } from "../core/noise"
import { clamp, smoothstep } from "../core/math"
import type { AreaDef } from "../core/types"
import { groundTexture, tex } from "../render/textures"
import { markGround, materialQuality, unmarkGround } from "../render/materials"

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
  /** 4 × 4 terrain tiles sharing one material. */
  readonly mesh: THREE.Group
  private noise: Noise2D
  private features: TerrainFeature[]
  private heightCache: Float32Array
  private res: number
  private step: number
  /** Per grid vertex: macro tint (linear RGB) and layer weights (base, dirt, rock, road). */
  private colors!: Float32Array
  private layers!: Float32Array
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

  /** Macro tint of the ground (linear RGB) at a world position, bilinear from the per-vertex colours. */
  colorAt(x: number, z: number, target = new THREE.Color()): THREE.Color {
    const [i, j, tx, tz] = this.cell(x, z)
    const w = this.res + 1
    const c = this.colors
    const k00 = (j * w + i) * 3
    const k10 = k00 + 3
    const k01 = k00 + w * 3
    const k11 = k01 + 3
    const f = (o: number) => (c[k00 + o] * (1 - tx) + c[k10 + o] * tx) * (1 - tz) + (c[k01 + o] * (1 - tx) + c[k11 + o] * tx) * tz
    return target.setRGB(f(0), f(1), f(2))
  }

  /** Share of the base ground layer (grass, moss, …) at a world position: 0 on roads, rock and dirt. */
  grassAt(x: number, z: number): number {
    const [i, j, tx, tz] = this.cell(x, z)
    const w = this.res + 1
    const l = this.layers
    const g = (k: number) => {
      const o = k * 4
      const sum = l[o] + l[o + 1] + l[o + 2] + l[o + 3]
      return sum > 1e-3 ? l[o] / sum : 0
    }
    const k00 = j * w + i
    return (g(k00) * (1 - tx) + g(k00 + 1) * tx) * (1 - tz) + (g(k00 + w) * (1 - tx) + g(k00 + w + 1) * tx) * tz
  }

  private cell(x: number, z: number): [number, number, number, number] {
    const fx = clamp((x + this.size) / this.step, 0, this.res - 0.001)
    const fz = clamp((z + this.size) / this.step, 0, this.res - 0.001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    return [i, j, fx - i, fz - j]
  }

  /**
   * Layer weights and macro tint per grid vertex, then 4 × 4 tiles that share one material (each tile is
   * frustum-culled on its own). The material blends the four ground layers per pixel.
   */
  private buildMesh(): THREE.Group {
    const w = this.res + 1
    const n = w * w
    const b = this.area.biome
    this.colors = new Float32Array(n * 3)
    this.layers = new Float32Array(n * 4)
    const roadDist = new Float32Array(n)
    const normals = new Float32Array(n * 3)
    const base = new THREE.Color(b === "forest" ? 0x55683e : b === "graveyard" ? 0x7e7a6a : b === "catacombs" ? 0x6a6872 : b === "castle" || b === "fortress" ? 0xa09c8c : b === "city" ? 0xa09c90 : b === "monastery" ? 0x7a8656 : 0x768a4e)
    const dark = new THREE.Color(0x3a4030)
    const mudC = new THREE.Color(0x4a3e30)
    const dirtAmount = b === "catacombs" ? 0 : b === "city" ? 0.35 : b === "castle" || b === "fortress" ? 0.6 : 1
    // The muted base colours and textures are darker than the former saturated ones: this gain keeps the
    // ground at roughly 80 % of its old brightness while the saturation drops.
    const gain = b === "village" ? 1.6 : b === "forest" ? 1.5 : b === "monastery" ? 1.45 : b === "graveyard" ? 1.3 : 1
    const roads = this.features.filter((f) => f.kind === "road")
    const tmp = new THREE.Color()
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i
        const x = -this.size + i * this.step
        const z = -this.size + j * this.step
        const h = this.heightCache[k]
        const nrm = this.normalAt(x, z)
        normals[k * 3] = nrm.x
        normals[k * 3 + 1] = nrm.y
        normals[k * 3 + 2] = nrm.z
        // Macro tint: large soft patches toward a dark olive, wet mud along the water
        const nm = this.noise.fbm(x * 0.03 + 11, z * 0.03 + 5, 3) * 0.5 + 0.5
        tmp.copy(base).lerp(dark, nm * 0.45)
        // Only the last half metre above the water line: flattened ground at height 0 stays dry
        const wet = h < this.waterLevel + 0.5 ? smoothstep(this.waterLevel + 0.5, this.waterLevel - 0.2, h) : 0
        if (wet > 0) tmp.lerp(mudC, wet * 0.8)
        tmp.multiplyScalar(gain)
        this.colors[k * 3] = tmp.r
        this.colors[k * 3 + 1] = tmp.g
        this.colors[k * 3 + 2] = tmp.b
        // Layer weights
        const rock = smoothstep(0.25, 0.6, 1 - nrm.y)
        let road = 0
        let best = Infinity
        let signed = 99
        for (const f of roads) {
          const width = f.width ?? 5
          const bx = f.x2 ?? f.x
          const bz = f.z2 ?? f.z
          const d = distToSegment(x, z, f.x, f.z, bx, bz)
          if (d < best) {
            best = d
            // Signed by the side of the centre line, so the interpolated distance stays exact across a straight road
            signed = (bx - f.x) * (z - f.z) - (bz - f.z) * (x - f.x) < 0 ? -d : d
          }
          if (d > width) continue
          const ragged = d + this.noise.fbm(x * 0.25 + 3, z * 0.25 + 9, 2) * 1.4
          road += 1 - smoothstep(width * 0.45, width * 0.65, ragged)
        }
        roadDist[k] = clamp(signed, -99, 99)
        // Bare patches where the (roughly ±0.5) fbm peaks: about a fifth of the open ground
        const dn = this.noise.fbm(x * 0.02 + 37, z * 0.02 - 13, 3) * 0.5 + 0.5
        const dirt = Math.min(1, smoothstep(0.58, 0.8, dn) * dirtAmount + (b === "catacombs" ? 0 : wet * 0.8))
        road = Math.min(1, road)
        this.layers[k * 4] = 1 - Math.max(rock, road, dirt)
        this.layers[k * 4 + 1] = dirt
        this.layers[k * 4 + 2] = rock
        this.layers[k * 4 + 3] = road
      }
    }
    const material = this.buildMaterial(base.clone().lerp(dark, 0.5 * 0.45).multiplyScalar(gain))
    const group = new THREE.Group()
    group.name = "terrain"
    const T = 4
    for (let tj = 0; tj < T; tj++) {
      for (let ti = 0; ti < T; ti++) {
        const i0 = Math.floor((ti * this.res) / T)
        const i1 = Math.floor(((ti + 1) * this.res) / T)
        const j0 = Math.floor((tj * this.res) / T)
        const j1 = Math.floor(((tj + 1) * this.res) / T)
        const mesh = new THREE.Mesh(this.tileGeometry(i0, i1, j0, j1, normals, roadDist), material)
        mesh.name = "terrain-tile"
        mesh.receiveShadow = true
        mesh.castShadow = false
        mesh.matrixAutoUpdate = false
        group.add(mesh)
      }
    }
    group.matrixAutoUpdate = false
    return group
  }

  /** Grid cells i0..i1 × j0..j1 as an indexed mesh in world coordinates (edge vertices equal the neighbour's). */
  private tileGeometry(i0: number, i1: number, j0: number, j1: number, normals: Float32Array, roadDist: Float32Array): THREE.BufferGeometry {
    const w = this.res + 1
    const cols = i1 - i0 + 1
    const rows = j1 - j0 + 1
    const count = cols * rows
    const pos = new Float32Array(count * 3)
    const nor = new Float32Array(count * 3)
    const uv = new Float32Array(count * 2)
    const col = new Float32Array(count * 3)
    const lay = new Float32Array(count * 4)
    const rd = new Float32Array(count)
    let v = 0
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * w + i
        const x = -this.size + i * this.step
        const z = -this.size + j * this.step
        pos[v * 3] = x
        pos[v * 3 + 1] = this.heightCache[k]
        pos[v * 3 + 2] = z
        for (let c = 0; c < 3; c++) {
          nor[v * 3 + c] = normals[k * 3 + c]
          col[v * 3 + c] = this.colors[k * 3 + c]
        }
        for (let c = 0; c < 4; c++) lay[v * 4 + c] = this.layers[k * 4 + c]
        rd[v] = roadDist[k]
        // Same mapping as the former single plane: u along +x, v along -z
        uv[v * 2] = (x + this.size) / (this.size * 2)
        uv[v * 2 + 1] = (this.size - z) / (this.size * 2)
        v++
      }
    }
    const index: number[] = []
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        const b = (r + 1) * cols + c
        const cc = (r + 1) * cols + c + 1
        const d = r * cols + c + 1
        index.push(a, b, d, b, cc, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    geo.setAttribute("aLayer", new THREE.BufferAttribute(lay, 4))
    geo.setAttribute("aRoad", new THREE.BufferAttribute(rd, 1))
    geo.setIndex(index)
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }

  /**
   * Ground material: the biome texture tinted by the vertex colour, blended per pixel with dirt, rock (gravel)
   * and road (mud; cobbles in the city) by the vertex weights. Each layer is mixed with a 12.5× larger copy of
   * itself so the few-metre repeat disappears (fine scale only when normal maps are off, i.e. on low).
   * Roads get two wheel ruts ±0.55 m from the centre line.
   */
  private buildMaterial(avgTint: THREE.Color): THREE.MeshStandardMaterial {
    const b = this.area.biome
    const texture = groundTexture(b).clone()
    const tile = b === "city" || b === "catacombs" ? 1.5 : b === "castle" || b === "fortress" ? 2 : 3
    texture.repeat.set(this.size / tile, this.size / tile)
    texture.needsUpdate = true
    const material = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1, metalness: 0 })
    const twoScale = materialQuality.normalMaps
    const uniforms = {
      uMapDirt: { value: tex("dirt") },
      uMapRock: { value: tex("gravel") },
      uMapRoad: { value: tex(b === "city" ? "cobble" : "mud") },
      uShadeRef: { value: Math.max(0.01, avgTint.r * 0.2126 + avgTint.g * 0.7152 + avgTint.b * 0.0722) },
    }
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 aLayer;\nattribute float aRoad;\nvarying vec4 vLayer;\nvarying float vRoad;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLayer = aLayer;\nvRoad = aRoad;")
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform sampler2D uMapDirt;
uniform sampler2D uMapRock;
uniform sampler2D uMapRoad;
uniform float uShadeRef;
varying vec4 vLayer;
varying float vRoad;
vec3 lkLayer(sampler2D t, vec2 uv) {
${twoScale ? "  return mix(texture2D(t, uv * 0.08).rgb, texture2D(t, uv).rgb, 0.55);" : "  return texture2D(t, uv).rgb;"}
}`,
        )
        .replace(
          "#include <map_fragment>",
          `{
  vec4 lw = max(vLayer, vec4(0.0));
  lw /= max(lw.x + lw.y + lw.z + lw.w, 1e-3);
  float shade = clamp(dot(vColor, vec3(0.2126, 0.7152, 0.0722)) / uShadeRef, 0.45, 1.25);
  float rut = 1.0 - 0.15 * (1.0 - smoothstep(0.08, 0.3, abs(abs(vRoad) - 0.55)));
  vec3 ground = lkLayer(map, vMapUv) * vColor * lw.x
    + lkLayer(uMapDirt, vMapUv) * shade * lw.y
    + lkLayer(uMapRock, vMapUv * 0.7) * shade * lw.z
    + lkLayer(uMapRoad, vMapUv) * shade * rut * lw.w;
  diffuseColor.rgb *= ground;
}`,
        )
        .replace("#include <color_fragment>", "")
    }
    material.customProgramCacheKey = () => `lk-terrain-${twoScale ? 2 : 1}`
    markGround(material)
    return material
  }

  dispose(): void {
    let material: THREE.MeshStandardMaterial | null = null
    for (const child of this.mesh.children) {
      const m = child as THREE.Mesh
      m.geometry.dispose()
      material = m.material as THREE.MeshStandardMaterial
    }
    if (material) {
      unmarkGround(material)
      material.dispose()
    }
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
