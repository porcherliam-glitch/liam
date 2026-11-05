// Damage formulas. Pure functions so they can be unit-tested.

import type { Rng } from "../core/rng"

export interface AttackParams {
  baseDamage: number
  /** Light = 1, heavy ~ 1.8. */
  multiplier: number
  critChance: number
  critMultiplier: number
  /** Global damage bonus from skills, mastery, buffs (e.g. 0.25 = +25 %). */
  bonusPct: number
  /** Target armour (flat). */
  armor: number
  /** Blocking reduces by this fraction (0 if not blocking). */
  blockReduction: number
}

export interface DamageResult {
  damage: number
  crit: boolean
  blocked: boolean
}

export function armorFactor(armor: number): number {
  return 100 / (100 + Math.max(0, armor))
}

export function computeDamage(rng: Rng, p: AttackParams): DamageResult {
  const crit = rng.chance(p.critChance)
  let dmg = p.baseDamage * p.multiplier * (1 + p.bonusPct)
  if (crit) dmg *= p.critMultiplier
  dmg *= armorFactor(p.armor)
  let blocked = false
  if (p.blockReduction > 0) {
    dmg *= 1 - p.blockReduction
    blocked = true
  }
  // ±10 % variance keeps hits from feeling identical
  dmg *= rng.range(0.9, 1.1)
  return { damage: Math.max(1, Math.round(dmg)), crit, blocked }
}

/** Whether a hit staggers a target: impact vs poise with some luck. */
export function staggers(rng: Rng, impact: number, poise: number, heavy: boolean): boolean {
  const chance = Math.max(0, Math.min(1, impact * (heavy ? 1.5 : 1) - poise * 0.9 + 0.15))
  return rng.chance(chance)
}

/** Durability lost per landed hit; heavy attacks wear faster, armoured targets more. */
export function durabilityLoss(heavy: boolean, targetArmor: number, reductionPct: number): number {
  const base = heavy ? 1.6 : 1
  return base * (1 + targetArmor / 60) * (1 - reductionPct)
}

/** Movement speed multiplier for carried weight above the limit (over-encumbered). */
export function encumbrance(weight: number, limit: number): number {
  if (weight <= limit) return 1
  const over = (weight - limit) / limit
  return Math.max(0.35, 1 - over * 1.2)
}

/** Stamina cost multiplier at low stamina, used to make exhaustion matter. */
export function exhaustionPenalty(stamina: number, max: number): number {
  return stamina / max < 0.2 ? 0.6 : 1
}
