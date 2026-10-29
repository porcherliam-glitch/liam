/**
 * gore.ts — blood and dismemberment.
 * CONTRACT (used by raid.ts, enemies.ts, zombies.ts):
 *  - new GoreSystem(scene, collision, level). level "off" = no blood at all, "normal" = blood sprays, small decals and
 *    pools but no dismemberment, "brutal" = everything (default).
 *  - wound(point, dir, damage, opts): bullet/blade wound — spray along dir (exit side) and back-spatter; blood decals
 *    on walls/floor behind the target found with collision raycasts; amount scales with damage.
 *  - sever(part, impulse, opts): detach a body part — the part's world transform is copied into a physics gib (clone
 *    sharing geometry/materials), the original part group is hidden, a pulsing blood fountain starts at the joint
 *    (the part's local origin) for ~2.5 s and leaves a trail. No-op unless level === "brutal".
 *  - headshot(head, dir, opts): the head bursts — hide the head, skull/brain chunks + red mist + spatter in dir.
 *    "normal": only a heavy spray, the head stays.
 *  - gib(root, center, force, opts): the whole body breaks into chunks (explosions, point-blank heavy hits).
 *    "normal": heavy spray only.
 *  - pool(position, size, opts): a blood pool growing under a corpse over a few seconds (max ~1.2 m × size).
 *  - onScreenSplatter: set by the raid; called with 0..1 when gore happens within ~3 m of the camera.
 *  - update(dt, camera): simulate particles and gibs; clear(): remove everything (new raid); dispose().
 *  - Budgets: ≤ 1500 particles, ≤ 80 gibs, ≤ 200 decals/pools (oldest recycled). No allocations per frame.
 * UNITS: sever impulse = launch velocity of the part in m/s (clamped to 25); gib force = launch speed in m/s at the
 *  centre (≈ 6 grenade edge … 14 point blank). "normal" turns sever/headshot/gib into heavy sprays (parts stay visible).
 * IMPLEMENTATION:
 *  - Particles: one THREE.Points draw call (ring of 1500) with a custom shader — wet, velocity-streaked droplets and soft
 *    noisy mist, lit by an estimate of the scene's ambient light, fogged and tone mapped like the rest of the scene.
 *    Droplets die on the floor (y = 0), on per-burst "kill planes" (wall found by the burst's raycast) and — for the
 *    subset that leaves spots — on exact segment tests against the collision boxes.
 *  - Decals: one InstancedMesh (lit MeshStandardMaterial + procedural 4×4 atlas: R thickness, G reveal time, B noise,
 *    A coverage) holding splats (wall/floor, ≤ 150), pools (≤ 50) and small droplet spots (separate ring of 400). Splash
 *    spreading, drips running down walls, pool growth and drying are animated in the shader from per-instance birth
 *    times — zero CPU cost after spawning. Splats are clamped to the face of the box they sit on.
 *  - Gibs: individual meshes (clones sharing geometry/materials, or shared low-poly procedural chunks: flesh, skull
 *    shards, brain, bones, guts) driven by stepGib (capsule rigid body vs floor + boxes, swept centre, unit-tested);
 *    settled gibs sleep forever with matrixAutoUpdate off. Beyond the budget the oldest sink into the floor.
 *  - Stumps: fountains attached to the parent's world matrix (follow falling bodies), pulsing with a lub-dub heartbeat,
 *    plus a dark red cap disc with bone centre on the stump and on the cut end of the flying part.
 *  - Additions: random (seedable RNG), stats(), and the pure helpers GibBody/stepGib/heartbeat/Ring/buildAtlasData.
 */
import * as THREE from "three"
import { SURF, withSurface } from "./surface"
import { rayBox, type CollisionWorld, type Obstacle } from "./collision"
import type { Vec3 } from "./types"

export type GoreLevel = "off" | "normal" | "brutal"
export interface GoreOptions { color?: number; heavy?: boolean }
export interface GoreStats { particles: number; gibs: number; awakeGibs: number; splats: number; pools: number; drops: number; emitters: number; caps: number }

export const GORE_BUDGET = { particles: 1500, gibs: 80, splats: 150, pools: 50, drops: 400 } as const
const MAX_P = GORE_BUDGET.particles
const SPLAT0 = 0, POOL0 = GORE_BUDGET.splats, DROP0 = POOL0 + GORE_BUDGET.pools, DECALS = DROP0 + GORE_BUDGET.drops
const MAX_EMITTERS = 40, MAX_CAPS = 64, PLANES = 64
const FLOOR_Y = 0
const GRAV = 9.81
export const GIB_GRAVITY = 11
const DEFAULT_BLOOD = 0x6e0b08

// ───────────────────────────── pure helpers (unit-tested) ─────────────────────────────

/** Fixed-size ring allocator: next() hands out slots in order and recycles the oldest once full. */
export class Ring {
  private head = 0
  count = 0
  constructor(readonly size: number) {}
  next(): number { const i = this.head; this.head = (this.head + 1) % this.size; if (this.count < this.size) this.count++; return i }
  /** Slot that next() will hand out (the oldest live slot once the ring is full). */
  peek(): number { return this.head }
  reset(): void { this.head = 0; this.count = 0 }
}

/** Arterial pressure 0..1 at time t (s): lub-dub double pulse. */
export function heartbeat(t: number, bpm = 130): number {
  const ph = ((t * bpm / 60) % 1 + 1) % 1
  const a = (ph - 0.06) / 0.07, b = (ph - 0.31) / 0.09
  return Math.min(1, Math.exp(-a * a) + 0.55 * Math.exp(-b * b))
}

export function rng32(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/**
 * Minimal rigid body for gibs: a capsule (segment ±(ax,ay,az) in body space, radius r; a sphere when the axis is zero),
 * mass 1, scalar inertia. Position = centre of mass, q = orientation.
 */
export class GibBody {
  px = 0; py = 0; pz = 0
  qx = 0; qy = 0; qz = 0; qw = 1
  vx = 0; vy = 0; vz = 0
  wx = 0; wy = 0; wz = 0
  ax = 0; ay = 0; az = 0
  half = 0
  r = 0.05
  invI = 1
  sleeping = false
  still = 0
  age = 0
  /** Touched floor/box during the last step; impact = strongest closing speed; (cx, cy, cz) / (nx, ny, nz) = last contact. */
  contact = false
  impact = 0
  cx = 0; cy = 0; cz = 0
  nx = 0; ny = 1; nz = 0
  /** Sets radius and body-space half axis (near-spherical shapes become spheres) and derives the inertia. */
  shape(r: number, ax = 0, ay = 0, az = 0): this {
    this.r = Math.max(0.005, r)
    const half = Math.hypot(ax, ay, az), sphere = half < this.r * 0.6
    this.ax = sphere ? 0 : ax; this.ay = sphere ? 0 : ay; this.az = sphere ? 0 : az; this.half = sphere ? 0 : half
    this.invI = 1 / (0.4 * this.r * this.r + (2 * this.half) * (2 * this.half) / 12)
    return this
  }
  reset(): void {
    this.qx = this.qy = this.qz = 0; this.qw = 1; this.vx = this.vy = this.vz = this.wx = this.wy = this.wz = 0
    this.sleeping = false; this.still = 0; this.age = 0; this.contact = false; this.impact = 0
  }
}

const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 }
const SLOP = 0.003, MAXC = 12
// contact scratch: lever arm (COM → touching point), normal, penetration, accumulated normal impulse, bounce target
const cR = new Float64Array(MAXC * 3), cN = new Float64Array(MAXC * 3), cP = new Float64Array(MAXC), cJ = new Float64Array(MAXC), cT = new Float64Array(MAXC)
let cCount = 0

/**
 * Advances a gib by dt: gravity, contacts of the capsule (both ends and the middle) against the floor plane y = floorY and
 * the boxes, solved with a few iterations of accumulated impulses (restitution, Coulomb friction, rolling resistance),
 * then a swept move of the centre (never tunnels through boxes) and a de-duplicated positional correction.
 * Comes to rest (sleeping = true) once it has been nearly still for 0.3 s, or after 10 s.
 */
export function stepGib(b: GibBody, dt: number, boxes: readonly Obstacle[], floorY = FLOOR_Y): void {
  if (b.sleeping) return
  b.contact = false; b.impact = 0
  const lin = Math.hypot(b.vx, b.vy, b.vz), ang = Math.hypot(b.wx, b.wy, b.wz) * b.half
  const n = Math.min(10, Math.max(1, Math.ceil((lin + ang) * dt / (b.r * 0.6))))
  const h = dt / n
  for (let s = 0; s < n; s++) substep(b, h, boxes, floorY)
  b.age += dt
  // nearly still = the fastest surface point moves slower than ~10 cm/s
  if (b.contact && Math.hypot(b.vx, b.vy, b.vz) + Math.hypot(b.wx, b.wy, b.wz) * (b.r + b.half) < 0.1) b.still += dt
  else b.still = 0
  if (b.still > 0.3 || b.age > 10) { b.sleeping = true; b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0 }
}

function substep(b: GibBody, h: number, boxes: readonly Obstacle[], floorY: number): void {
  b.vy -= GIB_GRAVITY * h
  const air = 1 - 0.06 * h
  b.vx *= air; b.vy *= air; b.vz *= air
  // contacts at the current pose
  cCount = 0
  if (b.half > 0) {
    // world axis = q * a * q^-1
    const ax = b.ax, ay = b.ay, az = b.az
    const tx = 2 * (b.qy * az - b.qz * ay), ty = 2 * (b.qz * ax - b.qx * az), tz = 2 * (b.qx * ay - b.qy * ax)
    const Ax = ax + b.qw * tx + (b.qy * tz - b.qz * ty), Ay = ay + b.qw * ty + (b.qz * tx - b.qx * tz), Az = az + b.qw * tz + (b.qx * ty - b.qy * tx)
    collect(b, Ax, Ay, Az, boxes, floorY); collect(b, -Ax, -Ay, -Az, boxes, floorY); collect(b, 0, 0, 0, boxes, floorY)
  } else collect(b, 0, 0, 0, boxes, floorY)
  if (cCount > 0) {
    b.contact = true
    solve(b)
    const roll = Math.max(0, 1 - 4 * h), slide = Math.max(0, 1 - 0.8 * h)
    b.wx *= roll; b.wy *= roll; b.wz *= roll; b.vx *= slide; b.vz *= slide
  }
  // swept move of the centre against the (radius-expanded) boxes
  let mx = b.vx * h, my = b.vy * h, mz = b.vz * h
  const len = Math.hypot(mx, my, mz)
  if (len > 1e-7 && boxes.length) {
    _o.x = b.px; _o.y = b.py; _o.z = b.pz; _d.x = mx / len; _d.y = my / len; _d.z = mz / len
    let tmin = len, hit: Obstacle | null = null
    const r = b.r
    for (const o of boxes) {
      const t = rayBox(_o, _d, o.minX - r, (o.minY ?? 0) - r, o.minZ - r, o.maxX + r, o.height + r, o.maxZ + r, tmin)
      if (t !== null && t > 1e-6 && t < tmin) { tmin = t; hit = o }
    }
    if (hit) {
      const k = Math.max(0, tmin - 1e-4) / len; mx *= k; my *= k; mz *= k
      // stopped by the (radius-expanded) box: drop the velocity into the face that was hit so it slides instead of hovering
      const hx = b.px + mx, hy = b.py + my, hz = b.pz + mz, minY = (hit.minY ?? 0) - r
      const f0 = Math.abs(hx - (hit.minX - r)), f1 = Math.abs(hx - (hit.maxX + r)), f2 = Math.abs(hy - minY), f3 = Math.abs(hy - (hit.height + r)), f4 = Math.abs(hz - (hit.minZ - r)), f5 = Math.abs(hz - (hit.maxZ + r))
      const m = Math.min(f0, f1, f2, f3, f4, f5)
      const nx = m === f0 ? -1 : m === f1 ? 1 : 0, ny = nx !== 0 ? 0 : m === f2 ? -1 : m === f3 ? 1 : 0, nz = nx !== 0 || ny !== 0 ? 0 : m === f4 ? -1 : 1
      const vn = b.vx * nx + b.vy * ny + b.vz * nz
      if (vn < 0) { const e = -vn > 1.8 ? 1.28 : 1; b.vx -= nx * vn * e; b.vy -= ny * vn * e; b.vz -= nz * vn * e; if (-vn > b.impact) b.impact = -vn }
      b.contact = true
    }
  }
  b.px += mx; b.py += my; b.pz += mz
  // q += 0.5 * h * (w ⊗ q)
  const { qx, qy, qz, qw, wx, wy, wz } = b
  b.qx += 0.5 * h * (wx * qw + wy * qz - wz * qy)
  b.qy += 0.5 * h * (wy * qw + wz * qx - wx * qz)
  b.qz += 0.5 * h * (wz * qw + wx * qy - wy * qx)
  b.qw += 0.5 * h * (-wx * qx - wy * qy - wz * qz)
  const ql = Math.hypot(b.qx, b.qy, b.qz, b.qw) || 1
  b.qx /= ql; b.qy /= ql; b.qz /= ql; b.qw /= ql
  // push out of penetration (each normal direction only once)
  let px = 0, py = 0, pz = 0
  for (let k = 0; k < cCount; k++) {
    const nx = cN[k * 3], ny = cN[k * 3 + 1], nz = cN[k * 3 + 2]
    const need = cP[k] - (px * nx + py * ny + pz * nz)
    if (need > 0) { px += nx * need; py += ny * need; pz += nz * need }
  }
  b.px += px; b.py += py; b.pz += pz
}

/** Contact sphere at body offset (ox, oy, oz) vs floor and boxes → contact scratch. */
function collect(b: GibBody, ox: number, oy: number, oz: number, boxes: readonly Obstacle[], floorY: number): void {
  const cx = b.px + ox, cy = b.py + oy, cz = b.pz + oz, r = b.r
  const pen = floorY + r - cy
  if (pen > -SLOP) addContact(ox, oy - r, oz, 0, 1, 0, pen)
  for (const o of boxes) {
    const minY = o.minY ?? 0
    const qx = cx < o.minX ? o.minX : cx > o.maxX ? o.maxX : cx
    const qy = cy < minY ? minY : cy > o.height ? o.height : cy
    const qz = cz < o.minZ ? o.minZ : cz > o.maxZ ? o.maxZ : cz
    const dx = cx - qx, dy = cy - qy, dz = cz - qz, d2 = dx * dx + dy * dy + dz * dz
    if (d2 >= (r + SLOP) * (r + SLOP)) continue
    if (d2 > 1e-12) { const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d; addContact(ox - nx * r, oy - ny * r, oz - nz * r, nx, ny, nz, r - d); continue }
    // centre inside the box: leave through the nearest face
    const f0 = cx - o.minX, f1 = o.maxX - cx, f2 = cy - minY, f3 = o.height - cy, f4 = cz - o.minZ, f5 = o.maxZ - cz
    let m = f3, nx = 0, ny = 1, nz = 0
    if (f0 < m) { m = f0; nx = -1; ny = 0; nz = 0 }
    if (f1 < m) { m = f1; nx = 1; ny = 0; nz = 0 }
    if (f2 < m) { m = f2; nx = 0; ny = -1; nz = 0 }
    if (f4 < m) { m = f4; nx = 0; ny = 0; nz = -1 }
    if (f5 < m) { m = f5; nx = 0; ny = 0; nz = 1 }
    addContact(ox - nx * r, oy - ny * r, oz - nz * r, nx, ny, nz, m + r)
  }
}

function addContact(rx: number, ry: number, rz: number, nx: number, ny: number, nz: number, pen: number): void {
  if (cCount >= MAXC) return
  const k = cCount++
  cR[k * 3] = rx; cR[k * 3 + 1] = ry; cR[k * 3 + 2] = rz; cN[k * 3] = nx; cN[k * 3 + 1] = ny; cN[k * 3 + 2] = nz; cP[k] = pen
}

/** Sequential impulses with accumulated, non-negative normal impulses; restitution only for hard hits. */
function solve(b: GibBody): void {
  for (let k = 0; k < cCount; k++) {
    const rx = cR[k * 3], ry = cR[k * 3 + 1], rz = cR[k * 3 + 2], nx = cN[k * 3], ny = cN[k * 3 + 1], nz = cN[k * 3 + 2]
    const vn = (b.vx + b.wy * rz - b.wz * ry) * nx + (b.vy + b.wz * rx - b.wx * rz) * ny + (b.vz + b.wx * ry - b.wy * rx) * nz
    cJ[k] = 0; cT[k] = vn < -1.8 ? -0.28 * vn : 0
    if (-vn > b.impact) { b.impact = -vn; b.cx = b.px + rx; b.cy = b.py + ry; b.cz = b.pz + rz; b.nx = nx; b.ny = ny; b.nz = nz }
  }
  if (b.impact === 0) { b.cx = b.px + cR[0]; b.cy = b.py + cR[1]; b.cz = b.pz + cR[2]; b.nx = cN[0]; b.ny = cN[1]; b.nz = cN[2] }
  for (let it = 0; it < 6; it++) for (let k = 0; k < cCount; k++) {
    const rx = cR[k * 3], ry = cR[k * 3 + 1], rz = cR[k * 3 + 2], nx = cN[k * 3], ny = cN[k * 3 + 1], nz = cN[k * 3 + 2]
    const vcx = b.vx + (b.wy * rz - b.wz * ry), vcy = b.vy + (b.wz * rx - b.wx * rz), vcz = b.vz + (b.wx * ry - b.wy * rx)
    const vn = vcx * nx + vcy * ny + vcz * nz
    const cnx = ry * nz - rz * ny, cny = rz * nx - rx * nz, cnz = rx * ny - ry * nx
    const kn = 1 + b.invI * (cnx * cnx + cny * cny + cnz * cnz)
    const j0 = cJ[k], j1 = Math.max(0, j0 + (cT[k] - vn) / kn), dj = j1 - j0
    cJ[k] = j1
    b.vx += dj * nx; b.vy += dj * ny; b.vz += dj * nz
    b.wx += b.invI * cnx * dj; b.wy += b.invI * cny * dj; b.wz += b.invI * cnz * dj
    // Coulomb friction (bounded by the accumulated normal impulse)
    const ux0 = b.vx + (b.wy * rz - b.wz * ry), uy0 = b.vy + (b.wz * rx - b.wx * rz), uz0 = b.vz + (b.wx * ry - b.wy * rx)
    const vn2 = ux0 * nx + uy0 * ny + uz0 * nz
    const tx = ux0 - vn2 * nx, ty = uy0 - vn2 * ny, tz = uz0 - vn2 * nz, tl = Math.hypot(tx, ty, tz)
    if (tl < 1e-7 || j1 <= 0) continue
    const ux = tx / tl, uy = ty / tl, uz = tz / tl
    const ctx = ry * uz - rz * uy, cty = rz * ux - rx * uz, ctz = rx * uy - ry * ux
    const jt = Math.min(tl / (1 + b.invI * (ctx * ctx + cty * cty + ctz * ctz)), 0.6 * j1)
    b.vx -= jt * ux; b.vy -= jt * uy; b.vz -= jt * uz
    b.wx -= b.invI * ctx * jt; b.wy -= b.invI * cty * jt; b.wz -= b.invI * ctz * jt
  }
}

// ───────────────────────────── procedural decal atlas ─────────────────────────────

const ATLAS = 2048, CELL = 512
/** Generated once per page (≈ 0.3 s) and shared by every GoreSystem. */
let atlasData: Uint8Array | null = null
/** Atlas cells (4×4): 0–3 radial splats, 4–7 directional (+x), 8–9 wall splats with drips (−y), 10–11 pools, 12–15 drops. */
const C_RADIAL = 0, C_DIR = 4, C_DRIP = 8, C_POOL = 10, C_IMPACT = 12, C_LONG = 13, C_CLUSTER = 14, C_SMEAR = 15
/** Quad size per visible main-blob diameter of each cell group (the rest of the quad holds spikes and satellites). */
const FILL = { radial: 2.9, dir: 3, drip: 2.9, pool: 1.45, impact: 3.6, long: 2.4, cluster: 1.7, smear: 1.2 } as const

class CellField {
  readonly cov: Float32Array
  readonly th: Float32Array
  readonly rev: Float32Array
  constructor(readonly s: number) { const n = s * s; this.cov = new Float32Array(n); this.th = new Float32Array(n); this.rev = new Float32Array(n) }
  reset(): void { this.cov.fill(0); this.th.fill(0); this.rev.fill(1) }
  private put(i: number, c: number, th: number, rv: number): void {
    if (c > this.cov[i]) this.cov[i] = c
    if (th > this.th[i]) this.th[i] = th
    if (rv < this.rev[i]) this.rev[i] = rv
  }
  /** Tapered capsule a→b (radii ra→rb) with thickness/reveal interpolated along it. */
  capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb: number, tha: number, thb: number, rva: number, rvb: number): void {
    const s = this.s, m = Math.max(ra, rb) + 2
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - m)), x1 = Math.min(s - 1, Math.ceil(Math.max(ax, bx) + m))
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - m)), y1 = Math.min(s - 1, Math.ceil(Math.max(ay, by) + m))
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, (px * ex + py * ey) / l2)) : 0
      const dx = px - ex * t, dy = py - ey * t, d = Math.sqrt(dx * dx + dy * dy)
      const rad = ra + (rb - ra) * t
      const c = rad - d + 0.5
      if (c <= 0) continue
      const k = Math.min(1, d / Math.max(rad, 0.5))
      this.put(y * s + x, Math.min(1, c), (tha + (thb - tha) * t) * (1 - 0.35 * k * k), rva + (rvb - rva) * t)
    }
  }
  circle(cx: number, cy: number, r: number, th: number, rv: number): void { this.capsule(cx, cy, cx, cy, r, r, th, th, rv, rv) }
  /** Irregular blob with radius radii(θ) (closed, linearly interpolated); thickness profile thE + (thC − thE)(1 − (d/r)^pw). */
  polar(cx: number, cy: number, radii: number[], thC: number, thE: number, pw: number, rv0: number, rv1: number): void {
    const s = this.s, K = radii.length
    let rmax = 0, rmin = Infinity
    for (const r of radii) { if (r > rmax) rmax = r; if (r < rmin) rmin = r }
    const x0 = Math.max(0, Math.floor(cx - rmax - 2)), x1 = Math.min(s - 1, Math.ceil(cx + rmax + 2))
    const y0 = Math.max(0, Math.floor(cy - rmax - 2)), y1 = Math.min(s - 1, Math.ceil(cy + rmax + 2))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy)
      if (d > rmax + 1) continue
      const u = ((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1) * K, i = Math.floor(u) % K, f = u - Math.floor(u)
      const r = radii[i] * (1 - f) + radii[(i + 1) % K] * f
      const c = r - d + 0.5
      if (c <= 0) continue
      const q = Math.min(1, d / r)
      this.put(y * s + x, Math.min(1, c), thE + (thC - thE) * (1 - Math.pow(q, pw)), rv0 + (rv1 - rv0) * q)
    }
  }
}

function radiiOf(K: number, R: number, vary: number, r: () => number, smooth = 2, shape?: (a: number) => number): number[] {
  let out: number[] = []
  for (let k = 0; k < K; k++) out.push(R * (1 - vary / 2 + vary * r()) * (shape ? shape(k / K * Math.PI * 2) : 1))
  for (let p = 0; p < smooth; p++) out = out.map((v, k) => (out[(k + K - 1) % K] + 2 * v + out[(k + 1) % K]) / 4)
  return out
}
function radiusAt(radii: number[], a: number): number {
  const K = radii.length, u = ((a / (Math.PI * 2)) % 1 + 1) % 1 * K, i = Math.floor(u) % K, f = u - Math.floor(u)
  return radii[i] * (1 - f) + radii[(i + 1) % K] * f
}
const gauss = (r: () => number) => (r() + r() + r() - 1.5) / 1.5
/** Keeps a point within the cell's safe area (mip bleeding margin) — returns the clamped distance factor. */
function inCell(x: number, y: number, rad: number): boolean { return x - rad > 18 && x + rad < CELL - 18 && y - rad > 18 && y + rad < CELL - 18 }

function spikes(f: CellField, r: () => number, cx: number, cy: number, radii: number[], n: number, R: number, dirBias: number, spread: number, lenK: number, rv0: number): void {
  for (let i = 0; i < n; i++) {
    const a = dirBias >= 0 ? dirBias + gauss(r) * spread : r() * Math.PI * 2
    const c = Math.cos(a), s = Math.sin(a)
    const base = radiusAt(radii, a) * 0.78
    let L = R * lenK * (0.2 + 1.1 * r() * r())
    const wb = 3 + r() * R * 0.09
    // shorten until the tip and its droplet stay inside the cell
    while (L > 4 && !inCell(cx + c * (base + L + 14), cy + s * (base + L + 14), 8)) L *= 0.8
    if (L <= 4) continue
    f.capsule(cx + c * base, cy + s * base, cx + c * (base + L), cy + s * (base + L), wb, 0.9 + r(), 0.75, 0.3, rv0, rv0 + 0.3 * L / R)
    if (r() < 0.7) { const d2 = base + L + 4 + r() * 10, rr = 1.6 + r() * 4.5; if (inCell(cx + c * d2, cy + s * d2, rr)) f.circle(cx + c * d2, cy + s * d2, rr, 0.7, rv0 + 0.35 * L / R + 0.05) }
  }
}
function satellites(f: CellField, r: () => number, cx: number, cy: number, R: number, n: number, reach: number, maxR: number, revK: number): void {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, dist = R * (1.05 + reach * Math.pow(r(), 1.6))
    const x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist
    const rad = (0.9 + maxR * r() * r()) * Math.max(0.25, 1 - (dist - R) / (R * reach + 1))
    if (inCell(x, y, rad)) f.circle(x, y, rad, 0.55, Math.min(1, dist / R * revK))
  }
}

function cellRadial(f: CellField, r: () => number): void {
  const cx = 256 + (r() - 0.5) * 24, cy = 256 + (r() - 0.5) * 24, R = 72 + r() * 26
  const radii = radiiOf(30, R, 0.55, r, 2)
  f.polar(cx, cy, radii, 1, 0.5, 2, 0, 0.22)
  for (let i = 0; i < 4; i++) { const a = r() * 6.283, d = R * 0.45 * r(); f.circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.22 + 0.2 * r()), 1, 0.05) }
  spikes(f, r, cx, cy, radii, 12 + Math.floor(r() * 14), R, -1, 0, 1.25, 0.2)
  satellites(f, r, cx, cy, R, 45 + Math.floor(r() * 50), 1.25, 6, 0.32)
}
function cellDirectional(f: CellField, r: () => number): void {
  const cx = 150 + r() * 20, cy = 256 + (r() - 0.5) * 30, R = 52 + r() * 18
  const radii = radiiOf(30, R, 0.4, r, 2, a => 1 + 0.55 * Math.max(0, Math.cos(a)) - 0.12 * Math.max(0, -Math.cos(a)))
  f.polar(cx, cy, radii, 1, 0.5, 2, 0, 0.2)
  spikes(f, r, cx, cy, radii, 12 + Math.floor(r() * 8), R, 0, 0.42, 3.2, 0.15)
  spikes(f, r, cx, cy, radii, 5, R, -1, 0, 0.7, 0.15)
  // trailing droplets, elongated along +x, spreading and shrinking with distance
  const n = 45 + Math.floor(r() * 35)
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r(), 0.8), x = cx + R * 1.2 + t * (470 - cx - R * 1.2), y = cy + gauss(r) * (8 + (x - cx) * 0.33)
    const rad = (1.1 + 5.5 * r() * r()) * (1 - t * 0.55), L = rad * (1.5 + 2.5 * r())
    if (inCell(x, y, rad + L)) f.capsule(x - L, y, x + L * 0.4, y, rad * 0.45, rad, 0.5, 0.65, (x - cx) / 330, (x - cx) / 330)
  }
  satellites(f, r, cx, cy, R, 14, 0.6, 3, 0.3)
}
function cellDrips(f: CellField, r: () => number): void {
  const cx = 256 + (r() - 0.5) * 30, cy = 340 + (r() - 0.5) * 20, R = 62 + r() * 22
  const radii = radiiOf(28, R, 0.45, r, 2)
  f.polar(cx, cy, radii, 1, 0.55, 2, 0, 0.04)
  spikes(f, r, cx, cy, radii, 9 + Math.floor(r() * 8), R, -1, 0, 0.9, 0.03)
  satellites(f, r, cx, cy, R, 30, 0.9, 5, 0.05)
  const n = 3 + Math.floor(r() * 5)
  for (let i = 0; i < n; i++) {
    const off = (r() - 0.5) * 1.5 * R
    const y0 = cy - Math.sqrt(Math.max(0, R * R - off * off)) * 0.8
    const len = 40 + r() * Math.max(10, y0 - 40 - 40)
    let x = cx + off, y = y0
    const w = 3.5 + r() * 5.5
    let run = 0
    while (run < len) {
      const step = 14, nx = x + (r() - 0.5) * 3, ny = y - step
      if (!inCell(nx, ny, w + 3)) break
      const k0 = run / len, k1 = (run + step) / len
      f.capsule(x, y, nx, ny, w * (1 - 0.35 * k0), w * (1 - 0.35 * k1), 0.85, 0.85, 0.05 + 0.95 * run / 300, 0.05 + 0.95 * (run + step) / 300)
      x = nx; y = ny; run += step
    }
    if (inCell(x, y, w * 1.3)) f.circle(x, y - w * 0.4, w * 1.15, 1, 0.05 + 0.95 * (run + w) / 300)
  }
}
function cellPool(f: CellField, r: () => number): void {
  const cx = 256, cy = 256, R = 168 + r() * 16
  const radii = radiiOf(20, R, 0.32, r, 3)
  f.polar(cx, cy, radii, 1, 0.62, 6, 0, 0.92)
  for (let i = 0; i < 5; i++) {
    const a = r() * 6.283, d = R * (0.7 + 0.2 * r()), rad = 28 + r() * 30
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d
    if (inCell(x, y, rad)) f.circle(x, y, rad, 0.9, Math.min(1, d / R + 0.05))
  }
  satellites(f, r, cx, cy, R, 18, 0.18, 6, 1)
}
function cellImpact(f: CellField, r: () => number): void {
  const R = 58 + r() * 10, radii = radiiOf(24, R, 0.25, r, 2)
  f.polar(256, 256, radii, 1, 0.55, 2, 0, 0.2)
  spikes(f, r, 256, 256, radii, 10 + Math.floor(r() * 8), R, -1, 0, 1.2, 0.2)
  satellites(f, r, 256, 256, R, 20, 1.6, 5, 0.3)
}
function cellLong(f: CellField, r: () => number): void {
  const radii = radiiOf(20, 46, 0.2, r, 2)
  f.polar(150, 256, radii, 1, 0.6, 2, 0, 0.15)
  f.capsule(150, 256, 340, 256 + gauss(r) * 6, 40, 9, 1, 0.7, 0.1, 0.5)
  for (let i = 0; i < 9; i++) { const x = 360 + r() * 110, y = 256 + gauss(r) * 18, rad = 1.5 + r() * 6; if (inCell(x, y, rad * 2)) f.capsule(x - rad * 2, y, x, y, rad * 0.5, rad, 0.6, 0.7, (x - 150) / 330, (x - 150) / 330) }
}
function cellCluster(f: CellField, r: () => number): void {
  const n = 4 + Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, d = r() * 150, R = 14 + r() * 36, x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d
    if (!inCell(x, y, R * 1.3)) continue
    f.polar(x, y, radiiOf(16, R, 0.3, r, 2), 1, 0.55, 2, d / 300, d / 300 + 0.1)
  }
  satellites(f, r, 256, 256, 120, 40, 0.7, 4, 0.5)
}
function cellSmear(f: CellField, r: () => number): void {
  const n = 12
  for (let i = 0; i < n; i++) {
    const yo = (r() - 0.5) * 80, w = 3 + r() * 9, x0 = 30 + r() * 60, x1 = 482 - r() * 120, th = 0.35 + r() * 0.6
    let x = x0, y = 256 + yo
    while (x < x1) { const nx = Math.min(x1, x + 24), ny = y + (r() - 0.5) * 3; f.capsule(x, y, nx, ny, w, w * (0.85 + r() * 0.3), th, th, (x - 30) / 450, (nx - 30) / 450); x = nx; y = ny }
  }
  f.polar(60, 256, radiiOf(16, 44, 0.3, r, 2), 1, 0.6, 2, 0, 0.1)
}

/** Value noise on a lattice of random values (period = lattice size). */
function makeNoise(r: () => number, n: number): (x: number, y: number) => number {
  const v = new Float32Array(n * n); for (let i = 0; i < v.length; i++) v[i] = r()
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const x0 = ((xi % n) + n) % n, y0 = ((yi % n) + n) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n
    const a = v[y0 * n + x0], b = v[y0 * n + x1], c = v[y1 * n + x0], d = v[y1 * n + x1]
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
}

/** RGBA atlas data (R thickness, G reveal time 0..1, B noise, A coverage). Pure JS — works in tests without a canvas. */
export function buildAtlasData(size = ATLAS): Uint8Array {
  const cell = size / 4, scale = cell / CELL
  const data = new Uint8Array(size * size * 4)
  const f = new CellField(CELL)
  for (let k = 0; k < 16; k++) {
    f.reset()
    const r = rng32(7919 * (k + 3))
    if (k < C_DIR) cellRadial(f, r)
    else if (k < C_DRIP) cellDirectional(f, r)
    else if (k < C_POOL) cellDrips(f, r)
    else if (k < C_IMPACT) cellPool(f, r)
    else if (k === C_IMPACT) cellImpact(f, r)
    else if (k === C_LONG) cellLong(f, r)
    else if (k === C_CLUSTER) cellCluster(f, r)
    else cellSmear(f, r)
    const n1 = makeNoise(r, 32), n2 = makeNoise(r, 32)
    const ox = (k % 4) * cell, oy = Math.floor(k / 4) * cell
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const sx = Math.min(CELL - 1, Math.floor(x / scale)), sy = Math.min(CELL - 1, Math.floor(y / scale)), i = sy * CELL + sx
      const o = ((oy + y) * size + ox + x) * 4, c = f.cov[i]
      if (c <= 0) continue
      const a = n1(sx / 22, sy / 22) * 0.65 + n1(sx / 7 + 9, sy / 7 + 3) * 0.35, b = n2(sx / 40, sy / 40)
      data[o] = Math.round(255 * Math.max(0, Math.min(1, f.th[i] * (0.78 + 0.42 * a))))
      data[o + 1] = Math.round(255 * Math.max(0, Math.min(1, f.rev[i] + (b - 0.5) * (k >= C_POOL && k < C_IMPACT ? 0.16 : 0.04))))
      data[o + 2] = Math.round(255 * a)
      data[o + 3] = Math.round(255 * c)
    }
  }
  return data
}

// ───────────────────────────── procedural chunk geometry ─────────────────────────────

interface Shape { r: number; ax: number; ay: number; az: number }
type ChunkKind = "flesh" | "shard" | "brain" | "bone" | "gut"

const LIN = (hex: number) => new THREE.Color(hex)
function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void): void {
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3))
}
const wave = (x: number, y: number, z: number, s: number) => Math.sin(x * 3.1 + s) * Math.cos(y * 2.7 + s * 1.7) + 0.6 * Math.sin(z * 5.3 + x * 2 + s * 2.3)

function fleshGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 9, 7), p = g.attributes.position, r = rng32(seed)
  const sx = 0.8 + r() * 0.5, sy = 0.55 + r() * 0.35, sz = 0.7 + r() * 0.4
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * wave(x, y, z, seed) + 0.1 * Math.sin(x * 7 + y * 6 + z * 5 + seed)
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz)
  }
  const dark = LIN(0x3a0504), meat = LIN(0x8c1a12), fat = LIN(0xc79a7a), clot = LIN(0x1c0202)
  paint(g, (x, y, z, c) => {
    const n = wave(x * 2.1, y * 2.3, z * 1.9, seed + 4)
    c.copy(meat).lerp(dark, Math.max(0, Math.min(1, 0.5 + n * 0.5)))
    if (Math.sin(x * 9 + z * 7 + seed) > 0.82) c.lerp(fat, 0.7)
    if (n < -0.9) c.lerp(clot, 0.6)
  })
  g.computeVertexNormals()
  return g
}
function shardGeo(seed: number): THREE.BufferGeometry {
  // curved, thick plate of skull with jagged outline; outer face bone, inner face bloody
  const r = rng32(seed), K = 7, bend = 0.35, t = 0.16
  const pos: number[] = [], idx: number[] = []
  const rim: number[] = []
  for (let k = 0; k < K; k++) rim.push(0.6 + r() * 0.5)
  const yAt = (x: number, z: number) => -bend * (x * x + z * z)
  pos.push(0, t + yAt(0, 0) + 0.02, 0)
  for (let k = 0; k < K; k++) { const a = k / K * Math.PI * 2, x = Math.cos(a) * rim[k], z = Math.sin(a) * rim[k]; pos.push(x, t + yAt(x, z), z) }
  pos.push(0, -t + yAt(0, 0), 0)
  for (let k = 0; k < K; k++) { const a = k / K * Math.PI * 2, x = Math.cos(a) * rim[k] * 0.9, z = Math.sin(a) * rim[k] * 0.9; pos.push(x, -t + yAt(x, z), z) }
  const B = K + 1
  for (let k = 0; k < K; k++) {
    const a = 1 + k, b = 1 + (k + 1) % K
    idx.push(0, b, a, B, B + a, B + b, a, b, B + b, a, B + b, B + a)
  }
  let g: THREE.BufferGeometry = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx)
  g = g.toNonIndexed()
  const bone = LIN(0xd8cbb0), stain = LIN(0x5a0806), inner = LIN(0x7a2a20)
  paint(g, (x, y, z, c) => { c.copy(y < -0.02 - bend * (x * x + z * z) ? inner : bone); if (Math.sin(x * 6 + z * 5 + seed) > 0.55) c.lerp(stain, 0.65) })
  g.computeVertexNormals()
  return g
}
function brainGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 9), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const ridge = Math.abs(Math.sin(x * 9 + seed) * Math.sin(y * 8.5 + seed * 0.7) * Math.sin(z * 7.7 + seed * 1.3))
    const k = (1 + 0.15 * wave(x, y, z, seed)) * (0.9 + 0.14 * ridge)
    p.setXYZ(i, x * k, y * k * 0.72, z * k * 0.85)
  }
  const pink = LIN(0xc79892), groove = LIN(0x6e3634), blood = LIN(0x4a0605)
  paint(g, (x, y, z, c) => { const l = Math.hypot(x, y / 0.72, z / 0.85); c.copy(pink).lerp(groove, Math.max(0, Math.min(1, (1.0 - l) * 6))); if (Math.sin(x * 4 + y * 3 + seed) > 0.6) c.lerp(blood, 0.6) })
  g.computeVertexNormals()
  return g
}
function boneGeo(seed: number): THREE.BufferGeometry {
  const r = rng32(seed)
  let g: THREE.BufferGeometry
  if (seed % 2 === 0) {
    // rib: thin curved tube
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 5; i++) { const a = i / 5 * (1.2 + r() * 0.5); pts.push(new THREE.Vector3(Math.sin(a) * 0.6, (r() - 0.5) * 0.05, Math.cos(a) * 0.6)) }
    g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.055, 5, false)
  } else {
    // shaft with knobbed, splintered ends
    const prof: THREE.Vector2[] = [new THREE.Vector2(0.001, -0.62), new THREE.Vector2(0.13, -0.58), new THREE.Vector2(0.16, -0.48), new THREE.Vector2(0.075, -0.36), new THREE.Vector2(0.065, 0.2), new THREE.Vector2(0.09, 0.42), new THREE.Vector2(0.05, 0.5), new THREE.Vector2(0.001, 0.47)]
    g = new THREE.LatheGeometry(prof, 6)
  }
  g.center()
  const bone = LIN(0xdacfb6), blood = LIN(0x5e0907), marrow = LIN(0x8a2a1c)
  paint(g, (x, y, z, c) => { c.copy(bone); const s = Math.sin(x * 11 + y * 7 + z * 9 + seed); if (s > 0.5) c.lerp(blood, 0.7); else if (s < -0.85) c.lerp(marrow, 0.6) })
  g.computeVertexNormals()
  return g
}
function gutGeo(seed: number): THREE.BufferGeometry {
  const r = rng32(seed), pts: THREE.Vector3[] = []
  let x = 0, y = 0, z = 0
  for (let i = 0; i < 9; i++) { pts.push(new THREE.Vector3(x, y, z)); x += (r() - 0.3) * 0.35; y += (r() - 0.5) * 0.12; z += (r() - 0.5) * 0.35 }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.085, 6, false)
  g.center()
  const pink = LIN(0xb0706a), dark = LIN(0x5c1612), blood = LIN(0x3c0403)
  paint(g, (x, y, z, c) => { c.copy(pink).lerp(dark, 0.5 + 0.5 * Math.sin(x * 13 + z * 11 + seed)); if (Math.sin(y * 20 + x * 4) > 0.7) c.lerp(blood, 0.5) })
  g.computeVertexNormals()
  return g
}
function capGeo(): THREE.BufferGeometry {
  // domed disc (normal +Z): bone centre, marrow ring, dark meat, lighter torn rim
  const K = 12, rings = [[0, 0.16], [0.18, 0.15], [0.26, 0.11], [0.62, 0.07], [1, 0]], cols = [0xe0d6c0, 0xd0c2a6, 0x6a0c08, 0x3a0403, 0x8a2016].map(LIN)
  const pos: number[] = [0, 0, rings[0][1]], col: number[] = [cols[0].r, cols[0].g, cols[0].b], idx: number[] = []
  for (let ri = 1; ri < rings.length; ri++) for (let k = 0; k < K; k++) {
    const a = k / K * Math.PI * 2, j = ri === rings.length - 1 ? 0.85 + 0.3 * ((k * 7) % 5) / 5 : 1
    pos.push(Math.cos(a) * rings[ri][0] * j, Math.sin(a) * rings[ri][0] * j, rings[ri][1]); col.push(cols[ri].r, cols[ri].g, cols[ri].b)
  }
  for (let k = 0; k < K; k++) idx.push(0, 1 + k, 1 + (k + 1) % K)
  for (let ri = 1; ri < rings.length - 1; ri++) for (let k = 0; k < K; k++) {
    const a = 1 + (ri - 1) * K + k, b = 1 + (ri - 1) * K + (k + 1) % K, c = a + K, d = b + K
    idx.push(a, c, d, a, d, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Collision shape of a centred geometry: capsule along the longest bounding-box axis. */
function shapeOf(g: THREE.BufferGeometry): Shape {
  g.computeBoundingBox()
  const b = g.boundingBox!, sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z
  const m = Math.max(sx, sy, sz), r = (sx + sy + sz - m) / 4, half = Math.max(0, m / 2 - r)
  return { r, ax: m === sx ? half : 0, ay: m === sy && m !== sx ? half : 0, az: m === sz && m !== sx && m !== sy ? half : 0 }
}

// ───────────────────────────── shaders ─────────────────────────────

const particleVertex = /* glsl */ `
attribute vec3 aVel; attribute vec4 aColor; attribute float aSize; attribute float aKind;
uniform vec2 uViewport; uniform float uStreak;
varying vec4 vColor; varying vec4 vShape; varying vec2 vDir; varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vColor = aColor; vSeed = fract(float(gl_VertexID) * 0.618034); vDir = vec2(1.0, 0.0); vShape = vec4(0.0);
  if (aColor.a < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float pxPerM = uViewport.y * 0.5 * projectionMatrix[1][1] / max(0.05, -mvPosition.z);
  // droplets are drawn 1.7× their physical size so a spray reads at gameplay distances
  float rad = aSize * (aKind < 0.5 ? 0.85 : 0.5) * pxPerM;
  vec4 clip = projectionMatrix * mvPosition;
  float halfLen = 0.0;
  if (aKind < 0.5 && clip.w > 0.05) {
    vec4 mv2 = modelViewMatrix * vec4(position - aVel * uStreak, 1.0);
    if (mv2.z < -0.05) {
      vec4 c2 = projectionMatrix * mv2;
      vec2 d = (clip.xy / clip.w - c2.xy / c2.w) * 0.5 * uViewport;
      float len = length(d);
      if (len > 0.05) {
        vDir = d / len; halfLen = min(len * 0.5, rad * 2.5 + 2.0);
        clip.xy -= vDir * halfLen / (0.5 * uViewport) * clip.w;
      }
    }
  }
  float fade = 1.0;
  if (rad < 0.9) { fade = rad / 0.9; rad = 0.9; }
  float size = min(2.0 * (halfLen + rad) + 2.0, 600.0);
  if (aKind < 0.5) fade *= mix(1.0, 0.5, halfLen / (halfLen + rad * 4.0));
  vColor.a *= fade;
  vShape = vec4(halfLen, rad, size, aKind);
  gl_Position = clip; gl_PointSize = size;
  #include <fog_vertex>
}`
const particleFragment = /* glsl */ `
uniform vec3 uLight;
varying vec4 vColor; varying vec4 vShape; varying vec2 vDir; varying float vSeed;
#include <fog_pars_fragment>
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = (gl_PointCoord - 0.5) * vShape.z; p.y = -p.y;
  float a; vec3 col = vColor.rgb;
  if (vShape.w < 0.5) {
    // tapered streak: full radius at the leading end, thin tail
    float t = clamp(dot(p, vDir), -vShape.x, vShape.x);
    float k = vShape.x > 0.0 ? (t + vShape.x) / (2.0 * vShape.x) : 1.0;
    float rr = vShape.y * mix(0.35, 1.0, k * k);
    float d = length(p - vDir * t);
    a = clamp(rr - d + 0.5, 0.0, 1.0);
    vec2 hp = p - vDir * vShape.x - vec2(-0.3, 0.35) * vShape.y;
    float spec = (1.0 - smoothstep(0.0, vShape.y * 0.4, length(hp))) * smoothstep(2.5, 5.0, vShape.y);
    col = col * (1.05 - 0.25 * d / max(rr, 0.001)) + vec3(0.8, 0.62, 0.58) * spec * 0.25;
  } else {
    float d = length(p) / max(vShape.y, 0.001);
    float n = gNoise(p / max(vShape.y, 1.0) * 2.4 + vSeed * 37.0) * 0.65 + gNoise(p / max(vShape.y, 1.0) * 5.3 + vSeed * 11.0) * 0.35;
    a = exp(-d * d * 2.0) * smoothstep(1.0, 0.6, d) * (0.25 + 1.0 * n);
    col *= 0.85 + 0.4 * n;
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * uLight, min(1.0, a));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

// ───────────────────────────── the system ─────────────────────────────

interface PartInfo { cx: number; cy: number; cz: number; ax: number; ay: number; az: number; half: number; radius: number }
interface Gib {
  body: GibBody
  obj: THREE.Object3D | null
  born: number
  bleed: number
  bleedAcc: number
  /** Body-space point that bleeds (cut end). */
  jx: number; jy: number; jz: number
  r: number; g: number; b: number
  dying: number
  landed: boolean
  slide: number
  lx: number; lz: number
}
interface Emitter {
  active: boolean
  parent: THREE.Object3D | null
  lx: number; ly: number; lz: number
  dx: number; dy: number; dz: number
  age: number; dur: number; acc: number; rate: number; bpm: number; strength: number; spread: number
  r: number; g: number; b: number
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3()
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _box = new THREE.Box3(), _box2 = new THREE.Box3(), _col = new THREE.Color()
const _zAxis = new THREE.Vector3(0, 0, 1), _vp = new THREE.Vector2(), _e = new THREE.Euler()

export class GoreSystem {
  onScreenSplatter: ((amount: number) => void) | null = null
  /** RNG used for all variation (replace with a seeded one for reproducible captures). */
  random: () => number = Math.random

  readonly root = new THREE.Group()
  private time = 0
  private camX = 0; private camY = 0; private camZ = 0; private camKnown = false
  // blood colour of the current call (linear)
  private br = 0; private bg = 0; private bb = 0

  // particles
  private pPos = new Float32Array(MAX_P * 3)
  private pVel = new Float32Array(MAX_P * 3)
  private pCol = new Float32Array(MAX_P * 4)
  private pSize = new Float32Array(MAX_P)
  private pKind = new Float32Array(MAX_P)
  private pLife = new Float32Array(MAX_P)
  private pMax = new Float32Array(MAX_P)
  private pGrow = new Float32Array(MAX_P)
  private pDrag = new Float32Array(MAX_P)
  private pGrav = new Float32Array(MAX_P)
  private pA0 = new Float32Array(MAX_P)
  private pBase = new Float32Array(MAX_P)
  private pFlags = new Uint8Array(MAX_P)
  private pPlane = new Int16Array(MAX_P)
  private pRing = new Ring(MAX_P)
  private pAlive = 0
  private pDirty = false
  private kindDirty = false
  private planes = new Float32Array(PLANES * 4)
  private planeBox: (Obstacle | null)[] = new Array(PLANES).fill(null)
  private planeRing = new Ring(PLANES)
  private pGeo = new THREE.BufferGeometry()
  private pMat: THREE.ShaderMaterial
  private points: THREE.Points
  private light = new THREE.Vector3(1, 1, 1)
  private lightTimer = 0
  private la = 0; private lr = 0; private lg = 0; private lb = 0; private lights = 0

  // decals
  private atlas: THREE.DataTexture
  private dGeo = new THREE.PlaneGeometry(1, 1)
  private dMat: THREE.MeshStandardMaterial
  private decals: THREE.InstancedMesh
  private dAttr: THREE.InstancedBufferAttribute
  private dColor: THREE.InstancedBufferAttribute
  private splatRing = new Ring(GORE_BUDGET.splats)
  private poolRing = new Ring(GORE_BUDGET.pools)
  private dropRing = new Ring(GORE_BUDGET.drops)
  private dDirty = false
  private layer = 0
  private dropsThisFrame = 0
  private uTime = { value: 0 }

  // gibs, emitters, caps
  private gibs: Gib[] = []
  private emitters: Emitter[] = []
  private caps: (THREE.Mesh | null)[] = new Array(MAX_CAPS).fill(null)
  private capRing = new Ring(MAX_CAPS)
  private chunkMat = withSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0 }), { scale: 70, bump: 0.0008, grime: 0.2, mottle: 0.35, rough: 0.2, type: SURF.wet })
  private capMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })
  private capGeo = capGeo()
  private chunks: Record<ChunkKind, THREE.BufferGeometry[]>
  private shapes = new Map<THREE.BufferGeometry, Shape>()
  // hit scratch
  private hitT = 0; private hnx = 0; private hny = 0; private hnz = 0; private hitBox: Obstacle | null = null

  constructor(readonly scene: THREE.Scene, readonly collision: CollisionWorld, public level: GoreLevel = "brutal") {
    this.root.name = "Gore"
    scene.add(this.root)
    // particles
    for (let i = 0; i < MAX_P; i++) { this.pPos[i * 3 + 1] = -1000; this.pPlane[i] = -1 }
    const dyn = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage)
    this.pGeo.setAttribute("position", dyn(this.pPos, 3))
    this.pGeo.setAttribute("aVel", dyn(this.pVel, 3))
    this.pGeo.setAttribute("aColor", dyn(this.pCol, 4))
    this.pGeo.setAttribute("aSize", dyn(this.pSize, 1))
    this.pGeo.setAttribute("aKind", dyn(this.pKind, 1))
    this.pMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uViewport: { value: new THREE.Vector2(1280, 720) }, uStreak: { value: 0.02 }, uLight: { value: this.light } }]),
      vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false, fog: true,
    })
    this.pMat.uniforms.uLight.value = this.light
    this.points = new THREE.Points(this.pGeo, this.pMat)
    this.points.frustumCulled = false; this.points.renderOrder = 4
    this.points.onBeforeRender = this.beforeParticles
    // decals
    this.atlas = new THREE.DataTexture(atlasData ??= buildAtlasData(), ATLAS, ATLAS, THREE.RGBAFormat)
    this.atlas.generateMipmaps = true; this.atlas.minFilter = THREE.LinearMipmapLinearFilter; this.atlas.magFilter = THREE.LinearFilter
    this.atlas.anisotropy = 4; this.atlas.needsUpdate = true
    this.dMat = new THREE.MeshStandardMaterial({ map: this.atlas, bumpMap: this.atlas, bumpScale: 1.4, roughness: 0.3, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
    this.dMat.onBeforeCompile = this.patchDecalShader
    this.dMat.customProgramCacheKey = () => "gore-decal-v1"
    this.decals = new THREE.InstancedMesh(this.dGeo, this.dMat, DECALS)
    ;(this.decals.instanceMatrix.array as Float32Array).fill(0)
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.dColor = new THREE.InstancedBufferAttribute(new Float32Array(DECALS * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.decals.instanceColor = this.dColor
    this.dAttr = new THREE.InstancedBufferAttribute(new Float32Array(DECALS * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.dGeo.setAttribute("aDecal", this.dAttr)
    this.decals.frustumCulled = false; this.decals.receiveShadow = true; this.decals.renderOrder = 1
    this.root.add(this.decals, this.points)
    // chunks
    this.chunks = {
      flesh: [11, 23, 37, 41, 53].map(fleshGeo), shard: [5, 17, 29, 43].map(shardGeo), brain: [3, 19].map(brainGeo),
      bone: [2, 7, 12].map(boneGeo), gut: [13, 31].map(gutGeo),
    }
    for (const list of Object.values(this.chunks)) for (const g of list) this.shapes.set(g, shapeOf(g))
    for (let i = 0; i < GORE_BUDGET.gibs; i++) this.gibs.push({ body: new GibBody(), obj: null, born: 0, bleed: 0, bleedAcc: 0, jx: 0, jy: 0, jz: 0, r: 0, g: 0, b: 0, dying: -1, landed: false, slide: 0, lx: 0, lz: 0 })
    for (let i = 0; i < MAX_EMITTERS; i++) this.emitters.push({ active: false, parent: null, lx: 0, ly: 0, lz: 0, dx: 0, dy: 1, dz: 0, age: 0, dur: 0, acc: 0, rate: 0, bpm: 120, strength: 1, spread: 0.2, r: 0, g: 0, b: 0 })
  }

  // ───────────── public API ─────────────

  wound(point: Vec3, dir: Vec3, damage: number, opts: GoreOptions = {}): void {
    if (this.level === "off") return
    this.setBlood(opts.color)
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1, dx = dir.x / l, dy = dir.y / l, dz = dir.z / l
    const brutal = this.level === "brutal", k = brutal ? 1 : 0.6
    const a = Math.max(0.25, Math.min(1.6, damage / 45)) * (opts.heavy ? 1.6 : 1)
    this.burst(point.x, point.y, point.z, dx, dy, dz, a, k, false)
    this.splash(point.x, point.y, point.z, Math.min(1, 0.25 + a * 0.3))
  }

  sever(part: THREE.Object3D, impulse: Vec3, opts: GoreOptions = {}): void {
    if (this.level === "off" || !part.visible) return
    this.setBlood(opts.color)
    part.updateWorldMatrix(true, true)
    const info = this.partInfo(part)
    _v.set(info.cx, info.cy, info.cz).applyMatrix4(part.matrixWorld)
    const cx = _v.x, cy = _v.y, cz = _v.z
    let il = Math.hypot(impulse.x, impulse.y, impulse.z)
    const ix = il > 1e-4 ? impulse.x / il : 0, iy = il > 1e-4 ? impulse.y / il : 1, iz = il > 1e-4 ? impulse.z / il : 0
    if (this.level === "normal") { this.burst(cx, cy, cz, ix, iy, iz, 1.5, 0.75, true); this.splash(cx, cy, cz, 0.6); return }
    il = Math.min(25, il)
    part.matrixWorld.decompose(_v2, _q, _s)
    const jx = _v2.x, jy = _v2.y, jz = _v2.z, ws = Math.abs(_s.x) || 1
    // gib: wrapper at the centre of mass holding a clone with the part's world transform
    const wrap = new THREE.Group()
    wrap.position.set(cx, cy, cz)
    const clone = part.clone(true)
    stripLights(clone)
    clone.visible = true
    clone.position.set(jx - cx, jy - cy, jz - cz); clone.quaternion.copy(_q); clone.scale.copy(_s)
    wrap.add(clone)
    // long axis in world space
    _v.set(info.ax, info.ay, info.az).applyQuaternion(_q)
    const wax = _v.x, way = _v.y, waz = _v.z, rad = info.radius * ws, half = Math.max(0, info.half * ws - rad)
    // cap on the cut end of the flying part (faces from the centre of mass towards the joint)
    const cut = new THREE.Mesh(this.capGeo, this.capMat)
    cut.position.set(jx - cx, jy - cy, jz - cz)
    cut.quaternion.setFromUnitVectors(_zAxis, _v2.set(-wax, -way, -waz))
    cut.scale.setScalar(rad * 0.95)
    wrap.add(cut)
    const g = this.addGib(wrap, rad, wax * half, way * half, waz * half)
    if (g) {
      const b = g.body
      b.vx = ix * il + this.rs(0.8); b.vy = (il > 1e-4 ? iy * il : 0) + 1.2 + this.random() * 1.5; b.vz = iz * il + this.rs(0.8)
      this.spin(b, 5, 14)
      g.jx = jx - cx; g.jy = jy - cy; g.jz = jz - cz; g.bleed = 1.6 + this.random()
    }
    part.visible = false
    // stump: cap + fountain on the parent at the joint
    const parent = part.parent
    _v.set(info.ax, info.ay, info.az).applyQuaternion(part.quaternion)
    let sdx = _v.x, sdy = _v.y, sdz = _v.z
    const pl = part.position.length()
    if (pl > 1e-3) { sdx = sdx * 0.6 + part.position.x / pl * 0.8; sdy = sdy * 0.6 + part.position.y / pl * 0.8; sdz = sdz * 0.6 + part.position.z / pl * 0.8 }
    if (parent) {
      this.addCap(parent, part.position.x, part.position.y, part.position.z, _v.x, _v.y, _v.z, info.radius * 0.95)
      this.addEmitter(parent, part.position.x, part.position.y, part.position.z, sdx, sdy, sdz, 2.4 + this.random() * 0.4, 380, 1, 0.14)
    }
    // the cut itself: burst at the joint in the impulse direction
    this.burst(jx, jy, jz, ix, iy, iz, 1.2, 0.8, true)
    this.splash(jx, jy, jz, 0.75)
  }

  headshot(head: THREE.Object3D, dir: Vec3, opts: GoreOptions = {}): void {
    if (this.level === "off" || !head.visible) return
    this.setBlood(opts.color)
    head.updateWorldMatrix(true, true)
    const info = this.partInfo(head)
    _v.set(info.cx, info.cy, info.cz).applyMatrix4(head.matrixWorld)
    const cx = _v.x, cy = _v.y, cz = _v.z
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1, dx = dir.x / l, dy = dir.y / l, dz = dir.z / l
    if (this.level === "normal") { this.burst(cx, cy, cz, dx, dy, dz, 1.6, 0.8, true); this.splash(cx, cy, cz, 0.8); return }
    head.matrixWorld.decompose(_v2, _q, _s)
    const hr = Math.max(0.06, info.radius * Math.abs(_s.x))
    head.visible = false
    // skull, brain and flesh chunks
    const n = 7 + Math.floor(this.random() * 4)
    for (let i = 0; i < n; i++) {
      const kind: ChunkKind = i < 4 ? "shard" : i < 6 ? "brain" : "flesh"
      const size = (kind === "shard" ? 0.045 : kind === "brain" ? 0.04 : 0.035) * (0.7 + this.random() * 0.6) * hr / 0.1
      const sp = 2.5 + this.random() * 5
      this.chunk(kind, null, cx + this.rs(hr * 0.5), cy + this.rs(hr * 0.5), cz + this.rs(hr * 0.5), size,
        dx * sp + this.rs(2.6), dy * sp + 1.6 + this.random() * 2.6, dz * sp + this.rs(2.6), 8, 24, 0.5)
    }
    // red mist: big, slow, lingering
    for (let i = 0; i < 46; i++) {
      this.cone(dx, dy + 0.15, dz, 0.85)
      const sp = 0.5 + this.random() * 3.4
      this.emit(cx + this.rs(0.06), cy + this.rs(0.06), cz + this.rs(0.06), this.ox * sp, this.oy * sp + 0.2, this.oz * sp, 0.1 + this.random() * 0.26, 0.7 + this.random() * 1.1, 1, 0.5 + this.random() * 0.2, 2.8, 0.4, 3.2, 0, -1, 1.2)
    }
    this.burst(cx, cy, cz, dx, dy, dz, 2.4, 1, true)
    // neck stump: cap + fountain
    const parent = head.parent
    if (parent) {
      _v.set(info.ax, info.ay, info.az).applyQuaternion(head.quaternion)
      this.addCap(parent, head.position.x, head.position.y, head.position.z, _v.x, _v.y, _v.z, info.radius * 0.5)
      this.addEmitter(parent, head.position.x, head.position.y, head.position.z, _v.x, _v.y, _v.z, 2.6, 420, 1.1, 0.16)
    }
    this.splash(cx, cy, cz, 1)
  }

  gib(root: THREE.Object3D, center: Vec3, force: number, opts: GoreOptions = {}): void {
    if (this.level === "off" || !root.visible) return
    this.setBlood(opts.color)
    root.updateWorldMatrix(true, true)
    _box.setFromObject(root)
    if (_box.isEmpty()) _box.setFromCenterAndSize(_v.set(center.x, center.y + 0.9, center.z), _v2.set(0.6, 1.8, 0.6))
    _box.getCenter(_v)
    const bx = _v.x, by = Math.max(0.3, _v.y), bz = _v.z
    const sx = _box.max.x - _box.min.x, sy = _box.max.y - _box.min.y, sz = _box.max.z - _box.min.z
    if (this.level === "normal") {
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + this.random(); this.burst(bx, by, bz, Math.cos(a), 0.3, Math.sin(a), 1.2, 0.7, true) }
      this.splash(bx, by, bz, 0.9)
      return
    }
    const f = Math.max(2, Math.min(20, force))
    // every visible mesh becomes a gib (largest first); torso-sized ones are torn into clothed chunks
    const meshes: THREE.Mesh[] = []
    collectMeshes(root, meshes)
    for (const m of meshes) { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere() }
    const radiusOf = (m: THREE.Mesh) => m.geometry.boundingSphere!.radius * m.matrixWorld.getMaxScaleOnAxis()
    meshes.sort((a, b) => radiusOf(b) - radiusOf(a))
    let used = 0
    for (const m of meshes) {
      if (used >= 16) break
      const rad = radiusOf(m)
      if (rad < 0.015) continue
      _v.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld)
      const px = _v.x, py = _v.y, pz = _v.z
      if (rad > 0.24) {
        // torso-sized: one torn clothed piece and raw meat
        this.launch(this.chunk("flesh", m.material as THREE.Material, px + this.rs(rad * 0.3), py + this.rs(rad * 0.3), pz + this.rs(rad * 0.3), rad * (0.38 + this.random() * 0.1), 0, 0, 0, 6, 18, 1.4), center, f)
        for (let i = 0; i < 2; i++) this.launch(this.chunk("flesh", null, px + this.rs(rad * 0.4), py + this.rs(rad * 0.4), pz + this.rs(rad * 0.4), rad * (0.3 + this.random() * 0.12), 0, 0, 0, 6, 18, 1.6), center, f)
        used++
        continue
      }
      m.matrixWorld.decompose(_v2, _q, _s)
      const wrap = new THREE.Group(); wrap.position.set(px, py, pz)
      const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow
      c.position.set(_v2.x - px, _v2.y - py, _v2.z - pz); c.quaternion.copy(_q); c.scale.copy(_s)
      wrap.add(c)
      // capsule along the mesh's longest axis
      const gb = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox!)
      const ex = (gb.max.x - gb.min.x) * Math.abs(_s.x), ey = (gb.max.y - gb.min.y) * Math.abs(_s.y), ez = (gb.max.z - gb.min.z) * Math.abs(_s.z)
      const mx = Math.max(ex, ey, ez), r = Math.max(0.02, (ex + ey + ez - mx) / 4), half = Math.max(0, mx / 2 - r)
      _v.set(mx === ex ? 1 : 0, mx === ey && mx !== ex ? 1 : 0, mx === ez && mx !== ex && mx !== ey ? 1 : 0).applyQuaternion(_q)
      const g = this.addGib(wrap, r, _v.x * half, _v.y * half, _v.z * half)
      if (g) { g.bleed = 1 + this.random(); this.launch(g, center, f) }
      used++
    }
    // extra flesh, bones and guts
    const extra: ChunkKind[] = ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "gut", "gut", "gut", "bone", "bone", "bone", "shard"]
    for (const kind of extra) {
      const size = kind === "flesh" ? 0.05 + this.random() * 0.07 : kind === "gut" ? 0.24 + this.random() * 0.12 : kind === "bone" ? 0.18 + this.random() * 0.1 : 0.05
      const g = this.chunk(kind, null, bx + this.rs(sx * 0.3), by + this.rs(sy * 0.3), bz + this.rs(sz * 0.3), size, 0, 0, 0, 6, 20, 1.2)
      this.launch(g, center, f)
    }
    root.visible = false
    // blood everywhere: omni bursts (each with its own wall raycast), floor ring, pool
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + this.random() * 0.5
      this.burst(bx + this.rs(0.2), by + this.rs(0.3), bz + this.rs(0.2), Math.cos(a), 0.15 + this.random() * 0.5, Math.sin(a), 1.4, 0.75, true)
    }
    for (let i = 0; i < 18; i++) {
      this.cone(0, 0.6, 0, 1.4)
      const sp = 0.5 + this.random() * 3
      this.emit(bx + this.rs(0.2), by + this.rs(0.3), bz + this.rs(0.2), this.ox * sp, this.oy * sp, this.oz * sp, 0.3 + this.random() * 0.5, 1 + this.random(), 1, 0.4, 2.2, 0.3, 2.2, 0, -1, 1.1)
    }
    for (let i = 0; i < 10; i++) {
      const a = this.random() * Math.PI * 2, d = 0.4 + Math.pow(this.random(), 0.7) * 3
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d
      const sy = this.surfaceBelow(x, by, z)
      this.splat(x, sy, z, 0, 1, 0, this.hitBox, Math.cos(a), 0, Math.sin(a), 0.18 + this.random() * 0.24, 1.5, d < 1.2 ? "radial" : "dir", 0.1 + d * 0.12)
    }
    this.pool({ x: bx, y: 0, z: bz }, 1.2, opts)
    this.splash(bx, by, bz, 1)
  }

  pool(position: Vec3, size: number, opts: GoreOptions = {}): void {
    if (this.level === "off") return
    this.setBlood(opts.color)
    const sy = this.surfaceBelow(position.x, position.y + 0.6, position.z)
    const d = Math.max(0.15, Math.min(2.5, size)) * 1.2 * (0.8 + this.random() * 0.25) * FILL.pool
    const room = this.hitBox ? faceRoom(this.hitBox, position.x, sy, position.z, 0, 1, 0) * 2.2 : Infinity
    if (room < 0.1) return
    const dd = Math.min(d, room)
    const i = POOL0 + this.poolRing.next()
    const ang = this.random() * Math.PI * 2
    this.writeDecal(i, position.x, sy, position.z, 0, 1, 0, Math.cos(ang), 0, Math.sin(ang), dd, dd, C_POOL + Math.floor(this.random() * 2), this.time + 0.25, 3 + this.random() * 3, 1, 0.85 + this.random() * 0.2)
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt
    this.uTime.value = this.time
    const e = camera.matrixWorld.elements
    this.camX = e[12]; this.camY = e[13]; this.camZ = e[14]; this.camKnown = true
    if ((this.lightTimer -= dt) <= 0) { this.lightTimer = 2; this.refreshLight() }
    this.dropsThisFrame = 0
    this.updateEmitters(dt)
    this.updateGibs(dt)
    this.updateParticles(dt)
    if (this.dDirty) {
      this.dDirty = false
      this.decals.instanceMatrix.needsUpdate = true; this.dAttr.needsUpdate = true; this.dColor.needsUpdate = true
    }
  }

  /** Removes everything (new raid). Hidden body parts stay hidden — they belong to the hostile managers. */
  clear(): void {
    for (let i = 0; i < MAX_P; i++) { this.pLife[i] = 0; this.pCol[i * 4 + 3] = 0; this.pPos[i * 3 + 1] = -1000; this.pPlane[i] = -1 }
    this.pRing.reset(); this.pAlive = 0; this.pDirty = true
    for (const g of this.gibs) this.releaseGib(g)
    for (const em of this.emitters) { em.active = false; em.parent = null }
    for (let i = 0; i < MAX_CAPS; i++) { this.caps[i]?.removeFromParent(); this.caps[i] = null }
    this.capRing.reset()
    ;(this.decals.instanceMatrix.array as Float32Array).fill(0)
    this.splatRing.reset(); this.poolRing.reset(); this.dropRing.reset(); this.planeRing.reset()
    this.planeBox.fill(null)
    this.dDirty = true
    this.decals.instanceMatrix.needsUpdate = true
    for (const name of ["position", "aColor"]) (this.pGeo.attributes[name] as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.clear()
    this.root.removeFromParent()
    this.pGeo.dispose(); this.pMat.dispose()
    this.decals.dispose(); this.dGeo.dispose(); this.dMat.dispose(); this.atlas.dispose()
    this.chunkMat.dispose(); this.capMat.dispose(); this.capGeo.dispose()
    for (const list of Object.values(this.chunks)) for (const g of list) g.dispose()
    this.onScreenSplatter = null
  }

  /** Live counts (bench/HUD diagnostics). */
  stats(): GoreStats {
    let gibs = 0, awake = 0, em = 0, caps = 0
    for (const g of this.gibs) if (g.obj) { gibs++; if (!g.body.sleeping || g.dying >= 0) awake++ }
    for (const e of this.emitters) if (e.active) em++
    for (const c of this.caps) if (c) caps++
    return { particles: this.pAlive, gibs, awakeGibs: awake, splats: this.splatRing.count, pools: this.poolRing.count, drops: this.dropRing.count, emitters: em, caps }
  }

  // ───────────── blood bursts ─────────────

  /**
   * Exit spray along d plus back-spatter, with kill planes and wall/floor splats from raycasts. a = amount (0.25..2.5),
   * k = level scale (normal 0.6), heavy adds an arterial spurt.
   */
  private burst(x: number, y: number, z: number, dx: number, dy: number, dz: number, a: number, k: number, heavy: boolean): void {
    const r = this.random, am = Math.min(a, 2.2)
    const ex = x + dx * 0.1, ey = y + dy * 0.1, ez = z + dz * 0.1
    // exit side: raycast for the wall behind, kill plane for the droplets
    const hit = this.raycast(ex, ey, ez, dx, dy, dz, 4.5)
    const plane = hit ? this.addPlane(this.hnx, this.hny, this.hnz, ex + dx * this.hitT, ey + dy * this.hitT, ez + dz * this.hitT, this.hitBox) : -1
    const wallT = hit ? this.hitT : Infinity, wnx = this.hnx, wny = this.hny, wnz = this.hnz, wbox = this.hitBox
    // exit spray: dense fine droplets and chunky drops
    const n = Math.round((50 + 60 * am) * k)
    for (let i = 0; i < n; i++) {
      const fine = r() < 0.7
      this.cone(dx, dy, dz, fine ? 0.2 + 0.08 * am : 0.13)
      const sp = (fine ? 3.5 + r() * 7.5 : 2.2 + r() * 4.5) * (0.85 + 0.2 * am)
      const s = fine ? 0.007 + r() * 0.012 : 0.018 + r() * 0.022
      this.emit(ex, ey, ez, this.ox * sp, this.oy * sp, this.oz * sp, s, 1.8, 0, 0.95, 0.3, GRAV, 0, !fine || r() < 0.2 ? 3 : 0, plane, 0.7 + r() * 0.55)
    }
    // thick gushes falling close to the body
    for (let i = 0; i < 3 + Math.round(am * 3); i++) {
      this.cone(dx, dy + 0.25, dz, 0.3)
      const sp = 1 + r() * 2.5
      this.emit(ex, ey, ez, this.ox * sp, this.oy * sp, this.oz * sp, 0.035 + r() * 0.03, 1.6, 0, 1, 0.15, GRAV, 0, 3, plane, 0.55 + r() * 0.3)
    }
    // mist: dense core expanding along the shot, part of it jetting out of the exit wound
    for (let i = 0; i < Math.round((7 + 9 * am) * k); i++) {
      this.cone(dx, dy, dz, 0.4)
      const sp = (r() < 0.4 ? 3 + r() * 4 : 0.4 + r() * 2) * (0.7 + 0.3 * am)
      this.emit(ex + this.rs(0.03), ey + this.rs(0.03), ez + this.rs(0.03), this.ox * sp, this.oy * sp, this.oz * sp, (0.06 + r() * 0.12) * (0.6 + 0.4 * am), 0.35 + r() * 0.45, 1, 0.45 + r() * 0.2, 3.5, 0.5, 3.2, 0, -1, 1.25)
    }
    // back-spatter towards the shooter
    const back = this.raycast(x, y, z, -dx, -dy, -dz, 3)
    const bplane = back ? this.addPlane(this.hnx, this.hny, this.hnz, x - dx * this.hitT, y - dy * this.hitT, z - dz * this.hitT, this.hitBox) : -1
    for (let i = 0; i < Math.round((22 + 30 * am) * k); i++) {
      this.cone(-dx, -dy + 0.15, -dz, 0.6)
      const sp = 1.5 + r() * 4
      this.emit(x, y, z, this.ox * sp, this.oy * sp, this.oz * sp, 0.006 + r() * 0.014, 1.4, 0, 0.95, 0.5, GRAV, 0, r() < 0.12 ? 3 : 0, bplane, 0.8 + r() * 0.4)
    }
    for (let i = 0; i < 3 + Math.round(2 * am); i++) {
      this.cone(-dx, -dy + 0.1, -dz, 0.7)
      const sp = 0.3 + r() * 1.4
      this.emit(x, y, z, this.ox * sp, this.oy * sp, this.oz * sp, 0.07 + r() * 0.1, 0.3 + r() * 0.35, 1, 0.55, 4, 0.4, 3, 0, -1, 1.25)
    }
    if (heavy || a > 0.7) this.addEmitter(null, ex, ey, ez, dx * 0.8, dy * 0.8 + 0.35, dz * 0.8, 0.45 + 0.25 * am + r() * 0.2, 220, 0.55 * Math.min(1.5, a) * k, 0.18)
    // decals: splat on the wall behind (≤ 4.5 m), on the floor where the spray lands first, back-spatter, drops below
    const dsize = k < 1 ? 0.6 : 1
    const v0 = 4.5, hd = Math.hypot(dx, dz), vh = hd * v0, vy = dy * v0
    const tl = (vy + Math.sqrt(vy * vy + 2 * GRAV * Math.max(0.05, ey - FLOOR_Y))) / GRAV, land = vh * tl
    if (hit) {
      const t = wallT, px = ex + dx * t, py = ey + dy * t, pz = ez + dz * t
      const size = (0.16 + 0.14 * am) * (0.8 + 0.15 * t) * dsize
      const kind = Math.abs(wny) < 0.5 && am > 0.5 && r() < 0.55 ? "drip" : r() < 0.65 ? "dir" : "radial"
      const inc = Math.abs(dx * wnx + dy * wny + dz * wnz)
      this.splat(px, py, pz, wnx, wny, wnz, wbox, dx, dy, dz, size, kind === "dir" ? Math.min(2.2, 1 / Math.max(0.45, inc)) : 1, kind, t / 9)
    }
    if (vh > 0.2 && (!hit || land < wallT * hd - 0.2)) {
      const hx = dx / hd, hz = dz / hd, d = land * (0.75 + r() * 0.35)
      const sy = this.surfaceBelow(ex + hx * d, ey, ez + hz * d)
      this.splat(ex + hx * d, sy, ez + hz * d, 0, 1, 0, this.hitBox, hx, 0, hz, (0.14 + 0.1 * am) * dsize, 1.6, "dir", tl)
    }
    if (back && this.hitT < 2.2 && a > 0.5) {
      const t = this.hitT, px = x - dx * t, py = y - dy * t, pz = z - dz * t
      this.splat(px, py, pz, this.hnx, this.hny, this.hnz, this.hitBox, -dx, -dy, -dz, (0.08 + 0.07 * am) * dsize, 1.3, "dir", t / 5)
    }
    const fx = x + this.rs(0.2), fz = z + this.rs(0.2)
    this.drop(fx, this.surfaceBelow(fx, y, fz), fz, 0, 1, 0, 0, 0, 0, (0.05 + 0.04 * am) * dsize, 0.35)
  }

  /**
   * Splat decal on a surface: size = visible main-blob diameter (the quad is larger: spikes, satellites); clamped to the
   * box face it sits on. "dir" elongates along the projected (tx,ty,tz), "drip" runs down the wall.
   */
  private splat(x: number, y: number, z: number, nx: number, ny: number, nz: number, box: Obstacle | null, tx: number, ty: number, tz: number, size: number, stretch: number, kind: "radial" | "dir" | "drip", delay: number): void {
    const r = this.random, f = FILL[kind], st = kind === "dir" ? Math.sqrt(stretch) : 1
    let sx = size * f * st, sy = size * f / st
    if (box) {
      const room = faceRoom(box, x, y, z, nx, ny, nz)
      const need = Math.max(sx, sy) * 0.42
      if (room < 0.05) return
      if (room < need) { sx *= room / need; sy *= room / need }
    }
    let cell = C_RADIAL + Math.floor(r() * 4), reveal = 0.14
    if (kind === "dir") cell = C_DIR + Math.floor(r() * 4)
    else if (kind === "drip") { cell = C_DRIP + Math.floor(r() * 2); reveal = 5 + r() * 4 }
    else { const a = r() * Math.PI * 2; tx = Math.cos(a); ty = Math.sin(a) * 0.7; tz = Math.sin(a) }
    const i = SPLAT0 + this.splatRing.next()
    if (kind === "drip") this.writeDecal(i, x, y, z, nx, ny, nz, 0, 0, 0, sx, sy, cell, this.time + delay, reveal, 0.7, 0.85 + r() * 0.2, true)
    else this.writeDecal(i, x, y, z, nx, ny, nz, tx, ty, tz, sx, sy, cell, this.time + delay, reveal, 0.7, 0.85 + r() * 0.2)
  }

  /** Small spot (droplet impact, slide smear), size = blob diameter. (tx,ty,tz) zero = random rotation; elongated when given. */
  private drop(x: number, y: number, z: number, nx: number, ny: number, nz: number, tx: number, ty: number, tz: number, size: number, delay: number, smear = false): void {
    const i = DROP0 + this.dropRing.next()
    const long = !smear && (tx !== 0 || ty !== 0 || tz !== 0)
    const cell = smear ? C_SMEAR : long ? C_LONG : this.random() < 0.7 ? C_IMPACT : C_CLUSTER
    if (!long && !smear) { const a = this.random() * Math.PI * 2; tx = Math.cos(a); ty = 0.3; tz = Math.sin(a) }
    const sx = smear ? Math.max(0.3, size * 3) / 0.85 : size * (long ? FILL.long : cell === C_IMPACT ? FILL.impact : FILL.cluster)
    const sy = smear ? size / 0.17 : size * (long ? FILL.long * 0.8 : cell === C_IMPACT ? FILL.impact : FILL.cluster)
    this.writeDecal(i, x, y, z, nx, ny, nz, tx, ty, tz, sx, sy, cell, this.time + delay, smear ? 0.2 : 0.12, 0.6, 0.8 + this.random() * 0.25)
  }

  private writeDecal(i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, tx: number, ty: number, tz: number, sx: number, sy: number, cell: number, birth: number, reveal: number, wet: number, shade: number, dripDown = false): void {
    let Xx: number, Xy: number, Xz: number, Yx: number, Yy: number, Yz: number
    if (dripDown) {
      // texture +Y = world up projected onto the surface, so the drips run down
      Yx = -nx * ny; Yy = 1 - ny * ny; Yz = -nz * ny
      const yl = Math.hypot(Yx, Yy, Yz) || 1; Yx /= yl; Yy /= yl; Yz /= yl
      Xx = Yy * nz - Yz * ny; Xy = Yz * nx - Yx * nz; Xz = Yx * ny - Yy * nx
    } else {
      const d = tx * nx + ty * ny + tz * nz
      Xx = tx - nx * d; Xy = ty - ny * d; Xz = tz - nz * d
      let xl = Math.hypot(Xx, Xy, Xz)
      if (xl < 1e-3) { if (Math.abs(ny) < 0.9) { Xx = nz; Xy = 0; Xz = -nx } else { Xx = 1; Xy = 0; Xz = 0 } xl = Math.hypot(Xx, Xy, Xz) }
      Xx /= xl; Xy /= xl; Xz /= xl
      Yx = ny * Xz - nz * Xy; Yy = nz * Xx - nx * Xz; Yz = nx * Xy - ny * Xx
    }
    const off = 0.003 + (this.layer = (this.layer + 1) % 96) * 0.00004
    const m = this.decals.instanceMatrix.array as Float32Array, o = i * 16
    m[o] = Xx * sx; m[o + 1] = Xy * sx; m[o + 2] = Xz * sx; m[o + 3] = 0
    m[o + 4] = Yx * sy; m[o + 5] = Yy * sy; m[o + 6] = Yz * sy; m[o + 7] = 0
    m[o + 8] = nx; m[o + 9] = ny; m[o + 10] = nz; m[o + 11] = 0
    m[o + 12] = x + nx * off; m[o + 13] = y + ny * off; m[o + 14] = z + nz * off; m[o + 15] = 1
    const a = this.dAttr.array as Float32Array
    a[i * 4] = cell; a[i * 4 + 1] = birth; a[i * 4 + 2] = reveal; a[i * 4 + 3] = wet
    const c = this.dColor.array as Float32Array
    c[i * 3] = this.br * shade; c[i * 3 + 1] = this.bg * shade; c[i * 3 + 2] = this.bb * shade
    this.dDirty = true
  }

  // ───────────── particles ─────────────

  private ox = 0; private oy = 0; private oz = 0
  /** Random unit direction around (dx,dy,dz) — written to ox/oy/oz. */
  private cone(dx: number, dy: number, dz: number, spread: number): void {
    const r = this.random
    let x = dx + (r() + r() - 1) * spread, y = dy + (r() + r() - 1) * spread, z = dz + (r() + r() - 1) * spread
    const l = Math.hypot(x, y, z) || 1
    this.ox = x / l; this.oy = y / l; this.oz = z / l
  }
  private rs(s: number): number { return (this.random() * 2 - 1) * s }

  /** kind 0 = droplet, 1 = mist; flags 1 = leaves a spot, 2 = exact box test. */
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, kind: number, alpha: number, drag: number, grav: number, grow: number, flags: number, plane: number, shade: number): void {
    const i = this.pRing.next(), i3 = i * 3, i4 = i * 4
    this.pPos[i3] = x; this.pPos[i3 + 1] = y; this.pPos[i3 + 2] = z
    this.pVel[i3] = vx; this.pVel[i3 + 1] = vy; this.pVel[i3 + 2] = vz
    const hue = 0.75 + this.random() * 0.5
    this.pCol[i4] = this.br * shade; this.pCol[i4 + 1] = this.bg * shade * hue; this.pCol[i4 + 2] = this.bb * shade * hue; this.pCol[i4 + 3] = alpha
    this.pSize[i] = size; this.pBase[i] = size; this.pKind[i] = kind
    this.pLife[i] = life; this.pMax[i] = life; this.pGrow[i] = grow; this.pDrag[i] = drag; this.pGrav[i] = grav; this.pA0[i] = alpha
    this.pFlags[i] = flags; this.pPlane[i] = plane
    this.pDirty = true; this.kindDirty = true
  }

  private addPlane(nx: number, ny: number, nz: number, px: number, py: number, pz: number, box: Obstacle | null): number {
    const i = this.planeRing.next()
    this.planes[i * 4] = nx; this.planes[i * 4 + 1] = ny; this.planes[i * 4 + 2] = nz; this.planes[i * 4 + 3] = nx * px + ny * py + nz * pz
    this.planeBox[i] = box
    return i
  }

  private updateParticles(dt: number): void {
    if (!this.pDirty && this.pAlive === 0) return
    const P = this.pPos, V = this.pVel, C = this.pCol
    let alive = 0
    for (let i = 0; i < MAX_P; i++) {
      if (this.pLife[i] <= 0) continue
      const i3 = i * 3
      if ((this.pLife[i] -= dt) <= 0) { this.kill(i); continue }
      const k = Math.max(0, 1 - this.pDrag[i] * dt)
      V[i3] *= k; V[i3 + 1] = V[i3 + 1] * k - this.pGrav[i] * dt; V[i3 + 2] *= k
      const ox = P[i3], oy = P[i3 + 1], oz = P[i3 + 2]
      const x = ox + V[i3] * dt, y = oy + V[i3 + 1] * dt, z = oz + V[i3 + 2] * dt
      P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z
      const t = 1 - this.pLife[i] / this.pMax[i]
      if (this.pKind[i] < 0.5) {
        // droplets: floor, kill plane (wall behind the burst), exact box test for spot-leaving ones
        if (y <= FLOOR_Y + 0.002) {
          const f = (oy - FLOOR_Y) / Math.max(1e-6, oy - y)
          this.impact(i, ox + (x - ox) * f, FLOOR_Y, oz + (z - oz) * f, 0, 1, 0)
          continue
        }
        const pl = this.pPlane[i]
        if (pl >= 0) {
          const nx = this.planes[pl * 4], ny = this.planes[pl * 4 + 1], nz = this.planes[pl * 4 + 2], dd = nx * x + ny * y + nz * z - this.planes[pl * 4 + 3]
          if (dd < 0) {
            const b = this.planeBox[pl]
            const hx = x - nx * dd, hy = y - ny * dd, hz = z - nz * dd
            if (!b || (hx >= b.minX - 0.05 && hx <= b.maxX + 0.05 && hz >= b.minZ - 0.05 && hz <= b.maxZ + 0.05 && hy >= (b.minY ?? 0) - 0.05 && hy <= b.height + 0.05)) { this.impact(i, hx, hy, hz, nx, ny, nz); continue }
            this.pPlane[i] = -1
          }
        }
        if (this.pFlags[i] & 2 && this.segment(ox, oy, oz, x, y, z)) {
          this.impact(i, ox + (x - ox) * this.hitT, oy + (y - oy) * this.hitT, oz + (z - oz) * this.hitT, this.hnx, this.hny, this.hnz)
          continue
        }
        C[i * 4 + 3] = this.pA0[i] * (t < 0.8 ? 1 : (1 - t) * 5)
      } else {
        if (y < FLOOR_Y + 0.05) { P[i3 + 1] = FLOOR_Y + 0.05; V[i3 + 1] = 0 }
        this.pSize[i] = this.pBase[i] * (1 + this.pGrow[i] * Math.sqrt(t))
        C[i * 4 + 3] = this.pA0[i] * (1 - t) * (1 - t * 0.5)
      }
      alive++
    }
    this.pAlive = alive
    const at = this.pGeo.attributes
    ;(at.position as THREE.BufferAttribute).needsUpdate = true
    ;(at.aVel as THREE.BufferAttribute).needsUpdate = true
    ;(at.aColor as THREE.BufferAttribute).needsUpdate = true
    ;(at.aSize as THREE.BufferAttribute).needsUpdate = true
    if (this.kindDirty) { (at.aKind as THREE.BufferAttribute).needsUpdate = true; this.kindDirty = false }
    this.pDirty = alive > 0
  }

  private kill(i: number): void { this.pLife[i] = 0; this.pCol[i * 4 + 3] = 0; this.pPos[i * 3 + 1] = -1000 }

  /** A droplet hits a surface: dies, and spot-leaving ones paint a small drop decal. */
  private impact(i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    if (this.pFlags[i] & 1 && this.dropsThisFrame < 40) {
      this.dropsThisFrame++
      const i3 = i * 3, vx = this.pVel[i3], vy = this.pVel[i3 + 1], vz = this.pVel[i3 + 2]
      const sp = Math.hypot(vx, vy, vz), along = sp > 0.1 ? 1 - Math.abs(vx * nx + vy * ny + vz * nz) / sp : 0
      const s = Math.min(0.08, Math.max(0.015, this.pBase[i] * (2.2 + sp * 0.25)))
      const br = this.br, bg = this.bg, bb = this.bb
      this.br = this.pCol[i * 4]; this.bg = this.pCol[i * 4 + 1]; this.bb = this.pCol[i * 4 + 2]
      if (along > 0.55) this.drop(x, y, z, nx, ny, nz, vx, vy, vz, s, 0)
      else this.drop(x, y, z, nx, ny, nz, 0, 0, 0, s, 0)
      this.br = br; this.bg = bg; this.bb = bb
    }
    this.kill(i)
  }

  // ───────────── emitters (stumps, arterial spurts) ─────────────

  private addEmitter(parent: THREE.Object3D | null, lx: number, ly: number, lz: number, dx: number, dy: number, dz: number, dur: number, rate: number, strength: number, spread: number): void {
    let e = this.emitters[0]
    for (const c of this.emitters) { if (!c.active) { e = c; break } if (c.age / c.dur > e.age / e.dur) e = c }
    const l = Math.hypot(dx, dy, dz) || 1
    Object.assign(e, { active: true, parent, lx, ly, lz, dx: dx / l, dy: dy / l, dz: dz / l, age: 0, dur, acc: 0, rate, bpm: 110 + this.random() * 50, strength, spread, r: this.br, g: this.bg, b: this.bb })
  }

  private updateEmitters(dt: number): void {
    for (const e of this.emitters) {
      if (!e.active) continue
      e.age += dt
      if (e.age >= e.dur) { e.active = false; e.parent = null; continue }
      let x = e.lx, y = e.ly, z = e.lz, dx = e.dx, dy = e.dy, dz = e.dz
      if (e.parent) {
        const m = e.parent.matrixWorld.elements
        x = m[0] * e.lx + m[4] * e.ly + m[8] * e.lz + m[12]; y = m[1] * e.lx + m[5] * e.ly + m[9] * e.lz + m[13]; z = m[2] * e.lx + m[6] * e.ly + m[10] * e.lz + m[14]
        dx = m[0] * e.dx + m[4] * e.dy + m[8] * e.dz; dy = m[1] * e.dx + m[5] * e.dy + m[9] * e.dz; dz = m[2] * e.dx + m[6] * e.dy + m[10] * e.dz
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l
      }
      const fall = Math.pow(1 - e.age / e.dur, 1.3), beat = heartbeat(e.age, e.bpm)
      const pressure = (0.15 + beat) * fall * e.strength
      e.acc += dt * e.rate * pressure
      this.br = e.r; this.bg = e.g; this.bb = e.b
      while (e.acc >= 1) {
        e.acc -= 1
        const big = this.random() < 0.25
        this.cone(dx, dy, dz, e.spread * (big ? 0.6 : 1))
        const sp = (0.8 + 4.4 * beat * fall) * (0.8 + this.random() * 0.4) * Math.min(1.2, 0.6 + e.strength * 0.5)
        this.emit(x, y, z, this.ox * sp, this.oy * sp, this.oz * sp, big ? 0.022 + this.random() * 0.022 : 0.009 + this.random() * 0.012, 1.6, 0, 1, 0.25, GRAV, 0, big ? 3 : this.random() < 0.06 ? 3 : 0, -1, 0.65 + this.random() * 0.5)
      }
      if (beat > 0.75 && this.random() < dt * 14 * fall) {
        this.cone(dx, dy, dz, 0.4)
        this.emit(x, y, z, this.ox * 0.8, this.oy * 0.8, this.oz * 0.8, 0.08 + this.random() * 0.08, 0.5, 1, 0.22, 3, 0.3, 2, 0, -1, 1.2)
      }
    }
  }

  // ───────────── gibs ─────────────

  private addGib(obj: THREE.Object3D, r: number, ax: number, ay: number, az: number): Gib | null {
    // soft cap: start sinking the oldest; hard cap: drop the oldest immediately
    let free: Gib | null = null, live = 0
    for (const g of this.gibs) { if (!g.obj) { free ??= g } else live++ }
    if (live >= GORE_BUDGET.gibs - 8) {
      let oldest: Gib | null = null
      for (const g of this.gibs) if (g.obj && g.dying < 0 && (!oldest || g.born < oldest.born)) oldest = g
      if (oldest) oldest.dying = 0
    }
    if (!free) {
      let oldest: Gib | null = null
      for (const g of this.gibs) if (g.obj && (!oldest || (g.dying >= 0) > (oldest.dying >= 0) || ((g.dying >= 0) === (oldest.dying >= 0) && g.born < oldest.born))) oldest = g
      if (!oldest) return null
      this.releaseGib(oldest)
      free = oldest
    }
    const g = free, b = g.body
    b.reset(); b.shape(r, ax, ay, az)
    b.px = obj.position.x; b.py = obj.position.y; b.pz = obj.position.z
    b.qx = obj.quaternion.x; b.qy = obj.quaternion.y; b.qz = obj.quaternion.z; b.qw = obj.quaternion.w
    if (b.py < FLOOR_Y + r) b.py = FLOOR_Y + r
    g.obj = obj; g.born = this.time; g.bleed = 0; g.bleedAcc = 0; g.jx = g.jy = g.jz = 0; g.dying = -1; g.landed = false; g.slide = 0; g.lx = b.px; g.lz = b.pz
    g.r = this.br; g.g = this.bg; g.b = this.bb
    obj.traverse(o => { o.matrixAutoUpdate = o === obj; if (o !== obj) o.updateMatrix() })
    this.root.add(obj)
    return g
  }

  private releaseGib(g: Gib): void {
    if (!g.obj) return
    g.obj.removeFromParent(); g.obj = null; g.dying = -1
  }

  /** Procedural chunk gib (material null = shared vertex-coloured gore material). */
  private chunk(kind: ChunkKind, mat: THREE.Material | null, x: number, y: number, z: number, size: number, vx: number, vy: number, vz: number, spinMin: number, spinMax: number, bleed: number): Gib | null {
    const list = this.chunks[kind], geo = list[Math.floor(this.random() * list.length)], sh = this.shapes.get(geo)!
    const mesh = new THREE.Mesh(geo, mat ?? this.chunkMat)
    mesh.position.set(x, y, z); mesh.scale.setScalar(size)
    mesh.quaternion.setFromEuler(_e.set(this.random() * 6.3, this.random() * 6.3, this.random() * 6.3))
    const g = this.addGib(mesh, sh.r * size, sh.ax * size, sh.ay * size, sh.az * size)
    if (!g) return null
    const b = g.body
    b.vx = vx; b.vy = vy; b.vz = vz
    this.spin(b, spinMin, spinMax)
    g.bleed = bleed * (0.5 + this.random())
    return g
  }

  private spin(b: GibBody, min: number, max: number): void {
    this.cone(0, 1, 0, 2)
    const s = min + this.random() * (max - min)
    b.wx = this.ox * s; b.wy = this.oy * s; b.wz = this.oz * s
  }

  /** Blast velocity away from center (gib()). */
  private launch(g: Gib | null, center: Vec3, f: number): void {
    if (!g) return
    const b = g.body
    let dx = b.px - center.x, dy = b.py - center.y, dz = b.pz - center.z
    const d = Math.hypot(dx, dy, dz)
    if (d < 0.05) { this.cone(0, 1, 0, 1.2); dx = this.ox; dy = this.oy; dz = this.oz } else { dx /= d; dy /= d; dz /= d }
    dy += 0.45
    const l = Math.hypot(dx, dy, dz)
    this.cone(dx / l, dy / l, dz / l, 0.35)
    const sp = f * (0.5 + this.random() * 0.65) * Math.max(0.5, Math.min(1.35, 1.4 / (0.6 + d)))
    b.vx = this.ox * sp; b.vy = this.oy * sp; b.vz = this.oz * sp
    this.spin(b, 6, 22)
  }

  private updateGibs(dt: number): void {
    for (const g of this.gibs) {
      const obj = g.obj
      if (!obj) continue
      if (g.dying >= 0) {
        g.dying += dt
        obj.position.y -= dt * 0.3
        if (!obj.matrixAutoUpdate) obj.updateMatrix()
        if (g.dying > 1.4) this.releaseGib(g)
        continue
      }
      const b = g.body
      if (b.sleeping) continue
      const reach = b.half + b.r + Math.hypot(b.vx, b.vy, b.vz) * dt + 0.2
      stepGib(b, dt, this.collision.query(b.px - reach, b.pz - reach, b.px + reach, b.pz + reach), FLOOR_Y)
      obj.position.set(b.px, b.py, b.pz); obj.quaternion.set(b.qx, b.qy, b.qz, b.qw)
      this.br = g.r; this.bg = g.g; this.bb = g.b
      // landing splat, slide smears
      if (b.impact > 1.4 && (!g.landed || b.impact > 3.5)) {
        g.landed = true
        const s = Math.min(0.3, 0.05 + b.r * 1.6 + b.half * 0.8) * (0.8 + b.impact * 0.05) * FILL.radial
        const i = SPLAT0 + this.splatRing.next()
        const a = this.random() * 6.283
        this.writeDecal(i, b.cx, b.cy, b.cz, b.nx, b.ny, b.nz, Math.cos(a), 0, Math.sin(a), s, s, C_RADIAL + Math.floor(this.random() * 4), this.time, 0.12, 0.7, 0.85)
        for (let k = 0; k < 8; k++) { this.cone(b.nx, b.ny, b.nz, 0.9); const sp = 0.5 + this.random() * 1.6; this.emit(b.cx, b.cy + 0.01, b.cz, this.ox * sp, this.oy * sp, this.oz * sp, 0.005 + this.random() * 0.008, 0.8, 0, 0.9, 0.5, GRAV, 0, 0, -1, 0.9) }
      }
      if (b.contact && b.ny > 0.7) {
        const sl = Math.hypot(b.px - g.lx, b.pz - g.lz)
        if (Math.hypot(b.vx, b.vz) > 0.8 && (g.slide += sl) > 0.3) { g.slide = 0; this.drop(b.cx, b.cy, b.cz, b.nx, b.ny, b.nz, b.vx, 0, b.vz, Math.max(0.05, b.r * 1.6), 0, true) }
      }
      g.lx = b.px; g.lz = b.pz
      // blood trail from the cut end
      if (g.bleed > 0) {
        g.bleed -= dt
        g.bleedAcc += dt * (b.contact ? 18 : 55)
        while (g.bleedAcc >= 1) {
          g.bleedAcc -= 1
          // world position of the bleeding point = p + q * j
          const { qx, qy, qz, qw } = b, jx = g.jx, jy = g.jy, jz = g.jz
          const tx = 2 * (qy * jz - qz * jy), ty = 2 * (qz * jx - qx * jz), tz = 2 * (qx * jy - qy * jx)
          const wx = b.px + jx + qw * tx + (qy * tz - qz * ty), wy = b.py + jy + qw * ty + (qz * tx - qx * tz), wz = b.pz + jz + qw * tz + (qx * ty - qy * tx)
          this.emit(wx, wy, wz, b.vx * 0.3 + this.rs(0.5), b.vy * 0.3 + this.random() * 0.5, b.vz * 0.3 + this.rs(0.5), 0.006 + this.random() * 0.014, 1.4, 0, 0.92, 0.6, GRAV, 0, this.random() < 0.3 ? 3 : 0, -1, 0.7 + this.random() * 0.4)
        }
      }
      if (b.sleeping) { obj.updateMatrix(); obj.matrixAutoUpdate = false; g.bleed = 0 }
    }
  }

  // ───────────── caps ─────────────

  private addCap(parent: THREE.Object3D, x: number, y: number, z: number, nx: number, ny: number, nz: number, radius: number): void {
    const i = this.capRing.next()
    this.caps[i]?.removeFromParent()
    const cap = new THREE.Mesh(this.capGeo, this.capMat)
    cap.position.set(x, y, z)
    cap.quaternion.setFromUnitVectors(_zAxis, _v.set(nx, ny, nz).normalize())
    cap.scale.setScalar(Math.max(0.02, radius))
    parent.add(cap)
    this.caps[i] = cap
  }

  // ───────────── helpers ─────────────

  private setBlood(hex = DEFAULT_BLOOD): void { _col.setHex(hex); this.br = _col.r; this.bg = _col.g; this.bb = _col.b }

  /** Notifies the screen overlay when gore happens within 3 m of the camera. */
  private splash(x: number, y: number, z: number, violence: number): void {
    if (!this.onScreenSplatter || !this.camKnown) return
    const d = Math.hypot(x - this.camX, y - this.camY, z - this.camZ)
    if (d >= 3) return
    const k = this.level === "brutal" ? 1 : 0.6
    this.onScreenSplatter(Math.min(1, violence * k * Math.pow(1 - d / 3, 0.7)))
  }

  private partInfoOut: PartInfo = { cx: 0, cy: 0, cz: 0, ax: 0, ay: 1, az: 0, half: 0.2, radius: 0.08 }
  /** Part-local bounds: centre, unit long axis (pointing away from the joint), half length, cross-section radius. */
  private partInfo(part: THREE.Object3D): PartInfo {
    const out = this.partInfoOut
    _inv.copy(part.matrixWorld).invert()
    _box.makeEmpty()
    part.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      _box2.copy(mesh.geometry.boundingBox!).applyMatrix4(_m.multiplyMatrices(_inv, mesh.matrixWorld))
      _box.union(_box2)
    })
    if (_box.isEmpty()) { Object.assign(out, { cx: 0, cy: 0.1, cz: 0, ax: 0, ay: 1, az: 0, half: 0.1, radius: 0.08 }); return out }
    _box.getCenter(_v); _box.getSize(_v2)
    out.cx = _v.x; out.cy = _v.y; out.cz = _v.z
    const m = Math.max(_v2.x, _v2.y, _v2.z)
    out.ax = out.ay = out.az = 0
    if (m === _v2.y) out.ay = _v.y < 0 ? -1 : 1
    else if (m === _v2.x) out.ax = _v.x < 0 ? -1 : 1
    else out.az = _v.z < 0 ? -1 : 1
    out.half = m / 2
    out.radius = Math.max(0.025, (_v2.x + _v2.y + _v2.z - m) / 4)
    return out
  }

  /** Nearest box along the ray (non-allocating): sets hitT, hnx/hny/hnz, hitBox. */
  private raycast(x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number): boolean {
    const list = this.collision.query(Math.min(x, x + dx * max), Math.min(z, z + dz * max), Math.max(x, x + dx * max), Math.max(z, z + dz * max))
    _o.x = x; _o.y = y; _o.z = z; _d.x = dx; _d.y = dy; _d.z = dz
    let best = max, box: Obstacle | null = null
    for (const o of list) {
      const t = rayBox(_o, _d, o.minX, o.minY ?? 0, o.minZ, o.maxX, o.height, o.maxZ, best)
      if (t !== null && t > 0.02 && t < best) { best = t; box = o }
    }
    if (!box) return false
    this.hitT = best; this.hitBox = box
    this.boxNormal(x + dx * best, y + dy * best, z + dz * best, box)
    return true
  }

  /** Outward normal of the box face nearest to (x, y, z) → hnx/hny/hnz. */
  private boxNormal(x: number, y: number, z: number, o: Obstacle): void {
    let best = Math.abs(x - o.minX), d = 0
    this.hnx = -1; this.hny = 0; this.hnz = 0
    if ((d = Math.abs(x - o.maxX)) < best) { best = d; this.hnx = 1; this.hny = 0; this.hnz = 0 }
    if ((d = Math.abs(y - (o.minY ?? 0))) < best) { best = d; this.hnx = 0; this.hny = -1; this.hnz = 0 }
    if ((d = Math.abs(y - o.height)) < best) { best = d; this.hnx = 0; this.hny = 1; this.hnz = 0 }
    if ((d = Math.abs(z - o.minZ)) < best) { best = d; this.hnx = 0; this.hny = 0; this.hnz = -1 }
    if ((d = Math.abs(z - o.maxZ)) < best) { this.hnx = 0; this.hny = 0; this.hnz = 1 }
  }

  /** Segment a→b against boxes; hitT is the fraction along the segment. */
  private segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz)
    if (l < 1e-6) return false
    if (!this.raycast(ax, ay, az, dx / l, dy / l, dz / l, l)) return false
    this.hitT /= l
    return true
  }

  /** Height of the surface under (x, z) seen from height y: a box top (hitBox = that box) or the floor (hitBox = null). */
  private surfaceBelow(x: number, y: number, z: number): number {
    const list = this.collision.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01)
    let top = FLOOR_Y, box: Obstacle | null = null
    for (const o of list) if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && o.height <= y + 0.05 && o.height > top) { top = o.height; box = o }
    this.hitBox = box
    return top
  }

  private refreshLight(): void {
    this.la = 0; this.lr = 0; this.lg = 0; this.lb = 0; this.lights = 0
    this.scene.traverseVisible(this.visitLight)
    if (this.lights === 0) { this.light.set(1, 1, 1); return }
    const k = 1 / Math.PI
    this.light.set(Math.max(0.05, this.lr * k), Math.max(0.05, this.lg * k), Math.max(0.05, this.lb * k))
  }
  private visitLight = (o: THREE.Object3D): void => {
    const l = o as THREE.Light
    if (!l.isLight) return
    const h = o as THREE.HemisphereLight
    let w = 0
    if (h.isHemisphereLight) { w = l.intensity; this.lr += (h.color.r * 0.6 + h.groundColor.r * 0.4) * w; this.lg += (h.color.g * 0.6 + h.groundColor.g * 0.4) * w; this.lb += (h.color.b * 0.6 + h.groundColor.b * 0.4) * w; this.lights++; return }
    if ((o as THREE.AmbientLight).isAmbientLight) w = l.intensity
    else if ((o as THREE.DirectionalLight).isDirectionalLight) w = l.intensity * 0.8
    else return
    this.lr += l.color.r * w; this.lg += l.color.g * w; this.lb += l.color.b * w; this.lights++
  }

  private beforeParticles = (renderer: THREE.WebGLRenderer): void => {
    const rt = renderer.getRenderTarget()
    if (rt) _vp.set(rt.width, rt.height); else renderer.getDrawingBufferSize(_vp)
    ;(this.pMat.uniforms.uViewport.value as THREE.Vector2).copy(_vp)
  }

  private patchDecalShader = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.uniforms.uTime = this.uTime
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aDecal;\nvarying vec4 vDecal;\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  // pools (wet = 1) also scale up while they spread
  if (aDecal.w > 0.95) transformed.xy *= mix(0.55, 1.0, sqrt(clamp((uTime - aDecal.y) / max(aDecal.z, 0.01), 0.0, 1.0)));`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>
  vec2 gCell = (vec2(mod(aDecal.x, 4.0), floor(aDecal.x / 4.0)) + uv) * 0.25;
  #ifdef USE_MAP
  vMapUv = gCell;
  #endif
  #ifdef USE_BUMPMAP
  vBumpMapUv = gCell;
  #endif
  vDecal = aDecal;`)
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec4 vDecal;")
      .replace("#include <map_fragment>", `
  vec4 gTex = texture2D(map, vMapUv);
  float gAge = uTime - vDecal.y;
  float gRev = vDecal.z > 0.0 ? gAge / vDecal.z : 2.0;
  float gVis = gAge < 0.0 ? 0.0 : clamp((gRev - gTex.g) * 22.0, 0.0, 1.0);
  float gTh = gTex.r;
  float gDry = clamp(gAge / 60.0, 0.0, 1.0) * (1.0 - vDecal.w * 0.5);
  diffuseColor.rgb *= mix(1.9, 0.55, gTh) * mix(1.0, 0.6, gDry) * (0.88 + 0.24 * gTex.b);
  diffuseColor.a *= gTex.a * gVis * mix(0.55, 1.0, smoothstep(0.0, 0.45, gTh));
  if (diffuseColor.a < 0.004) discard;`)
      .replace("#include <roughnessmap_fragment>", `float roughnessFactor = clamp(mix(0.12, 0.6, gDry) + (1.0 - gTh) * 0.22 - vDecal.w * 0.08 + gTex.b * 0.08, 0.05, 1.0);`)
  }
}

// ───────────────────────────── module helpers ─────────────────────────────

/** Distance from (x,y,z) to the nearest edge of the box face with normal n (Infinity on the open floor). */
export function faceRoom(o: Obstacle, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const minY = o.minY ?? 0
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
  if (ax >= ay && ax >= az) return Math.min(y - minY, o.height - y, z - o.minZ, o.maxZ - z)
  if (ay >= az) return Math.min(x - o.minX, o.maxX - x, z - o.minZ, o.maxZ - z)
  return Math.min(x - o.minX, o.maxX - x, y - minY, o.height - y)
}

function collectMeshes(o: THREE.Object3D, out: THREE.Mesh[]): void {
  if (!o.visible) return
  if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  for (const c of o.children) collectMeshes(c, out)
}

/** Removes lights/cameras from a cloned part (a cloned light would recompile every lit material). */
function stripLights(o: THREE.Object3D): void {
  for (let i = o.children.length - 1; i >= 0; i--) {
    const c = o.children[i]
    if ((c as THREE.Light).isLight || (c as THREE.Camera).isCamera) o.remove(c)
    else stripLights(c)
  }
}
