// Arrows and bolts: ballistic flight, hits on enemies, sticking into the world, recoverable ammo.

import * as THREE from "three"
import type { EntityContext } from "./context"
import { buildProjectile } from "../render/weaponModels"

interface Projectile {
  mesh: THREE.Group
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
  crit: boolean
  ammoId: "arrow" | "bolt"
  impact: number
  stuck: boolean
  lifeOnHit: number
}

export class Projectiles {
  private list: Projectile[] = []
  private ctx!: EntityContext

  bind(ctx: EntityContext): void {
    this.ctx = ctx
  }

  fire(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, crit: boolean, ammoId: "arrow" | "bolt", impact: number, lifeOnHit: number): void {
    const mesh = buildProjectile(ammoId)
    mesh.position.copy(origin)
    this.ctx.scene.add(mesh)
    const p: Projectile = { mesh, pos: origin.clone(), vel: dir.clone().normalize().multiplyScalar(speed), life: 5, damage, crit, ammoId, impact, stuck: false, lifeOnHit }
    this.orient(p)
    this.list.push(p)
  }

  private orient(p: Projectile): void {
    const target = p.pos.clone().add(p.vel)
    p.mesh.lookAt(target)
  }

  update(dt: number): void {
    const ctx = this.ctx
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      p.life -= dt
      if (p.stuck) {
        if (p.life <= 0) this.remove(i)
        continue
      }
      p.vel.y -= 9.81 * 0.55 * dt
      const next = p.pos.clone().addScaledVector(p.vel, dt)
      // Enemy hits: segment vs capsule-ish (sphere at chest height)
      let hitEnemy = false
      for (const z of ctx.zombies) {
        if (z.dead) continue
        const cx = z.pos.x
        const cz = z.pos.z
        const cy = z.pos.y + 1.1 * z.type.scale
        const r = 0.55 * z.type.scale
        if (segSphere(p.pos, next, cx, cy, cz, r)) {
          z.takeHit(p.damage, p.crit, p.impact, false, p.pos.x, p.pos.z, p.lifeOnHit)
          hitEnemy = true
          break
        }
      }
      if (hitEnemy) {
        ctx.audio.play("arrow_hit", { x: next.x, y: next.y, z: next.z })
        this.remove(i)
        continue
      }
      // World hits
      const hit = ctx.world.collision.segmentCast(p.pos.x, p.pos.y, p.pos.z, next.x, next.y, next.z, "player")
      const ground = ctx.world.terrain.heightAt(next.x, next.z)
      if (hit || next.y <= ground + 0.05 || p.life <= 0) {
        if (hit) {
          p.pos.lerp(next, Math.max(0, hit.t - 0.02))
        } else p.pos.copy(next)
        p.pos.y = Math.max(p.pos.y, ground + 0.05)
        p.mesh.position.copy(p.pos)
        p.stuck = true
        p.life = 12
        ctx.audio.play("arrow_hit", { x: p.pos.x, y: p.pos.y, z: p.pos.z, volume: 0.5 })
        ctx.particles.dust(p.pos.x, p.pos.y, p.pos.z, 3)
        // Half of the shots can be picked up again
        if (ctx.rng.chance(0.5)) {
          ctx.dropArrow(p.pos.x, p.pos.y, p.pos.z, p.ammoId)
          this.remove(i)
        }
        continue
      }
      p.pos.copy(next)
      p.mesh.position.copy(p.pos)
      this.orient(p)
    }
  }

  private remove(i: number): void {
    const p = this.list[i]
    p.mesh.removeFromParent()
    p.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })
    this.list.splice(i, 1)
  }

  get count(): number {
    return this.list.length
  }

  dispose(): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i)
  }
}

function segSphere(a: THREE.Vector3, b: THREE.Vector3, cx: number, cy: number, cz: number, r: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const fx = a.x - cx
  const fy = a.y - cy
  const fz = a.z - cz
  const len2 = dx * dx + dy * dy + dz * dz
  let t = len2 > 0 ? -(fx * dx + fy * dy + fz * dz) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const px = fx + dx * t
  const py = fy + dy * t
  const pz = fz + dz * t
  return px * px + py * py + pz * pz <= r * r
}
