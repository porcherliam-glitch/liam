/**
 * touch.ts — on-screen controls for phones and tablets (landscape). A floating move stick appears where the left thumb
 * lands (full push = sprint); dragging anywhere on the right half turns the view; the fire button shoots and also turns
 * the view while it is dragged. Every other button sends the same key code as the keyboard (Input.touchKey), so the
 * raid needs no touch-only game logic: it only shows this layer while the player is in control.
 */
import { stickVector, type Input } from "./input"
import type { HudSnapshot } from "./types"

interface ButtonDef { code: string; label: string; cls: string; icon?: string }

/** Buttons by group; code "Aim" toggles aiming, "Full" toggles fullscreen, everything else is a key code. */
const CLUSTER: ButtonDef[] = [
  { code: "Fire", label: "FEUER", cls: "t-fire", icon: "◎" },
  { code: "Aim", label: "ZIELEN", cls: "t-aim", icon: "⊕" },
  { code: "KeyR", label: "LADEN", cls: "t-reload", icon: "↻" },
  { code: "KeyC", label: "DUCKEN", cls: "t-crouch", icon: "▾" },
]
const ROW: ButtonDef[] = [
  { code: "KeyQ", label: "HEILEN", cls: "", icon: "✚" },
  { code: "KeyG", label: "WERFEN", cls: "", icon: "●" },
  { code: "Digit4", label: "WURF ⇄", cls: "", icon: "⇄" },
  { code: "KeyV", label: "MESSER", cls: "", icon: "⟋" },
  { code: "KeyX", label: "WAFFE", cls: "", icon: "⇆" },
  { code: "KeyT", label: "MUNITION", cls: "", icon: "⁝" },
]
const TOP: ButtonDef[] = [
  { code: "KeyF", label: "LAMPE", cls: "", icon: "☀" },
  { code: "KeyN", label: "NACHT", cls: "", icon: "◐" },
  { code: "Full", label: "VOLL", cls: "", icon: "⛶" },
  { code: "Escape", label: "PAUSE", cls: "", icon: "❚❚" },
  { code: "KeyM", label: "KARTE", cls: "", icon: "▦" },
  { code: "Tab", label: "RUCKSACK", cls: "", icon: "▣" },
]

/** Button labels for prompts ("E halten" becomes "BENUTZEN halten"). */
export const TOUCH_LABEL: Record<string, string> = {
  E: "BENUTZEN", Q: "HEILEN", G: "WERFEN", R: "LADEN", F: "LAMPE", M: "KARTE", C: "DUCKEN", V: "MESSER", T: "MUNITION", N: "NACHTSICHT", X: "WAFFE", "4": "WURF ⇄",
}

const STICK_R = 56

export class TouchControls {
  readonly root: HTMLElement
  private visible = false
  private stick: { id: number; ox: number; oy: number } | null = null
  private looks = new Map<number, { x: number; y: number }>()
  private base: HTMLElement
  private knob: HTMLElement
  private aimBtn: HTMLElement
  private useBtn: HTMLElement
  private off: Array<() => void> = []

  constructor(host: HTMLElement, private input: Input) {
    const root = document.createElement("div")
    root.className = "touch-layer"; root.hidden = true
    const btn = (b: ButtonDef) => `<button type="button" class="t-btn ${b.cls}" data-code="${b.code}" aria-label="${b.label}"><b>${b.icon ?? ""}</b><small>${b.label}</small></button>`
    root.innerHTML = `<div class="t-move"></div><div class="t-look"></div>
      <div class="t-stick"><i></i></div>
      <div class="t-cluster">${CLUSTER.map(btn).join("")}</div>
      <div class="t-row">${ROW.map(btn).join("")}</div>
      <div class="t-top">${TOP.map(btn).join("")}</div>
      ${btn({ code: "KeyE", label: "BENUTZEN", cls: "t-use", icon: "✋" })}
      <div class="t-rotate"><b>⟳</b><span>Bitte das Handy quer halten</span></div>`
    host.appendChild(root)
    this.root = root
    this.base = root.querySelector(".t-stick")!
    this.knob = this.base.querySelector("i")!
    this.aimBtn = root.querySelector(".t-aim")!
    this.useBtn = root.querySelector(".t-use")!
    const on = (el: EventTarget, type: string, fn: (e: PointerEvent) => void) => {
      const h = fn as EventListener; el.addEventListener(type, h, { passive: false }); this.off.push(() => el.removeEventListener(type, h))
    }
    // move stick: floats to where the thumb lands
    const move = root.querySelector<HTMLElement>(".t-move")!
    on(move, "pointerdown", e => {
      e.preventDefault(); if (this.stick) return
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY }
      move.setPointerCapture?.(e.pointerId)
      this.base.style.left = `${e.clientX}px`; this.base.style.top = `${e.clientY}px`; this.base.classList.add("on")
      this.knob.style.transform = "translate(-50%, -50%)"
    })
    on(move, "pointermove", e => {
      const s = this.stick; if (!s || s.id !== e.pointerId) return
      e.preventDefault()
      const dx = e.clientX - s.ox, dy = e.clientY - s.oy, v = stickVector(dx, dy, STICK_R)
      const k = Math.min(1, STICK_R / Math.max(1, Math.hypot(dx, dy)))
      this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`
      this.base.classList.toggle("sprint", v.mag >= 0.92 && v.z > 0.5)
      this.input.touchStick(v.x, v.z)
    })
    const endMove = (e: PointerEvent) => { if (!this.stick || this.stick.id !== e.pointerId) return; this.stick = null; this.base.classList.remove("on", "sprint"); this.input.touchStick(0, 0) }
    on(move, "pointerup", endMove); on(move, "pointercancel", endMove)
    // look: drag on the right half
    const look = root.querySelector<HTMLElement>(".t-look")!
    this.dragLook(look, on)
    // buttons
    for (const el of root.querySelectorAll<HTMLElement>(".t-btn")) {
      const code = el.dataset.code!
      on(el, "pointerdown", e => {
        e.preventDefault(); e.stopPropagation(); el.setPointerCapture?.(e.pointerId); el.classList.add("down")
        if (code === "Aim") { this.input.touchAim(!this.input.touchAiming); return }
        if (code === "Full") { toggleFullscreen(); return }
        this.input.touchKey(code, true)
        if (code === "Fire") this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY })
      })
      const up = (e: PointerEvent) => {
        el.classList.remove("down")
        if (code === "Fire") this.looks.delete(e.pointerId)
        if (code !== "Aim" && code !== "Full") this.input.touchKey(code, false)
      }
      on(el, "pointerup", up); on(el, "pointercancel", up)
      // the fire button also aims while the thumb slides on it
      if (code === "Fire") on(el, "pointermove", e => this.lookMove(e))
    }
    on(root, "contextmenu", e => e.preventDefault())
  }

  private dragLook(el: HTMLElement, on: (el: EventTarget, type: string, fn: (e: PointerEvent) => void) => void): void {
    on(el, "pointerdown", e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY }) })
    on(el, "pointermove", e => this.lookMove(e))
    const end = (e: PointerEvent) => { this.looks.delete(e.pointerId) }
    on(el, "pointerup", end); on(el, "pointercancel", end)
  }

  private lookMove(e: PointerEvent): void {
    const p = this.looks.get(e.pointerId); if (!p) return
    e.preventDefault()
    this.input.touchLook(e.clientX - p.x, e.clientY - p.y)
    p.x = e.clientX; p.y = e.clientY
  }

  /** Shows the layer while the player is in control; highlights "use" when something can be used. */
  update(visible: boolean, h?: HudSnapshot): void {
    if (visible !== this.visible) {
      this.visible = visible; this.root.hidden = !visible
      if (!visible) { this.stick = null; this.looks.clear(); this.base.classList.remove("on", "sprint"); for (const b of this.root.querySelectorAll(".down")) b.classList.remove("down") }
    }
    if (!visible) return
    this.aimBtn.classList.toggle("active", this.input.touchAiming)
    this.useBtn.classList.toggle("show", !!h?.interaction)
  }

  dispose(): void { for (const f of this.off) f(); this.off = []; this.root.remove() }
}

/** Fullscreen and landscape lock where the browser allows it (phones mostly do after a tap; embedded views may not). */
function toggleFullscreen(): void {
  try {
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    if (document.fullscreenElement || d.webkitFullscreenElement) { (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.()); return }
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
    const r = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()
    const lock = () => { try { (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape")?.catch(() => {}) } catch { /* not supported */ } }
    if (r && typeof (r as Promise<void>).then === "function") (r as Promise<void>).then(lock).catch(() => {}); else lock()
  } catch { /* fullscreen is optional */ }
}
