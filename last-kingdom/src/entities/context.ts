// Shared services an expedition hands to its entities. Kept as an interface to avoid import cycles.

import type * as THREE from "three"
import type { WorldBuild } from "../world/worldgen"
import type { Particles } from "../render/particles"
import type { AudioEngine } from "../audio/audio"
import type { Input } from "../input/input"
import type { ThirdPersonCamera } from "../render/camera"
import type { Settings } from "../core/types"
import type { Sky } from "../render/sky"
import type { Weather } from "../render/weather"
import type { Zombie } from "./zombie"
import type { Player } from "./player"
import type { Projectiles } from "./projectiles"
import type { Rng } from "../core/rng"

export interface EntityContext {
  scene: THREE.Scene
  world: WorldBuild
  particles: Particles
  audio: AudioEngine
  input: Input
  camera: ThirdPersonCamera
  settings: Settings
  sky: Sky
  weather: Weather
  zombies: Zombie[]
  player: Player
  projectiles: Projectiles
  rng: Rng
  /** Elapsed expedition seconds. */
  time: number
  /** Announces noise that enemies can hear. */
  noise(x: number, z: number, radius: number): void
  /** Floating damage number. */
  floatText(x: number, y: number, z: number, text: string, color: string): void
  /** Drops loot on the ground. */
  dropLoot(x: number, z: number, table: string, bonusRolls?: number): void
  /** Spawns zombies near a position (boss summon). */
  summon(x: number, z: number, typeId: string, count: number): void
  /** Adds a temporary plague cloud hazard. */
  plagueCloud(x: number, z: number, r: number, seconds: number): void
  /** Spawns an arrow pickup where a projectile landed. */
  dropArrow(x: number, y: number, z: number, ammoId: string): void
}
