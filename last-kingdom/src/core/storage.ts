// Local persistence. localStorage is the primary store (synchronous, always available in browsers).
// Every read is guarded: blocked storage (private windows, file:// quirks) must never crash the game.

const PREFIX = "lastKingdom."

const memoryFallback = new Map<string, string>()

function canUseLocalStorage(): boolean {
  try {
    const key = PREFIX + "probe"
    localStorage.setItem(key, "1")
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

const hasLocal = typeof localStorage !== "undefined" && canUseLocalStorage()

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = hasLocal ? localStorage.getItem(PREFIX + key) : memoryFallback.get(PREFIX + key) ?? null
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    const raw = JSON.stringify(value)
    if (hasLocal) localStorage.setItem(PREFIX + key, raw)
    else memoryFallback.set(PREFIX + key, raw)
    return true
  } catch {
    return false
  }
}

export function removeKey(key: string): void {
  try {
    if (hasLocal) localStorage.removeItem(PREFIX + key)
    else memoryFallback.delete(PREFIX + key)
  } catch {
    /* ignore */
  }
}

export function listKeys(prefix: string): string[] {
  const out: string[] = []
  try {
    if (hasLocal) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length))
      }
    } else {
      for (const k of memoryFallback.keys()) if (k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length))
    }
  } catch {
    /* ignore */
  }
  return out
}

export const storageAvailable = hasLocal
