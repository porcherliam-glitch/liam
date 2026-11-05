// Inventory (bag, equipment, stash at camp) and the loot screen for containers.

import type { GameApi } from "../../game/api"
import type { Screen, ButtonKind } from "../ui"
import { esc } from "../ui"
import { itemDetails, itemTile } from "./common"
import { QUICK_SLOTS, addItem, allItems, equip, findByUid, removeByUid, resizeInventory, slotForItem, totalWeight, transfer, unequip, canGoInQuickSlot } from "../../items/inventory"
import { itemDef } from "../../items/itemData"
import { cloneItem, displayName, isEquippable, isUsable } from "../../items/items"
import { campBonuses } from "../../meta/campData"
import type { EquipSlot, ItemInstance, InventoryState } from "../../core/types"
import { classDef } from "../../meta/classData"
import { skillBonuses } from "../../meta/skillData"

const EQUIP_LABELS: Record<EquipSlot, string> = { mainHand: "Waffe", offHand: "Schild", head: "Helm", body: "Rüstung", quick1: "Schnell 1", quick2: "Schnell 2", quick3: "Schnell 3", quick4: "Schnell 4" }

export class InventoryScreen implements Screen {
  name = "inventory"
  overlay = true
  private selectedUid: string | null = null
  private confirmDrop: string | null = null
  constructor(private game: GameApi, private mode: "camp" | "expedition") {}

  private get inv(): InventoryState {
    return this.game.profile!.loadout
  }

  private carryLimit(): number {
    const p = this.game.profile!
    if (this.game.expedition) return this.game.expedition.player.carryLimit
    const cls = classDef(p.classId)
    const sk = skillBonuses(p.skills)
    return cls.carry + sk.carryKg + campBonuses(p.camp).carryKg + (p.level - 1) * 0.5
  }

  render(): string {
    const p = this.game.profile!
    const inv = this.inv
    const bonuses = campBonuses(p.camp)
    if (this.mode === "camp") resizeInventory(inv, bonuses.bagSlots)
    const weight = totalWeight(inv)
    const limit = this.carryLimit()
    const selected = this.selectedUid ? findByUid(inv, this.selectedUid) ?? p.stash.find((s) => s.uid === this.selectedUid) ?? null : null
    const compareSlot = selected ? slotForItem(selected.defId) : null
    const compare = compareSlot && selected && !Object.values(inv.equipment).includes(selected) ? inv.equipment[compareSlot] ?? null : null
    const insured = bonuses.insuredSlots + skillBonuses(p.skills).insurance
    const equipSlots: EquipSlot[] = ["mainHand", "offHand", "head", "body", ...QUICK_SLOTS.slice(0, bonuses.quickSlots)]
    const stash = this.mode === "camp" ? `<section class="panel stash"><h2>Lager (${p.stash.filter(Boolean).length} / ${bonuses.stashSlots})</h2><div class="grid" data-scroll="stash">${Array.from({ length: bonuses.stashSlots }, (_, i) => itemTile(p.stash[i] ?? null, `stash${i}`, "stash", "stash-tile")).join("")}</div></section>` : ""
    return `<div class="inv-layout ${this.mode}">
      <section class="panel equip"><h2>${esc(p.name)} · Stufe ${p.level}</h2>
        <div class="equip-slots">${equipSlots.map((s) => `<div class="eslot"><label>${EQUIP_LABELS[s]}</label>${itemTile(inv.equipment[s] ?? null, `eq-${s}`, "equipslot", "equip-tile")}</div>`).join("")}</div>
        <div class="stat"><span>Gold</span><b>${p.gold}</b></div>
        <div class="stat ${weight > limit ? "bad" : ""}"><span>Gewicht</span><b>${weight.toFixed(1)} / ${limit.toFixed(0)} kg</b></div>
        ${insured ? `<div class="dim">Die ersten ${insured} Rucksackplätze sind versichert.</div>` : ""}
      </section>
      <section class="panel bag"><h2>Rucksack (${allItems(inv).length} / ${inv.capacity})</h2><div class="grid" data-scroll="bag">${Array.from({ length: inv.capacity }, (_, i) => itemTile(inv.slots[i] ?? null, `bag${i}`, "bag", i < insured ? "insured" : "")).join("")}</div></section>
      ${stash}
      <section class="panel detail">${itemDetails(selected, compare)}${this.actionsFor(selected)}</section>
    </div>`
  }

  private actionsFor(item: ItemInstance | null): string {
    if (!item) return ""
    const def = itemDef(item.defId)
    const inBag = this.inv.slots.includes(item)
    const inStash = this.game.profile!.stash.includes(item)
    const equipped = Object.values(this.inv.equipment).includes(item)
    const btns: string[] = []
    if (inBag && isEquippable(def)) btns.push(`<button class="btn small" data-focus data-action="equip" data-uid="${item.uid}">Ausrüsten</button>`)
    if (inBag && canGoInQuickSlot(item.defId)) btns.push(`<button class="btn small" data-focus data-action="quick" data-uid="${item.uid}">In Schnellzugriff</button>`)
    if (inBag && isUsable(def) && this.mode === "expedition") btns.push(`<button class="btn small" data-focus data-action="use" data-uid="${item.uid}">Benutzen</button>`)
    if (equipped) btns.push(`<button class="btn small" data-focus data-action="unequip" data-uid="${item.uid}">Ablegen</button>`)
    if (this.mode === "camp" && (inBag || equipped)) btns.push(`<button class="btn small" data-focus data-action="tostash" data-uid="${item.uid}">Ins Lager</button>`)
    if (this.mode === "camp" && inStash) btns.push(`<button class="btn small" data-focus data-action="tobag" data-uid="${item.uid}">In den Rucksack</button>`)
    if (this.mode === "expedition" && inBag) btns.push(this.confirmDrop === item.uid ? `<button class="btn small danger" data-focus data-action="drop-yes" data-uid="${item.uid}">Wirklich wegwerfen</button>` : `<button class="btn small" data-focus data-action="drop" data-uid="${item.uid}">Wegwerfen</button>`)
    if (this.mode === "camp" && (inBag || inStash) && def.kind !== "quest") btns.push(this.confirmDrop === item.uid ? `<button class="btn small danger" data-focus data-action="destroy-yes" data-uid="${item.uid}">Wirklich vernichten</button>` : `<button class="btn small" data-focus data-action="destroy" data-uid="${item.uid}">Vernichten</button>`)
    return `<div class="actions">${btns.join("")}</div>`
  }

  onFocus(el: HTMLElement): void {
    if (el.dataset.uid && el.dataset.uid !== this.selectedUid && (el.classList.contains("tile"))) {
      this.selectedUid = el.dataset.uid
      this.confirmDrop = null
      this.updateDetail()
    }
  }

  private updateDetail(): void {
    this.game.ui.refresh(this)
  }

  onAction(action: string, el: HTMLElement, button: ButtonKind): void {
    const p = this.game.profile!
    const inv = this.inv
    const uid = el.dataset.uid ?? this.selectedUid
    const item = uid ? findByUid(inv, uid) ?? p.stash.find((s) => s?.uid === uid) ?? null : null
    const toast = (t: string, kind: "info" | "warn" | "good" = "info") => this.game.ui.toast(t, kind)
    // Tile activation: confirm = primary action, alt = stash/drop, alt2 = quick slot
    if (action === "bag" || action === "stash" || action === "equipslot") {
      if (!item) return
      this.selectedUid = item.uid
      const def = itemDef(item.defId)
      if (button === "alt") {
        if (this.mode === "camp") action = action === "stash" ? "tobag" : "tostash"
        else action = "drop"
      } else if (button === "alt2") {
        action = action === "equipslot" ? "unequip" : "quick"
      } else {
        if (action === "equipslot") action = "unequip"
        else if (action === "stash") action = "tobag"
        else if (isEquippable(def)) action = "equip"
        else if (isUsable(def) && this.mode === "expedition") action = "use"
        else if (this.mode === "camp") action = "tostash"
        else return
      }
    }
    if (!item) return
    switch (action) {
      case "equip": {
        const r = equip(inv, item.uid)
        if (!r.ok) toast(r.reason ?? "Geht nicht", "warn")
        else toast(`${displayName(item)} ausgerüstet`, "good")
        break
      }
      case "quick": {
        const bonuses = campBonuses(p.camp)
        const slots = QUICK_SLOTS.slice(0, bonuses.quickSlots)
        const free = slots.find((s) => !inv.equipment[s]) ?? slots[0]
        const r = equip(inv, item.uid, free)
        if (!r.ok) toast(r.reason ?? "Geht nicht", "warn")
        break
      }
      case "unequip": {
        const slot = (Object.keys(inv.equipment) as EquipSlot[]).find((s) => inv.equipment[s] === item)
        if (slot && !unequip(inv, slot)) toast("Kein Platz im Rucksack", "warn")
        break
      }
      case "use":
        if (this.game.expedition) {
          const ok = this.game.expedition.player.useItemFromBag(item)
          if (!ok) toast("Nicht benutzbar", "warn")
        }
        break
      case "tostash": {
        const bonuses = campBonuses(p.camp)
        const stashInv: InventoryState = { slots: p.stash, capacity: bonuses.stashSlots, equipment: {} }
        while (stashInv.slots.length < bonuses.stashSlots) stashInv.slots.push(null as unknown as ItemInstance)
        const removed = removeByUid(inv, item.uid)
        if (removed) {
          const copy = cloneItem(removed)
          const left = addItem(stashInv, copy)
          if (left > 0) {
            removed.qty = left
            addItem(inv, removed)
            toast("Lager ist voll", "warn")
          }
        }
        p.stash = stashInv.slots.map((s) => s ?? null) as ItemInstance[]
        break
      }
      case "tobag": {
        const list = p.stash as (ItemInstance | null)[]
        if (!transfer(list, inv, item.uid)) toast("Rucksack ist voll", "warn")
        break
      }
      case "drop":
      case "destroy":
        this.confirmDrop = item.uid
        break
      case "drop-yes":
        if (this.game.expedition) {
          removeByUid(inv, item.uid)
          this.game.expedition.dropItem(item)
          toast(`${displayName(item)} weggeworfen`)
        }
        this.confirmDrop = null
        break
      case "destroy-yes": {
        const idx = p.stash.indexOf(item)
        if (idx >= 0) p.stash[idx] = null as unknown as ItemInstance
        else removeByUid(inv, item.uid)
        this.confirmDrop = null
        break
      }
    }
    if (this.mode === "camp") this.game.saveProfile()
    this.game.ui.refresh(this)
  }

  onTab(dir: number): void {
    // Jump between panels: equipment -> bag -> stash
    const ui = this.game.ui
    const f = ui.focused
    const panels = ["equip-tile", "bag", "stash-tile"]
    const cur = f?.classList.contains("equip-tile") ? 0 : f?.classList.contains("stash-tile") ? 2 : 1
    const next = (cur + dir + 3) % 3
    const sel = next === 0 ? ".equip-tile" : next === 2 ? ".stash-tile" : ".panel.bag .tile"
    const el = document.querySelector<HTMLElement>(`.screen-inventory ${sel}`)
    if (el) el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    void panels
  }

  onBack(): void {
    this.game.ui.pop()
  }

  hints() {
    const camp = this.mode === "camp"
    return [
      { action: "confirm" as const, label: "Ausrüsten / Benutzen" },
      { action: "menuAlt" as const, label: camp ? "Lager ⇄ Rucksack" : "Wegwerfen" },
      { action: "menuAlt2" as const, label: "Schnellzugriff" },
      { action: "tabNext" as const, label: "Bereich" },
      { action: "back" as const, label: "Schließen" },
    ]
  }
}

export class LootScreen implements Screen {
  name = "loot"
  overlay = true
  private selected = 0
  constructor(private game: Pick<GameApi, "ui">, private title: string, private items: ItemInstance[], private onTake: (item: ItemInstance) => boolean, private onClose: () => void) {}
  render(): string {
    const sel = this.items[this.selected] ?? null
    return `<div class="loot-layout"><section class="panel"><h2>${esc(this.title)}</h2>
      <div class="loot-items" data-scroll="loot">${this.items.length ? this.items.map((it, i) => `<div class="loot-row" data-focus data-focus-id="l${i}" data-action="take" data-idx="${i}" data-uid="${it.uid}">${itemTile(it, `lt${i}`, "take")}<span class="lname">${esc(displayName(it))}${it.qty > 1 ? ` ×${it.qty}` : ""}</span></div>`).join("") : `<div class="dim">Leer.</div>`}</div>
      <div class="row">${this.items.length ? `<button class="btn" data-focus data-action="takeall">Alles nehmen</button>` : ""}<button class="btn small" data-focus data-action="close">Schließen</button></div>
    </section><section class="panel detail">${itemDetails(sel)}</section></div>`
  }
  onFocus(el: HTMLElement): void {
    if (el.dataset.idx !== undefined) {
      const i = parseInt(el.dataset.idx, 10)
      if (i !== this.selected) {
        this.selected = i
        this.game.ui.refresh(this)
      }
    }
  }
  onAction(action: string, el: HTMLElement, button: ButtonKind): void {
    if (button === "alt2") action = "takeall"
    if (action === "take") {
      const idx = parseInt(el.dataset.idx ?? el.closest<HTMLElement>("[data-idx]")?.dataset.idx ?? "-1", 10)
      const item = this.items[idx]
      if (item && this.onTake(item)) {
        if (item.qty <= 0) this.items.splice(idx, 1)
        this.selected = Math.min(this.selected, Math.max(0, this.items.length - 1))
      }
      this.game.ui.refresh(this)
      if (!this.items.length) this.close()
    } else if (action === "takeall") {
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.onTake(this.items[i]) && this.items[i].qty <= 0) this.items.splice(i, 1)
      }
      this.game.ui.refresh(this)
      if (!this.items.length) this.close()
    } else if (action === "close") this.close()
  }
  private close(): void {
    this.game.ui.pop()
    this.onClose()
  }
  onBack(): void {
    this.close()
  }
  hints() {
    return [
      { action: "confirm" as const, label: "Nehmen" },
      { action: "menuAlt2" as const, label: "Alles nehmen" },
      { action: "back" as const, label: "Schließen" },
    ]
  }
  onTab(): void {
    /* no tabs */
  }
  // Y takes everything
  onAlt2(): void {
    this.onAction("takeall", document.body, "confirm")
  }
}
