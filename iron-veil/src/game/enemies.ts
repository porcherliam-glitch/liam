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
 * Behaviour: patrol/idle → suspicious (awareness meter) → investigate → combat → search → patrol. Riflemen fight from
 * cover and peek, scouts flank (one flanker at a time when > 2 fight), heavies push to close range, marksmen hold
 * 30–55 m and telegraph each shot with a red laser. A merc who loses a leg collapses and dies; one who loses an arm
 * drops his weapon and flees screaming until he bleeds out. All spatial queries go through world.collision (grid
 * index) and the cover-point grid; nothing iterates all obstacles per frame. Pure formulas: ai.ts, model: soldier.ts.
 * Optional extras: Merc.yaw/model/brain/awareness/asleep, EnemyManager.lastUpdateMs/awakeCount.
 */
import * as THREE from "three"
import { DIFFICULTY, ENEMIES } from "./data"
import type { GoreSystem } from "./gore"
import type { BodyPartId, DamageInfo, DamageResult, GoreBody, HitPart, Hostile, HostileEvents, HostileHit, HostileManager, HostileOptions, PlayerState } from "./hostiles"
import type { EnemyKind, Vec2, Vec3 } from "./types"
import type { World } from "./world"
import { GORE_RULES } from "./zombies"
import {
  approachAngle, clamp, coverFacesThreat, createRng, detectionRate, flankPoint, hitChance, inFieldOfView, isPeripheral,
  randInt, randRange, rankCover, visionRange, wrapAngle, yawTo, type DetectionInput, type Rng, type VisionInput,
} from "./ai"
import { acquireSoldierAssets, makeDrive, releaseSoldierAssets, SoldierModel, type SoldierAssets } from "./soldier"

export type { PlayerState } from "./hostiles"

export type EnemyState = "idle" | "patrol" | "suspicious" | "investigate" | "combat" | "search" | "flee" | "dead"
/** Combat sub-behaviour. */
export type CombatMode = "engage" | "toCover" | "cover" | "peek" | "flank" | "skirmish" | "push" | "hold" | "retreat" | "reposition" | "pursue"
type Limb = "armL" | "armR" | "legL" | "legR"

/** Mercenary blood. */
export const MERC_BLOOD = 0x7a0a08
/** Beyond this distance from the player a merc sleeps (hidden, no animation); it wakes again inside WAKE_DIST. */
export const SLEEP_DIST = 135
export const WAKE_DIST = 125

/** Per-merc AI working state (internal; public for the dev bench and tests). */
export class EnemyBrain {
  // perception
  percTimer = 0
  sees = false
  partial = false
  peripheral = false
  playerDist = Infinity
  range = 0
  lastSeen = -999
  lastStimulus = -999
  /** Last known player position and when it was learned. */
  known: Vec2 = { x: 0, z: 0 }
  knownT = -999
  /** Awareness never decays below this (raised after a search). */
  floor = 0
  urgent = false
  // movement
  hasGoal = false
  goal: Vec2 = { x: 0, z: 0 }
  speed = 0
  stopAt = 0.4
  dynamic = false
  path: Vec2[] | null = null
  pathIdx = 0
  needPath = false
  repathT = 0
  arrived = true
  unreachable = false
  vx = 0; vz = 0
  progT = 0; progX = 0; progZ = 0; stuck = 0
  turnRate = 0
  // pose intent
  face: Vec2 | null = null
  crouch = false
  aim = 0
  aimYaw = 0; aimPitch = 0
  look = 0; lookTarget = 0; lookT = 0
  // patrol / investigate / search / flee
  route: Vec2[] = []
  routeIdx = 0
  pauseT = 0
  target: Vec2 = { x: 0, z: 0 }
  holdT = 0
  searchT = 0
  searchLeft = 0
  screamT = 0
  // combat
  mode: CombatMode = "engage"
  modeT = 0
  decideT = 0
  reaction = 0
  burstLeft = 0
  shotT = 0
  pauseFire = 0
  firstBurst = true
  telegraph = 0
  cover = -1
  peek: Vec2 | null = null
  coverLow = false
  hideT = 0
  peekT = 0
  firedInPeek = false
  damageSinceCover = 0
  nextCoverTry = 0
  flankCount = 0
  nextFlank = 0
  nextRetreat = 0
  alertT = 0
  spottedOnce = false
  reinforcement = false
  // damage / gore / LOD
  lastCause: DamageInfo["kind"] = "bullet"
  painT = 0
  gibbed = false
  animAcc = 0
  sleepAcc = 0
  lightT = 0
}

export class Merc implements Hostile {
  readonly faction = "merc" as const
  readonly group = new THREE.Group()
  alive = true
  state: EnemyState = "patrol"
  health: number
  readonly maxHealth: number
  /** 0..1 suspicion meter (1 = combat). */
  awareness = 0
  readonly position: THREE.Vector3
  /** Body yaw (0 = facing -Z, positive turns left); mirrored into group.rotation.y. */
  yaw = 0
  /** Animated soldier (attached by EnemyManager). */
  model: SoldierModel | null = null
  /** AI working state. */
  readonly brain = new EnemyBrain()
  readonly gore: GoreBody = { parts: {}, bloodColor: MERC_BLOOD, severed: new Set<BodyPartId>() }
  /** Damage taken per limb (dismemberment threshold GORE_RULES.limbHealth × maxHealth). */
  readonly limbDamage: Record<Limb, number> = { armL: 0, armR: 0, legL: 0, legR: 0 }
  /** Far from the player: hidden, not animated, AI paused unless busy. */
  asleep = false
  constructor(readonly id: number, readonly kind: EnemyKind) {
    this.maxHealth = this.health = ENEMIES[kind].health
    this.position = this.group.position
  }
  /** World position of the head centre (posed). */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.model ? out.copy(this.model.head) : out.set(this.position.x, this.position.y + 1.7, this.position.z)
  }
  /** World position of the chest (posed). */
  chestPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.model ? out.copy(this.model.chestPos) : out.set(this.position.x, this.position.y + 1.3, this.position.z)
  }
}
/** Older name of the merc class. */
export type Enemy = Merc

interface CoverInfo { low: boolean; peeks: Vec2[] }

const PERCEPTION_INTERVAL = 0.15
const RADIUS = 0.36
const ALERT_RADIUS = 25
const COVER_CELL = 16
/** Long trips are pathed in legs of this length (keeps A* bounded on the big zone grid). */
const PATH_LEG = 60
const PATH_NODES = 6000
const isLimb = (p: BodyPartId): p is Limb => p === "armL" || p === "armR" || p === "legL" || p === "legR"

export class EnemyManager implements HostileManager {
  readonly faction = "merc" as const
  readonly enemies: Merc[] = []
  /** CPU time of the last update() in ms (dev/bench). */
  lastUpdateMs = 0
  /** Mercs that got the full AI + animation in the last update. */
  awakeCount = 0
  private rng: Rng
  private nextId = 1
  private assets: SoldierAssets
  private gore: GoreSystem
  private events: HostileEvents
  private time = 0
  private coverInfo: Array<CoverInfo | undefined> = []
  private coverGrid = new Map<number, number[]>()
  private coverScratch: number[] = []
  private coverClaims = new Map<number, Merc>()
  private flanker: Merc | null = null
  private fighting = 0
  private pathBudget = 0
  private team = { t: -999, x: 0, z: 0 }
  private lastShotAt = -999
  private playerActive = true
  private playerPos = new THREE.Vector3()
  private drive = makeDrive()
  private disposed = false

  constructor(private parent: THREE.Object3D, private world: World, private opts: HostileOptions & { gore: GoreSystem }) {
    this.rng = createRng(opts.seed)
    this.assets = acquireSoldierAssets()
    this.gore = opts.gore
    this.events = opts.events
    world.coverPoints.forEach((c, i) => {
      const k = cellKey(Math.floor(c.x / COVER_CELL), Math.floor(c.z / COVER_CELL))
      let list = this.coverGrid.get(k)
      if (!list) { list = []; this.coverGrid.set(k, list) }
      list.push(i)
    })
  }

  // ================================================================ spawning

  /** A squad around (x, z): even members walk the patrol route (offset side by side), odd members guard their post. */
  spawnSquad(kinds: EnemyKind[], x: number, z: number, patrol: Vec2[] = []): void {
    kinds.forEach((kind, i) => {
      const ang = i * 2.39996 + this.rng() * 0.3, r = i === 0 ? 0 : 2.2 + 0.9 * Math.sqrt(i)
      const p = { x: x + Math.cos(ang) * r, z: z + Math.sin(ang) * r }
      let route: Vec2[]
      if (patrol.length && i % 2 === 0) {
        const shift = (i / 2) * 1.5
        route = patrol.map(q => ({ x: q.x + shift, z: q.z + shift * 0.5 }))
      } else {
        // guard: stands at the post facing away from the camp centre and looks around
        const ox = i === 0 ? Math.cos(ang) : p.x - x, oz = i === 0 ? Math.sin(ang) : p.z - z, l = Math.hypot(ox, oz) || 1
        route = [{ x: p.x, z: p.z }, { x: p.x + ox / l * 0.1, z: p.z + oz / l * 0.1 }]
      }
      this.add(kind, p, route)
    })
  }

  spawnReinforcements(kinds: EnemyKind[], target: Vec2): void {
    // enter from the nearest map edge, but no farther than ~85 m from the target (out of sight, not a long walk)
    const b = this.world.layout.bounds
    const edges: Array<[number, number, number]> = [[target.x - b.minX, -1, 0], [b.maxX - target.x, 1, 0], [target.z - b.minZ, 0, -1], [b.maxZ - target.z, 0, 1]]
    edges.sort((u, v) => u[0] - v[0])
    const [edgeDist, ex, ez] = edges[0]
    const reach = Math.max(Math.min(edgeDist - 3, 85), Math.min(30, edgeDist - 3))
    kinds.forEach((kind, i) => {
      const lat = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6
      const px = target.x + ex * reach + ez * lat, pz = target.z + ez * reach + ex * lat
      const spot = this.world.nav.nearestWalkable(px, pz, 10) ?? { x: px, z: pz }
      const around = this.world.nav.randomPointNear(target.x, target.z, 5, this.rng) ?? { x: target.x, z: target.z }
      const e = this.add(kind, spot, [{ x: target.x, z: target.z }, around])
      const br = e.brain
      e.awareness = 0.85; br.urgent = true; br.reinforcement = true
      br.known = { x: target.x, z: target.z }; br.knownT = this.time
      e.yaw = yawTo(target.x - e.position.x, target.z - e.position.z); e.group.rotation.y = e.yaw
      const goal = this.world.nav.randomPointNear(target.x, target.z, 3.5, this.rng) ?? target
      this.investigate(e, goal, true)
    })
  }

  private add(kind: EnemyKind, p: Vec2, route: Vec2[]): Merc {
    const e = new Merc(this.nextId++, kind)
    const m = new SoldierModel(kind, this.assets, e.id)
    e.model = m
    m.severed = e.gore.severed
    e.gore.parts = m.parts
    e.group.name = `Söldner_${e.id}_${kind}`
    e.group.add(m.root)
    m.onStep = () => this.events.footstep?.(e)
    m.setNight(this.world.night)
    const q = { x: p.x, z: p.z }
    this.world.collision.depenetrate(q, RADIUS + 0.05)
    if (!this.world.nav.walkable(q.x, q.z)) { const w = this.world.nav.nearestWalkable(q.x, q.z, 6); if (w) { q.x = w.x; q.z = w.z } }
    e.group.position.set(q.x, 0, q.z)
    const b = e.brain
    b.route = route.length ? route.map(r => ({ x: r.x, z: r.z })) : [{ x: q.x, z: q.z }]
    const face = b.route.length > 1 ? b.route[1] : b.route[0]
    const fx = face.x - q.x, fz = face.z - q.z
    e.yaw = fx * fx + fz * fz > 1e-6 ? yawTo(fx, fz) : this.rng() * Math.PI * 2 - Math.PI
    e.group.rotation.y = e.yaw
    b.aimYaw = e.yaw
    b.percTimer = (e.id * 0.0371) % PERCEPTION_INTERVAL
    b.repathT = (e.id * 0.113) % 1
    b.lightT = (e.id * 0.029) % 0.1
    b.routeIdx = 0
    e.state = "idle"
    b.pauseT = randRange(this.rng, 0.4, 2.5)
    this.parent.add(e.group)
    this.enemies.push(e)
    this.animate(e, 1 / 60)
    return e
  }

  // ================================================================ per frame

  update(dt: number, player: PlayerState): void {
    if (this.disposed) return
    const t0 = typeof performance !== "undefined" ? performance.now() : 0
    this.time += dt
    this.pathBudget = 2
    this.playerActive = player.active
    this.playerPos.copy(player.position)
    let fighting = 0
    for (const e of this.enemies) if (e.alive && e.state === "combat") fighting++
    this.fighting = fighting
    if (this.flanker && (!this.flanker.alive || this.flanker.state !== "combat" || this.flanker.brain.mode !== "flank")) this.flanker = null
    let awake = 0

    for (const e of this.enemies) {
      const m = e.model!, b = e.brain
      // ---- sleep / wake by distance (hysteresis)
      const dist = hyp(player.position.x - e.position.x, player.position.z - e.position.z)
      b.playerDist = dist
      if (e.asleep) { if (dist < WAKE_DIST) this.wake(e) } else if (dist > SLEEP_DIST) this.sleep(e)
      if (!e.alive) {
        if (!e.asleep && !m.settled) { m.update(dt, this.drive); e.group.updateMatrixWorld(true) }
        m.tick(dt)
        continue
      }
      if (e.asleep) { this.sleepTick(e, player, dt); continue }
      awake++
      if (!player.active) this.attract(e, dt)
      else {
        this.perceive(e, player, dt)
        this.think(e, player, dt)
      }
      this.move(e, player, dt)
      this.steer(e, player, dt)
      // calm mercs between 60 m and the sleep distance animate at half rate
      const far = dist > 60 && e.state !== "combat"
      b.animAcc += dt
      if (!far || b.animAcc >= 2 / 60 - 1e-6) { this.animate(e, b.animAcc, player); b.animAcc = 0 }
      else { e.group.rotation.y = e.yaw; m.tick(dt) }
      // after posing: shots leave from this frame's muzzle position
      if (player.active) this.weapons(e, player, dt)
    }
    this.awakeCount = awake
    if (typeof performance !== "undefined") this.lastUpdateMs = performance.now() - t0
  }

  private sleep(e: Merc): void {
    e.asleep = true
    e.group.visible = false
    e.brain.sees = false; e.brain.burstLeft = 0; e.brain.telegraph = 0
    e.model?.setLaser(false)
  }

  private wake(e: Merc): void {
    e.asleep = false
    if (!e.brain.gibbed) e.group.visible = true
    e.brain.sleepAcc = 0
  }

  /**
   * Far away: camp mercs idle at their post (no work at all). Busy mercs (alerted, investigating, reinforcements,
   * fleeing) keep thinking and walking at 4 Hz without animation so they still arrive where they were going.
   */
  private sleepTick(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain
    const busy = e.state === "combat" || e.state === "investigate" || e.state === "search" || e.state === "flee" || (b.hasGoal && !b.arrived && e.state !== "patrol")
    if (!busy) return
    b.sleepAcc += dt
    if (b.sleepAcc < 0.25) return
    const sdt = b.sleepAcc
    b.sleepAcc = 0
    b.sees = false
    if (e.state !== "combat") e.awareness = Math.max(b.floor, e.awareness - 0.12 * sdt)
    this.think(e, player, sdt)
    this.move(e, player, sdt)
    this.steer(e, player, sdt)
    e.group.rotation.y = e.yaw
    e.group.updateMatrixWorld(true)
    e.model!.capture()
  }

  // ================================================================ perception

  private perceive(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain
    b.percTimer -= dt
    if (b.percTimer <= 0) {
      b.percTimer += PERCEPTION_INTERVAL
      const before = b.sees
      this.look(e, player)
      // re-acquired after a while: a short new reaction before shooting again
      if (b.sees && !before && e.state === "combat" && this.time - b.lastSeen > 3) b.reaction = Math.max(b.reaction, DIFFICULTY[this.opts.difficulty].reaction * 0.5)
      if (b.sees) b.lastSeen = this.time
    }
    if (b.sees) {
      const alerted = e.state === "investigate" || e.state === "search" || b.urgent || e.awareness > 0.6 || b.floor > 0
      const q = _detect
      q.distance = b.playerDist; q.range = b.range; q.crouched = player.crouched; q.sprinting = player.sprinting; q.shooting = this.playerShooting()
      q.moving = player.speed > 0.6; q.night = this.world.night; q.flashlight = player.flashlight; q.peripheral = b.peripheral; q.partial = b.partial; q.alerted = alerted
      e.awareness = Math.min(1, e.awareness + detectionRate(q) * dt)
    } else if (e.state !== "combat" && e.state !== "flee") {
      e.awareness = Math.max(b.floor, e.awareness - 0.12 * dt)
    }
  }

  private playerShooting(): boolean { return this.time - this.lastShotAt < 0.7 }

  /** Throttled sight check: range (time of day, flashlight), field of view, 3D line of sight head → player head/chest. */
  private look(e: Merc, player: PlayerState): void {
    const b = e.brain, def = ENEMIES[e.kind], m = e.model!
    b.sees = false; b.partial = false
    if (!player.alive || !player.active || e.state === "flee" || e.gore.severed.has("head")) return
    const dx = player.position.x - e.position.x, dz = player.position.z - e.position.z, dist = b.playerDist
    const v = _vision
    v.vision = def.vision; v.visionScale = this.world.visionScale; v.night = this.world.night; v.flashlight = player.flashlight; v.crouched = player.crouched; v.shooting = this.playerShooting()
    const range = visionRange(v)
    b.range = range
    if (dist > range) return
    const close = dist < 2.2
    const viewYaw = e.state === "combat" || e.state === "suspicious" ? b.aimYaw : e.yaw + b.look
    if (!close && !inFieldOfView(viewYaw, dx, dz, def.fov)) return
    const eye = m.head, col = this.world.collision
    _t.set(player.position.x, player.eyeY - 0.08, player.position.z)
    const headVis = !col.segmentBlocked3D(eye, _t)
    _t.y = player.eyeY - 0.45
    const chestVis = !col.segmentBlocked3D(eye, _t)
    if (!headVis && !chestVis) return
    b.sees = true
    b.partial = !chestVis
    b.peripheral = !close && isPeripheral(viewYaw, dx, dz, def.fov)
    b.lastStimulus = this.time
    b.known.x = player.position.x; b.known.z = player.position.z; b.knownT = this.time
    if (e.state === "combat") { this.team.t = this.time; this.team.x = player.position.x; this.team.z = player.position.z }
  }

  // ================================================================ decisions

  private think(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain
    if (b.alertT > 0) b.alertT -= dt
    switch (e.state) {
      case "idle":
      case "patrol":
        if (b.sees && e.awareness > b.floor + 0.01) { this.setSuspicious(e); break }
        this.patrol(e, dt)
        break
      case "suspicious":
        this.stop(e)
        b.face = b.known
        if (e.awareness >= 1) { this.enterCombat(e); break }
        if (!b.sees && this.time - b.lastStimulus > 1.3) {
          if (e.awareness > 0.3) this.investigate(e, b.known, e.awareness > 0.6)
          else if (e.awareness <= b.floor + 0.04) this.returnToPatrol(e, false)
        }
        break
      case "investigate":
        if (b.sees && e.awareness >= 1) { this.enterCombat(e); break }
        this.investigateTick(e, dt)
        break
      case "search":
        if (b.sees && e.awareness >= 1) { this.enterCombat(e); break }
        this.searchTick(e, dt)
        break
      case "combat":
        this.combat(e, player, dt)
        break
      case "flee":
        this.fleeTick(e, dt)
        break
    }
  }

  private setSuspicious(e: Merc): void {
    e.state = "suspicious"
    this.stop(e)
  }

  private enterCombat(e: Merc): void {
    const b = e.brain
    if (e.state === "flee" || e.state === "dead") return
    const wasCombat = e.state === "combat"
    e.state = "combat"; e.awareness = 1
    if (wasCombat) return
    b.alertT = 2
    b.reaction = DIFFICULTY[this.opts.difficulty].reaction * randRange(this.rng, 0.9, 1.15)
    b.firstBurst = true; b.burstLeft = 0; b.pauseFire = 0; b.telegraph = 0
    b.mode = "engage"; b.modeT = 0; b.decideT = 0
    b.nextCoverTry = 0; b.flankCount = 0
    if (b.knownT > this.team.t) { this.team.t = b.knownT; this.team.x = b.known.x; this.team.z = b.known.z }
    if (!b.spottedOnce) { b.spottedOnce = true; this.events.spotted?.(e) }
    if (this.alertAllies(e)) this.events.sound?.(e, "radio")
  }

  /** Allies within ALERT_RADIUS (or with line of sight to e) learn the last known position and come over. */
  private alertAllies(e: Merc): number {
    let n = 0
    for (const o of this.enemies) {
      if (o === e || !o.alive || o.state === "combat" || o.state === "flee") continue
      const d = hyp(o.position.x - e.position.x, o.position.z - e.position.z)
      if (d > 60) continue
      if (d > ALERT_RADIUS && this.world.collision.segmentBlocked3D(e.model!.head, o.model!.head)) continue
      o.awareness = Math.max(o.awareness, 0.75)
      o.brain.known = { x: e.brain.known.x, z: e.brain.known.z }; o.brain.knownT = e.brain.knownT
      o.brain.lastStimulus = this.time
      this.investigate(o, o.brain.known, true)
      n++
    }
    return n
  }

  private investigate(e: Merc, target: Vec2, urgent: boolean): void {
    const b = e.brain, def = ENEMIES[e.kind]
    if (e.state === "flee" || e.state === "dead") return
    e.state = "investigate"
    b.urgent = b.urgent || urgent
    b.target = { x: target.x, z: target.z }
    b.holdT = 0
    this.releaseCover(e)
    this.moveTo(e, target.x, target.z, b.urgent ? def.runSpeed * 0.9 : def.walkSpeed, 1.2)
  }

  private investigateTick(e: Merc, dt: number): void {
    const b = e.brain
    b.face = b.sees ? b.known : null
    if (b.hasGoal && !b.arrived) return
    // arrived (or unreachable): look around for a moment
    b.holdT += dt
    this.lookAround(e, dt)
    if (b.holdT > (b.urgent ? 2 : 3)) {
      if (b.urgent) this.enterSearch(e)
      else this.returnToPatrol(e, e.awareness > 0.35)
    }
  }

  private enterSearch(e: Merc): void {
    const b = e.brain, def = ENEMIES[e.kind]
    e.state = "search"
    e.awareness = Math.min(e.awareness, 0.7)
    b.searchT = 15
    b.searchLeft = 2 + (this.rng() < 0.5 ? 1 : 0)
    b.holdT = 0
    b.telegraph = 0; b.burstLeft = 0
    this.releaseCover(e)
    if (this.flanker === e) this.flanker = null
    this.moveTo(e, b.known.x, b.known.z, def.walkSpeed * 1.15, 1)
  }

  private searchTick(e: Merc, dt: number): void {
    const b = e.brain, def = ENEMIES[e.kind]
    b.searchT -= dt
    b.face = b.sees ? b.known : null
    if (b.searchT <= 0) { this.returnToPatrol(e, true); return }
    if (b.hasGoal && !b.arrived) return
    b.holdT += dt
    this.lookAround(e, dt)
    if (b.holdT < 1.8) return
    if (b.searchLeft <= 0) { this.returnToPatrol(e, true); return }
    b.searchLeft--
    b.holdT = 0
    const p = this.world.nav.randomPointNear(b.known.x, b.known.z, 9, this.rng)
    if (p) this.moveTo(e, p.x, p.z, def.walkSpeed * 1.1, 0.8)
  }

  private returnToPatrol(e: Merc, raised: boolean): void {
    const b = e.brain, def = ENEMIES[e.kind]
    e.state = "patrol"
    b.urgent = false; b.reinforcement = false
    b.face = null; b.crouch = false; b.telegraph = 0; b.burstLeft = 0
    if (raised) b.floor = 0.25
    e.awareness = Math.max(b.floor, Math.min(e.awareness, 0.3))
    this.releaseCover(e)
    if (this.flanker === e) this.flanker = null
    let best = 0, bestD = Infinity
    b.route.forEach((r, i) => { const d = hyp(r.x - e.position.x, r.z - e.position.z); if (d < bestD) { bestD = d; best = i } })
    b.routeIdx = best
    const r = b.route[best]
    if (r) this.moveTo(e, r.x, r.z, def.walkSpeed * 0.75, 0.5)
  }

  private patrol(e: Merc, dt: number): void {
    const b = e.brain, def = ENEMIES[e.kind]
    b.face = null; b.crouch = false
    if (e.state === "idle") {
      b.pauseT -= dt
      this.lookAround(e, dt)
      if (b.pauseT > 0 || b.route.length < 2) return
      b.routeIdx = (b.routeIdx + 1) % b.route.length
      const r = b.route[b.routeIdx]
      this.moveTo(e, r.x, r.z, def.walkSpeed * 0.75, 0.5)
      e.state = "patrol"
      return
    }
    b.look += (0 - b.look) * Math.min(1, dt * 3)
    if (!b.hasGoal || b.arrived) { e.state = "idle"; b.pauseT = randRange(this.rng, 1.8, 4.2); b.lookT = 0 }
  }

  private lookAround(e: Merc, dt: number): void {
    const b = e.brain
    b.lookT -= dt
    if (b.lookT <= 0) { b.lookT = randRange(this.rng, 1.1, 2.2); b.lookTarget = randRange(this.rng, -1.1, 1.1) }
    b.look += (b.lookTarget - b.look) * Math.min(1, dt * 2.2)
  }

  private attract(e: Merc, dt: number): void {
    const b = e.brain
    b.sees = false
    if (e.state === "flee") { this.fleeTick(e, dt); return }
    if (e.state !== "patrol" && e.state !== "idle") this.returnToPatrol(e, false)
    e.awareness = 0; b.floor = 0
    this.patrol(e, dt)
  }

  /** Lost an arm: no weapon, runs away from the player screaming and bleeds out. */
  private fleeTick(e: Merc, dt: number): void {
    const b = e.brain, def = ENEMIES[e.kind]
    b.face = null; b.crouch = false; b.aim = 0
    e.health -= e.maxHealth * 0.07 * dt
    if (e.health <= 0) {
      const dx = e.position.x - this.playerPos.x, dz = e.position.z - this.playerPos.z, l = hyp(dx, dz) || 1
      this.kill(e, dx / l, dz / l, b.lastCause, "limb")
      return
    }
    b.screamT -= dt
    if (b.screamT <= 0) { b.screamT = randRange(this.rng, 1.4, 2.4); this.events.sound?.(e, "pain") }
    if (!b.hasGoal || b.arrived) {
      const p = this.retreatPoint(e, this.playerPos, 30 + this.rng() * 15)
      if (p) this.moveTo(e, p.x, p.z, def.runSpeed * 0.85, 1)
    }
  }

  // ================================================================ combat

  private combat(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain
    // team knowledge: someone else saw the player more recently
    if (!b.sees && this.team.t > b.knownT + 0.4 && hyp(this.team.x - e.position.x, this.team.z - e.position.z) < 50) {
      b.known.x = this.team.x; b.known.z = this.team.z; b.knownT = this.team.t
    }
    const lost = this.time - b.knownT
    if (lost > (player.alive ? 11 : 4)) { this.enterSearch(e); return }
    b.modeT += dt
    b.decideT -= dt
    if (b.decideT <= 0) {
      b.decideT = 0.3 + this.rng() * 0.15
      this.decide(e, player)
    }
    if (b.mode === "cover" || b.mode === "peek") this.coverCycle(e, dt)
    // face the threat unless running somewhere without seeing it
    const running = b.hasGoal && !b.arrived && (b.mode === "toCover" || b.mode === "retreat" || b.mode === "reposition" || (b.mode === "pursue" && !b.sees) || (b.mode === "flank" && !b.sees))
    b.face = running ? null : b.known
  }

  private decide(e: Merc, player: PlayerState): void {
    const b = e.brain, def = ENEMIES[e.kind]
    const T = b.known, dist = hyp(T.x - e.position.x, T.z - e.position.z), lost = this.time - b.knownT
    const setMode = (m: CombatMode) => { if (b.mode !== m) { b.mode = m; b.modeT = 0 } }
    switch (e.kind) {
      case "rifleman": {
        if (b.mode === "toCover") {
          if (b.arrived || !b.hasGoal) {
            if (b.unreachable) { this.releaseCover(e); setMode("engage") }
            else { setMode("cover"); b.hideT = 0.25; b.damageSinceCover = 0; b.coverLow = this.coverInfoAt(b.cover).low }
          } else if (b.modeT > 7) { this.releaseCover(e); setMode("engage") }
          return
        }
        if (b.mode === "cover" || b.mode === "peek") {
          const c = this.world.coverPoints[b.cover]
          const flanked = !c || !coverFacesThreat(c, T)
          const tooFar = c && hyp(T.x - c.x, T.z - c.z) > def.range
          const hurt = b.damageSinceCover >= 24
          const stale = b.modeT > 12 && lost > 5
          if (!flanked && !tooFar && !hurt && !stale) return
          this.releaseCover(e)
          setMode("engage")
          b.nextCoverTry = this.time + (hurt ? 0 : 0.5)
        }
        if (this.time >= b.nextCoverTry && b.mode !== "pursue") {
          if (this.takeCover(e, T)) { setMode("toCover"); return }
          b.nextCoverTry = this.time + 2.5
        }
        this.fightInOpen(e, T, dist, lost, setMode)
        return
      }
      case "scout": {
        if (b.mode === "flank") {
          if (b.arrived || !b.hasGoal || b.modeT > 8) { if (this.flanker === e) this.flanker = null; setMode("skirmish"); b.nextFlank = this.time + 6 }
          return
        }
        const tokenFree = this.fighting <= 2 || this.flanker === null || this.flanker === e
        if (tokenFree && this.time >= b.nextFlank && b.flankCount < 2 && dist < 35 && b.modeT > 0.4) {
          const side: 1 | -1 = this.rng() < 0.5 ? 1 : -1
          for (const s of [side, -side as 1 | -1]) {
            const fp = flankPoint(T, e.position, s, randRange(this.rng, 1.7, 2.2), randRange(this.rng, 8, 11))
            const p = this.world.nav.nearestWalkable(fp.x, fp.z, 3)
            if (!p) continue
            if (this.fighting > 2) this.flanker = e
            b.flankCount++
            setMode("flank")
            this.moveTo(e, p.x, p.z, def.runSpeed, 0.8)
            return
          }
          b.nextFlank = this.time + 3
        }
        if (!b.sees && lost > 2.5) { setMode("pursue"); this.moveTo(e, T.x, T.z, def.runSpeed, 3, true); return }
        if (b.mode !== "skirmish" || b.arrived || !b.hasGoal || b.modeT > 3.2) {
          setMode("skirmish"); b.modeT = 0
          const bearing = Math.atan2(e.position.z - T.z, e.position.x - T.x) + randRange(this.rng, -1, 1)
          const r = randRange(this.rng, 9, 15)
          const p = this.world.nav.nearestWalkable(T.x + Math.cos(bearing) * r, T.z + Math.sin(bearing) * r, 3)
          if (p) this.moveTo(e, p.x, p.z, def.runSpeed * 0.8, 0.8)
        }
        return
      }
      case "heavy": {
        setMode("push")
        if (!b.sees) this.moveTo(e, T.x, T.z, def.runSpeed, 2.5, true)
        else if (dist > 5.5) this.moveTo(e, T.x, T.z, def.walkSpeed * 1.35, 4.5, true)
        else this.stop(e)
        return
      }
      case "marksman": {
        if (b.mode === "retreat" || b.mode === "reposition") {
          if (b.arrived || !b.hasGoal || b.modeT > 8) setMode("hold")
          else return
        }
        if (dist < 26 && this.time >= b.nextRetreat) {
          b.nextRetreat = this.time + 7
          const p = this.retreatPoint(e, T, 38)
          if (p) { setMode("retreat"); b.crouch = false; this.moveTo(e, p.x, p.z, def.runSpeed, 0.8); return }
        }
        if (dist > 55 || (!b.sees && lost > 3.5 && b.modeT > 2)) {
          const p = this.vantagePoint(e, T, player)
          if (p) { setMode("reposition"); b.crouch = false; this.moveTo(e, p.x, p.z, def.runSpeed, 0.8); return }
          if (!b.sees) { setMode("pursue"); this.moveTo(e, T.x, T.z, def.walkSpeed * 1.2, 20, true); return }
        }
        setMode("hold")
        this.stop(e)
        // kneel for stability at long range; stand up when kneeling costs the line of sight
        if (b.sees && dist > 26) b.crouch = true
        else if (!b.sees && this.time - b.lastSeen > 1.2) b.crouch = false
        return
      }
    }
  }

  /** Rifleman without usable cover: hold at a sensible range, advance when too far, back off when too close. */
  private fightInOpen(e: Merc, T: Vec2, dist: number, lost: number, setMode: (m: CombatMode) => void): void {
    const b = e.brain, def = ENEMIES[e.kind]
    if (!b.sees && lost > 2.5) { setMode("pursue"); b.crouch = false; this.moveTo(e, T.x, T.z, def.runSpeed, 4, true); return }
    if (dist > def.range * 0.85) { setMode("engage"); b.crouch = false; this.moveTo(e, T.x, T.z, def.runSpeed, def.range * 0.65, true); return }
    if (dist < 5) {
      const ax = e.position.x - T.x, az = e.position.z - T.z, l = hyp(ax, az) || 1
      const p = this.world.nav.nearestWalkable(e.position.x + ax / l * 5, e.position.z + az / l * 5, 3)
      if (p) { setMode("engage"); b.crouch = false; this.moveTo(e, p.x, p.z, def.walkSpeed, 0.6); return }
    }
    if (b.mode !== "hold") { setMode("hold"); this.stop(e); b.crouch = dist > 14 && this.rng() < 0.5 }
    else if (b.modeT > 3.5 && !b.hasGoal) {
      // small strafe step to stay unpredictable
      b.modeT = 0
      const ang = Math.atan2(e.position.z - T.z, e.position.x - T.x) + (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2
      const p = this.world.nav.nearestWalkable(e.position.x + Math.cos(ang) * 2.5, e.position.z + Math.sin(ang) * 2.5, 2)
      if (p) { b.crouch = false; this.moveTo(e, p.x, p.z, def.walkSpeed, 0.4) }
    } else if (b.arrived) this.stop(e)
  }

  /** Peek cycle while holding cover: hide (crouch / behind the solid) → step out or stand up → burst → hide. */
  private coverCycle(e: Merc, dt: number): void {
    const b = e.brain, def = ENEMIES[e.kind], c = this.world.coverPoints[b.cover]
    if (!c) return
    if (b.mode === "cover") {
      b.crouch = b.coverLow
      if (b.hasGoal && !b.arrived) return
      b.hideT -= dt
      if (b.hideT <= 0 && b.burstLeft === 0) {
        b.mode = "peek"; b.peekT = 0; b.firedInPeek = false
        b.crouch = false
        if (b.peek && hyp(b.peek.x - c.x, b.peek.z - c.z) > 0.3) this.moveTo(e, b.peek.x, b.peek.z, def.walkSpeed, 0.25)
      }
    } else {
      b.crouch = false
      b.peekT += dt
      if (b.burstLeft > 0 || b.telegraph > 0) b.firedInPeek = true
      const done = (b.firedInPeek && b.burstLeft === 0) || b.peekT > 2.6
      if (done) {
        b.mode = "cover"
        b.hideT = def.burstPause * randRange(this.rng, 0.9, 1.5)
        if (hyp(e.position.x - c.x, e.position.z - c.z) > 0.3) this.moveTo(e, c.x, c.z, def.walkSpeed, 0.25)
      }
    }
  }

  /** Cover-point indices within r of (x, z) from the cover grid (reused array). */
  private nearCover(x: number, z: number, r: number): number[] {
    const out = this.coverScratch
    out.length = 0
    const x0 = Math.floor((x - r) / COVER_CELL), x1 = Math.floor((x + r) / COVER_CELL), z0 = Math.floor((z - r) / COVER_CELL), z1 = Math.floor((z + r) / COVER_CELL)
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const list = this.coverGrid.get(cellKey(cx, cz))
      if (list) for (const i of list) out.push(i)
    }
    return out
  }

  private takeCover(e: Merc, T: Vec2): boolean {
    const def = ENEMIES[e.kind], pts = this.world.coverPoints, col = this.world.collision
    const ranked = rankCover(pts, {
      from: e.position, threat: T, maxTravel: 15, range: def.range * 0.95, minThreatDist: 6, preferDist: def.range * 0.55,
      taken: i => { const o = this.coverClaims.get(i); return !!o && o !== e && o.alive },
    }, this.nearCover(e.position.x, e.position.z, 15))
    let checked = 0
    for (const i of ranked) {
      if (++checked > 4) break
      const c = pts[i], info = this.coverInfoAt(i)
      // protection: the solid must hide a crouched (low) or standing (tall) body from the threat
      _a.set(T.x, 1.25, T.z)
      _b.set(c.x, info.low ? 0.95 : 1.45, c.z)
      if (!col.segmentBlocked3D(_a, _b)) continue
      // firing spot: stand up (low cover) or step past the edge (tall cover)
      let peek: Vec2 | null = null
      for (const p of info.peeks) {
        _b.set(p.x, 1.5, p.z)
        if (!col.segmentBlocked3D(_b, _a)) { peek = p; break }
      }
      if (!peek) continue
      this.releaseCover(e)
      this.coverClaims.set(i, e)
      const b = e.brain
      b.cover = i; b.peek = peek; b.coverLow = info.low
      this.moveTo(e, c.x, c.z, def.runSpeed, 0.3)
      b.crouch = false
      return true
    }
    return false
  }

  private releaseCover(e: Merc): void {
    const b = e.brain
    if (b.cover >= 0 && this.coverClaims.get(b.cover) === e) this.coverClaims.delete(b.cover)
    b.cover = -1; b.peek = null; b.crouch = false
  }

  /** Cover analysis on first use: low/tall and the firing spots (stand up / step past the solid's edge). */
  private coverInfoAt(i: number): CoverInfo {
    let info = this.coverInfo[i]
    if (info) return info
    const c = this.world.coverPoints[i], nav = this.world.nav
    const low = c.height < 1.45
    const peeks: Vec2[] = []
    if (low) peeks.push({ x: c.x, z: c.z })
    const probeX = c.x - c.nx * 0.75, probeZ = c.z - c.nz * 0.75
    let solid = null
    for (const o of this.world.collision.near(probeX, probeZ, 0.1)) if (probeX >= o.minX - 0.05 && probeX <= o.maxX + 0.05 && probeZ >= o.minZ - 0.05 && probeZ <= o.maxZ + 0.05 && (o.minY ?? 0) < 1) { solid = o; break }
    if (solid) {
      const tx = -c.nz, tz = c.nx
      let lo = Infinity, hi = -Infinity
      for (const [x, z] of [[solid.minX, solid.minZ], [solid.maxX, solid.minZ], [solid.minX, solid.maxZ], [solid.maxX, solid.maxZ]]) {
        const pr = (x - c.x) * tx + (z - c.z) * tz
        lo = Math.min(lo, pr); hi = Math.max(hi, pr)
      }
      for (const edge of [hi + 0.6, lo - 0.6]) {
        if (Math.abs(edge) > 12) continue
        const x = c.x + tx * edge, z = c.z + tz * edge
        if (nav.walkable(x, z)) peeks.push({ x, z })
      }
    }
    info = { low, peeks }
    this.coverInfo[i] = info
    return info
  }

  /** A walkable spot ~`want` m from the threat, roughly away from it (marksman retreat, fleeing). */
  private retreatPoint(e: Merc, T: Vec2, want: number): Vec2 | null {
    const base = Math.atan2(e.position.z - T.z, e.position.x - T.x)
    for (const off of [0, 0.5, -0.5, 1, -1, 1.4, -1.4]) {
      const a = base + off
      const p = this.world.nav.nearestWalkable(T.x + Math.cos(a) * want, T.z + Math.sin(a) * want, 3)
      if (p && hyp(p.x - T.x, p.z - T.z) > want * 0.75) return p
    }
    return null
  }

  /** Marksman: a spot 32–48 m from the threat with line of sight to it. */
  private vantagePoint(e: Merc, T: Vec2, player: PlayerState): Vec2 | null {
    const base = Math.atan2(e.position.z - T.z, e.position.x - T.x)
    _a.set(T.x, player.eyeY - 0.4, T.z)
    for (let i = 0; i < 6; i++) {
      const a = base + randRange(this.rng, -1.1, 1.1), r = randRange(this.rng, 32, 48)
      const p = this.world.nav.nearestWalkable(T.x + Math.cos(a) * r, T.z + Math.sin(a) * r, 3)
      if (!p) continue
      _b.set(p.x, 1.55, p.z)
      if (!this.world.collision.segmentBlocked3D(_b, _a)) return p
    }
    return null
  }

  // ================================================================ weapons

  private weapons(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain, def = ENEMIES[e.kind]
    if (e.model!.unarmed) { b.burstLeft = 0; b.telegraph = 0; return }
    if (b.burstLeft > 0) {
      b.shotT -= dt
      if (b.shotT <= 0) {
        if (this.canShoot(e, player) && this.fireBullet(e, player)) {
          b.burstLeft--
          b.shotT += def.burstInterval
        } else b.burstLeft = 0
        if (b.burstLeft === 0) { b.pauseFire = def.burstPause * randRange(this.rng, 0.85, 1.2); b.firstBurst = false }
      }
      return
    }
    if (b.telegraph > 0) {
      b.telegraph -= dt
      if (!this.canShoot(e, player) && b.telegraph < 0.85) { b.telegraph = 0; b.pauseFire = 0.6; return }
      if (b.telegraph <= 0) {
        b.telegraph = 0
        if (this.canShoot(e, player)) this.fireBullet(e, player)
        b.pauseFire = def.burstPause * randRange(this.rng, 0.85, 1.2); b.firstBurst = false
      }
      return
    }
    if (b.pauseFire > 0) b.pauseFire -= dt
    if (e.state !== "combat" || !player.alive) return
    if (b.sees && b.reaction > 0) b.reaction -= dt
    if (b.reaction > 0 || b.pauseFire > 0 || !this.wantsToFire(e)) return
    if (e.kind === "marksman") { b.telegraph = 1.0; return }
    b.burstLeft = randInt(this.rng, def.burstMin, def.burstMax)
    b.shotT = 0
  }

  private wantsToFire(e: Merc): boolean {
    const b = e.brain, def = ENEMIES[e.kind], m = e.model!
    if (!b.sees || b.playerDist > def.range) return false
    if (b.mode === "cover") return false
    if (b.mode === "toCover" && b.playerDist > 8 && !b.arrived) return false
    if ((b.mode === "retreat" || b.mode === "reposition") && !b.arrived) return false
    if (m.aimAmount < 0.8) return false
    return Math.abs(wrapAngle(b.aimYaw - e.yaw)) < 1.1
  }

  /** Line of sight from the actual muzzle to the player (never shoot through cover). */
  private canShoot(e: Merc, player: PlayerState): boolean {
    const b = e.brain
    if (!player.alive || !player.active || e.state !== "combat" || e.model!.unarmed) return false
    if (!b.sees && this.time - b.lastSeen > 0.25) return false
    return this.pickAimPoint(e, player)
  }

  /** Sets _aim to a visible point on the player (chest, else head). */
  private pickAimPoint(e: Merc, player: PlayerState): boolean {
    const mz = e.model!.muzzle, col = this.world.collision
    _aim.set(player.position.x, player.eyeY - 0.45, player.position.z)
    if (!col.segmentBlocked3D(mz, _aim)) return true
    _aim.y = player.eyeY - 0.08
    return !col.segmentBlocked3D(mz, _aim)
  }

  private fireBullet(e: Merc, player: PlayerState): boolean {
    if (!this.pickAimPoint(e, player)) return false
    const b = e.brain, def = ENEMIES[e.kind], m = e.model!, diff = DIFFICULTY[this.opts.difficulty]
    const from = m.muzzle.clone()
    const dx = _aim.x - from.x, dz = _aim.z - from.z, dist = hyp(dx, dz) || 1
    const chance = hitChance({
      accuracy: def.accuracy, distance: dist, range: def.range, playerSpeed: player.speed, sprinting: player.sprinting,
      crouched: player.crouched, difficultyAccuracy: diff.enemyAccuracy, firstBurst: b.firstBurst,
    })
    const hit = this.rng() < chance
    const to = new THREE.Vector3()
    const px = -dz / dist, pz = dx / dist
    if (hit) {
      const lat = (this.rng() - 0.5) * 0.24
      const y = _aim.y + (this.rng() - 0.5) * (b.partial ? 0.1 : 0.35)
      to.set(_aim.x + px * lat, y, _aim.z + pz * lat)
    } else if (this.rng() < 0.65) {
      const side = this.rng() < 0.5 ? -1 : 1, lat = side * randRange(this.rng, 0.6, 2)
      to.set(_aim.x + px * lat, _aim.y + randRange(this.rng, -0.25, 0.7), _aim.z + pz * lat)
    } else {
      const lat = randRange(this.rng, -0.5, 0.5)
      to.set(_aim.x + px * lat, player.eyeY + randRange(this.rng, 0.6, 1.4), _aim.z + pz * lat)
    }
    m.fire()
    this.events.shoot?.({ source: e, from, to, hit, damage: def.damage * diff.enemyDamage, weapon: def.weapon })
    return true
  }

  // ================================================================ movement

  private moveTo(e: Merc, x: number, z: number, speed: number, stopAt: number, dynamic = false): void {
    const b = e.brain
    const moved = !b.hasGoal || hyp(x - b.goal.x, z - b.goal.z) > (dynamic ? 2 : 0.5)
    b.goal.x = x; b.goal.z = z
    b.speed = speed; b.stopAt = stopAt; b.dynamic = dynamic
    if (!b.hasGoal || moved) { b.needPath = true; b.arrived = false; b.unreachable = false; b.stuck = 0 }
    if (hyp(x - e.position.x, z - e.position.z) <= stopAt) { b.arrived = true; b.path = null; b.needPath = false }
    b.hasGoal = true
  }

  private stop(e: Merc): void {
    const b = e.brain
    b.hasGoal = false; b.path = null; b.needPath = false; b.arrived = true
  }

  /** A* towards the goal; trips longer than PATH_LEG are pathed in legs toward an intermediate walkable point. */
  private plan(e: Merc): void {
    const b = e.brain, p = e.position, nav = this.world.nav
    let tx = b.goal.x, tz = b.goal.z
    const far = hyp(tx - p.x, tz - p.z)
    if (far > PATH_LEG + 10) {
      const k = PATH_LEG / far
      const w = nav.nearestWalkable(p.x + (tx - p.x) * k, p.z + (tz - p.z) * k, 8)
      if (w) { tx = w.x; tz = w.z }
    }
    const path = nav.findPath(p.x, p.z, tx, tz, PATH_NODES)
    if (path && path.length) { b.path = path; b.pathIdx = 0; return }
    if (far > 12) { b.path = [{ x: tx, z: tz }]; b.pathIdx = 0; b.repathT = 1.5; b.dynamic = true; return } // blind leg, retry soon
    b.path = null; b.arrived = true; b.unreachable = true; b.hasGoal = false
  }

  private move(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain, p = e.position, col = this.world.collision
    let dvx = 0, dvz = 0
    if (b.hasGoal && !b.arrived) {
      if (b.dynamic) b.repathT -= dt
      if ((b.needPath || (b.dynamic && b.repathT <= 0)) && this.pathBudget > 0) {
        this.pathBudget--
        b.needPath = false
        b.repathT = 1.0 + ((e.id * 0.173) % 0.5)
        this.plan(e)
      }
      const path = b.path
      if (path && !b.arrived) {
        const last = path.length - 1
        while (b.pathIdx < last && hyp(path[b.pathIdx].x - p.x, path[b.pathIdx].z - p.z) < 0.5) b.pathIdx++
        const goalD = hyp(b.goal.x - p.x, b.goal.z - p.z)
        const wp = path[b.pathIdx]
        const wx = wp.x - p.x, wz = wp.z - p.z, wd = hyp(wx, wz)
        if (goalD <= b.stopAt) { b.arrived = true; b.path = null }
        else if (b.pathIdx === last && wd < 0.3) {
          if (goalD > 3) { b.path = null; b.needPath = true }                                         // end of a leg: plan the next one
          else if (wp.x !== b.goal.x || wp.z !== b.goal.z) { b.path = [{ x: b.goal.x, z: b.goal.z }]; b.pathIdx = 0 } // last metre straight to the exact spot
          else { b.arrived = true; b.path = null }
        }
        else if (wd > 1e-4) {
          const spd = Math.min(b.speed, 0.6 + goalD * 2.2)
          dvx = wx / wd * spd; dvz = wz / wd * spd
        }
      }
    }
    // separation from other living mercs (only nearby ones matter; the list is short)
    for (const o of this.enemies) {
      if (o === e || !o.alive) continue
      const sx = p.x - o.position.x, sz = p.z - o.position.z, d2 = sx * sx + sz * sz
      if (d2 < 1.1 * 1.1 && d2 > 1e-6) { const d = Math.sqrt(d2), f = (1.1 - d) / 1.1 * 2.2; dvx += sx / d * f; dvz += sz / d * f }
    }
    // keep ≥ 1.2 m from the player
    if (player.active && player.alive) {
      const sx = p.x - player.position.x, sz = p.z - player.position.z, d = hyp(sx, sz)
      if (d < 1.35 && d > 1e-4) { const f = (1.35 - d) * 6; dvx += sx / d * f; dvz += sz / d * f }
    }
    const k = 1 - Math.exp(-8 * dt)
    b.vx += (dvx - b.vx) * k; b.vz += (dvz - b.vz) * k
    if (Math.abs(b.vx) + Math.abs(b.vz) < 1e-3) { b.vx = 0; b.vz = 0; return }
    const ox = p.x, oz = p.z
    const sx = b.vx * dt, sz = b.vz * dt, want = hyp(sx, sz)
    col.moveCircle(p.x, p.z, sx, sz, RADIUS, _p)
    // smoothed nav paths may clip a corner: when the step is mostly blocked, try turning the step around it
    if (want > 1e-3 && hyp(_p.x - ox, _p.z - oz) < want * 0.45) {
      let bx = _p.x, bz = _p.z, best = (_p.x - ox) * sx + (_p.z - oz) * sz
      for (const a of TURNS) {
        const c = Math.cos(a), s = Math.sin(a)
        col.moveCircle(ox, oz, sx * c - sz * s, sx * s + sz * c, RADIUS, _q)
        const gain = (_q.x - ox) * sx + (_q.z - oz) * sz
        if (gain > best + 1e-6) { best = gain; bx = _q.x; bz = _q.z }
      }
      _p.x = bx; _p.z = bz
    }
    p.x = _p.x; p.z = _p.z
    // actual velocity drives the animation; stuck detection repaths
    b.vx = (p.x - ox) / Math.max(dt, 1e-4); b.vz = (p.z - oz) / Math.max(dt, 1e-4)
    if (b.hasGoal && !b.arrived) {
      b.progT += dt
      if (b.progT > 0.8) {
        if (hyp(p.x - b.progX, p.z - b.progZ) < 0.15 * b.speed) { b.stuck++; b.needPath = true; if (b.stuck > 3) { b.arrived = true; b.unreachable = true; b.hasGoal = false } }
        else b.stuck = 0
        b.progT = 0; b.progX = p.x; b.progZ = p.z
      }
    }
  }

  /** Body yaw, aim yaw/pitch and the aim weight. */
  private steer(e: Merc, player: PlayerState, dt: number): void {
    const b = e.brain, p = e.position
    const combat = e.state === "combat"
    let desired = e.yaw
    const speed = hyp(b.vx, b.vz)
    if (b.face) {
      const fx = b.face.x - p.x, fz = b.face.z - p.z
      if (fx * fx + fz * fz > 0.04) desired = yawTo(fx, fz)
      b.aimYaw = desired
    } else if (speed > 0.3) {
      desired = yawTo(b.vx, b.vz)
      b.aimYaw = desired + b.look * 0.3
    } else b.aimYaw = e.yaw + b.look
    // the upper body takes small corrections; larger ones turn the body (turn in place)
    const off = wrapAngle(desired - e.yaw)
    const rate = combat || e.state === "flee" ? 5.5 : e.state === "suspicious" ? 4 : 2.8
    const before = e.yaw
    if (!(b.face && speed < 0.3 && Math.abs(off) < 0.35)) e.yaw = approachAngle(e.yaw, desired, rate * dt)
    b.turnRate = wrapAngle(e.yaw - before) / Math.max(dt, 1e-4)
    if (b.face && combat && player.active) {
      const dist = Math.max(0.5, hyp(b.face.x - p.x, b.face.z - p.z))
      const headY = e.model ? e.model.head.y : 1.7
      b.aimPitch = Math.atan2(player.eyeY - 0.45 - headY, dist)
    } else b.aimPitch *= 1 - Math.min(1, dt * 3)
    // weapon raised: combat with a target in view, half-raised when searching
    let aim = 0
    if (combat && b.face && (b.sees || this.time - b.lastSeen < 1.5 || b.telegraph > 0 || b.burstLeft > 0)) aim = 1
    else if (combat && b.face) aim = 0.6
    else if (e.state === "search" || (e.state === "investigate" && b.urgent) || e.state === "suspicious") aim = 0.35
    if (combat && b.mode === "cover" && b.coverLow) aim = 0.3
    b.aim = e.state === "flee" ? 0 : aim
  }

  private animate(e: Merc, dt: number, player?: PlayerState): void {
    const b = e.brain, m = e.model!, d = this.drive
    d.velX = b.vx; d.velZ = b.vz; d.yaw = e.yaw; d.turnRate = b.turnRate
    d.crouch = b.crouch ? 1 : 0
    d.aim = b.aim
    d.aimYaw = b.aimYaw; d.aimPitch = b.aimPitch
    d.look = b.face ? 0 : b.look * 0.6
    d.alert = e.state === "patrol" || e.state === "idle" ? (b.floor > 0 ? 0.6 : 0) : 1
    e.group.rotation.y = e.yaw
    m.update(dt, d)
    e.group.updateMatrixWorld(true)
    m.capture()
    m.tick(dt)
    // awareness mark
    let mark: "" | "?" | "!" = ""
    if (e.state === "combat") mark = b.alertT > 0 ? "!" : ""
    else if (e.state === "suspicious" || e.state === "investigate" || e.state === "search") mark = "?"
    const dist = player ? hyp(player.position.x - e.position.x, player.position.z - e.position.z) : 20
    m.setIndicator(player && player.active ? mark : "", clamp(dist * 0.016, 0.42, 1.1))
    if (b.telegraph > 0 && player) {
      _t.set(player.position.x, player.eyeY - 0.45, player.position.z)
      m.setLaser(true, m.muzzle.distanceTo(_t))
    } else m.setLaser(false)
    // night weapon light: stop the beam at walls and the ground (10 Hz)
    b.lightT -= dt
    if (b.lightT <= 0 && m.lightRay(_a, _b)) {
      b.lightT = 0.1
      let reach = 9
      if (_b.y < -1e-3) reach = Math.min(reach, _a.y / -_b.y)
      const hit = this.world.collision.raycast(_a, _b, reach)
      m.setLightReach(hit ? hit.distance : reach + 1)
    }
  }

  // ================================================================ senses from raid

  hearNoise(pos: Vec3, radius: number): void {
    if (!this.playerActive || radius <= 0) return
    if (radius >= 15 && hyp(pos.x - this.playerPos.x, pos.z - this.playerPos.z) < 2.5) this.lastShotAt = this.time
    const loud = radius >= 15
    for (const e of this.enemies) {
      if (!e.alive || e.state === "flee") continue
      const d = hyp(e.position.x - pos.x, e.position.z - pos.z)
      if (d > radius) continue
      // tall walls in between muffle the sound
      if (d > radius * 0.6 && this.world.collision.segmentBlocked2D(e.position.x, e.position.z, pos.x, pos.z, 2.2)) continue
      const b = e.brain
      if (e.state === "combat") {
        if (!b.sees && loud) { b.known.x = pos.x; b.known.z = pos.z; b.knownT = this.time }
        continue
      }
      b.lastStimulus = this.time
      const intensity = 1 - d / radius, err = d * 0.08
      const tx = pos.x + (this.rng() - 0.5) * 2 * err, tz = pos.z + (this.rng() - 0.5) * 2 * err
      b.known = { x: tx, z: tz }
      if (loud) {
        e.awareness = Math.max(e.awareness, 0.55 + 0.35 * intensity)
        this.investigate(e, b.known, true)
      } else {
        e.awareness = Math.min(0.9, Math.max(e.awareness, e.awareness + 0.15 + 0.3 * intensity))
        if (e.state === "patrol" || e.state === "idle") this.setSuspicious(e)
        else if (e.state === "investigate" || e.state === "search") { if (!b.urgent) this.investigate(e, b.known, false) }
      }
    }
  }

  // ================================================================ hits, damage, gore

  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): HostileHit | null {
    let best: Merc | null = null, bestT = maxDist, bestPart: HitPart = "body", bestBody: BodyPartId = "torso"
    for (const e of this.enemies) {
      if (!e.alive || !e.model) continue
      const m = e.model, p = e.position, s = m.scale
      // cheap bounding-sphere reject, then the posed zones (severed parts are skipped by the model)
      if (raySphereT(origin, dir, p.x, p.y + 0.95 * s, p.z, 1.3 * s, bestT) < 0) continue
      const r = m.rayTest(origin, dir, bestT)
      if (r && r.t < bestT) { bestT = r.t; best = e; bestPart = r.part; bestBody = r.bodyPart }
    }
    if (!best) return null
    return { target: best, distance: bestT, part: bestPart, bodyPart: bestBody, point: origin.clone().addScaledVector(dir, bestT) }
  }

  meleeTest(origin: THREE.Vector3, dir: THREE.Vector3, range: number, arcDeg: number, maxTargets: number): HostileHit[] {
    const out: HostileHit[] = []
    const hl = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / hl, fz = dir.z / hl, cosA = Math.cos(arcDeg / 2 * Math.PI / 180)
    for (const e of this.enemies) {
      if (!e.alive || !e.model) continue
      const dx = e.position.x - origin.x, dz = e.position.z - origin.z, d = hyp(dx, dz)
      if (d > range + 0.4 || d < 1e-3 || (dx * fx + dz * fz) / d < cosA) continue
      // where the swing crosses the target: the aim ray at the target's distance picks the body part
      const t = d / hl
      _t.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t)
      const zone = e.model.nearestZone(_t)
      const point = new THREE.Vector3()
      if (zone.bodyPart === "head") point.copy(e.model.head)
      else if (zone.bodyPart === "torso") point.copy(e.model.chestPos).setY(Math.max(e.model.pelvisPos.y, Math.min(_t.y, e.model.neckBase.y)))
      else point.copy(zone.bodyPart === "armL" ? e.model.elbowLPos : zone.bodyPart === "armR" ? e.model.elbowRPos : zone.bodyPart === "legL" ? e.model.kneeLPos : e.model.kneeRPos)
      out.push({ target: e, distance: d, part: zone.part, bodyPart: zone.bodyPart, point })
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, maxTargets)
  }

  inRadius(center: Vec3, radius: number): Hostile[] {
    return this.enemies.filter(e => e.alive && hyp(e.position.x - center.x, e.position.z - center.z) <= radius)
  }

  applyDamage(hit: HostileHit, dmg: DamageInfo): DamageResult {
    const e = hit.target as Merc
    const res: DamageResult = { killed: false, dealt: 0, severed: null, headshotKill: false }
    if (!e.alive || e.faction !== "merc" || !e.model) return res
    const def = ENEMIES[e.kind], gore = this.gore, brutal = gore.level === "brutal", b = e.brain
    const armor = hit.part === "body" ? def.armor * (1 - clamp(dmg.penetration, 0, 1)) : 0
    const dealt = Math.max(0, dmg.amount * (1 - armor))
    res.dealt = dealt
    e.health -= dealt
    b.lastCause = dmg.kind
    gore.wound(hit.point, dmg.dir, dealt, { color: e.gore.bloodColor })
    // horizontal direction the hit pushes (bullet direction, else away from the attacker)
    let fx = dmg.dir.x, fz = dmg.dir.z, fl = hyp(fx, fz)
    if (fl < 1e-4) { fx = e.position.x - dmg.from.x; fz = e.position.z - dmg.from.z; fl = hyp(fx, fz) || 1 }
    fx /= fl; fz /= fl
    // dismemberment (GORE_RULES; brutal only, so poses stay intact otherwise)
    if (brutal && hit.part === "limb" && isLimb(hit.bodyPart) && !e.gore.severed.has(hit.bodyPart)) {
      const limb = hit.bodyPart
      e.limbDamage[limb] += dealt
      if (e.limbDamage[limb] >= GORE_RULES.limbHealth * e.maxHealth || (dmg.sever > 0 && this.rng() < dmg.sever)) {
        this.sever(e, limb, dmg)
        res.severed = limb
      }
    }
    if (brutal && hit.part === "head" && !e.gore.severed.has("head") && (dealt >= GORE_RULES.headBurst || (e.health <= 0 && dealt >= 0.6 * e.maxHealth))) {
      gore.headshot(e.model.parts.head, dmg.dir, { color: e.gore.bloodColor, heavy: true })
      e.gore.severed.add("head")
      e.model.showStump("head")
      res.severed = res.severed ?? "head"
      e.health = Math.min(e.health, 0)
    }
    // a lost leg: the merc collapses and dies
    if (res.severed === "legL" || res.severed === "legR") e.health = Math.min(e.health, 0)
    if (e.health <= 0) {
      this.kill(e, fx, fz, dmg.kind, hit.part)
      res.killed = true
      res.headshotKill = hit.part === "head"
      return res
    }
    b.damageSinceCover += dealt
    b.known.x = dmg.from.x; b.known.z = dmg.from.z; b.knownT = this.time; b.lastStimulus = this.time
    e.model.hit(fx, fz, hit.part === "head" ? 1.4 : hit.part === "limb" ? 0.7 : 1)
    if (this.time > b.painT) { b.painT = this.time + 0.6; this.events.sound?.(e, "pain") }
    if (res.severed === "armL" || res.severed === "armR") this.loseArm(e, fx, fz)
    else if (e.state !== "combat") this.enterCombat(e)
    return res
  }

  /** Detach a limb through the gore system (brutal only) and mark it severed (hit tests and the pose ignore it). */
  private sever(e: Merc, part: Limb, dmg: DamageInfo): void {
    const k = 2.5 + Math.min(10, dmg.amount * 0.05)
    _imp.x = dmg.dir.x * k; _imp.y = 1.6 + this.rng() * 1.2; _imp.z = dmg.dir.z * k
    this.gore.sever(e.model!.parts[part], _imp, { color: e.gore.bloodColor, heavy: true })
    e.gore.severed.add(part)
    e.model!.showStump(part)
    this.events.sound?.(e, "scream")
  }

  /** Lost an arm: the weapon falls, the merc stops fighting and runs away screaming until he bleeds out. */
  private loseArm(e: Merc, fx: number, fz: number): void {
    const b = e.brain
    e.model!.dropWeapon(fx, fz)
    this.releaseCover(e)
    if (this.flanker === e) this.flanker = null
    e.state = "flee"; e.awareness = 1
    b.burstLeft = 0; b.telegraph = 0; b.face = null; b.crouch = false
    b.screamT = 1
    this.stop(e)
  }

  applyExplosion(center: Vec3, radius: number, maxDamage: number): Hostile[] {
    const killed: Hostile[] = []
    const brutal = this.gore.level === "brutal", col = this.world.collision
    _c.set(center.x, center.y + 0.5, center.z)
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = hyp(e.position.x - center.x, e.position.z - center.z)
      if (d > radius) continue
      e.chestPosition(_t)
      if (col.segmentBlocked3D(_c, _t)) continue
      const dmg = maxDamage * (1 - d / radius)
      e.health -= dmg
      e.brain.lastCause = "explosion"
      let dx = e.position.x - center.x, dz = e.position.z - center.z
      const l = hyp(dx, dz)
      if (l < 1e-3) { dx = Math.sin(e.yaw); dz = Math.cos(e.yaw) } else { dx /= l; dz /= l }
      _imp.x = dx; _imp.y = 0.35; _imp.z = dz
      this.gore.wound(_t, _imp, dmg, { color: e.gore.bloodColor, heavy: dmg > 60 })
      if (e.health <= 0) {
        const gib = brutal && d < GORE_RULES.gibRadius
        if (gib) this.gore.gib(e.group, center, 6 + maxDamage * (1 - d / radius) * 0.06, { color: e.gore.bloodColor })
        this.kill(e, dx, dz, "explosion", "body", gib)
        killed.push(e)
        continue
      }
      e.model?.hit(dx, dz, 1.5)
      const b = e.brain
      b.damageSinceCover += dmg
      if (this.time > b.painT) { b.painT = this.time + 0.6; this.events.sound?.(e, "pain") }
      if (e.state !== "combat" && e.state !== "flee") {
        e.awareness = Math.max(e.awareness, 0.9)
        b.known = { x: this.playerPos.x, z: this.playerPos.z }; b.knownT = this.time
        this.investigate(e, { x: center.x, z: center.z }, true)
      }
    }
    return killed
  }

  private kill(e: Merc, dx: number, dz: number, cause: DamageInfo["kind"], part: HitPart, gibbed = false): void {
    e.health = Math.min(e.health, 0); e.alive = false; e.state = "dead"; e.awareness = 0
    const b = e.brain
    this.releaseCover(e)
    if (this.flanker === e) this.flanker = null
    b.burstLeft = 0; b.telegraph = 0; b.vx = 0; b.vz = 0; b.hasGoal = false
    const p = e.position
    if (gibbed) { b.gibbed = true; e.model?.gibbed(); e.group.visible = false }
    else {
      // fall away from the hit, but not into a wall: try rotated directions until 1.9 m of floor are free
      let fx = dx, fz = dz
      for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
        const c = Math.cos(a), s = Math.sin(a), rx = dx * c - dz * s, rz = dx * s + dz * c
        if (!this.world.collision.segmentBlocked2D(p.x + rx * 0.3, p.z + rz * 0.3, p.x + rx * 1.95, p.z + rz * 1.95, 0.25)) { fx = rx; fz = rz; break }
      }
      e.model?.die(fx, fz)
    }
    this.gore.pool(p, 1, { color: e.gore.bloodColor })
    if (!e.gore.severed.has("head") && !gibbed) this.events.sound?.(e, "death")
    this.events.died(e, cause, part)
    // nearby comrades notice the fallen one
    if (!this.playerActive) return
    for (const o of this.enemies) {
      if (!o.alive || o.state === "combat" || o.state === "flee") continue
      const d = hyp(o.position.x - p.x, o.position.z - p.z)
      if (d > 14) continue
      o.awareness = Math.max(o.awareness, 0.7)
      o.brain.known = { x: p.x, z: p.z }; o.brain.lastStimulus = this.time
      this.investigate(o, o.brain.known, true)
    }
  }

  aliveCount(): number { return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) }
  /** Number of living mercs currently in combat (drives music/ambience intensity). */
  combatCount(): number { return this.enemies.reduce((n, e) => n + (e.alive && e.state === "combat" ? 1 : 0), 0) }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const e of this.enemies) { this.parent.remove(e.group); e.model?.dispose() }
    this.enemies.length = 0
    this.coverClaims.clear()
    releaseSoldierAssets()
  }
}

// ---------------------------------------------------------------- helpers

function hyp(x: number, z: number): number { return Math.sqrt(x * x + z * z) }
function cellKey(cx: number, cz: number): number { return (cx + 32768) * 65536 + (cz + 32768) }
/** Ray vs. sphere entry distance (−1 = miss), allocation-free bounding test. */
function raySphereT(o: Vec3, d: Vec3, cx: number, cy: number, cz: number, r: number, maxT: number): number {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c
  if (disc < 0) return -1
  const s = Math.sqrt(disc)
  let t = -b - s
  if (t < 0) t = -b + s
  return t < 0 || t > maxT ? -1 : t
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _aim = new THREE.Vector3()
const _imp = { x: 0, y: 0, z: 0 }
// reused inputs for the per-frame perception formulas (no allocations in the hot path)
const _detect: DetectionInput = { distance: 0, range: 0, crouched: false, sprinting: false, shooting: false, moving: false, night: false, flashlight: false, peripheral: false, partial: false, alerted: false }
const _vision: VisionInput = { vision: 0, visionScale: 1, night: false, flashlight: false, crouched: false, shooting: false }
const _p: Vec2 = { x: 0, z: 0 }, _q: Vec2 = { x: 0, z: 0 }
const TURNS = [0.6, -0.6, 1.1, -1.1]
