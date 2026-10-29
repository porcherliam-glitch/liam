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
import { SURF, withSurface } from "./surface"
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
  plate: 0xb8a988, muscle: 0x8a3027, bile: 0x9aa457, sac: 0xa9b35e, acid: 0x9cff52, weak: 0xffa236,
}
const SKINS = [0x9aa18a, 0x8a9a76, 0xa8a38c, 0x7f8a6e, 0x9c9894, 0x8a826e, 0x93907c]
const EYES: Record<InfectedKind, number> = { walker: 0xf2e7a6, runner: 0xff7a3a, screamer: 0xe6f0ff, spitter: 0xbdff6a, stalker: 0x9fd8ff, crawler: 0xf2e7a6, brute: 0xffb24a, boss: 0xff8a1e }
const CIV_TOPS = [0x6b4a3a, 0x3d4f66, 0x7a7466, 0x5e2b2b, 0x4a5a3a, 0x8a7a5a, 0x2e3440, 0x6a6a72, 0x7c5a2e]
const CIV_PANTS = [0x3d4b66, 0x4b4236, 0x3a3a3c, 0x5a5444, 0x48505a, 0x5b4a3a]
const SHOES = [0x2a2420, 0x4a4a4a, 0x5e554c, 0x1c1a18]
const HAIR = [0x1c1612, 0x3a2a1c, 0x5a4a32, 0x2a2a2a, 0x6c6560]

/** Surface type (surface.ts) of each colour of the variant being built: skin, clothes, wet gore, bone … */
const SURF_OF = new Map<number, number>()
const surfOf = (c: number) => SURF_OF.get(c) ?? SURF.paint
const WET = [C.wound, C.flesh, C.blood, C.gore, C.muscle, C.gut, C.dark, 0x6e1e14, 0x4a0c08, 0x5c1810, 0x4a0b07, 0x6a1a10, 0x5e2b2b]
function classify(L: Look): void {
  SURF_OF.clear()
  for (const c of WET) SURF_OF.set(c, SURF.wet)
  for (const c of [C.bile, C.sac]) SURF_OF.set(c, SURF.wet)
  for (const c of [...CIV_TOPS, ...CIV_PANTS, L.topColor, L.vestColor, L.pantsColor, 0x8fa7a0, 0x9fb0b6, 0xa49c8c, 0xc4c2b6, 0x55595e, 0x4b5235, 0x454a35, 0x2e3640, 0x50545a, 0x3a3d2c, 0x6a6a5a, 0x2a2a26, 0x3a332a]) if (c !== L.skin) SURF_OF.set(c, SURF.fabric)
  for (const c of [...SHOES, ...HAIR, 0x1e1e18, 0x1a1a1a, 0x2a2018]) SURF_OF.set(c, SURF.polymer)
  if (L.hair !== null) SURF_OF.set(L.hair, SURF.polymer)
  if (L.shoes !== null) SURF_OF.set(L.shoes, SURF.polymer)
  for (const c of [...SKINS, L.skin]) SURF_OF.set(c, SURF.skin)
}

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
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color(), _cP = new THREE.Color(), _cW = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0)

function hash3(x: number, y: number, z: number): number { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h) }

export interface Ring { y: number; w: number; d: number; x?: number; z?: number; c: number; jag?: number }
/** Loft modifiers: radial offset per vertex (angle a: 0 = +X, π/2 = +Z / back; v: 0..1 along the loft) and recolouring (return a surface type to override it). */
export interface LoftFx { deform?: (a: number, y: number, v: number, x: number, z: number) => number; paint?: (a: number, y: number, v: number, c: THREE.Color, x: number, z: number) => number | void }

/** Accumulates transformed primitives into one indexed geometry (position, normal, color, glow). */
export class GeoBuilder {
  pos: number[] = []; nor: number[] = []; col: number[] = []; glow: number[] = []; surf: number[] = []; idx: number[] = []
  /** 1 = loft vertex whose normal is recomputed from the mesh at build; primitives keep their own (no seams). */
  private lofted: number[] = []
  /** Recompute normals from the mesh at build (true for close-up segments: smooth lofts, carved wounds). */
  smooth = DETAIL >= 1

  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: number, glow = 0, jitter = 0.09): this {
    const p = g.attributes.position, n = g.attributes.normal, base = this.pos.length / 3
    _nm.getNormalMatrix(m); _c.setHex(color)
    const st = surfOf(color)
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z)
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z)
      // grime: per-vertex jitter + darker toward the bottom of each piece
      const k = 1 + (hash3(_v.x, _v.y, _v.z) - 0.5) * 2 * jitter
      this.col.push(_c.r * k, _c.g * k, _c.b * k); this.glow.push(glow); this.surf.push(st); this.lofted.push(0)
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i))
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i)
    return this
  }

  /** Appends another baked geometry (same attribute layout) transformed by m. */
  addBaked(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, gl = g.attributes.glow, sf = g.attributes.surf, base = this.pos.length / 3
    _nm.getNormalMatrix(m)
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z)
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z)
      this.col.push(c.getX(i), c.getY(i), c.getZ(i)); this.glow.push(gl.getX(i)); this.surf.push(sf ? sf.getX(i) : 0); this.lofted.push(0)
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
    g.setAttribute("surf", new THREE.Float32BufferAttribute(this.surf, 1))
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    if (this.smooth) {
      g.computeVertexNormals()
      const nn = g.attributes.normal as THREE.BufferAttribute
      for (let i = 0; i < this.lofted.length; i++) if (!this.lofted[i]) nn.setXYZ(i, this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2])
    }
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
   * Close-up builds insert Catmull-Rom sub-rings between the given rings (smooth silhouettes); `fx.deform` pushes each
   * vertex along its radial direction (muscles, ribs, folds) and `fx.paint` may recolour it.
   */
  loft(rings: Ring[], segs = 8, caps = 3, glow = 0, jitter = 0.08, fx?: LoftFx): this {
    const hi = DETAIL >= 1
    segs = Math.max(5, Math.round(segs * (hi ? 2.1 : 1.5) * DETAIL))
    const sub = hi ? 3 : 1, base = this.pos.length / 3, n0 = rings.length
    const down = rings[n0 - 1].y < rings[0].y
    // expanded ring list (interpolated parameters, colour and the jag weight of the nearest given rings)
    const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
    const R: { y: number; w: number; d: number; x: number; z: number; jag: number; c0: number; c1: number; t: number; v: number }[] = []
    for (let k = 0; k < n0 - 1; k++) {
      const A = rings[Math.max(0, k - 1)], B = rings[k], Cn = rings[k + 1], D = rings[Math.min(n0 - 1, k + 2)]
      for (let s = 0; s < sub; s++) {
        const t = s / sub
        R.push({
          y: cr(A.y, B.y, Cn.y, D.y, t), w: Math.max(0.002, cr(A.w, B.w, Cn.w, D.w, t)), d: Math.max(0.002, cr(A.d, B.d, Cn.d, D.d, t)),
          x: cr(A.x ?? 0, B.x ?? 0, Cn.x ?? 0, D.x ?? 0, t), z: cr(A.z ?? 0, B.z ?? 0, Cn.z ?? 0, D.z ?? 0, t),
          jag: (B.jag ?? 0) * (1 - t) + (Cn.jag ?? 0) * t, c0: B.c, c1: Cn.c, t, v: (k + t) / (n0 - 1),
        })
      }
    }
    const L = rings[n0 - 1]
    R.push({ y: L.y, w: L.w, d: L.d, x: L.x ?? 0, z: L.z ?? 0, jag: L.jag ?? 0, c0: L.c, c1: L.c, t: 0, v: 1 })
    const n = R.length, cA = new THREE.Color(), cB = new THREE.Color()
    for (const ring of R) {
      cA.setHex(ring.c0); cB.setHex(ring.c1); _c.copy(cA).lerp(cB, ring.t)
      const st = surfOf(ring.t < 0.5 ? ring.c0 : ring.c1)
      for (let i = 0; i < segs; i++) {
        const a = (i + 0.5) / segs * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
        const jag = ring.jag ? (hash3(i * 1.7, 3.3, segs) - 0.5) * ring.jag * 2 : 0
        const nl = Math.hypot(ca * ring.d, sa * ring.w) || 1, rx = ca * ring.d / nl, rz = sa * ring.w / nl
        let x = ring.x + ca * ring.w, y = ring.y + jag, z = ring.z + sa * ring.d
        if (fx?.deform) { const off = fx.deform(a, y, ring.v, x, z); x += rx * off; z += rz * off }
        this.pos.push(x, y, z); this.nor.push(rx, 0, rz)
        const k = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter
        _cP.setRGB(_c.r * k, _c.g * k, _c.b * k)
        let stv = st
        if (fx?.paint) { const ps = fx.paint(a, y, ring.v, _cP, x, z); if (ps !== undefined) stv = ps }
        this.col.push(_cP.r, _cP.g, _cP.b); this.glow.push(glow); this.surf.push(stv); this.lofted.push(1)
      }
    }
    for (let r = 0; r < n - 1; r++) for (let i = 0; i < segs; i++) {
      const v00 = base + r * segs + i, v01 = base + r * segs + (i + 1) % segs, v10 = v00 + segs, v11 = v01 + segs
      if (down) this.idx.push(v00, v01, v10, v01, v11, v10); else this.idx.push(v00, v10, v01, v01, v10, v11)
    }
    const cap = (ri: number, bottom: boolean) => {
      const ring = R[ri], c = this.pos.length / 3
      _c.setHex(ring.c0)
      this.pos.push(ring.x, ring.y, ring.z); this.nor.push(0, bottom !== down ? -1 : 1, 0); this.col.push(_c.r, _c.g, _c.b); this.glow.push(glow); this.surf.push(surfOf(ring.c0)); this.lofted.push(0)
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
  /** Paints a stain (blood, dirt, a hole showing skin) onto everything built so far, with a ragged edge and optional drips running down (local -Y). */
  stain(x: number, y: number, z: number, radius: number, color: number, strength = 0.85, drip = 0, st?: number): this {
    const n = this.pos.length / 3
    _cW.setHex(color)
    for (let i = 0; i < n; i++) {
      const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2]
      const d = Math.hypot(px - x, py - y, pz - z) / (radius * (0.8 + hash3(px * 23, py * 23, pz * 23) * 0.45))
      let m = d < 1 ? Math.min(1, (1 - d) * 3) * strength : 0
      if (drip > 0 && py < y && y - py < drip) {
        const lane = Math.sin((px + pz) * 90 + x * 50) * 0.5 + 0.5, hd = Math.hypot(px - x, pz - z)
        if (hd < radius * 0.9 && lane > 0.55) m = Math.max(m, strength * 0.8 * (1 - (y - py) / drip) * (lane - 0.55) / 0.45)
      }
      if (m <= 0) continue
      this.col[i * 3] += (_cW.r - this.col[i * 3]) * m; this.col[i * 3 + 1] += (_cW.g - this.col[i * 3 + 1]) * m; this.col[i * 3 + 2] += (_cW.b - this.col[i * 3 + 2]) * m
      if (m > 0.45) this.surf[i] = st ?? surfOf(color)
    }
    return this
  }
  /**
   * Cuts a wound into everything built so far: vertices within `size` of the point sink along their normal (crater
   * with a raised raw rim), turn raw red → dark clotted in the middle and wet; blood runs down below it (local -Y).
   */
  carve(x: number, y: number, z: number, size: number, depth = 0.35, trail = 1): this {
    if (DETAIL < 1) { this.blob(x, y, z, size * 0.5, size * 0.42, size * 0.06, 0x6e1e14); return this }
    const n = this.pos.length / 3
    for (let i = 0; i < n; i++) {
      const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2]
      const dx = px - x, dy = py - y, dz = pz - z, d = Math.hypot(dx, dy, dz)
      const wob = 1 + (hash3(px * 9, py * 9, pz * 9) - 0.5) * 0.5
      const k = 1 - d / (size * wob)
      if (k > 0) {
        // displacement: deep centre, slightly raised torn rim
        const off = (-depth * k * k + 0.18 * Math.sin(Math.min(1, k * 3) * Math.PI) * (k < 0.33 ? 1 : 0)) * size
        const nx = this.nor[i * 3], ny = this.nor[i * 3 + 1], nz = this.nor[i * 3 + 2]
        this.pos[i * 3] += nx * off; this.pos[i * 3 + 1] += ny * off; this.pos[i * 3 + 2] += nz * off
        const col = k > 0.55 ? _cW.setHex(C.gore) : k > 0.22 ? _cW.setHex(k > 0.4 ? 0x6e1e14 : C.flesh) : _cW.setRGB(this.col[i * 3] * 0.7 + 0.12, this.col[i * 3 + 1] * 0.55, this.col[i * 3 + 2] * 0.5)
        const m = Math.min(1, k * 4)
        this.col[i * 3] += (col.r - this.col[i * 3]) * m; this.col[i * 3 + 1] += (col.g - this.col[i * 3 + 1]) * m; this.col[i * 3 + 2] += (col.b - this.col[i * 3 + 2]) * m
        if (k > 0.22) this.surf[i] = SURF.wet
      } else if (trail > 0 && py < y && y - py < size * 3.2 * trail) {
        // dried blood trail running down from the wound
        const hd = Math.hypot(dx, dz), wdt = size * (0.32 + 0.25 * Math.sin(py * 60 + x * 40)) * (1 - (y - py) / (size * 3.2 * trail))
        if (hd < wdt) {
          const m = 0.75 * (1 - hd / wdt)
          _cW.setHex(0x4a0c08)
          this.col[i * 3] += (_cW.r - this.col[i * 3]) * m; this.col[i * 3 + 1] += (_cW.g - this.col[i * 3 + 1]) * m; this.col[i * 3 + 2] += (_cW.b - this.col[i * 3 + 2]) * m
          if (m > 0.4) this.surf[i] = SURF.wet
        }
      }
    }
    return this
  }
  /**
   * Sculpted ellipsoid (centre, radii): a seamless lat-long grid where `fn(u, out)` returns the radial displacement in
   * radius units for unit direction u and may recolour `out` (return a surface type to override). Normals come from
   * the mesh, so carved sockets and ridges shade correctly.
   */
  sculpt(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number, fn: (u: THREE.Vector3, out: THREE.Color) => [number, number?], wSeg = 30, hSeg = 22): this {
    wSeg = Math.max(10, Math.round(wSeg * DETAIL)); hSeg = Math.max(8, Math.round(hSeg * DETAIL))
    const base = this.pos.length / 3, u = new THREE.Vector3(), st0 = surfOf(color)
    const vert = (theta: number, phi: number) => {
      u.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi))
      _cP.setHex(color)
      const [d, st] = fn(u, _cP), k = 1 + d
      const x = cx + u.x * rx * k, y = cy + u.y * ry * k, z = cz + u.z * rz * k
      this.pos.push(x, y, z); this.nor.push(u.x, u.y, u.z)
      const j = 1 + (hash3(x, y, z) - 0.5) * 0.12
      this.col.push(_cP.r * j, _cP.g * j, _cP.b * j); this.glow.push(0); this.surf.push(st ?? st0); this.lofted.push(1)
    }
    vert(0, 0)
    for (let i = 1; i < hSeg; i++) for (let j = 0; j < wSeg; j++) vert(i / hSeg * Math.PI, j / wSeg * Math.PI * 2)
    vert(Math.PI, 0)
    const ring = (i: number, j: number) => base + 1 + (i - 1) * wSeg + (j % wSeg), last = base + 1 + (hSeg - 1) * wSeg
    for (let j = 0; j < wSeg; j++) this.idx.push(base, ring(1, j + 1), ring(1, j))
    for (let i = 1; i < hSeg - 1; i++) for (let j = 0; j < wSeg; j++) this.idx.push(ring(i, j), ring(i, j + 1), ring(i + 1, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j))
    for (let j = 0; j < wSeg; j++) this.idx.push(last, ring(hSeg - 1, j), ring(hSeg - 1, j + 1))
    return this
  }
  /** Ellipsoid with a full rotation (flattened ones make organic wounds, scabs and bony plates). */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, ex = 0, ey = 0, ez = 0, glow = 0): this {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(ex, ey, ez)), _s.set(rx, ry, rz)); return this.add(DETAIL < 1 ? TPL.ballLo : TPL.ball, _m, color, glow, 0.12)
  }
  /** Bony plate grown out of the flesh: raw rim where it breaks through, the plate, a weathered ridge (thinnest axis = surface normal). */
  plate(x: number, y: number, z: number, rx: number, ry: number, rz: number, ex = 0, ey = 0, ez = 0): this {
    const thin = Math.min(rx, ry, rz), n = (v: number, k: number, o: number) => v === thin ? v * k : v * o
    this.blob(x, y, z, n(rx, 0.75, 1.13), n(ry, 0.75, 1.13), n(rz, 0.75, 1.13), 0x5c1810, ex, ey, ez)
    this.blob(x, y, z, rx, ry, rz, C.plate, ex, ey, ez)
    return this.blob(x, y, z, n(rx, 1.12, 0.5), n(ry, 1.12, 0.5), n(rz, 1.12, 0.5), 0x8a7a5c, ex, ey, ez)
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

const dim = (c: number, k: number) => { _c.setHex(c); _c.multiplyScalar(k); const h = _c.getHex(); if (!SURF_OF.has(h) && SURF_OF.has(c)) SURF_OF.set(h, SURF_OF.get(c)!); return h }
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
  const k = S.chestW / 0.35, bare = !clothed(L) || L.top === "tank", thin = kind === "runner" || kind === "stalker" || kind === "screamer" || kind === "crawler"
  const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }
  const torsoFx: LoftFx | undefined = big ? undefined : {
    deform: (a, y) => {
      let o = 0
      const back = angd(a, Math.PI / 2), front = angd(a, -Math.PI / 2)
      if (y > 0.15 && y < T) o -= 0.006 * k * Math.exp(-(back * back) / 0.03)
      if (y > T * 0.6) for (const sd of [-0.65, 0.65]) o += 0.01 * k * Math.exp(-((back - sd) ** 2) / 0.05) * Math.exp(-((y - T * 0.78) ** 2) / 0.006)
      if (y > T * 0.62 && y < T * 0.92) for (const sd of [-0.5, 0.5]) o += (bare ? 0.012 : 0.006) * k * Math.exp(-((front - sd) ** 2) / 0.09) * Math.exp(-((y - T * 0.77) ** 2) / 0.004)
      if ((bare || L.top === "gown") && thin && y > T * 0.4 && y < T * 0.8 && Math.abs(front) < 1.9) o -= 0.0055 * k * (0.5 + 0.5 * Math.cos(y * Math.PI * 2 / 0.042)) * Math.min(1, (1.9 - Math.abs(front)) * 2)
      if (!bare && y > 0.1) o += 0.0032 * k * Math.sin(a * 7 + y * 38 + hash3(a, 1, 2) * 2)
      return o
    },
  }
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
    ], 9, 3, 0, 0.08, torsoFx)
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
    ], 9, 3, 0, 0.08, torsoFx)
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
    void ry
    if (clothed(L) && r() < 0.5) g.stain(x, y, z, s * 0.75, L.skin, 1, 0, SURF.skin)
    g.carve(x, y - s * 0.1, z, s * (0.55 + r() * 0.35), 0.35, 1 + r())
  }
  if (!big && kind !== "stalker") {
    // blood from feeding: a soaked bib under the chin and streaks running down the front
    if (DETAIL >= 1) g.stain(0.01, T * 0.9, F * cd, cw * 0.55, C.blood, 0.9, T * 0.55, SURF.wet).stain(-0.03, T * 0.72, F * cd, cw * 0.25, 0x3a0705, 0.6, T * 0.3)
    else g.blob(0.01, T * 0.86, F * cd * 0.99, cw * 0.38, T * 0.1, 0.012, C.blood, 0.05, 0, 0.08)
  }
  // exposed ribs (one side, both for the stalker)
  const ribSides = L.ribs === 2 ? [-1, 1] : L.ribs ? [L.ribs] : []
  for (const side of ribSides) {
    const x = side * cw * 0.45, y = T * 0.64, fz = F * cd * 0.92
    if (DETAIL >= 1) {
      // flesh torn away over the ribs: a deep crater with bare rib bars across it
      g.carve(x, y, fz, cw * 0.42, 0.55, 1.4)
      for (let k = 0; k < 4; k++) { const ry2 = y - T * 0.14 + k * T * 0.09; g.tube(x - side * cw * 0.36, ry2 + 0.012, F * cd * 0.8, x + side * cw * 0.3, ry2 - 0.006, F * cd * 0.78, 0.0085, 0.0075, C.bone, 5) }
    } else {
      g.blob(x, y, F * cd * 0.97, cw * 0.36, T * 0.2, 0.025, C.gore, 0, side * 0.25)
      for (let k = 0; k < 4; k++) g.blob(x, y - T * 0.13 + k * T * 0.085, F * cd * 1.01, cw * 0.32, 0.009, 0.012, C.bone, 0, side * 0.25, side * -0.18)
    }
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
      g.plate(sx * s * 0.42, T + 0.03, 0, s * 0.19, 0.055 * s, cd * 0.7, 0.1, 0, sx * -0.35)
      g.plate(sx * s * 0.36, T * 0.84, cd * 0.62, s * 0.16, 0.05 * s, cd * 0.42, 0.6, 0, sx * -0.3)
    }
    for (let k = 0; k < 3; k++) g.plate(0, T * (0.35 + k * 0.2), cd * 0.96, s * (0.3 - k * 0.035), T * 0.1, 0.06 * s, -0.25, 0, 0)
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

/** Smooth bump of `amount` within angular `radius` around unit direction (x, y, z). */
function bumpAt(u: THREE.Vector3, x: number, y: number, z: number, radius: number, amount: number): number {
  const l = Math.hypot(x, y, z), c = (u.x * x + u.y * y + u.z * z) / l, ang = Math.acos(Math.max(-1, Math.min(1, c)))
  const k = 1 - ang / radius
  return k > 0 ? amount * k * k * (3 - 2 * k) : 0
}

/** Cranium centre and radii (head-local) — shared by the sculpt, the eyes and the teeth placement. */
function cranium(S: BodySpec): { c: [number, number, number]; r: [number, number, number] } {
  const h = S.headR, [sx, sy, sz] = S.headS
  return { c: [0, h * 1.18 * sy, h * 0.02], r: [h * 0.88 * sx, h * 0.82 * sy, h * 0.98 * sz] }
}

function headSeg(kind: InfectedKind, S: BodySpec, L: Look, r: () => number): THREE.BufferGeometry {
  const g = new GeoBuilder()
  const h = S.headR, [sx, sy, sz] = S.headS, F = -1
  const big = !!S.plates
  const scalp = L.hair !== null && !L.helmet ? L.hair : L.skin
  const { c: [cx, cy, cz], r: [rx, ry, rz] } = cranium(S)
  // neck and the back of the jaw (the cranium sculpt sits on top)
  g.loft([
    { y: -0.01, w: h * 0.42 * sx, d: h * 0.45 * sz, z: h * 0.14, c: L.skin },
    { y: h * 0.32 * sy, w: h * 0.6 * sx, d: h * 0.66 * sz, z: h * 0.04, c: L.skin },
    { y: h * 0.62 * sy, w: h * 0.76 * sx, d: h * 0.82 * sz, z: -h * 0.02, c: L.skin },
  ], 9, 1)
  const eyeDirs = [-1, 1].map(ex => new THREE.Vector3(ex * 0.4, -0.13, -0.905).normalize())
  const scar = new THREE.Vector3((r() - 0.5) * 1.4, 0.55 + r() * 0.35, (r() - 0.6) * 1.2).normalize()
  const lean = kind === "screamer" ? 1.4 : big ? 0.7 : 1
  const skinDark = new THREE.Color(dim(L.skin, 0.32)), gum = new THREE.Color(C.gore), bruise = new THREE.Color(0x5a4a5e), scalpC = new THREE.Color(scalp), hairLine = L.hair !== null && !L.helmet
  g.sculpt(cx, cy, cz, rx, ry, rz, L.skin, (u, out) => {
    const front = -u.z
    let d = 0, st: number | undefined
    // eye sockets: deep, dark and bruised around the rim
    for (const e of eyeDirs) {
      const a = Math.acos(Math.max(-1, Math.min(1, u.dot(e)))), k = 1 - a / 0.3
      if (k > 0) { d -= 0.27 * k * (2 - k) * lean; out.lerp(skinDark, Math.min(1, k * 1.7)) } else if (k > -0.4) out.lerp(bruise, (1 + k / 0.4) * 0.45)
    }
    // brow ridge, cheekbones and hollow cheeks, temples
    if (front > 0.45) d += 0.11 * Math.exp(-((u.y - 0.12) ** 2) / 0.005) * Math.max(0, 1 - Math.abs(u.x) / 0.72) * Math.min(1, (front - 0.45) * 4)
    // flatter face plane, narrow lower face
    d -= 0.07 * Math.max(0, front - 0.6) * 2.5 * (u.y < 0.2 ? 1 : 0.4) + 0.08 * Math.max(0, -u.y - 0.3) * Math.abs(u.x) * 2
    for (const sxn of [-1, 1]) {
      d += bumpAt(u, sxn * 0.6, -0.3, -0.74, 0.28, 0.09) - bumpAt(u, sxn * 0.52, -0.6, -0.6, 0.3, 0.13 * lean) - bumpAt(u, sxn * 0.86, 0.14, -0.46, 0.32, 0.07)
      // cheek hollows darken, cheekbones catch the light
      const hk = bumpAt(u, sxn * 0.52, -0.6, -0.6, 0.3, 1); if (hk > 0) out.lerp(skinDark, hk * 0.35)
    }
    // nose: rotted bridge and tip, dark nostril holes
    if (front > 0.7 && Math.abs(u.x) < 0.16) {
      const t = Math.max(0, Math.min(1, -u.y / 0.48)), wdt = 1 - Math.abs(u.x) / (0.07 + 0.11 * t)
      if (wdt > 0) d += (0.05 + 0.17 * t) * wdt * Math.min(1, wdt * 2) * (u.y > -0.52 ? 1 : 0)
    }
    for (const nx of [-1, 1]) { const k = bumpAt(u, nx * 0.075, -0.5, -0.99, 0.085, 1); if (k > 0) { d -= 0.12 * k; out.lerp(_cW.setHex(C.dark), Math.min(1, k * 1.6)) } }
    // lipless mouth: recessed gums above the jaw
    if (u.y < -0.56 && front > 0.5 && Math.abs(u.x) < 0.52) {
      const k = Math.min(1, (-0.56 - u.y) / 0.1) * Math.min(1, (0.52 - Math.abs(u.x)) / 0.12)
      d -= 0.13 * k; out.lerp(gum, Math.min(1, k * 1.3)); if (k > 0.5) st = SURF.wet
    }
    // occipital bulge, flat top for big heads
    d += bumpAt(u, 0, 0.25, 1, 0.8, 0.04)
    // scalp wound
    const sk = bumpAt(u, scar.x, scar.y, scar.z, 0.32, 1)
    if (sk > 0) { d -= 0.06 * sk; out.lerp(gum, Math.min(1, sk * 1.6)); if (sk > 0.4) st = SURF.wet }
    // hairline
    if (hairLine && u.y > 0.42 - (u.z > 0 ? 0.5 : 0) && sk <= 0) { out.lerp(scalpC, Math.min(1, (u.y - 0.42 + (u.z > 0 ? 0.5 : 0)) * 6)); st = SURF.polymer }
    // decay: lumpy skin
    d += (hash3(u.x * 13, u.y * 11, u.z * 9) - 0.5) * 0.022
    return [d, st]
  }, 32, 24)
  // eyes inside the sockets
  for (let i = 0; i < 2; i++) {
    const e = eyeDirs[i], k = 1 - 0.19 * lean + 0.06
    const x = cx + e.x * rx * k, y = cy + e.y * ry * k, z = cz + e.z * rz * k
    if (L.missingEye && i === 1) g.ball(x, y, z, h * 0.1, h * 0.08, h * 0.05, C.wound, 0, true)
    else g.ball(x, y, z, h * 0.105, h * 0.09, h * 0.07, L.eye, 1, true)
  }
  // upper teeth along the gum line
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.17, u = new THREE.Vector3(Math.sin(a) * 0.62, -0.7, -Math.cos(a) * 0.79).normalize(), k = 0.93
    g.box(cx + u.x * rx * k, cy + u.y * ry * k - h * 0.04, cz + u.z * rz * k, h * 0.085, h * 0.15 + r() * h * 0.07, h * 0.06, C.teeth, 0, a, (r() - 0.5) * 0.3)
  }
  if (L.cheek) {
    // torn cheek: the side of the gums and molars show
    g.blob(L.cheek * h * 0.62 * sx, h * 0.66 * sy, F * h * 0.6, h * 0.07, h * 0.2, h * 0.24, C.gore, 0, L.cheek * 0.5)
    for (let i = 0; i < 3; i++) g.box(L.cheek * h * 0.66 * sx, h * 0.56 * sy, F * h * (0.42 + i * 0.12), h * 0.07, h * 0.11, h * 0.08, C.teeth)
  }
  // ears (one torn)
  g.blob(-h * 0.88 * sx, h * 1.08 * sy, h * 0.05, h * 0.05, h * 0.2, h * 0.14, dim(L.skin, 0.92), 0, 0, 0.15)
  if (r() < 0.6) g.blob(h * 0.88 * sx, h * 1.08 * sy, h * 0.05, h * 0.05, h * 0.2, h * 0.14, dim(L.skin, 0.92), 0, 0, -0.15); else g.blob(h * 0.86 * sx, h * 1.08 * sy, h * 0.05, h * 0.045, h * 0.11, h * 0.1, C.gore)
  if (L.helmet) {
    g.ball(0, h * 1.42 * sy, h * 0.06, h * sx * 1.02, h * sy * 0.8, h * sz * 1.1, 0x3f4430)
    g.box(0, h * 1.16 * sy, h * 0.06, h * sx * 2.0, h * 0.1, h * sz * 2.05, 0x353a28)
  } else if (L.hair !== null) {
    // matted, stringy strands hanging from the scalp
    for (let i = 0; i < 16; i++) {
      const a = -0.35 + r() * (Math.PI + 0.7), x = Math.cos(a) * rx * 0.86, z = Math.sin(a) * rz * 0.9 + h * 0.1
      const len = h * (0.4 + r() * 1.3)
      const y0 = cy + ry * 0.55, dx = Math.cos(a) * h * 0.22, dz = Math.sin(a) * h * 0.22
      g.tube(x * 0.85, y0, z * 0.85, x + dx, y0 - len, z + dz, h * 0.06, h * 0.015, L.hair, 4)
    }
  }
  if (big) {
    g.plate(0, h * 1.66 * sy, h * 0.05, h * 0.8 * sx, h * 0.2, h * 0.83 * sz, 0.15)
    for (const ex of [-1, 1]) g.spike(ex * h * 0.6, h * 1.55, h * 0.2, ex * h * 1.05, h * 2.15, h * 0.5, h * 0.18, C.bone)
  }
  if (kind === "screamer") g.ball(0, h * 0.5 * sy, F * h * 0.55, h * 0.42, h * 0.36, h * 0.3, C.dark).ball(0, h * 0.5 * sy, F * h * 0.6, h * 0.48, h * 0.4, h * 0.22, C.gore) // gaping throat
  if (kind === "stalker") for (let i = 0; i < 2; i++) { const e = eyeDirs[i]; g.box(cx + e.x * rx * 0.92, cy + e.y * ry * 0.92, cz + e.z * rz * 0.92, h * 0.22, h * 0.04, h * 0.03, C.dark) } // slit lids
  return g.build()
}

function jawSeg(kind: InfectedKind, S: BodySpec, L: Look, r: () => number): THREE.BufferGeometry {
  const g = new GeoBuilder()
  const h = S.headR, [sx, , sz] = S.headS, F = -1, len = h * (kind === "screamer" ? 1.2 : 0.95) * sz, w = h * (S.plates ? 1.4 : 1.15) * sx
  if (DETAIL < 1) {
    g.loft([
      { y: -h * 0.36, w: w * 0.32, d: len * 0.18, z: F * len * 0.78, c: L.skin },
      { y: -h * 0.24, w: w * 0.5, d: len * 0.42, z: F * len * 0.55, c: L.skin },
      { y: -h * 0.04, w: w * 0.55, d: len * 0.5, z: F * len * 0.48, c: dim(L.skin, 0.9) },
    ], 8)
  } else {
    // lower face sculpt: jaw line, pointed chin, dark open mouth on top, a gash along one side
    const inner = new THREE.Color(C.dark), gum = new THREE.Color(C.gore), blood = new THREE.Color(C.blood)
    const gash = r() < 0.5 ? 1 : -1
    g.sculpt(0, -h * 0.17, F * len * 0.52, w * 0.4, h * 0.2, len * 0.46, L.skin, (u, out) => {
      let d = 0, st: number | undefined
      const front = -u.z
      d += bumpAt(u, 0, -0.55, -0.85, 0.35, 0.12) - bumpAt(u, 0, -0.1, -0.99, 0.35, 0.05)
      if (u.y > 0.55) { const k = Math.min(1, (u.y - 0.55) * 5); out.lerp(u.y > 0.8 ? inner : gum, k); d -= 0.25 * k; st = SURF.wet }
      if (front > 0.6 && u.y < 0.1 && u.y > -0.75) { const k = 1 - Math.abs(u.x) / 0.28; if (k > 0) out.lerp(blood, k * (0.6 + 0.4 * Math.sin(u.y * 22))) }
      const gk = bumpAt(u, gash * 0.75, 0.05, -0.55, 0.22, 1); if (gk > 0) { d -= 0.08 * gk; out.lerp(gum, Math.min(1, gk * 1.6)); st = SURF.wet }
      d += (hash3(u.x * 13, u.y * 11, u.z * 9) - 0.5) * 0.02
      return [d, st]
    }, 22, 14)
  }
  g.box(0, -h * 0.03, F * len * 0.5, w * 0.7, h * 0.05, len * 0.75, C.gore) // tongue / inside
  for (let i = 0; i < 6; i++) { const a = (i - 2.5) * 0.26; g.box(Math.sin(a) * w * 0.34, h * 0.03, F * (len * 0.82 + Math.cos(a) * h * 0.04), h * 0.085, h * 0.13 + r() * h * 0.05, h * 0.065, C.teeth, 0, a, (r() - 0.5) * 0.3) }
  if (DETAIL < 1) g.blob(0, -h * 0.26, F * len * 0.9, w * 0.32, h * 0.1, h * 0.05, C.blood).blob(0.01, -h * 0.44, F * len * 0.84, w * 0.13, h * 0.13, h * 0.04, C.blood)
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
  ], 7, 3, 0, 0.08, { deform: (a, y) => R * 0.14 * Math.exp(-((a + Math.PI / 2) ** 2) / 0.5) * Math.exp(-((y + A * 0.45) ** 2) / (A * A * 0.04)) - R * 0.06 * Math.exp(-((a - Math.PI / 2) ** 2) / 0.2) })
  if (sleeveLen > 0) up.loft([{ y: 0.05, w: R * 1.18, d: R * 1.15, c: sleeve }, { y: -0.05, w: R * 1.4, d: R * 1.3, c: sleeve }, { y: -A * sleeveLen * 0.98, w: R * 1.15, d: R * 1.1, c: sleeve, jag: 0.05 }], 7, sleeveLen === 1 ? 0 : 0)
  up.carve(side * R * 0.95, -A * (0.3 + r() * 0.45), F * R * 0.2, R * 1.1, 0.3)
  if (big) up.plate(side * R * 1.0, -A * 0.3, 0, R * 0.32, A * 0.3, R * 0.8, 0, 0, side * 0.1)
  if (!big && DETAIL >= 1) up.ball(0, -A + 0.004, R * 0.45, R * 0.62, R * 0.55, R * 0.5, dim(L.skin, 0.9))
  // forearm
  const club = S.club && side > 0
  fo.loft([
    { y: 0.035, w: Q * 1.0, d: Q * 0.95, c: L.skin },
    { y: -Fa * 0.28, w: Q * (big ? 1.35 : 1.18), d: Q * 1.05, c: L.skin },
    { y: -Fa * 0.82, w: Q * 0.74, d: Q * 0.62, c: dim(L.skin, 0.9) },
    { y: -Fa, w: Q * 0.7, d: Q * 0.56, c: C.blood },
  ], 7, 3, 0, 0.08, { deform: (a, y) => Q * 0.07 * Math.max(0, Math.sin(a * 4)) * Math.min(1, -y / (Fa * 0.4)) })
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
    fo.plate(side * Q, -Fa * 0.5, 0, Q * 0.34, Fa * 0.4, Q * 0.95, 0, 0, side * 0.08)
    fo.loft([{ y: hy + 0.02, w: Q * 1.05, d: Q * 0.85, c: L.skin }, { y: hy - S.hand * 0.55, w: Q * 1.2, d: Q * 0.95, c: dim(L.skin, 0.85) }, { y: hy - S.hand * 0.9, w: Q * 1.0, d: Q * 0.8, c: C.blood }], 7)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * Q * 0.5
      if (kind === "boss") fo.spike(x, hy - S.hand * 0.8, F * Q * 0.3, x * 1.2, hy - S.hand * 0.8 - S.claw, F * Q * 0.3 - S.claw * 0.6, Q * 0.18, C.nail)
      else fo.box(x, hy - S.hand * 0.92, F * Q * 0.35, Q * 0.38, S.hand * 0.32, Q * 0.45, C.nail)
    }
  } else {
    // bloody hand: palm, four jointed curled fingers with knuckles and claws, thumb
    const hw = Q * 1.2, sk = dim(L.skin, 0.8)
    fo.loft([{ y: hy + 0.012, w: Q * 0.8, d: Q * 0.55, c: C.blood }, { y: hy - S.hand * 0.22, w: hw * 0.92, d: Q * 0.42, z: F * 0.004, c: sk }, { y: hy - S.hand * 0.46, w: hw, d: Q * 0.36, z: F * 0.008, c: dim(L.skin, 0.72) }], 6)
    const dir = (t: number, x: number) => new THREE.Vector3(x, -Math.cos(t), F * Math.sin(t))
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * hw * 0.5, fl = S.hand * (0.6 + [0, 0.09, 0.05, -0.1][i]) + S.claw * 0.3, curl = 0.25 + r() * 0.35
      const p0 = new THREE.Vector3(x, hy - S.hand * 0.46, F * 0.008)
      const p1 = p0.clone().addScaledVector(dir(curl, x * 0.4), fl * 0.45), p2 = p1.clone().addScaledVector(dir(curl * 2.2, x * 0.3), fl * 0.32), p3 = p2.clone().addScaledVector(dir(curl * 3.4, x * 0.2), fl * 0.24)
      const tip = i % 2 ? C.blood : sk
      fo.ball(p0.x, p0.y, p0.z, 0.0105, 0.0095, 0.0105, sk, 0, true).ball(p1.x, p1.y, p1.z, 0.0085, 0.008, 0.0085, sk, 0, true).ball(p2.x, p2.y, p2.z, 0.0072, 0.007, 0.0072, tip, 0, true)
      fo.tube(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, 0.0088, 0.0076, sk, 4).tube(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 0.0074, 0.0066, sk, 4).tube(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, 0.0064, 0.0052, tip, 4)
      const cd = dir(curl * 4.2 + 0.3, x * 0.2)
      fo.spike(p3.x, p3.y, p3.z, p3.x + cd.x * S.claw * 0.6, p3.y + cd.y * S.claw * 0.6, p3.z + cd.z * S.claw * 0.6, 0.0058, C.nail)
    }
    const t0 = new THREE.Vector3(-side * hw * 0.78, hy - S.hand * 0.12, F * 0.012), t1 = new THREE.Vector3(-side * hw * 1.05, hy - S.hand * 0.32, F * 0.03), t2 = new THREE.Vector3(-side * hw * 1.0, hy - S.hand * 0.52, F * 0.045)
    fo.tube(t0.x, t0.y, t0.z, t1.x, t1.y, t1.z, 0.01, 0.0085, L.skin, 4).tube(t1.x, t1.y, t1.z, t2.x, t2.y, t2.z, 0.0082, 0.0065, sk, 4).ball(t1.x, t1.y, t1.z, 0.0092, 0.0088, 0.0092, L.skin, 0, true)
    fo.spike(t2.x, t2.y, t2.z, t2.x, t2.y - S.claw * 0.4, t2.z + F * S.claw * 0.25, 0.006, C.nail)
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
  for (let i = 0; i < 2; i++) { const a = r() * Math.PI * 2; th.carve(Math.cos(a) * R * 0.95, -Th * (0.25 + r() * 0.5), Math.sin(a) * R * 0.95, R * 0.95, 0.3) }
  if (S.plates) th.plate(side * R * 0.95, -Th * 0.4, 0, R * 0.32, Th * 0.3, R * 0.85, 0, 0, side * 0.08)
  if (!S.plates && DETAIL >= 1 && !fullPants) th.ball(0, -Th + 0.006, F * R * 0.42, R * 0.66, R * 0.6, R * 0.5, dim(L.skin, 0.92))
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
  if (S.plates) sh.plate(0, -Sh * 0.45, F * Q * 0.95, Q * 0.85, Sh * 0.34, Q * 0.32, -0.05)
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
  classify(L)
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
  return withSurface(m, { scale: 22, bump: 0.0022, grime: 0.45, mottle: 0.38, rough: 0.22, weave: 0.6, type: SURF.skin })
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
