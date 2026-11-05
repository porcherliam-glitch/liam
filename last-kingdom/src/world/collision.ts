// Static collision: yaw-rotated boxes and vertical cylinders in a spatial hash.
// Characters are circles on the XZ plane with a height range; the camera uses the 3D segment cast.

export interface BoxCollider {
  kind: "box"
  x: number
  z: number
  hw: number
  hd: number
  yaw: number
  y0: number
  y1: number
  tag?: string
}

export interface CircleCollider {
  kind: "circle"
  x: number
  z: number
  r: number
  y0: number
  y1: number
  tag?: string
}

export type Collider = BoxCollider | CircleCollider

export interface Hit {
  t: number
  nx: number
  nz: number
  collider: Collider
}

export class CollisionWorld {
  private cell = 8
  private grid = new Map<number, Collider[]>()
  readonly all: Collider[] = []

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768)
  }

  private bounds(c: Collider): [number, number, number, number] {
    if (c.kind === "circle") return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r]
    const ex = Math.abs(Math.cos(c.yaw)) * c.hw + Math.abs(Math.sin(c.yaw)) * c.hd
    const ez = Math.abs(Math.sin(c.yaw)) * c.hw + Math.abs(Math.cos(c.yaw)) * c.hd
    return [c.x - ex, c.z - ez, c.x + ex, c.z + ez]
  }

  add(c: Collider): void {
    this.all.push(c)
    const [x0, z0, x1, z1] = this.bounds(c)
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        const k = this.key(cx, cz)
        let list = this.grid.get(k)
        if (!list) {
          list = []
          this.grid.set(k, list)
        }
        list.push(c)
      }
    }
  }

  remove(c: Collider): void {
    const i = this.all.indexOf(c)
    if (i >= 0) this.all.splice(i, 1)
    const [x0, z0, x1, z1] = this.bounds(c)
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        const list = this.grid.get(this.key(cx, cz))
        if (!list) continue
        const j = list.indexOf(c)
        if (j >= 0) list.splice(j, 1)
      }
    }
  }

  /** Colliders whose cells overlap the query rectangle (may contain duplicates). */
  query(x0: number, z0: number, x1: number, z1: number, out: Collider[] = []): Collider[] {
    out.length = 0
    const seen = new Set<Collider>()
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        const list = this.grid.get(this.key(cx, cz))
        if (!list) continue
        for (const c of list) {
          if (!seen.has(c)) {
            seen.add(c)
            out.push(c)
          }
        }
      }
    }
    return out
  }

  /**
   * Pushes a circle (x,z,r) occupying heights [y, y+h] out of all colliders. Returns the corrected position.
   * Iterates a few times so corners resolve cleanly.
   */
  resolveCircle(x: number, z: number, r: number, y: number, h: number, ignoreTag?: string): { x: number; z: number; hit: boolean } {
    let hit = false
    const tmp: Collider[] = []
    for (let iter = 0; iter < 3; iter++) {
      let moved = false
      this.query(x - r, z - r, x + r, z + r, tmp)
      for (const c of tmp) {
        if (ignoreTag && c.tag === ignoreTag) continue
        if (c.y1 <= y + 0.05 || c.y0 >= y + h) continue
        if (c.kind === "circle") {
          const dx = x - c.x
          const dz = z - c.z
          const d = Math.hypot(dx, dz)
          const min = r + c.r
          if (d < min) {
            const push = min - d
            if (d < 1e-5) {
              x += push
            } else {
              x += (dx / d) * push
              z += (dz / d) * push
            }
            moved = hit = true
          }
        } else {
          const cos = Math.cos(c.yaw)
          const sin = Math.sin(c.yaw)
          const dx = x - c.x
          const dz = z - c.z
          // into box space
          const lx = dx * cos + dz * sin
          const lz = -dx * sin + dz * cos
          const cx = Math.max(-c.hw, Math.min(c.hw, lx))
          const cz = Math.max(-c.hd, Math.min(c.hd, lz))
          let px = lx - cx
          let pz = lz - cz
          const d = Math.hypot(px, pz)
          if (d < r) {
            let ox: number
            let oz: number
            if (d < 1e-5) {
              // Centre is inside: push out along the nearest face.
              const toRight = c.hw - lx
              const toLeft = lx + c.hw
              const toFront = c.hd - lz
              const toBack = lz + c.hd
              const m = Math.min(toRight, toLeft, toFront, toBack)
              if (m === toRight) {
                ox = toRight + r
                oz = 0
              } else if (m === toLeft) {
                ox = -(toLeft + r)
                oz = 0
              } else if (m === toFront) {
                ox = 0
                oz = toFront + r
              } else {
                ox = 0
                oz = -(toBack + r)
              }
            } else {
              const push = r - d
              px /= d
              pz /= d
              ox = px * push
              oz = pz * push
            }
            // back to world
            x += ox * cos - oz * sin
            z += ox * sin + oz * cos
            moved = hit = true
          }
        }
      }
      if (!moved) break
    }
    return { x, z, hit }
  }

  /** Nearest intersection of a 3D segment with any collider. Returns t in [0,1] or null. */
  segmentCast(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignoreTag?: string): Hit | null {
    const tmp: Collider[] = []
    this.query(Math.min(ax, bx) - 0.5, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, Math.max(az, bz) + 0.5, tmp)
    let best: Hit | null = null
    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    for (const c of tmp) {
      if (ignoreTag && c.tag === ignoreTag) continue
      let t = Infinity
      let nx = 0
      let nz = 0
      if (c.kind === "circle") {
        // ray vs infinite cylinder then clamp by height
        const fx = ax - c.x
        const fz = az - c.z
        const a = dx * dx + dz * dz
        const b = 2 * (fx * dx + fz * dz)
        const cc = fx * fx + fz * fz - c.r * c.r
        if (a < 1e-9) continue
        const disc = b * b - 4 * a * cc
        if (disc < 0) continue
        const tt = (-b - Math.sqrt(disc)) / (2 * a)
        if (tt < 0 || tt > 1) continue
        const y = ay + dy * tt
        if (y < c.y0 || y > c.y1) continue
        t = tt
        nx = ax + dx * tt - c.x
        nz = az + dz * tt - c.z
        const n = Math.hypot(nx, nz) || 1
        nx /= n
        nz /= n
      } else {
        const cos = Math.cos(c.yaw)
        const sin = Math.sin(c.yaw)
        const lax = (ax - c.x) * cos + (az - c.z) * sin
        const laz = -(ax - c.x) * sin + (az - c.z) * cos
        const ldx = dx * cos + dz * sin
        const ldz = -dx * sin + dz * cos
        // slab test in local box space with y
        let tmin = 0
        let tmax = 1
        let axisN = -1
        let sign = 0
        const slabs: [number, number, number, number][] = [
          [lax, ldx, -c.hw, c.hw],
          [ay, dy, c.y0, c.y1],
          [laz, ldz, -c.hd, c.hd],
        ]
        let ok = true
        for (let i = 0; i < 3; i++) {
          const [o, d, lo, hi] = slabs[i]
          if (Math.abs(d) < 1e-9) {
            if (o < lo || o > hi) {
              ok = false
              break
            }
            continue
          }
          let t1 = (lo - o) / d
          let t2 = (hi - o) / d
          let s = -1
          if (t1 > t2) {
            const tt = t1
            t1 = t2
            t2 = tt
            s = 1
          }
          if (t1 > tmin) {
            tmin = t1
            axisN = i
            sign = s
          }
          if (t2 < tmax) tmax = t2
          if (tmin > tmax) {
            ok = false
            break
          }
        }
        if (!ok || tmin <= 0 || tmin > 1) continue
        t = tmin
        if (axisN === 0) {
          nx = sign * cos
          nz = sign * sin
        } else if (axisN === 2) {
          nx = -sign * sin
          nz = sign * cos
        }
      }
      if (t < (best?.t ?? Infinity)) best = { t, nx, nz, collider: c }
    }
    return best
  }

  /** True when the XZ segment at height y is blocked (line of sight). */
  blocked(ax: number, az: number, bx: number, bz: number, y: number, ignoreTag?: string): boolean {
    return this.segmentCast(ax, y, az, bx, y, bz, ignoreTag) !== null
  }

  /** True if the point lies inside any collider at that height. */
  pointInside(x: number, z: number, y: number): boolean {
    const tmp: Collider[] = []
    this.query(x, z, x, z, tmp)
    for (const c of tmp) {
      if (c.y1 <= y || c.y0 > y) continue
      if (c.kind === "circle") {
        if (Math.hypot(x - c.x, z - c.z) < c.r) return true
      } else {
        const cos = Math.cos(c.yaw)
        const sin = Math.sin(c.yaw)
        const lx = (x - c.x) * cos + (z - c.z) * sin
        const lz = -(x - c.x) * sin + (z - c.z) * cos
        if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) return true
      }
    }
    return false
  }
}

/** Transforms a prop-local collider into world space. */
export function placeCollider(c: Collider, x: number, y: number, z: number, yaw: number): Collider {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const wx = x + c.x * cos - c.z * sin
  const wz = z + c.x * sin + c.z * cos
  if (c.kind === "circle") return { ...c, x: wx, z: wz, y0: c.y0 + y, y1: c.y1 + y }
  return { ...c, x: wx, z: wz, yaw: c.yaw + yaw, y0: c.y0 + y, y1: c.y1 + y }
}
