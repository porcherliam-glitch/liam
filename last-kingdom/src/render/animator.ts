// Procedural animation for the skinned humanoid. Clips are either keyframed (attacks, hits, deaths) or
// generated from a phase (walk cycles). The animator blends between clips so transitions look smooth.
//
// Conventions: the character faces +Z. Negative X rotation moves limbs forward; arms hang along -Y.

import type { BoneName, Humanoid } from "./humanoid"
import { lerp } from "../core/math"

export type Pose = Partial<Record<BoneName, [number, number, number]>> & {
  /** Hip height offset in metres (crouch, jump). */
  rootY?: number
  /** Whole-body forward lean / tumble around X in radians. */
  rootPitch?: number
  /** Whole body sideways tilt. */
  rootRoll?: number
}

export interface ClipContext {
  /** Walk cycle phase in radians, driven by distance travelled. */
  phase: number
  /** Movement speed 0..1 relative to run speed. */
  speed: number
  time: number
}

export interface Clip {
  duration: number
  loop: boolean
  sample: (t: number, ctx: ClipContext) => Pose
  /** Optional: blend-in time override. */
  blend?: number
}

const F = -1 // forward sign

type Frame = { t: number; pose: Pose }

function sampleFrames(frames: Frame[], t: number): Pose {
  if (t <= frames[0].t) return frames[0].pose
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t)
      const s = u * u * (3 - 2 * u)
      return blendPose(a.pose, b.pose, s)
    }
  }
  return frames[frames.length - 1].pose
}

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {}
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const key = k as keyof Pose
    if (key === "rootY" || key === "rootPitch" || key === "rootRoll") {
      out[key] = lerp((a[key] as number) ?? 0, (b[key] as number) ?? 0, t)
    } else {
      const va = (a[key as BoneName] as [number, number, number]) ?? [0, 0, 0]
      const vb = (b[key as BoneName] as [number, number, number]) ?? [0, 0, 0]
      out[key as BoneName] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t), lerp(va[2], vb[2], t)]
    }
  }
  return out
}

function keyed(duration: number, frames: Frame[], loop = false, blend?: number): Clip {
  return { duration, loop, blend, sample: (t) => sampleFrames(frames, t / duration) }
}

function proc(sample: (t: number, ctx: ClipContext) => Pose, duration = 1, blend?: number): Clip {
  return { duration, loop: true, blend, sample }
}

// ---- shared poses -----------------------------------------------------------

const REST: Pose = {}

const ARMS_READY: Pose = {
  upperArmR: [F * 0.5, 0, 0.35],
  forearmR: [F * 0.9, 0, 0],
  upperArmL: [F * 0.4, 0, -0.3],
  forearmL: [F * 0.7, 0, 0],
}

const SHIELD_UP: Pose = {
  upperArmL: [F * 1.1, 0.5, -0.1],
  forearmL: [F * 1.0, -0.6, 0],
}

const ZOMBIE_STANCE: Pose = {
  spine: [F * 0.35, 0, 0],
  chest: [F * 0.2, 0, 0],
  head: [-F * 0.35, 0, 0.1],
  upperArmR: [F * 0.9, 0, 0.2],
  forearmR: [F * 0.4, 0, 0],
  upperArmL: [F * 0.7, 0, -0.25],
  forearmL: [F * 0.6, 0, 0],
  thighL: [0, 0, 0.08],
  thighR: [0, 0, -0.08],
}

// ---- locomotion --------------------------------------------------------------

function walkCycle(ctx: ClipContext, amp: number, lean: number, bob: number, armAmp: number, hunch = 0): Pose {
  const p = ctx.phase
  const s = Math.sin(p)
  const c = Math.cos(p)
  const k = ctx.speed
  return {
    thighL: [F * s * amp * k, 0, 0.03],
    thighR: [-F * s * amp * k, 0, -0.03],
    shinL: [F * Math.max(0, -c) * amp * 1.2 * k + F * 0.1 * k, 0, 0],
    shinR: [F * Math.max(0, c) * amp * 1.2 * k + F * 0.1 * k, 0, 0],
    footL: [0.1 * k, 0, 0],
    footR: [0.1 * k, 0, 0],
    upperArmL: [-F * s * armAmp * k + F * hunch, 0, -0.15],
    upperArmR: [F * s * armAmp * k + F * hunch, 0, 0.15],
    forearmL: [F * (0.3 + hunch * 0.5) * k, 0, 0],
    forearmR: [F * (0.3 + hunch * 0.5) * k, 0, 0],
    spine: [F * lean * k + F * hunch * 0.6, s * 0.05 * k, 0],
    chest: [F * lean * 0.5 * k, -s * 0.08 * k, 0],
    head: [-F * lean * 0.6 * k - F * hunch * 0.6, 0, 0],
    rootY: -Math.abs(c) * bob * k,
  }
}

export const CLIPS: Record<string, Clip> = {
  rest: proc(() => REST),
  idle: proc((t) => ({
    chest: [F * 0.02 + Math.sin(t * 1.6) * 0.015, 0, 0],
    upperArmL: [0.06, 0, -0.12 + Math.sin(t * 1.6) * 0.01],
    upperArmR: [0.06, 0, 0.12 - Math.sin(t * 1.6) * 0.01],
    forearmL: [F * 0.12, 0, 0],
    forearmR: [F * 0.12, 0, 0],
    head: [Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.4) * 0.08, 0],
    rootY: Math.sin(t * 1.6) * 0.004,
  })),
  combat_idle: proc((t) => ({
    ...ARMS_READY,
    spine: [F * 0.08, 0, 0],
    chest: [F * 0.05 + Math.sin(t * 2) * 0.01, 0.15, 0],
    thighL: [F * 0.12, 0, 0.1],
    thighR: [-F * 0.1, 0, -0.1],
    shinL: [F * 0.2, 0, 0],
    shinR: [F * 0.18, 0, 0],
    rootY: -0.03,
  })),
  walk: proc((_, ctx) => walkCycle(ctx, 0.5, 0.04, 0.02, 0.35)),
  run: proc((_, ctx) => walkCycle(ctx, 0.85, 0.18, 0.045, 0.7)),
  sprint: proc((_, ctx) => walkCycle(ctx, 1.05, 0.32, 0.06, 0.95)),
  strafe: proc((_, ctx) => walkCycle(ctx, 0.5, 0.05, 0.02, 0.2)),
  jump: keyed(0.5, [
    { t: 0, pose: { thighL: [F * 0.6, 0, 0], thighR: [F * 0.6, 0, 0], shinL: [-F * 0.9, 0, 0], shinR: [-F * 0.9, 0, 0], upperArmL: [F * 1.2, 0, -0.4], upperArmR: [F * 1.2, 0, 0.4], rootY: -0.15 } },
    { t: 0.3, pose: { thighL: [F * 0.9, 0, 0], thighR: [F * 0.2, 0, 0], shinL: [-F * 1.4, 0, 0], shinR: [-F * 0.5, 0, 0], upperArmL: [F * 0.4, 0, -0.9], upperArmR: [F * 0.4, 0, 0.9], spine: [F * 0.1, 0, 0] } },
    { t: 1, pose: { thighL: [F * 0.5, 0, 0], thighR: [F * 0.3, 0, 0], shinL: [-F * 0.8, 0, 0], shinR: [-F * 0.6, 0, 0], upperArmL: [F * 0.2, 0, -0.8], upperArmR: [F * 0.2, 0, 0.8] } },
  ]),
  fall: proc((t) => ({
    thighL: [F * 0.3, 0, 0.1],
    thighR: [F * 0.2, 0, -0.1],
    shinL: [-F * 0.5, 0, 0],
    shinR: [-F * 0.6, 0, 0],
    upperArmL: [F * 0.3 + Math.sin(t * 9) * 0.1, 0, -1.2],
    upperArmR: [F * 0.3 - Math.sin(t * 9) * 0.1, 0, 1.2],
    spine: [F * 0.15, 0, 0],
  })),
  land: keyed(0.3, [
    { t: 0, pose: { thighL: [F * 0.9, 0, 0.1], thighR: [F * 0.9, 0, -0.1], shinL: [-F * 1.4, 0, 0], shinR: [-F * 1.4, 0, 0], spine: [F * 0.4, 0, 0], upperArmL: [F * 0.6, 0, -0.5], upperArmR: [F * 0.6, 0, 0.5], rootY: -0.35 } },
    { t: 1, pose: REST },
  ]),
  dodge: keyed(0.55, [
    { t: 0, pose: { spine: [F * 0.4, 0, 0], thighL: [F * 0.8, 0, 0], thighR: [F * 0.8, 0, 0], shinL: [-F * 1.2, 0, 0], shinR: [-F * 1.2, 0, 0], upperArmL: [F * 1.0, 0, -0.3], upperArmR: [F * 1.0, 0, 0.3], forearmL: [F * 1.2, 0, 0], forearmR: [F * 1.2, 0, 0], rootY: -0.2 } },
    { t: 0.25, pose: { rootPitch: F * 1.6, spine: [F * 0.9, 0, 0], head: [F * 0.6, 0, 0], thighL: [F * 1.6, 0, 0], thighR: [F * 1.6, 0, 0], shinL: [-F * 2.2, 0, 0], shinR: [-F * 2.2, 0, 0], upperArmL: [F * 1.4, 0, -0.3], upperArmR: [F * 1.4, 0, 0.3], forearmL: [F * 1.6, 0, 0], forearmR: [F * 1.6, 0, 0], rootY: -0.55 } },
    { t: 0.55, pose: { rootPitch: F * 4.4, spine: [F * 0.9, 0, 0], head: [F * 0.6, 0, 0], thighL: [F * 1.6, 0, 0], thighR: [F * 1.6, 0, 0], shinL: [-F * 2.2, 0, 0], shinR: [-F * 2.2, 0, 0], upperArmL: [F * 1.4, 0, -0.3], upperArmR: [F * 1.4, 0, 0.3], forearmL: [F * 1.6, 0, 0], forearmR: [F * 1.6, 0, 0], rootY: -0.55 } },
    { t: 0.8, pose: { rootPitch: F * 6.283, spine: [F * 0.5, 0, 0], thighL: [F * 0.9, 0, 0], thighR: [F * 0.9, 0, 0], shinL: [-F * 1.4, 0, 0], shinR: [-F * 1.4, 0, 0], upperArmL: [F * 0.6, 0, -0.4], upperArmR: [F * 0.6, 0, 0.4], rootY: -0.3 } },
    { t: 1, pose: { rootPitch: F * 6.283, ...ARMS_READY } },
  ]),
  // ---- melee attacks: progress 0..1; the hit lands around 0.45 ----
  slash_r: keyed(0.55, [
    { t: 0, pose: { ...ARMS_READY, chest: [0, 0.2, 0] } },
    { t: 0.3, pose: { upperArmR: [F * 1.4, -0.8, 1.3], forearmR: [F * 0.4, 0, 0], chest: [F * 0.05, 0.75, 0], spine: [0, 0.3, 0], head: [0, -0.4, 0], upperArmL: [F * 0.6, 0, -0.5], forearmL: [F * 0.9, 0, 0] } },
    { t: 0.55, pose: { upperArmR: [F * 1.5, 0.6, -0.2], forearmR: [F * 0.2, 0, 0], chest: [F * 0.15, -0.8, 0], spine: [F * 0.1, -0.35, 0], head: [0, 0.3, 0], upperArmL: [F * 0.3, 0, -0.6], forearmL: [F * 0.8, 0, 0], thighL: [F * 0.2, 0, 0.1], thighR: [-F * 0.1, 0, -0.1] } },
    { t: 1, pose: { ...ARMS_READY, chest: [F * 0.05, 0.1, 0] } },
  ]),
  slash_l: keyed(0.55, [
    { t: 0, pose: { ...ARMS_READY, chest: [0, -0.3, 0] } },
    { t: 0.3, pose: { upperArmR: [F * 1.5, 0.9, -0.5], forearmR: [F * 0.3, 0, 0], chest: [F * 0.05, -0.9, 0], spine: [0, -0.3, 0], head: [0, 0.4, 0], upperArmL: [F * 0.6, 0, -0.5], forearmL: [F * 0.9, 0, 0] } },
    { t: 0.55, pose: { upperArmR: [F * 1.3, -0.7, 1.0], forearmR: [F * 0.3, 0, 0], chest: [F * 0.15, 0.7, 0], spine: [F * 0.1, 0.3, 0], head: [0, -0.3, 0], upperArmL: [F * 0.3, 0, -0.6], forearmL: [F * 0.8, 0, 0] } },
    { t: 1, pose: { ...ARMS_READY, chest: [F * 0.05, 0.1, 0] } },
  ]),
  overhead: keyed(0.7, [
    { t: 0, pose: { ...ARMS_READY } },
    { t: 0.35, pose: { upperArmR: [F * 3.0, 0, 0.4], forearmR: [F * 1.0, 0, 0], chest: [-F * 0.25, 0.2, 0], spine: [-F * 0.15, 0, 0], head: [-F * 0.2, 0, 0], upperArmL: [F * 2.4, 0, -0.4], forearmL: [F * 0.9, 0, 0], rootY: 0.03 } },
    { t: 0.55, pose: { upperArmR: [F * 0.8, 0, 0.3], forearmR: [F * 0.2, 0, 0], chest: [F * 0.55, 0.1, 0], spine: [F * 0.3, 0, 0], head: [F * 0.2, 0, 0], upperArmL: [F * 0.8, 0, -0.4], forearmL: [F * 0.4, 0, 0], thighL: [F * 0.4, 0, 0.1], shinL: [-F * 0.5, 0, 0], thighR: [-F * 0.2, 0, -0.1], rootY: -0.12 } },
    { t: 1, pose: { ...ARMS_READY, rootY: -0.03 } },
  ]),
  thrust: keyed(0.45, [
    { t: 0, pose: { ...ARMS_READY } },
    { t: 0.3, pose: { upperArmR: [F * 0.4, 0, 0.5], forearmR: [F * 1.6, 0, 0], chest: [0, 0.5, 0], spine: [0, 0.25, 0], upperArmL: [F * 0.9, 0, -0.4], forearmL: [F * 1.0, 0, 0] } },
    { t: 0.55, pose: { upperArmR: [F * 1.6, 0.2, 0.1], forearmR: [F * 0.1, 0, 0], chest: [F * 0.25, -0.55, 0], spine: [F * 0.15, -0.3, 0], upperArmL: [F * 0.3, 0, -0.6], forearmL: [F * 0.6, 0, 0], thighL: [F * 0.5, 0, 0.1], shinL: [-F * 0.6, 0, 0], thighR: [-F * 0.3, 0, -0.1], rootY: -0.08 } },
    { t: 1, pose: { ...ARMS_READY } },
  ]),
  chop: keyed(0.6, [
    { t: 0, pose: { ...ARMS_READY } },
    { t: 0.35, pose: { upperArmR: [F * 2.6, -0.6, 1.0], forearmR: [F * 1.1, 0, 0], chest: [-F * 0.15, 0.6, 0], spine: [0, 0.25, 0], head: [0, -0.3, 0], upperArmL: [F * 1.0, 0, -0.5], forearmL: [F * 1.0, 0, 0] } },
    { t: 0.55, pose: { upperArmR: [F * 0.9, 0.4, -0.1], forearmR: [F * 0.1, 0, 0], chest: [F * 0.45, -0.6, 0], spine: [F * 0.25, -0.3, 0], head: [F * 0.1, 0.2, 0], upperArmL: [F * 0.5, 0, -0.6], forearmL: [F * 0.5, 0, 0], thighL: [F * 0.4, 0, 0.1], shinL: [-F * 0.5, 0, 0], rootY: -0.1 } },
    { t: 1, pose: { ...ARMS_READY } },
  ]),
  heavy_overhead: keyed(1.0, [
    { t: 0, pose: { ...ARMS_READY } },
    { t: 0.4, pose: { upperArmR: [F * 3.1, 0.2, 0.5], forearmR: [F * 1.2, 0, 0], upperArmL: [F * 3.0, -0.2, -0.5], forearmL: [F * 1.2, 0, 0], chest: [-F * 0.35, 0, 0], spine: [-F * 0.2, 0, 0], head: [-F * 0.3, 0, 0], thighL: [-F * 0.1, 0, 0.1], thighR: [F * 0.2, 0, -0.1], rootY: 0.04 } },
    { t: 0.5, pose: { upperArmR: [F * 3.2, 0.2, 0.5], forearmR: [F * 1.1, 0, 0], upperArmL: [F * 3.1, -0.2, -0.5], forearmL: [F * 1.1, 0, 0], chest: [-F * 0.4, 0, 0], spine: [-F * 0.25, 0, 0], head: [-F * 0.3, 0, 0], rootY: 0.05 } },
    { t: 0.62, pose: { upperArmR: [F * 0.7, 0, 0.3], forearmR: [F * 0.1, 0, 0], upperArmL: [F * 0.7, 0, -0.3], forearmL: [F * 0.1, 0, 0], chest: [F * 0.7, 0, 0], spine: [F * 0.4, 0, 0], head: [F * 0.3, 0, 0], thighL: [F * 0.7, 0, 0.1], shinL: [-F * 0.9, 0, 0], thighR: [-F * 0.3, 0, -0.1], rootY: -0.2 } },
    { t: 1, pose: { ...ARMS_READY, rootY: -0.03 } },
  ]),
  heavy_spin: keyed(1.0, [
    { t: 0, pose: { ...ARMS_READY } },
    { t: 0.35, pose: { upperArmR: [F * 1.4, -1.2, 1.5], forearmR: [F * 0.3, 0, 0], upperArmL: [F * 1.2, -1.0, -0.2], forearmL: [F * 0.6, 0, 0], chest: [F * 0.1, 1.2, 0], spine: [0, 0.6, 0], head: [0, -0.6, 0] } },
    { t: 0.6, pose: { upperArmR: [F * 1.5, 0.9, -0.3], forearmR: [F * 0.2, 0, 0], upperArmL: [F * 1.5, 1.0, -1.2], forearmL: [F * 0.3, 0, 0], chest: [F * 0.3, -1.4, 0], spine: [F * 0.15, -0.8, 0], head: [0, 0.6, 0], thighL: [F * 0.3, 0, 0.1], thighR: [-F * 0.2, 0, -0.1], rootY: -0.12 } },
    { t: 1, pose: { ...ARMS_READY } },
  ]),
  lunge: keyed(0.8, [
    { t: 0, pose: { ...ARMS_READY } },
    { t: 0.4, pose: { upperArmR: [F * 0.2, 0, 0.6], forearmR: [F * 1.9, 0, 0], chest: [-F * 0.1, 0.6, 0], spine: [0, 0.3, 0], upperArmL: [F * 1.2, 0, -0.4], forearmL: [F * 1.2, 0, 0], thighR: [F * 0.3, 0, -0.1] } },
    { t: 0.6, pose: { upperArmR: [F * 1.7, 0.1, 0.1], forearmR: [F * 0.05, 0, 0], chest: [F * 0.4, -0.5, 0], spine: [F * 0.25, -0.3, 0], upperArmL: [F * 0.2, 0, -0.7], forearmL: [F * 0.5, 0, 0], thighL: [F * 0.9, 0, 0.1], shinL: [-F * 1.0, 0, 0], thighR: [-F * 0.5, 0, -0.1], rootY: -0.22 } },
    { t: 1, pose: { ...ARMS_READY } },
  ]),
  // ---- ranged ----
  bow_draw: keyed(1, [
    { t: 0, pose: { upperArmL: [F * 1.5, 0.3, -0.1], forearmL: [0, 0, 0], upperArmR: [F * 1.2, -0.2, 0.9], forearmR: [F * 1.5, 0.8, 0], chest: [0, 0.9, 0], spine: [0, 0.3, 0], head: [0, -0.9, 0] } },
    { t: 1, pose: { upperArmL: [F * 1.55, 0.35, -0.1], forearmL: [0, 0, 0], upperArmR: [F * 1.3, -0.9, 1.5], forearmR: [F * 1.7, 1.1, 0], chest: [0, 0.95, 0], spine: [0, 0.35, 0], head: [0, -0.95, 0] } },
  ]),
  bow_release: keyed(0.35, [
    { t: 0, pose: { upperArmL: [F * 1.55, 0.35, -0.1], forearmL: [0, 0, 0], upperArmR: [F * 1.0, -1.4, 1.6], forearmR: [F * 1.1, 1.1, 0], chest: [0, 0.95, 0], spine: [0, 0.35, 0], head: [0, -0.95, 0] } },
    { t: 1, pose: { upperArmL: [F * 1.4, 0.3, -0.1], upperArmR: [F * 0.9, -0.5, 0.9], forearmR: [F * 1.0, 0.5, 0], chest: [0, 0.8, 0], spine: [0, 0.3, 0], head: [0, -0.8, 0] } },
  ]),
  crossbow_aim: keyed(1, [
    { t: 0, pose: { upperArmR: [F * 1.4, 0.2, 0.2], forearmR: [F * 0.2, 0, 0], upperArmL: [F * 1.2, 0.3, -0.3], forearmL: [F * 0.8, -0.4, 0], chest: [0, 0.2, 0], head: [F * 0.15, -0.2, 0] } },
    { t: 1, pose: { upperArmR: [F * 1.42, 0.2, 0.2], forearmR: [F * 0.2, 0, 0], upperArmL: [F * 1.2, 0.3, -0.3], forearmL: [F * 0.8, -0.4, 0], chest: [0, 0.2, 0], head: [F * 0.15, -0.2, 0] } },
  ]),
  crossbow_reload: keyed(1, [
    { t: 0, pose: { upperArmR: [F * 0.8, 0, 0.3], forearmR: [F * 1.2, 0, 0], upperArmL: [F * 0.6, 0, -0.3], forearmL: [F * 1.4, 0, 0], spine: [F * 0.25, 0, 0], head: [F * 0.4, 0, 0] } },
    { t: 0.5, pose: { upperArmR: [F * 1.4, 0, 0.3], forearmR: [F * 0.6, 0, 0], upperArmL: [F * 0.6, 0, -0.3], forearmL: [F * 1.4, 0, 0], spine: [F * 0.3, 0, 0], head: [F * 0.45, 0, 0] } },
    { t: 1, pose: { upperArmR: [F * 0.8, 0, 0.3], forearmR: [F * 1.2, 0, 0], upperArmL: [F * 0.6, 0, -0.3], forearmL: [F * 1.4, 0, 0], spine: [F * 0.2, 0, 0], head: [F * 0.3, 0, 0] } },
  ]),
  // ---- defence / reactions ----
  block: proc((t) => ({ ...SHIELD_UP, upperArmR: [F * 0.6, 0, 0.4], forearmR: [F * 1.1, 0, 0], spine: [F * 0.12, 0.2, 0], chest: [F * 0.05 + Math.sin(t * 3) * 0.01, 0.15, 0], thighL: [F * 0.25, 0, 0.1], shinL: [-F * 0.3, 0, 0], rootY: -0.06 })),
  block_weapon: proc(() => ({ upperArmR: [F * 1.3, 0.9, 0.3], forearmR: [F * 1.4, 0, 0], upperArmL: [F * 0.8, 0, -0.4], forearmL: [F * 1.2, 0, 0], spine: [F * 0.15, 0.2, 0], rootY: -0.06 })),
  block_hit: keyed(0.3, [
    { t: 0, pose: { ...SHIELD_UP, upperArmL: [F * 0.8, 0.4, -0.1], spine: [-F * 0.15, 0.2, 0], chest: [-F * 0.1, 0, 0], rootY: -0.1 } },
    { t: 1, pose: { ...SHIELD_UP, spine: [F * 0.12, 0.2, 0], rootY: -0.06 } },
  ]),
  hit: keyed(0.35, [
    { t: 0, pose: { spine: [-F * 0.35, 0.2, 0], chest: [-F * 0.2, 0, 0], head: [-F * 0.3, 0, 0], upperArmL: [F * 0.9, 0, -0.6], upperArmR: [F * 0.9, 0, 0.6], forearmL: [F * 0.8, 0, 0], forearmR: [F * 0.8, 0, 0], rootY: -0.05 } },
    { t: 1, pose: { ...ARMS_READY } },
  ]),
  stagger: keyed(0.7, [
    { t: 0, pose: { spine: [-F * 0.5, 0.3, 0], chest: [-F * 0.3, 0, 0], head: [-F * 0.4, 0, 0], upperArmL: [F * 0.6, 0, -1.0], upperArmR: [F * 0.6, 0, 1.0], thighL: [F * 0.4, 0, 0.1], shinL: [-F * 0.6, 0, 0], rootY: -0.12 } },
    { t: 0.6, pose: { spine: [-F * 0.3, -0.2, 0], chest: [-F * 0.1, 0, 0], head: [-F * 0.2, 0, 0], upperArmL: [F * 0.4, 0, -0.8], upperArmR: [F * 0.4, 0, 0.8], thighR: [F * 0.3, 0, -0.1], rootY: -0.08 } },
    { t: 1, pose: REST },
  ]),
  death_back: keyed(1.1, [
    { t: 0, pose: { spine: [-F * 0.3, 0, 0], upperArmL: [F * 1.0, 0, -0.8], upperArmR: [F * 1.0, 0, 0.8] } },
    { t: 0.5, pose: { rootPitch: -F * 1.2, rootY: -0.5, spine: [-F * 0.2, 0, 0], head: [F * 0.3, 0, 0], upperArmL: [F * 1.2, 0, -1.3], upperArmR: [F * 1.2, 0, 1.3], thighL: [F * 0.4, 0, 0.2], thighR: [F * 0.3, 0, -0.2], shinL: [-F * 0.5, 0, 0], shinR: [-F * 0.3, 0, 0] } },
    { t: 1, pose: { rootPitch: -F * 1.5, rootY: -0.78, spine: [0, 0, 0], head: [F * 0.4, 0.3, 0], upperArmL: [F * 0.4, 0, -1.6], upperArmR: [F * 0.3, 0, 1.4], forearmL: [F * 0.3, 0, 0], thighL: [F * 0.2, 0, 0.25], thighR: [F * 0.1, 0, -0.2], shinL: [-F * 0.2, 0, 0] } },
  ]),
  death_front: keyed(1.0, [
    { t: 0, pose: { spine: [F * 0.4, 0, 0], head: [F * 0.3, 0, 0], thighL: [F * 0.5, 0, 0], thighR: [F * 0.5, 0, 0], shinL: [-F * 0.9, 0, 0], shinR: [-F * 0.9, 0, 0], rootY: -0.25 } },
    { t: 0.45, pose: { rootPitch: F * 1.0, rootY: -0.5, spine: [F * 0.3, 0, 0], head: [-F * 0.3, 0, 0], upperArmL: [F * 1.8, 0, -0.5], upperArmR: [F * 1.8, 0, 0.5], thighL: [F * 0.3, 0, 0.1], thighR: [F * 0.2, 0, -0.1] } },
    { t: 1, pose: { rootPitch: F * 1.5, rootY: -0.8, spine: [0, 0, 0], head: [-F * 0.1, 0.5, 0], upperArmL: [F * 2.6, 0, -0.5], upperArmR: [F * 1.2, 0, 1.2], forearmR: [F * 1.5, 0, 0], thighL: [0, 0, 0.2], thighR: [0, 0, -0.1], shinR: [-F * 0.5, 0, 0] } },
  ]),
  interact: keyed(0.6, [
    { t: 0, pose: { upperArmR: [F * 0.6, 0, 0.2] } },
    { t: 0.4, pose: { upperArmR: [F * 1.4, 0, 0.1], forearmR: [F * 0.4, 0, 0], spine: [F * 0.25, 0, 0], head: [F * 0.2, 0, 0], rootY: -0.1 } },
    { t: 1, pose: REST },
  ]),
  use_item: keyed(1.0, [
    { t: 0, pose: { upperArmR: [F * 0.6, 0, 0.2] } },
    { t: 0.35, pose: { upperArmR: [F * 1.5, 0.3, 0.4], forearmR: [F * 2.3, 0, 0], head: [-F * 0.25, 0, 0] } },
    { t: 0.7, pose: { upperArmR: [F * 1.5, 0.3, 0.4], forearmR: [F * 2.3, 0, 0], head: [-F * 0.35, 0, 0] } },
    { t: 1, pose: REST },
  ]),
  // ---- zombies ----
  z_idle: proc((t) => ({
    ...ZOMBIE_STANCE,
    chest: [F * 0.2 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.5) * 0.1, 0],
    head: [-F * 0.35 + Math.sin(t * 0.9) * 0.08, Math.sin(t * 0.6) * 0.3, 0.1 + Math.sin(t * 0.4) * 0.1],
    upperArmR: [F * 0.9 + Math.sin(t * 1.3) * 0.05, 0, 0.2],
    upperArmL: [F * 0.7 + Math.cos(t * 1.1) * 0.05, 0, -0.25],
  })),
  z_walk: proc((t, ctx) => {
    const w = walkCycle({ ...ctx, speed: Math.max(0.6, ctx.speed) }, 0.45, 0.1, 0.03, 0.1, 0.55)
    const p = ctx.phase
    return {
      ...w,
      head: [-F * 0.4, Math.sin(t * 0.8) * 0.3, 0.15 + Math.sin(p) * 0.08],
      upperArmR: [F * 1.0 + Math.sin(p) * 0.1, 0, 0.25],
      upperArmL: [F * 0.85 - Math.sin(p) * 0.1, 0, -0.3],
      forearmR: [F * 0.35, 0, 0],
      forearmL: [F * 0.5, 0, 0],
      // One leg drags: asymmetric shin.
      shinR: [F * Math.max(0, Math.cos(p)) * 0.3 + F * 0.15, 0, 0],
      thighR: [-F * Math.sin(p) * 0.35, 0, -0.1],
      rootRoll: Math.sin(p) * 0.05,
    }
  }),
  z_run: proc((_, ctx) => {
    const w = walkCycle({ ...ctx, speed: 1 }, 1.0, 0.42, 0.05, 0.3, 0.3)
    return {
      ...w,
      head: [-F * 0.2, 0, 0],
      upperArmR: [F * 0.4, 0, 1.0],
      upperArmL: [F * 0.4, 0, -1.0],
      forearmR: [F * 0.5, 0, 0],
      forearmL: [F * 0.5, 0, 0],
    }
  }),
  z_attack: keyed(0.75, [
    { t: 0, pose: { ...ZOMBIE_STANCE } },
    { t: 0.35, pose: { upperArmR: [F * 2.4, 0, 0.6], forearmR: [F * 0.8, 0, 0], upperArmL: [F * 2.2, 0, -0.6], forearmL: [F * 0.8, 0, 0], spine: [-F * 0.1, 0, 0], chest: [-F * 0.15, 0, 0], head: [-F * 0.3, 0, 0] } },
    { t: 0.55, pose: { upperArmR: [F * 1.2, 0, 0.3], forearmR: [F * 0.3, 0, 0], upperArmL: [F * 1.1, 0, -0.3], forearmL: [F * 0.3, 0, 0], spine: [F * 0.6, 0, 0], chest: [F * 0.3, 0, 0], head: [F * 0.2, 0, 0], thighL: [F * 0.5, 0, 0.1], shinL: [-F * 0.6, 0, 0], rootY: -0.12 } },
    { t: 1, pose: { ...ZOMBIE_STANCE } },
  ]),
  z_bite: keyed(0.6, [
    { t: 0, pose: { ...ZOMBIE_STANCE } },
    { t: 0.35, pose: { upperArmR: [F * 1.5, 0, 0.1], forearmR: [F * 0.9, 0, 0], upperArmL: [F * 1.5, 0, -0.1], forearmL: [F * 0.9, 0, 0], spine: [-F * 0.1, 0, 0], head: [-F * 0.5, 0, 0] } },
    { t: 0.55, pose: { upperArmR: [F * 1.6, 0, 0.1], forearmR: [F * 1.0, 0, 0], upperArmL: [F * 1.6, 0, -0.1], forearmL: [F * 1.0, 0, 0], spine: [F * 0.7, 0, 0], chest: [F * 0.4, 0, 0], head: [F * 0.4, 0, 0], rootY: -0.1 } },
    { t: 1, pose: { ...ZOMBIE_STANCE } },
  ]),
  brute_slam: keyed(1.3, [
    { t: 0, pose: { ...ZOMBIE_STANCE } },
    { t: 0.45, pose: { upperArmR: [F * 3.0, 0, 0.7], forearmR: [F * 0.9, 0, 0], upperArmL: [F * 3.0, 0, -0.7], forearmL: [F * 0.9, 0, 0], spine: [-F * 0.35, 0, 0], chest: [-F * 0.2, 0, 0], head: [-F * 0.4, 0, 0], rootY: 0.05 } },
    { t: 0.6, pose: { upperArmR: [F * 0.9, 0, 0.4], forearmR: [F * 0.1, 0, 0], upperArmL: [F * 0.9, 0, -0.4], forearmL: [F * 0.1, 0, 0], spine: [F * 0.9, 0, 0], chest: [F * 0.4, 0, 0], head: [F * 0.3, 0, 0], thighL: [F * 0.8, 0, 0.1], thighR: [F * 0.8, 0, -0.1], shinL: [-F * 1.1, 0, 0], shinR: [-F * 1.1, 0, 0], rootY: -0.3 } },
    { t: 1, pose: { ...ZOMBIE_STANCE } },
  ]),
  knight_swing: keyed(0.8, [
    { t: 0, pose: { ...ARMS_READY, spine: [F * 0.1, 0, 0] } },
    { t: 0.4, pose: { upperArmR: [F * 2.2, -0.9, 1.2], forearmR: [F * 0.9, 0, 0], chest: [0, 0.8, 0], spine: [0, 0.35, 0], head: [0, -0.5, 0], upperArmL: [F * 1.1, 0.5, -0.2], forearmL: [F * 1.0, -0.6, 0] } },
    { t: 0.6, pose: { upperArmR: [F * 1.3, 0.7, -0.3], forearmR: [F * 0.1, 0, 0], chest: [F * 0.2, -0.9, 0], spine: [F * 0.1, -0.4, 0], head: [0, 0.4, 0], upperArmL: [F * 1.0, 0.5, -0.1], forearmL: [F * 1.0, -0.6, 0], thighL: [F * 0.3, 0, 0.1], rootY: -0.08 } },
    { t: 1, pose: { ...ARMS_READY, spine: [F * 0.1, 0, 0] } },
  ]),
  knight_block: proc(() => ({ ...SHIELD_UP, upperArmR: [F * 0.9, 0.6, 0.5], forearmR: [F * 1.2, 0, 0], spine: [F * 0.15, 0.25, 0], rootY: -0.06 })),
  roar: keyed(1.4, [
    { t: 0, pose: { ...ZOMBIE_STANCE } },
    { t: 0.3, pose: { upperArmR: [F * 2.6, 0, 1.0], forearmR: [F * 0.5, 0, 0], upperArmL: [F * 2.6, 0, -1.0], forearmL: [F * 0.5, 0, 0], spine: [-F * 0.4, 0, 0], chest: [-F * 0.3, 0, 0], head: [-F * 0.6, 0, 0], rootY: 0.05 } },
    { t: 0.75, pose: { upperArmR: [F * 2.7, 0, 1.2], forearmR: [F * 0.4, 0, 0], upperArmL: [F * 2.7, 0, -1.2], forearmL: [F * 0.4, 0, 0], spine: [-F * 0.45, 0, 0], chest: [-F * 0.3, 0, 0], head: [-F * 0.7, 0.2, 0], rootY: 0.06 } },
    { t: 1, pose: { ...ZOMBIE_STANCE } },
  ]),
  leap: keyed(0.9, [
    { t: 0, pose: { ...ZOMBIE_STANCE, thighL: [F * 0.7, 0, 0.1], thighR: [F * 0.7, 0, -0.1], shinL: [-F * 1.0, 0, 0], shinR: [-F * 1.0, 0, 0], rootY: -0.3 } },
    { t: 0.3, pose: { upperArmR: [F * 2.0, 0, 0.8], upperArmL: [F * 2.0, 0, -0.8], forearmR: [F * 0.5, 0, 0], forearmL: [F * 0.5, 0, 0], spine: [F * 0.4, 0, 0], thighL: [F * 1.0, 0, 0.1], thighR: [F * 0.2, 0, -0.1], shinL: [-F * 1.3, 0, 0], head: [F * 0.1, 0, 0] } },
    { t: 0.7, pose: { upperArmR: [F * 1.2, 0, 0.4], upperArmL: [F * 1.2, 0, -0.4], spine: [F * 0.7, 0, 0], chest: [F * 0.3, 0, 0], thighL: [F * 0.9, 0, 0.1], thighR: [F * 0.9, 0, -0.1], shinL: [-F * 1.2, 0, 0], shinR: [-F * 1.2, 0, 0], rootY: -0.3 } },
    { t: 1, pose: { ...ZOMBIE_STANCE } },
  ]),
  sit_hurt: proc((t) => ({
    thighL: [F * 1.5, 0, 0.3],
    thighR: [F * 1.5, 0, -0.3],
    shinL: [-F * 2.2, 0, 0],
    shinR: [-F * 2.2, 0, 0],
    spine: [F * 0.4, 0, 0],
    head: [F * 0.4 + Math.sin(t * 1.4) * 0.05, 0, 0],
    upperArmL: [F * 1.3, 0, -0.3],
    upperArmR: [F * 1.3, 0, 0.3],
    forearmL: [F * 1.6, 0, 0],
    forearmR: [F * 1.6, 0, 0],
    rootY: -0.62,
  })),
}

export class Animator {
  private current = "idle"
  private time = 0
  private prevPose: Pose | null = null
  private blendT = 1
  private blendDuration = 0.15
  private lastPose: Pose = {}
  speed = 1
  ctx: ClipContext = { phase: 0, speed: 0, time: 0 }
  /** Extra pose layered on top (e.g. head look). */
  overlay: Pose | null = null
  /** Blend weight of the overlay. */
  overlayWeight = 1

  constructor(private humanoid: Humanoid) {}

  get name(): string {
    return this.current
  }

  get progress(): number {
    const c = CLIPS[this.current]
    return Math.min(1, this.time / c.duration)
  }

  get finished(): boolean {
    const c = CLIPS[this.current]
    return !c.loop && this.time >= c.duration
  }

  play(name: string, opts: { restart?: boolean; speed?: number; blend?: number } = {}): void {
    if (!CLIPS[name]) throw new Error(`unknown clip ${name}`)
    if (this.current === name && !opts.restart) {
      if (opts.speed !== undefined) this.speed = opts.speed
      return
    }
    this.prevPose = { ...this.lastPose }
    this.blendT = 0
    this.blendDuration = opts.blend ?? CLIPS[name].blend ?? (CLIPS[name].loop ? 0.18 : 0.1)
    this.current = name
    this.time = 0
    this.speed = opts.speed ?? 1
  }

  update(dt: number): void {
    const clip = CLIPS[this.current]
    this.time += dt * this.speed
    this.ctx.time += dt
    if (clip.loop && this.time > clip.duration * 1000) this.time -= clip.duration * 1000
    const t = clip.loop ? this.time : Math.min(this.time, clip.duration)
    let pose = clip.sample(t, this.ctx)
    if (this.prevPose && this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / Math.max(0.001, this.blendDuration))
      const s = this.blendT * this.blendT * (3 - 2 * this.blendT)
      pose = blendPose(this.prevPose, pose, s)
      if (this.blendT >= 1) this.prevPose = null
    }
    if (this.overlay) pose = blendPose(pose, { ...pose, ...this.overlay }, this.overlayWeight)
    this.lastPose = pose
    this.apply(pose)
  }

  private apply(pose: Pose): void {
    const bones = this.humanoid.bones
    for (const name of Object.keys(bones) as BoneName[]) {
      const r = pose[name]
      const bone = bones[name]
      if (r) bone.rotation.set(r[0], r[1], r[2])
      else bone.rotation.set(0, 0, 0)
    }
    const hips = bones.hips
    hips.position.y = 0.98 + (pose.rootY ?? 0)
    hips.rotation.x += pose.rootPitch ?? 0
    hips.rotation.z += pose.rootRoll ?? 0
  }
}
