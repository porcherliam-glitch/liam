/**
 * testWorld.ts — a headless World (obstacles, collision index, nav grid, no meshes) for unit tests of AI code.
 * Not used by the game itself.
 */
import * as THREE from "three"
import { TIMES, type TimeOfDay } from "./baseData"
import { CollisionWorld, type Obstacle } from "./collision"
import { NavGrid } from "./nav"
import type { World } from "./world"
import { Obscurants } from "./obscurants"
import type { ZoneLayout } from "./zone"

export function headlessWorld(obstacles: Obstacle[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, time: TimeOfDay = "dusk"): World {
  const layout: ZoneLayout = {
    kind: "zone", bounds, districts: [], solids: [], lootSpots: [], mercCamps: [], infectedZones: [], insertions: [], extractions: [],
    objectives: [], bossArena: { x: 0, z: 0, radius: 1 }, airdropSpots: [], labels: [],
  }
  return {
    kind: "zone", layout, time, theme: time === "night" ? "night" : "dusk", group: new THREE.Group(), obstacles, collision: new CollisionWorld(obstacles),
    nav: new NavGrid(bounds, obstacles, 0.45, 1), coverPoints: [], exposure: 1, lightLevel: 1, visionScale: TIMES[time].visionScale, night: time === "night", obscurants: new Obscurants(), weather: "clear", weatherVision: 1, setWeather() {}, onLightning: null, raining: false, nightVision: false, setNightVision() {},
    surfaceAt: () => "asphalt", districtAt: () => null, indoor: () => false, update() {}, setExtraction() {}, setStructures() {}, dispose() {},
  }
}
