// Top-level game: renderer, input, audio, UI, profiles and the switch between menu, camp and expedition.

import * as THREE from "three"
import { Input } from "../input/input"
import { AudioEngine } from "../audio/audio"
import { UI } from "../ui/ui"
import type { GameApi, ExpeditionApi } from "./api"
import { DEFAULT_SETTINGS, RARITIES, type Profile, type Settings, type ItemInstance } from "../core/types"
import { createProfile, deleteProfile, exportProfile, importProfile, listProfiles, loadProfile, loadSettings, saveProfile, saveSettings } from "../meta/profile"
import { MainMenuScreen, PauseScreen, ResultsScreen, type RunSummary } from "../ui/screens/menus"
import { CampScreen } from "../ui/screens/camp"
import { InventoryScreen } from "../ui/screens/inventory"
import { RunMapScreen } from "../ui/screens/runmap"
import { Expedition } from "./expedition"
import { CampScene } from "../render/campScene"
import { generateStock, type MerchantStock } from "../items/merchant"
import { areaDef, areasUnlockedBy } from "../world/areas"
import { applyXp } from "../meta/progression"
import { campBonuses } from "../meta/campData"
import { skillBonuses } from "../meta/skillData"
import { countItem, removeItem, resizeInventory } from "../items/inventory"
import { events } from "../core/events"
import { itemDef } from "../items/itemData"
import { createItem } from "../items/items"

export const VERSION = "1.0.0"

type State = "menu" | "camp" | "expedition"

export class Game implements GameApi {
  readonly renderer: THREE.WebGLRenderer
  readonly input: Input
  readonly audio = new AudioEngine()
  readonly ui: UI
  settings: Settings = loadSettings()
  profile: Profile | null = null
  expedition: Expedition | null = null
  state: State = "menu"
  readonly version = VERSION
  private campScene: CampScene
  private stock: MerchantStock | null = null
  private last = performance.now()
  private running = true
  private resultPending: RunSummary | null = null
  /** Tests can raise this to let the simulation catch up when rendering is slow. */
  maxFrame = 0.05
  private unsub: (() => void)[] = []

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.settings.quality !== "low", powerPreference: "high-performance" })
    this.renderer.shadowMap.enabled = this.settings.shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.input = new Input(canvas)
    this.ui = new UI(this.input, this.audio)
    this.campScene = new CampScene(this.settings.shadows)
    this.applySettings()
    window.addEventListener("resize", () => this.resize())
    this.resize()
    const unlock = () => this.audio.unlock()
    window.addEventListener("pointerdown", unlock)
    window.addEventListener("keydown", unlock)
    document.addEventListener("pointerlockchange", () => {
      // Esc releases the pointer lock before we see the key: treat that as "pause".
      if (this.state === "expedition" && this.expedition && !this.input.locked && this.ui.depth === 0 && !this.expedition.player.dead) this.openPause()
    })
    this.unsub.push(
      events.on("toast", (e) => this.ui.toast(e.text, e.kind)),
      events.on("levelUp", (e) => {
        this.ui.toast(`Stufe ${e.level} erreicht! Ein Fähigkeitspunkt wartet.`, "good")
        this.audio.play("level_up")
      }),
    )
    this.goToMainMenu()
    requestAnimationFrame(this.frame)
  }

  // ---- settings ------------------------------------------------------------------------------

  applySettings(): void {
    const s = this.settings
    this.audio.masterVolume = s.masterVolume
    this.audio.sfxVolume = s.sfxVolume
    this.audio.musicVolume = s.musicVolume
    this.audio.applyVolumes()
    this.input.mouseSensitivity = s.lookSensitivity
    this.input.padSensitivity = s.gamepadSensitivity
    this.input.invertY = s.invertY
    this.input.vibration = s.vibration
    this.input.deadzone = s.deadzone
    this.renderer.shadowMap.enabled = s.shadows
    this.renderer.setPixelRatio(s.quality === "low" ? Math.min(1, window.devicePixelRatio) : s.quality === "medium" ? Math.min(1.25, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio))
    this.expedition?.applySettings()
    document.body.classList.toggle("no-gore", !s.gore)
  }

  saveSettings(): void {
    saveSettings(this.settings)
  }

  private resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.campScene.resize(w / h)
    this.expedition?.resize(w, h)
  }

  // ---- profiles -------------------------------------------------------------------------------

  listProfiles(): (Profile | null)[] {
    return listProfiles()
  }

  createProfile(slot: number, name: string, classId: Profile["classId"]): void {
    this.profile = createProfile(slot, name, classId)
    saveProfile(this.profile)
    this.stock = null
    this.goToCamp()
    this.ui.toast(`Willkommen im Lager, ${this.profile.name}. Rüste dich und brich zum Verlassenen Dorf auf.`, "good")
  }

  loadProfile(slot: number): void {
    const p = loadProfile(slot)
    if (!p) return
    this.profile = p
    resizeInventory(p.loadout, campBonuses(p.camp).bagSlots)
    this.stock = null
    this.goToCamp()
  }

  deleteProfile(slot: number): void {
    deleteProfile(slot)
    if (this.profile?.slot === slot) this.profile = null
  }

  saveProfile(): void {
    if (this.profile) saveProfile(this.profile)
  }

  exportProfile(): void {
    if (!this.profile) return
    const blob = new Blob([exportProfile(this.profile)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `last-kingdom-${this.profile.name}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    this.ui.toast("Spielstand exportiert.", "good")
  }

  importProfile(json: string, slot: number): boolean {
    const p = importProfile(json, slot)
    if (!p) return false
    saveProfile(p)
    return true
  }

  merchantStock(): MerchantStock {
    if (!this.stock || Date.now() > this.stock.refreshAt) this.refreshMerchant()
    return this.stock!
  }

  refreshMerchant(): void {
    this.stock = generateStock(this.profile!, (Date.now() & 0xffffff) ^ (this.profile!.slot * 7919))
  }

  // ---- state changes -------------------------------------------------------------------------

  goToMainMenu(): void {
    this.endExpeditionObject()
    this.state = "menu"
    this.ui.popAll()
    this.ui.push(new MainMenuScreen(this))
    this.audio.setMusic("menu")
    this.input.wantPointerLock = false
    this.input.releaseLock()
    this.campScene.build(this.profile)
  }

  goToCamp(): void {
    this.endExpeditionObject()
    this.state = "camp"
    this.ui.popAll()
    this.ui.push(new CampScreen(this))
    this.audio.setMusic("menu")
    this.input.wantPointerLock = false
    this.input.releaseLock()
    this.campScene.build(this.profile)
    this.saveProfile()
  }

  startExpedition(areaId: string): void {
    if (!this.profile) return
    this.ui.popAll()
    this.state = "expedition"
    this.audio.unlock()
    this.expedition = new Expedition(this.profile, areaId, this.input, this.audio, this.settings, this.ui, this.renderer, {
      onEnd: (r) => this.onExpeditionEnd(r),
      openPause: () => this.openPause(),
      openInventory: () => this.openInventory(),
    })
    this.resize()
    this.input.wantPointerLock = true
    this.input.requestLock()
  }

  private openPause(): void {
    if (!this.expedition || this.ui.depth > 0) return
    this.input.releaseLock()
    this.ui.push(new PauseScreen(this, () => this.openInventory(), () => this.ui.push(new RunMapScreen(this, areaDef(this.expedition!.areaId).name))))
  }

  private openInventory(): void {
    if (!this.expedition) return
    this.input.releaseLock()
    this.ui.push(new InventoryScreen(this, "expedition"))
  }

  resumeExpedition(): void {
    if (!this.expedition) return
    this.ui.popAll()
    this.input.requestLock()
  }

  private endExpeditionObject(): void {
    if (this.expedition) {
      this.expedition.dispose()
      this.expedition = null
    }
  }

  private onExpeditionEnd(r: { success: boolean; extractionName?: string; cause?: string }): void {
    const e = this.expedition!
    const p = this.profile!
    const area = areaDef(e.areaId)
    const inv = p.loadout
    const bonuses = campBonuses(p.camp)
    const skills = skillBonuses(p.skills)
    const insured = bonuses.insuredSlots + skills.insurance
    const lootKept: ItemInstance[] = []
    const lootLost: ItemInstance[] = []
    const missionsDone = []
    let gold = e.runGold
    let xp = e.runXp
    if (r.success) {
      p.gold += gold
      p.stats.goldEarned += gold
      p.stats.extractions++
      // Collect / resources missions: hand the items over now
      for (const m of e.missions) {
        if ((m.kind === "collect" || m.kind === "resources") && m.status === "active" && m.targetId && countItem(inv, m.targetId) >= m.goal) {
          removeItem(inv, m.targetId, m.goal)
          m.status = "completed"
          m.progress = m.goal
          missionsDone.push(m)
        } else if (m.status === "completed") missionsDone.push(m)
      }
      for (const s of inv.slots) if (s) lootKept.push(s)
      for (const id of areasUnlockedBy(area.id)) if (!p.unlockedAreas.includes(id)) {
        p.unlockedAreas.push(id)
        this.ui.toast(`Neues Gebiet freigeschaltet: ${areaDef(id).name}`, "good")
      }
      xp += 50 + area.danger * 30
    } else {
      // Death: unsecured items are lost
      xp = Math.round(xp * 0.5)
      for (let i = 0; i < inv.slots.length; i++) {
        const s = inv.slots[i]
        if (!s) continue
        if (i < insured || itemDef(s.defId).kind === "quest") lootKept.push(s)
        else {
          lootLost.push(s)
          inv.slots[i] = null
        }
      }
      for (const slot of ["mainHand", "offHand", "head", "body", "quick1", "quick2", "quick3", "quick4"] as const) {
        const it = inv.equipment[slot]
        if (!it) continue
        if (slot === "mainHand" && bonuses.keepWeaponOnDeath) {
          lootKept.push(it)
          continue
        }
        lootLost.push(it)
        inv.equipment[slot] = null
      }
      // Rags so the character is not naked
      if (!inv.equipment.body) inv.equipment.body = createItem("armor_rags")
      for (const m of e.missions) {
        if (m.status === "active" && m.areaId === area.id && m.kind !== "bossHunt") m.progress = 0
        if (m.status === "completed") missionsDone.push(m)
      }
      gold = e.runGold
    }
    const levels = applyXp(p, xp)
    if (levels > 0) events.emit("levelUp", { level: p.level })
    const best = RARITIES[e.bestRarity]
    if (RARITIES.indexOf(best) > RARITIES.indexOf(p.stats.bestLoot)) p.stats.bestLoot = best
    this.resultPending = {
      success: r.success,
      areaName: area.name,
      extractionName: r.extractionName,
      cause: r.cause,
      elapsed: e.elapsed,
      kills: e.kills,
      bossKills: e.bossKills,
      xp,
      gold,
      levelsGained: levels,
      lootKept,
      lootLost,
      missionsDone,
      bestRarity: best,
    }
    saveProfile(p)
    this.endExpeditionObject()
    this.state = "camp"
    this.ui.popAll()
    this.input.wantPointerLock = false
    this.input.releaseLock()
    this.campScene.build(this.profile)
    this.ui.push(new ResultsScreen(this, this.resultPending))
    this.audio.setMusic("menu")
  }

  // ---- loop -----------------------------------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return
    const rawDt = Math.min(this.maxFrame, Math.max(0.001, (now - this.last) / 1000))
    this.last = now
    this.input.update(rawDt)
    this.ui.update(rawDt)
    if (this.state === "expedition" && this.expedition) {
      this.expedition.update(rawDt)
      // Keep the pointer captured during play
      if (this.ui.depth === 0 && this.input.wantPointerLock && !this.input.locked && this.input.anyKeyThisFrame) this.input.requestLock()
    } else {
      this.campScene.update(rawDt, this.renderer)
      this.audio.setListener(0, 2, 0, 0)
      this.audio.updateAmbience(rawDt, 0.3, 0, true, false, 0)
    }
    this.input.endFrame()
    requestAnimationFrame(this.frame)
  }

  /** Expedition accessor for the UI contract. */
  get expeditionApi(): ExpeditionApi | null {
    return this.expedition
  }

  destroy(): void {
    this.running = false
    for (const u of this.unsub) u()
  }
}

export { DEFAULT_SETTINGS }
