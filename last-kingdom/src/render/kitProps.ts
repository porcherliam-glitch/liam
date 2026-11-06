// Props from the CC0 Fantasy Props MegaKit (Quaternius), packed into one file (public/models/props_kit.glb).
// Each prop is a named node; instances share geometry and materials, so the static batcher can merge them.

import * as THREE from "three"
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { models } from "./assets"

export const PROP_MODELS = ["props_kit", "nature_kit"]

/** A copy of a kit prop with its base on the ground, or null while the kit is not loaded. */
export function kitProp(name: string, scale = 1): THREE.Group | null {
  const kit = models.get("props_kit")
  const src = kit?.scene.getObjectByName(name)
  if (!src) return null
  const copy = skeletonClone(src) as THREE.Object3D
  copy.position.set(0, 0, 0)
  copy.scale.setScalar(scale)
  copy.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  const g = new THREE.Group()
  g.add(copy)
  return g
}

const rigidGeos = new Map<string, THREE.BufferGeometry>()

/**
 * Replaces every skinned mesh weighted to a single bone by a plain mesh under that bone (geometry baked once per
 * source and shared). A chest then draws its body in the static batch and only the lid stays a separate object.
 */
export function rigidify(root: THREE.Object3D): void {
  const skinned: THREE.SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh)
  })
  for (const m of skinned) {
    const bone = singleBoneOf(m)
    if (bone < 0) continue
    const key = `${m.geometry.uuid}:${bone}`
    let g = rigidGeos.get(key)
    if (!g) {
      g = m.geometry.clone()
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name)
      for (const name of Object.keys(g.attributes)) {
        const a = g.getAttribute(name) as THREE.BufferAttribute
        if (a.array instanceof Float32Array && !a.normalized) continue
        const f = new Float32Array(a.count * a.itemSize)
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k)
        g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize))
      }
      // Bind pose into the bone's frame: world = boneWorld * boneInverse * bindMatrix * v
      g.applyMatrix4(m.skeleton.boneInverses[bone].clone().multiply(m.bindMatrix))
      rigidGeos.set(key, g)
    }
    const mesh = new THREE.Mesh(g, m.material)
    mesh.name = m.name
    mesh.castShadow = m.castShadow
    mesh.receiveShadow = m.receiveShadow
    m.skeleton.bones[bone].add(mesh)
    m.removeFromParent()
  }
}

function singleBoneOf(m: THREE.SkinnedMesh): number {
  const si = m.geometry.getAttribute("skinIndex")
  const sw = m.geometry.getAttribute("skinWeight")
  if (!si || !sw) return -1
  let bone = -1
  for (let v = 0; v < si.count; v++) {
    for (let k = 0; k < 4; k++) {
      if (sw.getComponent(v, k) < 0.01) continue
      const b = si.getComponent(v, k)
      if (bone === -1) bone = b
      else if (b !== bone) return -1
    }
  }
  return bone
}

interface LidPart {
  mesh: THREE.InstancedMesh
  index: number
  local: THREE.Matrix4
}

const _lm = new THREE.Matrix4()

/**
 * Draws the rigid parts under many hinge objects (chest lids) as one InstancedMesh per geometry and material.
 * The hinges stay in the scene graph without meshes; after moving one, call syncInstancedParts(hinge).
 */
export function instanceParts(hinges: THREE.Object3D[], parent: THREE.Object3D): THREE.InstancedMesh[] {
  const groups = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; cast: boolean; items: { hinge: THREE.Object3D; local: THREE.Matrix4 }[] }>()
  for (const hinge of hinges) {
    hinge.updateMatrixWorld(true)
    const meshes: THREE.Mesh[] = []
    hinge.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(m)
    })
    for (const m of meshes) {
      const mat = m.material as THREE.Material
      const key = `${m.geometry.uuid}:${Array.isArray(m.material) ? "multi" : mat.uuid}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { geometry: m.geometry, material: m.material, cast: m.castShadow, items: [] }))
      // Pose of the part relative to its hinge
      const local = hinge.matrixWorld.clone().invert().multiply(m.matrixWorld)
      g.items.push({ hinge, local })
      m.removeFromParent()
    }
  }
  const out: THREE.InstancedMesh[] = []
  for (const g of groups.values()) {
    const im = new THREE.InstancedMesh(g.geometry, g.material, g.items.length)
    im.castShadow = g.cast
    im.receiveShadow = true
    g.items.forEach((it, i) => {
      im.setMatrixAt(i, _lm.multiplyMatrices(it.hinge.matrixWorld, it.local))
      const parts = (it.hinge.userData.instancedParts ??= []) as LidPart[]
      parts.push({ mesh: im, index: i, local: it.local })
    })
    im.computeBoundingSphere()
    parent.add(im)
    out.push(im)
  }
  return out
}

/** Copies a hinge's current pose into its instanced parts (see instanceParts). */
export function syncInstancedParts(hinge: THREE.Object3D): void {
  const parts = hinge.userData.instancedParts as LidPart[] | undefined
  if (!parts) return
  hinge.updateMatrixWorld(true)
  for (const p of parts) {
    p.mesh.setMatrixAt(p.index, _lm.multiplyMatrices(hinge.matrixWorld, p.local))
    p.mesh.instanceMatrix.needsUpdate = true
  }
}

const heights = new Map<string, number>()

/**
 * A nature model (CC0 Ultimate Nature Pack, Quaternius) scaled to a target height, or null while not loaded.
 * The pack's flat colours are lifted once so foliage does not look black under the game's lighting.
 */
export function kitNature(name: string, targetHeight: number, rotY = 0): THREE.Group | null {
  const kit = models.get("nature_kit")
  const src = kit?.scene.getObjectByName(name)
  if (!src) return null
  let h = heights.get(name)
  if (h === undefined) {
    const box = new THREE.Box3().setFromObject(src)
    h = Math.max(0.05, box.max.y - Math.min(0, box.min.y))
    heights.set(name, h)
    src.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        if (mat.userData.lifted) continue
        mat.userData.lifted = true
        mat.color.multiplyScalar(/rock/i.test(mat.name) ? 1.9 : /white/i.test(mat.name) ? 1.3 : 1.7)
        mat.roughness = 0.9
        mat.metalness = 0
      }
    })
  }
  const copy = src.clone(true)
  copy.position.set(0, 0, 0)
  copy.rotation.set(0, rotY, 0)
  copy.scale.setScalar(targetHeight / h)
  copy.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  const g = new THREE.Group()
  g.add(copy)
  return g
}
