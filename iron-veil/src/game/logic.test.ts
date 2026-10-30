import * as THREE from "three"
import { beforeEach, describe, expect, it } from "vitest"
import { Bag } from "./bag"
import { collides, depenetrate, moveCircle, raycastObstacles, rayCapsule, raySphere, segmentBlocked2D, segmentBlocked3D, type Obstacle } from "./collision"
import { xpForLevel } from "./data"
import { DECOY_BEEP, DECOY_LIFE, GRENADE_FUSE, GrenadeSystem, SMOKE_BURN, stepGrenade, type ThrowableKind } from "./grenades"
import { Obscurants, SMOKE_GROW, SMOKE_LIFE } from "./obscurants"
import { TRAP_ARM, TRAP_CHARGES, TRAP_DAMAGE, TRAP_RADIUS, TRAP_RECHARGE, TRAP_TRIGGER, TrapField, zapDamage } from "./traps"
import { ITEMS, ITEM_IDS, sellPrice } from "./items"
import { bagValue, rollAirdrop, rollContainer, rollInfectedBody, rollMercBody } from "./loot"
import { NavGrid } from "./nav"
import { Company, createProfile, type RaidStats } from "./profile"
import { ACHIEVEMENTS } from "./achievements"
import { headingOf, mulberry32, wrapDegrees } from "./raid"
import { DEFAULT_SETTINGS, LEGACY_KEYS, PROFILE_KEY, SETTINGS_KEY, loadProfile, loadSettings, sanitizeProfile, sanitizeSettings } from "./storage"
import { addBleed, applyUse, freshVitals, speedFactor, stepVitals } from "./survival"
import { WEAPONS, WEAPON_ORDER, canAttach, effectiveWeapon } from "./weaponData"
import { WeaponRuntime, coneOffset, damageAt, type AmmoSource } from "./weapons"

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null }
  setItem(k: string, v: string) { this.data.set(k, String(v)) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
}
beforeEach(() => { (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage() })
const emptyRaidStats = (): RaidStats => ({ kills: 0, infectedKills: 0, mercKills: 0, headshots: 0, dismembered: 0, killsByKind: {}, visited: [], activated: [], bossKilled: false })
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
  const run = (kind: ThrowableKind, seconds: number) => {
    const ev = { bounce: 0, explode: 0, ignite: 0, smoke: 0, smoking: 0, flash: 0, beep: 0 }
    const sys = new GrenadeSystem(new THREE.Group(), {
      bounce: () => ev.bounce++, explode: () => ev.explode++, ignite: () => ev.ignite++,
      smoke: () => ev.smoke++, smoking: () => ev.smoking++, flash: () => ev.flash++, beep: () => ev.beep++,
    })
    sys.throw({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, kind)
    for (let t = 0; t < seconds; t += 1 / 30) sys.update(1 / 30, () => [])
    return { ev, left: sys.count }
  }
  it("flashbang goes off once and is gone", () => {
    const { ev, left } = run("flashbang", 3)
    expect(ev.flash).toBe(1); expect(ev.explode).toBe(0); expect(left).toBe(0)
  })
  it("smoke canister starts once, hisses while it burns, then disappears", () => {
    const mid = run("smoke", 6)
    expect(mid.ev.smoke).toBe(1); expect(mid.ev.smoking).toBeGreaterThan(60); expect(mid.left).toBe(1)
    expect(run("smoke", SMOKE_BURN + 3).left).toBe(0)
  })
  it("decoy beeps for its whole life", () => {
    const { ev, left } = run("decoy", DECOY_LIFE + 3)
    expect(ev.beep).toBeGreaterThanOrEqual(Math.floor(DECOY_LIFE / DECOY_BEEP) - 1)
    expect(left).toBe(0)
  })
})

describe("achievements", () => {
  it("unlock from the profile stats once and persist through sanitizing", () => {
    const p = createProfile(1000), c = new Company(p)
    expect(c.unlockAchievements()).toEqual([])
    p.stats.infectedKills = 1; p.stats.extracts = 1
    const fresh = c.unlockAchievements()
    expect(fresh.map(a => a.id).sort()).toEqual(["first_blood", "first_extract"])
    expect(c.unlockAchievements()).toEqual([])
    p.stats.infectedKills = 100
    expect(c.unlockAchievements().map(a => a.id)).toEqual(["hundred"])
    const back = sanitizeProfile(JSON.parse(JSON.stringify({ ...p, achievements: [...p.achievements, "nonsense"] })), 1000)!
    expect(back.achievements.sort()).toEqual(["first_blood", "first_extract", "hundred"])
    expect(ACHIEVEMENTS.find(a => a.id === "hundred")!.progress!(back)).toEqual([100, 100])
  })
})

describe("shock traps", () => {
  const at = (x: number, z: number, y = 0) => ({ x, y, z })
  it("stays quiet while warming up, then fires when a hostile comes close", () => {
    const f = new TrapField(); f.place(0, 0, 0)
    expect(f.discharge([at(1, 0)])).toHaveLength(0)
    f.update(TRAP_ARM + 0.01)
    expect(f.discharge([at(TRAP_TRIGGER + 0.5, 0)])).toHaveLength(0)
    expect(f.discharge([at(1, 1)])).toHaveLength(1)
    // recharging: nothing until the coil is ready again
    expect(f.discharge([at(1, 1)])).toHaveLength(0)
    f.update(TRAP_RECHARGE + 0.01)
    expect(f.discharge([at(1, 1)])).toHaveLength(1)
  })
  it("ignores targets on another floor", () => {
    const f = new TrapField(); f.place(0, 0, 0); f.update(TRAP_ARM + 0.01)
    expect(f.discharge([at(1, 0, 3.5)])).toHaveLength(0)
  })
  it("is used up after its charges and then removed", () => {
    const f = new TrapField(); const t = f.place(0, 0, 0); f.update(TRAP_ARM + 0.01)
    let fired = 0
    for (let i = 0; i < 10; i++) { fired += f.discharge([at(0.5, 0)]).length; const gone = f.update(TRAP_RECHARGE + 0.01); if (gone.length) { expect(gone).toEqual([t.id]); break } }
    expect(fired).toBe(TRAP_CHARGES)
    expect(f.traps).toHaveLength(0)
  })
  it("hurts most next to the coil and nothing outside the radius", () => {
    const t = new TrapField().place(0, 0, 0)
    expect(zapDamage(t, at(0, 0))).toBeCloseTo(TRAP_DAMAGE)
    expect(zapDamage(t, at(TRAP_RADIUS, 0))).toBeCloseTo(TRAP_DAMAGE / 2)
    expect(zapDamage(t, at(TRAP_RADIUS + 0.1, 0))).toBe(0)
  })
})

describe("smoke", () => {
  it("blocks sight through the cloud once it has grown, never before or after", () => {
    const o = new Obscurants(), a = { x: -10, y: 1.6, z: 0 }, b = { x: 10, y: 1.6, z: 0 }
    o.add(0, 0)
    expect(o.blocks(a, b)).toBe(false)
    o.update(SMOKE_GROW)
    expect(o.blocks(a, b)).toBe(true)
    expect(o.blocks({ x: -10, y: 1.6, z: 9 }, { x: 10, y: 1.6, z: 9 })).toBe(false)
    expect(o.blocks({ x: -10, y: 8, z: 0 }, { x: 10, y: 8, z: 0 })).toBe(false)
    expect(o.inside({ x: 1, y: 1.6, z: 1 })).toBe(true)
    o.update(SMOKE_LIFE)
    expect(o.blocks(a, b)).toBe(false)
    expect(o.clouds.length).toBe(0)
  })
})


describe("weapons", () => {
  const source = (bag: Bag): AmmoSource => ({ count: id => bag.count(id), take: (id, n) => bag.remove(id, n), give: (id, n) => bag.add(id, n) })
  it("fires automatic weapons while held at the fire rate", () => {
    const bag = new Bag(8, [{ id: "ammo_556", qty: 60 }]), src = source(bag)
    const w = new WeaponRuntime("mk4", {}, "ammo_556"); w.load(src)
    expect(w.mag).toBe(30); expect(bag.count("ammo_556")).toBe(30)
    let shots = 0
    for (let i = 0; i < 60; i++) { w.update(1 / 60, src); if (w.trigger(i === 0, true) === "fired") shots++ }
    expect(shots).toBe(10)
  })
  it("semi-auto weapons fire once per click and buffer early clicks", () => {
    const bag = new Bag(8, [{ id: "ammo_9mm", qty: 60 }]), src = source(bag)
    const w = new WeaponRuntime("p9", {}, "ammo_9mm"); w.load(src)
    expect(w.trigger(true, true)).toBe("fired")
    let shots = 0
    for (let i = 0; i < 30; i++) { w.update(1 / 60, src); if (w.trigger(false, true) === "fired") shots++ }
    expect(shots).toBe(0)
    w.trigger(false, false)
    expect(w.trigger(true, true)).toBe("fired")
    w.update(1 / 60, src)
    expect(w.trigger(true, true)).toBe("blocked") // clicked too early: buffered
    for (let i = 0; i < 30; i++) { w.update(1 / 60, src); if (w.trigger(false, true) === "fired") shots++ }
    expect(shots).toBe(1)
  })
  it("reloads real rounds from the backpack and keeps the rest there", () => {
    const bag = new Bag(8, [{ id: "ammo_556", qty: 40 }]), src = source(bag)
    const w = new WeaponRuntime("mk4", {}, "ammo_556", 5)
    expect(w.startReload(src)).toBe(true)
    for (let i = 0; i < 200; i++) w.update(1 / 60, src)
    expect(w.mag).toBe(30); expect(bag.count("ammo_556")).toBe(15)
    expect(new WeaponRuntime("mk4", {}, "ammo_556", 0).canReload(source(new Bag(4)))).toBe(false)
  })
  it("shotguns load shell by shell and firing interrupts the reload", () => {
    const bag = new Bag(8, [{ id: "ammo_12buck", qty: 10 }]), src = source(bag)
    const w = new WeaponRuntime("kv12", {}, "ammo_12buck", 2)
    w.startReload(src)
    for (let i = 0; i < 60; i++) w.update(1 / 60, src)
    expect(w.mag).toBeGreaterThan(2); expect(w.mag).toBeLessThan(6)
    expect(w.trigger(true, true)).toBe("fired")
    expect(w.reloading).toBe(false)
  })
  it("reports empty magazines", () => {
    const w = new WeaponRuntime("p9", {}, "ammo_9mm", 0)
    expect(w.trigger(true, true)).toBe("empty")
  })
  it("switches ammo types: unloads into the backpack and reloads", () => {
    const bag = new Bag(8, [{ id: "ammo_556", qty: 30 }, { id: "ammo_556ap", qty: 30 }]), src = source(bag)
    const w = new WeaponRuntime("mk4", {}, "ammo_556", 20)
    expect(w.nextAmmo(src)).toBe("ammo_556ap")
    expect(w.switchAmmo("ammo_556ap", src)).toBe(true)
    expect(bag.count("ammo_556")).toBe(50)
    for (let i = 0; i < 200; i++) w.update(1 / 60, src)
    expect(w.mag).toBe(30); expect(w.def.penetration).toBeGreaterThan(0.6)
  })
  it("attachments change the weapon", () => {
    const base = effectiveWeapon("mk4"), mod = effectiveWeapon("mk4", { mag: "att_extmag", muzzle: "att_suppressor", optic: "att_scope4x" })
    expect(mod.magazine).toBeGreaterThan(base.magazine)
    expect(mod.noise).toBeLessThan(base.noise / 2)
    expect(mod.adsZoom).toBeLessThan(base.adsZoom)
    expect(canAttach("p9", "att_scope4x")).toBe(false)
    expect(effectiveWeapon("p9", { optic: "att_scope4x" }).adsZoom).toBe(WEAPONS.p9.adsZoom)
  })
  it("slugs turn the shotgun into a single accurate projectile", () => {
    const buck = effectiveWeapon("kv12", {}, "ammo_12buck"), slug = effectiveWeapon("kv12", {}, "ammo_12slug")
    expect(buck.pellets).toBe(9); expect(slug.pellets).toBe(1)
    expect(slug.rangeEnd).toBeGreaterThan(buck.rangeEnd)
  })
  it("melee weapons swing at their swing rate", () => {
    const w = new WeaponRuntime("machete", {}, null)
    expect(w.isMelee).toBe(true)
    expect(w.trigger(true, true)).toBe("fired")
    expect(w.trigger(true, true)).toBe("blocked")
    for (let i = 0; i < 60; i++) w.update(1 / 60, source(new Bag(1)))
    expect(w.trigger(true, true)).toBe("fired")
  })
  it("applies range falloff and hit zones", () => {
    const d = WEAPONS.mk4
    expect(damageAt(d, 5, "body")).toBe(d.damage)
    expect(damageAt(d, 500, "body")).toBeCloseTo(d.damage * d.minDamageFactor)
    expect(damageAt(d, 5, "head")).toBeGreaterThan(damageAt(d, 5, "body"))
    expect(damageAt(d, 5, "limb")).toBeLessThan(damageAt(d, 5, "body"))
  })
  it("cone offsets stay inside the cone", () => {
    const rng = mulberry32(7), out = { x: 0, y: 0 }
    for (let i = 0; i < 500; i++) { coneOffset(0.05, rng, out); expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(0.05 + 1e-9) }
  })
})

describe("backpack", () => {
  it("stacks up to the stack size and respects the slot count", () => {
    const b = new Bag(2)
    expect(b.add("ammo_556", 100)).toBe(100)
    expect(b.used).toBe(2)
    expect(b.add("ammo_556", 30)).toBe(20)
    expect(b.add("bandage", 1)).toBe(0)
    expect(b.count("ammo_556")).toBe(120)
  })
  it("removes across stacks and frees empty slots", () => {
    const b = new Bag(4, [{ id: "bandage", qty: 3 }, { id: "bandage", qty: 2 }, { id: "water", qty: 1 }])
    expect(b.remove("bandage", 4)).toBe(4)
    expect(b.count("bandage")).toBe(1)
    expect(b.used).toBe(2)
  })
  it("moves slots between bags (partially when the target is full)", () => {
    const a = new Bag(4, [{ id: "ammo_9mm", qty: 60 }]), b = new Bag(1, [{ id: "ammo_9mm", qty: 50 }])
    expect(a.moveSlotTo(0, b)).toBe(10)
    expect(a.count("ammo_9mm")).toBe(50); expect(b.count("ammo_9mm")).toBe(60)
  })
  it("weighs and values its content", () => {
    const b = new Bag(4, [{ id: "gold", qty: 2 }, { id: "water", qty: 1 }])
    expect(b.weight()).toBeCloseTo(ITEMS.gold.weight * 2 + ITEMS.water.weight)
    expect(b.value(id => ITEMS[id].value)).toBe(ITEMS.gold.value * 2 + ITEMS.water.value)
  })
})

describe("survival", () => {
  it("hunger and thirst drain over time and starving hurts", () => {
    const v = freshVitals()
    stepVitals(v, 600)
    expect(v.energy).toBeCloseTo(100 - 600 * 100 / 1800)
    expect(v.water).toBeCloseTo(50)
    v.water = 0; const lost = stepVitals(v, 10)
    expect(lost).toBeGreaterThan(0)
  })
  it("bleeding hurts until treated; bandages stop only light bleeding", () => {
    const v = freshVitals()
    addBleed(v, "heavy"); stepVitals(v, 10)
    expect(v.health).toBeLessThan(80)
    applyUse(v, ITEMS.bandage.use!)
    expect(v.bleed).toBe("heavy")
    applyUse(v, ITEMS.medkit.use!)
    expect(v.bleed).toBe("none")
    addBleed(v, "light"); addBleed(v, "light")
    expect(v.bleed).toBe("light")
    applyUse(v, ITEMS.bandage.use!)
    expect(v.bleed).toBe("none")
  })
  it("infection grows, kills at 100 % and is cured by serum", () => {
    const v = freshVitals(); v.infection = 99.9
    stepVitals(v, 60)
    expect(v.infection).toBe(100); expect(v.health).toBeLessThan(100)
    applyUse(v, ITEMS.antiviral.use!)
    expect(v.infection).toBe(40)
  })
  it("low health limps unless on painkillers; stims speed up", () => {
    const v = freshVitals(); v.health = 20
    expect(speedFactor(v)).toBeLessThan(1)
    v.painkiller = 30; expect(speedFactor(v)).toBe(1)
    v.boost = 10; expect(speedFactor(v)).toBeGreaterThan(1)
  })
})

describe("items", () => {
  it("every item is well-formed", () => {
    for (const id of ITEM_IDS) {
      const it = ITEMS[id]
      expect(it.id).toBe(id)
      expect(it.weight).toBeGreaterThan(0); expect(it.stack).toBeGreaterThan(0); expect(it.value).toBeGreaterThan(0)
      expect(it.name.length).toBeGreaterThan(2)
    }
    for (const w of WEAPON_ORDER) expect(ITEMS[`w_${w}`].cat).toBe("weapon")
  })
  it("the trader pays full price for valuables and less for supplies", () => {
    expect(sellPrice("gold")).toBe(ITEMS.gold.value)
    expect(sellPrice("bandage")).toBeLessThan(ITEMS.bandage.value)
    expect(sellPrice("gold", true)).toBeGreaterThan(sellPrice("gold"))
  })
})

describe("company", () => {
  const rich = () => { const c = new Company(createProfile(1000)); c.profile.money = 1e6; c.profile.level = 20; return c }
  it("starts with a packed kit and two weapons", () => {
    const c = new Company(createProfile(1000)), lo = c.profile.loadout
    expect(lo.primary).toBe("mk4"); expect(lo.secondary).toBe("p9")
    expect(lo.bag.some(s => s.id === "ammo_556")).toBe(true)
  })
  it("buys with level gates", () => {
    const c = new Company(createProfile(1000))
    expect(c.buy("bandage", 2).ok).toBe(true)
    expect(c.buyWeapon("falke").ok).toBe(false)
    c.profile.level = 20; c.profile.money = 1e6
    expect(c.buyWeapon("falke").ok).toBe(true)
    expect(c.count("w_falke")).toBe(1)
  })
  it("equips weapons from the stash and returns the old one with its attachments", () => {
    const c = rich()
    c.profile.structures.armory = 3
    c.addItem("att_reddot", 1); c.addItem("w_sr74", 1)
    expect(c.installAttachment("primary", "att_reddot").ok).toBe(true)
    expect(c.count("att_reddot")).toBe(0)
    expect(c.equipWeapon("sr74").ok).toBe(true)
    expect(c.profile.loadout.primary).toBe("sr74")
    expect(c.count("w_mk4")).toBe(1); expect(c.count("att_reddot")).toBe(1)
    expect(c.profile.loadout.primaryAmmo).toBe("ammo_762")
  })
  it("attachments need the armory", () => {
    const c = rich(); c.addItem("att_suppressor", 1)
    expect(c.installAttachment("primary", "att_suppressor").ok).toBe(false)
    c.profile.structures.armory = 3
    expect(c.installAttachment("primary", "att_suppressor").ok).toBe(true)
    expect(c.removeAttachment("primary", "muzzle").ok).toBe(true)
    expect(c.count("att_suppressor")).toBe(1)
  })
  it("packs into backpack and secure container with their slot limits", () => {
    const c = rich(); c.profile.loadout.bag = []
    c.addItem("gold", 20)
    expect(c.secureSlots()).toBe(2)
    expect(c.pack("gold", 20, "secure").ok).toBe(true)
    expect(c.profile.loadout.secure.length).toBeLessThanOrEqual(2)
    c.unpackAll()
    expect(c.quickPack().ok).toBe(true)
    expect(c.profile.loadout.bag.some(s => s.id === "ammo_556")).toBe(true)
  })
  it("a successful raid brings everything home and counts contracts", () => {
    const c = rich()
    c.refreshOffers(mulberry32(3))
    c.profile.contracts.offers[0] = { id: "k1", kind: "killInfected", title: "Säubern", text: "", target: 5, reward: { money: 500, xp: 100 } }
    expect(c.acceptContract("k1").ok).toBe(true)
    const kit = c.beginRaid(5000)
    expect(c.profile.loadout.primary).toBeNull(); expect(c.profile.raidStarted).toBe(5000)
    const money = c.profile.money
    const s = c.finishRaid(kit, { armor: 30, helmet: 0, bag: [{ id: "gold", qty: 2 }], secure: [], loaded: { ammo_556: 12 }, infection: 10 }, { ...emptyRaidStats(), kills: 6, infectedKills: 6 }, true, "normal", mulberry32(1))
    expect(c.profile.loadout.primary).toBe("mk4")
    expect(c.profile.loadout.armor).toBe(30)
    expect(c.count("gold")).toBe(2); expect(s.value).toBe(sellPrice("gold") * 2)
    expect(c.profile.money).toBe(money + 500)
    expect(c.profile.contracts.active.length).toBe(0)
    expect(c.profile.infection).toBe(10)
    expect(c.profile.raidStarted).toBe(0)
  })
  it("dying loses the carried kit but keeps the secure container", () => {
    const c = rich()
    const kit = c.beginRaid()
    const s = c.finishRaid(kit, { armor: 0, helmet: 0, bag: [{ id: "gold", qty: 2 }], secure: [{ id: "watch", qty: 1 }], loaded: {}, infection: 50 }, emptyRaidStats(), false, "normal", mulberry32(1))
    expect(c.profile.loadout.primary).toBeNull()
    expect(c.count("gold")).toBe(0); expect(c.count("watch")).toBe(1)
    expect(s.lost.some(x => x.id === "w_mk4")).toBe(true)
    expect(c.profile.infection).toBe(0)
  })
  it("night-vision goggles are mounted from the stash, come home on extraction and are lost on death", () => {
    const c = rich()
    expect(c.equipGear("nvg").ok).toBe(false)
    c.addItem("nvg", 1)
    expect(c.equipGear("nvg").ok).toBe(true); expect(c.profile.loadout.nvg).toBe(true); expect(c.count("nvg")).toBe(0)
    expect(c.unequipGear("nvg").ok).toBe(true); expect(c.profile.loadout.nvg).toBe(false); expect(c.count("nvg")).toBe(1)
    expect(c.unequipGear("nvg").ok).toBe(false)
    c.equipGear("nvg")
    let kit = c.beginRaid()
    expect(kit.nvg).toBe(true); expect(c.profile.loadout.nvg).toBe(false)
    c.finishRaid(kit, { armor: 0, helmet: 0, bag: [], secure: [], loaded: {}, infection: 0 }, emptyRaidStats(), true, "normal", mulberry32(1))
    expect(c.profile.loadout.nvg).toBe(true)
    kit = c.beginRaid()
    const s = c.finishRaid(kit, { armor: 0, helmet: 0, bag: [], secure: [], loaded: {}, infection: 0 }, emptyRaidStats(), false, "normal", mulberry32(1))
    expect(c.profile.loadout.nvg).toBe(false); expect(s.lost.some(x => x.id === "nvg")).toBe(true); expect(c.count("nvg")).toBe(0)
    // the flag survives a save round trip and anything but `true` means "none"
    const back = sanitizeProfile(JSON.parse(JSON.stringify({ ...c.profile, loadout: { ...c.profile.loadout, nvg: "yes" } })), 1000)!
    expect(back.loadout.nvg).toBe(false)
  })
  it("a reload during a raid counts as lost but keeps the secure container", () => {
    const c = rich()
    c.profile.loadout.secure = [{ id: "intel", qty: 1 }]
    c.beginRaid()
    expect(c.recoverInterruptedRaid()).toBeTruthy()
    expect(c.count("intel")).toBe(1); expect(c.profile.loadout.primary).toBeNull()
    expect(c.recoverInterruptedRaid()).toBeNull()
  })
  it("builds with HQ requirements and materials", () => {
    const c = rich()
    for (const id of ITEM_IDS) if (ITEMS[id].cat === "material" || ITEMS[id].cat === "valuable") c.addItem(id, 200)
    expect(c.build("workbench").ok).toBe(true)
    expect(c.level("workbench")).toBe(1)
    c.build("workbench")
    const third = c.build("workbench")
    expect(third.ok).toBe(false); expect(third.message).toMatch(/Kommandozentrale/)
    expect(c.build("hq").ok).toBe(true); expect(c.build("hq").ok).toBe(true)
    expect(c.build("workbench").ok).toBe(true)
  })
  it("staff, production and crafting progress over time", () => {
    const c = rich()
    for (const id of ITEM_IDS) if (ITEMS[id].cat === "material") c.addItem(id, 200)
    c.build("clinic"); c.build("workbench")
    expect(c.assignStaff("clinic", 1).ok).toBe(true)
    expect(c.assignStaff("clinic", 1).ok).toBe(false)
    c.addItem("cloth", 10)
    const t0 = c.profile.lastTick
    expect(c.craft("bandage", t0).ok).toBe(true)
    expect(c.craft("bandage", t0).ok).toBe(false)
    const before = c.count("bandage")
    c.tick(t0 + 3600 * 1000, mulberry32(2))
    expect(c.count("bandage")).toBeGreaterThanOrEqual(before + 2 + 3)
    expect(c.profile.crafting.length).toBe(0)
  })
  it("research needs the lab and an analyst", () => {
    const c = rich(); c.addItem("parts", 5)
    expect(c.startResearch("ballistics").ok).toBe(false)
    for (const id of ITEM_IDS) if (ITEMS[id].cat === "material") c.addItem(id, 200)
    c.build("generator"); c.build("lab")
    expect(c.startResearch("ballistics").ok).toBe(false)
    c.assignStaff("lab", 1)
    expect(c.startResearch("ballistics", 1000).ok).toBe(true)
    c.tick(1000 + 61_000)
    expect(c.has("ballistics")).toBe(true)
  })
  it("fetch contracts are delivered from the stash", () => {
    const c = rich()
    c.profile.contracts.offers = [{ id: "f1", kind: "fetch", title: "Lieferung", text: "", target: 3, item: "parts", reward: { money: 900, xp: 50, items: { scrap: 4 } } }]
    c.acceptContract("f1"); c.addItem("parts", 2)
    expect(c.deliver("f1").ok).toBe(true)
    expect(c.profile.contracts.active[0].progress).toBe(2)
    c.addItem("parts", 5); const money = c.profile.money, scrap = c.count("scrap")
    c.deliver("f1")
    expect(c.profile.contracts.active.length).toBe(0)
    expect(c.profile.money).toBe(money + 900); expect(c.count("scrap")).toBe(scrap + 4)
  })
  it("threat builds up into a base attack; losing a defence costs supplies", () => {
    const c = rich(); c.addItem("scrap", 100 - c.count("scrap"))
    c.profile.base.threat = 59; c.tick(c.profile.lastTick + 3600 * 1000)
    expect(c.profile.base.attackPending).toBe(true)
    const r = c.finishDefense(false, 3)
    expect(r.ok).toBe(false)
    expect(c.count("scrap")).toBe(75)
    expect(c.profile.base.attackPending).toBe(false)
    c.profile.base.attackPending = true
    expect(c.finishDefense(true, 20).ok).toBe(true)
    expect(c.profile.base.threat).toBe(0)
  })
  it("levels up with XP and pays a bonus", () => {
    const c = new Company(createProfile(1000)), money = c.profile.money
    expect(c.addXp(xpForLevel(1) + 1)).toBe(true)
    expect(c.profile.level).toBe(2); expect(c.profile.money).toBe(money + 250)
  })
})

describe("storage", () => {
  it("migrates a v3 profile and keeps progress", () => {
    const v3 = { version: 3, callsign: "ALT", money: 5000, xp: 10, level: 4, resources: 30, weapons: ["p9", "mk4", "kv12"], stash: { ammo: 4, medkit: 2, armor: 1, plate: 0, grenade: 1, parts: 3, intel: 1, electronics: 0, medical: 0, relic: 0 }, loadout: { primary: "kv12", armor: 40, armorMax: 55, medkits: 1, grenades: 1 }, buildings: { hq: 2, workshop: 1, lab: 1, clinic: 0 }, staff: { workshop: 1, lab: 1, clinic: 0 }, research: ["ballistics"], stats: { raids: 5, extracts: 3, kills: 20 } }
    const p = sanitizeProfile(v3, 1000)!
    expect(p.version).toBe(4)
    expect(p.money).toBe(5000); expect(p.level).toBe(4)
    expect(p.stash.ammo_556).toBe(120); expect(p.stash.w_mk4).toBe(1); expect(p.stash.medkit).toBe(3)
    expect(p.loadout.primary).toBe("kv12"); expect(p.loadout.primaryAmmo).toBe("ammo_12buck")
    expect(p.structures.hq).toBe(2); expect(p.research).toContain("ballistics")
    expect(p.stats.extracts).toBe(3)
  })
  it("loads legacy keys and saves them as v4", () => {
    localStorage.setItem(LEGACY_KEYS[0], JSON.stringify({ version: 3, money: 100, stash: {}, buildings: { hq: 1 }, loadout: {} }))
    const p = loadProfile(1000)!
    expect(p.money).toBe(100)
    expect(localStorage.getItem(PROFILE_KEY)).toBeTruthy()
  })
  it("rejects garbage and repairs out-of-range values", () => {
    expect(sanitizeProfile(null)).toBeNull(); expect(sanitizeProfile({ version: 4 })).toBeNull(); expect(sanitizeProfile("x")).toBeNull()
    const p = createProfile(1000) as unknown as Record<string, any>
    p.money = -50; p.structures.hq = 9; p.stash.bogus = 4; p.stash.gold = -3; p.loadout.primary = "laser"; p.loadout.primaryMods = { optic: "att_scope4x" }
    const s = sanitizeProfile(JSON.parse(JSON.stringify(p)), 1000)!
    expect(s.money).toBe(0); expect(s.structures.hq).toBe(3)
    expect((s.stash as Record<string, number>).bogus).toBeUndefined(); expect(s.stash.gold).toBeUndefined()
    expect(s.loadout.primary).toBeNull(); expect(s.loadout.primaryMods).toEqual({})
  })
  it("round-trips a fresh profile unchanged", () => {
    const p = createProfile(1000)
    expect(sanitizeProfile(JSON.parse(JSON.stringify(p)), 1000)).toEqual(p)
  })
  it("sanitizes settings with brutal gore as default", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.gore).toBe("brutal")
    const s = sanitizeSettings({ sensitivity: 99, gore: "normal" as const, fov: 10 })
    expect(s.sensitivity).toBe(1.8); expect(s.gore).toBe("normal"); expect(s.fov).toBe(60)
    localStorage.setItem(SETTINGS_KEY, "{broken")
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe("loot", () => {
  it("containers hold valid items that fit their category", () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 300; i++) {
      const items = rollContainer({ category: "medical", tier: 1, container: "medcab" }, rng)
      expect(items.length).toBeGreaterThan(0)
      for (const s of items) { expect(ITEMS[s.id]).toBeDefined(); expect(s.qty).toBeGreaterThan(0) }
    }
    const meds = Array.from({ length: 200 }, () => rollContainer({ category: "medical", tier: 1, container: "medcab" }, rng)).flat()
    expect(meds.filter(s => ITEMS[s.id].cat === "medical").length / meds.length).toBeGreaterThan(0.4)
  })
  it("higher tiers are worth more on average", () => {
    const rng = mulberry32(5), avg = (tier: 0 | 1 | 2) => Array.from({ length: 400 }, () => bagValue(rollContainer({ category: "military", tier, container: "weaponcase" }, rng))).reduce((a, b) => a + b, 0) / 400
    expect(avg(2)).toBeGreaterThan(avg(0))
  })
  it("bodies drop sensible items", () => {
    const rng = mulberry32(9)
    const merc = Array.from({ length: 50 }, () => rollMercBody("rifleman", 2, rng)).flat()
    expect(merc.some(s => ITEMS[s.id].cat === "ammo")).toBe(true)
    const boss = rollInfectedBody("boss", rng)
    expect(boss.some(s => ITEMS[s.id].cat === "valuable")).toBe(true)
    expect(rollAirdrop(rng).length).toBeGreaterThan(2)
  })
})

describe("math helpers", () => {
  it("compass math", () => {
    expect(headingOf(0, -1)).toBeCloseTo(0)
    expect(headingOf(1, 0)).toBeCloseTo(90)
    expect(headingOf(0, 1)).toBeCloseTo(180)
    expect(headingOf(-1, 0)).toBeCloseTo(270)
    expect(wrapDegrees(350)).toBeCloseTo(-10)
    expect(wrapDegrees(-190)).toBeCloseTo(170)
  })
})
