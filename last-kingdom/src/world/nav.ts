// Grid navigation for enemies: 2 m cells, A* with a binary heap and line-of-sight path smoothing.

import type { CollisionWorld } from "./collision"
import type { Terrain } from "./terrain"

export class NavGrid {
  readonly cell = 2
  readonly n: number
  readonly blocked: Uint8Array
  private origin: number
  private pathsThisFrame = 0
  budgetPerFrame = 4

  constructor(size: number, collision: CollisionWorld, terrain: Terrain | null, extraBlocked?: (x: number, z: number) => boolean) {
    this.n = Math.ceil((size * 2) / this.cell)
    this.origin = -size
    this.blocked = new Uint8Array(this.n * this.n)
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = this.origin + (i + 0.5) * this.cell
        const z = this.origin + (j + 0.5) * this.cell
        const y = terrain ? terrain.heightAt(x, z) : 0
        let b = false
        // Sample the centre and four offsets so thin walls are caught.
        for (const [ox, oz] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) {
          if (collision.pointInside(x + ox, z + oz, y + 0.6)) {
            b = true
            break
          }
        }
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
  nearestFree(x: number, z: number, maxR = 6): [number, number] | null {
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
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes = 6000): [number, number][] | null {
    this.pathsThisFrame++
    const start = this.nearestFree(sx, sz)
    const goal = this.nearestFree(tx, tz)
    if (!start || !goal) return null
    const n = this.n
    const sIdx = start[1] * n + start[0]
    const gIdx = goal[1] * n + goal[0]
    if (sIdx === gIdx) return [[tx, tz]]
    const g = new Float32Array(n * n).fill(Infinity)
    const came = new Int32Array(n * n).fill(-1)
    const closed = new Uint8Array(n * n)
    const heap = new Heap()
    g[sIdx] = 0
    heap.push(sIdx, this.h(start[0], start[1], goal[0], goal[1]))
    let expanded = 0
    const gi = goal[0]
    const gj = goal[1]
    while (heap.size > 0) {
      const cur = heap.pop()
      if (cur === gIdx) break
      if (closed[cur]) continue
      closed[cur] = 1
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
          if (closed[nIdx]) continue
          const cost = g[cur] + (di !== 0 && dj !== 0 ? 1.4142 : 1)
          if (cost < g[nIdx]) {
            g[nIdx] = cost
            came[nIdx] = cur
            heap.push(nIdx, cost + this.h(ni, nj, gi, gj))
          }
        }
      }
    }
    if (came[gIdx] < 0) return null
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

  private h(i: number, j: number, gi: number, gj: number): number {
    const dx = Math.abs(i - gi)
    const dz = Math.abs(j - gj)
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)
  }
}

class Heap {
  private items: number[] = []
  private keys: number[] = []
  get size(): number {
    return this.items.length
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
