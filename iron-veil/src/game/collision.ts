/**
 * collision.ts — analytic collision and line-of-sight against axis-aligned boxes. Pure math, no three.js, unit-tested.
 * Every solid in a map is an Obstacle (AABB on XZ, from minY up to height). Movement uses circles on XZ; bullets and sight
 * lines use 3D segments/rays so low cover (height ~1 m) blocks a crouching player but not a standing one.
 */
import type { Vec2, Vec3 } from "./types"

export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number; height: number; minY?: number }
export interface RayHit { distance: number; normal: Vec3; obstacle: Obstacle }

/** True when a circle at (x, z) overlaps any obstacle. */
export function collides(x: number, z: number, radius: number, obstacles: readonly Obstacle[]): boolean {
  for (const o of obstacles) {
    if ((o.minY ?? 0) > 1.6) continue
    const cx = Math.max(o.minX, Math.min(x, o.maxX)), cz = Math.max(o.minZ, Math.min(z, o.maxZ))
    const dx = x - cx, dz = z - cz
    if (dx * dx + dz * dz < radius * radius) return true
  }
  return false
}

/**
 * Moves a circle by (dx, dz) and slides along obstacles. Returns the new position (written into out).
 * Sub-steps keep fast movers from tunnelling through thin walls.
 */
export function moveCircle(x: number, z: number, dx: number, dz: number, radius: number, obstacles: readonly Obstacle[], out: Vec2): Vec2 {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)))
  const sx = dx / steps, sz = dz / steps
  for (let i = 0; i < steps; i++) {
    if (!collides(x + sx, z, radius, obstacles)) x += sx
    if (!collides(x, z + sz, radius, obstacles)) z += sz
  }
  out.x = x; out.z = z
  return out
}

/**
 * Pushes a circle out of any obstacle it overlaps (used after teleports/spawns). Returns true if it moved.
 */
export function depenetrate(p: Vec2, radius: number, obstacles: readonly Obstacle[]): boolean {
  let moved = false
  for (let iter = 0; iter < 4; iter++) {
    let any = false
    for (const o of obstacles) {
      if ((o.minY ?? 0) > 1.6) continue
      const cx = Math.max(o.minX, Math.min(p.x, o.maxX)), cz = Math.max(o.minZ, Math.min(p.z, o.maxZ))
      let dx = p.x - cx, dz = p.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= radius * radius) continue
      any = true; moved = true
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = radius - d + 1e-3
        p.x += dx / d * push; p.z += dz / d * push
      } else {
        // centre inside the box: leave through the nearest face
        const left = p.x - o.minX, right = o.maxX - p.x, back = p.z - o.minZ, front = o.maxZ - p.z
        const m = Math.min(left, right, back, front)
        if (m === left) p.x = o.minX - radius - 1e-3
        else if (m === right) p.x = o.maxX + radius + 1e-3
        else if (m === back) p.z = o.minZ - radius - 1e-3
        else p.z = o.maxZ + radius + 1e-3
        dx = dz = 0
      }
    }
    if (!any) break
  }
  return moved
}

/** Ray vs. boxes (slab method). dir must be normalised. Returns the nearest hit within maxDist. */
export function raycastObstacles(origin: Vec3, dir: Vec3, maxDist: number, obstacles: readonly Obstacle[]): RayHit | null {
  let best: RayHit | null = null
  let bestT = maxDist
  for (const o of obstacles) {
    const t = rayBox(origin, dir, o.minX, o.minY ?? 0, o.minZ, o.maxX, o.height, o.maxZ, bestT)
    if (t !== null && t < bestT) {
      bestT = t
      best = { distance: t, normal: boxNormal(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t, o), obstacle: o }
    }
  }
  return best
}

/** True when the straight 3D segment a→b passes through any box. */
export function segmentBlocked3D(a: Vec3, b: Vec3, obstacles: readonly Obstacle[]): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-6) return false
  const dir = { x: dx / len, y: dy / len, z: dz / len }
  for (const o of obstacles) if (rayBox(a, dir, o.minX, o.minY ?? 0, o.minZ, o.maxX, o.height, o.maxZ, len) !== null) return true
  return false
}

/** True when the 2D segment crosses any box at least minHeight tall (ignores Y otherwise). */
export function segmentBlocked2D(ax: number, az: number, bx: number, bz: number, obstacles: readonly Obstacle[], minHeight = 0): boolean {
  const dx = bx - ax, dz = bz - az
  for (const o of obstacles) {
    if (o.height < minHeight || (o.minY ?? 0) > 1.6) continue
    let t0 = 0, t1 = 1
    if (Math.abs(dx) < 1e-9) { if (ax <= o.minX || ax >= o.maxX) continue } else {
      let ta = (o.minX - ax) / dx, tb = (o.maxX - ax) / dx
      if (ta > tb) { const s = ta; ta = tb; tb = s }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 >= t1) continue
    }
    if (Math.abs(dz) < 1e-9) { if (az <= o.minZ || az >= o.maxZ) continue } else {
      let ta = (o.minZ - az) / dz, tb = (o.maxZ - az) / dz
      if (ta > tb) { const s = ta; ta = tb; tb = s }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 >= t1) continue
    }
    return true
  }
  return false
}

/** Ray vs. one AABB; returns entry distance (0 if origin is inside) or null. */
export function rayBox(o: Vec3, d: Vec3, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, maxT: number): number | null {
  let t0 = 0, t1 = maxT
  // X slab
  if (Math.abs(d.x) < 1e-12) { if (o.x < minX || o.x > maxX) return null } else {
    let ta = (minX - o.x) / d.x, tb = (maxX - o.x) / d.x
    if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return null
  }
  if (Math.abs(d.y) < 1e-12) { if (o.y < minY || o.y > maxY) return null } else {
    let ta = (minY - o.y) / d.y, tb = (maxY - o.y) / d.y
    if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return null
  }
  if (Math.abs(d.z) < 1e-12) { if (o.z < minZ || o.z > maxZ) return null } else {
    let ta = (minZ - o.z) / d.z, tb = (maxZ - o.z) / d.z
    if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return null
  }
  return t0
}

function boxNormal(x: number, y: number, z: number, o: Obstacle): Vec3 {
  const ds = [
    [Math.abs(x - o.minX), -1, 0, 0], [Math.abs(x - o.maxX), 1, 0, 0],
    [Math.abs(y - (o.minY ?? 0)), 0, -1, 0], [Math.abs(y - o.height), 0, 1, 0],
    [Math.abs(z - o.minZ), 0, 0, -1], [Math.abs(z - o.maxZ), 0, 0, 1],
  ]
  let best = ds[0]
  for (const c of ds) if (c[0] < best[0]) best = c
  return { x: best[1], y: best[2], z: best[3] }
}

/** Ray vs. sphere; returns entry distance or null. dir normalised. */
export function raySphere(o: Vec3, d: Vec3, cx: number, cy: number, cz: number, r: number, maxT: number): number | null {
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

/** Ray vs. vertical capsule (segment from y0 to y1 at cx/cz, radius r); returns entry distance or null. */
export function rayCapsule(o: Vec3, d: Vec3, cx: number, cz: number, y0: number, y1: number, r: number, maxT: number): number | null {
  // infinite cylinder on XZ
  const ox = o.x - cx, oz = o.z - cz
  const a = d.x * d.x + d.z * d.z
  let best: number | null = null
  if (a > 1e-12) {
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r
    const disc = b * b - a * c
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      for (const t of [(-b - s) / a, (-b + s) / a]) {
        if (t < 0 || t > maxT) continue
        const y = o.y + d.y * t
        if (y >= y0 && y <= y1) { best = t; break }
      }
    }
  }
  for (const cy of [y0, y1]) {
    const t = raySphere(o, d, cx, cy, cz, r, maxT)
    if (t !== null && (best === null || t < best)) best = t
  }
  return best
}
