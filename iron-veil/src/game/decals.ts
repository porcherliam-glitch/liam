/**
 * decals.ts — stencilled markings for props: one canvas atlas (spray-painted words, serial numbers, hazard stripes,
 * medical cross, biohazard sign, arrows) and helpers that build decal quads with UVs into it. Decals are separate
 * thin quads a few millimetres in front of a face (alpha-tested, so they sort and shadow like solid geometry).
 * Browser only: without a document there is no atlas and decalMaterial() returns null.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

/** Atlas regions in pixels (x, y, w, h) of the 1024 × 512 canvas. */
const RECTS = {
  supply: [0, 0, 512, 96], ammo: [512, 0, 512, 96], drop: [0, 96, 512, 96], fragile: [512, 96, 512, 96],
  lot: [0, 192, 384, 48], serial: [384, 192, 384, 48], tresor: [768, 192, 256, 48],
  hazard: [0, 240, 512, 64], cross: [512, 240, 128, 128], bio: [640, 240, 128, 128], up: [768, 240, 128, 128], flame: [896, 240, 128, 128],
  case: [0, 304, 512, 72], medic: [0, 376, 384, 64], name: [384, 376, 256, 48], polar: [640, 376, 256, 64], tools: [0, 440, 384, 64],
} as const
export type DecalId = keyof typeof RECTS
const W = 1024, H = 512

let atlas: THREE.CanvasTexture | null | undefined
function buildAtlas(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const g = c.getContext("2d"); if (!g) return null
  const font = (px: number, weight = 900) => `${weight} ${px}px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`
  const text = (id: DecalId, lines: [string, number, string][]) => {
    const [x, y, w, h] = RECTS[id]
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip()
    let cy = y + 6
    for (const [t, px, col] of lines) {
      g.font = font(px); g.fillStyle = col; g.textBaseline = "top"
      const tw = g.measureText(t).width, sx = Math.min(1, (w - 16) / tw)
      g.save(); g.translate(x + w / 2 - tw * sx / 2, cy); g.scale(sx, 1); g.fillText(t, 0, 0); g.restore()
      cy += px + 4
    }
    g.restore()
  }
  const ST = "rgba(232,226,204,0.95)", BK = "rgba(18,18,16,0.92)", YE = "rgba(222,176,40,0.95)"
  text("supply", [["VERSORGUNG", 54, ST], ["HILFSGÜTER · 24 KG · NICHT STÜRZEN", 22, ST]])
  text("ammo", [["MUNITION 5,56 × 45", 50, YE], ["1200 PATRONEN · LOS 22-A", 22, YE]])
  text("drop", [["LUFTABWURF", 54, BK], ["NICHT STAPELN · FALLSCHIRM ENTFERNEN", 22, BK]])
  text("fragile", [["VORSICHT", 50, BK], ["ZERBRECHLICH · TROCKEN LAGERN", 24, BK]])
  text("lot", [["LOS 7734-B  ·  03/26  ·  NSN 8970-01", 30, ST]])
  text("serial", [["SN 0418-77  ·  KAT. II", 30, BK]])
  text("tresor", [["TRESOR KL. III", 30, "rgba(200,170,90,0.95)"]])
  text("case", [["WAFFENKOFFER", 46, ST], ["NUR FÜR DIENSTGEBRAUCH", 18, ST]])
  text("medic", [["ERSTE HILFE", 50, "rgba(190,36,30,0.95)"]])
  text("name", [["R. WEBER", 34, BK]])
  text("polar", [["POLAR", 46, "rgba(150,156,160,0.95)"]])
  text("tools", [["WERKZEUG", 50, ST]])
  // hazard stripes
  {
    const [x, y, w, h] = RECTS.hazard
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = YE; g.fillRect(x, y, w, h); g.fillStyle = BK
    for (let i = -2; i < w / 32 + 2; i++) { g.beginPath(); g.moveTo(x + i * 64, y + h); g.lineTo(x + i * 64 + 32, y + h); g.lineTo(x + i * 64 + 32 + h, y); g.lineTo(x + i * 64 + h, y); g.fill() }
    g.restore()
  }
  // medical cross in a white disc
  {
    const [x, y, w] = RECTS.cross, cx = x + w / 2, cy = y + w / 2
    g.fillStyle = "rgba(236,236,230,0.97)"; g.beginPath(); g.arc(cx, cy, w * 0.46, 0, Math.PI * 2); g.fill()
    g.fillStyle = "rgba(196,36,30,1)"; g.fillRect(cx - w * 0.1, cy - w * 0.32, w * 0.2, w * 0.64); g.fillRect(cx - w * 0.32, cy - w * 0.1, w * 0.64, w * 0.2)
  }
  // biohazard-style sign: three rings around a centre
  {
    const [x, y, w] = RECTS.bio, cx = x + w / 2, cy = y + w / 2
    g.strokeStyle = YE; g.fillStyle = YE; g.lineWidth = 9
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * w * 0.17, cy + Math.sin(a) * w * 0.17, w * 0.2, 0, Math.PI * 2); g.stroke() }
    g.beginPath(); g.arc(cx, cy, w * 0.09, 0, Math.PI * 2); g.fill()
    g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, w * 0.44, 0, Math.PI * 2); g.stroke()
  }
  // "this side up" arrows
  {
    const [x, y, w] = RECTS.up
    g.fillStyle = BK
    for (const ox of [0.28, 0.72]) {
      const cx = x + w * ox
      g.beginPath(); g.moveTo(cx, y + w * 0.12); g.lineTo(cx + w * 0.17, y + w * 0.4); g.lineTo(cx + w * 0.06, y + w * 0.4); g.lineTo(cx + w * 0.06, y + w * 0.72)
      g.lineTo(cx - w * 0.06, y + w * 0.72); g.lineTo(cx - w * 0.06, y + w * 0.4); g.lineTo(cx - w * 0.17, y + w * 0.4); g.fill()
    }
    g.fillRect(x + w * 0.1, y + w * 0.8, w * 0.8, w * 0.07)
  }
  // flammable diamond
  {
    const [x, y, w] = RECTS.flame, cx = x + w / 2, cy = y + w / 2
    g.fillStyle = "rgba(200,40,30,0.95)"; g.beginPath(); g.moveTo(cx, y + 6); g.lineTo(x + w - 6, cy); g.lineTo(cx, y + w - 6); g.lineTo(x + 6, cy); g.fill()
    g.fillStyle = "rgba(240,236,220,0.95)"; g.beginPath(); g.moveTo(cx, cy - w * 0.26); g.quadraticCurveTo(cx + w * 0.2, cy, cx + w * 0.1, cy + w * 0.18); g.lineTo(cx - w * 0.1, cy + w * 0.18); g.quadraticCurveTo(cx - w * 0.2, cy, cx, cy - w * 0.26); g.fill()
  }
  // spray-paint wear: knock random specks and scratches out of everything
  g.globalCompositeOperation = "destination-out"
  let s = 1234567
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
  for (let i = 0; i < 9000; i++) { const r = rnd() * 2.2 + 0.4; g.globalAlpha = 0.4 + rnd() * 0.6; g.fillRect(rnd() * W, rnd() * H, r, r) }
  g.lineWidth = 1.2
  for (let i = 0; i < 160; i++) { const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.stroke() }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over"
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

let material: THREE.MeshStandardMaterial | null | undefined
/** Shared decal material (null outside the browser). */
export function decalMaterial(): THREE.MeshStandardMaterial | null {
  if (material !== undefined) return material
  atlas = atlas === undefined ? buildAtlas() : atlas
  material = atlas ? new THREE.MeshStandardMaterial({ map: atlas, transparent: false, alphaTest: 0.35, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) : null
  return material
}

/** Collects decal quads: `face` = outward normal axis of the surface the decal sits on. */
export class Decals {
  private quads: THREE.BufferGeometry[] = []
  /**
   * Adds decal `id` sized w × h (metres) centred at (x, y, z) on a face pointing along `face`
   * ("+x" | "-x" | "+y" | "-y" | "+z" | "-z"); `spin` rotates it within the face.
   */
  add(id: DecalId, w: number, h: number, x: number, y: number, z: number, face: "+x" | "-x" | "+y" | "-y" | "+z" | "-z", spin = 0): this {
    const [rx, ry, rw, rh] = RECTS[id]
    const g = new THREE.PlaneGeometry(w, h)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / W, 1 - (ry + (1 - uv.getY(i)) * rh) / H)
    if (spin) g.rotateZ(spin)
    const e = new THREE.Euler(...({ "+z": [0, 0, 0], "-z": [0, Math.PI, 0], "+x": [0, Math.PI / 2, 0], "-x": [0, -Math.PI / 2, 0], "+y": [-Math.PI / 2, 0, 0], "-y": [Math.PI / 2, 0, 0] } as const)[face])
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e))
    const off = 0.0025, n = { "+z": [0, 0, off], "-z": [0, 0, -off], "+x": [off, 0, 0], "-x": [-off, 0, 0], "+y": [0, off, 0], "-y": [0, -off, 0] }[face]
    g.translate(x + n[0], y + n[1], z + n[2])
    this.quads.push(g)
    return this
  }
  /** Merged decal geometry, or null when nothing was added. */
  build(): THREE.BufferGeometry | null {
    if (!this.quads.length) return null
    const g = mergeGeometries(this.quads, false)!
    for (const q of this.quads) q.dispose()
    this.quads = []
    g.computeBoundingSphere()
    return g
  }
}
