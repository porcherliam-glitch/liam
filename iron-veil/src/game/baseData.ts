/**
 * baseData.ts — the player's compound and the meta game: structures with build costs, staff jobs, production,
 * crafting recipes, research, radio contracts, times of day, insertion points and base-attack rules. Pure data.
 */
import type { ItemId } from "./items"

export type StructureId = "hq" | "bunks" | "storage" | "workshop" | "armory" | "workbench" | "clinic" | "kitchen" | "generator" | "lab" | "radio" | "walls" | "tower"
export type StaffJob = "workshop" | "clinic" | "kitchen" | "lab" | "tower"
export type Cost = { money: number; items: Partial<Record<ItemId, number>> }

export interface StructureDef {
  name: string
  short: string
  description: string
  max: number
  /** What each level adds (shown in the build menu). */
  perks: string[]
  /** Cost to reach level n (index 0 = level 1). */
  costs: Cost[]
  /** Required HQ level / generator level per target level (index 0 = level 1). */
  needsHq: number[]
  needsPower?: number[]
}

const c = (money: number, items: Partial<Record<ItemId, number>> = {}): Cost => ({ money, items })

export const STRUCTURES: Record<StructureId, StructureDef> = {
  hq: { name: "Kommandozentrale", short: "CMD", description: "Herz der Basis. Schaltet Einstiegspunkte und höhere Ausbaustufen frei.", max: 3,
    perks: ["2 Einstiegspunkte, 1 Funkauftrag", "4 Einstiegspunkte, 2 Funkaufträge", "Alle Einstiegspunkte, 3 Funkaufträge"],
    costs: [c(0), c(1600, { scrap: 20, wood: 10, parts: 2 }), c(4200, { scrap: 40, electronics: 4, tools: 2 })], needsHq: [0, 1, 2] },
  bunks: { name: "Mannschaftsquartier", short: "QRT", description: "Schlafplätze für Personal.", max: 3,
    perks: ["+2 Personal", "+2 Personal", "+2 Personal"], costs: [c(500, { wood: 15, cloth: 6 }), c(1200, { wood: 25, scrap: 10, cloth: 10 }), c(2600, { wood: 30, scrap: 20, tools: 1 })], needsHq: [1, 2, 3] },
  storage: { name: "Lager & Tresor", short: "LAG", description: "Vergrößert den sicheren Behälter, der beim Tod erhalten bleibt.", max: 3,
    perks: ["Sicherer Behälter: 3 Plätze", "Sicherer Behälter: 4 Plätze", "Sicherer Behälter: 6 Plätze"], costs: [c(600, { scrap: 10, wood: 6 }), c(1500, { scrap: 20, parts: 2 }), c(3500, { scrap: 30, parts: 4, tools: 1 })], needsHq: [1, 2, 3] },
  workshop: { name: "Munitionswerkstatt", short: "MUN", description: "Techniker pressen Munition für das gewählte Kaliber.", max: 3,
    perks: ["9 mm und 5,56 mm", "+ 7,62 mm und Schrot, schneller", "+ panzerbrechend und .338"], costs: [c(750, { scrap: 15, parts: 1 }), c(1800, { scrap: 25, parts: 3 }), c(4200, { scrap: 35, parts: 4, electronics: 2 })], needsHq: [1, 2, 3], needsPower: [0, 0, 1] },
  armory: { name: "Waffenwerkstatt", short: "WAF", description: "Aufsätze montieren und herstellen.", max: 3,
    perks: ["Mündung, Griffe, Laser montieren", "+ Optiken und Magazine", "Aufsätze selbst herstellen"], costs: [c(900, { scrap: 15, tools: 1 }), c(2200, { scrap: 20, parts: 3, tools: 1 }), c(4800, { parts: 5, electronics: 3, tools: 2 })], needsHq: [1, 2, 3], needsPower: [0, 0, 1] },
  workbench: { name: "Werkbank", short: "WRK", description: "Stellt Medizin, Granaten, Westen und Rucksäcke aus Materialien her.", max: 3,
    perks: ["Verbände, Brandflaschen, Kampfrucksack", "Granaten, Trauma-Sets, Westen, Helme, Stimulanzien", "Plattenträger, Expeditionsrucksack, Serum"], costs: [c(400, { wood: 10, scrap: 8 }), c(1400, { wood: 10, scrap: 20, tools: 1 }), c(3600, { scrap: 30, parts: 4, tools: 2 })], needsHq: [1, 2, 3] },
  clinic: { name: "Feldlazarett", short: "SAN", description: "Sanitäter stellen Verbände und Trauma-Sets her und behandeln Infektionen.", max: 3,
    perks: ["Verbände", "+ Trauma-Sets, Infektion wird zwischen Einsätzen geheilt", "+ Antivirales Serum"], costs: [c(850, { wood: 8, cloth: 10 }), c(2000, { scrap: 15, chem: 4, medical: 2 }), c(4400, { chem: 8, electronics: 2, medical: 4 })], needsHq: [1, 2, 3], needsPower: [0, 1, 1] },
  kitchen: { name: "Küche & Brunnen", short: "KÜC", description: "Personal kocht Rationen und bereitet Wasser auf.", max: 3,
    perks: ["Wasserflaschen", "+ Konserven", "+ Feldrationen, doppelte Menge"], costs: [c(500, { wood: 12, scrap: 6 }), c(1300, { wood: 15, scrap: 15, parts: 1 }), c(3000, { scrap: 25, parts: 3, tools: 1 })], needsHq: [1, 2, 3] },
  generator: { name: "Generator", short: "GEN", description: "Strom für Labor, Lazarett und Werkstätten höherer Stufen.", max: 2,
    perks: ["Strom für Stufe-2/3-Gebäude", "Notstrom: Wachturm-Scheinwerfer, schnellere Produktion"], costs: [c(1500, { scrap: 20, parts: 4, fuel: 2 }), c(3800, { parts: 6, electronics: 3, fuel: 3 })], needsHq: [2, 3] },
  lab: { name: "Forschungslabor", short: "F&E", description: "Analysten erforschen dauerhafte Boni.", max: 3,
    perks: ["Grundlagenforschung", "Fortgeschrittene Programme", "Spitzenforschung"], costs: [c(1000, { scrap: 10, electronics: 1 }), c(2600, { electronics: 3, parts: 2, chem: 4 }), c(5500, { electronics: 6, sample: 1, tools: 2 })], needsHq: [1, 2, 3], needsPower: [0, 1, 1] },
  radio: { name: "Funkstation", short: "FUNK", description: "Empfängt Aufträge und Lageberichte aus der Sperrzone.", max: 3,
    perks: ["3 Auftragsangebote", "5 Auftragsangebote", "7 Angebote, in jedem Einsatz ein Versorgungsabwurf"], costs: [c(700, { scrap: 10, electronics: 1 }), c(1800, { scrap: 15, electronics: 2 }), c(4000, { electronics: 5, parts: 3 })], needsHq: [1, 2, 3], needsPower: [0, 1, 1] },
  walls: { name: "Schutzwall", short: "WALL", description: "Mauern und Barrikaden gegen Angriffe der Infizierten.", max: 3,
    perks: ["Holzpalisade (+20 Verteidigung)", "Betonmauer (+20)", "Stahltore und Stacheldraht (+20)"], costs: [c(400, { wood: 25 }), c(1500, { scrap: 30, wood: 10 }), c(3600, { scrap: 45, parts: 4 })], needsHq: [1, 2, 3] },
  tower: { name: "Wachturm", short: "TURM", description: "Wachen schießen bei Angriffen auf Infizierte.", max: 3,
    perks: ["1 Turm (+15 Verteidigung)", "2 Türme (+15)", "Scheinwerfer und MG (+20)"], costs: [c(600, { wood: 20, scrap: 6 }), c(1600, { wood: 15, scrap: 20 }), c(4200, { scrap: 30, parts: 3, electronics: 2 })], needsHq: [1, 2, 3] },
}
export const STRUCTURE_ORDER: StructureId[] = ["hq", "bunks", "storage", "workbench", "workshop", "armory", "clinic", "kitchen", "generator", "lab", "radio", "walls", "tower"]

export const STAFF_JOBS: Record<StaffJob, { name: string; structure: StructureId }> = {
  workshop: { name: "Techniker", structure: "workshop" }, clinic: { name: "Sanitäter", structure: "clinic" }, kitchen: { name: "Köche", structure: "kitchen" },
  lab: { name: "Analysten", structure: "lab" }, tower: { name: "Wachen", structure: "tower" },
}
export function staffCap(hq: number, bunks: number): number { return 1 + hq + bunks * 2 }
export function secureSlots(storage: number): number { return [2, 3, 4, 6][Math.max(0, Math.min(3, storage))] }

/** Defence rating of the compound against infected attacks. */
export function defenseRating(walls: number, tower: number, guards: number, generator: number): number {
  return walls * 20 + tower * 15 + (tower >= 3 ? 5 : 0) + Math.min(guards, tower * 2) * 8 + generator * 5
}

export type RecipeStation = "workbench" | "workshop" | "armory" | "clinic" | "kitchen"
export interface Recipe { id: string; station: RecipeStation; level: number; inputs: Partial<Record<ItemId, number>>; output: ItemId; qty: number; seconds: number }
const r = (id: string, station: RecipeStation, level: number, inputs: Partial<Record<ItemId, number>>, output: ItemId, qty: number, seconds: number): Recipe => ({ id, station, level, inputs, output, qty, seconds })
export const RECIPES: Recipe[] = [
  r("bandage", "workbench", 1, { cloth: 2 }, "bandage", 2, 20),
  r("molotov", "workbench", 1, { chem: 1, cloth: 1, scrap: 1 }, "molotov", 1, 30),
  r("pack_small", "workbench", 1, { cloth: 8, scrap: 3 }, "pack_small", 1, 120),
  r("grenade", "workbench", 2, { chem: 2, scrap: 2, parts: 1 }, "grenade", 1, 60),
  r("decoy", "workbench", 1, { electronics: 1, scrap: 1 }, "decoy", 2, 40),
  r("smoke", "workbench", 2, { chem: 2, scrap: 1, cloth: 1 }, "smoke", 1, 50),
  r("shocktrap", "workbench", 2, { electronics: 2, scrap: 3, parts: 1 }, "shocktrap", 1, 120),
  r("flashbang", "workbench", 3, { chem: 2, scrap: 2, parts: 1 }, "flashbang", 1, 70),
  r("medkit", "workbench", 2, { cloth: 2, chem: 1, medical: 1 }, "medkit", 1, 60),
  r("stim", "workbench", 2, { chem: 2, medical: 1 }, "stim", 1, 90),
  r("armor", "workbench", 2, { scrap: 8, cloth: 4, parts: 1 }, "armor", 1, 180),
  r("helmet", "workbench", 2, { scrap: 6, parts: 1, cloth: 2 }, "helmet", 1, 150),
  r("plate", "workbench", 3, { scrap: 10, parts: 4, tools: 1 }, "plate", 1, 300),
  r("pack_large", "workbench", 3, { cloth: 12, parts: 2, tools: 1 }, "pack_large", 1, 300),
  r("nvg", "workbench", 3, { electronics: 4, parts: 2, scrap: 3, tools: 1 }, "nvg", 1, 420),
  r("antiviral", "workbench", 3, { chem: 2, sample: 1 }, "antiviral", 2, 240),
  r("ammo_9mm", "workshop", 1, { scrap: 2, chem: 1 }, "ammo_9mm", 60, 45),
  r("ammo_556", "workshop", 1, { scrap: 3, chem: 1 }, "ammo_556", 60, 60),
  r("ammo_762", "workshop", 2, { scrap: 4, chem: 2 }, "ammo_762", 40, 75),
  r("ammo_12buck", "workshop", 2, { scrap: 3, chem: 1 }, "ammo_12buck", 24, 60),
  r("ammo_44", "workshop", 2, { scrap: 3, chem: 1 }, "ammo_44", 24, 60),
  r("ammo_45", "workshop", 2, { scrap: 3, chem: 1 }, "ammo_45", 40, 55),
  r("ammo_556ap", "workshop", 3, { scrap: 3, chem: 2, parts: 1 }, "ammo_556ap", 40, 120),
  r("ammo_762ap", "workshop", 3, { scrap: 4, chem: 2, parts: 1 }, "ammo_762ap", 30, 120),
  r("ammo_338", "workshop", 3, { scrap: 4, chem: 3, parts: 1 }, "ammo_338", 15, 150),
  r("ammo_bolt", "workshop", 1, { wood: 2, scrap: 1 }, "ammo_bolt", 8, 60),
  r("ammo_flare", "workshop", 1, { chem: 2, scrap: 1 }, "ammo_flare", 4, 60),
  r("att_comp", "armory", 3, { scrap: 5, parts: 1 }, "att_comp", 1, 180),
  r("att_vgrip", "armory", 3, { scrap: 4, wood: 2 }, "att_vgrip", 1, 150),
  r("att_suppressor", "armory", 3, { scrap: 6, parts: 2, tools: 1 }, "att_suppressor", 1, 360),
  r("att_reddot", "armory", 3, { electronics: 1, scrap: 3, parts: 1 }, "att_reddot", 1, 300),
  r("att_extmag", "armory", 3, { scrap: 6, parts: 1 }, "att_extmag", 1, 240),
  r("att_brake", "armory", 3, { scrap: 5, parts: 1, tools: 1 }, "att_brake", 1, 220),
  r("att_bipod", "armory", 3, { scrap: 6, parts: 1 }, "att_bipod", 1, 200),
  r("att_light", "armory", 3, { electronics: 1, scrap: 2 }, "att_light", 1, 180),
  r("att_drum", "armory", 3, { scrap: 10, parts: 2, tools: 1 }, "att_drum", 1, 420),
  r("att_flash", "armory", 3, { scrap: 4 }, "att_flash", 1, 150),
  r("att_hstop", "armory", 3, { scrap: 3, wood: 1 }, "att_hstop", 1, 120),
  r("att_fastmag", "armory", 3, { scrap: 6, parts: 1, cloth: 1 }, "att_fastmag", 1, 220),
  r("att_minired", "armory", 3, { electronics: 1, scrap: 2 }, "att_minired", 1, 240),
  r("att_bigsup", "armory", 3, { scrap: 10, parts: 3, tools: 1 }, "att_bigsup", 1, 480),
  r("water_clean", "kitchen", 1, { }, "water", 1, 180),
  r("canned_cook", "kitchen", 2, { scrap: 1 }, "canned", 1, 240),
  r("mre_cook", "kitchen", 3, { canned: 1, water: 1 }, "mre", 1, 300),
  r("bandage_clinic", "clinic", 1, { cloth: 1 }, "bandage", 2, 60),
  r("medkit_clinic", "clinic", 2, { cloth: 2, chem: 1 }, "medkit", 1, 180),
  r("antiviral_clinic", "clinic", 3, { chem: 3, medical: 1 }, "antiviral", 1, 400),
]

/** Passive production per staff member (items per hour of real time, capped offline at 2 h). */
export const PRODUCTION: Record<"workshop" | "clinic" | "kitchen", { perHour: number; describe: string }> = {
  workshop: { perHour: 90, describe: "Patronen des gewählten Kalibers" },
  clinic: { perHour: 4, describe: "Verbände (Stufe 2: Trauma-Sets)" },
  kitchen: { perHour: 5, describe: "Wasser und Konserven" },
}

export type ResearchId = "ballistics" | "plating" | "fieldmed" | "metabolism" | "broker" | "recon" | "immunology" | "scavenger" | "logistics"
export const RESEARCH: Record<ResearchId, { name: string; description: string; money: number; items: Partial<Record<ItemId, number>>; seconds: number; labLevel: number }> = {
  ballistics: { name: "Ballistik-Optimierung", description: "+15 % Waffenschaden mit allen Schusswaffen.", money: 900, items: { parts: 1 }, seconds: 60, labLevel: 1 },
  plating: { name: "Verbundplatten", description: "+25 Rüstung beim Einsatzstart, wenn eine Weste getragen wird.", money: 800, items: { scrap: 10 }, seconds: 60, labLevel: 1 },
  fieldmed: { name: "Feldmedizin", description: "Medizin heilt 40 % mehr und wirkt schneller.", money: 950, items: { medical: 1 }, seconds: 75, labLevel: 1 },
  metabolism: { name: "Rationierung", description: "Hunger und Durst steigen 30 % langsamer.", money: 700, items: { canned: 2 }, seconds: 60, labLevel: 1 },
  broker: { name: "Graumarkt-Kontakte", description: "+20 % Verkaufserlös beim Händler.", money: 1100, items: { intel: 1 }, seconds: 90, labLevel: 2 },
  recon: { name: "Aufklärungsdrohne", description: "Behälter erscheinen aus 45 m statt 18 m auf dem Kompass.", money: 1300, items: { electronics: 1 }, seconds: 100, labLevel: 2 },
  immunology: { name: "Immunologie", description: "Infektionen steigen 40 % langsamer.", money: 1500, items: { sample: 1 }, seconds: 120, labLevel: 2 },
  scavenger: { name: "Plündertaktik", description: "Behälter enthalten einen zusätzlichen Gegenstand.", money: 1800, items: { intel: 2 }, seconds: 150, labLevel: 3 },
  logistics: { name: "Schnelle Evakuierung", description: "Hubschrauber und Boot sind 40 % schneller da.", money: 1600, items: { fuel: 1 }, seconds: 120, labLevel: 3 },
}
export const RESEARCH_ORDER: ResearchId[] = ["ballistics", "plating", "fieldmed", "metabolism", "broker", "recon", "immunology", "scavenger", "logistics"]

export type TimeOfDay = "dawn" | "day" | "dusk" | "night"
export const TIMES: Record<TimeOfDay, { name: string; clock: string; visionScale: number; infected: number; loot: number }> = {
  dawn: { name: "Morgengrauen", clock: "05:40", visionScale: 0.75, infected: 1, loot: 0 },
  day: { name: "Tag", clock: "13:10", visionScale: 1, infected: 0.8, loot: 0 },
  dusk: { name: "Abenddämmerung", clock: "19:30", visionScale: 0.8, infected: 1.1, loot: 0.1 },
  night: { name: "Nacht", clock: "02:20", visionScale: 0.5, infected: 1.5, loot: 0.25 },
}
export const TIME_ORDER: TimeOfDay[] = ["dawn", "day", "dusk", "night"]

export type ContractKind = "fetch" | "killInfected" | "killMerc" | "killKind" | "boss" | "recon" | "activate"
export interface ContractTemplate { kind: ContractKind; title: string; text: string; minHq: number }
export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  { kind: "fetch", title: "Lieferung", text: "Beschaffen Sie {qty}× {item} und bringen Sie sie zur Basis.", minHq: 1 },
  { kind: "killInfected", title: "Säuberung", text: "Neutralisieren Sie {qty} Infizierte in der Sperrzone.", minHq: 1 },
  { kind: "killMerc", title: "Kopfgeld", text: "Schalten Sie {qty} Söldner aus.", minHq: 1 },
  { kind: "killKind", title: "Gezielte Jagd", text: "Töten Sie {qty}× {kind}.", minHq: 2 },
  { kind: "recon", title: "Aufklärung", text: "Erkunden Sie {place} und extrahieren Sie lebend.", minHq: 1 },
  { kind: "activate", title: "Sabotage", text: "Aktivieren Sie {target} und extrahieren Sie lebend.", minHq: 2 },
  { kind: "boss", title: "Der Koloss", text: "Töten Sie den Koloss im Forschungslabor.", minHq: 3 },
]

/** Base attacks: threat rises with every raid; at the threshold an attack is due when the player returns. */
export const BASE_ATTACK = { threatPerRaid: 9, threatPerHour: 3, threshold: 60, lossFraction: 0.25 } as const
