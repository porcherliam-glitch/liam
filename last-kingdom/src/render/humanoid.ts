// Procedural skinned humanoid: one SkinnedMesh with a 17-bone skeleton. Body parts are capsules, spheres and
// boxes whose vertices are bound rigidly to one bone; cloth and metal parts use two material groups, so a
// whole character costs two draw calls. Appearance is fully parametric (class gear, undead wear, boss looks).

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { Rng } from "../core/rng"
import { mat } from "./materials"
import { buildCharacter, type CharacterRig } from "./rig"

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
export type BossLook = "none" | "elder" | "huntsman" | "castellan" | "gravedigger" | "abbot" | "bonelord" | "queen" | "marshal"

export interface Appearance {
  skin: number
  shirt: number
  pants: number
  boots: number
  hair: number
  armor: ArmorLook
  helmet: HelmetLook
  /** Zombie wear: exposed bone, torn clothes, missing parts. */
  undead: boolean
  /** Overall body scale. */
  scale: number
  /** Chest/arm bulk multiplier (brutes). */
  bulk: number
  /** Knight-style pauldrons and greaves. */
  armored: boolean
  seed: number
  skinTexture?: string
  boss: BossLook
  /** Female silhouette (narrower shoulders, longer hair). */
  female: boolean
  /** Robe / skirt instead of trousers (monks, the queen). */
  robe: boolean
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
  boss: "none",
  female: false,
  robe: false,
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
  /** Material of the cloth/skin group: used for hit flashes. */
  clothMaterial: THREE.MeshStandardMaterial
  metalMaterial: THREE.MeshStandardMaterial
  /** Set for glTF characters: the Animator drives this skeleton with an AnimationMixer. */
  rig?: CharacterRig
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

function lighten(color: number, factor: number): number {
  const c = new THREE.Color(color)
  c.r = Math.min(1, c.r * factor)
  c.g = Math.min(1, c.g * factor)
  c.b = Math.min(1, c.b * factor)
  return c.getHex()
}

function vary(color: number, rng: Rng, amount: number): number {
  const c = new THREE.Color(color)
  const hslv = { h: 0, s: 0, l: 0 }
  c.getHSL(hslv)
  c.setHSL(hslv.h + rng.range(-amount * 0.05, amount * 0.05), Math.max(0, hslv.s + rng.range(-amount, amount) * 0.3), Math.max(0.02, Math.min(0.95, hslv.l + rng.range(-amount, amount) * 0.25)))
  return c.getHex()
}

type PartBone = BoneName | "back"

interface PartSpec {
  geo: THREE.BufferGeometry
  bone: PartBone
  offset: [number, number, number]
  color: number
  metal?: boolean
  /** Euler rotation applied before translation. */
  rot?: [number, number, number]
  /** Vertex colour noise strength. */
  noise?: number
}

const METAL = 0xb4b8c0
const METAL_DARK = 0x6e727a
const LEATHER = 0x5a3e28
const CHAIN = 0x8a8e96
const GOLD = 0xd8a640

export function buildHumanoid(app: Partial<Appearance> = {}, opts: { procedural?: boolean } = {}): Humanoid {
  const a: Appearance = { ...DEFAULT_APPEARANCE, ...app }
  if (!opts.procedural) {
    // Prefer the glTF characters; the procedural body stays as fallback (models missing or failed to load)
    const c = buildCharacter(a, () => buildHumanoid({ ...a, scale: 1, bulk: 1 }, { procedural: true }))
    if (c) return c
  }
  const rng = new Rng(a.seed)
  const bulk = a.bulk
  const shoulder = a.female ? 0.9 : 1
  const skin = a.undead ? vary(a.skin, rng, 0.5) : vary(a.skin, rng, 0.12)
  const shirt = vary(lighten(a.shirt, a.undead ? 1.45 : 1.15), rng, a.undead ? 0.5 : 0.15)
  const pants = vary(lighten(a.pants, a.undead ? 1.45 : 1.15), rng, a.undead ? 0.5 : 0.15)
  const boots = vary(a.boots, rng, 0.2)
  const hair = a.undead ? vary(a.hair, rng, 0.4) : a.hair
  const torsoColor = a.armor === "plate" ? METAL : a.armor === "chain" ? CHAIN : a.armor === "brigandine" ? 0x5c2e2e : a.armor === "leather" ? LEATHER : a.armor === "gambeson" ? 0x8f8468 : shirt
  const torsoMetal = a.armor === "plate" || a.armor === "chain"
  const armArmored = a.armor === "plate" || a.armored
  const legArmored = a.armor === "plate" || a.armored
  const parts: PartSpec[] = []
  const add = (geo: THREE.BufferGeometry, bone: PartBone, offset: [number, number, number], color: number, opts: { metal?: boolean; rot?: [number, number, number]; noise?: number } = {}) => {
    parts.push({ geo, bone, offset, color, metal: opts.metal, rot: opts.rot, noise: opts.noise })
  }
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8)
  const sphere = (r: number, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r, 10, 8)
    g.scale(sx, sy, sz)
    return g
  }
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
  const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg)
  const flatCyl = (rt: number, rb: number, h: number, flat = 0.66) => {
    const g = cyl(rt, rb, h)
    g.scale(1, 1, flat)
    return g
  }
  const missingArmL = a.undead && !a.armored && a.boss === "none" && rng.chance(0.12)
  const missingArmR = a.undead && !a.armored && a.boss === "none" && !missingArmL && rng.chance(0.08)

  // ---- torso ----
  add(flatCyl(0.17 * bulk, 0.165 * bulk, 0.2), "hips", [0, -0.02, 0], a.robe ? torsoColor : pants)
  add(flatCyl(0.17 * bulk, 0.165 * bulk, 0.22), "spine", [0, 0.1, 0], torsoColor, { metal: torsoMetal })
  add(flatCyl(0.215 * bulk * shoulder, 0.17 * bulk, 0.32), "chest", [0, 0.14, 0], torsoColor, { metal: torsoMetal })
  if (a.armor === "plate" || a.armor === "brigandine") add(flatCyl(0.225 * bulk * shoulder, 0.19 * bulk, 0.2, 0.72), "chest", [0, 0.16, 0], a.armor === "plate" ? METAL_DARK : 0x3a1e1e, { metal: a.armor === "plate" })
  // belt
  add(flatCyl(0.175 * bulk, 0.175 * bulk, 0.05, 0.7), "hips", [0, 0.06, 0], a.undead ? 0x2a2018 : 0x3a2a1a)
  if (!a.undead || rng.chance(0.5)) add(box(0.07, 0.07, 0.03), "hips", [0, 0.06, 0.12 * bulk], a.armor === "none" ? 0x8a7a50 : GOLD, { metal: true })
  // exposed ribs / wounds for the undead
  if (a.undead && a.armor !== "plate" && a.armor !== "chain" && rng.chance(0.55)) {
    for (let i = 0; i < 3; i++) add(box(0.26 * bulk, 0.018, 0.03), "chest", [0, 0.06 + i * 0.06, 0.12 * bulk], 0xd8ccb0, { noise: 0.05 })
  }
  // robe skirt
  if (a.robe) add(cyl(0.2 * bulk, 0.3 * bulk, 0.75, 12), "hips", [0, -0.4, 0], torsoColor)

  // ---- neck and head ----
  add(cyl(0.05, 0.06, 0.1, 8), "neck", [0, 0.04, 0], skin)
  const headR = 0.115
  add(sphere(headR, 1, 1.08, 1.02), "head", [0, 0.12, 0], a.boss === "bonelord" ? 0xd8ccb0 : skin)
  // jaw
  add(box(0.13, 0.07, 0.1), "head", [0, 0.03, 0.03], a.boss === "bonelord" ? 0xd8ccb0 : skin)
  if (a.helmet !== "great") {
    // eyes and brows (the undead get glowing eyes attached by the owner)
    const eye = a.undead ? 0x0a0a0a : 0x15100c
    add(sphere(0.018), "head", [-0.045, 0.135, 0.1], eye)
    add(sphere(0.018), "head", [0.045, 0.135, 0.1], eye)
    add(box(0.13, 0.014, 0.02), "head", [0, 0.165, 0.1], a.undead ? 0x2a2018 : hair)
    add(box(0.03, 0.045, 0.03), "head", [0, 0.1, 0.112], skin)
    // mouth
    add(box(0.05, 0.012, 0.01), "head", [0, 0.055, 0.115], a.undead ? 0x3a0a0a : 0x6a3a3a)
  }
  // hair / helmet
  if (a.helmet === "none") {
    if (a.boss !== "bonelord") {
      add(sphere(headR + 0.012, 1, 0.75, 1), "head", [0, 0.17, -0.01], hair)
      if (a.female) add(box(0.2, 0.3, 0.1), "head", [0, 0.02, -0.1], hair)
    }
  } else if (a.helmet === "hood") {
    add(sphere(headR + 0.03, 1, 1.05, 1.02), "head", [0, 0.13, -0.02], vary(0x3a3328, rng, 0.2))
    add(box(0.3, 0.14, 0.3), "chest", [0, 0.24, 0], vary(0x3a3328, rng, 0.2))
  } else if (a.helmet === "kettle") {
    add(sphere(headR + 0.015, 1, 0.8, 1), "head", [0, 0.18, 0], METAL, { metal: true })
    add(cyl(0.2, 0.2, 0.025, 12), "head", [0, 0.15, 0], METAL_DARK, { metal: true })
  } else if (a.helmet === "nasal") {
    add(sphere(headR + 0.015, 1, 1, 1), "head", [0, 0.15, 0], METAL, { metal: true })
    add(box(0.025, 0.12, 0.02), "head", [0, 0.08, 0.125], METAL_DARK, { metal: true })
  } else if (a.helmet === "bascinet") {
    add(sphere(headR + 0.02, 1, 1.12, 1.05), "head", [0, 0.13, 0], METAL, { metal: true })
    add(box(0.2, 0.05, 0.05), "head", [0, 0.12, 0.13], 0x111111)
    add(box(0.22, 0.1, 0.12), "head", [0, 0.06, 0.08], METAL_DARK, { metal: true })
  } else if (a.helmet === "great") {
    add(cyl(0.14, 0.14, 0.3, 10), "head", [0, 0.13, 0], METAL_DARK, { metal: true })
    add(cyl(0.14, 0.14, 0.03, 10), "head", [0, 0.29, 0], METAL, { metal: true })
    add(box(0.2, 0.02, 0.05), "head", [0, 0.15, 0.13], 0x080808)
    add(box(0.02, 0.1, 0.05), "head", [0, 0.09, 0.13], 0x080808)
  }

  // ---- arms ----
  for (const side of ["L", "R"] as const) {
    const missing = side === "L" ? missingArmL : missingArmR
    const up = `upperArm${side}` as BoneName
    const fore = `forearm${side}` as BoneName
    const hand = `hand${side}` as BoneName
    const armR = 0.055 * bulk
    add(capsule(armR, 0.2), up, [0, -0.14, 0], armArmored ? METAL : torsoColor, { metal: armArmored || torsoMetal })
    if (armArmored || a.armor === "brigandine" || a.armor === "chain" || a.boss === "marshal" || a.boss === "castellan") {
      const big = a.boss === "marshal" || a.boss === "castellan"
      add(sphere((big ? 0.14 : 0.1) * bulk, 1, 0.7, 1), up, [0, 0.02, 0], armArmored || big ? METAL_DARK : torsoColor, { metal: armArmored || big })
      if (big) add(box(0.02, 0.18, 0.02), up, [side === "L" ? -0.1 : 0.1, 0.12, 0], GOLD, { metal: true })
    }
    if (missing) {
      add(box(0.06, 0.05, 0.06), up, [0, -0.26, 0], 0x6a1a1a)
      continue
    }
    add(capsule(armR * 0.85, 0.18), fore, [0, -0.13, 0], armArmored ? METAL : a.armor === "leather" ? LEATHER : skin, { metal: armArmored })
    add(sphere(0.045 * bulk, 1.1, 1.25, 0.8), hand, [0, -0.05, 0], armArmored ? METAL_DARK : skin, { metal: armArmored })
  }

  // ---- legs ----
  for (const side of ["L", "R"] as const) {
    const thigh = `thigh${side}` as BoneName
    const shin = `shin${side}` as BoneName
    const foot = `foot${side}` as BoneName
    const legR = 0.075 * Math.sqrt(bulk)
    if (!a.robe) add(capsule(legR, 0.3), thigh, [0, -0.22, 0], legArmored ? METAL : pants, { metal: legArmored })
    add(capsule(legR * 0.85, 0.3), shin, [0, -0.22, 0], legArmored ? METAL_DARK : a.armor === "leather" ? LEATHER : a.robe ? torsoColor : pants, { metal: legArmored })
    if (legArmored) add(sphere(legR * 1.2, 1, 0.8, 1), shin, [0, 0.02, 0.02], METAL, { metal: true })
    add(box(legR * 1.9, 0.1, 0.27), foot, [0, -0.05, 0.06], boots)
  }

  // ---- boss silhouettes ----
  switch (a.boss) {
    case "elder":
      add(cyl(0.08, 0.14, 0.25, 8), "head", [0, 0.34, 0], 0x2a2a2a)
      add(cyl(0.16, 0.16, 0.03, 8), "head", [0, 0.22, 0], 0x2a2a2a)
      break
    case "huntsman":
      for (const s of [-1, 1]) {
        add(cyl(0.01, 0.03, 0.3, 5), "head", [s * 0.09, 0.3, -0.02], 0x8a7a60, { rot: [0, 0, s * 0.5] })
        add(cyl(0.008, 0.02, 0.16, 5), "head", [s * 0.16, 0.36, -0.02], 0x8a7a60, { rot: [0, 0, s * 1.3] })
      }
      break
    case "castellan":
      add(box(0.02, 0.22, 0.06), "head", [0, 0.4, -0.02], 0x8a2a2a)
      add(cyl(0.02, 0.02, 0.4, 5), "head", [0, 0.36, -0.08], 0x8a2a2a, { rot: [0.7, 0, 0] })
      break
    case "gravedigger":
      add(box(0.2, 0.04, 0.2), "chest", [0, 0.26, -0.12], 0x3a3a2a)
      add(cyl(0.02, 0.02, 1.2, 6), "back", [0, 0, 0], 0x6a5a40, { rot: [0, 0, 0.5] })
      break
    case "abbot":
      for (let i = 0; i < 4; i++) add(box(0.06, 0.02, 0.02), "chest", [-0.12 + i * 0.08, 0.1, 0.18], METAL_DARK, { metal: true })
      add(box(0.08, 0.1, 0.02), "chest", [0, 0.0, 0.19], GOLD, { metal: true })
      break
    case "bonelord":
      for (let i = 0; i < 5; i++) add(cyl(0.005, 0.02, 0.1 + (i === 2 ? 0.06 : 0), 4), "head", [-0.08 + i * 0.04, 0.3, 0], 0xd8ccb0)
      add(cyl(0.13, 0.13, 0.04, 8), "head", [0, 0.24, 0], 0xd8ccb0)
      break
    case "queen":
      for (let i = 0; i < 5; i++) add(cyl(0.006, 0.016, 0.1 + (i === 2 ? 0.05 : 0), 4), "head", [-0.08 + i * 0.04, 0.3, 0], GOLD, { metal: true })
      add(cyl(0.125, 0.125, 0.04, 8), "head", [0, 0.24, 0], GOLD, { metal: true })
      add(box(0.26, 0.5, 0.02), "chest", [0, -0.1, -0.16], 0x2a0a2a)
      break
    case "marshal":
      add(cyl(0.015, 0.015, 1.3, 5), "back", [0, 0.4, -0.05], 0x4a3a2a)
      add(box(0.4, 0.6, 0.02), "back", [0.2, 0.7, -0.08], 0x2a2a5a)
      add(box(0.02, 0.24, 0.08), "head", [0, 0.4, -0.02], 0x2a2a5a)
      break
  }

  // ---- build merged geometry with two material groups ----
  const bonePositions = computeBindPositions()
  const color = new THREE.Color()
  const clothGeos: THREE.BufferGeometry[] = []
  const metalGeos: THREE.BufferGeometry[] = []
  for (const p of parts) {
    const g = p.geo
    if (p.rot) {
      g.rotateX(p.rot[0])
      g.rotateY(p.rot[1])
      g.rotateZ(p.rot[2])
    }
    const back = p.bone === "back"
    const boneName: BoneName = p.bone === "back" ? "chest" : p.bone
    const bp = bonePositions[boneName]
    const boneIdx = BONE_NAMES.indexOf(boneName)
    g.translate(bp[0] + p.offset[0], bp[1] + p.offset[1] + (back ? 0.1 : 0), bp[2] + p.offset[2] + (back ? -0.16 : 0))
    const count = g.attributes.position.count
    const colors = new Float32Array(count * 3)
    const skinIdx = new Uint16Array(count * 4)
    const skinW = new Float32Array(count * 4)
    const noise = p.noise ?? (a.undead ? 0.16 : 0.05)
    for (let i = 0; i < count; i++) {
      color.setHex(p.color)
      const v = rng.range(-noise, noise)
      colors[i * 3] = Math.max(0, color.r + v)
      colors[i * 3 + 1] = Math.max(0, color.g + v)
      colors[i * 3 + 2] = Math.max(0, color.b + v)
      skinIdx[i * 4] = boneIdx
      skinW[i * 4] = 1
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    g.setAttribute("skinIndex", new THREE.BufferAttribute(skinIdx, 4))
    g.setAttribute("skinWeight", new THREE.BufferAttribute(skinW, 4))
    if (g.index) {
      const ng = g.toNonIndexed()
      g.dispose()
      ;(p.metal ? metalGeos : clothGeos).push(ng)
    } else (p.metal ? metalGeos : clothGeos).push(g)
  }
  const cloth = mergeGeometries(clothGeos, false)!
  const metal = metalGeos.length ? mergeGeometries(metalGeos, false) : null
  for (const g of [...clothGeos, ...metalGeos]) g.dispose()
  const merged = metal ? mergeGeometries([cloth, metal], true)! : cloth
  if (metal) {
    merged.groups[0].materialIndex = 0
    merged.groups[1].materialIndex = 1
    cloth.dispose()
    metal.dispose()
  } else {
    merged.clearGroups()
    merged.addGroup(0, merged.attributes.position.count, 0)
  }
  merged.computeBoundingSphere()
  if (merged.boundingSphere) merged.boundingSphere.radius *= 1.6

  const clothMaterial = mat(a.skinTexture ?? (a.undead ? "zombie_skin" : "cloth"), { roughness: 0.88, metalness: 0.02 }).clone()
  clothMaterial.vertexColors = true
  const metalMaterial = mat("metal", { roughness: 0.42, metalness: 0.75 }).clone()
  metalMaterial.vertexColors = true
  const mesh = new THREE.SkinnedMesh(merged, [clothMaterial, metalMaterial])
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

  return { mesh, root, bones, handR, handL, back, headTop, height: 1.8 * a.scale, clothMaterial, metalMaterial }
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
  if (h.rig) {
    // Geometry is shared with the template; materials and skeletons (bone textures) belong to this character
    for (const m of h.rig.materials) m.dispose()
    const skeletons = new Set<THREE.Skeleton>()
    for (const m of h.rig.meshes) if ((m as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add(m.skeleton)
    for (const s of skeletons) s.dispose()
    h.root.removeFromParent()
    return
  }
  h.mesh.geometry.dispose()
  h.clothMaterial.dispose()
  h.metalMaterial.dispose()
  h.root.removeFromParent()
}
