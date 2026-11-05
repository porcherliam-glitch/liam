// Weapon swing trail: a short ribbon between the grip and the tip of the weapon, fading over a few frames.

import * as THREE from "three"

const SAMPLES = 10

export class WeaponTrail {
  readonly mesh: THREE.Mesh
  private positions: Float32Array
  private alphas: Float32Array
  private head = 0
  private count = 0
  private tmpA = new THREE.Vector3()
  private tmpB = new THREE.Vector3()
  active = false

  constructor(scene: THREE.Scene, color = 0xfff2d0) {
    const geo = new THREE.BufferGeometry()
    this.positions = new Float32Array(SAMPLES * 2 * 3)
    this.alphas = new Float32Array(SAMPLES * 2)
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage))
    const index: number[] = []
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setIndex(index)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `attribute float aAlpha; varying float vA; void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor, vA * 0.28); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
    scene.add(this.mesh)
  }

  /** Adds the current grip/tip positions (world space). */
  push(grip: THREE.Object3D, tipOffset: number): void {
    grip.getWorldPosition(this.tmpA)
    this.tmpB.set(0, -tipOffset, 0).applyMatrix4(grip.matrixWorld)
    if (this.count === 0) {
      // Fresh swing: every sample starts at the current blade so no ribbon stretches to old positions
      for (let i = 0; i < SAMPLES; i++) {
        this.positions[i * 6] = this.tmpA.x
        this.positions[i * 6 + 1] = this.tmpA.y
        this.positions[i * 6 + 2] = this.tmpA.z
        this.positions[i * 6 + 3] = this.tmpB.x
        this.positions[i * 6 + 4] = this.tmpB.y
        this.positions[i * 6 + 5] = this.tmpB.z
        this.alphas[i * 2] = 0
        this.alphas[i * 2 + 1] = 0
      }
    }
    // shift samples
    for (let i = SAMPLES - 1; i > 0; i--) {
      for (let k = 0; k < 6; k++) this.positions[i * 6 + k] = this.positions[(i - 1) * 6 + k]
      this.alphas[i * 2] = this.alphas[(i - 1) * 2] * 0.8
      this.alphas[i * 2 + 1] = this.alphas[(i - 1) * 2 + 1] * 0.8
    }
    this.positions[0] = this.tmpA.x
    this.positions[1] = this.tmpA.y
    this.positions[2] = this.tmpA.z
    this.positions[3] = this.tmpB.x
    this.positions[4] = this.tmpB.y
    this.positions[5] = this.tmpB.z
    this.alphas[0] = 0.2
    this.alphas[1] = 1
    this.count = Math.min(SAMPLES, this.count + 1)
    this.mesh.visible = true
    this.active = true
    this.upload()
  }

  /** Fades the trail out when no swing is in progress. */
  update(): void {
    if (!this.active || !this.mesh.visible) return
    let any = false
    for (let i = 0; i < SAMPLES * 2; i++) {
      this.alphas[i] *= 0.72
      if (this.alphas[i] > 0.02) any = true
    }
    if (!any) {
      this.mesh.visible = false
      this.active = false
      this.count = 0
    }
    this.upload()
  }

  private upload(): void {
    ;(this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.mesh.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.removeFromParent()
  }
}
