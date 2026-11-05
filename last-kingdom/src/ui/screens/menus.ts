// Main menu, character select, settings, controls, pause and results screens.

import type { GameApi } from "../../game/api"
import type { Screen, ButtonKind } from "../ui"
import { esc, bar } from "../ui"
import { CLASSES } from "../../meta/classData"
import { REBINDABLE, resetBindings } from "../../input/bindings"
import { bindingText } from "../../input/glyphs"
import { xpForLevel } from "../../meta/progression"
import type { Rarity, Settings } from "../../core/types"
import { RARITY_INFO } from "../../core/types"
import { itemDef } from "../../items/itemData"
import { displayName } from "../../items/items"
import { Rng } from "../../core/rng"
import { formatTime } from "../../core/math"
import type { ItemInstance, MissionDef } from "../../core/types"

const NAMES = ["Aldric", "Berthold", "Cedric", "Dietmar", "Edda", "Friedrun", "Gerwin", "Hildegard", "Isolde", "Jorund", "Konrad", "Liutgard", "Merten", "Nessa", "Odilo", "Ragna", "Sigurd", "Thilda", "Ulrich", "Wiltrud"]

export class MainMenuScreen implements Screen {
  name = "main"
  constructor(private game: GameApi) {}
  render(): string {
    const profiles = this.game.listProfiles()
    const last = profiles.filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return `<div class="title-wrap"><h1 class="title">THE LAST KINGDOM</h1><div class="subtitle">Ein Königreich der Toten. Geh hinein. Komm lebend heraus.</div></div>
      <nav class="menu-list">
        ${last ? `<button class="btn big" data-focus data-action="continue" data-slot="${last.slot}">Fortsetzen – ${esc(last.name)} (Stufe ${last.level})</button>` : ""}
        <button class="btn big" data-focus data-action="characters">Charaktere</button>
        <button class="btn" data-focus data-action="settings">Einstellungen</button>
        <button class="btn" data-focus data-action="controls">Steuerung</button>
        <button class="btn" data-focus data-action="help">Spielanleitung</button>
      </nav>
      <div class="version">Version ${this.game.version} · Tastatur, Maus, Xbox- und PlayStation-Controller</div>`
  }
  onAction(action: string, el: HTMLElement): void {
    switch (action) {
      case "continue":
        this.game.loadProfile(parseInt(el.dataset.slot!, 10))
        break
      case "characters":
        this.game.ui.push(new CharacterSelectScreen(this.game))
        break
      case "settings":
        this.game.ui.push(new SettingsScreen(this.game))
        break
      case "controls":
        this.game.ui.push(new ControlsScreen(this.game))
        break
      case "help":
        this.game.ui.push(new HelpScreen(this.game))
        break
    }
  }
  onBack(): void {
    /* root screen: nothing to go back to */
  }
  hints() {
    return [{ action: "confirm" as const, label: "Auswählen" }]
  }
}

export class HelpScreen implements Screen {
  name = "help"
  constructor(private game: GameApi) {}
  render(): string {
    const g = (a: Parameters<GameApi["ui"]["glyph"]>[0]) => this.game.ui.glyph(a)
    return `<h1>Spielanleitung</h1><div class="help-body" data-scroll="help">
      <p><b>Ziel:</b> Starte vom Lager aus Expeditionen in verseuchte Gebiete, finde Beute, erfülle Missionen und erreiche lebend einen Extraktionspunkt (blauer Lichtstrahl). Stirbst du, verlierst du alles, was du dabei hattest – außer versicherten Plätzen.</p>
      <p><b>Bewegen</b> ${g("moveForward")}${g("moveLeft")}${g("moveBack")}${g("moveRight")} · <b>Sprinten</b> ${g("sprint")} · <b>Springen</b> ${g("jump")} · <b>Ausweichen</b> ${g("dodge")} (unverwundbar während der Rolle)</p>
      <p><b>Angriff</b> ${g("attack")} (Kombos durch mehrmaliges Drücken) · <b>Schwerer Angriff</b> ${g("heavy")} · <b>Blocken</b> ${g("block")} (mit Bogen: Zielen) · <b>Ziel anvisieren</b> ${g("lockOn")}</p>
      <p><b>Interagieren</b> ${g("interact")} (Truhen, Hebel, Extraktion) · <b>Inventar</b> ${g("inventory")} · <b>Karte</b> ${g("map")} · <b>Schnellzugriff</b> ${g("quick1")}${g("quick2")}${g("quick3")}${g("quick4")} · <b>Waffe wechseln</b> ${g("switchWeapon")} · <b>Aktive Fähigkeit</b> ${g("ability")} (Controller: ${g("inventory")} gedrückt halten) · <b>Pause</b> ${g("pause")}</p>
      <p><b>Ausdauer</b> verbrauchst du beim Sprinten, Angreifen, Blocken und Ausweichen. Ist sie leer, bist du langsam und verwundbar.</p>
      <p><b>Zombies</b> sehen und hören dich. Nachts und im Nebel sehen sie schlechter, aber Sprinten ist laut. Sprinter sind schnell, Brutale langsam und tödlich, Verseuchte Ritter blocken von vorn – greife von der Seite an.</p>
      <p><b>Extraktion:</b> Manche Punkte müssen erst aktiviert werden (Hebel, Schlüssel, Fackel, Reparatur). Beim Extrahieren musst du einige Sekunden im Lichtkreis bleiben.</p>
      <p><b>Lager:</b> Baue Schmiede, Werkstatt, Alchemie und Co. aus, um bessere Ausrüstung herzustellen, Waffen zu reparieren und aufzuwerten. Der Händler kauft Artefakte.</p>
      <p><b>Fortschritt:</b> Erfahrung bringt Stufen und Fähigkeitspunkte für den Fähigkeitenbaum. Jede Waffengattung hat eine Beherrschung, die mit Treffern wächst.</p>
    </div><button class="btn" data-focus data-action="back">Zurück</button>`
  }
  onAction(): void {
    this.game.ui.pop()
  }
}

export class CharacterSelectScreen implements Screen {
  name = "characters"
  private creating: number | null = null
  private nameValue = ""
  private classId: "knight" | "ranger" | "rogue" = "knight"
  private confirmDelete: number | null = null
  constructor(private game: GameApi) {}
  render(): string {
    if (this.creating !== null) return this.renderCreate()
    const profiles = this.game.listProfiles()
    return `<h1>Charaktere</h1><div class="slots">${profiles
      .map((p, i) => {
        if (!p) return `<div class="slot empty"><div class="slot-title">Platz ${i + 1}</div><div class="dim">Leer</div><button class="btn" data-focus data-focus-id="new${i}" data-action="new" data-slot="${i}">Neuer Charakter</button><button class="btn small" data-focus data-action="import" data-slot="${i}">Spielstand importieren</button></div>`
        const cls = CLASSES.find((c) => c.id === p.classId)!
        return `<div class="slot"><div class="slot-title">${esc(p.name)}</div><div>${cls.name} · Stufe ${p.level}</div><div class="dim">${p.gold} Gold · ${p.stats.extractions} Extraktionen · ${p.stats.deaths} Tode · ${formatTime(p.stats.playSeconds)} gespielt</div>
          <button class="btn" data-focus data-focus-id="play${i}" data-action="play" data-slot="${i}">Spielen</button>
          ${this.confirmDelete === i ? `<button class="btn danger" data-focus data-action="delete-yes" data-slot="${i}">Wirklich löschen?</button><button class="btn small" data-focus data-action="delete-no">Abbrechen</button>` : `<button class="btn small" data-focus data-action="delete" data-slot="${i}">Löschen</button>`}</div>`
      })
      .join("")}</div><button class="btn" data-focus data-action="back">Zurück</button><input type="file" id="import-file" accept="application/json" class="hidden">`
  }
  private renderCreate(): string {
    return `<h1>Neuer Charakter</h1><div class="create">
      <label>Name</label><div class="row"><input id="char-name" class="text" maxlength="18" value="${esc(this.nameValue)}" placeholder="Name eingeben" data-focus data-action="name-focus"><button class="btn small" data-focus data-action="roll-name">Name würfeln</button></div>
      <label>Klasse</label><div class="classes">${CLASSES.map((c) => `<div class="class-card ${this.classId === c.id ? "selected" : ""}" data-focus data-focus-id="class-${c.id}" data-action="class" data-id="${c.id}"><h3>${c.name}</h3><p>${esc(c.description)}</p><div class="dim">Leben ${c.hp} · Ausdauer ${c.stamina} · Tragkraft ${c.carry} kg</div><div class="bonus">${esc(c.bonus)}</div><div class="dim">Start: ${Object.values(c.startEquipment).map((id) => itemDef(id).name).join(", ")}</div></div>`).join("")}</div>
      <div class="row"><button class="btn big" data-focus data-focus-id="create" data-action="create">Ins Lager</button><button class="btn" data-focus data-action="cancel">Abbrechen</button></div></div>`
  }
  onShow(el: HTMLElement): void {
    const file = el.querySelector<HTMLInputElement>("#import-file")
    file?.addEventListener("change", () => {
      const slot = parseInt(file.dataset.slot ?? "0", 10)
      const f = file.files?.[0]
      if (!f) return
      f.text().then((txt) => {
        if (this.game.importProfile(txt, slot)) this.game.ui.toast("Spielstand importiert.", "good")
        else this.game.ui.toast("Datei konnte nicht gelesen werden.", "warn")
        this.game.ui.refresh(this)
      })
    })
    const input = el.querySelector<HTMLInputElement>("#char-name")
    if (input) {
      input.addEventListener("focus", () => this.game.input.setTextInput(true))
      input.addEventListener("blur", () => this.game.input.setTextInput(false))
      input.addEventListener("input", () => (this.nameValue = input.value))
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "Escape") input.blur()
      })
    }
  }
  onHide(): void {
    this.game.input.setTextInput(false)
  }
  onAction(action: string, el: HTMLElement): void {
    const slot = parseInt(el.dataset.slot ?? "-1", 10)
    switch (action) {
      case "new":
        this.creating = slot
        this.nameValue = ""
        this.classId = "knight"
        this.game.ui.refresh(this)
        break
      case "play":
        this.game.loadProfile(slot)
        break
      case "delete":
        this.confirmDelete = slot
        this.game.ui.refresh(this)
        break
      case "delete-no":
        this.confirmDelete = null
        this.game.ui.refresh(this)
        break
      case "delete-yes":
        this.game.deleteProfile(slot)
        this.confirmDelete = null
        this.game.ui.refresh(this)
        break
      case "import": {
        const file = document.getElementById("import-file") as HTMLInputElement | null
        if (file) {
          file.dataset.slot = String(slot)
          file.click()
        }
        break
      }
      case "name-focus":
        (el as HTMLInputElement).focus()
        break
      case "roll-name": {
        this.nameValue = new Rng(Date.now() & 0xffff).pick(NAMES)
        this.game.ui.refresh(this)
        break
      }
      case "class":
        this.classId = el.dataset.id as "knight"
        this.game.ui.refresh(this)
        break
      case "create":
        if (this.creating !== null) {
          const name = this.nameValue.trim() || new Rng(Date.now() & 0xffff).pick(NAMES)
          this.game.createProfile(this.creating, name, this.classId)
        }
        break
      case "cancel":
        this.creating = null
        this.game.ui.refresh(this)
        break
      case "back":
        this.game.ui.pop()
        break
    }
  }
  onBack(): void {
    if (this.creating !== null) {
      this.creating = null
      this.game.ui.refresh(this)
    } else this.game.ui.pop()
  }
}

const SLIDERS: { key: keyof Settings; label: string; min: number; max: number; step: number; pct?: boolean }[] = [
  { key: "masterVolume", label: "Gesamtlautstärke", min: 0, max: 1, step: 0.1, pct: true },
  { key: "musicVolume", label: "Musik", min: 0, max: 1, step: 0.1, pct: true },
  { key: "sfxVolume", label: "Effekte", min: 0, max: 1, step: 0.1, pct: true },
  { key: "lookSensitivity", label: "Mausempfindlichkeit", min: 0.1, max: 2, step: 0.1 },
  { key: "gamepadSensitivity", label: "Controller-Empfindlichkeit", min: 0.1, max: 2, step: 0.1 },
  { key: "deadzone", label: "Stick-Totzone", min: 0.05, max: 0.4, step: 0.05 },
  { key: "fov", label: "Sichtfeld", min: 55, max: 95, step: 5 },
]
const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: "invertY", label: "Y-Achse umkehren" },
  { key: "shadows", label: "Schatten" },
  { key: "cameraShake", label: "Kamerawackeln" },
  { key: "vibration", label: "Controller-Vibration" },
  { key: "gore", label: "Blut" },
  { key: "showFps", label: "FPS anzeigen" },
]

export class SettingsScreen implements Screen {
  name = "settings"
  overlay = true
  constructor(private game: GameApi) {}
  render(): string {
    const s = this.game.settings
    const q = s.quality
    return `<h1>Einstellungen</h1><div class="settings" data-scroll="settings">
      ${SLIDERS.map((sl) => `<div class="setting" data-focus data-adjust data-action="noop" data-key="${sl.key}"><span>${sl.label}</span><div class="setting-ctl"><button class="arrow" data-action="dec" data-key="${sl.key}">◀</button><b>${sl.pct ? Math.round((s[sl.key] as number) * 100) + " %" : s[sl.key]}</b><button class="arrow" data-action="inc" data-key="${sl.key}">▶</button></div></div>`).join("")}
      <div class="setting" data-focus data-adjust data-action="noop" data-key="quality"><span>Grafikqualität</span><div class="setting-ctl"><button class="arrow" data-action="dec" data-key="quality">◀</button><b>${{ low: "Niedrig", medium: "Mittel", high: "Hoch" }[q]}</b><button class="arrow" data-action="inc" data-key="quality">▶</button></div></div>
      ${TOGGLES.map((t) => `<div class="setting" data-focus data-adjust data-action="toggle" data-key="${t.key}"><span>${t.label}</span><div class="setting-ctl"><b>${s[t.key] ? "An" : "Aus"}</b></div></div>`).join("")}
      ${this.game.profile ? `<div class="row"><button class="btn small" data-focus data-action="export">Spielstand exportieren</button></div>` : ""}
      <button class="btn" data-focus data-action="reset">Standardwerte</button>
    </div><button class="btn" data-focus data-action="back">Zurück</button>`
  }
  onAdjust(el: HTMLElement, delta: number): void {
    this.change(el.dataset.key as keyof Settings, delta)
  }
  private change(key: keyof Settings, delta: number): void {
    const s = this.game.settings as unknown as Record<string, unknown>
    const sl = SLIDERS.find((x) => x.key === key)
    if (sl) {
      const v = Math.round(((s[key] as number) + delta * sl.step) / sl.step) * sl.step
      s[key] = Math.max(sl.min, Math.min(sl.max, v))
    } else if (key === "quality") {
      const list = ["low", "medium", "high"]
      const i = list.indexOf(s.quality as string)
      s.quality = list[Math.max(0, Math.min(2, i + delta))]
    } else if (typeof s[key] === "boolean") s[key] = !s[key]
    this.game.applySettings()
    this.game.saveSettings()
    this.game.ui.refresh(this)
  }
  onAction(action: string, el: HTMLElement): void {
    const key = el.dataset.key as keyof Settings
    if (action === "dec") this.change(key, -1)
    else if (action === "inc") this.change(key, 1)
    else if (action === "toggle") this.change(key, 1)
    else if (action === "reset") {
      Object.assign(this.game.settings, { masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.9, lookSensitivity: 0.6, gamepadSensitivity: 0.6, invertY: false, quality: "high", shadows: true, fov: 70, cameraShake: true, showFps: false, gore: true, vibration: true, deadzone: 0.18 })
      this.game.applySettings()
      this.game.saveSettings()
      this.game.ui.refresh(this)
    } else if (action === "export") this.game.exportProfile()
    else if (action === "back") this.game.ui.pop()
  }
  hints() {
    return [
      { action: "menuLeft" as const, label: "Weniger" },
      { action: "menuRight" as const, label: "Mehr" },
      { action: "confirm" as const, label: "Umschalten" },
      { action: "back" as const, label: "Zurück" },
    ]
  }
}

export class ControlsScreen implements Screen {
  name = "controls"
  overlay = true
  private capturingAction: string | null = null
  constructor(private game: GameApi) {}
  render(): string {
    const input = this.game.input
    const dev = input.device
    const devName = dev === "keyboard" ? "Tastatur & Maus" : dev === "playstation" ? "PlayStation-Controller" : "Xbox-Controller"
    return `<h1>Steuerung</h1><div class="dim">Aktives Gerät: <b>${devName}</b>${input.gamepadConnected ? ` · Verbunden: ${esc(input.gamepadName.slice(0, 40))}` : " · Kein Controller verbunden (einfach anschließen, wird automatisch erkannt)"}</div>
      <div class="dim">Wähle eine Aktion und drücke die neue Taste. Esc bricht ab. Die Belegung wird für das Gerät gespeichert, auf dem du die Taste drückst.</div>
      <div class="bindings" data-scroll="bindings">${REBINDABLE.map((r) => `<div class="binding ${this.capturingAction === r.action ? "capturing" : ""}" data-focus data-focus-id="${r.action}" data-action="bind" data-key="${r.action}"><span>${r.name}</span><b>${this.capturingAction === r.action ? "Taste drücken …" : esc(bindingText(r.action, input.bindings, "keyboard"))}</b><b class="pad">${esc(bindingText(r.action, input.bindings, dev === "keyboard" ? "xbox" : dev))}</b></div>`).join("")}</div>
      <div class="row"><button class="btn small" data-focus data-action="reset">Standard wiederherstellen</button><button class="btn" data-focus data-action="back">Zurück</button></div>`
  }
  onAction(action: string, el: HTMLElement): void {
    if (action === "bind") {
      const act = el.dataset.key as (typeof REBINDABLE)[number]["action"]
      this.capturingAction = act
      this.game.ui.refresh(this)
      this.game.input.captureBinding(act, () => {
        this.capturingAction = null
        this.game.input.consumeAll()
        this.game.ui.refresh(this)
      })
    } else if (action === "reset") {
      this.game.input.bindings = resetBindings()
      this.game.ui.refresh(this)
    } else if (action === "back") this.game.ui.pop()
  }
  onBack(): void {
    if (this.capturingAction) {
      this.game.input.cancelCapture()
      this.capturingAction = null
      this.game.ui.refresh(this)
    } else this.game.ui.pop()
  }
  onHide(): void {
    this.game.input.cancelCapture()
  }
  hints() {
    return [
      { action: "confirm" as const, label: "Neu belegen" },
      { action: "back" as const, label: "Zurück" },
    ]
  }
}

export class PauseScreen implements Screen {
  name = "pause"
  private confirmAbandon = false
  constructor(private game: GameApi, private openInventory: () => void, private openMap: () => void) {}
  render(): string {
    const e = this.game.expedition
    return `<h1>Pause</h1><div class="dim">${e ? `Expedition läuft seit ${formatTime(e.elapsed)} · ${e.kills} Gegner erledigt` : ""}</div>
      <nav class="menu-list">
        <button class="btn big" data-focus data-action="resume">Weiter</button>
        <button class="btn" data-focus data-action="inventory">Inventar</button>
        <button class="btn" data-focus data-action="map">Karte</button>
        <button class="btn" data-focus data-action="settings">Einstellungen</button>
        <button class="btn" data-focus data-action="controls">Steuerung</button>
        ${this.confirmAbandon ? `<button class="btn danger" data-focus data-action="abandon-yes">Wirklich aufgeben? Alles Mitgeführte geht verloren.</button><button class="btn small" data-focus data-action="abandon-no">Doch nicht</button>` : `<button class="btn" data-focus data-action="abandon">Expedition aufgeben</button>`}
      </nav>`
  }
  onAction(action: string): void {
    switch (action) {
      case "resume":
        this.game.resumeExpedition()
        break
      case "inventory":
        this.openInventory()
        break
      case "map":
        this.openMap()
        break
      case "settings":
        this.game.ui.push(new SettingsScreen(this.game))
        break
      case "controls":
        this.game.ui.push(new ControlsScreen(this.game))
        break
      case "abandon":
        this.confirmAbandon = true
        this.game.ui.refresh(this)
        break
      case "abandon-no":
        this.confirmAbandon = false
        this.game.ui.refresh(this)
        break
      case "abandon-yes":
        this.game.expedition?.abandon()
        break
    }
  }
  onBack(): void {
    this.game.resumeExpedition()
  }
}

export interface RunSummary {
  success: boolean
  areaName: string
  extractionName?: string
  cause?: string
  elapsed: number
  kills: number
  bossKills: number
  xp: number
  gold: number
  levelsGained: number
  lootKept: ItemInstance[]
  lootLost: ItemInstance[]
  missionsDone: MissionDef[]
  bestRarity: Rarity
}

export class ResultsScreen implements Screen {
  name = "results"
  constructor(private game: GameApi, private summary: RunSummary) {}
  render(): string {
    const s = this.summary
    const list = (items: ItemInstance[]) => (items.length ? `<ul class="loot-list">${items.map((i) => `<li style="color:${RARITY_INFO[i.rarity].color}">${esc(displayName(i))}${i.qty > 1 ? ` ×${i.qty}` : ""}</li>`).join("")}</ul>` : `<div class="dim">–</div>`)
    const p = this.game.profile!
    return `<h1 class="${s.success ? "good" : "bad"}">${s.success ? "Extraktion erfolgreich" : "Gefallen"}</h1>
      <div class="dim">${esc(s.areaName)}${s.success ? ` · ${esc(s.extractionName ?? "")}` : ` · ${esc(s.cause ?? "")}`} · ${formatTime(s.elapsed)}</div>
      <div class="results">
        <div class="panel"><h2>Ausbeute</h2>
          <div class="stat"><span>Gegner erledigt</span><b>${s.kills}${s.bossKills ? ` (davon ${s.bossKills} Boss)` : ""}</b></div>
          <div class="stat"><span>Erfahrung</span><b>+${s.xp}${s.levelsGained ? ` · ${s.levelsGained} Stufe(n) aufgestiegen!` : ""}</b></div>
          <div class="stat"><span>Gold</span><b>${s.success ? "+" : "verloren: "}${s.gold}</b></div>
          <div class="stat"><span>Stufe</span><b>${p.level} ${bar(p.xp, xpForLevel(p.level), "xp")}</b></div>
          ${s.missionsDone.length ? `<div class="stat"><span>Missionen erfüllt</span><b>${s.missionsDone.map((m) => esc(m.title)).join(", ")}</b></div>` : ""}
        </div>
        <div class="panel"><h2>${s.success ? "Gesicherte Beute" : "Gerettet (versichert)"}</h2>${list(s.lootKept)}</div>
        ${s.success ? "" : `<div class="panel"><h2>Verloren</h2>${list(s.lootLost)}</div>`}
      </div>
      <button class="btn big" data-focus data-action="camp">Zurück ins Lager</button>`
  }
  onAction(): void {
    this.game.goToCamp()
  }
  onBack(): void {
    this.game.goToCamp()
  }
  hints() {
    return [{ action: "confirm" as const, label: "Weiter" }]
  }
}
