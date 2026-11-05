// Grid navigation for enemies: 0.5 m cells, A* with a binary heap and line-of-sight path smoothing.
// A cell is blocked when a 0.38 m circle at its centre touches a collider, so doorways (1.3 m) stay open
// while every wall, however thin, blocks the cells next to it. Search arrays are allocated once and
// stamped per search, so path finding does not allocate.

import type { CollisionWorld } from "./collision"
import type { Terrain } from "./terrain"

export class NavGrid {
  readonly cell = 0.5
  readonly n: number
  readonly blocked: Uint8Array
  private origin: number
  private pathsThisFrame = 0
  budgetPerFrame = 3
  private g: Float32Array
  private came: Int32Array
  private stamp: Int32Array
  private closedStamp: Int32Array
  private gen = 0
  private heap = new Heap()

  constructor(size: number, collision: CollisionWorld, terrain: Terrain | null, extraBlocked?: (x: number, z: number) => boolean) {
    this.n = Math.ceil((size * 2) / this.cell)
    this.origin = -size
    this.blocked = new Uint8Array(this.n * this.n)
    this.g = new Float32Array(this.n * this.n)
    this.came = new Int32Array(this.n * this.n)
    this.stamp = new Int32Array(this.n * this.n)
    this.closedStamp = new Int32Array(this.n * this.n)
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = this.origin + (i + 0.5) * this.cell
        const z = this.origin + (j + 0.5) * this.cell
        const y = terrain ? terrain.heightAt(x, z) : 0
        let b = collision.resolveCircle(x, z, 0.38, y + 0.1, 1.5).hit
        if (!b && terrain) {
          if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.55) b = true
          if (Math.max(Math.abs(x), Math.abs(z)) > size * 0.94) b = true
        }
        if (!b && extraBlocked && extraBlocked(x, z)) b = true
        this.blocked[j * this.n + i] = b ? 1 : 0
      }
    }
  }

  toCell(x: number, z: number): [number, number] {
    return [Math.min(this.n - 1, Math.max(0, Math.floor((x - this.origin) / this.cell))), Math.min(this.n - 1, Math.max(0, Math.floor((z - this.origin) / this.cell)))]
  }

  toWorld(i: number, j: number): [number, number] {
    return [this.origin + (i + 0.5) * this.cell, this.origin + (j + 0.5) * this.cell]
  }

  isBlocked(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return true
    return this.blocked[j * this.n + i] === 1
  }

  isBlockedWorld(x: number, z: number): boolean {
    const [i, j] = this.toCell(x, z)
    return this.isBlocked(i, j)
  }

  /** Nearest free cell to a world position (spiral search). */
  nearestFree(x: number, z: number, maxR = 10): [number, number] | null {
    const [ci, cj] = this.toCell(x, z)
    if (!this.isBlocked(ci, cj)) return [ci, cj]
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          if (!this.isBlocked(ci + di, cj + dj)) return [ci + di, cj + dj]
        }
      }
    }
    return null
  }

  /** Cells reachable from a world position (same neighbour rules as the path search), as a per-cell mask. */
  reachableMask(x: number, z: number): Uint8Array {
    const n = this.n
    const mask = new Uint8Array(n * n)
    const start = this.nearestFree(x, z)
    if (!start) return mask
    const queue = new Int32Array(n * n)
    let head = 0
    let tail = 0
    const sIdx = start[1] * n + start[0]
    mask[sIdx] = 1
    queue[tail++] = sIdx
    while (head < tail) {
      const cur = queue[head++]
      const ci = cur % n
      const cj = (cur - ci) / n
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= n || nj >= n || this.isBlocked(ni, nj)) continue
          if (di !== 0 && dj !== 0 && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj))) continue
          const nIdx = nj * n + ni
          if (mask[nIdx]) continue
          mask[nIdx] = 1
          queue[tail++] = nIdx
        }
      }
    }
    return mask
  }

  /** Whether the walkable cell nearest to a world position lies inside a reachable mask (and within maxDist metres). */
  isReachable(mask: Uint8Array, x: number, z: number, maxDist = 2.0): boolean {
    const cell = this.nearestFree(x, z)
    if (!cell) return false
    const w = this.toWorld(cell[0], cell[1])
    if (Math.hypot(w[0] - x, w[1] - z) > maxDist) return false
    return mask[cell[1] * this.n + cell[0]] === 1
  }

  newFrame(): void {
    this.pathsThisFrame = 0
  }

  get budgetLeft(): boolean {
    return this.pathsThisFrame < this.budgetPerFrame
  }

  /** Grid line of sight (Bresenham). */
  lineFree(i0: number, j0: number, i1: number, j1: number): boolean {
    let dx = Math.abs(i1 - i0)
    let dz = Math.abs(j1 - j0)
    const sx = i0 < i1 ? 1 : -1
    const sz = j0 < j1 ? 1 : -1
    let err = dx - dz
    let i = i0
    let j = j0
    for (let k = 0; k < 10000; k++) {
      if (this.isBlocked(i, j)) return false
      if (i === i1 && j === j1) return true
      const e2 = 2 * err
      if (e2 > -dz) {
        err -= dz
        i += sx
      }
      if (e2 < dx) {
        err += dx
        j += sz
      }
    }
    return false
  }

  /** A* path from (sx,sz) to (tx,tz) in world units; returns waypoints (excluding the start). */
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes = 60000): [number, number][] | null {
    this.pathsThisFrame++
    const start = this.nearestFree(sx, sz)
    const goal = this.nearestFree(tx, tz)
    if (!start || !goal) return null
    const n = this.n
    const sIdx = start[1] * n + start[0]
    const gIdx = goal[1] * n + goal[0]
    if (sIdx === gIdx) return [[tx, tz]]
    const gen = ++this.gen
    const g = this.g
    const came = this.came
    const stamp = this.stamp
    const closed = this.closedStamp
    const heap = this.heap
    heap.clear()
    g[sIdx] = 0
    stamp[sIdx] = gen
    came[sIdx] = -1
    heap.push(sIdx, this.h(start[0], start[1], goal[0], goal[1]))
    let expanded = 0
    const gi = goal[0]
    const gj = goal[1]
    let found = false
    while (heap.size > 0) {
      const cur = heap.pop()
      if (cur === gIdx) {
        found = true
        break
      }
      if (closed[cur] === gen) continue
      closed[cur] = gen
      if (++expanded > maxNodes) return null
      const ci = cur % n
      const cj = (cur - ci) / n
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue
          const ni = ci + di
          const nj = cj + dj
          if (this.isBlocked(ni, nj)) continue
          // No corner cutting
          if (di !== 0 && dj !== 0 && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj))) continue
          const nIdx = nj * n + ni
          if (closed[nIdx] === gen) continue
          const cost = g[cur] + (di !== 0 && dj !== 0 ? 1.4142 : 1)
          if (stamp[nIdx] !== gen || cost < g[nIdx]) {
            g[nIdx] = cost
            stamp[nIdx] = gen
            came[nIdx] = cur
            heap.push(nIdx, cost + this.h(ni, nj, gi, gj))
          }
        }
      }
    }
    if (!found) return null
    // Reconstruct
    const cells: [number, number][] = []
    let c = gIdx
    while (c !== sIdx && c >= 0) {
      const i = c % n
      cells.push([i, (c - i) / n])
      c = came[c]
    }
    cells.reverse()
    // Smooth: skip cells that are visible from the current anchor
    const out: [number, number][] = []
    let anchor = start
    let k = 0
    while (k < cells.length) {
      let far = k
      for (let m = k; m < cells.length; m++) {
        if (this.lineFree(anchor[0], anchor[1], cells[m][0], cells[m][1])) far = m
        else break
      }
      anchor = cells[far]
      out.push(this.toWorld(anchor[0], anchor[1]))
      k = far + 1
    }
    if (out.length) out[out.length - 1] = [tx, tz]
    return out
  }

  /** Slightly weighted heuristic: greedier search, far fewer expansions on open ground. */
  private h(i: number, j: number, gi: number, gj: number): number {
    const dx = Math.abs(i - gi)
    const dz = Math.abs(j - gj)
    return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * 1.2
  }
}

class Heap {
  private items: number[] = []
  private keys: number[] = []
  get size(): number {
    return this.items.length
  }
  clear(): void {
    this.items.length = 0
    this.keys.length = 0
  }
  push(item: number, key: number): void {
    this.items.push(item)
    this.keys.push(key)
    let i = this.items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= this.keys[i]) break
      this.swap(i, p)
      i = p
    }
  }
  pop(): number {
    const top = this.items[0]
    const last = this.items.pop()!
    const lastKey = this.keys.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      this.keys[0] = lastKey
      let i = 0
      const n = this.items.length
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < n && this.keys[l] < this.keys[m]) m = l
        if (r < n && this.keys[r] < this.keys[m]) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
  private swap(a: number, b: number): void {
    const t = this.items[a]
    this.items[a] = this.items[b]
    this.items[b] = t
    const k = this.keys[a]
    this.keys[a] = this.keys[b]
    this.keys[b] = k
  }
}
