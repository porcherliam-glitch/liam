/**
 * ai.test.ts — unit tests for the pure enemy-AI math (ai.ts): hit chance, perception, cover ranking, capsules,
 * packed obstacle ray tests (checked against collision.ts).
 */
import { describe, expect, it } from "vitest"
import {
  coverFacesThreat, createRng, detectionRate, distanceFalloff, flankPoint, hitChance, inFieldOfView, isPeripheral, packBoxes,
  randInt, rankCover, rayBoxes, raySegmentCapsule, segmentBlockedBoxes, visionRange, wrapAngle, yawTo, type DetectionInput, type HitChanceInput,
} from "./ai"
import { raycastObstacles, segmentBlocked3D, type Obstacle } from "./collision"
import { ENEMIES, THEMES } from "./data"

const shot = (o: Partial<HitChanceInput> = {}): HitChanceInput => ({
  accuracy: 0.6, distance: 10, range: 38, playerSpeed: 0, sprinting: false, crouched: false, difficultyAccuracy: 1, firstBurst: false, ...o,
})
const seen = (o: Partial<DetectionInput> = {}): DetectionInput => ({
  distance: 20, range: 34, crouched: false, sprinting: false, shooting: false, moving: false, night: false, flashlight: false,
  peripheral: false, partial: false, alerted: false, ...o,
})

describe("angles and rng", () => {
  it("wraps angles into [-π, π)", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI)
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2)
    expect(wrapAngle(0.3)).toBeCloseTo(0.3)
  })
  it("yaw 0 faces -Z and positive yaw turns left", () => {
    expect(yawTo(0, -1)).toBeCloseTo(0)
    expect(yawTo(-1, 0)).toBeCloseTo(Math.PI / 2)
    expect(yawTo(1, 0)).toBeCloseTo(-Math.PI / 2)
  })
  it("seeded rng is deterministic and in range", () => {
    const a = createRng(42), b = createRng(42)
    for (let i = 0; i < 50; i++) { const x = a(); expect(x).toBe(b()); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1) }
    const r = createRng(7)
    for (let i = 0; i < 200; i++) { const n = randInt(r, 2, 4); expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(4) }
  })
})

describe("hit chance", () => {
  it("equals the base accuracy for a still, standing player at 10 m", () => {
    expect(hitChance(shot())).toBeCloseTo(0.6)
  })
  it("applies movement, crouch, difficulty and first-burst factors", () => {
    expect(hitChance(shot({ sprinting: true, playerSpeed: 6 }))).toBeCloseTo(0.6 * 0.55)
    expect(hitChance(shot({ playerSpeed: 3 }))).toBeCloseTo(0.6 * 0.8)
    expect(hitChance(shot({ crouched: true }))).toBeCloseTo(0.6 * 0.8)
    expect(hitChance(shot({ difficultyAccuracy: 0.75 }))).toBeCloseTo(0.45)
    expect(hitChance(shot({ firstBurst: true }))).toBeCloseTo(0.36)
  })
  it("falls off with distance and is clamped to 0.04 … 0.85", () => {
    expect(distanceFalloff(10, 38)).toBeCloseTo(1)
    expect(distanceFalloff(2, 38)).toBeGreaterThan(1)
    expect(distanceFalloff(30, 38)).toBeLessThan(distanceFalloff(20, 38))
    expect(distanceFalloff(200, 38)).toBeCloseTo(0.35)
    expect(hitChance(shot({ accuracy: 0.95, distance: 1, difficultyAccuracy: 1.15 }))).toBe(0.85)
    expect(hitChance(shot({ accuracy: 0.1, distance: 80, sprinting: true, crouched: true, firstBurst: true }))).toBe(0.04)
  })
})

describe("perception", () => {
  const rifle = ENEMIES.rifleman
  it("night shortens sight; the flashlight brings it back; crouching shortens it", () => {
    const day = visionRange({ vision: rifle.vision, visionScale: THEMES.dusk.visionScale, night: false, flashlight: false, crouched: false, shooting: false })
    const dark = visionRange({ vision: rifle.vision, visionScale: THEMES.night.visionScale, night: true, flashlight: false, crouched: false, shooting: false })
    const lit = visionRange({ vision: rifle.vision, visionScale: THEMES.night.visionScale, night: true, flashlight: true, crouched: false, shooting: false })
    const low = visionRange({ vision: rifle.vision, visionScale: THEMES.dusk.visionScale, night: false, flashlight: false, crouched: true, shooting: false })
    expect(day).toBeCloseTo(34)
    expect(dark).toBeCloseTo(34 * 0.55)
    expect(lit).toBeGreaterThanOrEqual(34 * 0.95 - 1e-9)
    expect(low).toBeCloseTo(34 * 0.7)
  })
  it("fills the meter in ~0.4–1.5 s and near-instantly up close", () => {
    const near = 1 / detectionRate(seen({ distance: 6 })), far = 1 / detectionRate(seen({ distance: 33 }))
    expect(near).toBeGreaterThanOrEqual(0.4); expect(near).toBeLessThan(0.7)
    expect(far).toBeGreaterThan(1.2); expect(far).toBeLessThanOrEqual(1.5)
    expect(1 / detectionRate(seen({ distance: 3 }))).toBeLessThan(0.25)
  })
  it("crouch, peripheral and partial views are slower; sprint, shots and a lit flashlight at night are faster", () => {
    const base = detectionRate(seen())
    expect(detectionRate(seen({ crouched: true }))).toBeLessThan(base)
    expect(detectionRate(seen({ peripheral: true }))).toBeLessThan(base)
    expect(detectionRate(seen({ partial: true }))).toBeLessThan(base)
    expect(detectionRate(seen({ sprinting: true }))).toBeGreaterThan(base)
    expect(detectionRate(seen({ shooting: true }))).toBeGreaterThan(base)
    expect(detectionRate(seen({ night: true, flashlight: true }))).toBeGreaterThan(detectionRate(seen({ night: true })))
  })
  it("field of view", () => {
    expect(inFieldOfView(0, 0, -10, 110)).toBe(true)
    expect(inFieldOfView(0, 10, -10, 110)).toBe(true)     // 45° right
    expect(inFieldOfView(0, 10, 0, 110)).toBe(false)      // 90° right, outside ±55°
    expect(inFieldOfView(0, 0, 10, 110)).toBe(false)      // behind
    expect(isPeripheral(0, 10, -10, 110)).toBe(true)
    expect(isPeripheral(0, 1, -10, 110)).toBe(false)
  })
})

describe("cover", () => {
  // a box at x ∈ [-1, 1], z ∈ [-0.5, 0.5]; cover spots on its four faces (normals point away from the box)
  const pts = [
    { x: 0, z: 1.2, height: 1.2, nx: 0, nz: 1 },   // south face
    { x: 0, z: -1.2, height: 1.2, nx: 0, nz: -1 }, // north face
    { x: 1.7, z: 0, height: 1.2, nx: 1, nz: 0 },   // east face
  ]
  it("only accepts spots whose solid lies between the spot and the threat", () => {
    const threat = { x: 0, z: -20 }
    expect(coverFacesThreat(pts[0], threat)).toBe(true)
    expect(coverFacesThreat(pts[1], threat)).toBe(false)
    expect(coverFacesThreat(pts[2], threat)).toBe(false)
    const ranked = rankCover(pts, { from: { x: 3, z: 6 }, threat, maxTravel: 15, range: 38, minThreatDist: 6, preferDist: 20 })
    expect(ranked).toEqual([0])
  })
  it("respects travel distance, range and claims", () => {
    const threat = { x: 0, z: -20 }
    expect(rankCover(pts, { from: { x: 0, z: 30 }, threat, maxTravel: 15, range: 38, minThreatDist: 6, preferDist: 20 })).toEqual([])
    expect(rankCover(pts, { from: { x: 0, z: 3 }, threat, maxTravel: 15, range: 15, minThreatDist: 6, preferDist: 20 })).toEqual([])
    expect(rankCover(pts, { from: { x: 0, z: 3 }, threat, maxTravel: 15, range: 38, minThreatDist: 6, preferDist: 20, taken: i => i === 0 })).toEqual([])
  })
  it("flank points sit beside/behind the threat at the requested distance", () => {
    const threat = { x: 0, z: 0 }, from = { x: 0, z: 10 }
    const p = flankPoint(threat, from, 1, Math.PI / 2, 9)
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(9)
    expect(Math.abs(p.z)).toBeLessThan(1e-6) // 90° around: level with the threat
  })
})

describe("packed obstacle tests", () => {
  it("agree with collision.ts on random boxes and segments", () => {
    const rng = createRng(5)
    const boxes: Obstacle[] = []
    for (let i = 0; i < 40; i++) {
      const x = rng() * 60 - 30, z = rng() * 60 - 30, w = 0.5 + rng() * 6, d = 0.5 + rng() * 6
      boxes.push({ minX: x, maxX: x + w, minZ: z, maxZ: z + d, height: 0.8 + rng() * 4, minY: rng() < 0.2 ? 2 : undefined })
    }
    const packed = packBoxes(boxes)
    let blocked = 0
    for (let k = 0; k < 400; k++) {
      const a = { x: rng() * 70 - 35, y: rng() * 3, z: rng() * 70 - 35 }, b = { x: rng() * 70 - 35, y: rng() * 3, z: rng() * 70 - 35 }
      const ref = segmentBlocked3D(a, b, boxes)
      if (ref) blocked++
      expect(segmentBlockedBoxes(packed, a, b)).toBe(ref)
      const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), dir = { x: (b.x - a.x) / l, y: (b.y - a.y) / l, z: (b.z - a.z) / l }
      const hit = raycastObstacles(a, dir, l, boxes)
      expect(rayBoxes(packed, a, dir, l)).toBeCloseTo(hit ? hit.distance : l, 9)
    }
    expect(blocked).toBeGreaterThan(50)
  })
})

describe("posed capsules", () => {
  it("hits a tilted capsule at its surface and misses beside it", () => {
    const o = { x: 0, y: 1, z: 5 }, d = { x: 0, y: 0, z: -1 }
    // capsule along X from (-1, 1, 0) to (1, 1, 0), radius 0.2
    expect(raySegmentCapsule(o, d, -1, 1, 0, 1, 1, 0, 0.2, 50)).toBeCloseTo(4.8)
    expect(raySegmentCapsule({ x: 0, y: 1.5, z: 5 }, d, -1, 1, 0, 1, 1, 0, 0.2, 50)).toBeNull()
    // end cap
    expect(raySegmentCapsule({ x: 1.1, y: 1, z: 5 }, d, -1, 1, 0, 1, 1, 0, 0.2, 50)!).toBeGreaterThan(4.8)
    // beyond maxT
    expect(raySegmentCapsule(o, d, -1, 1, 0, 1, 1, 0, 0.2, 3)).toBeNull()
  })
})
