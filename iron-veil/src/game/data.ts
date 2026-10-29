/**
 * data.ts — mercenary stats, difficulty, XP curve and the legacy district definitions (the three original
 * operation areas are districts of the big zone map now). Items: items.ts · weapons: weaponData.ts ·
 * infected: infectedData.ts · base, research, contracts, times of day: baseData.ts.
 */
import type { Difficulty, EnemyKind, MissionId, ThemeId } from "./types"

export { WEAPONS, PRIMARY_WEAPONS, SECONDARY_WEAPONS, MELEE_WEAPONS, WEAPON_ORDER, AMMO, ATTACHMENTS } from "./weaponData"
export type { WeaponDef, WeaponClass } from "./weaponData"

export type EnemyWeapon = "rifle" | "smg" | "shotgun" | "sniper"
export interface EnemyDef {
  name: string
  health: number
  /** Fraction of body damage absorbed by armour (head and limbs are unarmoured). */
  armor: number
  walkSpeed: number
  runSpeed: number
  /** Sight distance (m) in daylight; darkness scales it down. */
  vision: number
  /** Full horizontal field of view in degrees. */
  fov: number
  /** Damage per bullet that hits (before difficulty and the player's armour). */
  damage: number
  burstMin: number
  burstMax: number
  burstInterval: number
  burstPause: number
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
/** Weapon a merc drops (as loot item) by its weapon type. */
export const ENEMY_DROPS: Record<EnemyWeapon, import("./weaponData").WeaponId[]> = { rifle: ["mk4", "sr74", "stg77"], smg: ["vx9", "k5", "p18"], shotgun: ["kv12"], sniper: ["dr7"] }

/** Hit-zone damage multiplier for limbs (the weapon's headMultiplier applies to heads). */
export const LIMB_MULTIPLIER = 0.75

export const DIFFICULTY: Record<Difficulty, { name: string; description: string; enemyDamage: number; enemyAccuracy: number; reaction: number; rewardMultiplier: number }> = {
  easy: { name: "Leicht", description: "Gegner treffen seltener und schwächer, reagieren langsamer.", enemyDamage: 0.6, enemyAccuracy: 0.75, reaction: 1.0, rewardMultiplier: 0.85 },
  normal: { name: "Normal", description: "Ausgewogen.", enemyDamage: 1, enemyAccuracy: 1, reaction: 0.65, rewardMultiplier: 1 },
  hard: { name: "Schwer", description: "Gegner reagieren schnell und treffen hart. +25 % Erfahrung.", enemyDamage: 1.35, enemyAccuracy: 1.15, reaction: 0.4, rewardMultiplier: 1.25 },
}

export function xpForLevel(level: number) { return 600 + (level - 1) * 450 }

export interface ThemeDef { visionScale: number; night: boolean }
export const THEMES: Record<ThemeId, ThemeDef> = {
  dusk: { visionScale: 1, night: false },
  harbor: { visionScale: 0.9, night: false },
  night: { visionScale: 0.55, night: true },
}

/** Legacy operation areas (now districts). Used by the district layouts and the dev bench. */
export interface MissionDef { name: string; roster: EnemyKind[]; theme: ThemeId; seed: number; crates: number }
export const MISSIONS: Record<MissionId, MissionDef> = {
  greyzone: { name: "Grauzone", roster: ["rifleman", "scout", "rifleman", "rifleman", "scout", "rifleman"], theme: "dusk", seed: 1701, crates: 7 },
  harbor: { name: "Stahlhafen", roster: ["rifleman", "rifleman", "heavy", "scout", "rifleman", "heavy", "scout", "rifleman"], theme: "harbor", seed: 2903, crates: 9 },
  blacksite: { name: "Nachtgitter", roster: ["rifleman", "marksman", "heavy", "rifleman", "scout", "rifleman", "marksman", "heavy", "scout", "rifleman"], theme: "night", seed: 4815, crates: 11 },
}
