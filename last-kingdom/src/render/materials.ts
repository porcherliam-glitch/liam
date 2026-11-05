// Material cache. Materials are shared between meshes so draw calls can batch and memory stays low.

import * as THREE from "three"
import { tex } from "./textures"

const cache = new Map<string, THREE.Material>()

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
}

export function mat(texture: string | null, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([texture, opts])
  const hit = cache.get(key)
  if (hit) return hit as THREE.MeshStandardMaterial
  let map: THREE.Texture | null = null
  if (texture) {
    map = tex(texture)
    if (opts.repeat && opts.repeat !== 1) {
      map = map.clone()
      map.repeat.set(opts.repeat, opts.repeat)
      map.needsUpdate = true
    }
  }
  const m = new THREE.MeshStandardMaterial({
    map: map ?? undefined,
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
  cache.set(key, m)
  return m
}

export const M = {
  stone: () => mat("stone", { color: 0xcfcac0 }),
  stoneDark: () => mat("stone_dark", { color: 0xd8d8e0 }),
  cobble: () => mat("cobble"),
  plaster: () => mat("plaster"),
  timber: () => mat("timber"),
  planks: () => mat("planks"),
  roof: () => mat("roof"),
  thatch: () => mat("thatch"),
  bark: () => mat("bark"),
  leaves: () => Foliage.leaves(),
  leavesDead: () => Foliage.leavesDead(),
  metal: () => mat("metal", { color: 0xb8bcc4, metalness: 0.75, roughness: 0.45 }),
  metalDark: () => mat("metal", { color: 0x55585e, metalness: 0.7, roughness: 0.6 }),
  iron: () => mat(null, { color: 0x3a3c40, metalness: 0.6, roughness: 0.6 }),
  gold: () => mat(null, { color: 0xd8a640, metalness: 0.9, roughness: 0.35 }),
  bone: () => mat("bone"),
  cloth: (color: number) => mat("cloth", { color }),
  flat: (color: number, roughness = 0.9) => mat(null, { color, roughness }),
  water: () => mat("water", { color: 0x5a7a88, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.3 }),
  glow: (color: number, intensity = 1.5) => mat(null, { color, emissive: color, emissiveIntensity: intensity }),
}

/** Shared wind uniforms for foliage sway; updated once per frame by the expedition. */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } }

function addWind(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
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
  return m
}

/** Foliage materials with wind displacement (the merged geometry keeps world positions). */
export const Foliage = {
  leaves: () => addWind(mat("leaves", { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, flat: false })),
  leavesDead: () => addWind(mat("leaves_dead", { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, flat: false })),
}
