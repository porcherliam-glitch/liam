using System;
using System.Collections.Generic;

namespace DeadZone.Core
{
    /// <summary>
    /// Procedural sound effects (mono PCM, 22 050 Hz). No audio files are needed: every sound is synthesized from
    /// noise bursts, oscillators, envelopes and simple filters, like the Web Audio version of the HTML game.
    /// </summary>
    public static class SoundBank
    {
        public const int Rate = 22050;

        public static readonly string[] Names =
        {
            "shot_pistol", "shot_smg", "shot_rifle", "shot_shotgun", "shot_sniper", "shot_lmg", "melee_swing", "melee_hit", "reload_start", "reload_end",
            "empty_click", "footstep", "footstep_run", "zombie_growl", "zombie_alert", "zombie_attack", "zombie_hit", "zombie_die", "screamer", "boss_roar",
            "player_hurt", "heal", "eat", "pickup", "door_open", "door_close", "ui_click", "ui_error", "extract_start", "extract_tick", "extract_done",
            "alarm", "explosion", "fire", "flashlight", "level_up", "mission_complete", "objective", "loot_open", "buy", "sell", "craft", "toxic",
            "grenade_throw", "warning",
            "footstep_wood", "footstep_run_wood", "footstep_tile", "footstep_run_tile", "footstep_dirt", "footstep_run_dirt",
            "footstep_gravel", "footstep_run_gravel", "footstep_metal", "footstep_run_metal", "footstep_water", "footstep_run_water",
        };

        // footstep clip per StepSurface (same order as the enum); concrete and asphalt use the plain footstep
        private static readonly string[] StepWalk = { "footstep", "footstep_wood", "footstep_tile", "footstep_dirt", "footstep_gravel", "footstep_metal", "footstep_water" };
        private static readonly string[] StepRun = { "footstep_run", "footstep_run_wood", "footstep_run_tile", "footstep_run_dirt", "footstep_run_gravel", "footstep_run_metal", "footstep_run_water" };

        /// <summary>Name of the walking or running footstep on a surface (no allocation, safe to call every step).</summary>
        public static string Footstep(StepSurface surface, bool run)
        {
            int i = (int)surface;
            if (i < 0 || i >= StepWalk.Length) i = 0;
            return run ? StepRun[i] : StepWalk[i];
        }

        private enum Wave { Sine, Square, Saw, Triangle }

        private sealed class Buf
        {
            public readonly float[] s;
            public readonly Rng rng;
            public Buf(double seconds, uint seed) { s = new float[Math.Max(1, (int)(seconds * Rate))]; rng = new Rng(seed); }
            public int N => s.Length;
        }

        private static double Osc(Wave w, double phase)
        {
            double p = phase - Math.Floor(phase);
            switch (w)
            {
                case Wave.Square: return p < 0.5 ? 1 : -1;
                case Wave.Saw: return 2 * p - 1;
                case Wave.Triangle: return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
                default: return Math.Sin(p * Math.PI * 2);
            }
        }

        /// <summary>Exponential decay envelope with a short linear attack.</summary>
        private static double Env(double t, double dur, double attack, double decay)
        {
            if (t < 0 || t > dur) return 0;
            double a = attack > 0 ? Math.Min(1, t / attack) : 1;
            double d = decay > 0 ? Math.Exp(-(t - Math.Min(t, attack)) / decay) : 1;
            double tail = Math.Min(1, (dur - t) / 0.01);
            return a * d * tail;
        }

        private static void Tone(Buf b, double t0, double dur, double f0, double f1, Wave w, double amp, double attack = 0.002, double decay = 0.1, double vibHz = 0, double vibDepth = 0)
        {
            int i0 = (int)(t0 * Rate), n = (int)(dur * Rate);
            double phase = 0;
            for (int k = 0; k < n && i0 + k < b.N; k++)
            {
                double t = (double)k / Rate;
                double f = f0 * Math.Pow(f1 / f0, t / dur);
                if (vibHz > 0) f *= 1 + vibDepth * Math.Sin(t * vibHz * Math.PI * 2);
                phase += f / Rate;
                b.s[i0 + k] += (float)(Osc(w, phase) * amp * Env(t, dur, attack, decay));
            }
        }

        /// <summary>Filtered noise burst; lp/hp are one-pole cutoffs in Hz (0 = off). lpEnd sweeps the low-pass.</summary>
        private static void Noise(Buf b, double t0, double dur, double amp, double attack, double decay, double lp = 0, double hp = 0, double lpEnd = -1)
        {
            int i0 = (int)(t0 * Rate), n = (int)(dur * Rate);
            double l = 0, h = 0, prev = 0;
            for (int k = 0; k < n && i0 + k < b.N; k++)
            {
                double t = (double)k / Rate;
                double x = b.rng.Next() * 2 - 1;
                double cut = lpEnd > 0 ? lp * Math.Pow(lpEnd / lp, t / dur) : lp;
                if (cut > 0) { double a = 1 - Math.Exp(-2 * Math.PI * cut / Rate); l += a * (x - l); x = l; }
                if (hp > 0) { double a = Math.Exp(-2 * Math.PI * hp / Rate); h = a * (h + x - prev); prev = x; x = h; }
                b.s[i0 + k] += (float)(x * amp * Env(t, dur, attack, decay));
            }
        }

        private static void Drive(Buf b, double drive)
        {
            for (int i = 0; i < b.N; i++) b.s[i] = (float)Math.Tanh(b.s[i] * drive);
        }

        private static float[] Finish(Buf b, double peak = 0.9)
        {
            double max = 0;
            foreach (var v in b.s) max = Math.Max(max, Math.Abs(v));
            if (max > 1e-6)
            {
                double g = peak / max;
                for (int i = 0; i < b.N; i++) b.s[i] = (float)(b.s[i] * g);
            }
            return b.s;
        }

        private static void Gunshot(Buf b, double body, double crack, double tail, double boom)
        {
            Noise(b, 0, 0.03, crack, 0.0005, 0.008, 9000, 1500);
            Noise(b, 0, tail, 1.0, 0.001, body, 4200, 0, 600);
            Tone(b, 0, 0.18, boom, boom * 0.4, Wave.Sine, 0.9, 0.001, 0.05);
            Noise(b, 0.02, tail * 1.6, 0.25, 0.01, tail * 0.5, 900);
        }

        /// <summary>One footstep on a surface; running steps are louder and brighter and add a heel thump.</summary>
        private static float[] Step(uint seed, StepSurface surface, bool run)
        {
            var b = new Buf(surface == StepSurface.Water ? 0.26 : surface == StepSurface.Metal ? 0.24 : 0.16, seed);
            switch (surface)
            {
                case StepSurface.Wood:
                    // hollow knock: a short click and two quickly damped board resonances
                    Noise(b, 0, 0.04, 0.7, 0.0008, 0.008, 3200, 300);
                    Tone(b, 0, 0.12, run ? 190 : 205, 150, Wave.Sine, 0.8, 0.001, run ? 0.04 : 0.032);
                    Tone(b, 0.002, 0.07, 455, 410, Wave.Triangle, 0.22, 0.001, 0.018);
                    if (run) Tone(b, 0, 0.06, 95, 70, Wave.Sine, 0.45, 0.001, 0.02);
                    return Finish(b, run ? 0.46 : 0.36);
                case StepSurface.Tile:
                    // hard heel click on tiles laid over concrete
                    Noise(b, 0, 0.025, 0.8, 0.0005, 0.004, 7000, 1800);
                    Noise(b, 0.004, 0.11, 0.8, 0.002, 0.022, run ? 1400 : 1000, 90);
                    if (run) Tone(b, 0, 0.05, 100, 70, Wave.Sine, 0.35, 0.001, 0.018);
                    return Finish(b, run ? 0.46 : 0.36);
                case StepSurface.Dirt:
                    // soft crunch: a muffled thud and a few fine grains
                    Noise(b, 0, 0.13, 0.7, 0.008, 0.035, run ? 800 : 600, 60);
                    for (int k = 0; k < (run ? 10 : 6); k++) Noise(b, b.rng.Float(0.005, 0.09), 0.012, b.rng.Float(0.2, 0.4), 0.0005, 0.004, 3800, 900);
                    if (run) Tone(b, 0, 0.05, 85, 60, Wave.Sine, 0.3, 0.002, 0.02);
                    return Finish(b, run ? 0.4 : 0.3);
                case StepSurface.Gravel:
                    // loose stones: many bright grains over a short thud
                    Noise(b, 0, 0.12, 0.5, 0.004, 0.03, 900, 80);
                    for (int k = 0; k < (run ? 22 : 14); k++) Noise(b, b.rng.Float(0, 0.11), 0.01, b.rng.Float(0.3, 0.7), 0.0003, 0.003, 6000, 1500);
                    return Finish(b, run ? 0.42 : 0.34);
                case StepSurface.Metal:
                    // steel plate: a clank with inharmonic ringing partials
                    Noise(b, 0, 0.03, 0.7, 0.0005, 0.006, 6000, 800);
                    Tone(b, 0, 0.22, 520, 515, Wave.Sine, 0.5, 0.001, 0.06);
                    Tone(b, 0, 0.18, 1340, 1330, Wave.Sine, 0.3, 0.001, 0.04);
                    Tone(b, 0, 0.14, 2270, 2260, Wave.Sine, 0.18, 0.001, 0.025);
                    Tone(b, 0, 0.08, 160, 120, Wave.Sine, run ? 0.6 : 0.4, 0.001, 0.025);
                    return Finish(b, run ? 0.5 : 0.4);
                case StepSurface.Water:
                    // splash: a noise burst whose low-pass falls, two little droplets and the foot reaching the ground
                    Noise(b, 0, 0.2, 1, 0.006, run ? 0.07 : 0.055, run ? 4200 : 3200, 250, 700);
                    Tone(b, b.rng.Float(0.03, 0.08), 0.03, 650, 1300, Wave.Sine, 0.25, 0.002, 0.012);
                    Tone(b, b.rng.Float(0.08, 0.15), 0.025, 800, 1500, Wave.Sine, 0.18, 0.002, 0.01);
                    Noise(b, 0, 0.06, 0.4, 0.002, 0.02, 500, 60);
                    return Finish(b, run ? 0.4 : 0.32);
            }
            return Make(run ? "footstep_run" : "footstep"); // concrete and asphalt
        }

        public static float[] Make(string name)
        {
            uint seed = Hash.String(name);
            Buf b;
            switch (name)
            {
                case "footstep_wood": return Step(seed, StepSurface.Wood, false);
                case "footstep_run_wood": return Step(seed, StepSurface.Wood, true);
                case "footstep_tile": return Step(seed, StepSurface.Tile, false);
                case "footstep_run_tile": return Step(seed, StepSurface.Tile, true);
                case "footstep_dirt": return Step(seed, StepSurface.Dirt, false);
                case "footstep_run_dirt": return Step(seed, StepSurface.Dirt, true);
                case "footstep_gravel": return Step(seed, StepSurface.Gravel, false);
                case "footstep_run_gravel": return Step(seed, StepSurface.Gravel, true);
                case "footstep_metal": return Step(seed, StepSurface.Metal, false);
                case "footstep_run_metal": return Step(seed, StepSurface.Metal, true);
                case "footstep_water": return Step(seed, StepSurface.Water, false);
                case "footstep_run_water": return Step(seed, StepSurface.Water, true);
                case "shot_pistol": b = new Buf(0.45, seed); Gunshot(b, 0.05, 0.6, 0.35, 160); Drive(b, 1.6); return Finish(b, 0.85);
                case "shot_smg": b = new Buf(0.3, seed); Gunshot(b, 0.035, 0.5, 0.22, 190); Drive(b, 1.8); return Finish(b, 0.8);
                case "shot_rifle": b = new Buf(0.6, seed); Gunshot(b, 0.07, 0.8, 0.5, 120); Drive(b, 2.2); return Finish(b, 0.9);
                case "shot_shotgun": b = new Buf(0.8, seed); Gunshot(b, 0.12, 0.7, 0.7, 80); Noise(b, 0, 0.4, 0.5, 0.002, 0.15, 1800); Drive(b, 2.5); return Finish(b, 0.95);
                case "shot_sniper": b = new Buf(1.2, seed); Gunshot(b, 0.1, 1.0, 1.0, 70); Noise(b, 0.05, 1.0, 0.3, 0.05, 0.4, 500); Drive(b, 2.4); return Finish(b, 0.95);
                case "shot_lmg": b = new Buf(0.45, seed); Gunshot(b, 0.06, 0.7, 0.35, 100); Drive(b, 2.3); return Finish(b, 0.9);
                case "melee_swing": b = new Buf(0.25, seed); Noise(b, 0, 0.22, 0.6, 0.06, 0.05, 2500, 400, 900); return Finish(b, 0.5);
                case "melee_hit": b = new Buf(0.3, seed); Noise(b, 0, 0.12, 1, 0.001, 0.03, 1200); Tone(b, 0, 0.15, 140, 60, Wave.Sine, 0.8, 0.001, 0.04); Drive(b, 2); return Finish(b, 0.8);
                case "reload_start": b = new Buf(0.35, seed); Noise(b, 0, 0.05, 0.7, 0.001, 0.01, 6000, 1500); Noise(b, 0.12, 0.08, 0.6, 0.001, 0.02, 3000, 800); Tone(b, 0.12, 0.06, 900, 700, Wave.Square, 0.15, 0.001, 0.015); return Finish(b, 0.55);
                case "reload_end": b = new Buf(0.3, seed); Noise(b, 0, 0.04, 0.8, 0.001, 0.008, 7000, 2000); Noise(b, 0.08, 0.06, 0.9, 0.001, 0.015, 4000, 1000); Tone(b, 0.08, 0.05, 1300, 1100, Wave.Square, 0.2, 0.001, 0.01); return Finish(b, 0.6);
                case "empty_click": b = new Buf(0.08, seed); Noise(b, 0, 0.03, 1, 0.0005, 0.005, 8000, 2500); Tone(b, 0, 0.03, 2400, 1800, Wave.Square, 0.2, 0.0005, 0.006); return Finish(b, 0.45);
                case "footstep": b = new Buf(0.14, seed); Noise(b, 0, 0.12, 1, 0.003, 0.03, 900, 80); return Finish(b, 0.35);
                case "footstep_run": b = new Buf(0.14, seed); Noise(b, 0, 0.12, 1, 0.002, 0.025, 1300, 100); Tone(b, 0, 0.06, 90, 60, Wave.Sine, 0.4, 0.001, 0.02); return Finish(b, 0.45);
                case "zombie_growl": b = new Buf(1.1, seed); Tone(b, 0, 1.0, 95, 70, Wave.Saw, 0.7, 0.15, 0.6, 7, 0.08); Noise(b, 0, 1.0, 0.5, 0.2, 0.5, 700, 150); Drive(b, 2.2); return Finish(b, 0.6);
                case "zombie_alert": b = new Buf(0.8, seed); Tone(b, 0, 0.7, 160, 110, Wave.Saw, 0.8, 0.03, 0.35, 11, 0.12); Noise(b, 0, 0.7, 0.6, 0.02, 0.3, 1600, 250); Drive(b, 2.8); return Finish(b, 0.75);
                case "zombie_attack": b = new Buf(0.45, seed); Tone(b, 0, 0.35, 220, 120, Wave.Saw, 0.7, 0.01, 0.12, 15, 0.1); Noise(b, 0, 0.3, 0.7, 0.005, 0.1, 2200, 300); Drive(b, 3); return Finish(b, 0.75);
                case "zombie_hit": b = new Buf(0.2, seed); Noise(b, 0, 0.15, 1, 0.001, 0.04, 1500, 200); Tone(b, 0, 0.1, 110, 70, Wave.Sine, 0.5, 0.001, 0.03); return Finish(b, 0.55);
                case "zombie_die": b = new Buf(1.0, seed); Tone(b, 0, 0.9, 140, 55, Wave.Saw, 0.7, 0.02, 0.4, 6, 0.1); Noise(b, 0, 0.6, 0.6, 0.01, 0.25, 900, 120); Noise(b, 0.55, 0.25, 0.7, 0.002, 0.06, 500); Drive(b, 2); return Finish(b, 0.7);
                case "screamer": b = new Buf(1.6, seed); Tone(b, 0, 1.5, 700, 1100, Wave.Saw, 0.6, 0.08, 1.2, 9, 0.06); Tone(b, 0, 1.5, 1050, 1500, Wave.Square, 0.25, 0.1, 1.0, 13, 0.05); Noise(b, 0, 1.5, 0.4, 0.05, 1.0, 5000, 1200); Drive(b, 2.5); return Finish(b, 0.85);
                case "boss_roar": b = new Buf(2.2, seed); Tone(b, 0, 2.1, 70, 45, Wave.Saw, 1, 0.2, 1.4, 5, 0.1); Tone(b, 0, 2.1, 105, 70, Wave.Square, 0.4, 0.25, 1.2, 4, 0.08); Noise(b, 0, 2.0, 0.8, 0.1, 1.2, 600, 60); Drive(b, 3.2); return Finish(b, 0.95);
                case "player_hurt": b = new Buf(0.35, seed); Tone(b, 0, 0.3, 260, 170, Wave.Triangle, 0.7, 0.005, 0.12); Noise(b, 0, 0.12, 0.6, 0.001, 0.04, 1800, 200); return Finish(b, 0.7);
                case "heal": b = new Buf(0.6, seed); Tone(b, 0, 0.25, 520, 520, Wave.Sine, 0.5, 0.01, 0.15); Tone(b, 0.15, 0.4, 780, 780, Wave.Sine, 0.5, 0.01, 0.2); Noise(b, 0, 0.3, 0.15, 0.05, 0.1, 6000, 2000); return Finish(b, 0.45);
                case "eat": b = new Buf(0.5, seed); for (int k = 0; k < 3; k++) Noise(b, k * 0.14, 0.1, 0.8, 0.005, 0.03, 1400, 300); return Finish(b, 0.4);
                case "pickup": b = new Buf(0.25, seed); Tone(b, 0, 0.08, 660, 880, Wave.Triangle, 0.6, 0.002, 0.05); Tone(b, 0.07, 0.12, 990, 990, Wave.Triangle, 0.5, 0.002, 0.06); return Finish(b, 0.45);
                case "door_open": b = new Buf(0.7, seed); Tone(b, 0, 0.5, 300, 420, Wave.Saw, 0.25, 0.05, 0.3, 18, 0.15); Noise(b, 0, 0.12, 0.8, 0.002, 0.04, 1500, 200); return Finish(b, 0.55);
                case "door_close": b = new Buf(0.5, seed); Noise(b, 0, 0.2, 1, 0.001, 0.06, 900, 60); Tone(b, 0, 0.2, 90, 60, Wave.Sine, 0.8, 0.001, 0.06); return Finish(b, 0.65);
                case "ui_click": b = new Buf(0.06, seed); Tone(b, 0, 0.05, 1500, 1200, Wave.Triangle, 0.6, 0.001, 0.015); return Finish(b, 0.3);
                case "ui_error": b = new Buf(0.3, seed); Tone(b, 0, 0.12, 220, 200, Wave.Square, 0.4, 0.002, 0.08); Tone(b, 0.13, 0.15, 165, 150, Wave.Square, 0.4, 0.002, 0.1); return Finish(b, 0.35);
                case "extract_start": b = new Buf(1.0, seed); Tone(b, 0, 0.3, 440, 440, Wave.Sine, 0.5, 0.01, 0.2); Tone(b, 0.3, 0.3, 554, 554, Wave.Sine, 0.5, 0.01, 0.2); Tone(b, 0.6, 0.4, 659, 659, Wave.Sine, 0.5, 0.01, 0.3); return Finish(b, 0.5);
                case "extract_tick": b = new Buf(0.12, seed); Tone(b, 0, 0.1, 1000, 1000, Wave.Sine, 0.6, 0.002, 0.04); return Finish(b, 0.35);
                case "extract_done": b = new Buf(1.4, seed); foreach (var (t, f) in new[] { (0.0, 523.0), (0.15, 659.0), (0.3, 784.0), (0.45, 1046.0) }) Tone(b, t, 0.9, f, f, Wave.Triangle, 0.45, 0.01, 0.4); return Finish(b, 0.55);
                case "alarm": b = new Buf(1.6, seed); for (int k = 0; k < 4; k++) Tone(b, k * 0.4, 0.38, 880, 660, Wave.Square, 0.4, 0.01, 0.3); return Finish(b, 0.6);
                case "explosion": b = new Buf(2.0, seed); Noise(b, 0, 1.9, 1, 0.003, 0.5, 2500, 0, 150); Tone(b, 0, 0.6, 70, 30, Wave.Sine, 1, 0.003, 0.25); Noise(b, 0.05, 1.5, 0.4, 0.1, 0.6, 400); Drive(b, 2.5); return Finish(b, 1.0);
                case "fire": b = new Buf(1.5, seed); Noise(b, 0, 1.5, 0.8, 0.2, 2.0, 2200, 200); for (int k = 0; k < 10; k++) Noise(b, b.rng.Float(0, 1.4), 0.03, 0.6, 0.001, 0.01, 5000, 1500); return Finish(b, 0.6);
                case "flashlight": b = new Buf(0.08, seed); Noise(b, 0, 0.03, 1, 0.0005, 0.006, 6000, 2000); return Finish(b, 0.35);
                case "level_up": b = new Buf(1.6, seed); foreach (var (t, f) in new[] { (0.0, 392.0), (0.12, 523.0), (0.24, 659.0), (0.36, 784.0), (0.55, 1046.0) }) Tone(b, t, 1.0, f, f, Wave.Square, 0.25, 0.01, 0.35); return Finish(b, 0.55);
                case "mission_complete": b = new Buf(1.5, seed); foreach (var (t, f) in new[] { (0.0, 440.0), (0.2, 554.0), (0.4, 659.0), (0.6, 880.0) }) Tone(b, t, 0.9, f, f, Wave.Triangle, 0.5, 0.01, 0.4); return Finish(b, 0.55);
                case "objective": b = new Buf(0.6, seed); Tone(b, 0, 0.2, 660, 660, Wave.Triangle, 0.5, 0.005, 0.12); Tone(b, 0.15, 0.4, 990, 990, Wave.Triangle, 0.5, 0.005, 0.2); return Finish(b, 0.5);
                case "loot_open": b = new Buf(0.4, seed); Noise(b, 0, 0.3, 0.8, 0.02, 0.1, 1800, 200); Tone(b, 0, 0.25, 180, 240, Wave.Saw, 0.15, 0.02, 0.1); return Finish(b, 0.5);
                case "buy": b = new Buf(0.4, seed); Tone(b, 0, 0.1, 1200, 1200, Wave.Sine, 0.5, 0.002, 0.05); Tone(b, 0.09, 0.25, 1600, 1600, Wave.Sine, 0.5, 0.002, 0.1); return Finish(b, 0.45);
                case "sell": b = new Buf(0.4, seed); Tone(b, 0, 0.1, 1600, 1600, Wave.Sine, 0.5, 0.002, 0.05); Tone(b, 0.09, 0.25, 1200, 1200, Wave.Sine, 0.5, 0.002, 0.1); return Finish(b, 0.45);
                case "craft": b = new Buf(0.7, seed); for (int k = 0; k < 3; k++) { Noise(b, k * 0.18, 0.08, 1, 0.001, 0.02, 4000, 600); Tone(b, k * 0.18, 0.1, 700 + k * 100, 500, Wave.Square, 0.15, 0.001, 0.03); } return Finish(b, 0.55);
                case "toxic": b = new Buf(1.0, seed); Noise(b, 0, 0.9, 0.8, 0.1, 0.5, 1500, 300); Tone(b, 0, 0.9, 120, 90, Wave.Sine, 0.3, 0.1, 0.5, 6, 0.2); return Finish(b, 0.45);
                case "grenade_throw": b = new Buf(0.35, seed); Noise(b, 0, 0.3, 0.7, 0.05, 0.08, 2000, 300, 700); Tone(b, 0.25, 0.05, 2000, 2500, Wave.Square, 0.1, 0.001, 0.01); return Finish(b, 0.45);
                case "warning": b = new Buf(0.8, seed); Tone(b, 0, 0.3, 880, 880, Wave.Square, 0.35, 0.005, 0.2); Tone(b, 0.35, 0.3, 880, 880, Wave.Square, 0.35, 0.005, 0.2); return Finish(b, 0.5);
            }
            b = new Buf(0.1, seed);
            Tone(b, 0, 0.08, 800, 800, Wave.Sine, 0.3, 0.002, 0.03);
            return Finish(b, 0.3);
        }

        /// <summary>Seamless ambience loop per map: wind/rumble noise, a low drone and distant accents.</summary>
        public static float[] Ambient(string mapId, double seconds = 12)
        {
            var b = new Buf(seconds, Hash.String("amb:" + mapId));
            double windCut, drone, droneAmp, rumble;
            switch (mapId)
            {
                case "industrial": windCut = 500; drone = 55; droneAmp = 0.35; rumble = 0.5; break;
                case "military": windCut = 900; drone = 41; droneAmp = 0.2; rumble = 0.3; break;
                case "research": windCut = 350; drone = 60; droneAmp = 0.45; rumble = 0.2; break;
                default: windCut = 700; drone = 48; droneAmp = 0.18; rumble = 0.25; break;
            }
            double l = 0, l2 = 0;
            for (int i = 0; i < b.N; i++)
            {
                double t = (double)i / Rate;
                double gust = 0.6 + 0.4 * Math.Sin(t * Math.PI * 2 / seconds * 2) * Math.Sin(t * Math.PI * 2 / seconds * 3 + 1);
                double x = b.rng.Next() * 2 - 1;
                double a = 1 - Math.Exp(-2 * Math.PI * windCut * gust / Rate);
                l += a * (x - l);
                double a2 = 1 - Math.Exp(-2 * Math.PI * 90 / Rate);
                l2 += a2 * (x - l2);
                double d = Math.Sin(t * drone * Math.PI * 2) * 0.6 + Math.Sin(t * drone * 1.5 * Math.PI * 2) * 0.25 + Math.Sin(t * drone * 2.01 * Math.PI * 2) * 0.15;
                b.s[i] = (float)(l * 0.9 * gust + l2 * rumble * 3 + d * droneAmp * 0.4);
            }
            int accents = mapId == "city" ? 3 : 2;
            for (int k = 0; k < accents; k++)
            {
                double t0 = b.rng.Float(0.5, seconds - 2);
                if (mapId == "industrial") Tone(b, t0, 1.2, 180, 160, Wave.Saw, 0.08, 0.3, 0.6);
                else if (mapId == "research") Tone(b, t0, 0.6, 1200, 1200, Wave.Sine, 0.05, 0.05, 0.3);
                else { Tone(b, t0, 1.5, 90, 60, Wave.Saw, 0.06, 0.3, 0.8, 5, 0.1); Noise(b, t0, 1.2, 0.05, 0.3, 0.6, 600); }
            }
            // crossfade the last second into the first for a seamless loop
            int fade = Math.Min(Rate, b.N / 4);
            for (int i = 0; i < fade; i++)
            {
                double w = (double)i / fade;
                b.s[i] = (float)(b.s[i] * w + b.s[b.N - fade + i] * (1 - w));
            }
            var outp = new float[b.N - fade];
            Array.Copy(b.s, outp, outp.Length);
            double max = 0;
            foreach (var v in outp) max = Math.Max(max, Math.Abs(v));
            if (max > 1e-6) for (int i = 0; i < outp.Length; i++) outp[i] = (float)(outp[i] / max * 0.5);
            return outp;
        }

    }

    /// <summary>Ground under the feet; every surface has its own walking and running footstep (see <see cref="SoundBank.Footstep"/>).</summary>
    public enum StepSurface { Concrete, Wood, Tile, Dirt, Gravel, Metal, Water }

    /// <summary>Reverb of the place the listener stands in (all zero outdoors).</summary>
    public struct RoomAcoustics
    {
        /// <summary>0 outdoors, 1 inside a building.</summary>
        public double wet;
        /// <summary>Reverb decay in seconds: about 0.5 s in a furnished home, 2 s in a warehouse, 4 s in the boss hall.</summary>
        public double decay;
        /// <summary>0 = room size of a small home, 1 = a large hall.</summary>
        public double size;
        /// <summary>0 = soft furnished room (highs die fast), 1 = bare concrete.</summary>
        public double hardness;
    }

    /// <summary>
    /// Pure acoustics helpers for the audio layer: the surface under the feet, the room reverb, the outdoor echo per map
    /// and how much walls muffle a sound. Reads the world only (never changes it, draws no random numbers).
    /// </summary>
    public static class Acoustics
    {
        private const int TILE = World.TILE;
        // cached once: a method group passed as Func would allocate a delegate on every raycast
        private static readonly Func<int, bool> BlocksSight = T.BlocksSight;

        /// <summary>
        /// Surface the 3D view shows at a sim position (keep in sync with WorldView.FloorMat and IndoorMat): roads, pavements and
        /// halls are concrete, grass and earth soft ground, gravel and rubble loose stones, toxic puddles splash; indoors homes and
        /// offices have boards (every third home is tiled), shops, medical rooms and labs tiles. Doorways of a building have the
        /// floor of its rooms (WorldView draws no threshold, only the lintel).
        /// </summary>
        public static StepSurface SurfaceAt(World world, double x, double y)
        {
            if (world == null) return StepSurface.Concrete;
            int tx = M.Floor(x / TILE), ty = M.Floor(y / TILE);
            int t = world.Tile(tx, ty);
            var b = BuildingAtTile(world, tx, ty);
            switch (t)
            {
                case T.ROAD: case T.ROAD_LINE: case T.SIDEWALK: return StepSurface.Concrete;
                case T.GRASS: case T.GROUND: case T.VOID: return StepSurface.Dirt;
                case T.GRAVEL: case T.RUBBLE: return StepSurface.Gravel;
                case T.TOXIC: case T.WATER: return StepSurface.Water;
                case T.FLOOR: return IndoorSurface(b);
            }
            if (b != null) return IndoorSurface(b);
            // doors, props and gaps outside buildings: the ground next to them (like WorldView.BaseUnder)
            for (int k = 0; k < 4; k++)
            {
                int n = world.Tile(tx + (k == 0 ? 1 : k == 1 ? -1 : 0), ty + (k == 2 ? 1 : k == 3 ? -1 : 0));
                if (n == T.ROAD || n == T.SIDEWALK || n == T.ROAD_LINE) return StepSurface.Concrete;
                if (n == T.GRASS || n == T.GROUND) return StepSurface.Dirt;
                if (n == T.GRAVEL || n == T.RUBBLE) return StepSurface.Gravel;
            }
            return StepSurface.Dirt;
        }

        /// <summary>Indoor floor by building type (WorldView.IndoorMat): boards, tiles or bare concrete.</summary>
        public static StepSurface IndoorSurface(Building b)
        {
            switch (b?.type)
            {
                case "house": case "apartment": return (b.tx * 7 + b.ty * 13) % 3 == 0 ? StepSurface.Tile : StepSurface.Wood;
                case "office": case "hq": case "barracks": return StepSurface.Wood;
                case "shop": case "supermarket": case "pharmacy": case "medical": case "lab": case "server": case "security": return StepSurface.Tile;
                default: return StepSurface.Concrete;
            }
        }

        private static Building BuildingAtTile(World world, int tx, int ty)
        {
            int i = world.BuildingIndexAtTile(tx, ty);
            return i >= 0 && i < world.buildings.Count ? world.buildings[i] : null;
        }

        /// <summary>Room reverb at a sim position: none outdoors; indoors it grows with the room (and is longest in the boss hall).</summary>
        public static RoomAcoustics RoomAt(World world, double x, double y)
        {
            if (world == null) return default;
            int tx = M.Floor(x / TILE), ty = M.Floor(y / TILE);
            var b = BuildingAtTile(world, tx, ty);
            if (b == null) return default;
            double area = b.w * b.h;
            if (b.rooms != null)
                foreach (var r in b.rooms)
                    if (tx >= r.tx && ty >= r.ty && tx < r.tx + r.w && ty < r.ty + r.h) { area = r.w * r.h; break; }
            double size = M.Clamp((Math.Sqrt(Math.Max(1, area)) - 3) / 15, 0, 1);
            var floor = IndoorSurface(b);
            double hardness = floor == StepSurface.Wood ? 0.25 : floor == StepSurface.Tile ? 0.7 : 0.9;
            double decay = 0.45 + size * 1.9 * (0.6 + 0.4 * hardness);
            if (b.hall) { size = 1; hardness = 1; decay = Math.Max(decay, 4.0); }
            return new RoomAcoustics { wet = 1, decay = decay, size = size, hardness = hardness };
        }

        /// <summary>
        /// Outdoor echo of gunshots per map: delay in seconds (dense streets answer fast, open fields late) and its level
        /// relative to the shot.
        /// </summary>
        public static void Echo(string mapId, out double delay, out double gain)
        {
            switch (mapId)
            {
                case "city": delay = 0.3; gain = 0.24; break;
                case "industrial": delay = 0.42; gain = 0.22; break;
                case "military": delay = 0.55; gain = 0.17; break;
                case "research": delay = 0.34; gain = 0.2; break;
                default: delay = 0.4; gain = 0.2; break;
            }
        }

        /// <summary>
        /// Echo voice for a new echo: the first slot from <paramref name="next"/> on (wrapping round) whose last echo has finished,
        /// that is <c>busyUntil[i] &lt;= now</c>, or -1 when every slot is still waiting out its delay or still ringing. A busy echo
        /// is never cut (that would cancel it or click); in a burst of automatic fire the new echo is dropped instead.
        /// </summary>
        public static int FreeEchoSlot(double[] busyUntil, int next, double now)
        {
            if (busyUntil == null || busyUntil.Length == 0) return -1;
            int n = busyUntil.Length;
            for (int k = 0; k < n; k++)
            {
                int i = ((next + k) % n + n) % n;
                if (now >= busyUntil[i]) return i;
            }
            return -1;
        }

        /// <summary>
        /// How much walls between a sound (sx, sy) and the listener (lx, ly) muffle it: 0 = free line of sight, 1 = fully blocked.
        /// When the direct line is blocked, two side rays let a sound just around a door frame or corner come through partly.
        /// </summary>
        public static double Occlusion(World world, double sx, double sy, double lx, double ly)
        {
            if (world == null) return 0;
            double dx = lx - sx, dy = ly - sy, len = Math.Sqrt(dx * dx + dy * dy);
            if (len < TILE * 0.5) return 0;
            if (!Physics.RaycastTiles(world, sx, sy, lx, ly, BlocksSight).hit) return 0;
            double ox = -dy / len * 20, oy = dx / len * 20;
            int free = 0;
            if (!Physics.RaycastTiles(world, sx + ox, sy + oy, lx, ly, BlocksSight).hit) free++;
            if (!Physics.RaycastTiles(world, sx - ox, sy - oy, lx, ly, BlocksSight).hit) free++;
            return free == 0 ? 1 : free == 1 ? 0.6 : 0.35;
        }
    }
}
