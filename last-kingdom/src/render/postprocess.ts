// Post-processing: MSAA render target, half-resolution bloom for fire and beacons, and a dark-fantasy
// colour grade (lift/gain/contrast, split toning, film grain, vignette, damage edge) with per-biome presets.
// Quality "low" renders directly without the composer.

import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js"
import { clamp } from "../core/math"

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.55 },
    uContrast: { value: 1.14 },
    uLift: { value: new THREE.Vector3(0.015, 0.018, 0.03) },
    uGain: { value: new THREE.Vector3(1.0, 0.98, 0.95) },
    uSaturation: { value: 0.78 },
    uShadowTint: { value: new THREE.Vector3(0.6, 0.66, 0.8) },
    uHighlightTint: { value: new THREE.Vector3(1.0, 0.96, 0.9) },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uDamage: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGain; uniform float uSaturation;
    uniform vec3 uShadowTint; uniform vec3 uHighlightTint; uniform float uGrain; uniform float uTime; uniform vec2 uResolution;
    uniform float uDamage;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = uLift + c.rgb * uGain;
      // Contrast as a power curve around a low pivot: the scenes are mostly dark, and a linear contrast around 0.5
      // would crush everything below it to black
      col = pow(max(col, 0.0) / 0.4, vec3(uContrast)) * 0.4;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation);
      // Split toning: cool shadows, warm highlights; the tints are normalised so they shift hue, not brightness
      vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.15, 0.75, l));
      col *= tint / dot(tint, vec3(0.299, 0.587, 0.114));
      // Gentle S-curve on the upper range (on clamped values: the curve folds negative inputs back up)
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.3 * smoothstep(0.1, 0.5, l));
      // Film grain, weaker in the highlights
      col += (hash(floor(vUv * uResolution) + uTime) - 0.5) * uGrain * (1.0 - l * 0.6);
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d) * 2.2;
      col *= 1.0 - smoothstep(0.25, 1.05, r2) * uVignette;
      // Red pulse at low health / on hit
      col = mix(col, vec3(0.5, 0.02, 0.02), uDamage * smoothstep(0.25, 0.9, r2));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
}

interface GradePreset {
  sat: number
  contrast: number
  vignette: number
  lift: [number, number, number]
  gain: [number, number, number]
  shadowTint: [number, number, number]
  highlightTint: [number, number, number]
}

// Highlights only slightly warm: a stronger tint turns a clear noon sky beige
const BASE_PRESET: GradePreset = { sat: 0.78, contrast: 1.14, vignette: 0.55, lift: [0.015, 0.018, 0.03], gain: [1.0, 0.98, 0.95], shadowTint: [0.6, 0.66, 0.8], highlightTint: [1.0, 0.96, 0.9] }

const PRESETS: Record<string, Partial<GradePreset>> = {
  village: { sat: 0.82, shadowTint: [0.62, 0.68, 0.8] },
  forest: { sat: 0.72, shadowTint: [0.58, 0.7, 0.72] },
  graveyard: { sat: 0.6, contrast: 1.2, vignette: 0.65 },
  castle: { sat: 0.7, gain: [0.98, 0.97, 1.0] },
  fortress: { sat: 0.7, gain: [0.98, 0.97, 1.0] },
  city: { sat: 0.75 },
  monastery: { sat: 0.8, highlightTint: [1.0, 0.96, 0.88] },
  catacombs: { sat: 0.65, vignette: 0.72, lift: [0.02, 0.02, 0.035] },
}

export class PostProcess {
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private grade: ShaderPass | null = null
  private renderPass: RenderPass | null = null
  private bloomBase = 0.34
  private preset: GradePreset = BASE_PRESET
  private grainAmount = 0.035
  private frame = 0
  private lastDaylight = 1
  private lastUnderground = false
  enabled = true

  constructor(private renderer: THREE.WebGLRenderer) {}

  setup(scene: THREE.Scene, camera: THREE.Camera, quality: "low" | "medium" | "high"): void {
    this.dispose()
    if (quality === "low") {
      this.enabled = false
      return
    }
    this.enabled = true
    const size = this.renderer.getSize(new THREE.Vector2())
    const pr = this.renderer.getPixelRatio()
    const px = size.x * pr * size.y * pr
    // MSAA: 4× on high unless the frame is very large, 2× otherwise
    const samples = quality === "high" ? (px > 3.5e6 ? 2 : 4) : 2
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { samples, type: THREE.HalfFloatType })
    this.composer = new EffectComposer(this.renderer, target)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    this.bloomBase = quality === "high" ? 0.34 : 0.26
    // Threshold above 1 (HDR target): only flames, beacons and glowing eyes bloom, not sunlit walls
    this.bloom = new UnrealBloomPass(new THREE.Vector2((size.x * pr) / 2, (size.y * pr) / 2), this.bloomBase, 0.38, 1.15)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
    // addPass sizes every pass to the full frame: bloom works at half resolution (its own mip chain halves again)
    this.bloom.setSize((size.x * pr) / 2, (size.y * pr) / 2)
    const noGrain = typeof window !== "undefined" && window.location.search.includes("nograin")
    this.grainAmount = noGrain ? 0 : 0.035
    this.grade.uniforms.uGrain.value = this.grainAmount
    this.grade.uniforms.uResolution.value.set(size.x * pr, size.y * pr)
    this.applyPreset()
    this.setMood(this.lastDaylight, this.lastUnderground)
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.renderPass) {
      this.renderPass.scene = scene
      this.renderPass.camera = camera
    }
  }

  /** 0..1 red edge for low health. */
  setDamage(v: number): void {
    if (this.grade) this.grade.uniforms.uDamage.value = v
  }

  /** Colour grade per biome (unknown names fall back to the base look). */
  setGrade(biome: string): void {
    this.preset = { ...BASE_PRESET, ...(PRESETS[biome] ?? {}) }
    this.applyPreset()
    this.setMood(this.lastDaylight, this.lastUnderground)
  }

  private applyPreset(): void {
    if (!this.grade) return
    const u = this.grade.uniforms
    const p = this.preset
    u.uContrast.value = p.contrast
    u.uVignette.value = p.vignette
    ;(u.uLift.value as THREE.Vector3).fromArray(p.lift)
    ;(u.uGain.value as THREE.Vector3).fromArray(p.gain)
    ;(u.uShadowTint.value as THREE.Vector3).fromArray(p.shadowTint)
    ;(u.uHighlightTint.value as THREE.Vector3).fromArray(p.highlightTint)
    u.uSaturation.value = p.sat
  }

  /** Bloom and saturation follow the time of day: nights glow more and lose colour. */
  setMood(daylight: number, underground: boolean): void {
    this.lastDaylight = daylight
    this.lastUnderground = underground
    const night = 1 - clamp(daylight, 0, 1)
    if (this.bloom) {
      this.bloom.strength = this.bloomBase + night * 0.18 + (underground ? 0.1 : 0)
      this.bloom.threshold = 1.15 - night * 0.25
    }
    if (this.grade) this.grade.uniforms.uSaturation.value = this.preset.sat - night * 0.12
  }

  resize(w: number, h: number): void {
    const pr = this.renderer.getPixelRatio()
    this.composer?.setSize(w, h)
    this.bloom?.setSize((w * pr) / 2, (h * pr) / 2)
    if (this.grade) this.grade.uniforms.uResolution.value.set(w * pr, h * pr)
  }

  /**
   * Compiles every material of a scene for the target the composer renders into (tone mapping and output colour
   * space differ between the screen and the HDR target), so the first frame and first loot drop do not stall.
   */
  compile(scene: THREE.Scene, camera: THREE.Camera): void {
    const prev = this.renderer.getRenderTarget()
    if (this.enabled && this.composer) this.renderer.setRenderTarget(this.composer.renderTarget1)
    this.renderer.compile(scene, camera)
    this.renderer.setRenderTarget(prev)
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.enabled && this.composer) {
      this.setScene(scene, camera)
      if (this.grade) this.grade.uniforms.uTime.value = (this.frame++ % 1000) * 0.37
      this.composer.render()
    } else this.renderer.render(scene, camera)
  }

  dispose(): void {
    this.composer?.dispose()
    this.composer = null
    this.bloom = null
    this.grade = null
    this.renderPass = null
  }
}
