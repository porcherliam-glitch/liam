/**
 * vehicleModels.ts — shaped vehicle geometry for the zone props: cars in three body styles (saloon, hatchback,
 * estate) with rounded panels, real wheel arches, glazing, bumpers, lights, mirrors, door seams and spoked wheels.
 * Also rail wagons (boxcar, hopper, tank wagon) and the quarry's conveyor gallery and trestles.
 * Templates are built once per variant and cached; zoneprops.ts adds the parts to the chunk batches with a placement
 * matrix. Local frame: +x forward, +y up, +z right, origin on the ground at the vehicle centre.
 * Pure three.js geometry (no DOM), so it also builds in Node tests.
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js"

/** Material slots of a vehicle template (zoneprops maps them to batch keys and colours). */
export type VehiclePart = "paint" | "glass" | "trim" | "chrome" | "rubber" | "lampF" | "lampR" | "interior" | "plate" | "roof" | "frame" | "load"
export type VehicleGeo = Partial<Record<VehiclePart, THREE.BufferGeometry>>

/** Car body styles: 0 saloon (separate boot), 1 hatchback (sloped tailgate), 2 estate (long roof, upright tail). */
export type CarStyle = 0 | 1 | 2
export const CAR_LENGTH = 4.4
export const CAR_WIDTH = 1.84
/** How far the glasshouse reaches behind the car centre per style (maps.ts sizes the cabin solid with it). */
export const CAR_CABIN_REAR: Record<CarStyle, number> = { 0: 1.4, 1: 2.05, 2: 1.95 }

const _m = new THREE.Matrix4()

class Parts {
  private bins = new Map<VehiclePart, THREE.BufferGeometry[]>()
  add(part: VehiclePart, g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    if (m) g.applyMatrix4(m)
    let x = g.index ? g.toNonIndexed() : g
    if (x !== g) g.dispose()
    for (const k of Object.keys(x.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") x.deleteAttribute(k)
    if (!x.attributes.uv) x.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2))
    if (!x.attributes.normal) x.computeVertexNormals()
    let bin = this.bins.get(part); if (!bin) this.bins.set(part, bin = [])
    bin.push(x)
  }
  box(part: VehiclePart, w: number, h: number, d: number, x: number, y: number, z: number, r = 0, ry = 0, rz = 0): void {
    // rounding only where it shows: small parts get one bevel step, tiny ones none
    const rr = Math.min(r, w / 2, h / 2, d / 2) * 0.99, big = Math.max(w, h, d)
    const g = rr >= 0.012 && Math.min(w, h, d) >= 0.04 ? new RoundedBoxGeometry(w, h, d, big > 0.6 ? 2 : 1, rr) : new THREE.BoxGeometry(w, h, d)
    if (rz) g.rotateZ(rz)
    if (ry) g.rotateY(ry)
    g.translate(x, y, z); this.add(part, g)
  }
  /**
   * Merges each slot and welds identical vertices into an indexed mesh (hard edges keep their split normals);
   * the slots in `meters` get planar UVs in metres (tiled textures keep their real size).
   */
  build(meters: VehiclePart[] = []): VehicleGeo {
    const out: VehicleGeo = {}
    for (const [k, list] of this.bins) {
      const m = mergeGeometries(list, false); for (const x of list) x.dispose()
      if (!m) continue
      if (meters.includes(k)) meterUV(m)
      const g = mergeVertices(m, 1e-4); if (g !== m) m.dispose()
      g.computeBoundingSphere(); out[k] = g
    }
    return out
  }
}

/** Planar UVs in metres, projected along each vertex's dominant normal axis. */
function meterUV(g: THREE.BufferGeometry): void {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i))
    else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i))
    else uv.setXY(i, p.getX(i), p.getY(i))
  }
  uv.needsUpdate = true
}

/** Side profile (x = length, y = height) extruded across z, centred, edges rounded by `bevel` (the outline grows by it). */
function extrude(shape: THREE.Shape, width: number, bevel: number, segs = 3): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 10 })
  g.translate(0, 0, -(width - 2 * bevel) / 2)
  return g
}

/** Flat polygon (x, y points) on the plane z = at, facing +z (side = 1) or -z (side = -1). */
function pane(pts: number[], at: number, side: 1 | -1): THREE.BufferGeometry {
  const s = new THREE.Shape(); s.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); s.closePath()
  const g = new THREE.ShapeGeometry(s).toNonIndexed()
  if (side < 0) {
    // mirror onto the left side and restore the winding so the pane faces outwards
    g.applyMatrix4(_m.makeScale(1, 1, -1))
    const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ax, ay, az)
      const u = uv.getX(i + 1), v = uv.getY(i + 1); uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2)); uv.setXY(i + 2, u, v)
    }
    g.computeVertexNormals()
  }
  g.translate(0, 0, at)
  return g
}

/** Quad spanning the segment a → b (in the x/y side profile) across z ∈ [-hw, hw], pushed out along its normal. */
function slopeQuad(a: [number, number], b: [number, number], hw: number, out: number): THREE.BufferGeometry {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = dy / l, ny = -dx / l
  // the outward normal points away from the cabin (up/forward for the windscreen, up/back for the rear glass)
  const sgn = ny >= 0 ? 1 : -1, ox = nx * sgn * out, oy = ny * sgn * out
  const P = [[a[0] + ox, a[1] + oy, -hw], [b[0] + ox, b[1] + oy, -hw], [b[0] + ox, b[1] + oy, hw], [a[0] + ox, a[1] + oy, hw]]
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array(18), order = sgn > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
  order.forEach((k, i) => pos.set(P[k], i * 3))
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  const uv = new Float32Array(12); order.forEach((k, i) => uv.set([k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0], i * 2))
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Tyre (rubber) and five-spoke rim (chrome) for a wheel of radius r and width w, axle along z, centre at origin. */
function wheel(p: Parts, r: number, w: number, x: number, y: number, z: number, tyre = true): void {
  const place = new THREE.Matrix4().makeTranslation(x, y, z)
  const side = Math.sign(z) || 1
  if (tyre) {
    const hw = w / 2, ri = r * 0.64, pts = [new THREE.Vector2(ri, -hw * 0.8), new THREE.Vector2(r * 0.9, -hw), new THREE.Vector2(r * 0.985, -hw * 0.82), new THREE.Vector2(r, -hw * 0.45),
      new THREE.Vector2(r, hw * 0.45), new THREE.Vector2(r * 0.985, hw * 0.82), new THREE.Vector2(r * 0.9, hw), new THREE.Vector2(ri, hw * 0.8)]
    const g = new THREE.LatheGeometry(pts, 24); g.rotateX(Math.PI / 2)
    p.add("rubber", g, place)
    // tread blocks across the running surface
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; p.box("rubber", 0.012, 0.035, w * 0.86, x + Math.cos(a) * r, y + Math.sin(a) * r, z, 0, 0, a) }
  }
  const rr = r * (tyre ? 0.64 : 0.86)
  const rim = new THREE.CylinderGeometry(rr, rr, w * 0.62, 20, 1, true); rim.rotateX(Math.PI / 2); p.add("chrome", rim, place)
  const face = new THREE.CircleGeometry(rr * 0.98, 20); if (side < 0) face.rotateY(Math.PI)
  face.translate(0, 0, side * w * 0.2); p.add("trim", face, place)
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.3; p.box("chrome", rr * 0.92, rr * 0.2, 0.025, x + Math.cos(a) * rr * 0.48, y + Math.sin(a) * rr * 0.48, z + side * w * 0.24, 0, 0, a) }
  const hub = new THREE.CylinderGeometry(rr * 0.24, rr * 0.28, 0.05, 12); hub.rotateX(Math.PI / 2); hub.translate(0, 0, side * w * 0.27); p.add("chrome", hub, place)
}

const carCache = new Map<string, VehicleGeo>()

/**
 * Car template. glazed = false: burnt-out shell — no glass, the glasshouse is an open frame of roof and pillars with
 * charred seats inside, rims without tyres.
 */
export function carGeometry(style: CarStyle, glazed: boolean): VehicleGeo {
  const key = `${style}:${glazed ? 1 : 0}`
  const hit = carCache.get(key); if (hit) return hit
  const p = new Parts()
  const hl = CAR_LENGTH / 2, W = CAR_WIDTH, b = 0.06
  const xf = hl - 0.82, xr = -hl + 0.82, wr = 0.33, ra = 0.41, bot = 0.24
  const belt = 0.88, roofY = style === 0 ? 1.43 : 1.42
  // ── lower body: bumpers to belt line, wheel arches cut into the sills
  const s = new THREE.Shape()
  const tail = style === 0 ? -hl + 0.12 : -hl + 0.1
  s.moveTo(-hl + 0.14 + b, bot)
  s.lineTo(xr - ra, bot); s.lineTo(xr - ra, wr); s.absarc(xr, wr, ra, Math.PI, 0, true); s.lineTo(xr + ra, bot)
  s.lineTo(xf - ra, bot); s.lineTo(xf - ra, wr); s.absarc(xf, wr, ra, Math.PI, 0, true); s.lineTo(xf + ra, bot)
  s.lineTo(hl - 0.14 - b, bot)
  s.quadraticCurveTo(hl - b, bot + 0.02, hl - b, 0.4)
  s.lineTo(hl - b, 0.58)
  s.quadraticCurveTo(hl - b - 0.01, 0.7, hl - 0.16 - b, 0.72)
  s.lineTo(hl - 1.05, 0.84)                                   // bonnet rising to the scuttle
  s.lineTo(-hl + 1.02, belt)                                  // belt line
  if (style === 0) { s.lineTo(tail + b, 0.86); s.quadraticCurveTo(-hl + b, 0.85, -hl + b, 0.7) }   // boot deck
  else { s.lineTo(tail + b, belt - 0.01); s.quadraticCurveTo(-hl + b, belt - 0.02, -hl + b, 0.74) }
  s.lineTo(-hl + b, 0.4)
  s.quadraticCurveTo(-hl + b, bot + 0.02, -hl + 0.14 + b, bot)
  p.add("paint", extrude(s, W, b, 3))
  // ── glasshouse
  const front: [number, number] = [hl - 1.07, 0.86], roofF: [number, number] = [0.32, roofY]
  const roofR: [number, number] = style === 0 ? [-0.92, roofY - 0.02] : style === 1 ? [-1.4, roofY - 0.04] : [-1.82, roofY - 0.02]
  const rear: [number, number] = style === 0 ? [-1.26, belt] : style === 1 ? [-2.02, belt + 0.03] : [-1.92, belt + 0.02]
  const cw = W - 0.26, chw = cw / 2
  const cab = new THREE.Shape()
  cab.moveTo(front[0], front[1]); cab.lineTo(roofF[0], roofF[1]); cab.quadraticCurveTo((roofF[0] + roofR[0]) / 2, roofY + 0.025, roofR[0], roofR[1]); cab.lineTo(rear[0], rear[1]); cab.closePath()
  if (glazed) {
    p.add("paint", extrude(cab, cw, 0.05, 2))
    const gz = chw + 0.004
    // side windows split by the B and C pillars, inset from the pillars and roof
    const bx = -0.22, top = roofY - 0.08, low = belt + 0.05
    const wsAt = (y: number) => front[0] + (roofF[0] - front[0]) * (y - front[1]) / (roofF[1] - front[1]) - 0.07
    const rwAt = (y: number) => rear[0] + (roofR[0] - rear[0]) * (y - rear[1]) / (roofR[1] - rear[1]) + 0.07
    const fw = [wsAt(low), low, wsAt(top), top, bx + 0.05, top, bx + 0.05, low]
    const rx = style === 0 ? rwAt(low) : -1.16
    const rw = style === 0 ? [bx - 0.05, low, bx - 0.05, top, rwAt(top), top, rx, low] : [bx - 0.05, low, bx - 0.05, top, -1.12, top, -1.12, low]
    for (const sd of [1, -1] as const) { p.add("glass", pane(fw, sd * gz, sd)); p.add("glass", pane(rw, sd * gz, sd)) }
    if (style !== 0) {
      // rear quarter light behind the C pillar
      const q = style === 1 ? [-1.24, low, -1.24, top - 0.02, rwAt(top - 0.02), top - 0.02, rwAt(low), low] : [-1.24, low, -1.24, top, -1.78, top, -1.84, low]
      for (const sd of [1, -1] as const) p.add("glass", pane(q, sd * gz, sd))
    }
    p.add("glass", slopeQuad([front[0] - 0.03, front[1] + 0.04], [roofF[0] + 0.03, roofF[1] - 0.04], chw - 0.05, 0.052))
    p.add("glass", slopeQuad([roofR[0] - 0.03, roofR[1] - 0.04], [rear[0] + 0.03, rear[1] + 0.04], chw - 0.06, 0.052))
  } else {
    // burnt: roof skin, A/B/C pillars, charred seats inside
    const roofLen = roofF[0] - roofR[0]
    p.box("paint", roofLen, 0.05, cw, (roofF[0] + roofR[0]) / 2, roofY - 0.01, 0, 0.02)
    for (const sd of [-1, 1]) {
      const z = sd * (chw - 0.03)
      const pillar = (a: [number, number], c: [number, number]) => { const dx = c[0] - a[0], dy = c[1] - a[1]; p.box("paint", Math.hypot(dx, dy), 0.06, 0.06, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, z, 0.01, 0, Math.atan2(dy, dx)) }
      pillar(front, roofF); pillar(rear, roofR); pillar([-0.22, belt], [-0.22, roofY])
    }
    p.box("interior", 0.5, 0.42, W - 0.5, 0.15, 0.62, 0, 0.06); p.box("interior", 0.14, 0.5, W - 0.5, -0.12, 0.95, 0, 0.04)
    p.box("interior", 0.6, 0.36, W - 0.5, -0.85, 0.6, 0, 0.06); p.box("interior", 0.14, 0.44, W - 0.5, -1.12, 0.92, 0, 0.04)
  }
  // ── bumpers, grille, lights, plates, mirrors, handles, seams, underbody
  for (const e of [-1, 1]) p.box("trim", 0.18, 0.2, W - 0.04, e * (hl - 0.06), 0.35, 0, 0.06)
  p.box("trim", 0.05, 0.15, 0.78, hl - 0.03, 0.56, 0, 0.02)
  for (let i = 0; i < 4; i++) p.box("chrome", 0.052, 0.012, 0.74, hl - 0.025, 0.505 + i * 0.034, 0, 0)
  for (const sd of [-1, 1]) {
    p.box("lampF", 0.07, 0.11, 0.32, hl - 0.012, 0.62, sd * (W / 2 - 0.27), 0.03)
    p.box("chrome", 0.06, 0.13, 0.36, hl - 0.022, 0.62, sd * (W / 2 - 0.27), 0.03)
    p.box("lampR", 0.06, style === 0 ? 0.14 : 0.24, 0.26, -hl + 0.012, style === 0 ? 0.72 : 0.76, sd * (W / 2 - 0.22), 0.03)
    p.box("lampF", 0.03, 0.05, 0.14, hl - 0.04, 0.38, sd * (W / 2 - 0.3), 0.01)
    // mirror on an arm at the A-pillar base
    p.box("trim", 0.06, 0.03, 0.12, front[0] - 0.12, 0.96, sd * (chw + 0.08), 0.01)
    p.box("paint", 0.1, 0.09, 0.13, front[0] - 0.12, 0.99, sd * (chw + 0.17), 0.03)
    const z = sd * (W / 2 + 0.003)
    for (const x of style === 0 ? [0.86, -0.24, -1.2] : [0.86, -0.24, -1.24]) p.box("trim", 0.008, 0.52, 0.006, x, 0.6, z)
    for (const x of [0.32, -0.74]) p.box("chrome", 0.14, 0.025, 0.02, x, 0.77, z + sd * 0.005, 0.008)
    p.box("trim", hl * 2 - 2.1, 0.06, 0.012, 0, 0.4, z + sd * 0.004, 0)        // rubbing strip
  }
  for (const e of [-1, 1]) p.box("plate", 0.012, 0.11, 0.5, e * (hl + 0.036), 0.37, 0, 0.004)
  p.box("trim", hl * 2 - 0.8, 0.12, W - 0.3, 0, 0.18, 0, 0)
  // ── wheels
  for (const x of [xf, xr]) for (const sd of [-1, 1]) wheel(p, glazed ? wr : wr * 0.78, 0.21, x, glazed ? wr : wr * 0.78, sd * (W / 2 - 0.12), glazed)
  const geo = p.build()
  carCache.set(key, geo)
  return geo
}

/** Releases cached templates (world disposal). */
export function disposeVehicleTemplates(): void {
  for (const g of carCache.values()) for (const x of Object.values(g)) x?.dispose()
  carCache.clear()
}

// ───────────────────────────── heavy vehicles ─────────────────────────────

const heavyCache = new Map<string, VehicleGeo>()
const cached = (key: string, make: () => VehicleGeo): VehicleGeo => { let g = heavyCache.get(key); if (!g) { g = make(); heavyCache.set(key, g) } return g }

/** Cylinder between two points (radius r0 at a, r1 at b). */
function rod(p: Parts, part: VehiclePart, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 10): void {
  const d = b.clone().sub(a), len = d.length()
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z)
  p.add(part, g)
}
/** Shape from a flat list of x, y points (polygon). */
function poly(pts: number[]): THREE.Shape {
  const s = new THREE.Shape(); s.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); s.closePath(); return s
}
/** Flat pane on the plane x = at (front or back face), polygon given as z, y points, facing +x (side 1) or -x. */
function paneX(pts: number[], at: number, side: 1 | -1): THREE.BufferGeometry {
  const g = pane(pts, 0, 1)
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(side > 0 ? Math.PI / 2 : -Math.PI / 2))
  g.translate(at, 0, 0)
  return g
}
/** Fender arc over a wheel (three bent plates), axle along z at (x, y). */
function fender(p: Parts, part: VehiclePart, x: number, y: number, z: number, r: number, w: number, from = 0.25, to = Math.PI - 0.25): void {
  const n = 5
  for (let i = 0; i < n; i++) {
    const a0 = from + (to - from) * i / n, a1 = from + (to - from) * (i + 1) / n, am = (a0 + a1) / 2, len = 2 * r * Math.sin((a1 - a0) / 2) + 0.01
    p.box(part, len, 0.025, w, x + Math.cos(am) * r, y + Math.sin(am) * r, z, 0, 0, am + Math.PI / 2)
  }
}

/** 8×8 armoured personnel carrier: sloped glacis, sponsons over the wheels, turret with a 30 mm gun, smoke dischargers. */
export function apcGeometry(): VehicleGeo {
  return cached("apc", () => {
    const p = new Parts(), hl = 3.45
    // lower hull between the wheels, upper hull with sponsons over them
    p.add("paint", extrude(poly([-hl + 0.1, 0.5, hl - 0.75, 0.5, hl - 0.05, 1.05, -hl + 0.05, 1.05]), 1.9, 0.04, 2))
    p.add("paint", extrude(poly([-hl + 0.04, 1.02, hl - 0.04, 1.02, hl - 0.24, 1.5, 1.55, 1.9, -hl + 0.16, 1.9, -hl + 0.04, 1.78]), 2.84, 0.05, 2))
    // wheels with fenders between the sponsons
    for (const x of [2.35, 1.0, -0.85, -2.2]) for (const sd of [-1, 1]) wheel(p, 0.55, 0.42, x, 0.55, sd * 1.2)
    // turret: ring, faceted body, mantlet, gun, coax, sights, smoke dischargers
    const tx = 0.15, ty = 1.95
    const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.1, 24); ring.translate(tx, ty, 0); p.add("trim", ring)
    p.add("paint", extrude(poly([-0.75 + tx, ty, 0.62 + tx, ty, 0.95 + tx, ty + 0.24, 0.62 + tx, ty + 0.5, -0.75 + tx, ty + 0.5]), 1.55, 0.04, 2))
    p.box("paint", 0.3, 0.32, 0.5, tx + 1.0, ty + 0.27, 0.12, 0.03)
    rod(p, "trim", new THREE.Vector3(tx + 1.1, ty + 0.27, 0.12), new THREE.Vector3(tx + 3.1, ty + 0.27, 0.12), 0.055, 0.045, 12)
    rod(p, "trim", new THREE.Vector3(tx + 2.95, ty + 0.27, 0.12), new THREE.Vector3(tx + 3.25, ty + 0.27, 0.12), 0.07, 0.07, 12)
    rod(p, "trim", new THREE.Vector3(tx + 1.1, ty + 0.2, -0.16), new THREE.Vector3(tx + 1.6, ty + 0.2, -0.16), 0.022, 0.02, 8)
    p.box("paint", 0.34, 0.24, 0.3, tx + 0.35, ty + 0.62, -0.45, 0.03); p.box("glass", 0.02, 0.14, 0.22, tx + 0.53, ty + 0.63, -0.45)
    const hatch = new THREE.CylinderGeometry(0.3, 0.32, 0.08, 16); hatch.translate(tx - 0.35, ty + 0.54, 0.38); p.add("paint", hatch)
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) rod(p, "trim", new THREE.Vector3(tx + 0.55, ty + 0.12 + i * 0.1, sd * 0.78), new THREE.Vector3(tx + 0.75, ty + 0.2 + i * 0.1, sd * 0.86), 0.04, 0.04, 8)
    rod(p, "trim", new THREE.Vector3(tx - 0.6, ty + 0.5, -0.6), new THREE.Vector3(tx - 0.6, ty + 2.3, -0.6), 0.012, 0.006, 5)
    // driver's hatch and periscopes on the glacis, headlights in guards, tow hooks
    p.box("paint", 0.5, 0.06, 0.6, 1.9, 1.86, -0.6, 0.02)
    for (let i = 0; i < 3; i++) p.box("glass", 0.08, 0.06, 0.12, 2.15, 1.84, -0.82 + i * 0.22, 0.01)
    for (const sd of [-1, 1]) {
      p.box("lampF", 0.06, 0.12, 0.16, hl - 0.18, 1.3, sd * 1.05, 0.02)
      for (const dz of [-0.1, 0.1]) p.box("trim", 0.12, 0.2, 0.02, hl - 0.13, 1.3, sd * 1.05 + dz)
      p.box("trim", 0.16, 0.08, 0.08, hl - 0.1, 0.62, sd * 0.6, 0.02)
      // stowage boxes on the sponsons, side vision blocks
      p.box("paint", 1.1, 0.32, 0.18, -1.6, 1.62, sd * 1.5, 0.02)
      for (const x of [0.5, -0.5]) p.box("glass", 0.16, 0.08, 0.02, x, 1.62, sd * 1.43)
    }
    // rear ramp outline, exhaust grille, numbers plate area
    p.box("trim", 0.02, 0.9, 1.5, -hl + 0.05, 1.2, 0)
    p.box("paint", 0.03, 0.86, 1.44, -hl + 0.04, 1.2, 0, 0.01)
    p.box("trim", 0.6, 0.03, 0.4, -2.2, 1.91, 0.85)
    for (let i = 0; i < 5; i++) p.box("trim", 0.56, 0.02, 0.025, -2.2, 1.93, 0.69 + i * 0.08)
    return p.build()
  })
}

/** Cab-over truck cab (the box body is a separate "cargo" solid behind it). */
export function truckCabGeometry(): VehicleGeo {
  return cached("truckcab", () => {
    const p = new Parts(), hl = 1.15, W = 2.4, hw = W / 2
    p.add("paint", extrude(poly([-hl, 1.0, hl - 0.04, 1.0, hl, 1.08, hl, 2.0, hl - 0.1, 2.78, hl - 0.28, 2.88, -hl, 2.88]), W, 0.06, 3))
    // windscreen, door windows, quarter lights
    p.add("glass", slopeQuad([hl + 0.002, 2.05], [hl - 0.1, 2.74], hw - 0.14, 0.064))
    const win = [0.95, 2.0, 0.92, 2.7, 0.1, 2.7, 0.1, 2.0]
    for (const sd of [1, -1] as const) { p.add("glass", pane(win, sd * (hw + 0.004), sd)); p.add("glass", pane([-0.05, 2.25, -0.05, 2.7, -0.55, 2.7, -0.55, 2.25], sd * (hw + 0.004), sd)) }
    // grille, badge, lights, bumper with steps, roof lights, sun visor
    p.box("trim", 0.05, 0.62, 1.7, hl + 0.04, 1.5, 0, 0.02)
    for (let i = 0; i < 6; i++) p.box("chrome", 0.06, 0.035, 1.6, hl + 0.045, 1.25 + i * 0.1, 0, 0.01)
    for (const sd of [-1, 1]) {
      p.box("lampF", 0.06, 0.18, 0.3, hl + 0.04, 1.15, sd * (hw - 0.3), 0.03)
      p.box("lampR", 0.04, 0.06, 0.1, hl - 0.1, 2.93, sd * (hw - 0.25), 0.01)
      // door seams, handle, two steps, mirror on a tubular arm
      for (const x of [1.0, 0.0]) p.box("trim", 0.01, 1.0, 0.008, x, 1.55, sd * (hw + 0.004))
      p.box("chrome", 0.18, 0.03, 0.03, 0.15, 1.9, sd * (hw + 0.02), 0.01)
      for (const y of [0.55, 0.85]) p.box("trim", 0.42, 0.04, 0.24, 0.55, y, sd * (hw - 0.05), 0.01)
      rod(p, "chrome", new THREE.Vector3(1.0, 2.3, sd * hw), new THREE.Vector3(1.15, 2.35, sd * (hw + 0.32)), 0.018)
      p.box("trim", 0.08, 0.4, 0.2, 1.12, 2.25, sd * (hw + 0.36), 0.02)
      p.box("glass", 0.01, 0.34, 0.16, 1.07, 2.25, sd * (hw + 0.36))
    }
    p.box("trim", 0.22, 0.32, W, hl + 0.02, 0.78, 0, 0.04)
    p.box("paint", 0.24, 0.05, W - 0.2, hl - 0.05, 2.86, 0, 0.02)
    // chassis rails, front wheels with mudguards, fuel tank, exhaust stack behind the cab
    for (const sd of [-1, 1]) p.box("trim", 2.3, 0.22, 0.12, -0.1, 0.72, sd * 0.45)
    for (const sd of [-1, 1]) { wheel(p, 0.5, 0.32, 0.3, 0.5, sd * (hw - 0.17)); fender(p, "trim", 0.3, 0.5, sd * (hw - 0.17), 0.58, 0.36, 0.2, Math.PI - 0.6) }
    rod(p, "chrome", new THREE.Vector3(-0.2, 0.62, -0.95), new THREE.Vector3(-1.1, 0.62, -0.95), 0.25, 0.25, 16)
    rod(p, "chrome", new THREE.Vector3(-1.2, 1.0, hw - 0.25), new THREE.Vector3(-1.2, 3.2, hw - 0.25), 0.07, 0.065, 10)
    return p.build()
  })
}

/** City bus: rounded body, window band with pillars, folding doors, destination display. glazed = false: burnt shell. */
export function busGeometry(L: number, W: number, H: number, glazed: boolean): VehicleGeo {
  return cached(`bus:${L.toFixed(1)}:${W.toFixed(2)}:${H.toFixed(1)}:${glazed ? 1 : 0}`, () => {
    const p = new Parts(), hl = L / 2, hw = W / 2, b = 0.09
    const xf = hl - 2.3, xr = -hl + 3.0, wr = 0.5, ra = 0.6, bot = 0.32
    const s = new THREE.Shape()
    s.moveTo(-hl + 0.25 + b, bot)
    s.lineTo(xr - ra, bot); s.lineTo(xr - ra, wr); s.absarc(xr, wr, ra, Math.PI, 0, true); s.lineTo(xr + ra, bot)
    s.lineTo(xf - ra, bot); s.lineTo(xf - ra, wr); s.absarc(xf, wr, ra, Math.PI, 0, true); s.lineTo(xf + ra, bot)
    s.lineTo(hl - 0.2 - b, bot); s.quadraticCurveTo(hl - b, bot, hl - b, 0.6)
    s.lineTo(hl - b + 0.02, H - 0.45); s.quadraticCurveTo(hl - b, H - b, hl - 0.4, H - b)
    s.lineTo(-hl + 0.35, H - b); s.quadraticCurveTo(-hl + b, H - b, -hl + b, H - 0.4)
    s.lineTo(-hl + b, 0.6); s.quadraticCurveTo(-hl + b, bot, -hl + 0.25 + b, bot)
    p.add("paint", extrude(s, W, b, 3))
    const top = H - 0.62, low = 1.25
    if (glazed) {
      // side windows between pillars (door side +z has the front and middle doors)
      for (const sd of [1, -1] as const) {
        const z = sd * (hw + 0.004)
        for (let x = -hl + 0.5; x < hl - 1.2; x += 1.38) {
          const x1 = Math.min(x + 1.24, hl - 0.4)
          if (sd > 0 && ((x1 > hl - 1.7) || (x < 1.3 && x1 > 0.1))) continue
          p.add("glass", pane([x, low, x, top, x1, top, x1, low], z, sd))
        }
        if (sd > 0) for (const [d0, d1] of [[hl - 1.65, hl - 0.45], [0.15, 1.3]]) {
          p.add("glass", pane([d0, 0.45, d0, top, (d0 + d1) / 2 - 0.02, top, (d0 + d1) / 2 - 0.02, 0.45], z, sd))
          p.add("glass", pane([(d0 + d1) / 2 + 0.02, 0.45, (d0 + d1) / 2 + 0.02, top, d1, top, d1, 0.45], z, sd))
          p.box("trim", d1 - d0 + 0.06, 0.05, 0.03, (d0 + d1) / 2, top + 0.03, z)
        }
      }
      p.add("glass", paneX([-hw + 0.12, 1.0, hw - 0.12, 1.0, hw - 0.12, top + 0.1, -hw + 0.12, top + 0.1], hl + 0.004, 1))
      p.add("glass", paneX([-hw + 0.25, 1.6, hw - 0.25, 1.6, hw - 0.25, top, -hw + 0.25, top], -hl - 0.004, -1))
      p.add("lampF", paneX([-hw + 0.3, top + 0.22, hw - 0.3, top + 0.22, hw - 0.3, H - 0.18, -hw + 0.3, H - 0.18], hl + 0.006, 1))
    } else {
      // burnt: window openings as dark holes, charred seat rows visible
      for (const sd of [1, -1] as const) p.add("interior", pane([-hl + 0.5, low, -hl + 0.5, top, hl - 0.45, top, hl - 0.45, low], sd * (hw + 0.004), sd))
      p.add("interior", paneX([-hw + 0.12, 1.0, hw - 0.12, 1.0, hw - 0.12, top + 0.1, -hw + 0.12, top + 0.1], hl + 0.004, 1))
    }
    // bumpers, lights, mirrors on arms, roof hatches and AC unit, waist trim
    for (const e of [-1, 1]) p.box("trim", 0.2, 0.36, W - 0.04, e * (hl - 0.03), 0.48, 0, 0.06)
    for (const sd of [-1, 1]) {
      p.box("lampF", 0.05, 0.16, 0.36, hl + 0.01, 0.82, sd * (hw - 0.4), 0.03)
      p.box("lampR", 0.05, 0.36, 0.18, -hl - 0.005, 1.0, sd * (hw - 0.2), 0.03)
      rod(p, "trim", new THREE.Vector3(hl - 0.2, H - 0.5, sd * hw), new THREE.Vector3(hl + 0.35, H - 0.45, sd * (hw + 0.15)), 0.025)
      rod(p, "trim", new THREE.Vector3(hl + 0.35, H - 0.45, sd * (hw + 0.15)), new THREE.Vector3(hl + 0.35, H - 1.1, sd * (hw + 0.15)), 0.025)
      p.box("trim", 0.06, 0.42, 0.22, hl + 0.36, H - 1.3, sd * (hw + 0.15), 0.02)
      p.box("trim", L - 0.4, 0.04, 0.012, 0, 1.18, sd * (hw + 0.006))
    }
    p.box("paint", 2.8, 0.24, W - 0.7, -1.0, H + 0.08, 0, 0.06)
    for (const x of [2.2, -3.8]) p.box("trim", 0.8, 0.06, 0.8, x, H - 0.02, 0, 0.02)
    for (const x of [xf, xr]) for (const sd of [-1, 1]) wheel(p, wr, 0.3, x, wr, sd * (hw - 0.2), glazed)
    return p.build()
  })
}

/** Farm tractor: long bonnet, glazed cab on four posts, huge lugged rear tyres under fenders, small front wheels. */
export function tractorGeometry(): VehicleGeo {
  return cached("tractor", () => {
    const p = new Parts()
    // bonnet with a rounded nose, grille, chassis
    p.add("paint", extrude(poly([0.15, 0.85, 2.25, 0.85, 2.42, 1.0, 2.42, 1.42, 2.25, 1.6, 0.15, 1.65]), 0.95, 0.07, 3))
    p.box("trim", 0.04, 0.5, 0.7, 2.45, 1.2, 0, 0.02)
    for (let i = 0; i < 5; i++) p.box("chrome", 0.05, 0.03, 0.66, 2.46, 1.0 + i * 0.1, 0, 0.01)
    p.box("trim", 2.6, 0.32, 0.7, 0.9, 0.62, 0, 0.04)
    p.box("trim", 0.3, 0.35, 0.8, 2.55, 0.62, 0, 0.03)
    for (const sd of [-1, 1]) p.box("lampF", 0.05, 0.1, 0.16, 2.43, 1.48, sd * 0.32, 0.02)
    // cab: floor, posts, roof, glass all round, seat and steering wheel inside
    const cx0 = -1.55, cx1 = 0.25, cy0 = 1.15, cy1 = 2.55, cz = 0.62
    p.box("trim", cx1 - cx0, 0.12, 2 * cz, (cx0 + cx1) / 2, cy0, 0, 0.02)
    for (const x of [cx0 + 0.04, cx1 - 0.04]) for (const sd of [-1, 1]) p.box("trim", 0.07, cy1 - cy0, 0.07, x, (cy0 + cy1) / 2, sd * (cz - 0.04), 0.01)
    p.box("paint", cx1 - cx0 + 0.24, 0.1, 2 * cz + 0.2, (cx0 + cx1) / 2, cy1 + 0.05, 0, 0.04)
    for (const sd of [1, -1] as const) p.add("glass", pane([cx0 + 0.08, cy0 + 0.1, cx0 + 0.08, cy1 - 0.04, cx1 - 0.08, cy1 - 0.04, cx1 - 0.08, cy0 + 0.1], sd * cz, sd))
    p.add("glass", paneX([-cz + 0.08, 1.3, cz - 0.08, 1.3, cz - 0.08, cy1 - 0.04, -cz + 0.08, cy1 - 0.04], cx1, 1))
    p.add("glass", paneX([-cz + 0.08, 1.3, cz - 0.08, 1.3, cz - 0.08, cy1 - 0.04, -cz + 0.08, cy1 - 0.04], cx0, -1))
    p.box("interior", 0.5, 0.12, 0.5, -0.8, 1.6, 0, 0.04); p.box("interior", 0.1, 0.55, 0.5, -1.05, 1.9, 0, 0.03)
    const sw = new THREE.TorusGeometry(0.17, 0.018, 6, 16); sw.rotateY(Math.PI / 2); sw.rotateZ(0.6); sw.translate(-0.2, 1.95, 0); p.add("trim", sw)
    // rear wheels (lugs), fenders, front wheels, exhaust, hitch, front weights
    for (const sd of [-1, 1]) {
      wheel(p, 0.82, 0.48, -1.0, 0.82, sd * 1.22)
      for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; p.box("rubber", 0.06, 0.07, 0.2, -1.0 + Math.cos(a) * 0.83, 0.82 + Math.sin(a) * 0.83, sd * (1.22 + (i % 2 ? 0.11 : -0.11)), 0, i % 2 ? 0.5 : -0.5, a) }
      fender(p, "paint", -1.0, 0.82, sd * 1.22, 0.92, 0.56, 0.15, Math.PI - 0.15)
      wheel(p, 0.46, 0.3, 1.75, 0.46, sd * 0.88)
      fender(p, "paint", 1.75, 0.46, sd * 0.88, 0.54, 0.34, 0.5, Math.PI - 0.5)
      for (let i = 0; i < 4; i++) p.box("trim", 0.1, 0.36, 0.08, 2.75, 0.75, sd * (0.15 + i * 0.1), 0.01)
    }
    rod(p, "trim", new THREE.Vector3(1.7, 1.6, 0.3), new THREE.Vector3(1.7, 2.5, 0.3), 0.06, 0.055, 10)
    p.box("trim", 0.5, 0.12, 0.3, -2.05, 0.75, 0, 0.02)
    return p.build()
  })
}

/** Tracked excavator: track frames with shoes and rollers, slewed upper house with counterweight and cab,
 *  boom and stick with hydraulic rams, bucket resting on the ground. */
export function excavatorGeometry(): VehicleGeo {
  return cached("excavator", () => {
    const p = new Parts()
    for (const sd of [-1, 1]) {
      const z = sd * 1.6
      const tr = new THREE.Shape(); tr.moveTo(-2.4, 0.05); tr.lineTo(2.4, 0.05); tr.absarc(2.4, 0.45, 0.4, -Math.PI / 2, Math.PI / 2, false); tr.lineTo(-2.4, 0.85); tr.absarc(-2.4, 0.45, 0.4, Math.PI / 2, Math.PI * 1.5, false)
      const g = extrude(tr, 0.62, 0.03, 1); g.translate(0, 0, z); p.add("rubber", g)
      for (let x = -2.5; x <= 2.5; x += 0.22) { p.box("trim", 0.08, 0.04, 0.64, x, 0.87, z); p.box("trim", 0.08, 0.04, 0.64, x, 0.03, z) }
      for (const x of [-1.6, -0.8, 0, 0.8, 1.6]) { const r = new THREE.CylinderGeometry(0.14, 0.14, 0.66, 10); r.rotateX(Math.PI / 2); r.translate(x, 0.25, z); p.add("chrome", r) }
      for (const x of [-2.4, 2.4]) { const r = new THREE.CylinderGeometry(0.3, 0.3, 0.66, 14); r.rotateX(Math.PI / 2); r.translate(x, 0.45, z); p.add("chrome", r) }
      p.box("paint", 4.6, 0.25, 0.4, 0, 0.58, sd * 1.2, 0.04)
    }
    p.box("trim", 2.2, 0.35, 2.2, 0, 0.75, 0, 0.05)
    const ring = new THREE.CylinderGeometry(1.0, 1.0, 0.18, 24); ring.translate(0, 1.0, 0); p.add("trim", ring)
    // upper house slewed by 20°, everything above in its own frame
    const up = new Parts()
    up.add("paint", extrude(poly([-1.7, 1.1, 1.3, 1.1, 1.4, 1.25, 1.4, 2.25, -1.5, 2.25, -1.75, 2.0]), 2.7, 0.06, 2))
    up.add("paint", extrude(poly([-2.15, 1.15, -1.55, 1.15, -1.55, 2.05, -2.0, 2.05, -2.2, 1.8]), 2.6, 0.12, 3))
    for (let i = 0; i < 6; i++) up.box("trim", 0.8, 0.02, 0.04, -0.6, 2.27, 0.2 + i * 0.12)
    // cab front left
    const c0 = 0.25, c1 = 1.35, cz0 = -1.3, cz1 = -0.4, cy0 = 2.25, cy1 = 3.15
    for (const x of [c0, c1]) for (const z of [cz0, cz1]) up.box("paint", 0.06, cy1 - cy0, 0.06, x, (cy0 + cy1) / 2, z, 0.01)
    up.box("paint", c1 - c0 + 0.1, 0.08, cz1 - cz0 + 0.1, (c0 + c1) / 2, cy1, (cz0 + cz1) / 2, 0.03)
    up.add("glass", pane([c0 + 0.04, cy0 + 0.05, c0 + 0.04, cy1 - 0.05, c1 - 0.04, cy1 - 0.05, c1 - 0.04, cy0 + 0.05], cz0, -1))
    up.add("glass", pane([c0 + 0.04, cy0 + 0.05, c0 + 0.04, cy1 - 0.05, c1 - 0.04, cy1 - 0.05, c1 - 0.04, cy0 + 0.05], cz1, 1))
    up.add("glass", paneX([cz0 + 0.04, cy0 + 0.05, cz1 - 0.04, cy0 + 0.05, cz1 - 0.04, cy1 - 0.05, cz0 + 0.04, cy1 - 0.05], c1, 1))
    up.box("interior", 0.4, 0.4, 0.4, 0.7, 2.5, -0.85, 0.03)
    rod(up, "trim", new THREE.Vector3(-1.2, 2.25, 0.9), new THREE.Vector3(-1.2, 2.9, 0.9), 0.06)
    // boom from the house front up and out, stick down to the bucket on the ground, rams
    const A = new THREE.Vector3(1.2, 1.7, 0.25), B = new THREE.Vector3(2.75, 3.15, 0.25), C = new THREE.Vector3(3.25, 0.75, 0.25)
    const arm = (a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) => { const d = b.clone().sub(a); up.box("paint", d.length(), h, w, (a.x + b.x) / 2, (a.y + b.y) / 2, a.z, 0.04, 0, Math.atan2(d.y, d.x)) }
    arm(A, B, 0.42, 0.42); arm(B, C, 0.34, 0.32)
    rod(up, "chrome", new THREE.Vector3(1.3, 1.35, 0.25), new THREE.Vector3(2.2, 2.6, 0.25), 0.07)
    rod(up, "trim", new THREE.Vector3(1.3, 1.35, 0.25), new THREE.Vector3(1.75, 1.97, 0.25), 0.1)
    rod(up, "chrome", new THREE.Vector3(2.4, 3.3, 0.25), new THREE.Vector3(3.1, 1.6, 0.25), 0.06)
    up.add("trim", extrude(poly([2.95, 0.05, 3.65, 0.05, 3.7, 0.55, 3.4, 0.85, 3.05, 0.7]), 0.9, 0.03, 1).translate(0, 0, 0.25))
    for (let i = 0; i < 5; i++) up.box("chrome", 0.12, 0.05, 0.08, 3.72, 0.08, 0.25 - 0.36 + i * 0.18, 0.01)
    const ug = up.build(), rot = new THREE.Matrix4().makeRotationY(0.35)
    for (const [k, g] of Object.entries(ug) as [VehiclePart, THREE.BufferGeometry][]) p.add(k, g, rot)
    return p.build()
  })
}

/** Motor boat on a cradle: lofted V hull (antifouling below the waterline, a coloured stripe), deck, wheelhouse,
 *  rails and a mast. L along x, beam W. */
export function boatGeometry(L: number, W: number, cradle: number): VehicleGeo {
  return cached(`boat:${L.toFixed(1)}:${W.toFixed(1)}:${cradle.toFixed(2)}`, () => {
    const p = new Parts(), hl = L / 2, hb = W / 2 - 0.1, depth = Math.min(1.5, W * 0.32), y0 = cradle, ySheer = y0 + depth, yWater = y0 + depth * 0.42
    // stations from the transom (t = 0) to the bow (t = 1): half beam and keel rise
    const N = 14, st: { x: number; b: number; k: number }[] = []
    for (let i = 0; i <= N; i++) { const t = i / N, x = -hl + t * L, b = hb * (t < 0.6 ? 1 - 0.08 * (0.6 - t) : Math.sqrt(Math.max(0, 1 - ((t - 0.6) / 0.4) ** 2 * 0.96))), k = y0 + (t > 0.75 ? (t - 0.75) / 0.25 * depth * 0.55 : 0); st.push({ x, b, k }) }
    // each station: keel → chine → sheer on both sides; quads between stations, split at the waterline colour band
    const ring = (s: typeof st[number]) => { const chineY = s.k + (ySheer - s.k) * 0.32; return [[0, s.k], [s.b * 0.86, chineY], [s.b, ySheer]] as [number, number][] }
    const band = (part: VehiclePart, yLo: number, yHi: number) => {
      const pos: number[] = []
      const clip = (a: [number, number], c: [number, number], y: number) => { const t = (y - a[1]) / (c[1] - a[1] || 1); return [a[0] + (c[0] - a[0]) * t, y] as [number, number] }
      for (let i = 0; i < N; i++) {
        const r0 = ring(st[i]), r1 = ring(st[i + 1])
        for (let j = 0; j < 2; j++) for (const sd of [-1, 1]) {
          let a0 = r0[j], b0 = r0[j + 1], a1 = r1[j], b1 = r1[j + 1]
          // clamp the segment to the colour band (vertical clipping of each edge)
          const lo = (a: [number, number], b: [number, number]) => (a[1] < yLo ? (b[1] < yLo ? null : clip(a, b, yLo)) : a)
          const hi = (a: [number, number], b: [number, number]) => (b[1] > yHi ? (a[1] > yHi ? null : clip(a, b, yHi)) : b)
          const s0 = lo(a0, b0), e0 = hi(a0, b0), s1 = lo(a1, b1), e1 = hi(a1, b1)
          if (!s0 || !e0 || !s1 || !e1 || e0[1] < s0[1] || e1[1] < s1[1]) continue
          a0 = s0; b0 = e0; a1 = s1; b1 = e1
          const P = (q: [number, number], x: number) => [x, q[1], sd * q[0]]
          const v = [P(a0, st[i].x), P(a1, st[i + 1].x), P(b1, st[i + 1].x), P(b0, st[i].x)]
          const order = sd > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
          for (const k of order) pos.push(...v[k])
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); p.add(part, g)
    }
    band("trim", y0 - 0.1, yWater)
    band("chrome", yWater, yWater + 0.12)
    band("paint", yWater + 0.12, ySheer + 0.01)
    // deck (flat polygon over the sheer outline), transom, rub rail
    const deck: number[] = []
    for (const s of st) deck.push(s.x, s.b); for (let i = st.length - 1; i >= 0; i--) deck.push(st[i].x, -st[i].b)
    const dg = new THREE.ShapeGeometry(poly(deck)); dg.rotateX(-Math.PI / 2); dg.scale(1, 1, -1); dg.translate(0, ySheer, 0)
    { const q = dg.attributes.position as THREE.BufferAttribute; for (let i = 0; i < q.count; i += 3) { const ax = q.getX(i + 1), ay = q.getY(i + 1), az = q.getZ(i + 1); q.setXYZ(i + 1, q.getX(i + 2), q.getY(i + 2), q.getZ(i + 2)); q.setXYZ(i + 2, ax, ay, az) } dg.computeVertexNormals() }
    p.add("interior", dg)
    p.add("paint", paneX([-hb, y0 + 0.05, hb, y0 + 0.05, hb, ySheer, -hb, ySheer], -hl - 0.002, -1))
    for (const sd of [-1, 1]) for (let i = 0; i < N; i++) rod(p, "trim", new THREE.Vector3(st[i].x, ySheer + 0.02, sd * st[i].b), new THREE.Vector3(st[i + 1].x, ySheer + 0.02, sd * st[i + 1].b), 0.045, 0.045, 6)
    // wheelhouse with windows, roof, mast with a light, rails on posts, life ring holder
    const wx0 = -hl * 0.1, wx1 = hl * 0.35, wz = Math.min(hb * 0.7, 1.6), wy1 = ySheer + 1.6
    p.box("paint", wx1 - wx0, wy1 - ySheer, 2 * wz, (wx0 + wx1) / 2, (ySheer + wy1) / 2, 0, 0.08)
    for (const sd of [1, -1] as const) p.add("glass", pane([wx0 + 0.2, ySheer + 0.75, wx0 + 0.2, wy1 - 0.2, wx1 - 0.25, wy1 - 0.2, wx1 - 0.25, ySheer + 0.75], sd * (wz + 0.004), sd))
    p.add("glass", paneX([-wz + 0.15, ySheer + 0.75, wz - 0.15, ySheer + 0.75, wz - 0.15, wy1 - 0.2, -wz + 0.15, wy1 - 0.2], wx1 + 0.004, 1))
    p.box("paint", wx1 - wx0 + 0.3, 0.1, 2 * wz + 0.25, (wx0 + wx1) / 2, wy1 + 0.04, 0, 0.04)
    rod(p, "chrome", new THREE.Vector3(wx0 + 0.5, wy1, 0), new THREE.Vector3(wx0 + 0.5, wy1 + 1.6, 0), 0.05, 0.03, 8)
    p.box("lampF", 0.12, 0.1, 0.12, wx0 + 0.5, wy1 + 1.62, 0, 0.02)
    for (const sd of [-1, 1]) for (let i = 1; i < N; i += 2) {
      const a = st[i], c = st[Math.min(N, i + 2)]
      rod(p, "chrome", new THREE.Vector3(a.x, ySheer, sd * (a.b - 0.08)), new THREE.Vector3(a.x, ySheer + 0.75, sd * (a.b - 0.08)), 0.02)
      rod(p, "chrome", new THREE.Vector3(a.x, ySheer + 0.75, sd * (a.b - 0.08)), new THREE.Vector3(c.x, ySheer + 0.75, sd * (c.b - 0.08)), 0.02)
    }
    return p.build()
  })
}

// ───────────────────────────── rail wagons ─────────────────────────────
// Local frame as above (+x along the track). Wheels stand on the zone track: rail tops at y 0.26, gauge 1.435 m.

const RAIL_TOP = 0.26, RAIL_HALF = 0.7175, WHEEL_R = 0.46
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Flanged wheel pair on an axle (flanges inside the rails), axle at x. */
function wheelset(p: Parts, x: number): void {
  const r = WHEEL_R, cy = RAIL_TOP + r
  const prof = [[0.1, -0.06], [0.17, -0.04], [r - 0.03, -0.07], [r + 0.01, -0.07], [r + 0.032, -0.06], [r + 0.03, -0.045], [r + 0.004, -0.035], [r, 0.06], [r - 0.02, 0.07], [0.1, 0.07]]
    .map(([a, b]) => new THREE.Vector2(a, b))
  for (const sd of [-1, 1]) {
    const g = new THREE.LatheGeometry(prof, 22); g.rotateX(sd > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(x, cy, sd * (RAIL_HALF - 0.012))
    p.add("chrome", g)
    const hub = new THREE.CylinderGeometry(0.12, 0.13, 0.1, 12); hub.rotateX(Math.PI / 2); hub.translate(x, cy, sd * (RAIL_HALF + 0.09)); p.add("frame", hub)
  }
  rod(p, "frame", V3(x, cy, -1.0), V3(x, cy, 1.0), 0.075, 0.075, 10)
}

/** Two-axle freight bogie (Y25 style): wheelsets, cast side frames over the axle boxes, bolster, brake shoes. */
function bogie(p: Parts, x: number): void {
  const wb = 1.8, cy = RAIL_TOP + WHEEL_R
  for (const a of [-wb / 2, wb / 2]) wheelset(p, x + a)
  for (const sd of [-1, 1]) {
    const z = sd * 1.0
    const sf = extrude(poly([-1.32, 0.86, -0.72, 0.86, -0.5, 0.56, 0.5, 0.56, 0.72, 0.86, 1.32, 0.86, 1.32, 0.98, 0.66, 1.0, -0.66, 1.0, -1.32, 0.98]), 0.14, 0.015, 1)
    sf.translate(x, 0, z); p.add("frame", sf)
    for (const a of [-wb / 2, wb / 2]) {
      p.box("frame", 0.3, 0.26, 0.24, x + a, cy, z, 0.03)                                      // axle box
      p.box("trim", 0.06, 0.1, 0.18, x + a + Math.sign(a) * 0.17, cy - 0.02, z + sd * 0.03, 0.01)  // box cover
      for (const e of [-1, 1]) p.box("frame", 0.07, 0.26, 0.1, x + a + e * (WHEEL_R + 0.05), cy - 0.04, sd * RAIL_HALF, 0.01)  // brake shoes
    }
    for (const e of [-1, 1]) rod(p, "frame", V3(x + e * (wb / 2 - WHEEL_R - 0.08), cy - 0.04, -RAIL_HALF), V3(x + e * (wb / 2 - WHEEL_R - 0.08), cy - 0.04, RAIL_HALF), 0.035, 0.035, 6)
    // damper and spring nest visible in the frame window
    for (const dz of [-0.04, 0.04]) rod(p, "chrome", V3(x - 0.12 + dz * 3, 0.6, z + dz), V3(x - 0.12 + dz * 3, 0.84, z + dz), 0.05, 0.05, 8)
  }
  p.box("frame", 0.5, 0.22, 2.08, x, 0.75, 0, 0.03)                                               // bolster
  const pivot = new THREE.CylinderGeometry(0.3, 0.32, 0.12, 16); pivot.translate(x, 0.9, 0); p.add("frame", pivot)
}

/** Side and centre sills, headstocks, side buffers, screw couplings and corner steps for a wagon body ending at ±he. */
function underframe(p: Parts, hl: number, he: number, hw: number, y: number): void {
  for (const sd of [-1, 1]) p.box("frame", 2 * he, 0.3, 0.1, 0, y + 0.15, sd * (hw - 0.05))
  p.box("frame", 2 * he - 0.4, 0.26, 0.36, 0, y + 0.13, 0)
  for (let x = -he + 1.2; x < he - 1; x += 1.6) p.box("frame", 0.12, 0.2, 2 * hw - 0.2, x, y + 0.14, 0)
  for (const e of [-1, 1]) {
    const xe = e * he
    p.box("trim", 0.2, 0.42, 2 * hw, xe - e * 0.1, y + 0.17, 0, 0.02)                               // headstock
    for (const sd of [-1, 1]) {
      const z = sd * 0.875, by = 1.06
      p.box("frame", 0.05, 0.38, 0.38, xe + e * 0.02, by, z, 0.01)                                  // buffer base plate
      rod(p, "frame", V3(xe, by, z), V3(xe + e * (hl - he - 0.02), by, z), 0.13, 0.12, 14)          // housing
      rod(p, "chrome", V3(xe + e * (hl - he - 0.04), by, z), V3(xe + e * (hl - he + 0.08), by, z), 0.085, 0.085, 12)  // plunger
      const head = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20); head.rotateZ(Math.PI / 2); head.translate(xe + e * (hl - he + 0.1), by, z); p.add("chrome", head)
      // corner step and grab handle
      p.box("frame", 0.36, 0.03, 0.22, xe - e * 0.3, 0.55, sd * (hw - 0.02))
      for (const dx of [-0.16, 0.16]) rod(p, "frame", V3(xe - e * 0.3 + dx, 0.55, sd * (hw - 0.02)), V3(xe - e * 0.3 + dx, y + 0.02, sd * (hw - 0.02)), 0.015, 0.015, 5)
      rod(p, "chrome", V3(xe + e * 0.05, 1.45, sd * (hw - 0.12)), V3(xe + e * 0.05, 2.25, sd * (hw - 0.12)), 0.018, 0.018, 6)
    }
    // draw hook and the screw coupling hanging from it
    p.box("frame", 0.16, 0.12, 0.08, xe + e * (hl - he + 0.05), 1.06, 0, 0.02)
    rod(p, "frame", V3(xe + e * (hl - he + 0.1), 1.02, -0.05), V3(xe + e * (hl - he + 0.16), 0.66, -0.05), 0.02, 0.02, 6)
    rod(p, "frame", V3(xe + e * (hl - he + 0.1), 1.02, 0.05), V3(xe + e * (hl - he + 0.16), 0.66, 0.05), 0.02, 0.02, 6)
    rod(p, "chrome", V3(xe + e * (hl - he + 0.13), 0.84, -0.09), V3(xe + e * (hl - he + 0.13), 0.84, 0.09), 0.025, 0.025, 6)
  }
}

/** Vertical ladder of two stringers and rungs, from y0 to y1 at (x, z), rungs across `across` ("x" or "z"). */
function ladder(p: Parts, part: VehiclePart, x: number, z: number, y0: number, y1: number, across: "x" | "z", w = 0.4): void {
  const ax = across === "x" ? w / 2 : 0, az = across === "z" ? w / 2 : 0
  for (const s of [-1, 1]) rod(p, part, V3(x + s * ax, y0, z + s * az), V3(x + s * ax, y1, z + s * az), 0.02, 0.02, 6)
  for (let y = y0 + 0.2; y < y1 - 0.05; y += 0.3) rod(p, part, V3(x - ax, y, z - az), V3(x + ax, y, z + az), 0.014, 0.014, 5)
}

/** Hand-brake wheel facing along x (ring, spokes, hub) at (x, y, z). */
function brakeWheel(p: Parts, x: number, y: number, z: number, r = 0.22): void {
  const ring = new THREE.TorusGeometry(r, 0.02, 6, 20); ring.rotateY(Math.PI / 2); ring.translate(x, y, z); p.add("frame", ring)
  for (let i = 0; i < 3; i++) p.add("frame", new THREE.BoxGeometry(0.02, 2 * r, 0.025).rotateX(i * Math.PI / 3).translate(x, y, z))
  const hub = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8); hub.rotateZ(Math.PI / 2); hub.translate(x - 0.03, y, z); p.add("frame", hub)
}

/** Covered goods wagon (Gbs style): ribbed steel walls, sliding doors with rails, corrugated ends, arched roof. */
export function boxcarGeometry(L: number): VehicleGeo {
  return cached(`boxcar:${L.toFixed(1)}`, () => {
    const p = new Parts(), hl = L / 2, he = hl - 0.22, bw = 1.42, yb = 1.22, yt = 3.78
    const bc = Math.min(hl - 2.4, 4.6)
    bogie(p, -bc); bogie(p, bc)
    underframe(p, hl, he, 1.47, 0.95)
    // body box, top chord, side stanchions (not behind the doors)
    p.box("paint", 2 * he, yt - yb, 2 * bw, 0, (yb + yt) / 2, 0)
    for (const sd of [-1, 1]) {
      p.box("frame", 2 * he, 0.09, 0.05, 0, yt - 0.05, sd * (bw + 0.02))
      p.box("frame", 2 * he, 0.07, 0.05, 0, yb + 0.03, sd * (bw + 0.02))
      const n = Math.round(2 * he / 0.95)
      for (let i = 0; i <= n; i++) {
        const x = -he + 0.04 + i * (2 * he - 0.08) / n
        if (Math.abs(x) < 1.62) continue
        p.box("paint", 0.08, yt - yb - 0.1, 0.05, x, (yb + yt) / 2, sd * (bw + 0.025))
      }
      // sliding door: panel, stiffeners, rails above and below, handle and locking bar
      const zd = sd * (bw + 0.07)
      p.box("paint", 3.0, yt - yb - 0.2, 0.03, 0, (yb + yt) / 2 - 0.02, zd)
      for (const x of [-1.2, -0.4, 0.4, 1.2]) p.box("paint", 0.1, yt - yb - 0.3, 0.03, x, (yb + yt) / 2 - 0.02, zd + sd * 0.025)
      for (const x of [-1.48, 1.48]) p.box("paint", 0.06, yt - yb - 0.2, 0.04, x, (yb + yt) / 2 - 0.02, zd + sd * 0.02)
      p.box("frame", 6.4, 0.1, 0.07, 0, yt - 0.14, sd * (bw + 0.05))
      p.box("frame", 6.4, 0.06, 0.06, 0, yb + 0.07, sd * (bw + 0.05))
      rod(p, "chrome", V3(1.32, 1.85, zd + sd * 0.07), V3(1.32, 2.55, zd + sd * 0.07), 0.02, 0.02, 6)
      for (const y of [1.88, 2.52]) rod(p, "chrome", V3(1.32, y, zd + sd * 0.02), V3(1.32, y, zd + sd * 0.07), 0.012, 0.012, 4)
      rod(p, "frame", V3(1.5, 2.2, zd + sd * 0.04), V3(1.75, 2.2, zd + sd * 0.04), 0.025, 0.025, 6)
      // placard holder and vents high up near the ends
      for (const e of [-1, 1]) p.box("trim", 0.5, 0.22, 0.02, e * (he - 0.8), yt - 0.45, sd * (bw + 0.012))
    }
    // ends: corrugations, corner posts, ladder, hand-brake wheel on one end
    for (const e of [-1, 1]) {
      const xe = e * (he + 0.015)
      for (let y = yb + 0.3; y < yt - 0.2; y += 0.34) p.box("paint", 0.04, 0.14, 2 * bw - 0.36, xe, y, 0, 0.015)
      for (const sd of [-1, 1]) p.box("frame", 0.07, yt - yb, 0.1, xe, (yb + yt) / 2, sd * (bw - 0.04))
      ladder(p, "frame", e * (he + 0.09), bw - 0.42, 1.05, yt + 0.05, "z", 0.36)
      if (e > 0) brakeWheel(p, he + 0.1, 2.05, -0.55)
    }
    // arched roof with overhang and gutters
    const rs = new THREE.Shape(), rw = bw + 0.08
    rs.moveTo(-rw, yt - 0.02); rs.quadraticCurveTo(0, yt + 0.56, rw, yt - 0.02); rs.lineTo(rw, yt - 0.07); rs.quadraticCurveTo(0, yt + 0.5, -rw, yt - 0.07); rs.closePath()
    const roof = new THREE.ExtrudeGeometry(rs, { depth: 2 * he + 0.12, bevelEnabled: false, curveSegments: 14 })
    roof.rotateY(Math.PI / 2); roof.translate(-he - 0.06, 0, 0); p.add("roof", roof)
    for (const sd of [-1, 1]) p.box("roof", 2 * he + 0.12, 0.05, 0.05, 0, yt - 0.06, sd * (rw + 0.01))
    return p.build(["paint", "roof"])
  })
}

/** Open hopper wagon (Fals style) loaded with gravel: sloped ends over the bogies, central chute, posts, heaped load. */
export function hopperWagonGeometry(L: number): VehicleGeo {
  return cached(`hopperwagon:${L.toFixed(1)}`, () => {
    const p = new Parts(), hl = L / 2, he = hl - 0.2, bw = 1.36, yt = 3.55, ys = he - 1.35
    const bottom = (x: number) => { const a = Math.abs(x); return a > ys ? 1.3 + (a - ys) / 1.35 * 1.0 : a > 1.25 ? 1.3 : a > 0.45 ? 0.62 + (a - 0.45) / 0.8 * 0.68 : 0.62 }
    const bc = Math.min(hl - 2.0, 4.0)
    bogie(p, -bc); bogie(p, bc)
    underframe(p, hl, he, 1.42, 0.92)
    p.add("paint", extrude(poly([-he, yt, he, yt, he, 2.3, ys, 1.3, 1.25, 1.3, 0.45, 0.62, -0.45, 0.62, -1.25, 1.3, -ys, 1.3, -he, 2.3]), 2 * bw, 0.03, 1))
    // rim around the open top, posts down the sides following the hopper profile
    for (const sd of [-1, 1]) {
      p.box("frame", 2 * he + 0.06, 0.16, 0.08, 0, yt + 0.06, sd * (bw - 0.02))
      p.box("frame", 0.08, 0.16, 2 * bw, sd * (he - 0.02), yt + 0.06, 0)
      const n = Math.round(2 * he / 1.05)
      for (let i = 0; i <= n; i++) {
        const x = -he + 0.05 + i * (2 * he - 0.1) / n, y0 = bottom(x) + 0.02
        p.box("paint", 0.1, yt - y0 + 0.08, 0.05, x, (y0 + yt + 0.08) / 2, sd * (bw + 0.025))
      }
      p.box("frame", 2 * he, 0.08, 0.05, 0, 2.3, sd * (bw + 0.05))
      // chute door levers
      rod(p, "chrome", V3(-0.6, 0.95, sd * (bw + 0.08)), V3(0.6, 0.75, sd * (bw + 0.08)), 0.025, 0.025, 6)
    }
    p.box("frame", 0.9, 0.08, 2 * bw - 0.2, 0, 0.6, 0, 0.02)
    for (const e of [-1, 1]) {
      ladder(p, "frame", e * (he + 0.07), -(bw - 0.4), 1.05, yt + 0.12, "z", 0.36)
      brakeWheel(p, e * (he + 0.08), 1.9, 0.5, 0.2)
    }
    // load: gravel level inside the rim with three cones where the chute dropped it
    p.box("load", 2 * he - 0.12, 0.08, 2 * bw - 0.12, 0, yt + 0.02, 0)
    for (const x of [-(he - 1.8), 0, he - 1.8]) {
      const h = new THREE.LatheGeometry([[1, 0], [0.82, 0.12], [0.45, 0.36], [0.18, 0.48], [0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 14)
      h.scale(1.6, 1, 1.28); h.translate(x, yt + 0.02, 0); p.add("load", h)
    }
    return p.build(["paint", "load"])
  })
}

/** Tank wagon: barrel with dished heads, bands, saddles, dome with walkway and railings, side ladders, bottom valve. */
export function tankWagonGeometry(L: number): VehicleGeo {
  return cached(`tankwagon:${L.toFixed(1)}`, () => {
    const p = new Parts(), hl = L / 2, he = hl - 0.25, R = 1.3, cy = 2.3, head = 0.42, bl = he - head
    const bc = Math.min(hl - 2.2, 4.4)
    bogie(p, -bc); bogie(p, bc)
    underframe(p, hl, he, 1.3, 0.92)
    const barrel = new THREE.CylinderGeometry(R, R, 2 * bl, 32, 1, true); barrel.rotateZ(Math.PI / 2); barrel.translate(0, cy, 0); p.add("paint", barrel)
    for (const e of [-1, 1]) {
      const h = new THREE.SphereGeometry(R, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2); h.scale(1, head / R, 1); h.rotateZ(-e * Math.PI / 2); h.translate(e * bl, cy, 0); p.add("paint", h)
      const ring = new THREE.CylinderGeometry(R + 0.015, R + 0.015, 0.08, 32, 1, true); ring.rotateZ(Math.PI / 2); ring.translate(e * (bl - 0.02), cy, 0); p.add("trim", ring)
      // saddle on the underframe over each bogie
      p.box("frame", 0.35, cy - R * 0.55 - 1.15, 2.0, e * bc, (cy - R * 0.55 + 1.15) / 2, 0)
      ladder(p, "frame", e * (he + 0.05), 0.0, 1.1, 1.9, "z", 0.4)
    }
    for (const x of [-bl * 0.5, bl * 0.5]) { const b = new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.07, 32, 1, true); b.rotateZ(Math.PI / 2); b.translate(x, cy, 0); p.add("trim", b) }
    // dome, lid and safety valve on top
    const top = cy + R
    const dome = new THREE.CylinderGeometry(0.42, 0.46, 0.36, 20); dome.translate(0, top + 0.1, 0); p.add("paint", dome)
    const lid = new THREE.CylinderGeometry(0.44, 0.44, 0.05, 20); lid.translate(0, top + 0.3, 0); p.add("frame", lid)
    rod(p, "chrome", V3(0.6, top - 0.02, 0.3), V3(0.6, top + 0.25, 0.3), 0.06, 0.05, 8)
    // walkway gratings either side of the dome, brackets, railings, side ladders up to it
    for (const sd of [-1, 1]) {
      const zc = sd * 0.72, yw = top - 0.08
      p.box("frame", 2.4, 0.04, 0.5, 0, yw, zc)
      for (const x of [-1.0, 1.0]) rod(p, "frame", V3(x, yw, zc + sd * 0.2), V3(x, cy + Math.sqrt(R * R - 0.95 * 0.95) - 0.03, sd * 0.95), 0.025, 0.025, 6)
      for (const x of [-1.15, 0, 1.15]) rod(p, "chrome", V3(x, yw, sd * 0.96), V3(x, yw + 0.95, sd * 0.96), 0.018, 0.018, 6)
      rod(p, "chrome", V3(-1.15, yw + 0.95, sd * 0.96), V3(1.15, yw + 0.95, sd * 0.96), 0.02, 0.02, 6)
      rod(p, "chrome", V3(-1.15, yw + 0.5, sd * 0.96), V3(1.15, yw + 0.5, sd * 0.96), 0.015, 0.015, 6)
      ladder(p, "frame", 1.55, sd * (R + 0.08), 1.1, cy + 0.15, "x", 0.42)
      for (const x of [1.34, 1.76]) rod(p, "frame", V3(x, cy + 0.15, sd * (R + 0.08)), V3(x - 0.2, yw, sd * 0.95), 0.02, 0.02, 6)
    }
    // bottom outlet valve with cap and wheel
    rod(p, "frame", V3(0, cy - R + 0.05, 0), V3(0, 1.0, 0), 0.1, 0.09, 10)
    rod(p, "frame", V3(0, 1.06, 0), V3(0, 1.06, 0.55), 0.08, 0.08, 10)
    const cap = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12); cap.rotateX(Math.PI / 2); cap.translate(0, 1.06, 0.58); p.add("trim", cap)
    return p.build(["paint"])
  })
}

/**
 * Counterbalance forklift, length L over the forks (+x = forks). Rounded chassis with the counterweight at the back,
 * overhead guard, seat and steering wheel, two-stage mast with carriage, backrest and forks, tilt cylinders.
 */
export function forkliftGeometry(L: number): VehicleGeo {
  return cached(`forklift:${L.toFixed(1)}`, () => {
    const p = new Parts(), hl = L / 2, xb = -hl, xm = hl - 0.72, hw = 0.55
    // chassis side profile: low nose under the mast, deck, rounded counterweight
    p.add("paint", extrude(poly([xb + 0.1, 0.22, xm - 0.05, 0.22, xm, 0.35, xm, 0.78, xm - 0.25, 0.95, xb + 0.55, 0.95, xb + 0.35, 1.05, xb + 0.05, 1.05, xb, 0.9, xb, 0.35]), 2 * hw, 0.04, 2))
    p.box("paint", 0.42, 0.5, 2 * hw + 0.04, xb + 0.24, 1.15, 0, 0.08)                               // counterweight top
    p.box("trim", 0.06, 0.12, 0.5, xb - 0.01, 0.6, 0, 0.02)                                            // tow pin housing
    // wheels: big drive wheels at the front, small steer wheels at the back
    for (const sd of [-1, 1]) { wheel(p, 0.33, 0.24, xm - 0.32, 0.33, sd * (hw - 0.06)); wheel(p, 0.24, 0.18, xb + 0.42, 0.24, sd * (hw - 0.08)) }
    // seat, steering column and wheel, levers
    p.box("rubber", 0.42, 0.1, 0.48, xb + 0.85, 1.05, 0, 0.04)
    p.box("rubber", 0.1, 0.45, 0.46, xb + 0.62, 1.3, 0, 0.04)
    rod(p, "trim", V3(xm - 0.3, 0.95, 0), V3(xm - 0.45, 1.4, 0), 0.03, 0.03, 8)
    const sw = new THREE.TorusGeometry(0.17, 0.018, 6, 16); sw.rotateX(Math.PI / 2); sw.rotateZ(-0.5); sw.translate(xm - 0.47, 1.44, 0); p.add("rubber", sw)
    for (const z of [0.12, 0.2, 0.28]) rod(p, "trim", V3(xm - 0.22, 0.95, z), V3(xm - 0.3, 1.25, z), 0.012, 0.012, 5)
    // overhead guard on four posts
    const g0 = xb + 0.45, g1 = xm - 0.12, gy = 2.12
    for (const x of [g0, g1]) for (const sd of [-1, 1]) rod(p, "trim", V3(x, 0.95, sd * (hw - 0.06)), V3(x + (x === g1 ? -0.05 : 0), gy, sd * (hw - 0.06)), 0.035, 0.035, 8)
    for (const sd of [-1, 1]) p.box("trim", g1 - g0 + 0.1, 0.06, 0.06, (g0 + g1) / 2, gy, sd * (hw - 0.06))
    for (let i = 0; i < 6; i++) p.box("trim", 0.05, 0.04, 2 * hw - 0.1, g0 + i * (g1 - g0) / 5, gy + 0.02, 0)
    p.box("lampF", 0.05, 0.09, 0.12, g1 + 0.01, gy - 0.12, hw - 0.06, 0.01)
    p.box("lampF", 0.05, 0.09, 0.12, g1 + 0.01, gy - 0.12, -hw + 0.06, 0.01)
    const beacon = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10); beacon.translate(g0 + 0.1, gy + 0.09, 0); p.add("lampR", beacon)
    // mast: two channels with cross ties, inner stage, chains; tilt cylinders from the chassis
    const xmast = xm + 0.08
    for (const sd of [-1, 1]) {
      p.box("trim", 0.1, 2.0, 0.08, xmast, 1.05, sd * 0.34)
      p.box("trim", 0.08, 1.7, 0.06, xmast + 0.06, 1.15, sd * 0.26)
      p.box("rubber", 0.02, 1.6, 0.03, xmast + 0.1, 1.05, sd * 0.12)
      rod(p, "chrome", V3(xm - 0.3, 0.75, sd * (hw - 0.12)), V3(xmast - 0.05, 1.2, sd * 0.38), 0.035, 0.03, 8)
    }
    for (const y of [0.25, 1.15, 2.0]) p.box("trim", 0.06, 0.08, 0.76, xmast, y, 0)
    // carriage, backrest grid and forks
    const xc = xmast + 0.14
    p.box("trim", 0.06, 0.42, 0.95, xc, 0.42, 0)
    for (let i = 0; i < 6; i++) p.box("trim", 0.03, 0.55, 0.03, xc, 0.9, -0.4 + i * 0.16)
    p.box("trim", 0.04, 0.04, 0.95, xc, 1.17, 0)
    for (const sd of [-1, 1]) {
      p.box("chrome", 0.05, 0.6, 0.1, xc + 0.04, 0.42, sd * 0.3)
      p.box("chrome", hl - xc - 0.02, 0.05, 0.1, (xc + hl) / 2 + 0.02, 0.14, sd * 0.3)
    }
    return p.build(["paint"])
  })
}

// ───────────────────────────── conveyor plant ─────────────────────────────

/**
 * Inclined belt conveyor gallery, centred at the origin along +z (length len): two lattice side trusses, troughed
 * idler stations with the loaded belt on top, return belt and rollers underneath, walkway with handrails on +x.
 * Slots: frame (steel), paint (yellow trusses), rubber (belt), chrome (rollers), load (gravel on the belt).
 */
export function conveyorGeometry(len: number): VehicleGeo {
  return cached(`conveyor:${len.toFixed(1)}`, () => {
    const p = new Parts(), hz = len / 2, hw = 0.7, yb = -0.5, yt = 0.35, step = 2.0
    const n = Math.max(2, Math.round(len / step)), dz = len / n
    for (const sd of [-1, 1]) {
      // chords and the lattice between them
      for (const y of [yb, yt]) p.box("paint", 0.09, 0.09, len, sd * hw, y, 0)
      for (let i = 0; i <= n; i++) {
        const z = -hz + i * dz
        rod(p, "paint", V3(sd * hw, yb, z), V3(sd * hw, yt, z), 0.035, 0.035, 5)
        if (i < n) { const up = i % 2 === 0; rod(p, "paint", V3(sd * hw, up ? yb : yt, z), V3(sd * hw, up ? yt : yb, z + dz), 0.028, 0.028, 5) }
      }
    }
    // cross members, bottom bracing
    for (let i = 0; i <= n; i++) {
      const z = -hz + i * dz
      p.box("paint", 2 * hw, 0.07, 0.07, 0, yb, z)
      if (i < n) rod(p, "frame", V3(-hw, yb, z), V3(hw, yb, z + dz), 0.02, 0.02, 4)
    }
    // troughed idler stations and the belt (flat centre, wings at 30°), load ridge on top
    const wing = 0.32, ang = 0.52, yi = yt + 0.12
    for (let z = -hz + 0.6; z < hz - 0.3; z += 1.2) {
      p.box("frame", 1.2, 0.05, 0.06, 0, yt + 0.02, z)
      for (const [cx, cy, a] of [[0, yi, 0], [-(0.2 + Math.cos(ang) * wing / 2), yi + Math.sin(ang) * wing / 2, -ang], [0.2 + Math.cos(ang) * wing / 2, yi + Math.sin(ang) * wing / 2, ang]] as const) {
        const r = new THREE.CylinderGeometry(0.06, 0.06, a === 0 ? 0.38 : wing, 10); r.rotateZ(Math.PI / 2 + a); r.translate(cx, cy, z); p.add("chrome", r)
      }
      const ret = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8); ret.rotateZ(Math.PI / 2); ret.translate(0, yb + 0.12, z + 0.6); p.add("chrome", ret)
    }
    const yBelt = yi + 0.065
    p.box("rubber", 0.4, 0.02, len, 0, yBelt, 0)
    for (const sd of [-1, 1]) {
      const g = new THREE.BoxGeometry(wing + 0.02, 0.02, len); g.rotateZ(sd * ang); g.translate(sd * (0.2 + Math.cos(ang) * (wing + 0.02) / 2), yBelt + Math.sin(ang) * (wing + 0.02) / 2, 0); p.add("rubber", g)
    }
    p.box("rubber", 0.9, 0.015, len, 0, yb + 0.19, 0)
    const ridge = new THREE.CylinderGeometry(0.22, 0.22, len - 0.4, 10, 1, false, -Math.PI / 2, Math.PI)
    ridge.rotateX(-Math.PI / 2); ridge.scale(1, 0.55, 1); ridge.translate(0, yBelt + 0.04, 0)
    p.add("load", ridge)
    // walkway grating on +x with posts and two handrails
    const xw = hw + 0.42
    p.box("frame", 0.7, 0.04, len, xw - 0.3, yb + 0.02, 0)
    for (let i = 0; i <= n; i++) {
      const z = -hz + i * dz
      rod(p, "frame", V3(hw, yb, z), V3(xw + 0.05, yb, z), 0.025, 0.025, 4)
      rod(p, "chrome", V3(xw + 0.05, yb, z), V3(xw + 0.05, yb + 1.05, z), 0.02, 0.02, 5)
    }
    for (const y of [0.55, 1.05]) p.box("chrome", 0.04, 0.04, len, xw + 0.05, yb + y, 0)
    return p.build(["paint", "rubber", "load"])
  })
}

/** A-frame trestle under a conveyor: two splayed legs from the ground to height h, a top beam and cross bracing. */
export function trestleGeometry(h: number): VehicleGeo {
  return cached(`trestle:${h.toFixed(1)}`, () => {
    const p = new Parts(), top = 0.75, base = 0.75 + h * 0.08
    for (const sd of [-1, 1]) {
      rod(p, "paint", V3(sd * base, 0, 0), V3(sd * top, h, 0), 0.11, 0.09, 6)
      const foot = new THREE.BoxGeometry(0.5, 0.3, 0.5); foot.translate(sd * base, 0.15, 0); p.add("frame", foot)
    }
    p.box("paint", 2 * top + 0.4, 0.22, 0.25, 0, h - 0.1, 0)
    const rungs = Math.max(1, Math.floor(h / 3))
    for (let i = 1; i <= rungs; i++) {
      const y0 = (i - 1) * h / (rungs + 0.4) + 0.4, y1 = i * h / (rungs + 0.4) + 0.4, w = (y: number) => base + (top - base) * y / h
      p.box("paint", 2 * w(y1), 0.1, 0.1, 0, y1, 0)
      rod(p, "frame", V3(-w(y0), y0, 0), V3(w(y1), y1, 0), 0.03, 0.03, 4)
      rod(p, "frame", V3(w(y0), y0, 0), V3(-w(y1), y1, 0), 0.03, 0.03, 4)
    }
    return p.build()
  })
}

export function disposeHeavyTemplates(): void {
  for (const g of heavyCache.values()) for (const x of Object.values(g)) x?.dispose()
  heavyCache.clear()
}
