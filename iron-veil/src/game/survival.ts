/**
 * survival.ts — the player's body during a raid: health, energy (food), water, bleeding, infection, painkiller and
 * stim timers, and what using an item does. Pure logic, unit-tested; raid.ts calls stepVitals every fixed step.
 */
import type { UseDef } from "./items"

export type Bleed = "none" | "light" | "heavy"

export interface Vitals {
  health: number
  energy: number
  water: number
  bleed: Bleed
  /** 0..100; grows by itself once infected. */
  infection: number
  /** Remaining seconds of painkiller / stim. */
  painkiller: number
  boost: number
}

export interface VitalsModifiers { metabolism?: boolean; immunology?: boolean; sprinting?: boolean }

/** Seconds for energy / water to drain from 100 to 0 while walking. */
export const ENERGY_DRAIN = 1800
export const WATER_DRAIN = 1200
export const BLEED_DPS = { none: 0, light: 0.8, heavy: 2.4 } as const

export function freshVitals(): Vitals { return { health: 100, energy: 100, water: 100, bleed: "none", infection: 0, painkiller: 0, boost: 0 } }

/** Advances the body by dt seconds; returns the health lost this step (for HUD/audio cues). */
export function stepVitals(v: Vitals, dt: number, m: VitalsModifiers = {}): number {
  const before = v.health
  const effort = m.sprinting ? 1.7 : 1, meta = m.metabolism ? 0.7 : 1
  v.energy = Math.max(0, v.energy - dt * 100 / ENERGY_DRAIN * effort * meta)
  v.water = Math.max(0, v.water - dt * 100 / WATER_DRAIN * effort * meta)
  if (v.energy <= 0) v.health -= dt * 0.35
  if (v.water <= 0) v.health -= dt * 0.5
  v.health -= dt * BLEED_DPS[v.bleed]
  if (v.infection > 0) {
    v.infection = Math.min(100, v.infection + dt * 0.12 * (m.immunology ? 0.6 : 1))
    if (v.infection >= 100) v.health -= dt * 0.6
  }
  v.painkiller = Math.max(0, v.painkiller - dt)
  v.boost = Math.max(0, v.boost - dt)
  v.health = Math.max(0, v.health)
  return before - v.health
}

/** Applies an item's effects; fieldmed boosts healing by 40 %. Returns a short German summary for the HUD. */
export function applyUse(v: Vitals, use: UseDef, fieldmed = false): string {
  const parts: string[] = []
  if (use.heal) { const h = Math.round(use.heal * (fieldmed ? 1.4 : 1)); v.health = Math.min(100, v.health + h); parts.push(`+${h} Gesundheit`) }
  if (use.stopBleed && v.bleed !== "none" && (use.stopBleed === "heavy" || v.bleed === "light")) { v.bleed = "none"; parts.push("Blutung gestillt") }
  if (use.energy) { v.energy = Math.min(100, v.energy + use.energy); parts.push(`+${use.energy} Energie`) }
  if (use.water) { v.water = Math.min(100, v.water + use.water); parts.push(`+${use.water} Wasser`) }
  if (use.infection) { v.infection = Math.max(0, v.infection + use.infection); parts.push("Infektion gesenkt") }
  if (use.painkiller) { v.painkiller = Math.max(v.painkiller, use.painkiller); parts.push("Schmerzfrei") }
  if (use.boost) { v.boost = Math.max(v.boost, use.boost); parts.push("Stimuliert") }
  return parts.join(" · ")
}

/** Movement speed multiplier from the body's state (low health limps unless on painkillers, stims speed up). */
export function speedFactor(v: Vitals): number {
  let k = 1
  if (v.health < 30 && v.painkiller <= 0) k *= 0.85
  if (v.energy <= 0 || v.water <= 0) k *= 0.9
  if (v.boost > 0) k *= 1.15
  return k
}

/** Stamina regeneration multiplier (hunger, thirst and infection make you tire quickly). */
export function staminaFactor(v: Vitals): number {
  let k = 1
  if (v.energy < 20) k *= 0.6
  if (v.water < 20) k *= 0.6
  if (v.infection > 50) k *= 0.75
  if (v.boost > 0) k *= 3
  return k
}

/** Upgrades bleeding when hit (never downgrades). */
export function addBleed(v: Vitals, b: Bleed): void { if (b === "heavy" || (b === "light" && v.bleed === "none")) v.bleed = b }
