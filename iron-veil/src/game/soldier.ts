/**
 * soldier.ts — procedural low-poly soldiers: per-kind gear geometry merged per bone (vertex colours + a "glow" channel
 * for small emissive details), a joint hierarchy and fully procedural animation: idle breathing/weight shift, walk and
 * run cycles with foot IK, turning in place, crouch, aim tracking with two-hand arm IK on the weapon, recoil, muzzle
 * flash, hit flinch and a ragdoll-like death that settles flat on the ground. Also: night weapon light (emissive lens +
 * additive cone, no real light), marksman laser telegraph and the ?/! awareness billboard.
 * CONTRACT (used by enemies.ts and src/dev/ai-bench.ts):
 *  - acquireSoldierAssets() / releaseSoldierAssets(): ref-counted shared geometry, materials and textures.
 *  - new SoldierModel(kind, assets, seed): add `model.root` to a group that carries position (feet) + yaw.
 *  - update(dt, drive) animates; after the owning group's updateMatrixWorld(true) call capture() to refresh the posed
 *    world points (head, neckBase, pelvisPos, shoulders/elbows, hips/knees/ankles, muzzle) used for hit tests and LOS.
 *  - fire(), hit(dirX, dirZ), die(fallX, fallZ), dropWeapon(), gibbed(), setIndicator(), setLaser(), setNight(), dispose().
 *  - Gore: `parts` maps head/torso/armL/armR/legL/legR to joint groups whose local origin is the joint (neck, chest,
 *    shoulder, hip); hiding one leaves a stump. `severed` (shared with the owner's GoreBody) removes those parts from
 *    rayTest()/nearestZone() and from the corpse ground fit. Without the weapon both arms swing freely.
 *  - rayTest(): head sphere above the jaw line (neck shots and grazes under the jaw count as torso), torso capsule
 *    pelvis→upper chest + neck capsule, upper-arm and leg capsules.
 * Draw calls per soldier: 14 (13 body meshes + weapon); +2 at night (lens, cone), +1 muzzle flash, +2 laser, +1 mark.
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { SURF, surfAttribute, withSurface } from "./surface"
import { ENEMIES, type EnemyWeapon } from "./data"
import { raySegmentCapsule } from "./ai"
import type { BodyPartId, HitPart } from "./hostiles"
import type { EnemyKind, Vec3 } from "./types"

type V3 = [number, number, number]
const TAU = Math.PI * 2

// ------------------------------------------------------------------ rig constants (metres, before the kind scale)

export const RIG = {
  pelvisY: 0.99,
  crouchPelvisY: 0.56,
  spine: 0.1,
  chest: 0.2,
  neck: 0.25,
  shoulderX: 0.2, shoulderY: 0.18,
  upperArm: 0.3, forearm: 0.31,
  hipX: 0.1, hipY: -0.06,
  thigh: 0.43, shin: 0.42, ankleH: 0.09,
  headCenter: [0, 0.17, -0.005] as V3,
} as const

// ------------------------------------------------------------------ geometry builder

/** Hard knuckle protector colour on gloves. */
const SOLDIER_KNUCKLE = 0x1c1d1b
/** Surface type (surface.ts) per palette colour of the kind being built. */
const SOLDIER_SURF = new Map<number, number>()
function classifySoldier(P: Palette): void {
  SOLDIER_SURF.clear()
  for (const c of [P.fabric, P.pants, P.strap, P.pouch, P.gear]) SOLDIER_SURF.set(c, SURF.fabric)
  for (const c of [P.boots, P.gloves, P.pads, P.accent, P.dark]) SOLDIER_SURF.set(c, SURF.polymer)
  // helmets wear a fabric cover (camouflage), except the heavy's ballistic shell
  SOLDIER_SURF.set(P.helmet, P === PAL.heavy ? SURF.polymer : SURF.fabric)
  for (const c of [P.gunMetal, P.gunAccent, 0x111214, 0x050505]) SOLDIER_SURF.set(c, SURF.metal)
  SOLDIER_SURF.set(P.skin, SURF.skin)
}

class Parts {
  private list: THREE.BufferGeometry[] = []
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler()
  private s = new THREE.Vector3(); private p = new THREE.Vector3()
  add(geo: THREE.BufferGeometry, color: number, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], glow = 0): this {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    g.deleteAttribute("uv")
    this.e.set(rot[0], rot[1], rot[2], "YXZ"); this.q.setFromEuler(this.e)
    this.m.compose(this.p.set(pos[0], pos[1], pos[2]), this.q, this.s.set(scale[0], scale[1], scale[2]))
    g.applyMatrix4(this.m)
    const n = g.attributes.position.count, c = new THREE.Color(color)
    const col = new Float32Array(n * 3), gl = new Float32Array(n)
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3))
    g.setAttribute("glow", new THREE.BufferAttribute(gl, 1))
    g.setAttribute("surf", surfAttribute(n, SOLDIER_SURF.get(color) ?? SURF.paint))
    this.list.push(g)
    return this
  }
  /** Box with softly rounded edges (fabric, pouches, plates); tiny details stay sharp. */
  box(w: number, h: number, d: number, color: number, pos: V3, rot?: V3, glow = 0): this {
    const m = Math.min(w, h, d)
    const geo = m < 0.012 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(m * 0.3, 0.018))
    return this.add(geo, color, pos, rot, undefined, glow)
  }
  /** Sharp-edged box (rails, buckles, straps seen edge-on). */
  hard(w: number, h: number, d: number, color: number, pos: V3, rot?: V3, glow = 0): this { return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot, undefined, glow) }
  cyl(rTop: number, rBot: number, h: number, color: number, pos: V3, rot?: V3, seg = 7): this { return this.add(new THREE.CylinderGeometry(rTop, rBot, h, Math.max(seg, Math.round(seg * 1.45))), color, pos, rot) }
  sph(r: number, color: number, pos: V3, scale: V3 = [1, 1, 1], ws = 9, hs = 6, thetaLen = Math.PI, rot?: V3): this {
    return this.add(new THREE.SphereGeometry(r, Math.round(ws * 1.35), Math.round(hs * 1.35), 0, TAU, 0, thetaLen), color, pos, rot, scale)
  }
  /** Pushes a ready geometry that already carries position/normal/color/surf (indexed is expanded; glow added). */
  private raw(g: THREE.BufferGeometry, glow = 0): this {
    const ng = g.index ? g.toNonIndexed() : g
    if (ng !== g) g.dispose()
    ng.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(glow), 1))
    this.list.push(ng)
    return this
  }
  /**
   * Smooth lofted tube through elliptical rings (y, half width w, half depth d, optional centre x/z) with Catmull-Rom
   * sub-rings; `deform(a, y)` pushes vertices radially (folds, muscles), `paint(a, y, c)` may recolour (returns a surface type).
   */
  loft(rings: { y: number; w: number; d: number; x?: number; z?: number }[], color: number, segs = 16, fx: { deform?: (a: number, y: number) => number; paint?: (a: number, y: number, c: THREE.Color) => number | void } = {}, caps = 3): this {
    const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
    const R: { y: number; w: number; d: number; x: number; z: number }[] = [], n0 = rings.length, sub = 3
    for (let k = 0; k < n0 - 1; k++) {
      const A = rings[Math.max(0, k - 1)], B = rings[k], C = rings[k + 1], D = rings[Math.min(n0 - 1, k + 2)]
      for (let i = 0; i < sub; i++) { const t = i / sub; R.push({ y: cr(A.y, B.y, C.y, D.y, t), w: cr(A.w, B.w, C.w, D.w, t), d: cr(A.d, B.d, C.d, D.d, t), x: cr(A.x ?? 0, B.x ?? 0, C.x ?? 0, D.x ?? 0, t), z: cr(A.z ?? 0, B.z ?? 0, C.z ?? 0, D.z ?? 0, t) }) }
    }
    const L = rings[n0 - 1]; R.push({ y: L.y, w: L.w, d: L.d, x: L.x ?? 0, z: L.z ?? 0 })
    const pos: number[] = [], col: number[] = [], sf: number[] = [], idx: number[] = [], base = new THREE.Color(color), c = new THREE.Color(), st0 = SOLDIER_SURF.get(color) ?? SURF.paint
    for (const r of R) for (let i = 0; i < segs; i++) {
      const a = (i + 0.5) / segs * TAU, ca = Math.cos(a), sa = Math.sin(a), nl = Math.hypot(ca * r.d, sa * r.w) || 1
      const off = fx.deform ? fx.deform(a, r.y) : 0
      pos.push(r.x + ca * r.w + ca * r.d / nl * off, r.y, r.z + sa * r.d + sa * r.w / nl * off)
      c.copy(base); const st = fx.paint?.(a, r.y, c)
      col.push(c.r, c.g, c.b); sf.push(st ?? st0)
    }
    const n = R.length, down = R[n - 1].y < R[0].y
    for (let r = 0; r < n - 1; r++) for (let i = 0; i < segs; i++) {
      const v00 = r * segs + i, v01 = r * segs + (i + 1) % segs, v10 = v00 + segs, v11 = v01 + segs
      if (down) idx.push(v00, v01, v10, v01, v11, v10); else idx.push(v00, v10, v01, v01, v10, v11)
    }
    const cap = (ri: number, bottom: boolean) => {
      const ctr = pos.length / 3, r = R[ri]; pos.push(r.x, r.y, r.z); col.push(base.r, base.g, base.b); sf.push(st0)
      for (let i = 0; i < segs; i++) { const a = ri * segs + i, b = ri * segs + (i + 1) % segs; if (bottom !== down) idx.push(ctr, a, b); else idx.push(ctr, b, a) }
    }
    if (caps & 1) cap(0, true)
    if (caps & 2) cap(n - 1, false)
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("surf", new THREE.Float32BufferAttribute(sf, 1)); g.setIndex(idx)
    g.computeVertexNormals()
    return this.raw(g)
  }
  /** Seamless sculpted ellipsoid: fn(u, colour) returns the radial displacement (radius units) and may return a surface type. */
  sculpt(c: V3, r: V3, color: number, fn: (u: THREE.Vector3, col: THREE.Color) => [number, number?], wSeg = 28, hSeg = 20): this {
    const pos: number[] = [], col: number[] = [], sf: number[] = [], idx: number[] = [], u = new THREE.Vector3(), cc = new THREE.Color(), st0 = SOLDIER_SURF.get(color) ?? SURF.paint
    const vert = (th: number, ph: number) => {
      u.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)); cc.setHex(color)
      const [d, st] = fn(u, cc), k = 1 + d
      pos.push(c[0] + u.x * r[0] * k, c[1] + u.y * r[1] * k, c[2] + u.z * r[2] * k); col.push(cc.r, cc.g, cc.b); sf.push(st ?? st0)
    }
    vert(0, 0)
    for (let i = 1; i < hSeg; i++) for (let j = 0; j < wSeg; j++) vert(i / hSeg * Math.PI, j / wSeg * TAU)
    vert(Math.PI, 0)
    const ring = (i: number, j: number) => 1 + (i - 1) * wSeg + (j % wSeg), last = 1 + (hSeg - 1) * wSeg
    for (let j = 0; j < wSeg; j++) idx.push(0, ring(1, j + 1), ring(1, j))
    for (let i = 1; i < hSeg - 1; i++) for (let j = 0; j < wSeg; j++) idx.push(ring(i, j), ring(i, j + 1), ring(i + 1, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j))
    for (let j = 0; j < wSeg; j++) idx.push(last, ring(hSeg - 1, j), ring(hSeg - 1, j + 1))
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("surf", new THREE.Float32BufferAttribute(sf, 1)); g.setIndex(idx)
    g.computeVertexNormals()
    return this.raw(g)
  }
  /** Gloved hand closed around a grip below the wrist at y0 (fingers curl toward -Z). */
  glove(y0: number, color: number, side: number): this {
    this.box(0.068, 0.07, 0.046, color, [0, y0 - 0.035, -0.004])
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.017, l = [0.03, 0.034, 0.032, 0.026][i]
      this.add(new THREE.CapsuleGeometry(0.0085, l, 2, 6), color, [x, y0 - 0.074 - l * 0.3, -0.016], [0.9, 0, 0])
      this.add(new THREE.CapsuleGeometry(0.0078, l * 0.8, 2, 6), color, [x, y0 - 0.085 - l * 0.4, -0.046], [2.1, 0, 0])
    }
    this.add(new THREE.CapsuleGeometry(0.009, 0.03, 2, 6), color, [-side * 0.036, y0 - 0.045, -0.026], [0.6, 0, -side * 0.5])
    return this.hard(0.06, 0.012, 0.03, SOLDIER_KNUCKLE, [0, y0 - 0.062, -0.026])
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.list, false)
    for (const p of this.list) p.dispose()
    if (!g) throw new Error("soldier geometry merge failed")
    g.computeBoundingBox(); g.computeBoundingSphere()
    return g
  }
}

// ------------------------------------------------------------------ palettes

interface Palette {
  fabric: number; pants: number; skin: number; gear: number; pouch: number; strap: number; helmet: number
  boots: number; gloves: number; pads: number; gunMetal: number; gunAccent: number; accent: number; dark: number
}
const PAL: Record<EnemyKind, Palette> = {
  scout: { fabric: 0x66743f, pants: 0x535d35, skin: 0xa77d5f, gear: 0x857e55, pouch: 0x736c49, strap: 0x3b3a2e, helmet: 0x5d6b3c, boots: 0x2f2a23, gloves: 0x2c2b27, pads: 0x3d4034, gunMetal: 0x2a2b2d, gunAccent: 0x3d4138, accent: 0x2e3029, dark: 0x1c1d1b },
  rifleman: { fabric: 0x80837a, pants: 0x676b62, skin: 0xb48b6c, gear: 0x93805e, pouch: 0x806e50, strap: 0x4a4334, helmet: 0x958866, boots: 0x3b3229, gloves: 0x302e2a, pads: 0x2d2e2b, gunMetal: 0x232426, gunAccent: 0x9e8a65, accent: 0x5c6059, dark: 0x1b1c1d },
  heavy: { fabric: 0x353a40, pants: 0x2d3136, skin: 0x9c7a62, gear: 0x50565e, pouch: 0x40454c, strap: 0x26292d, helmet: 0x484e56, boots: 0x1f2022, gloves: 0x1e1f21, pads: 0x63686f, gunMetal: 0x1e1f21, gunAccent: 0x2b2d30, accent: 0xd07a2a, dark: 0x111315 },
  marksman: { fabric: 0x625d45, pants: 0x514d39, skin: 0xa88265, gear: 0x6e674b, pouch: 0x5f5940, strap: 0x3e3a2c, helmet: 0x5b633d, boots: 0x362f26, gloves: 0x2f2c26, pads: 0x3a3a30, gunMetal: 0x3c3f36, gunAccent: 0x585b41, accent: 0x716645, dark: 0x1d1d18 },
}
const GHILLIE = [0x5a653b, 0x736845, 0x4b5531, 0x7e734c]
const KIND_SCALE: Record<EnemyKind, number> = { scout: 0.98, rifleman: 1, heavy: 1.07, marksman: 1 }
/** Hit-zone radii (unscaled): head sphere, torso capsule, arm, thigh, shin. */
const ZONES: Record<EnemyKind, { head: number; torso: number; arm: number; thigh: number; shin: number }> = {
  scout: { head: 0.125, torso: 0.19, arm: 0.06, thigh: 0.085, shin: 0.07 },
  rifleman: { head: 0.135, torso: 0.2, arm: 0.06, thigh: 0.085, shin: 0.07 },
  heavy: { head: 0.15, torso: 0.235, arm: 0.075, thigh: 0.095, shin: 0.08 },
  marksman: { head: 0.14, torso: 0.2, arm: 0.065, thigh: 0.085, shin: 0.07 },
}

// ------------------------------------------------------------------ body parts (joint-local space, forward = -Z)

function buildPelvis(kind: EnemyKind): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), heavy = kind === "heavy", hw = heavy ? 1.09 : 1
  b.loft([{ y: -0.135, w: 0.14 * hw, d: 0.088 }, { y: -0.06, w: 0.163 * hw, d: 0.101, z: 0.005 }, { y: 0.02, w: 0.162 * hw, d: 0.1, z: 0.005 }, { y: 0.07, w: 0.152 * hw, d: 0.095 }],
    P.pants, 20, { deform: (a, y) => 0.003 * Math.sin(a * 5 + y * 60) })
  b.box(heavy ? 0.37 : 0.345, 0.055, 0.215, P.strap, [0, 0.065, 0])
  b.box(0.05, 0.035, 0.012, P.gunMetal, [0, 0.065, -0.11])
  b.box(0.045, 0.085, 0.075, P.pouch, [-0.185, 0.035, 0.03])
  b.box(0.045, 0.085, 0.075, P.pouch, [0.185, 0.035, 0.03])
  b.box(0.12, 0.075, 0.045, P.pouch, [0, 0.04, 0.128])
  if (heavy) {
    b.box(0.18, 0.17, 0.035, P.gear, [0, -0.1, -0.12], [0.12, 0, 0])
    b.box(0.3, 0.08, 0.03, P.gear, [0, 0.0, 0.125])
  }
  if (kind === "marksman") for (let i = 0; i < 9; i++) {
    const a = -1.4 + i * 0.35, r = 0.15
    b.box(0.05, 0.22, 0.012, GHILLIE[i % 4], [Math.sin(a) * r, -0.07 - (i % 3) * 0.02, Math.cos(a) * 0.12 + 0.01], [0.15, a, (i % 2 ? 0.12 : -0.1)])
  }
  return b.build()
}

function buildChest(kind: EnemyKind): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), w = kind === "heavy" ? 1.08 : kind === "scout" ? 0.96 : 1
  b.loft([
    { y: -0.235, w: 0.138 * w, d: 0.09 }, { y: -0.12, w: 0.145 * w, d: 0.094 }, { y: 0.0, w: 0.168 * w, d: 0.102 }, { y: 0.1, w: 0.186 * w, d: 0.107 },
    { y: 0.18, w: 0.18 * w, d: 0.098 }, { y: 0.228, w: 0.12 * w, d: 0.075 }, { y: 0.255, w: 0.068, d: 0.06 },
  ], P.fabric, 22, { deform: (a, y) => 0.0028 * Math.sin(a * 6 + y * 46) + 0.0018 * Math.sin(a * 11 - y * 70) })
  b.sph(0.075, P.fabric, [-0.175 * w, 0.17, 0])
  b.sph(0.075, P.fabric, [0.175 * w, 0.17, 0])
  b.cyl(0.058, 0.066, 0.07, P.fabric, [0, 0.245, 0])
  if (kind === "rifleman") {
    b.box(0.3, 0.29, 0.05, P.gear, [0, 0.05, -0.125])
    b.box(0.3, 0.31, 0.05, P.gear, [0, 0.05, 0.125])
    b.box(0.385, 0.13, 0.215, P.gear, [0, -0.08, 0])
    b.box(0.065, 0.03, 0.235, P.gear, [-0.115, 0.205, 0]); b.box(0.065, 0.03, 0.235, P.gear, [0.115, 0.205, 0])
    for (const x of [-0.092, 0, 0.092]) b.box(0.078, 0.11, 0.045, P.pouch, [x, -0.035, -0.17])
    b.box(0.15, 0.07, 0.03, P.pouch, [0, 0.11, -0.163])
    b.box(0.05, 0.06, 0.03, P.accent, [0.12, 0.13, -0.158])
    b.box(0.21, 0.25, 0.05, P.pouch, [0, 0.03, 0.173])
    b.box(0.06, 0.13, 0.05, P.dark, [-0.135, 0.1, 0.165])
    b.cyl(0.005, 0.005, 0.32, P.dark, [-0.145, 0.32, 0.17], undefined, 4)
    // magazines sticking out of the pouches, MOLLE webbing, frag grenade, knife, hydration tube
    for (const x of [-0.092, 0, 0.092]) b.hard(0.058, 0.03, 0.024, 0x1b1c1d, [x, 0.03, -0.17], [-0.12, 0, 0])
    for (const y of [0.04, 0.075, 0.15, 0.18]) b.hard(0.29, 0.008, 0.004, P.strap, [0, y, -0.151])
    for (const y of [-0.02, 0.04, 0.1, 0.16]) b.hard(0.28, 0.008, 0.004, P.strap, [0, y, 0.151])
    b.sph(0.024, 0x4a5137, [0.135, -0.075, -0.17], [1, 1.15, 1], 8, 6).hard(0.006, 0.03, 0.012, 0x6a6e70, [0.15, -0.05, -0.17])
    b.box(0.022, 0.11, 0.016, P.dark, [-0.13, 0.12, -0.16], [0, 0, 0.25])
    b.cyl(0.005, 0.005, 0.2, 0x1e1e1c, [0.1, 0.12, -0.13], [0.3, 0, 0.2], 5)
  } else if (kind === "scout") {
    b.box(0.29, 0.14, 0.04, P.gear, [0, -0.04, -0.112])
    for (const x of [-0.1, -0.034, 0.034, 0.1]) b.box(0.055, 0.1, 0.04, P.pouch, [x, -0.04, -0.142]).hard(0.044, 0.026, 0.02, 0x1b1c1d, [x, 0.02, -0.142], [-0.1, 0, 0])
    b.box(0.04, 0.24, 0.02, P.strap, [-0.1, 0.1, -0.103]); b.box(0.04, 0.24, 0.02, P.strap, [0.1, 0.1, -0.103])
    b.box(0.04, 0.03, 0.22, P.strap, [-0.1, 0.21, 0]); b.box(0.04, 0.03, 0.22, P.strap, [0.1, 0.21, 0])
    b.box(0.23, 0.26, 0.1, P.gear, [0, 0.04, 0.15])
    b.box(0.18, 0.09, 0.04, P.pouch, [0, -0.02, 0.215])
    b.box(0.05, 0.05, 0.05, P.dark, [0.1, 0.17, 0.15])
  } else if (kind === "heavy") {
    b.box(0.38, 0.36, 0.07, P.gear, [0, 0.05, -0.14])
    b.box(0.38, 0.36, 0.07, P.gear, [0, 0.05, 0.14])
    b.box(0.44, 0.16, 0.25, P.gear, [0, -0.09, 0])
    b.box(0.35, 0.08, 0.28, P.gear, [0, 0.235, 0])
    b.box(0.32, 0.1, 0.03, P.pads, [0, 0.17, -0.185])
    for (const x of [-0.115, 0, 0.115]) b.box(0.09, 0.12, 0.05, P.pouch, [x, -0.06, -0.2]).hard(0.07, 0.03, 0.026, 0x1b1c1d, [x, 0.012, -0.2], [-0.1, 0, 0])
    for (const y of [0.04, 0.08, 0.12]) b.hard(0.37, 0.009, 0.004, P.dark, [0, y, -0.176])
    for (const x of [-0.17, 0.17]) b.box(0.035, 0.3, 0.26, P.gear, [x * 1.12, 0.03, 0], [0, 0, x > 0 ? -0.05 : 0.05])
    b.box(0.34, 0.04, 0.008, P.accent, [0, 0.17, 0.178])
    b.box(0.07, 0.045, 0.008, P.accent, [-0.11, 0.1, -0.178])
    b.box(0.24, 0.2, 0.06, P.pouch, [0, -0.02, 0.2])
  } else {
    b.box(0.3, 0.25, 0.04, P.gear, [0, 0.03, -0.115])
    b.box(0.3, 0.25, 0.04, P.gear, [0, 0.03, 0.115])
    b.box(0.07, 0.1, 0.04, P.pouch, [-0.07, -0.05, -0.15]); b.box(0.07, 0.1, 0.04, P.pouch, [0.07, -0.05, -0.15])
    // ghillie drape over the shoulders and back
    b.box(0.47, 0.08, 0.27, GHILLIE[0], [0, 0.215, 0.012])
    b.box(0.41, 0.3, 0.05, GHILLIE[1], [0, 0.05, 0.155])
    for (let i = 0; i < 14; i++) {
      const x = -0.23 + i * 0.0355, back = i % 2 === 0
      b.box(0.05, 0.2 + (i % 3) * 0.04, 0.012, GHILLIE[(i + 1) % 4], [x, 0.1 - (i % 3) * 0.02, back ? 0.185 : 0.14], [back ? 0.1 : -0.05, 0, ((i * 37) % 7 - 3) * 0.05])
    }
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      b.box(0.012, 0.18, 0.05, GHILLIE[(i + 2) % 4], [s * (0.245 + i * 0.005), 0.12 - i * 0.02, -0.06 + i * 0.045], [0, 0, s * (0.15 + i * 0.05)])
    }
  }
  return b.build()
}

function buildHead(kind: EnemyKind): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts()
  const face = kind === "scout" ? P.accent : P.skin
  b.cyl(kind === "heavy" ? 0.062 : 0.05, kind === "heavy" ? 0.07 : 0.056, 0.11, kind === "heavy" ? P.gear : P.skin, [0, 0.04, 0])
  if (kind === "heavy") b.sph(0.103, face, [0, 0.17, -0.005], [1, 1.14, 1.06], 10, 8)
  else {
    // sculpted face: brow, eye sockets, nose, cheekbones, lips and chin; the scout's balaclava leaves only the eyes
    const ey = kind === "scout" ? 0.187 : 0.166, eyeU = (sx: number) => new THREE.Vector3(sx * 0.36, (ey - 0.17) / 0.117, -0.93).normalize()
    const skin = new THREE.Color(P.skin), lip = new THREE.Color(0x7a4a3e), shade = new THREE.Color(P.skin).multiplyScalar(0.62), stubble = new THREE.Color(P.skin).multiplyScalar(0.78).lerp(new THREE.Color(0x3a3530), 0.25)
    const bump = (u: THREE.Vector3, x: number, y: number, z: number, rad: number) => { const l = Math.hypot(x, y, z), a = Math.acos(Math.max(-1, Math.min(1, (u.x * x + u.y * y + u.z * z) / l))), k = 1 - a / rad; return k > 0 ? k * k * (3 - 2 * k) : 0 }
    b.sculpt([0, 0.17, -0.005], [0.103, 0.117, 0.109], face, (u, c) => {
      const front = -u.z
      let d = 0, st: number | undefined
      for (const sx of [-1, 1]) {
        const k = bump(u, ...eyeU(sx).toArray() as [number, number, number], 0.24)
        d -= 0.07 * k; if (kind === "scout") { if (k > 0) { c.copy(skin).lerp(shade, k * 0.7); st = SURF.skin } } else c.lerp(shade, k * 0.45)
        d += 0.045 * bump(u, sx * 0.55, -0.32, -0.77, 0.3)
      }
      if (front > 0.5) d += 0.05 * Math.exp(-((u.y - (ey - 0.17) / 0.117 - 0.2) ** 2) / 0.006) * Math.max(0, 1 - Math.abs(u.x) / 0.62)
      if (front > 0.72 && Math.abs(u.x) < 0.13) { const t = Math.max(0, Math.min(1, ((ey - 0.17) / 0.117 - u.y) / 0.42)), w = 1 - Math.abs(u.x) / (0.06 + 0.08 * t); if (w > 0 && u.y > -0.5) d += (0.03 + 0.13 * t) * w }
      if (kind !== "scout") {
        const mk = bump(u, 0, -0.62, -0.79, 0.22)
        if (mk > 0) { d += 0.02 * mk; c.lerp(lip, Math.min(1, mk * 1.4) * (Math.abs(u.y + 0.62) < 0.05 ? 1 : 0.55)) }
        if (u.y < -0.45 && front > 0.2) c.lerp(stubble, 0.35)
        d += 0.05 * bump(u, 0, -0.9, -0.45, 0.35)
      }
      return [d, st]
    })
    for (const sx of [-1, 1]) {
      const e = eyeU(sx), p = new THREE.Vector3(e.x * 0.103 * 0.95, 0.17 + e.y * 0.117 * 0.95, -0.005 + e.z * 0.109 * 0.95)
      b.sph(0.0125, 0xe8e2d6, [p.x, p.y, p.z], [1, 0.72, 0.6], 8, 6)
      b.sph(0.0068, 0x3a2a1a, [p.x, p.y, p.z - 0.006], [1, 1, 0.5], 6, 5)
      if (kind !== "scout") b.hard(0.034, 0.008, 0.012, 0x3a2a1e, [sx * 0.037, ey + 0.019, -0.107], [0.15, 0, sx * -0.12])
    }
    b.sph(0.022, face, [-0.104, 0.165, 0.004], [0.45, 1.1, 0.85], 8, 6); b.sph(0.022, face, [0.104, 0.165, 0.004], [0.45, 1.1, 0.85], 8, 6)
  }
  if (kind === "rifleman") {
    b.sph(0.128, P.helmet, [0, 0.2, 0.012], [1, 0.92, 1.08], 12, 6, Math.PI * 0.5)
    b.box(0.012, 0.03, 0.12, P.dark, [-0.127, 0.2, 0]); b.box(0.012, 0.03, 0.12, P.dark, [0.127, 0.2, 0])
    b.box(0.05, 0.045, 0.025, P.dark, [0, 0.235, -0.137])
    b.box(0.16, 0.045, 0.04, P.dark, [0, 0.268, -0.108], [-0.55, 0, 0])
    b.box(0.055, 0.03, 0.008, 0x8fc2d8, [-0.04, 0.272, -0.13], [-0.55, 0, 0], 0.45)
    b.box(0.055, 0.03, 0.008, 0x8fc2d8, [0.04, 0.272, -0.13], [-0.55, 0, 0], 0.45)
    b.cyl(0.042, 0.042, 0.035, P.dark, [-0.112, 0.162, 0], [0, 0, Math.PI / 2], 8)
    b.cyl(0.042, 0.042, 0.035, P.dark, [0.112, 0.162, 0], [0, 0, Math.PI / 2], 8)
    b.cyl(0.07, 0.074, 0.075, P.accent, [0, 0.065, -0.005])
  } else if (kind === "scout") {
    b.box(0.124, 0.036, 0.03, P.skin, [0, 0.186, -0.097])
    b.cyl(0.109, 0.114, 0.075, P.helmet, [0, 0.245, 0], undefined, 10)
    b.cyl(0.1, 0.109, 0.022, P.helmet, [0, 0.293, 0], undefined, 10)
    b.box(0.13, 0.012, 0.08, P.helmet, [0, 0.224, -0.135], [0.14, 0, 0])
    b.cyl(0.066, 0.07, 0.07, P.accent, [0, 0.065, -0.005])
  } else if (kind === "heavy") {
    b.sph(0.14, P.helmet, [0, 0.185, 0.008], [1, 1.04, 1.1], 12, 8)
    b.box(0.19, 0.075, 0.03, 0x1d4a57, [0, 0.178, -0.143], [0.06, 0, 0], 1.1)
    b.box(0.215, 0.022, 0.04, P.dark, [0, 0.222, -0.14])
    b.box(0.215, 0.018, 0.04, P.dark, [0, 0.135, -0.138])
    b.box(0.17, 0.06, 0.07, P.gear, [0, 0.1, -0.105])
    b.box(0.03, 0.035, 0.22, P.gear, [0, 0.335, 0])
    b.box(0.03, 0.03, 0.06, P.dark, [0.145, 0.22, -0.03])
    b.box(0.08, 0.02, 0.006, P.accent, [0, 0.27, 0.152], [0.35, 0, 0])
  } else {
    b.box(0.15, 0.06, 0.02, 0x3a3b2e, [0, 0.118, -0.104])
    b.sph(0.135, GHILLIE[0], [0, 0.204, 0.034], [1.06, 1.08, 1.12], 10, 7, Math.PI * 0.55)
    b.box(0.2, 0.03, 0.08, GHILLIE[1], [0, 0.268, -0.112], [0.25, 0, 0])
    for (let i = 0; i < 6; i++) b.box(0.04, 0.15, 0.012, GHILLIE[(i + 2) % 4], [-0.1 + i * 0.04, 0.2, 0.15], [-0.4, 0, (i - 2.5) * 0.12])
  }
  return b.build()
}

function buildUpperArm(kind: EnemyKind, side: -1 | 1): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), t = kind === "heavy" ? 1.15 : 1
  b.sph(0.064 * t, P.fabric, [0, -0.015, 0])
  b.loft([{ y: 0.0, w: 0.059 * t, d: 0.058 * t }, { y: -0.06, w: 0.061 * t, d: 0.057 * t }, { y: -0.15, w: 0.054 * t, d: 0.052 * t, z: -0.003 }, { y: -0.25, w: 0.048 * t, d: 0.047 * t }, { y: -0.3, w: 0.046 * t, d: 0.046 * t }],
    P.fabric, 16, { deform: (a, y) => (y < -0.22 ? 0.004 * Math.sin(a * 4 + y * 140) : 0.0015 * Math.sin(a * 7 + y * 50)) })
  if (kind !== "scout") b.box(0.06, 0.07, 0.025, P.pads, [0, -0.285, 0.05])
  if (kind === "rifleman") b.box(0.012, 0.05, 0.07, side < 0 ? 0x6d6448 : P.accent, [side * 0.057, -0.08, 0])
  if (kind === "heavy") {
    b.box(0.15, 0.09, 0.17, P.gear, [side * 0.03, -0.01, 0], [0, 0, side * 0.35])
    if (side < 0) b.box(0.152, 0.022, 0.172, P.accent, [side * 0.037, 0.015, 0], [0, 0, side * 0.35])
    b.box(0.13, 0.08, 0.14, P.gear, [side * 0.02, -0.09, 0], [0, 0, side * 0.2])
  }
  if (kind === "marksman") for (let i = 0; i < 4; i++) b.box(0.012, 0.15, 0.04, GHILLIE[i % 4], [side * 0.062, -0.06 - i * 0.02, -0.05 + i * 0.035], [0, 0, side * 0.1])
  return b.build()
}

function buildForearm(kind: EnemyKind, side: -1 | 1): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), t = kind === "heavy" ? 1.12 : 1
  b.loft([{ y: 0.01, w: 0.048 * t, d: 0.047 * t }, { y: -0.07, w: 0.05 * t, d: 0.048 * t }, { y: -0.17, w: 0.043 * t, d: 0.041 * t }, { y: -0.232, w: 0.041 * t, d: 0.04 * t }],
    P.fabric, 16, { deform: (a, y) => (y > -0.1 ? 0.004 * Math.sin(a * 5 + y * 120) : 0) })
  b.loft([{ y: -0.222, w: 0.044, d: 0.043 }, { y: -0.245, w: 0.043, d: 0.042 }, { y: -0.262, w: 0.038, d: 0.034 }], P.gloves, 14)
  b.glove(-0.26, P.gloves, side)
  if (kind === "heavy") b.box(0.085, 0.16, 0.075, P.gear, [0, -0.12, 0])
  return b.build()
}

function buildThigh(kind: EnemyKind, side: -1 | 1): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), t = kind === "heavy" ? 1.1 : 1
  b.loft([{ y: 0.0, w: 0.082 * t, d: 0.08 * t }, { y: -0.1, w: 0.08 * t, d: 0.079 * t, z: -0.004 }, { y: -0.25, w: 0.07 * t, d: 0.068 * t }, { y: -0.38, w: 0.063 * t, d: 0.062 * t }, { y: -0.435, w: 0.06 * t, d: 0.06 * t }],
    P.pants, 18, { deform: (a, y) => 0.003 * Math.sin(a * 5 + y * 52) + (y < -0.36 ? 0.004 * Math.sin(a * 3 + y * 150) : 0) })
  b.box(0.035, 0.11, 0.09, P.pouch, [side * 0.074 * t, -0.2, 0])
  if (kind === "rifleman" && side > 0) {
    b.box(0.045, 0.15, 0.075, P.strap, [0.088, -0.13, 0])
    b.box(0.03, 0.07, 0.035, P.dark, [0.092, -0.03, 0.012])
  }
  if (kind === "heavy") {
    b.box(0.15, 0.17, 0.035, P.gear, [side * 0.01, -0.09, -0.085], [0.15, 0, 0])
    b.box(0.035, 0.17, 0.12, P.gear, [side * 0.09, -0.1, 0])
  }
  if (kind === "marksman") for (let i = 0; i < 3; i++) b.box(0.012, 0.16, 0.045, GHILLIE[(i + 1) % 4], [side * 0.08, -0.08 - i * 0.03, -0.04 + i * 0.04], [0, 0, side * 0.08])
  return b.build()
}

function buildShin(kind: EnemyKind, side: -1 | 1): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), t = kind === "heavy" ? 1.1 : 1
  b.loft([{ y: 0.0, w: 0.06 * t, d: 0.06 * t }, { y: -0.12, w: 0.058 * t, d: 0.062 * t, z: 0.006 }, { y: -0.26, w: 0.05 * t, d: 0.05 * t }, { y: -0.335, w: 0.05 * t, d: 0.05 * t }],
    P.pants, 16, { deform: (a, y) => 0.0026 * Math.sin(a * 6 + y * 60) + (y < -0.27 ? 0.004 * Math.sin(a * 4 + y * 200) : 0) })
  b.box(kind === "scout" ? 0.075 : 0.09, 0.1, 0.035, P.pads, [0, -0.025, -0.066], [-0.1, 0, 0])
  b.cyl(0.054 * t, 0.056 * t, 0.1, P.boots, [0, -0.37, 0])
  if (kind === "heavy") b.box(0.09, 0.22, 0.03, P.gear, [0, -0.2, -0.058])
  void side
  return b.build()
}

function buildBoot(kind: EnemyKind): THREE.BufferGeometry {
  const P = PAL[kind], b = new Parts(), t = kind === "heavy" ? 1.08 : 1
  b.box(0.1 * t, 0.08, 0.2, P.boots, [0, -0.038, -0.03])
  b.sph(0.05 * t, P.boots, [0, -0.045, -0.13], [1, 0.75, 1.15], 12, 8)
  b.box(0.106 * t, 0.022, 0.255, P.dark, [0, -0.079, -0.052])
  for (let i = 0; i < 6; i++) b.hard(0.104 * t, 0.006, 0.012, 0x0c0c0b, [0, -0.0905, -0.16 + i * 0.044])
  for (let i = 0; i < 4; i++) b.hard(0.05, 0.006, 0.008, 0x3a3a34, [0, 0.0 - i * 0.014, -0.085 + i * 0.012], [0.5, 0, 0])
  b.box(0.104 * t, 0.025, 0.07, P.dark, [0, -0.06, -0.165], [0.35, 0, 0])
  return b.build()
}

// ------------------------------------------------------------------ weapons (gun space: origin = right-hand grip, -Z = muzzle)

export interface GunSpec {
  geo: THREE.BufferGeometry
  leftGrip: THREE.Vector3
  butt: THREE.Vector3
  muzzle: THREE.Vector3
  light: THREE.Vector3
  laser: THREE.Vector3 | null
  flashScale: number
  /** Recoil kick (radians of muzzle climb per shot). */
  kick: number
}

function buildGun(weapon: EnemyWeapon, P: Palette): GunSpec {
  const b = new Parts(), M = P.gunMetal, A = P.gunAccent, D = 0x111214
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  if (weapon === "rifle") {
    b.box(0.05, 0.075, 0.3, M, [0, 0.065, -0.07])
    b.box(0.056, 0.062, 0.3, 0x2c2e30, [0, 0.065, -0.36])
    b.cyl(0.011, 0.011, 0.17, M, [0, 0.065, -0.59], [Math.PI / 2, 0, 0], 6)
    b.cyl(0.016, 0.016, 0.06, D, [0, 0.065, -0.68], [Math.PI / 2, 0, 0], 6)
    b.box(0.032, 0.17, 0.075, M, [0, -0.035, -0.13], [0.22, 0, 0])
    b.box(0.032, 0.1, 0.045, A, [0, -0.02, 0], [-0.3, 0, 0])
    b.box(0.04, 0.085, 0.22, A, [0, 0.045, 0.19])
    b.box(0.045, 0.11, 0.02, D, [0, 0.035, 0.305])
    b.box(0.035, 0.05, 0.1, M, [0, 0.125, -0.08])
    b.box(0.03, 0.035, 0.006, 0x7fb2cf, [0, 0.127, -0.132], undefined, 0.6)
    b.box(0.03, 0.08, 0.035, A, [0, 0.0, -0.36])
    b.cyl(0.017, 0.017, 0.09, M, [0.038, 0.065, -0.42], [Math.PI / 2, 0, 0], 7)
    // detail: top rail with teeth, curved lower magazine, handguard vents, front sight, trigger guard, buffer tube, charging handle
    b.hard(0.022, 0.01, 0.42, D, [0, 0.104, -0.27])
    for (let i = 0; i < 9; i++) b.hard(0.026, 0.006, 0.012, D, [0, 0.111, -0.1 - i * 0.045])
    b.box(0.03, 0.085, 0.068, M, [0, -0.12, -0.165], [0.5, 0, 0])
    for (const x of [-0.029, 0.029]) for (let i = 0; i < 3; i++) b.hard(0.004, 0.018, 0.04, D, [x, 0.065, -0.29 - i * 0.055])
    b.hard(0.01, 0.05, 0.012, D, [0, 0.12, -0.49]).hard(0.024, 0.012, 0.03, D, [0, 0.1, -0.49])
    b.hard(0.008, 0.006, 0.07, D, [0, -0.012, -0.045]).cyl(0.016, 0.016, 0.12, D, [0, 0.07, 0.1], [Math.PI / 2, 0, 0], 8)
    b.hard(0.03, 0.012, 0.02, D, [0, 0.1, 0.08])
    return { geo: b.build(), leftGrip: v(-0.005, 0.005, -0.35), butt: v(0, 0.04, 0.315), muzzle: v(0, 0.065, -0.71), light: v(0.038, 0.065, -0.468), laser: null, flashScale: 1, kick: 0.12 }
  }
  if (weapon === "smg") {
    b.box(0.045, 0.075, 0.24, M, [0, 0.06, -0.05])
    b.cyl(0.021, 0.021, 0.2, D, [0, 0.06, -0.27], [Math.PI / 2, 0, 0], 8)
    b.box(0.03, 0.16, 0.042, M, [0, -0.045, -0.09], [0.08, 0, 0])
    b.box(0.03, 0.095, 0.042, A, [0, -0.02, 0], [-0.3, 0, 0])
    b.box(0.01, 0.014, 0.2, M, [-0.019, 0.045, 0.14]); b.box(0.01, 0.014, 0.2, M, [0.019, 0.045, 0.14])
    b.box(0.05, 0.08, 0.014, D, [0, 0.035, 0.245])
    b.box(0.03, 0.035, 0.05, D, [0, 0.115, -0.05])
    b.box(0.025, 0.025, 0.004, 0xd06048, [0, 0.118, -0.077], undefined, 0.8)
    b.box(0.03, 0.065, 0.035, A, [0, 0.005, -0.17], [0.25, 0, 0])
    b.cyl(0.015, 0.015, 0.07, M, [0.034, 0.06, -0.19], [Math.PI / 2, 0, 0], 7)
    // detail: rail, cocking handle, barrel shroud holes, front sight, trigger guard
    b.hard(0.02, 0.008, 0.2, D, [0, 0.1, -0.06])
    for (let i = 0; i < 5; i++) b.hard(0.024, 0.005, 0.01, D, [0, 0.106, 0.02 - i * 0.04])
    b.hard(0.012, 0.014, 0.02, D, [-0.028, 0.08, -0.1])
    for (let i = 0; i < 4; i++) b.hard(0.044, 0.008, 0.014, D, [0, 0.06, -0.21 - i * 0.04])
    b.hard(0.008, 0.035, 0.008, D, [0, 0.095, -0.35]).hard(0.008, 0.006, 0.06, D, [0, -0.012, -0.04])
    return { geo: b.build(), leftGrip: v(-0.005, 0.0, -0.175), butt: v(0, 0.035, 0.25), muzzle: v(0, 0.06, -0.38), light: v(0.034, 0.06, -0.226), laser: null, flashScale: 0.7, kick: 0.09 }
  }
  if (weapon === "shotgun") {
    b.box(0.05, 0.08, 0.22, M, [0, 0.06, -0.04])
    b.cyl(0.015, 0.015, 0.52, M, [0, 0.082, -0.41], [Math.PI / 2, 0, 0], 7)
    b.cyl(0.015, 0.015, 0.4, D, [0, 0.046, -0.33], [Math.PI / 2, 0, 0], 7)
    b.box(0.056, 0.05, 0.16, A, [0, 0.046, -0.33])
    b.box(0.045, 0.09, 0.27, A, [0, 0.035, 0.19], [-0.06, 0, 0])
    b.box(0.034, 0.1, 0.045, A, [0, -0.02, 0], [-0.3, 0, 0])
    b.box(0.012, 0.045, 0.1, 0x8e2c1f, [0.031, 0.06, -0.04])
    b.box(0.05, 0.02, 0.04, D, [0, 0.105, -0.06])
    b.cyl(0.017, 0.017, 0.08, M, [0.038, 0.07, -0.5], [Math.PI / 2, 0, 0], 7)
    // detail: ribbed pump grooves, bead sight, receiver rail, side saddle with shells, trigger guard, barrel clamp
    for (let i = 0; i < 5; i++) b.hard(0.058, 0.006, 0.01, D, [0, 0.072, -0.27 - i * 0.03])
    b.sph(0.006, 0xd8d0b0, [0, 0.1, -0.665]).hard(0.022, 0.01, 0.14, D, [0, 0.105, -0.05])
    b.box(0.014, 0.05, 0.1, D, [-0.032, 0.055, -0.03])
    for (let i = 0; i < 4; i++) b.cyl(0.0085, 0.0085, 0.045, 0x9a2a1e, [-0.041, 0.06, -0.07 + i * 0.024], undefined, 6)
    b.hard(0.008, 0.006, 0.07, D, [0, -0.012, -0.03]).hard(0.036, 0.022, 0.02, D, [0, 0.064, -0.6])
    return { geo: b.build(), leftGrip: v(-0.005, 0.02, -0.33), butt: v(0, 0.025, 0.335), muzzle: v(0, 0.082, -0.68), light: v(0.038, 0.07, -0.542), laser: null, flashScale: 1.45, kick: 0.22 }
  }
  // sniper (marksman)
  b.box(0.05, 0.075, 0.3, M, [0, 0.065, -0.05])
  b.box(0.056, 0.062, 0.32, M, [0, 0.065, -0.36])
  b.cyl(0.012, 0.012, 0.44, D, [0, 0.065, -0.74], [Math.PI / 2, 0, 0], 6)
  b.cyl(0.019, 0.019, 0.07, D, [0, 0.065, -0.98], [Math.PI / 2, 0, 0], 6)
  b.cyl(0.02, 0.02, 0.3, D, [0, 0.135, -0.07], [Math.PI / 2, 0, 0], 8)
  b.cyl(0.022, 0.033, 0.07, D, [0, 0.135, -0.25], [Math.PI / 2, 0, 0], 8)
  b.cyl(0.025, 0.025, 0.05, D, [0, 0.135, 0.1], [Math.PI / 2, 0, 0], 8)
  b.box(0.044, 0.044, 0.006, 0x6aa3c4, [0, 0.135, -0.288], undefined, 0.9)
  b.box(0.02, 0.04, 0.03, D, [0, 0.105, -0.13]); b.box(0.02, 0.04, 0.03, D, [0, 0.105, 0.02])
  b.box(0.035, 0.09, 0.08, M, [0, -0.015, -0.1])
  b.box(0.045, 0.1, 0.3, A, [0, 0.035, 0.21])
  b.box(0.04, 0.03, 0.12, A, [0, 0.095, 0.17])
  b.box(0.034, 0.1, 0.045, A, [0, -0.02, 0], [-0.3, 0, 0])
  b.box(0.01, 0.01, 0.16, D, [-0.015, 0.02, -0.42], [0.08, 0, 0]); b.box(0.01, 0.01, 0.16, D, [0.015, 0.02, -0.42], [0.08, 0, 0])
  b.box(0.03, 0.03, 0.07, D, [-0.044, 0.065, -0.42])
  b.box(0.02, 0.02, 0.008, 0xff2a1a, [-0.044, 0.065, -0.457], undefined, 3)
  b.cyl(0.016, 0.016, 0.07, M, [0.04, 0.065, -0.47], [Math.PI / 2, 0, 0], 7)
  // detail: scope turrets and lens rings, bolt handle, fluted barrel lines, magazine, cheek pad, muzzle brake ports
  b.cyl(0.011, 0.011, 0.025, D, [0, 0.165, -0.07], undefined, 8).cyl(0.011, 0.011, 0.025, D, [0.03, 0.135, -0.07], [0, 0, Math.PI / 2], 8)
  b.cyl(0.034, 0.034, 0.008, M, [0, 0.135, -0.29], [Math.PI / 2, 0, 0], 10).cyl(0.026, 0.026, 0.008, M, [0, 0.135, 0.125], [Math.PI / 2, 0, 0], 10)
  b.cyl(0.006, 0.006, 0.05, M, [0.04, 0.07, 0.02], [0, 0, Math.PI / 2], 6).sph(0.011, D, [0.066, 0.07, 0.02])
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) b.hard(0.003, 0.003, 0.3, M, [Math.cos(a) * 0.012, 0.065 + Math.sin(a) * 0.012, -0.72])
  b.box(0.03, 0.07, 0.07, D, [0, -0.045, -0.12]).box(0.04, 0.025, 0.1, D, [0, 0.112, 0.2])
  for (const x of [-0.02, 0.02]) b.hard(0.004, 0.012, 0.03, 0x050505, [x, 0.065, -0.985])
  return { geo: b.build(), leftGrip: v(-0.005, 0.0, -0.31), butt: v(0, 0.03, 0.36), muzzle: v(0, 0.065, -1.02), light: v(0.04, 0.065, -0.507), laser: v(-0.044, 0.065, -0.462), flashScale: 1.5, kick: 0.2 }
}

// ------------------------------------------------------------------ shared assets

interface KindAssets {
  pelvis: THREE.BufferGeometry; chest: THREE.BufferGeometry; head: THREE.BufferGeometry
  upperArm: [THREE.BufferGeometry, THREE.BufferGeometry]; forearm: [THREE.BufferGeometry, THREE.BufferGeometry]
  thigh: [THREE.BufferGeometry, THREE.BufferGeometry]; shin: [THREE.BufferGeometry, THREE.BufferGeometry]; boot: THREE.BufferGeometry
  gun: GunSpec
  scale: number
  /** Distance from the chest bone axis to its back / front surface (corpse rest height when lying). */
  liftBack: number; liftFront: number
}

export interface SoldierAssets {
  kinds: Record<EnemyKind, KindAssets>
  baseMaterial: THREE.MeshStandardMaterial
  flashGeo: THREE.BufferGeometry; flashMat: THREE.MeshBasicMaterial
  coneGeo: THREE.BufferGeometry; coneMat: THREE.ShaderMaterial
  lensGeo: THREE.BufferGeometry; lensMat: THREE.MeshBasicMaterial
  laserGeo: THREE.BufferGeometry; laserMat: THREE.MeshBasicMaterial; dotMat: THREE.SpriteMaterial
  /** Wound cap shown at the joint of a severed part (shared, only drawn once something is gone). */
  stumpGeo: THREE.BufferGeometry; stumpMat: THREE.MeshStandardMaterial
  markMats: { "?": THREE.SpriteMaterial; "!": THREE.SpriteMaterial }
  textures: THREE.Texture[]
}

let shared: SoldierAssets | null = null
let refs = 0

export function acquireSoldierAssets(): SoldierAssets {
  refs++
  if (!shared) shared = buildAssets()
  return shared
}

export function releaseSoldierAssets(): void {
  refs = Math.max(0, refs - 1)
  if (refs > 0 || !shared) return
  const a = shared; shared = null
  for (const k of Object.values(a.kinds)) {
    for (const g of [k.pelvis, k.chest, k.head, k.boot, k.gun.geo, ...k.upperArm, ...k.forearm, ...k.thigh, ...k.shin]) g.dispose()
  }
  for (const g of [a.flashGeo, a.coneGeo, a.lensGeo, a.laserGeo, a.stumpGeo]) g.dispose()
  for (const m of [a.baseMaterial, a.stumpMat, a.flashMat, a.coneMat, a.lensMat, a.laserMat, a.dotMat, a.markMats["?"], a.markMats["!"]]) m.dispose()
  for (const t of a.textures) t.dispose()
}

function buildAssets(): SoldierAssets {
  const kinds = {} as Record<EnemyKind, KindAssets>
  for (const kind of ["scout", "rifleman", "heavy", "marksman"] as EnemyKind[]) {
    classifySoldier(PAL[kind])
    const chest = buildChest(kind), scale = KIND_SCALE[kind], bb = chest.boundingBox!
    kinds[kind] = {
      pelvis: buildPelvis(kind), chest, head: buildHead(kind),
      upperArm: [buildUpperArm(kind, -1), buildUpperArm(kind, 1)], forearm: [buildForearm(kind, -1), buildForearm(kind, 1)],
      thigh: [buildThigh(kind, -1), buildThigh(kind, 1)], shin: [buildShin(kind, -1), buildShin(kind, 1)], boot: buildBoot(kind),
      gun: buildGun(ENEMIES[kind].weapon, PAL[kind]), scale,
      liftBack: bb.max.z * scale, liftFront: -bb.min.z * scale,
    }
  }
  const baseMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 })
  // additive + double-sided: order does not matter, so one pass is enough (saves a draw call per effect)
  const flashMat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, forceSinglePass: true })
  // weapon-light beam: additive, brightest along the axis and where the surface faces the viewer (soft edges).
  // The shader writes display values directly (additive blending happens after sRGB encoding).
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 0.96, 0.86) }, uIntensity: { value: 0.2 } },
    vertexShader: "attribute float fade; varying float vFade; varying vec3 vN; varying vec3 vV;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vFade = fade; gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uIntensity; varying float vFade; varying vec3 vN; varying vec3 vV;\nvoid main(){ float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor * vFade * f * f * uIntensity, 1.0); }",
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  })
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2414, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, fog: false })
  const glowTex = makeTexture(64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  })
  const dotMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
  // flashlight lens glare: a front-facing quad (single-sided, so only visible from in front of the weapon)
  const lensMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff0d2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false })
  const mark = (ch: string, color: string) => makeTexture(64, ctx => {
    ctx.font = "900 54px Arial, Helvetica, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.lineWidth = 9; ctx.strokeStyle = "rgba(10,10,10,0.9)"; ctx.strokeText(ch, 32, 35)
    ctx.fillStyle = color; ctx.fillText(ch, 32, 35)
  })
  const qTex = mark("?", "#ffb02e"), exTex = mark("!", "#ff3b2f")
  const spriteMat = (map: THREE.Texture) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, fog: false })
  return {
    kinds, baseMaterial,
    flashGeo: buildFlashGeo(), flashMat,
    coneGeo: buildConeGeo(), coneMat,
    lensGeo: new THREE.PlaneGeometry(0.24, 0.24).rotateY(Math.PI), lensMat,
    laserGeo: new THREE.CylinderGeometry(0.004, 0.012, 1, 5, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), laserMat, dotMat,
    stumpGeo: buildStumpGeo(),
    stumpMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, emissive: 0x200000 }),
    markMats: { "?": spriteMat(qTex), "!": spriteMat(exTex) },
    textures: [glowTex, qTex, exTex],
  }
}

function makeTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  if (typeof document === "undefined") {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t
  }
  const c = document.createElement("canvas"); c.width = c.height = size
  const ctx = c.getContext("2d")
  if (ctx) draw(ctx)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Wound cap: a wet red dome with a dark rim and a pale bone stub in the middle (local +Y points out of the body). */
function buildStumpGeo(): THREE.BufferGeometry {
  const b = new Parts()
  b.sph(0.075, 0x6e0b07, [0, 0, 0], [1, 0.55, 1], 10, 5, Math.PI * 0.5)
  b.cyl(0.078, 0.078, 0.025, 0x2e0403, [0, -0.005, 0], undefined, 10)
  b.cyl(0.018, 0.022, 0.05, 0xd9cfb8, [0.008, 0.035, 0.004], undefined, 6)
  return b.build()
}

/** Three crossed diamonds along -Z plus a front star, vertex colours fading to black (additive). */
function buildFlashGeo(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = []
  const core = [1, 0.9, 0.6], mid = [0.95, 0.55, 0.16], tip = [0.35, 0.12, 0.02], none = [0, 0, 0]
  const tri = (a: number[], ca: number[], b: number[], cb: number[], c: number[], cc: number[]) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc) }
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, ux = Math.cos(a) * 0.075, uy = Math.sin(a) * 0.075
    const back = [0, 0, 0.02], l = [ux, uy, -0.08], r = [-ux, -uy, -0.08], t = [0, 0, -0.34]
    tri(back, core, l, mid, t, tip); tri(back, core, t, tip, r, mid)
  }
  for (let i = 0; i < 6; i++) {
    const a0 = i / 6 * TAU, a1 = (i + 0.5) / 6 * TAU, a2 = (i + 1) / 6 * TAU
    const p0 = [Math.cos(a0) * 0.05, Math.sin(a0) * 0.05, -0.01], p1 = [Math.cos(a1) * 0.13, Math.sin(a1) * 0.13, -0.03], p2 = [Math.cos(a2) * 0.05, Math.sin(a2) * 0.05, -0.01]
    tri([0, 0, -0.01], core, p0, mid, p1, none); tri([0, 0, -0.01], core, p1, none, p2, mid)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
  g.computeBoundingSphere()
  return g
}

/** Open cone with its apex at the origin pointing along -Z (9 m), brightness fading toward the far end (additive). */
const CONE_LENGTH = 9
function buildConeGeo(): THREE.BufferGeometry {
  const len = CONE_LENGTH
  // ConeGeometry has its apex at +Y; rotateX(+90°) puts it at +len/2 on Z, the shift moves it to the origin
  const g = new THREE.ConeGeometry(1.5, len, 16, 4, true).rotateX(Math.PI / 2).translate(0, 0, -len / 2)
  const p = g.attributes.position, fade = new Float32Array(p.count)
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, -p.getZ(i) / len)); fade[i] = Math.pow(1 - t, 2) }
  g.setAttribute("fade", new THREE.BufferAttribute(fade, 1))
  g.deleteAttribute("uv")
  g.computeBoundingSphere()
  return g
}

// ------------------------------------------------------------------ IK + math helpers (allocation-free)

const _d = new THREE.Vector3(), _perp = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3()
const _el = new THREE.Vector3(), _tc = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3()
const _m = new THREE.Matrix4()

function basisQuat(xAxis: THREE.Vector3, boneDir: THREE.Vector3, out: THREE.Quaternion): void {
  _y.copy(boneDir).negate()
  _z.crossVectors(xAxis, _y).normalize()
  _x.crossVectors(_y, _z)
  _m.makeBasis(_x, _y, _z)
  out.setFromRotationMatrix(_m)
}

/**
 * Two-bone IK in the parent space of the first joint. Bones point along -Y in their rest pose; the hinge is local X.
 * sign = +1 for arms (pole = where the elbow points), -1 for legs (pole = where the knee points).
 * Writes parent-space rotations of bone A and bone B.
 */
export function solveTwoBone(s: THREE.Vector3, t: THREE.Vector3, pole: THREE.Vector3, a: number, b: number, sign: number, qa: THREE.Quaternion, qb: THREE.Quaternion): void {
  _d.subVectors(t, s)
  let c = _d.length()
  if (c < 1e-6) { _d.set(0, -1, 0); c = 1e-6 } else _d.divideScalar(c)
  c = Math.min(Math.max(c, Math.abs(a - b) + 1e-3), a + b - 1e-4)
  const cosA = Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c))), sinA = Math.sqrt(1 - cosA * cosA)
  _perp.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_perp.lengthSq() < 1e-8) { _perp.set(0, 0, sign > 0 ? 1 : -1).addScaledVector(_d, -_d.z * (sign > 0 ? 1 : -1)) }
  _perp.normalize()
  _el.copy(s).addScaledVector(_d, a * cosA).addScaledVector(_perp, a * sinA)
  _tc.copy(s).addScaledVector(_d, c)
  _u.subVectors(_el, s).normalize()
  _f.subVectors(_tc, _el).normalize()
  _n.crossVectors(_d, _perp).multiplyScalar(-sign).normalize()
  basisQuat(_n, _u, qa)
  basisQuat(_n, _f, qb)
}

/** Head hits below this fraction of the head radius under its centre are the throat (torso). */
const JAW = 0.55
/** Neck capsule radius (unscaled). */
const NECK_R = 0.065
/** Distance from p to the segment a→b. */
function segDist(p: Vec3, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz
  let t = l2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
const smoothstep = (a: number, b: number, v: number) => smooth((v - a) / (b - a))
const ease = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)
const wrap = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI }

// weapon poses in the aim frame (chest joint): butt position + Euler (YXZ: yaw, pitch, roll)
interface GunPose { butt: THREE.Vector3; q: THREE.Quaternion }
const pose = (x: number, y: number, z: number, pitch: number, yaw: number, roll: number): GunPose =>
  ({ butt: new THREE.Vector3(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ")) })
const POSE_AIM = pose(0.125, 0.215, -0.06, 0, 0, 0)
const POSE_READY = pose(0.14, 0.12, -0.07, -0.6, 0.18, 0.05)
const POSE_CARRY = pose(0.15, 0.02, -0.17, 0.55, 0.8, 0.55)
const POSE_SLING = pose(0.14, 0.07, -0.14, -1.05, 0.3, 0.12)
const POLE_R = new THREE.Vector3(0.75, -0.65, 0.3).normalize()
const POLE_L = new THREE.Vector3(-0.7, -0.75, 0.05).normalize()
const POLE_KNEE = new THREE.Vector3(0, 0, -1)

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion()
const _qi = new THREE.Quaternion(), _qp = new THREE.Quaternion()
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _pole = new THREE.Vector3()
const _e = new THREE.Euler(), _e2 = new THREE.Euler(), _qf = new THREE.Quaternion()
const _gunPos = new THREE.Vector3(), _gunQ = new THREE.Quaternion()

// ------------------------------------------------------------------ the model

export interface SoldierDrive {
  /** World-space velocity (m/s). */
  velX: number; velZ: number
  /** Body yaw (the owning group's rotation.y). */
  yaw: number
  /** Body yaw rate (rad/s) — drives the turn-in-place shuffle. */
  turnRate: number
  /** 0 standing … 1 crouched. */
  crouch: number
  /** 0 lowered … 1 shouldered and aimed. */
  aim: number
  /** World yaw and pitch (+ up) of the aim / look target. */
  aimYaw: number; aimPitch: number
  /** Extra head yaw (looking around). */
  look: number
  /** 0 relaxed patrol (left hand off the weapon while walking) … 1 tactical. */
  alert: number
}

export function makeDrive(): SoldierDrive { return { velX: 0, velZ: 0, yaw: 0, turnRate: 0, crouch: 0, aim: 0, aimYaw: 0, aimPitch: 0, look: 0, alert: 0 } }

type Joint = THREE.Object3D
interface DeathPose { q: THREE.Quaternion[]; buckle: THREE.Quaternion[]; pelvisZ: number; spineZ: number }

export class SoldierModel {
  readonly root = new THREE.Group()
  readonly material: THREE.MeshStandardMaterial
  readonly scale: number
  readonly zones: { head: number; torso: number; arm: number; thigh: number; shin: number }
  /** Called at each foot plant while walking/running. */
  onStep: (() => void) | null = null
  // posed world points (valid after capture())
  readonly head = new THREE.Vector3(); readonly neckBase = new THREE.Vector3(); readonly pelvisPos = new THREE.Vector3()
  readonly chestPos = new THREE.Vector3(); readonly muzzle = new THREE.Vector3()
  readonly shoulderLPos = new THREE.Vector3(); readonly shoulderRPos = new THREE.Vector3()
  readonly elbowLPos = new THREE.Vector3(); readonly elbowRPos = new THREE.Vector3()
  readonly hipLPos = new THREE.Vector3(); readonly hipRPos = new THREE.Vector3()
  readonly kneeLPos = new THREE.Vector3(); readonly kneeRPos = new THREE.Vector3()
  readonly ankleLPos = new THREE.Vector3(); readonly ankleRPos = new THREE.Vector3()
  readonly handLPos = new THREE.Vector3(); readonly handRPos = new THREE.Vector3()
  readonly neckLow = new THREE.Vector3(); readonly neckTop = new THREE.Vector3(); readonly headUp = new THREE.Vector3(0, 1, 0)
  /** Gore groups: local origin is the joint (neck, chest, shoulder, hip). */
  readonly parts: Record<BodyPartId, THREE.Object3D>
  /** Severed parts (the owner's GoreBody.severed): ignored by hit tests and the corpse ground fit. */
  severed: ReadonlySet<string> = new Set<string>()
  private stumps: Partial<Record<BodyPartId, THREE.Mesh>> = {}
  dead = false
  settled = false

  private uniforms = { uFlash: { value: 0 }, uGlow: { value: 1 } }
  private gunSpec: GunSpec
  private kindAssets: KindAssets
  private pelvis: Joint; private spine: Joint; private chestJoint: Joint; private chest: Joint; private neck: Joint
  private shoulderL: Joint; private shoulderR: Joint; private elbowL: Joint; private elbowR: Joint
  private hipL: Joint; private hipR: Joint; private kneeL: Joint; private kneeR: Joint; private ankleL: Joint; private ankleR: Joint
  private gun: THREE.Mesh
  private flash: THREE.Mesh; private lens: THREE.Mesh; private cone: THREE.Mesh
  private laser: THREE.Mesh | null = null; private laserDot: THREE.Sprite | null = null
  private indicator: THREE.Sprite
  private assets: SoldierAssets
  private joints: Joint[]

  private time = 0
  private crouchW = 0; private aimW = 0; private alertW = 0; private runW = 0
  private speed = 0; private dirX = 0; private dirZ = -1; private turn = 0
  private phase = 0
  private recoil = 0; private flashT = 0; private shots = 0
  private flinchX = 0; private flinchZ = 0
  private mark: "" | "?" | "!" = ""
  // death
  private deathT = 0; private fallBack = true; private spin = 0; private lift = 0
  private deathStart: THREE.Quaternion[] = []
  private deathPose: DeathPose | null = null
  private pelvisStartY = 0
  private gunVel = new THREE.Vector3(); private gunRest = new THREE.Quaternion(); private gunDropped = false

  constructor(readonly kind: EnemyKind, assets: SoldierAssets, private seed = 0) {
    this.assets = assets
    const k = this.kindAssets = assets.kinds[kind]
    this.gunSpec = k.gun
    this.scale = k.scale
    this.zones = ZONES[kind]
    const u = this.uniforms
    this.material = assets.baseMaterial.clone()
    this.material.onBeforeCompile = shader => {
      shader.uniforms.uFlash = u.uFlash; shader.uniforms.uGlow = u.uGlow
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;")
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uFlash;\nuniform float uGlow;\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow + vec3(0.36, 0.06, 0.035) * uFlash * uFlash;")
    }
    this.material.customProgramCacheKey = () => "iv-soldier-1"
    withSurface(this.material, { scale: 26, bump: 0.0016, grime: 0.4, mottle: 0.22, wear: 0.55, weave: 0.8, rough: 0.15, camo: kind === "heavy" ? 0 : 0.85, type: SURF.fabric })

    const mesh = (geo: THREE.BufferGeometry, name: string) => {
      const m = new THREE.Mesh(geo, this.material); m.name = name; m.castShadow = true; m.receiveShadow = true; return m
    }
    const group = (name: string) => { const g = new THREE.Group(); g.name = name; return g }
    this.root.name = `Soldat_${kind}`
    this.root.scale.setScalar(this.scale)
    this.pelvis = mesh(k.pelvis, "pelvis"); this.pelvis.position.y = RIG.pelvisY; this.root.add(this.pelvis)
    this.spine = group("spine"); this.spine.position.y = RIG.spine; this.pelvis.add(this.spine)
    this.chestJoint = group("aim"); this.chestJoint.position.y = RIG.chest; this.spine.add(this.chestJoint)
    this.chest = mesh(k.chest, "chest"); this.chestJoint.add(this.chest)
    this.neck = mesh(k.head, "head"); this.neck.position.y = RIG.neck; this.chest.add(this.neck)
    this.shoulderL = mesh(k.upperArm[0], "upperArmL"); this.shoulderL.position.set(-RIG.shoulderX, RIG.shoulderY, 0); this.chest.add(this.shoulderL)
    this.shoulderR = mesh(k.upperArm[1], "upperArmR"); this.shoulderR.position.set(RIG.shoulderX, RIG.shoulderY, 0); this.chest.add(this.shoulderR)
    this.elbowL = mesh(k.forearm[0], "forearmL"); this.elbowL.position.y = -RIG.upperArm; this.shoulderL.add(this.elbowL)
    this.elbowR = mesh(k.forearm[1], "forearmR"); this.elbowR.position.y = -RIG.upperArm; this.shoulderR.add(this.elbowR)
    this.hipL = mesh(k.thigh[0], "thighL"); this.hipL.position.set(-RIG.hipX, RIG.hipY, 0); this.pelvis.add(this.hipL)
    this.hipR = mesh(k.thigh[1], "thighR"); this.hipR.position.set(RIG.hipX, RIG.hipY, 0); this.pelvis.add(this.hipR)
    this.kneeL = mesh(k.shin[0], "shinL"); this.kneeL.position.y = -RIG.thigh; this.hipL.add(this.kneeL)
    this.kneeR = mesh(k.shin[1], "shinR"); this.kneeR.position.y = -RIG.thigh; this.hipR.add(this.kneeR)
    this.ankleL = mesh(k.boot, "bootL"); this.ankleL.position.y = -RIG.shin; this.kneeL.add(this.ankleL)
    this.ankleR = mesh(k.boot, "bootR"); this.ankleR.position.y = -RIG.shin; this.kneeR.add(this.ankleR)
    this.gun = mesh(k.gun.geo, "weapon"); this.chestJoint.add(this.gun)

    this.flash = new THREE.Mesh(assets.flashGeo, assets.flashMat); this.flash.name = "muzzleFlash"
    this.flash.position.copy(k.gun.muzzle); this.flash.scale.setScalar(k.gun.flashScale); this.flash.visible = false; this.flash.renderOrder = 5
    this.gun.add(this.flash)
    this.lens = new THREE.Mesh(assets.lensGeo, assets.lensMat); this.lens.position.copy(k.gun.light).add(_v1.set(0, 0, -0.002)); this.lens.visible = false; this.lens.name = "lightLens"
    this.cone = new THREE.Mesh(assets.coneGeo, assets.coneMat); this.cone.position.copy(k.gun.light); this.cone.visible = false; this.cone.renderOrder = 4; this.cone.name = "lightCone"
    this.gun.add(this.lens, this.cone)
    if (k.gun.laser) {
      this.laser = new THREE.Mesh(assets.laserGeo, assets.laserMat); this.laser.position.copy(k.gun.laser); this.laser.visible = false; this.laser.renderOrder = 4; this.laser.name = "laser"
      this.laserDot = new THREE.Sprite(assets.dotMat); this.laserDot.position.copy(k.gun.laser); this.laserDot.scale.setScalar(0.16); this.laserDot.visible = false
      this.gun.add(this.laser, this.laserDot)
    }
    this.indicator = new THREE.Sprite(assets.markMats["?"]); this.indicator.visible = false; this.indicator.renderOrder = 6
    this.indicator.position.set(0, 2.15, 0); this.root.add(this.indicator)

    this.joints = [this.pelvis, this.spine, this.chestJoint, this.chest, this.neck, this.shoulderL, this.shoulderR, this.elbowL, this.elbowR, this.hipL, this.hipR, this.kneeL, this.kneeR, this.ankleL, this.ankleR]
    this.parts = { head: this.neck, torso: this.chest, armL: this.shoulderL, armR: this.shoulderR, legL: this.hipL, legR: this.hipR }
    this.phase = (seed * 0.137) % 1
    this.time = seed * 1.7
  }

  // ---------------------------------------------------------------- live animation

  update(dt: number, d: SoldierDrive): void {
    if (this.dead) { this.updateDeath(dt); return }
    this.time += dt
    this.crouchW += (d.crouch - this.crouchW) * ease(dt, 5)
    this.aimW += (d.aim - this.aimW) * ease(dt, 7)
    this.alertW += (d.alert - this.alertW) * ease(dt, 3)
    // body-local velocity (x right, z back)
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw)
    const lx = d.velX * c - d.velZ * s, lz = d.velX * s + d.velZ * c, spd = Math.sqrt(lx * lx + lz * lz)
    this.speed += (spd - this.speed) * ease(dt, 9)
    if (spd > 0.08) {
      this.dirX += (lx / spd - this.dirX) * ease(dt, 10); this.dirZ += (lz / spd - this.dirZ) * ease(dt, 10)
      const l = Math.sqrt(this.dirX * this.dirX + this.dirZ * this.dirZ) || 1; this.dirX /= l; this.dirZ /= l
    }
    this.turn += (d.turnRate - this.turn) * ease(dt, 8)
    this.runW += (clamp((this.speed - 2.5) / 0.9, 0, 1) - this.runW) * ease(dt, 6)
    const crouch = this.crouchW, run = this.runW * (1 - crouch), aim = this.aimW

    // ---- gait
    const turnGait = this.speed < 0.45 ? clamp((Math.abs(this.turn) - 0.4) * 0.45, 0, 0.9) : 0
    const gaitSpeed = Math.max(this.speed, turnGait)
    const amp = smoothstep(0.05, 0.45, gaitSpeed)
    const stance = lerp(0.62, 0.36, run)
    const strideTarget = clamp(0.35 + 0.15 * gaitSpeed, 0.4, 0.78) * (1 - 0.4 * crouch)
    const freq = amp > 0.001 ? Math.max(1.05, gaitSpeed * stance / strideTarget) : 0
    const stride = freq > 0 ? Math.min(0.8, gaitSpeed * stance / freq) : 0
    const prev = this.phase
    this.phase = (this.phase + freq * dt) % 1
    if (freq > 0 && this.speed > 0.6 && this.onStep) {
      if (prev > this.phase) this.onStep()
      else if (prev < 0.5 && this.phase >= 0.5) this.onStep()
    }
    const ph = this.phase * TAU
    const idle = 1 - amp

    // ---- pelvis
    const sway = idle * Math.sin(this.time * 0.55 + this.seed) * 0.02 * (1 - crouch)
    const bob = amp * (1 - crouch) * lerp(0.016, -0.03, run) * Math.cos(2 * ph - stance * TAU)
    const pelvisY = lerp(RIG.pelvisY, RIG.crouchPelvisY, crouch) - amp * (1 - crouch) * lerp(0.035, 0.075, run) + bob + idle * Math.sin(this.time * 1.7 + this.seed) * 0.004
    const twist = amp * lerp(0.09, 0.14, run) * Math.sin(ph) * (1 - crouch * 0.7)
    this.pelvis.position.set(sway, pelvisY, crouch * 0.06)
    this.pelvis.rotation.set(0, twist, -sway * 1.6 + amp * 0.035 * Math.cos(ph) * (1 - crouch), "YXZ")

    // ---- upper body / aim tracking
    const yawRel = clamp(wrap(d.aimYaw - d.yaw), -1.25, 1.25)
    const track = lerp(0.45, 1, aim)
    const counter = twist * lerp(1.15, 1, aim)
    const lean = crouch * 0.38 + run * 0.2
    this.flinchX *= Math.exp(-7 * dt); this.flinchZ *= Math.exp(-7 * dt)
    this.spine.rotation.set(-lean + this.flinchZ * 0.32, yawRel * track - counter, -this.flinchX * 0.3, "YXZ")
    const pitchTarget = clamp(d.aimPitch, -0.9, 0.9) * lerp(0.35, 1, aim)
    this.recoil *= Math.exp(-13 * dt)
    this.chestJoint.rotation.set(pitchTarget + lean + this.recoil * 0.05, 0, 0)
    const breathe = Math.sin(this.time * 1.75 + this.seed) * 0.018 * (1 - run)
    const blade = -0.3 * aim
    this.chest.rotation.set(-lean * 0.8 - pitchTarget * 0.45 + breathe - this.recoil * 0.03, blade + run * Math.sin(ph) * 0.06 * (1 - aim), 0, "YXZ")
    const chestNetPitch = pitchTarget * 0.55 - lean * 0.8 + breathe
    const headPitch = clamp((d.aimPitch - chestNetPitch) * 0.9 - 0.14 * aim + this.flinchZ * 0.25, -0.75, 0.7)
    const headYaw = clamp(yawRel - (yawRel * track - counter) - blade - run * Math.sin(ph) * 0.06 * (1 - aim) + d.look, -1.25, 1.25)
    this.neck.rotation.set(headPitch, headYaw, -0.12 * aim - this.flinchX * 0.3, "YXZ")

    // ---- weapon pose (aim frame)
    const relaxed = (1 - this.alertW) * (1 - aim)
    if (this.gunDropped) {
      // no weapon (dropped after losing an arm): both arms swing free, bent like a sprinter
      const swing = Math.sin(ph) * lerp(0.4, 0.95, run) * amp
      this.shoulderR.quaternion.setFromEuler(_e.set(swing, 0, 0.14, "XYZ"))
      this.elbowR.quaternion.setFromEuler(_e.set(0.35 + run * 0.9 + Math.max(0, swing) * 0.3, 0, 0, "XYZ"))
      this.shoulderL.quaternion.setFromEuler(_e.set(-swing, 0, -0.14, "XYZ"))
      this.elbowL.quaternion.setFromEuler(_e.set(0.35 + run * 0.9 + Math.max(0, -swing) * 0.3, 0, 0, "XYZ"))
      this.updateDroppedGun(dt)
    } else {
      _gunPos.copy(POSE_READY.butt); _gunQ.copy(POSE_READY.q)
      const wCarry = run * (1 - aim) * (1 - relaxed)
      _gunPos.lerp(POSE_CARRY.butt, wCarry); _gunQ.slerp(POSE_CARRY.q, wCarry)
      const wSling = relaxed
      _gunPos.lerp(POSE_SLING.butt, wSling); _gunQ.slerp(POSE_SLING.q, wSling)
      _gunPos.lerp(POSE_AIM.butt, aim); _gunQ.slerp(POSE_AIM.q, aim)
      _gunPos.y += amp * 0.012 * Math.cos(2 * ph) * (1 - aim * 0.6) + breathe * 0.25
      _gunPos.x += amp * 0.012 * Math.sin(ph) * (1 - aim * 0.6)
      _gunQ.multiply(_q1.setFromAxisAngle(_v1.set(1, 0, 0), this.recoil * this.gunSpec.kick))
      _v2.set(0, 0, 1).applyQuaternion(_gunQ)
      _gunPos.addScaledVector(_v2, this.recoil * 0.045)
      // gun origin = butt − R·buttOffset
      this.gun.quaternion.copy(_gunQ)
      this.gun.position.copy(this.gunSpec.butt).applyQuaternion(_gunQ).negate().add(_gunPos)
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false }

      // ---- arms: IK onto the weapon (in chest-bone space)
      _qi.copy(this.chest.quaternion).invert()
      _v1.copy(this.gun.position).applyQuaternion(_qi)
      solveTwoBone(this.shoulderR.position, _v1, POLE_R, RIG.upperArm, RIG.forearm, 1, _q1, _q2)
      this.shoulderR.quaternion.copy(_q1)
      this.elbowR.quaternion.copy(_q1).invert().multiply(_q2)
      _v1.copy(this.gunSpec.leftGrip).applyQuaternion(this.gun.quaternion).add(this.gun.position).applyQuaternion(_qi)
      this.shoulderL.position.set(-RIG.shoulderX, RIG.shoulderY, -0.035 * aim)
      solveTwoBone(this.shoulderL.position, _v1, POLE_L, RIG.upperArm, RIG.forearm, 1, _q1, _q2)
      const leftW = 1 - relaxed * clamp(amp * 2.2, 0, 1)
      if (leftW < 0.999) {
        // free left arm swings against the left leg
        const swing = -Math.sin(ph) * 0.42 * amp
        _q3.setFromEuler(_e.set(swing, 0, -0.1, "XYZ"))
        _q4.setFromEuler(_e.set(0.2 + Math.max(0, swing) * 0.5, 0, 0, "XYZ"))
        _q2.premultiply(_qp.copy(_q1).invert())
        this.shoulderL.quaternion.copy(_q3).slerp(_q1, leftW)
        this.elbowL.quaternion.copy(_q4).slerp(_q2, leftW)
      } else {
        this.shoulderL.quaternion.copy(_q1)
        this.elbowL.quaternion.copy(_q1).invert().multiply(_q2)
      }
    }

    // ---- legs: foot targets in root space + IK
    this.pelvis.updateMatrix()
    _qp.copy(this.pelvis.quaternion).invert()
    for (let i = 0; i < 2; i++) {
      const left = i === 0, side = left ? -1 : 1
      const hip = left ? this.hipL : this.hipR, knee = left ? this.kneeL : this.kneeR, ankle = left ? this.ankleL : this.ankleR
      // rest stance (crouch: left foot forward, right knee down)
      let fx = side * lerp(0.115, 0.13, crouch) + sway * 0.6, fy = RIG.ankleH, fz = lerp(side * 0.025, left ? -0.25 : 0.3, crouch)
      if (!left) fy += crouch * 0.11
      let toe = left ? 0 : -0.75 * crouch
      if (amp > 0.001) {
        const fp = (this.phase + (left ? 0 : 0.5)) % 1
        let along: number, liftY = 0
        if (fp < stance) along = 0.5 - fp / stance
        else {
          const u = (fp - stance) / (1 - stance)
          along = -0.5 + smooth(u)
          liftY = Math.sin(u * Math.PI) * lerp(0.1, 0.22, run) * (1 - crouch * 0.5)
          toe += Math.sin(u * Math.PI) * 0.35 - (u < 0.3 ? 0.4 * (1 - u / 0.3) : 0)
        }
        let dx = this.dirX, dz = this.dirZ
        if (turnGait > 0) {
          const tw = turnGait / Math.max(gaitSpeed, 1e-3)
          dx = lerp(dx, 0, tw); dz = lerp(dz, side * Math.sign(this.turn) * -1, tw)
        }
        fx += dx * along * stride * amp; fz += dz * along * stride * amp; fy += liftY * amp
      }
      _v3.set(fx, fy, fz)
      _v4.copy(hip.position).applyQuaternion(this.pelvis.quaternion).add(this.pelvis.position)
      _pole.copy(POLE_KNEE)
      if (!left) _pole.y -= crouch * 0.6
      else _pole.y += crouch * 0.3
      solveTwoBone(_v4, _v3, _pole, RIG.thigh, RIG.shin, -1, _q1, _q2)
      hip.quaternion.copy(_qp).multiply(_q1)
      knee.quaternion.copy(_q1).invert().multiply(_q2)
      _q3.setFromAxisAngle(_v1.set(1, 0, 0), toe)
      ankle.quaternion.copy(_q2).invert().multiply(_q3)
    }

    // ---- awareness mark follows the head
    this.indicator.position.y = (lerp(1.7, 1.25, crouch) + 0.45)
  }

  /** Refresh posed world points. Call after the owning group's updateMatrixWorld(true). */
  capture(): void {
    const hc = RIG.headCenter
    this.head.set(hc[0], hc[1], hc[2]).applyMatrix4(this.neck.matrixWorld)
    // torso capsule ends at the upper chest (its top stays below the jaw), the neck has its own thin capsule
    this.neckBase.set(0, 0.06, 0).applyMatrix4(this.chest.matrixWorld)
    this.neckLow.set(0, 0.17, 0).applyMatrix4(this.chest.matrixWorld)
    this.neckTop.set(0, 0.09, 0).applyMatrix4(this.neck.matrixWorld)
    this.headUp.setFromMatrixColumn(this.neck.matrixWorld, 1).normalize()
    this.chestPos.set(0, 0.02, -0.02).applyMatrix4(this.chest.matrixWorld)
    this.pelvisPos.setFromMatrixPosition(this.pelvis.matrixWorld)
    this.shoulderLPos.setFromMatrixPosition(this.shoulderL.matrixWorld); this.shoulderRPos.setFromMatrixPosition(this.shoulderR.matrixWorld)
    this.elbowLPos.setFromMatrixPosition(this.elbowL.matrixWorld); this.elbowRPos.setFromMatrixPosition(this.elbowR.matrixWorld)
    this.hipLPos.setFromMatrixPosition(this.hipL.matrixWorld); this.hipRPos.setFromMatrixPosition(this.hipR.matrixWorld)
    this.kneeLPos.setFromMatrixPosition(this.kneeL.matrixWorld); this.kneeRPos.setFromMatrixPosition(this.kneeR.matrixWorld)
    this.ankleLPos.setFromMatrixPosition(this.ankleL.matrixWorld); this.ankleRPos.setFromMatrixPosition(this.ankleR.matrixWorld)
    this.handLPos.set(0, -0.3, 0).applyMatrix4(this.elbowL.matrixWorld); this.handRPos.set(0, -0.3, 0).applyMatrix4(this.elbowR.matrixWorld)
    if (!this.gunDropped) this.muzzle.copy(this.gunSpec.muzzle).applyMatrix4(this.gun.matrixWorld)
  }

  /**
   * Ray test against the posed hit zones (call after capture()). Head sphere — but only above the jaw line: hits on
   * its lower part are the neck (torso). Torso capsule pelvis→upper chest plus a thin neck capsule; upper arms and
   * legs are limbs. Severed parts are skipped. Returns the nearest entry within maxT, or null.
   */
  rayTest(o: Vec3, d: Vec3, maxT: number): { t: number; part: HitPart; bodyPart: BodyPartId } | null {
    const s = this.scale, z = this.zones, h = this.head, sev = this.severed
    let best = maxT, part: HitPart | null = null, bodyPart: BodyPartId = "torso"
    if (!sev.has("head")) {
      const ox = o.x - h.x, oy = o.y - h.y, oz = o.z - h.z, r = z.head * s
      const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c
      if (disc >= 0) {
        const sq = Math.sqrt(disc); let t = -b - sq; if (t < 0) t = -b + sq
        if (t >= 0 && t <= best) {
          // height of the hit point along the head's up axis: under the jaw it is the throat
          const up = (ox + d.x * t) * this.headUp.x + (oy + d.y * t) * this.headUp.y + (oz + d.z * t) * this.headUp.z
          best = t
          if (up >= -JAW * r) { part = "head"; bodyPart = "head" } else { part = "body"; bodyPart = "torso" }
        }
      }
    }
    const cap = (a: THREE.Vector3, e: THREE.Vector3, rad: number, p: HitPart, bp: BodyPartId) => {
      if (sev.has(bp)) return
      const t = raySegmentCapsule(o, d, a.x, a.y, a.z, e.x, e.y, e.z, rad * s, best)
      if (t !== null && t < best) { best = t; part = p; bodyPart = bp }
    }
    cap(this.pelvisPos, this.neckBase, z.torso, "body", "torso")
    cap(this.neckLow, this.neckTop, NECK_R, "body", "torso")
    cap(this.shoulderLPos, this.elbowLPos, z.arm, "limb", "armL"); cap(this.shoulderRPos, this.elbowRPos, z.arm, "limb", "armR")
    cap(this.hipLPos, this.kneeLPos, z.thigh, "limb", "legL"); cap(this.hipRPos, this.kneeRPos, z.thigh, "limb", "legR")
    cap(this.kneeLPos, this.ankleLPos, z.shin, "limb", "legL"); cap(this.kneeRPos, this.ankleRPos, z.shin, "limb", "legR")
    return part ? { t: best, part, bodyPart } : null
  }

  /** Body part nearest to a world point (melee swings: the aim point at the target's distance). Skips severed parts. */
  nearestZone(p: Vec3): { part: HitPart; bodyPart: BodyPartId } {
    const s = this.scale, z = this.zones, sev = this.severed
    let best = Infinity, part: HitPart = "body", bodyPart: BodyPartId = "torso"
    const seg = (a: THREE.Vector3, b: THREE.Vector3, rad: number, hp: HitPart, bp: BodyPartId) => {
      if (sev.has(bp)) return
      const d = segDist(p, a, b) - rad * s
      if (d < best) { best = d; part = hp; bodyPart = bp }
    }
    if (!sev.has("head")) {
      const d = Math.hypot(p.x - this.head.x, p.y - this.head.y, p.z - this.head.z) - z.head * s
      if (d < best && p.y - this.head.y >= -JAW * z.head * s) { best = d; part = "head"; bodyPart = "head" }
    }
    seg(this.pelvisPos, this.neckBase, z.torso, "body", "torso")
    seg(this.neckLow, this.neckTop, NECK_R, "body", "torso")
    seg(this.shoulderLPos, this.handLPos, z.arm, "limb", "armL"); seg(this.shoulderRPos, this.handRPos, z.arm, "limb", "armR")
    seg(this.hipLPos, this.ankleLPos, z.thigh, "limb", "legL"); seg(this.hipRPos, this.ankleRPos, z.thigh, "limb", "legR")
    return { part, bodyPart }
  }

  /** Muzzle flash + recoil kick. */
  fire(): void {
    this.recoil = Math.min(1.6, this.recoil + 1)
    this.flashT = 0.05
    this.flash.visible = true
    this.shots++
    this.flash.rotation.z = ((this.shots * 2654435761) >>> 0) / 4294967296 * TAU
    const s = this.gunSpec.flashScale * (0.85 + (((this.shots * 40503) >>> 0) % 100) / 330)
    this.flash.scale.set(s, s, s * 1.15)
  }

  /** Hit reaction: (dirX, dirZ) = world direction the bullet travelled. */
  hit(dirX: number, dirZ: number, strength = 1): void {
    const yaw = this.root.parent ? this.root.parent.rotation.y : 0
    const c = Math.cos(yaw), s = Math.sin(yaw)
    this.flinchX = clamp(this.flinchX + (dirX * c - dirZ * s) * strength, -1.5, 1.5)
    this.flinchZ = clamp(this.flinchZ + (dirX * s + dirZ * c) * strength, -1.5, 1.5)
    this.uniforms.uFlash.value = 1
  }

  /** Per-frame cosmetic timers that also run for corpses (hurt flash fade). */
  tick(dt: number): void {
    const u = this.uniforms.uFlash
    if (u.value > 0) u.value = Math.max(0, u.value - dt * 7)
  }

  setIndicator(mark: "" | "?" | "!", size = 0.42): void {
    if (mark !== this.mark) {
      this.mark = mark
      this.indicator.visible = mark !== ""
      if (mark) this.indicator.material = this.assets.markMats[mark]
    }
    if (mark) this.indicator.scale.setScalar(size / this.scale)
  }

  /** Laser telegraph (marksman only): beam length in metres from the emitter. */
  setLaser(on: boolean, length = 40): void {
    if (!this.laser || !this.laserDot) return
    this.laser.visible = on; this.laserDot.visible = on
    if (on) this.laser.scale.set(1, 1, Math.max(0.5, length) / this.scale)
  }

  /** Show the bloody stump cap where `part` was attached (call after severing / a head burst). */
  showStump(part: BodyPartId): void {
    if (part === "torso" || this.stumps[part]) return
    const cap = new THREE.Mesh(this.assets.stumpGeo, this.assets.stumpMat)
    cap.name = `stump_${part}`
    cap.castShadow = true
    const s = this.kind === "heavy" ? 1.15 : 1
    if (part === "head") { cap.position.set(0, RIG.neck + 0.02, 0); cap.scale.set(0.9 * s, 0.8, 0.9 * s); this.chest.add(cap) }
    else if (part === "armL" || part === "armR") {
      const side = part === "armL" ? -1 : 1
      cap.position.set(side * (RIG.shoulderX + 0.035), RIG.shoulderY - 0.02, 0); cap.rotation.z = -side * 1.35; cap.scale.setScalar(0.95 * s)
      this.chest.add(cap)
    } else {
      const side = part === "legL" ? -1 : 1
      cap.position.set(side * RIG.hipX, RIG.hipY - 0.04, 0); cap.rotation.x = Math.PI; cap.scale.set(1.15 * s, 0.9, 1.15 * s)
      this.pelvis.add(cap)
    }
    this.stumps[part] = cap
  }

  setNight(on: boolean): void { this.lens.visible = on; this.cone.visible = on && !this.dead }

  /** Night only: world origin and direction of the weapon light (valid after capture()). */
  lightRay(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (!this.cone.visible) return false
    origin.copy(this.gunSpec.light).applyMatrix4(this.gun.matrixWorld)
    dir.set(0, 0, -1).transformDirection(this.gun.matrixWorld)
    return true
  }

  /** Shortens the light cone so it stops at the first solid (light does not pass through walls). */
  setLightReach(metres: number): void { this.cone.scale.setScalar(Math.max(0.05, Math.min(1, metres / (CONE_LENGTH * this.scale)))) }

  // ---------------------------------------------------------------- death

  /** Starts the procedural fall toward the world direction (fallX, fallZ) (away from the killer). */
  die(fallX: number, fallZ: number): void {
    if (this.dead) return
    this.dead = true
    this.deathT = 0
    this.setIndicator(""); this.setLaser(false)
    this.flash.visible = false; this.cone.visible = false; this.lens.visible = false
    const yaw = this.root.parent ? this.root.parent.rotation.y : 0
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const lx = fallX * c - fallZ * s, lz = fallX * s + fallZ * c
    const alpha = Math.atan2(lx, lz)
    this.fallBack = Math.abs(alpha) <= Math.PI / 2
    this.spin = this.fallBack ? alpha : wrap(alpha - Math.PI)
    this.lift = this.fallBack ? this.kindAssets.liftBack : this.kindAssets.liftFront
    this.deathStart = this.joints.map(j => j.quaternion.clone())
    this.pelvisStartY = this.pelvis.position.y
    this.deathPose = this.buildDeathPose()
    this.fitRestPose()
    this.dropWeapon(fallX, fallZ)
  }

  /** True once the weapon has left the hands (death or a severed arm). */
  get unarmed(): boolean { return this.gunDropped }

  /** The weapon leaves the hands (world direction it is flung) and falls to the ground beside the body. */
  dropWeapon(dirX: number, dirZ: number): void {
    const parent = this.root.parent
    if (this.gunDropped || !parent) return
    const yaw = parent.rotation.y
    this.flash.visible = false; this.cone.visible = false; this.lens.visible = false; this.setLaser(false)
    parent.updateMatrixWorld(true)
    parent.attach(this.gun)
    this.gunDropped = true
    this.gunVel.set(dirX * 0.6, 0.6, dirZ * 0.6).applyAxisAngle(_v1.set(0, 1, 0), -yaw)
    _v2.set(0, 0, -1).applyQuaternion(this.gun.quaternion)
    const gy = Math.atan2(-_v2.x, -_v2.z)
    this.gunRest.setFromEuler(_e.set(0, gy, (this.seed % 2 ? 1 : -1) * Math.PI / 2, "YXZ"))
  }

  private updateDroppedGun(dt: number): void {
    const g = this.gun
    if (g.position.y > 0.045 || this.gunVel.y > 0) {
      this.gunVel.y -= 9.8 * dt
      g.position.addScaledVector(this.gunVel, dt)
      if (g.position.y <= 0.045) { g.position.y = 0.045; this.gunVel.set(0, 0, 0) }
    }
    g.quaternion.slerp(this.gunRest, ease(dt, g.position.y <= 0.046 ? 14 : 5))
  }

  /** The body was blown apart (GoreSystem.gib hides it): no death animation, nothing left to pose. */
  gibbed(): void {
    this.dead = true; this.settled = true
    this.setIndicator(""); this.setLaser(false)
    this.flash.visible = false; this.cone.visible = false; this.lens.visible = false
  }

  private buildDeathPose(): DeathPose {
    const r = (i: number) => (((this.seed * 7919 + i * 104729) >>> 0) % 1000) / 1000 - 0.5
    const b = this.fallBack
    const E = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "YXZ"))
    // order matches this.joints
    // lying pose (root rotated ±90° about X: on the back the ground is at local +Z, face down at local −Z).
    // Arms swing about the body's long axis (Y) to reach the ground; pelvis tilt lets the legs rest.
    const g = b ? 1 : -1, armL = 0.75 + r(4) * 0.6, armR = 0.75 + r(5) * 0.6
    const q = [
      E(-0.07 * g, 0, r(1) * 0.08),                                  // pelvis
      E(0.07 * g, r(2) * 0.3, 0),                                    // spine (undo the pelvis tilt)
      E(0, 0, 0),                                                    // aim frame
      E(0, 0, 0),                                                    // chest
      E(b ? 0.35 : -0.2, (r(3) > 0 ? 1 : -1) * (b ? 0.75 : 1.1), 0),  // head
      E(0, g * (0.42 + r(6) * 0.12), -armL),                         // upper arm L
      E(0, -g * (0.42 + r(7) * 0.12), armR),                         // upper arm R
      E(0.15 + r(6) * 0.15, 0, 0), E(0.15 + r(7) * 0.15, 0, 0),      // forearms
      E(-0.16 * g, 0, -0.12 - r(8) * 0.1), E(-0.16 * g, 0, 0.12 + r(9) * 0.1),  // thighs
      E(b ? -0.03 : -0.12, 0, 0), E(b ? -0.03 : -0.16, 0, 0),        // shins
      E(b ? -0.35 : -1.3, b ? -0.4 : 0, 0), E(b ? -0.35 : -1.3, b ? 0.4 : 0, 0), // boots
    ]
    const buckle = [
      E(0, 0, 0), E(-0.25, r(10) * 0.3, 0), E(0, 0, 0), E(0, 0, 0), E(b ? 0.3 : -0.3, 0, 0),
      E(0.2, 0, -0.35), E(0.2, 0, 0.35), E(0.5, 0, 0), E(0.5, 0, 0),
      E(1.0, 0, -0.08), E(0.8, 0, 0.08), E(-1.6, 0, 0), E(-1.4, 0, 0), E(0.3, 0, 0), E(0.3, 0, 0),
    ]
    return { q, buckle, pelvisZ: 0, spineZ: 0 }
  }

  /**
   * Fits the lying pose to the ground once at death: lifts the body so the torso touches the ground, lowers the pelvis
   * onto it, then bisects the rest angle of the head, each arm and each leg so that their lowest vertex just touches
   * the ground (nothing floats or sinks, whatever the gear thickness). Restores the live pose afterwards.
   */
  private fitRestPose(): void {
    const P = this.deathPose!, g = this.fallBack ? 1 : -1
    const rootQ = this.root.quaternion.clone(), rootY = this.root.position.y, pelvisP = this.pelvis.position.clone(), spineP = this.spine.position.clone()
    const baseY = this.root.parent ? this.root.parent.matrixWorld.elements[13] : 0
    const lowest = (meshes: THREE.Object3D[]) => {
      let low = Infinity
      for (const o of meshes) {
        if (!o.visible) continue
        const pos = (o as THREE.Mesh).geometry.attributes.position
        for (let k = 0; k < pos.count; k++) { _v2.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); if (_v2.y < low) low = _v2.y }
      }
      return low - baseY
    }
    this.root.quaternion.setFromAxisAngle(_v1.set(1, 0, 0), g * Math.PI / 2); this.root.position.y = 0
    this.pelvis.position.set(0, RIG.pelvisY, 0); this.spine.position.set(0, RIG.spine, 0)
    for (let i = 0; i < this.joints.length; i++) this.joints[i].quaternion.copy(P.q[i])
    this.root.updateMatrixWorld(true)
    // torso carries the weight; the pelvis (thinner than chest + plates) sinks onto the ground too
    this.lift = -lowest([this.chest])
    this.root.position.y = this.lift
    this.root.updateMatrixWorld(true)
    const drop = Math.max(0, lowest([this.pelvis]) - 0.005) / this.scale
    P.pelvisZ = g * drop; P.spineZ = -g * drop
    this.pelvis.position.z = P.pelvisZ; this.spine.position.z = P.spineZ
    this.root.updateMatrixWorld(true)
    // limbs and head: 1-D bisection on the angle that swings them toward the ground
    const fit = (i: number, meshes: THREE.Object3D[], lo: number, hi: number, build: (a: number) => THREE.Quaternion) => {
      const j = this.joints[i]
      const f = (a: number) => { j.quaternion.copy(build(a)); j.updateMatrixWorld(true); return lowest(meshes) - 0.008 }
      let fLo = f(lo), fHi = f(hi)
      if (fLo * fHi > 0) { const a = Math.abs(fLo) < Math.abs(fHi) ? lo : hi; f(a); P.q[i].copy(j.quaternion); return }
      for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm < 0) === (fLo < 0)) { lo = mid; fLo = fm } else hi = mid }
      f((lo + hi) / 2); P.q[i].copy(j.quaternion)
    }
    const eu = (x: number, y: number, z: number) => _qf.setFromEuler(_e.set(x, y, z, "YXZ"))
    const headE = _e2.setFromQuaternion(P.q[4], "YXZ").clone()
    const sev = this.severed
    if (!sev.has("head")) fit(4, [this.neck], -0.6, 0.9, a => eu(g * a, headE.y, 0))
    for (const [i, side, meshes, id] of [[5, -1, [this.shoulderL, this.elbowL], "armL"], [6, 1, [this.shoulderR, this.elbowR], "armR"]] as Array<[number, number, THREE.Object3D[], string]>) {
      if (sev.has(id)) continue
      const ez = _e2.setFromQuaternion(P.q[i], "YXZ").z
      fit(i, meshes, 0, 1.45, a => eu(0, -side * g * a, ez))
    }
    for (const [i, meshes, id] of [[9, [this.hipL, this.kneeL, this.ankleL], "legL"], [10, [this.hipR, this.kneeR, this.ankleR], "legR"]] as Array<[number, THREE.Object3D[], string]>) {
      if (sev.has(id)) continue
      const ez = _e2.setFromQuaternion(P.q[i], "YXZ").z
      fit(i, meshes, -0.35, 0.6, a => eu(-g * a, 0, ez))
    }
    // restore the live pose (the fall animates toward P)
    for (let i = 0; i < this.joints.length; i++) this.joints[i].quaternion.copy(this.deathStart[i])
    this.root.quaternion.copy(rootQ); this.root.position.y = rootY; this.pelvis.position.copy(pelvisP); this.spine.position.copy(spineP)
    this.root.updateMatrixWorld(true)
  }

  private updateDeath(dt: number): void {
    if (this.settled) return
    const t = this.deathT = this.deathT + dt
    const P = this.deathPose!
    // tip angle: slow while the knees buckle, then a gravity-like fall, flat at 0.66 s
    const B = 0.24, F = 0.42
    const theta = t < B ? 0.3 * (t / B) * (t / B) : Math.min(Math.PI / 2, 0.3 + (Math.PI / 2 - 0.3) * Math.pow((t - B) / F, 2))
    const landed = t >= B + F
    const sign = this.fallBack ? 1 : -1
    _q1.setFromAxisAngle(_v1.set(0, 1, 0), this.spin * smooth(t / 0.5))
    _q2.setFromAxisAngle(_v1.set(1, 0, 0), sign * theta)
    this.root.quaternion.copy(_q1).multiply(_q2)
    const bounce = landed && t < B + F + 0.14 ? Math.sin((t - B - F) / 0.14 * Math.PI) * 0.025 : 0
    this.root.position.y = this.lift * Math.pow(theta / (Math.PI / 2), 3) + bounce
    // knees buckle, then the body straightens out on the ground
    const kneeDrop = t < B ? smooth(t / B) : 1 - smooth((t - B) / F)
    this.pelvis.position.y = lerp(this.pelvisStartY, RIG.pelvisY, smooth(t / (B + F))) - 0.24 * kneeDrop
    this.pelvis.position.x *= 1 - ease(dt, 6)
    this.pelvis.position.z += (P.pelvisZ - this.pelvis.position.z) * ease(dt, 6)
    this.spine.position.z += (P.spineZ - this.spine.position.z) * ease(dt, 6)
    for (let i = 0; i < this.joints.length; i++) {
      const j = this.joints[i]
      const isArm = i >= 5 && i <= 8, isLeg = i >= 9
      if (isLeg) {
        if (t < B) j.quaternion.copy(this.deathStart[i]).slerp(P.buckle[i], smooth(t / B))
        else j.quaternion.copy(P.buckle[i]).slerp(P.q[i], smooth((t - B) / F))
      } else if (isArm) j.quaternion.copy(this.deathStart[i]).slerp(P.q[i], smooth(t / 0.45))
      else {
        const u = smooth(t / (B + F))
        _q3.copy(this.deathStart[i]).slerp(P.buckle[i], smooth(t / B))
        j.quaternion.copy(_q3).slerp(P.q[i], u)
      }
    }
    // dropped weapon: falls, then lies flat
    if (this.gunDropped) this.updateDroppedGun(dt)
    if (t > B + F + 0.3) {
      // exact rest pose: flat on the ground, nothing moves afterwards
      this.root.quaternion.copy(_q1.setFromAxisAngle(_v1.set(0, 1, 0), this.spin)).multiply(_q2.setFromAxisAngle(_v1.set(1, 0, 0), sign * Math.PI / 2))
      this.root.position.y = this.lift
      this.pelvis.position.set(0, RIG.pelvisY, P.pelvisZ); this.spine.position.z = P.spineZ
      for (let i = 0; i < this.joints.length; i++) this.joints[i].quaternion.copy(P.q[i])
      if (this.gunDropped) { this.gun.position.y = 0.045; this.gun.quaternion.copy(this.gunRest) }
      this.settled = true
    }
  }

  /** Current weapon raise weight (0 lowered … 1 aimed). */
  get aimAmount(): number { return this.aimW }

  /** Seconds since death (0 while alive). */
  get deathTime(): number { return this.deathT }

  dispose(): void {
    this.material.dispose()
    if (this.gunDropped) this.gun.removeFromParent()
  }
}
