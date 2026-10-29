/**
 * infectedData.ts — stats of the infected. Pure data; tuned by the infected pass.
 */
export type InfectedKind = "walker" | "runner" | "brute" | "screamer" | "spitter" | "stalker" | "crawler" | "boss"

export interface InfectedDef {
  name: string
  health: number
  /** Fraction of torso damage absorbed (brute plates, boss hide). */
  armor: number
  walkSpeed: number
  runSpeed: number
  /** Sight distance in daylight (scaled down at night like mercs). */
  sight: number
  /** Multiplier on noise radii they react to. */
  hearing: number
  /** Melee damage per hit and seconds per attack. */
  damage: number
  attackTime: number
  attackRange: number
  /** Chance per hit to cause bleeding and the infection added per hit. */
  bleedChance: number
  infection: number
  xp: number
  /** Relative spawn weight in infected zones. */
  weight: number
}

export const INFECTED: Record<InfectedKind, InfectedDef> = {
  walker: { name: "Infizierter", health: 70, armor: 0, walkSpeed: 0.9, runSpeed: 2.6, sight: 22, hearing: 1, damage: 12, attackTime: 1.1, attackRange: 1.5, bleedChance: 0.3, infection: 6, xp: 15, weight: 10 },
  runner: { name: "Läufer", health: 55, armor: 0, walkSpeed: 1.4, runSpeed: 6.2, sight: 28, hearing: 1.2, damage: 9, attackTime: 0.7, attackRange: 1.4, bleedChance: 0.35, infection: 5, xp: 25, weight: 4 },
  brute: { name: "Koloss-Brut", health: 420, armor: 0.45, walkSpeed: 0.8, runSpeed: 3.4, sight: 20, hearing: 0.8, damage: 38, attackTime: 1.8, attackRange: 2.1, bleedChance: 0.6, infection: 10, xp: 90, weight: 1 },
  screamer: { name: "Schreier", health: 60, armor: 0, walkSpeed: 0.8, runSpeed: 3.6, sight: 30, hearing: 1.5, damage: 7, attackTime: 1.2, attackRange: 1.4, bleedChance: 0.2, infection: 5, xp: 45, weight: 1 },
  spitter: { name: "Speier", health: 80, armor: 0, walkSpeed: 0.9, runSpeed: 2.8, sight: 30, hearing: 1, damage: 14, attackTime: 2.4, attackRange: 14, bleedChance: 0, infection: 12, xp: 50, weight: 1.5 },
  stalker: { name: "Pirscher", health: 90, armor: 0.1, walkSpeed: 1.2, runSpeed: 5.4, sight: 26, hearing: 1.4, damage: 22, attackTime: 0.9, attackRange: 1.6, bleedChance: 0.55, infection: 8, xp: 60, weight: 1 },
  crawler: { name: "Kriecher", health: 40, armor: 0, walkSpeed: 0.5, runSpeed: 1.6, sight: 14, hearing: 1, damage: 10, attackTime: 1.0, attackRange: 1.2, bleedChance: 0.4, infection: 8, xp: 10, weight: 2 },
  boss: { name: "Der Koloss", health: 2600, armor: 0.3, walkSpeed: 1.1, runSpeed: 4.2, sight: 40, hearing: 1, damage: 55, attackTime: 2.0, attackRange: 3.2, bleedChance: 0.8, infection: 20, xp: 900, weight: 0 },
}
