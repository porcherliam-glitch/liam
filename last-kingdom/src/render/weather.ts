// Weather: clear, overcast, fog, rain and storm with gradual transitions, rain particles, wind and lightning.

import * as THREE from "three"
import { Rng } from "../core/rng"
import { lerp } from "../core/math"
import { tex } from "./textures"
import type { Sky } from "./sky"
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

export class Weather {
  kind: WeatherKind = "clear"
  cloud = 0
  fog = 0
  rain = 0
  wind = 0.3
  windDir = 0.6
  lightning = 0
  private rng: Rng
  private nextChange = 120
  private rainPoints: THREE.Points
  private rainVel: Float32Array
  private rainCount = 2400
  private rainBox = 36
  private flashLight: THREE.PointLight
  private nextFlash = 5
  locked = false

  constructor(private scene: THREE.Scene, private sky: Sky, seed: number, initial?: WeatherKind) {
    this.rng = new Rng(seed)
    this.kind = initial ?? this.rng.pick<WeatherKind>(["clear", "clear", "overcast", "fog", "rain"])
    const t = TARGETS[this.kind]
    this.cloud = t.cloud
    this.fog = t.fog
    this.rain = t.rain
    this.wind = t.wind
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(this.rainCount * 3)
    this.rainVel = new Float32Array(this.rainCount)
    for (let i = 0; i < this.rainCount; i++) {
      pos[i * 3] = this.rng.range(-this.rainBox, this.rainBox)
      pos[i * 3 + 1] = this.rng.range(0, this.rainBox)
      pos[i * 3 + 2] = this.rng.range(-this.rainBox, this.rainBox)
      this.rainVel[i] = this.rng.range(18, 26)
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ size: 0.5, map: tex("rain"), transparent: true, opacity: 0, depthWrite: false, color: 0xbcd0e8, sizeAttenuation: true })
    this.rainPoints = new THREE.Points(geo, mat)
    this.rainPoints.frustumCulled = false
    this.rainPoints.visible = false
    scene.add(this.rainPoints)
    this.flashLight = new THREE.PointLight(0xd8e8ff, 0, 400, 0.5)
    scene.add(this.flashLight)
  }

  setKind(kind: WeatherKind): void {
    if (kind === this.kind) return
    if (!(kind in TARGETS)) return // unknown name from a script or an old save: keep the current weather
    this.kind = kind
    events.emit("weatherChanged", { weather: kind })
  }

  update(dt: number, focus: THREE.Vector3, underground: boolean): void {
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
    // Rain particles follow the camera focus
    const visible = this.rain > 0.02
    this.rainPoints.visible = visible
    if (visible) {
      const pos = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      const wx = Math.cos(this.windDir) * this.wind * 6
      const wz = Math.sin(this.windDir) * this.wind * 6
      const active = Math.floor(this.rainCount * this.rain)
      for (let i = 0; i < this.rainCount; i++) {
        if (i >= active) {
          arr[i * 3 + 1] = -100
          continue
        }
        arr[i * 3 + 1] -= this.rainVel[i] * dt
        arr[i * 3] += wx * dt
        arr[i * 3 + 2] += wz * dt
        if (arr[i * 3 + 1] < -2 || arr[i * 3 + 1] < -50) {
          arr[i * 3] = this.rng.range(-this.rainBox, this.rainBox)
          arr[i * 3 + 1] = this.rainBox
          arr[i * 3 + 2] = this.rng.range(-this.rainBox, this.rainBox)
        }
        if (Math.abs(arr[i * 3]) > this.rainBox) arr[i * 3] = -Math.sign(arr[i * 3]) * this.rainBox
        if (Math.abs(arr[i * 3 + 2]) > this.rainBox) arr[i * 3 + 2] = -Math.sign(arr[i * 3 + 2]) * this.rainBox
      }
      pos.needsUpdate = true
      this.rainPoints.position.copy(focus)
      ;(this.rainPoints.material as THREE.PointsMaterial).opacity = Math.min(0.75, this.rain)
    }
    // Lightning
    this.lightning = Math.max(0, this.lightning - dt * 4)
    if (this.kind === "storm" && !underground) {
      this.nextFlash -= dt
      if (this.nextFlash <= 0) {
        this.nextFlash = this.rng.range(4, 14)
        this.lightning = 1
        this.flashLight.position.set(focus.x + this.rng.range(-60, 60), 60, focus.z + this.rng.range(-60, 60))
      }
    }
    this.flashLight.intensity = this.lightning * 600
  }

  /** Visibility factor 0..1 for AI perception (fog and rain shorten sight). */
  get visibility(): number {
    return 1 - this.fog * 0.55 - this.rain * 0.25
  }

  dispose(): void {
    this.rainPoints.geometry.dispose()
    ;(this.rainPoints.material as THREE.Material).dispose()
    this.rainPoints.removeFromParent()
    this.flashLight.removeFromParent()
  }
}
