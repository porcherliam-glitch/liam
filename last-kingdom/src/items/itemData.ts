// Static item definitions: weapons, armour, consumables, materials, artefacts and quest items.
// Names and descriptions are German (player-facing); identifiers are English.

import type { Affix, ItemDef, Rarity, WeaponClass } from "../core/types"

const W = (
  id: string,
  name: string,
  weaponClass: WeaponClass,
  tier: number,
  rarity: Rarity,
  damage: number,
  speed: number,
  range: number,
  arc: number,
  stamina: number,
  impact: number,
  weight: number,
  value: number,
  description: string,
  extra: Partial<ItemDef> = {},
): ItemDef => ({
  id,
  name,
  kind: "weapon",
  rarity,
  description,
  weight,
  value,
  stack: 1,
  tier,
  model: `${weaponClass}_${tier}`,
  weapon: {
    weaponClass,
    damage,
    speed,
    range,
    arc,
    staminaCost: stamina,
    critChance: weaponClass === "dagger" ? 0.18 : weaponClass === "bow" || weaponClass === "crossbow" ? 0.12 : 0.07,
    critMultiplier: weaponClass === "dagger" ? 2.4 : 1.8,
    impact,
    twoHanded: weaponClass === "greatsword" || weaponClass === "spear" || weaponClass === "bow" || weaponClass === "crossbow",
    durability: 60 + tier * 40,
    ...(weaponClass === "bow" ? { ranged: { projectileSpeed: 42, ammoId: "arrow", drawTime: 0.55 } } : {}),
    ...(weaponClass === "crossbow" ? { ranged: { projectileSpeed: 58, ammoId: "bolt", drawTime: 1.1 } } : {}),
  },
  ...extra,
})

const ARC = Math.PI / 2.2

export const WEAPONS: ItemDef[] = [
  // Langschwert
  W("longsword_1", "Rostiges Langschwert", "longsword", 1, "common", 22, 1.25, 2.3, ARC, 14, 0.4, 3.2, 40, "Ein altes Schwert, das sein letztes Schlachtfeld überdauert hat. Zuverlässig, wenn auch stumpf."),
  W("longsword_2", "Geschmiedetes Langschwert", "longsword", 2, "uncommon", 34, 1.3, 2.3, ARC, 14, 0.45, 3.2, 180, "Ein sauber geschmiedetes Schwert aus der Lagerschmiede.", { craft: { building: "smithy", level: 1, cost: { iron: 6, wood: 2, leather: 1 }, gold: 60 } }),
  W("longsword_3", "Ritterschwert", "longsword", 3, "rare", 48, 1.35, 2.4, ARC, 13, 0.5, 3.0, 520, "Das Schwert eines gefallenen Ritters. Die Klinge ist noch immer scharf.", { craft: { building: "smithy", level: 2, cost: { iron: 14, steel: 4, leather: 2 }, gold: 220 } }),
  W("longsword_4", "Königsklinge", "longsword", 4, "legendary", 70, 1.4, 2.5, ARC, 12, 0.6, 2.9, 2400, "Aus der Waffenkammer des Königs. Es heißt, sie hat die erste Seuche gesehen.", { craft: { building: "smithy", level: 3, cost: { steel: 12, silver: 4, relic: 1 }, gold: 900 } }),
  // Kurzschwert
  W("shortsword_1", "Kurzschwert", "shortsword", 1, "common", 16, 1.8, 1.8, ARC, 9, 0.3, 1.8, 30, "Leicht und schnell. Die Waffe der Stadtwache."),
  W("shortsword_2", "Gehärtetes Kurzschwert", "shortsword", 2, "uncommon", 25, 1.9, 1.8, ARC, 9, 0.32, 1.8, 150, "Mit gehärteter Schneide. Schnelle Folgeangriffe.", { craft: { building: "smithy", level: 1, cost: { iron: 5, leather: 1 }, gold: 50 } }),
  W("shortsword_3", "Gladius des Legaten", "shortsword", 3, "rare", 36, 2.0, 1.9, ARC, 8, 0.35, 1.7, 460, "Ein Relikt aus der Zeit vor dem Königreich.", { craft: { building: "smithy", level: 2, cost: { iron: 10, steel: 3 }, gold: 200 } }),
  // Zweihänder
  W("greatsword_1", "Verrosteter Zweihänder", "greatsword", 1, "common", 42, 0.75, 3.0, Math.PI / 1.5, 24, 0.8, 7.0, 70, "Schwer, langsam, vernichtend. Trifft mehrere Gegner."),
  W("greatsword_2", "Söldner-Zweihänder", "greatsword", 2, "uncommon", 62, 0.8, 3.0, Math.PI / 1.5, 24, 0.85, 7.0, 280, "Die Waffe eines Landsknechts. Weite Schwünge.", { craft: { building: "smithy", level: 2, cost: { iron: 12, wood: 4, leather: 2 }, gold: 140 } }),
  W("greatsword_3", "Flammberg", "greatsword", 3, "epic", 88, 0.85, 3.2, Math.PI / 1.4, 22, 0.95, 6.8, 1100, "Die gewellte Klinge reißt tiefe Wunden.", { craft: { building: "smithy", level: 3, cost: { steel: 10, silver: 2 }, gold: 500 } }),
  // Streitaxt
  W("battleaxe_1", "Holzfälleraxt", "battleaxe", 1, "common", 30, 1.0, 2.1, ARC, 17, 0.6, 4.2, 35, "Eigentlich für Bäume gemacht. Zombies stören sie nicht."),
  W("battleaxe_2", "Streitaxt", "battleaxe", 2, "uncommon", 44, 1.05, 2.2, ARC, 17, 0.65, 4.2, 200, "Eine echte Kriegsaxt. Durchschlägt Rüstungen.", { craft: { building: "smithy", level: 1, cost: { iron: 7, wood: 3 }, gold: 70 } }),
  W("battleaxe_3", "Bartaxt des Nordens", "battleaxe", 3, "rare", 60, 1.1, 2.3, ARC, 16, 0.7, 4.0, 600, "Die Axt kam mit den Nordmännern. Der Bart hakt Schilde weg.", { craft: { building: "smithy", level: 2, cost: { iron: 12, steel: 4, wood: 4 }, gold: 260 } }),
  // Streitkolben
  W("mace_1", "Streitkolben", "mace", 1, "common", 28, 1.05, 2.0, ARC, 16, 0.75, 4.0, 40, "Stumpfe Gewalt. Betäubt selbst gepanzerte Gegner."),
  W("mace_2", "Morgenstern", "mace", 2, "uncommon", 40, 1.05, 2.0, ARC, 16, 0.85, 4.4, 210, "Eisenkugel mit Dornen. Starke Wucht.", { craft: { building: "smithy", level: 1, cost: { iron: 8, wood: 2 }, gold: 80 } }),
  W("mace_3", "Bischofsstab", "mace", 3, "epic", 58, 1.1, 2.1, ARC, 15, 0.95, 4.0, 1000, "Der eiserne Stab eines Kriegerbischofs, geweiht gegen Untote.", { craft: { building: "smithy", level: 3, cost: { steel: 8, silver: 3, relic: 1 }, gold: 480 } }),
  // Speer
  W("spear_1", "Jagdspeer", "spear", 1, "common", 24, 1.2, 3.2, Math.PI / 5, 12, 0.5, 3.0, 30, "Große Reichweite. Hält Gegner auf Abstand."),
  W("spear_2", "Pike", "spear", 2, "uncommon", 36, 1.2, 3.6, Math.PI / 5, 12, 0.55, 3.4, 170, "Lange Stoßwaffe der Fußsoldaten.", { craft: { building: "smithy", level: 1, cost: { iron: 4, wood: 6 }, gold: 60 } }),
  W("spear_3", "Partisane", "spear", 3, "rare", 50, 1.25, 3.6, Math.PI / 4, 12, 0.6, 3.4, 500, "Mit breiter Klinge und seitlichen Haken.", { craft: { building: "smithy", level: 2, cost: { iron: 10, steel: 3, wood: 6 }, gold: 230 } }),
  // Dolch
  W("dagger_1", "Dolch", "dagger", 1, "common", 12, 2.6, 1.4, ARC, 6, 0.15, 0.6, 20, "Schnell und leise. Hohe Chance auf kritische Treffer."),
  W("dagger_2", "Stilett", "dagger", 2, "uncommon", 18, 2.8, 1.4, ARC, 6, 0.15, 0.5, 130, "Dünne Klinge für Rüstungslücken.", { craft: { building: "smithy", level: 1, cost: { iron: 3, leather: 1 }, gold: 40 } }),
  W("dagger_3", "Meuchlerklinge", "dagger", 3, "epic", 28, 3.0, 1.5, ARC, 5, 0.2, 0.5, 900, "Geschwärzte Klinge. Tödlich im Rücken des Feindes.", { craft: { building: "smithy", level: 3, cost: { steel: 5, silver: 2 }, gold: 400 } }),
  // Bogen
  W("bow_1", "Jagdbogen", "bow", 1, "common", 26, 1, 40, 0, 8, 0.3, 1.5, 45, "Ein einfacher Bogen. Pfeile findet man überall."),
  W("bow_2", "Langbogen", "bow", 2, "uncommon", 40, 1, 45, 0, 8, 0.35, 1.7, 220, "Großer Eibenbogen mit hoher Durchschlagskraft.", { craft: { building: "workshop", level: 1, cost: { wood: 8, leather: 2, cloth: 2 }, gold: 90 } }),
  W("bow_3", "Bogen des Wildhüters", "bow", 3, "rare", 56, 1, 50, 0, 7, 0.4, 1.6, 650, "Lautlos und präzise.", { craft: { building: "workshop", level: 2, cost: { wood: 12, leather: 4, silver: 1 }, gold: 300 } }),
  // Armbrust
  W("crossbow_1", "Leichte Armbrust", "crossbow", 1, "common", 44, 1, 40, 0, 6, 0.6, 3.5, 70, "Langsam zu spannen, aber ein Bolzen reicht oft."),
  W("crossbow_2", "Schwere Armbrust", "crossbow", 2, "uncommon", 66, 1, 45, 0, 6, 0.7, 4.2, 300, "Durchschlägt Rüstung und Knochen.", { craft: { building: "workshop", level: 2, cost: { wood: 8, iron: 6, leather: 2 }, gold: 160 } }),
  W("crossbow_3", "Belagerungsarmbrust", "crossbow", 3, "epic", 96, 1, 50, 0, 5, 0.9, 4.8, 1200, "Aus der Festung. Ein Bolzen wirft selbst Brutale um.", { craft: { building: "workshop", level: 3, cost: { steel: 8, wood: 10, silver: 2 }, gold: 520 } }),
]

export const ARMOR: ItemDef[] = [
  { id: "armor_rags", name: "Lumpen", kind: "armor", rarity: "common", description: "Besser als nichts. Kaum.", weight: 1.5, value: 5, stack: 1, armor: { armor: 2, weight: 1.5, speedMultiplier: 1, staminaRegenMultiplier: 1 } },
  { id: "armor_gambeson", name: "Gambeson", kind: "armor", rarity: "common", description: "Gesteppte Stoffrüstung. Leicht und warm.", weight: 4, value: 60, stack: 1, armor: { armor: 8, weight: 4, speedMultiplier: 1, staminaRegenMultiplier: 1 }, craft: { building: "workshop", level: 1, cost: { cloth: 8, leather: 2 }, gold: 40 } },
  { id: "armor_leather", name: "Lederrüstung", kind: "armor", rarity: "uncommon", description: "Gehärtetes Leder. Die Wahl der Jäger.", weight: 6, value: 160, stack: 1, armor: { armor: 14, weight: 6, speedMultiplier: 1, staminaRegenMultiplier: 1 }, craft: { building: "workshop", level: 1, cost: { leather: 10, cloth: 4, iron: 2 }, gold: 90 } },
  { id: "armor_chain", name: "Kettenhemd", kind: "armor", rarity: "rare", description: "Tausende Ringe. Schwer, aber zuverlässig gegen Bisse.", weight: 12, value: 420, stack: 1, armor: { armor: 24, weight: 12, speedMultiplier: 0.95, staminaRegenMultiplier: 0.9 }, craft: { building: "smithy", level: 2, cost: { iron: 16, leather: 4 }, gold: 220 } },
  { id: "armor_brigandine", name: "Brigantine", kind: "armor", rarity: "epic", description: "Stahlplatten unter Samt vernietet.", weight: 14, value: 900, stack: 1, armor: { armor: 32, weight: 14, speedMultiplier: 0.94, staminaRegenMultiplier: 0.9 }, craft: { building: "smithy", level: 3, cost: { steel: 10, leather: 6, cloth: 6 }, gold: 450 } },
  { id: "armor_plate", name: "Plattenharnisch", kind: "armor", rarity: "legendary", description: "Die Rüstung der Königsgarde. Fast unverwundbar, fast unbeweglich.", weight: 22, value: 2600, stack: 1, armor: { armor: 45, weight: 22, speedMultiplier: 0.88, staminaRegenMultiplier: 0.8 }, craft: { building: "smithy", level: 3, cost: { steel: 20, silver: 4, leather: 6 }, gold: 1200 } },
]

export const HELMETS: ItemDef[] = [
  { id: "helm_hood", name: "Kapuze", kind: "helmet", rarity: "common", description: "Schützt vor Regen, nicht vor Zähnen.", weight: 0.5, value: 8, stack: 1, armor: { armor: 1, weight: 0.5, speedMultiplier: 1, staminaRegenMultiplier: 1 } },
  { id: "helm_kettle", name: "Eisenhut", kind: "helmet", rarity: "common", description: "Breite Krempe aus Eisen. Beliebt bei der Miliz.", weight: 2, value: 50, stack: 1, armor: { armor: 5, weight: 2, speedMultiplier: 1, staminaRegenMultiplier: 1 }, craft: { building: "smithy", level: 1, cost: { iron: 5 }, gold: 30 } },
  { id: "helm_nasal", name: "Nasalhelm", kind: "helmet", rarity: "uncommon", description: "Mit Nasenschutz, wie ihn die alten Könige trugen.", weight: 2.5, value: 140, stack: 1, armor: { armor: 9, weight: 2.5, speedMultiplier: 1, staminaRegenMultiplier: 1 }, craft: { building: "smithy", level: 2, cost: { iron: 8, leather: 2 }, gold: 80 } },
  { id: "helm_bascinet", name: "Beckenhaube", kind: "helmet", rarity: "rare", description: "Mit Visier. Die Welt wird schmal, aber sicher.", weight: 3.5, value: 380, stack: 1, armor: { armor: 14, weight: 3.5, speedMultiplier: 1, staminaRegenMultiplier: 0.95 }, craft: { building: "smithy", level: 2, cost: { steel: 4, iron: 6 }, gold: 180 } },
  { id: "helm_great", name: "Topfhelm des Kreuzritters", kind: "helmet", rarity: "epic", description: "Ein Helm aus einer Zeit, in der noch Menschen die Feinde waren.", weight: 4.5, value: 800, stack: 1, armor: { armor: 20, weight: 4.5, speedMultiplier: 0.98, staminaRegenMultiplier: 0.95 }, craft: { building: "smithy", level: 3, cost: { steel: 8, silver: 1 }, gold: 400 } },
]

export const SHIELDS: ItemDef[] = [
  { id: "shield_wood", name: "Holzschild", kind: "shield", rarity: "common", description: "Rundschild aus Lindenholz.", weight: 3, value: 25, stack: 1, model: "shield_round", shield: { blockReduction: 0.7, blockStaminaCost: 10, weight: 3, durability: 80 } },
  { id: "shield_kite", name: "Tropfenschild", kind: "shield", rarity: "uncommon", description: "Deckt den ganzen Körper. Eisenbeschlagen.", weight: 5, value: 140, stack: 1, model: "shield_kite", shield: { blockReduction: 0.8, blockStaminaCost: 9, weight: 5, durability: 140 }, craft: { building: "workshop", level: 1, cost: { wood: 6, iron: 4, leather: 2 }, gold: 60 } },
  { id: "shield_heater", name: "Dreieckschild", kind: "shield", rarity: "rare", description: "Stahlkante, Wappen eines vergessenen Hauses.", weight: 5.5, value: 400, stack: 1, model: "shield_heater", shield: { blockReduction: 0.86, blockStaminaCost: 8, weight: 5.5, durability: 200 }, craft: { building: "smithy", level: 2, cost: { steel: 4, wood: 6, leather: 2 }, gold: 200 } },
  { id: "shield_tower", name: "Turmschild", kind: "shield", rarity: "epic", description: "Eine wandelnde Mauer. Schwer, aber nichts kommt durch.", weight: 9, value: 950, stack: 1, model: "shield_tower", shield: { blockReduction: 0.94, blockStaminaCost: 7, weight: 9, durability: 320 }, craft: { building: "smithy", level: 3, cost: { steel: 10, wood: 8, iron: 6 }, gold: 480 } },
]

export const CONSUMABLES: ItemDef[] = [
  { id: "bread", name: "Hartes Brot", kind: "food", rarity: "common", description: "Alt, aber nahrhaft. Heilt langsam.", weight: 0.3, value: 4, stack: 10, consumable: { healOverTime: { amount: 20, seconds: 10 } } },
  { id: "dried_meat", name: "Dörrfleisch", kind: "food", rarity: "common", description: "Hält lange. Stellt Ausdauer wieder her.", weight: 0.3, value: 8, stack: 10, consumable: { healOverTime: { amount: 15, seconds: 8 }, stamina: 40 } },
  { id: "stew", name: "Deftiger Eintopf", kind: "food", rarity: "uncommon", description: "Aus der Lagerküche. Heilt und stärkt.", weight: 0.6, value: 25, stack: 5, consumable: { healOverTime: { amount: 50, seconds: 12 }, buff: { stat: "staminaRegen", value: 0.3, seconds: 90 } }, craft: { building: "infirmary", level: 1, cost: { herbs: 1, dried_meat: 1 }, gold: 5 } },
  { id: "bandage", name: "Verband", kind: "remedy", rarity: "common", description: "Stoppt Blutungen und heilt ein wenig.", weight: 0.1, value: 10, stack: 10, consumable: { heal: 25 } },
  { id: "potion_small", name: "Kleiner Heiltrank", kind: "remedy", rarity: "uncommon", description: "Bitter, aber wirksam.", weight: 0.3, value: 40, stack: 5, consumable: { heal: 50 }, craft: { building: "alchemy", level: 1, cost: { herbs: 3 }, gold: 10 } },
  { id: "potion_large", name: "Großer Heiltrank", kind: "remedy", rarity: "rare", description: "Schließt selbst tiefe Wunden.", weight: 0.4, value: 110, stack: 5, consumable: { heal: 120 }, craft: { building: "alchemy", level: 2, cost: { herbs: 6, bone: 1 }, gold: 30 } },
  { id: "antidote", name: "Gegengift", kind: "remedy", rarity: "uncommon", description: "Neutralisiert die Seuche im Blut.", weight: 0.2, value: 45, stack: 5, consumable: { cure: true, heal: 10 }, craft: { building: "alchemy", level: 1, cost: { herbs: 2, silver: 0 }, gold: 15 } },
  { id: "elixir_strength", name: "Elixier der Stärke", kind: "remedy", rarity: "rare", description: "Mehr Schaden für kurze Zeit.", weight: 0.3, value: 90, stack: 3, consumable: { buff: { stat: "damage", value: 0.25, seconds: 60 } }, craft: { building: "alchemy", level: 2, cost: { herbs: 4, bone: 2 }, gold: 40 } },
  { id: "elixir_iron", name: "Elixier der Eisenhaut", kind: "remedy", rarity: "rare", description: "Die Haut wird hart wie Stahl.", weight: 0.3, value: 90, stack: 3, consumable: { buff: { stat: "armor", value: 15, seconds: 60 } }, craft: { building: "alchemy", level: 2, cost: { herbs: 4, iron: 2 }, gold: 40 } },
  { id: "elixir_haste", name: "Elixier der Eile", kind: "remedy", rarity: "epic", description: "Die Beine werden leicht.", weight: 0.3, value: 150, stack: 3, consumable: { buff: { stat: "speed", value: 0.2, seconds: 45 } }, craft: { building: "alchemy", level: 3, cost: { herbs: 6, silver: 1 }, gold: 60 } },
]

export const AMMO: ItemDef[] = [
  { id: "arrow", name: "Pfeile", kind: "ammo", rarity: "common", description: "Für Bögen.", weight: 0.05, value: 2, stack: 40, craft: { building: "workshop", level: 1, cost: { wood: 1 }, gold: 2 } },
  { id: "bolt", name: "Bolzen", kind: "ammo", rarity: "common", description: "Für Armbrüste.", weight: 0.07, value: 3, stack: 30, craft: { building: "workshop", level: 1, cost: { wood: 1, iron: 1 }, gold: 3 } },
]

export const MATERIALS: ItemDef[] = [
  { id: "wood", name: "Holz", kind: "material", rarity: "common", description: "Bretter und Balken.", weight: 1, value: 3, stack: 50 },
  { id: "cloth", name: "Stoff", kind: "material", rarity: "common", description: "Leinen und Wolle.", weight: 0.3, value: 4, stack: 50 },
  { id: "leather", name: "Leder", kind: "material", rarity: "common", description: "Gegerbte Haut.", weight: 0.5, value: 8, stack: 50 },
  { id: "iron", name: "Eisen", kind: "material", rarity: "common", description: "Schrott, Nägel, Beschläge.", weight: 1.2, value: 10, stack: 50 },
  { id: "herbs", name: "Kräuter", kind: "material", rarity: "common", description: "Heilkräuter aus Wald und Garten.", weight: 0.1, value: 6, stack: 50 },
  { id: "bone", name: "Knochen", kind: "material", rarity: "common", description: "Für Alchemie und Werkzeuge.", weight: 0.4, value: 5, stack: 50 },
  { id: "steel", name: "Stahl", kind: "material", rarity: "uncommon", description: "Gehärtetes Eisen. Selten in den Ruinen.", weight: 1.5, value: 30, stack: 30, craft: { building: "smithy", level: 2, cost: { iron: 3 }, gold: 10 } },
  { id: "silver", name: "Silber", kind: "material", rarity: "rare", description: "Die Untoten scheuen es.", weight: 0.6, value: 80, stack: 20 },
  { id: "relic", name: "Reliquiensplitter", kind: "material", rarity: "epic", description: "Bruchstück eines geweihten Gegenstands.", weight: 0.2, value: 250, stack: 10 },
  { id: "plague_heart", name: "Pestherz", kind: "material", rarity: "legendary", description: "Das schwarze Herz eines Boss-Zombies. Schlägt noch.", weight: 1, value: 800, stack: 5 },
]

export const ARTIFACTS: ItemDef[] = [
  { id: "gold", name: "Gold", kind: "gold", rarity: "common", description: "Die Währung des alten Königreichs.", weight: 0, value: 1, stack: 999999 },
  { id: "candlestick", name: "Silberleuchter", kind: "artifact", rarity: "uncommon", description: "Aus einer Kirche. Wertvoll.", weight: 1.5, value: 90, stack: 5 },
  { id: "chalice", name: "Goldkelch", kind: "artifact", rarity: "rare", description: "Ein Messkelch aus purem Gold.", weight: 1.2, value: 260, stack: 5 },
  { id: "jewel_box", name: "Schmuckschatulle", kind: "artifact", rarity: "rare", description: "Ringe, Ketten und Perlen.", weight: 0.8, value: 320, stack: 5 },
  { id: "crown_fragment", name: "Kronensplitter", kind: "artifact", rarity: "epic", description: "Ein Stück der königlichen Krone.", weight: 0.4, value: 900, stack: 5 },
  { id: "saint_bones", name: "Heiligenknochen", kind: "artifact", rarity: "epic", description: "Reliquie aus dem Kloster. Händler zahlen alles dafür.", weight: 0.6, value: 750, stack: 5 },
  { id: "royal_seal", name: "Königssiegel", kind: "artifact", rarity: "legendary", description: "Das Siegel des letzten Königs.", weight: 0.3, value: 2500, stack: 1 },
  { id: "tapestry", name: "Wandteppich", kind: "artifact", rarity: "uncommon", description: "Schwer und wertvoll. Zeigt die Schlacht von Eschenfurt.", weight: 6, value: 180, stack: 2 },
  { id: "book", name: "Illuminierte Handschrift", kind: "artifact", rarity: "rare", description: "Jahrhunderte alte Schrift mit Goldrand.", weight: 1, value: 220, stack: 5 },
]

export const QUEST_ITEMS: ItemDef[] = [
  { id: "gate_key", name: "Torschlüssel", kind: "quest", rarity: "uncommon", description: "Öffnet das verriegelte Stadttor.", weight: 0.2, value: 0, stack: 1 },
  { id: "crypt_key", name: "Gruftschlüssel", kind: "quest", rarity: "uncommon", description: "Ein schwerer Schlüssel aus den Katakomben.", weight: 0.2, value: 0, stack: 1 },
  { id: "torch_item", name: "Fackel", kind: "quest", rarity: "common", description: "In der linken Hand getragen spendet sie Licht in der Nacht, lockt aber Untote an. Entzündet auch Leuchtfeuer.", weight: 0.5, value: 6, stack: 3 },
  { id: "oar", name: "Ruder", kind: "quest", rarity: "common", description: "Ohne Ruder fährt kein Boot.", weight: 2, value: 0, stack: 1 },
  { id: "lost_letter", name: "Verlorener Brief", kind: "quest", rarity: "uncommon", description: "Ein versiegelter Brief an die Königin. Lesbar.", weight: 0.05, value: 0, stack: 1 },
  { id: "abbot_journal", name: "Tagebuch des Abts", kind: "quest", rarity: "rare", description: "Beschreibt die ersten Tage der Seuche. Lesbar.", weight: 0.3, value: 0, stack: 1 },
  { id: "miller_note", name: "Zettel des Müllers", kind: "quest", rarity: "uncommon", description: "Hastig gekritzelte Zeilen. Lesbar.", weight: 0.05, value: 0, stack: 1 },
  { id: "huntsman_warning", name: "Warnung des Wildhüters", kind: "quest", rarity: "uncommon", description: "In Rinde geritzt. Lesbar.", weight: 0.1, value: 0, stack: 1 },
  { id: "castellan_orders", name: "Befehle des Kastellans", kind: "quest", rarity: "rare", description: "Mit dem Siegel von Rabenstein. Lesbar.", weight: 0.05, value: 0, stack: 1 },
  { id: "gravedigger_ledger", name: "Register des Totengräbers", kind: "quest", rarity: "uncommon", description: "Zahlen, Namen, Kalkflecken. Lesbar.", weight: 0.2, value: 0, stack: 1 },
  { id: "catacomb_inscription", name: "Abschrift einer Inschrift", kind: "quest", rarity: "rare", description: "Von einer Grabplatte abgerieben. Lesbar.", weight: 0.05, value: 0, stack: 1 },
  { id: "soldier_diary", name: "Tagebuch eines Soldaten", kind: "quest", rarity: "rare", description: "Die letzten Tage von Eisenwacht. Lesbar.", weight: 0.2, value: 0, stack: 1 },
  { id: "treasure_map", name: "Schatzkarte", kind: "quest", rarity: "rare", description: "Eine grob gezeichnete Karte mit einem Kreuz.", weight: 0.05, value: 0, stack: 1 },
  { id: "knight_banner", name: "Ritterbanner", kind: "quest", rarity: "rare", description: "Das Banner des Verseuchten Ritters.", weight: 1, value: 0, stack: 1 },
]

export const ALL_ITEMS: ItemDef[] = [...WEAPONS, ...ARMOR, ...HELMETS, ...SHIELDS, ...CONSUMABLES, ...AMMO, ...MATERIALS, ...ARTIFACTS, ...QUEST_ITEMS]

const byId = new Map<string, ItemDef>()
for (const item of ALL_ITEMS) {
  if (byId.has(item.id)) throw new Error(`duplicate item id ${item.id}`)
  byId.set(item.id, item)
}

export function itemDef(id: string): ItemDef {
  const def = byId.get(id)
  if (!def) throw new Error(`unknown item ${id}`)
  return def
}

export function hasItemDef(id: string): boolean {
  return byId.has(id)
}

export const AFFIXES: Affix[] = [
  { id: "wolf", name: "des Wolfs", prefix: false, damagePct: 0.12 },
  { id: "bear", name: "des Bären", prefix: false, damagePct: 0.08, impactPct: 0.2 },
  { id: "oak", name: "der Eiche", prefix: false, durabilityPct: 0.5 },
  { id: "night", name: "der Nacht", prefix: false, critChance: 0.08 },
  { id: "falcon", name: "des Falken", prefix: false, speedPct: 0.12 },
  { id: "saint", name: "des Heiligen", prefix: false, lifeOnHit: 2 },
  { id: "light", name: "Leichte", prefix: true, weightPct: -0.4 },
  { id: "sharp", name: "Scharfe", prefix: true, damagePct: 0.06, critChance: 0.03 },
  { id: "sturdy", name: "Robuste", prefix: true, armorPct: 0.15, durabilityPct: 0.25 },
  { id: "tireless", name: "Unermüdliche", prefix: true, staminaRegenPct: 0.2 },
  { id: "royal", name: "Königliche", prefix: true, valuePct: 0.5, damagePct: 0.05, armorPct: 0.05 },
  { id: "plague", name: "der Pest", prefix: false, damagePct: 0.18, durabilityPct: -0.2 },
]

const affixById = new Map(AFFIXES.map((a) => [a.id, a]))
export function affixDef(id: string): Affix | undefined {
  return affixById.get(id)
}
