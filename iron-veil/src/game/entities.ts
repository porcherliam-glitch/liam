import * as THREE from "three"
import { ITEMS } from "./data"
import { collides, mulberry32, segmentBlocked, type Obstacle, type World } from "./world"
import type { ItemId, LootStack } from "./types"
import type { AudioSystem } from "./audio"

export type EnemyKind = "scout" | "rifleman" | "heavy"
export type EnemyState = "patrol" | "combat" | "search"

const bodyGeo = new THREE.CapsuleGeometry(0.36, 0.78, 4, 8)
const headGeo = new THREE.SphereGeometry(0.25, 10, 8)
const limbGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2)
const gunGeo = new THREE.BoxGeometry(0.12, 0.14, 0.9)
const lootGeo = new THREE.BoxGeometry(1.25, 0.62, 0.85)
const lootLidGeo = new THREE.BoxGeometry(1.29, 0.18, 0.89)

export class Enemy {
  group = new THREE.Group()
  hitMeshes: THREE.Mesh[] = []
  alive = true
  health: number
  maxHealth: number
  state: EnemyState = "patrol"
  kind: EnemyKind
  private cooldown = 1
  private patrolTarget = new THREE.Vector3()
  private lastSeen = new THREE.Vector3()
  private searchTime = 0
  private hurtFlash = 0
  private deathTime = 0
  private bodyMaterial: THREE.MeshStandardMaterial
  private speed: number
  private vision: number
  private damage: number
  private random: () => number

  constructor(private world: World, position: THREE.Vector3, kind: EnemyKind, index: number) {
    this.kind = kind; this.maxHealth = kind === "heavy" ? 150 : kind === "scout" ? 65 : 90; this.health = this.maxHealth
    this.speed = kind === "scout" ? 3.1 : kind === "heavy" ? 1.65 : 2.15
    this.vision = kind === "scout" ? 34 : 29; this.damage = kind === "heavy" ? 16 : kind === "scout" ? 7 : 10
    this.random = mulberry32(7001 + index * 97)
    this.group.position.copy(position); this.group.position.y = 0.05
    this.patrolTarget.copy(position).add(new THREE.Vector3((this.random() - 0.5) * 12, 0, (this.random() - 0.5) * 12))
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: kind === "heavy" ? 0x5e493d : kind === "scout" ? 0x495e55 : 0x555b48, roughness: 0.88 })
    const vestMat = new THREE.MeshStandardMaterial({ color: kind === "heavy" ? 0x332f2c : 0x29332f, roughness: 0.75, metalness: 0.15 })
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x887362, roughness: 1 })
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x161b1c, roughness: 0.5, metalness: 0.7 })
    const body = new THREE.Mesh(bodyGeo, this.bodyMaterial); body.position.y = 1.15; body.castShadow = true; body.userData.enemy = this; body.userData.part = "body"; this.group.add(body); this.hitMeshes.push(body)
    const vest = new THREE.Mesh(new THREE.BoxGeometry(kind === "heavy" ? 0.9 : 0.75, 0.68, 0.48), vestMat); vest.position.set(0, 1.25, 0); this.group.add(vest)
    const head = new THREE.Mesh(headGeo, skinMat); head.position.y = 1.95; head.castShadow = true; head.userData.enemy = this; head.userData.part = "head"; this.group.add(head); this.hitMeshes.push(head)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), vestMat); helmet.position.y = 2.02; this.group.add(helmet)
    for (const side of [-1, 1]) { const leg = new THREE.Mesh(limbGeo, this.bodyMaterial); leg.position.set(side * 0.2, 0.42, 0); this.group.add(leg) }
    const gun = new THREE.Mesh(gunGeo, gunMat); gun.position.set(0.34, 1.28, -0.42); this.group.add(gun)
    const markerMat = new THREE.MeshBasicMaterial({ color: kind === "heavy" ? 0xef9b58 : 0xdf6458, transparent: true, opacity: 0.8 })
    const marker = new THREE.Mesh(new THREE.BoxGeometry(kind === "heavy" ? 0.8 : 0.55, 0.055, 0.055), markerMat); marker.position.set(0, 2.4, 0); this.group.add(marker)
    world.group.add(this.group)
  }

  hear(position: THREE.Vector3): void { if (this.alive && this.group.position.distanceTo(position) < 38) { this.state = "search"; this.lastSeen.copy(position); this.searchTime = 7 } }

  update(dt: number, player: THREE.Vector3, grace: number, onShoot: (enemy: Enemy, damage: number) => void): void {
    if (!this.alive) { this.deathTime += dt; this.group.rotation.z = Math.min(Math.PI / 2, this.deathTime * 4); return }
    this.cooldown -= dt; this.hurtFlash = Math.max(0, this.hurtFlash - dt)
    this.bodyMaterial.emissive.setHex(this.hurtFlash > 0 ? 0x7a211b : 0x000000)
    const toPlayer = _v1.copy(player).sub(this.group.position); toPlayer.y = 0
    const distance = toPlayer.length(); if (distance < 0.001) return
    toPlayer.divideScalar(distance)
    const forward = _v2.set(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y))
    const sees = grace <= 0 && distance < this.vision && forward.dot(toPlayer) > (this.state === "combat" ? -0.4 : 0.25) && !segmentBlocked(this.group.position, player, this.world.obstacles)
    if (sees) { this.state = "combat"; this.lastSeen.copy(player); this.searchTime = 6 }
    else if (this.state === "combat") { this.state = "search"; this.searchTime = 6 }

    if (this.state === "combat") {
      this.face(toPlayer, dt)
      const clear = !segmentBlocked(this.group.position, player, this.world.obstacles)
      if (distance > 15 || !clear) this.move(toPlayer, dt)
      else if (distance < 7) this.move(_v3.copy(toPlayer).multiplyScalar(-0.55), dt)
      else { const strafe = _v3.set(-toPlayer.z, 0, toPlayer.x).multiplyScalar(Math.sin(performance.now() * 0.001 + this.group.id) * 0.35); this.move(strafe, dt) }
      if (clear && distance < 31 && this.cooldown <= 0 && grace <= 0) {
        this.cooldown = this.kind === "heavy" ? 0.65 : this.kind === "scout" ? 1.15 : 0.9
        const accuracy = Math.max(0.24, 0.78 - distance * 0.014)
        onShoot(this, this.random() < accuracy ? this.damage : 0)
      }
    } else if (this.state === "search") {
      this.searchTime -= dt; const toLast = _v1.copy(this.lastSeen).sub(this.group.position); toLast.y = 0
      if (toLast.lengthSq() > 2) { toLast.normalize(); this.face(toLast, dt); this.move(toLast, dt * 0.8) }
      if (this.searchTime <= 0) this.state = "patrol"
    } else {
      const toTarget = _v1.copy(this.patrolTarget).sub(this.group.position); toTarget.y = 0
      if (toTarget.lengthSq() < 1.5) this.patrolTarget.copy(this.group.position).add(new THREE.Vector3((this.random() - 0.5) * 15, 0, (this.random() - 0.5) * 15))
      else { toTarget.normalize(); this.face(toTarget, dt); this.move(toTarget, dt * 0.55) }
    }
  }

  private face(direction: THREE.Vector3, dt: number): void { const target = Math.atan2(-direction.x, -direction.z); let delta = target - this.group.rotation.y; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); this.group.rotation.y += delta * Math.min(1, dt * 8) }
  private move(direction: THREE.Vector3, dt: number): void {
    const step = this.speed * dt, p = this.group.position
    if (!collides(p.x + direction.x * step, p.z, 0.42, this.world.obstacles)) p.x += direction.x * step
    if (!collides(p.x, p.z + direction.z * step, 0.42, this.world.obstacles)) p.z += direction.z * step
    const bob = Math.sin(performance.now() * 0.009 + this.group.id) * 0.018; p.y = 0.05 + bob
  }

  takeDamage(amount: number, headshot: boolean): boolean {
    if (!this.alive) return false
    this.health -= amount * (headshot ? 1.85 : 1); this.hurtFlash = 0.1; this.state = "combat"
    if (this.health <= 0) { this.alive = false; for (const mesh of this.hitMeshes) mesh.userData.enemy = null; return true }
    return false
  }

  muzzlePosition(target: THREE.Vector3): THREE.Vector3 { return target.copy(this.group.position).add(_v4.set(0, 1.35, 0)) }
  dispose(): void { this.bodyMaterial.dispose(); this.group.traverse(o => { if (o instanceof THREE.Mesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) if (m !== this.bodyMaterial) m.dispose() } }) }
}

export class LootCrate {
  group = new THREE.Group()
  collected = false
  value = 0
  constructor(world: World, position: THREE.Vector3, public contents: LootStack[], index: number) {
    this.group.position.copy(position); this.group.position.y = 0.35
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x344b43, roughness: 0.65, metalness: 0.25 })
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x94b89b, emissive: 0x1b4737, emissiveIntensity: 0.7, roughness: 0.5 })
    const box = new THREE.Mesh(lootGeo, baseMat); box.castShadow = true; this.group.add(box)
    const lid = new THREE.Mesh(lootLidGeo, edgeMat); lid.position.y = 0.39; this.group.add(lid)
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.86, 0.9), edgeMat); band.position.y = 0.08; this.group.add(band)
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: 0x79e5b8 })); beacon.position.y = 1.1; beacon.name = "signal"; this.group.add(beacon)
    this.value = contents.reduce((sum, s) => sum + ITEMS[s.id].value * s.qty, 0)
    this.group.rotation.y = index * 1.7; world.group.add(this.group)
  }
  update(time: number): void { if (!this.collected) { const signal = this.group.getObjectByName("signal"); if (signal) { signal.position.y = 1.05 + Math.sin(time * 2 + this.group.id) * 0.12; signal.rotation.y = time } } }
  collect(): LootStack[] { this.collected = true; this.group.visible = false; return this.contents }
  dispose(): void { this.group.traverse(o => { if (o instanceof THREE.Mesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) m.dispose() } }) }
}

export class Effects {
  private tracers: { mesh: THREE.Mesh; life: number }[] = []
  private geometry = new THREE.CylinderGeometry(0.015, 0.015, 1, 4)
  private material = new THREE.MeshBasicMaterial({ color: 0xffd889, transparent: true, opacity: 0.9 })
  constructor(private parent: THREE.Object3D) { for (let i = 0; i < 28; i++) { const mesh = new THREE.Mesh(this.geometry, this.material.clone()); mesh.visible = false; parent.add(mesh); this.tracers.push({ mesh, life: 0 }) } }
  tracer(a: THREE.Vector3, b: THREE.Vector3, enemy = false): void {
    const t = this.tracers.find(v => v.life <= 0) || this.tracers[0]; const delta = _v1.copy(b).sub(a); const length = delta.length()
    t.mesh.position.copy(a).add(b).multiplyScalar(0.5); t.mesh.scale.set(1, length, 1); t.mesh.quaternion.setFromUnitVectors(_up, delta.normalize()); t.mesh.visible = true; t.life = 0.07
    ;(t.mesh.material as THREE.MeshBasicMaterial).color.setHex(enemy ? 0xff7664 : 0xffd889)
  }
  update(dt: number): void { for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false } }
  dispose(): void { this.geometry.dispose(); this.material.dispose(); for (const t of this.tracers) (t.mesh.material as THREE.Material).dispose() }
}

export function rollLoot(index: number, missionTier: number): LootStack[] {
  const pools: ItemId[][] = [["parts", "medical", "ammo"], ["intel", "electronics", "medical"], ["electronics", "relic", "intel"]]
  const id = pools[Math.min(2, missionTier)][index % 3]
  if (id === "ammo") return [{ id, qty: 1 }]
  return [{ id, qty: 1 }, ...(index % 4 === 0 ? [{ id: "parts" as ItemId, qty: 1 }] : [])]
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
