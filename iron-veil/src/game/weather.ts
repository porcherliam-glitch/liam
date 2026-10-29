/**
 * weather.ts — raid weather: the table of effects (sight, noise, fog, light, rain, lightning) and the rain renderer.
 * Rain is one LineSegments mesh of streaks inside a box that wraps around the camera; all motion happens in the
 * vertex shader (no per-frame buffer updates). The world hides it indoors and drives lightning flashes.
 */
import * as THREE from "three"

export type WeatherId = "clear" | "rain" | "fog" | "storm"
export const WEATHER_ORDER: WeatherId[] = ["clear", "rain", "fog", "storm"]

export interface WeatherDef {
  name: string
  /** Shown on the radio planning screen. */
  note: string
  /** Multiplier on how far mercs and infected can see. */
  vision: number
  /** Multiplier on every noise radius (rain masks footsteps and shots). */
  noise: number
  /** Multiplier on the fog distances. */
  fog: number
  /** Multiplier on sun and sky light. */
  light: number
  /** How strongly the sky and fog turn overcast grey (0..1). */
  overcast: number
  /** Rain amount (0 none, 1 rain, 2 downpour). */
  rain: number
  lightning: boolean
  /** Extra loot (fraction) for the harder conditions. */
  loot: number
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: { name: "Klar", note: "Normale Sicht", vision: 1, noise: 1, fog: 1, light: 1, overcast: 0, rain: 0, lightning: false, loot: 0 },
  rain: { name: "Regen", note: "Sicht −15 % · Schritte leiser", vision: 0.85, noise: 0.75, fog: 0.72, light: 0.72, overcast: 0.55, rain: 1, lightning: false, loot: 0.05 },
  fog: { name: "Nebel", note: "Sicht stark eingeschränkt · Beute +10 %", vision: 0.55, noise: 1, fog: 0.3, light: 0.82, overcast: 0.75, rain: 0, lightning: false, loot: 0.1 },
  storm: { name: "Gewitter", note: "Starkregen, Blitze · Donner übertönt Schüsse · Beute +15 %", vision: 0.72, noise: 0.55, fog: 0.55, light: 0.55, overcast: 0.7, rain: 1.9, lightning: true, loot: 0.15 },
}

const BOX = new THREE.Vector3(34, 20, 34)

/** Rain streaks around the camera; set `amount` (0..2) and call update(time, camera position) every frame. */
export class Rain {
  readonly mesh: THREE.LineSegments
  private uniforms: { uTime: { value: number }; uCam: { value: THREE.Vector3 }; uAmount: { value: number }; uColor: { value: THREE.Color }; uWind: { value: THREE.Vector2 } }

  constructor(count: number, color: number) {
    const seeds = new Float32Array(count * 2 * 4), ends = new Float32Array(count * 2), pos = new Float32Array(count * 2 * 3)
    let s = 1234567
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    for (let i = 0; i < count; i++) {
      const a = rnd(), b = rnd(), c = rnd(), d = rnd()
      for (let e = 0; e < 2; e++) { seeds.set([a, b, c, d], (i * 2 + e) * 4); ends[i * 2 + e] = e }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    g.setAttribute("seed", new THREE.BufferAttribute(seeds, 4))
    g.setAttribute("end", new THREE.BufferAttribute(ends, 1))
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(color) }, uWind: { value: new THREE.Vector2(1.6, 0.7) } }
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: /* glsl */`
        attribute vec4 seed; attribute float end;
        uniform float uTime, uAmount; uniform vec3 uCam; uniform vec2 uWind;
        varying float vA;
        #include <fog_pars_vertex>
        const vec3 BOX = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
        void main() {
          float fall = 10.0 + seed.w * 4.0;
          // drops beyond the current amount are parked far below the ground (fewer drops in light rain)
          float on = step(seed.w, uAmount * 0.5);
          float y = mod(seed.y * BOX.y - uTime * fall, BOX.y);
          vec2 drift = uWind * (BOX.y - y) / fall;
          float x = mod(seed.x * BOX.x - uCam.x + drift.x, BOX.x) - BOX.x * 0.5;
          float z = mod(seed.z * BOX.z - uCam.z + drift.y, BOX.z) - BOX.z * 0.5;
          float len = 0.35 + 0.25 * seed.w;
          vec3 p = vec3(uCam.x + x, uCam.y - BOX.y * 0.35 + y, uCam.z + z);
          p += end * vec3(uWind.x / fall, 1.0, uWind.y / fall) * len;
          p.y -= (1.0 - on) * 1000.0;
          // fade near the box edges so the wrap never pops
          vA = (1.0 - smoothstep(0.38, 0.5, max(abs(x), abs(z)) / BOX.x)) * mix(0.35, 1.0, end);
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColor, 0.32 * vA);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
    })
    this.mesh = new THREE.LineSegments(g, mat)
    this.mesh.frustumCulled = false; this.mesh.name = "Regen"; this.mesh.renderOrder = 3; this.mesh.visible = false
  }

  set amount(v: number) { this.uniforms.uAmount.value = v; this.mesh.visible = v > 0 }
  get amount(): number { return this.uniforms.uAmount.value }

  update(time: number, camera: THREE.Vector3, indoor: boolean): void {
    this.uniforms.uTime.value = time; this.uniforms.uCam.value.copy(camera)
    this.mesh.visible = this.uniforms.uAmount.value > 0 && !indoor
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose() }
}

/** Next lightning: seconds until the strike and its distance (m), from a 0..1 random source. */
export function nextLightning(rnd: () => number): { wait: number; distance: number } {
  return { wait: 7 + rnd() * 16, distance: 300 + rnd() * 2200 }
}
