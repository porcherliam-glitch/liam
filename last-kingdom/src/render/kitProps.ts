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
