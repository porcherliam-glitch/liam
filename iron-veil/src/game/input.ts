/**
 * input.ts — keyboard + mouse for the raid. Direction conventions are fixed: W forward, S back, A left, D right,
 * mouse right turns right, mouse up looks up (invertible). Discrete presses are queued as "actions" (consumed once per
 * fixed step), held keys are tracked separately. dispose() detaches every listener.
 */
import { INPUT_CONFIG } from "./config"

const KEYMAP: Record<string, ["moveX" | "moveZ", 1 | -1]> = {
  KeyW: ["moveZ", 1], ArrowUp: ["moveZ", 1], KeyS: ["moveZ", -1], ArrowDown: ["moveZ", -1],
  KeyA: ["moveX", -1], ArrowLeft: ["moveX", -1], KeyD: ["moveX", 1], ArrowRight: ["moveX", 1],
}
/** Keys whose browser default (scrolling, focus change, quick find) must not happen during play. */
const PREVENT = new Set(["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyF", "ControlLeft", "Slash", "Quote"])

export class Input {
  moveX = 0; moveZ = 0; yawDelta = 0; pitchDelta = 0
  sensitivity = 0.75; invertY = false; fireHeld = false; adsHeld = false; sprintHeld = false
  /** When false (menus), keys are not captured so text inputs and shortcuts keep working. */
  capture = false
  readonly actions = new Set<string>()
  private held = new Set<string>()
  private unsubscribe: Array<() => void> = []

  constructor(private target: HTMLElement) {
    const on = <T extends Event>(el: Window | Document | HTMLElement, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions) => {
      const handler = fn as EventListener; el.addEventListener(type, handler, opts); this.unsubscribe.push(() => el.removeEventListener(type, handler, opts))
    }
    on<KeyboardEvent>(window, "keydown", (e) => {
      if (!this.capture) return
      if (PREVENT.has(e.code) || e.code.startsWith("Digit")) e.preventDefault()
      if (e.repeat) return
      this.held.add(e.code)
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.sprintHeld = true
      this.actions.add(e.code); this.recomputeAxes()
    })
    on<KeyboardEvent>(window, "keyup", (e) => {
      this.held.delete(e.code); if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.sprintHeld = false; this.recomputeAxes()
    })
    on<MouseEvent>(target, "mousedown", (e) => {
      if (e.button === 0) { this.fireHeld = true; this.actions.add("Fire") }
      if (e.button === 2) this.adsHeld = true
      if (e.button === 1) { e.preventDefault(); this.actions.add("Middle") }
    })
    on<MouseEvent>(window, "mouseup", (e) => { if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.adsHeld = false })
    on<WheelEvent>(target, "wheel", (e) => { if (!this.capture) return; e.preventDefault(); this.actions.add(e.deltaY > 0 ? "WheelDown" : "WheelUp") }, { passive: false })
    on<MouseEvent>(target, "contextmenu", (e) => e.preventDefault())
    on(window, "blur", () => this.resetAll())
    on(document, "visibilitychange", () => { if (document.hidden) this.resetAll() })
    on<MouseEvent>(window, "mousemove", (e) => {
      if (document.pointerLockElement !== this.target) return
      // browsers occasionally report a huge spike right after locking; ignore it
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
      const scale = this.sensitivity / 0.75
      this.yawDelta -= e.movementX * INPUT_CONFIG.MOUSE_SENS_X * scale
      this.pitchDelta += -e.movementY * INPUT_CONFIG.MOUSE_SENS_Y * scale * (this.invertY ? -1 : 1)
    })
  }

  dispose(): void { for (const off of this.unsubscribe) off(); this.unsubscribe = []; this.actions.clear(); this.resetAll() }
  resetAll(): void { this.held.clear(); this.moveX = 0; this.moveZ = 0; this.yawDelta = 0; this.pitchDelta = 0; this.fireHeld = false; this.adsHeld = false; this.sprintHeld = false }
  private recomputeAxes(): void { let x = 0, z = 0; for (const code of this.held) { const m = KEYMAP[code]; if (m) { if (m[0] === "moveX") x += m[1]; else z += m[1] } } this.moveX = Math.max(-1, Math.min(1, x)); this.moveZ = Math.max(-1, Math.min(1, z)) }
  consumeLook(): { yaw: number; pitch: number } { const r = { yaw: this.yawDelta, pitch: this.pitchDelta }; this.yawDelta = 0; this.pitchDelta = 0; return r }
  consumeAction(code: string): boolean { const has = this.actions.has(code); if (has) this.actions.delete(code); return has }
  isHeld(code: string): boolean { return this.held.has(code) }
  clearActions(): void { this.actions.clear() }
}
