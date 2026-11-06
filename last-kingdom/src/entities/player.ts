// The player: third-person movement, stamina, melee combos, blocking, dodging, ranged weapons, consumables.

import * as THREE from "three"
import { flameMesh } from "../render/flame"
import type { EntityContext } from "./context"
import { buildHumanoid, disposeHumanoid, type ArmorLook, type HelmetLook, type Humanoid } from "../render/humanoid"
import { Animator } from "../render/animator"
import { buildShield, buildWeapon } from "../render/weaponModels"
import { mat } from "../render/materials"
import { WeaponTrail } from "../render/trail"
import type { EquipSlot, InventoryState, ItemInstance, Profile, WeaponClass } from "../core/types"
import { itemDef } from "../items/itemData"
import { effectiveArmor, effectiveBlock, effectiveWeapon, type EffectiveWeapon } from "../items/items"
import { QUICK_SLOTS, countItem, removeItem, totalWeight } from "../items/inventory"
import { computeDamage, encumbrance, exhaustionPenalty, staggers, durabilityLoss } from "./combat"
import { angleDelta, clamp, damp, turnToward } from "../core/math"
import { activeSkills, skillBonuses, type SkillBonuses } from "../meta/skillData"
import { campBonuses } from "../meta/campData"
import { classDef } from "../meta/classData"
import { masteryDamageMultiplier } from "../meta/progression"
import { events } from "../core/events"
import type { Zombie } from "./zombie"

type State = "normal" | "attacking" | "dodging" | "staggered" | "using" | "drawing" | "reloading" | "dead" | "interacting"

interface AttackSpec {
  clip: string
  hitAt: number
  multiplier: number
  heavy: boolean
  lunge?: number
  maxTargets: number
}

const COMBOS: Record<WeaponClass, { light: AttackSpec[]; heavy: AttackSpec }> = {
  longsword: { light: [{ clip: "slash_r", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "slash_l", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "overhead", hitAt: 0.52, multiplier: 1.25, heavy: false, maxTargets: 2 }], heavy: { clip: "heavy_overhead", hitAt: 0.58, multiplier: 2.0, heavy: true, maxTargets: 3 } },
  shortsword: { light: [{ clip: "slash_r", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "slash_l", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "thrust", hitAt: 0.5, multiplier: 1.2, heavy: false, maxTargets: 1 }], heavy: { clip: "lunge", hitAt: 0.55, multiplier: 1.8, heavy: true, lunge: 2.2, maxTargets: 2 } },
  greatsword: { light: [{ clip: "slash_r", hitAt: 0.47, multiplier: 1, heavy: false, maxTargets: 4 }, { clip: "slash_l", hitAt: 0.47, multiplier: 1, heavy: false, maxTargets: 4 }], heavy: { clip: "heavy_spin", hitAt: 0.52, multiplier: 2.1, heavy: true, maxTargets: 6 } },
  battleaxe: { light: [{ clip: "chop", hitAt: 0.52, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "slash_r", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 2 }], heavy: { clip: "heavy_overhead", hitAt: 0.58, multiplier: 2.2, heavy: true, maxTargets: 3 } },
  mace: { light: [{ clip: "overhead", hitAt: 0.52, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "slash_r", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 2 }], heavy: { clip: "heavy_overhead", hitAt: 0.58, multiplier: 2.0, heavy: true, maxTargets: 3 } },
  spear: { light: [{ clip: "thrust", hitAt: 0.5, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "thrust", hitAt: 0.5, multiplier: 1, heavy: false, maxTargets: 2 }, { clip: "slash_r", hitAt: 0.45, multiplier: 1.1, heavy: false, maxTargets: 3 }], heavy: { clip: "lunge", hitAt: 0.55, multiplier: 2.0, heavy: true, lunge: 2.8, maxTargets: 3 } },
  dagger: { light: [{ clip: "thrust", hitAt: 0.5, multiplier: 1, heavy: false, maxTargets: 1 }, { clip: "slash_r", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 1 }, { clip: "slash_l", hitAt: 0.45, multiplier: 1, heavy: false, maxTargets: 1 }], heavy: { clip: "lunge", hitAt: 0.55, multiplier: 2.4, heavy: true, lunge: 2.4, maxTargets: 1 } },
  bow: { light: [], heavy: { clip: "bow_release", hitAt: 0, multiplier: 1, heavy: false, maxTargets: 0 } },
  crossbow: { light: [], heavy: { clip: "bow_release", hitAt: 0, multiplier: 1, heavy: false, maxTargets: 0 } },
}

export interface Buff {
  stat: "damage" | "armor" | "speed" | "staminaRegen"
  value: number
  remaining: number
}

const WALK = 2.4
const RUN = 4.6
const SPRINT = 6.6

export class Player {
  readonly group = new THREE.Group()
  pos = new THREE.Vector3()
  yaw = 0
  velY = 0
  grounded = true
  hp = 100
  maxHp = 100
  stamina = 100
  maxStamina = 100
  state: State = "normal"
  private stateTimer = 0
  private attack: AttackSpec | null = null
  private attackDuration = 0
  private attackHitDone = false
  private comboIndex = 0
  private bufferedAttack: "light" | "heavy" | null = null
  private comboWindow = 0
  blocking = false
  aiming = false
  /** Seconds the block has been held; a block raised just before the hit is a perfect parry. */
  private blockHeld = 0
  private flashTimer = 0
  private iframes = 0
  private staminaDelay = 0
  private dodgeDir = new THREE.Vector3()
  private lastGroundY = 0
  private walkPhase = 0
  private footTimer = 0
  private noiseTimer = 0
  buffs: Buff[] = []
  plague = 0
  private plagueTick = 0
  private hot: { amount: number; remaining: number; rate: number } | null = null
  private usingItem: ItemInstance | null = null
  private usingApplied = false
  private drawProgress = 0
  private crossbowLoaded = true
  lockTarget: Zombie | null = null
  private flickLatched = false
  skills: SkillBonuses
  secondWindUsed = false
  private humanoid!: Humanoid
  animator!: Animator
  private weaponMesh: THREE.Object3D | null = null
  /** The weapon in hand (for blood on the blade). */
  get weaponObject(): THREE.Object3D | null {
    return this.weaponMesh
  }
  private shieldMesh: THREE.Object3D | null = null
  /** Flame of a carried torch; its light comes from slot 0 of the expedition's fixed light pool. */
  torchFlame: THREE.Object3D | null = null
  private trail: WeaponTrail | null = null
  private equipKey = ""
  private ctx!: EntityContext
  controlsEnabled = true
  sprinting = false
  /** Active ability (from the skill tree) and its cooldown. */
  ability: ReturnType<typeof activeSkills>[number] | null = null
  abilityCooldown = 0
  private abilityIndex = 0
  speedMultiplier = 1
  /** Elapsed time without taking damage; HUD uses it for low-health pulse. */
  sinceHurt = 10
  lastDamageDir = 0
  landedThisFrame = false
  readonly classId: Profile["classId"]
  carryLimit = 40
  private campBonus: ReturnType<typeof campBonuses>

  constructor(public profile: Profile, public inventory: InventoryState) {
    this.classId = profile.classId
    this.skills = skillBonuses(profile.skills)
    this.campBonus = campBonuses(profile.camp)
    this.ability = activeSkills(profile.skills)[0] ?? null
    this.recalcStats()
    this.hp = this.maxHp
    this.stamina = this.maxStamina
    this.group.name = "player"
  }

  bind(ctx: EntityContext): void {
    this.ctx = ctx
    ctx.scene.add(this.group)
    this.trail = new WeaponTrail(ctx.scene)
    this.rebuildVisual()
  }

  recalcStats(): void {
    const cls = classDef(this.classId)
    const levelBonus = (this.profile.level - 1) * 4
    this.maxHp = Math.round((cls.hp + levelBonus + this.campBonus.hpBonus) * (1 + this.skills.hpPct))
    this.maxStamina = Math.round(cls.stamina * (1 + this.skills.staminaPct)) + this.campBonus.startStamina
    this.carryLimit = cls.carry + this.skills.carryKg + this.campBonus.carryKg + (this.profile.level - 1) * 0.5
    this.hp = Math.min(this.hp, this.maxHp)
  }

  // ---- equipment ---------------------------------------------------------------------

  get weapon(): ItemInstance | null {
    return this.inventory.equipment.mainHand ?? null
  }

  get weaponStats(): EffectiveWeapon | null {
    const w = this.weapon
    return w ? effectiveWeapon(w) : null
  }

  get shield(): ItemInstance | null {
    return this.inventory.equipment.offHand ?? null
  }

  get armor(): number {
    let a = 0
    const body = this.inventory.equipment.body
    const head = this.inventory.equipment.head
    if (body) a += effectiveArmor(body)
    if (head) a += effectiveArmor(head)
    for (const b of this.buffs) if (b.stat === "armor") a += b.value
    return a
  }

  get weight(): number {
    return totalWeight(this.inventory)
  }

  private armorLook(): ArmorLook {
    const id = this.inventory.equipment.body?.defId ?? ""
    if (id.includes("plate")) return "plate"
    if (id.includes("brigandine")) return "brigandine"
    if (id.includes("chain")) return "chain"
    if (id.includes("leather")) return "leather"
    if (id.includes("gambeson")) return "gambeson"
    if (id.includes("rags")) return "rags"
    return "none"
  }

  private helmetLook(): HelmetLook {
    const id = this.inventory.equipment.head?.defId ?? ""
    if (id.includes("great")) return "great"
    if (id.includes("bascinet")) return "bascinet"
    if (id.includes("nasal")) return "nasal"
    if (id.includes("kettle")) return "kettle"
    if (id.includes("hood")) return "hood"
    return "none"
  }

  /** Rebuilds the character mesh when equipment changed. Cheap enough to call every frame. */
  rebuildVisual(): void {
    const key = `${this.inventory.equipment.body?.defId}|${this.inventory.equipment.head?.defId}|${this.weapon?.defId}|${this.shield?.defId}`
    if (key === this.equipKey && this.humanoid) return
    this.equipKey = key
    if (this.humanoid) disposeHumanoid(this.humanoid)
    const cls = this.classId
    this.humanoid = buildHumanoid({
      skin: 0xd9b08c,
      shirt: cls === "knight" ? 0x3a4a7a : cls === "ranger" ? 0x3a5a3a : 0x3a3a3a,
      pants: cls === "ranger" ? 0x4a3a2a : 0x2a2a2a,
      boots: 0x241a12,
      hair: cls === "rogue" ? 0x1a1410 : cls === "ranger" ? 0x8a6a3a : 0x5a3a1a,
      armor: this.armorLook(),
      helmet: this.helmetLook(),
      armored: this.armorLook() === "plate",
      seed: 7,
      skinTexture: "cloth",
      female: this.profile.female === true,
    })
    this.group.add(this.humanoid.root)
    this.animator = new Animator(this.humanoid)
    this.animator.play("idle")
    // Weapon
    this.weaponMesh = null
    this.shieldMesh = null
    const w = this.weapon
    if (w) {
      const def = itemDef(w.defId)
      const cls2 = def.weapon!.weaponClass
      const m = buildWeapon(def.model ?? `${cls2}_1`)
      if (cls2 === "bow") {
        m.position.set(0, 0, 0)
        m.rotation.set(0, 0, 0)
        this.humanoid.handL.add(m)
      } else {
        this.humanoid.handR.add(m)
      }
      this.weaponMesh = m
    }
    const s = this.shield
    this.torchFlame = null
    if (s && s.defId === "torch_item") {
      // A lit torch in the off hand
      const g = new THREE.Group()
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), mat("timber"))
      stick.position.y = 0.1
      g.add(stick)
      const flame = new THREE.Group()
      flame.position.y = 0.33
      flame.add(flameMesh(0.18, 0.34))
      g.add(flame)
      g.rotation.x = -1.2
      this.humanoid.handL.add(g)
      this.shieldMesh = g
      this.torchFlame = flame
    } else if (s && !(this.weaponStats?.twoHanded)) {
      const def = itemDef(s.defId)
      const m = buildShield(def.model ?? "shield_round")
      m.position.set(-0.08, 0.12, 0.06)
      m.rotation.set(0, -Math.PI / 2 + 0.3, 0)
      this.humanoid.handL.add(m)
      this.shieldMesh = m
    }
  }

  get carriesTorch(): boolean {
    return this.torchFlame !== null
  }

  /** Number of usable quick slots (grows with the armoury). */
  get quickSlotCount(): number {
    return this.campBonus.quickSlots
  }

  get height(): number {
    return 1.8
  }

  // ---- derived combat values -------------------------------------------------------------

  private damageBonus(ranged: boolean): number {
    let pct = this.skills.damagePct + (ranged ? this.skills.rangedDamagePct : 0)
    if (this.classId === "ranger" && ranged) pct += 0.15
    for (const b of this.buffs) if (b.stat === "damage") pct += b.value
    const w = this.weaponStats
    if (w) pct += masteryDamageMultiplier(this.profile.mastery[w.weaponClass] ?? 0) - 1
    return pct
  }

  private critChance(): number {
    const w = this.weaponStats
    let c = (w?.critChance ?? 0.05) + this.skills.critChance
    if (this.classId === "rogue") c += 0.1
    return Math.min(0.8, c)
  }

  get speedFactor(): number {
    let f = 1 + this.skills.speedPct
    for (const b of this.buffs) if (b.stat === "speed") f += b.value
    const body = this.inventory.equipment.body
    if (body) f *= itemDef(body.defId).armor?.speedMultiplier ?? 1
    f *= encumbrance(this.weight, this.carryLimit)
    return f * this.speedMultiplier
  }

  get overloaded(): boolean {
    return this.weight > this.carryLimit
  }

  private useStamina(amount: number): boolean {
    if (this.stamina < amount * 0.5) return false
    this.stamina = Math.max(0, this.stamina - amount * exhaustionPenalty(this.stamina, this.maxStamina))
    this.staminaDelay = 0.9
    return true
  }

  // ---- update ------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx
    this.rebuildVisual()
    this.sinceHurt += dt
    this.landedThisFrame = false
    this.iframes = Math.max(0, this.iframes - dt)
    this.staminaDelay = Math.max(0, this.staminaDelay - dt)
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt)
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      this.buffs[i].remaining -= dt
      if (this.buffs[i].remaining <= 0) this.buffs.splice(i, 1)
    }
    if (this.hot) {
      const amt = Math.min(this.hot.amount, this.hot.rate * dt)
      this.heal(amt, true)
      this.hot.amount -= amt
      this.hot.remaining -= dt
      if (this.hot.amount <= 0 || this.hot.remaining <= 0) this.hot = null
    }
    if (this.plague > 0) {
      this.plague -= dt
      this.plagueTick -= dt
      if (this.plagueTick <= 0) {
        this.plagueTick = 1
        this.applyDamage(3, "Pest")
        ctx.particles.plague(this.pos.x, this.pos.y + 1, this.pos.z, 1)
      }
    }
    if (this.state === "dead") {
      this.animator.update(dt)
      this.applyTransform()
      return
    }
    // Stamina regen
    if (this.staminaDelay <= 0 && !this.sprinting && !(this.blocking && this.stamina < this.maxStamina * 0.3)) {
      let regen = 16 * (1 + this.skills.staminaRegenPct)
      for (const b of this.buffs) if (b.stat === "staminaRegen") regen *= 1 + b.value
      const body = this.inventory.equipment.body
      if (body) regen *= itemDef(body.defId).armor?.staminaRegenMultiplier ?? 1
      if (this.blocking) regen *= 0.5
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt)
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) this.humanoid.clothMaterial.emissive.setHex(0x000000)
    }
    if (this.torchFlame) {
      const t = performance.now() * 0.001
      this.torchFlame.scale.setScalar(0.9 + Math.sin(t * 17) * 0.12)
      if (ctx.rng.chance(dt * 6)) {
        const p = new THREE.Vector3()
        this.torchFlame!.getWorldPosition(p)
        ctx.particles.embers(p.x, p.y, p.z, 1)
      }
    }
    const input = ctx.input
    const enabled = this.controlsEnabled
    const move = enabled ? input.move() : { x: 0, y: 0 }
    const camF = ctx.camera.forward()
    const camR = { x: -camF.z, z: camF.x }
    let mx = camF.x * move.y + camR.x * move.x
    let mz = camF.z * move.y + camR.z * move.x
    const moveLen = Math.hypot(mx, mz)
    if (moveLen > 1) {
      mx /= moveLen
      mz /= moveLen
    }
    const wantMove = moveLen > 0.05
    const ws = this.weaponStats
    const ranged = !!ws?.ranged

    // ---- lock-on toggle and target switching (stick flick or quick mouse swipe) ----
    if (enabled && input.pressed("lockOn")) this.toggleLockOn()
    if (this.lockTarget && (this.lockTarget.dead || this.lockTarget.pos.distanceTo(this.pos) > 28)) this.lockTarget = null
    if (this.lockTarget && enabled) {
      const sx = input.stickRightX()
      const look = input.look(0)
      const dir = Math.abs(sx) > 0.85 ? Math.sign(sx) : Math.abs(look.x) > 0.12 ? Math.sign(look.x) : 0
      if (dir !== 0 && !this.flickLatched) {
        this.flickLatched = true
        this.switchLockTarget(dir)
      } else if (dir === 0 && Math.abs(sx) < 0.4) this.flickLatched = false
    }

    // ---- state machine ----
    this.stateTimer -= dt
    this.blocking = false
    this.aiming = false
    let speed = 0
    let strafe = false
    switch (this.state) {
      case "normal": {
        if (enabled) {
          if (input.pressed("dodge") && this.tryDodge(mx, mz, wantMove)) break
          if (input.pressed("jump") && this.grounded && this.useStamina(8)) {
            this.velY = 5.6
            this.grounded = false
            this.animator.play("jump", { restart: true })
            ctx.audio.play("jump")
          }
          if (ranged) {
            if (input.down("block")) this.aiming = true
            if (ws!.weaponClass === "bow") {
              if (input.down("attack") && this.hasAmmo(ws!) && this.stamina > 5) {
                this.state = "drawing"
                this.drawProgress = 0
                ctx.audio.play("bow_draw")
                break
              }
            } else if (input.pressed("attack")) {
              if (this.crossbowLoaded) this.fireRanged(1)
              else if (this.hasAmmo(ws!)) this.startReload()
            }
          } else {
            if (input.down("block") && (this.shield || ws)) {
              this.blocking = true
            }
            if (input.pressed("attack")) this.startAttack("light")
            else if (input.pressed("heavy")) this.startAttack("heavy")
          }
          if (this.state !== "normal") break
          // Quick slots and weapon switch
          for (let i = 0; i < 4; i++) {
            if (input.pressed(QUICK_SLOTS[i].replace("quick", "quick") as "quick1")) this.useQuickSlot(i)
          }
          if (input.pressed("switchWeapon")) this.cycleWeapon()
        }
        this.sprinting = enabled && input.down("sprint") && wantMove && this.stamina > 2 && !this.blocking && !this.overloaded
        if (this.sprinting) {
          this.stamina = Math.max(0, this.stamina - 9 * dt)
          this.staminaDelay = 0.6
          if (this.stamina <= 0) this.sprinting = false
        }
        speed = this.blocking ? WALK * 0.8 : this.aiming ? WALK : this.sprinting ? SPRINT : RUN
        strafe = this.blocking || this.aiming || !!this.lockTarget
        if (wantMove) {
          const wantYaw = Math.atan2(mx, mz)
          const faceYaw = strafe && this.lockTarget ? this.yawTo(this.lockTarget.pos) : strafe && (this.blocking || this.aiming) ? Math.atan2(camF.x, camF.z) : wantYaw
          this.yaw = turnToward(this.yaw, faceYaw, dt * 12)
        } else if (strafe && this.lockTarget) {
          this.yaw = turnToward(this.yaw, this.yawTo(this.lockTarget.pos), dt * 8)
        } else if (this.aiming) {
          this.yaw = turnToward(this.yaw, Math.atan2(camF.x, camF.z), dt * 10)
        }
        break
      }
      case "attacking": {
        const a = this.attack!
        const prog = this.animator.progress
        if (enabled) {
          if (input.pressed("attack")) this.bufferedAttack = "light"
          else if (input.pressed("heavy")) this.bufferedAttack = "heavy"
          if (input.pressed("dodge") && prog > 0.55 && this.tryDodge(mx, mz, wantMove)) break
        }
        // Lunges move the player forward during the first half
        if (a.lunge && prog < 0.55) {
          const f = (a.lunge / (this.attackDuration * 0.55)) * dt
          this.tryMove(Math.sin(this.yaw) * f, Math.cos(this.yaw) * f)
        }
        // Allow slight turning toward the lock target or input before the hit
        if (prog < a.hitAt) {
          if (this.lockTarget) this.yaw = turnToward(this.yaw, this.yawTo(this.lockTarget.pos), dt * 10)
          else if (wantMove) this.yaw = turnToward(this.yaw, Math.atan2(mx, mz), dt * 6)
        }
        if (!this.attackHitDone && prog >= a.hitAt) {
          this.attackHitDone = true
          this.performMeleeHit(a)
        }
        if (prog >= 0.72 && this.bufferedAttack) {
          const kind = this.bufferedAttack
          this.bufferedAttack = null
          this.state = "normal"
          this.startAttack(kind)
        } else if (this.animator.finished || prog >= 1) {
          this.state = "normal"
          this.comboWindow = 0.6
        }
        break
      }
      case "dodging": {
        const prog = this.animator.progress
        const sp = prog < 0.6 ? 9.5 : 4
        this.tryMove(this.dodgeDir.x * sp * dt, this.dodgeDir.z * sp * dt)
        if (enabled && prog > 0.7 && (input.pressed("attack") || input.pressed("heavy"))) {
          this.state = "normal"
          this.startAttack(input.pressed("heavy") ? "heavy" : "light")
          break
        }
        if (this.animator.finished) this.state = "normal"
        break
      }
      case "staggered":
        if (this.stateTimer <= 0) this.state = "normal"
        break
      case "using": {
        const prog = this.animator.progress
        if (!this.usingApplied && prog >= 0.5 && this.usingItem) {
          this.usingApplied = true
          this.applyConsumable(this.usingItem)
        }
        if (wantMove) {
          speed = WALK
          this.yaw = turnToward(this.yaw, Math.atan2(mx, mz), dt * 8)
        }
        if (this.animator.finished) this.state = "normal"
        break
      }
      case "drawing": {
        this.aiming = true
        const drawTime = (ws?.ranged?.drawTime ?? 0.6) / (1 + this.skills.drawSpeedPct + (this.classId === "ranger" ? 0.2 : 0))
        this.drawProgress = Math.min(1, this.drawProgress + dt / drawTime)
        this.yaw = turnToward(this.yaw, this.lockTarget ? this.yawTo(this.lockTarget.pos) : Math.atan2(camF.x, camF.z), dt * 12)
        if (wantMove) speed = WALK * 0.8
        strafe = true
        if (!enabled || !input.down("attack")) {
          if (this.drawProgress > 0.25) this.fireRanged(this.drawProgress)
          else this.state = "normal"
        }
        break
      }
      case "reloading": {
        if (wantMove) {
          speed = WALK
          this.yaw = turnToward(this.yaw, Math.atan2(mx, mz), dt * 8)
        }
        if (this.animator.finished) {
          this.crossbowLoaded = true
          this.state = "normal"
        }
        break
      }
      case "interacting":
        if (this.animator.finished) this.state = "normal"
        break
    }
    if (this.comboWindow > 0) {
      this.comboWindow -= dt
      if (this.comboWindow <= 0) this.comboIndex = 0
    }
    this.blockHeld = this.blocking ? this.blockHeld + dt : 0

    // ---- movement ----
    let moved = 0
    if (speed > 0 && wantMove) {
      const s = speed * this.speedFactor * (this.state === "normal" && !strafe ? 1 : 0.85)
      moved = this.tryMove(mx * s * dt, mz * s * dt)
      this.walkPhase += (moved / 0.85) * Math.PI
      this.footTimer += moved
      const stride = this.sprinting ? 1.3 : speed >= RUN ? 1.05 : 0.8
      if (this.footTimer > stride) {
        this.footTimer = 0
        ctx.audio.play(ctx.world.underground || ctx.world.area.biome === "city" || ctx.world.area.biome === "castle" ? "footstep_stone" : "footstep", { volume: this.sprinting ? 0.7 : 0.45, pitch: 0.9 + Math.random() * 0.2 })
      }
    }
    // Noise
    this.noiseTimer -= dt
    if (this.noiseTimer <= 0 && moved > 0) {
      this.noiseTimer = 0.4
      ctx.noise(this.pos.x, this.pos.z, this.sprinting ? 16 : speed >= RUN ? 7 : 3)
    }
    // Gravity
    const ground = ctx.world.terrain.heightAt(this.pos.x, this.pos.z)
    if (!this.grounded || this.pos.y > ground + 0.01) {
      this.velY -= 16 * dt
      this.pos.y += this.velY * dt
      if (this.pos.y <= ground) {
        this.pos.y = ground
        if (!this.grounded) {
          this.landedThisFrame = true
          ctx.audio.play("land", { volume: 0.5 })
          if (this.velY < -9) {
            this.applyDamage(Math.round((-this.velY - 9) * 6), "Sturz")
          }
        }
        this.grounded = true
        this.velY = 0
      } else this.grounded = false
    } else {
      // Follow the ground when walking down slopes
      this.pos.y = ground
    }
    this.lastGroundY = ground

    // ---- animation ----
    this.selectLocomotionClip(speed, wantMove, moved, dt, strafe)
    this.animator.ctx.phase = this.walkPhase
    this.animator.ctx.speed = wantMove ? clamp((speed * this.speedFactor) / RUN, 0.45, 1.4) : 0
    this.animator.update(dt)
    this.applyTransform()
    // Swing trail while a melee attack is in its active window
    if (this.trail) {
      const ws2 = this.weaponStats
      if (this.state === "attacking" && this.attack && !ws2?.ranged && this.animator.progress > this.attack.hitAt - 0.25 && this.animator.progress < this.attack.hitAt + 0.3) {
        this.group.updateMatrixWorld(true)
        this.trail.push(this.humanoid.handR, (ws2?.range ?? 1.5) * 0.55)
      } else this.trail.update()
    }
  }

  private selectLocomotionClip(speed: number, wantMove: boolean, moved: number, dt: number, strafe: boolean): void {
    const a = this.animator
    const st = this.state
    if (st === "attacking" || st === "dodging" || st === "staggered" || st === "using" || st === "reloading" || st === "interacting") return
    if (st === "drawing") {
      a.play(this.weaponStats?.weaponClass === "bow" ? "bow_draw" : "crossbow_aim")
      a.speed = 0
      ;(a as unknown as { time: number }).time = this.drawProgress * 1
      return
    }
    if (!this.grounded) {
      if (this.velY > 0.5) {
        if (a.name !== "jump") a.play("jump")
      } else a.play("fall")
      return
    }
    if (this.landedThisFrame) {
      a.play("land", { restart: true })
      return
    }
    if (a.name === "land" && !a.finished) return
    if (this.blocking) {
      a.play(this.shield && this.shield.defId !== "torch_item" ? "block" : "block_weapon")
      return
    }
    if (this.aiming) {
      a.play(this.weaponStats?.weaponClass === "bow" ? "bow_draw" : "crossbow_aim")
      a.speed = 0
      ;(a as unknown as { time: number }).time = 0
      return
    }
    if (wantMove && moved > 0) {
      if (this.sprinting) a.play("sprint")
      else if (strafe || speed < RUN) a.play("walk")
      else a.play("run")
      a.speed = 1
    } else {
      a.play(this.lockTarget || this.sinceHurt < 4 ? "combat_idle" : "idle")
    }
  }

  private applyTransform(): void {
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw
  }

  private yawTo(target: THREE.Vector3): number {
    return Math.atan2(target.x - this.pos.x, target.z - this.pos.z)
  }

  /** Moves with collision; returns the distance actually moved. */
  tryMove(dx: number, dz: number): number {
    const ctx = this.ctx
    const ox = this.pos.x
    const oz = this.pos.z
    let nx = ox + dx
    let nz = oz + dz
    const size = ctx.world.area.size * 0.97
    nx = clamp(nx, -size, size)
    nz = clamp(nz, -size, size)
    // Deep water and steep slopes block
    const t = ctx.world.terrain
    if (t.heightAt(nx, nz) < t.waterLevel - 0.6) {
      nx = ox
      nz = oz
    }
    const r = ctx.world.collision.resolveCircle(nx, nz, 0.38, this.pos.y, 1.7, "player")
    // Slope limit: don't walk up walls of terrain
    if (t.heightAt(r.x, r.z) - t.heightAt(ox, oz) > 1.2) return 0
    this.pos.x = r.x
    this.pos.z = r.z
    return Math.hypot(this.pos.x - ox, this.pos.z - oz)
  }

  // ---- actions ------------------------------------------------------------------------------

  private tryDodge(mx: number, mz: number, wantMove: boolean): boolean {
    const cost = 22 * (1 - this.skills.dodgeStaminaPct)
    if (!this.grounded || !this.useStamina(cost)) return false
    if (wantMove) this.dodgeDir.set(mx, 0, mz).normalize()
    else this.dodgeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z)
    this.state = "dodging"
    this.iframes = 0.38
    this.animator.play("dodge", { restart: true })
    this.ctx.audio.play("dodge")
    this.ctx.particles.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 4)
    return true
  }

  private startAttack(kind: "light" | "heavy"): void {
    const ws = this.weaponStats
    const cls = ws?.weaponClass ?? "shortsword"
    const combo = COMBOS[cls]
    let spec: AttackSpec
    if (kind === "heavy") spec = combo.heavy
    else {
      spec = combo.light[this.comboIndex % combo.light.length]
      this.comboIndex = (this.comboIndex + 1) % combo.light.length
    }
    const cost = (ws?.staminaCost ?? 8) * (kind === "heavy" ? 1.7 : 1)
    if (!this.useStamina(cost)) {
      this.comboIndex = 0
      return
    }
    const speedFactor = (ws?.speed ?? 1.5) * 0.9
    this.attack = spec
    this.attackHitDone = false
    this.state = "attacking"
    this.bufferedAttack = null
    this.attackDuration = (spec.heavy ? 1 : 0.55) / speedFactor
    this.animator.play(spec.clip, { restart: true, speed: speedFactor * (spec.heavy ? 1 : 1) })
    this.ctx.audio.play(spec.heavy ? "swing_heavy" : "swing", { pitch: 0.9 + Math.random() * 0.2 })
    this.ctx.noise(this.pos.x, this.pos.z, 12)
    this.ctx.input.rumble(0.1, 0.25, 60)
  }

  private performMeleeHit(a: AttackSpec): void {
    const ws = this.weaponStats
    const range = (ws?.range ?? 1.6) + 0.35
    const arc = ws?.arc ?? Math.PI / 2
    const facing = this.yaw
    const candidates: { z: Zombie; d: number }[] = []
    for (const z of this.ctx.zombies) {
      if (z.dead) continue
      const dx = z.pos.x - this.pos.x
      const dz = z.pos.z - this.pos.z
      const d = Math.hypot(dx, dz) - z.radius
      if (d > range) continue
      const ang = Math.abs(angleDelta(facing, Math.atan2(dx, dz)))
      if (ang > arc / 2 + 0.25) continue
      candidates.push({ z, d })
    }
    candidates.sort((p, q) => p.d - q.d)
    let any = false
    for (const c of candidates.slice(0, a.maxTargets)) {
      const dmg = computeDamage(this.ctx.rng, {
        baseDamage: ws?.damage ?? 8,
        multiplier: a.multiplier * (a.heavy ? 1 + this.skills.heavyPct : 1),
        critChance: this.critChance(),
        critMultiplier: ws?.critMultiplier ?? 1.6,
        bonusPct: this.damageBonus(false),
        armor: c.z.type.armor,
        blockReduction: c.z.blocksFrom(this.pos.x, this.pos.z) ? 0.7 : 0,
      })
      c.z.takeHit(dmg.damage, dmg.crit, (ws?.impact ?? 0.3) * (a.heavy ? 1.6 : 1), a.heavy, this.pos.x, this.pos.z, ws?.lifeOnHit ?? 0, dmg.blocked)
      if (dmg.blocked) this.ctx.audio.play("hit_metal", { x: c.z.pos.x, y: 1, z: c.z.pos.z })
      if (ws?.lifeOnHit) this.heal(ws.lifeOnHit, true)
      any = true
    }
    if (any) {
      this.ctx.input.rumble(0.5, 0.4, 110)
      this.ctx.camera.addShake(a.heavy ? 0.5 : 0.22)
      this.wearWeapon(a.heavy, candidates[0].z.type.armor)
      this.addMastery(a.heavy ? 4 : 2)
    }
    // Corpses in reach can be hacked apart further
    if (this.ctx.gore.enabled) {
      for (const z of this.ctx.zombies) {
        if (!z.dead || z.finished || !z.humanoid.root.visible) continue
        const dx = z.pos.x - this.pos.x
        const dz = z.pos.z - this.pos.z
        const d = Math.hypot(dx, dz)
        if (d > range + 0.4 || Math.abs(angleDelta(facing, Math.atan2(dx, dz))) > arc / 2 + 0.3) continue
        const dir = new THREE.Vector3(dx / (d || 1), 0.4, dz / (d || 1))
        z.mutilate(dir, a.heavy)
        any = true
      }
    }
  }

  private wearWeapon(heavy: boolean, targetArmor: number): void {
    const w = this.weapon
    if (!w || w.durability === undefined) return
    const loss = durabilityLoss(heavy, targetArmor, Math.min(0.9, this.skills.durabilityPct + this.campBonus.durabilityPct))
    const before = w.durability
    w.durability = Math.max(0, w.durability - loss)
    if (before > 0 && w.durability <= 0) {
      events.emit("weaponBroke", { name: itemDef(w.defId).name })
      this.ctx.audio.play("weapon_break")
    }
  }

  private addMastery(amount: number): void {
    const ws = this.weaponStats
    if (!ws) return
    this.profile.mastery[ws.weaponClass] = (this.profile.mastery[ws.weaponClass] ?? 0) + amount
  }

  private hasAmmo(ws: EffectiveWeapon): boolean {
    return countItem(this.inventory, ws.ranged!.ammoId) > 0
  }

  private startReload(): void {
    const ws = this.weaponStats
    this.state = "reloading"
    const t = (ws?.ranged?.drawTime ?? 1) / (1 + this.skills.drawSpeedPct + (this.classId === "ranger" ? 0.2 : 0))
    this.animator.play("crossbow_reload", { restart: true, speed: 1 / t })
    this.ctx.audio.play("crossbow_reload")
  }

  private fireRanged(power: number): void {
    const ws = this.weaponStats
    if (!ws?.ranged) {
      this.state = "normal"
      return
    }
    const ammoId = ws.ranged.ammoId as "arrow" | "bolt"
    if (removeItem(this.inventory, ammoId, 1) < 1) {
      this.state = "normal"
      return
    }
    this.useStamina(ws.staminaCost)
    const dmg = computeDamage(this.ctx.rng, {
      baseDamage: ws.damage,
      multiplier: 0.4 + 0.6 * power,
      critChance: this.critChance(),
      critMultiplier: ws.critMultiplier,
      bonusPct: this.damageBonus(true),
      armor: 0,
      blockReduction: 0,
    })
    // Direction: toward the lock target, otherwise along the camera view
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z)
    let dir: THREE.Vector3
    if (this.lockTarget) {
      dir = new THREE.Vector3(this.lockTarget.pos.x, this.lockTarget.pos.y + 1.1, this.lockTarget.pos.z).sub(origin)
    } else {
      const cam = this.ctx.camera.camera
      dir = new THREE.Vector3()
      cam.getWorldDirection(dir)
      // Aim at the point 30 m ahead of the camera so the arrow meets the crosshair.
      const aim = cam.position.clone().addScaledVector(dir, 32)
      dir = aim.sub(origin)
    }
    dir.normalize()
    origin.addScaledVector(dir, 0.6)
    this.ctx.projectiles.fire(origin, dir, ws.ranged.projectileSpeed * (0.6 + 0.4 * power), dmg.damage, dmg.crit, ammoId, ws.impact, ws.lifeOnHit)
    this.ctx.audio.play(ws.weaponClass === "bow" ? "bow_release" : "crossbow_fire")
    this.ctx.noise(this.pos.x, this.pos.z, 6)
    this.ctx.input.rumble(0.2, 0.5, 80)
    this.animator.play("bow_release", { restart: true })
    this.state = "interacting" // brief recovery using the release clip
    this.addMastery(2)
    this.wearWeapon(false, 0)
    if (ws.weaponClass === "crossbow") {
      this.crossbowLoaded = false
      if (this.hasAmmo(ws)) {
        this.startReload()
      }
    }
  }

  private toggleLockOn(): void {
    if (this.lockTarget) {
      // Cycle to the next nearest target or release when there is none.
      const next = this.nearestEnemy(22, this.lockTarget)
      this.lockTarget = next
      return
    }
    this.lockTarget = this.nearestEnemy(22, null)
  }

  /** Switches the lock-on to the nearest enemy on the given side of the screen (-1 left, 1 right). */
  private switchLockTarget(dir: number): void {
    const cur = this.lockTarget
    if (!cur) return
    const camF = this.ctx.camera.forward()
    const camR = { x: -camF.z, z: camF.x }
    const curSide = (cur.pos.x - this.pos.x) * camR.x + (cur.pos.z - this.pos.z) * camR.z
    let best: Zombie | null = null
    let bestD = Infinity
    for (const z of this.ctx.zombies) {
      if (z === cur || z.dead || z.sleeping) continue
      const d = Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z)
      if (d > 26) continue
      const side = (z.pos.x - this.pos.x) * camR.x + (z.pos.z - this.pos.z) * camR.z
      if ((side - curSide) * dir <= 0) continue
      const score = Math.abs(side - curSide) + d * 0.3
      if (score < bestD) {
        bestD = score
        best = z
      }
    }
    if (best) {
      this.lockTarget = best
      this.ctx.audio.play("ui_move", { volume: 0.5 })
    }
  }

  private nearestEnemy(maxDist: number, exclude: Zombie | null): Zombie | null {
    let best: Zombie | null = null
    let bestD = maxDist
    const camF = this.ctx.camera.forward()
    for (const z of this.ctx.zombies) {
      if (z.dead || z === exclude || z.sleeping) continue
      const dx = z.pos.x - this.pos.x
      const dz = z.pos.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > bestD) continue
      // Prefer enemies in front of the camera
      const dot = (dx * camF.x + dz * camF.z) / Math.max(0.001, d)
      const score = d * (dot > 0 ? 1 : 1.8)
      if (score < bestD) {
        bestD = score
        best = z
      }
    }
    return best
  }

  /** Cycles to the next learned active ability (when several branches are unlocked). */
  nextAbility(): void {
    const list = activeSkills(this.profile.skills)
    if (list.length < 2) return
    this.abilityIndex = (this.abilityIndex + 1) % list.length
    this.ability = list[this.abilityIndex]
    events.emit("toast", { text: `Fähigkeit: ${this.ability.name}`, kind: "info" })
  }

  /** Fires the active ability if ready. Returns false when nothing happened. */
  useAbility(): boolean {
    const a = this.ability
    if (!a) {
      events.emit("toast", { text: "Keine aktive Fähigkeit gelernt (Fähigkeitenbaum, Stufe 3).", kind: "info" })
      return false
    }
    if (this.abilityCooldown > 0) {
      events.emit("toast", { text: `${a.name} ist noch ${Math.ceil(this.abilityCooldown)} s nicht bereit.`, kind: "info" })
      return false
    }
    if (this.state !== "normal" || this.dead) return false
    this.abilityCooldown = a.cooldown
    const ctx = this.ctx
    switch (a.id) {
      case "warcry": {
        this.animator.play("roar", { restart: true, speed: 1.6 })
        this.state = "interacting"
        ctx.audio.play("boss_roar", { volume: 0.6, pitch: 1.4 })
        ctx.camera.addShake(0.5)
        ctx.noise(this.pos.x, this.pos.z, 30)
        for (const z of ctx.zombies) {
          if (z.dead) continue
          if (Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z) < 7) z.forceStagger(this.pos.x, this.pos.z)
        }
        this.buffs.push({ stat: "damage", value: 0.25, remaining: 10 })
        break
      }
      case "adrenaline":
        this.stamina = this.maxStamina
        this.buffs.push({ stat: "speed", value: 0.3, remaining: 8 })
        ctx.audio.play("drink")
        ctx.particles.dust(this.pos.x, this.pos.y + 0.2, this.pos.z, 6)
        break
      case "fieldDressing": {
        const amount = this.maxHp * 0.35
        this.hot = { amount, remaining: 5, rate: amount / 5 }
        this.plague = 0
        ctx.audio.play("eat")
        break
      }
    }
    events.emit("toast", { text: `${a.name}!`, kind: "good" })
    return true
  }

  useQuickSlot(index: number): void {
    const slot = QUICK_SLOTS[index]
    if (index >= this.campBonus.quickSlots) {
      events.emit("toast", { text: "Dieser Schnellzugriff ist noch gesperrt (Waffenkammer ausbauen).", kind: "warn" })
      return
    }
    const item = this.inventory.equipment[slot]
    if (!item) return
    const def = itemDef(item.defId)
    if (def.consumable) {
      if (this.state !== "normal") return
      this.state = "using"
      this.usingItem = item
      this.usingApplied = false
      this.animator.play("use_item", { restart: true })
      this.ctx.audio.play(def.kind === "food" ? "eat" : "drink")
    } else if (def.weapon) {
      // Swap with the main hand
      const main = this.inventory.equipment.mainHand ?? null
      const sh = this.inventory.equipment.offHand
      if (def.weapon.twoHanded && sh) {
        // keep the shield in the slot only if the bag has room: move it to the quick slot instead
        this.inventory.equipment.mainHand = item
        this.inventory.equipment[slot] = main
        this.inventory.equipment.offHand = null
        const q = QUICK_SLOTS.find((s) => !this.inventory.equipment[s])
        if (q) this.inventory.equipment[q] = sh
        else this.inventory.slots[this.inventory.slots.findIndex((s) => s === null)] = sh
      } else {
        this.inventory.equipment.mainHand = item
        this.inventory.equipment[slot] = main
      }
      this.crossbowLoaded = true
      this.ctx.audio.play("ui_confirm")
    }
  }

  cycleWeapon(): void {
    const weapons = QUICK_SLOTS.map((s, i) => ({ s, i })).filter(({ s, i }) => i < this.campBonus.quickSlots && this.inventory.equipment[s] && itemDef(this.inventory.equipment[s]!.defId).weapon)
    if (!weapons.length) {
      events.emit("toast", { text: "Keine weitere Waffe im Schnellzugriff.", kind: "info" })
      return
    }
    this.useQuickSlot(weapons[0].i)
  }

  /** Consumes an item from the bag (used by the inventory screen). */
  useItemFromBag(item: ItemInstance): boolean {
    const def = itemDef(item.defId)
    if (!def.consumable) return false
    this.applyConsumable(item)
    this.ctx?.audio.play(def.kind === "food" ? "eat" : "drink")
    return true
  }

  private applyConsumable(item: ItemInstance): void {
    const def = itemDef(item.defId)
    const c = def.consumable
    if (!c) return
    const healMult = 1 + this.skills.healPct + this.campBonus.healPct + (def.kind === "remedy" ? this.campBonus.potionPct : 0)
    if (c.heal) this.heal(c.heal * healMult)
    if (c.healOverTime) this.hot = { amount: c.healOverTime.amount * healMult, remaining: c.healOverTime.seconds, rate: (c.healOverTime.amount * healMult) / c.healOverTime.seconds }
    if (c.stamina) this.stamina = Math.min(this.maxStamina, this.stamina + c.stamina)
    if (c.cure) this.plague = 0
    if (c.buff) {
      const existing = this.buffs.find((b) => b.stat === c.buff!.stat)
      if (existing) {
        existing.value = Math.max(existing.value, c.buff.value)
        existing.remaining = Math.max(existing.remaining, c.buff.seconds)
      } else this.buffs.push({ stat: c.buff.stat, value: c.buff.value, remaining: c.buff.seconds })
    }
    // Remove one from wherever the stack sits
    item.qty -= 1
    if (item.qty <= 0) {
      for (const s of QUICK_SLOTS) if (this.inventory.equipment[s] === item) this.inventory.equipment[s] = null
      const idx = this.inventory.slots.indexOf(item)
      if (idx >= 0) this.inventory.slots[idx] = null
      // Refill the quick slot from the bag if more of the same exist
      for (const s of QUICK_SLOTS) {
        if (this.inventory.equipment[s] === null || this.inventory.equipment[s] === undefined) {
          const j = this.inventory.slots.findIndex((x) => x && x.defId === item.defId)
          if (j >= 0 && !QUICK_SLOTS.some((q) => this.inventory.equipment[q]?.defId === item.defId)) {
            this.inventory.equipment[s] = this.inventory.slots[j]
            this.inventory.slots[j] = null
          }
          break
        }
      }
    }
    events.emit("toast", { text: `${def.name} benutzt`, kind: "good" })
  }

  heal(amount: number, quiet = false): void {
    if (this.state === "dead") return
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    if (!quiet && this.hp - before > 0.5) this.ctx.floatText(this.pos.x, this.pos.y + 2, this.pos.z, `+${Math.round(this.hp - before)}`, "#6fd36f")
  }

  playInteract(): void {
    if (this.state === "normal") {
      this.state = "interacting"
      this.animator.play("interact", { restart: true })
    }
  }

  /** Called by enemies. Returns true if damage went through (not dodged). */
  takeDamage(amount: number, fromX: number, fromZ: number, opts: { heavy?: boolean; unblockable?: boolean; plague?: boolean; knockback?: number; attacker?: Zombie } = {}): boolean {
    if (this.state === "dead") return false
    if (this.iframes > 0 || this.state === "dodging") return false
    const dirToAttacker = Math.atan2(fromX - this.pos.x, fromZ - this.pos.z)
    this.lastDamageDir = dirToAttacker
    let blocked = false
    let blockRed = 0
    const facing = Math.abs(angleDelta(this.yaw, dirToAttacker)) < Math.PI / 2.4
    // Perfect parry: block raised within 0.22 s before the hit lands
    if (this.blocking && !opts.unblockable && facing && this.blockHeld < 0.22 && this.blockHeld > 0) {
      this.animator.play("block_hit", { restart: true })
      this.ctx.audio.play("block", { pitch: 1.5 })
      this.ctx.audio.play("crit", { volume: 0.5 })
      this.ctx.particles.sparks(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 1.2, this.pos.z + Math.cos(this.yaw) * 0.6)
      this.ctx.floatText(this.pos.x, this.pos.y + 2.1, this.pos.z, "Perfekt!", "#ffd24a")
      this.ctx.hitStop(0.08)
      this.ctx.camera.addShake(0.2)
      this.ctx.input.rumble(0.3, 0.6, 90)
      this.stamina = Math.min(this.maxStamina, this.stamina + 10)
      if (opts.attacker && !opts.attacker.isBoss) opts.attacker.forceStagger(this.pos.x, this.pos.z)
      else opts.attacker?.forceStagger(this.pos.x, this.pos.z)
      this.addMastery(3)
      return false
    }
    if (this.blocking && !opts.unblockable && facing) {
      const sh = this.shield && this.shield.defId !== "torch_item" ? effectiveBlock(this.shield) : null
      let reduction = sh ? sh.reduction : 0.45
      let staminaCost = sh ? sh.staminaCost : 16
      reduction = Math.min(0.97, reduction + this.skills.blockPct + (this.classId === "knight" ? 0.1 : 0))
      if (this.skills.blockPct > 0) staminaCost *= 0.75
      if (this.stamina >= staminaCost * 0.5) {
        blocked = true
        blockRed = reduction
        this.stamina = Math.max(0, this.stamina - staminaCost * (opts.heavy ? 1.6 : 1))
        this.staminaDelay = 1
        this.animator.play("block_hit", { restart: true })
        this.ctx.audio.play("block")
        this.ctx.particles.sparks(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 1.2, this.pos.z + Math.cos(this.yaw) * 0.6)
        if (this.shield && this.shield.durability !== undefined) this.shield.durability = Math.max(0, this.shield.durability - 1.5)
        if (this.stamina <= 0) {
          // Guard break
          this.state = "staggered"
          this.stateTimer = 0.9
          this.animator.play("stagger", { restart: true })
          this.ctx.audio.play("block_break")
          blockRed *= 0.5
        }
      }
    }
    const dmg = computeDamage(this.ctx.rng, { baseDamage: amount, multiplier: 1, critChance: 0, critMultiplier: 1, bonusPct: 0, armor: this.armor, blockReduction: blockRed })
    this.applyDamage(dmg.damage, "Gegner", !blocked, opts.heavy)
    if (opts.plague && !blocked) this.plague = Math.max(this.plague, 12)
    if (opts.knockback && !blocked) {
      const kx = -Math.sin(dirToAttacker) * opts.knockback
      const kz = -Math.cos(dirToAttacker) * opts.knockback
      this.tryMove(kx, kz)
    }
    return !blocked
  }

  private applyDamage(amount: number, source: string, react = false, heavy = false): void {
    if (this.state === "dead" || amount <= 0) return
    this.hp -= amount
    this.sinceHurt = 0
    if (react && this.ctx) {
      // The player bleeds too, and hard hits splash the screen
      const back = new THREE.Vector3(-Math.sin(this.yaw), 0.2, -Math.cos(this.yaw))
      this.ctx.gore.spray(this.pos.x, this.pos.y + 1.2, this.pos.z, back, heavy ? 22 : 12, heavy ? 1.2 : 0.8)
      if (amount >= 10) this.ctx.gore.splatScreen(Math.min(0.75, amount / 45))
      this.ctx.gore.stain(this.humanoid, Math.min(0.08, amount / 400))
    }
    events.emit("playerDamaged", { amount, hp: this.hp, source })
    if (react) {
      this.humanoid.clothMaterial.emissive.setHex(0xff2020)
      this.humanoid.clothMaterial.emissiveIntensity = 0.5
      this.flashTimer = 0.1
      this.ctx.audio.play("player_hurt", { pitch: 0.9 + Math.random() * 0.2 })
      this.ctx.particles.blood(this.pos.x, this.pos.y + 1.2, this.pos.z, 8)
      this.ctx.input.rumble(0.7, 0.5, 160)
      this.ctx.camera.addShake(heavy ? 0.8 : 0.4)
      if (this.state === "normal" || this.state === "using" || this.state === "interacting" || (heavy && this.state !== "dodging")) {
        if (heavy && staggers(this.ctx.rng, 0.8, 0.3, true)) {
          this.state = "staggered"
          this.stateTimer = 0.7
          this.animator.play("stagger", { restart: true })
        } else if (this.state !== "attacking") {
          this.state = "staggered"
          this.stateTimer = 0.3
          this.animator.play("hit", { restart: true })
        }
      }
    }
    if (this.hp <= 0) {
      if (this.skills.secondWind && !this.secondWindUsed) {
        this.secondWindUsed = true
        this.hp = Math.round(this.maxHp * 0.3)
        this.iframes = 1.5
        events.emit("toast", { text: "Letzter Atem! Du überlebst mit 30 % Leben.", kind: "good" })
        return
      }
      this.die(source)
    }
  }

  die(cause: string): void {
    if (this.state === "dead") return
    this.hp = 0
    this.state = "dead"
    this.blocking = false
    this.lockTarget = null
    this.animator.play(Math.random() < 0.5 ? "death_back" : "death_front", { restart: true })
    this.ctx.audio.play("player_die")
    this.ctx.input.rumble(1, 1, 500)
    events.emit("playerDied", { cause })
  }

  get dead(): boolean {
    return this.state === "dead"
  }

  equipmentSlot(slot: EquipSlot): ItemInstance | null {
    return this.inventory.equipment[slot] ?? null
  }

  dispose(): void {
    if (this.humanoid) disposeHumanoid(this.humanoid)
    this.trail?.dispose()
    this.group.removeFromParent()
  }
}
