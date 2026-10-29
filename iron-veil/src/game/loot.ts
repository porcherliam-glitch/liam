/**
 * loot.ts — supply crates and searchable bodies. Contents are rolled with a seeded RNG (rollCrate/rollBody are pure
 * and unit-tested); Crate/BodyLoot own their small 3D markers. Searching takes a short hold of E.
 */
import * as THREE from "three"
import type { EnemyKind, ItemId, LootStack } from "./types"

export type Rng = () => number

const CRATE_TABLES: ItemId[][] = [
  ["parts", "parts", "medical", "intel", "ammo", "medical"],
  ["intel", "medical", "electronics", "parts", "electronics", "ammo"],
  ["electronics", "relic", "intel", "electronics", "relic", "medical"],
]

/**
 * Crate contents: 1–2 valuables by tier (0..2, higher = better), plus a chance for supplies.
 * Spot tier (map) and mission tier are combined by the caller.
 */
export function rollCrate(tier: number, rng: Rng): LootStack[] {
  const t = Math.max(0, Math.min(2, Math.round(tier)))
  const table = CRATE_TABLES[t]
  const out: LootStack[] = []
  const add = (id: ItemId, qty = 1) => { const s = out.find(x => x.id === id); if (s) s.qty += qty; else out.push({ id, qty }) }
  add(table[Math.floor(rng() * table.length)])
  if (rng() < 0.35 + t * 0.15) add(table[Math.floor(rng() * table.length)])
  if (rng() < 0.3) add("ammo")
  if (rng() < 0.12) add("medkit")
  if (t >= 1 && rng() < 0.08) add("grenade")
  return out
}

/** What a fallen enemy carries. */
export function rollBody(kind: EnemyKind, missionTier: number, rng: Rng): LootStack[] {
  const out: LootStack[] = []
  if (rng() < (kind === "heavy" ? 0.7 : 0.5)) out.push({ id: "ammo", qty: 1 })
  if (rng() < (kind === "scout" ? 0.25 : 0.15)) out.push({ id: "medkit", qty: 1 })
  if (missionTier >= 1 && rng() < (kind === "heavy" ? 0.3 : 0.1)) out.push({ id: "grenade", qty: 1 })
  if (rng() < 0.3 + missionTier * 0.1) {
    const pool: ItemId[] = missionTier >= 2 ? ["intel", "electronics", "medical"] : missionTier === 1 ? ["parts", "intel", "medical"] : ["parts", "medical"]
    out.push({ id: kind === "marksman" ? "intel" : pool[Math.floor(rng() * pool.length)], qty: 1 })
  }
  return out
}

const crateGeo = { body: new THREE.BoxGeometry(1.25, 0.6, 0.85), lid: new THREE.BoxGeometry(1.28, 0.12, 0.88), band: new THREE.BoxGeometry(0.1, 0.62, 0.89), latch: new THREE.BoxGeometry(0.12, 0.1, 0.04), beacon: new THREE.OctahedronGeometry(0.1), handle: new THREE.BoxGeometry(0.06, 0.05, 0.3) }
const crateMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x3c5244, roughness: 0.7, metalness: 0.2 }),
  lid: new THREE.MeshStandardMaterial({ color: 0x2f4136, roughness: 0.6, metalness: 0.3 }),
  band: new THREE.MeshStandardMaterial({ color: 0x8fb39a, emissive: 0x1b4737, emissiveIntensity: 0.6, roughness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a9196, roughness: 0.4, metalness: 0.8 }),
  beacons: [0xd9e4dc, 0x6fe0b8, 0xffc85a].map(c => new THREE.MeshBasicMaterial({ color: c })),
}

export class Crate {
  readonly group = new THREE.Group()
  readonly position: THREE.Vector3
  searched = false
  private lid = new THREE.Group()
  private beacon: THREE.Mesh
  private open = 0

  constructor(parent: THREE.Object3D, x: number, z: number, yaw: number, readonly tier: number, readonly contents: LootStack[]) {
    this.group.position.set(x, 0, z); this.group.rotation.y = yaw; this.position = this.group.position
    const body = new THREE.Mesh(crateGeo.body, crateMats.body); body.position.y = 0.3; body.castShadow = body.receiveShadow = true; this.group.add(body)
    for (const s of [-0.42, 0.42]) { const band = new THREE.Mesh(crateGeo.band, crateMats.band); band.position.set(s, 0.31, 0); this.group.add(band) }
    for (const s of [-1, 1]) { const handle = new THREE.Mesh(crateGeo.handle, crateMats.metal); handle.position.set(s * 0.64, 0.4, 0); this.group.add(handle) }
    this.lid.position.set(0, 0.6, -0.44); this.group.add(this.lid)
    const lidMesh = new THREE.Mesh(crateGeo.lid, crateMats.lid); lidMesh.position.set(0, 0.06, 0.44); lidMesh.castShadow = true; this.lid.add(lidMesh)
    for (const s of [-0.3, 0.3]) { const latch = new THREE.Mesh(crateGeo.latch, crateMats.metal); latch.position.set(s, 0.53, 0.44); this.group.add(latch) }
    this.beacon = new THREE.Mesh(crateGeo.beacon, crateMats.beacons[Math.max(0, Math.min(2, tier))]); this.beacon.position.y = 1.2; this.group.add(this.beacon)
    parent.add(this.group)
  }

  update(dt: number, time: number): void {
    if (!this.searched) { this.beacon.position.y = 1.15 + Math.sin(time * 2 + this.group.id) * 0.1; this.beacon.rotation.y = time * 1.5 }
    else if (this.open < 1) { this.open = Math.min(1, this.open + dt * 3); this.lid.rotation.x = -this.open * 1.9 }
  }

  markSearched(): void { this.searched = true; this.beacon.visible = false }

  dispose(): void { this.group.parent?.remove(this.group) }
}

/** Invisible interactable at a corpse (the corpse itself is the soldier model). */
export class BodyLoot {
  searched = false
  constructor(readonly position: THREE.Vector3, readonly contents: LootStack[], readonly kind: EnemyKind) {}
}

export function disposeLootResources(): void {
  for (const g of Object.values(crateGeo)) g.dispose()
  crateMats.body.dispose(); crateMats.lid.dispose(); crateMats.band.dispose(); crateMats.metal.dispose(); for (const m of crateMats.beacons) m.dispose()
}
