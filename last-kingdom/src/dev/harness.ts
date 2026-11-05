// Test hooks for the Playwright verification scripts. Exposed as window.__lastKingdom.

import type { Game } from "../game/game"
import { createItem } from "../items/items"
import { addItem } from "../items/inventory"
import { zombieType } from "../entities/zombieTypes"
import { Zombie } from "../entities/zombie"
import type { WeatherKind } from "../render/weather"

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
    killAll() {
      const e = game.expedition
      if (!e) return
      for (const z of e.zombies) if (!z.dead) z.takeHit(99999, false, 1, true, e.player.pos.x, e.player.pos.z)
    },
    give(id: string, qty = 1) {
      const p = game.profile
      if (!p) return
      addItem(p.loadout, createItem(id, qty))
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
    godMode(on: boolean) {
      const e = game.expedition
      if (!e) return
      const p = e.player
      if (on) {
        const orig = p.takeDamage.bind(p)
        ;(p as unknown as { _origTake: typeof orig })._origTake = orig
        p.takeDamage = () => false
      } else {
        const o = (p as unknown as { _origTake?: typeof p.takeDamage })._origTake
        if (o) p.takeDamage = o
      }
    },
  }
  ;(window as unknown as { __lastKingdom: typeof api }).__lastKingdom = api
}
