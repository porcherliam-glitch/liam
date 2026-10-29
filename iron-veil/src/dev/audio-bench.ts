/**
 * audio-bench.ts — sound test bench (dev-audio.html, not part of the shipped game). Buttons for every SfxId, position
 * presets relative to the listener, ambience/intensity/heartbeat/volume controls, rapid-fire stress buttons, live voice
 * stats and an offline analysis table. Exposes window.__audioBench for scripts/verify-audio.mjs:
 *
 *   __audioBench.play(id, preset?, opts?)        preset: none | left | right | front | behind | far | veryfar
 *   __audioBench.pos(preset, yaw?)               world position of a preset for a listener at the origin
 *   __audioBench.analyze(events, options)        renderOffline(...) + metrics (peak, rms, L/R, onset, t40, brightness, tail …)
 *   __audioBench.lengthFor(id)                   sensible offline render length in seconds
 *   __audioBench.audio / ids / presets / ready
 */
import { AudioSystem, SFX_IDS, renderOffline, type OfflineEvent, type OfflineOptions, type PlayOptions, type SfxId } from "../game/audio"
import type { ThemeId, Vec3 } from "../game/types"

type Preset = "none" | "left" | "right" | "front" | "behind" | "far" | "veryfar"
/** [metres to the listener's right, metres forward]. */
const PRESETS: Record<Preset, [number, number] | null> = { none: null, left: [-8, 0], right: [8, 0], front: [0, 12], behind: [0, -8], far: [0, 80], veryfar: [130, 130] }
const PRESET_LABEL: Record<Preset, string> = { none: "Ohne Position (2D)", left: "Links 8 m", right: "Rechts 8 m", front: "Vorne 12 m", behind: "Hinten 8 m", far: "Fern 80 m", veryfar: "Sehr fern 184 m" }
const LONG: Partial<Record<SfxId, number>> = { helicopter: 7, explosion: 5.5, shot_dr7: 3.5, enemy_sniper: 3.5, radio: 3, extract_call: 2.5, win: 3, lose: 3.5, heal: 2.2, shot_kv12: 3.2 }

const audio = new AudioSystem()
audio.setListener({ x: 0, y: 1.6, z: 0 }, 0)
let preset: Preset = "none", yaw = 0

/** Listener at the origin: right = (cos yaw, 0, -sin yaw), forward = (-sin yaw, 0, -cos yaw). */
function pos(p: Preset, y = yaw): Vec3 | undefined {
  const r = PRESETS[p]; if (!r) return undefined
  const [right, fwd] = r
  return { x: right * Math.cos(y) - fwd * Math.sin(y), y: 1.6, z: -right * Math.sin(y) - fwd * Math.cos(y) }
}
function play(id: SfxId, p: Preset = preset, opts: PlayOptions = {}): void { audio.play(id, { ...opts, position: opts.position ?? pos(p) }) }

export interface Metrics { peak: number; rms: number; rmsL: number; rmsR: number; activeRms: number; rms100: number; onset: number; t40: number; bright: number; low: number; tail: number; clipped: number; seconds: number }
async function analyze(events: OfflineEvent[], o: OfflineOptions = {}): Promise<Metrics | null> {
  const buf = await renderOffline(events, o); if (!buf) return null
  const L = buf.getChannelData(0), R = buf.getChannelData(1), sr = buf.sampleRate, n = buf.length
  let peak = 0, sl = 0, srr = 0, sm = 0, sd = 0, slow = 0, prev = 0, y = 0, clipped = 0
  const a = 1 - Math.exp(-2 * Math.PI * 150 / sr)
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i], m = (l + r) / 2, al = Math.abs(l), ar = Math.abs(r)
    peak = Math.max(peak, al, ar); if (al >= 1 || ar >= 1) clipped++
    sl += l * l; srr += r * r; sm += m * m; const d = m - prev; prev = m; sd += d * d; y += a * (m - y); slow += y * y
  }
  let onset = -1, end = -1
  for (let i = 0; i < n; i++) if (Math.max(Math.abs(L[i]), Math.abs(R[i])) > peak * 0.05) { onset = i; break }
  for (let i = n - 1; i >= 0; i--) if (Math.max(Math.abs(L[i]), Math.abs(R[i])) > peak * 0.01) { end = i; break }
  let act = 0, late = 0
  const lateFrom = onset + Math.floor(0.3 * sr)
  if (onset >= 0) for (let i = onset; i <= end; i++) { const m = (L[i] + R[i]) / 2; act += m * m; if (i >= lateFrom) late += m * m }
  // short-term loudness: loudest 100 ms window (mono)
  const win = Math.max(1, Math.floor(0.1 * sr)); let acc = 0, best = 0
  for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) / 2; acc += m * m; if (i >= win) { const o2 = (L[i - win] + R[i - win]) / 2; acc -= o2 * o2 } best = Math.max(best, acc) }
  return {
    peak, rms: Math.sqrt(sm / n), rmsL: Math.sqrt(sl / n), rmsR: Math.sqrt(srr / n), activeRms: onset >= 0 ? Math.sqrt(act / Math.max(1, end - onset + 1)) : 0, rms100: Math.sqrt(best / win),
    onset: onset / sr, t40: end / sr, bright: sm > 0 ? Math.sqrt(sd / sm) : 0, low: sm > 0 ? Math.sqrt(slow / sm) : 0, tail: act > 0 ? late / act : 0, clipped, seconds: n / sr,
  }
}
const lengthFor = (id: SfxId): number => LONG[id] ?? 2.5

// ---------------------------------------------------------------- page
const css = `
  :root { color-scheme: dark; --bg: #0b0e12; --panel: #141a21; --line: #26303b; --text: #d7e0e8; --muted: #8796a5; --accent: #8df0c1; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: .06em; }
  p.note { color: var(--muted); margin: 0 0 12px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  button { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 6px 10px; font: inherit; cursor: pointer; }
  button:hover { border-color: var(--accent); } button.primary { background: var(--accent); color: #062018; border-color: var(--accent); font-weight: 600; }
  label { display: inline-flex; gap: 6px; align-items: center; margin-right: 12px; }
  input[type=range] { width: 160px; }
  #stats { font: 12px ui-monospace, monospace; color: var(--muted); padding: 8px; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; margin-top: 8px; }
  table { border-collapse: collapse; font: 12px ui-monospace, monospace; margin-top: 8px; } td, th { border-bottom: 1px solid var(--line); padding: 3px 8px; text-align: right; } th:first-child, td:first-child { text-align: left; }
`
document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`)
const main = document.createElement("main"); document.body.appendChild(main)
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ""): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); if (text) el.textContent = text; return el
}
const section = (title: string): HTMLDivElement => { main.appendChild(h("h2", {}, title)); const r = h("div", { class: "row" }); main.appendChild(r); return r }
const button = (parent: HTMLElement, text: string, fn: () => void, attrs: Record<string, string> = {}): HTMLButtonElement => {
  const b = h("button", attrs, text); b.addEventListener("click", fn); parent.appendChild(b); return b
}

main.appendChild(h("h1", {}, "Ton-Prüfstand – Operation Iron Veil"))
main.appendChild(h("p", { class: "note" }, "Alle Klänge werden live synthetisiert (Web Audio). Zuerst „Audio aktivieren“ klicken – Browser erlauben Ton erst nach einer Eingabe."))
const top = h("div", { class: "row" }); main.appendChild(top)
button(top, "Audio aktivieren", () => play("ui_click", "none"), { id: "unlock", class: "primary" })
const mute = h("input", { type: "checkbox", id: "mute" }); mute.addEventListener("change", () => audio.setMuted(mute.checked))
const muteLabel = h("label"); muteLabel.append(mute, "Stumm"); top.appendChild(muteLabel)
const slider = (parent: HTMLElement, text: string, id: string, value: number, fn: (v: number) => void, min = 0, max = 1, step = 0.01): void => {
  const l = h("label", {}, text), s = h("input", { type: "range", id, min: String(min), max: String(max), step: String(step), value: String(value) })
  const out = h("span", {}, String(value)); s.addEventListener("input", () => { out.textContent = s.value; fn(Number(s.value)) }); l.append(s, out); parent.appendChild(l)
}
slider(top, "Lautstärke", "volume", 0.55, v => audio.setVolume(v))

const pr = section("Position relativ zum Hörer")
for (const p of Object.keys(PRESETS) as Preset[]) {
  const l = h("label"), r = h("input", { type: "radio", name: "preset", value: p, "data-preset": p }); if (p === "none") r.checked = true
  r.addEventListener("change", () => { preset = p }); l.append(r, PRESET_LABEL[p]); pr.appendChild(l)
}
slider(pr, "Blickrichtung (Grad, + = links)", "yaw", 0, v => { yaw = v * Math.PI / 180; audio.setListener({ x: 0, y: 1.6, z: 0 }, yaw) }, -180, 180, 5)

const GROUPS: [string, (id: SfxId) => boolean][] = [
  ["Waffen Spieler", id => id.startsWith("shot_")], ["Waffen Gegner", id => id.startsWith("enemy_")],
  ["Waffenhandling", id => ["dry_fire", "reload_out", "reload_in", "reload_bolt", "pump", "weapon_switch", "ads_in", "flashlight"].includes(id)],
  ["Treffer und Einschläge", id => id.startsWith("hit_") || id.startsWith("impact_") || ["kill", "whiz", "hurt", "armor_absorb"].includes(id)],
  ["Schritte", id => id.startsWith("step_") || id === "land"], ["Granaten", id => id.startsWith("grenade_") || id === "explosion"],
  ["Interaktion", id => ["heal", "pickup", "crate_open", "body_search"].includes(id)],
  ["Einsatz", id => ["extract_call", "extract_tick", "helicopter", "alert", "radio"].includes(id)],
  ["Oberfläche", id => id.startsWith("ui_") || ["build", "win", "lose", "level_up"].includes(id)],
]
for (const [title, test] of GROUPS) { const r = section(title); for (const id of SFX_IDS.filter(test)) button(r, id, () => play(id), { "data-sfx": id }) }

const amb = section("Ambiente")
const AMB_LABEL: [ThemeId | "menu" | null, string][] = [["menu", "Hauptmenü"], ["dusk", "Dämmerung (Industrie)"], ["harbor", "Hafen (Blaue Stunde)"], ["night", "Nacht (Sperranlage)"], [null, "Aus"]]
for (const [t, label] of AMB_LABEL) button(amb, label, () => audio.setAmbience(t), { "data-ambience": t ?? "off" })
const tension = section("Spannung")
slider(tension, "Kampfintensität", "intensity", 0, v => audio.setIntensity(v))
slider(tension, "Herzschlag", "heartbeat", 0, v => audio.setHeartbeat(v))

const stress = section("Belastung")
const burst = (id: SfxId, perSecond: number, seconds: number): void => {
  let n = 0; const total = Math.round(perSecond * seconds)
  const timer = window.setInterval(() => { play(id); if (++n >= total) clearInterval(timer) }, 1000 / perSecond)
}
button(stress, "Dauerfeuer VX-9 (15/s, 3 s)", () => burst("shot_vx9", 15, 3))
button(stress, "Salve MK-4 (10/s, 3 s)", () => burst("shot_mk4", 10, 3))
button(stress, "Gegner-Feuergefecht", () => { for (let i = 0; i < 24; i++) setTimeout(() => audio.play(i % 3 ? "enemy_rifle" : "enemy_smg", { position: { x: 30 * Math.cos(i), y: 1.5, z: -30 - 20 * Math.sin(i) } }), i * 90) })
button(stress, "Alle Töne nacheinander", () => SFX_IDS.forEach((id, i) => setTimeout(() => play(id), i * 450)))
const stats = h("div", { id: "stats" }); main.appendChild(stats)
setInterval(() => { const s = audio.stats; stats.textContent = `Kontext: ${s.state} · Stimmen: ${s.voices} (Spitze ${s.peakVoices}) · gestohlen: ${s.stolen} · verworfen: ${s.dropped} · Timer: ${s.timers} · Ambiente: ${s.ambience ?? "aus"} (${s.beds})` }, 250)

const an = section("Offline-Analyse (gerendert über die komplette Mischkette)")
const table = h("table"); main.appendChild(table)
button(an, "Alle Töne analysieren", () => { void (async () => {
  table.innerHTML = "<tr><th>Ton</th><th>Spitze dBFS</th><th>Lautheit 100 ms dB</th><th>Dauer bis -40 dB</th><th>Helligkeit</th><th>Tiefen</th></tr>"
  const db = (x: number): string => x > 0 ? (20 * Math.log10(x)).toFixed(1) : "-∞"
  for (const id of SFX_IDS) {
    const m = await analyze([{ id, opts: { position: pos(preset) } }], { seconds: lengthFor(id), listener: { position: { x: 0, y: 1.6, z: 0 }, yaw } })
    const row = h("tr"); row.innerHTML = m ? `<td>${id}</td><td>${db(m.peak)}</td><td>${db(m.rms100)}</td><td>${m.t40.toFixed(2)} s</td><td>${m.bright.toFixed(3)}</td><td>${m.low.toFixed(2)}</td>` : `<td>${id}</td><td colspan=5>nicht verfügbar</td>`
    table.appendChild(row)
  }
})() })

const bench = { audio, ids: SFX_IDS, presets: Object.keys(PRESETS) as Preset[], ready: true, play, pos, analyze, lengthFor }
;(window as unknown as { __audioBench: typeof bench }).__audioBench = bench
