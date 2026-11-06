// The camp as a 3D backdrop for the hub menus: campfire, tents, palisade and buildings that appear as they are built.

import * as THREE from "three"
import { Sky } from "./sky"
import * as P from "./props"
import { kitProp } from "./kitProps"
import { StaticBatcher, disposeMeshes } from "./batcher"
import { buildHumanoid, disposeHumanoid, type Humanoid } from "./humanoid"
import { Animator } from "./animator"
import { Particles } from "./particles"
import { mat } from "./materials"
import { Rng } from "../core/rng"
import type { Profile } from "../core/types"

export class CampScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private sky: Sky
  private merged: THREE.Mesh[] = []
  private hero: Humanoid | null = null
  private heroAnim: Animator | null = null
  private particles: Particles
  private flames: THREE.Object3D[] = []
  private fireLight: THREE.PointLight
  private t = 0
  private levelsKey = ""
  private root = new THREE.Group()

  constructor(shadows: boolean) {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500)
    this.sky = new Sky(this.scene, shadows)
    this.sky.hour = 19.6
    this.sky.speed = 0
    this.particles = new Particles(this.scene)
    this.fireLight = new THREE.PointLight(0xff9a40, 12, 25, 1.5)
    this.fireLight.position.set(0, 1.2, 0)
    this.scene.add(this.fireLight)
    this.scene.add(this.root)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 32), mat("grass", { repeat: 24 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
  }

  /** Rebuilds the props when building levels change. */
  build(profile: Profile | null): void {
    const key = profile ? JSON.stringify(profile.camp) + profile.classId + (profile.loadout.equipment.body?.defId ?? "") + (profile.loadout.equipment.head?.defId ?? "") : "none"
    if (key === this.levelsKey) return
    this.levelsKey = key
    disposeMeshes(this.merged)
    this.root.clear()
    this.flames = []
    const batcher = new StaticBatcher()
    const rng = new Rng(42)
    const add = (p: P.Prop, x: number, z: number, yaw = 0) => {
      p.group.position.set(x, 0, z)
      p.group.rotation.y = yaw
      this.root.add(p.group)
      batcher.addGroup(p.group)
      return p
    }
    const fire = P.campfire()
    add(fire, 0, 0)
    this.flames.push(fire.flame)
    add(P.tent(1), -7, 5, 0.6)
    add(P.tent(2), 7, 6, -0.7)
    add(P.logPile(), -3, 6, 0.3)
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.55 + (i / 8) * Math.PI * 1.1
      add(P.palisade(9), Math.cos(a) * 22, Math.sin(a) * 22, a + Math.PI / 2)
    }
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2)
      const d = rng.range(28, 60)
      add(P.tree(rng.chance(0.5) ? "pine" : "oak", rng.range(0.9, 1.4), i), Math.cos(a) * d, Math.sin(a) * d, rng.range(0, 6))
    }
    const lv = (id: string) => profile?.camp[id] ?? 0
    if (lv("smithy") > 0) {
      add(P.anvilStand(), -10, -6, 0)
      add(P.house({ w: 6, d: 5, stone: lv("smithy") >= 2, seed: 5, roof: "thatch" }), -14, -10, 0.8)
      const t = P.torchPost()
      add(t, -9, -3)
      this.flames.push(t.flame)
    }
    if (lv("armory") > 0) add(P.house({ w: 5, d: 4, stone: lv("armory") >= 3, seed: 6 }), 12, -10, -0.8)
    if (lv("storage") > 0) {
      add(P.crate(0.9), 9, -4, 0.3)
      add(P.barrel(), 10.5, -3.5)
      if (lv("storage") >= 2) add(P.barn(3), 18, -2, -1.4)
    }
    if (lv("infirmary") > 0) add(P.tent(3), -12, 2, 1.3)
    if (lv("merchant") > 0) {
      add(P.marketStall(2), 6, -2, -0.3)
      add(P.cart(3), 11, 2, 0.4)
    }
    if (lv("workshop") > 0) {
      add(P.logPile(), 4, -7, 1)
      add(P.house({ w: 5, d: 5, seed: 7, roof: "thatch" }), 3, -12, 0.2)
    }
    if (lv("alchemy") > 0) {
      add(P.tent(4), -6, -8, 2.2)
      const t = P.torchPost()
      add(t, -4, -5)
      this.flames.push(t.flame)
    }
    if (lv("defense") > 0) {
      for (let i = 0; i < 3; i++) add(P.palisade(8), -16 + i * 16, 16, 0)
      if (lv("defense") >= 2) add(P.tower(2, 7), 20, 14)
      if (lv("defense") >= 3) add(P.tower(2, 7), -20, 14)
    }
    // Kit props bring the camp to life: training dummy and weapon stand from the start, workshop pieces with the buildings
    const kit = (name: string, x: number, z: number, yaw = 0, scale = 1) => {
      const k = kitProp(name, scale)
      if (k) add({ group: k, colliders: [] }, x, z, yaw)
    }
    kit("Dummy", -4.5, -3.5, 0.6)
    kit("WeaponStand", 4.5, 3.8, -2.4)
    kit("Bench", -2.6, 2.6, 0.9)
    kit("Barrel", -8.2, 3.2, 0.3)
    kit("Bucket_Wooden_1", -1.6, 3.4, 0.4)
    kit("Crate_Wooden", 8.6, 4.5, 0.2)
    if (lv("smithy") > 0) {
      kit("Anvil", -8.8, -5.2, 0.4)
      kit("Workbench", -11.5, -4.2, 0.9)
    }
    if (lv("alchemy") > 0) {
      kit("Cauldron", 1.5, -5.5, 0)
      kit("Shelf_Simple", 0, -7.4, 0)
    }
    if (lv("merchant") > 0) kit("Stall_Cart_Empty", 6, -2, -0.3)
    if (lv("storage") > 0) {
      kit("Barrel_Apples", 11.6, -4.4, 0.6)
      kit("FarmCrate_Carrot", 9.2, -6, 1.2)
    }
    if (lv("defense") > 0) {
      kit("Banner_1", -5, 15, 0, 0.9)
      kit("Banner_2", 5, 15, 0, 0.9)
    }
    this.merged = batcher.build(this.scene)
    // Hero by the fire
    if (this.hero) disposeHumanoid(this.hero)
    this.hero = null
    if (profile) {
      const body = profile.loadout.equipment.body?.defId ?? ""
      const head = profile.loadout.equipment.head?.defId ?? ""
      this.hero = buildHumanoid({
        shirt: profile.classId === "knight" ? 0x3a4a7a : profile.classId === "ranger" ? 0x3a5a3a : 0x3a3a3a,
        armor: body.includes("plate") ? "plate" : body.includes("brig") ? "brigandine" : body.includes("chain") ? "chain" : body.includes("leather") ? "leather" : body.includes("gamb") ? "gambeson" : "none",
        helmet: head.includes("great") ? "great" : head.includes("basc") ? "bascinet" : head.includes("nasal") ? "nasal" : head.includes("kettle") ? "kettle" : head.includes("hood") ? "hood" : "none",
        skinTexture: "cloth",
        seed: 7,
        female: profile.female === true,
      })
      this.hero.root.position.set(2.2, 0, 1.4)
      this.hero.root.rotation.y = -2.2
      this.scene.add(this.hero.root)
      this.heroAnim = new Animator(this.hero)
      this.heroAnim.play("idle")
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  update(dt: number, render: (scene: THREE.Scene, camera: THREE.Camera) => void): void {
    this.t += dt
    const a = this.t * 0.05
    this.camera.position.set(Math.sin(a) * 11, 3.2 + Math.sin(this.t * 0.2) * 0.3, Math.cos(a) * 11)
    this.camera.lookAt(0, 1.2, 0)
    this.sky.update(0, new THREE.Vector3(0, 0, 0))
    this.sky.setFill(this.camera.position, new THREE.Vector3(0, 1, 0))
    this.fireLight.intensity = 11 + Math.sin(this.t * 13) * 2 + Math.sin(this.t * 31) * 1.3
    for (const f of this.flames) f.scale.setScalar(0.9 + Math.sin(this.t * 17 + f.id) * 0.12)
    if (Math.random() < dt * 6) this.particles.embers(0, 0.5, 0, 1)
    if (Math.random() < dt * 1.5) this.particles.smoke(0, 0.9, 0, 1)
    this.particles.update(dt)
    if (this.heroAnim) this.heroAnim.update(dt)
    render(this.scene, this.camera)
  }
}
