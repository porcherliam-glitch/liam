// Static batching: merges all static prop meshes of a chunk that share a material into one mesh.
// Hundreds of buildings and trees then cost a few dozen draw calls instead of thousands.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

interface Entry {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrix: THREE.Matrix4
  castShadow: boolean
  receiveShadow: boolean
  source: THREE.Mesh
}

export class StaticBatcher {
  private entries: Entry[] = []
  private chunk = 48

  /** Walks a placed group and records every static mesh (userData.dynamic === true is skipped). */
  addGroup(group: THREE.Object3D): void {
    group.updateMatrixWorld(true)
    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || o.userData.dynamic || hasDynamicParent(o, group)) return
      if (Array.isArray(m.material)) return
      this.entries.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone(), castShadow: m.castShadow, receiveShadow: m.receiveShadow, source: m })
    })
  }

  /** Forgets every mesh recorded from a group (for props removed again before the merge). */
  removeGroup(group: THREE.Object3D): void {
    const inGroup = new Set<THREE.Object3D>()
    group.traverse((o) => inGroup.add(o))
    this.entries = this.entries.filter((e) => !inGroup.has(e.source))
  }

  /** Builds merged meshes and adds them to the scene. */
  build(scene: THREE.Object3D): THREE.Mesh[] {
    const groups = new Map<string, Entry[]>()
    const pos = new THREE.Vector3()
    for (const e of this.entries) {
      pos.setFromMatrixPosition(e.matrix)
      const cx = Math.floor(pos.x / this.chunk)
      const cz = Math.floor(pos.z / this.chunk)
      const key = `${e.material.uuid}:${cx}:${cz}:${e.castShadow ? 1 : 0}${e.receiveShadow ? 1 : 0}`
      let list = groups.get(key)
      if (!list) {
        list = []
        groups.set(key, list)
      }
      list.push(e)
    }
    const out: THREE.Mesh[] = []
    // The originals are replaced by the merged meshes: hide them so nothing renders twice.
    for (const e of this.entries) e.source.visible = false
    for (const list of groups.values()) {
      const geos: THREE.BufferGeometry[] = []
      for (const e of list) {
        const g = e.geometry.clone()
        // Merge needs identical attribute sets: drop the ones that differ.
        normalizeAttributes(g, !!(list[0].material as THREE.Material & { vertexColors?: boolean }).vertexColors)
        g.applyMatrix4(e.matrix)
        geos.push(g)
      }
      // Mixed 16/32-bit index arrays cannot be merged: widen them all
      if (geos.some((g) => g.index!.array instanceof Uint32Array)) for (const g of geos) if (!(g.index!.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index!.array), 1))
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, list[0].material)
      mesh.castShadow = list[0].castShadow
      mesh.receiveShadow = list[0].receiveShadow
      mesh.matrixAutoUpdate = false
      scene.add(mesh)
      out.push(mesh)
    }
    this.entries = []
    return out
  }
}

function hasDynamicParent(o: THREE.Object3D, root: THREE.Object3D): boolean {
  let p = o.parent
  while (p && p !== root) {
    if (p.userData.dynamic) return true
    p = p.parent
  }
  return false
}

function normalizeAttributes(g: THREE.BufferGeometry, keepColor = false): void {
  const keep = keepColor ? ["position", "normal", "uv", "color"] : ["position", "normal", "uv"]
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name)
  // glTF models may carry integer/normalised or 4-component attributes: bring everything to plain floats
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute
    const size = name === "color" ? 3 : a.itemSize
    if (a.array instanceof Float32Array && a.itemSize === size && !a.normalized) continue
    const f = new Float32Array(a.count * size)
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) f[i * size + k] = a.getComponent(i, k)
    g.setAttribute(name, new THREE.BufferAttribute(f, size))
  }
  if (keepColor && !g.attributes.color) {
    const n = g.attributes.position.count
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3))
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) {
    const n = g.attributes.position.count
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  }
  // Keep geometry indexed (three primitives and glTF meshes are); give non-indexed ones a sequential index.
  // De-indexing everything tripled the vertex memory once models with thousands of triangles were merged.
  if (!g.index) {
    const n = g.attributes.position.count
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n)
    for (let i = 0; i < n; i++) idx[i] = i
    g.setIndex(new THREE.BufferAttribute(idx, 1))
  }
}

export function disposeMeshes(meshes: THREE.Mesh[]): void {
  for (const m of meshes) {
    m.geometry.dispose()
    m.removeFromParent()
  }
}
