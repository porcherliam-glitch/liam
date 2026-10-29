/**
 * weapon-bench.ts — developer test bench for the first-person weapons (dev-weapons.html, not part of the shipped
 * game). Renders a backdrop room plus the viewmodel exactly like the game, drives it with a small simulation of the
 * raid's weapon timers, and has pages for the item icon sheet and a turntable of the world/loot models.
 *
 *   dev-weapons.html?page=vm|icons|world&weapon=mk4
 *   __weaponBench.set({ weapon, mods, ads, move, sprinting, crouched, laser, flashlight, light, empty, crosshair, lookYaw, lookPitch })
 *   __weaponBench.fire(n) / reload(empty?) / switchTo(id, mods?) / melee() / quickKnife() / use(kind, item?)
 *   __weaponBench.freeze({ reload, using, usingKind, usingItem, melee, meleeQuick, switching, singleLoad, empty }) / unfreeze()
 *   __weaponBench.pause(true|false) / step(seconds) / render()      deterministic stepping for screenshots
 *   __weaponBench.sightCheck() → NDC of the sight marks (front post, rear sight, reticle) — (0, 0) = screen centre
 *   __weaponBench.page("vm" | "icons" | "world") / meshes() / ready
 */
import * as THREE from "three"
import { itemIcon } from "../game/icons"
import { ITEMS, ITEM_IDS, type ItemId } from "../game/items"
import { ViewModel, type ViewModelState } from "../game/viewmodel"
import { ATTACHMENTS, ATTACHMENT_ORDER, WEAPONS, WEAPON_ORDER, canAttach, type AttachmentSlot, type WeaponId, type WeaponMods } from "../game/weaponData"
import { weaponWorldModel } from "../game/weaponModels"

type Page = "vm" | "icons" | "world"
const params = new URLSearchParams(location.search)
document.body.style.cssText = "margin:0;background:#0d0f11;color:#d8dde2;font:13px/1.35 system-ui,sans-serif;overflow:hidden"

// ───────────────────────────── renderer & backdrop ─────────────────────────────

const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block"
document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.autoClear = false
renderer.setPixelRatio(1); renderer.toneMappingExposure = 1.05
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2b3036); scene.fog = new THREE.Fog(0x2b3036, 12, 40)
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200); camera.position.set(0, 1.62, 0)
const hemi = new THREE.HemisphereLight(0xb8c6d2, 0x3a342c, 1.1); scene.add(hemi)
const sun = new THREE.DirectionalLight(0xffeedd, 1.6); sun.position.set(-4, 8, 3); scene.add(sun)
{
  const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), mat(0x4a4d4f)); floor.rotation.x = -Math.PI / 2; floor.position.z = -15; scene.add(floor)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), mat(0x5b6168)); back.position.set(0, 5, -22); scene.add(back)
  for (const x of [-9, 9]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(60, 10), mat(0x50565c)); w.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; w.position.set(x, 5, -15); scene.add(w) }
  const crate = (x: number, z: number, s: number, c: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat(c, 0.8)); m.position.set(x, s / 2, z); m.rotation.y = x * 0.3; scene.add(m) }
  crate(-3, -9, 1.2, 0x6b5a3e); crate(-2.2, -9.4, 0.8, 0x5d4e36); crate(3.5, -12, 1.4, 0x4f5a43); crate(4.6, -7, 1, 0x6b5a3e); crate(-5, -16, 2, 0x4f5a43)
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.05), mat(0xd8d2c0, 0.95)); board.position.set(0, 1.4, -8.5); scene.add(board)
  for (const [r, c] of [[0.5, 0x222222], [0.36, 0xd8d2c0], [0.22, 0x222222], [0.08, 0xb02020]] as const) { const d = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat(c)); d.position.set(0, 1.62, -8.47); scene.add(d) }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), mat(0x3b2f22)); post.position.set(0, 0.7, -8.55); scene.add(post)
}

const vm = new ViewModel(); vm.initEnvironment(renderer); vm.visible = true

// ───────────────────────────── simulated weapon state ─────────────────────────────

const st: ViewModelState = {
  weapon: (params.get("weapon") as WeaponId) || "mk4", mods: {}, ads: 0, move: 0, sprinting: false, crouched: false, lookYaw: 0, lookPitch: 0,
  reload: -1, singleLoad: false, empty: false, switching: -1, using: -1, usingKind: null, usingItem: null, melee: -1, meleeQuick: false,
  light: 0.85, flashlight: false, laser: false,
}
let adsTarget = 0, crosshair = params.get("crosshair") === "1"
let frozen: Partial<ViewModelState> = {}
const sim = { shots: 0, nextShot: 0, reloadT: -1, reloadSteps: 0, reloadDur: 1, switchT: -1, switchTo: null as null | { id: WeaponId; mods: WeaponMods }, meleeT: -1, meleeDur: 0.4, useT: -1, useDur: 2 }
let simTime = 0

function stepSim(dt: number): void {
  simTime += dt
  const def = WEAPONS[st.weapon]
  st.ads += (adsTarget - st.ads) * Math.min(1, dt / Math.max(0.05, def.adsTime) * 2.2); if (Math.abs(st.ads - adsTarget) < 0.001) st.ads = adsTarget
  if (sim.shots > 0 && simTime >= sim.nextShot) { vm.fire(); sim.shots--; sim.nextShot = simTime + def.fireInterval }
  if (sim.reloadT >= 0) {
    sim.reloadT += dt / sim.reloadDur
    if (sim.reloadT >= 1) { if (st.singleLoad && --sim.reloadSteps > 0) { sim.reloadT -= 1; st.empty = false } else { sim.reloadT = -1; st.empty = false } }
  }
  st.reload = sim.reloadT
  if (sim.switchT >= 0) {
    const before = sim.switchT; sim.switchT += dt / 0.5
    if (before < 0.5 && sim.switchT >= 0.5 && sim.switchTo) { st.weapon = sim.switchTo.id; st.mods = sim.switchTo.mods; vm.setWeapon(st.weapon, st.mods); sim.switchTo = null; syncUi() }
    if (sim.switchT >= 1) sim.switchT = -1
  }
  st.switching = sim.switchT
  if (sim.meleeT >= 0) { sim.meleeT += dt / sim.meleeDur; if (sim.meleeT >= 1) { sim.meleeT = -1; st.meleeQuick = false } }
  st.melee = sim.meleeT
  if (sim.useT >= 0) { sim.useT += dt / sim.useDur; if (sim.useT >= 1) { sim.useT = -1; st.usingKind = null } }
  st.using = sim.useT
  const state = { ...st, ...frozen }
  vm.update(dt, state)
}

// ───────────────────────────── pages ─────────────────────────────

let page: Page = (params.get("page") as Page) || "vm"
const worldScene = new THREE.Scene(); worldScene.background = new THREE.Color(0x30353b)
const worldCam = new THREE.PerspectiveCamera(32, 1, 0.05, 50)
const turntables: THREE.Group[] = []
const showcase = new THREE.Group()
let showcaseOn = false
function buildWorldPage(): void {
  if (turntables.length) return
  worldScene.add(new THREE.HemisphereLight(0xc8d4de, 0x40382e, 1.3))
  const d = new THREE.DirectionalLight(0xfff0e0, 2.2); d.position.set(-2, 4, 3); worldScene.add(d)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: 0x4a4f54, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.25; worldScene.add(floor)
  WEAPON_ORDER.forEach((id, i) => {
    const col = i % 5, row = Math.floor(i / 5)
    const t = new THREE.Group(); t.position.set((col - 2) * 1.25, 0.15 - row * 0.0, (row - 1) * 1.1); worldScene.add(t)
    const mods: WeaponMods = id === "mk4" ? { optic: "att_holo", grip: "att_vgrip", tactical: "att_laser" } : id === "sr74" ? { optic: "att_scope4x", muzzle: "att_suppressor" } : {}
    const m = weaponWorldModel(id, mods); t.add(m); turntables.push(t)
  })
  worldCam.position.set(0, 3.6, 4.2); worldCam.lookAt(0, -0.1, 0)
  worldScene.add(showcase)
}
/** One weapon large in the world scene (side profile by default) — null returns to the turntable grid. */
function setShowcase(id: WeaponId | null, mods: WeaponMods = {}, yaw = -Math.PI / 2, pitch = 0): void {
  buildWorldPage()
  showcase.clear(); showcaseOn = !!id
  for (const t of turntables) t.visible = !id
  if (id) {
    const m = weaponWorldModel(id, mods); const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3())
    m.position.sub(c); const holder = new THREE.Group(); holder.add(m); holder.rotation.set(pitch, yaw, 0); holder.position.set(0, 0.35, 0); showcase.add(holder)
    const size = box.getSize(new THREE.Vector3()).length()
    worldCam.position.set(0, 0.35, size * 1.55); worldCam.lookAt(0, 0.35, 0)
  } else { worldCam.position.set(0, 3.6, 4.2); worldCam.lookAt(0, -0.1, 0) }
}

const ui = document.createElement("div")
ui.style.cssText = "position:fixed;left:8px;top:8px;width:248px;max-height:calc(100vh - 16px);overflow:auto;background:rgba(10,12,14,.82);border:1px solid #2c3238;border-radius:6px;padding:8px;z-index:5"
document.body.appendChild(ui)
const sheet = document.createElement("div")
sheet.style.cssText = "position:fixed;inset:0;overflow:auto;background:#15181b;padding:16px 16px 16px 272px;display:none;z-index:2"
document.body.appendChild(sheet)
const overlay = document.createElement("div")
overlay.style.cssText = "position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:3;display:none"
overlay.innerHTML = `<div style="position:absolute;left:-40px;top:0;width:80px;height:1px;background:rgba(0,255,255,.8)"></div><div style="position:absolute;top:-40px;left:0;height:80px;width:1px;background:rgba(0,255,255,.8)"></div>`
document.body.appendChild(overlay)

function buildSheet(): void {
  if (sheet.childElementCount) return
  const cats = new Map<string, ItemId[]>()
  for (const id of ITEM_IDS) { const c = ITEMS[id].cat; if (!cats.has(c)) cats.set(c, []); cats.get(c)!.push(id) }
  for (const [cat, ids] of cats) {
    const h = document.createElement("h3"); h.textContent = cat; h.style.cssText = "margin:10px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8c98a3"; sheet.appendChild(h)
    const row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px"; sheet.appendChild(row)
    for (const id of ids) {
      const cell = document.createElement("div"); cell.style.cssText = "width:104px;background:#1f2428;border:1px solid #2e353b;border-radius:4px;padding:6px;text-align:center"
      cell.innerHTML = `<div style="height:64px;display:flex;align-items:center;justify-content:center"><img src="${itemIcon(id, 64)}" width="64" height="64"></div>
        <div style="height:40px;display:flex;align-items:center;justify-content:center;gap:6px"><img src="${itemIcon(id, 40)}" width="40" height="40"><span style="display:inline-block;width:40px;height:40px;background:#c9cfd4;border-radius:3px"><img src="${itemIcon(id, 40)}" width="40" height="40"></span></div>
        <div style="font-size:10px;color:#9aa4ad;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${ITEMS[id].name}">${ITEMS[id].name}</div>`
      row.appendChild(cell)
    }
  }
}

function setPage(p: Page): void {
  page = p
  sheet.style.display = p === "icons" ? "block" : "none"
  if (p === "icons") buildSheet()
  if (p === "world") buildWorldPage()
  overlay.style.display = p === "vm" && crosshair ? "block" : "none"
  syncUi()
}

// ───────────────────────────── controls ─────────────────────────────

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css = "", html = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.style.cssText = css; e.innerHTML = html; return e }
const SLOTS: AttachmentSlot[] = ["optic", "muzzle", "grip", "mag", "tactical"]
const SLOT_NAMES: Record<AttachmentSlot, string> = { optic: "Optik", muzzle: "Mündung", grip: "Griff", mag: "Magazin", tactical: "Taktisch" }
function syncUi(): void {
  ui.innerHTML = ""
  const nav = el("div", "display:flex;gap:4px;margin-bottom:8px")
  for (const [p, label] of [["vm", "Waffe"], ["icons", "Symbole"], ["world", "Weltmodelle"]] as const) {
    const b = el("button", `flex:1;padding:4px;background:${page === p ? "#3d6b8f" : "#252b31"};color:#e6ebef;border:1px solid #39424a;border-radius:3px;cursor:pointer`, label)
    b.onclick = () => setPage(p); nav.appendChild(b)
  }
  ui.appendChild(nav)
  if (page !== "vm") return
  const sel = el("select", "width:100%;margin-bottom:6px")
  for (const id of WEAPON_ORDER) { const o = el("option", "", `${WEAPONS[id].short} – ${WEAPONS[id].name}`); o.value = id; o.selected = id === st.weapon; sel.appendChild(o) }
  sel.onchange = () => { st.weapon = sel.value as WeaponId; st.mods = {}; vm.setWeapon(st.weapon, st.mods); syncUi() }
  ui.appendChild(sel)
  for (const slot of SLOTS) {
    const opts = ATTACHMENT_ORDER.filter(a => ATTACHMENTS[a].slot === slot && canAttach(st.weapon, a))
    if (!opts.length) continue
    const row = el("div", "display:flex;align-items:center;gap:6px;margin:2px 0", `<span style="width:64px;color:#9aa4ad">${SLOT_NAMES[slot]}</span>`)
    const s = el("select", "flex:1"); s.appendChild(el("option", "", "–"))
    for (const a of opts) { const o = el("option", "", ATTACHMENTS[a].name); o.value = a; o.selected = st.mods[slot] === a; s.appendChild(o) }
    s.onchange = () => { const m = { ...st.mods }; if (s.value && s.value !== "–") m[slot] = s.value as never; else delete m[slot]; st.mods = m; vm.setWeapon(st.weapon, st.mods) }
    row.appendChild(s); ui.appendChild(row)
  }
  const btns: [string, () => void][] = [
    ["Feuer", () => api.fire(1)], ["Feuerstoß", () => api.fire(6)], ["Nachladen", () => api.reload(false)], ["Leer nachladen", () => api.reload(true)],
    ["Wechsel", () => api.switchTo(st.weapon === "p9" ? "mk4" : "p9")], ["Nahkampf", () => api.melee()], ["Schnellmesser", () => api.quickKnife()],
    ["Sanitär", () => api.use("medical")], ["Essen", () => api.use("food")], ["Trinken", () => api.use("food", "water")], ["Granate", () => api.use("throw")], ["Molotow", () => api.use("throw", "molotov")],
  ]
  const grid = el("div", "display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0")
  for (const [label, fn] of btns) { const b = el("button", "padding:4px;background:#252b31;color:#e6ebef;border:1px solid #39424a;border-radius:3px;cursor:pointer", label); b.onclick = fn; grid.appendChild(b) }
  ui.appendChild(grid)
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const l = el("label", "display:flex;gap:6px;align-items:center;margin:2px 0;cursor:pointer"); const c = el("input"); c.type = "checkbox"; c.checked = get(); c.onchange = () => set(c.checked); l.append(c, label); ui.appendChild(l)
  }
  toggle("Zielen (ADS)", () => adsTarget > 0.5, v => { adsTarget = v ? 1 : 0 })
  toggle("Sprinten", () => st.sprinting, v => { st.sprinting = v; st.move = v ? 1.5 : st.move })
  toggle("Gehen", () => st.move > 0.5 && !st.sprinting, v => { st.move = v ? 1 : 0 })
  toggle("Ducken", () => st.crouched, v => { st.crouched = v })
  toggle("Laser", () => st.laser, v => { st.laser = v })
  toggle("Taschenlampe", () => st.flashlight, v => { st.flashlight = v })
  toggle("Magazin leer", () => st.empty, v => { st.empty = v })
  toggle("Fadenkreuz-Prüfung", () => crosshair, v => { crosshair = v; overlay.style.display = v ? "block" : "none" })
  const lr = el("div", "margin-top:6px", `<span style="color:#9aa4ad">Licht</span>`); const range = el("input", "width:100%"); range.type = "range"; range.min = "0"; range.max = "1"; range.step = "0.05"; range.value = String(st.light)
  range.oninput = () => { st.light = Number(range.value) }; lr.appendChild(range); ui.appendChild(lr)
}
addEventListener("keydown", e => {
  if (page !== "vm" || e.target instanceof HTMLSelectElement) return
  if (e.code === "KeyF") api.fire(1); else if (e.code === "KeyR") api.reload(st.empty); else if (e.code === "KeyV") api.melee(); else if (e.code === "KeyQ") api.use("medical")
})
canvas.addEventListener("mousedown", e => { if (page === "vm") { if (e.button === 2) adsTarget = 1; else api.fire(WEAPONS[st.weapon].auto ? 8 : 1) } })
canvas.addEventListener("mouseup", e => { if (e.button === 2) adsTarget = 0 })
canvas.addEventListener("contextmenu", e => e.preventDefault())

// ───────────────────────────── loop & API ─────────────────────────────

function resize(): void {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); vm.setAspect(w / h)
  worldCam.aspect = w / h; worldCam.updateProjectionMatrix()
}
addEventListener("resize", resize); resize()

const debugCam = new THREE.PerspectiveCamera(40, 1, 0.005, 20)
let debugView: number[] | null = null
function render(): void {
  renderer.clear()
  if (page === "world") { renderer.render(worldScene, worldCam); return }
  if (debugView) {
    // outside view of the viewmodel scene (hands, arms, rig) for inspection
    debugCam.aspect = innerWidth / innerHeight; debugCam.fov = debugView[6] ?? 40; debugCam.updateProjectionMatrix()
    debugCam.position.set(debugView[0], debugView[1], debugView[2]); debugCam.lookAt(debugView[3], debugView[4], debugView[5])
    const bg = vm.scene.background; vm.scene.background = new THREE.Color(0x56606a)
    renderer.render(vm.scene, debugCam); vm.scene.background = bg
    return
  }
  const def = WEAPONS[st.weapon]
  const zoom = 1 + (def.adsZoom - 1) * st.ads
  camera.fov = 75 * zoom; camera.updateProjectionMatrix()
  const lvl = 0.3 + st.light * 0.9; hemi.intensity = 1.1 * lvl; sun.intensity = 1.6 * lvl
  renderer.render(scene, camera)
  vm.render(renderer)
}

let paused = false, last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  if (!paused) { stepSim(dt); for (const t of turntables) t.rotation.y += dt * 0.6; if (showcaseOn) showcase.rotation.y += dt * 0.4 }
  render()
  api.ready = true
  requestAnimationFrame(frame)
}

const api = {
  ready: false,
  set(o: Partial<ViewModelState> & { crosshair?: boolean }): void {
    if (o.crosshair !== undefined) { crosshair = o.crosshair; overlay.style.display = crosshair && page === "vm" ? "block" : "none" }
    if (o.ads !== undefined) { adsTarget = o.ads; st.ads = o.ads }
    const { crosshair: _c, ads: _a, ...rest } = o
    Object.assign(st, rest)
    if (o.weapon || o.mods) vm.setWeapon(st.weapon, st.mods)
    syncUi()
  },
  fire(n = 1): void { sim.shots += n; sim.nextShot = Math.max(sim.nextShot, simTime) },
  reload(empty = false): void {
    const def = WEAPONS[st.weapon]; if (def.cls === "melee") return
    st.empty = empty; st.singleLoad = def.singleLoad; sim.reloadT = 0; sim.reloadSteps = def.singleLoad ? 3 : 1; sim.reloadDur = def.reload
  },
  switchTo(id: WeaponId, mods: WeaponMods = {}): void { sim.switchT = 0; sim.switchTo = { id, mods } },
  melee(): void { const def = WEAPONS[st.weapon]; st.meleeQuick = def.cls !== "melee"; sim.meleeT = 0; sim.meleeDur = def.melee?.swing ?? 0.42 },
  quickKnife(): void { st.meleeQuick = true; sim.meleeT = 0; sim.meleeDur = 0.42 },
  use(kind: "medical" | "food" | "throw", item: ItemId | null = null): void {
    st.usingKind = kind; st.usingItem = item; sim.useT = 0
    sim.useDur = kind === "throw" ? 0.6 : item && ITEMS[item].use ? ITEMS[item].use!.time : kind === "medical" ? 2.6 : 2.5
  },
  freeze(o: Partial<ViewModelState>): void { frozen = { ...o } },
  unfreeze(): void { frozen = {} },
  pause(p: boolean): void { paused = p },
  step(sec: number): void { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) stepSim(sec / n); render() },
  render(): void { render() },
  page(p: Page): void { setPage(p); render() },
  showcase(id: WeaponId | null, mods: WeaponMods = {}, yaw?: number, pitch?: number): void { setPage("world"); setShowcase(id, mods, yaw, pitch); showcase.rotation.y = 0; render() },
  /** Projects the rig's sight marks with the viewmodel camera: NDC x/y per mark ((0, 0) = screen centre). */
  sightCheck(): Record<string, [number, number]> {
    const { rig } = vm.inspect(), out: Record<string, [number, number]> = {}
    for (const [name, o] of Object.entries(rig.marks)) { const p = o.getWorldPosition(new THREE.Vector3()).project(vm.camera); out[name] = [+p.x.toFixed(5), +p.y.toFixed(5)] }
    return out
  },
  meshes(): number { return vm.inspect().meshes },
  /** Outside camera on the viewmodel scene: [x, y, z, targetX, targetY, targetZ, fov?] or null. */
  debugView(v: number[] | null): void { debugView = v; ui.style.display = v ? "none" : "block"; render() },
  /** Hide/show the control panel (clean screenshots). */
  panel(show: boolean): void { ui.style.display = show ? "block" : "none" },
  state(): ViewModelState { return { ...st, ...frozen } },
  vm,
}
;(window as unknown as { __weaponBench: typeof api }).__weaponBench = api
syncUi(); setPage(page)
requestAnimationFrame(frame)
