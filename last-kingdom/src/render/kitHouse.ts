// Houses assembled from the CC0 Medieval Village MegaKit (Quaternius): 2 m wall modules with doors and windows,
// timber corner posts, tiled roofs with gables, chimneys, floors. Footprints are snapped to the 2 m grid and the
// colliders are generated from the same layout (door gap 1.3 m like the procedural houses).

import * as THREE from "three"
import { models } from "./assets"
import { Rng } from "../core/rng"
import type { Collider } from "../world/collision"

export const HOUSE_MODELS = ["village_kit"]
const WALL_H = 3.12

interface Spot {
  x: number
  z: number
  kind: "loot" | "spawn" | "interior"
}

export interface KitHouseOpts {
  w?: number
  d?: number
  stone?: boolean
  tall?: boolean
  ruined?: boolean
  seed?: number
}

function part(name: string): THREE.Object3D | null {
  const src = models.get("village_kit")?.scene.getObjectByName(name)
  if (!src) return null
  const c = src.clone(true)
  c.position.set(0, 0, 0)
  c.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  return c
}

function boxCol(x: number, z: number, hw: number, hd: number, y0: number, y1: number): Collider {
  return { kind: "box", x, z, hw, hd, yaw: 0, y0, y1 } as Collider
}

export function kitHouseReady(): boolean {
  return models.has("village_kit")
}

export function kitHouse(opts: KitHouseOpts): { group: THREE.Group; colliders: Collider[]; spots: Spot[] } | null {
  if (!kitHouseReady()) return null
  const rng = new Rng(opts.seed ?? 1)
  const W = Math.max(4, Math.min(8, 2 * Math.floor((opts.w ?? 7) / 2)))
  const D = Math.max(4, Math.min(6, 2 * Math.floor((opts.d ?? 6) / 2)))
  const floors = opts.tall ? 2 : 1
  const H = WALL_H * floors
  const stone = !!opts.stone
  const g = new THREE.Group()
  const add = (name: string, x: number, y: number, z: number, yaw: number) => {
    const p = part(name)
    if (!p) return null
    p.position.set(x, y, z)
    p.rotation.y = yaw
    g.add(p)
    return p
  }
  const wallSet = stone
    ? { plain: "Wall_UnevenBrick_Straight", door: "Wall_UnevenBrick_Door_Round", wide: "Wall_UnevenBrick_Window_Wide_Round", thin: "Wall_UnevenBrick_Window_Thin_Round" }
    : { plain: rng.chance(0.5) ? "Wall_Plaster_WoodGrid" : "Wall_Plaster_Straight", door: "Wall_Plaster_Door_Round", wide: "Wall_Plaster_Window_Wide_Round", thin: "Wall_Plaster_Window_Thin_Round" }
  // Door module on the front (+Z) side
  const frontModules = W / 2
  const doorIndex = frontModules % 2 === 1 ? (frontModules - 1) / 2 : rng.chance(0.5) ? frontModules / 2 - 1 : frontModules / 2
  const doorX = -W / 2 + 1 + doorIndex * 2
  // Sides: [count, position of module i, wall placement]
  const sides = [
    { n: W / 2, at: (i: number) => [-W / 2 + 1 + i * 2, D / 2] as const, yaw: 0, front: true },
    { n: W / 2, at: (i: number) => [W / 2 - 1 - i * 2, -D / 2] as const, yaw: Math.PI, front: false },
    { n: D / 2, at: (i: number) => [-W / 2, -D / 2 + 1 + i * 2] as const, yaw: -Math.PI / 2, front: false },
    { n: D / 2, at: (i: number) => [W / 2, D / 2 - 1 - i * 2] as const, yaw: Math.PI / 2, front: false },
  ]
  // The module mesh has its outer face at local z = +0.09: pull it inwards so the face sits on the footprint edge
  const inset = 0.09
  for (let level = 0; level < floors; level++) {
    const y = level * WALL_H
    if (opts.ruined && level === 1) break
    for (const side of sides) {
      for (let i = 0; i < side.n; i++) {
        const [px, pz] = side.at(i)
        const ox = -Math.sin(side.yaw) * inset
        const oz = -Math.cos(side.yaw) * inset
        const isDoor = level === 0 && side.front && Math.abs(px - doorX) < 0.01
        if (opts.ruined && !isDoor && rng.chance(0.3)) continue
        let name = wallSet.plain
        if (isDoor) name = wallSet.door
        else if (rng.chance(level === 0 ? 0.45 : 0.6)) name = rng.chance(0.6) ? wallSet.wide : wallSet.thin
        add(name, px + ox, y, pz + oz, side.yaw)
        if (name === wallSet.wide) {
          add("Window_Wide_Round1", px + ox, y, pz + oz, side.yaw)
          if (rng.chance(0.4)) add("WindowShutters_Wide_Round_Open", px + ox, y, pz + oz, side.yaw)
        } else if (name === wallSet.thin) {
          add("Window_Thin_Round1", px + ox, y, pz + oz, side.yaw)
          if (rng.chance(0.3)) add("WindowShutters_Thin_Round_Closed", px + ox, y, pz + oz, side.yaw)
        } else if (isDoor) {
          add("DoorFrame_Round_WoodDark", px + ox, y, pz + oz, side.yaw)
          // Door leaf stands open, swung inwards
          add("Door_1_Round", px - 0.55, y, pz - 0.2, side.yaw - 1.35)
        }
        if (level === 0) add("Wall_BottomCover", px + ox, 0, pz + oz, side.yaw)
        else add("Wall_BottomCover", px + ox, y, pz + oz, side.yaw)
      }
    }
    // Timber corner posts
    if (!stone) for (const [cx, cz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) add("Corner_Exterior_Wood", cx, y, cz, 0)
  }
  // Floor tiles inside
  for (let x = -W / 2 + 1; x < W / 2; x += 2) for (let z = -D / 2 + 1; z < D / 2; z += 2) add(stone ? "Floor_Brick" : "Floor_WoodDark", x, 0.03, z, 0)
  const roofTop = opts.ruined ? WALL_H : H
  if (!opts.ruined) {
    // Roof: the model's ridge runs along its second dimension (local Z); turn it for houses wider than deep
    const S = Math.min(W, D)
    const L = Math.max(W, D)
    const alongX = W > D
    const roof = add(`Roof_RoundTiles_${S}x${L}`, 0, roofTop, 0, alongX ? Math.PI / 2 : 0) ?? add("Roof_RoundTiles_6x6", 0, roofTop, 0, 0)
    void roof
    const gable = `Roof_Front_Brick${S}`
    if (alongX) {
      add(gable, W / 2 - inset, roofTop, 0, Math.PI / 2)
      add(gable, -W / 2 + inset, roofTop, 0, -Math.PI / 2)
    } else {
      add(gable, 0, roofTop, D / 2 - inset, 0)
      add(gable, 0, roofTop, -D / 2 + inset, Math.PI)
    }
    if (rng.chance(0.6)) add(rng.chance(0.5) ? "Prop_Chimney" : "Prop_Chimney2", (alongX ? W / 4 : S / 4) * (rng.chance(0.5) ? 1 : -1), roofTop - 0.6, alongX ? -D / 4 : L / 4, 0)
  } else {
    // Rubble from the collapsed upper floor and roof
    for (let i = 0; i < 8; i++) add(`Prop_Brick${rng.int(1, 3)}`, rng.range(-W / 2 + 0.6, W / 2 - 0.6), 0.02, rng.range(-D / 2 + 0.6, D / 2 - 0.6), rng.range(0, 6))
  }
  if (!stone && rng.chance(0.35)) add(rng.chance(0.5) ? "Prop_Vine1" : "Prop_Vine4", (rng.chance(0.5) ? -1 : 1) * (W / 2 - 1), 0, -D / 2 - 0.02, Math.PI)

  // Colliders: three full walls and the front split around the door
  const t = 0.3
  const half = 0.65
  const hTop = opts.ruined ? WALL_H : H
  const cols: Collider[] = [
    boxCol(0, -D / 2 + t / 2, W / 2, t / 2, 0, hTop),
    boxCol(-W / 2 + t / 2, 0, t / 2, D / 2, 0, hTop),
    boxCol(W / 2 - t / 2, 0, t / 2, D / 2, 0, hTop),
  ]
  const leftW = doorX - half - -W / 2
  const rightW = W / 2 - (doorX + half)
  if (leftW > 0.05) cols.push(boxCol(-W / 2 + leftW / 2, D / 2 - t / 2, leftW / 2, t / 2, 0, hTop))
  if (rightW > 0.05) cols.push(boxCol(W / 2 - rightW / 2, D / 2 - t / 2, rightW / 2, t / 2, 0, hTop))
  cols.push(boxCol(doorX, D / 2 - t / 2, half, t / 2, 2.35, hTop))
  const spots: Spot[] = [
    { x: doorX < 0 ? W / 4 : -W / 4, z: D / 5, kind: "loot" },
    { x: doorX < 0 ? -W / 4 + 0.3 : W / 4 - 0.3, z: -D / 4, kind: "interior" },
  ]
  return { group: g, colliders: cols, spots }
}
