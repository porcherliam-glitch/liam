/**
 * chunks.ts — draw-call budget for the big zone.
 *  - TextureLayers: every procedural surface texture (textures.ts) as one layer of a single DataArrayTexture.
 *  - uberMaterial(): MeshStandardMaterial that samples that array per vertex (attribute `surf` = layer, roughness,
 *    metalness), so ALL static opaque geometry shares one material/program; variants for alpha-tested cut-outs
 *    (fences, foliage, truss, wire) and far-visible landmarks (weaker fog). renderer.compile-friendly: three programs.
 *  - ChunkSet: splits batched geometry (meshkit GeoBatch) by triangle centroid into square chunks (default 64 m),
 *    one opaque + one cut-out geometry per chunk; world.ts hides chunks beyond the fog and three frustum-culls the rest.
 * Keys (props.ts batch names) map to a texture, roughness and metalness via KEY_INFO; ground looks use "g:<look>".
 */
import * as THREE from "three"
import type { GeoBatch } from "./meshkit"
import { TEX, textureCanvas, type TexName } from "./textures"

export interface KeyInfo { tex: TexName; rough: number; metal: number; cut?: boolean }
export const KEY_INFO: Record<string, KeyInfo> = {
  metal: { tex: "metal", rough: 0.55, metal: 0.2 }, container: { tex: "container", rough: 0.62, metal: 0.15 }, glass: { tex: "glass", rough: 0.12, metal: 0.3 },
  rubber: { tex: "rubber", rough: 0.95, metal: 0 }, burlap: { tex: "burlap", rough: 1, metal: 0 }, plank: { tex: "plank", rough: 0.9, metal: 0 },
  plaster: { tex: "plaster", rough: 0.92, metal: 0 }, brick: { tex: "brick", rough: 0.9, metal: 0 }, cladding: { tex: "cladding", rough: 0.6, metal: 0.25 },
  concrete: { tex: "concrete", rough: 0.92, metal: 0 }, rollup: { tex: "rollup", rough: 0.6, metal: 0.25 }, roof: { tex: "roof", rough: 0.9, metal: 0 },
  rack: { tex: "rack", rough: 0.6, metal: 0.3 }, crate: { tex: "crate", rough: 0.85, metal: 0 }, pallets: { tex: "pallets", rough: 0.9, metal: 0 },
  hesco: { tex: "hesco", rough: 0.95, metal: 0 }, sandwall: { tex: "sandwall", rough: 1, metal: 0 }, sandbag: { tex: "sandbag", rough: 1, metal: 0 },
  siding: { tex: "siding", rough: 0.7, metal: 0.1 }, block: { tex: "block", rough: 0.92, metal: 0 }, bunker: { tex: "bunker", rough: 0.92, metal: 0 },
  rooftile: { tex: "rooftile", rough: 0.85, metal: 0 }, bark: { tex: "bark", rough: 1, metal: 0 }, boards: { tex: "boards", rough: 0.9, metal: 0 },
  rock: { tex: "rock", rough: 0.95, metal: 0 }, gravel: { tex: "gravel", rough: 1, metal: 0 }, canopy: { tex: "canopy", rough: 0.9, metal: 0 },
  fence: { tex: "chainlink", rough: 0.6, metal: 0.3, cut: true }, foliage: { tex: "foliage", rough: 0.95, metal: 0, cut: true },
  truss: { tex: "truss", rough: 0.6, metal: 0.25, cut: true }, concertina: { tex: "concertina", rough: 0.5, metal: 0.4, cut: true },
}
/** Ground looks → texture (+ roughness). */
export const GROUND_TEX: Record<string, TexName> = {
  asphalt: "asphalt", gravel: "gravel", dirt: "dirt", grass: "grass", pavement: "pavement", quay: "quay", pad: "pad", floor: "floor", tiles: "tiles",
  plank: "plank", concrete: "pavement", metal: "pad", wood: "plank", lawn: "grass", forest: "dirt", field: "field", garden: "dirt", ballast: "gravel", rock: "gravel",
}
export function keyInfo(key: string): KeyInfo {
  if (key.startsWith("g:")) { const tex = GROUND_TEX[key.slice(2)] ?? "gravel"; return { tex, rough: tex === "asphalt" ? 0.86 : 0.96, metal: 0 } }
  return KEY_INFO[key] ?? { tex: (key in TEX ? key : "concrete") as TexName, rough: 0.9, metal: 0 }
}

// ---------------------------------------------------------------------------------------------------------------
// Texture array
// ---------------------------------------------------------------------------------------------------------------
export class TextureLayers {
  readonly names: TexName[] = []
  private index = new Map<TexName, number>()
  texture: THREE.DataArrayTexture | null = null
  layer(name: TexName): number {
    let i = this.index.get(name)
    if (i === undefined) { i = this.names.length; this.names.push(name); this.index.set(name, i) }
    return i
  }
  /** Builds the array (call once, after every layer was requested). Rows are flipped to match CanvasTexture UVs. */
  build(size: number, anisotropy: number): THREE.DataArrayTexture {
    const n = this.names.length, data = new Uint8Array(size * size * 4 * n)
    const c = document.createElement("canvas"); c.width = c.height = size
    const g = c.getContext("2d", { willReadFrequently: true })!
    this.names.forEach((name, i) => {
      g.clearRect(0, 0, size, size)
      g.drawImage(textureCanvas(name, size), 0, 0, size, size)
      const px = g.getImageData(0, 0, size, size).data, row = size * 4, base = i * size * row
      // cut-out textures: give transparent texels the average opaque colour so mip levels do not darken to black
      let r = 0, gg = 0, bb = 0, cnt = 0
      for (let k = 0; k < px.length; k += 4) if (px[k + 3] > 128) { r += px[k]; gg += px[k + 1]; bb += px[k + 2]; cnt++ }
      // canvas pixels are premultiplied internally: low-alpha texels come back with garbage (often white) colours
      if (cnt && cnt < size * size) { r /= cnt; gg /= cnt; bb /= cnt; for (let k = 0; k < px.length; k += 4) { const t = Math.min(1, px[k + 3] / 200); if (t < 1) { px[k] = px[k] * t + r * (1 - t); px[k + 1] = px[k + 1] * t + gg * (1 - t); px[k + 2] = px[k + 2] * t + bb * (1 - t) } } }
      for (let y = 0; y < size; y++) data.set(px.subarray((size - 1 - y) * row, (size - y) * row), base + y * row)
    })
    const t = new THREE.DataArrayTexture(data, size, size, n)
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter
    t.generateMipmaps = true; t.anisotropy = anisotropy; t.needsUpdate = true
    this.texture = t
    return t
  }
}

export type UberVariant = "opaque" | "cut" | "far" | "farcut"

/** The shared surface material: array texture by vertex layer, per-vertex roughness/metalness, vertex colours. */
export function uberMaterial(layers: { value: THREE.Texture | null }, variant: UberVariant, high: boolean): THREE.MeshStandardMaterial {
  const cut = variant === "cut" || variant === "farcut", far = variant === "far" || variant === "farcut"
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: cut ? THREE.DoubleSide : THREE.FrontSide })
  if (cut) m.alphaTest = 0.42
  m.onBeforeCompile = shader => {
    shader.uniforms.layers = layers
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;\nvarying vec2 vUvA;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSurf = surf; vUvA = uv;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform highp sampler2DArray layers;\nvarying vec3 vSurf;\nvarying vec2 vUvA;")
      .replace("#include <map_fragment>", "diffuseColor *= texture(layers, vec3(vUvA, vSurf.x));")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vSurf.y;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vSurf.z;")
    // cut-outs (foliage cards, fences, wire) keep their authored normal on both sides instead of flipping it
    if (cut) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif")
    // far variant: the higher a surface, the weaker the fog (hill crests, towers and cranes stay readable as
    // silhouettes; their feet fog like everything else, so trees and ground nearby match)
    if (far) {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vWorldY;").replace("#include <fog_vertex>", "#include <fog_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;")
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vWorldY;").replace("#include <fog_fragment>",
        "#ifdef USE_FOG\n float kH = clamp(vWorldY / 16.0, 0.0, 1.0);\n float fogFactor = min(smoothstep(fogNear, fogFar * mix(1.0, 2.6, kH), vFogDepth), mix(1.0, 0.9, kH));\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);\n#endif")
    }
  }
  m.customProgramCacheKey = () => `uber-${variant}`
  return m
}

/** Shadow depth for uber geometry: cut-outs (leaves, fences, wire) cast holed shadows instead of solid quads. */
export function uberDepthMaterial(layers: { value: THREE.Texture | null }): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide })
  m.onBeforeCompile = shader => {
    shader.uniforms.layers = layers
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;\nvarying vec2 vUvA;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurf = surf; vUvA = uv;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform highp sampler2DArray layers;\nvarying vec3 vSurf;\nvarying vec2 vUvA;")
      .replace("void main() {", "void main() {\n  if (texture(layers, vec3(vUvA, vSurf.x)).a < 0.42) discard;")
  }
  m.customProgramCacheKey = () => "uber-depth"
  return m
}

// ---------------------------------------------------------------------------------------------------------------
// Chunked geometry
// ---------------------------------------------------------------------------------------------------------------
class Buf {
  pos = new Float32Array(3 * 1024); nor = new Float32Array(3 * 1024); uv = new Float32Array(2 * 1024); col = new Float32Array(3 * 1024); surf = new Float32Array(3 * 1024)
  idx = new Uint32Array(3 * 1024)
  nv = 0; ni = 0
  private grow(): void {
    const cap = this.pos.length / 3 * 2
    const g = (a: Float32Array, k: number) => { const b = new Float32Array(cap * k); b.set(a); return b }
    this.pos = g(this.pos, 3); this.nor = g(this.nor, 3); this.uv = g(this.uv, 2); this.col = g(this.col, 3); this.surf = g(this.surf, 3)
  }
  vert(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number, r: number, gg: number, b: number, s0: number, s1: number, s2: number): number {
    if (this.nv * 3 >= this.pos.length) this.grow()
    const i = this.nv++, i3 = i * 3, i2 = i * 2
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz
    this.nor[i3] = nx; this.nor[i3 + 1] = ny; this.nor[i3 + 2] = nz
    this.uv[i2] = u; this.uv[i2 + 1] = v
    this.col[i3] = r; this.col[i3 + 1] = gg; this.col[i3 + 2] = b
    this.surf[i3] = s0; this.surf[i3 + 1] = s1; this.surf[i3 + 2] = s2
    return i
  }
  tri(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.idx.length) { const n = new Uint32Array(this.idx.length * 2); n.set(this.idx); this.idx = n }
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), n = this.nv
    g.setAttribute("position", new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3))
    g.setAttribute("normal", new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3))
    g.setAttribute("uv", new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2))
    g.setAttribute("color", new THREE.BufferAttribute(this.col.slice(0, n * 3), 3))
    g.setAttribute("surf", new THREE.BufferAttribute(this.surf.slice(0, n * 3), 3))
    g.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni), 1))
    g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }
}

export interface ChunkGeometry { cx: number; cz: number; cut: boolean; geometry: THREE.BufferGeometry }

/** Collects triangles into square chunks (size in metres); size = Infinity puts everything into one chunk. */
export class ChunkSet {
  private bufs = new Map<number, Buf>()
  constructor(readonly size = 64) {}
  private buf(cx: number, cz: number, cut: boolean): Buf {
    const k = ((cx + 512) * 1024 + (cz + 512)) * 2 + (cut ? 1 : 0)
    let b = this.bufs.get(k); if (!b) { b = new Buf(); this.bufs.set(k, b) }
    return b
  }

  /** Adds a GeoBatch (its own quads and its extra geometries) with layer/roughness/metalness and UV scale. */
  addBatch(batch: GeoBatch, layer: number, info: KeyInfo, su: number, sv: number): void {
    if (batch.pos.length) this.addArrays(batch.pos, batch.nor, batch.uv, batch.col, batch.idx, layer, info, su, sv)
    for (const g of batch.extras) {
      const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, c = g.attributes.color.array
      this.addArrays(p, n, u, c, g.index!.array, layer, info, su, sv)
    }
  }

  addGeometry(g: THREE.BufferGeometry, layer: number, info: KeyInfo, su: number, sv: number): void {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array
    const c = g.attributes.color ? g.attributes.color.array : new Float32Array(p.length).fill(1)
    const idx = g.index ? g.index.array : Uint32Array.from({ length: p.length / 3 }, (_, i) => i)
    this.addArrays(p, n, u, c, idx, layer, info, su, sv)
  }

  private addArrays(p: ArrayLike<number>, n: ArrayLike<number>, u: ArrayLike<number>, c: ArrayLike<number>, idx: ArrayLike<number>, layer: number, info: KeyInfo, su: number, sv: number): void {
    const nv = p.length / 3, remapKey = new Int32Array(nv).fill(-1), remapIdx = new Int32Array(nv)
    const size = this.size, cut = !!info.cut
    let lastKey = -1, last: Buf | null = null
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], d = idx[t + 2]
      const mx = (p[a * 3] + p[b * 3] + p[d * 3]) / 3, mz = (p[a * 3 + 2] + p[b * 3 + 2] + p[d * 3 + 2]) / 3
      const cx = Number.isFinite(size) ? Math.floor(mx / size) : 0, cz = Number.isFinite(size) ? Math.floor(mz / size) : 0
      const key = (cx + 512) * 1024 + (cz + 512)
      const buf = key === lastKey && last ? last : (last = this.buf(cx, cz, cut))
      lastKey = key
      const v = (s: number) => {
        if (remapKey[s] === key) return remapIdx[s]
        const i = buf.vert(p[s * 3], p[s * 3 + 1], p[s * 3 + 2], n[s * 3], n[s * 3 + 1], n[s * 3 + 2], u[s * 2] * su, u[s * 2 + 1] * sv, c[s * 3], c[s * 3 + 1], c[s * 3 + 2], layer, info.rough, info.metal)
        if (remapKey[s] === -1) { remapKey[s] = key; remapIdx[s] = i }
        return i
      }
      buf.tri(v(a), v(b), v(d))
    }
  }

  build(): ChunkGeometry[] {
    const out: ChunkGeometry[] = []
    for (const [k, b] of this.bufs) {
      if (!b.ni) continue
      const cut = (k & 1) === 1, key = k >> 1
      out.push({ cx: Math.floor(key / 1024) - 512, cz: (key % 1024) - 512, cut, geometry: b.geometry() })
    }
    this.bufs.clear()
    return out
  }
}

/** Adds the uber attributes (surf, colour, scaled UVs) to a standalone geometry (instancing templates). */
export function uberize(g: THREE.BufferGeometry, layer: number, info: KeyInfo, su: number, sv: number, color: THREE.Color = new THREE.Color(1, 1, 1)): THREE.BufferGeometry {
  const n = g.attributes.position.count
  const surf = new Float32Array(n * 3), col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { surf[i * 3] = layer; surf[i * 3 + 1] = info.rough; surf[i * 3 + 2] = info.metal; col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b }
  g.setAttribute("surf", new THREE.BufferAttribute(surf, 3))
  if (!g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(col, 3))
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  else g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
