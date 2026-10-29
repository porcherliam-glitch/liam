import { INPUT_CONFIG } from "./config"

const KEYMAP: Record<string, ["moveX" | "moveZ", 1 | -1]> = {
  KeyW: ["moveZ", 1], ArrowUp: ["moveZ", 1], KeyS: ["moveZ", -1], ArrowDown: ["moveZ", -1],
  KeyA: ["moveX", -1], ArrowLeft: ["moveX", -1], KeyD: ["moveX", 1], ArrowRight: ["moveX", 1],
}

export class Input {
  moveX = 0; moveZ = 0; yawDelta = 0; pitchDelta = 0
  sensitivity = 0.75; invertY = false; fireHeld = false; adsHeld = false; sprintHeld = false
  readonly actions = new Set<string>()
  private held = new Set<string>()
  private unsubscribe: Array<() => void> = []

  constructor(private target: HTMLElement) {
    const on = <T extends Event>(el: Window | Document | HTMLElement, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions) => {
      const handler = fn as EventListener; el.addEventListener(type, handler, opts); this.unsubscribe.push(() => el.removeEventListener(type, handler, opts))
    }
    on<KeyboardEvent>(window, "keydown", (e) => {
      if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault()
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
    })
    on<MouseEvent>(window, "mouseup", (e) => { if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.adsHeld = false })
    on<MouseEvent>(target, "contextmenu", (e) => e.preventDefault())
    on(window, "blur", () => this.resetAll())
    on(document, "visibilitychange", () => { if (document.hidden) this.resetAll() })
    on<MouseEvent>(window, "mousemove", (e) => {
      if (document.pointerLockElement !== this.target) return
      const scale = this.sensitivity / 0.75
      this.yawDelta -= e.movementX * INPUT_CONFIG.MOUSE_SENS_X * scale
      this.pitchDelta += -e.movementY * INPUT_CONFIG.MOUSE_SENS_Y * scale * (this.invertY ? -1 : 1)
    })
  }

  dispose(): void { for (const off of this.unsubscribe) off(); this.unsubscribe = []; this.actions.clear(); this.resetAll() }
  private resetAll(): void { this.held.clear(); this.moveX = 0; this.moveZ = 0; this.yawDelta = 0; this.pitchDelta = 0; this.fireHeld = false; this.adsHeld = false; this.sprintHeld = false }
  private recomputeAxes(): void { let x = 0, z = 0; for (const code of this.held) { const m = KEYMAP[code]; if (m) { if (m[0] === "moveX") x += m[1]; else z += m[1] } } this.moveX = Math.max(-1, Math.min(1, x)); this.moveZ = Math.max(-1, Math.min(1, z)) }
  consumeLook(): { yaw: number; pitch: number } { const r = { yaw: this.yawDelta, pitch: this.pitchDelta }; this.yawDelta = 0; this.pitchDelta = 0; return r }
  consumeAction(code: string): boolean { const has = this.actions.has(code); if (has) this.actions.delete(code); return has }
  isHeld(code: string): boolean { return this.held.has(code) }
  clearActions(): void { this.actions.clear() }
}
