// Ground clutter: crossed grass quads in one instanced draw call, swaying with the wind. Only a ring of
// radius 42 m around the camera is populated: every instance owns a cell of a world-fixed jittered lattice
// that repeats every 84 m, and is moved to the lattice copy nearest to the camera when the camera moves on.
// Blades take the terrain's colour, stay off roads, water, steep slopes and blocked ground, and fade out
// toward the edge of the ring.

import * as THREE from "three"
import { Rng } from "../core/rng"
import { smoothstep } from "../core/math"
import { tex } from "./textures"
import { windUniforms } from "./materials"
import type { Terrain } from "../world/terrain"
import type { NavGrid } from "../world/nav"

/** Blade count per area (set from the quality settings before a world is built). */
export const grassOptions = { count: 8000 }

/** Radius of the populated ring around the camera (m). */
const R = 42

export function buildGrass(terrain: Terrain, nav: NavGrid, biome: string, seed: number, count: number): THREE.InstancedMesh | null {
  const cap = biome === "catacombs" ? 0 : biome === "city" || biome === "castle" || biome === "fortress" ? Math.round(grassOptions.count * 0.375) : grassOptions.count
  const side = Math.floor(Math.sqrt(Math.min(count, cap)))
  if (side <= 0) return null
  const n = side * side
  const cell = (2 * R) / side
  const rng = new Rng(seed ^ 0x6a5)
  const quad = new THREE.PlaneGeometry(1, 1)
  quad.translate(0, 0.5, 0)
  const quad2 = quad.clone()
  quad2.rotateY(Math.PI / 2)
  const geo = mergeTwo(quad, quad2)
  const dead = biome === "graveyard" || biome === "forest"
  const material = new THREE.MeshStandardMaterial({ map: tex("grass_blades"), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: dead ? 0xc8c4a0 : 0xe0e8c8 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uWind = windUniforms.uWind
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          float sway = sin(uTime * 1.7 + wp.x * 0.5 + wp.z * 0.35) * 0.5 + sin(uTime * 3.1 + wp.z * 0.9) * 0.3;
          transformed.x += sway * uWind * 0.25 * position.y;
          transformed.z += sway * uWind * 0.12 * position.y;
          // Shrink toward the root between 35 m and the ring edge, so blades never pop
          vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float fade = 1.0 - smoothstep(35.0, ${R.toFixed(1)}, distance(root.xz, cameraPosition.xz));
          transformed *= fade;
        }`,
      )
    // Blades are lit like the ground below them: the up normal must not flip on back faces.
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize( vNormal );")
  }
  material.customProgramCacheKey = () => "grasswind2"
  const mesh = new THREE.InstancedMesh(geo, material, n)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
  // Per-instance constants: lattice position (in one 2R period), rotation and base size
  const baseX = new Float32Array(n)
  const baseZ = new Float32Array(n)
  const cosA = new Float32Array(n)
  const sinA = new Float32Array(n)
  const size0 = new Float32Array(n)
  for (let gz = 0; gz < side; gz++) {
    for (let gx = 0; gx < side; gx++) {
      const i = gz * side + gx
      baseX[i] = (gx + rng.next()) * cell
      baseZ[i] = (gz + rng.next()) * cell
      const a = rng.range(0, Math.PI)
      cosA[i] = Math.cos(a)
      sinA[i] = Math.sin(a)
      size0[i] = rng.range(0.5, 1.1)
    }
  }
  // Per-instance state at its current place
  const curX = new Float32Array(n).fill(Number.NaN)
  const curZ = new Float32Array(n).fill(Number.NaN)
  const curY = new Float32Array(n)
  const curS = new Float32Array(n)
  const matrices = mesh.instanceMatrix.array as Float32Array
  const colors = mesh.instanceColor.array as Float32Array
  const tint = new THREE.Color()
  const period = 2 * R
  const wrap = (b: number, c: number) => {
    const t = b - c + R
    return c + t - period * Math.floor(t / period) - R
  }
  const place = (cx: number, cz: number) => {
    let recoloured = false
    for (let i = 0; i < n; i++) {
      const x = wrap(baseX[i], cx)
      const z = wrap(baseZ[i], cz)
      if (x !== curX[i] || z !== curZ[i]) {
        curX[i] = x
        curZ[i] = z
        curY[i] = terrain.heightAt(x, z) - 0.02
        const bare = nav.isBlockedWorld(x, z) || terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.5
        curS[i] = bare ? 0 : size0[i] * smoothstep(0.25, 0.7, terrain.grassAt(x, z))
        terrain.colorAt(x, z, tint)
        colors[i * 3] = tint.r * 1.15
        colors[i * 3 + 1] = tint.g * 1.15
        colors[i * 3 + 2] = tint.b * 1.15
        recoloured = true
      }
      const s = curS[i] * smoothstep(R, R * 0.6, Math.hypot(x - cx, z - cz))
      const sx = s * 1.1
      const sy = s * 0.8
      const o = i * 16
      matrices[o] = cosA[i] * sx
      matrices[o + 1] = 0
      matrices[o + 2] = -sinA[i] * sx
      matrices[o + 3] = 0
      matrices[o + 4] = 0
      matrices[o + 5] = sy
      matrices[o + 6] = 0
      matrices[o + 7] = 0
      matrices[o + 8] = sinA[i] * sx
      matrices[o + 9] = 0
      matrices[o + 10] = cosA[i] * sx
      matrices[o + 11] = 0
      matrices[o + 12] = x
      matrices[o + 13] = curY[i]
      matrices[o + 14] = z
      matrices[o + 15] = 1
    }
    mesh.instanceMatrix.needsUpdate = true
    if (recoloured && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  let lastX = Number.NaN
  let lastZ = Number.NaN
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const p = camera.position
    if (!(Math.hypot(p.x - lastX, p.z - lastZ) <= 2)) {
      lastX = p.x
      lastZ = p.z
      place(p.x, p.z)
    }
  }
  place(0, 0)
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const na = a.toNonIndexed()
  const nb = b.toNonIndexed()
  const pos = new Float32Array([...(na.attributes.position.array as Float32Array), ...(nb.attributes.position.array as Float32Array)])
  const uv = new Float32Array([...(na.attributes.uv.array as Float32Array), ...(nb.attributes.uv.array as Float32Array)])
  // Straight-up normals: the blades take the ground's lighting instead of going dark edge-on
  const nor = new Float32Array(pos.length)
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  return g
}
