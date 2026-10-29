/**
 * enemies.ts — hostile mercenaries: AI (perception, cover, squads, shooting) and soldier models.
 * CONTRACT (used by raid.ts; implements HostileManager from hostiles.ts):
 *  - new EnemyManager(parent, world, { difficulty, seed, events, gore })
 *  - spawnSquad(kinds, x, z, patrol): a group guarding/patrolling (zone camps: world.layout.mercCamps).
 *  - spawnReinforcements(kinds, target): enter from the nearest map edge already alerted and move to `target`.
 *  - update(dt, player): full AI near the player, cheap "sleep" far away (> ~130 m: no rendering, slow updates).
 *  - Hit/damage/explosion/melee/radius queries per HostileManager. Mercs shoot through events.shoot.
 *  - Dismemberment through opts.gore with GORE_RULES (zombies.ts) — same rules as for the infected.
 *  - events.died(target, …): the raid spawns a lootable body (gear, ammo, the merc's weapon, a dog tag).
 *  - Sight scales with world.visionScale (time of day); the player's flashlight makes them visible at night.
 * PLACEHOLDER: the mercenary pass replaces this with soldier models, animations and tactics.
 */
import * as THREE from "three"
import { rayCapsule, raySphere } from "./collision"
import { DIFFICULTY, ENEMIES } from "./data"
import type { GoreSystem } from "./gore"
import type { BodyPartId, DamageInfo, DamageResult, GoreBody, Hostile, HostileHit, HostileManager, HostileOptions, PlayerState } from "./hostiles"
import type { EnemyKind, Vec2, Vec3 } from "./types"
import type { World } from "./world"

export type { PlayerState } from "./hostiles"

class Merc implements Hostile {
  readonly faction = "merc" as const
  readonly group = new THREE.Group()
  alive = true
  state = "patrol"
  health: number
  readonly maxHealth: number
  readonly position: THREE.Vector3
  readonly gore: GoreBody = { parts: {}, bloodColor: 0x7a0a08, severed: new Set<BodyPartId>() }
  cooldown = 1
  target: Vec2 | null = null
  constructor(readonly id: number, readonly kind: EnemyKind) {
    this.maxHealth = this.health = ENEMIES[kind].health
    this.position = this.group.position
  }
  headPosition(out: THREE.Vector3): THREE.Vector3 { return out.set(this.position.x, this.position.y + 1.66, this.position.z) }
  chestPosition(out: THREE.Vector3): THREE.Vector3 { return out.set(this.position.x, this.position.y + 1.2, this.position.z) }
}

export class EnemyManager implements HostileManager {
  readonly faction = "merc" as const
  readonly enemies: Merc[] = []
  private rng: () => number
  private nextId = 1
  private material = new THREE.MeshStandardMaterial({ color: 0x555b48, roughness: 0.9 })
  private geo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 8)

  constructor(private parent: THREE.Object3D, private world: World, private opts: HostileOptions & { gore: GoreSystem }) {
    let s = opts.seed >>> 0
    this.rng = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  }

  private add(kind: EnemyKind, x: number, z: number): Merc {
    const e = new Merc(this.nextId++, kind)
    const body = new THREE.Mesh(this.geo, this.material); body.position.y = 0.87; body.castShadow = true; e.group.add(body)
    e.group.position.set(x, 0, z); this.parent.add(e.group); this.enemies.push(e)
    return e
  }

  spawnSquad(kinds: EnemyKind[], x: number, z: number, _patrol: Vec2[] = []): void { kinds.forEach((k, i) => this.add(k, x + (i % 3) * 2 - 2, z + Math.floor(i / 3) * 2)) }
  spawnReinforcements(kinds: EnemyKind[], target: Vec2): void {
    const b = this.world.layout.bounds
    kinds.forEach((k, i) => { const e = this.add(k, Math.max(b.minX + 3, Math.min(b.maxX - 3, target.x + 40 + i * 2)), Math.max(b.minZ + 3, Math.min(b.maxZ - 3, target.z))); e.state = "combat"; e.target = { ...target } })
  }

  update(dt: number, player: PlayerState): void {
    const diff = DIFFICULTY[this.opts.difficulty]
    for (const e of this.enemies) {
      if (!e.alive || !player.active || !player.alive) continue
      const def = ENEMIES[e.kind]
      const dx = player.position.x - e.position.x, dz = player.position.z - e.position.z, dist = Math.hypot(dx, dz)
      if (dist > 120) continue
      const eye = { x: e.position.x, y: 1.6, z: e.position.z }, target = { x: player.position.x, y: player.eyeY - 0.2, z: player.position.z }
      const sees = dist < def.vision * this.world.visionScale && !this.world.collision.segmentBlocked3D(eye, target)
      if (sees && e.state !== "combat") { e.state = "combat"; this.opts.events.spotted?.(e) }
      if (e.state !== "combat") continue
      e.group.rotation.y = Math.atan2(-dx, -dz)
      if (dist > 14) { const out = { x: 0, z: 0 }; this.world.collision.moveCircle(e.position.x, e.position.z, dx / dist * def.runSpeed * dt, dz / dist * def.runSpeed * dt, 0.42, out); e.position.x = out.x; e.position.z = out.z }
      e.cooldown -= dt
      if (sees && e.cooldown <= 0 && dist < def.range) {
        e.cooldown = def.burstPause
        const hit = this.rng() < Math.min(0.85, def.accuracy * diff.enemyAccuracy * (player.sprinting ? 0.6 : 1) * Math.max(0.3, 1 - dist / 60))
        this.opts.events.shoot?.({ source: e, from: new THREE.Vector3(e.position.x, 1.4, e.position.z), to: new THREE.Vector3(target.x + (hit ? 0 : 1.2), target.y, target.z), hit, damage: def.damage * diff.enemyDamage, weapon: def.weapon })
      }
    }
  }

  hearNoise(pos: Vec3, radius: number): void { for (const e of this.enemies) if (e.alive && e.state !== "combat" && Math.hypot(e.position.x - pos.x, e.position.z - pos.z) < radius) { e.state = "combat"; e.target = { x: pos.x, z: pos.z } } }

  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): HostileHit | null {
    let best: HostileHit | null = null
    for (const e of this.enemies) {
      if (!e.alive) continue
      const p = e.position
      const head = raySphere(origin, dir, p.x, p.y + 1.66, p.z, 0.16, maxDist)
      const body = rayCapsule(origin, dir, p.x, p.z, p.y + 0.4, p.y + 1.3, 0.3, maxDist)
      let t: number | null = null, part: HostileHit["part"] = "body", bodyPart: BodyPartId = "torso"
      if (head !== null) { t = head; part = "head"; bodyPart = "head" }
      if (body !== null && (t === null || body < t)) { t = body; const y = origin.y + dir.y * body - p.y; part = y < 0.85 ? "limb" : "body"; bodyPart = y < 0.85 ? "legL" : "torso" }
      if (t !== null && (!best || t < best.distance)) best = { target: e, distance: t, part, bodyPart, point: origin.clone().addScaledVector(dir, t) }
    }
    return best
  }

  applyDamage(hit: HostileHit, dmg: DamageInfo): DamageResult {
    const e = hit.target as Merc
    if (!e.alive) return { killed: false, dealt: 0, severed: null, headshotKill: false }
    const dealt = hit.part === "body" ? dmg.amount * (1 - ENEMIES[e.kind].armor * (1 - dmg.penetration)) : dmg.amount
    e.health -= dealt; e.state = "combat"
    this.opts.gore.wound(hit.point, dmg.dir, dealt, { color: e.gore.bloodColor })
    if (e.health > 0) return { killed: false, dealt, severed: null, headshotKill: false }
    e.alive = false; e.state = "dead"; e.group.rotation.x = -Math.PI / 2; e.group.position.y = 0.3
    this.opts.events.died(e, dmg.kind, hit.part)
    return { killed: true, dealt, severed: null, headshotKill: hit.part === "head" }
  }

  applyExplosion(center: Vec3, radius: number, maxDamage: number): Hostile[] {
    const killed: Hostile[] = []
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = Math.hypot(e.position.x - center.x, e.position.z - center.z)
      if (d > radius || this.world.collision.segmentBlocked3D(center, { x: e.position.x, y: 1.2, z: e.position.z })) continue
      e.health -= maxDamage * (1 - d / radius); e.state = "combat"
      if (e.health <= 0) { e.alive = false; e.state = "dead"; killed.push(e); this.opts.events.died(e, "explosion", "body") }
    }
    return killed
  }

  meleeTest(origin: THREE.Vector3, dir: THREE.Vector3, range: number, arcDeg: number, maxTargets: number): HostileHit[] {
    const out: HostileHit[] = [], cos = Math.cos(arcDeg / 2 * Math.PI / 180)
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.position.x - origin.x, dz = e.position.z - origin.z, d = Math.hypot(dx, dz)
      if (d > range + 0.35 || d < 1e-3 || (dx * dir.x + dz * dir.z) / (d * (Math.hypot(dir.x, dir.z) || 1)) < cos) continue
      out.push({ target: e, distance: d, part: "body", bodyPart: "torso", point: new THREE.Vector3(e.position.x, 1.2, e.position.z) })
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, maxTargets)
  }

  inRadius(center: Vec3, radius: number): Hostile[] { return this.enemies.filter(e => e.alive && Math.hypot(e.position.x - center.x, e.position.z - center.z) <= radius) }
  aliveCount(): number { return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) }
  combatCount(): number { return this.enemies.reduce((n, e) => n + (e.alive && e.state === "combat" ? 1 : 0), 0) }
  dispose(): void { for (const e of this.enemies) this.parent.remove(e.group); this.enemies.length = 0; this.material.dispose(); this.geo.dispose() }
}
