import { useEffect, useRef } from "react"
import { startGame, stopGame } from "@/game/boot"

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uiRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!canvasRef.current || !uiRef.current) return
    startGame(canvasRef.current, uiRef.current)
    return () => stopGame()
  }, [])
  return <div id="game-root"><canvas id="game-canvas" ref={canvasRef} aria-label="Operation Iron Veil 3D-Spielwelt" /><div id="ui-overlay" ref={uiRef} /></div>
}
