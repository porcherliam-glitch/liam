/**
 * player.ts — the operator's body in first person: position, look, movement with acceleration, sprint and stamina,
 * crouch, carry weight, survival effects on speed, footsteps, and an interpolated eye position for smooth rendering
 * above 60 Hz. No DOM; three.js only for vectors.
 */
import * as THREE from "three"
import type { CollisionWorld } from "./collision"
import type { Input } from "./input"
import { freshVitals, speedFactor, staminaFactor, type Vitals } from "./survival"

export const EYE_STAND = 1.62, EYE_CROUCH = 1.05, RADIUS = 0.38
export const WALK = 4.4, SPRINT = 6.8, CROUCH_SPEED = 2.3

export interface MoveContext {
  collision: CollisionWorld
  /** Weapon handling multiplier (heavy weapons are slower). */
  weaponSpeed: number
  /** 0..1 ADS blend. */
  ads: number
  /** Carried weight / limit (1 = at the limit). */
  load: number
  /** True while healing/throwing/looting: no sprint. */
  busy: boolean
  reloading: boolean
}

export interface StepEvent { crouched: boolean; sprinting: boolean }

export class Player {
  readonly pos = new THREE.Vector3()
  readonly prevPos = new THREE.Vector3()
  readonly vel = new THREE.Vector2()
  yaw = 0
  pitch = 0
  /** Visual recoil kick that recovers on its own (radians). */
  readonly punch = new THREE.Vector2()
  eye = EYE_STAND
  prevEye = EYE_STAND
  crouched = false
  sprinting = false
  stamina = 100
  private staminaDelay = 0
  private exhausted = false
  sprintBlock = 0
  private stepDistance = 0
  vitals: Vitals = freshVitals()
  armor = 0
  armorMax = 0
  helmet = 0

  reset(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z); this.prevPos.copy(this.pos); this.vel.set(0, 0); this.yaw = yaw; this.pitch = 0; this.punch.set(0, 0)
    this.eye = this.prevEye = EYE_STAND; this.crouched = false; this.sprinting = false; this.stamina = 100; this.exhausted = false
    this.staminaDelay = 0; this.sprintBlock = 0; this.stepDistance = 0; this.vitals = freshVitals()
  }

  get health(): number { return this.vitals.health }
  set health(v: number) { this.vitals.health = v }
  get speed(): number { return this.vel.length() }
  get moving(): boolean { return this.vel.lengthSq() > 0.25 }

  /** Mouse/stick look; scale includes ADS sensitivity. */
  look(yaw: number, pitch: number): void { this.yaw += yaw; this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -1.45, 1.45) }

  /** One fixed step of movement; returns a footstep event when a step lands. */
  update(dt: number, input: Input, ctx: MoveContext): StepEvent | null {
    this.prevPos.copy(this.pos); this.prevEye = this.eye
    this.sprintBlock = Math.max(0, this.sprintBlock - dt)
    const inX = input.moveX, inZ = input.moveZ, hasInput = inX !== 0 || inZ !== 0
    if (this.crouched && input.sprintHeld && inZ > 0) this.crouched = false
    const overloaded = ctx.load > 1
    const wantSprint = input.sprintHeld && inZ > 0 && !this.crouched && ctx.ads < 0.3 && !ctx.busy && this.sprintBlock <= 0 && !this.exhausted && !overloaded
    this.sprinting = wantSprint && this.vel.length() > 2
    let speed = this.crouched ? CROUCH_SPEED : wantSprint ? SPRINT : WALK
    speed *= ctx.weaponSpeed * (1 - ctx.ads * 0.38) * speedFactor(this.vitals)
    if (ctx.load > 0.75) speed *= ctx.load > 1 ? 0.7 : 1 - (ctx.load - 0.75) * 0.4
    if (ctx.reloading && !wantSprint) speed *= 0.85
    // stamina
    if (this.sprinting) { this.stamina = Math.max(0, this.stamina - 20 * dt * (ctx.load > 0.75 ? 1.4 : 1)); this.staminaDelay = 0.9; if (this.stamina <= 0) this.exhausted = true }
    else { this.staminaDelay -= dt; if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + (this.crouched || !hasInput ? 24 : 16) * dt * staminaFactor(this.vitals)) }
    if (this.exhausted && this.stamina > 30) this.exhausted = false
    // acceleration toward the target velocity; keyboard diagonals normalised, stick magnitude kept
    const len = Math.hypot(inX, inZ), k = len > 1 ? 1 / len : 1
    const mx = inX * k, mz = inZ * k
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
    const tx = hasInput ? (mx * cos - mz * sin) * speed : 0, tz = hasInput ? (-mx * sin - mz * cos) * speed : 0
    const accel = hasInput ? 14 : 18
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt); this.vel.y += (tz - this.vel.y) * Math.min(1, accel * dt)
    ctx.collision.moveCircle(this.pos.x, this.pos.z, this.vel.x * dt, this.vel.y * dt, RADIUS, _xz)
    const moved = Math.hypot(_xz.x - this.pos.x, _xz.z - this.pos.z)
    this.pos.x = _xz.x; this.pos.z = _xz.z
    this.eye += ((this.crouched ? EYE_CROUCH : EYE_STAND) - this.eye) * Math.min(1, dt * 10)
    this.stepDistance += moved
    const stride = this.sprinting ? 2.4 : this.crouched ? 1.4 : 1.9
    if (this.stepDistance >= stride) { this.stepDistance = 0; return { crouched: this.crouched, sprinting: this.sprinting } }
    return null
  }

  /** Interpolated eye position for rendering between fixed steps. */
  renderEye(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha, this.prevEye + (this.eye - this.prevEye) * alpha, this.prevPos.z + (this.pos.z - this.prevPos.z) * alpha)
  }

  /** Aim direction from yaw/pitch plus the current recoil punch (independent of the last rendered frame). */
  aim(out: { fwd: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 }): void {
    _e.set(this.pitch + this.punch.x, this.yaw + this.punch.y, 0, "YXZ"); _qa.setFromEuler(_e)
    out.fwd.set(0, 0, -1).applyQuaternion(_qa); out.right.set(1, 0, 0).applyQuaternion(_qa); out.up.set(0, 1, 0).applyQuaternion(_qa)
  }
}

const _xz = { x: 0, z: 0 }
const _e = new THREE.Euler(), _qa = new THREE.Quaternion()
