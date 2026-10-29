import { describe, expect, it } from "vitest"
import { bagForDeath, cleanItems, cleanText, connectOnline, FALLEN_MAX_AGE_MS, FALLEN_PER_RAID, newsText, Online, type DbApi, type OnlineApis, type RoomApi, type RoomPeer, type UserApi } from "./online"
import { createProfile } from "./profile"

/** In-memory stand-ins for the artifact runtime's db / room / user. */
function fakeRuntime(uid = "u_me") {
  const docs = new Map<string, Record<string, unknown>>()
  const emitted: { topic: string; data: unknown }[] = []
  const presence: Record<string, unknown>[] = []
  const handlers = new Map<string, ((m: { topic: string; data?: unknown; peer: string; by: string | null; isMe: boolean; sameTab: boolean; kind: string }) => void)[]>()
  let peersHandler: ((c: { peers: readonly RoomPeer[] }) => void) | null = null
  const snap = (path: string) => { const id = path.split("/").pop()!, v = docs.get(path); return { id, exists: !!v, data: () => v } }
  const query = (coll: string, field?: string, dir?: string, n?: number): ReturnType<DbApi["collection"]> => ({
    orderBy: (f, d) => query(coll, f, d, n), limit: k => query(coll, field, dir, k),
    get: async () => {
      let list = [...docs.keys()].filter(k => k.startsWith(coll + "/")).map(snap)
      if (field) list.sort((a, b) => ((b.data()![field] as number) - (a.data()![field] as number)) * (dir === "desc" ? 1 : -1))
      return { docs: list.slice(0, n ?? 1000) }
    },
    onSnapshot(next) { void this.get().then(next); return () => {} },
    doc: (id?: string) => ref(`${coll}/${id ?? "x"}`),
  })
  const ref = (path: string) => ({ set: async (d: Record<string, unknown>) => { docs.set(path, structuredClone(d)) }, get: async () => snap(path) })
  const db: DbApi = { doc: ref, collection: c => query(c) }
  const room: RoomApi = {
    emit: async (topic, data) => { emitted.push({ topic, data }); for (const h of handlers.get(topic) ?? []) h({ topic, data, peer: "p_me", by: uid, isMe: true, sameTab: true, kind: "viewer" }) },
    on: (topic, h) => { handlers.set(topic, [...(handlers.get(topic) ?? []), h]); return () => {} },
    presence: async p => { presence.push(p) },
    peers: () => [],
    onPeers: h => { peersHandler = h; return () => {} },
    connected: () => true,
  }
  const user: UserApi = { id: async () => uid, profiles: async ids => Object.fromEntries(ids.map(id => [id, { name: id === "u_anna" ? "Anna K." : "", color: "#336699" }])) }
  const apis: OnlineApis = { db, room, user }
  const hear = (topic: string, data: unknown, peer = "p_x", by: string | null = "u_x") => { for (const h of handlers.get(topic) ?? []) h({ topic, data, peer, by, isMe: false, sameTab: false, kind: "viewer" }) }
  const setPeers = (peers: RoomPeer[]) => peersHandler?.({ peers })
  return { apis, docs, emitted, presence, hear, setPeers }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe("online", () => {
  it("stays offline outside a claude.ai viewer", async () => {
    expect(await connectOnline()).toBeNull()
    const o = new Online(null)
    await o.start()
    expect(o.available).toBe(false)
    o.setPresence({ mode: "raid", callsign: "X", level: 1, x: 1, z: 2 })
    expect(o.say("hallo", "X")).toBe(false)
    expect(await o.fallenBags()).toEqual([])
  })

  it("cleans other players' text: control characters, invisible characters, length", () => {
    expect(cleanText("  Hal\u0000lo​  Welt\n ", 40)).toBe("Hallo Welt")
    expect(cleanText("x".repeat(500), 160)).toHaveLength(160)
    expect(cleanText(42, 10)).toBe("")
    expect(cleanItems([{ id: "bandage", q: 3 }, { id: "nope", q: 1 }, { id: "bandage", q: -2 }, { id: "__proto__", q: 1 }, "x"])).toEqual([{ id: "bandage", qty: 3 }])
  })

  it("throttles presence and sends absolute, rounded state", async () => {
    let t = 1000
    const rt = fakeRuntime(), o = new Online(rt.apis, () => t)
    await o.start()
    o.setPresence({ mode: "raid", callsign: "Wolf", level: 4, x: 10.234, z: -3.071, yaw: 1.23456, hp: 0.83 })
    o.setPresence({ mode: "raid", callsign: "Wolf", level: 4, x: 10.6, z: -3.071, yaw: 1.23456, hp: 0.83 })
    expect(rt.presence).toHaveLength(1)
    expect(rt.presence[0]).toMatchObject({ mode: "raid", cs: "Wolf", lvl: 4, x: 10.2, z: -3.1, yaw: 1.23, hp: 0.85 })
    t += 200
    o.setPresence({ mode: "raid", callsign: "Wolf", level: 4, x: 10.6, z: -3.071, yaw: 1.23456, hp: 0.83 })
    expect(rt.presence).toHaveLength(2)
    t += 200
    o.setPresence({ mode: "raid", callsign: "Wolf", level: 4, x: 10.6, z: -3.071, yaw: 1.23456, hp: 0.83 })
    expect(rt.presence).toHaveLength(2) // unchanged: nothing sent
  })

  it("lists other players from presence, without this viewer and with names", async () => {
    const rt = fakeRuntime(), o = new Online(rt.apis)
    await o.start()
    const peer = (id: string, by: string | null, presence: Record<string, unknown>, isMe = false): RoomPeer => ({ peer: id, by, isMe, sameTab: isMe, kind: "viewer", presence, updatedAt: 1 })
    rt.setPeers([peer("p_me", "u_me", { mode: "raid", cs: "Ich" }, true), peer("p_a", "u_anna", { mode: "raid", cs: "Anna‮", x: 12, z: 40, yaw: 2 }), peer("p_b", null, { mode: "warp", x: "1e9", cs: 5 })])
    await flush(); await flush()
    const others = o.others()
    expect(others.map(p => p.peer)).toEqual(["p_a", "p_b"])
    expect(others[0]).toMatchObject({ callsign: "Anna", name: "Anna K.", mode: "raid", x: 12, z: 40 })
    expect(others[1]).toMatchObject({ callsign: "Unbekannt", mode: "menu", x: null })
    expect(o.inZone().map(p => p.peer)).toEqual(["p_a"])
  })

  it("chat: sends cleaned lines, rate limits, drops floods, news use a fixed vocabulary", async () => {
    let t = 0
    const rt = fakeRuntime(), o = new Online(rt.apis, () => t)
    await o.start()
    expect(o.say("  Hallo   Zone ", "Wolf")).toBe(true)
    expect(o.say("gleich nochmal", "Wolf")).toBe(false)
    await flush()
    expect(rt.emitted[0]).toEqual({ topic: "chat", data: { t: "Hallo Zone", cs: "Wolf" } })
    expect(o.chat.at(-1)).toMatchObject({ text: "Hallo Zone", me: true })
    for (let i = 0; i < 9; i++) rt.hear("chat", { t: `spam ${i}`, cs: "Bot" })
    expect(o.chat.filter(l => l.text.startsWith("spam"))).toHaveLength(5)
    rt.hear("news", { k: "extract", cs: "Anna", v: 12400 }, "p_n")
    rt.hear("news", { k: "<img>", cs: "Anna", v: 1 }, "p_n")
    expect(o.chat.at(-1)).toMatchObject({ news: true, text: newsText("extract", "Anna", 12400) })
    expect(o.chat.filter(l => l.news)).toHaveLength(1)
  })

  it("writes the leaderboard entry only when it changed, and reads it back sorted", async () => {
    const rt = fakeRuntime(), o = new Online(rt.apis)
    await o.start()
    const p = createProfile(); p.callsign = "Wolf"; p.stats.earned = 5000; p.stats.raids = 3
    o.submitScore(p); o.submitScore(p)
    await flush()
    expect(rt.docs.get("scores/u_me")).toMatchObject({ cs: "Wolf", earned: 5000, raids: 3 })
    rt.docs.set("scores/u_anna", { cs: "Anna", earned: 9000, raids: 7, lvl: 5, at: 1 })
    const o2 = new Online(rt.apis)
    await o2.start(); await flush(); await flush()
    expect(o2.scores.map(r => r.callsign)).toEqual(["Anna", "Wolf"])
    expect(o2.scores[1].isMe).toBe(true)
  })

  it("fallen bags: own and old ones are skipped, items cleaned, opened ones do not come back", async () => {
    const now = 10_000_000_000
    const rt = fakeRuntime(), o = new Online(rt.apis, () => now)
    await o.start()
    o.recordDeath(12.34, -40, [{ id: "bandage", qty: 2 }, { id: "ammo_9mm", qty: 30 }], "Wolf")
    await flush()
    expect(rt.docs.get("fallen/u_me")).toMatchObject({ cs: "Wolf", x: 12.3, z: -40 })
    rt.docs.set("fallen/u_anna", { cs: "Anna", x: 5, z: 6, at: now - 1000, items: [{ id: "bandage", q: 4 }, { id: "evil", q: 1 }] })
    rt.docs.set("fallen/u_old", { cs: "Alt", x: 5, z: 6, at: now - FALLEN_MAX_AGE_MS - 1, items: [{ id: "bandage", q: 1 }] })
    rt.docs.set("fallen/u_bad", { cs: "Bad", x: "nah", z: 6, at: now, items: [{ id: "bandage", q: 1 }] })
    const bags = await o.fallenBags()
    expect(bags).toHaveLength(1)
    expect(bags[0]).toMatchObject({ uid: "u_anna", callsign: "Anna", x: 5, z: 6, items: [{ id: "bandage", qty: 4 }] })
    o.claimFallen(bags[0].key)
    expect(await o.fallenBags()).toHaveLength(0)
    for (let i = 0; i < 10; i++) rt.docs.set(`fallen/u_${i}`, { cs: "N", x: 1, z: 1, at: now - i, items: [{ id: "bandage", q: 1 }] })
    expect(await o.fallenBags()).toHaveLength(FALLEN_PER_RAID)
  })

  it("a fallen bag keeps the most valuable stacks", () => {
    const bag = bagForDeath([{ id: "bandage", qty: 1 }, { id: "ammo_9mm", qty: 20 }])
    expect(bag.length).toBe(2)
    expect(bag.every(s => s.q > 0)).toBe(true)
  })
})
