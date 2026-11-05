// Slot-based inventory with weight limit and equipment slots. Pure logic, no DOM or Three.js.

import type { EquipSlot, InventoryState, ItemInstance } from "../core/types"
import { itemDef } from "./itemData"
import { cloneItem, itemWeight } from "./items"

export const QUICK_SLOTS: EquipSlot[] = ["quick1", "quick2", "quick3", "quick4"]

export function createInventory(capacity: number): InventoryState {
  return { slots: new Array(capacity).fill(null), capacity, equipment: {} }
}

export function resizeInventory(inv: InventoryState, capacity: number): void {
  if (capacity > inv.slots.length) {
    while (inv.slots.length < capacity) inv.slots.push(null)
  }
  inv.capacity = capacity
}

export function totalWeight(inv: InventoryState): number {
  let w = 0
  for (const s of inv.slots) if (s) w += itemWeight(s)
  for (const key of Object.keys(inv.equipment) as EquipSlot[]) {
    const e = inv.equipment[key]
    if (e) w += itemWeight(e)
  }
  return w
}

export function countItem(inv: InventoryState, defId: string): number {
  let n = 0
  for (const s of inv.slots) if (s && s.defId === defId) n += s.qty
  return n
}

export function countInList(list: (ItemInstance | null)[], defId: string): number {
  let n = 0
  for (const s of list) if (s && s.defId === defId) n += s.qty
  return n
}

/**
 * Adds an item, stacking where possible. Returns the quantity that did not fit.
 * The passed instance is consumed (its qty is reduced to what remains).
 */
export function addItem(inv: InventoryState, item: ItemInstance): number {
  const def = itemDef(item.defId)
  let remaining = item.qty
  if (def.stack > 1 && item.affixes.length === 0) {
    for (const s of inv.slots) {
      if (remaining <= 0) break
      if (s && s.defId === item.defId && s.rarity === item.rarity && s.affixes.length === 0 && s.qty < def.stack) {
        const take = Math.min(def.stack - s.qty, remaining)
        s.qty += take
        remaining -= take
      }
    }
  }
  while (remaining > 0) {
    const idx = inv.slots.findIndex((s, i) => s === null && i < inv.capacity)
    if (idx < 0) break
    const take = Math.min(def.stack, remaining)
    const copy = cloneItem(item)
    copy.qty = take
    if (remaining !== item.qty || copy.uid === item.uid) copy.uid = `${item.uid}_${idx}`
    if (remaining === item.qty) copy.uid = item.uid
    inv.slots[idx] = copy
    remaining -= take
  }
  item.qty = remaining
  return remaining
}

/** Removes `qty` of a definition from the bag. Returns the amount actually removed. */
export function removeItem(inv: InventoryState, defId: string, qty: number): number {
  let left = qty
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    const s = inv.slots[i]
    if (!s || s.defId !== defId) continue
    const take = Math.min(s.qty, left)
    s.qty -= take
    left -= take
    if (s.qty <= 0) inv.slots[i] = null
  }
  return qty - left
}

export function removeByUid(inv: InventoryState, uid: string): ItemInstance | null {
  const idx = inv.slots.findIndex((s) => s?.uid === uid)
  if (idx >= 0) {
    const it = inv.slots[idx]
    inv.slots[idx] = null
    return it
  }
  for (const key of Object.keys(inv.equipment) as EquipSlot[]) {
    if (inv.equipment[key]?.uid === uid) {
      const it = inv.equipment[key]!
      inv.equipment[key] = null
      return it
    }
  }
  return null
}

export function findByUid(inv: InventoryState, uid: string): ItemInstance | null {
  for (const s of inv.slots) if (s?.uid === uid) return s
  for (const key of Object.keys(inv.equipment) as EquipSlot[]) if (inv.equipment[key]?.uid === uid) return inv.equipment[key]!
  return null
}

export function slotForItem(defId: string): EquipSlot | null {
  const def = itemDef(defId)
  if (defId === "torch_item") return "offHand"
  switch (def.kind) {
    case "weapon":
      return "mainHand"
    case "shield":
      return "offHand"
    case "helmet":
      return "head"
    case "armor":
      return "body"
    default:
      return null
  }
}

export function canGoInQuickSlot(defId: string): boolean {
  const def = itemDef(defId)
  return !!def.consumable || def.kind === "weapon"
}

/** Equips an item from the bag into its natural slot (or a quick slot). Swaps the previous item back into the bag. */
export function equip(inv: InventoryState, uid: string, slot?: EquipSlot): { ok: boolean; reason?: string } {
  const idx = inv.slots.findIndex((s) => s?.uid === uid)
  if (idx < 0) return { ok: false, reason: "Gegenstand nicht im Rucksack" }
  const item = inv.slots[idx]!
  const target = slot ?? slotForItem(item.defId)
  if (!target) return { ok: false, reason: "Nicht ausrüstbar" }
  if (QUICK_SLOTS.includes(target) && !canGoInQuickSlot(item.defId)) return { ok: false, reason: "Nur Waffen und Verbrauchsgüter im Schnellzugriff" }
  if (!QUICK_SLOTS.includes(target) && slotForItem(item.defId) !== target) return { ok: false, reason: "Passt nicht in diesen Platz" }
  const def = itemDef(item.defId)
  // Two-handed weapons push the shield into the bag.
  const prev = inv.equipment[target] ?? null
  inv.slots[idx] = prev
  inv.equipment[target] = item
  if (target === "mainHand" && def.weapon?.twoHanded && inv.equipment.offHand) {
    const shield = inv.equipment.offHand
    inv.equipment.offHand = null
    if (addItem(inv, shield) > 0) {
      // No room: undo.
      inv.equipment.offHand = shield
      inv.equipment[target] = prev
      inv.slots[idx] = item
      return { ok: false, reason: "Kein Platz für den Schild" }
    }
  }
  if (target === "offHand") {
    const main = inv.equipment.mainHand
    if (main && itemDef(main.defId).weapon?.twoHanded) {
      inv.equipment[target] = prev
      inv.slots[idx] = item
      return { ok: false, reason: "Zweihandwaffe lässt keinen Schild zu" }
    }
  }
  return { ok: true }
}

export function unequip(inv: InventoryState, slot: EquipSlot): boolean {
  const item = inv.equipment[slot]
  if (!item) return false
  inv.equipment[slot] = null
  if (addItem(inv, item) > 0) {
    inv.equipment[slot] = item
    return false
  }
  return true
}

export function freeSlots(inv: InventoryState): number {
  let n = 0
  for (let i = 0; i < inv.capacity; i++) if (!inv.slots[i]) n++
  return n
}

export function allItems(inv: InventoryState): ItemInstance[] {
  const out: ItemInstance[] = []
  for (const s of inv.slots) if (s) out.push(s)
  return out
}

export function compact(inv: InventoryState): void {
  const items = allItems(inv)
  inv.slots = new Array(inv.capacity).fill(null)
  for (const it of items) addItem(inv, it)
}

/** Moves an item between two slot lists (bag <-> stash). Returns false if nothing moved. */
export function transfer(from: (ItemInstance | null)[], to: InventoryState, uid: string): boolean {
  const idx = from.findIndex((s) => s?.uid === uid)
  if (idx < 0) return false
  const item = from[idx]!
  const copy = cloneItem(item)
  const left = addItem(to, copy)
  if (left === item.qty) return false
  item.qty = left
  if (item.qty <= 0) from[idx] = null
  return true
}

const KIND_ORDER = ["weapon", "shield", "helmet", "armor", "remedy", "food", "ammo", "quest", "artifact", "material", "gold"]

/** Sorts the bag: equipment first, then consumables, materials; within a kind by rarity and name. */
export function sortInventory(inv: InventoryState): void {
  const items = allItems(inv)
  const rank = (it: ItemInstance) => {
    const d = itemDef(it.defId)
    return KIND_ORDER.indexOf(d.kind) * 100 - ["common", "uncommon", "rare", "epic", "legendary", "mythic"].indexOf(it.rarity) * 10
  }
  items.sort((a, b) => rank(a) - rank(b) || itemDef(a.defId).name.localeCompare(itemDef(b.defId).name, "de") || b.qty - a.qty)
  inv.slots = new Array(inv.capacity).fill(null)
  for (const it of items) addItem(inv, it)
}
