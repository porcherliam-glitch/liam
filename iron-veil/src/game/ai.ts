/**
 * ai.ts — pure enemy-AI math (no three.js): seeded RNG, angle helpers, the hit-chance formula, perception (vision range,
 * field of view, detection-meter rate), cover ranking, flank points and ray-vs-posed-capsule tests. Unit-tested.
 * enemies.ts owns the state machine and calls these helpers; keeping them here makes the balance numbers testable.
 */
import type { Vec2, Vec3 } from "./types"

export type Rng = () => number

/** Mulberry32: small, fast, deterministic. All AI decisions draw from one of these (never Math.random). */
export function createRng(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
export function randRange(rng: Rng, a: number, b: number): number { return a + (b - a) * rng() }
/** Integer in [a, b] (inclusive). */
export function randInt(rng: Rng, a: number, b: number): number { return a + Math.floor(rng() * (b - a + 1 - 1e-9)) }

// ---------------------------------------------------------------- angles

export const TAU = Math.PI * 2
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}
/** Yaw that faces along (dx, dz): 0 = facing -Z, positive turns left (counter-clockwise from above). */
export function yawTo(dx: number, dz: number): number { return Math.atan2(-dx, -dz) }
/** Moves angle `cur` toward `target` by at most `maxStep` (shortest way round). */
export function approachAngle(cur: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - cur)
  return Math.abs(d) <= maxStep ? target : wrapAngle(cur + Math.sign(d) * maxStep)
}
export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v }

// ---------------------------------------------------------------- shooting

export interface HitChanceInput {
  /** ENEMIES[kind].accuracy: chance against a still, standing player at 10 m. */
  accuracy: number
  distance: number
  /** ENEMIES[kind].range (falloff reaches its floor there). */
  range: number
  /** Player horizontal speed (m/s). */
  playerSpeed: number
  sprinting: boolean
  crouched: boolean
  /** DIFFICULTY[x].enemyAccuracy. */
  difficultyAccuracy: number
  /** First burst after spotting the player (surprise penalty). */
  firstBurst: boolean
}

/** Distance factor: 1 at 10 m, up to 1.3 at point blank, falling linearly to 0.35 at the weapon's range. */
export function distanceFalloff(distance: number, range: number): number {
  if (distance <= 10) return 1 + 0.3 * (10 - Math.max(0, distance)) / 10
  return Math.max(0.35, 1 - 0.65 * (distance - 10) / Math.max(1, range - 10))
}

/** Per-bullet hit probability: accuracy × distance × target movement × crouch × difficulty × first burst, clamped. */
export function hitChance(p: HitChanceInput): number {
  const movement = p.sprinting ? 0.55 : p.playerSpeed > 0.6 ? 0.8 : 1
  const v = p.accuracy * distanceFalloff(p.distance, p.range) * movement * (p.crouched ? 0.8 : 1) * p.difficultyAccuracy * (p.firstBurst ? 0.6 : 1)
  return clamp(v, 0.04, 0.85)
}

// ---------------------------------------------------------------- perception

export interface VisionInput {
  /** ENEMIES[kind].vision (daylight sight distance). */
  vision: number
  /** THEMES[theme].visionScale. */
  visionScale: number
  night: boolean
  flashlight: boolean
  crouched: boolean
  /** Player fired within the last moments (muzzle flash). */
  shooting: boolean
}

/** Distance at which this enemy can see the player at all. */
export function visionRange(p: VisionInput): number {
  let r = p.vision * p.visionScale
  if (p.night && p.flashlight) r = Math.max(r, p.vision * 0.95)
  if (p.shooting) r = Math.max(r, p.vision * (p.night ? 0.9 : 1.1))
  if (p.crouched && !p.shooting) r *= 0.7
  return r
}

/** True when the direction (dx, dz) lies within the horizontal field of view (full angle in degrees). */
export function inFieldOfView(facingYaw: number, dx: number, dz: number, fovDeg: number): boolean {
  return Math.abs(wrapAngle(yawTo(dx, dz) - facingYaw)) <= fovDeg * Math.PI / 360
}
/** True when the direction lies in the outer part of the field of view (slower detection). */
export function isPeripheral(facingYaw: number, dx: number, dz: number, fovDeg: number): boolean {
  return Math.abs(wrapAngle(yawTo(dx, dz) - facingYaw)) > fovDeg * Math.PI / 360 * 0.55
}

export interface DetectionInput {
  distance: number
  /** Current vision range (visionRange()). */
  range: number
  crouched: boolean
  sprinting: boolean
  shooting: boolean
  /** Player walking (speed > 0.6 m/s) but not sprinting. */
  moving: boolean
  night: boolean
  flashlight: boolean
  /** Player only in the outer field of view. */
  peripheral: boolean
  /** Only part of the player (head) visible over cover. */
  partial: boolean
  /** Enemy is already alerted (investigating, searching, reinforcement). */
  alerted: boolean
}

/** Awareness-meter fill rate (units per second, 1 = combat). ~0.4 s up close to ~1.5 s at the edge of sight. */
export function detectionRate(p: DetectionInput): number {
  if (p.distance < 4) return p.crouched && !p.shooting ? 5 : 9
  const f = clamp((p.distance - 4) / Math.max(1, p.range - 4), 0, 1)
  let rate = 1 / (0.4 + 1.1 * f)
  if (p.crouched) rate *= 0.6
  if (p.sprinting) rate *= 1.5
  else if (p.moving) rate *= 1.15
  if (p.shooting) rate *= 2
  if (p.night) rate *= p.flashlight ? 1.8 : 0.75
  if (p.peripheral) rate *= 0.55
  if (p.partial) rate *= 0.6
  if (p.alerted) rate *= 1.6
  return rate
}

// ---------------------------------------------------------------- cover

export interface CoverSpot { x: number; z: number; height: number; nx: number; nz: number }
export interface CoverQuery {
  /** Enemy position. */
  from: Vec2
  /** Threat (player / last known) position. */
  threat: Vec2
  /** Max travel distance from `from` (~15 m). */
  maxTravel: number
  /** Weapon range: the threat must be within it from the cover point. */
  range: number
  /** Ignore cover closer than this to the threat. */
  minThreatDist: number
  /** Preferred engagement distance (cover nearer to it scores better). */
  preferDist: number
  /** Cover points that are claimed by someone else. */
  taken?: (index: number) => boolean
}

/** The covering solid lies between the point and the threat (normal points away from the threat). */
export function coverFacesThreat(c: CoverSpot, threat: Vec2): boolean {
  const dx = threat.x - c.x, dz = threat.z - c.z, d = Math.hypot(dx, dz) || 1
  return (c.nx * dx + c.nz * dz) / d < -0.3
}

/** Indices of usable cover points, best first. */
export function rankCover(points: readonly CoverSpot[], q: CoverQuery): number[] {
  const scored: Array<[number, number]> = []
  for (let i = 0; i < points.length; i++) {
    const c = points[i]
    const travel = Math.hypot(c.x - q.from.x, c.z - q.from.z)
    if (travel > q.maxTravel) continue
    const dx = q.threat.x - c.x, dz = q.threat.z - c.z, dt = Math.hypot(dx, dz)
    if (dt < q.minThreatDist || dt > q.range) continue
    const dot = (c.nx * dx + c.nz * dz) / (dt || 1)
    if (dot >= -0.3) continue
    if (q.taken?.(i)) continue
    // moving toward the threat in the open is costly; facing the threat squarely is good
    const towardThreat = Math.max(0, Math.hypot(q.threat.x - q.from.x, q.threat.z - q.from.z) - dt)
    const score = travel + Math.abs(dt - q.preferDist) * 0.45 + (dot + 1) * 5 + towardThreat * 0.6 + (c.height < 1.7 ? 0 : 0.8)
    scored.push([score, i])
  }
  scored.sort((a, b) => a[0] - b[0])
  return scored.map(s => s[1])
}

/** Point `dist` from the threat, rotated `angle` rad (side = ±1) away from the threat→enemy direction. */
export function flankPoint(threat: Vec2, from: Vec2, side: 1 | -1, angle: number, dist: number): Vec2 {
  const base = Math.atan2(from.z - threat.z, from.x - threat.x) + side * angle
  return { x: threat.x + Math.cos(base) * dist, z: threat.z + Math.sin(base) * dist }
}

// ---------------------------------------------------------------- hit zones

/**
 * Ray (origin o, normalised dir d) vs. capsule around the segment a→b with radius r. Returns the entry distance or null.
 * Used for posed torso and limb zones (the collision.ts capsule is vertical only).
 */
export function raySegmentCapsule(o: Vec3, d: Vec3, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, maxT: number): number | null {
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const oax = o.x - ax, oay = o.y - ay, oaz = o.z - az
  const baba = bax * bax + bay * bay + baz * baz
  const bard = bax * d.x + bay * d.y + baz * d.z
  const baoa = bax * oax + bay * oay + baz * oaz
  const rdoa = d.x * oax + d.y * oay + d.z * oaz
  const oaoa = oax * oax + oay * oay + oaz * oaz
  let best: number | null = null
  if (baba > 1e-12) {
    const a = baba - bard * bard
    const b = baba * rdoa - baoa * bard
    const c = baba * oaoa - baoa * baoa - r * r * baba
    const h = b * b - a * c
    if (a > 1e-12 && h >= 0) {
      const t = (-b - Math.sqrt(h)) / a
      const y = baoa + t * bard
      if (y > 0 && y < baba && t >= 0 && t <= maxT) best = t
    }
  }
  if (best === null) {
    // end caps (spheres at a and b); also covers rays starting inside the cylinder part
    const ta = sphereT(o, d, ax, ay, az, r, maxT), tb = sphereT(o, d, bx, by, bz, r, maxT)
    if (ta !== null) best = ta
    if (tb !== null && (best === null || tb < best)) best = tb
    if (best === null && baba > 1e-12) {
      // origin inside the cylinder body
      const proj = clamp(baoa / baba, 0, 1)
      const px = ax + bax * proj - o.x, py = ay + bay * proj - o.y, pz = az + baz * proj - o.z
      if (px * px + py * py + pz * pz <= r * r) best = 0
    }
  }
  return best
}

function sphereT(o: Vec3, d: Vec3, cx: number, cy: number, cz: number, r: number, maxT: number): number | null {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz
  const b = ox * d.x + oy * d.y + oz * d.z
  const c = ox * ox + oy * oy + oz * oz - r * r
  const disc = b * b - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  let t = -b - s
  if (t < 0) t = -b + s
  if (t < 0 || t > maxT) return null
  return t
}

// ---------------------------------------------------------------- packed obstacle tests (allocation-free hot paths)

interface Box { minX: number; maxX: number; minZ: number; maxZ: number; height: number; minY?: number }

/** Packs AABBs into a flat array [minX, minY, minZ, maxX, maxY, maxZ, …] for allocation-free ray tests. */
export function packBoxes(boxes: readonly Box[]): Float64Array {
  const out = new Float64Array(boxes.length * 6)
  boxes.forEach((b, i) => { out.set([b.minX, b.minY ?? 0, b.minZ, b.maxX, b.height, b.maxZ], i * 6) })
  return out
}

/** Entry distance of the ray (normalised d) into packed box i within maxT, or -1 (slab method, like collision.rayBox). */
function slab(data: Float64Array, i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  let t0 = 0, t1 = maxT
  if (Math.abs(dx) < 1e-12) { if (ox < data[i] || ox > data[i + 3]) return -1 } else {
    let ta = (data[i] - ox) / dx, tb = (data[i + 3] - ox) / dx
    if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1
  }
  if (Math.abs(dy) < 1e-12) { if (oy < data[i + 1] || oy > data[i + 4]) return -1 } else {
    let ta = (data[i + 1] - oy) / dy, tb = (data[i + 4] - oy) / dy
    if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1
  }
  if (Math.abs(dz) < 1e-12) { if (oz < data[i + 2] || oz > data[i + 5]) return -1 } else {
    let ta = (data[i + 2] - oz) / dz, tb = (data[i + 5] - oz) / dz
    if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1
  }
  return t0
}

/** Distance along the normalised ray to the first packed box, or maxT when nothing is hit. */
export function rayBoxes(data: Float64Array, o: Vec3, d: Vec3, maxT: number): number {
  let best = maxT
  for (let i = 0; i < data.length; i += 6) { const t = slab(data, i, o.x, o.y, o.z, d.x, d.y, d.z, best); if (t >= 0 && t < best) best = t }
  return best
}

/** True when the straight segment a→b passes through any packed box (same result as collision.segmentBlocked3D). */
export function segmentBlockedBoxes(data: Float64Array, a: Vec3, b: Vec3): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-6) return false
  const ix = dx / len, iy = dy / len, iz = dz / len
  for (let i = 0; i < data.length; i += 6) if (slab(data, i, a.x, a.y, a.z, ix, iy, iz, len) >= 0) return true
  return false
}
