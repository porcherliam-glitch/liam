import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { CollisionWorld, type Obstacle } from "./collision"
import { GORE_BUDGET, GibBody, GoreSystem, Ring, buildAtlasData, faceRoom, heartbeat, stepGib } from "./gore"
import type { BodyPartId } from "./hostiles"

const DT = 1 / 60
function run(b: GibBody, seconds: number, boxes: Obstacle[], each?: (b: GibBody) => void): void {
  for (let t = 0; t < seconds; t += DT) { stepGib(b, DT, boxes); each?.(b) }
}

describe("gib physics (stepGib)", () => {
  it("a dropped chunk lands on the floor, never sinks below it and falls asleep", () => {
    const b = new GibBody().shape(0.05)
    b.px = 0; b.py = 2; b.pz = 0; b.vx = 1.5; b.wz = 9
    let minY = Infinity
    run(b, 6, [], g => { minY = Math.min(minY, g.py) })
    expect(b.sleeping).toBe(true)
    expect(b.py).toBeCloseTo(0.05, 2)
    expect(minY).toBeGreaterThan(0.05 - 0.01)
    expect(Math.abs(b.px)).toBeLessThan(5)
  })

  it("a fast chunk thrown at a thin wall never passes through it", () => {
    const wall: Obstacle = { minX: 3, maxX: 3.08, minZ: -5, maxZ: 5, height: 3 }
    for (const speed of [8, 20, 40]) {
      const b = new GibBody().shape(0.03)
      b.px = 0; b.py = 1; b.pz = 0; b.vx = speed; b.vy = 1
      let maxX = -Infinity
      run(b, 4, [wall], g => { maxX = Math.max(maxX, g.px) })
      expect(maxX).toBeLessThan(3)
      expect(b.px).toBeLessThan(3)
    }
  })

  it("a limb (capsule) comes to rest lying flat on the floor", () => {
    const b = new GibBody().shape(0.06, 0, 0.22, 0)
    b.px = 0; b.py = 1.4; b.pz = 0; b.vx = 3; b.vy = 2; b.wx = 7; b.wz = -4
    run(b, 8, [])
    expect(b.sleeping).toBe(true)
    // world axis = q * (0, 0.22, 0): its vertical component must be small when lying flat
    const { qx, qy, qz, qw } = b
    const ay = 0.22 * (1 - 2 * (qx * qx + qz * qz))
    expect(Math.abs(ay)).toBeLessThan(0.06)
    expect(b.py).toBeGreaterThan(0.04)
    expect(b.py).toBeLessThan(0.1)
    void qy; void qw
  })

  it("rests on top of a crate instead of falling through", () => {
    const crate: Obstacle = { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5, height: 1 }
    const b = new GibBody().shape(0.05)
    b.px = 0; b.py = 2.5; b.pz = 0; b.vy = -6
    run(b, 5, [crate])
    expect(b.sleeping).toBe(true)
    expect(b.py).toBeCloseTo(1.05, 2)
  })

  it("a limb thrown at a pillar's corner slides off and lands instead of hovering against it", () => {
    const pillar: Obstacle = { minX: 2.3, maxX: 2.7, minZ: -2.1, maxZ: -1.7, height: 2.6 }
    for (const [ax, az] of [[0.37, 0], [0, 0.37], [0.26, 0.26]]) {
      const b = new GibBody().shape(0.1, ax, 0, az)
      b.px = 4.2; b.py = 1.2; b.pz = -0.3; b.vx = -12; b.vy = 1; b.vz = -11; b.wy = 3
      let inside = false
      run(b, 10, [pillar], g => { if (g.px > 2.3 && g.px < 2.7 && g.pz > -2.1 && g.pz < -1.7 && g.py < 2.6) inside = true })
      expect(inside).toBe(false)
      expect(b.sleeping).toBe(true)
      expect(b.py).toBeLessThan(0.16)
    }
  })

  it("a limb sliding down a pillar face falls to the floor (swept stop must not freeze it in the air)", () => {
    const pillar: Obstacle = { minX: 2.3, maxX: 2.7, minZ: -2.1, maxZ: -1.7, height: 2.6 }
    for (const vz of [-0.05, -0.3, -2]) {
      const b = new GibBody().shape(0.1, 0.37, 0, 0)
      b.px = 2.74; b.py = 1.0; b.pz = -1.6 + 1e-4; b.vz = vz
      run(b, 4, [pillar])
      expect(b.py).toBeLessThan(0.16)
      expect(b.sleeping).toBe(true)
    }
  })

  it("tiny near-spherical chunks settle quickly (no endless micro-rocking)", () => {
    for (let k = 0; k < 20; k++) {
      const b = new GibBody().shape(0.025 + k * 0.001, 0.012, 0, 0.004)
      b.py = 1; b.vx = 4 - k * 0.4; b.vy = 3; b.wx = 30; b.wz = -20 + k
      run(b, 5, [])
      expect(b.sleeping).toBe(true)
    }
  })

  it("bounces off a wall back to the thrower's side and stops", () => {
    const wall: Obstacle = { minX: 2, maxX: 2.4, minZ: -3, maxZ: 3, height: 3 }
    const b = new GibBody().shape(0.08, 0.15, 0, 0)
    b.px = 0; b.py = 1.2; b.pz = 0; b.vx = 12
    run(b, 10, [wall])
    expect(b.sleeping).toBe(true)
    expect(b.px).toBeLessThan(2)
  })
})

describe("pure helpers", () => {
  it("Ring recycles the oldest slot when full", () => {
    const r = new Ring(3)
    expect([r.next(), r.next(), r.next()]).toEqual([0, 1, 2])
    expect(r.count).toBe(3)
    expect(r.peek()).toBe(0)
    expect(r.next()).toBe(0)
    expect(r.count).toBe(3)
    r.reset(); expect(r.count).toBe(0); expect(r.next()).toBe(0)
  })

  it("heartbeat has a strong and a weaker pulse per beat and stays within 0..1", () => {
    let max = 0, min = 1
    const samples: number[] = []
    for (let t = 0; t < 60 / 120; t += 0.005) { const h = heartbeat(t, 120); samples.push(h); max = Math.max(max, h); min = Math.min(min, h) }
    expect(max).toBeLessThanOrEqual(1); expect(max).toBeGreaterThan(0.9); expect(min).toBeLessThan(0.05)
    let peaks = 0
    for (let i = 1; i < samples.length - 1; i++) if (samples[i] > samples[i - 1] && samples[i] >= samples[i + 1] && samples[i] > 0.3) peaks++
    expect(peaks).toBe(2)
  })

  it("faceRoom measures the distance to the nearest edge of the face that was hit", () => {
    const box: Obstacle = { minX: 0, maxX: 4, minZ: 0, maxZ: 0.3, height: 3 }
    expect(faceRoom(box, 1, 1.5, 0, 0, 0, -1)).toBeCloseTo(1)
    expect(faceRoom(box, 2, 0.2, 0, 0, 0, -1)).toBeCloseTo(0.2)
    expect(faceRoom(box, 2, 3, 0.15, 0, 1, 0)).toBeCloseTo(0.15)
  })

  it("atlas: 16 non-empty cells with transparent margins (no mip bleeding)", () => {
    const size = 512, cell = size / 4, d = buildAtlasData(size)
    for (let k = 0; k < 16; k++) {
      const ox = (k % 4) * cell, oy = Math.floor(k / 4) * cell
      let cover = 0, edge = 0
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const a = d[((oy + y) * size + ox + x) * 4 + 3]
        if (a > 128) cover++
        if ((x < 3 || y < 3 || x >= cell - 3 || y >= cell - 3) && a > 0) edge++
      }
      expect(cover / (cell * cell)).toBeGreaterThan(0.01)
      expect(edge).toBe(0)
    }
  })
})

/** A tiny jointed dummy following the GoreBody convention (part origins at the joints). */
function dummy(scene: THREE.Scene, x: number): { root: THREE.Group; parts: Record<BodyPartId, THREE.Group> } {
  const geo = new THREE.BoxGeometry(0.1, 0.4, 0.1), mat = new THREE.MeshStandardMaterial()
  const root = new THREE.Group(); root.position.set(x, 0, 0); scene.add(root)
  const part = (parent: THREE.Object3D, px: number, py: number, down: boolean) => {
    const g = new THREE.Group(); g.position.set(px, py, 0)
    const m = new THREE.Mesh(geo, mat); m.position.y = down ? -0.2 : 0.2; g.add(m); parent.add(g); return g
  }
  const torso = part(root, 0, 0.95, false)
  const parts = { torso, head: part(torso, 0, 0.45, false), armL: part(torso, -0.2, 0.4, true), armR: part(torso, 0.2, 0.4, true), legL: part(root, -0.1, 0.95, true), legR: part(root, 0.1, 0.95, true) }
  root.updateMatrixWorld(true)
  return { root, parts }
}

describe("GoreSystem", () => {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 1.6, 2); camera.updateMatrixWorld()
  const walls = new CollisionWorld([{ minX: -6, maxX: 6, minZ: -3.2, maxZ: -3, height: 3 }])

  it("level off: every call is a no-op", () => {
    const scene = new THREE.Scene(), gore = new GoreSystem(scene, walls, "off"), d = dummy(scene, 0)
    let splats = 0
    gore.onScreenSplatter = () => { splats++ }
    gore.wound({ x: 0, y: 1.3, z: 0 }, { x: 0, y: 0, z: -1 }, 60)
    gore.sever(d.parts.armL, { x: 0, y: 2, z: -3 })
    gore.headshot(d.parts.head, { x: 0, y: 0, z: -1 })
    gore.gib(d.root, { x: 0, y: 0.5, z: 0 }, 10)
    gore.pool({ x: 0, y: 0, z: 0 }, 1)
    gore.update(DT, camera)
    expect(gore.stats()).toMatchObject({ particles: 0, gibs: 0, splats: 0, pools: 0, drops: 0 })
    expect(d.parts.armL.visible && d.parts.head.visible && d.root.visible).toBe(true)
    expect(splats).toBe(0)
    gore.dispose()
  })

  it("level normal: sprays, splats and pools, but body parts stay attached and visible", () => {
    const scene = new THREE.Scene(), gore = new GoreSystem(scene, walls, "normal"), d = dummy(scene, 0)
    gore.update(DT, camera)
    gore.wound({ x: 0, y: 1.3, z: 0 }, { x: 0, y: 0, z: -1 }, 60)
    gore.sever(d.parts.armL, { x: 0, y: 2, z: -3 })
    gore.headshot(d.parts.head, { x: 0, y: 0, z: -1 })
    gore.gib(d.root, { x: 0, y: 0.5, z: 0 }, 10)
    gore.pool({ x: 0, y: 0, z: 0 }, 1)
    for (let i = 0; i < 30; i++) gore.update(DT, camera)
    const s = gore.stats()
    expect(s.particles).toBeGreaterThan(50)
    expect(s.splats).toBeGreaterThan(0)
    expect(s.pools).toBe(1) // pool() only: gib() in "normal" is a heavy spray
    expect(s.gibs).toBe(0)
    expect(d.parts.armL.visible && d.parts.head.visible && d.root.visible).toBe(true)
    gore.dispose()
  })

  it("level brutal: severing hides the part, spawns a gib, a stump cap and a fountain that settle", () => {
    const scene = new THREE.Scene(), gore = new GoreSystem(scene, walls, "brutal"), d = dummy(scene, 0)
    gore.update(DT, camera)
    let screen = 0
    gore.onScreenSplatter = a => { screen = Math.max(screen, a) }
    gore.sever(d.parts.armR, { x: 2, y: 1, z: 0 })
    expect(d.parts.armR.visible).toBe(false)
    expect(d.parts.torso.children.length).toBe(5) // mesh, head, armL, armR (hidden) + stump cap
    let s = gore.stats()
    expect(s.gibs).toBe(1); expect(s.caps).toBe(1); expect(s.emitters).toBeGreaterThan(0)
    expect(screen).toBeGreaterThan(0)
    for (let i = 0; i < 60 * 8; i++) gore.update(DT, camera)
    s = gore.stats()
    expect(s.awakeGibs).toBe(0)
    expect(s.emitters).toBe(0)
    expect(s.splats + s.drops).toBeGreaterThan(0)
    // the clone shares geometry and material with the original
    const gibMesh = gore.root.children.find(c => c.type === "Group")!.children[0].children[0] as THREE.Mesh
    expect(gibMesh.geometry).toBe((d.parts.armR.children[0] as THREE.Mesh).geometry)
    gore.dispose()
  })

  it("budgets hold under abuse: ≤ 80 gibs, ≤ 1500 particles, ≤ 150 splats, ≤ 50 pools; clear() empties everything", () => {
    const scene = new THREE.Scene(), gore = new GoreSystem(scene, walls, "brutal")
    gore.random = (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
    gore.update(DT, camera)
    for (let k = 0; k < 12; k++) {
      const d = dummy(scene, k * 0.7 - 4)
      gore.headshot(d.parts.head, { x: 0, y: 0, z: -1 })
      gore.sever(d.parts.legL, { x: 1, y: 2, z: 0 })
      gore.gib(d.root, { x: k * 0.7 - 4, y: 0.4, z: 0.3 }, 12)
      for (let w = 0; w < 20; w++) gore.wound({ x: k * 0.7 - 4, y: 1.2, z: 0 }, { x: 0.1, y: 0, z: -1 }, 80)
      for (let p = 0; p < 6; p++) gore.pool({ x: k, y: 0, z: 0 }, 1)
      for (let i = 0; i < 10; i++) gore.update(DT, camera)
      const s = gore.stats()
      expect(s.gibs).toBeLessThanOrEqual(GORE_BUDGET.gibs)
      expect(s.particles).toBeLessThanOrEqual(GORE_BUDGET.particles)
      expect(s.splats).toBeLessThanOrEqual(GORE_BUDGET.splats)
      expect(s.pools).toBeLessThanOrEqual(GORE_BUDGET.pools)
      expect(s.drops).toBeLessThanOrEqual(GORE_BUDGET.drops)
    }
    expect(gore.stats().gibs).toBeGreaterThan(60)
    gore.clear()
    gore.update(DT, camera)
    expect(gore.stats()).toMatchObject({ particles: 0, gibs: 0, splats: 0, pools: 0, drops: 0, emitters: 0, caps: 0 })
    gore.dispose()
    expect(scene.children.includes(gore.root)).toBe(false)
  })
})
