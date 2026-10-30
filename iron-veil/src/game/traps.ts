/**
 * traps.ts — shock traps: a battery-powered coil the player sets down in front of them. After a short warm-up it
 * discharges whenever an infected or a mercenary comes close: an electric arc to everyone nearby that hurts and
 * paralyses them for a few seconds. Three discharges, then the battery is flat and the trap is gone.
 * Pure logic (no three.js), unit-tested; the raid owns the meshes, effects and damage.
 */
import type { Vec3 } from "./types"

export interface ShockTrap { id: number; x: number; y: number; z: number; armT: number; charges: number; cooldown: number }

/** Seconds until a trap is live after it was set down. */
export const TRAP_ARM = 1.5
/** A hostile this close (m) sets the trap off. */
export const TRAP_TRIGGER = 2.6
/** The arc reaches everyone within this radius (m). */
export const TRAP_RADIUS = 4.5
export const TRAP_CHARGES = 3
/** Seconds the coil needs to recharge between two discharges. */
export const TRAP_RECHARGE = 1.6
export const TRAP_DAMAGE = 45
/** Seconds the arc paralyses (mercs blinded, infected stunned). */
export const TRAP_STUN = 3.5

/** Damage of one discharge to a target at p: full next to the coil, half at the edge, 0 outside. */
export function zapDamage(t: ShockTrap, p: Vec3): number {
  const d = Math.hypot(p.x - t.x, p.z - t.z)
  if (d > TRAP_RADIUS || Math.abs(p.y - t.y) > 2.2) return 0
  return TRAP_DAMAGE * (1 - 0.5 * d / TRAP_RADIUS)
}

/** True when p is close enough to set off the trap (live, charged, not recharging). */
export function triggers(t: ShockTrap, p: Vec3): boolean {
  if (t.armT > 0 || t.cooldown > 0 || t.charges <= 0) return false
  return Math.abs(p.y - t.y) <= 2.2 && Math.hypot(p.x - t.x, p.z - t.z) <= TRAP_TRIGGER
}

export class TrapField {
  traps: ShockTrap[] = []
  private nextId = 1

  place(x: number, y: number, z: number): ShockTrap {
    const t: ShockTrap = { id: this.nextId++, x, y, z, armT: TRAP_ARM, charges: TRAP_CHARGES, cooldown: 0 }
    this.traps.push(t)
    return t
  }

  /** Counts down warm-up and recharge; returns the ids of spent traps (removed once their last arc has faded). */
  update(dt: number): number[] {
    const gone: number[] = []
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i]
      t.armT = Math.max(0, t.armT - dt); t.cooldown = Math.max(0, t.cooldown - dt)
      if (t.charges <= 0 && t.cooldown <= 0) { gone.push(t.id); this.traps.splice(i, 1) }
    }
    return gone
  }

  /** Traps that discharge now because one of the positions is close; each uses up one charge and starts recharging. */
  discharge(positions: readonly Vec3[]): ShockTrap[] {
    const fired: ShockTrap[] = []
    for (const t of this.traps) {
      if (!positions.some(p => triggers(t, p))) continue
      t.charges--; t.cooldown = TRAP_RECHARGE
      fired.push(t)
    }
    return fired
  }

  clear(): void { this.traps = [] }
}
