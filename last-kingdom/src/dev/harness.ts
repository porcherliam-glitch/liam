// Test hooks for the Playwright verification scripts. Exposed as window.__lastKingdom.

import type { Game } from "../game/game"
import { createItem } from "../items/items"
import { addItem, equip } from "../items/inventory"
import { zombieType } from "../entities/zombieTypes"
import { Zombie } from "../entities/zombie"
import type { WeatherKind } from "../render/weather"
import { Bot } from "./bot"
import { AREAS } from "../world/areas"

export function installHarness(game: Game): void {
  const api = {
    game,
    snapshot() {
      const e = game.expedition
      const p = game.profile
      return {
        state: game.state,
        screen: game.ui.top?.name ?? null,
        screens: game.ui.depth,
        device: game.input.device,
        profile: p ? { name: p.name, level: p.level, xp: p.xp, gold: p.gold, slot: p.slot, skills: p.skills, camp: p.camp, unlocked: p.unlockedAreas, missions: p.missions.map((m) => ({ id: m.id, kind: m.kind, status: m.status, progress: m.progress, goal: m.goal, area: m.areaId })), bag: p.loadout.slots.filter(Boolean).map((s) => `${s!.defId}x${s!.qty}`), equipment: Object.fromEntries(Object.entries(p.loadout.equipment).map(([k, v]) => [k, v?.defId ?? null])), stash: p.stash.filter(Boolean).length, stats: p.stats } : null,
        expedition: e
          ? {
              area: e.areaId,
              elapsed: e.elapsed,
              kills: e.kills,
              runGold: e.runGold,
              runXp: e.runXp,
              player: { x: e.player.pos.x, y: e.player.pos.y, z: e.player.pos.z, hp: e.player.hp, maxHp: e.player.maxHp, stamina: e.player.stamina, state: e.player.state, dead: e.player.dead, yaw: e.player.yaw, weight: e.player.weight },
              zombies: e.zombies.filter((z) => !z.dead).length,
              zombiesTotal: e.zombies.length,
              alerted: e.zombies.filter((z) => !z.dead && z.alerted).length,
              containers: e.world.containers.length,
              containersOpened: e.world.containers.filter((c) => c.opened).length,
              extractions: e.world.extractions.map((x) => ({ id: x.def.id, active: x.active, x: x.x, z: x.z })),
              hour: e.sky.hour,
              weather: e.weather.kind,
              pois: e.visitedCount,
              drawCalls: game.renderer.info.render.calls,
              triangles: game.renderer.info.render.triangles,
            }
          : null,
      }
    },
    profile: () => game.profile,
    areas: () => AREAS.map((a) => ({ id: a.id, name: a.name, unlockLevel: a.unlockLevel, danger: a.danger })),
    /** Teleports the player. */
    teleport(x: number, z: number) {
      const e = game.expedition
      if (!e) return
      e.player.pos.set(x, e.world.terrain.heightAt(x, z), z)
    },
    /** Moves the player next to a world object. */
    nearestContainer() {
      const e = game.expedition
      if (!e) return null
      const p = e.player.pos
      let best = null as null | { x: number; z: number; id: string; kind: string }
      let bd = Infinity
      for (const c of e.world.containers) {
        if (c.opened) continue
        const d = Math.hypot(c.x - p.x, c.z - p.z)
        if (d < bd) {
          bd = d
          best = { x: c.x, z: c.z, id: c.id, kind: c.kind }
        }
      }
      return best
    },
    spawnZombie(typeId: string, dx = 3, dz = 0) {
      const e = game.expedition
      if (!e) return
      const z = new Zombie(zombieType(typeId), e.player.pos.x + dx, e.player.pos.z + dz, 123)
      z.bind((e as unknown as { ctx: Parameters<Zombie["bind"]>[0] }).ctx)
      e.zombies.push(z)
      z.onNoise(e.player.pos.x, e.player.pos.z, 100)
    },
    /** Spawns every enemy type frozen in two rows in front of the player and aims the camera at them. */
    lineup() {
      const e = game.expedition
      if (!e) return
      const ctx = (e as unknown as { ctx: Parameters<Zombie["bind"]>[0] }).ctx
      const types = ["walker", "walker_villager", "walker_monk", "walker_soldier", "sprinter", "sprinter_hound", "brute", "brute_butcher", "knight", "knight_captain", "boss_elder", "boss_huntsman", "boss_castellan", "boss_gravedigger", "boss_abbot", "boss_bonelord", "boss_queen", "boss_marshal"]
      const p = e.player
      p.yaw = 0
      for (let i = 0; i < types.length; i++) {
        const row = i < 10 ? 0 : 1
        const col = row === 0 ? i : i - 10
        const count = row === 0 ? 10 : 8
        const x = p.pos.x + (col - (count - 1) / 2) * 1.7
        const zz = p.pos.z + 4.5 + row * 3.2
        const z = new Zombie(zombieType(types[i]), x, zz, 500 + i)
        z.bind(ctx)
        z.yaw = Math.PI
        z.frozen = true
        e.zombies.push(z)
      }
      e.camera.yaw = Math.PI
      e.camera.pitch = 0.22
      e.camera.targetDistance = e.camera.distance = 9
      e.camera.sideOffset = 0
    },
    killAll() {
      const e = game.expedition
      if (!e) return
      for (const z of e.zombies) if (!z.dead) z.takeHit(99999, false, 1, true, e.player.pos.x, e.player.pos.z)
    },
    give(id: string, qty = 1) {
      const p = game.profile
      if (!p) return
      // createItem clamps to one stack, so hand over stack by stack
      let left = qty
      while (left > 0) {
        const it = createItem(id, left)
        left -= it.qty
        addItem(p.loadout, it)
      }
    },
    /** Gives one item and equips it into its natural slot (or a given quick slot). */
    equipItem(id: string, slot?: "quick1" | "quick2" | "quick3" | "quick4") {
      const p = game.profile
      if (!p) return false
      const it = createItem(id, 1)
      if (addItem(p.loadout, it) > 0) return false
      // addItem merges stackables into an existing stack, so look the item up by id rather than by uid
      const inBag = p.loadout.slots.find((s) => s?.uid === it.uid) ?? p.loadout.slots.find((s) => s?.defId === id)
      if (!inBag) return false
      const r = equip(p.loadout, inBag.uid, slot)
      return r.ok
    },
    setHour(h: number) {
      if (game.expedition) game.expedition.sky.hour = h
    },
    setWeather(k: WeatherKind) {
      if (game.expedition) {
        game.expedition.weather.setKind(k)
        game.expedition.weather.locked = true
      }
    },
    setMaxFrame(v: number) {
      game.maxFrame = v
    },
    /** Starts the automated player on the running expedition. */
    startBot(opts: { lootGoal?: number; maxSeconds?: number } = {}) {
      const e = game.expedition
      if (!e) return null
      const bot = new Bot(game, e, opts)
      api.bot = bot
      const orig = e.update.bind(e)
      e.update = (dt: number) => {
        if (api.bot === bot && !bot.done) bot.update(dt)
        orig(dt)
      }
      return true
    },
    bot: null as Bot | null,
    botStats() {
      return api.bot ? { ...api.bot.stats, done: api.bot.done } : null
    },
    godMode(on: boolean) {
      const e = game.expedition
      if (!e) return
      const p = e.player
      const anyP = p as unknown as Record<string, unknown>
      if (on) {
        anyP._origTake = p.takeDamage
        anyP._origApply = anyP.applyDamage
        p.takeDamage = () => false
        anyP.applyDamage = () => undefined
        p.hp = p.maxHp
      } else {
        if (anyP._origTake) p.takeDamage = anyP._origTake as typeof p.takeDamage
        if (anyP._origApply) anyP.applyDamage = anyP._origApply
      }
    },
  }
  ;(window as unknown as { __lastKingdom: typeof api }).__lastKingdom = api
}
