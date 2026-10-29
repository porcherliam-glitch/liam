/**
 * weapons.ts — runtime state of a carried weapon: magazine, fire rate, semi/auto trigger, reloads that draw real
 * rounds from the backpack (AmmoSource), ammo type switching, spread/bloom, damage falloff, and melee swings.
 * Pure logic, unit-tested.
 */
import { LIMB_MULTIPLIER } from "./data"
import { AMMO_FOR, effectiveWeapon, type AmmoId, type WeaponDef, type WeaponId, type WeaponMods } from "./weaponData"

export type FireResult = "fired" | "empty" | "blocked"

/** Where reloads take rounds from (the raid backpack) and unloaded rounds go back to. */
export interface AmmoSource {
  count(ammo: AmmoId): number
  take(ammo: AmmoId, n: number): number
  give(ammo: AmmoId, n: number): number
}

export class WeaponRuntime {
  def: WeaponDef
  ammo: AmmoId | null
  mag: number
  cooldown = 0
  reloadLeft = 0
  reloadTotal = 0
  bloom = 0
  burst = 0
  private queuedShot = 0

  constructor(readonly id: WeaponId, readonly mods: WeaponMods, ammo: AmmoId | null, mag = 0) {
    const base = effectiveWeapon(id, mods)
    this.ammo = base.caliber ? ammo ?? AMMO_FOR[base.caliber][0] : null
    this.def = effectiveWeapon(id, mods, this.ammo ?? undefined)
    this.mag = Math.max(0, Math.min(this.def.magazine, mag))
  }

  get isMelee(): boolean { return this.def.cls === "melee" }
  get reloading(): boolean { return this.reloadLeft > 0 }
  reserve(src: AmmoSource): number { return this.ammo ? src.count(this.ammo) : 0 }
  canReload(src: AmmoSource): boolean { return !this.isMelee && !this.reloading && this.mag < this.def.magazine && this.reserve(src) > 0 }

  /** Fills the magazine from the source (raid start). */
  load(src: AmmoSource): void { if (this.ammo) this.mag += src.take(this.ammo, this.def.magazine - this.mag) }

  update(dt: number, src: AmmoSource): "reloaded" | null {
    // may go slightly negative during continuous fire so automatic weapons keep their exact rate at a fixed 60 Hz step
    this.cooldown = Math.max(this.burst > 0 ? -0.02 : 0, this.cooldown - dt)
    this.queuedShot = Math.max(0, this.queuedShot - dt)
    this.bloom = Math.max(0, this.bloom - this.def.spreadRecovery * dt)
    if (this.reloadLeft <= 0) return null
    this.reloadLeft -= dt
    if (this.reloadLeft > 0) return null
    if (!this.ammo) { this.reloadLeft = 0; return null }
    if (this.def.singleLoad) {
      this.mag += src.take(this.ammo, 1)
      this.reloadLeft = this.mag < this.def.magazine && src.count(this.ammo) > 0 ? this.reloadTotal : 0
      return "reloaded"
    }
    this.mag += src.take(this.ammo, this.def.magazine - this.mag)
    this.reloadLeft = 0
    return "reloaded"
  }

  startReload(src: AmmoSource): boolean {
    if (!this.canReload(src)) return false
    const time = this.def.singleLoad ? this.def.reload : this.def.reload * (this.mag > 0 ? 0.85 : 1)
    this.reloadLeft = this.reloadTotal = time
    this.burst = 0
    return true
  }

  cancelReload(): void { this.reloadLeft = 0 }

  /** Unloads the magazine into the source and reloads with another ammo type of the same calibre. */
  switchAmmo(next: AmmoId, src: AmmoSource): boolean {
    if (!this.def.caliber || next === this.ammo || !AMMO_FOR[this.def.caliber].includes(next) || src.count(next) <= 0) return false
    if (this.ammo && this.mag > 0) src.give(this.ammo, this.mag)
    this.mag = 0; this.ammo = next; this.reloadLeft = 0
    this.def = effectiveWeapon(this.id, this.mods, next)
    return this.startReload(src)
  }

  /** Next ammo type of this calibre that the source holds, or null. */
  nextAmmo(src: AmmoSource): AmmoId | null {
    if (!this.def.caliber) return null
    const list = AMMO_FOR[this.def.caliber], i = Math.max(0, list.indexOf(this.ammo ?? list[0]))
    for (let k = 1; k <= list.length; k++) { const a = list[(i + k) % list.length]; if (a !== this.ammo && src.count(a) > 0) return a }
    return null
  }

  /**
   * Trigger handling. pressed = new click this step, held = button is down. Auto weapons fire while held; semi-auto
   * weapons fire once per click (buffered 0.18 s). Melee weapons start a swing ("fired") at most once per swing time.
   */
  trigger(pressed: boolean, held: boolean): FireResult {
    if (pressed) this.queuedShot = 0.18
    if (!held) { this.burst = 0; if (this.cooldown < 0) this.cooldown = 0 }
    const wantsShot = this.queuedShot > 0 || (this.def.auto && held)
    if (!wantsShot) return "blocked"
    if (this.reloading) { if (this.def.singleLoad && pressed && this.mag > 0) this.reloadLeft = 0; else return "blocked" }
    if (this.cooldown > 1e-6) return "blocked"
    this.queuedShot = 0
    if (this.isMelee) { this.cooldown = this.def.fireInterval; return "fired" }
    if (this.mag <= 0) { this.cooldown = 0.25; return "empty" }
    this.mag--
    this.cooldown += this.def.fireInterval
    this.bloom = Math.min(this.def.spreadHip * 1.5, this.bloom + this.def.spreadPerShot)
    this.burst++
    return "fired"
  }

  spread(ads: number, move: number, crouched: boolean): number {
    const d = this.def
    const base = d.spreadHip + (d.spreadAds - d.spreadHip) * ads
    const movement = d.spreadMove * Math.min(1.6, move) * (1 - ads * 0.6)
    return (base + movement + this.bloom * (1 - ads * 0.5)) * (crouched ? 0.8 : 1)
  }
}

/** Damage of one bullet/pellet at a distance and hit zone (before the target's armour). */
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
