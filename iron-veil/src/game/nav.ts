/**
 * nav.ts — navigation grid + A* path finding for enemies. Pure logic (no three.js), unit-tested.
 * The grid covers the map bounds with square cells; a cell is blocked when a circle of agentRadius at its centre would
 * overlap an obstacle. Paths are smoothed with grid line-of-sight ("string pulling") so agents walk straight lines.
 */
import { collides, type Obstacle } from "./collision"
import type { Vec2 } from "./types"

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
]

export class NavGrid {
  readonly cols: number
  readonly rows: number
  readonly blocked: Uint8Array
  private g: Float32Array
  private f: Float32Array
  private parent: Int32Array
  private stamp: Uint32Array
  private closed: Uint32Array
  private search = 0
  private heap: Int32Array
  private heapSize = 0

  constructor(readonly bounds: Bounds, obstacles: readonly Obstacle[], readonly agentRadius = 0.45, readonly cell = 1) {
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell))
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell))
    const n = this.cols * this.rows
    this.blocked = new Uint8Array(n)
    this.g = new Float32Array(n); this.f = new Float32Array(n); this.parent = new Int32Array(n)
    this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.heap = new Int32Array(n)
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const x = bounds.minX + (c + 0.5) * cell, z = bounds.minZ + (r + 0.5) * cell
      this.blocked[r * this.cols + c] = collides(x, z, agentRadius, obstacles) ? 1 : 0
    }
  }

  colOf(x: number): number { return Math.floor((x - this.bounds.minX) / this.cell) }
  rowOf(z: number): number { return Math.floor((z - this.bounds.minZ) / this.cell) }
  centerX(c: number): number { return this.bounds.minX + (c + 0.5) * this.cell }
  centerZ(r: number): number { return this.bounds.minZ + (r + 0.5) * this.cell }
  private inside(c: number, r: number): boolean { return c >= 0 && r >= 0 && c < this.cols && r < this.rows }
  private open(c: number, r: number): boolean { return this.inside(c, r) && this.blocked[r * this.cols + c] === 0 }

  walkable(x: number, z: number): boolean { return this.open(this.colOf(x), this.rowOf(z)) }

  /** Nearest walkable cell centre within maxRadius metres (spiral search), or null. */
  nearestWalkable(x: number, z: number, maxRadius = 6): Vec2 | null {
    const c0 = this.colOf(x), r0 = this.rowOf(z)
    if (this.open(c0, r0)) return { x: this.centerX(c0), z: this.centerZ(r0) }
    const maxRing = Math.ceil(maxRadius / this.cell)
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: Vec2 | null = null, bestD = Infinity
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
        const c = c0 + dc, r = r0 + dr
        if (!this.open(c, r)) continue
        const px = this.centerX(c), pz = this.centerZ(r), d = (px - x) ** 2 + (pz - z) ** 2
        if (d < bestD) { bestD = d; best = { x: px, z: pz } }
      }
      if (best) return best
    }
    return null
  }

  /** Random walkable point within radius of (x, z); tries a few times, falls back to nearestWalkable. */
  randomPointNear(x: number, z: number, radius: number, rng: () => number): Vec2 | null {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
      if (this.walkable(px, pz)) return { x: px, z: pz }
    }
    return this.nearestWalkable(x, z, radius)
  }

  /** True when every cell along the straight line a→b is walkable (sampled at quarter cells). */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az
    const steps = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.25))
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      if (!this.walkable(ax + dx * t, az + dz * t)) return false
    }
    return true
  }

  /**
   * A* from (fx, fz) to (tx, tz). Start/goal snap to the nearest walkable cell. Returns smoothed waypoints
   * (excluding the start, ending at the goal) or null when unreachable or maxNodes is exceeded.
   */
  findPath(fx: number, fz: number, tx: number, tz: number, maxNodes = 6000): Vec2[] | null {
    const s = this.nearestWalkable(fx, fz, 4), t = this.nearestWalkable(tx, tz, 6)
    if (!s || !t) return null
    const sc = this.colOf(s.x), sr = this.rowOf(s.z), tc = this.colOf(t.x), tr = this.rowOf(t.z)
    const start = sr * this.cols + sc, goal = tr * this.cols + tc
    if (start === goal) return [{ x: t.x, z: t.z }]
    const id = ++this.search
    if (id === 0xffffffff) { this.stamp.fill(0); this.closed.fill(0); this.search = 1 }
    const sid = this.search
    this.heapSize = 0
    this.stamp[start] = sid; this.g[start] = 0; this.f[start] = this.h(sc, sr, tc, tr); this.parent[start] = -1
    this.push(start)
    let expanded = 0
    while (this.heapSize > 0) {
      const cur = this.pop()
      if (this.closed[cur] === sid) continue
      this.closed[cur] = sid
      if (cur === goal) return this.smooth(this.reconstruct(goal), fx, fz, t)
      if (++expanded > maxNodes) return null
      const cc = cur % this.cols, cr = (cur - cc) / this.cols
      for (const [dc, dr, cost] of DIRS) {
        const nc = cc + dc, nr = cr + dr
        if (!this.open(nc, nr)) continue
        // no corner cutting through blocked diagonals
        if (dc !== 0 && dr !== 0 && (!this.open(cc + dc, cr) || !this.open(cc, cr + dr))) continue
        const n = nr * this.cols + nc
        if (this.closed[n] === sid) continue
        const ng = this.g[cur] + cost * this.cell
        if (this.stamp[n] !== sid || ng < this.g[n]) {
          this.stamp[n] = sid; this.g[n] = ng; this.parent[n] = cur
          this.f[n] = ng + this.h(nc, nr, tc, tr)
          this.push(n)
        }
      }
    }
    return null
  }

  reachable(fx: number, fz: number, tx: number, tz: number): boolean { return this.findPath(fx, fz, tx, tz, this.cols * this.rows) !== null }

  private h(c: number, r: number, tc: number, tr: number): number {
    const dx = Math.abs(c - tc), dr = Math.abs(r - tr)
    return (Math.max(dx, dr) + (Math.SQRT2 - 1) * Math.min(dx, dr)) * this.cell
  }

  private reconstruct(goal: number): Vec2[] {
    const out: Vec2[] = []
    for (let n = goal; n !== -1; n = this.parent[n]) {
      const c = n % this.cols, r = (n - c) / this.cols
      out.push({ x: this.centerX(c), z: this.centerZ(r) })
      if (out.length > this.cols * this.rows) break
    }
    return out.reverse()
  }

  private smooth(cells: Vec2[], fx: number, fz: number, goal: Vec2): Vec2[] {
    const out: Vec2[] = []
    let ax = fx, az = fz
    if (!this.walkable(ax, az) && cells.length) { ax = cells[0].x; az = cells[0].z }
    let i = 0
    while (i < cells.length) {
      let j = cells.length - 1
      while (j > i && !this.lineWalkable(ax, az, cells[j].x, cells[j].z)) j--
      out.push(cells[j]); ax = cells[j].x; az = cells[j].z; i = j + 1
    }
    if (out.length) out[out.length - 1] = { x: goal.x, z: goal.z }
    return out
  }

  private push(n: number): void {
    if (this.heapSize >= this.heap.length) { const grown = new Int32Array(this.heap.length * 2); grown.set(this.heap); this.heap = grown }
    const heap = this.heap, f = this.f
    let i = this.heapSize++
    heap[i] = n
    while (i > 0) {
      const p = (i - 1) >> 1
      if (f[heap[p]] <= f[n]) break
      heap[i] = heap[p]; i = p
    }
    heap[i] = n
  }

  private pop(): number {
    const heap = this.heap, f = this.f
    const top = heap[0], last = heap[--this.heapSize]
    let i = 0
    const size = this.heapSize
    while (true) {
      let l = i * 2 + 1
      if (l >= size) break
      const r = l + 1
      if (r < size && f[heap[r]] < f[heap[l]]) l = r
      if (f[heap[l]] >= f[last]) break
      heap[i] = heap[l]; i = l
    }
    heap[i] = last
    return top
  }
}
