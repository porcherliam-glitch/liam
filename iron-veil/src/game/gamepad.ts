/**
 * gamepad.ts — standard-mapping gamepad support (Xbox/PlayStation layout).
 *  - In a raid, Input.poll() reads sticks and buttons into the same move/look/action state as keyboard + mouse.
 *  - In menus, MenuNavigator moves keyboard focus between visible buttons/sliders with the D-pad or left stick,
 *    A presses the focused button, B goes back, left/right on a focused slider changes its value.
 * Pure helpers (deadzone/curve) are exported for tests.
 */

export const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

/** Radial deadzone with rescaling so movement starts smoothly at the edge of the deadzone. */
export function applyDeadzone(x: number, y: number, dead = 0.18): [number, number] {
  const m = Math.hypot(x, y)
  if (m < dead) return [0, 0]
  const scaled = Math.min(1, (m - dead) / (1 - dead))
  return [x / m * scaled, y / m * scaled]
}

/** Response curve for look input: precise near the centre, fast at full deflection. */
export function lookCurve(v: number): number { return Math.sign(v) * Math.pow(Math.abs(v), 1.8) }

export function firstPad(): Gamepad | null {
  try {
    const pads = navigator.getGamepads?.() ?? []
    for (const p of pads) if (p && p.connected && p.mapping === "standard") return p
    for (const p of pads) if (p && p.connected) return p
  } catch { /* getGamepads can throw in some sandboxes */ }
  return null
}

export function pressed(p: Gamepad, i: number): boolean { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5) }

/** Focus navigation for DOM menus. */
export class MenuNavigator {
  private prev: boolean[] = []
  private repeatAt = 0
  private lastDir = ""
  enabled = true

  constructor(private root: HTMLElement, private onBack: () => void, private onStart: () => void) {}

  /** Treat currently held buttons as already handled (call when a menu opens from gameplay). */
  reset(): void { const p = firstPad(); this.prev = p ? p.buttons.map(b => b.pressed || b.value > 0.5) : [] }

  /** Call every frame while a menu (not the raid) is shown. Returns true when a pad is connected. */
  update(now: number): boolean {
    const p = firstPad(); if (!p || !this.enabled) { this.prev = []; return !!p }
    const down = (i: number) => pressed(p, i) && !this.prev[i]
    const [lx, ly] = applyDeadzone(p.axes[0] ?? 0, p.axes[1] ?? 0, 0.5)
    const dir = pressed(p, BUTTON.UP) || ly < -0.5 ? "up" : pressed(p, BUTTON.DOWN) || ly > 0.5 ? "down" : pressed(p, BUTTON.LEFT) || lx < -0.5 ? "left" : pressed(p, BUTTON.RIGHT) || lx > 0.5 ? "right" : ""
    if (dir && (dir !== this.lastDir || now >= this.repeatAt)) { this.move(dir); this.repeatAt = now + (dir === this.lastDir ? 110 : 380) }
    this.lastDir = dir
    if (down(BUTTON.A)) { const el = document.activeElement as HTMLElement | null; if (el && this.root.contains(el) && el instanceof HTMLButtonElement) el.click(); else this.move("down") }
    if (down(BUTTON.B)) this.onBack()
    if (down(BUTTON.START)) this.onStart()
    this.prev = p.buttons.map(b => b.pressed || b.value > 0.5)
    return true
  }

  private focusables(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>("button:not(:disabled), input[type=range], summary")].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
    })
  }

  private move(dir: string): void {
    const items = this.focusables(); if (!items.length) return
    const active = document.activeElement as HTMLElement | null
    if (!active || !items.includes(active)) { items[0].focus(); return }
    if (active instanceof HTMLInputElement && active.type === "range" && (dir === "left" || dir === "right")) {
      const step = Number(active.step) || 0.05
      active.value = String(Math.min(Number(active.max), Math.max(Number(active.min), Number(active.value) + (dir === "right" ? step : -step))))
      active.dispatchEvent(new Event("input", { bubbles: true })); return
    }
    const a = active.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2
    let best: HTMLElement | null = null, bestScore = Infinity
    for (const el of items) {
      if (el === active) continue
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
      const dx = x - ax, dy = y - ay
      const primary = dir === "up" ? -dy : dir === "down" ? dy : dir === "left" ? -dx : dx
      if (primary <= 4) continue
      const secondary = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy)
      const score = primary + secondary * 2.2
      if (score < bestScore) { bestScore = score; best = el }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }) }
  }
}
