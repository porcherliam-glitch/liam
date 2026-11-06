// Procedural canvas textures. Everything the game shows is generated here; no files are downloaded.
// Large surface textures (stone, planks, roof, cobble) are 512 px and tile seamlessly; some of them also
// produce a height field that is turned into a normal map ("<name>_normal").

import * as THREE from "three"
import { Noise2D } from "../core/noise"
import { Rng } from "../core/rng"

const cache = new Map<string, THREE.Texture>()
/** Height fields (white = raised) recorded while building a colour texture, consumed by "<name>_normal". */
const heights = new Map<string, HTMLCanvasElement>()

/** A square canvas; `readback` keeps it in CPU memory so getImageData does not stall on a GPU read. */
function canvas(size: number, readback = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d", { willReadFrequently: readback })!
  return [c, ctx]
}

function finish(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h},${s}%,${l}%,${a})`
}

function gray(v: number, a = 1): string {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `rgba(${g},${g},${g},${a})`
}

export function noiseTexture(seed: number, size: number, base: [number, number, number], variation: number, scale: number, octaves = 4): HTMLCanvasElement {
  const [c, ctx] = canvas(size)
  const noise = new Noise2D(seed)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Tile seamlessly by sampling on a torus.
      const u = (x / size) * scale
      const v = (y / size) * scale
      const n = (noise.fbm(u, v, octaves) + noise.fbm(u + scale, v, octaves) + noise.fbm(u, v + scale, octaves) + noise.fbm(u + scale, v + scale, octaves)) / 4
      const k = 1 + n * variation
      const i = (y * size + x) * 4
      img.data[i] = Math.max(0, Math.min(255, base[0] * k))
      img.data[i + 1] = Math.max(0, Math.min(255, base[1] * k))
      img.data[i + 2] = Math.max(0, Math.min(255, base[2] * k))
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * Fast tileable value noise in roughly [-1, 1]: a periodic lattice of `cellsX` × `cellsY` random values per octave,
 * smoothly interpolated. Anisotropic cells (e.g. 24 × 3) give stretched wood grain.
 */
function tileNoise(seed: number, size: number, cellsX: number, cellsY: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size)
  const rng = new Rng(seed)
  let amp = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const nx = cellsX << o
    const ny = cellsY << o
    const lat = new Float32Array(nx * ny)
    for (let i = 0; i < lat.length; i++) lat[i] = rng.next() * 2 - 1
    const sx = nx / size
    const sy = ny / size
    for (let y = 0; y < size; y++) {
      const fy = y * sy
      const y0 = Math.floor(fy)
      let ty = fy - y0
      ty = ty * ty * (3 - 2 * ty)
      const r0 = (y0 % ny) * nx
      const r1 = ((y0 + 1) % ny) * nx
      for (let x = 0; x < size; x++) {
        const fx = x * sx
        const x0 = Math.floor(fx)
        let tx = fx - x0
        tx = tx * tx * (3 - 2 * tx)
        const a0 = x0 % nx
        const a1 = (x0 + 1) % nx
        const top = lat[r0 + a0] + (lat[r0 + a1] - lat[r0 + a0]) * tx
        const bot = lat[r1 + a0] + (lat[r1 + a1] - lat[r1 + a0]) * tx
        out[y * size + x] += (top + (bot - top) * ty) * amp
      }
    }
    norm += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

/** Tileable noise as an RGB canvas: base colour scaled by (1 + n * variation). */
function noiseCanvas(seed: number, size: number, base: [number, number, number], variation: number, cellsX: number, cellsY = cellsX, octaves = 4): HTMLCanvasElement {
  const [c, ctx] = canvas(size)
  const n = tileNoise(seed, size, cellsX, cellsY, octaves)
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < n.length; i++) {
    const k = 1 + n[i] * variation * 1.6
    img.data[i * 4] = Math.max(0, Math.min(255, base[0] * k))
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, base[1] * k))
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, base[2] * k))
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Low-frequency noise for a large canvas: computed at half resolution and scaled up (saves ~75 % of the work). */
function noiseBase(seed: number, size: number, base: [number, number, number], variation: number, cells: number, octaves: number): HTMLCanvasElement {
  if (size <= 256) return noiseCanvas(seed, size, base, variation, cells, cells, octaves)
  const small = noiseCanvas(seed, size / 2, base, variation, cells, cells, octaves)
  const [c, ctx] = canvas(size)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(small, 0, 0, size, size)
  return c
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rng: Rng, count: number, color: () => string, radius: [number, number]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = color()
    const r = rng.range(radius[0], radius[1])
    const x = rng.range(0, size)
    const y = rng.range(0, size)
    wrapped(size, x - r, y - r, r * 2, r * 2, (wx, wy) => {
      ctx.beginPath()
      ctx.arc(wx + r, wy + r, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }
}

/** Calls `draw` once per copy of a shape (bounding box x, y, w, h) that is visible in a tiling texture. */
function wrapped(size: number, x: number, y: number, w: number, h: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-size, 0, size]) {
    if (x + ox + w < 0 || x + ox > size) continue
    for (const oy of [-size, 0, size]) {
      if (y + oy + h < 0 || y + oy > size) continue
      draw(x + ox, y + oy)
    }
  }
}

export function tex(name: string): THREE.Texture {
  const hit = cache.get(name)
  if (hit) return hit
  const t = build(name)
  cache.set(name, t)
  return t
}

function build(name: string): THREE.Texture {
  const size = 256
  switch (name) {
    case "grass": {
      const c = noiseTexture(11, size, [100, 110, 68], 0.5, 6, 5)
      const ctx = c.getContext("2d")!
      const rng = new Rng(12)
      for (let i = 0; i < 2600; i++) {
        ctx.strokeStyle = hsl(rng.range(70, 100), rng.range(18, 32), rng.range(18, 34), 0.5)
        ctx.lineWidth = 1
        const x = rng.range(0, size)
        const y = rng.range(0, size)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + rng.range(-3, 3), y - rng.range(3, 8))
        ctx.stroke()
      }
      return finish(c, 1)
    }
    case "dirt": {
      const c = noiseTexture(21, size, [96, 78, 56], 0.5, 5, 5)
      const ctx = c.getContext("2d")!
      speckle(ctx, size, new Rng(22), 500, () => hsl(30, 20, 22, 0.5), [0.5, 2.5])
      speckle(ctx, size, new Rng(23), 200, () => hsl(35, 25, 45, 0.4), [0.5, 2])
      return finish(c, 1)
    }
    case "mud": {
      const c = noiseTexture(31, size, [118, 104, 82], 0.45, 4, 5)
      return finish(c, 1)
    }
    case "cobble":
      return finish(cobble(), 1)
    case "stone": {
      const [c, h] = masonry({ seed: 51, mortar: [106, 102, 94], hue: [30, 50], sat: [4, 12], light: [36, 58], warm: 0.2, warmSat: 14, chip: 0.25, wet: false })
      heights.set("stone", h)
      return finish(c, 1)
    }
    case "stone_dark": {
      const [c, h] = masonry({ seed: 61, mortar: [85, 82, 76], hue: [205, 235], sat: [3, 8], light: [29, 46], warm: 0.08, warmSat: 7, chip: 0.25, wet: true })
      heights.set("stone_dark", h)
      return finish(c, 1)
    }
    case "stone_normal":
    case "stone_dark_normal":
    case "planks_normal":
    case "cobble_normal": {
      const base = name.slice(0, -"_normal".length)
      tex(base)
      const h = heights.get(base)
      if (!h) throw new Error(`no height field for ${base}`)
      heights.delete(base)
      return finish(heightToNormal(h, base === "planks" ? 4 : 6), 1, false)
    }
    case "plaster": {
      const c = noiseTexture(71, size, [196, 184, 160], 0.22, 4, 4)
      const ctx = c.getContext("2d")!
      speckle(ctx, size, new Rng(72), 300, () => hsl(35, 20, 48, 0.25), [1, 6])
      // Cracks
      const rng = new Rng(73)
      ctx.strokeStyle = "rgba(60,50,40,0.5)"
      ctx.lineWidth = 1
      for (let i = 0; i < 12; i++) {
        let x = rng.range(0, size)
        let y = rng.range(0, size)
        ctx.beginPath()
        ctx.moveTo(x, y)
        for (let k = 0; k < 8; k++) {
          x += rng.range(-14, 14)
          y += rng.range(4, 18)
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      return finish(c, 1)
    }
    case "timber":
      return finish(timber(81, "#3a2a1c", 28, [25, 40], [14, 30]), 1)
    case "timber_grey":
      return finish(timber(85, hsl(30, 12, 24), 30, [6, 14], [15, 34]), 1)
    case "planks": {
      const [c, h] = planks()
      heights.set("planks", h)
      return finish(c, 1)
    }
    case "roof":
      return finish(roofTiles(), 1)
    case "thatch":
      return finish(thatch(), 1)
    case "bark": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#3a2e22"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(121)
      for (let i = 0; i < 300; i++) {
        ctx.strokeStyle = hsl(28, rng.range(15, 30), rng.range(10, 28), 0.8)
        ctx.lineWidth = rng.range(1, 4)
        const x = rng.range(0, size)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.bezierCurveTo(x + rng.range(-10, 10), size / 3, x + rng.range(-10, 10), (size * 2) / 3, x + rng.range(-6, 6), size)
        ctx.stroke()
      }
      overlayNoise(ctx, size, 122, 0.25)
      return finish(c, 1)
    }
    case "birch_bark":
      return finish(birchBark(), 1)
    case "rock":
      return finish(rock(), 1)
    case "leaves":
      return finish(leaves(131, [[85, 95], [100, 115], [120, 130]], 0.04), 1)
    case "leaves_dead":
      return finish(leaves(141, [[35, 42], [42, 50], [35, 50]], 0.12), 1)
    case "cloth": {
      const c = noiseTexture(151, size, [200, 200, 200], 0.12, 8, 3)
      const ctx = c.getContext("2d")!
      // Twill: fine diagonal ribs in both directions instead of a coarse grid (tiles: lines wrap at 45°).
      ctx.globalAlpha = 0.12
      ctx.lineWidth = 1
      for (let i = -size; i < size; i += 2) {
        ctx.strokeStyle = "#000"
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + size, size)
        ctx.stroke()
        ctx.strokeStyle = "#fff"
        ctx.beginPath()
        ctx.moveTo(i + 1, size)
        ctx.lineTo(i + 1 + size, 0)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      return finish(c, 1)
    }
    case "awning":
      return finish(awning(), 1)
    case "stained": {
      const t = finish(stainedGlass(), 1)
      return t
    }
    case "web": {
      const t = finish(web(), 1, false)
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      return t
    }
    case "metal": {
      const c = noiseTexture(161, size, [150, 152, 158], 0.2, 3, 4)
      const ctx = c.getContext("2d")!
      const rng = new Rng(162)
      for (let i = 0; i < 400; i++) {
        ctx.strokeStyle = hsl(220, 5, rng.range(40, 70), 0.3)
        ctx.lineWidth = 1
        const y = rng.range(0, size)
        ctx.beginPath()
        ctx.moveTo(rng.range(0, size), y)
        ctx.lineTo(rng.range(0, size), y + rng.range(-2, 2))
        ctx.stroke()
      }
      speckle(ctx, size, new Rng(163), 180, () => hsl(25, 50, 28, 0.35), [1, 5])
      return finish(c, 1)
    }
    case "skin": {
      const c = noiseTexture(171, size, [222, 184, 150], 0.08, 6, 3)
      const ctx = c.getContext("2d")!
      speckle(ctx, size, new Rng(172), 80, () => hsl(20, 40, 40, 0.25), [1, 1])
      return finish(c, 1)
    }
    case "zombie_skin": {
      const c = noiseTexture(181, size, [188, 198, 170], 0.3, 6, 4)
      const ctx = c.getContext("2d")!
      const rng = new Rng(184)
      // Bruises: soft purple patches
      for (let i = 0; i < 6; i++) {
        const r = rng.range(20, 40)
        const x = rng.range(0, size)
        const y = rng.range(0, size)
        wrapped(size, x - r, y - r, r * 2, r * 2, (wx, wy) => {
          const g = ctx.createRadialGradient(wx + r, wy + r, 0, wx + r, wy + r, r)
          g.addColorStop(0, hsl(280, 30, 35, 0.3))
          g.addColorStop(1, hsl(280, 30, 35, 0))
          ctx.fillStyle = g
          ctx.fillRect(wx, wy, r * 2, r * 2)
        })
      }
      // Veins: thin dark-green curves
      ctx.strokeStyle = hsl(100, 30, 25, 0.35)
      ctx.lineWidth = 1
      for (let i = 0; i < 25; i++) {
        const x = rng.range(0, size)
        const y = rng.range(0, size)
        const a = rng.range(0, Math.PI * 2)
        const len = rng.range(18, 46)
        const ex = x + Math.cos(a) * len
        const ey = y + Math.sin(a) * len
        const cx = (x + ex) / 2 + rng.range(-12, 12)
        const cy = (y + ey) / 2 + rng.range(-12, 12)
        wrapped(size, Math.min(x, ex, cx), Math.min(y, ey, cy), len + 24, len + 24, (wx, wy) => {
          const dx = wx - Math.min(x, ex, cx)
          const dy = wy - Math.min(y, ey, cy)
          ctx.beginPath()
          ctx.moveTo(x + dx, y + dy)
          ctx.quadraticCurveTo(cx + dx, cy + dy, ex + dx, ey + dy)
          ctx.stroke()
        })
      }
      speckle(ctx, size, new Rng(182), 60, () => hsl(0, 45, 28, 0.4), [1, 4])
      speckle(ctx, size, new Rng(183), 40, () => hsl(90, 25, 40, 0.35), [2, 6])
      return finish(c, 1)
    }
    case "grass_blades": {
      const [c, ctx] = canvas(128)
      ctx.clearRect(0, 0, 128, 128)
      const rng = new Rng(241)
      for (let i = 0; i < 70; i++) {
        const x = rng.range(4, 124)
        const h = rng.range(50, 120)
        const w = rng.range(3, 7)
        const g = ctx.createLinearGradient(0, 128, 0, 128 - h)
        g.addColorStop(0, hsl(rng.range(80, 110), 40, 22))
        g.addColorStop(1, hsl(rng.range(70, 100), 45, 42))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(x - w / 2, 128)
        ctx.quadraticCurveTo(x + rng.range(-10, 10), 128 - h * 0.5, x + rng.range(-6, 6), 128 - h)
        ctx.lineTo(x + w / 2, 128)
        ctx.closePath()
        ctx.fill()
      }
      const t = finish(c, 1)
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      return t
    }
    case "water_normal": {
      // Normal map from fbm height: tangent-space RGB encoding
      const n = new Noise2D(251)
      const [c, ctx] = canvas(size)
      const img = ctx.createImageData(size, size)
      const h = (x: number, y: number) => {
        const u = (x / size) * 5
        const v = (y / size) * 5
        return (n.fbm(u, v, 4) + n.fbm(u + 5, v, 4) + n.fbm(u, v + 5, 4) + n.fbm(u + 5, v + 5, 4)) / 4
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (h(x + 1, y) - h(x - 1, y)) * 6
          const dy = (h(x, y + 1) - h(x, y - 1)) * 6
          const len = Math.hypot(dx, dy, 1)
          const i = (y * size + x) * 4
          img.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255)
          img.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255)
          img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255)
          img.data[i + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
      return finish(c, 1, false)
    }
    case "bone": {
      const c = noiseTexture(191, size, [214, 204, 178], 0.18, 5, 3)
      return finish(c, 1)
    }
    case "water": {
      const c = noiseTexture(201, size, [40, 60, 70], 0.3, 4, 4)
      return finish(c, 1)
    }
    case "moss": {
      const c = noiseTexture(211, size, [78, 92, 56], 0.5, 6, 5)
      return finish(c, 1)
    }
    case "gravel": {
      const c = noiseTexture(221, size, [130, 124, 114], 0.3, 6, 4)
      const ctx = c.getContext("2d")!
      speckle(ctx, size, new Rng(222), 900, () => hsl(30, 8, new Rng(1).range(30, 60), 0.6), [0.8, 2.6])
      return finish(c, 1)
    }
    case "blood": {
      const [c, ctx] = canvas(128)
      ctx.clearRect(0, 0, 128, 128)
      const rng = new Rng(231)
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = hsl(355, 70, rng.range(12, 24), rng.range(0.5, 0.95))
        ctx.beginPath()
        ctx.arc(64 + rng.gaussian(0, 16), 64 + rng.gaussian(0, 16), rng.range(4, 22), 0, Math.PI * 2)
        ctx.fill()
      }
      return finish(c, 1)
    }
    case "particle": {
      const [c, ctx] = canvas(64)
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, "rgba(255,255,255,1)")
      g.addColorStop(0.4, "rgba(255,255,255,0.6)")
      g.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 64, 64)
      const t = finish(c, 1, false)
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      return t
    }
    case "rain": {
      const [c, ctx] = canvas(32)
      ctx.clearRect(0, 0, 32, 32)
      const g = ctx.createLinearGradient(0, 0, 0, 32)
      g.addColorStop(0, "rgba(200,220,255,0)")
      g.addColorStop(0.5, "rgba(200,220,255,0.9)")
      g.addColorStop(1, "rgba(200,220,255,0)")
      ctx.fillStyle = g
      ctx.fillRect(14, 0, 4, 32)
      const t = finish(c, 1, false)
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      return t
    }
    default:
      throw new Error(`unknown texture ${name}`)
  }
}

interface MasonryOpts {
  seed: number
  mortar: [number, number, number]
  hue: [number, number]
  sat: [number, number]
  light: [number, number]
  /** Share of warmer (ochre) blocks and their saturation. */
  warm: number
  warmSat: number
  /** Share of blocks with a chipped corner. */
  chip: number
  /** Damp, darker band with a faint sheen along the bottom. */
  wet: boolean
}

/** Ashlar wall: 8 courses of 64 px (25 cm on a 2 m tile), 3 px mid-tone mortar, chipped corners, cracks. */
function masonry(o: MasonryOpts): [HTMLCanvasElement, HTMLCanvasElement] {
  const size = 512
  const rowH = 64
  const gap = 3
  const c = noiseBase(o.seed + 7, size, o.mortar, 0.12, 16, 3)
  const ctx = c.getContext("2d")!
  const [hc, hctx] = canvas(size, true)
  hctx.fillStyle = "#000"
  hctx.fillRect(0, 0, size, size)
  const rng = new Rng(o.seed)
  const mortarCss = `rgb(${o.mortar[0]},${o.mortar[1]},${o.mortar[2]})`
  let offset = rng.range(0, size)
  for (let row = 0; row < size / rowH; row++) {
    const widths: number[] = []
    let sum = 0
    while (sum < size) {
      const w = rng.range(72, 150)
      widths.push(w)
      sum += w
    }
    const k = size / sum
    offset = (offset + rng.range(36, 70)) % size
    let x = offset
    const y = row * rowH
    for (const w0 of widths) {
      const w = w0 * k
      const warm = rng.chance(o.warm)
      const hue = warm ? 25 + rng.range(-3, 3) : rng.range(o.hue[0], o.hue[1])
      const sat = warm ? o.warmSat : rng.range(o.sat[0], o.sat[1])
      const l = rng.range(o.light[0], o.light[1])
      const raise = rng.range(0.72, 1)
      const chip = rng.chance(o.chip) ? { corner: rng.int(0, 3), s: rng.range(8, 18) } : null
      const bx = x
      wrapped(size, bx, y, w, rowH, (wx, wy) => {
        const x0 = wx + gap / 2
        const y0 = wy + gap / 2
        const bw = w - gap
        const bh = rowH - gap
        ctx.fillStyle = hsl(hue, sat, l)
        roundRect(ctx, x0, y0, bw, bh, 4)
        ctx.fill()
        // Soft bevel: lit top edge, shaded bottom edge
        const g = ctx.createLinearGradient(0, y0, 0, y0 + bh)
        g.addColorStop(0, "rgba(255,248,236,0.18)")
        g.addColorStop(0.18, "rgba(255,248,236,0)")
        g.addColorStop(0.78, "rgba(0,0,0,0)")
        g.addColorStop(1, "rgba(0,0,0,0.2)")
        ctx.fillStyle = g
        roundRect(ctx, x0, y0, bw, bh, 4)
        ctx.fill()
        hctx.fillStyle = gray(raise)
        roundRect(hctx, x0, y0, bw, bh, 5)
        hctx.fill()
        if (chip) {
          const cx = chip.corner & 1 ? x0 + bw : x0
          const cy = chip.corner & 2 ? y0 + bh : y0
          const sx = chip.corner & 1 ? -chip.s : chip.s
          const sy = chip.corner & 2 ? -chip.s * 0.7 : chip.s * 0.7
          for (const [cc, col] of [[ctx, mortarCss], [hctx, "#000"]] as const) {
            cc.fillStyle = col
            cc.beginPath()
            cc.moveTo(cx - Math.sign(sx) * 2, cy - Math.sign(sy) * 2)
            cc.lineTo(cx + sx, cy - Math.sign(sy) * 2)
            cc.lineTo(cx - Math.sign(sx) * 2, cy + sy)
            cc.closePath()
            cc.fill()
          }
        }
      })
      x += w
    }
  }
  // Cracks: 2-3 per tile, a few segments each
  const cracks = rng.int(2, 3)
  for (let i = 0; i < cracks; i++) {
    let x = rng.range(20, size - 20)
    let y = rng.range(20, size - 20)
    const pts: [number, number][] = [[x, y]]
    const dir = rng.range(-1, 1)
    for (let s = 0; s < rng.int(5, 8); s++) {
      x += rng.range(-6, 6) + dir * 4
      y += rng.range(4, 10)
      pts.push([x, y])
    }
    for (const [cc, col, lw] of [[ctx, "rgba(38,32,26,0.6)", 1], [hctx, "rgba(0,0,0,0.55)", 1.5]] as const) {
      cc.strokeStyle = col
      cc.lineWidth = lw
      cc.beginPath()
      cc.moveTo(pts[0][0], pts[0][1])
      for (const p of pts) cc.lineTo(p[0], p[1])
      cc.stroke()
    }
  }
  overlayFast(ctx, size, o.seed + 1, 0.32, 6, 6, 5)
  speckle(ctx, size, new Rng(o.seed + 2), 150, () => hsl(90, 18, 30, 0.28), [1, 3.5])
  if (o.wet) {
    // Damp foot of the wall: darker, with a faint sheen line and a few drip streaks
    const g = ctx.createLinearGradient(0, size * 0.8, 0, size)
    g.addColorStop(0, "rgba(8,12,16,0)")
    g.addColorStop(1, "rgba(8,12,16,0.22)")
    ctx.fillStyle = g
    ctx.fillRect(0, size * 0.8, size, size * 0.2)
    ctx.fillStyle = "rgba(190,205,215,0.06)"
    ctx.fillRect(0, size * 0.9, size, 3)
    const r2 = new Rng(o.seed + 3)
    for (let i = 0; i < 26; i++) {
      const x = r2.range(0, size)
      const len = r2.range(20, 90)
      ctx.fillStyle = `rgba(10,14,18,${r2.range(0.06, 0.14)})`
      ctx.fillRect(x, size - len, r2.range(1, 3), len)
    }
  }
  return [c, hc]
}

/** Cobblestones: rows of slightly rotated rounded stones in sandy joints. */
function cobble(): HTMLCanvasElement {
  const size = 512
  const rows = 8
  const rowH = size / rows
  const c = noiseBase(43, size, [70, 64, 54], 0.25, 12, 4)
  const ctx = c.getContext("2d")!
  const [hc, hctx] = canvas(size, true)
  hctx.fillStyle = "#000"
  hctx.fillRect(0, 0, size, size)
  const rng = new Rng(41)
  let offset = 0
  for (let row = 0; row < rows; row++) {
    const widths: number[] = []
    let sum = 0
    while (sum < size) {
      const w = rng.range(52, 84)
      widths.push(w)
      sum += w
    }
    const k = size / sum
    offset = (offset + rng.range(20, 44)) % size
    let x = offset
    for (const w0 of widths) {
      const w = w0 * k
      const inset = rng.range(3, 6)
      const bw = w - inset * 2
      const bh = rowH - rng.range(6, 11)
      const cx = x + w / 2 + rng.range(-1.5, 1.5)
      const cy = row * rowH + rowH / 2 + rng.range(-2, 2)
      const rot = rng.range(-0.07, 0.07)
      const rad = rng.range(9, 18)
      const l = rng.range(30, 50)
      const hue = rng.range(28, 45)
      const sat = rng.range(5, 12)
      const m = Math.max(bw, bh)
      wrapped(size, cx - m / 2, cy - m / 2, m, m, (wx, wy) => {
        const px = wx + m / 2
        const py = wy + m / 2
        for (const cc of [ctx, hctx]) {
          cc.save()
          cc.translate(px, py)
          cc.rotate(rot)
        }
        ctx.fillStyle = hsl(hue, sat, l)
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rad)
        ctx.fill()
        const g = ctx.createRadialGradient(-bw * 0.18, -bh * 0.22, 2, 0, 0, m * 0.62)
        g.addColorStop(0, "rgba(255,246,232,0.22)")
        g.addColorStop(0.55, "rgba(255,246,232,0)")
        g.addColorStop(1, "rgba(0,0,0,0.3)")
        ctx.fillStyle = g
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rad)
        ctx.fill()
        const hg = hctx.createRadialGradient(0, 0, 2, 0, 0, m * 0.6)
        hg.addColorStop(0, gray(1))
        hg.addColorStop(1, gray(0.45))
        hctx.fillStyle = hg
        roundRect(hctx, -bw / 2, -bh / 2, bw, bh, rad)
        hctx.fill()
        ctx.restore()
        hctx.restore()
      })
      x += w
    }
  }
  overlayFast(ctx, size, 42, 0.28, 8, 8, 5)
  speckle(ctx, size, new Rng(44), 160, () => hsl(80, 22, 24, 0.3), [1, 3])
  heights.set("cobble", hc)
  return c
}

/** Floor boards: 6 boards of ~85 px with grain, knots, a butt joint with nails, lit left and shaded right edge. */
function planks(): [HTMLCanvasElement, HTMLCanvasElement] {
  const size = 512
  const [c, ctx] = canvas(size)
  const [hc, hctx] = canvas(size, true)
  const rng = new Rng(91)
  const n = 6
  const w = size / n
  for (let i = 0; i < n; i++) {
    const x0 = i * w
    const hue = rng.range(24, 32)
    const sat = rng.range(30, 42)
    const l = rng.range(20, 38)
    ctx.fillStyle = hsl(hue, sat, l)
    ctx.fillRect(x0, 0, w, size)
    hctx.fillStyle = gray(0.8)
    hctx.fillRect(x0, 0, w, size)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, 0, w, size)
    ctx.clip()
    // Grain: gentle Bezier lines that start and end at the same x so the board tiles vertically
    for (let k = 0; k < 34; k++) {
      const x = x0 + rng.range(3, w - 4)
      const dark = rng.chance(0.7)
      ctx.strokeStyle = dark ? hsl(hue, sat, l - rng.range(3, 9), 0.55) : hsl(hue, sat - 6, l + rng.range(3, 7), 0.35)
      ctx.lineWidth = rng.range(0.6, 1.6)
      const a = rng.range(-6, 6)
      const b = rng.range(-6, 6)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.bezierCurveTo(x + a, size / 3, x + b, (size * 2) / 3, x, size)
      ctx.stroke()
    }
    // Knots: dark core with three concentric rings, each a little lighter
    const knots = rng.int(2, 3)
    for (let k = 0; k < knots; k++) {
      const kx = x0 + rng.range(w * 0.25, w * 0.75)
      const ky = rng.range(0, size)
      const rx = rng.range(3, 5.5)
      const ry = rx * rng.range(1.6, 2.4)
      wrapped(size, kx - rx * 3, ky - ry * 3, rx * 6, ry * 6, (wx, wy) => {
        const px = wx + rx * 3
        const py = wy + ry * 3
        ctx.fillStyle = hsl(hue, sat + 6, Math.max(6, l - 13), 0.95)
        ctx.beginPath()
        ctx.ellipse(px, py, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 1
        for (let r = 0; r < 3; r++) {
          ctx.strokeStyle = hsl(hue, sat, Math.max(6, l - 9 + r * 2), 0.75)
          ctx.beginPath()
          ctx.ellipse(px, py, rx * (1 + r * 0.55), ry * (1 + r * 0.6), 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
    }
    ctx.restore()
    // Butt joint with two nail heads on either board end
    const jy = rng.range(48, size - 48)
    ctx.fillStyle = hsl(hue, sat, Math.max(5, l - 15))
    ctx.fillRect(x0, jy, w, 2)
    ctx.fillStyle = hsl(hue, sat, l + 6, 0.6)
    ctx.fillRect(x0, jy + 2, w, 1)
    hctx.fillStyle = gray(0.15)
    hctx.fillRect(x0, jy - 1, w, 4)
    for (const ny of [jy - 10, jy + 12]) {
      for (const nx of [x0 + w * 0.26, x0 + w * 0.74]) {
        const jx = nx + rng.range(-2, 2)
        ctx.fillStyle = "#1a1410"
        ctx.beginPath()
        ctx.arc(jx, ny, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "rgba(225,215,195,0.8)"
        ctx.fillRect(Math.round(jx - 1), Math.round(ny - 1), 1, 1)
      }
    }
    // Edges: 1 px lit on the left, 2 px shaded on the right (the gap to the next board)
    ctx.fillStyle = hsl(hue, sat, l + 9)
    ctx.fillRect(x0, 0, 1, size)
    ctx.fillStyle = hsl(hue, sat, Math.max(5, l - 15))
    ctx.fillRect(x0 + w - 2, 0, 2, size)
    hctx.fillStyle = gray(0.92)
    hctx.fillRect(x0, 0, 1, size)
    hctx.fillStyle = gray(0.1)
    hctx.fillRect(x0 + w - 2, 0, 2, size)
  }
  overlayFast(ctx, size, 92, 0.22, 24, 3, 4)
  return [c, hc]
}

/** Sawn timber beams: long grain strokes over a base colour. */
function timber(seed: number, base: string, hue: number, sat: [number, number], light: [number, number]): HTMLCanvasElement {
  const size = 256
  const [c, ctx] = canvas(size)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const rng = new Rng(seed)
  for (let i = 0; i < 140; i++) {
    ctx.strokeStyle = hsl(hue, rng.range(sat[0], sat[1]), rng.range(light[0], light[1]), 0.7)
    ctx.lineWidth = rng.range(1, 3)
    const y = rng.range(0, size)
    const a = rng.range(-6, 6)
    const b = rng.range(-6, 6)
    // Same height at both ends and copies above/below keep the grain seamless
    for (const oy of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(0, y + oy)
      ctx.bezierCurveTo(size / 3, y + oy + a, (size * 2) / 3, y + oy + b, size, y + oy)
      ctx.stroke()
    }
  }
  overlayNoise(ctx, size, seed + 1, 0.2)
  return c
}

/** Clay roof tiles: 12 rows × 10 tiles, upper rows overlap lower ones, 10 % missing or shifted, moss near the eaves. */
function roofTiles(): HTMLCanvasElement {
  const size = 512
  const cols = 10
  const rows = 12
  const tw = size / cols
  const th = size / rows
  const c = noiseBase(104, size, [58, 40, 32], 0.2, 8, 3)
  const ctx = c.getContext("2d")!
  const rng = new Rng(101)
  interface Tile { hue: number; sat: number; l: number; missing: boolean; dx: number; dy: number; rot: number; moss: [number, number, number][] }
  const tiles: Tile[] = []
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const roll = rng.next()
      const shifted = roll > 0.03 && roll < 0.1
      const mossChance = 0.08 + 0.6 * Math.pow(r / (rows - 1), 2)
      const moss: [number, number, number][] = []
      if (rng.chance(mossChance)) for (let k = rng.int(2, 6); k > 0; k--) moss.push([rng.range(4, tw - 6), rng.range(-3, 4), rng.range(1.5, 4)])
      tiles.push({ hue: rng.range(8, 20), sat: rng.range(30, 45), l: rng.range(22, 36), missing: roll < 0.03, dx: shifted ? rng.range(-7, 7) : 0, dy: shifted ? rng.range(-3, 5) : 0, rot: shifted ? rng.range(-0.08, 0.08) : 0, moss })
    }
  }
  const lip = 6
  const tilePath = (x: number, y: number) => {
    ctx.beginPath()
    ctx.moveTo(x + 1, y)
    ctx.lineTo(x + tw - 1, y)
    ctx.lineTo(x + tw - 1, y + th - 2)
    ctx.quadraticCurveTo(x + tw / 2, y + th + lip * 1.6, x + 1, y + th - 2)
    ctx.closePath()
  }
  // Bottom row first: every row above overlaps the top of the row below, like a real roof.
  for (let row = rows; row >= -1; row--) {
    const r = ((row % rows) + rows) % rows
    const off = r % 2 ? tw / 2 : 0
    for (let col = -1; col <= cols; col++) {
      const t = tiles[r * cols + (((col % cols) + cols) % cols)]
      if (t.missing) continue
      const x = col * tw + off + t.dx
      const y = row * th + t.dy
      ctx.save()
      ctx.translate(x + tw / 2, y)
      ctx.rotate(t.rot)
      ctx.translate(-(x + tw / 2), -y)
      // Shadow of the lip on the tile below
      ctx.fillStyle = "rgba(0,0,0,0.3)"
      ctx.save()
      ctx.translate(1, 3)
      tilePath(x, y)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = hsl(t.hue, t.sat, t.l)
      tilePath(x, y)
      ctx.fill()
      const g = ctx.createLinearGradient(0, y, 0, y + th + lip)
      g.addColorStop(0, "rgba(255,232,210,0.14)")
      g.addColorStop(0.55, "rgba(255,232,210,0)")
      g.addColorStop(1, "rgba(0,0,0,0.22)")
      ctx.fillStyle = g
      tilePath(x, y)
      ctx.fill()
      for (const [mx, my, mr] of t.moss) {
        ctx.fillStyle = hsl(90, 28, 28, 0.55)
        ctx.beginPath()
        ctx.arc(x + mx, y + th + my, mr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
  overlayFast(ctx, size, 102, 0.25, 8, 8, 5)
  return c
}

/** Thatch: courses of straw with a lighter top layer and a 1 px shadow line every course. */
function thatch(): HTMLCanvasElement {
  const size = 256
  const [c, ctx] = canvas(size)
  ctx.fillStyle = "#5a4a28"
  ctx.fillRect(0, 0, size, size)
  const rng = new Rng(111)
  const courses = 6
  const ch = size / courses
  ctx.lineWidth = 1
  const stroke = (x: number, y: number, len: number, dx: number) => {
    wrapped(size, Math.min(x, x + dx), y, Math.abs(dx) + 1, len, (wx, wy) => {
      const ox = wx - Math.min(x, x + dx)
      const oy = wy - y
      ctx.beginPath()
      ctx.moveTo(x + ox, y + oy)
      ctx.lineTo(x + dx + ox, y + len + oy)
      ctx.stroke()
    })
  }
  // Under layer: darker straw
  for (let i = 0; i < 1400; i++) {
    ctx.strokeStyle = hsl(rng.range(35, 50), rng.range(30, 45), rng.range(16, 30), 0.6)
    stroke(rng.range(0, size), rng.range(0, size), rng.range(10, 24), rng.range(-2, 2))
  }
  // Top layer: lighter near the top of each course
  for (let i = 0; i < 1600; i++) {
    const y = rng.range(0, size)
    const t = (y % ch) / ch
    ctx.strokeStyle = hsl(rng.range(36, 50), rng.range(32, 50), 26 + (1 - t) * 22 + rng.range(-4, 4), 0.6)
    stroke(rng.range(0, size), y, rng.range(10, 24), rng.range(-2, 2))
  }
  // Shadow line under every course
  for (let k = 0; k < courses; k++) {
    const y = Math.round(k * ch)
    ctx.fillStyle = "rgba(28,18,6,0.55)"
    ctx.fillRect(0, y, size, 1)
    const g = ctx.createLinearGradient(0, y + 1, 0, y + 7)
    g.addColorStop(0, "rgba(28,18,6,0.25)")
    g.addColorStop(1, "rgba(28,18,6,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, y + 1, size, 6)
  }
  return c
}

/** Natural rock: noise, curved strata, lichen dots and a darker foot. */
function rock(): HTMLCanvasElement {
  const size = 256
  const c = noiseTexture(301, size, [138, 134, 126], 0.35, 4, 5)
  const ctx = c.getContext("2d")!
  const rng = new Rng(302)
  ctx.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const y = rng.range(0, size)
    ctx.strokeStyle = `rgba(52,48,42,0.25)`
    for (const oy of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(0, y + oy)
      ctx.bezierCurveTo(size / 3, y + oy + rng.range(-10, 10), (size * 2) / 3, y + oy + rng.range(-10, 10), size, y + oy)
      ctx.stroke()
    }
  }
  speckle(ctx, size, new Rng(303), 160, () => hsl(75, 30, 48, 0.35), [1, 4])
  const g = ctx.createLinearGradient(0, size * 0.6, 0, size)
  g.addColorStop(0, "rgba(20,18,15,0)")
  g.addColorStop(1, "rgba(20,18,15,0.2)")
  ctx.fillStyle = g
  ctx.fillRect(0, size * 0.6, size, size * 0.4)
  return c
}

/** Birch bark: chalky white with dark horizontal lenticels and fine grey vertical streaks. */
function birchBark(): HTMLCanvasElement {
  const size = 256
  const c = noiseCanvas(311, size, [230, 226, 216], 0.05, 6, 12, 4)
  const ctx = c.getContext("2d")!
  const rng = new Rng(312)
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = hsl(35, 6, rng.range(62, 80), 0.35)
    ctx.fillRect(rng.range(0, size), 0, 1, size)
  }
  for (let i = 0; i < 180; i++) {
    const w = rng.range(2, 10)
    const h = rng.range(1, 2.5)
    const x = rng.range(0, size)
    const y = rng.range(0, size)
    ctx.fillStyle = hsl(30, 10, 15, rng.range(0.55, 0.9))
    wrapped(size, x, y, w, h, (wx, wy) => ctx.fillRect(wx, wy, w, h))
  }
  // A few larger dark scars
  for (let i = 0; i < 10; i++) {
    const w = rng.range(14, 34)
    const h = rng.range(3, 7)
    const x = rng.range(0, size)
    const y = rng.range(0, size)
    ctx.fillStyle = hsl(30, 12, 12, 0.75)
    wrapped(size, x, y, w, h, (wx, wy) => {
      ctx.beginPath()
      ctx.ellipse(wx + w / 2, wy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  return c
}

/** Market awning: 32 px stripes red / cream with gentle fold shading (other colour pairs via material colour). */
function awning(): HTMLCanvasElement {
  const size = 256
  const [c, ctx] = canvas(size)
  for (let i = 0; i < size / 32; i++) {
    ctx.fillStyle = i % 2 ? hsl(40, 38, 84) : hsl(358, 55, 38)
    ctx.fillRect(i * 32, 0, 32, size)
  }
  for (let x = 0; x < size; x++) {
    const fold = Math.sin((x / size) * Math.PI * 8) * 0.5 + 0.5
    ctx.fillStyle = `rgba(0,0,0,${0.12 * fold})`
    ctx.fillRect(x, 0, 1, size)
  }
  overlayFast(ctx, size, 321, 0.15, 16, 16, 3)
  return c
}

/** Stained glass: 60 Voronoi cells in red, blue, gold and green with 2 px lead lines (tiles seamlessly). */
function stainedGlass(): HTMLCanvasElement {
  const size = 128
  const [c, ctx] = canvas(size)
  const rng = new Rng(331)
  const hues = [355, 220, 45, 130]
  const seeds: { x: number; y: number; rgb: [number, number, number] }[] = []
  for (let i = 0; i < 60; i++) {
    const col = new THREE.Color().setHSL(rng.pick(hues) / 360, 0.6, rng.range(0.35, 0.55), THREE.SRGBColorSpace)
    const rgb = col.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
    seeds.push({ x: rng.range(0, size), y: rng.range(0, size), rgb: [rgb.r * 255, rgb.g * 255, rgb.b * 255] })
  }
  const img = ctx.createImageData(size, size)
  const n = tileNoise(332, size, 8, 8, 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity
      let d2 = Infinity
      let best = 0
      for (let i = 0; i < seeds.length; i++) {
        let dx = Math.abs(x - seeds[i].x)
        let dy = Math.abs(y - seeds[i].y)
        if (dx > size / 2) dx = size - dx
        if (dy > size / 2) dy = size - dy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < d1) {
          d2 = d1
          d1 = d
          best = i
        } else if (d < d2) d2 = d
      }
      const k = (y * size + x) * 4
      if (d2 - d1 < 2) {
        img.data[k] = 34
        img.data[k + 1] = 32
        img.data[k + 2] = 30
      } else {
        const s = seeds[best].rgb
        const v = 1 + n[y * size + x] * 0.25 - Math.min(d1 / 40, 0.2)
        img.data[k] = Math.min(255, s[0] * v)
        img.data[k + 1] = Math.min(255, s[1] * v)
        img.data[k + 2] = Math.min(255, s[2] * v)
      }
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Cobweb: radial threads and concentric rings on a transparent 64 px canvas (alpha only, clamp to edge). */
function web(): HTMLCanvasElement {
  const size = 64
  const [c, ctx] = canvas(size)
  ctx.clearRect(0, 0, size, size)
  const rng = new Rng(341)
  const cx = size / 2
  const cy = size / 2
  const spokes = 11
  const angles: number[] = []
  for (let i = 0; i < spokes; i++) angles.push((i / spokes) * Math.PI * 2 + rng.range(-0.15, 0.15))
  ctx.strokeStyle = "rgba(235,235,235,0.6)"
  ctx.lineWidth = 0.8
  for (const a of angles) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * size * 0.7, cy + Math.sin(a) * size * 0.7)
    ctx.stroke()
  }
  for (let r = 4; r < size * 0.5; r += rng.range(3, 4.5)) {
    ctx.beginPath()
    for (let i = 0; i <= spokes; i++) {
      const a = angles[i % spokes]
      const rr = r * rng.range(0.92, 1.05)
      const x = cx + Math.cos(a) * rr
      const y = cy + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return c
}

/** Leaf atlas: pointed leaf shapes in three hue bands plus a share of brown ones, darker toward the bottom. */
function leaves(seed: number, bands: [number, number][], brown: number): HTMLCanvasElement {
  const size = 256
  const [c, ctx] = canvas(size)
  ctx.clearRect(0, 0, size, size)
  const rng = new Rng(seed)
  for (let i = 0; i < 1400; i++) {
    const isBrown = rng.chance(brown)
    const band = bands[rng.int(0, bands.length - 1)]
    ctx.fillStyle = isBrown ? hsl(rng.range(26, 36), rng.range(30, 42), rng.range(18, 28), 0.95) : hsl(rng.range(band[0], band[1]), rng.range(24, 44), rng.range(14, 32), 0.95)
    const len = rng.range(9, 16)
    const wid = rng.range(6, 10)
    const a = rng.range(0, Math.PI * 2)
    const x = rng.range(0, size)
    const y = rng.range(0, size)
    wrapped(size, x - len, y - len, len * 2, len * 2, (wx, wy) => leaf(ctx, wx + len, wy + len, len, wid, a))
  }
  ctx.globalCompositeOperation = "source-atop"
  const g = ctx.createLinearGradient(0, size * 0.35, 0, size)
  g.addColorStop(0, "rgba(0,0,0,0)")
  g.addColorStop(1, "rgba(0,0,0,0.3)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = "source-over"
  return c
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number): void {
  const ca = Math.cos(ang)
  const sa = Math.sin(ang)
  const px = (u: number, v: number) => x + u * ca - v * sa
  const py = (u: number, v: number) => y + u * sa + v * ca
  ctx.beginPath()
  ctx.moveTo(px(0, 0), py(0, 0))
  ctx.quadraticCurveTo(px(len * 0.45, wid), py(len * 0.45, wid), px(len, 0), py(len, 0))
  ctx.quadraticCurveTo(px(len * 0.45, -wid), py(len * 0.45, -wid), px(0, 0), py(0, 0))
  ctx.fill()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function overlayNoise(ctx: CanvasRenderingContext2D, size: number, seed: number, strength: number) {
  const n = noiseTexture(seed, size, [128, 128, 128], 1, 5, 4)
  ctx.globalCompositeOperation = "overlay"
  ctx.globalAlpha = strength
  ctx.drawImage(n, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
}

/** Like overlayNoise but with the fast tileable lattice noise (used by the 512 px textures). */
function overlayFast(ctx: CanvasRenderingContext2D, size: number, seed: number, strength: number, cellsX: number, cellsY: number, octaves: number) {
  // Large textures: half-resolution noise scaled up (the overlay is low-frequency anyway)
  const res = size > 256 ? size / 2 : size
  const n = noiseCanvas(seed, res, [128, 128, 128], 0.9, cellsX, cellsY, octaves - (res < size ? 1 : 0))
  ctx.globalCompositeOperation = "overlay"
  ctx.globalAlpha = strength
  ctx.drawImage(n, 0, 0, size, size)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
}

/** Separable box blur with wrap-around (two passes approximate a Gaussian). */
function boxBlur(src: Float32Array, size: number, r: number): Float32Array {
  const tmp = new Float32Array(size * size)
  const out = new Float32Array(size * size)
  const inv = 1 / (2 * r + 1)
  for (let y = 0; y < size; y++) {
    const row = y * size
    let acc = 0
    for (let k = -r; k <= r; k++) acc += src[row + ((k + size) % size)]
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc * inv
      acc += src[row + ((x + r + 1) % size)] - src[row + ((x - r + size) % size)]
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += tmp[((k + size) % size) * size + x]
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc * inv
      acc += tmp[((y + r + 1) % size) * size + x] - tmp[((y - r + size) % size) * size + x]
    }
  }
  return out
}

/**
 * Tangent-space normal map from a height field canvas (red channel, white = raised; `strength` = relief of a
 * full black-to-white step in pixels). The height is blurred (two box passes ≈ Gaussian σ 2 px) and
 * differentiated with wrap-around so the result tiles. Canvas rows run downward while texture v runs upward
 * (flipY), hence the sign of the green channel.
 */
export function heightToNormal(height: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const size = height.width
  const src = height.getContext("2d")!.getImageData(0, 0, size, size).data
  const raw = new Float32Array(size * size)
  for (let i = 0; i < raw.length; i++) raw[i] = src[i * 4] / 255
  const h = boxBlur(boxBlur(raw, size, 2), size, 2)
  const [c, ctx] = canvas(size)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    const up = ((y - 1 + size) % size) * size
    const dn = ((y + 1) % size) * size
    for (let x = 0; x < size; x++) {
      const l = (x - 1 + size) % size
      const r = (x + 1) % size
      const du = (h[y * size + r] - h[y * size + l]) * 0.5 * strength
      const dv = -(h[dn + x] - h[up + x]) * 0.5 * strength
      const nx = -du
      const ny = -dv
      const inv = 1 / Math.hypot(nx, ny, 1)
      const k = (y * size + x) * 4
      img.data[k] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      img.data[k + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      img.data[k + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Ground texture of an area; repeats across the whole map. */
export function groundTexture(biome: string): THREE.Texture {
  switch (biome) {
    case "forest":
      return tex("moss")
    case "castle":
    case "fortress":
      return tex("gravel")
    case "catacombs":
      return tex("stone_dark")
    case "city":
      return tex("cobble")
    case "graveyard":
      return tex("mud")
    default:
      return tex("grass")
  }
}
