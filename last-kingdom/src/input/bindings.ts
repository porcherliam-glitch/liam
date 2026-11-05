// Action names, default bindings for keyboard/mouse and gamepads, and the rebinding store.

import { loadJson, saveJson } from "../core/storage"

export type Action =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "dodge"
  | "interact"
  | "inventory"
  | "attack"
  | "heavy"
  | "block"
  | "switchWeapon"
  | "pause"
  | "map"
  | "quick1"
  | "quick2"
  | "quick3"
  | "quick4"
  | "sprint"
  | "lockOn"
  | "menuUp"
  | "menuDown"
  | "menuLeft"
  | "menuRight"
  | "confirm"
  | "back"
  | "tabPrev"
  | "tabNext"
  | "menuAlt"
  | "menuAlt2"
  | "ability"

export interface Binding {
  keys: string[]
  mouse: number[]
  pad: number[]
}

export type BindingMap = Record<Action, Binding>

/** Standard gamepad button indices (W3C "standard" mapping). */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const

export const DEFAULT_BINDINGS: BindingMap = {
  moveForward: { keys: ["KeyW", "ArrowUp"], mouse: [], pad: [] },
  moveBack: { keys: ["KeyS", "ArrowDown"], mouse: [], pad: [] },
  moveLeft: { keys: ["KeyA", "ArrowLeft"], mouse: [], pad: [] },
  moveRight: { keys: ["KeyD", "ArrowRight"], mouse: [], pad: [] },
  jump: { keys: ["Space"], mouse: [], pad: [PAD.A] },
  dodge: { keys: ["KeyC", "AltLeft"], mouse: [], pad: [PAD.B] },
  interact: { keys: ["KeyE"], mouse: [], pad: [PAD.X] },
  inventory: { keys: ["Tab", "KeyI"], mouse: [], pad: [PAD.Y] },
  attack: { keys: [], mouse: [0], pad: [PAD.RT] },
  heavy: { keys: ["KeyQ"], mouse: [], pad: [PAD.RB] },
  block: { keys: [], mouse: [2], pad: [PAD.LT] },
  switchWeapon: { keys: ["KeyR"], mouse: [], pad: [PAD.LB] },
  pause: { keys: ["Escape"], mouse: [], pad: [PAD.START] },
  map: { keys: ["KeyM"], mouse: [], pad: [PAD.BACK] },
  quick1: { keys: ["Digit1"], mouse: [], pad: [PAD.UP] },
  quick2: { keys: ["Digit2"], mouse: [], pad: [PAD.RIGHT] },
  quick3: { keys: ["Digit3"], mouse: [], pad: [PAD.DOWN] },
  quick4: { keys: ["Digit4"], mouse: [], pad: [PAD.LEFT] },
  sprint: { keys: ["ShiftLeft", "ShiftRight"], mouse: [], pad: [PAD.L3] },
  lockOn: { keys: ["KeyT"], mouse: [1], pad: [PAD.R3] },
  menuUp: { keys: ["ArrowUp", "KeyW"], mouse: [], pad: [PAD.UP] },
  menuDown: { keys: ["ArrowDown", "KeyS"], mouse: [], pad: [PAD.DOWN] },
  menuLeft: { keys: ["ArrowLeft", "KeyA"], mouse: [], pad: [PAD.LEFT] },
  menuRight: { keys: ["ArrowRight", "KeyD"], mouse: [], pad: [PAD.RIGHT] },
  confirm: { keys: ["Enter", "Space"], mouse: [], pad: [PAD.A] },
  back: { keys: ["Escape", "Backspace"], mouse: [], pad: [PAD.B] },
  tabPrev: { keys: ["KeyQ"], mouse: [], pad: [PAD.LB] },
  tabNext: { keys: ["KeyE"], mouse: [], pad: [PAD.RB] },
  menuAlt: { keys: ["KeyX"], mouse: [], pad: [PAD.X] },
  menuAlt2: { keys: ["KeyF"], mouse: [], pad: [PAD.Y] },
  ability: { keys: ["KeyG"], mouse: [], pad: [] },
}

/** Actions the player may rebind (menu navigation stays fixed so a bad binding can always be undone). */
export const REBINDABLE: { action: Action; name: string }[] = [
  { action: "moveForward", name: "Vorwärts" },
  { action: "moveBack", name: "Rückwärts" },
  { action: "moveLeft", name: "Links" },
  { action: "moveRight", name: "Rechts" },
  { action: "jump", name: "Springen" },
  { action: "dodge", name: "Ausweichen" },
  { action: "sprint", name: "Sprinten" },
  { action: "interact", name: "Interagieren" },
  { action: "attack", name: "Angriff" },
  { action: "heavy", name: "Schwerer Angriff" },
  { action: "block", name: "Blocken" },
  { action: "switchWeapon", name: "Waffe wechseln" },
  { action: "lockOn", name: "Ziel anvisieren" },
  { action: "inventory", name: "Inventar" },
  { action: "map", name: "Karte" },
  { action: "quick1", name: "Schnellzugriff 1" },
  { action: "quick2", name: "Schnellzugriff 2" },
  { action: "quick3", name: "Schnellzugriff 3" },
  { action: "quick4", name: "Schnellzugriff 4" },
  { action: "ability", name: "Fähigkeit (Controller: Y halten)" },
  { action: "pause", name: "Pause" },
]

export function loadBindings(): BindingMap {
  const stored = loadJson<Partial<BindingMap>>("bindings", {})
  const out = {} as BindingMap
  for (const key of Object.keys(DEFAULT_BINDINGS) as Action[]) {
    const d = DEFAULT_BINDINGS[key]
    const s = stored[key]
    out[key] = s ? { keys: [...(s.keys ?? d.keys)], mouse: [...(s.mouse ?? d.mouse)], pad: [...(s.pad ?? d.pad)] } : { keys: [...d.keys], mouse: [...d.mouse], pad: [...d.pad] }
  }
  return out
}

export function saveBindings(map: BindingMap): void {
  saveJson("bindings", map)
}

export function resetBindings(): BindingMap {
  const out = {} as BindingMap
  for (const key of Object.keys(DEFAULT_BINDINGS) as Action[]) {
    const d = DEFAULT_BINDINGS[key]
    out[key] = { keys: [...d.keys], mouse: [...d.mouse], pad: [...d.pad] }
  }
  saveBindings(out)
  return out
}
