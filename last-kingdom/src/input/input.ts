// Unified input: keyboard, mouse (pointer lock) and gamepads (Gamepad API) feed the same action set.
// Supports hot-plugging, device detection for glyphs, rebinding and rumble.

import { clamp } from "../core/math"
import { loadBindings, saveBindings, type Action, type BindingMap } from "./bindings"
import type { DeviceKind } from "./glyphs"

export interface Vec2 {
  x: number
  y: number
}

const ALL_ACTIONS: Action[] = [
  "moveForward", "moveBack", "moveLeft", "moveRight", "jump", "dodge", "interact", "inventory", "attack", "heavy", "block",
  "switchWeapon", "pause", "map", "quick1", "quick2", "quick3", "quick4", "sprint", "lockOn", "menuUp", "menuDown", "menuLeft",
  "menuRight", "confirm", "back", "tabPrev", "tabNext", "menuAlt", "menuAlt2", "ability",
]

export class Input {
  bindings: BindingMap = loadBindings()
  device: DeviceKind = "keyboard"
  gamepadConnected = false
  gamepadName = ""
  deadzone = 0.18
  mouseSensitivity = 0.6
  padSensitivity = 0.6
  invertY = false
  vibration = true
  /** Set while the game wants the mouse captured. */
  wantPointerLock = false

  private keys = new Set<string>()
  private mouseButtons = new Set<number>()
  /** Keys/buttons pressed since the last update: a tap between two slow frames must still count. */
  private pendingKeys = new Set<string>()
  private pendingMouse = new Set<number>()
  private padButtons = new Set<number>()
  private padAxes = [0, 0, 0, 0]
  private held = new Set<Action>()
  private heldPrev = new Set<Action>()
  private pressedThisFrame = new Set<Action>()
  private releasedThisFrame = new Set<Action>()
  private consumed = new Set<Action>()
  private mouseDelta = { x: 0, y: 0 }
  private wheelDelta = 0
  private repeatTimers = new Map<Action, number>()
  private lastPadActivity = 0
  private capture: ((kind: "key" | "mouse" | "pad", code: string | number) => void) | null = null
  /** Mouse position in CSS pixels, for UI hover handled by the browser. */
  pointer = { x: 0, y: 0 }
  anyKeyThisFrame = false
  private textInputActive = false
  private rumbleUntil = 0
  private repeatFrames = new Map<Action, number>()
  /** Escape presses are ignored until this time (set when the browser released the pointer lock with Esc). */
  ignoreEscapeUntil = 0

  constructor(private canvas: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown)
    window.addEventListener("keyup", this.onKeyUp)
    window.addEventListener("mousedown", this.onMouseDown)
    window.addEventListener("mouseup", this.onMouseUp)
    window.addEventListener("mousemove", this.onMouseMove)
    window.addEventListener("wheel", this.onWheel, { passive: true })
    window.addEventListener("contextmenu", (e) => e.preventDefault())
    window.addEventListener("blur", () => this.releaseAll())
    window.addEventListener("gamepadconnected", (e) => this.onPadConnected((e as GamepadEvent).gamepad))
    window.addEventListener("gamepaddisconnected", (e) => this.onPadDisconnected((e as GamepadEvent).gamepad))
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== this.canvas) this.mouseDelta.x = this.mouseDelta.y = 0
    })
    canvas.addEventListener("mousedown", () => {
      if (this.wantPointerLock && document.pointerLockElement !== canvas) this.requestLock()
    })
  }

  // ---- device events -------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.textInputActive) {
      if (e.code === "Escape" || e.code === "Enter") this.keys.add(e.code)
      return
    }
    if (this.capture) {
      e.preventDefault()
      const cb = this.capture
      this.capture = null
      cb("key", e.code)
      return
    }
    if (e.code === "Escape" && performance.now() < this.ignoreEscapeUntil) return
    if (!this.keys.has(e.code)) this.anyKeyThisFrame = true
    this.keys.add(e.code)
    this.pendingKeys.add(e.code)
    this.device = "keyboard"
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "AltLeft"].includes(e.code)) e.preventDefault()
    if (e.code === "F5" || e.code === "F12" || (e.ctrlKey && (e.code === "KeyR" || e.code === "KeyW" || e.code === "KeyT"))) return
    if (e.code.startsWith("F") && e.code.length <= 3) e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onMouseDown = (e: MouseEvent) => {
    if (this.textInputActive) return
    if (this.capture) {
      const cb = this.capture
      this.capture = null
      cb("mouse", e.button)
      return
    }
    this.mouseButtons.add(e.button)
    this.pendingMouse.add(e.button)
    this.device = "keyboard"
    this.anyKeyThisFrame = true
  }

  private onMouseUp = (e: MouseEvent) => {
    this.mouseButtons.delete(e.button)
  }

  private onMouseMove = (e: MouseEvent) => {
    this.pointer.x = e.clientX
    this.pointer.y = e.clientY
    if (document.pointerLockElement === this.canvas) {
      // Browsers occasionally report huge jumps right after locking; ignore them.
      const mx = clamp(e.movementX, -200, 200)
      const my = clamp(e.movementY, -200, 200)
      this.mouseDelta.x += mx
      this.mouseDelta.y += my
      if (Math.abs(mx) + Math.abs(my) > 2) this.device = "keyboard"
    }
  }

  private onWheel = (e: WheelEvent) => {
    this.wheelDelta += Math.sign(e.deltaY)
  }

  private onPadConnected(pad: Gamepad | undefined) {
    if (!pad) return
    this.gamepadConnected = true
    this.gamepadName = pad.id
    this.device = detectDevice(pad.id)
  }

  private onPadDisconnected(_pad: Gamepad) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const any = Array.from(pads).find((p) => p && p.connected)
    this.gamepadConnected = !!any
    if (!any) {
      this.gamepadName = ""
      this.device = "keyboard"
      this.padButtons.clear()
      this.padAxes = [0, 0, 0, 0]
    }
  }

  private releaseAll() {
    this.keys.clear()
    this.mouseButtons.clear()
    this.padButtons.clear()
    this.padAxes = [0, 0, 0, 0]
  }

  // ---- polling ---------------------------------------------------------------

  private pollGamepad() {
    if (!navigator.getGamepads) return
    const pads = navigator.getGamepads()
    let pad: Gamepad | null = null
    for (const p of pads) {
      if (p && p.connected) {
        pad = p
        break
      }
    }
    this.padButtons.clear()
    if (!pad) {
      if (this.gamepadConnected) this.onPadDisconnected(pad!)
      this.padAxes = [0, 0, 0, 0]
      return
    }
    if (!this.gamepadConnected) this.onPadConnected(pad)
    let active = false
    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i]
      const pressed = typeof b === "object" ? b.pressed || b.value > 0.5 : (b as unknown as number) > 0.5
      if (pressed) {
        this.padButtons.add(i)
        active = true
      }
    }
    for (let i = 0; i < 4; i++) {
      const raw = pad.axes[i] ?? 0
      this.padAxes[i] = Math.abs(raw) < this.deadzone ? 0 : raw
      if (Math.abs(raw) > this.deadzone + 0.1) active = true
    }
    if (active) {
      this.lastPadActivity = performance.now()
      const kind = detectDevice(pad.id)
      if (this.device !== kind) this.device = kind
      if (this.capture) {
        const cb = this.capture
        for (let i = 0; i < pad.buttons.length; i++) {
          if (this.padButtons.has(i)) {
            this.capture = null
            cb("pad", i)
            break
          }
        }
      }
    }
  }

  private isActionDown(action: Action): boolean {
    const b = this.bindings[action]
    for (const k of b.keys) if (this.keys.has(k) || this.pendingKeys.has(k)) return true
    for (const m of b.mouse) if (this.mouseButtons.has(m) || this.pendingMouse.has(m)) return true
    for (const p of b.pad) if (this.padButtons.has(p)) return true
    // Left stick doubles as menu navigation.
    if (action === "menuUp" && this.padAxes[1] < -0.6) return true
    if (action === "menuDown" && this.padAxes[1] > 0.6) return true
    if (action === "menuLeft" && this.padAxes[0] < -0.6) return true
    if (action === "menuRight" && this.padAxes[0] > 0.6) return true
    return false
  }

  /** Call once per frame before reading actions. */
  update(dt: number): void {
    this.pollGamepad()
    this.heldPrev = new Set(this.held)
    this.held.clear()
    this.pressedThisFrame.clear()
    this.releasedThisFrame.clear()
    for (const a of ALL_ACTIONS) {
      if (this.isActionDown(a)) {
        this.held.add(a)
        if (!this.heldPrev.has(a)) this.pressedThisFrame.add(a)
      } else if (this.heldPrev.has(a)) {
        this.releasedThisFrame.add(a)
        this.repeatTimers.delete(a)
      }
    }
    this.pendingKeys.clear()
    this.pendingMouse.clear()
    for (const a of this.consumed) if (!this.held.has(a)) this.consumed.delete(a)
    for (const [a, t] of this.repeatTimers) {
      this.repeatTimers.set(a, t + dt)
      this.repeatFrames.set(a, (this.repeatFrames.get(a) ?? 0) + 1)
    }
    if (this.rumbleUntil && performance.now() > this.rumbleUntil) this.rumbleUntil = 0
  }

  /** Must be called at the end of the frame so mouse deltas reset. */
  endFrame(): void {
    this.mouseDelta.x = 0
    this.mouseDelta.y = 0
    this.wheelDelta = 0
    this.anyKeyThisFrame = false
  }

  down(action: Action): boolean {
    return this.held.has(action) && !this.consumed.has(action)
  }

  pressed(action: Action): boolean {
    return this.pressedThisFrame.has(action) && !this.consumed.has(action)
  }

  released(action: Action): boolean {
    return this.releasedThisFrame.has(action)
  }

  /** Marks an action as handled: it stays inactive until released. Prevents a menu's confirm from attacking. */
  consume(action: Action): void {
    this.consumed.add(action)
  }

  consumeAll(): void {
    for (const a of this.held) this.consumed.add(a)
  }

  /** Press with auto-repeat (for menu navigation while holding). */
  repeat(action: Action, delay = 0.38, interval = 0.11): boolean {
    if (this.pressed(action)) {
      this.repeatTimers.set(action, 0)
      this.repeatFrames.set(action, 0)
      return true
    }
    if (!this.down(action)) return false
    const t = this.repeatTimers.get(action) ?? 0
    // Needs both: enough time and a few frames, so a tap during a slow frame never double-fires.
    if (t >= delay && (this.repeatFrames.get(action) ?? 0) >= 3) {
      this.repeatTimers.set(action, delay - interval)
      return true
    }
    return false
  }

  /** Movement vector: x right, y forward, length <= 1. */
  move(): Vec2 {
    let x = 0
    let y = 0
    if (this.down("moveRight")) x += 1
    if (this.down("moveLeft")) x -= 1
    if (this.down("moveForward")) y += 1
    if (this.down("moveBack")) y -= 1
    if (x === 0 && y === 0) {
      x = this.padAxes[0]
      y = -this.padAxes[1]
      const len = Math.hypot(x, y)
      if (len > 0) {
        // Rescale so the deadzone edge maps to 0 and full tilt to 1.
        const scaled = clamp((len - this.deadzone) / (1 - this.deadzone), 0, 1)
        x = (x / len) * scaled
        y = (y / len) * scaled
      }
    } else {
      const len = Math.hypot(x, y)
      if (len > 1) {
        x /= len
        y /= len
      }
    }
    return { x, y }
  }

  /** Look delta for this frame in radians (already scaled by sensitivity and dt for the stick). */
  look(dt: number): Vec2 {
    let x = this.mouseDelta.x * 0.0022 * this.mouseSensitivity * 1.6
    let y = this.mouseDelta.y * 0.0022 * this.mouseSensitivity * 1.6
    const sx = this.padAxes[2]
    const sy = this.padAxes[3]
    const mag = Math.hypot(sx, sy)
    if (mag > 0) {
      const curve = Math.pow(clamp((mag - this.deadzone) / (1 - this.deadzone), 0, 1), 1.6)
      x += (sx / mag) * curve * 3.2 * this.padSensitivity * dt
      y += (sy / mag) * curve * 2.4 * this.padSensitivity * dt
    }
    if (this.invertY) y = -y
    return { x, y }
  }

  wheel(): number {
    return this.wheelDelta
  }

  usingGamepad(): boolean {
    return this.device !== "keyboard"
  }

  // ---- pointer lock -----------------------------------------------------------

  requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => undefined)
    } catch {
      /* ignore */
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas
  }

  setTextInput(active: boolean): void {
    this.textInputActive = active
    if (active) this.keys.clear()
  }

  // ---- rebinding -------------------------------------------------------------

  /** Waits for the next key / mouse button / pad button and stores it for the action. */
  captureBinding(action: Action, done: (ok: boolean) => void): void {
    this.capture = (kind, code) => {
      const b = this.bindings[action]
      if (kind === "key") {
        if (code === "Escape") return done(false)
        b.keys = [code as string]
      } else if (kind === "mouse") b.mouse = [code as number]
      else b.pad = [code as number]
      saveBindings(this.bindings)
      done(true)
    }
  }

  cancelCapture(): void {
    this.capture = null
  }

  get capturing(): boolean {
    return this.capture !== null
  }

  // ---- rumble ----------------------------------------------------------------

  rumble(strong: number, weak: number, ms: number): void {
    if (!this.vibration || !navigator.getGamepads) return
    const pads = navigator.getGamepads()
    for (const p of pads) {
      if (!p) continue
      const act = (p as Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> } }).vibrationActuator
      if (act && typeof act.playEffect === "function") {
        try {
          act.playEffect("dual-rumble", { startDelay: 0, duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }).catch(() => undefined)
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export function detectDevice(id: string): DeviceKind {
  const s = id.toLowerCase()
  if (s.includes("xbox") || s.includes("045e") || s.includes("microsoft")) return "xbox"
  if (s.includes("054c") || s.includes("playstation") || s.includes("dualshock") || s.includes("dualsense") || s.includes("sony") || s.includes("wireless controller")) return "playstation"
  return "xbox"
}
