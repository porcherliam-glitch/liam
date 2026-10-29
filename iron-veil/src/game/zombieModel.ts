/**
 * zombieModel.ts — procedural low-poly infected: per-kind body specs, clothing/skin variants, merged segment geometry
 * with vertex colours (+ a per-vertex "glow" attribute for eyes, acid sacs and the boss weak spot) and the joint rig.
 *
 * Rig (model faces -Z, +X is its right):  root (feet, yaw) → body (falls/lifts) → hips → legL/legR (hip joint) → knee
 *                                                                                   → torso (waist) → head (neck) → jaw
 *                                                                                                   → armL/armR (shoulder) → elbow
 * gore.parts = head, torso, armL, armR, legL, legR (group origin = joint). The parent segment carries a dark red stump cap
 * at every joint that the child's root ball hides while attached. One shared material for every infected; geometry is
 * cached per (kind, variant) and shared by all instances: 11 meshes (draw calls) per rig, 1 for the LOD and corpse bakes.
 */
import * as THREE from "three"
import type { BodyPartId } from "./hostiles"
import type { InfectedKind } from "./infectedData"
import { makeRng } from "./zombieAi"

// ------------------------------------------------------------------ pose parameters

/** Indices into a pose (Float32Array of POSE_N). Angles in radians; see applyPose for the sign conventions. */
export const P = {
  bodyPitch: 0, bodyRoll: 1, bodyLie: 2, bodyLift: 3, bodyFwd: 4, hipsDrop: 5,
  torsoPitch: 6, torsoRoll: 7, torsoYaw: 8, headPitch: 9, headRoll: 10, headYaw: 11, jaw: 12,
  armLPitch: 13, armLSpread: 14, elbowL: 15, armRPitch: 16, armRSpread: 17, elbowR: 18,
  legLPitch: 19, legLSpread: 20, kneeL: 21, legRPitch: 22, legRSpread: 23, kneeR: 24,
} as const
export type PoseKey = keyof typeof P
export const POSE_N = 25

// ------------------------------------------------------------------ body specs

export interface BodySpec {
  hipH: number; thigh: number; shin: number; foot: number
  pelvisW: number; waistW: number; waistD: number; chestW: number; chestD: number; torsoLen: number
  shoulderX: number; neck: number; headR: number; headS: readonly [number, number, number]; headZ: number
  upperArm: number; foreArm: number; hand: number; armR: number; foreR: number; thighR: number; shinR: number
  claw: number; jawMax: number
  /** Rest torso pitch (negative = bent forward). */
  hunch: number
  legs: boolean
  belly?: number; throat?: number; plates?: boolean; spikes?: boolean; weakSpot?: boolean; club?: boolean; spine?: boolean
  /** Movement collision radius. */
  radius: number
  /** Lying offset (half body depth) and total standing height. */
  lie: number
  height: number
}

function spec(s: Omit<BodySpec, "lie" | "height">): BodySpec {
  return { ...s, lie: s.chestD * 0.5 + (s.belly ?? 0) * 0.5, height: s.hipH + s.torsoLen + s.neck + s.headR * 2.1 }
}

const HUMAN = {
  hipH: 0.9, thigh: 0.44, shin: 0.41, foot: 0.05, pelvisW: 0.3, waistW: 0.25, waistD: 0.17, chestW: 0.35, chestD: 0.2, torsoLen: 0.56,
  shoulderX: 0.2, neck: 0.08, headR: 0.112, headS: [0.95, 1.12, 1.05] as const, headZ: 0, upperArm: 0.3, foreArm: 0.27, hand: 0.1,
  armR: 0.046, foreR: 0.038, thighR: 0.068, shinR: 0.05, claw: 0.03, jawMax: 0.6, hunch: -0.18, legs: true, radius: 0.32,
}

export const SPECS: Record<InfectedKind, BodySpec> = {
  walker: spec(HUMAN),
  runner: spec({ ...HUMAN, hipH: 0.94, thigh: 0.46, shin: 0.43, chestW: 0.33, waistW: 0.22, armR: 0.042, foreR: 0.034, thighR: 0.062, shinR: 0.046, claw: 0.045, hunch: -0.3, radius: 0.3 }),
  screamer: spec({ ...HUMAN, hipH: 0.96, thigh: 0.47, shin: 0.44, chestW: 0.31, chestD: 0.18, waistW: 0.2, torsoLen: 0.6, neck: 0.17, headR: 0.118, headS: [0.86, 1.3, 1.02],
    upperArm: 0.33, foreArm: 0.31, armR: 0.038, foreR: 0.032, thighR: 0.058, shinR: 0.044, claw: 0.06, jawMax: 1.25, hunch: -0.08, radius: 0.3 }),
  spitter: spec({ ...HUMAN, hipH: 0.86, thigh: 0.42, shin: 0.39, waistW: 0.33, waistD: 0.24, chestW: 0.38, chestD: 0.24, torsoLen: 0.54, belly: 0.26, throat: 0.1,
    armR: 0.05, foreR: 0.042, thighR: 0.08, shinR: 0.058, jawMax: 0.9, hunch: -0.02, radius: 0.42 }),
  stalker: spec({ ...HUMAN, hipH: 0.92, thigh: 0.45, shin: 0.42, chestW: 0.33, chestD: 0.19, waistW: 0.21, upperArm: 0.37, foreArm: 0.36, hand: 0.12, armR: 0.043, foreR: 0.036,
    thighR: 0.062, shinR: 0.046, claw: 0.09, jawMax: 0.8, hunch: -0.35, spine: true, radius: 0.34 }),
  crawler: spec({ ...HUMAN, legs: false, upperArm: 0.32, foreArm: 0.29, claw: 0.05, jawMax: 0.75, hunch: 0, radius: 0.36 }),
  brute: spec({ hipH: 1.02, thigh: 0.5, shin: 0.45, foot: 0.07, pelvisW: 0.62, waistW: 0.62, waistD: 0.46, chestW: 0.98, chestD: 0.62, torsoLen: 0.88,
    shoulderX: 0.56, neck: 0.0, headR: 0.135, headS: [1.05, 0.95, 1.05], headZ: -0.2, upperArm: 0.5, foreArm: 0.52, hand: 0.2, armR: 0.16, foreR: 0.185,
    thighR: 0.18, shinR: 0.15, claw: 0.05, jawMax: 0.7, hunch: -0.5, legs: true, plates: true, radius: 0.62 }),
  boss: spec({ hipH: 1.6, thigh: 0.82, shin: 0.68, foot: 0.1, pelvisW: 1.0, waistW: 1.0, waistD: 0.78, chestW: 1.65, chestD: 1.05, torsoLen: 1.5,
    shoulderX: 0.95, neck: 0.0, headR: 0.23, headS: [1.05, 0.95, 1.1], headZ: -0.38, upperArm: 0.86, foreArm: 0.88, hand: 0.32, armR: 0.27, foreR: 0.3,
    thighR: 0.3, shinR: 0.25, claw: 0.32, jawMax: 0.75, hunch: -0.42, legs: true, plates: true, spikes: true, weakSpot: true, club: true, radius: 1.0 }),
}

/** Number of cached look variants per kind (instances pick one at random). */
export const VARIANTS: Record<InfectedKind, number> = { walker: 10, runner: 5, brute: 3, screamer: 3, spitter: 3, stalker: 3, crawler: 4, boss: 1 }

/** Blood colour per kind (spitters bleed bile). */
export const BLOOD: Record<InfectedKind, number> = { walker: 0x4a0b07, runner: 0x520c08, brute: 0x3e0906, screamer: 0x4a0b07, spitter: 0x4a4a0c, stalker: 0x350806, crawler: 0x4a0b07, boss: 0x3a0705 }

// ------------------------------------------------------------------ looks

type Top = "shirt" | "tank" | "coat" | "gown" | "uniform" | "none"
interface Look {
  skin: number; eye: number
  top: Top; topColor: number; vest: "none" | "hivis" | "plate"; vestColor: number
  sleeves: "long" | "short" | "none"
  pants: "long" | "torn" | "shorts" | "rags"; pantsColor: number
  shoes: number | null
  hair: number | null; helmet: boolean
  ribs: number; missingEye: boolean; cheek: number
}

const C = {
  wound: 0x84170f, flesh: 0xa53a26, blood: 0x6a120b, gore: 0x3c0806, bone: 0xd8cfae, teeth: 0xcdbd8c, dark: 0x0e0504, nail: 0x2a2018, gut: 0xa65a55,
  plate: 0xc8bd9c, muscle: 0x8a3027, bile: 0x9aa457, sac: 0xa9b35e, acid: 0x9cff52, weak: 0xffa236,
}
const SKINS = [0x9aa18a, 0x8a9a76, 0xa8a38c, 0x7f8a6e, 0x9c9894, 0x8a826e, 0x93907c]
const EYES: Record<InfectedKind, number> = { walker: 0xf2e7a6, runner: 0xff7a3a, screamer: 0xe6f0ff, spitter: 0xbdff6a, stalker: 0x9fd8ff, crawler: 0xf2e7a6, brute: 0xffb24a, boss: 0xff8a1e }
const CIV_TOPS = [0x6b4a3a, 0x3d4f66, 0x7a7466, 0x5e2b2b, 0x4a5a3a, 0x8a7a5a, 0x2e3440, 0x6a6a72, 0x7c5a2e]
const CIV_PANTS = [0x3d4b66, 0x4b4236, 0x3a3a3c, 0x5a5444, 0x48505a, 0x5b4a3a]
const SHOES = [0x2a2420, 0x4a4a4a, 0x5e554c, 0x1c1a18]
const HAIR = [0x1c1612, 0x3a2a1c, 0x5a4a32, 0x2a2a2a, 0x6c6560]

function pick<T>(a: readonly T[], r: () => number): T { return a[Math.floor(r() * a.length) % a.length] }

function makeLook(kind: InfectedKind, r: () => number): Look {
  const look: Look = {
    skin: pick(SKINS, r), eye: EYES[kind], top: "shirt", topColor: pick(CIV_TOPS, r), vest: "none", vestColor: 0, sleeves: r() < 0.5 ? "long" : "short",
    pants: r() < 0.6 ? "long" : "torn", pantsColor: pick(CIV_PANTS, r), shoes: pick(SHOES, r), hair: r() < 0.55 ? pick(HAIR, r) : null, helmet: false,
    ribs: r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0, missingEye: r() < 0.2, cheek: r() < 0.45 ? (r() < 0.5 ? -1 : 1) : 0,
  }
  const arche = r()
  if (kind === "walker" || kind === "crawler") {
    if (arche < 0.2) { look.top = "shirt"; look.topColor = 0x55595e; look.vest = "hivis"; look.vestColor = r() < 0.6 ? 0xc8701e : 0xb3b029; look.pantsColor = 0x2e3640; look.shoes = 0x2a2018 }
    else if (arche < 0.36) { look.top = "uniform"; look.topColor = 0x4b5235; look.vest = r() < 0.6 ? "plate" : "none"; look.vestColor = 0x3a3d2c; look.pantsColor = 0x454a35; look.shoes = 0x1e1e18; look.sleeves = "long"; look.helmet = r() < 0.5; look.pants = "long" }
    else if (arche < 0.5) { look.top = "coat"; look.topColor = 0xc4c2b6; look.pantsColor = 0x50545a; look.shoes = 0x1a1a1a; look.sleeves = "long" }
    else if (arche < 0.58) { look.top = "gown"; look.topColor = 0x8fa7a0; look.shoes = null; look.sleeves = "short"; look.pants = "rags"; look.pantsColor = 0x8fa7a0 }
    else if (arche < 0.7) { look.top = "tank"; look.sleeves = "none" }
  } else if (kind === "runner") {
    look.top = arche < 0.55 ? "tank" : arche < 0.8 ? "shirt" : "none"; look.sleeves = arche < 0.55 ? "none" : "short"; look.pants = r() < 0.5 ? "torn" : "shorts"
    look.shoes = r() < 0.4 ? null : look.shoes; look.ribs = r() < 0.6 ? (r() < 0.5 ? -1 : 1) : 0
  } else if (kind === "screamer") {
    look.top = arche < 0.65 ? "gown" : "coat"; look.topColor = arche < 0.65 ? pick([0x8fa7a0, 0x9fb0b6, 0xa49c8c], r) : 0xc4c2b6; look.sleeves = "short"
    look.pants = "rags"; look.pantsColor = look.topColor; look.shoes = null; look.hair = r() < 0.3 ? 0x2a2a2a : null; look.ribs = r() < 0.5 ? 1 : -1
  } else if (kind === "spitter") {
    look.top = "tank"; look.sleeves = "none"; look.topColor = pick([0x6a6a5a, 0x5a4a3a, 0x7a7466], r); look.pants = "torn"; look.skin = pick([0x8a8f6a, 0x9a9a72, 0x7f8a5c], r); look.hair = null
  } else if (kind === "stalker") {
    look.top = "none"; look.sleeves = "none"; look.pants = "rags"; look.pantsColor = pick([0x2a2a26, 0x3a332a], r); look.shoes = null; look.hair = null
    look.skin = pick([0x4e524a, 0x5a5850, 0x45493f], r); look.ribs = 2
  } else {
    look.top = "none"; look.sleeves = "none"; look.pants = "rags"; look.pantsColor = pick([0x2f3a4f, 0x3a3226], r); look.shoes = null; look.hair = null
    look.skin = kind === "boss" ? 0x8c746a : pick([0x9a8276, 0x8d7a6c, 0x967f72], r); look.ribs = 0; look.cheek = 0
  }
  return look
}

// ------------------------------------------------------------------ geometry builder

const TPL = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 12, 8),
  ballLo: new THREE.SphereGeometry(1, 8, 6),
  ico: new THREE.IcosahedronGeometry(1, 1),
}
/** Geometry detail while building (1 = close-up rig, ~0.45 = distant LOD bake). */
let DETAIL = 1
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3()
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0)

function hash3(x: number, y: number, z: number): number { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h) }

export interface Ring { y: number; w: number; d: number; x?: number; z?: number; c: number; jag?: number }

/** Accumulates transformed primitives into one indexed geometry (position, normal, color, glow). */
export class GeoBuilder {
  pos: number[] = []; nor: number[] = []; col: number[] = []; glow: number[] = []; idx: number[] = []

  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: number, glow = 0, jitter = 0.09): this {
    const p = g.attributes.position, n = g.attributes.normal, base = this.pos.length / 3
    _nm.getNormalMatrix(m); _c.setHex(color)
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z)
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z)
      // grime: per-vertex jitter + darker toward the bottom of each piece
      const k = 1 + (hash3(_v.x, _v.y, _v.z) - 0.5) * 2 * jitter
      this.col.push(_c.r * k, _c.g * k, _c.b * k); this.glow.push(glow)
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i))
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i)
    return this
  }

  /** Appends another baked geometry (same attribute layout) transformed by m. */
  addBaked(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, gl = g.attributes.glow, base = this.pos.length / 3
    _nm.getNormalMatrix(m)
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z)
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z)
      this.col.push(c.getX(i), c.getY(i), c.getZ(i)); this.glow.push(gl.getX(i))
    }
    for (let i = 0; i < g.index!.count; i++) this.idx.push(base + g.index!.getX(i))
  }

  get empty(): boolean { return this.idx.length === 0 }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute("glow", new THREE.Float32BufferAttribute(this.glow, 1))
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }

  // ---- shape helpers (local coordinates of the segment)
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, rx = 0, ry = 0, rz = 0, glow = 0): this {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(w, h, d)); return this.add(TPL.box, _m, color, glow)
  }
  ball(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, glow = 0, lo = false, rotX = 0, rotZ = 0): this {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rotX, 0, rotZ)), _s.set(rx, ry, rz)); return this.add(lo || DETAIL < 1 ? TPL.ballLo : TPL.ball, _m, color, glow)
  }
  lump(x: number, y: number, z: number, r: number, color: number, glow = 0): this {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(x * 7, y * 5, z * 3)), _s.set(r, r * 0.85, r)); return this.add(TPL.ico, _m, color, glow, 0.14)
  }
  /** Tapered cylinder from a (radius r0) to b (radius r1); depth squashes it along local Z. */
  tube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: number, segs = 6, depth = 1, glow = 0): this {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz)
    if (len < 1e-5) return this
    const g = new THREE.CylinderGeometry(r1, r0, len, Math.max(DETAIL < 1 ? 4 : 6, Math.round(segs * 1.5 * DETAIL)), 1, false)
    if (depth !== 1) g.scale(1, 1, depth)
    _q.setFromUnitVectors(_up, _v.set(dx / len, dy / len, dz / len))
    _m.compose(_p.set(ax + dx / 2, ay + dy / 2, az + dz / 2), _q, _s.set(1, 1, 1))
    this.add(g, _m, color, glow); g.dispose()
    return this
  }
  /**
   * Lofted tube through elliptical rings (each ring: centre y/x/z, half width w, half depth d, colour c, optional jagged
   * edge `jag`). Works bottom→top or top→bottom; caps: 1 = first ring, 2 = last ring, 3 = both, 0 = open shell.
   */
  loft(rings: Ring[], segs = 8, caps = 3, glow = 0, jitter = 0.08): this {
    segs = Math.max(5, Math.round(segs * 1.5 * DETAIL)) // rounder limbs and torsos (smooth shading)
    const base = this.pos.length / 3, n = rings.length
    const down = rings[n - 1].y < rings[0].y
    for (const ring of rings) {
      _c.setHex(ring.c)
      for (let i = 0; i < segs; i++) {
        const a = (i + 0.5) / segs * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
        const jag = ring.jag ? (hash3(i * 1.7, ring.y * 13.1, segs) - 0.5) * ring.jag * 2 : 0
        const x = (ring.x ?? 0) + ca * ring.w, y = ring.y + jag, z = (ring.z ?? 0) + sa * ring.d
        this.pos.push(x, y, z)
        const nl = Math.hypot(ca * ring.d, sa * ring.w) || 1
        this.nor.push(ca * ring.d / nl, 0, sa * ring.w / nl)
        const k = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter
        this.col.push(_c.r * k, _c.g * k, _c.b * k); this.glow.push(glow)
      }
    }
    for (let r = 0; r < n - 1; r++) for (let i = 0; i < segs; i++) {
      const v00 = base + r * segs + i, v01 = base + r * segs + (i + 1) % segs, v10 = v00 + segs, v11 = v01 + segs
      if (down) this.idx.push(v00, v01, v10, v01, v11, v10); else this.idx.push(v00, v10, v01, v01, v10, v11)
    }
    const cap = (ri: number, bottom: boolean) => {
      const ring = rings[ri], c = this.pos.length / 3
      _c.setHex(ring.c)
      this.pos.push(ring.x ?? 0, ring.y, ring.z ?? 0); this.nor.push(0, bottom !== down ? -1 : 1, 0); this.col.push(_c.r, _c.g, _c.b); this.glow.push(glow)
      const flip = bottom !== down
      for (let i = 0; i < segs; i++) {
        const a = base + ri * segs + i, b = base + ri * segs + (i + 1) % segs
        if (flip) this.idx.push(c, a, b); else this.idx.push(c, b, a)
      }
    }
    if (caps & 1) cap(0, true)
    if (caps & 2) cap(n - 1, false)
    return this
  }
  /** Ellipsoid with a full rotation (flattened ones make organic wounds, scabs and bony plates). */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, ex = 0, ey = 0, ez = 0, glow = 0): this {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(ex, ey, ez)), _s.set(rx, ry, rz)); return this.add(DETAIL < 1 ? TPL.ballLo : TPL.ball, _m, color, glow, 0.12)
  }
  /** Wound on a surface: dark crater with a raw-flesh rim, oriented by the yaw/roll of the surface. */
  wound(x: number, y: number, z: number, size: number, ry: number, rz = 0): this {
    this.blob(x, y, z, size * 0.55, size * 0.45, size * 0.07, 0x6e1e14, 0, ry, rz)
    this.blob(x * 1.004, y + size * 0.04, z * 1.004, size * 0.34, size * 0.28, size * 0.06, C.gore, 0, ry, rz)
    // a dried trail of blood running down from the wound
    return this.blob(x, y - size * 0.55, z, size * 0.12, size * 0.5, size * 0.035, 0x4a0c08, 0, ry, rz)
  }
  /** Cone spike with its base at a and tip at b. */
  spike(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: number): this {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz)
    const g = new THREE.ConeGeometry(r, len, 5)
    _q.setFromUnitVectors(_up, _v.set(dx / len, dy / len, dz / len))
    _m.compose(_p.set(ax + dx / 2, ay + dy / 2, az + dz / 2), _q, _s.set(1, 1, 1))
    this.add(g, _m, color, 0, 0.05); g.dispose()
    return this
  }
}

// ------------------------------------------------------------------ segments

export type SegName = "torso" | "head" | "jaw" | "upperArmL" | "foreArmL" | "upperArmR" | "foreArmR" | "thighL" | "shinL" | "thighR" | "shinR"

const dim = (c: number, k: number) => { _c.setHex(c); _c.multiplyScalar(k); return _c.getHex() }
const clothed = (L: Look) => L.top !== "none"

function torsoSeg(kind: InfectedKind, S: BodySpec, L: Look, r: () => number): THREE.BufferGeometry {
  const g = new GeoBuilder()
  const T = S.torsoLen, cw = S.chestW / 2, cd = S.chestD / 2, ww = S.waistW / 2, wd = S.waistD / 2, pw = S.pelvisW / 2
  const big = !!S.plates, F = -1
  const top = clothed(L) ? L.topColor : L.skin
  // tank tops and gowns leave the shoulders bare; torn shirts ride up over the belly
  const belly = L.top === "tank" && r() < 0.5 ? L.skin : top
  const pants = L.pantsColor
  const mid = ww + (cw - ww) * 0.35
  if (S.legs) {
    g.loft([
      { y: -0.11, w: pw * 0.7, d: wd * 0.85, c: dim(pants, 0.8) },
      { y: -0.02, w: pw * 1.0, d: wd * 1.08, c: pants },
      { y: 0.1, w: pw * 0.96, d: wd * 1.04, c: pants },
      { y: 0.105, w: ww * 1.0, d: wd * 0.98, c: belly },
      { y: 0.22, w: ww * 0.9, d: wd * 0.88, z: 0.005, c: belly },
      { y: 0.34, w: mid, d: wd * 0.98, c: top },
      { y: T * 0.62, w: cw * 0.95, d: cd * 1.0, z: -0.004, c: top },
      { y: T * 0.84, w: cw * 1.0, d: cd * 1.02, c: top },
      { y: T - 0.03, w: cw * 0.9, d: cd * 0.84, z: 0.01, c: top },
      { y: T + 0.03, w: cw * 0.4, d: cd * 0.5, z: 0.012, c: top },
    ], 9)
  } else {
    // crawler: torn off at the waist, guts and spine dragging behind
    g.loft([
      { y: -0.04, w: ww * 0.75, d: wd * 0.8, c: C.gore },
      { y: 0.03, w: ww * 0.95, d: wd * 0.95, c: C.wound, jag: 0.06 },
      { y: 0.1, w: ww * 1.0, d: wd * 0.98, c: belly },
      { y: 0.22, w: ww * 0.9, d: wd * 0.88, c: belly },
      { y: 0.34, w: mid, d: wd * 0.98, c: top },
      { y: T * 0.62, w: cw * 0.95, d: cd, c: top },
      { y: T * 0.84, w: cw, d: cd * 1.02, c: top },
      { y: T - 0.03, w: cw * 0.9, d: cd * 0.84, z: 0.01, c: top },
      { y: T + 0.03, w: cw * 0.4, d: cd * 0.5, z: 0.012, c: top },
    ], 9)
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.045, len = 0.25 + r() * 0.4, ex = x + (r() - 0.5) * 0.25, ey = -0.04 - len
      g.tube(x, -0.02, 0, (x + ex) / 2, ey * 0.5, -wd * 0.5, 0.026, 0.024, i % 2 ? C.gut : C.wound, 5).tube((x + ex) / 2, ey * 0.5, -wd * 0.5, ex, ey, -wd * 0.75, 0.024, 0.018, i % 2 ? C.gut : C.flesh, 5)
    }
    g.tube(0, 0, wd * 0.5, 0, -0.24, wd * 0.2, 0.02, 0.016, C.bone, 5)
  }
  // torn shirt hem hanging over the waistband
  if (L.top === "shirt" || L.top === "uniform" || L.top === "tank") {
    g.loft([{ y: 0.33, w: mid * 1.08, d: wd * 1.08, c: top }, { y: 0.16, w: ww * 1.1, d: wd * 1.12, c: top, jag: 0.09 }], 10, 0)
  }
  if (L.top === "coat" || L.top === "gown") {
    const len = L.top === "coat" ? 0.66 : 0.46
    g.loft([{ y: T * 0.66, w: cw * 1.04, d: cd * 1.08, c: top }, { y: 0.1, w: pw * 1.15, d: wd * 1.3, c: top }, { y: 0.1 - len * 0.5, w: pw * 1.3, d: wd * 1.45, c: dim(top, 0.85) },
      { y: 0.1 - len, w: pw * 1.4, d: wd * 1.55, c: C.blood, jag: 0.12 }], 10, 0)
    g.box(0.02, T * 0.45, F * (cd + 0.012), cw * 0.9, T * 0.5, 0.012, C.blood, 0.06, 0, 0.1)
  }
  // neck + stump caps (hidden under the head/arm/leg roots while attached)
  g.loft([{ y: T - 0.06, w: big ? 0.15 : 0.05, d: big ? 0.13 : 0.048, z: S.headZ * 0.4, c: L.skin }, { y: T + S.neck + 0.015, w: big ? 0.12 : 0.04, d: big ? 0.11 : 0.042, z: S.headZ, c: L.skin }], 7)
  g.ball(0, T + S.neck - 0.004, S.headZ, big ? 0.1 : 0.044, 0.018, big ? 0.1 : 0.044, C.wound)
  for (const sx of [-1, 1]) g.ball(sx * S.shoulderX * 0.94, T - 0.06, 0, S.armR * 0.8, S.armR * 0.75, S.armR * 0.8, C.wound, 0, true)
  if (S.legs) for (const sx of [-1, 1]) g.ball(sx * S.pelvisW * 0.3, -0.07, 0, S.thighR * 0.85, S.thighR * 0.55, S.thighR * 0.85, C.wound, 0, true)
  // hunched back
  if (S.hunch < -0.15 && !big) g.ball(0, T * 0.72, cd * 0.45, cw * 0.62, T * 0.26, cd * 0.62, top)
  // vests
  if (L.vest === "hivis") {
    g.loft([{ y: 0.3, w: mid * 1.12, d: wd * 1.12, c: L.vestColor, jag: 0.03 }, { y: T * 0.62, w: cw * 1.05, d: cd * 1.07, c: L.vestColor }, { y: T * 0.86, w: cw * 1.06, d: cd * 1.08, c: L.vestColor }], 9, 0)
    for (const y of [0.42, 0.52]) { g.box(0, y, F * cd * 1.06, cw * 1.6, 0.026, 0.012, 0xdcdfd2); g.box(0, y, cd * 1.06, cw * 1.6, 0.026, 0.012, 0xdcdfd2) }
  } else if (L.vest === "plate") {
    g.box(0, T * 0.64, F * cd * 1.05, cw * 1.45, T * 0.46, 0.06, L.vestColor).box(0, T * 0.64, cd * 1.05, cw * 1.45, T * 0.46, 0.06, L.vestColor)
    for (let i = 0; i < 3; i++) g.box((i - 1) * 0.075, T * 0.48, F * cd * 1.17, 0.06, 0.1, 0.045, 0x2b2d21)
  }
  // holes in the cloth, wounds, blood from feeding down the front
  const holes = 3 + Math.floor(r() * 3)
  for (let i = 0; i < holes; i++) {
    const a = r() * Math.PI * 2, y = 0.15 + r() * (T - 0.3), hw = y > 0.34 ? cw : ww, hd = y > 0.34 ? cd : wd
    const x = Math.cos(a) * hw * 1.0, z = Math.sin(a) * hd * 1.0, s = 0.05 + r() * 0.07
    const ry = Math.atan2(Math.cos(a) * hd, Math.sin(a) * hw)
    if (clothed(L) && r() < 0.5) g.blob(x, y, z, s * 0.55, s * 0.4 * (0.6 + r() * 0.8), s * 0.12, L.skin, 0, ry, r() * 0.8)
    g.wound(x * 1.01, y - s * 0.1, z * 1.01, s * (0.7 + r() * 0.4), ry, r())
  }
  if (!big && kind !== "stalker") {
    // blood from feeding: a soaked bib under the chin and streaks running down the front
    g.blob(0.01, T * 0.86, F * cd * 0.99, cw * 0.38, T * 0.1, 0.012, C.blood, 0.05, 0, 0.08)
    g.blob(-0.02, T * 0.7, F * cd * 1.0, cw * 0.17, T * 0.13, 0.012, C.blood, 0.04, 0, -0.2)
    g.blob(0.04, T * 0.55, F * cd * 0.99, cw * 0.07, T * 0.14, 0.01, C.gore, 0.02, 0, 0.1)
  }
  // exposed ribs (one side, both for the stalker)
  const ribSides = L.ribs === 2 ? [-1, 1] : L.ribs ? [L.ribs] : []
  for (const side of ribSides) {
    const x = side * cw * 0.42, y = T * 0.64
    g.blob(x, y, F * cd * 0.97, cw * 0.36, T * 0.2, 0.025, C.gore, 0, side * 0.25)
    for (let k = 0; k < 4; k++) g.blob(x, y - T * 0.13 + k * T * 0.085, F * cd * 1.01, cw * 0.32, 0.009, 0.012, C.bone, 0, side * 0.25, side * -0.18)
  }
  if (S.spine) for (let k = 0; k < 8; k++) g.lump(0, 0.08 + k * T * 0.12, cd * 0.98, 0.026, C.bone)
  // spitter: bloated bile sac + swollen throat
  if (S.belly) {
    const b = S.belly, bz = F * (wd * 0.4 + b * 0.42)
    g.ball(0, 0.21, bz, b, b * 0.9, b * 0.86, C.bile, 0.05).ball(b * 0.35, 0.3, bz - b * 0.15, b * 0.62, b * 0.55, b * 0.6, 0x8c9a4a, 0.04).ball(-b * 0.3, 0.12, bz - b * 0.2, b * 0.55, b * 0.5, b * 0.55, 0xa0a45a, 0.04)
    for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, y = 0.21 + (r() - 0.5) * b * 1.2; g.tube(Math.cos(a) * b * 0.5, y, bz - b * 0.6, Math.cos(a + 0.6) * b * 0.8, y + (r() - 0.5) * 0.1, bz - b * 0.35, 0.008, 0.006, 0x3b2f3e, 3) }
    g.ball(b * 0.35, 0.25, bz - b * 0.78, 0.055, 0.055, 0.035, C.acid, 1.4, true).ball(-b * 0.3, 0.13, bz - b * 0.72, 0.04, 0.04, 0.03, C.acid, 1.2, true).ball(-b * 0.05, 0.36, bz - b * 0.62, 0.03, 0.03, 0.02, C.acid, 1.2, true)
    g.ball(0, T + S.neck * 0.2, F * 0.055, S.throat! * 0.8, S.throat! * 0.6, S.throat! * 0.62, C.sac, 0.15)
  }
  // brute/boss: muscle mass, bone plates, tumours
  if (big) {
    const s = S.chestW
    for (const sx of [-1, 1]) {
      g.ball(sx * s * 0.24, T * 0.7, F * cd * 0.72, s * 0.25, T * 0.18, cd * 0.42, L.skin)
      g.ball(sx * s * 0.3, T - 0.02, cd * 0.1, s * 0.28, T * 0.17, cd * 0.82, L.skin)
      g.blob(sx * s * 0.42, T + 0.03, 0, s * 0.19, 0.055 * s, cd * 0.7, C.plate, 0.1, 0, sx * -0.35)
      g.blob(sx * s * 0.36, T * 0.84, cd * 0.62, s * 0.16, 0.05 * s, cd * 0.42, C.plate, 0.6, 0, sx * -0.3)
    }
    for (let k = 0; k < 3; k++) g.blob(0, T * (0.35 + k * 0.2), cd * 0.96, s * (0.3 - k * 0.035), T * 0.1, 0.06 * s, C.plate, -0.25, 0, 0)
    g.ball(0, T * 0.36, F * cd * 0.78, ww * 0.85, T * 0.2, cd * 0.62, L.skin)
    for (let i = 0; i < 6; i++) g.lump(-s * 0.36 + r() * 0.14, T * (0.72 + r() * 0.22), F * cd * 0.4 + (r() - 0.5) * cd * 0.8, s * (0.06 + r() * 0.06), r() < 0.5 ? C.muscle : 0x8e6a5a)
    g.box(s * 0.12, T * 0.55, F * cd * 1.22, s * 0.24, T * 0.2, 0.03, C.muscle, 0, 0.2, 0.2).box(-s * 0.18, T * 0.5, F * cd * 1.2, s * 0.12, T * 0.12, 0.03, C.wound)
  }
  if (S.spikes) {
    for (let i = 0; i < 8; i++) {
      const x = (r() - 0.5) * cw * 1.4, y = T * (0.45 + r() * 0.5), z = cd * 0.95
      g.spike(x, y, z, x * 1.3, y + 0.15, z + 0.3 + r() * 0.25, 0.05 + r() * 0.04, C.bone)
    }
  }
  if (S.weakSpot) {
    // glowing pustule cluster between the shoulder plates (×2 damage)
    const wy = T * WEAK_SPOT.y, wz = cd + 0.04
    g.ball(0, wy, wz - 0.03, 0.38, 0.34, 0.16, C.gore)
    g.ball(0, wy, wz + 0.04, 0.25, 0.23, 0.15, C.weak, 1.3).ball(0.18, wy + 0.13, wz + 0.02, 0.1, 0.1, 0.08, C.weak, 1.1).ball(-0.16, wy - 0.12, wz + 0.02, 0.09, 0.09, 0.07, C.weak, 1)
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.tube(Math.cos(a) * 0.2, wy + Math.sin(a) * 0.2, wz, Math.cos(a) * 0.44, wy + Math.sin(a) * 0.4, wz - 0.06, 0.025, 0.012, 0x6a1a10, 4) }
  }
  return g.build()
}

/** Boss weak spot in torso-local coordinates (y as a fraction of torsoLen). */
export const WEAK_SPOT = { y: 0.66, radius: 0.42 }

/** Jaw hinge in head-local coordinates. */
export function jawHinge(S: BodySpec): [number, number, number] { return [0, S.headR * 0.55 * S.headS[1], -S.headR * 0.08] }

function headSeg(kind: InfectedKind, S: BodySpec, L: Look, r: () => number): THREE.BufferGeometry {
  const g = new GeoBuilder()
  const h = S.headR, [sx, sy, sz] = S.headS, F = -1
  const big = !!S.plates
  const scalp = L.hair !== null && !L.helmet ? L.hair : L.skin
  g.loft([
    { y: -0.01, w: h * 0.42 * sx, d: h * 0.45 * sz, z: h * 0.14, c: L.skin },
    { y: h * 0.5 * sy, w: h * 0.78 * sx, d: h * 0.86 * sz, z: -h * 0.04, c: L.skin },
    { y: h * 0.95 * sy, w: h * 0.9 * sx, d: h * 1.0 * sz, z: -h * 0.02, c: L.skin },
    { y: h * 1.35 * sy, w: h * 0.9 * sx, d: h * 1.02 * sz, z: h * 0.02, c: L.skin },
    { y: h * 1.72 * sy, w: h * 0.72 * sx, d: h * 0.88 * sz, z: h * 0.07, c: scalp },
    { y: h * 1.98 * sy, w: h * 0.3 * sx, d: h * 0.4 * sz, z: h * 0.08, c: scalp },
  ], 9)
  const fz = F * h * 0.98 * sz
  // brow ridge, cheekbones, sunken sockets with glowing eyes
  for (const bx of [-1, 1]) g.blob(bx * h * 0.36 * sx, h * 1.27 * sy, fz * 0.9, h * 0.36 * sx, h * 0.11, h * 0.16, dim(L.skin, 0.88), -0.25, 0, bx * -0.18)
  for (const ex of [-1, 1]) {
    const x = ex * h * 0.36 * sx, y = h * 1.07 * sy
    g.blob(ex * h * 0.58 * sx, h * 0.86 * sy, fz * 0.8, h * 0.17, h * 0.1, h * 0.13, dim(L.skin, 0.95), 0, ex * 0.3)
    g.ball(x, y, fz * 0.9, h * 0.18, h * 0.14, h * 0.12, dim(L.skin, 0.35), 0, true)
    if (L.missingEye && ex === 1) g.ball(x, y - h * 0.02, fz * 0.97, h * 0.12, h * 0.1, h * 0.05, C.wound, 0, true)
    else g.ball(x, y, fz * 0.97, h * 0.11, h * 0.09, h * 0.06, L.eye, 1, true)
  }
  // rotted nose: bridge, tip and dark nostrils
  g.blob(0, h * 0.92 * sy, fz * 1.0, h * 0.1, h * 0.2, h * 0.1, dim(L.skin, 0.9), -0.35)
  g.blob(0, h * 0.78 * sy, fz * 1.04, h * 0.13, h * 0.09, h * 0.08, dim(L.skin, 0.8))
  for (const nx of [-1, 1]) g.ball(nx * h * 0.06, h * 0.74 * sy, fz * 1.06, h * 0.04, h * 0.03, h * 0.03, C.dark, 0, true)
  // lipless upper jaw: gums and teeth
  g.blob(0, h * 0.55 * sy, fz * 0.88, h * 0.48 * sx, h * 0.08, h * 0.13, C.gore)
  for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.24; g.box(Math.sin(a) * h * 0.42 * sx, h * 0.46 * sy, fz * (0.88 + Math.cos(a) * 0.06), h * 0.1, h * 0.15 + r() * h * 0.07, h * 0.07, C.teeth, 0, a, (r() - 0.5) * 0.3) }
  if (L.cheek) {
    g.blob(L.cheek * h * 0.62 * sx, h * 0.62 * sy, fz * 0.62, h * 0.07, h * 0.22, h * 0.26, C.gore, 0, L.cheek * 0.5)
    for (let i = 0; i < 3; i++) g.box(L.cheek * h * 0.66 * sx, h * 0.5 * sy, fz * (0.45 + i * 0.12), h * 0.07, h * 0.12, h * 0.08, C.teeth)
  }
  // ears (one torn)
  g.blob(-h * 0.9 * sx, h * 1.0 * sy, h * 0.05, h * 0.05, h * 0.2, h * 0.14, dim(L.skin, 0.92), 0, 0, 0.15)
  if (r() < 0.6) g.blob(h * 0.9 * sx, h * 1.0 * sy, h * 0.05, h * 0.05, h * 0.2, h * 0.14, dim(L.skin, 0.92), 0, 0, -0.15); else g.blob(h * 0.88 * sx, h * 1.0 * sy, h * 0.05, h * 0.045, h * 0.11, h * 0.1, C.gore)
  // scalp: wounds, stringy hair or a helmet
  g.blob((r() - 0.5) * h * 0.6, h * 1.82 * sy, (r() - 0.3) * h * 0.4, h * 0.28, h * 0.05, h * 0.22, C.gore, 0.4, r(), 0.2)
  if (L.helmet) {
    g.ball(0, h * 1.38 * sy, h * 0.06, h * sx * 1.08, h * sy * 0.82, h * sz * 1.12, 0x3f4430)
    g.box(0, h * 1.12 * sy, h * 0.06, h * sx * 2.1, h * 0.1, h * sz * 2.05, 0x353a28)
  } else if (L.hair !== null) {
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 1.5 - 0.25 + Math.PI * 0.25, x = Math.cos(a) * h * sx * 0.78, z = Math.sin(a) * h * sz * 0.86 + h * 0.12
      const len = h * (0.5 + r() * 1.4)
      const y0 = h * 1.72 * sy, dx = Math.cos(a) * h * 0.25, dz = Math.sin(a) * h * 0.25
      g.tube(x * 0.8, y0, z * 0.8, x + dx, y0 - len, z + dz, h * 0.07, h * 0.02, L.hair, 4)
    }
  }
  if (big) {
    g.blob(0, h * 1.62 * sy, h * 0.05, h * 0.82 * sx, h * 0.2, h * 0.85 * sz, C.plate, 0.15)
    for (const ex of [-1, 1]) g.spike(ex * h * 0.6, h * 1.5, h * 0.2, ex * h * 1.05, h * 2.1, h * 0.5, h * 0.18, C.bone)
  }
  if (kind === "screamer") g.box(0, h * 0.42 * sy, fz * 0.45, h * 0.95, h * 0.55, h * 0.8, C.dark) // huge throat opening
  if (kind === "stalker") for (const ex of [-1, 1]) g.box(ex * h * 0.36 * sx, h * 1.07 * sy, fz * 1.0, h * 0.2, h * 0.04, h * 0.02, C.dark) // slit lids
  return g.build()
}

function jawSeg(kind: InfectedKind, S: BodySpec, L: Look, r: () => number): THREE.BufferGeometry {
  const g = new GeoBuilder()
  const h = S.headR, [sx, , sz] = S.headS, F = -1, len = h * (kind === "screamer" ? 1.2 : 0.95) * sz, w = h * (S.plates ? 1.4 : 1.15) * sx
  g.loft([
    { y: -h * 0.36, w: w * 0.32, d: len * 0.18, z: F * len * 0.78, c: L.skin },
    { y: -h * 0.24, w: w * 0.5, d: len * 0.42, z: F * len * 0.55, c: L.skin },
    { y: -h * 0.04, w: w * 0.55, d: len * 0.5, z: F * len * 0.48, c: dim(L.skin, 0.9) },
  ], 8)
  g.box(0, -h * 0.03, F * len * 0.5, w * 0.78, h * 0.05, len * 0.8, C.gore) // tongue / inside
  for (let i = 0; i < 6; i++) { const a = (i - 2.5) * 0.26; g.box(Math.sin(a) * w * 0.34, h * 0.03, F * (len * 0.84 + Math.cos(a) * h * 0.04), h * 0.09, h * 0.13 + r() * h * 0.05, h * 0.07, C.teeth, 0, a) }
  g.blob(0, -h * 0.26, F * len * 0.9, w * 0.32, h * 0.1, h * 0.05, C.blood).blob(0.01, -h * 0.44, F * len * 0.84, w * 0.13, h * 0.13, h * 0.04, C.blood)
  return g.build()
}

function armSegs(S: BodySpec, L: Look, side: number, r: () => number, kind: InfectedKind): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const up = new GeoBuilder(), fo = new GeoBuilder()
  const sleeve = clothed(L) && L.top !== "tank" && L.sleeves !== "none" ? L.topColor : -1
  const sleeveLen = sleeve < 0 ? 0 : L.sleeves === "long" ? 1 : 0.45
  const big = !!S.plates, A = S.upperArm, Fa = S.foreArm, R = S.armR, Q = S.foreR, F = -1
  up.loft([
    { y: 0.04, w: R * 1.0, d: R * 1.0, c: L.skin },
    { y: -0.05, w: R * (big ? 1.35 : 1.22), d: R * 1.12, c: L.skin },
    { y: -A * 0.55, w: R * 0.95, d: R * 0.9, c: L.skin },
    { y: -A - 0.012, w: R * 0.8, d: R * 0.8, c: dim(L.skin, 0.92) },
  ], 7)
  if (sleeveLen > 0) up.loft([{ y: 0.05, w: R * 1.18, d: R * 1.15, c: sleeve }, { y: -0.05, w: R * 1.4, d: R * 1.3, c: sleeve }, { y: -A * sleeveLen * 0.98, w: R * 1.15, d: R * 1.1, c: sleeve, jag: 0.05 }], 7, sleeveLen === 1 ? 0 : 0)
  up.wound(side * R * 0.95, -A * (0.3 + r() * 0.45), F * R * 0.2, R * 1.6, side * 1.25 + Math.PI / 2)
  if (big) up.blob(side * R * 1.0, -A * 0.3, 0, R * 0.32, A * 0.3, R * 0.8, C.plate, 0, 0, side * 0.1)
  // forearm
  const club = S.club && side > 0
  fo.loft([
    { y: 0.035, w: Q * 1.0, d: Q * 0.95, c: L.skin },
    { y: -Fa * 0.28, w: Q * (big ? 1.35 : 1.18), d: Q * 1.05, c: L.skin },
    { y: -Fa * 0.82, w: Q * 0.74, d: Q * 0.62, c: dim(L.skin, 0.9) },
    { y: -Fa, w: Q * 0.7, d: Q * 0.56, c: C.blood },
  ], 7)
  if (sleeveLen === 1) fo.loft([{ y: 0.05, w: Q * 1.2, d: Q * 1.15, c: sleeve }, { y: -Fa * (0.35 + r() * 0.3), w: Q * 1.28, d: Q * 1.2, c: sleeve, jag: 0.06 }], 7, 0)
  else if (r() < 0.45) {
    // flesh torn open down to the bone
    fo.blob(side * Q * 0.75, -Fa * 0.5, F * Q * 0.3, Q * 0.55, Fa * 0.24, Q * 0.6, C.gore, 0, side * 0.3).tube(side * Q * 0.95, -Fa * 0.28, F * Q * 0.45, side * Q * 0.85, -Fa * 0.72, F * Q * 0.45, 0.011, 0.01, C.bone, 4)
  }
  const hy = -Fa
  if (club) {
    fo.ball(0, -Fa * 0.55, 0, Q * 1.7, Fa * 0.55, Q * 1.6, L.skin)
    fo.ball(0, -Fa - S.hand * 0.3, 0, Q * 1.9, S.hand * 0.9, Q * 1.8, C.plate)
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; fo.spike(Math.cos(a) * Q * 1.4, -Fa - S.hand * 0.3, Math.sin(a) * Q * 1.4, Math.cos(a) * Q * 2.6, -Fa - S.hand * 0.5, Math.sin(a) * Q * 2.6, Q * 0.35, C.bone) }
  } else if (big) {
    fo.blob(side * Q, -Fa * 0.5, 0, Q * 0.34, Fa * 0.4, Q * 0.95, C.plate, 0, 0, side * 0.08)
    fo.loft([{ y: hy + 0.02, w: Q * 1.05, d: Q * 0.85, c: L.skin }, { y: hy - S.hand * 0.55, w: Q * 1.2, d: Q * 0.95, c: dim(L.skin, 0.85) }, { y: hy - S.hand * 0.9, w: Q * 1.0, d: Q * 0.8, c: C.blood }], 7)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * Q * 0.5
      if (kind === "boss") fo.spike(x, hy - S.hand * 0.8, F * Q * 0.3, x * 1.2, hy - S.hand * 0.8 - S.claw, F * Q * 0.3 - S.claw * 0.6, Q * 0.18, C.nail)
      else fo.box(x, hy - S.hand * 0.92, F * Q * 0.35, Q * 0.38, S.hand * 0.32, Q * 0.45, C.nail)
    }
  } else {
    // bloody hand, long fingers with claws
    const hw = Q * 1.25
    fo.loft([{ y: hy + 0.01, w: Q * 0.85, d: Q * 0.5, c: C.blood }, { y: hy - S.hand * 0.55, w: hw, d: Q * 0.42, z: F * 0.008, c: dim(L.skin, 0.75) }], 6)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * hw * 0.55, fl = S.hand * 0.62, by = hy - S.hand * 0.5
      fo.tube(x, by, F * 0.008, x * 1.1, by - fl * 0.7, F * fl * 0.3, 0.009, 0.007, i % 2 ? C.blood : L.skin, 4)
      fo.tube(x * 1.1, by - fl * 0.7, F * fl * 0.3, x * 1.12, by - fl, F * fl * 0.62, 0.007, 0.006, L.skin, 4)
      fo.spike(x * 1.12, by - fl, F * fl * 0.62, x * 1.14, by - fl - S.claw * 0.5, F * (fl * 0.62 + S.claw), 0.007, C.nail)
    }
    fo.tube(-side * hw * 0.8, hy - S.hand * 0.1, F * 0.01, -side * hw * 1.1, hy - S.hand * 0.5, F * 0.04, 0.009, 0.007, L.skin, 4) // thumb
  }
  return [up.build(), fo.build()]
}

function legSegs(S: BodySpec, L: Look, side: number, r: () => number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const th = new GeoBuilder(), sh = new GeoBuilder()
  const pants = L.pantsColor, Th = S.thigh, Sh = S.shin, R = S.thighR, Q = S.shinR, F = -1
  const fullPants = L.pants === "long" || L.pants === "torn"
  th.loft([
    { y: 0.045, w: R * 1.0, d: R * 1.0, c: fullPants ? pants : L.skin },
    { y: -0.06, w: R * 1.15, d: R * 1.1, c: fullPants ? pants : L.skin },
    { y: -Th * 0.62, w: R * 0.92, d: R * 0.9, c: fullPants ? pants : L.skin },
    { y: -Th - 0.012, w: R * 0.75, d: R * 0.75, c: fullPants ? dim(pants, 0.9) : L.skin },
  ], 7)
  if (!fullPants) th.loft([{ y: 0.05, w: R * 1.15, d: R * 1.15, c: pants }, { y: -0.06, w: R * 1.32, d: R * 1.28, c: pants }, { y: -Th * (L.pants === "shorts" ? 0.45 : 0.25), w: R * 1.2, d: R * 1.15, c: pants, jag: 0.06 }], 7, 0)
  for (let i = 0; i < 2; i++) { const a = r() * Math.PI * 2; th.wound(Math.cos(a) * R * 0.95, -Th * (0.25 + r() * 0.5), Math.sin(a) * R * 0.95, R * 1.3, Math.atan2(Math.cos(a), Math.sin(a))) }
  if (S.plates) th.blob(side * R * 0.95, -Th * 0.4, 0, R * 0.32, Th * 0.3, R * 0.85, C.plate, 0, 0, side * 0.08)
  // shin + foot
  const torn = L.pants === "torn" ? 0.35 + r() * 0.35 : L.pants === "long" ? 1 : 0
  sh.loft([
    { y: 0.035, w: Q * 1.0, d: Q * 1.0, c: L.skin },
    { y: -Sh * 0.3, w: Q * 1.12, d: Q * 1.1, z: Q * 0.12, c: L.skin },
    { y: -Sh * 0.85, w: Q * 0.66, d: Q * 0.62, c: dim(L.skin, 0.85) },
    { y: -Sh, w: Q * 0.62, d: Q * 0.6, c: dim(L.skin, 0.75) },
  ], 7)
  if (torn > 0) sh.loft([{ y: 0.05, w: Q * 1.28, d: Q * 1.28, c: pants }, { y: -Sh * 0.3, w: Q * 1.36, d: Q * 1.34, z: Q * 0.1, c: dim(pants, 0.92) }, { y: -Sh * torn * 0.97, w: Q * 1.18, d: Q * 1.15, c: dim(pants, 0.75), jag: torn < 1 ? 0.07 : 0.02 }], 7, 0)
  const fy = -Sh - S.foot * 0.5, fl = S.plates ? 0.36 * (S.foot / 0.07) : 0.25
  if (L.shoes !== null && !S.plates) {
    sh.box(0, fy, F * fl * 0.1, Q * 1.75, S.foot * 1.2, fl * 0.72, L.shoes).box(0, fy - S.foot * 0.5, F * fl * 0.2, Q * 1.8, S.foot * 0.3, fl * 0.94, dim(L.shoes, 0.6))
    sh.blob(0, fy - S.foot * 0.05, F * fl * 0.52, Q * 0.88, S.foot * 0.62, fl * 0.24, L.shoes)
  } else {
    sh.box(0, fy, F * fl * 0.18, Q * 2.0, S.foot * 1.05, fl, dim(L.skin, 0.75))
    for (let i = 0; i < 4; i++) sh.box((i - 1.5) * Q * 0.5, fy - S.foot * 0.15, F * fl * 0.7, Q * 0.38, S.foot * 0.5, 0.035, C.nail)
    sh.box(0, fy + S.foot * 0.25, F * fl * 0.05, Q * 1.5, S.foot * 0.35, fl * 0.55, C.blood)
  }
  if (S.plates) sh.blob(0, -Sh * 0.45, F * Q * 0.95, Q * 0.85, Sh * 0.34, Q * 0.32, C.plate, -0.05)
  return [th.build(), sh.build()]
}

export interface VariantGeo { segs: Record<SegName, THREE.BufferGeometry | null>; lod: THREE.BufferGeometry | null }

function kindSeed(kind: InfectedKind): number { let h = 2166136261; for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619); return h >>> 0 }

export function buildVariant(kind: InfectedKind, variant: number, detail = 1): VariantGeo {
  DETAIL = detail
  try { return buildVariantAt(kind, variant) } finally { DETAIL = 1 }
}

function buildVariantAt(kind: InfectedKind, variant: number): VariantGeo {
  const r = makeRng(kindSeed(kind) + variant * 7919)
  const S = SPECS[kind], L = makeLook(kind, r)
  const [ual, fal] = armSegs(S, L, -1, r, kind), [uar, far] = armSegs(S, L, 1, r, kind)
  const legs = S.legs ? [...legSegs(S, L, -1, r), ...legSegs(S, L, 1, r)] : [null, null, null, null]
  return {
    segs: {
      torso: torsoSeg(kind, S, L, r), head: headSeg(kind, S, L, r), jaw: jawSeg(kind, S, L, r),
      upperArmL: ual, foreArmL: fal, upperArmR: uar, foreArmR: far, thighL: legs[0], shinL: legs[1], thighR: legs[2], shinR: legs[3],
    },
    lod: null,
  }
}

// ------------------------------------------------------------------ material + asset cache

/** Shared vertex-coloured material; `glow` (per vertex) × uGlow adds emissive (eyes, sacs, weak spot). */
export function createInfectedMaterial(glow: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 })
  m.onBeforeCompile = shader => {
    shader.uniforms.uGlow = glow
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;")
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uGlow;\nvarying float vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uGlow;")
  }
  m.customProgramCacheKey = () => "iv-infected-glow"
  return m
}

export class InfectedAssets {
  readonly glow = { value: 0.6 }
  readonly material = createInfectedMaterial(this.glow)
  private cache = new Map<string, VariantGeo>()

  get(kind: InfectedKind, variant: number): VariantGeo {
    const key = kind + ":" + variant
    let v = this.cache.get(key)
    if (!v) { v = buildVariant(kind, variant); this.cache.set(key, v) }
    return v
  }

  /** Static merged pose for distant infected (built once per variant from a posed rig). */
  lod(kind: InfectedKind, variant: number, posed: Rig): THREE.BufferGeometry {
    const v = this.get(kind, variant)
    if (!v.lod) {
      // bake the posed rig with a low-detail copy of every segment (same look, far fewer triangles)
      const low = buildVariant(kind, variant, 0.45)
      const names: Record<string, SegName> = { torsoMesh: "torso", headMesh: "head", jaw: "jaw", upperArmL: "upperArmL", foreArmL: "foreArmL", upperArmR: "upperArmR", foreArmR: "foreArmR", thighL: "thighL", shinL: "shinL", thighR: "thighR", shinR: "shinR" }
      const saved = posed.meshes.map(m => m.geometry)
      posed.meshes.forEach(m => { const seg = names[m.name]; const g = seg ? low.segs[seg] : null; if (g) m.geometry = g })
      try { v.lod = bakeRig(posed) } finally { posed.meshes.forEach((m, i) => { m.geometry = saved[i] }); for (const g of Object.values(low.segs)) g?.dispose() }
    }
    return v.lod
  }

  dispose(): void {
    for (const v of this.cache.values()) { for (const g of Object.values(v.segs)) g?.dispose(); v.lod?.dispose() }
    this.cache.clear(); this.material.dispose()
  }
}

// ------------------------------------------------------------------ rig

export interface Capsule { frame: THREE.Object3D; part: BodyPartId; ax: number; ay: number; az: number; bx: number; by: number; bz: number; r: number }

export interface Rig {
  kind: InfectedKind
  variant: number
  spec: BodySpec
  root: THREE.Group
  body: THREE.Group
  hips: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  jaw: THREE.Mesh
  armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group
  legL: THREE.Group | null; legR: THREE.Group | null; kneeL: THREE.Group | null; kneeR: THREE.Group | null
  meshes: THREE.Mesh[]
  capsules: Capsule[]
  lod: THREE.Mesh | null
  corpse: THREE.Mesh | null
}

function group(name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g }

export function createRig(assets: InfectedAssets, kind: InfectedKind, variant: number, root: THREE.Group): Rig {
  const S = SPECS[kind], v = assets.get(kind, variant), mat = assets.material
  const meshes: THREE.Mesh[] = []
  const mesh = (geo: THREE.BufferGeometry | null, parent: THREE.Object3D, name: string): THREE.Mesh | null => {
    if (!geo) return null
    const m = new THREE.Mesh(geo, mat); m.name = name; parent.add(m); meshes.push(m); return m
  }
  root.name = "Infizierter"
  const body = group("body", root), hips = group("hips", body, 0, S.hipH, 0)
  const torso = group("torso", hips)
  const head = group("head", torso, 0, S.torsoLen + S.neck, S.headZ)
  const jaw = new THREE.Mesh(v.segs.jaw!, mat); jaw.name = "jaw"; jaw.position.set(...jawHinge(S)); head.add(jaw); meshes.push(jaw)
  const armL = group("armL", torso, -S.shoulderX, S.torsoLen - 0.05, 0), armR = group("armR", torso, S.shoulderX, S.torsoLen - 0.05, 0)
  const elbowL = group("elbowL", armL, 0, -S.upperArm, 0), elbowR = group("elbowR", armR, 0, -S.upperArm, 0)
  let legL: THREE.Group | null = null, legR: THREE.Group | null = null, kneeL: THREE.Group | null = null, kneeR: THREE.Group | null = null
  const hipX = S.pelvisW * 0.3
  if (S.legs) {
    legL = group("legL", hips, -hipX, 0, 0); legR = group("legR", hips, hipX, 0, 0)
    kneeL = group("kneeL", legL, 0, -S.thigh, 0); kneeR = group("kneeR", legR, 0, -S.thigh, 0)
  }
  mesh(v.segs.torso, torso, "torsoMesh"); mesh(v.segs.head, head, "headMesh")
  mesh(v.segs.upperArmL, armL, "upperArmL"); mesh(v.segs.foreArmL, elbowL, "foreArmL")
  mesh(v.segs.upperArmR, armR, "upperArmR"); mesh(v.segs.foreArmR, elbowR, "foreArmR")
  if (legL && legR && kneeL && kneeR) { mesh(v.segs.thighL, legL, "thighL"); mesh(v.segs.shinL, kneeL, "shinL"); mesh(v.segs.thighR, legR, "thighR"); mesh(v.segs.shinR, kneeR, "shinR") }

  // hit capsules (generous minimum radius so thin limbs stay hittable)
  const caps: Capsule[] = []
  const cap = (frame: THREE.Object3D, part: BodyPartId, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) => caps.push({ frame, part, ax, ay, az, bx, by, bz, r: Math.max(0.06, r) })
  const hy = S.headR * 0.95
  cap(head, "head", 0, hy - S.headR * 0.25, -S.headR * 0.1, 0, hy + S.headR * 0.2, 0, S.headR * 1.08)
  cap(torso, "torso", 0, S.legs ? 0.0 : 0.02, 0, 0, S.torsoLen - Math.min(S.chestW, S.chestD) * 0.3, 0, Math.max(S.chestW * 0.42, S.chestD * 0.55))
  if (S.belly) cap(torso, "torso", 0, 0.2, -(S.waistD * 0.35 + S.belly * 0.35), 0, 0.2, -(S.waistD * 0.35 + S.belly * 0.35), S.belly)
  cap(armL, "armL", 0, 0, 0, 0, -S.upperArm, 0, S.armR * 1.4); cap(elbowL, "armL", 0, 0, 0, 0, -S.foreArm - S.hand * 0.8, 0, S.foreR * 1.5)
  cap(armR, "armR", 0, 0, 0, 0, -S.upperArm, 0, S.armR * 1.4); cap(elbowR, "armR", 0, 0, 0, 0, -S.foreArm - S.hand * 0.8, 0, S.foreR * (S.club ? 2 : 1.5))
  if (legL && legR && kneeL && kneeR) {
    cap(legL, "legL", 0, 0, 0, 0, -S.thigh, 0, S.thighR * 1.25); cap(kneeL, "legL", 0, 0, 0, 0, -S.shin - S.foot * 0.5, -0.04, S.shinR * 1.45)
    cap(legR, "legR", 0, 0, 0, 0, -S.thigh, 0, S.thighR * 1.25); cap(kneeR, "legR", 0, 0, 0, 0, -S.shin - S.foot * 0.5, -0.04, S.shinR * 1.45)
  }
  return { kind, variant, spec: S, root, body, hips, torso, head, jaw, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, meshes, capsules: caps, lod: null, corpse: null }
}

/**
 * Applies a pose. Conventions: bodyPitch -π/2 = lying face down (falls about the feet), +π/2 = on the back; bodyRoll
 * ±π/2 = on a side; bodyLie 1 = lifted by the lying offset; hipsDrop = fraction of hip height lowered; pitch of
 * torso/head negative = bend forward; arm/leg pitch positive = swing forward; spread positive = away from the body;
 * elbow/knee positive = bend; jaw 0..1 open.
 */
export function applyPose(rig: Rig, p: Float32Array): void {
  const S = rig.spec
  rig.body.rotation.set(p[P.bodyPitch], 0, p[P.bodyRoll])
  rig.body.position.set(0, p[P.bodyLie] * S.lie + p[P.bodyLift], -p[P.bodyFwd])
  rig.hips.position.y = S.hipH * (1 - p[P.hipsDrop])
  // the rest hunch straightens out while lying so corpses end flat
  rig.torso.rotation.set(S.hunch * Math.max(0, 1 - p[P.bodyLie]) + p[P.torsoPitch], p[P.torsoYaw], p[P.torsoRoll])
  rig.head.rotation.set(p[P.headPitch], p[P.headYaw], p[P.headRoll])
  rig.jaw.rotation.x = -p[P.jaw] * S.jawMax
  rig.armL.rotation.set(p[P.armLPitch], 0, -p[P.armLSpread]); rig.elbowL.rotation.x = p[P.elbowL]
  rig.armR.rotation.set(p[P.armRPitch], 0, p[P.armRSpread]); rig.elbowR.rotation.x = p[P.elbowR]
  if (rig.legL && rig.legR && rig.kneeL && rig.kneeR) {
    rig.legL.rotation.set(p[P.legLPitch], 0, -p[P.legLSpread]); rig.kneeL.rotation.x = -p[P.kneeL]
    rig.legR.rotation.set(p[P.legRPitch], 0, p[P.legRSpread]); rig.kneeR.rotation.x = -p[P.kneeR]
  }
}

const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4()

/** Merges every visible rig mesh (in the current pose) into one geometry in root-local space. */
export function bakeRig(rig: Rig): THREE.BufferGeometry {
  rig.root.updateMatrixWorld(true)
  _inv.copy(rig.root.matrixWorld).invert()
  const b = new GeoBuilder()
  for (const m of rig.meshes) {
    let vis = true
    for (let o: THREE.Object3D | null = m; o && o !== rig.root; o = o.parent) if (!o.visible) { vis = false; break }
    if (!vis) continue
    _rel.multiplyMatrices(_inv, m.matrixWorld)
    b.addBaked(m.geometry, _rel)
  }
  return b.build()
}
