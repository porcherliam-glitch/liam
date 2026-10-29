import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { GoreSystem } from "./gore"
import { roleName, SurvivorManager, type SurvivorHost, type SurvivorSpot } from "./survivors"
import { headlessWorld } from "./testWorld"
import { InfectedManager } from "./zombies"

function setup(spots: SurvivorSpot[]) {
  const world = headlessWorld([{ minX: 10, maxX: 14, minZ: -4, maxZ: 4, height: 3 }], { minX: -60, maxX: 60, minZ: -60, maxZ: 60 })
  const gore = new GoreSystem(new THREE.Scene(), world.collision, "normal")
  const infected = new InfectedManager(world.group, world, { difficulty: "normal", seed: 5, gore, events: { died() {} } })
  const said: string[] = [], shots: number[] = [], noises: number[] = []
  let seed = 1
  const host: SurvivorHost = {
    world, infected: () => infected, tracer: () => shots.push(1), sfx: () => {}, noise: (_at, r) => noises.push(r), say: t => said.push(t),
    rng: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 },
  }
  const mgr = new SurvivorManager(world.group, host, spots)
  return { infected, mgr, said, shots, noises }
}

describe("survivors", () => {
  it("a lost survivor calls out, joins and follows the player", () => {
    const { mgr, said } = setup([{ role: "lost", look: "survivor", x: 0, z: 0 }])
    const s = mgr.list[0]
    expect(s.state).toBe("hide")
    const player = new THREE.Vector3(0, 0, 12)
    mgr.update(1 / 60, player, true)
    expect(said.some(t => t.includes(s.name))).toBe(true)
    mgr.follow(s)
    expect(s.state).toBe("follow")
    expect(mgr.followers()).toHaveLength(1)
    player.set(0, 0, 30)
    for (let i = 0; i < 60 * 10; i++) mgr.update(1 / 60, player, true)
    expect(Math.hypot(s.position.x - player.x, s.position.z - player.z)).toBeLessThan(4)
    // told to wait: stays put
    mgr.follow(s)
    expect(s.state).toBe("wait")
    const at = s.position.clone()
    player.set(0, 0, -20)
    for (let i = 0; i < 120; i++) mgr.update(1 / 60, player, true)
    expect(s.position.distanceTo(at)).toBeLessThan(0.5)
  })

  it("a wounded survivor needs patching up before following", () => {
    const { mgr } = setup([{ role: "wounded", look: "drifter", x: 0, z: 0 }])
    const s = mgr.list[0]
    expect(s.state).toBe("wounded")
    expect(s.model.unarmed).toBe(true)
    mgr.patchUp(s)
    expect(s.state).toBe("follow")
    expect(s.health).toBeGreaterThanOrEqual(s.maxHealth * 0.7)
  })

  it("infected bite a wounded survivor who cannot run to death", () => {
    const { mgr, infected } = setup([{ role: "wounded", look: "medic", x: 0, z: 0 }])
    const s = mgr.list[0]
    infected.spawn("walker", 0.6, 0.3, { state: "idle" })
    infected.spawn("walker", -0.5, 0.4, { state: "idle" })
    for (let i = 0; i < 60 * 10 && s.state !== "dead"; i++) mgr.update(1 / 60, new THREE.Vector3(30, 0, 30), true)
    expect(s.state).toBe("dead")
  })

  it("a fleeing survivor runs from infected and shouts, drawing them in", () => {
    const { mgr, infected, noises } = setup([{ role: "lost", look: "survivor", x: 0, z: 0 }])
    infected.spawn("walker", 3, 0, { state: "idle" })
    const s = mgr.list[0]
    for (let i = 0; i < 60; i++) mgr.update(1 / 60, new THREE.Vector3(40, 0, 40), true)
    expect(s.position.x).toBeLessThan(-1)
    expect(noises).toContain(14)
  })

  it("the armed camp guard shoots infected that come close", () => {
    const { mgr, infected, shots } = setup([{ role: "guard", look: "survivor", x: 0, z: 0, yaw: 0 }])
    const z = infected.spawn("walker", 0, -10, { state: "idle" })!
    const hp = z.health
    for (let i = 0; i < 60 * 4; i++) mgr.update(1 / 60, new THREE.Vector3(0, 0, 8), true)
    expect(shots.length).toBeGreaterThan(0)
    expect(z.health < hp || !z.alive).toBe(true)
  })

  it("rescued residents stroll around their home in the base, unarmed", () => {
    const { mgr } = setup([{ role: "resident", look: "survivor", x: 0, z: 0 }])
    const s = mgr.list[0]
    expect(s.model.unarmed).toBe(true)
    expect(roleName(s)).toBe(s.female ? "Bewohnerin" : "Bewohner")
    let moved = 0, far = 0
    const last = s.position.clone()
    for (let i = 0; i < 60 * 40; i++) {
      mgr.update(1 / 60, new THREE.Vector3(0, 0, 20), true)
      moved += s.position.distanceTo(last); last.copy(s.position)
      far = Math.max(far, Math.hypot(s.position.x, s.position.z))
    }
    expect(moved).toBeGreaterThan(3)
    expect(far).toBeLessThan(11)
    expect(s.state).toBe("idle")
  })
})
