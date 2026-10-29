/**
 * zombies.ts — the infected: models, procedural animation, AI and population management.
 * CONTRACT (used by raid.ts; implements HostileManager from hostiles.ts):
 *  - new InfectedManager(parent, world, { difficulty, seed, events, gore })
 *  - spawn(kind, x, z, opts?): one infected (opts.state "idle" | "wander" | "hunt", opts.target to walk to).
 *  - spawnHorde(center, count, target, kinds?): a group (screamer call, evac reinforcements, base defense waves). A
 *    center closer than 35 m to the player is moved to a hidden spot 40–65 m away; the group walks to `target`.
 *  - populate(zones, player, budget): keeps zone populations around the player — at most once per second; spawns out
 *    of sight 30–110 m away (hidden behind obstacles, or > 45 m and outside the view cone), despawns calm infected
 *    and corpses beyond 160 m; at most `budget` alive. zones = world.layout infected zones (density = per m²).
 *  - update(dt, player): AI for all living infected; `player.active === false` → wander only, never attack.
 *    Optional `player.yaw` (camera yaw, 0 = -Z) sharpens view-cone checks; without it the facing is estimated
 *    from the player's movement.
 *  - Damage/hit/explosion/melee/radius queries per HostileManager. Dismemberment through opts.gore:
 *    head destroyed → dead; both legs gone → becomes a crawler (keeps attacking from the ground); an arm gone →
 *    weaker attacks. Severing rules: see GORE_RULES below.
 *  - Infected attack the player through events.attack (claws, bites, brute slams, spitter acid).
 *  - Noise: hearNoise(pos, radius × INFECTED[kind].hearing) — shots draw hordes, screamers call others (spawnHorde).
 * ADDITIVE (beyond HostileManager): `list`, `viewer` (camera position for LOD; defaults to the player), `onImpact`
 * (slams/charges, for camera shake), `boss()`, `stats()`, `fx` (acid puddles), `debugAction()` for the test bench.
 * Kinds: walker (shambling groups), runner (sprinter, shrieks on sight), brute (armoured, slams), screamer (calls a
 * horde, keeps its distance), spitter (lobs acid → puddles), stalker (on all fours, flanks, leaps), crawler (legless),
 * boss "Der Koloss" (phases at 66 % / 33 %: charge, shockwave slam, summons runners; ×2 weak spot on the back).
 */
import * as THREE from "three"
import { DIFFICULTY, THEMES } from "./data"
import type { GoreSystem } from "./gore"
import type { BodyPartId, DamageInfo, DamageResult, GoreBody, HitPart, Hostile, HostileHit, HostileManager, HostileOptions, HostileSound, PlayerState } from "./hostiles"
import { INFECTED, type InfectedDef, type InfectedKind } from "./infectedData"
import type { Vec2, Vec3 } from "./types"
import type { World } from "./world"
import { FlowField, LOSE_INTEREST, SPAWN_RULES, findSpawnPoint, goreOutcome, makeRng, movementNoise, perceive, pickKind, rayCapsule, raySegmentDist2, separation, sightRange, zoneTarget } from "./zombieAi"
import { CLIPS, computePose, crawlDeathPose, cycleLength, sampleClip, type Action, type AnimDriver, type Clip, type ClipName, type Gait } from "./zombieAnim"
import { InfectedFx } from "./zombieFx"
import { BLOOD, InfectedAssets, P, POSE_N, SPECS, VARIANTS, WEAK_SPOT, applyPose, bakeRig, createRig, type Rig } from "./zombieModel"

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

type Mode = "idle" | "wander" | "investigate" | "hunt" | "chase"

/** Hard cap on living infected (hordes included) to protect the frame budget. */
export const MAX_ALIVE = 64
const MAX_CORPSES = 24
const LOD_DIST = 45
const SHADOW_DIST = 26
const PART_INDEX: Record<BodyPartId, number> = { head: 0, torso: 1, armL: 2, armR: 3, legL: 4, legR: 5 }
/** Extra head damage on top of the weapon's head multiplier: the head is the infected's weak point. */
const HEAD_BONUS: Record<InfectedKind, number> = { walker: 1.5, runner: 1.5, screamer: 1.5, spitter: 1.4, stalker: 1.3, crawler: 1.5, bloater: 1.3, brute: 1, boss: 0.8 }
const HEAD_ARMOR: Record<InfectedKind, number> = { walker: 0, runner: 0, screamer: 0, spitter: 0, stalker: 0, crawler: 0, bloater: 0, brute: 0.2, boss: 0.15 }
/** Attack wind-up (telegraph) in seconds. */
const WIND: Record<InfectedKind, number> = { walker: 0.45, runner: 0.28, brute: 0.62, screamer: 0.4, spitter: 0.4, stalker: 0.3, crawler: 0.42, bloater: 0.55, boss: 0.75 }
const TURN: Record<InfectedKind, number> = { walker: 3.5, runner: 8, brute: 2.4, screamer: 4, spitter: 3, stalker: 7, crawler: 2.5, bloater: 2.4, boss: 1.7 }
const FOV_COS: Record<InfectedKind, number> = { walker: 0.34, runner: 0.34, brute: 0.34, screamer: 0.26, spitter: 0.5, stalker: 0.08, crawler: 0.34, bloater: 0.4, boss: 0.2 }
/** Damage (fraction of max health) that staggers / interrupts a wind-up. */
const STAGGER: Record<InfectedKind, number> = { walker: 0.12, runner: 0.14, screamer: 0.1, spitter: 0.15, stalker: 0.2, crawler: 0.2, bloater: 0.1, brute: 0.22, boss: 9 }

const WALKERS: readonly InfectedKind[] = ["walker", "walker", "walker", "runner"]

export class Infected implements Hostile, AnimDriver {
  readonly faction = "infected" as const
  readonly group = new THREE.Group()
  alive = true
  state = "idle"
  health: number
  readonly maxHealth: number
  readonly position: THREE.Vector3
  readonly gore: GoreBody
  readonly rig: Rig
  readonly def: InfectedDef
  scale = 1
  // --- AI
  mode: Mode = "idle"
  modeT = 0
  yaw = 0
  vx = 0; vz = 0
  goalX = 0; goalZ = 0; goalSpeed = 0
  useFlow = false; facePlayer = false
  homeX = 0; homeZ = 0
  zone: InfectedZone | null = null
  lastKnownX = 0; lastKnownZ = 0; lastContact = -1e9
  spottedOnce = false
  senseT = 0; alertDelay = 0
  path: Vec2[] | null = null; pathIdx = 0; repathT = 0; pathGoalX = 1e9; pathGoalZ = 1e9
  directT = 0; direct = false
  stuckT = 0
  cooldown = 0; special = 0; special2 = 0; summonT = 0; screams = 0
  stun = 0
  bossPhase = 1
  slot = -1
  tickAcc = 0; matFrame = -1
  voiceNext = 0; voiceLast = -1e9; groanT = 0
  // --- body
  legless = false; armsLost = 0; legsLost = 0
  readonly limbDmg = new Float32Array(6)
  blastFrame = -1; blastDamage = 0
  // --- AnimDriver
  gait: Gait = "shamble"
  phase = 0; speed = 0; move = 0; seed = 0; limp = 1; limpArm = 0; t = 0; alert = 0; feeding = false
  action: Action = "none"; actionT = 0; actionDur = 0; wind = 0; side = 1; struck = false
  stagger = 0; hitX = 0; hitZ = 0
  arc = 0
  readonly pose = new Float32Array(POSE_N)
  readonly target = new Float32Array(POSE_N)
  readonly from = new Float32Array(POSE_N)
  clip: Clip | null = null; clipT = 0; poseRate = 14
  // --- special moves
  leapVX = 0; leapVZ = 0; leapDur = 0; leapH = 0
  chargeX = 0; chargeZ = 0
  ringR = -1; ringHit = false; shockSlam = false
  // --- death / corpse
  deathT = 0; pooled = false; gibbed = false; baked = false; crawlDeath = false
  lodOn = false; shadowOn = true

  constructor(readonly id: number, readonly kind: InfectedKind, readonly variant: number, assets: InfectedAssets, readonly manager: InfectedManager) {
    this.def = INFECTED[kind]
    this.maxHealth = this.health = this.def.health
    this.position = this.group.position
    this.rig = createRig(assets, kind, variant, this.group)
    const r = this.rig
    const parts: GoreBody["parts"] = { head: r.head, torso: r.torso, armL: r.armL, armR: r.armR }
    if (r.legL && r.legR) { parts.legL = r.legL; parts.legR = r.legR }
    this.gore = { parts, bloodColor: BLOOD[kind], severed: new Set<BodyPartId>() }
    if (!r.legL) { this.gore.severed.add("legL"); this.gore.severed.add("legR"); this.legless = true; this.legsLost = 3 }
    this.gait = kind === "brute" || kind === "boss" ? "lumber" : kind === "stalker" ? "quad" : this.legless ? "drag" : kind === "runner" ? "run" : "shamble"
  }

  headPosition(out: THREE.Vector3): THREE.Vector3 {
    this.rig.head.updateWorldMatrix(true, false)
    return this.rig.head.localToWorld(out.set(0, this.rig.spec.headR * 0.95, 0))
  }
  chestPosition(out: THREE.Vector3): THREE.Vector3 {
    this.rig.torso.updateWorldMatrix(true, false)
    return this.rig.torso.localToWorld(out.set(0, this.rig.spec.torsoLen * 0.62, 0))
  }
  /** Approximate chest height above the feet for the current posture (no matrix work). */
  chestY(): number {
    const S = this.rig.spec
    if (this.gait === "drag" || this.legless) return 0.3
    if (this.gait === "quad" && this.action !== "leap") return 0.62 * this.scale
    return (S.hipH + S.torsoLen * 0.55) * this.scale
  }
  eyeY(): number {
    const S = this.rig.spec
    if (this.gait === "drag" || this.legless) return 0.45
    if (this.gait === "quad") return 0.75 * this.scale
    return (S.hipH + S.torsoLen + S.neck + S.headR) * this.scale * 0.97
  }
}

export interface InfectedStats { alive: number; corpses: number; lod: number; hidden: number; meshes: number; blobs: number; puddles: number; chasing: number }

export class InfectedManager implements HostileManager {
  readonly faction = "infected" as const
  readonly list: Infected[] = []
  /** Camera position for LOD/visibility (defaults to the player's position). */
  viewer: THREE.Vector3 | null = null
  /** Heavy ground impacts (brute slam, boss charge/shockwave) for camera shake: strength 0..1. */
  onImpact: ((pos: Vec3, strength: number) => void) | null = null
  readonly fx: InfectedFx
  readonly assets = new InfectedAssets()
  private rng: () => number
  private nextId = 1
  private time = 0
  private frame = 0
  /** Active flow field toward the player (steering) and the one being rebuilt over a few frames. */
  private flow: FlowField
  private flowBuild: FlowField
  private flowNext = 0
  private chasers = 0
  private xs = new Float32Array(MAX_ALIVE + 32)
  private zs = new Float32Array(MAX_ALIVE + 32)
  private rs = new Float32Array(MAX_ALIVE + 32)
  private nSlots = 0
  private pathBudget = 3
  private bakeBudget = 1
  private voiceBudget = 5
  private stepBudget = 6
  private nextPopulate = 0
  private zoneCount = new Map<InfectedZone, number>()
  private facing: Vec2 = { x: 0, z: -1 }
  private facingKnown = false
  private lastPX = NaN
  private lastPZ = 0
  private pvx = 0
  private pvz = 0
  private fogFar = 200
  private fogCheck = 0
  private readonly night: boolean
  private readonly visionScale: number
  private readonly gore: GoreSystem
  private lastPlayer: PlayerState | null = null

  constructor(private parent: THREE.Object3D, private world: World, private opts: HostileOptions & { gore: GoreSystem }) {
    this.rng = makeRng(opts.seed ^ 0x5eed1)
    this.gore = opts.gore
    this.flow = new FlowField(world.nav, 40)
    this.flowBuild = new FlowField(world.nav, 40)
    const theme = THEMES[world.theme]
    this.night = theme.night
    this.visionScale = theme.visionScale
    this.assets.glow.value = this.night ? 2.4 : 0.4
    this.fx = new InfectedFx(parent)
  }

  // ================================================================== spawning

  /**
   * Builds the cached geometry of every look variant up front (~200 ms for all kinds). Call it while the raid
   * loads; otherwise each variant is built on first spawn (~6 ms each, spawns happen out of sight).
   */
  prewarm(kinds: readonly InfectedKind[] = ["walker", "runner", "brute", "screamer", "spitter", "stalker", "crawler", "bloater", "boss"]): number {
    let n = 0
    for (const k of kinds) for (let v = 0; v < VARIANTS[k]; v++) { this.assets.get(k, v); n++ }
    return n
  }

  spawn(kind: InfectedKind, x: number, z: number, opts: InfectedSpawnOptions = {}): Infected {
    const variant = Math.floor(this.rng() * VARIANTS[kind]) % VARIANTS[kind]
    const e = new Infected(this.nextId++, kind, variant, this.assets, this)
    const p = { x, z }
    if (this.world.collision.collides(x, z, e.rig.spec.radius)) this.world.collision.depenetrate(p, e.rig.spec.radius)
    e.position.set(p.x, 0, p.z)
    e.homeX = p.x; e.homeZ = p.z
    e.yaw = this.rng() * Math.PI * 2; e.group.rotation.y = e.yaw
    e.seed = this.rng(); e.limp = this.rng() < 0.5 ? -1 : 1; e.limpArm = kind === "walker" && this.rng() < 0.3 ? (this.rng() < 0.5 ? -1 : 1) : 0
    e.scale = kind === "boss" ? 1 : kind === "brute" ? 0.96 + this.rng() * 0.1 : 0.93 + this.rng() * 0.13
    e.rig.body.scale.setScalar(e.scale)
    e.phase = this.rng() * Math.PI * 2
    e.groanT = 3 + this.rng() * 10
    e.senseT = this.rng() * 0.3
    e.special = kind === "screamer" ? 0 : 2 + this.rng() * 3
    const state = opts.state ?? "wander"
    if (state === "hunt") {
      const t = opts.target ?? { x: p.x, z: p.z }
      e.mode = "hunt"; e.lastKnownX = t.x; e.lastKnownZ = t.z; e.alert = 0.8
    } else if (state === "idle") {
      e.mode = "idle"; e.modeT = 4 + this.rng() * 10
      e.feeding = (kind === "walker" || kind === "runner") && this.rng() < 0.35
    } else { e.mode = "wander"; this.pickWander(e) }
    computePose(e.pose, e, e.rig.spec)
    applyPose(e.rig, e.pose)
    e.state = e.mode
    this.parent.add(e.group)
    this.list.push(e)
    return e
  }

  /** Spawns `count` infected around `center` (moved out of sight when too close) that walk to `target`. */
  spawnHorde(center: Vec2, count: number, target: Vec2, kinds?: readonly InfectedKind[]): number {
    const pl = this.lastPlayer
    let cx = center.x, cz = center.z
    if (pl && Math.hypot(cx - pl.position.x, cz - pl.position.z) < 35) {
      const out = { x: 0, z: 0 }
      _eye.x = pl.position.x; _eye.y = pl.eyeY; _eye.z = pl.position.z
      if (findSpawnPoint(pl.position.x, pl.position.z, 65, _eye, this.facingKnown ? this.facing : null, this.world.nav, this.world.collision, this.rng, out, 24, 40)) { cx = out.x; cz = out.z }
    }
    const room = Math.max(0, MAX_ALIVE - this.aliveCount())
    const n = Math.min(count, room)
    const spread = 1.5 + Math.sqrt(n) * 1.1
    let brutes = 0
    for (let i = 0; i < n; i++) {
      let kind: InfectedKind
      if (kinds && kinds.length) kind = kinds[Math.floor(this.rng() * kinds.length) % kinds.length]
      else { const r = this.rng(); kind = r < 0.25 ? "runner" : r < 0.29 && n >= 10 && brutes < Math.floor(n / 10) ? (brutes++, "brute") : "walker" }
      const p = this.world.nav.randomPointNear(cx, cz, spread, this.rng) ?? { x: cx, z: cz }
      const e = this.spawn(kind, p.x, p.z, { state: "hunt", target })
      e.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z)); e.group.rotation.y = e.yaw
    }
    return n
  }

  populate(zones: InfectedZone[], player: PlayerState, budget: number): void {
    if (this.time < this.nextPopulate) return
    this.nextPopulate = this.time + 1
    this.lastPlayer = player
    const px = player.position.x, pz = player.position.z
    // despawn calm infected and corpses far away
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i]
      const d = Math.hypot(e.position.x - px, e.position.z - pz)
      if (d <= SPAWN_RULES.despawnDist) continue
      if (!e.alive || e.mode === "idle" || e.mode === "wander") this.remove(i)
    }
    const counts = this.zoneCount; counts.clear()
    let alive = 0
    for (const e of this.list) if (e.alive) { alive++; if (e.zone) counts.set(e.zone, (counts.get(e.zone) ?? 0) + 1) }
    _eye.x = px; _eye.y = player.eyeY; _eye.z = pz
    const facing = this.facingKnown ? this.facing : null
    let spawned = 0
    const out = { x: 0, z: 0 }
    for (const zone of zones) {
      if (alive >= budget || spawned >= 8) break
      const dc = Math.hypot(zone.x - px, zone.z - pz)
      if (dc - zone.radius > SPAWN_RULES.maxDist || dc + zone.radius < SPAWN_RULES.minDist) continue
      const want = zoneTarget(zone.radius, zone.density)
      let have = counts.get(zone) ?? 0, perZone = 0
      while (have < want && alive < budget && spawned < 8 && perZone < 4) {
        if (!findSpawnPoint(zone.x, zone.z, zone.radius, _eye, facing, this.world.nav, this.world.collision, this.rng, out, 8)) break
        const kind = pickKind(zone.kinds, this.rng, this.night)
        const group = kind === "walker" ? 1 + Math.floor(this.rng() * 3) : 1
        const sx = out.x, sz = out.z
        for (let g = 0; g < group && have < want && alive < budget; g++) {
          let x = sx, z = sz
          if (g > 0) {
            const p = this.world.nav.randomPointNear(sx, sz, 2.5, this.rng)
            if (!p || Math.hypot(p.x - px, p.z - pz) < SPAWN_RULES.minDist) continue
            x = p.x; z = p.z
          }
          const e = this.spawn(kind, x, z, { state: this.rng() < 0.4 ? "idle" : "wander" })
          e.zone = zone; e.homeX = zone.x; e.homeZ = zone.z
          have++; alive++; spawned++; perZone++
        }
      }
    }
  }

  // ================================================================== update

  update(dt: number, player: PlayerState): void {
    this.time += dt; this.frame++
    this.lastPlayer = player
    const active = player.active && player.alive
    this.trackPlayer(player, dt)
    if (--this.fogCheck <= 0) { this.fogCheck = 60; this.findFog() }
    this.voiceBudget = Math.min(5, this.voiceBudget + dt * 4)
    this.stepBudget = Math.min(8, this.stepBudget + dt * 10)
    this.pathBudget = 1; this.bakeBudget = 1
    const px = player.position.x, pz = player.position.z
    // time-sliced Dijkstra: ~1/4 of the window per frame, swapped in when complete (no frame spikes)
    if (this.flowBuild.building) {
      if (this.flowBuild.advance(1800)) { const f = this.flow; this.flow = this.flowBuild; this.flowBuild = f }
    } else if (active && this.chasers > 0 && this.time >= this.flowNext) { this.flowBuild.begin(px, pz); this.flowNext = this.time + 0.35 }
    if (!active || (this.chasers === 0 && !this.flowBuild.building)) this.flow.valid = false
    this.chasers = 0
    let n = 0
    for (const e of this.list) {
      if (e.alive && n < this.xs.length) { e.slot = n; this.xs[n] = e.position.x; this.zs[n] = e.position.z; this.rs[n] = e.rig.spec.radius * e.scale; n++ } else e.slot = -1
    }
    this.nSlots = n
    const vx = this.viewer ? this.viewer.x : px, vz = this.viewer ? this.viewer.z : pz
    let corpses = 0
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i]
      const dv = Math.hypot(e.position.x - vx, e.position.z - vz)
      if (!e.alive) { corpses++; this.updateCorpse(e, dt, dv); continue }
      const d = Math.hypot(e.position.x - px, e.position.z - pz)
      e.tickAcc += dt
      const every = d > 90 ? 4 : d > 50 ? 2 : 1
      if (every > 1 && (this.frame + e.id) % every !== 0) continue
      const edt = Math.min(0.12, e.tickAcc); e.tickAcc = 0
      this.think(e, edt, player, d, active)
      this.updateVisual(e, edt, dv)
    }
    _target.x = px; _target.y = player.position.y; _target.z = pz; _target.eyeY = player.eyeY; _target.active = active
    this.fx.update(dt, this.world.collision, _target, this.acidDirect, this.acidPuddle)
    if (corpses > MAX_CORPSES) this.trimCorpses(corpses - MAX_CORPSES, vx, vz)
  }

  private acidDirect = (source: unknown): void => {
    const e = source as Infected
    this.opts.events.attack?.({ source: e, damage: e.def.damage * DIFFICULTY[this.opts.difficulty].enemyDamage, bleed: "none", infection: e.def.infection, kind: "acid" })
  }
  private acidPuddle = (source: unknown): void => {
    const e = source as Infected
    this.opts.events.attack?.({ source: e, damage: 3.5 * DIFFICULTY[this.opts.difficulty].enemyDamage, bleed: "none", infection: 2, kind: "acid" })
  }

  private trackPlayer(pl: PlayerState, dt: number): void {
    const x = pl.position.x, z = pl.position.z
    if (this.lastPX !== this.lastPX) { this.lastPX = x; this.lastPZ = z }
    const dx = x - this.lastPX, dz = z - this.lastPZ
    if (dt > 0) { this.pvx = this.pvx * 0.8 + dx / dt * 0.2; this.pvz = this.pvz * 0.8 + dz / dt * 0.2 }
    this.lastPX = x; this.lastPZ = z
    const yaw = (pl as PlayerState & { yaw?: number }).yaw
    if (typeof yaw === "number") { this.facing.x = -Math.sin(yaw); this.facing.z = -Math.cos(yaw); this.facingKnown = true }
    else {
      const d = Math.hypot(dx, dz)
      if (d > 0.01) {
        const fx = this.facing.x * 0.85 + dx / d * 0.15, fz = this.facing.z * 0.85 + dz / d * 0.15, l = Math.hypot(fx, fz) || 1
        this.facing.x = fx / l; this.facing.z = fz / l; this.facingKnown = true
      }
    }
  }

  private findFog(): void {
    let o: THREE.Object3D = this.parent
    while (o.parent) o = o.parent
    const fog = (o as THREE.Scene).fog
    if (fog && (fog as THREE.Fog).isFog) this.fogFar = (fog as THREE.Fog).far
    else if (fog && (fog as THREE.FogExp2).isFogExp2) this.fogFar = 2.6 / (fog as THREE.FogExp2).density
    else this.fogFar = 220
  }

  // ================================================================== AI

  private think(e: Infected, dt: number, pl: PlayerState, d: number, active: boolean): void {
    const T = this.time
    e.t += dt
    e.cooldown -= dt; e.special -= dt; e.special2 -= dt; e.summonT -= dt
    if (e.stagger > 0) e.stagger = Math.max(0, e.stagger - dt * 2.4)
    if (e.stun > 0) e.stun -= dt
    e.alert += ((e.mode === "chase" ? 1 : e.mode === "hunt" || e.mode === "investigate" ? 0.5 : 0) - e.alert) * Math.min(1, dt * 2)
    if (e.ringR >= 0) this.updateShockwave(e, dt, pl, active)
    if (!active && (e.mode === "chase" || e.mode === "investigate" || e.mode === "hunt")) { e.mode = "wander"; e.action = "none"; this.pickWander(e) }
    if (e.clip) {
      e.clipT += dt
      e.goalSpeed = 0
      if (e.clipT >= e.clip.dur) { e.clip = null; e.poseRate = 8 }
      this.locomote(e, dt, pl, d, active)
      e.state = "knockdown"
      return
    }
    if (active) {
      e.senseT -= dt
      if (e.senseT <= 0) { e.senseT = 0.15 + ((e.id * 37) % 16) / 100; this.sense(e, pl, d) }
    }
    if (e.kind === "boss" && e.alive) this.bossPhaseCheck(e)
    e.facePlayer = false; e.useFlow = false
    if (e.action !== "none") this.runAction(e, dt, pl, d, active)
    else if (e.stun > 0 || e.alertDelay > 0) {
      e.goalSpeed = 0
      if (e.alertDelay > 0) { e.alertDelay -= dt; e.facePlayer = active }
    } else this.decide(e, dt, pl, d, active)
    this.locomote(e, dt, pl, d, active)
    if (e.mode === "chase" && T - e.lastContact < 1.2) this.chasers++
    // ambient groans
    e.groanT -= dt
    if (e.groanT <= 0) { e.groanT = 5 + this.rng() * 10; if (d < 45) this.voice(e, e.mode === "chase" ? "attack" : "groan", 3) }
    e.state = e.action !== "none" ? e.action : e.stun > 0 && e.stagger > 0 ? "stagger" : e.feeding && e.mode === "idle" ? "feeding" : e.mode
  }

  private sense(e: Infected, pl: PlayerState, d: number): void {
    const def = e.def
    const range = sightRange(def.sight, this.visionScale * this.world.weatherVision, pl.flashlight, pl.crouched)
    const dx = pl.position.x - e.position.x, dz = pl.position.z - e.position.z
    const cos = d > 1e-4 ? (dx * -Math.sin(e.yaw) + dz * -Math.cos(e.yaw)) / d : 1
    const noise = movementNoise(pl.speed, pl.sprinting, pl.crouched)
    const chasing = e.mode === "chase" && this.time - e.lastContact < 6
    this.senseE = e; this.senseP = pl
    const s = perceive(d, cos, FOV_COS[e.kind], range, chasing, noise, def.hearing, this.blockedFn)
    if (s === "see" || s === "smell") {
      e.lastKnownX = pl.position.x; e.lastKnownZ = pl.position.z; e.lastContact = this.time
      if (e.mode !== "chase") this.alert(e, d)
    } else if (s === "hear" && e.mode !== "chase") {
      e.lastKnownX = pl.position.x + (this.rng() - 0.5) * 3; e.lastKnownZ = pl.position.z + (this.rng() - 0.5) * 3
      if (d < noise * 0.45) { e.lastContact = this.time - 2; this.alert(e, d) }
      else { e.mode = "investigate"; e.modeT = 0; e.feeding = false; e.path = null; this.voice(e, "alert", 4) }
    }
  }

  private senseE: Infected | null = null
  private senseP: PlayerState | null = null
  private blockedFn = (): boolean => this.sightBlocked(this.senseE!, this.senseP!)

  private sightBlocked(e: Infected, pl: PlayerState): boolean {
    _a.x = e.position.x; _a.y = e.position.y + e.eyeY(); _a.z = e.position.z
    _b.x = pl.position.x; _b.y = pl.eyeY - 0.12; _b.z = pl.position.z
    if (this.world.obscurants.blocks(_a, _b)) return true
    if (!this.world.collision.segmentBlocked3D(_a, _b)) return false
    _b.y = Math.max(0.5, pl.eyeY - 0.6)
    return this.world.collision.segmentBlocked3D(_a, _b)
  }

  /** Clear 3D line between the infected's chest and the player's chest (no attacks through walls). */
  private lineClear(e: Infected, pl: PlayerState): boolean {
    _a.x = e.position.x; _a.y = e.position.y + e.chestY(); _a.z = e.position.z
    _b.x = pl.position.x; _b.y = e.chestY() < 0.5 ? pl.position.y + 0.45 : pl.eyeY - 0.45; _b.z = pl.position.z
    return !this.world.collision.segmentBlocked3D(_a, _b)
  }

  private alert(e: Infected, d: number): void {
    const def = e.def
    e.mode = "chase"; e.feeding = false; e.path = null
    if (e.lastContact < this.time - 30) e.lastContact = this.time - 5
    e.alertDelay = d > 6 ? 0.12 + DIFFICULTY[this.opts.difficulty].reaction * 0.45 * Math.min(1, d / 20) : 0.05
    if (!e.spottedOnce && this.time - e.lastContact < 0.5) { e.spottedOnce = true; this.opts.events.spotted?.(e) }
    if (e.kind === "runner") this.voice(e, "scream", 2, true)
    else if (e.kind === "brute" || e.kind === "boss") this.voice(e, "roar", 3, true)
    else if (e.kind !== "screamer") this.voice(e, "alert", 2)
    // horde: neighbours follow the alerted leader (one level deep, no chain reaction)
    const r = e.kind === "runner" ? 18 : 12
    for (const o of this.list) {
      if (o === e || !o.alive || o.mode === "chase") continue
      const dx = o.position.x - e.position.x, dz = o.position.z - e.position.z
      if (dx * dx + dz * dz > r * r) continue
      o.mode = "chase"; o.feeding = false; o.path = null
      o.lastKnownX = e.lastKnownX; o.lastKnownZ = e.lastKnownZ; o.lastContact = Math.max(o.lastContact, this.time - 8)
      o.alertDelay = 0.25 + this.rng() * 0.6
    }
    if (e.kind === "screamer" && e.special <= 0 && e.screams < 4) this.startAction(e, "scream", 2.3, 0.55)
  }

  hearNoise(pos: Vec3, radius: number): void {
    for (const e of this.list) {
      if (!e.alive || (e.mode === "chase" && this.time - e.lastContact < 3)) continue
      const d = Math.hypot(e.position.x - pos.x, e.position.z - pos.z)
      const r = radius * e.def.hearing
      if (d > r) continue
      const jitter = Math.min(4, d * 0.08)
      e.lastKnownX = pos.x + (this.rng() - 0.5) * 2 * jitter; e.lastKnownZ = pos.z + (this.rng() - 0.5) * 2 * jitter
      e.feeding = false; e.path = null; e.modeT = 0
      if (d < r * 0.35) { e.mode = "chase"; e.lastContact = Math.max(e.lastContact, this.time - 4); e.alertDelay = 0.2 + this.rng() * 0.4 }
      else if (e.mode !== "chase") e.mode = "investigate"
      if (d < 40) this.voice(e, "alert", 5)
    }
  }

  private decide(e: Infected, dt: number, pl: PlayerState, d: number, active: boolean): void {
    const def = e.def
    switch (e.mode) {
      case "idle":
        e.goalSpeed = 0
        if (!e.feeding && (e.modeT -= dt) <= 0) { e.mode = "wander"; this.pickWander(e) }
        break
      case "wander": {
        const gd = Math.hypot(e.goalX - e.position.x, e.goalZ - e.position.z)
        if (gd < 0.8 || e.stuckT > 1) {
          if (this.rng() < 0.45) { e.mode = "idle"; e.modeT = 2 + this.rng() * 6 } else this.pickWander(e)
        }
        e.goalSpeed = def.walkSpeed * (0.55 + e.seed * 0.35) * (e.legless ? 0.8 : 1)
        break
      }
      case "investigate": case "hunt": {
        e.goalX = e.lastKnownX; e.goalZ = e.lastKnownZ
        const gd = Math.hypot(e.goalX - e.position.x, e.goalZ - e.position.z)
        const urgent = e.mode === "hunt"
        e.goalSpeed = (urgent ? def.runSpeed * (e.kind === "walker" ? 0.8 : 0.9) : Math.min(def.runSpeed * 0.6, def.walkSpeed * 1.7)) * this.legFactor(e)
        if (gd < (urgent ? 3 : 1.5)) {
          e.goalSpeed = 0
          if ((e.modeT += dt) > (urgent ? 1 : 4)) { e.mode = urgent ? "investigate" : "wander"; e.modeT = 0; if (urgent) { e.lastKnownX += (this.rng() - 0.5) * 10; e.lastKnownZ += (this.rng() - 0.5) * 10 } else this.pickWander(e) }
        }
        break
      }
      case "chase": this.chase(e, dt, pl, d, active); break
    }
  }

  private legFactor(e: Infected): number {
    if (e.kind === "crawler") return 1
    if (e.legless) return 0.42
    if (e.legsLost) return 0.4
    return 1
  }

  private pickWander(e: Infected): void {
    const z = e.zone, cx = z ? z.x : e.homeX, cz = z ? z.z : e.homeZ, r = z ? z.radius : 10
    const p = this.world.nav.randomPointNear(cx, cz, r, this.rng)
    e.goalX = p ? p.x : e.position.x; e.goalZ = p ? p.z : e.position.z
    e.path = null
  }

  private chase(e: Infected, dt: number, pl: PlayerState, d: number, active: boolean): void {
    const def = e.def, T = this.time
    const since = T - e.lastContact
    if (!active || since > LOSE_INTEREST) { e.mode = "wander"; this.pickWander(e); this.voice(e, "groan", 4); return }
    const fresh = since < 1.2
    const tx = fresh ? pl.position.x : e.lastKnownX, tz = fresh ? pl.position.z : e.lastKnownZ
    e.goalX = tx; e.goalZ = tz
    e.goalSpeed = def.runSpeed * this.legFactor(e)
    // brake on arrival so sprinters don't overshoot the player
    if (fresh) e.goalSpeed = Math.min(e.goalSpeed, Math.max(0.4, (d - def.attackRange * 0.6) * 3.5))
    e.useFlow = fresh && this.flow.valid && this.flow.costAt(e.position.x, e.position.z) < 1e6
    if (fresh && d < 7) e.facePlayer = true
    // reached the last known spot without contact → search around it
    if (!fresh && Math.hypot(tx - e.position.x, tz - e.position.z) < 2 && since > 3) { e.mode = "investigate"; e.modeT = 0; e.lastKnownX += (this.rng() - 0.5) * 8; e.lastKnownZ += (this.rng() - 0.5) * 8; return }
    const canMelee = fresh && e.cooldown <= 0 && d <= def.attackRange && this.facing01(e, pl) > 0.55
    switch (e.kind) {
      case "screamer": {
        if (e.special <= 0 && e.screams < 4 && fresh && d < 40) { this.startAction(e, "scream", 2.3, 0.55); return }
        if (canMelee && d < 1.6 && this.lineClear(e, pl)) { this.startMelee(e); return }
        this.keepDistance(e, pl, d, 8, 14)
        return
      }
      case "spitter": {
        if (fresh && e.special <= 0 && d > 3.5 && d <= def.attackRange && this.facing01(e, pl) > 0.7 && this.lineClear(e, pl)) { this.startAction(e, "spit", 1.35, 0.65); return }
        if (canMelee && d < 1.6 && this.lineClear(e, pl)) { this.startMelee(e); return }
        if (fresh) this.keepDistance(e, pl, d, 6.5, 11)
        return
      }
      case "stalker": {
        if (!e.legless && fresh && e.special <= 0 && d > 2.6 && d < 7.5 && (this.behindPlayer(e, pl) || d < 4.5 || e.special < -5) && this.lineClear(e, pl)) { this.startAction(e, "leap", 1.6, 0.38); return }
        if (canMelee && this.lineClear(e, pl)) { this.startMelee(e); return }
        if (fresh && d > 7.5 && !e.legless) {
          // flank: circle around to the player's back before closing in
          const bx = pl.position.x - this.facing.x * 5, bz = pl.position.z - this.facing.z * 5
          if (this.world.nav.walkable(bx, bz)) { e.goalX = bx; e.goalZ = bz; e.useFlow = false; e.goalSpeed = def.runSpeed * 0.8 }
        }
        return
      }
      case "bloater": {
        // waddles up and bursts itself next to the player (a long, visible swell gives time to back off or shoot)
        if (fresh && !e.legless && d < 2.6 && e.special <= 0 && this.lineClear(e, pl)) { this.startAction(e, "burst", 1.5, 1.25); return }
        if (canMelee && this.lineClear(e, pl)) { this.startMelee(e); return }
        return
      }
      case "boss": this.bossChase(e, pl, d, fresh, canMelee); return
      default:
        if (canMelee && this.lineClear(e, pl)) { this.startMelee(e); return }
        if (fresh && d < def.attackRange * 0.75) e.goalSpeed = 0
    }
  }

  private keepDistance(e: Infected, pl: PlayerState, d: number, near: number, far: number): void {
    e.facePlayer = true
    if (d < near) {
      const ax = e.position.x - pl.position.x, az = e.position.z - pl.position.z, l = Math.hypot(ax, az) || 1
      e.goalX = e.position.x + ax / l * 4; e.goalZ = e.position.z + az / l * 4; e.useFlow = false; e.goalSpeed = e.def.runSpeed * 0.7
    } else if (d < far) e.goalSpeed = 0
  }

  private facing01(e: Infected, pl: PlayerState): number {
    const dx = pl.position.x - e.position.x, dz = pl.position.z - e.position.z, d = Math.hypot(dx, dz)
    return d < 1e-4 ? 1 : (dx * -Math.sin(e.yaw) + dz * -Math.cos(e.yaw)) / d
  }

  private behindPlayer(e: Infected, pl: PlayerState): boolean {
    const dx = e.position.x - pl.position.x, dz = e.position.z - pl.position.z, d = Math.hypot(dx, dz) || 1
    return (dx * this.facing.x + dz * this.facing.z) / d < -0.2
  }

  private startAction(e: Infected, a: Action, dur: number, wind: number): void {
    e.action = a; e.actionT = 0; e.actionDur = dur; e.wind = wind; e.struck = false; e.feeding = false
    if (a === "scream") { e.screams++; e.special = 16 + this.rng() * 6 }
    if (a === "spit") { e.special = e.def.attackTime + this.rng() * 1.5; this.voice(e, "spit", 1.5, true) }
    if (a === "leap") { e.special = 6 + this.rng() * 4; e.leapDur = 0; this.voice(e, "attack", 1, true) }
    if (a === "charge") this.voice(e, "roar", 2, true)
    if (a === "burst") { e.special = 99; this.voice(e, "scream", 0, true) }
  }

  private startMelee(e: Infected): void {
    const kind = e.kind
    const both = e.armsLost === 3
    let a: Action = kind === "brute" || kind === "boss" ? "slam" : both || e.legless || kind === "crawler" || kind === "stalker" && this.rng() < 0.5 || this.rng() < 0.25 ? "bite" : "claw"
    if (kind === "boss" && this.rng() < 0.45) a = "claw"
    e.side = e.armsLost & 2 ? -1 : e.armsLost & 1 ? 1 : this.rng() < 0.5 ? -1 : 1
    this.startAction(e, a, e.def.attackTime, WIND[kind] * (a === "claw" && kind === "boss" ? 0.8 : 1))
    e.shockSlam = false
    this.voice(e, "attack", 1.2)
  }

  private runAction(e: Infected, dt: number, pl: PlayerState, d: number, active: boolean): void {
    e.actionT += dt
    const t = e.actionT
    e.goalSpeed = 0
    switch (e.action) {
      case "claw": case "bite": case "slam":
        if (t < e.wind) { e.facePlayer = active; if (e.kind !== "brute" && e.kind !== "boss" && d > e.def.attackRange * 0.7) { e.goalX = pl.position.x; e.goalZ = pl.position.z; e.goalSpeed = e.def.runSpeed * 0.25 } }
        if (!e.struck && t >= e.wind) { e.struck = true; this.strike(e, pl, active) }
        break
      case "scream":
        e.facePlayer = active
        if (!e.struck && t >= e.wind) { e.struck = true; this.screamCall(e, pl) }
        break
      case "spit":
        e.facePlayer = active
        if (!e.struck && t >= e.wind) { e.struck = true; if (active) this.spit(e, pl, d) }
        break
      case "roar":
        if (!e.struck && t >= e.wind) { e.struck = true; this.voice(e, "roar", 1, true); if (e.kind === "boss" && e.bossPhase >= 3) this.summon(e, pl) }
        break
      case "burst":
        e.facePlayer = active
        if (!e.struck && t >= e.wind) { e.struck = true; this.burst(e, pl, active) }
        break
      case "leap": this.leap(e, dt, pl, active); break
      case "charge": this.charge(e, dt, pl, active); break
      default: break
    }
    if (e.action !== "none" && e.actionT >= e.actionDur) {
      e.action = "none"; e.arc = 0
      e.cooldown = 0.15 + this.rng() * 0.25
    }
  }

  private attackDamage(e: Infected, mult = 1): number {
    let dmg = e.def.damage * DIFFICULTY[this.opts.difficulty].enemyDamage * mult
    if (e.action === "claw" && e.armsLost) dmg *= 0.5
    if (e.action === "bite" && e.armsLost === 3) dmg *= 0.7
    return dmg
  }

  private bleed(e: Infected): "none" | "light" | "heavy" {
    if (this.rng() >= e.def.bleedChance) return "none"
    return e.kind === "brute" || e.kind === "boss" || this.rng() < 0.3 ? "heavy" : "light"
  }

  private strike(e: Infected, pl: PlayerState, active: boolean): void {
    const def = e.def
    const slam = e.action === "slam"
    if (slam) {
      const fx = e.position.x - Math.sin(e.yaw) * def.attackRange * 0.65, fz = e.position.z - Math.cos(e.yaw) * def.attackRange * 0.65
      this.fx.dust(fx, 0, fz, e.kind === "boss" ? 1.6 : 1, e.kind === "boss" ? 40 : 22)
      this.onImpact?.({ x: fx, y: 0, z: fz }, e.kind === "boss" ? 0.8 : 0.45)
      if (e.shockSlam) { e.ringR = 0; e.ringHit = false; this.fx.ring(e.position.x, e.position.z, 11, 0.75); this.fx.dust(e.position.x, 0, e.position.z, 3, 50) }
    }
    if (!active) return
    const dx = pl.position.x - e.position.x, dz = pl.position.z - e.position.z, d = Math.hypot(dx, dz)
    const reach = def.attackRange + 0.45 + (slam ? 0.5 : 0)
    if (d > reach || Math.abs(pl.position.y - e.position.y) > 1.8) return
    if (this.facing01(e, pl) < (slam ? 0.3 : 0.5) && d > 0.8) return
    if (!this.lineClear(e, pl)) return
    this.opts.events.attack?.({ source: e, damage: this.attackDamage(e), bleed: this.bleed(e), infection: e.def.infection * (e.action === "bite" ? 1.5 : 1), kind: slam ? "slam" : e.action === "bite" ? "bite" : "claw" })
  }

  private screamCall(e: Infected, pl: PlayerState): void {
    this.voice(e, "scream", 0, true)
    // everything within 40 m comes running
    for (const o of this.list) {
      if (o === e || !o.alive) continue
      const d = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z)
      if (d > 40) continue
      if (o.mode !== "chase") { o.mode = "chase"; o.feeding = false; o.path = null; o.alertDelay = 0.2 + this.rng() * 0.6 }
      o.lastKnownX = pl.position.x; o.lastKnownZ = pl.position.z; o.lastContact = Math.max(o.lastContact, this.time - 6)
    }
    const n = 3 + Math.floor(this.rng() * 4)
    this.spawnHorde({ x: pl.position.x, z: pl.position.z }, n, { x: pl.position.x, z: pl.position.z }, WALKERS)
  }

  private spit(e: Infected, pl: PlayerState, d: number): void {
    e.rig.head.updateWorldMatrix(true, false)
    const S = e.rig.spec
    const mouth = e.rig.head.localToWorld(_v.set(0, S.headR * 0.5, -S.headR * 1.1))
    const flight = 0.5 + d * 0.045
    _to.x = pl.position.x + this.pvx * flight * 0.6; _to.y = pl.position.y + 0.4; _to.z = pl.position.z + this.pvz * flight * 0.6
    this.fx.launch(mouth, _to, flight, e)
    this.fx.splash(mouth.x, mouth.y, mouth.z, 6, 0.5)
  }

  private leap(e: Infected, dt: number, pl: PlayerState, active: boolean): void {
    const t = e.actionT
    if (t < e.wind) { e.facePlayer = active; return }
    if (e.leapDur === 0) {
      const tx = pl.position.x + this.pvx * 0.25, tz = pl.position.z + this.pvz * 0.25
      const dx = tx - e.position.x, dz = tz - e.position.z, L = Math.min(8, Math.max(2, Math.hypot(dx, dz) - 0.6)), l = Math.hypot(dx, dz) || 1
      e.leapDur = 0.25 + L * 0.06; e.leapH = 0.35 + L * 0.06
      e.leapVX = dx / l * L / e.leapDur; e.leapVZ = dz / l * L / e.leapDur
      e.yaw = Math.atan2(-dx, -dz)
      e.actionDur = e.wind + e.leapDur + 0.6
    }
    const u = (t - e.wind) / e.leapDur
    if (u < 1) {
      e.arc = 4 * e.leapH * u * (1 - u)
      e.vx = e.leapVX; e.vz = e.leapVZ
      const before = e.position.x, beforeZ = e.position.z
      this.world.collision.moveCircle(e.position.x, e.position.z, e.leapVX * dt, e.leapVZ * dt, e.rig.spec.radius, _p)
      e.position.x = _p.x; e.position.z = _p.z
      e.speed = Math.hypot(_p.x - before, _p.z - beforeZ) / Math.max(dt, 1e-4)
      if (!e.struck && active && Math.hypot(pl.position.x - e.position.x, pl.position.z - e.position.z) < 1.4) this.leapHit(e, pl)
    } else {
      e.arc = 0; e.vx = 0; e.vz = 0
      if (!e.struck && active && Math.hypot(pl.position.x - e.position.x, pl.position.z - e.position.z) < 1.8) this.leapHit(e, pl)
      e.struck = true
    }
  }

  private leapHit(e: Infected, pl: PlayerState): void {
    e.struck = true
    if (!this.lineClear(e, pl)) return
    this.opts.events.attack?.({ source: e, damage: this.attackDamage(e, 1.2), bleed: this.bleed(e), infection: e.def.infection * 1.5, kind: "bite" })
  }

  // ------------------------------------------------------------------ boss

  private bossPhaseCheck(e: Infected): void {
    const f = e.health / e.maxHealth
    const want = f <= 0.33 ? 3 : f <= 0.66 ? 2 : 1
    if (want > e.bossPhase) {
      e.bossPhase = want
      this.startAction(e, "roar", 1.8, 0.7)
      // the phase-3 roar itself summons the first runners (runAction "roar")
      e.special = 1.5; e.special2 = 3; e.summonT = want >= 3 ? 22 : 1e9
      this.onImpact?.({ x: e.position.x, y: 0, z: e.position.z }, 0.3)
    }
  }

  private bossChase(e: Infected, pl: PlayerState, d: number, fresh: boolean, canMelee: boolean): void {
    if (e.bossPhase >= 3 && e.summonT <= 0 && fresh) { e.summonT = 22; this.startAction(e, "roar", 1.8, 0.8); return }
    if (e.bossPhase >= 3 && e.special2 <= 0 && fresh && d < 10 && this.facing01(e, pl) > 0.3) {
      e.special2 = 7 + this.rng() * 3
      this.startAction(e, "slam", 2.0, 0.9); e.shockSlam = true; this.voice(e, "roar", 1, true)
      return
    }
    if (e.bossPhase >= 2 && e.special <= 0 && fresh && d > 7 && d < 26 && this.facing01(e, pl) > 0.6 && this.world.nav.lineWalkable(e.position.x, e.position.z, pl.position.x, pl.position.z)) {
      e.special = 9 + this.rng() * 3
      this.startAction(e, "charge", 4, 0.9)
      return
    }
    if (canMelee && this.lineClear(e, pl)) { this.startMelee(e); return }
    if (fresh && d < e.def.attackRange * 0.7) e.goalSpeed = 0
  }

  private charge(e: Infected, dt: number, pl: PlayerState, active: boolean): void {
    const t = e.actionT
    if (t < e.wind) {
      e.facePlayer = active
      const dx = pl.position.x - e.position.x, dz = pl.position.z - e.position.z, l = Math.hypot(dx, dz) || 1
      e.chargeX = dx / l; e.chargeZ = dz / l
      return
    }
    const run = t - e.wind
    if (run > 2.4) { e.actionDur = e.actionT; e.vx = 0; e.vz = 0; return }
    const sp = 9.5, ix = e.chargeX * sp * dt, iz = e.chargeZ * sp * dt
    e.vx = e.chargeX * sp; e.vz = e.chargeZ * sp
    e.yaw = Math.atan2(-e.chargeX, -e.chargeZ)
    this.world.collision.moveCircle(e.position.x, e.position.z, ix, iz, e.rig.spec.radius, _p)
    const moved = Math.hypot(_p.x - e.position.x, _p.z - e.position.z)
    e.position.x = _p.x; e.position.z = _p.z; e.speed = moved / Math.max(dt, 1e-4)
    e.phase += dt * Math.PI * 2 * e.speed / cycleLength("run", e.rig.spec)
    if (active && !e.struck && Math.hypot(pl.position.x - e.position.x, pl.position.z - e.position.z) < e.rig.spec.radius + 1.0) {
      e.struck = true
      this.opts.events.attack?.({ source: e, damage: this.attackDamage(e, 1.25), bleed: "heavy", infection: e.def.infection, kind: "slam" })
      this.onImpact?.({ x: pl.position.x, y: 0, z: pl.position.z }, 1)
      e.actionDur = e.actionT + 0.35
    }
    if (e.actionT + dt >= e.actionDur) { e.vx *= 0.2; e.vz *= 0.2 }
    if (moved < sp * dt * 0.45 && run > 0.15) {
      // slammed into a wall: stunned, back exposed
      this.fx.dust(e.position.x - Math.sin(e.yaw) * 1.2, 0.5, e.position.z - Math.cos(e.yaw) * 1.2, 1.4, 34)
      this.onImpact?.({ x: e.position.x, y: 0, z: e.position.z }, 0.9)
      this.voice(e, "pain", 0, true)
      e.vx = 0; e.vz = 0
      this.startAction(e, "stunned", 2.2, 0)
    }
  }

  private updateShockwave(e: Infected, dt: number, pl: PlayerState, active: boolean): void {
    e.ringR += dt * 11 / 0.75
    if (e.ringR > 11) { e.ringR = -1; return }
    if (!active || e.ringHit) return
    const d = Math.hypot(pl.position.x - e.position.x, pl.position.z - e.position.z)
    if (Math.abs(d - e.ringR) > 0.9 || pl.position.y > e.position.y + 0.8) return
    e.ringHit = true
    _a.x = e.position.x; _a.y = 0.4; _a.z = e.position.z; _b.x = pl.position.x; _b.y = pl.position.y + 0.4; _b.z = pl.position.z
    if (this.world.collision.segmentBlocked3D(_a, _b)) return
    this.opts.events.attack?.({ source: e, damage: this.attackDamage(e, 0.6 * Math.max(0.3, 1 - d / 13)), bleed: "none", infection: 0, kind: "slam" })
    this.onImpact?.({ x: pl.position.x, y: 0, z: pl.position.z }, 0.7)
  }

  private summon(e: Infected, pl: PlayerState): void {
    const out = { x: 0, z: 0 }
    _eye.x = pl.position.x; _eye.y = pl.eyeY; _eye.z = pl.position.z
    const n = 3 + Math.floor(this.rng() * 3)
    if (findSpawnPoint(e.position.x, e.position.z, 30, _eye, this.facingKnown ? this.facing : null, this.world.nav, this.world.collision, this.rng, out, 20, 12)) this.spawnHorde(out, n, { x: pl.position.x, z: pl.position.z }, ["runner"])
    else {
      const p = this.world.nav.randomPointNear(e.position.x, e.position.z, 20, this.rng)
      if (p) this.spawnHorde(p, n, { x: pl.position.x, z: pl.position.z }, ["runner"])
    }
  }

  /** The boss, if one is alive (HUD health bar). */
  boss(): Infected | null { for (const e of this.list) if (e.alive && e.kind === "boss") return e; return null }

  // ------------------------------------------------------------------ movement

  private locomote(e: Infected, dt: number, pl: PlayerState, d: number, active: boolean): void {
    const S = e.rig.spec, def = e.def
    let dvx = 0, dvz = 0
    if (e.action !== "leap" && e.action !== "charge") {
      if (e.goalSpeed > 0.01) {
        const gx = e.goalX - e.position.x, gz = e.goalZ - e.position.z, gd = Math.hypot(gx, gz)
        if (gd > 0.25 && this.steer(e, dt, gd, _dir)) { dvx = _dir.x * e.goalSpeed; dvz = _dir.z * e.goalSpeed }
      }
      if (e.slot >= 0) {
        separation(e.slot, this.xs, this.zs, this.rs, this.nSlots, _sep)
        const k = 1.4 + e.goalSpeed * 0.4
        dvx += _sep.x * k; dvz += _sep.z * k
      }
      const accel = e.kind === "runner" || e.kind === "stalker" ? 10 : e.kind === "boss" ? 3 : 5
      const a = Math.min(1, accel * dt)
      e.vx += (dvx - e.vx) * a; e.vz += (dvz - e.vz) * a
      // never stand inside the player
      if (active) {
        const ax = e.position.x - pl.position.x, az = e.position.z - pl.position.z, ad = Math.hypot(ax, az), min = S.radius * e.scale + 0.42
        if (ad < min && ad > 1e-4) { e.vx += ax / ad * (min - ad) * 8; e.vz += az / ad * (min - ad) * 8 }
      }
      const bx = e.position.x, bz = e.position.z
      this.world.collision.moveCircle(bx, bz, e.vx * dt, e.vz * dt, S.radius * e.scale, _p)
      e.position.x = _p.x; e.position.z = _p.z
      const actual = Math.hypot(_p.x - bx, _p.z - bz) / Math.max(dt, 1e-4)
      e.speed += (actual - e.speed) * Math.min(1, dt * 8)
      if (e.goalSpeed > 0.3 && actual < e.goalSpeed * 0.25) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt)
      if (e.stuckT > 1.2) { e.path = null; e.repathT = 0; e.direct = false; e.directT = 1.5; e.stuckT = 0.6 }
    }
    e.move = e.speed / def.runSpeed
    // facing
    let ty = e.yaw
    if (e.facePlayer) ty = Math.atan2(-(pl.position.x - e.position.x), -(pl.position.z - e.position.z))
    else if (e.vx * e.vx + e.vz * e.vz > 0.04) ty = Math.atan2(-e.vx, -e.vz)
    let dy = ty - e.yaw
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    const rate = TURN[e.kind] * (e.action !== "none" && e.actionT < e.wind ? 0.55 : 1) * (e.legless && e.kind !== "crawler" ? 0.6 : 1)
    e.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy))
    e.group.rotation.y = e.yaw
    // gait phase + footsteps
    if (e.action !== "charge") {
      const before = e.phase
      e.phase += dt * Math.PI * 2 * (e.speed > 0.05 ? e.speed / cycleLength(e.gait, S) / e.scale : 0)
      if (Math.floor(before / Math.PI) !== Math.floor(e.phase / Math.PI) && d < (e.kind === "boss" || e.kind === "brute" ? 45 : 18) && e.speed > 0.6 && this.stepBudget >= 1) {
        this.stepBudget--
        this.opts.events.footstep?.(e)
      }
    }
  }

  /** Writes a unit steering direction toward (goalX, goalZ): flow field, straight line or A* path. */
  private steer(e: Infected, dt: number, gd: number, out: Vec2): boolean {
    const x = e.position.x, z = e.position.z, gx = e.goalX, gz = e.goalZ
    if (e.useFlow && this.flow.steer(x, z, out)) return true
    if (gd < 2.2) { out.x = (gx - x) / gd; out.z = (gz - z) / gd; return true }
    e.directT -= dt
    if (e.directT <= 0) { e.direct = gd < 35 && this.world.nav.lineWalkable(x, z, gx, gz); e.directT = 0.4 + (e.id % 5) * 0.05 }
    if (e.direct) { out.x = (gx - x) / gd; out.z = (gz - z) / gd; return true }
    e.repathT -= dt
    const goalMoved = Math.hypot(gx - e.pathGoalX, gz - e.pathGoalZ) > 2
    if ((!e.path || e.repathT <= 0 || goalMoved) && this.pathBudget > 0) {
      this.pathBudget--
      e.path = this.world.nav.findPath(x, z, gx, gz, 2500); e.pathIdx = 0
      e.pathGoalX = gx; e.pathGoalZ = gz; e.repathT = 0.9 + (e.id % 7) * 0.05
    }
    const path = e.path
    if (path && e.pathIdx < path.length) {
      let wp = path[e.pathIdx]
      while (e.pathIdx < path.length - 1 && Math.hypot(wp.x - x, wp.z - z) < 0.7) wp = path[++e.pathIdx]
      const dx = wp.x - x, dz = wp.z - z, l = Math.hypot(dx, dz)
      if (l > 1e-4) { out.x = dx / l; out.z = dz / l; return true }
    }
    out.x = (gx - x) / gd; out.z = (gz - z) / gd
    return true
  }

  // ------------------------------------------------------------------ visuals

  private updateVisual(e: Infected, dt: number, dv: number): void {
    const hide = dv > this.fogFar + 4
    e.group.visible = !hide
    if (hide) return
    const r = e.rig
    const lod = dv > LOD_DIST && e.action === "none" && !e.clip && e.gore.severed.size === 0 && e.stagger <= 0 && e.kind !== "boss" && e.kind !== "crawler"
    const snap = !lod && e.lodOn
    if (lod !== e.lodOn) {
      if (lod && !r.lod) {
        // bake the variant's walk pose once at scale 1 (shared by every instance of this variant)
        const sc = r.body.scale.x
        r.body.scale.setScalar(1)
        this.canonicalPose(e)
        const geo = this.assets.lod(e.kind, e.variant, r)
        r.body.scale.setScalar(sc)
        applyPose(r, e.pose)
        r.lod = new THREE.Mesh(geo, this.assets.material); r.lod.name = "lod"; r.lod.castShadow = false
        e.group.add(r.lod)
      }
      if (r.lod) { r.lod.visible = lod; r.lod.scale.setScalar(e.scale) }
      r.body.visible = !lod
      e.lodOn = lod
    }
    if (lod) { if (r.lod) r.lod.position.y = 0.02 * Math.abs(Math.sin(e.phase)); return }
    if (e.clip) { sampleClip(e.target, e.clip, e.clipT, e.from); e.poseRate = 30 }
    else computePose(e.target, e, r.spec)
    if (e.arc) e.target[P.bodyLift] += e.arc
    // leaving the LOD: the rig pose is stale, jump straight to the current one
    const k = snap ? 1 : 1 - Math.exp(-(e.stun > 0 && e.legless ? 6 : e.poseRate) * dt)
    if (e.poseRate < 14) e.poseRate = Math.min(14, e.poseRate + dt * 6)
    for (let i = 0; i < POSE_N; i++) e.pose[i] += (e.target[i] - e.pose[i]) * k
    applyPose(r, e.pose)
    // a bloater about to burst swells up and quivers
    if (e.kind === "bloater") {
      const k2 = e.action === "burst" ? Math.min(1, e.actionT / e.wind) : 0, q = k2 * 0.03 * Math.sin(e.actionT * 41)
      r.body.scale.set(e.scale * (1 + 0.16 * k2 + q), e.scale * (1 + 0.07 * k2), e.scale * (1 + 0.16 * k2 - q))
    }
    const sh = dv < SHADOW_DIST
    if (sh !== e.shadowOn) { for (const m of r.meshes) m.castShadow = sh; e.shadowOn = sh }
  }

  /** Poses the rig in a mid-stride walk (for the LOD bake); the caller re-applies the real pose afterwards. */
  private canonicalPose(e: Infected): void {
    const keep = { phase: e.phase, speed: e.speed, move: e.move, alert: e.alert, action: e.action, stagger: e.stagger, feeding: e.feeding }
    e.phase = 0.9; e.speed = 1; e.move = 0.35; e.alert = 0.3; e.action = "none"; e.stagger = 0; e.feeding = false
    computePose(_pose, e, e.rig.spec)
    Object.assign(e, keep)
    applyPose(e.rig, _pose)
  }

  private updateCorpse(e: Infected, dt: number, dv: number): void {
    e.deathT += dt
    if (e.gibbed) return
    const r = e.rig
    const hide = dv > this.fogFar + 4
    e.group.visible = !hide
    if (e.baked) return
    if (e.lodOn) { e.lodOn = false; if (r.lod) r.lod.visible = false; r.body.visible = true }
    const dur = e.clip ? e.clip.dur : 0.9
    if (!hide || !e.pooled) {
      if (e.clip) { e.clipT += dt; sampleClip(e.target, e.clip, e.clipT, e.from) }
      else crawlDeathPose(e.target, e, r.spec)
      const k = 1 - Math.exp(-(e.clip ? 30 : 6) * dt)
      for (let i = 0; i < POSE_N; i++) e.pose[i] += (e.target[i] - e.pose[i]) * k
      applyPose(r, e.pose)
    }
    if (!e.pooled && e.deathT > dur) {
      e.pooled = true
      const c = e.chestPosition(_v)
      this.gore.pool({ x: c.x, y: 0.02, z: c.z }, e.kind === "boss" ? 2.6 : e.kind === "brute" ? 1.6 : 1, { color: e.gore.bloodColor })
    }
    if (e.deathT > dur + 0.6 && this.bakeBudget > 0) {
      this.bakeBudget--
      // one static merged mesh per corpse instead of 11
      r.body.visible = true
      const geo = bakeRig(r)
      r.corpse = new THREE.Mesh(geo, this.assets.material); r.corpse.name = "corpse"; r.corpse.castShadow = false; r.corpse.receiveShadow = false
      e.group.add(r.corpse)
      r.body.visible = false
      if (r.lod) r.lod.visible = false
      e.baked = true
    }
  }

  private trimCorpses(excess: number, vx: number, vz: number): void {
    for (let pass = 0; pass < 2 && excess > 0; pass++) {
      for (let i = 0; i < this.list.length && excess > 0; i++) {
        const e = this.list[i]
        if (e.alive || (!e.baked && !e.gibbed)) continue
        if (pass === 0 && Math.hypot(e.position.x - vx, e.position.z - vz) < 25) continue
        this.remove(i); i--; excess--
      }
    }
  }

  private remove(i: number): void {
    const e = this.list[i]
    this.parent.remove(e.group)
    e.rig.corpse?.geometry.dispose()
    this.list.splice(i, 1)
  }

  // ------------------------------------------------------------------ voice

  /** Throttled vocal cue: per infected `gap` seconds and a global budget (~4/s); forced cues only need 0.25 s. */
  private voice(e: Infected, s: HostileSound, gap: number, force = false): void {
    const T = this.time
    if (force ? T - e.voiceLast < 0.25 : T < e.voiceNext || this.voiceBudget < 1) return
    e.voiceLast = T; e.voiceNext = T + gap; this.voiceBudget = Math.max(0, this.voiceBudget - 1)
    this.opts.events.sound?.(e, s)
  }

  // ================================================================== damage

  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): HostileHit | null {
    let best: Infected | null = null, bestT = maxDist, bestPart: BodyPartId = "torso"
    for (const e of this.list) {
      if (!e.alive) continue
      const S = e.rig.spec, sc = e.scale
      const cy = e.position.y + S.height * 0.5 * sc, R = S.height * 1.1 * sc + 0.6
      if (raySphere(origin, dir, e.position.x, cy, e.position.z, R, bestT) < 0) continue
      this.syncMatrices(e)
      for (const c of e.rig.capsules) {
        if (e.gore.severed.has(c.part)) continue
        const m = c.frame.matrixWorld.elements
        const ax = m[0] * c.ax + m[4] * c.ay + m[8] * c.az + m[12], ay = m[1] * c.ax + m[5] * c.ay + m[9] * c.az + m[13], az = m[2] * c.ax + m[6] * c.ay + m[10] * c.az + m[14]
        const bx = m[0] * c.bx + m[4] * c.by + m[8] * c.bz + m[12], by = m[1] * c.bx + m[5] * c.by + m[9] * c.bz + m[13], bz = m[2] * c.bx + m[6] * c.by + m[10] * c.bz + m[14]
        const t = rayCapsule(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, ax, ay, az, bx, by, bz, c.r * sc)
        if (t >= 0 && t < bestT) { bestT = t; best = e; bestPart = c.part }
      }
    }
    if (!best) return null
    return { target: best, distance: bestT, part: hitPartOf(bestPart), bodyPart: bestPart, point: origin.clone().addScaledVector(dir, bestT) }
  }

  private syncMatrices(e: Infected): void {
    if (e.matFrame === this.frame) return
    e.matFrame = this.frame
    e.group.updateMatrixWorld(true)
  }

  private isWeakSpot(e: Infected, point: Vec3): boolean {
    const S = e.rig.spec
    e.rig.torso.updateWorldMatrix(true, false)
    const c = e.rig.torso.localToWorld(_v.set(0, S.torsoLen * WEAK_SPOT.y, S.chestD * 0.5 + 0.05))
    return Math.hypot(point.x - c.x, point.y - c.y, point.z - c.z) < WEAK_SPOT.radius * e.scale + 0.1
  }

  applyDamage(hit: HostileHit, dmg: DamageInfo): DamageResult {
    const e = hit.target as Infected
    if (!(e instanceof Infected) || e.manager !== this || !e.alive) return { killed: false, dealt: 0, severed: null, headshotKill: false }
    const def = e.def
    let part: BodyPartId = hit.bodyPart
    if (e.gore.severed.has(part)) part = "torso"
    let amount = dmg.amount, armor = 0
    if (part === "head") { amount *= HEAD_BONUS[e.kind]; armor = HEAD_ARMOR[e.kind] }
    else if (part === "torso") {
      armor = def.armor
      if (e.kind === "boss" && this.isWeakSpot(e, hit.point)) { armor = 0; amount *= 2 }
    } else armor = e.kind === "brute" || e.kind === "boss" ? def.armor * 0.5 : 0
    const dealt = amount * (1 - armor * (1 - Math.max(0, Math.min(1, dmg.penetration))))
    e.health -= dealt
    const pi = PART_INDEX[part]
    e.limbDmg[pi] += dealt
    if (dmg.kind === "pellet") { if (e.blastFrame !== this.frame) { e.blastFrame = this.frame; e.blastDamage = 0 } e.blastDamage += dealt }
    const color = e.gore.bloodColor
    this.gore.wound(hit.point, dmg.dir, dealt, { color, heavy: dealt > 45 })
    const brutal = this.gore.level === "brutal"
    const outcome = goreOutcome(GORE_RULES, {
      part, dealt, limbTotal: e.limbDmg[pi], maxHealth: e.maxHealth, healthAfter: e.health, kind: dmg.kind, sever: dmg.sever, roll: this.rng(), brutal,
      blastDamage: e.blastFrame === this.frame ? e.blastDamage : 0, distance: Math.hypot(dmg.from.x - e.position.x, dmg.from.z - e.position.z), boss: e.kind === "boss",
    })
    let severed: BodyPartId | null = null
    if (outcome === "burst") {
      e.health = Math.min(e.health, 0)
      if (brutal) { e.rig.head.updateWorldMatrix(true, true); e.gore.severed.add("head") }
      this.gore.headshot(e.rig.head, dmg.dir, { color, heavy: true })
      if (brutal) { e.rig.head.visible = false; severed = "head" }
    } else if (outcome === "decap") {
      e.health = Math.min(e.health, 0)
      if (this.sever(e, "head", dmg.dir, 3)) severed = "head"
    } else if (outcome === "sever") {
      if (this.sever(e, part, dmg.dir, 2 + dealt * 0.04)) severed = part
    }
    const killed = e.health <= 0
    if (killed) {
      if (outcome === "gib") this.gibBody(e, dmg.from, 6 + e.blastDamage * 0.05)
      this.kill(e, dmg.kind, hitPartOf(part), dmg.dir.x, dmg.dir.z)
    } else this.react(e, dmg, dealt)
    return { killed, dealt, severed, headshotKill: killed && part === "head" }
  }

  private react(e: Infected, dmg: DamageInfo, dealt: number): void {
    // they know where it came from
    if (e.mode !== "chase" || this.time - e.lastContact > 1.5) {
      e.lastKnownX = dmg.from.x; e.lastKnownZ = dmg.from.z
      if (e.mode !== "chase") { e.lastContact = this.time - 4; this.alert(e, Math.hypot(dmg.from.x - e.position.x, dmg.from.z - e.position.z)); e.alertDelay = 0.1 }
    }
    this.voice(e, "pain", 1.4)
    const thr = STAGGER[e.kind] * e.maxHealth
    const blast = dmg.kind === "pellet" ? e.blastDamage : dealt
    if (blast < thr && dealt < thr) return
    this.localDir(e, dmg.dir.x, dmg.dir.z)
    const near = Math.hypot(dmg.from.x - e.position.x, dmg.from.z - e.position.z) < 6
    if (dmg.kind === "pellet" && near && blast >= e.maxHealth * 0.45 && e.kind !== "brute" && e.kind !== "boss" && !e.legless && e.gait !== "quad") this.knockdown(e, dmg.dir.x, dmg.dir.z)
    else {
      e.stagger = 1; e.stun = Math.max(e.stun, e.kind === "brute" ? 0.3 : 0.4)
      // a hard hit interrupts a telegraphed attack
      if (e.action !== "none" && e.action !== "leap" && e.action !== "charge" && e.actionT < e.wind) e.action = "none"
      const push = e.kind === "brute" ? 0.6 : 1.6
      e.vx += dmg.dir.x * push; e.vz += dmg.dir.z * push
    }
  }

  private localDir(e: Infected, dx: number, dz: number): void {
    const l = Math.hypot(dx, dz) || 1, c = Math.cos(e.yaw), s = Math.sin(e.yaw)
    e.hitX = (dx * c - dz * s) / l
    e.hitZ = (dx * s + dz * c) / l
  }

  private knockdown(e: Infected, dx: number, dz: number): void {
    this.localDir(e, dx, dz)
    e.from.set(e.pose)
    e.clip = e.hitZ >= 0 ? CLIPS.knockBack : CLIPS.knockFwd
    e.clipT = 0; e.action = "none"; e.stagger = 0; e.arc = 0
    e.vx = dx * 2.5; e.vz = dz * 2.5
  }

  private sever(e: Infected, part: BodyPartId, dir: Vec3, force: number): boolean {
    if (this.gore.level !== "brutal" || part === "torso" || e.gore.severed.has(part)) return false
    const obj = e.gore.parts[part]
    if (!obj) return false
    if (e.lodOn) { e.lodOn = false; e.rig.body.visible = true; if (e.rig.lod) e.rig.lod.visible = false }
    obj.updateWorldMatrix(true, true)
    e.gore.severed.add(part)
    this.gore.sever(obj, { x: dir.x * force + (this.rng() - 0.5), y: 1.2 + this.rng() * 1.5, z: dir.z * force + (this.rng() - 0.5) }, { color: e.gore.bloodColor })
    obj.visible = false
    if (part === "armL") e.armsLost |= 1
    else if (part === "armR") e.armsLost |= 2
    else if (part === "legL" || part === "legR") {
      e.legsLost |= part === "legL" ? 1 : 2
      e.action = "none"; e.arc = 0
      if (e.legsLost === 3) { e.legless = true; e.gait = "drag"; e.stun = 1.1; e.clip = null; this.voice(e, "pain", 0, true) }
      else if (e.gait !== "quad") { e.gait = "hobble"; e.stun = 0.6 }
    }
    return true
  }

  private gibBody(e: Infected, from: Vec3, force: number): void {
    if (this.gore.level === "brutal") {
      e.gibbed = true
      e.group.updateMatrixWorld(true)
      const c = e.chestPosition(_v)
      this.gore.gib(e.group, { x: c.x, y: c.y, z: c.z }, force, { color: e.gore.bloodColor, heavy: true })
      e.group.visible = false
      e.pooled = true
      this.gore.pool({ x: e.position.x, y: 0.02, z: e.position.z }, 1.3, { color: e.gore.bloodColor })
    } else this.gore.gib(e.group, from, force, { color: e.gore.bloodColor, heavy: true })
  }

  /** A bloater bursts (on its own next to the player or when killed): splash, gibs and a lingering gas cloud. */
  private burst(e: Infected, pl: PlayerState, active: boolean): void {
    if (active) {
      const d = Math.hypot(pl.position.x - e.position.x, pl.position.z - e.position.z)
      if (d < 3.2 && this.lineClear(e, pl)) this.opts.events.attack?.({ source: e, damage: 18 * DIFFICULTY[this.opts.difficulty].enemyDamage * (1 - d / 4.5), bleed: "none", infection: 14, kind: "acid" })
    }
    e.health = 0
    this.kill(e, "explosion", "body", 0, 0)
  }

  private kill(e: Infected, cause: DamageInfo["kind"], part: HitPart, dx: number, dz: number): void {
    if (e.kind === "bloater" && !e.gibbed) {
      this.gibBody(e, e.position, 3.5)
      e.group.updateMatrixWorld(true)
      const c = e.chestPosition(_v)
      this.opts.events.gas?.({ x: c.x, y: 0.1, z: c.z }, 4.6)
      this.fx.dust(c.x, 0.4, c.z, 1.4, 26)
    }
    e.alive = false; e.state = "dead"; e.health = Math.min(0, e.health)
    e.action = "none"; e.stagger = 0; e.stun = 0; e.arc = 0; e.vx = 0; e.vz = 0; e.deathT = 0; e.ringR = -1
    e.from.set(e.pose); e.clipT = 0; e.clip = null
    if (!e.gibbed) {
      if (e.legless || e.gait === "drag") e.crawlDeath = true
      else {
        let name: ClipName
        if (cause === "explosion") {
          // face the blast and get thrown away from it
          const l = Math.hypot(dx, dz) || 1
          e.yaw = Math.atan2(dx / l, dz / l); e.group.rotation.y = e.yaw
          name = "deathBlast"
        } else {
          this.localDir(e, dx, dz)
          if (Math.abs(e.hitX) > 0.75) name = e.hitX > 0 ? "deathSideR" : "deathSideL"
          else if (e.hitZ > 0) name = part === "head" || this.rng() < 0.55 ? "deathBack" : "deathKnees"
          else name = "deathFwd"
          if (e.gait === "quad" && name === "deathKnees") name = "deathFwd"
        }
        e.clip = CLIPS[name]
      }
    }
    this.opts.events.died(e, cause, part)
    this.voice(e, "death", 0, true)
  }

  applyExplosion(center: Vec3, radius: number, maxDamage: number): Hostile[] {
    const killed: Hostile[] = []
    const brutal = this.gore.level === "brutal"
    _a.x = center.x; _a.y = center.y + 0.3; _a.z = center.z
    for (const e of this.list) {
      if (!e.alive) continue
      const cy = e.position.y + e.chestY()
      const d = Math.hypot(e.position.x - center.x, e.position.z - center.z, (cy - center.y) * 0.5)
      if (d > radius) continue
      _b.x = e.position.x; _b.y = cy; _b.z = e.position.z
      if (this.world.collision.segmentBlocked3D(_a, _b)) continue
      const dealt = maxDamage * (1 - d / radius) * (1 - e.def.armor * 0.5)
      e.health -= dealt
      const dx = e.position.x - center.x, dz = e.position.z - center.z, hl = Math.hypot(dx, dz) || 1
      _dirV.x = dx / hl * 0.8; _dirV.y = 0.6; _dirV.z = dz / hl * 0.8
      this.gore.wound(_b, _dirV, dealt, { color: e.gore.bloodColor, heavy: true })
      if (brutal && e.kind !== "boss" && dealt >= e.maxHealth * 0.3) {
        // the blast tears off limbs facing it (legs first when the charge was on the ground)
        const order: BodyPartId[] = center.y < 0.8 ? ["legL", "legR", "armL", "armR"] : ["armL", "armR", "legL", "legR"]
        const n = dealt >= e.maxHealth * 0.6 ? 2 : 1
        let done = 0
        for (let k = 0; k < 4 && done < n; k++) { const p = order[(k + Math.floor(this.rng() * 2)) % 4]; if (this.rng() < 0.6 && this.sever(e, p, _dirV, 5)) done++ }
      }
      if (e.health <= 0) {
        if (brutal && d < GORE_RULES.gibRadius && e.kind !== "boss") this.gibBody(e, center, maxDamage * 0.08)
        this.kill(e, "explosion", "body", dx / hl, dz / hl)
        killed.push(e)
      } else {
        if (e.mode !== "chase") { e.lastKnownX = center.x; e.lastKnownZ = center.z; e.mode = "investigate"; e.modeT = 0; e.feeding = false; e.path = null }
        if (dealt >= e.maxHealth * 0.2 && e.kind !== "brute" && e.kind !== "boss" && !e.legless && e.gait !== "quad") this.knockdown(e, dx / hl, dz / hl)
        else if (e.kind !== "boss") { this.localDir(e, dx, dz); e.stagger = 1; e.stun = Math.max(e.stun, 0.5) }
        this.voice(e, "pain", 1)
      }
    }
    return killed
  }

  meleeTest(origin: THREE.Vector3, dir: THREE.Vector3, range: number, arcDeg: number, maxTargets: number): HostileHit[] {
    const out: HostileHit[] = []
    const cosA = Math.cos(arcDeg / 2 * Math.PI / 180), hl = Math.hypot(dir.x, dir.z) || 1
    for (const e of this.list) {
      if (!e.alive) continue
      const S = e.rig.spec
      this.syncMatrices(e)
      // nearest body part to the swing line (crawlers on the floor, heads, limbs)
      let bestD = Infinity, bestPart: BodyPartId = "torso", bx = 0, by = 0, bz = 0
      for (const c of e.rig.capsules) {
        if (e.gore.severed.has(c.part)) continue
        const m = c.frame.matrixWorld.elements
        const ax = m[0] * c.ax + m[4] * c.ay + m[8] * c.az + m[12], ay = m[1] * c.ax + m[5] * c.ay + m[9] * c.az + m[13], az = m[2] * c.ax + m[6] * c.ay + m[10] * c.az + m[14]
        const qx = m[0] * c.bx + m[4] * c.by + m[8] * c.bz + m[12], qy = m[1] * c.bx + m[5] * c.by + m[9] * c.bz + m[13], qz = m[2] * c.bx + m[6] * c.by + m[10] * c.bz + m[14]
        const d2 = raySegmentDist2(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range + 0.6, ax, ay, az, qx, qy, qz, _seg)
        const dd = Math.sqrt(d2) - c.r * e.scale
        if (dd < bestD) { bestD = dd; bestPart = c.part; const u = _seg[1]; bx = ax + (qx - ax) * u; by = ay + (qy - ay) * u; bz = az + (qz - az) * u }
      }
      const dx = bx - origin.x, dz = bz - origin.z, d = Math.hypot(dx, dz)
      if (d > range + S.radius * e.scale) continue
      if (d > S.radius + 0.3 && (dx * dir.x + dz * dir.z) / (d * hl) < cosA) continue
      _b.x = bx; _b.y = by; _b.z = bz
      if (this.world.collision.segmentBlocked3D(origin, _b)) continue
      out.push({ target: e, distance: d, part: hitPartOf(bestPart), bodyPart: bestPart, point: new THREE.Vector3(bx, by, bz) })
    }
    out.sort((a, b) => a.distance - b.distance)
    if (out.length > maxTargets) out.length = maxTargets
    return out
  }

  inRadius(center: Vec3, radius: number): Hostile[] {
    const out: Hostile[] = []
    for (const e of this.list) if (e.alive && Math.hypot(e.position.x - center.x, e.position.z - center.z, (e.position.y - center.y) * 0.5) <= radius) out.push(e)
    return out
  }

  stun(center: Vec3, radius: number, seconds: number): number {
    let n = 0
    for (const e of this.list) {
      if (!e.alive || e.kind === "boss") continue
      const d = Math.hypot(e.position.x - center.x, e.position.z - center.z)
      if (d > radius) continue
      _a.x = e.position.x; _a.y = e.position.y + e.eyeY(); _a.z = e.position.z
      if (this.world.collision.segmentBlocked3D(center, _a)) continue
      // brutes shrug it off faster; a telegraphed attack is cancelled
      const k = (1 - d / radius) * (e.kind === "brute" ? 0.4 : 1)
      e.stun = Math.max(e.stun, seconds * (0.4 + 0.6 * k)); e.stagger = 1
      if (e.action !== "none" && e.action !== "charge" && e.action !== "leap") e.action = "none"
      this.localDir(e, e.position.x - center.x, e.position.z - center.z)
      n++
    }
    return n
  }

  aliveCount(): number { let n = 0; for (const e of this.list) if (e.alive) n++; return n }
  combatCount(): number {
    let n = 0
    for (const e of this.list) if (e.alive && e.mode === "chase" && this.time - e.lastContact < 8) n++
    return n
  }

  stats(): InfectedStats {
    const s: InfectedStats = { alive: 0, corpses: 0, lod: 0, hidden: 0, meshes: 0, blobs: this.fx.activeBlobs(), puddles: this.fx.activePuddles(), chasing: 0 }
    for (const e of this.list) {
      if (e.alive) s.alive++; else s.corpses++
      if (!e.group.visible) { s.hidden++; continue }
      if (e.alive && e.mode === "chase") s.chasing++
      if (e.lodOn || e.baked) { s.lod += e.lodOn ? 1 : 0; s.meshes++; continue }
      for (const m of e.rig.meshes) { let v = true; for (let o: THREE.Object3D | null = m; o && o !== e.group; o = o.parent) if (!o.visible) { v = false; break } if (v) s.meshes++ }
    }
    return s
  }

  /** Test bench hook: forces an action, a knockdown or a death on one infected. */
  debugAction(e: Infected, what: Action | "knockdown" | "die" | "dieBlast" | ClipName): void {
    if (what === "knockdown") { this.knockdown(e, Math.sin(e.yaw), Math.cos(e.yaw)); return }
    if (what === "die" || what === "dieBlast") { this.kill(e, what === "dieBlast" ? "explosion" : "bullet", "body", Math.sin(e.yaw), Math.cos(e.yaw)); return }
    if (what in CLIPS) { this.kill(e, "bullet", "body", 0, 0); e.clip = CLIPS[what as ClipName]; e.crawlDeath = false; return }
    const a = what as Action
    if (a === "none") { e.action = "none"; return }
    const dur = a === "scream" ? 2.3 : a === "spit" ? 1.35 : a === "leap" ? 1.6 : a === "roar" ? 1.8 : a === "charge" ? 4 : a === "stunned" ? 2.2 : e.def.attackTime
    const wind = a === "scream" ? 0.55 : a === "spit" ? 0.65 : a === "leap" ? 0.38 : a === "roar" ? 0.7 : a === "charge" ? 0.9 : WIND[e.kind]
    this.startAction(e, a, dur, wind)
  }

  dispose(): void {
    for (const e of this.list) { this.parent.remove(e.group); e.rig.corpse?.geometry.dispose() }
    this.list.length = 0
    this.fx.dispose()
    this.assets.dispose()
  }
}

function hitPartOf(p: BodyPartId): HitPart { return p === "head" ? "head" : p === "torso" ? "body" : "limb" }

/** Ray vs. sphere entry distance (or -1); dir normalised. */
function raySphere(o: Vec3, d: Vec3, cx: number, cy: number, cz: number, r: number, maxT: number): number {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r
  if (c <= 0) return 0
  const h = b * b - c
  if (h < 0) return -1
  const t = -b - Math.sqrt(h)
  return t < 0 || t > maxT ? -1 : t
}

const _a: Vec3 = { x: 0, y: 0, z: 0 }, _b: Vec3 = { x: 0, y: 0, z: 0 }, _eye: Vec3 = { x: 0, y: 0, z: 0 }, _to: Vec3 = { x: 0, y: 0, z: 0 }, _dirV: Vec3 = { x: 0, y: 0, z: 0 }
const _p: Vec2 = { x: 0, z: 0 }, _dir: Vec2 = { x: 0, z: 0 }, _sep: Vec2 = { x: 0, z: 0 }
const _v = new THREE.Vector3()
const _seg = new Float32Array(2)
const _pose = new Float32Array(POSE_N)
const _target = { x: 0, y: 0, z: 0, eyeY: 1.62, active: false }
