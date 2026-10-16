# DEAD ZONE: EXTRACTION — Architecture Contract (SPEC)

This document is the binding contract for every module of the game. Several developers
implement modules in parallel against it. **Follow names, signatures and data shapes exactly.**
Where this document is silent, choose the simplest robust solution and document it in a
header comment of your file.

Game language for everything the player reads: **German**. Code, identifiers, comments: **English**.

---

## 0. Build model and global conventions

- Final product: one file `index.html` (repo root). It is produced by `node deadzone/build.mjs`
  from `deadzone/template.html`, `deadzone/src/style.css` and `deadzone/src/*.js`
  (concatenated **in filename order**, wrapped together in a single
  `(() => { 'use strict'; ... })();` IIFE). Only `25_main.js` may execute code at top level.
  Everything else declares `class`, `function` and `const` data only.
- Some modules are split into several files that share a number prefix (`08_world*.js` §9.1,
  `22_renderer*.js` §23.1, `23_ui*.js` §24.1). Their relative order inside the bundle is
  **irrelevant** and must stay so: such files contain only declarations and reference each other
  at runtime (inside functions/methods), never at definition time.
- Because all files share one scope: **every top-level name is global to the bundle**. Use the
  names given here; do not invent a second helper with the same name. Prefix private helpers of
  a module with the module name (e.g. `wgPlaceBuildings`, `uiEl`) to avoid collisions.
- Top-level `const` may reference another file's top-level `const` only if that file sorts
  earlier (data files `01_`–`04_` come first and may only depend on `00_util.js`).
- No `import`/`export`, no external files, no network. `Math.random()` is allowed **only** in
  `21_fx.js`, `22_renderer*.js` and `23_ui*.js` (visual-only randomness); all game logic uses
  `RNG` (determinism rules in §0.3).
- **No DOM access** except in `06_input.js`, `22_renderer*.js` (canvas only), `23_ui*.js`,
  `24_game.js`, `25_main.js`. Audio: only `05_audio.js` touches `AudioContext`.
  Offscreen surfaces are always `document.createElement('canvas')`, **never** `OffscreenCanvas`.
  Classes in `05`, `21`–`24` must not touch `document`, `window`, `AudioContext` or `matchMedia`
  at class-definition time, only inside constructors/methods (see §0.2).
- `localStorage` access only in `20_save.js`, always inside `try/catch`.
- Units: world coordinates are pixels at zoom 1. `TILE = 32`. Tile coordinates
  `tx = Math.floor(x / TILE)`. Angles in radians, 0 = +x, increasing clockwise (canvas y-down).
  Time in seconds. Fixed update step `FIXED_DT = 1/60`.
- All game objects are plain objects or class instances; **serialize** methods return
  JSON-safe plain objects.
- Defensive coding: never throw on missing data. Unknown item id → `Items.create` returns `null`
  and `Log.warn`s. Every `update(dt)` must tolerate `dt` up to 0.1 s.
- **Log levels (test contract)**: handled or expected conditions — corrupt or missing save,
  unknown item id, unreachable tile repaired, missing `AudioContext`, `localStorage`
  unavailable, generation retry, locked map started via debug API — use `Log.warn`
  (`console.warn`) only. `Log.error` / `console.error` are reserved for genuine bugs
  (exceptions in listeners, violated invariants). The automated tests treat **every**
  `console.error` as a failure.
- **Bounded loops**: every loop whose exit depends on game data has a constant iteration cap and
  exits with `Log.warn` when the cap is reached: `Nav.rebuild` ≤ `(2·maxRadiusTiles+1)²` cells;
  `Nav.findPath` ≤ `maxNodes`; `Physics.moveCircle` ≤ 8 substeps; `ZombieAI.update` ≤ 1 A* per
  step and ≤ 6 separation neighbours per zombie; `WorldGenerator` ≤ 4 repair passes × 6 attempts
  and ≤ 2000 placement tries per building list; `Inventory.add` ≤ `slots` iterations;
  `spawnNearPlayer` ≤ 12 position tries (returns `null`).
- Performance targets: 60 FPS on a normal laptop with 90 zombies, 600 particles, 150×150 map.
  Use the spatial hash for entity queries and the chunk cache for tiles.
- Each file starts with a header comment: purpose, public API summary, dependencies.

### Access pattern

Every subsystem receives the `game` object (or the `raid` object for raid-scoped systems)
in its constructor and keeps it as `this.game` / `this.raid`. Subsystems are reached through
those references — never through globals:

```
game.rng            RNG            non-deterministic (seeded from Date.now() at boot)
game.events         EventBus       base-side events (§27): missionComplete, levelUp, profileChanged; created first in Game.init
game.save           SaveSystem
game.audio          AudioManager
game.input          InputManager
game.camera         Camera
game.renderer       Renderer
game.ui             UIManager
game.profileMgr     ProfileManager   (base, economy, loss rules; owns game.profileMgr.profile)
game.missions       MissionSystem
game.raid           RaidManager | null
game.settings       settings object (see §13)
game.state          'main' | 'base' | 'raid' | 'result'
game.paused         boolean (raid paused)

raid.game, raid.world, raid.nav, raid.hash (SpatialHash), raid.player, raid.zombies (ZombieAI),
raid.weapons (WeaponSystem), raid.loot (LootSystem), raid.extraction (ExtractionSystem),
raid.fx (FX), raid.events (EventBus), raid.rng (RNG seeded by raid seed), raid.time (s elapsed),
raid.timeLimit (s), raid.hour (0..24 game clock), raid.missionStates, raid.flags, raid.hazards,
raid.grenades, raid.result (null until ended)
```

### 0.1 Single-file and `file://` constraints

- Forbidden anywhere: `fetch`, `XMLHttpRequest`, `Worker`, `SharedWorker`, `ServiceWorker`,
  `WebSocket`, `AudioWorklet`, `import()`, `<link>`, `url(http…)`, `@import`, `@font-face` with
  an external `src`, `Image`, `Path2D`, `FileReader`, `history`, pointer lock. `style.css` must
  not contain `@import` or `url(`.
- Any string containing the closing script tag is written as `'<\/script>'` (the build fails
  on a literal sequence).
- Fullscreen/orientation: `#mobile` offers a `<button data-action="fullscreen">` that calls
  `document.documentElement.requestFullscreen?.().catch(() => {})` and then
  `screen.orientation?.lock?.('landscape').catch(() => {})`; failures are silent. The portrait
  hint is CSS-only (`@media (orientation: portrait)`).
- Save export shows the base64 string in a readonly `<textarea>` (select-all on focus) plus a
  best-effort `navigator.clipboard?.writeText` inside `try/catch`; import is a `<textarea>` the
  player pastes into (no file input, no `URL.createObjectURL`).

### 0.2 Node-loadability rules (unit tests load the bundle in a `vm` context, §28)

- (a) Never use `instanceof` with `Array`, `Object`, `Error`, `Map`, `Set` (cross-realm);
  use `Array.isArray`, `typeof` and duck typing.
- (b) No top-level `const` may evaluate a DOM/BOM expression other than
  `typeof X !== 'undefined'` checks.
- (c) Touch detection: `navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches`
  (never `'ontouchstart' in window`).
- (d) The `AudioManager` constructor must not create an `AudioContext`; `unlock()` returns
  `false` and `ready` stays `false` when `window.AudioContext || window.webkitAudioContext` is
  undefined; every other method is a no-op while `!ready`.
- (e) `Renderer`/`FX` create canvases lazily in `resize()`/`render()` via
  `document.createElement('canvas')`.
- (f) `ProfileManager.validate`, `ProfileManager.migrate`, `WorldGenerator.generate/validate`,
  `MissionSystem.validate` are static, callable without a `Game` instance and must not touch
  `localStorage`, `document` or `performance`.

### 0.3 Determinism rules

- `WorldGenerator.generate(mapId, seed, missionDefs)` uses `rng = new RNG(hashString(mapId + ':' + seed))`
  for layout, buildings, props, containers, spawns and lights; everything that depends on
  `missionDefs` (POIs, mission items, keys) uses `rng.fork('missions')` **after** the base layout,
  so the tiles of `(mapId, seed)` never depend on the chosen missions.
- Seed normalisation (in `Game.startRaid`): `seed = (typeof seed === 'number' && Number.isFinite(seed)) ? seed >>> 0 : hashString(String(seed))`;
  default `game.rng.int(1, 2 ** 31 - 1)`; stored as a number in `raidInProgress` and `RaidResult.seed`.
- `raid.rng = new RNG(seed)`; subsystems take forks in constructor order: `loot = rng.fork('loot')`,
  `zombies = rng.fork('ai')`, `weapons = rng.fork('weapons')`, spawn director `rng.fork('director')`,
  `fx` uses `Math.random()`.
- No `Date.now()` / `performance.now()` inside update logic (allowed only in `Uid`, `Log`,
  `SaveSystem`, `Game.loop`, `AudioManager`). Throttles (HUD 10 Hz, nav 0.4 s, A* budget,
  perception 0.15 s) accumulate `dt`.
- Never sort or key behaviour on `uid` order; iterate arrays in insertion order.

---

## 1. `00_util.js` — constants and helpers

```js
const TILE = 32;
const FIXED_DT = 1 / 60;
const GAME_VERSION = '1.0.0';
const SAVE_VERSION = 1;

class RNG {                       // sfc32 or mulberry32, deterministic
  constructor(seed)               // seed: uint32 or any number (hashed)
  next()                          // float [0,1)
  float(min, max)
  int(min, max)                   // integer, inclusive both ends
  chance(p)                       // boolean, p in [0,1]
  pick(arr)                       // element or undefined for empty
  weighted(arr, weightKey = 'w')  // arr of objects with numeric weight; returns element
  shuffle(arr)                    // in place, returns arr
  fork(label)                     // new RNG seeded from this.next() and hashString(label)
  get seed()
}
function hashString(str)          // -> uint32 (FNV-1a or similar)
function clamp(v, a, b)
function lerp(a, b, t)
function dist(ax, ay, bx, by)
function dist2(ax, ay, bx, by)
function angleTo(ax, ay, bx, by)  // atan2(by-ay, bx-ax)
function normAngle(a)             // -> (-PI, PI]
function angleDiff(a, b)          // smallest signed difference b-a
function lerpAngle(a, b, t)
function deepClone(obj)           // JSON based
function formatTime(sec)          // 'mm:ss'
function formatCredits(n)         // '1.250 CR' (de-DE grouping, no decimals)
function formatWeight(kg)         // '12,4 kg'
function circleRectOverlap(cx, cy, r, rx, ry, rw, rh)
function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh)

const Uid = { next() }            // returns unique string 'u<base36 time>_<counter>'

class EventBus {
  on(name, fn)                    // returns unsubscribe function
  off(name, fn)
  once(name, fn)
  emit(name, data)                // synchronous; listener exceptions are caught and logged
  clear()
}

const Log = {
  entries: [],                    // {level, msg, time} capped at 300
  info(...a), warn(...a), error(...a),   // also console.*; error() pushes to Log.errors
  errors: []                      // strings, capped at 100
};

const RARITY = {
  common:    { id:'common',    name:'Gewöhnlich',    color:'#9aa4ad', order:0, mult:1.0 },
  uncommon:  { id:'uncommon',  name:'Ungewöhnlich',  color:'#4fbf5a', order:1, mult:1.6 },
  rare:      { id:'rare',      name:'Selten',        color:'#3f9dff', order:2, mult:2.8 },
  epic:      { id:'epic',      name:'Episch',        color:'#b86bff', order:3, mult:5.0 },
  legendary: { id:'legendary', name:'Legendär',      color:'#ffb12b', order:4, mult:9.0 },
};

const CATEGORY_NAMES = { weapon:'Waffe', ammo:'Munition', medical:'Medizin', food:'Nahrung',
  water:'Wasser', material:'Material', electronics:'Elektronik', tool:'Werkzeug',
  armor:'Rüstung', backpack:'Rucksack', key:'Schlüssel', mission:'Missionsgegenstand',
  collectible:'Sammlerstück', grenade:'Granate' };
```

---

## 2. `01_data_items.js` — item definitions

```js
const AMMO_CALIBERS = { pistol9:'9 mm', pistol45:'.45 ACP', rifle556:'5,56 mm', rifle762:'7,62 mm',
                        shot12:'12/70', sniper308:'.308' };
// Rule: every non-melee weapon's `weapon.ammo` must equal the `ammo.caliber` of at least one ammo
// item with label 'Standard' (so `Items.standardAmmoFor(weapon.ammo)` is never null).

const ITEMS = { [id]: ItemDef, ... };          // ≥ 90 definitions, see list below
const ITEM_LIST = Object.values(ITEMS);
function itemsByCat(cat) -> ItemDef[]
```

`ItemDef`:

```
{
  id, name, cat (see CATEGORY_NAMES keys), rarity (RARITY key), value (CR, base), weight (kg),
  stack (max per slot; 1 for weapon/armor/backpack), desc (German, 1–2 sentences),
  durabilityMax?  (weapon, armor: 100),
  weapon?: { class:'pistol'|'smg'|'rifle'|'shotgun'|'sniper'|'lmg'|'melee',
             damage, fireRate (shots/s), magSize, reloadTime (s), range (px),
             spread (rad, base), recoil (0..1), ammo (caliber key | null for melee),
             noise (px), pellets (1 except shotguns 6–9), auto (bool), penetration (1..3),
             meleeRange? (px), meleeArc? (rad), swingTime? (s), tier (1..5) },
  ammo?:   { caliber, dmgMul, penMul, noiseMul, label ('Standard'|'Hohlspitz'|'Panzerbrechend'|'Schrot'|'Flintenlaufgeschoss') },
  medical?:{ heal, overTime (hp over duration), duration, stopBleed (bool), cureToxic (bool), useTime (s), stamina? },
  food?:   { hunger, useTime },     water?: { thirst, useTime },
  armor?:  { slot:'body'|'head', protection (0..1), speedMul (0.85..1) },
  backpack?:{ slots, weightBonus },
  grenade?:{ damage, radius, fuse (s), noise, kind:'frag'|'molotov'|'flash' },
  key?:    { unlocks (extraction id | 'lab_door' | 'armory_door'), mapId },
  mission?:{ missionId? }           // pure mission items
}
```

Required content (ids are fixed; names German):

- **Weapons (24)**: pistols `pistol_m9` (start weapon), `pistol_p45`, `revolver_357`; SMGs `smg_mp5`,
  `smg_uzi`, `smg_vector`; rifles `rifle_ak`, `rifle_m4`, `rifle_scar`, `rifle_g36`; shotguns
  `shotgun_pump`, `shotgun_sawed`, `shotgun_auto`; snipers `sniper_bolt`, `sniper_semi`;
  LMGs `lmg_pkm`, `lmg_m249`; melee `melee_knife` (start), `melee_bat`, `melee_machete`,
  `melee_fireaxe`, `melee_crowbar`; grenades (cat `grenade`, stack 3) `grenade_frag`,
  `grenade_molotov`, `grenade_flash`.
  Balance guide: pistol 22–35 dmg, 3–5/s, mag 8–15; smg 18–24, 9–13/s, mag 25–35; rifle 32–42,
  7–10/s, mag 30; shotgun 12–16 ×8 pellets, 1.1–2.5/s, mag 5–8, spread 0.18; sniper 110–150,
  0.8–1.5/s, mag 5–10, range 1400; lmg 30–34, 10–12/s, mag 100, reload 6 s; melee 35–70.
  Walker hp 60 → pistol needs 2–3 hits.
- **Ammo (12)**: `ammo_9mm`, `ammo_9mm_hp`, `ammo_45`, `ammo_45_hp`, `ammo_556`, `ammo_556_ap`,
  `ammo_762`, `ammo_762_ap`, `ammo_12g`, `ammo_12g_slug`, `ammo_308`, `ammo_308_ap`,
  stack 60 (shotgun 30, sniper 20). LMGs (`lmg_pkm`, `lmg_m249`) use `ammo:'rifle762'`
  (same rounds as the AK; there is no separate LMG caliber).
- **Medical (7)**: `med_bandage` (stopBleed, heal 10), `med_firstaid` (heal 40, useTime 3),
  `med_medkit` (heal 80, stopBleed, useTime 5), `med_painkillers` (overTime 30/20s),
  `med_antitoxin` (cureToxic), `med_adrenaline` (stamina full, speed buff), `med_splint`.
- **Food (5)**, **Water (4)**, **Materials (7)**: `mat_scrap`, `mat_wood`, `mat_cloth`,
  `mat_chemicals`, `mat_fuel` (fuel can — needed for `fuel` extractions), `mat_gunpowder`,
  `mat_steel`. **Electronics (5)**: `elec_wires`, `elec_circuit`, `elec_battery`, `elec_radio`,
  `elec_harddrive`. **Tools (5)**: `tool_wrench`, `tool_toolbox`, `tool_ducttape`, `tool_lockpick`,
  `tool_drill`.
- **Armor (7)**: body `armor_vest_light`, `armor_vest_police`, `armor_vest_military`,
  `armor_vest_heavy`; head `armor_cap`, `armor_helmet`, `armor_helmet_heavy`.
- **Backpacks (3)**: `pack_small` (12 slots, +8 kg), `pack_medium` (20, +15), `pack_large` (30, +25).
- **Keys (5)**: `key_city_tunnel`, `key_military_gate`, `key_industrial_elevator`,
  `key_research_exit`, `key_lab_card` (opens `lab_door`).
- **Mission items (4)**: `mis_datapack`, `mis_supply_package`, `mis_generator_part`, `mis_sample_case`.
- **Collectibles (6)**: `col_watch`, `col_coin`, `col_jewelry`, `col_bitcoin`, `col_medal`, `col_painting`.

Starting loadout (exact placement in `ProfileManager.newProfile`, §19): equipped `pistol_m9`
(loaded with `ammo_9mm`) in `secondary`, `melee_knife` in `melee`, `pack_small` in `backpack`;
loadout inventory `ammo_9mm` ×30, `med_bandage` ×2. Stash starts with `ammo_9mm` ×30,
`med_bandage` ×2, `food_beans` ×2, `water_bottle` ×2.

---

## 3. `02_data_zombies.js`

```js
const ZOMBIE_TYPES = {
  walker:   { id:'walker',   name:'Zombie',            hp:60,  speed:55,  damage:12, radius:13, size:1.0,
              attackRange:10, attackCooldown:1.2, windup:0.45, sightRange:380, hearingMult:1.0,
              xp:10, color:'#6f8a5a', armor:0, lootChance:0.25, tier:1 },
  runner:   { ... hp:45, speed:165, damage:10, attackCooldown:0.8, sightRange:460, xp:15, tier:1 },
  brute:    { ... hp:420, speed:48, damage:35, radius:20, size:1.6, knockback:140, xp:40, tier:2 },
  screamer: { ... hp:70, speed:70, damage:6, screamCooldown:14, screamRadius:1000, summon:[2,4], xp:25, tier:2 },
  toxic:    { ... hp:120, speed:60, damage:14, toxicRadius:70, toxicDuration:8, xp:30, tier:3 },
  armored:  { ... hp:200, speed:50, damage:18, armor:0.7 (frontal), armorArc:1.9 (rad), xp:35, tier:3 },
  stalker:  { ... hp:90, speed:200, damage:22, lurk:true, ambushRange:220, alpha:0.35, xp:30, tier:3 },
  boss:     { ... name:'Der Wirt', hp:2600, speed:62, damage:40, radius:34, size:2.6, xp:500, tier:5,
              phases:[ { hpPct:1.0, speedMul:1.0, abilities:['slam'] },
                       { hpPct:0.66, speedMul:1.25, abilities:['slam','charge'] },
                       { hpPct:0.33, speedMul:1.4, abilities:['slam','charge','summon'] } ] },
};
const ZOMBIE_LIST = Object.values(ZOMBIE_TYPES);
```

Each type also has `desc` (German) and `dropTable` (array of `{id|cat, w, count:[min,max]}`).

**Every type defines every key shown for `walker`** (`hp, speed, damage, radius, size, attackRange,
attackCooldown, windup, sightRange, hearingMult, xp, color, armor, lootChance, tier`) plus its own
extras; the `...` above is an abbreviation of this document, not of the data file. Defaults when a
value is not listed above: `radius 13, size 1.0, attackRange 10, attackCooldown 1.2, windup 0.45,
sightRange 380, hearingMult 1.0, armor 0, lootChance 0.25`.

---

## 4. `03_data_maps.js`

```js
const MAPS = {
  city: {
    id:'city', name:'Verlassene Stadt', short:'Stadt', desc, size:{w:150,h:150}, unlockLevel:1,
    radioUnlock: 0, difficulty:1, raidDuration:1500 (s), startHour:17,
    palette:{ ground:'#3a3d3f', road:'#2b2d30', roadLine:'#8a7f3f', grass:'#2f4a2c', wallA, wallB,
              roofA, roofB, roofC, floor:'#4a4440', water:'#1f3340', fog:'rgba(20,24,30,0.35)', ambient:0.9 },
    layout:'city'  // 'city' | 'compound' | 'industrial' | 'campus'
    buildings:[ { type:'house', count:[18,24], w:[5,8], h:[5,8], lootTier:1,
                  containers:['crate','fridge','desk'], containerCount:[2,4] },
                { type:'shop', ... }, { type:'supermarket', count:[1,1], w:[12,16], h:[10,14], lootTier:2 },
                { type:'pharmacy', count:[1,2], lootTier:3, containers:['medcabinet','desk'] },
                { type:'apartment', count:[4,6], w:[8,12], h:[8,12], lootTier:2 }, ... ],
    props:{ car:30, dumpster:12, bench:10, tree:40, barrel:10, barricade:14 },
    zombies:{ count:70, weights:{ walker:0.6, runner:0.3, screamer:0.07, stalker:0.03 }, maxAlive:90 },
    boss:null, toxicZones:0,
    extractions:[ { id:'city_edge', name:'Evakuierungszone Stadtrand', kind:'always', duration:10 },
                  { id:'city_tunnel', name:'Versorgungstunnel', kind:'key', requires:'key_city_tunnel', duration:6 },
                  { id:'city_heli', name:'Hubschrauber Dachlandeplatz', kind:'timed', window:[600,900], duration:12, hazard:'horde' } ],
    lootTierBase:1, lights:'street',
  },
  military:   { ..., size:{w:130,h:130}, unlockLevel:5, radioUnlock:2, difficulty:3, raidDuration:1800, startHour:5,
                layout:'compound', zombies:{count:60, weights:{walker:0.35, runner:0.2, armored:0.25, brute:0.15, screamer:0.05}},
                extractions:[ {id:'mil_gate', name:'Bewachtes Tor', kind:'always', duration:12},
                              {id:'mil_heli', name:'Helikopterlandeplatz', kind:'timed', window:[300,700], duration:10, hazard:'horde'},
                              {id:'mil_bunker', name:'Bunkerausgang', kind:'key', requires:'key_military_gate', duration:6} ] },
  industrial: { ..., size:{w:140,h:140}, unlockLevel:3, radioUnlock:1, difficulty:2, raidDuration:1500, startHour:20,
                layout:'industrial', toxicZones:4, zombies:{count:65, weights:{walker:0.45, runner:0.2, toxic:0.2, stalker:0.1, screamer:0.05}},
                extractions:[ {id:'ind_rail', name:'Gleisanschluss', kind:'always', duration:10},
                              {id:'ind_truck', name:'Lastwagen (Treibstoff nötig)', kind:'fuel', requires:'mat_fuel', duration:8},
                              {id:'ind_elevator', name:'Lastenaufzug', kind:'key', requires:'key_industrial_elevator', duration:5} ] },
  research:   { ..., size:{w:120,h:120}, unlockLevel:8, radioUnlock:3, difficulty:4, raidDuration:1800, startHour:22,
                layout:'campus', toxicZones:2, boss:'boss',
                zombies:{count:60, weights:{walker:0.3, runner:0.25, toxic:0.15, stalker:0.15, armored:0.1, screamer:0.05}},
                extractions:[ {id:'res_main', name:'Haupttor', kind:'always', duration:12},
                              {id:'res_emergency', name:'Notausgang Labor', kind:'key', requires:'key_research_exit', duration:5},
                              {id:'res_power', name:'Lüftungsschacht (Strom nötig)', kind:'power', duration:8} ] },
};
const MAP_LIST = Object.values(MAPS);
const MAP_ORDER = ['city','industrial','military','research'];
```

**Every map defines all keys shown for `city`** (the `...` is an abbreviation of this document):
`zombies.maxAlive` = 90 for `city`/`industrial`/`military`, 80 for `research`; a full `palette`
with the same key set; `props`; `lootTierBase`; `lights`; `toxicZones`; `boss`; `startHour`;
`raidDuration`. Map unlocking combines `unlockLevel` and `radioUnlock` exactly as defined in
`Progression.unlockedMapsFor` (§20).

Building `type` values used across the game (generator, loot tier logic and mission `search`
objectives): `house, apartment, shop, supermarket, pharmacy, garage, barracks, armory, warehouse,
checkpoint, hq, factory, workshop, storage, office, lab, security, medical, server, bunker`.

Container types: `crate, locker, fridge, desk, medcabinet, safe, military_crate, toolbox,
weapon_rack, server_rack, lab_cabinet, body` with German names in `CONTAINER_NAMES`.

---

## 5. `04_data_meta.js` — missions, upgrades, recipes, trader, loot tables, XP

```js
const MISSIONS = [ MissionDef... ];   // 6 per map = 24; ids 'city_01'.. 'research_06'
const MISSION_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));
```

`MissionDef`:

```
{ id, mapId, title, desc (2–3 sentences, German, flavour), difficulty (1..5), requiresLevel,
  unlockedBy: [missionIds] (all must be completed; [] for starters), repeatable (bool),
  objectives: [ObjectiveDef], optional: [ObjectiveDef],
  rewards: { credits, xp, items:[{id,count}] }, optionalRewards: { credits, xp },
  failText? (German; default MISSION_FAIL_TEXT) }

const MISSION_FAIL_TEXT = 'Bei Tod, Vermisst oder Abbruch geht der Fortschritt dieses Einsatzes verloren. Missionsgegenstände zählen nur, wenn sie extrahiert werden.';
// Radio and missionSelect screens show `failText || MISSION_FAIL_TEXT` under each mission ("Fehlschlag").

ObjectiveDef:
{ id, type: 'collect' | 'search' | 'kill' | 'kill_boss' | 'retrieve' | 'find_key' |
        'rescue_medical' | 'investigate' | 'generator' | 'extract_at',
  target, count, text }
  // collect:         target = item id; count; completed by hand-in at the radio station
  //                  (items taken from stash) OR automatically at extraction if carried.
  // search:          target = building type ('pharmacy') or container type ('military_crate'); count = containers opened in such places
  // kill:            target = zombie type id or 'any'; count
  // kill_boss:       target = 'boss'
  // retrieve:        target = mission item id spawned by the generator at a POI (e.g. 'mis_supply_package'); must be extracted with it
  // find_key:        target = key item id spawned in a container of the map; completes on pickup
  // rescue_medical:  target = 'medical' category; count = medical items extracted
  // investigate:     target = poi type ('crash_site','radio_tower','lab_entrance','mass_grave',...); stand within 64 px for 5 s
  // generator:       target = 'generator' poi; hold E for 4 s at the generator → raid.flags.generatorOn = true
  // extract_at:      target = extraction id
```

Mission text templates must be concrete, e.g. `text:'3 Medikamentenschränke in der Apotheke durchsuchen'`.

```js
const UPGRADES = {
  stash:    [ {level:1, name:'Lager erweitern I',   cost:{credits:600,  items:[{id:'mat_wood',count:4}]}, desc:'+12 Lagerplätze'}, {level:2,...}, {level:3,...} ],
  workshop: [...],   // repair discount, unlocks recipes tier 2/3, ammo crafting
  medbay:   [...],   // free healing, med recipes, +10 max HP per level
  radio:    [...],   // more mission slots (1 + level), unlocks maps early, shows extraction windows on map
  defense:  [...],   // +secure slot per level, +5 kg carry per level, level 3: 50 % gear insurance on death
  trader:   [...],   // better prices, bigger/rarer stock
};
function upgradeInfo(area, level) -> entry | null      // level 1..3

const RECIPES = [ { id, station:'workshop'|'armory'|'medbay', name, inputs:[{id,count}], output:{id,count},
                    requiresLevel (station upgrade level 0..3), time:0 }, ... ];   // ≥ 16 recipes
const TRADER_STOCK = [ { id, basePrice?, stock:[min,max], minLevel (trader upgrade level 0..3), chance } ... ]; // ≥ 30 lines
// Mandatory lines (no dead ends): at minLevel 0 with chance 1 — every Standard ammo id
// (ammo_9mm, ammo_45, ammo_556, ammo_762, ammo_12g, ammo_308), med_bandage, med_firstaid,
// food_beans, water_bottle, pistol_m9, pack_small; at minLevel ≥ 1: HP/AP ammo, med_medkit,
// armor_vest_light; by minLevel 3 at least one weapon of every class. `restockTrader()` keeps
// every level-0 line in stock (ammo lines with stock ≥ 20 rounds).
const LOOT_TABLES = {
  [containerType]: { rolls:[min,max], entries:[ { id?|cat?, w, count:[min,max], minTier?:1 } ] }, ...,
  floor:      { ... }, zombie: { ... }
};
function xpForLevel(level)    // total xp needed to reach `level` (level 1 = 0). Formula: 60*(level-1)^2 + 140*(level-1)
function levelFromXp(xp)
const MAX_LEVEL = 30;
const XP_REWARDS = { extraction:60, perLootValue:0.08 (xp per CR extracted), missionBase:0 };
const ECONOMY = { sellMul:0.45, buyMul:1.5, traderSellBonus:0.08 /*per level*/, traderBuyDiscount:0.07,
                  repairCostMul:0.35, overflowSellMul:0.6, healCostPerHp:3 };
const SECURE_SLOTS_BASE = 1;
const CARRY_BASE = 30;        // kg
const STASH_SLOTS_BASE = 24;
const START_CREDITS = 800;
```

---

## 6. `05_audio.js` — AudioManager (Web Audio, synthesized)

```js
class AudioManager {
  constructor(game)
  unlock()                      // called on first pointerdown/keydown; creates/resumes AudioContext
  get ready()                   // boolean
  setVolumes({master, sfx, music})   // 0..1 each
  setListener(x, y)             // world position for attenuation/pan
  play(name, opts = {})         // opts: {x, y, volume=1, pitch=1}; spatial if x/y given (falloff radius 900 px)
  startAmbient(mapId)           // low drone + wind noise loop, map flavoured; idempotent
  stopAmbient()
  update(dt)                    // ambient variation, heartbeat when hp low (raid.player.hp < 25) — optional
}
```

Implementation contract: sounds are **data**, not 48 hand-written routines:
`const AUDIO_DEFS = { [name]: { layers:[ { type:'sine'|'square'|'saw'|'tri'|'noise', freq, freqEnd?, attack, decay, gain, filter?:{type, freq, q}, delay? } ], rateLimitMs? } }`
played by one generic `audioPlayDef(def, opts)` (top-level function in `05_audio.js`).
Polyphony cap 24 voices (oldest voice stolen); per-name rate limits: `footstep`/`footstep_run`
≥ 120 ms apart, `zombie_growl` ≥ 400 ms, `shot_*` unlimited. Spatialisation = `StereoPannerNode`
+ `GainNode` (no `PannerNode`). `unlock()` is bound once to `pointerdown`, `touchend` and `keydown`
on `window`. All methods are no-ops while `!ready` or when `AudioContext` is undefined (§0.2 d).

Sound names (all must exist as `AUDIO_DEFS` keys; silence is acceptable fallback but each should have a distinct synth):
`shot_pistol, shot_smg, shot_rifle, shot_shotgun, shot_sniper, shot_lmg, melee_swing, melee_hit,
reload_start, reload_end, empty_click, footstep, footstep_run, zombie_growl, zombie_alert,
zombie_attack, zombie_hit, zombie_die, screamer, boss_roar, player_hurt, heal, eat, pickup, drop,
door_open, door_close, ui_click, ui_hover, ui_error, ui_open, extract_start, extract_tick,
extract_done, alarm, explosion, fire, flashlight, level_up, mission_complete, objective, loot_open,
buy, sell, craft, toxic, grenade_throw, warning`.

---

## 7. `06_input.js` — InputManager

```js
const INPUT_ACTIONS = {
  moveUp:['KeyW','ArrowUp'], moveDown:['KeyS','ArrowDown'], moveLeft:['KeyA','ArrowLeft'], moveRight:['KeyD','ArrowRight'],
  reload:['KeyR'], interact:['KeyE'], sprint:['ShiftLeft','ShiftRight'], crouch:['KeyC'], flashlight:['KeyF'],
  inventory:['Tab'], map:['KeyM'], grenade:['KeyG'], slot1:['Digit1'], slot2:['Digit2'], slot3:['Digit3'],
  slot4:['Digit4'], slot5:['Digit5'], pause:['Escape'], quickMed:['KeyQ'], drop:['KeyX']
};
class InputManager {
  constructor(game, canvas)
  isDown(action)                // held (false while disabled)
  pressed(action)               // became pressed since last endFrame() (false while disabled)
  pressedRaw(action)            // press edge regardless of `enabled` — used only by Game.handleGlobalKeys (§25.1)
  released(action)
  moveAxis()                    // {x,y} normalized length ≤ 1 (keyboard or left touch stick)
  aimAngleFrom(sx, sy)          // radians from screen point (player on screen) to the aim source, see rules below; falls back to lastAim
  lastAim                       // last valid aim angle, initial 0; updated whenever aimAngleFrom produces a valid angle
  aimWorld                      // null | {x, y} world point set by debugAimWorld (tests)
  wantsFire()                   // (non-touch) mouse button 0 held || touchFireHeld || (settings.aimAssist && |aimStick| > 0.75)
  get mouse()                   // {x, y, down, rightDown}
  get touchMode()               // boolean, see rule below
  setTouchMode(bool)
  // Called by UIManager's virtual controls:
  setStick(which, x, y)         // which: 'move'|'aim'; x,y in [-1,1]; (0,0) when released; 'aim' clears aimWorld
  touchAction(action, down)     // virtual buttons (interact, reload, sprint, crouch, flashlight, inventory, map, grenade, pause, quickMed); down=true then false → one pressed() edge
  touchFire(down)               // sets touchFireHeld
  endFrame()                    // clear per-frame edges (pressed/released/pressedRaw) regardless of `enabled`; called by Game.frame (§25.1)
  setEnabled(bool)              // when false, isDown()/pressed() return false (menus open); state and edges are still recorded
  consumeAll()                  // clear pressed edges (after UI handled a key)
  // Debug entry points (window.DZ, §26) — same code paths as real events:
  debugKey(code, down)          // runs the exact keydown/keyup handler (edge recording included, independent of setEnabled)
  debugMouse(x, y, down)        // numeric x/y set the mouse CSS-pixel position and clear aimWorld; undefined x/y keep the position;
                                // down true/false sets the button-0 held state; undefined keeps it
  debugAimWorld(wx, wy)         // sets aimWorld = {x:wx, y:wy}; never changes the button state
}
```

Aim rules (`aimAngleFrom(sx, sy)`, `sx,sy` = player screen position):
- `aimWorld` set → `angleTo(player.x, player.y, aimWorld.x, aimWorld.y)` (stable while the camera moves).
- touch mode → `atan2(aimStick.y, aimStick.x)` when `|aimStick| > 0.2`, else `lastAim`.
- otherwise → angle from `(sx, sy)` to the mouse; if the mouse is closer than 2 px to `(sx, sy)`
  return `lastAim`. A real `pointermove` clears `aimWorld`.

Touch mode: evaluated in the constructor, in `applySettings` and on the first `touchstart`:
`touchMode = settings.touchControls === 'on' || (settings.touchControls === 'auto' && (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches))`.

- `keydown` of mapped keys calls `preventDefault()` (especially Tab, Space, arrows) while
  `game.state === 'raid'`.
- Mouse coordinates are in **canvas CSS pixels** (not device pixels); Renderer handles DPR.
- `blur` event releases all keys.

---

## 8. `07_camera.js` — Camera

```js
class Camera {
  constructor(game)
  x, y          // world center
  zoom          // 1.0 desktop; 0.8 if viewport width < 900
  width, height // viewport in CSS px (set by resize)
  resize(w, h)
  follow(tx, ty, dt, lookAheadX = 0, lookAheadY = 0)   // exponential smoothing (rate 6/s), clamps to world bounds if world given via setBounds
  setBounds(worldW, worldH)      // pixels; null = unbounded
  snap(x, y)
  addShake(strength)            // px, decays (shake disabled when game.settings.screenShake === false)
  update(dt)
  worldToScreen(wx, wy)        // -> {x,y}
  screenToWorld(sx, sy)        // -> {x,y}
  viewBounds()                 // -> {x,y,w,h} world rect visible (with 1 tile margin)
}
```

---

## 9. `08_world.js`, `08_world_gen.js`, `08_world_layouts.js` — World and WorldGenerator

### 9.1 File split (one developer per file)

- `08_world.js`: `T`, `tileBlocksMove/Sight/Bullets`, `tileSpeedMul`, `class World` and the BFS
  helper `function wgReachability(world, fromTx, fromTy) -> Uint8Array` (1 = reachable; closed
  and locked doors count as walkable) that `WorldGenerator.validate` uses.
- `08_world_gen.js`: `class WorldGenerator` (buildings, rooms, containers, props, extractions,
  spawns, POIs, lights, validation + repair, attempt loop).
- `08_world_layouts.js`: `function wgLayoutCity(g)`, `wgLayoutCompound(g)`, `wgLayoutIndustrial(g)`,
  `wgLayoutCampus(g)`. Each receives the generator context
  `g = { world, rng, map, missionDefs }`, paints roads/yards/fences/rails/water/toxic pools into
  `world.tiles` and returns
  `{ blocks:[{tx, ty, w, h, zone:'residential'|'commercial'|'military'|'industrial'|'lab'}], roads:[{tx, ty, w, h}], yards:[{tx, ty, w, h}], bossArena: {tx, ty, w, h} | null }`.
  `WorldGenerator` then places buildings into `blocks` (zone decides the allowed building types),
  props into `yards`/`roads`, and the boss hall into `bossArena`.

Tile codes:

```js
const T = { VOID:0, GROUND:1, ROAD:2, FLOOR:3, WALL:4, DOOR_CLOSED:5, DOOR_OPEN:6, WINDOW:7, WATER:8,
            RUBBLE:9, GRASS:10, TOXIC:11, FENCE:12, BARRICADE:13, PROP_SOLID:14, PROP_LOW:15,
            ROAD_LINE:16, SIDEWALK:17, DOOR_LOCKED:18, GRAVEL:19 };
// Movement blocked:  VOID, WALL, DOOR_CLOSED, DOOR_LOCKED, WINDOW, WATER, FENCE, BARRICADE, PROP_SOLID, PROP_LOW
// Sight blocked:     VOID, WALL, DOOR_CLOSED, DOOR_LOCKED, BARRICADE, PROP_SOLID
// Bullets blocked:   VOID, WALL, DOOR_CLOSED, DOOR_LOCKED, BARRICADE, PROP_SOLID
// Slow (×0.6):       RUBBLE, TOXIC(also damage), WATER n/a
function tileBlocksMove(t), tileBlocksSight(t), tileBlocksBullets(t), tileSpeedMul(t)
```

```js
class World {
  constructor(mapId, seed, w, h)
  mapId, map (MAPS[mapId]), seed, w, h, tiles (Uint8Array), tileVariant (Uint8Array, 0..3 for texture variety)
  buildings: [ { id, type, name, tx, ty, w, h, roofColor, wallColor, floorColor, doors:[{tx,ty}],
                 rooms:[{tx,ty,w,h}], lootTier, locked (bool, needs key_lab_card for 'lab' security door), containers:[uids] } ]
  props:      [ { id, type:'car'|'dumpster'|'bench'|'tree'|'barrel'|'barricade'|'crate'|'tank'|'generator'|'truck'|'lamp'|'sandbag'|'pallet'|'tower'|'antenna'|'pipe', tx, ty, w, h, rot, color, solid } ]
  containers: [ { uid, type, tx, ty, x, y, tier, buildingId|null, buildingType|null, items: null|ItemInstance[] (null = not yet rolled), opened:false, locked:false } ]
  floorLoot:  [ { uid, inst, x, y } ]
  playerSpawn: {x,y}
  zombieSpawns: [ { x, y, count, types: [typeId...] } ]
  extractions: [ { id, name, kind, requires, duration, window, hazard, x, y, radius:72 } ]   // copied from map def + position
  pois:       [ { id, type ('generator'|'crash_site'|'radio_tower'|'lab_entrance'|'mass_grave'|'boss_arena'|'supply_drop'|'checkpoint'|'server_room'|'water_tower'), x, y, radius:64, buildingId|null, used:false, timer:0 } ]
  lights:     [ { x, y, radius, color, flicker (bool) } ]
  toxicZones: [ { x, y, r } ]
  bossArena:  { x, y, r } | null
  version: 0            // incremented on any tile change (renderer chunk invalidation)
  tile(tx, ty)          // -> code, VOID outside
  setTile(tx, ty, code) // bumps version, marks chunk dirty: dirtyChunks (Set of 'cx,cy')
  blocksMove(tx, ty), blocksSight(tx, ty), blocksBullets(tx, ty), speedMul(tx, ty)
  isWalkable(tx, ty)    // !blocksMove
  buildingAt(x, y)      // world px -> building whose footprint contains the point (incl. walls) | null
  isIndoor(x, y)        // tile is FLOOR or building footprint
  pixelW, pixelH
  containerAt(x, y, r)  // nearest container within r | null
  serializeDoors()      // not needed for v1; raids are not saved
}

class WorldGenerator {
  static generate(mapId, seed, missionDefs = [])  // -> World ; tiles deterministic for (mapId, seed); mission placement deterministic for (mapId, seed, mission ids) — see §0.3
  static validate(world, missionDefs = [])        // -> { ok, unreachable:[{kind, id, tx, ty}], missingObjectives:[objectiveId] }
     // ok === unreachable.length === 0 && missingObjectives.length === 0
     // missingObjectives: for every objective of `missionDefs` of type retrieve / find_key / investigate / generator / kill_boss / extract_at
     // whose target (floorLoot or container item, poi type, generator poi, bossArena, extraction id) does not exist in `world`
}
```

Generation requirements:

1. Border: 2-tile ring of `VOID` (impassable), an inner ring of `FENCE`/`WALL` look.
2. **Layouts**: `city` (road grid 1 block = 14–20 tiles, roads 3 tiles wide with `ROAD_LINE` center,
   `SIDEWALK` edge, buildings in blocks, cars on roads, grass yards); `compound` (perimeter fence
   with checkpoints, central parade ground, rows of barracks/warehouses, sandbags, towers);
   `industrial` (large halls 14–22 tiles, pipes, tanks, rail on one edge, gravel yards, toxic pools);
   `campus` (lab blocks around a quad, underground `bunker`/`lab` cluster = boss arena hall ≥ 20×16
   tiles with a locked door needing `key_lab_card`, which spawns in a `security` building container).
3. **Buildings**: rectangular footprints, min 2-tile gap, perimeter `WALL`, interior `FLOOR`,
   1–3 exterior `DOOR_CLOSED` (never at corners, must open onto a walkable outside tile),
   `WINDOW` every 3–5 wall tiles, interior walls splitting into rooms with interior doors so
   **every floor tile is reachable from every exterior door**. Room algorithm (fixed):
   recursive split of the interior rectangle along its longer axis at a random position that
   leaves ≥ 3 tiles on each side, max depth 3; each split wall receives exactly one `DOOR_CLOSED`
   at a random non-corner position; stop when both halves would be < 6 tiles along the split axis.
   Containers placed on floor tiles touching a wall, count from map def; container `tier` =
   `map.lootTierBase + building.lootTier - 1` (clamped 1..5). Military/lab buildings use
   `military_crate`, `weapon_rack`, `lab_cabinet`, `safe` more often.
4. **Props** from `map.props` weights; cars (`PROP_SOLID`, 2×4 tiles rotated) on roads,
   barrels/crates/benches (`PROP_LOW`), trees (`PROP_SOLID`, 1×1), barricades (`BARRICADE`).
   Never place props on doors or inside buildings, never block a door's exterior tile.
5. **Extractions**: positions near different map edges (always-kind farthest from the player
   spawn, ≥ 60 % of map diagonal away); `radius` 72 px; tile area under them is `GROUND`/`GRAVEL`
   and clear; a small marker prop (`lamp`) nearby.
6. **Player spawn**: walkable tile near an edge, ≥ 30 tiles from any zombie spawn group.
7. **Zombie spawns**: `map.zombies.count` zombies in groups of 2–6 at walkable spots ≥ 28 tiles from
   the player spawn; indoor groups include `stalker`/`screamer` when weighted. If `map.boss`,
   one boss at `bossArena` center plus 4 walkers.
8. **POIs**: always one `generator` (prop `generator` + poi, near a `warehouse`/`factory`/`hq`),
   plus POIs required by `missionDefs` (`investigate` targets, `retrieve` items placed on the
   floor as `floorLoot` at a POI or in a container, `find_key` keys placed in a container of tier ≥ 2).
   Keys for `kind:'key'` extractions spawn in exactly one container of the map (tier ≥ 2) if no
   mission already placed them. The `power` extraction is enabled by `generatorOn`.
9. **Lights**: street lamps along roads (`lights` with `flicker` 20 %), indoor ceiling lights in
   30 % of rooms, extraction markers (green light), toxic zones (greenish).
10. **Connectivity validation**: BFS from `playerSpawn` over walkable tiles **treating closed and
    locked doors as walkable**. Every extraction, POI, container (its adjacent floor tile) and
    zombie spawn must be reachable; otherwise carve a 1-tile `GROUND`/`DOOR_CLOSED` corridor from
    the nearest reachable tile (Bresenham), re-validate, up to 4 repair passes, then
    `seed + 1` regeneration (max 6 attempts; the last attempt is accepted with a `Log.warn`).
    `WorldGenerator.validate(world, missionDefs)` (signature above) is used by the attempt loop
    and by the tests; `Log.warn` (never `Log.error`) on every repair/retry.
11. Generation must finish in < 300 ms for the largest map on a normal laptop.

---

## 10. `09_collision.js` — Physics, SpatialHash, Nav

```js
class Physics {
  static moveCircle(world, x, y, r, dx, dy)
    // -> {x, y, collided}  axis-separated slide against blocking tiles; never tunnels (substeps when |d| > r)
  static raycastTiles(world, x0, y0, x1, y1, blockFn = tileBlocksBullets)
    // -> {hit, x, y, tx, ty, dist, tile}  DDA grid walk; (x,y) is the hit point or (x1,y1)
  static lineOfSight(world, x0, y0, x1, y1)   // boolean, uses tileBlocksSight
  static circleHit(ax, ay, ar, bx, by, br)
  static segmentCircle(x0, y0, x1, y1, cx, cy, r)  // -> t in [0,1] | -1
  static resolveCircles(a, b)                 // pushes two entities {x,y,radius} apart equally (zombie separation)
}

class SpatialHash {
  constructor(cellSize = 96)
  clear()
  insert(e)                    // e has x, y, radius, uid
  remove(e)
  update(e)                    // re-bucket if moved cells
  query(x, y, r)               // -> array of entities whose cells intersect the circle (coarse; caller does exact test)
  queryRect(x, y, w, h)
  forEachNear(x, y, r, fn)
}

class Nav {
  constructor(world)           // allocates once: Int32Array dist (w*h, -1 = unreached), Uint8Array dir (w*h; 0 = none, 1..8 = neighbour index),
                               // A* buffers: Int32Array gScore, Int32Array cameFrom, Uint16Array visitedStamp (generation counter), preallocated binary heap
  // Flow field toward a target (the player): Dijkstra with a bucket queue over integer costs
  // (1 normal, 2 RUBBLE/TOXIC, 4 DOOR_CLOSED/DOOR_LOCKED, 1 DOOR_OPEN), radius-limited (Chebyshev)
  rebuild(targetX, targetY, maxRadiusTiles = 60)   // world px; skipped when the target tile is unchanged since the last rebuild; must finish in < 3 ms for 150×150
  dirAt(x, y)                  // -> {dx, dy} unit vector along `dir` (diagonals normalised) toward target | null when dist === -1
  distAt(x, y)                 // -> cost | Infinity
  findPath(x0, y0, x1, y1, maxNodes = 4000)   // A*, 8-neighbour without corner cutting, doors walkable (cost 3); no per-call Map/Set allocation
                               // -> [{x,y}] world tile centers (excluding start) | null (unreachable or budget exhausted)
  randomWalkable(rng, nearX, nearY, radiusTiles)  // -> {x,y} | null (≤ 20 tries)
}
```

---

## 11. `10_items_inventory.js` — Items, Inventory, Equipment

```js
class Items {
  static def(instOrId)                 // -> ItemDef | null
  static create(id, count = 1)         // -> ItemInstance | null ; weapons get mag = magSize loaded with the standard ammo of the caliber
  static clone(inst)
  static canStack(a, b)                // same id, stack > 1, both without durability
  static weight(inst)                  // def.weight * count
  static value(inst)                   // def.value * count * (durability ? 0.4 + 0.6*durability/durabilityMax : 1)
  static rarity(inst)                  // RARITY entry
  static isWeapon(inst) / isArmor / isUsable (medical/food/water) / isAmmo / isGrenade
  static describe(inst)                // -> string[] German lines for tooltips (stats)
  static standardAmmoFor(caliber)      // -> ammo item id with label 'Standard'
  static serialize(inst)               // -> plain object {uid,id,count,durability?,mag?,ammoId?}
  static deserialize(obj)              // -> ItemInstance | null (validates id, clamps count)
}
```

`ItemInstance`: `{ uid, id, count, durability? (0..durabilityMax), mag? (rounds loaded), ammoId? (loaded ammo item id) }`.
Runtime-only fields (never serialized — `Items.serialize` whitelists exactly the fields above):
`rt` (weapon runtime: `{cooldown, reloading, reloadTimer, bloom}`, numbers/booleans only) and
`raidFound` (boolean; set to `true` on every instance created by `LootSystem` or picked up in a
raid — containers, floor loot, zombie drops; items brought from the stash never have it). Mission
evaluation (§16) counts only `raidFound` instances.

```js
class Inventory {
  constructor(slots)
  slots, items (Array length slots, null = empty)
  setSlots(n)                          // -> overflow ItemInstance[] (when shrinking)
  canAdd(inst)                         // boolean: true when the WHOLE count fits (considering stacking)
  add(inst)                            // -> {ok, remaining}: merges into existing stacks first, then empty slots; partial adds allowed.
                                       //    ok === (remaining === null), i.e. true only when the whole count was placed;
                                       //    remaining is the SAME instance carrying the leftover count (callers compare remaining.count with the original)
  addMany(list)                        // -> array of non-null remainders
  remove(uid, count = Infinity)        // -> removed ItemInstance | null
  removeById(id, count)                // -> number removed
  count(id)
  has(id, count = 1)
  get(idx) / set(idx, inst)
  indexOf(uid)
  move(from, to)                       // within this inventory: merge if stackable (moves min(src.count, stackMax - dst.count); the remainder stays at `from`),
                                       //    else swap; -> true if anything moved
  transfer(idx, other, toIdx = -1)     // move item at idx to other Inventory (merge with the same partial rule / empty slot / swap) -> true if anything moved
  split(idx, count)                    // 1 ≤ count ≤ inst.count - 1; -> boolean (needs an empty slot; false otherwise)
  sort()                               // by category, rarity desc, name
  all()                                // non-null items
  freeSlots(), isFull(), weight(), totalValue()
  clear()
  serialize()                          // {slots, items:[serialized|null]}
  static deserialize(obj, fallbackSlots)
}

const EQUIP_SLOTS = ['primary','secondary','melee','grenade','armorBody','armorHead','backpack'];
class Equipment {
  constructor()
  primary, secondary, melee, grenade, armorBody, armorHead, backpack   // ItemInstance | null
  static slotFor(inst)                 // 'primary' for rifle/shotgun/sniper/lmg, 'secondary' for pistol/smg,
                                       // 'melee', 'grenade', 'armorBody', 'armorHead', 'backpack' | null
  canEquip(inst)                       // boolean
  equip(inst, slot = Equipment.slotFor(inst))   // -> {ok, replaced: ItemInstance|null}
  unequip(slot)                        // -> ItemInstance | null
  get(slot)
  weaponSlots()                        // [primary, secondary, melee] (nulls kept)
  weight()
  protection()                         // {body, head} from armor with durability > 0
  carryBonus()                         // backpack.weightBonus
  backpackSlots()                      // backpack.slots or 6 (pockets only)
  serialize() / static deserialize(obj)
}
```

Weapon ammo rule: pistols/SMGs may go in `secondary` **or** `primary`; long guns only `primary`.
Both `primary` and `secondary` accept pistols/SMGs. Weapon slots 1–5 in the raid: 1 primary,
2 secondary, 3 melee, 4 grenade, 5 quick-medic (uses the best medical item carried).

---

## 12. `11_loot.js` — LootSystem

```js
class LootSystem {
  constructor(raid)                    // uses raid.rng.fork('loot')
  rollContainer(container, world)      // fills container.items (ItemInstance[]) using LOOT_TABLES[type], tier, map; idempotent
  rollZombieDrop(zombie)               // -> ItemInstance[] (may be empty; type.lootChance)
  rollFloorLoot(tier)                  // -> ItemInstance
  rarityWeights(tier)                  // {common, uncommon, rare, epic, legendary} weights shifting with tier 1..5
  pickByCategory(cat, tier)            // -> ItemDef weighted by rarity
}
```

Rules: every instance the LootSystem creates gets `inst.raidFound = true` (§11). Tier 1: ≈ 70 %
common, 25 % uncommon, 5 % rare; tier 5: 20/30/30/15/5. Weapons appear
with random durability 35–95 and partially filled magazine. Ammo count 5–30. Never roll `key`
or `mission` items from tables (placed by the generator). Container `items` count from
`rolls`; empty containers allowed (10 %).

---

## 13. `12_weapons.js` — WeaponSystem

```js
class WeaponSystem {
  constructor(raid)
  projectiles: []          // {x,y,vx,vy,dmg,pen,range,traveled,ownerIsPlayer,dirX,dirY,trail:[...],ttl}
  tryFire(inst, shooter, aimAngle, isPlayer = true)
     // inst: weapon ItemInstance (uses inst.rt, inst.mag, inst.ammoId, inst.durability); shooter = raid.player (or any {x,y})
     // -> {fired:boolean, reason:'cooldown'|'reloading'|'empty'|'melee'|null}
     // A weapon with inst.rt.cooldown <= 0 fires on the first frame wantsFire() is true (no initial delay).
     // spread = def.spread × sm × (1 + inst.rt.bloom) with sm = typeof shooter.spreadMul === 'function' ? shooter.spreadMul() : 1 (§14);
     // bloom += def.recoil × 0.5 per shot, decays 2/s in update(); pellets, mag--, durability -= 0.15,
     // misfire chance when durability < 15 (10 %), muzzle flash via raid.fx.muzzleFlash, camera shake (recoil*6),
     // audio 'shot_<class>' at shooter, raid.emitNoise(x,y, def.noise * ammo.noiseMul, 'shot'),
     // stats: if (shooter.stats) shooter.stats.shotsFired++ (hits: shooter.stats.shotsHit++, damageDealt += dealt)
  startReload(inst, inventory)        // -> {ok, reason:'full'|'no_ammo'|'reloading'|null}; picks ammo of matching caliber with the most rounds in inventory (prefer inst.ammoId if present)
  cancelReload(inst)
  finishReload(inst, inventory)       // internal. need = magSize - inst.mag; take = min(need, rounds of the chosen ammo id in inventory);
                                      // if the chosen ammo id differs from inst.ammoId and inst.mag > 0: the old rounds are first returned to the inventory as
                                      // Items.create(inst.ammoId, inst.mag) (dropped via raid.dropItem at the player if they do not fit) and inst.mag = 0;
                                      // then inst.mag += take; inventory.removeById(ammoId, take); inst.ammoId = ammoId
  melee(inst, shooter, aimAngle)      // -> {hit:number}; arc hit test vs raid.zombies within meleeRange; cooldown swingTime; noise 60;
                                      // durability -= 0.6 per LANDED hit (never per swing); durability < 15 → damage ×0.6; at 0 the weapon still swings at 40 % damage (never breaks)
  throwGrenade(inst, from, aimAngle, power = 1)  // -> boolean; adds to raid.grenades: {x,y,vx,vy,z,fuse,def,inst}; consumes 1 from stack;
                                      // when inst.count reaches 0 the caller (Player) sets equipment.grenade = null
  update(dt)                          // reloads, bloom decay, projectiles (stepping rule below), grenades (arc, bounce off blocking tiles,
                                      // explode: damage to zombies & player within radius with falloff, fx.explosion, noise, molotov → raid.addHazard fire)
  ammoInInventory(inst, inventory)    // -> number of rounds of matching caliber
  reserveText(inst, inventory)        // 'mag / reserve' string helper
}
```

Projectile speed 1400 px/s (sniper 2200). Damage falloff: full within 60 % of range, then linear
to 50 % at range, destroyed beyond range. `pen` vs armored zombie: see §15. Zombie hit → `raid.zombies.damage(z, dmg, {pen, dirX, dirY, source:'bullet'})`,
`raid.fx.blood(...)`, hit marker (`raid.fx.hitMarker()`), stats `shotsHit` (once per projectile, not per penetrated zombie).
Bullets hitting walls: `raid.fx.impact(x, y, angle, tile)`. Bullets pass `WINDOW`, `FENCE`, `PROP_LOW`.

Projectile stepping (fixed, one hash query per projectile per step): each fixed step a projectile
moves one segment `(x,y) → (x+vx·dt, y+vy·dt)`. (1) `Physics.raycastTiles` along the segment clips
it at the first bullet-blocking tile (impact fx there). (2) `raid.hash.queryRect` on the clipped
segment's AABB padded by 24 px, then `Physics.segmentCircle` for each candidate; the smallest `t`
is hit first. (3) Penetration: up to `pen - 1` further zombies along the same segment may be hit
(damage × 0.6 per passed zombie), then the projectile dies. Cap: 400 live projectiles (oldest
dropped).

---

## 14. `13_player.js` — Player

```js
class Player {
  constructor(raid, loadout)   // loadout: {equipment: Equipment, inventory: Inventory, secure: Inventory, hp, hpMax, hunger, thirst} (ProfileManager.buildLoadout, §19)
  x, y, angle, radius = 12, uid = 'player'
  hp, hpMax, stamina = 100, staminaMax = 100, hunger, thirst   // 100 = fine; hunger/thirst come from the loadout (profile)
  bleeding (bool), bleedTimer, toxic (s remaining), effects: [{id, timer, speedMul?, ...}]
  crouching, sprinting, moving, flashlightOn = true, dead, god = false   // god: takeDamage returns early (DZ.god)
  equipment, inventory, secure
  activeSlot (0..4)            // starts at the index of the first non-null entry of equipment.weaponSlots() (primary → secondary → melee), else 0
  weaponInst                   // getter: slots 0–2 → equipment.weaponSlots()[activeSlot] (the SAME ItemInstance stored in equipment, never a copy); slots 3–4 → null
  using: null | {inst, timer, total}      // channelled item use
  interactTarget: null | Interactable     // computed each update via raid.findInteractable
  holdProgress (0..1)          // hold-interactions (generator, POI timer); advanced by RaidManager.update (§18), only displayed here
  causeOfDeath: null | string  // German, set by takeDamage on the killing hit: sources 'Vergiftung', 'Feuer', 'Verblutet', 'Explosion' are used verbatim,
                               // any other source (a zombie's type.name) becomes 'Getötet von: <source>'; 'Zeit abgelaufen' is set by RaidManager.onTimeout
  stats: { shotsFired, shotsHit, kills, killsByType:{}, damageDealt, damageTaken, lootValue, containersOpened, distance }
                               // the ONLY stats object of a raid (there is no raid.stats); WeaponSystem, ZombieAI and RaidManager write into raid.player.stats
  update(dt, input)
     // movement (walk 150, sprint 250 (stamina 22/s, needs > 0 and not overweight), crouch 85; weightSpeedMul; tile speedMul; effects),
     // Physics.moveCircle; aim angle from input.aimAngleFrom(screen pos); fire/auto-fire (slots 0–2: weapons.tryFire / melee; slot 3: throwGrenade; slot 4: useItem(bestMedical()));
     // reload (R); weapon slots 1–5 → switchSlot(0..4); grenade (G = throw regardless of slot); quick-med (Q); interact (E: press action via raid.interact; hold handled by RaidManager);
     // flashlight (F); drop (X) is IGNORED by Player — dropping happens only through the inventory/loot screens (UIManager.dropSelected, §24);
     // footsteps noise every 0.38 s moving (walk 130, sprint 260, crouch 45), stamina regen 18/s after 1 s,
     // hunger -2.0/min, thirst -3.0/min (raid only; nothing decays in the base); hunger < 25 → stamina regen ×0.5; thirst < 25 → hpMax effective -20 (clamped);
     // hunger 0 or thirst 0 → -0.5 hp/s; bleeding: -1.5 hp/s until bandaged (max 45 s then stops); toxic: -2 hp/s while > 0.
  spreadMul()               // crouching 0.6; else sprinting 2.0; else moving 1.4; else 1.0; × effect multipliers (used by WeaponSystem.tryFire)
  takeDamage(amount, opts = {source, from:{x,y}, bleedChance, toxic})
     // if god → return; protection p = body.protection × 0.75 + head.protection × 0.25 (missing or broken piece = 0); amount *= (1 - p);
     // body durability -= rawAmount × 0.5, head durability -= rawAmount × 0.2; fx.damageFlash, raid.fx.hitDirection(angleTo(x, y, from.x, from.y)) when opts.from is given,
     // camera shake, audio 'player_hurt', stats.damageTaken += dealt, raid.events.emit('playerHit', {amount: dealt}); if hp <= 0 → causeOfDeath from opts.source → die()
  heal(amount), applyEffect(effect), cureBleeding(), cureToxic()
  useItem(inst)             // starts channel (useTime); on finish applies medical/food/water and consumes 1
  bestMedical()             // chooses: bleeding → bandage/medkit; else lowest useTime that heals missing hp
  switchSlot(idx)           // 0–2 only if that weapon slot is non-null; 3 only if equipment.grenade; 4 only if bestMedical(); otherwise ignored with audio 'ui_error' and toast 'Leer'
  carryLimit()              // CARRY_BASE + equipment.carryBonus() + profile defense bonus
  totalWeight()             // inventory + equipment + secure
  weightSpeedMul()          // ≤ 70 %: 1.0; 70–100 %: 1.0 → 0.8; > 100 %: 0.55 and no sprint
  noiseRadius()             // current movement noise
  die()                     // dead = true; raid.onPlayerDeath()
  screenPos()               // via raid.game.camera
  serializeState()          // for result/loss rules: {equipment, inventory, secure, hp}
}
```

`Interactable` (returned by `raid.findInteractable`):
`{ kind:'container'|'door'|'loot'|'extraction'|'poi'|'body', ref, x, y, dist, prompt (German, e.g. 'E – Kiste durchsuchen'), hold (bool) }`
`ref` per kind: `container` → World container object; `door` → `{tx, ty}`; `loot` → floorLoot
entry `{uid, inst, x, y}`; `extraction` → ExtractionSystem point; `poi` → World poi;
`body` → container of type `body`.

---

## 15. `14_zombies.js` — ZombieAI

```js
class ZombieAI {
  constructor(raid)
  zombies: []            // all including corpses (z.dead, z.deathTimer); corpses are spliced out at deathTimer ≥ 25 s (boss 60 s)
  directorEnabled = true // spawn director on/off (DZ.director)
  pathBudget             // reset to 1 at the start of every update(dt); every nav.findPath call (investigate, wander, stuck re-plan) decrements it and is skipped when 0
                         // (the zombie keeps its old path or steers directly); zombies needing a path are served round-robin in array order
  spawn(typeId, x, y, groupId = null)        // -> zombie | null; cap: aliveCount() >= (raid.map.zombies.maxAlive ?? 90) → null
  spawnInitial(world)
  spawnNearPlayer(typeId, minDist = 500, maxDist = 900, count = 1, groupId = Uid.next())
                         // up to 12 attempts per zombie: angle rng.float(0, 2π), d rng.float(minDist, maxDist); the tile must be walkable
                         // (nav.randomWalkable radius 2 as fallback) and !Physics.lineOfSight(world, player, spot); after 12 failures the last walkable
                         // spot is accepted; no walkable spot → null. Counts against maxAlive (skipped silently when capped). -> zombie[] spawned
  onNoise(x, y, radius, kind, strength = 1)  // 'shot'|'step'|'door'|'explosion'|'scream'|'alarm'; listener-side environment factor:
                         // if raid.world.isIndoor(x, y) and the listener is outdoors (!world.isIndoor(z.x, z.y)) the radius is × 0.6;
                         // listeners inside the same building (world.buildingAt) hear the full radius
  update(dt)
  damage(z, amount, opts = {pen:1, dirX, dirY, source})   // -> {killed, dealt}; armored frontal reduction; stagger on big hits; death → drops, xp, stats, events 'kill'
  alertGroup(z)          // every alive zombie with the same groupId within 320 px that is idle/wander → investigate toward z.lastSeen (alert 0.6)
  alive()                // array of alive zombies
  aliveCount()
  nearest(x, y, r)       // alive zombie within r | null
  inRadius(x, y, r)      // alive zombies
  boss                   // boss zombie | null
}
```

Zombie fields: `{ uid, type (def), id (type id), x, y, angle, radius, hp, hpMax, speed, damage, state,
target:{x,y}|null, lastSeen:{x,y,t}|null, alert (0..1), attackTimer, windupTimer, cooldown, path, pathIdx,
pathTimer, wanderTimer, groupId, stagger, dead, deathTimer, flash (hit flash timer), phase (boss),
abilityTimer, lurking (stalker), visibleAlpha, doorTimer, legPhase (animation), hitThisAttack,
senseTimer (perception stagger), attackAnim (0..1, see Attack), lastX, lastY, stuckTimer }`

States: `idle, wander, investigate, chase, attack, stunned, dead, lurk (stalker), ability (boss)`.

Rules:

- **Perception** runs every 0.15 s per zombie (`senseTimer`, initialised to `rng.float(0, 0.15)`
  so checks are staggered) and only within 1500 px of the player: sight if
  `dist ≤ sightRange × lightFactor × (player.crouching ? 0.65 : 1)` and `Physics.lineOfSight`.
  `lightFactor = 1 - 0.45 × raid.darknessAt(z.x, z.y)` (§18.1; ≈ 0.59 at full night indoors); if the
  player's flashlight is on, `lightFactor` ≥ 0.9. ZombieAI never keeps its own clock — it reads only
  `raid.darknessAt`. Hearing: `onNoise` with `dist ≤ radius × type.hearingMult` (plus the indoor
  factor above). Sight triggers chase (and `alertGroup(z)`); noise triggers investigate (or chase if
  `kind === 'scream'` or the zombie is already alert). Zombies lose track after 6 s without sight →
  investigate `lastSeen`, then wander.
- **Groups**: `groupId` comes from the spawn group (`spawnInitial`) or from one `spawnNearPlayer`
  call. A zombie entering `chase` by sight calls `alertGroup(z)`. Wandering zombies with `alert === 0`
  that have a group member within 200 px choose wander targets within 96 px of that member (groups
  stay together).
- **Movement**: chase uses `raid.nav.dirAt` (flow field) when `dist > 48` and the field covers the
  position, direct steering otherwise; investigate/wander use `nav.findPath` (re-plan every 2 s via
  `pathTimer`, subject to `pathBudget`). Path following: next waypoint reached at < 10 px.
  `wander`: every `wanderTimer` (rng 2–6 s) pick `nav.randomWalkable(rng, z.x, z.y, 6)` (40 % chance
  to stay idle instead); moves at 0.5 × speed. `investigate`: 0.8 × speed to `target`; arrived when
  dist < 24 px; looks around 3 s; gives up after 10 s total → `wander`.
  Separation: push apart overlapping zombies (`Physics.resolveCircles`) max 6 neighbours via
  `raid.hash.query(z.x, z.y, 40)`, only for zombies within 1500 px of the player. Movement via
  `Physics.moveCircle`. Stuck detection: moved < 4 px in 1.5 s (`lastX/lastY/stuckTimer`) while
  chasing → re-plan with A* (budgeted). Budget: `ZombieAI.update` ≤ 2.5 ms per step with 90 alive.
- **Doors**: a zombie whose next tile is `DOOR_CLOSED` bashes it: after `doorTimer` ≥ 1.2 s
  (brute 0.3 s) it becomes `DOOR_OPEN` (`raid.toggleDoor`, noise 200). `DOOR_LOCKED` is never opened.
- **Attack**: when `dist ≤ radius + player.radius + attackRange`: windup (`type.windup`), then if
  still within range × 1.3 → `player.takeDamage(damage, {source: type.name, from:{x:z.x, y:z.y}, bleedChance})`; cooldown.
  Attacks chain while in range: cooldown → windup → hit → cooldown (no return to `chase` in
  between). Visual contract: `z.attackAnim` rises linearly 0→1 during the windup, snaps to 1 at the
  hit frame and decays to 0 over the cooldown (the renderer telegraphs it, §23 item 3).
  Stagger: a single hit ≥ 25 % of `hpMax` sets `stagger = 0.35` s (no movement/attack, windup
  cancelled); brute and boss ignore stagger.
  Brute: knockback (push player 140 px over 0.2 s, camera shake) and bleedChance 0.5.
  Toxic: attack also spawns `raid.addHazard({kind:'toxic', x, y, r:toxicRadius, duration:toxicDuration})`; dying toxic bursts a cloud.
  Screamer: when alert and `screamCooldown` ready → audio `screamer`, `raid.emitNoise(x,y,screamRadius,'scream')`,
  `spawnNearPlayer('walker', 500, 900, rng.int(summon[0], summon[1]))`.
  Armored: `damage()` reduces by `armor` when `angleDiff(z.angle, hitDir reversed) < armorArc/2` unless `pen ≥ 3`; `pen === 2` halves the reduction.
  Stalker: starts in `lurk` (alpha 0.35, prefers indoor/dark tiles, does not move) until the player is within
  `ambushRange` or hits it → `chase` at full speed; `visibleAlpha` = 1 when inside the flashlight cone or within 90 px.
  Boss: phases by `hpPct`; `slam` (every 6 s: AoE 120 px, 45 dmg, shake), `charge` (every 9 s: dash 420 px/s toward player for 0.9 s, 50 dmg on contact),
  `summon` (every 15 s: `spawnNearPlayer('walker', 300, 500, 3)`); emits `raid.events.emit('boss', {hp, hpMax, phase, name})` every frame alive and `'bossDead'` on death; death sets `raid.flags.bossKilled = true`.
- **Activity radius**: full AI within 1500 px of the player; beyond → cheap update every 0.5 s
  (wander only, no perception except `onNoise`, no separation). Corpses stay 25 s (boss 60 s), then
  `update` splices them out of `zombies`; `boss` becomes `null` only when its corpse is removed. The
  renderer must not keep zombie references across frames.
- **Death**: `rollZombieDrop` → `raid.dropItem(inst, x, y)` (instances carry `raidFound`);
  `raid.player.stats.kills++`, `raid.player.stats.killsByType[id] = (… || 0) + 1`;
  `raid.addXp(type.xp)`; `raid.events.emit('kill', {zombie})`; blood fx; audio.
- **Spawn director** (in ZombieAI.update, only while `directorEnabled`): every 8 s, if alive
  zombies within 1200 px of the player < 4 and total alive < maxAlive →
  `spawnNearPlayer(weighted type, 700, 1100, rng.int(2,4))` (one fresh `groupId` per call).
  Extraction hazard `horde`: handled by ExtractionSystem calling `spawnNearPlayer`.

---

## 16. `15_missions.js` — MissionSystem

```js
class MissionSystem {
  constructor(game)
  // Base side (profile = game.profileMgr.profile)
  availableFor(profile)                      // MissionDef[] not completed (unless repeatable), prerequisites met, level met, map unlocked
  active(profile)                            // MissionDef[] from profile.missions.active ids
  maxActive(profile)                         // 1 + radio level
  accept(profile, missionId)                 // -> {ok, reason}
  abandon(profile, missionId)                // -> boolean (resets progress)
  canHandIn(profile, missionId, objId)       // collect objectives: stash has items
  handIn(profile, missionId, objId)          // removes items from stash, marks objective done; completes mission if all done → grantRewards
  completed(profile)                         // ids
  progressOf(profile, missionId)             // {objectives:[{def, progress, done}], done}
  grantRewards(profile, missionDef, withOptional)   // credits, xp (via profileMgr.addXp), items to stash (overflow → auto-sell), profile.stats.missionsCompleted++,
                                             // game.events.emit('missionComplete', {mission}) (base-side bus, works in base and at raid end); -> {credits, xp, items}
  static validate()                          // -> {ok, problems:[string]} for every MissionDef (DZ.validateMissions, QA case 11): mapId ∈ MAPS; unlockedBy ids exist;
                                             // objective target exists for its type (collect/retrieve/find_key → ITEMS; kill → ZOMBIE_TYPES or 'any'; kill_boss → map.boss;
                                             // search → building type or container type; investigate → poi type; generator → 'generator'; extract_at → map extraction id;
                                             // rescue_medical → 'medical'); count ≥ 1; reward item ids exist; objective ids unique within the mission
  // Raid side
  startRaid(raid, missionDefs)               // -> raid.missionStates = [{def, objectives:[{def, progress (starts at profile.missions.progress[m.id][o.id] || 0), done}], done, optionalDone}]
  onEvent(raid, name, data)
     // 'kill' {zombie} ; 'containerOpened' {container} ; 'itemPicked' {inst} (find_key completes on pickup of a raidFound key) ; 'poiReached' {poi} ;
     // 'generatorOn' ; 'bossDead' ; 'extracted' {extractionId, inventory, secure}
  finalizeOnExtract(raid, profile)           // see §16.1; -> {completed:[def], objectivesDone:n, rewards:{credits,xp,items}, failed:[]}
  finalizeOnDeath(raid, profile)             // see §16.1; -> {completed:[], objectivesDone:0, rewards:{credits:0,xp:0,items:[]}, failed:[def]}
  hudLines(raid)                             // [{text, done, optional}] for HUD
}
```

Objective completion fires `raid.events.emit('objectiveComplete', {mission, objective})` and
a toast + sound `objective`.

### 16.1 Progress persistence (the single rule for missions and profile)

- `finalizeOnExtract(raid, profile)`: for every active mission of this raid the objective progress
  reached in the raid for `kill`, `search`, `investigate`, `generator`, `find_key`, `kill_boss` is
  written to `profile.missions.progress[missionId][objId] = max(old, new)`.
  `retrieve`, `rescue_medical`, `extract_at` and `collect` are evaluated against the extracted
  `inventory` + `secure` (event `extracted`), counting only instances with `raidFound === true`;
  `retrieve`/`collect` items are consumed from them when the objective completes. Missions with all
  objectives done → `grantRewards` (credits/xp/items are applied **inside** `grantRewards`; nobody
  adds them again). Progress of a completed mission is deleted.
- `finalizeOnDeath(raid, profile)` (death, mia, abort): nothing from the raid is written; progress
  stored before the raid stays; the missions stay active (retry allowed). Returns the active
  missions of this map as `failed` and increments `profile.stats.missionsFailed` by their number;
  the death screen lists them under 'Fehlgeschlagen – Fortschritt dieses Einsatzes verloren'.
- Radio and missionSelect screens show `failText || MISSION_FAIL_TEXT` under each mission.

---

## 17. `16_extraction.js` — ExtractionSystem

```js
class ExtractionSystem {
  constructor(raid)
  points                 // raid.world.extractions, each augmented with: active, state ('idle'|'extracting'|'done'|'locked'), progress, hazardTimer, lockReason (German)
  update(dt)
     // active: 'always' → true; 'timed' → raid.time in [window[0], window[1]]; 'key'/'fuel' → player.inventory.has(requires) || player.secure.has(requires); 'power' → raid.flags.generatorOn
     // (a) player within radius of an active point: state 'extracting', progress += dt (audio extract_tick each second; on entry audio extract_start,
     //     event 'extractionStart' {point}, toast 'Extraktion läuft: <name>' kind 'info')
     // (b) while state === 'extracting': leaving the radius OR the point becoming inactive → state 'idle', event 'extractionCancel' {point, reason:'left'|'inactive'},
     //     toast 'Extraktion abgebrochen – Zone verlassen' / 'Extraktion abgebrochen – Fenster geschlossen' (kind 'warning'), audio 'ui_error';
     //     progress then decays at 2×dt. Zombie damage never cancels.
     // (c) hazard 'horde': every 3 s while extracting spawn 1–2 runners/walkers via zombies.spawnNearPlayer(…, 400, 700)
     // (d) progress ≥ duration → consume the required item: if (!player.inventory.removeById(point.requires, 1)) player.secure.removeById(point.requires, 1)
     //     (kind 'key'/'fuel' only; 'power', 'always', 'timed' consume nothing) → state 'done' → audio 'extract_done' →
     //     toast 'Extraktion erfolgreich: <name>' (kind 'success') → event 'extractionDone' {point} → raid.onExtracted(point)
     // (e) a 'timed' point whose window has ended: state 'locked', lockReason 'Hubschrauber abgeflogen'; a timed point before its window shows
     //     'öffnet in mm:ss' (hudText); 'key'/'fuel' without the item: lockReason 'Benötigt: <item name>'; 'power' without generator: 'Strom nötig (Generator)'
  current()              // {point, progress, duration} | null
  nearestInfo(x, y)      // {point, dist} for HUD
  hudText()              // e.g. 'Extraktion: Versorgungstunnel 6 s' / 'Hubschrauber öffnet in 04:10' / 'Lastwagen: Treibstoff nötig'
  promptFor(point)       // interact prompt when standing in an inactive point ('Benötigt: Schlüssel Versorgungstunnel')
}
```

---

## 18. `17_raid.js` — RaidManager

```js
class RaidManager {
  constructor(game)
  start({ mapId, missionIds = [], seed, loadout })
     // seed is already normalised to a number by Game.startRaid (§0.3); loadout comes from ProfileManager.buildLoadout() (called by Game, §25);
     // creates world via WorldGenerator.generate(mapId, seed, missionDefs), nav, hash, loot, player (at world.playerSpawn), zombies.spawnInitial,
     // weapons, extraction, fx, events, missions.startRaid, time = 0, hour = map.startHour, darkness = darknessForHour(hour),
     // flags {generatorOn:false, bossKilled:false}, navTimer = 0, camera.snap, camera.setBounds, audio.startAmbient
  map, world, nav, hash, player, zombies, weapons, loot, extraction, fx, events, rng, seed, mapId, missionStates, xp (raid xp accumulated by addXp)
  time, timeLimit, hour, darkness (outdoor value, §18.1)
  flags, hazards: [{kind:'toxic'|'fire', x, y, r, duration, timer}], grenades: [], noiseMarkers: [] (for minimap/debug, ttl)
  ended (bool), result (null | RaidResult)
  update(dt)   // fixed order:
     // 1. time += dt; hour = (map.startHour + time * 10 / timeLimit) % 24; darkness = darknessForHour(hour)
     // 2. hash.clear(); insert exactly zombies.alive() (nothing else is ever inserted; SpatialHash.update/remove exist but are unused in v1)
     // 3. player.update(dt, input)  4. weapons.update(dt)  5. zombies.update(dt)  6. extraction.update(dt)
     // 7. hazards (damage player: toxic 3 hp/s + player.toxic = max(player.toxic, 3); fire 8 hp/s; source 'Vergiftung' / 'Feuer')
     // 8. POI proximity (§18.2) and generator hold (§18.2)
     // 9. if ((navTimer += dt) >= 0.4) { navTimer = 0; nav.rebuild(player.x, player.y, 60); }
     // 10. fx.update, camera.follow(player + lookahead toward aim 60 px), audio.setListener, noiseMarkers ttl
     // 11. timer warnings at 300 s and 60 s left (toast 'Noch 5 Minuten' / 'Noch 60 Sekunden', kind 'warning', audio 'warning'); time ≥ timeLimit → onTimeout()
  darknessAt(x, y)                         // clamp(darkness + (world.isIndoor(x, y) ? 0.35 : 0), 0, 0.92) — used by ZombieAI
  emitNoise(x, y, radius, kind = 'shot')   // zombies.onNoise + noiseMarkers + events 'noise'
  addHazard(h)
  findInteractable(x, y, maxDist = 56)     // candidates: containers (closed or open; the player must have Physics.lineOfSight to it), doors (DOOR_CLOSED/OPEN/LOCKED tiles adjacent),
                                           // floorLoot, pois (generator), extraction points (inactive ones: hint). Picks the smallest dist; ties within 8 px resolve by
                                           // priority container > loot > body > door > poi > extraction
  interact(it)                             // press action: container/body → openContainer; door → toggleDoor (DOOR_LOCKED: requires key_lab_card in inventory or secure, consumes nothing → DOOR_OPEN;
                                           // without key: toast 'Verschlossen – Laborkarte nötig'); loot → pickFloorLoot; extraction (inactive) → toast promptFor(point);
                                           // poi (generator) → nothing on press (hold handled in update, §18.2)
  openContainer(c)                         // if (c.items === null) loot.rollContainer(c, world); if (!c.opened) { c.opened = true; player.stats.containersOpened++; events 'containerOpened' {container}; }
                                           // audio loot_open; game.ui.openLoot(c)  (re-opening never counts twice)
  takeFromContainer(c, idx, count = Infinity)   // -> {ok, remaining}: moves c.items[idx] (or `count` of it) into player.inventory.add (partial allowed); on any amount taken:
                                           // inst.raidFound = true, player.stats.lootValue += Items.value(takenPart), events 'itemPicked' {inst: takenPart, source:'container'}, audio pickup;
                                           // the slot becomes null when fully taken. The loot screen must use this (never inventory.add directly)
  takeAll(c)                               // -> number of items taken (loops takeFromContainer over all slots; toast 'Inventar voll' + audio ui_error when something stays)
  putIntoContainer(c, inst)                // -> boolean; reverse direction (no event, no stats); inst must already be removed from the inventory by the caller
  toggleDoor(tx, ty, byZombie = false)     // world.setTile; audio; noise 200 (zombie bash 350); events 'doorToggled' {tx, ty, open}
  dropItem(inst, x, y)                     // -> floorLoot entry {uid, inst, x, y} (scatter 0–20 px); world.floorLoot; no sound here (UIManager.dropSelected plays 'drop')
  pickFloorLoot(fl)                        // -> {picked:number, remaining:number}: inventory.add; the floor entry is removed only when remaining === 0, otherwise fl.inst.count = remaining
                                           // and toast 'Inventar voll' (audio ui_error); on any amount: inst.raidFound = true, stats.lootValue, events 'itemPicked' {inst, source:'floor'}, audio pickup, toast '+3 Verband'
  addXp(n)                                 // raid xp accumulates in this.xp (applied to the profile in end())
  onPlayerDeath()                          // -> end('death')
  onTimeout()                              // toast 'Zeit abgelaufen – Als vermisst gemeldet'; player.causeOfDeath = 'Zeit abgelaufen'; end('mia')
  onExtracted(point)                       // events.emit('extracted', {extractionId: point.id, inventory: player.inventory, secure: player.secure}) then end('extracted', point)
  abort()                                  // from pause menu: end('abort') (same loss as death)
  end(outcome, point = null)               // synchronous and idempotent — exact sequence in §18.3
  pause()/resume()
  debugState()
}
```

### 18.1 Day/night (`17_raid.js`, top-level functions)

```js
function darknessForHour(h)   // h in [0,24): [8,17) → 0.08; [17,20) → lerp(0.08, 0.85, (h-17)/3); [20,24) ∪ [0,5) → 0.85; [5,8) → lerp(0.85, 0.08, (h-5)/3)
function formatHour(h)        // 'HH:MM' (24 h) for the HUD clock
```

`raid.darkness = darknessForHour(raid.hour)` is the **outdoor** value. Indoors is handled per
position: `raid.darknessAt(x, y)` for the AI, and the renderer adds 0.35 to building footprints
(§23 item 5). Ten game hours pass per raid (`hour = (startHour + time·10/timeLimit) % 24`), so a
raid that starts at 17:00 (city) crosses dusk into night; research (22:00) is night throughout.

### 18.2 POI timers and generator hold (owned by `RaidManager.update`)

- For each `world.pois` entry with `used === false` and `type !== 'generator'`: if
  `dist(player, poi) ≤ poi.radius` then `poi.timer += dt`, else `poi.timer = max(0, poi.timer - dt)`.
  At `timer ≥ 5`: `poi.used = true`, `events.emit('poiReached', {poi})`. While inside,
  `player.holdProgress = timer / 5` (HUD shows 'Gebiet untersuchen …').
- Generator: while `player.interactTarget?.kind === 'poi'` with `ref.type === 'generator'`,
  `!flags.generatorOn` and `input.isDown('interact')`: `player.holdProgress += dt / 4`; at ≥ 1 →
  `flags.generatorOn = true`, `poi.used = true`, `events.emit('generatorOn')`, toast
  'Generator läuft' (kind 'success'), audio 'alarm' at the generator (noise 500). Releasing the
  key resets `holdProgress` to 0. The `power` extraction becomes active through `flags.generatorOn`.

### 18.3 `end(outcome, point)` — exact sequence (synchronous, no animation delay)

1. `if (this.ended) return; this.ended = true;`
2. Build `result` from `player.stats` (`kills`, `killsByType`, `shotsFired`, `shotsHit`, …),
   `time`, `map`, `point`, `player.causeOfDeath`; `result.levelBefore = profileMgr.level()`;
   `result.xpBefore = profileMgr.xp()`.
3. `profileMgr.applyRaidResult(result, player)` — loss rules (§19): moves items, sets
   `itemsKept/itemsLost/itemsSold/insuranceReturned`, `lootValue`, `creditsGained` (sold overflow),
   adds `xpGained = raid.xp + XP_REWARDS.extraction (extracted only) + lootValue × perLootValue`
   via `addXp`, writes hp/hunger/thirst, stats, `raidInProgress = null`, `restockTrader()`.
4. `const m = outcome === 'extracted' ? game.missions.finalizeOnExtract(this, profile) : game.missions.finalizeOnDeath(this, profile)`;
   `result.missionsCompleted = m.completed; result.missionsFailed = m.failed; result.objectivesDone = m.objectivesDone; result.rewards = m.rewards;`
   (`grantRewards` inside already applied credits/xp/items — `applyRaidResult` must **not** add them.)
5. `result.xpGained += m.rewards.xp; result.creditsGained += m.rewards.credits; result.levelAfter = profileMgr.level(); result.leveledUp = result.levelAfter > result.levelBefore;`
   `result.xpAfter = profileMgr.xp(); result.xpToNext = profileMgr.xpProgress().next;` `this.result = result`.
6. `events.emit('raidEnd', {result}); events.clear(); game.save.save(profileMgr.serialize()); game.audio.stopAmbient(); game.onRaidEnded(result);`

`RaidResult` (JSON-safe except the `inst` references, which are plain ItemInstances):

```
{ outcome:'extracted'|'death'|'mia'|'abort', mapId, mapName, seed, extractionName|null, causeOfDeath: string|null,
  durationSec, kills, killsByType, shotsFired, shotsHit, accuracy (0..1), damageTaken, containersOpened, distance,
  xpGained, creditsGained, levelBefore, levelAfter, leveledUp, xpBefore, xpAfter, xpToNext,
  itemsKept:[{inst}], itemsLost:[{inst}], itemsSold:[{inst, credits}] (stash overflow), lootValue,
  missionsCompleted:[MissionDef], missionsFailed:[MissionDef], objectivesDone:n, rewards:{credits, xp, items},
  insuranceReturned:[inst] }
```

---

## 19. `18_profile.js` — ProfileManager (base, economy, loss rules)

```js
const DEFAULT_SETTINGS = { master:0.8, sfx:1.0, music:0.6, screenShake:true, showFps:false, touchControls:'auto' ('auto'|'on'|'off'),
                           quality:'high' ('low'|'medium'|'high'), aimAssist:true (touch only; label 'Automatisch feuern': the aim stick fires at deflection > 0.75),
                           minimap:true, damageNumbers:true };
// Touch devices (touchMode at first start) default to quality:'medium'.

class ProfileManager {
  constructor(game)
  profile                                   // null | Profile (see shape below; live instances at runtime, see "Runtime vs. saved form")
  newProfile()                              // exact start profile: credits START_CREDITS, xp 0, level 1, hp 100, hunger 100, thirst 100;
                                            // equipment.secondary = pistol_m9 (mag full, ammoId 'ammo_9mm'), equipment.melee = melee_knife, equipment.backpack = pack_small;
                                            // profile.loadout = Inventory(12) with ammo_9mm ×30, med_bandage ×2; profile.stash = Inventory(STASH_SLOTS_BASE) with
                                            // ammo_9mm ×30, med_bandage ×2, food_beans ×2, water_bottle ×2; profile.secure = Inventory(SECURE_SLOTS_BASE); unlockedMaps ['city']; restockTrader()
  setProfile(plain)                         // hydrates plain → live (Inventory.deserialize / Equipment.deserialize), recomputes unlockedMaps, game.events.emit('profileChanged')
  // progression
  addXp(n)                                  // -> {leveledUp, newLevel, unlockedMaps:[ids]}; on level-up game.events.emit('levelUp', {level}), audio level_up
  level(), xp(), xpProgress()               // {cur, next, pct}
  unlockedMaps()                            // = Progression.unlockedMapsFor(level(), profile.upgrades.radio) (§20); result cached in profile.unlockedMaps
  isMapUnlocked(mapId)
  // loadout
  buildLoadout()                            // -> { equipment: Equipment (deep clone: Equipment.deserialize(profile.equipment.serialize())),
                                            //      inventory: Inventory (clone of profile.loadout resized to equipment.backpackSlots(); overflow → stash),
                                            //      secure: Inventory (clone of profile.secure resized to secureSlots()),
                                            //      hp: profile.hp, hpMax: hpMax(), hunger: profile.hunger, thirst: profile.thirst }
  loadoutInventory                          // Inventory sized by equipment.backpackSlots(); items the player takes along (=== profile.loadout)
  stash                                     // Inventory (=== profile.stash)
  equipment                                 // Equipment (=== profile.equipment)
  secureInv                                 // Inventory (=== profile.secure)
  secureSlots()                             // SECURE_SLOTS_BASE + defense level
  carryLimit()                              // CARRY_BASE + equipment.carryBonus() + 5*defense level
  hpMax()                                   // 100 + 10*medbay level
  loadoutWarnings()                         // German strings: no weapon, no ammo for weapon, no medical, overweight,
                                            // 'Verletzt (<hp>/<hpMax>) – Krankenstation aufsuchen' when hp < 60 % of hpMax,
                                            // 'Hunger/Durst niedrig – Nahrung/Wasser einpacken' when hunger < 40 or thirst < 40
  moveStashToLoadout(uid, count), moveLoadoutToStash(uid, count), equipFromStash(uid) / equipFromLoadout(uid), unequipToStash(slot)
  // economy
  sellPrice(inst, count = inst.count)       // Math.max(1, Math.round(Items.value × ECONOMY.sellMul × (1 + traderLevel×traderSellBonus)))
  buyPrice(def)                             // def.value × buyMul × (1 - traderLevel×traderBuyDiscount)
  sell(uid, count)                          // from stash → credits; -> {ok, credits}
  buy(stockIndex, count = 1)                // -> {ok, reason}; stock decrements; item to stash
  restockTrader()                           // builds profile.trader.stock from TRADER_STOCK by trader level; called on return to base
  repairCost(inst)                          // (durabilityMax - durability)/durabilityMax × value × repairCostMul × (1 - 0.15×workshopLevel)
  repair(uid)                               // stash or equipped item → full durability
  canCraft(recipeId) / craft(recipeId)      // -> {ok, reason}; inputs from stash; output to stash
  recipesFor(station)                       // visible recipes with unlocked flag
  healCost() / heal()                       // medbay: credits per missing hp (free at medbay level 3); hp → hpMax; also hunger = thirst = 100 (Verpflegung)
  useMedicalFromStash(uid)                  // heals in base
  canUpgrade(area) / upgrade(area)          // -> {ok, reason}; applies effects (stash.setSlots, etc.)
  // loss rules
  applyRaidResult(result, player)           // mutates profile + result (itemsKept/itemsLost/itemsSold/credits/xp/stats); see rules below; missions are NOT touched here (§18.3 step 4)
  applyMiaOnReload()                        // -> {lost: ItemInstance[], insured: ItemInstance[]}: the death/mia rules applied without a Player, using profile.loadout (cleared, lost)
                                            // and profile.equipment (weapons/armor/backpack lost, defense-3 insurance roll); profile.secure → stash (empty on reload: nothing kept);
                                            // profile.hp = 35, hunger = thirst = 60, stats.mia++, stats.raids++, raidInProgress = null, restockTrader()
  stats                                     // profile.stats
  recordStat(key, n = 1)
  serialize()                               // -> plain Profile shape (calls .serialize() on stash/loadout/secure/equipment)
  static validate(obj)                      // -> {ok, profile (PLAIN, JSON-safe), repaired:[German msgs]}; accepts a plain or a live profile; see rule below
  static migrate(obj)                       // -> obj; switch (obj.version) with fall-through, each case upgrades to the next version; currently only sets version = SAVE_VERSION
}
```

**Runtime vs. saved form.** At runtime `profile.stash`, `profile.loadout`, `profile.secure` are
live `Inventory` instances and `profile.equipment` is a live `Equipment` instance
(`profileMgr.stash === profile.stash`, `profileMgr.loadoutInventory === profile.loadout`,
`profileMgr.secureInv === profile.secure`, `profileMgr.equipment === profile.equipment`).
`serialize()` produces the plain shape below; `setProfile(plain)` hydrates it. The profile graph
is acyclic, never references `game`/`profileMgr` and has no function-valued own properties, so
`JSON.stringify(profile)` always works (tests do this).

**`validate(obj)` rule.** `ok === false` only when `obj` is not a plain object, or
`typeof obj.version !== 'number'`, or `obj.version > SAVE_VERSION` (error
'Spielstand stammt aus einer neueren Version'). Otherwise `version < SAVE_VERSION` first runs
`migrate(obj)`, then every field is coerced: numbers via `Number.isFinite(v) ? v : default`,
inventories via `Inventory.deserialize(v, defaultSlots)` (non-object → empty), equipment via
`Equipment.deserialize`, unknown item ids dropped, `upgrades` clamped 0..3, `unlockedMaps` filtered
against `MAPS`, mission ids filtered against `MISSION_BY_ID`, `hunger`/`thirst` default 100; each
coercion pushes a German message to `repaired`. Never throws, never logs above `warn`.

`Profile` shape (saved form):

```
{ version: SAVE_VERSION, createdAt, name:'Überlebender', credits, xp, level, hp, hunger (0..100), thirst (0..100),
  stash: Inventory.serialize(), loadout: Inventory.serialize(), equipment: Equipment.serialize(), secure: Inventory.serialize(),
  upgrades: {stash:0, workshop:0, medbay:0, radio:0, defense:0, trader:0},
  unlockedMaps:['city'],
  missions: { active:[ids], completed:[ids], progress:{ [missionId]: { [objId]: n } } },
  trader: { stock:[{id, price, count}], restocks:0 },
  stats: { raids:0, extractions:0, deaths:0, mia:0, kills:0, killsByType:{}, shotsFired:0, shotsHit:0, lootValue:0,
           creditsEarned:0, creditsSpent:0, missionsCompleted:0, missionsFailed:0, playTime:0, bestRaidValue:0, containersOpened:0, distance:0,
           itemsCrafted:0, upgradesBought:0, achievements:[] },
  raidInProgress: null | { mapId, missionIds, seed, startedAt },
  lastSaved }
```

**Loss rules** (`applyRaidResult(result, player)`; `player.stats` is merged into `profile.stats`):

- `extracted`: `profile.equipment = player.equipment` (the raid instance replaces the profile's,
  so picked-up weapons and durability loss persist); `player.inventory` items → stash
  (`stash.add`); items that do not fit → sold at `overflowSellMul` (listed in `itemsSold`); secure
  items → stash likewise; `profile.loadout` and `profile.secure` end up empty.
  `profile.hp = clamp(Math.round(player.hp), 1, hpMax())`; `profile.hunger = player.hunger`,
  `profile.thirst = player.thirst`; bleeding/toxic are not persisted. `lootValue` = value of all
  extracted `raidFound` items. `xpGained = raid.xp + XP_REWARDS.extraction + lootValue × perLootValue`
  (mission xp is added later by `end()`, §18.3). `creditsGained` = sold overflow. Stats
  (`extractions++`, `bestRaidValue`).
- `death` / `mia` / `abort`: equipment weapons/armor/backpack **lost**, backpack inventory **lost**,
  `secure` items **kept** (→ stash). Defense level 3: each lost equipped item has 50 % chance to be
  returned (`insuranceReturned`, back into equipment). `profile.hp = 35` (injured; needs medbay),
  `profile.hunger = profile.thirst = 60`. `profile.loadout` and `profile.secure` become empty;
  `profile.equipment` keeps only insured items. `xpGained = raid.xp` (no extraction bonus, no loot
  xp). Stats (`deaths++` or `mia++`).
- Always: `stats.raids++`, `raidInProgress = null`, `restockTrader()`. Missions and saving are
  done by `RaidManager.end` (§18.3), not here.

---

## 20. `19_progression.js` — Progression helpers and achievements (small)

```js
const MAP_UNLOCKS = { city:1, industrial:3, military:5, research:8 };   // mirrors MAPS.unlockLevel
class Progression {
  static levelFromXp(xp), static xpForLevel(l), static progress(xp) -> {level, cur, next, pct}
  static unlockedMapsFor(level, radioLevel) -> ids
    // = MAP_ORDER.filter(id => level >= MAPS[id].unlockLevel || (MAPS[id].radioUnlock > 0 && radioLevel >= MAPS[id].radioUnlock))
    // The ONLY place where the unlock rule lives; ProfileManager.unlockedMaps() delegates to it.
  static rankTitle(level) -> German title ('Rekrut','Plünderer','Veteran','Kommandant',...)
}
const ACHIEVEMENTS = [ {id, name, desc, check(profile) -> boolean} ... ];   // ≥ 12, shown in stats screen
function evaluateAchievements(profile) -> newly unlocked ids (stored in profile.stats.achievements)
```

---

## 21. `20_save.js` — SaveSystem

```js
class SaveSystem {
  constructor(game)
  static KEY = 'deadzone_save_v1'; static SETTINGS_KEY = 'deadzone_settings_v1'; static BACKUP_KEY = 'deadzone_save_backup'
  available()                     // localStorage usable
  hasSave()                       // KEY exists and parses as a JSON object (no validation)
  save(profile)                   // -> boolean; accepts the live or the plain form (calls profile.stash.serialize() etc. when typeof … === 'function');
                                  // writes {version: SAVE_VERSION, savedAt, profile: JSON.parse(JSON.stringify(plain))}; the previous KEY value is copied to
                                  // BACKUP_KEY only if it still validates
  load()                          // -> {ok, profile (plain), repaired:[], error}; order: parse KEY → ProfileManager.validate; if the parse throws or !ok →
                                  // parse BACKUP_KEY → validate; both fail → {ok:false, profile:null, error}. Corruption is logged with Log.warn, never Log.error. Never throws.
  reset()                         // removes KEY and BACKUP_KEY
  saveSettings(settings) / loadSettings() -> settings merged with DEFAULT_SETTINGS
  exportString() -> base64 JSON | null ; importString(str) -> {ok, error}   // import validates like load() before replacing KEY
  markRaidStart(profile, info)    // info {mapId, missionIds, seed, startedAt}; sets profile.raidInProgress = info and saves the profile AS IT IS at raid start
                                  // (loadout, equipment and stash unchanged — that is what gets lost on reload)
  clearRaid(profile)              // profile.raidInProgress = null (no save by itself)
}
```

Raid-in-progress rule (the only save-time rule for raids): no profile save is written during a
raid (`Game.saveNow()` in state `raid` → toast 'Im Einsatz nicht möglich', returns `false`;
`beforeunload` writes nothing; `visibilitychange` → hidden during a raid calls `game.pauseRaid()`).
When `continueGame()` finds `profile.raidInProgress`, the raid counts as **MIA**:
`profileMgr.applyMiaOnReload()` (§19), then save, then toast
`'Dein letzter Einsatz wurde abgebrochen – Ausrüstung verloren.'` (kind 'danger', 6000 ms) — never
a blocking modal. Settings autosave on change. Profile autosaves: after new game, raid start
(`markRaidStart`), raid end (§18.3), every trade/craft/upgrade/hand-in/heal/repair, and the manual
save button in the base.

---

## 22. `21_fx.js` — FX (particles, decals, screen effects)

```js
class FX {
  constructor(raid)
  particles: [], decals: [], texts: []            // caps: particles 700 (quality low 250), decals 250, texts 40
  update(dt)
  muzzleFlash(x, y, angle, scale = 1)
  impact(x, y, angle, tile)                       // sparks/dust by material
  blood(x, y, angle, amount = 1)                  // particles + decal
  explosion(x, y, radius)
  smoke(x, y), fire(x, y, r), toxicCloud(x, y, r)
  casing(x, y, angle)
  footDust(x, y)
  floatingText(x, y, text, color)                 // damage numbers (if settings.damageNumbers), '+XP', item names
  hitMarker()                                     // hitMarkerTimer = 0.12
  damageFlash(strength)                           // vignette intensity 0..1 decays
  hitDirection(angle)                             // pushes {angle, ttl:0.8} into screenEffects.hitDirs (max 6, oldest dropped); called by Player.takeDamage
  lightFlashes: []                                // {x,y,r,ttl} for lighting layer (muzzle, explosion)
  screenEffects: { hitMarker, damage, flash (grenade_flash), hitDirs:[{angle, ttl}] }
}
```

---

## 23. `22_renderer.js`, `22_renderer_entities.js` — Renderer

### 23.1 File split and chunk cache

- `22_renderer.js`: frame pipeline, chunk cache, roofs, lighting overlay, fog, screen effects,
  arrows, minimap, full map, debug overlay.
- `22_renderer_entities.js`: hoisted draw functions the renderer calls with a `ctx` already
  transformed to world space (camera applied by the renderer); each may `save/restore` at most
  once per entity: `rdDrawZombie(ctx, z, raid, t)`, `rdDrawPlayer(ctx, p, raid, t)`,
  `rdDrawProp(ctx, prop, palette)`, `rdDrawContainer(ctx, c, t)`, `rdDrawFloorLoot(ctx, fl, t)`,
  `rdDrawProjectile(ctx, pr)`, `rdDrawGrenade(ctx, g)`, `rdDrawHazard(ctx, h, t)`,
  `rdDrawParticle(ctx, p)`.
- Chunk cache: 16×16 tiles per chunk canvas (`document.createElement('canvas')`), rendered at
  `TILE × 16 × chunkScale` px with `chunkScale = min(devicePixelRatio, quality === 'high' ? 2 : 1)`;
  only chunks intersecting `camera.viewBounds()` expanded by one chunk are built; LRU cache capped
  at 40 chunks (evict least recently drawn); at most 2 chunks are (re)built per frame, unbuilt
  chunks are drawn as a flat `palette.ground` fill. After rebuilding chunk `cx,cy` the renderer
  deletes that key from `world.dirtyChunks` (the renderer owns clearing the Set).
  `invalidateChunks()` frees all; `render()` calls it when `raid.world !== this.cachedWorld`.

```js
class Renderer {
  constructor(game, canvas)
  resize()                        // DPR aware; sets canvas size; informs camera
  render(raid, dt)                // full frame while in raid (also when paused)
  renderMenuBackground(t)         // animated subtle background for menus (optional, cheap)
  renderMinimap(raid, canvasEl, size)      // HUD minimap: tiles downscaled (cached per world.version), player arrow, extraction points (green active / grey), mission POIs (yellow), zombies within 320 px (red), noise markers
  renderFullMap(raid, canvasEl)            // M screen: whole map with legend, buildings, extraction names, POIs, player
  invalidateChunks()
}
```

Rendering order and rules:

1. Ground/floor tiles from the **chunk cache** (§23.1, keyed by `cx,cy`, rebuilt when
   `world.dirtyChunks` has the key). Tile colors from `map.palette`, with
   `tileVariant`-based procedural noise (small rects / dots) for texture. Walls drawn with a top
   face highlight and a 4 px darker bottom edge for a 2.5D feel; windows lighter blue line; doors
   brown (open doors drawn as a thin bar). Toxic tiles pulse greenish (drawn dynamically, not cached).
2. Decals, floor loot (small rarity-colored diamond + glow), containers (box by type; opened = darker,
   lid open), props (car: rounded rect body with windows; tree: canopy circle; barrel: circle; etc.).
3. Hazards (toxic puddles, fire), grenades, zombies (distinct silhouettes: walker olive, runner thin
   and leaning, brute wide with shoulders, screamer with open mouth, toxic green glow, armored grey
   plates, stalker translucent, boss huge with phase color; health bar above damaged zombies; hit flash
   white). Attack telegraph (from `z.attackAnim`, §15): zombies in `attack` draw two short arm
   lines extended toward the player by `lerp(6, 18, attackAnim)` px, the body offset toward the
   player by `sin(attackAnim·π)·6` px, and a red outline during the last 40 % of the windup; the
   brute adds a 1.2× scale pulse on the hit frame. Player (body circle, head, shoulder pads, weapon
   line, crouch smaller, legs anim), projectiles (tracer lines with alpha), particles.
4. **Roofs**: for each building the player is not inside (`world.buildingAt(player)`): fill footprint
   with `roofColor`, ridge line, darker edge, name label when zoom ≥ 0.9 and building ≥ 8 tiles wide
   (small, semi-transparent). Buildings the player is inside: no roof (interior visible).
5. **Lighting overlay** (offscreen canvas at viewport × 0.5 for quality `high`, × 0.33 for
   `medium`/`low`, drawn upscaled with `imageSmoothingEnabled = true`): fill with
   `rgba(5,8,14, d)` at night, `rgba(40,22,10, d)` during dusk/dawn (`17 ≤ hour < 20` or
   `5 ≤ hour < 8`), where `d = clamp(raid.darkness, 0, 0.92)`; then `destination-out` lights:
   player ambient 90 px (weak), flashlight = one cached 380 px / 60° cone sprite rotated via
   `ctx.rotate` (when `player.flashlightOn`), `world.lights` in view (max 24 nearest to the camera;
   `world.lights` are bucketed by chunk key at generation; flicker modulates `globalAlpha` only),
   `fx.lightFlashes`, fire hazards. Radial lights are blitted from gradient sprites cached per
   `(radius bucket of 32 px, color)` in a `Map` (max 32 sprites) — never `createRadialGradient`
   per frame. Active extraction points get a green glow drawn *under* the overlay. Skip the overlay
   when `d < 0.05`. Indoor darkness: building footprints add 0.35 (drawn with additional alpha onto
   the overlay before cutting lights; matches `raid.darknessAt`). Budget: ≤ 2 ms per frame at
   1280×720.
6. Fog: when `map.palette.fog` and `settings.quality !== 'low'`: 2–3 slowly drifting large
   semi-transparent noise blobs (pre-rendered canvas) at low alpha.
7. Screen effects: damage vignette (red radial, `fx.screenEffects.damage`), hit direction
   indicators (for each `screenEffects.hitDirs` entry a red arc at the screen edge toward the
   attacker: radius `min(w,h)·0.42`, 50° wide, alpha `ttl/0.8`), hit marker (4 small
   lines at screen center), flashbang white, low-hp pulse, interaction highlight ring around
   `player.interactTarget`, extraction zone circle (dashed, green when active, grey otherwise, with
   progress arc while extracting), POI markers, off-screen mission/extraction direction arrows at
   the viewport edge (yellow mission, green extraction).
8. Debug overlay when `game.settings.showFps`: FPS, entity counts, draw calls estimate.

---

## 24. `23_ui*.js` — UIManager (DOM) and `src/style.css`

The template provides root elements: `<canvas id="game">`, `<div id="hud">`, `<div id="ui">`,
`<div id="mobile">`, `<div id="toasts">`, `<div id="modal">`, `<div id="errbar">`. UIManager builds
all content with DOM APIs / `innerHTML` templates (escape user-influenced strings — there are none
except the player name).

### 24.1 File split and screen registration

- `23_ui.js` — `class UIManager` core only: init, showScreen/closeScreen, toast/confirm/alert/
  promptNumber, updateHud, mobile controls, refresh, `this.screens` table, `bindRaid/unbindRaid`.
  `init()` fills
  `this.screens = { main: uiScreenMain, base: uiScreenBase, stash: uiScreenStash, armory: uiScreenArmory, medbay: uiScreenMedbay, workshop: uiScreenWorkshop, radio: uiScreenRadio, defense: uiScreenDefense, trader: uiScreenTrader, missionSelect: uiScreenMissionSelect, inventory: uiScreenInventory, loot: uiScreenLoot, map: uiScreenMap, pause: uiScreenPause, settings: uiScreenSettings, result: uiScreenResult, death: uiScreenDeath, stats: uiScreenStats, credits: uiScreenCredits }`.
  Each screen is a hoisted function `function uiScreen<Name>(ui, root, data) -> { refresh(), destroy() }`
  (`root` = the `<section data-screen="<name>">` element UIManager creates inside `#ui`).
- `23_ui_grid.js` — `function uiBuildGrid(ui, inventory, opts)` (the `buildGrid` contract below),
  `function uiEquipmentPanel(ui, equipment, opts)`, `function uiTooltip(ui, inst, anchorEl)`,
  `function uiContextMenu(ui, items:[{label, action, disabled, reason}], x, y)`, drag & drop.
- `23_ui_base.js` — screens main, base, stash, armory, medbay, workshop, radio, defense, trader,
  missionSelect, stats, credits, settings.
- `23_ui_raid.js` — screens inventory, loot, map, pause, result, death.
- `style.css` is written by the `23_ui.js` developer; all four files use only the class
  vocabulary of §24.2.

### 24.2 CSS class vocabulary (`style.css`)

`.screen, .panel, .panel-title, .row, .col, .btn, .btn-primary, .btn-danger, .btn:disabled, .grid,
.slot, .slot.sel, .slot.drag-over, .slot .count, .slot .dur, .rarity-common … .rarity-legendary
(border/text color), .bar, .bar-fill, .bar-hp, .bar-stam, .muted, .warn, .danger, .tabs, .tab,
.tab.active, .list, .list-item, .tooltip, .ctxmenu, .toast, .toast-success|-warning|-danger,
.modal, .hud-*, .mobile-stick, .mobile-btn, .mobile-btn.active, .active`.
Design tokens and fonts: see "Design" below.

```js
class UIManager {
  constructor(game)
  init()                                 // builds static HUD/mobile controls, settings widgets; subscribes to game.events (missionComplete, levelUp → toasts)
  screens                                // registration table (§24.1)
  showScreen(name, data = {})            // hides others; names below; sets game.input.setEnabled(name === null); applies setTouchVisible; see §24.4 for returnTo
  closeScreen()                          // §24.4
  currentScreen                          // string | null
  selected                               // null | {inv: Inventory, idx} — the currently selected slot in inventory/loot/stash grids
  toast(text, kind = 'info' | 'success' | 'warning' | 'danger', ms = 2600)
  confirm(text, {ok = 'Ja', cancel = 'Abbrechen', danger = false})   // -> Promise<boolean> (also keyboard: Enter/Escape)
  alert(text, title)                                                // -> Promise<void>
  promptNumber(text, {min = 1, max, value = Math.floor(max / 2)})    // -> Promise<number|null>; modal with range slider + numeric input, Enter/Escape; used by 'Teilen'
  updateHud(raid, dt)                    // §24.3 budget rules; no-op when raid === null (Game.frame calls it in every state)
  bindRaid(raid)                         // subscribes to raid.events for HUD STATE only: boss/bossDead (boss bar), objectiveComplete (objectives list rebuild),
                                         // extractionStart/Cancel/Done (extraction line), toast (→ this.toast). Texts are toasted by the emitting module (§16–§18) — never twice
  unbindRaid()                           // removes those subscriptions, hides #hud and #mobile, clears selected
  openLoot(container)                    // raid: shows container panel next to inventory (screen 'loot'); uses raid.takeFromContainer / takeAll / putIntoContainer only
  openInventory()                        // raid: screen 'inventory' (Tab)
  openMap()                              // raid: screen 'map' (M) — uses renderer.renderFullMap once on open and on world.version change
  dropSelected()                         // raid only, while screen 'inventory'/'loot' and selected !== null: equipped item → equipment.unequip(slot) first;
                                         // inst = inv.remove(uid); raid.dropItem(inst, player.x + cos(angle)·24, player.y + sin(angle)·24); refresh().
                                         // Bound to data-action="drop" and to the X key (Game.handleGlobalKeys, §25.1). In the base the context entry
                                         // 'Ablegen' is replaced by 'Vernichten' → ui.confirm('<name> unwiderruflich vernichten?', {danger:true}) → inv.remove(uid)
  refresh()                              // re-render the current screen from state (after any model change)
  setTouchVisible(bool)                  // toggles the `hidden` attribute on #mobile only (no display:none on the element itself)
  onResize()
  // Inventory widgets (shared by stash, loadout, raid inventory, loot, trader), implemented in 23_ui_grid.js:
  buildGrid(inventory, opts)             // {id, title, onSelect, onMove(fromInv, fromIdx, toInv, toIdx), onContext, readonly, highlightCat} -> uiBuildGrid(this, inventory, opts)
  // Drag & drop with pointer events between grids and equipment slots; click-select then click-target also works (touch friendly);
  // Shift+click on a stack splits half without a dialog; 'Teilen' asks promptNumber(…, {max: inst.count - 1}).
  // right click / long-press → context menu: Ausrüsten / Ablegen (base: Vernichten) / Benutzen / Teilen / Verkaufen / Reparieren / Ins Lager / In den Rucksack depending on context.
  // Tooltip on hover/selection: name (rarity color), category, rarity, weight, value, durability bar, stats lines (Items.describe), desc.
}
```

### 24.3 HUD and DOM budget

UIManager keeps a `hudCache` of the last written strings and writes text through
`uiSetText(el, str)` only on change. The objectives list, weapon chips, armor chips and status
icons are rebuilt only on `objectiveComplete`, slot switch, equipment change or every 1 s as a
fallback; HP/stamina bars update every frame via `style.transform = 'scaleX(pct)'` (no layout);
the minimap (`renderer.renderMinimap(raid, minimapCanvas, 180)`) is redrawn every 4th frame when
`settings.minimap`, its tile layer cached per `world.version`. The HUD clock shows
`formatHour(raid.hour)`. Budget: HUD ≤ 1 ms per frame.

### 24.4 Screen stack semantics

- `showScreen(name)` replaces the current screen. `returnTo` is set to the previous screen (or
  `null`) only when `name ∈ {'settings', 'stats', 'credits'}`; any other `showScreen` call sets
  `returnTo = undefined`.
- `closeScreen()`: if `returnTo !== undefined` → `showScreen(returnTo)` and clear it; else if
  `game.state === 'raid'` → `showScreen(null)` (and `game.resumeRaid()` if the closed screen was
  `pause`); else → `showScreen('base')`. `data-action="back"` and `"close"` both call `closeScreen()`.
- `showScreen('pause')` does not pause by itself; `Game.pauseRaid()` sets `paused = true` and then
  shows it. `Game.resumeRaid()` closes the pause screen and unpauses.
- UI screens never install their own `keydown` listeners for Escape/Tab/M/X (Game handles them,
  §25.1); confirm/prompt modals may listen for Enter/Escape while open.

Screens (`showScreen` names): `main`, `base`, `stash` (Lager + Ausrüstung/Loadout + equipment
slots + loadout warnings), `armory` (Waffenwerkstatt: repair, weapon/ammo recipes, upgrade), `medbay`
(Krankenstation: heal, med recipes, upgrade), `workshop` (Werkstatt: material recipes, upgrade),
`radio` (Funkstation: available / active / completed missions; accept, abandon, hand-in; upgrade),
`defense` (Verteidigungsanlage: upgrades list, secure container, insurance), `trader` (Händler:
buy table with stock & price, sell panel from stash), `missionSelect` (Einsatz planen: map cards —
lock status, difficulty skulls, duration, description, extraction list; active missions for the
map; loadout warnings; seed field optional; 'Einsatz starten'), `inventory` (raid), `loot`
(raid), `map` (raid), `pause` (buttons `resume` 'Fortsetzen', `settings` 'Einstellungen',
`abort-raid` 'Einsatz abbrechen' with confirm 'Abbrechen zählt wie ein Tod: Ausrüstung und Beute
gehen verloren.'; shows map name, elapsed time, active objectives), `settings` (volumes, shake,
fps, touch controls, quality, damage numbers, Steuerung übersicht, Spielstand: speichern /
exportieren / importieren / zurücksetzen mit Bestätigung — the whole Spielstand block is hidden while
`game.state === 'raid'`; `back` returns to the previous screen per §24.4),
`result` (Raid-Ergebnis: outcome, time, kills, accuracy, loot list kept/lost/sold, xp bar from
`xpBefore/xpAfter/xpToNext`, missions completed, level-up), `death` (Todesbildschirm:
`causeOfDeath`, what was lost, insurance, `missionsFailed`), `stats` (statistics + achievements),
`credits` (Info: controls + about). `main`: `[data-action="continue"]` carries the `disabled`
attribute when `!game.save.hasSave()`.

HUD (`#hud`): top-left: HP bar (red), stamina bar (yellow), armor chips (body/head with durability),
status icons (Blutung, Vergiftet, Hunger, Durst, Überladen); top-center: raid timer and clock;
top-right: minimap canvas (`#minimap`, 180×180) with map name; bottom-right: weapon panel (name, mag/
reserve, fire mode, durability, slots 1–5 as small chips with active highlight); bottom-left:
objectives list (done ✓, optional ◇) and extraction status line; bottom-center: interaction prompt
(`E – Kiste durchsuchen`, with hold progress bar for generator), item-use channel bar; center:
crosshair (follows mouse; dot when touch), boss bar (top, when `raid.zombies.boss` alive);
weight indicator; damage vignette and low-hp pulse via CSS classes on `#hud`.

Mobile (`#mobile`), visibility `ui.setTouchVisible(input.touchMode && game.state === 'raid' && currentScreen === null)`
applied in `showScreen`, `closeScreen`, `Game.startRaid`, `Game.onRaidEnded` and `applySettings`:
1. `#mobile` and `#game` get `touch-action: none; user-select: none; -webkit-user-select: none`. All
   controls use Pointer Events with `setPointerCapture(e.pointerId)` and a `Map<pointerId, control>`;
   `pointercancel` releases the control; `touchstart` on `document` is `preventDefault`ed
   (`{passive:false}`) while a raid runs.
2. Floating sticks: a `pointerdown` in the left 45 % of the viewport (below the top 20 %) spawns the
   move stick at that point, in the right 55 % the aim stick; stick radius 56 px, dead zone 12 px,
   value = `clamp(offset / 56)` → `input.setStick`. Aim direction persists after release (`lastAim`).
3. A FIRE button (72 px, bottom-right above the aim zone) is always shown → `input.touchFire`; the aim
   stick additionally fires at deflection > 0.75 when `settings.aimAssist`.
4. Buttons (`input.touchAction`): `E` (shows the current `prompt` text), `R`, `Shift` and `C`
   (toggles with `.active`), `F`, `Tab`, `M`, `G`, `Q` (quick med), `II` (pause), weapon slot chips,
   `fullscreen` (§0.1). Min 56 px touch targets, semi-transparent, landscape optimized; portrait
   shows a CSS-only rotate hint. Mobile defaults: `quality:'medium'`, DPR capped at 2.

Design: dark tactical: `--bg:#0a0d10; --panel:#12181d; --panel2:#1a2229; --border:#2a3640;
--text:#dfe6ec; --muted:#8a98a6; --accent:#7fb24a; --warn:#f0b429; --danger:#e5484d; --info:#4aa3df`.
Fonts: `"Segoe UI", Roboto, system-ui, sans-serif`; numbers `ui-monospace, Consolas, monospace`.
Responsive: panels max-width 1200 px, grid layouts collapse under 900 px; everything usable at
360×640 landscape 800×360.

Every button does something. Disabled states explain why (title/tooltip + muted text).

---

## 25. `24_game.js` — Game

```js
class Game {
  constructor(canvas)
  rng, events (EventBus), settings, save, audio, input, camera, renderer, ui, profileMgr, missions, raid = null
  state ('main'|'base'|'raid'|'result'), paused, auto = true (rAF-driven updates), fps, slowFrames = 0
  init()                          // create subsystems in order: events → save → settings → audio → input → camera → renderer → profileMgr → missions → ui;
                                  // load settings; ui.showScreen('main'); start loop; resize listener; first-gesture audio.unlock; visibilitychange → pauseRaid() during a raid
  frame(dt)                       // ONE fixed step incl. input handling: handleGlobalKeys(); if (state === 'raid' && !paused) update(dt); ui.updateHud(raid, dt); input.endFrame();
                                  // must not throw when raid === null or state !== 'raid' (handleGlobalKeys/endFrame still run)
  loop(ts)                        // rAF. auto === true: accumulator → frame(FIXED_DT) at most maxStepsPerFrame = 3 times; a remainder beyond 3 × FIXED_DT is discarded
                                  // (the game slows down instead of stalling) and slowFrames++; then render(dt); fps.
                                  // auto === false: ONLY render(dt) and fps — no frame(), no update, no ui.updateHud, no input.endFrame() (tests step manually)
  step(dt = FIXED_DT, n = 1)      // for (i < n) frame(dt); returns n — synchronous, works with auto === false, never requires rAF
  update(dt)                      // raid.update(dt); playTime stat; adaptive quality: slowFrames > 30 within 5 s and settings.quality !== 'low' → lower quality one step at runtime (toast 'Grafikqualität reduziert')
  handleGlobalKeys()              // §25.1
  render(dt)                      // renderer.render(raid) or renderMenuBackground
  newGame({confirm = true})       // if hasSave && confirm → ui.confirm overwrite; profileMgr.newProfile(); save; enterBase(); -> Promise<boolean>; with confirm:false no dialog is ever shown
  continueGame()                  // synchronous -> {ok, repaired:[], mia:boolean}; save.load → !ok: toast 'Kein gültiger Spielstand' (kind 'warning'), stays on 'main';
                                  // ok: profileMgr.setProfile(profile); if profile.raidInProgress → applyMiaOnReload + save + toast (§21); enterBase()
  enterBase()                     // state 'base'; raid = null; profileMgr.restockTrader() only if needed; ui.showScreen('base'); autosave
  startRaid(mapId, {missionIds, seed} = {})
                                  // never blocks and never opens a dialog: a locked map or loadout warnings → Log.warn + ui.toast(…, 'warning') and the raid starts anyway
                                  // (the UI hides/disables 'Einsatz starten' for locked maps); missionIds default = profile.missions.active.filter(id => MISSION_BY_ID[id]?.mapId === mapId);
                                  // seed normalised per §0.3; save.markRaidStart(profile, {mapId, missionIds, seed, startedAt}); raid = new RaidManager(this);
                                  // raid.start({mapId, missionIds, seed, loadout: profileMgr.buildLoadout()}); state 'raid'; paused = false; ui.showScreen(null); ui.bindRaid(raid);
                                  // -> {ok:true, mapId, seed, missionIds} (JSON-safe; never the RaidManager)
  onRaidEnded(result)             // synchronous in the same call as raid.end(): state 'result'; ui.unbindRaid(); ui.showScreen(result.outcome === 'extracted' ? 'result' : 'death', {result});
                                  // this.raid is KEPT (raid.result set, raid.ended === true, no further updates) until enterBase() or returnToMain()
  pauseRaid()/resumeRaid()/togglePause()   // pauseRaid: paused = true, ui.showScreen('pause'); resumeRaid: closes the pause screen, paused = false
  abortRaid()                     // confirm (pause screen) → raid.abort()
  returnToMain()                  // from base or result; raid = null; save
  saveNow()                       // manual save (base only): in state 'raid' → toast 'Im Einsatz nicht möglich', returns false; else save.save(profileMgr.serialize()), toast, returns true
  resetSave()                     // confirm → save.reset(); state main
  applySettings(partial)          // merges, saves, applies (audio volumes, touch mode, quality, setTouchVisible)
  onResize()
  debugApi()                      // -> window.DZ object (§26)
}
```

### 25.1 Global keys (`Game.handleGlobalKeys`, runs in every `frame`, also while paused or a screen is open)

Uses `input.pressedRaw` (works while input is disabled by an open screen):

- state `raid`: `pause` → `if (ui.currentScreen && ui.currentScreen !== 'pause') ui.closeScreen(); else togglePause();`
  `inventory` (when `!paused`) → `ui.currentScreen === 'inventory' ? ui.closeScreen() : ui.openInventory()`;
  `map` (when `!paused`) → same pattern with `openMap()`; `drop` → `ui.dropSelected()` when the
  screen is `inventory`/`loot`.
- state `base`: `pause` with a sub-screen open (anything but `base`) → `ui.closeScreen()`.
- No consumption is needed: Player never reads `pause`, `inventory`, `map` or `drop`. All other
  actions reach the player through the normal disabled-aware `pressed()/isDown()` path inside
  `raid.update`.

While a raid screen is open the player does not receive input (`input.setEnabled(false)`), the
simulation **continues** (Tarkov-like: looting is risky) — except while `paused`.

---

## 26. `25_main.js` and debug API `window.DZ`

Boot: on `DOMContentLoaded`: `window.DZ = { version: GAME_VERSION, errors: Log.errors, log: Log }`
is assigned **first**; then inside `try/catch`: `const game = new Game(document.getElementById('game')); game.init(); Object.assign(window.DZ, game.debugApi());`
— on failure `DZ.bootError = String(e)`, `Log.error`, and `#errbar` shows the message. Global
`error` / `unhandledrejection` handlers → `Log.error` + `#errbar` text (dismissible). `#errbar` is
hidden by default. **`window.DZ` is the only property the game adds to `window`**; game code never
reads anything from `window.DZ`.

```js
window.DZ = {
  version: GAME_VERSION, game, errors: Log.errors, log: Log, bootError?: string,
  // Bundle bindings for tests (same object identity, not copies; the bundle is an IIFE so these are not globals):
  Items,                                                      // class (tests call DZ.Items.create(id, count))
  item: (id, count = 1) => Items.create(id, count),
  data: { ITEMS, ITEM_LIST, MISSIONS, MISSION_BY_ID, MAPS, MAP_ORDER, UPGRADES, RECIPES, TRADER_STOCK, LOOT_TABLES, ZOMBIE_TYPES, T, RARITY, CATEGORY_NAMES, ECONOMY, XP_REWARDS, DEFAULT_SETTINGS },
  lib:  { RNG, Inventory, Equipment, Physics, Nav, SpatialHash, WorldGenerator, Progression, ProfileManager, SaveSystem, MissionSystem },
  state: () => game.state,
  newGame: () => game.newGame({confirm:false}),            // Promise<boolean>, no dialog
  continueGame: () => game.continueGame(),                 // {ok, repaired, mia}
  toBase: () => game.enterBase(),
  startRaid: (mapId = 'city', opts = {}) => game.startRaid(mapId, opts),   // opts.seed, opts.missionIds; -> {ok, mapId, seed, missionIds} (never blocks on locked maps, §25)
  raid: () => game.raid, player: () => game.raid?.player, world: () => game.raid?.world, zombies: () => game.raid?.zombies.zombies,
  profile: () => game.profileMgr.profile,                   // live profile (JSON-stringifiable, §19)
  setAuto: (b) => { game.auto = b; },                       // false: rAF only renders (§25 loop); no input edges are consumed by rAF
  step: (dt = FIXED_DT, n = 1) => game.step(dt, n),
  key: (code, down) => game.input.debugKey(code, down),      // §7
  mouse: (x, y, down) => game.input.debugMouse(x, y, down),  // §7: screen CSS px; undefined keeps position / button
  aimAt: (wx, wy) => game.input.debugAimWorld(wx, wy),       // §7: stable world aim point
  fire: (down) => game.input.debugMouse(undefined, undefined, !!down),
  teleport: (x, y) => { const p = raid.player; p.x = x; p.y = y; game.camera.snap(x, y); },
  giveItem: (id, count = 1) => raid.player.inventory.add(Items.create(id, count)),   // -> {ok, remaining}
  giveStash: (id, count = 1) => game.profileMgr.stash.add(Items.create(id, count)),
  giveCredits: (n) => { profile.credits += n; game.ui.refresh(); },
  spawnZombie: (type, x, y) => raid.zombies.spawn(type, x, y),             // -> zombie | null (cap)
  killAll: ({remove = true} = {}) => kills every alive zombie without drops/xp/stats and, if remove, splices the corpses out of zombies.zombies; boss → null,
  alertAll: () => every alive zombie: state 'chase', alert 1, target = player position,
  noise: (x, y, radius = 600, kind = 'shot') => raid.emitNoise(x, y, radius, kind),
  director: (on) => { raid.zombies.directorEnabled = !!on; },
  setTime: (sec) => { raid.time = sec; },                   // then one step recomputes hour/darkness and timed windows
  setHour: (h) => { raid.hour = h; raid.darkness = darknessForHour(h); },
  setFlag: (name, v) => { raid.flags[name] = v; },
  god: (b) => { raid.player.god = !!b; },
  extractNow: () => completes current() or the first active point immediately (raid.onExtracted(point)); -> point.id | null,
  die: () => raid.player.die(),
  pathExists: (x0, y0, x1, y1) => !!raid.nav.findPath(x0, y0, x1, y1),
  nearest: (kind) => nearest object of that kind to the player, any distance: {x, y, dist, ref} | null.
     // kind ∈ 'container' (only containers with at least one walkable 8-neighbour tile) | 'container_closed' (same, !opened) | 'door' | 'loot' |
     //        'extraction' | 'extraction_active' | 'poi' | 'generator' | 'zombie' (alive) | 'interactable' (= raid.findInteractable(player.x, player.y, Infinity))
  validateWorld: (mapId, seed, missionIds = []) => WorldGenerator.validate(WorldGenerator.generate(mapId, seed, missionIds.map(id => MISSION_BY_ID[id]).filter(Boolean)), …same defs…),
  validateMissions: () => MissionSystem.validate(),         // {ok, problems}
  save: () => game.save.save(game.profileMgr.serialize()), load: () => game.save.load(), reset: () => game.save.reset(),
  ui: game.ui, click: (selector) => document.querySelector(selector)?.click(),
  screen: () => game.ui.currentScreen,
};
```

`DZ.step` must run the full `frame` including `handleGlobalKeys`, `ui.updateHud` and
`input.endFrame`, and must not require rAF. `DZ.key('KeyW', true)` followed by
`DZ.step(1/60, 60)` must move the player north. `DZ.key('Tab', true); DZ.step(); DZ.key('Tab', false); DZ.step(2)`
must toggle the inventory screen. Every DZ function returns JSON-safe data or `undefined`, except
`raid/player/world/zombies/profile/ui/game` which return live objects for in-page inspection.

---

## 27. Events

On `raid.events` (emitter → payload):

| Event | Emitter | Payload |
|---|---|---|
| `kill` | ZombieAI | `{zombie}` |
| `boss` (every frame while alive), `bossDead` | ZombieAI | `{hp, hpMax, phase, name}` / `{zombie}` |
| `playerHit` | Player.takeDamage | `{amount}` |
| `containerOpened` | RaidManager.openContainer (first open only) | `{container}` |
| `itemPicked` | RaidManager.takeFromContainer / takeAll / pickFloorLoot | `{inst, source:'container'\|'floor'}` |
| `doorToggled` | RaidManager.toggleDoor | `{tx, ty, open}` |
| `noise` | RaidManager.emitNoise | `{x, y, radius, kind}` |
| `generatorOn`, `poiReached` | RaidManager.update (§18.2) | — / `{poi}` |
| `extractionStart`, `extractionCancel`, `extractionDone` | ExtractionSystem | `{point}` / `{point, reason}` / `{point}` |
| `extracted` | RaidManager.onExtracted (before `end`) | `{extractionId, inventory, secure}` |
| `objectiveComplete` | MissionSystem | `{mission, objective}` |
| `toast` | any raid module (UIManager listens and calls `toast`) | `{text, kind}` |
| `raidEnd` | RaidManager.end | `{result}` |

On `game.events` (lives for the whole session; UIManager subscribes once in `init`):
`missionComplete {mission}` (MissionSystem.grantRewards — base hand-in and raid end alike),
`levelUp {level}` (ProfileManager.addXp), `profileChanged` (ProfileManager.setProfile/newProfile).

`MissionSystem.onEvent` subscribes to `raid.events` in `startRaid`; `UIManager.bindRaid(raid)` is
called by `Game.startRaid`; `RaidManager.end` calls `events.clear()` and `Game.onRaidEnded` calls
`ui.unbindRaid()`.

Toasts from raid modules: calling `raid.game.ui.toast(text, kind)` directly is allowed (it is not
DOM access by the caller) and is what §16–§18 specify; emitting `toast` on `raid.events` is the
equivalent for a module that keeps no `game.ui` reference. Each message is produced by exactly one
module (the emitter named in the sections above); `bindRaid` never duplicates them.

---

## 28. Quality bar and test hooks

- `index.html` must load with **zero console errors** (`pageerror`, `console.error`), start a new
  game, enter the base, start a raid on each map with seeds 1..5, simulate 600 steps, open/close
  every screen, extract, die, save and reload — all driven through `window.DZ` by Playwright tests
  in `deadzone/tests/`.
- World validation must pass for every map with seeds 1..20 (with that map's missions as
  `missionDefs`); `MissionSystem.validate()` must return `ok` for all 24 missions.
- Pure logic (RNG, Inventory, Equipment, Loot, Economy, Progression, ProfileManager.validate,
  World validation, MissionSystem.validate) is unit-tested in Node by loading the concatenated
  bundle in a `vm` context with a minimal DOM stub (`deadzone/tests/node_env.mjs` provided by the
  test author) — therefore every file must obey the Node-loadability rules of §0.2.

### 28.1 QA cases (MASTERPROMPT §17) → `window.DZ` drivers

| # | Case | Driver |
|---|---|---|
| 1 | starts without errors | `openGame` → `DZ.version`, `DZ.errors`, `screen() === 'main'` |
| 2 | moves in all directions | `newGame`, `startRaid`, `key('KeyW')`, `step(45)`, `player()` |
| 3 | walls block | `teleport` beside a `WALL` tile (`world().tile/blocksMove`), `key('KeyD')`, `step(120)` |
| 4 | aim and shoot | `aimAt`, `mouse(640,360,true)` or `fire(true)`, `raid().weapons.projectiles` |
| 5 | ammo consumed | `player().weaponInst.mag`, `player().stats.shotsFired` |
| 6 | reload | `key('KeyR')` + `step(300)`, `player().inventory.count(ammoId)`; without ammo mag stays 0 |
| 7 | zombies notice/chase | `spawnZombie`, (`alertAll`/`noise` for hearing), `zombies()[i].state ∈ chase/attack` |
| 8 | damage both ways | `god(false)` → `player().hp` drops; `god(true)` + shooting → `player().stats.kills` |
| 9 | loot | `nearest('container')`, `teleport` to a walkable neighbour, `key('KeyE')`, `screen() === 'loot'`, `click('[data-action="take-all"]')` |
| 10 | full inventory | `item()` + `inventory.add` until `isFull()`, `raid().dropItem` + `pickFloorLoot` → entry stays |
| 11 | valid mission objectives | `validateMissions()`, `validateWorld(mapId, seed, missionIds)` for every mission |
| 12 | extraction | `nearest('extraction')`, `giveItem(requires)`, `setTime(window[0])`, `setFlag('generatorOn', true)`, `raid().extraction.current()` |
| 13 | extraction keeps loot | `giveItem('col_watch')`, teleport onto the point, `step(duration·60)`, `profile().stash` / `profileMgr.stash.count` |
| 14 | death loss rules | `die()`, `profile().equipment`, `profile().stats.deaths`, secure item in stash |
| 15–16 | base & trader | `giveCredits`, `game.profileMgr.buy/sell/upgrade/craft/heal`, `moveStashToLoadout` |
| 17 | persistence | `save`, `page.reload`, `continueGame`; raid + reload → `stats.mia`, `raidInProgress === null` |
| 18 | menus & settings | `ui.showScreen(every name)`, `click` every required `data-action`, `game.applySettings`, `save.loadSettings` |
| 19 | mobile | `openGame({touch:true})`, `input.touchMode`, `#mobile` not hidden, `input.setStick/touchFire/touchAction` |
| 20 | no blockers | `step(1500)` with random `key`/`mouse`; caps `fx.particles ≤ 700`, `zombies().length ≤ maxAlive + 30`, state stays `raid`/`result` |

---

## 29. Stable `data-action` attributes for UI buttons (test contract)

Every UI button carries `data-action="<name>"` so tests can click it. Required names:
`new-game, continue, settings, stats, credits, main-menu, to-base, start-raid, plan-raid, base-stash, base-armory,
base-medbay, base-workshop, base-radio, base-defense, base-trader, take-all, close, resume, abort-raid, save,
reset-save, buy, sell, upgrade, craft, repair, heal, accept-mission, abandon-mission, hand-in, equip, unequip,
to-stash, to-loadout, drop, use, split, sort, select-map, export-save, import-save, back, fullscreen`.

Click contract: every `data-action` element is a `<button>` (never a `div`), so `.disabled` and
`.click()` behave natively, and it reacts to the DOM `click` event. `pointerdown`/`touchstart`
listeners may be added only in addition (e.g. for a visual `:active` class), never instead, and
must be idempotent with the following click. Virtual sticks and the fire area use pointer events
and are not `data-action` buttons. `[data-action="continue"]` carries `disabled` when
`!game.save.hasSave()`.

`UIManager.showScreen(null)` closes all screens (raid HUD only); `currentScreen` is `null` then.
`Game.resumeRaid()` closes the pause screen and unpauses.
