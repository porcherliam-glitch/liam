export type SfxId = "shot" | "enemyShot" | "hit" | "hurt" | "pickup" | "ui" | "reload" | "empty" | "win" | "lose" | "heal" | "build"

export class AudioSystem {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private disposed = false
  muted = false
  volume = 0.55
  private readonly unlock = () => { this.ensureCtx(); this.detachUnlock() }
  constructor() { window.addEventListener("pointerdown", this.unlock); window.addEventListener("keydown", this.unlock) }
  private detachUnlock(): void { window.removeEventListener("pointerdown", this.unlock); window.removeEventListener("keydown", this.unlock) }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.detachUnlock(); this.master?.disconnect(); const ctx = this.ctx; this.ctx = null; if (ctx && ctx.state !== "closed") void ctx.close() }
  private ensureCtx(): AudioContext { if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.ctx.destination) } if (this.ctx.state === "suspended") void this.ctx.resume(); return this.ctx }
  setVolume(value: number): void { this.volume = value; if (this.master) this.master.gain.value = this.muted ? 0 : value }
  setMuted(value: boolean): void { this.muted = value; if (this.master) this.master.gain.value = value ? 0 : this.volume }
  sfx(id: SfxId): void {
    if (this.disposed || this.muted) return
    const ctx = this.ensureCtx(); if (!this.master) return
    const t = ctx.currentTime
    const spec: Record<SfxId, [OscillatorType, number, number, number, number]> = {
      shot: ["sawtooth", 150, 42, 0.09, 0.3], enemyShot: ["square", 110, 45, 0.11, 0.16], hit: ["sine", 880, 420, 0.055, 0.16],
      hurt: ["sawtooth", 95, 48, 0.18, 0.24], pickup: ["sine", 620, 990, 0.14, 0.2], ui: ["sine", 440, 520, 0.045, 0.1],
      reload: ["square", 190, 130, 0.07, 0.1], empty: ["square", 90, 75, 0.045, 0.1], win: ["sine", 523, 1046, 0.55, 0.22],
      lose: ["sawtooth", 180, 42, 0.65, 0.25], heal: ["sine", 330, 660, 0.3, 0.16], build: ["triangle", 220, 440, 0.2, 0.16],
    }
    const [type, f0, f1, dur, gainValue] = spec[id]
    const osc = ctx.createOscillator(); const env = ctx.createGain(); const filter = ctx.createBiquadFilter()
    osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
    filter.type = "lowpass"; filter.frequency.value = id === "shot" ? 1500 : 4000
    env.gain.setValueAtTime(gainValue, t); env.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(filter).connect(env).connect(this.master); osc.start(t); osc.stop(t + dur)
    if (id === "shot" || id === "enemyShot") this.noiseBurst(dur * 0.8, gainValue * 0.7)
  }
  private noiseBurst(duration: number, gainValue: number): void {
    const ctx = this.ensureCtx(); if (!this.master) return
    const length = Math.ceil(ctx.sampleRate * duration); const buffer = ctx.createBuffer(1, length, ctx.sampleRate); const data = buffer.getChannelData(0)
    let seed = 9173
    for (let i = 0; i < length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 1073741823.5 - 1) * (1 - i / length) }
    const source = ctx.createBufferSource(); const gain = ctx.createGain(); source.buffer = buffer; gain.gain.value = gainValue; source.connect(gain).connect(this.master); source.start()
  }
}
