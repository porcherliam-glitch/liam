// Ground clutter: thousands of crossed grass quads in one instanced draw call, swaying with the wind.

import * as THREE from "three"
import { Rng } from "../core/rng"
import { tex } from "./textures"
import { windUniforms } from "./materials"
import type { Terrain } from "../world/terrain"
import type { NavGrid } from "../world/nav"

export function buildGrass(terrain: Terrain, nav: NavGrid, biome: string, seed: number, count: number): THREE.InstancedMesh | null {
  if (biome === "catacombs" || biome === "city" || biome === "castle" || biome === "fortress") count = Math.round(count * 0.25)
  if (count <= 0) return null
  const rng = new Rng(seed ^ 0x6a5)
  const quad = new THREE.PlaneGeometry(1, 1)
  quad.translate(0, 0.5, 0)
  const quad2 = quad.clone()
  quad2.rotateY(Math.PI / 2)
  const geo = mergeTwo(quad, quad2)
  const dead = biome === "graveyard" || biome === "forest"
  const material = new THREE.MeshStandardMaterial({ map: tex("grass_blades"), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: dead ? 0x9a9a70 : 0xd0e0b0 })
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
        }`,
      )
  }
  material.customProgramCacheKey = () => "grasswind"
  const mesh = new THREE.InstancedMesh(geo, material, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const size = terrain.size * 0.9
  let placed = 0
  for (let i = 0; i < count * 4 && placed < count; i++) {
    const x = rng.range(-size, size)
    const z = rng.range(-size, size)
    if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.5) continue
    if (nav.isBlockedWorld(x, z)) continue
    const y = terrain.heightAt(x, z) - 0.02
    const s = rng.range(0.5, 1.1)
    pos.set(x, y, z)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI))
    scl.set(s * 1.1, s * 0.8, s * 1.1)
    m.compose(pos, q, scl)
    mesh.setMatrixAt(placed, m)
    placed++
  }
  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const na = a.toNonIndexed()
  const nb = b.toNonIndexed()
  const pos = new Float32Array([...(na.attributes.position.array as Float32Array), ...(nb.attributes.position.array as Float32Array)])
  const nor = new Float32Array([...(na.attributes.normal.array as Float32Array), ...(nb.attributes.normal.array as Float32Array)])
  const uv = new Float32Array([...(na.attributes.uv.array as Float32Array), ...(nb.attributes.uv.array as Float32Array)])
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  return g
}
