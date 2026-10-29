/**
 * goreOverlay.ts — blood on the player's screen: one full-screen 2D canvas (pointer-events: none) above the game.
 * CONTRACT (used by raid.ts):
 *  - new ScreenBlood(host): appends the canvas to host (absolute, inset 0; fixed when host is document.body).
 *  - splatter(amount 0..1): wet, dark red splats with meniscus rim, highlight and satellite droplets that slide and drip
 *    down and fade over 3–6 s. The raid wires GoreSystem.onScreenSplatter → splatter.
 *  - hurt(amount 0..1): subtle red edge vignette and a few small droplets at the screen edges when the player is hit.
 *  - update(dt): animates; nothing is drawn while idle and nothing is allocated per frame (splat slots, their sprite
 *    canvases and drips are pooled). dispose(): removes the canvas.
 * The canvas renders at ≤ 900 px height and is scaled by CSS (blood is soft; saves fill rate on 4K screens).
 */

const MAX_SPLATS = 18
const MAX_DRIPS = 4
const SPRITE = 384

interface Drip { x: number; len: number; max: number; speed: number; w: number }
interface Splat {
  active: boolean
  sprite: HTMLCanvasElement | null
  x: number; y: number; size: number
  age: number; life: number
  slideV: number
  drips: Drip[]; nDrips: number
  edge: boolean
}

export class ScreenBlood {
  readonly canvas = document.createElement("canvas")
  private ctx: CanvasRenderingContext2D
  private splats: Splat[] = []
  private w = 0
  private h = 0
  private scale = 1
  private hurtLevel = 0
  private vignette: HTMLCanvasElement | null = null
  private dirty = false
  private rand = Math.random

  constructor(private host: HTMLElement) {
    const fixed = host === document.body
    this.canvas.style.cssText = `position:${fixed ? "fixed" : "absolute"};left:0;top:0;width:100%;height:100%;pointer-events:none;display:block`
    this.canvas.setAttribute("aria-hidden", "true")
    host.appendChild(this.canvas)
    this.ctx = this.canvas.getContext("2d")!
    for (let i = 0; i < MAX_SPLATS; i++) {
      const drips: Drip[] = []
      for (let k = 0; k < MAX_DRIPS; k++) drips.push({ x: 0, len: 0, max: 0, speed: 0, w: 0 })
      this.splats.push({ active: false, sprite: null, x: 0, y: 0, size: 0, age: 0, life: 1, slideV: 0, drips, nDrips: 0, edge: false })
    }
    this.resize()
  }

  /** Blood hitting the screen (0..1: a graze at 3 m … point-blank headshot). */
  splatter(amount: number): void {
    const a = Math.max(0, Math.min(1, amount))
    if (a <= 0.01) return
    this.resize()
    const n = 1 + Math.round(a * 4 + this.rand() * a * 2)
    for (let i = 0; i < n; i++) {
      const big = i === 0
      const size = this.h * (big ? 0.14 + 0.36 * a : 0.05 + 0.16 * a * this.rand())
      // central bias for heavy hits, anywhere for light ones
      const spread = 0.42 - 0.12 * a
      const x = this.w * (0.5 + (this.rand() * 2 - 1) * spread * 1.1), y = this.h * (0.45 + (this.rand() * 2 - 1) * spread)
      this.spawn(x, y, size, 3 + this.rand() * 3 * (0.5 + a), false)
    }
  }

  /** Player got hit: red edge vignette + droplets at the edges. */
  hurt(amount: number): void {
    const a = Math.max(0, Math.min(1, amount))
    if (a <= 0.01) return
    this.resize()
    this.hurtLevel = Math.min(1, this.hurtLevel + a * 0.8)
    const n = 1 + Math.round(a * 3)
    for (let i = 0; i < n; i++) {
      const side = Math.floor(this.rand() * 4), t = this.rand(), m = this.h * (0.02 + this.rand() * 0.05)
      const x = side === 0 ? m : side === 1 ? this.w - m : t * this.w
      const y = side === 2 ? m : side === 3 ? this.h - m : t * this.h
      this.spawn(x, y, this.h * (0.03 + 0.05 * a * this.rand()), 1.4 + this.rand() * 1.2, true)
    }
    this.dirty = true
  }

  update(dt: number): void {
    let any = false
    for (const s of this.splats) {
      if (!s.active) continue
      s.age += dt
      if (s.age >= s.life) { s.active = false; continue }
      any = true
      // the splat slides a little; drips run down, slowing as they thin out
      s.y += s.slideV * dt; s.slideV *= Math.exp(-dt * 1.5)
      for (let k = 0; k < s.nDrips; k++) {
        const d = s.drips[k]
        if (d.len < d.max) { d.len = Math.min(d.max, d.len + d.speed * dt); d.speed *= Math.exp(-dt * 0.45) }
      }
    }
    if (this.hurtLevel > 0) { this.hurtLevel = Math.max(0, this.hurtLevel - dt * 0.9); any = true }
    if (!any && !this.dirty) return
    this.draw()
    this.dirty = any
  }

  /** Wipes every splat and the vignette at once (leaving a raid, respawning). */
  clear(): void {
    for (const s of this.splats) s.active = false
    this.hurtLevel = 0; this.dirty = true
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  dispose(): void {
    this.canvas.remove()
    for (const s of this.splats) { s.active = false; s.sprite = null }
    this.vignette = null
  }

  // ───────────── internals ─────────────

  private resize(): void {
    const cw = Math.max(1, this.host.clientWidth || window.innerWidth), ch = Math.max(1, this.host.clientHeight || window.innerHeight)
    const s = Math.min(1, 900 / ch)
    const w = Math.round(cw * s), h = Math.round(ch * s)
    if (w === this.w && h === this.h) return
    this.w = this.canvas.width = w; this.h = this.canvas.height = h; this.scale = s
    this.vignette = null
    this.dirty = true
  }

  private spawn(x: number, y: number, size: number, life: number, edge: boolean): void {
    let s = this.splats[0]
    for (const c of this.splats) { if (!c.active) { s = c; break } if (c.age / c.life > s.age / s.life) s = c }
    s.active = true; s.x = x; s.y = y; s.size = size; s.age = 0; s.life = life; s.edge = edge
    s.slideV = edge ? size * 0.05 : size * (0.04 + this.rand() * 0.12)
    s.nDrips = edge ? (this.rand() < 0.5 ? 1 : 0) : 1 + Math.floor(this.rand() * (size > this.h * 0.15 ? 4 : 2.5))
    for (let k = 0; k < s.nDrips; k++) {
      const d = s.drips[k]
      d.x = (this.rand() * 2 - 1) * size * 0.25; d.len = 0; d.w = Math.max(1.5, size * (0.012 + this.rand() * 0.022))
      d.max = size * (0.25 + this.rand() * 0.8); d.speed = size * (0.3 + this.rand() * 0.45)
    }
    if (!s.sprite) { s.sprite = document.createElement("canvas"); s.sprite.width = s.sprite.height = SPRITE }
    this.paintSplat(s.sprite, edge)
    this.dirty = true
  }

  /**
   * Procedural blood splat into a pooled sprite canvas (centre = sprite centre, main radius ≈ 0.22 × SPRITE): a few
   * merged irregular lobes of translucent film with a dark meniscus rim, radial spikes, satellite droplets, clots and
   * only a thin rim highlight (blood on a lens is flat, not a glossy ball).
   */
  private paintSplat(c: HTMLCanvasElement, small: boolean): void {
    const g = c.getContext("2d")!, r = this.rand, C = SPRITE / 2
    g.clearRect(0, 0, SPRITE, SPRITE)
    const R = SPRITE * (small ? 0.18 : 0.22), K = 24
    const lobes: { cx: number; cy: number; radii: number[] }[] = []
    const addLobe = (cx: number, cy: number, rad: number) => {
      const radii: number[] = []
      for (let k = 0; k < K; k++) radii.push(rad * (0.7 + r() * 0.55))
      for (let p = 0; p < 2; p++) for (let k = 0; k < K; k++) radii[k] = (radii[(k + K - 1) % K] + 2 * radii[k] + radii[(k + 1) % K]) / 4
      lobes.push({ cx, cy, radii })
    }
    /** Path of all lobes, each scaled about its own centre (the union is filled with the nonzero rule). */
    const outline = (scale: number) => {
      g.beginPath()
      for (const { cx, cy, radii } of lobes) {
        g.moveTo(cx + radii[0] * scale, cy)
        for (let k = 1; k <= K; k++) {
          const a0 = (k - 0.5) / K * Math.PI * 2, a1 = k / K * Math.PI * 2, rm = (radii[k - 1] + radii[k % K]) / 2 * scale, rk = radii[k % K] * scale
          g.quadraticCurveTo(cx + Math.cos(a0) * rm * 1.03, cy + Math.sin(a0) * rm * 1.03, cx + Math.cos(a1) * rk, cy + Math.sin(a1) * rk)
        }
        g.closePath()
      }
    }
    // spikes and satellites (under the body)
    g.fillStyle = "rgba(74,1,1,0.88)"
    const spikes = small ? 3 : 8 + Math.floor(r() * 10)
    for (let i = 0; i < spikes; i++) {
      const a = r() * Math.PI * 2, base = R * 0.7, L = R * (0.25 + r() * r() * 1.3), w = R * (0.04 + r() * 0.07)
      const ca = Math.cos(a), sa = Math.sin(a)
      if (base + L + w * 3 > C - 2) continue
      g.beginPath()
      g.moveTo(C + ca * base - sa * w, C + sa * base + ca * w)
      g.quadraticCurveTo(C + ca * (base + L * 0.6) - sa * w * 0.4, C + sa * (base + L * 0.6) + ca * w * 0.4, C + ca * (base + L), C + sa * (base + L))
      g.quadraticCurveTo(C + ca * (base + L * 0.6) + sa * w * 0.4, C + sa * (base + L * 0.6) - ca * w * 0.4, C + ca * base + sa * w, C + sa * base - ca * w)
      g.fill()
      if (r() < 0.7) { g.beginPath(); g.arc(C + ca * (base + L + w * 1.6), C + sa * (base + L + w * 1.6), w * (0.6 + r() * 0.6), 0, Math.PI * 2); g.fill() }
    }
    const sats = small ? 5 : 16 + Math.floor(r() * 26)
    for (let i = 0; i < sats; i++) {
      const a = r() * Math.PI * 2, d = R * (1.05 + r() * 1.1), rr = R * (0.015 + r() * r() * 0.1)
      if (d + rr > C - 2) continue
      g.fillStyle = r() < 0.5 ? "rgba(66,0,0,0.9)" : "rgba(92,4,3,0.75)"
      g.beginPath(); g.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, rr, 0, Math.PI * 2); g.fill()
    }
    // body: merged lobes — dark meniscus rim (outer union), translucent film inside (inset union)
    addLobe(C, C, R)
    const extra = small ? 1 : 2 + Math.floor(r() * 3)
    for (let i = 0; i < extra; i++) { const a = r() * Math.PI * 2, d = R * (0.45 + r() * 0.3); addLobe(C + Math.cos(a) * d, C + Math.sin(a) * d, R * (0.3 + r() * 0.3)) }
    outline(1); g.fillStyle = "rgba(42,0,0,0.93)"; g.fill("nonzero")
    const body = g.createRadialGradient(C, C, R * 0.1, C, C, R * 1.4)
    body.addColorStop(0, "rgba(108,5,4,0.66)"); body.addColorStop(0.55, "rgba(92,2,2,0.74)"); body.addColorStop(1, "rgba(64,0,0,0.86)")
    outline(0.93)
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; g.fill("nonzero")
    g.globalCompositeOperation = "source-over"; g.fillStyle = body; g.fill("nonzero")
    // clots and thicker streaks inside
    for (let i = 0; i < (small ? 1 : 5); i++) {
      const a = r() * Math.PI * 2, d = R * r() * 0.6, rr = R * (0.1 + r() * 0.22), x = C + Math.cos(a) * d, y = C + Math.sin(a) * d
      const cg = g.createRadialGradient(x, y, 0, x, y, rr)
      cg.addColorStop(0, "rgba(40,0,0,0.5)"); cg.addColorStop(1, "rgba(40,0,0,0)")
      g.fillStyle = cg; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill()
    }
    // thin wet rim highlight on the upper left and one small glint
    g.lineWidth = Math.max(1, R * 0.03); g.strokeStyle = "rgba(255,190,180,0.16)"
    g.beginPath(); g.arc(C, C, R * 0.78, Math.PI * 1.05, Math.PI * 1.4); g.stroke()
    g.fillStyle = "rgba(255,225,215,0.28)"; g.beginPath(); g.ellipse(C - R * 0.42, C - R * 0.46, R * 0.06, R * 0.028, -0.7, 0, Math.PI * 2); g.fill()
  }

  private draw(): void {
    const g = this.ctx
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalAlpha = 1
    g.clearRect(0, 0, this.w, this.h)
    g.lineCap = "round"; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"
    for (const s of this.splats) {
      if (!s.active || !s.sprite) continue
      const t = s.age / s.life
      const alpha = (t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45) * Math.min(1, s.age * 30)
      g.globalAlpha = alpha
      // drips under the sprite: tapered runs (wide where they leave the splat, thin neck, heavy bead at the end)
      for (let k = 0; k < s.nDrips; k++) {
        const d = s.drips[k]
        if (d.len <= 1) continue
        const x = s.x + d.x, y0 = s.y + s.size * 0.1, y1 = y0 + d.len, w = d.w, wob = d.x > 0 ? w * 0.6 : -w * 0.6
        g.fillStyle = "rgba(66,0,0,0.88)"
        g.beginPath()
        g.moveTo(x - w, y0)
        g.quadraticCurveTo(x - w * 0.35 + wob, (y0 + y1) / 2, x - w * 0.55, y1)
        g.arc(x, y1, w * 0.62, Math.PI, 0, true)
        g.quadraticCurveTo(x + w * 0.35 + wob, (y0 + y1) / 2, x + w, y0)
        g.closePath(); g.fill()
        g.strokeStyle = "rgba(255,200,190,0.16)"; g.lineWidth = Math.max(1, w * 0.18)
        g.beginPath(); g.moveTo(x - w * 0.45, y0 + w); g.quadraticCurveTo(x - w * 0.3 + wob, (y0 + y1) / 2, x - w * 0.3, y1 - w * 0.4); g.stroke()
      }
      const sz = s.size / 0.5
      g.drawImage(s.sprite, s.x - sz / 2, s.y - sz / 2, sz, sz)
    }
    if (this.hurtLevel > 0) {
      if (!this.vignette) this.vignette = this.makeVignette()
      g.globalAlpha = Math.min(1, this.hurtLevel)
      g.drawImage(this.vignette, 0, 0, this.w, this.h)
    }
    g.globalAlpha = 1
  }

  private makeVignette(): HTMLCanvasElement {
    const c = document.createElement("canvas"), w = 256, h = Math.max(64, Math.round(256 * this.h / Math.max(1, this.w)))
    c.width = w; c.height = h
    const g = c.getContext("2d")!
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.55)
    grad.addColorStop(0, "rgba(120,0,0,0)"); grad.addColorStop(0.6, "rgba(110,0,0,0.22)"); grad.addColorStop(1, "rgba(70,0,0,0.6)")
    g.fillStyle = grad; g.fillRect(0, 0, w, h)
    return c
  }
}
