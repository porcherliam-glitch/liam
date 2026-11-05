// Automated player for balance tests: loots containers, fights what comes close, uses potions, extracts.
// Drives the game through Input.virtual so every real system (movement, combat, AI, loot) is exercised.

import type { Game } from "../game/game"
import type { Expedition } from "../game/expedition"
import type { Zombie } from "../entities/zombie"
import { angleDelta } from "../core/math"
import { allItems } from "../items/inventory"
import { itemDef } from "../items/itemData"

export interface BotStats {
  area: string
  seconds: number
  kills: number
  damageTaken: number
  potions: number
  containers: number
  items: number
  gold: number
  outcome: "extracted" | "died" | "timeout" | "running"
  lowestHp: number
  dodges: number
  blocks: number
}

export class Bot {
  stats: BotStats
  private target: { x: number; z: number } | null = null
  private path: [number, number][] | null = null
  private pathTimer = 0
  private mode: "loot" | "extract" | "fight" = "loot"
  private lastHp = 0
  private stuck = 0
  private lastPos = { x: 0, z: 0 }
  private attackTimer = 0
  private dodgeCooldown = 0
  private extractTarget: { x: number; z: number } | null = null
  private lootGoal: number
  private maxSeconds: number
  private drawTimer = 0
  private blockTimer = 0
  /** Hunting bookkeeping: give up on a target whose health does not drop (out of reach, behind a wall). */
  private huntTarget: Zombie | null = null
  private huntHp = 0
  private huntStall = 0
  private ignored = new Map<Zombie, number>()
  private potionCooldown = 0
  done = false

  private hunt: boolean

  constructor(private game: Game, private e: Expedition, opts: { lootGoal?: number; maxSeconds?: number; hunt?: boolean } = {}) {
    this.lootGoal = opts.lootGoal ?? 8
    this.maxSeconds = opts.maxSeconds ?? 420
    this.hunt = opts.hunt ?? true
    this.stats = { area: e.areaId, seconds: 0, kills: 0, damageTaken: 0, potions: 0, containers: 0, items: 0, gold: 0, outcome: "running", lowestHp: e.player.maxHp, dodges: 0, blocks: 0 }
    this.lastHp = e.player.hp
    game.input.virtual = { move: { x: 0, y: 0 }, held: new Set(), tap: new Set() }
  }

  /** One decision per frame. */
  update(dt: number): void {
    const e = this.e
    const p = e.player
    const v = this.game.input.virtual!
    v.move.x = 0
    v.move.y = 0
    v.held.clear()
    if (this.done) return
    this.stats.seconds = e.elapsed
    this.stats.kills = e.kills
    this.stats.gold = e.runGold
    if (p.hp < this.lastHp) this.stats.damageTaken += this.lastHp - p.hp
    this.lastHp = p.hp
    this.stats.lowestHp = Math.min(this.stats.lowestHp, p.hp)
    if (p.dead) {
      this.finish("died")
      return
    }
    if (e.elapsed > this.maxSeconds) {
      this.finish("timeout")
      return
    }
    if (this.game.ui.depth > 0) {
      // Loot screen: take everything
      const btn = document.querySelector<HTMLElement>('.screen-loot [data-action="takeall"]')
      if (btn) btn.click()
      else v.tap.add("back")
      return
    }
    this.attackTimer -= dt
    this.dodgeCooldown -= dt
    this.potionCooldown -= dt
    // Potion when hurt (quick slot 1 holds the potion if the harness placed one)
    if (p.hp < p.maxHp * 0.45 && p.state === "normal" && this.potionCooldown <= 0) {
      const q = p.inventory.equipment.quick1
      if (q && itemDef(q.defId).consumable) {
        v.tap.add("quick1")
        this.stats.potions++
        this.potionCooldown = 3
        return
      }
    }
    // Nearest threat
    let threat: Zombie | null = null
    let td = 999
    for (const [z, until] of this.ignored) if (until < e.elapsed || z.dead) this.ignored.delete(z)
    for (const z of e.zombies) {
      if (z.dead) continue
      if (this.ignored.has(z) && Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) > 3.5) continue
      const d = Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z)
      if (d < td) {
        td = d
        threat = z
      }
    }
    const bagCount = allItems(p.inventory).length
    if (threat && (td < 7 || (this.hunt && td < 22 && this.mode !== "extract" && !threat.sleeping))) {
      if (this.huntTarget !== threat) {
        this.huntTarget = threat
        this.huntHp = threat.hp
        this.huntStall = 0
      } else if (threat.hp < this.huntHp) {
        this.huntHp = threat.hp
        this.huntStall = 0
      } else if (td > 2.5) {
        this.huntStall += dt
        if (this.huntStall > 10) {
          // Not reachable: leave it alone for a while and get back to looting
          this.ignored.set(threat, e.elapsed + 25)
          this.huntTarget = null
          this.target = null
          return
        }
      }
      this.fight(threat, td, v)
      return
    }
    this.huntTarget = null
    // Goal selection
    if (this.mode !== "extract" && (bagCount >= this.lootGoal || p.hp < p.maxHp * 0.3)) {
      this.mode = "extract"
      this.target = null
    }
    if (this.mode === "extract") {
      if (!this.extractTarget) {
        const active = e.world.extractions.filter((x) => x.active)
        if (active.length) {
          active.sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))
          this.extractTarget = { x: active[0].x, z: active[0].z }
        }
      }
      if (this.extractTarget) {
        const d = Math.hypot(this.extractTarget.x - p.pos.x, this.extractTarget.z - p.pos.z)
        if (d < 2.5) {
          // interact once to start, then stand still
          const prompt = (e as unknown as { lastPrompt: { kind: string } | null }).lastPrompt
          if (!(e as unknown as { extracting: unknown }).extracting && prompt?.kind === "extraction") v.tap.add("interact")
          return
        }
        this.moveTo(this.extractTarget, v, dt, true)
        return
      }
    }
    // Loot mode: nearest unopened container
    if (!this.target || this.stuck > 6) {
      this.stuck = 0
      let best: { x: number; z: number } | null = null
      let bd = 999
      for (const c of e.world.containers) {
        if (c.opened) continue
        // Containers right next to an extraction beacon would trigger the extraction prompt: skip them
        if (e.world.extractions.some((x) => Math.hypot(x.x - c.x, x.z - c.z) < 4)) continue
        const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z)
        if (d < bd) {
          bd = d
          best = { x: c.x, z: c.z }
        }
      }
      this.target = best
      this.path = null
    }
    if (this.target) {
      const d = Math.hypot(this.target.x - p.pos.x, this.target.z - p.pos.z)
      if (d < 2.0) {
        const prompt = (e as unknown as { lastPrompt: { kind: string } | null }).lastPrompt
        if (prompt?.kind === "container") v.tap.add("interact")
        else this.stuck += dt * 2
        const c = e.world.containers.find((c) => Math.abs(c.x - this.target!.x) < 0.01 && Math.abs(c.z - this.target!.z) < 0.01)
        if (c?.opened) {
          this.stats.containers++
          this.stats.items = allItems(p.inventory).length
          this.target = null
        }
        return
      }
      this.moveTo(this.target, v, dt, d > 20)
    }
  }

  private fight(z: Zombie, d: number, v: NonNullable<Game["input"]["virtual"]>): void {
    const p = this.e.player
    if (!p.lockTarget || p.lockTarget.dead) v.tap.add("lockOn")
    // Face it by turning the camera behind the player toward the enemy
    const yawTo = Math.atan2(z.pos.x - p.pos.x, z.pos.z - p.pos.z)
    this.e.camera.yaw = yawTo + Math.PI
    const ws = p.weaponStats
    const ranged = !!ws?.ranged
    const reach = ranged ? 18 : (ws?.range ?? 1.6) + 0.2
    // Dodge a telegraphed attack when close
    if (z.state === "attack" && d < 3.2 && this.dodgeCooldown <= 0 && p.stamina > 30) {
      v.move.x = 1
      v.tap.add("dodge")
      this.dodgeCooldown = 1.6
      this.stats.dodges++
      return
    }
    if (ranged) {
      // Bow: hold the attack to draw, release to shoot; back away when they get close
      if (d < 4) {
        v.move.y = -1
      }
      if (d <= reach) {
        this.drawTimer += 1 / 30
        if (this.drawTimer < 0.9) v.held.add("attack")
        else this.drawTimer = -0.3
      } else v.move.y = 1
      return
    }
    if (d > reach) {
      v.move.y = 1
      if (d > 4) v.held.add("sprint")
      return
    }
    if (this.attackTimer <= 0 && p.stamina > 15) {
      v.tap.add(Math.random() < 0.25 ? "heavy" : "attack")
      this.attackTimer = 0.35
    } else if (p.stamina <= 15 && p.shield && this.blockTimer < 1.2) {
      v.held.add("block")
      this.blockTimer += 1 / 30
      this.stats.blocks++
    } else if (this.blockTimer >= 1.2) {
      // step back to regain stamina instead of holding the shield forever
      v.move.y = -1
      this.blockTimer += 1 / 30
      if (this.blockTimer > 2.5) this.blockTimer = 0
    }
  }

  private moveTo(target: { x: number; z: number }, v: NonNullable<Game["input"]["virtual"]>, dt: number, sprint: boolean): void {
    const e = this.e
    const p = e.player
    this.pathTimer -= dt
    if (!this.path || this.pathTimer <= 0) {
      this.pathTimer = 2
      this.path = e.world.nav.findPath(p.pos.x, p.pos.z, target.x, target.z, 120000)
    }
    let wp: [number, number] = [target.x, target.z]
    if (this.path && this.path.length) {
      wp = this.path[0]
      if (Math.hypot(wp[0] - p.pos.x, wp[1] - p.pos.z) < 1.0) this.path.shift()
    }
    const yawTo = Math.atan2(wp[0] - p.pos.x, wp[1] - p.pos.z)
    e.camera.yaw = yawTo + Math.PI
    v.move.y = 1
    if (sprint && p.stamina > 25) v.held.add("sprint")
    // Stuck detection
    const moved = Math.hypot(p.pos.x - this.lastPos.x, p.pos.z - this.lastPos.z)
    this.lastPos = { x: p.pos.x, z: p.pos.z }
    if (moved < 0.02 * Math.max(1, dt * 60)) this.stuck += dt
    else this.stuck = Math.max(0, this.stuck - dt * 0.5)
    if (this.stuck > 1.5 && this.stuck < 1.6) {
      v.tap.add("jump")
      v.move.x = Math.random() < 0.5 ? 1 : -1
    }
    void angleDelta
  }

  finish(outcome: BotStats["outcome"]): void {
    if (this.done) return
    this.done = true
    this.stats.outcome = outcome
    this.stats.items = allItems(this.e.player.inventory).length
    this.game.input.virtual = null
  }
}
