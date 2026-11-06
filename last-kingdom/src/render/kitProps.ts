// Props from the CC0 Fantasy Props MegaKit (Quaternius), packed into one file (public/models/props_kit.glb).
// Each prop is a named node; instances share geometry and materials, so the static batcher can merge them.

import * as THREE from "three"
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { models } from "./assets"

export const PROP_MODELS = ["props_kit"]

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
