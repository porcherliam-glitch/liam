/**
 * loot.ts — what containers, bodies and supply drops hold (seeded, pure roll functions, unit-tested) and how
 * containers look (one InstancedMesh per container kind and part, so hundreds of containers cost a few draw calls).
 */
import * as THREE from "three"
import { Bag, type BagSlot } from "./bag"
import type { InfectedKind } from "./infectedData"
import { ITEMS, weaponItem, type ItemId } from "./items"
import { propMaterial, Shape } from "./propKit"
import { SURF } from "./surface"
import { decalMaterial, Decals } from "./decals"
import type { EnemyKind } from "./types"
import { ENEMY_DROPS, ENEMIES } from "./data"
import type { ContainerKind, LootCategory, LootSpot } from "./zone"

export type Rng = () => number
type Entry = [ItemId, number, [number, number]] // item, weight, quantity range

const TABLES: Record<LootCategory, Entry[]> = {
  civil: [["canned", 8, [1, 2]], ["water", 8, [1, 2]], ["soda", 5, [1, 2]], ["bandage", 6, [1, 3]], ["painkiller", 3, [1, 2]], ["cloth", 7, [2, 5]], ["scrap", 6, [2, 5]], ["wood", 4, [2, 4]], ["watch", 3, [1, 1]], ["gold", 2, [1, 1]], ["ammo_9mm", 5, [8, 24]], ["ammo_12buck", 3, [4, 10]], ["ammo_44", 1, [4, 10]], ["key_tunnel", 0.4, [1, 1]], ["molotov", 1, [1, 1]], ["w_bat", 0.6, [1, 1]], ["ammo_45", 1, [6, 18]]],
  food: [["canned", 10, [1, 3]], ["mre", 4, [1, 2]], ["water", 10, [1, 2]], ["soda", 5, [1, 2]], ["cloth", 3, [1, 3]], ["wood", 3, [2, 4]]],
  medical: [["bandage", 10, [1, 3]], ["medkit", 5, [1, 1]], ["painkiller", 5, [1, 2]], ["antiviral", 3, [1, 1]], ["stim", 2, [1, 1]], ["medical", 4, [1, 2]], ["chem", 3, [1, 2]]],
  industrial: [["scrap", 10, [3, 7]], ["parts", 6, [1, 2]], ["tools", 2, [1, 1]], ["fuel", 2, [1, 1]], ["chem", 4, [1, 2]], ["wood", 5, [2, 5]], ["electronics", 1.5, [1, 1]], ["ammo_556", 3, [10, 30]], ["cloth", 3, [2, 4]], ["w_crowbar", 0.8, [1, 1]]],
  military: [["ammo_556", 9, [20, 45]], ["ammo_762", 7, [15, 35]], ["ammo_9mm", 6, [20, 40]], ["ammo_12buck", 4, [8, 16]], ["ammo_12slug", 2, [6, 12]], ["grenade", 4, [1, 2]], ["armor", 2, [1, 1]], ["helmet", 2, [1, 1]], ["intel", 3, [1, 1]], ["mre", 3, [1, 1]], ["medkit", 3, [1, 1]], ["att_reddot", 1, [1, 1]], ["att_vgrip", 1, [1, 1]], ["att_comp", 1, [1, 1]], ["att_bipod", 0.6, [1, 1]], ["att_light", 0.8, [1, 1]], ["ammo_45", 3, [15, 30]], ["dogtag", 2, [1, 3]]],
  tech: [["electronics", 8, [1, 2]], ["parts", 6, [1, 2]], ["intel", 5, [1, 1]], ["tools", 3, [1, 1]], ["att_reddot", 1.5, [1, 1]], ["att_laser", 1.5, [1, 1]], ["att_holo", 0.8, [1, 1]], ["att_light", 1, [1, 1]], ["chem", 3, [1, 2]]],
  lab: [["sample", 5, [1, 1]], ["chem", 7, [1, 3]], ["medical", 6, [1, 2]], ["antiviral", 5, [1, 1]], ["electronics", 4, [1, 1]], ["stim", 3, [1, 1]], ["intel", 3, [1, 1]], ["relic", 0.7, [1, 1]], ["keycard_lab", 0.4, [1, 1]]],
}
/** Extra entries unlocked on tier 2 spots. */
const TIER2: Partial<Record<LootCategory, Entry[]>> = {
  military: [["ammo_556ap", 3, [15, 30]], ["ammo_762ap", 2, [10, 25]], ["plate", 1.2, [1, 1]], ["att_scope4x", 0.6, [1, 1]], ["att_suppressor", 0.7, [1, 1]], ["att_extmag", 1, [1, 1]], ["att_acog", 0.5, [1, 1]], ["att_brake", 0.7, [1, 1]], ["att_drum", 0.4, [1, 1]], ["ammo_338", 1, [5, 10]], ["stim", 2, [1, 1]]],
  tech: [["att_scope4x", 0.6, [1, 1]], ["att_acog", 0.6, [1, 1]], ["relic", 0.6, [1, 1]], ["electronics", 3, [1, 2]]],
  lab: [["relic", 1.5, [1, 1]], ["keycard_lab", 0.6, [1, 1]], ["sample", 3, [1, 2]]],
  civil: [["gold", 3, [1, 2]], ["watch", 3, [1, 2]], ["pack_small", 0.8, [1, 1]], ["w_katana", 0.15, [1, 1]]],
  industrial: [["tools", 3, [1, 1]], ["fuel", 2, [1, 1]], ["pack_large", 0.4, [1, 1]], ["w_sledge", 0.35, [1, 1]]],
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
    const pool: ItemId[] = tier >= 2 ? ["w_br10", "w_sr74", "w_dr7", "w_sg8", "w_k5", "w_lm60", "w_v45", "w_stg77", "w_as12", "w_de50"] : tier === 1 ? ["w_mk4", "w_vx9", "w_kv12", "w_r44", "w_sr74", "w_p18", "w_stg77", "w_de50"] : ["w_p9", "w_mk4", "w_kv12", "w_vx9", "w_p18"]
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
  if (rng() < 0.08) { const atts: ItemId[] = ["att_reddot", "att_vgrip", "att_comp", "att_laser", "att_light", "att_bipod", "att_brake"]; bag.add(atts[Math.floor(rng() * atts.length)], 1) }
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
  const atts: ItemId[] = ["att_suppressor", "att_scope4x", "att_holo", "att_extmag", "att_acog", "att_drum", "att_brake"]
  bag.add(atts[Math.floor(rng() * atts.length)], 1)
  if (rng() < 0.5) bag.add("plate", 1)
  if (rng() < 0.35) { const guns: ItemId[] = ["w_br10", "w_lm60", "w_falke", "w_sg8", "w_as12", "w_v45", "w_katana"]; bag.add(guns[Math.floor(rng() * guns.length)], 1) }
  return bag.toJSON()
}

export function slotsFor(kind: ContainerKind): number { return KIND_SLOTS[kind] }
export function bagValue(items: BagSlot[]): number { return items.reduce((s, x) => s + ITEMS[x.id].value * x.qty, 0) }

// ───────────────────────────── container visuals ─────────────────────────────

interface KindParts { body: THREE.BufferGeometry; lid: THREE.BufferGeometry; low: THREE.BufferGeometry; decal: THREE.BufferGeometry | null; lidDecal: THREE.BufferGeometry | null; bodyMat: THREE.Material; lidMat: THREE.Material; size: [number, number, number]; lidPivot: [number, number, number]; openAxis: "x" | "y"; openAngle: number }

/**
 * Detailed container models (front = +Z, origin on the floor). Each body and lid is one merged vertex-coloured
 * geometry, so instancing stays at two draw calls per kind; cabinets, fridges and safes are hollow with contents
 * that show once the door swings open. Lids are modelled in body space and shifted to their hinge pivot.
 */
function kindParts(): Record<ContainerKind, KindParts> {
  for (const c of [0x2d302d, 0x9aa0a4, 0x9a9ea2, 0xb8bcbc, 0x2f322f, 0x8a8a84, 0x3a3f44, 0xa9aeae, 0x1e2020, 0x252b29, 0x6a6e70, 0xa08432, 0xb89a4a]) Shape.types.set(c, SURF.metal)
  for (const c of [0x8a7b58, 0x34362c, 0xd4a020, 0x8a7a5a, 0x2a3022, 0x14160f]) Shape.types.set(c, SURF.fabric)
  for (const c of [0x3a3a3d, 0x151517, 0x1e1e1e, 0x181816]) Shape.types.set(c, SURF.polymer)
  const PI = Math.PI, half = PI / 2
  const out = {} as Record<ContainerKind, KindParts>
  const def = (kind: ContainerKind, body: Shape, lid: Shape, pivot: [number, number, number], size: [number, number, number], openAxis: "x" | "y", openAngle: number, bodyMat: THREE.Material, lidMat: THREE.Material) => {
    out[kind] = { body: body.build(), lid: lid.build(pivot[0], pivot[1], pivot[2]), low: LOW[kind]().build(), decal: DECALS[kind]?.().build() ?? null, lidDecal: LID_DECALS[kind]?.().build(pivot[0], pivot[1], pivot[2]) ?? null, bodyMat, lidMat, size, lidPivot: pivot, openAxis, openAngle }
  }
  // stencilled markings on the bodies (lids and doors stay clean)
  const DECALS: Partial<Record<ContainerKind, () => Decals>> = {
    crate: () => new Decals().add("supply", 0.62, 0.12, 0, 0.34, 0.405, "+z").add("lot", 0.42, 0.052, 0, 0.245, 0.405, "+z")
      .add("up", 0.15, 0.15, 0.605, 0.33, -0.24, "+x").add("up", 0.15, 0.15, -0.605, 0.33, 0.24, "-x").add("fragile", 0.56, 0.1, 0, 0.33, -0.405, "-z"),
    toolbox: () => new Decals().add("tools", 0.3, 0.05, 0.05, 0.16, 0.15, "+z"),
    weaponcase: () => new Decals().add("case", 0.32, 0.045, 0.33, 0.1, 0.2255, "+z").add("serial", 0.3, 0.035, -0.36, 0.1, 0.2255, "+z").add("hazard", 0.36, 0.045, 0, 0.1, -0.2255, "-z"),
    medcab: () => new Decals().add("cross", 0.2, 0.2, 0.35, 1.45, 0, "+x").add("cross", 0.2, 0.2, -0.35, 1.45, 0, "-x"),
    safe: () => new Decals().add("serial", 0.36, 0.045, 0.35, 0.62, 0, "+x"),
    cabinet: () => new Decals().add("serial", 0.3, 0.038, 0.4, 1.72, 0, "+x"),
  }
  // markings on doors and lids, modelled in body space (shifted to the hinge like the lid)
  const LID_DECALS: Partial<Record<ContainerKind, () => Decals>> = {
    crate: () => new Decals().add("fragile", 0.46, 0.08, 0, 0.6825, -0.2, "+y").add("lot", 0.36, 0.045, 0, 0.6825, 0.2, "+y"),
    cabinet: () => new Decals().add("name", 0.12, 0.045, 0, 1.38, 0.287, "+z").add("hazard", 0.3, 0.035, 0, 0.12, 0.284, "+z"),
    fridge: () => new Decals().add("polar", 0.14, 0.04, -0.2, 1.62, 0.402, "+z"),
    safe: () => new Decals().add("tresor", 0.18, 0.034, 0, 0.66, 0.378, "+z"),
    weaponcase: () => new Decals().add("serial", 0.3, 0.04, -0.33, 0.3315, -0.12, "+y"),
  }
  // distant stand-ins (closed silhouette in the main colour, a few dozen triangles)
  const LOW: Record<ContainerKind, () => Shape> = {
    crate: () => new Shape(SURF.wood).box(1.25, 0.66, 0.85, 0, 0.33, 0, 0x48573b).box(1.25, 0.05, 0.75, 0, 0.025, 0, 0x3a3328),
    cabinet: () => new Shape(SURF.metal).box(0.8, 1.92, 0.5, 0, 0.96, 0, 0x5f6a74),
    fridge: () => new Shape(SURF.paint).box(0.75, 1.8, 0.74, 0, 0.9, 0.02, 0xdcdcd4),
    toolbox: () => new Shape(SURF.metal).box(0.62, 0.36, 0.31, 0, 0.18, 0, 0xa02f29),
    weaponcase: () => new Shape(SURF.polymer).box(1.32, 0.32, 0.46, 0, 0.16, 0, 0x262a2e),
    medcab: () => { const l = new Shape(SURF.metal).box(0.7, 0.8, 0.32, 0, 1.4, 0.01, 0xe3e6e3); for (const x of [-0.31, 0.31]) l.box(0.03, 1.0, 0.27, x, 0.5, 0, 0xb8bcbc); return l },
    safe: () => new Shape(SURF.metal).box(0.7, 0.8, 0.72, 0, 0.4, 0.03, 0x3e4945),
    duffel: () => new Shape(SURF.fabric).add(new THREE.CapsuleGeometry(0.22, 0.6, 2, 6).rotateZ(half).scale(1, 0.9, 0.95), 0x3f4a35, 0, 0.2, 0),
  }

  // ── military supply crate: olive wood with skids, bands, steel corners, rope handles, stencil plate, latches
  {
    const OL = 0x4b5a3d, OLD = 0x3b4830, MET = 0x2d302d, WOOD = 0x3a3328, ROPE = 0x8a7b58
    const b = new Shape(SURF.wood)
      .box(1.21, 0.56, 0.81, 0, 0.32, 0, OL, 0.02)
      .box(1.25, 0.05, 0.09, 0, 0.025, 0.3, WOOD).box(1.25, 0.05, 0.09, 0, 0.025, -0.3, WOOD)
    for (const y of [0.15, 0.5]) b.box(1.226, 0.05, 0.826, 0, y, 0, OLD)
    for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) b.box(0.05, 0.56, 0.05, x, 0.32, z, MET)
    for (const x of [-0.62, 0.62]) {
      b.torus(0.075, 0.013, x + Math.sign(x) * 0.012, 0.36, 0, ROPE, PI, 0, half, PI)
      for (const z of [-0.075, 0.075]) b.box(0.03, 0.05, 0.03, x, 0.36, z, MET)
    }
    for (const x of [-0.42, 0.42]) b.box(0.075, 0.07, 0.024, x, 0.55, 0.415, MET, 0.006)
    const l = new Shape(SURF.wood)
      .box(1.25, 0.06, 0.85, 0, 0.63, 0, 0x46553a, 0.018)
      .box(1.04, 0.022, 0.64, 0, 0.67, 0, 0x50603f, 0.006)
      .box(1.04, 0.012, 0.06, 0, 0.684, 0, OLD)
    for (const x of [-0.42, 0.42]) { l.cyl(0.016, 0.016, 0.13, x, 0.6, -0.43, MET, 8, 0, 0, half); l.box(0.065, 0.045, 0.026, x, 0.61, 0.43, MET, 0.005) }
    def("crate", b, l, [0, 0.6, -0.43], [1.25, 0.6, 0.85], "x", -1.9, propMaterial(0.82, 0.12), propMaterial(0.78, 0.14))
  }

  // ── steel locker: hollow shell with shelf, hanger rod and kit inside; louvred door, handle, name card, padlock
  {
    const EX = 0x5b6670, IN = 0x3e464d, DK = 0x2b3035, STEEL = 0x9aa0a4
    const b = new Shape(SURF.metal)
      .box(0.8, 1.9, 0.02, 0, 0.95, -0.24, EX).box(0.02, 1.9, 0.5, -0.39, 0.95, 0, EX).box(0.02, 1.9, 0.5, 0.39, 0.95, 0, EX)
      .box(0.82, 0.03, 0.52, 0, 1.905, 0, EX).box(0.76, 0.02, 0.48, 0, 0.09, 0, IN).box(0.78, 0.08, 0.46, 0, 0.04, -0.01, DK)
      .box(0.76, 0.015, 0.46, 0, 1.55, 0, IN).cyl(0.009, 0.009, 0.74, 0, 1.46, 0, STEEL, 6, 0, 0, half)
      .box(0.36, 0.1, 0.3, -0.12, 0.15, -0.02, 0x4a4434, 0.02).box(0.26, 0.08, 0.26, -0.1, 0.24, -0.03, 0x55513f, 0.02)
      .ball(0.11, 0.13, 1.6, -0.05, 0x46503c, 1, 0.7, 1.1)
      .box(0.3, 0.5, 0.06, 0.12, 1.12, -0.18, 0x3c4433, 0.02)
    const d = new Shape(SURF.metal).box(0.78, 1.84, 0.025, 0, 0.95, 0.27, 0x66727c, 0.008)
    for (let i = 0; i < 5; i++) d.box(0.4, 0.012, 0.014, 0, 1.58 + i * 0.04, 0.283, DK, 0, 0.5)
    for (let i = 0; i < 4; i++) d.box(0.4, 0.012, 0.014, 0, 0.22 + i * 0.04, 0.283, DK, 0, 0.5)
    d.box(0.024, 0.15, 0.03, 0.3, 1.0, 0.293, STEEL, 0.008).box(0.06, 0.22, 0.006, 0.3, 1.0, 0.284, DK)
      .box(0.13, 0.065, 0.004, 0, 1.38, 0.284, 0xd5d0bf)
      .box(0.045, 0.05, 0.022, 0.3, 0.88, 0.3, 0xa08432, 0.006).torus(0.014, 0.0035, 0.3, 0.912, 0.3, 0x9aa0a4, PI)
    for (const y of [0.35, 1.55]) d.cyl(0.012, 0.012, 0.1, -0.385, y, 0.285, STEEL, 8)
    def("cabinet", b, d, [-0.39, 0.03, 0.27], [0.8, 1.9, 0.5], "y", -1.6, propMaterial(0.55, 0.35), propMaterial(0.5, 0.38))
  }

  // ── fridge: white hollow cabinet with glass shelves and food, door with freezer split, handles and door racks
  {
    const WH = 0xdcdcd4, INW = 0xeef0ee, GLS = 0xb4c8cc, GREY = 0xa9aeae
    const b = new Shape(SURF.paint)
      .box(0.75, 1.72, 0.03, 0, 0.92, -0.335, WH).box(0.03, 1.72, 0.7, -0.36, 0.92, 0, WH).box(0.03, 1.72, 0.7, 0.36, 0.92, 0, WH)
      .box(0.75, 0.04, 0.7, 0, 1.78, 0, WH, 0.012).box(0.69, 0.04, 0.66, 0, 0.08, 0, INW).box(0.71, 0.06, 0.62, 0, 0.03, -0.02, 0x3a3c3c)
      .box(0.69, 0.02, 0.64, 0, 1.2, 0, WH)
    for (const y of [0.5, 0.86]) b.box(0.68, 0.012, 0.6, 0, y, 0, GLS)
    b.box(0.6, 0.18, 0.5, 0, 0.19, 0, 0xc8d4d4, 0.02)
    for (let i = 0; i < 4; i++) b.cyl(0.03, 0.03, 0.2, -0.24 + i * 0.075, 0.61, -0.18, [0x3a7a3a, 0xb8462e, 0x2f5d8c, 0xd9c45a][i], 8)
    b.box(0.16, 0.1, 0.12, 0.18, 0.92, -0.12, 0xb0703a, 0.01).box(0.12, 0.08, 0.1, -0.15, 0.91, -0.1, 0x8c2f2a, 0.01)
      .cyl(0.06, 0.06, 0.07, 0.15, 0.55, 0.05, 0x9aa0a0, 10).box(0.2, 0.08, 0.14, -0.15, 1.27, -0.1, 0x5e7e98, 0.01)
    const d = new Shape(SURF.paint)
      .box(0.74, 1.76, 0.06, 0, 0.9, 0.37, 0xe6e6de, 0.022).box(0.745, 0.008, 0.062, 0, 1.2, 0.37, 0x9a9c98)
      .box(0.032, 0.3, 0.03, 0.29, 1.42, 0.42, GREY, 0.01).box(0.032, 0.42, 0.03, 0.29, 0.9, 0.42, GREY, 0.01)
    for (const y of [1.29, 1.55, 0.72, 1.08]) d.box(0.03, 0.02, 0.03, 0.29, y, 0.405, GREY)
    for (const y of [0.42, 0.74, 1.4]) d.box(0.6, 0.07, 0.07, 0, y, 0.305, INW, 0.01)
    for (let i = 0; i < 3; i++) d.cyl(0.026, 0.026, 0.18, -0.18 + i * 0.16, 0.53, 0.305, [0xe8e2c8, 0x2f5d8c, 0xc8a03a][i], 8)
    d.box(0.09, 0.022, 0.004, -0.24, 1.62, 0.401, 0x9a9c98)
    def("fridge", b, d, [-0.37, 0.02, 0.37], [0.75, 1.8, 0.7], "y", -1.7, propMaterial(0.42, 0.08), propMaterial(0.38, 0.08))
  }

  // ── toolbox: red steel box with trim, grooves, latches and tools in the tray; lid with a carrying handle
  {
    const RED = 0xa8322c, RDD = 0x7c2420, MET = 0x9a9ea2, BLK = 0x1e1e1e
    const b = new Shape(SURF.metal)
      .box(0.6, 0.285, 0.3, 0, 0.1575, 0, RED, 0.012).box(0.62, 0.025, 0.32, 0, 0.0125, 0, 0x2a2a2a)
      .box(0.56, 0.01, 0.004, 0, 0.12, 0.151, RDD).box(0.56, 0.01, 0.004, 0, 0.2, 0.151, RDD)
      .box(0.58, 0.004, 0.28, 0, 0.301, 0, 0x2a2626)
      .box(0.3, 0.018, 0.035, -0.08, 0.31, -0.06, MET, 0.005).cyl(0.02, 0.02, 0.026, 0.09, 0.31, -0.06, MET, 8, half)
      .cyl(0.008, 0.008, 0.16, 0.05, 0.31, 0.06, MET, 6, 0, 0, half).cyl(0.016, 0.014, 0.1, -0.08, 0.315, 0.06, 0xd4a62a, 8, 0, 0, half)
    for (const x of [-0.2, 0.2]) b.box(0.05, 0.05, 0.016, x, 0.27, 0.155, MET, 0.004)
    const l = new Shape(SURF.metal)
      .box(0.62, 0.05, 0.31, 0, 0.325, 0, 0x962c26, 0.012).box(0.6, 0.008, 0.29, 0, 0.352, 0, RED)
      .cyl(0.011, 0.011, 0.3, 0, 0.405, 0, BLK, 8, 0, 0, half)
    for (const x of [-0.15, 0.15]) l.box(0.024, 0.06, 0.03, x, 0.375, 0, BLK, 0.006)
    for (const x of [-0.2, 0.2]) l.box(0.045, 0.024, 0.016, x, 0.31, 0.158, MET, 0.004)
    def("toolbox", b, l, [0, 0.3, -0.15], [0.6, 0.3, 0.3], "x", -2.1, propMaterial(0.5, 0.4), propMaterial(0.5, 0.4))
  }

  // ── hard weapon case: polymer shell, feet, rim, four latches, handle; foam with a rifle cut-out; ribbed lid
  {
    const SH = 0x23272b, RIM = 0x1a1d20, LT = 0x3a3f44, FOAM = 0x3a3a3d, CUT = 0x151517
    const b = new Shape(SURF.polymer).box(1.3, 0.2, 0.45, 0, 0.11, 0, SH, 0.022).box(1.31, 0.02, 0.46, 0, 0.205, 0, RIM)
    for (const x of [-0.55, 0.55]) for (const z of [-0.16, 0.16]) b.box(0.08, 0.012, 0.05, x, 0.006, z, RIM)
    for (const x of [-0.5, -0.2, 0.2, 0.5]) b.box(0.06, 0.06, 0.02, x, 0.18, 0.235, LT, 0.006)
    b.torus(0.06, 0.012, 0, 0.1, 0.25, RIM, PI, 0, 0, PI).box(0.03, 0.03, 0.03, -0.06, 0.1, 0.235, RIM).box(0.03, 0.03, 0.03, 0.06, 0.1, 0.235, RIM)
      .box(1.24, 0.004, 0.39, 0, 0.217, 0, FOAM)
      .box(0.58, 0.004, 0.05, -0.02, 0.2195, 0, CUT).box(0.3, 0.004, 0.012, 0.42, 0.2195, 0, CUT).box(0.2, 0.004, 0.09, -0.42, 0.2195, 0.015, CUT)
      .box(0.05, 0.004, 0.12, 0.05, 0.2195, 0.08, CUT).box(0.04, 0.004, 0.08, -0.12, 0.2195, 0.06, CUT)
      .box(0.08, 0.004, 0.12, 0.42, 0.2195, 0.13, CUT).box(0.08, 0.004, 0.12, 0.3, 0.2195, 0.13, CUT)
    const l = new Shape(SURF.polymer).box(1.32, 0.1, 0.46, 0, 0.27, 0, 0x2a2f34, 0.026).box(1.24, 0.012, 0.39, 0, 0.222, 0, FOAM)
    for (const z of [-0.12, 0, 0.12]) l.box(1.18, 0.012, 0.04, 0, 0.324, z, SH, 0.004)
    for (const x of [-0.5, -0.2, 0.2, 0.5]) l.box(0.05, 0.035, 0.022, x, 0.236, 0.236, LT, 0.005)
    l.box(0.26, 0.003, 0.07, 0.35, 0.331, 0.16, 0xc8a43a)
    def("weaponcase", b, l, [0, 0.22, -0.22], [1.3, 0.22, 0.45], "x", -1.8, propMaterial(0.62, 0.15), propMaterial(0.58, 0.15))
  }

  // ── wall medicine cabinet: white shell with a shelf, bottles and boxes; door with a red cross
  {
    const WH = 0xe3e6e3, IN = 0xf2f2ee
    const b = new Shape(SURF.metal)
      .box(0.7, 0.8, 0.02, 0, 1.4, -0.14, WH).box(0.02, 0.8, 0.3, -0.34, 1.4, 0, WH).box(0.02, 0.8, 0.3, 0.34, 1.4, 0, WH)
      .box(0.7, 0.02, 0.3, 0, 1.79, 0, WH).box(0.7, 0.02, 0.3, 0, 1.01, 0, WH).box(0.66, 0.012, 0.26, 0, 1.38, 0, IN)
    // floor stand with a lower shelf, so the cabinet works against a wall and free-standing alike
    for (const x of [-0.31, 0.31]) for (const z of [-0.12, 0.12]) b.box(0.03, 1.0, 0.03, x, 0.5, z, 0xb8bcbc)
    b.box(0.66, 0.02, 0.28, 0, 0.32, 0, WH).box(0.24, 0.16, 0.2, -0.14, 0.41, 0, 0x4a7a9a, 0.01).box(0.12, 0.2, 0.12, 0.18, 0.43, 0, 0xe8e4d8, 0.01)
    for (let i = 0; i < 4; i++) b.cyl(0.025, 0.025, 0.11, -0.24 + i * 0.07, 1.075, -0.03, [0x8a5a2a, 0xe8e8e0, 0x3a6aa0, 0xd8d0b8][i], 8)
    b.box(0.16, 0.1, 0.08, 0.18, 1.07, -0.02, 0xd8dce0, 0.006).box(0.17, 0.012, 0.081, 0.18, 1.07, -0.02, 0xc9332f)
      .box(0.2, 0.14, 0.12, -0.1, 1.46, -0.03, 0xe8e4d8, 0.008).box(0.07, 0.07, 0.003, -0.1, 1.46, 0.031, 0x3a8a4a)
      .cyl(0.035, 0.035, 0.09, 0.18, 1.43, -0.02, 0xd8d0b8, 10)
    const d = new Shape(SURF.metal)
      .box(0.68, 0.76, 0.025, 0, 1.4, 0.16, WH, 0.008).box(0.6, 0.68, 0.004, 0, 1.4, 0.174, 0xd8dcd8)
      .box(0.24, 0.075, 0.004, 0, 1.45, 0.177, 0xc9332f).box(0.075, 0.24, 0.004, 0, 1.45, 0.177, 0xc9332f)
      .box(0.02, 0.06, 0.02, 0.29, 1.4, 0.18, 0x9aa0a4, 0.006)
    def("medcab", b, d, [-0.34, 1.02, 0.16], [0.7, 0.8, 0.3], "y", -1.8, propMaterial(0.42, 0.15), propMaterial(0.4, 0.15))
  }

  // ── safe: thick hollow steel body on feet, shelf with cash and gold; door with dial, spoke handle and hinges
  {
    const ST = 0x3b4642, STL = 0x47534e, CH = 0xb8bcbc, IN = 0x5a5f58
    const b = new Shape(SURF.metal)
      .box(0.7, 0.72, 0.06, 0, 0.42, -0.295, ST).box(0.06, 0.72, 0.65, -0.32, 0.42, 0, ST).box(0.06, 0.72, 0.65, 0.32, 0.42, 0, ST)
      .box(0.7, 0.06, 0.65, 0, 0.79, 0, ST, 0.015).box(0.7, 0.06, 0.65, 0, 0.07, 0, ST)
      .box(0.58, 0.012, 0.52, 0, 0.42, 0, 0x6b5a3a).box(0.58, 0.005, 0.52, 0, 0.103, 0, IN)
      .box(0.12, 0.05, 0.07, -0.12, 0.13, -0.05, 0x5a7a4a).box(0.12, 0.05, 0.07, -0.12, 0.18, -0.06, 0x587648).box(0.12, 0.05, 0.07, 0.02, 0.13, -0.08, 0x5a7a4a)
      .box(0.1, 0.035, 0.05, 0.15, 0.4425, -0.06, 0xc9a43a, 0.006).box(0.1, 0.035, 0.05, 0.15, 0.4775, -0.07, 0xd2ae44, 0.006)
      .box(0.16, 0.1, 0.12, -0.1, 0.48, -0.08, 0x3a2f24, 0.01)
    for (const x of [-0.28, 0.28]) for (const z of [-0.26, 0.26]) b.box(0.07, 0.04, 0.07, x, 0.02, z, 0x1c201e)
    const d = new Shape(SURF.metal)
      .box(0.62, 0.72, 0.075, 0, 0.4, 0.33, STL, 0.015).box(0.5, 0.6, 0.01, 0, 0.4, 0.372, ST, 0.004)
      .cyl(0.05, 0.054, 0.022, 0, 0.51, 0.385, CH, 16, half).cyl(0.018, 0.018, 0.035, 0, 0.51, 0.39, 0x6a6e70, 10, half)
      .box(0.004, 0.012, 0.004, 0, 0.565, 0.38, 0xd8d8d0)
      .cyl(0.022, 0.022, 0.03, 0, 0.29, 0.39, CH, 10, half)
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * PI * 2 + 0.3, ex = Math.cos(a) * 0.075, ey = Math.sin(a) * 0.075
      d.cyl(0.006, 0.006, 0.075, ex / 2, 0.29 + ey / 2, 0.4, CH, 6, 0, 0, a - half).ball(0.012, ex, 0.29 + ey, 0.4, 0x1e2020, 1, 1, 1, 8)
    }
    for (const y of [0.18, 0.62]) d.cyl(0.017, 0.017, 0.13, -0.31, y, 0.35, 0x252b29, 10)
    def("safe", b, d, [-0.31, 0.04, 0.34], [0.7, 0.8, 0.65], "y", -1.4, propMaterial(0.42, 0.45), propMaterial(0.38, 0.5))
  }

  // ── duffel bag: sagging canvas body, end panels, straps, carry handles, side pocket; the zipped top flap opens
  {
    const CAN = 0x3f4a35, DK = 0x2a3022, ZIP = 0x1a1a18
    const body = new THREE.CapsuleGeometry(0.22, 0.6, 5, 14).rotateZ(half).scale(1, 0.9, 0.95)
    const b = new Shape(SURF.fabric).add(body, CAN, 0, 0.2, 0)
    for (const x of [-0.47, 0.47]) b.cyl(0.13, 0.13, 0.02, x, 0.2, 0, DK, 12, 0, 0, half)
    for (const x of [-0.22, 0.22]) b.torus(0.212, 0.011, x, 0.2, 0, DK, PI * 2, 0, half, 0, 16)
    for (const z of [-0.115, 0.115]) b.torus(0.075, 0.012, 0, 0.36, z, DK, PI, -Math.sign(z) * 0.6, 0, 0, 8)
    b.box(0.32, 0.17, 0.07, 0, 0.17, 0.215, 0x46523b, 0.03).box(0.3, 0.008, 0.012, 0, 0.255, 0.25, ZIP)
      .box(0.84, 0.008, 0.014, 0, 0.38, -0.09, ZIP).box(0.84, 0.008, 0.014, 0, 0.38, 0.09, ZIP)
      .box(0.03, 0.012, 0.05, 0.4, 0.385, 0.1, 0x8a8a84)
      .box(0.78, 0.004, 0.15, 0, 0.399, 0, 0x14160f)
    const flap = new THREE.CylinderGeometry(0.226, 0.226, 0.82, 7, 1, true, half - 0.42, 0.84).rotateZ(half).scale(1, 0.92, 0.97)
    const l = new Shape(SURF.fabric).add(flap, 0x44503a, 0, 0.2, 0)
    def("duffel", b, l, [0, 0.39, -0.089], [1.05, 0.44, 0.44], "x", -0.7, propMaterial(0.95, 0), propMaterial(0.93, 0, { side: THREE.DoubleSide }))
  }
  return out
}

export interface ContainerRef { index: number; kind: ContainerKind; position: THREE.Vector3; yaw: number; searched: boolean; opened: boolean; items: BagSlot[]; name: string; tier: number }

// ───────────────────────────── ground props: dropped backpack, supply drop ─────────────────────────────

let _bag: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null
/** A dropped tactical backpack standing on the ground (origin on the floor, front = +Z). */
export function groundBagModel(): THREE.Mesh {
  if (!_bag) {
    const OD = 0x4a5238, OD2 = 0x434a33, DK = 0x2a2c28, STRAP = 0x34362c, BLK = 0x181816, TAN = 0x8a7a5a
    const b = new Shape(SURF.fabric)
      .cyl(0.06, 0.06, 0.4, 0, 0.06, 0.02, TAN, 12, 0, 0, Math.PI / 2)
      .box(0.34, 0.44, 0.2, 0, 0.34, 0, OD, 0.05).box(0.33, 0.07, 0.23, 0, 0.57, 0.01, OD2, 0.03)
      .box(0.26, 0.2, 0.07, 0, 0.25, 0.12, OD2, 0.03).box(0.3, 0.4, 0.03, 0, 0.34, -0.11, DK, 0.012)
      .torus(0.035, 0.007, 0, 0.6, -0.08, STRAP, Math.PI, 0, 0, 0, 8)
    for (const x of [-0.12, 0.12]) b.torus(0.064, 0.008, x, 0.06, 0.02, STRAP, Math.PI * 2, 0, Math.PI / 2, 0, 12)
    for (const x of [-0.09, 0.09]) b.box(0.03, 0.2, 0.012, x, 0.45, 0.108, STRAP).box(0.045, 0.03, 0.016, x, 0.4, 0.114, BLK)
    for (const y of [0.2, 0.25, 0.3]) b.box(0.24, 0.012, 0.006, 0, y, 0.157, STRAP)
    for (const x of [-0.19, 0.19]) b.box(0.06, 0.18, 0.13, x, 0.24, 0, OD2, 0.025)
    for (const x of [-0.08, 0.08]) b.box(0.055, 0.38, 0.025, x, 0.34, -0.135, DK, 0.01)
    _bag = { geo: b.build(), mat: propMaterial(0.92, 0) }
  }
  const m = new THREE.Mesh(_bag.geo, _bag.mat); m.castShadow = true; m.receiveShadow = true
  return m
}

let _drop: { crate: THREE.BufferGeometry; chute: THREE.BufferGeometry; decal: THREE.BufferGeometry | null; crateMat: THREE.Material; chuteMat: THREE.Material } | null = null
/**
 * Supply drop: palletised crate with cargo straps, angle irons, stencils and a beacon (child 0, origin at the crate
 * centre, 0.9 m tall) and the parachute with gores, skirt and rigging (child 1, raised 3.2 m; hidden on landing).
 */
export function airdropModel(): THREE.Group {
  if (!_drop) {
    const OL = 0x4b5a3a, WOOD = 0x6a5638, MET = 0x2f322f, YEL = 0xd4a020
    const c = new Shape(SURF.wood)
    for (const z of [-0.5, 0, 0.5]) c.box(1.2, 0.08, 0.1, 0, -0.41, z, WOOD)
    for (let i = 0; i < 5; i++) c.box(0.18, 0.025, 1.2, -0.48 + i * 0.24, -0.3575, 0, WOOD)
    c.box(1.14, 0.765, 1.14, 0, 0.0375, 0, OL, 0.03).box(1.18, 0.03, 1.18, 0, 0.435, 0, 0x45533a, 0.01)
    for (const x of [-0.57, 0.57]) for (const z of [-0.57, 0.57]) c.box(0.06, 0.78, 0.06, x, 0.045, z, MET)
    c.box(1.2, 0.008, 0.06, 0, 0.454, 0, YEL).box(0.06, 0.008, 1.2, 0, 0.456, 0, YEL)
    for (const s of [-1, 1]) c.box(0.008, 0.8, 0.06, s * 0.575, 0.05, 0, YEL).box(0.06, 0.8, 0.008, 0, 0.05, s * 0.575, YEL)
    c.box(0.03, 0.1, 0.08, 0.585, 0.1, 0, MET, 0.008).box(0.08, 0.1, 0.03, 0, 0.1, 0.585, MET, 0.008)
    c.cyl(0.04, 0.05, 0.08, 0.38, 0.49, 0.38, 0x1a1a1a, 10).ball(0.035, 0.38, 0.55, 0.38, 0xd0281e)
    const p = new Shape(SURF.fabric), R = 2.4, H = 0.7, G = 12
    for (let i = 0; i < G; i++) {
      p.add(new THREE.SphereGeometry(R, 2, 7, i / G * Math.PI * 2, Math.PI * 2 / G, 0.12, Math.PI / 2 - 0.12).scale(1, H, 1), i % 2 ? 0xd8d0b8 : 0x6b7a50)
      const a = (i + 0.5) / G * Math.PI * 2, rx = Math.cos(a) * R, rz = Math.sin(a) * R
      const cx = Math.sign(Math.cos(a)) * 0.32, cz = Math.sign(Math.sin(a)) * 0.32
      p.strut(rx, 0, rz, cx, -1.9, cz, 0.008, 0x3a3a34)
    }
    p.torus(R, 0.03, 0, 0, 0, 0x5a6844, Math.PI * 2, Math.PI / 2, 0, 0, 36)
    p.cyl(R * Math.sin(0.12) + 0.02, R * Math.sin(0.12) + 0.02, 0.03, 0, R * H * Math.cos(0.12), 0, 0x4a4a40, 12, 0, 0, 0, true)
    for (const x of [-1, 1]) for (const z of [-1, 1]) p.strut(x * 0.32, -1.9, z * 0.32, x * 0.52, -2.75, z * 0.52, 0.014, 0x2a2a24)
    const dc = new Decals()
    for (const [face, x, z] of [["+z", 0, 0.571], ["-z", 0, -0.571], ["+x", 0.571, 0], ["-x", -0.571, 0]] as const) {
      const side = face.endsWith("z")
      dc.add(side ? "drop" : "supply", 0.5, 0.1, side ? -0.26 : x, 0.16, side ? z : 0.26, face).add("lot", 0.34, 0.04, side ? -0.26 : x, 0.06, side ? z : 0.26, face)
      dc.add("up", 0.14, 0.14, side ? 0.3 : x, 0.2, side ? z : -0.3, face)
    }
    dc.add("hazard", 0.42, 0.05, 0.3, -0.05, 0.571, "+z").add("cross", 0.24, 0.24, -0.2, 0.452, 0.2, "+y")
    _drop = { crate: c.build(), chute: p.build(), decal: dc.build(), crateMat: propMaterial(0.78, 0.12), chuteMat: propMaterial(0.9, 0, { side: THREE.DoubleSide }) }
  }
  const g = new THREE.Group()
  const crate = new THREE.Mesh(_drop.crate, _drop.crateMat); crate.castShadow = true; crate.receiveShadow = true
  const dm = decalMaterial(); if (_drop.decal && dm) crate.add(new THREE.Mesh(_drop.decal, dm))
  const chute = new THREE.Mesh(_drop.chute, _drop.chuteMat); chute.position.y = 3.2; chute.castShadow = true
  g.add(crate, chute)
  return g
}

/** Containers closer than this to the viewer use the detailed model (with opening lids), the rest a simple stand-in. */
const LOD_NEAR = 42
/** Viewer movement that triggers re-sorting the containers into near and far. */
const LOD_STEP = 2
/** Stand-ins beyond this distance are not drawn at all (fog covers them). */
const DRAW_FAR = 260

interface KindMesh { refs: ContainerRef[]; body: THREE.InstancedMesh; lid: THREE.InstancedMesh; low: THREE.InstancedMesh; decal: THREE.InstancedMesh | null; lidDecal: THREE.InstancedMesh | null }

/** All containers of a raid, drawn with instancing: per kind one detailed body + lid set for nearby containers and one stand-in set for the rest. */
export class ContainerField {
  readonly group = new THREE.Group()
  readonly list: ContainerRef[] = []
  private parts = kindParts()
  private kinds = new Map<ContainerKind, KindMesh>()
  /** Instance slot of a container in its kind's detailed meshes (-1 = drawn as stand-in or not at all). */
  private slot = new Map<ContainerRef, number>()
  /** Eased lid/door opening 0..1 of opened containers. */
  private openness = new Map<ContainerRef, number>()
  private openAnim = new Map<ContainerRef, number>()
  private lastViewer: THREE.Vector3 | null = null

  constructor(parent: THREE.Object3D, spots: { spot: LootSpot; items: BagSlot[] }[]) {
    const byKind = new Map<ContainerKind, { spot: LootSpot; items: BagSlot[] }[]>()
    for (const s of spots) { const k = s.spot.container; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k)!.push(s) }
    for (const [kind, list] of byKind) {
      const p = this.parts[kind], n = list.length
      const body = new THREE.InstancedMesh(p.body, p.bodyMat, n), lid = new THREE.InstancedMesh(p.lid, p.lidMat, n), low = new THREE.InstancedMesh(p.low, p.bodyMat, n)
      body.castShadow = body.receiveShadow = lid.castShadow = low.castShadow = low.receiveShadow = true
      const dm = decalMaterial(), decal = p.decal && dm ? new THREE.InstancedMesh(p.decal, dm, n) : null
      if (decal) { decal.receiveShadow = true; this.group.add(decal) }
      const lidDecal = p.lidDecal && dm ? new THREE.InstancedMesh(p.lidDecal, dm, n) : null
      if (lidDecal) { lidDecal.receiveShadow = true; this.group.add(lidDecal) }
      const refs = list.map(({ spot, items }, i): ContainerRef => ({ index: i, kind, position: new THREE.Vector3(spot.x, spot.y ?? 0, spot.z), yaw: spot.yaw ?? 0, searched: false, opened: false, items, name: CONTAINER_NAMES[kind], tier: spot.tier }))
      this.list.push(...refs)
      this.kinds.set(kind, { refs, body, lid, low, decal, lidDecal })
      this.group.add(body, lid, low)
    }
    this.relod(null)
    parent.add(this.group)
  }

  /** Sorts every container into the detailed (near the viewer) or stand-in instances; without a viewer all are detailed. */
  private relod(viewer: THREE.Vector3 | null): void {
    for (const k of this.kinds.values()) {
      let near = 0, far = 0
      for (const ref of k.refs) {
        const d = viewer ? Math.hypot(ref.position.x - viewer.x, ref.position.z - viewer.z) : 0
        _m.compose(ref.position, _q.setFromAxisAngle(_yAxis, ref.yaw), _one)
        if (d < LOD_NEAR) { k.body.setMatrixAt(near, _m); k.decal?.setMatrixAt(near, _m); this.slot.set(ref, near); this.writeLid(k.lid, ref, near, k.lidDecal); near++ }
        else { this.slot.set(ref, -1); if (d < DRAW_FAR) k.low.setMatrixAt(far++, _m) }
      }
      k.body.count = k.lid.count = near; k.low.count = far
      k.body.visible = k.lid.visible = near > 0; k.low.visible = far > 0
      for (const dm of [k.decal, k.lidDecal]) if (dm) { dm.count = near; dm.visible = near > 0 }
      for (const mesh of [k.body, k.lid, k.low, k.decal, k.lidDecal]) if (mesh) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() }
    }
  }

  private writeLid(lid: THREE.InstancedMesh, ref: ContainerRef, slot: number, lidDecal: THREE.InstancedMesh | null = null): void {
    const p = this.parts[ref.kind]
    _q.setFromAxisAngle(_yAxis, ref.yaw)
    _v.set(p.lidPivot[0], p.lidPivot[1], p.lidPivot[2]).applyQuaternion(_q).add(ref.position)
    _q2.setFromAxisAngle(p.openAxis === "x" ? _xAxis : _yAxis, p.openAngle * (this.openness.get(ref) ?? 0))
    _q.multiply(_q2)
    lid.setMatrixAt(slot, _m.compose(_v, _q, _one))
    lidDecal?.setMatrixAt(slot, _m)
  }

  /** Marks as opened (lid/door animates open). */
  open(ref: ContainerRef): void { if (!ref.opened) { ref.opened = true; this.openAnim.set(ref, 0) } }

  /** Animates opening lids; with a viewer, keeps the near/far split up to date. */
  update(dt: number, viewer?: THREE.Vector3): void {
    if (viewer && (!this.lastViewer || this.lastViewer.distanceToSquared(viewer) > LOD_STEP * LOD_STEP)) {
      this.lastViewer = (this.lastViewer ?? new THREE.Vector3()).copy(viewer)
      this.relod(viewer)
    }
    for (const [ref, t] of this.openAnim) {
      const k = Math.min(1, t + dt * 3)
      this.openness.set(ref, 1 - (1 - k) ** 3)
      const s = this.slot.get(ref) ?? -1, km = this.kinds.get(ref.kind)!
      if (s >= 0) {
        this.writeLid(km.lid, ref, s, km.lidDecal); km.lid.instanceMatrix.needsUpdate = true
        if (km.lidDecal) km.lidDecal.instanceMatrix.needsUpdate = true
        if (k >= 1) { km.lid.computeBoundingSphere(); km.lidDecal?.computeBoundingSphere() }
      }
      if (k >= 1) this.openAnim.delete(ref); else this.openAnim.set(ref, k)
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group)
    for (const m of this.kinds.values()) { m.body.dispose(); m.lid.dispose(); m.low.dispose(); m.decal?.dispose(); m.lidDecal?.dispose() }
    for (const p of Object.values(this.parts)) { p.body.dispose(); p.lid.dispose(); p.low.dispose(); p.decal?.dispose(); p.lidDecal?.dispose(); p.bodyMat.dispose(); p.lidMat.dispose() }
  }
}

/** Items lying in the world: dropped bags, bodies, supply drops (bodies have no mesh — the corpse is visible). */
export interface GroundLoot {
  position: THREE.Vector3; items: BagSlot[]; name: string; kind: "body" | "bag" | "airdrop"; searched: boolean; mesh: THREE.Object3D | null
  /** Another online player's gear where they fell (Online.claimFallen key). */
  fallen?: string
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1)
const _xAxis = new THREE.Vector3(1, 0, 0), _yAxis = new THREE.Vector3(0, 1, 0)
