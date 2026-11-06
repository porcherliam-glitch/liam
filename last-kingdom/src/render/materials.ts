// Material cache. Materials are shared between meshes so draw calls can batch and memory stays low.
// Every mat() material (and every plain loaded MeshStandardMaterial) belongs to a "family": all of its
// properties except the colour. The static batcher merges the meshes of one family into a single draw call
// and bakes each mesh's colour into vertex colours (familyMaterial() supplies the shared white,
// vertex-coloured material). Also here: rain wetness for ground materials, the water material and the
// height-fog shader chunks.

import * as THREE from "three"
import { tex } from "./textures"

const cache = new Map<string, THREE.Material>()
/** Repeated copies of a texture, shared by every material with the same texture and repeat. */
const tiled = new Map<string, THREE.Texture>()
const families = new Map<string, THREE.MeshStandardMaterial>()
/** Ground-like materials (walked on, wetted by rain) with their dry colour (linear RGB) and roughness. */
const ground = new Map<THREE.MeshStandardMaterial, { color: [number, number, number]; roughness: number }>()
const GROUND_TEXTURES = new Set(["grass", "moss", "dirt", "mud", "cobble", "gravel", "stone", "stone_dark", "planks"])

/** Render quality switches read when materials are created (set from the settings before a world is built). */
export const materialQuality = { normalMaps: true }

export interface MatOpts {
  color?: string | number
  roughness?: number
  metalness?: number
  repeat?: number
  emissive?: string | number
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  alphaTest?: number
  flat?: boolean
  /** Name of a tangent-space normal map texture (e.g. "stone_normal"). */
  normal?: string
  normalScale?: number
}

function tiledTexture(name: string, repeat: number): THREE.Texture {
  if (repeat === 1) return tex(name)
  const key = `${name}@${repeat}`
  let t = tiled.get(key)
  if (!t) {
    t = tex(name).clone()
    t.repeat.set(repeat, repeat)
    t.needsUpdate = true
    tiled.set(key, t)
  }
  return t
}

export function mat(texture: string | null, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([texture, opts])
  const hit = cache.get(key)
  if (hit) return hit as THREE.MeshStandardMaterial
  const repeat = opts.repeat ?? 1
  const map = texture ? tiledTexture(texture, repeat) : null
  const normalMap = opts.normal ? tiledTexture(opts.normal, repeat) : null
  const ns = opts.normalScale ?? 0.5
  const m = new THREE.MeshStandardMaterial({
    map: map ?? undefined,
    normalMap: normalMap ?? undefined,
    normalScale: new THREE.Vector2(ns, ns),
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    alphaTest: opts.alphaTest ?? 0,
    flatShading: opts.flat ?? false,
  })
  if (texture && GROUND_TEXTURES.has(texture)) markGround(m)
  m.userData.family = ""
  refreshFamily(m)
  cache.set(key, m)
  return m
}

/** Stores the current family key in userData.family (removed for materials that cannot share). */
function refreshFamily(m: THREE.MeshStandardMaterial): void {
  if (!("family" in m.userData)) return
  const key = familyOf(m)
  if (key) m.userData.family = key
  else delete m.userData.family
}

/**
 * Family key of a material: every property that affects the shader or its uniforms except the colour, read
 * from the live material (so clones that were changed afterwards fall into their own family). Covers mat()
 * materials and plain loaded ones (the kit props' glTF materials often differ only in colour). Null for
 * materials that must keep their own draw call: other types, custom shader hooks outside mat(), or glowing.
 */
export function familyOf(material: THREE.Material): string | null {
  const m = material as THREE.MeshStandardMaterial
  if (!m.isMeshStandardMaterial || m.type !== "MeshStandardMaterial" || m.userData.familyShared) return null
  if (!("family" in m.userData) && Object.prototype.hasOwnProperty.call(m, "onBeforeCompile")) return null
  if (m.emissive.getHex() !== 0 || m.emissiveMap) return null
  const id = (t: THREE.Texture | null) => (t ? t.uuid : null)
  return JSON.stringify([
    id(m.map), id(m.normalMap), m.normalScale.x, m.normalScale.y, m.roughness, m.metalness, m.flatShading, m.side, m.alphaTest,
    m.transparent, m.opacity, m.vertexColors, m.depthWrite, m.depthTest, m.blending, m.fog, m.envMapIntensity, m.polygonOffset,
    id(m.roughnessMap), id(m.metalnessMap), id(m.aoMap), id(m.alphaMap), id(m.bumpMap), id(m.lightMap), m.wireframe, m.customProgramCacheKey(),
  ])
}

/**
 * The shared material of a family: white, vertex-coloured, otherwise identical (wind and other shader
 * hooks included). Materials without a family are returned unchanged.
 */
export function familyMaterial(material: THREE.Material): THREE.Material {
  const key = familyOf(material)
  if (!key) return material
  let f = families.get(key)
  if (!f) {
    const m = material as THREE.MeshStandardMaterial
    f = m.clone()
    f.color.setRGB(1, 1, 1)
    f.vertexColors = true
    if (Object.prototype.hasOwnProperty.call(m, "onBeforeCompile")) f.onBeforeCompile = m.onBeforeCompile
    if (Object.prototype.hasOwnProperty.call(m, "customProgramCacheKey")) f.customProgramCacheKey = m.customProgramCacheKey
    delete f.userData.family
    f.userData.familyShared = true
    if (ground.has(m)) markGround(f)
    families.set(key, f)
  }
  return f
}

/** Colour to bake into vertex colours for a mesh with this material (the dry colour for wettable ground). */
export function bakeColor(material: THREE.Material, target: THREE.Color): THREE.Color {
  const g = ground.get(material as THREE.MeshStandardMaterial)
  if (g) return target.setRGB(g.color[0], g.color[1], g.color[2])
  const m = material as THREE.MeshStandardMaterial
  return m.color ? target.copy(m.color) : target.setRGB(1, 1, 1)
}

/** Registers a material that darkens and turns glossy in the rain (see setWetness). */
export function markGround(m: THREE.MeshStandardMaterial): void {
  if (ground.has(m)) return
  m.userData.ground = true
  ground.set(m, { color: [m.color.r, m.color.g, m.color.b], roughness: m.roughness })
}

/** Forgets a ground material again (for materials that are disposed, e.g. the terrain). */
export function unmarkGround(m: THREE.MeshStandardMaterial): void {
  ground.delete(m)
}

/** Rain wetness 0..1: ground materials get up to 30 % darker and their roughness drops toward 0.45. */
export function setWetness(w: number): void {
  const k = Math.max(0, Math.min(1, w))
  for (const [m, base] of ground) {
    const d = 1 - 0.3 * k
    m.color.setRGB(base.color[0] * d, base.color[1] * d, base.color[2] * d)
    m.roughness = base.roughness + (0.45 - base.roughness) * k
  }
}

const normal = (name: string): MatOpts => (materialQuality.normalMaps ? { normal: `${name}_normal` } : {})

export const M = {
  stone: () => mat("stone", { color: 0xcfcac0, ...normal("stone") }),
  stoneDark: () => mat("stone_dark", { color: 0xd8d8e0 }),
  cobble: () => mat("cobble", normal("cobble")),
  plaster: () => mat("plaster", { roughness: 0.95 }),
  timber: () => mat("timber"),
  planks: () => mat("planks", normal("planks")),
  roof: () => mat("roof"),
  thatch: () => mat("thatch"),
  bark: () => mat("bark"),
  leaves: () => Foliage.leaves(),
  leavesDead: () => Foliage.leavesDead(),
  metal: () => mat("metal", { color: 0xb8bcc4, metalness: 0.6, roughness: 0.4 }),
  metalDark: () => mat("metal", { color: 0x55585e, metalness: 0.6, roughness: 0.5 }),
  iron: () => mat(null, { color: 0x3a3c40, metalness: 0.6, roughness: 0.5 }),
  gold: () => mat(null, { color: 0xd8a640, metalness: 0.9, roughness: 0.3 }),
  bone: () => mat("bone", { roughness: 0.75 }),
  cloth: (color: number) => mat("cloth", { color, roughness: 0.95 }),
  flat: (color: number, roughness = 0.9) => mat(null, { color, roughness }),
  water: () => waterMaterial(),
  /**
   * Self-lit surfaces (flames, glowing herbs, eyes): black albedo so lights and shadows do not shade them,
   * emissive capped at 2 (flames at 2 stay just above the bloom threshold).
   */
  glow: (color: number, intensity = 1.5) => mat(null, { color: 0x000000, emissive: color, emissiveIntensity: Math.min(intensity, 2) }),
}

/** Shared wind uniforms for foliage sway; updated once per frame by the expedition. */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } }

function addWind(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if (m.userData.wind) return m
  m.userData.wind = true
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uWind = windUniforms.uWind
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float sway = sin(uTime * 1.3 + wp.x * 0.25 + wp.z * 0.18) * 0.5 + sin(uTime * 2.9 + wp.z * 0.4) * 0.25;
          float h = clamp((wp.y - 1.0) * 0.12, 0.0, 1.0);
          transformed.x += sway * uWind * 0.35 * h;
          transformed.z += sway * uWind * 0.2 * h;
        }`,
      )
  }
  m.customProgramCacheKey = () => "wind"
  refreshFamily(m)
  return m
}

/** Foliage materials with wind displacement (the merged geometry keeps world positions); one material per tint. */
export const Foliage = {
  leaves: (tint: number = 0xffffff) => addWind(mat("leaves", { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, flat: false, ...(tint !== 0xffffff ? { color: tint } : {}) })),
  leavesDead: () => addWind(mat("leaves_dead", { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, flat: false })),
}

let waterMat: THREE.MeshStandardMaterial | null = null
/**
 * Shared water material: two scrolling normal-map layers, small wind waves (on tessellated planes), a Fresnel
 * term that brightens toward the horizon (sky reflection via scene.environment, else the fog colour) and makes
 * the surface more opaque at grazing angles.
 */
export function waterMaterial(): THREE.MeshStandardMaterial {
  if (waterMat) return waterMat
  const normal = tex("water_normal").clone()
  normal.repeat.set(12, 12)
  normal.needsUpdate = true
  const color = new THREE.Color(0x4a7a76).lerp(new THREE.Color(0x16303a), 0.6)
  const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.78, roughness: 0.07, metalness: 0.15, envMapIntensity: 1.0, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8) })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uWind = windUniforms.uWind
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;\nvarying vec2 vWaterUv;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vWaterUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float wave = (sin(wp.x * 0.9 + uTime * 1.4) * 0.035 + sin(wp.z * 1.3 + uTime * 1.1 + wp.x * 0.3) * 0.03) * (0.4 + uWind);
          transformed += normalize(objectNormal) * wave;
        }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec2 vWaterUv;")
      .replace(
        "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
        `vec3 mapN = normalize(
    ( texture2D( normalMap, vWaterUv * 12.0 + uTime * vec2( 0.012, 0.008 ) ).xyz * 2.0 - 1.0 ) +
    ( texture2D( normalMap, vWaterUv * 5.3 - uTime * vec2( 0.007, 0.004 ) ).xyz * 2.0 - 1.0 ) );`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  float fres = pow( 1.0 - max( dot( normal, normalize( vViewPosition ) ), 0.0 ), 3.0 );
  diffuseColor.a *= 0.75 + 0.25 * fres;
  #if defined( USE_FOG ) && !defined( USE_ENVMAP )
    outgoingLight = mix( outgoingLight, fogColor * 0.85, fres * 0.55 );
  #endif
}
#include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => "lk-water"
  waterMat = m
  return waterMat
}

/**
 * Height fog: the built-in exponential fog gets denser near the ground. Three parameters, shared by every
 * material through one vector (its clone() returns itself, so the per-material uniform copies stay linked):
 * x = fog floor height (m), y = falloff per metre above the floor, z = how strongly height shapes the fog.
 */
const fogParams = new THREE.Vector3(0, 0.1, 0.25)
fogParams.clone = () => fogParams

/** Height-fog controls (set from weather and biome): uFogFloor, uFogFalloff, uFogHeightMix. */
export const fogUniforms = {
  uFogFloor: {
    get value() {
      return fogParams.x
    },
    set value(v: number) {
      fogParams.x = v
    },
  },
  uFogFalloff: {
    get value() {
      return fogParams.y
    },
    set value(v: number) {
      fogParams.y = v
    },
  },
  uFogHeightMix: {
    get value() {
      return fogParams.z
    },
    set value(v: number) {
      fogParams.z = v
    },
  },
}

function installHeightFog(): void {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>
  if (chunks.fog_vertex.includes("vFogY")) return
  chunks.fog_pars_vertex = chunks.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth;\n\tvarying float vFogY;")
  // World height from the view-space position (rigid view matrix: world = Rᵀ(mv − t)); works for instanced
  // meshes, sprites and points alike because they all provide mvPosition.
  chunks.fog_vertex = chunks.fog_vertex.replace("vFogDepth = - mvPosition.z;", "vFogDepth = - mvPosition.z;\n\tvFogY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz - viewMatrix[ 3 ].xyz );")
  chunks.fog_pars_fragment = chunks.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth;\n\tvarying float vFogY;\n\tuniform vec3 uFogParams;")
  chunks.fog_fragment = chunks.fog_fragment.replace(
    "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
    `float lkFogH = exp( - max( vFogY - uFogParams.x, 0.0 ) * uFogParams.y );
	fogFactor = clamp( fogFactor * mix( 1.0, lkFogH * 1.6, uFogParams.z ) + lkFogH * uFogParams.z * 0.12, 0.0, 1.0 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`,
  )
  // Built-in materials copy their uniforms from ShaderLib at compile time: add the shared vector everywhere fog is.
  const lib = THREE.UniformsLib.fog as Record<string, THREE.IUniform>
  lib.uFogParams = { value: fogParams }
  for (const shader of Object.values(THREE.ShaderLib) as { uniforms: Record<string, THREE.IUniform> }[]) {
    if (shader.uniforms && "fogDensity" in shader.uniforms) shader.uniforms.uFogParams = { value: fogParams }
  }
}
installHeightFog()
