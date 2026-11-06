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
      // Enemy hits: the skull first (headshot), then the torso (see Zombie.projectileHit)
      let hitEnemy = false
      for (const z of ctx.zombies) {
        if (z.dead) continue
        const where = z.projectileHit(p.pos, next)
        if (!where) continue
        // Where the shaft would sit, taken before the hit: the knockback in takeHit moves the zombie's position
        // but not its bones until its next update. The skull centre, the chest, or the back of a crawler.
        const dir = _d.copy(p.vel).normalize()
        const anchor = where === "head" ? z.headCentre(_a) : z.crawling ? closestOnSegmentToLine(z.humanoid.bones.hips.getWorldPosition(_a), z.humanoid.bones.chest.getWorldPosition(_b), p.pos, dir, _a) : z.humanoid.bones.chest.getWorldPosition(_a)
        // Projection on the whole flight line (independent of the frame step) and how far the shot passes from it
        const along = _c.copy(anchor).sub(p.pos).dot(dir)
        _c.copy(p.pos).addScaledVector(dir, along)
        const miss = _c.distanceTo(anchor)
        // A headshot hurts far more; a bolt (or a critical arrow) bursts the skull when it kills
        const zone = where === "body" ? "body" : p.ammoId === "bolt" || p.crit ? "headBurst" : "head"
        const damage = where === "head" ? Math.round(p.damage * HEADSHOT) : p.damage
        z.takeHit(damage, p.crit || where === "head", p.impact * (where === "head" ? 1.5 : 1), false, p.pos.x, p.pos.z, p.lifeOnHit, false, zone)
        // The shaft stays in the body with its tip a little past the line's closest point to the anchor; grazing
        // shots and arrows in a head that is gone fall away
        const limit = (where === "head" ? 0.14 : z.crawling ? 0.3 : 0.24) * z.type.scale
        if (miss <= limit && !(where === "head" && z.headGone)) {
          const len = p.ammoId === "arrow" ? 0.75 : 0.45
          // The tip sits len/2 + 0.07 in front of the mesh origin
          p.mesh.position.copy(_c).addScaledVector(dir, 0.1 - len / 2 - 0.07)
          p.mesh.lookAt(_b.copy(p.mesh.position).add(dir))
          z.embed(p.mesh, zone)
          this.list.splice(i, 1)
        } else this.remove(i)
        hitEnemy = true
        break
      }
      if (hitEnemy) {
        ctx.audio.play("arrow_hit", { x: next.x, y: next.y, z: next.z })
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

/** Damage factor of a shot to the head. */
const HEADSHOT = 1.75
const _d = new THREE.Vector3()
const _c = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** Point of segment a-b closest to the line through p along the unit vector d, written to out (may alias a). */
function closestOnSegmentToLine(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const wx = a.x - p.x
  const wy = a.y - p.y
  const wz = a.z - p.z
  const uu = ux * ux + uy * uy + uz * uz
  const ud = ux * d.x + uy * d.y + uz * d.z
  const uw = ux * wx + uy * wy + uz * wz
  const dw = d.x * wx + d.y * wy + d.z * wz
  const denom = uu - ud * ud
  const s = denom > 1e-9 ? Math.max(0, Math.min(1, (ud * dw - uw) / denom)) : 0
  return out.set(a.x + ux * s, a.y + uy * s, a.z + uz * s)
}

