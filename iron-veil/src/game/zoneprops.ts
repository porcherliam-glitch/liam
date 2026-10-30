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
import { addTemplate, buildSolid, decal, fenceRun, jit, lampAt, place, registerExtras, sag, textKey, tint, tpl, type BuildCtx, type WindowReq } from "./props"
import { CAR_LENGTH, CAR_WIDTH, apcGeometry, beddingGeometry, benchGeometry, boatGeometry, bodyBagGeometry, boxcarGeometry, busGeometry, carGeometry, chairGeometry, conveyorGeometry, forkliftGeometry, excavatorGeometry, fuelPumpGeometry, hopperWagonGeometry, litterBinGeometry, tableGeometry, tankWagonGeometry, tractorGeometry, trashBagGeometry, trestleGeometry, truckCabGeometry, type CarStyle, type VehicleGeo, type VehiclePart } from "./vehicleModels"

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
  if (bd.style === "siding") return hutFacade(ctx, bd)
  if (bd.style === "bunker") return bunkerFacade(ctx, bd)
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

/** Doors of a building on its outer walls: centre on the outer wall plane, face and width. */
function doorsOf(ctx: BuildCtx, bd: BuildingInfo): Array<{ x: number; z: number; f: Side; w: number }> {
  const out: Array<{ x: number; z: number; f: Side; w: number }> = []
  for (const d of ctx.data.doorways) {
    if (d.building !== bd.id) continue
    const f: Side = d.nz < 0 ? "n" : d.nz > 0 ? "s" : d.nx > 0 ? "e" : "w"
    out.push({ x: f === "e" ? bd.x1 : f === "w" ? bd.x0 : d.x, z: f === "n" ? bd.z0 : f === "s" ? bd.z1 : d.z, f, w: d.w })
  }
  return out
}

/**
 * Prefab barrack hut (siding): concrete plinth, low-pitched ribbed metal roof with overhang, gutters and ridge cap,
 * steps and a small canopy at each door, wall-mounted air conditioners, cable duct.
 */
function hutFacade(ctx: BuildCtx, bd: BuildingInfo): void {
  const conc = ctx.B("concrete"), metal = ctx.B("metal"), rng = ctx.rng, top = bd.h + (bd.upper || 0.5)
  ring(conc, bd, 0, 0.32, 0.07, tint(0x8a8680, 1, 0.9 + rng() * 0.15))
  // roof: ridge along the long side, 0.45 m overhang, gable ends in siding
  const alongX = bd.x1 - bd.x0 >= bd.z1 - bd.z0, ov = 0.45, oe = 0.3, ye = top - 0.02, rise = Math.min(1.1, (alongX ? bd.z1 - bd.z0 : bd.x1 - bd.x0) * 0.11), yr = ye + rise
  const rc = tint(0x6a705e, 1, 0.85 + rng() * 0.25), roof = ctx.B("cladding"), gc = tint(bd.tint ?? 0x5c6449, 1, 0.95), sid = ctx.B("siding")
  if (alongX) {
    const x0 = bd.x0 - oe, x1 = bd.x1 + oe, z0 = bd.z0 - ov, z1 = bd.z1 + ov, zc = (bd.z0 + bd.z1) / 2
    quadN(roof, [x1, ye, z0], [x0, ye, z0], [x0, yr, zc], [x1, yr, zc], rc)
    quadN(roof, [x0, ye, z1], [x1, ye, z1], [x1, yr, zc], [x0, yr, zc], rc)
    quadN(sid, [bd.x0, ye, bd.z0], [bd.x0, ye, bd.z1], [bd.x0, yr - 0.02, zc], [bd.x0, yr - 0.02, zc], gc)
    quadN(sid, [bd.x1, ye, bd.z1], [bd.x1, ye, bd.z0], [bd.x1, yr - 0.02, zc], [bd.x1, yr - 0.02, zc], gc)
    for (const [za, zb] of [[z0, bd.z0], [bd.z1, z1]]) metal.box(x0, ye - 0.1, za, x1, ye - 0.02, zb, { color: tint(0x4a4e48), ao: 0 })
    for (const zg of [z0 - 0.07, z1 + 0.07]) metal.box(x0, ye - 0.16, zg - 0.07, x1, ye - 0.04, zg + 0.07, { color: tint(0x7a7e82), ao: 0 })
    metal.box(x0, yr - 0.04, zc - 0.16, x1, yr + 0.07, zc + 0.16, { color: rc.clone().multiplyScalar(0.8), ao: 0 })
    for (const xb of [x0, x1]) metal.box(xb - 0.03, ye - 0.05, z0, xb + 0.03, yr, z1, { color: tint(0x4a4e48), ao: 0 })
  } else {
    const x0 = bd.x0 - ov, x1 = bd.x1 + ov, z0 = bd.z0 - oe, z1 = bd.z1 + oe, xc = (bd.x0 + bd.x1) / 2
    quadN(roof, [x0, ye, z0], [x0, ye, z1], [xc, yr, z1], [xc, yr, z0], rc)
    quadN(roof, [x1, ye, z1], [x1, ye, z0], [xc, yr, z0], [xc, yr, z1], rc)
    quadN(sid, [bd.x1, ye, bd.z0], [bd.x0, ye, bd.z0], [xc, yr - 0.02, bd.z0], [xc, yr - 0.02, bd.z0], gc)
    quadN(sid, [bd.x0, ye, bd.z1], [bd.x1, ye, bd.z1], [xc, yr - 0.02, bd.z1], [xc, yr - 0.02, bd.z1], gc)
    for (const [xa, xb] of [[x0, bd.x0], [bd.x1, x1]]) metal.box(xa, ye - 0.1, z0, xb, ye - 0.02, z1, { color: tint(0x4a4e48), ao: 0 })
    for (const xg of [x0 - 0.07, x1 + 0.07]) metal.box(xg - 0.07, ye - 0.16, z0, xg + 0.07, ye - 0.04, z1, { color: tint(0x7a7e82), ao: 0 })
    metal.box(xc - 0.16, yr - 0.04, z0, xc + 0.16, yr + 0.07, z1, { color: rc.clone().multiplyScalar(0.8), ao: 0 })
    for (const zb of [z0, z1]) metal.box(x0, ye - 0.05, zb - 0.03, x1, yr, zb + 0.03, { color: tint(0x4a4e48), ao: 0 })
  }
  // doors: two concrete steps and a canopy on brackets
  for (const d of doorsOf(ctx, bd)) {
    const [nx, nz] = N[d.f], w = d.w + 0.5
    onWall(conc, d.f, d.x, d.z, w, 0, 0.16, 0, 0.9, tint(0x9a968c))
    onWall(conc, d.f, d.x, d.z, w - 0.2, 0.16, 0.3, 0, 0.5, tint(0xa29e94))
    onWall(metal, d.f, d.x, d.z, w + 0.3, 2.62, 2.7, 0, 1.0, tint(0x4a4e48))
    for (const sd of [-1, 1]) {
      const o = sd * (w / 2 + 0.05), bx = nz !== 0 ? d.x + o : d.x, bz = nz !== 0 ? d.z : d.z + o
      strut(metal, bx, 2.05, bz, bx + nx * 0.9, 2.62, bz + nz * 0.9, 0.025, 0x3a3e40)
    }
  }
  // air conditioners and a cable duct along one long wall
  const f: Side = alongX ? (rng() < 0.5 ? "n" : "s") : (rng() < 0.5 ? "e" : "w"), [nx, nz] = N[f]
  const len = alongX ? bd.x1 - bd.x0 : bd.z1 - bd.z0, wx = f === "e" ? bd.x1 : f === "w" ? bd.x0 : 0, wz = f === "s" ? bd.z1 : f === "n" ? bd.z0 : 0
  const at = (u: number): [number, number] => alongX ? [bd.x0 + u, wz] : [wx, bd.z0 + u]
  onWall(metal, f, ...at(len / 2), len - 0.6, bd.h - 0.55, bd.h - 0.43, 0, 0.1, tint(0x6a6e66))
  for (const u of [len * 0.25 + rng() * 2, len * 0.7 + rng() * 2]) {
    const [x, z] = at(u), open = ctx.data.doorways.some(d => Math.hypot(d.x - x, d.z - z) < 2.4)
    if (open) continue
    onWall(metal, f, x, z, 0.85, 1.75, 2.35, 0.02, 0.4, tint(0xc8c8c0, 1, 0.85 + rng() * 0.2))
    decal(ctx, "vent", x + nx * 0.405, 1.8, z + nz * 0.405, 0.7, 0.5, f, 0x9a9a96)
    for (const o of [-0.3, 0.3]) onWall(metal, f, nz !== 0 ? x + o : x, nz !== 0 ? z : z + o, 0.04, 1.6, 1.75, 0, 0.35, tint(0x3a3e40))
  }
}

/**
 * Concrete bunker: projecting roof slab, sandbag parapet and mushroom vents on the roof, whip antenna, thick blast-door
 * surrounds with yellow-black edges and a heavy steel leaf open against the wall, cable conduit.
 */
function bunkerFacade(ctx: BuildCtx, bd: BuildingInfo): void {
  const conc = ctx.B("concrete"), metal = ctx.B("metal"), rng = ctx.rng, cc = tint(bd.tint ?? 0x8e8b84, 0.95, 0.9 + rng() * 0.1), top = bd.h + 0.5
  ring(conc, bd, bd.h - 0.35, top, 0.22, cc)
  ring(conc, bd, 0, 0.4, 0.1, cc.clone().multiplyScalar(0.85))
  // sandbag parapet round the roof (stacked bags like the ground positions), gaps at the corners
  const cxb = (bd.x0 + bd.x1) / 2, czb = (bd.z0 + bd.z1) / 2, lx = bd.x1 - bd.x0 - 2, lz = bd.z1 - bd.z0 - 2
  for (const [x, z, w, d] of [[cxb, bd.z0 + 0.45, lx, 0.6], [cxb, bd.z1 - 0.45, lx, 0.6], [bd.x0 + 0.45, czb, 0.6, lz], [bd.x1 - 0.45, czb, 0.6, lz]]) {
    buildSolid(ctx, { x, z, w, d, h: 0.57, y: top, style: "sandbag" })
  }
  // mushroom vents and an antenna
  const cx = (bd.x0 + bd.x1) / 2, cz = (bd.z0 + bd.z1) / 2, t = tpl()
  for (const [vx, vz] of [[cx - (bd.x1 - bd.x0) * 0.25, cz], [cx + (bd.x1 - bd.x0) * 0.25, cz + (bd.z1 - bd.z0) * 0.15]]) {
    place(metal, t.cyl12, vx, top + 0.45, vz, 0, 0, 0, 0.16, 0.9, 0.16, 0x5a5e5a)
    place(metal, t.dome, vx, top + 0.85, vz, 0, 0, 0, 0.42, 0.22, 0.42, 0x4a4e4a)
    place(conc, t.cyl12, vx, top + 0.08, vz, 0, 0, 0, 0.35, 0.16, 0.35, cc)
  }
  const ax = bd.x1 - 1.6, az = bd.z0 + 1.6
  strut(metal, ax, top, az, ax, top + 5.5, az, 0.03, 0x3a3e40)
  place(metal, t.box, ax, top + 0.3, az, 0, 0, 0, 0.3, 0.6, 0.3, 0x4a5240)
  // blast-door surrounds and open steel leaves
  for (const d of doorsOf(ctx, bd)) {
    const [nx, nz] = N[d.f], yel = tint(0xd8b030), blk = tint(0x1e1e1e)
    for (const sd of [-1, 1]) {
      const o = sd * (d.w / 2 + 0.25), px = nz !== 0 ? d.x + o : d.x, pz = nz !== 0 ? d.z : d.z + o
      onWall(conc, d.f, px, pz, 0.5, 0, 2.95, 0, 0.45, cc)
      for (let y = 0.1; y < 2.8; y += 0.5) onWall(metal, d.f, nz !== 0 ? px - sd * 0.24 : px, nz !== 0 ? pz : pz - sd * 0.24, 0.03, y, y + 0.25, 0.05, 0.42, (y * 2) % 2 < 1 ? yel : blk)
    }
    onWall(conc, d.f, d.x, d.z, d.w + 1.0, 2.55, 3.15, 0, 0.45, cc)
    const o = d.w / 2 + 0.5 + 0.7, lx = nz !== 0 ? d.x + o : d.x, lz = nz !== 0 ? d.z : d.z + o
    onWall(metal, d.f, lx, lz, d.w + 0.2, 0.05, 2.5, 0.06, 0.2, tint(0x4a5240, 1, 0.85 + rng() * 0.2))
    for (const y of [0.6, 1.9]) onWall(metal, d.f, lx, lz, 0.25, y, y + 0.14, 0.2, 0.28, tint(0x2a2c2e))
    decal(ctx, "hazard", d.x + nx * 0.47, 2.7, d.z + nz * 0.47, d.w + 0.6, 0.3, d.f)
  }
  // cable conduit along the longest wall
  const alongX = bd.x1 - bd.x0 >= bd.z1 - bd.z0, f: Side = alongX ? "n" : "e"
  onWall(metal, f, alongX ? cx : bd.x1, alongX ? bd.z0 : cz, (alongX ? bd.x1 - bd.x0 : bd.z1 - bd.z0) - 1.5, bd.h - 0.8, bd.h - 0.68, 0, 0.12, tint(0x5a5e5a))
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
    case "cargo": cargoBody(ctx, s, k); return true
    case "machine": {
      if ((s.v ?? 0) !== 2) return false
      if (s.h >= 1.9 && s.h <= 2.4 && Math.max(s.w, s.d) <= 3.2) forklift(ctx, s, k)
      else if (s.h >= 3.5) crusher(ctx, s, k)
      else machinery(ctx, s, k)
      return true
    }
    case "desk": desk(ctx, s, k); return true
    case "cabinet": cabinet(ctx, s, k); return true
    case "console": consoleDesk(ctx, s, k); return true
    case "bunk": bunk(ctx, s, k); return true
    case "bench": case "pew": {
      const wood = ctx.B("plank"), c = tint(s.tint ?? 0x8a6a48, 1, k), seat = Math.min(0.47, s.h)
      if (s.style === "bench" && s.h <= 0.6) {
        const L = alongX ? s.w : s.d, D = alongX ? s.d : s.w
        addTemplate(ctx, benchGeometry(L, Math.min(D, 0.9)), placeAt(s.x, y0, s.z, alongX ? 0 : Math.PI / 2), { paint: ["plank", c], trim: ["metal", tint(0x2e3134)] })
        return true
      }
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
      // template is 1.0 × 0.8 × 1.6 with its displays on ±z: turn it so they face along the island
      const m = placeAt(s.x, y0, s.z, alongX ? 0 : Math.PI / 2).multiply(new THREE.Matrix4().makeScale((alongX ? s.w : s.d) / 1.0, s.h / 1.6, (alongX ? s.d : s.w) / 0.8))
      addTemplate(ctx, fuelPumpGeometry(), m, { paint: ["carpaint", tint(0xe0ded6, 1, k)], roof: ["carpaint", tint(0xb02820, 1, k)], frame: ["concrete", tint(0x9a968c)], trim: ["metal", tint(0x3a3e42)], glass: ["glass", tint(0x1a2a20)], rubber: ["rubber", tint(0x1a1a1a)] })
      return true
    }
    case "bale": {
      ctx.B("burlap").box(x0, y0, z0, x1, y1, z1, { color: tint(0xd8c27a, 1, k), top: tint(0xe2cc88, 1, k), local: true })
      return true
    }
    case "tractor": tractor(ctx, s, k); return true
    case "wagon": wagon(ctx, s, x0, y0, z0, x1, y1, z1, alongX, k); return true
    case "apc": apc(ctx, s, alongX); return true
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
      const along = !alongX, L = along ? s.d : s.w, W = along ? s.w : s.d, cradle = 0.7
      for (const fr of [0.25, 0.75]) { const p = (along ? z0 : x0) + L * fr; if (along) metal.box(x0 + 0.6, y0, p - 0.12, x1 - 0.6, cradle + 0.1, p + 0.12, { color: tint(0x4a4e52) }); else metal.box(p - 0.12, y0, z0 + 0.6, p + 0.12, cradle + 0.1, z1 - 0.6, { color: tint(0x4a4e52) }) }
      const f = along ? frameOf(s.x, s.z, 0, -1) : frameOf(s.x, s.z, -1, 0)
      addVehicle(ctx, boatGeometry(L, W, cradle), placeAt(s.x, 0, s.z, f.ry), {
        paint: ["carpaint", tint(s.tint ?? 0xd8d4c8, 1, k)], trim: ["carpaint", tint(0x8a2a22, 1, k)], chrome: ["carpaint", tint(0x2d557f, 1, k)],
        interior: ["plank", tint(0xb09a78)], glass: ["glass", tint(0x2c353d)], lampF: ["lamp", tint(0xfff2d0, 1, 0.7)],
      })
      return true
    }
    case "excavator": {
      const f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, -1)
      addVehicle(ctx, excavatorGeometry(), placeAt(s.x - (alongX ? 0.4 : 0), 0, s.z + (alongX ? 0 : 0.4), f.ry), {
        paint: ["carpaint", tint(s.tint ?? 0xc69c2c, 1, k)], glass: ["glass", tint(0x3a4650)], trim: ["metal", tint(0x2a2c2e)], chrome: ["chrome", tint(0xb4b8bc)],
        rubber: ["rubber", tint(0x1c1d1e)], interior: ["rubber", tint(0x1a1612)],
      })
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
    case "table": {
      const c = tint(s.tint ?? 0xae8a5e, 1, k)
      addTemplate(ctx, tableGeometry(s.w, s.d, s.h), placeAt(s.x, y0, s.z, 0), { paint: ["plank", c] })
      if (ctx.rng() < 0.6) decal(ctx, "paper", s.x, y1 + 0.005, s.z, 0.6, 0.5, "up", 0xffffff, ctx.rng() * 6)
      if (ctx.rng() < 0.5) place(metal, t.cyl8, s.x + (ctx.rng() - 0.5) * 0.4, y1 + 0.06, s.z + (ctx.rng() - 0.5) * 0.4, 0, 0, 0, 0.05, 0.12, 0.05, 0xd8d4c8)
      return true
    }
    case "chair": {
      // template backrest faces -z; v 1 puts it on the x0 side
      const c = tint(s.tint ?? 0x9a6e4a, 1, k), v = s.v ?? 1
      const m = placeAt(s.x, y0, s.z, v === 1 ? Math.PI / 2 : 0).multiply(new THREE.Matrix4().makeScale(Math.min(s.w, s.d) / 0.4, s.h / 0.9, Math.min(s.w, s.d) / 0.4))
      addTemplate(ctx, chairGeometry(Math.floor(s.x * 3.1 + s.z) & 1), m, { paint: ["plank", c] })
      return true
    }
    case "bed": {
      const wood = ctx.B("plank"), cloth = ctx.B("burlap"), c = tint(s.tint ?? 0x8a3a2a, 1, k)
      wood.box(x0, y0 + 0.15, z0, x1, y0 + 0.3, z1, { color: tint(0x6e4b33), ao: 0 })
      for (const [px, pz] of [[x0, z0], [x1 - 0.06, z0], [x0, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) wood.box(px, y0, pz, px + 0.06, y0 + 0.15, pz + 0.06, { color: tint(0x5a3e2a), ao: 0, local: true })
      cloth.box(x0 + 0.03, y0 + 0.3, z0 + 0.03, x1 - 0.03, y0 + 0.45, z1 - 0.03, { color: tint(0xd8d4c8), ao: 0 })
      // bedding template: head toward -z (long beds turn so the head sits at x0)
      const long = s.w > s.d, L = (long ? s.w : s.d) - 0.06, W = (long ? s.d : s.w) - 0.06
      addTemplate(ctx, beddingGeometry(W, L, Math.floor(s.x * 1.3 + s.z)), placeAt(s.x, y0 + 0.45, s.z, long ? Math.PI / 2 : 0), { paint: ["burlap", c], trim: ["burlap", tint(0xe8e4dc)], interior: ["burlap", tint(0xd8d4c8)] })
      if (long) wood.box(x0 - 0.02, y0, z0, x0 + 0.04, y0 + 0.9, z1, { color: tint(0x5a3e2a), ao: 0 })
      else wood.box(x0, y0, z0 - 0.02, x1, y0 + 0.9, z0 + 0.04, { color: tint(0x5a3e2a), ao: 0 })
      if (ctx.rng() < 0.25) decal(ctx, "blood", s.x, y1 + 0.01, s.z, 0.9, 0.9, "up", 0xffffff, ctx.rng() * 6)
      return true
    }
    case "litfass": {
      const r = Math.min(s.w, s.d) / 2 - 0.05
      place(ctx.B("plaster"), t.cyl16, s.x, y0 + s.h * 0.45, s.z, 0, 0, 0, r, s.h * 0.9, r, tint(0xd8d2c0), [Math.PI * 2 * r, s.h])
      place(metal, t.cyl16, s.x, y0 + s.h * 0.92, s.z, 0, 0, 0, r + 0.08, 0.14, r + 0.08, tint(0x2a4a3a))
      place(metal, t.dome, s.x, y0 + s.h * 0.92, s.z, 0, 0, 0, r * 0.9, r * 0.6, r * 0.9, tint(0x2a4a3a))
      place(metal, t.cyl16, s.x, y0 + 0.1, s.z, 0, 0, 0, r + 0.06, 0.2, r + 0.06, tint(0x2a4a3a))
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4, f: Side = (["s", "e", "n", "w"] as Side[])[i]; decal(ctx, `logo${i}`, s.x + Math.sin(a) * (r + 0.02), 0.6, s.z + Math.cos(a) * (r + 0.02), r * 1.2, 1.1, f, [0x8a3a2a, 0x2d557f, 0x3f6c48, 0xc69c2c][i]) }
      return true
    }
    case "phonebox": {
      const c = tint(0xd8b030), glass = ctx.B("glass")
      metal.box(x0, y0, z0, x1, y0 + 0.12, z1, { color: tint(0x5a5e62) })
      for (const [px, pz] of [[x0, z0], [x1 - 0.08, z0], [x0, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) metal.box(px, y0, pz, px + 0.08, y1 - 0.25, pz + 0.08, { color: c, ao: 0 })
      glass.box(x0 + 0.04, y0 + 0.12, z0 + 0.04, x1 - 0.04, y1 - 0.25, z1 - 0.04, { color: tint(0x8a9aa4), local: true, ao: 0, skip: 4 | 8 })
      metal.box(x0 - 0.03, y1 - 0.25, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, { color: tint(0x7a7e82), ao: 0 })
      decal(ctx, textKey(ctx, 3, "TELEFON"), s.x, y1 - 0.22, z1 + 0.04, s.w - 0.1, 0.18, "s")
      return true
    }
    case "shelter": {
      const glass = ctx.B("glass"), steel = tint(0x4a4e52), back = alongX ? z0 : x0
      if (alongX) {
        glass.box(x0, 0.1, z0, x1, s.h - 0.15, z0 + 0.04, { color: tint(0x9aaab4), local: true, ao: 0 })
        for (const x of [x0, x1 - 0.04]) glass.box(x, 0.1, z0, x + 0.04, s.h - 0.15, z1 - 0.3, { color: tint(0x9aaab4), local: true, ao: 0 })
        metal.box(x0 - 0.1, s.h - 0.15, z0 - 0.1, x1 + 0.1, s.h, z1 + 0.05, { color: steel, ao: 0 })
        for (const x of [x0, x1 - 0.06]) for (const z of [z0, z1 - 0.06]) metal.box(x, 0, z, x + 0.06, s.h - 0.15, z + 0.06, { color: steel, ao: 0 })
        ctx.B("plank").box(x0 + 0.3, 0.45, z0 + 0.08, x1 - 0.3, 0.5, z0 + 0.45, { color: tint(0x6a5038), ao: 0 })
        decal(ctx, "logo1", s.x, 0.6, z0 + 0.06, s.w * 0.4, 1.4, "s", 0x8a3a2a)
      } else {
        glass.box(x0, 0.1, z0, x0 + 0.04, s.h - 0.15, z1, { color: tint(0x9aaab4), local: true, ao: 0 })
        metal.box(x0 - 0.1, s.h - 0.15, z0 - 0.1, x1 + 0.05, s.h, z1 + 0.1, { color: steel, ao: 0 })
        ctx.B("plank").box(x0 + 0.08, 0.45, z0 + 0.3, x0 + 0.45, 0.5, z1 - 0.3, { color: tint(0x6a5038), ao: 0 })
      }
      void back
      place(metal, t.cyl8, alongX ? x1 + 0.4 : s.x, 1.3, alongX ? z1 : z1 + 0.4, 0, 0, 0, 0.04, 2.6, 0.04, 0x8a8e92)
      decal(ctx, textKey(ctx, 4, "H"), alongX ? x1 + 0.4 : s.x, 2.3, (alongX ? z1 : z1 + 0.4) + 0.05, 0.5, 0.5, "s")
      return true
    }
    case "bin": {
      const r = Math.min(s.w, s.d) / 0.64
      addTemplate(ctx, litterBinGeometry(), placeAt(s.x, y0, s.z, s.x * 1.7).multiply(new THREE.Matrix4().makeScale(r, s.h / 0.95, r)), { paint: ["carpaint", tint(0x3a5a3a, 1, k)], trim: ["metal", tint(0x2a2c2e)], interior: ["rubber", tint(0x0a0a0a)] })
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
/** Adds a vehicle template to the batches: part → [batch key, colour] (parts without an entry are skipped). */
function addVehicle(ctx: BuildCtx, geo: VehicleGeo, m: THREE.Matrix4, look: Partial<Record<VehiclePart, [string, THREE.Color]>>): void {
  for (const [part, kc] of Object.entries(look) as [VehiclePart, [string, THREE.Color]][]) { const g = geo[part]; if (g && kc) ctx.B(kc[0]).add(g, m, kc[1]) }
}
const placeAt = (x: number, y: number, z: number, ry: number) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry))

/** Charred / rusted paint: dark base with brown-orange patches (per call variation). */
function wreckPaint(ctx: BuildCtx, burnt: boolean, base?: number): THREE.Color {
  const c = burnt ? new THREE.Color(0x2a2522).lerp(new THREE.Color(0x6a3a22), ctx.rng() * 0.5) : new THREE.Color(base ?? 0x6a4a34).lerp(new THREE.Color(0x7a4426), 0.4 + ctx.rng() * 0.4)
  return tint(c.getHex(), 1, 0.8 + ctx.rng() * 0.3)
}

function carModel(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const v = s.v ?? 0, burnt = v === 9, rust = v === 4 || v === 8, wreck = burnt || rust, mil = v === 5, style = (v % 3) as CarStyle
  const L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, -1)
  const paint = wreck ? wreckPaint(ctx, burnt, s.tint) : tint(s.tint, 1, jit(s, 0.04))
  const sink = rust ? 0.06 : burnt ? 0.02 : 0, hw = W / 2, hl = L / 2
  const geo = carGeometry(style, !burnt)
  const m = new THREE.Matrix4().makeTranslation(s.x, -sink, s.z).multiply(new THREE.Matrix4().makeRotationY(f.ry))
  if (Math.abs(L - CAR_LENGTH) > 0.05 || Math.abs(W - CAR_WIDTH) > 0.05) m.multiply(new THREE.Matrix4().makeScale(L / CAR_LENGTH, 1, W / CAR_WIDTH))
  const parts: [VehiclePart, string, THREE.Color][] = [
    ["paint", "carpaint", paint], ["glass", "glass", tint(rust ? 0x3a3c36 : 0x2a333b)], ["trim", "rubber", tint(burnt ? 0x161412 : 0x262829)],
    ["chrome", burnt ? "metal" : "chrome", tint(burnt ? 0x2e2824 : rust ? 0x7a6a5a : 0xb4b8bc)], ["rubber", "rubber", tint(0x1c1d1e)],
    ["interior", "rubber", tint(0x1a1612)], ["plate", "metal", tint(burnt ? 0x2a2622 : 0xe6e4dc)],
  ]
  for (const [part, key, color] of parts) { const g = geo[part]; if (g) ctx.B(key).add(g, m, color) }
  if (!burnt) {
    if (geo.lampF) ctx.B("lamp").add(geo.lampF, m, tint(0xfff2d0, 1, 0.9))
    if (geo.lampR) ctx.B("lamp").add(geo.lampR, m, tint(0xb01810, 1, 0.8))
  } else for (const g of [geo.lampF, geo.lampR]) if (g) ctx.B("rubber").add(g, m, tint(0x141210))
  if (wreck) {
    decal(ctx, burnt ? "oil" : "puddle", s.x, 0, s.z, L + 1.6, W + 1.4, "up", burnt ? 0x202020 : 0xffffff, alongX ? 0 : Math.PI / 2)
    if (burnt) for (let i = 0; i < 3; i++) { const [x, z] = f.at((ctx.rng() - 0.5) * L, (ctx.rng() - 0.5) * W); decal(ctx, "paper", x, 0.92, z, 0.6, 0.6, "up", 0x302822, ctx.rng() * 6) }
  }
  if (mil) decal(ctx, textKey(ctx, 7, "Y-" + Math.floor(jit(s, 0.5) * 900)), alongX ? s.x + hl + 0.04 : s.x, 0.37, alongX ? s.z : s.z - hl - 0.04, 0.48, 0.1, alongX ? "e" : "n", 0xffffff)
  void hw
}

function busModel(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const v = s.v ?? 0, burnt = v === 9, rev = (v & 1) === 1 && !burnt
  const L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, hl = L / 2
  const f = alongX ? frameOf(s.x, s.z, rev ? -1 : 1, 0) : frameOf(s.x, s.z, 0, rev ? 1 : -1)
  const paint = burnt ? wreckPaint(ctx, true) : tint(s.tint ?? 0xd8c040, 1, jit(s, 0.04)), sink = burnt ? 0.1 : 0
  addVehicle(ctx, busGeometry(L, W, s.h, !burnt), placeAt(s.x, -sink, s.z, f.ry), {
    paint: ["carpaint", paint], glass: ["glass", tint(0x2c353d)], trim: ["rubber", tint(burnt ? 0x161412 : 0x232526)], chrome: ["chrome", tint(burnt ? 0x2e2824 : 0xa8acb0)],
    rubber: ["rubber", tint(0x1c1d1e)], interior: ["rubber", tint(0x14110e)],
    lampF: burnt ? ["rubber", tint(0x141210)] : ["lamp", tint(0xffa020, 1, 0.9)], lampR: burnt ? ["rubber", tint(0x141210)] : ["lamp", tint(0xb01810, 1, 0.8)],
  })
  const [dx, dz] = f.at(hl + 0.03, 0)
  if (!burnt) decal(ctx, textKey(ctx, 4, "SONDERFAHRT"), dx, s.h - 0.45, dz, 1.8, 0.24, alongX ? (rev ? "w" : "e") : (rev ? "s" : "n"))
  if (burnt) decal(ctx, "oil", s.x, 0, s.z, L + 2, W + 2, "up", 0x202020, alongX ? 0 : Math.PI / 2)
}

function truckCabModel(ctx: BuildCtx, s: MapSolid): void {
  const v = s.v ?? 0, face: Side = v === 0 ? "e" : v === 1 ? "w" : v === 2 ? "s" : "n"
  const fx = face === "e" ? 1 : face === "w" ? -1 : 0, fz = face === "s" ? 1 : face === "n" ? -1 : 0
  const f = frameOf(s.x, s.z, fx, fz)
  addVehicle(ctx, truckCabGeometry(), placeAt(s.x, 0, s.z, f.ry), {
    paint: ["carpaint", tint(s.tint, 1, jit(s, 0.04))], glass: ["glass", tint(0x2c353d)], trim: ["rubber", tint(0x232526)], chrome: ["chrome", tint(0xa8acb0)],
    rubber: ["rubber", tint(0x1c1d1e)], lampF: ["lamp", tint(0xfff2d0, 1, 0.9)], lampR: ["lamp", tint(0xffa020, 1, 0.9)],
  })
}

/** Junk wall: pallets on edge, corrugated sheets, a door, tyres, planks, sandbags at the foot (inside the box). */
function barricade(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, h = s.h, f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, 1), rng = ctx.rng, t = tpl()
  let u = -L / 2 + 0.1, last = -1
  while (u < L / 2 - 0.4) {
    let kind = Math.floor(rng() * 5); if (kind === last) kind = (kind + 1 + Math.floor(rng() * 4)) % 5; last = kind
    const w = Math.min(L / 2 - u, 0.7 + rng() * 0.7), c = u + w / 2, tilt = (rng() - 0.5) * 0.18
    const [x, z] = f.at(c, (rng() - 0.5) * W * 0.3)
    if (kind === 0) place(ctx.B("pallets"), t.box, x, h * 0.42, z, tilt, f.ry, (rng() - 0.5) * 0.12, w, h * 0.84, 0.16, tint(undefined, 1, 0.8 + rng() * 0.3), [1.2, 1.2])
    else if (kind === 1) place(ctx.B("cladding"), t.box, x, h * 0.48, z, tilt, f.ry, (rng() - 0.5) * 0.1, w + 0.2, h * 0.95, 0.04, tint([0x7a4a34, 0x5a6066, 0x8a9096, 0x6a5a40][Math.floor(rng() * 4)], 1, 0.8 + rng() * 0.3), [w, h])
    else if (kind === 2) place(ctx.B("plaster"), t.box, x, h * 0.4, z, tilt * 0.5, f.ry, 0, 0.8, h * 0.8, 0.5, tint(rng() < 0.5 ? 0xd8d8d0 : 0x6e4b33), [1, 1])
    else if (kind === 3) for (let i = 0; i < 3; i++) place(ctx.B("rubber"), t.tyre, x + (rng() - 0.5) * 0.1, 0.12 + i * 0.24, z, 0, rng() * 3, 0, 0.36, 0.24, 0.36, 0x8a8a8c)
    else place(ctx.B("crate"), t.box, x, 0.35, z, 0, f.ry + (rng() - 0.5) * 0.4, 0, Math.min(w, 1), 0.7, Math.min(W, 0.8), tint(undefined, 1, 0.8 + rng() * 0.3), [1.2, 1.2])
    u += w - 0.1
  }
  // a second, lower row of junk in front (oil drums, a dropped pallet, rubble), planks nailed across, sandbags at the foot
  for (let a = -L / 2 + 0.6; a < L / 2 - 0.5; a += 1.1 + rng() * 0.8) {
    const [x, z] = f.at(a, -W * 0.38), r = rng()
    if (r < 0.35) ctx.inst("barrel", x, 0.45, z, rng() * 6, [0.9, 0.9, 0.9], tint(0x4f5a4a, 1, 0.7 + rng() * 0.5).getHex())
    else if (r < 0.65) place(ctx.B("pallets"), t.box, x, 0.08, z, 0, f.ry + (rng() - 0.5) * 0.6, 0, 1.2, 0.14, 0.8, tint(undefined, 1, 0.8 + rng() * 0.3), [1.2, 1.2])
    else for (let i = 0; i < 3; i++) { const sz = 0.12 + rng() * 0.2; place(ctx.B("concrete"), t.chunkLo, x + (rng() - 0.5) * 0.6, sz * 0.5, z + (rng() - 0.5) * 0.5, rng() * 3, rng() * 3, 0, sz, sz * 0.7, sz, tint(0x9a968c, 1, 0.8 + rng() * 0.3)) }
  }
  for (let i = 0; i < 3; i++) { const [x, z] = f.at(-L / 2 + L * (0.2 + i * 0.3), 0); place(ctx.B("plank"), t.box, x, h * (0.4 + rng() * 0.4), z, 0, f.ry, (rng() - 0.5) * 1.2, Math.min(2.4, L * 0.4), 0.18, 0.05, tint(0x9a7a58, 1, 0.8 + rng() * 0.3), [2.4, 0.2]) }
  // concertina wire along the top and a leaning warning sign
  const c = tint(0xc8ccd0), cb = ctx.B("concertina"), [ax, az] = f.at(-L / 2 + 0.2, 0), [bx, bz] = f.at(L / 2 - 0.2, 0), r = 0.32, y = h - 0.05
  const nx = -Math.sin(f.ry + Math.PI / 2), nz = -Math.cos(f.ry + Math.PI / 2)
  cb.quad([ax, y, az], [bx, y, bz], [bx, y + 2 * r, bz], [ax, y + 2 * r, az], [nx, 0, nz], [0, 0, L, 0, L, 1, 0, 1], c)
  cb.quad([ax - nx * r, y + r, az - nz * r], [bx - nx * r, y + r, bz - nz * r], [bx + nx * r, y + r, bz + nz * r], [ax + nx * r, y + r, az + nz * r], [0, 1, 0], [0, 0, L, 0, L, 1, 0, 1], c)
  const [sx, sz] = f.at(L / 2 - 0.5, W * 0.35)
  place(ctx.B("metal"), t.cyl8, sx, 0.9, sz, 0.22, f.ry, 0.1, 0.03, 1.8, 0.03, 0x6a6e72)
  place(ctx.B("metal"), t.box, sx - Math.sin(f.ry) * 0.2, 1.75, sz - Math.cos(f.ry) * 0.2, 0.22, f.ry, 0.1, 0.6, 0.6, 0.03, 0xd8c040)
  for (let a = -L / 2 + 0.35; a < L / 2 - 0.3; a += 0.62) for (const sd of [-1, 1]) { const [x, z] = f.at(a, sd * (W / 2 - 0.2)); if (rng() < 0.6) ctx.inst("sandbag", x, 0.13, z, f.ry, [0.6, 0.26, 0.36], 0x8a7a5a) }
}

function tractor(ctx: BuildCtx, s: MapSolid, k: number): void {
  const alongX = s.w > s.d, f = alongX ? frameOf(s.x, s.z, -1, 0) : frameOf(s.x, s.z, 0, -1), paint = tint(s.tint ?? 0x3f7a3a, 1, k)
  addVehicle(ctx, tractorGeometry(), placeAt(s.x, 0, s.z, f.ry).multiply(new THREE.Matrix4().makeTranslation(-0.3, 0, 0)), {
    paint: ["carpaint", paint], glass: ["glass", tint(0x3a4650)], trim: ["rubber", tint(0x262829)], chrome: ["carpaint", tint(0xd8b030)],
    rubber: ["rubber", tint(0x1c1d1e)], interior: ["rubber", tint(0x1a1612)], lampF: ["lamp", tint(0xfff2d0, 1, 0.8)],
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Furniture: desks with drawer pedestals, steel cabinets with doors, operator consoles with screens, tube-frame bunks
// ---------------------------------------------------------------------------------------------------------------

/** Furniture frame: u points out of the front (the thin axis, towards the room centre), w along the long side. */
function furnitureFrame(ctx: BuildCtx, s: MapSolid): { f: Frame; D: number; L: number } {
  const thinX = s.w < s.d, b = ctx.data.buildings.find(q => s.x > q.x0 && s.x < q.x1 && s.z > q.z0 && s.z < q.z1)
  const cx = b ? (b.x0 + b.x1) / 2 : 0, cz = b ? (b.z0 + b.z1) / 2 : 0
  const fx = thinX ? (cx >= s.x ? 1 : -1) : 0, fz = thinX ? 0 : (cz >= s.z ? 1 : -1)
  return { f: frameOf(s.x, s.z, fx, fz), D: thinX ? s.w : s.d, L: thinX ? s.d : s.w }
}

function desk(ctx: BuildCtx, s: MapSolid, k: number): void {
  const { f, D, L } = furnitureFrame(ctx, s), v = s.v ?? 0, y0 = s.y ?? 0, y1 = y0 + s.h, metal = ctx.B("metal"), rng = ctx.rng
  const body = tint(v === 2 ? 0x4a5236 : 0x6e7378, 1, k), topC = tint(v === 1 ? 0x4a4e52 : v === 2 ? 0x5a6248 : 0xb08a62, 1, k), dark = tint(0x2a2c2e)
  const hd = D / 2, hl = L / 2, yt = y1 - 0.035
  f.box(v === 1 ? metal : ctx.B("plank"), -hd - 0.01, hd + 0.01, yt, y1, -hl, hl, topC)
  // drawer pedestal on one side, leg panel on the other, modesty panel at the back
  const pw = Math.min(0.45, L * 0.3)
  f.box(metal, -hd + 0.03, hd - 0.04, y0 + 0.03, yt, hl - pw, hl - 0.02, body)
  const dh = (yt - y0 - 0.08) / 3
  for (let i = 0; i < 3; i++) {
    const ya = y0 + 0.06 + i * dh
    f.box(metal, hd - 0.04, hd - 0.02, ya + 0.01, ya + dh - 0.01, hl - pw + 0.01, hl - 0.03, body.clone().multiplyScalar(1.08))
    f.box(metal, hd - 0.02, hd + 0.005, ya + dh * 0.62, ya + dh * 0.7, hl - pw / 2 - 0.08, hl - pw / 2 + 0.08, dark)
  }
  f.box(metal, -hd + 0.03, hd - 0.04, y0, yt, -hl + 0.02, -hl + 0.06, body)
  f.box(metal, -hd + 0.03, -hd + 0.05, y0 + 0.3, yt, -hl + 0.06, hl - pw, body.clone().multiplyScalar(0.9))
  // on top: papers, sometimes a monitor and keyboard, a mug
  const [px, pz] = f.at(0.05, -hl * 0.3)
  if (v === 3 || rng() < 0.5) decal(ctx, "paper", px, y1 + 0.004, pz, Math.min(0.6, L * 0.3), Math.min(0.45, D * 0.5), "up", 0xffffff, rng() * 6)
  if (v !== 2 && D >= 0.7 && rng() < 0.6) {
    const w = -hl * 0.1 + (rng() - 0.5) * 0.3
    f.box(metal, -hd + 0.12, -hd + 0.3, y1, y1 + 0.02, w - 0.12, w + 0.12, dark)
    f.box(metal, -hd + 0.18, -hd + 0.22, y1, y1 + 0.18, w - 0.03, w + 0.03, dark)
    f.box(metal, -hd + 0.2, -hd + 0.25, y1 + 0.12, y1 + 0.44, w - 0.27, w + 0.27, tint(0x1e2022))
    f.box(ctx.B("glass"), -hd + 0.25, -hd + 0.255, y1 + 0.14, y1 + 0.42, w - 0.25, w + 0.25, tint(0x101418))
    f.box(metal, hd - 0.35, hd - 0.18, y1, y1 + 0.02, w - 0.22, w + 0.22, tint(0x2e3032))
  }
  if (rng() < 0.4) { const [mx, mz] = f.at(hd * 0.2, hl * 0.55); place(metal, tpl().cyl12, mx, y1 + 0.05, mz, 0, 0, 0, 0.04, 0.1, 0.04, rng() < 0.5 ? 0xd8d4c8 : 0x3a5a7a) }
}

function cabinet(ctx: BuildCtx, s: MapSolid, k: number): void {
  const { f, D, L } = furnitureFrame(ctx, s), v = s.v ?? 0, y0 = s.y ?? 0, y1 = y0 + s.h, metal = ctx.B("metal")
  const c = tint(v === 2 ? 0x5c6448 : v === 1 ? 0x5a5f66 : 0x8a9096, 1, k), dark = tint(0x1e2022), hd = D / 2, hl = L / 2
  f.box(metal, -hd, hd - 0.025, y0 + 0.07, y1 - 0.03, -hl, hl, c)
  f.box(metal, -hd + 0.03, hd - 0.07, y0, y0 + 0.07, -hl + 0.03, hl - 0.03, dark)
  f.box(metal, -hd - 0.005, hd + 0.005, y1 - 0.03, y1, -hl - 0.005, hl + 0.005, c.clone().multiplyScalar(0.92))
  // doors of at most 0.9 m with seams, handles, vents and a label holder
  const n = Math.max(1, Math.round(L / 0.9)), dw = L / n, dc = c.clone().multiplyScalar(1.06)
  for (let i = 0; i < n; i++) {
    const w0 = -hl + i * dw, wc = w0 + dw / 2
    f.box(metal, hd - 0.025, hd - 0.005, y0 + 0.1, y1 - 0.06, w0 + 0.008, w0 + dw - 0.008, dc)
    const hw = i % 2 === 0 ? w0 + dw - 0.09 : w0 + 0.09
    f.box(metal, hd - 0.005, hd + 0.02, y0 + 0.95, y0 + 1.2, hw - 0.015, hw + 0.015, dark)
    f.box(metal, hd - 0.005, hd + 0.0, y1 - 0.42, y1 - 0.34, wc - 0.07, wc + 0.07, tint(0xd8d4c8))
    const [vx, vz] = f.at(hd - 0.003, wc)
    for (const vy of [y1 - 0.3, y0 + 0.2]) decal(ctx, "vent", vx, vy, vz, Math.min(0.4, dw * 0.5), 0.12, sideOf(f, 1), 0x9a9a96)
  }
}

function consoleDesk(ctx: BuildCtx, s: MapSolid, k: number): void {
  const { f, D, L } = furnitureFrame(ctx, s), y0 = s.y ?? 0, metal = ctx.B("metal"), lamp = ctx.B("lamp"), hd = D / 2, hl = L / 2
  const c = tint(0x3a3f45, 1, k), light = tint(0x5a6066, 1, k), dark = tint(0x16181a)
  f.box(metal, -hd, hd - 0.22, y0 + 0.08, y0 + 0.72, -hl, hl, c)
  f.box(metal, -hd + 0.03, hd - 0.26, y0, y0 + 0.08, -hl + 0.03, hl - 0.03, dark)
  f.box(metal, -hd, hd, y0 + 0.72, y0 + 0.77, -hl, hl, light)
  const back = Math.min(0.42, D * 0.45)
  f.box(metal, -hd, -hd + back, y0 + 0.77, y0 + 1.3, -hl, hl, c)
  f.box(metal, -hd - 0.01, -hd + back + 0.03, y0 + 1.27, y0 + 1.33, -hl - 0.01, hl + 0.01, light)
  const n = Math.max(1, Math.floor(L / 0.8))
  for (let i = 0; i < n; i++) {
    const wc = -hl + (i + 0.5) * L / n, col = i % 3 === 0 ? 0x7dffb0 : 0x5aa8ff
    f.box(metal, -hd + back, -hd + back + 0.012, y0 + 0.86, y0 + 1.22, wc - 0.3, wc + 0.3, dark)
    f.box(lamp, -hd + back + 0.012, -hd + back + 0.018, y0 + 0.9, y0 + 1.18, wc - 0.26, wc + 0.26, tint(col, 1, 0.9))
    f.box(metal, -hd + back + 0.12, -hd + back + 0.3, y0 + 0.77, y0 + 0.79, wc - 0.22, wc + 0.22, dark)
    for (let j = 0; j < 4; j++) f.box(lamp, hd - 0.12, hd - 0.08, y0 + 0.77, y0 + 0.785, wc - 0.2 + j * 0.12, wc - 0.16 + j * 0.12, tint([0xff3020, 0xffc020, 0x30ff60, 0x30a0ff][j], 1, 0.8))
    const [gx, gz] = f.at(-hd + back + 0.1, wc)
    ctx.glow.add(gx, y0 + 1.04, gz, 0.35, col, 0.5 * ctx.look.lamps, [0.15, 9, i])
  }
}

function bunk(ctx: BuildCtx, s: MapSolid, k: number): void {
  const { f, D, L } = furnitureFrame(ctx, s), y0 = s.y ?? 0, y1 = y0 + s.h, metal = ctx.B("metal"), cloth = ctx.B("burlap"), rng = ctx.rng
  const olive = tint(0x4f5a3c, 1, k), hd = D / 2, hl = L / 2, t = tpl()
  for (const u of [-hd + 0.03, hd - 0.03]) for (const w of [-hl + 0.03, hl - 0.03]) { const [x, z] = f.at(u, w); place(metal, t.cyl8, x, y0 + s.h / 2, z, 0, 0, 0, 0.025, s.h, 0.025, olive) }
  for (const y of [0.3, 1.35]) {
    for (const u of [-hd + 0.03, hd - 0.03]) f.box(metal, u - 0.02, u + 0.02, y0 + y - 0.03, y0 + y + 0.02, -hl + 0.03, hl - 0.03, olive)
    for (const w of [-hl + 0.03, hl - 0.03]) f.box(metal, -hd + 0.03, hd - 0.03, y0 + y - 0.03, y0 + y + 0.02, w - 0.02, w + 0.02, olive)
    // mattress, pillow, folded blanket
    f.box(cloth, -hd + 0.05, hd - 0.05, y0 + y + 0.02, y0 + y + 0.17, -hl + 0.05, hl - 0.05, tint(0x7a7a62, 1, k))
    f.box(cloth, -hd + 0.12, hd - 0.12, y0 + y + 0.17, y0 + y + 0.27, -hl + 0.08, -hl + 0.42, tint(0xd8d4c4, 1, 0.9 + rng() * 0.1))
    if (rng() < 0.7) f.box(cloth, -hd + 0.06, hd - 0.06, y0 + y + 0.17, y0 + y + 0.25, hl - 0.75 - rng() * 0.3, hl - 0.08, tint(0x46503a, 1, 0.85 + rng() * 0.3))
  }
  for (const w of [-hl + 0.03, hl - 0.03]) for (const y of [0.55, 0.75, 1.55, 1.7]) f.box(metal, -hd + 0.03, hd - 0.03, y0 + y - 0.012, y0 + y + 0.012, w - 0.012, w + 0.012, olive)
  // upper guard rail and a ladder at the foot
  f.box(metal, hd - 0.05, hd - 0.01, y0 + 1.68, y0 + 1.72, -hl + 0.03, hl * 0.2, olive)
  for (const y of [0.85, 1.1]) f.box(metal, hd - 0.04, hd + 0.0, y0 + y - 0.012, y0 + y + 0.012, hl - 0.38, hl - 0.03, olive)
  f.box(metal, hd - 0.04, hd, y0 + 0.3, y0 + 1.35, hl - 0.4, hl - 0.37, olive)
  void y1
}

/** Wall side a frame's ±u axis faces (for decals on furniture fronts). */
function sideOf(f: Frame, sgn: 1 | -1): Side {
  const [x0, z0] = f.at(0, 0), [x1, z1] = f.at(sgn, 0), dx = x1 - x0, dz = z1 - z0
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "e" : "w") : (dz > 0 ? "s" : "n")
}

/**
 * Truck box body / semi trailer: textured box with corner posts and rails, chassis, tandem wheels with side
 * under-run guards, rear doors with lock rods and hinges, bumper with plate and tail lights (at the end away from
 * the cab). v 1 container box, v 2 military tarpaulin with bows and straps, otherwise a plain steel box.
 */
function cargoBody(ctx: BuildCtx, s: MapSolid, k: number): void {
  const v = s.v ?? 0, y0 = s.y ?? 1, y1 = y0 + s.h, alongX = s.w >= s.d, L = alongX ? s.w : s.d, W = alongX ? s.d : s.w
  const cab = ctx.data.solids?.find(q => q.style === "truckcab" && Math.hypot(q.x - s.x, q.z - s.z) < L / 2 + 2.5)
  const back = cab ? (alongX ? Math.sign(s.x - cab.x) : Math.sign(s.z - cab.z)) || 1 : 1
  const f = frameOf(s.x, s.z, alongX ? back : 0, alongX ? 0 : back), hl = L / 2, hw = W / 2
  const metal = ctx.B("metal"), lamp = ctx.B("lamp"), c = tint(s.tint, 1, k), dark = tint(0x1c1d1e), trim = tint(v === 2 ? 0x3c4030 : 0x6a6e72)
  const x0 = s.x - s.w / 2, x1 = s.x + s.w / 2, z0 = s.z - s.d / 2, z1 = s.z + s.d / 2
  ctx.B(v === 1 ? "container" : v === 2 ? "plaster" : "metal").box(x0, y0, z0, x1, y1, z1, { color: c, ao: 0.05, local: true })
  // frame: corner posts, top and bottom rails, side ribs (steel box) or bows and straps (tarpaulin)
  for (const u of [-hl, hl]) for (const w of [-hw, hw]) f.box(metal, u - 0.05, u + 0.05, y0, y1, w - 0.05, w + 0.05, trim)
  for (const w of [-hw, hw]) { f.box(metal, -hl, hl, y1 - 0.08, y1 + 0.01, w - 0.04, w + 0.04, trim); f.box(metal, -hl, hl, y0, y0 + 0.14, w - 0.04, w + 0.04, trim) }
  if (v === 2) {
    for (let u = -hl + 0.6; u < hl - 0.3; u += 1.2) { f.box(metal, u - 0.03, u + 0.03, y1 - 0.06, y1 + 0.02, -hw - 0.02, hw + 0.02, tint(0x3c4030)); for (const w of [-hw, hw]) f.box(metal, u - 0.025, u + 0.025, y0 + 0.14, y1 - 0.06, w - 0.012, w + 0.012, tint(0x2a2c22)) }
  } else if (v === 0) {
    for (let u = -hl + 0.6; u < hl - 0.3; u += 0.6) for (const w of [-hw, hw]) f.box(metal, u - 0.02, u + 0.02, y0 + 0.14, y1 - 0.08, w - 0.015, w + 0.015, c.clone().multiplyScalar(0.92))
  }
  // chassis rails, tandem axle, side under-run guards
  for (const w of [-0.5, 0.5]) f.box(metal, -hl + 0.3, hl - 0.3, y0 - 0.32, y0, w - 0.05, w + 0.05, dark)
  for (const u of [hl - 1.2, hl - 2.3]) {
    for (const sd of [-1, 1]) { const [wx, wz] = f.at(u, sd * (hw - 0.2)); wheelAtR(ctx, wx, wz, 0.5, 0.36, f.ry) }
    f.box(metal, u - 0.06, u + 0.06, 0.44, 0.56, -hw + 0.3, hw - 0.3, dark)
  }
  for (const sd of [-1, 1]) {
    for (const y of [0.42, 0.72]) f.box(metal, -hl + 0.5, hl - 2.95, y - 0.04, y + 0.04, sd * (hw - 0.08) - 0.03, sd * (hw - 0.08) + 0.03, trim)
    for (const u of [-hl + 0.6, hl - 3.0]) f.box(metal, u - 0.03, u + 0.03, 0.38, y0, sd * (hw - 0.1) - 0.03, sd * (hw - 0.1) + 0.03, dark)
    // mudguard over the tandem
    f.box(metal, hl - 2.95, hl - 0.55, y0 - 0.06, y0 - 0.02, sd * (hw - 0.2) - 0.22, sd * (hw - 0.2) + 0.22, dark)
  }
  // rear: doors with seams, lock rods and hinges, bumper, plate, tail lights
  const ur = hl + 0.012
  if (v !== 2) {
    f.box(metal, hl, ur, y0 + 0.08, y1 - 0.08, -0.012, 0.012, dark)
    for (const w of [-0.75, -0.3, 0.3, 0.75]) {
      f.box(metal, ur, ur + 0.035, y0 + 0.12, y1 - 0.12, w - 0.02, w + 0.02, tint(0x9a9a96))
      f.box(metal, ur, ur + 0.05, y0 + 1.05, y0 + 1.13, w - 0.02, w + 0.12, dark)
    }
    for (const w of [-hw + 0.06, hw - 0.06]) for (const y of [y0 + 0.4, (y0 + y1) / 2, y1 - 0.4]) f.box(metal, ur, ur + 0.04, y - 0.08, y + 0.08, w - 0.05, w + 0.05, dark)
  } else {
    f.box(ctx.B("plaster"), hl - 0.02, hl + 0.01, y1 - 0.9, y1 - 0.05, -hw + 0.1, hw - 0.1, c.clone().multiplyScalar(0.9))
  }
  f.box(metal, hl - 0.1, hl + 0.08, 0.42, 0.58, -hw + 0.25, hw - 0.25, trim)
  for (const w of [-hw + 0.45, hw - 0.45]) f.box(metal, hl - 0.12, hl - 0.04, 0.5, y0, w - 0.04, w + 0.04, dark)
  f.box(metal, hl + 0.08, hl + 0.09, 0.62, 0.74, -0.26, 0.26, tint(0xe8e4d8))
  for (const sd of [-1, 1]) f.box(lamp, hl - 0.04, hl + 0.03, y0 - 0.22, y0 - 0.08, sd * (hw - 0.25) - 0.14, sd * (hw - 0.25) + 0.14, tint(0xb01810, 1, 0.7))
  if (v === 0 && ctx.rng() < 0.6) {
    const [lx, lz] = f.at(0, back > 0 === alongX ? hw + 0.02 : -(hw + 0.02))
    decal(ctx, `logo${Math.floor(ctx.rng() * 4)}`, alongX ? s.x : lx, y0 + 0.6, alongX ? (back > 0 ? z1 + 0.02 : z0 - 0.02) : s.z, Math.min(4.5, L * 0.6), 1.8, alongX ? (back > 0 ? "s" : "n") : (back > 0 ? "e" : "w"), 0x30353c)
    void lz
  }
}

/** Wheel (tyre and rim) with its axle across the frame's v axis (frame yaw ry). */
function wheelAtR(ctx: BuildCtx, x: number, z: number, r: number, w: number, ry: number): void {
  const t = tpl()
  place(ctx.B("rubber"), t.wheel, x, r, z, 0, ry + Math.PI / 2, 0, w, r, r, 0x2a2a2c)
  place(ctx.B("metal"), t.wheel, x, r, z, 0, ry + Math.PI / 2, 0, w + 0.02, r * 0.5, r * 0.5, 0x6a6e72)
}

/** Forklift on the footprint's long axis, forks towards -x / -z. */
function forklift(ctx: BuildCtx, s: MapSolid, k: number): void {
  const alongX = s.w >= s.d, L = Math.min(alongX ? s.w : s.d, 2.6), f = alongX ? frameOf(s.x, s.z, -1, 0) : frameOf(s.x, s.z, 0, -1)
  addVehicle(ctx, forkliftGeometry(L), placeAt(s.x, 0, s.z, f.ry), {
    paint: ["metal", tint(s.tint, 1, k)], trim: ["metal", tint(0x26282a)], chrome: ["metal", tint(0x8a8a84)], rubber: ["rubber", tint(0x1c1d1e)],
    lampF: ["lamp", tint(0xfff2d0, 1, 0.7)], lampR: ["lamp", tint(0xffa020, 1, 0.8)],
  })
}

/** Motor-pump skid filling the footprint: base frame, finned motor with fan cowl, coupling guard, pump, pipes, panel. */
function machinery(ctx: BuildCtx, s: MapSolid, k: number): void {
  const alongX = s.w >= s.d, f = frameOf(s.x, s.z, alongX ? 1 : 0, alongX ? 0 : 1), L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, h = s.h
  const metal = ctx.B("metal"), c = tint(s.tint, 1, k), dark = tint(0x2a2c2e), t = tpl(), hl = L / 2, hw = W / 2
  f.box(metal, -hl, hl, 0, 0.16, -hw, hw, dark)
  for (const w of [-hw + 0.08, hw - 0.08]) f.box(metal, -hl, hl, 0.16, 0.2, w - 0.06, w + 0.06, dark)
  // motor along u with cooling fins, fan cowl and terminal box
  const r = Math.min(hw * 0.7, h * 0.32), my = 0.2 + r + 0.04, m0 = -hl + 0.15, m1 = -hl + L * 0.45
  const cyl = (u0: number, u1: number, y: number, rad: number, col: THREE.Color | number, geo = t.cyl12) => { const [x, z] = f.at((u0 + u1) / 2, 0); place(metal, geo, x, y, z, 0, f.ry, Math.PI / 2, rad, u1 - u0, rad, col) }
  cyl(m0 + 0.12, m1, my, r, c)
  for (let u = m0 + 0.25; u < m1 - 0.05; u += 0.12) cyl(u, u + 0.03, my, r + 0.025, c.clone().multiplyScalar(0.9))
  cyl(m0, m0 + 0.14, my, r * 1.05, dark, t.cyl16)
  f.box(metal, (m0 + m1) / 2 - 0.15, (m0 + m1) / 2 + 0.15, my + r - 0.02, my + r + 0.2, -0.14, 0.14, c.clone().multiplyScalar(0.85))
  for (const w of [-r * 0.7, r * 0.7]) f.box(metal, m0 + 0.2, m1 - 0.1, 0.2, my - r * 0.5, w - 0.05, w + 0.05, dark)
  // coupling guard (yellow) and the pump: volute housing with flanged suction and discharge
  const p0 = m1 + 0.05, p1 = Math.min(hl - 0.15, p0 + L * 0.35)
  f.box(metal, m1, p0 + 0.25, my - r * 0.45, my + r * 0.45, -r * 0.45, r * 0.45, tint(0xd8b030))
  const pr = Math.min(r * 1.1, h * 0.35), pc = (p0 + 0.25 + p1) / 2
  { const [x, z] = f.at(pc, 0); place(metal, t.cyl16, x, 0.2 + pr + 0.05, z, 0, f.ry, Math.PI / 2, pr, Math.max(0.2, (p1 - p0) * 0.5), pr, c.clone().multiplyScalar(0.8)) }
  const top = 0.2 + 2 * pr + 0.05
  { const [x, z] = f.at(pc, 0); place(metal, t.cyl12, x, (top + h) / 2, z, 0, 0, 0, 0.09, h - top, 0.09, 0x8a8e92); place(metal, t.cyl12, x, top + 0.05, z, 0, 0, 0, 0.16, 0.05, 0.16, 0x6a6e72) }
  { const [x, z] = f.at(p1, 0); place(metal, t.cyl12, x + (alongX ? 0.15 : 0), 0.2 + pr + 0.05, z + (alongX ? 0 : 0.15), 0, f.ry, Math.PI / 2, 0.1, 0.3, 0.1, 0x8a8e92) }
  // control box on a post with a red stop button
  const [bx, bz] = f.at(hl - 0.15, hw - 0.12)
  place(metal, t.box, bx, Math.min(h, 1.5) - 0.25, bz, 0, f.ry, 0, 0.12, 0.4, 0.3, 0x5a6066)
  place(metal, t.box, bx, (Math.min(h, 1.5) - 0.45) / 2 + 0.16, bz, 0, f.ry, 0, 0.05, Math.min(h, 1.5) - 0.45, 0.05, 0x3a3e40)
  ctx.B("lamp").box(bx - 0.03, Math.min(h, 1.5) - 0.2, bz - 0.03, bx + 0.03, Math.min(h, 1.5) - 0.14, bz + 0.03, { color: tint(0xff2010, 1, 0.8), ao: 0 })
  decal(ctx, "danger", alongX ? s.x : s.x + s.w / 2 + 0.02, 0.45, alongX ? s.z + s.d / 2 + 0.02 : s.z, 0.3, 0.3, alongX ? "s" : "e")
}

/** Jaw crusher on a braced steel stand: platform with railings, crusher with flywheels, motor and belt guard, feed hopper, chute, ladder. */
function crusher(ctx: BuildCtx, s: MapSolid, k: number): void {
  const alongX = s.w >= s.d, f = frameOf(s.x, s.z, alongX ? 1 : 0, alongX ? 0 : 1), L = alongX ? s.w : s.d, W = alongX ? s.d : s.w, h = s.h
  const metal = ctx.B("metal"), c = tint(s.tint, 1, k), steel = tint(0x4a4e52), dark = tint(0x26282a), rail = tint(0xd8b030), t = tpl(), hl = L / 2, hw = W / 2
  const deck = h * 0.45, P = (u: number, y: number, w: number): [number, number, number] => { const [x, z] = f.at(u, w); return [x, y, z] }
  // stand: legs, deck beams, X bracing on the long sides
  const us = [-hl + 0.3, 0, hl - 0.3], ws = [-hw + 0.3, hw - 0.3]
  for (const u of us) for (const w of ws) f.box(metal, u - 0.2, u + 0.2, 0, deck, w - 0.2, w + 0.2, steel)
  f.box(metal, -hl, hl, deck - 0.4, deck, -hw, hw, steel)
  f.box(ctx.B("concrete"), -hl, hl, deck, deck + 0.05, -hw, hw, tint(0x6a6a66))
  for (const w of ws) for (let i = 0; i < us.length - 1; i++) {
    const a = P(us[i], 0.3, w), b = P(us[i + 1], deck - 0.4, w), a2 = P(us[i], deck - 0.4, w), b2 = P(us[i + 1], 0.3, w)
    strut(metal, a[0], a[1], a[2], b[0], b[1], b[2], 0.08, steel); strut(metal, a2[0], a2[1], a2[2], b2[0], b2[1], b2[2], 0.08, steel)
  }
  // crusher body with ribs, two flywheels with spokes, motor and belt guard
  const cb0 = -L * 0.2, cb1 = L * 0.15, cw = W * 0.24, ct = deck + h * 0.32
  f.box(metal, cb0, cb1, deck, ct, -cw, cw, c)
  for (let u = cb0 + 0.4; u < cb1; u += 0.8) f.box(metal, u - 0.08, u + 0.08, deck, ct, -cw - 0.06, cw + 0.06, c.clone().multiplyScalar(0.85))
  const fr = h * 0.17, fu = cb0 + (cb1 - cb0) * 0.35, fy = deck + h * 0.22
  for (const sd of [-1, 1]) {
    const [x, y, z] = P(fu, fy, sd * (cw + 0.25))
    place(metal, t.cyl24, x, y, z, Math.PI / 2, f.ry, 0, fr, 0.22, fr, 0x3a3c3e)
    place(metal, t.cyl12, x, y, z, Math.PI / 2, f.ry, 0, fr * 0.2, 0.5, fr * 0.2, 0x8a8e92)
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI, [ax, ay, az] = P(fu + Math.cos(a) * fr * 0.9, fy + Math.sin(a) * fr * 0.9, sd * (cw + 0.25)), [bx, by, bz] = P(fu - Math.cos(a) * fr * 0.9, fy - Math.sin(a) * fr * 0.9, sd * (cw + 0.25)); strut(metal, ax, ay, az, bx, by, bz, 0.05, 0x2e3032) }
  }
  f.box(metal, fu - 0.3, fu + 0.3, deck, deck + 0.9, cw + 0.6, cw + 1.6, tint(0x3f6c48))
  f.box(metal, fu - fr * 0.4, fu + fr * 0.4, deck + 0.6, fy + fr * 0.4, cw + 0.4, cw + 0.55, rail)
  // feed hopper: inverted pyramid from the crusher mouth up to the top
  {
    // open funnel: four sloped plates from the crusher mouth to a wide rim, painted outside, worn dark inside
    const e = Math.min(1.4, hw * 0.4), yt = h + 0.2, out = c.clone().multiplyScalar(0.9), ins = tint(0x4a4236)
    const lo = [P(cb0, ct, -cw), P(cb1, ct, -cw), P(cb1, ct, cw), P(cb0, ct, cw)], hi = [P(cb0 - e, yt, -cw - e), P(cb1 + e, yt, -cw - e), P(cb1 + e, yt, cw + e), P(cb0 - e, yt, cw + e)]
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      quadN(metal, lo[j], lo[i], hi[i], hi[j], out)
      quadN(metal, lo[i], lo[j], hi[j], hi[i], ins)
    }
    for (let i = 0; i < 4; i++) { const a = hi[i], b = hi[(i + 1) % 4]; strut(metal, a[0], a[1], a[2], b[0], b[1], b[2], 0.06, steel) }
  }
  // discharge chute under the deck sloping out of the long side
  { const [x, z] = f.at(-hl * 0.4, 0); place(metal, t.box, x, deck * 0.55, z, 0, f.ry, -0.5, 2.2, 0.12, 1.2, dark) }
  // railings round the deck edge and a ladder at one corner
  for (const [a, b] of [[[-hl, -hw], [hl, -hw]], [[hl, -hw], [hl, hw]], [[hl, hw], [-hl, hw]], [[-hl, hw], [-hl, -hw]]] as [number[], number[]][]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 1.6))
    for (let i = 0; i < n; i++) { const q = i / n, [x, , z] = P(a[0] + (b[0] - a[0]) * q, 0, a[1] + (b[1] - a[1]) * q); strut(metal, x, deck + 0.05, z, x, deck + 1.1, z, 0.025, rail) }
    for (const y of [0.6, 1.1]) { const A = P(a[0], deck + y, a[1]), B = P(b[0], deck + y, b[1]); strut(metal, A[0], A[1], A[2], B[0], B[1], B[2], 0.025, rail) }
  }
  for (const o of [-0.22, 0.22]) { const A = P(hl + 0.35, 0, hw - 1 + o), B = P(hl + 0.35, deck + 1.1, hw - 1 + o); strut(metal, A[0], A[1], A[2], B[0], B[1], B[2], 0.025, rail) }
  for (let y = 0.3; y < deck; y += 0.3) { const A = P(hl + 0.35, y, hw - 1.22), B = P(hl + 0.35, y, hw - 0.78); strut(metal, A[0], A[1], A[2], B[0], B[1], B[2], 0.016, rail) }
  ctx.glow.add(...P(hl - 0.3, h + 0.4, hw - 0.3), 0.5, 0xffa020, 1.5, [3, 0.6, s.x])
}

function wagon(ctx: BuildCtx, s: MapSolid, x0: number, _y0: number, z0: number, x1: number, y1: number, z1: number, alongX: boolean, k: number): void {
  const c = tint(s.tint ?? 0x6a3a2a, 1, k), v = s.v ?? 0, L = alongX ? x1 - x0 : z1 - z0
  const f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, -1), m = placeAt(s.x, 0, s.z, f.ry)
  const frame = tint(0x26282a, 1, 0.85 + ctx.rng() * 0.3), steel = tint(0x5a554e), rust = c.clone().lerp(new THREE.Color(0x6a3a22), 0.35)
  if (v >= 20) {
    addVehicle(ctx, hopperWagonGeometry(L), m, {
      paint: ["container", c], frame: ["metal", frame], trim: ["metal", rust], chrome: ["metal", steel], load: ["gravel", tint(0xb8b0a0, 1, 0.9 + ctx.rng() * 0.15)],
    })
    const [nx, nz] = f.at(-L * 0.3, 1.42)
    decal(ctx, "numbers", nx, 3.0, nz, 1.2, 0.35, alongX ? "s" : "e", 0xe8e4dc)
    return
  }
  addVehicle(ctx, boxcarGeometry(L), m, {
    paint: ["container", c], roof: ["metal", tint(0x8a8680, 1, 0.8 + ctx.rng() * 0.3)], frame: ["metal", frame], trim: ["metal", rust], chrome: ["metal", steel],
  })
  for (const sd of [1, -1]) {
    const face: Side = alongX ? (sd > 0 ? "s" : "n") : (sd > 0 ? "e" : "w")
    const [nx, nz] = f.at(-L * 0.32, sd * 1.475)
    decal(ctx, "numbers", nx, 1.75, nz, 1.3, 0.38, face, 0xe8e4dc)
    if (ctx.rng() < 0.5) { const [gx, gz] = f.at(L * 0.3, sd * 1.475); decal(ctx, `graffiti${Math.floor(ctx.rng() * 3)}`, gx, 1.45, gz, 3.0, 1.2, face) }
  }
  void y1
}

function apc(ctx: BuildCtx, s: MapSolid, alongX: boolean): void {
  const f = alongX ? frameOf(s.x, s.z, 1, 0) : frameOf(s.x, s.z, 0, -1), paint = tint(s.tint ?? 0x4d5536, 1, jit(s)), burnt = (s.tint ?? 0) === 0x2a2622
  addVehicle(ctx, apcGeometry(), placeAt(s.x, 0, s.z, f.ry), {
    paint: ["metal", paint], glass: ["glass", tint(burnt ? 0x1a1816 : 0x2a3a40)], trim: ["metal", tint(burnt ? 0x1c1a18 : 0x2a2c2a)], chrome: ["metal", tint(burnt ? 0x2a2420 : 0x3a3c3a)],
    rubber: ["rubber", tint(burnt ? 0x141210 : 0x1c1d1e)], lampF: burnt ? ["rubber", tint(0x141210)] : ["lamp", tint(0xfff2d0, 1, 0.7)],
  })
  const [nx, nz] = f.at(-1.4, 1.46)
  decal(ctx, "numbers", nx, 1.45, nz, 1.0, 0.4, alongX ? "s" : "e", 0xffffff)
}

/** Strut (cylinder of radius r) between two points, into batch b. */
function strut(b: GeoBatch, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: THREE.Color | number): void {
  const d = V.set(bx - ax, by - ay, bz - az), l = d.length()
  M.compose(S.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q.setFromUnitVectors(UP, d.normalize()), V.set(r, l, r))
  b.add(tpl().cyl8, M, color)
}
const UP = new THREE.Vector3(0, 1, 0)

/** Quad a-b-c-d (counter-clockwise seen from outside) with its normal and metre UVs along a→b and b→c. */
function quadN(b: GeoBatch, a: number[], q: number[], c: number[], d: number[], color: THREE.Color): void {
  const e1 = new THREE.Vector3(q[0] - a[0], q[1] - a[1], q[2] - a[2]), e2 = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])
  const n = e1.clone().cross(e2).normalize(), u = Math.hypot(c[0] - d[0], c[2] - d[2]), v = e2.length(), u0 = (u - e1.length()) / 2
  b.quad(a, q, c, d, [n.x, n.y, n.z], [u0, 0, u0 + e1.length(), 0, u, v, 0, v], color)
}

/**
 * Gravel loading bin over the quarry siding: ribbed bin with ring beams on legs (the pillar solids), funnel down to a
 * slide-gate chute above the wagons, braced legs, railing round the roof deck, control cabin with windows, caged ladder.
 */
function hopperPlant(ctx: BuildCtx, p: MapProp): void {
  const y = p.y ?? 9, w = p.w ?? 10, d = p.d ?? 9, h = p.h ?? 10, metal = ctx.B("metal"), c = tint(0x8a7a50, 1, jit(p)), steel = tint(0x4a4e52), rib = c.clone().multiplyScalar(0.82)
  const x0 = p.x - w / 2, x1 = p.x + w / 2, z0 = p.z - d / 2, z1 = p.z + d / 2, yb = y + h * 0.35, yt = y + h, o = 0.8
  metal.box(x0, yb, z0, x1, yt, z1, { color: c, ao: 0, local: true })
  // funnel down to the outlet
  const ox0 = p.x - o, ox1 = p.x + o, oz0 = p.z - o, oz1 = p.z + o, fc = c.clone().multiplyScalar(0.9)
  quadN(metal, [ox0, y, oz1], [ox1, y, oz1], [x1, yb, z1], [x0, yb, z1], fc)
  quadN(metal, [ox1, y, oz0], [ox0, y, oz0], [x0, yb, z0], [x1, yb, z0], fc)
  quadN(metal, [ox1, y, oz1], [ox1, y, oz0], [x1, yb, z0], [x1, yb, z1], fc)
  quadN(metal, [ox0, y, oz0], [ox0, y, oz1], [x0, yb, z1], [x0, yb, z0], fc)
  // outlet chute with slide gate and hand wheel, ending above the wagon loads
  metal.box(p.x - 0.55, 5.4, p.z - 0.55, p.x + 0.55, y, p.z + 0.55, { color: c.clone().multiplyScalar(0.75), ao: 0 })
  metal.box(p.x - 0.75, 6.6, p.z - 0.7, p.x + 0.75, 6.9, p.z + 0.7, { color: steel, ao: 0 })
  place(metal, tpl().torus, p.x + 0.95, 6.75, p.z, 0, 0, Math.PI / 2, 0.25, 0.06, 0.25, 0x2a2c2e)
  strut(metal, p.x + 0.55, 6.75, p.z, p.x + 0.95, 6.75, p.z, 0.025, 0x2a2c2e)
  // vertical stiffeners and ring beams on the bin
  for (const [a0, a1, fixed, alongX] of [[x0, x1, z1 + 0.03, true], [x0, x1, z0 - 0.03, true], [z0, z1, x1 + 0.03, false], [z0, z1, x0 - 0.03, false]] as const) {
    for (let a = a0 + 0.6; a < a1 - 0.3; a += 1.25) {
      if (alongX) metal.box(a - 0.06, yb, fixed - 0.03, a + 0.06, yt, fixed + 0.03, { color: rib, ao: 0 })
      else metal.box(fixed - 0.03, yb, a - 0.06, fixed + 0.03, yt, a + 0.06, { color: rib, ao: 0 })
    }
  }
  for (const ry of [yb, yb + (yt - yb) * 0.5]) metal.box(x0 - 0.1, ry, z0 - 0.1, x1 + 0.1, ry + 0.28, z1 + 0.1, { color: steel, ao: 0 })
  // legs: X bracing between the pillars on the planes either side of the track, knee braces under the bin
  const px = [p.x - 4, p.x + 4], pz = [p.z - 3.5, p.z + 3.5]
  for (const z of pz) {
    strut(metal, px[0], 3.6, z, px[1], y - 0.4, z, 0.07, steel); strut(metal, px[1], 3.6, z, px[0], y - 0.4, z, 0.07, steel)
    metal.box(px[0], y - 0.55, z - 0.12, px[1], y - 0.25, z + 0.12, { color: steel, ao: 0 })
    metal.box(px[0], 3.45, z - 0.1, px[1], 3.7, z + 0.1, { color: steel, ao: 0 })
  }
  for (const x of px) for (const z of pz) strut(metal, x, y - 1.6, z, x + Math.sign(p.x - x) * 1.6, yb, z, 0.08, steel)
  // roof deck: grating overhang with handrails
  metal.box(x0 - 0.4, yt, z0 - 0.4, x1 + 0.4, yt + 0.2, z1 + 0.4, { color: steel, ao: 0 })
  const rx0 = x0 - 0.33, rx1 = x1 + 0.33, rz0 = z0 - 0.33, rz1 = z1 + 0.33, rail = tint(0xd8b030)
  for (const [ax, az, bx, bz] of [[rx0, rz0, rx1, rz0], [rx1, rz0, rx1, rz1], [rx1, rz1, rx0, rz1], [rx0, rz1, rx0, rz0]]) {
    const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(l / 1.6))
    for (let i = 0; i < n; i++) { const f = i / n; strut(metal, ax + (bx - ax) * f, yt + 0.2, az + (bz - az) * f, ax + (bx - ax) * f, yt + 1.25, az + (bz - az) * f, 0.025, rail) }
    for (const hh of [0.7, 1.22]) strut(metal, ax, yt + 0.2 + hh, az, bx, yt + 0.2 + hh, bz, 0.025, rail)
  }
  // control cabin: clad box, window band, door, overhanging roof
  const cb = ctx.B("cladding"), cy0 = yt + 0.2, cy1 = yt + 3
  cb.box(p.x - 2.5, cy0, p.z - 2, p.x + 2.5, cy1, p.z + 2, { color: tint(0x9a9a92), ao: 0 })
  const glass = ctx.B("glass"), gc = tint(0x2c353d)
  glass.box(p.x - 2.2, cy0 + 1.2, p.z + 2, p.x + 2.2, cy0 + 2.1, p.z + 2.03, { color: gc, ao: 0 })
  glass.box(p.x - 2.2, cy0 + 1.2, p.z - 2.03, p.x - 0.2, cy0 + 2.1, p.z - 2, { color: gc, ao: 0 })
  for (const sx of [-1, 1]) glass.box(sx > 0 ? p.x + 2.5 : p.x - 2.53, cy0 + 1.2, p.z - 1.6, sx > 0 ? p.x + 2.53 : p.x - 2.5, cy0 + 2.1, p.z + 1.6, { color: gc, ao: 0 })
  metal.box(p.x + 0.4, cy0, p.z - 2.04, p.x + 1.35, cy0 + 2.05, p.z - 2.0, { color: tint(0x5a6066), ao: 0 })
  metal.box(p.x - 2.75, cy1, p.z - 2.25, p.x + 2.75, cy1 + 0.18, p.z + 2.25, { color: tint(0x5a5c5e), ao: 0 })
  // caged ladder from the ground to the deck, off the south-east leg
  const lx = px[1], lz = z1 + 0.45
  for (const s of [-0.22, 0.22]) strut(metal, lx + s, 0, lz, lx + s, yt + 1.2, lz, 0.025, rail)
  for (let ly = 0.3; ly < yt + 0.2; ly += 0.3) strut(metal, lx - 0.22, ly, lz, lx + 0.22, ly, lz, 0.016, rail)
  for (let ly = 2.4; ly < yt + 1.2; ly += 0.9) for (let i = 0; i < 6; i++) {
    const a0 = i / 6 * Math.PI, a1 = (i + 1) / 6 * Math.PI, r = 0.4
    strut(metal, lx + Math.cos(a0) * r, ly, lz + Math.sin(a0) * r, lx + Math.cos(a1) * r, ly, lz + Math.sin(a1) * r, 0.018, rail)
  }
  for (const a of [0.5, 1.57, 2.64]) strut(metal, lx + Math.cos(a) * 0.4, 2.4, lz + Math.sin(a) * 0.4, lx + Math.cos(a) * 0.4, yt + 1.2, lz + Math.sin(a) * 0.4, 0.015, rail)
  for (let ly = 3; ly < yb; ly += 3) strut(metal, lx, ly, lz - 0.05, lx, ly, pz[1] + 0.3, 0.035, steel)
  decal(ctx, textKey(ctx, 0, "KIESWERK"), p.x, y + h * 0.6, z1 + 0.07, w * 0.7, 1.2, "s", 0x2a2a2a)
  ctx.glow.add(p.x, cy1 + 0.4, p.z, 0.6, 0xff2a18, 2, [3, 0.5, 1])
}

function rock(ctx: BuildCtx, s: MapSolid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const b = ctx.B("rock"), v = s.v ?? 0, base = tint(s.tint ?? 0xb8b0a2, 1, jit(s, 0.12)), t = tpl(), rng = ctx.rng
  const col = (k: number) => base.clone().multiplyScalar(k)
  if (s.h < 5) {
    // boulder / rock bench: a lumpy mass filling the box plus a smaller stone on top
    place(b, t.chunk, s.x, y0 + s.h * 0.42, s.z, rng() * 0.3, rng() * 6.28, rng() * 0.3, s.w * 0.56, s.h * 0.62, s.d * 0.56, col(0.95 + rng() * 0.1), [s.w * 2, s.h * 2])
    if (s.w > 1.6 && s.d > 1.2) place(b, s.w < 3.5 ? t.chunkLo : t.chunk, s.x + (rng() - 0.5) * s.w * 0.3, y0 + s.h * 0.75, s.z + (rng() - 0.5) * s.d * 0.3, rng(), rng() * 6.28, 0, s.w * 0.3, s.h * 0.35, s.d * 0.3, col(1.05), [s.w, s.h])
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
      place(b, r < 1.3 ? t.chunkLo : t.chunk, fz ? a : off, y0 + yy, fz ? off : a, rng() * 3, rng() * 6.28, rng() * 3, r * (1 + rng() * 0.6), r * (0.7 + rng() * 0.5), r, col(0.82 + rng() * 0.3), [r * 3, r * 3])
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
    place(b, r < 1.1 ? t.chunkLo : t.chunk, cx, yy, cz, rng() * 3, rng() * 6.28, rng() * 3, r * 1.3, r, r, col(0.85 + rng() * 0.25), [r * 3, r * 3])
    if (rng() < 0.35) { const rr = 0.25 + rng() * 0.35; place(b, t.chunkLo, alongX ? u + (rng() - 0.5) : face + side * 0.25, rr * 0.6, alongX ? face + side * 0.25 : u + (rng() - 0.5), rng() * 3, rng() * 6, 0, rr, rr * 0.8, rr, col(0.9), [1, 1]) }
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
      // corbelled brick band, capping slab and two clay pots (one sooted)
      ctx.B("brick").box(p.x - 0.4, y + h - 0.32, p.z - 0.4, p.x + 0.4, y + h - 0.2, p.z + 0.4, { color: c.clone().multiplyScalar(0.92), ao: 0 })
      ctx.B("concrete").box(p.x - 0.42, y + h, p.z - 0.42, p.x + 0.42, y + h + 0.1, p.z + 0.42, { color: tint(0x8a8680), ao: 0 })
      for (const [o, pc] of [[-0.16, 0xa8603e], [0.16, 0x4a3a32]] as const) {
        place(ctx.B("brick"), t.taper, p.x + o, y + h + 0.1, p.z, 0, 0, 0, 0.11, 0.38, 0.11, tint(pc), [0.7, 0.4])
        place(ctx.B("concrete"), t.cyl8, p.x + o, y + h + 0.5, p.z, 0, 0, 0, 0.085, 0.05, 0.085, tint(pc, 0.8))
      }
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
      const w = p.w ?? 12, c = tint(p.tint ?? 0x2a2c30, 1, jit(p)), light = c.r + c.g + c.b > 1.5
      addVehicle(ctx, tankWagonGeometry(w), placeAt(p.x, 0, p.z, 0), {
        paint: ["metal", c], trim: ["metal", light ? tint(0x3a3c40) : tint(0x8a8680)], frame: ["metal", tint(0x26282a, 1, 0.85 + ctx.rng() * 0.3)], chrome: ["metal", tint(0x8a8a84)],
      })
      decal(ctx, "hazard", p.x - w * 0.28, 2.3, p.z + 1.312, 1.6, 0.3, "s")
      decal(ctx, "numbers", p.x + w * 0.28, 2.3, p.z + 1.312, 1.2, 0.3, "s", light ? 0x2a2a2a : 0xe8e4dc)
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
    case "hopper": return hopperPlant(ctx, p)
    case "conveyor": {
      const x2 = p.x2 ?? p.x, z2 = p.z2 ?? p.z, y0 = p.y ?? 1, y1 = p.h ?? 12
      const dx = x2 - p.x, dz = z2 - p.z, dy = y1 - y0, len = Math.hypot(dx, dy, dz)
      const dir = V.set(dx, dy, dz).normalize(), yaw = Math.atan2(dx, dz), pitch = -Math.asin(dir.y)
      M.compose(S.set((p.x + x2) / 2, (y0 + y1) / 2, (p.z + z2) / 2), Q.setFromEuler(E.set(pitch, yaw, 0, "YXZ")), V.set(1, 1, 1))
      const steel = tint(0x4a4c4e), yellow = tint(0xc8a032, 1, 0.85 + ctx.rng() * 0.2)
      addVehicle(ctx, conveyorGeometry(len), M, { paint: ["metal", yellow], frame: ["metal", steel], rubber: ["rubber", tint(0x1e1e1e)], chrome: ["metal", tint(0x8a8a84)], load: ["gravel", tint(0xb8b0a0)] })
      const n = Math.max(1, Math.floor(Math.hypot(dx, dz) / 12))
      for (let i = 1; i <= n; i++) {
        const f = i / (n + 1), sy = y0 + dy * f - 0.55
        addVehicle(ctx, trestleGeometry(Math.round(sy * 10) / 10), placeAt(p.x + dx * f, 0, p.z + dz * f, yaw), { paint: ["metal", yellow], frame: ["metal", steel] })
      }
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
      for (let i = 0; i < 3; i++) place(ctx.B("rubber"), t.tyre, p.x + (rng() - 0.5) * w * 0.6, h * 0.55 + 0.12 + i * 0.05, p.z + (rng() - 0.5) * d * 0.6, (rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6, 0.38, 0.25, 0.38, 0x8a8a8c)
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
      // guyed lattice mast: concrete foot, three legs with zigzag bracing, guy wires to anchor blocks, dipoles, dish and whip
      const h = p.h ?? 9, r = 0.22, grey = 0x8a8e92
      ctx.B("concrete").box(p.x - 0.5, 0, p.z - 0.5, p.x + 0.5, 0.25, p.z + 0.5, { color: tint(0x9a968c) })
      const legs = [0, 1, 2].map(i => [p.x + Math.cos(i * 2.094) * r, p.z + Math.sin(i * 2.094) * r])
      for (const [lx, lz] of legs) place(metal, t.cyl8, lx, 0.25 + (h - 0.25) / 2, lz, 0, 0, 0, 0.025, h - 0.25, 0.025, grey, [1, h])
      for (let y = 0.6; y < h - 0.5; y += 0.6) for (let i = 0; i < 3; i++) {
        const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 3], up = (Math.round(y / 0.6) % 2) * 0.6
        strut(metal, ax, y, az, bx, y + up, bz, 0.014, 0x6a6e72)
      }
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + 1.05, ax = p.x + Math.cos(a) * h * 0.45, az = p.z + Math.sin(a) * h * 0.45
        ctx.lines.push(p.x, h * 0.85, p.z, ax, 0.3, az, p.x, h * 0.5, p.z, ax, 0.3, az)
        metal.box(ax - 0.25, 0, az - 0.25, ax + 0.25, 0.3, az + 0.25, { color: tint(0x9a968c), ao: 0 })
      }
      for (const [y, ry] of [[h * 0.62, 0.5], [h * 0.8, 1.3]]) place(metal, t.box, p.x, y, p.z, 0, ry, 0, 1.4, 0.035, 0.035, grey)
      place(metal, t.disc, p.x + 0.42, h * 0.72, p.z, 0.35, Math.PI / 2, 0, 0.32, 0.32, 1, 0xd8d8d0)
      place(metal, t.cyl8, p.x, h + 0.9, p.z, 0, 0, 0, 0.015, 1.8, 0.015, 0xc8ccd0)
      ctx.glow.add(p.x, h + 1.85, p.z, 0.3, 0xff2a18, 1.8, [3, 0.6, p.x])
      return
    }
    case "gunrack": {
      const w = p.w ?? 2, rot = p.rot ?? 0
      for (let i = 0; i < 6; i++) { const o = -w / 2 + 0.2 + i * (w - 0.4) / 5; place(metal, t.box, p.x + Math.cos(rot) * o, 1.0, p.z - Math.sin(rot) * o, 0.08, rot, 0, 0.06, 1.1, 0.12, 0x1e2022) }
      return
    }
    case "bodybag": {
      const n = p.v ?? 1, rot = p.rot ?? 0
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 0.75, x = p.x + Math.cos(rot) * o, z = p.z - Math.sin(rot) * o
        // glossy vinyl (olive or black): the sheen shows the body underneath
        const c = tint(ctx.rng() < 0.5 ? 0x3b4432 : 0x2b2e31, 1, 0.9 + ctx.rng() * 0.2), bb = bodyBagGeometry()
        addVehicle(ctx, bb, placeAt(x, 0, z, rot + Math.PI / 2 + (ctx.rng() - 0.5) * 0.15), { paint: ["carpaint", c], trim: ["metal", tint(0x1a1b1c)] })
        if (ctx.rng() < 0.3) decal(ctx, "blood", x, 0.005, z, 1.4, 1.2, "up", 0xffffff, ctx.rng() * 6)
      }
      return
    }
    case "trash": {
      const n = p.v ?? 4
      for (let i = 0; i < n; i++) {
        const x = p.x + (ctx.rng() - 0.5) * 1.6, z = p.z + (ctx.rng() - 0.5) * 1.6, s = 0.95 + ctx.rng() * 0.45
        const m = placeAt(x, 0, z, ctx.rng() * 6).multiply(new THREE.Matrix4().makeScale(s, s * (0.85 + ctx.rng() * 0.3), s))
        addVehicle(ctx, trashBagGeometry(Math.floor(ctx.rng() * 3)), m, { paint: ["carpaint", tint(ctx.rng() < 0.7 ? 0x2c2f33 : 0x46663f, 1, 0.85 + ctx.rng() * 0.3)] })
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
    case "berm": {
      // earth mound over a rock/bunker box: grass top and sloped ends (visual)
      const w = p.w ?? 8, d = p.d ?? 30, h = p.h ?? 6, x0 = p.x - w / 2, x1 = p.x + w / 2, z0 = p.z - d / 2, z1 = p.z + d / 2, sl = 3.5
      const g = ctx.B("g:grass"), c = tint(0x9aa078, 1, 0.9)
      g.quad([x0, h + 0.05, z1], [x1, h + 0.05, z1], [x1, h + 0.05, z0], [x0, h + 0.05, z0], [0, 1, 0], [x0, -z1, x1, -z1, x1, -z0, x0, -z0], c)
      g.quad([x0, h + 0.05, z0], [x1, h + 0.05, z0], [x1, 0, z0 - sl], [x0, 0, z0 - sl], [0, 0.6, -0.8], [x0, 0, x1, 0, x1, 6, x0, 6], c)
      g.quad([x1, h + 0.05, z1], [x0, h + 0.05, z1], [x0, 0, z1 + sl], [x1, 0, z1 + sl], [0, 0.6, 0.8], [x1, 0, x0, 0, x0, 6, x1, 6], c)
      for (let i = 0; i < 18; i++) ctx.weeds.push([x0 + ctx.rng() * w, z0 + ctx.rng() * d, 1.2])
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
  // local frame: u along the ridge, v across; the canvas sags a little between the poles
  const f = frameOf(x, z, alongX ? 1 : 0, alongX ? 0 : 1), L = alongX ? w : d, D = alongX ? d : w, hl = L / 2, hd = D / 2
  const P = (u: number, y: number, q: number): number[] => { const [px, pz] = f.at(u, q); return [px, y, pz] }
  b.box(x0, 0, z0, x1, wall, z1, { color: c, skip: PY, local: true, ao: 0.15 })
  const n = Math.max(2, Math.round(L / 1.6)), sag = 0.07
  for (let i = 0; i < n; i++) {
    const ua = -hl + i * L / n, ub = ua + L / n, um = (ua + ub) / 2
    for (const sd of [-1, 1]) {
      const ea = P(ua, wall, sd * hd), eb = P(ub, wall, sd * hd), ra = P(ua, h, 0), rb = P(ub, h, 0), cm = P(um, (wall + h) / 2 - sag, sd * hd / 2)
      const shade = c.clone().multiplyScalar(0.94 + ((i + (sd > 0 ? 1 : 0)) % 2) * 0.06)
      const quad = sd < 0 ? [eb, ea, ra, rb] : [ea, eb, rb, ra]
      for (let k = 0; k < 4; k++) quadN(b, quad[k], quad[(k + 1) % 4], cm, cm, shade)
    }
  }
  quadN(b, P(-hl, wall, -hd), P(-hl, wall, hd), P(-hl, h, 0), P(-hl, h, 0), v === 1 ? dark : c)
  quadN(b, P(hl, wall, hd), P(hl, wall, -hd), P(hl, h, 0), P(hl, h, 0), c)
  // door on the -u end with the flap rolled up above it, ridge pole, guy ropes and pegs along both sides
  const door = tint(0x1a1a16), dy = Math.min(h * 0.78, 1.9)
  quadN(b, P(-hl - 0.012, 0, -0.45), P(-hl - 0.012, 0, 0.45), P(-hl - 0.012, dy, 0.3), P(-hl - 0.012, dy, -0.3), door)
  const metal = ctx.B("metal"), [fa, fb] = [P(-hl, dy + 0.06, -0.42), P(-hl, dy + 0.06, 0.42)]
  strut(b, fa[0] - (alongX ? 0.06 : 0), fa[1], fa[2] - (alongX ? 0 : 0.06), fb[0] - (alongX ? 0.06 : 0), fb[1], fb[2] - (alongX ? 0 : 0.06), 0.07, c.clone().multiplyScalar(0.85))
  const [ra, rb] = [P(-hl - 0.18, h, 0), P(hl + 0.18, h, 0)]
  strut(metal, ra[0], ra[1], ra[2], rb[0], rb[1], rb[2], 0.03, 0x3a3a34)
  for (const e of [-1, 1]) { const g0 = P(e * (hl + 0.15), h, 0), g1 = P(e * (hl + 1.3), 0, 0); ctx.lines.push(g0[0], g0[1], g0[2], g1[0], g1[1], g1[2]) }
  for (let i = 0; i <= n; i++) {
    const u = -hl + i * L / n
    for (const sd of [-1, 1]) {
      const e0 = P(u, wall, sd * hd), e1 = P(u, 0.05, sd * (hd + 0.9))
      ctx.lines.push(e0[0], e0[1], e0[2], e1[0], e1[1], e1[2])
      place(metal, tpl().box, e1[0], 0.06, e1[2], 0, f.ry, 0.3 * sd, 0.03, 0.18, 0.03, 0x5a5a52)
    }
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
