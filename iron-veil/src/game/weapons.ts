/**
 * weapons.ts — runtime state of one carried weapon: magazine, reserve, fire rate, semi/auto trigger, reload
 * (magazine or shell-by-shell for the shotgun), spread/bloom and damage falloff. Pure logic, unit-tested.
 */
import { LIMB_MULTIPLIER, WEAPONS, type WeaponDef } from "./data"
import type { WeaponId } from "./types"

export type FireResult = "fired" | "empty" | "blocked"

export class WeaponRuntime {
  readonly def: WeaponDef
  mag: number
  /** Reserve rounds (ignored when infinite). */
  reserve: number
  readonly infinite: boolean
  cooldown = 0
  /** Remaining reload time of the current reload step; 0 = not reloading. */
  reloadLeft = 0
  /** Duration of the current reload step (for HUD progress). */
  reloadTotal = 0
  /** Accumulated bloom (radians). */
  bloom = 0
  /** Shots fired in the current trigger pull (for auto weapons' recoil pattern). */
  burst = 0
  /** A semi-auto click that arrived during the cooldown is kept briefly so fast clicking feels responsive. */
  private queuedShot = 0
  private shellReload = false

  constructor(id: WeaponId, reserveRounds: number) {
    this.def = WEAPONS[id]
    this.infinite = this.def.roundsPerPack === 0
    this.mag = this.def.magazine
    this.reserve = this.infinite ? 0 : Math.max(0, reserveRounds)
  }

  get id(): WeaponId { return this.def.id }
  get reloading(): boolean { return this.reloadLeft > 0 }
  /** Rounds in magazine plus reserve. */
  get total(): number { return this.mag + this.reserve }
  get canReload(): boolean { return !this.reloading && this.mag < this.def.magazine && (this.infinite || this.reserve > 0) }

  /**
   * Advances timers. Returns "reloaded" when a magazine (or one shotgun shell) went in this step, otherwise null.
   */
  update(dt: number): "reloaded" | null {
    // may go slightly negative so automatic fire keeps its exact rate at a fixed 60 Hz step
    this.cooldown = Math.max(-0.02, this.cooldown - dt)
    this.queuedShot = Math.max(0, this.queuedShot - dt)
    this.bloom = Math.max(0, this.bloom - this.def.spreadRecovery * dt)
    if (this.reloadLeft <= 0) return null
    this.reloadLeft -= dt
    if (this.reloadLeft > 0) return null
    if (this.shellReload) {
      this.mag++; if (!this.infinite) this.reserve--
      if (this.mag < this.def.magazine && (this.infinite || this.reserve > 0)) { this.reloadLeft = this.reloadTotal } else { this.reloadLeft = 0 }
      return "reloaded"
    }
    const needed = this.def.magazine - this.mag
    const amount = this.infinite ? needed : Math.min(needed, this.reserve)
    this.mag += amount; if (!this.infinite) this.reserve -= amount
    this.reloadLeft = 0
    return "reloaded"
  }

  startReload(): boolean {
    if (!this.canReload) return false
    this.shellReload = this.def.cls === "shotgun"
    const time = this.shellReload ? this.def.reload / this.def.magazine : this.def.reload * (this.mag > 0 ? 0.85 : 1)
    this.reloadLeft = this.reloadTotal = time
    this.burst = 0
    return true
  }

  /** Cancels a reload (weapon switch). Shotgun shells already loaded stay loaded. */
  cancelReload(): void { this.reloadLeft = 0 }

  /**
   * Trigger handling. pressed = new click this step, held = button is down. Auto weapons fire while held; semi-auto
   * weapons fire once per click (a click during the cooldown is buffered for 0.18 s). Returns "fired" when a shot
   * left the barrel, "empty" when the trigger was pulled on an empty magazine, otherwise "blocked".
   */
  trigger(pressed: boolean, held: boolean): FireResult {
    if (pressed) this.queuedShot = 0.18
    if (!held) { this.burst = 0; if (this.cooldown < 0) this.cooldown = 0 }
    const wantsShot = this.queuedShot > 0 || (this.def.auto && held)
    if (!wantsShot) return "blocked"
    // the shotgun may interrupt a shell-by-shell reload by firing
    if (this.reloading) { if (this.shellReload && pressed && this.mag > 0) this.reloadLeft = 0; else return "blocked" }
    if (this.cooldown > 1e-6) return "blocked"
    this.queuedShot = 0
    if (this.mag <= 0) { this.cooldown = 0.25; return "empty" }
    this.mag--
    this.cooldown += this.def.fireInterval
    this.bloom = Math.min(this.def.spreadHip * 1.5, this.bloom + this.def.spreadPerShot)
    this.burst++
    return "fired"
  }

  /**
   * Current cone half-angle in radians. ads 0..1 blends hip→ADS spread, move 0..1 is horizontal speed relative to
   * walking speed (1 = walking, >1 sprinting), crouched tightens the cone by 20 %.
   */
  spread(ads: number, move: number, crouched: boolean): number {
    const d = this.def
    const base = d.spreadHip + (d.spreadAds - d.spreadHip) * ads
    const movement = d.spreadMove * Math.min(1.6, move) * (1 - ads * 0.6)
    return (base + movement + this.bloom * (1 - ads * 0.5)) * (crouched ? 0.8 : 1)
  }
}

/** Damage of one bullet/pellet at a distance and hit zone (before enemy armour). */
export function damageAt(def: WeaponDef, distance: number, part: "head" | "body" | "limb", bonus = 1): number {
  const t = Math.min(1, Math.max(0, (distance - def.rangeStart) / Math.max(1, def.rangeEnd - def.rangeStart)))
  const falloff = 1 - (1 - def.minDamageFactor) * t
  const zone = part === "head" ? def.headMultiplier : part === "limb" ? LIMB_MULTIPLIER : 1
  return def.damage * falloff * zone * bonus
}

/** Random direction inside a cone (uniform over the disc) around forward; writes into out. rng returns [0, 1). */
export function coneOffset(spread: number, rng: () => number, out: { x: number; y: number }): { x: number; y: number } {
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread
  out.x = Math.cos(a) * r; out.y = Math.sin(a) * r
  return out
}
