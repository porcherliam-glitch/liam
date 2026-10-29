export interface Vec3 { x: number; y: number; z: number }

export type Screen = "menu" | "missions" | "trader" | "base" | "inventory" | "settings" | "briefing" | "playing" | "paused" | "raidInventory" | "result"
export type MissionId = "greyzone" | "harbor" | "blacksite"
export type BuildingId = "hq" | "workshop" | "lab" | "clinic"
export type ItemId = "ammo" | "medkit" | "armor" | "parts" | "intel" | "electronics" | "medical" | "relic"
export type ResearchId = "ballistics" | "plating" | "broker"

export interface Loadout { armor: number; medkits: number }
export interface Buildings { hq: number; workshop: number; lab: number; clinic: number }
export interface Staff { workshop: number; lab: number; clinic: number }
export interface Production { workshop: number; clinic: number }
export type ActiveResearch = { id: ResearchId; endsAt: number } | null

export interface Profile {
  version: 2
  callsign: string
  money: number
  resources: number
  xp: number
  level: number
  stash: Record<ItemId, number>
  buildings: Buildings
  staff: Staff
  production: Production
  research: ResearchId[]
  activeResearch: ActiveResearch
  loadout: Loadout
  stats: { raids: number; extracts: number; kills: number; earned: number; deaths: number }
  lastTick: number
}

export interface Settings { sensitivity: number; volume: number; muted: boolean; quality: "high" | "low"; invertY: boolean }

export interface LootStack { id: ItemId; qty: number }
export interface RaidResult {
  success: boolean
  reason: string
  mission: MissionId
  kills: number
  loot: LootStack[]
  value: number
  reward: number
  resources: number
  duration: number
}

export interface HudSnapshot {
  health: number
  armor: number
  ammo: number
  reserve: number
  medkits: number
  reloading: number
  objective: string
  objectiveProgress: string
  lootValue: number
  raidTime: number
  extraction: number
  interaction: string
  enemies: number
  hitMarker: number
  damageFlash: number
  compass: number
  message: string
  messageTime: number
}

export interface GameSnapshot {
  screen: Screen
  player: Vec3
  health: number
  enemiesAlive: number
  lootCollected: number
  raidLoot: LootStack[]
  extractionReady: boolean
  extractionProgress: number
  result: RaidResult | null
  fps: number
  drawCalls: number
  triangles: number
}
