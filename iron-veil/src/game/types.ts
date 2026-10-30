import type { WeatherId } from "./weather"
/**
 * types.ts — shared plain-data types. No three.js imports here so pure logic modules and unit tests stay light.
 * Coordinates: world XZ is the ground plane, Y is up. Yaw 0 looks toward -Z; positive yaw turns left (counter-clockwise from above).
 */
import type { BagSlot } from "./bag"
import type { ContractKind, ResearchId, StaffJob, StructureId, TimeOfDay } from "./baseData"
import type { ItemId } from "./items"
import type { AmmoId, WeaponId, WeaponMods } from "./weaponData"

export type { WeaponId } from "./weaponData"
export type { ItemId } from "./items"
export type { ResearchId } from "./baseData"

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

export type Screen = "menu" | "base" | "missions" | "trader" | "inventory" | "armory" | "crafting" | "build" | "research" | "radio" | "settings" | "playing" | "paused" | "raidInventory" | "loot" | "result" | "attack" | "online" | "chat" | "achievements"
export type EnemyKind = "scout" | "rifleman" | "heavy" | "marksman"
/** The three original operation areas; they are districts of the big zone map now. */
export type MissionId = "greyzone" | "harbor" | "blacksite"
export type Difficulty = "easy" | "normal" | "hard"
/** Lighting presets of the world; the zone uses times of day, the base always "dusk". */
export type ThemeId = "dusk" | "harbor" | "night"
export type Surface = "asphalt" | "concrete" | "metal" | "gravel" | "dirt" | "wood" | "grass"
export type BackpackId = "none" | "pack_small" | "pack_large"
export type GoreSetting = "off" | "normal" | "brutal"

export interface Loadout {
  primary: WeaponId | null
  primaryMods: WeaponMods
  primaryAmmo: AmmoId | null
  secondary: WeaponId | null
  secondaryMods: WeaponMods
  secondaryAmmo: AmmoId | null
  melee: WeaponId
  /** Current vest durability (0 = none) and the fresh value of the carried vest type (55 / 85). */
  armor: number
  armorMax: number
  /** Helmet durability (0 = none, 50 = fresh). */
  helmet: number
  backpack: BackpackId
  /** Packed backpack contents (taken into the raid, lost on death). */
  bag: BagSlot[]
  /** Secure container contents (kept on death). */
  secure: BagSlot[]
}

export interface ContractReward { money: number; xp: number; items?: Partial<Record<ItemId, number>> }
export interface ContractOffer {
  id: string
  kind: ContractKind
  title: string
  text: string
  target: number
  /** fetch: item to deliver. */
  item?: ItemId
  /** killKind: infected or merc kind id; recon: district id; activate: objective anchor id. */
  subject?: string
  subjectName?: string
  reward: ContractReward
}
export interface ActiveContract extends ContractOffer { progress: number }

export interface ProfileStats {
  raids: number; extracts: number; deaths: number; kills: number; infectedKills: number; mercKills: number
  headshots: number; dismembered: number; earned: number; bestRaid: number; contracts: number; defenses: number
  /** Survivors brought out of the zone. */
  rescued: number
  /** The Koloss killed (Erfolge). */
  bossKills: number
}

export interface Profile {
  version: 4
  callsign: string
  money: number
  xp: number
  level: number
  /** Unlimited stash: item id → count (weapons are items `w_<id>`). */
  stash: Partial<Record<ItemId, number>>
  loadout: Loadout
  structures: Record<StructureId, number>
  staff: Record<StaffJob, number>
  /** Fractional production progress per producing structure. */
  production: { workshop: number; clinic: number; kitchen: number }
  /** Ammunition the workshop produces. */
  workshopAmmo: AmmoId
  crafting: { station: string; recipe: string; endsAt: number }[]
  research: ResearchId[]
  activeResearch: { id: ResearchId; endsAt: number } | null
  contracts: { offers: ContractOffer[]; active: ActiveContract[]; refreshAt: number }
  base: { threat: number; attackPending: boolean; lastAttack: number }
  /** Infection carried between raids (the clinic treats it). */
  infection: number
  /** Timestamp of a raid in progress; a reload while it is set counts as death. 0 = none. */
  raidStarted: number
  /** Secure-container contents of the raid in progress (returned if the raid is lost by a reload). */
  raidSecure: BagSlot[]
  /** Free emergency kit cooldown (raids until available again). */
  emergencyCooldown: number
  /** Rescued survivors living at the base (each one raises the staff limit, up to 6). */
  residents: number
  stats: ProfileStats
  /** Unlocked achievement ids (achievements.ts). */
  achievements: string[]
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
  gore: GoreSetting
}

export interface LootStack { id: ItemId; qty: number }

export interface RaidPlan {
  insertion: string
  time: TimeOfDay
  /** Weather in the zone (clear when missing). */
  weather?: WeatherId
  /** Active contract ids tracked in this raid. */
  contracts: string[]
}

export interface RaidResult {
  success: boolean
  reason: string
  insertion: string
  time: TimeOfDay
  kills: number
  infectedKills: number
  mercKills: number
  headshots: number
  dismembered: number
  loot: LootStack[]
  lost: LootStack[]
  value: number
  duration: number
  xp: number
  levelUp: boolean
  contractUpdates: { title: string; progress: number; target: number; done: boolean }[]
  /** Survivors brought out with the player. */
  rescued: number
  /** Online: the lost gear now lies in the zone for other players. */
  leftForOthers?: boolean
}

export type MarkerKind = "extract" | "crate" | "body" | "objective" | "drop" | "threat" | "survivor" | "fallen"
export interface CompassMarker { kind: MarkerKind; bearing: number; distance: number; label?: string }

export interface HudSnapshot {
  health: number
  armor: number
  armorMax: number
  helmet: number
  stamina: number
  energy: number
  water: number
  bleed: "none" | "light" | "heavy"
  infection: number
  painkiller: number
  boost: number
  weight: number
  weightLimit: number
  ammo: number
  reserve: number
  ammoName: string
  weaponName: string
  fireMode: string
  melee: boolean
  quickMeds: number
  grenades: number
  throwableName: string
  reloading: number
  reloadTotal: number
  objective: string
  objectiveProgress: string
  contract: string
  lootValue: number
  raidTime: number
  clock: string
  /** Weather name shown next to the clock ("" when clear). */
  weather?: string
  area: string
  extraction: number
  extractionName: string
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
  /** Scoped rifle at full zoom: show the scope overlay. */
  scoped: boolean
  /** Player is dying (death camera). */
  dead: boolean
  /** Input device in use, for button prompts. */
  device: "kb" | "pad"
  message: string
  messageTime: number
  hint: string
  fps: number
  safe: boolean
}

export interface GameSnapshot {
  screen: Screen
  mode: string
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
  infectedAlive: number
  lootCollected: number
  extractionProgress: number
  fps: number
  drawCalls: number
  triangles: number
}

declare global {
  interface Window {
    /** Player feet position — read by the smoke test's direction assertions. */
    __gameProbe?: () => Vec3
    /** Set on the first rendered frame. */
    __GAME_READY__?: boolean
  }
}
