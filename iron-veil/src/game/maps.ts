/**
 * maps.ts — hand-authored map layouts per mission as pure data (no three.js). world.ts turns a layout into geometry.
 * CONTRACT (used by raid.ts, enemies.ts and the layout tests):
 *  - bounds: playable rectangle; world.ts adds perimeter obstacles just outside it.
 *  - solids: every blocking box; each becomes one Obstacle (AABB, y from `y` (default 0) to y + h).
 *  - playerSpawns: insertion points (raid picks one at random), with the initial yaw (0 = facing -Z).
 *  - lootSpawns: crate positions (raid picks `MISSIONS[id].crates` of them); tier 2 = high-value spots (inside buildings).
 *  - enemySpawns: start positions with a looping patrol route (>= 2 points, each walkable).
 *  - extractions: 2–3 evac zones; raid activates one at random per raid.
 *  - reinforcementSpawns: map-edge points where reinforcements enter after the evac is called.
 * PLACEHOLDER: the environment pass replaces the generated layout below with authored maps per mission.
 */
import type { Bounds } from "./nav"
import type { MissionId, Vec2 } from "./types"

export interface MapSolid { x: number; z: number; w: number; d: number; h: number; y?: number; style: string }
export interface EnemySpawn { x: number; z: number; patrol: Vec2[] }
export interface ExtractionPoint { id: string; name: string; x: number; z: number; radius: number }
export interface LootSpawn { x: number; z: number; tier: 0 | 1 | 2 }
export interface PlayerSpawn { x: number; z: number; yaw: number }

export interface MapLayout {
  id: MissionId
  bounds: Bounds
  solids: MapSolid[]
  playerSpawns: PlayerSpawn[]
  lootSpawns: LootSpawn[]
  enemySpawns: EnemySpawn[]
  extractions: ExtractionPoint[]
  reinforcementSpawns: Vec2[]
}

const cache = new Map<MissionId, MapLayout>()

export function getLayout(id: MissionId): MapLayout {
  let layout = cache.get(id)
  if (!layout) { layout = placeholderLayout(id); cache.set(id, layout) }
  return layout
}

function placeholderLayout(id: MissionId): MapLayout {
  const solids: MapSolid[] = []
  for (const x of [-38, -23, 23, 38]) for (const z of [-37, -17, 3, 34]) {
    if ((x === 38 && z === -37) || (Math.abs(x) === 23 && z === 34)) continue
    solids.push({ x, z, w: 10, d: 10, h: 6, style: "warehouse" })
  }
  const cover = [[-13, -32], [13, -29], [-15, -10], [14, -5], [-15, 10], [15, 27], [-34, 17], [35, 17], [-8, 33], [29, -25], [-31, -27]]
  cover.forEach(([x, z], i) => solids.push({ x, z, w: i % 2 ? 2.5 : 5.8, d: i % 2 ? 5.8 : 2.5, h: 2.5, style: "container" }))
  const loot: Vec2[] = [[-8, 28], [11, 12], [-18, 18], [-29, 28], [31, 29], [-30, -1], [29, 1], [-16, -24], [16, -34], [-44, -28], [44, 20], [4, -43], [-4, -8], [8, -48]].map(([x, z]) => ({ x, z }))
  const enemies: Vec2[] = [[-8, 8], [11, 4], [-19, 24], [26, 22], [-28, -15], [25, -20], [-42, 6], [42, 5], [0, -40], [-20, -44], [20, -44], [-45, 40]].map(([x, z]) => ({ x, z }))
  return {
    id,
    bounds: { minX: -52, maxX: 52, minZ: -52, maxZ: 52 },
    solids,
    playerSpawns: [{ x: 0, z: 46, yaw: 0 }, { x: -46, z: 44, yaw: -0.6 }],
    lootSpawns: loot.map((p, i) => ({ ...p, tier: (i % 5 === 0 ? 2 : i % 2) as 0 | 1 | 2 })),
    enemySpawns: enemies.map(p => ({ ...p, patrol: [{ x: p.x, z: p.z }, { x: p.x + (p.x > 0 ? -6 : 6), z: p.z + 4 }] })),
    extractions: [{ id: "se", name: "Südost", x: 40, z: -44, radius: 4 }, { id: "nw", name: "Nordwest", x: -44, z: -46, radius: 4 }],
    reinforcementSpawns: [{ x: 0, z: -50 }, { x: 50, z: 0 }, { x: -50, z: 0 }],
  }
}
