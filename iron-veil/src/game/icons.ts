/**
 * icons.ts — item icons as cached PNG data URLs (transparent background; the UI adds the rarity frame).
 * Weapons and usable supplies are rendered from their real 3D models with one small offscreen WebGL renderer
 * (weapons from the side, supplies at three-quarter view). Ammunition, attachments, gear, materials, valuables and keys
 * are painted with canvas 2D in the same soft-shaded style. Nothing is created before the first request, so the module
 * is safe to import in Node tests; warmIcons() renders everything in idle time so menus open without a hitch.
 */
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { weaponOfItem, type ItemId } from "./items"
import { buildHandItem, weaponWorldModel } from "./weaponModels"

const cache = new Map<string, string>()
const HAND_ITEMS = new Set<string>(["bandage", "medkit", "painkiller", "antiviral", "stim", "canned", "mre", "water", "soda", "grenade", "molotov"])

/** True when the item has a real icon (model render or painting). */
export function hasIcon(id: ItemId): boolean { return !!weaponOfItem(id) || HAND_ITEMS.has(id) || id in PAINTERS }

/** Icon of an item as a PNG data URL, "" if it cannot be drawn (no DOM). */
export function itemIcon(id: ItemId, size = 64): string {
  const key = `${id}@${size}`
  const hit = cache.get(key); if (hit !== undefined) return hit
  if (typeof document === "undefined") return ""
  let url = ""
  try {
    const w = weaponOfItem(id)
    if (w) url = render3d(() => weaponWorldModel(w), "side", size)
    else if (HAND_ITEMS.has(id)) url = render3d(() => buildHandItem(id).group, "quarter", size)
    else if (id in PAINTERS) url = paint(PAINTERS[id], size)
  } catch { url = "" }
  cache.set(key, url)
  return url
}

/** Renders the given icons a few at a time while the browser is idle. */
export function warmIcons(ids: readonly ItemId[], size = 64): void {
  const queue = ids.filter(id => !cache.has(`${id}@${size}`))
  const idle = (fn: () => void) => { const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback; if (ric) ric(fn); else window.setTimeout(fn, 30) }
  const next = () => { const t0 = performance.now(); while (queue.length && performance.now() - t0 < 12) itemIcon(queue.shift()!, size); if (queue.length) idle(next) }
  if (queue.length) idle(next)
}

// ───────────────────────────── 3D renders ─────────────────────────────

let r3: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; holder: THREE.Group; out: HTMLCanvasElement } | null = null

function ctx3d() {
  if (r3) return r3
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xe4ecf2, 0x2c2a26, 1.3))
  const key = new THREE.DirectionalLight(0xfff6ea, 2.4); key.position.set(3, 5, 2); scene.add(key)
  const rim = new THREE.DirectionalLight(0xa8c8ff, 1.4); rim.position.set(-4, 2, -3); scene.add(rim)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50)
  const holder = new THREE.Group(); scene.add(holder)
  r3 = { renderer, scene, camera, holder, out: document.createElement("canvas") }
  return r3
}

const _box = new THREE.Box3(), _c = new THREE.Vector3(), _p = new THREE.Vector3()

function render3d(make: () => THREE.Object3D, view: "side" | "quarter", size: number): string {
  const { renderer, scene, camera, holder, out } = ctx3d()
  const px = size * 2
  renderer.setSize(px, px, false)
  const obj = make(); holder.add(obj)
  holder.updateMatrixWorld(true)
  _box.setFromObject(obj); _box.getCenter(_c)
  const d = 10
  // weapons: right side, barrel pointing right, a little from above; supplies: three-quarter view
  if (view === "side") camera.position.set(_c.x + d, _c.y + d * 0.16, _c.z - d * 0.06)
  else camera.position.set(_c.x + d * 0.62, _c.y + d * 0.55, _c.z + d * 0.75)
  camera.lookAt(_c); camera.updateMatrixWorld(true)
  // fit the orthographic frustum to the projected bounding box (square, 9 % margin)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).applyMatrix4(camera.matrixWorldInverse)
    minX = Math.min(minX, _p.x); maxX = Math.max(maxX, _p.x); minY = Math.min(minY, _p.y); maxY = Math.max(maxY, _p.y)
  }
  const half = Math.max(maxX - minX, maxY - minY) / 2 * 1.09, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  camera.left = cx - half; camera.right = cx + half; camera.top = cy + half; camera.bottom = cy - half
  camera.near = 0.01; camera.far = d * 4; camera.updateProjectionMatrix()
  renderer.clear(); renderer.render(scene, camera)
  holder.remove(obj)
  obj.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
  // downsample for smoother edges
  out.width = out.height = size
  const g = out.getContext("2d")!; g.clearRect(0, 0, size, size); g.imageSmoothingQuality = "high"
  g.drawImage(renderer.domElement, 0, 0, px, px, 0, 0, size, size)
  return out.toDataURL("image/png")
}

// ───────────────────────────── 2D paintings ─────────────────────────────

type G = CanvasRenderingContext2D
type Painter = (g: G) => void

function paint(fn: Painter, size: number): string {
  const c = document.createElement("canvas"); c.width = c.height = size
  const g = c.getContext("2d")!
  g.scale(size / 100, size / 100); g.lineJoin = "round"; g.lineCap = "round"
  fn(g)
  return c.toDataURL("image/png")
}

const lin = (g: G, x0: number, y0: number, x1: number, y1: number, ...stops: string[]) => { const l = g.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => l.addColorStop(i / Math.max(1, stops.length - 1), s)); return l }
const rad = (g: G, x: number, y: number, r: number, c0: string, c1: string) => { const l = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); l.addColorStop(0, c0); l.addColorStop(1, c1); return l }
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
/** Fills (with a soft drop shadow) and outlines the path drawn by `path`. */
function shape(g: G, path: () => void, fill: string | CanvasGradient, stroke = "rgba(10,12,14,.75)", lw = 1.6, shadow = true): void {
  g.save(); g.beginPath(); path()
  if (shadow) { g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 4; g.shadowOffsetY = 2 }
  g.fillStyle = fill; g.fill(); g.restore()
  g.beginPath(); path(); g.lineWidth = lw; g.strokeStyle = stroke; g.stroke()
}
function line(g: G, pts: number[], color: string, w: number): void { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.strokeStyle = color; g.lineWidth = w; g.stroke() }
function text(g: G, s: string, x: number, y: number, size: number, color: string, weight = "800"): void { g.font = `${weight} ${size}px system-ui, "Segoe UI", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = color; g.fillText(s, x, y) }
const BRASS = (g: G, x: number, w: number) => lin(g, x, 0, x + w, 0, "#7a5a1c", "#f2d27a", "#c89a3a", "#6e5018")
const STEEL = (g: G, y0: number, y1: number) => lin(g, 0, y0, 0, y1, "#9aa3aa", "#565e64", "#2e3438")

// ── ammunition: a box with the calibre on its label and a few rounds in front ──
type Round = "pistol" | "magnum" | "rifle" | "long" | "lapua" | "shell" | "slug"
function ammo(box: [string, string], label: string, round: Round, tip: string, band?: string): Painter {
  return g => {
    shape(g, () => rr(g, 8, 26, 58, 54, 4), lin(g, 8, 26, 66, 80, box[0], box[1]))
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(10, 28, 54, 6)
    shape(g, () => rr(g, 13, 42, 48, 20, 2), "#e9e4d6", "rgba(0,0,0,.4)", 1, false)
    text(g, label, 37, 52.5, label.length > 5 ? 9 : 11, "#1c1f22")
    if (band) { g.fillStyle = band; g.fillRect(13, 64, 48, 5) }
    const n = round === "shell" || round === "slug" ? 2 : 3
    for (let i = 0; i < n; i++) {
      const x = 58 + i * (round === "shell" || round === "slug" ? 15 : 11), base = 90
      if (round === "shell" || round === "slug") {
        shape(g, () => rr(g, x, base - 44, 13, 36, 2), lin(g, x, 0, x + 13, 0, "#6e1410", "#d6342a", "#8a1a14"))
        shape(g, () => rr(g, x - 0.5, base - 10, 14, 10, 1.5), BRASS(g, x, 14))
        if (round === "slug") shape(g, () => { g.arc(x + 6.5, base - 44, 5, Math.PI, 0); g.closePath() }, "#9ea4a8")
        else for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x + 2, base - 40 + k * 9, 9, 1.5) }
        continue
      }
      const caseH = round === "pistol" ? 17 : round === "magnum" ? 24 : round === "rifle" ? 30 : round === "long" ? 36 : 42
      const w = round === "pistol" || round === "magnum" ? 10 : round === "lapua" ? 10 : 8.5
      const tipH = round === "pistol" ? 8 : round === "magnum" ? 9 : 15
      const top = base - caseH
      shape(g, () => rr(g, x, top, w, caseH, 1.5), BRASS(g, x, w))
      if (round !== "pistol" && round !== "magnum") { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x, top + 2, w, 1.2) }
      shape(g, () => { const nx = round === "pistol" || round === "magnum" ? 0.5 : 1.5; g.moveTo(x + nx, top); g.quadraticCurveTo(x + w / 2, top - tipH * 1.25, x + w - nx, top); g.closePath() }, lin(g, x, 0, x + w, 0, "#6b3a1e", tip, "#5a2e16"))
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x + 0.5, base - 3, w - 1, 1.2)
    }
  }
}

// ── attachments ──
const ATT: Record<string, Painter> = {
  att_reddot: g => {
    shape(g, () => rr(g, 22, 64, 56, 10, 2), STEEL(g, 64, 74))
    shape(g, () => rr(g, 28, 34, 44, 32, 9), lin(g, 0, 34, 0, 66, "#4a5157", "#1e2326"))
    shape(g, () => { g.ellipse(50, 50, 11, 11, 0, 0, Math.PI * 2) }, rad(g, 50, 50, 11, "#5a7ab8", "#121a2c"), "rgba(0,0,0,.8)", 1.4, false)
    g.save(); g.shadowColor = "#ff2a1a"; g.shadowBlur = 8; g.fillStyle = "#ff3b2a"; g.beginPath(); g.arc(50, 50, 2.6, 0, Math.PI * 2); g.fill(); g.restore()
    shape(g, () => rr(g, 66, 40, 8, 8, 2), "#2a2f33", undefined, 1.2, false)
  },
  att_holo: g => {
    shape(g, () => rr(g, 18, 66, 64, 9, 2), STEEL(g, 66, 75))
    shape(g, () => { g.moveTo(20, 66); g.lineTo(24, 30); g.lineTo(80, 30); g.lineTo(82, 66); g.lineTo(72, 66); g.lineTo(70, 40); g.lineTo(32, 40); g.lineTo(30, 66); g.closePath() }, lin(g, 0, 30, 0, 66, "#4b5258", "#22272a"))
    shape(g, () => rr(g, 32, 40, 38, 24, 2), "rgba(120,170,220,.35)", "rgba(0,0,0,.6)", 1, false)
    g.strokeStyle = "#ff4030"; g.lineWidth = 1.6; g.beginPath(); g.arc(51, 52, 8, 0, Math.PI * 2); g.stroke()
    g.fillStyle = "#ff4030"; g.beginPath(); g.arc(51, 52, 1.6, 0, Math.PI * 2); g.fill()
  },
  att_scope4x: g => {
    shape(g, () => { g.moveTo(6, 40); g.lineTo(22, 44); g.lineTo(76, 44); g.lineTo(94, 38); g.lineTo(94, 64); g.lineTo(76, 58); g.lineTo(22, 58); g.lineTo(6, 62); g.closePath() }, lin(g, 0, 38, 0, 64, "#5c646a", "#2a3034", "#16191b"))
    shape(g, () => rr(g, 42, 30, 12, 14, 2), STEEL(g, 30, 44)); shape(g, () => rr(g, 44, 58, 9, 8, 2), STEEL(g, 58, 66))
    shape(g, () => rr(g, 26, 62, 10, 12, 1), "#2a2f33"); shape(g, () => rr(g, 62, 62, 10, 12, 1), "#2a2f33")
    g.fillStyle = "rgba(120,160,255,.55)"; g.fillRect(91, 41, 3, 20)
    g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(24, 46, 50, 2.5)
  },
  att_suppressor: g => {
    shape(g, () => rr(g, 10, 38, 80, 24, 6), lin(g, 0, 38, 0, 62, "#5e666c", "#2c3236", "#181b1d"))
    for (let x = 24; x < 82; x += 8) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x, 39, 2, 22) }
    shape(g, () => rr(g, 6, 42, 8, 16, 2), STEEL(g, 42, 58))
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(12, 41, 76, 3)
  },
  att_comp: g => {
    shape(g, () => rr(g, 22, 36, 56, 28, 4), lin(g, 0, 36, 0, 64, "#6a7277", "#2f3539", "#1a1d1f"))
    for (const x of [38, 50, 62]) shape(g, () => rr(g, x, 39, 6, 9, 1.5), "#0e1012", "rgba(0,0,0,.6)", 1, false)
    shape(g, () => rr(g, 16, 42, 8, 16, 2), STEEL(g, 42, 58))
    g.fillStyle = "#0b0c0d"; g.beginPath(); g.ellipse(78, 50, 2.5, 7, 0, 0, Math.PI * 2); g.fill()
  },
  att_vgrip: g => {
    shape(g, () => rr(g, 20, 18, 60, 12, 2), STEEL(g, 18, 30))
    shape(g, () => { g.moveTo(38, 28); g.lineTo(62, 28); g.lineTo(60, 84); g.quadraticCurveTo(50, 90, 40, 84); g.closePath() }, lin(g, 38, 0, 62, 0, "#2a2f33", "#4f575d", "#1c2023"))
    for (let y = 40; y < 82; y += 7) { g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(40, y, 20, 2) }
  },
  att_agrip: g => {
    shape(g, () => rr(g, 14, 30, 72, 12, 2), STEEL(g, 30, 42))
    shape(g, () => { g.moveTo(26, 40); g.lineTo(76, 40); g.lineTo(64, 66); g.quadraticCurveTo(60, 72, 52, 70); g.lineTo(30, 52); g.closePath() }, lin(g, 26, 40, 70, 70, "#4c545a", "#20252a"))
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(30, 43, 40, 2)
  },
  att_extmag: g => {
    shape(g, () => { g.moveTo(34, 10); g.lineTo(58, 10); g.lineTo(60, 30); g.quadraticCurveTo(66, 66, 80, 90); g.lineTo(56, 94); g.quadraticCurveTo(42, 66, 36, 30); g.closePath() }, lin(g, 34, 0, 80, 0, "#3a4045", "#5b6369", "#22272a"))
    for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(40 + k * 2.5, 34 + k * 9, 18, 1.5) }
    shape(g, () => rr(g, 36, 4, 20, 8, 2), BRASS(g, 36, 20), "rgba(0,0,0,.6)", 1, false)
  },
  att_laser: g => {
    line(g, [72, 50, 99, 50], "rgba(255,40,30,.9)", 2)
    shape(g, () => rr(g, 18, 34, 56, 32, 5), lin(g, 0, 34, 0, 66, "#4e565c", "#1f2427"))
    shape(g, () => { g.arc(66, 50, 7, 0, Math.PI * 2) }, rad(g, 66, 50, 7, "#ff7a6a", "#5a0e08"), "rgba(0,0,0,.8)", 1.2, false)
    shape(g, () => { g.arc(32, 50, 9, 0, Math.PI * 2) }, rad(g, 32, 50, 9, "#fff8d8", "#6a6a50"), "rgba(0,0,0,.8)", 1.2, false)
    shape(g, () => rr(g, 44, 62, 10, 8, 1), "#22272a", undefined, 1, false)
  },
}

// ── gear ──
const GEAR: Record<string, Painter> = {
  armor: g => {
    shape(g, () => { g.moveTo(28, 14); g.lineTo(40, 14); g.quadraticCurveTo(50, 26, 60, 14); g.lineTo(72, 14); g.lineTo(80, 30); g.lineTo(78, 86); g.lineTo(22, 86); g.lineTo(20, 30); g.closePath() }, lin(g, 20, 14, 80, 86, "#6d7650", "#47502f"))
    for (const [x, y] of [[26, 54], [43, 54], [60, 54]]) { shape(g, () => rr(g, x, y, 15, 20, 2), lin(g, 0, y, 0, y + 20, "#5c6542", "#3f4628"), "rgba(0,0,0,.6)", 1.2, false); g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x + 2, y + 4, 11, 2) }
    line(g, [20, 44, 80, 44], "rgba(0,0,0,.3)", 2)
  },
  plate: g => {
    shape(g, () => { g.moveTo(24, 12); g.lineTo(38, 12); g.quadraticCurveTo(50, 24, 62, 12); g.lineTo(76, 12); g.lineTo(82, 28); g.lineTo(80, 88); g.lineTo(20, 88); g.lineTo(18, 28); g.closePath() }, lin(g, 18, 12, 82, 88, "#c0a978", "#7e6a44"))
    shape(g, () => rr(g, 28, 26, 44, 34, 6), lin(g, 0, 26, 0, 60, "#d2bc8a", "#9a8456"), "rgba(0,0,0,.5)", 1.2, false)
    for (const x of [22, 41, 60]) shape(g, () => rr(g, x, 64, 18, 20, 2), lin(g, 0, 64, 0, 84, "#a8925f", "#6e5c38"), "rgba(0,0,0,.6)", 1.1, false)
    g.fillStyle = "rgba(0,0,0,.35)"; for (let y = 30; y < 58; y += 6) g.fillRect(30, y, 40, 1.2)
  },
  helmet: g => {
    shape(g, () => { g.moveTo(14, 66); g.quadraticCurveTo(14, 18, 50, 18); g.quadraticCurveTo(86, 18, 86, 66); g.lineTo(78, 72); g.lineTo(22, 72); g.closePath() }, rad(g, 50, 44, 46, "#7d8660", "#3c4228"))
    shape(g, () => rr(g, 10, 64, 80, 9, 4), lin(g, 0, 64, 0, 73, "#4c5434", "#2c3120"), "rgba(0,0,0,.7)", 1.2, false)
    shape(g, () => rr(g, 40, 26, 20, 12, 2), "#2a2f33", undefined, 1.2, false)
    line(g, [20, 50, 80, 50], "rgba(0,0,0,.25)", 3)
  },
  pack_small: g => backpack(g, 22, 18, 56, 70, "#55603e", "#353c26"),
  pack_large: g => { backpack(g, 16, 12, 68, 80, "#4b5a6a", "#2a3440"); shape(g, () => rr(g, 18, 6, 64, 12, 6), lin(g, 0, 6, 0, 18, "#7a6a4a", "#4c4130"), "rgba(0,0,0,.6)", 1.2) },
}
function backpack(g: G, x: number, y: number, w: number, h: number, c0: string, c1: string): void {
  shape(g, () => rr(g, x, y, w, h, 12), lin(g, x, y, x + w, y + h, c0, c1))
  shape(g, () => rr(g, x + w * 0.16, y + h * 0.5, w * 0.68, h * 0.4, 6), lin(g, 0, y + h * 0.5, 0, y + h * 0.9, c0, c1), "rgba(0,0,0,.6)", 1.2, false)
  shape(g, () => rr(g, x + w * 0.1, y + h * 0.08, w * 0.8, h * 0.3, 8), lin(g, 0, y, 0, y + h * 0.4, c0, c1), "rgba(0,0,0,.6)", 1.2, false)
  for (const fx of [0.32, 0.68]) shape(g, () => rr(g, x + w * fx - 2, y + h * 0.2, 4, h * 0.28, 1), "#1d2016", undefined, 1, false)
  g.fillStyle = "#c9c2a8"; g.fillRect(x + w * 0.3, y + h * 0.66, w * 0.4, 2)
}

// ── materials ──
const MAT: Record<string, Painter> = {
  scrap: g => {
    shape(g, () => { g.moveTo(12, 70); g.lineTo(40, 52); g.lineTo(58, 60); g.lineTo(46, 80); g.closePath() }, lin(g, 12, 50, 58, 80, "#8c6a4a", "#4c3624"))
    shape(g, () => { g.moveTo(40, 30); g.lineTo(80, 22); g.lineTo(88, 40); g.lineTo(52, 50); g.closePath() }, lin(g, 40, 22, 88, 50, "#9aa2a8", "#4c5257"))
    shape(g, () => rr(g, 56, 56, 32, 10, 2), lin(g, 0, 56, 0, 66, "#7d6f62", "#3e3630"))
    g.fillStyle = "#3a2a1c"; for (const [x, y] of [[30, 66], [62, 34], [70, 60]]) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill() }
  },
  wood: g => { for (let i = 0; i < 3; i++) { const y = 30 + i * 16; shape(g, () => rr(g, 10 + i * 3, y, 80 - i * 6, 13, 2), lin(g, 0, y, 0, y + 13, "#d8a868", "#94683a")); line(g, [16 + i * 3, y + 5, 80 - i * 3, y + 4], "rgba(90,50,20,.35)", 1); g.fillStyle = "#6a4a2a"; g.beginPath(); g.arc(22 + i * 3, y + 6.5, 1.4, 0, Math.PI * 2); g.arc(78 - i * 3, y + 6.5, 1.4, 0, Math.PI * 2); g.fill() } },
  cloth: g => { const c = [["#c8bfa8", "#8a826c"], ["#5a6a82", "#34404f"], ["#8a4a3a", "#5a2e24"]]; for (let i = 0; i < 3; i++) { const y = 62 - i * 16; shape(g, () => rr(g, 14 + i * 4, y, 72 - i * 8, 16, 5), lin(g, 0, y, 0, y + 16, c[i][0], c[i][1])); line(g, [22 + i * 4, y + 8, 78 - i * 4, y + 8], "rgba(0,0,0,.18)", 1) } },
  chem: g => {
    shape(g, () => { g.moveTo(30, 26); g.lineTo(70, 26); g.lineTo(74, 86); g.lineTo(26, 86); g.closePath() }, lin(g, 26, 0, 74, 0, "#d9d2b4", "#f4efd8", "#a39c80"))
    shape(g, () => rr(g, 40, 14, 20, 14, 3), lin(g, 0, 14, 0, 28, "#3a8a3a", "#1e4e1e"))
    shape(g, () => { g.moveTo(50, 46); g.lineTo(64, 70); g.lineTo(36, 70); g.closePath() }, "#f2c21a", "rgba(0,0,0,.7)", 1.2, false)
    text(g, "!", 50, 62, 14, "#111")
  },
  parts: g => {
    g.save(); g.translate(42, 50)
    shape(g, () => { for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 22 : 28; const ax = Math.cos(a - 0.1) * r, ay = Math.sin(a - 0.1) * r, bx = Math.cos(a + 0.1) * r, by = Math.sin(a + 0.1) * r; if (i === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay); g.lineTo(bx, by) } g.closePath() }, rad(g, 0, 0, 28, "#b8c0c6", "#4a5156"))
    shape(g, () => g.arc(0, 0, 9, 0, Math.PI * 2), "#1c2023", undefined, 1.2, false); g.restore()
    shape(g, () => { g.moveTo(66, 30); g.lineTo(84, 30); g.lineTo(84, 38); g.lineTo(78, 38); g.lineTo(78, 82); g.lineTo(72, 82); g.lineTo(72, 38); g.lineTo(66, 38); g.closePath() }, lin(g, 66, 0, 84, 0, "#9aa2a8", "#555c61"))
    for (let y = 44; y < 80; y += 5) line(g, [72, y, 78, y + 2], "rgba(0,0,0,.4)", 1)
  },
  electronics: g => {
    shape(g, () => rr(g, 12, 22, 76, 56, 4), lin(g, 0, 22, 0, 78, "#1f6a3a", "#0e3a1e"))
    g.strokeStyle = "#d8b450"; g.lineWidth = 1.4
    for (const [x0, y0, x1, y1] of [[18, 32, 46, 32], [46, 32, 46, 48], [18, 70, 60, 70], [60, 70, 60, 54], [74, 30, 74, 64]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke() }
    shape(g, () => rr(g, 44, 36, 26, 22, 2), lin(g, 0, 36, 0, 58, "#2a2e31", "#111315"), "rgba(0,0,0,.8)", 1, false)
    for (let i = 0; i < 5; i++) { g.fillStyle = "#c8ccd0"; g.fillRect(46 + i * 5, 33, 2, 3); g.fillRect(46 + i * 5, 58, 2, 3) }
    for (const [x, y, c] of [[24, 46, "#c83a2a"], [30, 46, "#e8c23a"], [80, 72, "#3a7ad8"]] as const) { g.fillStyle = c; g.fillRect(x, y, 4, 7) }
  },
  fuel: g => {
    shape(g, () => { g.moveTo(22, 30); g.lineTo(54, 16); g.lineTo(80, 16); g.lineTo(80, 88); g.lineTo(22, 88); g.closePath() }, lin(g, 22, 16, 80, 88, "#d23a2a", "#7e1a12"))
    shape(g, () => rr(g, 30, 22, 18, 6, 2), "#2a2a2a", undefined, 1, false)
    shape(g, () => rr(g, 58, 8, 14, 10, 2), lin(g, 0, 8, 0, 18, "#c0c4c8", "#60666a"))
    line(g, [30, 40, 72, 84], "rgba(0,0,0,.25)", 3); line(g, [72, 40, 30, 84], "rgba(0,0,0,.25)", 3)
  },
  tools: g => {
    shape(g, () => { g.moveTo(16, 82); g.lineTo(58, 40); g.arc(66, 32, 12, Math.PI * 0.75, Math.PI * 2.25, true); g.lineTo(64, 46); g.lineTo(22, 88); g.closePath() }, lin(g, 16, 30, 78, 88, "#c0c8ce", "#5a6166"))
    shape(g, () => { g.moveTo(28, 18); g.lineTo(36, 14); g.lineTo(72, 72); g.lineTo(66, 76); g.closePath() }, lin(g, 28, 14, 72, 76, "#9aa2a8", "#4a5054"))
    shape(g, () => { g.moveTo(64, 70); g.lineTo(76, 64); g.lineTo(90, 88); g.lineTo(78, 94); g.closePath() }, lin(g, 64, 64, 90, 94, "#e0b020", "#8a6a10"))
  },
}

// ── valuables & keys ──
const VAL: Record<string, Painter> = {
  intel: g => {
    shape(g, () => rr(g, 16, 22, 68, 56, 4), lin(g, 0, 22, 0, 78, "#2c3238", "#121518"))
    shape(g, () => rr(g, 22, 30, 40, 40, 2), lin(g, 22, 30, 62, 70, "#3a4a5a", "#1a222a"), "rgba(0,0,0,.7)", 1, false)
    g.fillStyle = "#4ae0a0"; g.beginPath(); g.arc(74, 34, 3, 0, Math.PI * 2); g.fill()
    shape(g, () => rr(g, 66, 50, 12, 20, 2), "#c8a440", undefined, 1, false)
    text(g, "DATA", 42, 50, 10, "#9ad8ff")
  },
  medical: g => {
    shape(g, () => rr(g, 14, 28, 72, 54, 6), lin(g, 0, 28, 0, 82, "#f0f0ea", "#b8b8b0"))
    shape(g, () => rr(g, 40, 18, 20, 12, 3), "#8a8a84", undefined, 1.2, false)
    g.fillStyle = "#d2302a"; g.fillRect(44, 40, 12, 32); g.fillRect(34, 50, 32, 12)
  },
  relic: g => {
    g.save(); g.shadowColor = "#5ad8ff"; g.shadowBlur = 16
    shape(g, () => { g.moveTo(50, 10); g.lineTo(76, 34); g.lineTo(68, 80); g.lineTo(32, 80); g.lineTo(24, 34); g.closePath() }, lin(g, 24, 10, 76, 80, "#bdf4ff", "#2a8ab8", "#0a2a4a"), "rgba(0,30,60,.8)", 1.6, false)
    g.restore()
    line(g, [50, 10, 50, 80], "rgba(255,255,255,.35)", 1.2); line(g, [24, 34, 76, 34], "rgba(255,255,255,.25)", 1.2)
    shape(g, () => rr(g, 30, 80, 40, 10, 2), STEEL(g, 80, 90))
  },
  gold: g => {
    g.strokeStyle = "rgba(0,0,0,.6)"
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * 0.15 + i / 17 * Math.PI * 1.1, x = 50 + Math.cos(a) * 30, y = 40 + Math.sin(a) * 30
      g.save(); g.translate(x, y); g.rotate(a + (i % 2 ? Math.PI / 2 : 0))
      g.beginPath(); g.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); g.fillStyle = lin(g, -5, -3, 5, 3, "#fff2a0", "#d4a020", "#8a5a08"); g.fill(); g.lineWidth = 1; g.stroke(); g.restore()
    }
    shape(g, () => { g.moveTo(50, 70); g.lineTo(60, 82); g.lineTo(50, 94); g.lineTo(40, 82); g.closePath() }, lin(g, 40, 70, 60, 94, "#fff2a0", "#c89018"))
  },
  watch: g => {
    shape(g, () => rr(g, 38, 6, 24, 88, 6), lin(g, 38, 0, 62, 0, "#3a2a1c", "#6a4a30", "#2a1c10"))
    shape(g, () => g.arc(50, 50, 20, 0, Math.PI * 2), lin(g, 30, 30, 70, 70, "#f0f2f4", "#8a9096", "#4a5056"))
    shape(g, () => g.arc(50, 50, 15, 0, Math.PI * 2), rad(g, 50, 50, 15, "#fbfaf4", "#d8d4c8"), "rgba(0,0,0,.6)", 1, false)
    line(g, [50, 50, 50, 39], "#1a1a1a", 2); line(g, [50, 50, 58, 54], "#1a1a1a", 1.6)
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = "#333"; g.fillRect(50 + Math.cos(a) * 12.5 - 0.8, 50 + Math.sin(a) * 12.5 - 0.8, 1.6, 1.6) }
  },
  sample: g => {
    g.save(); g.translate(50, 50); g.rotate(-0.5)
    shape(g, () => rr(g, -10, -38, 20, 70, 10), lin(g, -10, 0, 10, 0, "rgba(220,240,255,.55)", "rgba(255,255,255,.85)", "rgba(180,200,220,.5)"))
    g.save(); g.shadowColor = "#8aff4a"; g.shadowBlur = 10; shape(g, () => rr(g, -8, -6, 16, 36, 8), lin(g, 0, -6, 0, 30, "#b6ff6a", "#3a9a10"), "rgba(0,60,0,.5)", 1, false); g.restore()
    shape(g, () => rr(g, -12, -46, 24, 12, 3), lin(g, 0, -46, 0, -34, "#d8302a", "#7a120e"))
    g.restore()
  },
  dogtag: g => {
    line(g, [24, 14, 40, 30, 64, 22, 80, 36], "#9aa2a8", 1.6)
    for (const [x, y, r] of [[30, 30, -0.3], [50, 38, 0.25]] as const) {
      g.save(); g.translate(x, y); g.rotate(r)
      shape(g, () => rr(g, 0, 0, 30, 46, 10), lin(g, 0, 0, 30, 46, "#e4e8ea", "#8a9296", "#5a6064"))
      g.fillStyle = "rgba(0,0,0,.45)"; for (let k = 0; k < 4; k++) g.fillRect(6, 14 + k * 7, 18 - k * 2, 2)
      g.restore()
    }
  },
  keycard_lab: g => {
    shape(g, () => rr(g, 12, 24, 76, 50, 6), lin(g, 12, 24, 88, 74, "#f0f2f4", "#b8c0c8"))
    g.fillStyle = "#c8302a"; g.fillRect(12, 30, 76, 10)
    shape(g, () => rr(g, 20, 48, 18, 16, 2), lin(g, 20, 48, 38, 64, "#f2d27a", "#a07a20"), "rgba(0,0,0,.5)", 1, false)
    text(g, "LAB", 64, 58, 13, "#1c2a3a")
    g.save(); g.shadowColor = "#ff3020"; g.shadowBlur = 6; g.fillStyle = "#ff4a3a"; g.beginPath(); g.arc(80, 66, 2.5, 0, Math.PI * 2); g.fill(); g.restore()
  },
  key_tunnel: g => {
    shape(g, () => { g.arc(30, 50, 18, 0, Math.PI * 2); g.moveTo(40, 50); g.arc(30, 50, 7, 0, Math.PI * 2, true) }, lin(g, 12, 32, 48, 68, "#f6dc8a", "#b0842a", "#6a4a10"))
    shape(g, () => { g.moveTo(46, 46); g.lineTo(90, 46); g.lineTo(90, 54); g.lineTo(84, 54); g.lineTo(84, 64); g.lineTo(78, 64); g.lineTo(78, 54); g.lineTo(72, 54); g.lineTo(72, 60); g.lineTo(66, 60); g.lineTo(66, 54); g.lineTo(46, 54); g.closePath() }, lin(g, 0, 46, 0, 64, "#f6dc8a", "#a07a20"))
    shape(g, () => rr(g, 8, 72, 30, 14, 3), "#3a5a8a", undefined, 1.2, false); text(g, "T", 23, 79.5, 10, "#fff")
  },
}

const PAINTERS: Record<string, Painter> = {
  ammo_9mm: ammo(["#5a6a3a", "#344020"], "9 MM", "pistol", "#c87a3a"),
  ammo_44: ammo(["#7a4a2a", "#4a2a14"], ".44", "magnum", "#c87a3a"),
  ammo_556: ammo(["#4a6a4a", "#283e28"], "5,56", "rifle", "#c87a3a"),
  ammo_556ap: ammo(["#4a6a4a", "#283e28"], "5,56 AP", "rifle", "#1a1a1a", "#c8302a"),
  ammo_762: ammo(["#3e4a30", "#20281a"], "7,62", "long", "#c87a3a"),
  ammo_762ap: ammo(["#3e4a30", "#20281a"], "7,62 AP", "long", "#1a1a1a", "#c8302a"),
  ammo_12buck: ammo(["#8a2a20", "#4e1410"], "12/70", "shell", ""),
  ammo_12slug: ammo(["#8a2a20", "#4e1410"], "SLUG", "slug", "", "#e8c23a"),
  ammo_338: ammo(["#2a2e33", "#121417"], ".338", "lapua", "#c87a3a", "#3a7ad8"),
  ...ATT, ...GEAR, ...MAT, ...VAL,
}
