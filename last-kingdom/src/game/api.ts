// What the menu screens may ask the game to do. Keeps screens decoupled from Game internals.

import type { Profile, Settings, MissionDef, ItemInstance } from "../core/types"
import type { UI } from "../ui/ui"
import type { Input } from "../input/input"
import type { AudioEngine } from "../audio/audio"
import type { Player } from "../entities/player"
import type { MerchantStock } from "../items/merchant"

export interface ExpeditionApi {
  readonly player: Player
  readonly areaId: string
  readonly night: boolean
  readonly missions: MissionDef[]
  readonly elapsed: number
  readonly kills: number
  /** Items collected this run (for the results screen). */
  readonly runGold: number
  abandon(): void
  mapData(): RunMapData
  dropItem(item: ItemInstance): void
}

export interface RunMapData {
  size: number
  heightAt: (x: number, z: number) => number
  waterLevel: number
  walls: { x: number; z: number; hw: number; hd: number; yaw: number }[]
  extractions: { x: number; z: number; name: string; active: boolean }[]
  pois: { x: number; z: number; name: string; visited: boolean }[]
  markers: { x: number; z: number; label: string; kind: string }[]
  player: { x: number; z: number; yaw: number }
  explored: Uint8Array
  exploredRes: number
}

export interface GameApi {
  ui: UI
  input: Input
  audio: AudioEngine
  settings: Settings
  profile: Profile | null
  expedition: ExpeditionApi | null
  applySettings(): void
  saveSettings(): void
  saveProfile(): void
  listProfiles(): (Profile | null)[]
  createProfile(slot: number, name: string, classId: Profile["classId"], female?: boolean): void
  loadProfile(slot: number): void
  deleteProfile(slot: number): void
  exportProfile(): void
  importProfile(json: string, slot: number): boolean
  startExpedition(areaId: string, night?: boolean): void
  goToCamp(): void
  goToMainMenu(): void
  resumeExpedition(): void
  merchantStock(): MerchantStock
  refreshMerchant(): void
  version: string
}
