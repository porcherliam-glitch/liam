// Procedural canvas textures. Everything the game shows is generated here; no files are downloaded.

import * as THREE from "three"
import { Noise2D } from "../core/noise"
import { Rng } from "../core/rng"

const cache = new Map<string, THREE.Texture>()

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d")!
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

function speckle(ctx: CanvasRenderingContext2D, size: number, rng: Rng, count: number, color: () => string, radius: [number, number]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = color()
    const r = rng.range(radius[0], radius[1])
    ctx.beginPath()
    ctx.arc(rng.range(0, size), rng.range(0, size), r, 0, Math.PI * 2)
    ctx.fill()
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
      const c = noiseTexture(11, size, [112, 130, 66], 0.5, 6, 5)
      const ctx = c.getContext("2d")!
      const rng = new Rng(12)
      for (let i = 0; i < 2600; i++) {
        ctx.strokeStyle = hsl(rng.range(70, 100), rng.range(25, 40), rng.range(18, 34), 0.5)
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
      const c = noiseTexture(31, size, [88, 76, 58], 0.5, 4, 5)
      return finish(c, 1)
    }
    case "cobble": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#4a4640"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(41)
      const cell = 32
      for (let gy = 0; gy < size / cell; gy++) {
        for (let gx = 0; gx < size / cell; gx++) {
          const l = rng.range(30, 48)
          ctx.fillStyle = hsl(rng.range(30, 45), rng.range(5, 12), l)
          const inset = 2.5
          roundRect(ctx, gx * cell + inset + rng.range(-1, 1), gy * cell + inset + rng.range(-1, 1), cell - inset * 2, cell - inset * 2, 6)
          ctx.fill()
          ctx.fillStyle = hsl(40, 10, l + 6, 0.5)
          roundRect(ctx, gx * cell + inset + 3, gy * cell + inset + 3, cell - inset * 2 - 10, cell - inset * 2 - 12, 5)
          ctx.fill()
        }
      }
      overlayNoise(ctx, size, 42, 0.25)
      return finish(c, 1)
    }
    case "stone": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#3b3a36"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(51)
      const rowH = 32
      for (let row = 0; row < size / rowH; row++) {
        const offset = row % 2 ? 24 : 0
        let x = -offset
        while (x < size) {
          const w = rng.range(36, 70)
          const l = rng.range(38, 52)
          ctx.fillStyle = hsl(rng.range(30, 50), rng.range(4, 10), l)
          roundRect(ctx, x + 2, row * rowH + 2, w - 4, rowH - 4, 3)
          ctx.fill()
          ctx.fillStyle = hsl(40, 6, l + 5, 0.35)
          roundRect(ctx, x + 4, row * rowH + 4, w - 10, rowH / 2, 3)
          ctx.fill()
          x += w
        }
      }
      overlayNoise(ctx, size, 52, 0.3)
      speckle(ctx, size, new Rng(53), 120, () => hsl(90, 20, 28, 0.35), [1, 4])
      return finish(c, 1)
    }
    case "stone_dark": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#26262a"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(61)
      const rowH = 28
      for (let row = 0; row < size / rowH; row++) {
        const offset = row % 2 ? 20 : 0
        let x = -offset
        while (x < size) {
          const w = rng.range(30, 60)
          const l = rng.range(22, 34)
          ctx.fillStyle = hsl(rng.range(210, 240), rng.range(4, 8), l)
          roundRect(ctx, x + 2, row * rowH + 2, w - 4, rowH - 4, 2)
          ctx.fill()
          x += w
        }
      }
      overlayNoise(ctx, size, 62, 0.3)
      return finish(c, 1)
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
    case "timber": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#3a2a1c"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(81)
      for (let i = 0; i < 140; i++) {
        ctx.strokeStyle = hsl(28, rng.range(25, 40), rng.range(14, 30), 0.7)
        ctx.lineWidth = rng.range(1, 3)
        const y = rng.range(0, size)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(size / 3, y + rng.range(-6, 6), (size * 2) / 3, y + rng.range(-6, 6), size, y + rng.range(-3, 3))
        ctx.stroke()
      }
      overlayNoise(ctx, size, 82, 0.2)
      return finish(c, 1)
    }
    case "planks": {
      const [c, ctx] = canvas(size)
      const rng = new Rng(91)
      const w = 42
      for (let i = 0; i < size / w + 1; i++) {
        const l = rng.range(22, 34)
        ctx.fillStyle = hsl(28, 35, l)
        ctx.fillRect(i * w, 0, w - 3, size)
        for (let k = 0; k < 20; k++) {
          ctx.strokeStyle = hsl(28, 30, l - rng.range(4, 10), 0.6)
          ctx.lineWidth = 1
          const x = i * w + rng.range(2, w - 5)
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x + rng.range(-4, 4), size)
          ctx.stroke()
        }
        ctx.fillStyle = "#1a120c"
        ctx.fillRect(i * w + w - 3, 0, 3, size)
      }
      overlayNoise(ctx, size, 92, 0.2)
      return finish(c, 1)
    }
    case "roof": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#3d2a22"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(101)
      const th = 20
      const tw = 26
      for (let row = 0; row < size / th + 1; row++) {
        const off = row % 2 ? tw / 2 : 0
        for (let col = -1; col < size / tw + 1; col++) {
          const l = rng.range(22, 36)
          ctx.fillStyle = hsl(rng.range(8, 20), rng.range(30, 45), l)
          ctx.beginPath()
          const x = col * tw + off
          const y = row * th
          ctx.moveTo(x, y)
          ctx.lineTo(x + tw - 2, y)
          ctx.lineTo(x + tw - 2, y + th - 4)
          ctx.quadraticCurveTo(x + tw / 2, y + th + 4, x, y + th - 4)
          ctx.closePath()
          ctx.fill()
        }
      }
      overlayNoise(ctx, size, 102, 0.25)
      speckle(ctx, size, new Rng(103), 150, () => hsl(90, 25, 30, 0.4), [1, 4])
      return finish(c, 1)
    }
    case "thatch": {
      const [c, ctx] = canvas(size)
      ctx.fillStyle = "#6b5a30"
      ctx.fillRect(0, 0, size, size)
      const rng = new Rng(111)
      for (let i = 0; i < 2500; i++) {
        ctx.strokeStyle = hsl(rng.range(35, 50), rng.range(30, 50), rng.range(20, 45), 0.6)
        ctx.lineWidth = 1
        const x = rng.range(0, size)
        const y = rng.range(0, size)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + rng.range(-2, 2), y + rng.range(6, 16))
        ctx.stroke()
      }
      return finish(c, 1)
    }
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
    case "leaves": {
      const [c, ctx] = canvas(size)
      ctx.clearRect(0, 0, size, size)
      const rng = new Rng(131)
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = hsl(rng.range(80, 130), rng.range(20, 40), rng.range(14, 30), 0.95)
        ctx.beginPath()
        ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(4, 9), rng.range(2, 5), rng.range(0, Math.PI), 0, Math.PI * 2)
        ctx.fill()
      }
      const t = finish(c, 1)
      return t
    }
    case "leaves_dead": {
      const [c, ctx] = canvas(size)
      ctx.clearRect(0, 0, size, size)
      const rng = new Rng(141)
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = hsl(rng.range(20, 50), rng.range(20, 40), rng.range(12, 28), 0.95)
        ctx.beginPath()
        ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(4, 9), rng.range(2, 5), rng.range(0, Math.PI), 0, Math.PI * 2)
        ctx.fill()
      }
      return finish(c, 1)
    }
    case "cloth": {
      const c = noiseTexture(151, size, [200, 200, 200], 0.18, 8, 3)
      const ctx = c.getContext("2d")!
      ctx.globalAlpha = 0.25
      for (let i = 0; i < size; i += 3) {
        ctx.fillStyle = i % 6 ? "#000" : "#fff"
        ctx.fillRect(0, i, size, 1)
        ctx.fillRect(i, 0, 1, size)
      }
      ctx.globalAlpha = 1
      return finish(c, 1)
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
      const c = noiseTexture(171, size, [210, 170, 140], 0.12, 6, 3)
      return finish(c, 1)
    }
    case "zombie_skin": {
      const c = noiseTexture(181, size, [128, 140, 104], 0.35, 6, 4)
      const ctx = c.getContext("2d")!
      speckle(ctx, size, new Rng(182), 160, () => hsl(0, 50, 22, 0.55), [1, 7])
      speckle(ctx, size, new Rng(183), 90, () => hsl(90, 25, 30, 0.45), [2, 9])
      return finish(c, 1)
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
      const c = noiseTexture(211, size, [84, 108, 56], 0.5, 6, 5)
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
