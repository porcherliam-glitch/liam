/**
 * ui.ts — all menus (company overview, operations, trader, base & research, stash & loadout, settings), the in-raid
 * modal screens (pause, raid inventory, tactical map) and the result screen. Plain DOM via template strings; clicks
 * are delegated through data-action attributes. The in-raid HUD lives in hud.ts.
 */
import { AudioSystem } from "./audio"
import { ARMOR_VALUES, BUILDINGS, CONTRACTS, DIFFICULTY, ENEMIES, ITEMS, MAX_GRENADES, MAX_MEDKITS, MISSIONS, MISSION_ORDER, PRIMARY_WEAPONS, RESEARCH, WEAPONS, buildingCost, productionInterval, staffCap, xpForLevel } from "./data"
import { Hud, drawTacticalMap, formatTime, type TacticalMapData } from "./hud"
import { AMMO_CARRY, type Company } from "./profile"
import type { BuildingId, ContractId, Difficulty, EnemyKind, HudSnapshot, ItemId, LootStack, MissionId, RaidResult, ResearchId, Screen, Settings, WeaponId } from "./types"

export interface UiHandlers {
  deploy: (id: MissionId, contract: ContractId | null) => void
  previewMission: (id: MissionId) => void
  resume: () => void
  abort: () => void
  returnToMenu: () => void
  getRaidLoot: () => LootStack[]
  getRaidStatus: () => { medkits: number; grenades: number; primary: string; primaryRounds: number; contract: string; value: number }
  getMapData: () => TacticalMapData
  settingsChanged: (settings: Settings) => void
  newCompany: () => void
  pickContract: (id: MissionId) => ContractId
}

const money = (n: number) => `${Math.round(n).toLocaleString("de-DE")} $`
const KIND_LABEL: Record<EnemyKind, string> = { scout: "Späher", rifleman: "Schützen", heavy: "Schwere Einheiten", marksman: "Scharfschützen" }

export class GameUI {
  private screen: Screen = "menu"
  private selectedMission: MissionId = "greyzone"
  private contracts = new Map<MissionId, ContractId>()
  private lastResult: RaidResult | null = null
  private root: HTMLDivElement
  private hudRoot: HTMLDivElement
  private toast: HTMLDivElement
  private timer: number
  private toastTimer = 0
  private introSeen = false
  readonly hud: Hud

  constructor(host: HTMLElement, private company: Company, private settings: Settings, private audio: AudioSystem, private handlers: UiHandlers) {
    host.innerHTML = `<div class="vignette"></div><div class="film-grain"></div><section id="hud" class="hud hidden"></section><main id="screen" class="screen"></main><div id="toast" class="toast" role="status"></div>`
    this.root = host.querySelector("#screen")!; this.hudRoot = host.querySelector("#hud")!; this.toast = host.querySelector("#toast")!
    this.hud = new Hud(this.hudRoot); this.hud.showFps = settings.showFps
    host.addEventListener("click", e => this.onClick(e)); host.addEventListener("input", e => this.onInput(e))
    host.addEventListener("pointerover", e => { const b = (e.target as HTMLElement).closest?.("button:not(:disabled)"); if (b && !b.contains(e.relatedTarget as Node)) this.audio.play("ui_hover", { volume: 0.25 }) })
    this.timer = window.setInterval(() => this.tick(), 1000)
    for (const id of MISSION_ORDER) this.contracts.set(id, handlers.pickContract(id))
    this.showMenu()
  }

  get currentScreen(): Screen { return this.screen }
  dispose(): void { window.clearInterval(this.timer); window.clearTimeout(this.toastTimer) }

  private tick(): void {
    const notes = this.company.tick()
    if (notes.length) { this.notify(notes[notes.length - 1]); if (this.screen === "base" || this.screen === "menu" || this.screen === "inventory") this.refresh(); return }
    const clock = this.root.querySelector("[data-research-clock]")
    const ar = this.company.profile.activeResearch
    if (clock && ar) clock.textContent = `AKTIV: ${RESEARCH[ar.id].name.toUpperCase()} · ${Math.max(0, Math.ceil((ar.endsAt - Date.now()) / 1000))} SEK.`
  }

  private refresh(): void {
    const map: Partial<Record<Screen, () => void>> = { menu: () => this.showMenu(), missions: () => this.showMissions(), trader: () => this.showTrader(), base: () => this.showBase(), inventory: () => this.showInventory(), settings: () => this.showSettings() }
    map[this.screen]?.()
  }

  // ───────────────────────────── shared chrome ─────────────────────────────

  private topbar(section: string): string {
    const p = this.company.profile
    return `<header class="topbar"><button class="wordmark" data-action="menu"><span class="brand-mark">IV</span><span>IRON VEIL<small>PRIVATE SECURITY</small></span></button><div class="section-label">${section}</div><div class="resources"><span title="Geld"><i>$</i>${money(p.money)}</span><span title="Ressourcen für Bau und Forschung"><i>◆</i>${p.resources} Ressourcen</span><span title="Erfahrungsstufe"><i>▲</i>Level ${p.level}</span></div></header>`
  }

  private nav(active: string): string {
    const items: [string, string, string][] = [["missions", "OPERATIONEN", "01"], ["inventory", "LAGER & AUSRÜSTUNG", "02"], ["trader", "HÄNDLER", "03"], ["base", "BASIS & FORSCHUNG", "04"]]
    return `<nav class="main-nav">${items.map(([id, label, n]) => `<button class="nav-item ${active === id ? "active" : ""}" data-action="${id}"><small>${n}</small>${label}<span>↗</span></button>`).join("")}<button class="nav-item settings-link ${active === "settings" ? "active" : ""}" data-action="settings"><small>05</small>EINSTELLUNGEN<span>⌁</span></button></nav>`
  }

  private panel(section: string, active: string, body: string): void {
    this.root.className = "screen panel-screen"; this.hudRoot.classList.add("hidden")
    this.root.innerHTML = `${this.topbar(section)}<div class="workspace"><aside class="side-nav">${this.nav(active)}</aside><section class="content">${body}</section></div>`
  }

  // ───────────────────────────── main menu ─────────────────────────────

  showMenu(): void {
    this.screen = "menu"; this.hudRoot.classList.add("hidden"); this.root.className = "screen menu-screen"
    const p = this.company.profile, rate = p.stats.raids ? Math.round(p.stats.extracts / p.stats.raids * 100) : 0
    const intro = p.stats.raids === 0 && !this.introSeen
    this.root.innerHTML = `${this.topbar("UNTERNEHMENSÜBERSICHT")}<div class="menu-layout"><section class="hero"><div class="eyebrow"><span class="status-dot"></span>SYSTEM BEREIT · LOKALES PROFIL</div><h1>OPERATION<br><em>IRON VEIL</em></h1><p class="hero-copy">Gehen Sie hinein. Sichern Sie, was möglich ist.<br>Kommen Sie mit mehr zurück.</p><div class="hero-actions"><button class="primary large" data-action="missions"><span>OPERATION PLANEN</span><b>→</b></button><button class="text-button" data-action="intro">Kurzeinweisung</button></div><div class="controls-hint"><span>WASD</span> BEWEGEN <span>MAUS</span> ZIELEN <span>E</span> DURCHSUCHEN <span>LEERTASTE</span> SCHNELLSTART</div></section>${this.nav("menu")}<aside class="company-card"><div class="card-kicker">UNTERNEHMENSSTATUS</div><div class="company-name">${p.callsign}<span>AKTIV</span></div><div class="level-row"><span>LEVEL ${p.level}</span><span>${p.xp} / ${xpForLevel(p.level)} EP</span></div><div class="thin-bar"><i style="width:${Math.min(100, p.xp / xpForLevel(p.level) * 100)}%"></i></div><div class="stat-grid"><div><b>${p.stats.raids}</b><small>EINSÄTZE</small></div><div><b>${rate}%</b><small>EXTRAKTION</small></div><div><b>${p.stats.kills}</b><small>ZIELE</small></div></div><div class="base-readout"><span>KOMMANDO</span><b>EBENE ${p.buildings.hq}</b><span>FREIES PERSONAL</span><b>${this.company.availableStaff()} / ${staffCap(p.buildings.hq)}</b><span>HAUPTWAFFE</span><b>${WEAPONS[p.loadout.primary].short}</b><span>SCHWIERIGKEIT</span><b>${DIFFICULTY[this.settings.difficulty].name.toUpperCase()}</b></div></aside></div><footer class="menu-footer"><span>OPERATIVES GEBIET // SEKTOR 7</span><span>FORTSCHRITT WIRD IN DIESEM BROWSER GESPEICHERT</span></footer>${intro ? this.introCard() : ""}`
  }

  private introCard(): string {
    return `<div class="intro-backdrop"><article class="intro-card"><span class="eyebrow">KURZEINWEISUNG</span><h2>So funktioniert ein Einsatz</h2><ol>
      <li><b>Ausrüsten.</b> Im Lager Hauptwaffe, Weste, Trauma-Sets und Granaten wählen. Munitionspakete werden automatisch mitgenommen (bis zu ${AMMO_CARRY}).</li>
      <li><b>Bergen.</b> Im Einsatzgebiet Versorgungskisten finden (Rauten auf dem Kompass) und mit gedrückter <kbd>E</kbd>-Taste durchsuchen.</li>
      <li><b>Überleben.</b> Gegner hören Schüsse und Schritte. <kbd>C</kbd> duckt hinter Deckung, <kbd>Q</kbd> heilt, <kbd>R</kbd> lädt nach, <kbd>1</kbd>/<kbd>2</kbd> wechselt die Waffe.</li>
      <li><b>Extrahieren.</b> Mit genug Kisten zum Evakuierungspunkt, <kbd>E</kbd> halten und die Zone verteidigen, bis der Hubschrauber landet. Nur so kommt die Beute ins Lager.</li>
      <li><b>Ausbauen.</b> Beute beim Händler verkaufen, Basis ausbauen, forschen und bessere Waffen kaufen.</li>
    </ol><p class="warn">Wer fällt oder abbricht, verliert die Beute und die mitgenommene Ausrüstung. Die Waffen bleiben erhalten.</p><button class="primary" data-action="intro-close"><span>VERSTANDEN</span><b>→</b></button></article></div>`
  }

  // ───────────────────────────── operations ─────────────────────────────

  showMissions(): void {
    this.screen = "missions"
    const id = this.selectedMission, m = MISSIONS[id], unlocked = this.company.isMissionUnlocked(id), p = this.company.profile
    const contractId = this.contracts.get(id)!, contract = CONTRACTS[contractId]
    const roster = Object.entries(m.roster.reduce<Record<string, number>>((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc }, {})).map(([k, n]) => `${n}× ${KIND_LABEL[k as EnemyKind]}`).join(" · ")
    const packs = Math.min(AMMO_CARRY, p.stash.ammo), w = WEAPONS[p.loadout.primary]
    const list = MISSION_ORDER.map(mid => { const mm = MISSIONS[mid], open = this.company.isMissionUnlocked(mid); return `<button class="mission-card ${mid === id ? "selected" : ""} ${!open ? "locked" : ""}" data-action="select-mission" data-id="${mid}"><span class="mission-code">${mm.code}</span><div><h3>${mm.name}</h3><p>${mm.location}</p></div><span class="threat ${mm.threat.toLowerCase()}">${open ? mm.threat : "GESPERRT"}</span></button>` }).join("")
    const warn = packs === 0 && w.roundsPerPack > 0 ? `<div class="briefing-warn">Keine Munitionspakete im Lager – nur die Pistole hat Munition. Beim Händler kaufen!</div>` : ""
    this.panel("OPERATIONEN", "missions", `<div class="content-heading"><div><span class="eyebrow">EINSATZPLANUNG</span><h2>Wählen Sie Ihre Operation.</h2></div><span class="risk-note">SCHWIERIGKEIT: ${DIFFICULTY[this.settings.difficulty].name.toUpperCase()} · RISIKO = AUSRÜSTUNGSVERLUST</span></div>
      <div class="mission-layout"><div class="mission-list">${list}</div>
      <article class="briefing-card"><div class="briefing-visual theme-${m.theme}"><span>${m.code}</span><div class="radar"><i></i><b></b></div><small>${m.location}</small></div>
      <div class="briefing-body"><span class="eyebrow">MISSIONSBRIEFING</span><h2>${m.name}</h2><p>${m.description}</p>
      <div class="briefing-stats"><div><small>BERGUNG</small><b>${m.lootRequired} Kisten</b></div><div><small>WIDERSTAND</small><b>${m.roster.length} + ${m.reinforcements.length}</b></div><div><small>VERTRAG</small><b>${money(m.reward * DIFFICULTY[this.settings.difficulty].rewardMultiplier)}</b></div><div><small>ZEITFENSTER</small><b>${formatTime(m.time)}</b></div></div>
      <div class="roster-line"><span>FEINDLAGE</span><b>${roster}</b></div>
      <div class="contract-card"><span class="eyebrow">NEBENAUFTRAG</span><div><b>${contract.name}</b><small>${contract.description}</small></div><strong>+${money(contract.reward * DIFFICULTY[this.settings.difficulty].rewardMultiplier)}</strong></div>
      <div class="loadout-line"><span>AUSRÜSTUNG</span><b>${w.short} (${packs} Pakete = ${packs * w.roundsPerPack} Schuss) · P9 · ${p.loadout.armor > 0 ? `WESTE ${p.loadout.armor}` : "KEINE WESTE"} · ${p.loadout.medkits} MED · ${p.loadout.grenades} GRAN.</b></div>${warn}
      ${unlocked ? `<button class="primary deploy" data-action="deploy"><span>EINSATZ STARTEN</span><b>→</b></button>` : `<button class="primary deploy" disabled><span>${m.unlock.toUpperCase()}</span><b>⌁</b></button>`}
      <small class="deploy-note">Beim Start werden bis zu ${AMMO_CARRY} Munitionspakete sowie ausgerüstete Weste, Trauma-Sets und Granaten mitgenommen.</small></div></article></div>`)
  }

  // ───────────────────────────── trader ─────────────────────────────

  showTrader(): void {
    this.screen = "trader"
    const p = this.company.profile
    const supplies: ItemId[] = ["ammo", "medkit", "armor", "plate", "grenade"]
    const supplyRows = supplies.map(id => {
      const item = ITEMS[id], locked = p.level < item.minLevel
      const extra = id === "ammo" ? `<small class="pack-info">${WEAPONS[p.loadout.primary].short}: ${WEAPONS[p.loadout.primary].roundsPerPack} Schuss pro Paket</small>` : ""
      return `<div class="trade-row ${locked ? "locked" : ""}"><div class="item-icon">${item.short}</div><div class="item-info"><b>${item.name}</b><small>${item.description}</small>${extra}</div><div class="stock">LAGER <b>${p.stash[id]}</b></div>${locked ? `<button class="buy-button" disabled>AB LEVEL ${item.minLevel}</button>` : `<button class="buy-button" data-action="buy" data-id="${id}" ${p.money < item.value ? "disabled" : ""}>${money(item.value)} <span>KAUFEN</span></button>`}</div>`
    }).join("")
    const weaponCards = PRIMARY_WEAPONS.map(id => {
      const w = WEAPONS[id], owned = p.weapons.includes(id), locked = p.level < w.minLevel
      const action = owned ? (p.loadout.primary === id ? `<button disabled>AUSGERÜSTET</button>` : `<button data-action="select-weapon" data-id="${id}">AUSRÜSTEN</button>`) : locked ? `<button disabled>AB LEVEL ${w.minLevel}</button>` : `<button data-action="buy-weapon" data-id="${id}" ${p.money < w.price ? "disabled" : ""}>${money(w.price)} KAUFEN</button>`
      return `<article class="weapon-card ${owned ? "owned" : ""}"><div class="weapon-head"><span class="item-icon">${w.short}</span><div><b>${w.name}</b><small>${w.description}</small></div></div>${weaponStats(id)}${action}</article>`
    }).join("")
    const sellItems = (Object.keys(ITEMS) as ItemId[]).filter(id => ITEMS[id].kind === "loot")
    const total = sellItems.reduce((s, id) => s + this.company.sellPrice(id) * p.stash[id], 0)
    const sellRows = sellItems.map(id => `<div class="trade-row sell-row"><div class="item-icon muted">${ITEMS[id].short}</div><div class="item-info"><b>${ITEMS[id].name}</b><small>${money(this.company.sellPrice(id))} / Stück</small></div><div class="stock">MENGE <b>${p.stash[id]}</b></div><button class="sell-button" data-action="sell" data-id="${id}" ${p.stash[id] <= 0 ? "disabled" : ""}>1 VERKAUFEN</button><button class="icon-button" title="Alle verkaufen" data-action="sell-all" data-id="${id}" ${p.stash[id] <= 0 ? "disabled" : ""}>»</button></div>`).join("")
    this.panel("HÄNDLER", "trader", `<div class="content-heading"><div><span class="eyebrow">BESCHAFFUNG & VERKAUF</span><h2>Der Versorger.</h2></div><div class="dealer-tag">VERKAUFSBONUS <b>${this.company.has("broker") ? "+20 %" : "0 %"}</b></div></div>
      <div class="subheading"><h3>WAFFEN</h3><span>KAUF GILT DAUERHAFT · WAFFEN GEHEN NICHT VERLOREN</span></div><div class="weapon-grid">${weaponCards}</div>
      <div class="trader-grid"><section><div class="subheading"><h3>VERSORGUNG</h3><span>SOFORT LIEFERBAR</span></div>${supplyRows}<div class="trader-note">Westen, Trauma-Sets und Granaten müssen im Lager ausgerüstet werden. Munitionspakete werden automatisch mitgenommen.</div></section>
      <section><div class="subheading"><h3>BEUTE VERKAUFEN</h3><span>GESAMT ${money(total)}</span></div>${sellRows}<button class="secondary sell-everything" data-action="sell-everything" ${total <= 0 ? "disabled" : ""}>GESAMTE BEUTE VERKAUFEN · ${money(total)}</button></section></div>`)
  }

  // ───────────────────────────── base ─────────────────────────────

  showBase(): void {
    this.screen = "base"
    const p = this.company.profile, cap = staffCap(p.buildings.hq)
    const buildings = (Object.keys(BUILDINGS) as BuildingId[]).map(id => {
      const b = BUILDINGS[id], level = p.buildings[id], cost = buildingCost(id, level), staff = id === "hq" ? null : p.staff[id]
      const label = id === "lab" ? "ANALYSTEN" : id === "workshop" ? "TECHNIKER" : "SANITÄTER"
      const prod = id === "workshop" || id === "clinic" ? productionInterval(id, staff || 0, level) : Infinity
      const production = id === "workshop" && level > 0 ? `<small class="production">${Number.isFinite(prod) ? `1 MUNITIONSPAKET / ${Math.round(prod)} SEK.` : "PERSONAL ZUWEISEN, UM ZU PRODUZIEREN"}</small>` : id === "clinic" && level > 0 ? `<small class="production">${Number.isFinite(prod) ? `1 TRAUMA-SET / ${Math.round(prod)} SEK.` : "PERSONAL ZUWEISEN, UM ZU PRODUZIEREN"}</small>` : id === "hq" ? `<small class="production">PERSONAL ${cap} · OPERATIONEN BIS ${MISSIONS[MISSION_ORDER[Math.min(2, level - 1)]].code}</small>` : id === "lab" && level > 0 ? `<small class="production">FORSCHUNG ${p.staff.lab > 1 ? `${Math.round((p.staff.lab - 1) * 35)} % SCHNELLER` : "MIT 1 ANALYST"}</small>` : ""
      const staffRow = staff !== null ? `<div class="staff-row"><span>${label}</span><button data-action="staff" data-id="${id}" data-delta="-1" aria-label="weniger">−</button><b>${staff} / ${level}</b><button data-action="staff" data-id="${id}" data-delta="1" aria-label="mehr">+</button></div>` : ""
      const affordable = this.company.canAfford(cost.money, cost.resources)
      const buildBtn = level < b.max ? `<button class="build-button ${affordable ? "" : "short"}" data-action="build" data-id="${id}"><span>${level === 0 ? "ERRICHTEN" : "AUSBAUEN"}</span><b>${money(cost.money)} · ${cost.resources} ◆</b></button>` : `<button class="build-button" disabled><span>MAXIMALAUSBAU</span><b>✓</b></button>`
      return `<article class="building-card level-${level}"><div class="building-top"><span class="building-code">${b.code}</span><span>EBENE ${level} / ${b.max}</span></div><div class="building-visual"><div class="building-shape">${"<i></i>".repeat(Math.max(1, level + 1))}</div><span>${level === 0 ? "BAUGRUND" : "BETRIEBSBEREIT"}</span></div><h3>${b.name}</h3><p>${b.description}</p>${staffRow}${production}${buildBtn}</article>`
    }).join("")
    const ar = p.activeResearch
    const research = (Object.keys(RESEARCH) as ResearchId[]).map(id => {
      const r = RESEARCH[id], done = p.research.includes(id), active = ar?.id === id, locked = p.buildings.lab < r.labLevel
      return `<article class="research-card ${done ? "done" : ""} ${locked ? "locked" : ""}"><span class="research-symbol">${done ? "✓" : locked ? "⌁" : "⌬"}</span><div><h4>${r.name}</h4><p>${r.description}</p><small>${money(r.money)} · ${r.resources} ◆ · ${r.seconds} SEK. · LABOR ${r.labLevel}</small></div><button data-action="research" data-id="${id}" ${done || active || locked ? "disabled" : ""}>${done ? "ERFORSCHT" : active ? "LÄUFT" : locked ? `LABOR ${r.labLevel}` : "STARTEN"}</button></article>`
    }).join("")
    this.panel("BASIS & FORSCHUNG", "base", `<div class="content-heading"><div><span class="eyebrow">UNTERNEHMENSINFRASTRUKTUR</span><h2>Vorgeschobene Basis.</h2></div><div class="staff-counter"><small>FREIES PERSONAL</small><b>${this.company.availableStaff()} <span>/ ${cap}</span></b></div></div>
      <div class="building-grid">${buildings}</div>
      <section class="research-section"><div class="subheading"><h3>FORSCHUNGSPROGRAMME</h3><span data-research-clock>${ar ? `AKTIV: ${RESEARCH[ar.id].name.toUpperCase()} · ${Math.max(0, Math.ceil((ar.endsAt - Date.now()) / 1000))} SEK.` : "KEIN AKTIVES PROGRAMM"}</span></div><div class="research-grid">${research}</div></section>`)
  }

  // ───────────────────────────── stash & loadout ─────────────────────────────

  showInventory(): void {
    this.screen = "inventory"
    const p = this.company.profile, lo = p.loadout
    const owned = PRIMARY_WEAPONS.filter(id => p.weapons.includes(id))
    const weaponPicker = owned.map(id => `<button class="weapon-pick ${lo.primary === id ? "active" : ""}" data-action="select-weapon" data-id="${id}"><b>${WEAPONS[id].short}</b><small>${WEAPONS[id].name}</small></button>`).join("") + (owned.length < PRIMARY_WEAPONS.length ? `<button class="weapon-pick more" data-action="trader"><b>+</b><small>Weitere beim Händler</small></button>` : "")
    const vest = lo.armor > 0 ? `${lo.armorMax === ARMOR_VALUES.plate ? "Plattenträger" : "Schutzweste"} · ${lo.armor}/${lo.armorMax}` : "Keine Weste"
    const slot = (label: string, value: string, actions: string) => `<div class="loadout-slot"><small>${label}</small><b>${value}</b><div>${actions}</div></div>`
    const slots = [
      slot("SCHUTZ", vest, `${p.stash.armor > 0 && lo.armorMax < ARMOR_VALUES.armor ? `<button data-action="equip" data-id="armor">WESTE ANLEGEN</button>` : ""}${p.stash.plate > 0 && lo.armorMax < ARMOR_VALUES.plate ? `<button data-action="equip" data-id="plate">PLATTEN ANLEGEN</button>` : ""}${lo.armor > 0 ? `<button data-action="unequip" data-id="armor" ${lo.armor < lo.armorMax ? "disabled title='Beschädigt'" : ""}>ABLEGEN</button>` : ""}`),
      slot("TRAUMA-SETS", `${lo.medkits} / ${MAX_MEDKITS}`, `<button data-action="unequip" data-id="medkit" ${lo.medkits <= 0 ? "disabled" : ""}>−</button><button data-action="equip" data-id="medkit" ${p.stash.medkit <= 0 || lo.medkits >= MAX_MEDKITS ? "disabled" : ""}>+</button>`),
      slot("GRANATEN", `${lo.grenades} / ${MAX_GRENADES}`, `<button data-action="unequip" data-id="grenade" ${lo.grenades <= 0 ? "disabled" : ""}>−</button><button data-action="equip" data-id="grenade" ${p.stash.grenade <= 0 || lo.grenades >= MAX_GRENADES ? "disabled" : ""}>+</button>`),
      slot("MUNITION", `${Math.min(AMMO_CARRY, p.stash.ammo)} von ${p.stash.ammo} Paketen`, `<small class="slot-note">${Math.min(AMMO_CARRY, p.stash.ammo) * WEAPONS[lo.primary].roundsPerPack} Schuss für ${WEAPONS[lo.primary].short}</small>`),
    ].join("")
    const stash = (Object.keys(ITEMS) as ItemId[]).map(id => { const item = ITEMS[id]; return `<article class="inventory-item ${p.stash[id] <= 0 ? "empty" : ""}"><div class="item-icon ${item.kind === "loot" ? "muted" : ""}">${item.short}</div><div><span class="item-type">${item.kind === "supply" ? "VERSORGUNG" : "BERGUNGSGUT"}</span><h3>${item.name}</h3><p>${item.description}</p></div><strong>${p.stash[id]}<small>STÜCK</small></strong><span class="item-value">${item.kind === "loot" ? money(this.company.sellPrice(id)) : ""}</span></article>` }).join("")
    this.panel("LAGER & AUSRÜSTUNG", "inventory", `<div class="content-heading"><div><span class="eyebrow">UNTERNEHMENSBESTAND</span><h2>Logistik & Ausrüstung.</h2></div><button class="secondary" data-action="save">FORTSCHRITT SPEICHERN</button></div>
      <div class="loadout-panel v2"><div class="operator-silhouette"><span>IV</span><i></i></div><div class="loadout-main"><span class="eyebrow">HAUPTWAFFE</span><div class="weapon-picker">${weaponPicker}</div>${weaponStats(lo.primary)}<small class="slot-note">Seitenwaffe: P9 Dienstpistole (unbegrenzte Munition)</small></div><div class="loadout-slots">${slots}</div></div>
      <div class="inventory-grid">${stash}</div>`)
  }

  // ───────────────────────────── settings ─────────────────────────────

  private settingsRows(compact = false): string {
    const s = this.settings
    const range = (key: string, label: string, help: string, min: number, max: number, step: number, value: number, shown: string) => `<label class="setting-row"><div><b>${label}</b><small>${help}</small></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}"><output>${shown}</output></label>`
    const toggle = (action: string, label: string, help: string, on: boolean, text: string) => `<div class="setting-row"><div><b>${label}</b><small>${help}</small></div><button class="toggle ${on ? "on" : ""}" data-action="${action}">${text}</button></div>`
    const rows = [
      range("sensitivity", "MAUSEMPFINDLICHKEIT", "Umsehen mit der Maus im Einsatz.", 0.2, 1.8, 0.05, s.sensitivity, s.sensitivity.toFixed(2)),
      range("adsSensitivity", "EMPFINDLICHKEIT BEIM ZIELEN", "Faktor, solange die rechte Maustaste gehalten wird.", 0.3, 1.5, 0.05, s.adsSensitivity, `× ${s.adsSensitivity.toFixed(2)}`),
      range("fov", "SICHTFELD (FOV)", "Größer = mehr Überblick, kleiner = mehr Detail.", 60, 100, 1, s.fov, `${s.fov}°`),
      range("volume", "LAUTSTÄRKE", "Alle Geräusche werden im Browser erzeugt.", 0, 1, 0.05, s.volume, `${Math.round(s.volume * 100)} %`),
    ]
    if (compact) return rows.join("")
    return rows.join("") + [
      toggle("mute", "TON", "Alle Geräusche an oder aus.", !s.muted, s.muted ? "STUMM" : "AN"),
      toggle("invert", "Y-ACHSE UMKEHREN", "Maus nach oben schaut nach unten.", s.invertY, s.invertY ? "EIN" : "AUS"),
      toggle("difficulty", "SCHWIERIGKEIT", DIFFICULTY[s.difficulty].description, s.difficulty !== "easy", DIFFICULTY[s.difficulty].name.toUpperCase()),
      toggle("quality", "GRAFIKQUALITÄT", "Niedrig: ohne Schatten und mit geringerer Auflösung – für schwächere Rechner.", s.quality === "high", s.quality === "high" ? "HOCH" : "NIEDRIG"),
      toggle("shake", "BILDSCHIRMWACKELN", "Wackeln bei Schüssen, Treffern und Explosionen.", s.screenShake, s.screenShake ? "AN" : "AUS"),
      toggle("fps", "BILDRATE ANZEIGEN", "Zeigt die Bilder pro Sekunde im Einsatz.", s.showFps, s.showFps ? "AN" : "AUS"),
    ].join("")
  }

  showSettings(): void {
    this.screen = "settings"
    this.panel("EINSTELLUNGEN", "settings", `<div class="content-heading"><div><span class="eyebrow">SYSTEMKONFIGURATION</span><h2>Einstellungen.</h2></div></div><div class="settings-list">${this.settingsRows()}</div>
      <div class="danger-zone"><div><h3>LOKALER SPIELSTAND</h3><p>Das Unternehmen wird automatisch gespeichert. Browserdaten löschen entfernt den Fortschritt.</p></div><button class="secondary" data-action="save">JETZT SPEICHERN</button><button class="danger-button" data-action="reset">NEUES UNTERNEHMEN</button></div>
      <div class="manual"><h3>STEUERUNG</h3><div><span><kbd>W A S D</kbd> Bewegen</span><span><kbd>SHIFT</kbd> Sprinten</span><span><kbd>C</kbd> / <kbd>STRG</kbd> Ducken</span><span><kbd>MAUS</kbd> Umsehen</span><span><kbd>LINKS</kbd> Feuer</span><span><kbd>RECHTS</kbd> Zielen</span><span><kbd>R</kbd> Nachladen</span><span><kbd>1</kbd> <kbd>2</kbd> / <kbd>MAUSRAD</kbd> Waffe wechseln</span><span><kbd>E</kbd> halten: Durchsuchen / Evakuierung</span><span><kbd>Q</kbd> Heilen</span><span><kbd>G</kbd> Granate</span><span><kbd>F</kbd> Taschenlampe</span><span><kbd>M</kbd> Karte</span><span><kbd>TAB</kbd> Raid-Inventar</span><span><kbd>ESC</kbd> Pause</span></div></div>`)
  }

  // ───────────────────────────── in raid ─────────────────────────────

  showPlaying(): void { this.screen = "playing"; this.root.className = "screen hidden"; this.root.innerHTML = ""; this.hudRoot.classList.remove("hidden") }

  showPause(): void {
    this.screen = "paused"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen"
    const st = this.handlers.getRaidStatus()
    this.root.innerHTML = `<div class="modal-card pause-card"><span class="eyebrow">OPERATION UNTERBROCHEN</span><h2>PAUSE</h2>${st.contract ? `<p class="pause-contract">${st.contract}</p>` : ""}<button class="primary" data-action="resume"><span>FORTSETZEN</span><b>→</b></button><div class="pause-row"><button class="secondary" data-action="raid-inventory">INVENTAR</button><button class="secondary" data-action="raid-map">KARTE</button></div><details class="pause-settings"><summary>Schnelleinstellungen</summary><div class="settings-list compact">${this.settingsRows(true)}</div></details><button class="text-button danger-text" data-action="abort">EINSATZ ABBRECHEN</button><small>Beim Abbrechen gehen Raid-Beute und mitgeführte Ausrüstung verloren.</small></div>`
  }

  showRaidInventory(): void {
    this.screen = "raidInventory"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen"
    const loot = this.handlers.getRaidLoot(), st = this.handlers.getRaidStatus()
    this.root.innerHTML = `<div class="modal-card raid-bag"><span class="eyebrow">NICHT GESICHERTES BERGUNGSGUT</span><h2>RAID-INVENTAR</h2><p>Nur eine erfolgreiche Extraktion bringt diese Gegenstände ins Lager.</p><div class="raid-loot-list">${loot.length ? loot.map(s => `<div><span>${ITEMS[s.id].name}</span><b>${s.qty} ×</b><small>${ITEMS[s.id].kind === "loot" ? money(ITEMS[s.id].value * s.qty) : "Versorgung"}</small></div>`).join("") : `<div class="empty">Noch keine Beute geborgen.</div>`}</div><div class="raid-kit"><span>${st.primary}: <b>${st.primaryRounds}</b> Schuss</span><span>Trauma-Sets: <b>${st.medkits}</b></span><span>Granaten: <b>${st.grenades}</b></span><span>Wert: <b>${money(st.value)}</b></span></div><button class="primary" data-action="resume"><span>ZURÜCK ZUM EINSATZ</span><b>→</b></button></div>`
  }

  showMap(): void {
    this.screen = "raidInventory"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen"
    this.root.innerHTML = `<div class="modal-card map-card"><span class="eyebrow">TAKTISCHE KARTE · NORDEN OBEN</span><canvas class="tac-map" width="640" height="640"></canvas><div class="map-legend"><span><i class="you"></i>Sie</span><span><i class="crate"></i>Kiste in Reichweite</span><span><i class="exfil"></i>Extraktion</span><span><i class="done"></i>durchsucht</span></div><button class="primary" data-action="resume"><span>ZURÜCK ZUM EINSATZ</span><b>→</b></button></div>`
    drawTacticalMap(this.root.querySelector("canvas")!, this.handlers.getMapData())
  }

  showResult(result: RaidResult): void {
    this.lastResult = result; this.screen = "result"; this.hudRoot.classList.add("hidden"); this.root.className = `screen modal-screen result-${result.success ? "success" : "failure"}`
    this.contracts.set(result.mission, this.handlers.pickContract(result.mission))
    const c = result.contract
    const contractLine = c ? `<div class="result-contract ${c.done ? "ok" : "fail"}"><span>NEBENAUFTRAG · ${CONTRACTS[c.id].name}</span><b>${c.done ? `ERFÜLLT +${money(result.contractReward)}` : "NICHT ERFÜLLT"}</b></div>` : ""
    this.root.innerHTML = `<div class="result-layout"><section class="result-main"><span class="result-stamp">${result.success ? "EXTRAKTION ERFOLGREICH" : "OPERATION GESCHEITERT"}</span><h1>${result.success ? "AUFTRAG<br>ERFÜLLT." : "OPERATOR<br>VERLOREN."}</h1><p>${result.reason}</p>
      <div class="result-stats"><div><small>EINSATZDAUER</small><b>${formatTime(result.duration)}</b></div><div><small>NEUTRALISIERT</small><b>${result.kills}${result.headshots ? ` <em>(${result.headshots} Kopf)</em>` : ""}</b></div><div><small>VERTRAG</small><b>${money(result.reward)}</b></div><div><small>BEUTEWERT</small><b>${money(result.value)}</b></div><div><small>ERFAHRUNG</small><b>+${result.xp} EP</b></div><div><small>RESSOURCEN</small><b>+${result.resources} ◆</b></div></div>
      ${contractLine}${result.levelUp ? `<div class="level-up">STUFENAUFSTIEG · LEVEL ${this.company.profile.level} · +250 $</div>` : ""}
      <div class="result-actions"><button class="primary" data-action="menu"><span>ZURÜCK ZUR BASIS</span><b>→</b></button><button class="secondary" data-action="redeploy" ${this.company.isMissionUnlocked(result.mission) ? "" : "disabled"}>ERNEUT EINSETZEN</button></div></section>
      <aside class="result-loot"><span class="eyebrow">${result.success ? "INS LAGER ÜBERFÜHRT" : "VERLUSTE"}</span>${result.success ? (result.loot.length ? result.loot.map(s => `<div><span>${ITEMS[s.id].name}</span><b>${s.qty} ×</b></div>`).join("") : `<p>Keine Gegenstände gesichert.</p>`) : `<p class="loss-note">Raid-Beute, Weste, Trauma-Sets und Granaten sind verloren. Die Hälfte der übrigen Munition wurde geborgen. Waffen bleiben im Besitz des Unternehmens.</p>`}</aside></div>`
  }

  updateHud(h: HudSnapshot): void { if (this.screen === "playing") this.hud.update(h) }

  // ───────────────────────────── events ─────────────────────────────

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]"); if (!button || button.disabled) return
    const action = button.dataset.action!, id = button.dataset.id as string | undefined
    this.audio.play("ui_click", { volume: 0.6 })
    const toggleSetting = (mut: () => void) => { mut(); this.handlers.settingsChanged(this.settings); this.hud.showFps = this.settings.showFps; this.showSettings() }
    const actions: Record<string, () => void> = {
      menu: () => { this.handlers.returnToMenu(); this.showMenu() },
      missions: () => { this.handlers.previewMission(this.selectedMission); this.showMissions() }, base: () => this.showBase(), trader: () => this.showTrader(), inventory: () => this.showInventory(), settings: () => this.showSettings(),
      intro: () => { this.introSeen = false; this.company.profile.stats.raids === 0 ? this.showMenu() : this.root.insertAdjacentHTML("beforeend", this.introCard()) },
      "intro-close": () => { this.introSeen = true; this.root.querySelector(".intro-backdrop")?.remove() },
      "select-mission": () => { this.selectedMission = id as MissionId; this.handlers.previewMission(this.selectedMission); this.showMissions() },
      deploy: () => this.deploy(this.selectedMission),
      resume: () => { this.showPlaying(); this.handlers.resume() },
      "raid-inventory": () => this.showRaidInventory(), "raid-map": () => this.showMap(), abort: () => this.handlers.abort(),
      buy: () => this.result(this.company.buy(id as ItemId, 1), "ui_buy"),
      "buy-weapon": () => this.result(this.company.buyWeapon(id as WeaponId), "ui_buy"),
      "select-weapon": () => this.result(this.company.selectPrimary(id as WeaponId)),
      sell: () => this.result(this.company.sell(id as ItemId, 1), "ui_buy"),
      "sell-all": () => this.result(this.company.sell(id as ItemId, this.company.profile.stash[id as ItemId]), "ui_buy"),
      "sell-everything": () => this.result(this.company.sellAllLoot(), "ui_buy"),
      equip: () => this.result(this.company.equip(id as "armor" | "plate" | "medkit" | "grenade")),
      unequip: () => this.result(this.company.unequip(id as "armor" | "medkit" | "grenade")),
      build: () => this.result(this.company.buildOrUpgrade(id as BuildingId), "build"),
      staff: () => this.result(this.company.assignStaff(id as "workshop" | "lab" | "clinic", Number(button.dataset.delta))),
      research: () => this.result(this.company.startResearch(id as ResearchId)),
      save: () => this.notify(this.company.save() ? "Fortschritt gespeichert" : "Speichern nicht möglich · Browserdaten prüfen"),
      mute: () => toggleSetting(() => { this.settings.muted = !this.settings.muted }),
      invert: () => toggleSetting(() => { this.settings.invertY = !this.settings.invertY }),
      quality: () => toggleSetting(() => { this.settings.quality = this.settings.quality === "high" ? "low" : "high" }),
      shake: () => toggleSetting(() => { this.settings.screenShake = !this.settings.screenShake }),
      fps: () => toggleSetting(() => { this.settings.showFps = !this.settings.showFps }),
      difficulty: () => toggleSetting(() => { const order: Difficulty[] = ["easy", "normal", "hard"]; this.settings.difficulty = order[(order.indexOf(this.settings.difficulty) + 1) % 3] }),
      reset: () => { if (window.confirm("Unternehmensfortschritt wirklich löschen und neu beginnen?")) { this.introSeen = false; this.handlers.newCompany() } },
      redeploy: () => { if (this.lastResult) this.deploy(this.lastResult.mission) },
    }
    actions[action]?.()
  }

  private deploy(id: MissionId): void {
    if (!this.company.isMissionUnlocked(id)) return
    this.selectedMission = id
    this.showPlaying()
    this.handlers.deploy(id, this.contracts.get(id) ?? null)
  }

  /** Space on the main menu: quick deploy into the selected operation. */
  quickDeploy(): void { this.deploy(this.company.isMissionUnlocked(this.selectedMission) ? this.selectedMission : "greyzone") }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement, key = input.dataset.setting as "sensitivity" | "adsSensitivity" | "volume" | "fov" | undefined
    if (!key) return
    this.settings[key] = Number(input.value)
    const shown = key === "volume" ? `${Math.round(this.settings.volume * 100)} %` : key === "fov" ? `${this.settings.fov}°` : key === "adsSensitivity" ? `× ${this.settings.adsSensitivity.toFixed(2)}` : this.settings.sensitivity.toFixed(2)
    input.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(shown))
    this.handlers.settingsChanged(this.settings)
  }

  private result(result: { ok: boolean; message: string }, sound: "ui_buy" | "build" | null = null): void {
    this.notify(result.message)
    this.audio.play(result.ok ? sound ?? "ui_click" : "ui_error", { volume: 0.8 })
    this.refresh()
  }

  notify(message: string): void {
    this.toast.textContent = message; this.toast.classList.add("show")
    window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 2600)
  }
}

/** Stat bars for a weapon (relative to the best weapon in each category). */
export function weaponStats(id: WeaponId): string {
  const w = WEAPONS[id]
  const dps = w.damage * w.pellets / w.fireInterval
  const rows: [string, number, string][] = [
    ["SCHADEN", Math.min(1, w.damage * w.pellets / 126), `${w.damage}${w.pellets > 1 ? `×${w.pellets}` : ""}`],
    ["FEUERRATE", Math.min(1, (1 / w.fireInterval) / 14.7), `${Math.round(60 / w.fireInterval)}/min`],
    ["DPS", Math.min(1, dps / 320), `${Math.round(dps)}`],
    ["PRÄZISION", Math.min(1, 0.004 / Math.max(0.001, w.spreadAds) * 0.6 + (0.06 - w.spreadHip) * 6), ""],
    ["REICHWEITE", Math.min(1, w.rangeEnd / 130), `${w.rangeStart}–${w.rangeEnd} m`],
    ["MAGAZIN", Math.min(1, w.magazine / 32), String(w.magazine)],
  ]
  return `<div class="weapon-stats">${rows.map(([label, v, text]) => `<div><span>${label}</span><i><b style="width:${Math.max(4, Math.round(v * 100))}%"></b></i><em>${text}</em></div>`).join("")}</div>`
}
