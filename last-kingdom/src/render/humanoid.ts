// Procedural skinned humanoid: one SkinnedMesh with a 16-bone skeleton. Every body part is a box whose
// vertices are bound rigidly to one bone, so a whole character costs a single draw call.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { Rng } from "../core/rng"
import { mat } from "./materials"

export type BoneName =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "upperArmL"
  | "forearmL"
  | "handL"
  | "upperArmR"
  | "forearmR"
  | "handR"
  | "thighL"
  | "shinL"
  | "footL"
  | "thighR"
  | "shinR"
  | "footR"

export const BONE_NAMES: BoneName[] = [
  "hips", "spine", "chest", "neck", "head", "upperArmL", "forearmL", "handL", "upperArmR", "forearmR", "handR",
  "thighL", "shinL", "footL", "thighR", "shinR", "footR",
]

export type ArmorLook = "none" | "rags" | "gambeson" | "leather" | "chain" | "brigandine" | "plate"
export type HelmetLook = "none" | "hood" | "kettle" | "nasal" | "bascinet" | "great"

export interface Appearance {
  skin: number
  shirt: number
  pants: number
  boots: number
  hair: number
  armor: ArmorLook
  helmet: HelmetLook
  /** Zombie wear: exposed bone, torn clothes, hunched geometry. */
  undead: boolean
  /** Overall body scale. */
  scale: number
  /** Chest/arm bulk multiplier (brutes). */
  bulk: number
  /** Knight-style pauldrons and greaves. */
  armored: boolean
  seed: number
  skinTexture?: string
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 0xd9b08c,
  shirt: 0x6b5a3a,
  pants: 0x4a3c2a,
  boots: 0x2a1e14,
  hair: 0x3a2a1a,
  armor: "none",
  helmet: "none",
  undead: false,
  scale: 1,
  bulk: 1,
  armored: false,
  seed: 1,
}

export interface Humanoid {
  mesh: THREE.SkinnedMesh
  root: THREE.Group
  bones: Record<BoneName, THREE.Bone>
  /** Attachment points for weapons / shields. */
  handR: THREE.Object3D
  handL: THREE.Object3D
  back: THREE.Object3D
  headTop: THREE.Object3D
  height: number
}

interface Part {
  bone: number
  size: [number, number, number]
  offset: [number, number, number]
  color: number
  /** Rounded (bevelled) box for organic parts. */
  round?: boolean
}

// Bind pose joint positions relative to the parent bone (metres, for a 1.8 m figure).
const JOINTS: Record<BoneName, { parent: BoneName | null; pos: [number, number, number] }> = {
  hips: { parent: null, pos: [0, 0.98, 0] },
  spine: { parent: "hips", pos: [0, 0.12, 0] },
  chest: { parent: "spine", pos: [0, 0.2, 0] },
  neck: { parent: "chest", pos: [0, 0.26, 0] },
  head: { parent: "neck", pos: [0, 0.08, 0] },
  upperArmL: { parent: "chest", pos: [-0.24, 0.2, 0] },
  forearmL: { parent: "upperArmL", pos: [0, -0.28, 0] },
  handL: { parent: "forearmL", pos: [0, -0.26, 0] },
  upperArmR: { parent: "chest", pos: [0.24, 0.2, 0] },
  forearmR: { parent: "upperArmR", pos: [0, -0.28, 0] },
  handR: { parent: "forearmR", pos: [0, -0.26, 0] },
  thighL: { parent: "hips", pos: [-0.11, -0.04, 0] },
  shinL: { parent: "thighL", pos: [0, -0.44, 0] },
  footL: { parent: "shinL", pos: [0, -0.44, 0] },
  thighR: { parent: "hips", pos: [0.11, -0.04, 0] },
  shinR: { parent: "thighR", pos: [0, -0.44, 0] },
  footR: { parent: "shinR", pos: [0, -0.44, 0] },
}

function vary(color: number, rng: Rng, amount: number): number {
  const c = new THREE.Color(color)
  const hslv = { h: 0, s: 0, l: 0 }
  c.getHSL(hslv)
  c.setHSL(hslv.h + rng.range(-amount * 0.05, amount * 0.05), Math.max(0, hslv.s + rng.range(-amount, amount) * 0.3), Math.max(0.02, Math.min(0.95, hslv.l + rng.range(-amount, amount) * 0.25)))
  return c.getHex()
}

export function buildHumanoid(app: Partial<Appearance> = {}): Humanoid {
  const a: Appearance = { ...DEFAULT_APPEARANCE, ...app }
  const rng = new Rng(a.seed)
  const bulk = a.bulk
  const boneIndex = (n: BoneName) => BONE_NAMES.indexOf(n)

  // Colours (undead get rotten, blotchy variants)
  const skin = a.undead ? vary(a.skin, rng, 0.5) : vary(a.skin, rng, 0.15)
  const shirt = vary(a.shirt, rng, a.undead ? 0.6 : 0.2)
  const pants = vary(a.pants, rng, a.undead ? 0.6 : 0.2)
  const boots = vary(a.boots, rng, 0.2)
  const metal = 0xb0b4bc
  const metalDark = 0x6a6e76
  const leather = 0x5a3e28
  const chain = 0x8a8e96
  const brig = 0x5c2e2e

  const parts: Part[] = []
  const torsoColor = a.armor === "plate" ? metal : a.armor === "chain" ? chain : a.armor === "brigandine" ? brig : a.armor === "leather" ? leather : a.armor === "gambeson" ? 0x8f8468 : shirt
  const armArmored = a.armor === "plate" || a.armored
  const legArmored = a.armor === "plate" || a.armored

  // Torso
  parts.push({ bone: boneIndex("hips"), size: [0.3 * bulk, 0.2, 0.2 * bulk], offset: [0, -0.02, 0], color: pants })
  parts.push({ bone: boneIndex("spine"), size: [0.32 * bulk, 0.22, 0.2 * bulk], offset: [0, 0.1, 0], color: torsoColor })
  parts.push({ bone: boneIndex("chest"), size: [0.38 * bulk, 0.3, 0.24 * bulk], offset: [0, 0.14, 0], color: torsoColor })
  if (a.armor === "plate" || a.armor === "brigandine") parts.push({ bone: boneIndex("chest"), size: [0.4 * bulk, 0.2, 0.26 * bulk], offset: [0, 0.16, 0], color: a.armor === "plate" ? metalDark : 0x3a1e1e })
  // Neck + head
  parts.push({ bone: boneIndex("neck"), size: [0.1, 0.1, 0.1], offset: [0, 0.04, 0], color: skin })
  const headSize: [number, number, number] = [0.2, 0.24, 0.22]
  parts.push({ bone: boneIndex("head"), size: headSize, offset: [0, 0.12, 0], color: skin, round: true })
  // Hair / helmet
  if (a.helmet === "none") {
    parts.push({ bone: boneIndex("head"), size: [0.21, 0.1, 0.23], offset: [0, 0.2, -0.01], color: a.undead ? vary(a.hair, rng, 0.4) : a.hair })
  } else if (a.helmet === "hood") {
    parts.push({ bone: boneIndex("head"), size: [0.24, 0.26, 0.24], offset: [0, 0.14, -0.02], color: vary(0x3a3328, rng, 0.2) })
  } else if (a.helmet === "kettle") {
    parts.push({ bone: boneIndex("head"), size: [0.22, 0.12, 0.24], offset: [0, 0.2, 0], color: metal })
    parts.push({ bone: boneIndex("head"), size: [0.34, 0.03, 0.36], offset: [0, 0.16, 0], color: metalDark })
  } else if (a.helmet === "nasal") {
    parts.push({ bone: boneIndex("head"), size: [0.22, 0.16, 0.24], offset: [0, 0.18, 0], color: metal })
    parts.push({ bone: boneIndex("head"), size: [0.03, 0.12, 0.03], offset: [0, 0.08, 0.12], color: metalDark })
  } else if (a.helmet === "bascinet") {
    parts.push({ bone: boneIndex("head"), size: [0.23, 0.27, 0.25], offset: [0, 0.12, 0], color: metal })
    parts.push({ bone: boneIndex("head"), size: [0.2, 0.05, 0.05], offset: [0, 0.12, 0.13], color: 0x111111 })
  } else if (a.helmet === "great") {
    parts.push({ bone: boneIndex("head"), size: [0.26, 0.3, 0.26], offset: [0, 0.13, 0], color: metalDark })
    parts.push({ bone: boneIndex("head"), size: [0.2, 0.03, 0.05], offset: [0, 0.14, 0.13], color: 0x080808 })
  }
  // Arms
  for (const side of ["L", "R"] as const) {
    const up = boneIndex(`upperArm${side}`)
    const fore = boneIndex(`forearm${side}`)
    const hand = boneIndex(`hand${side}`)
    const armW = 0.11 * bulk
    parts.push({ bone: up, size: [armW, 0.28, armW], offset: [0, -0.14, 0], color: armArmored ? metal : torsoColor })
    if (armArmored || a.armor === "brigandine" || a.armor === "chain") parts.push({ bone: up, size: [armW + 0.08, 0.1, armW + 0.08], offset: [0, 0.0, 0], color: armArmored ? metalDark : torsoColor })
    parts.push({ bone: fore, size: [armW * 0.9, 0.26, armW * 0.9], offset: [0, -0.13, 0], color: armArmored ? metal : a.armor === "leather" ? leather : skin })
    parts.push({ bone: hand, size: [0.08 * bulk, 0.1, 0.06], offset: [0, -0.05, 0], color: armArmored ? metalDark : skin, round: true })
  }
  // Legs
  for (const side of ["L", "R"] as const) {
    const thigh = boneIndex(`thigh${side}`)
    const shin = boneIndex(`shin${side}`)
    const foot = boneIndex(`foot${side}`)
    const legW = 0.13 * Math.sqrt(bulk)
    parts.push({ bone: thigh, size: [legW, 0.44, legW], offset: [0, -0.22, 0], color: legArmored ? metal : pants })
    parts.push({ bone: shin, size: [legW * 0.85, 0.44, legW * 0.85], offset: [0, -0.22, 0], color: legArmored ? metalDark : a.armor === "leather" ? leather : pants })
    parts.push({ bone: foot, size: [legW * 0.9, 0.1, 0.26], offset: [0, -0.05, 0.06], color: boots })
  }

  // Build merged geometry
  const geos: THREE.BufferGeometry[] = []
  const color = new THREE.Color()
  const bonePositions = computeBindPositions()
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2], 1, 1, 1)
    const bp = bonePositions[BONE_NAMES[p.bone]]
    g.translate(bp[0] + p.offset[0], bp[1] + p.offset[1], bp[2] + p.offset[2])
    const count = g.attributes.position.count
    const colors = new Float32Array(count * 3)
    const skinIdx = new Uint16Array(count * 4)
    const skinW = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      // Slight per-vertex variation sells the hand-painted look (undead get stronger blotches).
      color.setHex(p.color)
      const v = a.undead ? rng.range(-0.18, 0.18) : rng.range(-0.05, 0.05)
      colors[i * 3] = Math.max(0, color.r + v)
      colors[i * 3 + 1] = Math.max(0, color.g + v)
      colors[i * 3 + 2] = Math.max(0, color.b + v)
      skinIdx[i * 4] = p.bone
      skinW[i * 4] = 1
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    g.setAttribute("skinIndex", new THREE.BufferAttribute(skinIdx, 4))
    g.setAttribute("skinWeight", new THREE.BufferAttribute(skinW, 4))
    geos.push(g)
  }
  const merged = mergeGeometries(geos, false)!
  for (const g of geos) g.dispose()
  merged.computeBoundingSphere()
  if (merged.boundingSphere) merged.boundingSphere.radius *= 1.6

  const material = mat(a.skinTexture ?? (a.undead ? "zombie_skin" : "cloth"), { roughness: 0.85, metalness: a.armor === "plate" ? 0.25 : 0.05 })
  const material2 = material.clone()
  material2.vertexColors = true
  const mesh = new THREE.SkinnedMesh(merged, material2)
  mesh.castShadow = true
  mesh.receiveShadow = false
  mesh.frustumCulled = true

  // Skeleton
  const bones = {} as Record<BoneName, THREE.Bone>
  const list: THREE.Bone[] = []
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone()
    b.name = name
    const j = JOINTS[name]
    b.position.set(j.pos[0], j.pos[1], j.pos[2])
    bones[name] = b
    list.push(b)
  }
  for (const name of BONE_NAMES) {
    const j = JOINTS[name]
    if (j.parent) bones[j.parent].add(bones[name])
  }
  mesh.add(bones.hips)
  bones.hips.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(list))

  const root = new THREE.Group()
  root.add(mesh)
  root.scale.setScalar(a.scale)

  const handR = new THREE.Object3D()
  handR.position.set(0, -0.08, 0.02)
  bones.handR.add(handR)
  const handL = new THREE.Object3D()
  handL.position.set(0, -0.08, 0.02)
  bones.handL.add(handL)
  const back = new THREE.Object3D()
  back.position.set(0, 0.1, -0.16)
  bones.chest.add(back)
  const headTop = new THREE.Object3D()
  headTop.position.set(0, 0.32, 0)
  bones.head.add(headTop)

  return { mesh, root, bones, handR, handL, back, headTop, height: 1.8 * a.scale }
}

function computeBindPositions(): Record<BoneName, [number, number, number]> {
  const out = {} as Record<BoneName, [number, number, number]>
  for (const name of BONE_NAMES) {
    const j = JOINTS[name]
    if (!j.parent) out[name] = [...j.pos]
    else {
      const p = out[j.parent]
      out[name] = [p[0] + j.pos[0], p[1] + j.pos[1], p[2] + j.pos[2]]
    }
  }
  return out
}

export function disposeHumanoid(h: Humanoid): void {
  h.mesh.geometry.dispose()
  ;(h.mesh.material as THREE.Material).dispose()
  h.root.removeFromParent()
}
