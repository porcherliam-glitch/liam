// Post-processing: MSAA render target, bloom for fire and beacons, a vignette/colour-grade pass.
// Quality "low" renders directly without the composer.

import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js"

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.45 },
    uSaturation: { value: 0.92 },
    uTint: { value: new THREE.Vector3(0.98, 0.99, 1.04) },
    uDamage: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSaturation; uniform vec3 uTint; uniform float uDamage;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSaturation) * uTint;
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.35, 0.95, dot(d, d) * 2.2) * uVignette;
      c.rgb *= v;
      // red pulse at low health
      c.rgb = mix(c.rgb, vec3(0.5, 0.02, 0.02), uDamage * smoothstep(0.25, 0.9, dot(d, d) * 2.2));
      gl_FragColor = c;
    }`,
}

export class PostProcess {
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private grade: ShaderPass | null = null
  private renderPass: RenderPass | null = null
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
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { samples: quality === "high" ? 4 : 2, type: THREE.HalfFloatType })
    this.composer = new EffectComposer(this.renderer, target)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), quality === "high" ? 0.42 : 0.3, 0.5, 0.82)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
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

  resize(w: number, h: number): void {
    this.composer?.setSize(w, h)
    this.bloom?.setSize(w, h)
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.enabled && this.composer) {
      this.setScene(scene, camera)
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
