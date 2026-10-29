import { AudioSystem } from "./audio"
import { Company, createProfile } from "./profile"
import { RaidGame } from "./raid"
import { loadProfile, loadSettings, saveSettings } from "./storage"
import type { GameSnapshot, MissionId } from "./types"
import { GameUI } from "./ui"

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number }
    __GAME_READY__?: boolean
    __ironVeil?: {
      snapshot: () => GameSnapshot & { screen: string }
      start: (id?: MissionId) => void
      collect: () => void
      teleport: (x: number, z: number) => void
      damage: (amount: number) => void
      aim: () => void
      eliminate: () => void
      profile: () => unknown
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
  let raid: RaidGame
  const ui = new GameUI(uiHost, company, settings, audio, {
    deploy: id => raid.startMission(id), resume: () => raid.resume(), abort: () => raid.abort(),
    returnToMenu: () => raid.returnToMenu(), getRaidLoot: () => raid.getRaidLoot(),
    settingsChanged: next => { saveSettings(next); audio.setMuted(next.muted); audio.setVolume(next.volume); raid.applySettings(next) },
    newCompany: () => { company.profile = createProfile(); company.save(); raid.returnToMenu(); ui.showMenu(); ui.notify("Neues Unternehmen gegründet") },
  })
  raid = new RaidGame(canvas, company, settings, audio, {
    onHud: hud => ui.updateHud(hud), onEnd: result => ui.showResult(result), onPause: () => ui.showPause(), onInventory: () => ui.showRaidInventory(),
  })

  const onGlobalKey = (event: KeyboardEvent) => {
    if (event.code === "Space" && ui.currentScreen === "menu" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault(); ui.showPlaying("greyzone"); raid.startMission("greyzone")
    }
  }
  window.addEventListener("keydown", onGlobalKey)
  window.__gameProbe = () => { const p = raid.getSnapshot().player; return { x: p.x, y: p.y, z: p.z } }
  window.__ironVeil = {
    snapshot: () => ({ ...raid.getSnapshot(), screen: ui.currentScreen }), start: (id = "greyzone") => { ui.showPlaying(id); raid.startMission(id) },
    collect: () => raid.debugCollectNext(), teleport: (x, z) => raid.debugTeleport(x, z), damage: amount => raid.debugDamage(amount), aim: () => raid.debugAimAtEnemy(), eliminate: () => raid.debugEliminateOne(), profile: () => JSON.parse(JSON.stringify(company.profile)),
  }
  session = { dispose: () => { window.removeEventListener("keydown", onGlobalKey); raid.dispose(); ui.dispose(); audio.dispose(); delete window.__gameProbe; delete window.__ironVeil; window.__GAME_READY__ = false } }
}

export function stopGame(): void { session?.dispose(); session = null }
