import "./index.css"
import "./hud.css"
import "./ui.css"
import { startGame, stopGame } from "./game/boot"

const root = document.getElementById("root")!
root.innerHTML = `<div id="game-root"><canvas id="game-canvas" aria-label="Operation Iron Veil 3D-Spielwelt"></canvas><div id="ui-overlay"></div></div>`
startGame(root.querySelector<HTMLCanvasElement>("#game-canvas")!, root.querySelector<HTMLElement>("#ui-overlay")!)
if (import.meta.hot) import.meta.hot.dispose(() => stopGame())
