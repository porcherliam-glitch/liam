// Procedural audio with the Web Audio API: every sound is synthesised (noise bursts, oscillators, filters).
// Positional sounds are attenuated by distance and panned relative to the camera.

import { cosmetic } from "../core/rng"
import { clamp } from "../core/math"

export type SoundName =
  | "swing" | "swing_heavy" | "hit_flesh" | "hit_metal" | "hit_blunt" | "block" | "block_break" | "footstep" | "footstep_stone"
  | "jump" | "land" | "dodge" | "zombie_groan" | "zombie_alert" | "zombie_attack" | "zombie_hit" | "zombie_die" | "brute_roar"
  | "boss_roar" | "player_hurt" | "player_die" | "pickup" | "chest_open" | "lever" | "extraction_start" | "extraction_done"
  | "level_up" | "ui_move" | "ui_confirm" | "ui_back" | "bow_draw" | "bow_release" | "arrow_hit" | "crossbow_fire"
  | "crossbow_reload" | "drink" | "eat" | "thunder" | "weapon_break" | "plague" | "coin" | "craft" | "upgrade" | "mission_done"
  | "stagger" | "crit" | "gate" | "heartbeat" | "crow" | "wolf" | "bell"

export interface PlayOpts {
  x?: number
  y?: number
  z?: number
  volume?: number
  pitch?: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfx!: GainNode
  private music!: GainNode
  private ambient!: GainNode
  private noiseBuffer!: AudioBuffer
  private listener = { x: 0, y: 0, z: 0, yaw: 0 }
  private ambientNodes: { wind?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }; rain?: { src: AudioBufferSourceNode; gain: GainNode } } = {}
  private musicState: "none" | "menu" | "calm" | "tension" | "boss" = "none"
  private musicNodes: AudioNode[] = []
  private musicTimer = 0
  private musicStep = 0
  private crowTimer = 8
  masterVolume = 0.8
  sfxVolume = 0.9
  musicVolume = 0.6
  private lastPlay = new Map<string, number>()
  private tensionLevel = 0

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running"
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.master.connect(this.ctx.destination)
        this.sfx = this.ctx.createGain()
        this.sfx.connect(this.master)
        this.music = this.ctx.createGain()
        this.music.connect(this.master)
        this.ambient = this.ctx.createGain()
        this.ambient.connect(this.master)
        this.ambient.gain.value = 0.5
        const len = this.ctx.sampleRate * 2
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const d = this.noiseBuffer.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
        this.applyVolumes()
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => undefined)
    } catch {
      this.ctx = null
    }
  }

  applyVolumes(): void {
    if (!this.ctx) return
    this.master.gain.value = this.masterVolume
    this.sfx.gain.value = this.sfxVolume
    this.music.gain.value = this.musicVolume * 0.5
  }

  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener.x = x
    this.listener.y = y
    this.listener.z = z
    this.listener.yaw = yaw
  }

  private out(opts: PlayOpts, maxDist = 40): { node: GainNode; vol: number } | null {
    if (!this.ctx) return null
    const g = this.ctx.createGain()
    let vol = opts.volume ?? 1
    if (opts.x !== undefined) {
      const dx = opts.x - this.listener.x
      const dz = (opts.z ?? 0) - this.listener.z
      const d = Math.hypot(dx, dz, (opts.y ?? 0) - this.listener.y)
      if (d > maxDist) return null
      vol *= 1 / (1 + (d / 6) * (d / 6)) * 1.5
      vol = Math.min(vol, opts.volume ?? 1)
      const pan = this.ctx.createStereoPanner()
      const ang = Math.atan2(dx, dz) - (this.listener.yaw + Math.PI)
      pan.pan.value = clamp(-Math.sin(ang), -1, 1) * Math.min(1, d / 4)
      g.connect(pan)
      pan.connect(this.sfx)
    } else g.connect(this.sfx)
    g.gain.value = vol
    return { node: g, vol }
  }

  private noise(dest: AudioNode, duration: number, opts: { filter?: BiquadFilterType; freq?: number; q?: number; attack?: number; decay?: number; gain?: number; sweepTo?: number }): void {
    if (!this.ctx) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    src.playbackRate.value = 1
    const f = this.ctx.createBiquadFilter()
    f.type = opts.filter ?? "bandpass"
    f.frequency.value = opts.freq ?? 1000
    f.Q.value = opts.q ?? 1
    if (opts.sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, this.ctx.currentTime + duration)
    const g = this.ctx.createGain()
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 1, t + (opts.attack ?? 0.005))
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start(t + cosmetic.range(0, 0.003))
    src.stop(t + duration + 0.05)
  }

  private tone(dest: AudioNode, freq: number, duration: number, opts: { type?: OscillatorType; gain?: number; attack?: number; sweepTo?: number; vibrato?: number } = {}): void {
    if (!this.ctx) return
    const o = this.ctx.createOscillator()
    o.type = opts.type ?? "sine"
    const t = this.ctx.currentTime
    o.frequency.setValueAtTime(freq, t)
    if (opts.sweepTo) o.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + duration)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.5, t + (opts.attack ?? 0.01))
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    if (opts.vibrato) {
      const lfo = this.ctx.createOscillator()
      lfo.frequency.value = 6
      const lg = this.ctx.createGain()
      lg.gain.value = opts.vibrato
      lfo.connect(lg)
      lg.connect(o.frequency)
      lfo.start(t)
      lfo.stop(t + duration)
    }
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + duration + 0.05)
  }

  play(name: SoundName, opts: PlayOpts = {}): void {
    if (!this.ctx || this.ctx.state !== "running") return
    // Rate-limit identical sounds so hordes do not clip.
    const now = performance.now()
    const last = this.lastPlay.get(name) ?? 0
    const minGap = name.startsWith("zombie") || name === "footstep" || name === "footstep_stone" ? 60 : 20
    if (now - last < minGap) return
    this.lastPlay.set(name, now)
    const o = this.out(opts)
    if (!o) return
    const d = o.node
    const p = opts.pitch ?? 1
    switch (name) {
      case "swing":
        this.noise(d, 0.22, { filter: "bandpass", freq: 900 * p, sweepTo: 2600 * p, q: 0.8, gain: 0.5 })
        break
      case "swing_heavy":
        this.noise(d, 0.35, { filter: "bandpass", freq: 500 * p, sweepTo: 1800 * p, q: 0.7, gain: 0.7 })
        break
      case "hit_flesh":
        this.noise(d, 0.18, { filter: "lowpass", freq: 900, gain: 0.9 })
        this.tone(d, 140 * p, 0.14, { type: "triangle", gain: 0.5, sweepTo: 60 })
        break
      case "hit_blunt":
        this.noise(d, 0.15, { filter: "lowpass", freq: 500, gain: 1 })
        this.tone(d, 90 * p, 0.2, { type: "sine", gain: 0.8, sweepTo: 40 })
        break
      case "hit_metal":
      case "block":
        this.tone(d, 2200 * p, 0.25, { type: "square", gain: 0.12, sweepTo: 1800 * p })
        this.tone(d, 3300 * p, 0.18, { type: "triangle", gain: 0.1 })
        this.noise(d, 0.08, { filter: "highpass", freq: 3000, gain: 0.5 })
        break
      case "block_break":
        this.tone(d, 1600, 0.4, { type: "square", gain: 0.15, sweepTo: 300 })
        this.noise(d, 0.3, { filter: "bandpass", freq: 1200, gain: 0.6 })
        break
      case "weapon_break":
        this.tone(d, 2600, 0.3, { type: "square", gain: 0.12, sweepTo: 400 })
        this.noise(d, 0.25, { filter: "highpass", freq: 2000, gain: 0.5 })
        break
      case "footstep":
        this.noise(d, 0.09, { filter: "lowpass", freq: 600 * p, gain: 0.35 })
        break
      case "footstep_stone":
        this.noise(d, 0.07, { filter: "bandpass", freq: 1400 * p, q: 2, gain: 0.3 })
        break
      case "jump":
        this.noise(d, 0.12, { filter: "lowpass", freq: 800, gain: 0.3 })
        break
      case "land":
        this.noise(d, 0.16, { filter: "lowpass", freq: 400, gain: 0.6 })
        break
      case "dodge":
        this.noise(d, 0.3, { filter: "bandpass", freq: 400, sweepTo: 900, gain: 0.35 })
        break
      case "zombie_groan":
        this.tone(d, 110 * p, 0.9, { type: "sawtooth", gain: 0.12, sweepTo: 80 * p, vibrato: 8 })
        this.noise(d, 0.8, { filter: "bandpass", freq: 300, q: 3, gain: 0.15 })
        break
      case "zombie_alert":
        this.tone(d, 180 * p, 0.6, { type: "sawtooth", gain: 0.18, sweepTo: 320 * p, vibrato: 14 })
        this.noise(d, 0.5, { filter: "bandpass", freq: 600, q: 2, gain: 0.25 })
        break
      case "zombie_attack":
        this.tone(d, 220 * p, 0.35, { type: "sawtooth", gain: 0.15, sweepTo: 150 })
        this.noise(d, 0.3, { filter: "bandpass", freq: 900, q: 1.5, gain: 0.3 })
        break
      case "zombie_hit":
        this.tone(d, 160 * p, 0.25, { type: "sawtooth", gain: 0.12, sweepTo: 100 })
        break
      case "zombie_die":
        this.tone(d, 140 * p, 1.1, { type: "sawtooth", gain: 0.14, sweepTo: 40, vibrato: 10 })
        this.noise(d, 0.6, { filter: "lowpass", freq: 500, gain: 0.3 })
        break
      case "brute_roar":
        this.tone(d, 70 * p, 1.2, { type: "sawtooth", gain: 0.3, sweepTo: 55, vibrato: 6 })
        this.noise(d, 1.0, { filter: "lowpass", freq: 400, gain: 0.5 })
        break
      case "boss_roar":
        this.tone(d, 55, 1.8, { type: "sawtooth", gain: 0.4, sweepTo: 40, vibrato: 5 })
        this.tone(d, 110, 1.6, { type: "square", gain: 0.1, sweepTo: 70 })
        this.noise(d, 1.5, { filter: "lowpass", freq: 300, gain: 0.7 })
        break
      case "player_hurt":
        this.tone(d, 260, 0.25, { type: "triangle", gain: 0.3, sweepTo: 180 })
        this.noise(d, 0.2, { filter: "lowpass", freq: 700, gain: 0.5 })
        break
      case "player_die":
        this.tone(d, 220, 1.4, { type: "triangle", gain: 0.35, sweepTo: 60 })
        this.noise(d, 1.2, { filter: "lowpass", freq: 300, gain: 0.5 })
        break
      case "pickup":
        this.tone(d, 660, 0.12, { type: "triangle", gain: 0.2 })
        this.tone(d, 990, 0.16, { type: "triangle", gain: 0.15, attack: 0.06 })
        break
      case "coin":
        this.tone(d, 1800, 0.1, { type: "sine", gain: 0.2 })
        this.tone(d, 2400, 0.18, { type: "sine", gain: 0.15, attack: 0.05 })
        break
      case "chest_open":
        this.noise(d, 0.4, { filter: "lowpass", freq: 300, gain: 0.5 })
        this.tone(d, 120, 0.3, { type: "square", gain: 0.05, sweepTo: 80 })
        break
      case "lever":
      case "gate":
        this.noise(d, 0.6, { filter: "lowpass", freq: 250, gain: 0.7 })
        this.tone(d, 70, 0.6, { type: "square", gain: 0.1, sweepTo: 50 })
        break
      case "extraction_start":
        this.tone(d, 220, 1.2, { type: "sawtooth", gain: 0.12, sweepTo: 330 })
        this.tone(d, 165, 1.2, { type: "sawtooth", gain: 0.1 })
        break
      case "extraction_done":
        for (let i = 0; i < 4; i++) setTimeout(() => this.tone(d, [330, 440, 550, 660][i], 0.5, { type: "triangle", gain: 0.25 }), i * 160)
        break
      case "level_up":
        for (let i = 0; i < 5; i++) setTimeout(() => this.tone(d, [440, 554, 659, 880, 1108][i], 0.45, { type: "triangle", gain: 0.2 }), i * 110)
        break
      case "mission_done":
        for (let i = 0; i < 3; i++) setTimeout(() => this.tone(d, [523, 659, 784][i], 0.4, { type: "triangle", gain: 0.2 }), i * 140)
        break
      case "ui_move":
        this.tone(d, 900, 0.05, { type: "square", gain: 0.03 })
        break
      case "ui_confirm":
        this.tone(d, 700, 0.09, { type: "triangle", gain: 0.12 })
        this.tone(d, 1050, 0.12, { type: "triangle", gain: 0.08, attack: 0.04 })
        break
      case "ui_back":
        this.tone(d, 500, 0.1, { type: "triangle", gain: 0.1, sweepTo: 350 })
        break
      case "bow_draw":
        this.noise(d, 0.5, { filter: "bandpass", freq: 400, sweepTo: 1200, q: 4, gain: 0.25 })
        break
      case "bow_release":
        this.tone(d, 180, 0.15, { type: "triangle", gain: 0.3, sweepTo: 90 })
        this.noise(d, 0.2, { filter: "highpass", freq: 1500, gain: 0.3 })
        break
      case "crossbow_fire":
        this.tone(d, 120, 0.12, { type: "square", gain: 0.2, sweepTo: 60 })
        this.noise(d, 0.18, { filter: "highpass", freq: 1200, gain: 0.5 })
        break
      case "crossbow_reload":
        this.noise(d, 0.5, { filter: "bandpass", freq: 700, q: 3, gain: 0.3 })
        this.tone(d, 400, 0.08, { type: "square", gain: 0.05 })
        break
      case "arrow_hit":
        this.noise(d, 0.12, { filter: "lowpass", freq: 1000, gain: 0.6 })
        this.tone(d, 300, 0.1, { type: "triangle", gain: 0.2, sweepTo: 100 })
        break
      case "drink":
        this.noise(d, 0.5, { filter: "bandpass", freq: 500, q: 5, gain: 0.25, sweepTo: 900 })
        break
      case "eat":
        this.noise(d, 0.4, { filter: "lowpass", freq: 900, gain: 0.25 })
        break
      case "thunder":
        this.noise(d, 2.5, { filter: "lowpass", freq: 200, gain: 1.2, attack: 0.05 })
        this.tone(d, 45, 2, { type: "sawtooth", gain: 0.25, sweepTo: 30 })
        break
      case "plague":
        this.noise(d, 0.8, { filter: "bandpass", freq: 250, q: 2, gain: 0.3 })
        this.tone(d, 90, 0.8, { type: "sine", gain: 0.2, vibrato: 20 })
        break
      case "craft":
        this.tone(d, 1400, 0.1, { type: "square", gain: 0.08 })
        setTimeout(() => this.tone(d, 1400, 0.1, { type: "square", gain: 0.08 }), 180)
        setTimeout(() => this.tone(d, 1900, 0.2, { type: "triangle", gain: 0.1 }), 360)
        break
      case "upgrade":
        this.tone(d, 300, 0.4, { type: "sawtooth", gain: 0.12, sweepTo: 600 })
        this.tone(d, 900, 0.5, { type: "triangle", gain: 0.12, attack: 0.2 })
        break
      case "stagger":
        this.noise(d, 0.25, { filter: "lowpass", freq: 400, gain: 0.4 })
        break
      case "crit":
        this.tone(d, 1200, 0.15, { type: "square", gain: 0.1, sweepTo: 600 })
        this.noise(d, 0.15, { filter: "highpass", freq: 2500, gain: 0.4 })
        break
      case "heartbeat":
        this.tone(d, 55, 0.18, { type: "sine", gain: 0.5 })
        setTimeout(() => this.tone(d, 50, 0.2, { type: "sine", gain: 0.4 }), 180)
        break
      case "crow":
        for (let i = 0; i < 3; i++) setTimeout(() => this.tone(d, 700 * p, 0.12, { type: "sawtooth", gain: 0.06, sweepTo: 500 * p }), i * 160)
        break
      case "wolf":
        this.tone(d, 300 * p, 1.6, { type: "sine", gain: 0.12, sweepTo: 420 * p, attack: 0.4, vibrato: 4 })
        break
      case "bell":
        this.tone(d, 520, 2.5, { type: "sine", gain: 0.2 })
        this.tone(d, 780, 2, { type: "sine", gain: 0.08 })
        this.tone(d, 1300, 1.2, { type: "triangle", gain: 0.05 })
        break
    }
  }

  // ---- ambience -------------------------------------------------------------------

  private loopNoise(filter: BiquadFilterType, freq: number): { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f)
    f.connect(g)
    g.connect(this.ambient)
    src.start()
    return { src, gain: g, filter: f }
  }

  /** Called every frame with environment state. */
  updateAmbience(dt: number, wind: number, rain: number, night: boolean, underground: boolean, tension: number): void {
    if (!this.ctx || this.ctx.state !== "running") return
    if (!this.ambientNodes.wind) {
      this.ambientNodes.wind = this.loopNoise("lowpass", 300)
      this.ambientNodes.rain = this.loopNoise("bandpass", 2500)
    }
    const w = this.ambientNodes.wind
    const r = this.ambientNodes.rain!
    const t = this.ctx.currentTime
    const windTarget = underground ? 0.04 : 0.05 + wind * 0.2 + (night ? 0.03 : 0)
    w.gain.gain.setTargetAtTime(windTarget, t, 0.5)
    w.filter.frequency.setTargetAtTime(200 + wind * 400 + Math.sin(t * 0.3) * 80, t, 0.5)
    r.gain.gain.setTargetAtTime(underground ? 0 : rain * 0.25, t, 0.5)
    // Occasional crows / wolves outdoors
    this.crowTimer -= dt
    if (this.crowTimer <= 0 && !underground) {
      this.crowTimer = cosmetic.range(12, 30)
      if (night && cosmetic.chance(0.5)) this.play("wolf", { volume: 0.5, pitch: cosmetic.range(0.8, 1.2) })
      else this.play("crow", { volume: 0.4, pitch: cosmetic.range(0.8, 1.2) })
    }
    this.tensionLevel = tension
    this.updateMusic(dt)
  }

  // ---- music: slow modal drones with a tension layer ------------------------------

  setMusic(state: "none" | "menu" | "calm" | "tension" | "boss"): void {
    if (state === this.musicState) return
    this.musicState = state
    this.stopMusic()
    this.musicTimer = 0
    this.musicStep = 0
  }

  private stopMusic(): void {
    for (const n of this.musicNodes) {
      try {
        ;(n as OscillatorNode).stop?.()
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.musicNodes = []
  }

  private updateMusic(dt: number): void {
    if (!this.ctx || this.musicState === "none") return
    this.musicTimer -= dt
    if (this.musicTimer > 0) return
    const ctx = this.ctx
    // Chord progression in D minor (Dorian flavour): long, slow pads
    const roots = [73.42, 65.41, 87.31, 58.27] // D2, C2, F2, A#1
    const root = roots[this.musicStep % roots.length]
    const stepLen = this.musicState === "boss" ? 3.2 : this.musicState === "tension" ? 4.5 : 8
    this.musicTimer = stepLen
    this.musicStep++
    const t = ctx.currentTime
    const pad = (freq: number, type: OscillatorType, gain: number, dur: number) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      const f = ctx.createBiquadFilter()
      f.type = "lowpass"
      f.frequency.value = this.musicState === "boss" ? 1400 : 700
      o.connect(f)
      f.connect(g)
      g.connect(this.music)
      o.start(t)
      o.stop(t + dur + 0.1)
      this.musicNodes.push(o)
    }
    const dur = stepLen + 2
    pad(root, "sawtooth", 0.12, dur)
    pad(root * 1.5, "triangle", 0.07, dur)
    pad(root * 2.996, "sine", 0.05, dur) // minor third above octave
    if (this.musicState === "menu") pad(root * 4, "sine", 0.03, dur)
    if (this.musicState === "tension" || this.musicState === "boss") {
      // pulsing low drum
      const beats = this.musicState === "boss" ? 8 : 4
      for (let i = 0; i < beats; i++) {
        setTimeout(() => {
          if (this.musicState === "tension" || this.musicState === "boss") {
            const g = ctx.createGain()
            g.connect(this.music)
            g.gain.value = this.musicState === "boss" ? 0.9 : 0.5
            this.tone(g, 60, 0.3, { type: "sine", gain: 0.8, sweepTo: 35 })
            this.noise(g, 0.12, { filter: "lowpass", freq: 300, gain: 0.4 })
          }
        }, (i * stepLen * 1000) / beats)
      }
      pad(root * 2.1189, "sawtooth", this.musicState === "boss" ? 0.06 : 0.03, dur) // tritone tension
    }
  }
}
