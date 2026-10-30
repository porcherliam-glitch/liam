/**
 * zombieAi.ts — pure decision logic for the infected (no three.js): seeded RNG, perception rules, the calm/alert state
 * transitions, dismemberment decisions (GORE_RULES), spawn placement rules for populate(), horde separation, ray/capsule
 * math for hit tests and a flow field toward the player over the NavGrid (one Dijkstra every 0.4 s serves every chaser
 * near the player instead of one A* each). Unit-tested in zombies.test.ts.
 */
import type { CollisionWorld } from "./collision"
import type { BodyPartId, DamageInfo } from "./hostiles"
import { INFECTED, type InfectedKind } from "./infectedData"
import type { NavGrid } from "./nav"
import type { Vec2, Vec3 } from "./types"

/** Seeded PRNG (mulberry32) — every AI decision uses this, never Math.random. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

// ------------------------------------------------------------------ perception

/** Sight distance against the player: night shortens it, the flashlight gives the player away, crouching helps. */
export function sightRange(base: number, visionScale: number, flashlight: boolean, crouched: boolean): number {
  let r = base * visionScale
  if (flashlight) r = Math.max(r, base * 1.1)
  return crouched ? r * 0.7 : r
}

/** Radius (m) in which the player's own movement is heard (footsteps, sprinting). */
export function movementNoise(speed: number, sprinting: boolean, crouched: boolean): number {
  if (speed < 0.3) return 0
  if (sprinting) return 15
  if (crouched) return 1.5
  return 2 + speed * 0.9
}

export const SMELL_RANGE = 3
export const LOSE_INTEREST = 20
export type Sense = "see" | "smell" | "hear" | "none"
export type Mind = "idle" | "wander" | "investigate" | "hunt" | "chase"

/**
 * One perception sample. `blocked` is only evaluated (3D line of sight) when distance and view cone allow seeing.
 * Chasing infected track the player without a view cone.
 */
export function perceive(dist: number, cosToPlayer: number, fovCos: number, range: number, chasing: boolean, noiseRadius: number, hearing: number, blocked: () => boolean): Sense {
  if (dist < SMELL_RANGE) return "smell"
  if (dist <= range && (chasing || cosToPlayer >= fovCos) && !blocked()) return "see"
  if (noiseRadius > 0 && dist <= noiseRadius * hearing) return "hear"
  return "none"
}

/** Calm/alert state transition after a perception sample. */
export function nextMind(cur: Mind, sense: Sense, sinceContact: number, atGoal: boolean, active: boolean): Mind {
  if (!active) return cur === "idle" ? "idle" : "wander"
  if (sense === "see" || sense === "smell") return "chase"
  if (sense === "hear") return cur === "chase" ? "chase" : "investigate"
  if (cur === "chase" && sinceContact > LOSE_INTEREST) return "wander"
  if ((cur === "investigate" || cur === "hunt") && atGoal) return "wander"
  return cur
}

// ------------------------------------------------------------------ dismemberment

export interface GoreRules { limbHealth: number; headBurst: number; gibRadius: number }
export type GoreOutcome = "none" | "sever" | "burst" | "decap" | "gib"
export interface GoreInput {
  part: BodyPartId
  /** Damage dealt by this hit (after armour) and the limb's accumulated damage including it. */
  dealt: number
  limbTotal: number
  maxHealth: number
  healthAfter: number
  kind: DamageInfo["kind"]
  /** DamageInfo.sever and a uniform roll in [0, 1). */
  sever: number
  roll: number
  brutal: boolean
  /** Pellet damage this target took in the current frame (one shotgun blast) and the shooter distance. */
  blastDamage: number
  distance: number
  boss: boolean
}

/** Head bursts need at least this much from one hit; big infected need more (a third of their health). */
export function headBurstThreshold(rules: GoreRules, maxHealth: number): number { return Math.max(rules.headBurst, maxHealth * 0.35) }

/**
 * Decides what a hit does to the body. "burst" kills instantly at every gore level (gameplay stays identical; at
 * "normal" the GoreSystem only sprays) — the boss is never one-shot. Severing, decapitation and gibs need "brutal".
 */
export function goreOutcome(rules: GoreRules, g: GoreInput): GoreOutcome {
  const killed = g.healthAfter <= 0
  if (g.part === "head") {
    if (g.boss) return killed ? "burst" : "none"
    if (g.dealt >= headBurstThreshold(rules, g.maxHealth) || (killed && g.dealt >= g.maxHealth * 0.6)) return g.brutal && g.kind === "melee" && g.roll < g.sever ? "decap" : "burst"
    if (killed && g.brutal && g.sever > 0 && g.roll < g.sever) return "decap"
    return "none"
  }
  if (g.part === "torso") {
    if (killed && g.brutal && !g.boss && g.kind === "pellet" && g.blastDamage >= g.maxHealth * 0.9 && g.distance <= 4.5) return "gib"
    return "none"
  }
  if (!g.brutal) return "none"
  if (g.limbTotal >= rules.limbHealth * g.maxHealth) return "sever"
  if (g.sever > 0 && g.roll < g.sever) return "sever"
  return "none"
}

// ------------------------------------------------------------------ population

/** `density` is infected per square metre (0.005 → 14 in a 30 m zone). */
export function zoneTarget(radius: number, density: number): number { return Math.max(0, Math.round(density * Math.PI * radius * radius)) }

export const DEFAULT_KINDS: readonly InfectedKind[] = ["walker", "runner", "brute", "screamer", "spitter", "stalker", "crawler", "bloater", "riot"]

function kindWeight(k: InfectedKind, night: boolean): number {
  const w = INFECTED[k].weight
  return k === "stalker" ? w * (night ? 2 : 0.35) : w
}

/** Weighted pick (INFECTED[k].weight); stalkers are rare in daylight and common at night. */
export function pickKind(kinds: readonly InfectedKind[] | undefined, rng: () => number, night: boolean): InfectedKind {
  const list = kinds && kinds.length ? kinds : DEFAULT_KINDS
  let total = 0
  for (const k of list) total += kindWeight(k, night)
  if (total <= 0) return list[0]
  let r = rng() * total
  for (const k of list) { r -= kindWeight(k, night); if (r <= 0) return k }
  return list[list.length - 1]
}

export const SPAWN_RULES = {
  /** Never spawn closer than this to the player. */
  minDist: 30,
  /** Beyond this an unoccluded spot outside the view cone is fine. */
  openDist: 45,
  maxDist: 110,
  /** Calm infected and corpses beyond this are removed. */
  despawnDist: 160,
  /** Half angle of the player's view cone (generous: covers a 110° FOV plus turning). */
  viewCos: Math.cos(70 * Math.PI / 180),
} as const

export function inViewCone(px: number, pz: number, fx: number, fz: number, x: number, z: number, cosHalf: number = SPAWN_RULES.viewCos): boolean {
  const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz)
  if (d < 1e-6) return true
  return (dx * fx + dz * fz) / d >= cosHalf
}

/** The placement rule: out of reach, and either hidden behind an obstacle or far away and outside the view cone. */
export function spawnAllowed(dist: number, inCone: boolean, occluded: boolean): boolean {
  if (dist < SPAWN_RULES.minDist || dist > SPAWN_RULES.maxDist) return false
  if (occluded) return true
  return dist > SPAWN_RULES.openDist && !inCone
}

/**
 * Tries random walkable points inside the zone (or a ring around `center` when radius is given) until one passes
 * spawnAllowed. `facing` null = unknown view direction (treated as "looking there": needs occlusion).
 */
export function findSpawnPoint(cx: number, cz: number, radius: number, eye: Vec3, facing: Vec2 | null, nav: NavGrid, collision: CollisionWorld, rng: () => number, out: Vec2, tries = 10, minR = 0): boolean {
  for (let i = 0; i < tries; i++) {
    const a = rng() * Math.PI * 2, r = minR + Math.sqrt(rng()) * (radius - minR)
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
    if (!nav.walkable(x, z)) continue
    const d = Math.hypot(x - eye.x, z - eye.z)
    if (d < SPAWN_RULES.minDist || d > SPAWN_RULES.maxDist) continue
    const cone = facing ? inViewCone(eye.x, eye.z, facing.x, facing.z, x, z) : true
    if (!cone && d > SPAWN_RULES.openDist) { out.x = x; out.z = z; return true }
    _head.x = x; _head.y = 1.6; _head.z = z; _chest.x = x; _chest.y = 0.9; _chest.z = z
    if (collision.segmentBlocked3D(eye, _head) && collision.segmentBlocked3D(eye, _chest)) { out.x = x; out.z = z; return true }
  }
  return false
}
const _head: Vec3 = { x: 0, y: 0, z: 0 }, _chest: Vec3 = { x: 0, y: 0, z: 0 }

// ------------------------------------------------------------------ hordes

/**
 * Push-apart vector for agent i from its neighbours (positions xs/zs, radii rs, n agents). Overlap is resolved
 * proportionally; exactly coincident agents get a deterministic sideways push.
 */
export function separation(i: number, xs: Float32Array, zs: Float32Array, rs: Float32Array, n: number, out: Vec2): Vec2 {
  out.x = 0; out.z = 0
  const xi = xs[i], zi = zs[i], ri = rs[i]
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    const dx = xi - xs[j], dz = zi - zs[j], min = (ri + rs[j]) * 1.12
    if (dx > min || dx < -min || dz > min || dz < -min) continue
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min) continue
    if (d2 < 1e-8) { const a = (i * 2.399 + j * 0.7) % (Math.PI * 2); out.x += Math.cos(a); out.z += Math.sin(a); continue }
    const d = Math.sqrt(d2), push = (min - d) / min
    out.x += dx / d * push; out.z += dz / d * push
  }
  return out
}

// ------------------------------------------------------------------ geometry

/** Ray vs. capsule (segment a→b, radius r); dir normalised. Returns the entry distance or -1. */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const oax = ox - ax, oay = oy - ay, oaz = oz - az
  const baba = bax * bax + bay * bay + baz * baz
  const bard = bax * dx + bay * dy + baz * dz
  const baoa = bax * oax + bay * oay + baz * oaz
  const rdoa = dx * oax + dy * oay + dz * oaz
  const oaoa = oax * oax + oay * oay + oaz * oaz
  const a = baba - bard * bard
  if (a > 1e-10) {
    const b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba
    const h = b * b - a * c
    if (h < 0) return -1
    const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard
    if (y > 0 && y < baba) return t
    // cap sphere at the nearer end
    const ex = y <= 0 ? oax : ox - bx, ey = y <= 0 ? oay : oy - by, ez = y <= 0 ? oaz : oz - bz
    const bb = dx * ex + dy * ey + dz * ez, cc = ex * ex + ey * ey + ez * ez - r * r, hh = bb * bb - cc
    return hh > 0 ? -bb - Math.sqrt(hh) : -1
  }
  // ray parallel to the axis: nearest of the two end spheres
  let best = -1
  for (let k = 0; k < 2; k++) {
    const ex = ox - (k ? bx : ax), ey = oy - (k ? by : ay), ez = oz - (k ? bz : az)
    const bb = dx * ex + dy * ey + dz * ez, cc = ex * ex + ey * ey + ez * ez - r * r, hh = bb * bb - cc
    if (hh > 0) { const t = -bb - Math.sqrt(hh); if (t >= 0 && (best < 0 || t < best)) best = t }
  }
  return best
}

/** Squared distance between the ray segment o + d·[0, maxT] and segment a→b; writes the ray parameter into out[0]. */
export function raySegmentDist2(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, out: Float32Array): number {
  const ux = dx * maxT, uy = dy * maxT, uz = dz * maxT
  const vx = bx - ax, vy = by - ay, vz = bz - az
  const wx = ox - ax, wy = oy - ay, wz = oz - az
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz
  const D = a * c - b * b
  let s = D > 1e-10 ? (b * e - c * d) / D : 0, t = 0
  s = Math.max(0, Math.min(1, s))
  t = c > 1e-10 ? (b * s + e) / c : 0
  if (t < 0) { t = 0; s = a > 1e-10 ? Math.max(0, Math.min(1, -d / a)) : 0 } else if (t > 1) { t = 1; s = a > 1e-10 ? Math.max(0, Math.min(1, (b - d) / a)) : 0 }
  const px = wx + ux * s - vx * t, py = wy + uy * s - vy * t, pz = wz + uz * s - vz * t
  out[0] = s * maxT; out[1] = t
  return px * px + py * py + pz * pz
}

// ------------------------------------------------------------------ flow field

// 8 neighbours as flat arrays (no tuple destructuring in the hot loops)
const DC = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]), DR = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1])
const DCOST = new Float32Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2])

/**
 * Distance field (Dijkstra over walkable NavGrid cells) in a square window around a target. Agents inside the
 * window steer down the gradient, so a whole horde needs one search instead of one A* per agent.
 */
export class FlowField {
  readonly size: number
  readonly dist: Float32Array
  /** Binary heap of (cell, key) pairs; stale entries (key > dist) are skipped when popped. */
  private heap: Int32Array
  private heapKey: Float32Array
  private heapSize = 0
  originC = 0
  originR = 0
  valid = false
  building = false
  targetX = 0
  targetZ = 0

  constructor(private nav: NavGrid, readonly halfSize = 48) {
    this.size = Math.max(4, Math.ceil(halfSize * 2 / nav.cell))
    this.dist = new Float32Array(this.size * this.size)
    this.heap = new Int32Array(this.size * this.size * 8)
    this.heapKey = new Float32Array(this.size * this.size * 8)
  }

  private open(gc: number, gr: number): boolean { const n = this.nav; return gc >= 0 && gr >= 0 && gc < n.cols && gr < n.rows && n.blocked[gr * n.cols + gc] === 0 }
  private local(gc: number, gr: number): number { const lc = gc - this.originC, lr = gr - this.originR; return lc < 0 || lr < 0 || lc >= this.size || lr >= this.size ? -1 : lr * this.size + lc }

  /** Rebuilds the field toward (tx, tz) in one go. Returns false when the target has no walkable cell nearby. */
  build(tx: number, tz: number): boolean {
    if (!this.begin(tx, tz)) return false
    this.advance(Infinity)
    return true
  }

  /** Starts an incremental rebuild (finish it with advance()); `valid` stays false until done. */
  begin(tx: number, tz: number): boolean {
    const nav = this.nav
    this.valid = false; this.building = false
    const t = nav.walkable(tx, tz) ? null : nav.nearestWalkable(tx, tz, 4)
    if (!nav.walkable(tx, tz) && !t) return false
    this.targetX = t ? t.x : tx; this.targetZ = t ? t.z : tz
    const tc = nav.colOf(this.targetX), tr = nav.rowOf(this.targetZ), half = this.size >> 1
    this.originC = tc - half; this.originR = tr - half
    this.dist.fill(Infinity)
    const start = this.local(tc, tr)
    this.dist[start] = 0; this.heapSize = 0; this.push(start, 0)
    this.building = true
    return true
  }

  /** Runs up to maxPops Dijkstra steps; returns true (and sets `valid`) once the field is complete. */
  advance(maxPops: number): boolean {
    if (!this.building) return this.valid
    const nav = this.nav, size = this.size, cell = nav.cell
    let pops = 0
    while (this.heapSize > 0) {
      if (pops++ >= maxPops) return false
      const key = this.heapKey[0], cur = this.pop(), cd = this.dist[cur]
      if (key > cd) continue
      const lc = cur % size, lr = (cur - lc) / size, gc = lc + this.originC, gr = lr + this.originR
      for (let k = 0; k < 8; k++) {
        const dc = DC[k], dr = DR[k], nc = gc + dc, nr = gr + dr
        const nlc = lc + dc, nlr = lr + dr
        if (nlc < 0 || nlr < 0 || nlc >= size || nlr >= size) continue
        if (!this.open(nc, nr)) continue
        if (k >= 4 && (!this.open(gc + dc, gr) || !this.open(gc, gr + dr))) continue
        const n = nlr * size + nlc
        const nd = cd + DCOST[k] * cell
        if (nd < this.dist[n]) { this.dist[n] = nd; this.push(n, nd) }
      }
    }
    this.building = false; this.valid = true
    return true
  }

  /** Path distance (m) from (x, z) to the target, Infinity outside the window or unreachable. */
  costAt(x: number, z: number): number {
    if (!this.valid) return Infinity
    const n = this.local(this.nav.colOf(x), this.nav.rowOf(z))
    return n < 0 ? Infinity : this.dist[n]
  }

  /**
   * Steering direction toward the target: descends the field up to 5 cells and aims at the furthest of those cells
   * that is reachable in a straight walkable line. Returns false outside the window or when unreachable.
   */
  steer(x: number, z: number, out: Vec2): boolean {
    if (!this.valid) return false
    const nav = this.nav, size = this.size
    let gc = nav.colOf(x), gr = nav.rowOf(z)
    let cur = this.local(gc, gr)
    if (cur < 0) return false
    if (!isFinite(this.dist[cur])) {
      // standing in a blocked cell (wall clearance): pick the best open neighbour
      let best = -1, bd = Infinity
      for (let k = 0; k < 8; k++) { const n = this.local(gc + DC[k], gr + DR[k]); if (n >= 0 && this.dist[n] < bd) { bd = this.dist[n]; best = n } }
      if (best < 0) return false
      cur = best; gc = (cur % size) + this.originC; gr = Math.floor(cur / size) + this.originR
      out.x = nav.centerX(gc) - x; out.z = nav.centerZ(gr) - z
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l
      return true
    }
    if (this.dist[cur] === 0) { out.x = this.targetX - x; out.z = this.targetZ - z; const l = Math.hypot(out.x, out.z); if (l < 1e-6) return false; out.x /= l; out.z /= l; return true }
    let aimX = this.targetX, aimZ = this.targetZ, firstX = 0, firstZ = 0, found = false
    for (let step = 0; step < 5; step++) {
      let best = -1, bd = this.dist[cur], bc = 0, br = 0
      for (let k = 0; k < 8; k++) {
        const dc = DC[k], dr = DR[k], nc = gc + dc, nr = gr + dr
        if (k >= 4 && (!this.open(gc + dc, gr) || !this.open(gc, gr + dr))) continue
        const n = this.local(nc, nr)
        if (n >= 0 && this.dist[n] < bd) { bd = this.dist[n]; best = n; bc = nc; br = nr }
      }
      if (best < 0) break
      cur = best; gc = bc; gr = br
      const cx = bd === 0 ? this.targetX : nav.centerX(gc), cz = bd === 0 ? this.targetZ : nav.centerZ(gr)
      if (!found) { firstX = cx; firstZ = cz; found = true; aimX = cx; aimZ = cz }
      else if (nav.lineWalkable(x, z, cx, cz)) { aimX = cx; aimZ = cz }
      else break
      if (bd === 0) break
    }
    if (!found) return false
    out.x = aimX - x; out.z = aimZ - z
    let l = Math.hypot(out.x, out.z)
    if (l < 1e-4) { out.x = firstX - x; out.z = firstZ - z; l = Math.hypot(out.x, out.z) }
    if (l < 1e-6) return false
    out.x /= l; out.z /= l
    return true
  }

  private push(n: number, key: number): void {
    if (this.heapSize >= this.heap.length) {
      const g = new Int32Array(this.heap.length * 2); g.set(this.heap); this.heap = g
      const k = new Float32Array(this.heapKey.length * 2); k.set(this.heapKey); this.heapKey = k
    }
    const heap = this.heap, keys = this.heapKey
    let i = this.heapSize++
    while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= key) break; heap[i] = heap[p]; keys[i] = keys[p]; i = p }
    heap[i] = n; keys[i] = key
  }

  private pop(): number {
    const heap = this.heap, keys = this.heapKey, top = heap[0], size = --this.heapSize
    const last = heap[size], lastKey = keys[size]
    let i = 0
    while (true) {
      let l = i * 2 + 1
      if (l >= size) break
      if (l + 1 < size && keys[l + 1] < keys[l]) l++
      if (keys[l] >= lastKey) break
      heap[i] = heap[l]; keys[i] = keys[l]; i = l
    }
    heap[i] = last; keys[i] = lastKey
    return top
  }
}
