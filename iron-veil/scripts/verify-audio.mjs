/**
 * verify-audio.mjs — automated checks for the procedural sound system (src/game/audio.ts) through the bench page
 * dev-audio.html. Starts the Vite dev server itself (`npx vite --port 5181 --strictPort`) and checks in Chromium:
 *  - no AudioContext before a user gesture; after a click it runs
 *  - every SfxId plays 2D and at the position presets (left/right/behind/far) without page/console errors
 *  - ambience: every bed (menu/dawn/day/dusk/night/harbor/base, unknown ids tolerated), rapid switching, crossfade
 *    clean-up, events fire; intensity + heartbeat start/stop the clock
 *  - 200 synchronous + 200 timed (15/s) shot_vx9 calls keep the voice count bounded (≤ 40, per-id cap)
 *  - hordes: 40 zombie_groan at once (per-id cap), 300 mixed infected/gore calls (group budgets 10/8), nearest kept
 *  - suppressed shots (≈ -10 dB, short tail), melee light/heavy via rate, far screams/roars, stepSound("grass")
 *  - OfflineAudioContext renders through the full chain: every sound non-silent with peak < 1.0, stereo side for
 *    sources right/left at several yaws, distance attenuation, speed-of-sound delay, rear muffling, reverb share,
 *    weapon character, rapid fire without clipping, ambience/heartbeat/tension levels
 *  - dispose() releases timers, beds and the context
 * Usage: node scripts/verify-audio.mjs   (exit code 1 on any failure)
 */
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const { chromium } = await import(new URL("../node_modules/playwright/index.mjs", import.meta.url).href)
const PORT = 5181, PAGE = `http://localhost:${PORT}/dev-audio.html`
const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true })
let serverLog = ""; server.stdout.on("data", d => { serverLog += d }); server.stderr.on("data", d => { serverLog += d })
const stopServer = () => { try { process.kill(-server.pid, "SIGTERM") } catch { /* already gone */ } }
process.on("exit", stopServer)

const CONTRACT_IDS = [
  "shot_p9", "shot_mk4", "shot_vx9", "shot_kv12", "shot_dr7", "enemy_rifle", "enemy_smg", "enemy_shotgun", "enemy_sniper",
  "dry_fire", "reload_out", "reload_in", "reload_bolt", "pump", "weapon_switch", "ads_in",
  "hit_body", "hit_head", "hit_armor", "kill", "impact_concrete", "impact_metal", "impact_dirt", "whiz",
  "hurt", "armor_absorb", "heal", "pickup", "crate_open", "body_search",
  "step_asphalt", "step_concrete", "step_metal", "step_gravel", "step_dirt", "step_wood", "land",
  "grenade_pin", "grenade_bounce", "explosion", "extract_call", "extract_tick", "helicopter", "alert", "radio",
  "ui_click", "ui_hover", "ui_buy", "ui_error", "build", "win", "lose", "level_up", "flashlight",
  // phase 2: zombie extraction-survival
  "shot_r44", "shot_k5", "shot_sr74", "shot_br10", "shot_sg8", "shot_falke", "shot_lm60",
  "bolt_cycle", "revolver_open", "revolver_close", "shell_insert", "lmg_belt", "melee_swing", "melee_hit_flesh", "melee_hit_wall",
  "gore_splat", "gore_burst", "bone_crack", "gib_land", "blood_drip",
  "zombie_groan", "zombie_alert", "zombie_scream", "zombie_attack", "zombie_spit", "zombie_pain", "zombie_death", "zombie_crawl", "boss_roar", "acid_sizzle",
  "molotov_break", "fire_burn", "eat", "drink", "bandage", "syringe", "zipper", "item_drop", "loot_take",
  "airdrop_plane", "airdrop_land", "door", "base_alarm", "wave_start", "build_complete", "step_grass",
]
const INFECTED_IDS = ["zombie_groan", "zombie_alert", "zombie_attack", "zombie_spit", "zombie_pain", "zombie_death", "zombie_crawl"]
const GORE_IDS = ["gore_splat", "gore_burst", "bone_crack", "gib_land", "blood_drip"]
let failed = 0
const check = (ok, message, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${message}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++ }
const db = x => x > 0 ? 20 * Math.log10(x) : -Infinity
const f1 = x => Number.isFinite(x) ? x.toFixed(1) : "-inf"
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForServer() {
  for (let i = 0; i < 200; i++) { try { const r = await fetch(PAGE); if (r.ok) return } catch { /* not up yet */ } await sleep(150) }
  throw new Error(`Vite-Server auf Port ${PORT} nicht erreichbar:\n${serverLog}`)
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
try {
  await waitForServer()
  const page = await browser.newPage()
  const errors = [], warnings = []
  page.on("pageerror", e => errors.push(String(e)))
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); else if (m.type() === "warning") warnings.push(m.text()) })
  await page.goto(PAGE); await page.waitForFunction(() => window.__audioBench?.ready === true)
  const stats = () => page.evaluate(() => window.__audioBench.audio.stats)
  const an = (events, opts) => page.evaluate(([e, o]) => window.__audioBench.analyze(e, o), [events, opts])
  const ids = await page.evaluate(() => window.__audioBench.ids)
  const missing = CONTRACT_IDS.filter(id => !ids.includes(id)), extra = ids.filter(id => !CONTRACT_IDS.includes(id))
  check(missing.length === 0, `Alle ${CONTRACT_IDS.length} Sound-IDs des Vertrags vorhanden`, `${ids.length} registriert${missing.length ? `, fehlend: ${missing.join(", ")}` : ""}${extra.length ? `, zusätzlich: ${extra.join(", ")}` : ""}`)

  // ---------------------------------------------------------------- live context
  check((await stats()).state === "none", "Kein AudioContext vor der ersten Nutzereingabe")
  await page.click("#unlock")
  await page.waitForFunction(() => window.__audioBench.audio.stats.state === "running", null, { timeout: 5000 })
  check(true, "AudioContext nach Klick erzeugt und läuft")

  const all = await page.evaluate(async ids => {
    const b = window.__audioBench; let max = 0, calls = 0
    for (const id of ids) for (const p of ["none", "left", "right", "behind", "far"]) { b.play(id, p); calls++; max = Math.max(max, b.audio.stats.voices); await new Promise(r => setTimeout(r, 12)) }
    return { max, calls, s: b.audio.stats }
  }, ids)
  check(errors.length === 0 && all.max <= 40 && all.s.peakVoices <= 40, `Jede ID 2D und an 4 Positionen abgespielt (${all.calls} Aufrufe)`, `max. Stimmen ${all.max}, Spitze ${all.s.peakVoices}, gestohlen ${all.s.stolen}, verworfen ${all.s.dropped}`)
  for (const id of ["shot_mk4", "explosion", "ui_click"]) await page.click(`[data-sfx="${id}"]`)
  check(errors.length === 0, "Bench-Knöpfe lösen Klänge ohne Fehler aus")

  // ---------------------------------------------------------------- ambience
  for (const t of ["menu", "dawn", "day", "dusk", "night", "harbor", "base", null, "dusk"]) {
    await page.click(`[data-ambience="${t ?? "off"}"]`); await page.waitForTimeout(600)
    const s = await stats(); check(s.ambience === t && s.beds <= 3, `Ambiente „${t ?? "aus"}“ aktiv`, `Betten ${s.beds}, Timer ${s.timers}`)
  }
  const unknown = await page.evaluate(async () => { const a = window.__audioBench.audio; a.setAmbience("zone"); await new Promise(r => setTimeout(r, 300)); return a.stats })
  check(unknown.ambience === "zone" && unknown.beds >= 1, "Unbekannte Ambiente-ID wird toleriert (Dämmerungs-Bett als Ersatz)", `Betten ${unknown.beds}`)
  const rapid = await page.evaluate(() => { const a = window.__audioBench.audio; for (let i = 0; i < 40; i++) a.setAmbience(["menu", "dawn", "day", "dusk", "night", "harbor", "base"][i % 7]); return a.stats })
  check(rapid.beds <= 3 && rapid.timers <= 10,"40 schnelle Ambiente-Wechsel bleiben begrenzt", `Betten ${rapid.beds}, Timer ${rapid.timers}`)
  await page.waitForTimeout(2200)
  const settled = await stats(); check(settled.beds === 1, "Ausgeblendete Betten werden nach dem Überblenden freigegeben", `Betten ${settled.beds}`)
  await page.evaluate(() => window.__audioBench.audio.setAmbience("harbor"))
  const evMax = await page.evaluate(async () => { let m = 0; for (let i = 0; i < 70; i++) { m = Math.max(m, window.__audioBench.audio.stats.voices); await new Promise(r => setTimeout(r, 100)) } return m })
  check(evMax >= 1, "Hafen-Ambiente plant zufällige Ereignisse (Wellen, Möwen, Knarren …)", `max. Ereignis-Stimmen ${evMax}`)
  await page.click('[data-ambience="off"]'); await page.waitForTimeout(1900)
  const off = await stats(); check(off.beds === 0 && off.timers === 0, "Ambiente aus: keine Betten, keine Timer", `Betten ${off.beds}, Timer ${off.timers}`)

  // ---------------------------------------------------------------- intensity / heartbeat
  await page.locator("#intensity").fill("1"); await page.locator("#heartbeat").fill("0.8"); await page.waitForTimeout(1500)
  const tense = await stats(); check(tense.timers === 1 && tense.voices >= 1, "Spannung + Herzschlag laufen über einen Takt-Timer", `Timer ${tense.timers}, Stimmen ${tense.voices}`)
  await page.evaluate(() => { const a = window.__audioBench.audio; a.setIntensity(0.3); a.setHeartbeat(0.3); a.setIntensity(0); a.setHeartbeat(0) })
  await page.waitForTimeout(8500)
  const calm = await stats(); check(calm.timers === 0, "Spannung/Herzschlag 0: Takt-Timer stoppt nach dem Ausblenden", `Timer ${calm.timers}`)

  // ---------------------------------------------------------------- rapid fire
  const sync = await page.evaluate(() => { const b = window.__audioBench; for (let i = 0; i < 200; i++) b.play("shot_vx9", "none"); return b.audio.stats })
  check(sync.voices <= 6, "200 gleichzeitige shot_vx9-Aufrufe stapeln sich nicht", `Stimmen ${sync.voices}, verworfen ${sync.dropped}`)
  await page.waitForTimeout(500)
  const timed = await page.evaluate(async () => {
    const b = window.__audioBench; let max = 0
    for (let i = 0; i < 200; i++) { b.play("shot_vx9", "none"); max = Math.max(max, b.audio.stats.voices); await new Promise(r => setTimeout(r, 66)) }
    return { max, s: b.audio.stats }
  })
  check(timed.max <= 8 && timed.s.peakVoices <= 40, "200 shot_vx9 mit 15 Schuss/s: Stimmenzahl begrenzt", `max. ${timed.max} Stimmen, Spitze gesamt ${timed.s.peakVoices}, gestohlen ${timed.s.stolen}`)

  // ---------------------------------------------------------------- hordes, suppressor, step surfaces (live)
  await page.waitForTimeout(400)
  const horde = await page.evaluate(() => {
    const a = window.__audioBench.audio
    for (let i = 0; i < 40; i++) { const ang = i / 40 * Math.PI * 2, r = 3 + (i * 7.3) % 37; a.play("zombie_groan", { position: { x: Math.cos(ang) * r, y: 1.5, z: Math.sin(ang) * r }, rate: 0.8 + (i % 9) * 0.05 }) }
    return a.stats
  })
  check((horde.perId.zombie_groan ?? 0) <= 4 && horde.voices <= 40, "40 zombie_groan gleichzeitig: Stimmenbudget hält", `zombie_groan ${horde.perId.zombie_groan ?? 0} Stimmen, gesamt ${horde.voices}, verworfen ${horde.dropped}`)
  const mixed = await page.evaluate(async ([inf, gore]) => {
    const a = window.__audioBench.audio, ids = [...inf, ...gore, "melee_hit_flesh", "zombie_scream"]; let maxInf = 0, maxGore = 0, maxAll = 0
    for (let i = 0; i < 300; i++) {
      const ang = i * 2.39, r = 2 + (i * 5.1) % 40
      a.play(ids[i % ids.length], { position: { x: Math.cos(ang) * r, y: 1.5, z: Math.sin(ang) * r }, rate: 0.75 + (i % 11) * 0.05 })
      const s = a.stats, sum = list => list.reduce((n, id) => n + (s.perId[id] ?? 0), 0)
      maxInf = Math.max(maxInf, sum(inf)); maxGore = Math.max(maxGore, sum(gore)); maxAll = Math.max(maxAll, s.voices)
      if (i % 10 === 9) await new Promise(r => setTimeout(r, 30))
    }
    return { maxInf, maxGore, maxAll }
  }, [INFECTED_IDS, GORE_IDS])
  check(mixed.maxInf <= 10 && mixed.maxGore <= 8 && mixed.maxAll <= 40, "Horde greift an (300 Rufe/Gore/Treffer in 1 s): Gruppenbudgets halten", `Infizierte max. ${mixed.maxInf}/10, Gore max. ${mixed.maxGore}/8, gesamt max. ${mixed.maxAll}/40`)
  const supLive = await page.evaluate(async () => { const b = window.__audioBench; for (const id of b.ids.filter(i => i.startsWith("shot_"))) { b.play(id, "none", { suppressed: true }); await new Promise(r => setTimeout(r, 40)) } b.play("enemy_rifle", "front", { suppressed: true }); return b.audio.stats })
  check(errors.length === 0 && supLive.voices <= 40, "Alle shot_* mit suppressed: true live abgespielt (enemy_* ignoriert die Option)")
  const steps = await page.evaluate(() => [window.__audioBench.stepSound("grass"), window.__audioBench.stepSound("metal"), window.__audioBench.stepSound("snow")])
  check(steps[0] === "step_grass" && steps[1] === "step_metal" && steps[2] === "step_dirt", "stepSound: grass → step_grass, unbekannter Untergrund → step_dirt", steps.join(", "))

  // ---------------------------------------------------------------- offline renders: every sound
  const rows = []
  let silent = [], hot = []
  const positional = new Set(ids.filter(id => /^(enemy_|impact_|grenade_bounce|explosion|helicopter|whiz|step_|zombie_|boss_roar|acid_sizzle|molotov_break|fire_burn|airdrop_|gore_|bone_crack|gib_land|blood_drip|melee_hit_|door|item_drop)/.test(id)))
  for (const id of ids) {
    const sec = await page.evaluate(id => window.__audioBench.lengthFor(id), id)
    const m = await an([{ id }], { seconds: sec })
    const where = id === "blood_drip" ? { x: 0.5, y: 1.6, z: -1.5 } : { x: 3, y: 1.6, z: -9 }   // drips are only audible up close
    const mp = positional.has(id) ? await an([{ id, opts: { position: where } }], { seconds: sec + 0.4, listener: { position: { x: 0, y: 1.6, z: 0 }, yaw: 0 } }) : null
    rows.push([id, m, mp])
    if (!(m.peak > 0.003)) silent.push(id)
    if (mp && !(mp.peak > 0.001)) silent.push(`${id}@9.5m`)
    for (const x of [m, mp]) if (x && (!(x.peak < 1) || x.clipped > 0)) hot.push(id)
  }
  console.log("\n  Ton               Spitze dBFS  Lautheit 100 ms  bis -40 dB  Helligkeit  Tiefen   | positional 9.5 m: Spitze  Lautheit")
  for (const [id, m, mp] of rows) console.log(`  ${id.padEnd(17)} ${f1(db(m.peak)).padStart(10)} ${f1(db(m.rms100)).padStart(16)} ${m.t40.toFixed(2).padStart(10)} s ${m.bright.toFixed(3).padStart(10)} ${m.low.toFixed(2).padStart(7)}   ${mp ? `| ${f1(db(mp.peak)).padStart(22)} ${f1(db(mp.rms100)).padStart(9)}` : ""}`)
  console.log("")
  check(silent.length === 0, `Offline: alle ${ids.length} Klänge hörbar (2D-Spitze > -50 dBFS, positional in 9,5 m bzw. Tropfen in 1,6 m > -60 dBFS)`, silent.join(", "))
  check(hot.length === 0, "Offline: jede Spitze nach Kompressor < 1.0, keine geclippten Samples", hot.join(", ") || `höchste Spitze ${f1(db(Math.max(...rows.flatMap(([, m, mp]) => [m.peak, mp?.peak ?? 0]))))} dBFS`)

  // ---------------------------------------------------------------- offline: panning / yaw convention
  const L0 = { x: 40, y: 1.6, z: -25 }
  const side = async (id, yaw, right, label) => {
    const r = { x: Math.cos(yaw), z: -Math.sin(yaw) }, s = right ? 8 : -8
    const m = await an([{ id, opts: { position: { x: L0.x + r.x * s, y: 1.6, z: L0.z + r.z * s } } }], { seconds: 1.5, listener: { position: L0, yaw } })
    const ok = right ? m.rmsR > m.rmsL * 1.5 : m.rmsL > m.rmsR * 1.5
    check(ok, `Stereo: ${id} ${label}`, `L ${f1(db(m.rmsL))} dB / R ${f1(db(m.rmsR))} dB`)
  }
  await side("enemy_rifle", 0, true, "rechts vom Hörer (Blick -Z) → rechter Kanal lauter")
  await side("enemy_rifle", 0, false, "links vom Hörer (Blick -Z) → linker Kanal lauter")
  await side("impact_metal", Math.PI / 2, true, "Hörer um 90° nach links gedreht (Blick -X), Quelle bei -Z → rechts")
  await side("step_metal", Math.PI / 2, false, "Hörer Blick -X, Quelle bei +Z → links")
  await side("explosion", -2.2, true, "Hörer gedreht um -126°, Quelle auf seiner rechten Seite → rechts")
  await side("grenade_bounce", 2.6, false, "Hörer gedreht um +149°, Quelle auf seiner linken Seite → links")
  const ahead = await an([{ id: "enemy_smg", opts: { position: { x: L0.x, y: 1.6, z: L0.z - 12 } } }], { seconds: 1.5, listener: { position: L0, yaw: 0 } })
  check(Math.abs(db(ahead.rmsL) - db(ahead.rmsR)) < 1.5, "Stereo: Quelle direkt voraus bleibt mittig", `L ${f1(db(ahead.rmsL))} / R ${f1(db(ahead.rmsR))} dB`)

  // ---------------------------------------------------------------- offline: distance, delay, muffling, reverb share
  const at = (id, x, z, sec = 3) => an([{ id, opts: { position: { x, y: 1.6, z } } }], { seconds: sec, listener: { position: { x: 0, y: 1.6, z: 0 }, yaw: 0 } })
  const n10 = await at("enemy_rifle", 0, -10), n35 = await at("enemy_rifle", 0, -35), n80 = await at("enemy_rifle", 0, -80), n200 = await at("enemy_rifle", 0, -200)
  const dist = [n10, n35, n80, n200]
  check(dist.every((m, i) => i === 0 || (m.rms100 < dist[i - 1].rms100 && m.rms < dist[i - 1].rms && m.peak < dist[i - 1].peak)), "Entfernung: Gegnerfeuer wird mit der Distanz leiser (Spitze, Lautheit, Energie)",
    `Lautheit 10 m ${f1(db(n10.rms100))} · 35 m ${f1(db(n35.rms100))} · 80 m ${f1(db(n80.rms100))} · 200 m ${f1(db(n200.rms100))} dB`)
  check(n10.bright > n80.bright && n80.bright > n200.bright, "Entfernung: Tiefpass macht ferne Schüsse dumpfer", `Helligkeit ${n10.bright.toFixed(3)} > ${n80.bright.toFixed(3)} > ${n200.bright.toFixed(3)}`)
  const lag = n80.onset - n10.onset, lag200 = n200.onset - n10.onset
  check(Math.abs(lag - 80 / 343) < 0.02 && Math.abs(lag200 - 0.35) < 0.02 && Math.abs(n35.onset - n10.onset) < 0.01, "Schallverzögerung: erst ab 40 m, Distanz/343 s, gedeckelt auf 0,35 s",
    `35 m +${(n35.onset - n10.onset).toFixed(3)} s · 80 m +${lag.toFixed(3)} s (soll ${(80 / 343).toFixed(3)}) · 200 m +${lag200.toFixed(3)} s`)
  check(n80.tail > n10.tail * 1.3, "Hallanteil wächst mit der Entfernung", `später Energieanteil 10 m ${(n10.tail * 100).toFixed(1)} % · 80 m ${(n80.tail * 100).toFixed(1)} %`)
  const front = await at("enemy_rifle", 0, -15), back = await at("enemy_rifle", 0, 15)
  check(back.bright < front.bright * 0.95 && back.activeRms < front.activeRms, "Quelle hinten klingt gedämpfter als vorne", `Helligkeit vorne ${front.bright.toFixed(3)} / hinten ${back.bright.toFixed(3)}, RMS ${f1(db(front.activeRms))} / ${f1(db(back.activeRms))} dB`)
  const gone = await at("step_concrete", 0, -60)
  check(gone.peak === 0, "Leise Klänge jenseits ihrer Reichweite werden gar nicht erst erzeugt (Schritt in 60 m)")

  // ---------------------------------------------------------------- offline: weapon character
  const W = Object.fromEntries(rows.filter(([id]) => id.startsWith("shot_")).map(([id, m]) => [id.slice(5), m]))
  check(W.p9.t40 < W.mk4.t40 && W.vx9.t40 < W.mk4.t40 && W.mk4.t40 < W.dr7.t40, "Waffen: P9 und VX-9 kurz, DR-7 mit dem längsten Nachhall",
    Object.entries(W).map(([k, m]) => `${k} ${m.t40.toFixed(2)} s`).join(" · "))
  check(W.vx9.bright > W.mk4.bright && W.p9.bright > W.mk4.bright, "Waffen: VX-9 und P9 heller als MK-4", Object.entries(W).map(([k, m]) => `${k} ${m.bright.toFixed(3)}`).join(" · "))
  check(W.kv12.low > W.p9.low && W.kv12.low > W.vx9.low && W.kv12.activeRms > W.p9.activeRms, "Waffen: KV-12 mit dem größten Tieftonanteil", Object.entries(W).map(([k, m]) => `${k} ${m.low.toFixed(2)}`).join(" · "))
  check(W.dr7.tail > W.mk4.tail, "Waffen: DR-7-Echo länger als MK-4", `später Anteil ${(W.dr7.tail * 100).toFixed(1)} % / ${(W.mk4.tail * 100).toFixed(1)} %`)
  const v1 = await an([{ id: "shot_vx9" }], { seconds: 0.6, seed: 1 }), v2 = await an([{ id: "shot_vx9" }], { seconds: 0.6, seed: 2 })
  check(Math.abs(v1.activeRms - v2.activeRms) > 1e-4 || Math.abs(v1.bright - v2.bright) > 1e-4, "Jeder Schuss variiert leicht (Tonhöhe/Pegel/Filter)", `RMS ${f1(db(v1.activeRms))} / ${f1(db(v2.activeRms))} dB, Helligkeit ${v1.bright.toFixed(3)} / ${v2.bright.toFixed(3)}`)

  check(W.falke.t40 > W.dr7.t40 && W.falke.rms100 > W.mk4.rms100 && W.falke.t40 === Math.max(...Object.values(W).map(m => m.t40)), "Waffen: Falke .338 mit dem lautesten Knall-Nachhall (längstes Echo aller Waffen)", `falke ${W.falke.t40.toFixed(2)} s, Lautheit ${f1(db(W.falke.rms100))} dB`)
  check(W.k5.bright > W.mk4.bright && W.k5.t40 < W.mk4.t40 && W.k5.rms100 < W.mk4.rms100, "Waffen: K5 klein, hell und kurz", `Helligkeit ${W.k5.bright.toFixed(3)}, ${W.k5.t40.toFixed(2)} s, ${f1(db(W.k5.rms100))} dB`)
  check(W.sr74.rms100 > W.mk4.rms100 && W.sr74.bright < W.mk4.bright && W.br10.rms100 > W.sr74.rms100, "Waffen: SR-74 schwerer als MK-4, BR-10 noch lauter", `MK-4 ${f1(db(W.mk4.rms100))} · SR-74 ${f1(db(W.sr74.rms100))} · BR-10 ${f1(db(W.br10.rms100))} dB`)
  check(W.r44.rms100 > W.p9.rms100 && W.r44.low > W.p9.low && W.sg8.low > W.mk4.low, "Waffen: R-44 wuchtiger als P9, SG-8 mit Schrot-Tiefton", `R-44 ${f1(db(W.r44.rms100))} / P9 ${f1(db(W.p9.rms100))} dB`)
  const supRows = []
  for (const id of ids.filter(i => i.startsWith("shot_"))) {
    const sec = await page.evaluate(id => window.__audioBench.lengthFor(id), id)
    const s = await an([{ id, opts: { suppressed: true } }], { seconds: sec }), m = rows.find(r => r[0] === id)[1]
    supRows.push([id, db(s.rms100) - db(m.rms100), s.t40, m.t40, s.peak])
  }
  check(supRows.every(([, d, st, mt, pk]) => d > -13 && d < -7 && st < mt * 0.6 && pk < 1), "Schalldämpfer: jede Waffe ≈ 1/3 so laut (-7 … -13 dB) mit kurzem Nachhall",
    supRows.map(([id, d, st]) => `${id.slice(5)} ${d.toFixed(1)} dB/${st.toFixed(2)} s`).join(" · "))
  const light = await an([{ id: "melee_swing", opts: { rate: 1.35 } }], { seconds: 1, seed: 7 }), heavy = await an([{ id: "melee_swing", opts: { rate: 0.7 } }], { seconds: 1, seed: 7 })
  check(heavy.t40 > light.t40 && heavy.bright < light.bright, "Nahkampf: schwerer Schwung (rate 0.7) länger und tiefer als leichter (1.35)", `${heavy.t40.toFixed(2)} s/${heavy.bright.toFixed(3)} vs. ${light.t40.toFixed(2)} s/${light.bright.toFixed(3)}`)
  const scream150 = await at("zombie_scream", 0, -150, 3), roar200 = await at("boss_roar", 0, -200, 4), groan150 = await at("zombie_groan", 0, -150), groan30 = await at("zombie_groan", 0, -30)
  check(scream150.peak > 0.003 && roar200.peak > 0.003 && groan150.peak === 0 && groan30.peak > 0, "Reichweite: Schreier (150 m) und Boss (200 m) weit hörbar, Stöhnen nur in der Nähe",
    `Schrei 150 m ${f1(db(scream150.rms100))} dB (+${scream150.onset.toFixed(2)} s Schall) · Brüllen 200 m ${f1(db(roar200.rms100))} dB · Stöhnen 30 m ${f1(db(groan30.rms100))} dB, 150 m stumm`)
  const g1 = await an([{ id: "zombie_groan", opts: { position: { x: 0, y: 1.6, z: -10 }, rate: 0.8 } }], { seconds: 2.5, seed: 3, listener: { position: { x: 0, y: 1.6, z: 0 }, yaw: 0 } })
  const g2 = await an([{ id: "zombie_groan", opts: { position: { x: 0, y: 1.6, z: -10 }, rate: 1.25 } }], { seconds: 2.5, seed: 3, listener: { position: { x: 0, y: 1.6, z: 0 }, yaw: 0 } })
  check(g1.bright < g2.bright, "Infizierte: rate verändert Stimme/Größe je Individuum", `Helligkeit rate 0.8 ${g1.bright.toFixed(3)} / rate 1.25 ${g2.bright.toFixed(3)}`)
  const farHorde = Array.from({ length: 36 }, (_, i) => ({ id: "zombie_groan", opts: { position: { x: Math.cos(i) * 32, y: 1.5, z: Math.sin(i) * 32 }, rate: 0.8 + (i % 7) * 0.06 } }))
  const nearFour = Array.from({ length: 4 }, (_, i) => ({ id: "zombie_groan", at: 0.01, opts: { position: { x: Math.cos(i * 1.6) * 3, y: 1.5, z: Math.sin(i * 1.6) * 3 }, rate: 0.9 + i * 0.05 } }))
  const hFar = await an(farHorde, { seconds: 2.5 }), hNear = await an(nearFour, { seconds: 2.5 }), hAll = await an([...farHorde, ...nearFour], { seconds: 2.5 })
  check(Math.abs(db(hAll.rms100) - db(hNear.rms100)) < 2 && hAll.rms100 > hFar.rms100 && hAll.peak < 1, "Horde: die nächsten Infizierten verdrängen ferne Stimmen (Budget hält die lautesten)",
    `36 fern ${f1(db(hFar.rms100))} dB · 4 nah ${f1(db(hNear.rms100))} dB · alle 40 ${f1(db(hAll.rms100))} dB`)
  const lmg = await an(Array.from({ length: 34 }, (_, i) => ({ id: "shot_lm60", at: i / 11.4 })), { seconds: 4 })
  check(lmg.peak < 1 && lmg.clipped === 0, "34 LM-60-Schüsse mit 11,4/s: keine Übersteuerung", `Spitze ${f1(db(lmg.peak))} dBFS, Lautheit ${f1(db(lmg.rms100))} dB`)
  const massacre = await an([
    ...Array.from({ length: 40 }, (_, i) => ({ id: INFECTED_IDS[i % INFECTED_IDS.length], at: (i % 10) * 0.05, opts: { position: { x: Math.cos(i) * (2 + i % 9), y: 1.5, z: Math.sin(i) * (2 + i % 9) }, rate: 0.8 + (i % 5) * 0.1 } })),
    ...Array.from({ length: 20 }, (_, i) => ({ id: GORE_IDS[i % GORE_IDS.length], at: i * 0.04, opts: { position: { x: 1 + i % 3, y: 0.5, z: -2 - i % 4 } } })),
    { id: "boss_roar", opts: { position: { x: 0, y: 2, z: -6 } } }, { id: "shot_sg8" }, { id: "shot_sg8", at: 0.26 }, { id: "molotov_break", at: 0.1, opts: { position: { x: 2, y: 0, z: -5 } } },
    { id: "melee_hit_flesh", at: 0.3 }, { id: "zombie_scream", at: 0.2, opts: { position: { x: -8, y: 1.5, z: -10 } } },
  ], { seconds: 4, volume: 1 })
  check(massacre.peak < 1 && massacre.clipped === 0, "Schlimmster Horden-Fall (40 Infizierte, Gore, Boss, Schrotflinte, Molotow, Lautstärke 1.0): Spitze < 1.0", `Spitze ${f1(db(massacre.peak))} dBFS`)

  // ---------------------------------------------------------------- offline: rapid fire and worst-case mixes
  const smg = await an(Array.from({ length: 45 }, (_, i) => ({ id: "shot_vx9", at: i / 15 })), { seconds: 3.8 })
  check(smg.peak < 1 && smg.clipped === 0, "45 VX-9-Schüsse mit 15/s: keine Übersteuerung", `Spitze ${f1(db(smg.peak))} dBFS, RMS ${f1(db(smg.activeRms))} dB`)
  const mk = await an(Array.from({ length: 30 }, (_, i) => ({ id: "shot_mk4", at: i / 10 })), { seconds: 3.8 })
  check(mk.peak < 1 && mk.clipped === 0, "30 MK-4-Schüsse mit 10/s: keine Übersteuerung", `Spitze ${f1(db(mk.peak))} dBFS`)
  const chaos = await an([
    { id: "explosion", opts: { position: { x: 3, y: 0.5, z: -4 } } }, { id: "shot_kv12" }, { id: "hurt" }, { id: "hit_head" }, { id: "kill", at: 0.05 },
    ...Array.from({ length: 12 }, (_, i) => ({ id: "enemy_rifle", at: i * 0.08, opts: { position: { x: -6 + i, y: 1.5, z: -9 } } })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: "shot_mk4", at: i * 0.1 })),
  ], { seconds: 5, volume: 1 })
  check(chaos.peak < 1 && chaos.clipped === 0, "Schlimmster Fall (Explosion nah + Feuergefecht, Lautstärke 1.0): Spitze < 1.0", `Spitze ${f1(db(chaos.peak))} dBFS`)

  // ---------------------------------------------------------------- offline: ambience, tension, heartbeat levels
  const gun = W.mk4
  for (const theme of ["menu", "dawn", "day", "dusk", "night", "harbor", "base"]) {
    const m = await an([], { seconds: 30, ambience: theme })
    check(m.rms > 2e-4 && db(m.rms) < db(gun.rms100) - 16 && db(m.peak) < db(gun.peak) - 6, `Ambiente „${theme}“ (30 s inkl. Zufallsereignisse) hörbar, aber deutlich leiser als Schüsse`,
      `RMS ${f1(db(m.rms))} dB, lauteste 100 ms ${f1(db(m.rms100))} dB, Spitze ${f1(db(m.peak))} dBFS · MK-4: Lautheit ${f1(db(gun.rms100))} dB, Spitze ${f1(db(gun.peak))} dBFS`)
  }
  const h0 = await an([], { seconds: 4, heartbeat: 0 }), h3 = await an([], { seconds: 4, heartbeat: 0.3 }), h10 = await an([], { seconds: 4, heartbeat: 1 })
  check(h0.peak === 0 && h3.rms > 0 && h10.rms > h3.rms * 1.3, "Herzschlag: 0 = still, Pegel und Tempo steigen mit dem Wert", `0.3 → ${f1(db(h3.rms))} dB, 1.0 → ${f1(db(h10.rms))} dB`)
  const t3 = await an([], { seconds: 4, intensity: 0.3 }), t10 = await an([], { seconds: 4, intensity: 1 })
  check(t3.rms > 0 && t10.rms > t3.rms && t10.peak < 1, "Spannungsschicht: lauter und dichter mit höherer Intensität", `0.3 → ${f1(db(t3.rms))} dB, 1.0 → ${f1(db(t10.rms))} dB`)

  // ---------------------------------------------------------------- dispose
  await page.evaluate(() => { const a = window.__audioBench.audio; a.setAmbience("night"); a.setIntensity(1); a.setHeartbeat(1); a.play("helicopter") })
  await page.waitForTimeout(400)
  const disposed = await page.evaluate(async () => { const a = window.__audioBench.audio; a.dispose(); a.dispose(); a.play("shot_mk4"); a.setAmbience("dusk"); a.setIntensity(1); await new Promise(r => setTimeout(r, 300)); return a.stats })
  check(disposed.timers === 0 && disposed.beds === 0 && disposed.voices === 0, "dispose() gibt Timer, Betten und Stimmen frei; Aufrufe danach sind stille No-ops", JSON.stringify(disposed))

  const audioWarnings = warnings.filter(w => /audio|AudioParam|nominal range|AudioNode|AudioContext/i.test(w))
  check(audioWarnings.length === 0, "Keine Web-Audio-Warnungen in der Konsole", audioWarnings.slice(0, 3).join(" | "))
  check(errors.length === 0, `Keine Seiten- oder Konsolenfehler (${errors.length})`, errors.slice(0, 3).join(" | "))
} finally {
  await browser.close()
  stopServer()
}
console.log(failed ? `\nAUDIOVERIFY FEHLGESCHLAGEN (${failed})` : "\nAUDIOVERIFY OK")
process.exit(failed ? 1 : 0)
