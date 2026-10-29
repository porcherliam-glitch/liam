/**
 * survivors.ts — the other survivors in the zone. Not hostile: a camp in the school yard (a trader, a medic and an
 * armed guard) and lost or wounded people scattered over the districts. They hide or flee from infected, the armed
 * ones shoot them, infected that reach them bite. A lost survivor asks to be taken along, a wounded one first needs a
 * bandage; a survivor who follows the player to an extraction moves into the base (one more resident, more staff).
 *
 * Visuals reuse the soldier rig with civilian looks (soldier.ts). raid.ts owns the interaction (prompts, trading,
 * healing, rewards) through `nearest`, `prompt` and the state changes below.
 */
import * as THREE from "three"
import { approachAngle, yawTo } from "./ai"
import type { Hostile, HostileManager } from "./hostiles"
import { acquireSoldierAssets, makeDrive, releaseSoldierAssets, SoldierModel, type SoldierAssets, type SoldierDrive, type SurvivorLook } from "./soldier"
import type { Vec2 } from "./types"
import type { World } from "./world"

export type SurvivorRole = "trader" | "medic" | "guard" | "lost" | "wounded" | "resident"
export type SurvivorState = "idle" | "hide" | "wounded" | "follow" | "wait" | "flee" | "dead"

const ROLE_TITLES: Record<SurvivorRole, [string, string]> = { trader: ["Händler", "Händlerin"], medic: ["Sanitäter", "Sanitäterin"], guard: ["Wache", "Wache"], lost: ["Verirrter", "Verirrte"], wounded: ["Verletzter", "Verletzte"], resident: ["Bewohner", "Bewohnerin"] }
/** What rescued people in the base say when spoken to. */
export const RESIDENT_LINES = [
  "Danke, dass du mich da rausgeholt hast.", "Die Mauer hält. Hoffentlich.", "Ich helfe in der Werkstatt, wo ich kann.", "Bring Wasser mit, wenn du kannst.",
  "Nachts höre ich sie am Zaun kratzen.", "Pass da draußen auf dich auf.", "Wir haben Glück, dass wir dich haben.", "Ich träume noch vom Lager auf dem Schulhof.",
  "Wenn du Funkteile findest: Wir könnten mehr Leute erreichen.", "Hier drin kann man fast wieder schlafen.",
]
/** First names; true = the German role titles and pronouns use the feminine form. */
const NAMES: [string, boolean][] = [["Anna", true], ["Jonas", false], ["Mira", true], ["Paul", false], ["Lena", true], ["Kurt", false], ["Elif", true], ["Tomasz", false], ["Ida", true], ["Malik", false], ["Greta", true], ["Sami", false], ["Vera", true], ["Ole", false], ["Nadia", true], ["Bruno", false], ["Hanna", true], ["Emil", false]]
/** "Händlerin", "Verletzter" … matching the survivor's name. */
export function roleName(s: { role: SurvivorRole; female: boolean }): string { return ROLE_TITLES[s.role][s.female ? 1 : 0] }
const RADIUS = 0.34
/** Infected closer than this bite. */
const BITE_RANGE = 1.35
const WEAPON: Record<SurvivorLook, { range: number; interval: number; damage: number; sfx: string } | null> = {
  survivor: { range: 22, interval: 0.55, damage: 24, sfx: "shot_p9" },
  drifter: { range: 14, interval: 1.1, damage: 55, sfx: "shot_kv12" },
  medic: null,
}

export interface Survivor {
  readonly id: number
  readonly role: SurvivorRole
  readonly look: SurvivorLook
  readonly name: string
  /** Feminine role title and pronoun ("Händlerin", "sie"). */
  readonly female: boolean
  readonly position: THREE.Vector3
  readonly home: THREE.Vector3
  readonly group: THREE.Group
  readonly model: SoldierModel
  readonly maxHealth: number
  health: number
  state: SurvivorState
  yaw: number
  /** Called out to the player already (lost/wounded). */
  calledOut: boolean
  /** Trader stock (raid.ts fills it). */
  stock: { id: string; qty: number }[]
  path: Vec2[]
  pathT: number
  shotT: number
  hurtT: number
  /** Seconds until the next panicked shout (fleeing survivors draw infected to themselves). */
  panicT: number
  /** Residents stroll around the base: current target and time until the next pick. */
  wander: Vec2 | null
  wanderT: number
  drive: SoldierDrive
}

export interface SurvivorHost {
  world: World
  infected(): HostileManager | null
  tracer(from: THREE.Vector3, to: THREE.Vector3): void
  sfx(id: string, at: THREE.Vector3, volume?: number): void
  noise(at: THREE.Vector3, radius: number): void
  say(text: string, seconds: number): void
  rng(): number
}

export interface SurvivorSpot { role: SurvivorRole; look: SurvivorLook; x: number; z: number; yaw?: number }

/** Rescued people walking around the base (around the middle of the stations). */
export function residentSpots(world: World, count: number, rng: () => number, around: Vec2): SurvivorSpot[] {
  const looks: SurvivorLook[] = ["survivor", "drifter", "medic"]
  const spots: SurvivorSpot[] = []
  for (let i = 0; i < count; i++) {
    const p = world.nav.randomPointNear(around.x, around.z, 12, rng)
    if (p) spots.push({ role: "resident", look: looks[Math.floor(rng() * looks.length)], x: p.x, z: p.z, yaw: rng() * Math.PI * 2 })
  }
  return spots
}

/** Camp in the school yard (around the campfire) plus lost and wounded survivors in random districts. */
export function survivorSpots(world: World, rng: () => number): SurvivorSpot[] {
  const spots: SurvivorSpot[] = [
    { role: "trader", look: "drifter", x: 23.5, z: 84.5, yaw: -0.9 },
    { role: "medic", look: "medic", x: 33.5, z: 88.5, yaw: 0.6 },
    { role: "guard", look: "survivor", x: 29, z: 78.8, yaw: 0 },
  ]
  const layout = world.layout as { districts?: { id: string; minX: number; maxX: number; minZ: number; maxZ: number; danger: number }[] }
  const districts = (layout.districts ?? []).filter(d => d.danger <= 2)
  for (let i = 0; i < 4 && districts.length; i++) {
    const d = districts[Math.floor(rng() * districts.length)]
    const p = world.nav.randomPointNear((d.minX + d.maxX) / 2 + (rng() - 0.5) * (d.maxX - d.minX) * 0.6, (d.minZ + d.maxZ) / 2 + (rng() - 0.5) * (d.maxZ - d.minZ) * 0.6, 20, rng)
    if (!p || Math.hypot(p.x - 29, p.z - 84) < 40) continue
    spots.push({ role: i === 3 ? "wounded" : "lost", look: rng() < 0.5 ? "survivor" : rng() < 0.5 ? "drifter" : "medic", x: p.x, z: p.z, yaw: rng() * Math.PI * 2 })
  }
  return spots
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _out = { x: 0, z: 0 }

export class SurvivorManager {
  readonly list: Survivor[] = []
  private assets: SoldierAssets
  private group = new THREE.Group()
  private nextId = 1
  private player = new THREE.Vector3()

  constructor(parent: THREE.Object3D, private host: SurvivorHost, spots: SurvivorSpot[]) {
    this.assets = acquireSoldierAssets()
    this.group.name = "Überlebende"
    const names = [...NAMES]
    for (const s of spots) {
      const [name, female] = names.splice(Math.floor(host.rng() * names.length), 1)[0] ?? ["Unbekannt", false]
      this.add(s, name, female)
    }
    parent.add(this.group)
  }

  private add(spot: SurvivorSpot, name: string, female: boolean): Survivor {
    const model = new SoldierModel(spot.look, this.assets, this.nextId * 7 + 3)
    if (!WEAPON[spot.look] || spot.role === "trader" || spot.role === "wounded" || spot.role === "resident") model.holster()
    model.setNight(this.host.world.night && !model.unarmed)
    const group = new THREE.Group(); group.name = `Überlebender_${name}`; group.add(model.root)
    const q = { x: spot.x, z: spot.z }
    this.host.world.collision.depenetrate(q, RADIUS + 0.05)
    group.position.set(q.x, 0, q.z)
    const yaw = spot.yaw ?? 0
    group.rotation.y = yaw
    const maxHealth = spot.role === "guard" ? 140 : spot.role === "wounded" ? 60 : 90
    const s: Survivor = {
      id: this.nextId++, role: spot.role, look: spot.look, name, female, position: group.position, home: new THREE.Vector3(q.x, 0, q.z), group, model, maxHealth,
      health: spot.role === "wounded" ? 35 : maxHealth, state: spot.role === "lost" ? "hide" : spot.role === "wounded" ? "wounded" : "idle", yaw,
      calledOut: false, stock: [], path: [], pathT: 0, shotT: this.host.rng(), hurtT: 0, panicT: 0, wander: null, wanderT: this.host.rng() * 4, drive: makeDrive(),
    }
    this.group.add(group)
    this.list.push(s)
    this.animate(s, 1 / 60)
    return s
  }

  /** Living survivors following the player. */
  followers(): Survivor[] { return this.list.filter(s => s.state === "follow" || s.state === "wait") }

  /** Nearest living survivor within range of p. */
  nearest(p: THREE.Vector3, range: number): Survivor | null {
    let best: Survivor | null = null, bd = range
    for (const s of this.list) {
      if (s.state === "dead") continue
      const d = Math.hypot(s.position.x - p.x, s.position.z - p.z)
      if (d < bd) { bd = d; best = s }
    }
    return best
  }

  /** Lost survivor joins; a follower toggles between following and waiting. */
  follow(s: Survivor): void {
    if (s.state === "dead") return
    s.state = s.state === "follow" ? "wait" : "follow"
    if (s.state === "follow") { s.path = []; s.pathT = 0 }
  }

  /** A wounded survivor got bandaged: back on their feet and following. */
  patchUp(s: Survivor): void {
    s.health = Math.max(s.health, s.maxHealth * 0.7)
    s.state = "follow"
    s.path = []; s.pathT = 0
  }

  update(dt: number, player: THREE.Vector3, playerActive: boolean): void {
    this.player.copy(player)
    const inf = this.host.infected()
    for (const s of this.list) {
      if (s.state === "dead") { if (!s.model.settled) s.model.update(dt, s.drive); s.model.tick(dt); continue }
      const far = Math.hypot(s.position.x - player.x, s.position.z - player.z)
      // far from the player and calm: frozen in place (no AI, no animation)
      if (far > 110 && s.state !== "follow") continue
      const threats = inf ? inf.inRadius(s.position, 16) : []
      let nearest: Hostile | null = null, nd = Infinity
      for (const t of threats) { const d = t.position.distanceTo(s.position); if (d < nd) { nd = d; nearest = t } }
      this.bites(s, threats, dt)
      if ((s.state as SurvivorState) === "dead") continue
      if ((s.role === "lost" || s.role === "wounded") && !s.calledOut && playerActive && far < 22) {
        s.calledOut = true
        this.host.say(s.role === "wounded" ? `${s.name}: „Hier! Ich bin verletzt … hast du Verbandszeug?“` : `${s.name}: „Hilfe! Nimm mich mit, bitte!“`, 4)
      }
      const armed = !s.model.unarmed && WEAPON[s.look]
      let fight = false
      if (armed && nearest && nd < armed.range && s.state !== "wounded" && s.state !== "hide") fight = this.shoot(s, nearest, armed, dt)
      // movement goal
      let goal: Vec2 | null = null, run = false
      if (!fight && nearest && nd < 9 && s.state !== "wounded") {
        // flee: away from the closest infected, toward the player if following
        const ax = s.position.x - nearest.position.x, az = s.position.z - nearest.position.z, l = Math.hypot(ax, az) || 1
        goal = { x: s.position.x + ax / l * 6, z: s.position.z + az / l * 6 }; run = true
        if (s.state === "hide" || s.state === "idle") s.state = s.role === "lost" ? "hide" : s.state
        // panic is loud: every shout pulls nearby infected toward the survivor
        s.panicT -= dt
        if (s.panicT <= 0) { s.panicT = 2.2 + this.host.rng() * 1.5; this.host.noise(s.position, 14) }
      } else if (s.state === "follow") {
        const d = Math.hypot(player.x - s.position.x, player.z - s.position.z)
        if (d > 3.2) { goal = { x: player.x, z: player.z }; run = d > 8 }
      } else if (s.state === "idle" && s.role === "resident") goal = this.stroll(s, dt)
      else if (s.state === "idle" && s.position.distanceTo(s.home) > 1.5) goal = { x: s.home.x, z: s.home.z }
      this.move(s, goal, run, dt, fight ? nearest : null)
      this.animate(s, dt, fight ? nearest : null)
    }
  }

  /** A resident picks a spot near home every few seconds (or just stands for a while). */
  private stroll(s: Survivor, dt: number): Vec2 | null {
    s.wanderT -= dt
    if (s.wanderT <= 0) {
      s.wanderT = 6 + this.host.rng() * 12
      s.wander = this.host.rng() < 0.35 ? null : this.host.world.nav.randomPointNear(s.home.x, s.home.z, 9, this.host.rng)
    }
    if (s.wander && Math.hypot(s.wander.x - s.position.x, s.wander.z - s.position.z) < 0.5) s.wander = null
    return s.wander
  }

  private bites(s: Survivor, threats: Hostile[], dt: number): void {
    let n = 0
    for (const t of threats) if (t.alive && t.position.distanceTo(s.position) < BITE_RANGE) n++
    if (!n) return
    s.health -= 14 * n * dt
    s.hurtT -= dt
    if (s.hurtT <= 0) { s.hurtT = 0.7; s.model.hit((this.host.rng() - 0.5) * 2, (this.host.rng() - 0.5) * 2, 0.6); this.host.sfx("hurt", s.position, 0.7) }
    if (s.health <= 0) this.kill(s)
  }

  private kill(s: Survivor): void {
    const wasWith = s.state === "follow" || s.state === "wait" || s.role === "trader" || s.role === "medic" || s.role === "guard"
    s.state = "dead"; s.health = 0
    s.model.die((this.host.rng() - 0.5) * 2, (this.host.rng() - 0.5) * 2)
    this.host.sfx("hurt", s.position, 1)
    if (wasWith) this.host.say(`${s.name} wurde von Infizierten gerissen`, 4)
  }

  private shoot(s: Survivor, t: Hostile, w: { range: number; interval: number; damage: number; sfx: string }, dt: number): boolean {
    const yaw = yawTo(t.position.x - s.position.x, t.position.z - s.position.z)
    s.yaw = approachAngle(s.yaw, yaw, dt * 6)
    s.shotT -= dt
    if (s.shotT > 0 || Math.abs(Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw))) > 0.35) return true
    s.shotT = w.interval * (0.85 + this.host.rng() * 0.4)
    const from = _v.set(s.position.x, 1.45, s.position.z), to = t.chestPosition(_w)
    // line of sight through the map
    const dir = to.clone().sub(from), dist = dir.length(); dir.divideScalar(dist)
    const hit = this.host.world.collision.raycast(from, dir, dist)
    if (hit) return false
    s.model.fire()
    this.host.tracer(from.clone(), to.clone())
    this.host.sfx(w.sfx, from, 0.55)
    this.host.noise(from, 35)
    const inf = this.host.infected()
    if (inf && this.host.rng() < 0.82) {
      const head = this.host.rng() < 0.15
      if (head) t.headPosition(to)
      inf.applyDamage({ target: t, distance: dist, part: head ? "head" : "body", bodyPart: head ? "head" : "torso", point: to.clone() }, { amount: w.damage, from: from.clone(), dir: { x: dir.x, y: dir.y, z: dir.z }, penetration: 0.2, kind: w.sfx === "shot_kv12" ? "pellet" : "bullet", sever: 0.05 })
    }
    return true
  }

  private move(s: Survivor, goal: Vec2 | null, run: boolean, dt: number, facing: Hostile | null): void {
    const world = this.host.world
    let vx = 0, vz = 0
    if (goal) {
      s.pathT -= dt
      const last = s.path[s.path.length - 1]
      if (s.pathT <= 0 || !last || Math.hypot(last.x - goal.x, last.z - goal.z) > 2.5) {
        s.pathT = 0.8 + this.host.rng() * 0.4
        s.path = world.nav.lineWalkable(s.position.x, s.position.z, goal.x, goal.z) ? [goal] : world.nav.findPath(s.position.x, s.position.z, goal.x, goal.z, 2500) ?? [goal]
      }
      while (s.path.length > 1 && Math.hypot(s.path[0].x - s.position.x, s.path[0].z - s.position.z) < 0.6) s.path.shift()
      const next = s.path[0]
      if (next) {
        const dx = next.x - s.position.x, dz = next.z - s.position.z, d = Math.hypot(dx, dz)
        if (d > 0.25) { const sp = run ? 4.4 : 2.1; vx = dx / d * sp; vz = dz / d * sp }
      }
    }
    if (vx || vz) {
      world.collision.moveCircle(s.position.x, s.position.z, vx * dt, vz * dt, RADIUS, _out)
      s.position.x = _out.x; s.position.z = _out.z
      if (!facing) s.yaw = approachAngle(s.yaw, yawTo(vx, vz), dt * 7)
    } else if (!facing && s.state === "follow") s.yaw = approachAngle(s.yaw, yawTo(this.player.x - s.position.x, this.player.z - s.position.z), dt * 3)
    s.drive.velX = vx; s.drive.velZ = vz
  }

  private animate(s: Survivor, dt: number, target: Hostile | null = null): void {
    const d = s.drive
    const prev = d.yaw
    d.yaw = s.yaw; s.group.rotation.y = s.yaw
    d.turnRate = dt > 0 ? Math.atan2(Math.sin(s.yaw - prev), Math.cos(s.yaw - prev)) / dt : 0
    d.crouch = s.state === "hide" || s.state === "wounded" ? 1 : 0
    d.aim = target ? 1 : 0
    d.alert = target || s.state === "follow" ? 1 : s.role === "guard" ? 0.6 : 0
    d.aimYaw = s.yaw; d.aimPitch = 0
    d.look = s.state === "hide" ? Math.sin(performance.now() / 900 + s.id) * 0.6 : 0
    s.model.update(dt, d)
  }

  dispose(): void {
    for (const s of this.list) s.model.dispose()
    this.group.parent?.remove(this.group)
    releaseSoldierAssets()
  }
}
