/**
 * bag.ts — slot-based container logic for the backpack, the secure container and loot containers.
 * Each slot holds one stack of one item (up to ITEMS[id].stack). Pure logic, unit-tested.
 */
import { ITEMS, type ItemId } from "./items"

export interface BagSlot { id: ItemId; qty: number }

export class Bag {
  items: BagSlot[]
  constructor(public slots: number, items: BagSlot[] = []) { this.items = items.filter(s => s.qty > 0 && s.id in ITEMS).map(s => ({ ...s })) }

  get used(): number { return this.items.length }
  get free(): number { return Math.max(0, this.slots - this.items.length) }
  count(id: ItemId): number { let n = 0; for (const s of this.items) if (s.id === id) n += s.qty; return n }
  weight(): number { let w = 0; for (const s of this.items) w += ITEMS[s.id].weight * s.qty; return w }
  value(price: (id: ItemId) => number): number { let v = 0; for (const s of this.items) v += price(s.id) * s.qty; return v }

  /** How many of `qty` would fit (topping up partial stacks first, then free slots). */
  room(id: ItemId, qty = Infinity): number {
    const stack = ITEMS[id].stack
    let room = 0
    for (const s of this.items) if (s.id === id) room += stack - s.qty
    room += this.free * stack
    return Math.min(qty, room)
  }

  /** Adds up to qty; returns how many were added. */
  add(id: ItemId, qty: number): number {
    if (qty <= 0) return 0
    const stack = ITEMS[id].stack
    let left = qty
    for (const s of this.items) {
      if (left <= 0) break
      if (s.id !== id || s.qty >= stack) continue
      const n = Math.min(stack - s.qty, left); s.qty += n; left -= n
    }
    while (left > 0 && this.items.length < this.slots) {
      const n = Math.min(stack, left); this.items.push({ id, qty: n }); left -= n
    }
    return qty - left
  }

  /** Removes up to qty (from the smallest stacks first); returns how many were removed. */
  remove(id: ItemId, qty: number): number {
    let left = qty
    const stacks = this.items.filter(s => s.id === id).sort((a, b) => a.qty - b.qty)
    for (const s of stacks) {
      if (left <= 0) break
      const n = Math.min(s.qty, left); s.qty -= n; left -= n
    }
    this.items = this.items.filter(s => s.qty > 0)
    return qty - left
  }

  /** Removes the whole slot at index; returns it. */
  removeSlot(index: number): BagSlot | null { const s = this.items[index]; if (!s) return null; this.items.splice(index, 1); return s }

  /** Merges partial stacks of the same item and sorts by category then name. */
  compact(): void {
    const totals = new Map<ItemId, number>()
    for (const s of this.items) totals.set(s.id, (totals.get(s.id) || 0) + s.qty)
    this.items = []
    const ids = [...totals.keys()].sort((a, b) => ITEMS[a].cat.localeCompare(ITEMS[b].cat) || ITEMS[a].name.localeCompare(ITEMS[b].name))
    const overflow: BagSlot[] = []
    for (const id of ids) { const qty = totals.get(id)!; const added = this.add(id, qty); if (added < qty) overflow.push({ id, qty: qty - added }) }
    // never lose items: a compact cannot need more slots than before, but stay safe
    for (const o of overflow) this.items.push(o)
  }

  /** Moves as much as fits from this bag's slot into another bag; returns the moved amount. */
  moveSlotTo(index: number, other: Bag, qty = Infinity): number {
    const s = this.items[index]; if (!s) return 0
    const moved = other.add(s.id, Math.min(qty, s.qty))
    s.qty -= moved
    if (s.qty <= 0) this.items.splice(index, 1)
    return moved
  }

  toJSON(): BagSlot[] { return this.items.map(s => ({ id: s.id, qty: s.qty })) }
}
