/**
 * meshkit.ts — static geometry batching and cheap light effects for world.ts.
 *  - GeoBatch: collects boxes/quads (world-scaled UVs in metres, vertex-colour tint + ground AO) and arbitrary
 *    geometries, then merges everything per material into ONE BufferGeometry (mergeGeometries).
 *  - GlowBatch / PoolBatch / ConeBatch: additive billboards, ground light pools and light shafts merged into one draw
 *    call each; flicker/blink runs in the vertex shader (uniform `time`), so update() never touches buffers.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

/** Face bits for BoxOpts.skip. */
export const PX = 1, NX = 2, PY = 4, NY = 8, PZ = 16, NZ = 32

export interface BoxOpts {
  /** Tint (hex or Color, linear). Default white. */
  color?: number | THREE.Color
  /** UVs relative to the box corner (one texture tile per object face) instead of world coordinates. */
  local?: boolean
  /** Darkening at the ground contact (0..1). */
  ao?: number
  /** Faces to leave out (PX | NY ...). */
  skip?: number
  /** Rotation around Y about the box centre (forces local UVs). */
  rotY?: number
  /** Separate tint for the top face. */
  top?: number | THREE.Color
}

const tmpC = new THREE.Color(), tmpTop = new THREE.Color()
/** Colour with the hex components taken as-is (for shaders that write display values directly). */
export function raw(hex: number): THREE.Color { return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace) }

export class GeoBatch {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = []
  extras: THREE.BufferGeometry[] = []

  get empty(): boolean { return this.pos.length === 0 && this.extras.length === 0 }

  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, c: THREE.Color, k: number): void {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, w); this.col.push(c.r * k, c.g * k, c.b * k)
  }

  /** Quad a-b-c-d counter-clockwise seen from the front; per-corner shade factors. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[], color: THREE.Color, shade: number[] = [1, 1, 1, 1]): void {
    const i = this.pos.length / 3
    this.v(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], color, shade[0])
    this.v(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[3], color, shade[1])
    this.v(c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5], color, shade[2])
    this.v(d[0], d[1], d[2], n[0], n[1], n[2], uv[6], uv[7], color, shade[3])
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }

  /** Horizontal quad (upward normal) from corners, world UVs (u = x, v = -z). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.Color, shade: number[] = [1, 1, 1, 1]): void {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0, -z1, x1, -z1, x1, -z0, x0, -z0], color, shade)
  }

  /** Axis-aligned (or Y-rotated) box with metre UVs, tint and ground AO. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts = {}): void {
    const color = o.color === undefined ? tmpC.setRGB(1, 1, 1) : typeof o.color === "number" ? tmpC.setHex(o.color) : tmpC.copy(o.color)
    const top = o.top === undefined ? tmpTop.copy(color) : typeof o.top === "number" ? tmpTop.setHex(o.top) : tmpTop.copy(o.top)
    const skip = o.skip ?? 0, ao = o.ao ?? 0.28, rot = o.rotY ?? 0, local = o.local || rot !== 0
    const start = this.pos.length / 3
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    const W = x1 - x0, D = z1 - z0
    const rows = y0 < 0.05 && y1 - y0 > 2.2 ? [y0, y0 + 1.1, y1] : [y0, y1]
    const sh = (y: number) => (y0 < 0.05 && y === y0 ? 1 - ao : 1)
    const vy = (y: number) => (local ? y - y0 : y)
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r], yb = rows[r + 1], sa = sh(ya), sb = sh(yb)
      // +X: u = -z ; -X: u = z ; +Z: u = x ; -Z: u = -x
      if (!(skip & PX)) this.quad([x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], [1, 0, 0], local ? [0, vy(ya), D, vy(ya), D, vy(yb), 0, vy(yb)] : [-z1, ya, -z0, ya, -z0, yb, -z1, yb], color, [sa, sa, sb, sb])
      if (!(skip & NX)) this.quad([x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], [-1, 0, 0], local ? [0, vy(ya), D, vy(ya), D, vy(yb), 0, vy(yb)] : [z0, ya, z1, ya, z1, yb, z0, yb], color, [sa, sa, sb, sb])
      if (!(skip & PZ)) this.quad([x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], [0, 0, 1], local ? [0, vy(ya), W, vy(ya), W, vy(yb), 0, vy(yb)] : [x0, ya, x1, ya, x1, yb, x0, yb], color, [sa, sa, sb, sb])
      if (!(skip & NZ)) this.quad([x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], [0, 0, -1], local ? [0, vy(ya), W, vy(ya), W, vy(yb), 0, vy(yb)] : [-x1, ya, -x0, ya, -x0, yb, -x1, yb], color, [sa, sa, sb, sb])
    }
    if (!(skip & PY)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], local ? [0, 0, W, 0, W, D, 0, D] : [x0, -z1, x1, -z1, x1, -z0, x0, -z0], top)
    if (!(skip & NY)) this.quad([x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [0, -1, 0], [-x1, -z1, -x0, -z1, -x0, -z0, -x1, -z0], color, [0.9, 0.9, 0.9, 0.9])
    if (rot !== 0) {
      const c = Math.cos(rot), s = Math.sin(rot)
      for (let i = start; i < this.pos.length / 3; i++) {
        const px = this.pos[i * 3] - cx, pz = this.pos[i * 3 + 2] - cz
        this.pos[i * 3] = cx + px * c + pz * s; this.pos[i * 3 + 2] = cz - px * s + pz * c
        const nx = this.nor[i * 3], nz = this.nor[i * 3 + 2]
        this.nor[i * 3] = nx * c + nz * s; this.nor[i * 3 + 2] = -nx * s + nz * c
      }
    }
  }

  /** Adds an arbitrary geometry transformed by `m`, tinted; UVs are multiplied by uvScale. */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: number | THREE.Color = 0xffffff, uvScale: [number, number] = [1, 1]): void {
    const g = (geo.index ? geo.clone() : geo.clone()).applyMatrix4(m)
    if (!g.index) { const n = g.attributes.position.count; g.setIndex(Array.from({ length: n }, (_, i) => i)) }
    const n = g.attributes.position.count
    const c = typeof color === "number" ? new THREE.Color(color) : color
    const cols = new Float32Array(n * 3); for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3))
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    else if (uvScale[0] !== 1 || uvScale[1] !== 1) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]) }
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.normal) g.computeVertexNormals()
    g.morphAttributes = {}; g.clearGroups()
    this.extras.push(g)
  }

  build(): THREE.BufferGeometry | null {
    const parts: THREE.BufferGeometry[] = []
    if (this.pos.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3))
      g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3))
      g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2))
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3))
      g.setIndex(this.idx)
      parts.push(g)
    }
    parts.push(...this.extras)
    if (!parts.length) return null
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
    if (parts.length > 1) for (const p of parts) p.dispose()
    if (merged) merged.computeBoundingSphere()
    return merged
  }
}

/** Shared uniforms for all effect shaders (time + fog). */
export interface FxUniforms { time: { value: number }; fogNear: { value: number }; fogFar: { value: number } }

// ---------------------------------------------------------------------------------------------------------------
// Glow billboards (lamp heads, beacons, windows far away). flick: [mode, speed, phase]
// mode 0 = steady, 0..1 = flicker amount, 2 = strobe, 3 = slow blink.
// ---------------------------------------------------------------------------------------------------------------
export class GlowBatch {
  private p: number[] = []; private corner: number[] = []; private size: number[] = []; private col: number[] = []; private fl: number[] = []; private idx: number[] = []
  add(x: number, y: number, z: number, size: number, color: THREE.Color | number, intensity = 1, flick: [number, number, number] = [0, 0, 0]): void {
    const c = typeof color === "number" ? raw(color) : color
    const i = this.p.length / 3
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.p.push(x, y, z); this.corner.push(cx, cy); this.size.push(size); this.col.push(c.r * intensity, c.g * intensity, c.b * intensity); this.fl.push(...flick)
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  get count(): number { return this.p.length / 12 }
  build(u: FxUniforms, opts: { fog?: boolean; grow?: number } = {}): THREE.Mesh | null {
    if (!this.p.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute("corner", new THREE.Float32BufferAttribute(this.corner, 2))
    g.setAttribute("gsize", new THREE.Float32BufferAttribute(this.size, 1))
    g.setAttribute("gcolor", new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute("gflick", new THREE.Float32BufferAttribute(this.fl, 3))
    g.setIndex(this.idx); g.computeBoundingSphere()
    if (g.boundingSphere) g.boundingSphere.radius += 30
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: u.time, fogNear: u.fogNear, fogFar: u.fogFar, fogAmount: { value: opts.fog === false ? 0 : 1 }, grow: { value: opts.grow ?? 0.012 }, tint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    })
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 5
    return mesh
  }
}

const GLOW_VS = /* glsl */`
attribute vec2 corner; attribute float gsize; attribute vec3 gcolor; attribute vec3 gflick;
uniform float time; uniform float fogNear; uniform float fogFar; uniform float fogAmount; uniform float grow;
varying vec2 vC; varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 0.01);
  mv.xyz *= max(dist - gsize * 0.35, dist * 0.6) / dist;
  float s = gsize * (1.0 + dist * grow);
  mv.xy += corner * s;
  gl_Position = projectionMatrix * mv;
  float f = 1.0;
  if (gflick.x > 2.5) f = 0.25 + 0.75 * step(0.5, fract(time * gflick.y + gflick.z));
  else if (gflick.x > 1.5) f = step(0.9, fract(time * gflick.y + gflick.z));
  else if (gflick.x > 0.0) f = 1.0 - gflick.x * (0.5 + 0.5 * sin(time * gflick.y + gflick.z) * sin(time * gflick.y * 2.37 + gflick.z * 1.7));
  float fog = 1.0 - fogAmount * 0.85 * smoothstep(fogNear, fogFar * 1.7, dist);
  vCol = gcolor * f * fog;
  vC = corner;
}`
const GLOW_FS = /* glsl */`
uniform vec3 tint;
varying vec2 vC; varying vec3 vCol;
void main() {
  float d = dot(vC, vC);
  if (d > 1.0) discard;
  float a = exp(-d * 6.0) * 0.8 + exp(-d * 45.0) * 0.9;
  gl_FragColor = vec4(vCol * tint * a, 1.0);
}`

// ---------------------------------------------------------------------------------------------------------------
// Ground light pools (flat additive ellipses) and light shafts (additive cones).
// ---------------------------------------------------------------------------------------------------------------
export class PoolBatch {
  private b = new GeoBatch()
  add(x: number, z: number, rx: number, rz: number, color: THREE.Color | number, intensity: number, y = 0.04, rot = 0): void {
    const c = (typeof color === "number" ? raw(color) : color.clone()).multiplyScalar(intensity)
    const cs = Math.cos(rot), sn = Math.sin(rot)
    const p = (u: number, v: number) => [x + u * rx * cs + v * rz * sn, y, z - u * rx * sn + v * rz * cs]
    this.b.quad(p(-1, 1), p(1, 1), p(1, -1), p(-1, -1), [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], c)
  }
  build(u: FxUniforms): THREE.Mesh | null {
    const g = this.b.build(); if (!g) return null
    const mat = new THREE.ShaderMaterial({
      uniforms: { fogNear: u.fogNear, fogFar: u.fogFar },
      vertexShader: POOL_VS, fragmentShader: POOL_FS, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    })
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 2
    return mesh
  }
}
const POOL_VS = /* glsl */`
uniform float fogNear; uniform float fogFar;
varying vec2 vUv; varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vCol = color * (1.0 - smoothstep(fogNear, fogFar, -mv.z));
}`
const POOL_FS = /* glsl */`
varying vec2 vUv; varying vec3 vCol;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  gl_FragColor = vec4(vCol * a * a, 1.0);
}`

export class ConeBatch {
  private b = new GeoBatch()
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private dir = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0)
  /** Shaft from (x, y, z) toward (tx, ty, tz) with end radius r. */
  add(x: number, y: number, z: number, tx: number, ty: number, tz: number, r: number, color: THREE.Color | number, intensity: number, r0 = 0.15): void {
    this.dir.set(tx - x, ty - y, tz - z); const len = this.dir.length(); this.dir.divideScalar(len)
    const geo = new THREE.CylinderGeometry(r0, r, len, 14, 1, true)
    this.q.setFromUnitVectors(this.up, this.dir.clone().negate())
    this.m.compose(new THREE.Vector3(x + (tx - x) / 2, y + (ty - y) / 2, z + (tz - z) / 2), this.q, new THREE.Vector3(1, 1, 1))
    const c = (typeof color === "number" ? raw(color) : color.clone()).multiplyScalar(intensity)
    this.b.add(geo, this.m, c); geo.dispose()
  }
  build(u: FxUniforms): THREE.Mesh | null {
    const g = this.b.build(); if (!g) return null
    const mat = coneMaterial(u)
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 4
    return mesh
  }
}

/** Additive shaft material: bright at the lamp (uv.y = 1), soft edges by view angle. */
export function coneMaterial(u: FxUniforms, uniforms: Record<string, THREE.IUniform> = {}, vertexHead = "", vertexBody = ""): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { fogNear: u.fogNear, fogFar: u.fogFar, time: u.time, ...uniforms },
    vertexShader: /* glsl */`
      uniform float fogNear; uniform float fogFar; uniform float time;
      varying float vAlong; varying float vEdge; varying vec3 vCol;
      ${vertexHead}
      void main() {
        vec3 p = position; vec3 n = normal;
        ${vertexBody}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vec3 vn = normalize(normalMatrix * n);
        vEdge = abs(dot(vn, normalize(-mv.xyz)));
        vAlong = uv.y;
        vCol = color * (1.0 - 0.8 * smoothstep(fogNear, fogFar * 1.4, -mv.z));
      }`,
    fragmentShader: /* glsl */`
      varying float vAlong; varying float vEdge; varying vec3 vCol;
      void main() {
        float a = pow(vAlong, 1.6) * pow(vEdge, 1.8);
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  })
}
