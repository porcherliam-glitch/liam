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
        normalizeAttributes(g)
        g.applyMatrix4(e.matrix)
        geos.push(g)
      }
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

function normalizeAttributes(g: THREE.BufferGeometry): void {
  const keep = ["position", "normal", "uv"]
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name)
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) {
    const n = g.attributes.position.count
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  }
  if (g.index) {
    const ng = g.toNonIndexed()
    g.copy(ng)
    ng.dispose()
  }
}

export function disposeMeshes(meshes: THREE.Mesh[]): void {
  for (const m of meshes) {
    m.geometry.dispose()
    m.removeFromParent()
  }
}
