/**
 * grenades.ts — throwables: frag grenade (2.2 s fuse), molotov (bursts on impact), smoke canister, flashbang and noise
 * decoy; ballistic flight with bounces off the ground and boxes.
 * The physics step (stepGrenade) is pure and unit-tested; GrenadeSystem owns the meshes.
 */
import * as THREE from "three"
import { rayBox, type Obstacle } from "./collision"
import { buildHandItem } from "./weaponModels"
import type { Vec3 } from "./types"

export const GRENADE_FUSE = 2.2
export const GRENADE_RADIUS = 7.5
export const GRENADE_DAMAGE = 150
const GRAVITY = 9.81
const RESTITUTION = 0.38
const FRICTION = 0.72
const SIZE = 0.07

export interface GrenadeBody { p: Vec3; v: Vec3; fuse: number; bounced: boolean }
export type ThrowableKind = "grenade" | "molotov" | "smoke" | "flashbang" | "decoy" | "shocktrap"
/** Cycle order of the throwables (key 4 / HUD). */
export const THROWABLES: readonly ThrowableKind[] = ["grenade", "molotov", "smoke", "flashbang", "decoy", "shocktrap"]
/** Name, fuse (s, the molotov bursts on impact instead) and throw speed (m/s) per throwable. */
export const THROW_INFO: Record<ThrowableKind, { name: string; fuse: number; speed: number }> = {
  grenade: { name: "Splittergranate", fuse: GRENADE_FUSE, speed: 15 },
  molotov: { name: "Brandflasche", fuse: 4, speed: 13 },
  smoke: { name: "Rauchgranate", fuse: 1.6, speed: 14 },
  flashbang: { name: "Blendgranate", fuse: 1.5, speed: 15 },
  decoy: { name: "Lärmköder", fuse: 1.2, speed: 12 },
  /** Not thrown: the raid sets it down in front of the player (see traps.ts). */
  shocktrap: { name: "Schockfalle", fuse: 0, speed: 0 },
}
/** How long a smoke canister keeps hissing and how long a decoy beeps (they stay on the ground meanwhile). */
export const SMOKE_BURN = 22
export const DECOY_LIFE = 14
export const DECOY_BEEP = 0.55

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

/** Thrown models: the same frag grenade and molotov as in the hands (world look), enlarged a little for readability. */
const models: Partial<Record<ThrowableKind, THREE.Group>> = {}
function throwModel(kind: ThrowableKind): THREE.Group {
  let m = models[kind]
  if (!m) {
    m = buildHandItem(kind, "world").group; m.scale.setScalar(1.5)
    m.traverse(o => { if (o instanceof THREE.Mesh && o.name !== "flame") o.castShadow = true })
    models[kind] = m
  }
  return m.clone()
}

export interface GrenadeEvents {
  bounce(p: Vec3): void; explode(p: Vec3): void; ignite(p: Vec3): void
  /** Smoke canister starts hissing (once) / keeps hissing (every frame while it burns, for the particles). */
  smoke?(p: Vec3): void; smoking?(p: Vec3, dt: number): void
  flash?(p: Vec3): void
  /** Decoy beeps (every DECOY_BEEP seconds while it is active). */
  beep?(p: Vec3): void
}

interface Live { body: GrenadeBody; mesh: THREE.Group; kind: ThrowableKind; armed: boolean; life: number; tick: number }

export class GrenadeSystem {
  private live: Live[] = []
  constructor(private parent: THREE.Object3D, private events: GrenadeEvents) {}

  throw(origin: Vec3, dir: Vec3, inherit: Vec3, kind: ThrowableKind = "grenade"): void {
    const mesh = new THREE.Group(); mesh.add(throwModel(kind))
    mesh.position.set(origin.x, origin.y, origin.z); this.parent.add(mesh)
    const { speed, fuse } = THROW_INFO[kind]
    this.live.push({ body: { p: { ...origin }, v: { x: dir.x * speed + inherit.x, y: dir.y * speed + 3.2 + inherit.y, z: dir.z * speed + inherit.z }, fuse, bounced: false }, mesh, kind, armed: false, life: 0, tick: 0 })
  }

  /** obstacles: candidates near the throwables (the raid passes a spatial query). */
  update(dt: number, obstaclesNear: (x: number, z: number) => readonly Obstacle[]): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i]
      const bounced = stepGrenade(g.body, dt, obstaclesNear(g.body.p.x, g.body.p.z))
      if (bounced && g.kind !== "molotov") this.events.bounce(g.body.p)
      g.mesh.position.set(g.body.p.x, g.body.p.y, g.body.p.z)
      const roll = Math.hypot(g.body.v.x, g.body.v.z)
      g.mesh.rotation.x += dt * roll * 3
      if (g.kind === "molotov") { const f = g.mesh.getObjectByName("flame"); if (f) f.scale.set(1.6, 1.4 + Math.random() * 1.2, 1.6) }
      // a molotov bursts on the first hard impact
      if (g.kind === "molotov" && (g.body.bounced || g.body.fuse <= 0)) { this.remove(i); this.events.ignite(g.body.p); continue }
      if (g.kind === "grenade" && g.body.fuse <= 0) { this.remove(i); this.events.explode(g.body.p); continue }
      if (g.kind === "flashbang" && g.body.fuse <= 0) { this.remove(i); this.events.flash?.(g.body.p); continue }
      // smoke canisters and decoys stay where they land and work for a while
      if ((g.kind === "smoke" || g.kind === "decoy") && g.body.fuse <= 0) {
        if (!g.armed) { g.armed = true; g.life = g.kind === "smoke" ? SMOKE_BURN : DECOY_LIFE; if (g.kind === "smoke") this.events.smoke?.(g.body.p) }
        g.life -= dt
        if (g.kind === "smoke") this.events.smoking?.(g.body.p, dt)
        else {
          g.tick -= dt
          if (g.tick <= 0) { g.tick += DECOY_BEEP; this.events.beep?.(g.body.p) }
          const led = g.mesh.getObjectByName("led"); if (led) led.visible = g.tick > DECOY_BEEP * 0.5
        }
        if (g.life <= 0) { this.remove(i); continue }
      }
    }
  }

  private remove(i: number): void { this.parent.remove(this.live[i].mesh); this.live.splice(i, 1) }

  /** Positions of the active decoys (the raid's AI tests use them). */
  decoys(): Vec3[] { return this.live.filter(g => g.kind === "decoy" && g.armed).map(g => g.body.p) }

  /** One model of every throwable, for shader pre-compilation (add to the scene before renderer.compile, remove after). */
  prewarmGroup(): THREE.Group { const g = new THREE.Group(); for (const k of THROWABLES) g.add(throwModel(k)); return g }

  get count(): number { return this.live.length }
  clear(): void { for (const g of this.live) this.parent.remove(g.mesh); this.live = [] }
}
