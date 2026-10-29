/**
 * zoneprops.ts — geometry for the zone and base additions (styles and prop kinds the phase-1 maps never used): pitched
 * roofs, chimneys, church spire, water towers, smokestack, silos, tents, hay bales, campfires, hunting stands, freight
 * and tank wagons, armoured vehicles, tractors, logs, rock cliffs, gravel heaps, quay walls, railway track, quarry
 * hopper and conveyor, excavator, scrap piles, targets, level-crossing signs, tunnel portal, base furniture, palisades
 * and steel walls, and the zone's outer double fence. Hooked into props.ts through registerExtras (import this module
 * once for its side effect). Visual details stay inside a solid's box, so collision keeps matching the picture.
 */
import * as THREE from "three"
import type { BuildingInfo, MapProp, MapSolid, Side } from "./maps"
import { NY, PY, type GeoBatch } from "./meshkit"
import { decal, fenceRun, jit, lampAt, place, registerExtras, sag, textKey, tint, tpl, type BuildCtx, type WindowReq } from "./props"

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler()

registerExtras({ solid: extraSolid, prop: extraProp, facade, window: facadeWindow, door: facadeDoor })

// ---------------------------------------------------------------------------------------------------------------
// Facades: cornice, string course, plinth, balconies above the entrance, window sills/lintels, boarded windows,
// shutters, soot and graffiti (the zone is abandoned), door frames with steps and canopies
// ---------------------------------------------------------------------------------------------------------------
const TRIMMED = new Set(["plaster", "brick", "block"])
const N: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
/** Box on a facade: centre (x, z) on the wall plane, `along` width, y range, depth outward from the wall (d0..d1). */
function onWall(b: GeoBatch, f: Side, x: number, z: number, along: number, y0: number, y1: number, d0: number, d1: number, c: THREE.Color, o: { ao?: number; local?: boolean } = {}): void {
  const [nx, nz] = N[f], h = along / 2
  if (nz !== 0) b.box(x - h, y0, Math.min(z + nz * d0, z + nz * d1), x + h, y1, Math.max(z + nz * d0, z + nz * d1), { color: c, ao: o.ao ?? 0, local: o.local })
  else b.box(Math.min(x + nx * d0, x + nx * d1), y0, z - h, Math.max(x + nx * d0, x + nx * d1), y1, z + h, { color: c, ao: o.ao ?? 0, local: o.local })
}
function ring(b: GeoBatch, bd: BuildingInfo, y0: number, y1: number, out: number, c: THREE.Color): void {
  b.box(bd.x0 - out, y0, bd.z0 - out, bd.x1 + out, y1, bd.z0, { color: c, ao: 0 })
  b.box(bd.x0 - out, y0, bd.z1, bd.x1 + out, y1, bd.z1 + out, { color: c, ao: 0 })
  b.box(bd.x0 - out, y0, bd.z0, bd.x0, y1, bd.z1, { color: c, ao: 0 })
  b.box(bd.x1, y0, bd.z0, bd.x1 + out, y1, bd.z1, { color: c, ao: 0 })
}
function trimColor(bd: BuildingInfo): THREE.Color { return bd.style === "brick" ? tint(0xc8c0b0, 1, jit({ x: bd.x0, z: bd.z0 })) : bd.style === "block" ? tint(0xa8a49a) : tint(0xece6d8, 1, jit({ x: bd.x0, z: bd.z0 }, 0.04)) }

function facade(ctx: BuildCtx, bd: BuildingInfo): void {
  if (!TRIMMED.has(bd.style)) return
  const conc = ctx.B("concrete"), top = bd.h + bd.upper, c = trimColor(bd), rng = ctx.rng
  if (bd.roof === "gable" || bd.upper > 0) ring(conc, bd, top - 0.3, top, 0.12, c)
  if (bd.upper > 0) ring(conc, bd, bd.h - 0.1, bd.h + 0.06, 0.06, c)
  if (bd.solid) ring(conc, bd, 0, 0.55, 0.06, tint(0x8a8680, 1, 0.9 + rng() * 0.15))
  // balconies stacked above the entrance of taller closed blocks
  if (bd.solid && bd.face && top >= 8.5 && rng() < 0.55) {
    const f = bd.face, len = f === "n" || f === "s" ? bd.x1 - bd.x0 : bd.z1 - bd.z0, n = Math.max(1, Math.floor((len - 0.8) / 2.4))
    const u = (len - n * 2.4) / 2 + (Math.floor(n / 2) + 0.5) * 2.4
    const x = f === "n" || f === "s" ? bd.x0 + u : f === "e" ? bd.x1 : bd.x0, z = f === "e" || f === "w" ? bd.z0 + u : f === "n" ? bd.z0 : bd.z1
    const metal = ctx.B("metal"), rail = tint(rng() < 0.5 ? 0x2a2c2e : 0x6a6e72)
    for (let y = 3.75; y + 2.3 < top; y += 3) {
      onWall(conc, f, x, z, 2.6, y - 0.16, y, 0, 1.05, c)
      onWall(metal, f, x, z, 2.6, y + 0.9, y + 0.96, 1.0, 1.06, rail)
      const [nx, nz] = N[f]
      for (const o of [-1.27, -0.6, 0, 0.6, 1.27]) { const px = nz !== 0 ? x + o : x + nx * 1.03, pz = nz !== 0 ? z + nz * 1.03 : z + o; metal.box(px - 0.025, y, pz - 0.025, px + 0.025, y + 0.92, pz + 0.025, { color: rail, ao: 0 }) }
      for (const o of [-1.3, 1.3]) onWall(metal, f, nz !== 0 ? x + o : x, nz !== 0 ? z : z + o, 0.05, y + 0.9, y + 0.96, 0, 1.03, rail)
      if (rng() < 0.4) onWall(ctx.B("burlap"), f, x, z, 2.4, y + 0.1, y + 0.85, 1.0, 1.02, tint([0x8a3a2a, 0x2d557f, 0x3f6c48, 0xc8b070][Math.floor(rng() * 4)]))
    }
  }
  // graffiti and soot on some ground floors
  if (bd.solid && rng() < 0.35) {
    const f: Side = (["n", "s", "e", "w"] as Side[])[Math.floor(rng() * 4)], [nx, nz] = N[f]
    const x = nz !== 0 ? bd.x0 + (bd.x1 - bd.x0) * (0.2 + rng() * 0.6) : f === "e" ? bd.x1 + 0.01 : bd.x0 - 0.01, z = nx !== 0 ? bd.z0 + (bd.z1 - bd.z0) * (0.2 + rng() * 0.6) : f === "s" ? bd.z1 + 0.01 : bd.z0 - 0.01
    decal(ctx, `graffiti${Math.floor(rng() * 3)}`, x, 0.6, z, 2.6, 0.9, f)
  }
}

function facadeWindow(ctx: BuildCtx, bd: BuildingInfo, w: WindowReq): void {
  const rng = ctx.rng, c = trimColor(bd), conc = ctx.B("concrete"), f = w.face, [nx, nz] = N[f], wall = { x: w.x, z: w.z }
  const ground = w.y < 2, abandoned = bd.solid !== false
  const boarded = abandoned && ((ground && rng() < 0.35) || rng() < 0.06)
  onWall(conc, f, wall.x, wall.z, w.w + 0.26, w.y - 0.12, w.y - 0.03, 0, 0.13, c)
  if (bd.style === "brick") onWall(conc, f, wall.x, wall.z, w.w + 0.2, w.y + w.h + 0.02, w.y + w.h + 0.2, 0, 0.04, c)
  else onWall(conc, f, wall.x, wall.z, w.w + 0.14, w.y + w.h, w.y + w.h + 0.08, 0, 0.03, c)
  ctx.windows.push(boarded ? { ...w, cell: 0 } : w)
  if (boarded) {
    const pl = ctx.B("plank"), n = 3 + Math.floor(rng() * 2), t = tpl()
    for (let i = 0; i < n; i++) {
      const y = w.y + 0.15 + (i + 0.5) * (w.h - 0.2) / n, tilt = (rng() - 0.5) * 0.25, col = tint(0x9a7a58, 1, 0.75 + rng() * 0.4)
      place(pl, t.box, wall.x + nx * 0.06, y, wall.z + nz * 0.06, 0, nz !== 0 ? 0 : Math.PI / 2, tilt, w.w + 0.35, 0.16 + rng() * 0.06, 0.035, col, [w.w + 0.35, 0.2])
    }
  } else if (bd.style === "plaster" && bd.roof === "gable" && rng() < 0.18) {
    const sc = tint([0x3f6c48, 0x2d557f, 0x6e4b33, 0x8a8a7a][Math.floor(rng() * 4)])
    for (const sd of [-1, 1]) {
      const o = sd * (w.w / 2 + 0.33), sx = nz !== 0 ? wall.x + o : wall.x, sz = nz !== 0 ? wall.z : wall.z + o
      onWall(ctx.B("boards"), f, sx, sz, 0.6, w.y, w.y + w.h, 0.01, 0.05, sc)
    }
  }
  if (abandoned && rng() < 0.05) decal(ctx, "soot", wall.x + nx * 0.02, w.y + w.h - 0.2, wall.z + nz * 0.02, w.w + 0.8, 2.2, f)
}

function facadeDoor(ctx: BuildCtx, bd: BuildingInfo, x: number, z: number, f: Side): void {
  const conc = ctx.B("concrete"), c = trimColor(bd), [nx, nz] = N[f], rng = ctx.rng
  decal(ctx, "door", x + nx * 0.01, 0.15, z + nz * 0.01, 1.15, 2.2, f)
  for (const sd of [-1, 1]) { const o = sd * 0.68; onWall(conc, f, nz !== 0 ? x + o : x, nz !== 0 ? z : z + o, 0.14, 0, 2.45, 0, 0.08, c) }
  onWall(conc, f, x, z, 1.5, 2.35, 2.5, 0, 0.08, c)
  onWall(conc, f, x, z, 1.6, 0, 0.15, 0, 0.45, tint(0x9a968c))
  if (rng() < 0.5) onWall(ctx.B("metal"), f, x, z, 1.7, 2.62, 2.7, 0, 0.75, tint(0x4a4e52))
  if (rng() < 0.3) {
    const pl = ctx.B("plank"), t = tpl()
    for (const a of [0.85, -0.85]) place(pl, t.box, x + nx * 0.06, 1.25, z + nz * 0.06, 0, nz !== 0 ? 0 : Math.PI / 2, a, 2.3, 0.18, 0.04, tint(0x8a6a48, 1, 0.8 + rng() * 0.3), [2.3, 0.2])
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Solid styles
// ---------------------------------------------------------------------------------------------------------------
function extraSolid(ctx: BuildCtx, s: MapSolid): boolean {
  const y0 = s.y ?? 0, y1 = y0 + s.h, x0 = s.x - s.w / 2, x1 = s.x + s.w / 2, z0 = s.z - s.d / 2, z1 = s.z + s.d / 2
  const alongX = s.w >= s.d, k = jit(s), t = tpl(), metal = ctx.B("metal")
  switch (s.style) {
    case "bench": case "pew": {
      const wood = ctx.B("plank"), c = tint(s.tint ?? 0x8a6a48, 1, k), seat = Math.min(0.47, s.h)
      wood.box(x0, seat - 0.06, z0, x1, seat, z1, { color: c, ao: 0 })
      const legs = alongX ? [[x0 + 0.1, s.z], [x1 - 0.1, s.z]] : [[s.x, z0 + 0.1], [s.x, z1 - 0.1]]
      for (const [lx, lz] of legs) metal.box(lx - 0.04, y0, lz - (alongX ? s.d / 2 - 0.05 : 0.04), lx + 0.04, seat - 0.06, lz + (alongX ? s.d / 2 - 0.05 : 0.04), { color: tint(0x3a3c3e), ao: 0.2 })
      if (s.style === "pew" || s.h > 0.6) {
        if (alongX) wood.box(x0, seat, z1 - 0.06, x1, y1, z1, { color: c, ao: 0 })
        else wood.box(x1 - 0.06, seat, z0, x1, y1, z1, { color: c, ao: 0 })
      }
      return true
    }
    case "fuelpump": {
      metal.box(x0, y0, z0, x1, y1 - 0.35, z1, { color: tint(0xe0ded6, 1, k) })
      metal.box(x0 - 0.02, y1 - 0.35, z0 - 0.02, x1 + 0.02, y1, z1 + 0.02, { color: tint(0xb02820, 1, k), ao: 0 })
      decal(ctx, "vent", s.x, y1 - 0.75, alongX ? z1 : s.z, 0.5, 0.3, alongX ? "s" : "e", 0x9ad0ff)
      place(ctx.B("rubber"), t.cyl8, alongX ? x1 + 0.05 : s.x + 0.2, y0 + 0.8, alongX ? s.z : z1 + 0.05, 0.15, 0, 0, 0.025, 1.0, 0.025, 0x1a1a1a)
      return true
    }
    case "bale": {
      ctx.B("burlap").box(x0, y0, z0, x1, y1, z1, { color: tint(0xd8c27a, 1, k), top: tint(0xe2cc88, 1, k), local: true })
      return true
    }
    case "tractor": tractor(ctx, s, x0, z0, x1, z1, k); return true
    case "wagon": wagon(ctx, s, x0, y0, z0, x1, y1, z1, alongX, k); return true
    case "apc": apc(ctx, s, x0, z0, x1, z1, alongX); return true
    case "logs": {
      const bark = ctx.B("bark"), ends = ctx.B("plank"), L = alongX ? s.w : s.d, W = alongX ? s.d : s.w
      const r = Math.min(0.32, s.h / 4), rows = Math.max(1, Math.floor(s.h / (r * 1.75)))
      for (let row = 0; row < rows; row++) {
        const n = Math.max(1, Math.floor((W - row * r) / (2 * r))), y = y0 + r + row * r * 1.72
        for (let i = 0; i < n; i++) {
          const o = -((n - 1) * r) + i * 2 * r, rr = r * (0.88 + ctx.rng() * 0.12), cx = alongX ? s.x : s.x + o, cz = alongX ? s.z + o : s.z
          place(bark, t.cyl8, cx, y, cz, Math.PI / 2, alongX ? Math.PI / 2 : 0, 0, rr, L - 0.05, rr, tint(0x9a8a76, 1, 0.85 + ctx.rng() * 0.3), [Math.PI * 2 * rr, L])
          for (const e of [-1, 1]) place(ends, t.disc, alongX ? s.x + e * (L / 2 - 0.02) : cx, y, alongX ? cz : s.z + e * (L / 2 - 0.02), 0, alongX ? e * Math.PI / 2 : e > 0 ? 0 : Math.PI, 0, rr * 0.96, rr * 0.96, 1, tint(0xd8b890))
        }
      }
      return true
    }
    case "rock": rock(ctx, s, x0, y0, z0, x1, y1, z1); return true
    case "boat": {
      const c = tint(s.tint ?? 0xd8d4c8, 1, k), along = !alongX, L = along ? s.d : s.w, W = along ? s.w : s.d
      const cradle = 0.7, hullTop = Math.min(y1 - 0.9, cradle + 1.3)
      for (const f of [0.25, 0.75]) { const p = (along ? z0 : x0) + L * f; if (along) metal.box(x0 + 0.2, y0, p - 0.12, x1 - 0.2, cradle, p + 0.12, { color: tint(0x4a4e52) }); else metal.box(p - 0.12, y0, z0 + 0.2, p + 0.12, cradle, z1 - 0.2, { color: tint(0x4a4e52) }) }
      const bow = Math.min(L * 0.25, 3)
      if (along) {
        metal.box(x0 + 0.1, cradle, z0 + bow, x1 - 0.1, hullTop, z1, { color: c, ao: 0 })
        place(metal, t.cone, s.x, (cradle + hullTop) / 2, z0 + bow / 2, -Math.PI / 2, 0, 0, W / 2 - 0.1, bow, (hullTop - cradle) / 2, c)
        metal.box(x0 + 0.08, cradle + 0.15, z0 + bow, x1 - 0.08, cradle + 0.45, z1, { color: tint(0x2d557f), ao: 0, skip: PY | NY })
        ctx.B("glass").box(s.x - W * 0.3, hullTop, s.z, s.x + W * 0.3, y1, s.z + L * 0.25, { color: tint(0xd0ccc0), ao: 0, local: true })
      } else {
        metal.box(x0 + bow, cradle, z0 + 0.1, x1, hullTop, z1 - 0.1, { color: c, ao: 0 })
        place(metal, t.cone, x0 + bow / 2, (cradle + hullTop) / 2, s.z, 0, 0, Math.PI / 2, (hullTop - cradle) / 2, bow, W / 2 - 0.1, c)
        ctx.B("glass").box(s.x, hullTop, s.z - W * 0.3, s.x + L * 0.25, y1, s.z + W * 0.3, { color: tint(0xd0ccc0), ao: 0, local: true })
      }
      return true
    }
    case "excavator": {
      const c = tint(s.tint ?? 0xc69c2c, 1, k), dark = tint(0x26282a)
      if (alongX) for (const z of [z0, z1 - 0.7]) metal.box(x0, y0, z, x1, 0.9, z + 0.7, { color: dark })
      else for (const x of [x0, x1 - 0.7]) metal.box(x, y0, z0, x + 0.7, 0.9, z1, { color: dark })
      metal.box(x0 + 0.4, 0.9, z0 + 0.4, x1 - 0.4, 1.25, z1 - 0.4, { color: dark, ao: 0 })
      metal.box(x0 + 0.3, 1.25, z0 + 0.3, x1 - 0.3, y1 - 1.1, z1 - 0.3, { color: c, ao: 0 })
      ctx.B("glass").box(s.x - 0.8, y1 - 1.1, z0 + 0.4, s.x + 0.6, y1, z0 + 2, { color: tint(0x9aa4a8), local: true, ao: 0 })
      metal.box(s.x - 0.85, y1 - 0.05, z0 + 0.35, s.x + 0.65, y1, z0 + 2.05, { color: c, ao: 0 })
      return true
    }
    case "palisade": {
      const bark = ctx.B("bark"), L = alongX ? s.w : s.d, n = Math.max(1, Math.round(L / 0.3)), r = 0.14
      for (let i = 0; i < n; i++) {
        const a = (alongX ? x0 : z0) + (i + 0.5) * L / n, h = s.h - 0.25 + ctx.rng() * 0.25, c = tint(0x8a7a64, 1, 0.8 + ctx.rng() * 0.35)
        const cx = alongX ? a : s.x, cz = alongX ? s.z : a
        place(bark, t.cyl8, cx, y0 + (h - 0.3) / 2, cz, 0, ctx.rng() * 3, 0, r, h - 0.3, r, c, [0.9, h])
        place(bark, t.cone, cx, y0 + h - 0.15, cz, 0, 0, 0, r, 0.3, r, c, [0.9, 0.3])
      }
      const pl = ctx.B("plank")
      for (const y of [0.6, s.h - 0.9]) if (alongX) pl.box(x0, y0 + y, s.z - r - 0.06, x1, y0 + y + 0.14, s.z - r, { color: tint(0x6a5038), ao: 0 }); else pl.box(s.x - r - 0.06, y0 + y, z0, s.x - r, y0 + y + 0.14, z1, { color: tint(0x6a5038), ao: 0 })
      return true
    }
    case "steelwall": {
      ctx.B("cladding").box(x0, y0, z0, x1, y1 - 0.1, z1, { color: tint(s.tint ?? 0x5a6066, 1, k) })
      metal.box(x0 - 0.03, y1 - 0.1, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, { color: tint(0x3a3e42), ao: 0 })
      const cb = ctx.B("concertina"), rr = 0.3, yc = y1 + 0.3, c = tint(0xc8ccd0)
      if (alongX) { cb.quad([x0, yc - rr, s.z], [x1, yc - rr, s.z], [x1, yc + rr, s.z], [x0, yc + rr, s.z], [0, 0, 1], [0, 0, s.w, 0, s.w, 1, 0, 1], c); for (let x = x0 + 1; x < x1; x += 2.5) metal.box(x - 0.03, y1, s.z - 0.03, x + 0.03, y1 + 0.65, s.z + 0.03, { color: tint(0x5a5e62), ao: 0 }) }
      else { cb.quad([s.x, yc - rr, z1], [s.x, yc - rr, z0], [s.x, yc + rr, z0], [s.x, yc + rr, z1], [1, 0, 0], [0, 0, s.d, 0, s.d, 1, 0, 1], c); for (let z = z0 + 1; z < z1; z += 2.5) metal.box(s.x - 0.03, y1, z - 0.03, s.x + 0.03, y1 + 0.65, z + 0.03, { color: tint(0x5a5e62), ao: 0 }) }
      return true
    }
    case "car": carModel(ctx, s, alongX); return true
    case "cabin": return true
    case "bus": busModel(ctx, s, alongX); return true
    case "truckcab": truckCabModel(ctx, s); return true
    case "barricade": barricade(ctx, s, alongX); return true
    case "trunk": {
      const bark = ctx.B("bark"), L = alongX ? s.w : s.d, r = Math.min(s.h, alongX ? s.d : s.w) / 2
      place(bark, t.cyl8, s.x, y0 + r, s.z, Math.PI / 2, alongX ? Math.PI / 2 : 0, 0, r, L - 0.2, r, tint(0x8a7a66, 1, k), [Math.PI * 2 * r, L])
      const e = alongX ? x0 + 0.1 : z0 + 0.1
      place(ctx.B("plank"), t.disc, alongX ? e : s.x, y0 + r, alongX ? s.z : e, 0, alongX ? -Math.PI / 2 : Math.PI, 0, r * 0.95, r * 0.95, 1, tint(0xc8a880))
      for (let i = 0; i < 3; i++) { const a = (alongX ? x0 : z0) + L * (0.3 + i * 0.22); place(bark, t.cyl8, alongX ? a : s.x + 0.3, y0 + r * 1.4, alongX ? s.z + 0.3 : a, 0.9, ctx.rng() * 6, 0.5, r * 0.25, 1.2, r * 0.25, tint(0x7a6a58)) }
      ctx.weeds.push([s.x, s.z, 1], [s.x + (alongX ? L * 0.3 : 0.6), s.z + (alongX ? 0.6 : L * 0.3), 0.9])
      return true
    }
    case "tentbox": {
      tent(ctx, s.x, s.z, s.w, s.d, s.h, s.tint ?? 0x5a6340, 0)
      return true
    }
    default: return false
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Vehicles. Oriented builder: local u along the length (front +u), w across, y up.
// ---------------------------------------------------------------------------------------------------------------
interface Frame { box(b: GeoBatch, u0: number, u1: number, y0: number, y1: number, w0: number, w1: number, c: THREE.Color | number, pitch?: number): void; at(u: number, w: number): [number, number]; ry: number }
function frameOf(cx: number, cz: number, fx: number, fz: number): Frame {
  const ry = Math.atan2(-fz, fx), t = tpl()
  const at = (u: number, w: number): [number, number] => [cx + fx * u - fz * w, cz + fz * u + fx * w]
  return {
    ry, at,
    box(b, u0, u1, y0, y1, w0, w1, c, pitch = 0) {
      const [x, z] = at((u0 + u1) / 2, (w0 + w1) / 2)
      place(b, t.box, x, (y0 + y1) / 2, z, 0, ry, pitch, u1 - u0, y1 - y0, w1 - w0, c, [Math.max(u1 - u0, w1 - w0), y1 - y0])
    },
  }
}
/** Charred / rusted paint: dark base with brown-orange patches (per call variation). */
function wreckPaint(ctx: BuildCtx, burnt: boolean, base?: number): THREE.Color {
  const c = burnt ? new THREE.Color(0x2a2522).lerp(new THREE.Color(0x6a3a22), ctx.rng() * 0.5) : new THREE.Color(base ?? 0x6a4a34).lerp(new THREE.Color(0x7a4426), 0.4 + ctx.rng() * 0.4)
  return tint(c.getHex(), 1, 0.8 + ctx.rng() * 0.3)
}

function carModel(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const v = s.v ?? 0, burnt = v === 9, rust = v === 4 || v === 8, wreck = burnt || rust, mil = v === 5, shape = v % 3
  const L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, -1)
  const metal = ctx.B("metal"), glass = ctx.B("glass"), lamp = ctx.B("lamp"), rub = ctx.B("rubber"), t = tpl()
  const paint = wreck ? wreckPaint(ctx, burnt, s.tint) : tint(s.tint, 1, jit(s, 0.04)), dark = tint(burnt ? 0x141210 : 0x1e2022), chrome = tint(burnt ? 0x2a2622 : 0x9a9ea2)
  const sink = wreck ? 0.07 : 0, hw = W / 2, hl = L / 2
  f.box(metal, -hl + 0.2, hl - 0.2, 0.13 - sink, 0.3 - sink, -hw + 0.12, hw - 0.12, dark)
  f.box(metal, -hl + 0.06, hl - 0.05, 0.3 - sink, 0.74 - sink, -hw, hw, paint)
  f.box(metal, -hl + 0.95, hl - 0.95, 0.26 - sink, 0.36 - sink, -hw - 0.01, hw + 0.01, dark)
  // hood, shoulders, boot
  f.box(metal, 0.62, hl - 0.06, 0.74 - sink, 0.86 - sink, -hw + 0.03, hw - 0.03, paint, -0.04)
  const rearEnd = shape === 1 ? -hl + 0.35 : shape === 2 ? -hl + 0.2 : -1.48
  f.box(metal, -hl + 0.06, 0.62, 0.74 - sink, 0.9 - sink, -hw + 0.02, hw - 0.02, paint)
  // greenhouse: glass band, roof, pillars, windscreen and rear window
  const roof0 = shape === 2 ? -hl + 0.3 : rearEnd + 0.3, roof1 = 0.45, top = 1.44 - sink
  if (!burnt) f.box(glass, roof0, roof1 + 0.05, 0.9 - sink, top - 0.05, -hw + 0.16, hw - 0.16, tint(rust ? 0x3a3a34 : 0x8a96a0), 0)
  f.box(metal, roof0 - 0.05, roof1 + 0.1, top - 0.06, top, -hw + 0.13, hw - 0.13, paint)
  for (const u of [roof1 + 0.05, (roof0 + roof1) / 2, roof0]) for (const sd of [-1, 1]) f.box(metal, u - 0.05, u + 0.05, 0.88 - sink, top - 0.04, sd * (hw - 0.16) - 0.04, sd * (hw - 0.16) + 0.04, paint)
  const ws = Math.hypot(0.5, top - 0.9), wa = Math.atan2(top - 0.9 + sink, 0.5)
  if (!burnt) f.box(glass, roof1 + 0.05, roof1 + 0.05 + ws, top - 0.32, top - 0.28, -hw + 0.2, hw - 0.2, tint(rust ? 0x3a3a34 : 0x7a8a96), -wa)
  if (shape !== 2 && !burnt) f.box(glass, roof0 - ws * 0.9, roof0, top - 0.32, top - 0.28, -hw + 0.22, hw - 0.22, tint(0x6a7a86), wa)
  if (shape === 2) f.box(metal, -hl + 0.06, -hl + 0.3, 0.9 - sink, top - 0.05, -hw + 0.14, hw - 0.14, paint)
  // bumpers, grille, lights, plates, mirrors
  for (const e of [-1, 1]) f.box(metal, e > 0 ? hl - 0.1 : -hl - 0.02, e > 0 ? hl + 0.02 : -hl + 0.1, 0.28 - sink, 0.46 - sink, -hw + 0.04, hw - 0.04, wreck ? dark : tint(0x2a2c2e))
  f.box(metal, hl - 0.04, hl + 0.01, 0.5 - sink, 0.68 - sink, -0.42, 0.42, dark)
  for (const sd of [-1, 1]) {
    f.box(burnt ? metal : lamp, hl - 0.05, hl + 0.01, 0.56 - sink, 0.68 - sink, sd > 0 ? hw - 0.42 : -hw + 0.12, sd > 0 ? hw - 0.12 : -hw + 0.42, burnt ? dark : tint(0xfff2d0, 1, 0.9))
    f.box(burnt ? metal : lamp, -hl - 0.01, -hl + 0.05, 0.58 - sink, 0.72 - sink, sd > 0 ? hw - 0.4 : -hw + 0.1, sd > 0 ? hw - 0.1 : -hw + 0.4, burnt ? dark : tint(0xb01810, 1, 0.8))
    f.box(metal, 0.5, 0.62, 0.95 - sink, 1.06 - sink, sd * (hw + 0.07) - 0.05, sd * (hw + 0.07) + 0.05, paint)
  }
  for (const e of [-1, 1]) f.box(metal, e > 0 ? hl - 0.01 : -hl - 0.02, e > 0 ? hl + 0.02 : -hl + 0.01, 0.34 - sink, 0.45 - sink, -0.26, 0.26, burnt ? dark : tint(0xe8e8e0))
  // wheels (burnt: rims only, sunk)
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const [x, z] = f.at(a * (hl - 0.82), b * (hw - 0.13)), r = burnt ? 0.24 : rust ? 0.3 : 0.33
    if (!burnt) place(rub, t.wheel, x, r - (rust ? 0.03 : 0), z, 0, f.ry + Math.PI / 2, 0, 0.21, r, r, 0x222224)
    place(metal, t.wheel, x, (burnt ? 0.24 : r) - (rust ? 0.03 : 0), z, 0, f.ry + Math.PI / 2, 0, 0.23, r * (burnt ? 1 : 0.55), r * (burnt ? 1 : 0.55), burnt ? 0x3a3028 : 0xa0a4a8)
  }
  if (!burnt) f.box(metal, -0.35, -0.3, 0.62 - sink, 0.65 - sink, -hw - 0.015, hw + 0.015, chrome)
  if (wreck) {
    decal(ctx, burnt ? "oil" : "puddle", s.x, 0, s.z, L + 1.6, W + 1.4, "up", burnt ? 0x202020 : 0xffffff, alongX ? 0 : Math.PI / 2)
    if (burnt) for (let i = 0; i < 3; i++) { const [x, z] = f.at((ctx.rng() - 0.5) * L, (ctx.rng() - 0.5) * W); decal(ctx, "paper", x, 0.92, z, 0.6, 0.6, "up", 0x302822, ctx.rng() * 6) }
  }
  if (mil) decal(ctx, textKey(ctx, 7, "Y-" + Math.floor(jit(s, 0.5) * 900)), alongX ? s.x + hl : s.x, 0.5, alongX ? s.z : s.z - hl, 0.8, 0.3, alongX ? "e" : "n", 0xffffff)
}

function busModel(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const v = s.v ?? 0, burnt = v === 9, rev = (v & 1) === 1 && !burnt
  const L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, hl = L / 2, hw = W / 2, h = s.h
  const f = alongX ? frameOf(s.x, s.z, rev ? -1 : 1, 0) : frameOf(s.x, s.z, 0, rev ? 1 : -1)
  const metal = ctx.B("metal"), glass = ctx.B("glass"), t = tpl(), lamp = ctx.B("lamp")
  const paint = burnt ? wreckPaint(ctx, true) : tint(s.tint ?? 0xd8c040, 1, jit(s, 0.04)), upper = burnt ? paint : tint(0xe8e6de), dark = tint(burnt ? 0x141210 : 0x1e2022)
  const sink = burnt ? 0.12 : 0
  f.box(metal, -hl + 0.1, hl - 0.1, 0.2 - sink, 0.45 - sink, -hw + 0.1, hw - 0.1, dark)
  f.box(metal, -hl, hl, 0.45 - sink, 1.2 - sink, -hw, hw, paint)
  if (!burnt) f.box(glass, -hl + 0.15, hl - 0.15, 1.2 - sink, 2.4 - sink, -hw + 0.06, hw - 0.06, tint(0x6a7a84))
  f.box(metal, -hl, hl, 2.4 - sink, h - 0.2 - sink, -hw, hw, upper)
  f.box(metal, -1.8, 1.2, h - 0.2 - sink, h - sink, -0.7, 0.7, tint(burnt ? 0x2a2622 : 0xc8c8c4))
  for (let u = -hl + 0.15; u <= hl - 0.1; u += 1.38) for (const sd of [-1, 1]) f.box(metal, u - 0.06, u + 0.06, 1.2 - sink, 2.4 - sink, sd * hw - 0.05, sd * hw + 0.05, upper)
  for (const sd of [-1, 1]) f.box(metal, -hl, hl, 1.18 - sink, 1.26 - sink, sd * hw - 0.02, sd * hw + 0.02, tint(0x2a2c2e))
  if (!burnt) f.box(glass, hl - 0.06, hl + 0.01, 1.0 - sink, 2.5 - sink, -hw + 0.12, hw - 0.12, tint(0x7a8a96))
  f.box(lamp, hl - 0.04, hl + 0.02, 2.55 - sink, 2.85 - sink, -hw + 0.3, hw - 0.3, burnt ? dark : tint(0xffa020, 1, 0.9))
  for (const u of [hl - 1.6, 0.2]) f.box(metal, u - 0.55, u + 0.55, 0.45 - sink, 2.3 - sink, hw - 0.02, hw + 0.02, tint(burnt ? 0x1a1816 : 0x3a4048))
  for (const e of [-1, 1]) f.box(metal, e > 0 ? hl - 0.05 : -hl - 0.05, e > 0 ? hl + 0.05 : -hl + 0.05, 0.3 - sink, 0.6 - sink, -hw + 0.05, hw - 0.05, dark)
  for (const sd of [-1, 1]) f.box(burnt ? metal : lamp, hl - 0.02, hl + 0.03, 0.75 - sink, 0.95 - sink, sd * (hw - 0.45) - 0.18, sd * (hw - 0.45) + 0.18, burnt ? dark : tint(0xfff2d0, 1, 0.9))
  for (const u of [hl - 2.3, -hl + 3.0]) for (const sd of [-1, 1]) {
    const [x, z] = f.at(u, sd * (hw - 0.2))
    if (!burnt) place(ctx.B("rubber"), t.wheel, x, 0.5, z, 0, f.ry + Math.PI / 2, 0, 0.3, 0.5, 0.5, 0x202022)
    place(metal, t.wheel, x, burnt ? 0.38 : 0.5, z, 0, f.ry + Math.PI / 2, 0, 0.32, burnt ? 0.38 : 0.26, burnt ? 0.38 : 0.26, burnt ? 0x3a3028 : 0x9a9ea2)
  }
  const [dx, dz] = f.at(hl, 0)
  if (!burnt) decal(ctx, textKey(ctx, 4, "SONDERFAHRT"), dx + (alongX ? (rev ? -0.04 : 0.04) : 0), 2.58, dz + (alongX ? 0 : rev ? 0.04 : -0.04), 1.8, 0.24, alongX ? (rev ? "w" : "e") : (rev ? "s" : "n"))
  if (burnt) decal(ctx, "oil", s.x, 0, s.z, L + 2, W + 2, "up", 0x202020, alongX ? 0 : Math.PI / 2)
}

function truckCabModel(ctx: BuildCtx, s: MapSolid): void {
  const v = s.v ?? 0, face: Side = v === 0 ? "e" : v === 1 ? "w" : v === 2 ? "s" : "n"
  const fx = face === "e" ? 1 : face === "w" ? -1 : 0, fz = face === "s" ? 1 : face === "n" ? -1 : 0
  const alongX = fx !== 0, L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, hl = L / 2, hw = W / 2, h = (s.y ?? 0) + s.h
  const f = frameOf(s.x, s.z, fx, fz), metal = ctx.B("metal"), glass = ctx.B("glass"), lamp = ctx.B("lamp"), t = tpl()
  const paint = tint(s.tint, 1, jit(s, 0.04)), dark = tint(0x1c1d1e), chrome = tint(0xa8acb0)
  f.box(metal, -hl, hl - 0.05, 0.15, 0.6, -hw + 0.1, hw - 0.1, dark)
  f.box(metal, -hl + 0.05, hl - 0.05, 0.6, h - 0.15, -hw, hw, paint)
  f.box(metal, -hl + 0.15, hl - 0.2, h - 0.15, h, -hw + 0.1, hw - 0.1, paint)
  f.box(glass, hl - 0.06, hl, 1.75, h - 0.35, -hw + 0.15, hw - 0.15, tint(0x7a8a96))
  for (const sd of [-1, 1]) f.box(glass, hl - 1.15, hl - 0.15, 1.8, h - 0.4, sd * hw - 0.02, sd * hw + 0.02, tint(0x7a8a96))
  f.box(metal, hl - 0.04, hl + 0.02, 0.75, 1.5, -hw + 0.35, hw - 0.35, dark)
  for (let y = 0.85; y < 1.5; y += 0.13) f.box(metal, hl - 0.01, hl + 0.03, y, y + 0.04, -hw + 0.38, hw - 0.38, chrome)
  f.box(metal, hl - 0.12, hl + 0.04, 0.3, 0.62, -hw + 0.02, hw - 0.02, tint(0x2a2c2e))
  f.box(metal, hl - 0.25, hl + 0.04, h - 0.38, h - 0.3, -hw + 0.1, hw - 0.1, paint)
  for (const sd of [-1, 1]) {
    f.box(lamp, hl - 0.02, hl + 0.03, 0.68, 0.84, sd * (hw - 0.4) - 0.2, sd * (hw - 0.4) + 0.2, tint(0xfff2d0, 1, 0.9))
    f.box(metal, hl - 0.5, hl - 0.4, 1.9, 2.5, sd * (hw + 0.05) - 0.05, sd * (hw + 0.05) + 0.05, dark)
    f.box(metal, hl - 1.3, hl - 0.5, 0.35, 0.5, sd > 0 ? hw - 0.08 : -hw - 0.02, sd > 0 ? hw + 0.02 : -hw + 0.08, dark)
  }
  f.box(metal, -hl + 0.3, -hl + 1.1, 0.5, 0.9, hw - 0.45, hw - 0.05, chrome)
  const [ex, ez] = f.at(-hl + 0.12, -hw + 0.25); place(metal, t.cyl8, ex, h * 0.55, ez, 0, 0, 0, 0.07, h * 0.9, 0.07, 0x3a3c3e)
  for (const sd of [-1, 1]) { const [x, z] = f.at(0.25, sd * (hw - 0.16)); place(ctx.B("rubber"), t.wheel, x, 0.5, z, 0, f.ry + Math.PI / 2, 0, 0.3, 0.5, 0.5, 0x222224); place(metal, t.wheel, x, 0.5, z, 0, f.ry + Math.PI / 2, 0, 0.32, 0.26, 0.26, 0x9a9ea2) }
}

/** Junk wall: pallets on edge, corrugated sheets, a door, tyres, planks, sandbags at the foot (inside the box). */
function barricade(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, h = s.h, f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, 1), rng = ctx.rng, t = tpl()
  let u = -L / 2 + 0.1
  while (u < L / 2 - 0.4) {
    const kind = Math.floor(rng() * 5), w = Math.min(L / 2 - u, 0.9 + rng() * 0.8), c = u + w / 2, tilt = (rng() - 0.5) * 0.18
    const [x, z] = f.at(c, (rng() - 0.5) * W * 0.3)
    if (kind === 0) place(ctx.B("pallets"), t.box, x, h * 0.42, z, tilt, f.ry, (rng() - 0.5) * 0.12, w, h * 0.84, 0.16, tint(undefined, 1, 0.8 + rng() * 0.3), [1.2, 1.2])
    else if (kind === 1) place(ctx.B("cladding"), t.box, x, h * 0.48, z, tilt, f.ry, (rng() - 0.5) * 0.1, w + 0.2, h * 0.95, 0.04, tint([0x7a4a34, 0x5a6066, 0x8a9096, 0x6a5a40][Math.floor(rng() * 4)], 1, 0.8 + rng() * 0.3), [w, h])
    else if (kind === 2) place(ctx.B("plaster"), t.box, x, h * 0.4, z, tilt * 0.5, f.ry, 0, 0.8, h * 0.8, 0.5, tint(rng() < 0.5 ? 0xd8d8d0 : 0x6e4b33), [1, 1])
    else if (kind === 3) for (let i = 0; i < 3; i++) place(ctx.B("rubber"), t.torus, x + (rng() - 0.5) * 0.1, 0.12 + i * 0.24, z, 0, rng() * 3, 0, 0.36, 0.36, 0.36, 0x222222)
    else place(ctx.B("crate"), t.box, x, 0.35, z, 0, f.ry + (rng() - 0.5) * 0.4, 0, Math.min(w, 1), 0.7, Math.min(W, 0.8), tint(undefined, 1, 0.8 + rng() * 0.3), [1.2, 1.2])
    u += w + 0.05
  }
  for (let i = 0; i < 3; i++) { const [x, z] = f.at(-L / 2 + L * (0.2 + i * 0.3), 0); place(ctx.B("plank"), t.box, x, h * (0.4 + rng() * 0.4), z, 0, f.ry, (rng() - 0.5) * 1.2, Math.min(2.4, L * 0.4), 0.18, 0.05, tint(0x9a7a58, 1, 0.8 + rng() * 0.3), [2.4, 0.2]) }
  for (let a = -L / 2 + 0.35; a < L / 2 - 0.3; a += 0.62) for (const sd of [-1, 1]) { const [x, z] = f.at(a, sd * (W / 2 - 0.2)); if (rng() < 0.6) ctx.inst("sandbag", x, 0.13, z, f.ry, [0.6, 0.26, 0.36], 0x8a7a5a) }
}

function tractor(ctx: BuildCtx, s: MapSolid, x0: number, z0: number, x1: number, z1: number, k: number): void {
  const metal = ctx.B("metal"), t = tpl(), c = tint(s.tint ?? 0x3f7a3a, 1, k), alongX = s.w > s.d
  const L = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0, h = s.h
  const P = (u: number, v: number): [number, number] => alongX ? [x0 + u, s.z + v] : [s.x + v, z0 + u]
  const bx = (u0: number, u1: number, y0: number, y1: number, w: number, col: THREE.Color, b: GeoBatch = metal) => {
    const [ax, az] = P(u0, -w / 2), [cx, cz] = P(u1, w / 2)
    b.box(Math.min(ax, cx), y0, Math.min(az, cz), Math.max(ax, cx), y1, Math.max(az, cz), { color: col, ao: 0 })
  }
  bx(0.2, L * 0.55, 0.6, 1.5, W * 0.45, c)
  bx(L * 0.5, L - 0.2, 0.55, 1.15, W * 0.5, tint(0x2a2c2e))
  ctx.B("glass").box(...cabBox(P, L * 0.55, L - 0.3, W * 0.6), { color: tint(0x9aa4a8), local: true, ao: 0 })
  bx(L * 0.52, L - 0.25, h - 0.08, h, W * 0.66, c)
  for (const [u, r, w] of [[L * 0.78, 0.78, 0.45], [L * 0.2, 0.45, 0.3]] as const) for (const sd of [-1, 1]) {
    const [wx, wz] = P(u, sd * (W / 2 - w / 2))
    place(ctx.B("rubber"), t.wheel, wx, r, wz, 0, alongX ? Math.PI / 2 : 0, 0, w, r, r, 0x222222)
    place(metal, t.wheel, wx, r, wz, 0, alongX ? Math.PI / 2 : 0, 0, w + 0.02, r * 0.55, r * 0.55, 0xc8a030)
  }
  const [ex, ez] = P(L * 0.35, W * 0.12); place(metal, t.cyl8, ex, 1.9, ez, 0, 0, 0, 0.06, 0.8, 0.06, 0x2a2a2a)
  function cabBox(Pf: typeof P, u0: number, u1: number, w: number): [number, number, number, number, number, number] {
    const [ax, az] = Pf(u0, -w / 2), [cx, cz] = Pf(u1, w / 2)
    return [Math.min(ax, cx), 1.15, Math.min(az, cz), Math.max(ax, cx), h - 0.08, Math.max(az, cz)]
  }
}

function wagon(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean, k: number): void {
  const metal = ctx.B("metal"), t = tpl(), c = tint(s.tint ?? 0x6a3a2a, 1, k), dark = tint(0x1e2022), v = s.v ?? 0
  const L = alongX ? x1 - x0 : z1 - z0
  const hopper = v >= 20
  if (hopper) {
    ctx.B("container").box(x0, y0, z0, x1, y1, z1, { color: c, ao: 0, skip: PY, local: true })
    ctx.B("gravel").box(x0 + 0.1, y1 - 0.5, z0 + 0.1, x1 - 0.1, y1 - 0.45, z1 - 0.1, { color: tint(0xb0a898), ao: 0 })
    if (alongX) for (let x = x0 + 1.5; x < x1 - 1; x += 2.2) metal.box(x, y0, z0 - 0.02, x + 0.12, y1, z1 + 0.02, { color: tint(s.tint, 1, k * 0.7), ao: 0 })
  } else {
    ctx.B("container").box(x0, y0, z0, x1, y1 - 0.12, z1, { color: c, ao: 0, local: true })
    metal.box(x0 - 0.03, y1 - 0.12, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, { color: tint(0x5a5e62, 1, k), ao: 0 })
    if (alongX) for (const f of ["n", "s"] as Side[]) decal(ctx, "cdoor", s.x, y0 + 0.2, f === "n" ? z0 : z1, 2.6, y1 - y0 - 0.5, f, 0xffffff)
    else for (const f of ["e", "w"] as Side[]) decal(ctx, "cdoor", f === "w" ? x0 : x1, y0 + 0.2, s.z, 2.6, y1 - y0 - 0.5, f, 0xffffff)
    if (ctx.rng() < 0.5) { const f: Side = alongX ? "s" : "e"; decal(ctx, `graffiti${Math.floor(ctx.rng() * 3)}`, alongX ? s.x - L * 0.25 : x1, y0 + 0.4, alongX ? z1 : s.z - L * 0.25, 3.2, 1.2, f) }
  }
  // underframe and bogies (below the box, inside the footprint)
  if (alongX) metal.box(x0 + 0.3, y0 - 0.25, z0 + 0.3, x1 - 0.3, y0, z1 - 0.3, { color: dark, ao: 0 })
  else metal.box(x0 + 0.3, y0 - 0.25, z0 + 0.3, x1 - 0.3, y0, z1 - 0.3, { color: dark, ao: 0 })
  for (const f of [0.18, 0.82]) {
    const p = (alongX ? x0 : z0) + L * f
    if (alongX) metal.box(p - 1.2, 0.3, s.z - 0.85, p + 1.2, 0.75, s.z + 0.85, { color: dark, ao: 0 })
    else metal.box(s.x - 0.85, 0.3, p - 1.2, s.x + 0.85, 0.75, p + 1.2, { color: dark, ao: 0 })
    for (const o of [-0.85, 0.85]) for (const side of [-0.72, 0.72]) {
      const wx = alongX ? p + o : s.x + side, wz = alongX ? s.z + side : p + o
      place(metal, t.wheel, wx, 0.45, wz, 0, alongX ? 0 : Math.PI / 2, 0, 0.12, 0.45, 0.45, 0x2a2622)
    }
  }
}

function apc(ctx: BuildCtx, s: MapSolid, x0: number, z0: number, x1: number, z1: number, alongX: boolean): void {
  const metal = ctx.B("metal"), t = tpl(), c = tint(s.tint ?? 0x4d5536, 1, jit(s)), h = s.h
  const L = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0
  metal.box(x0 + 0.1, 0.55, z0 + 0.1, x1 - 0.1, h - 0.55, z1 - 0.1, { color: c })
  const inset = 0.35
  metal.box(alongX ? x0 + 0.6 : x0 + inset, h - 0.55, alongX ? z0 + inset : z0 + 0.6, alongX ? x1 - 0.3 : x1 - inset, h - 0.3, alongX ? z1 - inset : z1 - 0.3, { color: c, ao: 0 })
  const tx = alongX ? x0 + L * 0.45 : s.x, tz = alongX ? s.z : z0 + L * 0.45
  place(metal, t.cyl12, tx, h - 0.15, tz, 0, 0, 0, W * 0.28, 0.3, W * 0.28, c)
  place(metal, t.cyl8, alongX ? tx - 1.6 : tx, h - 0.1, alongX ? tz : tz - 1.6, Math.PI / 2, alongX ? Math.PI / 2 : 0, 0, 0.06, 3, 0.06, 0x2a2c2a)
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
    const u = L * (0.15 + i * 0.23), wx = alongX ? x0 + u : s.x + sd * (W / 2 - 0.25), wz = alongX ? s.z + sd * (W / 2 - 0.25) : z0 + u
    place(ctx.B("rubber"), t.wheel, wx, 0.55, wz, 0, alongX ? Math.PI / 2 : 0, 0, 0.4, 0.55, 0.55, 0x1e1e1e)
  }
  decal(ctx, "numbers", alongX ? x1 - 1.5 : (alongX ? s.x : x1), 1.0, alongX ? z1 : z0 + 1.5, 1.2, 0.5, alongX ? "s" : "e", 0xffffff)
}

function rock(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const b = ctx.B("rock"), v = s.v ?? 0, base = tint(s.tint ?? 0xb8b0a2, 1, jit(s, 0.12)), t = tpl(), rng = ctx.rng
  const col = (k: number) => base.clone().multiplyScalar(k)
  if (s.h < 5) {
    // boulder / rock bench: a lumpy mass filling the box plus a smaller stone on top
    place(b, t.chunk, s.x, y0 + s.h * 0.42, s.z, rng() * 0.3, rng() * 6.28, rng() * 0.3, s.w * 0.56, s.h * 0.62, s.d * 0.56, col(0.95 + rng() * 0.1), [s.w * 2, s.h * 2])
    if (s.w > 1.6 && s.d > 1.2) place(b, t.chunk, s.x + (rng() - 0.5) * s.w * 0.3, y0 + s.h * 0.75, s.z + (rng() - 0.5) * s.d * 0.3, rng(), rng() * 6.28, 0, s.w * 0.3, s.h * 0.35, s.d * 0.3, col(1.05), [s.w, s.h])
    if (rng() < 0.6) ctx.weeds.push([s.x + s.w * 0.55, s.z, 1.1])
    return
  }
  // cliff: layered strata with insets, broken blocks bulging out of the long faces, rubble at the foot
  const inner = v >= 10 ? Math.floor(v / 10) : 0
  if (inner) {
    // the face toward the quarry floor: densely broken rock and a scree slope at its foot
    const fz = inner <= 2, sgn = inner === 2 || inner === 4 ? 1 : -1, face = inner === 1 ? z0 : inner === 2 ? z1 : inner === 3 ? x0 : x1
    const a0 = fz ? x0 : z0, a1 = fz ? x1 : z1
    for (let a = a0 + 0.6; a < a1; a += 1.3 + rng() * 0.6) for (let yy = 0.6 + rng() * 0.8; yy < s.h - 0.6; yy += 1.8 + rng() * 1.2) {
      const r = 0.9 + rng() * 0.9, off = face - sgn * r * (0.35 + rng() * 0.25)
      place(b, t.chunk, fz ? a : off, y0 + yy, fz ? off : a, rng() * 3, rng() * 6.28, rng() * 3, r * (1 + rng() * 0.6), r * (0.7 + rng() * 0.5), r, col(0.82 + rng() * 0.3), [r * 3, r * 3])
    }
    const g = ctx.B("gravel"), sc = tint(0xb8b0a0, 1, 0.9 + rng() * 0.1), w = 2.2, hh = 0.75
    const q: number[][] = fz ? [[a1, hh, face], [a0, hh, face], [a0, 0.02, face + sgn * w], [a1, 0.02, face + sgn * w]] : [[face, hh, a0], [face, hh, a1], [face + sgn * w, 0.02, a1], [face + sgn * w, 0.02, a0]]
    const flip = sgn < 0
    const n = fz ? [0, 0.95, sgn * 0.3] : [sgn * 0.3, 0.95, 0]
    if (flip) g.quad(q[1], q[0], q[3], q[2], n, [a0, 0, a1, 0, a1, w, a0, w], sc); else g.quad(q[0], q[1], q[2], q[3], n, [a1, 0, a0, 0, a0, w, a1, w], sc)
  }
  let y = y0, layer = 0
  while (y < y1 - 0.05) {
    const h = Math.min(y1 - y, 1.6 + ((v * 7 + layer * 3) % 5) * 0.45)
    const ix = ((layer + v) % 3) * 0.12, iz = ((layer * 2 + v) % 3) * 0.12
    b.box(x0 + ix, y, z0 + iz, x1 - (0.24 - ix), y + h, z1 - (0.24 - iz), { color: col(0.88 + ((layer + v) % 4) * 0.05), ao: layer === 0 ? 0.3 : 0 })
    y += h; layer++
  }
  const alongX = s.w >= s.d, len = alongX ? s.w : s.d
  for (const side of [-1, 1]) for (let a = 1.2; a < len - 0.8; a += 2.2 + rng() * 1.6) {
    const r = 0.7 + rng() * 1.1, yy = y0 + r * 0.6 + rng() * (s.h - r * 1.4), u = (alongX ? x0 : z0) + a
    const face = alongX ? (side < 0 ? z0 : z1) : (side < 0 ? x0 : x1)
    const cx = alongX ? u : face - side * r * 0.45, cz = alongX ? face - side * r * 0.45 : u
    place(b, t.chunk, cx, yy, cz, rng() * 3, rng() * 6.28, rng() * 3, r * 1.3, r, r, col(0.85 + rng() * 0.25), [r * 3, r * 3])
    if (rng() < 0.35) { const rr = 0.25 + rng() * 0.35; place(b, t.chunk, alongX ? u + (rng() - 0.5) : face + side * 0.25, rr * 0.6, alongX ? face + side * 0.25 : u + (rng() - 0.5), rng() * 3, rng() * 6, 0, rr, rr * 0.8, rr, col(0.9), [1, 1]) }
  }
  if (rng() < 0.6) ctx.weeds.push([s.x + (rng() - 0.5) * s.w * 0.6, s.z + (rng() - 0.5) * s.d * 0.6, 1.2])
}

// ---------------------------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------------------------
function extraProp(ctx: BuildCtx, p: MapProp): void {
  const t = tpl(), metal = ctx.B("metal"), L = ctx.look
  switch (p.kind) {
    case "gable": return gable(ctx, p)
    case "chimney": {
      const y = p.y ?? 6, h = p.h ?? 2.5, c = tint(0xa06a50, 0.6, jit(p))
      ctx.B("brick").box(p.x - 0.35, y - 0.4, p.z - 0.35, p.x + 0.35, y + h, p.z + 0.35, { color: c, ao: 0 })
      ctx.B("concrete").box(p.x - 0.42, y + h, p.z - 0.42, p.x + 0.42, y + h + 0.1, p.z + 0.42, { color: tint(0x8a8680), ao: 0 })
      return
    }
    case "steeple": {
      const y = p.y ?? 20, w = p.w ?? 8, h = p.h ?? 12, c = tint(p.tint ?? 0x4a5a58)
      ctx.B("concrete").box(p.x - w / 2 - 0.15, y, p.z - w / 2 - 0.15, p.x + w / 2 + 0.15, y + 0.4, p.z + w / 2 + 0.15, { color: tint(0xa8a49a), ao: 0 })
      place(metal, t.pyr, p.x, y + 0.4, p.z, 0, 0, 0, w, h, w, c, [w * 2, h])
      place(metal, t.sphere, p.x, y + 0.4 + h, p.z, 0, 0, 0, 0.3, 0.3, 0.3, 0xc8a040)
      metal.box(p.x - 0.06, y + h + 0.5, p.z - 0.06, p.x + 0.06, y + h + 2.4, p.z + 0.06, { color: tint(0x2a2a2a), ao: 0 })
      metal.box(p.x - 0.5, y + h + 1.7, p.z - 0.05, p.x + 0.5, y + h + 1.85, p.z + 0.05, { color: tint(0x2a2a2a), ao: 0 })
      for (const f of ["n", "s", "e", "w"] as Side[]) {
        const nx = f === "e" ? 1 : f === "w" ? -1 : 0, nz = f === "s" ? 1 : f === "n" ? -1 : 0
        decal(ctx, "vent", p.x + nx * (w / 2 + 0.01), y - 3.4, p.z + nz * (w / 2 + 0.01), 1.4, 2.2, f, 0x404040)
      }
      ctx.glow.add(p.x, y + h + 2.6, p.z, 0.5, 0xff2a18, 1.8, [3, 0.5, p.x])
      return
    }
    case "watertower": {
      const y = p.y ?? 18, r = p.r ?? 5, h = p.h ?? 8, c = tint(p.tint ?? 0x8a9294, 1, jit(p))
      place(metal, t.cyl16, p.x, y + h / 2, p.z, 0, 0, 0, r, h, r, c, [Math.PI * 2 * r, h])
      place(metal, t.cone, p.x, y + h + r * 0.18, p.z, 0, 0, 0, r * 1.04, r * 0.36, r * 1.04, tint(p.tint ?? 0x8a9294, 1, 0.75))
      place(metal, t.cyl16, p.x, y - 0.1, p.z, 0, 0, 0, r + 0.7, 0.2, r + 0.7, tint(0x5a5e62))
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; place(metal, t.box, p.x + Math.cos(a) * (r + 0.65), y + 0.5, p.z + Math.sin(a) * (r + 0.65), 0, 0, 0, 0.04, 1, 0.04, 0x5a5e62) }
      ctx.lines.push(p.x - r - 0.1, 0.5, p.z, p.x - r - 0.1, y, p.z)
      decal(ctx, textKey(ctx, 0, "KESSELBRÜCK"), p.x, y + h * 0.45, p.z + r + 0.02, r * 1.4, h * 0.22, "s", 0x2a2a2a)
      ctx.glow.add(p.x, y + h + r * 0.4, p.z, 0.6, 0xff2a18, 2, [3, 0.5, p.z])
      return
    }
    case "stack": {
      const y = p.y ?? 0, r = p.r ?? 2.5, h = p.h ?? 45, c = tint(p.tint ?? 0x8a5a44, 0.8, jit(p))
      place(ctx.B("brick"), t.taper, p.x, y, p.z, 0, 0, 0, r, h, r, c, [Math.PI * 2 * r, h])
      for (const [yy, col] of [[h - 3, 0xd8d4cc], [h - 6, 0xb02820], [h - 9, 0xd8d4cc]] as const) place(metal, t.cyl16, p.x, y + yy, p.z, 0, 0, 0, r * 0.66 + 0.04, 1.4, r * 0.66 + 0.04, col)
      for (let a = 0; a < 3; a++) ctx.glow.add(p.x + Math.cos(a * 2.1) * r * 0.66, y + h + 0.3, p.z + Math.sin(a * 2.1) * r * 0.66, 0.9, 0xff2a18, 2.4, [3, 0.45, a * 0.3])
      return
    }
    case "rooftop": {
      const y = p.y ?? 8, w = p.w ?? 20, d = p.d ?? 20, rng = ctx.rng
      for (let i = 0; i < 6; i++) {
        const bx = p.x + (rng() - 0.5) * (w - 6), bz = p.z + (rng() - 0.5) * (d - 6), sw = 1.6 + rng() * 2.4, sd = 1.2 + rng() * 1.6
        metal.box(bx - sw / 2, y, bz - sd / 2, bx + sw / 2, y + 1 + rng() * 0.8, bz + sd / 2, { color: tint(0xa8acae, 1, 0.85 + rng() * 0.2), ao: 0.3 })
        if (rng() < 0.5) place(metal, t.cyl12, bx + sw / 2 + 0.5, y + 0.6, bz, 0, 0, 0, 0.35, 1.2, 0.35, 0x8a8e92)
      }
      return
    }
    case "tent": return tent(ctx, p.x, p.z, p.w ?? 4, p.d ?? 3, p.h ?? 2.2, p.tint ?? 0x5a6340, p.v ?? 0)
    case "silo": {
      const r = p.r ?? 3.5, h = p.h ?? 18, c = tint(p.tint ?? 0xb8b4aa, 1, jit(p))
      place(ctx.B("cladding"), t.cyl16, p.x, h / 2, p.z, 0, 0, 0, r, h, r, c, [Math.PI * 2 * r, h])
      place(metal, t.dome, p.x, h, p.z, 0, 0, 0, r, r * 0.5, r, tint(p.tint ?? 0xb8b4aa, 1, 0.9))
      for (let y = 2; y < h; y += 2.5) place(metal, t.cyl16, p.x, y, p.z, 0, 0, 0, r + 0.03, 0.12, r + 0.03, 0x8a8e92)
      ctx.lines.push(p.x + r + 0.1, 0.2, p.z, p.x + r + 0.1, h + 0.3, p.z, p.x + r + 0.5, 0.2, p.z, p.x + r + 0.5, h + 0.3, p.z)
      return
    }
    case "handpump": {
      ctx.B("concrete").box(p.x - 0.6, 0, p.z - 0.6, p.x + 0.6, 0.12, p.z + 0.6, { color: tint(0x9a968c) })
      place(metal, t.cyl8, p.x, 0.65, p.z, 0, 0, 0, 0.11, 1.1, 0.11, 0x3a4a3a)
      metal.box(p.x - 0.05, 0.85, p.z - 0.05, p.x + 0.35, 0.95, p.z + 0.05, { color: tint(0x3a4a3a), ao: 0 })
      place(metal, t.box, p.x - 0.3, 1.3, p.z, 0, 0, -0.5, 0.06, 0.06, 0.9, 0x2a2c2a)
      metal.box(p.x - 0.12, 1.2, p.z - 0.12, p.x + 0.12, 1.3, p.z + 0.12, { color: tint(0x3a4a3a), ao: 0 })
      return
    }
    case "bale": {
      const r = p.r ?? 0.9
      place(ctx.B("burlap"), t.wheel, p.x, r, p.z, 0, ctx.rng() * 3, 0, 1.2, r, r, tint(0xd8c27a, 1, 0.85 + ctx.rng() * 0.2), [Math.PI * 2 * r, 1.2])
      return
    }
    case "campfire": {
      const rk = ctx.B("rock")
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; place(rk, t.box, p.x + Math.cos(a) * 0.7, 0.1, p.z + Math.sin(a) * 0.7, 0, a, 0, 0.3, 0.22, 0.24, 0x8a847a) }
      for (let i = 0; i < 4; i++) place(ctx.B("bark"), t.cyl8, p.x, 0.25, p.z, 0.25, i * 0.8, 0, 0.07, 1.1, 0.07, 0x5a4a3a)
      decal(ctx, "oil", p.x, 0.01, p.z, 1.8, 1.8, "up", 0x202020)
      const k = Math.max(0.5, L.lamps)
      ctx.glow.add(p.x, 0.5, p.z, 0.9, 0xff8a2a, 1.6 * k, [0.45, 13, p.x])
      ctx.glow.add(p.x, 0.9, p.z, 0.6, 0xffc060, 1.2 * k, [0.6, 19, p.z])
      ctx.pool.add(p.x, p.z, 5, 5, 0xff7a2a, 0.22 * k)
      ctx.lampSpots.push([p.x, 1, p.z, 0xff8a3a])
      return
    }
    case "hochsitz": {
      const wood = ctx.B("plank"), boards = ctx.B("boards"), c = tint(0x7a5a3a)
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) place(ctx.B("bark"), t.cyl8, p.x + dx, 1.9, p.z + dz, 0, 0, 0, 0.09, 3.8, 0.09, 0x6a5a48)
      wood.box(p.x - 1.1, 3.5, p.z - 1.1, p.x + 1.1, 3.62, p.z + 1.1, { color: c, ao: 0 })
      boards.box(p.x - 0.95, 3.62, p.z - 0.95, p.x + 0.95, 4.6, p.z + 0.95, { color: c, ao: 0 })
      wood.box(p.x - 1.15, 5.4, p.z - 1.15, p.x + 1.15, 5.5, p.z + 1.15, { color: tint(0x4a3a2a), ao: 0 })
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) wood.box(p.x + dx - 0.05, 4.6, p.z + dz - 0.05, p.x + dx + 0.05, 5.4, p.z + dz + 0.05, { color: c, ao: 0 })
      for (const dx of [-0.25, 0.25]) place(wood, t.box, p.x + dx, 1.8, p.z + 1.5, -0.3, 0, 0, 0.06, 3.9, 0.06, 0x7a5a3a)
      for (let y = 0.4; y < 3.5; y += 0.4) wood.box(p.x - 0.25, y, p.z + 1.12 + (3.5 - y) * 0.12, p.x + 0.25, y + 0.05, p.z + 1.2 + (3.5 - y) * 0.12, { color: c, ao: 0 })
      return
    }
    case "clock": { decal(ctx, "clock", p.x, p.y ?? 3, p.z - 0.02, 1.1, 1.1, "n"); return }
    case "tankwagon": {
      const w = p.w ?? 12, c = tint(p.tint ?? 0x2a2c30, 1, jit(p)), dark = tint(0x1e2022)
      metal.box(p.x - w / 2 + 0.3, 0.75, p.z - 1.1, p.x + w / 2 - 0.3, 1.0, p.z + 1.1, { color: dark, ao: 0 })
      place(metal, t.cyl16, p.x, 2.3, p.z, 0, 0, Math.PI / 2, 1.3, w - 0.8, 1.3, c, [Math.PI * 2.6, w])
      for (const e of [-1, 1]) place(metal, t.sphere, p.x + e * (w / 2 - 0.4), 2.3, p.z, 0, 0, 0, 0.3, 1.3, 1.3, c)
      place(metal, t.cyl12, p.x, 3.65, p.z, 0, 0, 0, 0.45, 0.3, 0.45, c)
      for (const f of [0.18, 0.82]) {
        const bx = p.x - w / 2 + w * f
        metal.box(bx - 1.2, 0.3, p.z - 0.85, bx + 1.2, 0.75, p.z + 0.85, { color: dark, ao: 0 })
        for (const o of [-0.85, 0.85]) for (const sd of [-0.72, 0.72]) place(metal, t.wheel, bx + o, 0.45, p.z + sd, 0, 0, 0, 0.12, 0.45, 0.45, 0x2a2622)
      }
      decal(ctx, "hazard", p.x, 1.4, p.z + 1.32, 2, 0.35, "s")
      return
    }
    case "portal": {
      const w = p.w ?? 5, h = p.h ?? 4.2, cc = tint(0xa8a49a), x = p.x
      ctx.B("concrete").box(x, 0, p.z - w / 2 - 0.8, x + 0.6, h + 0.8, p.z - w / 2, { color: cc })
      ctx.B("concrete").box(x, 0, p.z + w / 2, x + 0.6, h + 0.8, p.z + w / 2 + 0.8, { color: cc })
      ctx.B("concrete").box(x, h, p.z - w / 2, x + 0.6, h + 0.8, p.z + w / 2, { color: cc })
      metal.box(x + 0.02, 0, p.z - w / 2, x + 0.08, h, p.z + w / 2, { color: tint(0x3a4048), ao: 0.3 })
      for (let z = p.z - w / 2 + 0.6; z < p.z + w / 2; z += 0.6) metal.box(x + 0.08, 0.2, z - 0.03, x + 0.12, h - 0.2, z + 0.03, { color: tint(0x2a3038), ao: 0 })
      decal(ctx, "hazard", x + 0.62, h + 0.3, p.z, w, 0.35, "e")
      const k = lampAt(ctx, x + 0.9, h - 0.2, p.z, 0xffd8a0)
      ctx.B("lamp").box(x + 0.6, h - 0.35, p.z - 0.2, x + 0.9, h - 0.15, p.z + 0.2, { color: k > 0 ? tint(0xffe6b8, 1, 2) : tint(0x3a3c3e), ao: 0 })
      if (k > 0) { ctx.glow.add(x + 1, h - 0.3, p.z, 0.8, 0xffd8a0, 0.9 * k, [0.05, 13, 0]); ctx.pool.add(x + 3, p.z, 4, 4, 0xffd8a0, 0.14 * k) }
      return
    }
    case "quay": return quay(ctx, p)
    case "hopper": {
      const y = p.y ?? 9, w = p.w ?? 10, d = p.d ?? 9, h = p.h ?? 10, c = tint(0x8a7a50, 1, jit(p))
      metal.box(p.x - w / 2, y + h * 0.35, p.z - d / 2, p.x + w / 2, y + h, p.z + d / 2, { color: c })
      place(metal, t.pyr, p.x, y + h * 0.35, p.z, Math.PI, 0, 0, w * 1.35, h * 0.35, d * 1.35, tint(0x6a6040))
      metal.box(p.x - w / 2 - 0.4, y + h, p.z - d / 2 - 0.4, p.x + w / 2 + 0.4, y + h + 0.2, p.z + d / 2 + 0.4, { color: tint(0x4a4e52), ao: 0 })
      ctx.B("cladding").box(p.x - 2.5, y + h + 0.2, p.z - 2, p.x + 2.5, y + h + 3, p.z + 2, { color: tint(0x9a9a92), ao: 0 })
      decal(ctx, textKey(ctx, 0, "KIESWERK"), p.x, y + h * 0.6, p.z + d / 2 + 0.02, w * 0.7, 1.2, "s", 0x2a2a2a)
      ctx.glow.add(p.x, y + h + 3.4, p.z, 0.6, 0xff2a18, 2, [3, 0.5, 1])
      return
    }
    case "conveyor": {
      const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, y0 = p.y ?? 1, y1 = p.h ?? 12
      const dx = x2 - p.x, dz = z2 - p.z, dy = y1 - y0, len = Math.hypot(dx, dy, dz)
      const dir = V.set(dx, dy, dz).normalize(), yaw = Math.atan2(dx, dz), pitch = -Math.asin(dir.y)
      M.compose(S.set((p.x + x2) / 2, (y0 + y1) / 2, (p.z + z2) / 2), Q.setFromEuler(E.set(pitch, yaw, 0, "YXZ")), V.set(1, 1, 1))
      const g = new THREE.BoxGeometry(1.4, 1.0, len); ctx.B("truss").add(g, M, tint(0x9a8a50), [len, 1]); g.dispose()
      const belt = new THREE.BoxGeometry(1.0, 0.08, len); M.multiply(new THREE.Matrix4().makeTranslation(0, 0.54, 0)); ctx.B("rubber").add(belt, M, tint(0x2a2a2a)); belt.dispose()
      const n = Math.max(1, Math.floor(Math.hypot(dx, dz) / 12))
      for (let i = 1; i <= n; i++) { const f = i / (n + 1), sx = p.x + dx * f, sz = p.z + dz * f, sy = y0 + dy * f; place(metal, t.box, sx, sy / 2, sz, 0, yaw, 0, 0.25, sy, 0.25, 0x6a6a62) }
      return
    }
    case "heap": {
      const r = p.r ?? 6, h = p.h ?? 5
      place(ctx.B("gravel"), t.cone, p.x, h / 2, p.z, 0, ctx.rng() * 3, 0, r, h, r * (0.9 + ctx.rng() * 0.2), tint(0xc8c0b0, 1, 0.9 + ctx.rng() * 0.15), [Math.PI * 2 * r, Math.hypot(r, h)])
      return
    }
    case "excavatorarm": {
      const rot = p.rot ?? 0, c = tint(p.tint ?? 0xc69c2c), fx = Math.sin(rot), fz = Math.cos(rot)
      const bx = p.x + fx * 1.5, bz = p.z + fz * 1.5
      place(metal, t.box, bx + fx * 2.2, 4.4, bz + fz * 2.2, -0.65, rot, 0, 0.5, 0.6, 5.2, c)
      place(metal, t.box, bx + fx * 4.8, 3.3, bz + fz * 4.8, 0.9, rot, 0, 0.4, 0.5, 4, c)
      metal.box(bx + fx * 5.6 - 0.6, 0, bz + fz * 5.6 - 0.6, bx + fx * 5.6 + 0.6, 0.9, bz + fz * 5.6 + 0.6, { color: tint(0x5a5a52), ao: 0.4 })
      return
    }
    case "scrap": {
      const w = p.w ?? 4, d = p.d ?? 3, h = p.h ?? 2, rng = ctx.rng
      for (let i = 0; i < 9; i++) {
        const sw = 0.5 + rng() * 1.6, sd = 0.4 + rng() * 1.2, sh = 0.2 + rng() * h * 0.6
        const bx = p.x + (rng() - 0.5) * (w - sw), bz = p.z + (rng() - 0.5) * (d - sd), by = rng() * (h - sh)
        place(metal, t.box, bx, by + sh / 2, bz, (rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4, sw, sh, sd, tint(rng() < 0.5 ? 0x7a4a30 : 0x5a5650, 1, 0.7 + rng() * 0.4))
      }
      metal.box(p.x - w / 2 + 0.3, 0, p.z - d / 2 + 0.3, p.x + w / 2 - 0.3, h * 0.55, p.z + d / 2 - 0.3, { color: tint(0x5a4a40), local: true })
      for (let i = 0; i < 3; i++) place(ctx.B("rubber"), t.torus, p.x + (rng() - 0.5) * w * 0.6, h * 0.55 + 0.12 + i * 0.05, p.z + (rng() - 0.5) * d * 0.6, (rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6, 0.38, 0.38, 0.38, 0x222222)
      return
    }
    case "target": {
      for (const dx of [-0.5, 0.5]) place(ctx.B("plank"), t.box, p.x + dx, 0.8, p.z, 0, 0, 0, 0.08, 1.6, 0.08, 0x6a5038)
      ctx.B("plank").box(p.x - 0.6, 0.9, p.z - 0.03, p.x + 0.6, 2.1, p.z + 0.03, { color: tint(0x8a7050), ao: 0 })
      decal(ctx, "target", p.x, 0.95, p.z + 0.01, 1.1, 1.1, "s")
      return
    }
    case "crossing": {
      const rot = p.rot ?? 0
      place(metal, t.cyl8, p.x, 1.5, p.z, 0, 0, 0, 0.06, 3, 0.06, 0x8a8e92)
      for (const a of [0.7, -0.7]) place(metal, t.box, p.x, 2.7, p.z, 0, rot, a, 1.6, 0.18, 0.03, 0xe8e4dc)
      for (const a of [0.7, -0.7]) for (const o of [-0.45, 0.45]) place(metal, t.box, p.x + Math.cos(rot) * o * Math.cos(a) * (a > 0 ? 1 : -1), 2.7 + o * Math.sin(a) * (a > 0 ? 1 : -1), p.z - Math.sin(rot) * o * Math.cos(a) * (a > 0 ? 1 : -1), 0, rot, a, 0.3, 0.19, 0.035, 0xb02820)
      return
    }
    case "track": return track(ctx, p)
    case "stain": { decal(ctx, (p.v ?? 0) === 1 ? "blood" : "oil", p.x, 0.01, p.z, p.w ?? 2, p.d ?? 2, "up", 0xffffff, ctx.rng() * 6); return }
    case "hazardring": {
      const r = p.r ?? 20, n = Math.round(Math.PI * 2 * r / 1.8)
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; decal(ctx, "hazard", p.x + Math.cos(a) * r, 0.012, p.z + Math.sin(a) * r, 1.7, 0.4, "up", 0xffffff, -a + Math.PI / 2) }
      return
    }
    case "insertion": {
      const rot = p.rot ?? 0, fx = -Math.sin(rot), fz = -Math.cos(rot), sx = p.x - fz * 3, sz = p.z + fx * 3
      place(metal, t.cyl8, sx, 1.2, sz, 0, 0, 0, 0.05, 2.4, 0.05, 0x8a8e92)
      place(metal, t.box, sx, 2.3, sz, 0, rot, 0, 1.8, 0.6, 0.04, 0x2d557f)
      decal(ctx, "biohazard", sx - fx * 0.03, 1.2, sz - fz * 0.03, 0.6, 0.6, Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? "w" : "e") : (fz > 0 ? "n" : "s"))
      return
    }
    case "stall": {
      const w = p.w ?? 4, d = p.d ?? 2, c = tint(p.tint ?? 0x8a3a2a)
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) place(metal, t.cyl8, p.x + dx * (w / 2 - 0.1), 1.2, p.z + dz * (d / 2 - 0.1), 0, 0, 0, 0.04, 2.4, 0.04, 0x5a5e62)
      const b = ctx.B("burlap"), y = 2.4
      b.quad([p.x - w / 2 - 0.2, y - 0.3, p.z + d / 2 + 0.3], [p.x + w / 2 + 0.2, y - 0.3, p.z + d / 2 + 0.3], [p.x + w / 2 + 0.2, y + 0.2, p.z - d / 2], [p.x - w / 2 - 0.2, y + 0.2, p.z - d / 2], [0, 0.85, 0.5], [0, 0, w, 0, w, d, 0, d], c)
      b.quad([p.x + w / 2 + 0.2, y - 0.3, p.z + d / 2 + 0.3], [p.x - w / 2 - 0.2, y - 0.3, p.z + d / 2 + 0.3], [p.x - w / 2 - 0.2, y + 0.2, p.z - d / 2], [p.x + w / 2 + 0.2, y + 0.2, p.z - d / 2], [0, -0.85, -0.5], [0, 0, w, 0, w, d, 0, d], c.clone().multiplyScalar(0.7))
      for (let i = 0; i < 5; i++) place(ctx.B("crate"), t.box, p.x - w / 2 + 0.5 + i * (w - 1) / 4, 1.0, p.z - d / 2 + 0.3, 0, ctx.rng() * 0.3, 0, 0.35, 0.25, 0.3, tint(undefined, 1, 0.8 + ctx.rng() * 0.3))
      return
    }
    case "antenna": {
      const h = p.h ?? 9
      place(metal, t.cyl8, p.x, h / 2, p.z, 0, 0, 0, 0.05, h, 0.05, 0x8a8e92)
      for (const [ax, az] of [[3, 2], [-3, 2], [0, -3.5]]) ctx.lines.push(p.x, h * 0.8, p.z, p.x + ax, 0.05, p.z + az)
      for (const y of [h * 0.6, h * 0.8]) place(metal, t.box, p.x, y, p.z, 0, 0.5, 0, 1.2, 0.04, 0.04, 0x8a8e92)
      ctx.glow.add(p.x, h + 0.15, p.z, 0.35, 0xff2a18, 1.8, [3, 0.6, p.x])
      return
    }
    case "gunrack": {
      const w = p.w ?? 2, rot = p.rot ?? 0
      for (let i = 0; i < 6; i++) { const o = -w / 2 + 0.2 + i * (w - 0.4) / 5; place(metal, t.box, p.x + Math.cos(rot) * o, 1.0, p.z - Math.sin(rot) * o, 0.08, rot, 0, 0.06, 1.1, 0.12, 0x1e2022) }
      return
    }
    case "bodybag": {
      const n = p.v ?? 1, rot = p.rot ?? 0, b = ctx.B("burlap")
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 0.75, x = p.x + Math.cos(rot) * o, z = p.z - Math.sin(rot) * o
        place(b, t.sphere, x, 0.13, z, 0, rot + Math.PI / 2 + (ctx.rng() - 0.5) * 0.15, 0, 0.95, 0.16, 0.3, tint(ctx.rng() < 0.5 ? 0x2a3024 : 0x1e2022, 1, 0.9 + ctx.rng() * 0.2), [2, 1])
        if (ctx.rng() < 0.3) decal(ctx, "blood", x, 0.005, z, 1.4, 1.2, "up", 0xffffff, ctx.rng() * 6)
      }
      return
    }
    case "trash": {
      const n = p.v ?? 4, b = ctx.B("rubber")
      for (let i = 0; i < n; i++) {
        const x = p.x + (ctx.rng() - 0.5) * 1.6, z = p.z + (ctx.rng() - 0.5) * 1.6, r = 0.28 + ctx.rng() * 0.14
        place(b, t.sphere, x, r * 0.75, z, 0, ctx.rng() * 6, 0, r, r * 0.85, r * 0.9, tint(ctx.rng() < 0.7 ? 0x141618 : 0x3a5a3a))
      }
      if (ctx.rng() < 0.6) place(ctx.B("crate"), t.box, p.x + 0.6, 0.2, p.z - 0.4, 0, ctx.rng() * 3, 0.2, 0.5, 0.4, 0.4, tint(0xc8a878))
      decal(ctx, "paper", p.x, 0.005, p.z, 2.2, 2.2, "up", 0xffffff, ctx.rng() * 6)
      return
    }
    case "tarp": {
      const w = p.w ?? 4, d = p.d ?? 3, h = p.h ?? 2.2, c = tint(p.tint ?? 0x2d557f), b = ctx.B("burlap"), rot = p.rot ?? 0
      const cs = Math.cos(rot), sn = Math.sin(rot), P = (u: number, v: number, y: number) => [p.x + u * cs + v * sn, y, p.z - u * sn + v * cs]
      b.quad(P(w / 2, -d / 2, h), P(-w / 2, -d / 2, h), P(-w / 2, d / 2, 0.6), P(w / 2, d / 2, 0.6), [0.6 * sn, 0.8, 0.6 * cs], [0, 0, w, 0, w, d, 0, d], c)
      b.quad(P(-w / 2, -d / 2, h), P(w / 2, -d / 2, h), P(w / 2, d / 2, 0.6), P(-w / 2, d / 2, 0.6), [-0.6 * sn, -0.8, -0.6 * cs], [0, 0, w, 0, w, d, 0, d], c.clone().multiplyScalar(0.7))
      for (const u of [-w / 2, w / 2]) { const q = P(u, -d / 2, 0); place(ctx.B("plank"), t.cyl8, q[0], h / 2, q[2], 0, 0, 0, 0.04, h, 0.04, 0x6a5038) }
      return
    }
    case "washline": {
      const x2 = p.x2 ?? p.x + 5, z2 = p.z2 ?? p.z, b = ctx.B("burlap")
      for (const [x, z] of [[p.x, p.z], [x2, z2]]) place(ctx.B("plank"), t.cyl8, x, 1.0, z, 0, 0, 0, 0.04, 2, 0.04, 0x6a5038)
      sag(ctx, p.x, 1.9, p.z, x2, 1.9, z2, 0.15, 6)
      const len = Math.hypot(x2 - p.x, z2 - p.z), dx = (x2 - p.x) / len, dz = (z2 - p.z) / len
      for (let a = 0.6; a < len - 0.5; a += 0.7 + ctx.rng() * 0.5) {
        const x = p.x + dx * a, z = p.z + dz * a, w = 0.4 + ctx.rng() * 0.3, h = 0.4 + ctx.rng() * 0.5, y = 1.85 - 0.15 * 4 * (a / len) * (1 - a / len)
        const c = tint([0xd8d4c8, 0x8a3a2a, 0x2d557f, 0x5a6340, 0xc8b070][Math.floor(ctx.rng() * 5)])
        b.quad([x - dx * w / 2, y - h, z - dz * w / 2], [x + dx * w / 2, y - h, z + dz * w / 2], [x + dx * w / 2, y, z + dz * w / 2], [x - dx * w / 2, y, z - dz * w / 2], [dz, 0, -dx], [0, 0, w, 0, w, h, 0, h], c)
        b.quad([x + dx * w / 2, y - h, z + dz * w / 2], [x - dx * w / 2, y - h, z - dz * w / 2], [x - dx * w / 2, y, z - dz * w / 2], [x + dx * w / 2, y, z + dz * w / 2], [-dz, 0, dx], [0, 0, w, 0, w, h, 0, h], c)
      }
      return
    }
    case "wireroll": {
      const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, len = Math.hypot(x2 - p.x, z2 - p.z), cb = ctx.B("concertina"), c = tint(0xc8ccd0)
      const dx = (x2 - p.x) / len, dz = (z2 - p.z) / len, nx = -dz, nz = dx, r = 0.45
      cb.quad([p.x, 0, p.z], [x2, 0, z2], [x2, 2 * r, z2], [p.x, 2 * r, p.z], [nx, 0, nz], [0, 0, len, 0, len, 1, 0, 1], c)
      cb.quad([p.x - nx * r, r, p.z - nz * r], [x2 - nx * r, r, z2 - nz * r], [x2 + nx * r, r, z2 + nz * r], [p.x + nx * r, r, p.z + nz * r], [0, 1, 0], [0, 0, len, 0, len, 1, 0, 1], c)
      for (let a = 0; a <= len; a += 3) ctx.inst("post", p.x + dx * a, 0, p.z + dz * a, 0, [1, 1.1, 1], 0x5a5e62)
      return
    }
    case "sticker": { decal(ctx, p.text ?? "door", p.x, p.y ?? 0, p.z, p.w ?? 1, p.h ?? 1, p.face ?? "s"); return }
    case "watchtower": {
      // base guard tower above its leg/platform solids: railing, roof on posts, ladder
      const wood = ctx.B("plank"), lvl = p.v ?? 1, c = tint(lvl >= 3 ? 0x5a5e62 : 0x7a5a3a), y = 4.45
      const b = lvl >= 3 ? metal : wood
      for (const [a0, b0, a1, b1] of [[-2.3, -2.3, 2.3, -2.2], [-2.3, 2.2, 2.3, 2.3], [-2.3, -2.3, -2.2, 2.3], [2.2, -2.3, 2.3, 2.3]]) b.box(p.x + a0, y + 0.95, p.z + b0, p.x + a1, y + 1.05, p.z + b1, { color: c, ao: 0 })
      for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) b.box(p.x + dx - 0.06, y, p.z + dz - 0.06, p.x + dx + 0.06, y + 2.3, p.z + dz + 0.06, { color: c, ao: 0, local: true })
      ctx.B(lvl >= 3 ? "cladding" : "boards").box(p.x - 2.5, y + 2.3, p.z - 2.5, p.x + 2.5, y + 2.45, p.z + 2.5, { color: tint(lvl >= 3 ? 0x4d5536 : 0x6a5038), ao: 0 })
      for (const dx of [-0.25, 0.25]) wood.box(p.x + dx - 0.04, 0, p.z + 2.35, p.x + dx + 0.04, y, p.z + 2.43, { color: c, ao: 0 })
      for (let yy = 0.4; yy < y; yy += 0.4) wood.box(p.x - 0.25, yy, p.z + 2.35, p.x + 0.25, yy + 0.05, p.z + 2.43, { color: c, ao: 0 })
      const k = lampAt(ctx, p.x, y + 2.2, p.z, 0xffd8a0)
      if (k > 0) { ctx.glow.add(p.x, y + 2.15, p.z, 0.5, 0xffd8a0, 0.7 * k, [0.04, 11, p.x]); ctx.pool.add(p.x, p.z + 3, 5, 5, 0xffd8a0, 0.12 * k) }
      return
    }
    case "flag": {
      const h = p.h ?? 7
      place(metal, t.cyl8, p.x, h / 2, p.z, 0, 0, 0, 0.05, h, 0.05, 0xc8ccd0)
      ctx.B("burlap").box(p.x + 0.05, h - 1.1, p.z - 0.01, p.x + 1.7, h - 0.1, p.z + 0.01, { color: tint(p.tint ?? 0x2d557f), ao: 0 })
      return
    }
    default: return
  }
}

/** Pitched roof: two tile slopes, gable ends (inset by the overhang), fascia and ridge. v 0 = ridge along X. */
function gable(ctx: BuildCtx, p: MapProp): void {
  const w = p.w ?? 10, d = p.d ?? 8, y = p.y ?? 6, h = p.h ?? 3, ov = 0.35
  const roof = ctx.B("rooftile"), c = tint(p.tint ?? 0x9a4a32, 1, jit(p, 0.06)), wallKey = p.text === "brick" || p.text === "boards" || p.text === "cladding" || p.text === "block" ? p.text : "plaster"
  const endB = ctx.B(wallKey), ec = wallKey === "brick" ? tint(p.tint2, 0.3, jit(p, 0.05)) : tint(p.tint2 ?? 0xd2c8b6, 1, jit(p, 0.05))
  const fascia = ctx.B("plank"), fc = tint(0x4a3a2c)
  const x0 = p.x - w / 2, x1 = p.x + w / 2, z0 = p.z - d / 2, z1 = p.z + d / 2
  if ((p.v ?? 0) === 0) {
    const zc = p.z, sl = Math.hypot(d / 2, h), e = h * ov / (d / 2)
    roof.quad([x1, y, z0], [x0, y, z0], [x0, y + h, zc], [x1, y + h, zc], [0, d / 2 / sl, -h / sl], [x1, 0, x0, 0, x0, sl, x1, sl], c)
    roof.quad([x0, y, z1], [x1, y, z1], [x1, y + h, zc], [x0, y + h, zc], [0, d / 2 / sl, h / sl], [x0, 0, x1, 0, x1, sl, x0, sl], c)
    for (const [gx, n] of [[x0 + ov, -1], [x1 - ov, 1]] as const) {
      const a = z0 + ov, b = z1 - ov
      if (n < 0) { endB.quad([gx, y, a], [gx, y, b], [gx, y + e, b], [gx, y + e, a], [-1, 0, 0], [a, y, b, y, b, y + e, a, y + e], ec); endB.quad([gx, y + e, a], [gx, y + e, b], [gx, y + h - 0.02, zc], [gx, y + h - 0.02, zc], [-1, 0, 0], [a, y + e, b, y + e, zc, y + h, zc, y + h], ec) }
      else { endB.quad([gx, y, b], [gx, y, a], [gx, y + e, a], [gx, y + e, b], [1, 0, 0], [b, y, a, y, a, y + e, b, y + e], ec); endB.quad([gx, y + e, b], [gx, y + e, a], [gx, y + h - 0.02, zc], [gx, y + h - 0.02, zc], [1, 0, 0], [b, y + e, a, y + e, zc, y + h, zc, y + h], ec) }
    }
    fascia.quad([x0, y - 0.01, z0], [x1, y - 0.01, z0], [x1, y - 0.01, z0 + ov], [x0, y - 0.01, z0 + ov], [0, -1, 0], [0, 0, w, 0, w, ov, 0, ov], fc)
    fascia.quad([x0, y - 0.01, z1 - ov], [x1, y - 0.01, z1 - ov], [x1, y - 0.01, z1], [x0, y - 0.01, z1], [0, -1, 0], [0, 0, w, 0, w, ov, 0, ov], fc)
    fascia.box(x0, y - 0.18, z0 - 0.03, x1, y + 0.02, z0 + 0.02, { color: fc, ao: 0 }); fascia.box(x0, y - 0.18, z1 - 0.02, x1, y + 0.02, z1 + 0.03, { color: fc, ao: 0 })
    roof.box(x0, y + h - 0.05, zc - 0.14, x1, y + h + 0.1, zc + 0.14, { color: c.clone().multiplyScalar(0.8), ao: 0 })
  } else {
    const xc = p.x, sl = Math.hypot(w / 2, h), e = h * ov / (w / 2)
    roof.quad([x0, y, z0], [x0, y, z1], [xc, y + h, z1], [xc, y + h, z0], [-h / sl, w / 2 / sl, 0], [z0, 0, z1, 0, z1, sl, z0, sl], c)
    roof.quad([x1, y, z1], [x1, y, z0], [xc, y + h, z0], [xc, y + h, z1], [h / sl, w / 2 / sl, 0], [z1, 0, z0, 0, z0, sl, z1, sl], c)
    for (const [gz, n] of [[z0 + ov, -1], [z1 - ov, 1]] as const) {
      const a = x0 + ov, b = x1 - ov
      if (n < 0) { endB.quad([b, y, gz], [a, y, gz], [a, y + e, gz], [b, y + e, gz], [0, 0, -1], [b, y, a, y, a, y + e, b, y + e], ec); endB.quad([b, y + e, gz], [a, y + e, gz], [xc, y + h - 0.02, gz], [xc, y + h - 0.02, gz], [0, 0, -1], [b, y + e, a, y + e, xc, y + h, xc, y + h], ec) }
      else { endB.quad([a, y, gz], [b, y, gz], [b, y + e, gz], [a, y + e, gz], [0, 0, 1], [a, y, b, y, b, y + e, a, y + e], ec); endB.quad([a, y + e, gz], [b, y + e, gz], [xc, y + h - 0.02, gz], [xc, y + h - 0.02, gz], [0, 0, 1], [a, y + e, b, y + e, xc, y + h, xc, y + h], ec) }
    }
    fascia.quad([x0, y - 0.01, z1], [x0, y - 0.01, z0], [x0 + ov, y - 0.01, z0], [x0 + ov, y - 0.01, z1], [0, -1, 0], [0, 0, d, 0, d, ov, 0, ov], fc)
    fascia.quad([x1 - ov, y - 0.01, z1], [x1 - ov, y - 0.01, z0], [x1, y - 0.01, z0], [x1, y - 0.01, z1], [0, -1, 0], [0, 0, d, 0, d, ov, 0, ov], fc)
    fascia.box(x0 - 0.03, y - 0.18, z0, x0 + 0.02, y + 0.02, z1, { color: fc, ao: 0 }); fascia.box(x1 - 0.02, y - 0.18, z0, x1 + 0.03, y + 0.02, z1, { color: fc, ao: 0 })
    roof.box(xc - 0.14, y + h - 0.05, z0, xc + 0.14, y + h + 0.1, z1, { color: c.clone().multiplyScalar(0.8), ao: 0 })
  }
}

/** Ridge tent (canvas) with guy ropes; ridge along the longer side. */
function tent(ctx: BuildCtx, x: number, z: number, w: number, d: number, h: number, tintHex: number, v: number): void {
  const b = ctx.B("burlap"), c = tint(tintHex, 1, 1.25 + ctx.rng() * 0.2), dark = c.clone().multiplyScalar(0.55), alongX = w >= d
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, wall = h * 0.28
  if (alongX) {
    const sl = Math.hypot(d / 2, h - wall)
    b.box(x0, 0, z0, x1, wall, z1, { color: c, skip: PY, local: true, ao: 0.15 })
    b.quad([x1, wall, z0], [x0, wall, z0], [x0, h, z], [x1, h, z], [0, 0.6, -0.8], [w, 0, 0, 0, 0, sl, w, sl], c)
    b.quad([x0, wall, z1], [x1, wall, z1], [x1, h, z], [x0, h, z], [0, 0.6, 0.8], [0, 0, w, 0, w, sl, 0, sl], c)
    b.quad([x0, wall, z0], [x0, wall, z1], [x0, h, z], [x0, h, z], [-1, 0, 0], [0, 0, d, 0, d / 2, h, d / 2, h], v === 1 ? dark : c)
    b.quad([x1, wall, z1], [x1, wall, z0], [x1, h, z], [x1, h, z], [1, 0, 0], [0, 0, d, 0, d / 2, h, d / 2, h], c)
    ctx.lines.push(x0, h, z, x0 - 1.2, 0, z, x1, h, z, x1 + 1.2, 0, z)
  } else {
    const sl = Math.hypot(w / 2, h - wall)
    b.box(x0, 0, z0, x1, wall, z1, { color: c, skip: PY, local: true, ao: 0.15 })
    b.quad([x0, wall, z0], [x0, wall, z1], [x, h, z1], [x, h, z0], [-0.8, 0.6, 0], [0, 0, d, 0, d, sl, 0, sl], c)
    b.quad([x1, wall, z1], [x1, wall, z0], [x, h, z0], [x, h, z1], [0.8, 0.6, 0], [0, 0, d, 0, d, sl, 0, sl], c)
    b.quad([x1, wall, z0], [x0, wall, z0], [x, h, z0], [x, h, z0], [0, 0, -1], [0, 0, w, 0, w / 2, h, w / 2, h], c)
    b.quad([x0, wall, z1], [x1, wall, z1], [x, h, z1], [x, h, z1], [0, 0, 1], [0, 0, w, 0, w / 2, h, w / 2, h], v === 1 ? dark : c)
    ctx.lines.push(x, h, z0, x, 0, z0 - 1.2, x, h, z1, x, 0, z1 + 1.2)
  }
}

/** Quay wall from (x, z) to (x2, z2): concrete face down to the water on `face`, coping, fenders, chain posts. */
function quay(ctx: BuildCtx, p: MapProp): void {
  const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, f = p.face ?? "s", alongX = Math.abs(z2 - p.z) < 1e-6
  const a0 = alongX ? Math.min(p.x, x2) : Math.min(p.z, z2), a1 = alongX ? Math.max(p.x, x2) : Math.max(p.z, z2), c = alongX ? p.z : p.x
  const out = f === "s" || f === "e" ? 1 : -1, conc = ctx.B("concrete"), level = -2.3
  const box = (s0: number, s1: number, o0: number, o1: number, y0: number, y1: number, col: THREE.Color, opt: { skip?: number; ao?: number } = {}) => {
    const q0 = c + out * o0, q1 = c + out * o1
    if (alongX) conc.box(s0, y0, Math.min(q0, q1), s1, y1, Math.max(q0, q1), { color: col, ao: opt.ao ?? 0, skip: opt.skip })
    else conc.box(Math.min(q0, q1), y0, s0, Math.max(q0, q1), y1, s1, { color: col, ao: opt.ao ?? 0, skip: opt.skip })
  }
  box(a0, a1, -0.6, 0, level - 3, 0, tint(0x7a7a76), { skip: PY })
  box(a0, a1, -0.5, 0.02, 0, 0.06, tint(0xb8b4aa))
  const long = a1 - a0 > 400
  for (let s = a0 + 4; s < a1 - 2; s += long ? 14 : 8) {
    const q = c + out * 0.08, rub = ctx.B("rubber")
    if (alongX) rub.box(s - 0.6, level + 0.2, Math.min(q, q + out * 0.35), s + 0.6, -0.25, Math.max(q, q + out * 0.35), { color: tint(0x222222), ao: 0 })
    else rub.box(Math.min(q, q + out * 0.35), level + 0.2, s - 0.6, Math.max(q, q + out * 0.35), -0.25, s + 0.6, { color: tint(0x222222), ao: 0 })
  }
  for (let s = a0 + 0.5; s < a1; s += 0.9) decal(ctx, "paint", alongX ? s : c - out * 0.3, 0.065, alongX ? c - out * 0.3 : s, alongX ? 0.8 : 0.12, alongX ? 0.12 : 0.8, "up", 0xc9a227)
  if (!long) {
    for (let s = a0 + 1.5; s < a1 - 1; s += 3) { const px = alongX ? s : c - out * 0.35, pz = alongX ? c - out * 0.35 : s; ctx.inst("chainpost", px, 0, pz, 0, [1, 1, 1], 0xc9a227) }
    for (let s = a0 + 1.5; s < a1 - 4; s += 3) { const ax = alongX ? s : c - out * 0.35, az = alongX ? c - out * 0.35 : s, bx = alongX ? s + 3 : ax, bz = alongX ? az : s + 3; sag(ctx, ax, 0.95, az, bx, 0.95, bz, 0.12, 4) }
  }
}

/** Railway track along X or Z: two rails on sleepers (ballast is a ground area). */
function track(ctx: BuildCtx, p: MapProp): void {
  const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, alongX = Math.abs(z2 - p.z) < 1e-6
  const a0 = alongX ? Math.min(p.x, x2) : Math.min(p.z, z2), a1 = alongX ? Math.max(p.x, x2) : Math.max(p.z, z2), c = alongX ? p.z : p.x
  const sl = ctx.B("plank"), metal = ctx.B("metal"), sc = tint(0x4a3e34), rc = tint(0x6a625a)
  for (let s = a0 + 0.3; s < a1; s += 0.65) {
    if (alongX) sl.box(s - 0.13, 0, c - 1.3, s + 0.13, 0.12, c + 1.3, { color: sc.clone().multiplyScalar(0.85 + ctx.rng() * 0.3), ao: 0, skip: NY })
    else sl.box(c - 1.3, 0, s - 0.13, c + 1.3, 0.12, s + 0.13, { color: sc.clone().multiplyScalar(0.85 + ctx.rng() * 0.3), ao: 0, skip: NY })
  }
  for (const o of [-0.7175, 0.7175]) {
    if (alongX) metal.box(a0, 0.12, c + o - 0.035, a1, 0.26, c + o + 0.035, { color: rc, ao: 0, skip: NY })
    else metal.box(c + o - 0.035, 0.12, a0, c + o + 0.035, 0.26, a1, { color: rc, ao: 0, skip: NY })
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Zone perimeter: double chain-link fence with concertina on the land sides, closed gates, quarantine signs, lamps
// ---------------------------------------------------------------------------------------------------------------
export function buildZoneFence(ctx: BuildCtx, b: { minX: number; maxX: number; minZ: number; maxZ: number }, gates: Array<{ side: Side; at: number; w: number }>, sides: Side[]): void {
  for (const side of sides) {
    const alongX = side === "n" || side === "s"
    const c = side === "n" ? b.minZ : side === "s" ? b.maxZ : side === "w" ? b.minX : b.maxX
    const out = side === "n" || side === "w" ? -1 : 1
    const s0 = (alongX ? b.minX : b.minZ) - 0.3, s1 = (alongX ? b.maxX : b.maxZ) + 0.3
    const gs = gates.filter(g => g.side === side).map(g => [g.at - g.w / 2, g.at + g.w / 2] as [number, number]).sort((p, q) => p[0] - q[0])
    const P2 = (s: number, off: number): [number, number] => alongX ? [s, c + out * off] : [c + out * off, s]
    const face: Side = side === "w" ? "e" : side === "e" ? "w" : side === "n" ? "s" : "n"
    const runs: Array<[number, number]> = []
    let cur = s0
    for (const [a, e] of gs) { runs.push([cur, a]); cur = e }
    runs.push([cur, s1])
    for (const [a, e] of runs) {
      if (e - a < 0.3) continue
      const [px0, pz0] = P2(a, 0.1), [px1, pz1] = P2(e, 0.36)
      ctx.B("concrete").box(Math.min(px0, px1), 0, Math.min(pz0, pz1), Math.max(px0, px1), 0.35, Math.max(pz0, pz1), { color: tint(0xa8a49a) })
      const [ax, az] = P2(a, 0.23), [bx, bz] = P2(e, 0.23)
      fenceRun(ctx, ax, az, bx, bz, 0.35, 2.8, true, 3)
      const [ox0, oz0] = P2(a - (a === s0 ? 5 : 0), 5.2), [ox1, oz1] = P2(e + (e === s1 ? 5 : 0), 5.2)
      fenceRun(ctx, ox0, oz0, ox1, oz1, 0.05, 3, true, 3.5)
      for (let s = a + 12; s < e - 4; s += 42) { const [sx, sz] = P2(s, 0.08); decal(ctx, "quarantine", sx, 1.3, sz, 2.4, 0.8, face) }
      for (let s = a + 20; s < e - 2; s += 36) {
        const [lx, lz] = P2(s, 0.7), [ix, iz] = P2(s, -0.3)
        place(ctx.B("metal"), tpl().cyl8, lx, 2.1, lz, 0, 0, 0, 0.07, 4.2, 0.07, 0x6a6e72)
        const k = lampAt(ctx, ix, 4, iz, 0xffc890)
        ctx.B("lamp").box(ix - 0.16, 3.95, iz - 0.16, ix + 0.16, 4.1, iz + 0.16, { color: k > 0 ? tint(0xffd8a8, 1, 2.2) : tint(0x3a3c3e), ao: 0 })
        if (k > 0) { ctx.glow.add(ix, 3.9, iz, 0.8, 0xffc890, 0.9 * k, [0.04, 11, s]); ctx.pool.add(ix, iz, 5, 5, 0xffc890, 0.13 * k) }
      }
    }
    for (const [a, e] of gs) {
      const [ax, az] = P2(a, 0.23), [bx, bz] = P2(e, 0.23)
      fenceRun(ctx, ax, az, bx, bz, 0.08, 2.6, true, (e - a) / 2)
      const m = ctx.B("metal"), cc = tint(0x4a4e52)
      for (const [px, pz] of [[ax, az], [bx, bz]]) m.box(px - 0.14, 0, pz - 0.14, px + 0.14, 3.2, pz + 0.14, { color: cc, local: true })
      const [mx, mz] = P2((a + e) / 2, 0.23)
      decal(ctx, "noentry", mx + (alongX ? 0 : -out * 0.05), 1.1, mz + (alongX ? -out * 0.05 : 0), 1.3, 0.65, face)
      const [ox0, oz0] = P2(a, 5.2), [ox1, oz1] = P2(e, 5.2)
      fenceRun(ctx, ox0, oz0, ox1, oz1, 0.05, 2.6, true, (e - a) / 2)
    }
  }
}
