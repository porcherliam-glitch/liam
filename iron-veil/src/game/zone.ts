/**
 * zone.ts — CONTRACT between the world builder (world.ts / maps.ts) and the game (raid.ts, enemies.ts, zombies.ts).
 *
 * Two kinds of worlds:
 *  - "zone": the big quarantine zone (~640 × 640 m) made of districts (town, industry, harbor, military compound,
 *    research lab, farm/forest, rail station …) with roads and countryside between them. Raids happen here.
 *  - "base": the player's compound (~80 × 80 m), walkable in first person. Structures stand on fixed plots and
 *    appear/grow with their level (setStructures). Infected attack it in base-defence mode.
 *
 * createWorld(kind, scene, quality, opts) builds either one; the World interface is in world.ts.
 */
import type { StructureId, TimeOfDay } from "./baseData"
import type { InfectedKind } from "./infectedData"
import type { ItemId } from "./items"
import type { Bounds } from "./nav"
import type { EnemyKind, Vec2 } from "./types"

export type WorldKind = "zone" | "base"

export interface MapSolid { x: number; z: number; w: number; d: number; h: number; y?: number; style: string }

export interface District {
  id: "town" | "industry" | "harbor" | "military" | "lab" | "farm" | "station" | "forest" | string
  name: string
  minX: number; maxX: number; minZ: number; maxZ: number
  /** 1 calm … 3 deadly (loot quality and enemy strength scale with it). */
  danger: 1 | 2 | 3
}

export type LootCategory = "civil" | "food" | "medical" | "industrial" | "military" | "tech" | "lab"
export type ContainerKind = "crate" | "cabinet" | "fridge" | "toolbox" | "weaponcase" | "medcab" | "safe" | "duffel"
export interface LootSpot {
  x: number; z: number
  /** Height of the container base (0 on the floor, ~0.9 on a table/shelf). */
  y?: number
  /** Facing (radians) of the container front. */
  yaw?: number
  tier: 0 | 1 | 2
  category: LootCategory
  container: ContainerKind
  indoor: boolean
}

export interface MercCamp { id: string; x: number; z: number; radius: number; squad: number; kinds?: EnemyKind[]; patrol: Vec2[] }
export interface InfectedZoneDef { district: string; x: number; z: number; radius: number; density: number; kinds?: InfectedKind[] }
export interface Insertion { id: string; name: string; x: number; z: number; yaw: number; district: string; /** HQ level needed. */ hq: number }

export type ExtractKind = "heli" | "boat" | "tunnel" | "gate" | "vehicle"
export interface ExtractionDef {
  id: string; name: string; x: number; z: number; radius: number
  kind: ExtractKind
  /** Needed to use it (consumed): an item (fuel for the boat, key for the tunnel) or a bribe. */
  requirement: { item?: ItemId; money?: number } | null
  /** Probability that this exfil is open in a raid (at least two are always open). */
  chance: number
  /** Seconds the player must hold the zone after activating (helicopter/boat), or hold E (gate/tunnel). */
  holdTime: number
}

export interface ObjectiveAnchor { id: "generator" | "radio_mast" | "pump" | "lab_terminal" | string; name: string; x: number; z: number; holdTime: number }

export interface ZoneLayout {
  kind: "zone"
  bounds: Bounds
  districts: District[]
  solids: MapSolid[]
  lootSpots: LootSpot[]
  mercCamps: MercCamp[]
  infectedZones: InfectedZoneDef[]
  insertions: Insertion[]
  extractions: ExtractionDef[]
  objectives: ObjectiveAnchor[]
  bossArena: { x: number; z: number; radius: number }
  /** Places where a supply drop can land (open ground). */
  airdropSpots: Vec2[]
  /** Names drawn on the tactical map. */
  labels: { name: string; x: number; z: number }[]
}

export type StationId = "trader" | "stash" | "radio" | "workbench" | "armory" | "clinic" | "build" | "lab" | "gate"
export interface BasePlot { structure: StructureId; x: number; z: number; w: number; d: number; yaw: number }
export interface BaseLayout {
  kind: "base"
  bounds: Bounds
  solids: MapSolid[]
  spawn: { x: number; z: number; yaw: number }
  plots: BasePlot[]
  /** Interaction points (E) that open the menus. */
  stations: { id: StationId; name: string; x: number; z: number }[]
  /** Where infected appear during base defence, and the gate they push toward. */
  attackSpawns: Vec2[]
  gate: Vec2
}

export type AnyLayout = ZoneLayout | BaseLayout

export interface WorldOptions {
  time?: TimeOfDay
  /** Base only: current structure levels (plots show them). */
  structures?: Partial<Record<StructureId, number>>
}
