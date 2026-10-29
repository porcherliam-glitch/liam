/**
 * loot.ts — what containers, bodies and supply drops hold (seeded, pure roll functions, unit-tested) and how
 * containers look (one InstancedMesh per container kind and part, so hundreds of containers cost a few draw calls).
 */
import * as THREE from "three"
import { Bag, type BagSlot } from "./bag"
import type { InfectedKind } from "./infectedData"
import { ITEMS, weaponItem, type ItemId } from "./items"
import type { EnemyKind } from "./types"
import { ENEMY_DROPS, ENEMIES } from "./data"
import type { ContainerKind, LootCategory, LootSpot } from "./zone"

export type Rng = () => number
type Entry = [ItemId, number, [number, number]] // item, weight, quantity range

const TABLES: Record<LootCategory, Entry[]> = {
  civil: [["canned", 8, [1, 2]], ["water", 8, [1, 2]], ["soda", 5, [1, 2]], ["bandage", 6, [1, 3]], ["painkiller", 3, [1, 2]], ["cloth", 7, [2, 5]], ["scrap", 6, [2, 5]], ["wood", 4, [2, 4]], ["watch", 3, [1, 1]], ["gold", 2, [1, 1]], ["ammo_9mm", 5, [8, 24]], ["ammo_12buck", 3, [4, 10]], ["ammo_44", 1, [4, 10]], ["key_tunnel", 0.4, [1, 1]], ["molotov", 1, [1, 1]]],
  food: [["canned", 10, [1, 3]], ["mre", 4, [1, 2]], ["water", 10, [1, 2]], ["soda", 5, [1, 2]], ["cloth", 3, [1, 3]], ["wood", 3, [2, 4]]],
  medical: [["bandage", 10, [1, 3]], ["medkit", 5, [1, 1]], ["painkiller", 5, [1, 2]], ["antiviral", 3, [1, 1]], ["stim", 2, [1, 1]], ["medical", 4, [1, 2]], ["chem", 3, [1, 2]]],
  industrial: [["scrap", 10, [3, 7]], ["parts", 6, [1, 2]], ["tools", 2, [1, 1]], ["fuel", 2, [1, 1]], ["chem", 4, [1, 2]], ["wood", 5, [2, 5]], ["electronics", 1.5, [1, 1]], ["ammo_556", 3, [10, 30]], ["cloth", 3, [2, 4]]],
  military: [["ammo_556", 9, [20, 45]], ["ammo_762", 7, [15, 35]], ["ammo_9mm", 6, [20, 40]], ["ammo_12buck", 4, [8, 16]], ["ammo_12slug", 2, [6, 12]], ["grenade", 4, [1, 2]], ["armor", 2, [1, 1]], ["helmet", 2, [1, 1]], ["intel", 3, [1, 1]], ["mre", 3, [1, 1]], ["medkit", 3, [1, 1]], ["att_reddot", 1, [1, 1]], ["att_vgrip", 1, [1, 1]], ["att_comp", 1, [1, 1]], ["dogtag", 2, [1, 3]]],
  tech: [["electronics", 8, [1, 2]], ["parts", 6, [1, 2]], ["intel", 5, [1, 1]], ["tools", 3, [1, 1]], ["att_reddot", 1.5, [1, 1]], ["att_laser", 1.5, [1, 1]], ["att_holo", 0.8, [1, 1]], ["chem", 3, [1, 2]]],
  lab: [["sample", 5, [1, 1]], ["chem", 7, [1, 3]], ["medical", 6, [1, 2]], ["antiviral", 5, [1, 1]], ["electronics", 4, [1, 1]], ["stim", 3, [1, 1]], ["intel", 3, [1, 1]], ["relic", 0.7, [1, 1]], ["keycard_lab", 0.4, [1, 1]]],
}
/** Extra entries unlocked on tier 2 spots. */
const TIER2: Partial<Record<LootCategory, Entry[]>> = {
  military: [["ammo_556ap", 3, [15, 30]], ["ammo_762ap", 2, [10, 25]], ["plate", 1.2, [1, 1]], ["att_scope4x", 0.6, [1, 1]], ["att_suppressor", 0.7, [1, 1]], ["att_extmag", 1, [1, 1]], ["ammo_338", 1, [5, 10]], ["stim", 2, [1, 1]]],
  tech: [["att_scope4x", 0.6, [1, 1]], ["relic", 0.6, [1, 1]], ["electronics", 3, [1, 2]]],
  lab: [["relic", 1.5, [1, 1]], ["keycard_lab", 0.6, [1, 1]], ["sample", 3, [1, 2]]],
  civil: [["gold", 3, [1, 2]], ["watch", 3, [1, 2]], ["pack_small", 0.8, [1, 1]]],
  industrial: [["tools", 3, [1, 1]], ["fuel", 2, [1, 1]], ["pack_large", 0.4, [1, 1]]],
}
/** Container kinds force a theme on top of the spot category. */
const KIND_CATEGORY: Partial<Record<ContainerKind, LootCategory>> = { fridge: "food", medcab: "medical", toolbox: "industrial", weaponcase: "military" }
const KIND_SLOTS: Record<ContainerKind, number> = { crate: 8, cabinet: 6, fridge: 6, toolbox: 4, weaponcase: 4, medcab: 5, safe: 4, duffel: 8 }
const KIND_ROLLS: Record<ContainerKind, [number, number]> = { crate: [2, 4], cabinet: [1, 3], fridge: [1, 3], toolbox: [1, 3], weaponcase: [1, 2], medcab: [2, 3], safe: [1, 3], duffel: [2, 4] }
export const CONTAINER_NAMES: Record<ContainerKind, string> = { crate: "Versorgungskiste", cabinet: "Spind", fridge: "Kühlschrank", toolbox: "Werkzeugkasten", weaponcase: "Waffenkoffer", medcab: "Medizinschrank", safe: "Tresor", duffel: "Tasche" }
export const SEARCH_TIME: Record<ContainerKind, number> = { crate: 1.1, cabinet: 0.9, fridge: 0.7, toolbox: 0.8, weaponcase: 1.2, medcab: 0.9, safe: 2.2, duffel: 0.8 }

function pick(entries: Entry[], rng: Rng): Entry {
  let total = 0; for (const e of entries) total += e[1]
  let r = rng() * total
  for (const e of entries) { r -= e[1]; if (r <= 0) return e }
  return entries[entries.length - 1]
}
const qty = (range: [number, number], rng: Rng, tier: number) => Math.round(range[0] + rng() * (range[1] - range[0]) * (1 + tier * 0.3))

/** Contents of a container; bonus = extra rolls (research, night). */
export function rollContainer(spot: Pick<LootSpot, "category" | "tier" | "container">, rng: Rng, bonus = 0): BagSlot[] {
  const kind = spot.container, cat = KIND_CATEGORY[kind] ?? spot.category, tier = spot.tier
  const bag = new Bag(KIND_SLOTS[kind])
  const table = [...TABLES[cat], ...(tier >= 2 ? TIER2[cat] ?? [] : [])]
  const [lo, hi] = KIND_ROLLS[kind]
  const rolls = lo + Math.floor(rng() * (hi - lo + 1)) + (tier >= 1 && rng() < 0.5 ? 1 : 0) + bonus
  if (kind === "safe") { bag.add(rng() < 0.5 ? "gold" : "watch", 1 + Math.floor(rng() * 2)); if (rng() < 0.4) bag.add("intel", 1) }
  if (kind === "weaponcase" && rng() < 0.35 + tier * 0.2) {
    const pool: ItemId[] = tier >= 2 ? ["w_br10", "w_sr74", "w_dr7", "w_sg8", "w_k5", "w_lm60"] : tier === 1 ? ["w_mk4", "w_vx9", "w_kv12", "w_r44", "w_sr74"] : ["w_p9", "w_mk4", "w_kv12", "w_vx9"]
    bag.add(pool[Math.floor(rng() * pool.length)], 1)
  }
  for (let i = 0; i < rolls; i++) { const e = pick(table, rng); bag.add(e[0], Math.max(1, qty(e[2], rng, tier))) }
  return bag.toJSON()
}

/** What a fallen mercenary carries. */
export function rollMercBody(kind: EnemyKind, danger: number, rng: Rng): BagSlot[] {
  const bag = new Bag(10), weapon = ENEMIES[kind].weapon
  const ammoByWeapon: Record<string, ItemId> = { rifle: rng() < 0.5 ? "ammo_556" : "ammo_762", smg: "ammo_9mm", shotgun: "ammo_12buck", sniper: "ammo_762" }
  bag.add(ammoByWeapon[weapon], 10 + Math.floor(rng() * 30))
  bag.add("dogtag", 1)
  if (rng() < 0.35 + danger * 0.08) { const pool = ENEMY_DROPS[weapon]; bag.add(weaponItem(pool[Math.floor(rng() * pool.length)]), 1) }
  if (rng() < 0.3) bag.add(rng() < 0.6 ? "bandage" : "medkit", 1)
  if (rng() < 0.25) bag.add(rng() < 0.5 ? "mre" : "water", 1)
  if (rng() < 0.15 + danger * 0.05) bag.add("grenade", 1)
  if (kind === "heavy" && rng() < 0.4) bag.add("armor", 1)
  if (rng() < 0.12 * danger) bag.add(rng() < 0.5 ? "intel" : "electronics", 1)
  if (rng() < 0.06) bag.add((["att_reddot", "att_vgrip", "att_comp", "att_laser"] as ItemId[])[Math.floor(rng() * 4)], 1)
  return bag.toJSON()
}

/** What an infected body may hold (mostly nothing; the boss drops the lab treasures). */
export function rollInfectedBody(kind: InfectedKind, rng: Rng): BagSlot[] {
  const bag = new Bag(6)
  if (kind === "boss") { bag.add("relic", 1); bag.add("sample", 2); bag.add("keycard_lab", 1); bag.add("electronics", 2); return bag.toJSON() }
  if (kind === "brute" && rng() < 0.6) bag.add("sample", 1)
  if (rng() < 0.18) bag.add((["watch", "gold", "cloth", "scrap", "painkiller", "bandage", "ammo_9mm"] as ItemId[])[Math.floor(rng() * 7)], 1 + Math.floor(rng() * 2))
  if (rng() < 0.04) bag.add("key_tunnel", 1)
  return bag.toJSON()
}

/** A supply drop: rare military and medical gear. */
export function rollAirdrop(rng: Rng): BagSlot[] {
  const bag = new Bag(10)
  for (const e of [["ammo_556ap", 60], ["ammo_762ap", 40], ["stim", 2], ["medkit", 2], ["grenade", 2], ["mre", 2]] as [ItemId, number][]) if (rng() < 0.7) bag.add(e[0], e[1])
  const atts: ItemId[] = ["att_suppressor", "att_scope4x", "att_holo", "att_extmag"]
  bag.add(atts[Math.floor(rng() * atts.length)], 1)
  if (rng() < 0.5) bag.add("plate", 1)
  if (rng() < 0.35) bag.add((["w_br10", "w_lm60", "w_falke", "w_sg8"] as ItemId[])[Math.floor(rng() * 4)], 1)
  return bag.toJSON()
}

export function slotsFor(kind: ContainerKind): number { return KIND_SLOTS[kind] }
export function bagValue(items: BagSlot[]): number { return items.reduce((s, x) => s + ITEMS[x.id].value * x.qty, 0) }

// ───────────────────────────── container visuals ─────────────────────────────

interface KindParts { body: THREE.BufferGeometry; lid: THREE.BufferGeometry; bodyMat: THREE.Material; lidMat: THREE.Material; size: [number, number, number]; lidPivot: [number, number, number]; openAxis: "x" | "y"; openAngle: number }

function kindParts(): Record<ContainerKind, KindParts> {
  const m = (color: number, roughness = 0.7, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
  const box = (w: number, h: number, d: number, y = h / 2, z = 0) => new THREE.BoxGeometry(w, h, d).translate(0, y, z)
  return {
    crate: { body: box(1.25, 0.6, 0.85), lid: box(1.28, 0.1, 0.88, 0.05, 0.44), bodyMat: m(0x3c5244), lidMat: m(0x2f4136, 0.6, 0.3), size: [1.25, 0.6, 0.85], lidPivot: [0, 0.6, -0.44], openAxis: "x", openAngle: -1.9 },
    cabinet: { body: box(0.8, 1.9, 0.5), lid: box(0.78, 1.84, 0.04, 0.92, 0), bodyMat: m(0x5b6670, 0.5, 0.6), lidMat: m(0x6c7882, 0.45, 0.6), size: [0.8, 1.9, 0.5], lidPivot: [-0.39, 0.03, 0.27], openAxis: "y", openAngle: -1.6 },
    fridge: { body: box(0.75, 1.8, 0.7), lid: box(0.74, 1.76, 0.05, 0.88, 0), bodyMat: m(0xd8d8d0, 0.4, 0.1), lidMat: m(0xe6e6de, 0.35, 0.1), size: [0.75, 1.8, 0.7], lidPivot: [-0.37, 0.02, 0.37], openAxis: "y", openAngle: -1.7 },
    toolbox: { body: box(0.6, 0.3, 0.3), lid: box(0.62, 0.06, 0.32, 0.03, 0.15), bodyMat: m(0xa8322c, 0.5, 0.4), lidMat: m(0x8a2a24, 0.5, 0.4), size: [0.6, 0.3, 0.3], lidPivot: [0, 0.3, -0.15], openAxis: "x", openAngle: -2.1 },
    weaponcase: { body: box(1.3, 0.22, 0.45), lid: box(1.32, 0.12, 0.47, 0.06, 0.22), bodyMat: m(0x22262a, 0.6, 0.3), lidMat: m(0x2b3035, 0.55, 0.3), size: [1.3, 0.22, 0.45], lidPivot: [0, 0.22, -0.22], openAxis: "x", openAngle: -1.8 },
    medcab: { body: box(0.7, 0.8, 0.3, 1.4), lid: box(0.68, 0.76, 0.03, 0.38, 0), bodyMat: m(0xe3e6e3, 0.4, 0.2), lidMat: m(0xc9332f, 0.5, 0.1), size: [0.7, 0.8, 0.3], lidPivot: [-0.34, 1.02, 0.16], openAxis: "y", openAngle: -1.8 },
    safe: { body: box(0.7, 0.8, 0.65), lid: box(0.62, 0.72, 0.05, 0.36, 0), bodyMat: m(0x33383c, 0.35, 0.8), lidMat: m(0x40464b, 0.3, 0.8), size: [0.7, 0.8, 0.65], lidPivot: [-0.31, 0.04, 0.34], openAxis: "y", openAngle: -1.4 },
    duffel: { body: new THREE.CapsuleGeometry(0.22, 0.6, 4, 8).rotateZ(Math.PI / 2).translate(0, 0.22, 0), lid: box(0.3, 0.02, 0.3, 0.44), bodyMat: m(0x3f4a35, 0.95, 0), lidMat: m(0x2c3326, 0.9, 0), size: [1.05, 0.44, 0.44], lidPivot: [0, 0, 0], openAxis: "x", openAngle: 0 },
  }
}

export interface ContainerRef { index: number; kind: ContainerKind; position: THREE.Vector3; yaw: number; searched: boolean; opened: boolean; items: BagSlot[]; name: string; tier: number }

/** All containers of a raid, drawn with instancing. */
export class ContainerField {
  readonly group = new THREE.Group()
  readonly list: ContainerRef[] = []
  private parts = kindParts()
  private meshes = new Map<ContainerKind, { body: THREE.InstancedMesh; lid: THREE.InstancedMesh; refs: ContainerRef[] }>()
  private openAnim = new Map<ContainerRef, number>()

  constructor(parent: THREE.Object3D, spots: { spot: LootSpot; items: BagSlot[] }[]) {
    const byKind = new Map<ContainerKind, { spot: LootSpot; items: BagSlot[] }[]>()
    for (const s of spots) { const k = s.spot.container; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k)!.push(s) }
    for (const [kind, list] of byKind) {
      const p = this.parts[kind]
      const body = new THREE.InstancedMesh(p.body, p.bodyMat, list.length), lid = new THREE.InstancedMesh(p.lid, p.lidMat, list.length)
      body.castShadow = body.receiveShadow = lid.castShadow = true
      const refs: ContainerRef[] = []
      list.forEach(({ spot, items }, i) => {
        const ref: ContainerRef = { index: i, kind, position: new THREE.Vector3(spot.x, spot.y ?? 0, spot.z), yaw: spot.yaw ?? 0, searched: false, opened: false, items, name: CONTAINER_NAMES[kind], tier: spot.tier }
        refs.push(ref); this.list.push(ref)
        body.setMatrixAt(i, _m.compose(ref.position, _q.setFromAxisAngle(_yAxis, ref.yaw), _one))
        this.writeLid(lid, ref, 0)
      })
      body.instanceMatrix.needsUpdate = lid.instanceMatrix.needsUpdate = true
      body.computeBoundingSphere(); lid.computeBoundingSphere()
      this.group.add(body, lid)
      this.meshes.set(kind, { body, lid, refs })
    }
    parent.add(this.group)
  }

  private writeLid(lid: THREE.InstancedMesh, ref: ContainerRef, open: number): void {
    const p = this.parts[ref.kind]
    _q.setFromAxisAngle(_yAxis, ref.yaw)
    _v.set(p.lidPivot[0], p.lidPivot[1], p.lidPivot[2]).applyQuaternion(_q).add(ref.position)
    _q2.setFromAxisAngle(p.openAxis === "x" ? _xAxis : _yAxis, p.openAngle * open)
    _q.multiply(_q2)
    lid.setMatrixAt(ref.index, _m.compose(_v, _q, _one))
  }

  /** Marks as opened (lid/door animates open). */
  open(ref: ContainerRef): void { if (!ref.opened) { ref.opened = true; this.openAnim.set(ref, 0) } }

  update(dt: number): void {
    for (const [ref, t] of this.openAnim) {
      const k = Math.min(1, t + dt * 3)
      const m = this.meshes.get(ref.kind)!
      this.writeLid(m.lid, ref, 1 - (1 - k) ** 3)
      m.lid.instanceMatrix.needsUpdate = true
      if (k >= 1) this.openAnim.delete(ref); else this.openAnim.set(ref, k)
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group)
    for (const m of this.meshes.values()) { m.body.dispose(); m.lid.dispose() }
    for (const p of Object.values(this.parts)) { p.body.dispose(); p.lid.dispose(); p.bodyMat.dispose(); p.lidMat.dispose() }
  }
}

/** Items lying in the world: dropped bags, bodies, supply drops (bodies have no mesh — the corpse is visible). */
export interface GroundLoot { position: THREE.Vector3; items: BagSlot[]; name: string; kind: "body" | "bag" | "airdrop"; searched: boolean; mesh: THREE.Object3D | null }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1)
const _xAxis = new THREE.Vector3(1, 0, 0), _yAxis = new THREE.Vector3(0, 1, 0)
