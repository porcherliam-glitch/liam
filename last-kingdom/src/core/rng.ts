// Seeded pseudo-random number generator (mulberry32) plus helpers.
// Every world is built from a seed so a map can be rebuilt identically for tests.

export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
    if (this.s === 0) this.s = 0x9e3779b9
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)]
  }

  /** Picks an entry by weight. Entries with weight <= 0 are never picked. */
  weighted<T>(list: readonly T[], weight: (item: T) => number): T {
    let total = 0
    for (const item of list) total += Math.max(0, weight(item))
    if (total <= 0) return list[0]
    let r = this.next() * total
    for (const item of list) {
      r -= Math.max(0, weight(item))
      if (r <= 0) return item
    }
    return list[list.length - 1]
  }

  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const t = list[i]
      list[i] = list[j]
      list[j] = t
    }
    return list
  }

  gaussian(mean = 0, sd = 1): number {
    const u = 1 - this.next()
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff))
  }
}

export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Shared unseeded generator for cosmetic randomness (particles, audio). */
export const cosmetic = new Rng((Date.now() ^ 0x5bd1e995) >>> 0)
