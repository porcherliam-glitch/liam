// Small kit models (weapons, shields, helmets) come as one mesh per flat colour. Merged into one mesh per material
// class with the colours baked into vertex colours, a sword costs one or two draws instead of five.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

export interface PartClass {
  /** Material of the merged mesh (white base colour, vertexColors on). */
  material: THREE.MeshStandardMaterial
  /** Colour of a source material as it should look (linear RGB). */
  color: (m: THREE.MeshStandardMaterial) => THREE.Color
}

/**
 * Merges the meshes below `root` (transforms baked relative to root) into one mesh per class that
 * `classify` picks for each source material. Returns null when a part cannot be merged (textures, skinning),
 * so the caller can keep the original.
 */
export function mergeFlatParts(root: THREE.Object3D, classify: (m: THREE.MeshStandardMaterial) => PartClass): THREE.Group | null {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const groups = new Map<PartClass, THREE.BufferGeometry[]>()
  let ok = true
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !ok) return
    const mat = m.material as THREE.MeshStandardMaterial
    if ((m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material) || mat.map) {
      ok = false
      return
    }
    const cls = classify(mat)
    const g = new THREE.BufferGeometry()
    const pos = m.geometry.getAttribute("position")
    const nor = m.geometry.getAttribute("normal")
    const n = pos.count
    const p = new Float32Array(n * 3)
    const q = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.getX(i)
      p[i * 3 + 1] = pos.getY(i)
      p[i * 3 + 2] = pos.getZ(i)
      if (nor) {
        q[i * 3] = nor.getX(i)
        q[i * 3 + 1] = nor.getY(i)
        q[i * 3 + 2] = nor.getZ(i)
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3))
    g.setAttribute("normal", new THREE.BufferAttribute(q, 3))
    if (!nor) g.computeVertexNormals()
    const c = cls.color(mat)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3))
    const idx = m.geometry.getIndex()
    if (idx) g.setIndex(Array.from({ length: idx.count }, (_, i) => idx.getX(i)))
    else g.setIndex(Array.from({ length: n }, (_, i) => i))
    g.applyMatrix4(inv.clone().multiply(m.matrixWorld))
    const list = groups.get(cls) ?? []
    list.push(g)
    groups.set(cls, list)
  })
  if (!ok || !groups.size) return null
  const out = new THREE.Group()
  for (const [cls, geos] of groups) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (!merged) return null
    merged.computeBoundingSphere()
    const mesh = new THREE.Mesh(merged, cls.material)
    mesh.castShadow = true
    out.add(mesh)
  }
  return out
}
