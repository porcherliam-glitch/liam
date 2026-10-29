import * as THREE from "three"
import type { MissionId, Vec3 } from "./types"
import { MISSIONS } from "./data"

export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number; height: number }
export interface World {
  group: THREE.Group
  obstacles: Obstacle[]
  blockers: THREE.Object3D[]
  lootSpawns: THREE.Vector3[]
  enemySpawns: THREE.Vector3[]
  extraction: THREE.Vector3
  extractionRing: THREE.Mesh
  dispose(): void
}

export function mulberry32(seed: number): () => number {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

export function createWorld(missionId: MissionId, quality: "high" | "low"): World {
  const random = mulberry32(MISSIONS[missionId].seed)
  const group = new THREE.Group(); group.name = "Einsatzgebiet"
  const obstacles: Obstacle[] = []; const blockers: THREE.Object3D[] = []
  const disposables: Array<{ dispose(): void }> = []
  const material = (color: number, roughness = 0.82, metalness = 0.08) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); disposables.push(m); return m }
  const concrete = material(0x394347), dark = material(0x172126, 0.7, 0.35), metal = material(0x58605b, 0.65, 0.45)
  const olive = material(0x4f5946), rust = material(0x765044), pale = material(0x8a8e7e)
  const accent = new THREE.MeshStandardMaterial({ color: 0x6bd8bb, emissive: 0x173e35, emissiveIntensity: 1.1, roughness: 0.45 }); disposables.push(accent)

  const groundTexture = makeGroundTexture(); disposables.push(groundTexture)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x60665e, map: groundTexture, roughness: 1 }); disposables.push(groundMat)
  const groundGeo = new THREE.PlaneGeometry(116, 116); disposables.push(groundGeo)
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = quality === "high"; group.add(ground)

  const roadMat = material(0x272f32, 0.98)
  addBox(group, 12, 0.025, 112, 0, 0.012, 0, roadMat, disposables, false)
  addBox(group, 112, 0.025, 9, 0, 0.014, 17, roadMat, disposables, false)
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xb69c5b, transparent: true, opacity: 0.45 }); disposables.push(stripeMat)
  for (let z = -50; z <= 50; z += 8) addBox(group, 0.16, 0.03, 3.4, 0, 0.032, z, stripeMat, disposables, false)

  // Solid structures are generated on a coarse industrial grid, keeping roads and spawn/extract lanes clear.
  const cells = [-38, -23, 23, 38]
  let structureIndex = 0
  for (const x of cells) for (const z of [-37, -17, 3, 34]) {
    if ((x === 38 && z === -37) || (Math.abs(x) === 23 && z === 34)) continue
    const w = 8 + random() * 5, d = 8 + random() * 6, h = 3.8 + random() * 4
    const px = x + (random() - 0.5) * 3, pz = z + (random() - 0.5) * 3
    const mat = structureIndex++ % 3 === 0 ? rust : structureIndex % 2 ? concrete : olive
    addSolid(px, pz, w, h, d, mat)
    addBox(group, w + 0.35, 0.24, d + 0.35, px, h + 0.12, pz, dark, disposables, false)
    if (quality === "high") {
      for (let k = -1; k <= 1; k++) addBox(group, 0.08, h * 0.72, d + 0.06, px + k * w * 0.32, h * 0.47, pz, metal, disposables, false)
    }
    const door = addBox(group, Math.min(3, w * 0.35), 2.4, 0.12, px, 1.2, pz + d / 2 + 0.07, dark, disposables, false)
    door.userData.decorative = true
  }

  // Containers and cover form alternating firing lanes rather than a random impassable pile.
  const coverCells = [[-13, -32], [13, -29], [-15, -10], [14, -5], [-15, 10], [15, 27], [-34, 17], [35, 17], [-8, 33], [29, -25], [-31, -27]]
  coverCells.forEach(([x, z], i) => {
    const alongX = i % 2 === 0, w = alongX ? 5.8 : 2.5, d = alongX ? 2.5 : 5.8
    addSolid(x, z, w, 2.5, d, i % 3 === 0 ? rust : i % 3 === 1 ? olive : pale)
    for (let r = -2; r <= 2; r++) addBox(group, alongX ? 0.08 : w + 0.04, 2.1, alongX ? d + 0.04 : 0.08, x + (alongX ? r : 0), 1.25, z + (alongX ? 0 : r), dark, disposables, false)
  })

  const cratePositions = [[-8, 22], [8, 22], [-9, -20], [9, -19], [-28, 11], [29, 9], [-25, -8], [23, -9], [-43, 25], [43, 29], [-42, -8], [42, -7]]
  cratePositions.forEach(([x, z], i) => { const s = 1.25 + (i % 3) * 0.2; addSolid(x, z, s, s, s, i % 2 ? metal : olive) })

  // Perimeter fence and four invisible safety bounds.
  for (let n = -52; n <= 52; n += 4) {
    addBox(group, 0.12, 2.3, 0.12, n, 1.15, -54, metal, disposables, false)
    addBox(group, 0.12, 2.3, 0.12, n, 1.15, 54, metal, disposables, false)
    addBox(group, 0.12, 2.3, 0.12, -54, 1.15, n, metal, disposables, false)
    addBox(group, 0.12, 2.3, 0.12, 54, 1.15, n, metal, disposables, false)
  }
  addBox(group, 108, 0.08, 0.08, 0, 1.9, -54, metal, disposables, false); addBox(group, 108, 0.08, 0.08, 0, 1.9, 54, metal, disposables, false)
  obstacles.push({ minX: -60, maxX: -53, minZ: -60, maxZ: 60, height: 5 }, { minX: 53, maxX: 60, minZ: -60, maxZ: 60, height: 5 }, { minX: -60, maxX: 60, minZ: -60, maxZ: -53, height: 5 }, { minX: -60, maxX: 60, minZ: 53, maxZ: 60, height: 5 })

  // Light masts and emissive navigation panels make the space readable at dusk.
  for (const [x, z] of [[-7, 15], [7, -15], [-46, 46], [46, -44], [-46, -44], [46, 46]]) {
    addBox(group, 0.18, 5.8, 0.18, x, 2.9, z, dark, disposables, false)
    addBox(group, 1.1, 0.18, 0.4, x, 5.75, z, accent, disposables, false)
    if (quality === "high") { const light = new THREE.PointLight(0x8ed9c4, 5, 14, 2); light.position.set(x, 5.3, z); group.add(light) }
  }

  const extraction = new THREE.Vector3(40, 0.06, -42)
  const ringGeo = new THREE.RingGeometry(3.2, 3.65, 48); disposables.push(ringGeo)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe9b85e, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }); disposables.push(ringMat)
  const extractionRing = new THREE.Mesh(ringGeo, ringMat); extractionRing.rotation.x = -Math.PI / 2; extractionRing.position.copy(extraction); group.add(extractionRing)
  const beaconGeo = new THREE.CylinderGeometry(3.5, 3.5, 8, 32, 1, true); disposables.push(beaconGeo)
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xe9b85e, transparent: true, opacity: 0.065, side: THREE.DoubleSide, depthWrite: false }); disposables.push(beaconMat)
  const beacon = new THREE.Mesh(beaconGeo, beaconMat); beacon.position.copy(extraction).y = 4; group.add(beacon)
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; addBox(group, 0.12, 2.4, 0.12, extraction.x + Math.cos(a) * 3.5, 1.2, extraction.z + Math.sin(a) * 3.5, accent, disposables, false) }

  const lootSpawns = [[-8, 28], [11, 12], [-18, 18], [-29, 28], [31, 29], [-30, -1], [29, 1], [-16, -24], [16, -34], [-44, -28], [44, 20], [4, -43]].map(([x, z]) => new THREE.Vector3(x, 0, z))
  const enemySpawns = [[-8, 8], [11, 4], [-19, 24], [26, 22], [-28, -15], [25, -20], [-42, 6], [42, 5], [0, -40]].map(([x, z]) => new THREE.Vector3(x, 0, z))

  function addSolid(x: number, z: number, w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const mesh = addBox(group, w, h, d, x, h / 2, z, mat, disposables, true)
    obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h }); blockers.push(mesh); return mesh
  }
  return {
    group, obstacles, blockers, lootSpawns, enemySpawns, extraction, extractionRing,
    dispose: () => { for (const d of disposables) d.dispose() },
  }
}

function addBox(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, disposables: Array<{ dispose(): void }>, shadow: boolean): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d); disposables.push(geo); const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = shadow; parent.add(mesh); return mesh
}

function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128; const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#697068"; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = "rgba(25,32,31,.28)"; ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 126, 126); ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke()
  let seed = 341
  for (let i = 0; i < 260; i++) { seed = (seed * 16807) % 2147483647; const x = seed % 128; seed = (seed * 16807) % 2147483647; const y = seed % 128; ctx.fillStyle = `rgba(15,22,20,${0.03 + (seed % 8) / 100})`; ctx.fillRect(x, y, 1, 1) }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(28, 28); texture.colorSpace = THREE.SRGBColorSpace; return texture
}

export function collides(x: number, z: number, radius: number, obstacles: Obstacle[]): boolean {
  for (const o of obstacles) if (x + radius > o.minX && x - radius < o.maxX && z + radius > o.minZ && z - radius < o.maxZ) return true
  return false
}

export function segmentBlocked(a: THREE.Vector3, b: THREE.Vector3, obstacles: Obstacle[]): boolean {
  const dx = b.x - a.x, dz = b.z - a.z; const distance = Math.hypot(dx, dz); const steps = Math.ceil(distance / 1.5)
  for (let i = 1; i < steps; i++) { const t = i / steps; const x = a.x + dx * t, z = a.z + dz * t; for (const o of obstacles) if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return true }
  return false
}

export function asVec3(v: THREE.Vector3): Vec3 { return { x: v.x, y: v.y, z: v.z } }
