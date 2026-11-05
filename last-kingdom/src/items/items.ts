// Item instances: creation, naming with affixes and effective stats (affixes + upgrades).

import { RARITY_INFO, type Affix, type ItemDef, type ItemInstance, type Rarity } from "../core/types"
import { affixDef, itemDef } from "./itemData"

let uidCounter = 1

/** Resets the uid counter (profiles store their own counter so saved items stay unique). */
export function seedUid(next: number): void {
  uidCounter = Math.max(uidCounter, next)
}

export function nextUid(): number {
  return uidCounter++
}

export function createItem(defId: string, qty = 1, opts: { rarity?: Rarity; affixes?: string[]; uid?: string } = {}): ItemInstance {
  const def = itemDef(defId)
  const rarity = opts.rarity ?? def.rarity
  const inst: ItemInstance = {
    uid: opts.uid ?? `i${nextUid()}`,
    defId,
    qty: Math.max(1, Math.min(qty, def.stack)),
    rarity,
    affixes: opts.affixes ?? [],
  }
  const maxDur = baseDurability(def, inst)
  if (maxDur > 0) {
    inst.maxDurability = maxDur
    inst.durability = maxDur
  }
  if (def.kind === "weapon" || def.kind === "armor" || def.kind === "helmet" || def.kind === "shield") inst.upgrade = 0
  return inst
}

function baseDurability(def: ItemDef, inst: ItemInstance): number {
  let base = def.weapon?.durability ?? def.shield?.durability ?? (def.armor ? 120 + def.armor.armor * 4 : 0)
  if (base <= 0) return 0
  for (const a of affixes(inst)) if (a.durabilityPct) base *= 1 + a.durabilityPct
  return Math.round(base)
}

export function affixes(inst: ItemInstance): Affix[] {
  return inst.affixes.map((id) => affixDef(id)).filter((a): a is Affix => !!a)
}

export function displayName(inst: ItemInstance): string {
  const def = itemDef(inst.defId)
  let name = def.name
  const list = affixes(inst)
  const prefix = list.find((a) => a.prefix)
  const suffix = list.find((a) => !a.prefix)
  if (prefix) {
    // "Leichte Lederrüstung": the base name keeps its own article-free form.
    name = `${prefix.name} ${name.charAt(0).toLowerCase() === name.charAt(0) ? name : name}`
  }
  if (suffix) name = `${name} ${suffix.name}`
  if (inst.upgrade) name += ` +${inst.upgrade}`
  return name
}

export interface EffectiveWeapon {
  damage: number
  speed: number
  range: number
  arc: number
  staminaCost: number
  critChance: number
  critMultiplier: number
  impact: number
  lifeOnHit: number
  twoHanded: boolean
  weaponClass: ItemDef["weapon"] extends infer W ? (W extends { weaponClass: infer C } ? C : never) : never
  ranged?: NonNullable<ItemDef["weapon"]>["ranged"]
}

export function effectiveWeapon(inst: ItemInstance): EffectiveWeapon | null {
  const def = itemDef(inst.defId)
  if (!def.weapon) return null
  const w = def.weapon
  let damage = w.damage * (1 + (inst.upgrade ?? 0) * 0.08)
  let speed = w.speed
  let crit = w.critChance
  let impact = w.impact
  let lifeOnHit = 0
  for (const a of affixes(inst)) {
    if (a.damagePct) damage *= 1 + a.damagePct
    if (a.speedPct) speed *= 1 + a.speedPct
    if (a.critChance) crit += a.critChance
    if (a.impactPct) impact *= 1 + a.impactPct
    if (a.lifeOnHit) lifeOnHit += a.lifeOnHit
  }
  // A broken weapon still swings, but weakly.
  if (inst.durability !== undefined && inst.durability <= 0) damage *= 0.4
  return {
    damage: Math.round(damage),
    speed,
    range: w.range,
    arc: w.arc,
    staminaCost: w.staminaCost,
    critChance: Math.min(0.75, crit),
    critMultiplier: w.critMultiplier,
    impact: Math.min(1, impact),
    lifeOnHit,
    twoHanded: w.twoHanded,
    weaponClass: w.weaponClass,
    ranged: w.ranged,
  }
}

export function effectiveArmor(inst: ItemInstance): number {
  const def = itemDef(inst.defId)
  if (!def.armor) return 0
  let armor = def.armor.armor * (1 + (inst.upgrade ?? 0) * 0.08)
  for (const a of affixes(inst)) if (a.armorPct) armor *= 1 + a.armorPct
  if (inst.durability !== undefined && inst.durability <= 0) armor *= 0.5
  return Math.round(armor)
}

export function effectiveBlock(inst: ItemInstance): { reduction: number; staminaCost: number } | null {
  const def = itemDef(inst.defId)
  if (!def.shield) return null
  let reduction = def.shield.blockReduction + (inst.upgrade ?? 0) * 0.01
  for (const a of affixes(inst)) if (a.armorPct) reduction += a.armorPct * 0.2
  if (inst.durability !== undefined && inst.durability <= 0) reduction *= 0.5
  return { reduction: Math.min(0.97, reduction), staminaCost: def.shield.blockStaminaCost }
}

export function itemWeight(inst: ItemInstance): number {
  const def = itemDef(inst.defId)
  let w = def.weight
  for (const a of affixes(inst)) if (a.weightPct) w *= 1 + a.weightPct
  return w * inst.qty
}

export function itemValue(inst: ItemInstance): number {
  const def = itemDef(inst.defId)
  if (def.kind === "gold") return inst.qty
  let v = def.value * (RARITY_INFO[inst.rarity].valueMult / RARITY_INFO[def.rarity].valueMult)
  for (const a of affixes(inst)) if (a.valuePct) v *= 1 + a.valuePct
  v *= 1 + (inst.upgrade ?? 0) * 0.15
  if (inst.durability !== undefined && inst.maxDurability) v *= 0.5 + 0.5 * (inst.durability / inst.maxDurability)
  return Math.max(1, Math.round(v * inst.qty))
}

export function isEquippable(def: ItemDef): boolean {
  return def.kind === "weapon" || def.kind === "armor" || def.kind === "helmet" || def.kind === "shield"
}

export function isUsable(def: ItemDef): boolean {
  return !!def.consumable
}

export function cloneItem(inst: ItemInstance): ItemInstance {
  return { ...inst, affixes: [...inst.affixes] }
}

export function describeAffixes(inst: ItemInstance): string[] {
  const out: string[] = []
  for (const a of affixes(inst)) {
    const parts: string[] = []
    if (a.damagePct) parts.push(`${a.damagePct > 0 ? "+" : ""}${Math.round(a.damagePct * 100)} % Schaden`)
    if (a.armorPct) parts.push(`+${Math.round(a.armorPct * 100)} % Rüstung`)
    if (a.critChance) parts.push(`+${Math.round(a.critChance * 100)} % Kritisch`)
    if (a.durabilityPct) parts.push(`${a.durabilityPct > 0 ? "+" : ""}${Math.round(a.durabilityPct * 100)} % Haltbarkeit`)
    if (a.speedPct) parts.push(`+${Math.round(a.speedPct * 100)} % Tempo`)
    if (a.staminaRegenPct) parts.push(`+${Math.round(a.staminaRegenPct * 100)} % Ausdauerregeneration`)
    if (a.lifeOnHit) parts.push(`+${a.lifeOnHit} Leben pro Treffer`)
    if (a.weightPct) parts.push(`${Math.round(a.weightPct * 100)} % Gewicht`)
    if (a.impactPct) parts.push(`+${Math.round(a.impactPct * 100)} % Wucht`)
    if (a.valuePct) parts.push(`+${Math.round(a.valuePct * 100)} % Wert`)
    out.push(`${a.name}: ${parts.join(", ")}`)
  }
  return out
}
