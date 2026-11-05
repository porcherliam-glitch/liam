// Player classes selectable at character creation.

import type { PlayerClassDef } from "../core/types"

export const CLASSES: PlayerClassDef[] = [
  {
    id: "knight",
    name: "Ritter",
    description: "Ein Veteran der Königsgarde. Hohe Lebenskraft, Schild und Schwert. Steckt viel ein und hält die Linie.",
    hp: 140,
    stamina: 100,
    carry: 42,
    startItems: [
      { id: "bandage", qty: 3 },
      { id: "bread", qty: 2 },
    ],
    startEquipment: { mainHand: "longsword_1", offHand: "shield_wood", body: "armor_gambeson", head: "helm_kettle" },
    bonus: "+10 % Blockwirkung, +15 Tragkraft",
  },
  {
    id: "ranger",
    name: "Waldläufer",
    description: "Jäger aus den Grenzwäldern. Bogen, leichte Rüstung und schnelle Beine. Tötet, bevor es gefährlich wird.",
    hp: 110,
    stamina: 120,
    carry: 36,
    startItems: [
      { id: "arrow", qty: 40 },
      { id: "bandage", qty: 3 },
      { id: "dried_meat", qty: 2 },
    ],
    startEquipment: { mainHand: "bow_1", body: "armor_leather", head: "helm_hood", quick1: "shortsword_1" },
    bonus: "+15 % Fernkampfschaden, schnelleres Spannen",
  },
  {
    id: "rogue",
    name: "Schattendieb",
    description: "Lebte schon vor der Seuche von dem, was andere verloren haben. Dolche, kritische Treffer und ein Auge für Beute.",
    hp: 100,
    stamina: 130,
    carry: 34,
    startItems: [
      { id: "bandage", qty: 4 },
      { id: "potion_small", qty: 1 },
      { id: "bread", qty: 2 },
    ],
    startEquipment: { mainHand: "dagger_1", body: "armor_leather", head: "helm_hood", quick1: "shortsword_1" },
    bonus: "+10 % kritische Trefferchance, bessere Beute",
  },
]

export function classDef(id: string): PlayerClassDef {
  const c = CLASSES.find((x) => x.id === id)
  if (!c) throw new Error(`unknown class ${id}`)
  return c
}
