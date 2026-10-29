/**
 * audio.ts — fully synthesised sound (Web Audio, no audio files, no network).
 * CONTRACT (used by raid.ts, ui.ts, boot.ts):
 *  - play(id, opts): one-shot. opts.position makes it positional relative to the listener (setListener): distance
 *    attenuation, stereo pan, distance low-pass, rear muffling, a growing reverb share and (gunshots/explosions beyond
 *    40 m) a speed-of-sound delay. Without position it is a 2D UI/first-person sound.
 *  - setListener(position, yaw): call once per rendered frame during a raid (yaw 0 = facing -Z, + turns left).
 *  - setAmbience(theme | "menu" | "base" | "dawn" | "day" | null): looping background bed with a 1.5 s crossfade
 *    (null fades out). Beds: dusk, harbor, night, menu, base, dawn, day; unknown ids fall back to dusk.
 *  - setIntensity(0..1): combat tension layer; setHeartbeat(0..1): low-health heartbeat (0 = silent).
 *  - setMuted / setVolume / dispose. Never throws and never logs; without Web Audio everything is a silent no-op.
 *  - The AudioContext is created lazily on the first user gesture (pointerdown/keydown/touchend) and resumed whenever
 *    the browser suspended it — browsers block autoplay.
 *  - opts.suppressed (any shot_*): muffled "thwip" with a prominent action clack, ~1/3 loudness, short tail.
 *  - Hordes: infected vocals share a voice group (max 10), gore another (max 8); per-id caps keep the loudest
 *    (nearest) voices and drop the quietest. opts.rate gives each infected its own pitch/size; for melee_swing
 *    rate < 1 = heavy weapon, > 1 = light. stepSound(surface) maps unknown surfaces to step_dirt.
 *  - Dev/test additions: SFX_IDS (every SfxId), AudioSystem.stats (voice/timer counters, voices per id) and renderOffline(events,
 *    options), which renders sounds through the identical mix chain into an OfflineAudioContext (src/dev/audio-bench.ts).
 * Mix: voice → [distance low-pass → stereo pan] → bus (sfx | ui | ambience | music) → master gain → compressor →
 *      safety soft clip → destination. Voices also feed one shared outdoor reverb (procedural impulse response).
 *      Budget: 40 voices, per-id and group caps, minimum gaps; the quietest/oldest low-priority voice is stolen first.
 */
import type { Surface, ThemeId, Vec3 } from "./types"

export type SfxId =
  | "shot_p9" | "shot_mk4" | "shot_vx9" | "shot_kv12" | "shot_dr7"
  | "enemy_rifle" | "enemy_smg" | "enemy_shotgun" | "enemy_sniper"
  | "dry_fire" | "reload_out" | "reload_in" | "reload_bolt" | "pump" | "weapon_switch" | "ads_in"
  | "hit_body" | "hit_head" | "hit_armor" | "kill" | "impact_concrete" | "impact_metal" | "impact_dirt" | "whiz"
  | "hurt" | "armor_absorb" | "heal" | "pickup" | "crate_open" | "body_search"
  | "step_asphalt" | "step_concrete" | "step_metal" | "step_gravel" | "step_dirt" | "step_wood" | "land"
  | "grenade_pin" | "grenade_bounce" | "explosion"
  | "extract_call" | "extract_tick" | "helicopter" | "alert" | "radio"
  | "ui_click" | "ui_hover" | "ui_buy" | "ui_error" | "build" | "win" | "lose" | "level_up" | "flashlight"
  | "shot_r44" | "shot_k5" | "shot_sr74" | "shot_br10" | "shot_sg8" | "shot_falke" | "shot_lm60"
  | "bolt_cycle" | "revolver_open" | "revolver_close" | "shell_insert" | "lmg_belt"
  | "melee_swing" | "melee_hit_flesh" | "melee_hit_wall"
  | "gore_splat" | "gore_burst" | "bone_crack" | "gib_land" | "blood_drip"
  | "zombie_groan" | "zombie_alert" | "zombie_scream" | "zombie_attack" | "zombie_spit" | "zombie_pain" | "zombie_death"
  | "zombie_crawl" | "boss_roar" | "acid_sizzle"
  | "molotov_break" | "fire_burn"
  | "eat" | "drink" | "bandage" | "syringe" | "zipper" | "item_drop" | "loot_take"
  | "airdrop_plane" | "airdrop_land" | "door" | "base_alarm" | "wave_start" | "build_complete"
  | "step_grass"

/** Ambience beds accepted by setAmbience (zone times of day dawn/day/dusk/night, harbor, base camp, main menu). */
export type AmbienceId = ThemeId | "menu" | "base" | "dawn" | "day"

export interface PlayOptions {
  /** World position for 3D sounds. */
  position?: Vec3
  /** Linear gain multiplier (default 1). */
  volume?: number
  /** Playback-rate / pitch multiplier (default 1). */
  rate?: number
  /** shot_* only: suppressed variant (muffled thwip + action clack, ~1/3 loudness, short tail). */
  suppressed?: boolean
}

/** Footstep id for a surface; unknown surfaces fall back to step_dirt. */
export function stepSound(surface: Surface): SfxId { const id = `step_${surface}`; return (id in DEFS ? id : "step_dirt") as SfxId }

// ------------------------------------------------------------------ shared tables
const MAX_VOICES = 40
const LOOKAHEAD = 0.004
type Bus = "sfx" | "ui" | "amb" | "music"
type Color = "w" | "p" | "b"
type Amb = AmbienceId
type KnownAmb = "dusk" | "harbor" | "night" | "menu" | "base" | "dawn" | "day"
/** Shared voice budgets for sound families that come in crowds. */
const GROUP_CAP: Record<string, number> = { inf: 10, gore: 8 }

const clamp = (x: number, a: number, b: number): number => x < a ? a : x > b ? b : x
/** mulberry32 — seeded so offline renders are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/** tanh drive curves (light, medium, heavy), normalised to ±1. */
const CURVES = [1.6, 3, 6].map(k => { const c = new Float32Array(1024), n = Math.tanh(k); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(k * (i / 511.5 - 1)) / n; return c })
/** Safety clip after the compressor: identity below 0.8, soft knee above, never reaches 1.0. */
const CLIP = (() => { const n = 2049, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / 1024 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.17 * Math.tanh((a - 0.8) / 0.17)) } return c })()

// ------------------------------------------------------------------ noise / impulse bank (built once per sample rate)
interface Bank { w: AudioBuffer; p: AudioBuffer; b: AudioBuffer; ir: AudioBuffer; crickets: AudioBuffer }
const banks = new Map<number, Bank>()

function getBank(ctx: BaseAudioContext): Bank {
  const cached = banks.get(ctx.sampleRate); if (cached) return cached
  const r = rng(0x1ee7), sr = ctx.sampleRate, n = Math.floor(sr * 3)
  const w = ctx.createBuffer(1, n, sr), p = ctx.createBuffer(1, n, sr), b = ctx.createBuffer(1, n, sr)
  const wd = w.getChannelData(0), pd = p.getChannelData(0), bd = b.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1; wd[i] = x
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898
    pd[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926
    br = (br + 0.02 * x) / 1.02; bd[i] = br
  }
  seamless(pd); seamless(bd)
  const bank = { w, p, b, ir: impulse(ctx, r), crickets: crickets(ctx, r) }
  banks.set(sr, bank); return bank
}

/** Removes DC and the end-to-start step (loops never click) and normalises to peak 1. */
function seamless(d: Float32Array): void {
  const n = d.length, step = d[n - 1] - d[0]; let mean = 0, pk = 0
  for (let i = 0; i < n; i++) { d[i] -= step * i / (n - 1); mean += d[i] }
  mean /= n
  for (let i = 0; i < n; i++) { d[i] -= mean; pk = Math.max(pk, Math.abs(d[i])) }
  if (pk > 0) for (let i = 0; i < n; i++) d[i] /= pk
}

/** Outdoor impulse response: sparse slap echoes off facades plus a darkening diffuse tail (RT60 ≈ 1.7 s). */
function impulse(ctx: BaseAudioContext, r: () => number): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * 1.8), buf = ctx.createBuffer(2, n, sr)
  const taps: [number, number][] = [[0.013, 0.5], [0.029, 0.3], [0.052, 0.36], [0.089, 0.42], [0.137, 0.26], [0.196, 0.3], [0.281, 0.18], [0.39, 0.14], [0.55, 0.08]]
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = 0.07 + 0.6 * Math.exp(-t * 2.4)
      lp += k * (r() * 2 - 1 - lp)
      d[i] = lp / Math.sqrt(k / (2 - k)) * (1 - Math.exp(-t / 0.03)) * Math.exp(-t * 4) * 0.35
    }
    for (const [tt, g] of taps) {
      const s0 = Math.floor((tt * (ch ? 1.035 : 0.97) + (r() - 0.5) * 0.004) * sr), m = Math.floor(sr * 0.006); let y = 0
      for (let i = 0; i < m && s0 + i < n; i++) { y += 0.35 * (r() * 2 - 1 - y); d[s0 + i] += y * g * 2.2 * Math.exp(-i / (sr * 0.0015)) }
    }
  }
  return buf
}

/** 3 s of cricket chirp trains (4.4–4.8 kHz carrier, 3–4 pulses per chirp) for the night bed. */
function crickets(ctx: BaseAudioContext, r: () => number): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * 3), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0)
  let t = 0.05
  while (t < 2.85) {
    const f = 4400 + r() * 400, pulses = 3 + Math.floor(r() * 2), len = Math.floor(0.014 * sr)
    for (let p = 0; p < pulses; p++) {
      const s0 = Math.floor((t + p * 0.032) * sr)
      for (let i = 0; i < len && s0 + i < n; i++) d[s0 + i] += Math.sin(2 * Math.PI * f * i / sr) * Math.sin(Math.PI * i / len) ** 2 * 0.6
    }
    t += 0.42 + r() * 0.2
  }
  return buf
}

// ------------------------------------------------------------------ voice builder
/** Envelope (seconds, scaled by the voice rate): attack a, hold h, exponential decay d to -60 dB; g = peak. rv: false = no reverb. */
interface Env { at?: number; a?: number; h?: number; d: number; g: number; rv?: boolean }
interface NoiseL extends Env { c?: Color; ft?: BiquadFilterType; f?: number; f2?: number; sw?: number; q?: number; drive?: number; pr?: number; am?: number; amd?: number; amw?: OscillatorType }
interface ToneL extends Env { w?: OscillatorType; f: number; f2?: number; gl?: number; ft?: BiquadFilterType; ff?: number; ff2?: number; q?: number; drive?: number; vib?: number; vibd?: number; am?: number; amd?: number; amw?: OscillatorType; det?: number }
interface MetalL extends Env { f: number; p: number[]; w?: OscillatorType }
interface CrackleL extends Omit<NoiseL, "d"> { d?: number; n: number; span: number; gl?: number }

/** Builds the layers of one voice into `dry` (and the reverb send `wet`) starting at time t. */
class V {
  readonly srcs: AudioScheduledSourceNode[] = []
  readonly nodes: AudioNode[] = []
  end = 0
  last: AudioScheduledSourceNode | null = null
  private lastStop = -1
  constructor(readonly e: Engine, readonly t: number, private readonly dry: AudioNode, private readonly wet: AudioNode | null, readonly r: number) {}
  get c(): BaseAudioContext { return this.e.ctx }
  rnd(x = 1): number { return this.e.rnd() * x }
  /** Random factor 1 ± x. */
  j(x: number): number { return 1 + (this.e.rnd() * 2 - 1) * x }
  reg<T extends AudioNode>(n: T): T { this.nodes.push(n); return n }
  out(n: AudioNode, rv = true): void { n.connect(this.dry); if (rv && this.wet) n.connect(this.wet) }
  run(n: AudioScheduledSourceNode, start: number, stop: number): void { n.start(start); this.track(n, stop) }
  runBuf(n: AudioBufferSourceNode, start: number, stop: number, offset: number): void { n.start(start, offset); this.track(n, stop) }
  private track(n: AudioScheduledSourceNode, stop: number): void {
    n.stop(stop); this.nodes.push(n); this.srcs.push(n); this.end = Math.max(this.end, stop)
    if (stop >= this.lastStop) { this.lastStop = stop; this.last = n }
  }
  env(o: Env): [GainNode, number, number] {
    const r = this.r, s = this.t + (o.at ?? 0) / r, a = Math.max(0.0012, (o.a ?? 0.002) / r), h = Math.max(0, (o.h ?? 0) / r), d = Math.max(0.004, o.d / r)
    const g = this.reg(this.c.createGain()), p = g.gain, pk = Math.max(1e-4, o.g), end = s + a + h + d
    p.value = 0; p.setValueAtTime(0, s); p.linearRampToValueAtTime(pk, s + a)
    if (h > 0) p.setValueAtTime(pk, s + a + h)
    p.exponentialRampToValueAtTime(pk * 1e-3, end)
    this.out(g, o.rv !== false)
    return [g, s, end]
  }
  filter(type: BiquadFilterType, f: number, q: number, s: number, f2?: number, until?: number): BiquadFilterNode {
    const n = this.reg(this.c.createBiquadFilter()); n.type = type; n.Q.value = q
    n.frequency.value = this.e.hz(f * this.r); n.frequency.setValueAtTime(this.e.hz(f * this.r), s)
    if (f2 && until && until > s) n.frequency.exponentialRampToValueAtTime(this.e.hz(f2 * this.r), until)
    return n
  }
  shaper(k: number): WaveShaperNode { const w = this.reg(this.c.createWaveShaper()); w.curve = CURVES[clamp(k, 1, 3) - 1]; return w }
  /** LFO onto an AudioParam. */
  mod(p: AudioParam, rate: number, depth: number, s: number, end: number, type: OscillatorType = "sine"): void {
    const o = this.c.createOscillator(), g = this.reg(this.c.createGain()); o.type = type; o.frequency.value = rate; g.gain.value = depth
    o.connect(g); g.connect(p); this.run(o, s, end + 0.01)
  }
  /** Tremolo stage; sawtooth/square shapes are smoothed and saw runs inverted (sharp attack, slow decay = rotor "whop"). */
  trem(rate: number, depth: number, s: number, end: number, type: OscillatorType = "sine"): GainNode {
    const c = this.c, m = this.reg(c.createGain()), o = c.createOscillator(), dg = this.reg(c.createGain())
    o.type = type; o.frequency.value = rate * this.r; m.gain.value = 1 - depth / 2; dg.gain.value = type === "sawtooth" ? -depth / 2 : depth / 2
    if (type === "sine") o.connect(dg)
    else { const sm = this.reg(c.createBiquadFilter()); sm.type = "lowpass"; sm.frequency.value = 70; o.connect(sm); sm.connect(dg) }
    dg.connect(m.gain); this.run(o, s, end + 0.01)
    return m
  }
  /** White noise is level-compensated for the filter bandwidth so g means roughly the same loudness for every filter. */
  private noiseHead(o: Omit<NoiseL, "d">, s: number, until: number): [AudioBufferSourceNode, AudioNode] {
    const c = this.c, col = o.c ?? "w", src = c.createBufferSource()
    src.buffer = this.e.bank[col]; src.loop = true; src.playbackRate.value = (o.pr ?? 1) * this.r
    let head: AudioNode = src, comp = col === "w" ? 0.6 : col === "p" ? 1.3 : 1
    if (o.ft) {
      const f = o.f ?? 1000, q = o.q ?? 0.8, ny = this.c.sampleRate / 2
      const fl = this.filter(o.ft, f, q, s, o.f2, o.f2 ? s + (o.sw ?? (until - s) * 0.8) : undefined); head.connect(fl); head = fl
      if (col === "w") comp *= clamp(Math.sqrt(ny / Math.max(60, o.ft === "bandpass" ? f / q : o.ft === "lowpass" ? f : o.ft === "highpass" ? ny - f : ny)), 1, 14)
    }
    const ng = this.reg(c.createGain()); ng.gain.value = comp; head.connect(ng); head = ng
    if (o.drive) { const w = this.shaper(o.drive); head.connect(w); head = w }
    return [src, head]
  }
  noise(o: NoiseL): void {
    const [g, s, end] = this.env(o), [src, head0] = this.noiseHead(o, s, end)
    let head = head0
    if (o.am) { const m = this.trem(o.am, o.amd ?? 0.5, s, end, o.amw); head.connect(m); head = m }
    head.connect(g); this.runBuf(src, s, end + 0.01, this.rnd(2.5))
  }
  tone(o: ToneL): void {
    const r = this.r, [g, s, end] = this.env(o), osc = this.c.createOscillator()
    osc.type = o.w ?? "sine"; osc.frequency.value = this.e.hz(o.f * r); osc.frequency.setValueAtTime(this.e.hz(o.f * r), s)
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(this.e.hz(o.f2 * r), s + Math.max(0.005, (o.gl ?? o.d) / r))
    if (o.det) osc.detune.value = o.det
    if (o.vib) this.mod(osc.frequency, o.vib, (o.vibd ?? 4) * r, s, end)
    let head: AudioNode = osc
    if (o.ft) { const f = this.filter(o.ft, o.ff ?? 1000, o.q ?? 0.8, s, o.ff2, end); head.connect(f); head = f }
    if (o.drive) { const w = this.shaper(o.drive); head.connect(w); head = w }
    if (o.am) { const m = this.trem(o.am, o.amd ?? 0.5, s, end, o.amw); head.connect(m); head = m }
    head.connect(g); this.run(osc, s, end + 0.01)
  }
  /** Inharmonic partials (struck metal): higher partials are quieter and die faster. */
  metal(o: MetalL): void {
    o.p.forEach((ratio, i) => this.tone({ at: o.at, a: o.a ?? 0.001, h: o.h, rv: o.rv, w: o.w ?? "sine", f: o.f * ratio, g: o.g / (1 + i * 0.5), d: o.d / (1 + i * 0.4) }))
  }
  /** n short noise grains spread over `span` on ONE source via gain automation (gravel, debris, rustle, tearing). */
  crackle(o: CrackleL): void {
    const r = this.r, s0 = this.t + (o.at ?? 0) / r, span = o.span / r, gl = Math.max(0.003, (o.gl ?? 0.012) / r)
    const [src, head] = this.noiseHead(o, s0, s0 + span)
    const g = this.reg(this.c.createGain()), p = g.gain; p.value = 0; p.setValueAtTime(0, s0)
    const step = span / Math.max(1, o.n); let t = s0 + this.rnd(step * 0.5)
    for (let i = 0; i < o.n; i++) {
      const pk = Math.max(1e-4, o.g * (0.35 + this.rnd(0.65))), len = gl * (0.6 + this.rnd(0.8))
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + 0.0012); p.exponentialRampToValueAtTime(pk * 1e-3, t + len)
      t = Math.max(t + len + 0.0005, t + step * (0.3 + this.rnd(1.4)))
    }
    head.connect(g); this.out(g, o.rv !== false); this.runBuf(src, s0, t + 0.01, this.rnd(2.5))
  }
}

// ------------------------------------------------------------------ engine: mix graph + voices for ANY BaseAudioContext
interface Def {
  bus: Bus
  /** Base gain. */
  g: number
  /** 0 ambient/foley … 3 player weapon / critical cue. */
  pri: number
  make: (v: V) => void
  /** Reverb send 0..1. */
  send?: number
  /** Positional: reference distance (m), roll-off factor, inaudible beyond max. */
  ref?: number; roll?: number; max?: number
  /** Minimum seconds between starts of the same id in the same 2 m cell; burst = starts allowed inside the gap. */
  gap?: number; burst?: number
  /** Max concurrent voices of this id (the oldest is stolen). */
  cap?: number
  /** Random pitch spread ± fraction. */
  vary?: number
  /** Loud far-carrying sound (gunshot, explosion, scream): speed-of-sound delay beyond 40 m, more reverb with distance. */
  gun?: boolean
  /** Voice family sharing a budget (GROUP_CAP). */
  group?: string
  /** Player guns: base gain of the suppressed variant (tuned to ≈ 1/3 of the normal shot's loudness). */
  sup?: number
  /** Side effect after start (bus dulling, ducking); dist = -1 for 2D sounds. */
  fx?: (e: Engine, t: number, dist: number) => void
}
interface Voice { key: string; group?: string; pri: number; level: number; t0: number; end: number; dist: number; out: GainNode; srcs: AudioScheduledSourceNode[]; nodes: AudioNode[] }

class Engine {
  readonly bank: Bank
  readonly master: GainNode
  readonly bus: Record<Bus, GainNode>
  readonly rev: GainNode
  readonly voices: Voice[] = []
  readonly listener = { x: 0, y: 0, z: 0, yaw: 0 }
  readonly rnd: () => number
  peak = 0
  stolen = 0
  dropped = 0
  private readonly dulls: BiquadFilterNode[]
  private readonly duckGain: GainNode
  private readonly gaps = new Map<string, { t: number; n: number }>()
  private readonly ny: number

  constructor(readonly ctx: BaseAudioContext, volume: number, seed: number) {
    const c = ctx
    this.ny = c.sampleRate * 0.45; this.rnd = rng(seed); this.bank = getBank(c)
    const gain = (v: number, to: AudioNode): GainNode => { const n = c.createGain(); n.gain.value = v; n.connect(to); return n }
    const lowpass = (to: AudioNode): BiquadFilterNode => { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = this.hz(20000); f.Q.value = 0.5; f.connect(to); return f }
    this.master = c.createGain(); this.master.gain.value = volume
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.2
    const clip = c.createWaveShaper(); clip.curve = CLIP
    this.master.connect(comp); comp.connect(clip); clip.connect(c.destination)
    const sfxDull = lowpass(gain(0.6, this.master))
    this.duckGain = gain(1, gain(0.16, this.master))
    const ambDull = lowpass(this.duckGain)
    this.dulls = [sfxDull, ambDull]
    this.bus = { sfx: gain(1, sfxDull), ui: gain(0.5, this.master), amb: gain(1, ambDull), music: gain(0.45, this.master) }
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 220
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = this.hz(6500)
    const conv = c.createConvolver(); conv.normalize = true; conv.buffer = this.bank.ir
    this.rev = c.createGain(); this.rev.connect(hp); hp.connect(lp); lp.connect(conv); conv.connect(gain(0.6, this.bus.sfx))
  }

  hz(f: number): number { return clamp(f, 10, this.ny) }
  setListener(p: Vec3, yaw: number): void {
    const l = this.listener
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) { l.x = p.x; l.y = p.y; l.z = p.z }
    if (Number.isFinite(yaw)) l.yaw = yaw
  }

  play(id: SfxId, opts: PlayOptions, at?: number): void {
    const def = opts.suppressed && id.startsWith("shot_") ? suppressedDef(id) ?? DEFS[id] : DEFS[id]; if (!def) return
    const v = this.spawn(id, def, opts, at)
    if (v && def.fx) def.fx(this, v.t0, opts.position ? v.dist : -1)
  }

  spawn(key: string, def: Def, opts: PlayOptions, at?: number, dest?: AudioNode): Voice | null {
    const c = this.ctx, now = at ?? c.currentTime + LOOKAHEAD
    const r0 = opts.rate ?? 1, rate = clamp((Number.isFinite(r0) && r0 > 0 ? r0 : 1) * (1 + (this.rnd() * 2 - 1) * (def.vary ?? 0.02)), 0.25, 4)
    let base = Math.max(0, opts.volume ?? 1) * def.g * (1 + (this.rnd() - 0.5) * 0.16), att = 1, wet = def.send ?? 0
    let pan = 0, cut = 0, delay = 0, dist = 0, cell = key
    const p = opts.position
    if (p) {
      const L = this.listener, dx = p.x - L.x, dy = p.y - L.y, dz = p.z - L.z, dh = Math.hypot(dx, dz)
      dist = Math.hypot(dh, dy)
      if (!(dist <= (def.max ?? 90))) return this.drop()
      const cy = Math.cos(L.yaw), sy = Math.sin(L.yaw), xr = dx * cy - dz * sy, xf = -dx * sy - dz * cy
      const ref = def.ref ?? 3, back = dh > 0.05 ? Math.max(0, -xf / dh) : 0
      att = 1 / (1 + Math.max(0, dist - ref) / ref * (def.roll ?? 1))
      pan = dh > 0.05 ? clamp(xr / dh, -1, 1) * 0.92 * Math.min(1, dh / 1.5) : 0
      cut = this.hz(Math.max(450, 19000 / (1 + dist / 26)) * (1 - 0.5 * back))
      base *= 1 - 0.22 * back
      wet *= Math.sqrt(att) * (1 + clamp((dist - 8) / 45, 0, 1) * (def.gun ? 1.4 : 0.6))
      if (def.gun && dist > 40) delay = Math.min(dist / 343, 0.35)
      cell += `@${Math.round(p.x / 2)},${Math.round(p.z / 2)}`
    }
    const level = base * att
    if (!(level > 0.002)) return this.drop()
    const t = now + delay
    const last = this.gaps.get(cell)
    if (last && Math.abs(t - last.t) < (def.gap ?? 0.012)) { if (++last.n > (def.burst ?? 1)) return this.drop() }
    else { if (this.gaps.size > 256) this.gaps.clear(); this.gaps.set(cell, { t, n: 1 }) }

    this.reap(now)
    const force = def.pri >= 3
    if (!this.makeRoom(v => v.key === key, def.cap ?? 6, level, now, force)) return this.drop()
    const group = def.group
    if (group && !this.makeRoom(v => v.group === group, GROUP_CAP[group] ?? 12, level, now, force)) return this.drop()
    if (this.voices.length >= MAX_VOICES) {
      let victim: Voice | null = null, best = Infinity
      for (const v of this.voices) { const s = v.pri * 10 + this.eff(v, now); if (s < best) { best = s; victim = v } }
      if (!victim || best > def.pri * 10 + level) return this.drop()
      this.steal(victim, now)
    }

    const out = c.createGain(); out.gain.value = level
    const nodes: AudioNode[] = [out]
    let head: AudioNode = out
    if (cut) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut; f.Q.value = 0.6; head.connect(f); head = f; nodes.push(f) }
    if (pan && typeof c.createStereoPanner === "function") { const sp = c.createStereoPanner(); sp.pan.value = pan; head.connect(sp); head = sp; nodes.push(sp) }
    head.connect(dest ?? this.bus[def.bus])
    let wn: GainNode | null = null
    if (wet > 0.001) { wn = c.createGain(); wn.gain.value = base * wet; wn.connect(this.rev); nodes.push(wn) }
    const b = new V(this, t, out, wn, rate)
    try { def.make(b) } catch { for (const n of nodes.concat(b.nodes)) try { n.disconnect() } catch { /* ignore */ } return null }
    const voice: Voice = { key, group, pri: def.pri, level, t0: t, end: b.end, dist, out, srcs: b.srcs, nodes: nodes.concat(b.nodes) }
    if (b.last) b.last.onended = () => this.release(voice)
    this.voices.push(voice); this.peak = Math.max(this.peak, this.voices.length)
    return voice
  }

  private drop(): null { this.dropped++; return null }
  /** Remaining loudness of a voice (level × fraction of its length still to play). */
  private eff(v: Voice, now: number): number { return v.level * clamp((v.end - now) / Math.max(0.05, v.end - v.t0), 0.05, 1) }
  /** With `cap` matching voices, steals the one with the least remaining loudness — or refuses when the new voice
   *  would be quieter still (a far groan never replaces a near one). force: always make room (player weapons). */
  private makeRoom(match: (v: Voice) => boolean, cap: number, level: number, now: number, force: boolean): boolean {
    let n = 0, victim: Voice | null = null, best = Infinity
    for (const v of this.voices) if (match(v)) { n++; const e = this.eff(v, now); if (e < best) { best = e; victim = v } }
    if (n < cap || !victim) return true
    if (best > level && !force) return false
    this.steal(victim, now); return true
  }
  private reap(now: number): void { for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end + 0.1 < now) this.voices.splice(i, 1) }
  private release(v: Voice): void {
    const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1)
    for (const n of v.nodes) try { n.disconnect() } catch { /* ignore */ }
    v.nodes.length = 0
  }
  private steal(v: Voice, now: number): void {
    const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1)
    this.stolen++
    try { const g = v.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(v.level, now); g.linearRampToValueAtTime(0, now + 0.025) } catch { /* ignore */ }
    for (const s of v.srcs) try { s.stop(now + 0.03) } catch { /* ignore */ }
  }

  /** Muffles sfx + ambience (being hit, nearby blast) and recovers over `rec` seconds. */
  dull(t: number, f: number, rec: number): void { for (const n of this.dulls) this.dip(n.frequency, t, this.hz(f), this.hz(20000), rec) }
  duck(t: number, depth: number, rec: number): void { this.dip(this.duckGain.gain, t, 1 - depth, 1, rec) }
  private dip(p: AudioParam, t: number, low: number, rest: number, rec: number): void {
    try { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(low, t + 0.03); p.setTargetAtTime(rest, t + 0.1, rec / 3) } catch { /* ignore */ }
  }
  kill(): void {
    for (const v of this.voices) for (const s of v.srcs) try { s.stop() } catch { /* ignore */ }
    this.voices.length = 0
    try { this.master.disconnect() } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------------ sound recipes
/** Gunshot layers: crack [hp Hz, decay, gain], body [bp Hz, Q, decay, gain], low [lp Hz, decay, gain], thump sine
 *  [from Hz, to Hz, glide, decay, gain], sub, mech [at, bp Hz, decay, gain][], tail [lp Hz, decay, gain], echo [at, gain][]. */
interface Gun {
  crack: [number, number, number]; body: [number, number, number, number]; low?: [number, number, number]
  thump: [number, number, number, number, number]; sub?: [number, number, number, number]
  mech?: [number, number, number, number][]; tail: [number, number, number]; echo?: [number, number][]
}
function gun(v: V, s: Gun): void {
  const k = v.j(0.07)
  v.noise({ ft: "highpass", f: s.crack[0] * k, q: 0.7, a: 0.0006, d: s.crack[1], g: s.crack[2] * 0.7, drive: 2 })
  v.noise({ ft: "bandpass", f: s.body[0] * k, f2: s.body[0] * 0.55, q: s.body[1], a: 0.0008, d: s.body[2], g: s.body[3], drive: 2 })
  if (s.low) v.noise({ c: "p", ft: "lowpass", f: s.low[0] * k, q: 1.1, a: 0.0015, d: s.low[1], g: s.low[2], drive: 1 })
  v.tone({ f: s.thump[0] * v.j(0.04), f2: s.thump[1], gl: s.thump[2], a: 0.0008, d: s.thump[3], g: s.thump[4], rv: false })
  if (s.sub) v.tone({ f: s.sub[0], f2: s.sub[1], gl: s.sub[2] * 0.8, a: 0.003, d: s.sub[2], g: s.sub[3], rv: false })
  for (const [at, f, d, g] of s.mech ?? []) v.noise({ ft: "bandpass", f: f * v.j(0.05), q: 3.5, at, a: 0.0006, d, g, rv: false })
  v.noise({ c: "b", ft: "lowpass", f: s.tail[0], q: 0.6, at: 0.003, a: 0.012, d: s.tail[1], g: s.tail[2] })
  for (const [at, g] of s.echo ?? []) v.noise({ c: "p", ft: "bandpass", f: s.body[0] * 0.6, q: 0.8, at, a: 0.008, d: 0.4, g })
}
/** Radio squelch burst (band-limited noise + click). */
function squelch(v: V, at: number, g = 1): void {
  v.noise({ ft: "bandpass", f: 2400, q: 1.1, at, a: 0.002, h: 0.06, d: 0.08, g: 0.55 * g, drive: 2 })
  v.noise({ ft: "highpass", f: 5000, at, a: 0.0005, d: 0.012, g: 0.5 * g })
}
/** Unintelligible radio voice: buzzy saw + breath noise through a jumping formant filter, gated into syllables. */
function chatter(v: V, at: number, len: number, level: number): void {
  const c = v.c, s = v.t + at / v.r, e = s + len / v.r
  const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 120
  const nz = c.createBufferSource(); nz.buffer = v.e.bank.p; nz.loop = true
  const ng = v.reg(c.createGain()); ng.gain.value = 0.5
  const f = v.reg(c.createBiquadFilter()); f.type = "bandpass"; f.Q.value = 1.8; f.frequency.value = 1000
  const hp = v.reg(c.createBiquadFilter()); hp.type = "highpass"; hp.frequency.value = 450
  const sh = v.shaper(3), g = v.reg(c.createGain()); g.gain.value = 0; g.gain.setValueAtTime(0, s)
  o.connect(f); nz.connect(ng); ng.connect(f); f.connect(hp); hp.connect(sh); sh.connect(g); v.out(g)
  let t = s + 0.02
  while (t < e - 0.08) {
    const syl = (0.05 + v.rnd(0.14)) / v.r, pk = level * (0.55 + v.rnd(0.45))
    o.frequency.setValueAtTime(v.e.hz(105 + v.rnd(50)), t); f.frequency.setValueAtTime(v.e.hz(650 + v.rnd(1500)), t)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.012); g.gain.setValueAtTime(pk, t + syl * 0.75); g.gain.linearRampToValueAtTime(0, t + syl)
    t += syl + (0.015 + v.rnd(0.05) + (v.rnd() < 0.12 ? 0.16 : 0)) / v.r
  }
  v.run(o, s, e + 0.02); v.runBuf(nz, s, e + 0.02, v.rnd(2))
}
/** Metallic hammer hit used by build / clanks. */
function clank(v: V, at: number, f: number, g: number, d: number): void {
  v.metal({ f, p: [1, 2.45, 3.9, 5.3], at, a: 0.0008, d, g })
  v.noise({ ft: "bandpass", f: 1400, q: 1.3, at, a: 0.0006, d: 0.05, g: g * 4 })
  v.tone({ f: 160, f2: 85, at, d: 0.1, g: g * 2, rv: false })
}

/** Body/object hitting the ground: pitched-down sine + low noise. */
function thud(v: V, at: number, g: number, f = 90): void {
  v.tone({ f: f * v.j(0.08), f2: f * 0.5, gl: 0.1, at, a: 0.002, d: 0.2, g, rv: false })
  v.noise({ c: "b", ft: "lowpass", f: 420, at, a: 0.002, d: 0.18, g: g * 1.1 })
}
/** Wet squelch: resonant noise with a fast falling filter plus droplet grains. */
function wet(v: V, at: number, g: number, f = 1100, d = 0.18): void {
  v.noise({ c: "p", ft: "bandpass", f: f * v.j(0.15), f2: f * 0.3, sw: d * 0.7, q: 2.2, at, a: 0.004, d, g, drive: 1 })
  v.crackle({ c: "p", ft: "bandpass", f: f * 1.6, q: 1.2, n: 6, at: at + 0.01, span: d * 0.9, gl: 0.012, g: g * 0.6 })
}
/** Monster voice: buzzy glottal source (+ breath) through two moving formants, growl/gurgle AM and drive.
 *  The voice rate scales pitch AND formants, so opts.rate gives every infected its own size. */
interface Throat extends Env { f: number; f2?: number; gl?: number; w?: OscillatorType; f1: number; f1b?: number; f2f: number; f2b?: number; q?: number; growl?: number; gd?: number; breath?: number; drive?: number; vib?: number }
function throat(v: V, o: Throat): void {
  const c = v.c, r = v.r, [g, s, end] = v.env(o), osc = c.createOscillator()
  osc.type = o.w ?? "sawtooth"; osc.frequency.value = v.e.hz(o.f * r); osc.frequency.setValueAtTime(v.e.hz(o.f * r), s)
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(v.e.hz(o.f2 * r), s + Math.max(0.01, (o.gl ?? o.d) / r))
  v.mod(osc.frequency, (o.vib ?? 5.5) * v.j(0.2), o.f * r * 0.035, s, end, "triangle")
  const sum = v.reg(c.createGain()); sum.gain.value = 2.2
  const a = v.filter("bandpass", o.f1, o.q ?? 4, s, o.f1b, end), b = v.filter("bandpass", o.f2f, (o.q ?? 4) * 1.3, s, o.f2b, end)
  osc.connect(a); osc.connect(b); a.connect(sum); b.connect(sum)
  if (o.breath) {
    const n = c.createBufferSource(), ng = v.reg(c.createGain()); n.buffer = v.e.bank.p; n.loop = true; ng.gain.value = o.breath * 2
    n.connect(ng); ng.connect(a); ng.connect(b); v.runBuf(n, s, end + 0.01, v.rnd(2.5))
  }
  let head: AudioNode = sum
  if (o.growl) { const m = v.trem(o.growl * v.j(0.1), o.gd ?? 0.6, s, end, "square"); head.connect(m); head = m }
  if (o.drive) { const w = v.shaper(o.drive); head.connect(w); head = w }
  head.connect(g); v.run(osc, s, end + 0.01)
}
/** Suppressed shot derived from the weapon's recipe: muffled "thwip", soft gas spit, prominent action clack, short tail. */
function suppressedGun(v: V, s: Gun): void {
  const k = v.j(0.06), b = s.body[0]
  v.noise({ ft: "bandpass", f: b * 1.5 * k, f2: b * 0.45, sw: 0.05, q: 1.3, a: 0.0008, d: 0.1, g: 0.9, drive: 1 })
  v.noise({ c: "p", ft: "lowpass", f: (s.low?.[0] ?? 700) * 0.8 * k, q: 0.9, a: 0.001, d: 0.12, g: 0.7 })
  v.tone({ f: s.thump[0] * 0.9, f2: s.thump[1], gl: s.thump[2] * 0.7, a: 0.001, d: s.thump[3] * 0.5, g: s.thump[4] * 0.45, rv: false })
  v.noise({ ft: "highpass", f: 5500, a: 0.0005, d: 0.014, g: 0.3 })
  v.noise({ ft: "bandpass", f: 2400 * v.j(0.05), q: 3, at: 0.012, a: 0.0006, d: 0.035, g: 0.55, rv: false })
  v.tone({ w: "triangle", f: 2900 * v.j(0.04), at: 0.013, d: 0.05, g: 0.05, rv: false })
  for (const [at, f, d, g] of s.mech ?? []) v.noise({ ft: "bandpass", f: f * v.j(0.05), q: 3.5, at, a: 0.0006, d, g: g * 1.3, rv: false })
  v.noise({ c: "b", ft: "lowpass", f: 450, q: 0.6, at: 0.004, a: 0.01, d: Math.min(0.35, s.tail[1] * 0.3), g: s.tail[2] * 0.5 })
}
const supCache = new Map<SfxId, Def>()
function suppressedDef(id: SfxId): Def | null {
  const hit = supCache.get(id); if (hit) return hit
  const base = DEFS[id], spec = base ? GUN_SPEC.get(base.make) : undefined; if (!base || !spec) return null
  const def: Def = { ...base, g: base.sup ?? base.g * 0.45, send: (base.send ?? 0) * 0.35, ref: 4, max: 120, fx: undefined, make: v => suppressedGun(v, spec) }
  supCache.set(id, def); return def
}

/** Gun recipes by make function, so suppressed variants can be derived from the same weapon. */
const GUN_SPEC = new Map<(v: V) => void, Gun>()
const G = (s: Gun): ((v: V) => void) => { const make = (v: V): void => gun(v, s); GUN_SPEC.set(make, s); return make }
const PGUN = { bus: "sfx" as Bus, pri: 3, gap: 0.03, gun: true, max: 300, ref: 6 }
const EGUN = { bus: "sfx" as Bus, pri: 2, gap: 0.03, cap: 8, gun: true, max: 320, vary: 0.04 }
const INF = { bus: "sfx" as Bus, group: "inf", vary: 0.04, send: 0.25 }
const STEP = { bus: "sfx" as Bus, g: 0.5, pri: 0, ref: 3, roll: 1, max: 40, gap: 0.07, cap: 4, vary: 0.07, send: 0.1 }

const DEFS: Record<SfxId, Def> = {
  // ---- player weapons (2D, first person)
  shot_p9: { ...PGUN, g: 1.55, sup: 0.56, send: 0.35, vary: 0.035, cap: 5, make: G({
    crack: [3300, 0.03, 0.9], body: [1900, 1.1, 0.16, 1], low: [800, 0.14, 0.5], thump: [200, 62, 0.05, 0.14, 0.8],
    mech: [[0.03, 3800, 0.025, 0.35], [0.065, 2600, 0.03, 0.2]], tail: [1200, 0.4, 0.3] }) },
  shot_mk4: { ...PGUN, g: 1.0, sup: 0.63, send: 0.45, vary: 0.03, cap: 6, make: G({
    crack: [3600, 0.04, 0.85], body: [1150, 0.85, 0.3, 1.15], low: [520, 0.26, 0.8], thump: [155, 45, 0.09, 0.26, 1],
    mech: [[0.035, 2600, 0.035, 0.3]], tail: [800, 0.75, 0.45] }) },
  shot_vx9: { ...PGUN, g: 2.05, sup: 0.53, send: 0.3, vary: 0.05, cap: 5, make: G({
    crack: [4800, 0.022, 0.75], body: [2400, 1.2, 0.1, 0.9], low: [950, 0.09, 0.45], thump: [250, 95, 0.035, 0.1, 0.65],
    mech: [[0.02, 5200, 0.015, 0.3]], tail: [1600, 0.28, 0.25] }) },
  shot_kv12: { ...PGUN, g: 0.95, sup: 0.72, send: 0.55, vary: 0.03, cap: 3, make: G({
    crack: [2400, 0.05, 0.9], body: [820, 0.6, 0.45, 1.3], low: [400, 0.5, 1.1], thump: [118, 30, 0.2, 0.5, 1.15],
    sub: [58, 27, 0.7, 0.7], tail: [550, 1.3, 0.6] }) },
  shot_dr7: { ...PGUN, g: 1.1, sup: 0.65, send: 0.65, vary: 0.025, cap: 3, make: G({
    crack: [3000, 0.06, 1], body: [980, 0.75, 0.38, 1.2], low: [450, 0.34, 0.95], thump: [138, 36, 0.13, 0.4, 1.15],
    mech: [[0.085, 1900, 0.045, 0.35], [0.14, 2700, 0.04, 0.18]], tail: [650, 1.6, 0.55], echo: [[0.27, 0.22], [0.55, 0.13], [0.86, 0.07]] }) },
  // ---- enemy weapons (positional; brighter crack, less chest thump, more echo)
  enemy_rifle: { ...EGUN, g: 0.88, ref: 7, roll: 0.9, send: 0.55, make: G({
    crack: [3000, 0.04, 0.9], body: [1000, 0.9, 0.28, 1.1], low: [430, 0.22, 0.6], thump: [135, 50, 0.08, 0.2, 0.6], tail: [720, 0.7, 0.45] }) },
  enemy_smg: { ...EGUN, g: 1.45, ref: 6, roll: 0.95, send: 0.5, make: G({
    crack: [4200, 0.025, 0.8], body: [2050, 1.1, 0.11, 0.9], low: [850, 0.1, 0.35], thump: [215, 90, 0.035, 0.09, 0.4], tail: [1350, 0.3, 0.25] }) },
  enemy_shotgun: { ...EGUN, g: 0.48, ref: 8, roll: 0.9, send: 0.6, make: G({
    crack: [2200, 0.05, 0.85], body: [760, 0.6, 0.4, 1.25], low: [360, 0.45, 0.95], thump: [105, 30, 0.18, 0.45, 0.9], tail: [520, 1.2, 0.55] }) },
  enemy_sniper: { ...EGUN, g: 0.5, ref: 10, roll: 0.8, max: 420, send: 0.75, make: G({
    crack: [2700, 0.07, 1], body: [880, 0.75, 0.4, 1.15], low: [400, 0.34, 0.75], thump: [125, 35, 0.13, 0.38, 0.85],
    tail: [600, 1.7, 0.55], echo: [[0.3, 0.24], [0.62, 0.14], [1, 0.08]] }) },
  // ---- weapon handling
  dry_fire: { bus: "sfx", g: 0.95, pri: 2, gap: 0.05, make: v => {
    v.noise({ ft: "bandpass", f: 3600, q: 5, a: 0.0006, d: 0.03, g: 0.9 }); v.tone({ w: "triangle", f: 2250, d: 0.06, g: 0.12 })
    v.noise({ ft: "bandpass", f: 1150, q: 3, at: 0.003, d: 0.04, g: 0.5 }) } },
  reload_out: { bus: "sfx", g: 0.55, pri: 1, send: 0.1, make: v => {
    v.noise({ ft: "bandpass", f: 3200, q: 4, a: 0.0006, d: 0.025, g: 0.8 })
    v.noise({ ft: "bandpass", f: 1500, f2: 800, q: 1.8, at: 0.025, a: 0.02, d: 0.14, g: 0.45 })
    v.tone({ w: "triangle", f: 820, at: 0.11, d: 0.08, g: 0.08 }); v.noise({ c: "p", ft: "lowpass", f: 900, at: 0.11, d: 0.06, g: 0.35 }) } },
  reload_in: { bus: "sfx", g: 0.34, pri: 1, send: 0.1, make: v => {
    v.noise({ ft: "bandpass", f: 1100, f2: 2000, q: 1.6, a: 0.025, d: 0.09, g: 0.4 })
    v.noise({ ft: "bandpass", f: 1750, q: 2.2, at: 0.075, a: 0.0006, d: 0.05, g: 1, drive: 1 })
    v.tone({ f: 260, f2: 120, at: 0.075, d: 0.09, g: 0.45 }); v.tone({ w: "triangle", f: 2900, at: 0.077, d: 0.07, g: 0.06 }) } },
  reload_bolt: { bus: "sfx", g: 0.33, pri: 1, send: 0.12, make: v => {
    v.noise({ ft: "bandpass", f: 3000, q: 4, a: 0.0006, d: 0.02, g: 0.6 })
    v.noise({ ft: "bandpass", f: 1900, f2: 3300, q: 1.8, a: 0.012, d: 0.09, g: 0.45 })
    v.noise({ ft: "bandpass", f: 1500, q: 2, at: 0.15, a: 0.0006, d: 0.06, g: 1, drive: 2 })
    v.metal({ f: 1650, p: [1, 1.53, 2.41], at: 0.152, d: 0.16, g: 0.1 }); v.tone({ f: 210, f2: 95, at: 0.15, d: 0.1, g: 0.5 }) } },
  pump: { bus: "sfx", g: 0.34, pri: 2, send: 0.12, make: v => {
    v.noise({ ft: "bandpass", f: 900, f2: 1500, q: 1.5, a: 0.012, d: 0.1, g: 0.5 })
    v.noise({ ft: "bandpass", f: 1300, q: 2.4, at: 0.08, a: 0.0006, d: 0.05, g: 0.9, drive: 1 }); v.tone({ f: 180, f2: 85, at: 0.08, d: 0.08, g: 0.4 })
    v.noise({ ft: "bandpass", f: 1500, f2: 950, q: 1.5, at: 0.2, a: 0.01, d: 0.09, g: 0.45 })
    v.noise({ ft: "bandpass", f: 1650, q: 2.4, at: 0.275, a: 0.0006, d: 0.06, g: 1.1, drive: 2 })
    v.metal({ f: 1250, p: [1, 1.61, 2.53], at: 0.277, d: 0.14, g: 0.08 }); v.tone({ f: 220, f2: 95, at: 0.275, d: 0.1, g: 0.5 }) } },
  weapon_switch: { bus: "sfx", g: 0.8, pri: 1, gap: 0.05, make: v => {
    v.crackle({ c: "p", ft: "bandpass", f: 1600, q: 0.8, n: 10, span: 0.16, gl: 0.025, g: 0.6 })
    v.noise({ ft: "bandpass", f: 3000, q: 3, at: 0.06, a: 0.0006, d: 0.025, g: 0.55 })
    v.noise({ ft: "bandpass", f: 1900, q: 2.2, at: 0.19, a: 0.0006, d: 0.045, g: 0.8 }); v.tone({ w: "triangle", f: 1400, at: 0.19, d: 0.07, g: 0.07 }) } },
  ads_in: { bus: "sfx", g: 0.8, pri: 0, gap: 0.08, make: v => {
    v.noise({ c: "p", ft: "bandpass", f: 1900, q: 0.7, a: 0.04, d: 0.16, g: 0.35 })
    v.crackle({ c: "p", ft: "bandpass", f: 2600, q: 1, n: 6, span: 0.1, gl: 0.02, g: 0.35 })
    v.noise({ ft: "bandpass", f: 4200, q: 3, at: 0.09, a: 0.0006, d: 0.015, g: 0.25 }) } },
  // ---- hit feedback (ui bus: never muffled)
  hit_body: { bus: "ui", g: 1.45, pri: 3, gap: 0.03, burst: 2, make: v => {
    v.tone({ f: 175, f2: 85, gl: 0.06, d: 0.1, g: 0.7 }); v.noise({ c: "p", ft: "lowpass", f: 1100, d: 0.08, g: 0.6 })
    v.tone({ w: "triangle", f: 2150, at: 0.003, d: 0.06, g: 0.25 }); v.noise({ ft: "highpass", f: 5000, a: 0.0006, d: 0.012, g: 0.35 }) } },
  hit_head: { bus: "ui", g: 1.8, pri: 3, gap: 0.03, make: v => {
    v.metal({ f: 2650, p: [1, 1.47, 2.09], a: 0.0008, d: 0.38, g: 0.32 }); v.noise({ ft: "highpass", f: 6000, a: 0.0005, d: 0.012, g: 0.7 })
    v.tone({ f: 230, f2: 110, d: 0.07, g: 0.35 }) } },
  hit_armor: { bus: "ui", g: 1.6, pri: 3, gap: 0.03, burst: 2, make: v => {
    v.metal({ f: 1150, p: [1, 1.71, 2.62], d: 0.2, g: 0.26 }); v.noise({ ft: "bandpass", f: 1800, q: 2, d: 0.05, g: 0.7 })
    v.tone({ f: 150, f2: 80, d: 0.08, g: 0.4 }) } },
  kill: { bus: "ui", g: 1.0, pri: 3, gap: 0.05, make: v => {
    v.tone({ w: "triangle", f: 1046.5, a: 0.002, h: 0.04, d: 0.12, g: 0.35 }); v.tone({ f: 2093, a: 0.002, h: 0.03, d: 0.08, g: 0.1 })
    v.tone({ w: "triangle", f: 1568, at: 0.075, a: 0.002, h: 0.06, d: 0.35, g: 0.38 }); v.tone({ f: 3136, at: 0.075, a: 0.002, h: 0.04, d: 0.2, g: 0.1 })
    v.tone({ f: 150, f2: 70, d: 0.12, g: 0.45, rv: false }); v.noise({ ft: "highpass", f: 4500, a: 0.0005, d: 0.01, g: 0.4 }) } },
  // ---- bullet impacts (positional)
  impact_concrete: { bus: "sfx", g: 0.8, pri: 1, ref: 3, roll: 1.1, max: 70, gap: 0.02, burst: 3, cap: 8, send: 0.25, vary: 0.08, make: v => {
    v.noise({ ft: "highpass", f: 2600, a: 0.0005, d: 0.03, g: 0.9, drive: 1 }); v.noise({ ft: "bandpass", f: 1250 * v.j(0.15), q: 1.1, a: 0.0008, d: 0.1, g: 0.8 })
    v.tone({ f: 260, f2: 130, d: 0.07, g: 0.3, rv: false })
    v.crackle({ ft: "bandpass", f: 3800, q: 1.2, n: 6, at: 0.015, span: 0.14, gl: 0.008, g: 0.45 }) } },
  impact_metal: { bus: "sfx", g: 0.75, pri: 1, ref: 3, roll: 1.1, max: 80, gap: 0.02, burst: 3, cap: 8, send: 0.3, vary: 0.06, make: v => {
    v.noise({ ft: "highpass", f: 4000, a: 0.0005, d: 0.02, g: 0.9 }); v.metal({ f: 1900 * v.j(0.15), p: [1, 1.52, 2.33, 3.07], a: 0.0008, d: 0.7, g: 0.26 })
    v.noise({ ft: "bandpass", f: 2600, q: 3, d: 0.05, g: 0.6 }) } },
  impact_dirt: { bus: "sfx", g: 0.75, pri: 1, ref: 3, roll: 1.2, max: 55, gap: 0.02, burst: 3, cap: 8, send: 0.15, vary: 0.08, make: v => {
    v.noise({ c: "b", ft: "lowpass", f: 650, a: 0.001, d: 0.14, g: 1.1 }); v.tone({ f: 95, f2: 50, d: 0.1, g: 0.45, rv: false })
    v.crackle({ c: "p", ft: "lowpass", f: 2200, n: 5, at: 0.02, span: 0.16, gl: 0.025, g: 0.45 }) } },
  whiz: { bus: "sfx", g: 0.95, pri: 2, ref: 2, roll: 1, max: 25, gap: 0.02, burst: 2, send: 0.1, vary: 0.08, make: v => {
    v.noise({ ft: "highpass", f: 3500, a: 0.0004, d: 0.015, g: 1 })
    v.noise({ ft: "bandpass", f: 3800, f2: 850, sw: 0.17, q: 1.4, a: 0.008, d: 0.22, g: 0.7 })
    v.tone({ f: 2100, f2: 800, gl: 0.16, a: 0.008, d: 0.18, g: 0.06 }) } },
  // ---- player body / foley
  hurt: { bus: "sfx", g: 1.4, pri: 3, gap: 0.08, fx: (e, t) => { e.dull(t, 650, 0.6); e.duck(t, 0.45, 0.6) }, make: v => {
    v.tone({ f: 95, f2: 42, gl: 0.12, d: 0.26, g: 1, rv: false }); v.noise({ c: "b", ft: "lowpass", f: 340, d: 0.28, g: 1 })
    v.noise({ c: "p", ft: "bandpass", f: 900, q: 1, d: 0.08, g: 0.35 }) } },
  armor_absorb: { bus: "sfx", g: 1.2, pri: 2, gap: 0.05, make: v => {
    v.metal({ f: 760, p: [1, 1.58, 2.31, 3.4], a: 0.0008, d: 0.3, g: 0.28 }); v.noise({ c: "p", ft: "lowpass", f: 800, d: 0.1, g: 0.8 })
    v.tone({ f: 130, f2: 65, d: 0.12, g: 0.55, rv: false }); v.noise({ ft: "bandpass", f: 2400, q: 1.5, a: 0.0006, d: 0.03, g: 0.5 }) } },
  heal: { bus: "ui", g: 0.57, pri: 1, gap: 0.3, make: v => {
    v.crackle({ ft: "bandpass", f: 2600, q: 0.9, n: 26, span: 0.34, gl: 0.014, g: 0.7 })
    v.noise({ ft: "bandpass", f: 1800, f2: 3200, q: 1.2, a: 0.02, h: 0.25, d: 0.1, g: 0.2 })
    v.tone({ f: 440, f2: 660, gl: 0.5, at: 0.36, a: 0.12, h: 0.18, d: 0.6, g: 0.2 }); v.tone({ f: 660, f2: 990, gl: 0.5, at: 0.4, a: 0.12, h: 0.14, d: 0.6, g: 0.1 }) } },
  pickup: { bus: "ui", g: 1.4, pri: 1, gap: 0.05, make: v => {
    v.crackle({ c: "p", ft: "bandpass", f: 2200, q: 0.9, n: 8, span: 0.12, gl: 0.02, g: 0.5 })
    v.tone({ f: 740, at: 0.02, a: 0.003, d: 0.12, g: 0.22 }); v.tone({ f: 1110, at: 0.08, a: 0.003, d: 0.18, g: 0.2 }) } },
  crate_open: { bus: "sfx", g: 0.5, pri: 1, ref: 3, max: 40, gap: 0.2, send: 0.15, make: v => {
    v.noise({ ft: "bandpass", f: 3000, q: 3, a: 0.0006, d: 0.025, g: 0.9 }); v.tone({ w: "triangle", f: 1900, d: 0.06, g: 0.1 })
    v.noise({ ft: "bandpass", f: 2700, q: 3, at: 0.12, a: 0.0006, d: 0.025, g: 0.85 }); v.tone({ w: "triangle", f: 1750, at: 0.12, d: 0.06, g: 0.1 })
    v.tone({ w: "sawtooth", f: 85, f2: 130, gl: 0.35, at: 0.22, a: 0.05, h: 0.15, d: 0.2, g: 0.12, ft: "bandpass", ff: 900, q: 5, vib: 21, vibd: 10 })
    v.tone({ f: 130, f2: 65, at: 0.56, d: 0.14, g: 0.55, rv: false }); v.noise({ c: "p", ft: "lowpass", f: 1000, at: 0.56, d: 0.12, g: 0.8 })
    v.metal({ f: 520, p: [1, 2.3, 3.7], at: 0.56, d: 0.2, g: 0.07 }) } },
  body_search: { bus: "sfx", g: 1.2, pri: 1, ref: 3, max: 30, gap: 0.2, make: v => {
    v.crackle({ c: "p", ft: "bandpass", f: 1700, q: 0.8, n: 28, span: 0.62, gl: 0.035, g: 0.6 })
    v.noise({ c: "p", ft: "bandpass", f: 1200, q: 0.7, a: 0.1, h: 0.3, d: 0.25, g: 0.25 })
    v.crackle({ ft: "highpass", f: 3500, n: 20, at: 0.42, span: 0.2, gl: 0.006, g: 0.3 }) } },
  // ---- footsteps (2D for the player, positional for others)
  step_asphalt: { ...STEP, g: 0.57, make: v => {
    v.noise({ c: "p", ft: "lowpass", f: 900 * v.j(0.15), q: 0.7, a: 0.003, d: 0.1, g: 0.9 })
    v.noise({ ft: "bandpass", f: 3200 * v.j(0.2), q: 1.2, at: 0.006, a: 0.004, d: 0.05, g: 0.25 }); v.tone({ f: 110, f2: 70, d: 0.07, g: 0.25, rv: false }) } },
  step_concrete: { ...STEP, g: 0.5, make: v => {
    v.noise({ ft: "bandpass", f: 1600 * v.j(0.15), q: 1.1, a: 0.002, d: 0.08, g: 0.6 }); v.noise({ ft: "highpass", f: 4200, a: 0.001, d: 0.03, g: 0.2 })
    v.noise({ c: "p", ft: "lowpass", f: 420, d: 0.08, g: 0.6 }) } },
  step_metal: { ...STEP, g: 0.4, send: 0.15, make: v => {
    v.metal({ f: 380 * v.j(0.12), p: [1, 2.76, 4.07, 5.93], a: 0.001, d: 0.45, g: 0.2 })
    v.noise({ ft: "bandpass", f: 2200, q: 2, a: 0.001, d: 0.05, g: 0.5 }); v.tone({ f: 125, f2: 80, d: 0.08, g: 0.35, rv: false }) } },
  step_gravel: { ...STEP, g: 0.47, make: v => {
    v.crackle({ ft: "bandpass", f: 3600, q: 1.4, n: 7, span: 0.09, gl: 0.012, g: 0.7 }); v.noise({ c: "p", ft: "lowpass", f: 750, a: 0.003, d: 0.1, g: 0.6 }) } },
  step_dirt: { ...STEP, g: 0.6, make: v => {
    v.noise({ c: "b", ft: "lowpass", f: 480 * v.j(0.15), a: 0.006, d: 0.13, g: 1 }); v.noise({ c: "p", ft: "bandpass", f: 1300, q: 0.8, a: 0.004, d: 0.06, g: 0.2 }) } },
  step_wood: { ...STEP, g: 0.43, make: v => {
    v.tone({ w: "triangle", f: 205 * v.j(0.08), f2: 180, d: 0.12, g: 0.5 }); v.tone({ f: 470 * v.j(0.08), d: 0.08, g: 0.25 })
    v.noise({ ft: "bandpass", f: 900, q: 1.2, a: 0.001, d: 0.05, g: 0.5 }); v.noise({ ft: "highpass", f: 3200, a: 0.0006, d: 0.015, g: 0.2 }) } },
  land: { bus: "sfx", g: 0.33, pri: 1, ref: 2, roll: 1.3, max: 40, gap: 0.1, send: 0.1, make: v => {
    v.tone({ f: 85, f2: 40, gl: 0.14, d: 0.28, g: 1, rv: false }); v.noise({ c: "b", ft: "lowpass", f: 480, a: 0.003, d: 0.24, g: 1 })
    v.crackle({ ft: "bandpass", f: 3000, q: 1.5, n: 7, at: 0.02, span: 0.13, gl: 0.012, g: 0.35 }) } },
  // ---- grenades
  grenade_pin: { bus: "sfx", g: 0.6, pri: 2, gap: 0.1, make: v => {
    v.noise({ ft: "bandpass", f: 4500, q: 3, a: 0.0005, d: 0.02, g: 0.6 }); v.metal({ f: 3700, p: [1, 1.48, 2.1], d: 0.35, g: 0.16 })
    v.noise({ ft: "bandpass", f: 2600, q: 3, at: 0.22, a: 0.0005, d: 0.03, g: 0.7 }); v.metal({ f: 2200, p: [1, 1.9], at: 0.22, d: 0.25, g: 0.1 }) } },
  grenade_bounce: { bus: "sfx", g: 1.25, pri: 2, ref: 2.5, max: 50, gap: 0.05, send: 0.2, vary: 0.08, make: v => {
    v.metal({ f: 680 * v.j(0.1), p: [1, 2.2, 3.6], a: 0.0008, d: 0.2, g: 0.3 }); v.noise({ ft: "bandpass", f: 1500, q: 1.5, a: 0.0006, d: 0.04, g: 0.7 })
    v.tone({ f: 150, f2: 80, d: 0.07, g: 0.35, rv: false }) } },
  explosion: { bus: "sfx", g: 0.95, pri: 3, ref: 12, roll: 0.8, max: 600, gap: 0.05, cap: 4, send: 0.85, gun: true, vary: 0.04,
    fx: (e, t, d) => { if (d < 0 || d > 16) return; const k = 1 - d / 16; e.dull(t, 300 + d * 60, 1.8); e.duck(t, 0.6 * k, 1.5); e.spawn("ring", RING, { volume: k }, t) },
    make: v => {
      v.noise({ ft: "highpass", f: 1800, a: 0.0006, d: 0.1, g: 1, drive: 2 })
      v.noise({ c: "b", ft: "lowpass", f: 1100, f2: 150, sw: 1.1, q: 0.8, a: 0.003, h: 0.05, d: 2, g: 1.2, drive: 2 })
      v.tone({ f: 72, f2: 26, gl: 0.8, a: 0.002, h: 0.05, d: 1.7, g: 1.1, rv: false })
      v.tone({ w: "triangle", f: 46, f2: 22, gl: 1.2, a: 0.01, d: 2, g: 0.4, rv: false })
      v.noise({ c: "p", ft: "bandpass", f: 650, q: 0.6, a: 0.002, d: 0.7, g: 1, drive: 3 })
      v.crackle({ ft: "bandpass", f: 2600, q: 1.1, n: 16, at: 0.2, span: 1.5, gl: 0.03, g: 0.35 })
      v.noise({ c: "b", ft: "lowpass", f: 380, at: 0.08, a: 0.25, d: 3.4, g: 0.5 }) } },
  // ---- extraction / world cues
  extract_call: { bus: "ui", g: 0.47, pri: 2, gap: 0.5, make: v => {
    squelch(v, 0)
    for (let i = 0; i < 3; i++) v.tone({ w: "square", f: 1180, at: 0.16 + i * 0.14, a: 0.004, h: 0.06, d: 0.05, g: 0.16, ft: "bandpass", ff: 1500, q: 1.4 })
    v.tone({ w: "square", f: 1570, at: 0.62, a: 0.004, h: 0.18, d: 0.08, g: 0.18, ft: "bandpass", ff: 1700, q: 1.4 })
    squelch(v, 0.95) } },
  extract_tick: { bus: "ui", g: 0.8, pri: 1, gap: 0.1, make: v => {
    v.tone({ f: 1040, a: 0.003, h: 0.04, d: 0.06, g: 0.22 }); v.tone({ w: "triangle", f: 2080, a: 0.003, h: 0.02, d: 0.04, g: 0.04 }) } },
  helicopter: { bus: "sfx", g: 0.7, pri: 2, ref: 15, roll: 0.7, max: 700, gap: 1, cap: 2, send: 0.4, vary: 0.02, make: v => {
    const e = { a: 1.3, h: 2.3, d: 1.6 }
    v.noise({ c: "p", ft: "lowpass", f: 750, q: 0.8, ...e, g: 1.2, am: 11.5, amd: 0.9, amw: "sawtooth" })
    v.noise({ c: "b", ft: "lowpass", f: 240, q: 0.7, ...e, g: 1, am: 11.5, amd: 0.75, amw: "sawtooth" })
    v.tone({ w: "sawtooth", f: 385, f2: 360, gl: 5, ...e, g: 0.05, ft: "bandpass", ff: 950, q: 2, vib: 0.5, vibd: 4 })
    v.tone({ f: 2650, f2: 2480, gl: 5, ...e, g: 0.025 }) } },
  alert: { bus: "music", g: 0.67, pri: 3, gap: 0.6, make: v => {
    v.tone({ w: "sawtooth", f: 110, a: 0.006, h: 0.12, d: 0.7, g: 0.3, ft: "lowpass", ff: 2400, ff2: 400, q: 3 })
    v.tone({ w: "sawtooth", f: 116.54, a: 0.006, h: 0.12, d: 0.7, g: 0.24, ft: "lowpass", ff: 2400, ff2: 400, q: 3 })
    v.tone({ w: "triangle", f: 1318.5, a: 0.015, h: 0.15, d: 0.45, g: 0.1, am: 17, amd: 0.8 })
    v.tone({ w: "triangle", f: 1396.9, a: 0.015, h: 0.15, d: 0.45, g: 0.07, am: 19, amd: 0.8 })
    v.tone({ f: 68, f2: 36, gl: 0.25, a: 0.002, d: 0.5, g: 0.7, rv: false }); v.noise({ ft: "bandpass", f: 2400, q: 1, a: 0.001, d: 0.2, g: 0.3 }) } },
  radio: { bus: "sfx", g: 0.35, pri: 1, ref: 4, max: 80, gap: 0.5, send: 0.2, make: v => {
    squelch(v, 0, 0.8); chatter(v, 0.12, 1.5, 0.5)
    v.noise({ ft: "bandpass", f: 2000, q: 0.8, at: 0.05, a: 0.02, h: 1.55, d: 0.05, g: 0.08 }); squelch(v, 1.68, 0.7) } },
  // ---- UI / meta
  ui_click: { bus: "ui", g: 1.6, pri: 3, gap: 0.02, make: v => {
    v.tone({ f: 1650, f2: 1350, gl: 0.03, a: 0.001, d: 0.05, g: 0.4 }); v.noise({ ft: "highpass", f: 4500, a: 0.0005, d: 0.01, g: 0.35 }) } },
  ui_hover: { bus: "ui", g: 1.4, pri: 0, gap: 0.04, cap: 2, make: v => { v.tone({ f: 2500, a: 0.002, d: 0.04, g: 0.18 }) } },
  ui_buy: { bus: "ui", g: 1.0, pri: 2, gap: 0.05, make: v => {
    v.noise({ ft: "bandpass", f: 3000, q: 2, a: 0.0005, d: 0.03, g: 0.6 })
    v.metal({ f: 2637, p: [1, 1.5, 2.76], at: 0.02, d: 0.5, g: 0.2 }); v.metal({ f: 3520, p: [1, 1.5, 2.76], at: 0.1, d: 0.6, g: 0.18 })
    v.crackle({ ft: "bandpass", f: 5200, q: 2, n: 6, at: 0.05, span: 0.14, gl: 0.01, g: 0.3 }) } },
  ui_error: { bus: "ui", g: 0.7, pri: 2, gap: 0.1, make: v => {
    for (const at of [0, 0.13]) {
      v.tone({ w: "square", f: 110, at, a: 0.004, h: 0.08, d: 0.05, g: 0.2, ft: "lowpass", ff: 900 })
      v.tone({ w: "sawtooth", f: 116, at, a: 0.004, h: 0.08, d: 0.05, g: 0.12, ft: "lowpass", ff: 900 })
    } } },
  build: { bus: "ui", g: 0.8, pri: 2, gap: 0.1, make: v => {
    for (const at of [0, 0.17, 0.34]) clank(v, at, 520 * v.j(0.05), 0.16, 0.35)
    v.crackle({ ft: "bandpass", f: 3200, q: 3, n: 9, at: 0.52, span: 0.26, gl: 0.01, g: 0.4 }) } },
  win: { bus: "ui", g: 0.6, pri: 3, gap: 0.5, make: v => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const at = i * 0.07
      v.tone({ w: "sawtooth", f, at, a: 0.02, h: 0.45 - at, d: 0.9, g: 0.1, ft: "lowpass", ff: 2600, ff2: 1200, q: 0.7 })
      v.tone({ w: "triangle", f, at, a: 0.01, h: 0.45 - at, d: 0.9, g: 0.16, det: 4 })
    })
    v.tone({ w: "triangle", f: 130.81, a: 0.02, h: 0.4, d: 0.9, g: 0.35 }); v.noise({ ft: "highpass", f: 6500, at: 0.21, a: 0.03, d: 0.6, g: 0.05 }) } },
  lose: { bus: "ui", g: 0.46, pri: 3, gap: 0.5, make: v => {
    v.tone({ w: "sawtooth", f: 220, f2: 98, gl: 1.4, a: 0.05, h: 0.45, d: 1.2, g: 0.18, ft: "lowpass", ff: 800, ff2: 300, q: 1 })
    v.tone({ w: "sawtooth", f: 261.63, f2: 116.54, gl: 1.4, a: 0.05, h: 0.45, d: 1.2, g: 0.12, ft: "lowpass", ff: 800, ff2: 300, q: 1 })
    v.tone({ f: 55, f2: 41, gl: 1.4, a: 0.1, h: 0.5, d: 1.2, g: 0.5, rv: false }); v.noise({ c: "b", ft: "lowpass", f: 260, a: 0.3, h: 0.3, d: 1.2, g: 0.4 }) } },
  level_up: { bus: "ui", g: 1.3, pri: 3, gap: 0.5, make: v => {
    ;[1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => { v.tone({ w: "triangle", f, at: i * 0.065, a: 0.003, h: 0.03, d: 0.45, g: 0.2 }); v.tone({ f: f * 2, at: i * 0.065, a: 0.003, d: 0.2, g: 0.05 }) })
    v.noise({ ft: "highpass", f: 7000, at: 0.22, a: 0.05, d: 0.7, g: 0.07 }) } },
  flashlight: { bus: "sfx", g: 0.7, pri: 1, gap: 0.05, make: v => {
    v.noise({ ft: "bandpass", f: 2600, q: 2, a: 0.0005, d: 0.015, g: 0.8 }); v.tone({ w: "triangle", f: 1300, d: 0.035, g: 0.1 })
    v.noise({ ft: "bandpass", f: 3300, q: 2, at: 0.045, a: 0.0005, d: 0.012, g: 0.45 }) } },
  // ---- phase 2: further player weapons
  shot_r44: { ...PGUN, g: 1.1, sup: 0.64, send: 0.55, vary: 0.03, cap: 3, make: G({
    crack: [3000, 0.05, 0.95], body: [1300, 0.8, 0.3, 1.2], low: [550, 0.3, 1], thump: [170, 42, 0.1, 0.32, 1.15],
    sub: [70, 32, 0.4, 0.45], mech: [[0.09, 3400, 0.02, 0.15]], tail: [900, 1, 0.5], echo: [[0.24, 0.12]] }) },
  shot_k5: { ...PGUN, g: 2.1, sup: 0.46, send: 0.25, vary: 0.06, cap: 5, gap: 0.025, make: G({
    crack: [5200, 0.018, 0.7], body: [2800, 1.3, 0.07, 0.85], low: [1100, 0.06, 0.35], thump: [280, 110, 0.03, 0.07, 0.5],
    mech: [[0.015, 5800, 0.012, 0.28]], tail: [1800, 0.2, 0.2] }) },
  shot_sr74: { ...PGUN, g: 1.0, sup: 0.65, send: 0.5, vary: 0.03, cap: 6, make: G({
    crack: [3300, 0.045, 0.9], body: [1000, 0.8, 0.34, 1.2], low: [460, 0.3, 0.95], thump: [140, 40, 0.1, 0.3, 1.1],
    mech: [[0.04, 2300, 0.04, 0.3]], tail: [720, 0.85, 0.5] }) },
  shot_br10: { ...PGUN, g: 1.05, sup: 0.68, send: 0.55, vary: 0.03, cap: 5, make: G({
    crack: [3100, 0.055, 1], body: [920, 0.75, 0.38, 1.3], low: [430, 0.34, 1.05], thump: [132, 36, 0.12, 0.36, 1.2],
    sub: [62, 30, 0.4, 0.4], mech: [[0.05, 2100, 0.045, 0.32]], tail: [680, 1.1, 0.55], echo: [[0.3, 0.12]] }) },
  shot_sg8: { ...PGUN, g: 0.9, sup: 0.66, send: 0.5, vary: 0.035, cap: 4, make: G({
    crack: [2600, 0.05, 0.9], body: [880, 0.62, 0.4, 1.25], low: [420, 0.45, 1.05], thump: [122, 32, 0.18, 0.45, 1.1],
    sub: [60, 28, 0.6, 0.55], mech: [[0.05, 1900, 0.05, 0.35]], tail: [580, 1.15, 0.55] }) },
  shot_falke: { ...PGUN, g: 1.05, sup: 0.67, send: 0.8, vary: 0.02, cap: 3, gap: 0.2, max: 600, make: G({
    crack: [2600, 0.09, 1.2], body: [800, 0.7, 0.5, 1.3], low: [380, 0.45, 1.1], thump: [118, 30, 0.16, 0.55, 1.25],
    sub: [55, 26, 0.8, 0.7], tail: [560, 2.2, 0.6], echo: [[0.3, 0.26], [0.62, 0.17], [0.98, 0.1], [1.4, 0.06]] }) },
  shot_lm60: { ...PGUN, g: 1.0, sup: 0.55, send: 0.45, vary: 0.025, cap: 6, make: G({
    crack: [3200, 0.04, 0.8], body: [950, 0.8, 0.26, 1.15], low: [420, 0.26, 1], thump: [128, 42, 0.08, 0.24, 1.15],
    mech: [[0.03, 2000, 0.03, 0.28], [0.05, 3600, 0.015, 0.12]], tail: [700, 0.7, 0.45] }) },
  // ---- weapon mechanics
  bolt_cycle: { bus: "sfx", g: 0.35, pri: 2, gap: 0.2, send: 0.12, make: v => {
    v.noise({ ft: "bandpass", f: 2800, q: 4, a: 0.0006, d: 0.025, g: 0.8 })
    v.noise({ ft: "bandpass", f: 1500, f2: 2600, q: 1.8, at: 0.07, a: 0.015, d: 0.1, g: 0.5 })
    v.noise({ ft: "bandpass", f: 2200, q: 3, at: 0.17, a: 0.0006, d: 0.035, g: 0.7 }); v.metal({ f: 3100, p: [1, 1.7], at: 0.2, d: 0.12, g: 0.04 })
    v.noise({ ft: "bandpass", f: 2400, f2: 1400, q: 1.8, at: 0.3, a: 0.012, d: 0.08, g: 0.5 })
    v.noise({ ft: "bandpass", f: 1600, q: 2.5, at: 0.4, a: 0.0006, d: 0.05, g: 1, drive: 1 }); v.tone({ f: 200, f2: 100, at: 0.4, d: 0.08, g: 0.4, rv: false }) } },
  revolver_open: { bus: "sfx", g: 0.7, pri: 1, gap: 0.2, send: 0.1, make: v => {
    v.noise({ ft: "bandpass", f: 3200, q: 4, a: 0.0006, d: 0.02, g: 0.7 })
    v.crackle({ ft: "bandpass", f: 4200, q: 3, n: 5, at: 0.03, span: 0.08, gl: 0.006, g: 0.5 })
    v.noise({ ft: "bandpass", f: 1800, q: 2.5, at: 0.11, a: 0.0006, d: 0.04, g: 0.8 })
    v.crackle({ ft: "bandpass", f: 3000, q: 2, n: 6, at: 0.3, span: 0.12, gl: 0.01, g: 0.5 })
    for (let i = 0; i < 4; i++) v.metal({ f: 3600 * v.j(0.15), p: [1, 1.6], at: 0.42 + i * 0.07 + v.rnd(0.04), d: 0.12, g: 0.05 }) } },
  revolver_close: { bus: "sfx", g: 0.4, pri: 1, gap: 0.2, send: 0.1, make: v => {
    v.crackle({ ft: "bandpass", f: 4400, q: 3, n: 7, span: 0.12, gl: 0.006, g: 0.45 })
    v.noise({ ft: "bandpass", f: 1700, q: 2.6, at: 0.15, a: 0.0006, d: 0.05, g: 1, drive: 1 })
    v.metal({ f: 2300, p: [1, 1.55, 2.4], at: 0.152, d: 0.14, g: 0.08 }); v.tone({ f: 220, f2: 110, at: 0.15, d: 0.07, g: 0.35, rv: false }) } },
  shell_insert: { bus: "sfx", g: 0.56, pri: 1, gap: 0.08, send: 0.08, vary: 0.05, make: v => {
    v.noise({ ft: "bandpass", f: 1300, f2: 2000, q: 1.6, a: 0.01, d: 0.06, g: 0.45 })
    v.noise({ ft: "bandpass", f: 2100, q: 2.8, at: 0.055, a: 0.0006, d: 0.03, g: 0.85 })
    v.tone({ w: "triangle", f: 1450, at: 0.056, d: 0.05, g: 0.06 }); v.tone({ f: 180, f2: 110, at: 0.055, d: 0.05, g: 0.25, rv: false }) } },
  lmg_belt: { bus: "sfx", g: 0.32, pri: 1, gap: 0.3, send: 0.12, make: v => {
    v.noise({ ft: "bandpass", f: 2000, q: 2.5, a: 0.0006, d: 0.04, g: 0.9 }); v.metal({ f: 1500, p: [1, 1.8], d: 0.1, g: 0.06 })
    v.crackle({ ft: "bandpass", f: 3400, q: 1.8, n: 22, at: 0.15, span: 0.45, gl: 0.01, g: 0.55 })
    v.noise({ ft: "bandpass", f: 1200, f2: 1900, q: 1.4, at: 0.2, a: 0.05, d: 0.25, g: 0.25 })
    v.noise({ ft: "bandpass", f: 1500, q: 2.4, at: 0.72, a: 0.0006, d: 0.06, g: 1.1, drive: 2 })
    v.metal({ f: 1250, p: [1, 1.6, 2.5], at: 0.722, d: 0.14, g: 0.08 }); v.tone({ f: 190, f2: 90, at: 0.72, d: 0.09, g: 0.45, rv: false }) } },
  // ---- melee (rate < 1 = heavy, slower and lower; rate > 1 = light, quick)
  melee_swing: { bus: "sfx", g: 0.28, pri: 1, gap: 0.08, vary: 0.06, send: 0.05, make: v => {
    v.noise({ ft: "bandpass", f: 500, f2: 2600, sw: 0.12, q: 1.6, a: 0.09, d: 0.16, g: 0.9 })
    v.noise({ c: "p", ft: "bandpass", f: 300, f2: 900, sw: 0.1, q: 1, a: 0.08, d: 0.14, g: 0.6 }) } },
  melee_hit_flesh: { bus: "sfx", g: 0.6, pri: 2, ref: 3, max: 40, gap: 0.04, burst: 2, cap: 6, send: 0.12, vary: 0.07, make: v => {
    thud(v, 0, 0.9, 115); v.noise({ ft: "bandpass", f: 2400, q: 1.2, a: 0.0006, d: 0.03, g: 0.6 })
    wet(v, 0.004, 0.9, 1200, 0.22); v.crackle({ ft: "bandpass", f: 2600, q: 1.5, n: 4, at: 0.01, span: 0.05, gl: 0.006, g: 0.5 }) } },
  melee_hit_wall: { bus: "sfx", g: 0.7, pri: 1, ref: 3, max: 50, gap: 0.05, send: 0.2, vary: 0.06, make: v => {
    v.noise({ ft: "highpass", f: 3000, a: 0.0005, d: 0.03, g: 0.9, drive: 1 }); v.metal({ f: 1700 * v.j(0.1), p: [1, 1.43, 2.17, 2.95], a: 0.0006, d: 0.5, g: 0.18 })
    v.noise({ ft: "bandpass", f: 1100, q: 1, a: 0.0008, d: 0.08, g: 0.7 }); thud(v, 0, 0.45, 140)
    v.crackle({ ft: "bandpass", f: 3600, q: 1.2, n: 5, at: 0.015, span: 0.12, gl: 0.008, g: 0.35 }) } },
  // ---- gore (shared "gore" budget)
  gore_splat: { bus: "sfx", g: 1.0, pri: 1, ref: 3, max: 35, gap: 0.04, burst: 2, cap: 6, group: "gore", send: 0.1, vary: 0.1, make: v => { wet(v, 0, 1, 900, 0.25); thud(v, 0, 0.25, 120) } },
  gore_burst: { bus: "sfx", g: 0.6, pri: 2, ref: 4, max: 50, gap: 0.05, cap: 4, group: "gore", send: 0.2, vary: 0.06, make: v => {
    v.crackle({ ft: "highpass", f: 2500, n: 10, span: 0.06, gl: 0.006, g: 0.9, drive: 1 })
    v.noise({ c: "p", ft: "lowpass", f: 2200, f2: 400, sw: 0.25, q: 1, a: 0.002, d: 0.35, g: 1, drive: 2 })
    thud(v, 0, 0.7, 100); wet(v, 0.02, 0.8, 1300, 0.3)
    v.crackle({ c: "p", ft: "bandpass", f: 1800, q: 1.3, n: 14, at: 0.12, span: 0.5, gl: 0.02, g: 0.4 }) } },
  bone_crack: { bus: "sfx", g: 0.95, pri: 1, ref: 3, max: 30, gap: 0.04, cap: 4, group: "gore", send: 0.08, vary: 0.1, make: v => {
    v.noise({ ft: "highpass", f: 2200, a: 0.0004, d: 0.025, g: 1, drive: 2 })
    v.crackle({ ft: "bandpass", f: 3200, q: 1.5, n: 7, at: 0.004, span: 0.045, gl: 0.005, g: 0.8 }); v.tone({ f: 260, f2: 140, d: 0.05, g: 0.3, rv: false }) } },
  gib_land: { bus: "sfx", g: 0.45, pri: 0, ref: 3, max: 30, gap: 0.05, burst: 2, cap: 6, group: "gore", send: 0.06, vary: 0.12, make: v => { thud(v, 0, 0.9, 80); wet(v, 0.005, 0.5, 700, 0.15) } },
  blood_drip: { bus: "sfx", g: 0.09, pri: 0, ref: 1.5, max: 8, gap: 0.08, cap: 3, group: "gore", send: 0.15, vary: 0.15, make: v => {
    v.tone({ f: 1100, f2: 1900, gl: 0.03, a: 0.001, d: 0.06, g: 0.5 }); v.noise({ ft: "bandpass", f: 2500, q: 2, a: 0.0006, d: 0.015, g: 0.25 }) } },
  // ---- infected (positional; shared "inf" budget keeps the nearest voices of a horde)
  zombie_groan: { ...INF, g: 0.44, pri: 1, ref: 4, roll: 1.1, max: 45, cap: 4, gap: 0.3, make: v => {
    const d = 0.7 + v.rnd(0.6)
    throat(v, { f: 92 * v.j(0.1), f2: 72, a: 0.3, h: d * 0.5, d, g: 0.8, f1: 420 * v.j(0.1), f1b: 360, f2f: 850, f2b: 760, q: 3.5, growl: 9, gd: 0.4, breath: 0.35, drive: 2 }) } },
  zombie_alert: { ...INF, g: 0.38, pri: 2, ref: 5, max: 60, cap: 3, gap: 0.25, make: v => {
    throat(v, { f: 150 * v.j(0.08), f2: 230, gl: 0.15, a: 0.02, h: 0.25, d: 0.4, g: 0.9, f1: 760, f1b: 900, f2f: 1350, f2b: 1600, q: 3, growl: 33, gd: 0.75, breath: 0.8, drive: 3 })
    v.noise({ ft: "bandpass", f: 2400, f2: 1500, q: 1, a: 0.02, h: 0.15, d: 0.3, g: 0.25 }) } },
  zombie_scream: { bus: "sfx", g: 0.45, pri: 3, ref: 20, roll: 0.7, max: 450, cap: 2, gap: 0.5, gun: true, send: 0.6, vary: 0.04, make: v => {
    throat(v, { f: 620 * v.j(0.06), f2: 980, gl: 0.45, a: 0.06, h: 0.9, d: 0.7, g: 0.8, f1: 1100, f1b: 1300, f2f: 2600, f2b: 3000, q: 3, growl: 55, gd: 0.3, breath: 0.6, drive: 3 })
    v.tone({ w: "sawtooth", f: 930, f2: 1470, gl: 0.45, a: 0.08, h: 0.8, d: 0.6, g: 0.12, ft: "bandpass", ff: 3200, q: 2, vib: 7, vibd: 25 }) } },
  zombie_attack: { ...INF, g: 0.43, pri: 2, ref: 4, max: 40, cap: 4, gap: 0.15, make: v => {
    throat(v, { f: 125 * v.j(0.08), f2: 190, gl: 0.1, a: 0.015, h: 0.12, d: 0.32, g: 0.9, f1: 640, f1b: 720, f2f: 1150, f2b: 1300, q: 3, growl: 38, gd: 0.8, breath: 0.9, drive: 3 })
    v.noise({ c: "p", ft: "bandpass", f: 600, f2: 1800, sw: 0.12, q: 1.4, at: 0.05, a: 0.06, d: 0.15, g: 0.35 }) } },
  zombie_spit: { ...INF, g: 0.55, pri: 2, ref: 4, max: 50, cap: 3, gap: 0.3, make: v => {
    throat(v, { f: 110 * v.j(0.08), f2: 95, a: 0.05, h: 0.2, d: 0.25, g: 0.7, f1: 380, f2f: 880, q: 3, growl: 17, gd: 0.95, breath: 0.6, drive: 2 })
    v.noise({ ft: "bandpass", f: 2200, f2: 800, sw: 0.1, q: 1.6, at: 0.42, a: 0.003, d: 0.16, g: 0.8, drive: 1 })
    v.crackle({ c: "p", ft: "bandpass", f: 1500, q: 1.2, n: 7, at: 0.44, span: 0.2, gl: 0.015, g: 0.45 }) } },
  zombie_pain: { ...INF, g: 0.5, pri: 1, ref: 4, max: 40, cap: 4, gap: 0.15, make: v => {
    throat(v, { f: 210 * v.j(0.1), f2: 140, gl: 0.12, a: 0.008, h: 0.05, d: 0.22, g: 0.9, f1: 620, f2f: 1250, q: 3, growl: 28, gd: 0.5, breath: 0.5, drive: 2 }) } },
  zombie_death: { ...INF, g: 0.42, pri: 1, ref: 4, max: 50, cap: 4, gap: 0.15, make: v => {
    throat(v, { f: 150 * v.j(0.08), f2: 68, gl: 0.8, a: 0.02, h: 0.3, d: 0.75, g: 0.85, f1: 560, f1b: 340, f2f: 1100, f2b: 700, q: 3, growl: 13, gd: 0.9, breath: 0.8, drive: 2 })
    thud(v, 0.8, 0.8, 85); v.crackle({ c: "p", ft: "bandpass", f: 1400, q: 0.9, n: 6, at: 0.8, span: 0.15, gl: 0.02, g: 0.35 }) } },
  zombie_crawl: { ...INF, g: 0.5, pri: 0, ref: 3, max: 30, cap: 3, gap: 0.4, make: v => {
    v.noise({ c: "p", ft: "bandpass", f: 650 * v.j(0.15), q: 1.2, a: 0.15, h: 0.6, d: 0.4, g: 0.8, am: 1.8, amd: 0.9 })
    v.crackle({ ft: "bandpass", f: 2600, q: 1.5, n: 14, span: 1, gl: 0.012, g: 0.3 })
    throat(v, { at: 0.25, f: 85 * v.j(0.1), f2: 70, a: 0.25, h: 0.3, d: 0.5, g: 0.35, f1: 400, f2f: 800, q: 3, growl: 10, gd: 0.5, breath: 0.4, drive: 1 }) } },
  boss_roar: { bus: "sfx", g: 0.7, pri: 3, ref: 25, roll: 0.6, max: 500, cap: 1, gap: 1, gun: true, send: 0.7, vary: 0.03, make: v => {
    const e = { a: 0.15, h: 1.1, d: 1.2 }
    throat(v, { ...e, f: 68, f2: 52, f1: 480, f1b: 400, f2f: 950, f2b: 820, q: 2.5, growl: 23, gd: 0.8, breath: 0.9, drive: 3, g: 0.8 })
    throat(v, { ...e, f: 103, f2: 82, f1: 620, f2f: 1250, q: 2.5, growl: 27, gd: 0.7, breath: 0.5, drive: 3, g: 0.5 })
    v.tone({ ...e, f: 42, f2: 34, g: 0.6, rv: false }); v.noise({ c: "p", ft: "bandpass", f: 650, q: 0.6, ...e, g: 0.5, drive: 2 }) } },
  acid_sizzle: { bus: "sfx", g: 0.6, pri: 0, ref: 3, max: 30, cap: 3, gap: 0.4, send: 0.1, make: v => {
    v.noise({ ft: "bandpass", f: 4500, q: 0.9, a: 0.08, h: 1.4, d: 0.5, g: 0.35, am: 6.5, amd: 0.4 })
    v.crackle({ ft: "highpass", f: 3000, n: 60, span: 1.9, gl: 0.006, g: 0.5 })
    v.crackle({ c: "p", ft: "bandpass", f: 900, q: 1.4, n: 14, span: 1.8, gl: 0.03, g: 0.3 }) } },
  // ---- fire
  molotov_break: { bus: "sfx", g: 0.55, pri: 2, ref: 5, max: 90, gap: 0.1, send: 0.35, make: v => {
    v.noise({ ft: "highpass", f: 3500, a: 0.0005, d: 0.06, g: 0.9, drive: 1 }); v.crackle({ ft: "highpass", f: 4000, n: 24, span: 0.3, gl: 0.012, g: 0.6 })
    for (let i = 0; i < 5; i++) v.metal({ f: 3800 * v.j(0.25), p: [1, 1.52], at: 0.02 + v.rnd(0.25), d: 0.15, g: 0.05 })
    v.noise({ c: "b", ft: "lowpass", f: 250, f2: 1400, sw: 0.18, q: 1.1, at: 0.06, a: 0.12, d: 0.9, g: 1.2, drive: 1 })
    v.tone({ f: 55, f2: 80, gl: 0.2, at: 0.06, a: 0.1, d: 0.6, g: 0.5, rv: false }) } },
  fire_burn: { bus: "sfx", g: 0.45, pri: 0, ref: 3, max: 45, gap: 0.6, cap: 3, send: 0.1, vary: 0.05, make: v => {
    v.noise({ c: "b", ft: "lowpass", f: 520, q: 0.7, a: 0.4, h: 1.8, d: 0.9, g: 0.9, am: 0.7, amd: 0.4 })
    v.crackle({ ft: "bandpass", f: 2600, q: 1.2, n: 46, span: 3, gl: 0.007, g: 0.55 })
    v.crackle({ c: "p", ft: "lowpass", f: 1200, n: 12, at: 0.2, span: 2.6, gl: 0.03, g: 0.5 }) } },
  // ---- survival / base
  eat: { bus: "ui", g: 1.2, pri: 1, gap: 0.5, make: v => {
    v.crackle({ c: "p", ft: "bandpass", f: 2400, q: 1, n: 8, span: 0.15, gl: 0.02, g: 0.4 })
    for (const at of [0.25, 0.6, 0.95]) { v.crackle({ ft: "bandpass", f: 1800 * v.j(0.15), q: 1.3, n: 6, at, span: 0.12, gl: 0.012, g: 0.55 }); v.noise({ c: "p", ft: "lowpass", f: 700, at, a: 0.01, d: 0.12, g: 0.4 }) } } },
  drink: { bus: "ui", g: 0.63, pri: 1, gap: 0.5, make: v => {
    v.noise({ ft: "bandpass", f: 2600, q: 3, a: 0.0006, d: 0.02, g: 0.5 })
    for (const at of [0.2, 0.55, 0.9]) { v.tone({ f: 330 * v.j(0.08), f2: 190, gl: 0.08, at, a: 0.008, d: 0.12, g: 0.45 }); v.noise({ c: "p", ft: "bandpass", f: 650, f2: 300, q: 2, at, a: 0.01, d: 0.14, g: 0.5 }) }
    v.noise({ c: "p", ft: "bandpass", f: 1400, q: 0.8, at: 1.2, a: 0.05, d: 0.3, g: 0.2 }) } },
  bandage: { bus: "ui", g: 0.63, pri: 1, gap: 0.4, make: v => {
    v.crackle({ ft: "bandpass", f: 2700, q: 0.9, n: 30, span: 0.36, gl: 0.013, g: 0.75 }); v.noise({ ft: "bandpass", f: 1900, f2: 3300, q: 1.2, a: 0.02, h: 0.26, d: 0.1, g: 0.2 })
    v.crackle({ ft: "bandpass", f: 2300, q: 0.9, n: 20, at: 0.55, span: 0.24, gl: 0.013, g: 0.6 })
    v.noise({ c: "p", ft: "bandpass", f: 1500, q: 0.7, at: 0.85, a: 0.1, h: 0.25, d: 0.25, g: 0.25, am: 3, amd: 0.6 }) } },
  syringe: { bus: "ui", g: 0.6, pri: 1, gap: 0.4, make: v => {
    v.noise({ ft: "bandpass", f: 3000, q: 3, a: 0.0006, d: 0.02, g: 0.6 })
    v.noise({ ft: "bandpass", f: 3800, q: 4, at: 0.25, a: 0.0006, d: 0.015, g: 0.8 }); v.tone({ w: "triangle", f: 2600, at: 0.25, d: 0.04, g: 0.06 })
    v.noise({ ft: "highpass", f: 3500, f2: 5500, sw: 0.4, at: 0.27, a: 0.06, h: 0.25, d: 0.15, g: 0.35 })
    v.tone({ f: 520, f2: 780, gl: 0.4, at: 0.3, a: 0.1, h: 0.15, d: 0.4, g: 0.08 }) } },
  zipper: { bus: "ui", g: 0.8, pri: 1, gap: 0.3, make: v => {
    v.crackle({ ft: "bandpass", f: 3200, q: 1.2, n: 40, span: 0.42, gl: 0.005, g: 0.7 }); v.noise({ ft: "bandpass", f: 2400, f2: 4200, q: 1.5, a: 0.03, h: 0.3, d: 0.1, g: 0.12 }) } },
  item_drop: { bus: "sfx", g: 0.37, pri: 1, ref: 3, max: 25, gap: 0.08, burst: 2, send: 0.08, vary: 0.08, make: v => {
    thud(v, 0, 0.7, 140); v.crackle({ ft: "bandpass", f: 2800, q: 1.4, n: 5, at: 0.01, span: 0.12, gl: 0.012, g: 0.4 }) } },
  loot_take: { bus: "ui", g: 1.6, pri: 1, gap: 0.05, make: v => {
    v.crackle({ c: "p", ft: "bandpass", f: 2000, q: 0.9, n: 7, span: 0.1, gl: 0.02, g: 0.55 })
    v.noise({ c: "p", ft: "lowpass", f: 600, at: 0.09, a: 0.004, d: 0.1, g: 0.6 }); v.tone({ f: 880, at: 0.1, a: 0.003, d: 0.1, g: 0.08 }) } },
  airdrop_plane: { bus: "sfx", g: 0.6, pri: 1, ref: 80, roll: 0.6, max: 2500, cap: 1, gap: 2, send: 0.5, make: v => {
    const e = { a: 2.4, h: 1.2, d: 2.6 }
    v.tone({ w: "sawtooth", f: 84, f2: 74, gl: 6, ...e, g: 0.3, ft: "lowpass", ff: 520, q: 1.2, am: 31, amd: 0.55 })
    v.tone({ w: "sawtooth", f: 126, f2: 111, gl: 6, ...e, g: 0.14, ft: "lowpass", ff: 700, q: 1, am: 31, amd: 0.5 })
    v.noise({ c: "b", ft: "lowpass", f: 380, q: 0.7, ...e, g: 0.6 }) } },
  airdrop_land: { bus: "sfx", g: 0.6, pri: 2, ref: 8, roll: 0.8, max: 250, gap: 0.5, gun: true, send: 0.4, make: v => {
    v.tone({ f: 70, f2: 34, gl: 0.2, a: 0.002, d: 0.6, g: 1.1, rv: false }); v.noise({ c: "b", ft: "lowpass", f: 500, a: 0.003, d: 0.5, g: 1.1, drive: 1 })
    v.metal({ f: 310 * v.j(0.05), p: [1, 2.3, 3.6, 5.1], at: 0.005, d: 0.45, g: 0.12 })
    v.crackle({ c: "p", ft: "bandpass", f: 1800, q: 0.9, n: 14, at: 0.05, span: 0.6, gl: 0.025, g: 0.3 }) } },
  door: { bus: "sfx", g: 1.4, pri: 1, ref: 3, max: 30, gap: 0.3, send: 0.2, vary: 0.06, make: v => {
    v.noise({ ft: "bandpass", f: 2600, q: 3, a: 0.0006, d: 0.025, g: 0.3 })
    v.tone({ w: "sawtooth", f: 160 * v.j(0.1), f2: 115, gl: 0.7, at: 0.06, a: 0.08, h: 0.4, d: 0.3, g: 0.2, ft: "bandpass", ff: 1100, ff2: 800, q: 6, vib: 17, vibd: 18 })
    v.tone({ w: "sawtooth", f: 320 * v.j(0.1), f2: 250, gl: 0.7, at: 0.1, a: 0.08, h: 0.3, d: 0.3, g: 0.06, ft: "bandpass", ff: 2000, q: 7, vib: 13, vibd: 25 }) } },
  base_alarm: { bus: "sfx", g: 0.85, pri: 3, gap: 3, cap: 1, send: 0.45, make: v => {
    v.tone({ w: "sawtooth", f: 700, a: 0.3, h: 3.4, d: 0.6, g: 0.3, ft: "bandpass", ff: 1300, q: 0.9, vib: 0.5, vibd: 230, drive: 1 })
    v.tone({ w: "square", f: 350, a: 0.3, h: 3.4, d: 0.6, g: 0.12, ft: "lowpass", ff: 1200, vib: 0.5, vibd: 115 }) } },
  wave_start: { bus: "music", g: 0.55, pri: 3, gap: 2, make: v => {
    v.noise({ c: "p", ft: "bandpass", f: 300, f2: 2400, sw: 0.9, q: 0.8, a: 0.9, d: 0.25, g: 0.5 })
    const e = { at: 0.9, a: 0.01, h: 0.5, d: 1.6 }
    v.tone({ ...e, w: "sawtooth", f: 55, g: 0.3, ft: "lowpass", ff: 2000, ff2: 300, q: 2.5 })
    v.tone({ ...e, w: "sawtooth", f: 58.27, g: 0.25, ft: "lowpass", ff: 2000, ff2: 300, q: 2.5 })
    v.tone({ ...e, w: "sawtooth", f: 82.4, g: 0.18, ft: "lowpass", ff: 1600, ff2: 300, q: 2 })
    v.tone({ ...e, f: 48, f2: 30, gl: 0.6, g: 0.8, rv: false })
    v.tone({ ...e, w: "triangle", f: 1244.5, a: 0.05, g: 0.06, am: 13, amd: 0.8 }); v.tone({ ...e, w: "triangle", f: 1318.5, a: 0.05, g: 0.05, am: 15, amd: 0.8 }) } },
  build_complete: { bus: "ui", g: 0.8, pri: 2, gap: 0.3, make: v => {
    clank(v, 0, 540, 0.15, 0.3); clank(v, 0.16, 500, 0.15, 0.3)
    v.tone({ w: "triangle", f: 1046.5, at: 0.34, a: 0.003, h: 0.05, d: 0.5, g: 0.2 }); v.tone({ w: "triangle", f: 1568, at: 0.42, a: 0.003, h: 0.08, d: 0.7, g: 0.2 })
    v.tone({ f: 2093, at: 0.42, a: 0.003, d: 0.4, g: 0.05 }) } },
  step_grass: { ...STEP, g: 0.65, make: v => {
    v.crackle({ ft: "highpass", f: 2600, n: 6, span: 0.08, gl: 0.012, g: 0.5 }); v.noise({ c: "p", ft: "bandpass", f: 2200, q: 0.8, a: 0.008, d: 0.09, g: 0.35 })
    v.noise({ c: "b", ft: "lowpass", f: 380, a: 0.006, d: 0.1, g: 0.6 }) } },
}
/** Every SfxId (for dev tools and tests). */
export const SFX_IDS = Object.keys(DEFS) as SfxId[]

// ------------------------------------------------------------------ internal one-shots (tension, heartbeat, tinnitus, ambience events)
const RING: Def = { bus: "ui", g: 0.06, pri: 3, gap: 0.3, make: v => { v.tone({ f: 3650, a: 0.01, h: 0.25, d: 2.4, g: 1, rv: false }); v.tone({ f: 3687, a: 0.01, h: 0.2, d: 2, g: 0.5, rv: false }) } }
const TENSION: Def = { bus: "music", g: 0.28, pri: 2, gap: 0.05, cap: 3, make: v => {
  v.tone({ f: 58, f2: 42, gl: 0.12, a: 0.006, d: 0.32, g: 1, rv: false })
  v.tone({ w: "sawtooth", f: 55, a: 0.008, d: 0.22, g: 0.25, ft: "lowpass", ff: 420, ff2: 120, q: 4, rv: false }) } }
const TICK: Def = { bus: "music", g: 0.14, pri: 1, gap: 0.05, cap: 3, make: v => { v.noise({ ft: "highpass", f: 7500, a: 0.001, d: 0.04, g: 0.35, rv: false }) } }
const HEART: Def = { bus: "music", g: 0.5, pri: 3, gap: 0.2, cap: 3, make: v => {
  v.tone({ f: 62, f2: 42, gl: 0.1, a: 0.004, d: 0.2, g: 1, rv: false }); v.noise({ c: "b", ft: "lowpass", f: 160, a: 0.004, d: 0.16, g: 0.7, rv: false })
  v.tone({ f: 56, f2: 40, gl: 0.1, at: 0.19, a: 0.004, d: 0.18, g: 0.7, rv: false }); v.noise({ c: "b", ft: "lowpass", f: 140, at: 0.19, d: 0.14, g: 0.5, rv: false }) } }

const AMB = { bus: "amb" as Bus, pri: 0, max: 2000, gap: 0.2, cap: 3 }
const AMB_EV = {
  clank: { ...AMB, g: 0.45, ref: 25, send: 0.7, make: (v: V) => clank(v, 0, 210 * v.j(0.25), 0.25, 2.2) },
  dog: { ...AMB, g: 0.5, ref: 20, send: 0.6, make: (v: V) => {
    const n = 2 + Math.floor(v.rnd(2))
    for (let i = 0; i < n; i++) {
      const at = i * (0.32 + v.rnd(0.12))
      v.tone({ w: "sawtooth", f: 560 * v.j(0.06), f2: 340, gl: 0.1, at, a: 0.01, h: 0.03, d: 0.14, g: 0.4, ft: "bandpass", ff: 1100, q: 2.2 })
      v.noise({ ft: "bandpass", f: 1500, q: 1.5, at, a: 0.01, h: 0.02, d: 0.1, g: 0.25 })
    } } },
  gust: { ...AMB, g: 0.5, ref: 30, send: 0.05, make: (v: V) => v.noise({ c: "p", ft: "bandpass", f: 360 * v.j(0.2), f2: 800, sw: 2, q: 0.9, a: 1.4, h: 0.7, d: 2.2, g: 0.9 }) },
  rumble: { ...AMB, g: 0.5, ref: 150, send: 0.3, make: (v: V) => v.noise({ c: "b", ft: "lowpass", f: 180, a: 2.5, h: 2, d: 3.5, g: 1 }) },
  horn: { ...AMB, g: 0.55, ref: 200, send: 0.9, make: (v: V) => {
    const e = { a: 0.45, h: 2.6 + v.rnd(1.2), d: 1.6 }
    v.tone({ w: "sawtooth", f: 73.4, ...e, g: 0.5, ft: "lowpass", ff: 480, q: 1.6, vib: 4.2, vibd: 0.35 })
    v.tone({ w: "sawtooth", f: 110.2, ...e, g: 0.3, ft: "lowpass", ff: 560, q: 1.6, vib: 4.2, vibd: 0.5 })
    v.tone({ w: "square", f: 36.7, ...e, g: 0.2, ft: "lowpass", ff: 160 }) } },
  creak: { ...AMB, g: 0.4, ref: 15, send: 0.5, make: (v: V) => {
    v.tone({ w: "sawtooth", f: 70 * v.j(0.15), f2: 96, gl: 1.3, a: 0.35, h: 0.7, d: 0.6, g: 0.35, ft: "bandpass", ff: 640, q: 7, vib: 9, vibd: 6 })
    v.tone({ w: "sawtooth", f: 140, f2: 180, gl: 1.3, a: 0.4, h: 0.5, d: 0.5, g: 0.12, ft: "bandpass", ff: 1300, q: 8, vib: 7, vibd: 8 }) } },
  gull: { ...AMB, g: 0.4, ref: 25, send: 0.5, make: (v: V) => {
    const n = 2 + Math.floor(v.rnd(3))
    for (let i = 0; i < n; i++) {
      const at = i * (0.28 + v.rnd(0.15))
      v.tone({ f: 1400 * v.j(0.08), f2: 2250, gl: 0.07, at, a: 0.01, h: 0.04, d: 0.08, g: 0.2, vib: 28, vibd: 30 })
      v.tone({ f: 2200 * v.j(0.05), f2: 1450, gl: 0.2, at: at + 0.08, a: 0.01, h: 0.06, d: 0.18, g: 0.18 })
    } } },
  slosh: { ...AMB, g: 0.45, ref: 6, send: 0.15, make: (v: V) => {
    v.noise({ c: "b", ft: "bandpass", f: 380 * v.j(0.2), f2: 240, q: 1.1, a: 0.18, h: 0.1, d: 0.7, g: 1 })
    v.crackle({ c: "p", ft: "bandpass", f: 1500, q: 1, n: 8, at: 0.1, span: 0.55, gl: 0.05, g: 0.3 }) } },
  chatter: { ...AMB, g: 0.5, ref: 15, send: 0.6, make: (v: V) => { const len = 1.4 + v.rnd(1.2); squelch(v, 0, 0.7); chatter(v, 0.12, len, 0.5); squelch(v, 0.14 + len, 0.6) } },
  flicker: { ...AMB, g: 0.35, ref: 10, send: 0.1, make: (v: V) => v.tone({ w: "sawtooth", f: 100, a: 0.02, h: 0.15 + v.rnd(0.4), d: 0.1, g: 0.2, ft: "bandpass", ff: 1600, q: 0.9, am: 23, amd: 0.95, amw: "square" }) },
  bell: { ...AMB, g: 0.3, ref: 6, send: 0.8, make: (v: V) => {
    const f = [587.33, 698.46, 880, 1174.7, 1046.5][Math.floor(v.rnd(5))]
    v.tone({ f, a: 0.004, d: 3.2, g: 0.25 }); v.tone({ f: f * 2.76, a: 0.004, d: 1.2, g: 0.05 }); v.tone({ f: f * 1.003, a: 0.004, d: 3, g: 0.15 }) } },
  workshop: { ...AMB, g: 0.4, ref: 12, send: 0.5, make: (v: V) => { const n = 2 + Math.floor(v.rnd(3)), f = 560 * v.j(0.15); for (let i = 0; i < n; i++) clank(v, i * (0.32 + v.rnd(0.1)), f * v.j(0.03), 0.14, 0.3) } },
  bird: { ...AMB, g: 0.3, ref: 15, send: 0.3, make: (v: V) => {
    const n = 2 + Math.floor(v.rnd(4)), base = 2600 + v.rnd(2200), kind = v.rnd(), trill = kind < 0.3
    for (let i = 0; i < n; i++) {
      const at = i * (0.09 + v.rnd(0.12))
      v.tone({ f: base * v.j(0.1), f2: base * (kind < 0.6 ? 1.35 : 0.75), gl: 0.06, at, a: 0.005, h: 0.02, d: 0.07, g: 0.25, ...(trill ? { vib: 40, vibd: 120 } : {}) })
    } } },
  crow: { ...AMB, g: 0.45, ref: 30, send: 0.6, make: (v: V) => {
    const n = 2 + Math.floor(v.rnd(2))
    for (let i = 0; i < n; i++) { const at = i * (0.42 + v.rnd(0.15)); v.tone({ w: "sawtooth", f: 560 * v.j(0.05), f2: 430, gl: 0.2, at, a: 0.015, h: 0.08, d: 0.18, g: 0.35, ft: "bandpass", ff: 1300, q: 2.5, am: 32, amd: 0.6 }) } } },
  drip: { ...AMB, g: 0.18, ref: 4, send: 0.5, make: (v: V) => { v.tone({ f: 1200 * v.j(0.25), f2: 2100, gl: 0.03, a: 0.001, d: 0.08, g: 0.5 }) } },
} satisfies Record<string, Def>
type AmbEvent = keyof typeof AMB_EV

// ------------------------------------------------------------------ ambience beds
interface Clock { after(ms: number, fn: () => void): number; cancel(id: number): void }
const CHORDS = [
  [146.83, 220, 329.63, 349.23], // Dm(add9)
  [116.54, 174.61, 220, 293.66], // Bbmaj7
  [98, 146.83, 233.08, 440], // Gm9
  [110, 164.81, 293.66, 392], // A7sus4
]

/** One looping background bed: continuous filtered-noise/oscillator layers with slow LFOs plus timer-scheduled events. */
class Bed {
  readonly out: GainNode
  alive = true
  /** Timer that frees this bed after its fade-out (owned by AudioSystem). */
  cleanup = 0
  private readonly srcs = new Set<AudioScheduledSourceNode>()
  private readonly nodes: AudioNode[] = []
  private readonly timers = new Set<number>()
  private chordIx = 0

  /** sim: simulated clock time for offline renders (events are scheduled at that time instead of "now"). */
  constructor(readonly e: Engine, readonly theme: Amb, private readonly clock: Clock | null, private readonly quiet: () => boolean, private readonly sim: (() => number) | null = null) {
    this.out = e.ctx.createGain(); this.out.gain.value = 0; this.out.connect(e.bus.amb)
  }
  private get now(): number { return this.sim ? this.sim() : this.e.ctx.currentTime }
  start(fade: number): void {
    const p = this.out.gain, t = this.now
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(1, t + Math.max(0.02, fade))
    const build = (BEDS as Record<string, ((b: Bed) => void) | undefined>)[this.theme] ?? BEDS.dusk
    build(this)
  }
  stop(fade: number): void {
    if (!this.alive) return
    this.alive = false
    for (const id of this.timers) this.clock?.cancel(id)
    this.timers.clear()
    try { const p = this.out.gain, t = this.now; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(0, t + Math.max(0.02, fade)) } catch { /* ignore */ }
  }
  kill(): void {
    this.stop(0.02)
    for (const s of this.srcs) try { s.stop() } catch { /* ignore */ }
    this.srcs.clear()
    for (const n of this.nodes) try { n.disconnect() } catch { /* ignore */ }
    this.nodes.length = 0
    try { this.out.disconnect() } catch { /* ignore */ }
  }
  private place(n: AudioNode, pan: number): void {
    const c = this.e.ctx
    if (pan && typeof c.createStereoPanner === "function") { const p = c.createStereoPanner(); p.pan.value = pan; n.connect(p); p.connect(this.out); this.nodes.push(p) } else n.connect(this.out)
  }
  private source(s: AudioScheduledSourceNode): void { s.start(this.now); this.srcs.add(s); this.nodes.push(s) }
  /** Looping filtered noise layer. */
  noise(col: Color, ft: BiquadFilterType, f: number, q: number, g: number, pr = 1, pan = 0): { f: BiquadFilterNode; g: GainNode } {
    const c = this.e.ctx, src = c.createBufferSource(), fl = c.createBiquadFilter(), gn = c.createGain()
    src.buffer = this.e.bank[col]; src.loop = true; src.loopStart = 0; src.playbackRate.value = pr
    fl.type = ft; fl.frequency.value = this.e.hz(f); fl.Q.value = q; gn.gain.value = g
    src.connect(fl); fl.connect(gn); this.place(gn, pan); this.nodes.push(fl, gn)
    src.start(this.now, this.e.rnd() * 2.5); this.srcs.add(src); this.nodes.push(src)
    return { f: fl, g: gn }
  }
  osc(type: OscillatorType, f: number, g: number, lp: number): GainNode {
    const c = this.e.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), gn = c.createGain()
    o.type = type; o.frequency.value = f; fl.type = "lowpass"; fl.frequency.value = this.e.hz(lp); gn.gain.value = g
    o.connect(fl); fl.connect(gn); gn.connect(this.out); this.nodes.push(fl, gn); this.source(o)
    return gn
  }
  loopBuffer(buf: AudioBuffer, g: number, pr: number, pan: number): GainNode {
    const c = this.e.ctx, src = c.createBufferSource(), gn = c.createGain()
    src.buffer = buf; src.loop = true; src.playbackRate.value = pr; gn.gain.value = g
    src.connect(gn); this.place(gn, pan); this.nodes.push(gn)
    src.start(this.now, this.e.rnd() * buf.duration); this.srcs.add(src); this.nodes.push(src)
    return gn
  }
  lfo(p: AudioParam, rate: number, depth: number): void {
    const c = this.e.ctx, o = c.createOscillator(), d = c.createGain(); o.frequency.value = rate; d.gain.value = depth
    o.connect(d); d.connect(p); this.nodes.push(d); this.source(o)
  }
  send(amount: number): void { const g = this.e.ctx.createGain(); g.gain.value = amount; this.out.connect(g); g.connect(this.e.rev); this.nodes.push(g) }
  /** Repeats fn every min..max seconds (first after `first` s); skipped while hidden/suspended, one pending timer per event. */
  every(min: number, max: number, first: number, fn: () => void): void {
    const clock = this.clock; if (!clock) return
    const arm = (sec: number): void => {
      const id = clock.after(sec * 1000, () => { this.timers.delete(id); if (!this.alive) return; if (!this.quiet()) fn(); arm(min + this.e.rnd() * (max - min)) })
      this.timers.add(id)
    }
    arm(first)
  }
  /** Positional event at a random bearing rMin..rMax metres from the listener, routed through this bed. */
  ev(name: AmbEvent, rMin: number, rMax: number, vol = 1): void {
    if (!this.alive) return
    const L = this.e.listener, a = this.e.rnd() * Math.PI * 2, r = rMin + this.e.rnd() * (rMax - rMin)
    this.e.spawn("amb_" + name, AMB_EV[name], { position: { x: L.x + Math.cos(a) * r, y: L.y + 1.5, z: L.z + Math.sin(a) * r }, volume: vol }, this.sim ? this.sim() : undefined, this.out)
  }
  /** Menu pad: detuned saw chord through a slowly breathing low-pass, 11 s with 3 s crossfades. */
  chord(): void {
    if (!this.alive) return
    const c = this.e.ctx, t = this.now + 0.02, len = 11, notes = CHORDS[this.chordIx++ % CHORDS.length]
    const f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), ld = c.createGain()
    f.type = "lowpass"; f.frequency.value = 600; f.Q.value = 0.8; lfo.frequency.value = 0.07; ld.gain.value = 240
    g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 3); g.gain.setValueAtTime(0.05, t + len - 3.5); g.gain.linearRampToValueAtTime(0, t + len)
    lfo.connect(ld); ld.connect(f.frequency); f.connect(g); g.connect(this.out)
    const own: AudioNode[] = [f, g, lfo, ld], srcs: AudioScheduledSourceNode[] = [lfo]
    for (const n of notes) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = n; o.detune.value = det; o.connect(f); srcs.push(o); own.push(o) }
    for (const s of srcs) { s.start(t); s.stop(t + len); this.srcs.add(s) }
    lfo.onended = () => { for (const s of srcs) this.srcs.delete(s); for (const n of own) try { n.disconnect() } catch { /* ignore */ } }
  }
}

const BEDS: Record<KnownAmb, (b: Bed) => void> = {
  // industrial area at sunset: gusty wind, far traffic rumble, factory hum; metal clanks, a dog, gusts
  dusk: b => {
    const w = b.noise("p", "bandpass", 430, 0.55, 0.4); b.lfo(w.f.frequency, 0.063, 170); b.lfo(w.g.gain, 0.11, 0.18); b.lfo(w.g.gain, 0.037, 0.2)
    const wh = b.noise("w", "bandpass", 1350, 5, 0.03, 1, -0.3); b.lfo(wh.f.frequency, 0.05, 280); b.lfo(wh.g.gain, 0.08, 0.02)
    b.noise("b", "lowpass", 140, 0.7, 0.35, 0.9)
    const h = b.osc("sawtooth", 49, 0.04, 170); b.osc("sawtooth", 49.4, 0.035, 170); b.osc("sine", 98, 0.015, 400); b.lfo(h.gain, 0.05, 0.015)
    b.every(8, 18, 3, () => b.ev("gust", 20, 40)); b.every(6, 15, 2, () => b.ev("clank", 50, 160))
    b.every(20, 48, 12, () => b.ev("dog", 90, 220)); b.every(30, 70, 20, () => b.ev("rumble", 300, 500))
  },
  // container port at blue hour: wind with container whistle, lapping water; horns, creaking steel, gulls
  harbor: b => {
    const w = b.noise("p", "bandpass", 540, 0.6, 0.5); b.lfo(w.f.frequency, 0.07, 190); b.lfo(w.g.gain, 0.13, 0.2); b.lfo(w.g.gain, 0.041, 0.2)
    const wh = b.noise("w", "bandpass", 1750, 7, 0.035, 1, 0.4); b.lfo(wh.f.frequency, 0.06, 350); b.lfo(wh.g.gain, 0.09, 0.03)
    const wa = b.noise("b", "lowpass", 460, 0.5, 0.45, 1, -0.2); b.lfo(wa.g.gain, 0.31, 0.2); b.lfo(wa.g.gain, 0.47, 0.15)
    const fz = b.noise("w", "bandpass", 2600, 0.7, 0.015, 1, -0.3); b.lfo(fz.g.gain, 0.31, 0.012)
    b.osc("sawtooth", 60.5, 0.025, 150)
    b.every(1.5, 4, 0.5, () => b.ev("slosh", 6, 20)); b.every(40, 90, 8 + b.e.rnd() * 17, () => b.ev("horn", 350, 700))
    b.every(8, 20, 5, () => b.ev("creak", 15, 60)); b.every(25, 60, 15, () => b.ev("gull", 40, 120)); b.every(15, 35, 9, () => b.ev("clank", 40, 140))
  },
  // military compound at 2 am: low wind, floodlight buzz, crickets; distant radio chatter, flicker, dog, clank
  night: b => {
    const w = b.noise("p", "lowpass", 320, 0.5, 0.4); b.lfo(w.g.gain, 0.07, 0.15); b.lfo(w.g.gain, 0.029, 0.12)
    b.osc("sawtooth", 100, 0.02, 1800); b.osc("square", 50, 0.015, 300)
    const sz = b.noise("w", "highpass", 6500, 0.7, 0.004); b.lfo(sz.g.gain, 100, 0.003)
    const c1 = b.loopBuffer(b.e.bank.crickets, 0.07, 1, -0.55), c2 = b.loopBuffer(b.e.bank.crickets, 0.05, 0.94, 0.6)
    b.lfo(c1.gain, 0.05, 0.04); b.lfo(c2.gain, 0.07, 0.03)
    b.every(25, 60, 10, () => b.ev("chatter", 40, 90)); b.every(10, 25, 6, () => b.ev("flicker", 15, 30))
    b.every(40, 80, 30, () => b.ev("dog", 150, 250)); b.every(30, 60, 18, () => b.ev("clank", 80, 200)); b.every(15, 30, 9, () => b.ev("gust", 20, 40, 0.6))
  },
  // forward base camp: generator chug, faint wind; radio chatter and workshop hammering
  base: b => {
    const w = b.noise("p", "bandpass", 380, 0.5, 0.3); b.lfo(w.g.gain, 0.06, 0.1); b.lfo(w.f.frequency, 0.05, 120)
    const gen = b.osc("sawtooth", 50, 0.05, 260); b.lfo(gen.gain, 8.3, 0.017); b.osc("square", 100, 0.016, 500)
    const body = b.noise("b", "lowpass", 160, 0.8, 0.35, 1, 0.3); b.lfo(body.g.gain, 8.3, 0.14)
    b.every(30, 70, 12, () => b.ev("chatter", 10, 25, 0.8)); b.every(10, 25, 5, () => b.ev("workshop", 15, 40)); b.every(25, 50, 18, () => b.ev("gust", 20, 40, 0.5))
  },
  // dawn in the zone: misty calm, soft air, dew drips, distant crows and a far dog
  dawn: b => {
    const w = b.noise("p", "lowpass", 300, 0.5, 0.3); b.lfo(w.g.gain, 0.05, 0.1)
    const air = b.noise("p", "bandpass", 900, 0.4, 0.05); b.lfo(air.g.gain, 0.04, 0.03)
    b.every(12, 30, 5, () => b.ev("crow", 80, 200)); b.every(3, 8, 1.5, () => b.ev("drip", 2, 8)); b.every(45, 90, 30, () => b.ev("dog", 180, 300))
  },
  // daytime: light wind, rustling leaves and birdsong
  day: b => {
    const w = b.noise("p", "bandpass", 620, 0.55, 0.55); b.lfo(w.f.frequency, 0.07, 180); b.lfo(w.g.gain, 0.12, 0.2)
    const leaves = b.noise("w", "bandpass", 3800, 0.8, 0.02); b.lfo(leaves.g.gain, 0.11, 0.015)
    b.every(2, 6, 0.8, () => b.ev("bird", 15, 60)); b.every(4, 10, 2, () => b.ev("bird", 30, 90, 0.7)); b.every(30, 60, 20, () => b.ev("crow", 120, 250, 0.7))
  },
  // tactical main menu: sub drone, airy noise, slow tense chord changes, sparse bell pings
  menu: b => {
    b.send(0.35)
    b.osc("sine", 73.42, 0.07, 300)
    const air = b.noise("p", "bandpass", 900, 0.4, 0.1); b.lfo(air.f.frequency, 0.04, 300); b.lfo(air.g.gain, 0.06, 0.05)
    b.chord(); b.every(8, 8, 8, () => b.chord()); b.every(6, 14, 4, () => b.ev("bell", 5, 8))
  },
}

// ------------------------------------------------------------------ tension layer + heartbeat
class Pulse {
  target = 0
  level = 0
  heart = 0
  private drone: { srcs: AudioScheduledSourceNode[]; nodes: AudioNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null
  private nextBeat = 0
  private step = 0
  private nextHeart = 0
  private last = -1
  constructor(private readonly e: Engine) {}
  /** Schedules everything due before `until`; returns whether the clock must keep ticking. */
  run(now: number, until: number): boolean {
    const dt = this.last < 0 ? 0 : clamp(now - this.last, 0, 0.5); this.last = now
    this.level += (this.target - this.level) * (1 - Math.exp(-dt / 1.1))
    if (this.target === 0 && this.level < 0.004) this.level = 0
    if (this.level > 0.002) {
      const d = this.drone ?? this.startDrone(now)
      d.gain.gain.setTargetAtTime(0.11 * this.level, now, 0.4); d.filter.frequency.setTargetAtTime(this.e.hz(140 + 700 * this.level), now, 0.5)
      const half = 30 / (84 + 44 * this.level)
      if (this.nextBeat < now) this.nextBeat = now + 0.02
      while (this.nextBeat < until) {
        if (this.step % 2 === 0) this.e.spawn("tension", TENSION, { volume: this.level * (this.step % 8 === 0 ? 1 : 0.7) }, this.nextBeat)
        else if (this.level > 0.5) this.e.spawn("tension_tick", TICK, { volume: (this.level - 0.5) * 2 }, this.nextBeat)
        this.step++; this.nextBeat += half
      }
    } else if (this.drone) this.stopDrone(now)
    if (this.heart > 0) {
      const period = 60 / (58 + 82 * this.heart)
      if (this.nextHeart < now) this.nextHeart = now + 0.02
      while (this.nextHeart < until) { this.e.spawn("heartbeat", HEART, { volume: 0.3 + 0.7 * this.heart, rate: 1 + this.heart * 0.25 }, this.nextHeart); this.nextHeart += period }
    }
    return this.level > 0 || this.target > 0 || this.heart > 0 || this.drone !== null
  }
  private startDrone(t: number): NonNullable<Pulse["drone"]> {
    const c = this.e.ctx, f = c.createBiquadFilter(), g = c.createGain(), srcs: AudioScheduledSourceNode[] = [], nodes: AudioNode[] = [f, g]
    f.type = "lowpass"; f.frequency.value = 140; f.Q.value = 1.2; g.gain.value = 0; f.connect(g); g.connect(this.e.bus.music)
    const parts: [OscillatorType, number, number][] = [["sawtooth", 55, 0.5], ["sawtooth", 55.4, 0.5], ["triangle", 82.41, 0.4]]
    for (const [type, fr, lv] of parts) { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = fr; og.gain.value = lv; o.connect(og); og.connect(f); srcs.push(o); nodes.push(o, og) }
    const lfo = c.createOscillator(), ld = c.createGain(); lfo.frequency.value = 0.13; ld.gain.value = 60; lfo.connect(ld); ld.connect(f.frequency); srcs.push(lfo); nodes.push(lfo, ld)
    for (const s of srcs) s.start(t)
    this.drone = { srcs, nodes, gain: g, filter: f }
    return this.drone
  }
  private stopDrone(t: number): void {
    const d = this.drone; if (!d) return
    this.drone = null
    try { d.gain.gain.cancelScheduledValues(t); d.gain.gain.setTargetAtTime(0, t, 0.1) } catch { /* ignore */ }
    for (const s of d.srcs) try { s.stop(t + 0.6) } catch { /* ignore */ }
    d.srcs[0].onended = () => { for (const n of d.nodes) try { n.disconnect() } catch { /* ignore */ } }
  }
  kill(): void {
    const d = this.drone; this.drone = null
    if (d) { for (const s of d.srcs) try { s.stop() } catch { /* ignore */ } for (const n of d.nodes) try { n.disconnect() } catch { /* ignore */ } }
  }
}

// ------------------------------------------------------------------ public system
export interface AudioStats {
  /** AudioContext state, "none" before the first gesture, "unavailable" without Web Audio. */
  state: string
  voices: number
  peakVoices: number
  stolen: number
  dropped: number
  /** Pending timers incl. the tension/heartbeat clock. */
  timers: number
  /** Ambience beds alive (current + fading). */
  beds: number
  ambience: Amb | null
  /** Active voices per sound id. */
  perId: Record<string, number>
}
const GESTURES = ["pointerdown", "keydown", "touchend"] as const
const noop = (): void => undefined

export class AudioSystem {
  private ctx: AudioContext | null = null
  private engine: Engine | null = null
  private disposed = false
  private failed = false
  muted = false
  volume = 0.55
  private listener = { x: 0, y: 0, z: 0, yaw: 0 }
  private ambience: Amb | null = null
  private bed: Bed | null = null
  private fading: Bed[] = []
  private pulse: Pulse | null = null
  private intensity = 0
  private heartbeat = 0
  private clockId = 0
  private suspendTimer = 0
  private readonly timers = new Set<number>()
  private readonly clock: Clock = { after: (ms, fn) => this.after(ms, fn), cancel: id => this.cancel(id) }
  private readonly unlock = (): void => { if (!this.disposed && !this.muted && this.ctx?.state !== "running") this.ensureCtx() }
  private readonly onVisibility = (): void => { if (!this.disposed && !this.muted && typeof document !== "undefined" && !document.hidden && this.ctx && this.ctx.state !== "running") this.resume() }

  constructor() {
    if (typeof window === "undefined") return
    for (const g of GESTURES) window.addEventListener(g, this.unlock, true)
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility)
  }
  private detach(): void {
    if (typeof window === "undefined") return
    for (const g of GESTURES) window.removeEventListener(g, this.unlock, true)
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try {
      this.detach()
      if (this.clockId) clearInterval(this.clockId); this.clockId = 0
      for (const id of this.timers) clearTimeout(id)
      this.timers.clear()
      this.bed?.kill(); this.bed = null
      for (const b of this.fading) b.kill()
      this.fading = []
      this.pulse?.kill(); this.pulse = null
      this.engine?.kill(); this.engine = null
      const ctx = this.ctx; this.ctx = null
      if (ctx && ctx.state !== "closed") void ctx.close().catch(noop)
    } catch { /* never throw from audio */ }
  }

  /** Live counters for dev tools and tests. */
  get stats(): AudioStats {
    const e = this.engine
    return {
      state: this.ctx ? this.ctx.state : this.failed ? "unavailable" : this.disposed ? "closed" : "none",
      voices: e?.voices.length ?? 0, peakVoices: e?.peak ?? 0, stolen: e?.stolen ?? 0, dropped: e?.dropped ?? 0,
      timers: this.timers.size + (this.clockId ? 1 : 0), beds: (this.bed ? 1 : 0) + this.fading.length, ambience: this.ambience,
      perId: Object.fromEntries((e?.voices ?? []).reduce((m, v) => m.set(v.key, (m.get(v.key) ?? 0) + 1), new Map<string, number>())),
    }
  }

  private after(ms: number, fn: () => void): number {
    const id = window.setTimeout(() => { this.timers.delete(id); if (!this.disposed) try { fn() } catch { /* ignore */ } }, ms)
    this.timers.add(id); return id
  }
  private cancel(id: number): void { clearTimeout(id); this.timers.delete(id) }
  private resume(): void { try { const ctx = this.ctx; if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(noop) } catch { /* ignore */ } }
  /** Nothing audible can happen: hidden tab, suspended or muted — ambience events are skipped (never queued). */
  private quiet(): boolean { return this.muted || !this.ctx || this.ctx.state !== "running" || (typeof document !== "undefined" && document.hidden) }
  private activated(): boolean {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
    return ua ? ua.hasBeenActive : true
  }

  private ensureCtx(): AudioContext | null {
    if (this.disposed || this.failed) return null
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) { this.failed = true; return null }
        this.ctx = new AC({ latencyHint: "interactive" })
        this.engine = new Engine(this.ctx, this.muted ? 0 : this.volume, Math.floor(Math.random() * 2 ** 31))
        const l = this.listener; this.engine.setListener(l, l.yaw)
        this.pulse = new Pulse(this.engine); this.pulse.target = this.intensity; this.pulse.heart = this.heartbeat
        if (this.ambience) this.startBed(this.ambience, 1.5)
        this.kick()
        if (this.muted) { void this.ctx.suspend().catch(noop); return this.ctx }
      } catch {
        this.failed = true
        const ctx = this.ctx; this.ctx = null; this.engine = null; this.pulse = null
        try { if (ctx) void ctx.close().catch(noop) } catch { /* ignore */ }
        return null
      }
    }
    if (this.ctx.state !== "running" && !this.muted) this.resume()
    return this.ctx
  }

  setVolume(value: number): void {
    this.volume = value
    this.applyGain()
  }
  setMuted(value: boolean): void {
    this.muted = value
    if (this.suspendTimer) { this.cancel(this.suspendTimer); this.suspendTimer = 0 }
    this.applyGain()
    if (!value && !this.ctx && !this.disposed && typeof window !== "undefined" && this.activated()) this.ensureCtx()
    const ctx = this.ctx; if (!ctx || this.disposed) return
    // muted: let the gain ramp settle, then suspend the context so a muted game costs no audio CPU
    if (value) this.suspendTimer = this.after(120, () => { this.suspendTimer = 0; if (this.muted && ctx.state === "running") void ctx.suspend().catch(noop) })
    else this.resume()
  }
  private applyGain(): void {
    const e = this.engine; if (!e) return
    try { const p = e.master.gain, t = e.ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(this.muted ? 0 : clamp(Number(this.volume) || 0, 0, 1.5), t, 0.02) } catch { /* ignore */ }
  }
  setListener(position: Vec3, yaw: number): void {
    const l = this.listener; l.x = position.x; l.y = position.y; l.z = position.z; l.yaw = yaw
    this.engine?.setListener(position, yaw)
  }

  setAmbience(theme: AmbienceId | null): void {
    if (this.disposed || theme === this.ambience) return
    this.ambience = theme
    if (!this.engine) return
    try { this.fadeBed(1.5); if (theme) this.startBed(theme, 1.5) } catch { /* ignore */ }
  }
  private startBed(theme: Amb, fade: number): void {
    const e = this.engine; if (!e) return
    this.bed = new Bed(e, theme, this.clock, () => this.quiet()); this.bed.start(fade)
  }
  private fadeBed(fade: number): void {
    const b = this.bed; if (!b) return
    this.bed = null; b.stop(fade); this.fading.push(b)
    while (this.fading.length > 2) { const old = this.fading.shift(); if (old) { this.cancel(old.cleanup); old.kill() } }
    b.cleanup = this.after(fade * 1000 + 150, () => { b.kill(); const i = this.fading.indexOf(b); if (i >= 0) this.fading.splice(i, 1) })
  }

  setIntensity(value: number): void {
    this.intensity = clamp(Number(value) || 0, 0, 1)
    if (this.pulse) this.pulse.target = this.intensity
    this.kick()
  }
  setHeartbeat(value: number): void {
    this.heartbeat = clamp(Number(value) || 0, 0, 1)
    if (this.pulse) this.pulse.heart = this.heartbeat
    this.kick()
  }
  /** Starts the 60 ms tension/heartbeat clock when needed; it stops itself once everything is silent. */
  private kick(): void {
    if (this.clockId || this.disposed || !this.pulse || (this.intensity <= 0 && this.heartbeat <= 0)) return
    this.clockId = window.setInterval(() => {
      let alive = true
      try {
        const ctx = this.ctx, p = this.pulse
        if (!ctx || !p) alive = false
        else if (ctx.state === "running") alive = p.run(ctx.currentTime, ctx.currentTime + 0.2)
      } catch { alive = false }
      if (!alive) { clearInterval(this.clockId); this.clockId = 0 }
    }, 60)
  }

  play(id: SfxId, opts: PlayOptions = {}): void {
    if (this.disposed || this.muted) return
    try {
      if (!this.ctx && !this.activated()) return
      const ctx = this.ensureCtx(), e = this.engine
      if (!ctx || !e || ctx.state !== "running") return
      e.play(id, opts)
    } catch { /* never throw from audio */ }
  }
}

// ------------------------------------------------------------------ offline rendering (tests / bench)
export interface OfflineEvent { id: SfxId; at?: number; opts?: PlayOptions }
export interface OfflineOptions {
  seconds?: number
  sampleRate?: number
  volume?: number
  listener?: { position: Vec3; yaw: number }
  ambience?: Amb
  intensity?: number
  heartbeat?: number
  seed?: number
}
/** Deterministic stand-in for timers so offline renders include the ambience's random events. */
class SimClock implements Clock {
  constructor(public now: number) {}
  private q: { t: number; fn: () => void; id: number }[] = []
  private n = 0
  after(ms: number, fn: () => void): number { const id = ++this.n; this.q.push({ t: this.now + ms / 1000, fn, id }); return id }
  cancel(id: number): void { this.q = this.q.filter(e => e.id !== id) }
  run(until: number): void {
    for (let guard = 0; guard < 10000; guard++) {
      this.q.sort((a, b) => a.t - b.t)
      const e = this.q[0]; if (!e || e.t >= until) return
      this.q.shift(); this.now = e.t
      try { e.fn() } catch { /* ignore */ }
    }
  }
}
/** Pre-roll rendered and discarded: the compressor starts in a gain-reduced state and needs ~0.3 s to settle. */
const PREROLL = 0.3
/** Renders events (at = seconds from the start) through the full mix chain (buses, reverb, compressor, clip) into a
 *  stereo AudioBuffer of `seconds` length; null if unsupported. */
export async function renderOffline(events: OfflineEvent[], o: OfflineOptions = {}): Promise<AudioBuffer | null> {
  try {
    const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!OAC) return null
    const sr = o.sampleRate ?? 44100, seconds = o.seconds ?? 3, pre = Math.round(PREROLL * sr) / sr, len = Math.ceil(sr * seconds)
    const ctx = new OAC(2, Math.round(pre * sr) + len, sr)
    const e = new Engine(ctx, o.volume ?? 0.55, o.seed ?? 12345)
    if (o.listener) e.setListener(o.listener.position, o.listener.yaw)
    if (o.ambience) { const sim = new SimClock(pre); new Bed(e, o.ambience, sim, () => false, () => sim.now).start(0.05); sim.run(pre + seconds) }
    if (o.intensity || o.heartbeat) { const p = new Pulse(e); p.target = p.level = o.intensity ?? 0; p.heart = o.heartbeat ?? 0; p.run(pre, pre + seconds) }
    for (const ev of [...events].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) e.play(ev.id, ev.opts ?? {}, pre + (ev.at ?? 0))
    const full = await ctx.startRendering(), out = ctx.createBuffer(2, len, sr), skip = Math.round(pre * sr)
    for (let ch = 0; ch < 2; ch++) out.getChannelData(ch).set(full.getChannelData(ch).subarray(skip, skip + len))
    return out
  } catch { return null }
}
