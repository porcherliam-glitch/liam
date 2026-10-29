import { describe, expect, it } from "vitest"
import { CollisionWorld, collides, raycastObstacles, segmentBlocked2D, segmentBlocked3D, type Obstacle } from "./collision"
import { NavGrid } from "./nav"
import { mulberry32 } from "./raid"

function randomBoxes(n: number, seed: number, span = 300): Obstacle[] {
  const r = mulberry32(seed), out: Obstacle[] = []
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * span, z = (r() - 0.5) * span, w = 0.3 + r() * 12, d = 0.3 + r() * 12
    out.push({ minX: x, maxX: x + w, minZ: z, maxZ: z + d, height: 0.6 + r() * 8, minY: r() < 0.1 ? 2.8 : 0 })
  }
  return out
}

describe("CollisionWorld (spatial index) matches brute force", () => {
  const boxes = randomBoxes(1500, 11)
  const world = new CollisionWorld(boxes, 8)
  const r = mulberry32(99)
  it("collides()", () => {
    for (let i = 0; i < 3000; i++) {
      const x = (r() - 0.5) * 320, z = (r() - 0.5) * 320
      expect(world.collides(x, z, 0.4)).toBe(collides(x, z, 0.4, boxes))
    }
  })
  it("raycast() returns the same nearest hit", () => {
    for (let i = 0; i < 1500; i++) {
      const o = { x: (r() - 0.5) * 300, y: 0.2 + r() * 3, z: (r() - 0.5) * 300 }
      const a = r() * Math.PI * 2, e = (r() - 0.5) * 0.6
      const d = { x: Math.cos(a) * Math.cos(e), y: Math.sin(e), z: Math.sin(a) * Math.cos(e) }
      const fast = world.raycast(o, d, 200), slow = raycastObstacles(o, d, 200, boxes)
      expect(fast === null).toBe(slow === null)
      if (fast && slow) expect(fast.distance).toBeCloseTo(slow.distance, 6)
    }
  })
  it("segment tests", () => {
    for (let i = 0; i < 1500; i++) {
      const a = { x: (r() - 0.5) * 300, y: 0.3 + r() * 2, z: (r() - 0.5) * 300 }
      const b = { x: a.x + (r() - 0.5) * 120, y: 0.3 + r() * 2, z: a.z + (r() - 0.5) * 120 }
      expect(world.segmentBlocked3D(a, b)).toBe(segmentBlocked3D(a, b, boxes))
      expect(world.segmentBlocked2D(a.x, a.z, b.x, b.z, 1)).toBe(segmentBlocked2D(a.x, a.z, b.x, b.z, boxes, 1))
    }
  })
  it("supports adding and removing obstacles", () => {
    const w = new CollisionWorld([], 8)
    const wall: Obstacle = { minX: -1, maxX: 1, minZ: -20, maxZ: 20, height: 3 }
    w.add(wall)
    expect(w.collides(0, 10, 0.4)).toBe(true)
    expect(w.raycast({ x: -10, y: 1, z: 5 }, { x: 1, y: 0, z: 0 }, 50)?.distance).toBeCloseTo(9, 6)
    w.remove(wall)
    expect(w.collides(0, 10, 0.4)).toBe(false)
    expect(w.raycast({ x: -10, y: 1, z: 5 }, { x: 1, y: 0, z: 0 }, 50)).toBeNull()
  })
  it("moveCircle never ends inside a box", () => {
    const out = { x: 0, z: 0 }
    for (let i = 0; i < 1000; i++) {
      const x = (r() - 0.5) * 280, z = (r() - 0.5) * 280
      if (world.collides(x, z, 0.4)) continue
      world.moveCircle(x, z, (r() - 0.5) * 3, (r() - 0.5) * 3, 0.4, out)
      expect(world.collides(out.x, out.z, 0.39)).toBe(false)
    }
  })
})

describe("NavGrid rasterisation", () => {
  it("matches the exact circle test per cell and builds a 640 m map quickly", () => {
    const boxes = randomBoxes(4000, 5, 600)
    const t0 = performance.now()
    const nav = new NavGrid({ minX: -320, maxX: 320, minZ: -320, maxZ: 320 }, boxes, 0.45, 1)
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(1500)
    const r = mulberry32(3)
    for (let i = 0; i < 2000; i++) {
      const c = Math.floor(r() * nav.cols), row = Math.floor(r() * nav.rows)
      const x = nav.centerX(c), z = nav.centerZ(row)
      expect(nav.walkable(x, z)).toBe(!collides(x, z, 0.45, boxes))
    }
  })
  it("rebuildRegion follows obstacle changes", () => {
    const boxes: Obstacle[] = []
    const nav = new NavGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, boxes, 0.45, 1)
    expect(nav.walkable(0.5, 0.5)).toBe(true)
    boxes.push({ minX: -2, maxX: 2, minZ: -2, maxZ: 2, height: 2 })
    nav.rebuildRegion(-2, -2, 2, 2, boxes)
    expect(nav.walkable(0.5, 0.5)).toBe(false)
  })
})
