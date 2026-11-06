// glTF characters (CC0 Quaternius: Modular Character Outfits, Universal Base Characters, Universal Animation Library).
// A character is an outfit (body, arms, legs, feet) plus a head and optional hair, all bound to one 65-bone skeleton
// and animated with the clips of the animation library. The result implements the Humanoid interface, so player,
// zombies and NPCs work unchanged; the Animator detects `rig` and drives an AnimationMixer instead of the procedural poses.

import * as THREE from "three"
import { mergeFlatParts, type PartClass } from "./mergeParts"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { models } from "./assets"
import { kitProp } from "./kitProps"
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
export const HELMET_MODELS = ["helmets_kit"]

/** Procedural helmet look → helmet model from the CC0 knight pack (Quaternius). */
const HELMETS: Record<string, string> = { kettle: "Helmet1", nasal: "Helmet1", bascinet: "Helmet3", great: "Helmet2" }

/** A helmet model placed on the head socket (scaled to the base character's head). */
const HELMET_METAL: PartClass = {
  material: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.7, roughness: 0.35 }),
  color: (m) => (/gold/i.test(m.name) ? m.color.clone() : m.color.clone().multiplyScalar(1.6)),
}
const helmetTemplates = new Map<string, THREE.Object3D | null>()

function helmet(look: string): THREE.Object3D | null {
  const name = HELMETS[look]
  const src = name ? models.get("helmets_kit")?.scene.getObjectByName(name) : null
  if (!src) return null
  // All parts of a helmet as one metal mesh (the pack gives one mesh per colour)
  let t = helmetTemplates.get(name!)
  if (t === undefined) {
    const holder = new THREE.Group()
    // Same pose as the unmerged path below: the part's own rotation, no offset, no scale
    const copy = src.clone(true)
    copy.position.set(0, 0, 0)
    copy.scale.set(1, 1, 1)
    holder.add(copy)
    t = mergeFlatParts(holder, () => HELMET_METAL)
    helmetTemplates.set(name!, t)
  }
  if (t) {
    const h = t.clone()
    h.scale.setScalar(0.5)
    h.position.set(0, 0.16, 0.01)
    return h
  }
  const h = src.clone(true)
  h.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    const mat = (m.material as THREE.MeshStandardMaterial).clone()
    if (!/gold/i.test(mat.name)) mat.color.multiplyScalar(1.6)
    mat.metalness = 0.7
    mat.roughness = 0.35
    m.material = mat
  })
  h.scale.setScalar(0.5)
  h.position.set(0, 0.16, 0.01)
  return h
}

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

/** SkeletonUtils.clone gives every skinned mesh its own skeleton copy; restore the sharing of the template. */
function shareClonedSkeletons(template: THREE.Object3D, copy: THREE.Object3D): void {
  const src: THREE.Object3D[] = []
  const dst: THREE.Object3D[] = []
  template.traverse((o) => src.push(o))
  copy.traverse((o) => dst.push(o))
  const byTemplate = new Map<string, THREE.Skeleton>()
  for (let i = 0; i < src.length && i < dst.length; i++) {
    const a = src[i] as THREE.SkinnedMesh
    const b = dst[i] as THREE.SkinnedMesh
    if (!a.isSkinnedMesh || !b.isSkinnedMesh) continue
    const shared = byTemplate.get(a.skeleton.uuid)
    if (shared) b.bind(shared, b.bindMatrix)
    else byTemplate.set(a.skeleton.uuid, b.skeleton)
  }
}

/** Bone names and bind matrices: meshes with the same signature can share one Skeleton. */
function skeletonSignature(sk: THREE.Skeleton): string {
  let sig = sk.bones.map((b) => b.name).join(",")
  for (const m of sk.boneInverses) sig += m.elements.map((v) => v.toFixed(4)).join(",")
  return sig
}

/** Rebinds meshes whose skins are identical to one shared Skeleton on the given bones. */
function unifySkeletons(meshes: THREE.SkinnedMesh[], bones: Map<string, THREE.Bone>): void {
  const shared = new Map<string, THREE.Skeleton>()
  for (const m of meshes) {
    const sig = skeletonSignature(m.skeleton)
    let sk = shared.get(sig)
    if (!sk) {
      sk = new THREE.Skeleton(m.skeleton.bones.map((b) => bones.get(b.name) ?? b), m.skeleton.boneInverses.map((x) => x.clone()))
      shared.set(sig, sk)
    }
    m.bind(sk, m.bindMatrix.clone())
  }
}

/** Index of the only bone a skinned mesh depends on, or null when it is weighted to several bones. */
function singleBone(m: THREE.SkinnedMesh): number | null {
  const si = m.geometry.getAttribute("skinIndex")
  const sw = m.geometry.getAttribute("skinWeight")
  if (!si || !sw) return null
  let bone = -1
  for (let v = 0; v < si.count; v++) {
    for (let k = 0; k < 4; k++) {
      if (sw.getComponent(v, k) < 0.01) continue
      const b = si.getComponent(v, k)
      if (bone === -1) bone = b
      else if (b !== bone) return null
    }
  }
  return bone >= 0 ? bone : null
}

/** Plain Float32 attributes (quantised glTF data cannot be transformed or merged in place). */
function floatAttributes(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute
    if (a.array instanceof Float32Array && !a.normalized) continue
    const f = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k)
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize))
  }
  return g
}

/** Merges skinned meshes that share a material into one mesh (fewer draw calls). */
const looseSpheres = new Map<string, THREE.Sphere>()

/** Bind-pose bounding sphere of a skinned geometry, enlarged to cover any pose of the figure. */
function looseSphere(g: THREE.BufferGeometry): THREE.Sphere {
  let s = looseSpheres.get(g.uuid)
  if (!s) {
    if (!g.boundingSphere) g.computeBoundingSphere()
    s = g.boundingSphere!.clone()
    s.radius *= 2
    looseSpheres.set(g.uuid, s)
  }
  return s.clone()
}

function matricesClose(a: THREE.Matrix4, b: THREE.Matrix4, eps = 1e-3): boolean {
  for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > eps) return false
  return true
}

/**
 * Moves skinned meshes whose skeletons agree on the bind pose onto one union skeleton (skin indices remapped on a
 * copy of the geometry). Parts exported with different joint lists then share one bone texture and, with the same
 * material, merge into one draw. Meshes with a different bind pose keep their own skeleton.
 */
function shareOneSkeleton(meshes: THREE.SkinnedMesh[]): void {
  if (meshes.length < 2) return
  const sorted = [...meshes].sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length)
  const bind = sorted[0].bindMatrix
  const bones: THREE.Bone[] = []
  const inverses: THREE.Matrix4[] = []
  const index = new Map<string, number>()
  const members: { mesh: THREE.SkinnedMesh; map: number[] }[] = []
  for (const m of sorted) {
    if (!matricesClose(m.bindMatrix, bind, 1e-4)) continue
    const map: number[] = []
    const added = new Map<string, { bone: THREE.Bone; inverse: THREE.Matrix4; at: number }>()
    let ok = true
    for (let i = 0; i < m.skeleton.bones.length; i++) {
      const bone = m.skeleton.bones[i]
      const inverse = m.skeleton.boneInverses[i]
      const known = index.get(bone.name)
      if (known !== undefined) {
        if (!matricesClose(inverses[known], inverse)) {
          ok = false
          break
        }
        map.push(known)
        continue
      }
      let a = added.get(bone.name)
      if (!a) {
        a = { bone, inverse, at: bones.length + added.size }
        added.set(bone.name, a)
      }
      map.push(a.at)
    }
    if (!ok) continue
    for (const a of added.values()) {
      index.set(a.bone.name, a.at)
      bones[a.at] = a.bone
      inverses[a.at] = a.inverse.clone()
    }
    members.push({ mesh: m, map })
  }
  if (members.length < 2 || members.every((x) => x.mesh.skeleton === members[0].mesh.skeleton)) return
  const skeleton = new THREE.Skeleton(bones, inverses)
  for (const { mesh, map } of members) {
    if (!map.every((j, i) => j === i)) {
      // The geometry may be shared with other templates: remap a copy
      const g = mesh.geometry.clone()
      const si = g.getAttribute("skinIndex") as THREE.BufferAttribute
      const u = new Uint16Array(si.count * 4)
      for (let v = 0; v < si.count; v++) for (let k = 0; k < 4; k++) u[v * 4 + k] = map[si.getComponent(v, k)] ?? 0
      g.setAttribute("skinIndex", new THREE.BufferAttribute(u, 4))
      mesh.geometry = g
    }
    mesh.bind(skeleton, mesh.bindMatrix.clone())
  }
}

function mergeByMaterial(meshes: THREE.SkinnedMesh[], arm: THREE.Object3D): THREE.SkinnedMesh[] {
  shareOneSkeleton(meshes.filter((m) => m.visible))
  // Parts on the same skeleton share skin index order and bind pose, so group by skeleton and material
  const groups = new Map<string, THREE.SkinnedMesh[]>()
  const mats = new Map<string, THREE.Material>()
  for (const m of meshes) {
    if (!m.visible) continue
    const mat = m.material as THREE.Material
    // By name and texture, not by object: the loader makes a second copy of a material for primitives with
    // vertex colours, and those colours are dropped below anyway
    const key = `${m.skeleton.uuid}:${mat.name}:${(mat as THREE.MeshStandardMaterial).map?.uuid ?? mat.uuid}`
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
  // glTF loading gives every mesh its own Skeleton even when they share one skin: share it again
  unifySkeletons(skinned, bones)
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
  // Parts that hang on one bone only (hair, beard, brows, eyes) become plain meshes on that bone; the rest of a
  // part file shares one rebuilt skeleton. Every Skeleton costs a bone texture and a matrix update per frame.
  const rigid = new Map<THREE.Bone, Map<THREE.Material, THREE.BufferGeometry[]>>()
  const rigidMats = new Map<string, THREE.Material>()
  const addPart = (id: string) => {
    const part = models.instantiate(id)
    if (!part) return
    const meshes: THREE.SkinnedMesh[] = []
    part.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
    })
    const skeletons = new Map<string, THREE.Skeleton>()
    for (const m of meshes) {
      m.updateMatrixWorld(true)
      if (!spec.brows && /^eyebrows$/i.test(m.name)) continue
      const single = singleBone(m)
      const target = single !== null ? bones.get(m.skeleton.bones[single].name) : undefined
      if (single !== null && target) {
        // Bake the bind transform: world = boneWorld * boneInverse * bindMatrix * v
        const g = m.geometry.clone()
        for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name)
        floatAttributes(g)
        g.applyMatrix4(m.skeleton.boneInverses[single].clone().multiply(m.bindMatrix))
        // Hair, beard and brows come from different files with their own copy of the same material: one is enough
        const srcMat = m.material as THREE.Material
        const mat = rigidMats.get(srcMat.name) ?? srcMat
        rigidMats.set(srcMat.name, mat)
        const byMat = rigid.get(target) ?? new Map<THREE.Material, THREE.BufferGeometry[]>()
        const list = byMat.get(mat) ?? []
        list.push(g)
        byMat.set(mat, list)
        rigid.set(target, byMat)
        continue
      }
      parent.add(m)
      const sig = skeletonSignature(m.skeleton)
      let sk = skeletons.get(sig)
      if (!sk) {
        sk = new THREE.Skeleton(m.skeleton.bones.map((b) => bones.get(b.name) ?? b), m.skeleton.boneInverses.map((x) => x.clone()))
        skeletons.set(sig, sk)
      }
      m.bind(sk, m.bindMatrix.clone())
      skinned.push(m)
    }
  }
  addPart(spec.female ? "head_female" : "head_male")
  if (spec.hair !== "none") addPart(`hair_${spec.hair}`)
  if (spec.beard && !spec.female) addPart("hair_beard")
  if (spec.brows) addPart(spec.female ? "hair_eyebrows_female" : "hair_eyebrows_regular")
  for (const [bone, byMat] of rigid) {
    for (const [mat, geos] of byMat) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.name = `rigid_${(mat as THREE.Material).name}`
      bone.add(mesh)
      skinned.push(mesh as unknown as THREE.SkinnedMesh)
    }
  }
  mergeByMaterial(skinned.filter((m) => m.parent && (m as THREE.SkinnedMesh).isSkinnedMesh), parent)
  // The outfits carry white vertex colours; merged and baked meshes drop them, and a material that still expects
  // vertex colours then reads black. They add nothing, so switch them off everywhere.
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) mat.vertexColors = false
    if (m.geometry.getAttribute("color")) m.geometry.deleteAttribute("color")
  })

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
/** Boss looks: outfit, hood, beard, cloth and skin colour per boss. */
const BOSS_LOOKS: Partial<Record<string, Partial<CharacterSpec>>> = {
  elder: { outfit: "peasant", hair: "long", beard: true, clothTint: 0x6a8a6a, skinTint: 0xb8b8a0 },
  huntsman: { outfit: "ranger", hood: true, clothTint: 0x9a6a4a, skinTint: 0xa0907a },
  castellan: { outfit: "ranger", pauldrons: true, clothTint: 0x8a8e98, skinTint: 0x9aa090 },
  gravedigger: { outfit: "ranger", hood: true, clothTint: 0x5a5a48, skinTint: 0x8f9a80 },
  abbot: { outfit: "ranger", hood: true, clothTint: 0x5a3a5a, skinTint: 0xb0a8a0 },
  bonelord: { outfit: "ranger", pauldrons: true, clothTint: 0x4a4a4a, skinTint: 0xe8e0c8, hair: "none" },
  queen: { outfit: "ranger", hood: true, female: true, clothTint: 0x9a4a8a, skinTint: 0xc0b0b8 },
  marshal: { outfit: "ranger", pauldrons: true, clothTint: 0x4a5a7a, skinTint: 0x9aa090 },
}

export function specFromAppearance(a: Appearance): CharacterSpec {
  const boss = a.boss !== "none" ? BOSS_LOOKS[a.boss] : undefined
  if (boss) return { ...baseSpec(a), ...boss, brows: false }
  return baseSpec(a)
}

function baseSpec(a: Appearance): CharacterSpec {
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
  shareClonedSkeletons(t.group, body)
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
    if (!m.isMesh) return
    meshes.push(m)
    // Eyes sit inside the head: their shadow costs a draw and shows nothing
    if (/eye/i.test((m.material as THREE.Material).name ?? "")) m.userData.noShadow = true
    m.castShadow = !m.userData.noShadow
    m.receiveShadow = true
    // Skinned parts are culled against a loose sphere around the bind pose that also holds lying and crawling
    // poses (the default sphere would be the bind pose only, and switching culling off drew every enemy behind
    // the camera too)
    if (m.isSkinnedMesh) m.boundingSphere = looseSphere(m.geometry)
    const src = m.material as THREE.MeshStandardMaterial
    let c = seen.get(src)
    if (!c) {
      c = src.clone()
      const isSkin = /regular|superhero/i.test(src.name)
      const isCloth = /peasant|ranger/i.test(src.name)
      if (isSkin) c.color.multiply(new THREE.Color(spec.skinTint))
      if (isCloth) {
        // The outfit ORM map marks buckles and studs as metal; at full metalness the cloth turns black without
        // a bright environment, so the metal parts keep only a part of it
        c.metalness = Math.min(c.metalness, 0.4)
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
  if (a.boss === "marshal" || a.boss === "castellan") {
    const banner = kitProp(a.boss === "marshal" ? "Banner_1" : "Banner_2", 0.55)
    const back = body.getObjectByName("socket_back")
    if (banner && back) {
      banner.position.set(0, -0.6, -0.05)
      back.add(banner)
    }
  }
  if (a.boss === "gravedigger") {
    const scythe = models.instantiate("wpn_scythe", { cloneMaterials: true })
    const hand = body.getObjectByName("socket_handR")
    if (scythe && hand) {
      scythe.rotation.z = Math.PI
      scythe.scale.setScalar(1.3)
      hand.add(scythe)
    }
  }
  const helm = a.helmet !== "none" && a.helmet !== "hood" ? helmet(a.helmet) : null
  if (helm) {
    const head = body.getObjectByName("socket_head")
    head?.add(helm)
    helm.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        meshes.push(m as unknown as THREE.SkinnedMesh)
        // Own copy: the hit flash and the disposal belong to this character (the template is shared)
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        m.material = mat
        mat.emissive = flash
        mat.emissiveIntensity = 0.55
        materials.push(mat)
      }
    })
  }
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

const corpseCache = new Map<string, THREE.Group>()

/**
 * A dead body lying on the ground: a character posed with the last frame of the death animation and baked into
 * static meshes (shared geometry and materials, so the static batcher can merge them). Null while models load.
 */
export function bakedCorpse(seed: number, female: boolean, procedural: () => Humanoid): THREE.Group | null {
  if (!rigReady()) return null
  const variant = `${female ? "f" : "m"}${seed % 3}`
  let tpl = corpseCache.get(variant)
  if (!tpl) {
    const spec = specFromAppearance({ skin: 0xc8a888, shirt: [0x6b5a3a, 0x4a5a6a, 0x7a3a2a][seed % 3], pants: 0x4a3c2a, boots: 0x2a1e14, hair: 0x3a2a1a, armor: "none", helmet: "none", undead: false, scale: 1, bulk: 1, armored: false, seed, boss: "none", female, robe: false })
    spec.skinTint = 0xb8b0a8
    const t = template(spec, procedural)
    const body = skeletonClone(t.group) as THREE.Group
    const death = models.get("anims_ual")?.animations.find((c) => c.name === "Death01")
    if (death) {
      const mixer = new THREE.AnimationMixer(body)
      const a = mixer.clipAction(death)
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
      a.play()
      mixer.update(death.duration)
    }
    body.updateMatrixWorld(true)
    const inv = body.matrixWorld.clone().invert()
    tpl = new THREE.Group()
    const pos = new THREE.Vector3()
    body.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (!m.isSkinnedMesh || !m.visible) return
      const src = m.geometry
      const n = src.getAttribute("position").count
      const out = new Float32Array(n * 3)
      const rel = inv.clone().multiply(m.matrixWorld)
      for (let i = 0; i < n; i++) {
        m.getVertexPosition(i, pos)
        pos.applyMatrix4(rel)
        out[i * 3] = pos.x
        out[i * 3 + 1] = pos.y
        out[i * 3 + 2] = pos.z
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.BufferAttribute(out, 3))
      const uv = src.getAttribute("uv")
      if (uv) {
        const f = new Float32Array(uv.count * 2)
        for (let i = 0; i < uv.count; i++) {
          f[i * 2] = uv.getX(i)
          f[i * 2 + 1] = uv.getY(i)
        }
        g.setAttribute("uv", new THREE.BufferAttribute(f, 2))
      }
      if (src.index) g.setIndex(src.index.clone())
      g.computeVertexNormals()
      const mat = (m.material as THREE.MeshStandardMaterial).clone()
      if (/regular|superhero/i.test(mat.name)) mat.color.multiply(new THREE.Color(0xb8b0a8))
      const mesh = new THREE.Mesh(g, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      tpl!.add(mesh)
    })
    corpseCache.set(variant, tpl)
  }
  return tpl.clone(true)
}
