// Third-person camera: orbit behind the player, zoom, collision with the world, lock-on framing and shake.

import * as THREE from "three"
import { clamp, damp, angleDelta, lerp } from "../core/math"
import type { CollisionWorld } from "../world/collision"
import type { Terrain } from "../world/terrain"

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera
  yaw = 0
  pitch = 0.28
  distance = 4.6
  targetDistance = 4.6
  minDistance = 1.6
  maxDistance = 9
  private shake = 0
  private shakeDir = new THREE.Vector3()
  private smoothPos = new THREE.Vector3()
  private smoothFocus = new THREE.Vector3()
  private initialised = false
  shakeEnabled = true
  /** Offset to the side so the character does not cover the view centre. */
  sideOffset = 0.45
  private lockBlend = 0

  constructor(fov: number, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1200)
  }

  setFov(fov: number): void {
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx
    this.pitch = clamp(this.pitch + dy, -0.55, 1.2)
  }

  zoom(steps: number): void {
    this.targetDistance = clamp(this.targetDistance + steps * 0.7, this.minDistance, this.maxDistance)
  }

  addShake(strength: number): void {
    if (!this.shakeEnabled) return
    this.shake = Math.min(1, this.shake + strength)
  }

  snapBehind(playerYaw: number): void {
    this.yaw = playerYaw + Math.PI
    this.initialised = false
  }

  /** Direction the camera looks on the XZ plane (unit vector). */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }
  }

  update(dt: number, player: THREE.Vector3, playerHeight: number, collision: CollisionWorld, terrain: Terrain | null, lockTarget: THREE.Vector3 | null): void {
    // Lock-on: ease the yaw toward the target.
    this.lockBlend = damp(this.lockBlend, lockTarget ? 1 : 0, 6, dt)
    if (lockTarget) {
      const wantYaw = Math.atan2(-(lockTarget.x - player.x), -(lockTarget.z - player.z))
      const d = angleDelta(this.yaw, wantYaw)
      this.yaw += d * Math.min(1, dt * 5)
      const dist = Math.hypot(lockTarget.x - player.x, lockTarget.z - player.z)
      const wantPitch = clamp(0.22 + dist * 0.008, 0.15, 0.5)
      this.pitch = damp(this.pitch, wantPitch, 3, dt)
    }
    this.distance = damp(this.distance, this.targetDistance, 8, dt)
    const focus = new THREE.Vector3(player.x, player.y + playerHeight * 0.78, player.z)
    // Side offset (over the shoulder), in camera-right direction
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    focus.addScaledVector(right, this.sideOffset * (1 - this.lockBlend * 0.5))
    if (!this.initialised) {
      this.smoothFocus.copy(focus)
      this.initialised = true
    } else {
      this.smoothFocus.x = damp(this.smoothFocus.x, focus.x, 18, dt)
      this.smoothFocus.y = damp(this.smoothFocus.y, focus.y, 10, dt)
      this.smoothFocus.z = damp(this.smoothFocus.z, focus.z, 18, dt)
    }
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
    let dist = this.distance
    const want = this.smoothFocus.clone().addScaledVector(dir, dist)
    // Collision: pull the camera in when a wall is between focus and camera.
    const hit = collision.segmentCast(this.smoothFocus.x, this.smoothFocus.y, this.smoothFocus.z, want.x, want.y, want.z, "player")
    if (hit) dist = Math.max(this.minDistance * 0.5, dist * hit.t - 0.3)
    // Terrain: never go below ground.
    if (terrain) {
      const px = this.smoothFocus.x + dir.x * dist
      const pz = this.smoothFocus.z + dir.z * dist
      const ground = terrain.heightAt(px, pz) + 0.5
      const py = this.smoothFocus.y + dir.y * dist
      if (py < ground) {
        // Raise the pitch effectively by moving the camera up
        const need = ground - py
        want.y += need
      }
    }
    const pos = this.smoothFocus.clone().addScaledVector(dir, dist)
    if (terrain) pos.y = Math.max(pos.y, terrain.heightAt(pos.x, pos.z) + 0.5)
    if (!this.smoothPos.lengthSq()) this.smoothPos.copy(pos)
    this.smoothPos.lerp(pos, 1 - Math.exp(-dt * 30))
    // Shake
    if (this.shake > 0.001) {
      this.shake = damp(this.shake, 0, 7, dt)
      this.shakeDir.set(Math.sin(performance.now() * 0.05) * this.shake * 0.12, Math.cos(performance.now() * 0.043) * this.shake * 0.1, 0)
    } else this.shakeDir.set(0, 0, 0)
    this.camera.position.copy(this.smoothPos).add(this.shakeDir)
    const lookAt = this.smoothFocus.clone()
    if (lockTarget) lookAt.lerp(new THREE.Vector3(lockTarget.x, lockTarget.y + 0.8, lockTarget.z).add(this.smoothFocus).multiplyScalar(0.5), this.lockBlend * 0.6)
    this.camera.lookAt(lookAt)
  }
}

export { lerp as _lerp }
