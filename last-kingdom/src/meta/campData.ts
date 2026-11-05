// The safe camp: buildings, upgrade costs and what each level unlocks.

import type { CampBuildingDef } from "../core/types"

export const CAMP_BUILDINGS: CampBuildingDef[] = [
  {
    id: "smithy",
    name: "Schmiede",
    description: "Schmiedet Waffen, Rüstungen und Stahl. Repariert Ausrüstung.",
    maxLevel: 3,
    levels: [
      { gold: 150, cost: { wood: 10, iron: 8 }, effect: "Einfache Waffen und Helme, Reparatur" },
      { gold: 500, cost: { wood: 20, iron: 20, leather: 6 }, effect: "Stahl, Kettenhemd, Ritterwaffen, Waffen-Upgrades +1" },
      { gold: 1500, cost: { steel: 15, silver: 4, wood: 30 }, effect: "Plattenharnisch, Königsklinge, Upgrades +3" },
    ],
  },
  {
    id: "armory",
    name: "Waffenkammer",
    description: "Bewahrt Ausrüstung sicher auf und erweitert die Schnellzugriffe.",
    maxLevel: 3,
    levels: [
      { gold: 100, cost: { wood: 12 }, effect: "Zweiter Schnellzugriff-Platz" },
      { gold: 400, cost: { wood: 20, iron: 10 }, effect: "Dritter Schnellzugriff-Platz, +10 % Haltbarkeit" },
      { gold: 1200, cost: { steel: 8, wood: 30, cloth: 10 }, effect: "Vierter Schnellzugriff-Platz, +25 % Haltbarkeit" },
    ],
  },
  {
    id: "storage",
    name: "Lagerhaus",
    description: "Mehr Platz für Beute und Material.",
    maxLevel: 3,
    levels: [
      { gold: 80, cost: { wood: 10 }, effect: "+20 Lagerplätze, +4 Rucksackplätze" },
      { gold: 300, cost: { wood: 24, iron: 6 }, effect: "+40 Lagerplätze, +4 Rucksackplätze, +6 kg Tragkraft" },
      { gold: 900, cost: { wood: 40, iron: 16, cloth: 10 }, effect: "+80 Lagerplätze, +6 Rucksackplätze, +10 kg Tragkraft" },
    ],
  },
  {
    id: "infirmary",
    name: "Krankenstation",
    description: "Heilt, kocht und stärkt für die nächste Expedition.",
    maxLevel: 3,
    levels: [
      { gold: 120, cost: { wood: 8, cloth: 8 }, effect: "Eintopf, +10 Lebenspunkte" },
      { gold: 450, cost: { wood: 16, cloth: 16, herbs: 10 }, effect: "+25 Lebenspunkte, Heilung +15 %" },
      { gold: 1300, cost: { wood: 30, silver: 2, herbs: 25 }, effect: "+50 Lebenspunkte, Heilung +30 %" },
    ],
  },
  {
    id: "merchant",
    name: "Händler",
    description: "Ein fahrender Händler, der im Lager bleibt, wenn man ihm einen Stand baut.",
    maxLevel: 3,
    levels: [
      { gold: 100, cost: { wood: 10, cloth: 4 }, effect: "Grundsortiment, Verkauf zu 40 %" },
      { gold: 350, cost: { wood: 20, cloth: 10, leather: 4 }, effect: "Seltene Waren, Verkauf zu 50 %" },
      { gold: 1000, cost: { wood: 30, silver: 3, cloth: 20 }, effect: "Epische Waren, Verkauf zu 60 %" },
    ],
  },
  {
    id: "workshop",
    name: "Werkstatt",
    description: "Baut Bögen, Schilde, Lederrüstung und Munition.",
    maxLevel: 3,
    levels: [
      { gold: 120, cost: { wood: 14, iron: 4 }, effect: "Pfeile, Bolzen, Gambeson, Tropfenschild" },
      { gold: 400, cost: { wood: 24, iron: 10, leather: 6 }, effect: "Langbogen, schwere Armbrust, Rüstungs-Upgrades" },
      { gold: 1100, cost: { wood: 40, steel: 6, leather: 12 }, effect: "Wildhüterbogen, Belagerungsarmbrust" },
    ],
  },
  {
    id: "alchemy",
    name: "Alchemielabor",
    description: "Tränke, Gegengift und Elixiere aus Kräutern und Knochen.",
    maxLevel: 3,
    levels: [
      { gold: 150, cost: { wood: 10, herbs: 6, bone: 4 }, effect: "Kleiner Heiltrank, Gegengift" },
      { gold: 500, cost: { wood: 16, herbs: 16, bone: 10 }, effect: "Großer Heiltrank, Elixiere" },
      { gold: 1400, cost: { silver: 3, herbs: 30, relic: 1 }, effect: "Elixier der Eile, Tränke wirken +25 %" },
    ],
  },
  {
    id: "defense",
    name: "Verteidigungsanlagen",
    description: "Palisaden und Wachen. Was im Lager liegt, bleibt sicher, und Versicherte Beute überlebt den Tod.",
    maxLevel: 3,
    levels: [
      { gold: 200, cost: { wood: 24 }, effect: "1 versicherter Rucksackplatz (bleibt beim Tod erhalten)" },
      { gold: 600, cost: { wood: 40, iron: 12 }, effect: "2 versicherte Plätze, Expeditionsstart mit +20 Ausdauer" },
      { gold: 1800, cost: { wood: 60, steel: 10, iron: 20 }, effect: "4 versicherte Plätze, ausgerüstete Waffe bleibt beim Tod erhalten" },
    ],
  },
]

export function buildingDef(id: string): CampBuildingDef {
  const b = CAMP_BUILDINGS.find((x) => x.id === id)
  if (!b) throw new Error(`unknown building ${id}`)
  return b
}

/** Effects derived from building levels; used by inventory, player and loot code. */
export function campBonuses(levels: Record<string, number>) {
  const lv = (id: string) => levels[id] ?? 0
  return {
    quickSlots: 1 + lv("armory"),
    durabilityPct: [0, 0.1, 0.25][Math.max(0, lv("armory") - 1)] ?? 0,
    stashSlots: 40 + [0, 20, 60, 140][lv("storage")],
    bagSlots: 16 + [0, 4, 8, 14][lv("storage")],
    carryKg: [0, 0, 6, 16][lv("storage")],
    hpBonus: [0, 10, 25, 50][lv("infirmary")],
    healPct: [0, 0, 0.15, 0.3][lv("infirmary")],
    sellRate: [0.3, 0.4, 0.5, 0.6][lv("merchant")],
    insuredSlots: [0, 1, 2, 4][lv("defense")],
    keepWeaponOnDeath: lv("defense") >= 3,
    startStamina: lv("defense") >= 2 ? 20 : 0,
    potionPct: lv("alchemy") >= 3 ? 0.25 : 0,
  }
}
