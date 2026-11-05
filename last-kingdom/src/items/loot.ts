// Loot tables and rarity rolling. Area danger and the player's luck raise the odds of better rarities.

import { RARITIES, RARITY_INFO, type ItemInstance, type Rarity } from "../core/types"
import { Rng } from "../core/rng"
import { AFFIXES, ALL_ITEMS, itemDef } from "./itemData"
import { createItem } from "./items"

interface LootEntry {
  id: string
  weight: number
  min?: number
  max?: number
}

interface LootTable {
  rolls: [number, number]
  entries: LootEntry[]
  gold?: [number, number]
}

const MATERIAL_BASICS: LootEntry[] = [
  { id: "wood", weight: 10, min: 1, max: 4 },
  { id: "cloth", weight: 10, min: 1, max: 4 },
  { id: "leather", weight: 6, min: 1, max: 2 },
  { id: "iron", weight: 6, min: 1, max: 3 },
  { id: "herbs", weight: 7, min: 1, max: 3 },
  { id: "bone", weight: 5, min: 1, max: 3 },
]

const CONSUMABLE_BASICS: LootEntry[] = [
  { id: "bread", weight: 8, min: 1, max: 2 },
  { id: "dried_meat", weight: 5, min: 1, max: 2 },
  { id: "bandage", weight: 8, min: 1, max: 3 },
  { id: "potion_small", weight: 3 },
  { id: "arrow", weight: 6, min: 6, max: 14 },
  { id: "bolt", weight: 3, min: 4, max: 10 },
]

export const LOOT_TABLES: Record<string, LootTable> = {
  // Enemy drops
  walker: { rolls: [0, 2], gold: [0, 6], entries: [...MATERIAL_BASICS.map((e) => ({ ...e, max: 2 })), { id: "bandage", weight: 3 }, { id: "bread", weight: 2 }] },
  monk: { rolls: [0, 2], gold: [0, 8], entries: [{ id: "herbs", weight: 8, min: 1, max: 3 }, { id: "cloth", weight: 6, min: 1, max: 3 }, { id: "candlestick", weight: 1 }, { id: "book", weight: 0.6 }, { id: "potion_small", weight: 2 }] },
  soldier: { rolls: [1, 2], gold: [2, 12], entries: [{ id: "iron", weight: 8, min: 1, max: 3 }, { id: "leather", weight: 4, min: 1, max: 2 }, { id: "shortsword_1", weight: 1.5 }, { id: "spear_1", weight: 1 }, { id: "helm_kettle", weight: 1 }, { id: "bolt", weight: 3, min: 3, max: 8 }] },
  brute: { rolls: [1, 3], gold: [5, 20], entries: [{ id: "bone", weight: 8, min: 2, max: 5 }, { id: "leather", weight: 5, min: 2, max: 4 }, { id: "iron", weight: 4, min: 2, max: 4 }, { id: "battleaxe_1", weight: 1 }, { id: "mace_1", weight: 1 }, { id: "steel", weight: 1, min: 1, max: 2 }] },
  knight: { rolls: [1, 3], gold: [8, 30], entries: [{ id: "iron", weight: 6, min: 2, max: 4 }, { id: "steel", weight: 3, min: 1, max: 2 }, { id: "longsword_1", weight: 2 }, { id: "longsword_2", weight: 0.8 }, { id: "helm_nasal", weight: 1 }, { id: "shield_kite", weight: 1 }, { id: "armor_chain", weight: 0.4 }, { id: "silver", weight: 0.8 }] },
  boss: { rolls: [3, 5], gold: [80, 250], entries: [{ id: "plague_heart", weight: 6 }, { id: "steel", weight: 4, min: 3, max: 6 }, { id: "silver", weight: 4, min: 2, max: 4 }, { id: "relic", weight: 3, min: 1, max: 2 }, { id: "longsword_3", weight: 1 }, { id: "greatsword_2", weight: 1 }, { id: "battleaxe_3", weight: 1 }, { id: "mace_3", weight: 0.6 }, { id: "crossbow_2", weight: 1 }, { id: "bow_3", weight: 0.8 }, { id: "armor_brigandine", weight: 0.5 }, { id: "helm_great", weight: 0.5 }, { id: "shield_heater", weight: 0.8 }, { id: "crown_fragment", weight: 1 }, { id: "potion_large", weight: 3, min: 1, max: 2 }] },
  // Containers by area
  village: { rolls: [1, 3], gold: [2, 14], entries: [...MATERIAL_BASICS, ...CONSUMABLE_BASICS, { id: "torch_item", weight: 1.5 }, { id: "shortsword_1", weight: 1 }, { id: "battleaxe_1", weight: 1.2 }, { id: "dagger_1", weight: 1 }, { id: "spear_1", weight: 1 }, { id: "bow_1", weight: 0.8 }, { id: "armor_gambeson", weight: 0.8 }, { id: "helm_hood", weight: 0.8 }, { id: "shield_wood", weight: 0.8 }, { id: "candlestick", weight: 0.5 }, { id: "tapestry", weight: 0.3 }] },
  forest: { rolls: [1, 3], gold: [1, 10], entries: [{ id: "herbs", weight: 14, min: 2, max: 5 }, { id: "wood", weight: 12, min: 2, max: 5 }, { id: "leather", weight: 9, min: 1, max: 3 }, { id: "bone", weight: 5, min: 1, max: 3 }, ...CONSUMABLE_BASICS, { id: "bow_1", weight: 1.5 }, { id: "bow_2", weight: 0.5 }, { id: "spear_1", weight: 1 }, { id: "armor_leather", weight: 0.8 }, { id: "silver", weight: 0.6 }, { id: "antidote", weight: 2 }] },
  castle: { rolls: [1, 3], gold: [6, 30], entries: [{ id: "iron", weight: 12, min: 2, max: 5 }, { id: "torch_item", weight: 1.5 }, { id: "steel", weight: 5, min: 1, max: 2 }, { id: "leather", weight: 5, min: 1, max: 3 }, { id: "cloth", weight: 5, min: 1, max: 3 }, ...CONSUMABLE_BASICS, { id: "longsword_1", weight: 1.5 }, { id: "longsword_2", weight: 0.7 }, { id: "greatsword_1", weight: 1 }, { id: "mace_2", weight: 0.6 }, { id: "crossbow_1", weight: 1 }, { id: "bolt", weight: 4, min: 5, max: 12 }, { id: "helm_nasal", weight: 0.8 }, { id: "shield_kite", weight: 0.8 }, { id: "armor_chain", weight: 0.5 }, { id: "tapestry", weight: 0.5 }, { id: "chalice", weight: 0.4 }, { id: "jewel_box", weight: 0.4 }] },
  graveyard: { rolls: [1, 3], gold: [4, 20], entries: [{ id: "bone", weight: 14, min: 2, max: 6 }, { id: "silver", weight: 4, min: 1, max: 2 }, { id: "cloth", weight: 6, min: 1, max: 3 }, { id: "herbs", weight: 5, min: 1, max: 3 }, ...CONSUMABLE_BASICS, { id: "candlestick", weight: 1.5 }, { id: "saint_bones", weight: 0.5 }, { id: "relic", weight: 0.8 }, { id: "mace_1", weight: 1 }, { id: "mace_2", weight: 0.5 }, { id: "dagger_2", weight: 0.6 }, { id: "jewel_box", weight: 0.6 }] },
  monastery: { rolls: [1, 3], gold: [4, 24], entries: [{ id: "herbs", weight: 12, min: 2, max: 6 }, { id: "cloth", weight: 8, min: 2, max: 4 }, { id: "silver", weight: 3, min: 1, max: 2 }, { id: "relic", weight: 1.2 }, ...CONSUMABLE_BASICS, { id: "potion_large", weight: 1.5 }, { id: "book", weight: 1.5 }, { id: "candlestick", weight: 1.5 }, { id: "chalice", weight: 1 }, { id: "saint_bones", weight: 0.8 }, { id: "mace_3", weight: 0.3 }, { id: "armor_gambeson", weight: 0.6 }, { id: "elixir_strength", weight: 0.6 }] },
  catacombs: { rolls: [1, 3], gold: [6, 30], entries: [{ id: "bone", weight: 12, min: 2, max: 6 }, { id: "torch_item", weight: 2.5 }, { id: "silver", weight: 5, min: 1, max: 3 }, { id: "relic", weight: 2 }, { id: "iron", weight: 5, min: 1, max: 3 }, { id: "steel", weight: 3, min: 1, max: 2 }, ...CONSUMABLE_BASICS, { id: "dagger_3", weight: 0.3 }, { id: "shortsword_3", weight: 0.5 }, { id: "jewel_box", weight: 1 }, { id: "saint_bones", weight: 0.8 }, { id: "crown_fragment", weight: 0.3 }, { id: "helm_bascinet", weight: 0.5 }] },
  city: { rolls: [2, 4], gold: [10, 50], entries: [...MATERIAL_BASICS, { id: "steel", weight: 4, min: 1, max: 3 }, { id: "silver", weight: 4, min: 1, max: 3 }, ...CONSUMABLE_BASICS, { id: "jewel_box", weight: 2 }, { id: "chalice", weight: 1.5 }, { id: "book", weight: 1.2 }, { id: "crown_fragment", weight: 0.6 }, { id: "royal_seal", weight: 0.1 }, { id: "longsword_3", weight: 0.5 }, { id: "shortsword_3", weight: 0.6 }, { id: "spear_3", weight: 0.5 }, { id: "battleaxe_3", weight: 0.4 }, { id: "greatsword_3", weight: 0.25 }, { id: "armor_brigandine", weight: 0.3 }, { id: "helm_bascinet", weight: 0.6 }, { id: "shield_heater", weight: 0.5 }, { id: "elixir_haste", weight: 0.4 }] },
  fortress: { rolls: [2, 4], gold: [12, 60], entries: [{ id: "iron", weight: 10, min: 2, max: 6 }, { id: "steel", weight: 8, min: 1, max: 4 }, { id: "silver", weight: 3, min: 1, max: 2 }, { id: "relic", weight: 1.5 }, ...CONSUMABLE_BASICS, { id: "bolt", weight: 5, min: 6, max: 14 }, { id: "crossbow_2", weight: 0.8 }, { id: "crossbow_3", weight: 0.3 }, { id: "longsword_3", weight: 0.7 }, { id: "longsword_4", weight: 0.12 }, { id: "greatsword_3", weight: 0.4 }, { id: "battleaxe_3", weight: 0.6 }, { id: "mace_3", weight: 0.4 }, { id: "armor_plate", weight: 0.2 }, { id: "armor_brigandine", weight: 0.5 }, { id: "helm_great", weight: 0.5 }, { id: "shield_tower", weight: 0.4 }, { id: "elixir_iron", weight: 0.8 }, { id: "royal_seal", weight: 0.15 }] },
  // Special containers
  secret: { rolls: [3, 5], gold: [60, 200], entries: [{ id: "silver", weight: 5, min: 2, max: 4 }, { id: "relic", weight: 4, min: 1, max: 2 }, { id: "steel", weight: 4, min: 2, max: 5 }, { id: "jewel_box", weight: 3 }, { id: "chalice", weight: 2 }, { id: "crown_fragment", weight: 1.5 }, { id: "royal_seal", weight: 0.3 }, { id: "longsword_3", weight: 1 }, { id: "bow_3", weight: 1 }, { id: "dagger_3", weight: 0.8 }, { id: "mace_3", weight: 0.8 }, { id: "greatsword_3", weight: 0.7 }, { id: "crossbow_3", weight: 0.6 }, { id: "armor_brigandine", weight: 0.8 }, { id: "helm_great", weight: 0.8 }, { id: "shield_tower", weight: 0.6 }, { id: "potion_large", weight: 3, min: 2, max: 3 }, { id: "elixir_haste", weight: 1 }] },
  herb: { rolls: [1, 1], entries: [{ id: "herbs", weight: 10, min: 2, max: 4 }] },
  woodpile: { rolls: [1, 1], entries: [{ id: "wood", weight: 10, min: 3, max: 6 }] },
  bones: { rolls: [1, 1], entries: [{ id: "bone", weight: 10, min: 2, max: 4 }, { id: "silver", weight: 1 }] },
  scrap: { rolls: [1, 1], entries: [{ id: "iron", weight: 10, min: 2, max: 4 }, { id: "steel", weight: 1 }] },
}

const RARITY_BASE: Record<Rarity, number> = { common: 100, uncommon: 36, rare: 12, epic: 3.2, legendary: 0.7, mythic: 0.12 }

/** Rolls the rarity of an equipment drop. danger 1..6, luck 0..1+. */
export function rollRarity(rng: Rng, danger: number, luck: number, minimum: Rarity = "common"): Rarity {
  const boost = 1 + danger * 0.18 + luck
  const minIdx = RARITIES.indexOf(minimum)
  const picked = rng.weighted(RARITIES, (r) => {
    const idx = RARITIES.indexOf(r)
    if (idx < minIdx) return 0
    return RARITY_BASE[r] * Math.pow(boost, idx)
  })
  return picked
}

function rollAffixes(rng: Rng, count: number, kind: string): string[] {
  const pool = AFFIXES.filter((a) => {
    if (kind === "weapon") return a.damagePct || a.critChance || a.durabilityPct || a.speedPct || a.lifeOnHit || a.weightPct || a.impactPct || a.valuePct
    return a.armorPct || a.durabilityPct || a.weightPct || a.staminaRegenPct || a.valuePct || a.speedPct
  })
  const chosen: string[] = []
  const prefixes = pool.filter((a) => a.prefix)
  const suffixes = pool.filter((a) => !a.prefix)
  if (count >= 1 && suffixes.length) chosen.push(rng.pick(suffixes).id)
  if (count >= 2 && prefixes.length) chosen.push(rng.pick(prefixes).id)
  return chosen
}

/** Creates an equipment instance with rolled rarity and affixes. */
export function rollEquipment(rng: Rng, defId: string, danger: number, luck: number): ItemInstance {
  const def = itemDef(defId)
  const rarity = rollRarity(rng, danger, luck, def.rarity)
  const affixCount = RARITY_INFO[rarity].affixes
  const affixes = affixCount > 0 ? rollAffixes(rng, affixCount, def.kind) : []
  return createItem(defId, 1, { rarity, affixes })
}

export interface LootResult {
  items: ItemInstance[]
  gold: number
}

export function rollLoot(rng: Rng, tableId: string, danger: number, luck: number, bonusRolls = 0): LootResult {
  const table = LOOT_TABLES[tableId]
  if (!table) throw new Error(`unknown loot table ${tableId}`)
  const rolls = rng.int(table.rolls[0], table.rolls[1]) + bonusRolls
  const items: ItemInstance[] = []
  for (let i = 0; i < rolls; i++) {
    const entry = rng.weighted(table.entries, (e) => e.weight * (luck > 0 && itemDef(e.id).rarity !== "common" ? 1 + luck : 1))
    const def = itemDef(entry.id)
    if (def.kind === "weapon" || def.kind === "armor" || def.kind === "helmet" || def.kind === "shield") {
      items.push(rollEquipment(rng, entry.id, danger, luck))
    } else {
      const qty = rng.int(entry.min ?? 1, entry.max ?? 1)
      items.push(createItem(entry.id, qty))
    }
  }
  let gold = 0
  if (table.gold) gold = Math.round(rng.int(table.gold[0], table.gold[1]) * (1 + danger * 0.25))
  return { items, gold }
}

/** Random equipment of a given tier range, used by the merchant. */
export function randomEquipment(rng: Rng, maxTier: number, danger: number, luck: number): ItemInstance {
  const pool = ALL_ITEMS.filter((d) => (d.kind === "weapon" || d.kind === "armor" || d.kind === "helmet" || d.kind === "shield") && (d.tier ?? tierFromRarity(d.rarity)) <= maxTier)
  const def = rng.pick(pool)
  return rollEquipment(rng, def.id, danger, luck)
}

function tierFromRarity(r: Rarity): number {
  return { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 }[r]
}
