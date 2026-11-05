// Day/night cycle: one shadow-casting key light (sun by day, moon by night), hemisphere, ambient and fill
// lights driven by a keyframe table over sun elevation, exposure, fog, a procedural sky dome (gradient with
// dusk glow, twinkling stars, moon, drifting shader clouds, lightning) and an environment map baked from the
// dome for reflections. The Weather system modulates cloudiness, fog and lightning.

import * as THREE from "three"
import { clamp, lerp, smoothstep } from "../core/math"

export type SkyQuality = "low" | "medium" | "high"

const skyVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform vec3 uDuskColor;
uniform float uDusk;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uStars;
uniform float uFogMix;
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonDir2;
uniform float uMoonVis;
uniform float uCloud;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCloudAlpha;
uniform float uFlash;
varying vec3 vWorld;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// Value-noise fbm in -1..1
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < CLOUD_OCTAVES; i++) {
    v += a * vnoise(p);
    n += a;
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v / n * 2.0 - 1.0;
}
// One star layer: a cell grid on the direction cube, a few percent of the cells hold a twinkling star
vec3 starLayer(vec3 d, float n) {
  vec3 cell = floor(d * n);
  vec3 c = normalize((cell + 0.5) / n);
  float h1 = hash3(cell);
  float h2 = hash3(cell + 1.0);
  float h3 = hash3(cell + 2.0);
  float s = step(0.992, h1) * (1.0 - smoothstep(0.0, 0.45 / n, distance(c, d))) * (0.6 + 0.4 * sin(uTime * 2.0 + h2 * 40.0));
  return mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.9, 0.75), h3) * s;
}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float h = clamp(d.y, -0.1, 1.0);
  float hh = max(h, 0.0);
  // Three-stop gradient: horizon -> mid band -> zenith
  vec3 col = hh < 0.18 ? mix(uHorizon, uMid, smoothstep(0.0, 0.18, hh)) : mix(uMid, uTop, pow(smoothstep(0.18, 1.0, hh), 0.7));
  // Dusk glow on the sun side, a violet counter-sky opposite
  vec2 dxz = normalize(d.xz + vec2(1e-4, 0.0));
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-4, 0.0));
  float az = max(dot(dxz, sxz), 0.0);
  col += uDuskColor * pow(az, 3.0) * (1.0 - smoothstep(0.0, 0.45, hh)) * uDusk;
  col = mix(col, vec3(0.25, 0.18, 0.32), uDusk * pow(1.0 - az, 2.0) * (1.0 - smoothstep(0.0, 0.3, hh)) * 0.35);
  float sd = max(dot(d, uSunDir), 0.0);
  // Clouds: two drifting fbm layers projected onto a flat sky plane
  float cov = 0.0;
  float cov2 = 0.0;
  if (uCloudAlpha > 0.001 && d.y > 0.0) {
    vec2 cuv = d.xz / (d.y + 0.12) * 0.28;
    float c1 = fbm(cuv + uTime * vec2(0.010, 0.004));
    cov = smoothstep(1.05 - uCloud * 1.25, 1.15 - uCloud * 0.6, c1 * 0.5 + 0.5);
    #if CLOUD_LAYERS > 1
    float c2 = fbm(cuv * 2.3 + uTime * vec2(-0.006, 0.009) + 7.0);
    cov2 = smoothstep(0.95 - uCloud * 0.9, 1.1, c2 * 0.5 + 0.5) * 0.45;
    #endif
  }
  // Sun disc (hidden behind clouds) and halo
  col += uSunColor * (pow(sd, 256.0 / uSunSize) * (1.0 - cov * 0.85) + pow(sd, 6.0) * 0.18);
  // Stars in two layers plus a faint milky way band
  if (uStars > 0.0 && d.y > 0.0) {
    float damp = (1.0 - uFogMix * 0.8) * smoothstep(0.0, 0.25, d.y) * uStars;
    col += (starLayer(d, 140.0) + starLayer(d, 320.0) * 0.7) * damp;
    col += vec3(0.10, 0.11, 0.16) * exp(-pow(dot(d, normalize(vec3(0.3, 0.5, 0.8))), 2.0) * 18.0) * damp;
  }
  // Moon: bright disc minus a shadowed crescent, soft halo
  if (uMoonVis > 0.0) {
    float m = dot(d, uMoonDir);
    float disc = smoothstep(0.99935, 0.99965, m);
    float shade = smoothstep(0.99935, 0.99965, dot(d, uMoonDir2));
    col += vec3(0.85, 0.9, 1.0) * (max(disc - shade * 0.9, 0.0) * 1.6 + pow(max(m, 0.0), 64.0) * 0.10) * uMoonVis;
  }
  // Cloud shading: lit toward the sun, thin edges lighter
  vec3 cloudCol = mix(uCloudDark, uCloudLit, clamp(pow(sd, 2.0) * 0.55 + 0.45 + (1.0 - cov) * 0.25, 0.0, 1.0));
  col = mix(col, cloudCol, clamp(cov + cov2, 0.0, 1.0) * smoothstep(0.02, 0.18, d.y) * uCloudAlpha);
  // Lightning brightens the whole sky, most near the horizon
  col += vec3(0.75, 0.82, 1.0) * uFlash * 0.7 * (1.0 - smoothstep(0.0, 0.6, hh) * 0.5);
  // Haze: the lower sky fades into the scene fog colour so hills vanish into it
  col = mix(col, uFogColor, uFogMix * (1.0 - smoothstep(0.0, 0.35, h)));
  gl_FragColor = vec4(col, 1.0);
}`

export interface SkyState {
  /** 0..24 hours. */
  hour: number
  sunElevation: number
  /** 0 = deep night, 1 = full day. */
  daylight: number
}

/** Light and colour keyframe, interpolated linearly over sun elevation. */
interface LightKey {
  elev: number
  sun: number
  sunI: number
  hemiSky: number
  hemiGround: number
  hemiI: number
  ambient: number
  ambientI: number
  fill: number
  top: number
  horizon: number
  exposure: number
}

const LIGHT_KEYS: LightKey[] = [
  // night
  { elev: -0.12, sun: 0xff7a3a, sunI: 0, hemiSky: 0x1c2436, hemiGround: 0x0e0f12, hemiI: 0.22, ambient: 0x141824, ambientI: 0.12, fill: 0.12, top: 0x070a14, horizon: 0x151a26, exposure: 0.85 },
  // dusk / dawn
  { elev: -0.02, sun: 0xff7a3a, sunI: 0.9, hemiSky: 0x4a4a68, hemiGround: 0x2a2218, hemiI: 0.34, ambient: 0x1e2232, ambientI: 0.13, fill: 0.15, top: 0x1c2440, horizon: 0x9a5a3a, exposure: 0.95 },
  // morning / evening
  { elev: 0.2, sun: 0xffc48a, sunI: 2.0, hemiSky: 0x6a7a98, hemiGround: 0x3a3426, hemiI: 0.46, ambient: 0x2e3444, ambientI: 0.14, fill: 0.18, top: 0x3a506e, horizon: 0x9aa0a8, exposure: 1.0 },
  // noon
  { elev: 0.5, sun: 0xfff0dc, sunI: 2.8, hemiSky: 0x7f90a8, hemiGround: 0x3a3a2e, hemiI: 0.55, ambient: 0x3a4050, ambientI: 0.15, fill: 0.22, top: 0x44607c, horizon: 0xaab2b8, exposure: 1.05 },
]

const MOON_COLOR = new THREE.Color(0x6f85b8)
const MOON_INTENSITY = 0.55

function lerpKeys(elev: number): LightKey {
  const keys = LIGHT_KEYS
  if (elev <= keys[0].elev) return keys[0]
  if (elev >= keys[keys.length - 1].elev) return keys[keys.length - 1]
  let i = 0
  while (elev > keys[i + 1].elev) i++
  const a = keys[i]
  const b = keys[i + 1]
  const t = (elev - a.elev) / (b.elev - a.elev)
  const c = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), t).getHex()
  return {
    elev,
    sun: c(a.sun, b.sun),
    sunI: lerp(a.sunI, b.sunI, t),
    hemiSky: c(a.hemiSky, b.hemiSky),
    hemiGround: c(a.hemiGround, b.hemiGround),
    hemiI: lerp(a.hemiI, b.hemiI, t),
    ambient: c(a.ambient, b.ambient),
    ambientI: lerp(a.ambientI, b.ambientI, t),
    fill: lerp(a.fill, b.fill, t),
    top: c(a.top, b.top),
    horizon: c(a.horizon, b.horizon),
    exposure: lerp(a.exposure, b.exposure, t),
  }
}

/** Spherical interpolation between two unit vectors. */
function slerp(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const d = clamp(a.dot(b), -1, 1)
  const theta = Math.acos(d)
  if (theta < 1e-4 || theta > Math.PI - 1e-4) return out.copy(a).lerp(b, t).normalize()
  const s = Math.sin(theta)
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * theta) / s).addScaledVector(b, Math.sin(t * theta) / s)
}

export class Sky {
  /** Key light: the sun by day, blended onto the moon's direction and colour at night (one shadow map). */
  readonly sun: THREE.DirectionalLight
  /** Kept for compatibility; its intensity stays 0 because the key light takes over at night. */
  readonly moon: THREE.DirectionalLight
  /** Weak light from the camera side so figures facing the player stay readable. */
  readonly fill: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly ambient: THREE.AmbientLight
  readonly dome: THREE.Mesh
  readonly fog: THREE.FogExp2
  hour = 9
  /** Hours of game time per real minute. */
  speed = 1.2
  /** External modifiers (weather). */
  cloudiness = 0
  fogBoost = 0
  /** Lightning envelope 0..1 set by the weather each frame. */
  flash = 0
  underground = false
  /** Tone-mapping exposure for the current light; the renderer applies it. */
  exposure = 1
  /** Number of environment map bakes so far (tests check it never grows per frame). */
  environmentBuilds = 0
  private uniforms: Record<string, THREE.IUniform>
  private time = 0
  private envScene: THREE.Scene | null = null
  private envDome: THREE.Mesh | null = null
  private pmrem: THREE.PMREMGenerator | null = null
  private envTarget: THREE.WebGLRenderTarget | null = null
  private envDaylight = -1
  private envKey = ""
  private envAge = 0
  private tmpDir = new THREE.Vector3()
  private tmpMoon = new THREE.Vector3()
  private tmpFocus = new THREE.Vector3()
  private tmpColor = new THREE.Color()

  constructor(
    private scene: THREE.Scene,
    shadows: boolean,
    readonly quality: SkyQuality = "high",
  ) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2)
    this.sun.castShadow = shadows
    const mapSize = quality === "low" ? 1024 : 2048
    const box = quality === "low" ? 32 : quality === "medium" ? 40 : 45
    this.sun.shadow.mapSize.set(mapSize, mapSize)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 130
    this.sun.shadow.camera.left = -box
    this.sun.shadow.camera.right = box
    this.sun.shadow.camera.top = box
    this.sun.shadow.camera.bottom = -box
    this.sun.shadow.radius = 2
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    this.moon = new THREE.DirectionalLight(0x8090c0, 0)
    this.scene.add(this.moon)
    this.scene.add(this.moon.target)
    this.fill = new THREE.DirectionalLight(0xc8d0e0, 0.2)
    this.scene.add(this.fill)
    this.scene.add(this.fill.target)
    this.hemi = new THREE.HemisphereLight(0x9ab0d0, 0x3a3a2a, 0.5)
    this.scene.add(this.hemi)
    this.ambient = new THREE.AmbientLight(0x404050, 0.15)
    this.scene.add(this.ambient)
    this.uniforms = {
      uTop: { value: new THREE.Color(0x203050) },
      uMid: { value: new THREE.Color(0x506078) },
      uHorizon: { value: new THREE.Color(0x8090a0) },
      uFogColor: { value: new THREE.Color(0x8090a0) },
      uDuskColor: { value: new THREE.Color(0xff6a2a) },
      uDusk: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffe0b0) },
      uSunSize: { value: 1 },
      uStars: { value: 0 },
      uFogMix: { value: 0.3 },
      uTime: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir2: { value: new THREE.Vector3(0, 1, 0) },
      uMoonVis: { value: 0 },
      uCloud: { value: 0 },
      uCloudLit: { value: new THREE.Color(0xffffff) },
      uCloudDark: { value: new THREE.Color(0x606870) },
      uCloudAlpha: { value: 0 },
      uFlash: { value: 0 },
    }
    const defines = { CLOUD_OCTAVES: quality === "low" ? 3 : 4, CLOUD_LAYERS: quality === "low" ? 1 : 2 }
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, defines, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat)
    this.dome.frustumCulled = false
    this.dome.renderOrder = -10
    this.scene.add(this.dome)
    this.fog = new THREE.FogExp2(0x8090a0, 0.004)
    this.scene.fog = this.fog
    this.scene.environmentIntensity = 0.3
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

  /** Distance beyond which the fog hides everything (4 % remaining contrast). */
  get fogCut(): number {
    return Math.sqrt(-Math.log(this.flash > 0 ? 0.02 : 0.04)) / Math.max(1e-4, this.fog.density)
  }

  /** Points the fill light from the camera toward the focus. */
  setFill(cameraPos: THREE.Vector3, focus: THREE.Vector3): void {
    this.fill.position.set(cameraPos.x, cameraPos.y + 6, cameraPos.z)
    this.fill.target.position.copy(focus)
    this.fill.target.updateMatrixWorld()
  }

  /**
   * Advances the clock and applies lights, sky colours and fog.
   * @param focus centre of the shadow box (the player)
   * @param forward optional look-ahead offset (camera forward × distance) so the shadow box covers what the camera sees
   */
  update(dt: number, focus: THREE.Vector3, forward?: { x: number; z: number }): void {
    this.hour = (this.hour + (dt / 60) * this.speed) % 24
    this.time += dt
    const s = this.state
    const angle = s.hour >= 5 && s.hour <= 21 ? ((s.hour - 5) / 16) * Math.PI : Math.PI + (((s.hour > 21 ? s.hour - 21 : s.hour + 3) / 8) * Math.PI)
    // Flatter sun path: long shadows most of the day
    const el = 0.22 + 0.62 * Math.sin(angle)
    const sunDir = this.tmpDir.set(Math.cos(angle) * 0.75, el, 0.35 + Math.cos(angle) * 0.25).normalize()
    const day = s.daylight
    const cloud = this.cloudiness
    const fog = this.fogBoost
    const key = lerpKeys(s.sunElevation)
    const shadowFocus = this.tmpFocus.copy(focus)
    if (forward) {
      shadowFocus.x += forward.x
      shadowFocus.z += forward.z
    }
    // Moon: opposite the sun, kept above the horizon
    const moonDir = this.tmpMoon.copy(sunDir).multiplyScalar(-1)
    moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.2
    moonDir.normalize()
    // Night: the key light slides onto the moon so one shadow map serves both
    const nightMix = 1 - smoothstep(0.2, 0.35, day)
    const lightDir = slerp(sunDir, moonDir, nightMix, new THREE.Vector3())
    const sunI = key.sunI * (1 - cloud * 0.75)
    const moonI = MOON_INTENSITY * (1 - cloud * 0.5)
    this.sun.intensity = this.underground ? 0 : lerp(sunI, moonI, nightMix)
    this.sun.color.setHex(key.sun).lerp(MOON_COLOR, nightMix)
    this.sun.position.copy(shadowFocus).addScaledVector(lightDir, 80)
    this.sun.target.position.copy(shadowFocus)
    this.sun.target.updateMatrixWorld()
    this.moon.intensity = 0
    this.moon.position.copy(shadowFocus).addScaledVector(moonDir, 80)
    this.moon.target.position.copy(shadowFocus)
    this.moon.target.updateMatrixWorld()
    const flash = this.underground ? 0 : this.flash
    if (this.underground) {
      this.hemi.color.setHex(0x9ab0d0)
      this.hemi.groundColor.setHex(0x3a3a2a)
      this.hemi.intensity = 0.7
      this.fill.intensity = 0.5
      this.ambient.intensity = 1.8
      this.ambient.color.setHex(0x5a5270)
    } else {
      this.hemi.color.setHex(key.hemiSky)
      this.hemi.groundColor.setHex(key.hemiGround)
      const fogLift = Math.max(0, fog - 0.3) / 0.7
      this.hemi.intensity = key.hemiI * (1 - cloud * 0.2) + fogLift * 0.35 + flash * 2.0
      this.fill.intensity = key.fill
      this.ambient.intensity = key.ambientI + flash * 0.8
      this.ambient.color.setHex(key.ambient)
    }
    this.exposure = this.underground ? 1.0 : key.exposure
    // Sky colours
    const top = new THREE.Color(key.top)
    const horizon = new THREE.Color(key.horizon)
    if (cloud > 0) {
      const dayScale = 0.12 + 0.88 * day
      top.lerp(this.tmpColor.setHex(0x4a505a).multiplyScalar(dayScale), cloud)
      horizon.lerp(this.tmpColor.setHex(0x6a6e74).multiplyScalar(dayScale), cloud)
    }
    const dusk = this.underground ? 0 : smoothstep(0.25, 0, Math.abs(s.sunElevation)) * (1 - cloud * 0.7)
    const mid = horizon.clone().lerp(top, 0.45).lerp(this.tmpColor.setHex(0x6a4a5a), dusk * 0.6)
    if (this.underground) {
      top.setHex(0x030305)
      horizon.setHex(0x08070a)
      mid.setHex(0x050507)
    }
    const u = this.uniforms
    ;(u.uTop.value as THREE.Color).copy(top)
    ;(u.uMid.value as THREE.Color).copy(mid)
    ;(u.uHorizon.value as THREE.Color).copy(horizon)
    ;(u.uDuskColor.value as THREE.Color).setHex(0xff6a2a).lerp(this.tmpColor.setHex(0xd8884a), smoothstep(-0.1, 0.1, s.sunElevation))
    u.uDusk.value = dusk
    ;(u.uSunDir.value as THREE.Vector3).copy(sunDir)
    ;(u.uSunColor.value as THREE.Color).setHSL(0.08, 0.7, 0.7).multiplyScalar(this.underground ? 0 : day * (1 - cloud * 0.85))
    u.uSunSize.value = 1 + cloud * 3
    u.uStars.value = this.underground ? 0 : (1 - day) * (1 - cloud)
    u.uFogMix.value = 0.3 + fog * 0.65
    u.uTime.value = this.time
    ;(u.uMoonDir.value as THREE.Vector3).copy(moonDir)
    // Crescent: a second disc shifted sideways (perpendicular to the moon direction) shades part of the first
    const side = new THREE.Vector3(-moonDir.z, 0, moonDir.x).normalize()
    ;(u.uMoonDir2.value as THREE.Vector3).copy(moonDir).addScaledVector(side, 0.014).normalize()
    u.uMoonVis.value = this.underground ? 0 : (1 - day) * (1 - cloud * 0.9)
    u.uCloud.value = this.underground ? 0 : cloud
    u.uCloudAlpha.value = this.underground ? 0 : clamp(cloud * 1.1, 0, 0.95)
    const lit = lerp(0.1, 0.92, day) * (1 - cloud * 0.25)
    ;(u.uCloudLit.value as THREE.Color).setHSL(0.6, 0.06, lit).lerp(this.tmpColor.setHex(0xffb080), dusk * 0.5).addScalar(flash * 1.2)
    ;(u.uCloudDark.value as THREE.Color).setHSL(0.62, 0.08, lerp(0.03, 0.38, day) * (1 - cloud * 0.3))
    u.uFlash.value = flash
    this.dome.position.copy(focus)
    // Fog: tinted by the horizon, grey and dense in foggy weather, a little denser at night
    const fogCol = horizon.clone().lerp(this.tmpColor.setHex(0x202228), 0.25)
    if (fog > 0.3) fogCol.lerp(this.tmpColor.setHex(0x3a4250).multiplyScalar(0.45 + 0.55 * day), fog * 0.6)
    if (this.underground) fogCol.setHex(0x0c0a10)
    this.fog.color.copy(fogCol)
    ;(u.uFogColor.value as THREE.Color).copy(fogCol)
    this.fog.density = this.underground ? 0.009 : 0.0035 + fog * 0.018 + cloud * 0.0015 + (1 - day) * 0.002
    this.scene.background = null
    this.scene.environmentIntensity = this.underground ? 0.08 : 0.2 + 0.15 * day
    this.envAge += dt
  }

  /**
   * Bakes the dome into a PMREM environment map for reflections on metal and wet surfaces.
   * Call after the world is built; afterwards updateEnvironment() decides when a rebake is due.
   */
  buildEnvironment(renderer: THREE.WebGLRenderer): void {
    if (!this.pmrem) {
      this.pmrem = new THREE.PMREMGenerator(renderer)
      this.envScene = new THREE.Scene()
      const domeMat = this.dome.material as THREE.ShaderMaterial
      const copy = new THREE.ShaderMaterial({ uniforms: this.uniforms, defines: { ...domeMat.defines }, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false })
      this.envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), copy)
      this.envDome.frustumCulled = false
      this.envScene.add(this.envDome)
    }
    const old = this.envTarget
    this.envTarget = this.pmrem.fromScene(this.envScene!, 0, 1, 1000)
    this.scene.environment = this.envTarget.texture
    old?.dispose()
    this.environmentBuilds++
    this.envDaylight = this.state.daylight
    this.envAge = 0
  }

  /** Rebakes the environment when the light changed noticeably, the weather kind changed or two minutes passed. */
  updateEnvironment(renderer: THREE.WebGLRenderer, weatherKey: string): void {
    if (!this.pmrem) {
      this.envKey = weatherKey
      this.buildEnvironment(renderer)
      return
    }
    if (Math.abs(this.state.daylight - this.envDaylight) > 0.1 || weatherKey !== this.envKey || this.envAge > 120) {
      this.envKey = weatherKey
      this.buildEnvironment(renderer)
    }
  }

  dispose(): void {
    this.envTarget?.dispose()
    this.envTarget = null
    this.pmrem?.dispose()
    this.pmrem = null
    if (this.envDome) {
      this.envDome.geometry.dispose()
      ;(this.envDome.material as THREE.Material).dispose()
      this.envDome = null
    }
    this.envScene = null
    this.scene.environment = null
    this.dome.geometry.dispose()
    ;(this.dome.material as THREE.Material).dispose()
    this.dome.removeFromParent()
  }
}
