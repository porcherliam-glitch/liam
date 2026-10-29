/**
 * weaponModels.ts — procedural weapon geometry shared by the first-person viewmodel and the loot/world models.
 * Gun space: bore axis on x = 0 / y = 0, forward = -Z, metres. Static pieces are merged into one mesh per material
 * and per moving part (slide, magazine, pump, bolt, cylinder, feed cover …). Hand anchors (Object3D with a Hold in
 * userData) say where and how the gloved hands hold each part; the viewmodel solves the arms towards them.
 * Nothing here touches the DOM, so rigs can also be built in Node tests.
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { WEAPONS, canAttach, type AttachmentId, type AttachmentSlot, type WeaponClass, type WeaponId, type WeaponMods } from "./weaponData"

// ───────────────────────────── materials ─────────────────────────────

export type MatName = "steel" | "steelDark" | "steelLight" | "stainless" | "alu" | "polymer" | "polyGrey" | "od" | "tan" | "plum" | "wood" | "woodLight"
  | "rubber" | "brass" | "copper" | "blade" | "bladeEdge" | "paintRed" | "shellRed" | "cloth" | "glass" | "lens" | "glowGreen" | "glowOrange" | "glowRed" | "dark"
  | "white" | "tin" | "cream" | "yellow" | "blueLiquid" | "orangeClear" | "greenLabel" | "bottle" | "glassBrown" | "flame"

// colour, roughness, metalness, edge wear (how much lighter worn edges get)
const SOLID: Partial<Record<MatName, [number, number, number, number]>> = {
  steel: [0x30353a, 0.42, 0.78, 0.75], steelDark: [0x15171a, 0.62, 0.45, 0.2], steelLight: [0x737b81, 0.3, 0.88, 0.25], stainless: [0xa4aaae, 0.26, 0.95, 0.15],
  alu: [0x25282b, 0.5, 0.55, 1.1], polymer: [0x232527, 0.78, 0.02, 0.35], polyGrey: [0x3b3f42, 0.74, 0.03, 0.3], od: [0x4a5137, 0.8, 0.02, 0.3],
  tan: [0x8d7854, 0.78, 0.02, 0.28], plum: [0x6b2c1f, 0.5, 0.05, 0.3], wood: [0x6a3c20, 0.55, 0.0, 0.25], woodLight: [0x9b6a3b, 0.6, 0.0, 0.2],
  rubber: [0x161718, 0.95, 0.0, 0.1], brass: [0xc79c45, 0.3, 1.0, 0], copper: [0xb36d3d, 0.34, 1.0, 0], blade: [0x2a2c2f, 0.5, 0.7, 0.6],
  bladeEdge: [0xbcc3c8, 0.18, 1.0, 0], paintRed: [0x9e1f17, 0.45, 0.25, 0.9], shellRed: [0x8a1b1b, 0.55, 0.05, 0], cloth: [0x4d5338, 0.98, 0.0, 0.1],
  dark: [0x060606, 1, 0, 0], white: [0xd9dbd6, 0.5, 0.02, 0], tin: [0xa9aeb2, 0.3, 0.9, 0.2], cream: [0xe2dcc8, 0.95, 0, 0], yellow: [0xd8b02a, 0.45, 0.05, 0.2],
  greenLabel: [0x2f6b3c, 0.55, 0.05, 0],
}

export type WeaponMaterials = Record<MatName, THREE.Material>
const materialCache: Partial<Record<"vm" | "world", WeaponMaterials>> = {}

/** Shared weapon materials. "vm" expects an environment map (viewmodel scene); "world" is tuned for plain lights. */
export function weaponMaterials(kind: "vm" | "world" = "vm"): WeaponMaterials {
  const cached = materialCache[kind]; if (cached) return cached
  const world = kind === "world"
  const out = {} as WeaponMaterials
  for (const [name, def] of Object.entries(SOLID) as [MatName, [number, number, number, number]][]) {
    const color = new THREE.Color(def[0]); if (world) color.multiplyScalar(1.3)
    out[name] = new THREE.MeshStandardMaterial({ color, roughness: world ? Math.max(0.5, def[1]) : def[1], metalness: world ? def[2] * 0.35 : def[2], vertexColors: true })
  }
  out.glass = new THREE.MeshStandardMaterial({ color: 0xa8c8ff, roughness: 0.05, metalness: 1, transparent: true, opacity: 0.16, depthWrite: false, vertexColors: true })
  out.lens = new THREE.MeshStandardMaterial({ color: 0x2a3a6a, roughness: 0.06, metalness: 1, emissive: 0x1c0f3a, emissiveIntensity: 0.8, transparent: true, opacity: 0.62, depthWrite: false, vertexColors: true })
  out.blueLiquid = new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x0a3a80, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0, vertexColors: true })
  out.orangeClear = new THREE.MeshStandardMaterial({ color: 0xd9761c, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.85, vertexColors: true })
  out.bottle = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, vertexColors: true })
  out.glassBrown = new THREE.MeshStandardMaterial({ color: 0x5a3a12, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8, vertexColors: true })
  out.flame = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, toneMapped: false })
  out.glowGreen = new THREE.MeshBasicMaterial({ color: 0x8dff5a, vertexColors: true, toneMapped: false })
  out.glowOrange = new THREE.MeshBasicMaterial({ color: 0xffa23a, vertexColors: true, toneMapped: false })
  out.glowRed = new THREE.MeshBasicMaterial({ color: 0xff3020, vertexColors: true, toneMapped: false })
  materialCache[kind] = out
  return out
}
const WEAR = (m: MatName) => SOLID[m]?.[3] ?? 0

// ───────────────────────────── geometry kit ─────────────────────────────

let seed = 1
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const _m = new THREE.Matrix4(), _e = new THREE.Euler()

/** Writes a per-vertex colour: a small random tint per piece, lighter where edges/bevels would wear. */
function paint(g: THREE.BufferGeometry, tint: number, wear: number, mode: 0 | 1 | 2): void {
  const n = g.attributes.normal, col = new Float32Array(n.count * 3)
  for (let i = 0; i < n.count; i++) {
    let e = 0
    if (wear > 0 && mode) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
      e = mode === 1 ? Math.min(1, (1 - Math.max(ax, ay, az)) * 2.6) : ax > 0.12 && ax < 0.93 ? 1 : 0
    }
    const c = tint * (1 + wear * e)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3))
}

/** Parses a tiny path language in gun side-view coordinates "M z y L z y Q cz cy z y C … Z" (or x y for front views). */
function shapeOf(path: string): THREE.Shape {
  const t = path.trim().split(/[\s,]+/), s = new THREE.Shape()
  let i = 0
  const n = () => parseFloat(t[i++])
  while (i < t.length) {
    const c = t[i++]
    if (c === "M") s.moveTo(n(), n())
    else if (c === "L") s.lineTo(n(), n())
    else if (c === "Q") { const a = n(), b = n(), x = n(), y = n(); s.quadraticCurveTo(a, b, x, y) }
    else if (c === "C") { const a = n(), b = n(), c2 = n(), d = n(), x = n(), y = n(); s.bezierCurveTo(a, b, c2, d, x, y) }
    else if (c === "Z") s.closePath()
    else i-- , s.lineTo(n(), n())
  }
  return s
}
function shapeOfPts(p: number[]): THREE.Shape {
  const s = new THREE.Shape(); s.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) s.lineTo(p[i], p[i + 1]); s.closePath(); return s
}

/** Collects geometry for one rigid part; merge() turns it into one mesh per material. */
export class Kit {
  private bins = new Map<MatName, THREE.BufferGeometry[]>()
  private stack: THREE.Matrix4[] = []
  constructor(private offset = new THREE.Vector3()) {}

  /** Runs fn with an extra transform applied to everything it adds. */
  at(m: THREE.Matrix4, fn: () => void): void { this.stack.push(m); fn(); this.stack.pop() }

  add(g: THREE.BufferGeometry, mat: MatName, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, mode: 0 | 1 | 2 = 1): void {
    if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)))
    g.translate(x, y, z)
    for (let i = this.stack.length - 1; i >= 0; i--) g.applyMatrix4(this.stack[i])
    g.translate(-this.offset.x, -this.offset.y, -this.offset.z)
    if (g.index) g = g.toNonIndexed()
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    paint(g, 0.92 + rand() * 0.12, WEAR(mat), mode)
    let bin = this.bins.get(mat); if (!bin) this.bins.set(mat, bin = [])
    bin.push(g)
  }
  /** Box with chamfered edges (r = 0 for a sharp box). */
  box(mat: MatName, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, r = Math.min(w, h, d) * 0.2): void {
    const g = r > 0.0004 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999) : new THREE.BoxGeometry(w, h, d)
    this.add(g, mat, x, y, z, rx, ry, rz)
  }
  /** Cylinder along Z centred at z (rFront = radius towards -Z). */
  cyl(mat: MatName, r: number, len: number, x: number, y: number, z: number, seg = 14, rFront = r, rx = 0, ry = 0): void {
    const g = new THREE.CylinderGeometry(rFront, r, len, seg); g.rotateX(-Math.PI / 2)
    this.add(g, mat, x, y, z, rx, ry, 0, 0)
  }
  /** Cylinder along X (pins, turrets on the side) or Y (axis: "x" | "y"). */
  peg(mat: MatName, r: number, len: number, x: number, y: number, z: number, axis: "x" | "y", seg = 12): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg); if (axis === "x") g.rotateZ(Math.PI / 2)
    this.add(g, mat, x, y, z, 0, 0, 0, 0)
  }
  /** Surface of revolution around Z; pts = r0, z0, r1, z1 … listed from rear to front (relative to z). */
  lathe(mat: MatName, pts: number[], x: number, y: number, z: number, seg = 16, rx = 0, ry = 0): void {
    const v: THREE.Vector2[] = []
    for (let i = 0; i < pts.length; i += 2) v.push(new THREE.Vector2(Math.max(0, pts[i]), -pts[i + 1]))
    const g = new THREE.LatheGeometry(v, seg); g.rotateX(-Math.PI / 2)
    this.add(g, mat, x, y, z, rx, ry, 0, 0)
  }
  /** Side-view profile (z, y path) extruded across X with a small bevel; holes are paths too. */
  side(mat: MatName, path: string | number[], width: number, x = 0, bevel = 0.0012, holes: (string | number[])[] = []): void {
    const s = typeof path === "string" ? shapeOf(path) : shapeOfPts(path)
    for (const h of holes) { const hs = typeof h === "string" ? shapeOf(h) : shapeOfPts(h); s.holes.push(new THREE.Path(hs.getPoints())) }
    const b = Math.min(bevel, width * 0.3)
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0002, width - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 1, curveSegments: 6 })
    g.rotateY(-Math.PI / 2); g.computeBoundingBox(); const bb = g.boundingBox!
    g.translate(x - (bb.min.x + bb.max.x) / 2, 0, 0)
    this.add(g, mat, 0, 0, 0, 0, 0, 0, 2)
  }
  /** Front-view profile (x, y path) extruded along Z (depth) centred at z. */
  front(mat: MatName, path: string | number[], depth: number, z: number, bevel = 0.0008, holes: (string | number[])[] = []): void {
    const s = typeof path === "string" ? shapeOf(path) : shapeOfPts(path)
    for (const h of holes) { const hs = typeof h === "string" ? shapeOf(h) : shapeOfPts(h); s.holes.push(new THREE.Path(hs.getPoints())) }
    const b = Math.min(bevel, depth * 0.3)
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0002, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 1, curveSegments: 10 })
    g.computeBoundingBox(); const bb = g.boundingBox!
    g.translate(0, 0, z - (bb.min.z + bb.max.z) / 2)
    this.add(g, mat, 0, 0, 0, 0, 0, 0, 0)
  }
  sphere(mat: MatName, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 12): void {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)); g.scale(sx, sy, sz); this.add(g, mat, x, y, z, 0, 0, 0, 0)
  }
  /** Flat disc facing +Z (towards the shooter) or -Z (front = true). */
  disc(mat: MatName, r: number, x: number, y: number, z: number, front = true, seg = 16): void {
    const g = new THREE.CircleGeometry(r, seg); if (front) g.rotateY(Math.PI); this.add(g, mat, x, y, z, 0, 0, 0, 0)
  }
  /** Ring in the XY plane (aperture sights, hoods). */
  ring(mat: MatName, r: number, tube: number, x: number, y: number, z: number, seg = 18): void {
    this.add(new THREE.TorusGeometry(r, tube, 6, seg), mat, x, y, z, 0, 0, 0, 0)
  }
  /** One mesh per material. */
  merge(mats: WeaponMaterials, into: THREE.Object3D): number {
    let n = 0
    for (const [mat, geos] of this.bins) {
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
      if (!g) continue
      g.computeBoundingSphere()
      const mesh = new THREE.Mesh(g, mats[mat]); mesh.name = mat; into.add(mesh); n++
      if (geos.length > 1) for (const x of geos) x.dispose()
    }
    this.bins.clear()
    return n
  }
}

// ───────────────────────────── hand anchors ─────────────────────────────

/**
 * How a hand wraps a handle. The anchor frame: handle axis = +Y (index finger end), the palm lies on the +X side
 * (right hand; mirrored for the left), fingers wrap around the -Z side, the wrist sits behind (+Z).
 */
export interface Hold {
  /** Handle half-extent towards the palm (x) and front-to-back (z). */
  rx: number
  rz: number
  index?: "wrap" | "straight" | "trigger"
  thumb?: "wrap" | "along" | "open"
  /** Open hand (fingers barely curled): pressing, slapping, pushing rounds. */
  open?: boolean
  /** Wrist position in the anchor frame (right-hand coordinates; x is mirrored for the left hand). */
  wrist?: [number, number, number]
}
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3()
/** Anchor orientation from its X (palm side) and Y (handle axis) directions in part space. */
export function frame(x: [number, number, number], y: [number, number, number]): THREE.Quaternion {
  _x.set(...x).normalize(); _y.set(...y).normalize(); _z.crossVectors(_x, _y).normalize(); _y.crossVectors(_z, _x)
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_x, _y, _z))
}
/** Vertical handle (pistol grip, foregrip, magazine), top leaning forward by tilt radians. */
export const gripFrame = (tilt: number) => frame([1, 0, 0], [0, Math.cos(tilt), -Math.sin(tilt)])
/** Support hand under a handguard / pump (left hand): palm below, fingers around the right side, index forward. */
export const underFrame = (roll = 0) => frame([-Math.sin(roll), Math.cos(roll), 0], [0, 0, -1])
/** Overhand from above (left hand): palm on top, fingers down the right side. */
export const overFrame = () => frame([0, -1, 0], [0, 0, 1])

// ───────────────────────────── rig ─────────────────────────────

export type SightKind = "iron" | "reddot" | "holo" | "scope"
export type CasingKind = "9mm" | "44" | "556" | "762" | "338" | "shell" | "none"
/** How the gun cycles: drives fire and reload animations in the viewmodel. */
export type ActionKind = "slide" | "revolver" | "auto" | "semi" | "pump" | "bolt" | "belt" | "melee"
/** Which control the support hand works when a reload starts from empty. */
export type ChargeKind = "slide" | "rear" | "left" | "right" | "front" | "none"

export interface RigSpec {
  cls: WeaponClass
  action: ActionKind
  casing: CasingKind
  /** Recoil strength (1 = assault rifle). */
  kick: number
  /** Muzzle flash size (1 = assault rifle). */
  flash: number
  charge: ChargeKind
  /** Hip pose of the sight origin in camera space: px, py, pz, rx, ry, rz. */
  hip: [number, number, number, number, number, number]
  /** Eye distance behind the rear sight when aiming with irons. */
  eyeIron: number
  /** Charging handle travel when it reciprocates with every shot (AK, SCAR, semi-auto shotgun). */
  reciprocating?: number
  /** Shoulder positions in camera space (right, left) when the arms need a different reach (pistols). */
  shoulders?: [number, number, number, number, number, number]
}

export interface WeaponRig {
  id: WeaponId
  mods: WeaponMods
  /** Gun space root (bore on y = 0). */
  group: THREE.Group
  spec: RigSpec
  parts: Record<string, THREE.Object3D>
  anchors: Record<string, THREE.Object3D>
  /** Sight line height above the bore and the z of the rear sight / optic eyepiece. */
  sightY: number
  sightZ: number
  /** Iron sight line height and rear sight z (hip pose reference, so mounting an optic does not move the gun at the hip). */
  ironY: number
  ironZ: number
  /** Single loading: direction a round travels into the gun (gun space) at the "load" anchor. */
  loadDir: THREE.Vector3
  /** Eye distance behind sightZ at full ADS. */
  eye: number
  sight: SightKind
  muzzle: THREE.Object3D
  eject: THREE.Object3D
  /** Glowing red dot / holographic reticle, faded in with ADS. */
  reticle: THREE.Object3D | null
  /** Laser emitter (beam along -Z) and flashlight lens of the tactical module. */
  laser: THREE.Object3D | null
  lamp: THREE.Mesh | null
  /** Rest position (part space of the mag's parent) and the direction it slides out. */
  magRest: THREE.Vector3
  magAxis: THREE.Vector3
  suppressed: boolean
  /** Muzzle brake / compensator: flash vents sideways. */
  brake: boolean
  /** LMG belt: re-lays the rounds along the feed path (phase in links). */
  belt: ((phase: number, visible: boolean) => void) | null
  /** Points that must sit on the sight line at full ADS (front post tip, rear sight, reticle centre) — for checks. */
  marks: Record<string, THREE.Object3D>
  meshCount: number
}

interface Mounts {
  optic?: { z: number; y: number; part?: string }
  muzzle?: { z: number; r: number; part?: string }
  grip?: { z: number; y: number; rail?: boolean }
  tac?: { z: number; y: number; x: number; under?: boolean; rail?: boolean }
}

/** Build context handed to the per-weapon builders. */
class Build {
  readonly root = new THREE.Group()
  readonly parts: Record<string, THREE.Object3D> = {}
  readonly anchors: Record<string, THREE.Object3D> = {}
  readonly pivots: Record<string, THREE.Vector3> = {}
  readonly marks: Record<string, THREE.Object3D> = {}
  readonly kits: [Kit, THREE.Object3D][] = []
  readonly body: Kit
  readonly muzzle = new THREE.Object3D()
  readonly eject = new THREE.Object3D()
  spec!: RigSpec
  mount: Mounts = {}
  ironY = 0
  ironZ = 0
  sightY = 0
  sightZ = 0
  eye = 0.2
  sight: SightKind = "iron"
  magRest = new THREE.Vector3()
  magAxis = new THREE.Vector3(0, -1, 0)
  loadDir = new THREE.Vector3(0, 1, 0)
  reticle: THREE.Object3D | null = null
  laser: THREE.Object3D | null = null
  lamp: THREE.Mesh | null = null
  suppressed = false
  brake = false
  belt: WeaponRig["belt"] = null
  /** Iron sights: fold (flip-up sights) or hide (fixed rear sight) when an optic is mounted. */
  irons: "fold" | "hide" | "none" = "hide"
  constructor(readonly id: WeaponId, readonly mods: WeaponMods, readonly mats: WeaponMaterials) {
    this.parts.body = this.root; this.pivots.body = new THREE.Vector3()
    this.body = new Kit(); this.kits.push([this.body, this.root])
    this.root.add(this.muzzle, this.eject)
  }
  has(slot: AttachmentSlot): AttachmentId | undefined { const a = this.mods[slot]; return a && canAttach(this.id, a) ? a : undefined }
  /** A moving part with its pivot (gun space). local = geometry given relative to the pivot (needed for rotated parts). */
  part(name: string, parent = "body", pivot: [number, number, number] = [0, 0, 0], opts: { local?: boolean; rx?: number } = {}): Kit {
    const g = new THREE.Group(); g.name = name
    const pp = this.pivots[parent], pv = new THREE.Vector3(...pivot)
    g.position.copy(pv).sub(pp); if (opts.rx) g.rotation.x = opts.rx
    this.parts[parent].add(g); this.parts[name] = g; this.pivots[name] = pv
    const k = new Kit(opts.local ? new THREE.Vector3() : pv.clone()); this.kits.push([k, g]); return k
  }
  /** Hand anchor on a part; pos in gun space (or part-local for local parts). */
  anchor(name: string, part: string, pos: [number, number, number], q: THREE.Quaternion, hold: Hold, local = false): THREE.Object3D {
    const o = new THREE.Object3D(); o.name = name
    o.position.set(...pos); if (!local) o.position.sub(this.pivots[part])
    o.quaternion.copy(q); o.userData.hold = hold
    this.parts[part].add(o); this.anchors[name] = o; return o
  }
  /** Named check point (gun space) on a part, e.g. the tip of the front sight post. */
  mark(name: string, part: string, x: number, y: number, z: number): void {
    const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z).sub(this.pivots[part]); this.parts[part].add(o); this.marks[name] = o
  }
  setEject(x: number, y: number, z: number, part = "body"): void { this.parts[part].add(this.eject); this.eject.position.set(x, y, z).sub(this.pivots[part]) }
  setMuzzle(z: number, part = "body", y = 0): void { this.parts[part].add(this.muzzle); this.muzzle.position.set(0, y, z).sub(this.pivots[part]) }
  finish(): number { let n = 0; for (const [k, g] of this.kits) n += k.merge(this.mats, g); return n }
}

// ───────────────────────────── shared pieces ─────────────────────────────

/** Picatinny rail: base strip + cross teeth (top 8.5 mm above y). dir rotates it onto a side. */
function rail(k: Kit, z0: number, z1: number, x: number, y: number, mat: MatName = "alu", dir: "up" | "down" | "left" | "right" = "up", w = 0.021): void {
  const rot = dir === "up" ? 0 : dir === "down" ? Math.PI : dir === "left" ? Math.PI / 2 : -Math.PI / 2
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2, lo = Math.min(z0, z1)
  k.at(new THREE.Matrix4().makeTranslation(x, y, 0).multiply(new THREE.Matrix4().makeRotationZ(rot)), () => {
    k.box(mat, w * 0.76, 0.0046, len, 0, 0.0023, zc, 0, 0, 0, 0.0008)
    const n = Math.max(1, Math.round(len / 0.01))
    for (let i = 0; i < n; i++) k.box(mat, w, 0.004, 0.0052, 0, 0.0065, lo + (i + 0.5) * len / n, 0, 0, 0, 0.0006)
  })
}

/** Pistol grip hanging from (z, y): swept back by angle, finger grooves at the front. Returns the anchor centre. */
function pistolGrip(k: Kit, mat: MatName, z: number, y: number, angle: number, len: number, depth: number, width: number): [number, number, number] {
  const s = Math.sin(angle), c = Math.cos(angle), f = -depth / 2, b = depth / 2
  const P = (dz: number, d: number) => `${(z + dz + d * s).toFixed(4)} ${(y - d * c).toFixed(4)}`
  const path = `M ${P(f, 0)} L ${P(f - 0.003, len * 0.22)} Q ${P(f + 0.004, len * 0.32)} ${P(f - 0.002, len * 0.44)} Q ${P(f + 0.004, len * 0.56)} ${P(f - 0.002, len * 0.68)} L ${P(f, len * 0.97)} Q ${P(f, len * 1.02)} ${P(f + 0.008, len)} L ${P(b - 0.004, len)} Q ${P(b + 0.002, len)} ${P(b + 0.002, len * 0.94)} L ${P(b + 0.004, len * 0.3)} Q ${P(b + 0.006, 0)} ${P(b - 0.006, -0.002)} Z`
  k.side(mat, path, width, 0, 0.0025)
  return [0, y - len * 0.5 * c, z + len * 0.5 * s]
}

/** Trigger guard loop and trigger blade between zf (front) and zb (rear) below y. */
function triggerGuard(k: Kit, mat: MatName, zf: number, zb: number, y: number, h: number, w = 0.012, trigger: MatName = "steel"): void {
  const t = 0.0035
  k.side(mat, `M ${zf} ${y} L ${zf} ${y - h + 0.008} Q ${zf} ${y - h} ${zf + 0.008} ${y - h} L ${zb} ${y - h * 0.8} L ${zb} ${y} Z`, w, 0, 0.0008,
    [`M ${zf + t} ${y - 0.002} L ${zf + t} ${y - h + 0.009} Q ${zf + t} ${y - h + t} ${zf + 0.009} ${y - h + t} L ${zb - t} ${y - h * 0.8 + t * 0.8} L ${zb - t} ${y - 0.002} Z`])
  const tz = zf + (zb - zf) * 0.52
  k.side(trigger, `M ${tz - 0.002} ${y} L ${tz + 0.003} ${y} Q ${tz + 0.004} ${y - h * 0.45} ${tz - 0.004} ${y - h * 0.7} L ${tz - 0.006} ${y - h * 0.66} Q ${tz} ${y - h * 0.45} ${tz - 0.002} ${y} Z`, 0.005, 0, 0.0005)
}

/** Box magazine outline: hangs from y0 centred on zc, depth d0 → d1, length len, curving forward from tilt0 to tilt1 (rad). */
function magOutline(zc: number, y0: number, d0: number, d1: number, len: number, tilt0: number, tilt1: number, steps = 8): { pts: number[]; bottom: [number, number, number] } {
  const front: number[][] = [], back: number[][] = []
  let z = zc, y = y0
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = tilt0 + (tilt1 - tilt0) * t, d = d0 + (d1 - d0) * t
    // centreline heads down and forward (−z) by angle a; the normal (towards the front) is (−cos a, −sin a) in (z, y)
    front.push([z - Math.cos(a) * d / 2, y + Math.sin(a) * d / 2]); back.push([z + Math.cos(a) * d / 2, y - Math.sin(a) * d / 2])
    if (i < steps) { const a2 = tilt0 + (tilt1 - tilt0) * (t + 0.5 / steps); z -= Math.sin(a2) * len / steps; y -= Math.cos(a2) * len / steps }
  }
  const pts: number[] = []
  for (const p of front) pts.push(p[0], p[1])
  for (let i = back.length - 1; i >= 0; i--) pts.push(back[i][0], back[i][1])
  return { pts, bottom: [z, y, tilt1] }
}

/** Magazine (local to its part, top centre at 0,0): body, side ribs, floor plate and the top round. */
function boxMag(k: Kit, mat: MatName, width: number, d0: number, d1: number, len: number, tilt0: number, tilt1: number, round: "9mm" | "556" | "762" | "338" | "none" = "556", ribs = true): [number, number, number] {
  const o = magOutline(0, 0.006, d0, d1, len + 0.006, tilt0, tilt1)
  k.side(mat, o.pts, width, 0, 0.0018)
  if (ribs) { const r = magOutline(0, -0.02, d0 * 0.55, d1 * 0.55, len * 0.78, tilt0, tilt1); k.side(mat, r.pts, width + 0.003, 0, 0.001) }
  const [bz, by, ba] = o.bottom
  k.box(mat, width + 0.006, 0.01, d1 + 0.008, 0, by + Math.cos(ba) * 0.003, bz + Math.sin(ba) * 0.003, -ba, 0, 0, 0.003)
  if (round !== "none") {
    const r = round === "9mm" ? 0.0048 : round === "556" ? 0.0049 : round === "762" ? 0.006 : 0.0075, l = round === "9mm" ? 0.026 : round === "338" ? 0.085 : round === "762" ? 0.06 : 0.05
    k.cyl("brass", r, l * 0.7, 0, 0.0075, d0 * 0.08, 10, r * 0.8)
    k.cyl("copper", r * 0.8, l * 0.3, 0, 0.0075, d0 * 0.08 - l * 0.5, 10, r * 0.25)
  }
  return o.bottom
}

/** Flash hider "birdcage": slotted cylinder starting at z going forward. */
function birdcage(k: Kit, z: number, r: number, len: number, mat: MatName = "steel"): void {
  k.lathe(mat, [r * 0.9, z, r, z - 0.004, r, z - len, r * 0.75, z - len - 0.001], 0, 0, 0, 14)
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; k.box("steelDark", 0.003, 0.003, len * 0.6, Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98, z - len * 0.55, 0, 0, a, 0) }
  k.disc("dark", r * 0.55, 0, 0, z - len - 0.0012)
}

/** Barrel with a dark bore at the front. */
function barrel(k: Kit, z0: number, z1: number, r: number, mat: MatName = "steel", y = 0): void {
  k.cyl(mat, r, Math.abs(z0 - z1), 0, y, (z0 + z1) / 2, 16)
  k.disc("dark", r * 0.5, 0, y, Math.min(z0, z1) - 0.0003)
}

/** Butt pad on a stock end at z between y0 (top) and y1 (bottom). */
function buttPad(k: Kit, z: number, y0: number, y1: number, w: number): void {
  k.side("rubber", `M ${z} ${y0} L ${z + 0.012} ${y0 - 0.002} Q ${z + 0.016} ${(y0 + y1) / 2} ${z + 0.012} ${y1 + 0.002} L ${z} ${y1} Z`, w, 0, 0.002)
}

const holdGrip = (rx: number, rz: number, extra: Partial<Hold> = {}): Hold => ({ rx, rz, index: "trigger", thumb: "wrap", ...extra })

// ───────────────────────────── weapons ─────────────────────────────

function buildP9(b: Build): void {
  const k = b.body
  // frame with accessory rail under the dust cover
  k.side("polymer", "M -.12 -.0105 L .05 -.0105 L .05 -.024 L -.058 -.024 L -.064 -.031 L -.12 -.031 Z", 0.024, 0, 0.0015)
  rail(k, -0.117, -0.073, 0, -0.031, "polymer", "down", 0.02)
  triggerGuard(k, "polymer", -0.066, 0.004, -0.024, 0.034, 0.012, "polymer")
  const g = pistolGrip(k, "polymer", 0.034, -0.022, 0.27, 0.106, 0.044, 0.0265)
  k.side("polymer", "M .046 -.0105 L .062 -.011 Q .072 -.016 .066 -.03 L .05 -.03 Z", 0.022, 0, 0.0015) // beavertail
  k.at(new THREE.Matrix4().makeRotationX(-0.27), () => { for (const s of [-1, 1]) k.box("rubber", 0.002, 0.058, 0.03, s * 0.0137, -0.072, 0.054, 0, 0, 0, 0.0008) })
  k.box("steel", 0.026, 0.004, 0.012, 0, -0.026, -0.008, 0, 0, 0, 0.001) // slide stop / takedown
  // barrel (the slide covers it; only the crown shows)
  const threaded = !!b.has("muzzle")
  barrel(k, -0.11, threaded ? -0.142 : -0.1265, 0.0067)
  // slide
  const s = b.part("slide")
  s.side("steel", "M -.124 -.0105 L .058 -.0105 L .058 .0162 Q .058 .019 .055 .019 L -.116 .019 Q -.124 .019 -.124 .012 Z", 0.0255, 0, 0.0018)
  for (let i = 0; i < 6; i++) s.box("steelDark", 0.0262, 0.019, 0.0016, 0, 0.004, 0.033 + i * 0.0042, 0, 0, 0, 0)
  s.box("steelDark", 0.011, 0.002, 0.032, 0.0035, 0.0186, 0.004, 0, 0, 0, 0) // ejection port
  s.box("steel", 0.0035, 0.008, 0.005, 0, 0.022, -0.112, 0, 0, 0, 0.0008)       // front post, top at 0.026
  s.sphere("glowGreen", 0.0011, 0, 0.0226, -0.1094, 1, 1, 0.4, 8)
  s.box("steel", 0.022, 0.004, 0.012, 0, 0.021, 0.046, 0, 0, 0, 0.001)
  for (const x of [-1, 1]) { s.box("steel", 0.0072, 0.005, 0.008, x * 0.0058, 0.0235, 0.047, 0, 0, 0, 0.0008); s.sphere("glowGreen", 0.001, x * 0.0058, 0.0234, 0.0511, 1, 1, 0.4, 8) }
  b.ironY = 0.026; b.ironZ = 0.051
  b.mark("front", "slide", 0, 0.026, -0.112); b.mark("rear", "slide", 0, 0.026, 0.051)
  // magazine in the grip (part-local, rotated with the grip angle)
  const m = b.part("mag", "body", [0, -0.024, 0.034], { local: true, rx: -0.27 })
  const ext = !!b.has("mag"), len = ext ? 0.142 : 0.107
  m.box("steel", 0.021, len, 0.031, 0, -len / 2, 0, 0, 0, 0, 0.002)
  m.cyl("brass", 0.0048, 0.012, 0, 0.002, -0.004, 10); m.cyl("copper", 0.0046, 0.006, 0, 0.002, -0.013, 10, 0.0028)
  if (ext) m.box("polymer", 0.027, 0.04, 0.04, 0, -len + 0.015, 0.001, 0, 0, 0, 0.004)
  m.box("polymer", 0.026, 0.009, 0.037, 0, -len - 0.002, 0.001, 0, 0, 0, 0.003)
  b.magRest.set(0, -0.024, 0.034); b.magAxis.set(0, -Math.cos(0.27), Math.sin(0.27))
  b.anchor("magHold", "mag", [0, -len * 0.62, 0.002], gripFrame(0), { rx: 0.011, rz: 0.016, thumb: "wrap" }, true)
  b.setEject(0.012, 0.016, 0.004, "slide")
  b.setMuzzle(threaded ? -0.142 : -0.1265)
  b.anchor("grip", "body", g, gripFrame(0.27), holdGrip(0.0135, 0.023))
  b.anchor("support", "body", [-0.004, g[1] - 0.008, g[2] - 0.004], gripFrame(0.27), { rx: 0.031, rz: 0.033, thumb: "along" })
  b.anchor("charge", "slide", [0, 0.004, 0.04], overFrame(), { rx: 0.016, rz: 0.014, thumb: "wrap" })
  b.mount = { muzzle: { z: -0.142, r: 0.0067 }, tac: { z: -0.094, y: -0.0395, x: 0, under: true } }
  b.irons = "none"
  b.spec = { cls: "pistol", action: "slide", casing: "9mm", kick: 1, flash: 0.7, charge: "slide", hip: [0.1, -0.085, -0.36, 0.03, 0.06, 0], eyeIron: 0.4, shoulders: PISTOL_SHOULDERS }
}

function buildMk4(b: Build): void {
  const k = b.body
  // upper receiver with flat-top rail, ejection port, forward assist, brass deflector
  k.side("alu", "M -.115 .026 L .114 .026 L .114 -.004 L .1 -.012 L -.115 -.012 Z", 0.036, 0, 0.0025)
  rail(k, -0.114, 0.112, 0, 0.026)
  k.box("steelDark", 0.003, 0.016, 0.052, 0.0181, 0.008, 0.012, 0, 0, 0, 0)       // ejection port
  k.box("alu", 0.004, 0.018, 0.012, 0.019, 0.006, 0.05, 0, 0, 0, 0.0015)           // brass deflector
  k.cyl("alu", 0.0065, 0.03, 0.017, 0.011, 0.074, 10, 0.0065, 0, 0.35)             // forward assist
  // lower receiver: mag well, trigger guard, pistol grip, buffer tube, stock
  k.side("alu", "M -.086 -.012 L .118 -.012 L .118 -.03 Q .1 -.042 .07 -.042 L -.024 -.042 L -.03 -.06 L -.084 -.06 L -.088 -.04 Z", 0.034, 0, 0.0025)
  k.box("alu", 0.004, 0.012, 0.012, -0.019, -0.022, -0.012, 0, 0, 0, 0.001)        // bolt catch
  k.peg("steel", 0.004, 0.006, 0.019, -0.024, -0.02, "x")                          // mag release
  triggerGuard(k, "alu", -0.024, 0.032, -0.042, 0.024, 0.012)
  const g = pistolGrip(k, "polymer", 0.05, -0.034, 0.36, 0.105, 0.036, 0.027)
  k.cyl("alu", 0.0145, 0.18, 0, 0.0, 0.205, 16)
  k.side("polymer", "M .2 .024 L .335 .028 Q .344 .028 .344 .018 L .344 -.068 Q .344 -.08 .332 -.08 L .3 -.072 L .24 -.022 L .2 -.02 Z", 0.042, 0, 0.004)
  buttPad(k, 0.344, 0.026, -0.078, 0.042)
  k.box("polymer", 0.03, 0.012, 0.05, 0, -0.024, 0.255, 0, 0, 0, 0.003)            // stock lever housing
  // free-float M-LOK handguard with top rail
  k.box("alu", 0.046, 0.054, 0.305, 0, -0.002, -0.268, 0, 0, 0, 0.01)
  rail(k, -0.418, -0.12, 0, 0.025)
  for (const zz of [-0.17, -0.23, -0.29, -0.35]) for (const sx of [-1, 1]) k.box("steelDark", 0.002, 0.008, 0.034, sx * 0.0232, -0.004, zz, 0, 0, 0, 0)
  for (const zz of [-0.2, -0.26, -0.32, -0.38]) k.box("steelDark", 0.008, 0.002, 0.034, 0, -0.0292, zz, 0, 0, 0, 0)
  k.cyl("alu", 0.017, 0.012, 0, 0.001, -0.115, 16)                                  // barrel nut
  // barrel + muzzle
  const dev = b.has("muzzle")
  barrel(k, -0.42, -0.535, 0.0088)
  if (!dev) birdcage(k, -0.535, 0.0112, 0.044)
  // charging handle (rear, T-handle)
  const ch = b.part("charger")
  ch.box("alu", 0.012, 0.006, 0.05, 0, 0.022, 0.1, 0, 0, 0, 0.0015); ch.box("alu", 0.036, 0.007, 0.012, 0, 0.022, 0.124, 0, 0, 0, 0.002)
  ch.box("alu", 0.008, 0.008, 0.012, -0.016, 0.022, 0.12, 0, 0, 0, 0.002)
  // bolt carrier visible in the ejection port (moves back when empty)
  const bc = b.part("carrier"); bc.box("steelLight", 0.002, 0.013, 0.05, 0.0172, 0.008, 0.012, 0, 0, 0, 0)
  // folding iron sights
  const fs = b.part("ironFront", "body", [0, 0.0345, -0.395])
  fs.box("polymer", 0.024, 0.009, 0.028, 0, 0.039, -0.395, 0, 0, 0, 0.002)
  for (const sx of [-1, 1]) fs.box("polymer", 0.004, 0.034, 0.012, sx * 0.0085, 0.06, -0.395, 0, 0, 0, 0.001)
  fs.box("steel", 0.003, 0.03, 0.003, 0, 0.0575, -0.395, 0, 0, 0, 0)                // post, top at 0.0725
  const rs = b.part("ironRear", "body", [0, 0.0345, 0.095])
  rs.box("polymer", 0.024, 0.009, 0.026, 0, 0.039, 0.095, 0, 0, 0, 0.002)
  rs.front("polymer", "M -.006 .043 L .006 .043 L .006 .062 L -.006 .062 Z", 0.006, 0.095, 0.0006)
  rs.ring("polymer", 0.0082, 0.0022, 0, 0.0725, 0.095, 24)
  for (const sx of [-1, 1]) rs.box("polymer", 0.004, 0.03, 0.008, sx * 0.0135, 0.066, 0.095, 0, 0, 0, 0.0012)
  b.ironY = 0.0725; b.ironZ = 0.0915; b.irons = "fold"
  b.mark("front", "ironFront", 0, 0.0725, -0.395); b.mark("rear", "ironRear", 0, 0.0725, 0.0915)
  // magazine (polymer, curved)
  const m = b.part("mag", "body", [0, -0.036, -0.056], { local: true })
  const ext = !!b.has("mag")
  boxMag(m, "polymer", 0.023, 0.058, 0.054, ext ? 0.27 : 0.19, 0.08, ext ? 0.42 : 0.34, "556")
  b.magRest.set(0, -0.036, -0.056); b.magAxis.set(0, -Math.cos(0.08), -Math.sin(0.08))
  b.anchor("magHold", "mag", [0, -0.1, -0.012], gripFrame(-0.2), { rx: 0.012, rz: 0.03, thumb: "wrap" }, true)
  b.setEject(0.02, 0.008, 0.012)
  b.setMuzzle(dev ? -0.535 : -0.579)
  b.anchor("grip", "body", g, gripFrame(0.36), holdGrip(0.0135, 0.018))
  b.anchor("support", "body", [0, -0.002, -0.3], underFrame(), { rx: 0.028, rz: 0.024, thumb: "along" })
  b.anchor("charge", "charger", [0, 0.026, 0.124], overFrame(), { rx: 0.008, rz: 0.018, thumb: "wrap", open: true })
  b.mount = { optic: { z: -0.01, y: 0.0345 }, muzzle: { z: -0.535, r: 0.0088 }, grip: { z: -0.3, y: -0.029, rail: true }, tac: { z: -0.37, y: -0.002, x: 0.023, rail: true } }
  b.spec = { cls: "rifle", action: "auto", casing: "556", kick: 1, flash: 1, charge: "rear", hip: [0.105, -0.088, -0.29, 0.02, 0.05, -0.02], eyeIron: 0.14 }
}


const PISTOL_SHOULDERS: [number, number, number, number, number, number] = [0.17, -0.33, -0.04, -0.17, -0.34, -0.04]

function buildR44(b: Build): void {
  const k = b.body
  // stainless frame around the cylinder window, top strap with the rear sight, round butt frame
  k.side("stainless", "M -.048 .017 L .03 .017 Q .042 .017 .046 .008 L .052 -.008 L .052 -.03 L .032 -.05 L -.05 -.05 L -.05 -.03 L -.048 .01 Z", 0.022, 0, 0.0015,
    ["M -.0445 .0095 L -.0015 .0095 L -.0015 -.0375 L -.0445 -.0375 Z"])
  // 6" barrel with full underlug and top rib, ramp front sight with an orange insert
  barrel(k, -0.048, -0.2, 0.0105, "stainless")
  k.side("stainless", "M -.05 -.006 L -.192 -.006 Q -.2 -.006 -.2 -.016 L -.2 -.022 Q -.198 -.029 -.19 -.029 L -.05 -.029 Z", 0.018, 0, 0.0015)
  k.box("stainless", 0.012, 0.007, 0.15, 0, 0.0135, -0.124, 0, 0, 0, 0.002)
  k.side("stainless", "M -.198 .017 L -.198 .025 L -.189 .025 L -.178 .017 Z", 0.0035, 0, 0.0004)
  k.box("glowOrange", 0.0037, 0.003, 0.0012, 0, 0.0222, -0.1888, 0, 0, 0, 0)
  const rs = b.part("ironRear", "body", [0, 0.017, 0.012])
  rs.box("steel", 0.014, 0.004, 0.016, 0, 0.019, 0.012, 0, 0, 0, 0.001)
  for (const sx of [-1, 1]) rs.box("steel", 0.0048, 0.005, 0.01, sx * 0.0047, 0.0225, 0.014, 0, 0, 0, 0.0006)
  b.ironY = 0.025; b.ironZ = 0.019; b.irons = "hide"
  b.mark("front", "body", 0, 0.025, -0.189); b.mark("rear", "ironRear", 0, 0.025, 0.019)
  // hammer, trigger guard, cylinder latch, wooden grip
  const hm = b.part("hammer", "body", [0, -0.006, 0.042])
  hm.side("steel", "M .034 -.012 L .044 -.012 L .05 .012 Q .058 .022 .068 .02 L .066 .027 Q .05 .03 .042 .018 Z", 0.0075, 0, 0.0008)
  triggerGuard(k, "stainless", -0.034, 0.014, -0.05, 0.026, 0.01)
  k.box("stainless", 0.004, 0.008, 0.012, -0.0125, -0.006, 0.012, 0, 0, 0, 0.001)
  k.side("wood", "M .024 -.044 Q .02 -.078 .032 -.108 Q .038 -.124 .054 -.124 L .076 -.124 Q .086 -.12 .084 -.106 Q .074 -.07 .072 -.042 Q .07 -.016 .056 -.008 L .046 -.01 Z", 0.034, 0, 0.004)
  // crane + cylinder (swings out to the left), ejector rod
  const cr = b.part("crane", "body", [-0.003, -0.036, 0])
  cr.cyl("stainless", 0.0035, 0.034, 0, -0.0145, -0.06, 10)
  cr.box("stainless", 0.006, 0.024, 0.005, -0.0015, -0.026, -0.046, 0, 0, 0, 0.001)
  const cy = b.part("cylinder", "crane", [0, -0.0145, -0.0225])
  cy.lathe("stainless", [0, 0.0, 0.0185, 0.0, 0.0215, -0.0015, 0.0215, -0.038, 0.019, -0.042, 0.004, -0.042], 0, -0.0145, -0.002, 24)
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 2, f = a + Math.PI / 6
    cy.box("steelDark", 0.0045, 0.0045, 0.022, Math.cos(f) * 0.0208, -0.0145 + Math.sin(f) * 0.0208, -0.024, 0, 0, f, 0)
    cy.disc("dark", 0.0056, Math.cos(a) * 0.0145, -0.0145 + Math.sin(a) * 0.0145, -0.0442)
    cy.disc("copper", 0.0042, Math.cos(a) * 0.0145, -0.0145 + Math.sin(a) * 0.0145, -0.0435)
    cy.disc("brass", 0.0062, Math.cos(a) * 0.0145, -0.0145 + Math.sin(a) * 0.0145, -0.0005, false)
  }
  b.anchor("load", "crane", [0, -0.0145 + 0.0145, 0.03], underFrame(), { rx: 0.007, rz: 0.007, thumb: "wrap" })
  b.loadDir.set(0, 0, -1)
  const g: [number, number, number] = [0, -0.078, 0.054]
  b.anchor("grip", "body", g, gripFrame(0.36), holdGrip(0.016, 0.022))
  b.anchor("support", "body", [-0.006, g[1] - 0.008, g[2] - 0.004], gripFrame(0.36), { rx: 0.033, rz: 0.033, thumb: "along" })
  b.setEject(0.0, 0.0, 0.0); b.setMuzzle(-0.2)
  if (b.has("optic")) rail(k, -0.03, -0.11, 0, 0.017, "alu")
  b.mount = { optic: { z: -0.07, y: 0.0255 }, tac: { z: -0.165, y: -0.0295, x: 0, under: true } }
  b.spec = { cls: "pistol", action: "revolver", casing: "44", kick: 1.6, flash: 1.15, charge: "none", hip: [0.1, -0.08, -0.37, 0.03, 0.06, 0], eyeIron: 0.4, shoulders: PISTOL_SHOULDERS }
}

function buildVx9(b: Build): void {
  const k = b.body
  // stamped receiver with reinforcement ribs, end cap, cocking tube above the barrel
  k.side("steel", "M -.11 .026 Q -.11 .031 -.104 .031 L .126 .031 Q .132 .031 .132 .024 L .132 -.022 L -.11 -.022 Z", 0.04, 0, 0.003)
  for (const sx of [-1, 1]) k.box("steel", 0.002, 0.005, 0.2, sx * 0.0205, 0.014, 0.01, 0, 0, 0, 0)
  k.box("polymer", 0.043, 0.05, 0.016, 0, 0.004, 0.136, 0, 0, 0, 0.004)
  k.cyl("steel", 0.0105, 0.165, 0, 0.018, -0.19, 14); k.disc("steel", 0.0105, 0, 0.018, -0.2726)
  k.box("steelDark", 0.002, 0.005, 0.1, -0.0108, 0.018, -0.2, 0, 0, 0, 0)
  k.box("steelDark", 0.002, 0.012, 0.035, 0.0201, 0.006, -0.02, 0, 0, 0, 0)
  // slim tapered handguard
  k.side("polymer", "M -.112 .006 L -.262 .002 Q -.27 .0 -.27 -.008 L -.266 -.03 Q -.26 -.042 -.24 -.042 L -.13 -.046 Q -.112 -.046 -.112 -.03 Z", 0.046, 0, 0.004)
  for (const zz of [-0.15, -0.18, -0.21, -0.24]) for (const sx of [-1, 1]) k.box("steelDark", 0.002, 0.016, 0.006, sx * 0.0232, -0.02, zz, 0, 0, 0, 0)
  // barrel with tri-lugs, hooded front post
  const dev = b.has("muzzle")
  barrel(k, -0.262, -0.312, 0.0085)
  if (!dev) for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3 + Math.PI / 2; k.box("steel", 0.005, 0.004, 0.012, Math.cos(a) * 0.009, Math.sin(a) * 0.009, -0.295, 0, 0, a, 0.001) }
  k.box("steel", 0.012, 0.03, 0.014, 0, 0.022, -0.282, 0, 0, 0, 0.002)
  k.ring("steel", 0.0105, 0.0022, 0, 0.05, -0.282, 20)
  k.box("steel", 0.0025, 0.012, 0.003, 0, 0.044, -0.282, 0, 0, 0, 0)
  // rotary diopter rear sight
  const rs = b.part("ironRear", "body", [0, 0.031, 0.1])
  rs.box("steel", 0.026, 0.012, 0.022, 0, 0.036, 0.1, 0, 0, 0, 0.002)
  rs.peg("steel", 0.0095, 0.024, 0, 0.042, 0.1, "x")
  rs.ring("steel", 0.0058, 0.0019, 0, 0.05, 0.1, 18)
  b.ironY = 0.05; b.ironZ = 0.1; b.irons = "hide"
  b.mark("front", "body", 0, 0.05, -0.282); b.mark("rear", "ironRear", 0, 0.05, 0.1)
  // trigger group, grip, mag well, fixed stock
  k.side("polymer", "M -.04 -.022 L .086 -.022 L .086 -.04 Q .07 -.047 .05 -.047 L -.04 -.047 Z", 0.036, 0, 0.003)
  triggerGuard(k, "polymer", -0.032, 0.01, -0.046, 0.026, 0.012)
  const g = pistolGrip(k, "polymer", 0.04, -0.044, 0.3, 0.095, 0.036, 0.03)
  k.box("steel", 0.03, 0.03, 0.044, 0, -0.035, -0.056, 0, 0, 0, 0.003)
  k.box("steel", 0.02, 0.008, 0.008, 0, -0.048, -0.028, 0, 0, 0, 0.001)
  k.side("polymer", "M .13 .028 L .368 .022 Q .38 .022 .38 .012 L .38 -.08 Q .38 -.09 .37 -.09 L .33 -.088 Q .2 -.05 .16 -.03 L .13 -.024 Z", 0.042, 0, 0.004)
  buttPad(k, 0.38, 0.02, -0.088, 0.042)
  // cocking handle (front left, HK slap)
  const ch = b.part("charger")
  ch.box("polymer", 0.004, 0.006, 0.024, -0.0215, 0.02, -0.232, 0, -0.25, 0, 0.001); ch.box("polymer", 0.012, 0.009, 0.009, -0.029, 0.02, -0.224, 0, 0, 0, 0.003)
  // curved magazine or drum
  const m = b.part("mag", "body", [0, -0.035, -0.056], { local: true })
  const ext = !!b.has("mag")
  if (ext) {
    boxMag(m, "steel", 0.022, 0.036, 0.034, 0.05, 0.08, 0.15, "9mm", false)
    m.peg("polymer", 0.058, 0.044, 0, -0.105, -0.02, "x", 28); m.peg("steel", 0.02, 0.05, 0, -0.105, -0.02, "x", 14)
    m.peg("steel", 0.006, 0.054, 0, -0.105, -0.02, "x", 8)
    b.anchor("magHold", "mag", [-0.002, -0.105, -0.02], gripFrame(0), { rx: 0.024, rz: 0.05, thumb: "wrap" }, true)
  } else {
    boxMag(m, "steel", 0.022, 0.036, 0.034, 0.17, 0.08, 0.5, "9mm")
    b.anchor("magHold", "mag", [0, -0.1, -0.02], gripFrame(-0.3), { rx: 0.011, rz: 0.018, thumb: "wrap" }, true)
  }
  b.magRest.set(0, -0.035, -0.056); b.magAxis.set(0, -Math.cos(0.08), -Math.sin(0.08))
  b.setEject(0.022, 0.008, -0.02); b.setMuzzle(-0.312)
  b.anchor("grip", "body", g, gripFrame(0.3), holdGrip(0.015, 0.018))
  b.anchor("support", "body", [0, -0.018, -0.205], underFrame(), { rx: 0.028, rz: 0.024, thumb: "along" })
  b.anchor("charge", "charger", [-0.03, 0.024, -0.224], overFrame(), { rx: 0.008, rz: 0.012, thumb: "wrap" })
  if (b.has("optic")) { k.box("steel", 0.024, 0.012, 0.07, 0, 0.036, 0.03, 0, 0, 0, 0.002); for (const zz of [0.005, 0.055]) k.box("steel", 0.044, 0.01, 0.01, 0, 0.034, zz, 0, 0, 0, 0.002); rail(k, -0.004, 0.064, 0, 0.042) }
  b.mount = { optic: { z: 0.03, y: 0.0505 }, muzzle: { z: -0.3, r: 0.0085 }, grip: { z: -0.2, y: -0.045, rail: true }, tac: { z: -0.205, y: -0.016, x: 0.023, rail: true } }
  b.spec = { cls: "smg", action: "auto", casing: "9mm", kick: 0.7, flash: 0.8, charge: "front", hip: [0.1, -0.082, -0.27, 0.02, 0.05, -0.02], eyeIron: 0.13 }
}

function buildK5(b: Build): void {
  const k = b.body
  // compact polymer upper with a full-length rail, front block with a hand stop, grip holding the magazine
  k.side("polyGrey", "M -.125 .03 L .118 .03 L .128 .02 L .128 -.012 L -.125 -.012 Z", 0.034, 0, 0.004)
  rail(k, -0.12, 0.116, 0, 0.03)
  rail(k, -0.118, -0.072, 0.017, 0.006, "alu", "right"); rail(k, -0.118, -0.072, -0.017, 0.006, "alu", "left")
  k.side("polyGrey", "M -.125 -.012 L -.06 -.012 L -.066 -.03 L -.112 -.034 L -.116 -.046 L -.128 -.046 L -.128 -.02 Z", 0.03, 0, 0.003)
  triggerGuard(k, "polyGrey", -0.062, -0.012, -0.012, 0.03, 0.012)
  const g = pistolGrip(k, "polyGrey", 0.012, -0.012, 0.2, 0.1, 0.038, 0.032)
  k.box("steelDark", 0.002, 0.012, 0.03, 0.0172, 0.008, -0.02, 0, 0, 0, 0)
  const dev = b.has("muzzle")
  barrel(k, -0.125, -0.166, 0.0072)
  if (!dev) { k.lathe("steel", [0.008, -0.166, 0.0105, -0.172, 0.0105, -0.19, 0.008, -0.191], 0, 0, 0, 12); k.disc("dark", 0.005, 0, 0, -0.1915) }
  for (const sx of [-1, 1]) k.cyl("steel", 0.004, 0.09, sx * 0.012, -0.004, 0.17, 8)
  k.side("polyGrey", "M .208 .022 L .222 .022 L .222 -.062 L .208 -.062 Z", 0.042, 0, 0.003); buttPad(k, 0.222, 0.02, -0.06, 0.042)
  const ch = b.part("charger")
  ch.box("polyGrey", 0.012, 0.006, 0.03, 0, 0.022, 0.118, 0, 0, 0, 0.001); ch.box("polyGrey", 0.04, 0.008, 0.01, 0, 0.022, 0.132, 0, 0, 0, 0.002)
  // flip-up sights
  const fs = b.part("ironFront", "body", [0, 0.0385, -0.106])
  fs.box("polyGrey", 0.02, 0.007, 0.016, 0, 0.042, -0.106, 0, 0, 0, 0.0015)
  for (const sx of [-1, 1]) fs.box("polyGrey", 0.0035, 0.022, 0.01, sx * 0.0075, 0.054, -0.106, 0, 0, 0, 0.001)
  fs.box("steel", 0.0028, 0.02, 0.003, 0, 0.05, -0.106, 0, 0, 0, 0)
  const rs = b.part("ironRear", "body", [0, 0.0385, 0.1])
  rs.box("polyGrey", 0.02, 0.007, 0.016, 0, 0.042, 0.1, 0, 0, 0, 0.0015); rs.box("polyGrey", 0.005, 0.012, 0.005, 0, 0.05, 0.1, 0, 0, 0, 0.001)
  rs.ring("polyGrey", 0.0068, 0.002, 0, 0.06, 0.1, 22)
  b.ironY = 0.06; b.ironZ = 0.1; b.irons = "fold"
  b.mark("front", "ironFront", 0, 0.06, -0.106); b.mark("rear", "ironRear", 0, 0.06, 0.1)
  // 40-round magazine in the grip
  const m = b.part("mag", "body", [0, -0.014, 0.015], { local: true, rx: -0.2 })
  m.box("polymer", 0.023, 0.16, 0.031, 0, -0.08, 0, 0, 0, 0, 0.002); m.box("polymer", 0.028, 0.012, 0.038, 0, -0.163, 0.001, 0, 0, 0, 0.004)
  m.cyl("brass", 0.0045, 0.012, 0, 0.002, -0.004, 8); m.cyl("copper", 0.0042, 0.006, 0, 0.002, -0.013, 8, 0.0025)
  b.magRest.set(0, -0.014, 0.015); b.magAxis.set(0, -Math.cos(0.2), Math.sin(0.2))
  b.anchor("magHold", "mag", [0, -0.135, 0.002], gripFrame(0), { rx: 0.012, rz: 0.017, thumb: "wrap" }, true)
  b.setEject(0.019, 0.008, -0.02); b.setMuzzle(dev ? -0.166 : -0.191)
  b.anchor("grip", "body", g, gripFrame(0.2), holdGrip(0.0165, 0.02))
  b.anchor("support", "body", [0, -0.018, -0.094], underFrame(), { rx: 0.024, rz: 0.019, thumb: "along" })
  b.anchor("charge", "charger", [0, 0.026, 0.132], overFrame(), { rx: 0.008, rz: 0.02, thumb: "wrap", open: true })
  b.mount = { optic: { z: 0.0, y: 0.0385 }, muzzle: { z: -0.166, r: 0.0072 }, grip: { z: -0.092, y: -0.034, rail: true }, tac: { z: -0.094, y: 0.006, x: 0.0255 } }
  b.spec = { cls: "smg", action: "auto", casing: "9mm", kick: 0.6, flash: 0.7, charge: "rear", hip: [0.1, -0.08, -0.27, 0.02, 0.05, -0.02], eyeIron: 0.13 }
}

function buildSr74(b: Build): void {
  const k = b.body
  // stamped receiver, rounded dust cover, rear sight block with tangent leaf
  k.side("steel", "M -.135 .016 L .16 .016 L .16 -.012 Q .155 -.03 .14 -.03 L -.135 -.03 Z", 0.034, 0, 0.002)
  k.side("steel", "M -.105 .016 L .162 .016 L .162 .025 Q .162 .031 .156 .031 L -.098 .031 Q -.105 .031 -.105 .025 Z", 0.031, 0, 0.003)
  k.box("steel", 0.028, 0.02, 0.032, 0, 0.025, -0.12, 0, 0, 0, 0.003)
  k.box("steel", 0.002, 0.005, 0.08, 0.0178, 0.008, 0.06, 0, 0, 0, 0)           // selector lever
  k.box("steelDark", 0.002, 0.01, 0.07, 0.0172, 0.01, 0.04, 0, 0, 0, 0)          // charging slot
  const rs = b.part("ironRear", "body", [0, 0.035, -0.104])
  rs.box("steel", 0.016, 0.004, 0.034, 0, 0.037, -0.09, -0.06, 0, 0, 0.001)
  for (const sx of [-1, 1]) rs.box("steel", 0.0055, 0.0055, 0.006, sx * 0.0048, 0.0418, -0.075, 0, 0, 0, 0.0008)
  // wooden handguards over the gas tube and around the barrel
  k.side("wood", "M -.14 .016 L -.33 .014 Q -.336 .028 -.33 .036 L -.15 .038 Q -.138 .036 -.138 .026 Z", 0.034, 0, 0.004)
  k.side("wood", "M -.14 -.03 L -.14 .008 L -.34 .008 L -.34 -.024 Q -.33 -.04 -.31 -.04 L -.17 -.044 Q -.15 -.044 -.14 -.03 Z", 0.046, 0, 0.004)
  for (const zz of [-0.18, -0.21, -0.24, -0.27, -0.3]) k.box("woodLight", 0.047, 0.002, 0.004, 0, -0.03, zz, 0, 0, 0, 0)
  k.box("steel", 0.022, 0.032, 0.03, 0, 0.012, -0.352, 0, 0, 0, 0.003)
  // barrel, front sight tower, slant brake
  const dev = b.has("muzzle")
  barrel(k, -0.34, -0.47, 0.009)
  k.box("steel", 0.02, 0.02, 0.028, 0, 0.002, -0.445, 0, 0, 0, 0.003)
  for (const sx of [-1, 1]) k.side("steel", "M -.452 .01 L -.452 .052 Q -.446 .057 -.44 .052 L -.44 .01 Z", 0.004, sx * 0.0085, 0.0006)
  k.box("steel", 0.003, 0.032, 0.003, 0, 0.03, -0.446, 0, 0, 0, 0)
  k.box("steel", 0.01, 0.012, 0.03, 0, -0.016, -0.44, 0, 0, 0, 0.002)
  if (!dev) { k.lathe("steel", [0.0095, -0.47, 0.0122, -0.474, 0.0122, -0.522, 0.009, -0.528], 0, 0, 0, 16); for (const sx of [-1, 1]) k.box("steelDark", 0.003, 0.008, 0.012, sx * 0.0115, 0, -0.49, 0, 0, 0, 0); k.disc("dark", 0.0055, 0, 0, -0.5285) }
  b.ironY = 0.046; b.ironZ = -0.075; b.irons = "hide"
  b.mark("front", "body", 0, 0.046, -0.446); b.mark("rear", "ironRear", 0, 0.046, -0.075)
  // plum bakelite grip and magazine, wooden stock
  triggerGuard(k, "steel", -0.026, 0.026, -0.03, 0.024, 0.01)
  const g = pistolGrip(k, "plum", 0.045, -0.03, 0.34, 0.1, 0.034, 0.028)
  k.box("steel", 0.012, 0.016, 0.006, 0, -0.04, -0.022, 0, 0, 0, 0.001)
  k.side("wood", "M .16 .014 L .44 -.012 Q .45 -.012 .45 -.022 L .45 -.118 Q .45 -.126 .44 -.126 L .4 -.124 Q .26 -.07 .18 -.034 L .16 -.03 Z", 0.04, 0, 0.004)
  k.side("steel", "M .45 -.01 L .456 -.01 L .456 -.128 L .45 -.128 Z", 0.042, 0, 0.0015)
  const ch = b.part("charger")
  ch.box("steel", 0.024, 0.006, 0.008, 0.028, 0.006, 0.06, 0, 0, 0, 0.001); ch.sphere("steel", 0.0068, 0.042, 0.006, 0.06, 1, 1, 1, 10)
  const m = b.part("mag", "body", [0, -0.03, -0.058], { local: true })
  const ext = !!b.has("mag")
  boxMag(m, "plum", 0.024, 0.06, 0.05, ext ? 0.27 : 0.2, 0.18, ext ? 0.95 : 0.78, "762")
  b.magRest.set(0, -0.03, -0.058); b.magAxis.set(0, -Math.cos(0.18), -Math.sin(0.18))
  b.anchor("magHold", "mag", [0, -0.1, -0.03], gripFrame(-0.45), { rx: 0.012, rz: 0.028, thumb: "wrap" }, true)
  b.setEject(0.02, 0.014, 0.02); b.setMuzzle(dev ? -0.47 : -0.528)
  b.anchor("grip", "body", g, gripFrame(0.34), holdGrip(0.0145, 0.017))
  b.anchor("support", "body", [0, -0.012, -0.255], underFrame(), { rx: 0.03, rz: 0.026, thumb: "along" })
  b.anchor("charge", "charger", [0.045, 0.006, 0.06], underFrame(0.9), { rx: 0.008, rz: 0.012, thumb: "wrap" })
  if (b.has("optic")) rail(k, 0.0, 0.13, 0, 0.031)
  b.mount = { optic: { z: 0.065, y: 0.0395 }, muzzle: { z: -0.47, r: 0.009 }, grip: { z: -0.27, y: -0.044, rail: true }, tac: { z: -0.3, y: -0.012, x: 0.023, rail: true } }
  b.spec = { cls: "rifle", action: "auto", casing: "762", kick: 1.25, flash: 1.15, charge: "right", reciprocating: 0.09, hip: [0.105, -0.075, -0.33, 0.02, 0.05, -0.02], eyeIron: 0.28 }
}

function buildBr10(b: Build): void {
  const k = b.body
  // long FDE upper with continuous top rail, polymer lower, side and bottom rails at the front
  k.side("tan", "M -.365 .03 L .13 .03 L .13 -.02 L -.04 -.02 L -.06 -.024 L -.365 -.024 Z", 0.044, 0, 0.003)
  rail(k, -0.36, 0.125, 0, 0.03, "tan", "up", 0.022)
  for (const sx of [-1, 1]) rail(k, -0.34, -0.25, sx * 0.022, 0.004, "alu", sx > 0 ? "right" : "left")
  rail(k, -0.345, -0.24, 0, -0.024, "alu", "down")
  k.box("steelDark", 0.002, 0.014, 0.042, 0.0222, 0.008, 0.0, 0, 0, 0, 0)
  k.box("steelDark", 0.002, 0.006, 0.15, -0.0222, 0.012, -0.17, 0, 0, 0, 0)
  k.side("tan", "M -.07 -.02 L .135 -.02 L .135 -.045 Q .12 -.05 .1 -.05 L -.02 -.05 L -.024 -.066 L -.066 -.066 L -.072 -.045 Z", 0.04, 0, 0.003)
  triggerGuard(k, "tan", -0.018, 0.036, -0.05, 0.024, 0.012)
  const g = pistolGrip(k, "tan", 0.062, -0.048, 0.32, 0.1, 0.036, 0.028)
  const dev = b.has("muzzle")
  barrel(k, -0.365, -0.53, 0.0098)
  k.box("steel", 0.024, 0.026, 0.022, 0, 0.004, -0.378, 0, 0, 0, 0.003)
  if (!dev) birdcage(k, -0.53, 0.0122, 0.046)
  // folding stock with cheek riser
  k.box("polymer", 0.03, 0.04, 0.014, 0, 0.004, 0.136, 0, 0, 0, 0.003)
  k.side("tan", "M .14 .02 L .17 .03 L .32 .038 L .405 .042 Q .42 .042 .42 .028 L .42 -.088 Q .42 -.096 .41 -.096 L .385 -.094 L .3 -.03 L .2 -.024 L .14 -.018 Z", 0.036, 0, 0.004)
  buttPad(k, 0.42, 0.04, -0.094, 0.036)
  const ch = b.part("charger")
  ch.box("alu", 0.02, 0.008, 0.01, -0.03, 0.012, -0.13, 0, 0, 0, 0.002); ch.box("alu", 0.01, 0.014, 0.014, -0.042, 0.012, -0.13, 0, 0, 0, 0.003)
  const fs = b.part("ironFront", "body", [0, 0.0385, -0.345])
  fs.box("polymer", 0.024, 0.009, 0.026, 0, 0.043, -0.345, 0, 0, 0, 0.002)
  for (const sx of [-1, 1]) fs.box("polymer", 0.004, 0.034, 0.012, sx * 0.0085, 0.064, -0.345, 0, 0, 0, 0.001)
  fs.box("steel", 0.003, 0.03, 0.003, 0, 0.06, -0.345, 0, 0, 0, 0)
  const rs = b.part("ironRear", "body", [0, 0.0385, 0.108])
  rs.box("polymer", 0.024, 0.009, 0.024, 0, 0.043, 0.108, 0, 0, 0, 0.002); rs.box("polymer", 0.012, 0.024, 0.006, 0, 0.056, 0.108, 0, 0, 0, 0.001)
  rs.ring("polymer", 0.0082, 0.0022, 0, 0.075, 0.108, 24)
  for (const sx of [-1, 1]) rs.box("polymer", 0.004, 0.03, 0.008, sx * 0.0135, 0.068, 0.108, 0, 0, 0, 0.0012)
  b.ironY = 0.075; b.ironZ = 0.108; b.irons = "fold"
  b.mark("front", "ironFront", 0, 0.075, -0.345); b.mark("rear", "ironRear", 0, 0.075, 0.108)
  const m = b.part("mag", "body", [0, -0.046, -0.044], { local: true })
  const ext = !!b.has("mag")
  boxMag(m, "polymer", 0.026, 0.064, 0.062, ext ? 0.21 : 0.14, 0.04, ext ? 0.2 : 0.14, "762")
  b.magRest.set(0, -0.046, -0.044); b.magAxis.set(0, -Math.cos(0.04), -Math.sin(0.04))
  b.anchor("magHold", "mag", [0, -0.085, -0.004], gripFrame(-0.1), { rx: 0.013, rz: 0.032, thumb: "wrap" }, true)
  b.setEject(0.024, 0.012, 0.0); b.setMuzzle(dev ? -0.53 : -0.576)
  b.anchor("grip", "body", g, gripFrame(0.32), holdGrip(0.0145, 0.018))
  b.anchor("support", "body", [0, 0.0, -0.29], underFrame(), { rx: 0.032, rz: 0.028, thumb: "along" })
  b.anchor("charge", "charger", [-0.044, 0.012, -0.13], underFrame(-0.9), { rx: 0.007, rz: 0.01, thumb: "wrap" })
  b.mount = { optic: { z: -0.02, y: 0.0385 }, muzzle: { z: -0.53, r: 0.0098 }, grip: { z: -0.3, y: -0.0325 }, tac: { z: -0.3, y: 0.004, x: 0.0305 } }
  b.spec = { cls: "battle", action: "auto", casing: "762", kick: 1.45, flash: 1.2, charge: "left", reciprocating: 0.1, hip: [0.105, -0.09, -0.3, 0.02, 0.05, -0.02], eyeIron: 0.15 }
}

function buildKv12(b: Build): void {
  const k = b.body
  // receiver with ejection and loading ports, long barrel with a bead, magazine tube
  k.side("steel", "M -.075 .01 Q -.075 .016 -.068 .016 L .1 .012 Q .118 .01 .12 .0 L .12 -.04 L -.075 -.044 Z", 0.036, 0, 0.003)
  k.box("steelDark", 0.002, 0.024, 0.05, 0.0182, -0.004, -0.03, 0, 0, 0, 0)
  k.box("steelDark", 0.026, 0.002, 0.07, 0, -0.0432, 0.01, 0, 0, 0, 0)
  k.box("steelDark", 0.006, 0.002, 0.08, 0, 0.0135, 0.04, 0, 0, 0, 0)
  barrel(k, -0.075, -0.56, 0.0105)
  k.sphere("glowOrange", 0.0026, 0, 0.0129, -0.548, 1, 1, 1, 10)
  b.ironY = 0.0155; b.ironZ = 0.1; b.irons = "none"
  b.mark("front", "body", 0, 0.0155, -0.548); b.mark("rear", "body", 0, 0.0155, 0.1)
  k.cyl("steel", 0.0115, 0.39, 0, -0.026, -0.27, 14); k.cyl("steel", 0.0128, 0.03, 0, -0.026, -0.48, 14)
  k.box("steel", 0.016, 0.05, 0.012, 0, -0.013, -0.455, 0, 0, 0, 0.003)
  // trigger group, straight-wrist wooden stock
  k.side("steel", "M .0 -.042 L .1 -.04 L .1 -.05 L .0 -.052 Z", 0.03, 0, 0.001)
  triggerGuard(k, "steel", 0.004, 0.06, -0.05, 0.024, 0.01)
  k.side("wood", "M .12 .012 L .2 .004 L .47 -.016 Q .48 -.016 .48 -.026 L .48 -.135 Q .48 -.142 .47 -.142 L .44 -.14 Q .3 -.094 .21 -.07 Q .16 -.062 .14 -.054 L .12 -.042 Z", 0.042, 0, 0.004)
  buttPad(k, 0.48, -0.014, -0.14, 0.042)
  // corncob pump with action bars
  const pu = b.part("pump")
  const pts: number[] = [0.0175, -0.12, 0.022, -0.125]
  for (let i = 0; i < 12; i++) { const z = -0.135 - i * 0.017; pts.push(0.0235, z, 0.0235, z - 0.009, 0.0212, z - 0.012, 0.0212, z - 0.017) }
  pts.push(0.022, -0.34, 0.0175, -0.345)
  pu.lathe("wood", pts, 0, -0.026, 0, 20)
  for (const sx of [-1, 1]) pu.box("steel", 0.003, 0.006, 0.12, sx * 0.0135, -0.02, -0.075, 0, 0, 0, 0)
  b.setEject(0.02, -0.004, -0.03); b.setMuzzle(-0.56)
  b.anchor("grip", "body", [0, -0.032, 0.168], gripFrame(1.0), holdGrip(0.018, 0.02))
  b.anchor("support", "pump", [0, -0.026, -0.235], underFrame(), { rx: 0.0235, rz: 0.0235, thumb: "along" })
  b.anchor("load", "body", [0, -0.054, 0.012], underFrame(), { rx: 0.0105, rz: 0.0105, thumb: "wrap" })
  b.loadDir.set(0, 1, 0.25).normalize()
  if (b.has("optic")) rail(k, -0.05, 0.09, 0, 0.0135)
  b.mount = { optic: { z: 0.02, y: 0.022 }, muzzle: { z: -0.56, r: 0.0105 }, tac: { z: -0.42, y: -0.013, x: 0.016, rail: true } }
  b.spec = { cls: "shotgun", action: "pump", casing: "shell", kick: 1.9, flash: 1.6, charge: "none", hip: [0.11, -0.07, -0.33, 0.02, 0.05, -0.03], eyeIron: 0.17 }
}

function buildSg8(b: Build): void {
  const k = b.body
  k.side("alu", "M -.08 .024 L .13 .024 L .13 -.03 L .1 -.04 L -.08 -.04 Z", 0.04, 0, 0.003)
  rail(k, -0.07, 0.125, 0, 0.024)
  k.box("steelDark", 0.002, 0.022, 0.06, 0.0202, -0.008, -0.02, 0, 0, 0, 0)
  k.box("steelDark", 0.026, 0.002, 0.07, 0, -0.0402, 0.0, 0, 0, 0, 0)
  const dev = b.has("muzzle")
  barrel(k, -0.08, -0.48, 0.011)
  // front blade with protective wings, ghost-ring rear
  k.box("steel", 0.018, 0.012, 0.03, 0, 0.014, -0.455, 0, 0, 0, 0.002)
  for (const sx of [-1, 1]) k.side("steel", "M -.468 .018 L -.468 .056 Q -.462 .06 -.456 .056 L -.444 .018 Z", 0.0035, sx * 0.009, 0.0005)
  k.box("steel", 0.003, 0.032, 0.008, 0, 0.036, -0.456, 0, 0, 0, 0); k.sphere("glowRed", 0.0016, 0, 0.0505, -0.4515, 1, 1, 0.5, 8)
  const rs = b.part("ironRear", "body", [0, 0.0325, 0.105])
  rs.box("alu", 0.026, 0.008, 0.024, 0, 0.0365, 0.105, 0, 0, 0, 0.002)
  for (const sx of [-1, 1]) rs.box("alu", 0.004, 0.028, 0.016, sx * 0.013, 0.053, 0.105, 0, 0, 0, 0.0012)
  rs.box("alu", 0.006, 0.008, 0.006, 0, 0.043, 0.105, 0, 0, 0, 0.001); rs.ring("steel", 0.0072, 0.002, 0, 0.0525, 0.105, 22)
  b.ironY = 0.0525; b.ironZ = 0.105; b.irons = "hide"
  b.mark("front", "body", 0, 0.0525, -0.456); b.mark("rear", "ironRear", 0, 0.0525, 0.105)
  k.cyl("steel", 0.0118, 0.32, 0, -0.028, -0.24, 14); k.cyl("steel", 0.0128, 0.02, 0, -0.028, -0.41, 14)
  if (b.has("mag")) { k.cyl("steel", 0.0118, 0.07, 0, -0.028, -0.455, 14); k.cyl("steel", 0.013, 0.012, 0, -0.028, -0.495, 14); k.box("steel", 0.016, 0.05, 0.012, 0, -0.014, -0.465, 0, 0, 0, 0.003) }
  k.side("polymer", "M -.1 .004 L -.3 .002 Q -.31 0 -.31 -.01 L -.306 -.04 Q -.3 -.049 -.29 -.049 L -.11 -.051 Q -.1 -.051 -.1 -.04 Z", 0.05, 0, 0.004)
  for (const zz of [-0.14, -0.17, -0.2, -0.23, -0.26]) for (const sx of [-1, 1]) k.box("steelDark", 0.002, 0.024, 0.005, sx * 0.0252, -0.022, zz, 0, 0, 0, 0)
  k.side("polymer", "M -.04 -.04 L .1 -.04 L .1 -.05 L -.04 -.05 Z", 0.034, 0, 0.001)
  triggerGuard(k, "polymer", -0.03, 0.03, -0.05, 0.024, 0.012)
  const g = pistolGrip(k, "polymer", 0.07, -0.046, 0.3, 0.1, 0.036, 0.028)
  k.cyl("alu", 0.0145, 0.17, 0, -0.004, 0.21, 16)
  k.side("polymer", "M .2 .02 L .34 .024 Q .35 .024 .35 .014 L .35 -.075 Q .35 -.086 .338 -.086 L .305 -.078 L .24 -.03 L .2 -.026 Z", 0.044, 0, 0.004)
  buttPad(k, 0.35, 0.022, -0.084, 0.044)
  const ch = b.part("charger")
  ch.peg("steel", 0.0055, 0.016, 0.027, -0.008, -0.03, "x"); ch.sphere("steel", 0.006, 0.036, -0.008, -0.03, 1, 1, 1, 10)
  b.setEject(0.022, -0.006, -0.02); b.setMuzzle(-0.48)
  b.anchor("grip", "body", g, gripFrame(0.3), holdGrip(0.0145, 0.018))
  b.anchor("support", "body", [0, -0.022, -0.215], underFrame(), { rx: 0.03, rz: 0.026, thumb: "along" })
  b.anchor("load", "body", [0, -0.05, 0.0], underFrame(), { rx: 0.0105, rz: 0.0105, thumb: "wrap" })
  b.loadDir.set(0, 1, 0.25).normalize()
  b.mount = { optic: { z: 0.03, y: 0.0325 }, muzzle: { z: -0.48, r: 0.011 }, grip: { z: -0.22, y: -0.051, rail: true }, tac: { z: -0.26, y: -0.01, x: 0.025, rail: true } }
  b.spec = { cls: "shotgun", action: "semi", casing: "shell", kick: 1.6, flash: 1.5, charge: "none", reciprocating: 0.05, hip: [0.105, -0.085, -0.3, 0.02, 0.05, -0.02], eyeIron: 0.15 }
}

/** Fixed riflescope on rings (DMR / sniper): hollow tube, turrets, coated objective, eyepiece reticle. */
function riflescope(b: Build, k: Kit, railY: number, zEye: number, zObj: number, tubeR: number, objR: number, rings: number[]): void {
  const cy = railY + tubeR + 0.022, eyeR = tubeR + 0.0055
  k.lathe("steel", [eyeR - 0.003, zEye, eyeR, zEye, eyeR + 0.0005, zEye - 0.008, eyeR, zEye - 0.045, tubeR, zEye - 0.065, tubeR, zObj + 0.09, objR, zObj + 0.03, objR + 0.0008, zObj + 0.02, objR + 0.0008, zObj, objR - 0.003, zObj - 0.001, objR - 0.003, zObj + 0.004, tubeR - 0.002, zObj + 0.06, tubeR - 0.002, zEye - 0.004, eyeR - 0.003, zEye], 0, cy, 0, 28)
  for (let i = 0; i < 5; i++) k.cyl("steelDark", eyeR + 0.0008, 0.002, 0, cy, zEye - 0.018 - i * 0.004, 26)
  const tz = (zEye + zObj) / 2 + 0.02
  k.peg("steel", tubeR * 0.85, 0.02, 0, cy + tubeR + 0.008, tz, "y", 18); k.peg("steelDark", tubeR * 0.9, 0.005, 0, cy + tubeR + 0.016, tz, "y", 18)
  k.peg("steel", tubeR * 0.85, 0.02, tubeR + 0.008, cy, tz, "x", 18); k.peg("steel", tubeR * 0.6, 0.012, -tubeR - 0.005, cy, tz, "x", 14)
  k.box("steel", tubeR * 1.6, 0.016, 0.03, 0, cy, tz, 0, 0, 0, 0.004)
  for (const rz of rings) {
    k.lathe("alu", [tubeR - 0.0005, rz + 0.008, tubeR + 0.004, rz + 0.008, tubeR + 0.004, rz - 0.008, tubeR - 0.0005, rz - 0.008], 0, cy, 0, 22)
    k.box("alu", 0.018, cy - railY - tubeR + 0.002, 0.016, 0, railY + (cy - railY - tubeR) / 2, rz, 0, 0, 0, 0.002)
    k.peg("steel", 0.003, 0.03, 0, railY + 0.004, rz, "x")
  }
  k.disc("lens", objR - 0.003, 0, cy, zObj - 0.0005)
  k.disc("glass", eyeR - 0.003, 0, cy, zEye - 0.001, false)
  const ret = new THREE.Group(); b.parts.body.add(ret); b.reticle = ret
  reticleScope(ret, 0, cy, zEye - 0.002)
  b.mark("reticle", "body", 0, cy, zEye - 0.002); b.mark("objective", "body", 0, cy, zObj)
  b.ironY = cy; b.ironZ = zEye; b.irons = "none"
}

function buildDr7(b: Build): void {
  const k = b.body
  k.side("alu", "M -.12 .027 L .125 .027 L .125 -.004 L .11 -.014 L -.12 -.014 Z", 0.038, 0, 0.0025)
  rail(k, -0.118, 0.122, 0, 0.027)
  k.box("steelDark", 0.003, 0.016, 0.055, 0.0191, 0.008, 0.012, 0, 0, 0, 0)
  k.cyl("alu", 0.0065, 0.03, 0.018, 0.011, 0.076, 10, 0.0065, 0, 0.35)
  k.side("alu", "M -.092 -.014 L .122 -.014 L .122 -.032 Q .1 -.045 .07 -.045 L -.026 -.045 L -.032 -.064 L -.09 -.064 L -.094 -.044 Z", 0.036, 0, 0.0025)
  triggerGuard(k, "alu", -0.026, 0.032, -0.045, 0.024, 0.012)
  const g = pistolGrip(k, "od", 0.052, -0.038, 0.34, 0.105, 0.036, 0.028)
  k.box("od", 0.052, 0.06, 0.36, 0, -0.002, -0.302, 0, 0, 0, 0.012)
  rail(k, -0.478, -0.125, 0, 0.027)
  for (const zz of [-0.18, -0.24, -0.3, -0.36, -0.42]) for (const sx of [-1, 1]) k.box("steelDark", 0.002, 0.009, 0.036, sx * 0.0262, -0.004, zz, 0, 0, 0, 0)
  const dev = b.has("muzzle")
  barrel(k, -0.48, -0.67, 0.0105)
  if (!dev) birdcage(k, -0.67, 0.0125, 0.048)
  k.cyl("alu", 0.0155, 0.2, 0, 0.0, 0.225, 16)
  k.side("od", "M .2 .03 L .24 .052 L .36 .052 L .4 .032 L .42 .032 Q .432 .032 .432 .02 L .432 -.095 Q .432 -.104 .422 -.104 L .4 -.1 L .37 -.078 L .36 -.096 L .33 -.096 L .3 -.04 L .2 -.026 Z", 0.042, 0, 0.004)
  buttPad(k, 0.432, 0.03, -0.102, 0.042)
  const ch = b.part("charger")
  ch.box("alu", 0.012, 0.006, 0.05, 0, 0.022, 0.1, 0, 0, 0, 0.0015); ch.box("alu", 0.036, 0.007, 0.012, 0, 0.022, 0.124, 0, 0, 0, 0.002)
  riflescope(b, k, 0.0355, 0.13, -0.19, 0.0128, 0.0225, [0.045, -0.07])
  const m = b.part("mag", "body", [0, -0.04, -0.061], { local: true })
  const ext = !!b.has("mag")
  boxMag(m, "polymer", 0.027, 0.066, 0.064, ext ? 0.155 : 0.1, 0.05, 0.12, "762")
  b.magRest.set(0, -0.04, -0.061); b.magAxis.set(0, -Math.cos(0.05), -Math.sin(0.05))
  b.anchor("magHold", "mag", [0, -0.07, -0.004], gripFrame(-0.1), { rx: 0.0135, rz: 0.033, thumb: "wrap" }, true)
  b.setEject(0.021, 0.008, 0.012); b.setMuzzle(dev ? -0.67 : -0.718)
  b.anchor("grip", "body", g, gripFrame(0.34), holdGrip(0.0145, 0.018))
  b.anchor("support", "body", [0, -0.004, -0.34], underFrame(), { rx: 0.031, rz: 0.027, thumb: "along" })
  b.anchor("charge", "charger", [0, 0.026, 0.124], overFrame(), { rx: 0.008, rz: 0.018, thumb: "wrap", open: true })
  b.mount = { muzzle: { z: -0.67, r: 0.0105 }, grip: { z: -0.36, y: -0.032, rail: true }, tac: { z: -0.42, y: -0.004, x: 0.026, rail: true } }
  b.spec = { cls: "dmr", action: "semi", casing: "762", kick: 1.6, flash: 1.2, charge: "rear", hip: [0.105, -0.095, -0.3, 0.02, 0.05, -0.02], eyeIron: 0.085 }
}

function buildFalke(b: Build): void {
  const k = b.body
  // round steel action with rail, OD chassis, long fore-end, fluted heavy barrel, big brake
  k.cyl("steel", 0.0175, 0.25, 0, 0, -0.005, 20)
  k.box("steelDark", 0.003, 0.016, 0.062, 0.0164, 0.004, 0.005, 0, 0, 0, 0)
  rail(k, -0.125, 0.11, 0, 0.0165)
  k.side("od", "M -.13 -.008 L .12 -.008 L .125 -.03 L .125 -.07 L .072 -.07 L .066 -.052 L -.03 -.052 L -.04 -.07 L -.1 -.07 L -.13 -.06 Z", 0.052, 0, 0.004)
  k.box("od", 0.056, 0.058, 0.37, 0, -0.035, -0.32, 0, 0, 0, 0.012)
  for (const zz of [-0.2, -0.26, -0.32, -0.38, -0.44]) for (const sx of [-1, 1]) k.box("steelDark", 0.002, 0.01, 0.036, sx * 0.0282, -0.035, zz, 0, 0, 0, 0)
  const dev = b.has("muzzle")
  barrel(k, -0.13, -0.76, 0.0128)
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; k.box("steelDark", 0.0035, 0.0035, 0.2, Math.cos(a) * 0.0122, Math.sin(a) * 0.0122, -0.64, 0, 0, a, 0) }
  if (!dev) {
    k.side("steel", "M -.758 .017 L -.86 .017 Q -.866 .017 -.866 .01 L -.866 -.01 Q -.866 -.017 -.86 -.017 L -.758 -.017 Z", 0.038, 0, 0.003)
    for (const zz of [-0.78, -0.805, -0.83]) k.box("dark", 0.04, 0.022, 0.012, 0, 0, zz, 0, 0, 0, 0)
    k.disc("dark", 0.007, 0, 0, -0.8668)
  }
  // trigger guard, near-vertical grip, magazine, skeleton stock with cheek piece and monopod
  triggerGuard(k, "steel", -0.024, 0.05, -0.052, 0.026, 0.012)
  const g = pistolGrip(k, "polymer", 0.088, -0.062, 0.2, 0.1, 0.04, 0.03)
  k.side("od", "M .125 -.01 L .2 -.008 L .2 .036 L .36 .04 L .38 .022 L .55 .022 Q .566 .022 .566 .006 L .566 -.122 Q .566 -.132 .556 -.132 L .52 -.132 L .45 -.09 L .44 -.132 L .41 -.132 L .4 -.08 L .2 -.07 L .125 -.07 Z", 0.042, 0, 0.004,
    ["M .215 -.024 L .49 -.014 L .49 -.04 L .42 -.07 L .215 -.056 Z"])
  buttPad(k, 0.566, 0.02, -0.13, 0.044)
  k.peg("steel", 0.006, 0.05, 0, -0.152, 0.43, "y"); k.box("rubber", 0.018, 0.008, 0.018, 0, -0.178, 0.43, 0, 0, 0, 0.003)
  // folded bipod under the fore-end
  k.box("steel", 0.03, 0.012, 0.022, 0, -0.07, -0.465, 0, 0, 0, 0.003)
  for (const sx of [-1, 1]) { k.cyl("alu", 0.0055, 0.2, sx * 0.0115, -0.076, -0.57, 10); k.box("rubber", 0.012, 0.01, 0.016, sx * 0.0115, -0.078, -0.674, 0, 0, 0, 0.003) }
  // bolt (rotates up and slides back)
  const bo = b.part("bolt", "body", [0, 0, 0])
  bo.cyl("steelLight", 0.0122, 0.16, 0, 0, 0.035, 18); bo.cyl("steel", 0.0152, 0.032, 0, 0, 0.135, 18)
  bo.box("steel", 0.052, 0.008, 0.008, 0.032, -0.012, 0.098, 0, 0, -0.38, 0.002)
  bo.sphere("polymer", 0.0115, 0.062, -0.025, 0.098, 1, 1, 1, 14)
  // magazine (steel, 5 rounds)
  const m = b.part("mag", "body", [0, -0.05, -0.062], { local: true })
  boxMag(m, "steel", 0.03, 0.08, 0.078, 0.055, 0.02, 0.02, "338", false)
  b.magRest.set(0, -0.05, -0.062)
  riflescope(b, k, 0.025, 0.175, -0.275, 0.017, 0.035, [0.05, -0.1])
  b.setEject(0.02, 0.006, 0.01); b.setMuzzle(dev ? -0.76 : -0.866)
  b.anchor("grip", "body", g, gripFrame(0.2), holdGrip(0.016, 0.02))
  b.anchor("support", "body", [0, -0.035, -0.34], underFrame(), { rx: 0.029, rz: 0.028, thumb: "along" })
  b.anchor("boltKnob", "bolt", [0.062, -0.022, 0.098], frame([0, 1, 0], [-1, 0, 0]), { rx: 0.0115, rz: 0.0115, thumb: "wrap" })
  b.anchor("load", "body", [0, 0.034, 0.012], overFrame(), { rx: 0.0075, rz: 0.0075, thumb: "wrap" })
  b.loadDir.set(0, -1, 0)
  b.mount = { muzzle: { z: -0.76, r: 0.0128 }, tac: { z: -0.42, y: -0.035, x: 0.028, rail: true } }
  b.spec = { cls: "sniper", action: "bolt", casing: "338", kick: 2.2, flash: 1.8, charge: "none", hip: [0.11, -0.1, -0.31, 0.02, 0.05, -0.02], eyeIron: 0.09 }
}

function buildLm60(b: Build): void {
  const k = b.body
  // boxy receiver, hinged feed cover (with rail), heavy barrel, gas cylinder, ribbed handguard, folded bipod
  k.side("steel", "M -.06 .032 L .24 .032 L .24 -.03 L .2 -.058 L -.06 -.058 Z", 0.056, 0, 0.003)
  for (const zz of [0.0, 0.06, 0.12, 0.18]) { k.peg("steelLight", 0.0025, 0.058, 0, 0.016, zz, "x", 8); k.peg("steelLight", 0.0025, 0.058, 0, -0.04, zz, "x", 8) }
  k.box("steelDark", 0.004, 0.012, 0.15, 0.0282, -0.02, 0.0, 0, 0, 0, 0)
  const cv = b.part("cover", "body", [0, 0.032, 0.13])
  cv.side("steel", "M -.065 .032 L .13 .032 L .13 .054 Q .12 .06 .1 .06 L -.05 .06 Q -.065 .058 -.065 .05 Z", 0.05, 0, 0.003)
  rail(cv, -0.05, 0.112, 0, 0.06)
  cv.box("steel", 0.02, 0.01, 0.012, 0, 0.058, 0.124, 0, 0, 0, 0.002)
  const rs = b.part("ironRear", "body", [0, 0.032, 0.175])
  rs.box("steel", 0.03, 0.01, 0.03, 0, 0.037, 0.175, 0, 0, 0, 0.002); rs.box("steel", 0.008, 0.032, 0.006, 0, 0.058, 0.175, 0, 0, 0, 0.001)
  rs.ring("steel", 0.0068, 0.002, 0, 0.08, 0.175, 22)
  for (const sx of [-1, 1]) rs.box("steel", 0.004, 0.04, 0.01, sx * 0.014, 0.062, 0.175, 0, 0, 0, 0.001)
  barrel(k, -0.06, -0.6, 0.0125)
  k.cyl("steel", 0.009, 0.42, 0, -0.032, -0.29, 12)
  k.side("polymer", "M -.07 .02 L -.3 .018 L -.3 -.05 Q -.29 -.058 -.28 -.058 L -.08 -.058 Q -.07 -.058 -.07 -.05 Z", 0.052, 0, 0.004)
  for (const zz of [-0.1, -0.13, -0.16, -0.19, -0.22, -0.25, -0.28]) k.box("steelDark", 0.053, 0.03, 0.006, 0, -0.02, zz, 0, 0, 0, 0)
  k.box("steel", 0.006, 0.012, 0.1, -0.03, 0.022, -0.2, 0, 0, 0, 0.002)
  for (const zz of [-0.155, -0.245]) k.box("steel", 0.022, 0.006, 0.006, -0.02, 0.02, zz, 0, 0, 0, 0.001)
  k.box("steel", 0.016, 0.03, 0.018, 0, 0.022, -0.58, 0, 0, 0, 0.002)
  for (const sx of [-1, 1]) k.box("steel", 0.003, 0.05, 0.012, sx * 0.009, 0.06, -0.58, 0, 0, 0, 0.0008)
  k.box("steel", 0.003, 0.046, 0.003, 0, 0.057, -0.58, 0, 0, 0, 0)
  b.ironY = 0.08; b.ironZ = 0.175; b.irons = "hide"
  b.mark("front", "body", 0, 0.08, -0.58); b.mark("rear", "ironRear", 0, 0.08, 0.175)
  const dev = b.has("muzzle")
  if (!dev) { k.lathe("steel", [0.0128, -0.6, 0.0128, -0.61, 0.019, -0.662, 0.016, -0.664, 0.0105, -0.612], 0, 0, 0, 16) }
  k.box("steel", 0.032, 0.014, 0.024, 0, -0.045, -0.48, 0, 0, 0, 0.003)
  for (const sx of [-1, 1]) { k.cyl("alu", 0.006, 0.2, sx * 0.014, -0.05, -0.38, 10); k.box("rubber", 0.012, 0.012, 0.016, sx * 0.014, -0.052, -0.276, 0, 0, 0, 0.003) }
  triggerGuard(k, "steel", 0.06, 0.112, -0.058, 0.026, 0.012)
  const g = pistolGrip(k, "polymer", 0.13, -0.056, 0.32, 0.1, 0.036, 0.03)
  k.side("polymer", "M .24 .028 L .53 .02 Q .55 .02 .55 .005 L .55 -.11 Q .55 -.12 .54 -.12 L .5 -.115 Q .4 -.08 .3 -.06 L .24 -.055 Z", 0.045, 0, 0.004)
  buttPad(k, 0.55, 0.018, -0.118, 0.045)
  const ch = b.part("charger")
  ch.box("steel", 0.022, 0.008, 0.012, 0.039, -0.02, 0.0, 0, 0, 0, 0.002); ch.box("steel", 0.008, 0.02, 0.012, 0.05, -0.02, 0.0, 0, 0, 0, 0.002)
  // 100-round box (cloth pouch) and the belt into the feed tray
  const m = b.part("mag", "body", [-0.03, -0.06, 0.03])
  m.box("cloth", 0.08, 0.11, 0.1, -0.034, -0.118, 0.03, 0, 0, 0, 0.012)
  m.box("cloth", 0.082, 0.03, 0.102, -0.034, -0.07, 0.03, 0, 0, 0, 0.01)
  m.box("polymer", 0.03, 0.03, 0.03, -0.034, -0.058, 0.03, 0, 0, 0, 0.004)
  m.box("rubber", 0.084, 0.004, 0.012, -0.034, -0.1, 0.03, 0, 0, 0, 0.001)
  b.magRest.set(-0.03, -0.06, 0.03)
  b.part("belt", "body", [0, 0, 0])
  const n = 13, pitch = 0.0125
  const caseGeo = new THREE.LatheGeometry([0.006, 0, 0.0062, 0.002, 0.006, 0.04, 0.0042, 0.046, 0.0042, 0.051].reduce<THREE.Vector2[]>((a, v, i, arr) => (i % 2 ? a : (a.push(new THREE.Vector2(v, arr[i + 1])), a)), []), 8).rotateX(-Math.PI / 2)
  const tipGeo = new THREE.ConeGeometry(0.0041, 0.022, 8).translate(0, 0.062, 0).rotateX(-Math.PI / 2)
  const linkGeo = new THREE.BoxGeometry(0.009, 0.0035, 0.018)
  for (const g2 of [caseGeo, tipGeo, linkGeo]) paint(g2, 1, 0, 0)
  const im = [new THREE.InstancedMesh(caseGeo, b.mats.brass, n), new THREE.InstancedMesh(tipGeo, b.mats.copper, n), new THREE.InstancedMesh(linkGeo, b.mats.steel, n)]
  for (const i of im) { i.frustumCulled = false; b.parts.belt.add(i) }
  const path = [[0.004, 0.044], [-0.03, 0.044], [-0.046, 0.037], [-0.058, 0.02], [-0.064, -0.005], [-0.066, -0.032], [-0.064, -0.058]]
  const acc = [0]; for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1)
  b.belt = (phase, visible) => {
    b.parts.belt.visible = visible
    const f = phase - Math.floor(phase)
    for (let i = 0; i < n; i++) {
      const s = (i + 1 - f) * pitch
      let j = 1; while (j < acc.length - 1 && acc[j] < s) j++
      const t = Math.min(1, (s - acc[j - 1]) / (acc[j] - acc[j - 1]))
      pos.set(path[j - 1][0] + (path[j][0] - path[j - 1][0]) * t, path[j - 1][1] + (path[j][1] - path[j - 1][1]) * t, -0.008)
      const ang = Math.atan2(path[j][1] - path[j - 1][1], path[j][0] - path[j - 1][0])
      q.setFromAxisAngle(_zAxis, ang + Math.PI)
      mtx.compose(pos, q, one); im[0].setMatrixAt(i, mtx); im[1].setMatrixAt(i, mtx)
      pos.z = 0.0; mtx.compose(pos, q, one); im[2].setMatrixAt(i, mtx)
    }
    for (const x of im) x.instanceMatrix.needsUpdate = true
  }
  b.belt(0, true)
  b.setEject(0.0, -0.06, 0.04); b.setMuzzle(dev ? -0.6 : -0.664)
  b.anchor("grip", "body", g, gripFrame(0.32), holdGrip(0.015, 0.018))
  b.anchor("support", "body", [0, -0.024, -0.2], underFrame(), { rx: 0.036, rz: 0.027, thumb: "along" })
  b.anchor("magHold", "mag", [-0.074, -0.12, 0.03], gripFrame(0), { rx: 0.04, rz: 0.05, thumb: "wrap" })
  b.anchor("cover", "cover", [0, 0.062, -0.04], overFrame(), { rx: 0.012, rz: 0.026, open: true })
  b.anchor("beltHold", "body", [-0.04, 0.046, 0.0], overFrame(), { rx: 0.008, rz: 0.02, thumb: "wrap" })
  b.anchor("charge", "charger", [0.052, -0.02, 0.0], underFrame(0.9), { rx: 0.008, rz: 0.012, thumb: "wrap" })
  b.mount = { optic: { z: 0.03, y: 0.0685, part: "cover" }, muzzle: { z: -0.6, r: 0.0125 }, grip: { z: -0.2, y: -0.058, rail: true }, tac: { z: -0.25, y: -0.02, x: 0.026, rail: true } }
  b.spec = { cls: "lmg", action: "belt", casing: "762", kick: 1.1, flash: 1.25, charge: "right", hip: [0.11, -0.1, -0.33, 0.02, 0.05, -0.02], eyeIron: 0.17 }
}
const _zAxis = new THREE.Vector3(0, 0, 1)


// ───────────────────────────── melee ─────────────────────────────

const MELEE_SPEC: RigSpec = { cls: "melee", action: "melee", casing: "none", kick: 0, flash: 0, charge: "none", hip: [0, 0, 0, 0, 0, 0], eyeIron: 0.3 }
/** Hammer grip around a handle along Z (blade towards -Z, edge down): palm on the right, fingers under the edge side. */
const bladeGrip = () => frame([1, 0, 0], [0, 0, -1])
const scale = (x: number, y: number, z: number) => new THREE.Matrix4().makeScale(x, y, z)

function buildKnife(b: Build): void {
  const k = b.body
  k.side("blade", "M -.004 .0105 L -.128 .0105 Q -.152 .0105 -.181 -.004 L -.177 -.0075 Q -.15 -.0185 -.118 -.0188 L -.004 -.018 Z", 0.0048, 0, 0.0008)
  k.side("bladeEdge", "M -.01 -.0128 L -.118 -.0135 Q -.152 -.0128 -.178 -.0048 L -.177 -.0075 Q -.15 -.0185 -.118 -.0188 L -.01 -.018 Z", 0.0054, 0, 0.0004)
  k.side("bladeEdge", "M -.115 .0105 L -.128 .0105 Q -.152 .0105 -.181 -.004 L -.178 -.0015 Q -.152 .007 -.125 .0075 Z", 0.0053, 0, 0.0004)
  k.box("steel", 0.012, 0.046, 0.006, 0, -0.003, -0.001, 0, 0, 0, 0.002)
  k.at(scale(0.78, 1, 1), () => k.lathe("rubber", [0.012, 0.002, 0.0135, 0.004, 0.0128, 0.02, 0.0138, 0.03, 0.0128, 0.045, 0.014, 0.06, 0.0128, 0.075, 0.0138, 0.09, 0.0132, 0.104, 0.011, 0.11], 0, 0, 0, 14))
  k.cyl("steel", 0.0115, 0.008, 0, 0, 0.114, 12, 0.0105); k.cyl("steelDark", 0.004, 0.012, 0, 0, 0.115, 8)
  b.anchor("grip", "body", [0, 0, 0.056], bladeGrip(), { rx: 0.0105, rz: 0.0135, wrist: [0.02, -0.035, 0.06] })
  b.anchor("tip", "body", [0, -0.004, -0.18], new THREE.Quaternion(), { rx: 0.01, rz: 0.01 })
  b.spec = MELEE_SPEC; b.irons = "none"
}

function buildMachete(b: Build): void {
  const k = b.body
  k.side("blade", "M -.004 .016 L -.36 .02 Q -.45 .024 -.488 .008 Q -.5 -.012 -.47 -.03 Q -.4 -.042 -.3 -.036 L -.004 -.024 Z", 0.0032, 0, 0.0006)
  k.side("bladeEdge", "M -.01 -.0195 L -.3 -.031 Q -.4 -.037 -.462 -.025 Q -.488 -.012 -.484 .004 L -.49 .006 Q -.5 -.012 -.47 -.03 Q -.4 -.042 -.3 -.036 L -.01 -.024 Z", 0.0037, 0, 0.0003)
  k.side("woodLight", "M .0 .016 L .13 .014 Q .142 .012 .142 .0 Q .142 -.018 .128 -.02 L .0 -.024 Z", 0.022, 0, 0.003)
  k.box("steel", 0.0035, 0.044, 0.134, 0, -0.004, 0.068, 0, 0, 0, 0.0005)
  for (const z of [0.03, 0.08]) k.peg("brass", 0.0035, 0.024, 0, -0.004, z, "x")
  k.peg("steelDark", 0.0032, 0.024, 0, -0.004, 0.122, "x")
  b.anchor("grip", "body", [0, -0.004, 0.065], bladeGrip(), { rx: 0.0115, rz: 0.019, wrist: [0.022, -0.04, 0.06] })
  b.anchor("tip", "body", [0, -0.01, -0.49], new THREE.Quaternion(), { rx: 0.01, rz: 0.01 })
  b.spec = MELEE_SPEC; b.irons = "none"
}

function buildAxe(b: Build): void {
  const k = b.body
  // hickory handle (slightly waisted, swell at the end), red head with a bright bit and a pick
  k.at(scale(0.72, 1, 1), () => k.lathe("woodLight", [0.0, 0.11, 0.016, 0.11, 0.019, 0.095, 0.017, 0.06, 0.0155, 0.0, 0.0145, -0.3, 0.0155, -0.55, 0.0165, -0.7, 0.012, -0.705], 0, 0, 0, 14))
  k.side("paintRed", "M -.6 .022 L -.67 .022 L -.668 -.03 Q -.7 -.07 -.72 -.13 L -.548 -.13 Q -.57 -.07 -.602 -.03 Z", 0.012, 0, 0.0012)
  k.side("bladeEdge", "M -.555 -.112 Q -.63 -.104 -.712 -.112 L -.72 -.13 Q -.635 -.124 -.548 -.13 Z", 0.0135, 0, 0.0006)
  k.side("paintRed", "M -.6 .02 L -.67 .02 L -.66 .06 Q -.646 .1 -.634 .15 L -.63 .152 Q -.622 .09 -.61 .06 Z", 0.012, 0, 0.0012)
  k.box("paintRed", 0.026, 0.05, 0.074, 0, 0.0, -0.635, 0, 0, 0, 0.004)
  k.box("steelDark", 0.027, 0.012, 0.03, 0, 0.0, -0.635, 0, 0, 0, 0.001)
  b.anchor("grip", "body", [0, 0, 0.045], bladeGrip(), { rx: 0.0118, rz: 0.0165, wrist: [0.022, -0.04, 0.06] })
  b.anchor("tip", "body", [0, -0.13, -0.64], new THREE.Quaternion(), { rx: 0.01, rz: 0.01 })
  b.spec = MELEE_SPEC; b.irons = "none"
}

// ───────────────────────────── hand-held items ─────────────────────────────

export interface HandItem {
  group: THREE.Group
  /** Left-hand anchor (item centre). */
  anchor: THREE.Object3D
  style: "inject" | "wrap" | "eat" | "drink" | "throw"
  plunger?: THREE.Object3D
  flame?: THREE.Object3D
}

/** Item models for the item-use animation (origin = where the hand holds it, long axis = +Y). */
export function buildHandItem(id: string, look: "vm" | "world" = "vm"): HandItem {
  const group = new THREE.Group(), k = new Kit(), mats = weaponMaterials(look)
  let r = 0.02, style: HandItem["style"] = "eat", plunger: THREE.Object3D | undefined, flame: THREE.Object3D | undefined
  const up = new THREE.Matrix4().makeRotationX(-Math.PI / 2) // lathe axis Z → Y
  seed = 99
  if (id === "antiviral" || id === "medical") {
    k.at(up, () => {
      k.cyl("bottle", 0.0085, 0.075, 0, 0, 0.0, 14); k.cyl("blueLiquid", 0.0072, 0.05, 0, 0, 0.008, 12)
      k.cyl("white", 0.012, 0.004, 0, 0, 0.037, 14); k.cyl("steelLight", 0.0012, 0.03, 0, 0, -0.052, 6); k.cyl("white", 0.0035, 0.008, 0, 0, -0.04, 8)
    })
    const pk = new Kit(); pk.at(up, () => { pk.cyl("white", 0.0028, 0.04, 0, 0, 0.05, 8); pk.cyl("white", 0.009, 0.004, 0, 0, 0.07, 14) }); const pg = new THREE.Group(); pk.merge(mats, pg); group.add(pg); plunger = pg
    r = 0.009; style = "inject"
  } else if (id === "stim") {
    k.at(up, () => { k.cyl("yellow", 0.0095, 0.1, 0, 0, 0, 16); k.cyl("glowOrange", 0.0098, 0.018, 0, 0, -0.058, 16); k.cyl("polymer", 0.0102, 0.012, 0, 0, 0.05, 16); k.box("greenLabel", 0.0195, 0.03, 0.0195, 0, 0, 0.005, 0, 0, 0, 0.002) })
    r = 0.0098; style = "inject"
  } else if (id === "bandage") {
    k.cyl("cream", 0.026, 0.05, 0, 0, 0, 20); k.cyl("white", 0.008, 0.051, 0, 0, 0, 10); k.box("cream", 0.05, 0.002, 0.045, 0.02, -0.026, -0.0, 0, 0, 0.6, 0)
    group.rotation.z = Math.PI / 2; r = 0.026; style = "wrap"
  } else if (id === "medkit") {
    k.box("od", 0.11, 0.075, 0.045, 0, 0, 0, 0, 0, 0, 0.012); k.box("shellRed", 0.034, 0.034, 0.002, 0, 0.004, 0.0232, 0, 0, 0, 0)
    k.box("white", 0.022, 0.006, 0.003, 0, 0.004, 0.024, 0, 0, 0, 0); k.box("white", 0.006, 0.022, 0.003, 0, 0.004, 0.024, 0, 0, 0, 0)
    k.box("polymer", 0.112, 0.006, 0.046, 0, 0.03, 0, 0, 0, 0, 0.002)
    r = 0.022; style = "wrap"
  } else if (id === "painkiller") {
    k.at(up, () => { k.cyl("orangeClear", 0.015, 0.045, 0, 0, 0, 16); k.cyl("white", 0.0158, 0.014, 0, 0, 0.028, 16) }); k.box("white", 0.02, 0.025, 0.0305, 0, -0.002, 0, 0, 0, 0, 0)
    r = 0.015; style = "eat"
  } else if (id === "canned") {
    k.at(up, () => { k.lathe("tin", [0.0, -0.05, 0.03, -0.05, 0.0325, -0.046, 0.0325, 0.046, 0.03, 0.05, 0.0, 0.05], 0, 0, 0, 22); k.cyl("greenLabel", 0.0332, 0.06, 0, 0, 0, 22) })
    r = 0.033; style = "eat"
  } else if (id === "mre") {
    k.box("tan", 0.085, 0.13, 0.022, 0, 0, 0, 0, 0, 0, 0.006); k.box("tan", 0.087, 0.012, 0.012, 0, 0.068, 0, 0, 0, 0, 0.003)
    k.box("polymer", 0.05, 0.03, 0.002, 0, 0.01, 0.0115, 0, 0, 0, 0)
    r = 0.022; style = "eat"
  } else if (id === "water") {
    k.at(up, () => { k.lathe("bottle", [0, -0.1, 0.03, -0.1, 0.032, -0.095, 0.032, 0.04, 0.026, 0.06, 0.014, 0.075, 0.014, 0.085, 0, 0.085], 0, 0, 0, 18); k.cyl("blueLiquid", 0.012, 0.016, 0, 0, 0.092, 14); k.cyl("white", 0.0322, 0.05, 0, 0, -0.03, 18) })
    r = 0.032; style = "drink"
  } else if (id === "soda") {
    k.at(up, () => { k.lathe("tin", [0, -0.066, 0.024, -0.066, 0.0265, -0.06, 0.0265, 0.054, 0.022, 0.066, 0, 0.066], 0, 0, 0, 20); k.cyl("polymer", 0.0268, 0.09, 0, 0, -0.005, 20); k.cyl("greenLabel", 0.027, 0.012, 0, 0, 0.02, 20) })
    r = 0.0265; style = "drink"
  } else if (id === "molotov") {
    k.at(up, () => { k.lathe("glassBrown", [0, -0.1, 0.034, -0.1, 0.036, -0.094, 0.036, 0.02, 0.016, 0.06, 0.012, 0.09, 0, 0.09], 0, 0, 0, 18); k.lathe("cloth", [0.01, 0.07, 0.016, 0.075, 0.014, 0.1, 0.008, 0.125], 0, 0, 0, 10) })
    const cone = new THREE.ConeGeometry(0.014, 0.06, 10, 1, true).translate(0, 0.03, 0)
    cone.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cone.attributes.position.count * 3).fill(1), 3))
    const fl = new THREE.Mesh(cone, mats.flame); fl.name = "flame"; fl.position.y = 0.12; group.add(fl); flame = fl
    r = 0.036; style = "throw"
  } else {
    // frag grenade: body, fuse, spoon and pin ring
    k.at(up, () => { k.lathe("od", [0, -0.042, 0.018, -0.04, 0.03, -0.022, 0.031, 0.0, 0.028, 0.02, 0.016, 0.034, 0, 0.036], 0, 0, 0, 18); k.cyl("steel", 0.009, 0.018, 0, 0, 0.042, 12) })
    k.box("steel", 0.012, 0.07, 0.004, 0, 0.015, 0.033, 0.35, 0, 0, 0.001); k.ring("steelLight", 0.009, 0.0015, 0.016, 0.05, 0.0)
    r = 0.031; style = "throw"
  }
  k.merge(mats, group)
  const anchor = new THREE.Object3D(); anchor.position.set(0, id === "water" || id === "molotov" ? -0.04 : 0, 0); anchor.quaternion.copy(gripFrame(0)); anchor.userData.hold = { rx: r, rz: r, thumb: "wrap" } satisfies Hold
  group.add(anchor)
  return { group, anchor, style, plunger, flame }
}

const BUILDERS: Partial<Record<WeaponId, (b: Build) => void>> = {
  knife: buildKnife, machete: buildMachete, axe: buildAxe, p9: buildP9, r44: buildR44, vx9: buildVx9, k5: buildK5, mk4: buildMk4, sr74: buildSr74, br10: buildBr10,
  kv12: buildKv12, sg8: buildSg8, dr7: buildDr7, falke: buildFalke, lm60: buildLm60,
}

// ───────────────────────────── attachments ─────────────────────────────

function mountOptic(b: Build, att: AttachmentId): void {
  const o = b.mount.optic; if (!o) return
  const part = o.part ?? "body", pv = b.pivots[part], k = b.part("optic", part, [pv.x, pv.y, pv.z]), y = o.y, z = o.z
  const pistol = b.spec.cls === "pistol"
  const ret = new THREE.Group(); b.parts.optic.add(ret); b.reticle = ret
  if (att === "att_reddot") {
    const rise = pistol ? 0.004 : 0.021, cy = y + 0.006 + rise + 0.0145
    k.box("alu", 0.022, 0.006, 0.036, 0, y + 0.003, z, 0, 0, 0, 0.0015)
    k.box("alu", 0.017, rise + 0.002, 0.03, 0, y + 0.006 + rise / 2, z, 0, 0, 0, 0.002)
    k.peg("alu", 0.004, 0.008, 0.014, y + 0.003, z, "x")
    k.lathe("alu", [0.0116, z + 0.021, 0.0146, z + 0.021, 0.0149, z + 0.017, 0.0149, z - 0.012, 0.0158, z - 0.016, 0.0158, z - 0.024, 0.0126, z - 0.024, 0.0116, z - 0.02, 0.0116, z + 0.021], 0, cy, 0, 20)
    k.peg("alu", 0.0055, 0.008, 0, cy + 0.0175, z, "y"); k.peg("alu", 0.0055, 0.008, 0.0175, cy, z, "x")
    k.disc("glass", 0.0117, 0, cy, z - 0.019); k.disc("glass", 0.0117, 0, cy, z + 0.0195, false)
    reticleDot(ret, 0, cy, z - 0.018, 0.00085)
    b.mark("reticle", "optic", 0, cy, z - 0.018); b.mark("opticRear", "optic", 0, cy, z + 0.021)
    b.sightY = cy; b.sightZ = z + 0.021; b.eye = pistol ? 0.3 : 0.2; b.sight = "reddot"
  } else if (att === "att_holo") {
    const cy = y + 0.031
    k.box("alu", 0.03, 0.01, 0.096, 0, y + 0.005, z + 0.004, 0, 0, 0, 0.002)
    k.box("alu", 0.031, 0.017, 0.034, 0, y + 0.017, z - 0.033, 0, 0, 0, 0.004)
    k.box("alu", 0.031, 0.014, 0.022, 0, y + 0.016, z + 0.04, 0, 0, 0, 0.003)
    for (const bx of [-0.006, 0.006]) k.box("rubber", 0.007, 0.004, 0.006, bx, y + 0.024, z + 0.047, 0, 0, 0, 0.001)
    const hood = "M -.0175 -.015 L .0175 -.015 L .0175 .012 Q .0175 .0175 .012 .0175 L -.012 .0175 Q -.0175 .0175 -.0175 .012 Z", win = "M -.0135 -.0125 L .0135 -.0125 L .0135 .0135 L -.0135 .0135 Z"
    k.at(new THREE.Matrix4().makeTranslation(0, cy, 0), () => {
      k.front("alu", hood, 0.052, z - 0.004, 0.0012, [win])
      k.front("glass", win, 0.0006, z + 0.019, 0); k.front("glass", win, 0.0006, z - 0.027, 0)
    })
    reticleHolo(ret, 0, cy, z + 0.018)
    b.mark("reticle", "optic", 0, cy, z + 0.018); b.mark("opticFront", "optic", 0, cy, z - 0.027)
    b.sightY = cy; b.sightZ = z + 0.022; b.eye = 0.19; b.sight = "holo"
  } else if (att === "att_scope4x") {
    const cy = y + 0.012 + 0.0185
    k.box("alu", 0.026, 0.012, 0.072, 0, y + 0.006, z, 0, 0, 0, 0.002)
    k.peg("alu", 0.0045, 0.012, 0.016, y + 0.005, z + 0.015, "x"); k.peg("alu", 0.0045, 0.012, 0.016, y + 0.005, z - 0.02, "x")
    k.lathe("alu", [0.0145, z + 0.076, 0.0178, z + 0.076, 0.0182, z + 0.07, 0.0175, z + 0.05, 0.0168, z + 0.045, 0.0168, z - 0.035, 0.0214, z - 0.058, 0.0214, z - 0.078, 0.0186, z - 0.078, 0.0168, z - 0.06, 0.0145, z + 0.07, 0.0145, z + 0.076], 0, cy, 0, 22)
    k.box("alu", 0.012, 0.009, 0.056, 0, cy + 0.0195, z - 0.004, 0, 0, 0, 0.002)
    k.box("glowGreen", 0.004, 0.0012, 0.05, 0, cy + 0.0242, z - 0.004, 0, 0, 0, 0)
    k.peg("alu", 0.006, 0.006, 0.0185, cy, z - 0.01, "x")
    k.disc("lens", 0.0186, 0, cy, z - 0.0775); k.disc("glass", 0.0146, 0, cy, z + 0.0755, false)
    reticleScope(ret, 0, cy, z + 0.074)
    b.mark("reticle", "optic", 0, cy, z + 0.074); b.mark("objective", "optic", 0, cy, z - 0.0775)
    b.sightY = cy; b.sightZ = z + 0.076; b.eye = 0.075; b.sight = "scope"
  }
}

/** Glowing red dot (two discs facing the shooter) — opacity set by the viewmodel. */
function reticleDot(g: THREE.Group, x: number, y: number, z: number, r: number): void {
  const core = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))
  const glow = new THREE.Mesh(new THREE.CircleGeometry(r * 3.2, 16), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))
  core.position.set(x, y, z + 0.0002); glow.position.set(x, y, z); core.renderOrder = glow.renderOrder = 5; glow.userData.base = 0.35; g.add(glow, core)
  core.material.userData.perRig = glow.material.userData.perRig = true
}
/** Holographic reticle: 65-MOA-style ring with a centre dot (geometry, no textures). */
function reticleHolo(g: THREE.Group, x: number, y: number, z: number): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.0047, 0.0054, 40), mat)
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.00055, 12), mat)
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.0006, 0.0016), mat); const a = i * Math.PI / 2; t.position.set(x + Math.sin(a) * 0.0062, y + Math.cos(a) * 0.0062, z); t.rotation.z = -a; g.add(t) }
  ring.position.set(x, y, z); dot.position.set(x, y, z); g.add(ring, dot)
  for (const c of g.children) c.renderOrder = 5
  mat.userData.perRig = true
}
/** Scope eyepiece reticle (crosshair + glowing chevron) seen while bringing the scope up. */
function reticleScope(g: THREE.Group, x: number, y: number, z: number): void {
  const dark = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, depthWrite: false })
  for (const [w, h, px, py] of [[0.028, 0.0004, 0, 0], [0.0004, 0.028, 0, 0], [0.0098, 0.0012, -0.0094, 0], [0.0098, 0.0012, 0.0094, 0], [0.0012, 0.0098, 0, -0.0094]] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark); p.position.set(x + px, y + py, z); g.add(p)
  }
  const chev = new THREE.Mesh(new THREE.RingGeometry(0.0006, 0.0012, 3, 1, Math.PI / 2 - 0.9, 1.8), new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, depthWrite: false, toneMapped: false }))
  chev.position.set(x, y - 0.0012, z + 0.0001); g.add(chev)
  dark.userData.perRig = true; (chev.material as THREE.Material).userData.perRig = true
  for (const c of g.children) c.renderOrder = 5
}

function mountMuzzle(b: Build, att: AttachmentId): void {
  const mm = b.mount.muzzle; if (!mm) return
  const k = mm.part ? b.part("muzzleDev", mm.part, [0, 0, 0]) : b.body, z = mm.z, cls = b.spec.cls
  if (att === "att_suppressor") {
    const [r, len] = cls === "pistol" ? [0.0142, 0.15] : cls === "smg" ? [0.0168, 0.165] : cls === "rifle" ? [0.0188, 0.17] : cls === "shotgun" ? [0.0225, 0.22] : cls === "sniper" ? [0.0235, 0.24] : [0.021, 0.19]
    k.cyl("steel", mm.r * 1.15, 0.008, 0, 0, z - 0.004, 12)
    k.lathe("polymer", [r * 0.86, z - 0.006, r + 0.0012, z - 0.012, r + 0.0012, z - 0.032, r, z - 0.036, r, z - len + 0.012, r * 0.9, z - len, r * 0.4, z - len - 0.0005], 0, 0, 0, 22)
    for (let i = 0; i < 6; i++) k.cyl("steelDark", r + 0.0014, 0.0016, 0, 0, z - 0.015 - i * 0.003, 22)
    k.disc("dark", Math.max(0.004, mm.r * 0.62), 0, 0, z - len - 0.0008)
    b.setMuzzle(z - len, mm.part ?? "body"); b.suppressed = true
  } else if (att === "att_comp") {
    const r = cls === "pistol" ? 0.0105 : 0.0118, len = cls === "pistol" ? 0.032 : 0.052
    k.lathe("steel", [mm.r * 1.05, z, r, z - 0.004, r, z - len, r * 0.8, z - len - 0.001], 0, 0, 0, 16)
    for (let i = 0; i < 3; i++) for (const a of [Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4]) k.box("steelDark", 0.0035, 0.004, 0.0062, Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96, z - len * 0.25 - i * len * 0.24, 0, 0, a - Math.PI / 2, 0)
    k.disc("dark", r * 0.5, 0, 0, z - len - 0.0012)
    b.setMuzzle(z - len, mm.part ?? "body"); b.brake = true
  }
}

function mountGrip(b: Build, att: AttachmentId): void {
  const gm = b.mount.grip; if (!gm) return
  const k = b.body, { z, y } = gm
  if (gm.rail) rail(k, z + 0.045, z - 0.045, 0, y, "alu", "down")
  const yb = y - (gm.rail ? 0.0085 : 0)
  if (att === "att_vgrip") {
    k.box("polymer", 0.024, 0.012, 0.04, 0, yb - 0.006, z, 0, 0, 0, 0.003)
    k.lathe("polymer", [0.0135, 0, 0.0152, -0.012, 0.0148, -0.03, 0.0156, -0.045, 0.0148, -0.06, 0.0158, -0.075, 0.0158, -0.088, 0.012, -0.092, 0, -0.092], 0, yb - 0.008, z, 16, -Math.PI / 2 + 0.12)
    b.anchor("support", "body", [0, yb - 0.055, z + 0.005], gripFrame(-0.12), { rx: 0.0156, rz: 0.0156, thumb: "wrap" })
  } else if (att === "att_agrip") {
    k.side("polymer", `M ${z + 0.03} ${yb} L ${z - 0.048} ${yb} L ${z - 0.05} ${yb - 0.012} Q ${z - 0.048} ${yb - 0.02} ${z - 0.038} ${yb - 0.021} L ${z + 0.018} ${yb - 0.034} Q ${z + 0.032} ${yb - 0.036} ${z + 0.034} ${yb - 0.026} Z`, 0.03, 0, 0.003)
    b.anchor("support", "body", [0, yb - 0.004, z + 0.044], underFrame(0.15), { rx: 0.036, rz: 0.026, thumb: "along" })
  }
}

function mountTac(b: Build): void {
  const t = b.mount.tac; if (!t) return
  const k = b.body, mats = b.mats
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3a3a34, toneMapped: false }); lampMat.userData.perRig = true
  let lx: number, ly: number, lz: number
  if (t.under) {
    k.box("polymer", 0.026, 0.02, 0.05, t.x, t.y - 0.012, t.z, 0, 0, 0, 0.004)
    k.box("polymer", 0.022, 0.004, 0.03, t.x, t.y - 0.001, t.z + 0.005, 0, 0, 0, 0.001)
    k.cyl("polymer", 0.0095, 0.012, t.x, t.y - 0.012, t.z - 0.028, 14)
    lx = t.x; ly = t.y - 0.012; lz = t.z - 0.0345
  } else {
    if (t.rail) rail(k, t.z + 0.03, t.z - 0.03, t.x, t.y, "alu", "right")
    const x0 = t.x + (t.rail ? 0.0085 : 0)
    k.box("alu", 0.008, 0.02, 0.026, x0 + 0.004, t.y, t.z, 0, 0, 0, 0.002)
    k.box("tan", 0.022, 0.03, 0.066, x0 + 0.019, t.y, t.z - 0.004, 0, 0, 0, 0.004)
    k.box("polymer", 0.012, 0.006, 0.014, x0 + 0.019, t.y + 0.017, t.z + 0.015, 0, 0, 0, 0.002)
    k.cyl("tan", 0.0095, 0.012, x0 + 0.02, t.y - 0.004, t.z - 0.04, 14)
    lx = x0 + 0.02; ly = t.y - 0.004; lz = t.z - 0.0465
    k.disc("dark", 0.003, x0 + 0.02, t.y + 0.0105, t.z - 0.0372)
  }
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.0078, 16).rotateY(Math.PI), lampMat); lamp.position.set(lx, ly, lz); b.root.add(lamp); b.lamp = lamp
  const laser = new THREE.Object3D(); laser.position.set(t.under ? t.x + 0.007 : lx, t.under ? t.y - 0.018 : t.y + 0.0105, t.under ? t.z - 0.03 : t.z - 0.038); b.root.add(laser); b.laser = laser
  void mats
}

// ───────────────────────────── public API ─────────────────────────────

/** Builds the full rig of a weapon with its attachments (anchors, moving parts, sight data). */
export function buildWeaponRig(id: WeaponId, mods: WeaponMods = {}, kind: "vm" | "world" = "vm"): WeaponRig {
  const build = BUILDERS[id] ?? BUILDERS.mk4!
  seed = 7 + id.length * 131 + id.charCodeAt(0)
  const b = new Build(id, mods, weaponMaterials(kind))
  build(b)
  b.sightY = b.ironY; b.sightZ = b.ironZ; b.eye = b.spec.eyeIron; b.sight = "iron"
  const optic = b.has("optic"); if (optic) mountOptic(b, optic)
  const muzzle = b.has("muzzle"); if (muzzle) mountMuzzle(b, muzzle)
  const grip = b.has("grip"); if (grip) mountGrip(b, grip)
  if (b.has("tactical")) mountTac(b)
  if (optic) {
    if (b.irons === "fold") { if (b.parts.ironFront) b.parts.ironFront.rotation.x = Math.PI / 2; if (b.parts.ironRear) b.parts.ironRear.rotation.x = -Math.PI / 2 }
    else if (b.irons === "hide" && b.parts.ironRear) b.parts.ironRear.visible = false
  }
  const meshCount = b.finish()
  return {
    id, mods: { ...mods }, group: b.root, spec: b.spec, parts: b.parts, anchors: b.anchors, sightY: b.sightY, sightZ: b.sightZ, ironY: b.ironY, ironZ: b.ironZ, loadDir: b.loadDir, eye: b.eye, sight: b.sight,
    muzzle: b.muzzle, eject: b.eject, reticle: b.reticle, laser: b.laser, lamp: b.lamp, magRest: b.magRest, magAxis: b.magAxis, suppressed: b.suppressed, brake: b.brake,
    belt: b.belt, marks: b.marks, meshCount,
  }
}

/** World/loot model: real size, origin at the grip, forward -Z (no hands, reticles hidden). */
export function weaponWorldModel(id: WeaponId, mods: WeaponMods = {}): THREE.Group {
  const rig = buildWeaponRig(id, mods, "world")
  const out = new THREE.Group(); out.name = `weapon_${id}`
  const grip = rig.anchors.grip
  rig.group.updateMatrixWorld(true)
  const p = grip ? grip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3()
  rig.group.position.sub(p)
  if (rig.reticle) rig.reticle.visible = false
  rig.belt?.(0, true)
  out.add(rig.group)
  out.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true } })
  out.userData.weapon = id
  return out
}

/** Weapons whose model exists (all of them once complete). */
export const MODELLED: WeaponId[] = Object.keys(BUILDERS) as WeaponId[]
export { WEAPONS }
