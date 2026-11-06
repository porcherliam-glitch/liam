// Zombie AI: perception (sight and hearing), wandering, investigating, chasing with path-finding, attacks,
// stagger and death. Bosses add abilities (summon, charge, leap, slam, plague) and phases.

import * as THREE from "three"
import { cosmetic } from "../core/rng"
import type { EntityContext } from "./context"
import type { ZombieTypeDef } from "../core/types"
import { buildHumanoid, disposeHumanoid, type Appearance, type Humanoid } from "../render/humanoid"
import { Animator, CRAWL_REMAP } from "../render/animator"
import { buildShield, buildWeapon } from "../render/weaponModels"
import { angleDelta, clamp, turnToward } from "../core/math"
import { staggers } from "./combat"
import { events } from "../core/events"
import { Rng } from "../core/rng"
import { M } from "../render/materials"

type State = "idle" | "wander" | "investigate" | "chase" | "attack" | "stagger" | "dead" | "ability"

let zombieCounter = 0

export class Zombie {
  readonly id = ++zombieCounter
  pos = new THREE.Vector3()
  yaw = 0
  hp: number
  maxHp: number
  state: State = "idle"
  dead = false
  sleeping = false
  readonly group = new THREE.Group()
  humanoid: Humanoid
  readonly animator: Animator
  private ctx!: EntityContext
  private rng: Rng
  private stateTimer = 0
  private wanderTarget: { x: number; z: number } | null = null
  private investigateTarget: { x: number; z: number } | null = null
  private lastKnown: { x: number; z: number } | null = null
  private path: [number, number][] | null = null
  private pathTimer = 0
  private perceptionTimer = 0
  private attackCooldown = 0
  /** Direction (±1) in which this enemy circles while waiting for an attack token. */
  private circleDir = 1
  private attackHitDone = false
  private groanTimer = 0
  private walkPhase = 0
  private deathTimer = 0
  /** Last hit, used to pick how the body comes apart. */
  private lastHit = { dx: 0, dz: 1, crit: false, heavy: false, overkill: 0 }
  private pooled = false
  private dripTimer = 0
  private lostArm = false
  /** Lost a leg: drags itself along on the belly, slower and lower. */
  crawling = false
  /** Where the last blow landed: a head hit decides how the body comes apart. */
  private lastHitZone: HitZone = "body"
  /** Arrows and bolts stuck in the body (they stay on the corpse and go with it). */
  private stuck: THREE.Object3D[] = []
  private mutilations = 0
  private animAcc = 0
  private animFrame = 0
  private castsShadow = true
  private alert = 0
  private abilityCooldowns: Record<string, number> = {}
  private ability: string | null = null
  private abilityTimer = 0
  private chargeDir = { x: 0, z: 0 }
  private blocking = false
  private lungeTimer = 0
  private separationTimer = 0
  private sepX = 0
  private sepZ = 0
  private weaponMesh: THREE.Object3D | null = null
  private stuckTimer = 0
  private lastPos = { x: 0, z: 0 }
  private flashTimer = 0
  phase = 1
  /** Expedition time of the last hit taken (HUD health bars). */
  lastHitAt = -100
  readonly radius: number
  /** Marks special enemies for purge missions. */
  special = false
  /** Dev: frozen zombies only animate (model line-ups). */
  frozen = false
  lootDropped = false
  private eyes: THREE.Mesh
  private telegraph: THREE.Mesh

  constructor(public type: ZombieTypeDef, x: number, z: number, seed: number) {
    this.rng = new Rng(seed)
    this.hp = this.maxHp = type.hp
    this.pos.set(x, 0, z)
    this.yaw = this.rng.range(0, Math.PI * 2)
    this.radius = 0.4 * type.scale
    this.humanoid = buildHumanoid(this.appearance(seed))
    this.group.add(this.humanoid.root)
    this.animator = new Animator(this.humanoid)
    this.animator.play(this.type.kind === "knight" || this.type.id.includes("castellan") || this.type.id.includes("marshal") ? "combat_idle" : "z_idle")
    this.animator.ctx.time = this.rng.range(0, 10)
    // Weapons for armed types
    if (type.abilities?.includes("sword")) {
      this.weaponMesh = buildWeapon(type.kind === "boss" ? "longsword_4" : "longsword_2")
      this.humanoid.handR.add(this.weaponMesh)
    }
    if (type.abilities?.includes("block")) {
      const sh = buildShield(type.kind === "boss" ? "tower" : "kite")
      sh.position.set(-0.08, 0.12, 0.06)
      sh.rotation.set(0, -Math.PI / 2 + 0.3, 0)
      this.humanoid.handL.add(sh)
    }
    // Glowing eyes
    this.eyes = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.02), M.glow(type.kind === "boss" ? 0xff4020 : 0xd0ff60, 2))
    this.eyes.position.set(0, 0.14, 0.11)
    this.humanoid.bones.head.add(this.eyes)
    // Ground ring that appears while an attack winds up (readable telegraphs)
    const r = type.attackRange + 0.4
    this.telegraph = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 28), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }))
    this.telegraph.rotation.x = -Math.PI / 2
    this.telegraph.position.y = 0.06
    this.telegraph.visible = false
    this.group.add(this.telegraph)
    this.group.position.copy(this.pos)
  }

  private appearance(seed: number): Partial<Appearance> {
    const t = this.type
    const rng = new Rng(seed ^ 0x5151)
    // Individual variation: height, hair, worn clothes
    const base: Partial<Appearance> = { undead: true, seed, scale: t.scale * rng.range(0.94, 1.06), skin: parseInt(t.color.slice(1), 16), hair: rng.pick([0x2a1a10, 0x4a3a2a, 0x6a5a40, 0x8a8070, 0x1a1410]) }
    switch (t.id) {
      case "walker":
        return { ...base, shirt: rng.pick([0x9a8a5a, 0x6a8a9a, 0x8a6a4a, 0xa89a6a, 0x7a8a6a]), pants: rng.pick([0x5a4a38, 0x4a4a52, 0x6a5a48]), female: rng.chance(0.35), helmet: rng.chance(0.2) ? "hood" : "none" }
      case "walker_villager":
        return { ...base, shirt: rng.pick([0xa05050, 0x5a7aa0, 0x9a9a4a, 0x8a5a8a]), pants: 0x7a6a7a, female: true, robe: rng.chance(0.6) }
      case "walker_monk":
        return { ...base, shirt: 0x7a5a3a, pants: 0x7a5a3a, helmet: "hood", robe: true }
      case "walker_soldier":
        return { ...base, shirt: 0x8a8a6a, pants: 0x5a5a5a, armor: rng.chance(0.5) ? "gambeson" : "chain", helmet: rng.chance(0.7) ? "kettle" : "nasal" }
      case "sprinter":
        return { ...base, shirt: 0xb08060, pants: 0x5a4040, bulk: 0.85, female: rng.chance(0.3) }
      case "sprinter_hound":
        return { ...base, shirt: 0xb05050, pants: 0x4a2a2a, bulk: 0.9, helmet: "none" }
      case "brute":
        return { ...base, shirt: 0x6a6a4a, pants: 0x4a4a30, bulk: 1.7, armor: "rags" }
      case "brute_butcher":
        return { ...base, shirt: 0x8a3a3a, pants: 0x4a4a30, bulk: 1.75, armor: "leather" }
      case "knight":
        return { ...base, armor: "plate", helmet: rng.chance(0.6) ? "bascinet" : "great", armored: true, shirt: 0x3a3a4a }
      case "knight_captain":
        return { ...base, armor: "plate", helmet: "great", armored: true, shirt: 0x4a2a2a, bulk: 1.1 }
      case "boss_elder":
        return { ...base, shirt: 0x4a6a4a, pants: 0x3a3a3a, bulk: 1.4, boss: "elder", robe: true }
      case "boss_huntsman":
        return { ...base, shirt: 0x6a4a2a, pants: 0x4a3a1a, bulk: 1.0, armor: "leather", helmet: "hood", boss: "huntsman" }
      case "boss_castellan":
        return { ...base, armor: "plate", helmet: "great", armored: true, bulk: 1.3, boss: "castellan" }
      case "boss_gravedigger":
        return { ...base, shirt: 0x5a5a3a, pants: 0x3a3a2a, bulk: 1.6, armor: "rags", boss: "gravedigger" }
      case "boss_abbot":
        return { ...base, shirt: 0x3a2a2a, pants: 0x3a2a2a, helmet: "hood", bulk: 1.1, boss: "abbot", robe: true }
      case "boss_bonelord":
        return { ...base, armor: "chain", helmet: "none", armored: true, bulk: 1.3, skin: 0xb0a890, skinTexture: "bone", boss: "bonelord" }
      case "boss_queen":
        return { ...base, shirt: 0x6a2a6a, pants: 0x4a1a4a, bulk: 1.0, hair: 0x101010, boss: "queen", female: true, robe: true }
      case "boss_marshal":
        return { ...base, armor: "plate", helmet: "great", armored: true, bulk: 1.5, boss: "marshal" }
      default:
        return base
    }
  }

  bind(ctx: EntityContext): void {
    this.ctx = ctx
    const diff = ctx.settings.difficulty
    this.maxHp = Math.round(this.type.hp * (diff === "easy" ? 0.8 : diff === "hard" ? 1.25 : 1))
    this.hp = this.maxHp
    this.pos.y = ctx.world.terrain.heightAt(this.pos.x, this.pos.z)
    ctx.scene.add(this.group)
    this.group.position.copy(this.pos)
    this.perceptionTimer = this.rng.range(0, 0.3)
    // Old wounds: blood-soaked clothes, now and then a missing arm
    ctx.gore.stain(this.humanoid, this.rng.range(0.08, 0.28))
    if (!this.isBoss && this.type.kind !== "knight" && this.rng.chance(0.12)) {
      this.lostArm = true
      ctx.gore.amputate(this.humanoid, this.rng.chance(0.5) ? "armL" : "armR")
    }
    if (this.canCrawl && ctx.gore.enabled && this.rng.chance(0.06)) {
      ctx.gore.amputate(this.humanoid, this.rng.chance(0.5) ? "legL" : "legR")
      this.startCrawling()
    }
    this.circleDir = this.rng.chance(0.5) ? 1 : -1
    this.groanTimer = this.rng.range(3, 12)
    this.lastPos = { x: this.pos.x, z: this.pos.z }
    // Apply the idle pose once so distant (sleeping) zombies never show the bind pose.
    this.animator.update(0.001)
    this.group.rotation.y = this.yaw
  }

  get isBoss(): boolean {
    return this.type.kind === "boss"
  }

  private get damageScale(): number {
    const d = this.ctx.settings.difficulty
    return d === "easy" ? 0.75 : d === "hard" ? 1.3 : 1
  }

  get alerted(): boolean {
    return this.state === "chase" || this.state === "attack" || this.state === "ability"
  }

  // ---- perception ---------------------------------------------------------------------------

  /** Reacts to a noise event. */
  onNoise(x: number, z: number, radius: number): void {
    if (this.dead || this.sleeping) return
    const d = Math.hypot(x - this.pos.x, z - this.pos.z)
    const hearing = this.type.hearing * (1 - this.ctx.player.skills.stealth * 0.5)
    if (d > radius * (hearing / 18)) return
    if (this.alerted) {
      this.lastKnown = { x, z }
      return
    }
    this.investigateTarget = { x, z }
    if (this.state !== "stagger") this.setState("investigate")
    this.alert = Math.max(this.alert, 0.5)
  }

  private canSeePlayer(): boolean {
    const ctx = this.ctx
    const p = ctx.player
    if (p.dead) return false
    const dx = p.pos.x - this.pos.x
    const dz = p.pos.z - this.pos.z
    const d = Math.hypot(dx, dz)
    const night = ctx.sky.state.daylight
    const vis = ctx.weather.visibility * (0.55 + 0.45 * night) * (ctx.world.underground ? 0.7 : 1)
    let sight = this.type.sight * vis * (1 - p.skills.stealth)
    if (this.alerted) sight *= 1.6
    if (p.sprinting) sight *= 1.2
    if (p.carriesTorch) sight = Math.max(sight, this.type.sight * 1.3)
    if (d > sight) return false
    // Field of view: 130 degrees, except when very close
    if (d > 2.5) {
      const ang = Math.abs(angleDelta(this.yaw, Math.atan2(dx, dz)))
      if (ang > (this.alerted ? 1.6 : 1.15)) return false
    }
    return !ctx.world.collision.blocked(this.pos.x, this.pos.z, p.pos.x, p.pos.z, this.pos.y + 1.4, "player")
  }

  private setState(s: State): void {
    if (this.state === s) return
    this.state = s
    this.stateTimer = 0
    this.path = null
    if (s === "chase" && this.alert < 1) {
      this.alert = 1
      this.ctx.audio.play(this.isBoss ? "boss_roar" : this.type.kind === "brute" ? "brute_roar" : "zombie_alert", { x: this.pos.x, y: this.pos.y, z: this.pos.z, pitch: 0.8 + this.rng.range(0, 0.4) })
      // Wake the neighbours
      for (const z of this.ctx.zombies) {
        if (z === this || z.dead || z.alerted) continue
        if (Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z) < 12) z.onNoise(this.ctx.player.pos.x, this.ctx.player.pos.z, 30)
      }
    }
  }

  // ---- update -------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx
    if (this.dead) {
      this.deathTimer += dt
      this.animator.update(dt)
      if (!this.pooled && this.deathTimer > 1.1) {
        // A pool of blood spreads under the corpse once it lies on the ground
        this.pooled = true
        ctx.gore.pool(this.pos.x + this.lastHit.dx * 0.6, this.pos.z + this.lastHit.dz * 0.6, (this.isBoss ? 3.2 : this.type.kind === "brute" ? 2.6 : 1.9) * this.type.scale)
      }
      if (this.deathTimer > 40) {
        // sink into the ground
        this.group.position.y = this.pos.y - (this.deathTimer - 40) * 0.25
      }
      return
    }
    const p = ctx.player
    const dx = p.pos.x - this.pos.x
    const dz = p.pos.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    if (this.frozen) {
      this.animator.update(dt)
      this.group.position.copy(this.pos)
      this.group.rotation.y = this.yaw
      return
    }
    // Far away and not alerted: sleep (cheap update)
    this.sleeping = dist > 95 && !this.alerted
    if (this.sleeping) {
      this.group.visible = dist < 140
      return
    }
    this.group.visible = true
    this.stateTimer += dt
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) this.humanoid.clothMaterial.emissive.setHex(0x000000)
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    for (const k of Object.keys(this.abilityCooldowns)) this.abilityCooldowns[k] = Math.max(0, this.abilityCooldowns[k] - dt)
    this.perceptionTimer -= dt
    if (this.perceptionTimer <= 0) {
      this.perceptionTimer = 0.25
      if (this.state !== "stagger" && this.state !== "attack" && this.state !== "ability") {
        if (this.canSeePlayer()) {
          this.lastKnown = { x: p.pos.x, z: p.pos.z }
          if (!this.alerted) this.setState("chase")
        } else if (this.state === "chase" && this.stateTimer > 1 && this.lastKnown && Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) < 2) {
          // Lost the player at the last known position
          this.alert = 0.4
          this.investigateTarget = { x: this.lastKnown.x + this.rng.range(-6, 6), z: this.lastKnown.z + this.rng.range(-6, 6) }
          this.setState("investigate")
        }
      }
      if (this.alerted && dist > 60 && !this.isBoss) {
        this.alert = 0
        this.setState("wander")
      }
    }
    this.groanTimer -= dt
    if (this.groanTimer <= 0) {
      this.groanTimer = this.rng.range(4, 14)
      if (dist < 40) ctx.audio.play("zombie_groan", { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, pitch: this.type.kind === "brute" || this.isBoss ? 0.6 : 0.85 + this.rng.range(0, 0.4), volume: 0.6 })
    }
    this.alert = Math.max(0, this.alert - dt * 0.02)
    this.blocking = false
    let moveSpeed = 0
    let targetX = 0
    let targetZ = 0
    let wantMove = false
    let holdRing = false
    switch (this.state) {
      case "idle":
        if (this.stateTimer > this.rng.range(2, 6)) this.setState("wander")
        break
      case "wander": {
        if (!this.wanderTarget) {
          const a = this.rng.range(0, Math.PI * 2)
          const r = this.rng.range(4, 14)
          const wx = this.pos.x + Math.cos(a) * r
          const wz = this.pos.z + Math.sin(a) * r
          if (!ctx.world.nav.isBlockedWorld(wx, wz) && Math.max(Math.abs(wx), Math.abs(wz)) < ctx.world.area.size * 0.9) this.wanderTarget = { x: wx, z: wz }
        }
        if (this.wanderTarget) {
          targetX = this.wanderTarget.x
          targetZ = this.wanderTarget.z
          wantMove = true
          moveSpeed = this.type.wanderSpeed
          if (Math.hypot(targetX - this.pos.x, targetZ - this.pos.z) < 1 || this.stateTimer > 20) {
            this.wanderTarget = null
            this.setState("idle")
          }
        } else if (this.stateTimer > 2) this.setState("idle")
        break
      }
      case "investigate": {
        const t = this.investigateTarget
        if (!t) {
          this.setState("idle")
          break
        }
        targetX = t.x
        targetZ = t.z
        wantMove = true
        moveSpeed = this.type.kind === "sprinter" ? this.type.speed * 0.6 : this.type.wanderSpeed * 1.6
        if (Math.hypot(targetX - this.pos.x, targetZ - this.pos.z) < 1.5 || this.stateTimer > 25) {
          this.investigateTarget = null
          this.setState("idle")
        }
        break
      }
      case "chase": {
        const lk = this.lastKnown ?? { x: p.pos.x, z: p.pos.z }
        targetX = lk.x
        targetZ = lk.z
        wantMove = true
        moveSpeed = this.type.speed * (this.phase >= 2 ? 1.15 : 1)
        if (this.lungeTimer > 0) {
          this.lungeTimer -= dt
          moveSpeed *= 1.5
        } else if (this.type.kind === "sprinter" && dist < 7 && dist > 3 && this.rng.chance(dt * 0.8)) {
          this.lungeTimer = 0.6
          ctx.audio.play("zombie_alert", { x: this.pos.x, y: 1, z: this.pos.z, pitch: 1.3, volume: 0.6 })
        }
        // Attack when in range and facing. Only a few enemies may swing at once (attack tokens), the
        // rest hold position at arm's length so groups stay readable instead of a damage pile.
        if (dist < this.type.attackRange + p.height * 0.1 && this.attackCooldown <= 0 && !p.dead) {
          const ang = Math.abs(angleDelta(this.yaw, Math.atan2(dx, dz)))
          if (ang >= 0.6) this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), dt * 7)
          else if (this.isBoss || this.attackTokenFree()) this.startAttack()
          else this.attackCooldown = this.rng.range(0.15, 0.45)
        }
        // Waiting for a turn (denied token or own cooldown): hold arm's length instead of pushing in
        if (!this.isBoss && this.attackCooldown > 0 && dist < this.type.attackRange + 0.6) holdRing = true
        // Abilities
        if (this.state === "chase") this.tryAbility(dist, dx, dz)
        // Knights raise the shield while approaching the player head-on
        if (this.type.abilities?.includes("block") && dist < 4.5 && dist > this.type.attackRange && p.state === "attacking") this.blocking = true
        break
      }
      case "attack": {
        const prog = this.animator.progress
        // Face the player during the wind-up
        if (prog < 0.4) this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), dt * 6)
        const hitAt = this.type.kind === "brute" ? 0.55 : 0.5
        if (!this.attackHitDone && prog >= hitAt) {
          this.attackHitDone = true
          this.landAttack(dist, dx, dz)
        }
        if (this.animator.finished) {
          this.attackCooldown = this.type.attackCooldown * (this.phase >= 3 ? 0.7 : 1)
          this.setState("chase")
        }
        break
      }
      case "ability": {
        this.updateAbility(dt, dist, dx, dz)
        break
      }
      case "stagger":
        if (this.animator.finished) this.setState(this.alert > 0.5 ? "chase" : "idle")
        break
    }

    // ---- steering and movement ----
    let moved = 0
    if (this.crawling) moveSpeed *= this.type.kind === "sprinter" ? 0.45 : 0.55
    if (holdRing) {
      // Keep arm's length and drift sideways around the player, always facing them; the group stays readable
      moveSpeed = this.type.wanderSpeed * (this.crawling ? 0.55 : 1)
      const ring = this.type.attackRange + 0.1
      const ax = dist > 0.01 ? (this.pos.x - p.pos.x) / dist : -Math.sin(this.yaw)
      const az = dist > 0.01 ? (this.pos.z - p.pos.z) / dist : -Math.cos(this.yaw)
      let mx: number
      let mz: number
      if (dist < ring - 0.2) {
        mx = ax
        mz = az
      } else if (dist > ring + 0.3) {
        mx = -ax
        mz = -az
      } else {
        mx = az * this.circleDir
        mz = -ax * this.circleDir
      }
      this.updateSeparation(dt)
      mx += this.sepX * 1.5
      mz += this.sepZ * 1.5
      const ml = Math.hypot(mx, mz) || 1
      moved = this.tryMove((mx / ml) * moveSpeed * dt, (mz / ml) * moveSpeed * dt)
      this.walkPhase += (moved / 0.7) * Math.PI
      this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), dt * 5)
    } else if (wantMove && moveSpeed > 0) {
      let dirX = targetX - this.pos.x
      let dirZ = targetZ - this.pos.z
      const tdist = Math.hypot(dirX, dirZ)
      // Pathfinding when the direct line is blocked
      const direct = tdist < 3 || !ctx.world.collision.blocked(this.pos.x, this.pos.z, targetX, targetZ, this.pos.y + 0.8, "player")
      if (!direct) {
        this.pathTimer -= dt
        if ((!this.path || this.pathTimer <= 0) && ctx.world.nav.budgetLeft) {
          this.pathTimer = this.state === "chase" ? 1.1 : 2.5
          this.path = ctx.world.nav.findPath(this.pos.x, this.pos.z, targetX, targetZ)
        }
        if (this.path && this.path.length) {
          const wp = this.path[0]
          dirX = wp[0] - this.pos.x
          dirZ = wp[1] - this.pos.z
          if (Math.hypot(dirX, dirZ) < 0.9) this.path.shift()
        }
      } else this.path = null
      const len = Math.hypot(dirX, dirZ)
      if (len > 0.05) {
        dirX /= len
        dirZ /= len
        this.updateSeparation(dt)
        const sx = dirX + this.sepX * 1.5
        const sz = dirZ + this.sepZ * 1.5
        const sl = Math.hypot(sx, sz) || 1
        const wantYaw = Math.atan2(sx / sl, sz / sl)
        this.yaw = turnToward(this.yaw, wantYaw, dt * (this.type.kind === "sprinter" ? 9 : 5))
        // Move along the facing direction (zombies do not strafe)
        const faceDot = Math.cos(angleDelta(this.yaw, wantYaw))
        const sp = moveSpeed * Math.max(0.3, faceDot)
        moved = this.tryMove(Math.sin(this.yaw) * sp * dt, Math.cos(this.yaw) * sp * dt)
        // Crawlers drag a smear of blood behind them, wounded enemies leave drips
        if (this.crawling && moved > 0.001) {
          this.dripTimer -= dt
          if (this.dripTimer <= 0) {
            this.dripTimer = 0.3
            ctx.gore.smear(this.pos.x - Math.sin(this.yaw) * 0.5, this.pos.z - Math.cos(this.yaw) * 0.5, Math.sin(this.yaw), Math.cos(this.yaw))
          }
        } else if (this.hp < this.maxHp * 0.6 && moved > 0.001) {
          this.dripTimer -= dt
          if (this.dripTimer <= 0) {
            this.dripTimer = this.hp < this.maxHp * 0.3 ? 0.25 : 0.55
            ctx.gore.drip(this.pos.x, this.pos.z)
          }
        }
        const before = this.walkPhase
        this.walkPhase += (moved / (this.type.kind === "sprinter" ? 1.0 : 0.7)) * Math.PI
        // A footstep each half cycle when close to the player (heavy for brutes)
        if (dist < 14 && Math.floor(before / Math.PI) !== Math.floor(this.walkPhase / Math.PI)) {
          ctx.audio.play(this.type.kind === "brute" || this.isBoss ? "hit_blunt" : "footstep", { x: this.pos.x, y: this.pos.y, z: this.pos.z, volume: this.type.kind === "brute" || this.isBoss ? 0.35 : 0.25, pitch: this.type.kind === "brute" || this.isBoss ? 0.5 : 0.8 })
        }
        // Stuck detection: repath or pick a new wander target
        this.stuckTimer += dt
        if (this.stuckTimer > 1.5) {
          this.stuckTimer = 0
          if (Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) < 0.4) {
            this.path = null
            this.pathTimer = 0
            if (this.state === "wander") this.wanderTarget = null
            // sidestep
            this.tryMove(Math.cos(this.yaw) * 0.6 * (this.rng.chance(0.5) ? 1 : -1), -Math.sin(this.yaw) * 0.6)
          }
          this.lastPos = { x: this.pos.x, z: this.pos.z }
        }
      }
    }
    this.pos.y = ctx.world.terrain.heightAt(this.pos.x, this.pos.z)

    // ---- animation ----
    const a = this.animator
    const st = this.state
    if (st !== "attack" && st !== "stagger" && st !== "ability") {
      if (this.blocking) a.play("knight_block")
      else if ((wantMove || holdRing) && moved > 0.001) {
        const runSpeed = moveSpeed >= 3.5
        if (this.type.abilities?.includes("sword")) a.play(runSpeed ? "run" : "walk")
        else a.play(runSpeed ? "z_run" : "z_walk")
      } else {
        a.play(this.type.abilities?.includes("sword") ? "combat_idle" : "z_idle")
      }
    }
    a.ctx.phase = this.walkPhase
    a.ctx.speed = clamp(moveSpeed / 4, 0.5, 1.3)
    // Animation and shadow level of detail: far enemies animate at a lower rate and cast no shadows
    this.animAcc += dt
    this.animFrame++
    const every = dist > 60 ? 3 : dist > 32 ? 2 : 1
    if (this.animFrame % every === 0 || st === "attack" || st === "ability") {
      a.update(this.animAcc)
      this.animAcc = 0
    }
    const shadows = dist < 30
    if (shadows !== this.castsShadow && this.humanoid.rig) {
      this.castsShadow = shadows
      for (const m of this.humanoid.rig.meshes) m.castShadow = shadows && !m.userData.noShadow
    }
    // Telegraph: visible during the wind-up of attacks and heavy abilities
    const winding = (st === "attack" && !this.attackHitDone) || (st === "ability" && (this.ability === "slam" || this.ability === "leap" || this.ability === "charge") && !this.attackHitDone)
    this.telegraph.visible = winding
    if (winding) {
      const m = this.telegraph.material as THREE.MeshBasicMaterial
      m.opacity = 0.15 + Math.min(0.35, a.progress * 0.4)
      const sc = this.ability === "slam" ? 2 : this.ability === "leap" ? 1.4 : 1
      this.telegraph.scale.setScalar(sc / this.type.scale)
    }
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw
  }

  /** Separation push away from other zombies, refreshed every few frames. */
  private updateSeparation(dt: number): void {
    this.separationTimer -= dt
    if (this.separationTimer > 0) return
    this.separationTimer = 0.12
    this.sepX = this.sepZ = 0
    for (const z of this.ctx.zombies) {
      if (z === this || z.dead || z.sleeping) continue
      const ox = this.pos.x - z.pos.x
      const oz = this.pos.z - z.pos.z
      const d = Math.hypot(ox, oz)
      const min = this.radius + z.radius + 0.3
      if (d < min && d > 0.001) {
        this.sepX += (ox / d) * (min - d)
        this.sepZ += (oz / d) * (min - d)
      }
    }
  }

  private tryMove(dx: number, dz: number): number {
    const ctx = this.ctx
    const ox = this.pos.x
    const oz = this.pos.z
    const size = ctx.world.area.size * 0.95
    const nx = clamp(ox + dx, -size, size)
    const nz = clamp(oz + dz, -size, size)
    if (ctx.world.terrain.heightAt(nx, nz) < ctx.world.terrain.waterLevel - 0.6) return 0
    const r = ctx.world.collision.resolveCircle(nx, nz, this.radius, this.pos.y, 1.6, "player")
    if (ctx.world.terrain.heightAt(r.x, r.z) - ctx.world.terrain.heightAt(ox, oz) > 1.2) return 0
    this.pos.x = r.x
    this.pos.z = r.z
    // Keep out of the player
    const pdx = this.pos.x - ctx.player.pos.x
    const pdz = this.pos.z - ctx.player.pos.z
    const pd = Math.hypot(pdx, pdz)
    const minD = this.radius + 0.4
    if (pd < minD) {
      if (pd > 0.001) {
        this.pos.x = ctx.player.pos.x + (pdx / pd) * minD
        this.pos.z = ctx.player.pos.z + (pdz / pd) * minD
      } else {
        // Exactly on top of the player (large frame step): step back along the facing direction
        this.pos.x = ctx.player.pos.x - Math.sin(this.yaw) * minD
        this.pos.z = ctx.player.pos.z - Math.cos(this.yaw) * minD
      }
    }
    return Math.hypot(this.pos.x - ox, this.pos.z - oz)
  }

  // ---- attacks -------------------------------------------------------------------------------

  /** Simultaneous attackers allowed on the player (bosses are exempt). */
  static attackTokens(difficulty: "easy" | "normal" | "hard"): number {
    return difficulty === "easy" ? 1 : difficulty === "hard" ? 3 : 2
  }

  private attackTokenFree(): boolean {
    const cap = Zombie.attackTokens(this.ctx.settings.difficulty)
    let busy = 0
    for (const z of this.ctx.zombies) {
      if (z === this || z.dead || z.isBoss) continue
      if (z.state === "attack" || z.state === "ability") busy++
      if (busy >= cap) return false
    }
    return true
  }

  private startAttack(): void {
    this.setState("attack")
    this.attackHitDone = false
    const clip = this.type.kind === "brute" ? "brute_slam" : this.type.abilities?.includes("sword") ? "knight_swing" : this.rng.chance(0.4) ? "z_bite" : "z_attack"
    const speed = this.type.kind === "brute" ? 0.75 / this.type.attackWindup : this.type.abilities?.includes("sword") ? 0.5 / this.type.attackWindup : 0.45 / this.type.attackWindup
    this.animator.play(clip, { restart: true, speed: Math.max(0.6, Math.min(2.2, speed)) })
    this.ctx.audio.play("zombie_attack", { x: this.pos.x, y: 1, z: this.pos.z, pitch: this.type.kind === "brute" ? 0.6 : 1 })
  }

  private landAttack(dist: number, dx: number, dz: number): void {
    const p = this.ctx.player
    const reach = this.type.attackRange + 0.6
    const ang = Math.abs(angleDelta(this.yaw, Math.atan2(dx, dz)))
    if (dist <= reach && ang < 1.1) {
      const dmg = this.type.damage * (this.phase >= 3 ? 1.2 : 1) * this.damageScale
      p.takeDamage(dmg, this.pos.x, this.pos.z, { heavy: this.type.kind === "brute" || this.isBoss, knockback: this.type.kind === "brute" ? 1.5 : 0, plague: this.type.id.includes("hound") || this.type.id.includes("plague"), attacker: this })
    }
    if (this.type.kind === "brute") {
      this.ctx.camera.addShake(dist < 8 ? 0.5 : 0.1)
      this.ctx.particles.dust(this.pos.x + Math.sin(this.yaw) * 1.5, this.pos.y, this.pos.z + Math.cos(this.yaw) * 1.5, 14)
      this.ctx.audio.play("hit_blunt", { x: this.pos.x, y: 0, z: this.pos.z, volume: 0.8 })
    }
  }

  private tryAbility(dist: number, dx: number, dz: number): void {
    const abilities = this.type.abilities
    if (!abilities) return
    const start = (name: string, cooldown: number, clip: string, speed = 1) => {
      this.ability = name
      this.abilityTimer = 0
      this.abilityCooldowns[name] = cooldown
      this.setState("ability")
      this.animator.play(clip, { restart: true, speed })
    }
    const cd = (n: string) => this.abilityCooldowns[n] ?? 0
    if (abilities.includes("charge") && cd("charge") <= 0 && dist > 7 && dist < 22 && this.rng.chance(0.02)) {
      const len = Math.hypot(dx, dz) || 1
      this.chargeDir = { x: dx / len, z: dz / len }
      this.yaw = Math.atan2(dx, dz)
      start("charge", 9, this.type.abilities?.includes("sword") ? "run" : "z_run", 1.3)
      this.ctx.audio.play(this.isBoss ? "boss_roar" : "brute_roar", { x: this.pos.x, y: 1, z: this.pos.z })
      return
    }
    if (abilities.includes("leap") && cd("leap") <= 0 && dist > 5 && dist < 14 && this.rng.chance(0.02)) {
      const len = Math.hypot(dx, dz) || 1
      this.chargeDir = { x: dx / len, z: dz / len }
      this.yaw = Math.atan2(dx, dz)
      start("leap", 8, "leap", 1)
      return
    }
    if (abilities.includes("summon") && this.isBoss && cd("summon") <= 0 && (this.phase >= 2 || this.rng.chance(0.004)) && this.rng.chance(0.03)) {
      start("summon", 22, "roar", 1)
      this.ctx.audio.play("boss_roar", { x: this.pos.x, y: 1, z: this.pos.z })
      return
    }
    if (abilities.includes("plague") && cd("plague") <= 0 && dist < 16 && this.rng.chance(0.015)) {
      start("plague", 12, "roar", 1.4)
      this.ctx.audio.play("plague", { x: this.pos.x, y: 1, z: this.pos.z })
      return
    }
    if (abilities.includes("slam") && this.isBoss && cd("slam") <= 0 && dist < 5 && this.rng.chance(0.02)) {
      start("slam", 7, "brute_slam", 0.9)
      return
    }
  }

  private updateAbility(dt: number, dist: number, dx: number, dz: number): void {
    const ctx = this.ctx
    this.abilityTimer += dt
    const prog = this.animator.progress
    switch (this.ability) {
      case "charge": {
        const sp = this.type.speed * 3.2
        this.tryMove(this.chargeDir.x * sp * dt, this.chargeDir.z * sp * dt)
        this.walkPhase += sp * dt * Math.PI * 0.8
        if (dist < this.radius + 1.2 && !this.attackHitDone) {
          this.attackHitDone = true
          ctx.player.takeDamage(this.type.damage * 1.4 * this.damageScale, this.pos.x, this.pos.z, { heavy: true, knockback: 3, attacker: this })
          ctx.camera.addShake(0.7)
        }
        if (this.abilityTimer > 1.3 || this.attackHitDone) {
          this.attackHitDone = false
          this.setState("chase")
        }
        break
      }
      case "leap": {
        if (prog > 0.3 && prog < 0.7) {
          const sp = 14
          this.tryMove(this.chargeDir.x * sp * dt, this.chargeDir.z * sp * dt)
          this.group.position.y = this.pos.y + Math.sin((prog - 0.3) / 0.4 * Math.PI) * 2.5
        }
        if (prog >= 0.7 && !this.attackHitDone) {
          this.attackHitDone = true
          ctx.particles.dust(this.pos.x, this.pos.y, this.pos.z, 18)
          ctx.camera.addShake(0.6)
          ctx.audio.play("hit_blunt", { x: this.pos.x, y: 0, z: this.pos.z })
          if (dist < 3.2) ctx.player.takeDamage(this.type.damage * 1.2 * this.damageScale, this.pos.x, this.pos.z, { heavy: true, knockback: 2, attacker: this })
        }
        if (this.animator.finished) {
          this.attackHitDone = false
          this.setState("chase")
        }
        break
      }
      case "summon":
        if (prog > 0.5 && !this.attackHitDone) {
          this.attackHitDone = true
          const typeId = ctx.world.area.enemies[0].typeId
          ctx.summon(this.pos.x, this.pos.z, typeId, this.phase >= 3 ? 4 : 3)
          events.emit("toast", { text: `${this.type.name} ruft die Toten!`, kind: "warn" })
        }
        if (this.animator.finished) {
          this.attackHitDone = false
          this.setState("chase")
        }
        break
      case "plague":
        if (prog > 0.5 && !this.attackHitDone) {
          this.attackHitDone = true
          ctx.plagueCloud(ctx.player.pos.x, ctx.player.pos.z, 4.5, 9)
        }
        if (this.animator.finished) {
          this.attackHitDone = false
          this.setState("chase")
        }
        break
      case "slam":
        if (prog > 0.55 && !this.attackHitDone) {
          this.attackHitDone = true
          ctx.particles.dust(this.pos.x, this.pos.y, this.pos.z, 24)
          ctx.camera.addShake(0.9)
          ctx.audio.play("hit_blunt", { x: this.pos.x, y: 0, z: this.pos.z, volume: 1 })
          if (dist < 5) ctx.player.takeDamage(this.type.damage * 1.6 * this.damageScale, this.pos.x, this.pos.z, { heavy: true, knockback: 3, unblockable: false, attacker: this })
        }
        if (this.animator.finished) {
          this.attackHitDone = false
          this.setState("chase")
        }
        break
      default:
        this.setState("chase")
    }
  }

  /** Staggers regardless of poise (war cry). Bosses only flinch. */
  forceStagger(fromX: number, fromZ: number): void {
    if (this.dead) return
    this.alert = 1
    this.lastKnown = { x: this.ctx.player.pos.x, z: this.ctx.player.pos.z }
    if (this.isBoss) {
      this.animator.overlay = { head: [0.3, 0, 0] }
      setTimeout(() => (this.animator.overlay = null), 200)
      return
    }
    this.setState("stagger")
    this.animator.play("stagger", { restart: true })
    const d = Math.hypot(this.pos.x - fromX, this.pos.z - fromZ) || 1
    this.tryMove(((this.pos.x - fromX) / d) * 1.2, ((this.pos.z - fromZ) / d) * 1.2)
  }

  /** Knights block hits coming from the front while facing the attacker. */
  blocksFrom(x: number, z: number): boolean {
    if (!this.type.abilities?.includes("block")) return false
    if (this.state === "stagger" || this.state === "attack") return false
    const ang = Math.abs(angleDelta(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z)))
    return ang < 0.9 && this.rng.chance(this.isBoss ? 0.55 : 0.4)
  }

  /** True once the head has been cut off or burst (its bone is collapsed). */
  get headGone(): boolean {
    const b = this.humanoid.rig?.bones.get("Head")
    return !!b && b.scale.x < 0.01
  }

  /** Centre of the head in world space (between the head bone and the top of the skull). */
  headCentre(out: THREE.Vector3): THREE.Vector3 {
    this.humanoid.bones.head.getWorldPosition(out)
    this.humanoid.headTop.getWorldPosition(_zB)
    return out.add(_zB).multiplyScalar(0.5)
  }

  /**
   * Which part of the body a projectile flying from a to b hits, if any: the head (a small sphere at the skull),
   * otherwise the torso (a sphere at chest height, or a capsule along the back of a crawler).
   */
  projectileHit(a: THREE.Vector3, b: THREE.Vector3): "head" | "body" | null {
    const s = this.type.scale
    // Broad phase on the ground plane
    if (segPointDist2(a.x, 0, a.z, b.x, 0, b.z, this.pos.x, 0, this.pos.z) > (2.4 * s) ** 2) return null
    this.headCentre(_zA)
    const rh = (this.isBoss ? 0.2 : 0.17) * s
    if (segPointDist2(a.x, a.y, a.z, b.x, b.y, b.z, _zA.x, _zA.y, _zA.z) <= rh * rh) return "head"
    if (this.crawling) {
      this.humanoid.bones.hips.getWorldPosition(_zA)
      this.humanoid.bones.chest.getWorldPosition(_zB)
      const r = 0.36 * s
      return segSegDist2(a, b, _zA, _zB) <= r * r ? "body" : null
    }
    const r = 0.55 * s
    return segPointDist2(a.x, a.y, a.z, b.x, b.y, b.z, this.pos.x, this.pos.y + 1.1 * s, this.pos.z) <= r * r ? "body" : null
  }

  /** Leaves a projectile stuck in the body: in the skull for head hits, else in the chest. */
  embed(projectile: THREE.Object3D, zone: HitZone): void {
    const bone = zone === "body" ? this.humanoid.bones.chest : this.humanoid.bones.head
    bone.updateWorldMatrix(true, false)
    bone.attach(projectile)
    this.stuck.push(projectile)
    // A pincushion has its limits: the oldest shaft falls out
    if (this.stuck.length > 6) disposeObject(this.stuck.shift()!)
  }

  private get canCrawl(): boolean {
    return !this.isBoss && (this.type.kind === "walker" || this.type.kind === "sprinter") && !this.type.abilities?.includes("sword")
  }

  private startCrawling(): void {
    this.crawling = true
    this.animator.remap = CRAWL_REMAP
    this.animator.play("z_idle", { restart: true })
    if (this.state === "attack" || this.state === "stagger") this.setState(this.alerted ? "chase" : "idle")
  }

  takeHit(damage: number, crit: boolean, impact: number, heavy: boolean, fromX: number, fromZ: number, lifeOnHit = 0, blocked = false, zone: HitZone = "body"): void {
    if (this.dead) return
    const ctx = this.ctx
    this.hp -= damage
    this.lastHitAt = ctx.time
    this.lastKnown = { x: ctx.player.pos.x, z: ctx.player.pos.z }
    this.alert = 1
    this.lastHitZone = zone
    // Blood comes out where the blow landed: the head, the chest, or low for a crawler on the ground
    let hx = this.pos.x
    let hy = this.pos.y + (this.crawling ? 0.35 : 1.1) * this.type.scale
    let hz = this.pos.z
    if (zone !== "body") {
      this.headCentre(_zA)
      hx = _zA.x
      hy = _zA.y
      hz = _zA.z
    }
    const hpBefore = this.hp + damage
    const fd = Math.hypot(this.pos.x - fromX, this.pos.z - fromZ) || 1
    const dir = new THREE.Vector3((this.pos.x - fromX) / fd, 0.15, (this.pos.z - fromZ) / fd)
    this.lastHit = { dx: dir.x, dz: dir.z, crit, heavy, overkill: damage - hpBefore }
    if (!blocked) {
      // Hit flash on the body material
      this.humanoid.clothMaterial.emissive.setHex(crit ? 0xffd080 : 0xff6040)
      this.humanoid.clothMaterial.emissiveIntensity = 0.55
      this.flashTimer = 0.09
      ctx.hitStop(heavy ? 0.07 : 0.035)
      // Blood sprays out of the wound, away from the attacker, and stains the body
      ctx.gore.spray(hx, hy, hz, dir, crit ? 34 : heavy ? 24 : 14, crit ? 1.5 : heavy ? 1.25 : 0.9)
      ctx.gore.stain(this.humanoid, crit ? 0.08 : 0.04)
      if (zone !== "body") {
        // A shot through the skull: a second, wider spray out of the back of the head
        ctx.gore.spray(hx, hy, hz, dir, zone === "headBurst" ? 40 : 22, zone === "headBurst" ? 1.8 : 1.3)
        ctx.gore.stain(this.humanoid, 0.06)
        ctx.floatText(hx, hy + 0.5, hz, "Kopftreffer!", "#ffd24a")
      }
      // Crushing blows tear an arm off without killing (the zombie keeps coming)
      if (this.hp > 0 && crit && heavy && !this.isBoss && !this.lostArm && this.rng.chance(0.3)) {
        this.lostArm = true
        ctx.gore.sever(this.humanoid, this.rng.chance(0.5) ? "armL" : "armR", dir, 1)
      } else if (this.hp > 0 && heavy && this.canCrawl && !this.crawling && this.rng.chance(crit ? 0.3 : this.hp < this.maxHp * 0.5 ? 0.18 : 0.08)) {
        // A leg cut off at the knee or hip: the zombie goes down and keeps crawling after the player
        if (ctx.gore.sever(this.humanoid, this.rng.chance(0.5) ? "legL" : "legR", dir, 1)) {
          ctx.gore.pool(this.pos.x, this.pos.z, 1.2)
          this.startCrawling()
        }
      }
      ctx.audio.play(this.type.armor > 10 ? "hit_metal" : "hit_flesh", { x: hx, y: hy, z: hz, pitch: 0.9 + Math.random() * 0.2 })
      if (crit) ctx.audio.play("crit", { x: hx, y: hy, z: hz })
    }
    ctx.floatText(hx, hy + 0.6, hz, `${damage}`, crit ? "#ffd24a" : blocked ? "#9ab" : "#fff")
    events.emit("enemyHit", { typeId: this.type.id, damage, crit, x: hx, y: hy, z: hz })
    if (this.hp <= 0) {
      this.die()
      if (lifeOnHit) ctx.player.heal(lifeOnHit, true)
      return
    }
    // Stagger
    if (!this.alerted && this.state !== "stagger") this.setState("chase")
    if (this.state !== "ability" && staggers(ctx.rng, impact, this.type.poise * (this.phase >= 3 ? 1.3 : 1), heavy)) {
      this.setState("stagger")
      this.animator.play("stagger", { restart: true, speed: this.isBoss ? 1.4 : 1 })
      ctx.audio.play("stagger", { x: hx, y: hy, z: hz, volume: 0.5 })
      // Knockback
      const d = Math.hypot(this.pos.x - fromX, this.pos.z - fromZ) || 1
      this.tryMove(((this.pos.x - fromX) / d) * (heavy ? 0.9 : 0.4), ((this.pos.z - fromZ) / d) * (heavy ? 0.9 : 0.4))
    } else if (this.state !== "attack" && this.state !== "ability") {
      // brief flinch overlay
      this.animator.overlay = { head: [0.25, 0, 0] }
      this.animator.overlayWeight = 1
      setTimeout(() => {
        this.animator.overlay = null
      }, 120)
    }
    // Boss phases
    if (this.isBoss) {
      const f = this.hp / this.maxHp
      const phase = f < 0.3 ? 3 : f < 0.6 ? 2 : 1
      if (phase > this.phase) {
        this.phase = phase
        events.emit("toast", { text: phase === 2 ? `${this.type.name} wird wütend!` : `${this.type.name} rast vor Wut!`, kind: "warn" })
        ctx.audio.play("boss_roar", { x: hx, y: hy, z: hz })
        this.abilityCooldowns.summon = 0
      }
    }
  }

  private die(): void {
    this.dead = true
    this.hp = 0
    this.state = "dead"
    this.deathTimer = 0
    this.humanoid.clothMaterial.emissive.setHex(0x000000)
    this.animator.play(Math.random() < 0.5 ? "death_back" : "death_front", { restart: true })
    this.gore()
    this.ctx.audio.play("zombie_die", { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, pitch: this.type.kind === "brute" || this.isBoss ? 0.6 : 0.9 + Math.random() * 0.3 })
    this.eyes.visible = false
    this.telegraph.visible = false
    events.emit("enemyKilled", { typeId: this.type.id, x: this.pos.x, z: this.pos.z, boss: this.isBoss, special: this.special ? this.type.id : undefined })
    if (!this.lootDropped) {
      this.lootDropped = true
      const chance = this.isBoss ? 1 : this.type.kind === "knight" || this.type.kind === "brute" ? 0.8 : 0.45
      if (this.ctx.rng.chance(chance)) this.ctx.dropLoot(this.pos.x, this.pos.z, this.type.lootTable, this.isBoss ? 2 : 0)
    }
  }

  /** How the body comes apart depends on the killing blow: decapitation, lost limbs or bursting into pieces. */
  private gore(): void {
    const ctx = this.ctx
    const g = ctx.gore
    const h = this.lastHit
    const dir = new THREE.Vector3(h.dx, 0.25, h.dz).normalize()
    const cx = this.pos.x
    const cy = this.pos.y + 1.1 * this.type.scale
    const cz = this.pos.z
    g.burst(cx, cy, cz, this.isBoss ? 80 : 40)
    const hard = h.crit || h.heavy
    const big = this.type.kind === "brute" || this.isBoss
    const r = cosmetic.next()
    if (!g.enabled) return
    if (!this.isBoss && this.lastHitZone !== "body") {
      // Killed by a shot to the head: an arrow takes the head off, a bolt bursts it
      this.headCentre(_zA)
      if (this.lastHitZone === "headBurst") {
        // No whole head flies off: it bursts into chunks and a cloud of blood
        g.sever(this.humanoid, "head", dir, 0.6, true, false)
        g.chunks(_zA.x, _zA.y, _zA.z, dir, 9)
        g.burst(_zA.x, _zA.y, _zA.z, 55)
      } else g.sever(this.humanoid, "head", dir, 1.6)
    } else if (!this.isBoss && hard && (h.overkill > 25 || (this.type.kind === "brute" && r < 0.25)) && r < 0.45) {
      // Overkill: the body bursts into pieces
      g.explode(this.humanoid, dir, big ? 1.1 : 1.5)
    } else if (r < (hard ? 0.45 : 0.25)) {
      g.sever(this.humanoid, "head", dir, hard ? 1.4 : 1)
    } else if (r < (hard ? 0.75 : 0.45)) {
      g.sever(this.humanoid, cosmetic.chance(0.5) ? "armL" : "armR", dir, 1.1)
      if (hard && cosmetic.chance(0.5)) g.sever(this.humanoid, "head", dir, 1)
    } else if (r < (hard ? 0.9 : 0.55)) {
      g.sever(this.humanoid, cosmetic.chance(0.5) ? "legL" : "legR", dir, 0.9)
    }
    // Close kills paint the screen and the weapon
    const p = ctx.player
    const d = Math.hypot(p.pos.x - cx, p.pos.z - cz)
    if (d < 3) g.splatScreen(hard ? 0.9 : 0.5 * (1 - d / 3) + 0.2)
    if (d < 4) g.bloodyWeapon(p.weaponObject)
  }

  /** A blow on the corpse: cuts off what is left, a heavy blow bursts it. */
  mutilate(dir: THREE.Vector3, heavy: boolean): void {
    const g = this.ctx.gore
    const p = this.group.position
    g.spray(p.x, p.y + 0.4, p.z, dir, heavy ? 30 : 18, heavy ? 1.3 : 0.9)
    this.ctx.audio.play("hit_flesh", { x: p.x, y: p.y + 0.4, z: p.z, pitch: 0.7 + Math.random() * 0.2 })
    this.mutilations++
    if (heavy && this.mutilations >= 2) {
      g.explode(this.humanoid, dir, 1.2)
      return
    }
    const parts = ["head", "armL", "armR", "legL", "legR"] as const
    for (const part of parts.slice().sort(() => cosmetic.next() - 0.5)) if (g.sever(this.humanoid, part, dir, heavy ? 1.2 : 0.8, false)) return
    g.chunks(p.x, p.y + 0.3, p.z, dir, heavy ? 6 : 3)
  }

  get finished(): boolean {
    return this.dead && this.deathTimer > 46
  }

  dispose(): void {
    for (const o of this.stuck) disposeObject(o)
    this.stuck.length = 0
    disposeHumanoid(this.humanoid)
    this.eyes.geometry.dispose()
    this.telegraph.geometry.dispose()
    ;(this.telegraph.material as THREE.Material).dispose()
    this.group.removeFromParent()
  }
}

export type HitZone = "body" | "head" | "headBurst"

const _zA = new THREE.Vector3()
const _zB = new THREE.Vector3()

/** Removes an object and frees its geometries (materials are shared). */
function disposeObject(o: THREE.Object3D): void {
  o.removeFromParent()
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}

/** Squared distance between segment a-b and point p. */
function segPointDist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number, px: number, py: number, pz: number): number {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len2 = dx * dx + dy * dy + dz * dz
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const x = ax + dx * t - px
  const y = ay + dy * t - py
  const z = az + dz * t - pz
  return x * x + y * y + z * z
}

/** Squared distance between segments p1-q1 and p2-q2 (closest points, clamped to both segments). */
function segSegDist2(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z
  const a = d1x * d1x + d1y * d1y + d1z * d1z
  const e = d2x * d2x + d2y * d2y + d2z * d2z
  const f = d2x * rx + d2y * ry + d2z * rz
  let s = 0
  let t = 0
  if (a <= 1e-9 && e <= 1e-9) return rx * rx + ry * ry + rz * rz
  if (a <= 1e-9) t = Math.max(0, Math.min(1, f / e))
  else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e <= 1e-9) s = Math.max(0, Math.min(1, -c / a))
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z
      const denom = a * e - b * b
      s = denom > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = Math.max(0, Math.min(1, -c / a))
      } else if (t > 1) {
        t = 1
        s = Math.max(0, Math.min(1, (b - c) / a))
      }
    }
  }
  const x = p1.x + d1x * s - (p2.x + d2x * t)
  const y = p1.y + d1y * s - (p2.y + d2y * t)
  const z = p1.z + d1z * s - (p2.z + d2z * t)
  return x * x + y * y + z * z
}
