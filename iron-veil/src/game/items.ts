/**
 * items.ts — the item catalog: ammunition, attachments, medicine, food, throwables, gear, building materials,
 * valuables, keys and weapons as loot. Pure data. Every item has weight (kg), stack size per backpack slot,
 * rarity (0 common … 4 legendary) and a trader value; sellPrice() gives what the trader pays.
 */
import { AMMO, ATTACHMENTS, WEAPONS, WEAPON_ORDER, type AmmoId, type AttachmentId, type WeaponId } from "./weaponData"

export type SupplyId = "bandage" | "medkit" | "painkiller" | "antiviral" | "stim" | "canned" | "mre" | "water" | "soda" | "grenade" | "molotov"
export type GearId = "armor" | "plate" | "helmet" | "pack_small" | "pack_large"
export type MaterialId = "scrap" | "wood" | "cloth" | "chem" | "parts" | "electronics" | "fuel" | "tools"
export type ValuableId = "intel" | "medical" | "relic" | "gold" | "watch" | "sample" | "dogtag"
export type KeyId = "keycard_lab" | "key_tunnel"
export type WeaponItemId = `w_${WeaponId}`
export type ItemId = AmmoId | AttachmentId | SupplyId | GearId | MaterialId | ValuableId | KeyId | WeaponItemId
export type ItemCategory = "ammo" | "attachment" | "medical" | "food" | "throwable" | "gear" | "material" | "valuable" | "key" | "weapon"

/** Effects of using an item in a raid (Q quick-heal picks the best medical item). */
export interface UseDef {
  /** Seconds to apply (the weapon is lowered meanwhile). */
  time: number
  heal?: number
  /** Stops bleeding up to this severity. */
  stopBleed?: "light" | "heavy"
  energy?: number
  water?: number
  /** Negative = cures infection. */
  infection?: number
  stamina?: number
  /** Seconds of painkiller effect (no low-health slowdown, steadier aim). */
  painkiller?: number
  /** Seconds of +15 % movement speed and fast stamina regeneration. */
  boost?: number
}

export interface ItemDef {
  id: ItemId
  name: string
  short: string
  cat: ItemCategory
  description: string
  /** Trader buy price (per piece / per round). */
  value: number
  weight: number
  /** Pieces per backpack slot. */
  stack: number
  rarity: number
  /** Player level needed to buy it from the trader; 0 = not sold. */
  trader: number
  use?: UseDef
}

const item = (id: ItemId, cat: ItemCategory, name: string, short: string, description: string, value: number, weight: number, stack: number, rarity: number, trader: number, use?: UseDef): ItemDef =>
  ({ id, cat, name, short, description, value, weight, stack, rarity, trader, use })

const BASE: ItemDef[] = [
  // ammunition (value/weight per round)
  item("ammo_9mm", "ammo", AMMO.ammo_9mm.name, "9MM", AMMO.ammo_9mm.description, 2, 0.012, 60, 0, 1),
  item("ammo_44", "ammo", AMMO.ammo_44.name, ".44", AMMO.ammo_44.description, 5, 0.02, 36, 1, 2),
  item("ammo_556", "ammo", AMMO.ammo_556.name, "5,56", AMMO.ammo_556.description, 3, 0.012, 60, 0, 1),
  item("ammo_556ap", "ammo", AMMO.ammo_556ap.name, "5,56AP", AMMO.ammo_556ap.description, 7, 0.012, 60, 2, 3),
  item("ammo_762", "ammo", AMMO.ammo_762.name, "7,62", AMMO.ammo_762.description, 4, 0.025, 60, 1, 2),
  item("ammo_762ap", "ammo", AMMO.ammo_762ap.name, "7,62AP", AMMO.ammo_762ap.description, 9, 0.025, 60, 2, 4),
  item("ammo_12buck", "ammo", AMMO.ammo_12buck.name, "SCHROT", AMMO.ammo_12buck.description, 4, 0.04, 30, 0, 2),
  item("ammo_12slug", "ammo", AMMO.ammo_12slug.name, "SLUG", AMMO.ammo_12slug.description, 6, 0.04, 30, 1, 3),
  item("ammo_338", "ammo", AMMO.ammo_338.name, ".338", AMMO.ammo_338.description, 14, 0.05, 30, 3, 5),
  // medicine
  item("bandage", "medical", "Verband", "VERB", "Stoppt leichte Blutungen, +8 Gesundheit.", 60, 0.1, 5, 0, 1, { time: 2.2, heal: 8, stopBleed: "light" }),
  item("medkit", "medical", "Trauma-Set", "MED", "+45 Gesundheit, stoppt alle Blutungen.", 180, 0.6, 2, 1, 1, { time: 3.2, heal: 45, stopBleed: "heavy" }),
  item("painkiller", "medical", "Schmerzmittel", "PILL", "60 s ohne Schmerz: keine Verlangsamung bei niedriger Gesundheit, ruhigeres Zielen.", 120, 0.05, 4, 1, 2, { time: 1.4, painkiller: 60 }),
  item("antiviral", "medical", "Antivirales Serum", "SERUM", "Senkt die Infektion um 60 %.", 320, 0.1, 2, 2, 2, { time: 2.6, infection: -60 }),
  item("stim", "medical", "Kampfstimulans", "STIM", "30 s schneller laufen, Ausdauer erholt sich sofort.", 260, 0.05, 3, 2, 3, { time: 1, boost: 30, stamina: 100 }),
  // food & water
  item("canned", "food", "Konservendose", "DOSE", "+35 Energie.", 45, 0.4, 3, 0, 1, { time: 2.5, energy: 35 }),
  item("mre", "food", "Feldration", "EPA", "+65 Energie, +10 Wasser.", 110, 0.6, 2, 1, 2, { time: 3.5, energy: 65, water: 10 }),
  item("water", "food", "Wasserflasche", "H2O", "+45 Wasser.", 35, 0.6, 2, 0, 1, { time: 2, water: 45 }),
  item("soda", "food", "Energydrink", "ENRG", "+25 Wasser, volle Ausdauer.", 60, 0.35, 3, 1, 1, { time: 1.5, water: 25, stamina: 100 }),
  // throwables
  item("grenade", "throwable", "Splittergranate", "GRN", "Wurf mit G. Explodiert nach 2,2 Sekunden.", 220, 0.45, 3, 1, 2),
  item("molotov", "throwable", "Brandflasche", "MOLO", "Setzt eine Fläche für 8 Sekunden in Brand. Infizierte hassen Feuer.", 160, 0.7, 2, 1, 3),
  // gear
  item("armor", "gear", "Schutzweste", "WST", "Leichte Weste mit 55 Rüstung.", 400, 3.5, 1, 1, 1),
  item("plate", "gear", "Plattenträger", "PLT", "Schwere Platten mit 85 Rüstung.", 950, 7.5, 1, 2, 3),
  item("helmet", "gear", "Gefechtshelm", "HELM", "Fängt 40 % des Kopftreffer-Schadens ab (50 Haltbarkeit).", 520, 1.4, 1, 2, 2),
  item("pack_small", "gear", "Kampfrucksack", "RUCK", "16 Rucksackplätze statt 8.", 600, 1.2, 1, 1, 1),
  item("pack_large", "gear", "Expeditionsrucksack", "RUCK+", "24 Rucksackplätze und +10 kg Traglast.", 1500, 2.2, 1, 2, 3),
  // materials (base building, crafting)
  item("scrap", "material", "Altmetall", "MET", "Grundmaterial für Bau und Werkbank.", 25, 1, 10, 0, 1),
  item("wood", "material", "Bretter", "HOLZ", "Für Mauern, Türme und Baracken.", 18, 1.2, 10, 0, 1),
  item("cloth", "material", "Stoff", "STOF", "Für Verbände und Rucksäcke.", 15, 0.2, 10, 0, 1),
  item("chem", "material", "Chemikalien", "CHEM", "Für Medizin, Brandflaschen und Munition.", 70, 0.6, 5, 1, 2),
  item("parts", "material", "Maschinenteile", "TEIL", "Robuste Industrie-Komponenten.", 140, 1.5, 5, 1, 0),
  item("electronics", "material", "Militärelektronik", "ELEK", "Steuer- und Sensormodule.", 380, 0.5, 5, 2, 0),
  item("fuel", "material", "Treibstoffkanister", "FUEL", "Für den Generator und das Boot am Hafen.", 160, 5, 1, 1, 2),
  item("tools", "material", "Werkzeugsatz", "WERK", "Für höhere Ausbaustufen und Waffenaufsätze.", 260, 2, 2, 2, 0),
  // valuables (sold at full value)
  item("intel", "valuable", "Verschlüsselte Daten", "DATA", "Taktische Informationen. Gefragt bei Händler und Funkstation.", 260, 0.1, 3, 2, 0),
  item("medical", "valuable", "Medizinische Güter", "SAN", "Gebündelte Sanitätsmaterialien.", 220, 1, 3, 1, 0),
  item("relic", "valuable", "Prototypenkern", "KERN", "Hochwertiges Forschungsartefakt aus dem Labor.", 900, 1.5, 1, 3, 0),
  item("gold", "valuable", "Goldkette", "GOLD", "Klein, leicht, wertvoll.", 340, 0.05, 5, 2, 0),
  item("watch", "valuable", "Armbanduhr", "UHR", "Eine gute Uhr – irgendwer zahlt immer dafür.", 180, 0.1, 5, 1, 0),
  item("sample", "valuable", "Laborprobe", "PROBE", "Virusprobe aus dem Forschungslabor.", 650, 0.2, 3, 3, 0),
  item("dogtag", "valuable", "Erkennungsmarke", "TAG", "Von gefallenen Söldnern. Beweis für Aufträge.", 60, 0.02, 20, 0, 0),
  // keys
  item("keycard_lab", "key", "Labor-Schlüsselkarte", "KARTE", "Öffnet den Hochsicherheitstrakt und den Labor-Notausgang.", 1200, 0.02, 1, 3, 0),
  item("key_tunnel", "key", "Tunnelschlüssel", "SCHL", "Öffnet den Versorgungstunnel – eine sichere Extraktion.", 700, 0.05, 1, 2, 0),
]

const attachmentItems: ItemDef[] = (Object.keys(ATTACHMENTS) as AttachmentId[]).map(id => {
  const a = ATTACHMENTS[id]
  const value: Record<AttachmentId, number> = { att_reddot: 650, att_holo: 900, att_scope4x: 1500, att_suppressor: 1200, att_comp: 500, att_vgrip: 450, att_agrip: 550, att_extmag: 700, att_laser: 600 }
  return item(id, "attachment", a.name, a.name.slice(0, 5).toUpperCase(), a.description, value[id], 0.4, 1, id === "att_scope4x" || id === "att_suppressor" ? 2 : 1, id === "att_scope4x" ? 3 : 2)
})
const weaponItems: ItemDef[] = WEAPON_ORDER.map(id => {
  const w = WEAPONS[id]
  return item(`w_${id}` as WeaponItemId, "weapon", w.name, w.short, w.description, Math.max(150, w.price), w.weight, 1, w.rarity, 0)
})

export const ITEMS: Record<ItemId, ItemDef> = Object.fromEntries([...BASE, ...attachmentItems, ...weaponItems].map(d => [d.id, d])) as Record<ItemId, ItemDef>
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
export function isItemId(id: unknown): id is ItemId { return typeof id === "string" && id in ITEMS }
export function weaponItem(id: WeaponId): WeaponItemId { return `w_${id}` }
export function weaponOfItem(id: ItemId): WeaponId | null { return id.startsWith("w_") ? id.slice(2) as WeaponId : null }

/** What the trader pays per piece. Valuables and weapons at full/60 %, everything else at 45 %. */
export function sellPrice(id: ItemId, brokerBonus = false): number {
  const d = ITEMS[id], k = d.cat === "valuable" ? 1 : d.cat === "weapon" ? 0.6 : 0.45
  return Math.max(1, Math.round(d.value * k * (brokerBonus ? 1.2 : 1)))
}

export const RARITY_NAMES = ["Gewöhnlich", "Ungewöhnlich", "Selten", "Episch", "Legendär"]
export const RARITY_COLORS = ["#9aa4ad", "#4fbf5a", "#3f9dff", "#b86bff", "#ffb12b"]

/** Backpack slots and extra carry weight per backpack. */
export const BACKPACKS: Record<"none" | "pack_small" | "pack_large", { name: string; slots: number; weight: number }> = {
  none: { name: "Hüfttasche", slots: 8, weight: 0 },
  pack_small: { name: "Kampfrucksack", slots: 16, weight: 0 },
  pack_large: { name: "Expeditionsrucksack", slots: 24, weight: 10 },
}
/** Base carry limit (kg) before slowdown. */
export const CARRY_LIMIT = 32
