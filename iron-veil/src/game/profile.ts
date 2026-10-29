import { BUILDINGS, ITEMS, RESEARCH, buildingCost, staffCap, xpForLevel } from "./data"
import { saveProfile } from "./storage"
import type { BuildingId, ItemId, MissionId, Profile, ResearchId } from "./types"

export function createProfile(): Profile {
  return {
    version: 2, callsign: "VEIL-01", money: 1800, resources: 60, xp: 0, level: 1,
    stash: { ammo: 6, medkit: 1, armor: 1, parts: 0, intel: 0, electronics: 0, medical: 0, relic: 0 },
    buildings: { hq: 1, workshop: 0, lab: 0, clinic: 0 },
    staff: { workshop: 0, lab: 0, clinic: 0 },
    production: { workshop: 0, clinic: 0 }, research: [], activeResearch: null,
    loadout: { armor: 0, medkits: 1 },
    stats: { raids: 0, extracts: 0, kills: 0, earned: 0, deaths: 0 }, lastTick: Date.now(),
  }
}

export class Company {
  constructor(public profile: Profile) {}

  save(): boolean { return saveProfile(this.profile) }
  availableStaff(): number { return staffCap(this.profile.buildings.hq) - this.profile.staff.workshop - this.profile.staff.lab - this.profile.staff.clinic }
  canAfford(money: number, resources = 0): boolean { return this.profile.money >= money && this.profile.resources >= resources }

  tick(now = Date.now()): string[] {
    const p = this.profile
    const elapsed = Math.min(7200, Math.max(0, (now - p.lastTick) / 1000))
    const notes: string[] = []
    if (p.buildings.workshop > 0 && p.staff.workshop > 0) {
      p.production.workshop += elapsed * p.staff.workshop * p.buildings.workshop
      const made = Math.floor(p.production.workshop / 45)
      if (made > 0) { p.stash.ammo += made; p.production.workshop -= made * 45; notes.push(`${made} Munitionspakete produziert`) }
    }
    if (p.buildings.clinic > 0 && p.staff.clinic > 0) {
      p.production.clinic += elapsed * p.staff.clinic * p.buildings.clinic
      const made = Math.floor(p.production.clinic / 90)
      if (made > 0) { p.stash.medkit += made; p.production.clinic -= made * 90; notes.push(`${made} Trauma-Sets produziert`) }
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

  buildOrUpgrade(id: BuildingId): { ok: boolean; message: string } {
    const level = this.profile.buildings[id]
    if (level >= BUILDINGS[id].max) return { ok: false, message: "Maximale Ausbaustufe erreicht" }
    if (id !== "hq" && this.profile.buildings.hq < level + 1) return { ok: false, message: "Kommandozentrale zuerst ausbauen" }
    const cost = buildingCost(id, level)
    if (!this.canAfford(cost.money, cost.resources)) return { ok: false, message: "Nicht genügend Geld oder Ressourcen" }
    this.profile.money -= cost.money; this.profile.resources -= cost.resources; this.profile.buildings[id]++
    this.save(); return { ok: true, message: `${BUILDINGS[id].name}: Ebene ${level + 1}` }
  }

  assignStaff(id: keyof Profile["staff"], delta: number): { ok: boolean; message: string } {
    if (this.profile.buildings[id] === 0) return { ok: false, message: "Gebäude noch nicht errichtet" }
    const next = this.profile.staff[id] + delta
    if (next < 0 || next > this.profile.buildings[id]) return { ok: false, message: delta > 0 ? "Gebäudekapazität erreicht" : "Kein Personal zugewiesen" }
    if (delta > 0 && this.availableStaff() <= 0) return { ok: false, message: "Kein freies Personal" }
    this.profile.staff[id] = next; this.save(); return { ok: true, message: "Personalzuweisung aktualisiert" }
  }

  startResearch(id: ResearchId): { ok: boolean; message: string } {
    if (this.profile.buildings.lab === 0) return { ok: false, message: "Forschungslabor erforderlich" }
    if (this.profile.staff.lab === 0) return { ok: false, message: "Mindestens ein Analyst erforderlich" }
    if (this.profile.research.includes(id)) return { ok: false, message: "Bereits erforscht" }
    if (this.profile.activeResearch) return { ok: false, message: "Es läuft bereits eine Forschung" }
    const r = RESEARCH[id]
    if (!this.canAfford(r.money, r.resources)) return { ok: false, message: "Nicht genügend Geld oder Ressourcen" }
    this.profile.money -= r.money; this.profile.resources -= r.resources
    this.profile.activeResearch = { id, endsAt: Date.now() + r.seconds * 1000 }
    this.save(); return { ok: true, message: `Forschung gestartet: ${r.name}` }
  }

  buy(id: ItemId, qty: number): { ok: boolean; message: string } {
    if (id !== "ammo" && id !== "medkit" && id !== "armor") return { ok: false, message: "Dieser Artikel ist nicht käuflich" }
    const cost = (id === "ammo" ? ITEMS[id].value * 30 : ITEMS[id].value) * qty
    if (this.profile.money < cost) return { ok: false, message: "Nicht genügend Geld" }
    this.profile.money -= cost; this.profile.stash[id] += qty; this.save()
    return { ok: true, message: `${qty} × ${ITEMS[id].name} gekauft` }
  }

  sell(id: ItemId, qty: number): { ok: boolean; message: string } {
    const amount = Math.min(qty, this.profile.stash[id])
    if (amount <= 0 || ITEMS[id].kind !== "loot") return { ok: false, message: "Keine verkaufbare Menge" }
    const bonus = this.profile.research.includes("broker") ? 1.2 : 1
    const value = Math.round(ITEMS[id].value * amount * bonus)
    this.profile.stash[id] -= amount; this.profile.money += value; this.profile.stats.earned += value
    this.save(); return { ok: true, message: `Verkauft für ${value.toLocaleString("de-DE")} $` }
  }

  equip(id: "armor" | "medkit"): { ok: boolean; message: string } {
    if (this.profile.stash[id] <= 0) return { ok: false, message: "Nicht im Lager vorhanden" }
    if (id === "armor") {
      if (this.profile.loadout.armor > 0) return { ok: false, message: "Schutzweste ist bereits ausgerüstet" }
      this.profile.stash.armor--; this.profile.loadout.armor = 55
    } else {
      if (this.profile.loadout.medkits >= 3) return { ok: false, message: "Maximal drei Trauma-Sets" }
      this.profile.stash.medkit--; this.profile.loadout.medkits++
    }
    this.save(); return { ok: true, message: "Ausrüstung vorbereitet" }
  }

  isMissionUnlocked(id: MissionId): boolean { return this.profile.buildings.hq >= (id === "greyzone" ? 1 : id === "harbor" ? 2 : 3) }

  applyExtraction(mission: MissionId, loot: Partial<Record<ItemId, number>>, kills: number, reward: number, resources: number): number {
    let value = 0
    for (const [key, qty] of Object.entries(loot) as [ItemId, number][]) { this.profile.stash[key] += qty; value += (ITEMS[key]?.value || 0) * qty }
    this.profile.money += reward; this.profile.resources += resources
    this.profile.stats.raids++; this.profile.stats.extracts++; this.profile.stats.kills += kills; this.profile.stats.earned += reward
    this.addXp(220 + kills * 45 + lootCount(loot) * 25); this.save(); return value
  }

  applyFailure(kills: number): void {
    this.profile.stats.raids++; this.profile.stats.deaths++; this.profile.stats.kills += kills
    this.profile.loadout.armor = 0; this.profile.loadout.medkits = 0
    this.addXp(40 + kills * 20); this.save()
  }

  private addXp(amount: number): void {
    this.profile.xp += amount
    while (this.profile.xp >= xpForLevel(this.profile.level)) { this.profile.xp -= xpForLevel(this.profile.level); this.profile.level++; this.profile.money += 250 }
  }
}

function lootCount(loot: Partial<Record<ItemId, number>>): number { return Object.values(loot).reduce((a, b) => a + (b || 0), 0) }
