/**
 * enemies.ts — hostile operators: AI (perception, states, path following, cover, shooting) and their 3D models.
 * CONTRACT (used by raid.ts):
 *  - new EnemyManager(parent, world, { difficulty, seed, events })
 *  - spawn(roster): places one enemy per roster entry on distinct world.layout.enemySpawns (seeded shuffle).
 *  - spawnReinforcements(kinds, target): enemies enter at layout.reinforcementSpawns and move to `target` alerted.
 *  - update(dt, player): `player.active === false` means menu/attract mode: patrol only, never detect or shoot.
 *  - hearNoise(pos, radius): alerts enemies within radius (shots, footsteps, explosions).
 *  - hitTest(origin, dir, maxDist): analytic hit against living enemies' hit zones (head sphere, torso capsule, legs).
 *  - applyDamage(hit, amount, from): applies zone multiplier is NOT done here — `amount` is final pre-armour damage;
 *    the enemy's body armour (ENEMIES[kind].armor) reduces "body" hits. Returns { killed, dealt }.
 *  - applyExplosion(center, radius, maxDamage): linear falloff, blocked by obstacles; returns the killed enemies.
 *  - events.shoot is called for every enemy bullet (raid applies damage when hit === true, draws tracer, plays sound).
 * PLACEHOLDER: the AI pass replaces this with full behaviour and animated soldier models.
 */
import * as THREE from "three"
import { segmentBlocked3D, rayCapsule, raySphere, moveCircle } from "./collision"
import { DIFFICULTY, ENEMIES, THEMES, type EnemyWeapon } from "./data"
import type { Difficulty, EnemyKind, Vec2, Vec3 } from "./types"
import type { World } from "./world"

export type HitPart = "head" | "body" | "limb"
export type EnemyState = "idle" | "patrol" | "suspicious" | "investigate" | "combat" | "search" | "dead"

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
  /** false in the menu attract mode. */
  active: boolean
}

export interface EnemyHit { enemy: Enemy; distance: number; part: HitPart; point: THREE.Vector3 }
export interface EnemyShot { enemy: Enemy; from: THREE.Vector3; to: THREE.Vector3; hit: boolean; damage: number; weapon: EnemyWeapon }

export interface EnemyEvents {
  shoot(shot: EnemyShot): void
  died(enemy: Enemy, cause: "player" | "explosion", part: HitPart): void
  /** First time this enemy switches to combat (used for audio/HUD cues). */
  spotted?(enemy: Enemy): void
  footstep?(enemy: Enemy): void
}

export interface EnemyManagerOptions { difficulty: Difficulty; seed: number; events: EnemyEvents }

export class Enemy {
  readonly group = new THREE.Group()
  alive = true
  state: EnemyState = "patrol"
  health: number
  readonly maxHealth: number
  /** 0..1 suspicion meter (1 = combat). */
  awareness = 0
  readonly position: THREE.Vector3
  constructor(readonly id: number, readonly kind: EnemyKind) {
    this.maxHealth = this.health = ENEMIES[kind].health
    this.position = this.group.position
  }
  /** World position of the head centre (for aim assists / tests). */
  headPosition(out: THREE.Vector3): THREE.Vector3 { return out.set(this.position.x, this.position.y + 1.62, this.position.z) }
  /** World position of the chest (for tests). */
  chestPosition(out: THREE.Vector3): THREE.Vector3 { return out.set(this.position.x, this.position.y + 1.25, this.position.z) }
}

export class EnemyManager {
  readonly enemies: Enemy[] = []
  private rng: () => number
  private nextId = 1
  private cooldowns = new Map<Enemy, number>()
  private material = new THREE.MeshStandardMaterial({ color: 0x555b48, roughness: 0.9 })
  private geo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 8)

  constructor(private parent: THREE.Object3D, private world: World, private opts: EnemyManagerOptions) {
    let s = opts.seed >>> 0
    this.rng = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  }

  spawn(roster: EnemyKind[]): void {
    const spawns = [...this.world.layout.enemySpawns]
    for (let i = spawns.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [spawns[i], spawns[j]] = [spawns[j], spawns[i]] }
    roster.forEach((kind, i) => { const s = spawns[i % spawns.length]; this.add(kind, s) })
  }

  spawnReinforcements(kinds: EnemyKind[], target: Vec2): void {
    const spots = this.world.layout.reinforcementSpawns
    kinds.forEach((kind, i) => { const e = this.add(kind, spots[i % spots.length]); e.state = "investigate"; e.awareness = 0.8; this.targets.set(e, { x: target.x, z: target.z }) })
  }

  private targets = new Map<Enemy, Vec2>()
  private add(kind: EnemyKind, p: Vec2): Enemy {
    const e = new Enemy(this.nextId++, kind)
    const body = new THREE.Mesh(this.geo, this.material); body.position.y = 0.87; body.castShadow = true; e.group.add(body)
    e.group.position.set(p.x, 0, p.z); this.parent.add(e.group); this.enemies.push(e); this.cooldowns.set(e, 1)
    return e
  }

  update(dt: number, player: PlayerState): void {
    const diff = DIFFICULTY[this.opts.difficulty]
    for (const e of this.enemies) {
      if (!e.alive) { e.group.rotation.z = Math.min(Math.PI / 2, e.group.rotation.z + dt * 4); continue }
      if (!player.active || !player.alive) continue
      const def = ENEMIES[e.kind]
      const dx = player.position.x - e.position.x, dz = player.position.z - e.position.z, dist = Math.hypot(dx, dz)
      const eye = _a.set(e.position.x, 1.6, e.position.z), target = _b.set(player.position.x, player.eyeY - 0.2, player.position.z)
      const sees = dist < def.vision * THEMES[this.world.theme].visionScale && !segmentBlocked3D(eye, target, this.world.obstacles)
      if (sees) { if (e.state !== "combat") this.opts.events.spotted?.(e); e.state = "combat"; e.awareness = 1 }
      if (e.state === "combat" || e.state === "investigate") {
        e.group.rotation.y = Math.atan2(-dx, -dz)
        if (dist > 12 || !sees) {
          const t = this.targets.get(e) ?? { x: player.position.x, z: player.position.z }
          const path = this.world.nav.findPath(e.position.x, e.position.z, t.x, t.z, 800)
          if (path && path.length) { const p = path[0]; const l = Math.hypot(p.x - e.position.x, p.z - e.position.z) || 1; moveCircle(e.position.x, e.position.z, (p.x - e.position.x) / l * def.runSpeed * dt, (p.z - e.position.z) / l * def.runSpeed * dt, 0.42, this.world.obstacles, _p); e.position.x = _p.x; e.position.z = _p.z }
        }
        const cd = (this.cooldowns.get(e) ?? 0) - dt; this.cooldowns.set(e, cd)
        if (sees && cd <= 0 && dist < def.range) {
          this.cooldowns.set(e, def.burstPause)
          const hit = this.rng() < Math.min(0.9, def.accuracy * diff.enemyAccuracy * (player.sprinting ? 0.6 : 1) * Math.max(0.3, 1 - dist / 60))
          this.opts.events.shoot({ enemy: e, from: new THREE.Vector3(e.position.x, 1.4, e.position.z), to: target.clone(), hit, damage: def.damage * diff.enemyDamage, weapon: def.weapon })
        }
      }
    }
  }

  hearNoise(pos: Vec3, radius: number): void {
    for (const e of this.enemies) if (e.alive && e.state !== "combat" && Math.hypot(e.position.x - pos.x, e.position.z - pos.z) < radius) { e.state = "investigate"; this.targets.set(e, { x: pos.x, z: pos.z }) }
  }

  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): EnemyHit | null {
    let best: EnemyHit | null = null
    for (const e of this.enemies) {
      if (!e.alive) continue
      const p = e.position
      const head = raySphere(origin, dir, p.x, p.y + 1.62, p.z, 0.17, maxDist)
      const body = rayCapsule(origin, dir, p.x, p.z, p.y + 0.4, p.y + 1.4, 0.32, maxDist)
      let t: number | null = null, part: HitPart = "body"
      if (head !== null) { t = head; part = "head" }
      if (body !== null && (t === null || body < t)) { t = body; part = "body" }
      if (t !== null && (!best || t < best.distance)) best = { enemy: e, distance: t, part, point: origin.clone().addScaledVector(dir, t) }
    }
    return best
  }

  applyDamage(hit: EnemyHit, amount: number, _from: Vec3): { killed: boolean; dealt: number } {
    const e = hit.enemy; if (!e.alive) return { killed: false, dealt: 0 }
    const dealt = hit.part === "body" ? amount * (1 - ENEMIES[e.kind].armor) : amount
    e.health -= dealt; e.state = "combat"; e.awareness = 1
    if (e.health <= 0) { e.alive = false; e.state = "dead"; this.opts.events.died(e, "player", hit.part); return { killed: true, dealt } }
    return { killed: false, dealt }
  }

  applyExplosion(center: Vec3, radius: number, maxDamage: number): Enemy[] {
    const killed: Enemy[] = []
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = Math.hypot(e.position.x - center.x, e.position.z - center.z)
      if (d > radius || segmentBlocked3D(center, _a.set(e.position.x, 1, e.position.z), this.world.obstacles)) continue
      e.health -= maxDamage * (1 - d / radius); e.state = "combat"
      if (e.health <= 0) { e.alive = false; e.state = "dead"; killed.push(e); this.opts.events.died(e, "explosion", "body") }
    }
    return killed
  }

  aliveCount(): number { return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) }
  /** Number of living enemies currently in combat (drives music/ambience intensity). */
  combatCount(): number { return this.enemies.reduce((n, e) => n + (e.alive && e.state === "combat" ? 1 : 0), 0) }

  dispose(): void {
    for (const e of this.enemies) this.parent.remove(e.group)
    this.enemies.length = 0; this.material.dispose(); this.geo.dispose()
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p: Vec2 = { x: 0, z: 0 }
