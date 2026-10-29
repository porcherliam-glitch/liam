/**
 * ghosts.ts — other online players in the zone ("Echos"): a soldier figure with a name tag at the position their
 * page reports through room presence. Each player raids their own copy of the zone, so echoes cannot be shot and
 * do not touch the world; they only show who else is out there right now and where.
 * Positions arrive a few times a second; the figure glides toward the latest one and plays walk/run from that speed.
 */
import * as THREE from "three"
import type { OnlinePeer } from "./online"
import { acquireSoldierAssets, makeDrive, releaseSoldierAssets, SoldierModel, type SoldierAssets, type SoldierDrive, type SurvivorLook } from "./soldier"

/** Echoes farther away than this are hidden. */
const SHOW_RANGE = 160
const MAX_GHOSTS = 8
/** Name tag canvas width (height 112): the sprite keeps this aspect. */
const TAG_W = 768

interface Ghost {
  peer: string
  group: THREE.Group
  model: SoldierModel
  drive: SoldierDrive
  tag: THREE.Sprite
  label: string
  target: THREE.Vector3
  yaw: number
  seen: boolean
}

export class GhostPlayers {
  private group = new THREE.Group()
  private ghosts = new Map<string, Ghost>()
  private assets: SoldierAssets | null = null

  constructor(parent: THREE.Object3D, private night: boolean) {
    this.group.name = "Echos"
    parent.add(this.group)
  }

  get count(): number { return this.ghosts.size }

  update(dt: number, peers: readonly OnlinePeer[], viewer: THREE.Vector3): void {
    for (const g of this.ghosts.values()) g.seen = false
    let shown = 0
    for (const p of peers) {
      if (p.mode !== "raid" || p.x === null || p.z === null) continue
      if (Math.hypot(p.x - viewer.x, p.z - viewer.z) > SHOW_RANGE) continue
      if (shown >= MAX_GHOSTS && !this.ghosts.has(p.peer)) continue
      shown++
      const g = this.ghosts.get(p.peer) ?? this.add(p)
      g.seen = true
      g.target.set(p.x, 0, p.z); g.yaw = p.yaw
      g.drive.crouch = p.crouch ? 1 : 0
      const label = p.name && p.name !== p.callsign ? `${p.callsign} · ${p.name}` : p.callsign
      if (label !== g.label) { g.label = label; drawTag(g.tag, label) }
    }
    for (const [peer, g] of this.ghosts) {
      if (!g.seen) { this.remove(peer); continue }
      const pos = g.group.position
      const dx = g.target.x - pos.x, dz = g.target.z - pos.z, d = Math.hypot(dx, dz)
      if (d > 12) { pos.copy(g.target); g.drive.velX = g.drive.velZ = 0 }
      else {
        const k = Math.min(1, dt * 6)
        pos.x += dx * k; pos.z += dz * k
        g.drive.velX = dt > 0 ? dx * k / dt : 0; g.drive.velZ = dt > 0 ? dz * k / dt : 0
        if (Math.hypot(g.drive.velX, g.drive.velZ) < 0.25) g.drive.velX = g.drive.velZ = 0
      }
      const prev = g.group.rotation.y
      const turn = Math.atan2(Math.sin(g.yaw - prev), Math.cos(g.yaw - prev))
      const yaw = prev + turn * Math.min(1, dt * 8)
      g.group.rotation.y = yaw
      g.drive.yaw = yaw; g.drive.aimYaw = yaw; g.drive.turnRate = dt > 0 ? turn * Math.min(1, dt * 8) / dt : 0
      g.drive.alert = 1
      g.model.update(dt, g.drive)
      const far = Math.hypot(pos.x - viewer.x, pos.z - viewer.z)
      g.tag.scale.set(0.42 * TAG_W / 112, 0.42, 1).multiplyScalar(Math.max(1, far / 25))
    }
  }

  dispose(): void {
    for (const peer of [...this.ghosts.keys()]) this.remove(peer)
    this.group.parent?.remove(this.group)
  }

  private add(p: OnlinePeer): Ghost {
    if (!this.assets) this.assets = acquireSoldierAssets()
    const looks: SurvivorLook[] = ["survivor", "drifter"]
    let h = 0
    for (const c of p.peer) h = (h * 31 + c.charCodeAt(0)) >>> 0
    const model = new SoldierModel(looks[h % looks.length], this.assets, 900 + (h % 97))
    model.setNight(this.night)
    const group = new THREE.Group(); group.name = "Echo"
    group.add(model.root)
    group.position.set(p.x ?? 0, 0, p.z ?? 0); group.rotation.y = p.yaw
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }))
    tag.position.y = 2.25; tag.renderOrder = 5
    group.add(tag)
    const g: Ghost = { peer: p.peer, group, model, drive: makeDrive(), tag, label: "", target: new THREE.Vector3(p.x ?? 0, 0, p.z ?? 0), yaw: p.yaw, seen: true }
    this.group.add(group)
    this.ghosts.set(p.peer, g)
    return g
  }

  private remove(peer: string): void {
    const g = this.ghosts.get(peer)
    if (!g) return
    this.ghosts.delete(peer)
    g.group.parent?.remove(g.group)
    g.model.dispose()
    g.tag.material.map?.dispose(); g.tag.material.dispose()
    if (!this.ghosts.size && this.assets) { this.assets = null; releaseSoldierAssets() }
  }
}

/** Name tag: the callsign drawn on a small dark plate (other players' text only ever reaches a canvas). */
function drawTag(tag: THREE.Sprite, text: string): void {
  const W = TAG_W, c = document.createElement("canvas"); c.width = W; c.height = 112
  const g = c.getContext("2d")
  if (g) {
    const shown = text.length > 40 ? `${text.slice(0, 39)}…` : text
    let size = 44
    do { g.font = `600 ${size}px Inter, 'Segoe UI', Arial, sans-serif` } while (g.measureText(shown).width + 86 > W - 12 && (size -= 2) > 22)
    const w = Math.min(W - 12, g.measureText(shown).width + 86)
    g.fillStyle = "rgba(8, 14, 18, 0.72)"
    g.beginPath(); g.roundRect((W - w) / 2, 18, w, 76, 14); g.fill()
    g.fillStyle = "#6fd3ff"; g.beginPath(); g.arc((W - w) / 2 + 34, 56, 11, 0, Math.PI * 2); g.fill()
    g.fillStyle = "#e6f6ff"; g.textBaseline = "middle"; g.fillText(shown, (W - w) / 2 + 58, 58, w - 72)
  }
  const old = tag.material.map
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  tag.material.map = tex; tag.material.needsUpdate = true
  old?.dispose()
}
