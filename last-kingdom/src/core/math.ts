// Small math helpers shared by gameplay and rendering code.

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const TAU = Math.PI * 2

/** Smallest signed difference between two angles in radians. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/** Moves an angle toward a target by at most maxStep. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target)
  if (Math.abs(d) <= maxStep) return target
  return current + Math.sign(d) * maxStep
}

/** Exponential damping that is independent of the frame rate. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  return Math.sqrt(dx * dx + dz * dz)
}

export function roundTo(v: number, digits: number): number {
  const f = Math.pow(10, digits)
  return Math.round(v * f) / f
}

export function formatNumber(v: number): string {
  return Math.round(v).toLocaleString("de-DE")
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
