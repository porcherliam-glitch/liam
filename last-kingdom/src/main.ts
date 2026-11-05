// Entry point: creates the game once the DOM is ready and exposes the test harness.

import "./styles/index.css"
import "./styles/ui.css"
import "./styles/hud.css"
import { Game } from "./game/game"
import { installHarness } from "./dev/harness"

function boot(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement
  const loading = document.getElementById("loading")
  try {
    const game = new Game(canvas)
    installHarness(game)
    ;(window as unknown as { __GAME_READY__: boolean }).__GAME_READY__ = true
    loading?.remove()
  } catch (err) {
    console.error(err)
    if (loading) loading.innerHTML = `<div class="loading-box"><h2>Das Spiel konnte nicht starten.</h2><p>${String(err)}</p><p>Bitte einen aktuellen Browser mit WebGL verwenden (Chrome, Edge, Firefox).</p></div>`
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
else boot()
