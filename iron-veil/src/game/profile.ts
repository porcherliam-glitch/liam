/**
 * profile.ts — the company (meta game): stash, trader, loadout and packing, attachments, base structures, staff,
 * production, crafting, research, radio contracts, base threat, and raid bookkeeping (what is carried in, what
 * comes back, what is lost). Pure logic on the Profile object; persistence through storage.ts. Unit-tested.
 */
import { newAchievements, type Achievement } from "./achievements"
import { Bag, type BagSlot } from "./bag"
import { BASE_ATTACK, CONTRACT_TEMPLATES, PRODUCTION, RECIPES, RESEARCH, STAFF_JOBS, STRUCTURES, defenseRating, secureSlots, staffCap, type Cost, type ResearchId, type StaffJob, type StructureId } from "./baseData"
import { DIFFICULTY } from "./data"
import { INFECTED, type InfectedKind } from "./infectedData"
import { BACKPACKS, ITEMS, sellPrice, weaponItem, type GearId, type ItemId } from "./items"
import { saveProfile } from "./storage"
import type { ActiveContract, BackpackId, ContractOffer, Difficulty, Profile, ProfileStats } from "./types"
import { AMMO_FOR, ATTACHMENTS, canAttach, WEAPONS, type AmmoId, type AttachmentId, type AttachmentSlot, type WeaponId, type WeaponMods } from "./weaponData"
import { xpForLevel } from "./data"

/** Offline progress is capped at this many seconds. */
export const OFFLINE_CAP = 7200
export interface ActionResult { ok: boolean; message: string }
const ok = (message: string): ActionResult => ({ ok: true, message })
const fail = (message: string): ActionResult => ({ ok: false, message })

export const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[]
export const STAFF_IDS = Object.keys(STAFF_JOBS) as StaffJob[]

export function emptyStats(): ProfileStats { return { raids: 0, extracts: 0, deaths: 0, kills: 0, infectedKills: 0, mercKills: 0, headshots: 0, dismembered: 0, earned: 0, bestRaid: 0, contracts: 0, defenses: 0, rescued: 0, bossKills: 0 } }

export function createProfile(now = Date.now()): Profile {
  const structures = Object.fromEntries(STRUCTURE_IDS.map(id => [id, 0])) as Record<StructureId, number>
  structures.hq = 1
  return {
    version: 4, callsign: "VEIL-01", money: 2400, xp: 0, level: 1,
    stash: { ammo_556: 150, ammo_9mm: 75, bandage: 3, medkit: 1, canned: 2, water: 2, grenade: 1, scrap: 12, wood: 14, cloth: 6 },
    loadout: {
      primary: "mk4", primaryMods: {}, primaryAmmo: "ammo_556", secondary: "p9", secondaryMods: {}, secondaryAmmo: "ammo_9mm", melee: "knife", armor: 55, armorMax: 55, helmet: 0, nvg: false, backpack: "pack_small",
      // a starter kit is already packed so the first raid works without visiting the stash
      bag: [{ id: "ammo_556", qty: 60 }, { id: "ammo_556", qty: 30 }, { id: "ammo_9mm", qty: 30 }, { id: "bandage", qty: 2 }, { id: "water", qty: 1 }, { id: "canned", qty: 1 }], secure: [],
    },
    structures, staff: Object.fromEntries(STAFF_IDS.map(id => [id, 0])) as Record<StaffJob, number>,
    production: { workshop: 0, clinic: 0, kitchen: 0 }, workshopAmmo: "ammo_9mm", crafting: [],
    research: [], activeResearch: null,
    contracts: { offers: [], active: [], refreshAt: 0 },
    base: { threat: 10, attackPending: false, lastAttack: now },
    infection: 0, raidStarted: 0, raidSecure: [], emergencyCooldown: 0, residents: 0,
    stats: emptyStats(), achievements: [], tutorialDone: false, lastTick: now,
  }
}

/** What the operator carries into a raid. Weapons and gear are removed from the profile until the raid ends. */
export interface RaidKit {
  primary: WeaponId | null; primaryMods: WeaponMods; primaryAmmo: AmmoId | null
  secondary: WeaponId | null; secondaryMods: WeaponMods; secondaryAmmo: AmmoId | null
  melee: WeaponId
  armor: number; armorMax: number; helmet: number
  nvg: boolean
  backpack: BackpackId
  bag: BagSlot[]
  secure: BagSlot[]
  secureSlots: number
  infection: number
  /** Raid-time rounds already in the magazines are part of bag ammo at the start (loaded from it). */
}

/** State of the kit at the end of a raid. */
export interface RaidReturn {
  armor: number
  helmet: number
  bag: BagSlot[]
  secure: BagSlot[]
  /** Rounds left in the magazines (go back into the stash on success). */
  loaded: Partial<Record<AmmoId, number>>
  infection: number
}

export interface RaidStats {
  kills: number; infectedKills: number; mercKills: number; headshots: number; dismembered: number
  killsByKind: Record<string, number>
  /** District ids visited and objective anchors activated. */
  visited: string[]
  activated: string[]
  bossKilled: boolean
}

export interface RaidSettlement { xp: number; levelUp: boolean; value: number; lost: BagSlot[]; returned: BagSlot[]; contractUpdates: { title: string; progress: number; target: number; done: boolean }[] }

export class Company {
  constructor(public profile: Profile) {}

  save(): boolean { return saveProfile(this.profile) }

  /** Stores every achievement earned since the last call and returns those new ones (for a toast). */
  unlockAchievements(): Achievement[] {
    const fresh = newAchievements(this.profile)
    if (fresh.length) { this.profile.achievements.push(...fresh.map(a => a.id)); this.save() }
    return fresh
  }
  has(id: ResearchId): boolean { return this.profile.research.includes(id) }
  level(id: StructureId): number { return this.profile.structures[id] }

  // ───────────── stash ─────────────
  count(id: ItemId): number { return this.profile.stash[id] ?? 0 }
  addItem(id: ItemId, qty: number): void { if (qty <= 0) return; this.profile.stash[id] = (this.profile.stash[id] ?? 0) + qty }
  takeItem(id: ItemId, qty: number): number {
    const n = Math.min(qty, this.count(id)); if (n <= 0) return 0
    const left = this.count(id) - n
    if (left > 0) this.profile.stash[id] = left; else delete this.profile.stash[id]
    return n
  }
  hasItems(items: Partial<Record<ItemId, number>>): boolean { return (Object.entries(items) as [ItemId, number][]).every(([id, n]) => this.count(id) >= n) }
  canAfford(cost: Cost): boolean { return this.profile.money >= cost.money && this.hasItems(cost.items) }
  private pay(cost: Cost): void { this.profile.money -= cost.money; for (const [id, n] of Object.entries(cost.items) as [ItemId, number][]) this.takeItem(id, n) }
  describeCost(cost: Cost): string {
    const parts = cost.money ? [`${cost.money.toLocaleString("de-DE")} $`] : []
    for (const [id, n] of Object.entries(cost.items) as [ItemId, number][]) parts.push(`${n}× ${ITEMS[id].name}`)
    return parts.join(" · ") || "kostenlos"
  }

  // ───────────── time-based progress ─────────────
  /** Advances production, crafting, research, contract offers and base threat to `now`; returns German notes. */
  tick(now = Date.now(), rng: () => number = Math.random): string[] {
    const p = this.profile
    const elapsed = Math.min(OFFLINE_CAP, Math.max(0, (now - p.lastTick) / 1000))
    const notes: string[] = []
    const powered = p.structures.generator >= 2 ? 1.25 : 1
    const produce = (key: "workshop" | "clinic" | "kitchen", out: () => { id: ItemId; qty: number }) => {
      const staff = p.staff[key as StaffJob] ?? 0, lvl = p.structures[key]
      if (!staff || !lvl) return
      p.production[key] += elapsed / 3600 * PRODUCTION[key].perHour * staff * (0.6 + lvl * 0.4) * powered
      let made = 0
      while (p.production[key] >= 1 && made < 10000) {
        const o = out(); if (p.production[key] < o.qty && key === "workshop") break
        p.production[key] -= key === "workshop" ? o.qty : 1
        this.addItem(o.id, o.qty); made += o.qty
      }
      if (made > 0) notes.push(`${STRUCTURES[key].name}: ${made}× ${ITEMS[out().id].name}`)
    }
    produce("workshop", () => ({ id: p.workshopAmmo, qty: 10 }))
    produce("clinic", () => ({ id: p.structures.clinic >= 2 && rng() < 0.35 ? "medkit" : "bandage", qty: 1 }))
    produce("kitchen", () => ({ id: p.structures.kitchen >= 2 && rng() < 0.5 ? "canned" : "water", qty: 1 }))
    for (const job of [...p.crafting]) if (now >= job.endsAt) {
      const recipe = RECIPES.find(r => r.id === job.recipe)
      if (recipe) { this.addItem(recipe.output, recipe.qty); notes.push(`Fertig: ${recipe.qty}× ${ITEMS[recipe.output].name}`) }
      p.crafting.splice(p.crafting.indexOf(job), 1)
    }
    if (p.activeResearch && now >= p.activeResearch.endsAt) {
      const id = p.activeResearch.id
      if (!p.research.includes(id)) p.research.push(id)
      notes.push(`Forschung abgeschlossen: ${RESEARCH[id].name}`)
      p.activeResearch = null
    }
    // the clinic treats infection between raids
    if (p.infection > 0 && p.structures.clinic >= 2) p.infection = Math.max(0, p.infection - elapsed / 60 * 10)
    // threat grows over time; an attack becomes due at the threshold
    p.base.threat = Math.min(100, p.base.threat + elapsed / 3600 * BASE_ATTACK.threatPerHour)
    if (p.base.threat >= BASE_ATTACK.threshold && !p.base.attackPending && p.raidStarted === 0) { p.base.attackPending = true; notes.push("Infizierte sammeln sich vor der Basis!") }
    if (now >= p.contracts.refreshAt || p.contracts.offers.length === 0) { this.refreshOffers(rng); p.contracts.refreshAt = now + 30 * 60 * 1000 }
    p.lastTick = now
    if (notes.length) this.save()
    return notes
  }

  // ───────────── trader ─────────────
  buy(id: ItemId, qty = 1): ActionResult {
    const item = ITEMS[id]
    if (!item.trader) return fail("Dieser Artikel ist beim Händler nicht erhältlich")
    if (this.profile.level < item.trader) return fail(`Ab Level ${item.trader} erhältlich`)
    const cost = Math.round(item.value * qty)
    if (this.profile.money < cost) return fail("Nicht genügend Geld")
    this.profile.money -= cost; this.addItem(id, qty); this.save()
    return ok(`${qty}× ${item.name} gekauft`)
  }

  buyWeapon(id: WeaponId): ActionResult {
    const w = WEAPONS[id]
    if (this.profile.level < w.minLevel) return fail(`Ab Level ${w.minLevel} erhältlich`)
    if (this.profile.money < w.price) return fail("Nicht genügend Geld")
    this.profile.money -= w.price; this.addItem(weaponItem(id), 1); this.save()
    return ok(`${w.name} gekauft`)
  }

  sellPrice(id: ItemId): number { return sellPrice(id, this.has("broker")) }

  sell(id: ItemId, qty: number): ActionResult {
    const n = this.takeItem(id, qty)
    if (n <= 0) return fail("Keine verkaufbare Menge")
    const value = this.sellPrice(id) * n
    this.profile.money += value; this.profile.stats.earned += value; this.save()
    return ok(`${n}× ${ITEMS[id].name} für ${value.toLocaleString("de-DE")} $ verkauft`)
  }

  /** Sells all valuables (cat "valuable"). */
  sellValuables(): ActionResult {
    let total = 0
    for (const id of Object.keys(this.profile.stash) as ItemId[]) {
      if (ITEMS[id]?.cat !== "valuable") continue
      const n = this.takeItem(id, this.count(id)); total += this.sellPrice(id) * n
    }
    if (total <= 0) return fail("Keine Wertsachen im Lager")
    this.profile.money += total; this.profile.stats.earned += total; this.save()
    return ok(`Wertsachen für ${total.toLocaleString("de-DE")} $ verkauft`)
  }

  // ───────────── loadout ─────────────
  /** Equips a weapon from the stash into its slot; the previous one (and its attachments) go back to the stash. */
  equipWeapon(id: WeaponId): ActionResult {
    const w = WEAPONS[id], lo = this.profile.loadout
    if (this.count(weaponItem(id)) <= 0) return fail("Waffe nicht im Lager")
    if (w.slot === "melee") {
      if (lo.melee !== "knife") this.addItem(weaponItem(lo.melee), 1)
      if (id !== "knife") this.takeItem(weaponItem(id), 1)
      lo.melee = id
    } else {
      this.unequipWeapon(w.slot)
      this.takeItem(weaponItem(id), 1)
      const ammo = w.caliber ? AMMO_FOR[w.caliber][0] : null
      if (w.slot === "primary") { lo.primary = id; lo.primaryMods = {}; lo.primaryAmmo = ammo } else { lo.secondary = id; lo.secondaryMods = {}; lo.secondaryAmmo = ammo }
    }
    this.save(); return ok(`${w.name} ausgerüstet`)
  }

  unequipWeapon(slot: "primary" | "secondary" | "melee"): ActionResult {
    const lo = this.profile.loadout
    if (slot === "melee") { if (lo.melee === "knife") return fail("Das Messer bleibt immer dabei"); this.addItem(weaponItem(lo.melee), 1); lo.melee = "knife"; this.save(); return ok("Nahkampfwaffe abgelegt") }
    const id = slot === "primary" ? lo.primary : lo.secondary
    if (!id) return fail("Kein Gegenstand im Platz")
    const mods = slot === "primary" ? lo.primaryMods : lo.secondaryMods
    for (const att of Object.values(mods)) if (att) this.addItem(att, 1)
    this.addItem(weaponItem(id), 1)
    if (slot === "primary") { lo.primary = null; lo.primaryMods = {}; lo.primaryAmmo = null } else { lo.secondary = null; lo.secondaryMods = {}; lo.secondaryAmmo = null }
    this.save(); return ok(`${WEAPONS[id].name} ins Lager gelegt`)
  }

  setAmmo(slot: "primary" | "secondary", ammo: AmmoId): ActionResult {
    const lo = this.profile.loadout, id = slot === "primary" ? lo.primary : lo.secondary
    if (!id || !WEAPONS[id].caliber || !AMMO_FOR[WEAPONS[id].caliber!].includes(ammo)) return fail("Passt nicht zur Waffe")
    if (slot === "primary") lo.primaryAmmo = ammo; else lo.secondaryAmmo = ammo
    this.save(); return ok(`${ITEMS[ammo].name} gewählt`)
  }

  installAttachment(slot: "primary" | "secondary", att: AttachmentId): ActionResult {
    const lo = this.profile.loadout, id = slot === "primary" ? lo.primary : lo.secondary
    if (!id) return fail("Keine Waffe in diesem Platz")
    if (!canAttach(id, att)) return fail("Passt nicht an diese Waffe")
    const a = ATTACHMENTS[att]
    if (this.level("armory") < a.armory) return fail(`Waffenwerkstatt Stufe ${a.armory} erforderlich`)
    if (this.count(att) <= 0) return fail("Aufsatz nicht im Lager")
    const mods = slot === "primary" ? lo.primaryMods : lo.secondaryMods
    const old = mods[a.slot]; if (old) this.addItem(old, 1)
    this.takeItem(att, 1); mods[a.slot] = att
    this.save(); return ok(`${a.name} montiert`)
  }

  removeAttachment(slot: "primary" | "secondary", attSlot: AttachmentSlot): ActionResult {
    const lo = this.profile.loadout, mods = slot === "primary" ? lo.primaryMods : lo.secondaryMods
    const att = mods[attSlot]; if (!att) return fail("Kein Aufsatz montiert")
    delete mods[attSlot]; this.addItem(att, 1); this.save(); return ok(`${ATTACHMENTS[att].name} abmontiert`)
  }

  equipGear(id: GearId): ActionResult {
    const lo = this.profile.loadout
    if (this.count(id) <= 0) return fail("Nicht im Lager")
    if (id === "armor" || id === "plate") {
      const value = id === "plate" ? 85 : 55
      if (lo.armor > 0) { if (lo.armor >= lo.armorMax) this.addItem(lo.armorMax === 85 ? "plate" : "armor", 1) }
      this.takeItem(id, 1); lo.armor = value; lo.armorMax = value
    } else if (id === "helmet") {
      if (lo.helmet >= 50) this.addItem("helmet", 1)
      this.takeItem("helmet", 1); lo.helmet = 50
    } else if (id === "nvg") {
      if (lo.nvg) return fail("Nachtsichtgerät ist schon montiert")
      this.takeItem("nvg", 1); lo.nvg = true
    } else {
      if (lo.backpack !== "none") this.addItem(lo.backpack, 1)
      this.takeItem(id, 1); lo.backpack = id
      this.trimBag()
    }
    this.save(); return ok(`${ITEMS[id].name} angelegt`)
  }

  unequipGear(kind: "armor" | "helmet" | "nvg" | "backpack"): ActionResult {
    const lo = this.profile.loadout
    if (kind === "armor") { if (lo.armor <= 0) return fail("Keine Weste"); if (lo.armor >= lo.armorMax) this.addItem(lo.armorMax === 85 ? "plate" : "armor", 1); lo.armor = 0; lo.armorMax = 0 }
    else if (kind === "helmet") { if (lo.helmet <= 0) return fail("Kein Helm"); if (lo.helmet >= 50) this.addItem("helmet", 1); lo.helmet = 0 }
    else if (kind === "nvg") { if (!lo.nvg) return fail("Kein Nachtsichtgerät"); this.addItem("nvg", 1); lo.nvg = false }
    else { if (lo.backpack === "none") return fail("Kein Rucksack"); this.addItem(lo.backpack, 1); lo.backpack = "none"; this.trimBag() }
    this.save(); return ok("Abgelegt")
  }

  bagSlots(): number { return BACKPACKS[this.profile.loadout.backpack].slots }
  secureSlots(): number { return secureSlots(this.level("storage")) }

  /** Moves bag overflow (after a smaller backpack) back into the stash. */
  private trimBag(): void {
    const lo = this.profile.loadout, slots = this.bagSlots()
    while (lo.bag.length > slots) { const s = lo.bag.pop()!; this.addItem(s.id, s.qty) }
  }

  /** Packs items from the stash into the backpack or the secure container. */
  pack(id: ItemId, qty: number, into: "bag" | "secure" = "bag"): ActionResult {
    const lo = this.profile.loadout
    const bag = new Bag(into === "bag" ? this.bagSlots() : this.secureSlots(), into === "bag" ? lo.bag : lo.secure)
    const n = bag.add(id, Math.min(qty, this.count(id)))
    if (n <= 0) return fail(into === "bag" ? "Rucksack voll" : "Sicherer Behälter voll")
    this.takeItem(id, n)
    if (into === "bag") lo.bag = bag.toJSON(); else lo.secure = bag.toJSON()
    this.save(); return ok(`${n}× ${ITEMS[id].name} eingepackt`)
  }

  unpack(index: number, from: "bag" | "secure" = "bag"): ActionResult {
    const lo = this.profile.loadout, list = from === "bag" ? lo.bag : lo.secure
    const s = list[index]; if (!s) return fail("Leerer Platz")
    list.splice(index, 1); this.addItem(s.id, s.qty); this.save()
    return ok(`${s.qty}× ${ITEMS[s.id].name} ausgepackt`)
  }

  unpackAll(): void { const lo = this.profile.loadout; for (const s of lo.bag) this.addItem(s.id, s.qty); lo.bag = []; this.save() }

  /** Fills the backpack with a sensible kit: ammo for both guns, medicine, food, water, throwables. */
  quickPack(): ActionResult {
    this.unpackAll()
    const lo = this.profile.loadout
    const want: [ItemId, number][] = []
    const ammoFor = (id: WeaponId | null, ammo: AmmoId | null, mags: number) => { if (id && ammo) want.push([ammo, WEAPONS[id].magazine * mags]) }
    ammoFor(lo.primary, lo.primaryAmmo, lo.primary === "lm60" ? 2 : 5)
    ammoFor(lo.secondary, lo.secondaryAmmo, 3)
    want.push(["medkit", 1], ["bandage", 3], ["painkiller", 1], ["antiviral", 1], ["water", 1], ["canned", 1], ["grenade", 2], ["molotov", 1], ["smoke", 1], ["flashbang", 1], ["decoy", 1], ["shocktrap", 1], ["stim", 1])
    let packed = 0
    for (const [id, qty] of want) { const n = Math.min(qty, this.count(id)); if (n > 0 && this.pack(id, n).ok) packed++ }
    this.save()
    return packed ? ok("Rucksack gepackt") : fail("Nichts zum Einpacken im Lager")
  }

  /** Free basic kit when the company is broke and unarmed (once per few raids). */
  emergencyKit(): ActionResult {
    const p = this.profile, lo = p.loadout
    const armed = lo.primary || lo.secondary || Object.keys(p.stash).some(id => id.startsWith("w_") && id !== "w_knife" && id !== "w_machete" && id !== "w_axe")
    if (armed) return fail("Sie besitzen noch eine Schusswaffe")
    if (p.money >= 600) return fail("Sie können sich eine Pistole leisten")
    if (p.emergencyCooldown > 0) return fail(`Wieder verfügbar in ${p.emergencyCooldown} Einsätzen`)
    this.addItem("w_p9", 1); this.addItem("ammo_9mm", 60); this.addItem("bandage", 2); this.addItem("water", 1)
    p.emergencyCooldown = 3; this.equipWeapon("p9"); this.save()
    return ok("Notfallausrüstung erhalten: P9, 60 Schuss, Verbände, Wasser")
  }

  // ───────────── base ─────────────
  staffTotal(): number { return STAFF_IDS.reduce((n, j) => n + this.profile.staff[j], 0) }
  staffCap(): number { return staffCap(this.level("hq"), this.level("bunks")) + Math.min(6, this.profile.residents) }
  /** Survivors brought out of a raid move into the base. */
  addResidents(n: number): void { if (n <= 0) return; this.profile.residents = Math.min(30, this.profile.residents + n); this.profile.stats.rescued += n; this.save() }
  availableStaff(): number { return this.staffCap() - this.staffTotal() }
  defense(): number { return defenseRating(this.level("walls"), this.level("tower"), this.profile.staff.tower, this.level("generator")) }

  buildRequirement(id: StructureId): string | null {
    const s = STRUCTURES[id], lvl = this.level(id)
    if (lvl >= s.max) return "Maximale Ausbaustufe"
    if (this.level("hq") < s.needsHq[lvl]) return `Kommandozentrale Stufe ${s.needsHq[lvl]} nötig`
    if (s.needsPower && this.level("generator") < s.needsPower[lvl]) return `Generator Stufe ${s.needsPower[lvl]} nötig`
    return null
  }

  build(id: StructureId): ActionResult {
    const req = this.buildRequirement(id); if (req) return fail(req)
    const lvl = this.level(id), cost = STRUCTURES[id].costs[lvl]
    if (!this.canAfford(cost)) return fail(`Fehlt: ${this.missing(cost)}`)
    this.pay(cost); this.profile.structures[id]++
    this.save(); return ok(`${STRUCTURES[id].name}: Stufe ${lvl + 1}`)
  }

  missing(cost: Cost): string {
    const parts: string[] = []
    if (this.profile.money < cost.money) parts.push(`${(cost.money - this.profile.money).toLocaleString("de-DE")} $`)
    for (const [id, n] of Object.entries(cost.items) as [ItemId, number][]) if (this.count(id) < n) parts.push(`${n - this.count(id)}× ${ITEMS[id].name}`)
    return parts.join(", ")
  }

  jobCap(job: StaffJob): number { const lvl = this.level(STAFF_JOBS[job].structure); return job === "tower" ? lvl * 2 : lvl }

  assignStaff(job: StaffJob, delta: number): ActionResult {
    if (this.level(STAFF_JOBS[job].structure) === 0) return fail("Gebäude noch nicht errichtet")
    const next = this.profile.staff[job] + delta
    if (next < 0) return fail("Kein Personal zugewiesen")
    if (next > this.jobCap(job)) return fail("Kein Platz mehr (Gebäude ausbauen)")
    if (delta > 0 && this.availableStaff() <= 0) return fail("Kein freies Personal (Quartier ausbauen)")
    this.profile.staff[job] = next; this.save(); return ok("Personal neu eingeteilt")
  }

  setWorkshopAmmo(ammo: AmmoId): ActionResult {
    const lvl = this.level("workshop"), recipe = RECIPES.find(r => r.station === "workshop" && r.output === ammo)
    if (!recipe || recipe.level > lvl) return fail("Werkstatt-Stufe zu niedrig")
    this.profile.workshopAmmo = ammo; this.save(); return ok(`Produktion: ${ITEMS[ammo].name}`)
  }

  craft(recipeId: string, now = Date.now()): ActionResult {
    const r = RECIPES.find(x => x.id === recipeId); if (!r) return fail("Unbekanntes Rezept")
    if (this.level(r.station) < r.level) return fail(`${STRUCTURES[r.station].name} Stufe ${r.level} nötig`)
    if (this.profile.crafting.some(j => j.station === r.station)) return fail("Diese Station arbeitet bereits")
    if (!this.hasItems(r.inputs)) return fail(`Fehlt: ${this.missing({ money: 0, items: r.inputs })}`)
    for (const [id, n] of Object.entries(r.inputs) as [ItemId, number][]) this.takeItem(id, n)
    this.profile.crafting.push({ station: r.station, recipe: r.id, endsAt: now + r.seconds * 1000 })
    this.save(); return ok(`Herstellung gestartet: ${ITEMS[r.output].name}`)
  }

  startResearch(id: ResearchId, now = Date.now()): ActionResult {
    const r = RESEARCH[id], lab = this.level("lab")
    if (lab === 0) return fail("Forschungslabor erforderlich")
    if (lab < r.labLevel) return fail(`Forschungslabor Stufe ${r.labLevel} erforderlich`)
    if (this.profile.staff.lab === 0) return fail("Mindestens ein Analyst erforderlich")
    if (this.profile.research.includes(id)) return fail("Bereits erforscht")
    if (this.profile.activeResearch) return fail("Es läuft bereits eine Forschung")
    const cost = { money: r.money, items: r.items }
    if (!this.canAfford(cost)) return fail(`Fehlt: ${this.missing(cost)}`)
    this.pay(cost)
    const speed = 1 + (this.profile.staff.lab - 1) * 0.35
    this.profile.activeResearch = { id, endsAt: now + Math.round(r.seconds * 1000 / speed) }
    this.save(); return ok(`Forschung gestartet: ${r.name}`)
  }

  // ───────────── contracts ─────────────
  contractSlots(): number { return Math.max(1, this.level("hq")) }
  offerCount(): number { return [3, 3, 5, 7][this.level("radio")] }

  refreshOffers(rng: () => number = Math.random): void {
    const p = this.profile, hq = this.level("hq"), out: ContractOffer[] = []
    const fetchItems: ItemId[] = ["medical", "electronics", "intel", "parts", "gold", "sample", "fuel", "dogtag", "tools", "chem"]
    const killKinds: { id: string; name: string; min: number }[] = [
      { id: "runner", name: INFECTED.runner.name, min: 1 }, { id: "screamer", name: INFECTED.screamer.name, min: 2 }, { id: "spitter", name: INFECTED.spitter.name, min: 2 }, { id: "bloater", name: INFECTED.bloater.name, min: 1 },
      { id: "brute", name: INFECTED.brute.name, min: 2 }, { id: "stalker", name: INFECTED.stalker.name, min: 3 }, { id: "heavy", name: "Schwere Söldner", min: 2 }, { id: "marksman", name: "Scharfschützen", min: 3 },
    ]
    const places = [["town", "die Altstadt"], ["industry", "das Industriegebiet"], ["harbor", "den Hafen"], ["military", "die Militäranlage"], ["lab", "das Forschungslabor"], ["farm", "den Bauernhof"], ["station", "den Bahnhof"]]
    const targets = [["generator", "den Notstromgenerator am Bahnhof"], ["radio_mast", "den Funkmast auf der Militäranlage"], ["pump", "die Wasserpumpe am Bauernhof"], ["lab_terminal", "das Laborterminal"]]
    const templates = CONTRACT_TEMPLATES.filter(t => t.minHq <= hq)
    const seen = new Set<string>()
    for (let i = 0, tries = 0; i < this.offerCount() && tries < 40; tries++) {
      const t = templates[Math.floor(rng() * templates.length)]
      const id = `c${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}${i}`
      let target = 1, text = t.text, item: ItemId | undefined, subject: string | undefined, subjectName: string | undefined, money = 600, xp = 200
      if (t.kind === "fetch") { item = fetchItems[Math.floor(rng() * fetchItems.length)]; target = item === "sample" || item === "fuel" ? 1 : 2 + Math.floor(rng() * 3); money = Math.round(ITEMS[item].value * target * 1.6 + 200); text = text.replace("{qty}", String(target)).replace("{item}", ITEMS[item].name) }
      else if (t.kind === "killInfected") { target = 15 + Math.floor(rng() * 4) * 5; money = target * 35; xp = target * 12 }
      else if (t.kind === "killMerc") { target = 3 + Math.floor(rng() * 4); money = target * 220; xp = target * 60 }
      else if (t.kind === "killKind") { const k = killKinds.filter(k => k.min <= hq)[Math.floor(rng() * killKinds.filter(k => k.min <= hq).length)]; subject = k.id; subjectName = k.name; target = k.id === "brute" || k.id === "marksman" ? 1 : 2 + Math.floor(rng() * 2); money = target * (k.id === "brute" ? 900 : 400); xp = target * 150; text = text.replace("{qty}", String(target)).replace("{kind}", k.name) }
      else if (t.kind === "recon") { const pl = places[Math.floor(rng() * places.length)]; subject = pl[0]; subjectName = pl[1]; money = 700; xp = 250; text = text.replace("{place}", pl[1]) }
      else if (t.kind === "activate") { const tg = targets[Math.floor(rng() * targets.length)]; subject = tg[0]; subjectName = tg[1]; money = 1100; xp = 350; text = text.replace("{target}", tg[1]) }
      else if (t.kind === "boss") { money = 6000; xp = 2500 }
      const bonusItems: Partial<Record<ItemId, number>> | undefined = rng() < 0.4 ? { [(["scrap", "parts", "chem", "electronics", "tools"] as ItemId[])[Math.floor(rng() * 5)]]: 2 + Math.floor(rng() * 4) } : undefined
      text = text.replace("{qty}", String(target))
      // no two offers with the same task (e.g. two recon contracts for the same place)
      const key = `${t.kind}:${item ?? subject ?? ""}`
      if (seen.has(key)) continue
      seen.add(key); i++
      out.push({ id, kind: t.kind, title: t.title, text, target, item, subject, subjectName, reward: { money, xp, items: bonusItems } })
    }
    p.contracts.offers = out
  }

  acceptContract(id: string): ActionResult {
    const c = this.profile.contracts
    if (c.active.length >= this.contractSlots()) return fail(`Höchstens ${this.contractSlots()} aktive Aufträge (Kommandozentrale ausbauen)`)
    const offer = c.offers.find(o => o.id === id); if (!offer) return fail("Angebot nicht mehr verfügbar")
    c.offers.splice(c.offers.indexOf(offer), 1); c.active.push({ ...offer, progress: 0 })
    this.save(); return ok(`Auftrag angenommen: ${offer.title}`)
  }

  abandonContract(id: string): ActionResult {
    const c = this.profile.contracts, a = c.active.find(x => x.id === id); if (!a) return fail("Kein solcher Auftrag")
    c.active.splice(c.active.indexOf(a), 1); this.save(); return ok("Auftrag abgebrochen")
  }

  /** Hands in items for a fetch contract (from the stash). */
  deliver(id: string): ActionResult {
    const a = this.profile.contracts.active.find(x => x.id === id)
    if (!a || a.kind !== "fetch" || !a.item) return fail("Nichts abzugeben")
    const n = this.takeItem(a.item, a.target - a.progress)
    if (n <= 0) return fail(`Keine ${ITEMS[a.item].name} im Lager`)
    a.progress += n
    if (a.progress >= a.target) return this.completeContract(a)
    this.save(); return ok(`${n}× abgegeben (${a.progress}/${a.target})`)
  }

  private completeContract(a: ActiveContract): ActionResult {
    const c = this.profile.contracts
    c.active.splice(c.active.indexOf(a), 1)
    this.profile.money += a.reward.money; this.profile.stats.earned += a.reward.money; this.profile.stats.contracts++
    for (const [id, n] of Object.entries(a.reward.items ?? {}) as [ItemId, number][]) this.addItem(id, n)
    const lvl = this.addXp(a.reward.xp)
    this.save()
    return ok(`Auftrag erfüllt: ${a.title} · +${a.reward.money.toLocaleString("de-DE")} $${lvl ? " · Stufenaufstieg!" : ""}`)
  }

  // ───────────── raids ─────────────
  /** Removes the kit from the profile (a reload during the raid loses it, except the secure container). */
  beginRaid(now = Date.now()): RaidKit {
    const p = this.profile, lo = p.loadout
    const kit: RaidKit = {
      primary: lo.primary, primaryMods: { ...lo.primaryMods }, primaryAmmo: lo.primaryAmmo,
      secondary: lo.secondary, secondaryMods: { ...lo.secondaryMods }, secondaryAmmo: lo.secondaryAmmo,
      melee: lo.melee, armor: lo.armor, armorMax: lo.armorMax, helmet: lo.helmet, nvg: lo.nvg, backpack: lo.backpack,
      bag: lo.bag.map(s => ({ ...s })), secure: lo.secure.map(s => ({ ...s })), secureSlots: this.secureSlots(), infection: p.infection,
    }
    p.loadout = { primary: null, primaryMods: {}, primaryAmmo: null, secondary: null, secondaryMods: {}, secondaryAmmo: null, melee: "knife", armor: 0, armorMax: 0, helmet: 0, nvg: false, backpack: "none", bag: [], secure: [] }
    p.raidStarted = now; p.raidSecure = kit.secure.map(s => ({ ...s }))
    this.save()
    return kit
  }

  /** A raid that was interrupted by closing/reloading the page: counts as lost; the secure container survives. */
  recoverInterruptedRaid(): string | null {
    const p = this.profile
    if (!p.raidStarted) return null
    for (const s of p.raidSecure) this.addItem(s.id, s.qty)
    p.raidStarted = 0; p.raidSecure = []; p.stats.raids++; p.stats.deaths++
    p.emergencyCooldown = Math.max(0, p.emergencyCooldown - 1)
    this.save()
    return "Der letzte Einsatz wurde unterbrochen und gilt als gescheitert. Nur der sichere Behälter wurde geborgen."
  }

  finishRaid(kit: RaidKit, ret: RaidReturn, stats: RaidStats, success: boolean, difficulty: Difficulty, rng: () => number = Math.random): RaidSettlement {
    const p = this.profile, lo = p.loadout
    p.raidStarted = 0; p.raidSecure = []
    p.stats.raids++; p.stats.kills += stats.kills; p.stats.infectedKills += stats.infectedKills; p.stats.mercKills += stats.mercKills
    if (stats.bossKilled) p.stats.bossKills++
    p.stats.headshots += stats.headshots; p.stats.dismembered += stats.dismembered
    p.emergencyCooldown = Math.max(0, p.emergencyCooldown - 1)
    const returned: BagSlot[] = [], lost: BagSlot[] = []
    let value = 0
    const back = (s: BagSlot) => { this.addItem(s.id, s.qty); returned.push(s); if (ITEMS[s.id].cat === "valuable") value += sellPrice(s.id) * s.qty }
    for (const s of ret.secure) back(s)
    if (success) {
      for (const s of ret.bag) back(s)
      for (const [ammo, n] of Object.entries(ret.loaded) as [AmmoId, number][]) if (n > 0) this.addItem(ammo, n)
      p.loadout = {
        primary: kit.primary, primaryMods: kit.primaryMods, primaryAmmo: kit.primaryAmmo, secondary: kit.secondary, secondaryMods: kit.secondaryMods, secondaryAmmo: kit.secondaryAmmo,
        melee: kit.melee, armor: ret.armor >= 0.5 && kit.armorMax > 0 ? Math.min(kit.armor, Math.round(ret.armor)) : 0, armorMax: ret.armor >= 0.5 && kit.armorMax > 0 ? kit.armorMax : 0,
        helmet: Math.max(0, Math.round(ret.helmet)), nvg: kit.nvg, backpack: kit.backpack, bag: [], secure: [],
      }
      p.stats.extracts++
      p.stats.bestRaid = Math.max(p.stats.bestRaid, value)
      p.tutorialDone = true
    } else {
      for (const s of ret.bag) lost.push(s)
      const gear: [ItemId | null, boolean][] = [[kit.primary ? weaponItem(kit.primary) : null, true], [kit.secondary ? weaponItem(kit.secondary) : null, true], [kit.melee !== "knife" ? weaponItem(kit.melee) : null, true]]
      for (const [id] of gear) if (id) lost.push({ id, qty: 1 })
      for (const att of [...Object.values(kit.primaryMods), ...Object.values(kit.secondaryMods)]) if (att) lost.push({ id: att, qty: 1 })
      if (kit.armor > 0) lost.push({ id: kit.armorMax === 85 ? "plate" : "armor", qty: 1 })
      if (kit.helmet > 0) lost.push({ id: "helmet", qty: 1 })
      if (kit.nvg) lost.push({ id: "nvg", qty: 1 })
      if (kit.backpack !== "none") lost.push({ id: kit.backpack, qty: 1 })
      p.stats.deaths++
      lo.melee = "knife"
    }
    p.loadout.secure = []
    p.infection = success ? Math.round(ret.infection) : 0
    // contracts: kills always count; recon/activate/boss need a successful extraction
    const contractUpdates: RaidSettlement["contractUpdates"] = []
    for (const a of [...p.contracts.active]) {
      const before = a.progress
      if (a.kind === "killInfected") a.progress += stats.infectedKills
      else if (a.kind === "killMerc") a.progress += stats.mercKills
      else if (a.kind === "killKind" && a.subject) a.progress += stats.killsByKind[a.subject] ?? 0
      else if (success && a.kind === "recon" && a.subject && stats.visited.includes(a.subject)) a.progress = a.target
      else if (success && a.kind === "activate" && a.subject && stats.activated.includes(a.subject)) a.progress = a.target
      else if (a.kind === "boss" && stats.bossKilled) a.progress = a.target
      a.progress = Math.min(a.target, a.progress)
      if (a.progress !== before || a.progress >= a.target) {
        contractUpdates.push({ title: a.title, progress: a.progress, target: a.target, done: a.progress >= a.target })
        if (a.progress >= a.target) this.completeContract(a)
      }
    }
    // the more raids, the more attention the base draws
    p.base.threat = Math.min(100, p.base.threat + BASE_ATTACK.threatPerRaid + rng() * 6)
    if (p.base.threat >= BASE_ATTACK.threshold) p.base.attackPending = true
    const xp = Math.round((success ? 200 : 40) + stats.infectedKills * 12 + stats.mercKills * 50 + stats.headshots * 8 + (success ? Math.min(800, value / 6) : 0))
    const levelUp = this.addXp(Math.round(xp * (DIFFICULTY[difficulty].rewardMultiplier)))
    this.refreshOffers(rng)
    this.save()
    return { xp, levelUp, value, lost, returned, contractUpdates }
  }

  // ───────────── base attacks ─────────────
  /** Auto-resolves a pending attack with the walls, towers and guards. */
  resolveAttack(rng: () => number = Math.random): ActionResult {
    const p = this.profile
    if (!p.base.attackPending) return fail("Kein Angriff")
    const def = this.defense(), threat = p.base.threat
    p.base.attackPending = false; p.base.lastAttack = Date.now()
    if (def + rng() * 20 >= threat * 0.8) {
      p.base.threat = 15; this.addItem("scrap", 6)
      this.save(); return ok(`Angriff abgewehrt (Verteidigung ${def}). Die Wachen bergen 6× Altmetall.`)
    }
    return this.overrun()
  }

  /** The infected break in: a share of materials, food and medicine is lost. */
  private overrun(): ActionResult {
    const p = this.profile
    const lostParts: string[] = []
    for (const id of Object.keys(p.stash) as ItemId[]) {
      const cat = ITEMS[id].cat
      if (cat !== "material" && cat !== "food" && cat !== "medical") continue
      const n = Math.floor(this.count(id) * BASE_ATTACK.lossFraction); if (n <= 0) continue
      this.takeItem(id, n); lostParts.push(`${n}× ${ITEMS[id].name}`)
    }
    p.base.threat = 25
    this.save(); return { ok: false, message: `Die Infizierten haben die Basis überrannt. Verloren: ${lostParts.slice(0, 4).join(", ") || "nichts"}${lostParts.length > 4 ? " …" : ""}` }
  }

  /** Called after a played base defence. */
  finishDefense(won: boolean, kills: number): ActionResult {
    const p = this.profile
    p.base.attackPending = false; p.base.lastAttack = Date.now()
    p.stats.infectedKills += kills; p.stats.kills += kills
    if (won) { p.base.threat = 0; p.stats.defenses++; this.addItem("scrap", 10); this.addItem("parts", 2); this.addXp(150 + kills * 10); this.save(); return ok(`Basis verteidigt! ${kills} Infizierte erledigt · +10 Altmetall, +2 Maschinenteile`) }
    return this.overrun()
  }

  /** Adds XP; returns true when at least one level was gained (each level pays 250 $). */
  addXp(amount: number): boolean {
    const before = this.profile.level
    this.profile.xp += Math.max(0, Math.round(amount))
    while (this.profile.xp >= xpForLevel(this.profile.level)) { this.profile.xp -= xpForLevel(this.profile.level); this.profile.level++; this.profile.money += 250 }
    return this.profile.level > before
  }
}

export type { InfectedKind }
