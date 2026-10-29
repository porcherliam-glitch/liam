/**
 * boot.ts — creates the company, audio, 3D game and UI and wires them together. startGame() stops any previous
 * session first; stopGame() releases loop, listeners and GPU resources.
 * window.__ironVeil exposes a test API used by the browser verification scripts.
 */
import { AudioSystem } from "./audio"
import type { InfectedKind } from "./infectedData"
import { ITEM_IDS, type ItemId } from "./items"
import { warmIcons } from "./icons"
import { Company, createProfile } from "./profile"
import { RaidGame } from "./raid"
import { clearProfile, loadProfile, loadSettings, saveSettings } from "./storage"
import type { EnemyKind, GameSnapshot, Profile, RaidPlan } from "./types"
import { GameUI } from "./ui"
import { baseLayout, zoneLayout } from "./world"

declare global {
  interface Window {
    __ironVeil?: {
      snapshot: () => GameSnapshot & { screen: string; hud: unknown }
      enterBase: () => void
      deploy: (plan?: Partial<RaidPlan>) => void
      defend: () => void
      teleport: (x: number, z: number) => void
      damage: (amount: number) => void
      aimAt: (x: number, y: number, z: number) => void
      lookAt: (x: number, z: number, y?: number) => void
      nearest: (faction?: "merc" | "infected") => { x: number; y: number; z: number; kind: string; faction: string; health: number; head: { x: number; y: number; z: number }; chest: { x: number; y: number; z: number } } | null
      spawnInfected: (kind: InfectedKind, distance: number) => void
      spawnMerc: (kind: EnemyKind, distance: number) => void
      killAllInfected: () => void
      godMode: (on: boolean) => void
      containers: () => { x: number; z: number; kind: string }[]
      exits: () => { id: string; x: number; z: number; r: number; kind: string; requirement: unknown }[]
      give: (id: ItemId, qty: number) => number
      grant: (id: ItemId, qty: number) => void
      vitals: () => unknown
      weapon: () => unknown
      defense: () => unknown
      profile: () => Profile
      screen: () => string
      setThreat: (threat: number, pending: boolean) => void
      stations: () => { id: string; x: number; z: number }[]
      toMenu: () => void
      splatter: (amount: number) => void
    }
  }
}

let session: { dispose(): void } | null = null

export function startGame(canvas: HTMLCanvasElement, uiHost: HTMLElement): void {
  stopGame()
  const company = new Company(loadProfile() || createProfile())
  const recovered = company.recoverInterruptedRaid()
  company.tick(); company.save()
  const settings = loadSettings()
  const audio = new AudioSystem(); audio.setMuted(settings.muted); audio.setVolume(settings.volume)
  let raid: RaidGame | null = null
  const ui = new GameUI(uiHost, company, settings, audio, {
    enterBase: () => raid?.enterBase(),
    resume: () => raid?.resume(),
    abort: () => raid?.abort(),
    toMenu: () => raid?.showMenu(),
    deploy: plan => raid?.startRaid(plan),
    defend: () => raid?.startDefense(),
    settingsChanged: next => { saveSettings(next); audio.setMuted(next.muted); audio.setVolume(next.volume); raid?.applySettings(next) },
    newCompany: () => { clearProfile(); company.profile = createProfile(); company.tick(); company.save(); raid?.showMenu(); ui.showMenu(); ui.notify("Neue Truppe aufgestellt") },
    zone: () => zoneLayout(),
    raidStatus: () => raid!.raidStatus(),
    mapData: () => raid!.mapData(),
    useItem: index => { const s = raid!.raidStatus().bag.items[index]; return !!s && raid!.useItemNow(s.id) },
    dropItem: index => raid?.dropSlot(index),
    toSecure: index => raid?.moveToSecure(index) ?? false,
    fromSecure: index => raid?.moveFromSecure(index) ?? false,
    structuresChanged: () => raid?.refreshBase(),
    mode: () => raid?.currentMode ?? "menu",
  })
  raid = new RaidGame(canvas, company, settings, audio, {
    onHud: hud => ui.updateHud(hud),
    onEnd: result => ui.showResult(result),
    onPause: () => ui.showPause(),
    onInventory: () => ui.showRaidInventory(),
    onMap: () => ui.showMap(),
    onLoot: session => ui.showLoot(session),
    onStation: (id, structure) => ui.openStation(id, structure),
    onDefenseEnd: (won, kills) => { const r = company.finishDefense(won, kills); raid?.showMenu(); ui.showMenu(); ui.notify(r.message) },
  })
  const game = raid
  game.screenBlood = amount => ui.hud.splatter(amount)
  // the first raid stutters on high quality: drop to low once and remember it
  game.onSlow = () => { if (settings.quality !== "high") return; settings.quality = "low"; saveSettings(settings); game.applySettings(settings) }
  if (recovered) ui.notify(recovered)
  // icons are rendered from the 3D models; prepare them while the player looks at the menu
  window.setTimeout(() => warmIcons(ITEM_IDS), 1500)

  const onGlobalKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return
    if (event.code === "Tab") event.preventDefault()
    if (event.repeat) return
    const screen = ui.currentScreen
    if (screen === "loot") {
      if (event.code === "KeyF") { event.preventDefault(); ui.lootAll() }
      else if (event.code === "KeyE" || event.code === "Escape" || event.code === "Tab") { event.preventDefault(); ui.closeActiveOverlay() }
    } else if (screen === "raidInventory") {
      // closing in-raid overlays with the key that opened them (a key press allows re-locking the pointer)
      if (event.code === "Tab" || event.code === "KeyM" || event.code === "Escape") { event.preventDefault(); ui.closeActiveOverlay() }
    } else if (screen !== "playing" && screen !== "paused" && screen !== "menu" && screen !== "result") {
      if (event.code === "Escape" || event.code === "Tab") { event.preventDefault(); ui.back() }
    }
  }
  window.addEventListener("keydown", onGlobalKey)
  window.__gameProbe = () => { const p = game.getSnapshot().player; return { x: p.x, y: p.y, z: p.z } }
  const pos = (v: { x: number; y: number; z: number }) => ({ x: v.x, y: v.y, z: v.z })
  window.__ironVeil = {
    snapshot: () => ({ ...game.getSnapshot(), screen: ui.currentScreen, hud: ui.hud.snapshot }),
    enterBase: () => { ui.showPlaying(); game.enterBase() },
    deploy: (plan = {}) => { ui.showPlaying(); game.startRaid({ insertion: plan.insertion ?? zoneLayout().insertions[0].id, time: plan.time ?? "day", contracts: plan.contracts ?? company.profile.contracts.active.map(c => c.id) }) },
    defend: () => { ui.showPlaying(); game.startDefense() },
    teleport: (x, z) => game.debug.teleport(x, z), damage: amount => game.debug.damage(amount),
    aimAt: (x, y, z) => game.debug.aimAt(x, y, z), lookAt: (x, z, y) => game.debug.lookAt(x, z, y),
    nearest: faction => {
      const t = game.debug.nearestHostile(faction); if (!t) return null
      return { ...pos(t.position), kind: t.kind, faction: t.faction, health: t.health, head: pos(t.headPosition(t.position.clone())), chest: pos(t.chestPosition(t.position.clone())) }
    },
    spawnInfected: (kind, d) => { game.debug.spawnInfected(kind, d) }, spawnMerc: (kind, d) => game.debug.spawnMerc(kind, d),
    killAllInfected: () => game.debug.killAllInfected(), godMode: on => game.debug.setGodMode(on),
    containers: () => game.debug.containers(), exits: () => game.debug.exits(),
    give: (id, qty) => game.debug.give(id, qty), grant: (id, qty) => { company.addItem(id, qty); company.save() },
    vitals: () => game.debug.vitals(), weapon: () => game.debug.weapon(), defense: () => game.debug.defense(),
    profile: () => JSON.parse(JSON.stringify(company.profile)),
    screen: () => ui.currentScreen,
    stations: () => baseLayout().stations.map(s => ({ id: s.id, x: s.x, z: s.z })),
    toMenu: () => { game.leaveToMenu(); ui.showMenu() },
    splatter: amount => game.debug.splatter(amount),
    setThreat: (threat, pending) => { company.profile.base.threat = threat; company.profile.base.attackPending = pending; company.save() },
  }
  session = { dispose: () => { window.removeEventListener("keydown", onGlobalKey); game.dispose(); ui.dispose(); audio.dispose(); delete window.__gameProbe; delete window.__ironVeil; window.__GAME_READY__ = false } }
}

export function stopGame(): void { session?.dispose(); session = null }
