import * as THREE from "three"
import { AudioSystem } from "./audio"
import { ITEMS, MISSIONS } from "./data"
import { Effects, Enemy, LootCrate, rollLoot, type EnemyKind } from "./entities"
import { GameLoop } from "./engine"
import { Input } from "./input"
import type { Company } from "./profile"
import { asVec3, collides, createWorld, type World } from "./world"
import type { GameSnapshot, HudSnapshot, ItemId, LootStack, MissionId, RaidResult, Settings } from "./types"

interface RaidCallbacks {
  onHud: (hud: HudSnapshot) => void
  onEnd: (result: RaidResult) => void
  onPause: () => void
  onInventory: () => void
}

export class RaidGame {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(74, 1, 0.05, 180)
  readonly input: Input
  world!: World
  private effects!: Effects
  private enemies: Enemy[] = []
  private loot: LootCrate[] = []
  private loop: GameLoop
  private raycaster = new THREE.Raycaster()
  private player = new THREE.Vector3(0, 0, 43)
  private yaw = 0
  private pitch = 0
  private active = false
  private paused = false
  private ended = false
  private mission: MissionId = "greyzone"
  private health = 100
  private armor = 0
  private medkits = 0
  private ammo = 30
  private reserve = 120
  private reloadTime = 0
  private fireCooldown = 0
  private timeLeft = 360
  private grace = 0
  private raidElapsed = 0
  private kills = 0
  private collected = 0
  private raidLoot: Partial<Record<ItemId, number>> = {}
  private extractionProgress = 0
  private interaction = ""
  private nearLoot: LootCrate | null = null
  private inExtraction = false
  private recoil = 0
  private muzzleTime = 0
  private hitMarker = 0
  private damageFlash = 0
  private message = ""
  private messageTime = 0
  private hudClock = 0
  private attractTime = 0
  private hadPointerLock = false
  private weapon = new THREE.Group()
  private muzzle!: THREE.Mesh
  private muzzleLight!: THREE.PointLight
  private fps = 60
  private fpsFrames = 0
  private fpsTime = 0
  private onResize = () => { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight, false) }
  private onPointerLock = () => {
    if (document.pointerLockElement === this.renderer.domElement) { this.hadPointerLock = true; return }
    this.input.fireHeld = false; this.input.adsHeld = false
    if (this.hadPointerLock && this.active && !this.paused && !this.ended) { this.paused = true; this.callbacks.onPause() }
  }

  constructor(canvas: HTMLCanvasElement, private company: Company, private settings: Settings, private audio: AudioSystem, private callbacks: RaidCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.scene.background = new THREE.Color(0x17262b); this.scene.fog = new THREE.Fog(0x17262b, 38, 112)
    this.input = new Input(canvas); this.applySettings(settings)
    this.setupLighting(); this.buildWeapon(); this.scene.add(this.camera)
    this.setupWorld("greyzone"); this.onResize()
    window.addEventListener("resize", this.onResize); document.addEventListener("pointerlockchange", this.onPointerLock)
    this.loop = new GameLoop({ update: dt => this.update(dt), render: () => this.render() })
    this.loop.start()
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0x9dbbc0, 0x303326, 2.15); this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffe3bc, 2.4); sun.position.set(-28, 45, 20); sun.castShadow = true
    sun.shadow.mapSize.set(1536, 1536); sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55; sun.shadow.camera.far = 110; sun.shadow.bias = -0.00025; this.scene.add(sun)
    const skyGeo = new THREE.SphereGeometry(145, 24, 12)
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(0x1d353e) }, bottom: { value: new THREE.Color(0xb08362) } }, vertexShader: "varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}", fragmentShader: "uniform vec3 top;uniform vec3 bottom;varying vec3 vPos;void main(){float h=clamp(normalize(vPos).y*.75+.28,0.,1.);gl_FragColor=vec4(mix(bottom,top,h),1.);}" })
    this.scene.add(new THREE.Mesh(skyGeo, skyMat))
  }

  private buildWeapon(): void {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x435052, emissive: 0x101818, emissiveIntensity: 0.45, roughness: 0.42, metalness: 0.6 })
    const polymer = new THREE.MeshStandardMaterial({ color: 0x637269, emissive: 0x152019, emissiveIntensity: 0.35, roughness: 0.82 })
    const skin = new THREE.MeshStandardMaterial({ color: 0x8c7562, roughness: 1 })
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); this.weapon.add(m); return m }
    add(new THREE.BoxGeometry(0.13, 0.17, 0.65), gunMat, 0, 0, -0.22)
    add(new THREE.BoxGeometry(0.1, 0.09, 0.55), polymer, 0, 0.03, -0.72)
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), gunMat, 0, 0.035, -1.05).rotation.x = Math.PI / 2
    add(new THREE.BoxGeometry(0.1, 0.32, 0.18), polymer, 0, -0.21, -0.15).rotation.x = -0.16
    add(new THREE.BoxGeometry(0.1, 0.26, 0.14), gunMat, 0, -0.2, -0.42).rotation.x = 0.12
    add(new THREE.BoxGeometry(0.045, 0.09, 0.12), gunMat, 0, 0.15, -0.4)
    add(new THREE.BoxGeometry(0.025, 0.055, 0.025), polymer, 0, 0.2, -0.83)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.28), polymer, 0, -0.01, 0.25)
    add(new THREE.BoxGeometry(0.16, 0.14, 0.35), skin, -0.08, -0.19, 0.06).rotation.z = -0.35
    this.muzzle = add(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.9 }), 0, 0.035, -1.35); this.muzzle.visible = false
    this.muzzleLight = new THREE.PointLight(0xffa43b, 0, 4); this.muzzleLight.position.set(0, 0, -1.1); this.weapon.add(this.muzzleLight)
    this.weapon.scale.setScalar(0.72); this.weapon.position.set(0.28, -0.27, -0.48); this.weapon.visible = false; this.camera.add(this.weapon)
  }

  private setupWorld(id: MissionId): void {
    if (this.world) { this.scene.remove(this.world.group); for (const e of this.enemies) e.dispose(); for (const l of this.loot) l.dispose(); this.effects.dispose(); this.world.dispose() }
    this.enemies = []; this.loot = []; this.mission = id
    this.world = createWorld(id, this.settings.quality); this.scene.add(this.world.group); this.effects = new Effects(this.world.group)
    const tier = id === "greyzone" ? 0 : id === "harbor" ? 1 : 2
    this.world.lootSpawns.slice(0, 7 + tier * 2).forEach((p, i) => this.loot.push(new LootCrate(this.world, p, rollLoot(i, tier), i)))
    this.world.enemySpawns.slice(0, MISSIONS[id].enemies).forEach((p, i) => { const kind: EnemyKind = i % 5 === 4 ? "heavy" : i % 3 === 2 ? "scout" : "rifleman"; this.enemies.push(new Enemy(this.world, p, kind, i + MISSIONS[id].seed)) })
  }

  startMission(id: MissionId): void {
    this.setupWorld(id); this.active = true; this.paused = false; this.ended = false; this.hadPointerLock = false
    this.player.set(0, 0, 43); this.yaw = 0; this.pitch = 0; this.health = 100
    const bonusArmor = this.company.profile.research.includes("plating") && this.company.profile.loadout.armor > 0 ? 25 : 0
    this.armor = this.company.profile.loadout.armor + bonusArmor
    this.medkits = this.company.profile.loadout.medkits; this.company.profile.loadout.medkits = 0
    const totalAmmo = this.company.profile.stash.ammo * 30; this.ammo = Math.min(30, totalAmmo); this.reserve = Math.max(0, totalAmmo - this.ammo); this.company.profile.stash.ammo = 0
    this.reloadTime = 0; this.fireCooldown = 0; this.timeLeft = MISSIONS[id].time; this.grace = 2.2; this.raidElapsed = 0
    this.kills = 0; this.collected = 0; this.raidLoot = {}; this.extractionProgress = 0; this.hitMarker = 0; this.damageFlash = 0
    this.message = "Einsatz begonnen · Bergungsgut sichern"; this.messageTime = 3; this.weapon.visible = true
    this.input.clearActions(); this.company.save(); this.requestLock(); this.pushHud()
  }

  requestLock(): void { if (document.pointerLockElement !== this.renderer.domElement) void this.renderer.domElement.requestPointerLock().catch(() => { this.message = "Zum Zielen in das Spielfeld klicken"; this.messageTime = 3 }) }
  resume(): void { if (!this.active || this.ended) return; this.paused = false; this.input.clearActions(); this.requestLock() }
  pause(): void { if (!this.active || this.ended) return; this.paused = true; if (document.pointerLockElement) document.exitPointerLock() }
  returnToMenu(): void { this.active = false; this.paused = false; this.ended = false; this.weapon.visible = false; if (document.pointerLockElement) document.exitPointerLock(); this.setupWorld("greyzone") }
  abort(): void { if (this.active && !this.ended) this.finish(false, "Einsatz durch Operator abgebrochen") }

  private update(dt: number): void {
    this.attractTime += dt; this.fpsTime += dt; this.fpsFrames++
    if (this.fpsTime >= 1) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsTime = 0; this.fpsFrames = 0 }
    if (!this.active) {
      this.input.consumeLook(); this.input.clearActions()
      for (const enemy of this.enemies) enemy.update(dt, _farPlayer, 999, () => {})
      return
    }
    if (this.paused || this.ended) { this.input.consumeLook(); return }
    this.raidElapsed += dt; this.timeLeft -= dt; this.grace -= dt; this.fireCooldown -= dt; this.hitMarker = Math.max(0, this.hitMarker - dt); this.damageFlash = Math.max(0, this.damageFlash - dt); this.messageTime = Math.max(0, this.messageTime - dt); this.muzzleTime = Math.max(0, this.muzzleTime - dt)
    const look = this.input.consumeLook(); this.yaw += look.yaw; this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch, -1.42, 1.42)
    if (this.input.consumeAction("Escape")) { this.pause(); this.callbacks.onPause(); return }
    if (this.input.consumeAction("Tab")) { this.pause(); this.callbacks.onInventory(); return }
    if (this.input.consumeAction("KeyR")) this.startReload()
    if (this.input.consumeAction("KeyQ")) this.heal()
    this.updateMovement(dt); this.updateWeapon(dt); this.updateInteraction(dt)
    for (const enemy of this.enemies) enemy.update(dt, this.player, this.grace, (e, damage) => this.enemyShoot(e, damage))
    for (const crate of this.loot) crate.update(this.raidElapsed)
    this.effects.update(dt)
    if (this.health <= 0) this.finish(false, "Operator im Einsatz ausgeschaltet")
    else if (this.timeLeft <= 0) this.finish(false, "Evakuierungsfenster verstrichen")
    this.hudClock -= dt; if (this.hudClock <= 0) { this.hudClock = 0.08; this.pushHud() }
  }

  private updateMovement(dt: number): void {
    const length = Math.hypot(this.input.moveX, this.input.moveZ) || 1
    const mx = this.input.moveX / length, mz = this.input.moveZ / length
    const speed = this.input.sprintHeld && this.input.moveZ > 0 && !this.input.adsHeld ? 7.2 : this.input.adsHeld ? 3.2 : 4.8
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
    const dx = (mx * cos - mz * sin) * speed * dt, dz = (-mx * sin - mz * cos) * speed * dt
    if (!collides(this.player.x + dx, this.player.z, 0.38, this.world.obstacles)) this.player.x += dx
    if (!collides(this.player.x, this.player.z + dz, 0.38, this.world.obstacles)) this.player.z += dz
  }

  private updateWeapon(dt: number): void {
    if (this.reloadTime > 0) { this.reloadTime -= dt; if (this.reloadTime <= 0) { const needed = 30 - this.ammo, amount = Math.min(needed, this.reserve); this.ammo += amount; this.reserve -= amount; this.audio.sfx("reload") } }
    const firePressed = this.input.consumeAction("Fire")
    if ((this.input.fireHeld || firePressed) && this.reloadTime <= 0 && this.fireCooldown <= 0) this.shoot()
    this.recoil = Math.max(0, this.recoil - dt * 4.5)
  }

  private shoot(): void {
    if (this.ammo <= 0) { this.fireCooldown = 0.25; this.audio.sfx("empty"); if (this.reserve > 0) this.startReload(); return }
    this.ammo--; this.fireCooldown = 0.105; this.recoil = Math.min(0.14, this.recoil + 0.035); this.pitch = Math.min(1.42, this.pitch + 0.006); this.muzzleTime = 0.045
    this.audio.sfx("shot"); this.raycaster.setFromCamera(_center, this.camera); this.raycaster.far = 90
    const targets: THREE.Object3D[] = [...this.world.blockers]; for (const e of this.enemies) if (e.alive) targets.push(...e.hitMeshes)
    const hits = this.raycaster.intersectObjects(targets, false); const end = _v1.copy(this.raycaster.ray.direction).multiplyScalar(90).add(this.raycaster.ray.origin)
    if (hits.length) {
      const hit = hits[0]; end.copy(hit.point); const enemy = hit.object.userData.enemy as Enemy | null
      if (enemy) {
        const damage = this.company.profile.research.includes("ballistics") ? 40 : 34
        const killed = enemy.takeDamage(damage, hit.object.userData.part === "head"); this.hitMarker = 0.13; this.audio.sfx("hit")
        if (killed) { this.kills++; this.message = hit.object.userData.part === "head" ? "Kopfschuss · Ziel neutralisiert" : "Ziel neutralisiert"; this.messageTime = 1.2 }
      }
    }
    this.effects.tracer(this.muzzle.getWorldPosition(_v2), end)
    for (const enemy of this.enemies) enemy.hear(this.player)
  }

  private startReload(): void { if (this.reloadTime > 0 || this.ammo >= 30 || this.reserve <= 0) return; this.reloadTime = 1.65; this.audio.sfx("reload") }
  private heal(): void { if (this.medkits <= 0 || this.health >= 100 || this.ended) return; this.medkits--; this.health = Math.min(100, this.health + 45); this.audio.sfx("heal"); this.message = "Trauma-Set angewendet · +45 Gesundheit"; this.messageTime = 1.8 }

  private updateInteraction(dt: number): void {
    this.nearLoot = null; let nearest = 2.65
    for (const crate of this.loot) if (!crate.collected) { const distance = crate.group.position.distanceTo(this.player); if (distance < nearest) { nearest = distance; this.nearLoot = crate } }
    this.inExtraction = this.player.distanceTo(this.world.extraction) < 3.8
    const ready = this.collected >= MISSIONS[this.mission].lootRequired
    this.interaction = this.nearLoot ? "E · Versorgungskiste bergen" : this.inExtraction ? ready ? "E halten · Extraktion bestätigen" : `Noch ${MISSIONS[this.mission].lootRequired - this.collected} Kisten erforderlich` : ""
    if (this.input.consumeAction("KeyE") && this.nearLoot) this.collectCrate(this.nearLoot)
    if (this.inExtraction && ready && this.input.isHeld("KeyE")) {
      this.extractionProgress += dt; if (this.extractionProgress >= 3) this.finish(true, "Beute gesichert · Operator extrahiert")
    } else this.extractionProgress = Math.max(0, this.extractionProgress - dt * 1.8)
  }

  private collectCrate(crate: LootCrate): void {
    const contents = crate.collect(); this.collected++
    for (const stack of contents) this.raidLoot[stack.id] = (this.raidLoot[stack.id] || 0) + stack.qty
    this.audio.sfx("pickup"); this.message = `Bergungsgut gesichert · ${this.collected}/${MISSIONS[this.mission].lootRequired}`; this.messageTime = 2
    if (this.collected === MISSIONS[this.mission].lootRequired) { this.message = "Extraktion freigegeben · Südöstlicher Evakuierungspunkt"; this.messageTime = 4 }
  }

  private enemyShoot(enemy: Enemy, damage: number): void {
    this.audio.sfx("enemyShot"); const start = enemy.muzzlePosition(_v1); const end = _v2.copy(this.player).add(_v3.set(0, 1.35, 0))
    if (damage <= 0) { end.x += enemy.group.id % 2 ? 2.5 : -2.5; end.y += 1; this.effects.tracer(start, end, true); return }
    this.effects.tracer(start, end, true)
    const absorbed = Math.min(this.armor, damage * 0.65); this.armor -= absorbed; this.health -= damage - absorbed; this.damageFlash = 0.32; this.audio.sfx("hurt")
  }

  private finish(success: boolean, reason: string): void {
    if (this.ended) return
    this.ended = true; this.paused = true; if (document.pointerLockElement) document.exitPointerLock()
    const loot = Object.entries(this.raidLoot).map(([id, qty]) => ({ id: id as ItemId, qty: qty || 0 }))
    const potentialValue = loot.reduce((sum, s) => sum + ITEMS[s.id].value * s.qty, 0)
    let reward = 0, resources = 0
    const remainingPacks = success ? Math.ceil((this.reserve + this.ammo) / 30) : Math.floor(this.reserve / 60)
    this.company.profile.stash.ammo += remainingPacks
    if (success) {
      reward = MISSIONS[this.mission].reward; resources = MISSIONS[this.mission].resources
      this.company.profile.loadout.medkits = this.medkits; this.company.profile.loadout.armor = Math.min(55, Math.round(this.armor))
      this.company.applyExtraction(this.mission, this.raidLoot, this.kills, reward, resources); this.audio.sfx("win")
    } else { this.company.applyFailure(this.kills); this.audio.sfx("lose") }
    const result: RaidResult = { success, reason, mission: this.mission, kills: this.kills, loot: success ? loot : [], value: success ? potentialValue : 0, reward, resources, duration: this.raidElapsed }
    this.callbacks.onEnd(result)
  }

  private render(): void {
    if (!this.active) {
      const t = this.attractTime * 0.055; this.camera.position.set(Math.sin(t) * 47, 24 + Math.sin(t * 2) * 2, Math.cos(t) * 47); this.camera.lookAt(0, 2, 0); this.world.extractionRing.rotation.z = this.attractTime * 0.2
      for (const crate of this.loot) crate.update(this.attractTime)
    } else {
      const moving = Math.abs(this.input.moveX) + Math.abs(this.input.moveZ) > 0 && !this.paused
      const bob = moving ? Math.sin(this.raidElapsed * (this.input.sprintHeld ? 14 : 10)) * 0.035 : 0
      this.camera.position.set(this.player.x, 1.72 + bob, this.player.z); this.camera.rotation.order = "YXZ"; this.camera.rotation.set(this.pitch, this.yaw, 0)
      const ads = this.input.adsHeld && !this.paused; const targetFov = ads ? 53 : 74; this.camera.fov += (targetFov - this.camera.fov) * 0.18; this.camera.updateProjectionMatrix()
      this.weapon.position.x += ((ads ? 0 : 0.28) - this.weapon.position.x) * 0.18
      this.weapon.position.y = -0.27 - bob * 0.5 - this.recoil * 0.25; this.weapon.position.z = -0.48 + this.recoil
      this.weapon.rotation.z = this.reloadTime > 0 ? Math.sin((1.65 - this.reloadTime) * Math.PI / 1.65) * 0.65 : 0
      this.muzzle.visible = this.muzzleTime > 0; this.muzzleLight.intensity = this.muzzleTime > 0 ? 7 : 0
      this.world.extractionRing.rotation.z = this.raidElapsed * 0.35
      const ringMat = this.world.extractionRing.material as THREE.MeshBasicMaterial; ringMat.color.setHex(this.collected >= MISSIONS[this.mission].lootRequired ? 0x66e0b4 : 0xe9b85e)
    }
    this.renderer.render(this.scene, this.camera); window.__GAME_READY__ = true
  }

  private pushHud(): void {
    const required = MISSIONS[this.mission].lootRequired, ready = this.collected >= required
    this.callbacks.onHud({ health: Math.max(0, Math.ceil(this.health)), armor: Math.max(0, Math.ceil(this.armor)), ammo: this.ammo, reserve: this.reserve, medkits: this.medkits, reloading: Math.max(0, this.reloadTime), objective: ready ? "Extraktion erreichen" : "Versorgungskisten bergen", objectiveProgress: ready ? "EVAKUIERUNG FREIGEGEBEN" : `${this.collected} / ${required}`, lootValue: Object.entries(this.raidLoot).reduce((sum, [id, qty]) => sum + ITEMS[id as ItemId].value * (qty || 0), 0), raidTime: Math.max(0, this.timeLeft), extraction: this.extractionProgress / 3, interaction: this.interaction, enemies: this.enemies.filter(e => e.alive).length, hitMarker: this.hitMarker, damageFlash: this.damageFlash, compass: ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360, message: this.message, messageTime: this.messageTime })
  }

  getRaidLoot(): LootStack[] { return Object.entries(this.raidLoot).map(([id, qty]) => ({ id: id as ItemId, qty: qty || 0 })) }
  getSnapshot(): GameSnapshot { return { screen: "playing", player: asVec3(this.player), health: this.health, enemiesAlive: this.enemies.filter(e => e.alive).length, lootCollected: this.collected, raidLoot: this.getRaidLoot(), extractionReady: this.collected >= MISSIONS[this.mission].lootRequired, extractionProgress: this.extractionProgress, result: null, fps: this.fps, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles } }
  debugTeleport(x: number, z: number): void { this.player.set(x, 0, z) }
  debugCollectNext(): void { const crate = this.loot.find(l => !l.collected); if (crate) this.collectCrate(crate) }
  debugDamage(amount: number): void { this.health -= amount; this.damageFlash = 0.3 }
  debugAimAtEnemy(): void { const enemy = this.enemies.find(e => e.alive); if (!enemy) return; const target = enemy.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)); const origin = this.player.clone().add(new THREE.Vector3(0, 1.72, 0)); const d = target.sub(origin); this.yaw = Math.atan2(-d.x, -d.z); this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) }
  debugEliminateOne(): void { const enemy = this.enemies.find(e => e.alive); if (enemy) { enemy.takeDamage(999, false); this.kills++ } }
  applySettings(settings: Settings): void { this.settings = settings; if (this.input) { this.input.sensitivity = settings.sensitivity; this.input.invertY = settings.invertY } this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === "high" ? 1.75 : 1)); this.renderer.shadowMap.enabled = settings.quality === "high" }
  dispose(): void { this.loop.stop(); this.pause(); window.removeEventListener("resize", this.onResize); document.removeEventListener("pointerlockchange", this.onPointerLock); this.input.dispose(); this.effects.dispose(); this.world.dispose(); this.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) m.dispose() } }); this.renderer.dispose() }
}

const _center = new THREE.Vector2(0, 0), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _farPlayer = new THREE.Vector3(999, 0, 999)
