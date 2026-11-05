// Weather: clear, overcast, fog, rain and storm with gradual transitions, rain streaks, wind, lightning
// bolts with a flash envelope (the expedition plays the delayed thunder) and drifting ground fog.

import * as THREE from "three"
import { Rng } from "../core/rng"
import { clamp, lerp, smoothstep } from "../core/math"
import type { Sky, SkyQuality } from "./sky"
import { events } from "../core/events"

export type WeatherKind = "clear" | "overcast" | "fog" | "rain" | "storm"

const TARGETS: Record<WeatherKind, { cloud: number; fog: number; rain: number; wind: number }> = {
  clear: { cloud: 0.05, fog: 0, rain: 0, wind: 0.3 },
  overcast: { cloud: 0.7, fog: 0.1, rain: 0, wind: 0.5 },
  fog: { cloud: 0.5, fog: 0.9, rain: 0, wind: 0.15 },
  rain: { cloud: 0.85, fog: 0.3, rain: 0.7, wind: 0.7 },
  storm: { cloud: 1, fog: 0.35, rain: 1, wind: 1 },
}

export const WEATHER_NAMES: Record<WeatherKind, string> = { clear: "Klar", overcast: "Bewölkt", fog: "Nebel", rain: "Regen", storm: "Sturm" }

/** Baseline ground-fog opacity per biome (added to the weather's fog). */
const GROUND_FOG_BASE: Record<string, number> = { forest: 0.06, graveyard: 0.1, catacombs: 0.08 }

export interface LightningStrike {
  x: number
  z: number
  /** Distance from the camera in metres (thunder arrives after dist / 340 s). */
  dist: number
  id: number
}

export interface WeatherUpdateOpts {
  /** Camera forward on the XZ plane; the rain box is centred ahead of the camera. */
  forward?: { x: number; z: number }
  heightAt?: (x: number, z: number) => number
  biome?: string
  /** Player position; ground fog is kept around it. */
  player?: THREE.Vector3
}

type HeightFn = (x: number, z: number) => number

export class Weather {
  kind: WeatherKind = "clear"
  cloud = 0
  fog = 0
  rain = 0
  wind = 0.3
  windDir = 0.6
  /** Lightning flash envelope 0..1 (double stroke). */
  lightning = 0
  /** Latest strike; `id` increments so listeners can schedule thunder once per strike. */
  strike: LightningStrike | null = null
  /** Seconds until the next strike in a storm (tests may set it to 0 to force one). */
  nextFlash = 5
  locked = false
  private rng: Rng
  private nextChange = 120
  private rainLines: THREE.LineSegments
  private rainHead: Float32Array
  private rainVel: Float32Array
  private rainCount: number
  private rainHalf = 11
  private rainCenter = new THREE.Vector3()
  private rainCentered = false
  private bolt: THREE.Line
  private boltGlow: THREE.Line[] = []
  private boltPoints = 11
  private sinceFlash = 99
  private groundFog: GroundFog

  constructor(
    private scene: THREE.Scene,
    private sky: Sky,
    seed: number,
    initial?: WeatherKind,
    quality: SkyQuality = "high",
  ) {
    this.rng = new Rng(seed)
    this.kind = initial ?? this.rng.pick<WeatherKind>(["clear", "clear", "overcast", "fog", "rain"])
    const t = TARGETS[this.kind]
    this.cloud = t.cloud
    this.fog = t.fog
    this.rain = t.rain
    this.wind = t.wind
    // Rain: line segments (head + tail per drop) in a box that follows the camera
    this.rainCount = quality === "low" ? 800 : quality === "medium" ? 1800 : 3200
    this.rainHead = new Float32Array(this.rainCount * 3)
    this.rainVel = new Float32Array(this.rainCount)
    for (let i = 0; i < this.rainCount; i++) {
      this.rainHead[i * 3] = this.rng.range(-this.rainHalf, this.rainHalf)
      this.rainHead[i * 3 + 1] = this.rng.range(0, 18)
      this.rainHead[i * 3 + 2] = this.rng.range(-this.rainHalf, this.rainHalf)
      this.rainVel[i] = this.rng.range(18, 26)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.rainCount * 6), 3))
    geo.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.32, depthWrite: false, fog: false })
    this.rainLines = new THREE.LineSegments(geo, mat)
    this.rainLines.frustumCulled = false
    this.rainLines.visible = false
    this.rainLines.renderOrder = 4
    scene.add(this.rainLines)
    // Lightning bolt: a jagged line from the clouds to the ground plus four offset additive copies as glow
    const boltGeo = new THREE.BufferGeometry()
    boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.boltPoints * 3), 3))
    boltGeo.setDrawRange(0, 0)
    this.bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef4ff, fog: false }))
    this.bolt.frustumCulled = false
    this.bolt.visible = false
    scene.add(this.bolt)
    const glowMat = new THREE.LineBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    for (const [ox, oz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) {
      const g = new THREE.Line(boltGeo, glowMat)
      g.position.set(ox, 0, oz)
      g.frustumCulled = false
      g.visible = false
      scene.add(g)
      this.boltGlow.push(g)
    }
    this.groundFog = new GroundFog(scene, quality === "low" ? 4 : quality === "medium" ? 8 : 12, this.rng.fork())
  }

  setKind(kind: WeatherKind): void {
    if (kind === this.kind) return
    if (!(kind in TARGETS)) return // unknown name from a script or an old save: keep the current weather
    this.kind = kind
    events.emit("weatherChanged", { weather: kind })
  }

  update(dt: number, camPos: THREE.Vector3, underground: boolean, opts: WeatherUpdateOpts = {}): void {
    if (!this.locked) {
      this.nextChange -= dt
      if (this.nextChange <= 0) {
        this.nextChange = this.rng.range(90, 220)
        const options: WeatherKind[] = this.kind === "storm" ? ["rain", "overcast"] : this.kind === "rain" ? ["storm", "overcast", "fog", "rain"] : this.kind === "clear" ? ["clear", "overcast", "fog"] : ["clear", "rain", "fog", "overcast"]
        this.setKind(this.rng.pick(options))
      }
    }
    const t = TARGETS[this.kind]
    const k = 1 - Math.exp(-dt * 0.12)
    this.cloud = lerp(this.cloud, t.cloud, k)
    this.fog = lerp(this.fog, t.fog, k)
    this.rain = lerp(this.rain, underground ? 0 : t.rain, k)
    this.wind = lerp(this.wind, t.wind, k)
    this.windDir += dt * 0.02
    this.sky.cloudiness = underground ? 0 : this.cloud
    this.sky.fogBoost = underground ? 0 : this.fog
    const fwd = opts.forward ?? { x: 0, z: 0 }
    this.updateRain(dt, camPos, fwd)
    this.updateLightning(dt, camPos, underground, opts.heightAt)
    this.sky.flash = underground ? 0 : this.lightning
    // Ground fog: weather fog plus a biome baseline, stronger at night
    const base = GROUND_FOG_BASE[opts.biome ?? ""] ?? 0
    const daylight = this.sky.state.daylight
    const fogAmt = (underground ? 0 : this.fog) * 0.32 + base
    const target = fogAmt * (1 - daylight * 0.5)
    this.groundFog.update(dt, opts.player ?? camPos, camPos, this.wind, this.windDir, target, this.sky.fog.color, opts.heightAt)
  }

  private updateRain(dt: number, camPos: THREE.Vector3, fwd: { x: number; z: number }): void {
    const visible = this.rain > 0.02
    this.rainLines.visible = visible
    if (!visible) return
    const cx = camPos.x + fwd.x * 8
    const cz = camPos.z + fwd.z * 8
    const cy = camPos.y - 3
    if (!this.rainCentered) {
      this.rainCenter.set(cx, cy, cz)
      this.rainCentered = true
    }
    // The box follows the camera; drops keep their world position by compensating the shift and wrapping
    const sx = cx - this.rainCenter.x
    const sy = cy - this.rainCenter.y
    const sz = cz - this.rainCenter.z
    this.rainCenter.set(cx, cy, cz)
    this.rainLines.position.copy(this.rainCenter)
    const pos = this.rainLines.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const wx = Math.cos(this.windDir) * this.wind * 6
    const wz = Math.sin(this.windDir) * this.wind * 6
    const active = Math.floor(this.rainCount * clamp(this.rain, 0, 1))
    const half = this.rainHalf
    const head = this.rainHead
    for (let i = 0; i < active; i++) {
      const o = i * 3
      const vel = this.rainVel[i]
      let x = head[o] - sx + wx * dt
      let y = head[o + 1] - sy - vel * dt
      let z = head[o + 2] - sz + wz * dt
      if (y < -1) {
        x = this.rng.range(-half, half)
        y = this.rng.range(14, 18)
        z = this.rng.range(-half, half)
      }
      if (x > half) x -= half * 2
      else if (x < -half) x += half * 2
      if (z > half) z -= half * 2
      else if (z < -half) z += half * 2
      if (y > 20) y = this.rng.range(0, 18)
      head[o] = x
      head[o + 1] = y
      head[o + 2] = z
      // Tail along the fall direction
      const len = 0.5 + vel * 0.03
      const inv = len / Math.sqrt(wx * wx + vel * vel + wz * wz)
      const q = i * 6
      arr[q] = x
      arr[q + 1] = y
      arr[q + 2] = z
      arr[q + 3] = x - wx * inv
      arr[q + 4] = y + vel * inv
      arr[q + 5] = z - wz * inv
    }
    pos.needsUpdate = true
    this.rainLines.geometry.setDrawRange(0, active * 2)
    ;(this.rainLines.material as THREE.LineBasicMaterial).opacity = Math.min(0.32, this.rain * 0.4)
  }

  private updateLightning(dt: number, camPos: THREE.Vector3, underground: boolean, heightAt?: HeightFn): void {
    this.sinceFlash += dt
    if (this.kind === "storm" && !underground) {
      this.nextFlash -= dt
      if (this.nextFlash <= 0) {
        this.nextFlash = this.rng.range(4, 14)
        this.sinceFlash = 0
        // Strike downwind of the camera, 40..120 m away
        const dist = this.rng.range(40, 120)
        const a = this.windDir + this.rng.range(-0.7, 0.7)
        const x = camPos.x + Math.cos(a) * dist
        const z = camPos.z + Math.sin(a) * dist
        this.strike = { x, z, dist, id: (this.strike?.id ?? 0) + 1 }
        this.buildBolt(x, z, heightAt ? heightAt(x, z) : 0)
      }
    }
    // Double stroke: a sharp main flash and a weaker return stroke 90 ms later
    const ts = this.sinceFlash
    const flash = Math.max(Math.exp(-ts * 18), ts >= 0.09 ? 0.7 * Math.exp(-(ts - 0.09) * 22) : 0)
    this.lightning = flash < 0.005 ? 0 : flash
    const boltVisible = this.lightning > 0.35
    this.bolt.visible = boltVisible
    for (const g of this.boltGlow) g.visible = boltVisible
  }

  private buildBolt(x: number, z: number, groundY: number): void {
    const n = this.rng.int(8, this.boltPoints)
    const pos = this.bolt.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    let px = x + this.rng.range(-12, 12)
    let pz = z + this.rng.range(-12, 12)
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1)
      // Random walk that is pulled toward the strike point as it nears the ground
      const jitter = lerp(9, 4, k)
      px = lerp(px + this.rng.range(-jitter, jitter), x, k * k)
      pz = lerp(pz + this.rng.range(-jitter, jitter), z, k * k)
      arr[i * 3] = i === n - 1 ? x : px
      arr[i * 3 + 1] = lerp(160, groundY, k)
      arr[i * 3 + 2] = i === n - 1 ? z : pz
    }
    pos.needsUpdate = true
    this.bolt.geometry.setDrawRange(0, n)
  }

  /** Visibility factor 0..1 for AI perception (fog and rain shorten sight). */
  get visibility(): number {
    return 1 - this.fog * 0.55 - this.rain * 0.25
  }

  dispose(): void {
    this.rainLines.geometry.dispose()
    ;(this.rainLines.material as THREE.Material).dispose()
    this.rainLines.removeFromParent()
    this.bolt.geometry.dispose()
    ;(this.bolt.material as THREE.Material).dispose()
    this.bolt.removeFromParent()
    for (const g of this.boltGlow) g.removeFromParent()
    if (this.boltGlow.length) (this.boltGlow[0].material as THREE.Material).dispose()
    this.groundFog.dispose()
  }
}

/** Soft, slowly drifting fog sheets just above the ground around the player. */
class GroundFog {
  private meshes: THREE.Mesh[] = []
  private spin: number[] = []
  private tex: THREE.CanvasTexture
  private t = 0
  private placed = false

  constructor(private scene: THREE.Scene, count: number, private rng: Rng) {
    this.tex = makeFogTexture()
    const geo = new THREE.PlaneGeometry(16, 16)
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false, fog: false, color: 0xffffff }))
      m.rotation.x = -Math.PI / 2
      m.rotation.z = this.rng.range(0, Math.PI * 2)
      m.renderOrder = 3
      m.visible = false
      m.frustumCulled = false
      this.scene.add(m)
      this.meshes.push(m)
      this.spin.push(this.rng.range(-0.05, 0.05))
    }
  }

  private place(m: THREE.Mesh, player: THREE.Vector3, angle: number, dist: number): void {
    m.position.x = player.x + Math.cos(angle) * dist
    m.position.z = player.z + Math.sin(angle) * dist
  }

  update(dt: number, player: THREE.Vector3, camPos: THREE.Vector3, wind: number, windDir: number, opacity: number, fogColor: THREE.Color, heightAt?: HeightFn): void {
    this.t += dt
    if (!this.placed) {
      this.placed = true
      for (const m of this.meshes) this.place(m, player, this.rng.range(0, Math.PI * 2), this.rng.range(4, 22))
    }
    const k = 1 - Math.exp(-dt * 1.5)
    const drift = (0.3 + wind * 0.6) * dt
    const dx = Math.cos(windDir) * drift
    const dz = Math.sin(windDir) * drift
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i]
      m.position.x += dx
      m.position.z += dz
      m.rotation.z += this.spin[i] * dt
      const px = m.position.x - player.x
      const pz = m.position.z - player.z
      if (px * px + pz * pz > 24 * 24) {
        // Drifted away: reappear on the far side of the player
        this.place(m, player, Math.atan2(pz, px) + Math.PI + this.rng.range(-0.6, 0.6), this.rng.range(14, 22))
      }
      m.position.y = (heightAt ? heightAt(m.position.x, m.position.z) : 0) + 0.35 + Math.sin(this.t * 0.4 + i) * 0.1
      const mat = m.material as THREE.MeshBasicMaterial
      const camD = Math.hypot(m.position.x - camPos.x, m.position.z - camPos.z)
      const target = opacity * smoothstep(1.5, 3.5, camD)
      mat.opacity = lerp(mat.opacity, target, k)
      mat.color.copy(fogColor).multiplyScalar(1.3)
      m.visible = mat.opacity > 0.004
    }
  }

  dispose(): void {
    for (const m of this.meshes) {
      ;(m.material as THREE.Material).dispose()
      m.removeFromParent()
    }
    if (this.meshes.length) this.meshes[0].geometry.dispose()
    this.tex.dispose()
  }
}

/** Soft blob texture for the fog sheets: a few overlapping radial gradients (linear alpha, no sRGB). */
function makeFogTexture(): THREE.CanvasTexture {
  const size = 128
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  ctx.clearRect(0, 0, size, size)
  const rng = new Rng(4242)
  for (let i = 0; i < 6; i++) {
    const x = size * (0.3 + rng.range(0, 0.4))
    const y = size * (0.3 + rng.range(0, 0.4))
    const r = size * rng.range(0.22, 0.4)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, "rgba(255,255,255,0.35)")
    g.addColorStop(0.5, "rgba(255,255,255,0.16)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}
