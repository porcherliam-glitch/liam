/**
 * boot.ts — creates the company, audio, 3D game and UI and wires them together. startGame() stops any previous
 * session first; stopGame() releases loop, listeners and GPU resources.
 * window.__ironVeil exposes a small test API used by the browser verification scripts.
 */
import { AudioSystem } from "./audio"
import { Company, createProfile } from "./profile"
import { RaidGame, mulberry32, pickContract } from "./raid"
import { clearProfile, loadProfile, loadSettings, saveSettings } from "./storage"
import type { GameSnapshot, MissionId, Profile } from "./types"
import { GameUI } from "./ui"

declare global {
  interface Window {
    __ironVeil?: {
      snapshot: () => GameSnapshot & { screen: string; hud: unknown }
      start: (id?: MissionId) => void
      collect: () => void
      teleport: (x: number, z: number) => void
      damage: (amount: number) => void
      aim: (head?: boolean) => boolean
      placeEnemy: (distance: number) => boolean
      eliminate: () => void
      extraction: () => { x: number; z: number; r: number }
      crates: () => { x: number; z: number }[]
      lookAt: (x: number, z: number, y?: number) => void
      godMode: (on: boolean) => void
      enemies: () => unknown
      weapon: () => unknown
      profile: () => Profile
    }
  }
}

let session: { dispose(): void } | null = null

export function startGame(canvas: HTMLCanvasElement, uiHost: HTMLElement): void {
  stopGame()
  const company = new Company(loadProfile() || createProfile())
  company.tick(); company.save()
  const settings = loadSettings()
  const audio = new AudioSystem(); audio.setMuted(settings.muted); audio.setVolume(settings.volume)
  const contractRng = mulberry32(Date.now() >>> 0)
  let raid: RaidGame
  const ui = new GameUI(uiHost, company, settings, audio, {
    deploy: (id, contract) => raid.startMission(id, contract),
    previewMission: id => raid.setMenuMission(id),
    resume: () => raid.resume(), abort: () => raid.abort(),
    returnToMenu: () => raid.returnToMenu(), getRaidLoot: () => raid.getRaidLoot(), getRaidStatus: () => raid.getRaidStatus(), getMapData: () => raid.mapData(),
    settingsChanged: next => { saveSettings(next); audio.setMuted(next.muted); audio.setVolume(next.volume); raid.applySettings(next) },
    newCompany: () => { clearProfile(); company.profile = createProfile(); company.save(); raid.returnToMenu(); ui.showMenu(); ui.notify("Neues Unternehmen gegründet") },
    pickContract: id => pickContract(id, contractRng),
  })
  raid = new RaidGame(canvas, company, settings, audio, {
    onHud: hud => ui.updateHud(hud), onEnd: result => ui.showResult(result), onPause: () => ui.showPause(), onInventory: () => ui.showRaidInventory(), onMap: () => ui.showMap(),
  })

  const onGlobalKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return
    const screen = ui.currentScreen
    if (event.code === "Space" && screen === "menu") { event.preventDefault(); ui.quickDeploy() }
    // closing in-raid overlays with the key that opened them (a key press allows re-locking the pointer)
    else if ((event.code === "Tab" || event.code === "KeyM") && screen === "raidInventory") { event.preventDefault(); ui.showPlaying(); raid.resume() }
    else if (event.code === "Tab" && screen !== "playing") event.preventDefault()
  }
  window.addEventListener("keydown", onGlobalKey)
  window.__gameProbe = () => { const p = raid.getSnapshot().player; return { x: p.x, y: p.y, z: p.z } }
  window.__ironVeil = {
    snapshot: () => ({ ...raid.getSnapshot(), screen: ui.currentScreen, hud: ui.hud.snapshot }),
    start: (id = "greyzone") => { ui.showPlaying(); raid.startMission(id, null) },
    collect: () => raid.debug.collectNext(), teleport: (x, z) => raid.debug.teleport(x, z), damage: amount => raid.debug.damage(amount),
    aim: head => raid.debug.aimAtEnemy(head), placeEnemy: d => raid.debug.placeEnemy(d), eliminate: () => raid.debug.eliminateOne(),
    extraction: () => raid.debug.extractionPoint(), crates: () => raid.debug.crates(), lookAt: (x, z, y) => raid.debug.lookAt(x, z, y), godMode: on => raid.debug.setGodMode(on), enemies: () => raid.debug.enemies(), weapon: () => raid.debug.weapon(),
    profile: () => JSON.parse(JSON.stringify(company.profile)),
  }
  session = { dispose: () => { window.removeEventListener("keydown", onGlobalKey); raid.dispose(); ui.dispose(); audio.dispose(); delete window.__gameProbe; delete window.__ironVeil; window.__GAME_READY__ = false } }
}

export function stopGame(): void { session?.dispose(); session = null }
