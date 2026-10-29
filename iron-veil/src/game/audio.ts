/**
 * audio.ts — fully synthesised sound (Web Audio, no files).
 * CONTRACT (used by raid.ts, ui.ts, boot.ts):
 *  - play(id, opts): one-shot. opts.position makes it positional relative to the listener (setListener), with
 *    distance attenuation, stereo panning and distance low-pass. Without position it is a 2D UI/first-person sound.
 *  - setListener(position, yaw): call once per rendered frame during a raid (yaw 0 = facing -Z, + turns left).
 *  - setAmbience(theme | "menu" | null): looping background bed with crossfade.
 *  - setIntensity(0..1): combat tension layer; setHeartbeat(0..1): low-health heartbeat.
 *  - setMuted / setVolume / dispose. Must never throw (AudioContext may be unavailable or suspended).
 *  - The AudioContext is created lazily on the first user gesture (pointerdown/keydown) — browsers block autoplay.
 * PLACEHOLDER: the audio pass replaces this with layered weapon sounds, footsteps, ambience and reverb.
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

export interface PlayOptions {
  /** World position for 3D sounds. */
  position?: Vec3
  /** Linear gain multiplier (default 1). */
  volume?: number
  /** Playback-rate / pitch multiplier (default 1). */
  rate?: number
}

export function stepSound(surface: Surface): SfxId { return `step_${surface}` as SfxId }

export class AudioSystem {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private disposed = false
  muted = false
  volume = 0.55
  private listener = { x: 0, y: 0, z: 0, yaw: 0 }
  private readonly unlock = () => { this.ensureCtx(); this.detachUnlock() }

  constructor() { window.addEventListener("pointerdown", this.unlock); window.addEventListener("keydown", this.unlock) }
  private detachUnlock(): void { window.removeEventListener("pointerdown", this.unlock); window.removeEventListener("keydown", this.unlock) }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.detachUnlock(); try { this.master?.disconnect(); const ctx = this.ctx; this.ctx = null; if (ctx && ctx.state !== "closed") void ctx.close() } catch { /* ignore */ } }
  private ensureCtx(): AudioContext | null {
    if (this.disposed) return null
    try {
      if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.ctx.destination) }
      if (this.ctx.state === "suspended") void this.ctx.resume()
      return this.ctx
    } catch { return null }
  }
  setVolume(value: number): void { this.volume = value; if (this.master) this.master.gain.value = this.muted ? 0 : value }
  setMuted(value: boolean): void { this.muted = value; if (this.master) this.master.gain.value = value ? 0 : this.volume }
  setListener(position: Vec3, yaw: number): void { this.listener.x = position.x; this.listener.y = position.y; this.listener.z = position.z; this.listener.yaw = yaw }
  setAmbience(_theme: ThemeId | "menu" | null): void { /* placeholder */ }
  setIntensity(_value: number): void { /* placeholder */ }
  setHeartbeat(_value: number): void { /* placeholder */ }

  play(id: SfxId, opts: PlayOptions = {}): void {
    if (this.disposed || this.muted) return
    const ctx = this.ensureCtx(); if (!ctx || !this.master) return
    try {
      let gain = opts.volume ?? 1
      if (opts.position) { const d = Math.hypot(opts.position.x - this.listener.x, opts.position.z - this.listener.z); gain *= 1 / (1 + d * 0.08) }
      const shot = id.startsWith("shot_") || id.startsWith("enemy_")
      const t = ctx.currentTime, osc = ctx.createOscillator(), env = ctx.createGain()
      osc.type = shot ? "sawtooth" : "sine"; osc.frequency.setValueAtTime(shot ? 150 : 520, t); osc.frequency.exponentialRampToValueAtTime(shot ? 42 : 700, t + 0.1)
      env.gain.setValueAtTime(0.2 * gain, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      osc.connect(env).connect(this.master); osc.start(t); osc.stop(t + 0.13)
    } catch { /* never throw from audio */ }
  }
}
