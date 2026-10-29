import type { Profile, Settings } from "./types"

const PROFILE_KEY = "ironVeil.profile.v2"
const SETTINGS_KEY = "ironVeil.settings.v1"

export const DEFAULT_SETTINGS: Settings = { sensitivity: 0.75, volume: 0.55, muted: false, quality: "high", invertY: false }

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<Settings> | null
    if (!raw) return { ...DEFAULT_SETTINGS }
    return {
      sensitivity: clampNumber(raw.sensitivity, 0.2, 1.8, DEFAULT_SETTINGS.sensitivity),
      volume: clampNumber(raw.volume, 0, 1, DEFAULT_SETTINGS.volume),
      muted: raw.muted === true,
      quality: raw.quality === "low" ? "low" : "high",
      invertY: raw.invertY === true,
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function saveSettings(settings: Settings): boolean {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true } catch { return false }
}

export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") as Profile | null
    if (!p || p.version !== 2 || !Number.isFinite(p.money) || !p.stash || !p.buildings || !p.staff || !p.stats) return null
    return p
  } catch { return null }
}

export function saveProfile(profile: Profile): boolean {
  try {
    profile.lastTick = Date.now()
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    return true
  } catch { return false }
}

export function clearProfile(): void {
  try { localStorage.removeItem(PROFILE_KEY) } catch { /* storage can be unavailable */ }
}

export function hasProfile(): boolean {
  try { return localStorage.getItem(PROFILE_KEY) !== null } catch { return false }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
