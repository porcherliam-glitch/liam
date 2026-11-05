// Shared data types. Definitions (static data) are separated from instances (runtime / saved state).

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic"

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"]

export type ItemKind =
  | "weapon"
  | "armor"
  | "helmet"
  | "shield"
  | "food"
  | "remedy"
  | "material"
  | "gold"
  | "artifact"
  | "quest"
  | "ammo"

export type WeaponClass =
  | "longsword"
  | "shortsword"
  | "greatsword"
  | "battleaxe"
  | "mace"
  | "spear"
  | "dagger"
  | "bow"
  | "crossbow"

export type EquipSlot = "mainHand" | "offHand" | "head" | "body" | "quick1" | "quick2" | "quick3" | "quick4"

export interface WeaponStats {
  weaponClass: WeaponClass
  damage: number
  /** Swings per second for light attacks. */
  speed: number
  /** Reach in metres. */
  range: number
  /** Hit arc in radians for melee. */
  arc: number
  staminaCost: number
  critChance: number
  critMultiplier: number
  /** Stagger strength dealt to enemies (0..1). */
  impact: number
  twoHanded: boolean
  ranged?: { projectileSpeed: number; ammoId: string; drawTime: number }
  durability: number
}

export interface ArmorStats {
  armor: number
  weight: number
  /** Movement speed multiplier (plate < 1). */
  speedMultiplier: number
  staminaRegenMultiplier: number
}

export interface ShieldStats {
  blockReduction: number
  blockStaminaCost: number
  weight: number
  durability: number
}

export interface ConsumableEffect {
  heal?: number
  healOverTime?: { amount: number; seconds: number }
  stamina?: number
  cure?: boolean
  buff?: { stat: "damage" | "armor" | "speed" | "staminaRegen"; value: number; seconds: number }
}

export interface ItemDef {
  id: string
  name: string
  kind: ItemKind
  rarity: Rarity
  description: string
  /** Weight in kilogrammes per unit. */
  weight: number
  value: number
  stack: number
  tier?: number
  weapon?: WeaponStats
  armor?: ArmorStats
  shield?: ShieldStats
  consumable?: ConsumableEffect
  /** Visual tag for procedural models (e.g. "sword_iron"). */
  model?: string
  /** Where this can be crafted; undefined = loot / vendor only. */
  craft?: { building: string; level: number; cost: Record<string, number>; gold: number }
  /** Drops only in these areas (undefined = everywhere). */
  areas?: string[]
}

export interface Affix {
  id: string
  name: string
  /** Placed before (prefix) or after the item name. */
  prefix: boolean
  damagePct?: number
  armorPct?: number
  critChance?: number
  durabilityPct?: number
  speedPct?: number
  staminaRegenPct?: number
  lifeOnHit?: number
  weightPct?: number
  impactPct?: number
  valuePct?: number
}

export interface ItemInstance {
  /** Unique id of this instance. */
  uid: string
  defId: string
  qty: number
  rarity: Rarity
  affixes: string[]
  durability?: number
  maxDurability?: number
  upgrade?: number
}

export interface InventoryState {
  slots: (ItemInstance | null)[]
  capacity: number
  equipment: Partial<Record<EquipSlot, ItemInstance | null>>
}

export type ZombieKind = "walker" | "sprinter" | "brute" | "knight" | "boss"

export interface ZombieTypeDef {
  id: string
  name: string
  kind: ZombieKind
  hp: number
  damage: number
  speed: number
  /** Walk speed when wandering. */
  wanderSpeed: number
  attackRange: number
  attackCooldown: number
  /** Seconds from attack start until the hit lands. */
  attackWindup: number
  sight: number
  hearing: number
  /** Resistance against stagger (0..1). */
  poise: number
  armor: number
  xp: number
  scale: number
  color: string
  lootTable: string
  abilities?: string[]
  bossTitle?: string
}

export interface ExtractionDef {
  id: string
  name: string
  kind: "gate" | "cart" | "tunnel" | "ford" | "path" | "boat" | "rope"
  x: number
  z: number
  /** Seconds the player must stay in the zone. */
  channel: number
  /** Requirement before the point works. */
  activation?: { kind: "lever" | "key" | "repair" | "torch"; itemId?: string; label: string; leverX?: number; leverZ?: number }
}

export interface AreaDef {
  id: string
  name: string
  subtitle: string
  description: string
  size: number
  danger: number
  unlockLevel: number
  unlockAfter?: string
  seed: number
  biome: "village" | "forest" | "castle" | "graveyard" | "monastery" | "catacombs" | "city" | "fortress"
  spawnX: number
  spawnZ: number
  enemies: { typeId: string; weight: number }[]
  population: number
  bossId?: string
  bossX?: number
  bossZ?: number
  lootTable: string
  extractions: ExtractionDef[]
  /** Short notes shown in the map overview. */
  secrets: string[]
  hazards: string[]
}

export type MissionKind = "collect" | "bossHunt" | "rescue" | "explore" | "treasure" | "resources" | "purge"

export interface MissionDef {
  id: string
  kind: MissionKind
  areaId: string
  title: string
  description: string
  goal: number
  progress: number
  /** Item id for collect/resources. */
  targetId?: string
  reward: { gold: number; xp: number; reputation: number; items?: { id: string; qty: number }[] }
  status: "offered" | "active" | "completed" | "turnedIn"
  /** Difficulty 1..5 for display. */
  stars: number
}

export type PlayerClassId = "knight" | "ranger" | "rogue"

export interface PlayerClassDef {
  id: PlayerClassId
  name: string
  description: string
  hp: number
  stamina: number
  carry: number
  startItems: { id: string; qty: number }[]
  startEquipment: Partial<Record<EquipSlot, string>>
  bonus: string
}

export interface CampBuildingDef {
  id: string
  name: string
  description: string
  maxLevel: number
  levels: { gold: number; cost: Record<string, number>; effect: string }[]
}

export interface SkillDef {
  id: string
  name: string
  branch: "warrior" | "ranger" | "survivor"
  tier: number
  description: string
  requires?: string
  cost: number
  /** Active ability unlocked by this node (used with the ability button). */
  active?: { id: string; name: string; cooldown: number; description: string }
  effect: Partial<{
    damagePct: number
    heavyPct: number
    critChance: number
    hpPct: number
    staminaPct: number
    staminaRegenPct: number
    speedPct: number
    carryKg: number
    lootLuck: number
    blockPct: number
    dodgeStaminaPct: number
    rangedDamagePct: number
    drawSpeedPct: number
    goldPct: number
    xpPct: number
    healPct: number
    durabilityPct: number
    stealth: number
    lifeOnKill: number
    secondWind: boolean
    insurance: number
  }>
}

export interface ProfileStats {
  kills: number
  bossKills: number
  extractions: number
  deaths: number
  expeditions: number
  goldEarned: number
  playSeconds: number
  bestLoot: Rarity
}

export interface Profile {
  version: number
  slot: number
  name: string
  classId: PlayerClassId
  createdAt: number
  updatedAt: number
  level: number
  xp: number
  gold: number
  skillPoints: number
  skills: string[]
  mastery: Record<string, number>
  reputation: number
  stash: ItemInstance[]
  loadout: InventoryState
  camp: Record<string, number>
  missions: MissionDef[]
  missionsCompleted: number
  unlockedAreas: string[]
  clearedBosses: string[]
  recipes: string[]
  stats: ProfileStats
  /** Mission-board offers refresh. */
  missionRefreshAt: number
  nextUid: number
  tutorialSeen: boolean
}

export interface Settings {
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  lookSensitivity: number
  gamepadSensitivity: number
  invertY: boolean
  quality: "low" | "medium" | "high"
  shadows: boolean
  fov: number
  cameraShake: boolean
  showFps: boolean
  gore: boolean
  language: "de"
  vibration: boolean
  deadzone: number
  /** Default third-person camera distance in metres. */
  cameraDistance: number
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  lookSensitivity: 0.6,
  gamepadSensitivity: 0.6,
  invertY: false,
  quality: "high",
  shadows: true,
  fov: 70,
  cameraShake: true,
  showFps: false,
  gore: true,
  language: "de",
  vibration: true,
  deadzone: 0.18,
  cameraDistance: 4.6,
}

export const RARITY_INFO: Record<Rarity, { name: string; color: string; valueMult: number; affixes: number }> = {
  common: { name: "Gewöhnlich", color: "#b9b4a6", valueMult: 1, affixes: 0 },
  uncommon: { name: "Ungewöhnlich", color: "#6fbf5a", valueMult: 1.6, affixes: 1 },
  rare: { name: "Selten", color: "#4f9de8", valueMult: 2.8, affixes: 1 },
  epic: { name: "Episch", color: "#b36be8", valueMult: 5, affixes: 2 },
  legendary: { name: "Legendär", color: "#f0a63a", valueMult: 9, affixes: 3 },
  mythic: { name: "Mythisch", color: "#ff4d6d", valueMult: 16, affixes: 4 },
}
