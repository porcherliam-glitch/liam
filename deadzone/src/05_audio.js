// 05_audio.js — AudioManager: fully synthesized Web Audio sound effects and map ambience.
//
// Public API:
//   const AUDIO_DEFS                   sound definitions (pure data) keyed by sound name (§6)
//   function audioPlayDef(def, opts)   generic layer synthesizer used for every sound
//                                      opts {ctx, out, noise, pitch=1, time, rng} → {end, sources} | null
//   class AudioManager(game)
//     unlock() → boolean               creates/resumes the AudioContext (user gesture)
//     get ready → boolean
//     setVolumes({master, sfx, music}) 0..1 each (partial objects allowed)
//     setListener(x, y)                world position used for attenuation and stereo pan
//     play(name, {x, y, volume=1, pitch=1}) → boolean   spatial when x/y given (falloff 900 px)
//     startAmbient(mapId)              per-map drone + wind loop (city/industrial/military/research), idempotent
//     stopAmbient()
//     update(dt)                       ambient gusts/accents, heartbeat when raid.player.hp < 25
//
// Layer schema (AUDIO_DEFS[name] = { layers:[...], rateLimitMs?, vary? }):
//   { type:'sine'|'square'|'saw'|'tri'|'noise', freq, freqEnd?, glide?, attack, hold?, decay, gain,
//     filter?:{type, freq, q, freqEnd?}, delay?, lfo?:{freq, depth, type?} (osc pitch / noise filter),
//     trem?:{freq, depth} (amplitude 0..1), detune?, drive? (waveshaper), rate? (noise playback rate) }
//   rateLimitMs: minimum gap between two plays of the same name (default 25 ms, shot_* = 0).
//   vary: random pitch spread (±fraction) per play.
//
// Routing: voice → [distance lowpass] → StereoPanner → sfx bus → master → compressor → destination;
//          ambience → ambient bus → music bus → master.
// Rules (§0.2 d): nothing touches window/AudioContext at definition time or in the constructor
// (except binding unlock to window gestures); every method is a no-op while !ready and never throws.
// Dependencies: 00_util.js (clamp, lerp, dist, RNG, Log).

const AU_MAX_VOICES = 24;
const AU_FALLOFF_PX = 900;
const AU_MIN_GAP_MS = 25;
const AU_NOISE_SECONDS = 2;
const AU_WAVES = { sine: 'sine', square: 'square', saw: 'sawtooth', tri: 'triangle' };
const AU_CURVES = {};

const AUDIO_DEFS = {
  // ---- Firearms: transient crack (noise) + punch (pitch-dropping sine) + room tail per class ----
  shot_pistol: { rateLimitMs: 0, vary: 0.04, layers: [
    { type: 'noise', attack: 0.001, decay: 0.08, gain: 0.55, filter: { type: 'bandpass', freq: 1900, q: 0.9 }, drive: 2 },
    { type: 'sine', freq: 190, freqEnd: 55, glide: 0.07, attack: 0.001, decay: 0.09, gain: 0.6 },
    { type: 'square', freq: 2600, freqEnd: 900, attack: 0.001, decay: 0.015, gain: 0.08 },
    { type: 'noise', delay: 0.012, attack: 0.01, decay: 0.28, gain: 0.16, filter: { type: 'lowpass', freq: 1000, q: 0.5 } },
  ] },
  shot_smg: { rateLimitMs: 0, vary: 0.06, layers: [
    { type: 'noise', attack: 0.001, decay: 0.05, gain: 0.5, filter: { type: 'bandpass', freq: 2600, q: 1.1 }, drive: 2.5 },
    { type: 'sine', freq: 240, freqEnd: 95, glide: 0.045, attack: 0.001, decay: 0.05, gain: 0.42 },
    { type: 'square', freq: 3400, freqEnd: 1600, attack: 0.001, decay: 0.01, gain: 0.07 },
    { type: 'noise', delay: 0.008, attack: 0.006, decay: 0.13, gain: 0.13, filter: { type: 'lowpass', freq: 1500, q: 0.5 } },
  ] },
  shot_rifle: { rateLimitMs: 0, vary: 0.035, layers: [
    { type: 'noise', attack: 0.001, decay: 0.03, gain: 0.4, filter: { type: 'highpass', freq: 3600, q: 0.7 } },
    { type: 'noise', attack: 0.001, decay: 0.12, gain: 0.7, filter: { type: 'bandpass', freq: 1200, q: 0.8 }, drive: 3 },
    { type: 'sine', freq: 150, freqEnd: 42, glide: 0.11, attack: 0.001, decay: 0.13, gain: 0.75 },
    { type: 'noise', delay: 0.02, attack: 0.015, decay: 0.45, gain: 0.22, filter: { type: 'lowpass', freq: 750, q: 0.5 } },
  ] },
  shot_shotgun: { rateLimitMs: 0, vary: 0.04, layers: [
    { type: 'noise', attack: 0.001, decay: 0.18, gain: 0.85, filter: { type: 'lowpass', freq: 2600, q: 0.6 }, drive: 3.5 },
    { type: 'noise', attack: 0.001, decay: 0.12, gain: 0.35, filter: { type: 'bandpass', freq: 800, q: 1.2 } },
    { type: 'sine', freq: 115, freqEnd: 34, glide: 0.18, attack: 0.002, decay: 0.22, gain: 0.9 },
    { type: 'noise', delay: 0.02, attack: 0.02, decay: 0.6, gain: 0.3, filter: { type: 'lowpass', freq: 420, q: 0.6 } },
  ] },
  shot_sniper: { rateLimitMs: 0, vary: 0.02, layers: [
    { type: 'noise', attack: 0.001, decay: 0.04, gain: 0.6, filter: { type: 'highpass', freq: 3000, q: 0.8 }, drive: 4 },
    { type: 'noise', attack: 0.001, decay: 0.2, gain: 0.55, filter: { type: 'bandpass', freq: 900, q: 0.8 } },
    { type: 'sine', freq: 125, freqEnd: 28, glide: 0.24, attack: 0.001, decay: 0.28, gain: 0.95 },
    { type: 'noise', delay: 0.05, attack: 0.03, decay: 1.1, gain: 0.28, filter: { type: 'lowpass', freq: 520, q: 0.5 } },
    { type: 'noise', delay: 0.3, attack: 0.02, decay: 0.5, gain: 0.12, filter: { type: 'bandpass', freq: 620, q: 1.2 } },
  ] },
  shot_lmg: { rateLimitMs: 0, vary: 0.05, layers: [
    { type: 'noise', attack: 0.001, decay: 0.09, gain: 0.65, filter: { type: 'bandpass', freq: 950, q: 0.9 }, drive: 3 },
    { type: 'sine', freq: 135, freqEnd: 48, glide: 0.09, attack: 0.001, decay: 0.1, gain: 0.72 },
    { type: 'square', freq: 72, freqEnd: 40, attack: 0.001, decay: 0.06, gain: 0.18, filter: { type: 'lowpass', freq: 400, q: 1 } },
    { type: 'noise', delay: 0.015, attack: 0.01, decay: 0.3, gain: 0.2, filter: { type: 'lowpass', freq: 620, q: 0.5 } },
  ] },

  // ---- Melee / weapon handling ----
  melee_swing: { vary: 0.1, layers: [
    { type: 'noise', attack: 0.04, decay: 0.16, gain: 0.35, filter: { type: 'bandpass', freq: 400, freqEnd: 2200, q: 2 } },
    { type: 'noise', delay: 0.03, attack: 0.03, decay: 0.08, gain: 0.08, filter: { type: 'highpass', freq: 4000, q: 0.7 } },
  ] },
  melee_hit: { vary: 0.08, layers: [
    { type: 'sine', freq: 150, freqEnd: 58, attack: 0.001, decay: 0.1, gain: 0.7 },
    { type: 'noise', attack: 0.001, decay: 0.07, gain: 0.5, filter: { type: 'lowpass', freq: 1200, q: 0.8 } },
    { type: 'noise', attack: 0.001, decay: 0.03, gain: 0.2, filter: { type: 'bandpass', freq: 2500, q: 3 } },
  ] },
  reload_start: { layers: [
    { type: 'square', freq: 1800, freqEnd: 1200, attack: 0.001, decay: 0.02, gain: 0.18 },
    { type: 'noise', attack: 0.001, decay: 0.02, gain: 0.18, filter: { type: 'highpass', freq: 4000, q: 0.8 } },
    { type: 'noise', delay: 0.04, attack: 0.05, decay: 0.12, gain: 0.16, filter: { type: 'bandpass', freq: 1500, freqEnd: 3000, q: 2 } },
    { type: 'tri', delay: 0.2, freq: 900, freqEnd: 700, attack: 0.001, decay: 0.03, gain: 0.15 },
  ] },
  reload_end: { layers: [
    { type: 'noise', attack: 0.001, decay: 0.025, gain: 0.32, filter: { type: 'bandpass', freq: 2200, q: 4 } },
    { type: 'square', freq: 1400, freqEnd: 700, attack: 0.001, decay: 0.03, gain: 0.14 },
    { type: 'noise', delay: 0.09, attack: 0.001, decay: 0.05, gain: 0.38, filter: { type: 'bandpass', freq: 900, q: 2 } },
    { type: 'sine', delay: 0.09, freq: 300, freqEnd: 150, attack: 0.001, decay: 0.05, gain: 0.28 },
  ] },
  empty_click: { layers: [
    { type: 'square', freq: 3200, freqEnd: 2000, attack: 0.001, decay: 0.012, gain: 0.16 },
    { type: 'noise', attack: 0.001, decay: 0.015, gain: 0.14, filter: { type: 'highpass', freq: 5000, q: 0.8 } },
  ] },

  // ---- Footsteps ----
  footstep: { rateLimitMs: 120, vary: 0.12, layers: [
    { type: 'noise', attack: 0.002, decay: 0.06, gain: 0.24, filter: { type: 'lowpass', freq: 450, q: 0.8 } },
    { type: 'sine', freq: 90, freqEnd: 50, attack: 0.002, decay: 0.05, gain: 0.14 },
  ] },
  footstep_run: { rateLimitMs: 120, vary: 0.1, layers: [
    { type: 'noise', attack: 0.002, decay: 0.07, gain: 0.3, filter: { type: 'lowpass', freq: 700, q: 0.8 } },
    { type: 'noise', attack: 0.001, decay: 0.03, gain: 0.1, filter: { type: 'bandpass', freq: 1800, q: 1 } },
    { type: 'sine', freq: 105, freqEnd: 55, attack: 0.002, decay: 0.05, gain: 0.16 },
  ] },

  // ---- Zombies: LFO-modulated saws through resonant filters ----
  zombie_growl: { rateLimitMs: 400, vary: 0.15, layers: [
    { type: 'saw', freq: 85, freqEnd: 70, attack: 0.12, hold: 0.25, decay: 0.5, gain: 0.32, filter: { type: 'lowpass', freq: 600, q: 4 }, lfo: { freq: 7, depth: 18 }, trem: { freq: 5, depth: 0.5 } },
    { type: 'saw', freq: 128, freqEnd: 104, attack: 0.15, hold: 0.2, decay: 0.45, gain: 0.18, filter: { type: 'bandpass', freq: 450, q: 3 }, lfo: { freq: 5.3, depth: 12 } },
    { type: 'noise', attack: 0.1, hold: 0.2, decay: 0.4, gain: 0.1, filter: { type: 'bandpass', freq: 700, q: 2 } },
  ] },
  zombie_alert: { rateLimitMs: 200, vary: 0.1, layers: [
    { type: 'saw', freq: 110, freqEnd: 190, attack: 0.05, hold: 0.1, decay: 0.35, gain: 0.36, filter: { type: 'lowpass', freq: 1200, q: 5 }, lfo: { freq: 9, depth: 25 } },
    { type: 'square', freq: 160, freqEnd: 260, attack: 0.05, hold: 0.1, decay: 0.3, gain: 0.1, filter: { type: 'bandpass', freq: 900, q: 2 } },
    { type: 'noise', attack: 0.04, hold: 0.1, decay: 0.3, gain: 0.14, filter: { type: 'bandpass', freq: 1200, q: 1.5 } },
  ] },
  zombie_attack: { vary: 0.1, layers: [
    { type: 'saw', freq: 150, freqEnd: 90, attack: 0.02, decay: 0.25, gain: 0.38, filter: { type: 'lowpass', freq: 1500, q: 3 }, lfo: { freq: 18, depth: 30 } },
    { type: 'noise', attack: 0.01, decay: 0.15, gain: 0.28, filter: { type: 'bandpass', freq: 1600, q: 1.5 } },
  ] },
  zombie_hit: { vary: 0.12, layers: [
    { type: 'noise', attack: 0.001, decay: 0.08, gain: 0.45, filter: { type: 'lowpass', freq: 900, q: 0.8 } },
    { type: 'sine', freq: 120, freqEnd: 55, attack: 0.001, decay: 0.08, gain: 0.42 },
    { type: 'noise', attack: 0.005, decay: 0.12, gain: 0.2, filter: { type: 'bandpass', freq: 400, freqEnd: 200, q: 4 } },
  ] },
  zombie_die: { rateLimitMs: 60, vary: 0.12, layers: [
    { type: 'saw', freq: 120, freqEnd: 45, attack: 0.03, hold: 0.1, decay: 0.7, gain: 0.32, filter: { type: 'lowpass', freq: 700, freqEnd: 200, q: 3 }, lfo: { freq: 6, depth: 15 } },
    { type: 'noise', delay: 0.35, attack: 0.002, decay: 0.25, gain: 0.28, filter: { type: 'lowpass', freq: 500, q: 0.7 } },
    { type: 'sine', delay: 0.38, freq: 80, freqEnd: 40, attack: 0.002, decay: 0.15, gain: 0.38 },
  ] },
  screamer: { rateLimitMs: 500, vary: 0.06, layers: [
    { type: 'saw', freq: 500, freqEnd: 1900, attack: 0.08, hold: 0.4, decay: 0.6, gain: 0.28, filter: { type: 'bandpass', freq: 1500, q: 2 }, lfo: { freq: 22, depth: 60 }, trem: { freq: 30, depth: 0.3 } },
    { type: 'square', freq: 760, freqEnd: 2600, attack: 0.1, hold: 0.35, decay: 0.55, gain: 0.1, filter: { type: 'highpass', freq: 900, q: 0.7 }, lfo: { freq: 17, depth: 80 } },
    { type: 'noise', attack: 0.1, hold: 0.3, decay: 0.7, gain: 0.14, filter: { type: 'highpass', freq: 2500, q: 0.7 } },
  ] },
  boss_roar: { rateLimitMs: 1000, vary: 0.05, layers: [
    { type: 'saw', freq: 55, freqEnd: 38, attack: 0.15, hold: 0.6, decay: 1.2, gain: 0.48, filter: { type: 'lowpass', freq: 500, q: 6 }, lfo: { freq: 4, depth: 6 }, trem: { freq: 11, depth: 0.4 }, drive: 2 },
    { type: 'saw', freq: 82, freqEnd: 56, attack: 0.18, hold: 0.5, decay: 1.1, gain: 0.28, filter: { type: 'lowpass', freq: 900, q: 3 }, lfo: { freq: 6.5, depth: 10 } },
    { type: 'square', freq: 41, attack: 0.2, hold: 0.5, decay: 1.0, gain: 0.25, filter: { type: 'lowpass', freq: 200, q: 1 } },
    { type: 'noise', attack: 0.2, hold: 0.5, decay: 1.0, gain: 0.32, filter: { type: 'bandpass', freq: 400, freqEnd: 250, q: 1 } },
  ] },

  // ---- Player ----
  player_hurt: { rateLimitMs: 80, vary: 0.08, layers: [
    { type: 'tri', freq: 220, freqEnd: 130, attack: 0.01, decay: 0.18, gain: 0.32, lfo: { freq: 30, depth: 15 } },
    { type: 'noise', attack: 0.001, decay: 0.1, gain: 0.38, filter: { type: 'lowpass', freq: 1000, q: 0.8 } },
    { type: 'sine', freq: 90, freqEnd: 50, attack: 0.001, decay: 0.12, gain: 0.38 },
  ] },
  heal: { layers: [
    { type: 'sine', freq: 523, freqEnd: 784, attack: 0.03, decay: 0.5, gain: 0.24 },
    { type: 'sine', delay: 0.08, freq: 784, freqEnd: 1046, attack: 0.03, decay: 0.5, gain: 0.17 },
    { type: 'tri', delay: 0.16, freq: 1568, attack: 0.02, decay: 0.4, gain: 0.07 },
    { type: 'noise', attack: 0.05, decay: 0.3, gain: 0.04, filter: { type: 'highpass', freq: 6000, q: 0.7 } },
  ] },
  eat: { rateLimitMs: 200, vary: 0.08, layers: [
    { type: 'noise', attack: 0.002, decay: 0.05, gain: 0.32, filter: { type: 'bandpass', freq: 1600, q: 2 } },
    { type: 'noise', delay: 0.14, attack: 0.002, decay: 0.05, gain: 0.28, filter: { type: 'bandpass', freq: 1300, q: 2.5 } },
    { type: 'noise', delay: 0.28, attack: 0.002, decay: 0.06, gain: 0.26, filter: { type: 'bandpass', freq: 1900, q: 2 } },
    { type: 'sine', freq: 180, freqEnd: 140, attack: 0.005, decay: 0.06, gain: 0.12 },
    { type: 'sine', delay: 0.42, freq: 260, freqEnd: 120, attack: 0.01, decay: 0.12, gain: 0.12 },
  ] },
  pickup: { vary: 0.03, layers: [
    { type: 'sine', freq: 660, freqEnd: 1320, attack: 0.005, decay: 0.09, gain: 0.28 },
    { type: 'tri', delay: 0.05, freq: 1320, attack: 0.003, decay: 0.08, gain: 0.11 },
    { type: 'noise', attack: 0.001, decay: 0.03, gain: 0.07, filter: { type: 'highpass', freq: 3000, q: 0.7 } },
  ] },
  drop: { vary: 0.05, layers: [
    { type: 'sine', freq: 300, freqEnd: 120, attack: 0.002, decay: 0.1, gain: 0.3 },
    { type: 'noise', attack: 0.001, decay: 0.08, gain: 0.24, filter: { type: 'lowpass', freq: 800, q: 0.8 } },
  ] },

  // ---- World ----
  door_open: { vary: 0.08, layers: [
    { type: 'saw', freq: 180, freqEnd: 260, attack: 0.08, hold: 0.1, decay: 0.35, gain: 0.16, filter: { type: 'bandpass', freq: 900, q: 8 }, lfo: { freq: 13, depth: 25 } },
    { type: 'noise', attack: 0.001, decay: 0.03, gain: 0.28, filter: { type: 'bandpass', freq: 2500, q: 3 } },
    { type: 'sine', freq: 140, freqEnd: 90, attack: 0.002, decay: 0.08, gain: 0.18 },
  ] },
  door_close: { vary: 0.06, layers: [
    { type: 'sine', freq: 110, freqEnd: 50, attack: 0.002, decay: 0.2, gain: 0.52 },
    { type: 'noise', attack: 0.002, decay: 0.15, gain: 0.42, filter: { type: 'lowpass', freq: 600, q: 0.8 } },
    { type: 'noise', delay: 0.06, attack: 0.001, decay: 0.03, gain: 0.28, filter: { type: 'bandpass', freq: 3000, q: 4 } },
  ] },

  // ---- UI ----
  ui_click: { layers: [
    { type: 'square', freq: 1200, attack: 0.001, decay: 0.03, gain: 0.1, filter: { type: 'lowpass', freq: 4000, q: 0.7 } },
    { type: 'sine', freq: 2400, attack: 0.001, decay: 0.02, gain: 0.06 },
  ] },
  ui_hover: { rateLimitMs: 40, layers: [
    { type: 'sine', freq: 1800, freqEnd: 2000, attack: 0.002, decay: 0.025, gain: 0.05 },
  ] },
  ui_error: { rateLimitMs: 150, layers: [
    { type: 'square', freq: 180, attack: 0.002, decay: 0.12, gain: 0.13, filter: { type: 'lowpass', freq: 1500, q: 0.7 } },
    { type: 'square', delay: 0.13, freq: 140, attack: 0.002, decay: 0.16, gain: 0.13, filter: { type: 'lowpass', freq: 1500, q: 0.7 } },
  ] },
  ui_open: { layers: [
    { type: 'tri', freq: 600, freqEnd: 900, attack: 0.004, decay: 0.08, gain: 0.14 },
    { type: 'sine', delay: 0.06, freq: 1200, attack: 0.003, decay: 0.1, gain: 0.09 },
    { type: 'noise', attack: 0.04, decay: 0.08, gain: 0.035, filter: { type: 'bandpass', freq: 2000, freqEnd: 5000, q: 1.5 } },
  ] },

  // ---- Extraction ----
  extract_start: { layers: [
    { type: 'noise', attack: 0.005, decay: 0.15, gain: 0.07, filter: { type: 'bandpass', freq: 2000, q: 1.5 } },
    { type: 'square', freq: 880, attack: 0.003, decay: 0.1, gain: 0.1, filter: { type: 'lowpass', freq: 3000, q: 0.7 } },
    { type: 'square', delay: 0.12, freq: 1175, attack: 0.003, decay: 0.12, gain: 0.1, filter: { type: 'lowpass', freq: 3000, q: 0.7 } },
    { type: 'sine', delay: 0.24, freq: 1760, attack: 0.005, decay: 0.3, gain: 0.12 },
  ] },
  extract_tick: { layers: [
    { type: 'sine', freq: 1320, attack: 0.002, decay: 0.07, gain: 0.17 },
    { type: 'tri', freq: 2640, attack: 0.001, decay: 0.03, gain: 0.05 },
  ] },
  extract_done: { rateLimitMs: 500, layers: [
    { type: 'sine', freq: 1046, attack: 0.004, decay: 0.18, gain: 0.15 },
    { type: 'sine', delay: 0.1, freq: 1318, attack: 0.004, decay: 0.18, gain: 0.15 },
    { type: 'sine', delay: 0.2, freq: 1568, attack: 0.004, decay: 0.2, gain: 0.15 },
    { type: 'sine', delay: 0.32, freq: 2093, attack: 0.01, hold: 0.15, decay: 0.6, gain: 0.13 },
    { type: 'noise', delay: 0.3, attack: 0.08, decay: 0.7, gain: 0.06, filter: { type: 'lowpass', freq: 3000, freqEnd: 300, q: 0.8 } },
  ] },
  alarm: { rateLimitMs: 1200, layers: [
    { type: 'saw', freq: 600, attack: 0.05, hold: 1.4, decay: 0.3, gain: 0.22, filter: { type: 'bandpass', freq: 1200, q: 1 }, lfo: { freq: 1.6, depth: 280, type: 'tri' } },
    { type: 'square', freq: 603, attack: 0.05, hold: 1.4, decay: 0.3, gain: 0.07, filter: { type: 'lowpass', freq: 2000, q: 0.7 }, lfo: { freq: 1.6, depth: 280, type: 'tri' } },
  ] },
  explosion: { vary: 0.06, layers: [
    { type: 'noise', attack: 0.005, hold: 0.05, decay: 1.2, gain: 0.85, filter: { type: 'lowpass', freq: 3000, freqEnd: 300, q: 0.7 }, drive: 2.5 },
    { type: 'sine', freq: 70, freqEnd: 28, attack: 0.005, decay: 0.8, gain: 0.9 },
    { type: 'noise', attack: 0.001, decay: 0.25, gain: 0.45, filter: { type: 'bandpass', freq: 1200, q: 0.7 } },
    { type: 'noise', delay: 0.05, attack: 0.05, decay: 1.8, gain: 0.42, rate: 0.5, filter: { type: 'lowpass', freq: 180, q: 0.8 } },
    { type: 'noise', delay: 0.15, attack: 0.02, decay: 0.5, gain: 0.07, filter: { type: 'highpass', freq: 3000, q: 0.7 } },
  ] },
  fire: { rateLimitMs: 300, vary: 0.1, layers: [
    { type: 'noise', attack: 0.2, hold: 0.6, decay: 0.4, gain: 0.22, filter: { type: 'lowpass', freq: 800, q: 0.8 }, lfo: { freq: 7, depth: 300 } },
    { type: 'noise', delay: 0.05, attack: 0.001, decay: 0.02, gain: 0.18, filter: { type: 'bandpass', freq: 3000, q: 5 } },
    { type: 'noise', delay: 0.23, attack: 0.001, decay: 0.015, gain: 0.14, filter: { type: 'bandpass', freq: 3800, q: 5 } },
    { type: 'noise', delay: 0.41, attack: 0.001, decay: 0.025, gain: 0.2, filter: { type: 'bandpass', freq: 2600, q: 5 } },
    { type: 'noise', delay: 0.66, attack: 0.001, decay: 0.015, gain: 0.12, filter: { type: 'bandpass', freq: 4200, q: 5 } },
    { type: 'noise', delay: 0.9, attack: 0.001, decay: 0.02, gain: 0.16, filter: { type: 'bandpass', freq: 3200, q: 5 } },
  ] },
  flashlight: { layers: [
    { type: 'square', freq: 2600, attack: 0.001, decay: 0.01, gain: 0.1 },
    { type: 'noise', attack: 0.001, decay: 0.02, gain: 0.14, filter: { type: 'bandpass', freq: 4000, q: 3 } },
    { type: 'tri', delay: 0.015, freq: 900, attack: 0.001, decay: 0.02, gain: 0.06 },
  ] },

  // ---- Progression / jingles ----
  level_up: { rateLimitMs: 500, layers: [
    { type: 'tri', freq: 523.25, attack: 0.004, decay: 0.25, gain: 0.16 },
    { type: 'tri', delay: 0.07, freq: 659.25, attack: 0.004, decay: 0.25, gain: 0.16 },
    { type: 'tri', delay: 0.14, freq: 783.99, attack: 0.004, decay: 0.25, gain: 0.16 },
    { type: 'tri', delay: 0.21, freq: 1046.5, attack: 0.004, decay: 0.25, gain: 0.16 },
    { type: 'tri', delay: 0.28, freq: 1318.5, attack: 0.004, hold: 0.1, decay: 0.5, gain: 0.16 },
    { type: 'sine', delay: 0.28, freq: 523.25, attack: 0.03, hold: 0.15, decay: 0.7, gain: 0.1 },
    { type: 'sine', delay: 0.35, freq: 2093, attack: 0.01, hold: 0.1, decay: 0.6, gain: 0.05, lfo: { freq: 6, depth: 12 } },
    { type: 'noise', delay: 0.3, attack: 0.05, decay: 0.5, gain: 0.03, filter: { type: 'highpass', freq: 7000, q: 0.7 } },
  ] },
  mission_complete: { rateLimitMs: 800, layers: [
    { type: 'saw', freq: 392, attack: 0.01, decay: 0.14, gain: 0.12, filter: { type: 'lowpass', freq: 1800, q: 1 } },
    { type: 'saw', delay: 0.13, freq: 523.25, attack: 0.01, decay: 0.14, gain: 0.12, filter: { type: 'lowpass', freq: 1800, q: 1 } },
    { type: 'saw', delay: 0.26, freq: 659.25, attack: 0.01, decay: 0.14, gain: 0.12, filter: { type: 'lowpass', freq: 1800, q: 1 } },
    { type: 'saw', delay: 0.39, freq: 783.99, attack: 0.01, hold: 0.12, decay: 0.5, gain: 0.13, filter: { type: 'lowpass', freq: 2200, q: 1 } },
    { type: 'sine', delay: 0.55, freq: 523.25, attack: 0.02, hold: 0.3, decay: 0.9, gain: 0.1 },
    { type: 'sine', delay: 0.55, freq: 659.25, attack: 0.02, hold: 0.3, decay: 0.9, gain: 0.09 },
    { type: 'sine', delay: 0.55, freq: 783.99, attack: 0.02, hold: 0.3, decay: 0.9, gain: 0.09 },
    { type: 'sine', delay: 0.55, freq: 130.8, attack: 0.02, hold: 0.2, decay: 1.0, gain: 0.16 },
  ] },
  objective: { rateLimitMs: 300, layers: [
    { type: 'sine', freq: 880, attack: 0.004, decay: 0.15, gain: 0.17 },
    { type: 'sine', delay: 0.1, freq: 1320, attack: 0.004, decay: 0.25, gain: 0.15 },
    { type: 'tri', freq: 440, attack: 0.01, decay: 0.3, gain: 0.06 },
  ] },
  loot_open: { vary: 0.06, layers: [
    { type: 'noise', attack: 0.03, decay: 0.18, gain: 0.24, filter: { type: 'bandpass', freq: 1200, freqEnd: 2600, q: 2 } },
    { type: 'noise', delay: 0.12, attack: 0.01, decay: 0.1, gain: 0.18, filter: { type: 'bandpass', freq: 800, q: 3 } },
    { type: 'sine', freq: 500, freqEnd: 350, attack: 0.002, decay: 0.04, gain: 0.14 },
  ] },
  buy: { layers: [
    { type: 'square', freq: 1046, attack: 0.002, decay: 0.05, gain: 0.05 },
    { type: 'sine', freq: 1568, attack: 0.002, decay: 0.15, gain: 0.15 },
    { type: 'sine', delay: 0.07, freq: 2093, attack: 0.002, decay: 0.3, gain: 0.15 },
    { type: 'noise', attack: 0.001, decay: 0.06, gain: 0.07, filter: { type: 'highpass', freq: 6000, q: 0.7 } },
  ] },
  sell: { layers: [
    { type: 'tri', freq: 1318, attack: 0.002, decay: 0.1, gain: 0.15 },
    { type: 'tri', delay: 0.07, freq: 988, attack: 0.002, decay: 0.2, gain: 0.15 },
    { type: 'noise', attack: 0.001, decay: 0.08, gain: 0.06, filter: { type: 'bandpass', freq: 5000, q: 2 } },
  ] },
  craft: { rateLimitMs: 200, layers: [
    { type: 'noise', attack: 0.001, decay: 0.06, gain: 0.32, filter: { type: 'bandpass', freq: 2000, q: 6 } },
    { type: 'tri', freq: 1100, freqEnd: 900, attack: 0.001, decay: 0.12, gain: 0.11 },
    { type: 'noise', delay: 0.16, attack: 0.001, decay: 0.06, gain: 0.3, filter: { type: 'bandpass', freq: 1800, q: 6 } },
    { type: 'tri', delay: 0.16, freq: 1050, freqEnd: 870, attack: 0.001, decay: 0.12, gain: 0.1 },
    { type: 'sine', delay: 0.32, freq: 660, freqEnd: 990, attack: 0.01, decay: 0.25, gain: 0.14 },
  ] },
  toxic: { rateLimitMs: 250, vary: 0.08, layers: [
    { type: 'noise', attack: 0.1, hold: 0.3, decay: 0.4, gain: 0.22, filter: { type: 'bandpass', freq: 900, q: 3 }, lfo: { freq: 9, depth: 500 } },
    { type: 'sine', freq: 220, attack: 0.05, hold: 0.3, decay: 0.4, gain: 0.1, lfo: { freq: 14, depth: 80 }, trem: { freq: 7, depth: 0.8 } },
    { type: 'noise', attack: 0.2, decay: 0.5, gain: 0.05, filter: { type: 'highpass', freq: 5000, q: 0.7 } },
  ] },
  grenade_throw: { layers: [
    { type: 'noise', attack: 0.001, decay: 0.02, gain: 0.22, filter: { type: 'bandpass', freq: 4500, q: 4 } },
    { type: 'tri', freq: 3000, attack: 0.001, decay: 0.06, gain: 0.06 },
    { type: 'noise', delay: 0.08, attack: 0.06, decay: 0.18, gain: 0.24, filter: { type: 'bandpass', freq: 300, freqEnd: 1500, q: 1.5 } },
  ] },
  warning: { rateLimitMs: 300, layers: [
    { type: 'square', freq: 988, attack: 0.003, decay: 0.09, gain: 0.11, filter: { type: 'lowpass', freq: 2500, q: 0.7 } },
    { type: 'square', delay: 0.15, freq: 988, attack: 0.003, decay: 0.09, gain: 0.11, filter: { type: 'lowpass', freq: 2500, q: 0.7 } },
    { type: 'sine', freq: 494, attack: 0.005, decay: 0.25, gain: 0.08 },
  ] },
};

// Heartbeat for low HP (internal, triggered by update()).
const AU_HEARTBEAT = { layers: [
  { type: 'sine', freq: 62, freqEnd: 42, attack: 0.006, decay: 0.14, gain: 0.7 },
  { type: 'tri', freq: 110, freqEnd: 80, attack: 0.004, decay: 0.08, gain: 0.12 },
  { type: 'noise', attack: 0.004, decay: 0.1, gain: 0.25, filter: { type: 'lowpass', freq: 140, q: 0.8 } },
  { type: 'sine', delay: 0.2, freq: 55, freqEnd: 38, attack: 0.006, decay: 0.18, gain: 0.5 },
  { type: 'tri', delay: 0.2, freq: 98, freqEnd: 72, attack: 0.004, decay: 0.09, gain: 0.08 },
] };

// Per-map ambience: continuous layers (noise = wind/rumble, osc = drone) + random distant accents.
// Ambient layer: { type, freq?, gain, rate?, detune?, filter?, lfo?:{freq, depth} (noise filter Hz /
// osc pitch Hz), swell?:{freq, depth} (gain fraction), wind?: true (target of gusts) }.
const AU_AMBIENT = {
  city: {
    gustEvery: [9, 20], accentEvery: [7, 16],
    layers: [
      { type: 'noise', gain: 0.1, filter: { type: 'bandpass', freq: 520, q: 0.6 }, lfo: { freq: 0.07, depth: 260 }, swell: { freq: 0.05, depth: 0.4 }, wind: true },
      { type: 'noise', gain: 0.12, rate: 0.5, filter: { type: 'lowpass', freq: 160, q: 0.7 } },
      { type: 'saw', freq: 55, gain: 0.035, filter: { type: 'lowpass', freq: 170, q: 1 }, swell: { freq: 0.09, depth: 0.5 }, lfo: { freq: 0.11, depth: 0.6 } },
      { type: 'sine', freq: 82.4, gain: 0.03, swell: { freq: 0.13, depth: 0.4 } },
      { type: 'tri', freq: 110, detune: 7, gain: 0.012, filter: { type: 'lowpass', freq: 300, q: 0.7 } },
    ],
    accents: [
      { layers: [{ type: 'saw', freq: 90, freqEnd: 70, attack: 0.2, hold: 0.4, decay: 0.8, gain: 0.25, filter: { type: 'lowpass', freq: 400, q: 3 }, lfo: { freq: 6, depth: 14 } }] },
      { layers: [
        { type: 'noise', attack: 0.001, decay: 0.05, gain: 0.2, filter: { type: 'bandpass', freq: 2400, q: 3 } },
        { type: 'noise', delay: 0.09, attack: 0.001, decay: 0.04, gain: 0.14, filter: { type: 'bandpass', freq: 3100, q: 3 } },
        { type: 'noise', delay: 0.21, attack: 0.001, decay: 0.06, gain: 0.12, filter: { type: 'bandpass', freq: 1900, q: 3 } },
      ] },
      { layers: [
        { type: 'square', freq: 900, freqEnd: 700, attack: 0.01, decay: 0.18, gain: 0.08, filter: { type: 'bandpass', freq: 1200, q: 4 }, lfo: { freq: 25, depth: 60 } },
        { type: 'square', delay: 0.3, freq: 880, freqEnd: 680, attack: 0.01, decay: 0.2, gain: 0.07, filter: { type: 'bandpass', freq: 1200, q: 4 }, lfo: { freq: 25, depth: 60 } },
      ] },
      { layers: [{ type: 'square', freq: 770, attack: 0.05, hold: 1.6, decay: 0.4, gain: 0.04, filter: { type: 'lowpass', freq: 1600, q: 0.7 }, lfo: { freq: 2, depth: 110, type: 'square' } }] },
    ],
  },
  industrial: {
    gustEvery: [10, 22], accentEvery: [6, 14],
    layers: [
      { type: 'noise', gain: 0.09, filter: { type: 'bandpass', freq: 260, q: 1.2 }, lfo: { freq: 0.11, depth: 90 }, swell: { freq: 0.07, depth: 0.35 }, wind: true },
      { type: 'noise', gain: 0.025, filter: { type: 'highpass', freq: 2800, q: 0.5 }, swell: { freq: 0.04, depth: 0.6 } },
      { type: 'square', freq: 41.2, gain: 0.03, filter: { type: 'lowpass', freq: 130, q: 1 } },
      { type: 'saw', freq: 61.7, gain: 0.025, filter: { type: 'lowpass', freq: 220, q: 2 }, swell: { freq: 0.6, depth: 0.5 } },
      { type: 'sine', freq: 123.5, gain: 0.008, lfo: { freq: 0.2, depth: 0.8 } },
    ],
    accents: [
      { layers: [
        { type: 'tri', freq: 1180, attack: 0.001, decay: 0.9, gain: 0.08 },
        { type: 'tri', freq: 1730, attack: 0.001, decay: 0.7, gain: 0.05 },
        { type: 'noise', attack: 0.001, decay: 0.08, gain: 0.25, filter: { type: 'bandpass', freq: 2500, q: 8 } },
      ] },
      { layers: [{ type: 'noise', attack: 0.1, hold: 0.5, decay: 0.8, gain: 0.12, filter: { type: 'highpass', freq: 3000, q: 0.7 } }] },
      { layers: [
        { type: 'noise', attack: 0.001, decay: 0.03, gain: 0.14, filter: { type: 'bandpass', freq: 3500, q: 5 } },
        { type: 'noise', delay: 0.07, attack: 0.001, decay: 0.03, gain: 0.12, filter: { type: 'bandpass', freq: 3900, q: 5 } },
        { type: 'noise', delay: 0.15, attack: 0.001, decay: 0.03, gain: 0.13, filter: { type: 'bandpass', freq: 3300, q: 5 } },
        { type: 'noise', delay: 0.22, attack: 0.001, decay: 0.04, gain: 0.1, filter: { type: 'bandpass', freq: 3700, q: 5 } },
      ] },
      { layers: [
        { type: 'sine', freq: 60, freqEnd: 35, attack: 0.005, decay: 0.4, gain: 0.35 },
        { type: 'noise', attack: 0.005, decay: 0.3, gain: 0.2, filter: { type: 'lowpass', freq: 300, q: 0.8 } },
      ] },
    ],
  },
  military: {
    gustEvery: [8, 18], accentEvery: [8, 18],
    layers: [
      { type: 'noise', gain: 0.11, filter: { type: 'bandpass', freq: 380, q: 0.5 }, lfo: { freq: 0.05, depth: 200 }, swell: { freq: 0.06, depth: 0.45 }, wind: true },
      { type: 'noise', gain: 0.14, rate: 0.4, filter: { type: 'lowpass', freq: 90, q: 1 } },
      { type: 'sine', freq: 36.7, gain: 0.05, swell: { freq: 0.06, depth: 0.3 } },
      { type: 'saw', freq: 73.4, gain: 0.02, filter: { type: 'lowpass', freq: 150, q: 1 } },
      { type: 'tri', freq: 146.8, detune: -9, gain: 0.006, filter: { type: 'lowpass', freq: 400, q: 0.7 }, swell: { freq: 0.17, depth: 0.7 } },
    ],
    accents: [
      { layers: [
        { type: 'noise', attack: 0.01, hold: 0.4, decay: 0.2, gain: 0.08, filter: { type: 'bandpass', freq: 1800, q: 2 }, trem: { freq: 18, depth: 0.8 } },
        { type: 'square', delay: 0.05, freq: 1200, attack: 0.002, decay: 0.05, gain: 0.04 },
        { type: 'square', delay: 0.62, freq: 1200, attack: 0.002, decay: 0.05, gain: 0.04 },
      ] },
      { layers: [
        { type: 'noise', attack: 0.001, decay: 0.12, gain: 0.2, filter: { type: 'bandpass', freq: 900, q: 1 } },
        { type: 'noise', delay: 0.11, attack: 0.001, decay: 0.12, gain: 0.18, filter: { type: 'bandpass', freq: 900, q: 1 } },
        { type: 'noise', delay: 0.22, attack: 0.001, decay: 0.12, gain: 0.2, filter: { type: 'bandpass', freq: 900, q: 1 } },
        { type: 'noise', delay: 0.33, attack: 0.001, decay: 0.2, gain: 0.16, filter: { type: 'bandpass', freq: 900, q: 1 } },
      ] },
      { layers: [{ type: 'noise', attack: 1.0, hold: 1.0, decay: 1.5, gain: 0.22, rate: 0.6, filter: { type: 'lowpass', freq: 250, q: 1 }, trem: { freq: 11, depth: 0.9 } }] },
      { layers: [
        { type: 'noise', attack: 0.01, decay: 1.4, gain: 0.3, filter: { type: 'lowpass', freq: 400, freqEnd: 120, q: 0.8 } },
        { type: 'sine', freq: 45, freqEnd: 25, attack: 0.01, decay: 1.0, gain: 0.35 },
      ] },
    ],
  },
  research: {
    gustEvery: [12, 26], accentEvery: [6, 13],
    layers: [
      { type: 'noise', gain: 0.03, filter: { type: 'highpass', freq: 1400, q: 0.4 }, swell: { freq: 0.03, depth: 0.3 } },
      { type: 'noise', gain: 0.05, filter: { type: 'bandpass', freq: 700, q: 0.8 }, lfo: { freq: 0.06, depth: 150 }, wind: true },
      { type: 'sine', freq: 60, gain: 0.03 },
      { type: 'sine', freq: 120, gain: 0.018, swell: { freq: 0.25, depth: 0.3 } },
      { type: 'square', freq: 180, gain: 0.006, filter: { type: 'lowpass', freq: 400, q: 0.7 } },
      { type: 'sine', freq: 45, gain: 0.02, swell: { freq: 0.04, depth: 0.5 } },
    ],
    accents: [
      { layers: [
        { type: 'sine', freq: 1760, attack: 0.003, decay: 0.08, gain: 0.07 },
        { type: 'sine', delay: 0.14, freq: 1760, attack: 0.003, decay: 0.08, gain: 0.07 },
        { type: 'sine', delay: 0.28, freq: 2217, attack: 0.003, decay: 0.12, gain: 0.06 },
      ] },
      { layers: [
        { type: 'saw', freq: 2000, freqEnd: 300, attack: 0.001, decay: 0.12, gain: 0.08, drive: 3 },
        { type: 'noise', attack: 0.001, decay: 0.15, gain: 0.14, filter: { type: 'highpass', freq: 4000, q: 0.7 }, trem: { freq: 60, depth: 0.9 } },
      ] },
      { layers: [{ type: 'noise', attack: 0.05, decay: 0.6, gain: 0.14, filter: { type: 'highpass', freq: 2000, freqEnd: 800, q: 0.7 } }] },
      { layers: [{ type: 'tri', freq: 660, attack: 0.1, hold: 0.6, decay: 0.5, gain: 0.05, lfo: { freq: 4, depth: 30 } }] },
    ],
  },
};

function au_num(v, d) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function au_warn(...args) {
  try { if (typeof Log !== 'undefined' && Log && typeof Log.warn === 'function') Log.warn(...args); } catch (e) { /* ignore */ }
}

// tanh waveshaper curve, cached per (rounded) drive amount.
function au_shaperCurve(amount) {
  const k = Math.round(clamp(au_num(amount, 1), 0.5, 20) * 4) / 4;
  const key = String(k);
  if (AU_CURVES[key]) return AU_CURVES[key];
  const n = 1024;
  const c = new Float32Array(n);
  const norm = Math.tanh(k) || 1;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  AU_CURVES[key] = c;
  return c;
}

// Connects an LFO (oscillator → depth gain → param). tEnd null = runs until stopped externally.
function au_lfo(ctx, spec, param, t0, tEnd, sources, scale) {
  if (!spec || !param) return;
  const depth = au_num(spec.depth, 0) * au_num(scale, 1);
  if (depth === 0) return;
  const o = ctx.createOscillator();
  o.type = AU_WAVES[spec.type] || 'sine';
  o.frequency.setValueAtTime(Math.max(0.01, au_num(spec.freq, 1)), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(depth, t0);
  o.connect(g);
  g.connect(param);
  o.start(t0);
  if (tEnd !== null && tEnd !== undefined) o.stop(tEnd + 0.05);
  sources.push(o);
}

// Builds and schedules one layer; returns its end time (or t0 when skipped).
function au_playLayer(ctx, out, L, now, pitch, noise, rng, sources) {
  if (!L || typeof L !== 'object') return now;
  const peak = Math.max(0, au_num(L.gain, 0.3));
  if (peak <= 0) return now;
  const t0 = now + Math.max(0, au_num(L.delay, 0));
  const atk = Math.max(0.001, au_num(L.attack, 0.005));
  const hold = Math.max(0, au_num(L.hold, 0));
  const dec = Math.max(0.01, au_num(L.decay, 0.1));
  const tEnd = t0 + atk + hold + dec;
  const isNoise = L.type === 'noise';
  let src;
  if (isNoise) {
    if (!noise) return now;
    src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.playbackRate.setValueAtTime(clamp(au_num(L.rate, 1) * pitch, 0.05, 8), t0);
  } else {
    src = ctx.createOscillator();
    src.type = AU_WAVES[L.type] || 'sine';
    const f0 = clamp(au_num(L.freq, 440) * pitch, 1, 20000);
    src.frequency.setValueAtTime(f0, t0);
    const fe = au_num(L.freqEnd, 0);
    if (fe > 0) {
      const glide = Math.max(0.005, au_num(L.glide, atk + hold + dec));
      src.frequency.exponentialRampToValueAtTime(clamp(fe * pitch, 1, 20000), t0 + glide);
    }
    if (L.detune) src.detune.setValueAtTime(au_num(L.detune, 0), t0);
    if (L.lfo) au_lfo(ctx, L.lfo, src.frequency, t0, tEnd, sources, pitch);
  }
  let node = src;
  if (L.filter && typeof L.filter === 'object') {
    const F = L.filter;
    const f = ctx.createBiquadFilter();
    f.type = F.type || 'lowpass';
    f.frequency.setValueAtTime(clamp(au_num(F.freq, 1000) * pitch, 20, 20000), t0);
    const ffe = au_num(F.freqEnd, 0);
    if (ffe > 0) f.frequency.exponentialRampToValueAtTime(clamp(ffe * pitch, 20, 20000), tEnd);
    f.Q.setValueAtTime(clamp(au_num(F.q, 1), 0.0001, 40), t0);
    if (isNoise && L.lfo) au_lfo(ctx, L.lfo, f.frequency, t0, tEnd, sources, pitch);
    node.connect(f);
    node = f;
  }
  if (au_num(L.drive, 0) > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = au_shaperCurve(L.drive);
    node.connect(ws);
    node = ws;
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + atk);
  if (hold > 0) env.gain.setValueAtTime(peak, t0 + atk + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, tEnd);
  node.connect(env);
  node = env;
  if (L.trem && typeof L.trem === 'object') {
    const d = clamp(au_num(L.trem.depth, 0), 0, 1);
    if (d > 0) {
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(1 - d / 2, t0);
      au_lfo(ctx, { freq: L.trem.freq, depth: d / 2 }, tg.gain, t0, tEnd, sources, 1);
      node.connect(tg);
      node = tg;
    }
  }
  node.connect(out);
  if (isNoise) {
    const dur = au_num(noise.duration, AU_NOISE_SECONDS);
    const off = rng && typeof rng.next === 'function' ? rng.next() * Math.max(0, dur - 0.05) : 0;
    src.start(t0, off);
  } else {
    src.start(t0);
  }
  src.stop(tEnd + 0.05);
  sources.push(src);
  return tEnd;
}

// Generic synth: plays every layer of `def` into opts.out. Returns {end, sources} or null.
function audioPlayDef(def, opts) {
  const o = opts || {};
  const ctx = o.ctx;
  if (!def || !Array.isArray(def.layers) || !ctx || !o.out) return null;
  const now = au_num(o.time, au_num(ctx.currentTime, 0));
  const pitch = clamp(au_num(o.pitch, 1), 0.05, 8);
  const sources = [];
  let end = now;
  const n = Math.min(def.layers.length, 16);
  for (let i = 0; i < n; i++) {
    const e = au_playLayer(ctx, o.out, def.layers[i], now, pitch, o.noise || null, o.rng || null, sources);
    if (e > end) end = e;
  }
  return { end, sources };
}

class AudioManager {
  constructor(game) {
    this.au_failSeen = new Set();
    this.game = game || null;
    this.au_ctx = null;
    this.au_master = null;
    this.au_sfx = null;
    this.au_music = null;
    this.au_noise = null;
    this.au_vol = { master: 0.8, sfx: 1, music: 0.6 };
    this.au_lx = null;
    this.au_ly = null;
    this.au_voices = [];
    this.au_dying = [];
    this.au_last = new Map();
    this.au_unknown = new Set();
    this.au_amb = null;
    this.au_ambPending = null;
    this.au_hbTimer = 0;
    this.au_noCtxWarned = false;
    this.au_rng = null;
    try { this.au_rng = new RNG(0x0a0d10); } catch (e) { this.au_rng = null; }
    // Bind unlock once to user gestures (only touches window inside the constructor, never at definition time).
    this.au_onGesture = () => { this.unlock(); };
    try {
      if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
        const evs = ['pointerdown', 'touchend', 'keydown'];
        for (let i = 0; i < evs.length; i++) window.addEventListener(evs[i], this.au_onGesture, { passive: true, capture: true });
      }
    } catch (e) { this.au_fail('constructor', e); }
  }

  get ready() {
    try { return !!this.au_ctx && this.au_ctx.state !== 'closed'; } catch (e) { return false; }
  }

  unlock() {
    try {
      if (this.au_ctx && this.au_ctx.state === 'closed') this.au_teardown();
      if (this.au_ctx) {
        this.au_resume();
        return true;
      }
      const w = typeof window !== 'undefined' ? window : null;
      const Ctor = w ? (w.AudioContext || w.webkitAudioContext) : undefined;
      if (typeof Ctor !== 'function') {
        if (!this.au_noCtxWarned) { this.au_noCtxWarned = true; au_warn('AudioManager: AudioContext unavailable, audio disabled'); }
        return false;
      }
      const ctx = new Ctor();
      try {
        this.au_build(ctx);
      } catch (e) {
        try { if (ctx.close) { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } } catch (e2) { /* ignore */ }
        this.au_master = this.au_sfx = this.au_music = this.au_noise = null;
        throw e;
      }
      this.au_ctx = ctx;
      this.au_resume();
      if (this.au_ambPending) {
        const id = this.au_ambPending;
        this.au_ambPending = null;
        this.au_startAmbientNow(id);
      }
      return true;
    } catch (e) {
      this.au_fail('unlock', e);
      return false;
    }
  }

  setVolumes(v) {
    try {
      if (!v || typeof v !== 'object') return;
      const keys = ['master', 'sfx', 'music'];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (v[k] === undefined || v[k] === null) continue;
        const n = Number(v[k]);
        if (Number.isFinite(n)) this.au_vol[k] = clamp(n, 0, 1);
      }
      if (!this.ready) return; // values are cached and applied on unlock
      this.au_applyVolumes(false);
    } catch (e) { this.au_fail('setVolumes', e); }
  }

  setListener(x, y) {
    try {
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        this.au_lx = x;
        this.au_ly = y;
      }
    } catch (e) { this.au_fail('setListener', e); }
  }

  play(name, opts = {}) {
    if (!this.ready) return false;
    try {
      const def = typeof name === 'string' && Object.prototype.hasOwnProperty.call(AUDIO_DEFS, name) ? AUDIO_DEFS[name] : null;
      if (!def) {
        const key = String(name);
        if (!this.au_unknown.has(key) && this.au_unknown.size < 200) {
          this.au_unknown.add(key);
          au_warn('AudioManager: unknown sound "' + key + '"');
        }
        return false;
      }
      const o = opts && typeof opts === 'object' ? opts : {};
      const ctx = this.au_ctx;
      const now = au_num(ctx.currentTime, 0);
      // Rate limit identical sounds.
      const gapMs = def.rateLimitMs === undefined ? AU_MIN_GAP_MS : Math.max(0, au_num(def.rateLimitMs, AU_MIN_GAP_MS));
      if (gapMs > 0) {
        const last = this.au_last.get(name);
        if (last !== undefined && (now - last) * 1000 < gapMs && now >= last) return false;
      }
      let gain = clamp(au_num(o.volume, 1), 0, 2);
      if (gain <= 0) return false;
      let pan = null;
      let cutoff = 0;
      const sx = o.x, sy = o.y;
      if (typeof sx === 'number' && typeof sy === 'number' && Number.isFinite(sx) && Number.isFinite(sy) && this.au_lx !== null) {
        const d = dist(this.au_lx, this.au_ly, sx, sy);
        if (d >= AU_FALLOFF_PX) return false;
        const f = 1 - d / AU_FALLOFF_PX;
        gain *= f * f * (3 - 2 * f); // smoothstep falloff
        if (gain < 0.002) return false;
        pan = clamp((sx - this.au_lx) / (AU_FALLOFF_PX * 0.6), -1, 1) * 0.85;
        cutoff = 18000 * Math.pow(0.1, d / AU_FALLOFF_PX); // distant sounds get duller
      }
      let pitch = clamp(au_num(o.pitch, 1), 0.25, 4);
      const vary = au_num(def.vary, 0);
      if (vary > 0) pitch *= 1 + (this.au_rand() * 2 - 1) * vary;
      const ok = this.au_spawn(name, def, gain, pan, cutoff, pitch, this.au_sfx, now);
      if (ok) this.au_last.set(name, now);
      return ok;
    } catch (e) {
      this.au_fail('play', e);
      return false;
    }
  }

  startAmbient(mapId) {
    try {
      const id = typeof mapId === 'string' && mapId ? mapId : 'city';
      if (!this.ready) { this.au_ambPending = id; return; } // started on unlock
      if (this.au_amb && this.au_amb.mapId === id) return;
      this.au_startAmbientNow(id);
    } catch (e) { this.au_fail('startAmbient', e); }
  }

  stopAmbient() {
    try {
      this.au_ambPending = null;
      if (!this.ready) return;
      this.au_killAmbient(1.5);
    } catch (e) { this.au_fail('stopAmbient', e); }
  }

  update(dt) {
    if (!this.ready) return;
    try {
      const step = clamp(au_num(dt, 0), 0, 0.25);
      const now = au_num(this.au_ctx.currentTime, 0);
      this.au_prune(now);
      const g = this.game;
      const paused = !!(g && g.paused);
      // Heartbeat when HP is low.
      const p = g && g.raid ? g.raid.player : null;
      const hp = p ? Number(p.hp) : NaN;
      const inRaid = !(g && typeof g.state === 'string' && g.state !== 'raid');
      if (inRaid && !paused && Number.isFinite(hp) && hp > 0 && hp < 25) {
        this.au_hbTimer -= step;
        if (this.au_hbTimer <= 0) {
          const sev = clamp(1 - hp / 25, 0, 1);
          this.au_spawn('heartbeat', AU_HEARTBEAT, 0.45 + 0.55 * sev, null, 0, 1, this.au_sfx, now);
          this.au_hbTimer = lerp(1.15, 0.55, sev);
        }
      } else {
        this.au_hbTimer = 0;
      }
      // Ambient variation: wind gusts and distant accents.
      const a = this.au_amb;
      if (a) {
        a.gustT -= step;
        if (a.gustT <= 0) {
          a.gustT = this.au_range(a.flav.gustEvery, 9, 20);
          if (a.windGain) {
            const m = 1.4 + this.au_rand() * 0.9;
            const rise = 1.5 + this.au_rand() * 1.5;
            a.windGain.gain.setTargetAtTime(a.windBase * m, now, rise / 3);
            a.windGain.gain.setTargetAtTime(a.windBase, now + rise, 1.6);
          }
        }
        a.accentT -= step;
        if (a.accentT <= 0) {
          a.accentT = this.au_range(a.flav.accentEvery, 7, 16);
          const list = Array.isArray(a.flav.accents) ? a.flav.accents : [];
          if (list.length && !paused) {
            const def = list[Math.min(list.length - 1, Math.floor(this.au_rand() * list.length))];
            const vol = 0.45 + this.au_rand() * 0.45;
            const pan = (this.au_rand() * 2 - 1) * 0.9;
            const cutoff = 1800 + this.au_rand() * 3600;
            const pitch = 0.9 + this.au_rand() * 0.2;
            this.au_spawn('ambient_accent', def, vol, pan, cutoff, pitch, a.bus, now);
          }
        }
      }
    } catch (e) { this.au_fail('update', e); }
  }

  // ---------------------------------------------------------------- private helpers

  au_fail(where, e) {
    try {
      const msg = e && e.message ? e.message : String(e);
      const key = where + ':' + msg;
      if (this.au_failSeen.has(key) || this.au_failSeen.size > 64) return;
      this.au_failSeen.add(key);
      au_warn('AudioManager.' + where + ' failed:', msg);
    } catch (e2) { /* never throw */ }
  }

  au_rand() {
    try { if (this.au_rng) return this.au_rng.next(); } catch (e) { /* fall through */ }
    return 0.5;
  }

  au_range(r, lo, hi) {
    const a = Array.isArray(r) ? au_num(r[0], lo) : lo;
    const b = Array.isArray(r) ? au_num(r[1], hi) : hi;
    return Math.max(0.5, a + (b - a) * this.au_rand());
  }

  au_resume() {
    const ctx = this.au_ctx;
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch((e) => this.au_fail('resume', e));
    }
  }

  au_build(ctx) {
    const now = au_num(ctx.currentTime, 0);
    this.au_master = ctx.createGain();
    this.au_sfx = ctx.createGain();
    this.au_music = ctx.createGain();
    this.au_sfx.connect(this.au_master);
    this.au_music.connect(this.au_master);
    let comp = null;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-14, now);
      comp.knee.setValueAtTime(12, now);
      comp.ratio.setValueAtTime(4, now);
      comp.attack.setValueAtTime(0.003, now);
      comp.release.setValueAtTime(0.25, now);
      this.au_master.connect(comp);
      comp.connect(ctx.destination);
    } else {
      this.au_master.connect(ctx.destination);
    }
    // One shared white-noise buffer for every noise layer.
    const sr = au_num(ctx.sampleRate, 44100) > 0 ? au_num(ctx.sampleRate, 44100) : 44100;
    const len = Math.max(1, Math.floor(sr * AU_NOISE_SECONDS));
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const rng = this.au_rng;
    for (let i = 0; i < len; i++) data[i] = (rng ? rng.next() : ((i * 7919) % 1000) / 1000) * 2 - 1;
    this.au_noise = buf;
    this.au_applyVolumes(true, ctx);
  }

  au_applyVolumes(immediate, ctxArg) {
    const ctx = ctxArg || this.au_ctx;
    if (!ctx || !this.au_master) return;
    const now = au_num(ctx.currentTime, 0);
    const pairs = [[this.au_master, this.au_vol.master], [this.au_sfx, this.au_vol.sfx], [this.au_music, this.au_vol.music]];
    for (let i = 0; i < pairs.length; i++) {
      const node = pairs[i][0];
      if (!node) continue;
      if (immediate) node.gain.setValueAtTime(pairs[i][1], now);
      else node.gain.setTargetAtTime(pairs[i][1], now, 0.03);
    }
  }

  au_teardown() {
    this.au_ctx = null;
    this.au_master = this.au_sfx = this.au_music = this.au_noise = null;
    this.au_voices = [];
    this.au_dying = [];
    this.au_amb = null;
    this.au_last.clear();
  }

  // Disconnects finished voices and faded-out ambience.
  au_prune(now) {
    const v = this.au_voices;
    for (let i = v.length - 1; i >= 0; i--) {
      if (now > v[i].end + 0.1) {
        this.au_disconnect(v[i].nodes);
        v.splice(i, 1);
      }
    }
    const d = this.au_dying;
    for (let i = d.length - 1; i >= 0; i--) {
      if (now > d[i].until) {
        this.au_disconnect(d[i].nodes);
        d.splice(i, 1);
      }
    }
  }

  au_disconnect(nodes) {
    if (!Array.isArray(nodes)) return;
    for (let i = 0; i < nodes.length; i++) {
      try { if (nodes[i]) nodes[i].disconnect(); } catch (e) { /* already disconnected */ }
    }
  }

  au_level(def) {
    let s = 0;
    const L = def && Array.isArray(def.layers) ? def.layers : [];
    for (let i = 0; i < L.length && i < 16; i++) s += Math.max(0, au_num(L[i] && L[i].gain, 0));
    return Math.min(1.5, s);
  }

  // Ensures a free voice slot: steals the quietest voice, where older voices count as quieter
  // (level decays with elapsed fraction). Drops the new sound if it is clearly the quietest.
  au_makeRoom(level, now) {
    this.au_prune(now);
    const v = this.au_voices;
    if (v.length < AU_MAX_VOICES) return true;
    let vi = -1;
    let best = Infinity;
    for (let i = 0; i < v.length; i++) {
      const span = Math.max(0.01, v[i].end - v[i].start);
      const rem = clamp((v[i].end - now) / span, 0, 1);
      const lvl = v[i].level * (0.25 + 0.75 * rem);
      if (lvl < best) { best = lvl; vi = i; }
    }
    if (vi < 0) return false;
    if (level < best * 0.5) return false;
    const victim = v[vi];
    v.splice(vi, 1);
    try {
      const g = victim.nodes[0].gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.015);
    } catch (e) { /* ignore */ }
    for (let i = 0; i < victim.sources.length; i++) {
      try { victim.sources[i].stop(now + 0.03); } catch (e) { /* ignore */ }
    }
    this.au_dying.push({ until: now + 0.08, nodes: victim.nodes });
    return true;
  }

  // Creates the per-voice chain (gain → [lowpass] → [pan] → dest) and plays def through it.
  au_spawn(name, def, gain, pan, cutoff, pitch, dest, now) {
    const ctx = this.au_ctx;
    if (!ctx || !dest) return false;
    const level = gain * this.au_level(def);
    if (!this.au_makeRoom(level, now)) return false;
    const head = ctx.createGain();
    head.gain.setValueAtTime(gain, now);
    const nodes = [head];
    let node = head;
    if (cutoff > 0 && cutoff < 17000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(clamp(cutoff, 200, 20000), now);
      lp.Q.setValueAtTime(0.5, now);
      node.connect(lp);
      node = lp;
      nodes.push(lp);
    }
    if (pan !== null && pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const sp = ctx.createStereoPanner();
      sp.pan.setValueAtTime(clamp(au_num(pan, 0), -1, 1), now);
      node.connect(sp);
      node = sp;
      nodes.push(sp);
    }
    node.connect(dest);
    const res = audioPlayDef(def, { ctx, out: head, noise: this.au_noise, pitch, time: now, rng: this.au_rng });
    if (!res || !res.sources.length) {
      this.au_disconnect(nodes);
      return false;
    }
    this.au_voices.push({ name, start: now, end: res.end, level, nodes, sources: res.sources });
    return true;
  }

  au_startAmbientNow(mapId) {
    const ctx = this.au_ctx;
    if (!ctx || !this.au_music) return;
    if (this.au_amb && this.au_amb.mapId === mapId) return;
    this.au_killAmbient(2);
    const flav = AU_AMBIENT[mapId] || AU_AMBIENT.city;
    const t = au_num(ctx.currentTime, 0);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 3);
    bus.connect(this.au_music);
    const sources = [];
    let windGain = null;
    let windBase = 0;
    const layers = Array.isArray(flav.layers) ? flav.layers : [];
    for (let i = 0; i < layers.length && i < 12; i++) {
      const L = layers[i];
      if (!L) continue;
      const base = Math.max(0, au_num(L.gain, 0.03));
      const isNoise = L.type === 'noise';
      if (isNoise && !this.au_noise) continue;
      let src;
      if (isNoise) {
        src = ctx.createBufferSource();
        src.buffer = this.au_noise;
        src.loop = true;
        src.playbackRate.setValueAtTime(clamp(au_num(L.rate, 1), 0.05, 4), t);
      } else {
        src = ctx.createOscillator();
        src.type = AU_WAVES[L.type] || 'sine';
        src.frequency.setValueAtTime(clamp(au_num(L.freq, 55), 1, 20000), t);
        if (L.detune) src.detune.setValueAtTime(au_num(L.detune, 0), t);
      }
      let node = src;
      let filt = null;
      if (L.filter && typeof L.filter === 'object') {
        filt = ctx.createBiquadFilter();
        filt.type = L.filter.type || 'lowpass';
        filt.frequency.setValueAtTime(clamp(au_num(L.filter.freq, 500), 20, 20000), t);
        filt.Q.setValueAtTime(clamp(au_num(L.filter.q, 1), 0.0001, 40), t);
        node.connect(filt);
        node = filt;
      }
      if (L.lfo) {
        const target = isNoise ? (filt ? filt.frequency : null) : src.frequency;
        au_lfo(ctx, L.lfo, target, t, null, sources, 1);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(base, t);
      if (L.swell) au_lfo(ctx, { freq: L.swell.freq, depth: clamp(au_num(L.swell.depth, 0), 0, 1) * base }, g.gain, t, null, sources, 1);
      node.connect(g);
      g.connect(bus);
      if (isNoise) src.start(t, this.au_rand() * (AU_NOISE_SECONDS - 0.1));
      else src.start(t);
      sources.push(src);
      if (L.wind && !windGain) { windGain = g; windBase = base; }
    }
    this.au_amb = {
      mapId, flav, bus, sources, windGain, windBase,
      gustT: this.au_range(flav.gustEvery, 9, 20),
      accentT: this.au_range(flav.accentEvery, 7, 16) * 0.6,
    };
  }

  au_killAmbient(fade) {
    const a = this.au_amb;
    if (!a) return;
    this.au_amb = null;
    const ctx = this.au_ctx;
    if (!ctx) return;
    const t = au_num(ctx.currentTime, 0);
    const f = Math.max(0.05, au_num(fade, 1.5));
    try {
      const g = a.bus.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + f);
    } catch (e) { /* ignore */ }
    for (let i = 0; i < a.sources.length; i++) {
      try { a.sources[i].stop(t + f + 0.05); } catch (e) { /* ignore */ }
    }
    this.au_dying.push({ until: t + f + 0.2, nodes: [a.bus] });
  }
}
