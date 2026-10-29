/**
 * surface.ts — procedural surface detail for the vertex-coloured models (no UVs, no texture files). A tiny tileable
 * 3-D noise texture is sampled in object space, so the pattern sticks to animated parts and costs a few texture reads:
 *
 *   - colour mottling and low-frequency grime / dirt patches
 *   - micro relief through derivative bump mapping (distance-stable: the height is in metres)
 *   - per surface type (vertex attribute `surf`, or the material's default when a geometry has none):
 *       0 painted / generic   1 fabric (weave, fibres)   2 skin (blotches, pores, bruising)
 *       3 metal (worn bright spots, brushed streaks)      4 wood (grain)   5 polymer / rubber (stipple)
 *       6 wet flesh / blood (glossy, clotted)
 *   - roughness variation; worn metal turns shinier and more metallic
 *
 * Fine detail fades out with the pixel footprint so it never shimmers in the distance. Works on top of other
 * onBeforeCompile patches (glow channels): the previous hook runs first, the cache key is extended.
 */
import * as THREE from "three"

export const SURF = { paint: 0, fabric: 1, skin: 2, metal: 3, wood: 4, polymer: 5, wet: 6 } as const
export type Surf = (typeof SURF)[keyof typeof SURF]

export interface SurfaceOptions {
  /** Features per metre of the fine pattern. */
  scale: number
  /** Relief height of the fine pattern in metres. */
  bump: number
  /** Darkening of dirt patches (0..1). */
  grime: number
  /** Colour mottling (0..1). */
  mottle: number
  /** Bright worn spots on metal (0..1). */
  wear?: number
  /** Fabric weave relief (0..1). */
  weave?: number
  /** Roughness variation (±). */
  rough?: number
  /** Three-tone camouflage on fabric (0..1). */
  camo?: number
  /** Surface type for geometries without a `surf` attribute. */
  type?: number
}

let noiseTex: THREE.Data3DTexture | null = null
/** 32³ tileable value noise (trilinear filtering turns it into smooth noise). */
function noise3d(): THREE.Data3DTexture {
  if (noiseTex) return noiseTex
  const N = 32, data = new Uint8Array(N * N * N)
  let s = 0x9e3779b9
  for (let i = 0; i < data.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; data[i] = (s >>> 0) & 255 }
  // one box blur pass so neighbouring texels correlate (softer, less salt-and-pepper)
  const out = new Uint8Array(data.length), at = (x: number, y: number, z: number) => data[((z & 31) * N + (y & 31)) * N + (x & 31)]
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    out[(z * N + y) * N + x] = (at(x, y, z) * 2 + at(x + 1, y, z) + at(x - 1, y, z) + at(x, y + 1, z) + at(x, y - 1, z) + at(x, y, z + 1) + at(x, y, z - 1)) / 8
  }
  // stretch the contrast back to the full range
  let lo = 255, hi = 0; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v }
  for (let i = 0; i < out.length; i++) out[i] = Math.round((out[i] - lo) / Math.max(1, hi - lo) * 255)
  const t = new THREE.Data3DTexture(out, N, N, N)
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType
  t.minFilter = t.magFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping
  t.unpackAlignment = 1; t.needsUpdate = true
  noiseTex = t
  return t
}

const VERT_HEAD = /* glsl */ `
attribute float surf;
varying vec3 vSurfPos;
flat varying float vSurfType;`
const VERT_BODY = /* glsl */ `
vSurfPos = position; vSurfType = surf;
#ifdef USE_INSTANCING
vSurfPos += instanceMatrix[3].xyz * 0.6180339;
#endif`

const FRAG_HEAD = /* glsl */ `
uniform highp sampler3D uSurfNoise;
uniform vec4 uSurfA; // scale (1/m), bump (m), grime, mottle
uniform vec4 uSurfB; // wear, weave, roughness variation, camouflage on fabric
varying vec3 vSurfPos;
flat varying float vSurfType;
float sN(vec3 p) { return texture(uSurfNoise, p).r; }
float sFbm(vec3 p) { return sN(p) * 0.5 + sN(p * 2.03 + 0.31) * 0.3 + sN(p * 4.07 + 0.67) * 0.2; }
float sIs(float t) { return 1.0 - step(0.5, abs(vSurfType - t)); }
vec3 sBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}`

// after <color_fragment>: albedo detail (the variables live on for the roughness/metalness/normal chunks)
const FRAG_COLOR = /* glsl */ `
vec3 sP = vSurfPos * (uSurfA.x / 32.0);
float sFoot = length(fwidth(sP));
float sFine = 1.0 - smoothstep(0.08, 0.45, sFoot);
float sLo = sFbm(sP * 0.21 + 0.13);
float sHi = mix(0.5, sFbm(sP), sFine);
float sFab = sIs(1.0), sSkin = sIs(2.0), sMet = sIs(3.0), sWood = sIs(4.0), sPoly = sIs(5.0), sWet = sIs(6.0);
float sGrime = smoothstep(0.42, 0.82, sLo) * uSurfA.z;
if (uSurfB.w > 0.0) {
  // three-tone camouflage blotches on fabric
  float sCn = sFbm(vSurfPos * 0.3 + 7.0);
  float sCm = sCn < 0.43 ? 0.66 : (sCn < 0.6 ? 1.0 : 1.25);
  diffuseColor.rgb *= mix(1.0, sCm, sFab * uSurfB.w);
}
diffuseColor.rgb *= (1.0 + (sHi - 0.5) * uSurfA.w * (1.0 + sSkin * 1.2 + sWood)) * (1.0 - sGrime * 0.55);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.72, 0.86), sSkin * smoothstep(0.5, 0.78, sLo) * 0.7);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.0, 0.82), sSkin * smoothstep(0.55, 0.3, sLo) * 0.35);
float sWear = sMet * smoothstep(0.64, 0.72, sFbm(sP * 1.37 + 3.1)) * uSurfB.x;
diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb * 1.6, vec3(0.30, 0.30, 0.29)), sWear);
float sGrain = sWood * (0.5 + 0.5 * sin((vSurfPos.y * 0.15 + vSurfPos.x + vSurfPos.z) * uSurfA.x * 0.9 + sN(sP * vec3(0.25, 2.5, 0.25)) * 14.0));
diffuseColor.rgb *= 1.0 - sGrain * 0.2 * sFine;
diffuseColor.rgb *= 1.0 - sWet * smoothstep(0.45, 0.75, sHi) * 0.35;`

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = clamp(roughnessFactor + (sHi - 0.5) * uSurfB.z + sGrime * 0.18 - sWear * 0.4 + sFab * 0.08 - sSkin * smoothstep(0.62, 0.8, sLo) * 0.25 - sWet * (0.5 - sHi * 0.25), 0.05, 1.0);`

const FRAG_METAL = /* glsl */ `
metalnessFactor = max(metalnessFactor, sWear * 0.55);`

const FRAG_NORMAL = /* glsl */ `
{
  float sHf = sFbm(sP * 3.1 + 1.7);
  float sH = (sHi - 0.5) * (1.0 + sWet) + (sHf - 0.5) * (0.6 + sSkin * 0.8 + sPoly * 0.6 + sWet * 0.8) * sFine;
  // fabric weave: two crossing thread directions, faded with the pixel footprint
  vec3 sQ = vSurfPos * 240.0;
  float sWv = sin(sQ.x + sQ.z) * sin(sQ.y * 1.1);
  sWv *= sFab * uSurfB.y * (1.0 - smoothstep(0.35, 1.1, length(fwidth(sQ))));
  // brushed streaks on metal
  float sBr = sMet * (sN(sP * vec3(6.0, 0.4, 6.0)) - 0.5) * 0.6 * sFine;
  float sHeight = (sH + sWv * 0.35 + sBr - sGrain * 0.3) * uSurfA.y;
  normal = sBump(-vViewPosition, normal, sHeight);
}`

/** Adds the procedural surface detail to a standard material (keeps an existing onBeforeCompile patch). */
export function withSurface<M extends THREE.MeshStandardMaterial>(mat: M, o: SurfaceOptions): M {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey
  const a = new THREE.Vector4(o.scale, o.bump, o.grime, o.mottle), b = new THREE.Vector4(o.wear ?? 0.5, o.weave ?? 0.5, o.rough ?? 0.15, o.camo ?? 0)
  const tex = noise3d()
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer)
    shader.uniforms.uSurfNoise = { value: tex }
    shader.uniforms.uSurfA = { value: a }
    shader.uniforms.uSurfB = { value: b }
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${VERT_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${VERT_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${FRAG_HEAD}`)
      .replace("#include <color_fragment>", `#include <color_fragment>${FRAG_COLOR}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>${FRAG_ROUGH}`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>${FRAG_METAL}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>${FRAG_NORMAL}`)
  }
  const base = prevKey.call(mat)
  mat.customProgramCacheKey = () => `${base}|surf1`
  // geometries without a per-vertex surface type use the material's
  ;(mat as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = { surf: [o.type ?? SURF.paint] }
  mat.userData.surface = o
  return mat
}

/** Per-vertex surface type attribute filled with one value (for merged builders). */
export function surfAttribute(count: number, type: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(new Float32Array(count).fill(type), 1)
}
