// 2D value noise with fractal octaves, used for terrain, textures and wind.

import { Rng } from "./rng"

const PERM_SIZE = 512

export class Noise2D {
  private perm = new Uint8Array(PERM_SIZE)
  private grads = new Float32Array(PERM_SIZE * 2)

  constructor(seed: number) {
    const rng = new Rng(seed)
    const p: number[] = []
    for (let i = 0; i < 256; i++) p.push(i)
    rng.shuffle(p)
    for (let i = 0; i < PERM_SIZE; i++) {
      this.perm[i] = p[i & 255]
      const a = rng.next() * Math.PI * 2
      this.grads[i * 2] = Math.cos(a)
      this.grads[i * 2 + 1] = Math.sin(a)
    }
  }

  private dot(ix: number, iy: number, fx: number, fy: number): number {
    const h = this.perm[(ix + this.perm[iy & 255]) & 255]
    return this.grads[h * 2] * fx + this.grads[h * 2 + 1] * fy
  }

  /** Perlin-style gradient noise in [-1, 1]. */
  sample(x: number, y: number): number {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const n00 = this.dot(x0, y0, fx, fy)
    const n10 = this.dot(x0 + 1, y0, fx - 1, fy)
    const n01 = this.dot(x0, y0 + 1, fx, fy - 1)
    const n11 = this.dot(x0 + 1, y0 + 1, fx - 1, fy - 1)
    const nx0 = n00 + (n10 - n00) * u
    const nx1 = n01 + (n11 - n01) * u
    return (nx0 + (nx1 - nx0) * v) * 1.41
  }

  /** Fractal Brownian motion in roughly [-1, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq) * amp
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}
