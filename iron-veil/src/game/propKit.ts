/**
 * propKit.ts — builds detailed props (containers, airdrops, thrown items) as ONE merged, vertex-coloured geometry, so a
 * prop with dozens of parts still costs one draw call (and stays instanceable). Colours are sRGB hex values; the
 * material must have vertexColors enabled and a white base colour (see propMaterial).
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color()

export class Shape {
  private parts: THREE.BufferGeometry[] = []

  /** Adds a geometry rotated by (rx, ry, rz) and moved to (x, y, z), filled with one colour. */
  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)))
    if (x || y || z) g.translate(x, y, z)
    const ng = g.index ? g.toNonIndexed() : g
    if (ng !== g) g.dispose()
    if (ng.attributes.uv) ng.deleteAttribute("uv")
    const n = ng.attributes.position.count, a = new Float32Array(n * 3)
    _c.set(color)
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b }
    ng.setAttribute("color", new THREE.BufferAttribute(a, 3))
    this.parts.push(ng)
    return this
  }
  /** Box centred at (x, y, z); r > 0 bevels the edges. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, r = 0, rx = 0, ry = 0, rz = 0): this {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.99) : new THREE.BoxGeometry(w, h, d)
    return this.add(g, color, x, y, z, rx, ry, rz)
  }
  /** Cylinder along +Y (rotate to lay it down), centred at (x, y, z). */
  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: number, seg = 10, rx = 0, ry = 0, rz = 0, open = false): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open), color, x, y, z, rx, ry, rz)
  }
  /** Torus in the XY plane (axis +Z); arc < 2π gives a handle loop. */
  torus(radius: number, tube: number, x: number, y: number, z: number, color: number, arc = Math.PI * 2, rx = 0, ry = 0, rz = 0, seg = 10): this {
    return this.add(new THREE.TorusGeometry(radius, tube, 5, seg, arc), color, x, y, z, rx, ry, rz)
  }
  /** Ellipsoid. */
  ball(r: number, x: number, y: number, z: number, color: number, sx = 1, sy = 1, sz = 1, seg = 8): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))).scale(sx, sy, sz), color, x, y, z)
  }
  /** Thin rod from a to b (lines, struts, risers). */
  strut(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: number, seg = 4): this {
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az), len = d.length()
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
    return this.add(g, color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
  }
  /** Bevelled outline prism: a 2D shape (x, y) extruded along +Z by depth, centred on z. */
  prism(points: [number, number][], depth: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0): this {
    const s = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py)))
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2)
    return this.add(g, color, x, y, z, rx, ry, rz)
  }
  /** Merges everything into one geometry (the parts are consumed) and moves it by (-ox, -oy, -oz). */
  build(ox = 0, oy = 0, oz = 0): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!
    for (const p of this.parts) p.dispose()
    this.parts = []
    if (ox || oy || oz) g.translate(-ox, -oy, -oz)
    g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }
}

/** Standard material for Shape geometry. */
export function propMaterial(roughness = 0.7, metalness = 0.15, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness, ...extra })
}
