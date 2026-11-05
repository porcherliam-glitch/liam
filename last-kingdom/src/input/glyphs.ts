// Button glyphs: HTML snippets for the active device (keyboard, Xbox or PlayStation controller).

import type { Action, BindingMap } from "./bindings"

export type DeviceKind = "keyboard" | "xbox" | "playstation"

const KEY_NAMES: Record<string, string> = {
  Space: "Leertaste",
  ShiftLeft: "Shift",
  ShiftRight: "Shift ►",
  ControlLeft: "Strg",
  ControlRight: "Strg ►",
  AltLeft: "Alt",
  AltRight: "Alt Gr",
  Escape: "Esc",
  Enter: "Enter",
  Backspace: "←",
  Tab: "Tab",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  CapsLock: "Caps",
}

export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  if (code.startsWith("Numpad")) return "Num " + code.slice(6)
  return code
}

export function mouseName(button: number): string {
  return ["LMT", "MMT", "RMT", "MT4", "MT5"][button] ?? `MT${button}`
}

const XBOX: Record<number, { label: string; cls: string }> = {
  0: { label: "A", cls: "xa" },
  1: { label: "B", cls: "xb" },
  2: { label: "X", cls: "xx" },
  3: { label: "Y", cls: "xy" },
  4: { label: "LB", cls: "bumper" },
  5: { label: "RB", cls: "bumper" },
  6: { label: "LT", cls: "bumper" },
  7: { label: "RT", cls: "bumper" },
  8: { label: "⧉", cls: "sys" },
  9: { label: "☰", cls: "sys" },
  10: { label: "L3", cls: "stick" },
  11: { label: "R3", cls: "stick" },
  12: { label: "▲", cls: "dpad" },
  13: { label: "▼", cls: "dpad" },
  14: { label: "◀", cls: "dpad" },
  15: { label: "▶", cls: "dpad" },
}

const PS: Record<number, { label: string; cls: string }> = {
  0: { label: "✕", cls: "pcross" },
  1: { label: "○", cls: "pcircle" },
  2: { label: "□", cls: "psquare" },
  3: { label: "△", cls: "ptriangle" },
  4: { label: "L1", cls: "bumper" },
  5: { label: "R1", cls: "bumper" },
  6: { label: "L2", cls: "bumper" },
  7: { label: "R2", cls: "bumper" },
  8: { label: "▭", cls: "sys" },
  9: { label: "≡", cls: "sys" },
  10: { label: "L3", cls: "stick" },
  11: { label: "R3", cls: "stick" },
  12: { label: "▲", cls: "dpad" },
  13: { label: "▼", cls: "dpad" },
  14: { label: "◀", cls: "dpad" },
  15: { label: "▶", cls: "dpad" },
}

export function padButtonName(index: number, device: DeviceKind): string {
  const table = device === "playstation" ? PS : XBOX
  return table[index]?.label ?? `#${index}`
}

/** Returns an HTML glyph for the first binding of an action on the active device. */
export function glyph(action: Action, bindings: BindingMap, device: DeviceKind): string {
  const b = bindings[action]
  if (device === "keyboard") {
    if (b.keys.length) return `<span class="glyph key">${escape(keyName(b.keys[0]))}</span>`
    if (b.mouse.length) return `<span class="glyph key mouse">${mouseName(b.mouse[0])}</span>`
    return `<span class="glyph key">–</span>`
  }
  const table = device === "playstation" ? PS : XBOX
  if (!b.pad.length) return `<span class="glyph pad">–</span>`
  const g = table[b.pad[0]] ?? { label: `#${b.pad[0]}`, cls: "sys" }
  return `<span class="glyph pad ${g.cls}">${g.label}</span>`
}

/** Label for a whole binding list, used by the controls screen. */
export function bindingText(action: Action, bindings: BindingMap, device: DeviceKind): string {
  const b = bindings[action]
  if (device === "keyboard") {
    const parts = [...b.keys.map(keyName), ...b.mouse.map(mouseName)]
    return parts.length ? parts.join(" / ") : "–"
  }
  return b.pad.length ? b.pad.map((i) => padButtonName(i, device)).join(" / ") : "–"
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
}
