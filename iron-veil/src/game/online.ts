/**
 * online.ts — the shared world when the game runs as a claude.ai artifact:
 *  - who is online right now and where they are in the zone (room presence → ghost players, tactical map),
 *  - a radio chat and short news ("X got out with 12.400 $") on room topics,
 *  - a leaderboard (one db document per player: scores/<id>),
 *  - the bag of each player's last death in the zone (fallen/<id>), which other players can find in their raids.
 * Everything runs through window.claude.use("db" | "room" | "user") and degrades to offline when the page runs
 * anywhere else (dev server, the single-file HTML): connectOnline() then resolves null and the game never notices.
 * All data from other players is untrusted: cleaned and clamped here, drawn as text (textContent / canvas) only.
 */
import { ITEMS, type ItemId } from "./items"
import type { LootStack, Profile } from "./types"

// ───────────────────────────── the parts of the artifact runtime this file uses ─────────────────────────────

interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface QuerySnap { docs: DocSnap[] }
interface DocRef { set(data: Record<string, unknown>): Promise<void>; get(): Promise<DocSnap> }
interface DbQuery {
  orderBy(field: string, dir?: "asc" | "desc"): DbQuery
  limit(n: number): DbQuery
  get(): Promise<QuerySnap>
  onSnapshot(next: (snap: QuerySnap) => void, error?: (e: { code: string }) => void): () => void
}
interface DbCollection extends DbQuery { doc(id?: string): DocRef }
export interface DbApi { doc(path: string): DocRef; collection(path: string): DbCollection }

export interface RoomPeer {
  peer: string; by: string | null; isMe: boolean; sameTab: boolean; kind: string
  presence: Readonly<Record<string, unknown>>; updatedAt: number
}
interface RoomMessage { topic: string; data?: unknown; peer: string; by: string | null; isMe: boolean; sameTab: boolean; kind: string }
export interface RoomApi {
  emit(topic: string, data?: unknown): Promise<void>
  on(topic: string, handler: (msg: RoomMessage) => void, onError?: (e: { code: string }) => void): () => void
  presence(patch: Record<string, unknown>): Promise<void>
  peers(): readonly RoomPeer[]
  onPeers(handler: (change: { peers: readonly RoomPeer[] }) => void, onError?: (e: { code: string }) => void): () => void
  connected(): boolean
}
export interface UserApi {
  id(): Promise<string | null>
  profiles(ids: readonly string[]): Promise<Record<string, { name: string; color: string }>>
}
export interface OnlineApis { db: DbApi | null; room: RoomApi | null; user: UserApi | null }

interface ClaudeRuntime { use(name: string): Promise<unknown> }

/** The artifact runtime's capabilities, or null when the page does not run inside a claude.ai viewer. */
export async function connectOnline(): Promise<OnlineApis | null> {
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude
  if (!claude || typeof claude.use !== "function") return null
  const use = <T>(name: string) => claude.use(name).then(v => (v ?? null) as T | null, () => null)
  const [db, room, user] = await Promise.all([use<DbApi>("db"), use<RoomApi>("room"), use<UserApi>("user")])
  return db || room ? { db, room, user } : null
}

// ───────────────────────────── shared data, as this page sees it ─────────────────────────────

export type OnlineMode = "menu" | "base" | "raid" | "defense" | "dead"
const MODES: readonly OnlineMode[] = ["menu", "base", "raid", "defense", "dead"]
export const MODE_NAMES: Record<OnlineMode, string> = { menu: "im Menü", base: "in der Basis", raid: "in der Zone", defense: "verteidigt die Basis", dead: "gefallen" }

/** What this page tells everyone else about its player (room presence, a few times a second at most). */
export interface PresenceState { mode: OnlineMode; callsign: string; level: number; x?: number; z?: number; yaw?: number; crouch?: boolean; hp?: number }

export interface OnlinePeer {
  peer: string
  uid: string | null
  callsign: string
  /** Account name as this viewer sees it ("" when unknown). */
  name: string
  color: string
  mode: OnlineMode
  level: number
  x: number | null
  z: number | null
  yaw: number
  crouch: boolean
  hp: number
  updatedAt: number
}

export interface ScoreRow {
  uid: string; callsign: string; name: string; level: number
  raids: number; extracts: number; deaths: number; infectedKills: number; mercKills: number; rescued: number
  earned: number; bestRaid: number; at: number; isMe: boolean
}

export interface FallenBag { key: string; uid: string; callsign: string; x: number; z: number; items: LootStack[]; at: number }

export interface ChatLine { at: number; from: string; text: string; me: boolean; news: boolean }

export type NewsKind = "extract" | "death" | "rescue" | "defense"

/** Fallen bags older than this are not placed in raids any more. */
export const FALLEN_MAX_AGE_MS = 72 * 3600 * 1000
/** Bags placed per raid at most. */
export const FALLEN_PER_RAID = 6
const FALLEN_ITEMS = 12
const CHAT_KEEP = 60
const CHAT_MAX = 160
const MAP_LIMIT = 2000

// ───────────────────────────── cleaning untrusted input ─────────────────────────────

/** Strips control and invisible characters, collapses whitespace, cuts to `max` characters. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  const s = v.replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/gu, "").replace(/\s+/g, " ").trim()
  return [...s].slice(0, max).join("")
}
function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
}
function int(v: unknown, hi = 1e9): number { return Math.round(num(v, 0, hi, 0)) }
export function cleanCallsign(v: unknown): string { return cleanText(v, 20) || "Unbekannt" }

/** Item stacks from another player's document: known ids only, sane counts, at most FALLEN_ITEMS stacks. */
export function cleanItems(v: unknown): LootStack[] {
  if (!Array.isArray(v)) return []
  const out: LootStack[] = []
  for (const e of v.slice(0, FALLEN_ITEMS * 2)) {
    if (!e || typeof e !== "object") continue
    const id = (e as { id?: unknown }).id, qty = (e as { q?: unknown }).q
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(ITEMS, id)) continue
    const def = ITEMS[id as ItemId], q = Math.round(num(qty, 0, def.stack, 0))
    if (q > 0) out.push({ id: id as ItemId, qty: q })
    if (out.length >= FALLEN_ITEMS) break
  }
  return out
}

export function peerFromPresence(p: RoomPeer, name = "", color = "#7fb4c9"): OnlinePeer {
  const s = p.presence ?? {}
  const mode = MODES.includes(s.mode as OnlineMode) ? s.mode as OnlineMode : "menu"
  const hasPos = typeof s.x === "number" && typeof s.z === "number" && Number.isFinite(s.x) && Number.isFinite(s.z)
  return {
    peer: p.peer, uid: p.by, callsign: cleanCallsign(s.cs), name, color, mode, level: int(s.lvl, 999) || 1,
    x: hasPos ? num(s.x, -MAP_LIMIT, MAP_LIMIT, 0) : null, z: hasPos ? num(s.z, -MAP_LIMIT, MAP_LIMIT, 0) : null,
    yaw: num(s.yaw, -10, 10, 0), crouch: s.cr === true, hp: num(s.hp, 0, 1, 1), updatedAt: p.updatedAt,
  }
}

export function scoreFromDoc(d: DocSnap, me: string | null): ScoreRow | null {
  const v = d.data()
  if (!d.exists || !v) return null
  return {
    uid: d.id, callsign: cleanCallsign(v.cs), name: "", level: int(v.lvl, 999) || 1,
    raids: int(v.raids), extracts: int(v.ext), deaths: int(v.deaths), infectedKills: int(v.inf), mercKills: int(v.merc), rescued: int(v.resc),
    earned: int(v.earned, 1e12), bestRaid: int(v.best, 1e12), at: int(v.at, 1e15), isMe: d.id === me,
  }
}

export function fallenFromDoc(d: DocSnap, me: string | null, now: number): FallenBag | null {
  const v = d.data()
  if (!d.exists || !v || d.id === me) return null
  const at = int(v.at, 1e15)
  if (now - at > FALLEN_MAX_AGE_MS || at > now + 60_000) return null
  if (typeof v.x !== "number" || typeof v.z !== "number" || !Number.isFinite(v.x) || !Number.isFinite(v.z)) return null
  const items = cleanItems(v.items)
  if (!items.length) return null
  return { key: `${d.id}:${at}`, uid: d.id, callsign: cleanCallsign(v.cs), x: num(v.x, -MAP_LIMIT, MAP_LIMIT, 0), z: num(v.z, -MAP_LIMIT, MAP_LIMIT, 0), items, at }
}

/** German news line for a news message (fixed vocabulary: no free text from other players). */
export function newsText(kind: NewsKind, callsign: string, value: number): string {
  const v = Math.max(0, Math.round(value))
  switch (kind) {
    case "extract": return `${callsign} ist entkommen · ${v.toLocaleString("de-DE")} $ Beute`
    case "death": return `${callsign} ist in der Zone gefallen · Ausrüstung liegt dort`
    case "rescue": return `${callsign} hat ${v} Überlebende${v === 1 ? "n" : ""} gerettet`
    case "defense": return `${callsign} hat die Basis gegen ${v} Infizierte gehalten`
  }
}

/** Most valuable stacks first (what a fallen bag keeps). */
export function bagForDeath(lost: readonly LootStack[]): { id: ItemId; q: number }[] {
  return [...lost].filter(s => ITEMS[s.id] && s.qty > 0)
    .sort((a, b) => ITEMS[b.id].value * b.qty - ITEMS[a.id].value * a.qty)
    .slice(0, FALLEN_ITEMS).map(s => ({ id: s.id, q: Math.min(s.qty, ITEMS[s.id].stack) }))
}

// ───────────────────────────── the service ─────────────────────────────

/** Fallen bags this viewer already opened (a per-browser convenience so the same bag is not farmed every raid). */
const TAKEN_KEY = "iv.fallenTaken"
function loadTaken(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(TAKEN_KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.filter(s => typeof s === "string").slice(-200) : []) } catch { return new Set() }
}
function saveTaken(s: Set<string>): void { try { localStorage.setItem(TAKEN_KEY, JSON.stringify([...s].slice(-200))) } catch { /* storage blocked */ } }

export class Online {
  uid: string | null = null
  private peerList: OnlinePeer[] = []
  scores: ScoreRow[] = []
  readonly chat: ChatLine[] = []
  private names = new Map<string, { name: string; color: string }>()
  private unsub: (() => void)[] = []
  private listeners = new Set<() => void>()
  private chatListeners = new Set<(line: ChatLine) => void>()
  private lastPresence = ""
  private presenceAt = 0
  private lastScore = ""
  private lastSay = -Infinity
  private spam = new Map<string, number[]>()
  private taken = loadTaken()
  private dead = false
  private changeQueued = false

  constructor(private apis: OnlineApis | null, private now: () => number = () => Date.now()) {}

  /** Connected to the shared world (room or db available). */
  get available(): boolean { return !!this.apis && !this.dead }
  get canChat(): boolean { return !!this.apis?.room && !this.dead }
  get canStore(): boolean { return !!this.apis?.db && !!this.uid && !this.dead }

  async start(): Promise<void> {
    const a = this.apis
    if (!a) return
    this.uid = a.user ? await a.user.id().catch(() => null) : null
    if (a.room) {
      const fail = () => this.changed()
      this.unsub.push(a.room.onPeers(c => this.readPeers(c.peers), fail))
      this.unsub.push(a.room.on("chat", m => this.hearChat(m), fail))
      this.unsub.push(a.room.on("news", m => this.hearNews(m), fail))
    }
    if (a.db) {
      this.unsub.push(a.db.collection("scores").orderBy("earned", "desc").limit(100).onSnapshot(s => {
        this.scores = s.docs.map(d => scoreFromDoc(d, this.uid)).filter((r): r is ScoreRow => !!r)
        void this.resolveNames(this.scores.map(r => r.uid))
        this.changed()
      }, () => this.changed()))
    }
  }

  dispose(): void { this.dead = true; for (const u of this.unsub) u(); this.unsub = []; this.listeners.clear(); this.chatListeners.clear() }

  /** Called (at most once per frame) when peers, scores or chat changed. */
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  onChat(fn: (line: ChatLine) => void): () => void { this.chatListeners.add(fn); return () => this.chatListeners.delete(fn) }

  /** Everyone else online right now (this viewer's own tabs excluded). */
  others(): OnlinePeer[] { return this.peerList }
  /** Other players in the zone with a position. */
  inZone(): OnlinePeer[] { return this.peerList.filter(p => p.mode === "raid" && p.x !== null) }

  displayName(uid: string | null, callsign: string): string {
    const n = uid ? this.names.get(uid)?.name : ""
    return n && n !== callsign ? `${callsign} (${n})` : callsign
  }

  /** Throttled: at most ~8 updates a second, and only when something visible changed. */
  setPresence(s: PresenceState): void {
    const room = this.apis?.room
    if (!room || this.dead) return
    const t = this.now()
    const patch: Record<string, unknown> = {
      mode: s.mode, cs: cleanCallsign(s.callsign), lvl: s.level,
      x: s.x === undefined ? null : Math.round(s.x * 10) / 10, z: s.z === undefined ? null : Math.round(s.z * 10) / 10,
      yaw: s.yaw === undefined ? null : Math.round(s.yaw * 100) / 100, cr: s.crouch ? true : null, hp: s.hp === undefined ? null : Math.round(s.hp * 20) / 20,
    }
    const key = JSON.stringify(patch)
    if (key === this.lastPresence) return
    const moving = s.mode === "raid" || s.mode === "defense"
    if (t - this.presenceAt < (moving ? 120 : 1000) && this.lastPresence) return
    this.lastPresence = key; this.presenceAt = t
    room.presence(patch).catch(() => { this.lastPresence = "" })
  }

  /** Sends a chat line (rate limited locally). Returns false when it could not be sent. */
  say(text: string, callsign: string): boolean {
    const room = this.apis?.room, t = this.now(), clean = cleanText(text, CHAT_MAX)
    if (!room || this.dead || !clean || t - this.lastSay < 1200) return false
    this.lastSay = t
    room.emit("chat", { t: clean, cs: cleanCallsign(callsign) }).catch(() => this.pushChat({ at: t, from: "Funk", text: "Nachricht nicht gesendet (keine Sendeberechtigung)", me: false, news: true }))
    return true
  }

  /** News for everyone online (fixed vocabulary). */
  announce(kind: NewsKind, callsign: string, value = 0): void {
    const room = this.apis?.room
    if (!room || this.dead) return
    room.emit("news", { k: kind, cs: cleanCallsign(callsign), v: Math.max(0, Math.round(value)) }).catch(() => {})
  }

  /** Writes this player's leaderboard entry when it changed. */
  submitScore(p: Profile): void {
    const db = this.apis?.db
    if (!db || !this.uid || this.dead) return
    const s = p.stats
    const doc = { cs: cleanCallsign(p.callsign), lvl: p.level, raids: s.raids, ext: s.extracts, deaths: s.deaths, inf: s.infectedKills, merc: s.mercKills, resc: s.rescued, earned: s.earned, best: s.bestRaid }
    const key = JSON.stringify(doc)
    if (key === this.lastScore) return
    this.lastScore = key
    db.doc(`scores/${this.uid}`).set({ ...doc, at: this.now() }).catch(() => { this.lastScore = "" })
  }

  /** Leaves this player's lost gear where they fell, for other players to find. */
  recordDeath(x: number, z: number, lost: readonly LootStack[], callsign: string): void {
    const db = this.apis?.db, items = bagForDeath(lost)
    if (!db || !this.uid || this.dead || !items.length) return
    db.doc(`fallen/${this.uid}`).set({ cs: cleanCallsign(callsign), x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, at: this.now(), items }).catch(() => {})
  }

  /** Other players' fallen bags for a new raid: recent, not opened by this viewer yet, at most FALLEN_PER_RAID. */
  async fallenBags(): Promise<FallenBag[]> {
    const db = this.apis?.db
    if (!db || this.dead) return []
    try {
      const snap = await db.collection("fallen").orderBy("at", "desc").limit(60).get()
      const t = this.now()
      return snap.docs.map(d => fallenFromDoc(d, this.uid, t)).filter((b): b is FallenBag => !!b && !this.taken.has(b.key)).slice(0, FALLEN_PER_RAID)
    } catch { return [] }
  }

  /** A fallen bag was opened: it does not come back in this browser's later raids. */
  claimFallen(key: string): void { if (this.taken.has(key)) return; this.taken.add(key); saveTaken(this.taken) }

  // ───────────── incoming

  private readPeers(peers: readonly RoomPeer[]): void {
    const list: OnlinePeer[] = []
    const ids: string[] = []
    for (const p of peers) {
      if (p.isMe || p.kind !== "viewer") continue
      const known = p.by ? this.names.get(p.by) : undefined
      list.push(peerFromPresence(p, known?.name ?? "", known?.color))
      if (p.by && !known) ids.push(p.by)
    }
    this.peerList = list.slice(0, 64)
    if (ids.length) void this.resolveNames(ids)
    this.changed()
  }

  private async resolveNames(ids: string[]): Promise<void> {
    const user = this.apis?.user
    const missing = [...new Set(ids)].filter(id => !this.names.has(id))
    if (!user || !missing.length) return
    try {
      const ps = await user.profiles(missing)
      for (const id of missing) { const p = ps[id]; this.names.set(id, { name: cleanText(p?.name, 40), color: typeof p?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : "#7fb4c9" }) }
    } catch { return }
    for (const p of this.peerList) { const n = p.uid ? this.names.get(p.uid) : undefined; if (n) { p.name = n.name; p.color = n.color } }
    for (const r of this.scores) { const n = this.names.get(r.uid); if (n) r.name = n.name }
    this.changed()
  }

  /** At most 5 messages per 6 s per sender; more are dropped. */
  private flood(peer: string): boolean {
    const t = this.now(), list = (this.spam.get(peer) ?? []).filter(x => t - x < 6000)
    list.push(t); this.spam.set(peer, list)
    return list.length > 5
  }

  private hearChat(m: RoomMessage): void {
    const d = (m.data ?? {}) as { t?: unknown; cs?: unknown }
    const text = cleanText(d.t, CHAT_MAX)
    if (!text || (!m.isMe && this.flood(m.peer))) return
    this.pushChat({ at: this.now(), from: this.displayName(m.by, cleanCallsign(d.cs)), text, me: m.isMe, news: false })
  }

  private hearNews(m: RoomMessage): void {
    const d = (m.data ?? {}) as { k?: unknown; cs?: unknown; v?: unknown }
    const kinds: NewsKind[] = ["extract", "death", "rescue", "defense"]
    if (!kinds.includes(d.k as NewsKind) || (!m.isMe && this.flood(m.peer))) return
    this.pushChat({ at: this.now(), from: "Funk", text: newsText(d.k as NewsKind, cleanCallsign(d.cs), num(d.v, 0, 1e9, 0)), me: m.isMe, news: true })
  }

  private pushChat(line: ChatLine): void {
    this.chat.push(line)
    if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP)
    for (const fn of this.chatListeners) fn(line)
    this.changed()
  }

  private changed(): void {
    if (this.changeQueued) return
    this.changeQueued = true
    const run = () => { this.changeQueued = false; for (const fn of this.listeners) fn() }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else queueMicrotask(run)
  }
}
