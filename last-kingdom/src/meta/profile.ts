// Player profile: creation, save slots, serialisation and migrations.

import { DEFAULT_SETTINGS, type ItemInstance, type PlayerClassId, type Profile, type Settings } from "../core/types"
import { Rng } from "../core/rng"
import { createItem, seedUid } from "../items/items"
import { addItem, createInventory } from "../items/inventory"
import { loadJson, saveJson, removeKey } from "../core/storage"
import { classDef } from "./classData"
import { campBonuses } from "./campData"
import { generateBoard } from "./missions"

export const PROFILE_VERSION = 1
export const SLOT_COUNT = 3

const slotKey = (slot: number) => `profile.${slot}`

export function createProfile(slot: number, name: string, classId: PlayerClassId, female = false): Profile {
  const cls = classDef(classId)
  const camp: Record<string, number> = {}
  const bonuses = campBonuses(camp)
  const loadout = createInventory(bonuses.bagSlots)
  for (const [slotName, defId] of Object.entries(cls.startEquipment)) {
    loadout.equipment[slotName as keyof typeof loadout.equipment] = createItem(defId)
  }
  for (const it of cls.startItems) addItem(loadout, createItem(it.id, it.qty))
  const profile: Profile = {
    version: PROFILE_VERSION,
    slot,
    name: name.trim().slice(0, 18) || "Namenlos",
    classId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    level: 1,
    xp: 0,
    gold: 60,
    skillPoints: 0,
    skills: [],
    mastery: {},
    reputation: 0,
    stash: [],
    loadout,
    camp,
    missions: [],
    missionsCompleted: 0,
    unlockedAreas: ["village"],
    clearedBosses: [],
    recipes: [],
    stats: { kills: 0, bossKills: 0, extractions: 0, deaths: 0, expeditions: 0, goldEarned: 0, playSeconds: 0, bestLoot: "common" },
    missionRefreshAt: 0,
    nextUid: 1000,
    tutorialSeen: false,
    female,
  }
  profile.missions = generateBoard(new Rng(Date.now() & 0xffffffff), profile.unlockedAreas, 1)
  profile.missionRefreshAt = Date.now() + 1000 * 60 * 30
  return profile
}

export function saveProfile(profile: Profile): boolean {
  profile.updatedAt = Date.now()
  profile.nextUid = Math.max(profile.nextUid, highestUid(profile) + 1)
  return saveJson(slotKey(profile.slot), profile)
}

function highestUid(profile: Profile): number {
  let max = 0
  const scan = (it: ItemInstance | null | undefined) => {
    if (!it) return
    const m = /^i(\d+)/.exec(it.uid)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  profile.stash.forEach(scan)
  profile.loadout.slots.forEach(scan)
  Object.values(profile.loadout.equipment).forEach(scan)
  return max
}

export function loadProfile(slot: number): Profile | null {
  const raw = loadJson<Profile | null>(slotKey(slot), null)
  if (!raw) return null
  const p = migrate(raw)
  seedUid(p.nextUid)
  return p
}

export function deleteProfile(slot: number): void {
  removeKey(slotKey(slot))
}

export function listProfiles(): (Profile | null)[] {
  const out: (Profile | null)[] = []
  for (let s = 0; s < SLOT_COUNT; s++) out.push(loadProfile(s))
  return out
}

function migrate(p: Profile): Profile {
  if (!p.version) p.version = 1
  p.stats ??= { kills: 0, bossKills: 0, extractions: 0, deaths: 0, expeditions: 0, goldEarned: 0, playSeconds: 0, bestLoot: "common" }
  p.mastery ??= {}
  p.skills ??= []
  p.recipes ??= []
  p.clearedBosses ??= []
  p.missions ??= []
  p.unlockedAreas ??= ["village"]
  p.camp ??= {}
  p.nextUid ??= 1000
  p.achievements ??= []
  p.loadout.equipment ??= {}
  return p
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...loadJson<Partial<Settings>>("settings", {}) }
}

export function saveSettings(s: Settings): void {
  saveJson("settings", s)
}

/** Serialises a profile for export (download) and parses it back for import. */
export function exportProfile(profile: Profile): string {
  return JSON.stringify(profile)
}

export function importProfile(json: string, slot: number): Profile | null {
  try {
    const p = JSON.parse(json) as Profile
    if (!p || typeof p !== "object" || !p.loadout || typeof p.level !== "number") return null
    p.slot = slot
    return migrate(p)
  } catch {
    return null
  }
}
