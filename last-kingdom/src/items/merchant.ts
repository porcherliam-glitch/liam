// Camp merchant: stock generation, prices with reputation discount, buying and selling.

import type { ItemInstance, Profile } from "../core/types"
import { Rng } from "../core/rng"
import { ALL_ITEMS, itemDef } from "./itemData"
import { createItem, itemValue } from "./items"
import { randomEquipment } from "./loot"
import { reputationRank } from "../meta/progression"
import { campBonuses } from "../meta/campData"

export interface MerchantStock {
  items: ItemInstance[]
  refreshAt: number
}

export function generateStock(profile: Profile, seed: number): MerchantStock {
  const rng = new Rng(seed)
  const level = profile.camp.merchant ?? 0
  const items: ItemInstance[] = []
  const basics = ["bandage", "bread", "dried_meat", "arrow", "bolt", "wood", "cloth", "iron", "leather", "herbs"]
  for (const id of basics) {
    const def = itemDef(id)
    items.push(createItem(id, Math.min(def.stack, rng.int(5, 20))))
  }
  if (level >= 1) for (const id of ["potion_small", "antidote", "bone", "torch_item"]) items.push(createItem(id, rng.int(2, 6)))
  if (level >= 2) for (const id of ["potion_large", "steel", "elixir_strength", "elixir_iron"]) items.push(createItem(id, rng.int(1, 4)))
  if (level >= 3) for (const id of ["silver", "elixir_haste", "relic"]) items.push(createItem(id, rng.int(1, 3)))
  // Equipment offers
  const maxTier = level >= 3 ? 4 : level >= 2 ? 3 : level >= 1 ? 2 : 1
  const count = 3 + level * 2
  for (let i = 0; i < count; i++) items.push(randomEquipment(rng, maxTier, 1 + level, level * 0.2))
  return { items, refreshAt: Date.now() + 1000 * 60 * 20 }
}

export function buyPrice(profile: Profile, item: ItemInstance): number {
  const discount = reputationRank(profile.reputation).discount
  return Math.max(1, Math.round((itemValue(item) / item.qty) * 1.5 * (1 - discount)))
}

export function sellPrice(profile: Profile, item: ItemInstance, qty = item.qty): number {
  const rate = campBonuses(profile.camp).sellRate
  const unit = itemValue(item) / item.qty
  return Math.max(1, Math.round(unit * qty * rate))
}

export const MERCHANT_ITEM_IDS = ALL_ITEMS.filter((d) => d.kind !== "quest" && d.kind !== "gold").map((d) => d.id)
