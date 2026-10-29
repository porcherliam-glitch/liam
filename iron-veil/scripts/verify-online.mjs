// verify-online.mjs — the online features in the real build, with a stand-in for the claude.ai artifact runtime
// (window.claude.use("db" | "room" | "user")) and a second, simulated player "ANNA-7":
// the ONLINE screen (who is here, leaderboard, radio), sending a radio line, the echo of the other player in the
// zone, her fallen gear lying in the zone, the radio line from inside a raid (Enter), presence reports, and on
// death: the news, the gear left where the player fell and the leaderboard entry.
// Usage: npm run build && npm run verify:online
import { openGame, richProfile } from "./browser-lib.mjs"

/** Runs in the page before the game: an in-memory db, a room with one other player, a user with an id. */
function fakeRuntime() {
  const now = Date.now()
  const docs = new Map()
  docs.set("scores/u_anna", { cs: "ANNA-7", lvl: 12, raids: 40, ext: 31, deaths: 9, inf: 812, merc: 40, resc: 6, earned: 250000, best: 31000, at: now })
  docs.set("scores/u_bob", { cs: "Bob<b>", lvl: 3, raids: 5, ext: 2, deaths: 3, inf: 60, merc: 1, resc: 0, earned: 9000, best: 4000, at: now })
  const listeners = []
  const snap = path => { const v = docs.get(path); return { id: path.split("/").pop(), exists: !!v, data: () => v && JSON.parse(JSON.stringify(v)), metadata: { fromCache: false, hasPendingWrites: false } } }
  const query = (coll, field, dir, n) => ({
    orderBy: (f, d) => query(coll, f, d, n), limit: k => query(coll, field, dir, k),
    async get() {
      const list = [...docs.keys()].filter(k => k.startsWith(coll + "/") && k.split("/").length === 2).map(snap)
      if (field) list.sort((a, b) => ((b.data()[field] ?? 0) - (a.data()[field] ?? 0)) * (dir === "desc" ? 1 : -1))
      const out = list.slice(0, n ?? 1000)
      return { docs: out, size: out.length, empty: !out.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }
    },
    onSnapshot(next) { const fire = () => this.get().then(next); listeners.push(fire); fire(); return () => {} },
    doc: id => ref(`${coll}/${id}`),
  })
  const ref = path => ({ id: path.split("/").pop(), path, async set(d) { docs.set(path, JSON.parse(JSON.stringify(d))); listeners.forEach(f => f()) }, get: async () => snap(path) })
  const handlers = {}, peerHandlers = []
  let peers = [{ peer: "p_me", by: "u_me", isMe: true, sameTab: true, kind: "viewer", guest: false, presence: {}, updatedAt: now }]
  const firePeers = () => { const p = Object.freeze([...peers]); for (const h of peerHandlers) h({ peers: p, joined: [], left: [], updated: [] }) }
  const msg = (topic, data, peer, by, isMe) => ({ topic, data, peer, by, isMe, sameTab: isMe, kind: "viewer", guest: false })
  const room = {
    async emit(topic, data) { window.__fake.emitted.push({ topic, data }); for (const h of handlers[topic] ?? []) h(msg(topic, data, "p_me", "u_me", true)) },
    on(topic, h) { (handlers[topic] ??= []).push(h); return () => {} },
    async presence(p) { Object.assign(window.__fake.presence, p); window.__fake.presenceCalls++ },
    peers: () => peers,
    onPeers(h) { peerHandlers.push(h); setTimeout(firePeers, 0); return () => {} },
    connected: () => true,
  }
  const user = {
    id: async () => "u_me", isOwner: async () => true, canEdit: async () => true, can: async () => true,
    profiles: async ids => Object.fromEntries([].concat(ids).map(id => [id, { id, name: id === "u_anna" ? "Anna Beispiel" : "", color: "#e07a5f", avatarUrl: "", email: null, isMe: id === "u_me", guest: false }])),
  }
  window.__fake = {
    docs, emitted: [], presence: {}, presenceCalls: 0,
    setPeer(id, by, presence) { peers = peers.filter(p => p.peer !== id); if (presence) peers.push({ peer: id, by, isMe: false, sameTab: false, kind: "viewer", guest: false, presence, updatedAt: Date.now() }); firePeers() },
    hear(topic, data, peer = "p_anna", by = "u_anna") { for (const h of handlers[topic] ?? []) h(msg(topic, data, peer, by, false)) },
  }
  window.claude = { use: async name => ({ db: { doc: ref, collection: c => query(c) }, room, user })[name] ?? null }
}

const g = await openGame({ profile: richProfile(), initScript: fakeRuntime })
const { page, check } = g
const probe = () => page.evaluate(() => window.__ironVeil.online())
const fake = (fn, arg) => page.evaluate(fn, arg)
try {
  await g.until(() => window.__ironVeil.online().available)
  check(true, "Online verbunden (Ersatz-Laufzeit)")
  await fake(() => window.__fake.setPeer("p_anna", "u_anna", { mode: "menu", cs: "ANNA-7", lvl: 12 }))
  await g.until(() => window.__ironVeil.online().others === 1)
  await g.until(() => document.querySelector(".footer-online")?.textContent.includes("1 WEITERER SPIELER"))
  check(true, "Hauptmenü zeigt den anderen Spieler")
  check((await fake(() => window.__fake.docs.get("scores/u_me")))?.cs === "VEIL-TEST", "Eigener Bestenlisten-Eintrag beim Start geschrieben")

  // ── ONLINE screen ──
  await g.action("online")
  await g.until(() => document.querySelectorAll(".online-board .board-row").length >= 3)
  const board = await page.locator(".online-board").innerText()
  check(board.indexOf("ANNA-7") < board.indexOf("VEIL-TEST") && board.includes("Anna Beispiel"), "Bestenliste sortiert, mit Kontonamen")
  check(board.includes("Bob<b>") && !(await page.locator(".online-board b b").count()), "Fremder Text wird als Text gezeigt, nicht als HTML")
  check((await page.locator(".online-peers").innerText()).includes("ANNA-7"), "Spielerliste zeigt ANNA-7")
  await page.locator(".chat-form input").fill("Hallo Zone!")
  await page.locator(".chat-form input").press("Enter")
  await g.until(() => document.querySelector(".online-chat")?.textContent.includes("Hallo Zone!"))
  check((await fake(() => window.__fake.emitted.find(e => e.topic === "chat")?.data.t)) === "Hallo Zone!", "Funkspruch gesendet")
  await fake(() => window.__fake.hear("chat", { t: "Bin am Hafen, wer kommt mit?", cs: "ANNA-7" }))
  await g.until(() => document.querySelector(".online-chat")?.textContent.includes("Hafen"))
  await g.action("board-sort", "infectedKills")
  await g.shot("online-01-screen.png")

  // ── raid: her gear and her echo ──
  await page.evaluate(() => window.__ironVeil.toMenu()); await g.frames(2)
  await fake(() => { window.__fake.docs.set("fallen/u_anna", { cs: "ANNA-7", x: 0, z: 0, at: Date.now() - 60000, items: [{ id: "medkit", q: 2 }, { id: "ammo_556", q: 60 }, { id: "bogus", q: 3 }] }) })
  await page.evaluate(() => window.__ironVeil.deploy())
  await g.until(() => window.__ironVeil.snapshot().mode === "raid", null, 60000)
  await page.evaluate(() => window.__ironVeil.godMode(true))
  await g.until(() => window.__ironVeil.online().ground.some(x => x.fallen))
  const bag = (await probe()).ground.find(x => x.fallen)
  check(bag.name === "Ausrüstung von ANNA-7" && bag.items === 2, `Ausrüstung der gefallenen Spielerin liegt in der Zone (${bag.items} Stapel)`)
  const me = await g.snapshot()
  await fake(([x, z]) => window.__fake.setPeer("p_anna", "u_anna", { mode: "raid", cs: "ANNA-7", lvl: 12, x, z, yaw: 2.6 }), [me.player.x + 1.5, me.player.z - 4])
  await g.until(() => window.__ironVeil.online().echoes === 1)
  check((await probe()).inZone === 1, "Echo der anderen Spielerin in der Zone")
  await g.until(() => window.__fake.presence.mode === "raid" && typeof window.__fake.presence.x === "number")
  const pres = await fake(() => window.__fake.presence)
  check(Math.abs(pres.x - me.player.x) < 3 && pres.cs === "VEIL-TEST", "Eigene Position wird gemeldet")
  await page.evaluate(([x, z]) => window.__ironVeil.lookAt(x, z, 1.4), [me.player.x + 1.5, me.player.z - 4])
  await g.frames(6); await g.shot("online-02-echo.png")

  // ── radio from inside the raid ──
  await page.keyboard.press("Enter")
  await g.until(() => window.__ironVeil.screen() === "chat")
  await page.keyboard.type("Komme zu dir")
  await page.keyboard.press("Enter")
  await g.until(() => window.__ironVeil.screen() === "playing")
  check((await fake(() => window.__fake.emitted.filter(e => e.topic === "chat").length)) === 2, "Funkspruch aus dem Einsatz (Enter)")
  await fake(() => window.__fake.hear("news", { k: "extract", cs: "ANNA-7", v: 18250 }))
  await g.until(() => document.querySelector(".hud-chat")?.textContent.includes("entkommen"))
  await g.frames(3); await g.shot("online-03-hud-chat.png")

  // ── death: news, gear where the player fell, leaderboard ──
  await page.evaluate(() => { window.__ironVeil.godMode(false); window.__ironVeil.damage(999) })
  await g.until(() => window.__ironVeil.screen() === "result", null, 60000)
  await g.until(() => !!window.__fake.docs.get("fallen/u_me"))
  const fallen = await fake(() => window.__fake.docs.get("fallen/u_me"))
  check(fallen.items.length > 0 && fallen.cs === "VEIL-TEST", `Eigene Ausrüstung bleibt für andere liegen (${fallen.items.length} Stapel)`)
  check(await fake(() => window.__fake.emitted.some(e => e.topic === "news" && e.data.k === "death")), "Nachricht an alle: gefallen")
  check((await fake(() => window.__fake.docs.get("scores/u_me").deaths)) === 2, "Bestenliste aktualisiert (Tode 2)")
  check((await page.locator(".result-loot").innerText()).includes("andere Spieler können sie finden"), "Ergebnis: Hinweis auf zurückgelassene Ausrüstung")
  check(g.errors.length === 0, `Keine Konsolenfehler (${g.errors.length})${g.errors.length ? ": " + g.errors[0] : ""}`)
  console.log("verify-online: alle Prüfungen bestanden")
} finally { await g.close() }
