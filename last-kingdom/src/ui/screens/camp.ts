// Camp hub, buildings (upgrade, crafting, repair), merchant, mission board, map overview and skill tree.

import type { GameApi } from "../../game/api"
import type { Screen, ButtonKind } from "../ui"
import { esc, bar } from "../ui"
import { itemDetails, itemTile, missionCard, panel } from "./common"
import { CAMP_BUILDINGS, buildingDef, campBonuses } from "../../meta/campData"
import { ALL_ITEMS, itemDef } from "../../items/itemData"
import { createItem, displayName, itemValue } from "../../items/items"
import { addItem, allItems, countItem, findByUid, removeByUid, removeItem, resizeInventory } from "../../items/inventory"
import { AREAS, areaUnlocked } from "../../world/areas"
import { MASTERY_RANKS, masteryNext, masteryRank, reputationRank, xpForLevel } from "../../meta/progression"
import { BRANCH_NAMES, SKILLS, skillDef } from "../../meta/skillData"
import { buyPrice, sellPrice } from "../../items/merchant"
import { generateBoard, MISSION_KIND_NAMES } from "../../meta/missions"
import { Rng } from "../../core/rng"
import { InventoryScreen } from "./inventory"
import { SettingsScreen, ControlsScreen } from "./menus"
import type { ItemInstance, Profile } from "../../core/types"
import { RARITY_INFO } from "../../core/types"
import { zombieType } from "../../entities/zombieTypes"
import { events } from "../../core/events"
import { ACHIEVEMENTS } from "../../meta/achievements"

const WEAPON_CLASS_NAMES: Record<string, string> = { longsword: "Langschwert", shortsword: "Kurzschwert", greatsword: "Zweihänder", battleaxe: "Streitaxt", mace: "Streitkolben", spear: "Speer", dagger: "Dolch", bow: "Bogen", crossbow: "Armbrust" }

/** Total count of a material in bag + stash. */
function totalOf(p: Profile, id: string): number {
  let n = countItem(p.loadout, id)
  for (const s of p.stash) if (s && s.defId === id) n += s.qty
  return n
}

/** Removes materials from stash first, then bag. */
function consume(p: Profile, id: string, qty: number): void {
  let left = qty
  for (let i = 0; i < p.stash.length && left > 0; i++) {
    const s = p.stash[i]
    if (!s || s.defId !== id) continue
    const take = Math.min(s.qty, left)
    s.qty -= take
    left -= take
    if (s.qty <= 0) p.stash[i] = null as unknown as ItemInstance
  }
  if (left > 0) removeItem(p.loadout, id, left)
}

function giveItem(p: Profile, item: ItemInstance): boolean {
  const left = addItem(p.loadout, item)
  if (left > 0) {
    const stashInv = { slots: p.stash as (ItemInstance | null)[], capacity: campBonuses(p.camp).stashSlots, equipment: {} }
    while (stashInv.slots.length < stashInv.capacity) stashInv.slots.push(null)
    const left2 = addItem(stashInv, item)
    p.stash = stashInv.slots as ItemInstance[]
    return left2 === 0
  }
  return true
}

function costText(p: Profile, cost: Record<string, number>, gold: number): string {
  const parts = Object.entries(cost).filter(([, n]) => n > 0).map(([id, n]) => `<span class="${totalOf(p, id) >= n ? "ok" : "lack"}">${n}× ${itemDef(id).name} (${totalOf(p, id)})</span>`)
  parts.unshift(`<span class="${p.gold >= gold ? "ok" : "lack"}">${gold} Gold</span>`)
  return parts.join(", ")
}

function canAfford(p: Profile, cost: Record<string, number>, gold: number): boolean {
  if (p.gold < gold) return false
  for (const [id, n] of Object.entries(cost)) if (totalOf(p, id) < n) return false
  return true
}

export class CampScreen implements Screen {
  name = "camp"
  constructor(private game: GameApi) {}
  render(): string {
    const p = this.game.profile!
    const rep = reputationRank(p.reputation)
    const completed = p.missions.filter((m) => m.status === "completed").length
    const bonuses = campBonuses(p.camp)
    return `<div class="camp-layout">
      <section class="panel camp-char"><h2>${esc(p.name)}</h2>
        <div class="stat"><span>Stufe ${p.level}</span><b>${p.xp} / ${xpForLevel(p.level)} EP</b></div>${bar(p.xp, xpForLevel(p.level), "xp")}
        <div class="stat"><span>Gold</span><b>${p.gold}</b></div>
        <div class="stat"><span>Fähigkeitspunkte</span><b>${p.skillPoints}</b></div>
        <div class="stat"><span>Ruf beim Händler</span><b>${rep.name} (${p.reputation})</b></div>
        <div class="stat"><span>Extraktionen / Tode</span><b>${p.stats.extractions} / ${p.stats.deaths}</b></div>
        <div class="stat"><span>Versicherte Plätze</span><b>${bonuses.insuredSlots}</b></div>
        <div class="stat"><span>Erfolge</span><b>${(p.achievements ?? []).length} / ${ACHIEVEMENTS.length}</b></div>
        <nav class="menu-list compact">
          <button class="btn big" data-focus data-focus-id="expedition" data-action="map">Expedition planen</button>
          <button class="btn" data-focus data-action="missions">Missionen${completed ? ` <span class="badge">${completed}</span>` : ""}</button>
          <button class="btn" data-focus data-action="inventory">Lager & Ausrüstung</button>
          <button class="btn" data-focus data-action="merchant">Händler${(p.camp.merchant ?? 0) === 0 ? " (Stand nötig)" : ""}</button>
          <button class="btn" data-focus data-action="skills">Fähigkeiten${p.skillPoints ? ` <span class="badge">${p.skillPoints}</span>` : ""}</button>
          <button class="btn small" data-focus data-action="achievements">Erfolge & Statistik</button>
          <button class="btn small" data-focus data-action="settings">Einstellungen</button>
          <button class="btn small" data-focus data-action="controls">Steuerung</button>
          <button class="btn small" data-focus data-action="menu">Hauptmenü</button>
        </nav>
      </section>
      <section class="panel camp-buildings"><h2>Lager</h2><div class="buildings">${CAMP_BUILDINGS.map((b) => {
        const lv = p.camp[b.id] ?? 0
        const next = lv < b.maxLevel ? b.levels[lv] : null
        return `<div class="building" data-focus data-focus-id="b-${b.id}" data-action="building" data-id="${b.id}"><div class="bhead"><b>${b.name}</b><span class="lvl">${"●".repeat(lv)}${"○".repeat(b.maxLevel - lv)}</span></div><div class="dim">${esc(b.description)}</div>${next ? `<div class="bnext">Nächste Stufe: ${esc(next.effect)}</div>` : `<div class="bnext">Vollständig ausgebaut</div>`}</div>`
      }).join("")}</div></section>
    </div>`
  }
  onAction(action: string, el: HTMLElement): void {
    const ui = this.game.ui
    switch (action) {
      case "map":
        ui.push(new MapScreen(this.game))
        break
      case "missions":
        ui.push(new MissionsScreen(this.game))
        break
      case "inventory":
        ui.push(new InventoryScreen(this.game, "camp"))
        break
      case "merchant":
        if ((this.game.profile!.camp.merchant ?? 0) === 0) ui.toast("Baue zuerst den Händlerstand im Lager.", "warn")
        else ui.push(new MerchantScreen(this.game))
        break
      case "skills":
        ui.push(new SkillScreen(this.game))
        break
      case "achievements":
        ui.push(new AchievementsScreen(this.game))
        break
      case "settings":
        ui.push(new SettingsScreen(this.game))
        break
      case "controls":
        ui.push(new ControlsScreen(this.game))
        break
      case "menu":
        this.game.goToMainMenu()
        break
      case "building":
        ui.push(new BuildingScreen(this.game, el.dataset.id!))
        break
    }
  }
  onBack(): void {
    /* hub: stay */
  }
  hints() {
    return [{ action: "confirm" as const, label: "Öffnen" }]
  }
}

export class BuildingScreen implements Screen {
  name = "building"
  overlay = true
  private selectedUid: string | null = null
  private lastRecipe: string | null = null
  constructor(private game: GameApi, private buildingId: string) {}
  render(): string {
    const p = this.game.profile!
    const b = buildingDef(this.buildingId)
    const lv = p.camp[b.id] ?? 0
    const next = lv < b.maxLevel ? b.levels[lv] : null
    const upgrade = next ? `<div class="upgrade"><div>Ausbau auf Stufe ${lv + 1}: ${esc(next.effect)}</div><div class="cost">${costText(p, next.cost, next.gold)}</div><button class="btn ${canAfford(p, next.cost, next.gold) ? "" : "disabled"}" data-focus data-focus-id="upgrade" data-action="upgrade">Ausbauen</button></div>` : `<div class="dim">Vollständig ausgebaut.</div>`
    const recipes = ALL_ITEMS.filter((d) => d.craft && d.craft.building === b.id)
    const craftable = recipes.length && lv > 0 ? `<h3>Herstellen</h3><div class="recipes" data-scroll="recipes">${recipes
      .map((d) => {
        const locked = d.craft!.level > lv
        const ok = !locked && canAfford(p, d.craft!.cost, d.craft!.gold)
        return `<div class="recipe ${locked ? "locked" : ""}" data-focus data-focus-id="r-${d.id}" data-action="craft" data-id="${d.id}"><div class="rhead"><b style="color:${RARITY_INFO[d.rarity].color}">${esc(d.name)}</b>${locked ? `<span class="dim">ab Stufe ${d.craft!.level}</span>` : ""}</div><div class="cost">${costText(p, d.craft!.cost, d.craft!.gold)}</div>${ok ? "" : locked ? "" : `<div class="lack">Fehlendes Material</div>`}</div>`
      })
      .join("")}</div>` : lv === 0 ? `<div class="dim">Erst ausbauen, dann kann hier gearbeitet werden.</div>` : ""
    let service = ""
    if ((b.id === "smithy" || b.id === "workshop") && lv > 0) {
      const gear = [...allItems(p.loadout), ...Object.values(p.loadout.equipment).filter((x): x is ItemInstance => !!x), ...p.stash.filter((x) => !!x)].filter((it) => {
        const def = itemDef(it.defId)
        return b.id === "smithy" ? def.kind === "weapon" || def.kind === "helmet" || (def.kind === "armor" && (def.id.includes("chain") || def.id.includes("plate") || def.id.includes("brig"))) : def.kind === "shield" || def.kind === "armor" || def.id.includes("bow") || def.id.includes("crossbow")
      })
      const maxUp = lv === 1 ? 1 : lv === 2 ? 2 : 3
      service = `<h3>Reparieren und Aufwerten (max. +${maxUp})</h3><div class="gear-list" data-scroll="gear">${gear.length ? gear.map((it) => {
        const repairCost = it.maxDurability ? Math.ceil(((it.maxDurability - (it.durability ?? 0)) / it.maxDurability) * itemValue(it) * 0.25) : 0
        const up = it.upgrade ?? 0
        const upCost = Math.round(itemValue(it) * 0.6 * (up + 1))
        const upMat = up < maxUp ? { steel: up + 1, iron: 2 + up } : null
        return `<div class="gear-row" data-focus data-focus-id="g-${it.uid}" data-action="gearsel" data-uid="${it.uid}">${itemTile(it, `gt-${it.uid}`, "gearsel")}<div class="gear-info"><b style="color:${RARITY_INFO[it.rarity].color}">${esc(displayName(it))}</b><div class="dim">Haltbarkeit ${Math.round(it.durability ?? 0)} / ${it.maxDurability ?? 0}</div></div>
          <button class="btn small ${repairCost > 0 && p.gold >= repairCost ? "" : "disabled"}" data-focus data-focus-id="rep-${it.uid}" data-action="repair" data-uid="${it.uid}">Reparieren (${repairCost} Gold)</button>
          <button class="btn small ${upMat && canAfford(p, upMat, upCost) ? "" : "disabled"}" data-focus data-focus-id="up-${it.uid}" data-action="upgradeitem" data-uid="${it.uid}">${upMat ? `+${up + 1} (${upCost} Gold, ${upMat.steel} Stahl, ${upMat.iron} Eisen)` : "Maximal"}</button></div>`
      }).join("") : `<div class="dim">Keine passende Ausrüstung.</div>`}</div>`
    }
    const sel = this.selectedUid ? this.findItem(this.selectedUid) : null
    return `<div class="building-layout"><section class="panel"><h2>${b.name} · Stufe ${lv}</h2><div class="dim">${esc(b.description)}</div>${upgrade}${craftable}<button class="btn small" data-focus data-action="back">Zurück</button></section><section class="panel">${service || `<h2>Werkbank</h2><div class="dim">${lv === 0 ? "Noch nicht ausgebaut." : "Hier gibt es nichts zu reparieren."}</div>`}</section><section class="panel detail">${sel ? itemDetails(sel) : this.recipeDetail()}</section></div>`
  }
  private recipeDetail(): string {
    const f = this.game.ui.focused
    const id = f?.dataset.id
    if (id && f?.dataset.action === "craft") {
      const def = itemDef(id)
      return itemDetails(createItem(def.id, 1, { uid: "preview" }))
    }
    return `<div class="details empty">Wähle ein Rezept oder einen Gegenstand.</div>`
  }
  private findItem(uid: string): ItemInstance | null {
    const p = this.game.profile!
    return findByUid(p.loadout, uid) ?? p.stash.find((s) => s?.uid === uid) ?? null
  }
  onFocus(el: HTMLElement): void {
    if (el.dataset.uid) {
      if (this.selectedUid !== el.dataset.uid) {
        this.selectedUid = el.dataset.uid
        this.game.ui.refresh(this)
      }
    } else if (el.dataset.action === "craft") {
      // Recipe preview: re-render once so the detail panel follows the focus (guard against refresh loops).
      if (this.selectedUid !== null || this.lastRecipe !== el.dataset.id) {
        this.selectedUid = null
        this.lastRecipe = el.dataset.id ?? null
        this.game.ui.refresh(this)
      }
    }
  }
  onAction(action: string, el: HTMLElement): void {
    const p = this.game.profile!
    const b = buildingDef(this.buildingId)
    const ui = this.game.ui
    switch (action) {
      case "upgrade": {
        const lv = p.camp[b.id] ?? 0
        const next = b.levels[lv]
        if (!next || !canAfford(p, next.cost, next.gold)) {
          ui.toast("Nicht genug Gold oder Material.", "warn")
          return
        }
        p.gold -= next.gold
        for (const [id, n] of Object.entries(next.cost)) consume(p, id, n)
        p.camp[b.id] = lv + 1
        resizeInventory(p.loadout, campBonuses(p.camp).bagSlots)
        this.game.audio.play("upgrade")
        ui.toast(`${b.name} auf Stufe ${lv + 1} ausgebaut!`, "good")
        break
      }
      case "craft": {
        const def = itemDef(el.dataset.id!)
        const lv = p.camp[b.id] ?? 0
        if (def.craft!.level > lv) {
          ui.toast(`Braucht ${b.name} Stufe ${def.craft!.level}.`, "warn")
          return
        }
        if (!canAfford(p, def.craft!.cost, def.craft!.gold)) {
          ui.toast("Nicht genug Gold oder Material.", "warn")
          return
        }
        p.gold -= def.craft!.gold
        for (const [id, n] of Object.entries(def.craft!.cost)) consume(p, id, n)
        const qty = def.kind === "ammo" ? 10 : def.kind === "material" ? 1 : 1
        const item = createItem(def.id, qty)
        if (!giveItem(p, item)) ui.toast("Kein Platz: Gegenstand ging verloren!", "warn")
        this.game.audio.play("craft")
        ui.toast(`${def.name} hergestellt`, "good")
        if (!p.recipes.includes(def.id)) p.recipes.push(def.id)
        break
      }
      case "repair": {
        const it = this.findItem(el.dataset.uid!)
        if (!it || !it.maxDurability) return
        const cost = Math.ceil(((it.maxDurability - (it.durability ?? 0)) / it.maxDurability) * itemValue(it) * 0.25)
        if (cost <= 0 || p.gold < cost) {
          ui.toast(cost <= 0 ? "Nicht beschädigt." : "Nicht genug Gold.", "warn")
          return
        }
        p.gold -= cost
        it.durability = it.maxDurability
        this.game.audio.play("craft")
        ui.toast(`${displayName(it)} repariert`, "good")
        break
      }
      case "upgradeitem": {
        const it = this.findItem(el.dataset.uid!)
        if (!it) return
        const lv = p.camp[b.id] ?? 0
        const maxUp = lv === 1 ? 1 : lv === 2 ? 2 : 3
        const up = it.upgrade ?? 0
        if (up >= maxUp) {
          ui.toast("Weitere Aufwertung braucht eine höhere Gebäudestufe.", "warn")
          return
        }
        const upCost = Math.round(itemValue(it) * 0.6 * (up + 1))
        const mat = { steel: up + 1, iron: 2 + up }
        if (!canAfford(p, mat, upCost)) {
          ui.toast("Nicht genug Gold, Stahl oder Eisen.", "warn")
          return
        }
        p.gold -= upCost
        for (const [id, n] of Object.entries(mat)) consume(p, id, n)
        it.upgrade = up + 1
        if (it.maxDurability) {
          it.maxDurability = Math.round(it.maxDurability * 1.1)
          it.durability = it.maxDurability
        }
        this.game.audio.play("upgrade")
        ui.toast(`${displayName(it)} aufgewertet`, "good")
        break
      }
      case "gearsel":
        this.selectedUid = el.dataset.uid ?? null
        break
      case "back":
        ui.pop()
        return
    }
    this.game.saveProfile()
    ui.refresh(this)
  }
  onBack(): void {
    this.game.ui.pop()
  }
}

export class MerchantScreen implements Screen {
  name = "merchant"
  overlay = true
  private tab: "buy" | "sell" = "buy"
  private selectedUid: string | null = null
  constructor(private game: GameApi) {}
  render(): string {
    const p = this.game.profile!
    const stock = this.game.merchantStock()
    const rep = reputationRank(p.reputation)
    const sellables = [...allItems(p.loadout), ...p.stash.filter((x) => !!x)].filter((it) => itemDef(it.defId).kind !== "quest")
    const list = this.tab === "buy" ? stock.items : sellables
    const sel = this.selectedUid ? list.find((i) => i.uid === this.selectedUid) ?? null : null
    const rows = list.length ? list.map((it) => {
      const price = this.tab === "buy" ? buyPrice(p, it) : sellPrice(p, it, 1)
      return `<div class="shop-row ${this.tab === "buy" && p.gold < price ? "lack" : ""}" data-focus data-focus-id="s-${it.uid}" data-action="${this.tab}" data-uid="${it.uid}">${itemTile(it, `st-${it.uid}`, this.tab)}<span class="lname" style="color:${RARITY_INFO[it.rarity].color}">${esc(displayName(it))}${it.qty > 1 ? ` ×${it.qty}` : ""}</span><b>${price} Gold${it.qty > 1 ? " / Stück" : ""}</b></div>`
    }).join("") : `<div class="dim">Nichts da.</div>`
    return `<div class="shop-layout"><section class="panel"><h2>Händler · ${p.gold} Gold · Ruf: ${rep.name} (${Math.round(rep.discount * 100)} % Rabatt)</h2>
      <div class="tabs"><button class="tab ${this.tab === "buy" ? "active" : ""}" data-focus data-action="tab-buy">Kaufen</button><button class="tab ${this.tab === "sell" ? "active" : ""}" data-focus data-action="tab-sell">Verkaufen (${Math.round(campBonuses(p.camp).sellRate * 100)} % des Werts)</button><button class="btn small" data-focus data-action="refresh">Neue Ware (${Math.max(0, Math.round((stock.refreshAt - Date.now()) / 60000))} min)</button></div>
      <div class="shop-list" data-scroll="shop">${rows}</div>
      <button class="btn small" data-focus data-action="back">Zurück</button></section>
      <section class="panel detail">${itemDetails(sel, null, sel ? (this.tab === "buy" ? { buyPrice: buyPrice(p, sel) } : { sellPrice: sellPrice(p, sel, 1) }) : {})}${sel && this.tab === "sell" && sel.qty > 1 ? `<button class="btn small" data-focus data-action="sellall" data-uid="${sel.uid}">Alle ${sel.qty} verkaufen (${sellPrice(p, sel)} Gold)</button>` : ""}</section></div>`
  }
  onFocus(el: HTMLElement): void {
    if (el.dataset.uid && el.dataset.uid !== this.selectedUid) {
      this.selectedUid = el.dataset.uid
      this.game.ui.refresh(this)
    }
  }
  onTab(dir: number): void {
    this.tab = dir > 0 ? "sell" : "buy"
    this.game.ui.refresh(this)
  }
  onAction(action: string, el: HTMLElement, button: ButtonKind): void {
    const p = this.game.profile!
    const ui = this.game.ui
    const stock = this.game.merchantStock()
    switch (action) {
      case "tab-buy":
        this.tab = "buy"
        break
      case "tab-sell":
        this.tab = "sell"
        break
      case "refresh":
        if (Date.now() >= stock.refreshAt) this.game.refreshMerchant()
        else if (p.gold >= 50) {
          p.gold -= 50
          this.game.refreshMerchant()
          ui.toast("Neue Ware für 50 Gold.", "info")
        } else ui.toast("Neue Ware kostet 50 Gold, oder warte.", "warn")
        break
      case "buy": {
        const it = stock.items.find((i) => i.uid === el.dataset.uid)
        if (!it) return
        const price = buyPrice(p, it)
        const qty = button === "alt2" ? Math.min(it.qty, Math.floor(p.gold / price)) : 1
        if (qty < 1 || p.gold < price) {
          ui.toast("Nicht genug Gold.", "warn")
          return
        }
        const give = createItem(it.defId, qty, { rarity: it.rarity, affixes: [...it.affixes] })
        if (it.durability !== undefined) {
          give.durability = it.durability
          give.maxDurability = it.maxDurability
        }
        if (addItem(p.loadout, give) > 0) {
          ui.toast("Rucksack ist voll.", "warn")
          return
        }
        p.gold -= price * qty
        it.qty -= qty
        if (it.qty <= 0) stock.items.splice(stock.items.indexOf(it), 1)
        p.reputation += Math.max(1, Math.round(price / 20))
        this.game.audio.play("coin")
        ui.toast(`${displayName(give)} gekauft`, "good")
        break
      }
      case "sell":
      case "sellall": {
        const it = findByUid(p.loadout, el.dataset.uid!) ?? p.stash.find((s) => s?.uid === el.dataset.uid) ?? null
        if (!it) return
        const qty = action === "sellall" || button === "alt2" ? it.qty : 1
        const gold = sellPrice(p, it, qty)
        p.gold += gold
        p.stats.goldEarned += gold
        p.reputation += Math.max(1, Math.round(gold / 30))
        it.qty -= qty
        if (it.qty <= 0) {
          const idx = p.stash.indexOf(it)
          if (idx >= 0) p.stash[idx] = null as unknown as ItemInstance
          else removeByUid(p.loadout, it.uid)
        }
        this.game.audio.play("coin")
        ui.toast(`Verkauft für ${gold} Gold`, "good")
        break
      }
      case "back":
        ui.pop()
        return
    }
    this.game.saveProfile()
    ui.refresh(this)
  }
  onBack(): void {
    this.game.ui.pop()
  }
  hints() {
    return [
      { action: "confirm" as const, label: this.tab === "buy" ? "Kaufen" : "Verkaufen" },
      { action: "menuAlt2" as const, label: "Alle" },
      { action: "tabNext" as const, label: "Reiter" },
      { action: "back" as const, label: "Zurück" },
    ]
  }
}

export class MissionsScreen implements Screen {
  name = "missions"
  overlay = true
  constructor(private game: GameApi) {}
  render(): string {
    const p = this.game.profile!
    if (Date.now() > p.missionRefreshAt || p.missions.filter((m) => m.status === "offered").length === 0) this.refreshOffers()
    const active = p.missions.filter((m) => m.status === "active")
    const completed = p.missions.filter((m) => m.status === "completed")
    const offers = p.missions.filter((m) => m.status === "offered")
    return `<div class="missions-layout" data-scroll="missions">
      ${panel(`Abgeschlossen (${completed.length})`, completed.length ? completed.map((m) => missionCard(m, "turnin", `<div class="mhint">Belohnung abholen</div>`)).join("") : `<div class="dim">Nichts abzugeben.</div>`)}
      ${panel(`Aktiv (${active.length} / 3)`, active.length ? active.map((m) => missionCard(m, "abandon", `<div class="mhint">Gebiet: ${esc(AREAS.find((a) => a.id === m.areaId)!.name)} · abbrechen mit Bestätigen</div>`)).join("") : `<div class="dim">Keine aktive Mission. Nimm unten eine an.</div>`)}
      ${panel(`Angebote (neu in ${Math.max(0, Math.round((p.missionRefreshAt - Date.now()) / 60000))} min)`, offers.map((m) => missionCard(m, "accept", `<div class="mhint">Gebiet: ${esc(AREAS.find((a) => a.id === m.areaId)!.name)}</div>`)).join("") + `<button class="btn small" data-focus data-action="reroll">Neue Angebote (30 Gold)</button>`)}
    </div><button class="btn" data-focus data-action="back">Zurück</button>`
  }
  private refreshOffers(): void {
    const p = this.game.profile!
    p.missions = p.missions.filter((m) => m.status !== "offered")
    const board = generateBoard(new Rng(Date.now() & 0xffffff), p.unlockedAreas, p.level, 6)
    p.missions.push(...board)
    p.missionRefreshAt = Date.now() + 30 * 60 * 1000
    this.game.saveProfile()
  }
  onAction(action: string, el: HTMLElement): void {
    const p = this.game.profile!
    const ui = this.game.ui
    const m = p.missions.find((x) => x.id === el.dataset.id)
    switch (action) {
      case "accept":
        if (!m) return
        if (p.missions.filter((x) => x.status === "active").length >= 3) {
          ui.toast("Höchstens 3 aktive Missionen.", "warn")
          return
        }
        m.status = "active"
        ui.toast(`Mission angenommen: ${m.title}`, "good")
        break
      case "abandon":
        if (!m) return
        m.status = "offered"
        m.progress = 0
        ui.toast("Mission abgebrochen.")
        break
      case "turnin": {
        if (!m) return
        m.status = "turnedIn"
        p.gold += m.reward.gold
        p.stats.goldEarned += m.reward.gold
        p.reputation += m.reward.reputation
        p.missionsCompleted++
        for (const it of m.reward.items ?? []) giveItem(p, createItem(it.id, it.qty))
        const gained = (await_xp(p, m.reward.xp))
        this.game.audio.play("mission_done")
        ui.toast(`Belohnung: ${m.reward.gold} Gold, ${m.reward.xp} EP${gained ? `, Stufe ${p.level}!` : ""}`, "good")
        p.missions = p.missions.filter((x) => x.status !== "turnedIn")
        if (m.kind === "bossHunt" && m.targetId) {
          const bossArea = AREAS.find((a) => a.bossId === m.targetId)
          if (bossArea && !p.clearedBosses.includes(bossArea.id)) p.clearedBosses.push(bossArea.id)
        }
        break
      }
      case "reroll":
        if (p.gold < 30) {
          ui.toast("Nicht genug Gold.", "warn")
          return
        }
        p.gold -= 30
        this.refreshOffers()
        break
      case "back":
        ui.pop()
        return
    }
    this.game.saveProfile()
    ui.refresh(this)
  }
  onBack(): void {
    this.game.ui.pop()
  }
  hints() {
    return [
      { action: "confirm" as const, label: "Annehmen / Abgeben" },
      { action: "back" as const, label: "Zurück" },
    ]
  }
}

function await_xp(p: Profile, xp: number): number {
  // Local import avoided for cyclic reasons: progression is pure.
  let gained = 0
  p.xp += xp
  while (p.level < 40 && p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level)
    p.level++
    p.skillPoints++
    gained++
  }
  if (gained) events.emit("levelUp", { level: p.level })
  return gained
}

export class MapScreen implements Screen {
  name = "map"
  overlay = true
  private selected: string
  private confirm = false
  private night = false
  constructor(private game: GameApi) {
    const p = game.profile!
    this.selected = p.unlockedAreas[p.unlockedAreas.length - 1] ?? "village"
  }
  render(): string {
    const p = this.game.profile!
    const area = AREAS.find((a) => a.id === this.selected)!
    const unlocked = areaUnlocked(area, p.level, p.unlockedAreas)
    const boss = area.bossId ? zombieType(area.bossId) : null
    const activeHere = p.missions.filter((m) => m.status === "active" && m.areaId === area.id)
    const bag = allItems(p.loadout).length
    return `<div class="map-layout"><section class="panel area-list"><h2>Gebiete</h2>${AREAS.map((a) => {
      const ok = areaUnlocked(a, p.level, p.unlockedAreas)
      return `<div class="area ${this.selected === a.id ? "selected" : ""} ${ok ? "" : "locked"}" data-focus data-focus-id="a-${a.id}" data-action="select" data-id="${a.id}"><b>${esc(a.name)}</b><div class="dim">${"☠".repeat(a.danger)} ${ok ? "" : `· ab Stufe ${a.unlockLevel}${a.unlockAfter ? ", nach " + AREAS.find((x) => x.id === a.unlockAfter)!.name : ""}`}</div></div>`
    }).join("")}</section>
    <section class="panel area-detail"><h2>${esc(area.name)} <small>${esc(area.subtitle)}</small></h2>
      <p>${esc(area.description)}</p>
      <div class="stat"><span>Gefahr</span><b>${"☠".repeat(area.danger)} (${area.danger} / 6)</b></div>
      <div class="stat"><span>Gegner</span><b>${area.enemies.map((e) => zombieType(e.typeId).name).join(", ")}</b></div>
      ${boss ? `<div class="stat"><span>Boss</span><b>${boss.name}, ${boss.bossTitle}</b></div>` : ""}
      <div class="stat"><span>Extraktionspunkte</span><b>${area.extractions.map((e) => `${e.name}${e.activation ? " (" + e.activation.label + ")" : ""}`).join(" · ")}</b></div>
      <div class="stat"><span>Geheimnisse</span><b>${area.secrets.join(" · ")}</b></div>
      <div class="stat"><span>Gefahren</span><b>${area.hazards.join(" · ")}</b></div>
      ${activeHere.length ? `<div class="stat"><span>Aktive Missionen hier</span><b>${activeHere.map((m) => esc(m.title)).join(", ")}</b></div>` : `<div class="dim">Keine aktive Mission in diesem Gebiet (optional).</div>`}
      <div class="dim">Du nimmst mit: ${bag} Gegenstände im Rucksack und deine Ausrüstung. Was du nicht verlieren willst, lass im Lager.</div>
      ${p.clearedBosses.includes(area.id) ? `<div class="row"><button class="btn small ${this.night ? "" : "selected"}" data-focus data-focus-id="day" data-action="day">Tag-Expedition</button><button class="btn small ${this.night ? "selected" : ""}" data-focus data-focus-id="night" data-action="night">Nacht-Expedition (mehr Untote, bessere Beute, +40 % EP)</button></div>` : `<div class="dim">Nach dem Sieg über den Boss werden hier Nacht-Expeditionen freigeschaltet.</div>`}
      ${unlocked ? (this.confirm ? `<div class="row"><button class="btn big" data-focus data-focus-id="go" data-action="go">Aufbrechen nach ${esc(area.name)}${this.night ? " (Nacht)" : ""}</button><button class="btn" data-focus data-action="cancel">Noch nicht</button></div>` : `<button class="btn big" data-focus data-focus-id="start" data-action="start">Expedition starten</button>`) : `<div class="lack">Noch gesperrt: Stufe ${area.unlockLevel}${area.unlockAfter && !p.unlockedAreas.includes(area.id) ? ` und eine erfolgreiche Extraktion aus „${AREAS.find((x) => x.id === area.unlockAfter)!.name}“` : ""} nötig.</div>`}
      <button class="btn small" data-focus data-action="back">Zurück</button>
    </section></div>`
  }
  onAction(action: string, el: HTMLElement): void {
    const p = this.game.profile!
    switch (action) {
      case "select":
        this.selected = el.dataset.id!
        this.confirm = false
        this.game.ui.refresh(this)
        break
      case "start":
        this.confirm = true
        this.game.ui.refresh(this)
        break
      case "cancel":
        this.confirm = false
        this.game.ui.refresh(this)
        break
      case "go":
        this.game.startExpedition(this.selected, this.night && p.clearedBosses.includes(this.selected))
        break
      case "day":
        this.night = false
        this.game.ui.refresh(this)
        break
      case "night":
        this.night = true
        this.game.ui.refresh(this)
        break
      case "back":
        this.game.ui.pop()
        break
    }
  }
  onFocus(el: HTMLElement): void {
    if (el.dataset.action === "select" && el.dataset.id !== this.selected) {
      this.selected = el.dataset.id!
      this.confirm = false
      this.game.ui.refresh(this)
    }
  }
  onBack(): void {
    this.game.ui.pop()
  }
}

export class SkillScreen implements Screen {
  name = "skills"
  overlay = true
  constructor(private game: GameApi) {}
  render(): string {
    const p = this.game.profile!
    const branches = ["warrior", "ranger", "survivor"] as const
    const mastery = Object.entries(p.mastery).sort((a, b) => b[1] - a[1])
    return `<h1>Fähigkeiten · ${p.skillPoints} Punkt${p.skillPoints === 1 ? "" : "e"} frei</h1>
    <div class="skill-tree">${branches.map((b) => `<div class="branch"><h3>${BRANCH_NAMES[b]}</h3>${SKILLS.filter((s) => s.branch === b).map((s) => {
      const learned = p.skills.includes(s.id)
      const reqOk = !s.requires || p.skills.includes(s.requires)
      const can = !learned && reqOk && p.skillPoints >= s.cost
      return `<div class="skill ${learned ? "learned" : can ? "available" : "locked"}" data-focus data-focus-id="sk-${s.id}" data-action="learn" data-id="${s.id}"><b>${esc(s.name)}</b><span class="cost">${learned ? "✓" : `${s.cost} P`}</span><div class="dim">${esc(s.description)}</div></div>`
    }).join("")}</div>`).join("")}</div>
    <section class="panel"><h2>Waffenbeherrschung</h2>${mastery.length ? mastery.map(([cls, xp]) => {
      const rank = masteryRank(xp)
      const next = masteryNext(xp)
      return `<div class="stat"><span>${WEAPON_CLASS_NAMES[cls] ?? cls}</span><b>${MASTERY_RANKS[rank]} (+${rank * 5} % Schaden)${next ? ` · ${xp} / ${next}` : ""}</b></div>`
    }).join("") : `<div class="dim">Noch keine Treffer gelandet. Jede Waffengattung steigt mit Treffern auf.</div>`}</section>
    <button class="btn" data-focus data-action="back">Zurück</button>`
  }
  onAction(action: string, el: HTMLElement): void {
    const p = this.game.profile!
    if (action === "learn") {
      const s = skillDef(el.dataset.id!)
      if (p.skills.includes(s.id)) return
      if (s.requires && !p.skills.includes(s.requires)) {
        this.game.ui.toast(`Braucht zuerst „${skillDef(s.requires).name}“.`, "warn")
        return
      }
      if (p.skillPoints < s.cost) {
        this.game.ui.toast("Nicht genug Fähigkeitspunkte.", "warn")
        return
      }
      p.skillPoints -= s.cost
      p.skills.push(s.id)
      this.game.audio.play("level_up")
      this.game.ui.toast(`${s.name} gelernt!`, "good")
      this.game.saveProfile()
      this.game.ui.refresh(this)
    } else if (action === "back") this.game.ui.pop()
  }
  onBack(): void {
    this.game.ui.pop()
  }
}

export { MISSION_KIND_NAMES }

export class AchievementsScreen implements Screen {
  name = "achievements"
  overlay = true
  constructor(private game: GameApi) {}
  render(): string {
    const p = this.game.profile!
    const done = p.achievements ?? []
    const st = p.stats
    return `<div class="ach-layout"><section class="panel"><h2>Erfolge (${done.length} / ${ACHIEVEMENTS.length})</h2><div class="ach-list" data-scroll="ach">${ACHIEVEMENTS.map((a) => `<div class="ach ${done.includes(a.id) ? "done" : ""}" data-focus data-focus-id="a-${a.id}" data-action="noop"><b>${done.includes(a.id) ? "✓ " : ""}${esc(a.name)}</b><div class="dim">${esc(a.description)}</div></div>`).join("")}</div></section>
      <section class="panel"><h2>Statistik</h2>
        <div class="stat"><span>Expeditionen</span><b>${st.expeditions}</b></div>
        <div class="stat"><span>Extraktionen</span><b>${st.extractions}${st.nightExtractions ? ` (davon ${st.nightExtractions} bei Nacht)` : ""}</b></div>
        <div class="stat"><span>Tode</span><b>${st.deaths}</b></div>
        <div class="stat"><span>Gegner erledigt</span><b>${st.kills}</b></div>
        <div class="stat"><span>Bosse besiegt</span><b>${st.bossKills}</b></div>
        <div class="stat"><span>Gold verdient</span><b>${st.goldEarned}</b></div>
        <div class="stat"><span>Beste Beute</span><b>${RARITY_INFO[st.bestLoot].name}</b></div>
        <div class="stat"><span>Missionen abgeschlossen</span><b>${p.missionsCompleted}</b></div>
        <div class="stat"><span>Spielzeit</span><b>${Math.floor(st.playSeconds / 3600)} h ${Math.floor((st.playSeconds % 3600) / 60)} min</b></div>
        <div class="stat"><span>Besiegte Boss-Gebiete</span><b>${p.clearedBosses.length} / ${AREAS.length}</b></div>
        <button class="btn" data-focus data-action="back">Zurück</button>
      </section></div>`
  }
  onAction(action: string): void {
    if (action === "back") this.game.ui.pop()
  }
  onBack(): void {
    this.game.ui.pop()
  }
}
