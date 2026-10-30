/**
 * ui.ts — every menu and overlay: main menu, the base stations (trader, stash & backpack, armory, crafting, building &
 * staff, research, radio with contracts and raid planning), settings, the in-raid overlays (pause, backpack, loot
 * window, tactical map), the raid result and the base-attack decision. Plain DOM via template strings; clicks are
 * delegated through data-action attributes; everything is reachable with the gamepad (MenuNavigator).
 * The in-raid HUD lives in hud.ts.
 */
import { AudioSystem } from "./audio"
import type { Bag, BagSlot } from "./bag"
import { BASE_ATTACK, EXPEDITIONS, EXPEDITION_ORDER, PRODUCTION, RECIPES, RESEARCH, RESEARCH_ORDER, STAFF_JOBS, STRUCTURES, STRUCTURE_ORDER, TIMES, TIME_ORDER, type ExpeditionId, type ProducerId, type RecipeStation, type ResearchId, type StaffJob, type StructureId, type TimeOfDay } from "./baseData"
import { DIFFICULTY, xpForLevel } from "./data"
import { MenuNavigator } from "./gamepad"
import { Hud, drawTacticalMap, formatTime, type TacticalMapData } from "./hud"
import { touchEnabled } from "./storage"
import { itemIcon } from "./icons"
import { BACKPACKS, ITEMS, ITEM_IDS, RARITY_COLORS, RARITY_NAMES, weaponOfItem, type GearId, type ItemCategory, type ItemId } from "./items"
import type { ActionResult, Company } from "./profile"
import { MODE_NAMES, type ChatLine, type Online } from "./online"
import type { LootSession } from "./raid"
import type { Vitals } from "./survival"
import { ACHIEVEMENTS } from "./achievements"
import type { Difficulty, GoreSetting, HudSnapshot, RaidPlan, RaidResult, Screen, Settings } from "./types"
import { WEATHER, WEATHER_ORDER, type WeatherId } from "./weather"
import { AMMO, AMMO_FOR, ATTACHMENTS, ATTACHMENT_ORDER, PRIMARY_WEAPONS, SECONDARY_WEAPONS, MELEE_WEAPONS, WEAPONS, canAttach, effectiveWeapon, type AmmoId, type AttachmentId, type AttachmentSlot, type WeaponId } from "./weaponData"
import type { StationId, ZoneLayout } from "./zone"

export interface RaidStatusView {
  bag: Bag
  secure: Bag
  weightKg: number
  weightLimit: number
  vitals: Vitals
  armor: number
  helmet: number
  mode: string
  weapons: ({ slot: string; name: string; mag: number; ammo: AmmoId | null } | null)[]
}

export interface UiHandlers {
  /** Walk around the 3D base. */
  enterBase: () => void
  /** Back to the running raid/base after an overlay or pause. */
  resume: () => void
  /** Abort the raid (counts as lost) or leave the base walk. */
  abort: () => void
  /** Main menu (stops base walking). */
  toMenu: () => void
  deploy: (plan: RaidPlan) => void
  defend: () => void
  settingsChanged: (settings: Settings) => void
  newCompany: () => void
  zone: () => ZoneLayout
  raidStatus: () => RaidStatusView
  mapData: () => TacticalMapData
  useItem: (index: number) => boolean
  dropItem: (index: number) => void
  toSecure: (index: number) => boolean
  fromSecure: (index: number) => boolean
  structuresChanged: () => void
  /** "menu" | "base" | "raid" | "defense" | … (RaidGame mode). */
  mode: () => string
}

const money = (n: number) => `${Math.round(n).toLocaleString("de-DE")} $`
const kg = (n: number) => `${n.toFixed(n < 10 ? 2 : 1).replace(".", ",")} kg`
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const CAT_NAMES: Record<ItemCategory, string> = { ammo: "Munition", attachment: "Aufsätze", medical: "Medizin", food: "Nahrung", throwable: "Wurfwaffen", gear: "Ausrüstung", material: "Material", valuable: "Wertsachen", key: "Schlüssel", weapon: "Waffen" }
const CAT_ORDER: ItemCategory[] = ["weapon", "ammo", "attachment", "medical", "food", "throwable", "gear", "material", "valuable", "key"]
const SLOT_NAMES: Record<AttachmentSlot, string> = { optic: "OPTIK", muzzle: "MÜNDUNG", grip: "GRIFF", mag: "MAGAZIN", tactical: "TAKTISCH" }
const GORE_NAMES: Record<GoreSetting, string> = { brutal: "BRUTAL", normal: "NORMAL", off: "AUS" }
const STATION_SCREEN: Record<StationId, Screen> = { trader: "trader", stash: "inventory", radio: "radio", workbench: "crafting", armory: "armory", clinic: "crafting", build: "build", lab: "research", gate: "radio" }
const STATION_NAMES: Record<RecipeStation, string> = { workbench: "Werkbank", workshop: "Munitionswerkstatt", armory: "Waffenwerkstatt", clinic: "Feldlazarett", kitchen: "Küche" }

/** Icon (procedural PNG when available, otherwise the short label) with the rarity colour as border. */
function icon(id: ItemId, size: "s" | "m" = "m"): string {
  const def = ITEMS[id], url = itemIcon(id, 64)
  return `<span class="ic ic-${size}" style="--rar:${RARITY_COLORS[def.rarity] ?? "#567"}">${url ? `<img src="${url}" alt="">` : `<em>${esc(def.short)}</em>`}</span>`
}

export class GameUI {
  private screen: Screen = "menu"
  private root: HTMLDivElement
  private hudRoot: HTMLDivElement
  private toast: HTMLDivElement
  private timer: number
  private toastTimer = 0
  private raf = 0
  private pad: MenuNavigator
  /** Screens opened from a station in the walkable base return to it. */
  private fromBase = false
  private lastResult: RaidResult | null = null
  private loot: LootSession | null = null
  private mapZoom = false
  private stashFilter: ItemCategory | "all" = "all"
  private traderTab: "supply" | "ammo" | "weapons" | "attachments" | "sell" = "supply"
  private armorySlot: "primary" | "secondary" = "primary"
  private craftStation: RecipeStation = "workbench"
  private plan: { insertion: string; time: TimeOfDay; weather: WeatherId } = { insertion: "", time: "day", weather: "clear" }
  private buildFocus: StructureId | null = null
  private online: Online | null = null
  private boardSort: "earned" | "infectedKills" | "rescued" | "bestRaid" = "earned"
  readonly hud: Hud

  constructor(host: HTMLElement, private company: Company, private settings: Settings, private audio: AudioSystem, private handlers: UiHandlers) {
    host.innerHTML = `<div class="vignette"></div><div class="film-grain"></div><section id="hud" class="hud hidden"></section><main id="screen" class="screen"></main><div id="toast" class="toast" role="status"></div>`
    this.root = host.querySelector("#screen")!; this.hudRoot = host.querySelector("#hud")!; this.toast = host.querySelector("#toast")!
    this.hud = new Hud(this.hudRoot); this.hud.showFps = settings.showFps
    host.addEventListener("click", e => this.onClick(e)); host.addEventListener("input", e => this.onInput(e))
    host.addEventListener("submit", e => this.onSubmit(e))
    host.addEventListener("keydown", e => { if (e.key === "Escape" && this.screen === "chat") { e.preventDefault(); this.closeOverlay() } })
    host.addEventListener("pointerover", e => { const b = (e.target as HTMLElement).closest?.("button:not(:disabled)"); if (b && !b.contains(e.relatedTarget as Node)) this.audio.play("ui_hover", { volume: 0.25 }) })
    this.timer = window.setInterval(() => this.tick(), 1000)
    this.pad = new MenuNavigator(host, () => this.back(), () => { if (this.screen === "paused" || this.screen === "raidInventory" || this.screen === "loot") this.closeOverlay() }, () => this.lootAll())
    const loop = (t: number) => { if (this.screen !== "playing") this.pad.update(t); this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
    this.showMenu()
  }

  get currentScreen(): Screen { return this.screen }
  dispose(): void { window.clearInterval(this.timer); window.clearTimeout(this.toastTimer); cancelAnimationFrame(this.raf) }

  /** Gamepad B / Escape on menus: one level back. */
  back(): void {
    const intro = this.root.querySelector(".intro-backdrop")
    if (intro) { intro.remove(); return }
    if (this.screen === "paused" || this.screen === "raidInventory" || this.screen === "loot" || this.screen === "chat") this.closeOverlay()
    else if (this.screen === "result" || this.screen === "attack") this.showMenu()
    else if (this.screen !== "menu" && this.screen !== "playing") this.closePanel()
  }

  /** Leaves a station screen: back into the walkable base, or to the main menu. */
  private closePanel(): void {
    if (this.fromBase && this.handlers.mode() === "base") { this.fromBase = false; this.showPlaying(); this.handlers.resume() }
    else this.showMenu()
  }

  private closeOverlay(): void {
    if (this.screen === "loot" && this.loot) { const s = this.loot; this.loot = null; this.showPlaying(); s.close(); return }
    this.showPlaying(); this.handlers.resume()
  }

  private tick(): void {
    const notes = this.company.tick()
    if (notes.length) this.notify(notes[notes.length - 1])
    const live: Screen[] = ["menu", "crafting", "research", "build", "radio", "inventory"]
    if (notes.length && live.includes(this.screen)) { this.refresh(); return }
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-ends]")) el.textContent = formatTime((Number(el.dataset.ends) - Date.now()) / 1000)
  }

  private refresh(): void {
    const keepScroll = this.root.querySelector(".content")?.scrollTop ?? 0
    const map: Partial<Record<Screen, () => void>> = {
      menu: () => this.showMenu(), trader: () => this.showTrader(), inventory: () => this.showInventory(), armory: () => this.showArmory(), crafting: () => this.showCrafting(),
      build: () => this.showBuild(), research: () => this.showResearch(), radio: () => this.showRadio(), settings: () => this.showSettings(), raidInventory: () => this.showRaidInventory(),
      loot: () => this.loot && this.showLoot(this.loot), attack: () => this.showAttack(), online: () => this.showOnline(),
    }
    map[this.screen]?.()
    const content = this.root.querySelector(".content"); if (content) content.scrollTop = keepScroll
  }

  // ───────────────────────────── shared chrome ─────────────────────────────

  private topbar(section: string): string {
    const p = this.company.profile, threat = Math.round(p.base.threat)
    return `<header class="topbar"><button class="wordmark" data-action="menu"><span class="brand-mark">IV</span><span>IRON VEIL<small>SPERRZONE 7</small></span></button><div class="section-label">${section}</div><div class="resources"><span title="Geld"><i>$</i>${money(p.money)}</span><span title="Stufe"><i>▲</i>Level ${p.level}</span><span title="Bedrohung der Basis" class="${p.base.attackPending ? "warn" : ""}"><i>☣</i>Bedrohung ${threat} %</span>${p.infection > 0 ? `<span class="warn" title="Infektion"><i>✚</i>Infektion ${Math.round(p.infection)} %</span>` : ""}</div></header>`
  }

  private nav(active: string): string {
    const n = this.online?.available ? this.online.others().length : -1
    const items: [string, string, string, string][] = [["radio", "EINSATZ & FUNK", "01", "↗"], ["inventory", "LAGER & RUCKSACK", "02", "↗"], ["armory", "WAFFENWERKSTATT", "03", "↗"], ["trader", "HÄNDLER", "04", "↗"], ["crafting", "HERSTELLUNG", "05", "↗"], ["build", "BASIS & PERSONAL", "06", "↗"], ["research", "FORSCHUNG", "07", "↗"], ["online", "ONLINE", "08", n > 0 ? `<b class="online-count">${n}</b>` : "◌"], ["achievements", "ERFOLGE", "09", `${this.company.profile.achievements.length}/${ACHIEVEMENTS.length}`]]
    return `<nav class="main-nav">${items.map(([id, label, num, mark]) => `<button class="nav-item ${active === id ? "active" : ""}" data-action="${id}"><small>${num}</small>${label}<span>${mark}</span></button>`).join("")}<button class="nav-item settings-link ${active === "settings" ? "active" : ""}" data-action="settings"><small>10</small>EINSTELLUNGEN<span>⌁</span></button></nav>`
  }

  private panel(screen: Screen, section: string, body: string): void {
    this.screen = screen
    this.root.className = `screen panel-screen ${this.fromBase ? "from-base" : ""}`; this.hudRoot.classList.add("hidden")
    const close = this.fromBase && this.handlers.mode() === "base" ? `<button class="secondary close-panel" data-action="close-panel">ZURÜCK IN DIE BASIS</button>` : `<button class="secondary close-panel" data-action="menu">HAUPTMENÜ</button>`
    this.root.innerHTML = `${this.topbar(section)}<div class="workspace"><aside class="side-nav">${this.nav(screen)}${close}</aside><section class="content">${body}</section></div>`
  }

  // ───────────────────────────── main menu ─────────────────────────────

  showMenu(): void {
    this.screen = "menu"; this.fromBase = false; this.loot = null
    this.hudRoot.classList.add("hidden"); this.root.className = "screen menu-screen"
    this.handlers.toMenu()
    const fresh = this.company.unlockAchievements()
    if (fresh.length) window.setTimeout(() => this.notify(`Erfolg freigeschaltet: ${fresh.map(a => a.name).join(", ")}`), 400)
    const p = this.company.profile, rate = p.stats.raids ? Math.round(p.stats.extracts / p.stats.raids * 100) : 0
    const attack = p.base.attackPending ? `<div class="attack-banner"><b>☣ ANGRIFF AUF DIE BASIS</b><span>Infizierte sammeln sich vor dem Tor (Bedrohung ${Math.round(p.base.threat)} %).</span><button class="secondary" data-action="attack">REAGIEREN</button></div>` : ""
    const active = p.contracts.active.length ? p.contracts.active.map(c => `<div><span>${esc(c.title)}</span><b>${c.progress}/${c.target}</b></div>`).join("") : `<div><span>Keine aktiven Aufträge</span><b>Funk</b></div>`
    this.root.innerHTML = `${this.topbar("BASIS")}<div class="menu-layout"><section class="hero"><div class="eyebrow"><span class="status-dot"></span>SPERRZONE 7 · TAG ${p.stats.raids + 1}</div><h1>OPERATION<br><em>IRON VEIL</em></h1><p class="hero-copy">Die Zone ist gefallen. Plündern, überleben, rauskommen.<br>Bauen Sie die Basis aus, bevor die Toten an Ihr Tor klopfen.</p>${attack}<div class="hero-actions"><button class="primary large" data-action="enter-base"><span>BASIS BETRETEN</span><b>→</b></button><button class="secondary large-secondary" data-action="radio">EINSATZ PLANEN</button><button class="text-button" data-action="intro">Kurzeinweisung</button></div><div class="controls-hint"><span>WASD</span> BEWEGEN <span>E</span> BENUTZEN <span>TAB</span> RUCKSACK <span>M</span> KARTE <span>V</span> MESSER</div></section>${this.nav("menu")}<aside class="company-card"><div class="card-kicker">TRUPPE</div><div class="company-name">${esc(p.callsign)}<span>LEVEL ${p.level}</span></div><div class="level-row"><span>ERFAHRUNG</span><span>${p.xp} / ${xpForLevel(p.level)} EP</span></div><div class="thin-bar"><i style="width:${Math.min(100, p.xp / xpForLevel(p.level) * 100)}%"></i></div><div class="stat-grid"><div><b>${p.stats.raids}</b><small>EINSÄTZE</small></div><div><b>${rate}%</b><small>ÜBERLEBT</small></div><div><b>${p.stats.infectedKills}</b><small>INFIZIERTE</small></div></div><div class="base-readout"><span>PERSONAL</span><b>${this.company.staffTotal()} / ${this.company.staffCap()}</b><span>VERTEIDIGUNG</span><b>${this.company.defense()}</b><span>ZERSTÜCKELT</span><b>${p.stats.dismembered}</b><span>BEWOHNER</span><b>${p.residents}</b><span>SCHWIERIGKEIT</span><b>${DIFFICULTY[this.settings.difficulty].name.toUpperCase()}</b></div><div class="menu-contracts"><small>AUFTRÄGE</small>${active}</div></aside></div><footer class="menu-footer"><span>FORTSCHRITT WIRD IN DIESEM BROWSER GESPEICHERT</span><span class="footer-online">${this.onlineStatus()}</span><span>GORE: ${GORE_NAMES[this.settings.gore]}</span></footer>${p.stats.raids === 0 && !p.tutorialDone && !sessionStorage.getItem("iv.intro") ? this.introCard() : ""}`
  }

  private introCard(): string {
    try { sessionStorage.setItem("iv.intro", "1") } catch { /* private mode */ }
    return `<div class="intro-backdrop"><article class="intro-card"><span class="eyebrow">KURZEINWEISUNG</span><h2>So überleben Sie die Zone</h2><ol>
      <li><b>Basis.</b> Laufen Sie durch Ihre Basis und drücken Sie <kbd>E</kbd> an den Stationen: Händler, Lager, Werkbank, Waffenwerkstatt, Funk, Bauplätze.</li>
      <li><b>Packen.</b> Im Lager Waffen und Weste anlegen und den Rucksack packen: Munition, Verbände, Essen, Wasser. Der <b>sichere Behälter</b> bleibt auch beim Tod erhalten.</li>
      <li><b>Einsatz.</b> Am Funk Aufträge annehmen, Einstiegspunkt und Tageszeit wählen. Nachts gibt es mehr Infizierte – und bessere Beute.</li>
      <li><b>Überleben.</b> Schüsse locken Horden an. <kbd>V</kbd> Messer (leise), <kbd>Q</kbd> heilen, <kbd>G</kbd> werfen, <kbd>Tab</kbd> Rucksack. Achten Sie auf Blutungen, Hunger, Durst und Infektion.</li>
      <li><b>Raus.</b> Nur wer eine Extraktion erreicht (<kbd>M</kbd> Karte), behält die Beute. Manche Ausgänge brauchen Treibstoff, einen Schlüssel oder Geld.</li>
    </ol><p class="warn">Wer stirbt, verliert alles Mitgenommene außer dem sicheren Behälter. Gore ist auf „Brutal“ gestellt – änderbar in den Einstellungen.</p><button class="primary" data-action="intro-close"><span>VERSTANDEN</span><b>→</b></button></article></div>`
  }

  // ───────────────────────────── stations from the 3D base ─────────────────────────────

  /** E at a station (or a building plot) in the walkable base. */
  openStation(id: StationId | "plot", structure?: string): void {
    this.fromBase = true
    if (id === "plot") { this.buildFocus = (structure as StructureId) ?? null; this.showBuild(); return }
    if (id === "clinic") this.craftStation = "clinic"
    if (id === "workbench") this.craftStation = "workbench"
    this.show(STATION_SCREEN[id])
  }

  private show(screen: Screen): void {
    const map: Partial<Record<Screen, () => void>> = { menu: () => this.showMenu(), trader: () => this.showTrader(), inventory: () => this.showInventory(), armory: () => this.showArmory(), crafting: () => this.showCrafting(), build: () => this.showBuild(), research: () => this.showResearch(), radio: () => this.showRadio(), settings: () => this.showSettings(), online: () => this.showOnline(), achievements: () => this.showAchievements() }
    this.pad.reset(); map[screen]?.()
  }

  // ───────────────────────────── achievements ─────────────────────────────

  showAchievements(): void {
    const p = this.company.profile
    const cards = ACHIEVEMENTS.map(a => {
      const done = p.achievements.includes(a.id), pr = a.progress?.(p)
      return `<div class="research-card achievement ${done ? "done" : ""}"><div class="research-symbol">${done ? a.mark : "○"}</div><div><h4>${esc(a.name)}</h4><p>${esc(a.description)}</p><small>${done ? "FREIGESCHALTET" : pr ? `${pr[0]} / ${pr[1]}` : "OFFEN"}</small></div></div>`
    }).join("")
    this.panel("achievements", "ERFOLGE", `<div class="content-heading"><div><span class="eyebrow">MEILENSTEINE DER TRUPPE</span><h2>Erfolge.</h2></div><div class="dealer-tag">FREIGESCHALTET <b>${p.achievements.length} / ${ACHIEVEMENTS.length}</b></div></div><div class="research-grid">${cards}</div>`)
  }

  // ───────────────────────────── trader ─────────────────────────────

  showTrader(): void {
    const p = this.company.profile, tab = this.traderTab
    const tabs = ([["supply", "VERSORGUNG"], ["ammo", "MUNITION"], ["weapons", "WAFFEN"], ["attachments", "AUFSÄTZE"], ["sell", "VERKAUFEN"]] as const).map(([id, label]) => `<button class="tab ${tab === id ? "active" : ""}" data-action="trader-tab" data-id="${id}">${label}</button>`).join("")
    const row = (id: ItemId, qty: number, extra = "") => {
      const it = ITEMS[id], locked = p.level < it.trader, cost = Math.round(it.value * qty)
      return `<div class="trade-row v3 ${locked ? "locked" : ""}">${icon(id)}<div class="item-info"><b>${esc(it.name)}${qty > 1 ? ` <em>× ${qty}</em>` : ""}</b><small>${esc(it.description)}</small>${extra}</div><div class="stock">LAGER <b>${this.company.count(id)}</b></div>${locked ? `<button class="buy-button" disabled>AB LEVEL ${it.trader}</button>` : `<button class="buy-button" data-action="buy" data-id="${id}" data-qty="${qty}" ${p.money < cost ? "disabled" : ""}>${money(cost)} <span>KAUFEN</span></button>`}</div>`
    }
    let body = ""
    if (tab === "supply") body = ITEM_IDS.filter(id => ITEMS[id].trader > 0 && ["medical", "food", "throwable", "gear", "material"].includes(ITEMS[id].cat)).map(id => row(id, 1)).join("")
    else if (tab === "ammo") body = ITEM_IDS.filter(id => ITEMS[id].cat === "ammo" && ITEMS[id].trader > 0).map(id => row(id, Math.min(ITEMS[id].stack, 30), `<small class="pack-info">${esc(AMMO[id as AmmoId].description)}</small>`)).join("")
    else if (tab === "attachments") body = ATTACHMENT_ORDER.filter(id => ITEMS[id].trader > 0).map(id => row(id, 1, `<small class="pack-info">Montage: Waffenwerkstatt Stufe ${ATTACHMENTS[id].armory}</small>`)).join("")
    else if (tab === "weapons") body = `<div class="weapon-grid">${[...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS, ...MELEE_WEAPONS].filter(id => WEAPONS[id].price > 0).map(id => {
      const w = WEAPONS[id], owned = this.company.count(`w_${id}`) + (p.loadout.primary === id || p.loadout.secondary === id || p.loadout.melee === id ? 1 : 0), locked = p.level < w.minLevel
      const action = locked ? `<button disabled>AB LEVEL ${w.minLevel}</button>` : `<button data-action="buy-weapon" data-id="${id}" ${p.money < w.price ? "disabled" : ""}>${money(w.price)} KAUFEN</button>`
      return `<article class="weapon-card ${owned ? "owned" : ""}"><div class="weapon-head">${icon(`w_${id}`)}<div><b>${esc(w.name)}</b><small>${esc(w.description)}</small>${owned ? `<small class="owned-tag">IM BESITZ: ${owned}</small>` : ""}</div></div>${weaponStats(id)}${action}</article>`
    }).join("")}</div>`
    else {
      const ids = (Object.keys(p.stash) as ItemId[]).filter(id => this.company.count(id) > 0).sort((a, b) => CAT_ORDER.indexOf(ITEMS[a].cat) - CAT_ORDER.indexOf(ITEMS[b].cat) || this.company.sellPrice(b) - this.company.sellPrice(a))
      const valuables = ids.filter(id => ITEMS[id].cat === "valuable").reduce((s, id) => s + this.company.sellPrice(id) * this.company.count(id), 0)
      body = `<button class="secondary sell-everything" data-action="sell-valuables" ${valuables <= 0 ? "disabled" : ""}>ALLE WERTSACHEN VERKAUFEN · ${money(valuables)}</button>` + (ids.length ? ids.map(id => {
        const n = this.company.count(id), price = this.company.sellPrice(id), bulk = ITEMS[id].cat === "ammo" ? Math.min(n, ITEMS[id].stack) : n
        return `<div class="trade-row v3 sell">${icon(id)}<div class="item-info"><b>${esc(ITEMS[id].name)}</b><small>${CAT_NAMES[ITEMS[id].cat]} · ${money(price)} / Stück</small></div><div class="stock">MENGE <b>${n}</b></div><button class="sell-button" data-action="sell" data-id="${id}" data-qty="${ITEMS[id].cat === "ammo" ? Math.min(n, 30) : 1}">${ITEMS[id].cat === "ammo" ? `${Math.min(n, 30)}` : "1"} VERKAUFEN</button><button class="sell-button" data-action="sell" data-id="${id}" data-qty="${bulk}">${bulk === n ? "ALLE" : `${bulk}`} · ${money(price * bulk)}</button></div>`
      }).join("") : `<p class="empty-note">Das Lager ist leer.</p>`)
    }
    this.panel("trader", "HÄNDLER", `<div class="content-heading"><div><span class="eyebrow">SCHWARZMARKT AM TOR</span><h2>Der Händler.</h2></div><div class="dealer-tag">VERKAUFSBONUS <b>${this.company.has("broker") ? "+20 %" : "0 %"}</b></div></div><div class="tabs">${tabs}</div><div class="trader-list">${body}</div>`)
  }

  // ───────────────────────────── stash & backpack ─────────────────────────────

  showInventory(): void {
    const p = this.company.profile, lo = p.loadout
    const slot = (label: string, value: string, actions: string, iconId?: ItemId) => `<div class="loadout-slot v3">${iconId ? icon(iconId) : `<span class="ic ic-m empty"></span>`}<div><small>${label}</small><b>${value}</b></div><div class="slot-actions">${actions}</div></div>`
    const weaponSlot = (s: "primary" | "secondary") => {
      const id = s === "primary" ? lo.primary : lo.secondary, ammo = s === "primary" ? lo.primaryAmmo : lo.secondaryAmmo, mods = s === "primary" ? lo.primaryMods : lo.secondaryMods
      if (!id) return slot(s === "primary" ? "HAUPTWAFFE" : "SEITENWAFFE", "—", "")
      const n = Object.values(mods).filter(Boolean).length
      return slot(s === "primary" ? "HAUPTWAFFE" : "SEITENWAFFE", `${esc(WEAPONS[id].name)}<small>${ammo ? esc(AMMO[ammo].short) : ""}${n ? ` · ${n} Aufsätze` : ""}</small>`, `<button data-action="armory-slot" data-id="${s}">WERKSTATT</button><button data-action="unequip-weapon" data-id="${s}">ABLEGEN</button>`, `w_${id}`)
    }
    const slots = [
      weaponSlot("primary"), weaponSlot("secondary"),
      slot("NAHKAMPF", esc(WEAPONS[lo.melee].name), lo.melee !== "knife" ? `<button data-action="unequip-weapon" data-id="melee">ABLEGEN</button>` : "", `w_${lo.melee}`),
      slot("WESTE", lo.armor > 0 ? `${lo.armorMax === 85 ? "Plattenträger" : "Schutzweste"} · ${lo.armor}/${lo.armorMax}` : "Keine", lo.armor > 0 ? `<button data-action="unequip-gear" data-id="armor">ABLEGEN</button>` : "", lo.armor > 0 ? (lo.armorMax === 85 ? "plate" : "armor") : undefined),
      slot("HELM", lo.helmet > 0 ? `Helm · ${lo.helmet}` : "Keiner", lo.helmet > 0 ? `<button data-action="unequip-gear" data-id="helmet">ABLEGEN</button>` : "", lo.helmet > 0 ? "helmet" : undefined),
      slot("NACHTSICHT", lo.nvg ? "Nachtsichtgerät · Taste N" : "Keins", lo.nvg ? `<button data-action="unequip-gear" data-id="nvg">ABLEGEN</button>` : "", lo.nvg ? "nvg" : undefined),
      slot("RUCKSACK", lo.backpack === "none" ? `Keiner · ${BACKPACKS.none.slots} Plätze` : `${esc(ITEMS[lo.backpack].name)} · ${BACKPACKS[lo.backpack].slots} Plätze`, lo.backpack !== "none" ? `<button data-action="unequip-gear" data-id="backpack">ABLEGEN</button>` : "", lo.backpack !== "none" ? lo.backpack : undefined),
    ].join("")
    const bagSlots = this.company.bagSlots(), secSlots = this.company.secureSlots()
    const weight = [...lo.bag, ...lo.secure].reduce((s, x) => s + ITEMS[x.id].weight * x.qty, 0) + (lo.primary ? WEAPONS[lo.primary].weight : 0) + (lo.secondary ? WEAPONS[lo.secondary].weight : 0)
    const grid = (list: BagSlot[], size: number, from: "bag" | "secure") => `<div class="bag-grid">${Array.from({ length: size }, (_, i) => { const s = list[i]; return s ? `<button class="bag-slot" data-action="unpack" data-from="${from}" data-index="${i}" title="${esc(ITEMS[s.id].name)} – zurück ins Lager">${icon(s.id)}<b>${s.qty > 1 ? s.qty : ""}</b><small>${esc(ITEMS[s.id].short)}</small></button>` : `<span class="bag-slot empty"></span>` }).join("")}</div>`
    const filters = (["all", ...CAT_ORDER] as const).map(c => `<button class="tab small ${this.stashFilter === c ? "active" : ""}" data-action="stash-filter" data-id="${c}">${c === "all" ? "ALLE" : CAT_NAMES[c].toUpperCase()}</button>`).join("")
    const ids = (Object.keys(p.stash) as ItemId[]).filter(id => this.company.count(id) > 0 && (this.stashFilter === "all" || ITEMS[id].cat === this.stashFilter)).sort((a, b) => CAT_ORDER.indexOf(ITEMS[a].cat) - CAT_ORDER.indexOf(ITEMS[b].cat) || ITEMS[b].rarity - ITEMS[a].rarity)
    const rows = ids.map(id => {
      const it = ITEMS[id], n = this.company.count(id), stack = Math.min(n, it.stack)
      const w = weaponOfItem(id)
      const equip = w ? `<button data-action="equip-weapon" data-id="${w}">AUSRÜSTEN</button>` : ["armor", "plate", "helmet", "nvg", "pack_small", "pack_large"].includes(id) ? `<button data-action="equip-gear" data-id="${id}">ANLEGEN</button>` : ""
      const pack = w ? "" : `<button data-action="pack" data-id="${id}" data-qty="1">+1</button>${stack > 1 ? `<button data-action="pack" data-id="${id}" data-qty="${stack}">+${stack}</button>` : ""}<button data-action="pack-secure" data-id="${id}" title="In den sicheren Behälter">⛨</button>`
      return `<div class="stash-row" style="--rar:${RARITY_COLORS[it.rarity]}">${icon(id, "s")}<div><b>${esc(it.name)}</b><small>${CAT_NAMES[it.cat]} · ${kg(it.weight)} · ${RARITY_NAMES[it.rarity]}</small></div><strong>${n}</strong><div class="row-actions">${equip}${pack}</div></div>`
    }).join("") || `<p class="empty-note">Nichts in dieser Kategorie.</p>`
    const emergency = !lo.primary && !lo.secondary ? `<button class="secondary" data-action="emergency">NOTFALLAUSRÜSTUNG</button>` : ""
    this.panel("inventory", "LAGER & RUCKSACK", `<div class="content-heading"><div><span class="eyebrow">AUSRÜSTUNG FÜR DEN NÄCHSTEN EINSATZ</span><h2>Lager & Rucksack.</h2></div><div class="heading-actions"><button class="primary" data-action="quick-pack"><span>SCHNELL PACKEN</span><b>⚡</b></button><button class="secondary" data-action="unpack-all">ALLES AUSPACKEN</button>${emergency}</div></div>
      <div class="inv-layout"><section class="inv-col"><div class="subheading"><h3>AUSRÜSTUNG</h3><span>WIRD MITGENOMMEN</span></div>${slots}</section>
      <section class="inv-col"><div class="subheading"><h3>RUCKSACK</h3><span>${lo.bag.length} / ${bagSlots} PLÄTZE · ${kg(weight)}</span></div>${grid(lo.bag, bagSlots, "bag")}
      <div class="subheading secure-head"><h3>⛨ SICHERER BEHÄLTER</h3><span>${lo.secure.length} / ${secSlots} · BLEIBT BEIM TOD ERHALTEN</span></div>${grid(lo.secure, secSlots, "secure")}
      <p class="slot-note">Ein Platz fasst einen Stapel (z. B. 60 Patronen oder 5 Verbände). Ab ${p.loadout.backpack === "pack_large" ? 42 : 32} kg werden Sie langsamer. Gegenstände anklicken, um sie zurück ins Lager zu legen.</p></section>
      <section class="inv-col stash-col"><div class="subheading"><h3>LAGER</h3><span>UNBEGRENZT</span></div><div class="tabs wrap">${filters}</div><div class="stash-list">${rows}</div></section></div>`)
  }

  // ───────────────────────────── armory ─────────────────────────────

  showArmory(): void {
    const lo = this.company.profile.loadout, s = this.armorySlot, armory = this.company.level("armory")
    const id = s === "primary" ? lo.primary : lo.secondary, mods = s === "primary" ? lo.primaryMods : lo.secondaryMods, ammo = s === "primary" ? lo.primaryAmmo : lo.secondaryAmmo
    const tabs = (["primary", "secondary"] as const).map(x => `<button class="tab ${s === x ? "active" : ""}" data-action="armory-slot" data-id="${x}">${x === "primary" ? "HAUPTWAFFE" : "SEITENWAFFE"}</button>`).join("")
    let body: string
    if (!id) body = `<p class="empty-note">Keine Waffe in diesem Platz. Im Lager eine Waffe ausrüsten.</p><button class="secondary" data-action="inventory">ZUM LAGER</button>`
    else {
      const w = WEAPONS[id], eff = effectiveWeapon(id, mods, ammo ?? undefined)
      const slotRows = w.slots.map(sl => {
        const cur = mods[sl], options = ATTACHMENT_ORDER.filter(a => ATTACHMENTS[a].slot === sl && canAttach(id, a))
        const opts = options.map(a => {
          const have = this.company.count(a), need = ATTACHMENTS[a].armory
          return `<button class="att-option ${cur === a ? "active" : ""}" data-action="attach" data-id="${a}" ${cur === a || have <= 0 || armory < need ? "disabled" : ""} title="${esc(ATTACHMENTS[a].description)}">${icon(a, "s")}<span>${esc(ATTACHMENTS[a].name)}<small>${cur === a ? "MONTIERT" : armory < need ? `WERKSTATT ${need}` : have > 0 ? `${have} IM LAGER` : "NICHT IM LAGER"}</small></span></button>`
        }).join("")
        return `<div class="att-slot"><div class="att-head"><small>${SLOT_NAMES[sl]}</small><b>${cur ? esc(ATTACHMENTS[cur].name) : "—"}</b>${cur ? `<button data-action="detach" data-id="${sl}">ABNEHMEN</button>` : ""}</div><div class="att-options">${opts || `<small class="slot-note">Keine passenden Aufsätze.</small>`}</div></div>`
      }).join("")
      const ammoRows = w.caliber ? AMMO_FOR[w.caliber].map(a => `<button class="att-option ${ammo === a ? "active" : ""}" data-action="set-ammo" data-id="${a}" ${ammo === a ? "disabled" : ""}>${icon(a, "s")}<span>${esc(AMMO[a].name)}<small>${ammo === a ? "GEWÄHLT" : `${this.company.count(a)} IM LAGER`} · DURCHSCHLAG ${Math.round(AMMO[a].penetration * 100)} %</small></span></button>`).join("") : ""
      body = `<div class="armory-layout"><article class="armory-weapon">${icon(`w_${id}`)}<div><h3>${esc(w.name)}</h3><p>${esc(w.description)}</p></div>${weaponStats(id, eff)}</article><div class="armory-slots">${ammoRows ? `<div class="att-slot"><div class="att-head"><small>MUNITION</small><b>${ammo ? esc(AMMO[ammo].name) : "—"}</b></div><div class="att-options">${ammoRows}</div></div>` : ""}${slotRows}</div></div>`
    }
    const note = armory === 0 ? `<div class="briefing-warn">Ohne Waffenwerkstatt können keine Aufsätze montiert werden. Bauen Sie sie unter „Basis & Personal“.</div>` : ""
    this.panel("armory", "WAFFENWERKSTATT", `<div class="content-heading"><div><span class="eyebrow">WAFFENWERKSTATT · STUFE ${armory}</span><h2>Waffen anpassen.</h2></div></div>${note}<div class="tabs">${tabs}</div>${body}`)
  }

  // ───────────────────────────── crafting ─────────────────────────────

  showCrafting(): void {
    const p = this.company.profile, st = this.craftStation
    const stations: RecipeStation[] = ["workbench", "workshop", "armory", "clinic", "kitchen"]
    const tabs = stations.map(x => `<button class="tab ${st === x ? "active" : ""}" data-action="craft-station" data-id="${x}">${STATION_NAMES[x].toUpperCase()} <small>${this.company.level(x)}</small></button>`).join("")
    const lvl = this.company.level(st), job = p.crafting.find(j => j.station === st)
    const recipes = RECIPES.filter(r => r.station === st).map(r => {
      const inputs = (Object.entries(r.inputs) as [ItemId, number][]).map(([id, n]) => `<span class="${this.company.count(id) >= n ? "ok" : "miss"}">${n}× ${esc(ITEMS[id].name)} <small>(${this.company.count(id)})</small></span>`).join("")
      const locked = lvl < r.level
      return `<div class="recipe ${locked ? "locked" : ""}">${icon(r.output)}<div><b>${r.qty > 1 ? `${r.qty}× ` : ""}${esc(ITEMS[r.output].name)}</b><div class="inputs">${inputs}</div></div><small>${formatTime(r.seconds)}</small><button data-action="craft" data-id="${r.id}" ${locked || !!job || !this.company.hasItems(r.inputs) ? "disabled" : ""}>${locked ? `STUFE ${r.level}` : "HERSTELLEN"}</button></div>`
    }).join("")
    const running = job ? `<div class="craft-running">ARBEITET: ${esc(ITEMS[RECIPES.find(r => r.id === job.recipe)!.output].name)} · <b data-ends="${job.endsAt}">${formatTime((job.endsAt - Date.now()) / 1000)}</b></div>` : ""
    let production = ""
    if (st === "workshop" && lvl > 0) production = `<div class="production-box"><b>Dauerproduktion</b><span>${p.staff.workshop} Techniker pressen laufend:</span><div class="att-options">${RECIPES.filter(r => r.station === "workshop" && r.level <= lvl).map(r => `<button class="att-option ${p.workshopAmmo === r.output ? "active" : ""}" data-action="workshop-ammo" data-id="${r.output}" ${p.workshopAmmo === r.output ? "disabled" : ""}>${icon(r.output, "s")}<span>${esc(ITEMS[r.output].name)}</span></button>`).join("")}</div></div>`
    if (st === "clinic") production = `<div class="production-box"><b>Behandlung</b><span>${p.infection > 0 ? `Infektion ${Math.round(p.infection)} % – ${lvl >= 2 ? "wird behandelt (−10 % pro Minute)" : "Feldlazarett Stufe 2 behandelt Infektionen"}` : "Keine Infektion."} · ${p.staff.clinic} Sanitäter stellen Verbände her.</span></div>`
    if (st === "kitchen") production = `<div class="production-box"><b>Versorgung</b><span>${p.staff.kitchen} Köche bereiten laufend Wasser und Konserven zu.</span></div>`
    const missing = lvl === 0 ? `<div class="briefing-warn">${STATION_NAMES[st]} ist noch nicht gebaut.</div>` : ""
    this.panel("crafting", "HERSTELLUNG", `<div class="content-heading"><div><span class="eyebrow">AUS BEUTE WIRD AUSRÜSTUNG</span><h2>Herstellung.</h2></div></div><div class="tabs">${tabs}</div>${missing}${running}${production}<div class="recipe-list">${recipes}</div>`)
  }

  // ───────────────────────────── build & staff ─────────────────────────────

  showBuild(): void {
    const p = this.company.profile, focus = this.buildFocus
    const order = focus ? [focus, ...STRUCTURE_ORDER.filter(x => x !== focus)] : STRUCTURE_ORDER
    const cards = order.map(id => {
      const s = STRUCTURES[id], lvl = this.company.level(id), req = this.company.buildRequirement(id), cost = lvl < s.max ? s.costs[lvl] : null
      const costHtml = cost ? `<div class="cost">${cost.money ? `<span class="${p.money >= cost.money ? "ok" : "miss"}">${money(cost.money)}</span>` : ""}${(Object.entries(cost.items) as [ItemId, number][]).map(([it, n]) => `<span class="${this.company.count(it) >= n ? "ok" : "miss"}">${n}× ${esc(ITEMS[it].name)}</span>`).join("")}</div>` : ""
      const btn = lvl >= s.max ? `<button class="build-button" disabled><span>MAXIMALAUSBAU</span><b>✓</b></button>` : `<button class="build-button ${req || !this.company.canAfford(cost!) ? "short" : ""}" data-action="build-structure" data-id="${id}" ${req ? "disabled" : ""}><span>${lvl === 0 ? "ERRICHTEN" : `AUF STUFE ${lvl + 1}`}</span><b>${req ? esc(req) : this.company.canAfford(cost!) ? "BEREIT" : "MATERIAL FEHLT"}</b></button>`
      return `<article class="building-card v3 level-${lvl} ${focus === id ? "focus" : ""}"><div class="building-top"><span class="building-code">${s.short}</span><span>STUFE ${lvl} / ${s.max}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p>${lvl < s.max ? `<small class="perk">NÄCHSTE STUFE: ${esc(s.perks[lvl] ?? "")}</small>` : `<small class="perk">${esc(s.perks[s.max - 1] ?? "")}</small>`}${costHtml}${btn}</article>`
    }).join("")
    const jobs = (Object.keys(STAFF_JOBS) as StaffJob[]).map(j => `<div class="staff-row v3"><span>${STAFF_JOBS[j].name.toUpperCase()}<small>${esc(STRUCTURES[STAFF_JOBS[j].structure].name)}</small></span><button data-action="staff" data-id="${j}" data-delta="-1" aria-label="weniger">−</button><b>${p.staff[j]} / ${this.company.jobCap(j)}</b><button data-action="staff" data-id="${j}" data-delta="1" aria-label="mehr">+</button></div>`).join("")
    const threat = Math.round(p.base.threat), def = this.company.defense()
    this.panel("build", "BASIS & PERSONAL", `<div class="content-heading"><div><span class="eyebrow">AUSBAU DER BASIS</span><h2>Basis & Personal.</h2></div><div class="staff-counter"><small>FREIES PERSONAL</small><b>${this.company.availableStaff()} <span>/ ${this.company.staffCap()}</span></b></div></div>
      <div class="base-status"><div><small>BEDROHUNG</small><div class="threat-bar"><i style="width:${threat}%"></i><em style="left:${BASE_ATTACK.threshold}%"></em></div><b>${threat} %</b></div><div><small>VERTEIDIGUNG</small><b>${def}</b></div>${p.base.attackPending ? `<button class="primary" data-action="attack"><span>ANGRIFF ABWEHREN</span><b>☣</b></button>` : `<span class="slot-note">Ab ${BASE_ATTACK.threshold} % greifen Infizierte die Basis an. Mauern, Türme und Wachen halten sie auf.</span>`}</div>
      <section class="staff-section"><div class="subheading"><h3>PERSONAL EINTEILEN</h3><span>QUARTIERE AUSBAUEN FÜR MEHR LEUTE</span></div><div class="staff-grid">${jobs}</div></section>
      ${this.productionHtml()}
      ${this.expeditionsHtml()}
      <div class="building-grid v3">${cards}</div>`)
    this.buildFocus = null
  }

  /** Production per hour of every staffed building (what the base makes while you are away). */
  private productionHtml(): string {
    const c = this.company, p = c.profile
    const rows = (["workshop", "clinic", "kitchen", "scrapyard"] as ProducerId[]).map(k => {
      const rate = c.productionRate(k), lvl = c.level(k)
      const what = k === "workshop" ? esc(ITEMS[p.workshopAmmo].name) : esc(PRODUCTION[k].describe)
      return `<div class="prod-row ${rate ? "" : "idle"}"><b>${esc(STRUCTURES[k].name)}</b><span>${lvl ? what : "nicht gebaut"}</span><strong>${rate ? `${Math.round(rate)} / h` : lvl ? "kein Personal" : "—"}</strong></div>`
    }).join("")
    return `<section class="prod-section"><div class="subheading"><h3>PRODUKTION</h3><span>LÄUFT WEITER, AUCH WÄHREND DER EINSÄTZE (BIS 2 STUNDEN)</span></div><div class="prod-grid">${rows}</div></section>`
  }

  /** Garage: send crews out; running trips with time left. */
  private expeditionsHtml(): string {
    const c = this.company, p = c.profile, garage = c.level("garage")
    if (!garage) return `<section class="exp-section"><div class="subheading"><h3>EXPEDITIONEN</h3><span>GARAGE ERRICHTEN, UM TRUPPS LOSZUSCHICKEN</span></div></section>`
    const now = Date.now()
    const running = p.expeditions.map(e => `<div class="exp-run"><b>${esc(EXPEDITIONS[e.destination].name)}</b><span>${e.crew} ${e.crew === 1 ? "Person" : "Personen"}</span><strong data-ends="${e.endsAt}">${formatTime(Math.max(0, (e.endsAt - now) / 1000))}</strong></div>`).join("")
    const cards = EXPEDITION_ORDER.map(id => {
      const e = EXPEDITIONS[id], locked = garage < e.garage, risk = Math.round(e.risk * (garage >= 3 ? 50 : 100))
      const why = locked ? `GARAGE ${e.garage}` : p.expeditions.length >= c.expeditionSlots() ? "ALLE UNTERWEGS" : c.availableStaff() < e.crew ? `${e.crew} FREIE LEUTE NÖTIG` : id !== "outskirts" && c.count("fuel") < 1 ? "TREIBSTOFF NÖTIG" : ""
      return `<article class="exp-card ${locked ? "locked" : ""}"><h4>${esc(e.name)}</h4><p>${esc(e.description)}</p><small>${e.crew} ${e.crew === 1 ? "PERSON" : "PERSONEN"} · ${e.minutes} MIN · RISIKO ${risk} %${id !== "outskirts" ? " · 1× TREIBSTOFF" : ""}</small><button data-action="expedition" data-id="${id}" ${why ? "disabled" : ""}>${why || "LOSSCHICKEN"}</button></article>`
    }).join("")
    return `<section class="exp-section"><div class="subheading"><h3>EXPEDITIONEN · ${p.expeditions.length} / ${c.expeditionSlots()} FAHRZEUGE</h3><span>DER TRUPP KOMMT VON SELBST ZURÜCK, DIE BEUTE LANDET IM LAGER</span></div>${running ? `<div class="exp-running">${running}</div>` : ""}<div class="exp-grid">${cards}</div></section>`
  }

  // ───────────────────────────── research ─────────────────────────────

  showResearch(): void {
    const p = this.company.profile, ar = p.activeResearch, lab = this.company.level("lab")
    const cards = RESEARCH_ORDER.map(id => {
      const r = RESEARCH[id], done = p.research.includes(id), active = ar?.id === id, locked = lab < r.labLevel
      const cost = `${money(r.money)}${(Object.entries(r.items) as [ItemId, number][]).map(([it, n]) => ` · <span class="${this.company.count(it) >= n ? "ok" : "miss"}">${n}× ${esc(ITEMS[it].name)}</span>`).join("")}`
      return `<article class="research-card ${done ? "done" : ""} ${locked ? "locked" : ""}"><span class="research-symbol">${done ? "✓" : locked ? "⌁" : "⌬"}</span><div><h4>${esc(r.name)}</h4><p>${esc(r.description)}</p><small>${cost} · ${formatTime(r.seconds)} · LABOR ${r.labLevel}</small></div><button data-action="research" data-id="${id}" ${done || active || locked ? "disabled" : ""}>${done ? "ERFORSCHT" : active ? "LÄUFT" : locked ? `LABOR ${r.labLevel}` : "STARTEN"}</button></article>`
    }).join("")
    this.panel("research", "FORSCHUNG", `<div class="content-heading"><div><span class="eyebrow">FORSCHUNGSLABOR · STUFE ${lab} · ${p.staff.lab} ANALYSTEN</span><h2>Forschung.</h2></div><div class="dealer-tag">${ar ? `AKTIV: <b>${esc(RESEARCH[ar.id].name.toUpperCase())}</b> · <b data-ends="${ar.endsAt}">${formatTime((ar.endsAt - Date.now()) / 1000)}</b>` : "KEIN AKTIVES PROGRAMM"}</div></div>${lab === 0 ? `<div class="briefing-warn">Bauen Sie zuerst das Forschungslabor und teilen Sie einen Analysten ein.</div>` : ""}<div class="research-grid">${cards}</div>`)
  }

  // ───────────────────────────── radio: contracts & raid planning ─────────────────────────────

  showRadio(): void {
    const p = this.company.profile, zone = this.handlers.zone(), hq = this.company.level("hq")
    if (!this.plan.insertion || !zone.insertions.some(i => i.id === this.plan.insertion && i.hq <= hq)) this.plan.insertion = zone.insertions.find(i => i.hq <= hq)?.id ?? zone.insertions[0].id
    const active = p.contracts.active.map(c => `<div class="contract-card v3 active"><div><span class="eyebrow">AKTIV</span><b>${esc(c.title)}</b><small>${esc(c.text)}</small><div class="thin-bar"><i style="width:${c.progress / c.target * 100}%"></i></div></div><div class="contract-side"><strong>${money(c.reward.money)}</strong><small>${c.progress} / ${c.target}</small>${c.kind === "fetch" ? `<button data-action="deliver" data-id="${c.id}">ABGEBEN</button>` : ""}<button class="text-button danger-text" data-action="abandon" data-id="${c.id}">ABBRECHEN</button></div></div>`).join("")
    const offers = p.contracts.offers.map(o => `<div class="contract-card v3"><div><span class="eyebrow">${o.kind === "boss" ? "GEFÄHRLICH" : "ANGEBOT"}</span><b>${esc(o.title)}</b><small>${esc(o.text)}</small></div><div class="contract-side"><strong>${money(o.reward.money)}</strong><small>+${o.reward.xp} EP${o.reward.items ? ` · ${(Object.entries(o.reward.items) as [ItemId, number][]).map(([id, n]) => `${n}× ${esc(ITEMS[id].name)}`).join(", ")}` : ""}</small><button data-action="accept" data-id="${o.id}" ${p.contracts.active.length >= this.company.contractSlots() ? "disabled" : ""}>ANNEHMEN</button></div></div>`).join("") || `<p class="empty-note">Keine Angebote. Neue Funksprüche kommen bald.</p>`
    const insertions = zone.insertions.map(i => {
      const locked = i.hq > hq, d = zone.districts.find(x => x.id === i.district)
      return `<button class="choice ${this.plan.insertion === i.id ? "active" : ""}" data-action="plan-insertion" data-id="${i.id}" ${locked ? "disabled" : ""}><b>${esc(i.name)}</b><small>${locked ? `KOMMANDOZENTRALE ${i.hq}` : `${esc(d?.name ?? i.district)} · ${"☣".repeat(d?.danger ?? 1)}`}</small></button>`
    }).join("")
    const times = TIME_ORDER.map(t => `<button class="choice ${this.plan.time === t ? "active" : ""}" data-action="plan-time" data-id="${t}"><b>${TIMES[t].name}</b><small>${TIMES[t].clock} · Infizierte ×${TIMES[t].infected}${TIMES[t].loot ? ` · Beute +${Math.round(TIMES[t].loot * 100)} %` : ""}</small></button>`).join("")
    const weathers = WEATHER_ORDER.map(w => `<button class="choice ${this.plan.weather === w ? "active" : ""}" data-action="plan-weather" data-id="${w}"><b>${WEATHER[w].name}</b><small>${WEATHER[w].note}</small></button>`).join("")
    const lo = p.loadout, warnings: string[] = []
    if (!lo.primary && !lo.secondary) warnings.push("Keine Schusswaffe ausgerüstet – nur das Messer.")
    const ammoFor = (id: WeaponId | null, ammo: AmmoId | null) => !id || !ammo || lo.bag.some(s => s.id === ammo)
    if (!ammoFor(lo.primary, lo.primaryAmmo) || !ammoFor(lo.secondary, lo.secondaryAmmo)) warnings.push("Keine Ersatzmunition im Rucksack (nur das eingesetzte Magazin).")
    if (!lo.bag.some(s => ITEMS[s.id].cat === "medical")) warnings.push("Keine Medizin im Rucksack – Blutungen sind tödlich.")
    if (!lo.bag.some(s => s.id === "water" || s.id === "soda")) warnings.push("Kein Wasser dabei.")
    if (p.infection >= 30) warnings.push(`Sie sind infiziert (${Math.round(p.infection)} %). Ein Gegenmittel einpacken oder im Lazarett behandeln lassen.`)
    if (p.base.attackPending) warnings.push("Die Basis wird angegriffen! Ohne Abwehr verlieren Sie Vorräte.")
    const kit = `${lo.primary ? esc(WEAPONS[lo.primary].short) : "—"} · ${lo.secondary ? esc(WEAPONS[lo.secondary].short) : "—"} · ${esc(WEAPONS[lo.melee].short)} · ${lo.armor ? `Weste ${lo.armor}` : "keine Weste"}${lo.helmet ? " · Helm" : ""}${lo.nvg ? " · NVG" : ""} · Rucksack ${lo.bag.length}/${this.company.bagSlots()} · Sicher ${lo.secure.length}/${this.company.secureSlots()}`
    this.panel("radio", "EINSATZ & FUNK", `<div class="content-heading"><div><span class="eyebrow">FUNKSTATION · STUFE ${this.company.level("radio")}</span><h2>Einsatz planen.</h2></div><span class="risk-note">SCHWIERIGKEIT: ${DIFFICULTY[this.settings.difficulty].name.toUpperCase()} · TOD = AUSRÜSTUNG WEG</span></div>
      <div class="radio-layout"><section><div class="subheading"><h3>AUFTRÄGE</h3><span>${p.contracts.active.length} / ${this.company.contractSlots()} AKTIV · NEUE IN <b data-ends="${p.contracts.refreshAt}">${formatTime((p.contracts.refreshAt - Date.now()) / 1000)}</b></span></div>${active}${offers}</section>
      <article class="briefing-card plan"><div class="briefing-body"><span class="eyebrow">EINSTIEGSPUNKT</span><div class="choices">${insertions}</div><span class="eyebrow">TAGESZEIT</span><div class="choices">${times}</div><span class="eyebrow">WETTER</span><div class="choices">${weathers}</div>
      <div class="loadout-line"><span>MITNAHME</span><b>${kit}</b></div>${warnings.map(w => `<div class="briefing-warn">${esc(w)}</div>`).join("")}
      <div class="plan-actions"><button class="secondary" data-action="inventory">RUCKSACK PACKEN</button><button class="primary deploy" data-action="deploy"><span>IN DIE ZONE</span><b>→</b></button></div>
      <small class="deploy-note">Einsatzzeit ${formatTime(30 * 60)} · Extraktionen werden pro Einsatz zufällig geöffnet · ${zone.extractions.length} mögliche Ausgänge</small></div></article></div>`)
  }

  // ───────────────────────────── base attack ─────────────────────────────

  showAttack(): void {
    this.pad.reset()
    const p = this.company.profile
    if (!p.base.attackPending) { this.showMenu(); return }
    this.screen = "attack"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen attack-screen"
    const def = this.company.defense(), threat = Math.round(p.base.threat), chance = Math.max(5, Math.min(95, Math.round((def + 10 - threat * 0.8) / 20 * 100 + 50)))
    const lo = p.loadout
    this.root.innerHTML = `<div class="modal-card attack-card"><span class="eyebrow">☣ ALARM</span><h2>ANGRIFF</h2><p>Eine Horde Infizierter stürmt auf die Basis zu. Bedrohung <b>${threat} %</b>, Verteidigung <b>${def}</b>.</p>
      <button class="primary" data-action="defend" ${!lo.primary && !lo.secondary ? "disabled" : ""}><span>SELBST VERTEIDIGEN</span><b>→</b></button><small>3 Wellen mit Ihrer aktuellen Ausrüstung (Rucksack-Munition). Sieg: kein Verlust, Belohnung und Erfahrung.</small>
      <button class="secondary" data-action="auto-defend">DEN WACHEN ÜBERLASSEN · ca. ${chance} %</button><small>Bei einer Niederlage gehen ${Math.round(BASE_ATTACK.lossFraction * 100)} % von Material, Nahrung und Medizin verloren.</small>
      <button class="text-button" data-action="menu">SPÄTER</button></div>`
  }

  // ───────────────────────────── settings ─────────────────────────────

  private settingsRows(compact = false): string {
    const s = this.settings
    const range = (key: string, label: string, help: string, min: number, max: number, step: number, value: number, shown: string) => `<label class="setting-row"><div><b>${label}</b><small>${help}</small></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}"><output>${shown}</output></label>`
    const toggle = (action: string, label: string, help: string, on: boolean, text: string) => `<div class="setting-row"><div><b>${label}</b><small>${help}</small></div><button class="toggle ${on ? "on" : ""}" data-action="${action}">${text}</button></div>`
    const rows = [
      touchEnabled(s) ? range("sensitivity", "BLICK-EMPFINDLICHKEIT", "Umsehen durch Wischen auf der rechten Bildschirmhälfte.", 0.2, 1.8, 0.05, s.sensitivity, s.sensitivity.toFixed(2))
        : range("sensitivity", "MAUSEMPFINDLICHKEIT", "Umsehen mit der Maus.", 0.2, 1.8, 0.05, s.sensitivity, s.sensitivity.toFixed(2)),
      range("adsSensitivity", "EMPFINDLICHKEIT BEIM ZIELEN", "Faktor, solange die rechte Maustaste gehalten wird.", 0.3, 1.5, 0.05, s.adsSensitivity, `× ${s.adsSensitivity.toFixed(2)}`),
      range("fov", "SICHTFELD (FOV)", "Größer = mehr Überblick, kleiner = mehr Detail.", 60, 100, 1, s.fov, `${s.fov}°`),
      range("volume", "LAUTSTÄRKE", "Alle Geräusche werden im Browser erzeugt.", 0, 1, 0.05, s.volume, `${Math.round(s.volume * 100)} %`),
    ]
    const gore = toggle("gore", "GORE", "Brutal: abgetrennte Gliedmaßen, platzende Köpfe, viel Blut. Normal: Blut ohne Zerstückelung. Aus: kein Blut.", s.gore !== "off", GORE_NAMES[s.gore])
    if (compact) return rows.join("") + gore
    return rows.join("") + [
      gore,
      toggle("mute", "TON", "Alle Geräusche an oder aus.", !s.muted, s.muted ? "STUMM" : "AN"),
      toggle("invert", "Y-ACHSE UMKEHREN", "Maus nach oben schaut nach unten.", s.invertY, s.invertY ? "EIN" : "AUS"),
      toggle("difficulty", "SCHWIERIGKEIT", DIFFICULTY[s.difficulty].description, s.difficulty !== "easy", DIFFICULTY[s.difficulty].name.toUpperCase()),
      toggle("quality", "GRAFIKQUALITÄT", "Niedrig: ohne Schatten und mit geringerer Auflösung – für schwächere Rechner.", s.quality === "high", s.quality === "high" ? "HOCH" : "NIEDRIG"),
      toggle("shake", "BILDSCHIRMWACKELN", "Wackeln bei Schüssen, Treffern und Explosionen.", s.screenShake, s.screenShake ? "AN" : "AUS"),
      toggle("fps", "BILDRATE ANZEIGEN", "Zeigt die Bilder pro Sekunde im Einsatz.", s.showFps, s.showFps ? "AN" : "AUS"),
      toggle("touch", "TOUCH-STEUERUNG", "Knöpfe und Stick auf dem Bildschirm. Automatisch: an auf Handys und Tablets.", s.touch !== "off", s.touch === "auto" ? "AUTOMATISCH" : s.touch === "on" ? "AN" : "AUS"),
    ].join("")
  }

  showSettings(): void {
    this.panel("settings", "EINSTELLUNGEN", `<div class="content-heading"><div><span class="eyebrow">SYSTEMKONFIGURATION</span><h2>Einstellungen.</h2></div></div><div class="settings-list">${this.settingsRows()}</div>
      <div class="danger-zone"><div><h3>LOKALER SPIELSTAND</h3><p>Alles wird automatisch gespeichert. Browserdaten löschen entfernt den Fortschritt.</p></div><button class="secondary" data-action="save">JETZT SPEICHERN</button><button class="danger-button" data-action="reset">NEU ANFANGEN</button></div>
      <div class="manual"><h3>STEUERUNG</h3><div><span><kbd>W A S D</kbd> Bewegen</span><span><kbd>SHIFT</kbd> Sprinten</span><span><kbd>C</kbd> Ducken</span><span><kbd>LINKS</kbd> Feuer / Schlag</span><span><kbd>RECHTS</kbd> Zielen</span><span><kbd>R</kbd> Nachladen</span><span><kbd>T</kbd> Munitionssorte</span><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> / <kbd>MAUSRAD</kbd> Waffe</span><span><kbd>V</kbd> Schnelles Messer</span><span><kbd>E</kbd> Benutzen / Durchsuchen</span><span><kbd>Q</kbd> Heilen</span><span><kbd>G</kbd> Werfen · <kbd>4</kbd> Wurfwaffe wählen</span><span><kbd>F</kbd> Taschenlampe</span><span><kbd>N</kbd> Nachtsicht (mit Gerät)</span><span><kbd>M</kbd> Karte</span><span><kbd>TAB</kbd> Rucksack</span><span><kbd>ESC</kbd> Pause</span></div></div>`)
  }

  // ───────────────────────────── in raid / base overlays ─────────────────────────────

  showPlaying(): void { this.screen = "playing"; this.root.className = "screen hidden"; this.root.innerHTML = ""; this.hudRoot.classList.remove("hidden") }

  showPause(): void {
    this.pad.reset()
    this.screen = "paused"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen"
    const mode = this.handlers.mode(), inBase = mode === "base"
    const contracts = this.company.profile.contracts.active.map(c => `<div><span>${esc(c.title)}</span><b>${c.progress}/${c.target}</b></div>`).join("")
    this.root.innerHTML = `<div class="modal-card pause-card"><span class="eyebrow">${inBase ? "BASIS" : mode === "defense" ? "VERTEIDIGUNG" : "EINSATZ UNTERBROCHEN"}</span><h2>PAUSE</h2>${contracts ? `<div class="pause-contracts">${contracts}</div>` : ""}<button class="primary" data-action="resume"><span>FORTSETZEN</span><b>→</b></button>${inBase ? "" : `<div class="pause-row"><button class="secondary" data-action="raid-inventory">RUCKSACK</button>${mode === "raid" ? `<button class="secondary" data-action="raid-map">KARTE</button>` : ""}</div>`}<div class="pause-settings"><span class="eyebrow">SCHNELLEINSTELLUNGEN</span><div class="settings-list compact">${this.settingsRows(true)}</div></div>${inBase ? `<button class="secondary" data-action="menu">ZUM HAUPTMENÜ</button>` : `<button class="text-button danger-text" data-action="abort">${mode === "defense" ? "VERTEIDIGUNG AUFGEBEN" : "EINSATZ ABBRECHEN"}</button><small>${mode === "defense" ? "Aufgeben zählt als verlorene Verteidigung." : "Beim Abbrechen gehen Rucksack und Ausrüstung verloren – nur der sichere Behälter bleibt."}</small>`}</div>`
  }

  /** Tab in the raid: backpack with use / drop / secure container; in the base it opens the stash. */
  showRaidInventory(): void {
    if (this.handlers.mode() === "base") { this.fromBase = true; this.show("inventory"); return }
    this.pad.reset()
    this.screen = "raidInventory"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen"
    const st = this.handlers.raidStatus(), v = st.vitals
    const grid = (bag: Bag, from: "bag" | "secure") => `<div class="bag-grid">${Array.from({ length: bag.slots }, (_, i) => {
      const s = bag.items[i]; if (!s) return `<span class="bag-slot empty"></span>`
      const it = ITEMS[s.id], use = from === "bag" && !!it.use
      return `<div class="bag-slot live" tabindex="0" style="--rar:${RARITY_COLORS[it.rarity]}" title="${esc(it.name)}: ${esc(it.description)}">${icon(s.id)}<b>${s.qty > 1 ? s.qty : ""}</b><small>${esc(it.short)}</small><div class="slot-menu">${use ? `<button data-action="raid-use" data-index="${i}">BENUTZEN</button>` : ""}${from === "bag" ? `<button data-action="raid-secure" data-index="${i}">⛨ SICHERN</button><button data-action="raid-drop" data-index="${i}">ABLEGEN</button>` : `<button data-action="raid-unsecure" data-index="${i}">IN RUCKSACK</button>`}</div></div>`
    }).join("")}</div>`
    const value = st.bag.value(id => ITEMS[id].cat === "valuable" ? this.company.sellPrice(id) : 0)
    const bar = (label: string, val: number, cls: string, text = String(Math.round(val))) => `<div class="vbar ${cls}"><small>${label}</small><div><i style="width:${Math.max(0, Math.min(100, val))}%"></i></div><b>${text}</b></div>`
    const weapons = st.weapons.filter(Boolean).map(w => `<span>${esc(w!.name)}${w!.ammo ? ` · ${w!.mag} ${esc(AMMO[w!.ammo].short)}` : ""}</span>`).join("")
    this.root.innerHTML = `<div class="modal-card raid-bag v3"><div class="raid-bag-head"><div><span class="eyebrow">NICHT GESICHERT · NUR EXTRAKTION BRINGT ES HEIM</span><h2>RUCKSACK</h2></div><div class="weight ${st.weightKg > st.weightLimit ? "over" : ""}"><small>GEWICHT</small><b>${kg(st.weightKg)} / ${st.weightLimit} kg</b></div></div>
      <div class="raid-bag-body"><section>${grid(st.bag, "bag")}<div class="subheading secure-head"><h3>⛨ SICHERER BEHÄLTER</h3><span>BLEIBT BEIM TOD ERHALTEN</span></div>${grid(st.secure, "secure")}</section>
      <aside class="vitals-panel">${bar("GESUNDHEIT", v.health, "hp")}${bar("ESSEN", v.energy, "food")}${bar("WASSER", v.water, "water")}${bar("INFEKTION", v.infection, "infect", `${Math.round(v.infection)} %`)}<div class="status-tags">${v.bleed !== "none" ? `<span class="bleed">${v.bleed === "heavy" ? "STARKE BLUTUNG" : "BLUTUNG"}</span>` : ""}${v.painkiller > 0 ? `<span>SCHMERZMITTEL ${Math.ceil(v.painkiller)} s</span>` : ""}${v.boost > 0 ? `<span>STIM ${Math.ceil(v.boost)} s</span>` : ""}</div><div class="kit-lines">${weapons}<span>Weste ${Math.round(st.armor)} · Helm ${Math.round(st.helmet)}</span><span>Wertsachen: <b>${money(value)}</b></span></div></aside></div>
      <button class="primary" data-action="resume"><span>ZURÜCK</span><b>→</b></button></div>`
  }

  /** Loot window: container on the left, backpack on the right. */
  showLoot(session: LootSession): void {
    if (this.screen !== "loot") this.pad.reset()
    this.loot = session
    this.screen = "loot"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen loot-screen"
    const items = session.items, bag = session.bag
    const list = items.length ? items.map((s, i) => { const it = ITEMS[s.id]; return `<button class="loot-row" data-action="loot-take" data-index="${i}" style="--rar:${RARITY_COLORS[it.rarity]}">${icon(s.id, "s")}<span><b>${esc(it.name)}</b><small>${CAT_NAMES[it.cat]} · ${kg(it.weight * s.qty)}${it.cat === "valuable" ? ` · ${money(this.company.sellPrice(s.id) * s.qty)}` : ""}</small></span><strong>${s.qty > 1 ? `× ${s.qty}` : ""}</strong></button>` }).join("") : `<p class="empty-note">Leer.</p>`
    const mine = Array.from({ length: bag.slots }, (_, i) => { const s = bag.items[i]; return s ? `<button class="bag-slot" data-action="loot-put" data-index="${i}" title="${esc(ITEMS[s.id].name)} hineinlegen">${icon(s.id)}<b>${s.qty > 1 ? s.qty : ""}</b><small>${esc(ITEMS[s.id].short)}</small></button>` : `<span class="bag-slot empty"></span>` }).join("")
    const pad = this.hud.snapshot?.device === "pad"
    this.root.innerHTML = `<div class="modal-card loot-card"><div class="loot-cols"><section><span class="eyebrow">DURCHSUCHT</span><h2>${esc(session.title)}</h2><div class="loot-list">${list}</div><button class="primary" data-action="loot-all" ${items.length ? "" : "disabled"}><span>ALLES NEHMEN</span><b>${pad ? "Ⓨ" : "F"}</b></button></section>
      <section><span class="eyebrow">RUCKSACK · ${bag.used} / ${bag.slots} · ${kg(bag.weight())}</span><h3>Ihr Rucksack</h3><div class="bag-grid">${mine}</div><small class="slot-note">Anklicken legt den Stapel in den Behälter.</small></section></div>
      <button class="secondary" data-action="loot-close">SCHLIESSEN (${pad ? "Ⓑ" : "E / ESC"})</button></div>`
  }

  showMap(): void {
    this.pad.reset()
    this.screen = "raidInventory"; this.hudRoot.classList.add("hidden"); this.root.className = "screen modal-screen"
    this.root.innerHTML = `<div class="modal-card map-card v3"><div class="map-head"><span class="eyebrow">TAKTISCHE KARTE · NORDEN OBEN</span><button class="tab ${this.mapZoom ? "" : "active"}" data-action="map-zoom" data-id="0">GANZE ZONE</button><button class="tab ${this.mapZoom ? "active" : ""}" data-action="map-zoom" data-id="1">UMGEBUNG</button></div><canvas class="tac-map" width="760" height="760"></canvas><div class="map-legend"><span><i class="you"></i>Sie</span><span><i class="exfil"></i>Extraktion (frei)</span><span><i class="exfil-req"></i>Extraktion (Bedingung)</span><span><i class="obj"></i>Auftragsziel</span><span><i class="crate"></i>Behälter in Reichweite</span><span><i class="drop"></i>Versorgungsabwurf</span><span><i class="danger"></i>Gefahrenzone</span></div><button class="primary" data-action="resume"><span>ZURÜCK</span><b>→</b></button></div>`
    const data = this.handlers.mapData()
    drawTacticalMap(this.root.querySelector("canvas")!, data, this.mapZoom ? { cx: data.player.x, cz: data.player.z, span: 140 } : undefined)
  }

  showResult(result: RaidResult): void {
    this.pad.reset()
    this.lastResult = result; this.fromBase = false
    this.screen = "result"; this.hudRoot.classList.add("hidden"); this.hud.clearBlood(); this.root.className = `screen modal-screen result-${result.success ? "success" : "failure"}`
    const list = (slots: { id: ItemId; qty: number }[]) => slots.map(s => `<div>${icon(s.id, "s")}<span>${esc(ITEMS[s.id].name)}</span><b>${s.qty} ×</b></div>`).join("")
    const contracts = result.contractUpdates.map(c => `<div class="result-contract ${c.done ? "ok" : ""}"><span>${esc(c.title)}</span><b>${c.done ? "ERFÜLLT" : `${c.progress} / ${c.target}`}</b></div>`).join("")
    const attack = this.company.profile.base.attackPending ? `<div class="briefing-warn">Die Basis wird angegriffen! Im Hauptmenü reagieren.</div>` : ""
    this.root.innerHTML = `<div class="result-layout"><section class="result-main"><span class="result-stamp">${result.success ? "EXTRAKTION ERFOLGREICH" : "EINSATZ GESCHEITERT"}</span><h1>${result.success ? "LEBEND<br>RAUS." : "IN DER ZONE<br>GEFALLEN."}</h1><p>${esc(result.reason)}</p>
      <div class="result-stats"><div><small>DAUER</small><b>${formatTime(result.duration)}</b></div><div><small>INFIZIERTE</small><b>${result.infectedKills}</b></div><div><small>SÖLDNER</small><b>${result.mercKills}</b></div><div><small>KOPFSCHÜSSE</small><b>${result.headshots}</b></div><div><small>ZERSTÜCKELT</small><b>${result.dismembered}</b></div><div><small>WERTSACHEN</small><b>${money(result.value)}</b></div><div><small>ERFAHRUNG</small><b>+${result.xp} EP</b></div>${result.rescued ? `<div><small>GERETTET</small><b>${result.rescued} → Basis</b></div>` : ""}<div><small>${TIMES[result.time].name.toUpperCase()}</small><b>${esc(result.insertion)}</b></div></div>
      ${contracts}${result.levelUp ? `<div class="level-up">STUFENAUFSTIEG · LEVEL ${this.company.profile.level} · +250 $</div>` : ""}${attack}
      <div class="result-actions"><button class="primary" data-action="enter-base"><span>IN DIE BASIS</span><b>→</b></button><button class="secondary" data-action="radio">NÄCHSTER EINSATZ</button><button class="secondary" data-action="menu">HAUPTMENÜ</button></div></section>
      <aside class="result-loot">${result.loot.length ? `<span class="eyebrow">INS LAGER</span>${list(result.loot)}` : `<span class="eyebrow">INS LAGER</span><p>Nichts mitgebracht.</p>`}${result.lost.length ? `<span class="eyebrow lost">VERLOREN</span>${list(result.lost)}` : ""}${result.leftForOthers ? `<p class="loss-note">Ihre wertvollste Ausrüstung liegt jetzt dort, wo Sie gefallen sind – andere Spieler können sie finden.</p>` : ""}</aside></div>`
  }

  updateHud(h: HudSnapshot): void { if (this.screen === "playing") this.hud.update(h) }

  // ───────────────────────────── events ─────────────────────────────

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]"); if (!button || button.disabled) return
    const action = button.dataset.action!, id = button.dataset.id as string, index = Number(button.dataset.index), qty = Number(button.dataset.qty || 1)
    this.audio.play("ui_click", { volume: 0.6 })
    const toggleSetting = (mut: () => void) => { mut(); this.handlers.settingsChanged(this.settings); this.hud.showFps = this.settings.showFps; this.refresh(); if (this.screen === "paused") this.showPause() }
    const actions: Record<string, () => void> = {
      menu: () => this.showMenu(), "close-panel": () => this.closePanel(),
      "enter-base": () => { this.fromBase = false; this.showPlaying(); this.handlers.enterBase() },
      radio: () => this.show("radio"), trader: () => this.show("trader"), inventory: () => this.show("inventory"), armory: () => this.show("armory"), crafting: () => this.show("crafting"),
      build: () => this.show("build"),
      "build-structure": () => this.result(this.company.build(id as StructureId), "build_complete", () => this.handlers.structuresChanged()),
      expedition: () => this.result(this.company.sendExpedition(id as ExpeditionId)),
      research: () => id ? this.result(this.company.startResearch(id as ResearchId)) : this.show("research"),
      settings: () => this.show("settings"),
      online: () => this.show("online"),
      achievements: () => this.show("achievements"),
      "board-sort": () => { this.boardSort = id as typeof this.boardSort; for (const b of this.root.querySelectorAll<HTMLElement>(".board-tabs .tab")) b.classList.toggle("active", b.dataset.id === id); this.renderOnline() },
      intro: () => this.root.insertAdjacentHTML("beforeend", this.introCard()),
      "intro-close": () => this.root.querySelector(".intro-backdrop")?.remove(),
      resume: () => this.closeOverlay(),
      "raid-inventory": () => this.showRaidInventory(), "raid-map": () => this.showMap(), abort: () => this.handlers.abort(),
      "trader-tab": () => { this.traderTab = id as typeof this.traderTab; this.showTrader() },
      buy: () => this.result(this.company.buy(id as ItemId, qty), "ui_buy"),
      "buy-weapon": () => this.result(this.company.buyWeapon(id as WeaponId), "ui_buy"),
      sell: () => this.result(this.company.sell(id as ItemId, qty), "ui_buy"),
      "sell-valuables": () => this.result(this.company.sellValuables(), "ui_buy"),
      "stash-filter": () => { this.stashFilter = id as typeof this.stashFilter; this.showInventory() },
      "equip-weapon": () => this.result(this.company.equipWeapon(id as WeaponId)),
      "unequip-weapon": () => this.result(this.company.unequipWeapon(id as "primary" | "secondary" | "melee")),
      "equip-gear": () => this.result(this.company.equipGear(id as GearId)),
      "unequip-gear": () => this.result(this.company.unequipGear(id as "armor" | "helmet" | "nvg" | "backpack")),
      pack: () => this.result(this.company.pack(id as ItemId, qty)),
      "pack-secure": () => this.result(this.company.pack(id as ItemId, Math.min(this.company.count(id as ItemId), ITEMS[id as ItemId].stack), "secure")),
      unpack: () => this.result(this.company.unpack(index, button.dataset.from as "bag" | "secure")),
      "unpack-all": () => { this.company.unpackAll(); this.notify("Rucksack ausgepackt"); this.refresh() },
      "quick-pack": () => this.result(this.company.quickPack()),
      emergency: () => this.result(this.company.emergencyKit()),
      "armory-slot": () => { this.armorySlot = id as "primary" | "secondary"; this.show("armory") },
      attach: () => this.result(this.company.installAttachment(this.armorySlot, id as AttachmentId)),
      detach: () => this.result(this.company.removeAttachment(this.armorySlot, id as AttachmentSlot)),
      "set-ammo": () => this.result(this.company.setAmmo(this.armorySlot, id as AmmoId)),
      "craft-station": () => { this.craftStation = id as RecipeStation; this.showCrafting() },
      craft: () => this.result(this.company.craft(id), "build"),
      "workshop-ammo": () => this.result(this.company.setWorkshopAmmo(id as AmmoId)),
      staff: () => this.result(this.company.assignStaff(id as StaffJob, Number(button.dataset.delta))),
      accept: () => this.result(this.company.acceptContract(id)),
      abandon: () => this.result(this.company.abandonContract(id)),
      deliver: () => this.result(this.company.deliver(id), "ui_buy"),
      "plan-insertion": () => { this.plan.insertion = id; this.showRadio() },
      "plan-time": () => { this.plan.time = id as TimeOfDay; this.showRadio() },
      "plan-weather": () => { this.plan.weather = id as WeatherId; this.showRadio() },
      deploy: () => this.deploy(),
      attack: () => this.showAttack(),
      defend: () => { this.showPlaying(); this.handlers.defend() },
      "auto-defend": () => { const r = this.company.resolveAttack(); this.notify(r.message); this.audio.play(r.ok ? "ui_buy" : "ui_error", { volume: 0.8 }); this.showMenu() },
      "raid-use": () => { if (this.handlers.useItem(index)) this.closeOverlay(); else { this.notify("Gerade nicht möglich"); this.audio.play("ui_error", { volume: 0.6 }) } },
      "raid-drop": () => { this.handlers.dropItem(index); this.showRaidInventory() },
      "raid-secure": () => { if (!this.handlers.toSecure(index)) this.notify("Sicherer Behälter voll"); this.showRaidInventory() },
      "raid-unsecure": () => { if (!this.handlers.fromSecure(index)) this.notify("Rucksack voll"); this.showRaidInventory() },
      "loot-take": () => { this.loot?.take(index); if (this.loot) this.showLoot(this.loot) },
      "loot-all": () => { this.loot?.takeAll(); if (this.loot) this.showLoot(this.loot) },
      "loot-put": () => { this.loot?.put(index); if (this.loot) this.showLoot(this.loot) },
      "loot-close": () => this.closeOverlay(),
      "map-zoom": () => { this.mapZoom = id === "1"; this.showMap() },
      save: () => this.notify(this.company.save() ? "Fortschritt gespeichert" : "Speichern nicht möglich · Browserdaten prüfen"),
      gore: () => toggleSetting(() => { const order: GoreSetting[] = ["brutal", "normal", "off"]; this.settings.gore = order[(order.indexOf(this.settings.gore) + 1) % 3] }),
      mute: () => toggleSetting(() => { this.settings.muted = !this.settings.muted }),
      invert: () => toggleSetting(() => { this.settings.invertY = !this.settings.invertY }),
      quality: () => toggleSetting(() => { this.settings.quality = this.settings.quality === "high" ? "low" : "high" }),
      touch: () => toggleSetting(() => { this.settings.touch = this.settings.touch === "auto" ? "on" : this.settings.touch === "on" ? "off" : "auto" }),
      shake: () => toggleSetting(() => { this.settings.screenShake = !this.settings.screenShake }),
      fps: () => toggleSetting(() => { this.settings.showFps = !this.settings.showFps }),
      difficulty: () => toggleSetting(() => { const order: Difficulty[] = ["easy", "normal", "hard"]; this.settings.difficulty = order[(order.indexOf(this.settings.difficulty) + 1) % 3] }),
      reset: () => { if (window.confirm("Wirklich alles löschen und neu anfangen?")) this.handlers.newCompany() },
    }
    actions[action]?.()
  }

  private deploy(): void {
    const plan: RaidPlan = { insertion: this.plan.insertion, time: this.plan.time, weather: this.plan.weather, contracts: this.company.profile.contracts.active.map(c => c.id) }
    this.fromBase = false
    this.showPlaying()
    this.handlers.deploy(plan)
  }

  /** "Take all" shortcut (F / gamepad Y) while the loot window is open. */
  lootAll(): void { if (this.screen === "loot" && this.loot) { this.loot.takeAll(); this.showLoot(this.loot) } }
  /** Closes the loot window / backpack / map with the key that opened it. */
  closeActiveOverlay(): void { if (this.screen === "loot" || this.screen === "raidInventory") this.closeOverlay() }
  /** Escape on a station screen opened from the base. */
  closeStation(): void { if (this.fromBase && this.screen !== "playing" && this.screen !== "paused") this.closePanel() }

  // ───────────────────────────── online ─────────────────────────────

  /** Connected to the shared world (boot calls this once the artifact runtime answered). */
  setOnline(online: Online): void {
    this.online = online
    online.onChange(() => {
      if (this.screen === "online") this.renderOnline()
      else if (this.screen === "menu" || this.root.querySelector(".main-nav")) {
        const f = this.root.querySelector(".footer-online"); if (f) f.innerHTML = this.onlineStatus()
        const badge = this.root.querySelector<HTMLElement>('.nav-item[data-action="online"] span'); const n = online.others().length
        if (badge) badge.innerHTML = n > 0 ? `<b class="online-count">${n}</b>` : "◌"
      }
    })
    online.onChat(line => this.hearChat(line))
    if (this.screen === "menu") this.showMenu()
  }

  private onlineStatus(): string {
    const o = this.online
    if (!o?.available) return "OFFLINE · ONLINE NUR IN DER CLAUDE.AI-VERSION"
    const n = o.others().length, zone = o.inZone().length
    return `<b class="online-dot"></b>ONLINE · ${n === 1 ? "1 WEITERER SPIELER" : `${n} WEITERE SPIELER`}${zone ? ` · ${zone} IN DER ZONE` : ""}`
  }

  private hearChat(line: ChatLine): void {
    if (this.screen === "playing" || this.screen === "chat") this.hud.chat(line.from, line.text, line.news)
    else if (line.news && !line.me && this.screen !== "online") this.notify(line.text)
  }

  showOnline(): void {
    const o = this.online, on = !!o?.available
    const intro = on
      ? `Alle, die dieses Spiel gerade geöffnet haben, sehen sich hier. In der Zone erscheinen andere Spieler als <b>Echos</b> mit Namensschild und als blaue Punkte auf der Karte (<kbd>M</kbd>). Jeder spielt seine eigene Zone: Echos kann man nicht treffen. Wer in der Zone fällt, hinterlässt seine Ausrüstung – andere Spieler finden sie in ihren nächsten Einsätzen. <kbd>Enter</kbd> öffnet im Einsatz den Funk.`
      : `Die Online-Funktionen gibt es nur, wenn das Spiel als claude.ai-Artefakt läuft und Sie angemeldet sind. Hier läuft es offline: Ihr Fortschritt bleibt in diesem Browser, nur andere Spieler fehlen.`
    this.panel("online", "ONLINE", `<div class="content-heading"><div><span class="eyebrow">SPERRZONE 7 · ANDERE SPIELER</span><h2>Online</h2></div><span class="online-state ${on ? "on" : ""}" data-online="state"></span></div>
      <p class="trader-note online-note">${intro}</p>
      <div class="online-grid">
        <section class="online-col"><div class="subheading"><h3>JETZT DA</h3><span data-online="count"></span></div><div class="online-peers" data-online="peers"></div></section>
        <section class="online-col"><div class="subheading"><h3>BESTENLISTE</h3><span>TOP 25</span></div><div class="tabs board-tabs">${([["earned", "VERDIENT"], ["infectedKills", "INFIZIERTE"], ["rescued", "GERETTET"], ["bestRaid", "BESTER EINSATZ"]] as const).map(([id, label]) => `<button class="tab ${this.boardSort === id ? "active" : ""}" data-action="board-sort" data-id="${id}">${label}</button>`).join("")}</div><div class="online-board" data-online="board"></div></section>
        <section class="online-col chat-col"><div class="subheading"><h3>FUNK</h3><span>AN ALLE</span></div><div class="online-chat" data-online="chat"></div>
          <form class="chat-form" data-chat-form><input type="text" maxlength="160" autocomplete="off" placeholder="${on ? "Nachricht an alle …" : "Offline"}" aria-label="Funknachricht" ${on && o?.canChat ? "" : "disabled"}><button class="secondary" ${on && o?.canChat ? "" : "disabled"}>SENDEN</button></form></section>
      </div>`)
    this.renderOnline()
  }

  private renderOnline(): void {
    const o = this.online, on = !!o?.available
    const q = (k: string) => this.root.querySelector<HTMLElement>(`[data-online="${k}"]`)
    const state = q("state"); if (state) state.innerHTML = on ? `<b class="online-dot"></b>${o!.others().length + 1} ONLINE` : "OFFLINE"
    const peers = q("peers")
    if (peers) {
      const me = this.company.profile
      const rows = [`<div class="peer me"><i style="--c:#80e0bc"></i><div><b>${esc(me.callsign)}</b><small>Sie · Level ${me.level}</small></div><em>${MODE_NAMES[this.handlers.mode() === "raid" ? "raid" : this.handlers.mode() === "base" ? "base" : "menu"]}</em></div>`]
      for (const p of o?.others() ?? []) rows.push(`<div class="peer"><i style="--c:${esc(p.color)}"></i><div><b>${esc(p.callsign)}</b><small>${p.name ? `${esc(p.name)} · ` : ""}Level ${p.level}</small></div><em class="${p.mode}">${MODE_NAMES[p.mode]}</em></div>`)
      peers.innerHTML = rows.join("") + (on && !o!.others().length ? `<p class="empty-note">Gerade ist niemand sonst da. Teilen Sie das Spiel mit Freunden – wer es öffnet, erscheint hier.</p>` : "")
      const count = q("count"); if (count) count.textContent = on ? `${o!.others().length + 1} SPIELER` : ""
    }
    const board = q("board")
    if (board) {
      const key = this.boardSort
      const list = [...(o?.scores ?? [])].sort((a, b) => b[key] - a[key]).slice(0, 25)
      const fmt = (v: number) => key === "earned" || key === "bestRaid" ? money(v) : String(v)
      board.innerHTML = list.length ? list.map((r, i) => `<div class="board-row ${r.isMe ? "me" : ""}"><span>${i + 1}</span><div><b>${esc(r.callsign)}</b><small>${r.name ? `${esc(r.name)} · ` : ""}Lvl ${r.level} · ${r.raids} Einsätze · ${r.raids ? Math.round(r.extracts / r.raids * 100) : 0} % überlebt</small></div><em>${fmt(r[key])}</em></div>`).join("")
        : `<p class="empty-note">${on ? "Noch keine Einträge. Nach dem ersten Einsatz stehen Sie hier." : "Offline – keine Bestenliste."}</p>`
    }
    const chat = q("chat")
    if (chat) {
      const near = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40
      chat.innerHTML = (o?.chat ?? []).map(l => `<div class="${l.news ? "news" : ""} ${l.me ? "me" : ""}"><b>${esc(l.from)}</b><span>${esc(l.text)}</span><time>${new Date(l.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time></div>`).join("") || `<p class="empty-note">${on ? "Noch keine Funksprüche." : "Offline."}</p>`
      if (near) chat.scrollTop = chat.scrollHeight
    }
  }

  /** Enter in the raid or base: a radio line over the running game. */
  showChat(): void {
    if (!this.online?.canChat) { this.showPlaying(); this.handlers.resume(); return }
    this.screen = "chat"; this.hudRoot.classList.remove("hidden")
    this.root.className = "screen chat-screen"
    this.root.innerHTML = `<form class="chat-form chat-raid" data-chat-form><b>FUNK</b><input type="text" maxlength="160" autocomplete="off" placeholder="Nachricht an alle …" aria-label="Funknachricht"><small>ENTER senden · ESC zurück</small></form>`
    this.root.querySelector<HTMLInputElement>("input")?.focus()
  }

  private onSubmit(event: Event): void {
    const form = (event.target as HTMLElement).closest?.("form[data-chat-form]")
    if (!form) return
    event.preventDefault()
    const input = form.querySelector("input"), text = input?.value.trim() ?? ""
    if (text && this.online) {
      if (this.online.say(text, this.company.profile.callsign)) { if (input) input.value = "" }
      else { this.notify("Kurz warten …"); return }
    }
    if (this.screen === "chat") this.closeOverlay()
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement, key = input.dataset.setting as "sensitivity" | "adsSensitivity" | "volume" | "fov" | undefined
    if (!key) return
    this.settings[key] = Number(input.value)
    const shown = key === "volume" ? `${Math.round(this.settings.volume * 100)} %` : key === "fov" ? `${this.settings.fov}°` : key === "adsSensitivity" ? `× ${this.settings.adsSensitivity.toFixed(2)}` : this.settings.sensitivity.toFixed(2)
    input.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(shown))
    this.handlers.settingsChanged(this.settings)
  }

  private result(result: ActionResult, sound: "ui_buy" | "build" | "build_complete" | null = null, after?: () => void): void {
    this.notify(result.message)
    this.audio.play(result.ok ? sound ?? "ui_click" : "ui_error", { volume: 0.8 })
    if (result.ok) after?.()
    this.refresh()
  }

  notify(message: string): void {
    this.toast.textContent = message; this.toast.classList.add("show")
    window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 2800)
  }
}

/** Stat bars for a weapon (relative to the best weapon in each category); eff = with attachments and ammo. */
export function weaponStats(id: WeaponId, eff = WEAPONS[id]): string {
  const w = eff
  if (w.cls === "melee" && w.melee) {
    const m = w.melee
    const rows: [string, number, string][] = [["SCHADEN", Math.min(1, m.damage / 140), String(m.damage)], ["TEMPO", Math.min(1, 0.45 / Math.max(0.2, w.fireInterval)), `${(1 / w.fireInterval).toFixed(1)}/s`], ["REICHWEITE", Math.min(1, m.range / 2.6), `${m.range.toFixed(1)} m`], ["ZERTRENNEN", Math.min(1, m.sever), `${Math.round(m.sever * 100)} %`]]
    return statRows(rows)
  }
  const dps = w.damage * w.pellets / w.fireInterval
  const rows: [string, number, string][] = [
    ["SCHADEN", Math.min(1, w.damage * w.pellets / 160), `${Math.round(w.damage)}${w.pellets > 1 ? `×${w.pellets}` : ""}`],
    ["FEUERRATE", Math.min(1, (1 / w.fireInterval) / 14.7), `${Math.round(60 / w.fireInterval)}/min`],
    ["DPS", Math.min(1, dps / 420), `${Math.round(dps)}`],
    ["PRÄZISION", Math.max(0.04, Math.min(1, 0.004 / Math.max(0.001, w.spreadAds) * 0.6 + (0.06 - w.spreadHip) * 6)), ""],
    ["REICHWEITE", Math.min(1, w.rangeEnd / 160), `${w.rangeStart}–${w.rangeEnd} m`],
    ["MAGAZIN", Math.min(1, w.magazine / 100), String(w.magazine)],
    ["LAUTSTÄRKE", Math.min(1, w.noise / 120), `${Math.round(w.noise)} m`],
  ]
  return statRows(rows)
}
function statRows(rows: [string, number, string][]): string {
  return `<div class="weapon-stats">${rows.map(([label, v, text]) => `<div><span>${label}</span><i><b style="width:${Math.max(4, Math.round(v * 100))}%"></b></i><em>${text}</em></div>`).join("")}</div>`
}
