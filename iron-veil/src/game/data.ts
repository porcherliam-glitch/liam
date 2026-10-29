/**
 * data.ts — all static game content and balance numbers (items, weapons, enemies, missions, buildings, research,
 * difficulty, side contracts). Pure data + tiny formulas, no three.js.
 */
import type { BuildingId, ContractId, Difficulty, EnemyKind, ItemId, MissionId, ResearchId, ThemeId, WeaponId } from "./types"

export type ItemKind = "supply" | "loot"
export const ITEMS: Record<ItemId, { name: string; short: string; value: number; description: string; kind: ItemKind; minLevel: number }> = {
  ammo: { name: "Munitionspaket", short: "MUN", value: 60, description: "Füllt die Reserve der Hauptwaffe auf (Menge je nach Waffe).", kind: "supply", minLevel: 1 },
  medkit: { name: "Trauma-Set", short: "MED", value: 180, description: "Stellt im Einsatz 45 Gesundheit wieder her (Taste Q).", kind: "supply", minLevel: 1 },
  armor: { name: "Schutzweste", short: "WST", value: 400, description: "Leichte Weste mit 55 Rüstung. Fängt 65 % des Schadens ab.", kind: "supply", minLevel: 1 },
  plate: { name: "Plattenträger", short: "PLT", value: 950, description: "Schwere Platten mit 85 Rüstung. Fängt 65 % des Schadens ab.", kind: "supply", minLevel: 3 },
  grenade: { name: "Splittergranate", short: "GRN", value: 220, description: "Wurf mit G. Explodiert nach 2,2 Sekunden.", kind: "supply", minLevel: 2 },
  parts: { name: "Maschinenteile", short: "PRT", value: 140, description: "Robuste Industrie-Komponenten.", kind: "loot", minLevel: 1 },
  medical: { name: "Medizinische Güter", short: "SAN", value: 220, description: "Gebündelte Sanitätsmaterialien.", kind: "loot", minLevel: 1 },
  intel: { name: "Verschlüsselte Daten", short: "INT", value: 260, description: "Taktische Informationen für den Händler.", kind: "loot", minLevel: 1 },
  electronics: { name: "Militärelektronik", short: "ELK", value: 380, description: "Seltene Steuer- und Sensormodule.", kind: "loot", minLevel: 1 },
  relic: { name: "Prototypenkern", short: "KERN", value: 650, description: "Hochwertiges Forschungsartefakt.", kind: "loot", minLevel: 1 },
}

export const ARMOR_VALUES = { armor: 55, plate: 85 } as const
export const MAX_MEDKITS = 3
export const MAX_GRENADES = 3

export type WeaponClass = "pistol" | "rifle" | "smg" | "shotgun" | "dmr"
export interface WeaponDef {
  id: WeaponId
  name: string
  short: string
  cls: WeaponClass
  description: string
  /** Damage per bullet/pellet before range falloff and hit zone. */
  damage: number
  pellets: number
  /** Seconds between shots. */
  fireInterval: number
  auto: boolean
  magazine: number
  /** Reload time in seconds (tactical reload with a round chambered is 15 % faster). */
  reload: number
  /** Rounds one ammo pack provides for this weapon; 0 = unlimited reserve (sidearm). */
  roundsPerPack: number
  /** Cone half-angles in radians. */
  spreadHip: number
  spreadAds: number
  /** Extra spread while moving (scaled by speed) and per shot fired (bloom). */
  spreadMove: number
  spreadPerShot: number
  /** Bloom recovery in rad/s. */
  spreadRecovery: number
  /** Camera kick per shot (radians). */
  recoilPitch: number
  recoilYaw: number
  /** Full damage up to rangeStart, linear falloff to minDamageFactor at rangeEnd (metres). */
  rangeStart: number
  rangeEnd: number
  minDamageFactor: number
  headMultiplier: number
  /** FOV multiplier while aiming. */
  adsZoom: number
  /** Seconds to fully aim. */
  adsTime: number
  /** Radius (m) in which enemies hear the shot. */
  noise: number
  moveSpeed: number
  price: number
  minLevel: number
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  p9: {
    id: "p9", name: "P9 Dienstpistole", short: "P9", cls: "pistol", description: "Zuverlässige Seitenwaffe mit unbegrenzter Reserve. Immer dabei.",
    damage: 24, pellets: 1, fireInterval: 0.15, auto: false, magazine: 15, reload: 1.35, roundsPerPack: 0,
    spreadHip: 0.02, spreadAds: 0.005, spreadMove: 0.02, spreadPerShot: 0.012, spreadRecovery: 0.12,
    recoilPitch: 0.02, recoilYaw: 0.006, rangeStart: 18, rangeEnd: 45, minDamageFactor: 0.6, headMultiplier: 2.1,
    adsZoom: 0.86, adsTime: 0.14, noise: 30, moveSpeed: 1.05, price: 0, minLevel: 1,
  },
  mk4: {
    id: "mk4", name: "MK-4 Sturmgewehr", short: "MK-4", cls: "rifle", description: "Vielseitiges Automatikgewehr. Kontrollierbarer Rückstoß, gute Reichweite.",
    damage: 30, pellets: 1, fireInterval: 0.1, auto: true, magazine: 30, reload: 1.9, roundsPerPack: 30,
    spreadHip: 0.03, spreadAds: 0.004, spreadMove: 0.025, spreadPerShot: 0.0045, spreadRecovery: 0.09,
    recoilPitch: 0.011, recoilYaw: 0.005, rangeStart: 35, rangeEnd: 85, minDamageFactor: 0.7, headMultiplier: 2,
    adsZoom: 0.72, adsTime: 0.2, noise: 48, moveSpeed: 1, price: 1400, minLevel: 1,
  },
  vx9: {
    id: "vx9", name: "VX-9 Maschinenpistole", short: "VX-9", cls: "smg", description: "Sehr hohe Feuerrate auf kurze Distanz. Leise und beweglich.",
    damage: 21, pellets: 1, fireInterval: 0.068, auto: true, magazine: 32, reload: 1.7, roundsPerPack: 40,
    spreadHip: 0.026, spreadAds: 0.009, spreadMove: 0.012, spreadPerShot: 0.0035, spreadRecovery: 0.12,
    recoilPitch: 0.008, recoilYaw: 0.006, rangeStart: 15, rangeEnd: 45, minDamageFactor: 0.55, headMultiplier: 1.8,
    adsZoom: 0.8, adsTime: 0.15, noise: 36, moveSpeed: 1.06, price: 1650, minLevel: 2,
  },
  kv12: {
    id: "kv12", name: "KV-12 Schrotflinte", short: "KV-12", cls: "shotgun", description: "Vorderschaftrepetierer mit neun Schrotkugeln. Verheerend auf kurze Distanz.",
    damage: 14, pellets: 9, fireInterval: 0.85, auto: false, magazine: 6, reload: 2.6, roundsPerPack: 12,
    spreadHip: 0.06, spreadAds: 0.045, spreadMove: 0.01, spreadPerShot: 0, spreadRecovery: 0.2,
    recoilPitch: 0.06, recoilYaw: 0.012, rangeStart: 8, rangeEnd: 28, minDamageFactor: 0.25, headMultiplier: 1.6,
    adsZoom: 0.85, adsTime: 0.2, noise: 55, moveSpeed: 0.97, price: 2300, minLevel: 2,
  },
  dr7: {
    id: "dr7", name: "DR-7 Präzisionsgewehr", short: "DR-7", cls: "dmr", description: "Halbautomatisches Präzisionsgewehr mit Zielfernrohr. Zwei Treffer genügen meist.",
    damage: 72, pellets: 1, fireInterval: 0.33, auto: false, magazine: 10, reload: 2.2, roundsPerPack: 15,
    spreadHip: 0.05, spreadAds: 0.0012, spreadMove: 0.03, spreadPerShot: 0.02, spreadRecovery: 0.1,
    recoilPitch: 0.04, recoilYaw: 0.008, rangeStart: 60, rangeEnd: 130, minDamageFactor: 0.85, headMultiplier: 2.2,
    adsZoom: 0.42, adsTime: 0.28, noise: 62, moveSpeed: 0.94, price: 3800, minLevel: 3,
  },
}
export const PRIMARY_WEAPONS: WeaponId[] = ["mk4", "vx9", "kv12", "dr7"]

export type EnemyWeapon = "rifle" | "smg" | "shotgun" | "sniper"
export interface EnemyDef {
  name: string
  health: number
  /** Fraction of body damage absorbed by armour (head and limbs are unarmoured). */
  armor: number
  walkSpeed: number
  runSpeed: number
  /** Sight distance (m) in daylight; night themes scale it by THEMES[x].visionScale. */
  vision: number
  /** Full horizontal field of view in degrees. */
  fov: number
  /** Damage per bullet that hits (before difficulty and the player's armour). */
  damage: number
  burstMin: number
  burstMax: number
  /** Seconds between bullets inside a burst. */
  burstInterval: number
  /** Pause between bursts. */
  burstPause: number
  /** Maximum engagement range (m). */
  range: number
  /** Base probability that a bullet hits a still, standing player at 10 m. */
  accuracy: number
  weapon: EnemyWeapon
  xp: number
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: { name: "Späher", health: 70, armor: 0, walkSpeed: 2.2, runSpeed: 4.6, vision: 38, fov: 120, damage: 7, burstMin: 3, burstMax: 5, burstInterval: 0.08, burstPause: 1.1, range: 30, accuracy: 0.5, weapon: "smg", xp: 40 },
  rifleman: { name: "Schütze", health: 95, armor: 0.1, walkSpeed: 1.8, runSpeed: 3.8, vision: 34, fov: 110, damage: 11, burstMin: 2, burstMax: 4, burstInterval: 0.12, burstPause: 1.0, range: 38, accuracy: 0.6, weapon: "rifle", xp: 50 },
  heavy: { name: "Schwere Einheit", health: 160, armor: 0.35, walkSpeed: 1.5, runSpeed: 2.9, vision: 28, fov: 100, damage: 24, burstMin: 1, burstMax: 1, burstInterval: 0.2, burstPause: 1.0, range: 18, accuracy: 0.7, weapon: "shotgun", xp: 80 },
  marksman: { name: "Scharfschütze", health: 80, armor: 0.05, walkSpeed: 1.6, runSpeed: 3.4, vision: 55, fov: 70, damage: 32, burstMin: 1, burstMax: 1, burstInterval: 0.2, burstPause: 2.6, range: 60, accuracy: 0.75, weapon: "sniper", xp: 70 },
}

/** Hit-zone damage multipliers for enemies (the weapon's headMultiplier replaces "head"). */
export const LIMB_MULTIPLIER = 0.75

export interface MissionDef {
  name: string; code: string; location: string; description: string; threat: string
  /** Enemy kinds placed at raid start (count = length). */
  roster: EnemyKind[]
  /** Extra enemies sent toward the extraction once it is called. */
  reinforcements: EnemyKind[]
  lootRequired: number
  /** Supply crates placed on the map. */
  crates: number
  reward: number; resources: number
  /** Raid time limit in seconds. */
  time: number
  /** Seconds the player must hold the extraction zone after calling the evac. */
  extractTime: number
  /** Required command centre level. */
  hqLevel: number
  unlock: string
  seed: number
  color: number
  theme: ThemeId
  /** Loot value tier (0..2) used for crate contents. */
  tier: number
}

export const MISSIONS: Record<MissionId, MissionDef> = {
  greyzone: {
    name: "Grauzone", code: "IV-01", location: "Industrierand · 18:40", threat: "NIEDRIG",
    description: "Ein verlassenes Industriegebiet in der Abenddämmerung. Bergen Sie zwei Versorgungskisten und rufen Sie die Evakuierung.",
    roster: ["rifleman", "scout", "rifleman", "rifleman", "scout", "rifleman"], reinforcements: ["scout"],
    lootRequired: 2, crates: 7, reward: 650, resources: 24, time: 420, extractTime: 8, hqLevel: 1, unlock: "Verfügbar", seed: 1701, color: 0x61d6b5, theme: "dusk", tier: 0,
  },
  harbor: {
    name: "Stahlhafen", code: "IV-02", location: "Containerterminal · 20:15", threat: "ERHÖHT",
    description: "Enge Gassen zwischen gestapelten Containern. Schwere Einheiten bewachen das Terminal. Sichern Sie drei Frachtdepots.",
    roster: ["rifleman", "rifleman", "heavy", "scout", "rifleman", "heavy", "scout", "rifleman"], reinforcements: ["rifleman", "scout"],
    lootRequired: 3, crates: 9, reward: 1050, resources: 36, time: 480, extractTime: 10, hqLevel: 2, unlock: "Kommandozentrale Ebene 2", seed: 2903, color: 0xe8ad55, theme: "harbor", tier: 1,
  },
  blacksite: {
    name: "Nachtgitter", code: "IV-03", location: "Sperranlage · 02:10", threat: "HOCH",
    description: "Eine abgeriegelte Anlage bei Nacht. Scharfschützen sichern die Wachtürme. Taschenlampe (F) mitnehmen, vier Datendepots bergen.",
    roster: ["rifleman", "marksman", "heavy", "rifleman", "scout", "rifleman", "marksman", "heavy", "scout", "rifleman"], reinforcements: ["rifleman", "heavy", "scout"],
    lootRequired: 4, crates: 11, reward: 1750, resources: 52, time: 540, extractTime: 12, hqLevel: 3, unlock: "Kommandozentrale Ebene 3", seed: 4815, color: 0xef6a5b, theme: "night", tier: 2,
  },
}
export const MISSION_ORDER: MissionId[] = ["greyzone", "harbor", "blacksite"]

export interface ThemeDef {
  /** Sight distance multiplier for enemies (night = shorter, flashlight raises it again). */
  visionScale: number
  night: boolean
}
export const THEMES: Record<ThemeId, ThemeDef> = {
  dusk: { visionScale: 1, night: false },
  harbor: { visionScale: 0.9, night: false },
  night: { visionScale: 0.55, night: true },
}

export const BUILDINGS: Record<BuildingId, { name: string; code: string; description: string; baseMoney: number; baseResources: number; max: number }> = {
  hq: { name: "Kommandozentrale", code: "CMD", description: "Mehr Personal und Zugang zu riskanteren Operationen.", baseMoney: 1200, baseResources: 30, max: 3 },
  workshop: { name: "Munitionswerkstatt", code: "MUN", description: "Techniker fertigen regelmäßig Munitionspakete.", baseMoney: 750, baseResources: 20, max: 3 },
  lab: { name: "Forschungslabor", code: "F&E", description: "Analysten erforschen dauerhafte Unternehmensboni. Höhere Ebenen öffnen neue Programme.", baseMoney: 1000, baseResources: 28, max: 3 },
  clinic: { name: "Feldlazarett", code: "SAN", description: "Sanitäter stellen Trauma-Sets für kommende Einsätze her.", baseMoney: 850, baseResources: 22, max: 3 },
}

export const RESEARCH: Record<ResearchId, { name: string; description: string; money: number; resources: number; seconds: number; labLevel: number }> = {
  ballistics: { name: "Ballistik-Optimierung", description: "+15 % Waffenschaden mit allen Waffen.", money: 900, resources: 24, seconds: 35, labLevel: 1 },
  plating: { name: "Verbundplatten", description: "+25 Rüstung beim Einsatzstart, wenn eine Weste getragen wird.", money: 800, resources: 22, seconds: 30, labLevel: 1 },
  fieldmed: { name: "Feldmedizin", description: "Trauma-Sets heilen 65 statt 45 Gesundheit.", money: 950, resources: 26, seconds: 40, labLevel: 1 },
  broker: { name: "Graumarkt-Kontakte", description: "+20 % Verkaufserlös für gesicherte Beute.", money: 1100, resources: 30, seconds: 45, labLevel: 2 },
  recon: { name: "Aufklärungsdrohne", description: "Kisten erscheinen schon aus 45 m statt 18 m auf dem Kompass.", money: 1300, resources: 34, seconds: 55, labLevel: 2 },
  logistics: { name: "Schnelle Evakuierung", description: "Der Hubschrauber ist 40 % schneller an der Extraktion.", money: 1200, resources: 30, seconds: 50, labLevel: 3 },
}

export const DIFFICULTY: Record<Difficulty, { name: string; description: string; enemyDamage: number; enemyAccuracy: number; reaction: number; rewardMultiplier: number }> = {
  easy: { name: "Leicht", description: "Gegner treffen seltener und schwächer, reagieren langsamer.", enemyDamage: 0.6, enemyAccuracy: 0.75, reaction: 1.0, rewardMultiplier: 0.85 },
  normal: { name: "Normal", description: "Ausgewogen.", enemyDamage: 1, enemyAccuracy: 1, reaction: 0.65, rewardMultiplier: 1 },
  hard: { name: "Schwer", description: "Gegner reagieren schnell und treffen hart. +25 % Vertragslohn.", enemyDamage: 1.35, enemyAccuracy: 1.15, reaction: 0.4, rewardMultiplier: 1.25 },
}

export const CONTRACTS: Record<ContractId, { name: string; description: string; target: number; reward: number; requires?: EnemyKind }> = {
  headhunter: { name: "Kopfjäger", description: "Neutralisieren Sie 3 Gegner per Kopftreffer.", target: 3, reward: 450 },
  heavy: { name: "Schwere Ziele", description: "Neutralisieren Sie eine schwere Einheit.", target: 1, reward: 400, requires: "heavy" },
  silent: { name: "Leise Hand", description: "Extrahieren Sie mit höchstens 2 Neutralisierungen.", target: 2, reward: 550 },
  value: { name: "Großer Fang", description: "Extrahieren Sie mit Beute im Wert von mindestens 1.500 $.", target: 1500, reward: 400 },
  fast: { name: "Schnell rein, schnell raus", description: "Extrahieren Sie in weniger als 4 Minuten.", target: 240, reward: 350 },
  unharmed: { name: "Unversehrt", description: "Extrahieren Sie mit mindestens 60 Gesundheit.", target: 60, reward: 300 },
}
export const CONTRACT_ORDER: ContractId[] = ["headhunter", "heavy", "silent", "value", "fast", "unharmed"]

export function buildingCost(id: BuildingId, currentLevel: number) {
  const b = BUILDINGS[id]
  const factor = currentLevel === 0 ? 1 : currentLevel + 0.65
  return { money: Math.round(b.baseMoney * factor), resources: Math.round(b.baseResources * factor) }
}

export function staffCap(hqLevel: number) { return 2 + Math.max(0, hqLevel - 1) * 2 }
export function xpForLevel(level: number) { return 600 + (level - 1) * 450 }
/** Seconds to produce one ammo pack / medkit at the given staff and building level. */
export function productionInterval(kind: "workshop" | "clinic", staff: number, level: number) {
  const base = kind === "workshop" ? 45 : 90
  return staff > 0 && level > 0 ? base / (staff * level) : Infinity
}
