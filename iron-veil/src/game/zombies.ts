/**
 * zombies.ts — the infected: models, procedural animation, AI and population management.
 * CONTRACT (used by raid.ts; implements HostileManager from hostiles.ts):
 *  - new InfectedManager(parent, world, { difficulty, seed, events, gore })
 *  - spawn(kind, x, z, opts?): one infected (opts.state "idle" | "wander" | "hunt", opts.target to walk to).
 *  - spawnHorde(center, count, target): a group (screamer call, evac reinforcements, base defense waves).
 *  - populate(zones, player, budget): keeps zone populations around the player — spawns out of sight 45–110 m away,
 *    despawns calm infected beyond 160 m; at most `budget` alive. zones = world.layout infected zones.
 *  - update(dt, player): AI for all living infected; `player.active === false` → wander only, never attack.
 *  - Damage/hit/explosion/melee/radius queries per HostileManager. Dismemberment through opts.gore:
 *    head destroyed → dead; both legs gone → becomes a crawler (keeps attacking from the ground); an arm gone →
 *    weaker attacks. Severing rules: see GORE_RULES below.
 *  - Infected attack the player through events.attack (claws, bites, brute slams, spitter acid).
 *  - Noise: hearNoise(pos, radius × INFECTED[kind].hearing) — shots draw hordes, screamers call others (spawnHorde).
 * PLACEHOLDER: the infected pass replaces this with the full implementation.
 */
import * as THREE from "three"
import type { GoreSystem } from "./gore"
import type { BodyPartId, DamageInfo, DamageResult, GoreBody, Hostile, HostileHit, HostileManager, HostileOptions, PlayerState } from "./hostiles"
import { INFECTED, type InfectedKind } from "./infectedData"
import type { Vec2, Vec3 } from "./types"
import type { World } from "./world"

/** Dismemberment thresholds shared by both factions (only applied when gore.level === "brutal"). */
export const GORE_RULES = {
  /** A limb is severed once it has taken this fraction of the target's max health (limb hits only). */
  limbHealth: 0.35,
  /** A single head hit of at least this damage bursts the head (also on any killing head hit ≥ 60 % of max health). */
  headBurst: 95,
  /** Explosions closer than this (m) gib the whole body on kill. */
  gibRadius: 3.2,
} as const

export interface InfectedZone { x: number; z: number; radius: number; density: number; kinds?: InfectedKind[] }
export interface InfectedSpawnOptions { state?: "idle" | "wander" | "hunt"; target?: Vec2 }

class Infected implements Hostile {
  readonly faction = "infected" as const
  readonly group = new THREE.Group()
  alive = true
  state = "wander"
  health: number
  readonly maxHealth: number
  readonly position: THREE.Vector3
  readonly gore: GoreBody = { parts: {}, bloodColor: 0x5a0a06, severed: new Set<BodyPartId>() }
  attackCooldown = 0
  constructor(readonly id: number, readonly kind: InfectedKind) {
    this.maxHealth = this.health = INFECTED[kind].health
    this.position = this.group.position
  }
  headPosition(out: THREE.Vector3): THREE.Vector3 { return out.set(this.position.x, this.position.y + 1.6, this.position.z) }
  chestPosition(out: THREE.Vector3): THREE.Vector3 { return out.set(this.position.x, this.position.y + 1.2, this.position.z) }
}

export class InfectedManager implements HostileManager {
  readonly faction = "infected" as const
  readonly list: Infected[] = []
  private nextId = 1
  private geo = new THREE.CapsuleGeometry(0.3, 1.1, 4, 8)
  private mat = new THREE.MeshStandardMaterial({ color: 0x5d6b52, roughness: 1 })

  constructor(private parent: THREE.Object3D, private world: World, private opts: HostileOptions & { gore: GoreSystem }) {}

  spawn(kind: InfectedKind, x: number, z: number, _opts: InfectedSpawnOptions = {}): Hostile {
    const e = new Infected(this.nextId++, kind)
    const body = new THREE.Mesh(this.geo, this.mat); body.position.y = 0.85; e.group.add(body)
    e.group.position.set(x, 0, z); this.parent.add(e.group); this.list.push(e)
    return e
  }
  spawnHorde(center: Vec2, count: number, _target: Vec2): void { for (let i = 0; i < count; i++) this.spawn("walker", center.x + (i % 4) * 1.5, center.z + Math.floor(i / 4) * 1.5) }
  populate(_zones: InfectedZone[], _player: PlayerState, _budget: number): void { /* placeholder */ }

  update(dt: number, player: PlayerState): void {
    for (const e of this.list) {
      if (!e.alive) continue
      if (!player.active || !player.alive) continue
      const dx = player.position.x - e.position.x, dz = player.position.z - e.position.z, d = Math.hypot(dx, dz)
      const def = INFECTED[e.kind]
      if (d > 30) continue
      e.group.rotation.y = Math.atan2(-dx, -dz)
      if (d > def.attackRange) { const out = { x: 0, z: 0 }; this.world.collision.moveCircle(e.position.x, e.position.z, dx / d * def.runSpeed * dt, dz / d * def.runSpeed * dt, 0.35, out); e.position.x = out.x; e.position.z = out.z }
      else if ((e.attackCooldown -= dt) <= 0) { e.attackCooldown = def.attackTime; this.opts.events.attack?.({ source: e, damage: def.damage, bleed: "none", infection: def.infection, kind: "claw" }) }
    }
  }

  hearNoise(_pos: Vec3, _radius: number): void { /* placeholder */ }

  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): HostileHit | null {
    let best: HostileHit | null = null
    for (const e of this.list) {
      if (!e.alive) continue
      const t = rayCylinder(origin, dir, e.position.x, e.position.z, 0.35, 0, 1.75, maxDist)
      if (t !== null && (!best || t < best.distance)) {
        const point = origin.clone().addScaledVector(dir, t)
        const y = point.y - e.position.y
        best = { target: e, distance: t, part: y > 1.45 ? "head" : y < 0.85 ? "limb" : "body", bodyPart: y > 1.45 ? "head" : y < 0.85 ? "legL" : "torso", point }
      }
    }
    return best
  }

  applyDamage(hit: HostileHit, dmg: DamageInfo): DamageResult {
    const e = hit.target as Infected
    if (!e.alive) return { killed: false, dealt: 0, severed: null, headshotKill: false }
    const dealt = hit.part === "body" ? dmg.amount * (1 - INFECTED[e.kind].armor * (1 - dmg.penetration)) : dmg.amount
    e.health -= dealt
    if (e.health > 0) return { killed: false, dealt, severed: null, headshotKill: false }
    e.alive = false; e.state = "dead"; e.group.rotation.x = -Math.PI / 2; e.group.position.y = 0.3
    this.opts.events.died(e, dmg.kind, hit.part)
    return { killed: true, dealt, severed: null, headshotKill: hit.part === "head" }
  }

  applyExplosion(center: Vec3, radius: number, maxDamage: number): Hostile[] {
    const killed: Hostile[] = []
    for (const e of this.list) {
      if (!e.alive) continue
      const d = Math.hypot(e.position.x - center.x, e.position.z - center.z)
      if (d > radius) continue
      e.health -= maxDamage * (1 - d / radius)
      if (e.health <= 0) { e.alive = false; e.state = "dead"; killed.push(e); this.opts.events.died(e, "explosion", "body") }
    }
    return killed
  }

  meleeTest(origin: THREE.Vector3, dir: THREE.Vector3, range: number, arcDeg: number, maxTargets: number): HostileHit[] {
    const out: HostileHit[] = []
    const cos = Math.cos(arcDeg / 2 * Math.PI / 180)
    for (const e of this.list) {
      if (!e.alive) continue
      const dx = e.position.x - origin.x, dz = e.position.z - origin.z, d = Math.hypot(dx, dz)
      if (d > range + 0.35 || d < 1e-3) continue
      if ((dx * dir.x + dz * dir.z) / (d * Math.hypot(dir.x, dir.z) || 1) < cos) continue
      out.push({ target: e, distance: d, part: "body", bodyPart: "torso", point: new THREE.Vector3(e.position.x, 1.2, e.position.z) })
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, maxTargets)
  }

  inRadius(center: Vec3, radius: number): Hostile[] { return this.list.filter(e => e.alive && Math.hypot(e.position.x - center.x, e.position.z - center.z) <= radius) }
  aliveCount(): number { return this.list.reduce((n, e) => n + (e.alive ? 1 : 0), 0) }
  combatCount(): number { return 0 }
  dispose(): void { for (const e of this.list) this.parent.remove(e.group); this.list.length = 0; this.geo.dispose(); this.mat.dispose() }
}

/** Ray vs. vertical cylinder (radius r, y0..y1); returns distance or null. */
function rayCylinder(o: THREE.Vector3, d: THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number, maxT: number): number | null {
  const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z
  if (a < 1e-12) return null
  const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r, disc = b * b - a * c
  if (disc < 0) return null
  const t = (-b - Math.sqrt(disc)) / a
  if (t < 0 || t > maxT) return null
  const y = o.y + d.y * t
  return y >= y0 && y <= y1 ? t : null
}
