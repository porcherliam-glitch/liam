// Builds an expedition area: terrain, buildings, props, containers, extraction points, hazards and the nav grid.
// Each biome has its own layout recipe; everything is deterministic from the area seed.

import * as THREE from "three"
import type { AreaDef, ExtractionDef } from "../core/types"
import { Rng } from "../core/rng"
import { CollisionWorld, placeCollider, type Collider } from "./collision"
import { Terrain, type TerrainFeature } from "./terrain"
import { NavGrid } from "./nav"
import { StaticBatcher, disposeMeshes } from "../render/batcher"
import * as P from "../render/props"
import { kitProp } from "../render/kitProps"
import { tex } from "../render/textures"
import { bakedCorpse } from "../render/rig"
import { buildHumanoid } from "../render/humanoid"
import { M, mat } from "../render/materials"
import { buildGrass } from "../render/grass"

export type ContainerKind = "chest" | "crate" | "barrel" | "sack" | "corpse" | "herb" | "woodpile" | "bones" | "scrap" | "cupboard"

export interface ContainerSite {
  id: string
  kind: ContainerKind
  table: string
  x: number
  y: number
  z: number
  object: THREE.Object3D
  lid?: THREE.Object3D
  secret?: boolean
  /** Fixed contents (quest keys etc.). */
  fixed?: { id: string; qty: number }[]
  opened: boolean
  bonusRolls?: number
}

export interface ExtractionSite {
  def: ExtractionDef
  x: number
  y: number
  z: number
  object: THREE.Object3D
  beam: THREE.Mesh
  lever?: { x: number; z: number; handle: THREE.Object3D }
  portcullis?: THREE.Object3D
  portcullisCollider?: Collider
  active: boolean
}

export interface Poi {
  id: string
  name: string
  x: number
  z: number
}

export interface Hazard {
  x: number
  z: number
  r: number
  kind: "plague"
}

export interface WorldBuild {
  area: AreaDef
  terrain: Terrain
  collision: CollisionWorld
  nav: NavGrid
  root: THREE.Group
  containers: ContainerSite[]
  /** Chests with fixed contents (keys, oars, lore): must always be reachable. */
  keyChests: ContainerSite[]
  /** Containers removed at build time because no walkable path from the spawn reached them. */
  droppedContainers: number
  extractions: ExtractionSite[]
  spawnPoints: { x: number; z: number }[]
  interiorSpots: { x: number; z: number }[]
  pois: Poi[]
  hazards: Hazard[]
  flames: THREE.Object3D[]
  banners: THREE.Object3D[]
  waters: THREE.Mesh[]
  bossArena: { x: number; z: number }
  underground: boolean
  playerSpawn: { x: number; z: number }
  dispose: () => void
}

interface Ctx {
  area: AreaDef
  rng: Rng
  terrain: Terrain
  collision: CollisionWorld
  batcher: StaticBatcher
  root: THREE.Group
  containers: ContainerSite[]
  spawnPoints: { x: number; z: number }[]
  interiorSpots: { x: number; z: number }[]
  pois: Poi[]
  hazards: Hazard[]
  flames: THREE.Object3D[]
  banners: THREE.Object3D[]
  waters: THREE.Mesh[]
  /** Circles reserved by structures, so scatter does not overlap. */
  reserved: { x: number; z: number; r: number }[]
  containerCounter: number
  keyChests: ContainerSite[]
}

function placeProp(ctx: Ctx, prop: P.Prop, x: number, z: number, yaw = 0, opts: { y?: number; reserve?: number; dynamic?: boolean; sink?: number } = {}): THREE.Group {
  const y = opts.y ?? ctx.terrain.heightAt(x, z) - (opts.sink ?? 0)
  prop.group.position.set(x, y, z)
  prop.group.rotation.y = yaw
  ctx.root.add(prop.group)
  for (const c of prop.colliders) ctx.collision.add(placeCollider(c, x, y, z, yaw))
  if (!opts.dynamic) ctx.batcher.addGroup(prop.group)
  if (opts.reserve) ctx.reserved.push({ x, z, r: opts.reserve })
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  for (const s of prop.spots ?? []) {
    const wx = x + s.x * cos - s.z * sin
    const wz = z + s.x * sin + s.z * cos
    if (s.kind === "spawn") ctx.spawnPoints.push({ x: wx, z: wz })
    else if (s.kind === "interior") ctx.interiorSpots.push({ x: wx, z: wz })
    else if (s.kind === "loot") addContainer(ctx, ctx.rng.chance(0.35) ? "chest" : ctx.rng.pick(["crate", "sack", "barrel", "cupboard"] as ContainerKind[]), wx, wz, yaw)
  }
  return prop.group
}

function isFree(ctx: Ctx, x: number, z: number, r: number): boolean {
  if (Math.max(Math.abs(x), Math.abs(z)) > ctx.area.size * 0.95) return false
  for (const res of ctx.reserved) if (Math.hypot(res.x - x, res.z - z) < res.r + r) return false
  if (ctx.terrain.isWater(x, z)) return false
  if (ctx.terrain.slopeAt(x, z) > 0.45) return false
  const y = ctx.terrain.heightAt(x, z)
  return !ctx.collision.pointInside(x, z, y + 0.5)
}

function scatter(ctx: Ctx, count: number, radius: number, make: (rng: Rng, i: number) => P.Prop, opts: { minR?: number; region?: { x: number; z: number; r: number }; tries?: number; yaw?: boolean; reserve?: boolean } = {}): number {
  let placed = 0
  const region = opts.region ?? { x: 0, z: 0, r: ctx.area.size * 0.92 }
  for (let i = 0; i < count * (opts.tries ?? 6) && placed < count; i++) {
    const a = ctx.rng.range(0, Math.PI * 2)
    const d = Math.sqrt(ctx.rng.next()) * region.r
    const x = region.x + Math.cos(a) * d
    const z = region.z + Math.sin(a) * d
    if (Math.abs(x) > ctx.area.size * 0.92 || Math.abs(z) > ctx.area.size * 0.92) continue
    if (!isFree(ctx, x, z, radius)) continue
    if (opts.minR && Math.hypot(x, z) < opts.minR) continue
    placeProp(ctx, make(ctx.rng, placed), x, z, opts.yaw === false ? 0 : ctx.rng.range(0, Math.PI * 2), { reserve: opts.reserve === false ? undefined : radius })
    placed++
  }
  return placed
}

let corpseCounter = 0
let _corpseBloodGeo: THREE.BufferGeometry | null = null
let _corpseBloodMat: THREE.Material | null = null
function corpseBloodGeo(): THREE.BufferGeometry {
  if (!_corpseBloodGeo) {
    _corpseBloodGeo = new THREE.PlaneGeometry(1, 1)
    _corpseBloodGeo.rotateX(-Math.PI / 2)
  }
  return _corpseBloodGeo
}
function corpseBloodMat(): THREE.Material {
  if (!_corpseBloodMat) _corpseBloodMat = new THREE.MeshBasicMaterial({ map: tex("blood"), color: 0x5a0408, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  return _corpseBloodMat
}

function containerVisual(kind: ContainerKind): { prop: P.Prop; lid?: THREE.Object3D } {
  // Kit models where available; colliders stay those of the procedural props so navigation is unchanged
  const kit: Partial<Record<ContainerKind, [string, number]>> = { chest: ["Chest_Wood", 0.85], crate: ["Crate_Wooden", 1.05], barrel: ["Barrel", 1.05], sack: ["Bag", 1.05], cupboard: ["Bookcase_2", 0.7] }
  const k = kit[kind]
  const model = k ? kitProp(k[0], k[1]) : null
  if (model && k) {
    const proc = kind === "chest" ? P.chest() : kind === "crate" ? P.crate(0.9) : kind === "barrel" ? P.barrel() : null
    const colliders = proc?.colliders ?? (kind === "sack" ? [{ kind: "circle" as const, x: 0, z: 0, r: 0.4, y0: 0, y1: 0.6 }] : [{ kind: "box" as const, x: 0, z: 0, hw: 0.5, hd: 0.25, yaw: 0, y0: 0, y1: 1.8 }])
    let lid: THREE.Object3D | undefined
    if (kind === "chest") {
      // The chest is skinned: the lid hinge is a bone, so the whole chest stays out of the static batch
      lid = model.getObjectByName("Chest_Top") ?? undefined
      model.children[0].userData.dynamic = true
    }
    return { prop: { group: model, colliders }, lid }
  }
  switch (kind) {
    case "chest": {
      const c = P.chest()
      return { prop: c, lid: c.lid }
    }
    case "crate":
      return { prop: P.crate(0.9) }
    case "barrel":
      return { prop: P.barrel() }
    case "sack": {
      const g = new THREE.Group()
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 9, 7), mat("cloth", { color: 0x9a8a6a }))
      m.scale.set(1, 0.75, 1)
      m.position.y = 0.33
      m.castShadow = true
      g.add(m)
      return { prop: { group: g, colliders: [{ kind: "circle", x: 0, z: 0, r: 0.4, y0: 0, y1: 0.6 }] } }
    }
    case "corpse": {
      // A real dead villager when the character models are there, lying in a pool of blood
      const seed = ++corpseCounter
      const dead = bakedCorpse(seed, seed % 3 === 1, () => buildHumanoid({}, { procedural: true }))
      if (dead) {
        const blood = new THREE.Mesh(corpseBloodGeo(), corpseBloodMat())
        blood.position.y = 0.03
        blood.rotation.y = seed * 1.3
        blood.scale.setScalar(1.4 + (seed % 4) * 0.25)
        dead.add(blood)
        return { prop: { group: dead, colliders: [] } }
      }
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.7), mat("cloth", { color: 0x3a3028 }))
      body.position.y = 0.15
      body.castShadow = true
      g.add(body)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), mat("zombie_skin"))
      head.position.set(0, 0.16, 0.95)
      g.add(head)
      return { prop: { group: g, colliders: [] } }
    }
    case "herb": {
      const g = P.bush(0.7, 3).group
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), M.glow(0xd8d060, 0.6))
        f.position.set(Math.cos(i * 1.3) * 0.45, 0.65 + (i % 2) * 0.15, Math.sin(i * 1.3) * 0.45)
        g.add(f)
      }
      return { prop: { group: g, colliders: [] } }
    }
    case "woodpile":
      return { prop: P.logPile() }
    case "bones":
      return { prop: P.bonePile(5) }
    case "scrap": {
      const g = new THREE.Group()
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), M.metalDark())
        m.position.set((i % 2) * 0.3 - 0.15, 0.06 + i * 0.1, (i % 3) * 0.2 - 0.2)
        m.rotation.y = i * 0.8
        m.castShadow = true
        g.add(m)
      }
      return { prop: { group: g, colliders: [] } }
    }
    case "cupboard": {
      const g = new THREE.Group()
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.5), M.planks())
      m.position.y = 0.9
      m.castShadow = true
      g.add(m)
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 0.04), M.timber())
      door.position.set(-0.25, 0.9, 0.26)
      g.add(door)
      return { prop: { group: g, colliders: [{ kind: "box", x: 0, z: 0, hw: 0.5, hd: 0.25, yaw: 0, y0: 0, y1: 1.8 }] } }
    }
  }
}

function addContainer(ctx: Ctx, kind: ContainerKind, x: number, z: number, yaw = 0, opts: { table?: string; secret?: boolean; fixed?: { id: string; qty: number }[]; bonusRolls?: number } = {}): ContainerSite {
  const vis = containerVisual(kind)
  const y = ctx.terrain.heightAt(x, z)
  vis.prop.group.position.set(x, y, z)
  vis.prop.group.rotation.y = yaw
  ctx.root.add(vis.prop.group)
  for (const c of vis.prop.colliders) ctx.collision.add(placeCollider(c, x, y, z, yaw))
  ctx.batcher.addGroup(vis.prop.group)
  const table = opts.table ?? (kind === "herb" ? "herb" : kind === "woodpile" ? "woodpile" : kind === "bones" ? "bones" : kind === "scrap" ? "scrap" : opts.secret ? "secret" : ctx.area.lootTable)
  const site: ContainerSite = { id: `c${ctx.containerCounter++}`, kind, table, x, y, z, object: vis.prop.group, lid: vis.lid, secret: opts.secret, fixed: opts.fixed, opened: false, bonusRolls: opts.bonusRolls }
  ctx.containers.push(site)
  return site
}

function torch(ctx: Ctx, x: number, z: number): void {
  const t = P.torchPost()
  placeProp(ctx, t, x, z, 0, { reserve: 0.3 })
  ctx.flames.push(t.flame)
}

function extractionVisual(ctx: Ctx, def: ExtractionDef): ExtractionSite {
  const x = def.x
  const z = def.z
  const y = ctx.terrain.heightAt(x, z)
  const g = new THREE.Group()
  let lever: ExtractionSite["lever"]
  let portcullis: THREE.Object3D | undefined
  let portcullisCollider: Collider | undefined
  const towardCentre = Math.atan2(-x, -z)
  switch (def.kind) {
    case "gate": {
      const gh = P.gatehouse(4, 7, { portcullis: def.activation?.kind === "lever", dark: ctx.area.biome === "catacombs" })
      placeProp(ctx, gh, x, z, towardCentre + Math.PI, { reserve: 7, dynamic: true })
      portcullis = gh.group.getObjectByName("portcullis") ?? undefined
      portcullisCollider = ctx.collision.all.find((c) => c.tag === "portcullis" && Math.hypot(c.x - x, c.z - z) < 1)
      // The gate's static parts still need batching: the batcher skips dynamic children only.
      ctx.batcher.addGroup(gh.group)
      break
    }
    case "cart":
      placeProp(ctx, P.cart(ctx.rng.int(1, 99)), x + 1.5, z, towardCentre, { reserve: 3 })
      placeProp(ctx, P.hayBale(), x - 1.8, z + 1, 0.4, { reserve: 1 })
      torch(ctx, x - 2, z - 2)
      break
    case "tunnel": {
      // Mouth faces the map centre, the mound sits behind the beacon so the light circle stays walkable
      const back = 3.5
      placeProp(ctx, P.tunnelEntrance(ctx.area.biome === "catacombs"), x - Math.sin(towardCentre) * back, z - Math.cos(towardCentre) * back, towardCentre, { reserve: 5 })
      torch(ctx, x + Math.cos(towardCentre) * 3, z - Math.sin(towardCentre) * 3)
      break
    }
    case "ford": {
      placeProp(ctx, P.dock(8), x, z, towardCentre, { reserve: 3, sink: 0.3 })
      torch(ctx, x + 2.5, z + 2.5)
      break
    }
    case "path":
      torch(ctx, x - 2, z)
      torch(ctx, x + 2, z)
      placeProp(ctx, P.fence(5), x - 4, z - 2, towardCentre + Math.PI / 2, { reserve: 1 })
      placeProp(ctx, P.fence(5), x + 4, z - 2, towardCentre + Math.PI / 2, { reserve: 1 })
      break
    case "boat":
      placeProp(ctx, P.dock(10), x - 3, z, towardCentre + Math.PI / 2, { reserve: 2, sink: 0.3 })
      placeProp(ctx, P.boat(), x, z, towardCentre + Math.PI / 2, { reserve: 3, y: ctx.terrain.waterLevel + 0.1 })
      torch(ctx, x - 6, z + 2)
      break
    case "rope": {
      placeProp(ctx, P.tower(1.4, 6, { ruined: true }), x, z - 3, 0, { reserve: 2 })
      const post = P.gallows()
      placeProp(ctx, post, x + 2, z + 1, towardCentre, { reserve: 2 })
      torch(ctx, x - 3, z + 2)
      break
    }
  }
  if (def.activation?.kind === "lever" && def.activation.leverX !== undefined && def.activation.leverZ !== undefined) {
    const lv = P.lever()
    placeProp(ctx, lv, def.activation.leverX, def.activation.leverZ, 0, { reserve: 1, dynamic: true })
    ctx.batcher.addGroup(lv.group)
    lever = { x: def.activation.leverX, z: def.activation.leverZ, handle: lv.handle }
  }
  // Beacon beam
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 60, 10, 1, true), beamMat)
  beam.position.set(x, y + 30, z)
  beam.userData.dynamic = true
  ctx.root.add(beam)
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 24), new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }))
  ring.rotation.x = -Math.PI / 2
  ring.position.set(x, y + 0.08, z)
  ctx.root.add(ring)
  g.add(ring)
  ctx.reserved.push({ x, z, r: 4 })
  return { def, x, y, z, object: g, beam, lever, portcullis, portcullisCollider, active: !def.activation }
}

function road(features: TerrainFeature[], x1: number, z1: number, x2: number, z2: number, width = 6): void {
  features.push({ kind: "road", x: x1, z: z1, x2, z2, width })
}

function addWater(ctx: Ctx, x: number, z: number, w: number, d: number): void {
  const m = P.waterPlane(w, d)
  m.position.set(x, ctx.terrain.waterLevel, z)
  ctx.root.add(m)
  ctx.waters.push(m)
}

function plagueZone(ctx: Ctx, x: number, z: number, r: number): void {
  ctx.hazards.push({ x, z, r, kind: "plague" })
  const g = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: 0x3a7a2a, transparent: true, opacity: 0.35, depthWrite: false }))
  g.rotation.x = -Math.PI / 2
  g.position.set(x, ctx.terrain.heightAt(x, z) + 0.05, z)
  ctx.root.add(g)
  ctx.reserved.push({ x, z, r: r * 0.6 })
}

function poi(ctx: Ctx, id: string, name: string, x: number, z: number): void {
  ctx.pois.push({ id: `${ctx.area.id}_${id}`, name, x, z })
}

// ---- biome recipes --------------------------------------------------------------

function buildVillage(ctx: Ctx): void {
  const rng = ctx.rng
  // Main road from spawn corner to the far corner with a crossing lane
  const houses: [number, number, number][] = []
  for (let i = 0; i < 9; i++) {
    const t = -110 + i * 26
    houses.push([t + rng.range(-3, 3), -14, 0])
    houses.push([t + 13 + rng.range(-3, 3), 14, Math.PI])
  }
  for (let i = 0; i < 4; i++) {
    houses.push([-16, -40 - i * 22, Math.PI / 2])
    houses.push([16, 40 + i * 22, -Math.PI / 2])
  }
  let n = 0
  for (const [hx, hz, yaw] of houses) {
    if (Math.hypot(hx - ctx.area.spawnX, hz - ctx.area.spawnZ) < 22) continue
    const ruined = rng.chance(0.3)
    const h = P.house({ w: rng.range(6, 8), d: rng.range(5, 7), roof: rng.chance(0.5) ? "thatch" : "tiles", ruined, seed: n++, tall: rng.chance(0.25) })
    placeProp(ctx, h, hx, hz, yaw, { reserve: 6.5 })
    if (n === 3) poi(ctx, "tavern", "Die Schenke „Zum Grauen Wolf“", hx, hz)
    if (n === 6) poi(ctx, "mill", "Haus des Müllers", hx, hz)
  }
  // Village centre: well, church, barn
  placeProp(ctx, P.well(), 0, 0, 0, { reserve: 2.5 })
  poi(ctx, "well", "Dorfbrunnen", 0, 0)
  placeProp(ctx, P.church({ w: 9, d: 16 }), 40, -60, Math.PI, { reserve: 14 })
  poi(ctx, "church", "Dorfkirche", 40, -52)
  placeProp(ctx, P.barn(2), -60, 48, Math.PI / 2, { reserve: 9 })
  poi(ctx, "barn", "Große Scheune", -60, 48)
  placeProp(ctx, P.barn(3), 80, 50, -Math.PI / 2, { reserve: 9 })
  // Market stalls and carts near the well
  for (let i = 0; i < 4; i++) placeProp(ctx, P.marketStall(i), -8 + i * 5, 7, 0, { reserve: 2 })
  placeProp(ctx, P.cart(7), 12, -6, 0.5, { reserve: 2 })
  placeProp(ctx, P.gallows(), 60, 10, 0.3, { reserve: 2.5 })
  poi(ctx, "gallows", "Der Galgen", 60, 10)
  // Boss ground: the elder's manor on the hill
  placeProp(ctx, P.house({ w: 11, d: 9, stone: true, tall: true, seed: 77 }), ctx.area.bossX!, ctx.area.bossZ! - 14, 0, { reserve: 9 })
  poi(ctx, "manor", "Gutshaus des Dorfältesten", ctx.area.bossX!, ctx.area.bossZ!)
  // Fences, hay, barrels
  scatter(ctx, 14, 2.6, (r, i) => P.fence(r.range(4, 8), i), { minR: 10 })
  scatter(ctx, 10, 0.8, () => P.hayBale(), { minR: 10 })
  scatter(ctx, 10, 0.5, () => P.barrel(), { minR: 4 })
  scatter(ctx, 8, 0.6, () => P.crate(0.8), { minR: 4 })
  // Torches along the road
  for (let i = -4; i <= 4; i++) torch(ctx, i * 26 + 6, -9)
  // Trees around
  scatter(ctx, 60, 1.2, (r, i) => P.tree(r.chance(0.6) ? "oak" : "pine", r.range(0.8, 1.3), i), { minR: 30 })
  scatter(ctx, 30, 0.6, (r, i) => P.bush(r.range(0.7, 1.2), i))
  scatter(ctx, 10, 1.0, (r, i) => P.rock(r.range(0.6, 1.4), i), { minR: 20 })
  // Containers in the open
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, 6.28)
    const d = rng.range(20, 120)
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["crate", "sack", "corpse", "barrel"]), x, z, rng.range(0, 6))
  }
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-130, 130)
    const z = rng.range(-130, 130)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, "woodpile", x, z, rng.range(0, 6))
  }
  for (let i = 0; i < 4; i++) {
    const x = rng.range(-130, 130)
    const z = rng.range(-130, 130)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, "herb", x, z)
  }
  // Secrets: cellar chest under the tavern, miller's hidden box
  ctx.keyChests.push(addContainer(ctx, "chest", -58 + 3, -14 + 2, 0, { secret: true }))
  addContainer(ctx, "chest", 120, -100, 0.4, { secret: true, fixed: [{ id: "miller_note", qty: 1 }] })
  addWater(ctx, 150, 0, 60, 300)
}

function buildForest(ctx: Ctx): void {
  const rng = ctx.rng
  // Hunter's hut, logging camp, ruins, quarry
  placeProp(ctx, P.house({ w: 6, d: 5, roof: "thatch", seed: 11 }), -40, 20, 0.4, { reserve: 6 })
  poi(ctx, "hut", "Jägerhütte", -40, 20)
  ctx.keyChests.push(addContainer(ctx, "chest", -40 + 1, 20 + 4.5, 0.4, { secret: true, fixed: [{ id: "bow_3", qty: 1 }, { id: "huntsman_warning", qty: 1 }] }))
  for (let i = 0; i < 3; i++) placeProp(ctx, P.tent(i), 30 + i * 6, 60 + (i % 2) * 5, rng.range(0, 6), { reserve: 2.5 })
  placeProp(ctx, P.logPile(), 42, 56, 0.3, { reserve: 1.2 })
  placeProp(ctx, P.logPile(), 26, 70, 1.3, { reserve: 1.2 })
  const cf = P.campfire()
  placeProp(ctx, cf, 36, 66, 0, { reserve: 1 })
  ctx.flames.push(cf.flame)
  poi(ctx, "camp", "Holzfällerlager", 36, 66)
  placeProp(ctx, P.ruin(10, 8, 4, 5), 70, -20, 0.6, { reserve: 8 })
  poi(ctx, "ruin", "Alte Waldkapelle", 70, -20)
  placeProp(ctx, P.ruin(7, 7, 3, 6), -90, -60, 1.2, { reserve: 6 })
  // Quarry for the rope lift: rocks
  scatter(ctx, 18, 1.6, (r, i) => P.rock(r.range(1, 2.4), i), { region: { x: -130, z: -60, r: 25 } })
  poi(ctx, "quarry", "Der Steinbruch", -130, -60)
  // Boss lair
  placeProp(ctx, P.cage(), ctx.area.bossX! + 4, ctx.area.bossZ! + 3, 0, { reserve: 1 })
  placeProp(ctx, P.cage(), ctx.area.bossX! - 4, ctx.area.bossZ! - 2, 0, { reserve: 1 })
  placeProp(ctx, P.gallows(), ctx.area.bossX!, ctx.area.bossZ! - 8, 0.4, { reserve: 2.5 })
  poi(ctx, "lair", "Lager des Pestjägers", ctx.area.bossX!, ctx.area.bossZ!)
  // Plague pools
  plagueZone(ctx, 10, -80, 9)
  plagueZone(ctx, -60, 90, 8)
  plagueZone(ctx, 110, 60, 10)
  addContainer(ctx, "chest", 10, -80, 0, { secret: true, fixed: [{ id: "silver", qty: 4 }] })
  // Dense forest
  scatter(ctx, 230, 1.4, (r, i) => P.tree(r.chance(0.65) ? "pine" : r.chance(0.6) ? "oak" : "dead", r.range(0.8, 1.5), i), { minR: 4 })
  scatter(ctx, 50, 0.6, (r, i) => P.bush(r.range(0.7, 1.3), i, r.chance(0.3)))
  scatter(ctx, 20, 1.0, (r, i) => P.rock(r.range(0.5, 1.3), i))
  for (let i = 0; i < 16; i++) {
    const x = rng.range(-150, 150)
    const z = rng.range(-150, 150)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, "herb", x, z)
  }
  for (let i = 0; i < 8; i++) {
    const x = rng.range(-150, 150)
    const z = rng.range(-150, 150)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, "woodpile", x, z, rng.range(0, 6))
  }
  for (let i = 0; i < 8; i++) {
    const x = rng.range(-150, 150)
    const z = rng.range(-150, 150)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["corpse", "sack", "crate"]), x, z, rng.range(0, 6))
  }
  for (let i = -3; i <= 3; i++) torch(ctx, ctx.area.spawnX + i * 3, ctx.area.spawnZ - 6)
  addWater(ctx, 0, -158, 340, 24)
}

function buildCastle(ctx: Ctx): void {
  const rng = ctx.rng
  const W = 110
  // Curtain wall square with corner towers, gate at +Z (the extraction gate)
  const half = W / 2
  for (const [x, z, yaw] of [[0, -half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2]] as [number, number, number][]) {
    placeProp(ctx, P.wall(W, 6, 1.6), x, z, yaw, { reserve: 0 })
  }
  // Front wall split around the gate (the gatehouse comes with the extraction)
  placeProp(ctx, P.wall(half - 6, 6, 1.6), -half / 2 - 3, half, 0)
  placeProp(ctx, P.wall(half - 6, 6, 1.6), half / 2 + 3, half, 0)
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) placeProp(ctx, P.tower(3.4, 10), x, z, 0, { reserve: 4 })
  // Keep
  placeProp(ctx, P.house({ w: 16, d: 12, h: 9, stone: true, tall: true, seed: 3 }), 0, -30, 0, { reserve: 13 })
  placeProp(ctx, P.tower(4, 18), 10, -38, 0, { reserve: 4.5 })
  poi(ctx, "keep", "Der Bergfried", 0, -24)
  ctx.keyChests.push(addContainer(ctx, "chest", 4, -27, 0, { secret: true, fixed: [{ id: "crypt_key", qty: 1 }, { id: "castellan_orders", qty: 1 }] }))
  // Barracks, stables, chapel, smithy
  placeProp(ctx, P.barn(4), -36, -20, Math.PI / 2, { reserve: 9 })
  poi(ctx, "stable", "Die Stallungen", -36, -20)
  placeProp(ctx, P.house({ w: 10, d: 6, stone: true, seed: 8 }), 36, -18, -Math.PI / 2, { reserve: 8 })
  placeProp(ctx, P.house({ w: 10, d: 6, stone: true, seed: 9 }), 36, -4, -Math.PI / 2, { reserve: 8 })
  poi(ctx, "barracks", "Kaserne", 36, -11)
  placeProp(ctx, P.church({ w: 8, d: 14, towerH: 12 }), -36, 20, Math.PI / 2, { reserve: 12 })
  poi(ctx, "chapel", "Burgkapelle", -36, 20)
  placeProp(ctx, P.anvilStand(), 20, 20, 0, { reserve: 1 })
  placeProp(ctx, P.house({ w: 7, d: 6, stone: true, ruined: true, seed: 10 }), 26, 26, 0.3, { reserve: 6 })
  poi(ctx, "smithy", "Burgschmiede", 20, 20)
  poi(ctx, "gate", "Torhaus", 0, 45)
  poi(ctx, "well", "Burgbrunnen", 0, 10)
  addContainer(ctx, "scrap", 18, 24)
  addContainer(ctx, "scrap", 23, 17)
  // Courtyard details
  placeProp(ctx, P.well(), 0, 10, 0, { reserve: 2.5 })
  for (let i = 0; i < 3; i++) placeProp(ctx, P.marketStall(i), -10 + i * 6, 36, Math.PI, { reserve: 2 })
  placeProp(ctx, P.statue(1), 0, -8, 0, { reserve: 1.5 })
  for (const [x, z] of [[-20, 40], [20, 40], [-40, 0], [40, 0], [-20, -44], [20, -44]]) torch(ctx, x, z)
  for (const c of [0x8a2a2a, 0x2a3a8a]) placeProp(ctx, P.bannerPost(c), c === 0x8a2a2a ? -8 : 8, 46, 0, { reserve: 0.5, dynamic: true })
  // Outside: village remains, trees, path
  scatter(ctx, 8, 6, (r, i) => P.house({ w: r.range(6, 8), d: 6, ruined: true, seed: 20 + i }), { minR: 75 })
  scatter(ctx, 70, 1.3, (r, i) => P.tree(r.chance(0.6) ? "pine" : "dead", r.range(0.8, 1.4), i), { minR: 70 })
  scatter(ctx, 12, 1.0, (r, i) => P.rock(r.range(0.7, 1.6), i), { minR: 70 })
  // Containers
  for (let i = 0; i < 14; i++) {
    const x = rng.range(-50, 50)
    const z = rng.range(-50, 50)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["crate", "barrel", "corpse", "sack", "chest"]), x, z, rng.range(0, 6))
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-140, 140)
    const z = rng.range(-140, 140)
    if (Math.max(Math.abs(x), Math.abs(z)) > 70 && isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["corpse", "crate", "woodpile"]), x, z, rng.range(0, 6))
  }
  addContainer(ctx, "chest", -40, -40, 0, { secret: true })
  addContainer(ctx, "scrap", 44, 44)
  // Boss in the courtyard before the keep
  ctx.reserved.push({ x: ctx.area.bossX!, z: ctx.area.bossZ!, r: 10 })
}

function buildGraveyard(ctx: Ctx): void {
  const rng = ctx.rng
  // Low wall with gate (extraction) at +Z
  const W = 190
  const half = W / 2
  placeProp(ctx, P.wall(W, 2.2, 0.8, { crenels: false }), 0, -half, 0)
  placeProp(ctx, P.wall(W, 2.2, 0.8, { crenels: false }), -half, 0, Math.PI / 2)
  placeProp(ctx, P.wall(W, 2.2, 0.8, { crenels: false }), half, 0, Math.PI / 2)
  placeProp(ctx, P.wall(half - 5, 2.2, 0.8, { crenels: false }), -half / 2 - 2.5, half, 0)
  placeProp(ctx, P.wall(half - 5, 2.2, 0.8, { crenels: false }), half / 2 + 2.5, half, 0)
  // Chapel, mausoleums, ossuary
  placeProp(ctx, P.church({ w: 9, d: 16, ruined: true, towerH: 11 }), -60, -40, Math.PI / 2, { reserve: 13 })
  poi(ctx, "chapel", "Friedhofskapelle", -60, -40)
  const royal = P.mausoleum(1)
  placeProp(ctx, royal, 0, -40, 0, { reserve: 6 })
  poi(ctx, "royal", "Mausoleum der Königsfamilie", 0, -36)
  // Back corner of the mausoleum: the centre lane between door and sarcophagus must stay open
  ctx.keyChests.push(addContainer(ctx, "chest", -1.7, -42, 0, { secret: true, fixed: [{ id: "torch_item", qty: 2 }, { id: "gravedigger_ledger", qty: 1 }] }))
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-90, 90)
    const z = rng.range(-90, 60)
    if (Math.hypot(x, z + 40) < 14) continue
    if (isFree(ctx, x, z, 5)) placeProp(ctx, P.mausoleum(i + 2), x, z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), { reserve: 5 })
  }
  placeProp(ctx, P.ruin(12, 9, 4, 9), 70, 30, 0.2, { reserve: 9 })
  poi(ctx, "ossuary", "Das Beinhaus", 70, 30)
  poi(ctx, "fog", "Pestgrube im Nebel", -40, 50)
  poi(ctx, "gate", "Friedhofstor", 0, 85)
  addContainer(ctx, "chest", 70, 30, 0, { secret: true, fixed: [{ id: "saint_bones", qty: 1 }] })
  for (let i = 0; i < 5; i++) addContainer(ctx, "bones", 70 + rng.range(-8, 8), 30 + rng.range(-6, 6), rng.range(0, 6))
  // Rows of graves
  for (let row = -80; row <= 70; row += 9) {
    for (let col = -85; col <= 85; col += 4.5) {
      if (rng.chance(0.22)) continue
      const x = col + rng.range(-0.8, 0.8)
      const z = row + rng.range(-0.8, 0.8)
      if (!isFree(ctx, x, z, 0.8)) continue
      placeProp(ctx, P.gravestone(rng.chance(0.8) ? 0 : rng.chance(0.6) ? 1 : 2, Math.round(x * 7 + z)), x, z, rng.range(-0.2, 0.2) + (rng.chance(0.5) ? 0 : Math.PI), { reserve: 0.6 })
    }
  }
  // Dead trees, fog zones, gallows at the back
  scatter(ctx, 40, 1.2, (r, i) => P.tree("dead", r.range(0.8, 1.4), i), { minR: 10 })
  scatter(ctx, 20, 0.6, (r, i) => P.bush(r.range(0.6, 1.0), i, true))
  plagueZone(ctx, -40, 50, 10)
  plagueZone(ctx, 50, -80, 9)
  placeProp(ctx, P.gallows(), ctx.area.bossX! + 6, ctx.area.bossZ! - 6, 0.2, { reserve: 2.5 })
  poi(ctx, "pit", "Die Massengrube", ctx.area.bossX!, ctx.area.bossZ!)
  ctx.reserved.push({ x: ctx.area.bossX!, z: ctx.area.bossZ!, r: 10 })
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-90, 90)
    const z = rng.range(-90, 90)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["corpse", "bones", "sack", "crate"]), x, z, rng.range(0, 6))
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-90, 90)
    const z = rng.range(-90, 90)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, "herb", x, z)
  }
  for (const [x, z] of [[-20, 90], [20, 90], [-60, 0], [60, 0], [0, 20]]) torch(ctx, x, z)
  scatter(ctx, 40, 1.3, (r, i) => P.tree(r.chance(0.5) ? "dead" : "pine", r.range(0.9, 1.4), i), { minR: 100 })
}

function buildMonastery(ctx: Ctx): void {
  const rng = ctx.rng
  // Cloister square
  const S = 60
  const half = S / 2
  for (const [x, z, yaw] of [[0, -half, 0], [0, half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2]] as [number, number, number][]) {
    placeProp(ctx, P.wall(S, 4, 1, { crenels: false, ruined: yaw === 0 && z > 0 ? 3 : undefined }), x, z, yaw)
  }
  placeProp(ctx, P.church({ w: 11, d: 24, towerH: 20 }), 0, -half - 16, 0, { reserve: 18 })
  poi(ctx, "church", "Klosterkirche", 0, -half - 10)
  placeProp(ctx, P.altar(), 0, -half - 14 - 8, 0, { reserve: 1.5, dynamic: false })
  placeProp(ctx, P.house({ w: 9, d: 7, stone: true, tall: true, seed: 31 }), -half - 8, -10, Math.PI / 2, { reserve: 8 })
  poi(ctx, "library", "Die Bibliothek", -half - 8, -10)
  ctx.keyChests.push(addContainer(ctx, "chest", -half - 8 + 2, -10 - 2.5, 0, { secret: true, fixed: [{ id: "abbot_journal", qty: 1 }, { id: "book", qty: 2 }] }))
  placeProp(ctx, P.house({ w: 12, d: 7, stone: true, seed: 32 }), half + 8, -10, -Math.PI / 2, { reserve: 9 })
  poi(ctx, "dormitory", "Dormitorium", half + 8, -10)
  placeProp(ctx, P.house({ w: 12, d: 7, stone: true, seed: 33 }), half + 8, 12, -Math.PI / 2, { reserve: 9 })
  poi(ctx, "refectory", "Refektorium", half + 8, 12)
  addContainer(ctx, "chest", half + 8 + 3, 12 + 1, 0, { secret: true })
  // Herb garden in the centre
  placeProp(ctx, P.well(), 0, 0, 0, { reserve: 2.5 })
  poi(ctx, "garden", "Kräutergarten", 0, 6)
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-20, 20)
    const z = rng.range(-20, 20)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, "herb", x, z)
  }
  for (let i = 0; i < 6; i++) placeProp(ctx, P.fence(6), -18 + i * 7.2, 22, 0, { reserve: 1 })
  // Lake with boat
  addWater(ctx, 130, 110, 110, 110)
  placeProp(ctx, P.house({ w: 6, d: 5, roof: "thatch", seed: 34 }), 100, 70, 2.2, { reserve: 6 })
  poi(ctx, "boathouse", "Bootshaus", 100, 70)
  ctx.keyChests.push(addContainer(ctx, "chest", 104, 72, 0, { secret: true, fixed: [{ id: "oar", qty: 1 }] }))
  // Orchard and surroundings
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) placeProp(ctx, P.tree("oak", 0.8, r * 6 + c), -110 + c * 9, 40 + r * 9, rng.range(0, 6), { reserve: 1.5 })
  poi(ctx, "orchard", "Obstgarten", -85, 60)
  scatter(ctx, 60, 1.3, (r, i) => P.tree(r.chance(0.5) ? "pine" : "birch", r.range(0.9, 1.4), i), { minR: 60 })
  scatter(ctx, 20, 0.6, (r, i) => P.bush(r.range(0.6, 1.1), i))
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-120, 120)
    const z = rng.range(-120, 120)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["corpse", "sack", "crate", "barrel"]), x, z, rng.range(0, 6))
  }
  for (const [x, z] of [[-10, -half + 4], [10, -half + 4], [-half + 4, 10], [half - 4, 10], [0, half + 8]]) torch(ctx, x, z)
  ctx.reserved.push({ x: ctx.area.bossX!, z: ctx.area.bossZ!, r: 8 })
}

function buildCatacombs(ctx: Ctx): void {
  const rng = ctx.rng
  // Maze of corridors on a 13x13 cell grid, 20 m per cell, walls as dark stone.
  const N = 13
  const CELL = 20
  const size = (N * CELL) / 2
  const visited = new Uint8Array(N * N)
  const wallsH = new Uint8Array(N * (N + 1)).fill(1) // wall between (i,j) and (i,j+1): index j*N + i ... use (j+1) rows
  const wallsV = new Uint8Array((N + 1) * N).fill(1) // wall between (i,j) and (i+1,j)
  const stack: [number, number][] = [[0, N - 1]]
  visited[(N - 1) * N] = 1
  while (stack.length) {
    const [i, j] = stack[stack.length - 1]
    const opts: [number, number][] = []
    if (i > 0 && !visited[j * N + i - 1]) opts.push([i - 1, j])
    if (i < N - 1 && !visited[j * N + i + 1]) opts.push([i + 1, j])
    if (j > 0 && !visited[(j - 1) * N + i]) opts.push([i, j - 1])
    if (j < N - 1 && !visited[(j + 1) * N + i]) opts.push([i, j + 1])
    if (!opts.length) {
      stack.pop()
      continue
    }
    const [ni, nj] = rng.pick(opts)
    visited[nj * N + ni] = 1
    if (ni !== i) wallsV[j * (N + 1) + Math.max(i, ni)] = 0
    else wallsH[Math.max(j, nj) * N + i] = 0
    stack.push([ni, nj])
  }
  // Extra openings for loops and chambers
  for (let k = 0; k < 40; k++) {
    if (rng.chance(0.5)) wallsV[rng.int(0, N - 1) * (N + 1) + rng.int(1, N - 1)] = 0
    else wallsH[rng.int(1, N - 1) * N + rng.int(0, N - 1)] = 0
  }
  // Big chambers: the boss hall at the boss position and a treasure hall.
  const chamber = (ci: number, cj: number, r: number) => {
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i > ci - r && i >= 0 && i < N) wallsV[j * (N + 1) + i] = 0
      if (j > cj - r && j >= 0 && j < N) wallsH[j * N + i] = 0
    }
  }
  const toCell = (x: number) => Math.max(0, Math.min(N - 1, Math.floor((x + size) / CELL)))
  chamber(toCell(ctx.area.bossX!), toCell(ctx.area.bossZ!), 1)
  chamber(toCell(40), toCell(40), 1)
  chamber(toCell(-60), toCell(-30), 1)
  // Build walls
  const H = 5
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i < N; i++) {
      if (!wallsH[j * N + i]) continue
      const x = -size + (i + 0.5) * CELL
      const z = -size + j * CELL
      placeProp(ctx, P.wall(CELL + 1, H, 1.2, { crenels: false, dark: true }), x, z, 0)
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i <= N; i++) {
      if (!wallsV[j * (N + 1) + i]) continue
      const x = -size + i * CELL
      const z = -size + (j + 0.5) * CELL
      placeProp(ctx, P.wall(CELL + 1, H, 1.2, { crenels: false, dark: true }), x, z, Math.PI / 2)
    }
  }
  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(size * 2 + 40, size * 2 + 40), mat("stone_dark", { color: 0x5a5a66, repeat: 40 }))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = H
  ceiling.receiveShadow = false
  ceiling.userData.dynamic = true
  ctx.root.add(ceiling)
  // Columns, sarcophagi, bones, torches in random cells
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cx = -size + (i + 0.5) * CELL
      const cz = -size + (j + 0.5) * CELL
      const roll = rng.next()
      if (roll < 0.25) placeProp(ctx, P.column(H, true), cx + rng.range(-5, 5), cz + rng.range(-5, 5), 0, { reserve: 1 })
      if (roll > 0.3 && roll < 0.55) placeProp(ctx, P.sarcophagus(i * 17 + j), cx + rng.range(-5, 5), cz + rng.range(-5, 5), rng.pick([0, Math.PI / 2]), { reserve: 2 })
      if (roll > 0.5 && roll < 0.7) addContainer(ctx, "bones", cx + rng.range(-6, 6), cz + rng.range(-6, 6), rng.range(0, 6))
      if (rng.chance(0.3)) torch(ctx, cx + rng.range(-7, 7), cz + rng.range(-7, 7))
      if (rng.chance(0.18)) addContainer(ctx, rng.pick(["corpse", "crate", "chest", "sack"]), cx + rng.range(-6, 6), cz + rng.range(-6, 6), rng.range(0, 6))
    }
  }
  poi(ctx, "throne", "Thronsaal des Knochenfürsten", ctx.area.bossX!, ctx.area.bossZ!)
  poi(ctx, "treasury", "Verborgene Schatzkammer", 40, 40)
  poi(ctx, "wellroom", "Brunnenkammer", -60, -30)
  poi(ctx, "ossuary", "Großes Beinhaus", 0, 0)
  poi(ctx, "stairs", "Treppe zur Oberwelt", -120, 120)
  poi(ctx, "crypt", "Alte Gruft", 0, -110)
  ctx.keyChests.push(addContainer(ctx, "chest", 40, 40, 0, { secret: true, fixed: [{ id: "crypt_key", qty: 1 }, { id: "catacomb_inscription", qty: 1 }], bonusRolls: 2 }))
  addContainer(ctx, "chest", -60, -30, 0, { secret: true })
  for (let k = 0; k < 10; k++) addContainer(ctx, "bones", rng.range(-120, 120), rng.range(-120, 120), rng.range(0, 6))
  // Torches around spawn and boss
  for (const [x, z] of [[ctx.area.spawnX + 4, ctx.area.spawnZ], [ctx.area.spawnX - 4, ctx.area.spawnZ], [ctx.area.bossX! + 6, ctx.area.bossZ!], [ctx.area.bossX! - 6, ctx.area.bossZ!]]) torch(ctx, x, z)
  ctx.reserved.push({ x: ctx.area.bossX!, z: ctx.area.bossZ!, r: 8 })
}

function buildCity(ctx: Ctx): void {
  const rng = ctx.rng
  const W = 300
  const half = W / 2
  // City wall with gate (+Z) and harbour opening at +X
  placeProp(ctx, P.wall(W, 7, 1.8), 0, -half, 0)
  placeProp(ctx, P.wall(W, 7, 1.8), -half, 0, Math.PI / 2)
  placeProp(ctx, P.wall(half - 20, 7, 1.8), half, -half / 2 - 10, Math.PI / 2)
  placeProp(ctx, P.wall(half - 20, 7, 1.8), half, half / 2 + 10, Math.PI / 2)
  placeProp(ctx, P.wall(half - 6, 7, 1.8), -half / 2 - 3, half, 0)
  placeProp(ctx, P.wall(half - 6, 7, 1.8), half / 2 + 3, half, 0)
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) placeProp(ctx, P.tower(4, 12), x, z, 0, { reserve: 5 })
  // Street grid: blocks of 26 m with 8 m streets; the market square in the centre
  let n = 0
  for (let bx = -120; bx <= 120; bx += 34) {
    for (let bz = -120; bz <= 120; bz += 34) {
      if (Math.abs(bx) < 40 && Math.abs(bz) < 40) continue // market square
      if (Math.hypot(bx - ctx.area.spawnX, bz - ctx.area.spawnZ) < 30) continue
      // Four houses per block facing outward
      const offs: [number, number, number][] = [[0, -12, 0], [0, 12, Math.PI], [-12, 0, Math.PI / 2], [12, 0, -Math.PI / 2]]
      for (const [ox, oz, yaw] of offs) {
        if (rng.chance(0.15)) continue
        const x = bx + ox
        const z = bz + oz
        const tall = rng.chance(0.6)
        const h = P.house({ w: rng.range(7, 9), d: rng.range(5, 7), stone: rng.chance(0.5), tall, ruined: rng.chance(0.2), seed: n++ })
        if (isFree(ctx, x, z, 4.5)) placeProp(ctx, h, x, z, yaw, { reserve: 5 })
      }
    }
  }
  // Cathedral on the square, market stalls, fountain
  placeProp(ctx, P.church({ w: 14, d: 30, towerH: 26 }), 0, -70, 0, { reserve: 22 })
  poi(ctx, "cathedral", "Kathedrale", 0, -55)
  // In front of the altar (the altar block itself is solid)
  ctx.keyChests.push(addContainer(ctx, "chest", -2.2, -81.5, 0, { secret: true, fixed: [{ id: "gate_key", qty: 1 }, { id: "lost_letter", qty: 1 }], bonusRolls: 2 }))
  placeProp(ctx, P.well(), 0, 0, 0, { reserve: 3 })
  poi(ctx, "market", "Marktplatz", 0, 8)
  for (let i = 0; i < 8; i++) placeProp(ctx, P.marketStall(i), -24 + (i % 4) * 14, i < 4 ? 20 : -20, i < 4 ? 0 : Math.PI, { reserve: 2.2 })
  placeProp(ctx, P.gallows(), 24, 0, 0.2, { reserve: 2.5 })
  placeProp(ctx, P.statue(2), -24, 0, 0, { reserve: 1.5 })
  // Goldsmith (rich quarter) and harbour
  placeProp(ctx, P.house({ w: 9, d: 8, stone: true, tall: true, seed: 99 }), -110, -110, 0.78, { reserve: 7 })
  poi(ctx, "goldsmith", "Haus des Goldschmieds", -110, -110)
  addContainer(ctx, "chest", -108, -106, 0.78, { secret: true, fixed: [{ id: "jewel_box", qty: 2 }] })
  addWater(ctx, 200, -100, 100, 160)
  placeProp(ctx, P.dock(14), 158, -60, Math.PI / 2, { reserve: 2, sink: 0.3 })
  placeProp(ctx, P.house({ w: 8, d: 6, roof: "thatch", seed: 100 }), 135, -60, -Math.PI / 2, { reserve: 7 })
  poi(ctx, "harbour", "Der Hafen", 150, -80)
  poi(ctx, "gallows", "Galgenplatz", 24, 0)
  poi(ctx, "gate", "Stadttor", 0, 150)
  ctx.keyChests.push(addContainer(ctx, "chest", 138, -56, 0, { secret: true, fixed: [{ id: "oar", qty: 1 }] }))
  // Torches along the main streets
  for (let i = -4; i <= 4; i++) {
    torch(ctx, i * 34 + 17, 4)
    torch(ctx, 4, i * 34 + 17)
  }
  for (let i = 0; i < 24; i++) {
    const x = rng.range(-150, 150)
    const z = rng.range(-150, 150)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["crate", "barrel", "corpse", "sack", "chest", "scrap"]), x, z, rng.range(0, 6))
  }
  scatter(ctx, 12, 0.6, () => P.barrel(), { minR: 30 })
  scatter(ctx, 10, 0.6, () => P.crate(0.8), { minR: 30 })
  scatter(ctx, 10, 1.2, (r, i) => P.tree("oak", r.range(0.7, 1), i), { minR: 30 })
  ctx.reserved.push({ x: 0, z: 0, r: 8 })
}

function buildFortress(ctx: Ctx): void {
  const rng = ctx.rng
  const W = 240
  const half = W / 2
  // Outer walls with gate at +Z, inner wall dividing the parade ground from the command quarter
  placeProp(ctx, P.wall(W, 9, 2.4), 0, -half, 0)
  placeProp(ctx, P.wall(W, 9, 2.4), -half, 0, Math.PI / 2)
  placeProp(ctx, P.wall(W, 9, 2.4), half, 0, Math.PI / 2)
  placeProp(ctx, P.wall(half - 6, 9, 2.4), -half / 2 - 3, half, 0)
  placeProp(ctx, P.wall(half - 6, 9, 2.4), half / 2 + 3, half, 0)
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half], [0, -half], [-half, 0], [half, 0]]) placeProp(ctx, P.tower(4.5, 14), x, z, 0, { reserve: 5.5 })
  placeProp(ctx, P.wall(80, 6, 1.6), -80, -20, 0)
  placeProp(ctx, P.wall(80, 6, 1.6), 80, -20, 0)
  // Barracks rows
  let n = 0
  for (let i = 0; i < 4; i++) {
    placeProp(ctx, P.house({ w: 14, d: 7, stone: true, seed: n++ }), -80 + i * 26, 60, 0, { reserve: 9 })
    placeProp(ctx, P.house({ w: 14, d: 7, stone: true, seed: n++, ruined: rng.chance(0.3) }), -80 + i * 26, 90, Math.PI, { reserve: 9 })
  }
  poi(ctx, "barracks", "Mannschaftsquartiere", -40, 75)
  placeProp(ctx, P.barn(5), 90, 70, -Math.PI / 2, { reserve: 9 })
  poi(ctx, "stables", "Stallungen", 90, 70)
  // Armoury, forge, command keep
  placeProp(ctx, P.house({ w: 16, d: 10, stone: true, tall: true, seed: 50 }), -70, -60, 0, { reserve: 12 })
  poi(ctx, "armory", "Arsenal des Marschalls", -70, -60)
  ctx.keyChests.push(addContainer(ctx, "chest", -66, -57, 0, { secret: true, bonusRolls: 3, fixed: [{ id: "crypt_key", qty: 1 }] }))
  addContainer(ctx, "scrap", -60, -50)
  addContainer(ctx, "scrap", -78, -52)
  placeProp(ctx, P.anvilStand(), 70, -60, 0, { reserve: 1 })
  placeProp(ctx, P.house({ w: 10, d: 8, stone: true, seed: 51 }), 80, -66, Math.PI, { reserve: 8 })
  poi(ctx, "forge", "Festungsschmiede", 70, -60)
  placeProp(ctx, P.house({ w: 20, d: 14, h: 10, stone: true, tall: true, seed: 52 }), 0, -95, 0, { reserve: 15 })
  placeProp(ctx, P.tower(5, 22), 14, -100, 0, { reserve: 5.5 })
  poi(ctx, "keep", "Kommandantur", 0, -86)
  addContainer(ctx, "chest", 0, -92, 0, { secret: true, bonusRolls: 3, fixed: [{ id: "soldier_diary", qty: 1 }] })
  // Parade ground: statues, banners, palisades, cages
  placeProp(ctx, P.statue(3), 0, 20, 0, { reserve: 1.5 })
  poi(ctx, "parade", "Exerzierplatz", 0, 20)
  for (let i = -3; i <= 3; i++) placeProp(ctx, P.bannerPost(0x2a2a5a), i * 12, 40, 0, { reserve: 0.5, dynamic: true })
  for (let i = 0; i < 4; i++) placeProp(ctx, P.palisade(10), -60 + i * 40, 10, 0.2, { reserve: 2 })
  for (let i = 0; i < 4; i++) placeProp(ctx, P.cage(), 50 + i * 4, 30, 0, { reserve: 1 })
  for (const [x, z] of [[-30, 50], [30, 50], [-30, -40], [30, -40], [-100, 0], [100, 0], [0, 100], [-60, 100], [60, 100]]) torch(ctx, x, z)
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-110, 110)
    const z = rng.range(-110, 110)
    if (isFree(ctx, x, z, 1)) addContainer(ctx, rng.pick(["crate", "barrel", "corpse", "sack", "chest", "scrap", "scrap"]), x, z, rng.range(0, 6))
  }
  scatter(ctx, 14, 0.6, () => P.barrel(), { minR: 20 })
  scatter(ctx, 14, 0.6, () => P.crate(0.9), { minR: 20 })
  scatter(ctx, 30, 1.3, (r, i) => P.tree("dead", r.range(0.8, 1.4), i), { minR: 125 })
  ctx.reserved.push({ x: ctx.area.bossX!, z: ctx.area.bossZ!, r: 10 })
}

// ---- entry point -------------------------------------------------------------------

export function buildWorld(area: AreaDef, scene: THREE.Scene): WorldBuild {
  const rng = new Rng(area.seed)
  const features: TerrainFeature[] = []
  switch (area.biome) {
    case "village":
      road(features, -140, 0, 140, 0, 7)
      road(features, 0, -140, 0, 140, 6)
      features.push({ kind: "river", x: 150, z: -160, x2: 150, z2: 160, width: 26, height: 3 })
      features.push({ kind: "flatten", x: 0, z: 0, r: 60, height: 0 })
      break
    case "forest":
      features.push({ kind: "river", x: -170, z: -158, x2: 170, z2: -158, width: 20, height: 3 })
      road(features, -140, 140, 140, 140, 5)
      break
    case "castle":
      features.push({ kind: "flatten", x: 0, z: 0, r: 80, height: 0 })
      road(features, 0, 60, 0, 160, 6)
      break
    case "graveyard":
      features.push({ kind: "flatten", x: 0, z: 0, r: 110, height: 0 })
      break
    case "monastery":
      features.push({ kind: "flatten", x: 0, z: 0, r: 50, height: 0 })
      features.push({ kind: "lake", x: 130, z: 110, r: 55, height: 3 })
      road(features, -140, 60, -30, 0, 5)
      break
    case "catacombs":
      features.push({ kind: "flatten", x: 0, z: 0, r: 400, height: 0 })
      break
    case "city":
      features.push({ kind: "flatten", x: 0, z: 0, r: 170, height: 0 })
      features.push({ kind: "lake", x: 200, z: -100, r: 70, height: 3 })
      road(features, -170, 0, 170, 0, 8)
      road(features, 0, -170, 0, 170, 8)
      break
    case "fortress":
      features.push({ kind: "flatten", x: 0, z: 0, r: 130, height: 0 })
      road(features, 0, 0, 0, 170, 8)
      break
  }
  // Spawn, boss arena and extraction points are flattened last so lakes and rivers never swallow them.
  features.push({ kind: "flatten", x: area.spawnX, z: area.spawnZ, r: 18, height: 0 })
  if (area.bossX !== undefined) features.push({ kind: "flatten", x: area.bossX, z: area.bossZ!, r: 24, height: 0 })
  for (const e of area.extractions) features.push({ kind: "flatten", x: e.x, z: e.z, r: e.kind === "boat" || e.kind === "ford" ? 22 : 12, height: e.kind === "boat" || e.kind === "ford" ? -0.4 : 0 })
  const terrain = new Terrain(area, features)
  const collision = new CollisionWorld()
  const root = new THREE.Group()
  root.name = "world"
  scene.add(root)
  root.add(terrain.mesh)
  const batcher = new StaticBatcher()
  const ctx: Ctx = { area, rng, terrain, collision, batcher, root, containers: [], spawnPoints: [], interiorSpots: [], pois: [], hazards: [], flames: [], banners: [], waters: [], reserved: [], containerCounter: 1, keyChests: [] }
  ctx.reserved.push({ x: area.spawnX, z: area.spawnZ, r: 9 })
  // Extraction points first so biome props keep clear of them
  const extractions = area.extractions.map((e) => extractionVisual(ctx, e))
  switch (area.biome) {
    case "village":
      buildVillage(ctx)
      break
    case "forest":
      buildForest(ctx)
      break
    case "castle":
      buildCastle(ctx)
      break
    case "graveyard":
      buildGraveyard(ctx)
      break
    case "monastery":
      buildMonastery(ctx)
      break
    case "catacombs":
      buildCatacombs(ctx)
      break
    case "city":
      buildCity(ctx)
      break
    case "fortress":
      buildFortress(ctx)
      break
  }
  // Generic open-ground spawn points
  for (let i = 0; i < 60; i++) {
    const x = rng.range(-area.size * 0.85, area.size * 0.85)
    const z = rng.range(-area.size * 0.85, area.size * 0.85)
    if (Math.hypot(x - area.spawnX, z - area.spawnZ) < 35) continue
    if (isFree(ctx, x, z, 1)) ctx.spawnPoints.push({ x, z })
  }
  root.traverse((o) => {
    if (o.name === "banner") ctx.banners.push(o)
  })
  const nav = new NavGrid(area.size, collision, area.biome === "catacombs" ? null : terrain, (x, z) => (area.biome === "catacombs" ? Math.max(Math.abs(x), Math.abs(z)) > 128 : false))
  // Containers nobody can reach (houses whose door got blocked by a neighbour, sealed pockets) are removed
  // before the merge; chests with fixed contents are never dropped so keys and lore stay obtainable.
  const reachable = nav.reachableMask(area.spawnX, area.spawnZ)
  let droppedContainers = 0
  ctx.containers = ctx.containers.filter((c) => {
    if (ctx.keyChests.includes(c) || nav.isReachable(reachable, c.x, c.z, 2.4)) return true
    batcher.removeGroup(c.object)
    c.object.removeFromParent()
    droppedContainers++
    return false
  })
  const merged = batcher.build(root)
  const grass = buildGrass(terrain, nav, area.biome, area.seed, Math.round(area.size * area.size * 0.22))
  if (grass) root.add(grass)
  return {
    area,
    terrain,
    collision,
    nav,
    root,
    containers: ctx.containers,
    keyChests: ctx.keyChests,
    droppedContainers,
    extractions,
    spawnPoints: ctx.spawnPoints,
    interiorSpots: ctx.interiorSpots,
    pois: ctx.pois,
    hazards: ctx.hazards,
    flames: ctx.flames,
    banners: ctx.banners,
    waters: ctx.waters,
    bossArena: { x: area.bossX ?? 0, z: area.bossZ ?? 0 },
    underground: area.biome === "catacombs",
    playerSpawn: { x: area.spawnX, z: area.spawnZ },
    dispose: () => {
      disposeMeshes(merged)
      if (grass) {
        grass.geometry.dispose()
        ;(grass.material as THREE.Material).dispose()
      }
      terrain.dispose()
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      root.removeFromParent()
    },
  }
}
