/**
 * viewmodel.ts — first-person weapons and arms. Rendered in a separate scene with its own camera after the world
 * (depth cleared), so weapons never clip into walls and keep their framing regardless of the gameplay FOV.
 * Model space: origin = rear sight on the sight line, forward = -Z, so the ADS pose simply centres the sights.
 * Animations are procedural: hip/ADS blend, walk/sprint bob, mouse sway, recoil spring, reload (magazine or shell),
 * shotgun pump, weapon switch, grenade throw, muzzle flash and ejected casings.
 */
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import type { WeaponId } from "./types"

export interface ViewModelState {
  weapon: WeaponId
  /** 0..1 aim-down-sights blend. */
  ads: number
  /** Horizontal speed relative to walking speed (0 = still, 1 = walk, ~1.5 = sprint). */
  move: number
  sprinting: boolean
  crouched: boolean
  /** Mouse look this frame (radians) for sway. */
  lookYaw: number
  lookPitch: number
  /** 0..1 progress of the current reload step, or -1 when not reloading. */
  reload: number
  /** Shotgun loads shells one by one. */
  shellReload: boolean
  /** 0..1 weapon switch animation (0.5 = fully lowered), -1 = none. */
  switching: number
  /** 0..1 grenade throw animation, -1 = none. */
  throwing: number
  /** Light level of the scene around the player (0 dark .. 1 bright). */
  light: number
  flashlight: boolean
}

interface Pose { px: number; py: number; pz: number; rx: number; ry: number; rz: number }
interface Model {
  root: THREE.Group
  mag: THREE.Object3D | null
  pump: THREE.Object3D | null
  leftArm: THREE.Object3D
  muzzle: THREE.Vector3
  eject: THREE.Vector3
  hip: Pose
  ads: Pose
  /** Recoil strength multiplier. */
  kick: number
  /** Hide the model at full ADS (scoped rifle). */
  scoped: boolean
}

const mats = {
  metal: new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.48, metalness: 0.6 }),
  metalLight: new THREE.MeshStandardMaterial({ color: 0x5d666c, roughness: 0.4, metalness: 0.7 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x3d4238, roughness: 0.78, metalness: 0.05 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x7d6e52, roughness: 0.85, metalness: 0.02 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x5b3b24, roughness: 0.7, metalness: 0.0 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.92 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4a5141, roughness: 0.95 }),
  cuff: new THREE.MeshStandardMaterial({ color: 0x3b3f35, roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.1, metalness: 0.9, emissive: 0x0a2a30, emissiveIntensity: 0.5 }),
  sightDot: new THREE.MeshBasicMaterial({ color: 0xffd36b }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.35, metalness: 0.9 }),
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m
}
/** Cylinder along the Z axis. */
function tube(parent: THREE.Object3D, r: number, len: number, x: number, y: number, z: number, mat: THREE.Material, seg = 10, r2 = r): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m
}

/** Forearm + glove from an elbow point (off screen) to a hand point. */
function arm(parent: THREE.Object3D, hand: THREE.Vector3, elbow: THREE.Vector3, left: boolean): THREE.Group {
  const g = new THREE.Group(); parent.add(g)
  const dir = new THREE.Vector3().subVectors(hand, elbow), len = dir.length()
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.043, len, 10), mats.sleeve)
  fore.position.copy(elbow).addScaledVector(dir, 0.5); fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); g.add(fore)
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.035, 10), mats.cuff)
  cuff.position.copy(hand).addScaledVector(dir, -0.06 / len); cuff.quaternion.copy(fore.quaternion); g.add(cuff)
  const palm = box(g, 0.05, 0.035, 0.085, hand.x, hand.y, hand.z, mats.glove)
  palm.quaternion.copy(fore.quaternion); palm.rotateX(Math.PI / 2)
  const fingers = box(g, 0.048, 0.03, 0.05, 0, 0, 0, mats.glove)
  fingers.position.copy(hand).add(new THREE.Vector3(left ? 0.012 : -0.012, 0.012, -0.02)); fingers.rotation.set(0.4, 0, left ? -0.5 : 0.5)
  const thumb = box(g, 0.018, 0.018, 0.05, 0, 0, 0, mats.glove)
  thumb.position.copy(hand).add(new THREE.Vector3(left ? 0.028 : -0.028, 0.02, -0.03)); thumb.rotation.set(0.2, left ? 0.3 : -0.3, 0)
  return g
}

function buildRifle(): Model {
  const root = new THREE.Group(), w = new THREE.Group(); root.add(w)
  const bore = -0.062
  box(w, 0.052, 0.072, 0.30, 0, -0.07, 0.03, mats.metal)                    // upper/lower receiver
  box(w, 0.03, 0.012, 0.34, 0, -0.03, -0.02, mats.metalLight)               // top rail
  for (let i = 0; i < 8; i++) box(w, 0.034, 0.006, 0.012, 0, -0.022, 0.12 - i * 0.04, mats.metal)
  box(w, 0.058, 0.062, 0.30, 0, -0.068, -0.27, mats.polymer)                // handguard
  for (const s of [-1, 1]) box(w, 0.004, 0.03, 0.22, s * 0.03, -0.068, -0.27, mats.metal)
  tube(w, 0.011, 0.24, 0, bore, -0.53, mats.metal)                          // barrel
  tube(w, 0.017, 0.06, 0, bore, -0.67, mats.metalLight, 8)                  // muzzle brake
  box(w, 0.012, 0.03, 0.012, 0, -0.022, -0.41, mats.metal)                  // front sight post base
  box(w, 0.004, 0.022, 0.004, 0, -0.004, -0.41, mats.metalLight)            // front post (tip at y≈0)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0022, 6, 18), mats.metal); ring.position.set(0, 0.0, 0.03); w.add(ring) // rear aperture
  box(w, 0.012, 0.02, 0.02, 0, -0.018, 0.03, mats.metal)
  box(w, 0.032, 0.095, 0.042, 0, -0.145, 0.1, mats.polymer, -0.32)          // pistol grip
  box(w, 0.012, 0.005, 0.07, 0, -0.112, 0.045, mats.metal)                  // trigger guard
  box(w, 0.045, 0.072, 0.2, 0, -0.08, 0.27, mats.polymer)                   // stock
  box(w, 0.05, 0.09, 0.03, 0, -0.088, 0.38, mats.glove)                     // butt pad
  box(w, 0.008, 0.02, 0.05, 0.03, -0.055, 0.0, mats.metalLight)             // charging handle / ejection port cover
  const mag = new THREE.Group(); mag.position.set(0, -0.11, -0.07); w.add(mag)
  box(mag, 0.03, 0.15, 0.065, 0, -0.065, -0.012, mats.metal, 0.18)
  const lf = arm(w, new THREE.Vector3(0, -0.11, -0.3), new THREE.Vector3(-0.2, -0.36, 0.06), true)
  arm(w, new THREE.Vector3(0.005, -0.15, 0.1), new THREE.Vector3(0.14, -0.33, 0.42), false)
  return { root, mag, pump: null, leftArm: lf, muzzle: new THREE.Vector3(0, bore, -0.71), eject: new THREE.Vector3(0.03, -0.055, 0.0), hip: { px: 0.15, py: -0.15, pz: -0.4, rx: 0.02, ry: 0.03, rz: 0 }, ads: { px: 0, py: 0, pz: -0.19, rx: 0, ry: 0, rz: 0 }, kick: 1, scoped: false }
}

function buildSmg(): Model {
  const root = new THREE.Group(), w = new THREE.Group(); root.add(w)
  const bore = -0.05
  box(w, 0.048, 0.07, 0.26, 0, -0.06, -0.05, mats.metal)
  box(w, 0.028, 0.012, 0.24, 0, -0.022, -0.06, mats.metalLight)
  box(w, 0.05, 0.05, 0.12, 0, -0.06, -0.24, mats.polymer)
  tube(w, 0.012, 0.12, 0, bore, -0.34, mats.metal)
  tube(w, 0.02, 0.09, 0, bore, -0.43, mats.polymer, 10)                    // suppressor-like shroud
  box(w, 0.004, 0.02, 0.004, 0, -0.006, -0.17, mats.metalLight)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0022, 6, 18), mats.metal); ring.position.set(0, 0, 0.04); w.add(ring)
  box(w, 0.03, 0.09, 0.04, 0, -0.13, 0.03, mats.polymer, -0.25)
  box(w, 0.012, 0.012, 0.22, 0.02, -0.06, 0.18, mats.metalLight)           // folding stock rails
  box(w, 0.012, 0.012, 0.22, -0.02, -0.06, 0.18, mats.metalLight)
  box(w, 0.05, 0.07, 0.02, 0, -0.07, 0.29, mats.glove)
  const mag = new THREE.Group(); mag.position.set(0, -0.095, -0.12); w.add(mag)
  box(mag, 0.026, 0.17, 0.035, 0, -0.08, 0, mats.metal, 0.05)
  const lf = arm(w, new THREE.Vector3(0, -0.15, -0.12), new THREE.Vector3(-0.21, -0.36, 0.1), true)
  arm(w, new THREE.Vector3(0.005, -0.13, 0.03), new THREE.Vector3(0.15, -0.33, 0.36), false)
  return { root, mag, pump: null, leftArm: lf, muzzle: new THREE.Vector3(0, bore, -0.48), eject: new THREE.Vector3(0.03, -0.045, -0.05), hip: { px: 0.14, py: -0.14, pz: -0.36, rx: 0.02, ry: 0.035, rz: 0 }, ads: { px: 0, py: 0, pz: -0.2, rx: 0, ry: 0, rz: 0 }, kick: 0.7, scoped: false }
}

function buildShotgun(): Model {
  const root = new THREE.Group(), w = new THREE.Group(); root.add(w)
  const bore = -0.03
  box(w, 0.05, 0.075, 0.24, 0, -0.055, -0.02, mats.metal)
  tube(w, 0.016, 0.62, 0, bore, -0.44, mats.metal)                          // barrel
  tube(w, 0.014, 0.5, 0, bore - 0.036, -0.38, mats.metal)                   // magazine tube
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), mats.sightDot); bead.position.set(0, -0.012, -0.73); w.add(bead)
  box(w, 0.01, 0.012, 0.6, 0, -0.012, -0.44, mats.metalLight)               // vent rib
  box(w, 0.012, 0.012, 0.012, 0, -0.008, 0.06, mats.metal)                  // rear notch
  const pump = new THREE.Group(); pump.position.set(0, bore - 0.036, -0.38); w.add(pump)
  for (let i = 0; i < 5; i++) tube(pump, 0.026, 0.024, 0, 0, -0.06 + i * 0.03, mats.wood, 10)
  box(w, 0.04, 0.1, 0.06, 0, -0.12, 0.11, mats.wood, -0.35)                 // grip
  box(w, 0.045, 0.08, 0.26, 0, -0.09, 0.3, mats.wood, 0.06)                 // stock
  box(w, 0.05, 0.1, 0.03, 0, -0.1, 0.44, mats.glove, 0.06)
  const lf = arm(pump, new THREE.Vector3(0, -0.035, 0), new THREE.Vector3(-0.22, -0.32, 0.38), true)
  arm(w, new THREE.Vector3(0.005, -0.13, 0.11), new THREE.Vector3(0.15, -0.33, 0.45), false)
  return { root, mag: null, pump, leftArm: lf, muzzle: new THREE.Vector3(0, bore, -0.76), eject: new THREE.Vector3(0.03, -0.04, -0.04), hip: { px: 0.15, py: -0.14, pz: -0.4, rx: 0.02, ry: 0.03, rz: 0 }, ads: { px: 0, py: 0, pz: -0.2, rx: 0, ry: 0, rz: 0 }, kick: 1.8, scoped: false }
}

function buildDmr(): Model {
  const root = new THREE.Group(), w = new THREE.Group(); root.add(w)
  const bore = -0.07
  box(w, 0.054, 0.075, 0.34, 0, -0.08, 0.03, mats.tan)
  box(w, 0.06, 0.065, 0.32, 0, -0.078, -0.3, mats.tan)
  tube(w, 0.012, 0.36, 0, bore, -0.62, mats.metal)
  tube(w, 0.018, 0.07, 0, bore, -0.82, mats.metal, 8)
  // scope: sight line passes through the tube centre (y = 0)
  tube(w, 0.022, 0.24, 0, 0, -0.08, mats.metal, 14)
  tube(w, 0.026, 0.06, 0, 0, -0.22, mats.metal, 14, 0.032)
  tube(w, 0.024, 0.05, 0, 0, 0.06, mats.metal, 14)
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), mats.glass); lens.position.set(0, 0, -0.252); lens.rotation.y = Math.PI; w.add(lens)
  box(w, 0.016, 0.03, 0.02, 0, -0.03, -0.14, mats.metal); box(w, 0.016, 0.03, 0.02, 0, -0.03, -0.0, mats.metal)
  box(w, 0.034, 0.1, 0.045, 0, -0.16, 0.12, mats.polymer, -0.3)
  box(w, 0.048, 0.085, 0.24, 0, -0.09, 0.3, mats.tan)
  box(w, 0.052, 0.1, 0.03, 0, -0.1, 0.43, mats.glove)
  const mag = new THREE.Group(); mag.position.set(0, -0.12, -0.06); w.add(mag)
  box(mag, 0.03, 0.09, 0.07, 0, -0.04, 0, mats.metal)
  const lf = arm(w, new THREE.Vector3(0, -0.13, -0.32), new THREE.Vector3(-0.21, -0.37, 0.05), true)
  arm(w, new THREE.Vector3(0.005, -0.16, 0.12), new THREE.Vector3(0.14, -0.34, 0.44), false)
  return { root, mag, pump: null, leftArm: lf, muzzle: new THREE.Vector3(0, bore, -0.86), eject: new THREE.Vector3(0.03, -0.06, 0.0), hip: { px: 0.15, py: -0.15, pz: -0.42, rx: 0.02, ry: 0.03, rz: 0 }, ads: { px: 0, py: 0, pz: -0.16, rx: 0, ry: 0, rz: 0 }, kick: 1.6, scoped: true }
}

function buildPistol(): Model {
  const root = new THREE.Group(), w = new THREE.Group(); root.add(w)
  const bore = -0.022
  box(w, 0.03, 0.032, 0.19, 0, -0.018, -0.085, mats.metal)                  // slide
  box(w, 0.028, 0.026, 0.15, 0, -0.045, -0.095, mats.polymer)               // frame
  box(w, 0.0035, 0.012, 0.006, 0, 0.003, -0.17, mats.sightDot)              // front sight
  for (const s of [-1, 1]) box(w, 0.006, 0.01, 0.008, s * 0.0075, 0.002, -0.0, mats.metal) // rear notch
  box(w, 0.03, 0.11, 0.045, 0, -0.1, -0.005, mats.polymer, -0.22)           // grip
  box(w, 0.01, 0.005, 0.045, 0, -0.065, -0.05, mats.metal)                  // trigger guard
  const mag = new THREE.Group(); mag.position.set(0, -0.15, 0.01); w.add(mag)
  box(mag, 0.026, 0.02, 0.04, 0, 0, 0, mats.metal)
  const lf = arm(w, new THREE.Vector3(-0.012, -0.1, -0.01), new THREE.Vector3(-0.2, -0.34, 0.28), true)
  arm(w, new THREE.Vector3(0.006, -0.095, 0.01), new THREE.Vector3(0.15, -0.33, 0.33), false)
  return { root, mag, pump: null, leftArm: lf, muzzle: new THREE.Vector3(0, bore, -0.19), eject: new THREE.Vector3(0.018, -0.01, -0.06), hip: { px: 0.12, py: -0.12, pz: -0.42, rx: 0.03, ry: 0.05, rz: 0 }, ads: { px: 0, py: 0, pz: -0.4, rx: 0, ry: 0, rz: 0 }, kick: 1.2, scoped: false }
}

function makeFlashTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,250,220,1)"); grad.addColorStop(0.25, "rgba(255,200,90,0.9)"); grad.addColorStop(0.6, "rgba(255,120,30,0.25)"); grad.addColorStop(1, "rgba(255,90,20,0)")
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  g.globalCompositeOperation = "lighter"; g.strokeStyle = "rgba(255,220,140,0.8)"; g.lineWidth = 3
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

export class ViewModel {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(54, 1, 0.01, 10)
  private models: Record<WeaponId, Model>
  private holder = new THREE.Group()
  private current: WeaponId = "mk4"
  private hemi = new THREE.HemisphereLight(0xc8d6e0, 0x2a2620, 1.2)
  private key = new THREE.DirectionalLight(0xfff0dc, 1.6)
  private torch = new THREE.PointLight(0xfff4e0, 0, 2.5)
  private flash: THREE.Group
  private flashLight = new THREE.PointLight(0xffb45a, 0, 3)
  private flashTime = 0
  private recoil = 0
  private recoilVel = 0
  private sway = { x: 0, y: 0 }
  private bobTime = 0
  private sprintBlend = 0
  private crouchBlend = 0
  private casings: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = []
  private flashTexture = makeFlashTexture()
  private pumpAnim = 0
  visible = false

  constructor() {
    this.scene.add(this.hemi); this.key.position.set(-1, 2, 1); this.scene.add(this.key)
    this.torch.position.set(0.1, 0.05, -0.2); this.scene.add(this.torch)
    this.models = { p9: buildPistol(), mk4: buildRifle(), vx9: buildSmg(), kv12: buildShotgun(), dr7: buildDmr() }
    for (const m of Object.values(this.models)) { m.root.visible = false; this.holder.add(m.root) }
    this.scene.add(this.holder)
    const flashMat = new THREE.MeshBasicMaterial({ map: this.flashTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    this.flash = new THREE.Group()
    const star = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), flashMat); this.flash.add(star)
    for (let i = 0; i < 2; i++) { const side = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.2), flashMat); side.position.z = -0.08; side.rotation.set(Math.PI / 2, 0, i * Math.PI / 2); this.flash.add(side) }
    this.flash.add(this.flashLight); this.flash.visible = false; this.scene.add(this.flash)
    const casingGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6)
    for (let i = 0; i < 12; i++) { const mesh = new THREE.Mesh(casingGeo, mats.brass); mesh.visible = false; this.scene.add(mesh); this.casings.push({ mesh, vel: new THREE.Vector3(), life: 0 }) }
    this.setWeapon("mk4")
  }

  /** Image-based lighting so metal parts reflect something (without it, metal renders nearly black). */
  initEnvironment(renderer: THREE.WebGLRenderer): void {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = env; this.envTexture = env
    pmrem.dispose()
  }
  private envTexture: THREE.Texture | null = null

  setWeapon(id: WeaponId): void {
    this.models[this.current].root.visible = false
    this.current = id
    this.models[id].root.visible = true
    this.recoil = 0; this.recoilVel = 0
  }

  get isScoped(): boolean { return this.models[this.current].scoped }

  /** Call when a shot is fired. */
  fire(): void {
    const m = this.models[this.current]
    this.recoilVel += 1.1 * m.kick
    this.flashTime = 0.05
    this.flash.rotation.z = Math.random() * Math.PI
    const s = 0.8 + Math.random() * 0.5; this.flash.scale.setScalar(s * (this.current === "kv12" ? 1.6 : this.current === "p9" ? 0.7 : 1))
    if (this.current === "kv12") this.pumpAnim = 0.0001
    else this.ejectCasing()
  }

  private ejectCasing(): void {
    const c = this.casings.find(k => k.life <= 0) ?? this.casings[0]
    const m = this.models[this.current]
    c.mesh.position.copy(m.eject); m.root.localToWorld(c.mesh.position)
    c.vel.set(0.9 + Math.random() * 0.5, 0.9 + Math.random() * 0.5, 0.25 + Math.random() * 0.2)
    c.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
    c.life = 0.7; c.mesh.visible = true
  }

  setAspect(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix() }

  update(dt: number, s: ViewModelState): void {
    if (s.weapon !== this.current) this.setWeapon(s.weapon)
    const m = this.models[this.current]
    this.holder.visible = this.visible
    // lighting follows the scene light level so the gun is not glowing at night
    const lightLevel = 0.25 + s.light * 0.9
    this.hemi.intensity = 0.4 + lightLevel * 0.6; this.key.intensity = lightLevel * 1.4
    this.scene.environmentIntensity = 0.12 + s.light * 0.5 + (s.flashlight ? 0.15 : 0)
    this.torch.intensity = s.flashlight ? 1.2 : 0
    // spring-damped recoil
    this.recoilVel += (-this.recoil * 260 - this.recoilVel * 22) * dt
    this.recoil += this.recoilVel * dt
    // sway: weapon lags behind mouse movement
    const swayScale = 1 - s.ads * 0.8
    this.sway.x += (THREE.MathUtils.clamp(-s.lookYaw * 1.6, -0.08, 0.08) * swayScale - this.sway.x) * Math.min(1, dt * 10)
    this.sway.y += (THREE.MathUtils.clamp(s.lookPitch * 1.6, -0.08, 0.08) * swayScale - this.sway.y) * Math.min(1, dt * 10)
    this.sprintBlend += ((s.sprinting && s.reload < 0 ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 9)
    this.crouchBlend += ((s.crouched ? 1 : 0) - this.crouchBlend) * Math.min(1, dt * 8)
    const moveAmount = Math.min(1.6, s.move)
    this.bobTime += dt * (s.sprinting ? 13 : 9) * (moveAmount > 0.05 ? 1 : 0)
    const bobAmp = moveAmount * (1 - s.ads * 0.85) * (s.crouched ? 0.6 : 1)
    const breathe = Math.sin(performance.now() * 0.0012) * 0.0025 * (1 - s.ads * 0.7)

    const a = s.ads, h = m.hip, d = m.ads
    let px = h.px + (d.px - h.px) * a, py = h.py + (d.py - h.py) * a, pz = h.pz + (d.pz - h.pz) * a
    let rx = h.rx * (1 - a), ry = h.ry * (1 - a), rz = h.rz * (1 - a)
    px += Math.sin(this.bobTime) * 0.011 * bobAmp + this.sway.x * 0.25
    py += -Math.abs(Math.cos(this.bobTime)) * 0.011 * bobAmp + breathe + this.sway.y * 0.25 - this.crouchBlend * 0.008 * (1 - a)
    ry += this.sway.x; rx += this.sway.y; rz += this.sway.x * 0.5 + Math.sin(this.bobTime) * 0.012 * bobAmp
    // sprint: weapon lowered and canted
    const sp = this.sprintBlend * (1 - a)
    px += -0.04 * sp; py += -0.06 * sp; pz += 0.04 * sp; rx += -0.35 * sp; ry += 0.55 * sp; rz += 0.3 * sp
    // recoil: back, up and a small roll
    pz += this.recoil * 0.028 * (1 - a * 0.4); rx += this.recoil * 0.05; py += this.recoil * 0.004
    // reload: magazine drops and comes back; weapon tilts toward the left hand
    if (s.reload >= 0) {
      const r = s.reload, tilt = Math.sin(Math.min(1, r) * Math.PI)
      if (s.shellReload) { rz += 0.25 * tilt; rx += 0.08 * tilt; py -= 0.015 * tilt }
      else { rz += 0.55 * tilt; rx += 0.18 * tilt; py -= 0.03 * tilt; px -= 0.02 * tilt }
      if (m.mag) {
        const out = r < 0.45 ? THREE.MathUtils.smoothstep(r, 0.12, 0.38) : 1 - THREE.MathUtils.smoothstep(r, 0.55, 0.82)
        m.mag.position.y = (this.current === "p9" ? -0.15 : this.current === "vx9" ? -0.095 : this.current === "dr7" ? -0.12 : -0.11) - out * 0.3
        m.leftArm.position.y = -out * 0.2; m.leftArm.position.z = out * 0.1
      }
      if (s.shellReload) m.leftArm.position.y = -0.04 * Math.sin(r * Math.PI * 2) ** 2
    } else if (m.mag) {
      m.mag.position.y = this.current === "p9" ? -0.15 : this.current === "vx9" ? -0.095 : this.current === "dr7" ? -0.12 : -0.11
      m.leftArm.position.set(0, 0, 0)
    }
    // shotgun pump after each shot
    if (m.pump) {
      if (this.pumpAnim > 0) { this.pumpAnim += dt; if (this.pumpAnim > 0.55) this.pumpAnim = 0 }
      const t = this.pumpAnim > 0.15 ? Math.sin((this.pumpAnim - 0.15) / 0.4 * Math.PI) : 0
      m.pump.position.z = -0.38 + Math.max(0, t) * 0.09
    }
    // weapon switch: lower out of view and back
    if (s.switching >= 0) { const k = Math.sin(Math.min(1, s.switching) * Math.PI); py -= 0.3 * k; rx -= 0.7 * k }
    if (s.throwing >= 0) { const k = Math.sin(Math.min(1, s.throwing) * Math.PI); py -= 0.25 * k; rz -= 0.4 * k; px += 0.05 * k }
    this.holder.position.set(px, py, pz)
    this.holder.rotation.set(rx, ry, rz)
    // scoped rifles disappear behind the scope overlay at full zoom
    m.root.visible = !(m.scoped && s.ads > 0.92)
    // muzzle flash
    this.flashTime = Math.max(0, this.flashTime - dt)
    this.flash.visible = this.flashTime > 0 && m.root.visible
    if (this.flash.visible) { this.flash.position.copy(m.muzzle); m.root.localToWorld(this.flash.position) }
    this.flashLight.intensity = this.flashTime > 0 ? 2.5 : 0
    for (const c of this.casings) {
      if (c.life <= 0) continue
      c.life -= dt; c.vel.y -= 6 * dt; c.mesh.position.addScaledVector(c.vel, dt); c.mesh.rotation.x += dt * 20; c.mesh.rotation.z += dt * 13
      if (c.life <= 0) c.mesh.visible = false
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (!this.visible) return
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    this.flashTexture.dispose(); this.envTexture?.dispose()
  }
}

export function disposeViewModelMaterials(): void { for (const m of Object.values(mats)) m.dispose() }
