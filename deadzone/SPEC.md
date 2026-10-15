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
- Because all files share one scope: **every top-level name is global to the bundle**. Use the
  names given here; do not invent a second helper with the same name. Prefix private helpers of
  a module with the module name (e.g. `wgPlaceBuildings`, `uiEl`) to avoid collisions.
- Top-level `const` may reference another file's top-level `const` only if that file sorts
  earlier (data files `01_`–`04_` come first and may only depend on `00_util.js`).
- No `import`/`export`, no external files, no network, no `Math.random()` in game logic
  (use `RNG`). Visual-only randomness (particles) may use `game.rng`.
- **No DOM access** except in `06_input.js`, `22_renderer.js` (canvas only), `23_ui.js`,
  `24_game.js`, `25_main.js`. Audio: only `05_audio.js` touches `AudioContext`.
- `localStorage` access only in `20_save.js`, always inside `try/catch`.
- Units: world coordinates are pixels at zoom 1. `TILE = 32`. Tile coordinates
  `tx = Math.floor(x / TILE)`. Angles in radians, 0 = +x, increasing clockwise (canvas y-down).
  Time in seconds. Fixed update step `FIXED_DT = 1/60`.
- All game objects are plain objects or class instances; **serialize** methods return
  JSON-safe plain objects.
- Defensive coding: never throw on missing data. Unknown item id → `Items.create` returns `null`
  and `Log.warn`s. Every `update(dt)` must tolerate `dt` up to 0.1 s.
- Performance targets: 60 FPS on a normal laptop with 90 zombies, 600 particles, 150×150 map.
  Use the spatial hash for entity queries and the chunk cache for tiles.
- Each file starts with a header comment: purpose, public API summary, dependencies.

### Access pattern

Every subsystem receives the `game` object (or the `raid` object for raid-scoped systems)
in its constructor and keeps it as `this.game` / `this.raid`. Subsystems are reached through
those references — never through globals:

```
game.rng            RNG            non-deterministic (seeded from Date.now() at boot)
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
                        shot12:'12/70', sniper308:'.308', lmg762:'7,62 mm Gurt' };

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
  stack 60 (shotgun 30, sniper 20). `lmg762` guns use `ammo_762*`.
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

Starting loadout (used by `ProfileManager.newProfile`): `pistol_m9` (loaded), `ammo_9mm` ×30,
`melee_knife`, `med_bandage` ×2, `pack_small`. Stash starts with `ammo_9mm` ×30,
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
  rewards: { credits, xp, items:[{id,count}] }, optionalRewards: { credits, xp } }

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

Sound names (all must exist; silence is acceptable fallback but each should have a distinct synth):
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
  isDown(action)                // held
  pressed(action)               // became pressed since last endFrame()
  released(action)
  moveAxis()                    // {x,y} normalized length ≤ 1 (keyboard or left touch stick)
  aimAngleFrom(sx, sy)          // radians from screen point (player on screen) to mouse / right stick direction; falls back to lastAim
  wantsFire()                   // mouse button 0 held, or touch fire held / right stick pushed > 0.75
  get mouse()                   // {x, y, down, rightDown}
  get touchMode()               // boolean, auto-detected (pointer: coarse / touchstart) or forced by settings.touchControls
  setTouchMode(bool)
  // Called by UIManager's virtual controls:
  setStick(which, x, y)         // which: 'move'|'aim'; x,y in [-1,1]; (0,0) when released
  touchAction(action, down)     // virtual buttons (interact, reload, sprint, crouch, flashlight, inventory, map, grenade, pause, quickMed); down=true then false → one pressed() edge
  touchFire(down)
  endFrame()                    // clear per-frame edges (called by Game at end of each render frame)
  setEnabled(bool)              // when false, isDown()/pressed() return false (menus open); still records state
  consumeAll()                  // clear pressed edges (after UI handled a key)
}
```

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

## 9. `08_world_gen.js` — WorldGenerator and World

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
  pois:       [ { id, type ('generator'|'crash_site'|'radio_tower'|'lab_entrance'|'mass_grave'|'boss_arena'|'supply_drop'|'checkpoint'|'server_room'|'water_tower'), x, y, radius:64, buildingId|null, used:false } ]
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
  static generate(mapId, seed, missionDefs = [])  // -> World ; deterministic for (mapId, seed, mission ids)
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
   `WINDOW` every 3–5 wall tiles, interior walls splitting into rooms (≥ 3×3 interior) with
   interior doors so **every floor tile is reachable from every exterior door**.
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
    Expose `WorldGenerator.validate(world) -> { ok, unreachable: [...] }` for tests.
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
  constructor(world)
  // Flow field toward a target (the player), BFS over walkable tiles (closed/locked doors cost 4, rubble 2), radius-limited
  rebuild(targetX, targetY, maxRadiusTiles = 70)
  dirAt(x, y)                  // -> {dx, dy} unit vector along the field toward target | null (outside field)
  distAt(x, y)                 // -> steps | Infinity
  findPath(x0, y0, x1, y1, maxNodes = 6000)   // A*, 8-neighbour without corner cutting, doors walkable (cost 3)
                               // -> [{x,y}] world tile centers (excluding start) | null
  randomWalkable(rng, nearX, nearY, radiusTiles)  // -> {x,y} | null
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
Runtime-only fields (never serialized): `rt` (weapon runtime: `{cooldown, reloading, reloadTimer}`).

```js
class Inventory {
  constructor(slots)
  slots, items (Array length slots, null = empty)
  setSlots(n)                          // -> overflow ItemInstance[] (when shrinking)
  canAdd(inst)                         // boolean (considering stacking)
  add(inst)                            // -> {ok, remaining: ItemInstance|null} (merges stacks first, then empty slots; partial adds allowed)
  addMany(list)                        // -> remaining[]
  remove(uid, count = Infinity)        // -> removed ItemInstance | null
  removeById(id, count)                // -> number removed
  count(id)
  has(id, count = 1)
  get(idx) / set(idx, inst)
  indexOf(uid)
  move(from, to)                       // within this inventory: merge if stackable, else swap; -> boolean
  transfer(idx, other, toIdx = -1)     // move item at idx to other Inventory (merge/empty/swap) -> boolean
  split(idx, count)                    // -> boolean (needs empty slot)
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

Rules: tier 1: ≈ 70 % common, 25 % uncommon, 5 % rare; tier 5: 20/30/30/15/5. Weapons appear
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
     // inst: weapon ItemInstance (uses inst.rt, inst.mag, inst.ammoId, inst.durability); shooter {x,y}
     // -> {fired:boolean, reason:'cooldown'|'reloading'|'empty'|'melee'|null}
     // handles fire rate, spread (base × shooterSpreadMul from Player: crouch 0.6, moving 1.4, sprint 2.0; bloom +recoil per shot decaying 2/s),
     // pellets, mag--, durability -= 0.15, misfire chance when durability < 15 (10 %), muzzle flash via raid.fx.muzzleFlash,
     // camera shake (recoil*6), audio 'shot_<class>' at shooter, raid.emitNoise(x,y, def.noise * ammo.noiseMul, 'shot'),
     // player stats (shotsFired) via raid.stats
  startReload(inst, inventory)        // -> {ok, reason:'full'|'no_ammo'|'reloading'|null}; picks ammo of matching caliber with the most rounds in inventory (prefer inst.ammoId if present)
  cancelReload(inst)
  finishReload(inst, inventory)       // internal; moves rounds from inventory into inst.mag (partial if few), sets inst.ammoId
  melee(inst, shooter, aimAngle)      // -> {hit:number}; arc hit test vs raid.zombies within meleeRange; cooldown swingTime; noise 60
  throwGrenade(inst, from, aimAngle, power = 1)  // -> boolean; adds to raid.grenades: {x,y,vx,vy,z,fuse,def,inst}; consumes 1 from stack
  update(dt)                          // reloads, projectiles (substep ≤ 8 px: raycastTiles vs blocksBullets, zombie circle hits via raid.hash),
                                      // grenades (arc, bounce off blocking tiles, explode: damage to zombies & player within radius with falloff, fx.explosion, noise, molotov → raid.addHazard fire)
  ammoInInventory(inst, inventory)    // -> number of rounds of matching caliber
  reserveText(inst, inventory)        // 'mag / reserve' string helper
}
```

Projectile speed 1400 px/s (sniper 2200). Damage falloff: full within 60 % of range, then linear
to 50 % at range, destroyed beyond range. `pen` vs armored zombie: see §15. Zombie hit → `raid.zombies.damage(z, dmg, {pen, dirX, dirY, source:'bullet'})`,
`raid.fx.blood(...)`, hit marker (`raid.fx.hitMarker()`), stats `shotsHit`.
Bullets hitting walls: `raid.fx.impact(x, y, angle, tile)`. Bullets pass `WINDOW`, `FENCE`, `PROP_LOW`.

---

## 14. `13_player.js` — Player

```js
class Player {
  constructor(raid, loadout)   // loadout: {equipment: Equipment, inventory: Inventory, secure: Inventory, hp, hpMax}
  x, y, angle, radius = 12, uid = 'player'
  hp, hpMax, stamina = 100, staminaMax = 100, hunger = 100, thirst = 100   // 100 = fine
  bleeding (bool), bleedTimer, toxic (s remaining), effects: [{id, timer, speedMul?, ...}]
  crouching, sprinting, moving, flashlightOn = true, dead
  equipment, inventory, secure
  activeSlot (0..4), weaponInst (getter: equipment weapon for active slot or null)
  using: null | {inst, timer, total}      // channelled item use
  interactTarget: null | Interactable     // computed each update via raid.findInteractable
  holdProgress (0..1) for hold-interactions (generator)
  stats: {shotsFired, shotsHit, kills, damageDealt, damageTaken, lootValue, containersOpened, distance}
  update(dt, input)
     // movement (walk 150, sprint 250 (stamina 22/s, needs > 0 and not overweight), crouch 85; weightSpeedMul; tile speedMul; effects),
     // Physics.moveCircle; aim angle from input.aimAngleFrom(screen pos); fire/auto-fire; reload (R); weapon slots; grenade (G or slot 4 + fire);
     // quick-med (Q or slot 5 + fire); interact (E: press for containers/doors/loot/extraction info; hold for generator); flashlight (F);
     // drop (X: drop selected inventory item? -> UI handles; X drops currently active weapon only when UI closed... keep: X ignored unless UI selection),
     // footsteps noise every 0.38 s moving (walk 130, sprint 260, crouch 45), stamina regen 18/s after 1 s,
     // hunger -0.6/min, thirst -0.9/min; hunger < 25 → stamina regen ×0.5; thirst < 25 → hpMax effective -20 (clamped);
     // bleeding: -1.5 hp/s until bandaged (max 45 s then stops); toxic: -2 hp/s while > 0.
  takeDamage(amount, opts = {source, from:{x,y}, bleedChance, toxic})
     // armor: body protection reduces (× (1 - protection)); armor durability -= amount*0.5; broken armor (durability 0) protects 0;
     // fx.damageFlash, camera shake, audio 'player_hurt', stats; if hp <= 0 → die()
  heal(amount), applyEffect(effect), cureBleeding(), cureToxic()
  useItem(inst)             // starts channel (useTime); on finish applies medical/food/water and consumes 1
  bestMedical()             // chooses: bleeding → bandage/medkit; else lowest useTime that heals missing hp
  switchSlot(idx)
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

---

## 15. `14_zombies.js` — ZombieAI

```js
class ZombieAI {
  constructor(raid)
  zombies: []            // all including corpses (z.dead, z.deathTimer)
  spawn(typeId, x, y, groupId = null)        // -> zombie; respects raid.map.zombies.maxAlive (returns null when capped)
  spawnInitial(world)
  spawnNearPlayer(typeId, minDist = 500, maxDist = 900, count = 1)   // out of sight if possible; for screamers/extraction hordes/director
  onNoise(x, y, radius, kind, strength = 1)  // 'shot'|'step'|'door'|'explosion'|'scream'|'alarm'
  update(dt)
  damage(z, amount, opts = {pen:1, dirX, dirY, source})   // -> {killed, dealt}; armored frontal reduction; stagger on big hits; death → drops, xp, stats, events 'kill'
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
abilityTimer, lurking (stalker), visibleAlpha, doorTimer, legPhase (animation), hitThisAttack }`

States: `idle, wander, investigate, chase, attack, stunned, dead, lurk (stalker), ability (boss)`.

Rules:

- **Perception**: sight if `dist ≤ sightRange × lightFactor × (player.crouching ? 0.65 : 1)` and
  `Physics.lineOfSight`. `lightFactor = 1 - 0.45 × raid.darkness` (0.55 at full night); if the player's
  flashlight is on, `lightFactor` ≥ 0.9. Hearing: `onNoise` with `dist ≤ radius × type.hearingMult`.
  Sight triggers chase; noise triggers investigate (or chase if `kind === 'scream'` or the zombie
  is already alert). Zombies lose track after 6 s without sight → investigate `lastSeen`, then wander.
- **Movement**: chase uses `raid.nav.dirAt` (flow field) when `dist > 48` and the field covers the
  position, direct steering otherwise; investigate/wander use `nav.findPath` (re-plan every 2 s,
  max 1 per frame across all zombies — budget!). Separation: push apart overlapping zombies
  (`Physics.resolveCircles`) max 6 neighbours via `raid.hash`. Movement via `Physics.moveCircle`.
  Stuck detection: if moved < 4 px in 1.5 s while chasing → re-plan with A* (budgeted).
- **Doors**: a zombie whose next tile is `DOOR_CLOSED` bashes it: after `doorTimer` ≥ 1.2 s
  (brute 0.3 s) it becomes `DOOR_OPEN` (`raid.toggleDoor`, noise 200). `DOOR_LOCKED` is never opened.
- **Attack**: when `dist ≤ radius + player.radius + attackRange`: windup (`type.windup`), then if
  still within range × 1.3 → `player.takeDamage(damage, {bleedChance})`; cooldown.
  Brute: knockback (push player 140 px over 0.2 s, camera shake) and bleedChance 0.5.
  Toxic: attack also spawns `raid.addHazard({kind:'toxic', x, y, r:toxicRadius, duration:toxicDuration})`; dying toxic bursts a cloud.
  Screamer: when alert and `screamCooldown` ready → audio `screamer`, `raid.emitNoise(x,y,screamRadius,'scream')`,
  `spawnNearPlayer('walker', 500, 900, rng.int(summon))`.
  Armored: `damage()` reduces by `armor` when `angleDiff(z.angle, hitDir reversed) < armorArc/2` unless `pen ≥ 3`; `pen === 2` halves the reduction.
  Stalker: starts in `lurk` (alpha 0.35, prefers indoor/dark tiles, does not move) until the player is within
  `ambushRange` or hits it → `chase` at full speed; `visibleAlpha` = 1 when inside the flashlight cone or within 90 px.
  Boss: phases by `hpPct`; `slam` (every 6 s: AoE 120 px, 45 dmg, shake), `charge` (every 9 s: dash 420 px/s toward player for 0.9 s, 50 dmg on contact),
  `summon` (every 15 s: `spawnNearPlayer('walker', 300, 500, 3)`); emits `raid.events.emit('boss', {hp, hpMax, phase, name})` every frame alive and `'bossDead'` on death; death sets `raid.flags.bossKilled = true`.
- **Activity radius**: full AI within 1500 px of the player; beyond → cheap update every 0.5 s (wander only). Corpses stay 25 s.
- **Death**: `rollZombieDrop` → `raid.dropItem(inst, x, y)`; `raid.player.stats.kills++`, `raid.stats.killsByType[id]++`;
  `raid.addXp(type.xp)`; `raid.events.emit('kill', {zombie})`; blood fx; audio.
- **Spawn director** (in ZombieAI.update): every 8 s, if alive zombies within 1200 px of the player < 4
  and total alive < maxAlive → `spawnNearPlayer(weighted type, 700, 1100, rng.int(2,4))`.
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
  grantRewards(profile, missionDef, withOptional)   // credits, xp (via profileMgr.addXp), items to stash (overflow → auto-sell), events 'missionComplete'
  // Raid side
  startRaid(raid, missionDefs)               // -> raid.missionStates = [{def, objectives:[{def, progress, done}], done, optionalDone}]
  onEvent(raid, name, data)
     // 'kill' {zombie} ; 'containerOpened' {container} ; 'itemPicked' {inst} ; 'poiReached' {poi} ;
     // 'generatorOn' ; 'bossDead' ; 'extracted' {extractionId, inventory, secure}
  finalizeOnExtract(raid, profile)           // evaluates 'retrieve'/'rescue_medical'/'extract_at'/'collect' with carried items; completes missions whose
                                             // objectives are all done → grantRewards; returns {completed:[def], objectivesDone:n, rewards:{credits,xp,items}}
                                             // raid-scoped progress (kill/search/investigate/generator) for incomplete missions is written back to profile only for 'collect' (nothing else persists)
  finalizeOnDeath(raid, profile)             // nothing persists except picked keys? No: nothing persists.
  hudLines(raid)                             // [{text, done, optional}] for HUD
}
```

Objective completion fires `raid.events.emit('objectiveComplete', {mission, objective})` and
a toast + sound `objective`.

---

## 17. `16_extraction.js` — ExtractionSystem

```js
class ExtractionSystem {
  constructor(raid)
  points                 // raid.world.extractions, each augmented with: active, state ('idle'|'extracting'|'done'|'locked'), progress, hazardTimer, lockReason (German)
  update(dt)
     // active: 'always' → true; 'timed' → raid.time in [window[0], window[1]]; 'key'/'fuel' → player carries requires (inventory or secure); 'power' → raid.flags.generatorOn
     // if player within radius of an active point: state 'extracting', progress += dt (audio extract_tick each second, first entry extract_start, event 'extractionStart')
     // leaving the radius: state 'idle', progress decays at 2×dt; (zombie damage does not cancel, only leaving does)
     // hazard 'horde': every 3 s while extracting spawn 1–2 runners/walkers via zombies.spawnNearPlayer(…, 400, 700)
     // progress ≥ duration → consume required item (key/fuel) → point.state='done' → raid.onExtracted(point)
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
     // loadout from ProfileManager.buildLoadout(profile); creates world via WorldGenerator.generate(mapId, seed, missionDefs),
     // nav, hash, loot, player (at world.playerSpawn), zombies.spawnInitial, weapons, extraction, fx, events,
     // missions.startRaid, time = 0, hour = map.startHour, darkness computed, flags {generatorOn:false, bossKilled:false},
     // camera.snap, camera.setBounds, audio.startAmbient
  map, world, nav, hash, player, zombies, weapons, loot, extraction, fx, events, rng, seed, mapId, missionStates
  time, timeLimit, hour, darkness (0..1; indoor adds), stats { killsByType:{}, shotsFired, shotsHit, containersOpened, damageTaken, distance }
  flags, hazards: [{kind:'toxic'|'fire', x, y, r, duration, timer}], grenades: [], noiseMarkers: [] (for minimap/debug, ttl)
  ended (bool), result (null | RaidResult)
  update(dt)
     // time/hour (hour += dt * 10 / timeLimit), darkness, player.update, weapons.update, zombies.update, extraction.update,
     // hazards (damage player: toxic 3 hp/s + player.toxic = max(player.toxic, 3); fire 8 hp/s), hash rebuild (zombies) each frame,
     // nav.rebuild(player) every 0.4 s, fx.update, camera.follow(player + lookahead toward aim 60 px), audio.setListener,
     // timer warnings at 300 s and 60 s left (toast + 'warning'), time ≥ timeLimit → onTimeout()
  emitNoise(x, y, radius, kind = 'shot')   // zombies.onNoise + noiseMarkers
  addHazard(h)
  findInteractable(x, y, maxDist = 56)     // containers (closed or open), doors (DOOR_CLOSED/OPEN/LOCKED tiles adjacent), floorLoot, pois (generator, investigate), extraction point hints
  interact(it)                             // press action: container → openContainer; door → toggleDoor (locked: needs key → consumes nothing, just requires key_lab_card in inventory → unlock to DOOR_OPEN); loot → pickFloorLoot; extraction → ui toast of promptFor; poi investigate → handled by proximity timer; generator → hold (player.holdProgress), on complete flags.generatorOn, events 'generatorOn', toast 'Generator läuft'
  openContainer(c)                         // loot.rollContainer; c.opened = true; stats.containersOpened++; events 'containerOpened'; audio loot_open; game.ui.openLoot(c)
  toggleDoor(tx, ty, byZombie = false)     // world.setTile; audio; noise 200 (zombie bash 350)
  dropItem(inst, x, y)                     // -> floorLoot entry (scatter 0–20 px); world.floorLoot
  pickFloorLoot(fl)                        // inventory.add; partial → remaining stays; events 'itemPicked'; audio pickup; toast '+3 Verband'
  addXp(n)                                 // raid xp accumulates (applied to profile at end)
  onPlayerDeath()                          // -> end('death')
  onTimeout()                              // toast 'Zeit abgelaufen – Als vermisst gemeldet'; end('mia')
  onExtracted(point)                       // end('extracted', point)
  abort()                                  // from pause menu: end('abort') (same loss as death)
  end(outcome, point = null)               // builds RaidResult (see below), profileMgr.applyRaidResult(result, player), save, audio.stopAmbient, game.onRaidEnded(result)
  pause()/resume()
  debugState()
}
```

`RaidResult`:

```
{ outcome:'extracted'|'death'|'mia'|'abort', mapId, mapName, extractionName|null, durationSec, kills, killsByType,
  shotsFired, shotsHit, accuracy (0..1), damageTaken, containersOpened, distance,
  xpGained, creditsGained, levelBefore, levelAfter, leveledUp,
  itemsKept:[{inst}], itemsLost:[{inst}], itemsSold:[{inst, credits}] (stash overflow), lootValue,
  missionsCompleted:[MissionDef], objectivesDone:n, rewards:{credits, xp, items},
  insuranceReturned:[inst] }
```

---

## 19. `18_profile.js` — ProfileManager (base, economy, loss rules)

```js
const DEFAULT_SETTINGS = { master:0.8, sfx:1.0, music:0.6, screenShake:true, showFps:false, touchControls:'auto' ('auto'|'on'|'off'),
                           quality:'high' ('low'|'medium'|'high'), aimAssist:true (touch only), minimap:true, damageNumbers:true };

class ProfileManager {
  constructor(game)
  profile                                   // null | Profile (see shape below)
  newProfile()                              // creates the start profile (START_CREDITS, stash with starter items, equipment loadout, level 1)
  setProfile(p)
  // progression
  addXp(n)                                  // -> {leveledUp, newLevel, unlockedMaps:[ids]}
  level(), xp(), xpProgress()               // {cur, next, pct}
  unlockedMaps()                            // ids by level or radio upgrade (profile.unlockedMaps cache updated)
  isMapUnlocked(mapId)
  // loadout
  buildLoadout()                            // -> {equipment (Equipment clone), inventory (Inventory from profile.loadout), secure (Inventory secureSlots), hp, hpMax}
  loadoutInventory                          // Inventory sized by equipment.backpackSlots(); items the player takes along (persisted in profile.loadout)
  stash                                     // Inventory (profile.stash)
  equipment                                 // Equipment (profile.equipment)
  secureSlots()                             // SECURE_SLOTS_BASE + defense level
  carryLimit()                              // CARRY_BASE + equipment.carryBonus() + 5*defense level
  hpMax()                                   // 100 + 10*medbay level
  loadoutWarnings()                         // German strings: no weapon, no ammo for weapon, no medical, overweight, hp low
  moveStashToLoadout(uid, count), moveLoadoutToStash(uid, count), equipFromStash(uid) / equipFromLoadout(uid), unequipToStash(slot)
  // economy
  sellPrice(inst, count = inst.count)       // Items.value × ECONOMY.sellMul × (1 + traderLevel×traderSellBonus)
  buyPrice(def)                             // def.value × buyMul × (1 - traderLevel×traderBuyDiscount)
  sell(uid, count)                          // from stash → credits; -> {ok, credits}
  buy(stockIndex, count = 1)                // -> {ok, reason}; stock decrements; item to stash
  restockTrader()                           // builds profile.trader.stock from TRADER_STOCK by trader level; called on return to base
  repairCost(inst)                          // (durabilityMax - durability)/durabilityMax × value × repairCostMul × (1 - 0.15×workshopLevel)
  repair(uid)                               // stash or equipped item → full durability
  canCraft(recipeId) / craft(recipeId)      // -> {ok, reason}; inputs from stash; output to stash
  recipesFor(station)                       // visible recipes with unlocked flag
  healCost() / heal()                       // medbay: credits per missing hp (free at medbay level 3); hp → hpMax
  useMedicalFromStash(uid)                  // heals in base
  canUpgrade(area) / upgrade(area)          // -> {ok, reason}; applies effects (stash.setSlots, etc.)
  // loss rules
  applyRaidResult(result, player)           // mutates profile + result (itemsKept/itemsLost/itemsSold/credits/xp/stats/missions); see rules
  stats                                     // profile.stats
  recordStat(key, n = 1)
  serialize() / static validate(obj)        // validate → {ok, profile, repaired:[msgs]} (fills defaults, drops unknown items)
}
```

`Profile` shape:

```
{ version: SAVE_VERSION, createdAt, name:'Überlebender', credits, xp, level, hp,
  stash: Inventory.serialize(), loadout: Inventory.serialize(), equipment: Equipment.serialize(), secure: Inventory.serialize(),
  upgrades: {stash:0, workshop:0, medbay:0, radio:0, defense:0, trader:0},
  unlockedMaps:['city'],
  missions: { active:[ids], completed:[ids], progress:{ [missionId]: { [objId]: n } } },
  trader: { stock:[{id, price, count}], restocks:0 },
  stats: { raids:0, extractions:0, deaths:0, mia:0, kills:0, killsByType:{}, shotsFired:0, shotsHit:0, lootValue:0,
           creditsEarned:0, creditsSpent:0, missionsCompleted:0, playTime:0, bestRaidValue:0, containersOpened:0, distance:0, itemsCrafted:0, upgradesBought:0 },
  raidInProgress: null | { mapId, missionIds, seed, startedAt },
  lastSaved }
```

**Loss rules** (`applyRaidResult`):

- `extracted`: equipment stays equipped (with its durability); `player.inventory` items → stash
  (`stash.add`); items that do not fit → sold at `overflowSellMul` (listed in `itemsSold`);
  secure items → stash likewise. `xpGained = raid xp + XP_REWARDS.extraction + lootValue × perLootValue`
  + mission xp. `creditsGained = mission credits + sold overflow`. Stats.
- `death` / `mia` / `abort`: equipment weapons/armor/backpack **lost**, backpack inventory **lost**,
  `secure` items **kept** (→ stash). Defense level 3: each lost equipped item has 50 % chance to be
  returned (`insuranceReturned`, back into equipment). `profile.hp = 35` (injured; needs medbay).
  `profile.loadout` becomes empty; `profile.equipment` keeps only insured items. Stats.
- Always: `raidInProgress = null`, `restockTrader()`, `missions` finalize via `game.missions`, `save`.

---

## 20. `19_progression.js` — Progression helpers and achievements (small)

```js
const MAP_UNLOCKS = { city:1, industrial:3, military:5, research:8 };   // mirrors MAPS.unlockLevel
class Progression {
  static levelFromXp(xp), static xpForLevel(l), static progress(xp) -> {level, cur, next, pct}
  static unlockedMapsFor(level, radioLevel) -> ids
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
  hasSave()
  save(profile)                   // -> boolean; writes {version, savedAt, profile}; keeps previous as BACKUP_KEY
  load()                          // -> {ok, profile, repaired:[], error} ; validates via ProfileManager.validate; on corruption tries backup; never throws
  reset()                         // removes KEY and BACKUP_KEY
  saveSettings(settings) / loadSettings() -> settings merged with DEFAULT_SETTINGS
  exportString() -> base64 JSON | null ; importString(str) -> {ok, error}
  markRaidStart(profile, info) / clearRaid(profile)   // sets profile.raidInProgress and saves immediately
}
```

Reload rule: when `continueGame()` finds `profile.raidInProgress`, the raid counts as **MIA**: the
loss rules are applied to `profile.loadout`/`equipment` (secure kept), a notice is shown
(`'Dein letzter Einsatz wurde abgebrochen – Ausrüstung verloren.'`) and the flag is cleared.
Settings autosave on change. Profile autosaves: after new game, raid start, raid end, every
trade/craft/upgrade/hand-in, and manual save button in base.

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
  lightFlashes: []                                // {x,y,r,ttl} for lighting layer (muzzle, explosion)
  screenEffects: { hitMarker, damage, flash (grenade_flash) }
}
```

---

## 23. `22_renderer.js` — Renderer

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

1. Ground/floor tiles from a **chunk cache** (16×16 tiles per offscreen canvas, keyed by `cx,cy`,
   rebuilt when `world.dirtyChunks` has the key). Tile colors from `map.palette`, with
   `tileVariant`-based procedural noise (small rects / dots) for texture. Walls drawn with a top
   face highlight and a 4 px darker bottom edge for a 2.5D feel; windows lighter blue line; doors
   brown (open doors drawn as a thin bar). Toxic tiles pulse greenish (drawn dynamically, not cached).
2. Decals, floor loot (small rarity-colored diamond + glow), containers (box by type; opened = darker,
   lid open), props (car: rounded rect body with windows; tree: canopy circle; barrel: circle; etc.).
3. Hazards (toxic puddles, fire), grenades, zombies (distinct silhouettes: walker olive, runner thin
   and leaning, brute wide with shoulders, screamer with open mouth, toxic green glow, armored grey
   plates, stalker translucent, boss huge with phase color; health bar above damaged zombies; hit flash
   white), player (body circle, head, shoulder pads, weapon line, crouch smaller, legs anim), projectiles
   (tracer lines with alpha), particles.
4. **Roofs**: for each building the player is not inside (`world.buildingAt(player)`): fill footprint
   with `roofColor`, ridge line, darker edge, name label when zoom ≥ 0.9 and building ≥ 8 tiles wide
   (small, semi-transparent). Buildings the player is inside: no roof (interior visible).
5. **Lighting overlay** (offscreen canvas, viewport-sized): fill with
   `rgba(5,8,14, darkness)` where `darkness = clamp(raid.darkness, 0, 0.92)`; then
   `destination-out` radial gradients: player ambient 90 px (weak), flashlight cone (60°, 380 px,
   when `player.flashlightOn`, using a clipped wedge gradient), `world.lights` in view (flicker),
   `fx.lightFlashes`, fire hazards, extraction points active (green tint handled by drawing colored
   glow *under* the overlay). Skip the overlay when `darkness < 0.05`.
   Indoor darkness: tiles inside buildings add 0.35 to local darkness (draw building footprints with
   additional alpha onto the overlay before cutting lights).
6. Fog: when `map.palette.fog` and `settings.quality !== 'low'`: 2–3 slowly drifting large
   semi-transparent noise blobs (pre-rendered canvas) at low alpha.
7. Screen effects: damage vignette (red radial, `fx.screenEffects.damage`), hit marker (4 small
   lines at screen center), flashbang white, low-hp pulse, interaction highlight ring around
   `player.interactTarget`, extraction zone circle (dashed, green when active, grey otherwise, with
   progress arc while extracting), POI markers, off-screen mission/extraction direction arrows at
   the viewport edge (yellow mission, green extraction).
8. Debug overlay when `game.settings.showFps`: FPS, entity counts, draw calls estimate.

---

## 24. `23_ui.js` — UIManager (DOM) and `src/style.css`

The template provides root elements: `<canvas id="game">`, `<div id="hud">`, `<div id="ui">`,
`<div id="mobile">`, `<div id="toasts">`, `<div id="modal">`, `<div id="errbar">`. UIManager builds
all content with DOM APIs / `innerHTML` templates (escape user-influenced strings — there are none
except the player name).

```js
class UIManager {
  constructor(game)
  init()                                 // builds static HUD/mobile controls, binds global keys (Escape handled via input), settings widgets
  showScreen(name, data = {})            // hides others; names below; sets game.input.setEnabled(name === null)
  closeScreen()                          // back to previous context (raid HUD or base)
  currentScreen
  toast(text, kind = 'info' | 'success' | 'warning' | 'danger', ms = 2600)
  confirm(text, {ok = 'Ja', cancel = 'Abbrechen', danger = false})   // -> Promise<boolean> (also keyboard: Enter/Escape)
  alert(text, title)                                                // -> Promise<void>
  updateHud(raid, dt)                    // throttle text to 10 Hz; bars each frame
  openLoot(container)                    // raid: shows container panel next to inventory (screen 'loot')
  openInventory()                        // raid: screen 'inventory' (Tab)
  openMap()                              // raid: screen 'map' (M) — uses renderer.renderFullMap
  refresh()                              // re-render the current screen from state (after any model change)
  setTouchVisible(bool)
  onResize()
  // Inventory widgets (shared by stash, loadout, raid inventory, loot, trader):
  buildGrid(inventory, opts)             // {id, title, onSelect, onMove(fromInv, fromIdx, toInv, toIdx), onContext, readonly, highlightCat}
  // Drag & drop with pointer events between grids and equipment slots; click-select then click-target also works (touch friendly);
  // right click / long-press → context menu: Ausrüsten / Ablegen / Benutzen / Teilen / Verkaufen / Reparieren / Ins Lager / In den Rucksack depending on context.
  // Tooltip on hover/selection: name (rarity color), category, rarity, weight, value, durability bar, stats lines (Items.describe), desc.
}
```

Screens (`showScreen` names): `main`, `base`, `stash` (Lager + Ausrüstung/Loadout + equipment
slots + loadout warnings), `armory` (Waffenwerkstatt: repair, weapon/ammo recipes, upgrade), `medbay`
(Krankenstation: heal, med recipes, upgrade), `workshop` (Werkstatt: material recipes, upgrade),
`radio` (Funkstation: available / active / completed missions; accept, abandon, hand-in; upgrade),
`defense` (Verteidigungsanlage: upgrades list, secure container, insurance), `trader` (Händler:
buy table with stock & price, sell panel from stash), `missionSelect` (Einsatz planen: map cards —
lock status, difficulty skulls, duration, description, extraction list; active missions for the
map; loadout warnings; seed field optional; 'Einsatz starten'), `inventory` (raid), `loot`
(raid), `map` (raid), `pause`, `settings` (volumes, shake, fps, touch controls, quality, damage
numbers, Steuerung übersicht, Spielstand: speichern / exportieren / importieren / zurücksetzen mit Bestätigung),
`result` (Raid-Ergebnis: outcome, time, kills, accuracy, loot list kept/lost/sold, xp bar, missions,
level-up), `death` (Todesbildschirm: cause, what was lost, insurance), `stats` (statistics +
achievements), `credits` (Info: controls + about).

HUD (`#hud`): top-left: HP bar (red), stamina bar (yellow), armor chips (body/head with durability),
status icons (Blutung, Vergiftet, Hunger, Durst, Überladen); top-center: raid timer and clock;
top-right: minimap canvas (`#minimap`, 180×180) with map name; bottom-right: weapon panel (name, mag/
reserve, fire mode, durability, slots 1–5 as small chips with active highlight); bottom-left:
objectives list (done ✓, optional ◇) and extraction status line; bottom-center: interaction prompt
(`E – Kiste durchsuchen`, with hold progress bar for generator), item-use channel bar; center:
crosshair (follows mouse; dot when touch), boss bar (top, when `raid.zombies.boss` alive);
weight indicator; damage vignette and low-hp pulse via CSS classes on `#hud`.

Mobile (`#mobile`): left stick (move), right stick (aim; pushed > 0.75 fires when
`settings.aimAssist`), buttons: `E`, `R`, `Shift` (toggle sprint), `C`, `F`, `Tab`, `M`, `G`,
`Q` (quick med), `II` (pause), weapon slot chips. Visible only when `input.touchMode`. Styled
semi-transparent, min 56 px touch targets, landscape optimized; portrait shows a rotate hint.

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
  rng, settings, save, audio, input, camera, renderer, ui, profileMgr, missions, raid = null
  state ('main'|'base'|'raid'|'result'), paused, auto = true (rAF-driven updates), fps
  init()                          // create subsystems in order: save → settings → audio → input → camera → renderer → profileMgr → missions → ui; load settings; ui.showScreen('main'); start loop; resize listener; first-gesture audio.unlock
  loop(ts)                        // rAF; accumulator with FIXED_DT (max 5 steps/frame); update(FIXED_DT) when state==='raid' && !paused && auto; render; input.endFrame(); fps
  step(dt = FIXED_DT, n = 1)      // synchronous updates (tests/debug) — works even when auto === false
  update(dt)                      // raid.update(dt); ui.updateHud; settings-dependent things; playTime stat
  render(dt)                      // renderer.render(raid) or renderMenuBackground
  newGame({confirm = true})       // if hasSave → ui.confirm overwrite; profileMgr.newProfile(); save; enterBase(); -> Promise<boolean>
  continueGame()                  // save.load; MIA rule if raidInProgress; enterBase(); -> {ok, repaired}
  enterBase()                     // state 'base'; raid = null; profileMgr.restockTrader() only if needed; ui.showScreen('base'); autosave
  startRaid(mapId, {missionIds = [], seed} = {})   // validates unlock + loadout (warns but allows), seed default rng.int; save.markRaidStart; raid = new RaidManager(this); raid.start(...); state 'raid'; ui.showScreen(null)
  onRaidEnded(result)             // state 'result'; ui.showScreen(result.outcome === 'extracted' ? 'result' : 'death', {result}); save
  pauseRaid()/resumeRaid()/togglePause()
  abortRaid()                     // confirm → raid.abort()
  returnToMain()                  // from base or result; save
  saveNow()                       // manual save; toast
  resetSave()                     // confirm → save.reset(); state main
  applySettings(partial)          // merges, saves, applies (audio volumes, touch mode, quality)
  onResize()
  debugApi()                      // -> window.DZ object (§26)
}
```

Keyboard handling in raid (done in `Game.update` via `input.pressed`): `pause` → toggle pause
screen (or close any open raid screen first); `inventory` → toggle inventory; `map` → toggle map.
While a raid screen is open the player does not receive input (`input.setEnabled(false)`), the
simulation **continues** (Tarkov-like: looting is risky) — except `pause`.

---

## 26. `25_main.js` and debug API `window.DZ`

Boot: on `DOMContentLoaded` create `new Game(document.getElementById('game'))`, `game.init()`,
`window.DZ = game.debugApi()`. Global `error` / `unhandledrejection` handlers → `Log.error` +
`#errbar` text (dismissible). `#errbar` is hidden by default.

```js
window.DZ = {
  version: GAME_VERSION, game,
  state: () => game.state,
  errors: Log.errors,
  newGame: () => game.newGame({confirm:false}),            // Promise<boolean>
  continueGame: () => game.continueGame(),
  toBase: () => game.enterBase(),
  startRaid: (mapId = 'city', opts = {}) => game.startRaid(mapId, opts),   // opts.seed, opts.missionIds; -> raid
  raid: () => game.raid, player: () => game.raid?.player, world: () => game.raid?.world, zombies: () => game.raid?.zombies.zombies,
  profile: () => game.profileMgr.profile,
  setAuto: (b) => { game.auto = b; },                       // stop rAF-driven simulation (render keeps running)
  step: (dt = FIXED_DT, n = 1) => game.step(dt, n),
  key: (code, down) => game.input.debugKey(code, down),      // InputManager must implement debugKey(code, down) (same path as real keydown/keyup)
  mouse: (x, y, down) => game.input.debugMouse(x, y, down),  // screen coords; down optional
  aimAt: (wx, wy) => game.input.debugAimWorld(wx, wy),       // sets mouse to the screen position of a world point
  teleport: (x, y) => { p.x = x; p.y = y; camera.snap },
  giveItem: (id, count = 1) => inventory.add(Items.create(id, count)),
  giveStash: (id, count = 1) => stash.add(...),
  giveCredits: (n),
  spawnZombie: (type, x, y) => raid.zombies.spawn(type, x, y),
  killAll: () => kills all zombies (no drops),
  god: (b) => game.raid.player.god = b (takeDamage ignored when god),
  extractNow: () => completes current/first extraction immediately (raid.onExtracted(point)),
  die: () => game.raid.player.die(),
  pathExists: (x0, y0, x1, y1) => !!raid.nav.findPath(...),
  nearest: (kind) => nearest interactable/extraction/container position for the player: {x,y,ref},
  validateWorld: (mapId, seed) => WorldGenerator.validate(WorldGenerator.generate(mapId, seed)),
  save: () => game.save.save(profile), load: () => game.save.load(), reset: () => game.save.reset(),
  ui: game.ui, click: (selector) => document.querySelector(selector)?.click(),
  screen: () => game.ui.currentScreen,
  log: Log,
};
```

`DZ.step` must run the full update including `ui.updateHud` and must not require rAF.
`DZ.key('KeyW', true)` followed by `DZ.step(1/60, 60)` must move the player north.

---

## 27. Events on `raid.events`

`kill {zombie}`, `playerHit {amount}`, `containerOpened {container}`, `itemPicked {inst}`,
`doorToggled {tx,ty,open}`, `noise {x,y,radius,kind}`, `extractionStart {point}`,
`extractionCancel {point}`, `extractionDone {point}`, `objectiveComplete {mission, objective}`,
`missionComplete {mission}`, `generatorOn`, `poiReached {poi}`, `boss {hp,hpMax,phase,name}`,
`bossDead {zombie}`, `levelUp {level}`, `toast {text, kind}`, `raidEnd {result}`.

`MissionSystem.onEvent` subscribes in `startRaid`. `UIManager` subscribes for toasts/boss bar in
`Game.startRaid` (via `raid.events`), unsubscribing on raid end (`events.clear()` in `RaidManager.end`).

---

## 28. Quality bar and test hooks

- `index.html` must load with **zero console errors** (`pageerror`, `console.error`), start a new
  game, enter the base, start a raid on each map with seeds 1..5, simulate 600 steps, open/close
  every screen, extract, die, save and reload — all driven through `window.DZ` by Playwright tests
  in `deadzone/tests/`.
- World validation must pass for every map with seeds 1..20.
- Pure logic (RNG, Inventory, Equipment, Loot, Economy, Progression, SaveSystem.validate, World
  validation) is unit-tested in Node by loading the concatenated bundle in a `vm` context with a
  minimal DOM stub (`deadzone/tests/node_env.mjs` provided by the test author) — therefore pure
  modules must not touch `document`/`window` at class-definition time.

---

## 29. Stable `data-action` attributes for UI buttons (test contract)

Every UI button carries `data-action="<name>"` so tests can click it. Required names:
`new-game, continue, settings, stats, credits, main-menu, to-base, start-raid, plan-raid, base-stash, base-armory,
base-medbay, base-workshop, base-radio, base-defense, base-trader, take-all, close, resume, abort-raid, save,
reset-save, buy, sell, upgrade, craft, repair, heal, accept-mission, abandon-mission, hand-in, equip, unequip,
to-stash, to-loadout, drop, use, split, sort, select-map, export-save, import-save, back`.
`UIManager.showScreen(null)` closes all screens (raid HUD only); `currentScreen` is `null` then.
`Game.resumeRaid()` closes the pause screen and unpauses.
