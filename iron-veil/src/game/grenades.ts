/**
 * grenades.ts — thrown frag grenades: ballistic flight with bounces off the ground and boxes, 2.2 s fuse.
 * The physics step (stepGrenade) is pure and unit-tested; GrenadeSystem owns the meshes.
 */
import * as THREE from "three"
import { rayBox, type Obstacle } from "./collision"
import type { Vec3 } from "./types"

export const GRENADE_FUSE = 2.2
export const GRENADE_RADIUS = 7.5
export const GRENADE_DAMAGE = 150
const GRAVITY = 9.81
const RESTITUTION = 0.38
const FRICTION = 0.72
const SIZE = 0.07

export interface GrenadeBody { p: Vec3; v: Vec3; fuse: number; bounced: boolean }
export type ThrowableKind = "grenade" | "molotov"

/** Advances one grenade by dt; returns true when it bounced this step (for a sound). */
export function stepGrenade(g: GrenadeBody, dt: number, obstacles: readonly Obstacle[]): boolean {
  // a body that starts inside an (expanded) box is pushed out through the nearest face first
  for (const o of obstacles) {
    const minX = o.minX - SIZE, maxX = o.maxX + SIZE, minY = (o.minY ?? 0) - SIZE, maxY = o.height + SIZE, minZ = o.minZ - SIZE, maxZ = o.maxZ + SIZE
    if (g.p.x <= minX || g.p.x >= maxX || g.p.y <= minY || g.p.y >= maxY || g.p.z <= minZ || g.p.z >= maxZ) continue
    const d = [g.p.x - minX, maxX - g.p.x, g.p.z - minZ, maxZ - g.p.z, maxY - g.p.y]
    const m = d.indexOf(Math.min(...d))
    if (m === 0) { g.p.x = minX - 0.01; g.v.x = -Math.abs(g.v.x) * RESTITUTION } else if (m === 1) { g.p.x = maxX + 0.01; g.v.x = Math.abs(g.v.x) * RESTITUTION }
    else if (m === 2) { g.p.z = minZ - 0.01; g.v.z = -Math.abs(g.v.z) * RESTITUTION } else if (m === 3) { g.p.z = maxZ + 0.01; g.v.z = Math.abs(g.v.z) * RESTITUTION }
    else { g.p.y = maxY + 0.01; g.v.y = Math.abs(g.v.y) * RESTITUTION }
  }
  g.v.y -= GRAVITY * dt
  const len = Math.hypot(g.v.x, g.v.y, g.v.z) * dt
  let bounced = false
  if (len > 1e-6) {
    const dir = { x: g.v.x * dt / len, y: g.v.y * dt / len, z: g.v.z * dt / len }
    let hitT = Infinity, normal: Vec3 | null = null
    for (const o of obstacles) {
      const t = rayBox(g.p, dir, o.minX - SIZE, (o.minY ?? 0) - SIZE, o.minZ - SIZE, o.maxX + SIZE, o.height + SIZE, o.maxZ + SIZE, len)
      if (t !== null && t < hitT && t > 1e-5) {
        hitT = t
        const x = g.p.x + dir.x * t, y = g.p.y + dir.y * t, z = g.p.z + dir.z * t
        const d = [Math.abs(x - (o.minX - SIZE)), Math.abs(x - (o.maxX + SIZE)), Math.abs(y - (o.height + SIZE)), Math.abs(y - ((o.minY ?? 0) - SIZE)), Math.abs(z - (o.minZ - SIZE)), Math.abs(z - (o.maxZ + SIZE))]
        const m = d.indexOf(Math.min(...d))
        normal = [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }][m]
      }
    }
    if (normal) {
      g.p.x += dir.x * hitT; g.p.y += dir.y * hitT; g.p.z += dir.z * hitT
      const vn = g.v.x * normal.x + g.v.y * normal.y + g.v.z * normal.z
      g.v.x = (g.v.x - 2 * vn * normal.x) * (normal.y ? FRICTION : RESTITUTION + 0.2)
      g.v.y = (g.v.y - 2 * vn * normal.y) * (normal.y ? RESTITUTION : 1)
      g.v.z = (g.v.z - 2 * vn * normal.z) * (normal.y ? FRICTION : RESTITUTION + 0.2)
      g.p.x += normal.x * 0.01; g.p.y += normal.y * 0.01; g.p.z += normal.z * 0.01
      bounced = Math.abs(vn) > 1
    } else { g.p.x += g.v.x * dt; g.p.y += g.v.y * dt; g.p.z += g.v.z * dt }
  }
  if (g.p.y < SIZE) {
    g.p.y = SIZE
    if (g.v.y < 0) { bounced = bounced || g.v.y < -1.5; g.v.y = -g.v.y * RESTITUTION; g.v.x *= FRICTION; g.v.z *= FRICTION; if (Math.abs(g.v.y) < 0.4) g.v.y = 0 }
    // rolling friction
    g.v.x *= Math.max(0, 1 - dt * 2.5); g.v.z *= Math.max(0, 1 - dt * 2.5)
  }
  g.fuse -= dt
  if (bounced) g.bounced = true
  return bounced
}

const geo = new THREE.SphereGeometry(SIZE, 10, 8)
const capGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8)
const mat = new THREE.MeshStandardMaterial({ color: 0x3d4a32, roughness: 0.7, metalness: 0.3 })
const capMat = new THREE.MeshStandardMaterial({ color: 0x8b9095, roughness: 0.4, metalness: 0.8 })
const bottleGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8)
const bottleMat = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 })
const ragMat = new THREE.MeshBasicMaterial({ color: 0xffa040 })

export interface GrenadeEvents { bounce(p: Vec3): void; explode(p: Vec3): void; ignite(p: Vec3): void }

export class GrenadeSystem {
  private live: { body: GrenadeBody; mesh: THREE.Group; kind: ThrowableKind }[] = []
  constructor(private parent: THREE.Object3D, private events: GrenadeEvents) {}

  throw(origin: Vec3, dir: Vec3, inherit: Vec3, kind: ThrowableKind = "grenade"): void {
    const mesh = new THREE.Group()
    if (kind === "grenade") {
      const ball = new THREE.Mesh(geo, mat); ball.castShadow = true; mesh.add(ball)
      const cap = new THREE.Mesh(capGeo, capMat); cap.position.y = SIZE; mesh.add(cap)
    } else {
      const bottle = new THREE.Mesh(bottleGeo, bottleMat); mesh.add(bottle)
      const rag = new THREE.Mesh(capGeo, ragMat); rag.position.y = 0.13; mesh.add(rag)
    }
    mesh.position.set(origin.x, origin.y, origin.z); this.parent.add(mesh)
    const speed = kind === "molotov" ? 13 : 15
    this.live.push({ body: { p: { ...origin }, v: { x: dir.x * speed + inherit.x, y: dir.y * speed + 3.2 + inherit.y, z: dir.z * speed + inherit.z }, fuse: kind === "molotov" ? 4 : GRENADE_FUSE, bounced: false }, mesh, kind })
  }

  /** obstacles: candidates near the throwables (the raid passes a spatial query). */
  update(dt: number, obstaclesNear: (x: number, z: number) => readonly Obstacle[]): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i]
      const bounced = stepGrenade(g.body, dt, obstaclesNear(g.body.p.x, g.body.p.z))
      if (bounced && g.kind === "grenade") this.events.bounce(g.body.p)
      g.mesh.position.set(g.body.p.x, g.body.p.y, g.body.p.z)
      g.mesh.rotation.x += dt * Math.hypot(g.body.v.x, g.body.v.z) * 3
      // a molotov bursts on the first hard impact
      if (g.kind === "molotov" && (g.body.bounced || g.body.fuse <= 0)) { this.parent.remove(g.mesh); this.live.splice(i, 1); this.events.ignite(g.body.p); continue }
      if (g.kind === "grenade" && g.body.fuse <= 0) { this.parent.remove(g.mesh); this.live.splice(i, 1); this.events.explode(g.body.p) }
    }
  }

  get count(): number { return this.live.length }
  clear(): void { for (const g of this.live) this.parent.remove(g.mesh); this.live = [] }
}
