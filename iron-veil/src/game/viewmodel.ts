/**
 * viewmodel.ts — first-person weapons, gloved arms and hand-held items. Rendered in a separate scene with its own
 * camera after the world (depth cleared), so weapons never clip into walls and keep their framing at any gameplay FOV.
 * Holder space: origin = rear sight / optic eyepiece on the sight line, forward -Z, so the ADS pose only has to put
 * that point on the view axis (the sight line then passes through the screen centre). Weapons come from
 * weaponModels.ts; both arms are solved every frame with a two-bone IK towards hand anchors on the moving weapon
 * parts (grip, handguard, pump, magazine, bolt knob, feed cover, item …), so every animation keeps the hands attached.
 * Animations are procedural and time based (springs sub-stepped, long frames clamped): hip/ADS blend, walk/sprint bob,
 * mouse sway, crouch, recoil, slide/bolt cycling, pump and bolt manual actions, magazine / single-round / belt reloads,
 * weapon switch, item use, melee swings and the quick knife; plus muzzle flashes, casings and the laser beam.
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { ItemId } from "./items"
import { effectiveWeapon, type WeaponId, type WeaponMods } from "./weaponData"
import { buildHandItem, buildWeaponRig, type HandItem, type Hold, type WeaponRig } from "./weaponModels"

export interface ViewModelState {
  weapon: WeaponId
  /** Installed attachments. */
  mods: WeaponMods
  /** 0..1 aim-down-sights blend. */
  ads: number
  /** Horizontal speed relative to walking speed (0 = still, 1 = walk, ~1.5 = sprint). */
  move: number
  sprinting: boolean
  crouched: boolean
  /** Mouse look this frame (radians) for sway. */
  lookYaw: number
  lookPitch: number
  /** 0..1 progress of the current reload step, -1 = not reloading. */
  reload: number
  /** Loading one round per step (shotguns, revolver, bolt rifle). */
  singleLoad: boolean
  /** Magazine empty (slide / bolt locked back; reload ends with the charging handle). */
  empty: boolean
  /** 0..1 weapon switch (0.5 = fully lowered, the model swaps there), -1 = none. */
  switching: number
  /** 0..1 using an item (weapon lowered, left hand raises the item), -1 = none. */
  using: number
  usingKind: "medical" | "food" | "throw" | null
  /** Optional exact item being used (picks the model: bandage, syringe, bottle, molotov …). */
  usingItem?: ItemId | null
  /** 0..1 melee swing progress (the hit lands at 0.4), -1 = none. */
  melee: number
  /** Quick knife strike while a gun is held (knife appears in the left hand). */
  meleeQuick: boolean
  /** Light level of the scene around the player (0 dark … 1 bright). */
  light: number
  flashlight: boolean
  /** Tactical module active: visible laser beam + dot. */
  laser: boolean
}

// ───────────────────────────── helpers ─────────────────────────────

const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x
/** Smoothstep progress of t through [a, b]. */
const seg = (t: number, a: number, b: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x) }
const lin = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const bump = (t: number, a: number, b: number) => Math.sin(lin(t, a, b) * Math.PI)
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3()
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler()
const Y_UP = new THREE.Vector3(0, 1, 0)

interface Target { pos: THREE.Vector3; quat: THREE.Quaternion; hold: Hold }
const mkTarget = (): Target => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), hold: { rx: 0.015, rz: 0.015 } })
function fromObject(o: THREE.Object3D, out: Target): Target {
  o.updateWorldMatrix(true, false); o.matrixWorld.decompose(out.pos, out.quat, _s)
  out.hold = (o.userData.hold as Hold | undefined) ?? out.hold
  return out
}
function blendTarget(a: Target, b: Target, w: number, out: Target): Target {
  out.pos.copy(a.pos).lerp(b.pos, w); out.quat.copy(a.quat).slerp(b.quat, w); out.hold = w < 0.5 ? a.hold : b.hold
  return out
}

/** Keyframed pose track: [t, x, y, z, rx, ry, rz] rows, eased per segment. */
type Key = [number, number, number, number, number, number, number]
function samplePose(keys: Key[], t: number, pos: THREE.Vector3, quat: THREE.Quaternion, ease: ((x: number) => number)[] = []): void {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++
  const a = keys[i], b = keys[i + 1], f = (ease[i] ?? ((x: number) => x * x * (3 - 2 * x)))(lin(t, a[0], b[0]))
  pos.set(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f)
  quat.setFromEuler(_e.set(a[4], a[5], a[6])); _q2.setFromEuler(_e.set(b[4], b[5], b[6])); quat.slerp(_q2, f)
}
const easeIn = (x: number) => x * x * x, easeOut = (x: number) => 1 - (1 - x) ** 3, easeInOut = (x: number) => x * x * (3 - 2 * x)

// ───────────────────────────── hands & arms ─────────────────────────────

const FR = 0.0088
/** Finger rows along the handle: height, three phalanx lengths, thickness scale (index … pinky). */
const FINGERS: [number, number, number, number, number][] = [[0.026, 0.043, 0.026, 0.021, 1], [0.0075, 0.046, 0.029, 0.022, 1.03], [-0.011, 0.043, 0.027, 0.021, 0.98], [-0.0285, 0.035, 0.022, 0.019, 0.86]]

/** Loop around a rounded-rectangle handle (finger-centre distance), starting on the palm side at z0 and heading forward. */
function contour(ox: number, oz: number, z0: number): (s: number) => THREE.Vector3 {
  const cr = Math.min(ox, oz) * 0.8, pts: [number, number][] = []
  z0 = Math.max(z0, -oz + cr + 0.0005)
  const arc = (cx: number, cz: number, a0: number, a1: number) => { for (let i = 1; i <= 6; i++) { const a = a0 + (a1 - a0) * i / 6; pts.push([cx + Math.cos(a) * cr, cz + Math.sin(a) * cr]) } }
  pts.push([ox, z0], [ox, -oz + cr]); arc(ox - cr, -oz + cr, 0, -Math.PI / 2)
  pts.push([-ox + cr, -oz]); arc(-ox + cr, -oz + cr, -Math.PI / 2, -Math.PI)
  pts.push([-ox, oz - cr]); arc(-ox + cr, oz - cr, Math.PI, Math.PI / 2)
  pts.push([ox - cr, oz]); arc(ox - cr, oz - cr, Math.PI / 2, 0); pts.push([ox, z0])
  const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = acc[acc.length - 1]
  return s => {
    s = Math.min(s, total * 0.92)
    let i = 1; while (i < acc.length - 1 && acc[i] < s) i++
    const f = (s - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1])
    return new THREE.Vector3(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, 0, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f)
  }
}

function capsule(a: THREE.Vector3, b: THREE.Vector3, r: number, tone = 1): THREE.BufferGeometry {
  const d = _v.subVectors(b, a), len = d.length()
  const g = new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 2, 7, 1)
  g.applyQuaternion(_q.setFromUnitVectors(Y_UP, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return tint(g, tone)
}
function rbox(w: number, h: number, d: number, x: number, y: number, z: number, r: number, tone = 1, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.99)
  if (rx || ry || rz) g.applyMatrix4(_m4.makeRotationFromEuler(_e.set(rx, ry, rz)))
  g.translate(x, y, z); return tint(g, tone)
}
function tint(g: THREE.BufferGeometry, tone: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose()
  const c = new Float32Array(ng.attributes.position.count * 3).fill(tone); ng.setAttribute("color", new THREE.BufferAttribute(c, 3))
  return ng
}

/** Gloved right hand wrapped around a handle described by hold (anchor frame, see weaponModels Hold). */
function handGeometry(h: Hold): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const rx = h.rx, rz = h.rz, ox = rx + FR, oz = rz + FR, z0 = -rz * 0.15
  const walk = contour(ox, oz, z0)
  for (let f = 0; f < 4; f++) {
    const [y, l0, l1, l2, k] = FINGERS[f], r = FR * k
    let p: THREE.Vector3[]
    if (f === 0 && h.index === "straight") p = [new THREE.Vector3(ox + 0.003, y, z0), new THREE.Vector3(ox + 0.001, y - 0.002, z0 - l0), new THREE.Vector3(ox, y - 0.004, z0 - l0 - l1), new THREE.Vector3(ox - 0.001, y - 0.005, z0 - l0 - l1 - l2)]
    else if (f === 0 && h.index === "trigger") { const a = new THREE.Vector3(ox + 0.002, y - 0.002, z0), b = new THREE.Vector3(ox - 0.001, y - 0.006, z0 - l0); p = [a, b, new THREE.Vector3(b.x - l1 * 0.7, b.y - 0.008, b.z - l1 * 0.6), new THREE.Vector3(b.x - l1 * 0.7 - l2 * 0.6, b.y - 0.016, b.z - l1 * 0.6 + l2 * 0.2)] }
    else if (h.open) {
      p = [new THREE.Vector3(ox, y, z0)]; let ang = 0.12
      for (const l of [l0, l1, l2]) { const q = p[p.length - 1]; p.push(new THREE.Vector3(q.x - Math.sin(ang) * l, y, q.z - Math.cos(ang) * l)); ang += 0.3 }
    } else {
      const s0 = 0, base = walk(s0)
      p = [new THREE.Vector3(base.x + 0.002, y, base.z), walk(l0), walk(l0 + l1), walk(l0 + l1 + l2)]
      for (let i = 1; i < 4; i++) p[i].y = y
    }
    for (let i = 0; i < 3; i++) parts.push(capsule(p[i], p[i + 1], r * (1 - i * 0.07)))
    // knuckle bump at the finger root
    const g = new THREE.SphereGeometry(r * 1.12, 8, 6); g.translate(ox + 0.003, y, z0 + 0.002); parts.push(tint(g, 0.92))
  }
  // back of the hand (metacarpals) on the +x side, heel pads behind the handle, wrist, knuckle armour
  parts.push(rbox(0.021, 0.07, 0.078, rx + 0.0115, -0.002, z0 + 0.036, 0.0095, 0.95))
  parts.push(rbox(0.026, 0.034, 0.024, rx * 0.25 + 0.006, 0.016, rz + 0.008, 0.011, 0.9))
  parts.push(rbox(0.022, 0.036, 0.02, rx * 0.35 + 0.008, -0.022, rz + 0.006, 0.0095, 0.9))
  parts.push(capsule(new THREE.Vector3(rx + 0.011, -0.004, z0 + 0.06), new THREE.Vector3(rx + 0.012, -0.004, z0 + 0.09), 0.017, 0.9))
  parts.push(rbox(0.0045, 0.062, 0.016, rx + 0.0225, 0.0, z0 + 0.008, 0.002, 0.42))
  parts.push(rbox(0.004, 0.04, 0.028, rx + 0.0222, -0.002, z0 + 0.042, 0.002, 0.62))
  // thumb
  const t0 = new THREE.Vector3(rx * 0.4 + 0.006, 0.03, rz + 0.016)
  const th = h.thumb ?? "wrap"
  const t = th === "along" ? [t0, new THREE.Vector3(rx * 0.1, 0.05, oz + 0.002), new THREE.Vector3(-rx * 0.3, 0.073, oz * 0.95), new THREE.Vector3(-rx * 0.45, 0.093, oz * 0.85)]
    : th === "open" ? [t0, new THREE.Vector3(rx + 0.012, 0.052, rz + 0.03), new THREE.Vector3(rx + 0.01, 0.074, rz + 0.014), new THREE.Vector3(rx + 0.006, 0.09, rz + 0.002)]
    : [t0, new THREE.Vector3(-rx * 0.4, 0.034, oz + 0.003), new THREE.Vector3(-ox - 0.001, 0.036, rz * 0.25), new THREE.Vector3(-ox, 0.038, -rz * 0.45)]
  for (let i = 0; i < 3; i++) parts.push(capsule(t[i], t[i + 1], 0.0108 - i * 0.0008))
  const g = mergeGeometries(parts, false)!; for (const p of parts) p.dispose()
  g.computeBoundingSphere()
  return g
}
const wristOf = (h: Hold, out: THREE.Vector3) => h.wrist ? out.set(...h.wrist) : out.set(h.rx + 0.013, -0.004, -h.rz * 0.15 + 0.09)

/** One arm: sleeve (upper + forearm), glove gauntlet and the posed hand. */
class Arm {
  readonly group = new THREE.Group()
  private upper: THREE.Mesh
  private fore: THREE.Mesh
  private cuff: THREE.Mesh
  private hem: THREE.Mesh
  private hand: THREE.Mesh
  private key = ""
  constructor(private left: boolean, private mats: ArmMats, private handCache: Map<string, THREE.BufferGeometry>) {
    const up = new THREE.CylinderGeometry(0.05, 0.056, 1, 12, 1, true).translate(0, 0.5, 0)
    const fo = new THREE.CylinderGeometry(0.037, 0.048, 1, 12, 1, false).translate(0, 0.5, 0)
    this.upper = new THREE.Mesh(up, mats.sleeve); this.fore = new THREE.Mesh(fo, mats.sleeve)
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.06, 12), mats.glove)
    this.hem = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.005, 6, 14).rotateX(Math.PI / 2), mats.sleeve)
    this.hand = new THREE.Mesh(new THREE.BufferGeometry(), mats.glove)
    this.group.add(this.upper, this.fore, this.cuff, this.hem, this.hand)
  }
  get meshes(): number { return this.group.visible ? 5 : 0 }
  /** Places the hand at target and bends the arm from the shoulder (pole = elbow direction hint). */
  solve(t: Target, shoulder: THREE.Vector3, pole: THREE.Vector3): void {
    const key = `${t.hold.rx.toFixed(4)}|${t.hold.rz.toFixed(4)}|${t.hold.index ?? ""}|${t.hold.thumb ?? ""}|${t.hold.open ? 1 : 0}`
    if (key !== this.key) {
      let g = this.handCache.get(key); if (!g) { g = handGeometry(t.hold); this.handCache.set(key, g) }
      this.hand.geometry = g; this.key = key
    }
    this.hand.position.copy(t.pos); this.hand.quaternion.copy(t.quat); this.hand.scale.set(this.left ? -1 : 1, 1, 1)
    const wrist = wristOf(t.hold, _v2); if (this.left) wrist.x = -wrist.x
    wrist.applyQuaternion(t.quat).add(t.pos)
    // two-bone IK (lengths stretch slightly if the target is out of reach)
    let l1 = 0.3, l2 = 0.27
    const d = _v.subVectors(wrist, shoulder), dist = Math.max(1e-4, d.length())
    if (dist > (l1 + l2) * 0.995) { const k = dist / ((l1 + l2) * 0.995); l1 *= k; l2 *= k }
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
    d.divideScalar(dist)
    const pd = _v3.subVectors(pole, shoulder); pd.addScaledVector(d, -pd.dot(d)); if (pd.lengthSq() < 1e-8) pd.set(0, -1, 0); pd.normalize()
    const elbow = new THREE.Vector3().copy(shoulder).addScaledVector(d, a).addScaledVector(pd, h)
    this.place(this.upper, shoulder, elbow)
    this.place(this.fore, elbow, wrist)
    const fd = _v.subVectors(wrist, elbow).normalize()
    this.cuff.position.copy(wrist).addScaledVector(fd, -0.012); this.cuff.quaternion.setFromUnitVectors(Y_UP, fd)
    this.hem.position.copy(wrist).addScaledVector(fd, -0.05); this.hem.quaternion.copy(this.cuff.quaternion)
  }
  private place(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const d = _v3.subVectors(b, a), len = d.length()
    m.position.copy(a); m.quaternion.setFromUnitVectors(Y_UP, d.divideScalar(Math.max(1e-5, len))); m.scale.set(1, len, 1)
  }
}
interface ArmMats { sleeve: THREE.Material; glove: THREE.Material }

// ───────────────────────────── textures (lazy, browser only) ─────────────────────────────

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); if (!g) return null
  draw(g, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function flashTexture(): THREE.CanvasTexture | null {
  return canvasTexture(64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, "rgba(255,250,225,1)"); grad.addColorStop(0.22, "rgba(255,206,110,0.92)"); grad.addColorStop(0.55, "rgba(255,130,40,0.3)"); grad.addColorStop(1, "rgba(255,90,20,0)")
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
    g.globalCompositeOperation = "lighter"; g.strokeStyle = "rgba(255,220,150,0.75)"; g.lineWidth = 3
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3, l = 22 + (i % 3) * 4; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l); g.stroke() }
  })
}
function glowTexture(): THREE.CanvasTexture | null {
  return canvasTexture(64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.15, "rgba(255,255,255,0.85)"); grad.addColorStop(0.4, "rgba(255,255,255,0.25)"); grad.addColorStop(1, "rgba(255,255,255,0)")
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  })
}
/** Woodland-style camouflage for the sleeves. */
function camoTexture(): THREE.CanvasTexture | null {
  const t = canvasTexture(128, (g, s) => {
    g.fillStyle = "#59604a"; g.fillRect(0, 0, s, s)
    let r = 9
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 }
    for (const col of ["#6f7055", "#3f4535", "#7b7458", "#2e3229"]) {
      g.fillStyle = col
      for (let i = 0; i < 16; i++) { const x = rnd() * s, y = rnd() * s, w = 6 + rnd() * 18, h = 4 + rnd() * 10; g.beginPath(); g.ellipse(x, y, w, h, rnd() * 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x + s * (x < s / 2 ? 1 : -1), y, w, h, 0, 0, Math.PI * 2); g.fill() }
    }
  })
  if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3) }
  return t
}

// ───────────────────────────── casings ─────────────────────────────

type CasingType = "9mm" | "44" | "556" | "762" | "338" | "shell" | "link"
function casingGeometries(): Record<CasingType, THREE.BufferGeometry[]> {
  const bottle = (r: number, rn: number, len: number, neck: number) => new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.95, 0), new THREE.Vector2(r, 0.002), new THREE.Vector2(r * 0.97, len - neck - 0.004), new THREE.Vector2(rn, len - neck), new THREE.Vector2(rn, len), new THREE.Vector2(rn * 0.7, len)].map(v => v), 8)
  return {
    "9mm": [new THREE.CylinderGeometry(0.0048, 0.0049, 0.019, 8)],
    "44": [new THREE.CylinderGeometry(0.0058, 0.006, 0.029, 8)],
    "556": [bottle(0.0048, 0.0029, 0.045, 0.008).translate(0, -0.022, 0)],
    "762": [bottle(0.006, 0.0039, 0.051, 0.008).translate(0, -0.025, 0)],
    "338": [bottle(0.0074, 0.0044, 0.069, 0.01).translate(0, -0.034, 0)],
    shell: [new THREE.CylinderGeometry(0.0104, 0.0104, 0.055, 10).translate(0, 0.008, 0), new THREE.CylinderGeometry(0.0108, 0.0108, 0.014, 10).translate(0, -0.026, 0)],
    link: [new THREE.BoxGeometry(0.014, 0.004, 0.012)],
  }
}

interface Casing { group: THREE.Group; meshes: THREE.Mesh[]; vel: THREE.Vector3; spin: THREE.Vector3; life: number }

// ───────────────────────────── view model ─────────────────────────────

type Shoulders = { r: THREE.Vector3; l: THREE.Vector3; pr: THREE.Vector3; pl: THREE.Vector3 }
/** Default shoulder joints (camera space) and elbow pole directions. */
const SHOULDERS: Shoulders = { r: new THREE.Vector3(0.2, -0.3, 0.14), l: new THREE.Vector3(-0.21, -0.31, 0.06), pr: new THREE.Vector3(0.6, -0.9, 0.25), pl: new THREE.Vector3(-0.65, -0.9, 0.2) }

export class ViewModel {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(54, 1, 0.01, 12)
  visible = false
  private holder = new THREE.Group()
  private rig!: WeaponRig
  private rigKey = ""
  private rigs = new Map<string, WeaponRig>()
  private current: WeaponId = "mk4"
  private mods: WeaponMods = {}
  private hemi = new THREE.HemisphereLight(0xc8d6e0, 0x2a2620, 1.2)
  private key = new THREE.DirectionalLight(0xfff0dc, 1.6)
  private torch = new THREE.PointLight(0xfff4e0, 0, 2.5)
  private envTexture: THREE.Texture | null = null
  // arms
  private armMats: ArmMats
  private handCache = new Map<string, THREE.BufferGeometry>()
  private armR: Arm
  private armL: Arm
  private tR = mkTarget()
  private tL = mkTarget()
  private tA = mkTarget()
  private tB = mkTarget()
  private tC = mkTarget()
  private shR = new THREE.Vector3()
  private shL = new THREE.Vector3()
  private pole = new THREE.Vector3()
  // effects
  private flash = new THREE.Group()
  private flashSide = new THREE.Group()
  private flashLight = new THREE.PointLight(0xffb45a, 0, 3)
  private flashMat: THREE.MeshBasicMaterial
  private flashTime = 0
  private flashTex: THREE.Texture | null
  private glowTex: THREE.Texture | null
  private casings: Casing[] = []
  private casingGeo = casingGeometries()
  private casingMats: { brass: THREE.Material; red: THREE.Material; steel: THREE.Material }
  private beam: THREE.Line
  private beamDot: THREE.Sprite
  private trail: Trail
  // hand-held extras
  private quickKnife: WeaponRig
  private quickHolder = new THREE.Group()
  private items = new Map<string, HandItem>()
  private itemHolder = new THREE.Group()
  private itemShown: HandItem | null = null
  private loadPoint = new THREE.Object3D()
  private loadRound: THREE.Group = new THREE.Group()
  private dropMag = new THREE.Group()
  // animation state
  private time = 0
  private recoil = 0
  private recoilVel = 0
  private sway = { x: 0, y: 0 }
  private bobTime = 0
  private sprintBlend = 0
  private crouchBlend = 0
  private shotT = 9
  private actionT = -1
  private shake = 0
  private cylIndex = 0
  private cylAnim = 0
  private beltPhase = 0
  private openBlend = 0
  private revShots = 0
  private dumped = false
  private lastReload = -1
  private ejectedThisAction = false
  private flashRoll = 0
  private scoped = false
  private dropT = -1
  private queueEject: CasingType | null = null
  private queueDump = false

  constructor() {
    this.scene.add(this.hemi); this.key.position.set(-1, 2, 1); this.scene.add(this.key)
    this.torch.position.set(0.1, 0.05, -0.2); this.scene.add(this.torch)
    this.scene.add(this.holder)
    const camo = camoTexture()
    this.armMats = {
      sleeve: new THREE.MeshStandardMaterial({ color: camo ? 0xffffff : 0x4f5642, map: camo, roughness: 0.95, metalness: 0 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x2c2b26, roughness: 0.82, metalness: 0.02, vertexColors: true }),
    }
    this.armR = new Arm(false, this.armMats, this.handCache); this.armL = new Arm(true, this.armMats, this.handCache)
    this.scene.add(this.armR.group, this.armL.group)
    // muzzle flash: a star facing the camera, two crossed side planes and sideways vents for brakes
    this.flashTex = flashTexture(); this.glowTex = glowTexture()
    this.flashMat = new THREE.MeshBasicMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const star = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), this.flashMat); this.flash.add(star)
    for (let i = 0; i < 2; i++) { const side = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.22), this.flashMat); side.position.z = -0.09; side.rotation.set(Math.PI / 2, 0, i * Math.PI / 2); this.flash.add(side) }
    for (const sx of [-1, 1]) { const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), this.flashMat); vent.position.set(sx * 0.08, 0, 0.0); this.flashSide.add(vent) }
    this.flash.add(this.flashSide, this.flashLight); this.flash.visible = false; this.scene.add(this.flash)
    // casings
    this.casingMats = {
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.32, metalness: 0.95 }),
      red: new THREE.MeshStandardMaterial({ color: 0x8c1d1b, roughness: 0.55, metalness: 0.05 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.5, metalness: 0.7 }),
    }
    for (let i = 0; i < 18; i++) {
      const group = new THREE.Group(), meshes = [new THREE.Mesh(this.casingGeo["556"][0], this.casingMats.brass), new THREE.Mesh(this.casingGeo.shell[1], this.casingMats.brass)]
      group.add(...meshes); group.visible = false; this.scene.add(group)
      this.casings.push({ group, meshes, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 })
    }
    // laser beam (fades along its length) + dot at the convergence distance
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute([1, 0.12, 0.08, 0.05, 0, 0], 3))
    this.beam = new THREE.Line(bg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    this.beam.visible = false; this.beam.renderOrder = 6
    this.beamDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }))
    this.beamDot.visible = false; this.beamDot.renderOrder = 7; this.scene.add(this.beamDot)
    this.trail = new Trail(); this.scene.add(this.trail.mesh)
    // quick knife (left hand) and item holder live in camera space
    this.quickKnife = buildWeaponRig("knife", {})
    this.quickHolder.add(this.quickKnife.group); this.quickHolder.visible = false; this.scene.add(this.quickHolder)
    this.itemHolder.visible = false; this.scene.add(this.itemHolder)
    this.loadPoint.add(this.loadRound)
    this.dropMag.visible = false; this.scene.add(this.dropMag)
    this.setWeapon("mk4", {})
  }

  /** Image-based lighting so metal parts reflect something (without it, metal renders nearly black). */
  initEnvironment(renderer: THREE.WebGLRenderer): void {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = env; this.envTexture = env
    pmrem.dispose()
  }

  setWeapon(id: WeaponId, mods: WeaponMods): void {
    const key = `${id}|${modsKey(mods)}`
    if (this.rig && key === this.rigKey) return
    if (this.rig) this.holder.remove(this.rig.group)
    let rig = this.rigs.get(key)
    if (!rig) {
      rig = buildWeaponRig(id, mods); this.rigs.set(key, rig)
      if (this.rigs.size > 8) { const [oldKey, old] = this.rigs.entries().next().value as [string, WeaponRig]; if (old !== rig) { this.rigs.delete(oldKey); disposeRig(old) } }
    } else { this.rigs.delete(key); this.rigs.set(key, rig) }
    this.rig = rig; this.rigKey = key; this.current = id; this.mods = { ...mods }; this.scoped = effectiveWeapon(id, mods).scoped
    this.holder.add(rig.group)
    const melee = rig.spec.action === "melee"
    if (melee) { const g = rig.anchors.grip; rig.group.position.copy(g.position).negate(); rig.group.quaternion.identity() }
    else rig.group.position.set(0, -rig.sightY, -rig.sightZ)
    this.recoil = 0; this.recoilVel = 0; this.actionT = -1; this.shotT = 9; this.shake = 0; this.openBlend = 0; this.cylAnim = 0
    // single-round loading: the round the left hand carries
    this.loadRound.clear()
    const round = new THREE.Mesh(rig.spec.casing === "shell" ? this.casingGeo.shell[0] : this.casingGeo[rig.spec.casing === "none" ? "556" : rig.spec.casing as CasingType][0], rig.spec.casing === "shell" ? this.casingMats.red : this.casingMats.brass)
    if (rig.spec.casing === "shell") { const head = new THREE.Mesh(this.casingGeo.shell[1], this.casingMats.brass); round.add(head) }
    round.rotation.x = -Math.PI / 2; this.loadRound.add(round)
    this.loadPoint.removeFromParent()
    const load = rig.anchors.load; if (load) { load.parent!.add(this.loadPoint); this.loadPoint.userData.hold = load.userData.hold }
    // laser beam rides on the emitter, zeroed to cross the screen centre ~8 m out at the hip pose
    this.beam.removeFromParent()
    if (rig.laser) { rig.laser.add(this.beam); this.aimLaser() }
    // dropped magazine copy for reload animations
    this.dropMag.clear(); const mag = rig.parts.mag
    if (mag) { const copy = mag.clone(true); copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.traverse(o => { if (!(o instanceof THREE.Mesh)) o.userData = {} }); this.dropMag.add(copy) }
  }

  get isScoped(): boolean { return this.scoped }

  /** Call when a shot is fired. */
  fire(): void {
    const r = this.rig, sp = r.spec
    if (sp.action === "melee") return
    this.recoilVel += 1.1 * sp.kick * (r.brake && sp.cls !== "sniper" ? 0.8 : 1)
    this.flashTime = sp.cls === "sniper" ? 0.07 : 0.05
    this.flashRoll = Math.random() * Math.PI
    const s = (0.8 + Math.random() * 0.45) * sp.flash * (r.suppressed ? 0.28 : 1)
    this.flash.scale.setScalar(s)
    this.flashSide.visible = r.brake || (sp.cls === "sniper" && !r.suppressed)
    this.flashLight.intensity = r.suppressed ? 0.4 : 2.5
    this.shotT = 0
    if (sp.action === "pump" || sp.action === "bolt") { this.actionT = 0; this.ejectedThisAction = false }
    else if (sp.action === "revolver") { this.cylIndex++; this.cylAnim = 0; this.revShots = Math.min(6, this.revShots + 1) }
    else this.ejectCasing(sp.casing === "none" ? "556" : sp.casing as CasingType)
    if (sp.action === "belt") { this.beltPhase++; this.shake = Math.min(1.6, this.shake + 0.45); this.ejectCasing("link") }
  }

  setAspect(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix() }

  render(renderer: THREE.WebGLRenderer): void {
    if (!this.visible) return
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
  }

  /** Debug/bench access: current rig and mesh count (not used by the game). */
  inspect(): { rig: WeaponRig; meshes: number; holder: THREE.Object3D } {
    let meshes = 0
    this.holder.traverseVisible(o => { if (o instanceof THREE.Mesh) meshes++ })
    meshes += this.armR.meshes + this.armL.meshes
    return { rig: this.rig, meshes, holder: this.holder }
  }

  update(dt: number, s: ViewModelState): void {
    dt = Math.min(0.1, Math.max(0, dt))
    this.time += dt
    if (s.weapon !== this.current || modsKey(s.mods) !== modsKey(this.mods)) this.setWeapon(s.weapon, s.mods)
    const rig = this.rig, sp = rig.spec, melee = sp.action === "melee", P = rig.parts, action = sp.action
    this.holder.visible = this.visible
    // lighting follows the scene light level so the gun does not glow at night
    const lightLevel = 0.25 + s.light * 0.9
    this.hemi.intensity = 0.4 + lightLevel * 0.6; this.key.intensity = lightLevel * 1.4
    this.scene.environmentIntensity = 0.12 + s.light * 0.5 + (s.flashlight ? 0.15 : 0)
    this.torch.intensity = s.flashlight ? 1.2 : 0
    // recoil spring, sub-stepped so long frames cannot make it explode
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240)
      this.recoilVel += (-this.recoil * 260 - this.recoilVel * 22) * h
      this.recoil += this.recoilVel * h
    }
    this.recoil = THREE.MathUtils.clamp(this.recoil, -2, 3)
    this.shotT += dt; this.shake = Math.max(0, this.shake - dt * 4)
    const ads = melee ? 0 : clamp01(s.ads)
    const swayScale = 1 - ads * 0.85, k10 = Math.min(1, dt * 10)
    this.sway.x += (THREE.MathUtils.clamp(-s.lookYaw * 1.6, -0.08, 0.08) * swayScale - this.sway.x) * k10
    this.sway.y += (THREE.MathUtils.clamp(s.lookPitch * 1.6, -0.08, 0.08) * swayScale - this.sway.y) * k10
    const busy = s.reload >= 0 || s.using >= 0 || s.melee >= 0 || this.actionT >= 0
    this.sprintBlend += ((s.sprinting && !busy ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 9)
    this.crouchBlend += ((s.crouched ? 1 : 0) - this.crouchBlend) * Math.min(1, dt * 8)
    const moveAmount = Math.min(1.6, Math.max(0, s.move))
    this.bobTime += dt * (s.sprinting ? 13 : 9) * (moveAmount > 0.05 ? 1 : 0)
    const bobAmp = moveAmount * (1 - ads * 0.9) * (s.crouched ? 0.6 : 1)
    const breathe = Math.sin(this.time * 1.2) * 0.0025 * (1 - ads)

    // ── base pose: hip ↔ ADS (at full ADS every offset below is zero, so the sight line is the view axis)
    const h = sp.hip
    const hipY = h[1] + (rig.sightY - rig.ironY), hipZ = h[2] + (rig.sightZ - rig.ironZ)
    const e = easeInOut(ads)
    let px = h[0] * (1 - e), py = hipY * (1 - e), pz = hipZ + (-rig.eye - hipZ) * e
    let rx = h[3] * (1 - e), ry = h[4] * (1 - e), rz = h[5] * (1 - e)
    px += Math.sin(this.bobTime) * 0.011 * bobAmp + this.sway.x * 0.25 * swayScale
    py += -Math.abs(Math.cos(this.bobTime)) * 0.011 * bobAmp + breathe + this.sway.y * 0.25 * swayScale - this.crouchBlend * 0.01 * (1 - ads)
    ry += this.sway.x; rx += this.sway.y; rz += this.sway.x * 0.5 + Math.sin(this.bobTime) * 0.014 * bobAmp
    const spr = this.sprintBlend * (1 - ads)
    if (melee) { px += 0.02 * spr; py -= 0.04 * spr; rx -= 0.25 * spr }
    else if (sp.cls === "pistol") { px -= 0.02 * spr; py -= 0.07 * spr; pz += 0.06 * spr; rx -= 0.65 * spr; ry += 0.1 * spr }
    else { px -= 0.03 * spr; py -= 0.05 * spr; pz += 0.05 * spr; rx -= 0.3 * spr; ry += 0.62 * spr; rz += 0.38 * spr }
    // recoil: back, up and a little roll; the LMG shakes while it fires
    pz += this.recoil * 0.026 * (1 - ads * 0.35); rx += this.recoil * (0.045 + sp.kick * 0.012); py += this.recoil * 0.004
    if (this.shake > 0) { const k = this.shake * this.shake * 0.0035; px += (Math.random() - 0.5) * k; py += (Math.random() - 0.5) * k; rz += (Math.random() - 0.5) * k * 4 }
    // weapon switch: lower out of view and back
    if (s.switching >= 0) { const k = Math.sin(clamp01(s.switching) * Math.PI); py -= 0.32 * k; rx -= 0.75 * k; rz += 0.2 * k }
    // item use / quick knife: weapon lowered, left hand leaves it
    const useK = s.using >= 0 ? seg(s.using, 0, 0.15) * (1 - seg(s.using, 0.85, 1)) : 0
    if (useK > 0) { py -= 0.2 * useK; rx -= 0.55 * useK; rz -= 0.3 * useK; px += 0.05 * useK }
    const quick = !melee && s.melee >= 0
    const qK = quick ? seg(s.melee, 0, 0.12) * (1 - seg(s.melee, 0.75, 0.95)) : 0
    if (qK > 0) { py -= 0.06 * qK; px += 0.03 * qK; rx -= 0.22 * qK; rz -= 0.18 * qK }

    // ── weapon mechanics (parts). Hand work is queued and runs once the holder pose is applied.
    this.resetParts()
    let leftJob: (() => void) | null = null, rightJob: (() => void) | null = null
    const cyc = this.shotT < 0.02 ? this.shotT / 0.02 : Math.max(0, 1 - (this.shotT - 0.02) / 0.06)
    if (P.slide) P.slide.position.z = 0.027 * cyc
    if (P.carrier) P.carrier.position.z = 0.03 * cyc
    if (P.charger && sp.reciprocating) P.charger.position.z = sp.reciprocating * cyc
    if (P.cylinder) { this.cylAnim = Math.min(1, this.cylAnim + dt / 0.12); P.cylinder.rotation.z = (this.cylIndex - 1 + easeOut(this.cylAnim)) * Math.PI / 3 }
    if (rig.belt) rig.belt(this.beltPhase - 1 + seg(this.shotT, 0, 0.05), true)
    // slide / bolt locked open on an empty magazine until the reload's charge step releases it
    if (s.empty && !s.singleLoad && !(s.reload > 0.77)) { if (P.slide) P.slide.position.z = 0.027; if (P.carrier) P.carrier.position.z = 0.03 }
    // manual action after a shot: pump racks, bolt cycles
    if (this.actionT >= 0) {
      this.actionT += dt
      const t = this.actionT
      if (action === "pump") {
        const back = seg(t, 0.1, 0.24) - seg(t, 0.3, 0.44)
        if (P.pump) P.pump.position.z = 0.085 * back
        if (!this.ejectedThisAction && t > 0.24) { this.ejectedThisAction = true; this.queueEject = "shell" }
        rz += 0.05 * back; py -= 0.008 * back; rx += 0.03 * back
        if (t > 0.5) this.actionT = -1
      } else if (action === "bolt") {
        const lift = seg(t, 0.2, 0.32) - seg(t, 0.62, 0.72), back = seg(t, 0.32, 0.44) - seg(t, 0.5, 0.62)
        if (P.bolt) { P.bolt.rotation.z = 1.05 * lift; P.bolt.position.z = 0.115 * back }
        if (!this.ejectedThisAction && t > 0.44) { this.ejectedThisAction = true; this.queueEject = "338" }
        const w = seg(t, 0.06, 0.2) * (1 - seg(t, 0.76, 0.92))
        rz -= 0.14 * w; rx += 0.05 * w; py -= 0.012 * w; px -= 0.01 * w
        if (w > 0) rightJob = () => this.handBlend(rig.anchors.grip, rig.anchors.boltKnob, w, this.tR)
        if (t > 1.0) this.actionT = -1
      } else this.actionT = -1
    }

    // reloads
    const r = s.reload
    if (r >= 0 && this.lastReload < 0) this.dumped = false
    this.lastReload = r
    this.openBlend += ((r >= 0 && s.singleLoad ? 1 : 0) - this.openBlend) * Math.min(1, dt * 5)
    if (this.openBlend < 0.002) this.openBlend = 0
    if (s.singleLoad && (r >= 0 || this.openBlend > 0)) {
      const o = this.openBlend, step = r >= 0 ? r : 1
      if (action === "revolver") {
        if (P.crane) P.crane.rotation.z = 1.45 * seg(o, 0, 0.7)
        rz += 0.55 * o; rx += 0.42 * o; px -= 0.05 * o; py += 0.035 * o; ry -= 0.15 * o
        if (!this.dumped && o > 0.6 && r >= 0) { this.dumped = true; this.queueDump = true }
        if (P.cylinder) P.cylinder.rotation.z = (this.cylIndex + seg(step, 0.6, 0.85)) * Math.PI / 3
      } else if (action === "bolt") {
        if (P.bolt) { P.bolt.rotation.z = 1.05 * seg(o, 0, 0.45); P.bolt.position.z = 0.115 * seg(o, 0.45, 0.9) }
        rz -= 0.2 * o; rx += 0.06 * o; py += 0.01 * o
        const changing = Math.abs(o - (r >= 0 ? 1 : 0)) > 0.04
        if (changing) { const w = seg(Math.min(o, 1 - o) * 3, 0, 1); rightJob = () => this.handBlend(rig.anchors.grip, rig.anchors.boltKnob, w, this.tR) }
      } else { rz += 0.55 * o; rx += 0.12 * o; px -= 0.02 * o; py += 0.01 * o }
      const anc = rig.anchors.load
      if (anc && r >= 0) {
        // the left hand fetches a round, pushes it in and goes back for the next one
        const come = seg(step, 0.0, 0.38), push = seg(step, 0.38, 0.6), back = seg(step, 0.62, 1), away = Math.min(1, (1 - come) + back)
        this.loadPoint.position.copy(anc.position).addScaledVector(rig.loadDir, -0.04 * (1 - push)).add(_v.set(-0.07, -0.22, 0.1).multiplyScalar(away))
        this.loadPoint.quaternion.copy(anc.quaternion)
        this.loadRound.visible = step < 0.62
        this.loadRound.quaternion.setFromUnitVectors(_v.set(0, 0, -1), _v2.copy(rig.loadDir).applyQuaternion(_q.copy(anc.quaternion).invert()))
        const w = seg(o, 0.2, 0.8)
        leftJob = () => this.handBlend(rig.anchors.support, this.loadPoint, w, this.tL)
      }
    } else if (r >= 0 && action === "belt") {
      const tilt = seg(r, 0, 0.1) * (1 - seg(r, 0.9, 1))
      rz += 0.28 * tilt; rx += 0.1 * tilt; py -= 0.02 * tilt
      this.beltParts(r, s.empty)
      leftJob = () => this.beltHands(r, s.empty)
    } else if (r >= 0 && !s.singleLoad && P.mag) {
      const tilt = seg(r, 0, 0.12) * (1 - seg(r, 0.84, 1))
      if (sp.cls === "pistol") { rz -= 0.25 * tilt; rx += 0.35 * tilt; py += 0.01 * tilt }
      else { rz += 0.5 * tilt; rx += 0.16 * tilt; py -= 0.025 * tilt; px -= 0.02 * tilt }
      rx += 0.05 * bump(r, 0.56, 0.64)
      this.magParts(r, s.empty)
      leftJob = () => this.magHands(r, s.empty)
    }

    // ── melee weapons: keyframed swings for the right hand (absolute pose + the offsets above)
    if (melee) {
      this.meleePose(s.melee, _v, _q)
      px += _v.x; py += _v.y; pz += _v.z
      _e.setFromQuaternion(_q); rx += _e.x; ry += _e.y; rz += _e.z
    }
    this.holder.position.set(px, py, pz)
    this.holder.rotation.set(rx, ry, rz)
    // scoped optics take over at full ADS
    rig.group.visible = !(this.scoped && s.ads > 0.92)
    if (quick) this.quickPose(s.melee)
    this.holder.updateMatrixWorld(true)

    // ── hands
    if (rightJob) (rightJob as () => void)(); else fromObject(rig.anchors.grip, this.tR)
    let leftVisible = false
    if (leftJob) { (leftJob as () => void)(); leftVisible = true }
    else if (!melee && rig.anchors.support) { fromObject(rig.anchors.support, this.tL); leftVisible = true }
    // item use: the left hand leaves the weapon and raises the item
    this.itemHolder.visible = false
    if (s.using >= 0 && s.usingKind) {
      const item = this.handItem(s.usingKind, s.usingItem ?? null)
      this.itemPose(s.using, s.usingKind, item)
      this.itemHolder.updateMatrixWorld(true)
      const w = seg(s.using, 0.03, 0.18) * (1 - seg(s.using, 0.86, 0.99))
      fromObject(item.anchor, this.tB)
      if (leftVisible) blendTarget(this.tL, this.tB, w, this.tL)
      else { this.tL.pos.copy(this.tB.pos); this.tL.pos.y -= (1 - w) * 0.25; this.tL.quat.copy(this.tB.quat); this.tL.hold = this.tB.hold; leftVisible = w > 0.01 }
      this.itemHolder.visible = w > 0.01 && !(s.usingKind === "throw" && s.using > 0.45 && s.using < 0.95)
    }
    // quick knife in the left hand
    this.quickHolder.visible = false
    if (quick) {
      this.quickHolder.updateMatrixWorld(true)
      fromObject(this.quickKnife.anchors.grip, this.tB)
      const w = seg(s.melee, 0.0, 0.1) * (1 - seg(s.melee, 0.85, 1))
      if (leftVisible) blendTarget(this.tL, this.tB, w, this.tL)
      else { this.tL.pos.copy(this.tB.pos); this.tL.quat.copy(this.tB.quat); this.tL.hold = this.tB.hold; leftVisible = true }
      this.quickHolder.visible = w > 0.05
      if (s.melee > 0.24 && s.melee < 0.6) this.trail.push(this.quickKnife.anchors.tip.getWorldPosition(_v2), this.quickKnife.anchors.grip.getWorldPosition(_v3)); else this.trail.cut()
    } else if (melee && s.melee > 0.24 && s.melee < 0.6 && rig.anchors.tip) this.trail.push(rig.anchors.tip.getWorldPosition(_v2), rig.anchors.grip.getWorldPosition(_v3))
    else this.trail.cut()
    const shown = this.visible && rig.group.visible
    this.armR.group.visible = shown
    this.armL.group.visible = shown && leftVisible
    const sh = sp.shoulders
    if (sh) { this.shR.set(sh[0], sh[1], sh[2]); this.shL.set(sh[3], sh[4], sh[5]) } else { this.shR.copy(SHOULDERS.r); this.shL.copy(SHOULDERS.l) }
    if (this.armR.group.visible) this.armR.solve(this.tR, this.shR, this.pole.copy(this.shR).add(SHOULDERS.pr))
    if (this.armL.group.visible) this.armL.solve(this.tL, this.shL, this.pole.copy(this.shL).add(SHOULDERS.pl))
    if (this.queueEject) { this.ejectCasing(this.queueEject); this.queueEject = null }
    if (this.queueDump) { this.dumpCylinder(); this.queueDump = false }

    // ── reticle fades in while aiming; laser; lamp
    if (rig.reticle) {
      const o = seg(s.ads, 0.35, 0.85); rig.reticle.visible = o > 0.01
      for (const c of rig.reticle.children) if (c instanceof THREE.Mesh) (c.material as THREE.MeshBasicMaterial).opacity = o * (c.userData.base ?? 1)
    }
    const laserOn = s.laser && !!rig.laser && shown && s.switching < 0
    this.beam.visible = laserOn; this.beamDot.visible = laserOn
    if (laserOn) { this.beam.updateWorldMatrix(true, false); this.beamDot.position.set(0, 0, 1).applyMatrix4(this.beam.matrixWorld); this.beamDot.scale.setScalar(0.07) }
    if (rig.lamp) (rig.lamp.material as THREE.MeshBasicMaterial).color.set(s.flashlight ? 0xfff6dc : 0x3a3a34)

    // ── muzzle flash and casings
    this.flashTime = Math.max(0, this.flashTime - dt)
    this.flash.visible = this.flashTime > 0 && shown && !melee
    if (this.flash.visible) {
      rig.muzzle.getWorldPosition(this.flash.position); rig.muzzle.getWorldQuaternion(_q)
      this.flash.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_v.set(0, 0, 1), this.flashRoll))
    }
    if (this.flashTime <= 0) this.flashLight.intensity = 0
    const steps = Math.max(1, Math.ceil(dt * 60))
    for (const c of this.casings) {
      if (c.life <= 0) continue
      for (let i = 0; i < steps; i++) { const hdt = dt / steps; c.vel.y -= 6 * hdt; c.group.position.addScaledVector(c.vel, hdt) }
      c.group.rotation.x += c.spin.x * dt; c.group.rotation.y += c.spin.y * dt; c.group.rotation.z += c.spin.z * dt
      c.life -= dt; if (c.life <= 0) c.group.visible = false
    }
    this.trail.update(dt)
  }
  dispose(): void {
    for (const rig of this.rigs.values()) disposeRig(rig)
    disposeRig(this.quickKnife)
    for (const g of this.handCache.values()) g.dispose()
    for (const it of this.items.values()) it.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    for (const list of Object.values(this.casingGeo)) for (const g of list) g.dispose()
    for (const m of Object.values(this.casingMats)) m.dispose()
    this.scene.traverse(o => { if (o instanceof THREE.Mesh && o.parent && !(o.geometry as THREE.BufferGeometry).userData.shared) o.geometry.dispose() })
    this.flashTex?.dispose(); this.glowTex?.dispose(); this.envTexture?.dispose(); this.flashMat.dispose()
    this.armMats.sleeve.dispose(); this.armMats.glove.dispose(); (this.armMats.sleeve as THREE.MeshStandardMaterial).map?.dispose()
    this.trail.dispose()
  }

  // ───────────────────────────── internals ─────────────────────────────

  private resetParts(): void {
    const P = this.rig.parts
    if (P.slide) P.slide.position.z = 0
    if (P.carrier) P.carrier.position.z = 0
    if (P.charger) P.charger.position.z = 0
    if (P.pump) P.pump.position.z = 0
    if (P.mag) { P.mag.position.copy(this.rig.magRest); P.mag.visible = true }
    if (P.crane) P.crane.rotation.z = 0
    if (P.cover) P.cover.rotation.x = 0
    if (P.bolt && this.actionT < 0 && this.openBlend === 0) { P.bolt.rotation.z = 0; P.bolt.position.z = 0 }
    this.dropMag.visible = false
    this.dropT = -1
    this.loadRound.visible = false
  }

  /** Blends the hand between two anchors (either may be missing). */
  private handBlend(a: THREE.Object3D | undefined, b: THREE.Object3D | undefined, w: number, out: Target): void {
    if (!a && !b) return
    if (!b || w <= 0) { fromObject(a ?? b!, out); return }
    if (!a || w >= 1) { fromObject(b, out); return }
    fromObject(a, this.tA); fromObject(b, this.tC); blendTarget(this.tA, this.tC, w, out)
  }

  private pouch(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.rig.magRest).add(_v.set(-0.07, -0.34, 0.12)) }

  /** Magazine swap (parts): release, the old mag drops, a fresh one comes up and is seated; charge when empty. */
  private magParts(r: number, empty: boolean): void {
    const rig = this.rig, P = rig.parts, mag = P.mag!, rest = rig.magRest, axis = rig.magAxis, sp = rig.spec
    const travel = sp.cls === "pistol" ? 0.02 : 0.035
    const pouch = this.pouch(_v3), entry = _v2.copy(rest).addScaledVector(axis, 0.07)
    if (r < 0.15) mag.position.copy(rest).addScaledVector(axis, travel * seg(r, 0.1, 0.15))
    else if (r < 0.3) { mag.visible = false; this.dropT = lin(r, 0.15, 0.3) }
    else if (r < 0.52) mag.position.copy(pouch).lerp(entry, seg(r, 0.3, 0.52))
    else mag.position.copy(entry).lerp(rest, seg(r, 0.52, 0.6))
    if (empty && sp.charge !== "none" && r >= 0.62) {
      const pull = seg(r, 0.7, 0.75) * (1 - seg(r, 0.76, 0.78))
      if (sp.charge === "slide") { if (P.slide) P.slide.position.z = 0.027 * (r < 0.77 ? 1 : 0) + 0.006 * pull }
      else if (P.charger) P.charger.position.z = (sp.charge === "rear" ? 0.065 : 0.09) * pull
    }
  }

  /** Magazine swap (left hand + the falling magazine). */
  private magHands(r: number, empty: boolean): void {
    const rig = this.rig, P = rig.parts, mag = P.mag!, rest = rig.magRest, axis = rig.magAxis, sp = rig.spec, A = rig.anchors, hold = A.magHold
    const travel = sp.cls === "pistol" ? 0.02 : 0.035
    if (this.dropT >= 0) {
      const f = this.dropT, parent = mag.parent!
      parent.updateWorldMatrix(true, false)
      this.dropMag.position.copy(rest).addScaledVector(axis, travel + f * 0.05).add(_v.set(-0.02 * f, -0.6 * f * f, 0.04 * f)).applyMatrix4(parent.matrixWorld)
      parent.matrixWorld.decompose(_v, _q, _s); this.dropMag.quaternion.copy(_q).multiply(mag.quaternion).multiply(_q2.setFromEuler(_e.set(0.6 * f, 0, -0.5 * f)))
      this.dropMag.visible = true
    }
    if (!hold) { this.handBlend(A.support, A.support, 0, this.tL); return }
    if (r < 0.15) this.handBlend(A.support, hold, seg(r, 0.02, 0.1), this.tL)
    else if (r < 0.3) {
      // the hand travels down to the pouch as if it still held the old magazine
      const saved = _v2.copy(mag.position)
      mag.position.copy(rest).addScaledVector(axis, travel).lerp(this.pouch(_v3), seg(r, 0.15, 0.3)); mag.updateMatrixWorld(true)
      fromObject(hold, this.tL); mag.position.copy(saved); mag.updateMatrixWorld(true)
    } else if (r < 0.62) { fromObject(hold, this.tL); this.tL.pos.y += 0.008 * bump(r, 0.58, 0.64) }
    else if (empty && A.charge && sp.charge !== "none") {
      const back = seg(r, 0.8, 0.92)
      if (back > 0) this.handBlend(A.charge, A.support, back, this.tL)
      else this.handBlend(hold, A.charge, seg(r, 0.6, 0.69), this.tL)
    } else this.handBlend(hold, A.support, seg(r, 0.62, 0.8), this.tL)
  }

  /** Belt-fed box swap (parts): open the cover, swap the box, lay the belt, close, charge. */
  private beltParts(r: number, empty: boolean): void {
    const rig = this.rig, P = rig.parts, mag = P.mag, rest = rig.magRest
    if (P.cover) P.cover.rotation.x = 1.15 * seg(r, 0.08, 0.18) * (1 - seg(r, 0.78, 0.84))
    if (mag) {
      if (r < 0.26) mag.position.copy(rest)
      else if (r < 0.44) mag.position.copy(rest).add(_v.set(-0.02, -0.6 * lin(r, 0.26, 0.44) ** 2, 0.02 * lin(r, 0.26, 0.44)))
      else if (r < 0.62) mag.position.copy(this.pouch(_v3)).lerp(rest, seg(r, 0.44, 0.62))
    }
    rig.belt?.(this.beltPhase - (r > 0.62 && r < 0.76 ? 3 * (1 - seg(r, 0.66, 0.76)) : 0), r < 0.24 || r > 0.66)
    if (empty && P.charger && r > 0.86) P.charger.position.z = 0.1 * seg(r, 0.9, 0.94) * (1 - seg(r, 0.95, 0.97))
  }

  private beltHands(r: number, empty: boolean): void {
    const rig = this.rig, A = rig.anchors, mag = rig.parts.mag
    let a = A.support, b = A.support, w = 0
    if (r < 0.18) { b = A.cover; w = seg(r, 0.0, 0.08) }
    else if (r < 0.3) { a = A.cover; b = A.magHold; w = seg(r, 0.18, 0.26) }
    else if (r < 0.44) {
      if (mag && A.magHold) { const saved = _v2.copy(mag.position); mag.position.copy(rig.magRest).lerp(this.pouch(_v3), seg(r, 0.3, 0.44)); mag.updateMatrixWorld(true); fromObject(A.magHold, this.tL); mag.position.copy(saved); mag.updateMatrixWorld(true); return }
    } else if (r < 0.64) { a = b = A.magHold }
    else if (r < 0.76) { a = A.magHold; b = A.beltHold ?? A.cover; w = seg(r, 0.64, 0.7) }
    else if (r < 0.86) { a = A.beltHold ?? A.cover; b = A.cover; w = seg(r, 0.76, 0.8) }
    else if (empty && A.charge) { if (r < 0.95) { a = A.cover; b = A.charge; w = seg(r, 0.86, 0.9) } else { a = A.charge; b = A.support; w = seg(r, 0.95, 1) } }
    else { a = A.cover; b = A.support; w = seg(r, 0.86, 0.98) }
    this.handBlend(a, b, w, this.tL)
  }
  /** Swings for knife, machete and axe (right hand). Offsets relative to the idle pose. */
  private meleePose(m: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const id = this.current
    const idle: Key = id === "axe" ? [0, 0.2, -0.24, -0.42, 0.55, 0.25, -0.15] : id === "machete" ? [0, 0.21, -0.22, -0.4, 0.75, 0.32, -0.25] : [0, 0.19, -0.2, -0.36, 0.85, 0.35, -0.3]
    if (m < 0) { pos.set(idle[1], idle[2], idle[3]); quat.setFromEuler(_e.set(idle[4], idle[5], idle[6])); return }
    const heavy = id === "axe"
    const keys: Key[] = heavy ? [
      idle, [0.26, 0.3, 0.02, -0.18, 1.85, -0.1, -0.75], [0.4, 0.02, -0.12, -0.55, 0.15, 0.45, 0.55], [0.56, -0.24, -0.4, -0.38, -0.65, 0.85, 1.0], [1, ...idle.slice(1)] as Key,
    ] : [
      idle, [0.22, 0.31, -0.06, -0.25, 1.5, -0.2, -0.95], [0.4, 0.03, -0.13, -0.5, 0.45, 0.55, 0.65], [0.55, -0.24, -0.32, -0.36, -0.15, 1.0, 1.15], [1, ...idle.slice(1)] as Key,
    ]
    samplePose(keys, m, pos, quat, [easeOut, easeIn, easeOut, easeInOut])
  }

  /** Quick knife: comes up in the left hand, slashes across, goes away. */
  private quickPose(m: number): void {
    const keys: Key[] = [
      [0, -0.2, -0.45, -0.3, 0.3, -0.3, 0.6], [0.24, -0.27, -0.06, -0.3, 1.4, 0.2, 0.9], [0.4, 0.0, -0.13, -0.5, 0.4, -0.5, -0.6], [0.56, 0.24, -0.3, -0.38, -0.1, -0.9, -1.0], [1, -0.1, -0.5, -0.3, 0.2, -0.3, 0.4],
    ]
    samplePose(keys, m, this.quickHolder.position, this.quickHolder.quaternion, [easeOut, easeIn, easeOut, easeInOut])
    this.quickKnife.group.position.copy(this.quickKnife.anchors.grip.position).negate()
  }

  private handItem(kind: "medical" | "food" | "throw", item: ItemId | null): HandItem {
    const id = item ?? (kind === "medical" ? "antiviral" : kind === "food" ? "canned" : "grenade")
    let it = this.items.get(id)
    if (!it) { it = buildHandItem(id); this.items.set(id, it) }
    if (this.itemShown !== it) { this.itemHolder.clear(); this.itemHolder.add(it.group); this.itemShown = it }
    return it
  }

  /** Moves the item (and with it the left hand) through the use animation. */
  private itemPose(u: number, kind: "medical" | "food" | "throw", it: HandItem): void {
    const H = this.itemHolder
    let keys: Key[]
    if (kind === "throw") keys = [[0, -0.2, -0.5, -0.25, 0, 0, 0.3], [0.16, -0.13, -0.14, -0.36, 0.2, 0.2, 0.2], [0.38, -0.2, 0.0, -0.12, 0.9, 0.3, 0.5], [0.46, 0.04, -0.06, -0.72, -0.6, -0.2, -0.3], [0.6, 0.1, -0.32, -0.5, -0.9, -0.3, -0.5], [1, -0.2, -0.55, -0.25, 0, 0, 0.3]]
    else if (kind === "food") keys = [[0, -0.2, -0.5, -0.25, 0, 0, 0.3], [0.25, -0.03, -0.11, -0.2, 0.15, 0.35, 0.25], [0.8, -0.02, -0.1, -0.18, -0.55, 0.3, 0.3], [1, -0.2, -0.5, -0.25, 0, 0, 0.3]]
    else if (it.style === "inject") keys = [[0, -0.2, -0.5, -0.25, 0, 0, 0.3], [0.22, -0.08, -0.14, -0.3, -0.2, 0.3, 0.9], [0.42, -0.06, -0.16, -0.29, -0.1, 0.3, 1.2], [0.5, -0.03, -0.4, -0.22, -0.4, 0.2, 1.4], [0.7, -0.03, -0.4, -0.22, -0.4, 0.2, 1.4], [1, -0.2, -0.55, -0.25, 0, 0, 0.3]]
    else keys = [[0, -0.2, -0.5, -0.25, 0, 0, 0.3], [0.25, -0.06, -0.17, -0.3, 0.3, 0.35, 0.3], [0.8, -0.05, -0.18, -0.3, 0.3, 0.35, 0.3], [1, -0.2, -0.5, -0.25, 0, 0, 0.3]]
    samplePose(keys, u, H.position, H.quaternion)
    // eating/drinking bobs, bandage wrapping circles
    if (kind === "food") { H.position.y += Math.sin(u * 30) * 0.006 * bump(u, 0.3, 0.78); H.position.z -= 0.004 * bump(u, 0.3, 0.78) }
    else if (kind === "medical" && it.style === "wrap") { const a = u * 22; H.position.x += Math.cos(a) * 0.025 * bump(u, 0.28, 0.8); H.position.y += Math.sin(a) * 0.02 * bump(u, 0.28, 0.8) }
    else if (it.plunger) it.plunger.position.y = -0.03 * seg(u, 0.5, 0.65)
    if (it.flame) { const f = 0.8 + Math.sin(this.time * 31) * 0.15 + Math.sin(this.time * 17) * 0.1; it.flame.scale.set(f, 0.8 + f * 0.4, f) }
  }

  /** Drops the empties out of the swung-out cylinder. */
  private dumpCylinder(): void {
    const n = Math.max(1, this.revShots || 6), cyl = this.rig.parts.cylinder; if (!cyl) return
    for (let i = 0; i < n; i++) {
      const c = this.casings.find(k => k.life <= 0) ?? this.casings[i]
      this.prepCasing(c, "44")
      cyl.updateWorldMatrix(true, false)
      c.group.position.set(Math.cos(i * Math.PI / 3) * 0.0145, Math.sin(i * Math.PI / 3) * 0.0145, 0.01).applyMatrix4(cyl.matrixWorld)
      c.vel.set((Math.random() - 0.5) * 0.15, -0.3 - Math.random() * 0.2, 0.05)
      c.spin.set(Math.random() * 6, 0, Math.random() * 6); c.life = 0.9; c.group.visible = true
    }
    this.revShots = 0
  }

  private prepCasing(c: Casing, type: CasingType): void {
    const geos = this.casingGeo[type]
    c.meshes[0].geometry = geos[0]; c.meshes[0].material = type === "shell" ? this.casingMats.red : type === "link" ? this.casingMats.steel : this.casingMats.brass
    c.meshes[1].visible = type === "shell"
    c.group.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
  }

  private ejectCasing(type: CasingType): void {
    const c = this.casings.find(k => k.life <= 0) ?? this.casings[0]
    this.prepCasing(c, type)
    const rig = this.rig
    rig.eject.updateWorldMatrix(true, false)
    rig.eject.getWorldPosition(c.group.position)
    rig.group.getWorldQuaternion(_q)
    // out to the right and up, slightly forward — never toward the camera (the LMG drops them down)
    if (rig.spec.action === "belt") c.vel.set(0.25 + Math.random() * 0.2, -0.5 - Math.random() * 0.3, -0.05).applyQuaternion(_q)
    else c.vel.set(0.85 + Math.random() * 0.4, 0.65 + Math.random() * 0.4, -0.1 - Math.random() * 0.15).applyQuaternion(_q).multiplyScalar(type === "shell" ? 0.8 : 1)
    if (type === "link") c.vel.x += 0.4
    c.spin.set(18 + Math.random() * 6, Math.random() * 4, 11 + Math.random() * 5)
    c.life = 0.8; c.group.visible = true
  }

  /** Zeroes the laser so it crosses the screen centre ~8.5 m ahead in the hip pose. */
  private aimLaser(): void {
    const rig = this.rig, h = rig.spec.hip
    const save = { p: this.holder.position.clone(), r: this.holder.rotation.clone() }
    this.holder.position.set(h[0], h[1] + rig.sightY - rig.ironY, h[2] + rig.sightZ - rig.ironZ); this.holder.rotation.set(h[3], h[4], h[5])
    this.holder.updateMatrixWorld(true)
    const target = new THREE.Vector3(0, 0, -8.5)
    rig.laser!.updateWorldMatrix(true, false)
    const local = rig.laser!.worldToLocal(target.clone())
    this.beam.quaternion.setFromUnitVectors(_v.set(0, 0, 1), local.normalize())
    this.beam.scale.set(1, 1, 8.5)
    this.holder.position.copy(save.p); this.holder.rotation.copy(save.r)
  }
}

/** Fading ribbon behind a swung blade. */
class Trail {
  readonly mesh: THREE.Mesh
  private pts: { a: THREE.Vector3; b: THREE.Vector3; age: number }[] = []
  private geo = new THREE.BufferGeometry()
  private pos = new Float32Array(16 * 2 * 3)
  private col = new Float32Array(16 * 2 * 3)
  constructor() {
    const idx: number[] = []; for (let i = 0; i < 15; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    this.geo.setIndex(idx); this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3))
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 4
  }
  push(tip: THREE.Vector3, base: THREE.Vector3): void {
    const b = base.clone().lerp(tip, 0.55)
    this.pts.unshift({ a: tip.clone(), b, age: 0 }); if (this.pts.length > 16) this.pts.pop()
  }
  cut(): void { for (const p of this.pts) p.age = Math.max(p.age, 0.06) }
  update(dt: number): void {
    for (const p of this.pts) p.age += dt
    this.pts = this.pts.filter(p => p.age < 0.12)
    const n = this.pts.length
    this.mesh.visible = n >= 2
    if (n < 2) return
    for (let i = 0; i < 16; i++) {
      const p = this.pts[Math.min(i, n - 1)], f = Math.max(0, 1 - i / Math.max(1, n - 1)) * Math.max(0, 1 - p.age / 0.12) * 0.55
      this.pos.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6)
      this.col.set([f * 0.9, f * 0.92, f, 0, 0, 0], i * 6)
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true
    this.geo.computeBoundingSphere()
  }
  dispose(): void { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose() }
}

function modsKey(m: WeaponMods): string { return Object.keys(m).sort().map(k => `${k}:${m[k as keyof WeaponMods]}`).join(",") }

function disposeRig(rig: WeaponRig): void {
  rig.group.traverse(o => {
    if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material as THREE.Material; if (m.userData.perRig) m.dispose() }
  })
}

/** Kept for API compatibility with older callers: materials are shared and live for the whole session. */
export function disposeViewModelMaterials(): void { /* shared weapon materials stay cached */ }
