// In-expedition map: terrain, walls, extraction points, points of interest, mission markers and the player.

import type { GameApi, RunMapData } from "../../game/api"
import type { Screen } from "../ui"
import { esc } from "../ui"

export class RunMapScreen implements Screen {
  name = "runmap"
  overlay = true
  private canvas: HTMLCanvasElement | null = null
  private base: HTMLCanvasElement | null = null
  private zoom = 1
  constructor(private game: GameApi, private areaName: string) {}
  render(): string {
    return `<div class="runmap-wrap"><h2>${esc(this.areaName)}</h2><canvas class="runmap" width="760" height="760"></canvas>
      <div class="legend"><span class="lg ext">⬆ Extraktion</span><span class="lg poi">• Ort</span><span class="lg mis">◆ Mission</span><span class="lg boss">☠ Boss</span><span class="lg you">▲ Du</span></div>
      <div class="row"><button class="btn small" data-focus data-adjust data-action="zoom">Zoom ${this.zoom.toFixed(1)}× (◀ ▶)</button><button class="btn small" data-focus data-action="close">Schließen</button></div></div>`
  }
  onShow(el: HTMLElement): void {
    this.canvas = el.querySelector("canvas")
    this.base = null
    this.draw()
  }
  onAdjust(_el: HTMLElement, delta: number): void {
    this.zoom = Math.max(1, Math.min(3, this.zoom + delta * 0.5))
    this.game.ui.refresh(this)
    this.canvas = document.querySelector(".screen-runmap canvas")
    this.draw()
  }
  onAction(action: string): void {
    if (action === "close") this.game.ui.pop()
    else if (action === "zoom") this.onAdjust(document.body, 0.5 * (this.zoom >= 3 ? -4 : 1))
  }
  update(): void {
    this.draw()
  }
  private buildBase(d: RunMapData): HTMLCanvasElement {
    const c = document.createElement("canvas")
    c.width = c.height = 760
    const ctx = c.getContext("2d")!
    const res = 152
    const cell = 760 / res
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = -d.size + ((i + 0.5) / res) * d.size * 2
        const z = -d.size + ((j + 0.5) / res) * d.size * 2
        const h = d.heightAt(x, z)
        if (h < d.waterLevel) ctx.fillStyle = "#1e2e3e"
        else {
          const v = Math.max(0, Math.min(1, (h + 2) / 12))
          ctx.fillStyle = `rgb(${40 + v * 60},${48 + v * 50},${34 + v * 40})`
        }
        ctx.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5)
      }
    }
    // Walls (boxes)
    ctx.fillStyle = "#b8b0a0"
    const s = 760 / (d.size * 2)
    for (const w of d.walls) {
      ctx.save()
      ctx.translate((w.x + d.size) * s, (w.z + d.size) * s)
      ctx.rotate(-w.yaw)
      ctx.fillRect(-w.hw * s, -w.hd * s, Math.max(1.5, w.hw * 2 * s), Math.max(1.5, w.hd * 2 * s))
      ctx.restore()
    }
    return c
  }
  private draw(): void {
    const e = this.game.expedition
    if (!this.canvas || !e) return
    const d = e.mapData()
    if (!this.base) this.base = this.buildBase(d)
    const ctx = this.canvas.getContext("2d")!
    const W = 760
    const s = W / (d.size * 2)
    ctx.save()
    ctx.clearRect(0, 0, W, W)
    // Zoom centred on the player
    const px = (d.player.x + d.size) * s
    const pz = (d.player.z + d.size) * s
    ctx.translate(W / 2, W / 2)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(this.zoom > 1 ? -px : -W / 2, this.zoom > 1 ? -pz : -W / 2)
    ctx.drawImage(this.base, 0, 0)
    // Fog of war: darken unexplored cells
    const er = d.exploredRes
    const ec = W / er
    ctx.fillStyle = "rgba(0,0,0,0.62)"
    for (let j = 0; j < er; j++) for (let i = 0; i < er; i++) if (!d.explored[j * er + i]) ctx.fillRect(i * ec, j * ec, ec + 0.5, ec + 0.5)
    const mark = (x: number, z: number, text: string, color: string, label?: string) => {
      const mx = (x + d.size) * s
      const mz = (z + d.size) * s
      ctx.fillStyle = color
      ctx.font = `bold ${16 / this.zoom}px sans-serif`
      ctx.textAlign = "center"
      ctx.fillText(text, mx, mz + 5 / this.zoom)
      if (label) {
        ctx.font = `${11 / this.zoom}px sans-serif`
        ctx.fillStyle = "#e8e0d0"
        ctx.fillText(label, mx, mz + 17 / this.zoom)
      }
    }
    for (const p of d.pois) if (p.visited) mark(p.x, p.z, "•", "#d8d0b0", p.name)
    for (const x of d.extractions) mark(x.x, x.z, "⬆", x.active ? "#6fd0ff" : "#8a9aa8", x.name + (x.active ? "" : " (gesperrt)"))
    for (const m of d.markers) mark(m.x, m.z, m.kind === "boss" ? "☠" : "◆", m.kind === "boss" ? "#ff6a4a" : "#ffd24a", m.label)
    // Player arrow
    ctx.save()
    ctx.translate(px, pz)
    ctx.rotate(-d.player.yaw)
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.moveTo(0, -9 / this.zoom)
    ctx.lineTo(6 / this.zoom, 7 / this.zoom)
    ctx.lineTo(-6 / this.zoom, 7 / this.zoom)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.restore()
  }
  onBack(): void {
    this.game.ui.pop()
  }
  hints() {
    return [
      { action: "menuLeft" as const, label: "Zoom −" },
      { action: "menuRight" as const, label: "Zoom +" },
      { action: "back" as const, label: "Schließen" },
    ]
  }
}
