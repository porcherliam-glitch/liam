// Model library: loads glTF/GLB models (CC0 packs, see public/models/LICENSES.md) once and hands out clones.
// Sources: dist/models/<id>.glb next to the page, or base64 data embedded by scripts/build-single.mjs (window.__LK_MODELS).

import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js"

export interface LoadedModel {
  id: string
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  skinned: boolean
  /** Bounding box of the untransformed scene, metres. */
  size: THREE.Vector3
}

declare global {
  interface Window {
    __LK_MODELS?: Record<string, string>
  }
}

class ModelLibrary {
  private loader = new GLTFLoader()
  private pending = new Map<string, Promise<LoadedModel | null>>()
  private loaded = new Map<string, LoadedModel>()
  /** Ids that failed to load (missing file, corrupt data); callers fall back to procedural geometry. */
  readonly failed = new Set<string>()

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder)
  }

  /** Where a model comes from: inlined data (single-file build) or the models folder next to the page. */
  url(id: string): string {
    const inline = typeof window !== "undefined" ? window.__LK_MODELS?.[id] : undefined
    return inline ?? `./models/${id}.glb`
  }

  has(id: string): boolean {
    return this.loaded.has(id)
  }

  get(id: string): LoadedModel | null {
    return this.loaded.get(id) ?? null
  }

  load(id: string): Promise<LoadedModel | null> {
    const hit = this.loaded.get(id)
    if (hit) return Promise.resolve(hit)
    let p = this.pending.get(id)
    if (!p) {
      p = this.loader
        .loadAsync(this.url(id))
        .then((gltf) => {
          let skinned = false
          gltf.scene.traverse((o) => {
            if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true
            const m = o as THREE.Mesh
            if (m.isMesh) {
              m.castShadow = true
              m.receiveShadow = true
              m.frustumCulled = !skinned
            }
          })
          const box = new THREE.Box3().setFromObject(gltf.scene)
          const size = new THREE.Vector3()
          box.getSize(size)
          const model: LoadedModel = { id, scene: gltf.scene, animations: gltf.animations, skinned, size }
          this.loaded.set(id, model)
          return model
        })
        .catch((err: unknown) => {
          console.warn(`model ${id} could not be loaded`, err)
          this.failed.add(id)
          return null
        })
        .finally(() => this.pending.delete(id))
      this.pending.set(id, p)
    }
    return p
  }

  /** Loads several models, reporting progress 0..1. Missing models are skipped, never thrown. */
  async preload(ids: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0
    await Promise.all(
      ids.map((id) =>
        this.load(id).then(() => {
          done++
          onProgress?.(done, ids.length)
        }),
      ),
    )
  }

  /**
   * A fresh copy of a loaded model. Skinned models get their own skeleton (SkeletonUtils.clone);
   * with cloneMaterials every mesh gets its own material so tints and hit flashes stay per instance.
   */
  instantiate(id: string, opts: { cloneMaterials?: boolean } = {}): THREE.Group | null {
    const model = this.loaded.get(id)
    if (!model) return null
    const root = (model.skinned ? skeletonClone(model.scene) : model.scene.clone(true)) as THREE.Group
    if (opts.cloneMaterials) {
      const seen = new Map<THREE.Material, THREE.Material>()
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const dup = (mat: THREE.Material) => {
          let c = seen.get(mat)
          if (!c) {
            c = mat.clone()
            seen.set(mat, c)
          }
          return c
        }
        m.material = Array.isArray(m.material) ? m.material.map(dup) : dup(m.material)
      })
    }
    return root
  }
}

export const models = new ModelLibrary()
