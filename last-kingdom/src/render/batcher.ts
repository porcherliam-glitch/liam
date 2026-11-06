// Static batching: merges all static prop meshes of a 96 m chunk that share a material family into one mesh.
// Hundreds of buildings and trees then cost a few dozen draw calls instead of thousands. Meshes whose
// materials differ only in colour (mat() families) share one white, vertex-coloured material: each mesh's
// colour is baked into the colour attribute. Geometries stay indexed.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { bakeColor, familyMaterial, familyOf } from "./materials"

interface Entry {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrix: THREE.Matrix4
  castShadow: boolean
  receiveShadow: boolean
  source: THREE.Mesh
  /** Distance beyond which the merged batch may be hidden (userData.cullRange on the mesh or a parent). */
  range: number
}

interface Group {
  /** Family key or material uuid. */
  id: string
  /** True when the entries share a mat() family (colour baked into vertex colours). */
  family: boolean
  cx: number
  cz: number
  cast: boolean
  range: number
  tris: number
  list: Entry[]
}

/** Groups below this many triangles are merged with their neighbours into 192 m cells (fewer, still cullable draws). */
const SMALL_GROUP = 1500

type WithVertexColors = THREE.Material & { vertexColors?: boolean }

export class StaticBatcher {
  private entries: Entry[] = []
  // 96 m: in the city 17 % fewer draws than 64 m for 15 % more triangles; 128 m adds little and costs a third more
  private chunk = 96

  /** Walks a placed group and records every static mesh (userData.dynamic === true is skipped). */
  addGroup(group: THREE.Object3D): void {
    group.updateMatrixWorld(true)
    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || o.userData.dynamic || hasDynamicParent(o, group)) return
      if (Array.isArray(m.material)) return
      this.entries.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone(), castShadow: m.castShadow, receiveShadow: m.receiveShadow, source: m, range: cullRangeOf(o, group) })
    })
  }

  /** Forgets every mesh recorded from a group (for props removed again before the merge). */
  removeGroup(group: THREE.Object3D): void {
    const inGroup = new Set<THREE.Object3D>()
    group.traverse((o) => inGroup.add(o))
    this.entries = this.entries.filter((e) => !inGroup.has(e.source))
  }

  /** Builds merged meshes and adds them to the scene. Every mesh carries a bounding sphere (for culling). */
  build(scene: THREE.Object3D): THREE.Mesh[] {
    const groups = new Map<string, Group>()
    const pos = new THREE.Vector3()
    for (const e of this.entries) {
      pos.setFromMatrixPosition(e.matrix)
      // Details with a cull range use finer cells, so their batches can switch off close to the camera
      const size = Number.isFinite(e.range) ? this.chunk / 2 : this.chunk
      const cx = Math.floor(pos.x / size)
      const cz = Math.floor(pos.z / size)
      const family = familyOf(e.material)
      // Only casting splits a family: merged meshes always receive shadows (for small props that did not,
      // this costs nothing visible and halves the number of groups).
      const id = family ?? e.material.uuid
      const key = `${id}:${cx}:${cz}:${e.castShadow ? 1 : 0}:${e.range}`
      let g = groups.get(key)
      if (!g) {
        g = { id, family: family !== null, cx, cz, cast: e.castShadow, range: e.range, tris: 0, list: [] }
        groups.set(key, g)
      }
      g.list.push(e)
      g.tris += (e.geometry.index ? e.geometry.index.count : e.geometry.attributes.position.count) / 3
    }
    // Sparse groups (a few lamps or fittings in a cell) join the groups of the neighbouring cells.
    for (const [key, g] of [...groups]) {
      if (g.tris >= SMALL_GROUP || Number.isFinite(g.range)) continue
      groups.delete(key)
      const big = `${g.id}:S${Math.floor(g.cx / 2)}:${Math.floor(g.cz / 2)}:${g.cast ? 1 : 0}`
      const into = groups.get(big)
      if (into) into.list.push(...g.list)
      else groups.set(big, g)
    }
    const out: THREE.Mesh[] = []
    // The originals are replaced by the merged meshes: hide them so nothing renders twice.
    for (const e of this.entries) e.source.visible = false
    const prepared = new Map<string, THREE.BufferGeometry>()
    const tint = new THREE.Color()
    for (const group of groups.values()) {
      const first = group.list[0]
      const material = group.family ? familyMaterial(first.material) : first.material
      const vertexColors = !!(material as WithVertexColors).vertexColors
      const geos: THREE.BufferGeometry[] = []
      for (const e of group.list) {
        // Vertex colours of the source only count when its own material used them.
        const ownColors = !!(e.material as WithVertexColors).vertexColors && !!e.geometry.getAttribute("color")
        const pkey = `${e.geometry.uuid}:${ownColors ? 1 : 0}`
        let base = prepared.get(pkey)
        if (!base) {
          base = prepare(e.geometry, ownColors)
          prepared.set(pkey, base)
        }
        const g = base.clone()
        if (vertexColors) applyColor(g, group.family ? bakeColor(e.material, tint) : null)
        g.applyMatrix4(e.matrix)
        geos.push(g)
      }
      // Mixed 16/32-bit index arrays cannot be merged: widen them all
      if (geos.some((g) => g.index!.array instanceof Uint32Array)) for (const g of geos) if (!(g.index!.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index!.array), 1))
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) {
        console.warn(`StaticBatcher: could not merge ${group.list.length} meshes`)
        for (const e of group.list) e.source.visible = true
        continue
      }
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = first.castShadow
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      if (Number.isFinite(group.range)) mesh.userData.cullRange = group.range
      scene.add(mesh)
      out.push(mesh)
    }
    for (const g of prepared.values()) g.dispose()
    this.entries = []
    return out
  }
}

function cullRangeOf(o: THREE.Object3D, root: THREE.Object3D): number {
  let p: THREE.Object3D | null = o
  while (p) {
    if (typeof p.userData.cullRange === "number") return p.userData.cullRange
    if (p === root) break
    p = p.parent
  }
  return Infinity
}

function hasDynamicParent(o: THREE.Object3D, root: THREE.Object3D): boolean {
  let p = o.parent
  while (p && p !== root) {
    if (p.userData.dynamic) return true
    p = p.parent
  }
  return false
}

/**
 * Copy of a source geometry with a uniform attribute set (position, normal, uv and optionally colour as plain
 * floats) that is always indexed: non-indexed geometries (extrusions, polyhedra) get their duplicate
 * vertices welded, so merged meshes stay indexed and lighter.
 */
function prepare(src: THREE.BufferGeometry, keepColor: boolean): THREE.BufferGeometry {
  const g = src.clone()
  const keep = keepColor ? ["position", "normal", "uv", "color"] : ["position", "normal", "uv"]
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name)
  g.morphAttributes = {}
  // glTF models may carry integer/normalised, interleaved or 4-component attributes: bring everything to plain floats
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    const size = name === "color" ? 3 : a.itemSize
    if (!(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.array instanceof Float32Array && a.itemSize === size && !a.normalized) continue
    const f = new Float32Array(a.count * size)
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) f[i * size + k] = a.getComponent(i, k)
    g.setAttribute(name, new THREE.BufferAttribute(f, size))
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) {
    const n = g.attributes.position.count
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  }
  if (g.index) return g
  const welded = weld(g, 1e-4)
  g.dispose()
  return welded
}

/**
 * Indexes a non-indexed geometry, welding vertices whose attributes all agree within `tolerance` (like
 * BufferGeometryUtils.mergeVertices, but with a numeric hash table instead of string keys: much faster for
 * the thousands of small polyhedra a world contains). Expects plain float attributes.
 */
function weld(g: THREE.BufferGeometry, tolerance: number): THREE.BufferGeometry {
  const names = Object.keys(g.attributes)
  const attrs = names.map((n) => g.getAttribute(n) as THREE.BufferAttribute)
  const n = attrs[0].count
  let stride = 0
  for (const a of attrs) stride += a.itemSize
  const q = new Int32Array(n * stride)
  const inv = 1 / tolerance
  for (let i = 0; i < n; i++) {
    let o = i * stride
    for (const a of attrs) {
      const arr = a.array as Float32Array
      for (let k = 0; k < a.itemSize; k++) q[o++] = Math.round(arr[i * a.itemSize + k] * inv)
    }
  }
  let cap = 1
  while (cap < n * 2) cap <<= 1
  const table = new Int32Array(cap).fill(-1)
  const remap = new Uint32Array(n)
  const firstOf: number[] = []
  for (let i = 0; i < n; i++) {
    const o = i * stride
    let h = 0x811c9dc5
    for (let k = 0; k < stride; k++) h = Math.imul(h ^ q[o + k], 0x01000193)
    let slot = (h >>> 0) & (cap - 1)
    for (;;) {
      const rep = table[slot]
      if (rep < 0) {
        table[slot] = i
        remap[i] = firstOf.length
        firstOf.push(i)
        break
      }
      const ro = rep * stride
      let same = true
      for (let k = 0; k < stride; k++) {
        if (q[ro + k] !== q[o + k]) {
          same = false
          break
        }
      }
      if (same) {
        remap[i] = remap[rep]
        break
      }
      slot = (slot + 1) & (cap - 1)
    }
  }
  const out = new THREE.BufferGeometry()
  for (let a = 0; a < attrs.length; a++) {
    const src = attrs[a].array as Float32Array
    const size = attrs[a].itemSize
    const dst = new Float32Array(firstOf.length * size)
    for (let v = 0; v < firstOf.length; v++) for (let k = 0; k < size; k++) dst[v * size + k] = src[firstOf[v] * size + k]
    out.setAttribute(names[a], new THREE.BufferAttribute(dst, size))
  }
  out.setIndex(new THREE.BufferAttribute(firstOf.length > 65535 ? remap : new Uint16Array(remap), 1))
  return out
}

/** Ensures a colour attribute (white when missing) and multiplies it by `tint` (linear RGB). */
function applyColor(g: THREE.BufferGeometry, tint: THREE.Color | null): void {
  const n = g.attributes.position.count
  let a = g.getAttribute("color") as THREE.BufferAttribute | undefined
  if (!a) {
    a = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)
    g.setAttribute("color", a)
  } else {
    // clone() shares nothing with the prepared base, but make sure we never write into a shared array
    a = new THREE.BufferAttribute(new Float32Array(a.array as Float32Array), 3)
    g.setAttribute("color", a)
  }
  if (!tint) return
  const arr = a.array as Float32Array
  for (let i = 0; i < n; i++) {
    arr[i * 3] *= tint.r
    arr[i * 3 + 1] *= tint.g
    arr[i * 3 + 2] *= tint.b
  }
}

export function disposeMeshes(meshes: THREE.Mesh[]): void {
  for (const m of meshes) {
    m.geometry.dispose()
    m.removeFromParent()
  }
}
