import { beforeEach, describe, expect, it } from "vitest"
import { collides, depenetrate, moveCircle, raycastObstacles, rayCapsule, raySphere, segmentBlocked2D, segmentBlocked3D, type Obstacle } from "./collision"
import { CONTRACTS, ITEMS, MISSIONS, WEAPONS } from "./data"
import { GRENADE_FUSE, stepGrenade } from "./grenades"
import { rollBody, rollCrate } from "./loot"
import { NavGrid } from "./nav"
import { AMMO_CARRY, Company, createProfile } from "./profile"
import { headingOf, mulberry32, pickContract, wrapDegrees } from "./raid"
import { DEFAULT_SETTINGS, LEGACY_PROFILE_KEY, PROFILE_KEY, loadProfile, loadSettings, sanitizeProfile, sanitizeSettings, SETTINGS_KEY } from "./storage"
import { WeaponRuntime, coneOffset, damageAt } from "./weapons"

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null }
  setItem(k: string, v: string) { this.data.set(k, String(v)) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
}
beforeEach(() => { (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage() })

const box = (minX: number, maxX: number, minZ: number, maxZ: number, height = 3, minY = 0): Obstacle => ({ minX, maxX, minZ, maxZ, height, minY })

describe("collision", () => {
  const walls = [box(-1, 1, -1, 1)]
  it("detects circle overlap including corners", () => {
    expect(collides(0, 0, 0.3, walls)).toBe(true)
    expect(collides(1.2, 0, 0.3, walls)).toBe(true)
    expect(collides(1.4, 0, 0.3, walls)).toBe(false)
    expect(collides(1.25, 1.25, 0.3, walls)).toBe(false) // corner distance 0.354 > 0.3
  })
  it("slides along walls instead of stopping", () => {
    const out = { x: 0, z: 0 }
    moveCircle(-3, 0.5, 4, 1, 0.4, walls, out)
    expect(collides(out.x, out.z, 0.4, walls)).toBe(false)
    expect(out.z).toBeCloseTo(1.5, 5)
    expect(out.x).toBeGreaterThan(-1.6)
  })
  it("does not tunnel through thin walls", () => {
    const thin = [box(-0.05, 0.05, -10, 10)]
    const out = { x: 0, z: 0 }
    moveCircle(-2, 0, 10, 0, 0.38, thin, out)
    expect(out.x).toBeLessThan(0)
  })
  it("pushes a point out of a box", () => {
    const p = { x: 0.2, z: 0 }
    expect(depenetrate(p, 0.4, walls)).toBe(true)
    expect(collides(p.x, p.z, 0.4, walls)).toBe(false)
  })
  it("ignores overhead boxes for movement but not for bullets", () => {
    const roof = [box(-5, 5, -5, 5, 3.2, 2.8)]
    expect(collides(0, 0, 0.4, roof)).toBe(false)
    expect(raycastObstacles({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1, z: 0 }, 10, roof)?.distance).toBeCloseTo(1.2, 5)
  })
  it("raycasts with distance and face normal", () => {
    const hit = raycastObstacles({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 50, walls)!
    expect(hit.distance).toBeCloseTo(4, 5)
    expect(hit.normal).toEqual({ x: -1, y: 0, z: 0 })
    expect(raycastObstacles({ x: -5, y: 4, z: 0 }, { x: 1, y: 0, z: 0 }, 50, walls)).toBeNull()
  })
  it("low cover hides a crouched player but not a standing one", () => {
    const cover = [box(-0.3, 0.3, -2, 2, 1.1)]
    const eye = { x: -10, y: 1.6, z: 0 }
    expect(segmentBlocked3D(eye, { x: 1, y: 0.95, z: 0 }, cover)).toBe(true)
    expect(segmentBlocked3D(eye, { x: 1, y: 1.55, z: 0 }, cover)).toBe(false)
    expect(segmentBlocked2D(-10, 0, 1, 0, cover)).toBe(true)
    expect(segmentBlocked2D(-10, 0, 1, 0, cover, 1.5)).toBe(false)
  })
  it("hits spheres and capsules", () => {
    expect(raySphere({ x: 0, y: 1.6, z: 5 }, { x: 0, y: 0, z: -1 }, 0, 1.6, 0, 0.2, 10)).toBeCloseTo(4.8, 5)
    expect(rayCapsule({ x: 0, y: 1, z: 5 }, { x: 0, y: 0, z: -1 }, 0, 0, 0.4, 1.4, 0.3, 10)).toBeCloseTo(4.7, 5)
    expect(rayCapsule({ x: 0, y: 3, z: 5 }, { x: 0, y: 0, z: -1 }, 0, 0, 0.4, 1.4, 0.3, 10)).toBeNull()
  })
})

describe("nav grid", () => {
  // a wall from z=-10..8 at x=0 with a gap at the top end
  const obstacles = [box(-0.5, 0.5, -10, 8)]
  const nav = new NavGrid({ minX: -15, maxX: 15, minZ: -15, maxZ: 15 }, obstacles, 0.45, 1)
  it("marks blocked cells", () => {
    expect(nav.walkable(0, 0)).toBe(false)
    expect(nav.walkable(-5, 0)).toBe(true)
  })
  it("finds a path around the wall", () => {
    const path = nav.findPath(-5, 0, 5, 0)!
    expect(path).not.toBeNull()
    expect(path[path.length - 1].x).toBeCloseTo(5.5, 0)
    // the path must go around the end of the wall (z > 8)
    expect(path.some(p => p.z > 8)).toBe(true)
    // every straight segment is walkable
    let ax = -5, az = 0
    for (const p of path) { expect(nav.lineWalkable(ax, az, p.x, p.z) || !nav.walkable(ax, az)).toBe(true); ax = p.x; az = p.z }
  })
  it("returns null for enclosed targets", () => {
    const boxed = [box(3, 4, -4, 4), box(8, 9, -4, 4), box(3, 9, -4, -3), box(3, 9, 3, 4)]
    const g = new NavGrid({ minX: -15, maxX: 15, minZ: -15, maxZ: 15 }, boxed, 0.45, 1)
    expect(g.findPath(-5, 0, 6, 0)).toBeNull()
    expect(g.reachable(-5, 0, -10, 10)).toBe(true)
  })
  it("snaps start and goal to nearest walkable cells", () => {
    expect(nav.nearestWalkable(0, 0)).not.toBeNull()
    expect(nav.walkable(nav.nearestWalkable(0, 0)!.x, nav.nearestWalkable(0, 0)!.z)).toBe(true)
  })
})

describe("weapons", () => {
  it("fires automatic weapons while held at the fire rate", () => {
    const w = new WeaponRuntime("mk4", 60)
    let shots = 0
    for (let i = 0; i < 60; i++) { if (w.trigger(i === 0, true) === "fired") shots++; w.update(1 / 60) }
    expect(shots).toBe(10) // 1 s at 0.1 s per shot
    const smg = new WeaponRuntime("vx9", 200)
    let smgShots = 0
    for (let i = 0; i < 120; i++) { if (smg.trigger(i === 0, true) === "fired") smgShots++; smg.update(1 / 60) }
    expect(smgShots).toBeGreaterThanOrEqual(29) // 2 s / 0.068 s ≈ 29.4 — no rounding up to whole frames
    expect(w.mag).toBe(20)
  })
  it("semi-auto weapons fire once per click and buffer early clicks", () => {
    const w = new WeaponRuntime("p9", 0)
    expect(w.trigger(true, true)).toBe("fired")
    w.update(0.05)
    expect(w.trigger(true, true)).toBe("blocked") // still cooling down…
    let shots = 0
    for (let i = 0; i < 12; i++) { if (w.trigger(false, true) === "fired") shots++; w.update(1 / 60) }
    expect(shots).toBe(1) // …but the buffered click fires afterwards
    for (let i = 0; i < 30; i++) { if (w.trigger(false, true) === "fired") shots++; w.update(1 / 60) }
    expect(shots).toBe(1) // holding the trigger does not refire
  })
  it("reloads from reserve and keeps the remainder", () => {
    const w = new WeaponRuntime("mk4", 40)
    w.mag = 5
    expect(w.startReload()).toBe(true)
    for (let i = 0; i < 200 && w.reloading; i++) w.update(1 / 60)
    expect(w.mag).toBe(30)
    expect(w.reserve).toBe(15)
  })
  it("sidearm has an infinite reserve", () => {
    const w = new WeaponRuntime("p9", 0)
    w.mag = 0
    expect(w.startReload()).toBe(true)
    for (let i = 0; i < 200 && w.reloading; i++) w.update(1 / 60)
    expect(w.mag).toBe(15)
    expect(w.infinite).toBe(true)
  })
  it("shotgun loads shell by shell and can interrupt by firing", () => {
    const w = new WeaponRuntime("kv12", 12)
    w.mag = 2
    w.startReload()
    for (let i = 0; i < 40; i++) w.update(1 / 60) // ~0.66 s → one shell
    expect(w.mag).toBe(3)
    expect(w.reloading).toBe(true)
    expect(w.trigger(true, true)).toBe("fired")
    expect(w.reloading).toBe(false)
  })
  it("reports empty magazines", () => {
    const w = new WeaponRuntime("mk4", 0)
    w.mag = 0
    expect(w.trigger(true, true)).toBe("empty")
    expect(w.canReload).toBe(false)
  })
  it("spread grows with movement and shrinks when aiming or crouched", () => {
    const w = new WeaponRuntime("mk4", 0)
    expect(w.spread(1, 0, false)).toBeLessThan(w.spread(0, 0, false))
    expect(w.spread(0, 1, false)).toBeGreaterThan(w.spread(0, 0, false))
    expect(w.spread(0, 0, true)).toBeLessThan(w.spread(0, 0, false))
  })
  it("applies range falloff and hit zones", () => {
    const d = WEAPONS.mk4
    expect(damageAt(d, 10, "body")).toBe(30)
    expect(damageAt(d, 10, "head")).toBe(60)
    expect(damageAt(d, 200, "body")).toBeCloseTo(30 * d.minDamageFactor, 5)
    expect(damageAt(d, 10, "limb")).toBeLessThan(30)
  })
  it("cone offsets stay inside the cone", () => {
    const rng = mulberry32(5), out = { x: 0, y: 0 }
    for (let i = 0; i < 200; i++) { coneOffset(0.05, rng, out); expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(0.05 + 1e-9) }
  })
})

describe("company", () => {
  it("buys supplies and weapons with level gates", () => {
    const c = new Company(createProfile())
    expect(c.buy("ammo").ok).toBe(true)
    expect(c.profile.money).toBe(1800 - ITEMS.ammo.value)
    expect(c.buy("plate").ok).toBe(false)
    expect(c.buyWeapon("vx9").ok).toBe(false)
    c.profile.level = 2
    expect(c.buyWeapon("vx9").ok).toBe(true)
    expect(c.profile.loadout.primary).toBe("vx9")
    expect(c.buyWeapon("kv12").ok).toBe(false) // not enough money left
  })
  it("equips and unequips the loadout", () => {
    const c = new Company(createProfile())
    expect(c.equip("armor").ok).toBe(true)
    expect(c.profile.loadout.armor).toBe(55)
    expect(c.equip("armor").ok).toBe(false)
    expect(c.unequip("armor").ok).toBe(true)
    expect(c.profile.stash.armor).toBe(1)
    expect(c.equip("medkit").ok).toBe(true)
    expect(c.profile.loadout.medkits).toBe(2)
  })
  it("settles a successful raid: loot, rewards, carried kit and ammo return", () => {
    const c = new Company(createProfile())
    c.equip("armor")
    const kit = c.beginRaid()
    expect(kit.ammoPacks).toBe(Math.min(AMMO_CARRY, 6))
    expect(c.profile.stash.ammo).toBe(0)
    expect(c.profile.loadout.armor).toBe(0)
    const s = c.finishRaid(kit, { mission: "greyzone", success: true, loot: { parts: 2, intel: 1 }, kills: 3, headshots: 1, roundsLeft: 45, medkitsLeft: 1, grenadesLeft: 0, armorLeft: 30, contract: { id: "headhunter", progress: 3, target: 3, done: true, failed: false }, difficulty: "normal" })
    expect(s.reward).toBe(MISSIONS.greyzone.reward)
    expect(s.contractReward).toBe(CONTRACTS.headhunter.reward)
    expect(s.value).toBe(2 * ITEMS.parts.value + ITEMS.intel.value)
    expect(s.ammoReturned).toBe(2)
    expect(c.profile.stash.parts).toBe(2)
    expect(c.profile.loadout.armor).toBe(30)
    expect(c.profile.loadout.armorMax).toBe(55)
    expect(c.profile.loadout.medkits).toBe(1)
    expect(c.profile.stats.extracts).toBe(1)
    expect(c.profile.tutorialDone).toBe(true)
  })
  it("loses carried kit on failure and recovers half the ammo", () => {
    const c = new Company(createProfile())
    c.equip("armor")
    const kit = c.beginRaid()
    c.finishRaid(kit, { mission: "greyzone", success: false, loot: { relic: 1 }, kills: 1, headshots: 0, roundsLeft: 120, medkitsLeft: 1, grenadesLeft: 0, armorLeft: 40, contract: null, difficulty: "normal" })
    expect(c.profile.stash.relic).toBe(0)
    expect(c.profile.loadout.armor).toBe(0)
    expect(c.profile.loadout.medkits).toBe(0)
    expect(c.profile.stash.ammo).toBe(2) // 4 packs left → half
    expect(c.profile.stats.deaths).toBe(1)
  })
  it("produces offline, capped at two hours", () => {
    const p = createProfile(0)
    p.buildings.workshop = 1; p.staff.workshop = 1
    const c = new Company(p)
    c.tick(10 * 3600 * 1000)
    expect(p.stash.ammo).toBe(6 + Math.floor(7200 / 45))
  })
  it("research needs lab level and staff; more analysts are faster", () => {
    const c = new Company(createProfile())
    c.profile.money = 10000; c.profile.resources = 500
    expect(c.startResearch("ballistics").ok).toBe(false)
    c.profile.buildings.lab = 1; c.profile.staff.lab = 1
    expect(c.startResearch("broker").ok).toBe(false)
    const before = Date.now()
    expect(c.startResearch("ballistics").ok).toBe(true)
    expect(c.profile.activeResearch!.endsAt - before).toBeGreaterThanOrEqual(35000 - 50)
  })
  it("levels up with XP and pays a bonus", () => {
    const c = new Company(createProfile())
    expect(c.addXp(700)).toBe(true)
    expect(c.profile.level).toBe(2)
    expect(c.profile.money).toBe(2050)
  })
})

describe("storage", () => {
  it("migrates a v2 profile and keeps progress", () => {
    const v2 = { version: 2, callsign: "ALT", money: 4321, resources: 77, xp: 10, level: 3, stash: { ammo: 4, medkit: 2, armor: 1, parts: 5, intel: 0, electronics: 1, medical: 0, relic: 0 }, buildings: { hq: 2, workshop: 1, lab: 1, clinic: 0 }, staff: { workshop: 1, lab: 1, clinic: 0 }, production: { workshop: 3, clinic: 0 }, research: ["ballistics"], activeResearch: null, loadout: { armor: 55, medkits: 2 }, stats: { raids: 4, extracts: 3, kills: 9, earned: 5000, deaths: 1 }, lastTick: 1000 }
    localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(v2))
    const p = loadProfile()!
    expect(p.version).toBe(3)
    expect(p.money).toBe(4321)
    expect(p.stash.parts).toBe(5)
    expect(p.stash.plate).toBe(0)
    expect(p.weapons).toEqual(["p9", "mk4"])
    expect(p.loadout).toEqual({ primary: "mk4", armor: 55, armorMax: 55, medkits: 2, grenades: 0 })
    expect(p.tutorialDone).toBe(true)
    expect(localStorage.getItem(PROFILE_KEY)).not.toBeNull()
  })
  it("rejects garbage and repairs out-of-range values", () => {
    expect(sanitizeProfile(null)).toBeNull()
    expect(sanitizeProfile({ version: 9 })).toBeNull()
    localStorage.setItem(PROFILE_KEY, "{not json")
    expect(loadProfile()).toBeNull()
    const p = sanitizeProfile({ ...createProfile(), money: -50, weapons: ["mk4", "laser"], loadout: { primary: "dr7", armor: 999, armorMax: 55, medkits: 9, grenades: -1 } })!
    expect(p.money).toBe(0)
    expect(p.weapons).toEqual(["mk4", "p9"])
    expect(p.loadout.primary).toBe("mk4")
    expect(p.loadout.armor).toBe(55)
    expect(p.loadout.medkits).toBe(3)
    expect(p.loadout.grenades).toBe(0)
  })
  it("sanitizes settings and keeps new fields defaulted", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sensitivity: 9, volume: 0.3, muted: true, quality: "low", invertY: false }))
    const s = loadSettings()
    expect(s.sensitivity).toBe(1.8)
    expect(s.volume).toBe(0.3)
    expect(s.fov).toBe(DEFAULT_SETTINGS.fov)
    expect(s.difficulty).toBe("normal")
    expect(sanitizeSettings({ difficulty: "hard", fov: 200 } as never).fov).toBe(100)
  })
})

describe("grenades", () => {
  it("falls, bounces and comes to rest", () => {
    const g = { p: { x: 0, y: 1.5, z: 0 }, v: { x: 6, y: 3, z: 0 }, fuse: GRENADE_FUSE, bounced: false }
    let bounces = 0
    for (let i = 0; i < 60 * 4; i++) if (stepGrenade(g, 1 / 60, [])) bounces++
    expect(bounces).toBeGreaterThan(0)
    expect(g.p.y).toBeLessThan(0.1)
    expect(Math.hypot(g.v.x, g.v.z)).toBeLessThan(0.5)
  })
  it("bounces off walls instead of passing through", () => {
    const g = { p: { x: 0, y: 1, z: 0 }, v: { x: 12, y: 0, z: 0 }, fuse: GRENADE_FUSE, bounced: false }
    for (let i = 0; i < 60; i++) stepGrenade(g, 1 / 60, [box(2, 2.4, -5, 5, 3)])
    expect(g.p.x).toBeLessThan(2)
  })
})

describe("loot and contracts", () => {
  it("crate contents are valid and better at higher tiers", () => {
    const rng = mulberry32(42)
    let low = 0, high = 0
    for (let i = 0; i < 300; i++) {
      for (const s of rollCrate(0, rng)) { expect(s.id in ITEMS).toBe(true); if (ITEMS[s.id].kind === "loot") low += ITEMS[s.id].value * s.qty }
      for (const s of rollCrate(2, rng)) if (ITEMS[s.id].kind === "loot") high += ITEMS[s.id].value * s.qty
    }
    expect(high).toBeGreaterThan(low * 1.5)
  })
  it("bodies drop sensible items", () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 100; i++) for (const s of rollBody("heavy", 2, rng)) expect(s.qty).toBeGreaterThan(0)
  })
  it("never picks a heavy-only contract without heavies", () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 200; i++) expect(pickContract("greyzone", rng)).not.toBe("heavy")
  })
  it("compass math", () => {
    expect(headingOf(0, -1)).toBeCloseTo(0)
    expect(headingOf(1, 0)).toBeCloseTo(90)
    expect(headingOf(0, 1)).toBeCloseTo(180)
    expect(headingOf(-1, 0)).toBeCloseTo(270)
    expect(wrapDegrees(350)).toBeCloseTo(-10)
    expect(wrapDegrees(-190)).toBeCloseTo(170)
  })
})
