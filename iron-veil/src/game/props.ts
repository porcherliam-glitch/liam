/**
 * props.ts — turns a MapLayout (solids, props, buildings, perimeter) into batched geometry for world.ts.
 * Everything static goes into GeoBatches keyed by material ("metal", "container", ...); repeated small props into
 * instancing lists; lamps into the glow/pool/cone effect batches. Visual details never leave a solid's box by more
 * than a few centimetres, so the collision boxes keep matching what the player sees.
 */
import * as THREE from "three"
import type { MapLayout, MapProp, MapSolid, Side } from "./maps"
import { ConeBatch, GeoBatch, GlowBatch, NY, PoolBatch, PY } from "./meshkit"
import { mulberry } from "./textures"

export type InstKind = "barrel" | "sandbag" | "post" | "bollard" | "chainpost"
export interface Searchlight { x: number; y: number; z: number; rot: number; amp: number; dist: number; phase: number }
export interface PropLook {
  night: number
  /** Multiplier for lamp glows / pools. */
  lamps: number
  /** Street/mast lamp colour (sodium or LED). */
  lampColor: number
  /** Chance that a facade window is lit. */
  windowLit: number
  /** Light shafts strength (0 = none). */
  shafts: number
}
export interface DecalReq { key: string; x: number; y: number; z: number; w: number; h: number; face: Side | "up"; color: number; rot: number }
export interface WindowReq { x: number; y: number; z: number; w: number; h: number; face: Side; cell: number }

export interface BuildCtx {
  layout: MapLayout
  look: PropLook
  high: boolean
  rng: () => number
  B(key: string): GeoBatch
  glow: GlowBatch; pool: PoolBatch; cone: ConeBatch
  inst(kind: InstKind, x: number, y: number, z: number, ry: number, s: [number, number, number], color: number, rx?: number): void
  decals: DecalReq[]
  texts: Map<string, [number, string]>
  windows: WindowReq[]
  lines: number[]
  searchlights: Searchlight[]
  radars: Array<[number, number, number]>
  weeds: Array<[number, number, number]>
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3()
const white = new THREE.Color(1, 1, 1)
/** Tint colour: white blended toward hex by `mix`, times a brightness factor. */
export function tint(hex: number | undefined, mix = 1, k = 1): THREE.Color {
  const c = hex === undefined ? white.clone() : white.clone().lerp(new THREE.Color(hex), mix)
  return c.multiplyScalar(k)
}
function jit(s: { x: number; z: number }, amount = 0.07): number { const h = Math.sin(s.x * 12.9898 + s.z * 78.233) * 43758.5453; return 1 - amount + (h - Math.floor(h)) * amount * 2 }
function place(b: GeoBatch, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color: number | THREE.Color, uv: [number, number] = [1, 1]): void {
  M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, "YXZ")), S.set(sx, sy, sz)); b.add(geo, M, color, uv)
}

// shared template geometries (disposed by disposeTemplates)
let T: Record<string, THREE.BufferGeometry> | null = null
function tpl(): Record<string, THREE.BufferGeometry> {
  if (T) return T
  T = {
    cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
    cyl24: new THREE.CylinderGeometry(1, 1, 1, 24, 1),
    wheel: new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2),
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 12),
    torus: new THREE.TorusGeometry(1, 0.32, 6, 14).rotateX(Math.PI / 2),
    ring: new THREE.TorusGeometry(1, 0.012, 4, 40).rotateX(Math.PI / 2),
    sphere: new THREE.SphereGeometry(1, 10, 8),
  }
  return T
}
export function disposeTemplates(): void { if (T) { for (const g of Object.values(T)) g.dispose(); T = null } }

// ---------------------------------------------------------------------------------------------------------------
// Decals and windows (UVs are resolved by world.ts once the atlas exists)
// ---------------------------------------------------------------------------------------------------------------
function decal(ctx: BuildCtx, key: string, x: number, y: number, z: number, w: number, h: number, face: Side | "up", color = 0xffffff, rot = 0): void {
  ctx.decals.push({ key, x, y, z, w, h, face, color, rot })
}
function textKey(ctx: BuildCtx, kind: number, text: string): string { const k = `t${kind}:${text}`; ctx.texts.set(k, [kind, text]); return k }

/** Emits decal quads into the "decal" batch with atlas UVs. */
export function emitDecals(ctx: BuildCtx, rects: Map<string, { u0: number; v0: number; u1: number; v1: number }>): void {
  const b = ctx.B("decal")
  for (const d of ctx.decals) {
    const r = rects.get(d.key); if (!r) continue
    const c = new THREE.Color(d.color), hw = d.w / 2, o = 0.025
    const uv = [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]
    if (d.face === "up") {
      const cs = Math.cos(d.rot), sn = Math.sin(d.rot), hh = d.h / 2
      const p = (u: number, v: number) => [d.x + u * cs + v * sn, d.y + 0.02, d.z - u * sn + v * cs]
      b.quad(p(-hw, hh), p(hw, hh), p(hw, -hh), p(-hw, -hh), [0, 1, 0], uv, c)
    } else {
      const y0 = d.y, y1 = d.y + d.h
      if (d.face === "n") b.quad([d.x + hw, y0, d.z - o], [d.x - hw, y0, d.z - o], [d.x - hw, y1, d.z - o], [d.x + hw, y1, d.z - o], [0, 0, -1], uv, c)
      if (d.face === "s") b.quad([d.x - hw, y0, d.z + o], [d.x + hw, y0, d.z + o], [d.x + hw, y1, d.z + o], [d.x - hw, y1, d.z + o], [0, 0, 1], uv, c)
      if (d.face === "e") b.quad([d.x + o, y0, d.z + hw], [d.x + o, y0, d.z - hw], [d.x + o, y1, d.z - hw], [d.x + o, y1, d.z + hw], [1, 0, 0], uv, c)
      if (d.face === "w") b.quad([d.x - o, y0, d.z - hw], [d.x - o, y0, d.z + hw], [d.x - o, y1, d.z + hw], [d.x - o, y1, d.z - hw], [-1, 0, 0], uv, c)
    }
  }
}
/** Emits facade window quads into the "window" batch (atlas 4 × 2 cells). */
export function emitWindows(ctx: BuildCtx): void {
  const b = ctx.B("window"), c = new THREE.Color(1, 1, 1), o = 0.03
  for (const w of ctx.windows) {
    const cu = (w.cell % 4) / 4, cv = 1 - (Math.floor(w.cell / 4) + 1) / 2
    const uv = [cu, cv, cu + 0.25, cv, cu + 0.25, cv + 0.5, cu, cv + 0.5]
    const hw = w.w / 2, y0 = w.y, y1 = w.y + w.h
    if (w.face === "n") b.quad([w.x + hw, y0, w.z - o], [w.x - hw, y0, w.z - o], [w.x - hw, y1, w.z - o], [w.x + hw, y1, w.z - o], [0, 0, -1], uv, c)
    if (w.face === "s") b.quad([w.x - hw, y0, w.z + o], [w.x + hw, y0, w.z + o], [w.x + hw, y1, w.z + o], [w.x - hw, y1, w.z + o], [0, 0, 1], uv, c)
    if (w.face === "e") b.quad([w.x + o, y0, w.z + hw], [w.x + o, y0, w.z - hw], [w.x + o, y1, w.z - hw], [w.x + o, y1, w.z + hw], [1, 0, 0], uv, c)
    if (w.face === "w") b.quad([w.x - o, y0, w.z - hw], [w.x - o, y0, w.z + hw], [w.x - o, y1, w.z + hw], [w.x - o, y1, w.z - hw], [-1, 0, 0], uv, c)
  }
}
function windowCell(ctx: BuildCtx): number { return ctx.rng() < ctx.look.windowLit ? 4 + Math.floor(ctx.rng() * 4) : Math.floor(ctx.rng() * 4) }

// ---------------------------------------------------------------------------------------------------------------
// Solids
// ---------------------------------------------------------------------------------------------------------------
const PLAIN: Record<string, [string, number | undefined, number]> = {
  brick: ["brick", undefined, 0.3], plaster: ["plaster", undefined, 1], cladding: ["cladding", undefined, 1], concrete: ["concrete", 0xb4b0a6, 1],
  bunker: ["bunker", 0x8e8b84, 1], block: ["block", undefined, 1], siding: ["siding", undefined, 1], rollup: ["rollup", 0x9ba3a8, 1],
  pillar: ["metal", 0x5a5e62, 1], twall: ["concrete", 0xaaa69c, 1], plinth: ["concrete", 0xa8a49a, 1], brickwall: ["brick", undefined, 0.3],
}

export function buildSolid(ctx: BuildCtx, s: MapSolid): void {
  if (s.style.startsWith("proxy")) return
  const y0 = s.y ?? 0, y1 = y0 + s.h, x0 = s.x - s.w / 2, x1 = s.x + s.w / 2, z0 = s.z - s.d / 2, z1 = s.z + s.d / 2
  const alongX = s.w >= s.d, L = alongX ? s.w : s.d, W = alongX ? s.d : s.w
  const k = jit(s), v = s.v ?? 0
  const plain = PLAIN[s.style]
  if (plain) {
    const tintHex = s.tint ?? plain[1]
    ctx.B(plain[0]).box(x0, y0, z0, x1, y1, z1, { color: tint(tintHex, plain[2], k) })
    if (s.style === "twall") decal(ctx, textKey(ctx, 0, String(10 + Math.floor(jit(s, 0.5) * 30))), s.x, 1.4, alongX ? z1 : s.z, 0.9, 0.45, alongX ? "s" : "e")
    return
  }
  const metal = ctx.B("metal")
  switch (s.style) {
    case "roof": {
      if (v === 1) ctx.B("metal").box(x0, y0, z0, x1, y1, z1, { color: tint(0x8c9094, 1, k), ao: 0 })
      else if (v === 2) ctx.B("cladding").box(x0, y0, z0, x1, y1, z1, { color: tint(0x7d8470, 1, k), ao: 0 })
      else {
        ctx.B("roof").box(x0, y0, z0, x1, y1, z1, { ao: 0, color: tint(0xb8b4ac, 1, k), skip: NY })
        ctx.B("concrete").box(x0, y0 - 0.02, z0, x1, y0, z1, { color: tint(0xb4b0a6), skip: PY })
        if (s.h > 0.3) for (const [a, b, c, d] of [[x0 - 0.04, z0 - 0.04, x1 + 0.04, z0 + 0.12], [x0 - 0.04, z1 - 0.12, x1 + 0.04, z1 + 0.04], [x0 - 0.04, z0, x0 + 0.12, z1], [x1 - 0.12, z0, x1 + 0.04, z1]]) metal.box(a, y1 - 0.12, b, c, y1 + 0.03, d, { color: tint(0x6f7378), ao: 0 })
      }
      return
    }
    case "container": return container(ctx, s, x0, y0, z0, x1, y1, z1, alongX, k)
    case "rack": {
      ctx.B("rack").box(x0, y0, z0, x1, y1, z1, { local: true, skip: PY })
      metal.box(x0, y1 - 0.02, z0, x1, y1, z1, { color: tint(0x3a5a8c), ao: 0 })
      return
    }
    case "crate": ctx.B("crate").box(x0, y0, z0, x1, y1, z1, { local: true, color: tint(s.tint, 0.75, k) }); return
    case "pallets": {
      ctx.B("pallets").box(x0, y0, z0, x1, y1, z1, { local: true, skip: PY, color: tint(undefined, 1, k) })
      ctx.B("plank").box(x0, y1 - 0.02, z0, x1, y1, z1, { color: tint(0xd8c0a0, 1, k), ao: 0 })
      return
    }
    case "jersey": return jersey(ctx, s, x0, z0, x1, z1, alongX, k)
    case "sandbag": return sandbags(ctx, s, x0, y0, z0, x1, y1, z1, alongX)
    case "hesco": {
      ctx.B("hesco").box(x0, y0, z0, x1, y1, z1, { local: true, color: tint(undefined, 1, k), top: tint(0x8a7a5a, 1, k) })
      return
    }
    case "dock": {
      ctx.B("concrete").box(x0, y0, z0, x1, y1, z1, { color: tint(0xb0aca2, 1, k) })
      const front = dockFront(ctx, s)
      const fx = front === "w" ? x0 : front === "e" ? x1 : s.x, fz = front === "n" ? z0 : front === "s" ? z1 : s.z
      if (front === "w" || front === "e") { metal.box(fx - 0.04, y1 - 0.1, z0, fx + 0.04, y1 + 0.01, z1, { color: tint(0x6a6e72), ao: 0 }); for (let z = z0 + 0.6; z < z1 - 0.6; z += 1) decal(ctx, "hazard", fx, y1 - 0.4, z + 0.5, 1, 0.25, front) }
      else { metal.box(x0, y1 - 0.1, fz - 0.04, x1, y1 + 0.01, fz + 0.04, { color: tint(0x6a6e72), ao: 0 }); for (let x = x0 + 0.6; x < x1 - 0.6; x += 1) decal(ctx, "hazard", x + 0.5, y1 - 0.4, fz, 1, 0.25, front) }
      return
    }
    case "car": return car(ctx, s, x0, z0, x1, z1, alongX, L, W, v)
    case "cabin": {
      const paint = v === 4 ? tint(0x3a2c22) : tint(s.tint)
      ctx.B("glass").box(x0, y0, z0, x1, y1 - 0.03, z1, { local: true, ao: 0, color: v === 4 ? tint(0x5a5048) : undefined, skip: NY })
      metal.box(x0 + 0.04, y1 - 0.04, z0 + 0.04, x1 - 0.04, y1, z1 - 0.04, { color: paint, ao: 0 })
      return
    }
    case "truckcab": return truckCab(ctx, s, x0, z0, x1, z1, v)
    case "cargo": return cargo(ctx, s, x0, y0, z0, x1, y1, z1, alongX, L, v, k)
    case "machine": return machine(ctx, s, x0, y0, z0, x1, y1, z1, alongX, v, k)
    case "desk": {
      const top = v === 1 ? 0x4a4e52 : v === 2 ? 0x5a6248 : 0xb08a62
      metal.box(x0 + 0.03, y0, z0 + 0.03, x1 - 0.03, y1 - 0.04, z1 - 0.03, { color: tint(v === 2 ? 0x4a5236 : 0x6e7378, 1, k) })
      ctx.B(v === 1 ? "metal" : "plank").box(x0, y1 - 0.04, z0, x1, y1, z1, { color: tint(top, 1, k), ao: 0 })
      if (v === 3) decal(ctx, "paper", s.x, y1 + 0.005, s.z, Math.min(1.4, s.w * 0.7), Math.min(1, s.d * 0.7), "up")
      return
    }
    case "cabinet": metal.box(x0, y0, z0, x1, y1, z1, { color: tint(v === 2 ? 0x5c6448 : v === 1 ? 0x5a5f66 : 0x8a9096, 1, k) }); return
    case "counter": {
      ctx.B("plaster").box(x0, y0, z0, x1, y1 - 0.05, z1, { color: tint(0xa89e8c, 1, k) })
      ctx.B("plank").box(x0 - 0.03, y1 - 0.05, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, { color: tint(0x9a7654), ao: 0 })
      return
    }
    case "console": {
      metal.box(x0, y0, z0, x1, y1, z1, { color: tint(0x3a3f45, 1, k) })
      const lamp = ctx.B("lamp"), n = Math.max(1, Math.floor(L / 0.8))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, cx = alongX ? x0 + t * L : s.x, cz = alongX ? s.z : z0 + t * L
        const col = i % 3 === 0 ? 0x7dffb0 : 0x5aa8ff
        lamp.box(cx - (alongX ? 0.28 : 0.2), y1, cz - (alongX ? 0.2 : 0.28), cx + (alongX ? 0.28 : 0.2), y1 + 0.02, cz + (alongX ? 0.2 : 0.28), { color: tint(col, 1, 0.9), ao: 0 })
        ctx.glow.add(cx, y1 + 0.15, cz, 0.35, col, 0.5 * ctx.look.lamps, [0.15, 9, i])
      }
      return
    }
    case "bunk": {
      const olive = tint(0x4f5a3c, 1, k), fabric = ctx.B("plaster")
      for (const [px, pz] of [[x0, z0], [x1 - 0.05, z0], [x0, z1 - 0.05], [x1 - 0.05, z1 - 0.05]]) metal.box(px, y0, pz, px + 0.05, y1, pz + 0.05, { color: olive, local: true })
      fabric.box(x0 + 0.02, 0.25, z0 + 0.02, x1 - 0.02, 0.55, z1 - 0.02, { color: tint(0x6e7258, 1, k) })
      fabric.box(x0 + 0.02, 1.3, z0 + 0.02, x1 - 0.02, 1.6, z1 - 0.02, { color: tint(0x6e7258, 1, k) })
      if (alongX) for (const z of [z0 + 0.02, z1 - 0.06]) fabric.box(x0 + 0.05, 0.55, z, x1 - 0.05, 1.3, z + 0.04, { color: tint(0x46503a, 1, k), ao: 0 })
      else for (const x of [x0 + 0.02, x1 - 0.06]) fabric.box(x, 0.55, z0 + 0.05, x + 0.04, 1.3, z1 - 0.05, { color: tint(0x46503a, 1, k), ao: 0 })
      metal.box(x0, y1 - 0.05, z0, x1, y1, z1, { color: olive, ao: 0 })
      return
    }
    case "towerbase": {
      ctx.B("cladding").box(x0, y0, z0, x1, y1 - 0.15, z1, { color: tint(0x5d6548, 1, k) })
      ctx.B("concrete").box(x0, y1 - 0.15, z0, x1, y1, z1, { color: tint(0x8c8880), ao: 0 })
      decal(ctx, "danger", s.x, 1.3, z1, 0.5, 0.5, "s")
      return
    }
    case "kiosk": case "portakabin": {
      const cab = s.style === "portakabin"
      ctx.B(cab ? "cladding" : "plaster").box(x0, y0, z0, x1, y1 - 0.15, z1, { color: tint(s.tint ?? 0xd2cfc4, 1, k) })
      metal.box(x0, y1 - 0.15, z0, x1, y1, z1, { color: tint(0x5a5e62), ao: 0 })
      const faces: Side[] = cab ? (alongX ? ["n", "s"] : ["e", "w"]) : ["n", "s", "e", "w"]
      for (const f of faces) {
        const len = f === "n" || f === "s" ? s.w : s.d, n = Math.max(1, Math.floor(len / 2.4))
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, wx = f === "n" || f === "s" ? x0 + t * s.w : f === "e" ? x1 : x0, wz = f === "e" || f === "w" ? z0 + t * s.d : f === "n" ? z0 : z1
          if (cab && i === 0) { decal(ctx, "vent", wx, 0.1, wz, 0.9, 2.0, f, 0x9a9a96); continue }
          ctx.windows.push({ x: wx, y: 1.0, z: wz, w: Math.min(1.2, len * 0.4), h: 1.0, face: f, cell: ctx.rng() < 0.4 + ctx.look.night * 0.4 ? 4 : windowCell(ctx) })
        }
      }
      return
    }
    case "hatch": {
      metal.box(x0, y0, z0, x1, y1, z1, { color: tint(s.tint ?? 0x444a50, 1, k) })
      if (alongX) for (let x = x0 + 0.5; x < x1; x += 1.2) metal.box(x, y1, z0 + 0.1, x + 0.12, y1 + 0.06, z1 - 0.1, { color: tint(0x3a3f44), ao: 0 })
      else for (let z = z0 + 0.5; z < z1; z += 1.2) metal.box(x0 + 0.1, y1, z, x1 - 0.1, y1 + 0.06, z + 0.12, { color: tint(0x3a3f44), ao: 0 })
      return
    }
    case "crane": {
      metal.box(x0, y0, z0, x1, y1, z1, { color: tint(s.tint, 1, k) })
      metal.box(x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, 0.6, z1 + 0.08, { color: tint(0x2c2e30), ao: 0.4 })
      for (let y = 3; y < y1 - 1; y += 3) metal.box(x0 - 0.02, y, z0 - 0.02, x1 + 0.02, y + 0.12, z1 + 0.02, { color: tint(s.tint, 1, 0.75), ao: 0 })
      return
    }
    case "pipes": return pipes(ctx, s, x0, y0, z0, x1, y1, z1, alongX, v)
    default: ctx.B("concrete").box(x0, y0, z0, x1, y1, z1, { color: tint(s.tint, 1, k) })
  }
}

function container(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean, k: number): void {
  const thin = Math.min(s.w, s.d) < 0.5 || s.h < 0.5
  const c = tint(s.tint, 1, k)
  ctx.B("container").box(x0, y0, z0, x1, y1, z1, { color: c, ao: y0 < 0.05 ? 0.3 : 0.05 })
  if (thin) return
  const frame = tint(s.tint, 1, k * 0.62), m = ctx.B("metal"), p = 0.16, o = 0.02
  for (const [px, pz] of [[x0 - o, z0 - o], [x1 - p + o, z0 - o], [x0 - o, z1 - p + o], [x1 - p + o, z1 - p + o]]) m.box(px, y0, pz, px + p, y1, pz + p, { color: frame, ao: 0, local: true })
  if (alongX) for (const [za, zb] of [[z0 - o, z0 + 0.1], [z1 - 0.1, z1 + o]]) { m.box(x0 + p, y0, za, x1 - p, y0 + 0.14, zb, { color: frame, ao: 0 }); m.box(x0 + p, y1 - 0.12, za, x1 - p, y1, zb, { color: frame, ao: 0 }) }
  else for (const [xa, xb] of [[x0 - o, x0 + 0.1], [x1 - 0.1, x1 + o]]) { m.box(xa, y0, z0 + p, xb, y0 + 0.14, z1 - p, { color: frame, ao: 0 }); m.box(xa, y1 - 0.12, z0 + p, xb, y1, z1 - p, { color: frame, ao: 0 }) }
  const v = s.v ?? 0, L = alongX ? s.w : s.d
  const doorPlus = v % 2 === 0
  const df: Side = alongX ? (doorPlus ? "e" : "w") : (doorPlus ? "s" : "n")
  const dx = alongX ? (doorPlus ? x1 + o : x0 - o) : s.x, dz = alongX ? s.z : (doorPlus ? z1 + o : z0 - o)
  decal(ctx, "cdoor", dx, y0 + 0.12, dz, 2.2, 2.35, df)
  decal(ctx, `code${v % 4}`, dx, y1 - 0.62, dz, 1.6, 0.4, df)
  const sides: Side[] = alongX ? ["n", "s"] : ["e", "w"]
  for (const f of sides) {
    const fx = f === "e" ? x1 + o : f === "w" ? x0 - o : s.x, fz = f === "s" ? z1 + o : f === "n" ? z0 - o : s.z
    if (v % 3 === 0 && ctx.look.night < 1) decal(ctx, `logo${(v >> 2) % 4}`, fx, y0 + 0.5, fz, L > 8 ? 4.8 : 3.2, L > 8 ? 2.0 : 1.4, f)
    else if (v % 5 === 1) decal(ctx, `code${(v + 1) % 4}`, alongX ? fx + (f === "n" ? -1 : 1) * (L / 2 - 1.3) : fx, y1 - 0.62, alongX ? fz : fz + (f === "e" ? -1 : 1) * (L / 2 - 1.3), 1.7, 0.42, f)
    if (y0 < 0.05 && ctx.rng() < 0.08) decal(ctx, `graffiti${Math.floor(ctx.rng() * 3)}`, fx, 0.3, fz, 2.6, 0.9, f)
  }
}

function jersey(ctx: BuildCtx, s: MapSolid, x0: number, z0: number, x1: number, z1: number, alongX: boolean, k: number): void {
  const L = alongX ? x1 - x0 : z1 - z0, Wd = alongX ? z1 - z0 : x1 - x0, H = s.h
  const n = Math.max(1, Math.round(L / 3)), seg = L / n
  const prof: Array<[number, number]> = [[-Wd / 2, 0], [Wd / 2, 0], [Wd / 2, 0.08], [Wd * 0.36, 0.32], [Wd * 0.2, H], [-Wd * 0.2, H], [-Wd * 0.36, 0.32], [-Wd / 2, 0.08]]
  const b = ctx.B("concrete")
  for (let i = 0; i < n; i++) {
    const a = (alongX ? x0 : z0) + i * seg + 0.02, e = a + seg - 0.04, cc = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2
    const col = tint(s.tint ?? 0xc6c2b8, 1, k * jit({ x: a, z: cc }, 0.05))
    const P3 = (t: number, u: number, y: number) => alongX ? [t, y, cc + u] : [cc + u, y, t]
    for (let j = 0; j < prof.length; j++) {
      const [u0, y0] = prof[j], [u1, y1] = prof[(j + 1) % prof.length]
      if (j === 0) continue
      const nu = y1 - y0, ny = -(u1 - u0), nl = Math.hypot(nu, ny) || 1
      const nrm = alongX ? [0, ny / nl, nu / nl] : [nu / nl, ny / nl, 0]
      const sa = y0 < 0.05 ? 0.72 : 1, sb = y1 < 0.05 ? 0.72 : 1
      const len = Math.hypot(u1 - u0, y1 - y0)
      if (alongX) b.quad(P3(e, u0, y0), P3(a, u0, y0), P3(a, u1, y1), P3(e, u1, y1), nrm, [e, 0, a, 0, a, len, e, len], col, [sa, sa, sb, sb])
      else b.quad(P3(a, u0, y0), P3(e, u0, y0), P3(e, u1, y1), P3(a, u1, y1), nrm, [a, 0, e, 0, e, len, a, len], col, [sa, sa, sb, sb])
    }
    for (const [t, sgn] of [[a, -1], [e, 1]] as Array<[number, number]>) {
      const pts = prof.map(([u, y]) => P3(t, u, y))
      const nrm = alongX ? [sgn, 0, 0] : [0, 0, sgn]
      for (let j = 1; j < pts.length - 1; j++) {
        const A = pts[0], Bp = pts[j], C = pts[j + 1]
        const ord = (alongX ? sgn > 0 : sgn < 0) ? [A, C, Bp, Bp] : [A, Bp, C, C]
        b.quad(ord[0], ord[1], ord[2], ord[3], nrm, [0, 0, 0.5, 0, 0.5, 0.5, 0.5, 0.5], col)
      }
    }
    if (ctx.rng() < 0.35) { const mid = a + seg / 2; decal(ctx, "hazard", alongX ? mid : cc + Wd * 0.29, 0.55, alongX ? cc + Wd * 0.29 : mid, 0.9, 0.18, alongX ? "s" : "e") }
  }
}

function sandbags(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean): void {
  if (!ctx.high) { ctx.B("sandwall").box(x0, y0, z0, x1, y1, z1, { local: true, top: tint(0x9a8a66) }); return }
  const L = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0
  const rows = Math.max(1, Math.round((y1 - y0) / 0.19)), rh = (y1 - y0) / rows
  const per = Math.max(1, Math.round(L / 0.72)), bl = L / per
  const deep = D > 0.95 ? 2 : 1, bd = D / deep
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bl / 2 : 0
    for (let d = 0; d < deep; d++) for (let i = -1; i < per; i++) {
      let a = i * bl + off, e = a + bl
      a = Math.max(0, a); e = Math.min(L, e); if (e - a < 0.12) continue
      const t = (alongX ? x0 : z0) + (a + e) / 2, u = (alongX ? z0 : x0) + (d + 0.5) * bd
      const sx = (e - a) * 0.98, sy = rh * 1.05, sz = bd * 0.98
      const tone = [0x9c8a66, 0x8f7f5c, 0xa69470, 0x857654][(r * 7 + i * 3 + d) & 3]
      if (alongX) ctx.inst("sandbag", t, y0 + (r + 0.5) * rh, u, (ctx.rng() - 0.5) * 0.08, [sx, sy, sz], tone)
      else ctx.inst("sandbag", u, y0 + (r + 0.5) * rh, t, Math.PI / 2 + (ctx.rng() - 0.5) * 0.08, [sx, sy, sz], tone)
    }
  }
}

function dockFront(ctx: BuildCtx, s: MapSolid): Side {
  let best: Side = "w", bd = Infinity
  for (const b of ctx.layout.buildings ?? []) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.hypot(cx - s.x, cz - s.z)
    if (d < bd) { bd = d; best = Math.abs(cx - s.x) > Math.abs(cz - s.z) ? (cx > s.x ? "w" : "e") : (cz > s.z ? "n" : "s") }
  }
  return best
}

function wheelAt(ctx: BuildCtx, x: number, z: number, r: number, w: number, alongX: boolean, y = r): void {
  const t = tpl()
  place(ctx.B("rubber"), t.wheel, x, y, z, 0, alongX ? Math.PI / 2 : 0, 0, w, r, r, 0x2a2a2c)
  place(ctx.B("metal"), t.wheel, x, y, z, 0, alongX ? Math.PI / 2 : 0, 0, w + 0.02, r * 0.5, r * 0.5, 0x6a6e72)
}

function car(ctx: BuildCtx, s: MapSolid, x0: number, z0: number, x1: number, z1: number, alongX: boolean, L: number, W: number, v: number): void {
  const wreck = v === 4, mil = v === 5
  const paint = wreck ? tint(0x4a3a2e, 1, jit(s)) : tint(s.tint, 1, jit(s, 0.04))
  const metal = ctx.B("metal")
  metal.box(x0, 0.3, z0, x1, 0.95, z1, { color: paint, ao: 0.15 })
  const dark = tint(0x1e2022)
  if (alongX) { metal.box(x0 - 0.03, 0.28, z0 + 0.1, x0 + 0.12, 0.55, z1 - 0.1, { color: dark, ao: 0 }); metal.box(x1 - 0.12, 0.28, z0 + 0.1, x1 + 0.03, 0.55, z1 - 0.1, { color: dark, ao: 0 }) }
  else { metal.box(x0 + 0.1, 0.28, z0 - 0.03, x1 - 0.1, 0.55, z0 + 0.12, { color: dark, ao: 0 }); metal.box(x0 + 0.1, 0.28, z1 - 0.12, x1 - 0.1, 0.55, z1 + 0.03, { color: dark, ao: 0 }) }
  ctx.B("metal").box(x0 + 0.05, 0.12, z0 + 0.05, x1 - 0.05, 0.3, z1 - 0.05, { color: tint(0x18191a), ao: 0 })
  const r = wreck ? 0.28 : 0.33, ww = 0.22
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const along = a * (L / 2 - 0.8), across = b * (W / 2 - ww / 2 - 0.01)
    wheelAt(ctx, alongX ? (x0 + x1) / 2 + along : (x0 + x1) / 2 + across, alongX ? (z0 + z1) / 2 + across : (z0 + z1) / 2 + along, r, ww, alongX, wreck ? 0.24 : r)
  }
  if (!wreck) {
    const lamp = ctx.B("lamp"), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    for (const b of [-1, 1]) {
      const across = b * (W / 2 - 0.3)
      if (alongX) { lamp.box(x1 - 0.02, 0.68, cz + across - 0.18, x1 + 0.02, 0.8, cz + across + 0.18, { color: tint(0xfff2d0, 1, 0.9), ao: 0 }); lamp.box(x0 - 0.02, 0.7, cz + across - 0.15, x0 + 0.02, 0.82, cz + across + 0.15, { color: tint(0xc01810, 1, 0.8), ao: 0 }) }
      else { lamp.box(cx + across - 0.18, 0.68, z1 - 0.02, cx + across + 0.18, 0.8, z1 + 0.02, { color: tint(0xfff2d0, 1, 0.9), ao: 0 }); lamp.box(cx + across - 0.15, 0.7, z0 - 0.02, cx + across + 0.15, 0.82, z0 + 0.02, { color: tint(0xc01810, 1, 0.8), ao: 0 }) }
    }
  } else decal(ctx, "oil", (x0 + x1) / 2, 0, (z0 + z1) / 2, L + 1.5, W + 1.2, "up", 0xffffff, alongX ? 0 : Math.PI / 2)
  if (mil) decal(ctx, textKey(ctx, 7, "Y-" + Math.floor(jit(s, 0.5) * 900)), alongX ? x1 : (x0 + x1) / 2, 0.5, alongX ? (z0 + z1) / 2 : z1, 0.8, 0.3, alongX ? "e" : "s", 0xffffff)
}

function truckCab(ctx: BuildCtx, s: MapSolid, x0: number, z0: number, x1: number, z1: number, v: number): void {
  const face: Side = v === 0 ? "e" : v === 1 ? "w" : v === 2 ? "s" : "n"
  const alongX = face === "e" || face === "w"
  const paint = tint(s.tint, 1, jit(s, 0.04)), metal = ctx.B("metal"), y1 = (s.y ?? 0) + s.h
  metal.box(x0, 0.55, z0, x1, y1, z1, { color: paint, ao: 0.1 })
  metal.box(x0 + 0.05, 0.15, z0 + 0.05, x1 - 0.05, 0.55, z1 - 0.05, { color: tint(0x1c1d1e), ao: 0 })
  const g = ctx.B("glass"), o = 0.02
  if (face === "e") g.box(x1, 1.75, z0 + 0.15, x1 + o, y1 - 0.25, z1 - 0.15, { local: true, ao: 0 })
  if (face === "w") g.box(x0 - o, 1.75, z0 + 0.15, x0, y1 - 0.25, z1 - 0.15, { local: true, ao: 0 })
  if (face === "s") g.box(x0 + 0.15, 1.75, z1, x1 - 0.15, y1 - 0.25, z1 + o, { local: true, ao: 0 })
  if (face === "n") g.box(x0 + 0.15, 1.75, z0 - o, x1 - 0.15, y1 - 0.25, z0, { local: true, ao: 0 })
  if (alongX) for (const z of [z0 - o, z1]) g.box(face === "e" ? x1 - 1.1 : x0 + 0.1, 1.8, z, face === "e" ? x1 - 0.1 : x0 + 1.1, y1 - 0.35, z + o, { local: true, ao: 0 })
  else for (const x of [x0 - o, x1]) g.box(x, 1.8, face === "s" ? z1 - 1.1 : z0 + 0.1, x + o, y1 - 0.35, face === "s" ? z1 - 0.1 : z0 + 1.1, { local: true, ao: 0 })
  const fx = face === "e" ? x1 + 0.02 : face === "w" ? x0 - 0.02 : (x0 + x1) / 2, fz = face === "s" ? z1 + 0.02 : face === "n" ? z0 - 0.02 : (z0 + z1) / 2
  decal(ctx, "vent", fx, 0.75, fz, 1.4, 0.7, face, 0xbbbbbb)
  const W = alongX ? z1 - z0 : x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, fwd = face === "e" || face === "s" ? 1 : -1
  for (const b of [-1, 1]) wheelAt(ctx, alongX ? cx + fwd * 0.3 : cx + b * (W / 2 - 0.16), alongX ? cz + b * (W / 2 - 0.16) : cz + fwd * 0.3, 0.5, 0.3, alongX)
}

function cargo(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean, L: number, v: number, k: number): void {
  const mat = v === 1 ? "container" : v === 2 ? "plaster" : "metal"
  ctx.B(mat).box(x0, y0, z0, x1, y1, z1, { color: tint(s.tint, 1, k), ao: 0.05 })
  const metal = ctx.B("metal"), dark = tint(0x1c1d1e), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = alongX ? z1 - z0 : x1 - x0
  if (alongX) for (const z of [cz - 0.55, cz + 0.45]) metal.box(x0 + 0.3, y0 - 0.32, z, x1 - 0.3, y0, z + 0.1, { color: dark, ao: 0 })
  else for (const x of [cx - 0.55, cx + 0.45]) metal.box(x, y0 - 0.32, z0 + 0.3, x + 0.1, y0, z1 - 0.3, { color: dark, ao: 0 })
  for (const off of [L / 2 - 1.2, L / 2 - 2.3]) for (const b of [-1, 1]) {
    const along = off, across = b * (W / 2 - 0.2)
    wheelAt(ctx, alongX ? cx + along : cx + across, alongX ? cz + across : cz + along, 0.5, 0.36, alongX)
  }
  if (v === 1) for (const b of [-1, 1]) metal.box(alongX ? x0 + 1.6 : cx + b * 0.8 - 0.06, 0, alongX ? cz + b * 0.8 - 0.06 : z0 + 1.6, alongX ? x0 + 1.72 : cx + b * 0.8 + 0.06, y0, alongX ? cz + b * 0.8 + 0.06 : z0 + 1.72, { color: dark, local: true })
  if (v === 2) for (let t = 0.6; t < L - 0.3; t += 1.2) metal.box(alongX ? x0 + t : x0 - 0.02, y1 - 0.06, alongX ? z0 - 0.02 : z0 + t, alongX ? x0 + t + 0.06 : x1 + 0.02, y1 + 0.02, alongX ? z1 + 0.02 : z0 + t + 0.06, { color: tint(0x3c4030), ao: 0 })
  const lamp = ctx.B("lamp")
  for (const b of [-1, 1]) {
    const across = b * (W / 2 - 0.25)
    if (alongX) lamp.box(x1 - 0.02, y0 - 0.2, cz + across - 0.12, x1 + 0.02, y0 - 0.08, cz + across + 0.12, { color: tint(0xb01810, 1, 0.7), ao: 0 })
    else lamp.box(cx + across - 0.12, y0 - 0.2, z1 - 0.02, cx + across + 0.12, y0 - 0.08, z1 + 0.02, { color: tint(0xb01810, 1, 0.7), ao: 0 })
  }
  if (v === 0 && ctx.rng() < 0.6) decal(ctx, `logo${Math.floor(ctx.rng() * 4)}`, alongX ? cx : x1 + 0.02, y0 + 0.6, alongX ? z1 + 0.02 : cz, Math.min(4.5, L * 0.6), 1.8, alongX ? "s" : "e", 0x30353c)
}

function machine(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean, v: number, k: number): void {
  const metal = ctx.B("metal"), c = tint(s.tint, 1, k), dark = tint(0x2a2c2e), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  const t = tpl()
  switch (v) {
    case 2: { // forklift
      const L = alongX ? x1 - x0 : z1 - z0
      const front = (a: number) => alongX ? [x0 + a * L, cz] : [cx, z0 + a * L]
      if (alongX) { metal.box(x0 + 0.5, 0, z0, x1, 1.25, z1, { color: c }); metal.box(x1 - 0.5, 1.25, z0 + 0.1, x1, 1.6, z1 - 0.1, { color: dark }) }
      else { metal.box(x0, 0, z0 + 0.5, x1, 1.25, z1, { color: c }); metal.box(x0 + 0.1, 1.25, z1 - 0.5, x1 - 0.1, 1.6, z1, { color: dark }) }
      const [fx, fz] = front(0.12)
      for (const b of [-0.35, 0.35]) metal.box(alongX ? fx - 0.05 : fx + b - 0.05, 0, alongX ? fz + b - 0.05 : fz - 0.05, alongX ? fx + 0.05 : fx + b + 0.05, y1, alongX ? fz + b + 0.05 : fz + 0.05, { color: dark, local: true })
      for (const b of [-0.3, 0.3]) metal.box(alongX ? x0 : fx + b - 0.05, 0.02, alongX ? fz + b - 0.05 : z0, alongX ? x0 + 0.55 : fx + b + 0.05, 0.08, alongX ? fz + b + 0.05 : z0 + 0.55, { color: dark, ao: 0 })
      const [px, pz] = front(0.3), [qx, qz] = front(0.85)
      for (const [a, b] of [[px, pz], [qx, qz]]) for (const off of [-0.5, 0.5]) metal.box(alongX ? a - 0.03 : a + off - 0.03, 1.25, alongX ? b + off - 0.03 : b - 0.03, alongX ? a + 0.03 : a + off + 0.03, y1, alongX ? b + off + 0.03 : b + 0.03, { color: dark, local: true, ao: 0 })
      metal.box(alongX ? px : x0 + 0.05, y1 - 0.06, alongX ? z0 + 0.05 : pz, alongX ? qx : x1 - 0.05, y1, alongX ? z1 - 0.05 : qz, { color: dark, ao: 0 })
      return
    }
    case 3: { // server rack
      metal.box(x0, y0, z0, x1, y1, z1, { color: c })
      for (let i = 0; i < 6; i++) ctx.glow.add(alongX ? x0 + 0.3 + i * (x1 - x0 - 0.6) / 5 : x1 + 0.03, 0.4 + (i % 3) * 0.3, alongX ? z1 + 0.03 : z0 + 0.3 + i * (z1 - z0 - 0.6) / 5, 0.06, i % 2 ? 0x30ff80 : 0x40a0ff, 1.2, [2, 0.7 + i * 0.13, i])
      return
    }
    case 4: { // dumpster
      metal.box(x0 + 0.05, 0.15, z0 + 0.05, x1 - 0.05, y1 - 0.12, z1 - 0.05, { color: c })
      metal.box(x0, y1 - 0.12, z0, x1, y1, z1, { color: tint(0x1e2a22), ao: 0 })
      metal.box(x0 + 0.15, 0, z0 + 0.15, x1 - 0.15, 0.15, z1 - 0.15, { color: dark, ao: 0 })
      return
    }
    case 5: { // reach stacker body + cab
      metal.box(x0, 0.5, z0, x1, 2.2, z1, { color: c })
      metal.box(x0 + 0.1, 0, z0 + 0.1, x1 - 0.1, 0.5, z1 - 0.1, { color: dark })
      ctx.B("glass").box(alongX ? x1 - 2.2 : x0 + 0.6, 2.2, alongX ? z0 + 0.6 : z1 - 2.2, alongX ? x1 - 0.4 : x1 - 0.6, y1 - 0.1, alongX ? z1 - 0.6 : z1 - 0.4, { local: true })
      metal.box(alongX ? x1 - 2.25 : x0 + 0.55, y1 - 0.1, alongX ? z0 + 0.55 : z1 - 2.25, alongX ? x1 - 0.35 : x1 - 0.55, y1, alongX ? z1 - 0.55 : z1 - 0.35, { color: c, ao: 0 })
      for (const a of [0.2, 0.8]) for (const b of [-1, 1]) wheelAt(ctx, alongX ? x0 + a * (x1 - x0) : cx + b * ((x1 - x0) / 2 - 0.3), alongX ? cz + b * ((z1 - z0) / 2 - 0.3) : z0 + a * (z1 - z0), 0.7, 0.55, alongX)
      return
    }
    case 6: { // generator
      metal.box(x0, 0.12, z0, x1, y1 - 0.05, z1, { color: c })
      metal.box(x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 0.12, z1 - 0.05, { color: dark, ao: 0 })
      const faces: Side[] = alongX ? ["n", "s"] : ["e", "w"]
      for (const f of faces) decal(ctx, "vent", f === "e" ? x1 : f === "w" ? x0 : cx, 0.4, f === "s" ? z1 : f === "n" ? z0 : cz, Math.min(1.6, (alongX ? x1 - x0 : z1 - z0) * 0.6), 0.6, f)
      place(metal, t.cyl8, alongX ? x1 - 0.4 : cx + 0.3, y1 - 0.05, alongX ? cz + 0.3 : z1 - 0.4, 0, 0, 0, 0.08, 0.1, 0.08, 0x202020)
      ctx.glow.add(cx, y1 + 0.02, cz, 0.12, 0x40ff60, 1, [2, 0.5, cx])
      return
    }
    case 7: { // wrecked APC
      metal.box(x0, 0.55, z0, x1, 1.75, z1, { color: c })
      metal.box(alongX ? x0 + 1.8 : x0 + 0.5, 1.75, alongX ? z0 + 0.5 : z0 + 1.8, alongX ? x0 + 3.8 : x1 - 0.5, y1, alongX ? z1 - 0.5 : z0 + 3.8, { color: tint(s.tint, 1, k * 0.9) })
      place(metal, t.cyl8, alongX ? x0 + 4.6 : cx, y1 - 0.25, alongX ? cz : z0 + 4.6, 0, 0, Math.PI / 2, 0.07, 1.6, 0.07, 0x2a2c2a)
      for (const a of [0.18, 0.5, 0.82]) for (const b of [-1, 1]) wheelAt(ctx, alongX ? x0 + a * (x1 - x0) : cx + b * ((x1 - x0) / 2 - 0.25), alongX ? cz + b * ((z1 - z0) / 2 - 0.25) : z0 + a * (z1 - z0), 0.55, 0.4, alongX)
      decal(ctx, "oil", cx, 0, cz, 8, 5, "up", 0xffffff, alongX ? 0 : Math.PI / 2)
      return
    }
    case 8: { // boom barrier pedestal
      metal.box(x0, y0, z0, x1, y1, z1, { color: c })
      for (let y = 0.2; y < y1; y += 0.3) metal.box(x0 - 0.01, y, z0 - 0.01, x1 + 0.01, y + 0.12, z1 + 0.01, { color: tint(0x202020), ao: 0 })
      return
    }
    default: { // pump skid / machinery
      metal.box(x0, 0, z0, x1, 0.22, z1, { color: dark })
      metal.box(x0 + 0.1, 0.22, z0 + 0.1, x1 - 0.1, y1 * 0.7, z1 - 0.1, { color: c })
      place(metal, t.cyl12, cx, y1 * 0.7 + (y1 * 0.3) / 2, cz, 0, 0, Math.PI / 2, Math.min(0.28, y1 * 0.15), (alongX ? x1 - x0 : z1 - z0) * 0.7, Math.min(0.28, y1 * 0.15), c)
      if (!alongX) place(metal, t.cyl12, cx, y1 * 0.85, cz, Math.PI / 2, 0, 0, 0.25, (z1 - z0) * 0.7, 0.25, c)
      decal(ctx, "danger", alongX ? cx : x1 + 0.02, 0.5, alongX ? z1 + 0.02 : cz, 0.35, 0.35, alongX ? "s" : "e")
    }
  }
}

function pipes(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean, v: number): void {
  const metal = ctx.B("metal"), t = tpl(), L = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0
  const cols = [0xa8aaa6, 0xc9a227, 0x8a8e92, 0x9a3a2a, 0x7a8a6a]
  const n = 4
  for (let i = 0; i < n; i++) {
    const r = 0.1 + (i % 2) * 0.06, off = -D / 2 + (i + 0.5) * D / n, yy = y0 + 0.25 + (i % 2) * 0.3
    if (alongX) place(metal, t.cyl8, (x0 + x1) / 2, yy, (z0 + z1) / 2 + off, 0, 0, Math.PI / 2, r, L, r, cols[(i + v) % cols.length], [1, L])
    else place(metal, t.cyl8, (x0 + x1) / 2 + off, yy, (z0 + z1) / 2, Math.PI / 2, 0, 0, r, L, r, cols[(i + v) % cols.length], [1, L])
  }
  for (let a = 0.5; a < L; a += 6) {
    if (alongX) metal.box(x0 + a - 0.1, y0, z0, x0 + a + 0.1, y0 + 0.14, z1, { color: tint(0x4a4e52), ao: 0 })
    else metal.box(x0, y0, z0 + a - 0.1, x1, y0 + 0.14, z0 + a + 0.1, { color: tint(0x4a4e52), ao: 0 })
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------------------------
export function buildProp(ctx: BuildCtx, p: MapProp): void {
  const t = tpl(), metal = ctx.B("metal"), L = ctx.look
  switch (p.kind) {
    case "decal": {
      const ground = (p.v ?? 0) >= 20
      decal(ctx, textKey(ctx, p.v ?? 0, p.text ?? ""), p.x, ground ? 0 : p.y ?? 2, p.z, p.w ?? 2, p.h ?? 1, ground ? "up" : p.face ?? "s", 0xffffff, ground ? Math.PI : 0)
      if (!ground && (p.v ?? 0) <= 6 && (p.v ?? 0) >= 1 && L.night + L.lamps > 0.5) {
        const f = p.face ?? "s", nx = f === "e" ? 1 : f === "w" ? -1 : 0, nz = f === "s" ? 1 : f === "n" ? -1 : 0
        ctx.glow.add(p.x + nx * 0.5, (p.y ?? 2) + (p.h ?? 1) + 0.35, p.z + nz * 0.5, 0.35, 0xfff0d0, 0.8 * L.lamps)
      }
      return
    }
    case "line": decal(ctx, "paint", p.x, 0, p.z, Math.abs(p.w ?? 1), Math.abs(p.d ?? 1), "up", p.tint ?? 0xe8e4d8); return
    case "rail": {
      const len = p.d ?? 100
      for (const dx of [-0.42, 0.42]) decal(ctx, "paint", p.x + dx, 0, p.z, 0.09, len, "up", 0x5e6064)
      decal(ctx, "paint", p.x, 0, p.z, 1.1, len, "up", 0x3a3c3e)
      return
    }
    case "frame": {
      const c = tint(0xcfd0cc), h = p.h ?? 1.2, w = p.w ?? 2, d = (p.d ?? 0.3) + 0.04, y0 = p.y ?? 1, fb = 0.06
      if (p.face === "n" || p.face === "s") {
        metal.box(p.x - w / 2, y0, p.z - d / 2, p.x + w / 2, y0 + fb, p.z + d / 2, { color: c, ao: 0 })
        metal.box(p.x - w / 2, y0 + h - fb, p.z - d / 2, p.x + w / 2, y0 + h, p.z + d / 2, { color: c, ao: 0 })
        for (const x of [p.x - w / 2, p.x + w / 2 - fb, p.x - fb / 2]) metal.box(x, y0, p.z - 0.03, x + fb, y0 + h, p.z + 0.03, { color: c, ao: 0, local: true })
      } else {
        metal.box(p.x - d / 2, y0, p.z - w / 2, p.x + d / 2, y0 + fb, p.z + w / 2, { color: c, ao: 0 })
        metal.box(p.x - d / 2, y0 + h - fb, p.z - w / 2, p.x + d / 2, y0 + h, p.z + w / 2, { color: c, ao: 0 })
        for (const z of [p.z - w / 2, p.z + w / 2 - fb, p.z - fb / 2]) metal.box(p.x - 0.03, y0, z, p.x + 0.03, y0 + h, z + fb, { color: c, ao: 0, local: true })
      }
      return
    }
    case "rolldoor": {
      const w = p.w ?? 4, d = (p.d ?? 0.3) + 0.1, y = p.y ?? 4.4
      if (p.face === "n" || p.face === "s") ctx.B("rollup").box(p.x - w / 2, y - 0.35, p.z - d / 2, p.x + w / 2, y, p.z + d / 2, { color: tint(0x8a9094), ao: 0 })
      else ctx.B("rollup").box(p.x - d / 2, y - 0.35, p.z - w / 2, p.x + d / 2, y, p.z + w / 2, { color: tint(0x8a9094), ao: 0 })
      return
    }
    case "panel": {
      ctx.B("lamp").box(p.x - 0.7, (p.y ?? 3) - 0.06, p.z - 0.18, p.x + 0.7, p.y ?? 3, p.z + 0.18, { color: tint(0xf2f6ff, 1, 1.6), ao: 0 })
      ctx.glow.add(p.x, (p.y ?? 3) - 0.2, p.z, 1.1, 0xd8e4ff, 0.25 + 0.3 * L.night, [0.05, 30, p.x])
      ctx.pool.add(p.x, p.z, 4.2, 3.8, 0xc8d8ff, 0.16 + 0.22 * L.night, 0.03)
      return
    }
    case "tank": return tank(ctx, p)
    case "barrels": {
      const w = p.w ?? 1.4, d = p.d ?? 1.4, nx = Math.max(1, Math.floor(w / 0.64)), nz = Math.max(1, Math.floor(d / 0.64))
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = p.x - w / 2 + (i + 0.5) * w / nx, z = p.z - d / 2 + (j + 0.5) * d / nz
        const c = new THREE.Color(p.tint ?? 0x4f6a8a).multiplyScalar(0.8 + ctx.rng() * 0.35)
        ctx.inst("barrel", x, 0.45, z, ctx.rng() * 6, [1, 1, 1], c.getHex())
      }
      return
    }
    case "pipedrop": {
      place(metal, t.cyl8, p.x, (p.y ?? 4) / 2, p.z, 0, 0, 0, 0.16, p.y ?? 4, 0.16, 0xa8aaa6)
      metal.box(p.x - 0.35, 0, p.z - 0.35, p.x + 0.35, 0.3, p.z + 0.35, { color: tint(0x9a968c) })
      return
    }
    case "mast": return mast(ctx, p)
    case "streetlamp": {
      const h = p.h ?? 7, rot = p.rot ?? 0, ax = -Math.sin(rot), az = -Math.cos(rot)
      place(metal, t.cyl8, p.x, h / 2, p.z, 0, 0, 0, 0.08, h, 0.08, 0x5a5e62)
      place(metal, t.box, p.x + ax * 0.8, h - 0.05, p.z + az * 0.8, 0, rot, 0, 0.08, 0.08, 1.6, 0x5a5e62)
      const hx = p.x + ax * 1.5, hz = p.z + az * 1.5
      place(metal, t.box, hx, h - 0.12, hz, 0, rot, 0, 0.35, 0.14, 0.6, 0x3a3e42)
      if (L.lamps > 0) {
        ctx.B("lamp").box(hx - 0.14, h - 0.21, hz - 0.14, hx + 0.14, h - 0.18, hz + 0.14, { color: tint(L.lampColor, 1, 2.2), ao: 0 })
        ctx.glow.add(hx, h - 0.3, hz, 0.9, L.lampColor, 0.9 * L.lamps, [0.04, 17, p.z])
        ctx.pool.add(hx, hz, 5, 5, L.lampColor, 0.16 * L.lamps)
        if (L.shafts > 0) ctx.cone.add(hx, h - 0.25, hz, hx, 0, hz, 2.8, L.lampColor, 0.05 * L.shafts)
      }
      return
    }
    case "powerline": {
      const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, h = p.h ?? 9, len = Math.hypot(x2 - p.x, z2 - p.z), n = Math.max(1, Math.round(len / 24))
      const dx = (x2 - p.x) / len, dz = (z2 - p.z) / len
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= n; i++) pts.push([p.x + dx * len * i / n, p.z + dz * len * i / n])
      for (const [x, z] of pts) {
        place(ctx.B("plank"), t.cyl8, x, h / 2, z, 0, 0, 0, 0.13, h, 0.13, 0x6a5038, [1, h])
        place(ctx.B("plank"), t.box, x, h - 0.6, z, 0, Math.atan2(dx, dz), 0, 1.8, 0.12, 0.12, 0x5a4430)
      }
      for (let i = 0; i < n; i++) for (const off of [-0.8, 0, 0.8]) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ox = dz * off, oz = -dx * off
        sag(ctx, ax + ox, h - 0.5, az + oz, bx + ox, h - 0.5, bz + oz, 0.9, 8)
      }
      return
    }
    case "hydrant": { place(metal, t.cyl8, p.x, 0.4, p.z, 0, 0, 0, 0.12, 0.8, 0.12, 0xb02820); place(metal, t.sphere, p.x, 0.8, p.z, 0, 0, 0, 0.13, 0.1, 0.13, 0xb02820); return }
    case "weeds": {
      const n = Math.round((p.v ?? 20) * (ctx.high ? 1 : 0.4))
      for (let i = 0; i < n; i++) ctx.weeds.push([p.x + ctx.rng() * (p.w ?? 4), p.z + ctx.rng() * (p.d ?? 4), 0.7 + ctx.rng() * 0.8])
      return
    }
    case "tyres": {
      const stacks = p.v === 1 ? [[0, 0]] : [[0, 0], [0.9, 0.3], [0.3, 0.95]]
      for (const [ox, oz] of stacks) { const n = 2 + Math.floor(ctx.rng() * 3); for (let i = 0; i < n; i++) place(ctx.B("rubber"), t.torus, p.x + ox + (ctx.rng() - 0.5) * 0.06, 0.12 + i * 0.24, p.z + oz, 0, ctx.rng(), 0, 0.36, 0.55, 0.36, 0x2a2a2c) }
      return
    }
    case "pallet": {
      const r = p.rot ?? 0, b = ctx.B("plank"), c = tint(0xc8a878)
      b.box(p.x - 0.6, 0.1, p.z - 0.4, p.x + 0.6, 0.14, p.z + 0.4, { rotY: r, color: c, ao: 0.2 })
      for (const dz of [-0.35, 0, 0.35]) { const cx = p.x - Math.sin(r) * dz, cz = p.z + Math.cos(r) * dz; b.box(cx - 0.6, 0, cz - 0.05, cx + 0.6, 0.1, cz + 0.05, { rotY: r, color: tint(0xa88a60), ao: 0.3 }) }
      return
    }
    case "debris": {
      for (let i = 0; i < 6; i++) { const s = 0.15 + ctx.rng() * 0.35; ctx.B("concrete").box(p.x + (ctx.rng() - 0.5) * 3 - s, 0, p.z + (ctx.rng() - 0.5) * 3 - s, p.x + (ctx.rng() - 0.5) * 3 + s, s * 0.7, p.z + (ctx.rng() - 0.5) * 3 + s, { rotY: ctx.rng() * 3, color: tint(0x9a968c) }) }
      decal(ctx, "paper", p.x + 1, 0, p.z - 0.5, 1.4, 1.4, "up", 0xffffff, ctx.rng() * 3)
      decal(ctx, "crack", p.x, 0, p.z, 3, 3, "up", 0xffffff, ctx.rng() * 3)
      return
    }
    case "cones": {
      for (let i = 0; i < 3; i++) {
        const x = p.x + i * 0.9, z = p.z + (i % 2) * 0.5
        place(metal, t.cone, x, 0.36, z, 0, 0, 0, 0.18, 0.72, 0.18, 0xe8661c)
        place(metal, t.cyl8, x, 0.42, z, 0, 0, 0, 0.115, 0.1, 0.115, 0xeeeeee)
        metal.box(x - 0.22, 0, z - 0.22, x + 0.22, 0.04, z + 0.22, { color: tint(0x2a2a2a), ao: 0 })
      }
      return
    }
    case "bollard": { ctx.inst("bollard", p.x, 0, p.z, 0, [1, 1, 1], 0x2a2c2e); return }
    case "post": { place(metal, t.cyl8, p.x, (p.h ?? 4) / 2, p.z, 0, 0, 0, p.r ?? 0.12, p.h ?? 4, p.r ?? 0.12, 0x6a6e72); return }
    case "boom": {
      const w = p.w ?? 6
      place(metal, t.box, p.x, 1.05 + w * 0.47, p.z + 0.05, 0.15, 0, 0, 0.1, w * 0.95, 0.1, 0xe8e4dc)
      for (let i = 1; i < 6; i += 2) place(metal, t.box, p.x, 1.05 + w * 0.47 * (i / 3) * 0.95, p.z + 0.05 + Math.sin(0.15) * w * 0.47 * (i / 3 - 1), 0.15, 0, 0, 0.105, w * 0.16, 0.105, 0xc02820)
      return
    }
    case "cdoors": return containerDoors(ctx, p)
    case "ship": return ship(ctx, p)
    case "crane": return crane(ctx, p)
    case "stackerboom": {
      const b = ctx.B("metal"), c = tint(0xc69c2c)
      place(b, t.box, p.x, 4.6, p.z + 1.5, -0.5, 0, 0, 0.7, 0.8, 9.5, c)
      place(b, t.box, p.x, 6.7, p.z + 5.6, 0, 0, 0, 2.6, 0.35, 0.5, tint(0x3a3c3e))
      return
    }
    case "puddle": { decal(ctx, "puddle", p.x, 0.005, p.z, p.w ?? 3, p.d ?? 2, "up", 0xffffff, ctx.rng() * 3); return }
    case "lifebuoy": {
      place(metal, t.cyl8, p.x, 0.6, p.z, 0, 0, 0, 0.04, 1.2, 0.04, 0x8a8e92)
      place(metal, t.torus, p.x, 1.05, p.z + 0.06, Math.PI / 2, 0, 0, 0.32, 0.32, 0.32, 0xe8601c)
      return
    }
    case "helipad": {
      decal(ctx, "helipad", p.x, 0.01, p.z, (p.r ?? 7) * 2, (p.r ?? 7) * 2, "up")
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = (p.r ?? 7) + 1.2; ctx.glow.add(p.x + Math.cos(a) * r, 0.15, p.z + Math.sin(a) * r, 0.25, i % 2 ? 0x40ff80 : 0x3a8aff, 1.1 * (0.5 + L.night), [0.2, 3, i]) }
      return
    }
    case "windsock": {
      const h = p.h ?? 6
      place(metal, t.cyl8, p.x, h / 2, p.z, 0, 0, 0, 0.05, h, 0.05, 0x8a8e92)
      for (let i = 0; i < 4; i++) place(metal, t.cyl8, p.x + 0.4 + i * 0.42, h - 0.3 - i * 0.06, p.z, 0, 0, Math.PI / 2 - 0.12, 0.28 - i * 0.04, 0.4, 0.28 - i * 0.04, i % 2 ? 0xeeeeee : 0xe8601c)
      ctx.glow.add(p.x, h + 0.1, p.z, 0.3, 0xff3020, 1.5, [3, 0.6, 0])
      return
    }
    case "tower": return tower(ctx, p)
    case "searchlight": ctx.searchlights.push({ x: p.x, y: p.y ?? 8, z: p.z, rot: p.rot ?? 0, amp: p.v ?? 0.8, dist: p.r ?? 28, phase: ctx.searchlights.length * 1.7 }); return
    case "sign": {
      place(metal, t.cyl8, p.x, 1, p.z, 0, 0, 0, 0.04, 2, 0.04, 0x8a8e92)
      decal(ctx, "restricted", p.x + 0.07, 1.3, p.z, 2.1, 0.7, "e")
      return
    }
    case "lattice": {
      const h = p.h ?? 30, b = ctx.B("truss"), c = tint(0xb8b8b8)
      b.box(p.x - 0.7, 1.2, p.z - 0.7, p.x + 0.7, h, p.z + 0.7, { local: true, color: c, ao: 0, skip: PY | NY })
      for (const y of [h * 0.5, h]) ctx.glow.add(p.x, y + 0.2, p.z, 0.8, 0xff2a18, 2.6, [3, 0.5, y])
      for (const [ax, az] of [[14, 8], [-14, 8], [0, -16]]) { sag(ctx, p.x, h * 0.75, p.z, p.x + ax, 0.1, p.z + az, 0.3, 4); sag(ctx, p.x, h * 0.4, p.z, p.x + ax * 0.6, 0.1, p.z + az * 0.6, 0.2, 3) }
      return
    }
    case "radar": {
      ctx.radars.push([p.x, p.y ?? 3, p.z])
      place(metal, t.cyl12, p.x, (p.y ?? 3) + 0.6, p.z, 0, 0, 0, 0.6, 1.2, 0.6, 0x8a8e92)
      return
    }
    case "cable": {
      const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, len = Math.hypot(x2 - p.x, z2 - p.z)
      place(ctx.B("rubber"), t.cyl8, (p.x + x2) / 2, 0.04, (p.z + z2) / 2, Math.PI / 2, Math.atan2(x2 - p.x, z2 - p.z), 0, 0.04, len, 0.04, 0x1a1a1a)
      return
    }
    case "breach": return
    default: return
  }
}

/** Catenary wire from a to b (sagging by `sag` m) as line segments. */
function sag(ctx: BuildCtx, ax: number, ay: number, az: number, bx: number, by: number, bz: number, s: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n
    const y0 = ay + (by - ay) * t0 - s * 4 * t0 * (1 - t0), y1 = ay + (by - ay) * t1 - s * 4 * t1 * (1 - t1)
    ctx.lines.push(ax + (bx - ax) * t0, y0, az + (bz - az) * t0, ax + (bx - ax) * t1, y1, az + (bz - az) * t1)
  }
}

function tank(ctx: BuildCtx, p: MapProp): void {
  const t = tpl(), metal = ctx.B("metal"), r = p.r ?? 4, h = p.h ?? 8, c = tint(p.tint, 1, jit(p))
  place(metal, t.cyl24, p.x, h / 2, p.z, 0, 0, 0, r, h, r, c, [Math.PI * 2 * r, h])
  place(metal, t.cone, p.x, h + r * 0.06, p.z, 0, 0, 0, r * 1.01, r * 0.12, r * 1.01, tint(p.tint, 1, 0.85))
  if (r > 2.5) {
    for (let y = 2.5; y < h - 0.5; y += 2.5) place(metal, t.cyl24, p.x, y, p.z, 0, 0, 0, r + 0.025, 0.1, r + 0.025, tint(p.tint, 1, 0.8))
    place(ctx.B("concrete"), t.cyl24, p.x, 0.12, p.z, 0, 0, 0, r + 0.12, 0.24, r + 0.12, tint(0x9a968c))
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; place(metal, t.cyl8, p.x + Math.cos(a) * r * 0.97, h + 0.55, p.z + Math.sin(a) * r * 0.97, 0, 0, 0, 0.03, 1.1, 0.03, 0xc9a227) }
    place(metal, t.ring, p.x, h + 1.1, p.z, 0, 0, 0, r * 0.97, r * 0.97, r * 0.97, 0xc9a227)
    const la = Math.PI * 0.75, lx = p.x + Math.cos(la) * (r + 0.12), lz = p.z + Math.sin(la) * (r + 0.12)
    for (const off of [-0.25, 0.25]) place(metal, t.box, lx - Math.sin(la) * off, h / 2, lz + Math.cos(la) * off, 0, -la, 0, 0.05, h, 0.05, 0xc9a227)
    for (let y = 0.4; y < h; y += 0.4) place(metal, t.box, lx, y, lz, 0, -la, 0, 0.03, 0.03, 0.5, 0xc9a227)
    if (p.text) decal(ctx, textKey(ctx, 0, p.text), p.x, h * 0.45, p.z + r + 0.05, r * 0.9, r * 0.45, "s")
  }
}

function mast(ctx: BuildCtx, p: MapProp): void {
  const t = tpl(), metal = ctx.B("metal"), L = ctx.look, h = p.h ?? 12, rot = p.rot ?? 0, heads = p.v ?? 2
  place(metal, t.cyl8, p.x, h / 2, p.z, 0, 0, 0, 0.16, h, 0.16, 0x7a7e82, [1, h])
  const fx = -Math.sin(rot), fz = -Math.cos(rot), sx = -fz, sz = fx
  place(metal, t.box, p.x + fx * 0.25, h - 0.1, p.z + fz * 0.25, 0, rot, 0, heads * 0.75 + 0.2, 0.12, 0.12, 0x4a4e52)
  for (let i = 0; i < heads; i++) {
    const off = (i - (heads - 1) / 2) * 0.75, hx = p.x + fx * 0.45 + sx * off, hz = p.z + fz * 0.45 + sz * off
    place(metal, t.box, hx, h - 0.35, hz, -0.5, rot, 0, 0.6, 0.45, 0.25, 0x3a3e42)
    if (L.lamps > 0) {
      const tx = p.x + fx * h * 0.75 + sx * off * 3, tz = p.z + fz * h * 0.75 + sz * off * 3
      ctx.B("lamp").box(hx - 0.22, h - 0.55, hz - 0.22, hx + 0.22, h - 0.5, hz + 0.22, { color: tint(L.lampColor, 1, 2.6), ao: 0 })
      ctx.glow.add(hx + fx * 0.15, h - 0.6, hz + fz * 0.15, 1.3, L.lampColor, 1.1 * L.lamps, [0.03, 13, i + p.x])
      ctx.pool.add(tx, tz, h * 0.65, h * 0.65, L.lampColor, 0.14 * L.lamps)
      if (L.shafts > 0) ctx.cone.add(hx, h - 0.6, hz, tx, 0, tz, h * 0.45, L.lampColor, 0.06 * L.shafts)
    }
  }
}

function tower(ctx: BuildCtx, p: MapProp): void {
  const t = tpl(), metal = ctx.B("metal"), L = ctx.look, base = 2.8, top = p.h ?? 7, s = 1.5
  const olive = tint(0x4f5a3c), steel = tint(0x55595c)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) place(metal, t.box, p.x + dx * (s - 0.12), (base + top) / 2, p.z + dz * (s - 0.12), 0, 0, 0, 0.18, top - base, 0.18, steel)
  for (const y of [base + 1.4, top - 0.6]) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
    const cx = p.x + (ax + bx) / 2 * (s - 0.12), cz = p.z + (az + bz) / 2 * (s - 0.12), len = Math.hypot(bx - ax, bz - az) * (s - 0.12)
    place(metal, t.box, cx, y, cz, 0, Math.atan2(bx - ax, bz - az), 0, 0.08, 0.08, len, steel)
  }
  metal.box(p.x - s - 0.3, top, p.z - s - 0.3, p.x + s + 0.3, top + 0.2, p.z + s + 0.3, { color: steel, ao: 0 })
  ctx.B("siding").box(p.x - s, top + 0.2, p.z - s, p.x + s, top + 1.1, p.z + s, { color: olive, ao: 0 })
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) metal.box(p.x + dx * s - 0.08, top + 1.1, p.z + dz * s - 0.08, p.x + dx * s + 0.08, top + 2.3, p.z + dz * s + 0.08, { color: olive, ao: 0, local: true })
  ctx.B("glass").box(p.x - s + 0.1, top + 1.1, p.z - s + 0.1, p.x + s - 0.1, top + 2.3, p.z + s - 0.1, { local: true, ao: 0, color: tint(0x6a7a8a) })
  metal.box(p.x - s - 0.45, top + 2.3, p.z - s - 0.45, p.x + s + 0.45, top + 2.5, p.z + s + 0.45, { color: olive, ao: 0 })
  for (let y = base + 0.2; y < top; y += 0.35) place(metal, t.box, p.x + s + 0.05, y, p.z, 0, 0, 0, 0.04, 0.04, 0.6, steel)
  ctx.glow.add(p.x, top + 1.6, p.z, 1.4, 0xffb060, 0.35 * (0.3 + L.night), [0.1, 3, p.x])
  ctx.glow.add(p.x, top + 2.6, p.z, 0.35, 0xff2a18, 2, [3, 0.45, p.z])
}

function containerDoors(ctx: BuildCtx, p: MapProp): void {
  const alongX = (p.w ?? 0) > (p.d ?? 0), L = alongX ? p.w ?? 12 : p.d ?? 12, c = tint(p.tint, 1, 0.92), b = ctx.B("container")
  for (const e of [-1, 1]) for (const side of [-1, 1]) {
    const end = e * L / 2
    if (alongX) b.box(p.x + end + (e > 0 ? 0 : -1.15), 0.05, p.z + side * 1.27 - 0.03, p.x + end + (e > 0 ? 1.15 : 0), 2.5, p.z + side * 1.27 + 0.03, { color: c, ao: 0.2 })
    else b.box(p.x + side * 1.27 - 0.03, 0.05, p.z + end + (e > 0 ? 0 : -1.15), p.x + side * 1.27 + 0.03, 2.5, p.z + end + (e > 0 ? 1.15 : 0), { color: c, ao: 0.2 })
  }
  ctx.glow.add(p.x, 2.3, p.z, 0.5, 0xffe0b0, 0.25 + 0.3 * ctx.look.night, [0.2, 23, p.z])
}

function crane(ctx: BuildCtx, p: MapProp): void {
  const metal = ctx.B("metal"), truss = ctx.B("truss"), L = ctx.look, c = tint(p.tint, 1, 1), t = tpl()
  const x0 = p.x - (p.w ?? 16) / 2, x1 = p.x + (p.w ?? 16) / 2, zc = p.z, dz = (p.d ?? 14) / 2, H = p.h ?? 24
  for (const z of [zc - dz, zc + dz]) metal.box(x0 - 0.7, H - 2, z - 0.7, x1 + 0.7, H, z + 0.7, { color: c, ao: 0 })
  for (const x of [x0, x1]) metal.box(x - 0.7, H - 2, zc - dz + 0.7, x + 0.7, H, zc + dz - 0.7, { color: c, ao: 0 })
  for (const x of [x0, x1]) for (const z of [zc - dz, zc + dz]) metal.box(x - 0.5, 9, z - 0.5, x + 0.5, 10, z + 0.5, { color: c, ao: 0 })
  for (const x of [x0, x1]) metal.box(x - 0.45, 9, zc - dz + 0.5, x + 0.45, 9.8, zc + dz - 0.5, { color: c, ao: 0 })
  metal.box(x0 + 2, H, zc - 4, x1 - 3, H + 4, zc + 4, { color: tint(0xd8d6d0), ao: 0 })
  ctx.windows.push({ x: x0 + 2, y: H + 1.2, z: zc, w: 3, h: 1.4, face: "w", cell: 4 })
  const by = H + 7, bx0 = x0 - 14, bx1 = x1 + 48
  truss.box(bx0, by, zc - 1.5, bx1, by + 2.4, zc + 1.5, { local: true, color: c, ao: 0, skip: PY | NY })
  metal.box(bx0, by + 2.3, zc - 1.6, bx1, by + 2.5, zc + 1.6, { color: c, ao: 0 })
  metal.box(bx0, by - 0.1, zc - 1.6, bx1, by, zc - 1.3, { color: c, ao: 0 }); metal.box(bx0, by - 0.1, zc + 1.3, bx1, by, zc + 1.6, { color: c, ao: 0 })
  for (const s of [-1, 1]) {
    place(metal, t.box, p.x - 1, H + 12, zc + s * 2.2, 0, 0, 0.18, 0.6, 12, 0.6, c)
    place(metal, t.box, p.x + 1.5, H + 12, zc + s * 2.2, 0, 0, -0.18, 0.6, 12, 0.6, c)
  }
  const apex = H + 18
  ctx.lines.push(p.x, apex, zc, bx1 - 4, by + 2.4, zc, p.x, apex, zc, bx0 + 3, by + 2.4, zc, p.x, apex, zc, p.x + 22, by + 2.4, zc)
  const tx = x1 + 6 + (p.v ?? 0) * 9
  metal.box(tx - 2, by - 1.2, zc - 1.3, tx + 2, by, zc + 1.3, { color: tint(0x3a3c3e), ao: 0 })
  const sy = 13 + (p.v ?? 0) * 5
  metal.box(tx - 1.3, sy, zc - 6, tx + 1.3, sy + 0.4, zc + 6, { color: tint(0xc69c2c), ao: 0 })
  for (const o of [-1.2, 1.2]) ctx.lines.push(tx + o, by - 1.2, zc - 1, tx + o, sy + 0.4, zc - 4, tx + o, by - 1.2, zc + 1, tx + o, sy + 0.4, zc + 4)
  ctx.glow.add(p.x, apex + 0.5, zc, 1.2, 0xff2a18, 2.6, [3, 0.5, zc])
  ctx.glow.add(bx1, by + 2.8, zc, 1.1, 0xff2a18, 2.6, [3, 0.5, zc + 1])
  ctx.glow.add(bx0, by + 2.8, zc, 1.1, 0xff2a18, 2.6, [3, 0.5, zc + 2])
  for (const lx of [x0 + 1, x1 - 1, x1 + 12]) {
    ctx.glow.add(lx, by - 0.4, zc, 1.6, L.lampColor, 1.0 * L.lamps, [0.02, 9, lx])
    ctx.pool.add(lx, zc, 9, 9, L.lampColor, 0.12 * L.lamps)
    if (L.shafts > 0) ctx.cone.add(lx, by - 0.5, zc, lx, 0, zc, 6, L.lampColor, 0.04 * L.shafts)
  }
}

function ship(ctx: BuildCtx, p: MapProp): void {
  const metal = ctx.B("metal"), w = p.w ?? 30, len = p.d ?? 170, h = p.h ?? 12, L = ctx.look
  const x0 = p.x - w / 2, x1 = p.x + w / 2, z0 = p.z - len / 2, z1 = p.z + len / 2
  metal.box(x0, -6, z0 + 8, x1, h, z1 - 14, { color: tint(0x1d2633), ao: 0 })
  metal.box(x0 + 3, -6, z0, x1 - 3, h, z0 + 8, { color: tint(0x1d2633), ao: 0 })
  metal.box(x0 + 4, -6, z1 - 14, x1 - 4, h + 1.5, z1, { color: tint(0x1d2633), ao: 0 })
  metal.box(x0 - 0.02, -1.2, z0 + 8, x0, -0.6, z1 - 14, { color: tint(0x6a1c18), ao: 0 })
  metal.box(x0 - 0.03, h - 0.6, z0 + 8, x0 + 0.1, h, z1 - 14, { color: tint(0xdcdcd4), ao: 0 })
  const rng = mulberry(990), cols = [0x9a3328, 0x2d557f, 0x3f6c48, 0xc4651f, 0x7c8186, 0x2f7174, 0xc4c2b8, 0x6e4b33]
  for (let bay = 0; bay < 9; bay++) {
    const zb = z0 + 12 + bay * 14
    if (zb + 13 > z1 - 40) break
    for (let c = 0; c < 10; c++) {
      const xc = x0 + 2.6 + c * 2.5, n = 2 + Math.floor(rng() * 5)
      ctx.B("container").box(xc, h, zb, xc + 2.44, h + n * 2.6, zb + 12.2, { color: tint(cols[Math.floor(rng() * cols.length)], 1, 0.9 + rng() * 0.2), ao: 0.05 })
    }
  }
  const ax = p.x, az = z1 - 26
  ctx.B("plaster").box(ax - 12, h, az - 7, ax + 12, h + 22, az + 7, { color: tint(0xe0ded6), ao: 0 })
  ctx.B("plaster").box(ax - 15, h + 20, az - 6, ax + 15, h + 23, az + 4, { color: tint(0xe0ded6), ao: 0 })
  metal.box(ax - 3, h + 22, az + 2, ax + 3, h + 30, az + 6, { color: tint(0x2a2c30), ao: 0 })
  for (let y = h + 2; y < h + 20; y += 3) for (let i = -4; i <= 4; i++) {
    const cell = rng() < 0.55 ? 4 + Math.floor(rng() * 2) : 0
    ctx.windows.push({ x: ax - 12, y, z: az + i * 1.4, w: 1.0, h: 1.2, face: "w", cell })
  }
  for (let i = 0; i < 12; i++) ctx.glow.add(x0 - 0.3, h + 0.6, z0 + 10 + i * 12, 0.7, 0xffd8a0, 0.9 * (0.4 + L.night), [0, 0, 0])
  ctx.glow.add(ax, h + 31, az + 4, 0.9, 0xffffff, 2, [2, 0.9, 0]); ctx.glow.add(x0, h + 23, az, 0.8, 0xff2020, 1.8); ctx.glow.add(x1, h + 23, az, 0.8, 0x20ff60, 1.8)
  ctx.lines.push(ax, h + 30, az + 4, p.x, h + 4, z0 + 2, ax, h + 30, az + 4, p.x, h + 4, z1)
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings: facade windows for upper storeys, clerestory strips, downpipes
// ---------------------------------------------------------------------------------------------------------------
export function buildBuildingDetails(ctx: BuildCtx): void {
  const t = tpl(), metal = ctx.B("metal"), L = ctx.look
  const ids = new Map((ctx.layout.buildings ?? []).map(b => [b.id, b]))
  for (const d of ctx.layout.doorways ?? []) {
    const b = ids.get(d.building); if (!b) continue
    const top = Math.min(b.h - 0.25, d.w > 3 ? 4.9 : 2.85), lx = d.x + d.nx * 0.42, lz = d.z + d.nz * 0.42
    metal.box(lx - 0.18 - Math.abs(d.nx) * 0.1, top, lz - 0.18 - Math.abs(d.nz) * 0.1, lx + 0.18 + Math.abs(d.nx) * 0.1, top + 0.14, lz + 0.18 + Math.abs(d.nz) * 0.1, { color: tint(0x2c2e30), ao: 0 })
    ctx.B("lamp").box(lx - 0.12, top - 0.03, lz - 0.12, lx + 0.12, top, lz + 0.12, { color: tint(0xffe6b8, 1, 2), ao: 0 })
    ctx.glow.add(lx + d.nx * 0.1, top - 0.12, lz + d.nz * 0.1, 0.55, 0xffe2b0, 0.55 + 0.6 * L.night, [0.04, 15, d.x])
    ctx.pool.add(d.x + d.nx * 1.6, d.z + d.nz * 1.6, 3.2, 3.2, 0xffd8a0, 0.1 + 0.18 * L.night)
  }
  for (const b of ctx.layout.buildings ?? []) {
    for (const [x, z] of [[b.x0 - 0.08, b.z0 - 0.08], [b.x1 + 0.08, b.z0 - 0.08], [b.x0 - 0.08, b.z1 + 0.08], [b.x1 + 0.08, b.z1 + 0.08]]) {
      const top = b.h + b.upper
      place(metal, t.cyl8, x, top / 2, z, 0, 0, 0, 0.06, top, 0.06, 0x7a7e82)
      if (ctx.rng() < 0.7) ctx.weeds.push([x, z, 1])
    }
    const faces: Array<[Side, number]> = [["n", b.x1 - b.x0], ["s", b.x1 - b.x0], ["e", b.z1 - b.z0], ["w", b.z1 - b.z0]]
    for (const [f, len] of faces) {
      const pos = (u: number): [number, number] => f === "n" ? [b.x0 + u, b.z0] : f === "s" ? [b.x0 + u, b.z1] : f === "e" ? [b.x1, b.z0 + u] : [b.x0, b.z0 + u]
      if (b.upper > 0) {
        const n = Math.floor((len - 1) / 2.6)
        for (let i = 0; i < n; i++) { const [x, z] = pos((len - n * 2.6) / 2 + (i + 0.5) * 2.6); ctx.windows.push({ x, y: b.h + 0.85, z, w: 1.8, h: 1.55, face: f, cell: windowCell(ctx) }) }
      } else if ((b.style === "cladding" || b.style === "block") && b.h >= 5.5 && len > 15) {
        const n = Math.floor(len / 4.2)
        for (let i = 0; i < n; i++) { const [x, z] = pos((len - n * 4.2) / 2 + (i + 0.5) * 4.2); ctx.windows.push({ x, y: b.h - 1.9, z, w: 2.6, h: 0.9, face: f, cell: ctx.rng() < 0.35 ? 1 : ctx.rng() < 0.5 ? 0 : 2 }) }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fences and the map perimeter
// ---------------------------------------------------------------------------------------------------------------
function fenceRun(ctx: BuildCtx, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, barbed: boolean, every = 3): void {
  const len = Math.hypot(bx - ax, bz - az); if (len < 0.2) return
  const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx
  const fence = ctx.B("fence"), c = tint(0xb4b8bc)
  fence.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [nx, 0, nz], [0, y0, len, y0, len, y1, 0, y1], c)
  const n = Math.max(1, Math.round(len / every))
  for (let i = 0; i <= n; i++) ctx.inst("post", ax + dx * len * i / n, 0, az + dz * len * i / n, 0, [1, y1 + (barbed ? 0.45 : 0.05), 1], 0x8a8e92)
  const t = tpl()
  place(ctx.B("metal"), t.cyl8, (ax + bx) / 2, y1, (az + bz) / 2, Math.PI / 2, Math.atan2(dx, dz), 0, 0.025, len, 0.025, 0x8a8e92)
  if (barbed) {
    const cb = ctx.B("concertina"), r = 0.32, yc = y1 + 0.32
    cb.quad([ax, yc - r, az], [bx, yc - r, bz], [bx, yc + r, bz], [ax, yc + r, az], [nx, 0, nz], [0, 0, len, 0, len, 1, 0, 1], tint(0xc8ccd0))
    cb.quad([ax - nx * r, yc, az - nz * r], [bx - nx * r, yc, bz - nz * r], [bx + nx * r, yc, bz + nz * r], [ax + nx * r, yc, az + nz * r], [0, 1, 0], [0, 0, len, 0, len, 1, 0, 1], tint(0xc8ccd0))
  }
  if (ctx.high || ctx.rng() < 0.4) for (let s = 0.5; s < len; s += 1.6 + ctx.rng() * 2.5) ctx.weeds.push([ax + dx * s + nx * (ctx.rng() - 0.5) * 0.6, az + dz * s + nz * (ctx.rng() - 0.5) * 0.6, 0.8 + ctx.rng() * 0.5])
}

export function buildFences(ctx: BuildCtx): void {
  for (const p of ctx.layout.props ?? []) if (p.kind === "fence") fenceRun(ctx, p.x, p.z, p.x2 ?? p.x, p.z2 ?? p.z, 0.35, 2.4, p.v === 1)
}

export function buildPerimeter(ctx: BuildCtx): void {
  const L = ctx.layout, b = L.bounds, per = L.perimeter ?? {}
  const breaches = (L.props ?? []).filter(p => p.kind === "breach")
  for (const side of ["n", "e", "s", "w"] as Side[]) {
    const style = per[side]?.style ?? "fence"
    const alongX = side === "n" || side === "s"
    const c = side === "n" ? b.minZ : side === "s" ? b.maxZ : side === "w" ? b.minX : b.maxX
    const out = side === "n" || side === "w" ? -1 : 1
    const s0 = (alongX ? b.minX : b.minZ) - 0.3, s1 = (alongX ? b.maxX : b.maxZ) + 0.3
    const gates = (L.gates ?? []).filter(g => g.side === side)
    const gaps: Array<[number, number, string]> = gates.map(g => [g.at - g.w / 2, g.at + g.w / 2, "gate"])
    for (const br of breaches) { const onSide = alongX ? Math.abs(br.z - c) < 1 : Math.abs(br.x - c) < 1; if (onSide) gaps.push([(alongX ? br.x : br.z) - 1.6, (alongX ? br.x : br.z) + 1.6, "breach"]) }
    gaps.sort((p, q) => p[0] - q[0])
    const P2 = (s: number, off: number): [number, number] => alongX ? [s, c + out * off] : [c + out * off, s]
    const runs: Array<[number, number]> = []
    let cur = s0
    for (const [a, e] of gaps) { runs.push([cur, a]); cur = e }
    runs.push([cur, s1])
    if (style === "quay") {
      const concrete = ctx.B("concrete"), level = L.water?.level ?? -2.3
      const [qx0, qz0] = P2(s0 - 30, 0), [qx1, qz1] = P2(s1 + 1, 1)
      concrete.box(Math.min(qx0, qx1), level - 0.5, Math.min(qz0, qz1), Math.max(qx0, qx1), 0, Math.max(qz0, qz1), { color: tint(0x7a7a76), skip: PY, ao: 0 })
      const [kx0, kz0] = P2(s0 - 30, 0.55), [kx1, kz1] = P2(s1 + 1, 0.95)
      concrete.box(Math.min(kx0, kx1), 0, Math.min(kz0, kz1), Math.max(kx0, kx1), 0.18, Math.max(kz0, kz1), { color: tint(0xc9a227), ao: 0 })
      for (let s = s0 - 28; s < s1; s += 8) { const [fx, fz] = P2(s, 1.05); ctx.B("rubber").box(fx - (alongX ? 0.6 : 0.2), level + 0.3, fz - (alongX ? 0.2 : 0.6), fx + (alongX ? 0.6 : 0.2), -0.3, fz + (alongX ? 0.2 : 0.6), { color: tint(0x222222), ao: 0 }) }
      for (let s = s0 - 28; s < s1; s += 3) { const [px, pz] = P2(s, 0.3); ctx.inst("chainpost", px, 0, pz, 0, [1, 1, 1], 0xc9a227) }
      for (let s = s0 - 28; s < s1 - 3; s += 3) { const [ax, az] = P2(s, 0.3), [bx, bz] = P2(s + 3, 0.3); sag(ctx, ax, 0.95, az, bx, 0.95, bz, 0.12, 4) }
      continue
    }
    for (const [a, e] of runs) {
      if (e - a < 0.3) continue
      const [ax, az] = P2(a, 0.12), [bx, bz] = P2(e, 0.12)
      if (style === "wall") {
        const [wx0, wz0] = P2(a, 0), [wx1, wz1] = P2(e, 0.3)
        ctx.B("brick").box(Math.min(wx0, wx1), 0, Math.min(wz0, wz1), Math.max(wx0, wx1), 2.5, Math.max(wz0, wz1), { color: tint(0xa06a50, 0.3) })
        ctx.B("concrete").box(Math.min(wx0, wx1) - 0.04, 2.5, Math.min(wz0, wz1) - 0.04, Math.max(wx0, wx1) + 0.04, 2.62, Math.max(wz0, wz1) + 0.04, { color: tint(0xa8a49a), ao: 0 })
        for (let s = a + 3; s < e - 1; s += 6) { const [px, pz] = P2(s, 0); ctx.B("brick").box(px - (alongX ? 0.25 : 0.05), 0, pz - (alongX ? 0.05 : 0.25), px + (alongX ? 0.25 : 0.35), 2.7, pz + (alongX ? 0.35 : 0.25), { color: tint(0x9a6650, 0.3) }) }
        if (ctx.rng() < 0.5) { const s = a + (e - a) * ctx.rng(), [gx, gz] = P2(s, -0.02); decal(ctx, `graffiti${Math.floor(ctx.rng() * 3)}`, gx, 0.4, gz, 2.8, 1, side === "w" ? "e" : side === "e" ? "w" : side === "n" ? "s" : "n") }
        for (let s = a; s < e; s += 1 + ctx.rng() * 2) { const [wx, wz] = P2(s, -0.25); ctx.weeds.push([wx, wz, 1]) }
        continue
      }
      const [px0, pz0] = P2(a, 0), [px1, pz1] = P2(e, 0.26)
      ctx.B("concrete").box(Math.min(px0, px1), 0, Math.min(pz0, pz1), Math.max(px0, px1), 0.35, Math.max(pz0, pz1), { color: tint(0xa8a49a) })
      fenceRun(ctx, ax, az, bx, bz, 0.35, 2.5, style === "double")
      if (style === "double") {
        const [ox0, oz0] = P2(a - 4, 4.2), [ox1, oz1] = P2(e + 4, 4.2)
        fenceRun(ctx, ox0, oz0, ox1, oz1, 0.05, 2.7, true, 3.5)
        for (let s = a + 6; s < e - 2; s += 24) { const [sx, sz] = P2(s, 0.06); decal(ctx, "restricted", sx, 1.4, sz, 1.6, 0.55, side === "w" ? "e" : side === "e" ? "w" : side === "n" ? "s" : "n") }
        for (let s = a + 9; s < e - 2; s += 18) {
          const [lx, lz] = P2(s, 0.6), [ix, iz] = P2(s, -0.3)
          place(ctx.B("metal"), tpl().cyl8, lx, 1.8, lz, 0, 0, 0, 0.06, 3.6, 0.06, 0x6a6e72)
          ctx.glow.add(ix, 3.5, iz, 0.7, 0xffc890, 0.9 * ctx.look.lamps, [0.04, 11, s])
          ctx.pool.add(ix, iz, 4, 4, 0xffc890, 0.12 * ctx.look.lamps)
        }
      } else if (ctx.rng() < 0.4) { const s = a + (e - a) * ctx.rng(), [sx, sz] = P2(s, -0.05); decal(ctx, "noentry", sx, 1.3, sz, 1.4, 0.7, side === "w" ? "e" : side === "e" ? "w" : side === "n" ? "s" : "n") }
    }
    for (const [a, e, kind] of gaps) {
      if (kind === "gate") {
        const [ax, az] = P2(a, 0.12), [bx, bz] = P2(e, 0.12)
        fenceRun(ctx, ax, az, bx, bz, 0.08, 2.3, style === "double", (e - a) / 2)
        const m = ctx.B("metal"), cc = tint(0x5a5e62), [mx, mz] = P2((a + e) / 2, 0.12)
        for (const [px, pz] of [[ax, az], [bx, bz]]) m.box(px - 0.12, 0, pz - 0.12, px + 0.12, 2.6, pz + 0.12, { color: cc, local: true })
        place(m, tpl().box, mx, 0.1, mz, 0, alongX ? Math.PI / 2 : 0, 0, 0.08, 0.08, e - a, 0x5a5e62)
        decal(ctx, "noentry", mx, 1.1, mz + (alongX ? -out * 0.04 : 0), 1.3, 0.65, side === "w" ? "e" : side === "e" ? "w" : side === "n" ? "s" : "n")
      } else {
        const [bx, bz] = P2(a + 0.4, 0.4), fence = ctx.B("fence"), tc = tint(0xd0d4d8)
        fence.quad([bx, 0.35, bz], [bx + (alongX ? 1.4 : out * 0.9), 0.15, bz + (alongX ? out * 0.9 : 1.4)], [bx + (alongX ? 1.3 : out * 0.9), 1.9, bz + (alongX ? out * 1.4 : 1.3)], [bx, 2.4, bz], [0, 0, 1], [0, 0, 1.6, 0, 1.6, 2, 0, 2], tc)
        for (let i = 0; i < 6; i++) ctx.weeds.push([bx + (ctx.rng() - 0.5) * 3, bz + (ctx.rng() - 0.5) * 2, 1.2])
      }
    }
  }
}
