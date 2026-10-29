/**
 * raid.ts — the 3D game session: menu background, the walkable base, raids into the quarantine zone and base
 * defence. Wires world, player, weapons (viewmodel), hostiles (mercenaries + infected), gore, loot, throwables,
 * survival, extraction, contracts and the HUD together. Logic runs at a fixed 60 Hz (engine.ts); rendering
 * interpolates the eye position and applies mouse look per rendered frame.
 */
import * as THREE from "three"
import { AudioSystem, stepSound, type SfxId } from "./audio"
import { Bag, type BagSlot } from "./bag"
import { STRUCTURES, TIMES } from "./baseData"
import { ENEMIES } from "./data"
import { Effects, type ImpactKind } from "./effects"
import { EnemyManager } from "./enemies"
import { GameLoop } from "./engine"
import { GoreSystem } from "./gore"
import { GRENADE_DAMAGE, GRENADE_RADIUS, GrenadeSystem, type ThrowableKind } from "./grenades"
import type { DamageInfo, Hostile, HostileHit, HostileManager, HitPart, PlayerState, ShotEvent, AttackEvent, HostileSound } from "./hostiles"
import { INFECTED, type InfectedKind } from "./infectedData"
import { Input } from "./input"
import { ITEMS, type ItemId } from "./items"
import { ContainerField, rollAirdrop, rollContainer, rollInfectedBody, rollMercBody, SEARCH_TIME, type ContainerRef, type GroundLoot } from "./loot"
import { Player, RADIUS, WALK } from "./player"
import type { Company, RaidKit, RaidStats } from "./profile"
import { addBleed, applyUse, stepVitals } from "./survival"
import type { CompassMarker, EnemyKind, GameSnapshot, HudSnapshot, RaidPlan, RaidResult, Settings, Vec3 } from "./types"
import { ViewModel } from "./viewmodel"
import { AMMO, WEAPONS, effectiveWeapon, type AmmoId, type WeaponId } from "./weaponData"
import { WeaponRuntime, coneOffset, damageAt, type AmmoSource } from "./weapons"
import { createWorld, type World } from "./world"
import { InfectedManager } from "./zombies"
import type { BaseLayout, ExtractionDef, ObjectiveAnchor, StationId, ZoneLayout } from "./zone"
import { BACKPACKS, CARRY_LIMIT } from "./items"

export interface LootSession {
  title: string
  items: BagSlot[]
  bag: Bag
  /** Take one slot (or all of it) into the backpack; returns the amount moved. */
  take(index: number): number
  takeAll(): number
  /** Put a backpack slot into the container. */
  put(index: number): number
  close(): void
}

export interface RaidCallbacks {
  onHud: (hud: HudSnapshot) => void
  onEnd: (result: RaidResult) => void
  onPause: () => void
  onInventory: () => void
  onMap: () => void
  onLoot: (session: LootSession) => void
  onStation: (id: StationId | "plot", structure?: string) => void
  onDefenseEnd: (won: boolean, kills: number) => void
}

type Mode = "menu" | "base" | "raid" | "defense" | "dying" | "ended"
type Interactable =
  | { kind: "container"; ref: ContainerRef }
  | { kind: "ground"; loot: GroundLoot }
  | { kind: "extract"; ex: ExtractionDef }
  | { kind: "objective"; obj: ObjectiveAnchor }
  | { kind: "station"; id: StationId; name: string }
  | { kind: "plot"; structure: string; name: string }

interface FireZone { pos: THREE.Vector3; radius: number; life: number; tick: number }
type WeaponSlot = "primary" | "secondary" | "melee"

const PAD_LABEL: Record<string, string> = { E: "Ⓐ", Q: "RB", G: "LB", R: "Ⓧ", F: "Steuerkreuz ↑", M: "Steuerkreuz ↓", C: "Ⓑ", V: "R3", T: "Steuerkreuz →" }
const RAID_TIME = 30 * 60

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
/** Compass heading in degrees (0 = north = -Z, clockwise) of a direction. */
export function headingOf(dx: number, dz: number): number { return ((Math.atan2(dx, -dz) * 180 / Math.PI) % 360 + 360) % 360 }
export function wrapDegrees(a: number): number { return ((a + 540) % 360) - 180 }
export function formatClock(seconds: number): string { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }

export class RaidGame {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 900)
  readonly input: Input
  readonly viewModel = new ViewModel()
  readonly player = new Player()
  world!: World
  private worldKey = ""
  private gore!: GoreSystem
  private effects!: Effects
  private grenades!: GrenadeSystem
  private mercs: EnemyManager | null = null
  private infected: InfectedManager | null = null
  private containers: ContainerField | null = null
  private ground: GroundLoot[] = []
  private fires: FireZone[] = []
  private fireLight = new THREE.PointLight(0xff8a3a, 0, 14, 2)
  private loop: GameLoop
  private flashlight = new THREE.SpotLight(0xfff2dc, 0, 40, 0.42, 0.55, 1.6)
  private mode: Mode = "menu"
  private paused = false
  /** A live overlay (loot, inventory, map) is open: the world keeps running but the player does not move. */
  private overlay = false
  private quality: "high" | "low"
  private rng = mulberry32(1)
  private kit: RaidKit | null = null
  private plan: RaidPlan | null = null
  // carried
  bag = new Bag(8)
  secure = new Bag(2)
  private weapons: Record<WeaponSlot, WeaponRuntime | null> = { primary: null, secondary: null, melee: new WeaponRuntime("knife", {}, null) }
  private active: WeaponSlot = "primary"
  private pending: WeaponSlot | null = null
  private switchTime = -1
  private meleeTime = -1
  private meleeQuick = false
  private meleeHitDone = false
  private useTime = -1
  private useItem: ItemId | null = null
  private useKind: "medical" | "food" | "throw" | null = null
  private throwKind: ThrowableKind = "grenade"
  private ads = 0
  private flashlightOn = false
  private godMode = false
  // raid state
  private timeLeft = 0
  private elapsed = 0
  private stats: RaidStats = emptyRaidStats()
  private openExits: ExtractionDef[] = []
  private exitState = new Map<string, { called: boolean; progress: number; paid: boolean }>()
  private activeExit: ExtractionDef | null = null
  private extracted = false
  private objectiveProgress = new Map<string, number>()
  private interactTarget: Interactable | null = null
  private interactHold = 0
  private interactText = ""
  private damageDirs: { heading: number; life: number }[] = []
  private hitMarker = 0
  private killMarker = 0
  private damageFlash = 0
  private shake = 0
  private message = ""
  private messageTime = 0
  private hint = ""
  private hintTime = 0
  private hintsShown = new Set<string>()
  private deathTime = 0
  private dyingRoll = 0
  private hudClock = 0
  private populateClock = 0
  private time = 0
  private lastRender = performance.now()
  private lookFrame = { yaw: 0, pitch: 0 }
  private hadPointerLock = false
  private fps = 60
  private fpsFrames = 0
  private fpsTime = 0
  private airdrop: { at: number; spot: { x: number; z: number } | null; landed: boolean; loot: GroundLoot | null; fall: number; mesh: THREE.Group | null } | null = null
  private bossSpawned = false
  private defense: { wave: number; waves: number; nextWave: number; kills: number } | null = null
  private guardClock = 0
  private lastArea = ""
  private onResize = () => this.resize()
  private onPointerLock = () => {
    if (document.pointerLockElement === this.renderer.domElement) { this.hadPointerLock = true; return }
    this.input.resetAll()
    if (this.hadPointerLock && this.isControlled && !this.paused && !this.overlay) { this.pause(); this.callbacks.onPause() }
  }
  /** Clicking the 3D view while playing re-captures the mouse (e.g. after the browser refused the first request). */
  private onCanvasClick = () => { if (this.isControlled && !this.paused && !this.overlay && document.pointerLockElement !== this.renderer.domElement) this.requestLock() }

  constructor(canvas: HTMLCanvasElement, private company: Company, private settings: Settings, private audio: AudioSystem, private callbacks: RaidCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.autoClear = false; this.renderer.info.autoReset = false
    this.quality = settings.quality
    this.viewModel.initEnvironment(this.renderer)
    this.input = new Input(canvas)
    this.camera.rotation.order = "YXZ"; this.scene.add(this.camera)
    this.flashlight.position.set(0.18, -0.12, 0.1); this.flashlight.target.position.set(0.05, -0.05, -5); this.camera.add(this.flashlight, this.flashlight.target)
    this.scene.add(this.fireLight)
    this.applySettings(settings)
    this.showMenu()
    this.resize()
    window.addEventListener("resize", this.onResize); document.addEventListener("pointerlockchange", this.onPointerLock)
    canvas.addEventListener("click", this.onCanvasClick)
    this.loop = new GameLoop({ update: dt => this.update(dt), render: alpha => this.render(alpha) })
    this.loop.start()
  }

  get isControlled(): boolean { return this.mode === "base" || this.mode === "raid" || this.mode === "defense" }
  get currentMode(): Mode { return this.mode }

  // ───────────────────────────── worlds ─────────────────────────────

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewModel.setAspect(w / h)
    this.renderer.setSize(w, h, false); this.effects?.setViewportHeight(h * this.renderer.getPixelRatio())
  }

  /** Builds (or reuses) a world; dynamic content is always cleared. */
  private useWorld(kind: "zone" | "base", key: string): void {
    this.clearDynamic()
    if (this.world && this.worldKey === key) {
      if (kind === "base") this.world.setStructures(this.company.profile.structures)
      return
    }
    if (this.world) { this.effects.dispose(); this.gore.dispose(); this.world.dispose() }
    this.world = createWorld(kind, this.scene, this.quality, { time: this.plan?.time, structures: this.company.profile.structures })
    this.worldKey = key
    this.renderer.toneMappingExposure = this.world.exposure
    this.effects = new Effects(this.scene); this.effects.setViewportHeight(window.innerHeight * this.renderer.getPixelRatio())
    this.gore = new GoreSystem(this.scene, this.world.collision, this.settings.gore)
    this.gore.onScreenSplatter = amount => { if (this.settings.gore !== "off") this.screenBlood?.(amount) }
    // compile every shader of the new world now instead of stuttering on the first look at each area
    try { this.renderer.compile(this.scene, this.camera) } catch { /* compile is an optimisation only */ }
    this.grenades = new GrenadeSystem(this.scene, {
      bounce: p => this.sfx("grenade_bounce", { position: p }),
      explode: p => this.explode(p),
      ignite: p => this.ignite(p),
    })
  }

  /** Optional hook (set by the UI) for blood on the screen. */
  screenBlood: ((amount: number) => void) | null = null

  private clearDynamic(): void {
    this.mercs?.dispose(); this.mercs = null
    this.infected?.dispose(); this.infected = null
    this.containers?.dispose(); this.containers = null
    for (const g of this.ground) if (g.mesh) g.mesh.parent?.remove(g.mesh)
    this.ground = []; this.fires = []; this.fireLight.intensity = 0
    if (this.airdrop?.mesh) this.airdrop.mesh.parent?.remove(this.airdrop.mesh)
    this.airdrop = null; this.defense = null; this.bossSpawned = false
    this.effects?.clear(); this.gore?.clear(); this.grenades?.clear()
  }

  private makeHostiles(seed: number): void {
    const hostileEvents = {
      shoot: (s: ShotEvent) => this.onShot(s),
      attack: (a: AttackEvent) => this.onAttack(a),
      died: (t: Hostile, cause: DamageInfo["kind"], part: HitPart) => this.onDied(t, cause, part),
      spotted: (t: Hostile) => { if (this.isControlled) this.sfx(t.faction === "infected" ? "zombie_alert" : "alert", { position: t.position, volume: 0.6 }) },
      footstep: (t: Hostile) => { if (this.isControlled && t.position.distanceToSquared(this.player.pos) < 400) this.sfx(stepSound(this.world.surfaceAt(t.position.x, t.position.z)), { position: t.position, volume: 0.7 }) },
      sound: (t: Hostile, s: HostileSound) => this.onHostileSound(t, s),
    }
    const opts = { difficulty: this.settings.difficulty, seed, events: hostileEvents, gore: this.gore }
    this.mercs = new EnemyManager(this.world.group, this.world, opts)
    this.infected = new InfectedManager(this.world.group, this.world, { ...opts, seed: seed ^ 0x9e3779b9 })
  }

  private get hostiles(): HostileManager[] { return [this.mercs, this.infected].filter((h): h is EnemyManager | InfectedManager => !!h) }

  /** Menu background: the base from above (orbit camera), no control. */
  showMenu(): void {
    if (this.mode === "raid" || this.mode === "dying" || this.mode === "defense") return
    this.mode = "menu"; this.plan = null
    this.useWorld("base", "base")
    this.viewModel.visible = false; this.input.capture = false; this.overlay = false; this.paused = false
    if (document.pointerLockElement) document.exitPointerLock()
    this.audio.setAmbience("base"); this.audio.setIntensity(0); this.audio.setHeartbeat(0)
  }

  /** Walk around the base in first person. */
  enterBase(): void {
    if (this.mode === "raid" || this.mode === "dying" || this.mode === "defense") return
    this.plan = null
    this.useWorld("base", "base")
    const s = (this.world.layout as BaseLayout).spawn, lo = this.company.profile.loadout
    this.player.reset(s.x, s.z, s.yaw)
    this.player.armor = lo.armor; this.player.armorMax = lo.armorMax; this.player.helmet = lo.helmet
    this.player.vitals.infection = this.company.profile.infection
    this.mode = "base"; this.paused = false; this.overlay = false
    this.viewModel.visible = false
    this.input.capture = true; this.input.clearActions(); this.input.resetAll()
    this.hintsShown.clear()
    if (!this.company.profile.tutorialDone) this.showHint("base", `Ihre Basis. Gehen Sie zu den Stationen und drücken Sie ${this.key("E")}. Zum Einsatz: Tor im Süden oder Funkstation.`, 9)
    this.audio.setAmbience("base")
    this.requestLock(); this.pushHud()
  }

  /** Rebuilds base structures after building (if the base is shown). */
  refreshBase(): void { if (this.world?.kind === "base") this.world.setStructures(this.company.profile.structures) }

  // ───────────────────────────── raid lifecycle ─────────────────────────────

  startRaid(plan: RaidPlan): void {
    const seed = (Date.now() ^ (this.company.profile.stats.raids * 7919)) >>> 0
    this.rng = mulberry32(seed)
    this.plan = plan
    this.useWorld("zone", `zone:${plan.time}`)
    this.makeHostiles(seed)
    const layout = this.world.layout as ZoneLayout
    // containers on every loot spot (night and research add rolls)
    const bonus = (this.company.has("scavenger") ? 1 : 0) + (TIMES[plan.time].loot > 0.2 && this.rng() < 0.5 ? 1 : 0)
    this.containers = new ContainerField(this.world.group, layout.lootSpots.map(spot => ({ spot, items: rollContainer(spot, this.rng, bonus) })))
    // mercenary camps
    for (const camp of layout.mercCamps) {
      const d = this.world.districtAt(camp.x, camp.z)?.danger ?? 1
      const pool: EnemyKind[] = d >= 3 ? ["rifleman", "heavy", "marksman", "rifleman", "scout"] : d === 2 ? ["rifleman", "scout", "heavy", "rifleman"] : ["scout", "rifleman", "scout"]
      const kinds = camp.kinds ?? Array.from({ length: camp.squad }, (_, i) => pool[(i + Math.floor(this.rng() * pool.length)) % pool.length])
      this.mercs!.spawnSquad(kinds, camp.x, camp.z, camp.patrol)
    }
    // exits: roll which are open; at least two (the cheapest first)
    this.openExits = layout.extractions.filter(e => this.rng() < e.chance)
    for (const e of layout.extractions) if (this.openExits.length < 2 && !this.openExits.includes(e)) this.openExits.push(e)
    this.exitState.clear(); for (const e of layout.extractions) { this.exitState.set(e.id, { called: false, progress: 0, paid: false }); this.world.setExtraction(e.id, this.openExits.includes(e) ? "ready" : "hidden", 0) }
    this.activeExit = null; this.extracted = false
    this.objectiveProgress.clear()
    // airdrop
    const radio = this.company.level("radio")
    this.airdrop = radio >= 3 || this.rng() < 0.35 ? { at: 240 + this.rng() * 360, spot: layout.airdropSpots[Math.floor(this.rng() * layout.airdropSpots.length)] ?? null, landed: false, loot: null, fall: 0, mesh: null } : null
    // player and kit
    const ins = layout.insertions.find(i => i.id === plan.insertion) ?? layout.insertions[0]
    this.player.reset(ins.x, ins.z, ins.yaw)
    this.kit = this.company.beginRaid()
    this.equipKit(this.kit)
    this.player.vitals.infection = this.kit.infection
    this.timeLeft = RAID_TIME; this.elapsed = 0; this.stats = emptyRaidStats()
    this.resetCombatState()
    this.mode = "raid"; this.paused = false; this.overlay = false
    this.viewModel.visible = true
    this.input.capture = true; this.input.clearActions(); this.input.resetAll()
    this.lastArea = ""
    this.say(`${TIMES[plan.time].name} · ${ins.name} · Offene Extraktionen: ${this.openExits.length}`, 5)
    if (!this.company.profile.tutorialDone) this.showHint("move", "WASD bewegen · Shift sprinten · C ducken · V Messer · Tab Rucksack · M Karte · Esc Pause", 9)
    else if (plan.time === "night") this.showHint("night", `Nacht: mehr Infizierte, bessere Beute. Taschenlampe mit ${this.key("F")} – Licht macht sichtbar.`, 7)
    this.audio.setAmbience(plan.time)
    this.requestLock(); this.pushHud()
  }

  /** Base defence: the current loadout fights waves of infected at the compound. */
  startDefense(): void {
    this.plan = null
    this.useWorld("base", "base")
    const layout = this.world.layout as BaseLayout
    this.makeHostiles((Date.now() >>> 0) ^ 0x5bd1e995)
    const lo = this.company.profile.loadout
    this.kit = { primary: lo.primary, primaryMods: { ...lo.primaryMods }, primaryAmmo: lo.primaryAmmo, secondary: lo.secondary, secondaryMods: { ...lo.secondaryMods }, secondaryAmmo: lo.secondaryAmmo, melee: lo.melee, armor: lo.armor, armorMax: lo.armorMax, helmet: lo.helmet, backpack: lo.backpack, bag: lo.bag.map(s => ({ ...s })), secure: [], secureSlots: 0, infection: this.company.profile.infection }
    this.equipKit(this.kit)
    this.player.reset(layout.spawn.x, layout.spawn.z - 6, layout.spawn.yaw)
    const threat = this.company.profile.base.threat
    this.defense = { wave: 0, waves: 3, nextWave: 6, kills: 0 }
    this.timeLeft = 0; this.elapsed = 0; this.stats = emptyRaidStats()
    this.resetCombatState()
    this.mode = "defense"; this.paused = false; this.overlay = false
    this.viewModel.visible = true
    this.input.capture = true; this.input.clearActions(); this.input.resetAll()
    this.say(`Angriff auf die Basis! Bedrohung ${Math.round(threat)} · 3 Wellen`, 5)
    this.sfx("base_alarm"); this.audio.setAmbience("night")
    this.requestLock(); this.pushHud()
  }

  private equipKit(kit: RaidKit): void {
    this.bag = new Bag(BACKPACKS[kit.backpack].slots, kit.bag)
    this.secure = new Bag(kit.secureSlots, kit.secure)
    const src = this.ammoSource
    const mk = (id: WeaponId | null, mods: RaidKit["primaryMods"], ammo: AmmoId | null) => { if (!id) return null; const w = new WeaponRuntime(id, mods, ammo); w.load(src); return w }
    this.weapons = { primary: mk(kit.primary, kit.primaryMods, kit.primaryAmmo), secondary: mk(kit.secondary, kit.secondaryMods, kit.secondaryAmmo), melee: new WeaponRuntime(kit.melee, {}, null) }
    this.active = this.weapons.primary ? "primary" : this.weapons.secondary ? "secondary" : "melee"
    this.viewModel.setWeapon(this.weapon.id, this.weapon.mods)
    this.player.armor = kit.armor + (kit.armor > 0 && this.company.has("plating") ? 25 : 0); this.player.armorMax = kit.armorMax; this.player.helmet = kit.helmet
    const g = this.bag.count("grenade"), m = this.bag.count("molotov")
    this.throwKind = g > 0 || m === 0 ? "grenade" : "molotov"
  }

  private resetCombatState(): void {
    this.pending = null; this.switchTime = -1; this.meleeTime = -1; this.useTime = -1; this.useItem = null; this.useKind = null
    this.ads = 0; this.flashlightOn = false; this.godMode = false
    this.interactTarget = null; this.interactHold = 0; this.damageDirs = []
    this.hitMarker = this.killMarker = this.damageFlash = this.shake = 0
    this.hintsShown.clear(); this.hint = ""; this.hintTime = 0; this.deathTime = 0; this.dyingRoll = 0
    this.hadPointerLock = false
  }

  /** Rounds come from and go back to the backpack. */
  readonly ammoSource: AmmoSource = {
    count: id => this.bag.count(id),
    take: (id, n) => this.bag.remove(id, n),
    give: (id, n) => { const added = this.bag.add(id, n); if (added < n) this.dropItems([{ id, qty: n - added }]); return n },
  }

  requestLock(): void {
    const el = this.renderer.domElement
    if (document.pointerLockElement === el) return
    try { const r = el.requestPointerLock() as unknown as Promise<void> | undefined; if (r && typeof r.catch === "function") r.catch(() => this.say("Zum Umsehen in das Spielfeld klicken", 3)) } catch { this.say("Zum Umsehen in das Spielfeld klicken", 3) }
  }
  resume(): void { if (!this.isControlled) return; this.paused = false; this.overlay = false; this.input.capture = true; this.input.clearActions(); this.input.resetAll(); this.requestLock() }
  pause(): void { if (!this.isControlled) return; this.paused = true; this.input.capture = false; this.input.resetAll(); if (document.pointerLockElement) document.exitPointerLock() }
  /** Opens a live overlay (loot, backpack, map): the world keeps running, the player stands still. */
  openOverlay(): void { if (!this.isControlled) return; this.overlay = true; this.input.capture = false; this.input.resetAll(); if (document.pointerLockElement) document.exitPointerLock() }
  get isPaused(): boolean { return this.paused }
  leaveToMenu(): void {
    if (this.mode === "raid" || this.mode === "dying") this.finishRaid(false, "Einsatz abgebrochen")
    if (this.mode === "defense") this.finishDefense(false)
    this.mode = "ended"
    this.showMenu()
  }
  abort(): void {
    if (this.mode === "raid") this.finishRaid(false, "Einsatz durch Operator abgebrochen – Ausrüstung zurückgelassen")
    else if (this.mode === "defense") this.finishDefense(false)
    else if (this.mode === "base") { this.mode = "ended"; this.showMenu() }
  }

  private get weapon(): WeaponRuntime { return this.weapons[this.active] ?? this.weapons.melee! }

  // ───────────────────────────── update ─────────────────────────────

  private update(dt: number): void {
    this.time += dt
    this.fpsTime += dt
    if (this.mode === "menu" || this.mode === "ended") {
      this.input.consumeLook(); this.input.clearActions()
      this.effects.update(dt); this.gore.update(dt, this.camera)
      return
    }
    if (this.mode === "dying") {
      this.deathTime += dt; this.input.consumeLook()
      this.updateHostiles(dt, false); this.effects.update(dt); this.gore.update(dt, this.camera)
      if (this.deathTime > 1.8) { if (this.defense) this.finishDefense(false); else this.finishRaid(false, "Operator im Einsatz gefallen") }
      return
    }
    if (this.paused) { this.input.consumeLook(); return }
    if (!this.overlay) this.input.poll(dt)
    const raid = this.mode === "raid", fight = raid || this.mode === "defense"

    this.elapsed += dt
    if (raid) this.timeLeft -= dt
    this.hitMarker = Math.max(0, this.hitMarker - dt); this.killMarker = Math.max(0, this.killMarker - dt)
    this.damageFlash = Math.max(0, this.damageFlash - dt); this.messageTime = Math.max(0, this.messageTime - dt); this.hintTime = Math.max(0, this.hintTime - dt)
    this.shake = Math.max(0, this.shake - dt * 2.5)
    for (let i = this.damageDirs.length - 1; i >= 0; i--) { this.damageDirs[i].life -= dt / 1.6; if (this.damageDirs[i].life <= 0) this.damageDirs.splice(i, 1) }

    if (!this.overlay) {
      if (this.input.consumeAction("Escape")) { this.pause(); this.callbacks.onPause(); return }
      if (this.input.consumeAction("Tab")) { this.openOverlay(); this.callbacks.onInventory(); return }
      if (this.mode !== "base" && this.input.consumeAction("KeyM")) { this.openOverlay(); this.callbacks.onMap(); return }
      if (fight) this.handleCombatKeys()
    }

    const step = this.player.update(dt, this.overlay ? NO_INPUT as unknown as Input : this.input, {
      collision: this.world.collision, weaponSpeed: fight ? this.weapon.def.moveSpeed : 1, ads: this.ads, load: this.load(), busy: this.useTime >= 0 || this.meleeTime >= 0, reloading: this.weapon.reloading,
    })
    if (step) {
      const surface = this.world.surfaceAt(this.player.pos.x, this.player.pos.z)
      this.sfx(stepSound(surface), { volume: step.crouched ? 0.35 : step.sprinting ? 1 : 0.65, rate: 0.95 + this.rng() * 0.1 })
      if (fight) this.noise(this.player.pos, step.sprinting ? 16 : step.crouched ? 2.5 : 7)
    }

    if (fight) {
      this.updateWeapons(dt)
      this.updateUse(dt)
      if (this.mode !== "raid" && this.mode !== "defense") return
      this.updateHostiles(dt, true)
      this.grenades.update(dt, (x, z) => this.world.collision.near(x, z, 3))
      this.updateFires(dt)
      // survival
      const lost = stepVitals(this.player.vitals, dt, { metabolism: this.company.has("metabolism"), immunology: this.company.has("immunology"), sprinting: this.player.sprinting })
      if (lost > 0.5 * dt && this.player.vitals.bleed !== "none" && this.rng() < dt * 0.6) this.gore.wound({ x: this.player.pos.x, y: 0.9, z: this.player.pos.z }, { x: 0, y: -1, z: 0 }, 6)
    }
    this.updateInteraction(dt)
    // in the base only E (stations) is used; other key presses must not pile up for the next raid
    if (!fight) this.input.clearActions()
    if (raid) { this.updateExtraction(dt); if (this.mode !== "raid") return; this.updateAirdrop(dt); this.updateBoss(); this.updateArea() }
    if (this.mode === "defense") { this.updateDefense(dt); if (this.mode !== "defense") return }
    this.effects.update(dt, _camPos.set(this.player.pos.x, this.player.eye, this.player.pos.z))
    this.gore.update(dt, this.camera)
    this.containers?.update(dt)
    this.updateHints()
    if (fight) {
      const combat = this.hostiles.reduce((n, h) => n + h.combatCount(), 0)
      this.audio.setIntensity(Math.min(1, combat / 4))
      this.audio.setHeartbeat(this.player.health < 35 ? 1 - this.player.health / 35 : 0)
      if (this.player.health <= 0 && !this.godMode) {
        this.player.health = 0; this.mode = "dying"; this.deathTime = 0; this.dyingRoll = (this.rng() - 0.5) * 2; this.viewModel.visible = false
        this.audio.setHeartbeat(0); this.input.capture = false; this.overlay = false; this.pushHud(); return
      }
      if (raid && this.timeLeft <= 0) { this.finishRaid(false, "Zeit abgelaufen · Operator in der Sperrzone verschollen"); return }
      if (raid && this.timeLeft < 120 && this.timeLeft + dt >= 120) this.say("Noch 2 Minuten bis zum Ende des Einsatzfensters!", 4)
    }
    this.hudClock -= dt; if (this.hudClock <= 0) { this.hudClock = 0.05; this.pushHud() }
  }

  private handleCombatKeys(): void {
    const i = this.input
    if (i.consumeAction("KeyR")) this.reload()
    if (i.consumeAction("KeyQ")) this.quickHeal()
    if (i.consumeAction("KeyG")) this.startThrow()
    if (i.consumeAction("KeyV") || i.consumeAction("Middle")) this.quickMelee()
    if (i.consumeAction("KeyT")) this.switchAmmo()
    if (i.consumeAction("KeyF")) { this.flashlightOn = !this.flashlightOn; this.sfx("flashlight") }
    if (i.consumeAction("KeyC")) this.player.crouched = !this.player.crouched
    if (i.consumeAction("Digit1")) this.switchTo("primary")
    if (i.consumeAction("Digit2")) this.switchTo("secondary")
    if (i.consumeAction("Digit3")) this.switchTo("melee")
    if (i.consumeAction("Digit4")) { this.throwKind = this.throwKind === "grenade" ? "molotov" : "grenade"; this.say(this.throwKind === "grenade" ? "Wurfwaffe: Splittergranate" : "Wurfwaffe: Brandflasche", 1.4) }
    if (i.consumeAction("WheelUp") || i.consumeAction("KeyX")) this.cycleWeapon(1)
    if (i.consumeAction("WheelDown")) this.cycleWeapon(-1)
  }

  private updateHostiles(dt: number, active: boolean): void {
    const ps = this.playerState(active)
    for (const h of this.hostiles) h.update(dt, ps)
    if (this.mode === "raid" && this.infected) {
      this.populateClock -= dt
      if (this.populateClock <= 0) {
        this.populateClock = 1
        const layout = this.world.layout as ZoneLayout, mult = TIMES[this.plan!.time].infected * (this.settings.difficulty === "hard" ? 1.25 : this.settings.difficulty === "easy" ? 0.8 : 1)
        this.infected.populate(layout.infectedZones.map(z => ({ ...z, density: z.density * mult })), ps, Math.round(32 * mult))
      }
    }
  }

  private playerState(active: boolean): PlayerState {
    const p = this.player
    _ps.position.copy(p.pos); _ps.eyeY = p.eye; _ps.crouched = p.crouched; _ps.speed = p.speed; _ps.sprinting = p.sprinting
    _ps.flashlight = this.flashlightOn; _ps.alive = p.health > 0; _ps.active = active && (this.mode === "raid" || this.mode === "defense")
    return _ps
  }

  private load(): number {
    let w = this.bag.weight() + this.secure.weight()
    for (const s of ["primary", "secondary", "melee"] as WeaponSlot[]) w += this.weapons[s]?.def.weight ?? 0
    if (this.player.armorMax) w += this.player.armorMax === 85 ? 7.5 : 3.5
    if (this.player.helmet) w += 1.4
    return w / this.weightLimit()
  }
  private weightLimit(): number { return CARRY_LIMIT + BACKPACKS[this.kit?.backpack ?? "none"].weight }

  // ───────────────────────────── weapons ─────────────────────────────

  private updateWeapons(dt: number): void {
    const p = this.player
    if (this.switchTime >= 0) {
      this.switchTime += dt / 0.5
      if (this.pending && this.switchTime >= 0.5) { this.active = this.pending; this.pending = null; this.viewModel.setWeapon(this.weapon.id, this.weapon.mods) }
      if (this.switchTime >= 1) this.switchTime = -1
    }
    for (const slot of ["primary", "secondary"] as WeaponSlot[]) {
      const w = this.weapons[slot]; if (!w) continue
      const r = w.update(dt, this.ammoSource)
      if (r === "reloaded" && w === this.weapon) { this.sfx(w.def.singleLoad ? "shell_insert" : "reload_in"); if (!w.reloading && !w.def.singleLoad) this.sfx("reload_bolt", { volume: 0.8 }) }
    }
    this.weapons.melee?.update(dt, this.ammoSource)
    // melee swing: the hit lands at 40 %
    if (this.meleeTime >= 0) {
      const def = this.meleeQuick ? WEAPONS.knife.melee! : this.weapon.def.melee!
      this.meleeTime += dt / def.swing
      if (!this.meleeHitDone && this.meleeTime >= 0.4) { this.meleeHitDone = true; this.meleeStrike(this.meleeQuick ? "knife" : this.weapon.id) }
      if (this.meleeTime >= 1) { this.meleeTime = -1; this.meleeQuick = false }
    }
    const busy = this.useTime >= 0 || this.switchTime >= 0 || this.meleeTime >= 0
    const w = this.weapon
    const adsTarget = this.input.adsHeld && !p.sprinting && !busy && !w.isMelee ? 1 : 0
    const prev = this.ads
    this.ads += (adsTarget - this.ads) * Math.min(1, dt / Math.max(0.05, w.def.adsTime) * 2.2)
    if (this.ads < 0.001) this.ads = 0
    if (prev < 0.2 && this.ads >= 0.2 && adsTarget) this.sfx("ads_in", { volume: 0.5 })
    const pressed = this.input.consumeAction("Fire"), held = this.input.fireHeld
    if ((pressed || held) && p.sprinting) p.sprintBlock = 0.25
    if (busy || (p.sprinting && !pressed)) return
    const res = w.trigger(pressed, held)
    if (res === "fired") { if (w.isMelee) this.startMelee(false); else this.fire(w) }
    else if (res === "empty") {
      this.sfx("dry_fire")
      if (w.canReload(this.ammoSource)) this.reload()
      else if (this.active === "primary" && this.weapons.secondary && this.weapons.secondary.mag + this.weapons.secondary.reserve(this.ammoSource) > 0) { this.say("Keine Munition · Wechsel zur Seitenwaffe", 1.6); this.switchTo("secondary") }
      else { this.say("Keine Munition · Nahkampf!", 1.6); this.switchTo("melee") }
    }
    if (!w.isMelee && w.mag === 0 && !held && w.canReload(this.ammoSource) && !w.reloading) this.reload()
  }

  private fire(w: WeaponRuntime): void {
    const def = w.def, p = this.player
    p.aim(_aim)
    const origin = _origin.set(p.pos.x, p.eye, p.pos.z)
    const spread = w.spread(this.ads, p.speed / WALK, p.crouched)
    const bonus = this.company.has("ballistics") ? 1.15 : 1
    const muzzle = _muzzle.copy(origin).addScaledVector(_aim.fwd, 0.75).addScaledVector(_aim.right, 0.13 * (1 - this.ads)).addScaledVector(_aim.up, -0.1 + this.ads * 0.05)
    const suppressed = !!w.mods.muzzle && w.mods.muzzle === "att_suppressor"
    let hitAny = false, killed = false, head = false
    for (let i = 0; i < def.pellets; i++) {
      coneOffset(spread, this.rng, _cone)
      _dir.copy(_aim.fwd).addScaledVector(_aim.right, _cone.x).addScaledVector(_aim.up, _cone.y).normalize()
      const maxDist = 260
      const wall = this.world.collision.raycast(origin, _dir, maxDist)
      const groundT = _dir.y < -1e-4 ? -origin.y / _dir.y : Infinity
      const limit = Math.min(maxDist, wall?.distance ?? maxDist, groundT)
      let hit: HostileHit | null = null, owner: HostileManager | null = null
      for (const h of this.hostiles) { const r = h.hitTest(origin, _dir, hit ? hit.distance : limit); if (r) { hit = r; owner = h } }
      let end: THREE.Vector3
      if (hit && owner) {
        end = hit.point
        const amount = damageAt(def, hit.distance, hit.part, bonus)
        const close = hit.distance < 6
        const sever = def.cls === "shotgun" && close ? 0.45 : def.cls === "sniper" ? 0.6 : def.cls === "dmr" || def.cls === "battle" ? 0.25 : def.damage >= 55 ? 0.2 : 0
        const r = owner.applyDamage(hit, { amount, from: p.pos, dir: _dir, penetration: def.penetration, kind: def.pellets > 1 ? "pellet" : "bullet", sever })
        hitAny = true; head = head || hit.part === "head"
        if (r.severed) this.stats.dismembered++
        if (r.killed) killed = true
      } else if (wall && wall.distance <= groundT) {
        end = _end.copy(origin).addScaledVector(_dir, wall.distance)
        const kind: ImpactKind = wall.obstacle.surface === "metal" ? "metal" : wall.obstacle.surface === "dirt" ? "dirt" : "concrete"
        this.effects.impact(end, wall.normal, kind)
        if (i === 0 || this.rng() < 0.3) this.sfx(kind === "metal" ? "impact_metal" : "impact_concrete", { position: end, volume: 0.5 })
      } else if (groundT < maxDist) {
        end = _end.copy(origin).addScaledVector(_dir, groundT)
        const s = this.world.surfaceAt(end.x, end.z)
        this.effects.impact(end, _upWorld, s === "metal" ? "metal" : s === "dirt" || s === "gravel" || s === "grass" ? "dirt" : "concrete")
      } else end = _end.copy(origin).addScaledVector(_dir, maxDist)
      if (!suppressed && (i === 0 || i % 3 === 0)) this.effects.tracer(muzzle, end)
    }
    if (hitAny) { this.hitMarker = 0.14; this.sfx(head ? "hit_head" : "hit_body", { volume: 0.8 }) }
    if (killed) { this.killMarker = 0.4; this.sfx("kill", { volume: 0.7 }) }
    // recoil: part stays (the player compensates), part is a visual punch that recovers
    const adsK = 1 - this.ads * 0.35, crouchK = p.crouched ? 0.8 : 1
    const kickP = def.recoilPitch * adsK * crouchK * (1 + Math.min(w.burst, 10) * 0.04)
    const kickY = (this.rng() - 0.45) * 2 * def.recoilYaw * adsK * crouchK
    p.look(kickY * 0.65, kickP * 0.65)
    p.punch.x += kickP * 0.35; p.punch.y += kickY * 0.35
    this.viewModel.fire()
    if (!suppressed) this.effects.muzzleFlash(muzzle, def.cls === "shotgun" ? 1.6 : def.cls === "pistol" ? 0.7 : 1)
    this.audio.play(`shot_${def.id}` as SfxId, { suppressed })
    if (def.manualAction) window.setTimeout(() => this.sfx(def.cls === "shotgun" ? "pump" : "bolt_cycle"), 280)
    if (this.settings.screenShake) this.shake = Math.min(0.6, this.shake + (def.cls === "shotgun" || def.cls === "sniper" ? 0.25 : def.cls === "dmr" || def.cls === "battle" ? 0.15 : 0.05))
    this.noise(_origin, def.noise)
  }

  private startMelee(quick: boolean): void {
    this.meleeTime = 0; this.meleeQuick = quick; this.meleeHitDone = false
    const def = quick ? WEAPONS.knife.melee! : this.weapon.def.melee!
    this.player.stamina = Math.max(0, this.player.stamina - def.stamina)
    this.sfx("melee_swing", { rate: quick ? 1.2 : def.damage > 70 ? 0.8 : 1 })
  }

  private quickMelee(): void {
    if (this.meleeTime >= 0 || this.useTime >= 0 || this.switchTime >= 0) return
    if (this.weapon.isMelee) { if (this.weapon.trigger(true, true) === "fired") this.startMelee(false); return }
    this.weapon.cancelReload(); this.startMelee(true)
  }

  private meleeStrike(id: WeaponId): void {
    const def = WEAPONS[id].melee!, p = this.player
    p.aim(_aim)
    const origin = _origin.set(p.pos.x, p.eye - 0.2, p.pos.z)
    const hits: { hit: HostileHit; owner: HostileManager }[] = []
    for (const h of this.hostiles) for (const hit of h.meleeTest(origin, _aim.fwd, def.range, def.arc, def.maxTargets)) hits.push({ hit, owner: h })
    hits.sort((a, b) => a.hit.distance - b.hit.distance)
    let any = false
    for (const { hit, owner } of hits.slice(0, def.maxTargets)) {
      if (this.world.collision.segmentBlocked3D(origin, hit.point)) continue
      const amount = def.damage * (hit.part === "head" ? 1.5 : 1) * (this.player.vitals.boost > 0 ? 1.2 : 1)
      const r = owner.applyDamage(hit, { amount, from: p.pos, dir: _aim.fwd, penetration: 0.3, kind: "melee", sever: def.sever })
      any = true
      if (r.severed) this.stats.dismembered++
      if (r.killed) this.killMarker = 0.4
    }
    if (any) { this.sfx("melee_hit_flesh"); this.hitMarker = 0.14; if (this.settings.screenShake) this.shake = Math.min(0.5, this.shake + 0.12) }
    else {
      const wall = this.world.collision.raycast(origin, _aim.fwd, def.range)
      if (wall) { this.sfx("melee_hit_wall", { position: _end.copy(origin).addScaledVector(_aim.fwd, wall.distance) }); this.effects.impact(_end, wall.normal, "concrete", false) }
    }
    this.noise(p.pos, 5)
  }

  /** Every death of a hostile counts (bullets, melee, explosions, fire, bleeding out after losing a limb). */
  private registerKill(target: Hostile, part: HitPart, headshot: boolean): void {
    this.stats.kills++
    if (target.faction === "infected") this.stats.infectedKills++; else this.stats.mercKills++
    if (headshot || part === "head") this.stats.headshots++
    this.stats.killsByKind[target.kind] = (this.stats.killsByKind[target.kind] ?? 0) + 1
    if (this.defense) this.defense.kills++
    const name = target.faction === "infected" ? INFECTED[target.kind as InfectedKind]?.name ?? "Infizierter" : ENEMIES[target.kind as EnemyKind]?.name ?? "Söldner"
    this.say(headshot ? `Kopftreffer · ${name}` : `${name} erledigt`, 1.2)
    this.killMarker = 0.4
  }

  private onDied(target: Hostile, _cause: DamageInfo["kind"], part: HitPart): void {
    if (this.mode === "raid" || this.mode === "defense" || this.mode === "dying") this.registerKill(target, part, part === "head")
    if (target.kind === "boss") { this.stats.bossKilled = true; this.say("DER KOLOSS IST GEFALLEN", 5) }
    if (this.mode !== "raid") return
    const danger = this.world.districtAt(target.position.x, target.position.z)?.danger ?? 1
    const items = target.faction === "merc" ? rollMercBody(target.kind as EnemyKind, danger, this.rng) : rollInfectedBody(target.kind as InfectedKind, this.rng)
    if (items.length) this.ground.push({ position: target.position, items, name: target.faction === "merc" ? "Gefallener Söldner" : target.kind === "boss" ? "Der Koloss" : "Infizierter", kind: "body", searched: false, mesh: null })
  }

  private onHostileSound(t: Hostile, s: HostileSound): void {
    if (!this.isControlled) return
    if (t.faction === "merc") {
      // human voices: the grunt sound pitched per soldier (deeper for death, higher for a maimed scream)
      if (s === "radio") this.sfx("radio", { position: t.position, volume: 0.5 })
      else if (s === "alert") this.sfx("alert", { position: t.position, volume: 0.6 })
      else if (s === "pain" || s === "death" || s === "scream") this.sfx("hurt", { position: t.position, volume: s === "scream" ? 1 : 0.8, rate: (s === "death" ? 0.62 : s === "scream" ? 1.18 : 0.8) + (t.id % 5) * 0.03 })
    } else {
      const map: Record<HostileSound, string> = { groan: "zombie_groan", alert: "zombie_alert", scream: "zombie_scream", attack: "zombie_attack", spit: "zombie_spit", roar: "boss_roar", pain: "zombie_pain", death: "zombie_death", radio: "radio" }
      this.sfx(map[s], { position: t.position, rate: 0.85 + (t.id % 7) * 0.05 })
    }
    // screams carry far and draw the infected
    if (s === "scream") this.noise(t.position, 45)
  }

  private reload(): void {
    const w = this.weapon
    if (w.isMelee || this.switchTime >= 0 || this.useTime >= 0 || this.meleeTime >= 0) return
    if (w.startReload(this.ammoSource)) { this.sfx(w.def.singleLoad ? (w.id === "r44" ? "revolver_open" : "shell_insert") : "reload_out"); this.player.sprintBlock = 0 }
    else if (w.reserve(this.ammoSource) <= 0 && w.mag < w.def.magazine) this.say(`Keine ${AMMO[w.ammo!]?.name ?? "Munition"} im Rucksack`, 1.6)
  }

  private switchAmmo(): void {
    const w = this.weapon; if (w.isMelee) return
    const next = w.nextAmmo(this.ammoSource)
    if (!next) { this.say("Keine andere Munitionssorte im Rucksack", 1.4); return }
    if (w.switchAmmo(next, this.ammoSource)) { this.say(`Munition: ${AMMO[next].name}`, 1.6); this.sfx("reload_out") }
  }

  private switchTo(slot: WeaponSlot): void {
    if (!this.weapons[slot]) { this.say(slot === "primary" ? "Keine Hauptwaffe" : "Keine Seitenwaffe", 1.2); return }
    if (slot === this.active && !this.pending) return
    if (this.useTime >= 0 || this.meleeTime >= 0) return
    this.weapon.cancelReload()
    this.pending = slot; this.switchTime = 0
    this.sfx("weapon_switch")
  }

  private cycleWeapon(dir: number): void {
    const order: WeaponSlot[] = ["primary", "secondary", "melee"]
    let i = order.indexOf(this.pending ?? this.active)
    for (let k = 0; k < 3; k++) { i = (i + dir + 3) % 3; if (this.weapons[order[i]]) { this.switchTo(order[i]); return } }
  }

  // ───────────────────────────── items: heal, eat, throw ─────────────────────────────

  /** Q: the best medical item for the current state. */
  private quickHeal(): void {
    const v = this.player.vitals
    const order: ItemId[] = v.bleed === "heavy" ? ["medkit", "bandage"] : v.bleed === "light" ? ["bandage", "medkit"] : v.health < 60 ? ["medkit", "bandage"] : v.infection > 30 ? ["antiviral"] : ["bandage", "medkit", "painkiller"]
    const id = order.find(x => this.bag.count(x) > 0)
    if (!id) { this.say("Keine passende Medizin im Rucksack", 1.4); this.sfx("ui_error"); return }
    this.useItemNow(id)
  }

  /** Starts using an item from the backpack (also called from the backpack screen). */
  useItemNow(id: ItemId): boolean {
    const def = ITEMS[id]
    if (!def.use || !this.isControlled || this.mode === "base") return false
    if (this.useTime >= 0 || this.meleeTime >= 0) return false
    if (this.bag.count(id) <= 0) return false
    this.weapon.cancelReload()
    this.useTime = 0; this.useItem = id; this.useKind = def.cat === "food" ? "food" : "medical"
    this.sfx(id === "bandage" ? "bandage" : def.cat === "food" ? (def.use.water ? "drink" : "eat") : id === "antiviral" || id === "stim" ? "syringe" : "heal")
    return true
  }

  private startThrow(): void {
    if (this.useTime >= 0 || this.meleeTime >= 0) return
    let kind = this.throwKind
    if (this.bag.count(kind) <= 0) kind = kind === "grenade" ? "molotov" : "grenade"
    if (this.bag.count(kind) <= 0) { this.say("Keine Wurfwaffe im Rucksack", 1.2); this.sfx("ui_error"); return }
    this.weapon.cancelReload()
    this.bag.remove(kind, 1); this.throwKind = kind
    this.useTime = 0; this.useItem = kind; this.useKind = "throw"
    this.sfx(kind === "grenade" ? "grenade_pin" : "flashlight")
  }

  private updateUse(dt: number): void {
    if (this.useTime < 0 || !this.useItem) return
    const id = this.useItem
    if (this.useKind === "throw") {
      const before = this.useTime
      this.useTime += dt / 0.6
      if (before < 0.45 && this.useTime >= 0.45) this.releaseThrowable(id as ThrowableKind)
      if (this.useTime >= 1) { this.useTime = -1; this.useItem = null; this.useKind = null }
      return
    }
    const use = ITEMS[id].use!
    const time = use.time * (this.company.has("fieldmed") && this.useKind === "medical" ? 0.75 : 1)
    this.useTime += dt / time
    if (this.useTime >= 1) {
      if (this.bag.remove(id, 1) > 0) this.say(`${ITEMS[id].name}: ${applyUse(this.player.vitals, use, this.company.has("fieldmed"))}`, 2)
      this.useTime = -1; this.useItem = null; this.useKind = null
    }
  }

  private releaseThrowable(kind: ThrowableKind): void {
    const p = this.player
    p.aim(_aim)
    const eye = { x: p.pos.x, y: p.eye - 0.1, z: p.pos.z }
    // never start inside a wall: shorten the hand offset when something is right in front
    const wall = this.world.collision.raycast(eye, _aim.fwd, 0.6)
    const off = wall ? Math.max(0, Math.min(0.4, wall.distance - 0.1)) : 0.4
    const origin = { x: eye.x + _aim.fwd.x * off, y: eye.y + _aim.fwd.y * off, z: eye.z + _aim.fwd.z * off }
    this.grenades.throw(origin, _aim.fwd, { x: p.vel.x * 0.5, y: 0, z: p.vel.y * 0.5 }, kind)
  }

  private explode(p: Vec3): void {
    this.effects.explosion(p)
    this.sfx("explosion", { position: p })
    const center = { x: p.x, y: p.y + 0.4, z: p.z }
    for (const h of this.hostiles) h.applyExplosion(center, GRENADE_RADIUS, GRENADE_DAMAGE)
    this.noise(p, 70)
    const d = Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z)
    if (this.isControlled) {
      if (this.settings.screenShake) this.shake = Math.min(1.2, this.shake + Math.max(0, 1 - d / 25) * 1.2)
      if (d < GRENADE_RADIUS && !this.world.collision.segmentBlocked3D(center, { x: this.player.pos.x, y: this.player.eye - 0.4, z: this.player.pos.z }) && !this.godMode) {
        const dmg = GRENADE_DAMAGE * 0.7 * (1 - d / GRENADE_RADIUS)
        this.damagePlayer(dmg, 0.4, p, d < 3 ? "heavy" : "light")
      }
    }
  }

  private ignite(p: Vec3): void {
    this.sfx("molotov_break", { position: p })
    this.fires.push({ pos: new THREE.Vector3(p.x, 0.05, p.z), radius: 3.4, life: 8, tick: 0 })
    this.noise(p, 30)
  }

  private updateFires(dt: number): void {
    let brightest = 0, at: THREE.Vector3 | null = null
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]
      f.life -= dt; f.tick -= dt
      this.effects.fire(f.pos, f.radius, dt)
      if (f.tick <= 0) {
        f.tick = 0.5
        for (const h of this.hostiles) for (const t of h.inRadius(f.pos, f.radius)) {
          const hit: HostileHit = { target: t, distance: 1, part: "body", bodyPart: "torso", point: t.chestPosition(new THREE.Vector3()) }
          h.applyDamage(hit, { amount: t.faction === "infected" ? 18 : 12, from: f.pos, dir: _upWorld, penetration: 1, kind: "fire", sever: 0 })
        }
        if (this.player.pos.distanceTo(f.pos) < f.radius && !this.godMode) this.damagePlayer(7, 0, f.pos, "none")
        if (this.rng() < 0.5) this.sfx("fire_burn", { position: f.pos, volume: 0.7 })
      }
      if (f.life > brightest) { brightest = f.life; at = f.pos }
      if (f.life <= 0) this.fires.splice(i, 1)
    }
    if (at) { this.fireLight.position.set(at.x, 1.2, at.z); this.fireLight.intensity = Math.min(1, brightest / 2) * (8 + Math.sin(this.time * 23) * 2) } else this.fireLight.intensity = 0
  }

  // ───────────────────────────── damage to the player ─────────────────────────────

  private onShot(s: ShotEvent): void {
    if (!this.isControlled && this.mode !== "dying") return
    this.audio.play(`enemy_${s.weapon}` as SfxId, { position: s.from })
    this.effects.tracer(s.from, s.to, true)
    this.effects.muzzleSmoke(s.from)
    const heading = headingOf(s.from.x - this.player.pos.x, s.from.z - this.player.pos.z)
    if (!s.hit) {
      _head.set(this.player.pos.x, this.player.eye, this.player.pos.z)
      const d = closestOnSegment(s.from, s.to, _head, _tmp)
      if (d < 2.5) this.sfx("whiz", { position: _tmp, volume: 1 - d / 3 })
      if (this.damageDirs.length < 6) this.damageDirs.push({ heading, life: 0.45 })
      return
    }
    if (this.mode !== "raid" && this.mode !== "defense") return
    const headHit = this.rng() < 0.15
    let dmg = s.damage
    if (headHit && this.player.helmet > 0) { const absorbed = dmg * 0.4; this.player.helmet = Math.max(0, this.player.helmet - absorbed); dmg -= absorbed; this.sfx("hit_armor") }
    this.damagePlayer(dmg, 0.65, s.from, this.rng() < 0.08 && dmg > 18 ? "heavy" : this.rng() < 0.25 ? "light" : "none")
  }

  private onAttack(a: AttackEvent): void {
    if (this.mode !== "raid" && this.mode !== "defense") return
    const armorShare = a.kind === "acid" ? 0 : 0.5
    this.damagePlayer(a.damage, armorShare, a.source.position, a.bleed)
    if (a.infection > 0 && !this.godMode) {
      const v = this.player.vitals
      v.infection = Math.min(100, v.infection + a.infection * (this.company.has("immunology") ? 0.6 : 1))
      if (v.infection >= 30 && !this.hintsShown.has("infection")) this.showHint("infection", "Infektion steigt! Antivirales Serum senkt sie. Bei 100 % verlieren Sie Gesundheit.", 7)
    }
    if (a.kind !== "acid") {
      const dx = this.player.pos.x - a.source.position.x, dz = this.player.pos.z - a.source.position.z, len = Math.hypot(dx, dz) || 1
      this.gore.wound({ x: this.player.pos.x, y: this.player.eye - 0.5, z: this.player.pos.z }, { x: dx / len, y: 0, z: dz / len }, a.damage)
    }
    if (this.settings.gore !== "off") this.screenBlood?.(Math.min(1, a.damage / 30))
  }

  private damagePlayer(dmg: number, armorShare: number, from: Vec3, bleed: "none" | "light" | "heavy"): void {
    if (this.godMode) return
    const p = this.player
    const absorbed = Math.min(p.armor, dmg * armorShare)
    p.armor -= absorbed; p.health = Math.max(0, p.health - (dmg - absorbed))
    if (bleed !== "none" && absorbed < dmg * 0.5) { const before = p.vitals.bleed; addBleed(p.vitals, bleed); if (p.vitals.bleed !== before) this.say(p.vitals.bleed === "heavy" ? "Starke Blutung! Trauma-Set benutzen (Q)" : "Blutung! Verband benutzen (Q)", 2.5) }
    this.damageFlash = 0.35
    if (this.settings.gore !== "off" && dmg - absorbed > 12) this.screenBlood?.(Math.min(0.8, (dmg - absorbed) / 45))
    if (this.settings.screenShake) this.shake = Math.min(0.8, this.shake + 0.22)
    p.punch.x += (this.rng() - 0.3) * 0.02; p.punch.y += (this.rng() - 0.5) * 0.03
    this.sfx(absorbed > dmg * 0.4 ? "armor_absorb" : "hurt", { volume: 0.9 })
    const heading = headingOf(from.x - p.pos.x, from.z - p.pos.z)
    const existing = this.damageDirs.find(d => Math.abs(wrapDegrees(d.heading - heading)) < 20)
    if (existing) { existing.life = 1; existing.heading = heading } else this.damageDirs.push({ heading, life: 1 })
    // using an item is interrupted by heavy hits (the item is kept)
    if (this.useTime >= 0 && this.useTime < 0.6 && this.useKind !== "throw" && dmg > 10) { this.useTime = -1; this.useItem = null; this.useKind = null; this.say("Unterbrochen", 1) }
  }

  // ───────────────────────────── interaction ─────────────────────────────

  private updateInteraction(dt: number): void {
    const p = this.player
    let best: Interactable | null = null, bestScore = Infinity
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw)
    const consider = (x: number, z: number, item: Interactable, range: number) => {
      const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz)
      if (d > range) return
      const facing = d < 0.9 ? 1 : (dx * fx + dz * fz) / d
      if (facing < 0.35) return
      const score = d * (2 - facing)
      if (score < bestScore) { bestScore = score; best = item }
    }
    if (this.mode === "base") {
      const layout = this.world.layout as BaseLayout
      for (const s of layout.stations) consider(s.x, s.z, { kind: "station", id: s.id, name: s.name }, 2.6)
      for (const plot of layout.plots) consider(plot.x, plot.z + plot.d / 2 + 1, { kind: "plot", structure: plot.structure, name: `${STRUCTURES[plot.structure].name} · Stufe ${this.company.level(plot.structure)}` }, 3)
    } else if (this.mode === "raid") {
      if (this.containers) for (const c of this.containers.list) if (Math.abs(c.position.x - p.pos.x) < 3 && Math.abs(c.position.z - p.pos.z) < 3) consider(c.position.x, c.position.z, { kind: "container", ref: c }, 2.3)
      for (const g of this.ground) if (g.items.length || !g.searched) consider(g.position.x, g.position.z, { kind: "ground", loot: g }, 2.1)
      const layout = this.world.layout as ZoneLayout
      for (const o of layout.objectives) consider(o.x, o.z, { kind: "objective", obj: o }, 2.6)
      for (const e of this.openExits) { const d = Math.hypot(e.x - p.pos.x, e.z - p.pos.z); if (d < e.radius && !this.activeExit) { best = { kind: "extract", ex: e }; bestScore = 0 } }
    }
    const target = best as Interactable | null
    if (!sameTarget(target, this.interactTarget)) { this.interactTarget = target; this.interactHold = 0 }
    const holding = !this.overlay && this.input.isHeld("KeyE") && this.useTime < 0
    const tapped = !this.overlay && this.input.consumeAction("KeyE")
    this.interactText = ""
    if (!target) { this.interactHold = 0; return }
    const E = this.key("E")
    if (target.kind === "station" || target.kind === "plot") {
      this.interactText = target.kind === "station" ? `${E} · ${target.name}` : `${E} · Bauplatz: ${target.name}`
      if (tapped) { this.openOverlay(); this.callbacks.onStation(target.kind === "station" ? target.id : "plot", target.kind === "plot" ? target.structure : undefined) }
      return
    }
    let time = 1, text = ""
    if (target.kind === "container") { const c = target.ref; time = c.searched ? 0.15 : SEARCH_TIME[c.kind]; text = c.searched ? `${E} · ${c.name} öffnen` : `${E} halten · ${c.name} durchsuchen` }
    else if (target.kind === "ground") { time = target.loot.searched ? 0.15 : target.loot.kind === "body" ? 1.4 : 0.6; text = `${E} halten · ${target.loot.name} durchsuchen` }
    else if (target.kind === "objective") {
      const done = this.stats.activated.includes(target.obj.id)
      if (done) { this.interactText = `${target.obj.name}: aktiviert ✓`; return }
      time = target.obj.holdTime; text = `${E} halten · ${target.obj.name} aktivieren`
    } else if (target.kind === "extract") {
      const e = target.ex, req = e.requirement
      const need = req?.item ? `${ITEMS[req.item].name} nötig` : req?.money ? `${req.money} $ Bestechung` : ""
      time = e.kind === "gate" || e.kind === "tunnel" ? e.holdTime : 0.8
      text = `${E} halten · ${e.kind === "heli" ? "Hubschrauber rufen" : e.kind === "boat" ? "Boot starten" : e.kind === "tunnel" ? "Tunnel öffnen" : e.kind === "gate" ? "Grenzposten passieren" : "Fahrzeug starten"}${need ? ` (${need})` : ""}`
    }
    this.interactText = text
    if (holding) {
      if (this.interactHold === 0 && target.kind === "container" && !target.ref.searched) this.sfx("crate_open", { volume: 0.7 })
      this.interactHold += dt / time
      if (this.interactHold >= 1) { this.interactHold = 0; this.complete(target) }
    } else this.interactHold = Math.max(0, this.interactHold - dt * 3)
  }

  private complete(t: Interactable): void {
    if (t.kind === "container") { const c = t.ref; c.searched = true; this.containers?.open(c); this.openLoot(c.name, c.items) }
    else if (t.kind === "ground") { t.loot.searched = true; this.openLoot(t.loot.name, t.loot.items, t.loot) }
    else if (t.kind === "objective") { this.stats.activated.push(t.obj.id); this.sfx("radio"); this.say(`${t.obj.name} aktiviert`, 3); this.noise(this.player.pos, 40) }
    else if (t.kind === "extract") this.activateExit(t.ex)
  }

  private openLoot(title: string, items: BagSlot[], ground?: GroundLoot): void {
    this.sfx("zipper", { volume: 0.6 })
    const bag = this.bag, self = this
    const container = new Bag(Math.max(items.length + 8, 12), items)
    const sync = () => { items.length = 0; for (const s of container.items) items.push(s) }
    const session: LootSession = {
      title, get items() { return container.items }, bag,
      take(index) { const moved = container.moveSlotTo(index, bag); sync(); if (moved > 0) self.sfx("loot_take", { volume: 0.6 }); else self.say("Rucksack voll", 1.2); return moved },
      takeAll() { let n = 0; for (let i = container.items.length - 1; i >= 0; i--) n += container.moveSlotTo(i, bag); sync(); if (n) self.sfx("loot_take", { volume: 0.7 }); if (container.items.length) self.say("Rucksack voll", 1.2); return n },
      put(index) { const moved = bag.moveSlotTo(index, container); sync(); return moved },
      close() { if (ground && !items.length && ground.mesh) { ground.mesh.parent?.remove(ground.mesh); self.ground.splice(self.ground.indexOf(ground), 1) } self.resume() },
    }
    this.openOverlay()
    this.callbacks.onLoot(session)
    if (!this.company.profile.tutorialDone) this.showHint("loot", "Gegenstände anklicken, um sie in den Rucksack zu nehmen · Rucksackplatz und Gewicht sind begrenzt", 7)
  }

  /** Drops backpack slots on the ground as a bag (from the backpack screen). */
  dropItems(slots: BagSlot[]): void {
    if (!slots.length) return
    const near = this.ground.find(g => g.kind === "bag" && g.position.distanceTo(this.player.pos) < 1.5)
    if (near) { const b = new Bag(64, near.items); for (const s of slots) b.add(s.id, s.qty); near.items.splice(0, near.items.length, ...b.items); return }
    const mesh = new THREE.Mesh(_bagGeo, _bagMat)
    const pos = new THREE.Vector3(this.player.pos.x - Math.sin(this.player.yaw) * 0.8, 0, this.player.pos.z - Math.cos(this.player.yaw) * 0.8)
    mesh.position.set(pos.x, 0.18, pos.z); mesh.rotation.z = Math.PI / 2; this.world.group.add(mesh)
    this.ground.push({ position: pos, items: slots.map(s => ({ ...s })), name: "Abgelegte Tasche", kind: "bag", searched: true, mesh })
    this.sfx("item_drop")
  }

  dropSlot(index: number): void { if (this.mode !== "raid" && this.mode !== "defense") return; const s = this.bag.removeSlot(index); if (s) this.dropItems([s]) }
  moveToSecure(index: number): boolean { const moved = this.bag.moveSlotTo(index, this.secure); this.syncSecure(); return moved > 0 }
  moveFromSecure(index: number): boolean { const moved = this.secure.moveSlotTo(index, this.bag); this.syncSecure(); return moved > 0 }
  /** A reload during the raid keeps exactly what is in the secure container now. */
  private syncSecure(): void { if (this.mode === "raid") { this.company.profile.raidSecure = this.secure.toJSON(); this.company.save() } }

  // ───────────────────────────── extraction ─────────────────────────────

  private activateExit(e: ExtractionDef): void {
    const st = this.exitState.get(e.id)!
    const req = e.requirement
    if (req?.item && !st.paid) {
      if (this.bag.count(req.item) <= 0 && this.secure.count(req.item) <= 0) { this.say(`${ITEMS[req.item].name} benötigt`, 2.5); this.sfx("ui_error"); return }
      if (this.bag.remove(req.item, 1) === 0) this.secure.remove(req.item, 1)
      st.paid = true
    }
    if (req?.money && !st.paid) {
      if (this.company.profile.money < req.money) { this.say(`${req.money} $ Bestechung nötig`, 2.5); this.sfx("ui_error"); return }
      this.company.profile.money -= req.money; st.paid = true
    }
    if (e.kind === "gate" || e.kind === "tunnel" || e.kind === "vehicle") { this.extract(e); return }
    st.called = true; st.progress = 0; this.activeExit = e
    this.world.setExtraction(e.id, "called", 0)
    this.sfx("extract_call")
    this.say(e.kind === "boat" ? "Boot startet · Halten Sie den Anleger!" : "Hubschrauber angefordert · Halten Sie die Zone!", 4)
    // the noise draws everything nearby
    this.noise({ x: e.x, y: 1, z: e.z }, 90)
    this.infected?.spawnHorde({ x: e.x, z: e.z }, 6 + Math.floor(this.rng() * 6), { x: e.x, z: e.z })
    if (this.mercs && this.rng() < 0.5) this.mercs.spawnReinforcements(["rifleman", "scout"], { x: e.x, z: e.z })
    if (!this.company.profile.tutorialDone) this.showHint("hold", "Bleiben Sie im Kreis, bis die Evakuierung eintrifft. Verlassen pausiert sie.", 8)
  }

  private updateExtraction(dt: number): void {
    const e = this.activeExit; if (!e) return
    const st = this.exitState.get(e.id)!
    const inZone = Math.hypot(this.player.pos.x - e.x, this.player.pos.z - e.z) < e.radius + 0.5
    const total = e.holdTime * (this.company.has("logistics") ? 0.6 : 1)
    if (inZone) {
      const before = st.progress
      st.progress = Math.min(1, st.progress + dt / total)
      if (Math.floor(before * total) !== Math.floor(st.progress * total)) this.sfx("extract_tick", { volume: 0.6 })
      if (before < 0.5 && st.progress >= 0.5 && e.kind === "heli") this.sfx("helicopter", { position: { x: e.x, y: 12, z: e.z } })
    } else if (this.time % 2 < dt) this.say("Zurück in die Extraktionszone!", 1.5)
    this.world.setExtraction(e.id, "called", st.progress)
    if (st.progress >= 1) this.extract(e)
  }

  private extract(e: ExtractionDef): void {
    this.extracted = true
    this.world.setExtraction(e.id, "done", 1)
    this.finishRaid(true, `Extraktion ${e.name} erfolgreich`)
  }

  // ───────────────────────────── events: airdrop, boss, areas ─────────────────────────────

  private updateAirdrop(dt: number): void {
    const a = this.airdrop; if (!a || !a.spot) return
    if (!a.landed && a.fall === 0 && this.elapsed >= a.at) {
      a.fall = 1
      this.sfx("airdrop_plane"); this.say(`Versorgungsabwurf über ${this.world.districtAt(a.spot.x, a.spot.z)?.name ?? "der Sperrzone"}!`, 5)
      const g = new THREE.Group()
      const crate = new THREE.Mesh(_dropGeo, _dropMat); crate.castShadow = true; g.add(crate)
      const chute = new THREE.Mesh(_chuteGeo, _chuteMat); chute.position.y = 3.2; g.add(chute)
      g.position.set(a.spot.x, 80, a.spot.z); this.world.group.add(g); a.mesh = g
    }
    if (a.mesh && !a.landed) {
      a.mesh.position.y = Math.max(0.45, a.mesh.position.y - dt * 6)
      a.mesh.rotation.y += dt * 0.3
      if (a.mesh.position.y <= 0.45) {
        a.landed = true; a.mesh.children[1].visible = false
        a.loot = { position: new THREE.Vector3(a.spot.x, 0, a.spot.z), items: rollAirdrop(this.rng), name: "Versorgungsabwurf", kind: "airdrop", searched: false, mesh: null }
        this.ground.push(a.loot)
        this.sfx("airdrop_land", { position: a.mesh.position }); this.noise(a.mesh.position, 80)
        this.infected?.spawnHorde(a.spot, 8, a.spot)
      }
    }
    if (a.landed && a.mesh) this.effects.flareSmoke({ x: a.spot.x + 0.8, y: 0, z: a.spot.z }, dt)
  }

  private updateBoss(): void {
    if (this.bossSpawned || !this.infected) return
    const arena = (this.world.layout as ZoneLayout).bossArena
    if (Math.hypot(this.player.pos.x - arena.x, this.player.pos.z - arena.z) < arena.radius + 45) {
      this.bossSpawned = true
      this.infected.spawn("boss", arena.x, arena.z, { state: "idle" })
      this.say("Etwas Riesiges bewegt sich im Labor …", 4)
    }
  }

  private updateArea(): void {
    const d = this.world.districtAt(this.player.pos.x, this.player.pos.z)
    const id = d?.id ?? ""
    if (id && id !== this.lastArea) {
      this.lastArea = id
      if (!this.stats.visited.includes(id)) { this.stats.visited.push(id); this.say(`${d!.name} · Gefahrenstufe ${"▲".repeat(d!.danger)}`, 2.5) }
    }
  }

  // ───────────────────────────── base defence ─────────────────────────────

  private updateDefense(dt: number): void {
    const d = this.defense; if (!d || !this.infected) return
    const layout = this.world.layout as BaseLayout
    const alive = this.infected.aliveCount()
    if (d.wave < d.waves && alive === 0) {
      d.nextWave -= dt
      if (d.nextWave <= 0) {
        d.wave++
        const count = Math.round((6 + d.wave * 5) * (0.6 + this.company.profile.base.threat / 100))
        for (const s of layout.attackSpawns) this.infected.spawnHorde(s, Math.ceil(count / layout.attackSpawns.length), layout.gate)
        if (d.wave === d.waves) this.infected.spawn("brute", layout.attackSpawns[0].x, layout.attackSpawns[0].z, { state: "hunt", target: layout.gate })
        this.sfx("wave_start"); this.say(`Welle ${d.wave} von ${d.waves}!`, 3)
        d.nextWave = 15
      }
    } else if (d.wave >= d.waves && alive === 0) { this.finishDefense(true); return }
    // tower guards shoot the nearest infected
    this.guardClock -= dt
    const guards = Math.min(this.company.profile.staff.tower, this.company.level("tower") * 2)
    if (guards > 0 && this.guardClock <= 0) {
      this.guardClock = 1.4 / guards
      const tower = layout.plots.find(p => p.structure === "tower")
      if (tower) {
        const from = new THREE.Vector3(tower.x, 5, tower.z)
        const targets = this.infected.inRadius(from, 45)
        const t = targets.sort((a, b) => a.position.distanceToSquared(from) - b.position.distanceToSquared(from))[0]
        if (t) {
          const to = t.chestPosition(new THREE.Vector3())
          this.effects.tracer(from, to); this.sfx("shot_mk4", { position: from, volume: 0.6 } as never)
          const head = this.rng() < 0.2
          if (head) t.headPosition(to)
          this.infected.applyDamage({ target: t, distance: from.distanceTo(to), part: head ? "head" : "body", bodyPart: head ? "head" : "torso", point: to }, { amount: 30 + this.company.level("tower") * 8, from, dir: to.clone().sub(from).normalize(), penetration: 0.3, kind: "bullet", sever: 0.1 })
        }
      }
    }
  }

  private finishDefense(won: boolean): void {
    if (!this.defense || !this.kit) { this.mode = "ended"; return }
    const kills = this.stats.kills
    // ammo and meds used in the fight come out of the packed backpack; damaged armour stays damaged
    const lo = this.company.profile.loadout
    lo.bag = this.bag.toJSON()
    for (const slot of ["primary", "secondary"] as WeaponSlot[]) { const w = this.weapons[slot]; if (w?.ammo && w.mag > 0) { const b = new Bag(BACKPACKS[lo.backpack].slots, lo.bag); const added = b.add(w.ammo, w.mag); lo.bag = b.toJSON(); if (added < w.mag) this.company.addItem(w.ammo, w.mag - added) } }
    lo.armor = Math.min(lo.armor, Math.max(0, Math.round(this.player.armor))); if (lo.armor <= 0) lo.armorMax = 0
    lo.helmet = Math.max(0, Math.round(this.player.helmet))
    this.defense = null; this.kit = null
    this.mode = "ended"; this.input.capture = false; this.overlay = false; this.viewModel.visible = false
    if (document.pointerLockElement) document.exitPointerLock()
    this.audio.setIntensity(0); this.audio.setHeartbeat(0)
    this.sfx(won ? "win" : "lose")
    this.callbacks.onDefenseEnd(won, kills)
  }

  // ───────────────────────────── finish ─────────────────────────────

  private finishRaid(success: boolean, reason: string): void {
    if (this.mode === "ended" || this.mode === "menu" || !this.kit || this.defense) return
    this.mode = "ended"; this.paused = false; this.overlay = false; this.input.capture = false; this.viewModel.visible = false
    if (document.pointerLockElement) document.exitPointerLock()
    // an item being used or thrown when the raid ends goes back into the bag
    if (this.useItem && this.useKind === "throw" && this.useTime < 0.45) this.bag.add(this.useItem, 1)
    this.useTime = -1; this.useItem = null
    const loaded: Partial<Record<AmmoId, number>> = {}
    for (const slot of ["primary", "secondary"] as WeaponSlot[]) { const w = this.weapons[slot]; if (w?.ammo && w.mag > 0) loaded[w.ammo] = (loaded[w.ammo] ?? 0) + w.mag }
    const kitBag = this.kit
    const settlement = this.company.finishRaid(kitBag, { armor: this.player.armor, helmet: this.player.helmet, bag: this.bag.toJSON(), secure: this.secure.toJSON(), loaded, infection: this.player.vitals.infection }, this.stats, success, this.settings.difficulty, this.rng)
    this.kit = null
    this.audio.play(success ? "win" : "lose"); this.audio.setIntensity(0); this.audio.setHeartbeat(0)
    if (settlement.levelUp) window.setTimeout(() => this.sfx("level_up"), 700)
    const result: RaidResult = {
      success, reason, insertion: (this.world.layout.kind === "zone" ? (this.world.layout as ZoneLayout).insertions.find(i => i.id === this.plan?.insertion)?.name : undefined) ?? this.plan?.insertion ?? "", time: this.plan?.time ?? "dusk",
      kills: this.stats.kills, infectedKills: this.stats.infectedKills, mercKills: this.stats.mercKills, headshots: this.stats.headshots, dismembered: this.stats.dismembered,
      loot: settlement.returned.map(s => ({ id: s.id, qty: s.qty })), lost: settlement.lost.map(s => ({ id: s.id, qty: s.qty })), value: settlement.value,
      duration: this.elapsed, xp: settlement.xp, levelUp: settlement.levelUp, contractUpdates: settlement.contractUpdates,
    }
    this.callbacks.onEnd(result)
  }

  // ───────────────────────────── hints & helpers ─────────────────────────────

  private noise(pos: Vec3, radius: number): void { for (const h of this.hostiles) h.hearNoise(pos, radius) }
  private sfx(id: string, opts: { position?: Vec3; volume?: number; rate?: number } = {}): void { this.audio.play(id as SfxId, opts) }
  private key(k: string): string { return this.input.device === "pad" ? PAD_LABEL[k] ?? k : k }
  private say(text: string, seconds: number): void { this.message = text; this.messageTime = seconds }
  private showHint(key: string, text: string, seconds: number): void { if (this.hintsShown.has(key)) return; this.hintsShown.add(key); this.hint = text; this.hintTime = seconds }
  private updateHints(): void {
    if (this.company.profile.tutorialDone || this.mode !== "raid") return
    if (this.elapsed > 10 && !this.hintsShown.has("crate")) this.showHint("crate", `Rauten auf dem Kompass zeigen Behälter · ${this.key("E")} gedrückt halten zum Durchsuchen`, 8)
    if (this.elapsed > 60 && !this.hintsShown.has("exfil")) this.showHint("exfil", `Pfeile auf dem Kompass zeigen offene Extraktionen · ${this.key("M")} öffnet die Karte`, 8)
    if (this.player.vitals.water < 40 && !this.hintsShown.has("thirst")) this.showHint("thirst", "Durst! Trinken Sie im Rucksack (Tab) Wasser oder einen Energydrink.", 7)
  }
  private crateRange(): number { return this.company.has("recon") ? 45 : 18 }

  // ───────────────────────────── render ─────────────────────────────

  private render(alpha: number): void {
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastRender) / 1000); this.lastRender = now
    this.fpsFrames++
    if (this.fpsTime >= 1) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0 }
    const cam = this.camera, p = this.player
    if (this.mode === "menu" || (this.mode === "ended" && !this.kit)) {
      const b = this.world.layout.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.55
      const t = performance.now() / 1000 * 0.035
      cam.position.set(cx + Math.sin(t) * r, 26 + Math.sin(t * 2) * 3, cz + Math.cos(t) * r); cam.lookAt(cx, 2, cz)
      cam.fov = 60; cam.updateProjectionMatrix(); this.flashlight.intensity = 0
    } else {
      // mouse look per rendered frame (smooth above 60 Hz)
      if (!this.paused && !this.overlay && (this.mode === "base" || this.mode === "raid" || this.mode === "defense")) {
        const look = this.input.consumeLook(), w = this.weapon
        const zoomed = w.def.adsZoom < 0.6 || w.def.scoped
        const scale = 1 - this.ads * (1 - this.settings.adsSensitivity * (zoomed ? Math.max(0.3, w.def.adsZoom * 1.4) : 1))
        p.look(look.yaw * scale, look.pitch * scale)
        this.lookFrame.yaw += look.yaw * scale; this.lookFrame.pitch += look.pitch * scale
      }
      p.punch.multiplyScalar(Math.max(0, 1 - dt * 9))
      const moving = p.speed
      const bob = (this.mode === "raid" || this.mode === "base" || this.mode === "defense") && !this.paused ? Math.sin(this.time * (p.sprinting ? 13 : 9)) * 0.03 * Math.min(1.5, moving / WALK) * (1 - this.ads * 0.8) : 0
      const sh = this.shake * this.shake
      const shakeX = sh ? (Math.random() - 0.5) * sh * 0.06 : 0, shakeY = sh ? (Math.random() - 0.5) * sh * 0.06 : 0
      p.renderEye(alpha, _eye)
      let roll = 0
      if (this.mode === "dying") { const k = Math.min(1, this.deathTime / 0.9); _eye.y = p.eye - (p.eye - 0.3) * k * k; roll = this.dyingRoll * k * 1.1 }
      cam.position.set(_eye.x, _eye.y + bob, _eye.z)
      cam.rotation.set(p.pitch + p.punch.x + shakeY, p.yaw + p.punch.y + shakeX, roll)
      const w = this.weapon
      const zoom = 1 + (w.def.adsZoom - 1) * this.ads
      const targetFov = this.settings.fov * zoom * (p.sprinting ? 1.05 : 1)
      if (Math.abs(cam.fov - targetFov) > 0.01) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix() }
      this.flashlight.intensity = this.flashlightOn && this.isControlled ? 26 : 0
      if (this.viewModel.visible) this.viewModel.update(dt, {
        weapon: w.id, mods: w.mods, ads: this.ads, move: moving / WALK, sprinting: p.sprinting, crouched: p.crouched,
        lookYaw: this.lookFrame.yaw, lookPitch: this.lookFrame.pitch,
        reload: w.reloading ? 1 - w.reloadLeft / w.reloadTotal : -1, singleLoad: w.def.singleLoad, empty: !w.isMelee && w.mag === 0,
        switching: this.switchTime, using: this.useTime, usingKind: this.useKind,
        melee: this.meleeTime, meleeQuick: this.meleeQuick,
        light: this.world.lightLevel, flashlight: this.flashlightOn, laser: w.mods.tactical === "att_laser" && !p.sprinting,
      } as never)
      this.lookFrame.yaw = 0; this.lookFrame.pitch = 0
      this.audio.setListener(cam.position, p.yaw)
    }
    this.world.update(dt, this.time, cam)
    this.renderer.info.reset()
    this.renderer.clear()
    this.renderer.render(this.scene, cam)
    if (this.viewModel.visible && (this.mode === "raid" || this.mode === "defense")) this.viewModel.render(this.renderer)
    window.__GAME_READY__ = true
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private pushHud(): void {
    const p = this.player, w = this.weapon, v = p.vitals
    const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360
    const markers: CompassMarker[] = []
    const add = (kind: CompassMarker["kind"], x: number, z: number, label?: string) => { const dx = x - p.pos.x, dz = z - p.pos.z; markers.push({ kind, bearing: wrapDegrees(headingOf(dx, dz) - heading), distance: Math.hypot(dx, dz), label }) }
    let objective = "", progress = "", area = ""
    if (this.mode === "raid") {
      for (const e of this.openExits) if (!this.activeExit || this.activeExit === e) add("extract", e.x, e.z, e.name)
      const range = this.crateRange()
      if (this.containers) for (const c of this.containers.list) if (!c.searched && Math.abs(c.position.x - p.pos.x) < range && Math.abs(c.position.z - p.pos.z) < range && c.position.distanceTo(p.pos) < range) add("crate", c.position.x, c.position.z)
      for (const g of this.ground) if (g.items.length && g.position.distanceTo(p.pos) < (g.kind === "airdrop" ? 1000 : 14)) add(g.kind === "airdrop" ? "drop" : "body", g.position.x, g.position.z)
      if (this.airdrop?.mesh && !this.airdrop.landed) add("drop", this.airdrop.spot!.x, this.airdrop.spot!.z)
      const layout = this.world.layout as ZoneLayout
      for (const c of this.company.profile.contracts.active) if (c.kind === "activate" && c.subject && !this.stats.activated.includes(c.subject)) { const o = layout.objectives.find(x => x.id === c.subject); if (o) add("objective", o.x, o.z, o.name) }
      const st = this.activeExit ? this.exitState.get(this.activeExit.id) : null
      objective = this.activeExit ? `${this.activeExit.name} halten` : "Beute sichern und extrahieren"
      progress = st ? `EVAKUIERUNG ${Math.round(st.progress * 100)} %` : `${this.openExits.length} Extraktionen offen`
      area = this.world.districtAt(p.pos.x, p.pos.z)?.name ?? "Sperrzone"
    } else if (this.mode === "defense" && this.defense) {
      objective = "Basis verteidigen"; progress = `WELLE ${Math.max(1, this.defense.wave)} / ${this.defense.waves} · ${this.infected?.aliveCount() ?? 0} Infizierte`; area = "Basis"
    } else { objective = "Basis"; progress = ""; area = "Basis" }
    const contract = this.company.profile.contracts.active.map(c => `${c.title}: ${c.kind === "fetch" ? `${c.progress}/${c.target}` : c.kind === "recon" ? (this.stats.visited.includes(c.subject ?? "") ? "✓ erkundet" : c.subjectName) : c.kind === "activate" ? (this.stats.activated.includes(c.subject ?? "") ? "✓ aktiviert" : c.subjectName) : `${Math.min(c.target, c.progress + this.contractRaidProgress(c.kind, c.subject))}/${c.target}`}`).join("\n")
    const quickMeds = this.bag.count("bandage") + this.bag.count("medkit")
    const other: ThrowableKind = this.throwKind === "grenade" ? "molotov" : "grenade"
    const throwable = this.bag.count(this.throwKind) > 0 || this.bag.count(other) === 0 ? this.throwKind : other
    const fight = this.mode === "raid" || this.mode === "defense"
    this.callbacks.onHud({
      health: Math.max(0, Math.ceil(v.health)), armor: Math.max(0, Math.ceil(p.armor)), armorMax: Math.max(p.armorMax, Math.ceil(p.armor)), helmet: Math.ceil(p.helmet),
      stamina: p.stamina, energy: v.energy, water: v.water, bleed: v.bleed, infection: v.infection, painkiller: v.painkiller, boost: v.boost,
      weight: this.load() * this.weightLimit(), weightLimit: this.weightLimit(),
      ammo: w.isMelee ? 0 : w.mag, reserve: w.isMelee ? 0 : w.reserve(this.ammoSource), ammoName: w.ammo ? AMMO[w.ammo].short : "", weaponName: w.def.name,
      fireMode: w.isMelee ? "NAHKAMPF" : w.def.auto ? "AUTO" : w.def.manualAction ? (w.def.cls === "shotgun" ? "PUMP" : "REPETIER") : "EINZEL", melee: w.isMelee,
      quickMeds, grenades: this.bag.count(throwable), throwableName: throwable === "grenade" ? "Granate" : "Brandflasche",
      reloading: w.reloadLeft, reloadTotal: w.reloadTotal,
      objective, objectiveProgress: progress, contract, lootValue: this.bag.value(id => ITEMS[id].cat === "valuable" ? ITEMS[id].value : 0),
      raidTime: Math.max(0, this.timeLeft), clock: this.plan ? TIMES[this.plan.time].clock : "", area,
      extraction: this.activeExit ? this.exitState.get(this.activeExit.id)!.progress : 0, extractionName: this.activeExit?.name ?? "",
      interaction: this.interactText, interactionProgress: this.interactHold,
      enemies: this.hostiles.reduce((n, h) => n + h.combatCount(), 0), hitMarker: this.hitMarker, killMarker: this.killMarker, damageFlash: this.damageFlash,
      damageDirections: this.damageDirs.map(d => ({ angle: wrapDegrees(d.heading - heading), life: d.life })),
      compass: heading, markers, spread: w.isMelee ? 0.004 : w.spread(this.ads, p.speed / WALK, p.crouched) / (this.camera.fov * Math.PI / 180) * 2,
      crouched: p.crouched, ads: this.ads > 0.6, scoped: this.viewModel.isScoped && this.ads > 0.92, dead: this.mode === "dying", device: this.input.device,
      message: this.message, messageTime: this.messageTime, hint: this.hintTime > 0 ? this.hint : "", fps: this.fps, safe: !fight,
    })
  }

  private contractRaidProgress(kind: string, subject?: string): number {
    if (kind === "killInfected") return this.stats.infectedKills
    if (kind === "killMerc") return this.stats.mercKills
    if (kind === "killKind" && subject) return this.stats.killsByKind[subject] ?? 0
    if (kind === "boss") return this.stats.bossKilled ? 1 : 0
    return 0
  }

  // ───────────────────────────── map & debug API ─────────────────────────────

  /** Data for the tactical map overlay. */
  mapData() {
    const zone = this.world.layout.kind === "zone" ? this.world.layout as ZoneLayout : null
    return {
      bounds: this.world.layout.bounds, obstacles: this.world.obstacles, player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw },
      districts: zone?.districts ?? [], labels: zone?.labels ?? [],
      exits: this.openExits.map(e => ({ x: e.x, z: e.z, r: e.radius, name: e.name, kind: e.kind, requirement: e.requirement })),
      objectives: zone ? zone.objectives.filter(o => this.company.profile.contracts.active.some(c => c.subject === o.id)).map(o => ({ x: o.x, z: o.z, name: o.name, done: this.stats.activated.includes(o.id) })) : [],
      drop: this.airdrop?.mesh ? { x: this.airdrop.spot!.x, z: this.airdrop.spot!.z } : null,
      crates: this.containers ? this.containers.list.filter(c => !c.searched && c.position.distanceTo(this.player.pos) < this.crateRange()).map(c => ({ x: c.position.x, z: c.position.z })) : [],
    }
  }

  /** Raid backpack state for the inventory screen. */
  raidStatus() {
    return { bag: this.bag, secure: this.secure, weightKg: this.load() * this.weightLimit(), weightLimit: this.weightLimit(), vitals: this.player.vitals, armor: this.player.armor, helmet: this.player.helmet, mode: this.mode, weapons: (["primary", "secondary", "melee"] as WeaponSlot[]).map(s => this.weapons[s] ? { slot: s, name: this.weapons[s]!.def.name, mag: this.weapons[s]!.mag, ammo: this.weapons[s]!.ammo } : null).filter(Boolean) }
  }

  getSnapshot(): GameSnapshot {
    return {
      screen: "playing", mode: this.mode, player: { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z }, yaw: this.player.yaw, pitch: this.player.pitch,
      health: this.player.health, armor: this.player.armor, stamina: this.player.stamina, crouched: this.player.crouched,
      weapon: this.weapon.id, ammo: this.weapon.mag, reserve: this.weapon.reserve(this.ammoSource),
      enemiesAlive: this.mercs?.aliveCount() ?? 0, infectedAlive: this.infected?.aliveCount() ?? 0,
      lootCollected: this.containers?.list.filter(c => c.searched).length ?? 0, extractionProgress: this.activeExit ? this.exitState.get(this.activeExit.id)!.progress : 0,
      fps: this.fps, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
    }
  }

  debug = {
    teleport: (x: number, z: number) => { this.player.pos.set(x, 0, z); const p = { x, z }; this.world.collision.depenetrate(p, RADIUS); this.player.pos.x = p.x; this.player.pos.z = p.z; this.player.prevPos.copy(this.player.pos) },
    damage: (amount: number) => { this.player.health = Math.max(0, this.player.health - amount); this.damageFlash = 0.3 },
    aimAt: (x: number, y: number, z: number) => { const dx = x - this.player.pos.x, dy = y - this.player.eye, dz = z - this.player.pos.z; this.player.yaw = Math.atan2(-dx, -dz); this.player.pitch = Math.atan2(dy, Math.hypot(dx, dz)); this.player.punch.set(0, 0) },
    nearestHostile: (faction?: "merc" | "infected") => {
      let best: Hostile | null = null, bd = Infinity
      for (const h of this.hostiles) if (!faction || h.faction === faction) for (const t of ((h as unknown as { enemies?: Hostile[]; list?: Hostile[] }).enemies ?? (h as unknown as { list?: Hostile[] }).list ?? [])) if (t.alive) { const d = t.position.distanceTo(this.player.pos); if (d < bd) { bd = d; best = t } }
      return best
    },
    spawnInfected: (kind: InfectedKind, distance: number) => { const p = this.player; return this.infected?.spawn(kind, p.pos.x - Math.sin(p.yaw) * distance, p.pos.z - Math.cos(p.yaw) * distance, { state: "hunt" }) ?? null },
    spawnMerc: (kind: EnemyKind, distance: number) => { const p = this.player; this.mercs?.spawnSquad([kind], p.pos.x - Math.sin(p.yaw) * distance, p.pos.z - Math.cos(p.yaw) * distance, []) },
    setGodMode: (on: boolean) => { this.godMode = on },
    containers: () => this.containers?.list.filter(c => !c.searched).map(c => ({ x: c.position.x, z: c.position.z, kind: c.kind })) ?? [],
    exits: () => this.openExits.map(e => ({ id: e.id, x: e.x, z: e.z, r: e.radius, kind: e.kind, requirement: e.requirement })),
    lookAt: (x: number, z: number, y = 0.4) => { const dx = x - this.player.pos.x, dz = z - this.player.pos.z; this.player.yaw = Math.atan2(-dx, -dz); this.player.pitch = Math.atan2(y - this.player.eye, Math.hypot(dx, dz)) },
    give: (id: ItemId, qty: number) => this.bag.add(id, qty),
    vitals: () => ({ ...this.player.vitals }),
    weapon: () => ({ id: this.weapon.id, mag: this.weapon.mag, reserve: this.weapon.reserve(this.ammoSource), reloading: this.weapon.reloading, ammo: this.weapon.ammo }),
    defense: () => this.defense ? { ...this.defense, alive: this.infected?.aliveCount() ?? 0 } : null,
    /** Screen blood as from a close kill (respects the gore setting). */
    splatter: (amount: number) => { if (this.settings.gore !== "off") this.screenBlood?.(amount) },
    killAllInfected: () => { if (!this.infected) return; for (const t of this.infected.inRadius(this.player.pos, 1e4)) this.infected.applyDamage({ target: t, distance: 1, part: "body", bodyPart: "torso", point: t.chestPosition(new THREE.Vector3()) }, { amount: 1e5, from: this.player.pos, dir: _upWorld, penetration: 1, kind: "bullet", sever: 0 }) },
  }

  applySettings(settings: Settings): void {
    this.settings = settings
    this.input.sensitivity = settings.sensitivity; this.input.invertY = settings.invertY
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === "high" ? 1.75 : 1))
    this.renderer.shadowMap.enabled = settings.quality === "high"
    if (this.gore) this.gore.level = settings.gore
    if (settings.quality !== this.quality) {
      this.quality = settings.quality
      // shadows need a rebuilt world (materials compile with or without shadow maps)
      if (this.mode === "menu") { this.worldKey = ""; this.showMenu() }
    }
    this.resize()
  }

  dispose(): void {
    this.loop.stop(); this.pause()
    window.removeEventListener("resize", this.onResize); document.removeEventListener("pointerlockchange", this.onPointerLock)
    this.renderer.domElement.removeEventListener("click", this.onCanvasClick)
    this.input.dispose(); this.clearDynamic(); this.effects.dispose(); this.gore.dispose(); this.world.dispose()
    this.viewModel.dispose(); this.renderer.dispose()
  }
}

function emptyRaidStats(): RaidStats { return { kills: 0, infectedKills: 0, mercKills: 0, headshots: 0, dismembered: 0, killsByKind: {}, visited: [], activated: [], bossKilled: false } }
function sameTarget(a: Interactable | null, b: Interactable | null): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case "container": return a.ref === (b as typeof a).ref
    case "ground": return a.loot === (b as typeof a).loot
    case "extract": return a.ex === (b as typeof a).ex
    case "objective": return a.obj === (b as typeof a).obj
    case "station": return a.id === (b as typeof a).id
    case "plot": return a.structure === (b as typeof a).structure
  }
}
/** Distance from p to segment ab; writes the closest point into out. */
function closestOnSegment(a: Vec3, b: Vec3, p: Vec3, out: THREE.Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
  const len2 = abx * abx + aby * aby + abz * abz || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2))
  out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t)
  return Math.hypot(out.x - p.x, out.y - p.y, out.z - p.z)
}

const NO_INPUT = { moveX: 0, moveZ: 0, sprintHeld: false, adsHeld: false, fireHeld: false }
const _ps: PlayerState = { position: new THREE.Vector3(), eyeY: 1.62, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: false }
const _aim = { fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }
const _origin = new THREE.Vector3(), _dir = new THREE.Vector3(), _end = new THREE.Vector3(), _muzzle = new THREE.Vector3(), _head = new THREE.Vector3(), _tmp = new THREE.Vector3(), _eye = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _cone = { x: 0, y: 0 }
const _upWorld = { x: 0, y: 1, z: 0 }
const _bagGeo = new THREE.CapsuleGeometry(0.2, 0.55, 4, 8)
const _bagMat = new THREE.MeshStandardMaterial({ color: 0x3f4a35, roughness: 0.95 })
const _dropGeo = new THREE.BoxGeometry(1.2, 0.9, 1.2)
const _dropMat = new THREE.MeshStandardMaterial({ color: 0x4b5a3a, roughness: 0.7 })
const _chuteGeo = new THREE.SphereGeometry(2.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)
const _chuteMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.9, side: THREE.DoubleSide })
