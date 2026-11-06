// Gore: dismemberment, gibs, arterial sprays, blood pools, blood trails, bloody weapons and blood on the screen.
// Body parts are cut from the real character mesh: the skinned vertices of a limb are baked into a static mesh that
// flies off with simple physics, while the limb's bone is collapsed on the body. Disabled with settings.gore = false.

import * as THREE from "three"
import { cosmetic } from "../core/rng"
import type { Humanoid } from "./humanoid"
import type { Particles } from "./particles"
import type { Decals } from "./decals"
import type { Hit } from "../world/collision"

export type BodyPart = "head" | "armL" | "armR" | "legL" | "legR" | "torso"

/** Skeleton bones that make up each body part (glTF rig). The first entry is the bone that gets collapsed. */
const BLOOD_DRY = new THREE.Color(0x4a0004)
const PART_BONES: Record<BodyPart, string[]> = {
  head: ["Head"],
  armL: ["upperarm_l", "lowerarm_l", "hand_l"],
  armR: ["upperarm_r", "lowerarm_r", "hand_r"],
  legL: ["thigh_l", "calf_l", "foot_l", "ball_l"],
  legR: ["thigh_r", "calf_r", "foot_r", "ball_r"],
  torso: ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "clavicle_l", "clavicle_r"],
}

interface Gib {
  mesh: THREE.Object3D
  vel: THREE.Vector3
  spin: THREE.Vector3
  radius: number
  age: number
  life: number
  resting: boolean
  bleed: number
  dripTimer: number
  owned: THREE.Material[]
}

interface Fountain {
  bone: THREE.Object3D
  time: number
  duration: number
  pulse: number
  dir: THREE.Vector3
  power: number
}

const BLOOD = 0x5a0006
const BLOOD_BRIGHT = 0x8a0a0e
const MAX_GIBS = 140

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _q = new THREE.Quaternion()

/** An irregular blood splatter as an SVG data URL: a smooth liquid blob with a few tendrils, droplets and runs. */
function splatSvg(seed: number): string {
  let r = seed * 9301 + 49297
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
  const n = 40
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6]
  const tendrils = [rnd() * n, rnd() * n, rnd() * n].map(Math.floor)
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    // Smooth wobble plus a few thin tendrils
    let rad = 24 + Math.sin(a * 3 + ph[0]) * 3.5 + Math.sin(a * 5 + ph[1]) * 2.2 + Math.sin(a * 9 + ph[2]) * 1.2
    for (const t of tendrils) if (Math.abs(i - t) < 1) rad += 12 + rnd() * 8
    pts.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad])
  }
  // Closed path through the midpoints with quadratic curves: no hard corners
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  let d = `M${mid(pts[n - 1], pts[0]).map((v) => v.toFixed(1)).join(",")}`
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)}`
  }
  let drops = ""
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2
    const dist = 32 + rnd() * 16
    drops += `<ellipse cx="${(50 + Math.cos(a) * dist).toFixed(1)}" cy="${(50 + Math.sin(a) * dist).toFixed(1)}" rx="${(0.8 + rnd() * 2.6).toFixed(1)}" ry="${(0.8 + rnd() * 2.2).toFixed(1)}"/>`
  }
  // Runs: blood running down from the lower edge
  for (let i = 0; i < 3; i++) {
    const x = 36 + rnd() * 28
    const len = 10 + rnd() * 20
    drops += `<rect x="${x.toFixed(1)}" y="62" width="${(1.4 + rnd() * 1.6).toFixed(1)}" height="${len.toFixed(1)}" rx="1"/><circle cx="${(x + 1).toFixed(1)}" cy="${(62 + len).toFixed(1)}" r="${(1.6 + rnd()).toFixed(1)}"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx="0.45" cy="0.42"><stop offset="0" stop-color="#2a0002"/><stop offset="0.55" stop-color="#560006"/><stop offset="1" stop-color="#7a060c"/></radialGradient></defs><g fill="url(#g)" fill-opacity="0.92"><path d="${d} Z"/>${drops}</g><ellipse cx="42" cy="38" rx="7" ry="3.5" fill="#ffffff" fill-opacity="0.08"/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function ancestorBone(o: THREE.Object3D): THREE.Bone | null {
  for (let p = o.parent; p; p = p.parent) if ((p as THREE.Bone).isBone) return p as THREE.Bone
  return null
}

export class Gore {
  enabled = true
  private gibs: Gib[] = []
  private fountains: Fountain[] = []
  private chunkGeos: THREE.BufferGeometry[] = []
  private fleshMat = new THREE.MeshStandardMaterial({ color: 0x6a0a0c, roughness: 0.35, metalness: 0.05, emissive: 0x200000, emissiveIntensity: 0.4 })
  private boneMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6 })
  private gutMat = new THREE.MeshStandardMaterial({ color: 0x8a3a40, roughness: 0.3, metalness: 0.05 })
  private stubGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.09, 6)
  private gutGeo = new THREE.CapsuleGeometry(0.035, 0.25, 2, 5)
  private shardGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.2, 5)
  private screen: HTMLDivElement | null = null
  private screenBlobs: HTMLDivElement[] = []
  private screenLevel = 0
  /** Segment cast against walls, trees and palisades (set by the expedition) for blood on vertical surfaces. */
  wallCast: ((ax: number, ay: number, az: number, bx: number, by: number, bz: number) => Hit | null) | null = null
  /** Kills so far this run, used to make the weapon bloodier. */
  weaponBlood = 0

  constructor(
    private scene: THREE.Scene,
    private heightAt: (x: number, z: number) => number,
    private particles: Particles,
    private decals: Decals,
  ) {
    for (let i = 0; i < 6; i++) {
      const g = new THREE.IcosahedronGeometry(0.09 + i * 0.015, 0)
      const p = g.getAttribute("position") as THREE.BufferAttribute
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * cosmetic.range(0.6, 1.4), p.getY(k) * cosmetic.range(0.5, 1.2), p.getZ(k) * cosmetic.range(0.6, 1.4))
      g.computeVertexNormals()
      this.chunkGeos.push(g)
    }
    if (typeof document !== "undefined") {
      const el = document.createElement("div")
      el.className = "gore-screen"
      el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:none;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(90,0,6,0.45) 100%)"
      for (let i = 0; i < 9; i++) {
        const b = document.createElement("div")
        b.style.cssText = `position:absolute;background-repeat:no-repeat;background-size:contain;background-image:url("${splatSvg(i)}");filter:drop-shadow(0 2px 2px rgba(0,0,0,0.35))`
        el.appendChild(b)
        this.screenBlobs.push(b)
      }
      document.body.appendChild(el)
      this.screen = el
    }
  }

  // ---- blood --------------------------------------------------------------------------------

  /** Directional spray from a wound; dir points away from the attacker. */
  spray(x: number, y: number, z: number, dir: THREE.Vector3, amount: number, force = 1): void {
    const tint = this.enabled ? BLOOD_BRIGHT : 0x6a6a66
    this.particles.spray(x, y, z, dir.x, dir.y + 0.35, dir.z, { count: Math.round(amount), color: tint, cone: 0.55, speed: 4.5 * force, life: 0.9, size: 0.13, gravity: 13 })
    this.particles.spray(x, y, z, dir.x, dir.y + 0.1, dir.z, { count: Math.round(amount * 0.5), color: BLOOD, cone: 0.9, speed: 2.4 * force, life: 1.2, size: 0.22, gravity: 11 })
    if (!this.enabled) return
    // Splatters on the ground behind the victim, stretched along the spray
    const n = 1 + Math.floor(force * 2)
    for (let i = 0; i < n; i++) {
      const d = 0.6 + i * 0.7 * force + cosmetic.range(0, 0.5)
      this.decals.spawn(x + dir.x * d, z + dir.z * d, 0.45 + force * 0.3, { dirX: dir.x, dirZ: dir.z, stretch: 1.6 + force })
    }
    this.wallSplat(x, y, z, dir.x, dir.z, 1.6 + force * 1.4, 0.4 + force * 0.25)
  }

  /** Blood thrown against a wall or tree within reach of (x, y, z) in direction (dx, dz). */
  wallSplat(x: number, y: number, z: number, dx: number, dz: number, reach: number, size: number): boolean {
    if (!this.enabled || !this.wallCast) return false
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) return false
    const ux = dx / len
    const uz = dz / len
    const hit = this.wallCast(x, y, z, x + ux * reach, y - 0.35 * reach, z + uz * reach)
    if (!hit || (hit.nx === 0 && hit.nz === 0)) return false
    const c = hit.collider
    // Thin trunks and posts would leave a splat hanging in the air
    if (c.kind === "circle" ? c.r < 0.35 : Math.max(c.hw, c.hd) < 0.4 || c.y1 - c.y0 < 0.7) return false
    const px = x + ux * reach * hit.t
    const pz = z + uz * reach * hit.t
    let py = y - 0.35 * reach * hit.t
    const s = c.kind === "circle" ? Math.min(size, c.r * 1.3) : size
    py = Math.min(Math.max(py, c.y0 + s * 0.4), c.y1 - s * 0.45)
    this.decals.spawnWall(px, py, pz, hit.nx, hit.nz, s, cosmetic.range(1, 1.5))
    // Runs trickling down from the splat
    const runs = cosmetic.int(1, 3)
    for (let i = 0; i < runs; i++) {
      const w = s * cosmetic.range(0.18, 0.3)
      const l = cosmetic.range(2.5, 5)
      const off = cosmetic.range(-0.3, 0.3) * s
      const ry = Math.max(c.y0 + w * l * 0.5, py - s * 0.1 - w * l * 0.5)
      this.decals.spawnWall(px - hit.nz * off, ry, pz + hit.nx * off, hit.nx, hit.nz, w, l)
    }
    return true
  }

  /** Big burst (death, explosion). */
  burst(x: number, y: number, z: number, amount = 40): void {
    this.particles.spray(x, y, z, 0, 1, 0, { count: amount, color: BLOOD_BRIGHT, cone: 1.4, speed: 5.5, life: 1.1, size: 0.16, gravity: 13 })
    this.particles.spray(x, y, z, 0, 1, 0, { count: Math.round(amount * 0.6), color: BLOOD, cone: 1.6, speed: 3, life: 1.4, size: 0.28, gravity: 10 })
    if (!this.enabled) return
    for (let i = 0; i < 5; i++) {
      const a = cosmetic.range(0, Math.PI * 2)
      const d = cosmetic.range(0.4, 2.2)
      this.decals.spawn(x + Math.cos(a) * d, z + Math.sin(a) * d, cosmetic.range(0.4, 1), { dirX: Math.cos(a), dirZ: Math.sin(a), stretch: cosmetic.range(1, 2.5) })
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + cosmetic.range(-0.4, 0.4)
      this.wallSplat(x, y, z, Math.cos(a), Math.sin(a), 2.8, cosmetic.range(0.5, 0.95))
    }
  }

  /** A pool that grows under a corpse. */
  pool(x: number, z: number, size = 2): void {
    if (!this.enabled) return
    this.decals.spawn(x, z, size, { grow: 5, opacity: 0.95, pool: true })
  }

  /** Drips from a wounded enemy (call while it moves). */
  drip(x: number, z: number): void {
    if (!this.enabled) return
    this.decals.spawn(x, z, cosmetic.range(0.15, 0.32), { opacity: 0.8 })
  }

  /** Long smear along (dx, dz), e.g. behind a crawling body. */
  smear(x: number, z: number, dx: number, dz: number): void {
    if (!this.enabled) return
    this.decals.spawn(x, z, cosmetic.range(0.28, 0.4), { dirX: dx, dirZ: dz, stretch: cosmetic.range(2.6, 3.6), opacity: cosmetic.range(0.6, 0.8) })
  }

  private dripClock = 0
  private readonly _box = new THREE.Box3()

  /** A bloody blade drips: drops fall from it now and then and leave small spots (call every frame). */
  weaponDrips(weapon: THREE.Object3D | null, dt: number): void {
    if (!this.enabled || !weapon || this.weaponBlood < 0.12 || !weapon.visible) return
    this.dripClock -= dt
    if (this.dripClock > 0) return
    // More blood, more drops: every 0.25-1.6 s
    this.dripClock = cosmetic.range(0.25, 0.5) / Math.max(0.3, this.weaponBlood) + cosmetic.range(0, 0.4)
    this._box.setFromObject(weapon)
    if (this._box.isEmpty()) return
    const b = this._box
    const x = cosmetic.range(b.min.x, b.max.x)
    const z = cosmetic.range(b.min.z, b.max.z)
    const y = cosmetic.range(b.min.y, (b.min.y + b.max.y) / 2)
    this.particles.spray(x, y, z, 0, -1, 0, { count: 2, color: BLOOD, cone: 0.2, speed: 0.4, life: 0.7, size: 0.07, gravity: 14 })
    if (cosmetic.chance(0.5)) this.decals.spawn(x, z, cosmetic.range(0.1, 0.2), { opacity: 0.85 })
  }

  /** Red splatter across the screen; strength 0..1. */
  splatScreen(strength: number): void {
    if (!this.enabled || !this.screen) return
    this.screenLevel = Math.min(1, Math.max(this.screenLevel, strength))
    const shown = Math.round(3 + strength * 6)
    this.screenBlobs.forEach((b, i) => {
      if (i >= shown) {
        b.style.opacity = "0"
        return
      }
      // Splats gather at the edges of the view so the centre stays readable
      const s = cosmetic.range(90, 260) * (0.6 + strength * 0.8)
      b.style.width = `${s}px`
      b.style.height = `${s}px`
      const side = cosmetic.int(0, 3)
      const x = side === 0 ? cosmetic.range(-4, 16) : side === 1 ? cosmetic.range(84, 104) : cosmetic.range(5, 95)
      const y = side === 2 ? cosmetic.range(-4, 14) : side === 3 ? cosmetic.range(78, 100) : cosmetic.range(5, 95)
      b.style.left = `${x}%`
      b.style.top = `${y}%`
      b.style.transform = `translate(-50%,-50%) rotate(${cosmetic.range(0, 360)}deg)`
      b.style.opacity = `${cosmetic.range(0.75, 1)}`
    })
  }

  /** Blood on a weapon: its materials get darker and redder with every kill. */
  bloodyWeapon(weapon: THREE.Object3D | null): void {
    if (!this.enabled || !weapon) return
    this.weaponBlood = Math.min(1, this.weaponBlood + 0.12)
    this.tintWeapon(weapon)
  }

  private rinsed = 0

  /** Rain slowly washes the blade clean (amount per second at full rain). */
  rinseWeapon(weapon: THREE.Object3D | null, rain: number, dt: number): void {
    if (!weapon || this.weaponBlood <= 0 || rain < 0.2) return
    const d = Math.min(this.weaponBlood, rain * dt * 0.02)
    this.weaponBlood -= d
    this.rinsed += d
    // Re-tinting walks the weapon's materials: only once the colour changed visibly
    if (this.rinsed > 0.03 || this.weaponBlood === 0) {
      this.rinsed = 0
      this.tintWeapon(weapon)
    }
  }

  private tintWeapon(weapon: THREE.Object3D): void {
    weapon.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]
      const out = mats.map((mat) => {
        // Own copy per weapon, remembering the clean colour and roughness (black colours count as set too)
        const own = "bloodBase" in mat.userData ? mat : mat.clone()
        if (!("bloodBase" in own.userData)) {
          own.userData.bloodBase = own.color.getHex()
          own.userData.bloodRough = own.roughness ?? 0.6
        }
        own.color.setHex(own.userData.bloodBase as number).lerp(BLOOD_DRY, this.weaponBlood * 0.75)
        own.roughness = Math.max(0.2, (own.userData.bloodRough as number) * (1 - this.weaponBlood * 0.3))
        return own
      })
      m.material = Array.isArray(m.material) ? out : out[0]
    })
  }

  /** Makes a body bloodier (materials are per character). */
  stain(h: Humanoid, amount: number): void {
    if (!this.enabled || !h.rig) return
    for (const m of h.rig.materials) {
      if (!m.userData.cleanColor) m.userData.cleanColor = m.color.getHex()
      const level = Math.min(0.55, ((m.userData.stain as number) ?? 0) + amount)
      m.userData.stain = level
      m.color.setHex(m.userData.cleanColor as number).lerp(new THREE.Color(0x5a0a08), level)
    }
  }

  // ---- dismemberment -------------------------------------------------------------------------

  /**
   * Cuts a body part off a glTF character: the part flies away as a baked mesh, the stump gets a flesh cap
   * and spurts blood. Returns false for procedural bodies (they only get chunks).
   */
  /** Cuts a part off; with gib = false the part does not fly off whole (it burst: the caller adds chunks). */
  sever(h: Humanoid, part: BodyPart, dir: THREE.Vector3, force = 1, fountain = true, gibbed = true): boolean {
    if (!this.enabled) return false
    const rig = h.rig
    if (!rig) {
      h.root.getWorldPosition(_v)
      this.chunks(_v.x, _v.y + 1.2, _v.z, dir, 4)
      return false
    }
    const rootBone = rig.bones.get(PART_BONES[part][0])
    if (!rootBone || rootBone.scale.x < 0.01) return false
    h.root.updateMatrixWorld(true)
    const gib = gibbed ? this.bake(h, part) : null
    rootBone.getWorldPosition(_v)
    if (gib) {
      gib.mesh.position.add(_v)
      const g = this.addGib(gib.mesh, dir, force, gib.radius, gib.owned)
      g.bleed = 2.5
    }
    // Collapse the limb on the body
    rootBone.scale.setScalar(0.0001)
    // Flesh cap and bone stub at the stump
    const parent = rootBone.parent
    if (parent) {
      const cap = new THREE.Mesh(this.chunkGeos[3], this.fleshMat)
      cap.scale.setScalar(part === "head" ? 0.9 : 0.6)
      parent.add(cap)
      parent.worldToLocal(cap.position.copy(_v))
      const stub = new THREE.Mesh(this.stubGeo, this.boneMat)
      cap.add(stub)
      stub.position.y = 0.05
    }
    this.spray(_v.x, _v.y, _v.z, dir, 26 * force, 1.2 * force)
    if (fountain && parent) {
      const fdir = new THREE.Vector3()
      parent.getWorldPosition(fdir)
      fdir.subVectors(_v, fdir).normalize()
      this.fountains.push({ bone: parent, time: 0, duration: part === "head" ? 4 : 2.5, pulse: 0, dir: fdir, power: part === "head" ? 1.4 : 1 })
    }
    return true
  }

  /** An old wound: the limb is simply missing (no gib, no fountain), with a raw stump. */
  amputate(h: Humanoid, part: BodyPart): void {
    if (!this.enabled || !h.rig) return
    const bone = h.rig.bones.get(PART_BONES[part][0])
    if (!bone || !bone.parent) return
    bone.scale.setScalar(0.0001)
    const cap = new THREE.Mesh(this.chunkGeos[1], this.fleshMat)
    cap.scale.setScalar(0.55)
    bone.parent.add(cap)
    cap.position.copy(bone.position)
    const stub = new THREE.Mesh(this.stubGeo, this.boneMat)
    cap.add(stub)
    stub.position.y = 0.05
  }

  /** Blows a character apart: every body part becomes a gib, plus guts, bone shards and a huge splash. */
  explode(h: Humanoid, dir: THREE.Vector3, force = 1.4): void {
    if (!this.enabled) return
    h.root.getWorldPosition(_w)
    const cx = _w.x
    const cy = _w.y + 1
    const cz = _w.z
    if (h.rig) {
      for (const part of ["head", "armL", "armR", "legL", "legR", "torso"] as BodyPart[]) {
        const d = dir.clone().add(new THREE.Vector3(cosmetic.range(-0.8, 0.8), cosmetic.range(0.2, 1), cosmetic.range(-0.8, 0.8))).normalize()
        this.sever(h, part, d, force * cosmetic.range(0.8, 1.3), false)
      }
      h.root.visible = false
    }
    this.chunks(cx, cy, cz, dir, 14)
    this.burst(cx, cy, cz, 70)
    this.pool(cx, cz, 2.8)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      this.decals.spawn(cx + Math.cos(a) * cosmetic.range(1, 3.2), cz + Math.sin(a) * cosmetic.range(1, 3.2), cosmetic.range(0.5, 1.2), { dirX: Math.cos(a), dirZ: Math.sin(a), stretch: 2.5 })
    }
  }

  /** Meat chunks, gut strands and bone shards. */
  chunks(x: number, y: number, z: number, dir: THREE.Vector3, count: number): void {
    if (!this.enabled) return
    for (let i = 0; i < count; i++) {
      const r = cosmetic.next()
      let mesh: THREE.Mesh
      if (r < 0.6) mesh = new THREE.Mesh(this.chunkGeos[i % this.chunkGeos.length], cosmetic.chance(0.5) ? this.fleshMat : this.gutMat)
      else if (r < 0.8) {
        mesh = new THREE.Mesh(this.gutGeo, this.gutMat)
        mesh.scale.set(1, cosmetic.range(0.6, 1.4), 1)
      } else {
        mesh = new THREE.Mesh(this.shardGeo, this.boneMat)
        mesh.scale.set(1, cosmetic.range(0.5, 1.4), 1)
      }
      mesh.position.set(x + cosmetic.range(-0.2, 0.2), y + cosmetic.range(-0.3, 0.3), z + cosmetic.range(-0.2, 0.2))
      mesh.rotation.set(cosmetic.range(0, 6), cosmetic.range(0, 6), cosmetic.range(0, 6))
      mesh.castShadow = true
      this.scene.add(mesh)
      const d = dir.clone().add(new THREE.Vector3(cosmetic.range(-1, 1), cosmetic.range(0.3, 1.4), cosmetic.range(-1, 1))).normalize()
      const g = this.addGib(mesh, d, cosmetic.range(0.7, 1.5), 0.08, [])
      g.bleed = 1.2
    }
  }

  /** Bakes the current skinned shape of a body part into a static mesh centred on its root bone. */
  private bake(h: Humanoid, part: BodyPart): { mesh: THREE.Group; radius: number; owned: THREE.Material[] } | null {
    const rig = h.rig!
    const names = new Set<string>()
    const rootBone = rig.bones.get(PART_BONES[part][0])!
    if (part === "torso") for (const n of PART_BONES.torso) names.add(n)
    else rootBone.traverse((o) => names.add(o.name))
    rootBone.getWorldPosition(_v)
    const group = new THREE.Group()
    const owned: THREE.Material[] = []
    let radius = 0.1
    const pos = new THREE.Vector3()
    for (const mesh of rig.meshes) {
      if (!mesh.parent || !mesh.visible) continue
      const geo = mesh.geometry
      const skinIndex = geo.getAttribute("skinIndex")
      const skinWeight = geo.getAttribute("skinWeight")
      const index = geo.getIndex()
      if (!index) continue
      const rigidBone = !mesh.isSkinnedMesh ? ancestorBone(mesh) : null
      if (!mesh.isSkinnedMesh && !(rigidBone && names.has(rigidBone.name))) continue
      const bones = mesh.isSkinnedMesh ? mesh.skeleton.bones : []
      const inPart = new Uint8Array(geo.getAttribute("position").count)
      let any = !mesh.isSkinnedMesh
      if (!mesh.isSkinnedMesh) inPart.fill(1)
      for (let v = 0; mesh.isSkinnedMesh && skinIndex && skinWeight && v < inPart.length; v++) {
        let best = 0
        let bw = -1
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(v, k)
          if (w > bw) {
            bw = w
            best = skinIndex.getComponent(v, k)
          }
        }
        if (names.has(bones[best]?.name ?? "")) {
          inPart[v] = 1
          any = true
        }
      }
      if (!any) continue
      // Gather triangles of the part and bake their skinned world positions
      const remap = new Map<number, number>()
      const positions: number[] = []
      const uvs: number[] = []
      const cols: number[] = []
      const tris: number[] = []
      const uv = geo.getAttribute("uv")
      // Merged equipment (helmets) keeps its colours in vertex colours on a white material
      const col = (mesh.material as THREE.MeshStandardMaterial).vertexColors ? geo.getAttribute("color") : undefined
      mesh.updateMatrixWorld(true)
      for (let t = 0; t < index.count; t += 3) {
        const a = index.getX(t)
        const b = index.getX(t + 1)
        const c = index.getX(t + 2)
        if (!(inPart[a] && inPart[b] && inPart[c])) continue
        for (const v of [a, b, c]) {
          let n = remap.get(v)
          if (n === undefined) {
            n = positions.length / 3
            remap.set(v, n)
            mesh.getVertexPosition(v, pos)
            pos.applyMatrix4(mesh.matrixWorld).sub(_v)
            positions.push(pos.x, pos.y, pos.z)
            radius = Math.max(radius, Math.min(0.5, pos.length() * 0.6))
            if (uv) uvs.push(uv.getX(v), uv.getY(v))
            if (col) cols.push(col.getX(v), col.getY(v), col.getZ(v))
          }
          tris.push(n)
        }
      }
      if (!tris.length) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
      if (uvs.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
      if (cols.length) g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3))
      g.setIndex(tris)
      g.computeVertexNormals()
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      mat.emissive = new THREE.Color(0x000000)
      mat.vertexColors = cols.length > 0
      owned.push(mat)
      const m = new THREE.Mesh(g, mat)
      m.castShadow = true
      group.add(m)
    }
    if (!group.children.length) return null
    // A raw flesh cap where the part was cut off
    const cap = new THREE.Mesh(this.chunkGeos[2], this.fleshMat)
    cap.scale.setScalar(part === "head" ? 0.8 : 0.55)
    group.add(cap)
    this.scene.add(group)
    return { mesh: group, radius, owned }
  }

  private addGib(mesh: THREE.Object3D, dir: THREE.Vector3, force: number, radius: number, owned: THREE.Material[]): Gib {
    if (mesh.parent !== this.scene) this.scene.add(mesh)
    const g: Gib = {
      mesh,
      vel: dir.clone().multiplyScalar(3.2 * force).add(new THREE.Vector3(0, 2.2 * force, 0)),
      spin: new THREE.Vector3(cosmetic.range(-8, 8), cosmetic.range(-8, 8), cosmetic.range(-8, 8)).multiplyScalar(force),
      radius,
      age: 0,
      life: 70,
      resting: false,
      bleed: 0,
      dripTimer: 0,
      owned,
    }
    this.gibs.push(g)
    while (this.gibs.length > MAX_GIBS) this.removeGib(this.gibs.shift()!)
    return g
  }

  private removeGib(g: Gib): void {
    g.mesh.removeFromParent()
    g.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !this.shared(m.geometry)) m.geometry.dispose()
    })
    for (const m of g.owned) m.dispose()
  }

  private shared(g: THREE.BufferGeometry): boolean {
    return this.chunkGeos.includes(g) || g === this.stubGeo || g === this.gutGeo || g === this.shardGeo
  }

  // ---- simulation ----------------------------------------------------------------------------

  update(dt: number): void {
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i]
      g.age += dt
      const p = g.mesh.position
      if (!g.resting) {
        g.vel.y -= 16 * dt
        p.addScaledVector(g.vel, dt)
        _q.setFromEuler(new THREE.Euler(g.spin.x * dt, g.spin.y * dt, g.spin.z * dt))
        g.mesh.quaternion.multiply(_q)
        const ground = this.heightAt(p.x, p.z) + g.radius * 0.5
        if (p.y < ground) {
          p.y = ground
          if (Math.abs(g.vel.y) > 1.5) {
            // Bounce and leave a splat where it landed
            g.vel.y = -g.vel.y * 0.28
            g.vel.x *= 0.55
            g.vel.z *= 0.55
            g.spin.multiplyScalar(0.5)
            if (g.bleed > 0) {
              this.decals.spawn(p.x, p.z, 0.35 + g.radius, { dirX: g.vel.x, dirZ: g.vel.z, stretch: 1.6 })
              this.particles.spray(p.x, p.y, p.z, 0, 1, 0, { count: 6, color: BLOOD, cone: 1.2, speed: 1.6, life: 0.5, size: 0.1, gravity: 12 })
            }
          } else {
            g.resting = true
            if (g.bleed > 0) this.decals.spawn(p.x, p.z, 0.5 + g.radius * 1.5, { grow: 3, pool: true })
          }
        }
        // Blood trail while flying
        g.dripTimer -= dt
        if (g.bleed > 0 && g.dripTimer <= 0) {
          g.dripTimer = 0.04
          this.particles.spray(p.x, p.y, p.z, 0, -1, 0, { count: 2, color: BLOOD_BRIGHT, cone: 0.4, speed: 0.6, life: 0.6, size: 0.09, gravity: 12 })
        }
      }
      g.bleed = Math.max(0, g.bleed - dt)
      if (g.age > g.life - 6) g.mesh.position.y -= dt * 0.08
      if (g.age > g.life) {
        this.removeGib(g)
        this.gibs.splice(i, 1)
      }
    }
    // Arterial fountains from stumps: pulsing with the heartbeat, weakening over time
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i]
      f.time += dt
      f.pulse -= dt
      if (f.pulse <= 0) {
        f.pulse = 0.22
        const k = 1 - f.time / f.duration
        f.bone.getWorldPosition(_v)
        _v.addScaledVector(f.dir, 0.12)
        this.particles.spray(_v.x, _v.y, _v.z, f.dir.x, f.dir.y + 0.6, f.dir.z, { count: Math.round(10 * k * f.power) + 2, color: BLOOD_BRIGHT, cone: 0.35, speed: 3.8 * k * f.power + 0.6, life: 0.9, size: 0.11, gravity: 13 })
        if (cosmetic.chance(0.35)) this.decals.spawn(_v.x + f.dir.x * 0.8, _v.z + f.dir.z * 0.8, cosmetic.range(0.2, 0.45), { opacity: 0.85 })
      }
      if (f.time > f.duration) this.fountains.splice(i, 1)
    }
    // Screen blood fades
    if (this.screen) {
      this.screenLevel = Math.max(0, this.screenLevel - dt * 0.45)
      this.screen.style.opacity = `${Math.min(0.85, this.screenLevel * 1.2)}`
    }
  }

  dispose(): void {
    for (const g of this.gibs) this.removeGib(g)
    this.gibs = []
    this.fountains = []
    for (const g of [...this.chunkGeos, this.stubGeo, this.gutGeo, this.shardGeo]) g.dispose()
    this.fleshMat.dispose()
    this.boneMat.dispose()
    this.gutMat.dispose()
    this.screen?.remove()
    this.screen = null
  }
}
