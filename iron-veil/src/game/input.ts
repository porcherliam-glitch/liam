/**
 * input.ts — keyboard, mouse and gamepad for the raid. Direction conventions are fixed: W / left stick up = forward,
 * S back, A left, D right; mouse right / right stick right turns right; mouse up looks up (invertible).
 * Discrete presses are queued as "actions" (consumed once per fixed step), held keys are tracked separately.
 * Gamepad buttons are translated to the same key codes (see PAD_ACTIONS). dispose() detaches every listener.
 */
import { INPUT_CONFIG } from "./config"
import { BUTTON, applyDeadzone, firstPad, lookCurve, pressed } from "./gamepad"

const KEYMAP: Record<string, ["moveX" | "moveZ", 1 | -1]> = {
  KeyW: ["moveZ", 1], ArrowUp: ["moveZ", 1], KeyS: ["moveZ", -1], ArrowDown: ["moveZ", -1],
  KeyA: ["moveX", -1], ArrowLeft: ["moveX", -1], KeyD: ["moveX", 1], ArrowRight: ["moveX", 1],
}
/** Keys whose browser default (scrolling, focus change, quick find) must not happen during play. */
const PREVENT = new Set(["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyF", "ControlLeft", "Slash", "Quote"])
/** Gamepad button → key code it emulates. */
const PAD_ACTIONS: [number, string][] = [
  [BUTTON.A, "KeyE"], [BUTTON.X, "KeyR"], [BUTTON.Y, "KeyX"], [BUTTON.B, "KeyC"], [BUTTON.LB, "KeyG"], [BUTTON.RB, "KeyQ"],
  [BUTTON.UP, "KeyF"], [BUTTON.DOWN, "KeyM"], [BUTTON.START, "Escape"], [BUTTON.BACK, "Tab"],
  [BUTTON.R3, "KeyV"], [BUTTON.RIGHT, "KeyT"], [BUTTON.LEFT, "Digit4"],
]
/** Right-stick turn rate in rad/s at full deflection and sensitivity 0.75. */
const PAD_LOOK_SPEED = 3.0

export type InputDevice = "kb" | "pad"

export class Input {
  moveX = 0; moveZ = 0; yawDelta = 0; pitchDelta = 0
  sensitivity = 0.75; invertY = false; fireHeld = false; adsHeld = false; sprintHeld = false
  /** When false (menus), keys are not captured so text inputs and shortcuts keep working. */
  capture = false
  /** Device that produced the last input (for button prompts). */
  device: InputDevice = "kb"
  readonly actions = new Set<string>()
  private held = new Set<string>()
  private padHeld = new Set<string>()
  private kbX = 0; private kbZ = 0
  private mouseFire = false; private mouseAds = false; private shiftHeld = false
  private padPrev: boolean[] = []
  private padSprint = false
  private padFresh = true
  private unsubscribe: Array<() => void> = []

  constructor(private target: HTMLElement) {
    const on = <T extends Event>(el: Window | Document | HTMLElement, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions) => {
      const handler = fn as EventListener; el.addEventListener(type, handler, opts); this.unsubscribe.push(() => el.removeEventListener(type, handler, opts))
    }
    on<KeyboardEvent>(window, "keydown", (e) => {
      if (!this.capture) return
      if (PREVENT.has(e.code) || e.code.startsWith("Digit")) e.preventDefault()
      if (e.repeat) return
      this.device = "kb"
      this.held.add(e.code)
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.shiftHeld = true
      this.actions.add(e.code); this.recomputeAxes()
    })
    on<KeyboardEvent>(window, "keyup", (e) => {
      this.held.delete(e.code); if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.shiftHeld = false; this.recomputeAxes()
    })
    on<MouseEvent>(target, "mousedown", (e) => {
      this.device = "kb"
      if (e.button === 0) { this.mouseFire = true; this.fireHeld = true; this.actions.add("Fire") }
      if (e.button === 2) { this.mouseAds = true; this.adsHeld = true }
      if (e.button === 1) { e.preventDefault(); this.actions.add("Middle") }
    })
    on<MouseEvent>(window, "mouseup", (e) => { if (e.button === 0) { this.mouseFire = false; this.fireHeld = false } if (e.button === 2) { this.mouseAds = false; this.adsHeld = false } })
    on<WheelEvent>(target, "wheel", (e) => { if (!this.capture) return; e.preventDefault(); this.actions.add(e.deltaY > 0 ? "WheelDown" : "WheelUp") }, { passive: false })
    on<MouseEvent>(target, "contextmenu", (e) => e.preventDefault())
    on(window, "blur", () => this.resetAll())
    on(document, "visibilitychange", () => { if (document.hidden) this.resetAll() })
    on<MouseEvent>(window, "mousemove", (e) => {
      if (document.pointerLockElement !== this.target) return
      // browsers occasionally report a huge spike right after locking; ignore it
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
      // browsers also send zero-movement events (e.g. when the lock engages); they say nothing about the device
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = "kb"
      const scale = this.sensitivity / 0.75
      this.yawDelta -= e.movementX * INPUT_CONFIG.MOUSE_SENS_X * scale
      this.pitchDelta += -e.movementY * INPUT_CONFIG.MOUSE_SENS_Y * scale * (this.invertY ? -1 : 1)
    })
  }

  /** Reads the gamepad; call once per fixed step while capturing. */
  poll(dt: number): void {
    const p = this.capture ? firstPad() : null
    if (!p) { this.padHeld.clear(); this.padFresh = true; this.combine(0, 0, false, false); return }
    const now = p.buttons.map(b => b.pressed || b.value > 0.5)
    // buttons already held when control returns (e.g. Start used to resume) must not trigger again
    if (this.padFresh) { this.padPrev = now; this.padFresh = false }
    const edge = (i: number) => now[i] && !this.padPrev[i]
    const [lx, ly] = applyDeadzone(p.axes[0] ?? 0, p.axes[1] ?? 0)
    const [rx, ry] = applyDeadzone(p.axes[2] ?? 0, p.axes[3] ?? 0, 0.14)
    const rt = (p.buttons[BUTTON.RT]?.value ?? 0) > 0.35, lt = (p.buttons[BUTTON.LT]?.value ?? 0) > 0.35
    const active = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0 || rt || lt || now.some(Boolean)
    if (active) this.device = "pad"
    const scale = this.sensitivity / 0.75 * PAD_LOOK_SPEED * dt
    this.yawDelta -= lookCurve(rx) * scale
    this.pitchDelta -= lookCurve(ry) * scale * 0.75 * (this.invertY ? -1 : 1)
    if (rt && !this.padPrev[BUTTON.RT]) this.actions.add("Fire")
    for (const [button, code] of PAD_ACTIONS) {
      if (edge(button)) this.actions.add(code)
      if (now[button]) this.padHeld.add(code); else this.padHeld.delete(code)
    }
    // L3 toggles sprint until the stick is released or pulled back
    if (edge(BUTTON.L3)) this.padSprint = !this.padSprint
    if (ly > -0.3) this.padSprint = false
    this.padPrev = now
    this.padPrev[BUTTON.RT] = rt
    this.combine(lx, -ly, rt, lt)
  }

  private combine(px: number, pz: number, padFire: boolean, padAds: boolean): void {
    this.moveX = Math.max(-1, Math.min(1, this.kbX + px))
    this.moveZ = Math.max(-1, Math.min(1, this.kbZ + pz))
    this.fireHeld = this.mouseFire || padFire
    this.adsHeld = this.mouseAds || padAds
    this.sprintHeld = this.shiftHeld || this.padSprint
  }

  dispose(): void { for (const off of this.unsubscribe) off(); this.unsubscribe = []; this.actions.clear(); this.resetAll() }
  resetAll(): void {
    this.held.clear(); this.padHeld.clear(); this.kbX = 0; this.kbZ = 0; this.moveX = 0; this.moveZ = 0; this.yawDelta = 0; this.pitchDelta = 0
    this.mouseFire = false; this.mouseAds = false; this.shiftHeld = false; this.padSprint = false; this.fireHeld = false; this.adsHeld = false; this.sprintHeld = false; this.padFresh = true
  }
  private recomputeAxes(): void {
    let x = 0, z = 0
    for (const code of this.held) { const m = KEYMAP[code]; if (m) { if (m[0] === "moveX") x += m[1]; else z += m[1] } }
    this.kbX = Math.max(-1, Math.min(1, x)); this.kbZ = Math.max(-1, Math.min(1, z))
    this.moveX = this.kbX; this.moveZ = this.kbZ; this.sprintHeld = this.shiftHeld || this.padSprint
  }
  consumeLook(): { yaw: number; pitch: number } { const r = { yaw: this.yawDelta, pitch: this.pitchDelta }; this.yawDelta = 0; this.pitchDelta = 0; return r }
  consumeAction(code: string): boolean { const has = this.actions.has(code); if (has) this.actions.delete(code); return has }
  isHeld(code: string): boolean { return this.held.has(code) || this.padHeld.has(code) }
  clearActions(): void { this.actions.clear() }
}
