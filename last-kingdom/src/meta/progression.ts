// Experience curve, levels and weapon mastery. Pure functions, covered by unit tests.

export const MAX_LEVEL = 40

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.55) + 60 * level)
}

export function totalXpForLevel(level: number): number {
  let sum = 0
  for (let l = 1; l < level; l++) sum += xpForLevel(l)
  return sum
}

/** Applies XP; returns the number of levels gained. */
export function applyXp(state: { level: number; xp: number; skillPoints: number }, amount: number): number {
  let gained = 0
  state.xp += Math.max(0, Math.round(amount))
  while (state.level < MAX_LEVEL && state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level)
    state.level++
    state.skillPoints += 1
    gained++
  }
  if (state.level >= MAX_LEVEL) state.xp = Math.min(state.xp, xpForLevel(MAX_LEVEL - 1))
  return gained
}

export const MASTERY_RANKS = ["Neuling", "Geselle", "Veteran", "Meister", "Großmeister"]

/** Mastery rank 0..4 for a weapon class from accumulated mastery XP. */
export function masteryRank(xp: number): number {
  if (xp >= 4000) return 4
  if (xp >= 1800) return 3
  if (xp >= 700) return 2
  if (xp >= 200) return 1
  return 0
}

export function masteryNext(xp: number): number | null {
  const steps = [200, 700, 1800, 4000]
  for (const s of steps) if (xp < s) return s
  return null
}

/** Damage multiplier granted by mastery (up to +20 %). */
export function masteryDamageMultiplier(xp: number): number {
  return 1 + masteryRank(xp) * 0.05
}

export const REPUTATION_RANKS = [
  { min: 0, name: "Fremder", discount: 0 },
  { min: 50, name: "Bekannter", discount: 0.05 },
  { min: 150, name: "Kunde", discount: 0.1 },
  { min: 350, name: "Freund", discount: 0.15 },
  { min: 700, name: "Partner", discount: 0.2 },
  { min: 1200, name: "Legende", discount: 0.25 },
]

export function reputationRank(rep: number) {
  let out = REPUTATION_RANKS[0]
  for (const r of REPUTATION_RANKS) if (rep >= r.min) out = r
  return out
}
