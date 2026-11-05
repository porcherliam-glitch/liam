// In-expedition HUD: health, stamina, weapon, quick slots, prompt, compass, mission tracker, boss bar.

import type { Player } from "../entities/player"
import type { Zombie } from "../entities/zombie"
import type { MissionDef } from "../core/types"
import { itemDef } from "../items/itemData"
import { displayName } from "../items/items"
import { QUICK_SLOTS } from "../items/inventory"
import { esc } from "./ui"
import { missionProgressText } from "../meta/missions"
import { formatTime } from "../core/math"
import type { Input } from "../input/input"
import { glyph } from "../input/glyphs"
import { RARITY_INFO } from "../core/types"

export interface CompassMarker {
  x: number
  z: number
  label: string
  kind: "extraction" | "mission" | "boss" | "poi"
}

export class Hud {
  readonly el: HTMLElement
  private hp: HTMLElement
  private hpText: HTMLElement
  private stamina: HTMLElement
  private weapon: HTMLElement
  private quick: HTMLElement
  private prompt: HTMLElement
  private compass: HTMLElement
  private missions: HTMLElement
  private boss: HTMLElement
  private status: HTMLElement
  private crosshair: HTMLElement
  private extraction: HTMLElement
  private damageVignette: HTMLElement
  private lockMarker: HTMLElement
  private floats: HTMLElement
  private fps: HTMLElement
  private clock: HTMLElement
  private lastQuickKey = ""
  private ability: HTMLElement

  constructor(private input: Input) {
    this.el = document.getElementById("hud")!
    this.el.innerHTML = `
      <div class="hud-vitals">
        <div class="hud-hp"><div class="hud-bar hp"><div class="fill"></div></div><span class="hud-hp-text"></span></div>
        <div class="hud-bar stamina"><div class="fill"></div></div>
        <div class="hud-status"></div>
      </div>
      <div class="hud-weapon"></div>
      <div class="hud-quick"></div>
      <div class="hud-ability hidden"></div>
      <div class="hud-prompt hidden"></div>
      <div class="hud-compass"><div class="hud-compass-strip"></div></div>
      <div class="hud-missions"></div>
      <div class="hud-boss hidden"><div class="hud-boss-name"></div><div class="hud-bar boss"><div class="fill"></div></div></div>
      <div class="hud-crosshair hidden"></div>
      <div class="hud-extraction hidden"></div>
      <div class="hud-vignette"></div>
      <div class="hud-lock hidden"></div>
      <div class="hud-floats"></div>
      <div class="hud-fps hidden"></div>
      <div class="hud-clock"></div>`
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!
    this.hp = q(".hud-bar.hp .fill")
    this.hpText = q(".hud-hp-text")
    this.stamina = q(".hud-bar.stamina .fill")
    this.weapon = q(".hud-weapon")
    this.quick = q(".hud-quick")
    this.prompt = q(".hud-prompt")
    this.compass = q(".hud-compass-strip")
    this.missions = q(".hud-missions")
    this.boss = q(".hud-boss")
    this.status = q(".hud-status")
    this.crosshair = q(".hud-crosshair")
    this.extraction = q(".hud-extraction")
    this.damageVignette = q(".hud-vignette")
    this.lockMarker = q(".hud-lock")
    this.floats = q(".hud-floats")
    this.fps = q(".hud-fps")
    this.clock = q(".hud-clock")
    this.ability = q(".hud-ability")
  }

  show(on: boolean): void {
    this.el.classList.toggle("hidden", !on)
  }

  update(player: Player, opts: { prompt: string | null; promptAction?: "interact"; markers: CompassMarker[]; cameraYaw: number; missions: MissionDef[]; boss: Zombie | null; extraction: { name: string; progress: number } | null; hour: number; weather: string; fps: number | null; lockScreen: { x: number; y: number; visible: boolean } }): void {
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100)
    this.hp.style.width = `${hpPct}%`
    this.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`
    this.hp.parentElement!.classList.toggle("low", hpPct < 30)
    this.stamina.style.width = `${Math.max(0, (player.stamina / player.maxStamina) * 100)}%`
    this.stamina.parentElement!.classList.toggle("exhausted", player.stamina < player.maxStamina * 0.2)
    // Status effects
    const st: string[] = []
    if (player.plague > 0) st.push(`<span class="st plague">☠ Pest ${Math.ceil(player.plague)}s</span>`)
    for (const b of player.buffs) st.push(`<span class="st buff">${b.stat === "damage" ? "⚔ Stärke" : b.stat === "armor" ? "🛡 Eisenhaut" : b.stat === "speed" ? "➤ Eile" : "↻ Ausdauer"} ${Math.ceil(b.remaining)}s</span>`)
    if (player.overloaded) st.push(`<span class="st warn">⚖ Überladen</span>`)
    this.status.innerHTML = st.join("")
    // Weapon
    const w = player.weapon
    if (w) {
      const def = itemDef(w.defId)
      const dur = w.maxDurability ? Math.max(0, w.durability ?? 0) / w.maxDurability : 1
      const ammo = def.weapon?.ranged ? `<span class="ammo">${player.inventory.slots.reduce((n, s) => n + (s && s.defId === def.weapon!.ranged!.ammoId ? s.qty : 0), 0)} ${itemDef(def.weapon.ranged.ammoId).name}</span>` : ""
      this.weapon.innerHTML = `<div class="wname" style="color:${RARITY_INFO[w.rarity].color}">${esc(displayName(w))}</div><div class="hud-bar dur ${dur < 0.25 ? "low" : ""}"><div class="fill" style="width:${dur * 100}%"></div></div>${ammo}`
    } else this.weapon.innerHTML = `<div class="wname">Unbewaffnet</div>`
    // Quick slots
    const key = QUICK_SLOTS.map((s) => {
      const it = player.inventory.equipment[s]
      return it ? `${it.defId}:${it.qty}` : "-"
    }).join("|") + this.input.device
    if (key !== this.lastQuickKey) {
      this.lastQuickKey = key
      this.quick.innerHTML = QUICK_SLOTS.map((s, i) => {
        const it = player.inventory.equipment[s]
        const def = it ? itemDef(it.defId) : null
        const g = glyph(`quick${i + 1}` as "quick1", this.input.bindings, this.input.device)
        return `<div class="qslot ${it ? "" : "empty"}">${g}<div class="qname">${def ? esc(def.name) : "–"}</div>${it && def && def.stack > 1 ? `<div class="qty">${it.qty}</div>` : ""}</div>`
      }).join("")
    }
    // Active ability
    if (player.ability) {
      this.ability.classList.remove("hidden")
      const cd = player.abilityCooldown
      this.ability.innerHTML = `${this.input.device === "keyboard" ? glyph("ability", this.input.bindings, "keyboard") : `<span class="glyph pad xy">Y</span>`}<div class="qname">${esc(player.ability.name)}</div>${cd > 0 ? `<div class="cd">${Math.ceil(cd)} s</div>` : ""}`
      this.ability.classList.toggle("ready", cd <= 0)
    } else this.ability.classList.add("hidden")
    // Prompt
    if (opts.prompt) {
      this.prompt.classList.remove("hidden")
      this.prompt.innerHTML = `${glyph("interact", this.input.bindings, this.input.device)} ${esc(opts.prompt)}`
    } else this.prompt.classList.add("hidden")
    // Compass: 360° strip, markers placed by relative bearing
    const parts: string[] = []
    const yaw = opts.cameraYaw
    for (let deg = 0; deg < 360; deg += 45) {
      const rel = relBearing((deg * Math.PI) / 180, yaw)
      if (Math.abs(rel) < Math.PI / 2.2) {
        const label = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][deg / 45]
        parts.push(`<span class="cmark card" style="left:${50 + (rel / (Math.PI / 2.2)) * 50}%">${label}</span>`)
      }
    }
    for (const m of opts.markers) {
      const dx = m.x - player.pos.x
      const dz = m.z - player.pos.z
      const bearing = Math.atan2(dx, dz)
      // Our compass: facing +Z is "north"
      const rel = relBearing(bearing, yaw)
      if (Math.abs(rel) < Math.PI / 2.2) {
        const d = Math.round(Math.hypot(dx, dz))
        parts.push(`<span class="cmark ${m.kind}" style="left:${50 + (rel / (Math.PI / 2.2)) * 50}%" title="${esc(m.label)}">${m.kind === "extraction" ? "⬆" : m.kind === "boss" ? "☠" : m.kind === "mission" ? "◆" : "•"}<small>${d}m</small></span>`)
      }
    }
    this.compass.innerHTML = parts.join("")
    // Missions
    this.missions.innerHTML = opts.missions.filter((m) => m.status === "active").map((m) => `<div class="mtrack ${m.progress >= m.goal ? "done" : ""}"><span>${esc(m.title)}</span><b>${missionProgressText(m)}</b></div>`).join("")
    // Boss
    if (opts.boss && !opts.boss.dead) {
      this.boss.classList.remove("hidden")
      this.boss.querySelector(".hud-boss-name")!.textContent = `${opts.boss.type.name} – ${opts.boss.type.bossTitle ?? ""}`
      ;(this.boss.querySelector(".fill") as HTMLElement).style.width = `${(opts.boss.hp / opts.boss.maxHp) * 100}%`
    } else this.boss.classList.add("hidden")
    this.crosshair.classList.toggle("hidden", !(player.aiming || player.state === "drawing"))
    if (opts.extraction) {
      this.extraction.classList.remove("hidden")
      this.extraction.innerHTML = `<div>Extraktion: ${esc(opts.extraction.name)}</div><div class="hud-bar extract"><div class="fill" style="width:${opts.extraction.progress * 100}%"></div></div>`
    } else this.extraction.classList.add("hidden")
    this.damageVignette.style.opacity = `${Math.max(0, 1 - player.sinceHurt * 1.5) * 0.9 + (hpPct < 30 ? 0.25 + Math.sin(performance.now() * 0.006) * 0.15 : 0)}`
    if (opts.lockScreen.visible) {
      this.lockMarker.classList.remove("hidden")
      this.lockMarker.style.left = `${opts.lockScreen.x}px`
      this.lockMarker.style.top = `${opts.lockScreen.y}px`
    } else this.lockMarker.classList.add("hidden")
    if (opts.fps !== null) {
      this.fps.classList.remove("hidden")
      this.fps.textContent = `${opts.fps} FPS`
    } else this.fps.classList.add("hidden")
    const h = Math.floor(opts.hour)
    const m = Math.floor((opts.hour - h) * 60)
    this.clock.textContent = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} · ${opts.weather}`
  }

  /** Floating damage text projected to screen coordinates. */
  floatText(x: number, y: number, text: string, color: string): void {
    const el = document.createElement("div")
    el.className = "float"
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.color = color
    this.floats.appendChild(el)
    while (this.floats.children.length > 24) this.floats.firstChild?.remove()
    setTimeout(() => el.remove(), 900)
  }

  timeLabel(seconds: number): string {
    return formatTime(seconds)
  }
}

function relBearing(bearing: number, yaw: number): number {
  // The camera looks along forward(); yaw=0 looks toward -Z. Bearing 0 = +Z. Convert to a relative angle.
  const camBearing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw))
  let d = bearing - camBearing
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
