/**
 * hud.ts — in-raid HUD (DOM + two canvases): objective and contract, compass strip with markers, timer, dynamic
 * crosshair, hit/kill markers, damage direction arcs, vitals, ammo, interaction prompt, scope overlay, hints, and the
 * tactical map renderer used by the map screen.
 */
import type { Obstacle } from "./collision"
import type { MapLayout } from "./maps"
import type { HudSnapshot } from "./types"

const DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]

export class Hud {
  private compass: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private els = new Map<string, HTMLElement>()
  private arcs: HTMLElement[] = []
  private lastSnapshot: HudSnapshot | null = null
  showFps = false

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="damage-overlay"></div><div class="lowhp-overlay"></div><div class="death-overlay"></div>
      <div class="scope-overlay"><i class="h"></i><i class="v"></i><b></b></div>
      <div class="hud-objective"><span class="hud-label">AUFTRAG</span><b data-hud="objective"></b><small data-hud="objectiveProgress"></small><em data-hud="contract"></em></div>
      <div class="hud-compass"><canvas width="560" height="54"></canvas></div>
      <div class="hud-hint" data-hud="hint"></div>
      <div class="hud-status"><div><small>ZEIT</small><b data-hud="time">00:00</b></div><div><small>KONTAKTE</small><b data-hud="enemies">0</b></div></div>
      <div class="hud-fps" data-hud="fps"></div>
      <div class="xhair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b></div>
      <div class="hitmark"><i></i><i></i><i></i><i></i></div>
      <div class="dmg-arcs">${"<i></i>".repeat(6)}</div>
      <div class="hud-message" data-hud="message"></div>
      <div class="hud-interact"><span data-hud="interaction"></span><div class="bar"><i data-bar="interact"></i></div></div>
      <div class="hud-extract"><span>EVAKUIERUNG</span><div class="bar"><i data-bar="extract"></i></div></div>
      <div class="hud-vitals">
        <div class="vital hp"><span>GESUNDHEIT</span><b data-hud="health">100</b><div><i data-bar="health"></i></div></div>
        <div class="vital ar"><span>RÜSTUNG</span><b data-hud="armor">0</b><div><i data-bar="armor"></i></div></div>
        <div class="vital st"><div><i data-bar="stamina"></i></div></div>
        <div class="kit"><span><kbd>Q</kbd> <b data-hud="medkits">0</b> Trauma-Set</span><span><kbd>G</kbd> <b data-hud="grenades">0</b> Granate</span><span class="stance" data-hud="stance"></span></div>
      </div>
      <div class="hud-value"><small>RAID-WERT</small><b data-hud="loot">0 $</b><span>NICHT GESICHERT</span></div>
      <div class="hud-weapon"><small data-hud="weapon">MK-4</small><div><b data-hud="ammo">30</b><span>/ <b data-hud="reserve">0</b></span></div><em data-hud="reload"></em><div class="bar reload"><i data-bar="reload"></i></div></div>`
    for (const el of root.querySelectorAll<HTMLElement>("[data-hud],[data-bar]")) this.els.set(el.dataset.hud ? `h:${el.dataset.hud}` : `b:${el.dataset.bar}`, el)
    this.compass = root.querySelector(".hud-compass canvas")!
    this.ctx = this.compass.getContext("2d")!
    this.arcs = [...root.querySelectorAll<HTMLElement>(".dmg-arcs i")]
  }

  private text(key: string, value: string): void { const el = this.els.get(`h:${key}`); if (el && el.textContent !== value) el.textContent = value }
  private bar(key: string, fraction: number): void { const el = this.els.get(`b:${key}`); if (el) el.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%` }

  update(h: HudSnapshot): void {
    this.lastSnapshot = h
    const r = this.root
    this.text("objective", h.objective); this.text("objectiveProgress", h.objectiveProgress); this.text("contract", h.contract)
    this.text("time", formatTime(h.raidTime)); this.text("enemies", String(h.enemies))
    this.text("health", String(h.health)); this.text("armor", String(h.armor))
    this.text("medkits", String(h.medkits)); this.text("grenades", String(h.grenades))
    this.text("stance", h.crouched ? "GEDUCKT" : "")
    this.text("loot", `${h.lootValue.toLocaleString("de-DE")} $`)
    this.text("weapon", `${h.weaponName.toUpperCase()} · ${h.fireMode}`)
    this.text("ammo", String(h.ammo).padStart(2, "0"))
    this.text("reserve", h.reserveInfinite ? "∞" : String(h.reserve))
    this.text("reload", h.reloading > 0 ? "NACHLADEN" : h.ammo === 0 ? "R · NACHLADEN" : "")
    this.text("interaction", h.interaction)
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
    r.classList.toggle("ammo-low", h.ammo <= Math.max(2, 0) && !h.reloading)
    r.classList.toggle("hit", h.hitMarker > 0)
    r.classList.toggle("kill", h.killMarker > 0)
    r.classList.toggle("ads", h.ads)
    r.classList.toggle("scoped", h.scoped)
    r.classList.toggle("dead", h.dead)
    r.classList.toggle("stamina-full", h.stamina >= 99.5)
    r.classList.toggle("no-armor", h.armorMax <= 0 && h.armor <= 0)
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
      else if (norm % 15 === 0) { c.fillStyle = "#b8c8c1"; c.font = "10px ui-monospace,monospace"; c.fillText(String(norm), x, 27); }
      else { c.fillStyle = "#9bb1a8"; c.fillRect(x - 0.5, 36, 1, 4) }
    }
    c.globalAlpha = 1
    // markers
    for (const m of h.markers) {
      const clamped = Math.max(-range + 3, Math.min(range - 3, m.bearing))
      const x = w / 2 + clamped * px, off = Math.abs(m.bearing) > range - 3
      if (m.kind === "extract") {
        c.fillStyle = h.objective.startsWith("Versorgung") ? "#e4b461" : "#66e0b4"
        c.beginPath(); c.moveTo(x, 18); c.lineTo(x - 7, 8); c.lineTo(x + 7, 8); c.closePath(); c.fill()
        c.font = "bold 10px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)} m`, x, 49)
      } else if (m.kind === "crate") {
        c.fillStyle = "#79e5b8"; c.globalAlpha = off ? 0.5 : 0.95
        c.beginPath(); c.moveTo(x, 6); c.lineTo(x + 5, 11); c.lineTo(x, 16); c.lineTo(x - 5, 11); c.closePath(); c.fill()
        if (m.distance < 30 && !off) { c.font = "9px ui-monospace,monospace"; c.fillText(`${Math.round(m.distance)}`, x, 49) }
        c.globalAlpha = 1
      } else if (m.kind === "body") {
        c.fillStyle = "#c9d2ce"; c.globalAlpha = 0.7; c.fillRect(x - 3, 8, 6, 6); c.globalAlpha = 1
      }
    }
    // centre notch + heading
    c.fillStyle = "#80e0bc"; c.fillRect(w / 2 - 1, 38, 2, 7)
    c.font = "bold 11px ui-monospace,monospace"; c.fillStyle = "#e8eee9"; c.fillText(String(Math.round(h.compass) % 360).padStart(3, "0"), w / 2, 6)
  }

  get snapshot(): HudSnapshot | null { return this.lastSnapshot }
}

export interface TacticalMapData {
  layout: MapLayout
  obstacles: Obstacle[]
  player: { x: number; z: number; yaw: number }
  extraction: { x: number; z: number; r: number; name: string; ready: boolean } | null
  crates: { x: number; z: number }[]
  searched: { x: number; z: number }[]
}

/** Draws a top-down tactical map (north up) into the canvas. */
export function drawTacticalMap(canvas: HTMLCanvasElement, d: TacticalMapData): void {
  const c = canvas.getContext("2d"); if (!c) return
  const b = d.layout.bounds, pad = 18
  const scale = Math.min((canvas.width - pad * 2) / (b.maxX - b.minX), (canvas.height - pad * 2) / (b.maxZ - b.minZ))
  const ox = (canvas.width - (b.maxX - b.minX) * scale) / 2, oz = (canvas.height - (b.maxZ - b.minZ) * scale) / 2
  const X = (x: number) => ox + (x - b.minX) * scale, Z = (z: number) => oz + (z - b.minZ) * scale
  c.fillStyle = "#0d181b"; c.fillRect(0, 0, canvas.width, canvas.height)
  c.strokeStyle = "rgba(128,224,188,.08)"; c.lineWidth = 1
  for (let x = Math.ceil(b.minX / 10) * 10; x <= b.maxX; x += 10) { c.beginPath(); c.moveTo(X(x), Z(b.minZ)); c.lineTo(X(x), Z(b.maxZ)); c.stroke() }
  for (let z = Math.ceil(b.minZ / 10) * 10; z <= b.maxZ; z += 10) { c.beginPath(); c.moveTo(X(b.minX), Z(z)); c.lineTo(X(b.maxX), Z(z)); c.stroke() }
  c.strokeStyle = "rgba(128,224,188,.4)"; c.strokeRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale)
  for (const o of d.obstacles) {
    if (o.maxX < b.minX - 1 || o.minX > b.maxX + 1 || o.maxZ < b.minZ - 1 || o.minZ > b.maxZ + 1) continue
    const roof = (o.minY ?? 0) > 1.6
    c.fillStyle = roof ? "rgba(60,80,78,.25)" : o.height < 1.4 ? "#3a4a45" : "#56665f"
    c.fillRect(X(o.minX), Z(o.minZ), (o.maxX - o.minX) * scale, (o.maxZ - o.minZ) * scale)
  }
  for (const s of d.searched) { c.strokeStyle = "rgba(200,210,205,.5)"; c.beginPath(); c.moveTo(X(s.x) - 4, Z(s.z) - 4); c.lineTo(X(s.x) + 4, Z(s.z) + 4); c.moveTo(X(s.x) + 4, Z(s.z) - 4); c.lineTo(X(s.x) - 4, Z(s.z) + 4); c.stroke() }
  for (const s of d.crates) { c.fillStyle = "#79e5b8"; c.beginPath(); c.moveTo(X(s.x), Z(s.z) - 6); c.lineTo(X(s.x) + 6, Z(s.z)); c.lineTo(X(s.x), Z(s.z) + 6); c.lineTo(X(s.x) - 6, Z(s.z)); c.closePath(); c.fill() }
  if (d.extraction) {
    const e = d.extraction
    c.strokeStyle = e.ready ? "#66e0b4" : "#e4b461"; c.lineWidth = 2.5
    c.beginPath(); c.arc(X(e.x), Z(e.z), Math.max(7, e.r * scale), 0, Math.PI * 2); c.stroke()
    c.fillStyle = c.strokeStyle; c.font = "bold 12px ui-monospace,monospace"; c.textAlign = "center"; c.fillText(`EXFIL ${e.name.toUpperCase()}`, X(e.x), Z(e.z) - Math.max(10, e.r * scale) - 6)
  }
  // player arrow (yaw 0 = north/up)
  const px = X(d.player.x), pz = Z(d.player.z), a = -d.player.yaw
  c.save(); c.translate(px, pz); c.rotate(a)
  c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill()
  c.restore()
  c.fillStyle = "#80e0bc"; c.font = "bold 13px ui-monospace,monospace"; c.textAlign = "left"; c.fillText("N ↑", 10, 18)
}

export function formatTime(seconds: number): string { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }
