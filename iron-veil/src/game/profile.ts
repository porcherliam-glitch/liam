/**
 * profile.ts — the company (meta game): economy, base, staff, research, trader, loadout and raid bookkeeping.
 * Pure logic on the Profile object (no DOM/three.js); persistence goes through storage.ts. Unit-tested.
 */
import { ARMOR_VALUES, BUILDINGS, CONTRACTS, DIFFICULTY, ITEMS, MAX_GRENADES, MAX_MEDKITS, MISSIONS, RESEARCH, WEAPONS, buildingCost, productionInterval, staffCap, xpForLevel } from "./data"
import { saveProfile } from "./storage"
import type { BuildingId, ContractState, Difficulty, ItemId, MissionId, Profile, ResearchId, WeaponId } from "./types"

/** Maximum ammo packs taken into one raid. */
export const AMMO_CARRY = 6
/** Offline production is capped at this many seconds. */
export const OFFLINE_CAP = 7200

export interface ActionResult { ok: boolean; message: string }

export function createProfile(now = Date.now()): Profile {
  return {
    version: 3, callsign: "VEIL-01", money: 1800, resources: 60, xp: 0, level: 1,
    stash: { ammo: 6, medkit: 1, armor: 1, plate: 0, grenade: 0, parts: 0, intel: 0, electronics: 0, medical: 0, relic: 0 },
    weapons: ["p9", "mk4"],
    buildings: { hq: 1, workshop: 0, lab: 0, clinic: 0 },
    staff: { workshop: 0, lab: 0, clinic: 0 },
    production: { workshop: 0, clinic: 0 }, research: [], activeResearch: null,
    loadout: { primary: "mk4", armor: 0, armorMax: 0, medkits: 1, grenades: 0 },
    stats: { raids: 0, extracts: 0, kills: 0, earned: 0, deaths: 0, headshots: 0, bestRaid: 0, contracts: 0 },
    tutorialDone: false, lastTick: now,
  }
}

/** What the operator carries into a raid (already removed from the company). */
export interface RaidKit { primary: WeaponId; ammoPacks: number; medkits: number; grenades: number; armor: number; armorMax: number }

export interface RaidOutcome {
  mission: MissionId
  success: boolean
  loot: Partial<Record<ItemId, number>>
  kills: number
  headshots: number
  /** Primary-weapon rounds left (magazine + reserve). */
  roundsLeft: number
  medkitsLeft: number
  grenadesLeft: number
  armorLeft: number
  contract: ContractState | null
  difficulty: Difficulty
}

export interface RaidSettlement { reward: number; resources: number; contractReward: number; value: number; xp: number; levelUp: boolean; ammoReturned: number }

export class Company {
  constructor(public profile: Profile) {}

  save(): boolean { return saveProfile(this.profile) }
  has(id: ResearchId): boolean { return this.profile.research.includes(id) }
  availableStaff(): number { const s = this.profile.staff; return staffCap(this.profile.buildings.hq) - s.workshop - s.lab - s.clinic }
  canAfford(money: number, resources = 0): boolean { return this.profile.money >= money && this.profile.resources >= resources }

  /** Advances production and research to `now`; returns German notes for the UI. */
  tick(now = Date.now()): string[] {
    const p = this.profile
    const elapsed = Math.min(OFFLINE_CAP, Math.max(0, (now - p.lastTick) / 1000))
    const notes: string[] = []
    for (const kind of ["workshop", "clinic"] as const) {
      const interval = productionInterval(kind, p.staff[kind], p.buildings[kind])
      if (!Number.isFinite(interval)) continue
      p.production[kind] += elapsed
      const made = Math.floor(p.production[kind] / interval)
      if (made > 0) {
        p.production[kind] -= made * interval
        if (kind === "workshop") { p.stash.ammo += made; notes.push(`${made} Munitionspaket${made === 1 ? "" : "e"} produziert`) }
        else { p.stash.medkit += made; notes.push(`${made} Trauma-Set${made === 1 ? "" : "s"} produziert`) }
      }
    }
    if (p.activeResearch && now >= p.activeResearch.endsAt) {
      const id = p.activeResearch.id
      if (!p.research.includes(id)) p.research.push(id)
      notes.push(`Forschung abgeschlossen: ${RESEARCH[id].name}`)
      p.activeResearch = null
    }
    p.lastTick = now
    if (notes.length) this.save()
    return notes
  }

  buildOrUpgrade(id: BuildingId): ActionResult {
    const level = this.profile.buildings[id]
    if (level >= BUILDINGS[id].max) return { ok: false, message: "Maximale Ausbaustufe erreicht" }
    if (id !== "hq" && this.profile.buildings.hq < level + 1) return { ok: false, message: "Zuerst die Kommandozentrale ausbauen" }
    const cost = buildingCost(id, level)
    if (!this.canAfford(cost.money, cost.resources)) return { ok: false, message: "Nicht genügend Geld oder Ressourcen" }
    this.profile.money -= cost.money; this.profile.resources -= cost.resources; this.profile.buildings[id]++
    this.save(); return { ok: true, message: `${BUILDINGS[id].name}: Ebene ${level + 1}` }
  }

  assignStaff(id: keyof Profile["staff"], delta: number): ActionResult {
    if (this.profile.buildings[id] === 0) return { ok: false, message: "Gebäude noch nicht errichtet" }
    const next = this.profile.staff[id] + delta
    if (next < 0) return { ok: false, message: "Kein Personal zugewiesen" }
    if (next > this.profile.buildings[id]) return { ok: false, message: "Gebäudekapazität erreicht (Gebäude ausbauen)" }
    if (delta > 0 && this.availableStaff() <= 0) return { ok: false, message: "Kein freies Personal (Kommandozentrale ausbauen)" }
    this.profile.staff[id] = next; this.save(); return { ok: true, message: "Personal neu eingeteilt" }
  }

  startResearch(id: ResearchId): ActionResult {
    const r = RESEARCH[id]
    if (this.profile.buildings.lab === 0) return { ok: false, message: "Forschungslabor erforderlich" }
    if (this.profile.buildings.lab < r.labLevel) return { ok: false, message: `Forschungslabor Ebene ${r.labLevel} erforderlich` }
    if (this.profile.staff.lab === 0) return { ok: false, message: "Mindestens ein Analyst erforderlich" }
    if (this.profile.research.includes(id)) return { ok: false, message: "Bereits erforscht" }
    if (this.profile.activeResearch) return { ok: false, message: "Es läuft bereits eine Forschung" }
    if (!this.canAfford(r.money, r.resources)) return { ok: false, message: "Nicht genügend Geld oder Ressourcen" }
    this.profile.money -= r.money; this.profile.resources -= r.resources
    // more analysts research faster (lab staff 1..3)
    const speed = 1 + (this.profile.staff.lab - 1) * 0.35
    this.profile.activeResearch = { id, endsAt: Date.now() + Math.round(r.seconds * 1000 / speed) }
    this.save(); return { ok: true, message: `Forschung gestartet: ${r.name}` }
  }

  buy(id: ItemId, qty = 1): ActionResult {
    const item = ITEMS[id]
    if (item.kind !== "supply") return { ok: false, message: "Dieser Artikel ist nicht käuflich" }
    if (this.profile.level < item.minLevel) return { ok: false, message: `Ab Level ${item.minLevel} erhältlich` }
    const cost = item.value * qty
    if (this.profile.money < cost) return { ok: false, message: "Nicht genügend Geld" }
    this.profile.money -= cost; this.profile.stash[id] += qty; this.save()
    return { ok: true, message: `${qty} × ${item.name} gekauft` }
  }

  buyWeapon(id: WeaponId): ActionResult {
    const w = WEAPONS[id]
    if (this.profile.weapons.includes(id)) return { ok: false, message: "Bereits im Besitz" }
    if (this.profile.level < w.minLevel) return { ok: false, message: `Ab Level ${w.minLevel} erhältlich` }
    if (this.profile.money < w.price) return { ok: false, message: "Nicht genügend Geld" }
    this.profile.money -= w.price; this.profile.weapons.push(id); this.profile.loadout.primary = id; this.save()
    return { ok: true, message: `${w.name} gekauft und ausgerüstet` }
  }

  selectPrimary(id: WeaponId): ActionResult {
    if (id === "p9") return { ok: false, message: "Die Pistole ist immer als Seitenwaffe dabei" }
    if (!this.profile.weapons.includes(id)) return { ok: false, message: "Waffe nicht im Besitz" }
    this.profile.loadout.primary = id; this.save()
    return { ok: true, message: `${WEAPONS[id].name} als Hauptwaffe gewählt` }
  }

  sellPrice(id: ItemId): number { return Math.round(ITEMS[id].value * (this.has("broker") ? 1.2 : 1)) }

  sell(id: ItemId, qty: number): ActionResult {
    const amount = Math.min(qty, this.profile.stash[id])
    if (amount <= 0 || ITEMS[id].kind !== "loot") return { ok: false, message: "Keine verkaufbare Menge" }
    const value = this.sellPrice(id) * amount
    this.profile.stash[id] -= amount; this.profile.money += value; this.profile.stats.earned += value
    this.save(); return { ok: true, message: `Verkauft für ${value.toLocaleString("de-DE")} $` }
  }

  sellAllLoot(): ActionResult {
    let total = 0
    for (const id of Object.keys(ITEMS) as ItemId[]) {
      if (ITEMS[id].kind !== "loot" || this.profile.stash[id] <= 0) continue
      total += this.sellPrice(id) * this.profile.stash[id]; this.profile.stash[id] = 0
    }
    if (total <= 0) return { ok: false, message: "Keine Beute im Lager" }
    this.profile.money += total; this.profile.stats.earned += total; this.save()
    return { ok: true, message: `Gesamte Beute für ${total.toLocaleString("de-DE")} $ verkauft` }
  }

  equip(id: "armor" | "plate" | "medkit" | "grenade"): ActionResult {
    const p = this.profile
    if (p.stash[id] <= 0) return { ok: false, message: "Nicht im Lager vorhanden" }
    if (id === "armor" || id === "plate") {
      const value = ARMOR_VALUES[id]
      if (p.loadout.armor > 0 && p.loadout.armorMax >= value) return { ok: false, message: "Gleichwertige oder bessere Weste bereits ausgerüstet" }
      // swapping: an undamaged carried vest goes back into the stash, a damaged one is discarded
      if (p.loadout.armor > 0 && p.loadout.armor >= p.loadout.armorMax) p.stash[p.loadout.armorMax === ARMOR_VALUES.plate ? "plate" : "armor"]++
      p.stash[id]--; p.loadout.armor = value; p.loadout.armorMax = value
    } else if (id === "medkit") {
      if (p.loadout.medkits >= MAX_MEDKITS) return { ok: false, message: `Maximal ${MAX_MEDKITS} Trauma-Sets` }
      p.stash.medkit--; p.loadout.medkits++
    } else {
      if (p.loadout.grenades >= MAX_GRENADES) return { ok: false, message: `Maximal ${MAX_GRENADES} Granaten` }
      p.stash.grenade--; p.loadout.grenades++
    }
    this.save(); return { ok: true, message: `${ITEMS[id].name} ausgerüstet` }
  }

  unequip(id: "armor" | "medkit" | "grenade"): ActionResult {
    const p = this.profile
    if (id === "armor") {
      if (p.loadout.armor <= 0) return { ok: false, message: "Keine Weste ausgerüstet" }
      if (p.loadout.armor < p.loadout.armorMax) return { ok: false, message: "Beschädigte Westen können nicht eingelagert werden" }
      p.stash[p.loadout.armorMax === ARMOR_VALUES.plate ? "plate" : "armor"]++; p.loadout.armor = 0; p.loadout.armorMax = 0
    } else if (id === "medkit") {
      if (p.loadout.medkits <= 0) return { ok: false, message: "Keine Trauma-Sets ausgerüstet" }
      p.loadout.medkits--; p.stash.medkit++
    } else {
      if (p.loadout.grenades <= 0) return { ok: false, message: "Keine Granaten ausgerüstet" }
      p.loadout.grenades--; p.stash.grenade++
    }
    this.save(); return { ok: true, message: "Ins Lager zurückgelegt" }
  }

  isMissionUnlocked(id: MissionId): boolean { return this.profile.buildings.hq >= MISSIONS[id].hqLevel }

  /** Removes the carried kit from the company and returns it. */
  beginRaid(): RaidKit {
    const p = this.profile
    const packs = Math.min(AMMO_CARRY, p.stash.ammo)
    p.stash.ammo -= packs
    const kit: RaidKit = { primary: p.weapons.includes(p.loadout.primary) ? p.loadout.primary : "mk4", ammoPacks: packs, medkits: p.loadout.medkits, grenades: p.loadout.grenades, armor: p.loadout.armor, armorMax: p.loadout.armorMax }
    p.loadout.medkits = 0; p.loadout.grenades = 0; p.loadout.armor = 0; p.loadout.armorMax = 0
    this.save()
    return kit
  }

  /** Books the raid result, returns what was paid out. kit is the one returned by beginRaid(). */
  finishRaid(kit: RaidKit, o: RaidOutcome): RaidSettlement {
    const p = this.profile, mission = MISSIONS[o.mission]
    const rpp = WEAPONS[kit.primary].roundsPerPack || 30
    const packsLeft = o.roundsLeft / rpp
    let reward = 0, resources = 0, contractReward = 0, value = 0, xp: number, ammoReturned: number
    p.stats.raids++; p.stats.kills += o.kills; p.stats.headshots += o.headshots
    if (o.success) {
      for (const [key, qty] of Object.entries(o.loot) as [ItemId, number][]) {
        if (!qty || !(key in p.stash)) continue
        p.stash[key] += qty; if (ITEMS[key].kind === "loot") value += ITEMS[key].value * qty
      }
      const mult = DIFFICULTY[o.difficulty].rewardMultiplier
      reward = Math.round(mission.reward * mult); resources = mission.resources
      if (o.contract?.done && !o.contract.failed) { contractReward = Math.round(CONTRACTS[o.contract.id].reward * mult); p.stats.contracts++ }
      p.money += reward + contractReward; p.resources += resources
      p.stats.extracts++; p.stats.earned += reward + contractReward; p.stats.bestRaid = Math.max(p.stats.bestRaid, value + reward + contractReward)
      ammoReturned = Math.ceil(packsLeft - 1e-6)
      // anything above the carry limit goes back into the stash
      const medkits = p.loadout.medkits + o.medkitsLeft, grenades = p.loadout.grenades + o.grenadesLeft
      p.loadout.medkits = Math.min(MAX_MEDKITS, medkits); p.stash.medkit += medkits - p.loadout.medkits
      p.loadout.grenades = Math.min(MAX_GRENADES, grenades); p.stash.grenade += grenades - p.loadout.grenades
      if (o.armorLeft > 0 && kit.armorMax > 0) { p.loadout.armor = Math.min(kit.armorMax, Math.round(o.armorLeft)); p.loadout.armorMax = kit.armorMax }
      xp = 220 + o.kills * 45 + Object.values(o.loot).reduce((a, b) => a + (b || 0), 0) * 25 + (contractReward ? 150 : 0)
    } else {
      p.stats.deaths++
      ammoReturned = Math.floor(packsLeft / 2)
      xp = 40 + o.kills * 20
    }
    p.stash.ammo += Math.max(0, ammoReturned)
    const levelUp = this.addXp(xp)
    if (o.success) p.tutorialDone = true
    this.save()
    return { reward, resources, contractReward, value, xp, levelUp, ammoReturned }
  }

  /** Adds XP; returns true when at least one level was gained (each level pays 250 $). */
  addXp(amount: number): boolean {
    const before = this.profile.level
    this.profile.xp += amount
    while (this.profile.xp >= xpForLevel(this.profile.level)) { this.profile.xp -= xpForLevel(this.profile.level); this.profile.level++; this.profile.money += 250 }
    return this.profile.level > before
  }
}
