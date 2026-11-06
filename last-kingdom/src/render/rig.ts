// glTF characters (CC0 Quaternius: Modular Character Outfits, Universal Base Characters, Universal Animation Library).
// A character is an outfit (body, arms, legs, feet) plus a head and optional hair, all bound to one 65-bone skeleton
// and animated with the clips of the animation library. The result implements the Humanoid interface, so player,
// zombies and NPCs work unchanged; the Animator detects `rig` and drives an AnimationMixer instead of the procedural poses.

import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { models } from "./assets"
import type { Appearance, BoneName, Humanoid } from "./humanoid"
import { Rng } from "../core/rng"

export const OUTFITS = ["outfit_male_peasant", "outfit_female_peasant", "outfit_male_ranger", "outfit_female_ranger"] as const
export const RIG_MODELS = [
  ...OUTFITS,
  "head_male",
  "head_female",
  "hair_beard",
  "hair_buzzed",
  "hair_simpleparted",
  "hair_long",
  "hair_buns",
  "hair_eyebrows_regular",
  "hair_eyebrows_female",
  "anims_ual",
]
export const RIG_TEXTURES = ["tex_peasant_2", "tex_ranger_3"]

/** Procedural bone name → skeleton bone. Limbs are matched by side (procedural "L" bones sit at -X). */
const SIDE_NEG = { upperArm: "upperarm", forearm: "lowerarm", hand: "hand", thigh: "thigh", shin: "calf", foot: "foot" }

export interface CharacterSpec {
  outfit: "peasant" | "ranger"
  female: boolean
  hair: "none" | "beard" | "buzzed" | "simpleparted" | "long" | "buns"
  beard: boolean
  brows: boolean
  hood: boolean
  pauldrons: boolean
  clothVariant: 0 | 1
  skinTint: number
  clothTint: number
  hairColor: number
  scale: number
  bulk: number
  undead: boolean
}

export interface CharacterRig {
  root: THREE.Group
  /** Bones of the glTF skeleton by name (pelvis, spine_01, Head, hand_r …). */
  bones: Map<string, THREE.Bone>
  /** Parent-aligned frames per bone, captured in the reference pose (for additive overlays). */
  align: Map<string, THREE.Quaternion>
  /** Procedural bone name → skeleton bone name. */
  map: Record<BoneName, string>
  materials: THREE.MeshStandardMaterial[]
  /** Ratio of this skeleton's pelvis height to the animation library's (female rigs are smaller). */
  pelvisRatio: number
  meshes: THREE.SkinnedMesh[]
}

export function rigReady(): boolean {
  return models.has("anims_ual") && models.has("outfit_male_peasant") && models.has("head_male")
}

const templates = new Map<string, { group: THREE.Group; sockets: SocketSet; map: Record<BoneName, string>; align: Map<string, THREE.Quaternion>; pelvisRatio: number }>()

interface SocketSet {
  handR: THREE.Object3D
  handL: THREE.Object3D
  back: THREE.Object3D
  headTop: THREE.Object3D
  head: THREE.Object3D
}

function boneMap(root: THREE.Object3D): Map<string, THREE.Bone> {
  const out = new Map<string, THREE.Bone>()
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) out.set(o.name, o as THREE.Bone)
  })
  return out
}

/** Re-targets a skinned mesh from another file of the same rig onto the given bones (by bone name). */
function rebind(mesh: THREE.SkinnedMesh, bones: Map<string, THREE.Bone>): void {
  const src = mesh.skeleton
  const list = src.bones.map((b) => bones.get(b.name) ?? b)
  mesh.bind(new THREE.Skeleton(list, src.boneInverses.map((m) => m.clone())), mesh.bindMatrix.clone())
}

/** Merges skinned meshes that share a material into one mesh (fewer draw calls). */
function mergeByMaterial(meshes: THREE.SkinnedMesh[], arm: THREE.Object3D): THREE.SkinnedMesh[] {
  // Only parts of the same file share skin index order and bind pose, so group by skeleton and material
  const groups = new Map<string, THREE.SkinnedMesh[]>()
  const mats = new Map<string, THREE.Material>()
  for (const m of meshes) {
    if (!m.visible) continue
    const mat = m.material as THREE.Material
    const key = `${m.skeleton.uuid}:${mat.uuid}`
    const list = groups.get(key) ?? []
    list.push(m)
    groups.set(key, list)
    mats.set(key, mat)
  }
  const out: THREE.SkinnedMesh[] = []
  for (const [key, list] of groups) {
    const mat = mats.get(key)!
    if (list.length === 1) {
      out.push(list[0])
      continue
    }
    const geos = list.map((m) => {
      const g = m.geometry.clone()
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", "skinIndex", "skinWeight"].includes(name)) g.deleteAttribute(name)
      // Quantised attributes differ in type between parts; normalise to float so they can be merged
      for (const name of ["position", "normal", "uv", "skinWeight"]) {
        const a = g.getAttribute(name) as THREE.BufferAttribute | undefined
        if (a && !(a.array instanceof Float32Array)) {
          const f = new Float32Array(a.count * a.itemSize)
          for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k)
          g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize))
        }
      }
      const si = g.getAttribute("skinIndex") as THREE.BufferAttribute
      if (!(si.array instanceof Uint16Array)) {
        const u = new Uint16Array(si.count * 4)
        for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) u[i * 4 + k] = si.getComponent(i, k)
        g.setAttribute("skinIndex", new THREE.BufferAttribute(u, 4))
      }
      // Bake the node transform relative to the armature (quantisation may scale the mesh node)
      arm.updateMatrixWorld(true)
      const rel = arm.matrixWorld.clone().invert().multiply(m.matrixWorld)
      g.applyMatrix4(rel)
      return g
    })
    // All parts of one file share the same skeleton order, so skin indices stay valid
    const merged = mergeGeometries(geos, false)
    if (!merged) {
      out.push(...list)
      continue
    }
    const sm = new THREE.SkinnedMesh(merged, mat)
    sm.name = list.map((m) => m.name).join("+")
    arm.add(sm)
    sm.bind(list[0].skeleton, list[0].bindMatrix)
    for (const m of list) m.removeFromParent()
    out.push(sm)
  }
  return out
}

function specKey(s: CharacterSpec): string {
  return [s.outfit, s.female ? "f" : "m", s.hair, s.beard ? 1 : 0, s.brows ? 1 : 0, s.hood ? 1 : 0, s.pauldrons ? 1 : 0].join(":")
}

/** Builds (once) the template for a combination of outfit and head parts. */
function template(spec: CharacterSpec, procedural: () => Humanoid) {
  const key = specKey(spec)
  const hit = templates.get(key)
  if (hit) return hit
  const outfitId = `outfit_${spec.female ? "female" : "male"}_${spec.outfit}`
  const group = models.instantiate(outfitId)!
  group.name = key
  const bones = boneMap(group)
  const skinned: THREE.SkinnedMesh[] = []
  group.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh)
  })
  // Optional parts of the ranger outfit
  for (const m of [...skinned]) {
    const n = m.name.toLowerCase()
    if ((!spec.hood && n.includes("hood")) || (!spec.pauldrons && n.includes("pauldron"))) {
      m.removeFromParent()
      skinned.splice(skinned.indexOf(m), 1)
    }
  }
  // The armature node: multi-material meshes come as groups below it, single ones directly
  let parent: THREE.Object3D = skinned[0].parent!
  while (parent.parent && parent.parent !== group && !(parent as THREE.Object3D & { isBone?: boolean }).isBone && !parent.children.some((c) => (c as THREE.Bone).isBone)) parent = parent.parent
  const addPart = (id: string) => {
    const part = models.instantiate(id)
    if (!part) return
    const meshes: THREE.SkinnedMesh[] = []
    part.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
    })
    for (const m of meshes) {
      // Keep the world placement of the part when moving it next to the outfit meshes
      m.updateMatrixWorld(true)
      parent.add(m)
      rebind(m, bones)
      skinned.push(m)
    }
  }
  addPart(spec.female ? "head_female" : "head_male")
  if (spec.hair !== "none") addPart(`hair_${spec.hair}`)
  if (spec.beard && !spec.female) addPart("hair_beard")
  if (spec.brows) addPart(spec.female ? "hair_eyebrows_female" : "hair_eyebrows_regular")
  // The head file brings eyes and brows as separate meshes; drop brows when not wanted
  if (!spec.brows) for (const m of [...skinned]) if (/^eyebrows$/i.test(m.name)) m.removeFromParent()
  mergeByMaterial(skinned.filter((m) => m.parent), parent)

  // Reference pose: first frame of the idle loop (arms hanging), used to align sockets and overlays
  const anims = models.get("anims_ual")!
  const idle = anims.animations.find((c) => c.name === "Idle_Loop")
  const mixer = new THREE.AnimationMixer(group)
  if (idle) {
    mixer.clipAction(idle).play()
    mixer.update(0)
  }
  group.updateMatrixWorld(true)

  // Map procedural bones onto the skeleton; limbs by side so overlays bend the limb that sits on the same side
  const sideOf = (name: string) => {
    const b = bones.get(name)
    if (!b) return 0
    const p = new THREE.Vector3()
    b.getWorldPosition(p)
    return Math.sign(p.x)
  }
  const negSuffix = sideOf("hand_l") < 0 ? "_l" : "_r"
  const posSuffix = negSuffix === "_l" ? "_r" : "_l"
  const map = {
    hips: "pelvis",
    spine: "spine_01",
    chest: "spine_03",
    neck: "neck_01",
    head: "Head",
  } as Record<BoneName, string>
  for (const [k, v] of Object.entries(SIDE_NEG)) {
    map[(k + "L") as BoneName] = v + negSuffix
    map[(k + "R") as BoneName] = v + posSuffix
  }
  // Parent-aligned frames: rotation that maps the character frame into each parent's local frame
  const rootQ = new THREE.Quaternion()
  group.getWorldQuaternion(rootQ)
  const align = new Map<string, THREE.Quaternion>()
  for (const [, b] of bones) {
    const pq = new THREE.Quaternion()
    if (b.parent) b.parent.getWorldQuaternion(pq)
    // C = rootQ^-1 * parentWorld ; additive local = C^-1 * q * C
    align.set(b.name, rootQ.clone().invert().multiply(pq))
  }

  // Sockets aligned with the procedural rig, so weapons, shields and eyes keep their offsets
  const proc = procedural()
  const procIdle = proc.root
  procIdle.updateMatrixWorld(true)
  const procRootQ = new THREE.Quaternion()
  procIdle.getWorldQuaternion(procRootQ)
  const relQ = (o: THREE.Object3D) => {
    const q = new THREE.Quaternion()
    o.getWorldQuaternion(q)
    return procRootQ.clone().invert().multiply(q)
  }
  const makeSocket = (boneName: string, procObj: THREE.Object3D, offsetRoot: THREE.Vector3) => {
    const bone = bones.get(boneName)!
    const s = new THREE.Object3D()
    const bq = new THREE.Quaternion()
    bone.getWorldQuaternion(bq)
    const desired = rootQ.clone().multiply(relQ(procObj))
    s.quaternion.copy(bq.clone().invert().multiply(desired))
    const wp = new THREE.Vector3()
    bone.getWorldPosition(wp)
    wp.add(offsetRoot.clone().applyQuaternion(rootQ))
    bone.worldToLocal(wp)
    s.position.copy(wp)
    bone.add(s)
    return s
  }
  // The weapon hand is the anatomical right hand
  const weaponHand = "hand_r"
  const offHand = "hand_l"
  const sockets: SocketSet = {
    handR: makeSocket(weaponHand, proc.handR, new THREE.Vector3(0, -0.09, 0.02)),
    handL: makeSocket(offHand, proc.handL, new THREE.Vector3(0, -0.09, 0.02)),
    back: makeSocket("spine_03", proc.back, new THREE.Vector3(0, 0.05, -0.18)),
    head: makeSocket("Head", proc.bones.head, new THREE.Vector3(0, -0.05, 0)),
    headTop: makeSocket("Head", proc.headTop, new THREE.Vector3(0, 0.22, 0)),
  }
  sockets.handR.name = "socket_handR"
  sockets.handL.name = "socket_handL"
  sockets.back.name = "socket_back"
  sockets.head.name = "socket_head"
  sockets.headTop.name = "socket_headTop"
  proc.root.removeFromParent()

  // Pelvis height relative to the animation library skeleton
  const animPelvis = boneMap(anims.scene).get("pelvis")
  const ourPelvis = bones.get("pelvis")
  const pelvisRatio = animPelvis && ourPelvis && animPelvis.position.length() > 0.01 ? ourPelvis.position.length() / animPelvis.position.length() : 1
  mixer.stopAllAction()
  mixer.uncacheRoot(group)

  const t = { group, sockets, map, align, pelvisRatio }
  templates.set(key, t)
  return t
}

/** Chooses outfit, hair and colours from the procedural appearance. */
export function specFromAppearance(a: Appearance): CharacterSpec {
  const rng = new Rng(a.seed * 7 + 3)
  const armoured = a.armored || a.armor === "chain" || a.armor === "brigandine" || a.armor === "plate" || a.armor === "leather" || a.armor === "gambeson"
  const outfit: CharacterSpec["outfit"] = armoured || a.helmet === "hood" ? "ranger" : "peasant"
  const hairOptions: CharacterSpec["hair"][] = a.female ? ["long", "buns", "long", "buzzed"] : ["buzzed", "simpleparted", "none", "simpleparted"]
  const hair = a.helmet !== "none" && a.helmet !== "hood" ? "buzzed" : rng.pick(hairOptions)
  const tint = (c: number, amount: number) => new THREE.Color(0xffffff).lerp(new THREE.Color(c), amount).getHex()
  return {
    outfit,
    female: a.female,
    hair: a.helmet === "hood" ? "none" : hair,
    beard: !a.female && !a.undead && rng.chance(0.4),
    brows: !a.undead,
    hood: a.helmet === "hood",
    pauldrons: a.armored || a.armor === "plate" || a.armor === "brigandine",
    clothVariant: rng.chance(0.5) ? 1 : 0,
    skinTint: a.undead ? rng.pick([0x9cab8a, 0xa5a090, 0x8f9e9a, 0xb0a58a]) : 0xffffff,
    clothTint: a.undead ? tint(a.shirt, 0.45) : tint(a.shirt, 0.25),
    hairColor: a.undead ? new THREE.Color(a.hair).lerp(new THREE.Color(0x8a8a80), 0.45).getHex() : a.hair,
    scale: a.scale,
    bulk: a.bulk,
    undead: a.undead,
  }
}

const sharedTextures = new Map<string, THREE.Texture>()
function variantTexture(id: string, like: THREE.Texture | null): THREE.Texture | null {
  let t = sharedTextures.get(id)
  if (!t) {
    const url = models.textureUrl(id)
    if (!url) return null
    t = new THREE.TextureLoader().load(url)
    t.colorSpace = THREE.SRGBColorSpace
    t.flipY = like?.flipY ?? false
    sharedTextures.set(id, t)
  }
  return t
}

/** Builds a glTF character for the appearance; returns null if the models are not loaded. */
export function buildCharacter(a: Appearance, procedural: () => Humanoid): Humanoid | null {
  if (!rigReady()) return null
  const spec = specFromAppearance(a)
  const t = template(spec, procedural)
  const root = new THREE.Group()
  const body = skeletonClone(t.group) as THREE.Group
  root.add(body)
  // Bulky bodies are mostly bigger, only a little wider (non-uniform scale on a posed skeleton shears the limbs)
  const big = spec.scale * (1 + (spec.bulk - 1) * 0.55)
  const wide = 1 + (spec.bulk - 1) * 0.2
  root.scale.set(big * wide, big, big * wide)
  const bones = boneMap(body)
  // Per-instance materials so tints and hit flashes stay local; all share one emissive colour object
  const flash = new THREE.Color(0x000000)
  const materials: THREE.MeshStandardMaterial[] = []
  const seen = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  const meshes: THREE.SkinnedMesh[] = []
  body.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh) return
    meshes.push(m)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    const src = m.material as THREE.MeshStandardMaterial
    let c = seen.get(src)
    if (!c) {
      c = src.clone()
      const isSkin = /regular|superhero/i.test(src.name)
      const isCloth = /peasant|ranger/i.test(src.name)
      if (isSkin) c.color.multiply(new THREE.Color(spec.skinTint))
      if (isCloth) {
        c.color.multiply(new THREE.Color(spec.clothTint))
        if (spec.clothVariant === 1) {
          const v = variantTexture(spec.outfit === "peasant" ? "tex_peasant_2" : "tex_ranger_3", c.map)
          if (v) c.map = v
        }
      }
      if (/hair/i.test(src.name)) {
        // Hair cards: cut out by the texture alpha and coloured (the texture itself is grey)
        c.alphaTest = 0.4
        c.transparent = false
        c.color.set(new THREE.Color(spec.hairColor).multiplyScalar(1.8))
      }
      if (spec.undead) c.roughness = Math.min(1, c.roughness * 1.1)
      c.emissive = flash
      c.emissiveIntensity = 0.55
      seen.set(src, c)
      materials.push(c)
    }
    m.material = c
  })
  const cloth = materials.find((m) => /peasant|ranger/i.test(m.name)) ?? materials[0]
  const socket = (name: string) => body.getObjectByName(name) ?? body
  const procBones = {} as Record<BoneName, THREE.Bone>
  for (const [k, v] of Object.entries(t.map)) procBones[k as BoneName] = (bones.get(v) ?? bones.get("pelvis")) as THREE.Bone
  // The head "bone" handed to gameplay code is the aligned socket, so offsets authored for the procedural head still fit
  procBones.head = socket("socket_head") as unknown as THREE.Bone
  const rig: CharacterRig = { root: body, bones, align: t.align, map: t.map, materials, pelvisRatio: t.pelvisRatio, meshes }
  return {
    mesh: meshes[0],
    root,
    bones: procBones,
    handR: socket("socket_handR"),
    handL: socket("socket_handL"),
    back: socket("socket_back"),
    headTop: socket("socket_headTop"),
    height: 1.8 * spec.scale,
    clothMaterial: cloth,
    metalMaterial: cloth,
    rig,
  }
}
