/**
 * types.ts — shared plain-data types. No three.js imports here so pure logic modules and unit tests stay light.
 * Coordinates: world XZ is the ground plane, Y is up. Yaw 0 looks toward -Z; positive yaw turns left (counter-clockwise from above).
 */

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

export type Screen = "menu" | "missions" | "trader" | "base" | "inventory" | "settings" | "playing" | "paused" | "raidInventory" | "result"
export type MissionId = "greyzone" | "harbor" | "blacksite"
export type BuildingId = "hq" | "workshop" | "lab" | "clinic"
export type ItemId = "ammo" | "medkit" | "armor" | "plate" | "grenade" | "parts" | "intel" | "electronics" | "medical" | "relic"
export type ResearchId = "ballistics" | "plating" | "broker" | "logistics" | "fieldmed" | "recon"
export type WeaponId = "p9" | "mk4" | "vx9" | "kv12" | "dr7"
export type EnemyKind = "scout" | "rifleman" | "heavy" | "marksman"
export type Difficulty = "easy" | "normal" | "hard"
export type ThemeId = "dusk" | "harbor" | "night"
export type Surface = "asphalt" | "concrete" | "metal" | "gravel" | "dirt" | "wood"
export type ContractId = "headhunter" | "heavy" | "silent" | "value" | "fast" | "unharmed"

export interface Loadout {
  primary: WeaponId
  /** Current vest durability (0 = no vest carried). */
  armor: number
  /** Durability of a fresh vest of the carried type (55 vest, 85 plate carrier); 0 when none. */
  armorMax: number
  medkits: number
  grenades: number
}
export interface Buildings { hq: number; workshop: number; lab: number; clinic: number }
export interface Staff { workshop: number; lab: number; clinic: number }
export interface Production { workshop: number; clinic: number }
export type ActiveResearch = { id: ResearchId; endsAt: number } | null

export interface ProfileStats { raids: number; extracts: number; kills: number; earned: number; deaths: number; headshots: number; bestRaid: number; contracts: number }

export interface Profile {
  version: 3
  callsign: string
  money: number
  resources: number
  xp: number
  level: number
  stash: Record<ItemId, number>
  weapons: WeaponId[]
  buildings: Buildings
  staff: Staff
  production: Production
  research: ResearchId[]
  activeResearch: ActiveResearch
  loadout: Loadout
  stats: ProfileStats
  tutorialDone: boolean
  lastTick: number
}

export interface Settings {
  sensitivity: number
  /** Multiplier on sensitivity while aiming down sights. */
  adsSensitivity: number
  volume: number
  muted: boolean
  quality: "high" | "low"
  invertY: boolean
  fov: number
  difficulty: Difficulty
  screenShake: boolean
  showFps: boolean
}

export interface LootStack { id: ItemId; qty: number }

export interface ContractState { id: ContractId; progress: number; target: number; done: boolean; failed: boolean }

export interface RaidResult {
  success: boolean
  reason: string
  mission: MissionId
  kills: number
  headshots: number
  loot: LootStack[]
  value: number
  reward: number
  resources: number
  duration: number
  xp: number
  levelUp: boolean
  contract: ContractState | null
  contractReward: number
}

export type MarkerKind = "extract" | "crate" | "body" | "threat"
export interface CompassMarker { kind: MarkerKind; bearing: number; distance: number }

export interface HudSnapshot {
  health: number
  armor: number
  armorMax: number
  stamina: number
  ammo: number
  reserve: number
  /** -1 = infinite reserve (sidearm). */
  reserveInfinite: boolean
  weaponName: string
  fireMode: string
  medkits: number
  grenades: number
  reloading: number
  reloadTotal: number
  objective: string
  objectiveProgress: string
  contract: string
  lootValue: number
  raidTime: number
  extraction: number
  interaction: string
  interactionProgress: number
  enemies: number
  hitMarker: number
  killMarker: number
  damageFlash: number
  /** Bearings (degrees, 0 = view direction, clockwise) of recent incoming damage, with remaining life 0..1. */
  damageDirections: { angle: number; life: number }[]
  compass: number
  markers: CompassMarker[]
  spread: number
  crouched: boolean
  ads: boolean
  message: string
  messageTime: number
  hint: string
  fps: number
}

export interface GameSnapshot {
  screen: Screen
  player: Vec3
  yaw: number
  pitch: number
  health: number
  armor: number
  stamina: number
  crouched: boolean
  weapon: WeaponId
  ammo: number
  reserve: number
  enemiesAlive: number
  lootCollected: number
  raidLoot: LootStack[]
  extractionReady: boolean
  extractionProgress: number
  extractionId: string
  mission: MissionId
  fps: number
  drawCalls: number
  triangles: number
}
