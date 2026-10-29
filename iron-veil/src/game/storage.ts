/**
 * storage.ts — localStorage persistence with validation and migration (profile v2 → v3). Never throws:
 * blocked or corrupt storage degrades to defaults. Unit-tested.
 */
import { ARMOR_VALUES, PRIMARY_WEAPONS, RESEARCH, WEAPONS } from "./data"
import type { ItemId, Profile, ResearchId, Settings, WeaponId } from "./types"

export const PROFILE_KEY = "ironVeil.profile.v3"
export const LEGACY_PROFILE_KEY = "ironVeil.profile.v2"
export const SETTINGS_KEY = "ironVeil.settings.v1"

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.75, adsSensitivity: 0.8, volume: 0.55, muted: false, quality: "high", invertY: false,
  fov: 75, difficulty: "normal", screenShake: true, showFps: false,
}

const ITEM_IDS: ItemId[] = ["ammo", "medkit", "armor", "plate", "grenade", "parts", "intel", "electronics", "medical", "relic"]

function storageGet(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function storageSet(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true } catch { return false } }

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(storageGet(SETTINGS_KEY) || "null") as Partial<Settings> | null
    return sanitizeSettings(raw)
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }
  const d = DEFAULT_SETTINGS
  return {
    sensitivity: num(raw.sensitivity, 0.2, 1.8, d.sensitivity),
    adsSensitivity: num(raw.adsSensitivity, 0.3, 1.5, d.adsSensitivity),
    volume: num(raw.volume, 0, 1, d.volume),
    muted: raw.muted === true,
    quality: raw.quality === "low" ? "low" : "high",
    invertY: raw.invertY === true,
    fov: Math.round(num(raw.fov, 60, 100, d.fov)),
    difficulty: raw.difficulty === "easy" || raw.difficulty === "hard" ? raw.difficulty : "normal",
    screenShake: raw.screenShake !== false,
    showFps: raw.showFps === true,
  }
}

export function saveSettings(settings: Settings): boolean { return storageSet(SETTINGS_KEY, JSON.stringify(settings)) }

/** Loads the profile; migrates a v2 profile if no v3 exists. Returns null when nothing usable is stored. */
export function loadProfile(now = Date.now()): Profile | null {
  try {
    const v3 = storageGet(PROFILE_KEY)
    if (v3) { const p = sanitizeProfile(JSON.parse(v3), now); if (p) return p }
    const v2 = storageGet(LEGACY_PROFILE_KEY)
    if (v2) { const p = sanitizeProfile(JSON.parse(v2), now); if (p) { saveProfile(p); return p } }
  } catch { /* corrupt JSON → fresh profile */ }
  return null
}

/** Validates/repairs a stored profile of version 2 or 3. Returns null if it is not a profile at all. */
export function sanitizeProfile(raw: unknown, now = Date.now()): Profile | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, any>
  if ((r.version !== 2 && r.version !== 3) || !Number.isFinite(r.money) || !r.stash || !r.buildings || !r.stats) return null
  const stash = {} as Record<ItemId, number>
  for (const id of ITEM_IDS) stash[id] = int(r.stash?.[id], 0, 1e6, 0)
  const weapons: WeaponId[] = Array.isArray(r.weapons) ? (r.weapons as unknown[]).filter((w): w is WeaponId => typeof w === "string" && w in WEAPONS) : []
  for (const w of ["p9", "mk4"] as WeaponId[]) if (!weapons.includes(w)) weapons.push(w)
  const lo = r.loadout || {}
  const legacyArmor = int(lo.armor, 0, 200, 0)
  const armorMax = r.version === 2 ? (legacyArmor > 0 ? ARMOR_VALUES.armor : 0) : int(lo.armorMax, 0, 200, 0)
  const primary: WeaponId = PRIMARY_WEAPONS.includes(lo.primary) && weapons.includes(lo.primary) ? lo.primary : "mk4"
  const research = Array.isArray(r.research) ? (r.research as unknown[]).filter((x): x is ResearchId => typeof x === "string" && x in RESEARCH) : []
  const ar = r.activeResearch
  const stats = r.stats || {}
  const level = int(r.level, 1, 999, 1)
  return {
    version: 3,
    callsign: typeof r.callsign === "string" && r.callsign.trim() ? r.callsign.slice(0, 24) : "VEIL-01",
    money: int(r.money, 0, 1e9, 0),
    resources: int(r.resources, 0, 1e9, 0),
    xp: int(r.xp, 0, 1e9, 0),
    level,
    stash,
    weapons,
    buildings: { hq: int(r.buildings?.hq, 1, 3, 1), workshop: int(r.buildings?.workshop, 0, 3, 0), lab: int(r.buildings?.lab, 0, 3, 0), clinic: int(r.buildings?.clinic, 0, 3, 0) },
    staff: { workshop: int(r.staff?.workshop, 0, 3, 0), lab: int(r.staff?.lab, 0, 3, 0), clinic: int(r.staff?.clinic, 0, 3, 0) },
    production: { workshop: num(r.production?.workshop, 0, 1e7, 0), clinic: num(r.production?.clinic, 0, 1e7, 0) },
    research,
    activeResearch: ar && typeof ar.id === "string" && ar.id in RESEARCH && Number.isFinite(ar.endsAt) ? { id: ar.id, endsAt: ar.endsAt } : null,
    loadout: { primary, armor: Math.min(legacyArmor, armorMax), armorMax, medkits: int(lo.medkits, 0, 3, 0), grenades: int(lo.grenades, 0, 3, 0) },
    stats: {
      raids: int(stats.raids, 0, 1e9, 0), extracts: int(stats.extracts, 0, 1e9, 0), kills: int(stats.kills, 0, 1e9, 0), earned: int(stats.earned, 0, 1e12, 0),
      deaths: int(stats.deaths, 0, 1e9, 0), headshots: int(stats.headshots, 0, 1e9, 0), bestRaid: int(stats.bestRaid, 0, 1e12, 0), contracts: int(stats.contracts, 0, 1e9, 0),
    },
    tutorialDone: r.tutorialDone === true || int(stats.extracts, 0, 1e9, 0) > 0,
    lastTick: Number.isFinite(r.lastTick) ? Math.min(r.lastTick, now) : now,
  }
}

export function saveProfile(profile: Profile): boolean {
  profile.lastTick = Date.now()
  return storageSet(PROFILE_KEY, JSON.stringify(profile))
}

export function clearProfile(): void {
  try { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(LEGACY_PROFILE_KEY) } catch { /* storage can be unavailable */ }
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
function int(value: unknown, min: number, max: number, fallback: number): number { return Math.round(num(value, min, max, fallback)) }
