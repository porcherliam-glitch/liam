/**
 * hostiles.ts — shared contract for everything that fights the player: mercenaries (enemies.ts) and infected
 * (zombies.ts). raid.ts talks to both through HostileManager; gore.ts gets body parts through GoreBody.
 *
 * Body-part convention for dismemberment (both factions): every model exposes `gore.parts` — Object3D groups for
 * head, torso, armL, armR, legL, legR whose LOCAL ORIGIN IS THE JOINT (neck, shoulder, hip). Hiding a part group and
 * handing it to GoreSystem.sever() must leave a plausible stump; hit tests must ignore severed parts.
 */
import type * as THREE from "three"
import type { Difficulty, Vec3 } from "./types"

export type Faction = "merc" | "infected"
export type HitPart = "head" | "body" | "limb"
export type BodyPartId = "head" | "torso" | "armL" | "armR" | "legL" | "legR"

export interface PlayerState {
  /** Feet position. */
  position: THREE.Vector3
  /** Absolute eye height (1.62 standing, 1.05 crouched). */
  eyeY: number
  crouched: boolean
  /** Horizontal speed in m/s. */
  speed: number
  sprinting: boolean
  flashlight: boolean
  alive: boolean
  /** false in the menu attract mode and in the safe base: never detect or attack. */
  active: boolean
}

export interface Hostile {
  readonly id: number
  readonly faction: Faction
  /** EnemyKind for mercs, InfectedKind for infected. */
  readonly kind: string
  alive: boolean
  health: number
  readonly maxHealth: number
  /** "patrol", "combat", "search", "dead", … (faction specific). */
  state: string
  readonly position: THREE.Vector3
  readonly group: THREE.Group
  readonly gore: GoreBody
  headPosition(out: THREE.Vector3): THREE.Vector3
  chestPosition(out: THREE.Vector3): THREE.Vector3
}

export interface GoreBody {
  parts: Partial<Record<BodyPartId, THREE.Object3D>>
  /** Blood colour (red for mercs, darker/brownish red for infected). */
  bloodColor: number
  severed: Set<BodyPartId>
}

export interface HostileHit {
  target: Hostile
  distance: number
  part: HitPart
  bodyPart: BodyPartId
  point: THREE.Vector3
}

export interface DamageInfo {
  /** Final damage before the target's armour (weapon zone multipliers already applied by the raid). */
  amount: number
  /** Attacker position. */
  from: Vec3
  /** Normalised direction of the bullet/swing/blast. */
  dir: Vec3
  /** 0..1 armour penetration of the ammunition. */
  penetration: number
  kind: "bullet" | "pellet" | "melee" | "explosion" | "fire"
  /** 0..1 extra chance to sever the hit part (machete/axe, shotgun at point blank, .338). */
  sever: number
}

export interface DamageResult { killed: boolean; dealt: number; severed: BodyPartId | null; headshotKill: boolean }

/** A merc firing at the player. */
export interface ShotEvent { from: THREE.Vector3; to: THREE.Vector3; hit: boolean; damage: number; weapon: "rifle" | "smg" | "shotgun" | "sniper"; source: Hostile }
/** An infected hitting the player in melee (or with acid). */
export interface AttackEvent { source: Hostile; damage: number; bleed: "none" | "light" | "heavy"; infection: number; kind: "claw" | "bite" | "slam" | "acid" }
export type HostileSound = "groan" | "alert" | "scream" | "attack" | "spit" | "roar" | "pain" | "death" | "radio"

export interface HostileEvents {
  shoot?(shot: ShotEvent): void
  attack?(attack: AttackEvent): void
  died(target: Hostile, cause: DamageInfo["kind"], part: HitPart): void
  /** First switch to combat (alert sting, HUD). */
  spotted?(target: Hostile): void
  footstep?(target: Hostile): void
  sound?(target: Hostile, sound: HostileSound): void
}

export interface HostileManager {
  readonly faction: Faction
  update(dt: number, player: PlayerState): void
  hearNoise(pos: Vec3, radius: number): void
  /** Nearest living hit along the ray (dir normalised). */
  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): HostileHit | null
  applyDamage(hit: HostileHit, damage: DamageInfo): DamageResult
  /** Linear falloff, blocked by obstacles; returns the killed targets. */
  applyExplosion(center: Vec3, radius: number, maxDamage: number): Hostile[]
  /** Living targets inside a horizontal arc in front of origin (melee swings), nearest first. */
  meleeTest(origin: THREE.Vector3, dir: THREE.Vector3, range: number, arcDeg: number, maxTargets: number): HostileHit[]
  /** Living targets within radius of center (fire, gas). */
  inRadius(center: Vec3, radius: number): Hostile[]
  aliveCount(): number
  combatCount(): number
  dispose(): void
}

export interface HostileOptions { difficulty: Difficulty; seed: number; events: HostileEvents }
