// DOM-based UI with a screen stack and spatial focus navigation so every menu works with a controller.

import type { Input } from "../input/input"
import type { Action } from "../input/bindings"
import { glyph } from "../input/glyphs"
import type { AudioEngine } from "../audio/audio"

export type ButtonKind = "confirm" | "alt" | "alt2"

export interface Screen {
  /** CSS id / class name. */
  name: string
  /** Builds the markup. Called on show and whenever refresh() is requested. */
  render(): string
  /** Called when an element with data-action is activated. */
  onAction?(action: string, el: HTMLElement, button: ButtonKind): void
  /** Left/right on an element with data-adjust. */
  onAdjust?(el: HTMLElement, delta: number): void
  onBack?(): void
  onTab?(dir: number): void
  onShow?(el: HTMLElement): void
  onHide?(): void
  update?(dt: number): void
  /** Overlay screens leave the HUD visible underneath. */
  overlay?: boolean
  /** Element to focus first (selector). */
  initialFocus?: string
  /** Hint bar entries. */
  hints?(): { action: Action; label: string }[]
}

export class UI {
  readonly root: HTMLElement
  private stack: { screen: Screen; el: HTMLElement; focused: HTMLElement | null }[] = []
  private hintBar: HTMLElement
  private toastBox: HTMLElement
  private lastDevice = ""
  private pushedAt = 0

  constructor(private input: Input, private audio: AudioEngine) {
    this.root = document.getElementById("ui")!
    this.hintBar = document.createElement("div")
    this.hintBar.className = "hintbar"
    this.root.appendChild(this.hintBar)
    this.toastBox = document.createElement("div")
    this.toastBox.className = "toasts"
    this.root.appendChild(this.toastBox)
    this.root.addEventListener("click", (e) => this.onClick(e))
    this.root.addEventListener("mousemove", (e) => this.onMouseMove(e))
  }

  get top(): Screen | null {
    return this.stack.length ? this.stack[this.stack.length - 1].screen : null
  }

  get depth(): number {
    return this.stack.length
  }

  has(name: string): boolean {
    return this.stack.some((s) => s.screen.name === name)
  }

  push(screen: Screen): void {
    this.input.consumeAll()
    const el = document.createElement("div")
    el.className = `screen screen-${screen.name}`
    el.dataset.screen = screen.name
    el.innerHTML = screen.render()
    this.root.insertBefore(el, this.hintBar)
    const entry = { screen, el, focused: null as HTMLElement | null }
    this.stack.push(entry)
    this.pushedAt = performance.now()
    this.updateVisibility()
    screen.onShow?.(el)
    this.focusInitial(entry)
    this.renderHints()
  }

  pop(): void {
    const entry = this.stack.pop()
    if (!entry) return
    entry.screen.onHide?.()
    entry.el.remove()
    this.input.consumeAll()
    this.updateVisibility()
    const top = this.stack[this.stack.length - 1]
    if (top) {
      this.refresh(top.screen)
      if (!top.focused || !top.el.contains(top.focused)) this.focusInitial(top)
    }
    this.renderHints()
  }

  popAll(): void {
    while (this.stack.length) this.pop()
  }

  replace(screen: Screen): void {
    this.pop()
    this.push(screen)
  }

  /** Re-renders a screen while keeping the focus on the same data-id if possible. */
  refresh(screen?: Screen): void {
    const entry = screen ? this.stack.find((s) => s.screen === screen) : this.stack[this.stack.length - 1]
    if (!entry) return
    const prevId = entry.focused?.dataset.focusId ?? entry.focused?.dataset.action
    const prevIdx = entry.focused ? this.focusables(entry.el).indexOf(entry.focused) : -1
    const scrolls = new Map<string, number>()
    entry.el.querySelectorAll<HTMLElement>("[data-scroll]").forEach((s) => scrolls.set(s.dataset.scroll!, s.scrollTop))
    entry.el.innerHTML = entry.screen.render()
    entry.el.querySelectorAll<HTMLElement>("[data-scroll]").forEach((s) => {
      const v = scrolls.get(s.dataset.scroll!)
      if (v !== undefined) s.scrollTop = v
    })
    const list = this.focusables(entry.el)
    let next: HTMLElement | null = null
    if (prevId) next = list.find((e) => (e.dataset.focusId ?? e.dataset.action) === prevId) ?? null
    if (!next && prevIdx >= 0) next = list[Math.min(prevIdx, list.length - 1)] ?? null
    entry.focused = null
    if (next) this.setFocus(entry, next, false)
    else this.focusInitial(entry)
    this.renderHints()
  }

  private updateVisibility(): void {
    // Only the top screen (and overlays below it that declare overlay) are shown; others are hidden.
    for (let i = 0; i < this.stack.length; i++) {
      const e = this.stack[i]
      const isTop = i === this.stack.length - 1
      e.el.classList.toggle("hidden", !isTop)
    }
    document.body.classList.toggle("menu-open", this.stack.length > 0 && !this.top?.overlay)
    document.body.classList.toggle("any-screen", this.stack.length > 0)
  }

  private focusables(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>("[data-focus]")).filter((e) => e.offsetParent !== null && !e.classList.contains("disabled"))
  }

  private focusInitial(entry: { screen: Screen; el: HTMLElement; focused: HTMLElement | null }): void {
    const list = this.focusables(entry.el)
    let target: HTMLElement | null = null
    if (entry.screen.initialFocus) target = entry.el.querySelector<HTMLElement>(entry.screen.initialFocus)
    if (!target) target = list[0] ?? null
    if (target) this.setFocus(entry, target, false)
  }

  private setFocus(entry: { el: HTMLElement; focused: HTMLElement | null }, el: HTMLElement, sound = true): void {
    if (entry.focused === el) return
    entry.focused?.classList.remove("focused")
    entry.focused = el
    el.classList.add("focused")
    el.scrollIntoView({ block: "nearest", inline: "nearest" })
    if (sound) this.audio.play("ui_move")
    const top = this.stack[this.stack.length - 1]
    if (top && top.el === entry.el) this.renderHints()
    const screen = this.stack.find((s) => s.el === entry.el)?.screen
    ;(screen as { onFocus?: (el: HTMLElement) => void } | undefined)?.onFocus?.(el)
  }

  /** Currently focused element of the top screen. */
  get focused(): HTMLElement | null {
    return this.stack[this.stack.length - 1]?.focused ?? null
  }

  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")
    const top = this.stack[this.stack.length - 1]
    if (!top || !target || !top.el.contains(target)) return
    if (target.classList.contains("disabled")) return
    if (target.dataset.focus !== undefined) this.setFocus(top, target, false)
    this.audio.play("ui_confirm")
    top.screen.onAction?.(target.dataset.action!, target, e.button === 2 ? "alt" : "confirm")
  }

  private onMouseMove(e: MouseEvent): void {
    const top = this.stack[this.stack.length - 1]
    if (!top) return
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-focus]")
    if (target && top.el.contains(target) && !target.classList.contains("disabled")) this.setFocus(top, target, false)
  }

  private navigate(dir: "up" | "down" | "left" | "right"): void {
    const top = this.stack[this.stack.length - 1]
    if (!top) return
    const list = this.focusables(top.el)
    if (!list.length) return
    const cur = top.focused && list.includes(top.focused) ? top.focused : null
    if (!cur) {
      this.setFocus(top, list[0])
      return
    }
    // Horizontal adjust on sliders / selectors
    if ((dir === "left" || dir === "right") && cur.dataset.adjust !== undefined) {
      top.screen.onAdjust?.(cur, dir === "left" ? -1 : 1)
      this.audio.play("ui_move")
      return
    }
    const r = cur.getBoundingClientRect()
    const cx = (r.left + r.right) / 2
    const cy = (r.top + r.bottom) / 2
    let best: HTMLElement | null = null
    let bestScore = Infinity
    for (const el of list) {
      if (el === cur) continue
      const b = el.getBoundingClientRect()
      const bx = (b.left + b.right) / 2
      const by = (b.top + b.bottom) / 2
      let dx = bx - cx
      let dy = by - cy
      let primary: number
      let secondary: number
      switch (dir) {
        case "up":
          primary = -dy
          secondary = Math.abs(dx)
          // Use edge distance to favour elements in the same column
          if (b.bottom > r.top + 2 && b.top < r.bottom) primary = -1
          break
        case "down":
          primary = dy
          secondary = Math.abs(dx)
          if (b.top < r.bottom - 2 && b.bottom > r.top) primary = -1
          break
        case "left":
          primary = -dx
          secondary = Math.abs(dy)
          if (b.right > r.left + 2 && b.left < r.right) primary = -1
          break
        default:
          primary = dx
          secondary = Math.abs(dy)
          if (b.left < r.right - 2 && b.right > r.left) primary = -1
      }
      if (primary <= 0) continue
      // Overlap bonus: elements that overlap on the secondary axis are strongly preferred.
      const overlap = dir === "up" || dir === "down" ? Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)) : Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top))
      const score = primary + secondary * (overlap > 0 ? 0.3 : 2.5)
      if (score < bestScore) {
        bestScore = score
        best = el
      }
    }
    if (best) this.setFocus(top, best)
  }

  /** Handles navigation input. Returns true when a screen is open (game input should be blocked). */
  update(dt: number): boolean {
    const top = this.stack[this.stack.length - 1]
    if (this.lastDevice !== this.input.device) {
      this.lastDevice = this.input.device
      this.renderHints()
      document.body.dataset.device = this.input.device
    }
    if (!top) {
      this.hintBar.classList.add("hidden")
      return false
    }
    this.hintBar.classList.remove("hidden")
    const input = this.input
    if (input.capturing) {
      top.screen.update?.(dt)
      return true
    }
    if (input.repeat("menuUp")) this.navigate("up")
    else if (input.repeat("menuDown")) this.navigate("down")
    else if (input.repeat("menuLeft")) this.navigate("left")
    else if (input.repeat("menuRight")) this.navigate("right")
    if (input.pressed("confirm")) {
      input.consume("confirm")
      input.consume("jump")
      input.consume("attack")
      const f = top.focused
      if (f && f.dataset.action && !f.classList.contains("disabled")) {
        this.audio.play("ui_confirm")
        top.screen.onAction?.(f.dataset.action, f, "confirm")
      }
    } else if (input.pressed("menuAlt")) {
      input.consume("menuAlt")
      input.consume("interact")
      const f = top.focused
      if (f && f.dataset.action && !f.classList.contains("disabled")) {
        this.audio.play("ui_confirm")
        top.screen.onAction?.(f.dataset.action, f, "alt")
      }
    } else if (input.pressed("menuAlt2")) {
      input.consume("menuAlt2")
      input.consume("inventory")
      const f = top.focused
      if (f && f.dataset.action && !f.classList.contains("disabled")) {
        this.audio.play("ui_confirm")
        top.screen.onAction?.(f.dataset.action, f, "alt2")
      }
    } else if (input.pressed("back")) {
      input.consume("back")
      input.consume("dodge")
      input.consume("pause")
      this.audio.play("ui_back")
      if (top.screen.onBack) top.screen.onBack()
      else this.pop()
    } else if (input.pressed("tabPrev")) {
      input.consume("tabPrev")
      input.consume("switchWeapon")
      top.screen.onTab?.(-1)
    } else if (input.pressed("tabNext")) {
      input.consume("tabNext")
      input.consume("heavy")
      top.screen.onTab?.(1)
    }
    top.screen.update?.(dt)
    return true
  }

  renderHints(): void {
    const top = this.top
    if (!top) return
    const hints = top.hints?.() ?? [
      { action: "confirm" as Action, label: "Auswählen" },
      { action: "back" as Action, label: "Zurück" },
    ]
    this.hintBar.innerHTML = hints.map((h) => `<span class="hint">${glyph(h.action, this.input.bindings, this.input.device)} ${h.label}</span>`).join("")
  }

  toast(text: string, kind: "info" | "loot" | "warn" | "good" = "info"): void {
    const el = document.createElement("div")
    el.className = `toast toast-${kind}`
    el.textContent = text
    this.toastBox.appendChild(el)
    while (this.toastBox.children.length > 6) this.toastBox.firstChild?.remove()
    setTimeout(() => el.classList.add("fade"), 3200)
    setTimeout(() => el.remove(), 4000)
  }

  glyph(action: Action): string {
    return glyph(action, this.input.bindings, this.input.device)
  }
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function bar(value: number, max: number, cls = ""): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return `<div class="bar ${cls}"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`
}
