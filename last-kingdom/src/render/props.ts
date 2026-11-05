// Procedural props: buildings, ruins, trees, graves, furniture. Each returns a group plus local colliders.
// Local space: +Z is the front (door side). Pivot on the ground at the centre.

import * as THREE from "three"
import { Rng } from "../core/rng"
import type { Collider } from "../world/collision"
import { M, mat } from "./materials"

export interface Prop {
  group: THREE.Group
  colliders: Collider[]
  /** Points of interest inside (loot spots, spawn points) in local space. */
  spots?: { x: number; z: number; kind: "loot" | "spawn" | "interior" }[]
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z)
}

function boxCol(x: number, z: number, hw: number, hd: number, y0: number, y1: number, yaw = 0, tag?: string): Collider {
  return { kind: "box", x, z, hw, hd, yaw, y0, y1, tag }
}

function circleCol(x: number, z: number, r: number, y0: number, y1: number, tag?: string): Collider {
  return { kind: "circle", x, z, r, y0, y1, tag }
}

/** Gable roof: two sloped slabs plus triangular gable ends. */
function roof(w: number, d: number, baseY: number, height: number, material: THREE.Material, gableMat: THREE.Material, overhang = 0.4): THREE.Group {
  const g = new THREE.Group()
  const slope = Math.atan2(height, w / 2)
  const slabLen = Math.sqrt((w / 2) * (w / 2) + height * height) + overhang
  const thick = 0.12
  for (const s of [-1, 1]) {
    const slab = box(slabLen, thick, d + overhang * 2, material)
    slab.position.set((s * w) / 4, baseY + height / 2, 0)
    slab.rotation.z = -s * slope
    slab.position.x = (s * (w / 4 + overhang * 0.25))
    g.add(slab)
  }
  // Gables
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(0, height)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false })
  for (const s of [-1, 1]) {
    const gable = mesh(geo, gableMat, 0, baseY, (s * d) / 2 - 0.1)
    g.add(gable)
  }
  return g
}

export interface HouseOpts {
  w?: number
  d?: number
  h?: number
  roof?: "tiles" | "thatch"
  ruined?: boolean
  stone?: boolean
  seed?: number
  /** Second storey. */
  tall?: boolean
}

export function house(opts: HouseOpts = {}): Prop {
  const w = opts.w ?? 7
  const d = opts.d ?? 6
  const h = opts.h ?? (opts.tall ? 5.5 : 3.2)
  const rng = new Rng(opts.seed ?? 1)
  const g = new THREE.Group()
  const cols: Collider[] = []
  const wallMat = opts.stone ? M.stone() : M.plaster()
  const t = 0.3
  const doorW = 1.3
  const doorH = 2.1
  // Floor
  g.add(mesh(new THREE.BoxGeometry(w, 0.12, d), M.planks(), 0, 0.06, 0, false, true))
  // Stone base
  g.add(box(w + 0.2, 0.5, d + 0.2, M.stone(), 0, 0.25, 0))
  // Walls: back, left, right full; front split around the door
  const wallBack = box(w, h, t, wallMat, 0, h / 2, -d / 2 + t / 2)
  const wallL = box(t, h, d, wallMat, -w / 2 + t / 2, h / 2, 0)
  const wallR = box(t, h, d, wallMat, w / 2 - t / 2, h / 2, 0)
  g.add(wallBack, wallL, wallR)
  const sideW = (w - doorW) / 2
  const fl = box(sideW, h, t, wallMat, -w / 2 + sideW / 2, h / 2, d / 2 - t / 2)
  const fr = box(sideW, h, t, wallMat, w / 2 - sideW / 2, h / 2, d / 2 - t / 2)
  const lintel = box(doorW + 0.2, h - doorH, t, wallMat, 0, doorH + (h - doorH) / 2, d / 2 - t / 2)
  g.add(fl, fr, lintel)
  cols.push(boxCol(0, -d / 2 + t / 2, w / 2, t / 2, 0, h))
  cols.push(boxCol(-w / 2 + t / 2, 0, t / 2, d / 2, 0, h))
  cols.push(boxCol(w / 2 - t / 2, 0, t / 2, d / 2, 0, h))
  cols.push(boxCol(-w / 2 + sideW / 2, d / 2 - t / 2, sideW / 2, t / 2, 0, h))
  cols.push(boxCol(w / 2 - sideW / 2, d / 2 - t / 2, sideW / 2, t / 2, 0, h))
  cols.push(boxCol(0, d / 2 - t / 2, doorW / 2 + 0.1, t / 2, doorH, h))
  // Timber frame (half-timbered look)
  if (!opts.stone) {
    const beam = M.timber()
    for (const z of [-d / 2 + t / 2, d / 2 - t / 2]) {
      g.add(box(w + 0.05, 0.16, t + 0.06, beam, 0, 0.6, z))
      g.add(box(w + 0.05, 0.16, t + 0.06, beam, 0, h - 0.1, z))
      for (let x = -w / 2 + 0.1; x <= w / 2; x += w / 3) g.add(box(0.16, h, t + 0.06, beam, x, h / 2, z))
      if (z < 0) {
        const diag = box(0.14, 1.9, t + 0.06, beam, -w / 4, h / 2, z)
        diag.rotation.z = 0.6
        g.add(diag)
      }
    }
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) {
      g.add(box(t + 0.06, 0.16, d + 0.05, beam, x, 0.6, 0))
      g.add(box(t + 0.06, 0.16, d + 0.05, beam, x, h - 0.1, 0))
      for (let z = -d / 2 + 0.1; z <= d / 2; z += d / 2) g.add(box(t + 0.06, h, 0.16, beam, x, h / 2, z))
    }
  }
  // Windows (dark recesses with shutters)
  const win = mat(null, { color: 0x0a0a0c })
  const shutter = M.timber()
  for (const x of [-w / 4, w / 4]) {
    g.add(box(0.9, 0.9, 0.06, win, x, h * 0.55, d / 2 + 0.02))
    g.add(box(0.9, 0.9, 0.06, win, x, h * 0.55, -d / 2 - 0.02))
    if (rng.chance(0.6)) g.add(box(0.35, 0.95, 0.05, shutter, x - 0.62, h * 0.55, d / 2 + 0.05))
  }
  g.add(box(0.06, 0.9, 0.9, win, w / 2 + 0.02, h * 0.55, 0))
  // Door (open, leaning inward)
  const door = box(doorW * 0.9, doorH - 0.1, 0.08, M.planks(), -doorW / 2 + 0.1, doorH / 2, d / 2 - 0.3)
  door.rotation.y = -1.2
  g.add(door)
  // Roof
  if (opts.ruined) {
    // Collapsed roof: only one slab remains, plus debris
    const slab = box(w * 0.55, 0.12, d + 0.6, M.roof(), -w / 4, h + 0.6, 0)
    slab.rotation.z = -0.55
    g.add(slab)
    for (let i = 0; i < 6; i++) {
      const r = box(rng.range(0.4, 1.2), rng.range(0.2, 0.5), rng.range(0.4, 1.0), M.timber(), rng.range(-w / 2, w / 2), 0.25, rng.range(-d / 2, d / 2))
      r.rotation.y = rng.range(0, 3)
      g.add(r)
    }
  } else {
    const rf = roof(w + 0.3, d + 0.3, h, w * 0.42, opts.roof === "thatch" ? M.thatch() : M.roof(), wallMat)
    g.add(rf)
    // Chimney
    g.add(box(0.6, 1.4, 0.6, M.stone(), w / 3, h + w * 0.25, -d / 4))
  }
  // Furniture
  const spots: Prop["spots"] = []
  const table = box(1.4, 0.08, 0.8, M.planks(), -w / 4, 0.8, -d / 5)
  g.add(table)
  for (const [tx, tz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) g.add(box(0.08, 0.8, 0.08, M.timber(), -w / 4 + tx, 0.4, -d / 5 + tz))
  cols.push(boxCol(-w / 4, -d / 5, 0.7, 0.4, 0, 0.85))
  const bed = box(1.0, 0.45, 2.0, mat("cloth", { color: 0x7a6a50 }), w / 4, 0.28, -d / 4)
  g.add(bed)
  cols.push(boxCol(w / 4, -d / 4, 0.5, 1.0, 0, 0.5))
  g.add(box(1.0, 0.2, 0.6, mat("cloth", { color: 0xc8c0a8 }), w / 4, 0.55, -d / 4 - 0.6))
  spots.push({ x: -w / 4, z: d / 5, kind: "loot" })
  spots.push({ x: w / 4, z: d / 4, kind: "interior" })
  if (opts.tall) {
    // Upper floor is suggested by a balcony beam line
    g.add(box(w + 0.4, 0.2, 0.4, M.timber(), 0, h * 0.55, d / 2 + 0.2))
  }
  return { group: g, colliders: cols, spots }
}

export function barn(seed = 1): Prop {
  const w = 10
  const d = 8
  const h = 4.5
  const g = new THREE.Group()
  const cols: Collider[] = []
  const planks = M.planks()
  const t = 0.25
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, d), mat("dirt"), 0, 0.05, 0, false, true))
  g.add(box(w, h, t, planks, 0, h / 2, -d / 2))
  g.add(box(t, h, d, planks, -w / 2, h / 2, 0))
  g.add(box(t, h, d, planks, w / 2, h / 2, 0))
  const gateW = 3
  const side = (w - gateW) / 2
  g.add(box(side, h, t, planks, -w / 2 + side / 2, h / 2, d / 2))
  g.add(box(side, h, t, planks, w / 2 - side / 2, h / 2, d / 2))
  g.add(box(gateW + 0.2, h - 3, t, planks, 0, 3 + (h - 3) / 2, d / 2))
  cols.push(boxCol(0, -d / 2, w / 2, t / 2, 0, h), boxCol(-w / 2, 0, t / 2, d / 2, 0, h), boxCol(w / 2, 0, t / 2, d / 2, 0, h))
  cols.push(boxCol(-w / 2 + side / 2, d / 2, side / 2, t / 2, 0, h), boxCol(w / 2 - side / 2, d / 2, side / 2, t / 2, 0, h))
  g.add(roof(w + 0.4, d + 0.4, h, 3, M.thatch(), planks))
  const rng = new Rng(seed)
  for (let i = 0; i < 5; i++) {
    const hx = rng.range(-w / 2 + 1, w / 2 - 1)
    const hz = rng.range(-d / 2 + 1, d / 2 - 2)
    const bale = mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10), M.thatch(), hx, 0.6, hz)
    bale.rotation.z = Math.PI / 2
    g.add(bale)
    cols.push(circleCol(hx, hz, 0.6, 0, 1.2))
  }
  return { group: g, colliders: cols, spots: [{ x: 0, z: -d / 3, kind: "loot" }, { x: 2, z: 1, kind: "spawn" }] }
}

export function church(opts: { w?: number; d?: number; towerH?: number; ruined?: boolean } = {}): Prop {
  const w = opts.w ?? 10
  const d = opts.d ?? 20
  const h = 7
  const g = new THREE.Group()
  const cols: Collider[] = []
  const stone = M.stone()
  const t = 0.5
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, d), M.cobble(), 0, 0.05, 0, false, true))
  g.add(box(w, h, t, stone, 0, h / 2, -d / 2))
  g.add(box(t, h, d, stone, -w / 2, h / 2, 0))
  g.add(box(t, h, d, stone, w / 2, h / 2, 0))
  const doorW = 2.2
  const side = (w - doorW) / 2
  g.add(box(side, h, t, stone, -w / 2 + side / 2, h / 2, d / 2))
  g.add(box(side, h, t, stone, w / 2 - side / 2, h / 2, d / 2))
  g.add(box(doorW + 0.3, h - 3.2, t, stone, 0, 3.2 + (h - 3.2) / 2, d / 2))
  cols.push(boxCol(0, -d / 2, w / 2, t / 2, 0, h), boxCol(-w / 2, 0, t / 2, d / 2, 0, h), boxCol(w / 2, 0, t / 2, d / 2, 0, h))
  cols.push(boxCol(-w / 2 + side / 2, d / 2, side / 2, t / 2, 0, h), boxCol(w / 2 - side / 2, d / 2, side / 2, t / 2, 0, h), boxCol(0, d / 2, doorW / 2 + 0.15, t / 2, 3.2, h))
  // Buttresses and tall windows
  const win = mat(null, { color: 0x1a1830, emissive: 0x100a20 })
  for (let z = -d / 2 + 3; z < d / 2 - 2; z += 4) {
    for (const s of [-1, 1]) {
      g.add(box(0.8, 4, 0.8, stone, (s * (w / 2 + 0.3)), 2, z))
      g.add(box(0.1, 3.5, 1.0, win, s * (w / 2 + 0.05), 4, z + 2))
    }
  }
  if (!opts.ruined) g.add(roof(w + 0.6, d + 0.6, h, 4, M.roof(), stone))
  else {
    for (let i = 0; i < 8; i++) {
      const r = box(1 + (i % 3), 0.5, 0.8, stone, (i - 4) * 1.1, 0.3, (i % 4) * 2 - 3)
      r.rotation.y = i * 0.7
      g.add(r)
    }
  }
  // Tower
  const towerH = opts.towerH ?? 16
  const tx = 0
  const tz = d / 2 + 2.2
  const tw = 4.4
  g.add(box(tw, towerH, tw, stone, tx, towerH / 2, tz))
  const tr = mesh(new THREE.ConeGeometry(tw * 0.8, 4, 4), M.roof(), tx, towerH + 2, tz)
  tr.rotation.y = Math.PI / 4
  g.add(tr)
  g.add(box(1.2, 1.8, 0.2, win, tx, towerH - 2.5, tz + tw / 2))
  cols.push(boxCol(tx, tz, tw / 2, tw / 2, 0, towerH))
  // Altar + pews
  g.add(box(2, 1.1, 0.9, stone, 0, 0.55, -d / 2 + 1.6))
  cols.push(boxCol(0, -d / 2 + 1.6, 1, 0.45, 0, 1.1))
  for (let z = -d / 2 + 4; z < d / 2 - 3; z += 1.8) {
    for (const s of [-1, 1]) {
      g.add(box(3, 0.08, 0.4, M.planks(), s * 2.6, 0.5, z))
      g.add(box(3, 0.6, 0.08, M.planks(), s * 2.6, 0.8, z - 0.2))
      cols.push(boxCol(s * 2.6, z - 0.1, 1.5, 0.3, 0, 0.9))
    }
  }
  return { group: g, colliders: cols, spots: [{ x: 0, z: -d / 2 + 3, kind: "loot" }, { x: 0, z: 0, kind: "spawn" }, { x: 0, z: d / 2 - 3, kind: "interior" }] }
}

export function tower(r = 3, h = 10, opts: { ruined?: boolean; dark?: boolean } = {}): Prop {
  const g = new THREE.Group()
  const stone = opts.dark ? M.stoneDark() : M.stone()
  const body = mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 14), stone, 0, h / 2, 0)
  g.add(body)
  if (!opts.ruined) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const m = box(0.8, 1.0, 0.6, stone, Math.cos(a) * r, h + 0.5, Math.sin(a) * r)
      m.rotation.y = -a
      g.add(m)
    }
  } else {
    body.scale.y = 0.7
    body.position.y = h * 0.35
  }
  const win = mat(null, { color: 0x0a0a0c })
  for (let y = 3; y < h - 1; y += 3) g.add(box(0.6, 1.1, 0.3, win, 0, y, r))
  return { group: g, colliders: [circleCol(0, 0, r, 0, h)] }
}

export function wall(len: number, h = 5, thick = 1.2, opts: { crenels?: boolean; dark?: boolean; ruined?: number } = {}): Prop {
  const g = new THREE.Group()
  const stone = opts.dark ? M.stoneDark() : M.stone()
  const cols: Collider[] = []
  if (opts.ruined) {
    // Broken wall: pieces of varying height with a gap in the middle
    const pieces = 4
    const pw = len / pieces
    const rng = new Rng(Math.round(len * 100 + opts.ruined))
    for (let i = 0; i < pieces; i++) {
      if (i === Math.floor(pieces / 2) && rng.chance(0.7)) continue
      const ph = h * rng.range(0.35, 1)
      const x = -len / 2 + pw * (i + 0.5)
      g.add(box(pw, ph, thick, stone, x, ph / 2, 0))
      cols.push(boxCol(x, 0, pw / 2, thick / 2, 0, ph))
    }
    return { group: g, colliders: cols }
  }
  g.add(box(len, h, thick, stone, 0, h / 2, 0))
  cols.push(boxCol(0, 0, len / 2, thick / 2, 0, h))
  if (opts.crenels !== false) {
    for (let x = -len / 2 + 0.6; x < len / 2; x += 1.6) g.add(box(0.8, 0.9, thick, stone, x, h + 0.45, 0))
    g.add(box(len, 0.3, thick * 0.4, stone, 0, h + 0.15, -thick * 0.3))
  }
  return { group: g, colliders: cols }
}

export function gatehouse(opening = 4, h = 7, opts: { portcullis?: boolean; dark?: boolean } = {}): Prop {
  const g = new THREE.Group()
  const cols: Collider[] = []
  const stone = opts.dark ? M.stoneDark() : M.stone()
  const tw = 3.5
  for (const s of [-1, 1]) {
    const x = s * (opening / 2 + tw / 2)
    g.add(box(tw, h + 2, tw + 1, stone, x, (h + 2) / 2, 0))
    cols.push(boxCol(x, 0, tw / 2, (tw + 1) / 2, 0, h + 2))
    for (let i = -1; i <= 1; i++) g.add(box(0.8, 0.9, 0.8, stone, x + i * 1.2, h + 2.45, (tw + 1) / 2 - 0.4))
  }
  g.add(box(opening + 0.4, h - 4.5, tw + 1, stone, 0, 4.5 + (h - 4.5) / 2, 0))
  cols.push(boxCol(0, 0, opening / 2 + 0.2, (tw + 1) / 2, 4.5, h))
  if (opts.portcullis) {
    const grate = new THREE.Group()
    grate.userData.dynamic = true
    grate.name = "portcullis"
    const iron = M.iron()
    for (let x = -opening / 2 + 0.3; x < opening / 2; x += 0.5) grate.add(box(0.08, 4.5, 0.08, iron, x, 2.25, 0))
    for (let y = 0.4; y < 4.5; y += 0.7) grate.add(box(opening, 0.08, 0.08, iron, 0, y, 0))
    g.add(grate)
    cols.push(boxCol(0, 0, opening / 2, 0.1, 0, 4.5, 0, "portcullis"))
  }
  return { group: g, colliders: cols }
}

export function tree(kind: "pine" | "oak" | "dead" | "birch", size = 1, seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const bark = M.bark()
  if (kind === "pine") {
    const h = 9 * size
    g.add(mesh(new THREE.CylinderGeometry(0.18 * size, 0.35 * size, h, 7), bark, 0, h / 2, 0))
    const leaves = M.leaves()
    for (let i = 0; i < 4; i++) {
      const y = h * (0.3 + i * 0.18)
      const r = (2.6 - i * 0.5) * size
      const cone = mesh(new THREE.ConeGeometry(r, 3.2 * size, 8), leaves, 0, y, 0)
      cone.rotation.y = rng.range(0, 1)
      g.add(cone)
    }
    return { group: g, colliders: [circleCol(0, 0, 0.35 * size, 0, h)] }
  }
  if (kind === "oak") {
    const h = 5 * size
    const trunk = mesh(new THREE.CylinderGeometry(0.28 * size, 0.5 * size, h, 8), bark, 0, h / 2, 0)
    g.add(trunk)
    const leaves = M.leaves()
    const crownY = h + 0.5 * size
    for (let i = 0; i < 5; i++) {
      const r = (2.4 + rng.range(-0.4, 0.8)) * size
      const s = mesh(new THREE.IcosahedronGeometry(r, 1), leaves, rng.range(-1.6, 1.6) * size, crownY + rng.range(-0.6, 1.2) * size, rng.range(-1.6, 1.6) * size)
      s.rotation.set(rng.range(0, 3), rng.range(0, 3), 0)
      g.add(s)
    }
    for (let i = 0; i < 3; i++) {
      const b = mesh(new THREE.CylinderGeometry(0.08 * size, 0.16 * size, 2.5 * size, 5), bark, 0, h - 0.4, 0)
      b.rotation.z = rng.range(0.6, 1.1) * (i % 2 ? 1 : -1)
      b.rotation.y = rng.range(0, 6)
      b.position.x = Math.cos(b.rotation.y) * 0.9 * size
      b.position.z = Math.sin(b.rotation.y) * 0.9 * size
      g.add(b)
    }
    return { group: g, colliders: [circleCol(0, 0, 0.5 * size, 0, h)] }
  }
  if (kind === "birch") {
    const h = 7 * size
    g.add(mesh(new THREE.CylinderGeometry(0.12 * size, 0.2 * size, h, 7), mat("bone", { color: 0xdddddd }), 0, h / 2, 0))
    const leaves = M.leavesDead()
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.IcosahedronGeometry((1.2 + i * 0.3) * size, 1), leaves, rng.range(-0.6, 0.6), h * (0.6 + i * 0.15), rng.range(-0.6, 0.6))
      g.add(s)
    }
    return { group: g, colliders: [circleCol(0, 0, 0.2 * size, 0, h)] }
  }
  // dead tree
  const h = 6 * size
  g.add(mesh(new THREE.CylinderGeometry(0.15 * size, 0.4 * size, h, 7), bark, 0, h / 2, 0))
  for (let i = 0; i < 5; i++) {
    const len = rng.range(1.5, 3) * size
    const b = mesh(new THREE.CylinderGeometry(0.04 * size, 0.12 * size, len, 5), bark, 0, h * rng.range(0.5, 0.95), 0)
    b.rotation.z = rng.range(0.7, 1.4) * (i % 2 ? 1 : -1)
    b.rotation.y = rng.range(0, 6)
    b.position.x = Math.cos(b.rotation.y) * len * 0.35
    b.position.z = Math.sin(b.rotation.y) * len * 0.35
    g.add(b)
  }
  return { group: g, colliders: [circleCol(0, 0, 0.4 * size, 0, h)] }
}

export function bush(size = 1, seed = 1, dead = false): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const leaves = dead ? M.leavesDead() : M.leaves()
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(rng.range(0.5, 0.9) * size, 1), leaves, rng.range(-0.4, 0.4), rng.range(0.3, 0.6) * size, rng.range(-0.4, 0.4), false, false)
    g.add(s)
  }
  return { group: g, colliders: [] }
}

export function rock(size = 1, seed = 1): Prop {
  const rng = new Rng(seed)
  const geo = new THREE.IcosahedronGeometry(size, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * rng.range(0.7, 1.3), pos.getY(i) * rng.range(0.5, 1) , pos.getZ(i) * rng.range(0.7, 1.3))
  geo.computeVertexNormals()
  const g = new THREE.Group()
  g.add(mesh(geo, mat("stone", { color: 0x9a9a92, flat: true }), 0, size * 0.4, 0))
  return { group: g, colliders: [circleCol(0, 0, size * 0.85, 0, size)] }
}

export function gravestone(kind: number, seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const stone = mat("stone", { color: 0x8a8a84 })
  const tilt = rng.range(-0.18, 0.18)
  if (kind === 0) {
    const m = box(0.7, 1.1, 0.16, stone, 0, 0.5, 0)
    m.rotation.z = tilt
    g.add(m)
    const top = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 10, 1, false, 0, Math.PI), stone, 0, 1.05, 0)
    top.rotation.x = Math.PI / 2
    top.rotation.z = tilt
    g.add(top)
  } else if (kind === 1) {
    const m = box(0.3, 1.6, 0.3, stone, 0, 0.8, 0)
    m.rotation.z = tilt
    g.add(m)
    g.add(box(0.9, 0.25, 0.25, stone, 0, 1.3, 0))
  } else {
    g.add(box(0.9, 0.5, 1.9, stone, 0, 0.25, 0))
    g.add(box(0.8, 0.9, 0.2, stone, 0, 0.9, -0.85))
  }
  return { group: g, colliders: [boxCol(0, 0, 0.4, kind === 2 ? 0.95 : 0.2, 0, 1.2)] }
}

export function mausoleum(seed = 1): Prop {
  const g = new THREE.Group()
  const cols: Collider[] = []
  const stone = M.stone()
  const w = 5
  const d = 6
  const h = 3.6
  const t = 0.4
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, d), M.stoneDark(), 0, 0.05, 0, false, true))
  g.add(box(w, h, t, stone, 0, h / 2, -d / 2))
  g.add(box(t, h, d, stone, -w / 2, h / 2, 0))
  g.add(box(t, h, d, stone, w / 2, h / 2, 0))
  const doorW = 1.4
  const side = (w - doorW) / 2
  g.add(box(side, h, t, stone, -w / 2 + side / 2, h / 2, d / 2))
  g.add(box(side, h, t, stone, w / 2 - side / 2, h / 2, d / 2))
  g.add(box(doorW + 0.2, h - 2.3, t, stone, 0, 2.3 + (h - 2.3) / 2, d / 2))
  cols.push(boxCol(0, -d / 2, w / 2, t / 2, 0, h), boxCol(-w / 2, 0, t / 2, d / 2, 0, h), boxCol(w / 2, 0, t / 2, d / 2, 0, h))
  cols.push(boxCol(-w / 2 + side / 2, d / 2, side / 2, t / 2, 0, h), boxCol(w / 2 - side / 2, d / 2, side / 2, t / 2, 0, h))
  g.add(box(w + 0.6, 0.4, d + 0.6, stone, 0, h + 0.2, 0))
  const pr = roof(w + 0.6, d + 0.6, h + 0.4, 1.4, stone, stone, 0.1)
  g.add(pr)
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, h, 8), stone, s * (w / 2 - 0.2), h / 2, d / 2 + 0.5))
  // Sarcophagus inside
  g.add(box(1.0, 0.9, 2.2, stone, 0, 0.45, -0.5))
  cols.push(boxCol(0, -0.5, 0.5, 1.1, 0, 0.9))
  return { group: g, colliders: cols, spots: [{ x: 0, z: 1.6, kind: "loot" }] }
}

export function fence(len: number, seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const w = M.timber()
  for (let x = -len / 2; x <= len / 2; x += 1.6) g.add(box(0.12, 1.1, 0.12, w, x, 0.55, 0))
  g.add(box(len, 0.1, 0.06, w, 0, 0.95, 0))
  const rail = box(len, 0.1, 0.06, w, 0, 0.5, 0)
  rail.rotation.z = rng.range(-0.02, 0.02)
  g.add(rail)
  return { group: g, colliders: [boxCol(0, 0, len / 2, 0.1, 0, 1.0)] }
}

export function palisade(len: number): Prop {
  const g = new THREE.Group()
  const w = mat("timber", { color: 0x9a7a5a })
  for (let x = -len / 2; x <= len / 2; x += 0.42) {
    const h = 3 + ((x * 7) % 1) * 0.4
    const stake = mesh(new THREE.CylinderGeometry(0.18, 0.2, h, 6), w, x, h / 2, 0)
    g.add(stake)
    g.add(mesh(new THREE.ConeGeometry(0.18, 0.4, 6), w, x, h + 0.2, 0))
  }
  g.add(box(len, 0.2, 0.3, w, 0, 2.2, 0.2))
  return { group: g, colliders: [boxCol(0, 0, len / 2, 0.25, 0, 3.4)] }
}

export function cart(seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const w = M.planks()
  g.add(box(1.6, 0.1, 2.6, w, 0, 0.75, 0))
  g.add(box(1.6, 0.6, 0.08, w, 0, 1.05, -1.3))
  g.add(box(1.6, 0.6, 0.08, w, 0, 1.05, 1.3))
  g.add(box(0.08, 0.6, 2.6, w, -0.8, 1.05, 0))
  g.add(box(0.08, 0.6, 2.6, w, 0.8, 1.05, 0))
  for (const s of [-1, 1]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 12), M.timber(), s * 0.95, 0.6, 0.3)
    wheel.rotation.z = Math.PI / 2
    g.add(wheel)
  }
  const shaft = box(0.1, 0.1, 2.4, M.timber(), 0.5, 0.7, 2.2)
  shaft.rotation.x = rng.range(-0.3, 0.1)
  g.add(shaft)
  g.add(box(0.1, 0.1, 2.4, M.timber(), -0.5, 0.7, 2.2))
  return { group: g, colliders: [boxCol(0, 0.2, 0.95, 1.4, 0, 1.4)], spots: [{ x: 0, z: 0, kind: "loot" }] }
}

export function barrel(): Prop {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.0, 12), M.planks(), 0, 0.5, 0))
  g.add(mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 14), M.iron(), 0, 0.25, 0)).rotation.x = Math.PI / 2
  g.add(mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 14), M.iron(), 0, 0.8, 0)).rotation.x = Math.PI / 2
  return { group: g, colliders: [circleCol(0, 0, 0.42, 0, 1.0)] }
}

export function crate(size = 0.9): Prop {
  const g = new THREE.Group()
  g.add(box(size, size, size, M.planks(), 0, size / 2, 0))
  g.add(box(size + 0.02, 0.08, 0.08, M.timber(), 0, size * 0.5, size / 2))
  g.add(box(0.08, size + 0.02, 0.08, M.timber(), size * 0.45, size / 2, size / 2))
  return { group: g, colliders: [boxCol(0, 0, size / 2, size / 2, 0, size)] }
}

export function chest(opts: { fancy?: boolean } = {}): Prop & { lid: THREE.Object3D } {
  const g = new THREE.Group()
  const w = 1.1
  const d = 0.65
  const h = 0.6
  const body = box(w, h, d, opts.fancy ? mat("planks", { color: 0x7a3a2a }) : M.planks(), 0, h / 2, 0)
  g.add(body)
  const trim = opts.fancy ? M.gold() : M.iron()
  g.add(box(w + 0.02, 0.06, d + 0.02, trim, 0, h * 0.3, 0))
  g.add(box(0.1, h, d + 0.02, trim, -w / 2 + 0.1, h / 2, 0))
  g.add(box(0.1, h, d + 0.02, trim, w / 2 - 0.1, h / 2, 0))
  const lid = new THREE.Group()
  lid.userData.dynamic = true
  lid.position.set(0, h, -d / 2)
  const lidMesh = mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI), opts.fancy ? mat("planks", { color: 0x7a3a2a }) : M.planks(), 0, 0, d / 2)
  lidMesh.rotation.z = Math.PI / 2
  lid.add(lidMesh)
  lid.add(box(0.12, 0.12, 0.08, trim, 0, 0.1, d - 0.02))
  g.add(lid)
  return { group: g, colliders: [boxCol(0, 0, w / 2, d / 2, 0, h)], lid }
}

export function well(): Prop {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.0, 12), M.stone(), 0, 0.5, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.02, 12), mat(null, { color: 0x050508 }), 0, 0.5, 0))
  for (const s of [-1, 1]) g.add(box(0.15, 2.4, 0.15, M.timber(), s * 0.9, 1.6, 0))
  g.add(box(2.2, 0.15, 0.15, M.timber(), 0, 2.7, 0))
  g.add(mesh(new THREE.ConeGeometry(1.5, 0.9, 4), M.roof(), 0, 3.2, 0)).rotation.y = Math.PI / 4
  return { group: g, colliders: [circleCol(0, 0, 1.15, 0, 1.0)] }
}

export function marketStall(seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const w = M.planks()
  g.add(box(2.6, 0.08, 1.0, w, 0, 0.9, 0))
  for (const [x, z] of [[-1.2, -0.4], [1.2, -0.4], [-1.2, 0.4], [1.2, 0.4]]) g.add(box(0.1, 0.9, 0.1, M.timber(), x, 0.45, z))
  for (const [x, z] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) g.add(box(0.1, 2.4, 0.1, M.timber(), x, 1.2, z))
  const canopy = box(3.0, 0.06, 1.6, mat("cloth", { color: [0x8a3a3a, 0x3a5a8a, 0x6a6a2a][rng.int(0, 2)] }), 0, 2.4, 0)
  canopy.rotation.x = 0.15
  g.add(canopy)
  return { group: g, colliders: [boxCol(0, 0, 1.3, 0.5, 0, 1.0)], spots: [{ x: 0, z: 0.9, kind: "loot" }] }
}

export function torchPost(): Prop & { flame: THREE.Object3D } {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 7), M.timber(), 0, 1.3, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.3, 8), M.iron(), 0, 2.7, 0))
  const flame = new THREE.Group()
  flame.userData.dynamic = true
  flame.position.set(0, 2.95, 0)
  const fm = mesh(new THREE.ConeGeometry(0.12, 0.35, 6), M.glow(0xffa030, 2), 0, 0.1, 0, false, false)
  flame.add(fm)
  g.add(flame)
  return { group: g, colliders: [circleCol(0, 0, 0.12, 0, 2.6)], flame }
}

export function campfire(): Prop & { flame: THREE.Object3D } {
  const g = new THREE.Group()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.add(mesh(new THREE.DodecahedronGeometry(0.22, 0), mat("stone", { color: 0x8a8a82, flat: true }), Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7))
  }
  for (let i = 0; i < 3; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), M.bark(), 0, 0.15, 0)
    l.rotation.z = 0.5
    l.rotation.y = i * 2.1
    g.add(l)
  }
  const flame = new THREE.Group()
  flame.userData.dynamic = true
  flame.position.y = 0.3
  flame.add(mesh(new THREE.ConeGeometry(0.3, 0.8, 7), M.glow(0xff9020, 2), 0, 0.3, 0, false, false))
  g.add(flame)
  return { group: g, colliders: [circleCol(0, 0, 0.7, 0, 0.5)], flame }
}

export function column(h = 4, dark = true): Prop {
  const g = new THREE.Group()
  const m = dark ? M.stoneDark() : M.stone()
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, h, 10), m, 0, h / 2, 0))
  g.add(box(1.2, 0.3, 1.2, m, 0, h - 0.15, 0))
  g.add(box(1.2, 0.3, 1.2, m, 0, 0.15, 0))
  return { group: g, colliders: [circleCol(0, 0, 0.55, 0, h)] }
}

export function sarcophagus(seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const stone = M.stone()
  g.add(box(1.1, 0.9, 2.3, stone, 0, 0.45, 0))
  const lid = box(1.15, 0.2, 2.35, stone, rng.range(-0.3, 0.3), 1.0, rng.range(-0.4, 0.4))
  lid.rotation.y = rng.range(-0.2, 0.2)
  lid.rotation.z = rng.range(-0.15, 0.15)
  g.add(lid)
  return { group: g, colliders: [boxCol(0, 0, 0.6, 1.2, 0, 1.0)], spots: [{ x: 0, z: 1.6, kind: "loot" }] }
}

export function bonePile(seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const bone = M.bone()
  for (let i = 0; i < 9; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.04, 0.05, rng.range(0.3, 0.6), 5), bone, rng.range(-0.5, 0.5), 0.08, rng.range(-0.5, 0.5))
    b.rotation.set(Math.PI / 2, 0, rng.range(0, 3))
    g.add(b)
  }
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.14, 7, 6), bone, rng.range(-0.5, 0.5), 0.14, rng.range(-0.5, 0.5)))
  return { group: g, colliders: [] }
}

export function ruin(w: number, d: number, h: number, seed = 1): Prop {
  // Four crumbling walls, no roof
  const g = new THREE.Group()
  const cols: Collider[] = []
  const rng = new Rng(seed)
  const stone = M.stone()
  const t = 0.4
  const segs: [number, number, number, number, number][] = [
    [0, -d / 2, w, t, 0],
    [0, d / 2, w, t, 0],
    [-w / 2, 0, t, d, 0],
    [w / 2, 0, t, d, 0],
  ]
  for (const [x, z, sw, sd, _] of segs) {
    const along = sw > sd ? sw : sd
    const pieces = Math.max(2, Math.round(along / 2.5))
    for (let i = 0; i < pieces; i++) {
      if (rng.chance(0.3)) continue
      const ph = h * rng.range(0.25, 1)
      const off = -along / 2 + (along / pieces) * (i + 0.5)
      const px = sw > sd ? x + off : x
      const pz = sw > sd ? z : z + off
      const pw = sw > sd ? along / pieces : t
      const pd = sw > sd ? t : along / pieces
      g.add(box(pw, ph, pd, stone, px, ph / 2, pz))
      cols.push(boxCol(px, pz, pw / 2, pd / 2, 0, ph))
    }
  }
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, d), M.cobble(), 0, 0.05, 0, false, true))
  return { group: g, colliders: cols, spots: [{ x: 0, z: 0, kind: "loot" }] }
}

export function tent(seed = 1): Prop {
  const g = new THREE.Group()
  const rng = new Rng(seed)
  const cloth = mat("cloth", { color: [0x8a7a5a, 0x6a5a4a, 0x5a6a5a][rng.int(0, 2)], side: THREE.DoubleSide })
  const geo = new THREE.ConeGeometry(2.2, 2.6, 4, 1, true)
  const t = mesh(geo, cloth, 0, 1.3, 0)
  t.rotation.y = Math.PI / 4
  g.add(t)
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), M.timber(), 0, 1.3, 0))
  return { group: g, colliders: [circleCol(0, -0.8, 1.0, 0, 2.5)], spots: [{ x: 0, z: 0.6, kind: "loot" }] }
}

export function lever(): Prop & { handle: THREE.Object3D } {
  const g = new THREE.Group()
  g.add(box(0.4, 0.9, 0.4, M.stone(), 0, 0.45, 0))
  const handle = new THREE.Group()
  handle.userData.dynamic = true
  handle.position.set(0, 0.9, 0)
  const bar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.iron(), 0, 0.45, 0)
  handle.add(bar)
  handle.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(null, { color: 0x8a2a2a }), 0, 0.9, 0))
  handle.rotation.x = -0.9
  g.add(handle)
  return { group: g, colliders: [boxCol(0, 0, 0.2, 0.2, 0, 0.9)], handle }
}

export function tunnelEntrance(dark = false): Prop {
  const g = new THREE.Group()
  const cols: Collider[] = []
  const stone = dark ? M.stoneDark() : M.stone()
  // Mound with arched opening facing +Z
  const mound = mesh(new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("moss"), 0, 0, -1)
  g.add(mound)
  g.add(box(1.2, 3.2, 0.8, stone, -1.6, 1.6, 2.4))
  g.add(box(1.2, 3.2, 0.8, stone, 1.6, 1.6, 2.4))
  g.add(box(4.4, 0.8, 0.8, stone, 0, 3.4, 2.4))
  g.add(box(2.0, 3.0, 0.1, mat(null, { color: 0x030305 }), 0, 1.5, 2.1))
  cols.push(boxCol(-1.6, 2.4, 0.6, 0.4, 0, 3.6), boxCol(1.6, 2.4, 0.6, 0.4, 0, 3.6), circleCol(0, -1, 3.2, 0, 4, "mound"))
  return { group: g, colliders: cols }
}

export function boat(): Prop {
  const g = new THREE.Group()
  const w = M.planks()
  const hull = mesh(new THREE.CylinderGeometry(0.9, 0.5, 4.2, 8, 1, false), w, 0, 0.45, 0)
  hull.rotation.x = Math.PI / 2
  hull.scale.set(1, 1, 0.55)
  g.add(hull)
  g.add(box(1.6, 0.08, 0.3, w, 0, 0.9, 0))
  g.add(box(1.4, 0.08, 0.3, w, 0, 0.9, 1.3))
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), M.timber(), 0, 2.5, 0))
  return { group: g, colliders: [boxCol(0, 0, 0.9, 2.1, 0, 1.0)] }
}

export function dock(len: number): Prop {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.15, len), M.planks(), 0, 0.5, 0, true, true))
  for (let z = -len / 2 + 0.5; z < len / 2; z += 2) for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), M.timber(), s * 1.1, 0.0, z))
  return { group: g, colliders: [] }
}

export function statue(seed = 1): Prop {
  const g = new THREE.Group()
  const stone = mat("stone", { color: 0xa0a09a })
  g.add(box(1.4, 1.0, 1.4, stone, 0, 0.5, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.2, 8), stone, 0, 2.1, 0))
  g.add(mesh(new THREE.SphereGeometry(0.3, 8, 7), stone, 0, 3.4, 0))
  const arm = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), stone, 0.5, 2.8, 0)
  arm.rotation.z = -1.1 + (seed % 3) * 0.2
  g.add(arm)
  g.add(box(0.06, 1.8, 0.06, M.iron(), 1.0, 3.2, 0))
  return { group: g, colliders: [boxCol(0, 0, 0.7, 0.7, 0, 3.8)] }
}

export function altar(): Prop {
  const g = new THREE.Group()
  g.add(box(2.2, 1.1, 1.0, M.stone(), 0, 0.55, 0))
  g.add(box(2.4, 0.1, 1.2, mat("cloth", { color: 0x5a1a1a }), 0, 1.15, 0))
  g.add(box(0.1, 0.9, 0.1, M.gold(), 0, 1.6, 0))
  g.add(box(0.5, 0.1, 0.1, M.gold(), 0, 1.8, 0))
  return { group: g, colliders: [boxCol(0, 0, 1.1, 0.5, 0, 1.2)], spots: [{ x: 0, z: 1.2, kind: "loot" }] }
}

export function cage(): Prop {
  const g = new THREE.Group()
  const iron = M.iron()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    g.add(box(0.05, 2.4, 0.05, iron, Math.cos(a) * 0.7, 1.2, Math.sin(a) * 0.7))
  }
  g.add(mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 14), iron, 0, 2.4, 0)).rotation.x = Math.PI / 2
  g.add(mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 14), iron, 0, 0.1, 0)).rotation.x = Math.PI / 2
  return { group: g, colliders: [circleCol(0, 0, 0.75, 0, 2.4)] }
}

export function gallows(): Prop {
  const g = new THREE.Group()
  const w = M.timber()
  g.add(box(3, 0.3, 3, M.planks(), 0, 1.2, 0))
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) g.add(box(0.2, 1.2, 0.2, w, x, 0.6, z))
  g.add(box(0.25, 4, 0.25, w, -1.2, 3.3, 0))
  g.add(box(2.8, 0.25, 0.25, w, 0, 5.2, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), mat(null, { color: 0x9a8a6a }), 0.9, 4.4, 0))
  return { group: g, colliders: [boxCol(0, 0, 1.5, 1.5, 0, 1.4)] }
}

export function anvilStand(): Prop {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.6, 9), M.bark(), 0, 0.3, 0))
  g.add(box(0.7, 0.3, 0.3, M.iron(), 0, 0.75, 0))
  g.add(box(0.3, 0.2, 0.25, M.iron(), 0.4, 0.8, 0))
  return { group: g, colliders: [circleCol(0, 0, 0.45, 0, 0.9)] }
}

export function logPile(): Prop {
  const g = new THREE.Group()
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 3)
    const l = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 7), M.bark(), (i % 3) * 0.42 - 0.42 + row * 0.2, 0.2 + row * 0.36, 0)
    l.rotation.x = Math.PI / 2
    g.add(l)
  }
  return { group: g, colliders: [boxCol(0, 0, 0.75, 0.7, 0, 0.8)] }
}

export function bannerPost(color: number): Prop {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6), M.timber(), 0, 2.25, 0))
  g.add(box(1.0, 0.06, 0.06, M.timber(), 0.5, 4.4, 0))
  const cloth = box(0.9, 2.2, 0.03, mat("cloth", { color, side: THREE.DoubleSide }), 0.55, 3.3, 0)
  cloth.userData.dynamic = true
  cloth.name = "banner"
  g.add(cloth)
  return { group: g, colliders: [circleCol(0, 0, 0.1, 0, 4.4)] }
}

export function hayBale(): Prop {
  const g = new THREE.Group()
  const b = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10), M.thatch(), 0, 0.7, 0)
  b.rotation.z = Math.PI / 2
  g.add(b)
  return { group: g, colliders: [boxCol(0, 0, 0.7, 0.7, 0, 1.4)] }
}

/** Water plane for rivers / lakes (no collider; the terrain handles depth). */
export function waterPlane(w: number, d: number): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(w, d), M.water(), 0, 0, 0, false, true)
  m.rotation.x = -Math.PI / 2
  m.userData.dynamic = true
  return m
}
