import * as THREE from "three"
import { it } from "vitest"
import { CollisionWorld, type Obstacle } from "./collision"
import { GoreSystem } from "./gore"
import { NavGrid } from "./nav"
import { headlessWorld } from "./testWorld"
import type { World } from "./world"
import { InfectedManager } from "./zombies"

it("perf", () => {
  const obstacles: Obstacle[] = []
  for (let i = 0; i < 300; i++) { const x = ((i * 37) % 280) - 140, z = ((i * 53) % 280) - 140; obstacles.push({ minX: x, maxX: x + 5, minZ: z, maxZ: z + 3, height: 4 }) }
  const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }
  const world: World = headlessWorld(obstacles, bounds)
  const gore = new GoreSystem(new THREE.Scene(), world.collision, "brutal")
  const mgr = new InfectedManager(world.group, world, { difficulty: "normal", seed: 3, gore, events: { died() {} } })
  const pl = { position: new THREE.Vector3(0.5, 0, 0.5), eyeY: 1.62, crouched: false, speed: 3, sprinting: false, flashlight: false, alive: true, active: true, yaw: 0 }
  const tb = performance.now()
  mgr.prewarm()
  console.log("prewarm all variants", (performance.now() - tb).toFixed(1), "ms")
  for (let i = 0; i < 20; i++) { const e = mgr.spawn("walker", -20 + i * 2, 25, { state: "idle" }); mgr.debugAction(e, "die") }
  const kinds = ["walker", "walker", "walker", "runner", "walker", "runner", "spitter", "brute", "stalker", "crawler"] as const
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r = 12 + (i % 5) * 9; mgr.spawn(kinds[i % kinds.length], Math.cos(a) * r, Math.sin(a) * r, { state: "hunt", target: { x: 0, z: 0 } }) }
  mgr.viewer = new THREE.Vector3(0, 1.6, 0)
  const step = (n: number, t: number[] | null) => { for (let i = 0; i < n; i++) { const t0 = performance.now(); pl.position.x = Math.sin(i * 0.01) * 4; mgr.update(1 / 60, pl as never); if (t) t.push(performance.now() - t0) } }
  step(300, null)
  const times: number[] = []
  const proc = (globalThis as unknown as { process: { cpuUsage(prev?: unknown): { user: number; system: number } } }).process
  const c0 = proc.cpuUsage()
  step(1200, times)
  const cpu = proc.cpuUsage(c0)
  times.sort((a, b) => a - b)
  const avg = times.reduce((s, v) => s + v, 0) / times.length
  console.log("CPU time per frame (user+sys)", ((cpu.user + cpu.system) / 1000 / 1200).toFixed(3), "ms")
  console.log(`alive ${mgr.aliveCount()} combat ${mgr.combatCount()} list ${mgr.list.length} wall avg ${avg.toFixed(3)} ms p50 ${times[600].toFixed(3)} p95 ${times[1140].toFixed(3)} p99 ${times[1188].toFixed(3)} max ${times[1199].toFixed(3)}`, JSON.stringify(mgr.stats()))
})
