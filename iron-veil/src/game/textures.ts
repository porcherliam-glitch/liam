/**
 * textures.ts — procedural canvas textures (no image files). Every generator draws a seamless tile into a canvas;
 * canvases are cached per name and size so switching missions only re-uploads them (world.ts creates and disposes the
 * THREE textures). TEX lists the real-world size of one tile in metres (UVs in world.ts are in metres).
 * Neutral light textures (cladding, container, metal, plaster, siding, concrete) are tinted by vertex colours.
 */

export type TexName =
  | "asphalt" | "concrete" | "pavement" | "quay" | "pad" | "gravel" | "dirt" | "grass" | "floor" | "tiles" | "plank"
  | "brick" | "plaster" | "cladding" | "rollup" | "roof" | "container" | "metal" | "crate" | "pallets" | "rack"
  | "sandbag" | "hesco" | "siding" | "block" | "bunker" | "glass" | "chainlink" | "foliage" | "smoke" | "truss"
  | "concertina" | "burlap" | "padmark" | "rubber" | "sandwall"

/** Metres covered by one texture tile ([u, v]). Local-UV textures map one tile to one object face. */
export const TEX: Record<TexName, [number, number]> = {
  asphalt: [7, 7], concrete: [4, 4], pavement: [4, 4], quay: [8, 8], pad: [6, 6], gravel: [3, 3], dirt: [6, 6], grass: [5, 5],
  floor: [4, 4], tiles: [2, 2], plank: [2, 2], brick: [2, 2], plaster: [3, 3], cladding: [3, 3], rollup: [3, 3], roof: [6, 6],
  container: [2.24, 2.24], metal: [2, 2], crate: [1.2, 1.2], pallets: [1.2, 1.2], rack: [2.7, 3.6], sandbag: [1, 1],
  hesco: [1.05, 1.05], siding: [2, 2], block: [2, 2], bunker: [4, 4], glass: [2, 2], chainlink: [0.6, 0.6], foliage: [1, 1],
  smoke: [1, 1], truss: [2, 2], concertina: [1.4, 0.7], burlap: [1, 1], padmark: [1, 1], rubber: [1, 1], sandwall: [1.2, 1.15],
}

type Ctx = CanvasRenderingContext2D
type Rng = () => number

export function mulberry(seed: number): Rng {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

const canvasCache = new Map<string, HTMLCanvasElement>()
const fieldCache = new Map<string, Float32Array>()

/** Seamless value-noise fbm in 0..1 (period = lattice cells across the tile for the first octave). */
function fbm(size: number, period: number, octaves: number, seed: number): Float32Array {
  const key = `${size}:${period}:${octaves}:${seed}`
  const hit = fieldCache.get(key); if (hit) return hit
  const out = new Float32Array(size * size)
  const rng = mulberry(seed)
  let amp = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const p = period << o
    const g = new Float32Array(p * p); for (let i = 0; i < g.length; i++) g[i] = rng()
    const s = p / size
    for (let y = 0; y < size; y++) {
      const fy = y * s, y0 = Math.floor(fy), ty0 = fy - y0, ty = ty0 * ty0 * (3 - 2 * ty0)
      const r0 = (y0 % p) * p, r1 = ((y0 + 1) % p) * p
      for (let x = 0; x < size; x++) {
        const fx = x * s, x0 = Math.floor(fx), tx0 = fx - x0, tx = tx0 * tx0 * (3 - 2 * tx0)
        const c0 = x0 % p, c1 = (x0 + 1) % p
        const a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * tx, b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * tx
        out[y * size + x] += (a + (b - a) * ty) * amp
      }
    }
    total += amp; amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  fieldCache.set(key, out)
  return out
}

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas"); c.width = w; c.height = h
  return [c, c.getContext("2d", { willReadFrequently: true })!]
}

/** Per-pixel fill: base colour modulated by noise fields; fn may tweak the rgb triple in place. */
function pixels(ctx: Ctx, w: number, h: number, fn: (x: number, y: number, c: number[]) => void): void {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, c = [0, 0, 0, 255]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    c[0] = d[i]; c[1] = d[i + 1]; c[2] = d[i + 2]; c[3] = d[i + 3]
    fn(x, y, c)
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]
  }
  ctx.putImageData(img, 0, 0)
}

/** Draws fn at the 9 wrapped offsets so shapes crossing an edge continue on the opposite side. */
function wrap(ctx: Ctx, w: number, h: number, fn: () => void): void {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore() }
}

function base(ctx: Ctx, size: number, rgb: [number, number, number], seed: number, big: number, fine: number, grain: number, period = 4): void {
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.fillRect(0, 0, size, size)
  const f1 = fbm(size, period, 4, seed), f2 = fbm(size, period * 8, 2, seed + 7)
  const rng = mulberry(seed + 99)
  pixels(ctx, size, size, (x, y, c) => {
    const i = y * size + x, v = (f1[i] - 0.5) * big + (f2[i] - 0.5) * fine + (rng() - 0.5) * grain
    c[0] += v; c[1] += v; c[2] += v
  })
}

function blotches(ctx: Ctx, size: number, rng: Rng, n: number, color: string, rmin: number, rmax: number): void {
  for (let i = 0; i < n; i++) {
    const x = rng() * size, y = rng() * size, r = (rmin + rng() * (rmax - rmin)) * size
    wrap(ctx, size, size, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, Math.PI * 2); ctx.fill()
    })
  }
}

function cracks(ctx: Ctx, size: number, rng: Rng, n: number, color: string, width: number, len: number): void {
  ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round"
  for (let i = 0; i < n; i++) {
    const pts: Array<[number, number]> = []
    let x = rng() * size, y = rng() * size, a = rng() * Math.PI * 2
    const steps = 8 + Math.floor(rng() * 14)
    for (let s = 0; s < steps; s++) { pts.push([x, y]); a += (rng() - 0.5) * 1.2; const st = size * len / steps; x += Math.cos(a) * st; y += Math.sin(a) * st }
    const w = width * (0.6 + rng() * 0.8)
    wrap(ctx, size, size, () => {
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke()
      if (pts.length > 6) { const b = pts[Math.floor(pts.length / 2)]; ctx.lineWidth = w * 0.6; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + (rng() - 0.5) * size * 0.08, b[1] + (rng() - 0.5) * size * 0.08); ctx.stroke() }
    })
  }
}

function streaks(ctx: Ctx, size: number, rng: Rng, n: number, rgb: string, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const x = rng() * size, y = rng() * size, w = 1 + rng() * size * 0.012, l = size * (0.15 + rng() * 0.5), a = alpha * (0.4 + rng() * 0.6)
    wrap(ctx, size, size, () => {
      const g = ctx.createLinearGradient(0, y, 0, y + l); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g; ctx.fillRect(x, y, w, l)
    })
  }
}

function speckle(ctx: Ctx, size: number, rng: Rng, n: number, colors: string[], r: number): void {
  for (let i = 0; i < n; i++) { ctx.fillStyle = colors[Math.floor(rng() * colors.length)]; const s = r * (0.5 + rng()); ctx.fillRect(rng() * size, rng() * size, s, s) }
}

/** Corrugated profile multiplier for x in [0, 1) of one rib period. */
function rib(t: number, depth: number): number {
  if (t < 0.38) return 1 + depth * 0.15
  if (t < 0.5) return 1 - depth * 0.45 * Math.sin((t - 0.38) / 0.12 * Math.PI * 0.5)
  if (t < 0.88) return 1 - depth * 0.2
  return 1 + depth * 0.35 * Math.sin((t - 0.88) / 0.12 * Math.PI)
}

const GEN: Record<TexName, (n: number) => HTMLCanvasElement> = {
  asphalt(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(11)
    base(ctx, n, [62, 61, 60], 11, 34, 14, 22, 3)
    for (let i = 0; i < 4; i++) {
      const x = rng() * n, y = rng() * n, w = n * (0.12 + rng() * 0.25), h = n * (0.08 + rng() * 0.2), dark = rng() < 0.6
      wrap(ctx, n, n, () => { ctx.fillStyle = dark ? "rgba(10,10,12,0.22)" : "rgba(120,118,112,0.12)"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "rgba(15,15,15,0.5)"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h) })
    }
    speckle(ctx, n, rng, n * n / 28, ["rgba(150,148,142,0.55)", "rgba(110,108,104,0.5)", "rgba(25,25,25,0.5)"], n / 512 * 1.6)
    blotches(ctx, n, rng, 4, "rgba(0,0,0,0.35)", 0.03, 0.08)
    cracks(ctx, n, rng, 7, "rgba(18,18,18,0.8)", n / 512 * 2, 0.35)
    return c
  },
  concrete(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(12)
    base(ctx, n, [176, 174, 168], 12, 30, 12, 12, 3)
    ctx.fillStyle = "rgba(60,60,58,0.25)"
    for (let y = 0; y < 4; y++) { ctx.fillRect(0, y * n / 4, n, Math.max(1, n / 400)); for (let x = 0; x < 4; x++) { ctx.beginPath(); ctx.arc((x + 0.5) * n / 4, (y + 0.5) * n / 4, n / 220, 0, 7); ctx.fill() } }
    streaks(ctx, n, rng, 26, "40,38,34", 0.22)
    blotches(ctx, n, rng, 10, "rgba(70,66,58,0.16)", 0.04, 0.14)
    cracks(ctx, n, rng, 2, "rgba(60,60,60,0.5)", 1, 0.2)
    return c
  },
  bunker(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(13)
    base(ctx, n, [160, 158, 152], 13, 26, 10, 10, 3)
    for (let y = 0; y < n; y += n / 24) { ctx.fillStyle = rng() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)"; ctx.fillRect(0, y, n, n / 24); ctx.fillStyle = "rgba(40,40,40,0.18)"; ctx.fillRect(0, y, n, 1) }
    streaks(ctx, n, rng, 30, "30,30,26", 0.28)
    blotches(ctx, n, rng, 12, "rgba(50,56,40,0.18)", 0.04, 0.12)
    return c
  },
  pavement(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(14)
    base(ctx, n, [150, 148, 142], 14, 22, 10, 14, 3)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { ctx.fillStyle = `rgba(${rng() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + rng() * 0.05})`; ctx.fillRect(x * n / 2, y * n / 2, n / 2, n / 2) }
    ctx.fillStyle = "rgba(30,30,30,0.6)"
    for (let i = 0; i < 2; i++) { ctx.fillRect(i * n / 2, 0, Math.max(1.5, n / 300), n); ctx.fillRect(0, i * n / 2, n, Math.max(1.5, n / 300)) }
    blotches(ctx, n, rng, 6, "rgba(40,36,30,0.2)", 0.03, 0.1)
    cracks(ctx, n, rng, 2, "rgba(40,40,40,0.6)", 1, 0.15)
    return c
  },
  quay(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(15)
    base(ctx, n, [128, 128, 126], 15, 26, 12, 16, 3)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { ctx.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.07})`; ctx.fillRect(x * n / 2, y * n / 2, n / 2, n / 2) }
    ctx.fillStyle = "rgba(25,25,25,0.7)"
    for (let i = 0; i < 2; i++) { ctx.fillRect(i * n / 2, 0, Math.max(2, n / 260), n); ctx.fillRect(0, i * n / 2, n, Math.max(2, n / 260)) }
    ctx.strokeStyle = "rgba(20,20,20,0.18)"; ctx.lineWidth = n / 70
    for (let i = 0; i < 3; i++) { const y = rng() * n, k = rng() * n; wrap(ctx, n, n, () => { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(n * 0.3, y + k * 0.1, n * 0.6, y - k * 0.1, n, y); ctx.stroke() }) }
    blotches(ctx, n, rng, 7, "rgba(0,0,0,0.28)", 0.02, 0.07)
    cracks(ctx, n, rng, 4, "rgba(30,30,30,0.6)", 1.2, 0.2)
    return c
  },
  pad(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(16)
    base(ctx, n, [140, 140, 138], 16, 18, 8, 10, 3)
    ctx.fillStyle = "rgba(30,30,30,0.5)"
    ctx.fillRect(0, 0, n, 2); ctx.fillRect(0, n / 2, n, 2); ctx.fillRect(0, 0, 2, n); ctx.fillRect(n / 2, 0, 2, n)
    blotches(ctx, n, rng, 5, "rgba(0,0,0,0.25)", 0.03, 0.08)
    return c
  },
  gravel(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(17)
    base(ctx, n, [112, 104, 92], 17, 26, 10, 18, 3)
    const s = n / 512
    for (let i = 0; i < n * n / 60; i++) {
      const x = rng() * n, y = rng() * n, r = (1.4 + rng() * 3.2) * s, t = 70 + rng() * 90, warm = rng() * 14
      ctx.fillStyle = `rgb(${t + warm},${t + warm * 0.6},${t})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.4), rng() * 3, 0, 7); ctx.fill()
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, 7); ctx.fill()
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.45, r * 0.7, r * 0.25, 0, 0, 7); ctx.fill()
    }
    blotches(ctx, n, rng, 6, "rgba(60,48,34,0.25)", 0.05, 0.15)
    return c
  },
  dirt(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(18)
    base(ctx, n, [104, 88, 66], 18, 40, 16, 16, 3)
    blotches(ctx, n, rng, 14, "rgba(52,40,28,0.3)", 0.04, 0.16)
    blotches(ctx, n, rng, 10, "rgba(120,124,70,0.22)", 0.03, 0.1)
    speckle(ctx, n, rng, n * n / 160, ["rgba(150,138,118,0.7)", "rgba(70,60,48,0.6)", "rgba(110,112,80,0.5)"], n / 512 * 2.4)
    ctx.strokeStyle = "rgba(96,104,52,0.55)"; ctx.lineWidth = n / 512
    for (let i = 0; i < n / 2; i++) { const x = rng() * n, y = rng() * n; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * n / 80, y - n / 60 * rng()); ctx.stroke() }
    return c
  },
  grass(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(19)
    base(ctx, n, [70, 80, 48], 19, 40, 18, 18, 3)
    blotches(ctx, n, rng, 12, "rgba(90,74,44,0.35)", 0.04, 0.12)
    ctx.lineWidth = Math.max(1, n / 400)
    for (let i = 0; i < n * 3; i++) {
      const x = rng() * n, y = rng() * n, t = rng()
      ctx.strokeStyle = t < 0.5 ? "rgba(96,112,58,0.7)" : t < 0.8 ? "rgba(52,62,34,0.7)" : "rgba(130,120,74,0.6)"
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * n / 60, y - n / 40 * (0.4 + rng())); ctx.stroke()
    }
    return c
  },
  floor(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(20)
    base(ctx, n, [132, 132, 128], 20, 18, 8, 6, 2)
    blotches(ctx, n, rng, 10, "rgba(30,30,30,0.15)", 0.04, 0.14)
    ctx.strokeStyle = "rgba(20,20,20,0.12)"; ctx.lineWidth = n / 120
    for (let i = 0; i < 6; i++) { const x = rng() * n, y = rng() * n; wrap(ctx, n, n, () => { ctx.beginPath(); ctx.arc(x, y, n * (0.05 + rng() * 0.1), rng() * 3, rng() * 3 + 1.5); ctx.stroke() }) }
    ctx.fillStyle = "rgba(25,25,25,0.4)"; ctx.fillRect(0, 0, n, Math.max(1, n / 400)); ctx.fillRect(0, 0, Math.max(1, n / 400), n)
    return c
  },
  tiles(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(21)
    base(ctx, n, [168, 162, 150], 21, 12, 6, 8, 2)
    const k = 5, t = n / k
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) { ctx.fillStyle = `rgba(${rng() < 0.5 ? "0,0,0" : "255,255,255"},${rng() * 0.07})`; ctx.fillRect(x * t, y * t, t, t) }
    ctx.fillStyle = "rgba(70,66,60,0.7)"
    for (let i = 0; i < k; i++) { ctx.fillRect(i * t, 0, Math.max(1.5, n / 300), n); ctx.fillRect(0, i * t, n, Math.max(1.5, n / 300)) }
    blotches(ctx, n, rng, 6, "rgba(60,50,40,0.18)", 0.04, 0.12)
    return c
  },
  plank(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(22)
    base(ctx, n, [118, 92, 66], 22, 18, 10, 10, 2)
    const rows = 11, h = n / rows
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = `rgba(${rng() < 0.5 ? "0,0,0" : "255,230,200"},${rng() * 0.12})`; ctx.fillRect(0, r * h, n, h)
      ctx.strokeStyle = "rgba(50,34,20,0.25)"; ctx.lineWidth = 1
      for (let g = 0; g < 4; g++) { const y = r * h + rng() * h; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= n; x += n / 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + g) * h * 0.08); ctx.stroke() }
      ctx.fillStyle = "rgba(30,20,12,0.7)"; ctx.fillRect(0, r * h, n, Math.max(1, n / 400))
      const j = rng() * n; ctx.fillRect(j, r * h, Math.max(1, n / 400), h)
    }
    return c
  },
  brick(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(23)
    ctx.fillStyle = "rgb(150,144,134)"; ctx.fillRect(0, 0, n, n)
    const rows = 24, cols = 8, bh = n / rows, bw = n / cols, m = Math.max(1, n / 300)
    for (let r = 0; r < rows; r++) for (let k = -1; k < cols; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), t = rng()
      const rr = 150 + (t - 0.5) * 50, gg = 78 + (rng() - 0.5) * 24, bb = 58 + (rng() - 0.5) * 18
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`; ctx.fillRect(x + m, r * bh + m, bw - 2 * m, bh - 2 * m)
      if (rng() < 0.12) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x + m, r * bh + m, bw - 2 * m, bh - 2 * m) }
    }
    const f = fbm(n, 4, 3, 23), g = mulberry(230)
    pixels(ctx, n, n, (x, y, cc) => { const v = (f[y * n + x] - 0.5) * 30 + (g() - 0.5) * 16; cc[0] += v; cc[1] += v; cc[2] += v })
    streaks(ctx, n, rng, 10, "30,26,22", 0.2)
    return c
  },
  plaster(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(24)
    base(ctx, n, [214, 210, 202], 24, 10, 7, 9, 3)
    blotches(ctx, n, rng, 7, "rgba(90,80,64,0.07)", 0.05, 0.18)
    streaks(ctx, n, rng, 12, "60,56,50", 0.1)
    cracks(ctx, n, rng, 2, "rgba(80,76,70,0.3)", 1, 0.12)
    return c
  },
  cladding(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(25)
    base(ctx, n, [196, 198, 198], 25, 20, 8, 8, 3)
    const ribs = 12, f = fbm(n, 2, 2, 250)
    pixels(ctx, n, n, (x, y, cc) => { const k = rib((x * ribs / n) % 1, 1) * (0.94 + f[y * n + x] * 0.12); cc[0] *= k; cc[1] *= k; cc[2] *= k })
    ctx.fillStyle = "rgba(40,40,40,0.25)"; ctx.fillRect(0, n / 2, n, Math.max(1, n / 300)); ctx.fillRect(0, 0, n, Math.max(1, n / 300))
    ctx.fillStyle = "rgba(30,30,30,0.5)"
    for (let i = 0; i < ribs; i++) for (const y of [n * 0.01, n * 0.51]) ctx.fillRect((i + 0.2) * n / ribs, y + 2, n / 300 + 1, n / 300 + 1)
    streaks(ctx, n, rng, 34, "70,52,36", 0.22)
    blotches(ctx, n, rng, 6, "rgba(70,60,50,0.12)", 0.05, 0.15)
    return c
  },
  rollup(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(26)
    base(ctx, n, [190, 190, 186], 26, 16, 6, 8, 3)
    const slats = 30
    pixels(ctx, n, n, (x, y, cc) => { const t = (y * slats / n) % 1, k = t < 0.1 ? 0.62 : t < 0.2 ? 1.12 : 1 - (t - 0.2) * 0.18; cc[0] *= k; cc[1] *= k; cc[2] *= k })
    streaks(ctx, n, rng, 18, "60,50,40", 0.18)
    return c
  },
  roof(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(27)
    base(ctx, n, [84, 84, 86], 27, 22, 10, 18, 3)
    ctx.fillStyle = "rgba(150,150,150,0.25)"
    for (let i = 0; i < 6; i++) ctx.fillRect(0, i * n / 6, n, Math.max(1.5, n / 250))
    speckle(ctx, n, rng, n * n / 50, ["rgba(140,138,130,0.5)", "rgba(40,40,40,0.5)"], n / 512 * 1.5)
    blotches(ctx, n, rng, 8, "rgba(30,30,30,0.25)", 0.04, 0.12)
    return c
  },
  container(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(28)
    base(ctx, n, [202, 202, 200], 28, 18, 8, 8, 2)
    const ribs = 8, f = fbm(n, 2, 2, 280)
    pixels(ctx, n, n, (x, y, cc) => { const k = rib((x * ribs / n) % 1, 1.15) * (0.93 + f[y * n + x] * 0.14); cc[0] *= k; cc[1] *= k; cc[2] *= k })
    streaks(ctx, n, rng, 26, "60,40,26", 0.28)
    blotches(ctx, n, rng, 10, "rgba(110,60,30,0.28)", 0.01, 0.04)
    speckle(ctx, n, rng, 60, ["rgba(90,50,24,0.6)", "rgba(40,30,24,0.5)"], n / 512 * 3)
    return c
  },
  metal(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(29)
    base(ctx, n, [200, 200, 198], 29, 20, 10, 8, 3)
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1
    for (let i = 0; i < 60; i++) { const x = rng() * n, y = rng() * n, a = rng() * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * n * 0.04, y + Math.sin(a) * n * 0.04); ctx.stroke() }
    blotches(ctx, n, rng, 12, "rgba(100,58,30,0.22)", 0.01, 0.05)
    speckle(ctx, n, rng, 55, ["rgba(60,40,28,0.6)", "rgba(30,30,30,0.5)"], n / 512 * 2.2)
    streaks(ctx, n, rng, 14, "70,46,28", 0.2)
    return c
  },
  crate(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(30)
    base(ctx, n, [178, 146, 102], 30, 18, 12, 14, 2)
    const b = n * 0.1
    ctx.strokeStyle = "rgba(60,40,20,0.35)"; ctx.lineWidth = 1
    for (let i = 0; i < 40; i++) { const y = rng() * n; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= n; x += n / 12) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2); ctx.stroke() }
    ctx.fillStyle = "rgba(40,26,12,0.55)"
    for (let i = 1; i < 5; i++) ctx.fillRect(0, i * n / 5, n, Math.max(1, n / 200))
    ctx.fillStyle = "rgb(160,126,84)"; ctx.fillRect(0, 0, n, b); ctx.fillRect(0, n - b, n, b); ctx.fillRect(0, 0, b, n); ctx.fillRect(n - b, 0, b, n)
    ctx.save(); ctx.translate(n / 2, n / 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-n * 0.7, -b / 2, n * 1.4, b); ctx.restore()
    ctx.strokeStyle = "rgba(40,26,12,0.7)"; ctx.lineWidth = Math.max(1, n / 250); ctx.strokeRect(b, b, n - 2 * b, n - 2 * b); ctx.strokeRect(1, 1, n - 2, n - 2)
    ctx.fillStyle = "rgba(40,40,40,0.8)"; for (const [x, y] of [[b / 2, b / 2], [n - b / 2, b / 2], [b / 2, n - b / 2], [n - b / 2, n - b / 2]]) { ctx.beginPath(); ctx.arc(x, y, n / 120, 0, 7); ctx.fill() }
    ctx.fillStyle = "rgba(30,30,30,0.55)"; ctx.font = `bold ${n * 0.09}px monospace`; ctx.textAlign = "center"; ctx.fillText("IV-SUP", n / 2, n * 0.35)
    return c
  },
  pallets(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(31)
    ctx.fillStyle = "rgb(36,28,20)"; ctx.fillRect(0, 0, n, n)
    const ph = n / 8
    for (let p = 0; p < 8; p++) {
      const y = p * ph, t = 150 + (rng() - 0.5) * 30
      ctx.fillStyle = `rgb(${t},${t * 0.8},${t * 0.55})`; ctx.fillRect(0, y, n, ph * 0.18); ctx.fillRect(0, y + ph * 0.84, n, ph * 0.16)
      for (const bx of [0, 0.45, 0.9]) { ctx.fillStyle = `rgb(${t - 12},${(t - 12) * 0.78},${(t - 12) * 0.52})`; ctx.fillRect(bx * n, y + ph * 0.18, n * 0.1, ph * 0.66) }
    }
    const f = fbm(n, 4, 2, 31), g = mulberry(310)
    pixels(ctx, n, n, (x, y, cc) => { const v = (f[y * n + x] - 0.5) * 24 + (g() - 0.5) * 18; cc[0] += v; cc[1] += v; cc[2] += v })
    return c
  },
  rack(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(32)
    ctx.fillStyle = "rgb(22,22,24)"; ctx.fillRect(0, 0, n, n)
    const my = (m: number) => n - m / 3.6 * n, mx = (m: number) => m / 2.7 * n
    const levels = [0.12, 1.25, 2.35, 3.45]
    for (let l = 0; l < 3; l++) {
      for (let bay = 0; bay < 2; bay++) {
        let x = mx(bay * 1.35 + 0.1)
        const end = mx(bay * 1.35 + 1.3), top = my(levels[l + 1] - 0.08), bot = my(levels[l] + 0.06)
        while (x < end - 4) {
          const w = mx(0.25 + rng() * 0.45), h = (bot - top) * (0.45 + rng() * 0.5), t = rng()
          const col = t < 0.55 ? [150 + rng() * 30, 115 + rng() * 20, 70] : t < 0.75 ? [200, 200, 196] : t < 0.9 ? [70, 90, 120] : [140, 60, 40]
          ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fillRect(x, bot - h, Math.min(w, end - x), h)
          ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, bot - h, Math.min(w, end - x), 2); ctx.fillRect(x + Math.min(w, end - x) - 2, bot - h, 2, h)
          if (rng() < 0.5 && h > 12) { const h2 = h * 0.5; ctx.fillStyle = `rgb(${col[0] - 15},${col[1] - 12},${col[2] - 8})`; ctx.fillRect(x + 2, bot - h - h2, Math.min(w, end - x) - 4, h2) }
          x += w + 2
        }
      }
    }
    ctx.fillStyle = "rgb(214,108,34)"
    for (const l of levels) ctx.fillRect(0, my(l) - n * 0.012, n, n * 0.03)
    ctx.fillStyle = "rgb(40,82,150)"
    for (const u of [0, 1.35, 2.7]) ctx.fillRect(mx(u) - n * 0.02, 0, n * 0.04, n)
    return c
  },
  sandbag(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(33)
    base(ctx, n, [156, 140, 104], 33, 18, 10, 20, 2)
    ctx.strokeStyle = "rgba(60,50,30,0.18)"; ctx.lineWidth = 1
    for (let i = 0; i < n; i += 3) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, n); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(n, i); ctx.stroke() }
    ctx.fillStyle = "rgba(50,40,24,0.35)"; ctx.fillRect(0, n * 0.48, n, n * 0.03)
    blotches(ctx, n, rng, 6, "rgba(70,56,30,0.25)", 0.05, 0.2)
    return c
  },
  burlap(n) { return GEN.sandbag(n) },
  hesco(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(34)
    base(ctx, n, [172, 158, 124], 34, 22, 10, 14, 2)
    const k = 14, s = n / k
    pixels(ctx, n, n, (x, y, cc) => { const u = (x % s) / s - 0.5, v = (y % s) / s - 0.5, b = 1 - (u * u + v * v) * 0.7; cc[0] *= b; cc[1] *= b; cc[2] *= b })
    ctx.strokeStyle = "rgba(70,72,72,0.9)"; ctx.lineWidth = Math.max(1, n / 300)
    for (let i = 0; i <= k; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, n); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(n, i * s); ctx.stroke() }
    ctx.fillStyle = "rgba(60,60,58,0.9)"; ctx.fillRect(0, 0, n * 0.025, n); ctx.fillRect(n - n * 0.025, 0, n * 0.025, n)
    blotches(ctx, n, rng, 8, "rgba(80,70,46,0.25)", 0.05, 0.2)
    return c
  },
  siding(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(35)
    base(ctx, n, [206, 204, 196], 35, 16, 8, 10, 2)
    const boards = 10, h = n / boards
    for (let b = 0; b < boards; b++) {
      const g = ctx.createLinearGradient(0, b * h, 0, (b + 1) * h); g.addColorStop(0, "rgba(255,255,255,0.08)"); g.addColorStop(0.85, "rgba(0,0,0,0.06)"); g.addColorStop(0.86, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0.25)")
      ctx.fillStyle = g; ctx.fillRect(0, b * h, n, h)
      if (rng() < 0.5) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(rng() * n, b * h, Math.max(1, n / 400), h * 0.86) }
    }
    streaks(ctx, n, rng, 12, "50,46,40", 0.14)
    return c
  },
  block(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(36)
    base(ctx, n, [172, 170, 164], 36, 16, 10, 18, 3)
    const rows = 10, cols = 5, bh = n / rows, bw = n / cols
    ctx.fillStyle = "rgba(60,58,54,0.55)"
    for (let r = 0; r < rows; r++) {
      ctx.fillRect(0, r * bh, n, Math.max(1.5, n / 300))
      for (let k = 0; k <= cols; k++) ctx.fillRect(k * bw + (r % 2 ? bw / 2 : 0), r * bh, Math.max(1.5, n / 300), bh)
    }
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { ctx.fillStyle = `rgba(0,0,0,${rng() * 0.06})`; ctx.fillRect(k * bw + (r % 2 ? bw / 2 : 0), r * bh, bw, bh) }
    streaks(ctx, n, rng, 14, "40,38,34", 0.18)
    return c
  },
  glass(n) {
    const [c, ctx] = canvas(n)
    const g = ctx.createLinearGradient(0, n, 0, 0); g.addColorStop(0, "rgb(26,30,36)"); g.addColorStop(0.6, "rgb(58,68,80)"); g.addColorStop(1, "rgb(96,108,122)")
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(n * (0.2 + i * 0.3), 0); ctx.transform(1, 0, -0.5, 1, 0, 0); ctx.fillRect(0, 0, n * 0.08, n); ctx.restore() }
    return c
  },
  chainlink(n) {
    const [c, ctx] = canvas(n)
    ctx.clearRect(0, 0, n, n)
    const k = 8, s = n / k
    ctx.strokeStyle = "rgba(196,200,204,0.9)"; ctx.lineWidth = Math.max(1.2, n / 170)
    for (let i = -1; i <= k; i++) {
      ctx.beginPath(); for (let j = 0; j <= k * 2; j++) { const y = j * s / 2, x = i * s + (j % 2 ? s / 2 : 0); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke()
      ctx.beginPath(); for (let j = 0; j <= k * 2; j++) { const y = j * s / 2, x = i * s + (j % 2 ? 0 : s / 2); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke()
    }
    return c
  },
  foliage(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(37)
    ctx.clearRect(0, 0, n, n)
    const h = n / 2
    // cell 0: grass tuft, 1: tall weeds, 2: dry grass, 3: leafy weed
    const tuft = (ox: number, oy: number, blades: number, col: () => string, height: number, spread: number) => {
      for (let i = 0; i < blades; i++) {
        const x0 = ox + h / 2 + (rng() - 0.5) * h * 0.3, y0 = oy + h - 1, a = (rng() - 0.5) * spread, l = h * height * (0.5 + rng() * 0.5)
        ctx.strokeStyle = col(); ctx.lineWidth = Math.max(1, h / 60) * (1 + rng())
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + Math.sin(a) * l * 0.5, y0 - l * 0.6, x0 + Math.sin(a) * l, y0 - Math.cos(a) * l); ctx.stroke()
      }
    }
    tuft(0, 0, 70, () => `rgb(${90 + rng() * 40},${110 + rng() * 40},${50 + rng() * 20})`, 0.85, 1.6)
    tuft(h, 0, 30, () => `rgb(${100 + rng() * 40},${110 + rng() * 30},${50 + rng() * 20})`, 0.95, 0.9)
    for (let i = 0; i < 9; i++) { ctx.fillStyle = `rgb(${80 + rng() * 30},${105 + rng() * 30},${46})`; ctx.beginPath(); ctx.ellipse(h + h / 2 + (rng() - 0.5) * h * 0.6, h * 0.3 + rng() * h * 0.5, h * 0.08, h * 0.04, rng() * 3, 0, 7); ctx.fill() }
    tuft(0, h, 80, () => `rgb(${150 + rng() * 40},${135 + rng() * 30},${80 + rng() * 20})`, 0.75, 1.8)
    tuft(h, h, 24, () => `rgb(${70 + rng() * 30},${95 + rng() * 30},${44})`, 0.6, 1.2)
    for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgb(${70 + rng() * 30},${100 + rng() * 30},${40 + rng() * 10})`; ctx.beginPath(); ctx.ellipse(h + h / 2 + (rng() - 0.5) * h * 0.7, h + h * 0.45 + rng() * h * 0.45, h * 0.1, h * 0.05, rng() * 3, 0, 7); ctx.fill() }
    return c
  },
  smoke(n) {
    const [c, ctx] = canvas(n)
    const f = fbm(n, 4, 4, 38)
    const img = ctx.createImageData(n, n), d = img.data
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, r = Math.sqrt(dx * dx + dy * dy)
      const a = Math.max(0, 1 - r) ** 1.4 * (0.45 + f[y * n + x] * 0.9)
      const i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, a * 255)
    }
    ctx.putImageData(img, 0, 0)
    return c
  },
  truss(n) {
    const [c, ctx] = canvas(n)
    ctx.clearRect(0, 0, n, n)
    const t = n * 0.07
    ctx.fillStyle = "rgb(220,220,220)"
    ctx.fillRect(0, 0, n, t); ctx.fillRect(0, n - t, n, t); ctx.fillRect(0, 0, t * 0.8, n); ctx.fillRect(n - t * 0.8, 0, t * 0.8, n)
    ctx.strokeStyle = "rgb(205,205,205)"; ctx.lineWidth = t * 0.6
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(n, n); ctx.moveTo(n, 0); ctx.lineTo(0, n); ctx.stroke()
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, t * 0.7, n, t * 0.3)
    return c
  },
  concertina(n) {
    const [c, ctx] = canvas(n, n / 2)
    ctx.clearRect(0, 0, n, n / 2)
    ctx.strokeStyle = "rgb(190,192,196)"; ctx.lineWidth = Math.max(1, n / 200)
    const loops = 6
    for (let i = -1; i <= loops; i++) {
      const x = (i + 0.5) * n / loops
      ctx.beginPath(); ctx.ellipse(x, n / 4, n / loops * 0.75, n / 4 - 2, 0.25, 0, Math.PI * 2); ctx.stroke()
      for (let b = 0; b < 6; b++) { const a = b / 6 * Math.PI * 2, px = x + Math.cos(a) * n / loops * 0.75, py = n / 4 + Math.sin(a) * (n / 4 - 2); ctx.beginPath(); ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3); ctx.stroke() }
    }
    return c
  },
  padmark(n) {
    const [c, ctx] = canvas(n)
    ctx.clearRect(0, 0, n, n)
    ctx.strokeStyle = "rgba(235,235,225,0.95)"; ctx.lineWidth = n * 0.035
    ctx.beginPath(); ctx.arc(n / 2, n / 2, n * 0.44, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([n * 0.06, n * 0.04]); ctx.lineWidth = n * 0.015; ctx.beginPath(); ctx.arc(n / 2, n / 2, n * 0.37, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = "rgba(235,235,225,0.95)"; const s = n * 0.06
    ctx.fillRect(n * 0.36, n * 0.3, s, n * 0.4); ctx.fillRect(n * 0.64 - s, n * 0.3, s, n * 0.4); ctx.fillRect(n * 0.36, n * 0.47, n * 0.28, s)
    const rng = mulberry(39)
    ctx.globalCompositeOperation = "destination-out"
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${rng() * 0.6})`; ctx.fillRect(rng() * n, rng() * n, n / 80, n / 80) }
    ctx.globalCompositeOperation = "source-over"
    return c
  },
  sandwall(n) {
    const [c, ctx] = canvas(n); const rng = mulberry(42)
    ctx.fillStyle = "rgb(40,34,24)"; ctx.fillRect(0, 0, n, n)
    const rows = 7, rh = n / rows, bw = n / 2
    for (let r = 0; r < rows; r++) for (let k = -1; k < 3; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * rh, t = 140 + rng() * 30
      const g = ctx.createRadialGradient(x + bw / 2, y + rh * 0.4, rh * 0.1, x + bw / 2, y + rh / 2, bw * 0.6)
      g.addColorStop(0, `rgb(${t + 20},${t * 0.9 + 14},${t * 0.66})`); g.addColorStop(1, `rgb(${t * 0.55},${t * 0.48},${t * 0.34})`)
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + bw / 2, y + rh / 2, bw * 0.49, rh * 0.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = "rgba(40,32,20,0.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + bw * 0.1, y + rh * 0.55); ctx.lineTo(x + bw * 0.9, y + rh * 0.55); ctx.stroke()
    }
    const f = fbm(n, 4, 2, 42), g2 = mulberry(420)
    pixels(ctx, n, n, (x, y, cc) => { const v = (f[y * n + x] - 0.5) * 20 + (g2() - 0.5) * 22; cc[0] += v; cc[1] += v; cc[2] += v })
    return c
  },
  rubber(n) {
    const [c, ctx] = canvas(n)
    base(ctx, n, [40, 40, 42], 40, 10, 6, 10, 2)
    ctx.fillStyle = "rgba(0,0,0,0.4)"; for (let i = 0; i < 16; i++) ctx.fillRect(i * n / 16, 0, n / 40, n)
    return c
  },
}

/** Cached seamless texture canvas. */
export function textureCanvas(name: TexName, size: number): HTMLCanvasElement {
  const key = `${name}:${size}`
  let c = canvasCache.get(key)
  if (!c) { c = GEN[name](size); canvasCache.set(key, c) }
  return c
}

// ---------------------------------------------------------------------------------------------------------------
// Window atlas (4 × 2 cells): 0–3 unlit, 4–7 lit. Returns colour and emissive canvases.
// ---------------------------------------------------------------------------------------------------------------
export function windowCanvases(cell: number): { map: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const key = `windows:${cell}`
  const hit = canvasCache.get(key), hitE = canvasCache.get(key + ":e")
  if (hit && hitE) return { map: hit, emissive: hitE }
  const [c, ctx] = canvas(cell * 4, cell * 2), [e, ectx] = canvas(cell * 4, cell * 2)
  const rng = mulberry(41)
  ectx.fillStyle = "#000"; ectx.fillRect(0, 0, cell * 4, cell * 2)
  for (let i = 0; i < 8; i++) {
    const x0 = (i % 4) * cell, y0 = Math.floor(i / 4) * cell, f = cell * 0.08, lit = i >= 4
    const glass = (cx: CanvasRenderingContext2D, emissive: boolean) => {
      const gx = x0 + f, gy = y0 + f, gw = cell - 2 * f, gh = cell - 2 * f
      if (!lit) {
        if (emissive) return
        const g = cx.createLinearGradient(0, gy + gh, 0, gy); g.addColorStop(0, "rgb(20,24,30)"); g.addColorStop(1, i === 2 ? "rgb(60,62,64)" : "rgb(70,84,100)")
        cx.fillStyle = g; cx.fillRect(gx, gy, gw, gh)
        cx.fillStyle = "rgba(255,255,255,0.1)"; cx.beginPath(); cx.moveTo(gx + gw * 0.2, gy); cx.lineTo(gx + gw * 0.45, gy); cx.lineTo(gx + gw * 0.15, gy + gh); cx.lineTo(gx - gw * 0.1, gy + gh); cx.fill()
        if (i === 1) { cx.fillStyle = "rgba(190,186,170,0.85)"; for (let k = 0; k < 7; k++) cx.fillRect(gx, gy + k * gh * 0.07, gw, gh * 0.05) }
        if (i === 3) { cx.strokeStyle = "rgba(220,220,220,0.6)"; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(gx + gw * 0.3, gy + gh * 0.4); cx.lineTo(gx + gw * 0.55, gy + gh * 0.2); cx.lineTo(gx + gw * 0.7, gy + gh * 0.6); cx.lineTo(gx + gw * 0.45, gy + gh * 0.8); cx.stroke() }
        return
      }
      const warm = i === 4 || i === 6
      const top = warm ? [255, 214, 150] : [205, 228, 255], bot = warm ? [200, 120, 60] : [120, 150, 180]
      const scale = emissive ? (i === 7 ? 0.45 : 1) : 0.8
      const g = cx.createLinearGradient(0, gy, 0, gy + gh)
      g.addColorStop(0, `rgb(${top[0] * scale},${top[1] * scale},${top[2] * scale})`); g.addColorStop(1, `rgb(${bot[0] * scale},${bot[1] * scale},${bot[2] * scale})`)
      cx.fillStyle = g; cx.fillRect(gx, gy, gw, gh)
      cx.fillStyle = `rgba(20,16,12,${emissive ? 0.75 : 0.55})`
      for (let k = 0; k < 3; k++) { const w = gw * (0.12 + rng() * 0.25), h = gh * (0.15 + rng() * 0.35); cx.fillRect(gx + rng() * (gw - w), gy + gh - h, w, h) }
      if (i === 6) { cx.fillStyle = `rgba(30,24,18,${emissive ? 0.6 : 0.4})`; for (let k = 0; k < 9; k++) cx.fillRect(gx, gy + k * gh * 0.06, gw, gh * 0.035) }
    }
    glass(ctx, false); glass(ectx, true)
    ctx.fillStyle = "rgb(206,206,200)"
    ctx.fillRect(x0, y0, cell, f); ctx.fillRect(x0, y0 + cell - f, cell, f); ctx.fillRect(x0, y0, f, cell); ctx.fillRect(x0 + cell - f, y0, f, cell)
    ctx.fillRect(x0 + cell / 2 - f / 3, y0, f * 0.66, cell); ctx.fillRect(x0, y0 + cell * 0.38, cell, f * 0.6)
    ectx.fillStyle = "#000"; ectx.fillRect(x0 + cell / 2 - f / 3, y0, f * 0.66, cell); ectx.fillRect(x0, y0 + cell * 0.38, cell, f * 0.6)
  }
  canvasCache.set(key, c); canvasCache.set(key + ":e", e)
  return { map: c, emissive: e }
}

// ---------------------------------------------------------------------------------------------------------------
// Decal atlas: generic decals plus per-map text signs, shelf-packed into one transparent canvas.
// ---------------------------------------------------------------------------------------------------------------
export interface DecalRect { u0: number; v0: number; u1: number; v1: number }
export interface DecalAtlas { canvas: HTMLCanvasElement; rects: Map<string, DecalRect> }

type DecalDraw = (ctx: Ctx, w: number, h: number, rng: Rng) => void
const stencil = (text: string, color: string, font = "bold", scale = 0.62): DecalDraw => (ctx, w, h) => {
  ctx.fillStyle = color; ctx.font = `${font} ${h * scale}px "Arial Narrow", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillText(text, w / 2, h / 2, w * 0.94)
  ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,0.5)"
  for (let i = 0; i < w * h / 90; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  ctx.globalCompositeOperation = "source-over"
}
const plate = (text: string, bg: string, fg: string, border = "rgba(0,0,0,0)"): DecalDraw => (ctx, w, h) => {
  ctx.fillStyle = bg; ctx.fillRect(2, 2, w - 4, h - 4)
  ctx.strokeStyle = border; ctx.lineWidth = h * 0.06; ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16)
  ctx.fillStyle = fg; ctx.font = `bold ${h * 0.5}px "Arial Narrow", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillText(text, w / 2, h / 2 + h * 0.03, w * 0.88)
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,255,255,0.08)"); g.addColorStop(1, "rgba(0,0,0,0.2)"); ctx.fillStyle = g; ctx.fillRect(2, 2, w - 4, h - 4)
}

const GENERIC_DECALS: Record<string, [number, number, DecalDraw]> = {
  oil: [2, 2, (ctx, w, h, rng) => { for (let i = 0; i < 5; i++) { const x = w * (0.3 + rng() * 0.4), y = h * (0.3 + rng() * 0.4), r = w * (0.12 + rng() * 0.2); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(8,8,10,0.55)"); g.addColorStop(1, "rgba(8,8,10,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h) } }],
  crack: [2, 2, (ctx, w, h, rng) => { ctx.strokeStyle = "rgba(15,15,15,0.85)"; ctx.lineCap = "round"; for (let k = 0; k < 3; k++) { let x = w / 2, y = h / 2, a = rng() * 6.3; ctx.lineWidth = 2.2 - k * 0.5; ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i < 12; i++) { a += (rng() - 0.5) * 1.1; x += Math.cos(a) * w * 0.04; y += Math.sin(a) * h * 0.04; ctx.lineTo(x, y) } ctx.stroke() } }],
  manhole: [1, 1, (ctx, w) => { ctx.fillStyle = "rgb(52,50,48)"; ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.46, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(20,20,20,0.9)"; ctx.lineWidth = w * 0.04; ctx.stroke(); ctx.strokeStyle = "rgba(90,88,84,0.9)"; ctx.lineWidth = w * 0.025; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(w * 0.15, w / 2 + i * w * 0.1); ctx.lineTo(w * 0.85, w / 2 + i * w * 0.1); ctx.stroke() } }],
  drain: [1, 1, (ctx, w) => { ctx.fillStyle = "rgb(30,30,30)"; ctx.fillRect(w * 0.2, w * 0.3, w * 0.6, w * 0.4); ctx.fillStyle = "rgb(80,78,74)"; for (let i = 0; i < 7; i++) ctx.fillRect(w * 0.22 + i * w * 0.085, w * 0.3, w * 0.03, w * 0.4) }],
  hazard: [2, 1, (ctx, w, h) => { ctx.fillStyle = "rgb(222,180,40)"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "rgb(24,24,24)"; for (let x = -h; x < w + h; x += h * 0.9) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h * 0.45, h); ctx.lineTo(x + h * 0.45 + h, 0); ctx.lineTo(x + h, 0); ctx.fill() } }],
  arrow: [1, 2, (ctx, w, h) => { ctx.fillStyle = "rgba(230,228,220,0.9)"; ctx.fillRect(w * 0.42, h * 0.35, w * 0.16, h * 0.6); ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.38); ctx.lineTo(w * 0.5, h * 0.05); ctx.lineTo(w * 0.8, h * 0.38); ctx.fill() }],
  code0: [4, 1, stencil("IVLU 284163 2", "rgba(240,240,236,0.92)")],
  code1: [4, 1, stencil("NFRU 550871 4", "rgba(240,240,236,0.92)")],
  code2: [4, 1, stencil("MRDU 731209 0", "rgba(240,240,236,0.92)")],
  code3: [4, 1, stencil("KSLU 118540 7", "rgba(240,240,236,0.92)")],
  logo0: [4, 2, (ctx, w, h) => { ctx.fillStyle = "rgba(240,240,236,0.9)"; ctx.font = `bold ${h * 0.42}px Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("NORDFRACHT", w / 2, h * 0.55, w * 0.9); ctx.fillRect(w * 0.1, h * 0.15, w * 0.8, h * 0.06) }],
  logo1: [4, 2, (ctx, w, h) => { ctx.fillStyle = "rgba(240,240,236,0.9)"; ctx.beginPath(); ctx.arc(w * 0.16, h / 2, h * 0.32, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,0)"; ctx.font = `bold ${h * 0.4}px Arial, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(240,240,236,0.9)"; ctx.fillText("MERIDIAN", w * 0.32, h / 2, w * 0.66) }],
  logo2: [4, 2, (ctx, w, h) => { ctx.fillStyle = "rgba(240,240,236,0.9)"; ctx.font = `italic bold ${h * 0.4}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Kronsee Line", w / 2, h / 2, w * 0.9) }],
  logo3: [4, 2, (ctx, w, h) => { ctx.strokeStyle = "rgba(240,240,236,0.9)"; ctx.lineWidth = h * 0.08; ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.75); ctx.lineTo(w * 0.18, h * 0.25); ctx.lineTo(w * 0.28, h * 0.75); ctx.stroke(); ctx.fillStyle = "rgba(240,240,236,0.9)"; ctx.font = `bold ${h * 0.42}px Arial, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("TRITON", w * 0.34, h / 2, w * 0.6) }],
  cdoor: [2, 2, (ctx, w, h) => { ctx.strokeStyle = "rgba(30,30,30,0.6)"; ctx.lineWidth = w * 0.012; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.strokeStyle = "rgba(200,200,196,0.8)"; ctx.lineWidth = w * 0.02; for (const x of [0.12, 0.38, 0.62, 0.88]) { ctx.beginPath(); ctx.moveTo(w * x, h * 0.02); ctx.lineTo(w * x, h * 0.98); ctx.stroke(); ctx.fillStyle = "rgba(200,200,196,0.8)"; ctx.fillRect(w * x - w * 0.025, h * 0.45, w * 0.05, h * 0.1) } ctx.fillStyle = "rgba(240,240,236,0.85)"; ctx.font = `bold ${h * 0.06}px monospace`; ctx.fillText("MAX GROSS 30480 KG", w * 0.55, h * 0.15) }],
  graffiti0: [3, 1, (ctx, w, h, rng) => { ctx.lineWidth = h * 0.12; ctx.lineCap = "round"; ctx.strokeStyle = "rgba(200,60,70,0.85)"; ctx.beginPath(); ctx.moveTo(w * 0.05, h * 0.7); for (let i = 0; i < 9; i++) ctx.quadraticCurveTo(w * (0.1 + i * 0.1), h * (rng() < 0.5 ? 0.1 : 0.9), w * (0.15 + i * 0.1), h * (0.3 + rng() * 0.4)); ctx.stroke(); ctx.strokeStyle = "rgba(240,240,240,0.7)"; ctx.lineWidth = h * 0.04; ctx.stroke() }],
  graffiti1: [3, 1, (ctx, w, h) => { ctx.fillStyle = "rgba(60,150,200,0.85)"; ctx.font = `bold italic ${h * 0.8}px Impact, Arial Black, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("VEIL?", w / 2, h / 2, w * 0.9); ctx.strokeStyle = "rgba(20,20,20,0.9)"; ctx.lineWidth = h * 0.05; ctx.strokeText("VEIL?", w / 2, h / 2, w * 0.9) }],
  graffiti2: [3, 1, (ctx, w, h) => { ctx.fillStyle = "rgba(230,200,60,0.85)"; ctx.font = `bold ${h * 0.7}px Arial Black, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ZONE 7", w / 2, h / 2, w * 0.9) }],
  noentry: [2, 1, plate("ZUTRITT VERBOTEN", "rgb(236,234,226)", "rgb(190,30,30)", "rgb(190,30,30)")],
  restricted: [3, 1, plate("SPERRGEBIET · SCHUSSWAFFENGEBRAUCH", "rgb(200,40,36)", "rgb(250,248,240)", "rgb(250,248,240)")],
  danger: [1, 1, (ctx, w) => { ctx.fillStyle = "rgb(236,196,40)"; ctx.beginPath(); ctx.moveTo(w / 2, w * 0.08); ctx.lineTo(w * 0.94, w * 0.9); ctx.lineTo(w * 0.06, w * 0.9); ctx.fill(); ctx.strokeStyle = "rgb(20,20,20)"; ctx.lineWidth = w * 0.06; ctx.stroke(); ctx.fillStyle = "rgb(20,20,20)"; ctx.beginPath(); ctx.moveTo(w * 0.54, w * 0.3); ctx.lineTo(w * 0.42, w * 0.6); ctx.lineTo(w * 0.52, w * 0.6); ctx.lineTo(w * 0.46, w * 0.82); ctx.lineTo(w * 0.6, w * 0.52); ctx.lineTo(w * 0.5, w * 0.52); ctx.fill() }],
  numbers: [2, 1, stencil("07", "rgba(30,30,30,0.85)")],
  tyremark: [4, 1, (ctx, w, h) => { ctx.strokeStyle = "rgba(10,10,10,0.35)"; ctx.lineWidth = h * 0.18; for (const y of [0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(0, h * y); ctx.bezierCurveTo(w * 0.3, h * (y - 0.15), w * 0.6, h * (y + 0.15), w, h * y); ctx.stroke() } }],
  paper: [1, 1, (ctx, w, h, rng) => { for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(${200 + rng() * 40},${200 + rng() * 40},${190 + rng() * 40},0.9)`; ctx.save(); ctx.translate(w * (0.2 + rng() * 0.6), h * (0.2 + rng() * 0.6)); ctx.rotate(rng() * 3); ctx.fillRect(-w * 0.12, -h * 0.08, w * 0.24, h * 0.16); ctx.restore() } }],
  vent: [2, 1, (ctx, w, h) => { ctx.fillStyle = "rgb(60,62,64)"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "rgb(20,20,22)"; for (let i = 0; i < 8; i++) ctx.fillRect(w * 0.06, h * (0.1 + i * 0.1), w * 0.88, h * 0.05) }],
  paint: [1, 1, (ctx, w, h, rng) => { ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = "destination-out"; for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(0,0,0,${0.2 + rng() * 0.6})`; ctx.beginPath(); ctx.arc(rng() * w, rng() * h, 1 + rng() * 4, 0, 7); ctx.fill() } ctx.globalCompositeOperation = "source-over" }],
  puddle: [2, 2, (ctx, w, h, rng) => { for (let i = 0; i < 6; i++) { const x = w * (0.3 + rng() * 0.4), y = h * (0.3 + rng() * 0.4), r = w * (0.15 + rng() * 0.2); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(14,16,20,0.75)"); g.addColorStop(0.7, "rgba(14,16,20,0.55)"); g.addColorStop(1, "rgba(14,16,20,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h) } }],
  helipad: [4, 4, (ctx, w) => { ctx.strokeStyle = "rgba(236,232,218,0.9)"; ctx.lineWidth = w * 0.035; ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.44, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(236,232,218,0.9)"; const s = w * 0.07; ctx.fillRect(w * 0.34, w * 0.27, s, w * 0.46); ctx.fillRect(w * 0.66 - s, w * 0.27, s, w * 0.46); ctx.fillRect(w * 0.34, w * 0.465, w * 0.32, s); ctx.globalCompositeOperation = "destination-out"; for (let i = 0; i < 500; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; ctx.fillRect(Math.random() * w, Math.random() * w, 3, 3) } ctx.globalCompositeOperation = "source-over" }],
}

/** Builds the decal atlas for a set of extra text signs ({ key → [cellsW, cellsH, draw] }). */
export function decalAtlas(extra: Map<string, [number, number, DecalDraw]>, cellPx: number): DecalAtlas {
  const items = [...Object.entries(GENERIC_DECALS), ...extra.entries()]
  const size = cellPx * 16
  const [c, ctx] = canvas(size)
  const rects = new Map<string, DecalRect>()
  let cx = 0, cy = 0, rowH = 0
  const rng = mulberry(77)
  for (const [key, [cw, ch, draw]] of items.sort((a, b) => b[1][1] - a[1][1])) {
    if (cx + cw > 16) { cx = 0; cy += rowH; rowH = 0 }
    if (cy + ch > 16) break
    const x = cx * cellPx, y = cy * cellPx, w = cw * cellPx, h = ch * cellPx
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); draw(ctx, w, h, rng); ctx.restore()
    rects.set(key, { u0: (x + 1) / size, v0: 1 - (y + h - 1) / size, u1: (x + w - 1) / size, v1: 1 - (y + 1) / size })
    cx += cw; rowH = Math.max(rowH, ch)
  }
  return { canvas: c, rects }
}

/** Decal generators for map-specific texts (signs, stencils, bay codes). */
export function textDecal(kind: number, text: string): [number, number, DecalDraw] {
  switch (kind) {
    case 1: case 2: return [4, 1, plate(text, "rgb(36,72,128)", "rgb(240,240,236)", "rgb(240,240,236)")]
    case 3: return [4, 1, plate(text, "rgb(226,222,210)", "rgb(40,44,50)")]
    case 4: return [4, 1, plate(text, "rgb(40,70,56)", "rgb(236,234,226)")]
    case 5: return [2, 1, plate(text, "rgb(236,196,40)", "rgb(20,20,20)", "rgb(20,20,20)")]
    case 6: return [4, 1, plate(text, "rgb(30,60,110)", "rgb(240,240,236)")]
    case 7: case 8: return [4, 1, stencil(text, "rgba(232,230,220,0.85)")]
    case 9: return [2, 1, stencil(text, "rgba(230,190,40,0.9)")]
    case 20: return [2, 1, stencil(text, "rgba(226,190,64,0.85)")]
    default: return [2, 1, stencil(text, "rgba(30,30,30,0.85)")]
  }
}
