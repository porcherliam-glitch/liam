/**
 * raid.ts — the 3D game: renderer, menu attract mode and the raid itself (player movement, weapons, interaction,
 * extraction, contracts, damage, death) wiring world.ts, enemies.ts, effects.ts, grenades.ts, loot.ts, viewmodel.ts
 * and audio.ts together. Logic runs at a fixed 60 Hz (engine.ts); rendering interpolates camera effects per frame.
 */
import * as THREE from "three"
import { AudioSystem, stepSound } from "./audio"
import { depenetrate, moveCircle, raycastObstacles, segmentBlocked3D } from "./collision"
import { CONTRACTS, ENEMIES, ITEMS, MAX_GRENADES, MAX_MEDKITS, MISSIONS, THEMES, WEAPONS } from "./data"
import { Effects, type ImpactKind } from "./effects"
import { Enemy, EnemyManager, type EnemyShot, type HitPart, type PlayerState } from "./enemies"
import { GameLoop } from "./engine"
import { GRENADE_DAMAGE, GRENADE_RADIUS, GrenadeSystem } from "./grenades"
import { Input } from "./input"
import { BodyLoot, Crate, rollBody, rollCrate } from "./loot"
import type { Company, RaidKit } from "./profile"
import type { CompassMarker, ContractId, ContractState, GameSnapshot, HudSnapshot, ItemId, LootStack, MissionId, RaidResult, Settings, Vec3, WeaponId } from "./types"
import { ViewModel } from "./viewmodel"
import { WeaponRuntime, coneOffset, damageAt } from "./weapons"
import { createWorld, type World } from "./world"
import type { ExtractionPoint } from "./maps"

export interface RaidCallbacks {
  onHud: (hud: HudSnapshot) => void
  onEnd: (result: RaidResult) => void
  onPause: () => void
  onInventory: () => void
  onMap: () => void
}

type Mode = "attract" | "raid" | "dying" | "ended"
type Interactable = { kind: "crate"; crate: Crate } | { kind: "body"; body: BodyLoot }

const EYE_STAND = 1.62, EYE_CROUCH = 1.05, RADIUS = 0.38
const WALK = 4.5, SPRINT = 7.0, CROUCH_SPEED = 2.4
const LIGHT_LEVEL = { dusk: 0.85, harbor: 0.6, night: 0.22 } as const
const PAD_LABEL: Record<string, string> = { E: "Ⓐ", Q: "RB", G: "LB", R: "Ⓧ", F: "Steuerkreuz ↑", M: "Steuerkreuz ↓", C: "Ⓑ" }

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

/** Compass heading in degrees (0 = north = -Z, clockwise) of a direction. */
export function headingOf(dx: number, dz: number): number { return ((Math.atan2(dx, -dz) * 180 / Math.PI) % 360 + 360) % 360 }
export function wrapDegrees(a: number): number { return ((a + 540) % 360) - 180 }

/** Picks a side contract that fits the mission roster. */
export function pickContract(mission: MissionId, rng: () => number): ContractId {
  const roster = MISSIONS[mission].roster
  const options = (Object.keys(CONTRACTS) as ContractId[]).filter(id => !CONTRACTS[id].requires || roster.includes(CONTRACTS[id].requires!))
  return options[Math.floor(rng() * options.length)]
}

export class RaidGame {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600)
  readonly input: Input
  readonly viewModel = new ViewModel()
  world!: World
  private enemies!: EnemyManager
  private effects!: Effects
  private grenades!: GrenadeSystem
  private crates: Crate[] = []
  private bodies: BodyLoot[] = []
  private loop: GameLoop
  private flashlight = new THREE.SpotLight(0xfff2dc, 0, 38, 0.42, 0.55, 1.6)
  private mode: Mode = "attract"
  private paused = false
  private mission: MissionId = "greyzone"
  private worldMission: MissionId | null = null
  private rng = mulberry32(1)
  private kit: RaidKit | null = null
  private contract: ContractState | null = null
  // player
  private pos = new THREE.Vector3()
  private vel = new THREE.Vector2()
  private yaw = 0
  private pitch = 0
  private punch = new THREE.Vector2()
  private health = 100
  private armor = 0
  private armorMax = 0
  private stamina = 100
  private staminaDelay = 0
  private exhausted = false
  private crouched = false
  private eye = EYE_STAND
  private ads = 0
  private flashlightOn = false
  private sprinting = false
  private sprintBlock = 0
  private stepDistance = 0
  private primary!: WeaponRuntime
  private sidearm!: WeaponRuntime
  private active: "primary" | "sidearm" = "primary"
  private switchTime = -1
  private pendingWeapon: "primary" | "sidearm" | null = null
  private medkits = 0
  private grenadeCount = 0
  private healTime = -1
  private throwTime = -1
  private pumpTimer = 0
  private godMode = false
  // raid
  private timeLeft = 0
  private elapsed = 0
  private kills = 0
  private headshots = 0
  private collected = 0
  private raidLoot: Partial<Record<ItemId, number>> = {}
  private extraction!: ExtractionPoint
  private extractCalled = false
  private extractProgress = 0
  private extractDone = false
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
  private time = 0
  private lastRender = performance.now()
  private lookFrame = { yaw: 0, pitch: 0 }
  private hadPointerLock = false
  private fps = 60
  private fpsFrames = 0
  private fpsTime = 0
  private onResize = () => this.resize()
  private onPointerLock = () => {
    if (document.pointerLockElement === this.renderer.domElement) { this.hadPointerLock = true; return }
    this.input.fireHeld = false; this.input.adsHeld = false
    if (this.hadPointerLock && this.mode === "raid" && !this.paused) { this.pause(); this.callbacks.onPause() }
  }

  /** Clicking the 3D view during a raid re-captures the mouse (e.g. after the browser refused the first request). */
  private onCanvasClick = () => { if (this.mode === "raid" && !this.paused && document.pointerLockElement !== this.renderer.domElement) this.requestLock() }

  constructor(canvas: HTMLCanvasElement, private company: Company, private settings: Settings, private audio: AudioSystem, private callbacks: RaidCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.autoClear = false; this.renderer.info.autoReset = false
    this.viewModel.initEnvironment(this.renderer)
    this.input = new Input(canvas)
    this.camera.rotation.order = "YXZ"; this.scene.add(this.camera)
    this.flashlight.position.set(0.18, -0.12, 0.1); this.flashlight.target.position.set(0.05, -0.05, -5); this.camera.add(this.flashlight, this.flashlight.target)
    this.applySettings(settings)
    this.setMenuMission("greyzone")
    this.resize()
    window.addEventListener("resize", this.onResize); document.addEventListener("pointerlockchange", this.onPointerLock)
    canvas.addEventListener("click", this.onCanvasClick)
    this.loop = new GameLoop({ update: dt => this.update(dt), render: () => this.render() })
    this.loop.start()
  }

  // ───────────────────────────── setup ─────────────────────────────

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewModel.setAspect(w / h)
    this.renderer.setSize(w, h, false); this.effects?.setViewportHeight(h * this.renderer.getPixelRatio())
  }

  private buildWorld(id: MissionId): void {
    if (this.worldMission === id && this.world) { this.resetDynamic(); return }
    if (this.world) { this.enemies.dispose(); this.effects.dispose(); this.grenades.clear(); for (const c of this.crates) c.dispose(); this.world.dispose() }
    this.crates = []; this.bodies = []
    this.world = createWorld(id, this.scene, this.settings.quality)
    this.worldMission = id
    this.renderer.toneMappingExposure = this.world.exposure
    this.effects = new Effects(this.scene); this.effects.setViewportHeight(window.innerHeight * this.renderer.getPixelRatio())
    this.grenades = new GrenadeSystem(this.scene, { bounce: p => this.audio.play("grenade_bounce", { position: p }), explode: p => this.explode(p) })
    this.enemies = this.makeEnemies(id, MISSIONS[id].seed)
  }

  private makeEnemies(id: MissionId, seed: number): EnemyManager {
    return new EnemyManager(this.world.group, this.world, {
      difficulty: this.settings.difficulty, seed,
      events: {
        shoot: shot => this.onEnemyShot(shot),
        died: (enemy, cause, part) => this.onEnemyDied(enemy, cause, part),
        spotted: enemy => { if (this.mode === "raid") { this.audio.play("alert", { position: enemy.position, volume: 0.6 }) } },
        footstep: enemy => { if (this.mode === "raid" && enemy.position.distanceToSquared(this.pos) < 400) this.audio.play(stepSound(this.world.surfaceAt(enemy.position.x, enemy.position.z)), { position: enemy.position, volume: 0.7 }) },
      },
    })
  }

  /** Clears enemies/crates/effects but keeps the static world (same mission again). */
  private resetDynamic(): void {
    this.enemies.dispose(); this.effects.clear(); this.grenades.clear()
    for (const c of this.crates) c.dispose()
    this.crates = []; this.bodies = []
  }

  /** Shows a mission's world behind the menus (attract mode with patrolling enemies). */
  setMenuMission(id: MissionId): void {
    if (this.mode === "raid" || this.mode === "dying") return
    if (this.worldMission === id && this.mode === "attract") return
    this.mode = "attract"
    this.buildWorld(id)
    this.enemies = this.makeEnemies(id, MISSIONS[id].seed)
    this.enemies.spawn(MISSIONS[id].roster.slice(0, 5))
    this.viewModel.visible = false
    this.audio.setAmbience("menu"); this.audio.setIntensity(0); this.audio.setHeartbeat(0)
  }

  // ───────────────────────────── raid lifecycle ─────────────────────────────

  startMission(id: MissionId, contractId: ContractId | null): void {
    const seed = (Date.now() ^ (this.company.profile.stats.raids * 7919)) >>> 0
    this.rng = mulberry32(seed)
    this.mission = id
    const def = MISSIONS[id]
    this.buildWorld(id)
    this.enemies = this.makeEnemies(id, seed)
    this.enemies.spawn(def.roster)
    const layout = this.world.layout
    // crates on a random subset of spots; spot tier and mission tier combine
    const spots = shuffle([...layout.lootSpawns], this.rng).slice(0, def.crates)
    for (const s of spots) { const tier = Math.min(2, Math.round((s.tier + def.tier) / 1.5)); this.crates.push(new Crate(this.world.group, s.x, s.z, this.rng() * Math.PI, tier, rollCrate(tier, this.rng))) }
    this.extraction = layout.extractions[Math.floor(this.rng() * layout.extractions.length)]
    for (const e of layout.extractions) this.world.setExtraction(e.id, e.id === this.extraction.id ? "locked" : "hidden", 0)
    const spawn = layout.playerSpawns[Math.floor(this.rng() * layout.playerSpawns.length)]
    this.pos.set(spawn.x, 0, spawn.z); this.yaw = spawn.yaw; this.pitch = 0; this.vel.set(0, 0); this.punch.set(0, 0)
    // kit
    this.kit = this.company.beginRaid()
    const k = this.kit
    this.primary = new WeaponRuntime(k.primary, k.ammoPacks * WEAPONS[k.primary].roundsPerPack)
    // a fresh primary starts loaded only from carried ammo
    const startMag = Math.min(this.primary.def.magazine, this.primary.reserve); this.primary.mag = startMag; this.primary.reserve -= startMag
    this.sidearm = new WeaponRuntime("p9", 0)
    this.active = this.primary.total > 0 ? "primary" : "sidearm"
    this.viewModel.setWeapon(this.weapon.id)
    this.health = 100
    this.armorMax = k.armorMax; this.armor = k.armor + (k.armor > 0 && this.company.has("plating") ? 25 : 0)
    this.medkits = k.medkits; this.grenadeCount = k.grenades
    this.stamina = 100; this.exhausted = false; this.crouched = false; this.eye = EYE_STAND; this.ads = 0
    this.flashlightOn = false; this.healTime = -1; this.throwTime = -1; this.switchTime = -1; this.pendingWeapon = null
    this.timeLeft = def.time; this.elapsed = 0; this.kills = 0; this.headshots = 0; this.collected = 0; this.raidLoot = {}
    this.extractCalled = false; this.extractProgress = 0; this.extractDone = false
    this.interactTarget = null; this.interactHold = 0; this.damageDirs = []; this.hitMarker = this.killMarker = this.damageFlash = this.shake = 0
    this.contract = contractId ? { id: contractId, progress: 0, target: CONTRACTS[contractId].target, done: false, failed: false } : null
    this.hintsShown.clear(); this.hint = ""; this.hintTime = 0
    this.mode = "raid"; this.paused = false; this.hadPointerLock = false; this.deathTime = 0; this.dyingRoll = 0; this.godMode = false
    this.viewModel.visible = true
    this.input.capture = true; this.input.clearActions(); this.input.resetAll()
    this.say(`${def.name} · Bergen Sie ${def.lootRequired} Kisten`, 4)
    if (!this.company.profile.tutorialDone) this.showHint("move", "WASD bewegen · Maus umsehen · Shift sprinten · C ducken · Esc Pause", 8)
    else if (THEMES[def.theme].night) this.showHint("night", "Nachteinsatz: Taschenlampe mit F – aber Licht macht Sie sichtbar", 6)
    this.audio.setAmbience(def.theme)
    this.requestLock(); this.pushHud()
  }

  requestLock(): void {
    const el = this.renderer.domElement
    if (document.pointerLockElement === el) return
    try { const r = el.requestPointerLock() as unknown as Promise<void> | undefined; if (r && typeof r.catch === "function") r.catch(() => this.say("Zum Umsehen in das Spielfeld klicken", 3)) } catch { this.say("Zum Umsehen in das Spielfeld klicken", 3) }
  }
  resume(): void { if (this.mode !== "raid") return; this.paused = false; this.input.capture = true; this.input.clearActions(); this.requestLock() }
  pause(): void { if (this.mode !== "raid") return; this.paused = true; this.input.capture = false; this.input.resetAll(); if (document.pointerLockElement) document.exitPointerLock() }
  get isPaused(): boolean { return this.paused }
  returnToMenu(): void {
    if (this.mode === "raid" || this.mode === "dying") this.finish(false, "Einsatz abgebrochen")
    this.mode = "attract"; this.paused = false; this.input.capture = false; this.viewModel.visible = false; this.flashlight.intensity = 0
    if (document.pointerLockElement) document.exitPointerLock()
    const id = this.mission; this.worldMission = null; this.setMenuMission(id)
  }
  abort(): void { if (this.mode === "raid") this.finish(false, "Einsatz durch Operator abgebrochen – Ausrüstung zurückgelassen") }

  private get weapon(): WeaponRuntime { return this.active === "primary" ? this.primary : this.sidearm }

  // ───────────────────────────── update ─────────────────────────────

  private update(dt: number): void {
    this.time += dt
    this.fpsTime += dt
    if (this.mode === "attract") {
      this.input.consumeLook(); this.input.clearActions()
      this.enemies.update(dt, this.playerState(false))
      for (const c of this.crates) c.update(dt, this.time)
      this.effects.update(dt)
      return
    }
    if (this.mode === "ended") { this.input.consumeLook(); return }
    if (this.mode === "dying") {
      this.deathTime += dt; this.input.consumeLook()
      this.enemies.update(dt, this.playerState(true, false)); this.effects.update(dt)
      if (this.deathTime > 1.6) this.finish(false, "Operator im Einsatz gefallen")
      return
    }
    if (this.paused) { this.input.consumeLook(); return }
    this.input.poll(dt)

    this.elapsed += dt; this.timeLeft -= dt
    this.hitMarker = Math.max(0, this.hitMarker - dt); this.killMarker = Math.max(0, this.killMarker - dt)
    this.damageFlash = Math.max(0, this.damageFlash - dt); this.messageTime = Math.max(0, this.messageTime - dt); this.hintTime = Math.max(0, this.hintTime - dt)
    this.shake = Math.max(0, this.shake - dt * 2.5); this.sprintBlock = Math.max(0, this.sprintBlock - dt)
    for (let i = this.damageDirs.length - 1; i >= 0; i--) { this.damageDirs[i].life -= dt / 1.6; if (this.damageDirs[i].life <= 0) this.damageDirs.splice(i, 1) }

    const look = this.input.consumeLook()
    const lookScale = 1 - this.ads * (1 - this.settings.adsSensitivity) * (this.weapon.def.adsZoom < 0.6 ? 1.3 : 1)
    this.yaw += look.yaw * lookScale; this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch * lookScale, -1.45, 1.45)
    this.lookFrame.yaw += look.yaw * lookScale; this.lookFrame.pitch += look.pitch * lookScale

    if (this.input.consumeAction("Escape")) { this.pause(); this.callbacks.onPause(); return }
    if (this.input.consumeAction("Tab")) { this.pause(); this.callbacks.onInventory(); return }
    if (this.input.consumeAction("KeyM")) { this.pause(); this.callbacks.onMap(); return }
    if (this.input.consumeAction("KeyR")) this.reload()
    if (this.input.consumeAction("KeyQ")) this.startHeal()
    if (this.input.consumeAction("KeyG")) this.startThrow()
    if (this.input.consumeAction("KeyF")) { this.flashlightOn = !this.flashlightOn; this.audio.play("flashlight") }
    if (this.input.consumeAction("KeyC")) this.crouched = !this.crouched
    if (this.input.consumeAction("Digit1")) this.switchTo("primary")
    if (this.input.consumeAction("Digit2")) this.switchTo("sidearm")
    if (this.input.consumeAction("WheelUp") || this.input.consumeAction("WheelDown") || this.input.consumeAction("KeyX")) this.switchTo(this.active === "primary" ? "sidearm" : "primary")

    this.updateMovement(dt)
    this.updateWeapon(dt)
    this.updateInteraction(dt)
    this.updateExtraction(dt)
    this.enemies.update(dt, this.playerState(true))
    this.grenades.update(dt, this.world.obstacles)
    this.effects.update(dt, _camPos.set(this.pos.x, this.eye, this.pos.z))
    for (const c of this.crates) c.update(dt, this.time)
    if (this.extractCalled && !this.extractDone) this.effects.flareSmoke({ x: this.extraction.x + this.extraction.radius * 0.6, y: 0, z: this.extraction.z }, dt)
    this.updateContract()
    this.updateHints()
    this.audio.setIntensity(Math.min(1, this.enemies.combatCount() / 3))
    this.audio.setHeartbeat(this.health < 35 ? 1 - this.health / 35 : 0)

    if (this.health <= 0 && !this.godMode) { this.health = 0; this.mode = "dying"; this.deathTime = 0; this.dyingRoll = (this.rng() - 0.5) * 2; this.viewModel.visible = false; this.audio.play("lose"); this.audio.setHeartbeat(0); this.input.capture = false; this.pushHud(); return }
    if (this.timeLeft <= 0) { this.finish(false, "Evakuierungsfenster verstrichen"); return }
    if (this.timeLeft < 60 && this.timeLeft + dt >= 60) this.say("Noch 60 Sekunden bis zum Ende des Evakuierungsfensters!", 4)
    this.hudClock -= dt; if (this.hudClock <= 0) { this.hudClock = 0.05; this.pushHud() }
  }

  private playerState(active: boolean, alive = true): PlayerState {
    _ps.position.copy(this.pos); _ps.eyeY = this.eye; _ps.crouched = this.crouched; _ps.speed = this.vel.length(); _ps.sprinting = this.sprinting
    _ps.flashlight = this.flashlightOn; _ps.alive = alive && this.health > 0; _ps.active = active
    return _ps
  }

  private updateMovement(dt: number): void {
    const inX = this.input.moveX, inZ = this.input.moveZ
    const hasInput = inX !== 0 || inZ !== 0
    if (this.input.isHeld("ControlLeft") && !this.crouched) this.crouched = true
    const ctrlCrouch = this.input.isHeld("ControlLeft")
    const crouch = this.crouched || ctrlCrouch
    if (this.crouched && !ctrlCrouch && this.input.sprintHeld && inZ > 0) this.crouched = false
    const wantSprint = this.input.sprintHeld && inZ > 0 && !crouch && this.ads < 0.3 && this.healTime < 0 && this.sprintBlock <= 0 && !this.exhausted
    this.sprinting = wantSprint && this.vel.length() > 2
    let speed = crouch ? CROUCH_SPEED : wantSprint ? SPRINT : WALK
    speed *= this.weapon.def.moveSpeed * (1 - this.ads * 0.38)
    if (this.weapon.reloading && !wantSprint) speed *= 0.85
    // stamina
    if (this.sprinting) { this.stamina = Math.max(0, this.stamina - 20 * dt); this.staminaDelay = 0.9; if (this.stamina <= 0) { this.exhausted = true; this.say("Erschöpft", 1.2) } }
    else { this.staminaDelay -= dt; if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + (crouch || !hasInput ? 24 : 16) * dt) }
    if (this.exhausted && this.stamina > 30) this.exhausted = false
    // acceleration toward target velocity (in world space)
    // keyboard diagonals are normalised, analog stick magnitude is kept
    const len = Math.hypot(inX, inZ), k = len > 1 ? 1 / len : 1
    const mx = inX * k, mz = inZ * k
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
    const tx = hasInput ? (mx * cos - mz * sin) * speed : 0, tz = hasInput ? (-mx * sin - mz * cos) * speed : 0
    const accel = hasInput ? 14 : 18
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt); this.vel.y += (tz - this.vel.y) * Math.min(1, accel * dt)
    moveCircle(this.pos.x, this.pos.z, this.vel.x * dt, this.vel.y * dt, RADIUS, this.world.obstacles, _xz)
    const moved = Math.hypot(_xz.x - this.pos.x, _xz.z - this.pos.z)
    this.pos.x = _xz.x; this.pos.z = _xz.z
    // eye height
    const eyeTarget = crouch ? EYE_CROUCH : EYE_STAND
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 10)
    // footsteps: sound + noise for enemies
    this.stepDistance += moved
    const stride = this.sprinting ? 2.4 : crouch ? 1.4 : 1.9
    if (this.stepDistance >= stride) {
      this.stepDistance = 0
      const surface = this.world.surfaceAt(this.pos.x, this.pos.z)
      this.audio.play(stepSound(surface), { volume: crouch ? 0.35 : this.sprinting ? 1 : 0.65, rate: 0.95 + this.rng() * 0.1 })
      this.enemies.hearNoise({ x: this.pos.x, y: 0, z: this.pos.z }, this.sprinting ? 16 : crouch ? 2.5 : 7)
    }
  }

  private updateWeapon(dt: number): void {
    const w = this.weapon
    // weapon switch animation (lower → swap → raise)
    if (this.switchTime >= 0) {
      this.switchTime += dt / 0.5
      if (this.pendingWeapon && this.switchTime >= 0.5) { this.active = this.pendingWeapon; this.pendingWeapon = null; this.viewModel.setWeapon(this.weapon.id) }
      if (this.switchTime >= 1) this.switchTime = -1
    }
    for (const rw of [this.primary, this.sidearm]) {
      const r = rw.update(dt)
      if (r === "reloaded" && rw === this.weapon) { this.audio.play("reload_in"); if (!rw.reloading && rw.def.cls !== "shotgun") this.audio.play("reload_bolt", { volume: 0.8 }) }
    }
    if (this.pumpTimer > 0) { this.pumpTimer -= dt; if (this.pumpTimer <= 0) this.audio.play("pump") }
    // healing / throwing
    if (this.healTime >= 0) {
      this.healTime += dt / 1.2
      if (this.healTime >= 1) { this.healTime = -1; const amount = this.company.has("fieldmed") ? 65 : 45; this.health = Math.min(100, this.health + amount); this.say(`Trauma-Set angewendet · +${amount} Gesundheit`, 1.8) }
    }
    if (this.throwTime >= 0) {
      const before = this.throwTime
      this.throwTime += dt / 0.6
      if (before < 0.45 && this.throwTime >= 0.45) this.releaseGrenade()
      if (this.throwTime >= 1) this.throwTime = -1
    }
    // aim down sights
    const busy = this.healTime >= 0 || this.throwTime >= 0 || this.switchTime >= 0
    const adsTarget = this.input.adsHeld && !this.sprinting && !busy ? 1 : 0
    const prevAds = this.ads
    this.ads += (adsTarget - this.ads) * Math.min(1, dt / Math.max(0.05, w.def.adsTime) * 2.2)
    if (this.ads < 0.001) this.ads = 0
    if (prevAds < 0.2 && this.ads >= 0.2 && adsTarget) this.audio.play("ads_in", { volume: 0.5 })
    // trigger
    const pressed = this.input.consumeAction("Fire")
    const held = this.input.fireHeld
    if ((pressed || held) && this.sprinting) { this.sprintBlock = 0.25 }
    if (busy || (this.sprinting && !pressed)) { if (pressed && !busy) this.sprintBlock = 0.25; return }
    const res = w.trigger(pressed, held)
    if (res === "fired") this.fire(w)
    else if (res === "empty") { this.audio.play("dry_fire"); if (w.canReload) this.reload(); else if (this.active === "primary") { this.say("Hauptwaffe leer · Wechsel zur Pistole", 1.6); this.switchTo("sidearm") } }
    // automatic reload when the magazine runs dry and the trigger is released
    if (w.mag === 0 && !held && w.canReload && !w.reloading) this.reload()
  }

  private fire(w: WeaponRuntime): void {
    const def = w.def
    this.camera.updateMatrixWorld()
    const origin = _origin.set(this.pos.x, this.eye, this.pos.z)
    _fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion); _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
    const spread = w.spread(this.ads, this.vel.length() / WALK, this.crouched)
    const bonus = this.company.has("ballistics") ? 1.15 : 1
    const muzzle = _muzzle.copy(origin).addScaledVector(_fwd, 0.75).addScaledVector(_right, 0.13 * (1 - this.ads)).addScaledVector(_up, -0.1 + this.ads * 0.05)
    let hitAny = false, killed = false, head = false
    for (let p = 0; p < def.pellets; p++) {
      coneOffset(spread, this.rng, _cone)
      _dir.copy(_fwd).addScaledVector(_right, _cone.x).addScaledVector(_up, _cone.y).normalize()
      const maxDist = 220
      const wall = raycastObstacles(origin, _dir, maxDist, this.world.obstacles)
      const groundT = _dir.y < -1e-4 ? -origin.y / _dir.y : Infinity
      const enemyHit = this.enemies.hitTest(origin, _dir, Math.min(maxDist, wall?.distance ?? maxDist, groundT))
      let end: THREE.Vector3
      if (enemyHit) {
        end = enemyHit.point
        const dmg = damageAt(def, enemyHit.distance, enemyHit.part, bonus)
        const r = this.enemies.applyDamage(enemyHit, dmg, this.pos)
        hitAny = true; head = head || enemyHit.part === "head"
        _n.copy(_dir).negate()
        this.effects.impact(end, _n, "flesh")
        if (r.killed) { killed = true; this.registerKill(enemyHit.enemy, enemyHit.part) }
      } else if (wall && wall.distance <= groundT) {
        end = _end.copy(origin).addScaledVector(_dir, wall.distance)
        const kind: ImpactKind = wall.obstacle.surface === "metal" ? "metal" : wall.obstacle.surface === "dirt" ? "dirt" : "concrete"
        this.effects.impact(end, wall.normal, kind)
        if (p === 0 || this.rng() < 0.3) this.audio.play(kind === "metal" ? "impact_metal" : "impact_concrete", { position: end, volume: 0.5 })
      } else if (groundT < maxDist) {
        end = _end.copy(origin).addScaledVector(_dir, groundT)
        const surface = this.world.surfaceAt(end.x, end.z)
        this.effects.impact(end, _upWorld, surface === "metal" ? "metal" : surface === "dirt" || surface === "gravel" ? "dirt" : "concrete")
      } else end = _end.copy(origin).addScaledVector(_dir, maxDist)
      if (p === 0 || p % 3 === 0) this.effects.tracer(muzzle, end)
    }
    if (hitAny) { this.hitMarker = 0.14; this.audio.play(head ? "hit_head" : "hit_body", { volume: 0.8 }) }
    if (killed) { this.killMarker = 0.4; this.audio.play("kill", { volume: 0.7 }) }
    // recoil: part stays (player compensates), part is a visual punch that recovers
    const adsK = 1 - this.ads * 0.35, crouchK = this.crouched ? 0.8 : 1
    const kickP = def.recoilPitch * adsK * crouchK * (1 + Math.min(w.burst, 10) * 0.04)
    const kickY = (this.rng() - 0.45) * 2 * def.recoilYaw * adsK * crouchK
    this.pitch = Math.min(1.45, this.pitch + kickP * 0.65); this.yaw += kickY * 0.65
    this.punch.x += kickP * 0.35; this.punch.y += kickY * 0.35
    this.viewModel.fire()
    this.effects.muzzleFlash(muzzle, def.cls === "shotgun" ? 1.6 : def.cls === "pistol" ? 0.7 : 1)
    this.audio.play(`shot_${def.id}` as const)
    if (this.settings.screenShake) this.shake = Math.min(0.6, this.shake + (def.cls === "shotgun" ? 0.25 : def.cls === "dmr" ? 0.18 : 0.05))
    this.enemies.hearNoise({ x: this.pos.x, y: this.eye, z: this.pos.z }, def.noise)
    if (def.cls === "shotgun") this.pumpTimer = 0.32
  }

  private registerKill(enemy: Enemy, part: HitPart): void {
    this.kills++
    if (part === "head") this.headshots++
    this.say(part === "head" ? `Kopftreffer · ${ENEMIES[enemy.kind].name} neutralisiert` : `${ENEMIES[enemy.kind].name} neutralisiert`, 1.4)
    if (this.contract?.id === "heavy" && enemy.kind === "heavy") this.contract.progress++
    if (this.contract?.id === "headhunter" && part === "head") this.contract.progress++
  }

  private onEnemyDied(enemy: Enemy, cause: "player" | "explosion", part: HitPart): void {
    if (this.mode !== "raid" && this.mode !== "dying") return
    if (cause === "explosion") this.registerKill(enemy, part)
    const contents = rollBody(enemy.kind, MISSIONS[this.mission].tier, this.rng)
    if (contents.length) this.bodies.push(new BodyLoot(enemy.position, contents, enemy.kind))
  }

  private onEnemyShot(shot: EnemyShot): void {
    if (this.mode !== "raid" && this.mode !== "dying") return
    this.audio.play(`enemy_${shot.weapon}` as const, { position: shot.from })
    this.effects.tracer(shot.from, shot.to, true)
    this.effects.muzzleSmoke(shot.from)
    const heading = headingOf(shot.from.x - this.pos.x, shot.from.z - this.pos.z)
    if (!shot.hit) {
      // near miss: whiz when the bullet passes close to the head
      _head.set(this.pos.x, this.eye, this.pos.z)
      const d = closestOnSegment(shot.from, shot.to, _head, _tmp)
      if (d < 2.5) this.audio.play("whiz", { position: _tmp, volume: 1 - d / 3 })
      if (this.damageDirs.length < 6) this.damageDirs.push({ heading, life: 0.45 })
      return
    }
    if (this.mode !== "raid" || this.godMode) return
    const dmg = shot.damage
    const absorbed = Math.min(this.armor, dmg * 0.65)
    this.armor -= absorbed; this.health -= dmg - absorbed
    this.damageFlash = 0.35
    if (this.settings.screenShake) this.shake = Math.min(0.8, this.shake + 0.22)
    this.punch.x += (this.rng() - 0.3) * 0.02; this.punch.y += (this.rng() - 0.5) * 0.03
    this.audio.play(absorbed > dmg * 0.4 ? "armor_absorb" : "hurt", { volume: 0.9 })
    const existing = this.damageDirs.find(d => Math.abs(wrapDegrees(d.heading - heading)) < 20)
    if (existing) { existing.life = 1; existing.heading = heading } else this.damageDirs.push({ heading, life: 1 })
    if (this.healTime >= 0 && this.healTime < 0.5) { this.healTime = -1; this.medkits++; this.say("Heilung unterbrochen", 1.2) }
  }

  private reload(): void {
    const w = this.weapon
    if (this.switchTime >= 0 || this.healTime >= 0) return
    if (w.startReload()) { this.audio.play("reload_out"); this.sprintBlock = 0 }
    else if (!w.infinite && w.reserve <= 0 && w.mag < w.def.magazine) this.say("Keine Reservemunition", 1.4)
  }

  private switchTo(which: "primary" | "sidearm"): void {
    if (which === this.active && !this.pendingWeapon) return
    if (this.healTime >= 0 || this.throwTime >= 0) return
    if (which === "primary" && this.primary.total <= 0) { this.say("Hauptwaffe ohne Munition", 1.2); return }
    this.weapon.cancelReload()
    this.pendingWeapon = which; this.switchTime = 0
    this.audio.play("weapon_switch")
  }

  private startHeal(): void {
    if (this.healTime >= 0 || this.throwTime >= 0) return
    if (this.medkits <= 0) { this.say("Keine Trauma-Sets", 1.2); this.audio.play("ui_error"); return }
    if (this.health >= 100) { this.say("Gesundheit voll", 1); return }
    this.weapon.cancelReload(); this.medkits--; this.healTime = 0; this.audio.play("heal")
  }

  private startThrow(): void {
    if (this.throwTime >= 0 || this.healTime >= 0) return
    if (this.grenadeCount <= 0) { this.say("Keine Granaten", 1.2); this.audio.play("ui_error"); return }
    this.weapon.cancelReload(); this.grenadeCount--; this.throwTime = 0; this.audio.play("grenade_pin")
  }

  private releaseGrenade(): void {
    this.camera.updateMatrixWorld()
    _fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const origin = { x: this.pos.x + _fwd.x * 0.4, y: this.eye - 0.1, z: this.pos.z + _fwd.z * 0.4 }
    this.grenades.throw(origin, _fwd, { x: this.vel.x * 0.5, y: 0, z: this.vel.y * 0.5 })
  }

  private explode(p: Vec3): void {
    this.effects.explosion(p)
    this.audio.play("explosion", { position: p })
    const center = { x: p.x, y: p.y + 0.4, z: p.z }
    this.enemies.applyExplosion(center, GRENADE_RADIUS, GRENADE_DAMAGE)
    this.enemies.hearNoise(p, 70)
    const d = Math.hypot(this.pos.x - p.x, this.pos.z - p.z)
    if (this.mode === "raid") {
      if (this.settings.screenShake) this.shake = Math.min(1.2, this.shake + Math.max(0, 1 - d / 25) * 1.2)
      if (d < GRENADE_RADIUS && !segmentBlocked3D(center, { x: this.pos.x, y: this.eye - 0.4, z: this.pos.z }, this.world.obstacles) && !this.godMode) {
        const dmg = GRENADE_DAMAGE * 0.7 * (1 - d / GRENADE_RADIUS)
        const absorbed = Math.min(this.armor, dmg * 0.4)
        this.armor -= absorbed; this.health -= dmg - absorbed; this.damageFlash = 0.5
        this.audio.play("hurt")
      }
    }
  }

  // ───────────────────────────── loot & interaction ─────────────────────────────

  private updateInteraction(dt: number): void {
    // find the best interactable: close and roughly in view
    let best: Interactable | null = null, bestScore = Infinity
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw)
    const consider = (x: number, z: number, item: Interactable, range: number) => {
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz)
      if (d > range) return
      const facing = d < 0.9 ? 1 : (dx * fx + dz * fz) / d
      if (facing < 0.35) return
      const score = d * (2 - facing)
      if (score < bestScore) { bestScore = score; best = item }
    }
    for (const c of this.crates) if (!c.searched) consider(c.position.x, c.position.z, { kind: "crate", crate: c }, 2.3)
    for (const b of this.bodies) if (!b.searched) consider(b.position.x, b.position.z, { kind: "body", body: b }, 2.0)
    const inZone = Math.hypot(this.pos.x - this.extraction.x, this.pos.z - this.extraction.z) < this.extraction.radius
    const target = best as Interactable | null
    if (!sameTarget(target, this.interactTarget)) { this.interactTarget = target; this.interactHold = 0 }
    const busy = this.healTime >= 0 || this.throwTime >= 0
    const holding = this.input.isHeld("KeyE") && !busy
    this.input.consumeAction("KeyE")
    if (target) {
      const time = target.kind === "crate" ? 1.1 : 1.4
      this.interactText = `${this.key("E")} halten · ${target.kind === "crate" ? "Kiste durchsuchen" : "Ausrüstung durchsuchen"}`
      if (holding) {
        if (this.interactHold === 0) this.audio.play(target.kind === "crate" ? "crate_open" : "body_search", { volume: 0.7 })
        this.interactHold += dt / time
        if (this.interactHold >= 1) { this.completeSearch(target); this.interactHold = 0; this.interactTarget = null }
      } else this.interactHold = Math.max(0, this.interactHold - dt * 3)
      return
    }
    this.interactHold = 0
    const required = MISSIONS[this.mission].lootRequired
    if (inZone && !this.extractCalled) {
      if (this.collected < required) { this.interactText = `Noch ${required - this.collected} ${required - this.collected === 1 ? "Kiste" : "Kisten"} erforderlich`; return }
      this.interactText = `${this.key("E")} halten · Evakuierung anfordern`
      if (holding) { this.extractProgress += dt / 0.8; if (this.extractProgress >= 1) this.callExtraction() } else this.extractProgress = 0
      return
    }
    this.interactText = ""
  }

  private completeSearch(target: Interactable): void {
    if (target.kind === "crate") {
      target.crate.markSearched(); this.collected++
      this.takeLoot(target.crate.contents)
      this.audio.play("pickup")
      const required = MISSIONS[this.mission].lootRequired
      if (this.collected === required) {
        this.say(`Bergungsziel erreicht · Extraktion ${this.extraction.name} freigegeben`, 4)
        this.world.setExtraction(this.extraction.id, "ready", 0)
        this.audio.play("radio")
        if (!this.company.profile.tutorialDone) this.showHint("extract", `Folgen Sie dem grünen Pfeil auf dem Kompass zur Extraktion · ${this.key("M")} öffnet die Karte`, 8)
      } else if (this.collected < required) this.say(`Kiste gesichert · ${this.collected}/${required}`, 2)
    } else {
      target.body.searched = true
      this.takeLoot(target.body.contents)
      this.audio.play("pickup", { volume: 0.7 })
    }
  }

  private takeLoot(stacks: LootStack[]): void {
    const parts: string[] = []
    for (const s of stacks) {
      if (s.id === "ammo") {
        const rounds = this.primary.def.roundsPerPack * s.qty
        if (rounds > 0) { this.primary.reserve += rounds; parts.push(`+${rounds} Schuss`) } else this.add("ammo", s.qty)
      } else if (s.id === "medkit" && this.medkits < MAX_MEDKITS) { this.medkits++; parts.push("+1 Trauma-Set") }
      else if (s.id === "grenade" && this.grenadeCount < MAX_GRENADES) { this.grenadeCount++; parts.push("+1 Granate") }
      else { this.add(s.id, s.qty); parts.push(`${s.qty}× ${ITEMS[s.id].name}`) }
    }
    if (parts.length) this.say(parts.join(" · "), 2.2)
    else this.say("Nichts Brauchbares gefunden", 1.4)
  }

  private add(id: ItemId, qty: number): void { this.raidLoot[id] = (this.raidLoot[id] || 0) + qty }

  private callExtraction(): void {
    this.extractCalled = true; this.extractProgress = 0
    this.world.setExtraction(this.extraction.id, "called", 0)
    this.audio.play("extract_call")
    this.say("Hubschrauber angefordert · Halten Sie die Zone!", 4)
    const reinf = MISSIONS[this.mission].reinforcements
    if (reinf.length) { this.enemies.spawnReinforcements(reinf, { x: this.extraction.x, z: this.extraction.z }); window.setTimeout(() => { if (this.mode === "raid") this.say("Feindliche Verstärkung im Anmarsch!", 3) }, 2500) }
    if (!this.company.profile.tutorialDone) this.showHint("hold", "Bleiben Sie im Kreis, bis der Hubschrauber landet. Verlassen pausiert die Evakuierung.", 8)
  }

  private updateExtraction(dt: number): void {
    if (!this.extractCalled || this.extractDone) return
    const inZone = Math.hypot(this.pos.x - this.extraction.x, this.pos.z - this.extraction.z) < this.extraction.radius + 0.5
    const total = MISSIONS[this.mission].extractTime * (this.company.has("logistics") ? 0.6 : 1)
    if (inZone) {
      const before = this.extractProgress
      this.extractProgress = Math.min(1, this.extractProgress + dt / total)
      if (Math.floor(before * total) !== Math.floor(this.extractProgress * total)) this.audio.play("extract_tick", { volume: 0.6 })
      if (before < 0.55 && this.extractProgress >= 0.55) this.audio.play("helicopter", { position: { x: this.extraction.x, y: 12, z: this.extraction.z } })
    } else if (this.time % 2 < dt) this.say("Zurück in die Extraktionszone!", 1.5)
    this.world.setExtraction(this.extraction.id, "called", this.extractProgress)
    if (this.extractProgress >= 1) { this.extractDone = true; this.world.setExtraction(this.extraction.id, "done", 1); this.finish(true, `Extraktion ${this.extraction.name} erfolgreich · Operator ausgeflogen`) }
  }

  private lootValue(): number { return Object.entries(this.raidLoot).reduce((sum, [id, qty]) => sum + (ITEMS[id as ItemId].kind === "loot" ? ITEMS[id as ItemId].value * (qty || 0) : 0), 0) }

  private updateContract(): void {
    const c = this.contract; if (!c) return
    switch (c.id) {
      case "silent": c.progress = this.kills; c.failed = this.kills > c.target; break
      case "value": c.progress = this.lootValue(); break
      case "fast": c.progress = this.elapsed; c.failed = this.elapsed > c.target; break
      case "unharmed": c.progress = Math.ceil(this.health); break
      default: c.done = c.progress >= c.target
    }
  }

  private finalizeContract(success: boolean): void {
    const c = this.contract; if (!c) return
    this.updateContract()
    if (!success) { c.done = false; return }
    if (c.id === "silent" || c.id === "fast") c.done = !c.failed
    else if (c.id === "value") c.done = c.progress >= c.target
    else if (c.id === "unharmed") { c.done = this.health >= c.target; c.failed = !c.done }
    else c.done = c.progress >= c.target
  }

  private contractText(): string {
    const c = this.contract; if (!c) return ""
    const name = CONTRACTS[c.id].name
    switch (c.id) {
      case "silent": return c.failed ? `${name}: verfehlt` : `${name}: ${c.progress}/${c.target} Neutralisierungen erlaubt`
      case "value": return `${name}: ${Math.min(c.progress, c.target).toLocaleString("de-DE")} / ${c.target.toLocaleString("de-DE")} $`
      case "fast": return c.failed ? `${name}: verfehlt` : `${name}: noch ${formatClock(c.target - c.progress)}`
      case "unharmed": return `${name}: Gesundheit ≥ ${c.target} halten`
      default: return `${name}: ${Math.min(c.progress, c.target)}/${c.target}${c.progress >= c.target ? " ✓" : ""}`
    }
  }

  // ───────────────────────────── hints & messages ─────────────────────────────

  /** Button name for prompts on the device in use. */
  private key(k: string): string { return this.input.device === "pad" ? PAD_LABEL[k] ?? k : k }
  private say(text: string, seconds: number): void { this.message = text; this.messageTime = seconds }
  private showHint(key: string, text: string, seconds: number): void { if (this.hintsShown.has(key)) return; this.hintsShown.add(key); this.hint = text; this.hintTime = seconds }
  private updateHints(): void {
    if (this.company.profile.tutorialDone) return
    if (this.elapsed > 9 && !this.hintsShown.has("crate")) {
      const near = this.crates.some(c => !c.searched && c.position.distanceTo(this.pos) < this.crateRange())
      if (near) this.showHint("crate", `Rauten auf dem Kompass zeigen Kisten · ${this.key("E")} gedrückt halten zum Durchsuchen`, 8)
    }
    if (this.collected >= 1 && !this.hintsShown.has("combat")) this.showHint("combat", this.input.device === "pad" ? "LT zielen · RT feuern · Ⓧ nachladen · RB heilen · LB Granate · Ⓨ Waffe wechseln" : "Rechte Maustaste zielen · Linke Maustaste feuern · R nachladen · Q heilen · G Granate", 8)
  }
  private crateRange(): number { return this.company.has("recon") ? 45 : 18 }

  // ───────────────────────────── finish ─────────────────────────────

  private finish(success: boolean, reason: string): void {
    if (this.mode === "ended" || this.mode === "attract" || !this.kit) return
    this.mode = "ended"; this.paused = false; this.input.capture = false; this.viewModel.visible = false
    if (document.pointerLockElement) document.exitPointerLock()
    this.finalizeContract(success)
    const loot = Object.entries(this.raidLoot).filter(([, q]) => (q || 0) > 0).map(([id, qty]) => ({ id: id as ItemId, qty: qty || 0 }))
    const settlement = this.company.finishRaid(this.kit, {
      mission: this.mission, success, loot: this.raidLoot, kills: this.kills, headshots: this.headshots,
      roundsLeft: this.primary.total, medkitsLeft: this.medkits, grenadesLeft: this.grenadeCount, armorLeft: Math.max(0, this.armor),
      contract: this.contract, difficulty: this.settings.difficulty,
    })
    this.kit = null
    this.audio.play(success ? "win" : "lose"); this.audio.setIntensity(0); this.audio.setHeartbeat(0)
    if (settlement.levelUp) window.setTimeout(() => this.audio.play("level_up"), 700)
    const result: RaidResult = {
      success, reason, mission: this.mission, kills: this.kills, headshots: this.headshots, loot: success ? loot : [], value: settlement.value,
      reward: settlement.reward, resources: settlement.resources, duration: this.elapsed, xp: settlement.xp, levelUp: settlement.levelUp,
      contract: this.contract, contractReward: settlement.contractReward,
    }
    this.callbacks.onEnd(result)
  }

  // ───────────────────────────── render ─────────────────────────────

  private render(): void {
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastRender) / 1000); this.lastRender = now
    this.fpsFrames++
    if (this.fpsTime >= 1) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0 }
    const cam = this.camera
    if (this.mode === "attract") {
      const b = this.world.layout.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.42
      const t = this.time * 0.035
      cam.position.set(cx + Math.sin(t) * r, 22 + Math.sin(t * 2) * 3, cz + Math.cos(t) * r); cam.lookAt(cx, 2, cz)
      cam.fov = 60; cam.updateProjectionMatrix(); this.flashlight.intensity = 0
    } else {
      // punch recovers toward zero
      this.punch.multiplyScalar(Math.max(0, 1 - dt * 9))
      const moving = this.vel.length()
      const bob = this.mode === "raid" && !this.paused ? Math.sin(this.time * (this.sprinting ? 13 : 9)) * 0.03 * Math.min(1.5, moving / WALK) * (1 - this.ads * 0.8) : 0
      const sh = this.shake * this.shake
      const shakeX = sh ? (Math.random() - 0.5) * sh * 0.06 : 0, shakeY = sh ? (Math.random() - 0.5) * sh * 0.06 : 0
      let eye = this.eye + bob, roll = 0
      if (this.mode === "dying") { const k = Math.min(1, this.deathTime / 0.9); eye = this.eye - (this.eye - 0.3) * k * k; roll = this.dyingRoll * k * 1.1 }
      cam.position.set(this.pos.x, eye, this.pos.z)
      cam.rotation.set(this.pitch + this.punch.x + shakeY, this.yaw + this.punch.y + shakeX, roll)
      const zoom = 1 + (this.weapon.def.adsZoom - 1) * this.ads
      const targetFov = this.settings.fov * zoom * (this.sprinting ? 1.05 : 1)
      if (Math.abs(cam.fov - targetFov) > 0.01) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix() }
      this.flashlight.intensity = this.flashlightOn && this.mode === "raid" ? 26 : 0
      this.viewModel.update(dt, {
        weapon: this.weapon.id, ads: this.ads, move: moving / WALK, sprinting: this.sprinting, crouched: this.crouched,
        lookYaw: this.lookFrame.yaw, lookPitch: this.lookFrame.pitch,
        reload: this.weapon.reloading ? 1 - this.weapon.reloadLeft / this.weapon.reloadTotal : -1, shellReload: this.weapon.def.cls === "shotgun",
        switching: this.switchTime, throwing: this.throwTime >= 0 ? this.throwTime : this.healTime >= 0 ? Math.min(1, this.healTime * 1.2) : -1,
        light: LIGHT_LEVEL[this.world.theme], flashlight: this.flashlightOn,
      })
      this.lookFrame.yaw = 0; this.lookFrame.pitch = 0
      this.audio.setListener(cam.position, this.yaw)
    }
    this.world.update(dt, this.time, cam)
    this.renderer.info.reset()
    this.renderer.clear()
    this.renderer.render(this.scene, cam)
    if (this.mode === "raid" || this.mode === "dying") this.viewModel.render(this.renderer)
    window.__GAME_READY__ = true
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private pushHud(): void {
    const def = MISSIONS[this.mission], required = def.lootRequired, ready = this.collected >= required
    const w = this.weapon
    const heading = ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360
    const markers: CompassMarker[] = []
    const add = (kind: CompassMarker["kind"], x: number, z: number) => { const dx = x - this.pos.x, dz = z - this.pos.z; markers.push({ kind, bearing: wrapDegrees(headingOf(dx, dz) - heading), distance: Math.hypot(dx, dz) }) }
    add("extract", this.extraction.x, this.extraction.z)
    const range = this.crateRange()
    for (const c of this.crates) if (!c.searched && c.position.distanceTo(this.pos) < range) add("crate", c.position.x, c.position.z)
    for (const b of this.bodies) if (!b.searched && b.position.distanceTo(this.pos) < 14) add("body", b.position.x, b.position.z)
    const objective = this.extractCalled ? "Extraktionszone halten" : ready ? `Extraktion ${this.extraction.name} erreichen` : "Versorgungskisten bergen"
    const progress = this.extractCalled ? `HUBSCHRAUBER ${Math.round(this.extractProgress * 100)} %` : ready ? "EVAKUIERUNG FREIGEGEBEN" : `${this.collected} / ${required}`
    this.callbacks.onHud({
      health: Math.max(0, Math.ceil(this.health)), armor: Math.max(0, Math.ceil(this.armor)), armorMax: Math.max(this.armorMax, Math.ceil(this.armor)), stamina: this.stamina,
      ammo: w.mag, reserve: w.reserve, reserveInfinite: w.infinite, weaponName: w.def.name, fireMode: w.def.auto ? "AUTO" : w.def.cls === "shotgun" ? "PUMP" : "EINZEL",
      medkits: this.medkits, grenades: this.grenadeCount, reloading: w.reloadLeft, reloadTotal: w.reloadTotal,
      objective, objectiveProgress: progress, contract: this.contractText(), lootValue: this.lootValue(), raidTime: Math.max(0, this.timeLeft),
      extraction: this.extractCalled ? this.extractProgress : 0,
      interaction: this.interactText, interactionProgress: this.interactTarget ? this.interactHold : this.extractCalled ? 0 : this.extractProgress,
      enemies: this.enemies.aliveCount(), hitMarker: this.hitMarker, killMarker: this.killMarker, damageFlash: this.damageFlash,
      damageDirections: this.damageDirs.map(d => ({ angle: wrapDegrees(d.heading - heading), life: d.life })),
      compass: heading, markers, spread: w.spread(this.ads, this.vel.length() / WALK, this.crouched) / (this.camera.fov * Math.PI / 180) * 2,
      crouched: this.crouched || this.input.isHeld("ControlLeft"), ads: this.ads > 0.6, scoped: this.viewModel.isScoped && this.ads > 0.92,
      message: this.message, messageTime: this.messageTime, hint: this.hintTime > 0 ? this.hint : "", fps: this.fps, dead: this.mode === "dying", device: this.input.device,
    })
  }

  // ───────────────────────────── map & debug API ─────────────────────────────

  /** Data for the tactical map overlay. */
  mapData() {
    return {
      layout: this.world.layout, obstacles: this.world.obstacles, player: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
      extraction: this.mode === "attract" ? null : { x: this.extraction.x, z: this.extraction.z, r: this.extraction.radius, name: this.extraction.name, ready: this.collected >= MISSIONS[this.mission].lootRequired },
      crates: this.crates.filter(c => !c.searched && c.position.distanceTo(this.pos) < this.crateRange()).map(c => ({ x: c.position.x, z: c.position.z })),
      searched: this.crates.filter(c => c.searched).map(c => ({ x: c.position.x, z: c.position.z })),
    }
  }

  getRaidLoot(): LootStack[] { return Object.entries(this.raidLoot).filter(([, q]) => (q || 0) > 0).map(([id, qty]) => ({ id: id as ItemId, qty: qty || 0 })) }
  getRaidStatus() { return { medkits: this.medkits, grenades: this.grenadeCount, primary: this.primary?.def.name ?? "", primaryRounds: this.primary?.total ?? 0, contract: this.contractText(), value: this.lootValue() } }

  getSnapshot(): GameSnapshot {
    return {
      screen: "playing", player: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, yaw: this.yaw, pitch: this.pitch, health: this.health, armor: this.armor, stamina: this.stamina, crouched: this.crouched,
      weapon: (this.mode === "attract" ? "mk4" : this.weapon.id) as WeaponId, ammo: this.mode === "attract" ? 0 : this.weapon.mag, reserve: this.mode === "attract" ? 0 : this.weapon.reserve,
      enemiesAlive: this.enemies.aliveCount(), lootCollected: this.collected, raidLoot: this.getRaidLoot(), extractionReady: this.collected >= MISSIONS[this.mission].lootRequired,
      extractionProgress: this.extractCalled ? this.extractProgress : 0, extractionId: this.extraction?.id ?? "", mission: this.mission,
      fps: this.fps, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
    }
  }

  debug = {
    teleport: (x: number, z: number) => { this.pos.set(x, 0, z); const p = { x, z }; depenetrate(p, RADIUS, this.world.obstacles); this.pos.x = p.x; this.pos.z = p.z },
    collectNext: () => { const crate = this.crates.find(c => !c.searched); if (crate) this.completeSearch({ kind: "crate", crate }) },
    damage: (amount: number) => { this.health -= amount; this.damageFlash = 0.3 },
    aimAtEnemy: (head = false) => {
      const target = this.enemies.enemies.filter(e => e.alive).sort((a, b) => a.position.distanceTo(this.pos) - b.position.distanceTo(this.pos))[0]
      if (!target) return false
      const p = head ? target.headPosition(_tmp) : target.chestPosition(_tmp)
      const dx = p.x - this.pos.x, dy = p.y - this.eye, dz = p.z - this.pos.z
      this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(dy, Math.hypot(dx, dz)); this.punch.set(0, 0)
      return true
    },
    /** Moves the nearest living enemy in front of the player with a clear line of fire. */
    placeEnemy: (distance: number) => {
      const e = this.enemies.enemies.find(x => x.alive); if (!e) return false
      e.position.set(this.pos.x - Math.sin(this.yaw) * distance, 0, this.pos.z - Math.cos(this.yaw) * distance)
      return true
    },
    eliminateOne: () => { const e = this.enemies.enemies.find(x => x.alive); if (!e) return; this.enemies.applyDamage({ enemy: e, distance: 1, part: "body", point: e.position.clone() }, 9999, this.pos) },
    extractionPoint: () => ({ x: this.extraction.x, z: this.extraction.z, r: this.extraction.radius }),
    crates: () => this.crates.filter(c => !c.searched).map(c => ({ x: c.position.x, z: c.position.z })),
    lookAt: (x: number, z: number, y = 0.4) => { const dx = x - this.pos.x, dz = z - this.pos.z; this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(y - this.eye, Math.hypot(dx, dz)) },
    setGodMode: (on: boolean) => { this.godMode = on },
    enemies: () => this.enemies.enemies.map(e => ({ id: e.id, kind: e.kind, alive: e.alive, state: e.state, x: e.position.x, z: e.position.z })),
    weapon: () => ({ id: this.weapon.id, mag: this.weapon.mag, reserve: this.weapon.reserve, reloading: this.weapon.reloading }),
  }

  applySettings(settings: Settings): void {
    const qualityChanged = this.settings.quality !== settings.quality
    this.settings = settings
    this.input.sensitivity = settings.sensitivity; this.input.invertY = settings.invertY
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === "high" ? 1.75 : 1))
    this.renderer.shadowMap.enabled = settings.quality === "high"
    if (qualityChanged && this.world && this.mode === "attract") { this.worldMission = null; this.setMenuMission(this.mission) }
    this.resize()
  }

  dispose(): void {
    this.loop.stop(); this.pause()
    window.removeEventListener("resize", this.onResize); document.removeEventListener("pointerlockchange", this.onPointerLock)
    this.renderer.domElement.removeEventListener("click", this.onCanvasClick)
    this.input.dispose(); this.enemies.dispose(); this.effects.dispose(); this.grenades.clear(); for (const c of this.crates) c.dispose(); this.world.dispose()
    this.viewModel.dispose(); this.renderer.dispose()
  }
}

function shuffle<T>(a: T[], rng: () => number): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
function sameTarget(a: Interactable | null, b: Interactable | null): boolean {
  if (!a || !b) return a === b
  if (a.kind === "crate" && b.kind === "crate") return a.crate === b.crate
  if (a.kind === "body" && b.kind === "body") return a.body === b.body
  return false
}
/** Distance from p to segment ab; writes the closest point into out. */
function closestOnSegment(a: Vec3, b: Vec3, p: Vec3, out: THREE.Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
  const len2 = abx * abx + aby * aby + abz * abz || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2))
  out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t)
  return Math.hypot(out.x - p.x, out.y - p.y, out.z - p.z)
}
export function formatClock(seconds: number): string { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }

const _ps: PlayerState = { position: new THREE.Vector3(), eyeY: EYE_STAND, crouched: false, speed: 0, sprinting: false, flashlight: false, alive: true, active: false }
const _xz = { x: 0, z: 0 }
const _origin = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _dir = new THREE.Vector3(), _end = new THREE.Vector3()
const _muzzle = new THREE.Vector3(), _n = new THREE.Vector3(), _head = new THREE.Vector3(), _tmp = new THREE.Vector3()
const _cone = { x: 0, y: 0 }
const _camPos = new THREE.Vector3()
const _upWorld = { x: 0, y: 1, z: 0 }
