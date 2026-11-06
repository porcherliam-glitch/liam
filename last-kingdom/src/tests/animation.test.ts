import { describe, expect, it } from "vitest"
import { Animator, CLIPS, CRAWL_REMAP, MIX } from "../render/animator"
import * as THREE from "three"
import { BONE_NAMES, type Humanoid } from "../render/humanoid"

describe("animation", () => {
  it("every game clip has a library mapping", () => {
    for (const name of Object.keys(CLIPS)) expect(MIX[name], name).toBeDefined()
  })

  it("crawl remap only points at existing clips", () => {
    for (const [from, to] of Object.entries(CRAWL_REMAP)) {
      expect(CLIPS[from], from).toBeDefined()
      expect(CLIPS[to], to).toBeDefined()
      expect(MIX[to], to).toBeDefined()
    }
  })

  it("a crawler plays the crawl clips instead of the standing ones", () => {
    // Bones only: the animator of the procedural figure needs nothing else (no textures, no DOM)
    const h = { bones: Object.fromEntries(BONE_NAMES.map((n) => [n, new THREE.Bone()])) } as unknown as Humanoid
    const a = new Animator(h)
    a.remap = CRAWL_REMAP
    a.play("z_walk")
    expect(a.name).toBe("z_crawl")
    a.play("z_bite", { restart: true })
    expect(a.name).toBe("z_crawl_attack")
    a.update(0.1)
    // Lying flat: the hips sit far below standing height
    expect(h.bones.hips.position.y).toBeLessThan(0.5)
  })
})
