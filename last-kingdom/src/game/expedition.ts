// One expedition: builds the area, runs the simulation (player, zombies, projectiles, weather, hazards),
// handles interaction, loot, missions, extraction and death.

import * as THREE from "three"
import type { EntityContext } from "../entities/context"
import { Player } from "../entities/player"
import { Zombie } from "../entities/zombie"
import { Projectiles } from "../entities/projectiles"
import { buildWorld, type ContainerSite, type ExtractionSite, type WorldBuild } from "../world/worldgen"
import { areaDef } from "../world/areas"
import { Particles } from "../render/particles"
import { Decals } from "../render/decals"
import { Gore } from "../render/gore"
import { Crows } from "../render/crows"
import { Sky } from "../render/sky"
import { Weather, WEATHER_NAMES } from "../render/weather"
import { ThirdPersonCamera } from "../render/camera"
import type { Input } from "../input/input"
import type { AudioEngine } from "../audio/audio"
import type { ItemInstance, MissionDef, Profile, Settings } from "../core/types"
import { Rng } from "../core/rng"
import { events } from "../core/events"
import { zombieType } from "../entities/zombieTypes"
import { rollLoot } from "../items/loot"
import { createItem, displayName, itemWeight } from "../items/items"
import { addItem, countItem, removeItem } from "../items/inventory"
import { itemDef } from "../items/itemData"
import { Hud, type CompassMarker } from "../ui/hud"
import type { UI } from "../ui/ui"
import { LootScreen } from "../ui/screens/inventory"
import type { ExpeditionApi, RunMapData } from "./api"
import { buildHumanoid, disposeHumanoid, type Humanoid } from "../render/humanoid"
import { Animator } from "../render/animator"
import { skillBonuses } from "../meta/skillData"
import { campBonuses } from "../meta/campData"
import { fogUniforms, mat, materialQuality, setWetness, waterMaterial, windUniforms } from "../render/materials"
import { grassOptions } from "../render/grass"
import { kitProp } from "../render/kitProps"
import type { PostProcess } from "../render/postprocess"
import { RARITIES } from "../core/types"
import { clamp, damp, flicker, lerp, noise1 } from "../core/math"

interface Interactable {
  kind: "container" | "lever" | "extraction" | "pickup" | "survivor" | "arrow"
  x: number
  z: number
  label: string
  radius: number
  container?: ContainerSite
  extraction?: ExtractionSite
  pickup?: Pickup
  survivor?: Survivor
}

interface Pickup {
  items: ItemInstance[]
  gold: number
  object: THREE.Object3D
  x: number
  z: number
  y: number
  /** Glow colour by best rarity; epic and better borrow the shared loot light slot. */
  glow: number
  /** Index into RARITIES of the best item. */
  rarity: number
  /** Collected by walking over it (ammo). */
  auto?: boolean
}

interface Survivor {
  humanoid: Humanoid
  animator: Animator
  pos: THREE.Vector3
  yaw: number
  following: boolean
  rescued: boolean
  walkPhase: number
}

interface ActiveHazard {
  x: number
  z: number
  r: number
  remaining: number
  mesh?: THREE.Mesh
}

export interface ExpeditionCallbacks {
  onEnd: (result: { success: boolean; extractionName?: string; cause?: string }) => void
  openPause: () => void
  openInventory: () => void
}

// Loot beams: a soft light column fading upwards (additive, shared per colour)
const BEAM_GEO = new THREE.CylinderGeometry(0.06, 0.22, 2.2, 10, 1, true)
let beamTex: THREE.Texture | null = null
const beamMats = new Map<string, THREE.MeshBasicMaterial>()
function beamMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  const key = `${color}:${opacity}`
  let m = beamMats.get(key)
  if (m) return m
  if (!beamTex) {
    const c = document.createElement("canvas")
    c.width = 4
    c.height = 64
    const ctx = c.getContext("2d")!
    const grad = ctx.createLinearGradient(0, 0, 0, 64)
    grad.addColorStop(0, "rgba(0,0,0,1)")
    grad.addColorStop(0.55, "rgba(90,90,90,1)")
    grad.addColorStop(1, "rgba(255,255,255,1)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 4, 64)
    beamTex = new THREE.CanvasTexture(c)
  }
  m = new THREE.MeshBasicMaterial({ color, map: beamTex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true })
  beamMats.set(key, m)
  return m
}

export class Expedition implements ExpeditionApi {
  readonly scene = new THREE.Scene()
  readonly world: WorldBuild
  readonly player: Player
  readonly zombies: Zombie[] = []
  readonly projectiles = new Projectiles()
  readonly particles: Particles
  readonly decals: Decals
  readonly gore: Gore
  private crows: Crows | null = null
  readonly sky: Sky
  readonly weather: Weather
  readonly camera: ThirdPersonCamera
  readonly rng: Rng
  readonly hud: Hud
  readonly areaId: string
  elapsed = 0
  kills = 0
  bossKills = 0
  runXp = 0
  runGold = 0
  bestRarity = 0
  private ctx: EntityContext
  private pickups: Pickup[] = []
  private survivor: Survivor | null = null
  private hazards: ActiveHazard[] = []
  private boss: Zombie | null = null
  private extracting: { site: ExtractionSite; progress: number } | null = null
  private ended = false
  private unsub: (() => void)[] = []
  private spawnTimer = 20
  private flickerTime = 0
  /**
   * Fixed pool of point lights, created once with the world and never added or removed afterwards (a changing light
   * count recompiles every lit shader). Slot 0: the player's torch (free for flames while none is carried),
   * slot 1: epic loot glow or the extraction circle (free for flames otherwise), the rest: nearest flames.
   */
  private lights: THREE.PointLight[] = []
  /** World positions of the static flames, cached once. */
  private flamePos: THREE.Vector3[] = []
  /** Flame indices sorted by distance to the player (refreshed every few frames). */
  private flameOrder: number[] = []
  private flameDist: Float32Array = new Float32Array(0)
  private envFrame = 0
  /** Damped look-ahead of the shadow box (camera forward x 15 m, 8 m while locked on). */
  private shadowAhead = { x: 0, z: 0 }
  /** Thunder claps waiting for the sound to arrive (seconds of environment time). */
  private thunder: { at: number; volume: number; shake: boolean }[] = []
  private lastStrike = 0
  /** Static meshes that may be skipped when the fog hides them. */
  private cullables: { mesh: THREE.Object3D; center: THREE.Vector3; radius: number }[] = []
  private cullCut = Infinity
  private fogHidden = new WeakSet<Zombie>()
  private renderMsAvg = 0
  private updateMsAvg = 0
  private lastRenderMs = 0
  /** Expanding ring around the extraction circle while channelling. */
  private extractionPulse: THREE.Mesh
  /** Sample objects compiled before the first frame; kept so their shader programs stay cached. */
  private warmupObjects: THREE.Object3D | null = null
  private heightAt = (x: number, z: number): number => this.world.terrain.heightAt(x, z)
  private visitedPois = new Set<string>()
  private explorePoints = new Set<string>()
  private treasureChest: ContainerSite | null = null
  private explored: Uint8Array
  private exploredRes = 60
  private deathTimer = 0
  private floatQueue: { x: number; y: number; z: number; text: string; color: string }[] = []
  private lastPrompt: Interactable | null = null
  private tension = 0
  private fpsCounter = { frames: 0, time: 0, value: 60 }
  private hordeIndex = 0
  private skillsLuck: number
  private rainTimer = 0
  /** Rain wetness of ground materials (0..1), see setWetness. */
  private wetness = 0
  private wetApplied = 0
  private tmpV = new THREE.Vector3()
  private inventoryHold = 0
  private inventoryHoldFrames = 0
  private hitStopLeft = 0
  private tutorialQueue: [number, string][] = []
  /** Random condition of this expedition (shown in the HUD), or null. */
  readonly modifier: { id: string; name: string; description: string } | null = null
  private hordeRate = 1
  private bossIntroShown = false
  private tipKinds = new Set<string>()
  readonly missions: MissionDef[]

  constructor(
    public profile: Profile,
    areaId: string,
    private input: Input,
    private audio: AudioEngine,
    private settings: Settings,
    private ui: UI,
    private renderer: THREE.WebGLRenderer,
    private post: PostProcess,
    private callbacks: ExpeditionCallbacks,
    readonly night = false,
  ) {
    this.areaId = areaId
    const area = areaDef(areaId)
    this.rng = new Rng((Date.now() ^ area.seed) >>> 0)
    this.missions = profile.missions.filter((m) => m.status === "active")
    this.camera = new ThirdPersonCamera(settings.fov, window.innerWidth / window.innerHeight)
    this.camera.shakeEnabled = settings.cameraShake
    this.camera.targetDistance = this.camera.distance = settings.cameraDistance
    // No shadow pass under ground: the catacombs are lit by torches only
    this.sky = new Sky(this.scene, settings.shadows && area.biome !== "catacombs", settings.quality)
    this.sky.underground = area.biome === "catacombs"
    this.sky.hour = night ? 22.5 : this.rng.pick([7, 9, 12, 15, 17, 19, 21, 23, 2])
    if (night) this.sky.speed = 0.4
    this.weather = new Weather(this.scene, this.sky, area.seed ^ Date.now(), area.biome === "forest" ? "fog" : area.biome === "graveyard" ? (this.rng.chance(0.5) ? "fog" : "overcast") : undefined, settings.quality)
    this.particles = new Particles(this.scene)
    this.particles.setViewport(window.innerHeight)
    this.particles.gore = settings.gore
    // Quality switches read while the world is built
    materialQuality.normalMaps = settings.quality !== "low"
    grassOptions.count = settings.quality === "low" ? 3000 : settings.quality === "medium" ? 8000 : 14000
    this.world = buildWorld(area, this.scene)
    this.decals = new Decals(this.scene, (x, z) => this.world.terrain.heightAt(x, z))
    if (!this.world.underground) this.crows = new Crows(this.scene, area.size, area.seed)
    this.decals.enabled = settings.gore
    this.gore = new Gore(this.scene, (x, z) => this.world.terrain.heightAt(x, z), this.particles, this.decals)
    this.gore.enabled = settings.gore
    this.gore.wallCast = (ax, ay, az, bx, by, bz) => this.world.collision.segmentCast(ax, ay, az, bx, by, bz)
    this.player = new Player(profile, profile.loadout)
    this.skillsLuck = skillBonuses(profile.skills).lootLuck + (profile.classId === "rogue" ? 0.15 : 0) + (night ? 0.35 : 0)
    // Expedition modifiers: a third of all runs come with a twist
    if (this.rng.chance(0.35) && profile.stats.expeditions >= 1) {
      this.modifier = this.rng.pick([
        { id: "bloodmoon", name: "Blutmond", description: "Mehr Untote, bessere Beute." },
        { id: "fog", name: "Dichter Nebel", description: "Zombies sehen schlechter – du auch." },
        { id: "silence", name: "Totenstille", description: "Kaum Horden, aber magere Beute." },
        { id: "harvest", name: "Reiche Ernte", description: "Deutlich bessere Beute, die Toten riechen sie." },
        { id: "storm", name: "Unwetter", description: "Sturm die ganze Zeit; Lärm trägt weniger weit." },
      ])
      switch (this.modifier.id) {
        case "bloodmoon":
          this.skillsLuck += 0.3
          this.hordeRate = 1.6
          break
        case "fog":
          this.weather.setKind("fog")
          this.weather.locked = true
          break
        case "silence":
          this.skillsLuck -= 0.2
          this.hordeRate = 0.3
          break
        case "harvest":
          this.skillsLuck += 0.5
          this.hordeRate = 1.3
          break
        case "storm":
          this.weather.setKind("storm")
          this.weather.locked = true
          break
      }
    }
    this.hud = new Hud(input)
    this.explored = new Uint8Array(this.exploredRes * this.exploredRes)
    const self = this
    this.ctx = {
      scene: this.scene,
      world: this.world,
      particles: this.particles,
      gore: this.gore,
      audio,
      input,
      camera: this.camera,
      settings,
      sky: this.sky,
      weather: this.weather,
      zombies: this.zombies,
      player: this.player,
      projectiles: this.projectiles,
      rng: this.rng,
      get time() {
        return self.elapsed
      },
      noise: (x, z, r) => this.noise(x, z, r),
      floatText: (x, y, z, text, color) => this.floatQueue.push({ x, y, z, text, color }),
      dropLoot: (x, z, table, bonus) => this.dropLoot(x, z, table, bonus),
      summon: (x, z, typeId, count) => this.summon(x, z, typeId, count),
      plagueCloud: (x, z, r, s) => this.addHazard(x, z, r, s),
      dropArrow: (x, y, z, ammo) => this.dropArrowPickup(x, y, z, ammo),
      hitStop: (seconds) => {
        this.hitStopLeft = Math.max(this.hitStopLeft, seconds)
      },
    }
    this.player.bind(this.ctx)
    this.player.pos.set(this.world.playerSpawn.x, this.world.terrain.heightAt(this.world.playerSpawn.x, this.world.playerSpawn.z), this.world.playerSpawn.z)
    this.player.yaw = Math.atan2(-this.world.playerSpawn.x, -this.world.playerSpawn.z)
    this.player.stamina = this.player.maxStamina
    this.camera.snapBehind(this.player.yaw)
    this.projectiles.bind(this.ctx)
    this.populate()
    this.setupMissions()
    this.setupLights()
    this.extractionPulse = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.75, 48), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    this.extractionPulse.rotation.x = -Math.PI / 2
    this.extractionPulse.visible = false
    this.scene.add(this.extractionPulse)
    this.collectCullables()
    this.subscribe()
    this.hud.show(true)
    this.audio.setMusic("calm")
    profile.stats.expeditions++
    events.emit("toast", { text: `${area.name}${night ? " bei Nacht" : ""}: Finde Beute und erreiche einen Extraktionspunkt.`, kind: "info" })
    if (night) events.emit("toast", { text: "Nacht-Expedition: mehr Untote, bessere Beute, +40 % Erfahrung.", kind: "warn" })
    if (this.modifier) events.emit("toast", { text: `${this.modifier.name}: ${this.modifier.description}`, kind: "warn" })
    if (!profile.tutorialSeen) {
      this.tutorialQueue = [
        [4, "Die blauen Lichtstrahlen sind Extraktionspunkte. Dort einige Sekunden im Lichtkreis bleiben."],
        [12, "Truhen, Kisten und Säcke durchsuchen – Material brauchst du im Lager zum Ausbauen."],
        [22, "Ausweichen macht dich kurz unverwundbar. Blocken direkt vor dem Treffer ist ein perfekter Block."],
        [34, "Sprinten ist laut: Zombies hören dich. Nachts sehen sie schlechter – du aber auch."],
        [48, "Stirbst du, ist alles Mitgeführte weg. Lieber früh extrahieren als gierig werden."],
      ]
    }
    if (area.danger >= 3) events.emit("toast", { text: `Gefahr ${"☠".repeat(area.danger)} – ${area.hazards[0]}`, kind: "warn" })
    // Light, sky, environment map and colour grade before the first frame, then compile every shader up front
    post.setGrade(area.biome)
    this.camera.update(0, this.player.pos, this.player.height, this.world.collision, this.world.terrain, null)
    this.updateEnvironment(0)
    this.warmUp()
  }

  // ---- setup -----------------------------------------------------------------------------------

  private populate(): void {
    const area = this.world.area
    const spots = [...this.world.spawnPoints, ...this.world.interiorSpots]
    this.rng.shuffle(spots)
    let placed = 0
    const population = Math.round(area.population * (this.night ? 1.5 : 1) * (this.modifier?.id === "bloodmoon" ? 1.4 : 1))
    for (const s of spots) {
      if (placed >= population) break
      if (Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) < 32) continue
      if (this.world.nav.isBlockedWorld(s.x, s.z)) continue
      const typeId = this.rng.weighted(area.enemies, (e) => e.weight).typeId
      // Groups: walkers come in 2-4
      const t = zombieType(typeId)
      const groupSize = t.kind === "walker" ? this.rng.int(1, 3) : 1
      for (let g = 0; g < groupSize && placed < population; g++) {
        const gx = s.x + this.rng.range(-3, 3)
        const gz = s.z + this.rng.range(-3, 3)
        if (this.world.nav.isBlockedWorld(gx, gz)) continue
        this.spawnZombie(typeId, gx, gz)
        placed++
      }
    }
    // Boss
    if (area.bossId) {
      const b = this.spawnZombie(area.bossId, this.world.bossArena.x, this.world.bossArena.z)
      this.boss = b
      // Guards
      for (let i = 0; i < 3; i++) this.spawnZombie(area.enemies[0].typeId, this.world.bossArena.x + this.rng.range(-8, 8), this.world.bossArena.z + this.rng.range(-8, 8))
    }
  }

  private spawnZombie(typeId: string, x: number, z: number): Zombie {
    const z0 = new Zombie(zombieType(typeId), x, z, this.rng.int(1, 1e9))
    z0.bind(this.ctx)
    this.zombies.push(z0)
    return z0
  }

  private setupMissions(): void {
    for (const m of this.missions) {
      if (m.areaId !== this.areaId) continue
      if (m.kind === "rescue") this.spawnSurvivor()
      if (m.kind === "treasure") {
        // Hidden chest at a random secret spot away from the spawn
        const spots = this.world.interiorSpots.filter((s) => Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) > 60)
        const spot = spots.length ? this.rng.pick(spots) : { x: this.world.bossArena.x + 10, z: this.world.bossArena.z + 10 }
        const site = this.world.containers.find((c) => Math.hypot(c.x - spot.x, c.z - spot.z) < 8 && c.kind === "chest") ?? null
        if (site) {
          this.treasureChest = site
          site.secret = true
          site.table = "secret"
          site.bonusRolls = 2
        } else {
          // Make the nearest chest the treasure chest
          const chests = this.world.containers.filter((c) => c.kind === "chest" && Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) > 50)
          if (chests.length) {
            this.treasureChest = this.rng.pick(chests)
            this.treasureChest.secret = true
            this.treasureChest.table = "secret"
            this.treasureChest.bonusRolls = 2
          }
        }
      }
      if (m.kind === "purge" && m.targetId) {
        // Mark a special group near a point of interest
        const pois = this.world.pois.filter((p) => Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) > 50)
        const poi = pois.length ? this.rng.pick(pois) : { x: this.world.bossArena.x, z: this.world.bossArena.z }
        for (let i = 0; i < Math.min(m.goal, 6); i++) {
          const z = this.spawnZombie(m.targetId, poi.x + this.rng.range(-8, 8), poi.z + this.rng.range(-8, 8))
          z.special = true
        }
        if (m.goal > 6) for (let i = 0; i < m.goal - 6; i++) {
          const z = this.spawnZombie(m.targetId, poi.x + this.rng.range(-20, 20), poi.z + this.rng.range(-20, 20))
          z.special = true
        }
      }
    }
  }

  private spawnSurvivor(): void {
    const spots = this.world.interiorSpots.filter((s) => Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) > 50)
    const spot = spots.length ? this.rng.pick(spots) : { x: this.world.bossArena.x - 12, z: this.world.bossArena.z + 12 }
    const h = buildHumanoid({ skin: 0xd8b090, shirt: 0x7a6a4a, pants: 0x4a3a2a, hair: 0x3a2a1a, seed: 99, skinTexture: "cloth" })
    const anim = new Animator(h)
    anim.play("sit_hurt")
    const pos = new THREE.Vector3(spot.x, this.world.terrain.heightAt(spot.x, spot.z), spot.z)
    h.root.position.copy(pos)
    this.scene.add(h.root)
    this.survivor = { humanoid: h, animator: anim, pos, yaw: 0, following: false, rescued: false, walkPhase: 0 }
  }

  private setupLights(): void {
    const count = this.settings.quality === "low" ? 3 : this.settings.quality === "medium" ? 5 : 8
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 13, 2)
      l.castShadow = false
      this.scene.add(l)
      this.lights.push(l)
    }
    for (const f of this.world.flames) this.flamePos.push(f.getWorldPosition(new THREE.Vector3()))
    this.flameDist = new Float32Array(this.flamePos.length)
    this.flameOrder = this.flamePos.map((_, i) => i)
  }

  /** Slot of the pool that lights the player's torch while one is carried. */
  get torchLight(): THREE.PointLight {
    return this.lights[0]
  }

  /** Records static world meshes for fog culling: merged batches and other plain meshes directly under the root. */
  private collectCullables(): void {
    const root = this.world.root
    const terrain = this.world.terrain.mesh
    const add = (o: THREE.Object3D) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || (m as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh || o === terrain || o.userData.dynamic || !o.visible) return
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
      if (!m.geometry.boundingSphere) return
      o.updateWorldMatrix(true, false)
      const sphere = m.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld)
      this.cullables.push({ mesh: o, center: sphere.center, radius: sphere.radius })
    }
    for (const o of root.children) add(o)
    // Batches the static batcher may tag deeper in the tree
    root.traverse((o) => {
      if (o.parent !== root && o.userData.merged === true) add(o)
    })
  }

  /** Compiles all shaders (world, figures, a loot sack and its beam) before the first frame. */
  private warmUp(): void {
    const sample = this.pickupVisual(0xb36be8)
    sample.position.copy(this.player.pos)
    this.scene.add(sample)
    this.post.compile(this.scene, this.camera.camera)
    sample.removeFromParent()
    // Not disposed: the materials keep their compiled programs alive for the first real drop
    this.warmupObjects = sample
  }

  private subscribe(): void {
    this.unsub.push(
      events.on("enemyKilled", (e) => {
        this.kills++
        const t = zombieType(e.typeId)
        const xpMult = 1 + skillBonuses(this.profile.skills).xpPct
        this.runXp += Math.round(t.xp * xpMult)
        this.profile.stats.kills++
        if (e.boss) {
          this.bossKills++
          this.profile.stats.bossKills++
          this.ui.toast(`${t.name} besiegt!`, "good")
          this.audio.play("mission_done")
          if (!this.profile.clearedBosses.includes(this.areaId)) this.profile.clearedBosses.push(this.areaId)
        }
        const lifeOnKill = skillBonuses(this.profile.skills).lifeOnKill
        if (lifeOnKill) this.player.heal(lifeOnKill, true)
        for (const m of this.missions) {
          if (m.areaId !== this.areaId || m.status !== "active") continue
          if (m.kind === "bossHunt" && e.boss && m.targetId === e.typeId) this.progressMission(m, 1)
          if (m.kind === "purge" && e.special === m.targetId) this.progressMission(m, 1)
        }
      }),
      events.on("enemyHit", (e) => {
        if (e.damage > 0 && this.settings.gore) this.decals.spawn(e.x, e.z, 0.4 + Math.min(0.6, e.damage / 80))
      }),
      events.on("playerDied", (e) => {
        this.audio.setMusic("none")
        this.deathTimer = 0
        this.ui.toast(`Du bist gefallen: ${e.cause}`, "warn")
        this.profile.stats.deaths++
      }),
      events.on("weatherChanged", (e) => {
        this.ui.toast(`Wetter: ${WEATHER_NAMES[e.weather as keyof typeof WEATHER_NAMES]}`, "info")
      }),
      events.on("weaponBroke", (e) => this.ui.toast(`${e.name} ist zerbrochen! Schaden stark verringert.`, "warn")),
    )
  }

  private progressMission(m: MissionDef, amount: number): void {
    m.progress = Math.min(m.goal, m.progress + amount)
    events.emit("missionProgress", { missionId: m.id, progress: m.progress, goal: m.goal, done: m.progress >= m.goal })
    if (m.progress >= m.goal && m.status === "active") {
      if (m.kind === "collect" || m.kind === "resources") return // completes on extraction with the items
      m.status = "completed"
      this.ui.toast(`Mission erfüllt: ${m.title} – extrahiere, um die Belohnung zu sichern.`, "good")
      this.audio.play("mission_done")
    } else this.ui.toast(`${m.title}: ${m.progress} / ${m.goal}`, "info")
  }

  // ---- services for entities -----------------------------------------------------------------

  private noise(x: number, z: number, radius: number): void {
    if (this.weather.kind === "storm" || this.weather.kind === "rain") radius *= 0.7
    for (const zb of this.zombies) if (!zb.dead) zb.onNoise(x, z, radius)
    events.emit("noise", { x, z, radius, source: "player" })
  }

  private dropLoot(x: number, z: number, table: string, bonusRolls = 0): void {
    const loot = rollLoot(this.rng, table, this.world.area.danger, this.skillsLuck, bonusRolls)
    if (!loot.items.length && loot.gold <= 0) return
    this.createPickup(x, z, loot.items, loot.gold)
  }

  /** Loot pouch or sack (coins with gold) with a beam in the rarity colour. */
  private pickupVisual(glowColor: number, rarity = 3, itemCount = 1, gold = 0): THREE.Group {
    const g = new THREE.Group()
    // A pouch for a few things, a sack for a bigger haul (the kit's sack is 0.8 m, the pouch 0.16 m tall)
    const bag = itemCount > 2 ? kitProp("Bag", 0.6) : kitProp("Pouch_Large", 1.8)
    if (bag) {
      bag.rotation.y = Math.random() * Math.PI * 2
      g.add(bag)
    } else {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat("cloth", { color: 0x8a7a5a }))
      sack.scale.set(1, 0.8, 1)
      sack.position.y = 0.24
      sack.castShadow = true
      g.add(sack)
    }
    if (gold > 0) {
      const coins = kitProp(gold > 40 ? "Coin_Pile_2" : "Coin_Pile", 1.6)
      if (coins) {
        coins.position.set(0.36, 0, 0.14)
        coins.rotation.y = Math.random() * Math.PI * 2
        g.add(coins)
      }
    }
    const beam = new THREE.Mesh(BEAM_GEO, beamMaterial(glowColor, rarity >= 2 ? 0.55 : 0.3))
    beam.position.y = rarity >= 2 ? 1.6 : 0.9
    beam.scale.y = rarity >= 2 ? 1.4 : 0.8
    beam.renderOrder = 2
    g.add(beam)
    return g
  }

  private createPickup(x: number, z: number, items: ItemInstance[], gold: number): Pickup {
    const best = items.reduce((m, i) => Math.max(m, RARITIES.indexOf(i.rarity)), 0)
    const glowColor = best >= 4 ? 0xf0a63a : best >= 3 ? 0xb36be8 : best >= 2 ? 0x4f9de8 : best >= 1 ? 0x6fbf5a : 0xd8d0b0
    const g = this.pickupVisual(glowColor, best, items.length, gold)
    const y = this.world.terrain.heightAt(x, z)
    g.position.set(x, y, z)
    this.scene.add(g)
    // No PointLight per pickup: the nearest epic drop borrows a slot of the fixed light pool instead
    const p: Pickup = { items, gold, object: g, x, z, y, glow: glowColor, rarity: best }
    this.pickups.push(p)
    return p
  }

  private dropArrowPickup(x: number, y: number, z: number, ammoId: string): void {
    const item = createItem(ammoId, 1)
    const g = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), mat(null, { color: 0x8a6a40 }))
    shaft.rotation.z = 1.2
    shaft.position.y = 0.15
    g.add(shaft)
    g.position.set(x, this.world.terrain.heightAt(x, z), z)
    this.scene.add(g)
    this.pickups.push({ items: [item], gold: 0, object: g, x, z, y, glow: 0xd8d0b0, rarity: 0, auto: true })
  }

  private summon(x: number, z: number, typeId: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const sx = x + Math.cos(a) * 4
      const sz = z + Math.sin(a) * 4
      const zb = this.spawnZombie(typeId, sx, sz)
      zb.onNoise(this.player.pos.x, this.player.pos.z, 60)
      this.particles.plague(sx, 0.5, sz, 8)
    }
  }

  private addHazard(x: number, z: number, r: number, seconds: number): void {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0x4a9a3a, transparent: true, opacity: 0.3, depthWrite: false }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, this.world.terrain.heightAt(x, z) + 0.06, z)
    this.scene.add(mesh)
    this.hazards.push({ x, z, r, remaining: seconds, mesh })
  }

  dropItem(item: ItemInstance): void {
    const p = this.player.pos
    this.createPickup(p.x + Math.sin(p.x) * 0.5, p.z + 0.8, [item], 0)
  }

  // ---- interaction ---------------------------------------------------------------------------------

  private nearestInteractable(): Interactable | null {
    const p = this.player.pos
    let best: Interactable | null = null
    let bestD = Infinity
    const consider = (it: Interactable) => {
      const d = Math.hypot(it.x - p.x, it.z - p.z)
      if (d > it.radius) return
      // Prefer things in front of the player
      const ang = Math.abs(Math.atan2(it.x - p.x, it.z - p.z) - this.player.yaw)
      const score = d + (ang > 1.4 && d > 1 ? 1.5 : 0)
      if (score < bestD) {
        bestD = score
        best = it
      }
    }
    for (const c of this.world.containers) {
      if (c.opened) continue
      if (Math.abs(c.x - p.x) > 3 || Math.abs(c.z - p.z) > 3) continue
      consider({ kind: "container", x: c.x, z: c.z, radius: 2.4, label: containerLabel(c), container: c })
    }
    for (const e of this.world.extractions) {
      if (e.lever && !e.active) consider({ kind: "lever", x: e.lever.x, z: e.lever.z, radius: 2.2, label: e.def.activation!.label, extraction: e })
      if (Math.hypot(e.x - p.x, e.z - p.z) < 3.2) {
        if (e.active) consider({ kind: "extraction", x: e.x, z: e.z, radius: 3.2, label: this.extracting ? "Extraktion abbrechen" : `Extrahieren: ${e.def.name}`, extraction: e })
        else if (e.def.activation && e.def.activation.kind !== "lever") consider({ kind: "extraction", x: e.x, z: e.z, radius: 3.2, label: e.def.activation.label, extraction: e })
      }
    }
    for (const pk of this.pickups) {
      if (pk.auto) continue
      consider({ kind: "pickup", x: pk.x, z: pk.z, radius: 2.0, label: pk.items.length === 1 && pk.gold === 0 ? `Aufheben: ${displayName(pk.items[0])}${pk.items[0].qty > 1 ? ` ×${pk.items[0].qty}` : ""}` : "Beute aufheben", pickup: pk })
    }
    if (this.survivor && !this.survivor.following && !this.survivor.rescued) consider({ kind: "survivor", x: this.survivor.pos.x, z: this.survivor.pos.z, radius: 2.5, label: "Überlebenden mitnehmen", survivor: this.survivor })
    return best
  }

  private interact(it: Interactable): void {
    const p = this.player
    switch (it.kind) {
      case "container":
        this.openContainer(it.container!)
        break
      case "lever": {
        const e = it.extraction!
        e.active = true
        e.lever!.handle.rotation.x = 0.9
        this.audio.play("lever", { x: it.x, y: 1, z: it.z })
        if (e.portcullis) {
          this.audio.play("gate", { x: e.x, y: 2, z: e.z })
          const grate = e.portcullis
          const start = grate.position.y
          const t0 = this.elapsed
          const raise = () => {
            const k = Math.min(1, (this.elapsed - t0) / 3)
            grate.position.y = start + k * 4.4
            if (k < 1 && !this.ended) requestAnimationFrame(raise)
          }
          raise()
          if (e.portcullisCollider) this.world.collision.remove(e.portcullisCollider)
        }
        p.playInteract()
        events.emit("extractionActivated", { id: e.def.id, name: e.def.name })
        this.ui.toast(`${e.def.name} ist jetzt aktiv.`, "good")
        this.noise(it.x, it.z, 20)
        break
      }
      case "extraction": {
        const e = it.extraction!
        if (!e.active) {
          const act = e.def.activation!
          if (act.kind === "key" || act.kind === "torch") {
            if (countItem(p.inventory, act.itemId!) > 0) {
              if (act.kind === "torch") removeItem(p.inventory, act.itemId!, 1)
              e.active = true
              this.audio.play("gate", { x: e.x, y: 1, z: e.z })
              this.ui.toast(`${e.def.name} ist jetzt aktiv.`, "good")
              events.emit("extractionActivated", { id: e.def.id, name: e.def.name })
              p.playInteract()
            } else this.ui.toast(`Du brauchst: ${itemDef(act.itemId!).name}.`, "warn")
          } else if (act.kind === "repair") {
            if (countItem(p.inventory, "wood") >= 6) {
              removeItem(p.inventory, "wood", 6)
              e.active = true
              this.audio.play("craft")
              this.ui.toast(`${e.def.name} repariert und aktiv.`, "good")
              events.emit("extractionActivated", { id: e.def.id, name: e.def.name })
              p.playInteract()
            } else this.ui.toast("Du brauchst 6× Holz für die Reparatur.", "warn")
          }
          break
        }
        if (this.extracting) {
          this.extracting = null
          this.ui.toast("Extraktion abgebrochen.")
        } else {
          this.extracting = { site: e, progress: 0 }
          this.audio.play("extraction_start")
          this.noise(e.x, e.z, 30)
          this.ui.toast(`Extraktion läuft: bleib ${e.def.channel} Sekunden im Lichtkreis.`, "info")
        }
        break
      }
      case "pickup":
        this.takePickup(it.pickup!)
        break
      case "survivor":
        it.survivor!.following = true
        it.survivor!.animator.play("idle")
        this.ui.toast("Der Überlebende folgt dir. Bring ihn zu einem Extraktionspunkt.", "good")
        p.playInteract()
        break
    }
  }

  private openContainer(c: ContainerSite): void {
    c.opened = true
    this.player.playInteract()
    this.audio.play("chest_open", { x: c.x, y: 1, z: c.z })
    if (c.lid) {
      const lid = c.lid
      const t0 = this.elapsed
      const anim = () => {
        const k = Math.min(1, (this.elapsed - t0) / 0.5)
        lid.rotation.x = -k * 1.6
        if (k < 1 && !this.ended) requestAnimationFrame(anim)
      }
      anim()
    }
    const loot = rollLoot(this.rng, c.table, this.world.area.danger, this.skillsLuck, c.bonusRolls ?? 0)
    const items = [...loot.items]
    for (const f of c.fixed ?? []) items.unshift(createItem(f.id, f.qty))
    if (c === this.treasureChest) {
      for (const m of this.missions) if (m.kind === "treasure" && m.areaId === this.areaId && m.status === "active") this.progressMission(m, 1)
    }
    if (loot.gold > 0) {
      const g = Math.round(loot.gold * (1 + skillBonuses(this.profile.skills).goldPct))
      this.runGold += g
      this.audio.play("coin")
      this.ui.toast(`+${g} Gold`, "loot")
    }
    events.emit("containerOpened", { kind: c.kind, x: c.x, z: c.z })
    this.noise(c.x, c.z, 6)
    if (c.kind === "herb" || c.kind === "woodpile" || c.kind === "bones" || c.kind === "scrap" || items.length <= 1) {
      // Simple resources go straight into the bag
      for (const it of items) this.giveItem(it)
      if (c.kind === "herb" || c.kind === "woodpile" || c.kind === "bones" || c.kind === "scrap") c.object.visible = false
      return
    }
    this.openLootScreen(containerLabel(c), items)
  }

  private openLootScreen(title: string, items: ItemInstance[]): void {
    this.input.releaseLock()
    this.ui.push(new LootScreen({ ui: this.ui }, title, items, (it) => this.giveItem(it), () => this.input.requestLock()))
  }

  /** True while a menu covers the game. */
  get paused(): boolean {
    return this.ui.depth > 0
  }

  /** Puts an item into the bag; returns true if at least part of it fit. */
  private giveItem(item: ItemInstance): boolean {
    const def = itemDef(item.defId)
    const before = item.qty
    const weightAfter = this.player.weight + itemWeight(item)
    if (weightAfter > this.player.carryLimit * 1.5) {
      this.ui.toast("Zu schwer! Wirf etwas weg.", "warn")
      return false
    }
    const left = addItem(this.player.inventory, item)
    const taken = before - left
    if (taken <= 0) {
      this.ui.toast("Rucksack ist voll.", "warn")
      return false
    }
    this.audio.play("pickup")
    const ri = RARITIES.indexOf(item.rarity)
    if (ri > this.bestRarity) this.bestRarity = ri
    events.emit("itemPickedUp", { itemId: item.defId, qty: taken, name: def.name, rarity: item.rarity })
    this.ui.toast(`${displayName(item)}${taken > 1 ? ` ×${taken}` : ""}`, "loot")
    this.checkCollectMissions()
    return true
  }

  private checkCollectMissions(): void {
    for (const m of this.missions) {
      if ((m.kind !== "collect" && m.kind !== "resources") || m.status !== "active" || !m.targetId) continue
      const have = countItem(this.player.inventory, m.targetId)
      if (have !== m.progress) {
        m.progress = Math.min(m.goal, have)
        if (have >= m.goal) this.ui.toast(`${m.title}: alles gesammelt – jetzt extrahieren!`, "good")
      }
    }
  }

  private takePickup(pk: Pickup): void {
    if (pk.gold > 0) {
      const g = Math.round(pk.gold * (1 + skillBonuses(this.profile.skills).goldPct))
      this.runGold += g
      pk.gold = 0
      this.audio.play("coin")
      this.ui.toast(`+${g} Gold`, "loot")
    }
    if (pk.items.length === 1) {
      if (this.giveItem(pk.items[0]) && pk.items[0].qty <= 0) pk.items = []
    } else if (pk.items.length > 1) {
      this.openLootScreen("Beute", pk.items)
      return this.removePickupIfEmpty(pk, true)
    }
    this.removePickupIfEmpty(pk)
  }

  private removePickupIfEmpty(pk: Pickup, deferred = false): void {
    const check = () => {
      if (pk.items.length === 0 && pk.gold <= 0) {
        pk.object.removeFromParent()
        const i = this.pickups.indexOf(pk)
        if (i >= 0) this.pickups.splice(i, 1)
      }
    }
    if (deferred) {
      const timer = setInterval(() => {
        if (!this.ui.has("loot") || this.ended) {
          clearInterval(timer)
          check()
        }
      }, 200)
    } else check()
  }

  // ---- update -------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.ended) return
    const t0 = performance.now()
    this.lastRenderMs = 0
    this.tick(dt)
    // Running averages over ~30 frames for the harness (simulation without the render call, and the render call)
    this.updateMsAvg += (performance.now() - t0 - this.lastRenderMs - this.updateMsAvg) / 30
    this.renderMsAvg += (this.lastRenderMs - this.renderMsAvg) / 30
  }

  /** Average milliseconds per frame spent in the render call (main pass, shadows and post-processing). */
  get renderMs(): number {
    return this.renderMsAvg
  }

  /** Average milliseconds per frame spent simulating (everything except the render call). */
  get updateMs(): number {
    return this.updateMsAvg
  }

  get fps(): number {
    return this.fpsCounter.value
  }

  /** Number of static meshes currently skipped because the fog hides them. */
  get fogCulled(): number {
    let n = 0
    for (const c of this.cullables) if (!c.mesh.visible) n++
    return n
  }

  private tick(dt: number): void {
    this.fpsCounter.frames++
    this.fpsCounter.time += dt
    if (this.fpsCounter.time >= 0.5) {
      this.fpsCounter.value = Math.round(this.fpsCounter.frames / this.fpsCounter.time)
      this.fpsCounter.frames = 0
      this.fpsCounter.time = 0
    }
    const input = this.input
    const inMenu = this.ui.depth > 0
    if (!inMenu && !this.player.dead) {
      if (input.pressed("pause")) {
        input.consume("pause")
        this.callbacks.openPause()
        return
      }
      // Inventory button: tap opens the inventory, holding fires the active ability (controller has no spare button).
      if (input.down("inventory")) {
        this.inventoryHold += dt
        this.inventoryHoldFrames++
        if (this.inventoryHold >= 0.4 && this.inventoryHoldFrames >= 4) {
          input.consume("inventory")
          this.inventoryHold = 0
          this.inventoryHoldFrames = 0
          this.player.useAbility()
        }
      } else if (this.inventoryHold > 0) {
        this.inventoryHold = 0
        this.inventoryHoldFrames = 0
        this.callbacks.openInventory()
        return
      }
      if (input.pressed("ability")) {
        input.consume("ability")
        this.player.useAbility()
      }
      if (input.pressed("map")) {
        input.consume("map")
        this.callbacks.openPause()
        return
      }
    }
    if (inMenu) {
      // Keep rendering but freeze the simulation while any menu is open
      this.player.controlsEnabled = false
      this.renderFrame(0)
      return
    }
    this.profile.stats.playSeconds += dt
    // Hit stop: the world crawls for a few frames after a landed blow
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= dt
      dt *= 0.12
    }
    this.elapsed += dt
    if (this.tutorialQueue.length && this.elapsed >= this.tutorialQueue[0][0]) {
      this.ui.toast(this.tutorialQueue.shift()![1], "info")
      if (!this.tutorialQueue.length) this.profile.tutorialSeen = true
    }
    // Camera look
    const look = input.look(dt)
    this.camera.rotate(look.x, look.y)
    const wheel = input.wheel()
    if (wheel) this.camera.zoom(wheel)
    if (this.player.aiming || this.player.state === "drawing") this.camera.targetDistance = Math.min(this.camera.targetDistance, 2.6)
    this.player.controlsEnabled = !this.player.dead
    this.world.nav.newFrame()
    this.player.update(dt)
    // Zombies (sleeping ones update cheaply)
    for (const z of this.zombies) z.update(dt)
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].finished) {
        this.zombies[i].dispose()
        this.zombies.splice(i, 1)
      }
    }
    this.projectiles.update(dt)
    this.particles.update(dt)
    this.decals.update(dt)
    this.gore.update(dt)
    if (this.crows) {
      this.crows.update(dt)
      this.crows.visible = this.sky.state.daylight > 0.2 && this.weather.fog < 0.6
    }
    this.updateHazards(dt)
    this.updateSurvivor(dt)
    this.updateSpawns(dt)
    this.updateExtraction(dt)
    this.updateExploration()
    this.updateEnvironment(dt)
    // Walk-over pickups (ammo)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i]
      if (!pk.auto || this.player.dead) continue
      if (Math.hypot(pk.x - this.player.pos.x, pk.z - this.player.pos.z) < 1.2) {
        if (this.giveItem(pk.items[0]) && pk.items[0].qty <= 0) {
          pk.object.removeFromParent()
          this.pickups.splice(i, 1)
        }
      }
    }
    // First-contact tips for special enemy kinds
    if (this.tipKinds.size < 3) {
      for (const z of this.zombies) {
        if (z.dead || !z.alerted || this.tipKinds.has(z.type.kind)) continue
        if (z.type.kind === "knight") this.ui.toast("Verseuchte Ritter blocken Angriffe von vorn. Weiche aus und triff sie von der Seite.", "warn")
        else if (z.type.kind === "brute") this.ui.toast("Brutale holen weit aus: der rote Ring zeigt den Schlag an. Rechtzeitig ausweichen!", "warn")
        else if (z.type.kind === "sprinter") this.ui.toast("Sprinter sind schnell. Blocke den Sprung oder weiche im letzten Moment aus.", "warn")
        else continue
        this.tipKinds.add(z.type.kind)
      }
    }
    // Interaction
    const it = this.nearestInteractable()
    this.lastPrompt = it
    if (it && !this.player.dead && input.pressed("interact") && (this.player.state === "normal" || this.player.state === "interacting")) {
      input.consume("interact")
      this.interact(it)
    }
    // Death
    if (this.player.dead) {
      this.deathTimer += dt
      if (this.deathTimer > 3.2) {
        this.end(false, undefined, "Von den Toten überwältigt")
        return
      }
    }
    // Tension for music
    let threats = 0
    for (const z of this.zombies) if (!z.dead && z.alerted && Math.hypot(z.pos.x - this.player.pos.x, z.pos.z - this.player.pos.z) < 30) threats++
    const bossNear = this.boss && !this.boss.dead && this.boss.alerted && Math.hypot(this.boss.pos.x - this.player.pos.x, this.boss.pos.z - this.player.pos.z) < 45
    this.tension = Math.min(1, threats / 4)
    this.audio.setMusic(bossNear ? "boss" : threats > 0 ? "tension" : "calm")
    this.audio.setListener(this.camera.camera.position.x, this.camera.camera.position.y, this.camera.camera.position.z, this.camera.yaw)
    this.audio.updateAmbience(dt, this.weather.wind, this.weather.rain, this.sky.state.daylight < 0.3, this.world.underground, this.tension)
    this.renderFrame(dt)
  }

  private updateHazards(dt: number): void {
    const p = this.player
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]
      h.remaining -= dt
      if (h.remaining <= 0) {
        h.mesh?.removeFromParent()
        this.hazards.splice(i, 1)
        continue
      }
      if (Math.hypot(h.x - p.pos.x, h.z - p.pos.z) < h.r) p.plague = Math.max(p.plague, 4)
      if (this.rng.chance(dt * 3)) this.particles.plague(h.x + this.rng.range(-h.r, h.r), 0.5, h.z + this.rng.range(-h.r, h.r), 1)
    }
    for (const h of this.world.hazards) {
      const d = Math.hypot(h.x - p.pos.x, h.z - p.pos.z)
      if (d < h.r) p.plague = Math.max(p.plague, 3)
      if (d < 50 && this.rng.chance(dt * 2)) this.particles.plague(h.x + this.rng.range(-h.r, h.r), this.world.terrain.heightAt(h.x, h.z) + 0.5, h.z + this.rng.range(-h.r, h.r), 1)
    }
  }

  private updateSurvivor(dt: number): void {
    const s = this.survivor
    if (!s || s.rescued) return
    if (s.following) {
      const p = this.player.pos
      const dx = p.x - s.pos.x
      const dz = p.z - s.pos.z
      const d = Math.hypot(dx, dz)
      if (d > 3) {
        const sp = Math.min(5.5, 2.5 + (d - 3) * 0.5)
        s.yaw = Math.atan2(dx, dz)
        const nx = s.pos.x + (dx / d) * sp * dt
        const nz = s.pos.z + (dz / d) * sp * dt
        const r = this.world.collision.resolveCircle(nx, nz, 0.35, s.pos.y, 1.7, "player")
        s.walkPhase += (Math.hypot(r.x - s.pos.x, r.z - s.pos.z) / 0.8) * Math.PI
        s.pos.x = r.x
        s.pos.z = r.z
        // Teleport if stuck far behind
        if (d > 40) {
          s.pos.x = p.x - Math.sin(this.player.yaw) * 2
          s.pos.z = p.z - Math.cos(this.player.yaw) * 2
        }
        s.animator.play(sp > 4 ? "run" : "walk")
      } else s.animator.play("idle")
      s.animator.ctx.phase = s.walkPhase
      s.animator.ctx.speed = 1
    }
    s.pos.y = this.world.terrain.heightAt(s.pos.x, s.pos.z)
    s.humanoid.root.position.copy(s.pos)
    s.humanoid.root.rotation.y = s.yaw
    s.animator.update(dt)
  }

  private updateSpawns(dt: number): void {
    // Roaming hordes: every so often a group appears out of sight and drifts toward the player.
    this.spawnTimer -= dt
    const alive = this.zombies.filter((z) => !z.dead).length
    const cap = this.world.area.population + 20 + Math.floor(this.elapsed / 120) * 4
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(25, 70 - this.elapsed / 40) / this.hordeRate
      if (alive < cap) {
        const count = this.rng.int(2, 4 + Math.floor(this.elapsed / 180))
        const a = this.rng.range(0, Math.PI * 2)
        const d = this.rng.range(40, 60)
        const cx = this.player.pos.x + Math.cos(a) * d
        const cz = this.player.pos.z + Math.sin(a) * d
        let placed = 0
        for (let i = 0; i < count * 10 && placed < count; i++) {
          const x = cx + this.rng.range(-10, 10)
          const z = cz + this.rng.range(-10, 10)
          if (Math.max(Math.abs(x), Math.abs(z)) > this.world.area.size * 0.9 || this.world.nav.isBlockedWorld(x, z)) continue
          if (this.world.collision.blocked(x, z, this.player.pos.x, this.player.pos.z, 1.5, "player") || d > 42) {
            const typeId = this.rng.weighted(this.world.area.enemies, (e) => e.weight).typeId
            const zb = this.spawnZombie(typeId, x, z)
            zb.onNoise(this.player.pos.x, this.player.pos.z, 80)
            placed++
          }
        }
        if (placed) this.hordeIndex++
        if (placed >= 3 && this.sky.state.daylight < 0.3) this.ui.toast("Die Nacht bringt mehr Untote …", "warn")
      }
    }
  }

  private updateExtraction(dt: number): void {
    const ex = this.extracting
    if (!ex) return
    const d = Math.hypot(ex.site.x - this.player.pos.x, ex.site.z - this.player.pos.z)
    if (d > 3.6 || this.player.dead) {
      this.extracting = null
      if (!this.player.dead) this.ui.toast("Extraktion abgebrochen: Du hast den Lichtkreis verlassen.", "warn")
      return
    }
    ex.progress += dt / ex.site.def.channel
    if (ex.progress >= 1) {
      if (this.survivor && this.survivor.following && !this.survivor.rescued && Math.hypot(this.survivor.pos.x - ex.site.x, this.survivor.pos.z - ex.site.z) < 8) {
        this.survivor.rescued = true
        for (const m of this.missions) if (m.kind === "rescue" && m.areaId === this.areaId && m.status === "active") this.progressMission(m, 1)
        events.emit("survivorRescued", { survivorId: "s1" })
      }
      this.audio.play("extraction_done")
      this.end(true, ex.site.def.name)
    }
  }

  private updateExploration(): void {
    const p = this.player.pos
    const res = this.exploredRes
    const size = this.world.area.size
    const ci = Math.floor(((p.x + size) / (size * 2)) * res)
    const cj = Math.floor(((p.z + size) / (size * 2)) * res)
    const r = 3
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) if (i >= 0 && j >= 0 && i < res && j < res && (i - ci) * (i - ci) + (j - cj) * (j - cj) <= r * r) this.explored[j * res + i] = 1
    for (const poi of this.world.pois) {
      if (this.visitedPois.has(poi.id)) continue
      if (Math.hypot(poi.x - p.x, poi.z - p.z) < 9) {
        this.visitedPois.add(poi.id)
        this.ui.toast(`Entdeckt: ${poi.name}`, "good")
        this.runXp += 10
        events.emit("areaVisited", { pointId: poi.id })
        for (const m of this.missions) {
          if (m.kind === "explore" && m.areaId === this.areaId && m.status === "active" && !this.explorePoints.has(poi.id)) {
            this.explorePoints.add(poi.id)
            this.progressMission(m, 1)
          }
        }
      }
    }
  }

  private updateEnvironment(dt: number): void {
    this.flickerTime += dt
    this.envFrame++
    const t = this.flickerTime
    windUniforms.uTime.value = t
    windUniforms.uWind.value = 0.2 + this.weather.wind * 1.2
    const focus = this.player.pos
    const camPos = this.camera.camera.position
    // Shadow box ahead of the camera so the visible ground gets the shadow-map resolution
    const fwd = this.camera.forward()
    const ahead = this.player.lockTarget ? 8 : 15
    this.shadowAhead.x = damp(this.shadowAhead.x, fwd.x * ahead, 4, dt)
    this.shadowAhead.z = damp(this.shadowAhead.z, fwd.z * ahead, 4, dt)
    this.sky.update(dt, focus, this.shadowAhead)
    this.weather.update(dt, camPos, this.world.underground, { forward: fwd, heightAt: this.heightAt, biome: this.world.area.biome, player: focus })
    this.updateWetAndFog(dt)
    // Reflections: the environment map is rebaked only when light or weather changed noticeably
    this.sky.updateEnvironment(this.renderer, `${this.weather.kind}:${Math.round(this.weather.cloud * 4)}:${Math.round(this.weather.fog * 4)}`)
    this.updateThunder()
    this.updateLights(dt)
    // Banners sway with the wind
    for (let i = 0; i < this.world.banners.length; i++) {
      const b = this.world.banners[i]
      b.rotation.y = Math.sin(t * (1.5 + this.weather.wind * 2) + i) * 0.25 * (0.3 + this.weather.wind)
    }
    // Water ripples
    if (this.world.waters.length) {
      // The shader scrolls the normal map itself; the wind only makes the surface choppier
      const wm = waterMaterial()
      wm.normalScale.set(0.5 + this.weather.wind * 0.5, 0.5 + this.weather.wind * 0.5)
    }
    // Extraction beams pulse (kept faint so they do not wash out the sky)
    for (const e of this.world.extractions) {
      const m = e.beam.material as THREE.MeshBasicMaterial
      m.opacity = e.active ? 0.16 + Math.sin(t * 2) * 0.05 : 0.05
      m.color.setHex(e.active ? 0x6fd0ff : 0x8a6a40)
    }
    this.updateExtractionVisual(dt)
    // Rain: small splashes around the player
    if (this.weather.rain > 0.3 && !this.world.underground) {
      this.rainTimer -= dt
      if (this.rainTimer <= 0) {
        this.rainTimer = 0.06
        for (let i = 0; i < 2; i++) {
          const x = focus.x + this.rng.range(-6, 6)
          const z = focus.z + this.rng.range(-6, 6)
          this.particles.emit(x, this.world.terrain.heightAt(x, z) + 0.03, z, { count: 1, color: 0xcfe0f0, spread: 0.2, speed: 1.4, up: 2, life: 0.3, size: 0.06, gravity: 12, alpha: 0.6 })
        }
      }
    }
    // Distant backdrops (if the world provides them) take on the fog and sky colour
    const backdrops = (this.world as { backdrops?: THREE.Mesh[] }).backdrops
    if (backdrops) {
      for (const b of backdrops) {
        const bm = b.material as THREE.MeshBasicMaterial
        if (!bm || !bm.color) continue
        if (b.userData.backdrop === "far") bm.color.copy(this.sky.fog.color).lerp(this.sky.topColor, 0.22)
        else if (b.userData.backdrop === "near") bm.color.copy(this.sky.fog.color).lerp(NEAR_BACKDROP, 0.35)
      }
    }
    this.updateFogCulling()
  }

  /** Plays thunder once the sound of a strike has travelled to the player. */
  private updateThunder(): void {
    const st = this.weather.strike
    if (st && st.id !== this.lastStrike) {
      this.lastStrike = st.id
      this.thunder.push({ at: this.flickerTime + st.dist / 340 + 0.2, volume: lerp(0.9, 0.5, clamp((st.dist - 40) / 80, 0, 1)), shake: st.dist < 60 })
    }
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      const th = this.thunder[i]
      if (this.flickerTime < th.at) continue
      this.audio.play("thunder", { volume: th.volume })
      if (th.shake) this.camera.addShake(0.15)
      this.thunder.splice(i, 1)
    }
  }

  /**
   * Ground gets wet while it rains and dries slowly afterwards; the height fog hugs the ground (lake level or
   * valley floor) more in fog and in the forest and graveyard, and not at all underground.
   */
  private updateWetAndFog(dt: number): void {
    const target = this.world.underground ? 0 : Math.min(1, this.weather.rain * 1.3)
    const rate = target > this.wetness ? 0.08 : 0.02
    this.wetness += Math.max(-rate * dt, Math.min(rate * dt, target - this.wetness))
    // Material colours are only touched when the change is visible
    if (Math.abs(this.wetness - this.wetApplied) > 0.01 || (this.wetness === 0 && this.wetApplied !== 0)) {
      this.wetApplied = this.wetness
      setWetness(this.wetness)
    }
    const biome = this.world.area.biome
    const low = biome === "forest" || biome === "graveyard"
    fogUniforms.uFogFloor.value = this.world.underground ? -100 : this.world.terrain.waterLevel + (low ? 0.5 : 0)
    fogUniforms.uFogFalloff.value = this.world.underground ? 0.05 : low ? 0.16 : 0.1
    fogUniforms.uFogHeightMix.value = this.world.underground ? 0 : Math.min(0.75, (low ? 0.4 : 0.25) + this.weather.fog * 0.35)
  }

  /** Assigns the fixed light pool: player torch slot, loot/extraction slot, nearest flames with noisy flicker. */
  private updateLights(dt: number): void {
    const t = this.flickerTime
    const focus = this.player.pos
    const lights = this.lights
    // Re-sort the flames by distance every few frames (they never move)
    const n = this.flamePos.length
    if (n && (this.envFrame % 6 === 1 || dt === 0)) {
      for (let i = 0; i < n; i++) this.flameDist[i] = this.flamePos[i].distanceToSquared(focus)
      this.flameOrder.sort((a, b) => this.flameDist[a] - this.flameDist[b])
    }
    let slot = 0
    // Slot 0: the player's torch (no light of its own, so equipping it never changes the shader's light count);
    // while none is carried the slot lights a flame
    const flame = this.player.torchFlame
    if (flame) {
      // A little away from the body and above the flame, with a softer falloff, so the carrier is not blown out
      const l0 = lights[0]
      flame.getWorldPosition(l0.position)
      l0.position.x += Math.sin(this.player.yaw) * 0.45
      l0.position.z += Math.cos(this.player.yaw) * 0.45
      l0.position.y += 0.35
      l0.color.setHex(0xffa040)
      l0.distance = 15
      l0.decay = 1.4
      l0.intensity = (7 + 2.5 * flicker(t, 997)) * (this.world.underground ? 1.2 : 1)
      slot = 1
    } else {
      lights[0].decay = 2
    }
    // Slot 1: extraction circle while channelling, else the nearest epic or better loot
    const special = lights.length > 1 ? lights[1] : null
    let specialUsed = false
    if (special) {
      const ex = this.extracting
      if (ex) {
        special.position.set(ex.site.x, ex.site.y + 1.2, ex.site.z)
        special.color.setHex(0x6fd0ff)
        special.intensity = 4 * (0.85 + 0.15 * Math.sin(t * 6))
        special.distance = 8
        specialUsed = true
      } else {
        let best: Pickup | null = null
        let bestD = 30 * 30
        for (const pk of this.pickups) {
          if (pk.rarity < 3) continue
          const d = (pk.x - focus.x) ** 2 + (pk.z - focus.z) ** 2
          if (d < bestD) {
            bestD = d
            best = pk
          }
        }
        if (best) {
          special.position.set(best.x, best.y + 1, best.z)
          special.color.setHex(best.glow)
          special.intensity = 3
          special.distance = 8
          specialUsed = true
        }
      }
    }
    const gusty = this.weather.wind > 0.55 && !this.world.underground
    let k = 0
    for (; slot < lights.length; slot++) {
      if (slot === 1 && specialUsed) continue
      const l = lights[slot]
      const fi = k < n ? this.flameOrder[k] : -1
      k++
      if (fi < 0 || this.flameDist[fi] > 60 * 60) {
        l.intensity = 0
        continue
      }
      const p = this.flamePos[fi]
      const f = flicker(t, fi)
      // Torches hang 2.5-3.5 m up: with physical falloff (decay 2) they need this much to light the ground below
      let intensity = (14 + 8 * f) * (this.world.underground ? 1.25 : 1)
      if (gusty) intensity *= 0.65 + 0.35 * noise1(t * 3 + fi)
      l.intensity = intensity
      l.distance = 13
      l.color.setHSL(0.065 + 0.02 * flicker(t, fi + 50), 0.9, 0.58)
      l.position.set(p.x + (noise1(t * 11 + fi) - 0.5) * 0.08, p.y, p.z + (noise1(t * 11 + fi + 31) - 0.5) * 0.08)
    }
    // Flames: size follows the same noise, embers and smoke near the player
    const flames = this.world.flames
    for (let i = 0; i < Math.min(14, n); i++) {
      const fi = this.flameOrder[i]
      const p = this.flamePos[fi]
      flames[fi].scale.setScalar(0.85 + 0.3 * flicker(t, fi))
      if (this.flameDist[fi] > 40 * 40) continue
      if (this.rng.chance(dt * 3)) this.particles.embers(p.x, p.y + 0.2, p.z, 1)
      if (this.rng.chance(dt * 0.8)) this.particles.smoke(p.x, p.y + 0.4, p.z, 1)
    }
  }

  /** Progress arc (if the world built one), an expanding pulse ring and rising motes while extracting. */
  private updateExtractionVisual(dt: number): void {
    const ex = this.extracting
    for (const e of this.world.extractions) {
      const ring = (e as { progressRing?: THREE.Mesh }).progressRing
      if (!ring) continue
      const on = ex !== null && ex.site === e
      ring.visible = on
      if (on) ring.geometry.setDrawRange(0, Math.floor(clamp(ex.progress, 0, 1) * 64) * 6)
    }
    const pulse = this.extractionPulse
    if (!ex) {
      pulse.visible = false
      return
    }
    const phase = (this.flickerTime % 0.9) / 0.9
    pulse.visible = true
    pulse.position.set(ex.site.x, ex.site.y + 0.1, ex.site.z)
    pulse.scale.setScalar(1 + phase * 0.7)
    ;(pulse.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - phase)
    if (this.rng.chance(dt * (this.settings.quality === "low" ? 6 : 18))) {
      this.particles.emit(ex.site.x + this.rng.range(-2, 2), ex.site.y + 0.2, ex.site.z + this.rng.range(-2, 2), { count: 1, color: 0x9fe0ff, spread: 0.1, speed: 0.3, up: 1, life: 1.8, size: 0.07, gravity: -0.6, alpha: 0.8 })
    }
  }

  /** Skips static batches and zombies the fog has swallowed completely (checked every 10 frames / every frame). */
  private updateFogCulling(): void {
    const cam = this.camera.camera.position
    if (this.envFrame % 10 === 1) {
      // Lightning lights up silhouettes: keep a little more in storms so nothing pops in with a flash
      this.cullCut = this.world.underground ? Infinity : this.sky.fogCut(this.weather.kind === "storm" ? 0.02 : 0.04)
      for (const c of this.cullables) c.mesh.visible = c.center.distanceTo(cam) - c.radius < this.cullCut
    }
    // Zombies set their own visibility every update; hide those beyond the fog, restore only the ones hidden here
    const zCut = Math.min(140, this.cullCut)
    const zCut2 = zCut * zCut
    const p = this.player.pos
    for (const z of this.zombies) {
      const d2 = (z.pos.x - p.x) ** 2 + (z.pos.z - p.z) ** 2
      if (d2 > zCut2) {
        if (z.group.visible) {
          z.group.visible = false
          this.fogHidden.add(z)
        }
      } else if (this.fogHidden.has(z)) {
        z.group.visible = true
        this.fogHidden.delete(z)
      }
    }
  }

  private renderFrame(dt: number): void {
    const lock = this.player.lockTarget
    this.camera.update(dt, this.player.pos, this.player.height, this.world.collision, this.world.terrain, lock ? lock.pos : null)
    this.sky.dome.position.copy(this.camera.camera.position)
    this.sky.setFill(this.camera.camera.position, this.player.pos)
    // Red edge: a short sharp peak right after a hit, a softer tail, and a pulse at low health
    const hurt = this.player.sinceHurt
    const hitPeak = hurt < 0.4 ? 0.6 * (1 - hurt / 0.4) ** 2 : 0
    const lowHp = this.player.hp < this.player.maxHp * 0.3 && !this.player.dead ? 0.2 + Math.sin(performance.now() * 0.006) * 0.12 : 0
    this.post.setDamage(Math.max(hitPeak, Math.max(0, 1 - hurt * 1.5) * 0.45) + lowHp)
    this.renderer.toneMappingExposure = this.sky.exposure
    this.post.setMood(this.sky.state.daylight, this.world.underground)
    const r0 = performance.now()
    this.post.render(this.scene, this.camera.camera)
    this.lastRenderMs += performance.now() - r0
    // HUD
    const markers: CompassMarker[] = []
    for (const e of this.world.extractions) markers.push({ x: e.x, z: e.z, label: e.def.name, kind: "extraction" })
    for (const m of this.missions) {
      if (m.status !== "active" || m.areaId !== this.areaId) continue
      if (m.kind === "bossHunt" && this.boss && !this.boss.dead) markers.push({ x: this.boss.pos.x, z: this.boss.pos.z, label: m.title, kind: "boss" })
      if (m.kind === "rescue" && this.survivor && !this.survivor.following) markers.push({ x: this.survivor.pos.x, z: this.survivor.pos.z, label: "Überlebender", kind: "mission" })
      if (m.kind === "explore") for (const poi of this.world.pois) if (!this.visitedPois.has(poi.id)) markers.push({ x: poi.x, z: poi.z, label: poi.name, kind: "poi" })
      if (m.kind === "treasure" && this.treasureChest && !this.treasureChest.opened && Math.hypot(this.treasureChest.x - this.player.pos.x, this.treasureChest.z - this.player.pos.z) < 45) markers.push({ x: this.treasureChest.x, z: this.treasureChest.z, label: "Schatz in der Nähe", kind: "mission" })
      if (m.kind === "purge") {
        const target = this.zombies.find((z) => z.special && !z.dead)
        if (target) markers.push({ x: target.pos.x, z: target.pos.z, label: m.title, kind: "mission" })
      }
    }
    // Boss banner the first time the boss engages
    if (this.boss && !this.boss.dead && this.boss.alerted && !this.bossIntroShown) {
      this.bossIntroShown = true
      this.hud.showBossIntro(this.boss.type.name, this.boss.type.bossTitle ?? "")
      this.audio.play("bell", { volume: 0.6 })
    }
    // Health bars over enemies hit in the last seconds
    const bars: { x: number; y: number; name: string; hp: number; maxHp: number; d: number }[] = []
    for (const z of this.zombies) {
      if (z.dead || z === lock || this.elapsed - z.lastHitAt > 4) continue
      const d = z.pos.distanceTo(this.player.pos)
      if (d > 30) continue
      const v = new THREE.Vector3(z.pos.x, z.pos.y + 2.1 * z.type.scale, z.pos.z).project(this.camera.camera)
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue
      bars.push({ x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, name: z.type.name, hp: z.hp, maxHp: z.maxHp, d })
    }
    bars.sort((a, b) => a.d - b.d)
    this.hud.updateEnemyBars(bars.slice(0, 8))
    // Marker above the interactable the prompt refers to
    if (this.lastPrompt) {
      const it = this.lastPrompt
      const y = this.world.terrain.heightAt(it.x, it.z) + (it.kind === "survivor" ? 2.2 : it.kind === "extraction" ? 2.6 : 1.5)
      const v = new THREE.Vector3(it.x, y, it.z).project(this.camera.camera)
      this.hud.showInteractMarker(v.z < 1 ? { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight } : null)
    } else this.hud.showInteractMarker(null)
    let lockScreen = { x: 0, y: 0, visible: false }
    if (lock && !lock.dead) {
      const v = new THREE.Vector3(lock.pos.x, lock.pos.y + 1.4, lock.pos.z).project(this.camera.camera)
      lockScreen = { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, visible: v.z < 1 }
    }
    this.hud.showMouseHint(this.ui.depth === 0 && this.input.device === "keyboard" && !this.input.locked && !this.player.dead)
    // Hit direction relative to the camera: 0 = straight ahead
    const camBearing = Math.atan2(-Math.sin(this.camera.yaw), -Math.cos(this.camera.yaw))
    let rel = this.player.lastDamageDir - camBearing
    while (rel > Math.PI) rel -= Math.PI * 2
    while (rel < -Math.PI) rel += Math.PI * 2
    this.hud.showHitDirection(rel, this.player.dead ? 0 : Math.max(0, 1 - this.player.sinceHurt / 1.2))
    this.hud.update(this.player, {
      prompt: this.lastPrompt?.label ?? null,
      markers,
      cameraYaw: this.camera.yaw,
      missions: this.missions.filter((m) => m.areaId === this.areaId),
      boss: this.boss && this.boss.alerted ? this.boss : null,
      extraction: this.extracting ? { name: this.extracting.site.def.name, progress: this.extracting.progress } : null,
      hour: this.sky.hour,
      weather: (this.world.underground ? "Unter der Erde" : WEATHER_NAMES[this.weather.kind]) + (this.modifier ? ` · ${this.modifier.name}` : "") + (this.night ? " · Nacht-Expedition" : ""),
      fps: this.settings.showFps ? this.fpsCounter.value : null,
      lockScreen,
    })
    for (const f of this.floatQueue) {
      const v = new THREE.Vector3(f.x, f.y, f.z).project(this.camera.camera)
      if (v.z < 1) this.hud.floatText(((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight, f.text, f.color)
    }
    this.floatQueue.length = 0
  }

  resize(w: number, h: number): void {
    this.camera.resize(w / h)
    this.particles.setViewport(h)
    this.post.resize(w, h)
  }

  applySettings(): void {
    this.camera.setFov(this.settings.fov)
    this.camera.targetDistance = this.settings.cameraDistance
    this.camera.shakeEnabled = this.settings.cameraShake
    this.sky.setShadows(this.settings.shadows && !this.world.underground)
    this.decals.enabled = this.settings.gore
    this.particles.gore = this.settings.gore
    this.gore.enabled = this.settings.gore
  }

  // ---- ending ----------------------------------------------------------------------------------------

  abandon(): void {
    this.end(false, undefined, "Expedition aufgegeben")
  }

  private end(success: boolean, extractionName?: string, cause?: string): void {
    if (this.ended) return
    this.ended = true
    this.extracting = null
    this.thunder.length = 0
    this.hud.show(false)
    this.callbacks.onEnd({ success, extractionName, cause })
  }

  mapData(): RunMapData {
    return {
      size: this.world.area.size,
      heightAt: (x, z) => this.world.terrain.heightAt(x, z),
      waterLevel: this.world.terrain.waterLevel,
      walls: this.world.collision.all.filter((c): c is Extract<typeof c, { kind: "box" }> => c.kind === "box" && c.y1 - c.y0 > 2.5 && Math.max(c.hw, c.hd) > 1.5).map((c) => ({ x: c.x, z: c.z, hw: c.hw, hd: c.hd, yaw: c.yaw })),
      extractions: this.world.extractions.map((e) => ({ x: e.x, z: e.z, name: e.def.name, active: e.active })),
      pois: this.world.pois.map((p) => ({ x: p.x, z: p.z, name: p.name, visited: this.visitedPois.has(p.id) })),
      markers: [
        ...(this.boss && !this.boss.dead && this.missions.some((m) => m.kind === "bossHunt" && m.areaId === this.areaId) ? [{ x: this.world.bossArena.x, z: this.world.bossArena.z, label: this.boss.type.name, kind: "boss" }] : []),
        ...(this.survivor && !this.survivor.following && !this.survivor.rescued ? [{ x: this.survivor.pos.x, z: this.survivor.pos.z, label: "Überlebender", kind: "mission" }] : []),
      ],
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw },
      explored: this.explored,
      exploredRes: this.exploredRes,
    }
  }

  get visitedCount(): number {
    return this.visitedPois.size
  }

  dispose(): void {
    for (const u of this.unsub) u()
    // Shared materials and fog settings outlive the expedition (camp, next run): dry and neutral again
    setWetness(0)
    fogUniforms.uFogHeightMix.value = 0.25
    fogUniforms.uFogFloor.value = 0
    for (const z of this.zombies) z.dispose()
    this.zombies.length = 0
    this.player.dispose()
    this.projectiles.dispose()
    this.particles.dispose()
    this.decals.dispose()
    this.gore.dispose()
    this.crows?.dispose()
    this.weather.dispose()
    this.sky.dispose()
    this.extractionPulse.geometry.dispose()
    ;(this.extractionPulse.material as THREE.Material).dispose()
    if (this.warmupObjects) {
      this.warmupObjects.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      this.warmupObjects = null
    }
    if (this.survivor) disposeHumanoid(this.survivor.humanoid)
    for (const p of this.pickups) p.object.removeFromParent()
    for (const h of this.hazards) h.mesh?.removeFromParent()
    this.world.dispose()
    this.hud.show(false)
    this.scene.clear()
  }
}

/** Tint for near backdrop hills: dark green that sinks into the fog. */
const NEAR_BACKDROP = new THREE.Color(0x1a2418)

function containerLabel(c: ContainerSite): string {
  return { chest: "Truhe öffnen", crate: "Kiste durchsuchen", barrel: "Fass durchsuchen", sack: "Sack durchsuchen", corpse: "Leiche durchsuchen", herb: "Kräuter sammeln", woodpile: "Holz nehmen", bones: "Knochen sammeln", scrap: "Eisen sammeln", cupboard: "Schrank durchsuchen" }[c.kind]
}

