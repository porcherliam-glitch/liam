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
import { Rng } from "../core/rng"
import { abilityIcon, itemIcon, lockIcon } from "./screens/common"

export interface CompassMarker {
  x: number
  z: number
  label: string
  kind: "extraction" | "mission" | "boss" | "poi"
}

/** Enemy health bar entry. lastHitAt and the clock passed to updateEnemyBars share a time base; without them hits are detected from health drops. */
export interface EnemyBarInfo {
  x: number
  y: number
  name: string
  hp: number
  maxHp: number
  lastHitAt?: number
}

interface BarSlot {
  el: HTMLElement
  fill: HTMLElement
  ghost: HTMLElement
  label: HTMLElement
  active: boolean
  name: string
  maxHp: number
  hp: number
  x: number
  y: number
  ghostPct: number
  holdUntil: number
  holdFrames: number
  hitAt: number
}

/** Colour zombie.ts uses for critical hits (player.ts also uses it for a perfect block). */
const CRIT_COLOR = "#ffd24a"
/** How long a ghost bar keeps showing lost health before it drains (ms). */
const GHOST_HOLD_MS = 420
/** ...and for at least this many HUD updates, so it is also seen at very low frame rates. */
const GHOST_HOLD_FRAMES = 3
/** Compass strip: maximum number of markers and minimum spacing (percent of the strip width). */
const COMPASS_MAX_MARKERS = 6
const COMPASS_GAP_ROW1 = 6
const COMPASS_GAP_CARDINAL = 5
const COMPASS_GAP_ROW2 = 8
const MARKER_PRIORITY: Record<CompassMarker["kind"], number> = { boss: 0, mission: 1, extraction: 2, poi: 3 }
const MARKER_ICON: Record<CompassMarker["kind"], string> = { extraction: "⬆", boss: "☠", mission: "◆", poi: "•" }

export class Hud {
  readonly el: HTMLElement
  private hp: HTMLElement
  private hpGhost: HTMLElement
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
  private bossIntro: HTMLElement
  private enemyBars: HTMLElement
  private mouseHint: HTMLElement
  private hitDir: HTMLElement
  private imarker: HTMLElement
  private barPool: BarSlot[] = []
  private lastHpPct = -1
  private ghostPct = 100
  private ghostHoldUntil = 0
  private ghostHoldFrames = 0
  /** Seeded so damage-number jitter is reproducible in screenshots. */
  private floatRng = new Rng(0x5eed)
  private recentFloats: { x: number; y: number; t: number }[] = []

  constructor(private input: Input) {
    this.el = document.getElementById("hud")!
    this.el.innerHTML = `
      <div class="hud-vitals">
        <div class="hud-hp"><div class="hud-bar hp"><div class="ghost"></div><div class="fill"></div></div><span class="hud-hp-text"></span></div>
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
      <div class="hud-clock"></div>
      <div class="hud-bossintro hidden"><div class="bi-name"></div><div class="bi-title"></div></div>
      <div class="hud-mousehint hidden">Ins Spiel klicken, um die Maus zu binden (Esc = Pause)</div>
      <div class="hud-hitdir hidden"><div class="hd-arc"></div></div>
      <div class="hud-imarker hidden">◆</div>
      <div class="hud-enemybars"></div>`
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!
    this.hp = q(".hud-bar.hp .fill")
    this.hpGhost = q(".hud-bar.hp .ghost")
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
    this.bossIntro = q(".hud-bossintro")
    this.enemyBars = q(".hud-enemybars")
    this.mouseHint = q(".hud-mousehint")
    this.hitDir = q(".hud-hitdir")
    this.imarker = q(".hud-imarker")
    for (let i = 0; i < 8; i++) {
      const b = document.createElement("div")
      b.className = "ebar hidden"
      b.innerHTML = `<div class="ebar-name"></div><div class="hud-bar enemy"><div class="ghost"></div><div class="fill"></div></div>`
      this.enemyBars.appendChild(b)
      this.barPool.push({
        el: b,
        fill: b.querySelector<HTMLElement>(".fill")!,
        ghost: b.querySelector<HTMLElement>(".ghost")!,
        label: b.querySelector<HTMLElement>(".ebar-name")!,
        active: false,
        name: "",
        maxHp: 0,
        hp: 0,
        x: 0,
        y: 0,
        ghostPct: 0,
        holdUntil: 0,
        holdFrames: 0,
        hitAt: -1e9,
      })
    }
  }

  /** Red arc at the screen edge pointing toward the last attacker. */
  showHitDirection(relAngle: number, strength: number): void {
    if (strength <= 0.01) {
      this.hitDir.classList.add("hidden")
      return
    }
    this.hitDir.classList.remove("hidden")
    this.hitDir.style.transform = `rotate(${(-relAngle * 180) / Math.PI}deg)`
    this.hitDir.style.opacity = `${Math.min(1, strength)}`
  }

  showInteractMarker(p: { x: number; y: number } | null): void {
    if (!p) {
      this.imarker.classList.add("hidden")
      return
    }
    this.imarker.classList.remove("hidden")
    this.imarker.style.left = `${p.x}px`
    this.imarker.style.top = `${p.y}px`
  }

  showMouseHint(on: boolean): void {
    this.mouseHint.classList.toggle("hidden", !on)
  }

  /** Big boss name banner for a few seconds. */
  showBossIntro(name: string, title: string): void {
    this.bossIntro.querySelector(".bi-name")!.textContent = name
    this.bossIntro.querySelector(".bi-title")!.textContent = title
    this.bossIntro.classList.remove("hidden")
    this.bossIntro.classList.remove("fade")
    setTimeout(() => this.bossIntro.classList.add("fade"), 3200)
    setTimeout(() => this.bossIntro.classList.add("hidden"), 4200)
  }

  /**
   * Small health bars over recently hit enemies (screen positions). A bar follows its enemy from frame to frame
   * (same name and max health, nearest screen position), so the ghost rest and the hit kick stay on the right bar.
   */
  updateEnemyBars(list: EnemyBarInfo[], clock?: number): void {
    const now = performance.now()
    const pool = this.barPool
    const count = Math.min(list.length, pool.length)
    const assigned = new Array<number>(count).fill(-1)
    const used = new Set<number>()
    for (let i = 0; i < count; i++) {
      const e = list[i]
      let best = -1
      let bestD = 140 * 140
      for (let j = 0; j < pool.length; j++) {
        const s = pool[j]
        if (!s.active || used.has(j) || s.name !== e.name || s.maxHp !== e.maxHp) continue
        const d = (s.x - e.x) ** 2 + (s.y - e.y) ** 2
        if (d < bestD) {
          bestD = d
          best = j
        }
      }
      if (best >= 0) {
        used.add(best)
        assigned[i] = best
      }
    }
    for (let i = 0; i < count; i++) {
      if (assigned[i] >= 0) continue
      let free = pool.findIndex((s, j) => !used.has(j) && !s.active)
      if (free < 0) free = pool.findIndex((_, j) => !used.has(j))
      if (free < 0) continue
      used.add(free)
      assigned[i] = free
      pool[free].active = false
    }
    for (let j = 0; j < pool.length; j++) {
      if (used.has(j) || !pool[j].active) continue
      pool[j].active = false
      pool[j].el.classList.add("hidden")
    }
    for (let i = 0; i < count; i++) {
      if (assigned[i] < 0) continue
      const e = list[i]
      const s = pool[assigned[i]]
      const pct = e.maxHp > 0 ? Math.max(0, Math.min(100, (e.hp / e.maxHp) * 100)) : 0
      const fresh = !s.active
      if (fresh) {
        // Fresh bar: no ghost rest, no kick
        s.active = true
        s.name = e.name
        s.maxHp = e.maxHp
        s.ghostPct = pct
        s.holdUntil = 0
        s.holdFrames = 0
        s.hitAt = -1e9
        s.label.textContent = e.name
        setBarWidth(s.ghost, pct, false)
        setBarWidth(s.fill, pct, false)
        s.el.classList.remove("hidden")
      } else if (e.hp < s.hp - 1e-6) {
        const before = Math.min(100, (s.hp / s.maxHp) * 100)
        if (s.ghostPct < before) {
          s.ghostPct = before
          setBarWidth(s.ghost, before, false)
        }
        s.hitAt = now
        s.holdUntil = now + GHOST_HOLD_MS
        s.holdFrames = GHOST_HOLD_FRAMES
      }
      if (e.lastHitAt !== undefined && clock !== undefined && clock - e.lastHitAt < 0.1 && now - s.hitAt > 150) s.hitAt = now
      s.hp = e.hp
      s.x = e.x
      s.y = e.y
      s.holdFrames--
      const ghost = ghostTarget(s.ghostPct, pct, now >= s.holdUntil && s.holdFrames <= 0)
      if (ghost !== s.ghostPct) {
        s.ghostPct = ghost
        setBarWidth(s.ghost, ghost, true)
      }
      if (!fresh) setBarWidth(s.fill, pct, true)
      s.el.style.left = `${e.x}px`
      s.el.style.top = `${e.y}px`
      s.el.classList.toggle("hit", now - s.hitAt < 100)
    }
  }

  show(on: boolean): void {
    this.el.classList.toggle("hidden", !on)
  }

  update(player: Player, opts: { prompt: string | null; promptAction?: "interact"; markers: CompassMarker[]; cameraYaw: number; missions: MissionDef[]; boss: Zombie | null; extraction: { name: string; progress: number } | null; hour: number; weather: string; fps: number | null; lockScreen: { x: number; y: number; visible: boolean } }): void {
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100)
    this.hp.style.width = `${hpPct}%`
    this.updateHpGhost(hpPct)
    this.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`
    this.hp.parentElement!.classList.toggle("low", hpPct < 30)
    this.hp.parentElement!.classList.toggle("hit", player.sinceHurt < 0.12)
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
    }).join("|") + this.input.device + player.quickSlotCount
    if (key !== this.lastQuickKey) {
      this.lastQuickKey = key
      this.quick.innerHTML = QUICK_SLOTS.map((s, i) => {
        const it = player.inventory.equipment[s]
        const def = it ? itemDef(it.defId) : null
        const g = glyph(`quick${i + 1}` as "quick1", this.input.bindings, this.input.device)
        if (i >= player.quickSlotCount) return `<div class="qslot locked" title="Waffenkammer ausbauen">${g}<div class="qicon">${lockIcon()}</div><div class="qname">gesperrt</div></div>`
        if (!it || !def) return `<div class="qslot empty">${g}<div class="qicon"></div><div class="qname">leer</div></div>`
        return `<div class="qslot" style="--rar:${RARITY_INFO[it.rarity].color}" title="${esc(def.name)}">${g}<div class="qicon">${itemIcon(def.kind, def.weapon?.weaponClass)}</div><div class="qname">${esc(def.name)}</div>${def.stack > 1 ? `<div class="qty">${it.qty}</div>` : ""}</div>`
      }).join("")
    }
    // Active ability
    if (player.ability) {
      this.ability.classList.remove("hidden")
      const cd = player.abilityCooldown
      this.ability.innerHTML = `${this.input.device === "keyboard" ? glyph("ability", this.input.bindings, "keyboard") : `<span class="glyph pad xy">Y</span>`}<div class="qicon">${abilityIcon()}</div><div class="qname">${esc(player.ability.name)}</div>${cd > 0 ? `<div class="cd">${Math.ceil(cd)} s</div>` : ""}`
      this.ability.classList.toggle("ready", cd <= 0)
    } else this.ability.classList.add("hidden")
    // Prompt
    if (opts.prompt) {
      this.prompt.classList.remove("hidden")
      this.prompt.innerHTML = `${glyph("interact", this.input.bindings, this.input.device)} ${esc(opts.prompt)}`
    } else this.prompt.classList.add("hidden")
    // Compass: 360° strip, markers placed by relative bearing
    this.compass.innerHTML = this.compassMarkup(player, opts.markers, opts.cameraYaw)
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

  /** Floating damage text projected to screen coordinates. Crits pop; normal hits scatter so numbers do not stack. */
  floatText(x: number, y: number, text: string, color: string): void {
    const crit = color.toLowerCase() === CRIT_COLOR
    const now = performance.now()
    let ox = this.floatRng.range(-14, 14)
    let oy = this.floatRng.range(-8, 8)
    // Lift a number that spawns on top of a still fresh one
    this.recentFloats = this.recentFloats.filter((f) => now - f.t < 380)
    const near = this.recentFloats.filter((f) => Math.abs(f.x - x) < 34 && Math.abs(f.y - y) < 26).length
    if (near > 0) {
      oy -= near * 17
      ox += (near % 2 ? 1 : -1) * 10
    }
    this.recentFloats.push({ x, y, t: now })
    const el = document.createElement("div")
    el.className = crit ? "float crit" : "float"
    el.textContent = text
    el.style.left = `${x + ox}px`
    el.style.top = `${y + oy}px`
    el.style.color = color
    this.floats.appendChild(el)
    while (this.floats.children.length > 24) this.floats.firstChild?.remove()
    setTimeout(() => el.remove(), crit ? 1150 : 950)
  }

  timeLabel(seconds: number): string {
    return formatTime(seconds)
  }

  /** Lost health stays visible as a pale rest for a moment, then drains. Regeneration and healing never cut it short. */
  private updateHpGhost(hpPct: number): void {
    const now = performance.now()
    if (this.lastHpPct < 0) {
      this.ghostPct = hpPct
      setBarWidth(this.hpGhost, hpPct, false)
    } else if (hpPct < this.lastHpPct - 1e-6) {
      // The rest starts at the health before the hit (it may still lag below after regeneration)
      if (this.ghostPct < this.lastHpPct) {
        this.ghostPct = this.lastHpPct
        setBarWidth(this.hpGhost, this.lastHpPct, false)
      }
      this.ghostHoldUntil = now + GHOST_HOLD_MS
      this.ghostHoldFrames = GHOST_HOLD_FRAMES
    }
    this.ghostHoldFrames--
    const ghost = ghostTarget(this.ghostPct, hpPct, now >= this.ghostHoldUntil && this.ghostHoldFrames <= 0)
    if (ghost !== this.ghostPct) {
      this.ghostPct = ghost
      setBarWidth(this.hpGhost, ghost, true)
    }
    this.lastHpPct = hpPct
  }

  /** Cardinal letters plus up to six markers; a marker that would overlap its neighbour moves to a second row. */
  private compassMarkup(player: Player, markers: CompassMarker[], yaw: number): string {
    const span = Math.PI / 2.2
    const toLeft = (rel: number) => 50 + (rel / span) * 50
    const parts: string[] = []
    const row1: { left: number; gap: number }[] = []
    const row2: number[] = []
    for (let deg = 0; deg < 360; deg += 45) {
      const rel = relBearing((deg * Math.PI) / 180, yaw)
      if (Math.abs(rel) >= span) continue
      const left = toLeft(rel)
      row1.push({ left, gap: COMPASS_GAP_CARDINAL })
      parts.push(`<span class="cmark card${deg === 0 ? " north" : ""}" style="left:${left.toFixed(2)}%">${["N", "NO", "O", "SO", "S", "SW", "W", "NW"][deg / 45]}</span>`)
    }
    const visible: { m: CompassMarker; left: number; d: number }[] = []
    for (const m of markers) {
      const dx = m.x - player.pos.x
      const dz = m.z - player.pos.z
      // Our compass: facing +Z is "north"
      const rel = relBearing(Math.atan2(dx, dz), yaw)
      if (Math.abs(rel) < span) visible.push({ m, left: toLeft(rel), d: Math.hypot(dx, dz) })
    }
    // Most important and nearest first, then laid out left to right
    visible.sort((a, b) => MARKER_PRIORITY[a.m.kind] - MARKER_PRIORITY[b.m.kind] || a.d - b.d)
    const shown = visible.slice(0, COMPASS_MAX_MARKERS).sort((a, b) => a.left - b.left)
    for (const v of shown) {
      let left = v.left
      const second = !row1.every((o) => Math.abs(o.left - left) >= o.gap)
      if (second) {
        // Row 2 is filled left to right; a marker that still collides is nudged right just far enough
        if (row2.length) left = Math.max(left, row2[row2.length - 1] + COMPASS_GAP_ROW2)
        row2.push(left)
      } else row1.push({ left, gap: COMPASS_GAP_ROW1 })
      parts.push(`<span class="cmark ${v.m.kind}${second ? " row2" : ""}" style="left:${left.toFixed(2)}%" title="${esc(v.m.label)}">${MARKER_ICON[v.m.kind]}<small>${formatDistance(v.d)}</small></span>`)
    }
    return parts.join("")
  }
}

/**
 * Next width of a ghost bar: it follows the health up (hidden under the fill anyway, small regeneration steps are
 * ignored) and drains down to it once the hold after a hit is over.
 */
function ghostTarget(ghost: number, hp: number, holdOver: boolean): number {
  if (hp >= ghost) return hp - ghost > 0.25 ? hp : ghost
  return holdOver ? hp : ghost
}

/** Sets a bar width either instantly or through the element's CSS transition. */
function setBarWidth(el: HTMLElement, pct: number, animate: boolean): void {
  el.style.transition = animate ? "" : "none"
  el.style.width = `${pct}%`
}

/** "165m" below 950 m, from there "1,0 km". */
export function formatDistance(d: number): string {
  if (d < 950) return `${Math.round(d)}m`
  return `${(Math.round(d / 100) / 10).toFixed(1).replace(".", ",")} km`
}

function relBearing(bearing: number, yaw: number): number {
  // The camera looks along forward(); yaw=0 looks toward -Z. Bearing 0 = +Z. Convert to a relative angle.
  const camBearing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw))
  let d = bearing - camBearing
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
