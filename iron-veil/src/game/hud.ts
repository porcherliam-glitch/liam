/**
 * hud.ts — in-raid HUD (DOM + one compass canvas): objective, contracts and area, compass strip with markers, raid
 * clock, dynamic crosshair, hit/kill markers, damage direction arcs, survival vitals (health, armour, helmet, stamina,
 * food, water, bleeding, infection, painkiller/stim), carry weight, ammo and ammo type, interaction prompt, scope
 * overlay, screen blood, hints — plus the tactical map renderer used by the map screen.
 */
import type { Obstacle } from "./collision"
import { ScreenBlood } from "./goreOverlay"
import { ITEMS, type ItemId } from "./items"
import type { HudSnapshot } from "./types"
import type { District, ExtractKind } from "./zone"

const DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]
const MARKER_COLORS: Record<string, string> = { extract: "#66e0b4", crate: "#79e5b8", body: "#c9d2ce", objective: "#e4b461", drop: "#ff9f43", threat: "#ff5a4a", survivor: "#e4b461", fallen: "#6fd3ff" }

export class Hud {
  private compass: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private els = new Map<string, HTMLElement>()
  private arcs: HTMLElement[] = []
  private lens: ScreenBlood | null = null
  private lastSnapshot: HudSnapshot | null = null
  showFps = false

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="damage-overlay"></div><div class="lowhp-overlay"></div><div class="bleed-overlay"></div><div class="infect-overlay"></div><div class="death-overlay"></div><div class="smoke-overlay"></div><div class="gas-overlay"></div><div class="flash-overlay"></div>
      <div class="scope-overlay"><i class="h"></i><i class="v"></i><b></b></div>
      <div class="hud-objective"><span class="hud-label" data-hud="area">SPERRZONE</span><b data-hud="objective"></b><small data-hud="objectiveProgress"></small><em data-hud="contract"></em></div>
      <div class="hud-compass"><canvas width="560" height="54"></canvas></div>
      <div class="hud-hint" data-hud="hint"></div>
      <div class="hud-status"><div><small data-hud="clockLabel">ZEIT</small><b data-hud="time">00:00</b></div><div><small>KONTAKTE</small><b data-hud="enemies">0</b></div></div>
      <div class="hud-fps" data-hud="fps"></div>
      <div class="hud-chat" aria-live="polite"></div>
      <div class="xhair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b></div>
      <div class="hitmark"><i></i><i></i><i></i><i></i></div>
      <div class="dmg-arcs">${"<i></i>".repeat(6)}</div>
      <div class="hud-message" data-hud="message"></div>
      <div class="hud-interact"><span data-hud="interaction"></span><div class="bar"><i data-bar="interact"></i></div></div>
      <div class="hud-extract"><span data-hud="extractName">EVAKUIERUNG</span><div class="bar"><i data-bar="extract"></i></div></div>
      <div class="hud-vitals">
        <div class="status-row">
          <span class="st-food"><i>ESSEN</i><b data-hud="energy">100</b></span>
          <span class="st-water"><i>WASSER</i><b data-hud="water">100</b></span>
          <span class="st-bleed" data-hud="bleed"></span>
          <span class="st-infect" data-hud="infection"></span>
          <span class="st-pain" data-hud="pain"></span>
          <span class="st-boost" data-hud="boost"></span>
        </div>
        <div class="vital hp"><span>GESUNDHEIT</span><b data-hud="health">100</b><div><i data-bar="health"></i></div></div>
        <div class="vital ar"><span>WESTE <em data-hud="helmet"></em></span><b data-hud="armor">0</b><div><i data-bar="armor"></i></div></div>
        <div class="vital st"><div><i data-bar="stamina"></i></div></div>
        <div class="kit"><span><kbd data-hud="keyQ">Q</kbd> <b data-hud="meds">0</b> Verband/Medkit</span><span><kbd data-hud="keyG">G</kbd> <b data-hud="grenades">0</b> <span data-hud="throwable">Granate</span></span><span class="weight" data-hud="weight"></span><span class="stance" data-hud="stance"></span></div>
      </div>
      <div class="hud-value"><small>RUCKSACK-WERT</small><b data-hud="loot">0 $</b><span>NICHT GESICHERT</span></div>
      <div class="hud-weapon"><small data-hud="weapon">MK-4</small><div class="ammo-line"><b data-hud="ammo">30</b><span>/ <b data-hud="reserve">0</b></span></div><strong data-hud="ammoName"></strong><em data-hud="reload"></em><div class="bar reload"><i data-bar="reload"></i></div></div>`
    for (const el of root.querySelectorAll<HTMLElement>("[data-hud],[data-bar]")) this.els.set(el.dataset.hud ? `h:${el.dataset.hud}` : `b:${el.dataset.bar}`, el)
    this.compass = root.querySelector(".hud-compass canvas")!
    this.ctx = this.compass.getContext("2d")!
    this.arcs = [...root.querySelectorAll<HTMLElement>(".dmg-arcs i")]
  }

  private text(key: string, value: string): void { const el = this.els.get(`h:${key}`); if (el && el.textContent !== value) el.textContent = value }
  private bar(key: string, fraction: number): void { const el = this.els.get(`b:${key}`); if (el) el.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%` }

  /** A radio/chat line from another player (left edge, fades out after ten seconds). Text is set as plain text. */
  chat(from: string, text: string, news: boolean): void {
    const box = this.root.querySelector(".hud-chat")
    if (!box) return
    const line = document.createElement("div"); if (news) line.className = "news"
    const who = document.createElement("b"); who.textContent = from
    const what = document.createElement("span"); what.textContent = text
    line.append(who, what); box.append(line)
    while (box.children.length > 6) box.firstElementChild!.remove()
    window.setTimeout(() => line.classList.add("old"), 9000)
    window.setTimeout(() => line.remove(), 10500)
  }

  /** Flashbang: the screen goes white (amount 0..1) and slowly clears again. */
  flash(amount: number): void {
    const el = this.root.querySelector<HTMLElement>(".flash-overlay"); if (!el || amount <= 0.02) return
    el.style.transition = "none"; el.style.opacity = String(Math.min(1, amount))
    void el.offsetWidth
    el.style.transition = `opacity ${(1.2 + amount * 3.5).toFixed(2)}s cubic-bezier(.6,0,.9,.6)`; el.style.opacity = "0"
  }
  /** Standing in bloater gas: sickly green tint and a pulsing vignette (0 or 1). */
  gas(amount: number): void { this.root.classList.toggle("in-gas", amount > 0) }
  /** Standing inside smoke: grey haze over the view (0..1). */
  haze(amount: number): void {
    const el = this.root.querySelector<HTMLElement>(".smoke-overlay"); if (!el) return
    const v = amount.toFixed(2); if (el.style.opacity !== v) el.style.opacity = v
  }

  /** Blood splatter on the "lens" (gore close to the camera, getting hit). amount 0..1. */
  splatter(amount: number): void {
    if (amount <= 0.02) return
    this.lensBlood().splatter(amount)
    if (amount > 0.3) this.lensBlood().hurt(amount * 0.6)
  }
  /** Wet splats with drips on a canvas above the game (created on first use, animated by its own frame loop). */
  private lensBlood(): ScreenBlood {
    if (!this.lens) {
      // below the HUD text: the first child of the HUD root
      const host = document.createElement("div"); host.style.cssText = "position:absolute;inset:0;pointer-events:none"; this.root.prepend(host)
      this.lens = new ScreenBlood(host)
      let last = performance.now()
      const tick = (now: number) => { this.lens?.update(Math.min(0.1, (now - last) / 1000)); last = now; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    }
    return this.lens
  }

  update(h: HudSnapshot): void {
    this.lastSnapshot = h
    const r = this.root, pad = h.device === "pad"
    this.text("area", h.area.toUpperCase()); this.text("objective", h.objective); this.text("objectiveProgress", h.objectiveProgress); this.text("contract", h.contract)
    this.text("clockLabel", h.clock ? `${h.clock.toUpperCase()}${h.weather ? ` · ${h.weather.toUpperCase()}` : ""} · REST` : "ZEIT")
    this.text("time", h.safe ? "--:--" : formatTime(h.raidTime)); this.text("enemies", String(h.enemies))
    this.text("health", String(h.health)); this.text("armor", String(h.armor))
    this.text("helmet", h.helmet > 0 ? `· HELM ${h.helmet}` : "")
    this.text("energy", String(Math.round(h.energy))); this.text("water", String(Math.round(h.water)))
    this.text("bleed", h.bleed === "heavy" ? "STARKE BLUTUNG" : h.bleed === "light" ? "BLUTUNG" : "")
    this.text("infection", h.infection >= 1 ? `INFEKTION ${Math.round(h.infection)} %` : "")
    this.text("pain", h.painkiller > 0 ? `SCHMERZMITTEL ${Math.ceil(h.painkiller)} s` : "")
    this.text("boost", h.boost > 0 ? `STIM ${Math.ceil(h.boost)} s` : "")
    this.text("meds", String(h.quickMeds)); this.text("grenades", String(h.grenades)); this.text("throwable", h.throwableName)
    this.text("weight", `${h.weight.toFixed(1)} / ${h.weightLimit} kg`)
    this.text("stance", h.crouched ? "GEDUCKT" : "")
    this.text("loot", `${h.lootValue.toLocaleString("de-DE")} $`)
    this.text("weapon", h.melee ? `${h.weaponName.toUpperCase()} · NAHKAMPF` : `${h.weaponName.toUpperCase()} · ${h.fireMode}`)
    this.text("ammo", h.melee ? "—" : String(h.ammo).padStart(2, "0"))
    this.text("reserve", h.melee ? "" : String(h.reserve))
    this.text("ammoName", h.melee ? "" : h.ammoName)
    this.text("reload", h.melee ? "" : h.reloading > 0 ? "NACHLADEN" : h.ammo === 0 ? (h.reserve > 0 ? `${pad ? "Ⓧ" : "R"} · NACHLADEN` : "KEINE MUNITION") : "")
    this.text("keyQ", pad ? "RB" : "Q"); this.text("keyG", pad ? "LB" : "G")
    this.text("interaction", h.interaction)
    this.text("extractName", h.extractionName ? `EVAKUIERUNG · ${h.extractionName.toUpperCase()}` : "EVAKUIERUNG")
    this.text("message", h.messageTime > 0 ? h.message : "")
    this.text("hint", h.hint)
    this.text("fps", this.showFps ? `${h.fps} FPS` : "")
    this.bar("health", h.health / 100); this.bar("armor", h.armorMax > 0 ? h.armor / h.armorMax : 0); this.bar("stamina", h.stamina / 100)
    this.bar("interact", h.interactionProgress); this.bar("extract", h.extraction)
    this.bar("reload", h.reloading > 0 && h.reloadTotal > 0 ? 1 - h.reloading / h.reloadTotal : 0)
    r.classList.toggle("low-health", h.health <= 30 && h.health > 0)
    r.classList.toggle("damaged", h.damageFlash > 0)
    r.classList.toggle("interacting", !!h.interaction)
    r.classList.toggle("holding", h.interactionProgress > 0)
    r.classList.toggle("extracting", h.extraction > 0)
    r.classList.toggle("reloading", h.reloading > 0)
    r.classList.toggle("ammo-low", !h.melee && h.ammo <= 2 && !h.reloading)
    r.classList.toggle("hit", h.hitMarker > 0)
    r.classList.toggle("kill", h.killMarker > 0)
    r.classList.toggle("ads", h.ads)
    r.classList.toggle("scoped", h.scoped)
    r.classList.toggle("dead", h.dead)
    r.classList.toggle("stamina-full", h.stamina >= 99.5)
    r.classList.toggle("no-armor", h.armorMax <= 0 && h.armor <= 0)
    r.classList.toggle("bleeding", h.bleed !== "none")
    r.classList.toggle("bleeding-heavy", h.bleed === "heavy")
    r.classList.toggle("infected", h.infection >= 25)
    r.classList.toggle("hungry", h.energy <= 20)
    r.classList.toggle("thirsty", h.water <= 20)
    r.classList.toggle("overweight", h.weight > h.weightLimit)
    r.classList.toggle("safe", h.safe)
    r.classList.toggle("melee", h.melee)
    r.style.setProperty("--infect", String(Math.min(1, h.infection / 100)))
    // crosshair gap follows the real spread cone
    const gap = Math.max(5, Math.min(110, h.spread * window.innerHeight / 2))
    r.style.setProperty("--gap", `${gap.toFixed(1)}px`)
    for (let i = 0; i < this.arcs.length; i++) {
      const d = h.damageDirections[i], el = this.arcs[i]
      if (!d) { el.style.opacity = "0"; continue }
      el.style.opacity = String(Math.min(1, d.life * 1.4))
      el.style.transform = `translate(-50%, -50%) rotate(${d.angle}deg)`
    }
    this.drawCompass(h)
  }

  /** Removes screen blood (new raid, back to base). */
  clearBlood(): void { this.lens?.clear() }
  /** Blood splats on the screen right now (tests). */
  get bloodOnScreen(): number { return this.lens?.activeSplats ?? 0 }

  private drawCompass(h: HudSnapshot): void {
    const c = this.ctx, w = this.compass.width, height = this.compass.height
    const range = 80, px = w / (range * 2)
    c.clearRect(0, 0, w, height)
    const grad = c.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, "rgba(8,18,20,0)"); grad.addColorStop(0.15, "rgba(8,18,20,.55)"); grad.addColorStop(0.85, "rgba(8,18,20,.55)"); grad.addColorStop(1, "rgba(8,18,20,0)")
    c.fillStyle = grad; c.fillRect(0, 14, w, 26)
    c.textAlign = "center"; c.textBaseline = "middle"
    const start = Math.floor((h.compass - range) / 5) * 5
    for (let deg = start; deg <= h.compass + range; deg += 5) {
      const x = w / 2 + (deg - h.compass) * px
      const fade = 1 - Math.abs(x - w / 2) / (w / 2)
      const norm = ((deg % 360) + 360) % 360
      c.globalAlpha = Math.max(0, fade)
      if (norm % 45 === 0) { c.fillStyle = norm === 0 ? "#80e0bc" : "#e8eee9"; c.font = "bold 13px ui-monospace,monospace"; c.fillText(DIRS[norm / 45], x, 27) }
      else if (norm % 15 === 0) { c.fillStyle = "#b8c8c1"; c.font = "10px ui-monospace,monospace"; c.fillText(String(norm), x, 27) }
      else { c.fillStyle = "#9bb1a8"; c.fillRect(x - 0.5, 36, 1, 4) }
    }
    c.globalAlpha = 1
    for (const m of h.markers) {
      const clamped = Math.max(-range + 3, Math.min(range - 3, m.bearing))
      const x = w / 2 + clamped * px, off = Math.abs(m.bearing) > range - 3
      c.fillStyle = MARKER_COLORS[m.kind] ?? "#fff"
      c.globalAlpha = off ? 0.55 : 0.95
      if (m.kind === "extract") {
        c.beginPath(); c.moveTo(x, 18); c.lineTo(x - 7, 8); c.lineTo(x + 7, 8); c.closePath(); c.fill()
        c.font = "bold 10px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)} m`, x, 49)
      } else if (m.kind === "crate") {
        c.beginPath(); c.moveTo(x, 6); c.lineTo(x + 5, 11); c.lineTo(x, 16); c.lineTo(x - 5, 11); c.closePath(); c.fill()
        if (m.distance < 30 && !off) { c.font = "9px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)}`, x, 49) }
      } else if (m.kind === "body") {
        c.globalAlpha *= 0.75; c.fillRect(x - 3, 8, 6, 6)
      } else if (m.kind === "objective") {
        c.beginPath(); c.arc(x, 11, 5.5, 0, Math.PI * 2); c.fill()
        c.font = "bold 10px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)} m`, x, 49)
      } else if (m.kind === "drop") {
        c.fillRect(x - 5, 6, 10, 10); c.fillStyle = "#1a1a1a"; c.fillRect(x - 1, 6, 2, 10)
        c.fillStyle = MARKER_COLORS.drop; c.font = "bold 10px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)} m`, x, 49)
      } else if (m.kind === "threat") {
        c.beginPath(); c.moveTo(x, 5); c.lineTo(x + 6, 16); c.lineTo(x - 6, 16); c.closePath(); c.fill()
      } else if (m.kind === "survivor") {
        c.beginPath(); c.arc(x, 7.5, 3.2, 0, Math.PI * 2); c.fill(); c.fillRect(x - 3.5, 12, 7, 6)
        c.font = "bold 10px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)} m`, x, 49)
      } else if (m.kind === "fallen") {
        c.fillRect(x - 1.5, 5, 3, 13); c.fillRect(x - 5.5, 9, 11, 3)
        c.font = "bold 10px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)} m`, x, 49)
      }
      c.globalAlpha = 1
    }
    c.fillStyle = "#80e0bc"; c.fillRect(w / 2 - 1, 38, 2, 7)
    c.font = "bold 11px ui-monospace,monospace"; c.fillStyle = "#e8eee9"; c.fillText(String(Math.round(h.compass) % 360).padStart(3, "0"), w / 2, 6)
  }

  get snapshot(): HudSnapshot | null { return this.lastSnapshot }
}

export interface TacticalMapData {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  obstacles: readonly Obstacle[]
  player: { x: number; z: number; yaw: number }
  districts: readonly District[]
  labels: readonly { name: string; x: number; z: number }[]
  exits: { x: number; z: number; r: number; name: string; kind: ExtractKind; requirement: { item?: string; money?: number } | null }[]
  objectives: { x: number; z: number; name: string; done: boolean }[]
  drop: { x: number; z: number } | null
  crates: { x: number; z: number }[]
  /** Other online players in the zone (echoes). */
  others?: { x: number; z: number; name: string }[]
  /** Other online players' gear where they fell. */
  fallen?: { x: number; z: number; name: string }[]
  /** Friendly survivors: the camp (trader H, medic +, guard W), people calling for help (!), followers. */
  survivors?: { x: number; z: number; kind: "camp" | "help" | "follow"; mark: string }[]
}

const DANGER_FILL = ["", "rgba(102,224,180,.05)", "rgba(228,180,97,.07)", "rgba(239,92,80,.09)"]
const DANGER_LINE = ["", "rgba(102,224,180,.35)", "rgba(228,180,97,.45)", "rgba(239,92,80,.55)"]
const EXIT_NAMES: Record<ExtractKind, string> = { heli: "HELI", boat: "BOOT", tunnel: "TUNNEL", gate: "TOR", vehicle: "FAHRZEUG" }

/**
 * Draws a top-down tactical map (north up). view: optional centre and span (metres shown across the smaller canvas
 * side) for the zoomed map; without it the whole zone is shown.
 */
export function drawTacticalMap(canvas: HTMLCanvasElement, d: TacticalMapData, view?: { cx: number; cz: number; span: number }): void {
  const c = canvas.getContext("2d"); if (!c) return
  const b = d.bounds, pad = 18
  let scale: number, ox: number, oz: number, minX: number, minZ: number
  if (view) {
    scale = (Math.min(canvas.width, canvas.height) - pad * 2) / view.span
    minX = view.cx - canvas.width / 2 / scale; minZ = view.cz - canvas.height / 2 / scale; ox = 0; oz = 0
  } else {
    scale = Math.min((canvas.width - pad * 2) / (b.maxX - b.minX), (canvas.height - pad * 2) / (b.maxZ - b.minZ))
    minX = b.minX; minZ = b.minZ
    ox = (canvas.width - (b.maxX - b.minX) * scale) / 2; oz = (canvas.height - (b.maxZ - b.minZ) * scale) / 2
  }
  const X = (x: number) => ox + (x - minX) * scale, Z = (z: number) => oz + (z - minZ) * scale
  const viewMaxX = minX + (canvas.width - ox) / scale, viewMaxZ = minZ + (canvas.height - oz) / scale
  c.fillStyle = "#0d181b"; c.fillRect(0, 0, canvas.width, canvas.height)
  // districts
  for (const dist of d.districts) {
    c.fillStyle = DANGER_FILL[dist.danger] ?? DANGER_FILL[1]
    c.fillRect(X(dist.minX), Z(dist.minZ), (dist.maxX - dist.minX) * scale, (dist.maxZ - dist.minZ) * scale)
    c.strokeStyle = DANGER_LINE[dist.danger] ?? DANGER_LINE[1]; c.lineWidth = 1; c.setLineDash([6, 5])
    c.strokeRect(X(dist.minX), Z(dist.minZ), (dist.maxX - dist.minX) * scale, (dist.maxZ - dist.minZ) * scale)
    c.setLineDash([])
  }
  // grid every 50 m (whole map) or 10 m (zoomed)
  const step = view ? 10 : 50
  c.strokeStyle = "rgba(128,224,188,.07)"; c.lineWidth = 1
  for (let x = Math.ceil(Math.max(b.minX, minX) / step) * step; x <= Math.min(b.maxX, viewMaxX); x += step) { c.beginPath(); c.moveTo(X(x), Z(Math.max(b.minZ, minZ))); c.lineTo(X(x), Z(Math.min(b.maxZ, viewMaxZ))); c.stroke() }
  for (let z = Math.ceil(Math.max(b.minZ, minZ) / step) * step; z <= Math.min(b.maxZ, viewMaxZ); z += step) { c.beginPath(); c.moveTo(X(Math.max(b.minX, minX)), Z(z)); c.lineTo(X(Math.min(b.maxX, viewMaxX)), Z(z)); c.stroke() }
  c.strokeStyle = "rgba(128,224,188,.4)"; c.strokeRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale)
  // buildings and walls
  for (const o of d.obstacles) {
    if (o.maxX < minX || o.minX > viewMaxX || o.maxZ < minZ || o.minZ > viewMaxZ) continue
    const w = (o.maxX - o.minX) * scale, h = (o.maxZ - o.minZ) * scale
    if (w < 0.6 && h < 0.6) continue
    const roof = (o.minY ?? 0) > 1.6
    c.fillStyle = roof ? "rgba(60,80,78,.22)" : o.height < 1.4 ? "#33433e" : "#56665f"
    c.fillRect(X(o.minX), Z(o.minZ), Math.max(0.8, w), Math.max(0.8, h))
  }
  // district names
  c.textAlign = "center"; c.textBaseline = "middle"
  for (const l of d.labels) {
    c.font = `bold ${view ? 14 : 12}px ui-monospace,monospace`
    c.fillStyle = "rgba(0,0,0,.6)"; c.fillText(l.name.toUpperCase(), X(l.x) + 1, Z(l.z) + 1)
    c.fillStyle = "rgba(220,235,228,.75)"; c.fillText(l.name.toUpperCase(), X(l.x), Z(l.z))
  }
  for (const s of d.crates) { c.fillStyle = "#79e5b8"; c.beginPath(); c.moveTo(X(s.x), Z(s.z) - 5); c.lineTo(X(s.x) + 5, Z(s.z)); c.lineTo(X(s.x), Z(s.z) + 5); c.lineTo(X(s.x) - 5, Z(s.z)); c.closePath(); c.fill() }
  for (const o of d.objectives) {
    c.strokeStyle = c.fillStyle = o.done ? "#66e0b4" : "#e4b461"; c.lineWidth = 2
    c.beginPath(); c.arc(X(o.x), Z(o.z), 7, 0, Math.PI * 2); c.stroke()
    if (o.done) { c.beginPath(); c.moveTo(X(o.x) - 4, Z(o.z)); c.lineTo(X(o.x) - 1, Z(o.z) + 3); c.lineTo(X(o.x) + 4, Z(o.z) - 3); c.stroke() }
    c.font = "bold 11px ui-monospace,monospace"; c.fillText(o.name, X(o.x), Z(o.z) - 14)
  }
  if (d.drop) {
    c.fillStyle = "#ff9f43"; c.fillRect(X(d.drop.x) - 6, Z(d.drop.z) - 6, 12, 12)
    c.font = "bold 11px ui-monospace,monospace"; c.fillText("VERSORGUNG", X(d.drop.x), Z(d.drop.z) - 14)
  }
  for (const e of d.exits) {
    const free = !e.requirement
    c.strokeStyle = c.fillStyle = free ? "#66e0b4" : "#e4b461"; c.lineWidth = 2.5
    c.beginPath(); c.arc(X(e.x), Z(e.z), Math.max(7, e.r * scale), 0, Math.PI * 2); c.stroke()
    c.font = "bold 11px ui-monospace,monospace"
    const y = Z(e.z) - Math.max(10, e.r * scale) - 6
    c.fillText(`${EXIT_NAMES[e.kind]} · ${e.name.toUpperCase()}`, X(e.x), y)
    if (e.requirement) { c.font = "10px ui-monospace,monospace"; c.fillText(e.requirement.money ? `${e.requirement.money} $ Bestechung` : e.requirement.item && e.requirement.item in ITEMS ? `${ITEMS[e.requirement.item as ItemId].name} nötig` : "Gegenstand nötig", X(e.x), y + 12 + Math.max(10, e.r * scale) * 2) }
  }
  // survivors: the camp, people who called for help, followers
  const camp = (d.survivors ?? []).filter(s => s.kind === "camp")
  if (camp.length) {
    const cx = camp.reduce((a, s) => a + s.x, 0) / camp.length, cz = Math.min(...camp.map(s => s.z))
    c.font = "bold 11px ui-monospace,monospace"; c.textAlign = "center"; c.fillStyle = "#cfeee0"; c.fillText("LAGER", X(cx), Z(cz) - 16)
  }
  for (const s of d.survivors ?? []) {
    const x = X(s.x), z = Z(s.z)
    c.lineWidth = 2; c.strokeStyle = "#04120d"
    c.fillStyle = s.kind === "help" ? "#e4b461" : "#80e0bc"
    c.beginPath(); c.arc(x, z, s.kind === "follow" ? 4 : 7, 0, Math.PI * 2); c.fill(); c.stroke()
    if (s.kind !== "follow") { c.fillStyle = "#04120d"; c.font = "bold 10px ui-monospace,monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(s.mark, x, z + 0.5) }
  }
  // other players' gear where they fell
  for (const f of d.fallen ?? []) {
    const x = X(f.x), z = Z(f.z)
    c.fillStyle = "#6fd3ff"; c.strokeStyle = "#04121a"; c.lineWidth = 1.5
    c.fillRect(x - 1.5, z - 7, 3, 14); c.fillRect(x - 6, z - 3, 12, 3); c.strokeRect(x - 1.5, z - 7, 3, 14)
    c.font = "10px ui-monospace,monospace"; c.textAlign = "center"; c.fillText(f.name, x, z - 13)
  }
  // other online players (echoes)
  for (const o of d.others ?? []) {
    c.fillStyle = "#6fd3ff"; c.strokeStyle = "#04121a"; c.lineWidth = 2
    c.beginPath(); c.arc(X(o.x), Z(o.z), 5, 0, Math.PI * 2); c.fill(); c.stroke()
    c.font = "bold 11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText(o.name, X(o.x), Z(o.z) - 11)
  }
  // player arrow (yaw 0 = north/up)
  const px = X(d.player.x), pz = Z(d.player.z), a = -d.player.yaw
  c.save(); c.translate(px, pz); c.rotate(a)
  c.fillStyle = "#ffffff"; c.strokeStyle = "#000"; c.lineWidth = 1.5
  c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke()
  c.restore()
  c.fillStyle = "#80e0bc"; c.font = "bold 13px ui-monospace,monospace"; c.textAlign = "left"; c.fillText("N ↑", 10, 18)
  // scale bar
  const meters = view ? 25 : 100, len = meters * scale
  c.fillStyle = "#cfdcd6"; c.fillRect(canvas.width - 20 - len, canvas.height - 18, len, 2)
  c.textAlign = "right"; c.font = "10px ui-monospace,monospace"; c.fillText(`${meters} m`, canvas.width - 20, canvas.height - 28)
}

export function formatTime(seconds: number): string { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }
