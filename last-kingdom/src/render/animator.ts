// Procedural animation for the skinned humanoid. Clips are either keyframed (attacks, hits, deaths) or
// generated from a phase (walk cycles). The animator blends between clips so transitions look smooth.
//
// Conventions: the character faces +Z. Negative X rotation moves limbs forward; arms hang along -Y.

import * as THREE from "three"
import type { BoneName, Humanoid } from "./humanoid"
import type { CharacterRig } from "./rig"
import { models } from "./assets"
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

// ---- glTF characters: game clip names mapped onto the animation library -------------------------------------

interface MixSpec {
  /** Clip name in the animation library. */
  clip: string
  /** Portion of the clip to play (0..1), e.g. only the swing of an attack. */
  from?: number
  to?: number
  /** Playback speed factor for loops (walk cycles follow movement speed on top of this). */
  rate?: number
  /** Additive pose in the character frame (radians, same conventions as the procedural clips). */
  add?: Pose
}

const ZOMBIE_ARMS: Pose = { upperArmL: [-1.15, 0, -0.12], upperArmR: [-1.25, 0, 0.12], forearmL: [-0.35, 0, 0], forearmR: [-0.25, 0, 0], spine: [0.22, 0, 0], neck: [0.2, 0, 0.12], head: [0.12, 0.1, 0.18] }
const MIX: Record<string, MixSpec> = {
  rest: { clip: "Idle_Loop" },
  idle: { clip: "Idle_Loop" },
  combat_idle: { clip: "Sword_Idle" },
  walk: { clip: "Walk_Loop" },
  run: { clip: "Jog_Fwd_Loop" },
  sprint: { clip: "Sprint_Loop" },
  strafe: { clip: "Walk_Loop", rate: 0.9 },
  jump: { clip: "Jump_Start" },
  fall: { clip: "Jump_Loop" },
  land: { clip: "Jump_Land" },
  dodge: { clip: "Roll" },
  slash_r: { clip: "Sword_Attack", from: 0.05, to: 0.85 },
  slash_l: { clip: "Sword_Attack", from: 0.05, to: 0.85, add: { chest: [0, -0.35, 0] } },
  overhead: { clip: "Sword_Attack", from: 0, to: 0.9, add: { chest: [0.15, 0, 0] } },
  thrust: { clip: "Punch_Jab" },
  chop: { clip: "Sword_Attack", from: 0, to: 0.9, add: { spine: [0.15, 0, 0] } },
  heavy_overhead: { clip: "Sword_Attack", add: { spine: [0.2, 0, 0], chest: [0.1, 0, 0] } },
  heavy_spin: { clip: "Sword_Attack", add: { hips: [0, 0.4, 0] } },
  lunge: { clip: "Punch_Cross" },
  bow_draw: { clip: "Pistol_Aim_Neutral" },
  bow_release: { clip: "Pistol_Shoot" },
  crossbow_aim: { clip: "Pistol_Aim_Neutral" },
  crossbow_reload: { clip: "Pistol_Reload" },
  block: { clip: "Sword_Idle", add: { upperArmL: [-1.0, 0, -0.4], forearmL: [-1.0, 0, 0] } },
  block_weapon: { clip: "Sword_Idle", add: { upperArmR: [-1.0, 0, 0.3], forearmR: [-0.9, 0, 0] } },
  block_hit: { clip: "Hit_Chest", from: 0, to: 0.6, add: { upperArmL: [-1.0, 0, -0.4], forearmL: [-1.0, 0, 0] } },
  hit: { clip: "Hit_Chest" },
  stagger: { clip: "Hit_Head" },
  death_back: { clip: "Death01" },
  death_front: { clip: "Death01" },
  interact: { clip: "Interact" },
  use_item: { clip: "Interact" },
  z_idle: { clip: "Idle_Loop", rate: 0.6, add: { ...ZOMBIE_ARMS, upperArmL: [-0.5, 0, -0.1], upperArmR: [-0.3, 0, 0.1] } },
  z_walk: { clip: "Walk_Loop", rate: 0.7, add: ZOMBIE_ARMS },
  z_run: { clip: "Sprint_Loop", add: { upperArmL: [-0.9, 0, -0.1], upperArmR: [-1.0, 0, 0.1], spine: [0.3, 0, 0], neck: [0.1, 0, 0] } },
  z_attack: { clip: "Punch_Cross", add: { spine: [0.2, 0, 0] } },
  z_bite: { clip: "Punch_Jab", add: { spine: [0.35, 0, 0], neck: [0.25, 0, 0], head: [0.2, 0, 0] } },
  brute_slam: { clip: "Sword_Attack", add: { spine: [0.25, 0, 0], upperArmL: [-0.6, 0, 0] } },
  knight_swing: { clip: "Sword_Attack" },
  knight_block: { clip: "Sword_Idle", add: { upperArmL: [-1.0, 0, -0.4], forearmL: [-1.0, 0, 0] } },
  roar: { clip: "Spell_Simple_Enter", add: { neck: [-0.4, 0, 0], head: [-0.3, 0, 0], chest: [-0.2, 0, 0] } },
  leap: { clip: "Jump_Start" },
  sit_hurt: { clip: "Sitting_Idle_Loop" },
}

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _c = new THREE.Quaternion()
const clipCache = new Map<string, THREE.AnimationClip>()

/** Library clip, with the pelvis translation scaled for smaller or bigger skeletons. */
function libraryClip(name: string, pelvisRatio: number): THREE.AnimationClip | null {
  const key = `${name}@${pelvisRatio.toFixed(3)}`
  const hit = clipCache.get(key)
  if (hit) return hit
  const src = models.get("anims_ual")?.animations.find((c) => c.name === name)
  if (!src) return null
  let clip = src
  if (Math.abs(pelvisRatio - 1) > 0.01) {
    clip = src.clone()
    for (const t of clip.tracks) if (t.name.endsWith(".position")) for (let i = 0; i < t.values.length; i++) t.values[i] *= pelvisRatio
  }
  clipCache.set(key, clip)
  return clip
}

/** Drives a glTF skeleton: one AnimationMixer, crossfades, additive overlays in the character frame. */
class MixerDriver {
  private mixer: THREE.AnimationMixer
  private action: THREE.AnimationAction | null = null
  private spec: MixSpec | null = null
  private clipDuration = 1
  /** Bones touched by the additive layer last frame and their pose before it (bones without a track keep it). */
  private saved = new Map<THREE.Bone, THREE.Quaternion>()
  private touched: THREE.Bone[] = []
  constructor(private rig: CharacterRig) {
    this.mixer = new THREE.AnimationMixer(rig.root)
  }

  play(name: string, gameDuration: number, loop: boolean, speed: number, blend: number): void {
    const spec = MIX[name] ?? MIX.idle
    const clip = libraryClip(spec.clip, this.rig.pelvisRatio) ?? libraryClip("Idle_Loop", this.rig.pelvisRatio)
    if (!clip) return
    const action = this.mixer.clipAction(clip)
    const from = (spec.from ?? 0) * clip.duration
    const to = (spec.to ?? 1) * clip.duration
    this.clipDuration = Math.max(0.05, to - from)
    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    action.clampWhenFinished = !loop
    action.time = from
    // Non-looping clips are stretched to the game clip's duration so gameplay timing (hit frames, combos) is unchanged
    action.timeScale = loop ? (spec.rate ?? 1) * speed : (this.clipDuration / Math.max(0.05, gameDuration)) * speed
    if (this.action && this.action !== action) {
      action.enabled = true
      action.setEffectiveWeight(1)
      action.crossFadeFrom(this.action, Math.max(0.05, blend), false)
    }
    action.play()
    this.action = action
    this.spec = spec
  }

  update(dt: number, ctx: ClipContext, loop: boolean, speed: number, overlay: Pose | null, overlayWeight: number): void {
    if (this.action && loop && this.spec) {
      // Walk cycles follow the movement speed like the procedural cycles did
      const move = ctx.speed > 0 ? 0.55 + ctx.speed * 0.6 : 1
      this.action.timeScale = (this.spec.rate ?? 1) * speed * (/walk|run|sprint|strafe/.test(this.spec.clip) ? move : 1)
    }
    // Undo last frame's additive rotations first: bones without an animation track would otherwise accumulate them
    for (const bone of this.touched) bone.quaternion.copy(this.saved.get(bone)!)
    this.touched.length = 0
    this.mixer.update(dt)
    if (this.spec?.add) this.applyAdditive(this.spec.add, 1)
    if (overlay) this.applyAdditive(overlay, overlayWeight)
  }

  private applyAdditive(pose: Pose, weight: number): void {
    const rig = this.rig
    for (const k of Object.keys(pose)) {
      if (k === "rootY" || k === "rootPitch" || k === "rootRoll") continue
      const r = pose[k as BoneName]
      if (!r) continue
      const bone = rig.bones.get(rig.map[k as BoneName])
      const c = bone && rig.align.get(bone.name)
      if (!bone || !c) continue
      _e.set(r[0] * weight, r[1] * weight, r[2] * weight)
      _q.setFromEuler(_e)
      // rotation given in the character frame, expressed in the parent's local frame: C^-1 * q * C
      _c.copy(c).invert().multiply(_q).multiply(c)
      if (!this.touched.includes(bone)) {
        let q = this.saved.get(bone)
        if (!q) this.saved.set(bone, (q = new THREE.Quaternion()))
        q.copy(bone.quaternion)
        this.touched.push(bone)
      }
      bone.quaternion.premultiply(_c)
    }
    if (pose.rootPitch || pose.rootRoll) {
      _e.set((pose.rootPitch ?? 0) * weight, 0, (pose.rootRoll ?? 0) * weight)
      rig.root.quaternion.setFromEuler(_e)
    } else rig.root.quaternion.identity()
  }
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

  private mix: MixerDriver | null = null

  constructor(private humanoid: Humanoid) {
    if (humanoid.rig) {
      this.mix = new MixerDriver(humanoid.rig)
      this.mix.play("idle", CLIPS.idle.duration, true, 1, 0)
    }
  }

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
    this.mix?.play(name, CLIPS[name].duration, CLIPS[name].loop, this.speed, this.blendDuration)
  }

  update(dt: number): void {
    const clip = CLIPS[this.current]
    this.time += dt * this.speed
    this.ctx.time += dt
    if (clip.loop && this.time > clip.duration * 1000) this.time -= clip.duration * 1000
    if (this.mix) {
      this.mix.update(dt, this.ctx, clip.loop, this.speed, this.overlay, this.overlayWeight)
      return
    }
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
