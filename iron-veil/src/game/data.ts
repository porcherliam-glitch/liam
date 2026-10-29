import type { BuildingId, ItemId, MissionId, ResearchId } from "./types"

export const ITEMS: Record<ItemId, { name: string; short: string; value: number; description: string; kind: "supply" | "loot" }> = {
  ammo: { name: "5,56-mm-Munition", short: "MUN", value: 2, description: "30 Schuss pro Einheitspaket im Raid.", kind: "supply" },
  medkit: { name: "Trauma-Set", short: "MED", value: 180, description: "Stellt im Einsatz 45 Gesundheit wieder her.", kind: "supply" },
  armor: { name: "Schutzweste", short: "ARM", value: 400, description: "Ausrüsten gewährt 55 Rüstung.", kind: "supply" },
  parts: { name: "Maschinenteile", short: "PRT", value: 140, description: "Robuste Industrie-Komponenten.", kind: "loot" },
  intel: { name: "Verschlüsselte Daten", short: "INT", value: 260, description: "Taktische Informationen für den Händler.", kind: "loot" },
  electronics: { name: "Militärelektronik", short: "ELC", value: 380, description: "Seltene Steuer- und Sensormodule.", kind: "loot" },
  medical: { name: "Medizinische Güter", short: "MED", value: 220, description: "Gebundelte Sanitätsmaterialien.", kind: "loot" },
  relic: { name: "Prototypenkern", short: "CORE", value: 650, description: "Hochwertiges Forschungsartefakt.", kind: "loot" },
}

export const MISSIONS: Record<MissionId, {
  name: string; code: string; location: string; description: string; threat: string
  enemies: number; lootRequired: number; reward: number; resources: number; time: number
  unlock: string; seed: number; color: number
}> = {
  greyzone: {
    name: "Grauzone", code: "IV-01", location: "Industrierand · 06:40", threat: "NIEDRIG",
    description: "Bergen Sie zwei Versorgungskisten und erreichen Sie den südöstlichen Evakuierungspunkt.",
    enemies: 5, lootRequired: 2, reward: 650, resources: 24, time: 360, unlock: "Verfügbar", seed: 1701, color: 0x61d6b5,
  },
  harbor: {
    name: "Stahlhafen", code: "IV-02", location: "Containerterminal · 19:20", threat: "ERHÖHT",
    description: "Sichern Sie drei Frachtdepots. Schwere Einheiten bewachen das Terminal.",
    enemies: 7, lootRequired: 3, reward: 1050, resources: 36, time: 420, unlock: "Kommando Ebene 2", seed: 2903, color: 0xe8ad55,
  },
  blacksite: {
    name: "Nachtgitter", code: "IV-03", location: "Sperranlage · 02:10", threat: "HOCH",
    description: "Dringen Sie in die Blacksite ein und extrahieren Sie vier Datendepots unter Gegenwehr.",
    enemies: 9, lootRequired: 4, reward: 1750, resources: 52, time: 480, unlock: "Kommando Ebene 3", seed: 4815, color: 0xef6a5b,
  },
}

export const BUILDINGS: Record<BuildingId, { name: string; code: string; description: string; baseMoney: number; baseResources: number; max: number }> = {
  hq: { name: "Kommandozentrale", code: "CMD", description: "Erhöht PersonalLimit und öffnet riskantere Operationen.", baseMoney: 1200, baseResources: 30, max: 3 },
  workshop: { name: "Munitionswerkstatt", code: "AMMO", description: "Techniker fertigen regelmäßig Munitionspakete.", baseMoney: 750, baseResources: 20, max: 3 },
  lab: { name: "Forschungslabor", code: "R&D", description: "Analysten erforschen dauerhafte Unternehmensboni.", baseMoney: 1000, baseResources: 28, max: 3 },
  clinic: { name: "Feldlazarett", code: "MED", description: "Sanitäter stellen Trauma-Sets für kommende Raids her.", baseMoney: 850, baseResources: 22, max: 3 },
}

export const RESEARCH: Record<ResearchId, { name: string; description: string; money: number; resources: number; seconds: number }> = {
  ballistics: { name: "Ballistik-Optimierung", description: "+15 % Waffenschaden in allen Operationen.", money: 900, resources: 24, seconds: 35 },
  plating: { name: "Verbundplatten", description: "+25 zusätzliche Rüstung beim Einsatzstart.", money: 800, resources: 22, seconds: 30 },
  broker: { name: "Graumarkt-Kontakte", description: "+20 % Verkaufserlös für gesicherte Beute.", money: 1100, resources: 30, seconds: 45 },
}

export function buildingCost(id: BuildingId, currentLevel: number) {
  const b = BUILDINGS[id]
  const factor = currentLevel === 0 ? 1 : currentLevel + 0.65
  return { money: Math.round(b.baseMoney * factor), resources: Math.round(b.baseResources * factor) }
}

export function staffCap(hqLevel: number) { return 2 + Math.max(0, hqLevel - 1) * 2 }
export function xpForLevel(level: number) { return 600 + (level - 1) * 450 }
