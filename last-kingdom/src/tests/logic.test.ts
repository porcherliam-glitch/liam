import { describe, expect, it } from "vitest"
import { Rng } from "../core/rng"
import { computeDamage, armorFactor, encumbrance, staggers } from "../entities/combat"
import { applyXp, masteryRank, reputationRank, xpForLevel } from "../meta/progression"
import { ALL_ITEMS, AFFIXES, itemDef } from "../items/itemData"
import { createItem, displayName, effectiveWeapon, itemValue } from "../items/items"
import { addItem, countItem, createInventory, equip, removeItem, totalWeight, unequip } from "../items/inventory"
import { LOOT_TABLES, rollLoot, rollRarity } from "../items/loot"
import { generateBoard, generateMission } from "../meta/missions"
import { AREAS, areaUnlocked, areasUnlockedBy } from "../world/areas"
import { ZOMBIE_TYPES, zombieType } from "../entities/zombieTypes"
import { CAMP_BUILDINGS, campBonuses } from "../meta/campData"
import { SKILLS, skillBonuses } from "../meta/skillData"
import { CollisionWorld } from "../world/collision"
import { NavGrid } from "../world/nav"
import { CLASSES } from "../meta/classData"
import { ACHIEVEMENTS, checkAchievements } from "../meta/achievements"
import { createProfile } from "../meta/profile"
import { sortInventory } from "../items/inventory"
import { LORE } from "../meta/lore"

describe("rng", () => {
  it("is deterministic", () => {
    const a = new Rng(42)
    const b = new Rng(42)
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next())
  })
  it("weighted never picks zero weight", () => {
    const r = new Rng(1)
    for (let i = 0; i < 200; i++) expect(r.weighted(["a", "b"], (x) => (x === "a" ? 0 : 1))).toBe("b")
  })
})

describe("combat", () => {
  it("armour reduces damage", () => {
    expect(armorFactor(0)).toBe(1)
    expect(armorFactor(100)).toBeCloseTo(0.5)
  })
  it("blocking reduces damage and flags it", () => {
    const r = computeDamage(new Rng(3), { baseDamage: 100, multiplier: 1, critChance: 0, critMultiplier: 1, bonusPct: 0, armor: 0, blockReduction: 0.8 })
    expect(r.blocked).toBe(true)
    expect(r.damage).toBeLessThan(25)
  })
  it("crits multiply", () => {
    const r = computeDamage(new Rng(3), { baseDamage: 100, multiplier: 1, critChance: 1, critMultiplier: 2, bonusPct: 0, armor: 0, blockReduction: 0 })
    expect(r.crit).toBe(true)
    expect(r.damage).toBeGreaterThan(170)
  })
  it("encumbrance slows", () => {
    expect(encumbrance(10, 40)).toBe(1)
    expect(encumbrance(60, 40)).toBeLessThan(1)
    expect(encumbrance(500, 40)).toBe(0.35)
  })
  it("stagger respects poise", () => {
    let n = 0
    const r = new Rng(9)
    for (let i = 0; i < 500; i++) if (staggers(r, 0.3, 1, false)) n++
    expect(n).toBe(0)
  })
})

describe("progression", () => {
  it("xp curve rises", () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1))
    expect(xpForLevel(20)).toBeGreaterThan(xpForLevel(10))
  })
  it("applies levels and skill points", () => {
    const s = { level: 1, xp: 0, skillPoints: 0 }
    const gained = applyXp(s, xpForLevel(1) + xpForLevel(2) + 5)
    expect(gained).toBe(2)
    expect(s.level).toBe(3)
    expect(s.skillPoints).toBe(2)
    expect(s.xp).toBe(5)
  })
  it("mastery and reputation ranks", () => {
    expect(masteryRank(0)).toBe(0)
    expect(masteryRank(5000)).toBe(4)
    expect(reputationRank(0).discount).toBe(0)
    expect(reputationRank(2000).discount).toBe(0.25)
  })
})

describe("items", () => {
  it("all weapons have stats and models for every class", () => {
    const classes = new Set<string>()
    for (const d of ALL_ITEMS) if (d.weapon) classes.add(d.weapon.weaponClass)
    expect([...classes].sort()).toEqual(["battleaxe", "bow", "crossbow", "dagger", "greatsword", "longsword", "mace", "shortsword", "spear"])
  })
  it("affixes change stats and names", () => {
    const a = createItem("longsword_1")
    const b = createItem("longsword_1", 1, { rarity: "rare", affixes: ["wolf", "sharp"] })
    expect(effectiveWeapon(b)!.damage).toBeGreaterThan(effectiveWeapon(a)!.damage)
    expect(displayName(b)).toContain("des Wolfs")
    expect(displayName(b)).toContain("Scharfe")
    expect(itemValue(b)).toBeGreaterThan(itemValue(a))
  })
  it("broken weapons deal less", () => {
    const a = createItem("mace_1")
    const full = effectiveWeapon(a)!.damage
    a.durability = 0
    expect(effectiveWeapon(a)!.damage).toBeLessThan(full)
  })
  it("craft costs reference known materials", () => {
    for (const d of ALL_ITEMS) if (d.craft) for (const id of Object.keys(d.craft.cost)) expect(() => itemDef(id)).not.toThrow()
    for (const a of AFFIXES) expect(a.name.length).toBeGreaterThan(0)
  })
})

describe("inventory", () => {
  it("stacks and respects capacity", () => {
    const inv = createInventory(2)
    expect(addItem(inv, createItem("arrow", 30))).toBe(0)
    expect(addItem(inv, createItem("arrow", 30))).toBe(0) // 40 + 20 in two slots
    expect(countItem(inv, "arrow")).toBe(60)
    expect(addItem(inv, createItem("bread", 1))).toBe(1) // no room
    expect(removeItem(inv, "arrow", 45)).toBe(45)
    expect(countItem(inv, "arrow")).toBe(15)
  })
  it("equips and swaps, two-handed removes the shield", () => {
    const inv = createInventory(10)
    addItem(inv, createItem("shield_wood"))
    addItem(inv, createItem("greatsword_1"))
    addItem(inv, createItem("longsword_1"))
    const shield = inv.slots.find((s) => s?.defId === "shield_wood")!
    expect(equip(inv, shield.uid).ok).toBe(true)
    const gs = inv.slots.find((s) => s?.defId === "greatsword_1")!
    expect(equip(inv, gs.uid).ok).toBe(true)
    expect(inv.equipment.offHand ?? null).toBeNull()
    expect(countItem(inv, "shield_wood")).toBe(1)
    const sh2 = inv.slots.find((s) => s?.defId === "shield_wood")!
    expect(equip(inv, sh2.uid).ok).toBe(false)
    expect(unequip(inv, "mainHand")).toBe(true)
    expect(totalWeight(inv)).toBeGreaterThan(0)
  })
})

describe("loot", () => {
  it("every table entry is a real item", () => {
    for (const [name, t] of Object.entries(LOOT_TABLES)) for (const e of t.entries) expect(() => itemDef(e.id), `${name}:${e.id}`).not.toThrow()
  })
  it("rolls items and more rarity with danger", () => {
    const r = new Rng(5)
    const res = rollLoot(r, "boss", 5, 0.2, 2)
    expect(res.items.length).toBeGreaterThanOrEqual(5)
    let hi = 0
    for (let i = 0; i < 2000; i++) if (rollRarity(new Rng(i), 6, 1) !== "common") hi++
    let lo = 0
    for (let i = 0; i < 2000; i++) if (rollRarity(new Rng(i), 1, 0) !== "common") lo++
    expect(hi).toBeGreaterThan(lo)
  })
})

describe("missions and areas", () => {
  it("generates all kinds for all areas", () => {
    const r = new Rng(7)
    for (const a of AREAS) for (const k of ["collect", "bossHunt", "rescue", "explore", "treasure", "resources", "purge"] as const) {
      const m = generateMission(r, a.id, k, 5)
      expect(m.goal).toBeGreaterThan(0)
      expect(m.reward.gold).toBeGreaterThan(0)
      if (m.targetId && k !== "bossHunt" && k !== "purge") expect(() => itemDef(m.targetId!)).not.toThrow()
    }
    const board = generateBoard(r, ["village", "forest"], 3)
    expect(board.length).toBe(6)
  })
  it("area unlock chain", () => {
    expect(areaUnlocked(AREAS[0], 1, ["village"])).toBe(true)
    expect(areaUnlocked(AREAS[1], 3, ["village"])).toBe(false)
    expect(areaUnlocked(AREAS[1], 3, ["village", "forest"])).toBe(true)
    expect(areasUnlockedBy("village")).toEqual(["forest"])
    for (const a of AREAS) {
      for (const e of a.enemies) expect(() => zombieType(e.typeId)).not.toThrow()
      if (a.bossId) expect(zombieType(a.bossId).kind).toBe("boss")
      expect(a.extractions.length).toBeGreaterThanOrEqual(3)
      for (const x of a.extractions) if (x.activation?.itemId) expect(() => itemDef(x.activation!.itemId!)).not.toThrow()
    }
  })
  it("zombie roster covers all kinds", () => {
    const kinds = new Set(ZOMBIE_TYPES.map((z) => z.kind))
    expect([...kinds].sort()).toEqual(["boss", "brute", "knight", "sprinter", "walker"])
  })
})

describe("camp and skills", () => {
  it("buildings have 3 levels with valid costs", () => {
    for (const b of CAMP_BUILDINGS) {
      expect(b.levels.length).toBe(b.maxLevel)
      for (const l of b.levels) for (const id of Object.keys(l.cost)) expect(() => itemDef(id)).not.toThrow()
    }
    const base = campBonuses({})
    const full = campBonuses({ storage: 3, armory: 3, defense: 3, infirmary: 3, merchant: 3 })
    expect(full.bagSlots).toBeGreaterThan(base.bagSlots)
    expect(full.quickSlots).toBe(4)
    expect(full.insuredSlots).toBe(4)
    expect(full.sellRate).toBeGreaterThan(base.sellRate)
  })
  it("skill bonuses accumulate and prerequisites exist", () => {
    for (const s of SKILLS) if (s.requires) expect(SKILLS.some((x) => x.id === s.requires)).toBe(true)
    const b = skillBonuses(["w1", "w3", "s1", "w6"])
    expect(b.damagePct).toBeCloseTo(0.08)
    expect(b.heavyPct).toBeCloseTo(0.25)
    expect(b.carryKg).toBe(8)
    expect(b.secondWind).toBe(true)
  })
  it("classes have valid start gear", () => {
    for (const c of CLASSES) {
      for (const id of Object.values(c.startEquipment)) expect(() => itemDef(id)).not.toThrow()
      for (const it of c.startItems) expect(() => itemDef(it.id)).not.toThrow()
    }
  })
})

describe("collision and navigation", () => {
  it("pushes circles out of boxes and cylinders", () => {
    const w = new CollisionWorld()
    w.add({ kind: "box", x: 0, z: 0, hw: 2, hd: 2, yaw: 0, y0: 0, y1: 3 })
    w.add({ kind: "circle", x: 10, z: 0, r: 1, y0: 0, y1: 3 })
    const r = w.resolveCircle(1.5, 0.2, 0.5, 0, 1.8)
    expect(r.hit).toBe(true)
    expect(Math.abs(r.x) >= 2.49 || Math.abs(r.z) >= 2.49).toBe(true)
    const c = w.resolveCircle(10.5, 0, 0.5, 0, 1.8)
    expect(c.hit).toBe(true)
    expect(Math.hypot(c.x - 10, c.z)).toBeGreaterThanOrEqual(1.49)
    expect(w.resolveCircle(0, 0, 0.5, 5, 1.8).hit).toBe(false) // above the box
  })
  it("casts segments against rotated boxes", () => {
    const w = new CollisionWorld()
    w.add({ kind: "box", x: 5, z: 0, hw: 1, hd: 4, yaw: Math.PI / 2, y0: 0, y1: 3 })
    const hit = w.segmentCast(0, 1, 0, 10, 1, 0)
    expect(hit).not.toBeNull()
    expect(hit!.t).toBeGreaterThan(0.05)
    expect(hit!.t).toBeLessThan(0.5)
    expect(w.segmentCast(0, 5, 0, 10, 5, 0)).toBeNull()
    expect(w.blocked(0, 0, 10, 0, 1)).toBe(true)
  })
  it("keeps doorways open and walls closed", () => {
    const w = new CollisionWorld()
    // wall along x with a 1.3 m gap at x = 0
    w.add({ kind: "box", x: -10.65, z: 0, hw: 10, hd: 0.15, yaw: 0, y0: 0, y1: 3 })
    w.add({ kind: "box", x: 10.65, z: 0, hw: 10, hd: 0.15, yaw: 0, y0: 0, y1: 3 })
    const nav = new NavGrid(30, w, null)
    expect(nav.isBlockedWorld(0.1, 0.1)).toBe(false)
    expect(nav.isBlockedWorld(5, 0.1)).toBe(true)
    const path = nav.findPath(0, -5, 0, 5)
    expect(path).not.toBeNull()
    // path must stay near x = 0 (through the door), never through the wall
    expect(path!.every((p) => Math.abs(p[0]) < 2)).toBe(true)
  })
  it("finds paths around walls", () => {
    const w = new CollisionWorld()
    w.add({ kind: "box", x: 0, z: 0, hw: 1, hd: 20, yaw: 0, y0: 0, y1: 3 })
    const nav = new NavGrid(40, w, null)
    const path = nav.findPath(-10, 0, 10, 0)
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(1)
    // the path must go around the wall: some waypoint beyond |z| > 19
    expect(path!.some((p) => Math.abs(p[1]) > 19.5)).toBe(true)
    expect(nav.isBlockedWorld(0, 0)).toBe(true)
    expect(nav.isBlockedWorld(-10, 0)).toBe(false)
  })
})

describe("lore", () => {
  it("every document is an item with text", () => {
    for (const [id, doc] of Object.entries(LORE)) {
      expect(doc.id).toBe(id)
      expect(itemDef(id).kind).toBe("quest")
      expect(doc.text.length).toBeGreaterThan(80)
    }
    expect(Object.keys(LORE).length).toBe(8)
  })
})

describe("achievements and sorting", () => {
  it("unlocks achievements from statistics once", () => {
    const p = createProfile(0, "Test", "knight")
    expect(checkAchievements(p).length).toBe(0)
    p.stats.extractions = 1
    p.stats.kills = 150
    const fresh = checkAchievements(p)
    expect(fresh.map((a) => a.id).sort()).toEqual(["first_extraction", "kills_100"])
    expect(checkAchievements(p).length).toBe(0)
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10)
  })
  it("sorts the bag by kind and rarity", () => {
    const inv = createInventory(12)
    addItem(inv, createItem("wood", 5))
    addItem(inv, createItem("bandage", 2))
    addItem(inv, createItem("longsword_1"))
    addItem(inv, createItem("shortsword_1", 1, { rarity: "rare" }))
    sortInventory(inv)
    const ids = inv.slots.filter(Boolean).map((s) => s!.defId)
    expect(ids[0]).toBe("shortsword_1")
    expect(ids[1]).toBe("longsword_1")
    expect(ids[ids.length - 1]).toBe("wood")
  })
})
