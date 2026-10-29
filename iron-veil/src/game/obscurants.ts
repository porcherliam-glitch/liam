/**
 * obscurants.ts — smoke clouds that block sight but not bullets. A cloud is a vertical cylinder that billows up to
 * its full radius in the first seconds, holds, then thins out and shrinks before it is gone. Mercenaries and infected
 * test their line of sight against blocks(); the raid adds clouds (smoke grenades) and draws them with Effects.
 * Pure logic (no three.js), unit-tested.
 */
import type { Vec3 } from "./types"

export interface SmokeCloud { x: number; z: number; maxR: number; top: number; life: number; age: number }

/** Seconds until a cloud reaches full size, and how long it takes to thin out at the end. */
export const SMOKE_GROW = 3
export const SMOKE_FADE = 5
export const SMOKE_LIFE = 28
export const SMOKE_RADIUS = 5.5

export class Obscurants {
  clouds: SmokeCloud[] = []

  add(x: number, z: number, maxR = SMOKE_RADIUS, life = SMOKE_LIFE): SmokeCloud {
    const c: SmokeCloud = { x, z, maxR, top: 3.6, life, age: 0 }
    this.clouds.push(c)
    return c
  }

  /** Current radius of a cloud (0 when gone). */
  radius(c: SmokeCloud): number {
    if (c.age >= c.life) return 0
    const grow = Math.min(1, c.age / SMOKE_GROW), fade = Math.min(1, (c.life - c.age) / SMOKE_FADE)
    return c.maxR * Math.sqrt(grow) * (0.35 + 0.65 * fade)
  }

  /** 0..1 how thick the smoke is (sight is blocked above 0.35). */
  density(c: SmokeCloud): number {
    if (c.age >= c.life) return 0
    return Math.min(1, c.age / 1.2) * Math.min(1, (c.life - c.age) / SMOKE_FADE)
  }

  update(dt: number): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) { const c = this.clouds[i]; c.age += dt; if (c.age >= c.life) this.clouds.splice(i, 1) }
  }

  /** True when the segment a → b passes through the dense part of a cloud (sight only). */
  blocks(a: Vec3, b: Vec3): boolean {
    for (const c of this.clouds) {
      if (this.density(c) < 0.35) continue
      const r = this.radius(c) * 0.85
      if (r <= 0.2) continue
      // closest point of the horizontal segment to the cloud axis
      const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz
      const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2)) : 0
      const px = a.x + dx * t - c.x, pz = a.z + dz * t - c.z
      if (px * px + pz * pz > r * r) continue
      // half the chord length inside the circle: the part of the segment that is in the smoke
      const dist = Math.sqrt(len2), chord = Math.sqrt(Math.max(0, r * r - (px * px + pz * pz)))
      const y = a.y + (b.y - a.y) * t
      if (y > c.top) continue
      // both ends inside or the line crosses at least 1.5 m of smoke
      if (2 * chord >= 1.5 || dist < 1.5) return true
    }
    return false
  }

  /** True when p stands inside a dense cloud. */
  inside(p: Vec3): boolean {
    for (const c of this.clouds) {
      if (this.density(c) < 0.35) continue
      const r = this.radius(c) * 0.85
      if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < r * r && p.y < c.top) return true
    }
    return false
  }

  clear(): void { this.clouds = [] }
}
