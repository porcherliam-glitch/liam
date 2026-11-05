// Day/night cycle, sun and moon lights, fog and a gradient sky dome. The Weather system modulates it.

import * as THREE from "three"
import { clamp, lerp, smoothstep } from "../core/math"
import { Noise2D } from "../core/noise"

const skyVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uStars;
uniform float uFogMix;
varying vec3 vWorld;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float h = clamp(d.y, -0.1, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 256.0 / uSunSize) * 1.5 + pow(sd, 6.0) * 0.18);
  if (uStars > 0.0 && d.y > 0.0) {
    vec3 g = floor(d * 180.0);
    float s = hash(g);
    float star = step(0.995, s) * smoothstep(0.0, 0.3, d.y);
    col += vec3(star) * uStars * (0.5 + 0.5 * hash(g + 1.0));
  }
  col = mix(col, uHorizon, uFogMix * (1.0 - smoothstep(0.0, 0.35, h)));
  gl_FragColor = vec4(col, 1.0);
}`

export interface SkyState {
  /** 0..24 hours. */
  hour: number
  sunElevation: number
  /** 0 = deep night, 1 = full day. */
  daylight: number
}

export class Sky {
  readonly sun: THREE.DirectionalLight
  readonly moon: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly ambient: THREE.AmbientLight
  readonly dome: THREE.Mesh
  readonly fog: THREE.FogExp2
  private clouds: THREE.Mesh
  private cloudTex: THREE.Texture
  private cloudTime = 0
  hour = 9
  /** Hours of game time per real minute. */
  speed = 1.2
  /** External modifiers (weather). */
  cloudiness = 0
  fogBoost = 0
  underground = false
  private uniforms: Record<string, THREE.IUniform>

  constructor(private scene: THREE.Scene, shadows: boolean) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2)
    this.sun.castShadow = shadows
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 160
    this.sun.shadow.camera.left = -45
    this.sun.shadow.camera.right = 45
    this.sun.shadow.camera.top = 45
    this.sun.shadow.camera.bottom = -45
    this.sun.shadow.bias = -0.0008
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    this.moon = new THREE.DirectionalLight(0x8090c0, 0.3)
    this.scene.add(this.moon)
    this.scene.add(this.moon.target)
    this.hemi = new THREE.HemisphereLight(0x9ab0d0, 0x3a3a2a, 0.6)
    this.scene.add(this.hemi)
    this.ambient = new THREE.AmbientLight(0x404050, 0.2)
    this.scene.add(this.ambient)
    this.uniforms = {
      uTop: { value: new THREE.Color(0x203050) },
      uHorizon: { value: new THREE.Color(0x8090a0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffe0b0) },
      uSunSize: { value: 1 },
      uStars: { value: 0 },
      uFogMix: { value: 0.3 },
    }
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat)
    this.dome.frustumCulled = false
    this.dome.renderOrder = -10
    this.scene.add(this.dome)
    this.fog = new THREE.FogExp2(0x8090a0, 0.004)
    this.scene.fog = this.fog
    // Cloud layer: a huge quad with a soft noise texture, drifting with the wind
    this.cloudTex = makeCloudTexture()
    const cloudMat = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, opacity: 0, depthWrite: false, fog: false, color: 0xffffff })
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), cloudMat)
    this.clouds.rotation.x = Math.PI / 2
    this.clouds.renderOrder = -9
    this.clouds.frustumCulled = false
    this.scene.add(this.clouds)
  }

  setShadows(on: boolean): void {
    this.sun.castShadow = on
  }

  /** Sun elevation (-1..1): sunrise at 5:00, sunset at 21:00. */
  private elevation(hour: number): number {
    const t = ((hour % 24) + 24) % 24
    if (t >= 5 && t <= 21) return Math.sin(((t - 5) / 16) * Math.PI)
    const n = t > 21 ? t - 21 : t + 3
    return -Math.sin((n / 8) * Math.PI)
  }

  get state(): SkyState {
    const t = ((this.hour % 24) + 24) % 24
    const elev = this.elevation(t)
    return { hour: t, sunElevation: elev, daylight: clamp(smoothstep(-0.1, 0.22, elev), 0, 1) }
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.hour = (this.hour + (dt / 60) * this.speed) % 24
    const s = this.state
    const angle = s.hour >= 5 && s.hour <= 21 ? ((s.hour - 5) / 16) * Math.PI : Math.PI + (((s.hour > 21 ? s.hour - 21 : s.hour + 3) / 8) * Math.PI)
    const sunDir = new THREE.Vector3(Math.cos(angle) * 0.6, Math.sin(angle), Math.cos(angle) * 0.4 + 0.3).normalize()
    const day = s.daylight
    const cloud = this.cloudiness
    // Light intensities
    const sunI = day * (1 - cloud * 0.75) * 2.4
    this.sun.intensity = this.underground ? 0 : sunI
    this.sun.color.setHSL(0.09, 0.6, lerp(0.55, 0.95, clamp(s.sunElevation * 3, 0, 1)))
    this.sun.position.copy(focus).addScaledVector(sunDir, 80)
    this.sun.target.position.copy(focus)
    this.sun.target.updateMatrixWorld()
    const moonDir = sunDir.clone().multiplyScalar(-1)
    moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.2
    this.moon.intensity = this.underground ? 0 : (1 - day) * (1 - cloud * 0.5) * 0.9
    this.moon.position.copy(focus).addScaledVector(moonDir.normalize(), 80)
    this.moon.target.position.copy(focus)
    this.moon.target.updateMatrixWorld()
    this.hemi.intensity = this.underground ? 0.7 : lerp(0.26, 0.75, day) * (1 - cloud * 0.3)
    this.ambient.intensity = this.underground ? 1.8 : lerp(0.32, 0.25, day)
    this.ambient.color.setHex(this.underground ? 0x5a5270 : 0x404858)
    // Sky colours
    const top = new THREE.Color().setHSL(0.6, 0.55, lerp(0.05, 0.42, day))
    const horizon = new THREE.Color().setHSL(lerp(0.62, 0.08, clamp(1 - Math.abs(s.sunElevation) * 4, 0, 1) * day), lerp(0.25, 0.5, day), lerp(0.09, 0.62, day))
    if (cloud > 0) {
      top.lerp(new THREE.Color().setHSL(0.6, 0.08, lerp(0.04, 0.4, day)), cloud)
      horizon.lerp(new THREE.Color().setHSL(0.6, 0.06, lerp(0.06, 0.55, day)), cloud)
    }
    if (this.underground) {
      top.setHex(0x030305)
      horizon.setHex(0x08070a)
    }
    ;(this.uniforms.uTop.value as THREE.Color).copy(top)
    ;(this.uniforms.uHorizon.value as THREE.Color).copy(horizon)
    ;(this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir)
    ;(this.uniforms.uSunColor.value as THREE.Color).setHSL(0.08, 0.7, 0.7).multiplyScalar(this.underground ? 0 : day * (1 - cloud * 0.85))
    this.uniforms.uSunSize.value = 1 + cloud * 3
    this.uniforms.uStars.value = this.underground ? 0 : (1 - day) * (1 - cloud)
    this.uniforms.uFogMix.value = 0.3 + this.fogBoost * 0.6 + cloud * 0.2
    this.dome.position.copy(focus)
    // Clouds
    this.cloudTime += dt
    this.clouds.position.set(focus.x, focus.y + 140, focus.z)
    this.clouds.visible = !this.underground && cloud > 0.03
    const cm = this.clouds.material as THREE.MeshBasicMaterial
    cm.opacity = clamp(cloud * 0.85, 0, 0.85)
    cm.color.setHSL(0.6, 0.05, lerp(0.12, 0.75, day) * (1 - cloud * 0.3))
    this.cloudTex.offset.set(this.cloudTime * 0.004, this.cloudTime * 0.002)
    // Fog
    const fogCol = horizon.clone().lerp(new THREE.Color(0x202228), 0.25)
    if (this.underground) fogCol.setHex(0x0c0a10)
    this.fog.color.copy(fogCol)
    this.fog.density = this.underground ? 0.009 : 0.0035 + this.fogBoost * 0.012 + cloud * 0.0015 + (1 - day) * 0.002
    this.scene.background = null
  }
}

function makeCloudTexture(): THREE.Texture {
  const size = 256
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  const img = ctx.createImageData(size, size)
  const n = new Noise2D(7)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 4
      const v = (y / size) * 4
      // Tiled fbm, thresholded into fluffy shapes
      const f = (n.fbm(u, v, 5) + n.fbm(u + 4, v, 5) + n.fbm(u, v + 4, 5) + n.fbm(u + 4, v + 4, 5)) / 4
      const a = clamp((f + 0.15) * 2.2, 0, 1)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(6, 6)
  return t
}
