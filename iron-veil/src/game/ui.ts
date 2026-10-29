import { AudioSystem } from "./audio"
import { BUILDINGS, ITEMS, MISSIONS, RESEARCH, buildingCost, staffCap, xpForLevel } from "./data"
import type { Company } from "./profile"
import type { BuildingId, HudSnapshot, ItemId, LootStack, MissionId, RaidResult, ResearchId, Screen, Settings } from "./types"

interface UiHandlers {
  deploy: (id: MissionId) => void
  resume: () => void
  abort: () => void
  returnToMenu: () => void
  getRaidLoot: () => LootStack[]
  settingsChanged: (settings: Settings) => void
  newCompany: () => void
}

export class GameUI {
  private screen: Screen = "menu"
  private selectedMission: MissionId = "greyzone"
  private lastResult: RaidResult | null = null
  private root: HTMLDivElement
  private hud: HTMLDivElement
  private toast: HTMLDivElement
  private timer: number
  private lastHud: HudSnapshot | null = null

  constructor(host: HTMLElement, private company: Company, private settings: Settings, private audio: AudioSystem, private handlers: UiHandlers) {
    host.innerHTML = `<div class="vignette"></div><div class="film-grain"></div><section id="hud" class="hud hidden"></section><main id="screen" class="screen"></main><div id="toast" class="toast" role="status"></div>`
    this.root = host.querySelector("#screen")!; this.hud = host.querySelector("#hud")!; this.toast = host.querySelector("#toast")!
    host.addEventListener("click", e => this.onClick(e)); host.addEventListener("input", e => this.onInput(e))
    this.timer = window.setInterval(() => { const notes = this.company.tick(); if (notes.length) { this.notify(notes[notes.length - 1]); if (this.screen === "base") this.showBase(); else if (this.screen === "menu") this.showMenu() } else if (this.screen === "base" && this.company.profile.activeResearch) { const clock = this.root.querySelector("[data-research-clock]"); if (clock) clock.textContent = `AKTIV: ${RESEARCH[this.company.profile.activeResearch.id].name.toUpperCase()} · ${Math.max(0, Math.ceil((this.company.profile.activeResearch.endsAt - Date.now()) / 1000))} SEK.` } }, 1000)
    this.buildHud(); this.showMenu()
  }

  get currentScreen(): Screen { return this.screen }
  dispose(): void { window.clearInterval(this.timer) }

  private topbar(section: string): string {
    const p = this.company.profile
    return `<header class="topbar"><button class="wordmark" data-action="menu"><span class="brand-mark">IV</span><span>IRON VEIL<small>PRIVATE SECURITY</small></span></button><div class="section-label">${section}</div><div class="resources"><span><i>₵</i>${p.money.toLocaleString("de-DE")} $</span><span><i>◆</i>${p.resources} Ressourcen</span><span><i>▰</i>Level ${p.level}</span></div></header>`
  }

  private nav(active: string): string {
    return `<nav class="main-nav">${[["missions", "OPERATIONEN", "01"], ["base", "BASIS", "02"], ["trader", "HÄNDLER", "03"], ["inventory", "LAGER", "04"]].map(([id, label, n]) => `<button class="nav-item ${active === id ? "active" : ""}" data-action="${id}"><small>${n}</small>${label}<span>↗</span></button>`).join("")}<button class="nav-item settings-link ${active === "settings" ? "active" : ""}" data-action="settings"><small>05</small>EINSTELLUNGEN<span>⌁</span></button></nav>`
  }

  showMenu(): void {
    this.screen = "menu"; this.hud.classList.add("hidden"); this.root.className = "screen menu-screen"
    const p = this.company.profile, extracts = p.stats.extracts, rate = p.stats.raids ? Math.round(extracts / p.stats.raids * 100) : 0
    this.root.innerHTML = `${this.topbar("UNTERNEHMENSÜBERSICHT")}<div class="menu-layout"><section class="hero"><div class="eyebrow"><span class="status-dot"></span>SYSTEM BEREIT · LOKALES PROFIL</div><h1>OPERATION<br><em>IRON VEIL</em></h1><p class="hero-copy">Gehen Sie hinein. Sichern Sie, was möglich ist.<br>Kommen Sie mit mehr zurück.</p><div class="hero-actions"><button class="primary large" data-action="missions"><span>OPERATION PLANEN</span><b>→</b></button><button class="text-button" data-action="inventory">Ausrüstung prüfen</button></div><div class="controls-hint"><span>WASD</span> BEWEGUNG <span>MAUS</span> ZIELEN <span>E</span> INTERAKTION</div></section>${this.nav("menu")}<aside class="company-card"><div class="card-kicker">UNTERNEHMENSSTATUS</div><div class="company-name">${p.callsign}<span>AKTIV</span></div><div class="level-row"><span>LEVEL ${p.level}</span><span>${p.xp} / ${xpForLevel(p.level)} XP</span></div><div class="thin-bar"><i style="width:${Math.min(100, p.xp / xpForLevel(p.level) * 100)}%"></i></div><div class="stat-grid"><div><b>${p.stats.raids}</b><small>EINSÄTZE</small></div><div><b>${rate}%</b><small>EXTRAKTION</small></div><div><b>${p.stats.kills}</b><small>ZIELE</small></div></div><div class="base-readout"><span>KOMMANDO</span><b>EBENE ${p.buildings.hq}</b><span>FREIES PERSONAL</span><b>${this.company.availableStaff()} / ${staffCap(p.buildings.hq)}</b></div></aside></div><footer class="menu-footer"><span>OPERATIVES GEBIET // SEKTOR 7</span><span>FORTSCHRITT NUR IN DIESEM BROWSER</span></footer>`
  }

  showMissions(): void {
    this.screen = "missions"; this.root.className = "screen panel-screen"; this.hud.classList.add("hidden")
    const mission = MISSIONS[this.selectedMission], unlocked = this.company.isMissionUnlocked(this.selectedMission)
    this.root.innerHTML = `${this.topbar("OPERATIONEN")}<div class="workspace"><aside class="side-nav">${this.nav("missions")}</aside><section class="content"><div class="content-heading"><div><span class="eyebrow">EINSATZPLANUNG</span><h2>Wählen Sie Ihre Operation.</h2></div><span class="risk-note">RISIKO = MÖGLICHER AUSRÜSTUNGSVERLUST</span></div><div class="mission-layout"><div class="mission-list">${(Object.keys(MISSIONS) as MissionId[]).map(id => { const m = MISSIONS[id], open = this.company.isMissionUnlocked(id); return `<button class="mission-card ${id === this.selectedMission ? "selected" : ""} ${!open ? "locked" : ""}" data-action="select-mission" data-id="${id}"><span class="mission-code">${m.code}</span><div><h3>${m.name}</h3><p>${m.location}</p></div><span class="threat ${m.threat.toLowerCase()}">${open ? m.threat : "GESPERRT"}</span></button>` }).join("")}</div><article class="briefing-card"><div class="briefing-visual"><span>${mission.code}</span><div class="radar"><i></i><b></b></div><small>${mission.location}</small></div><div class="briefing-body"><span class="eyebrow">MISSIONSBRIEFING</span><h2>${mission.name}</h2><p>${mission.description}</p><div class="briefing-stats"><div><small>BERGUNG</small><b>${mission.lootRequired} Kisten</b></div><div><small>WIDERSTAND</small><b>${mission.enemies} Kontakte</b></div><div><small>VERTRAG</small><b>${mission.reward.toLocaleString("de-DE")} $</b></div><div><small>RESSOURCEN</small><b>+${mission.resources}</b></div></div><div class="loadout-line"><span>AUSRÜSTUNG</span><b>MK-4 GEWEHR · ${this.company.profile.loadout.armor > 0 ? "SCHUTZWESTE" : "KEINE WESTE"} · ${this.company.profile.loadout.medkits} MED</b></div>${unlocked ? `<button class="primary deploy" data-action="deploy"><span>EINSATZ STARTEN</span><b>→</b></button>` : `<button class="primary deploy" disabled><span>${mission.unlock.toUpperCase()}</span><b>⌁</b></button>`}<small class="deploy-note">Beim Start werden gebunkerte Munition und Trauma-Sets mitgenommen.</small></div></article></div></section></div>`
  }

  showTrader(): void {
    this.screen = "trader"; this.root.className = "screen panel-screen"; this.hud.classList.add("hidden")
    const p = this.company.profile, sellItems = (Object.keys(ITEMS) as ItemId[]).filter(id => ITEMS[id].kind === "loot")
    this.root.innerHTML = `${this.topbar("HÄNDLER")}<div class="workspace"><aside class="side-nav">${this.nav("trader")}</aside><section class="content"><div class="content-heading"><div><span class="eyebrow">BESCHAFFUNG & VERKAUF</span><h2>Der Versorger.</h2></div><div class="dealer-tag">VERKAUFSBONUS <b>${p.research.includes("broker") ? "+20 %" : "0 %"}</b></div></div><div class="trader-grid"><section><div class="subheading"><h3>BESCHAFFUNG</h3><span>SOFORT LIEFERBAR</span></div>${(["ammo", "medkit", "armor"] as ItemId[]).map(id => { const item = ITEMS[id], qty = id === "ammo" ? 1 : 1; return `<div class="trade-row"><div class="item-icon">${item.short}</div><div class="item-info"><b>${item.name}</b><small>${item.description}</small></div><div class="stock">LAGER <b>${p.stash[id]}</b></div><button class="buy-button" data-action="buy" data-id="${id}">${((id === "ammo" ? item.value * 30 : item.value) * qty).toLocaleString("de-DE")} $ <span>KAUFEN</span></button></div>` }).join("")}<div class="trader-note">Munition wird in Paketen zu je 30 Schuss gehandelt. Schutzwesten und Trauma-Sets müssen im Lager ausgerüstet werden.</div></section><section><div class="subheading"><h3>BEUTE VERKAUFEN</h3><span>ALLE PREISE NETTO</span></div>${sellItems.map(id => `<div class="trade-row sell-row"><div class="item-icon muted">${ITEMS[id].short}</div><div class="item-info"><b>${ITEMS[id].name}</b><small>${Math.round(ITEMS[id].value * (p.research.includes("broker") ? 1.2 : 1)).toLocaleString("de-DE")} $ / Stück</small></div><div class="stock">MENGE <b>${p.stash[id]}</b></div><button class="sell-button" data-action="sell" data-id="${id}" ${p.stash[id] <= 0 ? "disabled" : ""}>1 VERKAUFEN</button><button class="icon-button" title="Alles verkaufen" data-action="sell-all" data-id="${id}" ${p.stash[id] <= 0 ? "disabled" : ""}>»</button></div>`).join("")}</section></div></section></div>`
  }

  showBase(): void {
    this.screen = "base"; this.root.className = "screen panel-screen"; this.hud.classList.add("hidden")
    const p = this.company.profile, cap = staffCap(p.buildings.hq)
    this.root.innerHTML = `${this.topbar("BASIS & FORSCHUNG")}<div class="workspace"><aside class="side-nav">${this.nav("base")}</aside><section class="content"><div class="content-heading"><div><span class="eyebrow">UNTERNEHMENSINFRASTRUKTUR</span><h2>Forward Operating Base.</h2></div><div class="staff-counter"><small>VERFÜGBARES PERSONAL</small><b>${this.company.availableStaff()} <span>/ ${cap}</span></b></div></div><div class="building-grid">${(Object.keys(BUILDINGS) as BuildingId[]).map(id => { const b = BUILDINGS[id], level = p.buildings[id], cost = buildingCost(id, level), staff = id === "hq" ? null : p.staff[id]; return `<article class="building-card level-${level}"><div class="building-top"><span class="building-code">${b.code}</span><span>EBENE ${level} / ${b.max}</span></div><div class="building-visual"><div class="building-shape"><i></i><i></i><i></i></div><span>${level === 0 ? "BAUGRUND" : "BETRIEBSBEREIT"}</span></div><h3>${b.name}</h3><p>${b.description}</p>${staff !== null && id !== "lab" ? `<div class="staff-row"><span>PERSONAL</span><button data-action="staff" data-id="${id}" data-delta="-1">−</button><b>${staff}</b><button data-action="staff" data-id="${id}" data-delta="1">+</button></div>` : ""}${staff !== null && id === "lab" ? `<div class="staff-row"><span>ANALYSTEN</span><button data-action="staff" data-id="${id}" data-delta="-1">−</button><b>${staff}</b><button data-action="staff" data-id="${id}" data-delta="1">+</button></div>` : ""}${id === "workshop" && level > 0 ? `<small class="production">1 MUNITIONSPAKET / ${Math.max(15, Math.round(45 / Math.max(1, (staff || 0) * level)))} SEK.</small>` : ""}${id === "clinic" && level > 0 ? `<small class="production">1 TRAUMA-SET / ${Math.max(30, Math.round(90 / Math.max(1, (staff || 0) * level)))} SEK.</small>` : ""}${level < b.max ? `<button class="build-button" data-action="build" data-id="${id}"><span>${level === 0 ? "ERRICHTEN" : "AUSBAUEN"}</span><b>${cost.money.toLocaleString("de-DE")} $ · ${cost.resources} ◆</b></button>` : `<button class="build-button" disabled><span>MAXIMALAUSBAU</span><b>✓</b></button>`}</article>` }).join("")}</div><section class="research-section"><div class="subheading"><h3>FORSCHUNGSPROGRAMME</h3><span data-research-clock>${p.activeResearch ? `AKTIV: ${RESEARCH[p.activeResearch.id].name.toUpperCase()} · ${Math.max(0, Math.ceil((p.activeResearch.endsAt - Date.now()) / 1000))} SEK.` : "KEIN AKTIVES PROGRAMM"}</span></div><div class="research-grid">${(Object.keys(RESEARCH) as ResearchId[]).map(id => { const r = RESEARCH[id], done = p.research.includes(id), active = p.activeResearch?.id === id; return `<article class="research-card ${done ? "done" : ""}"><span class="research-symbol">${done ? "✓" : "⌬"}</span><div><h4>${r.name}</h4><p>${r.description}</p><small>${r.money.toLocaleString("de-DE")} $ · ${r.resources} ◆ · ${r.seconds} SEK.</small></div><button data-action="research" data-id="${id}" ${done || active ? "disabled" : ""}>${done ? "ERFORSCHT" : active ? "LÄUFT" : "STARTEN"}</button></article>` }).join("")}</div></section></section></div>`
  }

  showInventory(): void {
    this.screen = "inventory"; this.root.className = "screen panel-screen"; this.hud.classList.add("hidden")
    const p = this.company.profile
    this.root.innerHTML = `${this.topbar("LAGER & AUSRÜSTUNG")}<div class="workspace"><aside class="side-nav">${this.nav("inventory")}</aside><section class="content"><div class="content-heading"><div><span class="eyebrow">UNTERNEHMENSBESTAND</span><h2>Logistik & Ausrüstung.</h2></div><button class="secondary" data-action="save">FORTSCHRITT SPEICHERN</button></div><div class="loadout-panel"><div class="operator-silhouette"><span>IV</span><i></i></div><div><span class="eyebrow">AKTIVE AUSRÜSTUNG</span><h3>MK-4 Sturmgewehr</h3><p>Standardwaffe des Unternehmens · 30-Schuss-Magazin</p></div><div class="loadout-stat"><small>SCHUTZWESTE</small><b>${p.loadout.armor > 0 ? `${p.loadout.armor} RÜSTUNG` : "NICHT AUSGERÜSTET"}</b></div><div class="loadout-stat"><small>TRAUMA-SETS</small><b>${p.loadout.medkits} / 3</b></div></div><div class="inventory-grid">${(Object.keys(ITEMS) as ItemId[]).map(id => { const item = ITEMS[id], equip = id === "armor" || id === "medkit"; return `<article class="inventory-item"><div class="item-icon ${item.kind === "loot" ? "muted" : ""}">${item.short}</div><div><span class="item-type">${item.kind === "supply" ? "VERSORGUNG" : "BERGUNGSGUT"}</span><h3>${item.name}</h3><p>${item.description}</p></div><strong>${p.stash[id]}<small>STÜCK</small></strong>${equip ? `<button data-action="equip" data-id="${id}" ${p.stash[id] <= 0 ? "disabled" : ""}>${id === "armor" && p.loadout.armor > 0 ? "AUSGERÜSTET" : "AUSRÜSTEN"}</button>` : `<span class="item-value">${item.value.toLocaleString("de-DE")} $</span>`}</article>` }).join("")}</div></section></div>`
  }

  showSettings(): void {
    this.screen = "settings"; this.root.className = "screen panel-screen"; this.hud.classList.add("hidden")
    this.root.innerHTML = `${this.topbar("EINSTELLUNGEN")}<div class="workspace"><aside class="side-nav">${this.nav("settings")}</aside><section class="content settings-content"><div class="content-heading"><div><span class="eyebrow">SYSTEMKONFIGURATION</span><h2>Einstellungen.</h2></div></div><div class="settings-list"><label class="setting-row"><div><b>MAUSEMPIFINDLICHKEIT</b><small>Gilt für die Ego-Kamera im Einsatz.</small></div><input type="range" min="0.2" max="1.8" step="0.05" value="${this.settings.sensitivity}" data-setting="sensitivity"><output>${this.settings.sensitivity.toFixed(2)}</output></label><label class="setting-row"><div><b>LAUTSTÄRKE</b><small>Web-Audio-Effekte, keine externen Audiodateien.</small></div><input type="range" min="0" max="1" step="0.05" value="${this.settings.volume}" data-setting="volume"><output>${Math.round(this.settings.volume * 100)} %</output></label><div class="setting-row"><div><b>TON</b><small>Einstellung bleibt lokal gespeichert.</small></div><button class="toggle ${!this.settings.muted ? "on" : ""}" data-action="mute">${this.settings.muted ? "STUMM" : "AKTIV"}</button></div><div class="setting-row"><div><b>Y-ACHSE INVERTIEREN</b><small>Vertikale Mausrichtung umkehren.</small></div><button class="toggle ${this.settings.invertY ? "on" : ""}" data-action="invert">${this.settings.invertY ? "EIN" : "AUS"}</button></div><div class="setting-row"><div><b>GRAFIKQUALITÄT</b><small>Niedrig reduziert Pixeldichte und deaktiviert Schatten.</small></div><button class="toggle on" data-action="quality">${this.settings.quality === "high" ? "HOCH" : "NIEDRIG"}</button></div></div><div class="danger-zone"><div><h3>LOKALER SPIELSTAND</h3><p>Das Unternehmen wird automatisch gespeichert. Browserdaten löschen entfernt den Fortschritt.</p></div><button class="secondary" data-action="save">JETZT SPEICHERN</button><button class="danger-button" data-action="reset">NEUES UNTERNEHMEN</button></div><div class="manual"><h3>STEUERUNG</h3><div><span><kbd>W A S D</kbd> Bewegen</span><span><kbd>SHIFT</kbd> Sprinten</span><span><kbd>MAUS</kbd> Umsehen</span><span><kbd>LMB</kbd> Feuer</span><span><kbd>RMB</kbd> Visier</span><span><kbd>R</kbd> Nachladen</span><span><kbd>E</kbd> Bergen / Extrahieren</span><span><kbd>Q</kbd> Heilen</span><span><kbd>TAB</kbd> Raid-Inventar</span><span><kbd>ESC</kbd> Pause</span></div></div></section></div>`
  }

  showPlaying(mission: MissionId): void { this.screen = "playing"; this.root.className = "screen hidden"; this.root.innerHTML = ""; this.hud.classList.remove("hidden"); this.hud.dataset.mission = mission }
  showPause(): void {
    this.screen = "paused"; this.hud.classList.add("hidden"); this.root.className = "screen modal-screen"
    this.root.innerHTML = `<div class="modal-card pause-card"><span class="eyebrow">OPERATION UNTERBROCHEN</span><h2>PAUSE</h2><p>Der Einsatz ist lokal angehalten.</p><button class="primary" data-action="resume"><span>FORTSETZEN</span><b>→</b></button><button class="secondary" data-action="raid-inventory">RAID-INVENTAR</button><button class="text-button danger-text" data-action="abort">EINSATZ ABBRECHEN</button><small>Beim Abbrechen gehen Raid-Beute und mitgeführte Ausrüstung verloren.</small></div>`
  }
  showRaidInventory(): void {
    this.screen = "raidInventory"; this.hud.classList.add("hidden"); this.root.className = "screen modal-screen"; const loot = this.handlers.getRaidLoot()
    this.root.innerHTML = `<div class="modal-card raid-bag"><span class="eyebrow">NICHT GESICHERTES BERGUNGSGUT</span><h2>RAID-INVENTAR</h2><p>Nur eine erfolgreiche Extraktion überführt diese Gegenstände in das Unternehmenslager.</p><div class="raid-loot-list">${loot.length ? loot.map(s => `<div><span>${ITEMS[s.id].name}</span><b>${s.qty} ×</b><small>${(ITEMS[s.id].value * s.qty).toLocaleString("de-DE")} $</small></div>`).join("") : `<div class="empty">Noch keine Beute geborgen.</div>`}</div><button class="primary" data-action="resume"><span>ZURÜCK ZUM EINSATZ</span><b>→</b></button></div>`
  }
  showResult(result: RaidResult): void {
    this.lastResult = result; this.screen = "result"; this.hud.classList.add("hidden"); this.root.className = `screen modal-screen result-${result.success ? "success" : "failure"}`
    const lootValue = result.success ? result.value : 0
    this.root.innerHTML = `<div class="result-layout"><section class="result-main"><span class="result-stamp">${result.success ? "EXTRAKTION ERFOLGREICH" : "OPERATION GESCHEITERT"}</span><h1>${result.success ? "AUFTRAG<br>ERFÜLLT." : "OPERATOR<br>VERLOREN."}</h1><p>${result.reason}</p><div class="result-stats"><div><small>EINSATZDAUER</small><b>${formatTime(result.duration)}</b></div><div><small>NEUTRALISIERT</small><b>${result.kills}</b></div><div><small>VERTRAG</small><b>${result.reward.toLocaleString("de-DE")} $</b></div><div><small>BEUTEWERT</small><b>${lootValue.toLocaleString("de-DE")} $</b></div></div><div class="result-actions"><button class="primary" data-action="menu"><span>ZURÜCK ZUR BASIS</span><b>→</b></button><button class="secondary" data-action="redeploy">ERNEUT EINSETZEN</button></div></section><aside class="result-loot"><span class="eyebrow">${result.success ? "INS LAGER ÜBERFÜHRT" : "VERLORENE RAID-BEUTE"}</span>${result.loot.length ? result.loot.map(s => `<div><span>${ITEMS[s.id].name}</span><b>${s.qty} ×</b></div>`).join("") : `<p>Keine Gegenstände gesichert.</p>`}${result.success ? `<div><span>Ressourcen</span><b>+${result.resources} ◆</b></div>` : `<p class="loss-note">Mitgeführte Weste und Trauma-Sets gingen verloren. Ein Teil der Reservemunition konnte geborgen werden.</p>`}</aside></div>`
  }

  private buildHud(): void {
    this.hud.innerHTML = `<div class="damage-overlay"></div><div class="hud-top-left"><span class="hud-label">AKTUELLER AUFTRAG</span><b data-hud="objective">Versorgungskisten bergen</b><small data-hud="objectiveProgress">0 / 2</small></div><div class="compass"><small>N</small><b data-hud="compass">000</b><i></i></div><div class="hud-top-right"><div><small>ZEITFENSTER</small><b data-hud="time">06:00</b></div><div><small>KONTAKTE</small><b data-hud="enemies">5</b></div></div><div class="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div class="hitmarker">×</div><div class="hud-message" data-hud="message"></div><div class="interaction"><span data-hud="interaction"></span><div class="extract-bar"><i></i></div></div><div class="hud-bottom-left"><div class="vital"><span>GESUNDHEIT</span><b data-hud="health">100</b><div><i data-bar="health"></i></div></div><div class="vital armor"><span>RÜSTUNG</span><b data-hud="armor">0</b><div><i data-bar="armor"></i></div></div><small class="meds">Q · <b data-hud="medkits">0</b> TRAUMA-SETS</small></div><div class="hud-bottom-center"><small>RAID-WERT</small><b data-hud="loot">0 $</b><span>NICHT GESICHERT</span></div><div class="hud-bottom-right"><small>MK-4 · AUTO</small><div><b data-hud="ammo">30</b><span>/ <b data-hud="reserve">120</b></span></div><em data-hud="reload"></em></div>`
  }

  updateHud(h: HudSnapshot): void {
    this.lastHud = h
    const set = (key: string, value: string) => { const el = this.hud.querySelector(`[data-hud="${key}"]`); if (el) el.textContent = value }
    set("objective", h.objective); set("objectiveProgress", h.objectiveProgress); set("time", formatTime(h.raidTime)); set("enemies", String(h.enemies)); set("health", String(h.health)); set("armor", String(h.armor)); set("ammo", String(h.ammo).padStart(2, "0")); set("reserve", String(h.reserve)); set("medkits", String(h.medkits)); set("loot", `${h.lootValue.toLocaleString("de-DE")} $`); set("interaction", h.interaction); set("message", h.messageTime > 0 ? h.message : ""); set("reload", h.reloading > 0 ? `NACHLADEN ${h.reloading.toFixed(1)}` : "R · NACHLADEN"); set("compass", String(Math.round(h.compass)).padStart(3, "0"))
    const healthBar = this.hud.querySelector<HTMLElement>('[data-bar="health"]'), armorBar = this.hud.querySelector<HTMLElement>('[data-bar="armor"]'); if (healthBar) healthBar.style.width = `${h.health}%`; if (armorBar) armorBar.style.width = `${Math.min(100, h.armor / 80 * 100)}%`
    this.hud.classList.toggle("low-health", h.health <= 30); this.hud.classList.toggle("hit", h.hitMarker > 0); this.hud.classList.toggle("damaged", h.damageFlash > 0); this.hud.classList.toggle("interacting", !!h.interaction); this.hud.classList.toggle("extracting", h.extraction > 0)
    const extract = this.hud.querySelector<HTMLElement>(".extract-bar i"); if (extract) extract.style.width = `${h.extraction * 100}%`
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]"); if (!button || button.disabled) return
    const action = button.dataset.action!, id = button.dataset.id as string | undefined; this.audio.sfx("ui")
    const actions: Record<string, () => void> = {
      menu: () => { this.handlers.returnToMenu(); this.showMenu() }, missions: () => this.showMissions(), base: () => this.showBase(), trader: () => this.showTrader(), inventory: () => this.showInventory(), settings: () => this.showSettings(),
      "select-mission": () => { this.selectedMission = id as MissionId; this.showMissions() }, deploy: () => { this.showPlaying(this.selectedMission); this.handlers.deploy(this.selectedMission) },
      resume: () => { this.screen = "playing"; this.root.className = "screen hidden"; this.hud.classList.remove("hidden"); this.handlers.resume() },
      "raid-inventory": () => this.showRaidInventory(), abort: () => this.handlers.abort(),
      buy: () => this.result(this.company.buy(id as ItemId, 1), () => this.showTrader()), sell: () => this.result(this.company.sell(id as ItemId, 1), () => this.showTrader()), "sell-all": () => this.result(this.company.sell(id as ItemId, this.company.profile.stash[id as ItemId]), () => this.showTrader()),
      equip: () => this.result(this.company.equip(id as "armor" | "medkit"), () => this.showInventory()),
      build: () => this.result(this.company.buildOrUpgrade(id as BuildingId), () => this.showBase(), true), staff: () => this.result(this.company.assignStaff(id as "workshop" | "lab" | "clinic", Number(button.dataset.delta)), () => this.showBase()), research: () => this.result(this.company.startResearch(id as ResearchId), () => this.showBase()),
      save: () => this.notify(this.company.save() ? "Fortschritt lokal gespeichert" : "Speichern nicht möglich · Browserdaten prüfen"),
      mute: () => { this.settings.muted = !this.settings.muted; this.handlers.settingsChanged(this.settings); this.showSettings() }, invert: () => { this.settings.invertY = !this.settings.invertY; this.handlers.settingsChanged(this.settings); this.showSettings() }, quality: () => { this.settings.quality = this.settings.quality === "high" ? "low" : "high"; this.handlers.settingsChanged(this.settings); this.showSettings() },
      reset: () => { if (window.confirm("Unternehmensfortschritt wirklich löschen und neu beginnen?")) this.handlers.newCompany() },
      redeploy: () => { if (this.lastResult) { this.selectedMission = this.lastResult.mission; this.showPlaying(this.selectedMission); this.handlers.deploy(this.selectedMission) } },
    }
    actions[action]?.()
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement, key = input.dataset.setting as "sensitivity" | "volume" | undefined; if (!key) return
    this.settings[key] = Number(input.value); input.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(key === "volume" ? `${Math.round(this.settings.volume * 100)} %` : this.settings.sensitivity.toFixed(2))); this.handlers.settingsChanged(this.settings)
  }

  private result(result: { ok: boolean; message: string }, refresh: () => void, build = false): void { this.notify(result.message); if (result.ok && build) this.audio.sfx("build"); refresh() }
  notify(message: string): void { this.toast.textContent = message; this.toast.classList.add("show"); window.setTimeout(() => this.toast.classList.remove("show"), 2600) }
}

export function formatTime(seconds: number): string { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }
