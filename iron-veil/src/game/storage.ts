/**
 * storage.ts — localStorage persistence with validation and migration of older saves (v2/v3 → v4). Never throws:
 * blocked or corrupt storage degrades to defaults. Unit-tested.
 */
import { ACHIEVEMENT_IDS } from "./achievements"
import { EXPEDITIONS, RESEARCH, STAFF_JOBS, STRUCTURES, type ResearchId, type StaffJob, type StructureId } from "./baseData"
import { isItemId, type ItemId } from "./items"
import type { BagSlot } from "./bag"
import type { ActiveContract, ContractOffer, Loadout, Profile, Settings } from "./types"
import { AMMO, ATTACHMENTS, WEAPONS, canAttach, type AmmoId, type AttachmentId, type AttachmentSlot, type WeaponId, type WeaponMods } from "./weaponData"

export const PROFILE_KEY = "ironVeil.profile.v4"
export const LEGACY_KEYS = ["ironVeil.profile.v3", "ironVeil.profile.v2"]
export const SETTINGS_KEY = "ironVeil.settings.v1"

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.75, adsSensitivity: 0.8, volume: 0.55, muted: false, quality: "high", invertY: false,
  fov: 75, difficulty: "normal", screenShake: true, showFps: false, gore: "brutal", touch: "auto",
}

function storageGet(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function storageSet(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true } catch { return false } }

export function loadSettings(): Settings {
  const stored = storageGet(SETTINGS_KEY)
  let s: Settings
  try { s = sanitizeSettings(JSON.parse(stored || "null") as Partial<Settings> | null) } catch { s = { ...DEFAULT_SETTINGS } }
  // first start on a phone or tablet: the light graphics setting (a saved choice always wins)
  if (!stored && isTouchDevice()) s.quality = "low"
  return s
}

/** Phones and tablets: no hover and a coarse (finger) pointer. */
export function isTouchDevice(): boolean {
  try { return typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches } catch { return false }
}

/** Whether the on-screen touch controls are used with these settings on this device. */
export function touchEnabled(s: Settings): boolean { return s.touch === "on" || (s.touch === "auto" && isTouchDevice()) }

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
    gore: raw.gore === "off" || raw.gore === "normal" ? raw.gore : "brutal",
    touch: raw.touch === "on" || raw.touch === "off" ? raw.touch : "auto",
  }
}

export function saveSettings(settings: Settings): boolean { return storageSet(SETTINGS_KEY, JSON.stringify(settings)) }

/** Loads the profile; migrates an older save if no v4 exists. Returns null when nothing usable is stored. */
export function loadProfile(now = Date.now()): Profile | null {
  for (const key of [PROFILE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = storageGet(key); if (!raw) continue
      const p = sanitizeProfile(JSON.parse(raw), now)
      if (p) { if (key !== PROFILE_KEY) saveProfile(p); return p }
    } catch { /* corrupt JSON → try the next key, then a fresh profile */ }
  }
  return null
}

const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[]
const STAFF_IDS = Object.keys(STAFF_JOBS) as StaffJob[]

/** Validates/repairs a stored profile (v4) or migrates a v2/v3 save. Returns null if it is not a profile at all. */
export function sanitizeProfile(raw: unknown, now = Date.now()): Profile | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, any>
  if (r.version === 2 || r.version === 3) return migrateLegacy(r, now)
  if (r.version !== 4 || !Number.isFinite(r.money) || !r.stash || !r.loadout || !r.structures) return null
  const stash: Partial<Record<ItemId, number>> = {}
  for (const [id, n] of Object.entries(r.stash ?? {})) if (isItemId(id)) { const v = int(n, 0, 1e7, 0); if (v > 0) stash[id] = v }
  const structures = {} as Record<StructureId, number>
  for (const id of STRUCTURE_IDS) structures[id] = int(r.structures?.[id], 0, STRUCTURES[id].max, 0)
  structures.hq = Math.max(1, structures.hq)
  const staff = {} as Record<StaffJob, number>
  for (const id of STAFF_IDS) staff[id] = int(r.staff?.[id], 0, 6, 0)
  const research = Array.isArray(r.research) ? (r.research as unknown[]).filter((x): x is ResearchId => typeof x === "string" && x in RESEARCH) : []
  const ar = r.activeResearch
  const s = r.stats || {}
  return {
    version: 4,
    callsign: typeof r.callsign === "string" && r.callsign.trim() ? r.callsign.slice(0, 24) : "VEIL-01",
    money: int(r.money, 0, 1e9, 0), xp: int(r.xp, 0, 1e9, 0), level: int(r.level, 1, 999, 1),
    stash, loadout: sanitizeLoadout(r.loadout), structures, staff,
    production: { workshop: num(r.production?.workshop, 0, 1e6, 0), clinic: num(r.production?.clinic, 0, 1e6, 0), kitchen: num(r.production?.kitchen, 0, 1e6, 0), scrapyard: num(r.production?.scrapyard, 0, 1e6, 0) },
    expeditions: Array.isArray(r.expeditions) ? (r.expeditions as any[]).filter(e => e && typeof e.destination === "string" && e.destination in EXPEDITIONS && Number.isFinite(e.endsAt) && Number.isFinite(e.id)).slice(0, 3).map(e => ({ id: e.id, destination: e.destination, crew: int(e.crew, 1, 3, 1), endsAt: e.endsAt })) : [],
    workshopAmmo: typeof r.workshopAmmo === "string" && r.workshopAmmo in AMMO ? r.workshopAmmo as AmmoId : "ammo_9mm",
    crafting: Array.isArray(r.crafting) ? (r.crafting as any[]).filter(j => j && typeof j.station === "string" && typeof j.recipe === "string" && Number.isFinite(j.endsAt)).slice(0, 8).map(j => ({ station: j.station, recipe: j.recipe, endsAt: j.endsAt })) : [],
    research,
    activeResearch: ar && typeof ar.id === "string" && ar.id in RESEARCH && Number.isFinite(ar.endsAt) ? { id: ar.id, endsAt: ar.endsAt } : null,
    contracts: {
      offers: Array.isArray(r.contracts?.offers) ? (r.contracts.offers as ContractOffer[]).filter(validContract).slice(0, 10) : [],
      active: Array.isArray(r.contracts?.active) ? (r.contracts.active as ActiveContract[]).filter(validContract).slice(0, 5).map(a => ({ ...a, progress: int(a.progress, 0, a.target, 0) })) : [],
      refreshAt: Number.isFinite(r.contracts?.refreshAt) ? r.contracts.refreshAt : 0,
    },
    base: { threat: num(r.base?.threat, 0, 100, 10), attackPending: r.base?.attackPending === true, lastAttack: Number.isFinite(r.base?.lastAttack) ? r.base.lastAttack : now },
    infection: num(r.infection, 0, 100, 0),
    raidStarted: Number.isFinite(r.raidStarted) ? r.raidStarted : 0,
    raidSecure: sanitizeSlots(r.raidSecure, 12),
    emergencyCooldown: int(r.emergencyCooldown, 0, 10, 0),
    residents: int(r.residents, 0, 30, 0),
    stats: {
      raids: int(s.raids, 0, 1e9, 0), extracts: int(s.extracts, 0, 1e9, 0), deaths: int(s.deaths, 0, 1e9, 0), kills: int(s.kills, 0, 1e9, 0),
      infectedKills: int(s.infectedKills, 0, 1e9, 0), mercKills: int(s.mercKills, 0, 1e9, 0), headshots: int(s.headshots, 0, 1e9, 0), dismembered: int(s.dismembered, 0, 1e9, 0),
      earned: int(s.earned, 0, 1e12, 0), bestRaid: int(s.bestRaid, 0, 1e12, 0), contracts: int(s.contracts, 0, 1e9, 0), defenses: int(s.defenses, 0, 1e9, 0), rescued: int(s.rescued, 0, 1e9, 0),
      bossKills: int(s.bossKills, 0, 1e9, 0),
    },
    achievements: Array.isArray(r.achievements) ? (r.achievements as unknown[]).filter((x): x is string => typeof x === "string" && ACHIEVEMENT_IDS.has(x)) : [],
    tutorialDone: r.tutorialDone === true,
    lastTick: Number.isFinite(r.lastTick) ? Math.min(r.lastTick, now) : now,
  }
}

function validContract(c: any): boolean { return !!c && typeof c.id === "string" && typeof c.kind === "string" && typeof c.title === "string" && Number.isFinite(c.target) && c.reward && Number.isFinite(c.reward.money) }

function sanitizeSlots(raw: unknown, max: number): BagSlot[] {
  if (!Array.isArray(raw)) return []
  return (raw as any[]).filter(s => s && isItemId(s.id) && Number.isFinite(s.qty) && s.qty > 0).slice(0, max).map(s => ({ id: s.id as ItemId, qty: Math.round(s.qty) }))
}

function sanitizeMods(weapon: WeaponId | null, raw: unknown): WeaponMods {
  const out: WeaponMods = {}
  if (!weapon || !raw || typeof raw !== "object") return out
  for (const [slot, att] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof att === "string" && att in ATTACHMENTS && canAttach(weapon, att as AttachmentId) && ATTACHMENTS[att as AttachmentId].slot === slot) out[slot as AttachmentSlot] = att as AttachmentId
  }
  return out
}

function weaponOrNull(id: unknown, slot: "primary" | "secondary" | "melee"): WeaponId | null { return typeof id === "string" && id in WEAPONS && WEAPONS[id as WeaponId].slot === slot ? id as WeaponId : null }
function ammoFor(weapon: WeaponId | null, raw: unknown): AmmoId | null {
  if (!weapon || !WEAPONS[weapon].caliber) return null
  return typeof raw === "string" && raw in AMMO && AMMO[raw as AmmoId].caliber === WEAPONS[weapon].caliber ? raw as AmmoId : (Object.keys(AMMO) as AmmoId[]).find(a => AMMO[a].caliber === WEAPONS[weapon].caliber) ?? null
}

function sanitizeLoadout(raw: any): Loadout {
  const lo = raw || {}
  const primary = weaponOrNull(lo.primary, "primary"), secondary = weaponOrNull(lo.secondary, "secondary")
  const armorMax = lo.armorMax === 85 ? 85 : lo.armorMax === 55 ? 55 : 0
  return {
    primary, primaryMods: sanitizeMods(primary, lo.primaryMods), primaryAmmo: ammoFor(primary, lo.primaryAmmo),
    secondary, secondaryMods: sanitizeMods(secondary, lo.secondaryMods), secondaryAmmo: ammoFor(secondary, lo.secondaryAmmo),
    melee: weaponOrNull(lo.melee, "melee") ?? "knife",
    armor: armorMax ? int(lo.armor, 0, armorMax, 0) : 0, armorMax, helmet: int(lo.helmet, 0, 50, 0), nvg: lo.nvg === true,
    backpack: lo.backpack === "pack_small" || lo.backpack === "pack_large" ? lo.backpack : "none",
    bag: sanitizeSlots(lo.bag, 24), secure: sanitizeSlots(lo.secure, 6),
  }
}

/** Converts a v2/v3 save (5 weapons, ammo packs, abstract resources) into a v4 profile. */
function migrateLegacy(r: Record<string, any>, now: number): Profile | null {
  if (!Number.isFinite(r.money) || !r.stash || !r.buildings) return null
  const stash: Partial<Record<ItemId, number>> = {}
  const add = (id: ItemId, n: number) => { if (n > 0) stash[id] = (stash[id] ?? 0) + Math.round(n) }
  const st = r.stash
  add("ammo_556", int(st.ammo, 0, 1e5, 0) * 30)
  add("medkit", int(st.medkit, 0, 1e5, 0)); add("armor", int(st.armor, 0, 1e5, 0)); add("plate", int(st.plate, 0, 1e5, 0)); add("grenade", int(st.grenade, 0, 1e5, 0))
  for (const id of ["parts", "intel", "electronics", "medical", "relic"] as ItemId[]) add(id, int(st[id], 0, 1e5, 0))
  const resources = int(r.resources, 0, 1e7, 0)
  add("scrap", Math.ceil(resources / 2)); add("wood", Math.ceil(resources / 3))
  const owned: string[] = Array.isArray(r.weapons) ? r.weapons : ["p9", "mk4"]
  const lo = r.loadout || {}
  const primary: WeaponId = typeof lo.primary === "string" && ["mk4", "vx9", "kv12", "dr7"].includes(lo.primary) && owned.includes(lo.primary) ? lo.primary : "mk4"
  for (const w of owned) if (w in WEAPONS && w !== primary && w !== "p9") add(`w_${w}` as ItemId, 1)
  add("medkit", int(lo.medkits, 0, 3, 0)); add("grenade", int(lo.grenades, 0, 3, 0))
  const b = r.buildings || {}
  const fresh = sanitizeProfile({ version: 4, money: 0, stash: {}, loadout: {}, structures: {} }, now)!
  const research = Array.isArray(r.research) ? (r.research as unknown[]).filter((x): x is ResearchId => typeof x === "string" && x in RESEARCH) : []
  const legacyArmor = int(lo.armor, 0, 200, 0)
  const armorMax = r.version === 3 ? (lo.armorMax === 85 ? 85 : legacyArmor > 0 ? 55 : 0) : legacyArmor > 0 ? 55 : 0
  const secondary: WeaponId = "p9"
  return {
    ...fresh,
    callsign: typeof r.callsign === "string" && r.callsign.trim() ? r.callsign.slice(0, 24) : "VEIL-01",
    money: int(r.money, 0, 1e9, 0), xp: int(r.xp, 0, 1e9, 0), level: int(r.level, 1, 999, 1),
    stash,
    loadout: {
      primary, primaryMods: {}, primaryAmmo: (WEAPONS[primary].caliber === "556" ? "ammo_556" : WEAPONS[primary].caliber === "9mm" ? "ammo_9mm" : WEAPONS[primary].caliber === "12g" ? "ammo_12buck" : "ammo_762") as AmmoId,
      secondary, secondaryMods: {}, secondaryAmmo: "ammo_9mm", melee: "knife",
      armor: Math.min(armorMax, legacyArmor), armorMax, helmet: 0, nvg: false, backpack: "pack_small", bag: [], secure: [],
    },
    structures: { ...fresh.structures, hq: int(b.hq, 1, 3, 1), workshop: int(b.workshop, 0, 3, 0), lab: int(b.lab, 0, 3, 0), clinic: int(b.clinic, 0, 3, 0) },
    staff: { ...fresh.staff, workshop: int(r.staff?.workshop, 0, 3, 0), lab: int(r.staff?.lab, 0, 3, 0), clinic: int(r.staff?.clinic, 0, 3, 0) },
    research,
    stats: { ...fresh.stats, raids: int(r.stats?.raids, 0, 1e9, 0), extracts: int(r.stats?.extracts, 0, 1e9, 0), deaths: int(r.stats?.deaths, 0, 1e9, 0), kills: int(r.stats?.kills, 0, 1e9, 0), mercKills: int(r.stats?.kills, 0, 1e9, 0), headshots: int(r.stats?.headshots, 0, 1e9, 0), earned: int(r.stats?.earned, 0, 1e12, 0) },
    tutorialDone: r.tutorialDone === true || int(r.stats?.extracts, 0, 1e9, 0) > 0,
    lastTick: now,
  }
}

export function saveProfile(profile: Profile): boolean {
  profile.lastTick = Date.now()
  return storageSet(PROFILE_KEY, JSON.stringify(profile))
}

export function clearProfile(): void {
  try { localStorage.removeItem(PROFILE_KEY); for (const k of LEGACY_KEYS) localStorage.removeItem(k) } catch { /* storage can be unavailable */ }
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
function int(value: unknown, min: number, max: number, fallback: number): number { return Math.round(num(value, min, max, fallback)) }
