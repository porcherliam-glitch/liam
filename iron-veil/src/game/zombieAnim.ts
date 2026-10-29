/**
 * zombieAnim.ts — procedural animation for the infected: computes a target pose (zombieModel P indices) from gait,
 * speed and the current action. Gaits: shamble (asymmetric limp, arms reaching, lolling head), run (frantic, flailing),
 * lumber (brute/boss), quad (stalker on all fours), drag (crawler / legless), hobble (one leg). Action overlays: claw,
 * bite, slam, scream, spit, leap, roar, charge, stunned, feeding. Keyframed clips for deaths (forward, backward,
 * knees, sideways, blast) and knockdowns with getting up; every death clip ends flat on the ground.
 * The caller smooths the current pose toward the target, so switching gaits/actions never pops.
 */
import { P, POSE_N, type BodySpec, type PoseKey } from "./zombieModel"

export type Gait = "shamble" | "run" | "lumber" | "quad" | "drag" | "hobble"
export type Action = "none" | "claw" | "bite" | "slam" | "scream" | "spit" | "leap" | "roar" | "charge" | "stunned"

export interface AnimDriver {
  gait: Gait
  /** Gait phase in radians and current ground speed (m/s). */
  phase: number
  speed: number
  /** Locomotion intensity 0..1 (speed relative to the kind's run speed). */
  move: number
  /** Per-instance constants: 0..1 variation seed, limping side (+1 right leg, -1 left), a hanging arm (0 none, ±1). */
  seed: number
  limp: number
  limpArm: number
  /** Seconds since spawn (idle sway). */
  t: number
  /** 0 calm … 1 aggressive (jaw, raised arms). */
  alert: number
  feeding: boolean
  action: Action
  actionT: number
  actionDur: number
  /** Wind-up length of the current action (telegraph). */
  wind: number
  /** Striking arm (+1 right, -1 left). */
  side: number
  /** 0..1 remaining stagger and the hit direction in model space (x right, z back). */
  stagger: number
  hitX: number
  hitZ: number
  /** Bitmasks: 1 = left, 2 = right. */
  armsLost: number
  legsLost: number
}

const HALF = Math.PI / 2
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ------------------------------------------------------------------ clips

type Ease = "in" | "out" | "inout" | "lin"
interface Key { t: number; ease: Ease; vals: Float32Array }
export interface Clip { keys: Key[]; dur: number }

function clip(keys: Array<{ t: number; e?: Ease; p: Partial<Record<PoseKey, number>> }>): Clip {
  const out: Key[] = keys.map(k => {
    const vals = new Float32Array(POSE_N).fill(NaN)
    for (const name of Object.keys(k.p) as PoseKey[]) vals[P[name]] = k.p[name]!
    return { t: k.t, ease: k.e ?? "inout", vals }
  })
  return { keys: out, dur: out[out.length - 1].t }
}

const MIRROR_SWAP: Array<[PoseKey, PoseKey]> = [["armLPitch", "armRPitch"], ["armLSpread", "armRSpread"], ["elbowL", "elbowR"], ["legLPitch", "legRPitch"], ["legLSpread", "legRSpread"], ["kneeL", "kneeR"]]
const MIRROR_NEG: PoseKey[] = ["bodyRoll", "torsoRoll", "torsoYaw", "headRoll", "headYaw"]

function mirror(c: Clip): Clip {
  return {
    dur: c.dur,
    keys: c.keys.map(k => {
      const v = k.vals.slice()
      for (const [a, b] of MIRROR_SWAP) { v[P[a]] = k.vals[P[b]]; v[P[b]] = k.vals[P[a]] }
      for (const n of MIRROR_NEG) v[P[n]] = -k.vals[P[n]]
      return { t: k.t, ease: k.ease, vals: v }
    }),
  }
}

function ease(e: Ease, u: number): number {
  switch (e) {
    case "in": return u * u
    case "out": return 1 - (1 - u) * (1 - u)
    case "inout": return u * u * (3 - 2 * u)
    default: return u
  }
}

/** Samples a clip at time t; the clip starts from the pose `from` (snapshot when the clip began). */
export function sampleClip(out: Float32Array, c: Clip, t: number, from: Float32Array): void {
  const keys = c.keys
  let k1 = 0
  while (k1 < keys.length - 1 && keys[k1].t <= t) k1++
  const last = t >= keys[keys.length - 1].t
  const k0 = last ? keys.length - 1 : k1 - 1
  const t0 = k0 < 0 ? 0 : keys[k0].t, t1 = keys[k1].t
  const u = last ? 1 : ease(keys[k1].ease, clamp((t - t0) / Math.max(1e-4, t1 - t0), 0, 1))
  for (let i = 0; i < POSE_N; i++) {
    const v0 = valueAt(keys, k0, i, from)
    out[i] = last ? v0 : lerp(v0, valueAt(keys, k1, i, from), u)
  }
}
function valueAt(keys: Key[], k: number, i: number, from: Float32Array): number {
  for (let j = k; j >= 0; j--) { const v = keys[j].vals[i]; if (v === v) return v }
  return from[i]
}

const DEATH_FWD = clip([
  { t: 0.16, e: "out", p: { hipsDrop: 0.1, kneeL: 0.45, kneeR: 0.35, torsoPitch: -0.25, headPitch: -0.35, jaw: 0.7, armLPitch: 0.5, armRPitch: 0.6, bodyLift: 0, bodyFwd: 0 } },
  { t: 0.62, e: "in", p: { bodyPitch: -HALF, bodyRoll: 0, bodyLie: 1, hipsDrop: 0, kneeL: 0.12, kneeR: 0.3, torsoPitch: 0, torsoRoll: 0.06, torsoYaw: 0, headPitch: 0.3, headYaw: 1.1, headRoll: 0,
    armLPitch: -0.12, armLSpread: 0.55, elbowL: 0.15, armRPitch: 3.3, armRSpread: 0.35, elbowR: 0.1, legLPitch: -0.03, legRPitch: -0.06, legLSpread: 0.12, legRSpread: 0.2, jaw: 0.55 } },
  { t: 0.72, e: "out", p: { bodyLift: 0.05 } },
  { t: 0.86, e: "in", p: { bodyLift: 0 } },
])
const DEATH_BACK = clip([
  { t: 0.2, e: "out", p: { hipsDrop: 0.16, kneeL: 0.6, kneeR: 0.5, torsoPitch: 0.25, headPitch: 0.45, armLSpread: 0.45, armRSpread: 0.55, armLPitch: 0.3, armRPitch: 0.4, jaw: 0.9, bodyLift: 0, bodyFwd: 0 } },
  { t: 0.68, e: "in", p: { bodyPitch: HALF, bodyRoll: 0, bodyLie: 1, hipsDrop: 0, kneeL: 0.15, kneeR: 0.04, legLPitch: 0.1, legRPitch: 0.03, legLSpread: 0.22, legRSpread: 0.1, torsoPitch: 0, torsoRoll: -0.05, torsoYaw: 0,
    headPitch: -0.15, headYaw: -0.9, headRoll: 0, armLPitch: 0.12, armLSpread: 1.35, elbowL: 0.1, armRPitch: 0.2, armRSpread: 0.85, elbowR: 0.2, jaw: 1 } },
  { t: 0.78, e: "out", p: { bodyLift: 0.04 } },
  { t: 0.9, e: "in", p: { bodyLift: 0 } },
])
const DEATH_KNEES = clip([
  { t: 0.38, e: "out", p: { hipsDrop: 0.5, legLPitch: 0, legRPitch: 0.05, kneeL: 1.55, kneeR: 1.5, torsoPitch: -0.2, headPitch: -0.55, headRoll: 0.3, armLPitch: 0.15, armRPitch: 0.25, armLSpread: 0.1, armRSpread: 0.12, elbowL: 0.2, elbowR: 0.3, jaw: 0.6, bodyLift: 0, bodyFwd: 0 } },
  { t: 0.9, e: "inout", p: { torsoPitch: -0.45, headPitch: -0.75 } },
  { t: 1.35, e: "in", p: { bodyPitch: -HALF, bodyRoll: 0, bodyLie: 1, hipsDrop: 0, kneeL: 0.05, kneeR: 0.12, legLPitch: -0.05, legRPitch: -0.02, legLSpread: 0.08, legRSpread: 0.14, torsoPitch: 0, torsoRoll: 0, torsoYaw: 0,
    headPitch: 0.3, headYaw: -1.1, headRoll: 0, armLPitch: -0.1, armLSpread: 0.25, armRPitch: -0.12, armRSpread: 0.3, elbowL: 0.1, elbowR: 0.1, jaw: 0.4 } },
  { t: 1.45, e: "out", p: { bodyLift: 0.04 } },
  { t: 1.58, e: "in", p: { bodyLift: 0 } },
])
const DEATH_SIDE_R = clip([
  { t: 0.22, e: "out", p: { hipsDrop: 0.14, kneeL: 0.5, kneeR: 0.3, torsoRoll: -0.3, headRoll: -0.4, jaw: 0.7, armLSpread: 0.6, bodyLift: 0, bodyFwd: 0 } },
  { t: 0.7, e: "in", p: { bodyRoll: -HALF, bodyPitch: 0, bodyLie: 1.75, hipsDrop: 0, legLPitch: 0.45, legRPitch: 0.95, kneeL: 0.9, kneeR: 1.4, legLSpread: 0, legRSpread: 0, torsoPitch: -0.35, torsoRoll: 0, torsoYaw: 0,
    headPitch: -0.45, headRoll: 0, headYaw: 0, armLPitch: 0.9, armRPitch: 1.25, elbowL: 1.0, elbowR: 1.3, armLSpread: 0, armRSpread: 0, jaw: 0.8 } },
  { t: 0.8, e: "out", p: { bodyLift: 0.04 } },
  { t: 0.92, e: "in", p: { bodyLift: 0 } },
])
const DEATH_SIDE_L = mirror(DEATH_SIDE_R)
const DEATH_BLAST = clip([
  { t: 0.14, e: "out", p: { bodyPitch: 0.7, bodyLift: 0.55, bodyFwd: -0.9, hipsDrop: 0, torsoPitch: 0.3, headPitch: 0.6, armLPitch: 2.2, armRPitch: 1.9, armLSpread: 0.9, armRSpread: 1.1, elbowL: 0.4, elbowR: 0.6,
    legLPitch: 0.6, legRPitch: 0.3, kneeL: 0.8, kneeR: 0.5, jaw: 1 } },
  { t: 0.5, e: "in", p: { bodyPitch: HALF, bodyRoll: 0, bodyLift: 0, bodyLie: 1, bodyFwd: -2.0, torsoPitch: 0, torsoRoll: 0, torsoYaw: 0, headPitch: -0.2, headYaw: 0.8, headRoll: 0, armLPitch: 0.15, armRPitch: 0.1,
    armLSpread: 1.4, armRSpread: 1.1, elbowL: 0.2, elbowR: 0.1, legLPitch: 0.15, legRPitch: 0.05, legLSpread: 0.35, legRSpread: 0.15, kneeL: 0.25, kneeR: 0.1 } },
  { t: 0.6, e: "out", p: { bodyLift: 0.08, bodyFwd: -2.25 } },
  { t: 0.75, e: "in", p: { bodyLift: 0, bodyFwd: -2.35 } },
])
const KNOCK_BACK = clip([
  { t: 0.3, e: "in", p: { bodyPitch: HALF, bodyRoll: 0, bodyLie: 1, bodyLift: 0, bodyFwd: -0.6, hipsDrop: 0, torsoPitch: 0, torsoYaw: 0, torsoRoll: 0, headPitch: 0.3, armLPitch: 0.4, armRPitch: 0.5, armLSpread: 0.8, armRSpread: 0.7,
    elbowL: 0.4, elbowR: 0.3, legLPitch: 0.35, legRPitch: 0.15, kneeL: 0.6, kneeR: 0.3, jaw: 0.8 } },
  { t: 1.5, e: "inout", p: { headPitch: 0.5, armLPitch: 0.7, kneeL: 0.9, legLPitch: 0.5 } },
  { t: 2.1, e: "inout", p: { bodyPitch: 0.15, bodyLie: 0, bodyFwd: -0.5, hipsDrop: 0.85, torsoPitch: -0.55, legLPitch: 1.45, legRPitch: 1.35, kneeL: 0.5, kneeR: 0.7, armLPitch: -0.3, armRPitch: -0.2, armLSpread: 0.4, armRSpread: 0.4, headPitch: 0.1 } },
  { t: 2.6, e: "inout", p: { bodyPitch: 0, bodyFwd: -0.2, hipsDrop: 0.5, legLPitch: 0.2, legRPitch: -0.1, kneeL: 1.6, kneeR: 1.5, torsoPitch: -0.6, armLPitch: 0.6, armRPitch: 0.8, armLSpread: 0.2, armRSpread: 0.2 } },
  { t: 3.0, e: "inout", p: { bodyFwd: 0, hipsDrop: 0.03, legLPitch: 0, legRPitch: 0, kneeL: 0.1, kneeR: 0.1, torsoPitch: 0, headPitch: -0.1, armLPitch: 0.8, armRPitch: 0.8, armLSpread: 0.05, armRSpread: 0.05, elbowL: 0.2, elbowR: 0.2, jaw: 0.4 } },
])
const KNOCK_FWD = clip([
  { t: 0.3, e: "in", p: { bodyPitch: -HALF, bodyRoll: 0, bodyLie: 1, bodyLift: 0, bodyFwd: 0.4, hipsDrop: 0, torsoPitch: 0, torsoYaw: 0, torsoRoll: 0, headPitch: 0.35, headYaw: 0.6, armLPitch: -0.15, armRPitch: 3.2, armLSpread: 0.6, armRSpread: 0.4,
    elbowL: 0.2, elbowR: 0.2, legLPitch: -0.05, legRPitch: -0.1, kneeL: 0.2, kneeR: 0.4, jaw: 0.6 } },
  { t: 1.4, e: "inout", p: { headPitch: 0.6, armRPitch: 3.0, kneeR: 0.8 } },
  { t: 2.1, e: "inout", p: { bodyPitch: 0, bodyLie: 0, bodyFwd: 0.2, hipsDrop: 0.5, legLPitch: 0.1, legRPitch: 0.1, kneeL: 1.6, kneeR: 1.6, torsoPitch: -1.15, headPitch: 0.9, headYaw: 0, armLPitch: 1.1, armRPitch: 1.2, armLSpread: 0.15, armRSpread: 0.15, elbowL: 0.4, elbowR: 0.4 } },
  { t: 2.7, e: "inout", p: { bodyFwd: 0, hipsDrop: 0.03, legLPitch: 0, legRPitch: 0, kneeL: 0.1, kneeR: 0.1, torsoPitch: 0, headPitch: -0.1, armLPitch: 0.8, armRPitch: 0.8, armLSpread: 0.05, armRSpread: 0.05, elbowL: 0.2, elbowR: 0.2, jaw: 0.4 } },
])

export const CLIPS = { deathFwd: DEATH_FWD, deathBack: DEATH_BACK, deathKnees: DEATH_KNEES, deathSideL: DEATH_SIDE_L, deathSideR: DEATH_SIDE_R, deathBlast: DEATH_BLAST, knockBack: KNOCK_BACK, knockFwd: KNOCK_FWD }
export type ClipName = keyof typeof CLIPS

// ------------------------------------------------------------------ gaits

function idle(o: Float32Array, d: AnimDriver, S: BodySpec): void {
  const t = d.t + d.seed * 10, a = d.alert
  o[P.bodyPitch] = 0; o[P.bodyRoll] = 0.03 * Math.sin(t * 0.6); o[P.bodyLie] = 0; o[P.bodyLift] = 0; o[P.bodyFwd] = 0
  o[P.hipsDrop] = 0.02 + a * 0.04
  o[P.torsoPitch] = -0.08 + 0.04 * Math.sin(t * 0.5) - a * 0.12; o[P.torsoRoll] = 0.05 * Math.sin(t * 0.37 + 1); o[P.torsoYaw] = 0.06 * Math.sin(t * 0.29)
  o[P.headPitch] = -0.25 + 0.1 * Math.sin(t * 0.7) + a * 0.25; o[P.headRoll] = 0.3 * Math.sin(t * 0.31 + d.seed * 4) * (1 - a * 0.6); o[P.headYaw] = 0.2 * Math.sin(t * 0.23)
  o[P.jaw] = 0.15 + 0.12 * Math.max(0, Math.sin(t * 1.1)) + a * 0.45
  const arm = lerp(0.12 + 0.06 * Math.sin(t * 0.8), 0.95, a)
  o[P.armLPitch] = d.limpArm < 0 ? 0.08 : arm; o[P.armRPitch] = d.limpArm > 0 ? 0.08 : arm + 0.05 * Math.sin(t * 0.7)
  o[P.armLSpread] = 0.08; o[P.armRSpread] = 0.1; o[P.elbowL] = 0.2 + a * 0.2; o[P.elbowR] = 0.25 + a * 0.2
  o[P.legLPitch] = 0.04; o[P.legRPitch] = -0.04; o[P.legLSpread] = 0.06; o[P.legRSpread] = 0.06; o[P.kneeL] = 0.08 + a * 0.1; o[P.kneeR] = 0.1 + a * 0.1
  if (d.feeding) {
    // kneeling over a body, tearing and chewing
    const f = t * 2.3
    o[P.hipsDrop] = 0.5; o[P.legLPitch] = 0.12; o[P.legRPitch] = 0.2; o[P.kneeL] = 1.55; o[P.kneeR] = 1.6; o[P.legLSpread] = 0.15; o[P.legRSpread] = 0.18
    o[P.torsoPitch] = -0.85 + 0.12 * Math.sin(f) - S.hunch * 0.5; o[P.torsoRoll] = 0.08 * Math.sin(f * 0.5)
    o[P.armLPitch] = 0.95 + 0.3 * Math.sin(f + 1); o[P.armRPitch] = 0.9 + 0.3 * Math.sin(f + 2.5); o[P.elbowL] = 0.7 + 0.3 * Math.sin(f); o[P.elbowR] = 0.8 + 0.3 * Math.sin(f + 1.7)
    o[P.headPitch] = -0.35 + 0.22 * Math.sin(f * 2); o[P.headRoll] = 0.25 * Math.sin(f * 0.7); o[P.jaw] = 0.45 + 0.4 * Math.sin(f * 2)
  }
}

function shamble(o: Float32Array, d: AnimDriver): void {
  const ph = d.phase, s = Math.sin(ph), c = Math.cos(ph), m = clamp(d.move, 0, 1.2), L = d.limp
  const A = 0.26 + 0.38 * m
  o[P.legLPitch] = A * s * (L < 0 ? 0.55 : 1); o[P.legRPitch] = -A * s * (L > 0 ? 0.55 : 1)
  o[P.kneeL] = 0.08 + (0.2 + 0.6 * m) * Math.max(0, c) * (L < 0 ? 0.3 : 1); o[P.kneeR] = 0.08 + (0.2 + 0.6 * m) * Math.max(0, -c) * (L > 0 ? 0.3 : 1)
  o[P.legLSpread] = 0.05; o[P.legRSpread] = 0.07
  o[P.bodyRoll] = 0.06 * s + L * 0.04; o[P.bodyPitch] = 0; o[P.bodyLie] = 0; o[P.bodyLift] = 0; o[P.bodyFwd] = 0
  o[P.hipsDrop] = 0.025 * (1 - Math.cos(2 * ph)) / 2 + 0.035 * Math.max(0, L * s)
  o[P.torsoPitch] = -0.12 - 0.2 * m + 0.04 * Math.cos(2 * ph); o[P.torsoRoll] = -0.05 * s + L * 0.07; o[P.torsoYaw] = 0.1 * s
  const reach = 0.85 + 0.4 * m + 0.25 * d.alert
  o[P.armLPitch] = reach + 0.12 * s + 0.08 * Math.sin(ph * 0.5 + d.seed * 6); o[P.armRPitch] = reach - 0.12 * s + 0.06 * Math.sin(ph * 0.5 + 2)
  if (d.limpArm < 0) o[P.armLPitch] = 0.12 - 0.15 * s; else if (d.limpArm > 0) o[P.armRPitch] = 0.12 + 0.15 * s
  o[P.armLSpread] = 0.06 + 0.05 * Math.sin(ph); o[P.armRSpread] = 0.04 - 0.05 * Math.sin(ph); o[P.elbowL] = 0.25 + 0.15 * Math.sin(ph + 1); o[P.elbowR] = 0.3 + 0.15 * Math.sin(ph + 2)
  o[P.headPitch] = -0.05 + 0.08 * c + (d.seed - 0.5) * 0.2; o[P.headRoll] = 0.28 * Math.sin(ph * 0.5 + d.seed * 6) + L * 0.12; o[P.headYaw] = 0.12 * Math.sin(ph * 0.5 + 1)
  o[P.jaw] = 0.2 + 0.3 * d.alert + 0.15 * Math.max(0, Math.sin(ph * 1.5))
}

function run(o: Float32Array, d: AnimDriver): void {
  const ph = d.phase, s = Math.sin(ph), c = Math.cos(ph), m = clamp(d.move, 0, 1.2), sd = d.seed * 6
  const A = 0.72 + 0.22 * m
  o[P.legLPitch] = A * s + 0.15; o[P.legRPitch] = -A * s + 0.15
  o[P.kneeL] = 0.25 + 1.45 * Math.max(0, c); o[P.kneeR] = 0.25 + 1.45 * Math.max(0, -c); o[P.legLSpread] = 0.06; o[P.legRSpread] = 0.06
  o[P.bodyPitch] = 0; o[P.bodyRoll] = 0.04 * s; o[P.bodyLie] = 0; o[P.bodyLift] = 0.07 * Math.abs(s) - 0.02; o[P.bodyFwd] = 0
  o[P.hipsDrop] = 0.06
  o[P.torsoPitch] = -0.42 - 0.12 * m + 0.05 * Math.cos(2 * ph); o[P.torsoYaw] = 0.25 * s; o[P.torsoRoll] = 0.08 * Math.sin(ph + sd)
  o[P.armLPitch] = 0.7 - 1.0 * s + 0.35 * Math.sin(3.1 * ph + sd); o[P.armRPitch] = 0.7 + 1.0 * s + 0.35 * Math.sin(2.7 * ph + 1 + sd)
  o[P.armLSpread] = 0.3 + 0.25 * Math.sin(1.7 * ph + sd); o[P.armRSpread] = 0.3 + 0.25 * Math.sin(2.3 * ph); o[P.elbowL] = 0.8 + 0.5 * Math.sin(3 * ph); o[P.elbowR] = 0.8 + 0.5 * Math.sin(3.4 * ph + 2)
  o[P.headPitch] = 0.25 + 0.1 * Math.sin(2 * ph); o[P.headRoll] = 0.15 * Math.sin(2 * ph + sd); o[P.headYaw] = 0.1 * Math.sin(ph)
  o[P.jaw] = 0.75 + 0.25 * Math.sin(4 * ph)
}

function lumber(o: Float32Array, d: AnimDriver): void {
  const ph = d.phase, s = Math.sin(ph), c = Math.cos(ph), m = clamp(d.move, 0, 1.2)
  const A = 0.24 + 0.3 * m
  o[P.legLPitch] = A * s; o[P.legRPitch] = -A * s; o[P.legLSpread] = 0.13; o[P.legRSpread] = 0.13
  o[P.kneeL] = 0.2 + 0.65 * Math.max(0, c); o[P.kneeR] = 0.2 + 0.65 * Math.max(0, -c)
  o[P.bodyPitch] = 0; o[P.bodyRoll] = 0.08 * s; o[P.bodyLie] = 0; o[P.bodyLift] = 0; o[P.bodyFwd] = 0
  o[P.hipsDrop] = 0.05 + 0.035 * (1 - Math.cos(2 * ph)) / 2
  o[P.torsoPitch] = -0.12 - 0.2 * m; o[P.torsoRoll] = -0.06 * s; o[P.torsoYaw] = 0.15 * s
  o[P.armLPitch] = 0.3 - 0.35 * s * (0.5 + m); o[P.armRPitch] = 0.3 + 0.35 * s * (0.5 + m); o[P.armLSpread] = 0.3; o[P.armRSpread] = 0.3; o[P.elbowL] = 0.35 + 0.15 * c; o[P.elbowR] = 0.35 - 0.15 * c
  o[P.headPitch] = 0.35 + 0.05 * c; o[P.headRoll] = 0.1 * Math.sin(ph); o[P.headYaw] = 0.08 * Math.sin(ph * 0.5)
  o[P.jaw] = 0.3 + 0.3 * m + 0.1 * Math.sin(2 * ph)
}

function quad(o: Float32Array, d: AnimDriver, S: BodySpec): void {
  const ph = d.phase, s = Math.sin(ph), c = Math.cos(ph), breathe = 0.04 * Math.sin(d.t * 2.2)
  const tp = -1.32
  o[P.bodyPitch] = 0; o[P.bodyRoll] = 0; o[P.bodyLie] = 0; o[P.bodyLift] = 0.03 * Math.abs(s); o[P.bodyFwd] = 0
  o[P.hipsDrop] = 1 - 0.62 / S.hipH
  o[P.torsoPitch] = tp - S.hunch + breathe; o[P.torsoRoll] = 0.1 * s; o[P.torsoYaw] = 0.12 * s
  o[P.legLPitch] = 0.95 + 0.4 * s; o[P.legRPitch] = 0.95 - 0.4 * s; o[P.kneeL] = 1.5 + 0.4 * Math.max(0, c); o[P.kneeR] = 1.5 + 0.4 * Math.max(0, -c); o[P.legLSpread] = 0.18; o[P.legRSpread] = 0.18
  o[P.armLPitch] = -tp - 0.45 * s; o[P.armRPitch] = -tp + 0.45 * s; o[P.armLSpread] = 0.14; o[P.armRSpread] = 0.14
  o[P.elbowL] = 0.25 + 0.5 * Math.max(0, -c); o[P.elbowR] = 0.25 + 0.5 * Math.max(0, c)
  o[P.headPitch] = 1.2 + 0.1 * Math.sin(2 * ph) - breathe; o[P.headRoll] = 0.12 * Math.sin(ph); o[P.headYaw] = 0.15 * Math.sin(0.5 * ph + d.seed * 4)
  o[P.jaw] = 0.3 + 0.45 * d.alert + 0.15 * Math.sin(3 * ph)
}

function drag(o: Float32Array, d: AnimDriver, S: BodySpec): void {
  const ph = d.phase, s = Math.sin(ph)
  o[P.bodyPitch] = 0; o[P.bodyRoll] = 0; o[P.bodyLie] = 0; o[P.bodyLift] = 0.02 * Math.abs(s); o[P.bodyFwd] = 0.05 * s
  o[P.hipsDrop] = 1 - S.lie * 1.1 / S.hipH
  o[P.torsoPitch] = -1.45 - S.hunch; o[P.torsoRoll] = 0.14 * s; o[P.torsoYaw] = 0.12 * s
  o[P.armLPitch] = 2.35 + 0.65 * s; o[P.armRPitch] = 2.35 - 0.65 * s; o[P.armLSpread] = 0.3; o[P.armRSpread] = 0.3
  o[P.elbowL] = 0.3 + 0.9 * Math.max(0, -s); o[P.elbowR] = 0.3 + 0.9 * Math.max(0, s)
  o[P.headPitch] = 1.15 + 0.1 * Math.sin(2 * ph); o[P.headRoll] = 0.15 * Math.sin(ph + d.seed * 5); o[P.headYaw] = 0.1 * Math.sin(ph * 0.5)
  o[P.jaw] = 0.45 + 0.35 * d.alert + 0.2 * Math.sin(3 * ph)
  o[P.legLPitch] = -1.45; o[P.legRPitch] = -1.4; o[P.kneeL] = 0.2 + 0.15 * s; o[P.kneeR] = 0.25 - 0.15 * s; o[P.legLSpread] = 0.15; o[P.legRSpread] = 0.18
}

function hobble(o: Float32Array, d: AnimDriver): void {
  const ph = d.phase, s = Math.sin(ph), c = Math.cos(ph), lost = d.legsLost & 1 ? -1 : 1
  shamble(o, d)
  const good = lost < 0 ? "R" : "L"
  if (good === "R") { o[P.legRPitch] = 0.35 * s; o[P.kneeR] = 0.25 + 0.5 * Math.max(0, c) } else { o[P.legLPitch] = 0.35 * s; o[P.kneeL] = 0.25 + 0.5 * Math.max(0, c) }
  o[P.bodyRoll] = -lost * 0.16 + 0.07 * s; o[P.hipsDrop] = 0.1 + 0.07 * Math.abs(s)
  o[P.torsoPitch] = -0.5; o[P.torsoRoll] = lost * 0.25
  o[P.armLPitch] = 0.6 + 0.4 * s; o[P.armRPitch] = 0.6 - 0.4 * s; o[P.armLSpread] = 0.4; o[P.armRSpread] = 0.4
}

// ------------------------------------------------------------------ overlays

const _base = new Float32Array(POSE_N), _ov = new Float32Array(POSE_N)

function overlay(o: Float32Array, d: AnimDriver, S: BodySpec): void {
  const t = d.actionT, w = Math.max(0.01, d.wind), dur = d.actionDur
  const weight = Math.min(smooth(0, 0.12, t), 1 - smooth(dur - 0.22, dur, t))
  if (weight <= 0) return
  _ov.set(o)
  const k = t < w ? smooth(0, 1, t / w) : 1, sk = t < w ? 0 : smooth(0, 0.3, (t - w) / Math.max(0.05, dur - w))
  const tremble = 0.05 * Math.sin(d.t * 50)
  switch (d.action) {
    case "claw": {
      const R = d.side > 0, ap = R ? P.armRPitch : P.armLPitch, as = R ? P.armRSpread : P.armLSpread, ae = R ? P.elbowR : P.elbowL
      const op = R ? P.armLPitch : P.armRPitch
      _ov[ap] = lerp(lerp(o[ap], 2.6, k), 0.45, sk); _ov[ae] = lerp(lerp(o[ae], 0.9, k), 0.15, sk); _ov[as] = lerp(lerp(o[as], 0.3, k), -0.25, sk)
      _ov[op] = 1.15
      _ov[P.torsoYaw] = lerp(-d.side * 0.35 * k, d.side * 0.45, sk); _ov[P.torsoPitch] = o[P.torsoPitch] + lerp(0.12 * k, -0.4, sk)
      _ov[P.jaw] = lerp(0.8 * k, 1, sk); _ov[P.headPitch] = o[P.headPitch] + 0.15
      break
    }
    case "bite": {
      _ov[P.torsoPitch] = o[P.torsoPitch] + lerp(0.15 * k, -0.6, sk); _ov[P.headPitch] = o[P.headPitch] + lerp(0.3 * k, 0.4, sk); _ov[P.jaw] = lerp(0.25, 1, Math.max(k * 0.5, sk))
      if (d.gait !== "drag" && d.gait !== "quad") { _ov[P.armLPitch] = lerp(o[P.armLPitch], 1.4, k); _ov[P.armRPitch] = lerp(o[P.armRPitch], 1.35, k); _ov[P.armLSpread] = -0.12; _ov[P.armRSpread] = -0.12; _ov[P.elbowL] = 0.5; _ov[P.elbowR] = 0.5 }
      _ov[P.bodyFwd] = o[P.bodyFwd] + 0.15 * sk
      break
    }
    case "slam": {
      const up = lerp(o[P.armLPitch], 2.95, k)
      _ov[P.armLPitch] = lerp(up, 0.3, sk); _ov[P.armRPitch] = lerp(up, 0.3, sk); _ov[P.armLSpread] = lerp(0.35, 0.1, sk); _ov[P.armRSpread] = lerp(0.35, 0.1, sk)
      _ov[P.elbowL] = lerp(0.45, 0.1, sk); _ov[P.elbowR] = lerp(0.45, 0.1, sk)
      _ov[P.torsoPitch] = o[P.torsoPitch] + lerp(0.3 * k, -0.75, sk); _ov[P.headPitch] = 0.3 + 0.3 * k - 0.2 * sk; _ov[P.jaw] = 1
      _ov[P.hipsDrop] = o[P.hipsDrop] + 0.15 * sk; _ov[P.kneeL] = o[P.kneeL] + 0.5 * sk; _ov[P.kneeR] = o[P.kneeR] + 0.5 * sk
      break
    }
    case "scream": case "roar": {
      const e = smooth(0, 0.35, t) * (1 - smooth(dur - 0.4, dur, t))
      const wide = d.action === "roar"
      _ov[P.armLPitch] = wide ? 0.55 : -0.85 + tremble; _ov[P.armRPitch] = wide ? 0.6 : -0.8 - tremble; _ov[P.armLSpread] = wide ? 1.15 : 0.55; _ov[P.armRSpread] = wide ? 1.2 : 0.55
      _ov[P.elbowL] = wide ? 0.7 : 0.3; _ov[P.elbowR] = wide ? 0.6 : 0.3
      _ov[P.torsoPitch] = (wide ? 0.25 : 0.32) - S.hunch * 0.6; _ov[P.headPitch] = 0.75 + tremble; _ov[P.headRoll] = tremble * 2; _ov[P.jaw] = 1
      _ov[P.hipsDrop] = 0.05; _ov[P.kneeL] = 0.25; _ov[P.kneeR] = 0.2
      for (let i = 0; i < POSE_N; i++) _ov[i] = lerp(o[i], _ov[i], e)
      break
    }
    case "spit": {
      _ov[P.torsoPitch] = o[P.torsoPitch] + lerp(0.42 * k, -0.5, sk); _ov[P.headPitch] = o[P.headPitch] + lerp(0.55 * k, -0.15, sk); _ov[P.jaw] = lerp(0.15, 1, sk)
      _ov[P.armLSpread] = 0.35; _ov[P.armRSpread] = 0.35; _ov[P.armLPitch] = 0.25; _ov[P.armRPitch] = 0.2
      _ov[P.bodyFwd] = 0.1 * sk
      break
    }
    case "leap": {
      if (t < w) {
        _ov[P.hipsDrop] = o[P.hipsDrop] + 0.12 * k; _ov[P.kneeL] = o[P.kneeL] + 0.3 * k; _ov[P.kneeR] = o[P.kneeR] + 0.3 * k; _ov[P.headPitch] = o[P.headPitch] + 0.2 * k; _ov[P.jaw] = 0.6 + 0.4 * k
        _ov[P.armLPitch] = o[P.armLPitch] - 0.4 * k; _ov[P.armRPitch] = o[P.armRPitch] - 0.4 * k
      } else {
        const f = smooth(0, 0.15, t - w)
        _ov[P.hipsDrop] = lerp(o[P.hipsDrop], 0.25, f); _ov[P.torsoPitch] = lerp(o[P.torsoPitch], -1.15 - S.hunch, f)
        _ov[P.armLPitch] = lerp(o[P.armLPitch], 2.5, f); _ov[P.armRPitch] = lerp(o[P.armRPitch], 2.6, f); _ov[P.armLSpread] = 0.35; _ov[P.armRSpread] = 0.35; _ov[P.elbowL] = 0.25; _ov[P.elbowR] = 0.3
        _ov[P.legLPitch] = lerp(o[P.legLPitch], -0.45, f); _ov[P.legRPitch] = lerp(o[P.legRPitch], -0.3, f); _ov[P.kneeL] = 0.6; _ov[P.kneeR] = 0.8
        _ov[P.headPitch] = 0.95; _ov[P.jaw] = 1
      }
      break
    }
    case "charge": {
      _ov[P.torsoPitch] = o[P.torsoPitch] - 0.45; _ov[P.headPitch] = 0.55; _ov[P.armLPitch] = -0.35 + 0.3 * Math.sin(d.phase); _ov[P.armRPitch] = -0.35 - 0.3 * Math.sin(d.phase)
      _ov[P.armLSpread] = 0.45; _ov[P.armRSpread] = 0.45; _ov[P.jaw] = 1
      break
    }
    case "stunned": {
      _ov[P.torsoPitch] = o[P.torsoPitch] + 0.25 + 0.15 * Math.sin(t * 3); _ov[P.headRoll] = 0.5 * Math.sin(t * 2); _ov[P.headPitch] = -0.2
      _ov[P.armLPitch] = 0.1; _ov[P.armRPitch] = 0.15; _ov[P.armLSpread] = 0.35; _ov[P.armRSpread] = 0.3; _ov[P.kneeL] = 0.4; _ov[P.kneeR] = 0.3; _ov[P.hipsDrop] = 0.08; _ov[P.jaw] = 0.7
      break
    }
    default: return
  }
  for (let i = 0; i < POSE_N; i++) o[i] = lerp(o[i], _ov[i], weight)
}

// ------------------------------------------------------------------ entry points

/** Target pose for a living infected that is not playing a clip. */
export function computePose(o: Float32Array, d: AnimDriver, S: BodySpec): void {
  const walkW = clamp(d.speed / 0.35, 0, 1)
  switch (d.gait) {
    case "quad": quad(o, d, S); break
    case "drag": drag(o, d, S); break
    case "hobble": hobble(o, d); break
    default: {
      idle(o, d, S)
      if (walkW > 0) {
        _base.set(o)
        if (d.gait === "run") run(o, d); else if (d.gait === "lumber") lumber(o, d); else shamble(o, d)
        if (walkW < 1) for (let i = 0; i < POSE_N; i++) o[i] = lerp(_base[i], o[i], walkW)
      }
    }
  }
  if (d.action !== "none") overlay(o, d, S)
  if (d.stagger > 0) {
    const a = d.stagger
    o[P.torsoPitch] += a * 0.5 * d.hitZ; o[P.torsoRoll] -= a * 0.45 * d.hitX
    o[P.headPitch] += a * 0.6 * d.hitZ; o[P.headRoll] -= a * 0.6 * d.hitX
    o[P.armLSpread] += a * 0.35; o[P.armRSpread] += a * 0.35; o[P.jaw] += a * 0.4
    o[P.bodyRoll] -= a * 0.08 * d.hitX; o[P.bodyPitch] += a * 0.06 * d.hitZ
  }
  // lost arms hang still (the part is hidden; keep the pose calm for the stump)
  if (d.armsLost & 1) { o[P.armLPitch] = 0; o[P.elbowL] = 0 }
  if (d.armsLost & 2) { o[P.armRPitch] = 0; o[P.elbowR] = 0 }
}

/** Corpse pose of an infected that died on the ground (crawler, legless): slumps flat, arms out. */
export function crawlDeathPose(o: Float32Array, d: AnimDriver, S: BodySpec): void {
  drag(o, d, S)
  o[P.torsoPitch] = -1.57 - S.hunch; o[P.torsoRoll] = 0; o[P.torsoYaw] = 0; o[P.bodyLift] = 0; o[P.bodyFwd] = 0
  o[P.armLPitch] = 2.95; o[P.armRPitch] = 2.6; o[P.armLSpread] = 0.5; o[P.armRSpread] = 0.25; o[P.elbowL] = 0.1; o[P.elbowR] = 0.2
  o[P.headPitch] = 0.1; o[P.headYaw] = 0.9; o[P.headRoll] = 0; o[P.jaw] = 0.6
}

/** Gait cycle length in metres (one full left-right stride) used to advance the phase from ground speed. */
export function cycleLength(gait: Gait, S: BodySpec): number {
  const k = S.hipH / 0.9
  switch (gait) {
    case "run": return 2.6 * k
    case "lumber": return 1.9 * k
    case "quad": return 1.5 * k
    case "drag": return 0.7
    case "hobble": return 0.7 * k
    default: return 1.05 * k
  }
}
