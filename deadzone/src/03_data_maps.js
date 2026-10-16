// 03_data_maps.js — map definitions (SPEC §4).
// Public API:
//   MAPS              { city, industrial, military, research } (every key of SPEC §4 on every map)
//   MAP_LIST          Object.values(MAPS)
//   MAP_ORDER         ['city','industrial','military','research']
//   CONTAINER_NAMES   container type -> German name (all 12 container types of SPEC §4)
//   BUILDING_NAMES    building type -> German display name (all 20 building types of SPEC §4)
// Dependencies: none at definition time (zombie ids from 02_data_zombies.js, item ids from 01_data_items.js).
//
// Building entry shape: { type, count:[min,max], w:[min,max], h:[min,max], lootTier,
//                         containers:[containerType...], containerCount:[min,max] }
//
// Decisions where the SPEC is silent:
// - `containers` lists the container types a building may hold; duplicates are not used — the
//   generator picks from the list (military/lab buildings already list their special containers).
// - The research boss hall (≥ 20×16, locked door needing key_lab_card) is created by the generator
//   from the layout's `bossArena`; it is NOT part of `buildings`. The small `bunker` entry on
//   research is the separate shelter building.
// - `lights`: 'street' (city), 'industrial' (sodium yard lamps), 'floodlight' (military perimeter),
//   'campus' (path lamps). Generators treating unknown values like 'street' remain correct.
// - Every extraction carries all keys { id, name, kind, requires, duration, window, hazard }
//   (null where not applicable). Kinds used: always, timed, key, fuel, power.
// - lootTierBase: city 1, industrial 2, military 3, research 3 (container tier =
//   lootTierBase + building.lootTier - 1, clamped 1..5).

const MAPS = {
  city: {
    id: 'city', name: 'Verlassene Stadt', short: 'Stadt',
    desc: 'Die Innenstadt wurde bei der Evakuierung aufgegeben. Zwischen ausgebrannten Autos und verbarrikadierten Läden warten Vorräte – und die Bewohner, die nie gegangen sind.',
    size: { w: 150, h: 150 }, unlockLevel: 1, radioUnlock: 0, difficulty: 1, raidDuration: 1500, startHour: 17,
    palette: {
      ground: '#3a3d3f', road: '#2b2d30', roadLine: '#8a7f3f', grass: '#2f4a2c',
      wallA: '#6b625a', wallB: '#57534f', roofA: '#5a3b32', roofB: '#3f4852', roofC: '#6a5a45',
      floor: '#4a4440', water: '#1f3340', fog: 'rgba(20,24,30,0.35)', ambient: 0.9,
    },
    layout: 'city',
    buildings: [
      { type: 'house', count: [18, 24], w: [5, 8], h: [5, 8], lootTier: 1,
        containers: ['crate', 'fridge', 'desk', 'body'], containerCount: [2, 4] },
      { type: 'apartment', count: [4, 6], w: [8, 12], h: [8, 12], lootTier: 2,
        containers: ['fridge', 'desk', 'locker', 'safe', 'body'], containerCount: [3, 5] },
      { type: 'shop', count: [5, 8], w: [6, 9], h: [5, 8], lootTier: 1,
        containers: ['crate', 'desk', 'locker'], containerCount: [2, 3] },
      { type: 'supermarket', count: [1, 1], w: [12, 16], h: [10, 14], lootTier: 2,
        containers: ['crate', 'fridge', 'locker', 'desk'], containerCount: [5, 8] },
      { type: 'pharmacy', count: [1, 2], w: [7, 10], h: [6, 9], lootTier: 3,
        containers: ['medcabinet', 'desk'], containerCount: [3, 5] },
      { type: 'garage', count: [2, 4], w: [7, 10], h: [6, 8], lootTier: 1,
        containers: ['toolbox', 'crate', 'locker'], containerCount: [2, 4] },
      { type: 'office', count: [2, 3], w: [9, 12], h: [8, 11], lootTier: 2,
        containers: ['desk', 'safe', 'locker', 'server_rack'], containerCount: [3, 5] },
      { type: 'warehouse', count: [1, 1], w: [12, 16], h: [10, 13], lootTier: 2,
        containers: ['crate', 'toolbox', 'locker'], containerCount: [4, 6] },
      { type: 'medical', count: [1, 1], w: [10, 14], h: [9, 12], lootTier: 3,
        containers: ['medcabinet', 'desk', 'locker', 'body'], containerCount: [3, 5] },
    ],
    props: { car: 30, dumpster: 12, bench: 10, tree: 40, barrel: 10, barricade: 14 },
    zombies: { count: 70, weights: { walker: 0.6, runner: 0.3, screamer: 0.07, stalker: 0.03 }, maxAlive: 90 },
    boss: null, toxicZones: 0,
    extractions: [
      { id: 'city_edge', name: 'Evakuierungszone Stadtrand', kind: 'always', requires: null, duration: 10, window: null, hazard: null },
      { id: 'city_tunnel', name: 'Versorgungstunnel', kind: 'key', requires: 'key_city_tunnel', duration: 6, window: null, hazard: null },
      { id: 'city_heli', name: 'Hubschrauber Dachlandeplatz', kind: 'timed', requires: null, duration: 12, window: [600, 900], hazard: 'horde' },
    ],
    lootTierBase: 1, lights: 'street',
  },

  industrial: {
    id: 'industrial', name: 'Industriegebiet Nord', short: 'Industrie',
    desc: 'Rostende Hallen, geborstene Tanks und giftige Pfützen. Im Schichtbetrieb sind die Arbeiter einfach weitergelaufen – nur nicht mehr nach Hause.',
    size: { w: 140, h: 140 }, unlockLevel: 3, radioUnlock: 1, difficulty: 2, raidDuration: 1500, startHour: 20,
    palette: {
      ground: '#3b3730', road: '#2e2b27', roadLine: '#9a7a2a', grass: '#34402a',
      wallA: '#6e5844', wallB: '#5c5e60', roofA: '#4d4f52', roofB: '#6b4a35', roofC: '#55603f',
      floor: '#47423a', water: '#2b3a2a', fog: 'rgba(48,42,26,0.32)', ambient: 0.8,
    },
    layout: 'industrial',
    buildings: [
      { type: 'factory', count: [3, 4], w: [14, 20], h: [14, 18], lootTier: 2,
        containers: ['crate', 'toolbox', 'locker', 'body'], containerCount: [5, 8] },
      { type: 'warehouse', count: [4, 5], w: [14, 18], h: [12, 15], lootTier: 1,
        containers: ['crate', 'toolbox', 'locker'], containerCount: [4, 7] },
      { type: 'workshop', count: [4, 6], w: [8, 11], h: [7, 10], lootTier: 2,
        containers: ['toolbox', 'crate', 'locker'], containerCount: [2, 4] },
      { type: 'storage', count: [4, 7], w: [6, 9], h: [6, 8], lootTier: 1,
        containers: ['crate', 'locker'], containerCount: [2, 3] },
      { type: 'office', count: [2, 3], w: [9, 12], h: [8, 10], lootTier: 2,
        containers: ['desk', 'safe', 'server_rack', 'locker'], containerCount: [3, 5] },
      { type: 'garage', count: [2, 3], w: [8, 11], h: [7, 9], lootTier: 1,
        containers: ['toolbox', 'crate'], containerCount: [2, 3] },
      { type: 'medical', count: [1, 1], w: [7, 9], h: [6, 8], lootTier: 2,
        containers: ['medcabinet', 'locker', 'body'], containerCount: [2, 3] },
      { type: 'lab', count: [1, 1], w: [9, 12], h: [8, 10], lootTier: 3,
        containers: ['lab_cabinet', 'desk', 'medcabinet'], containerCount: [3, 4] },
    ],
    props: { tank: 14, pipe: 18, barrel: 24, pallet: 20, truck: 8, car: 8, dumpster: 10, crate: 16, barricade: 8, tree: 10 },
    zombies: { count: 65, weights: { walker: 0.45, runner: 0.2, toxic: 0.2, stalker: 0.1, screamer: 0.05 }, maxAlive: 90 },
    boss: null, toxicZones: 4,
    extractions: [
      { id: 'ind_rail', name: 'Gleisanschluss', kind: 'always', requires: null, duration: 10, window: null, hazard: null },
      { id: 'ind_truck', name: 'Lastwagen (Treibstoff nötig)', kind: 'fuel', requires: 'mat_fuel', duration: 8, window: null, hazard: null },
      { id: 'ind_elevator', name: 'Lastenaufzug', kind: 'key', requires: 'key_industrial_elevator', duration: 5, window: null, hazard: null },
    ],
    lootTierBase: 2, lights: 'industrial',
  },

  military: {
    id: 'military', name: 'Militärbasis Falkenhorst', short: 'Militär',
    desc: 'Hier sollte die Seuche aufgehalten werden. Sandsäcke, Wachtürme und Waffenkammern zeugen davon – und die gepanzerten Toten, die noch immer Wache stehen.',
    size: { w: 130, h: 130 }, unlockLevel: 5, radioUnlock: 2, difficulty: 3, raidDuration: 1800, startHour: 5,
    palette: {
      ground: '#3d4034', road: '#33352e', roadLine: '#b8b090', grass: '#3a4a2a',
      wallA: '#5f6450', wallB: '#6a6a62', roofA: '#4a5238', roofB: '#565a4e', roofC: '#3e4636',
      floor: '#4b4a40', water: '#25343a', fog: 'rgba(70,72,64,0.30)', ambient: 0.85,
    },
    layout: 'compound',
    buildings: [
      { type: 'barracks', count: [5, 7], w: [12, 16], h: [7, 9], lootTier: 1,
        containers: ['locker', 'military_crate', 'desk', 'body'], containerCount: [3, 5] },
      { type: 'armory', count: [1, 2], w: [8, 11], h: [7, 9], lootTier: 3,
        containers: ['weapon_rack', 'military_crate', 'safe'], containerCount: [3, 5] },
      { type: 'warehouse', count: [2, 4], w: [12, 16], h: [10, 14], lootTier: 1,
        containers: ['military_crate', 'crate', 'toolbox'], containerCount: [4, 6] },
      { type: 'checkpoint', count: [2, 4], w: [5, 7], h: [5, 6], lootTier: 1,
        containers: ['military_crate', 'desk', 'body'], containerCount: [1, 3] },
      { type: 'hq', count: [1, 1], w: [12, 16], h: [10, 13], lootTier: 2,
        containers: ['desk', 'safe', 'server_rack', 'locker'], containerCount: [4, 6] },
      { type: 'medical', count: [1, 1], w: [10, 13], h: [8, 10], lootTier: 2,
        containers: ['medcabinet', 'locker', 'body'], containerCount: [3, 5] },
      { type: 'garage', count: [2, 3], w: [10, 14], h: [8, 10], lootTier: 1,
        containers: ['toolbox', 'crate', 'military_crate'], containerCount: [2, 4] },
      { type: 'storage', count: [2, 4], w: [6, 8], h: [6, 8], lootTier: 1,
        containers: ['military_crate', 'crate'], containerCount: [2, 3] },
      { type: 'bunker', count: [1, 2], w: [8, 10], h: [7, 9], lootTier: 3,
        containers: ['military_crate', 'weapon_rack', 'safe'], containerCount: [2, 4] },
    ],
    props: { sandbag: 30, barricade: 16, tower: 6, truck: 10, car: 6, crate: 14, barrel: 12, antenna: 4, tree: 20, pallet: 8 },
    zombies: { count: 60, weights: { walker: 0.35, runner: 0.2, armored: 0.25, brute: 0.15, screamer: 0.05 }, maxAlive: 90 },
    boss: null, toxicZones: 0,
    extractions: [
      { id: 'mil_gate', name: 'Bewachtes Tor', kind: 'always', requires: null, duration: 12, window: null, hazard: null },
      { id: 'mil_heli', name: 'Helikopterlandeplatz', kind: 'timed', requires: null, duration: 10, window: [300, 700], hazard: 'horde' },
      { id: 'mil_bunker', name: 'Bunkerausgang', kind: 'key', requires: 'key_military_gate', duration: 6, window: null, hazard: null },
    ],
    lootTierBase: 3, lights: 'floodlight',
  },

  research: {
    id: 'research', name: 'Forschungsanlage Helix', short: 'Forschung',
    desc: 'In den sterilen Laboren unter dem Campus begann alles. Die Notbeleuchtung flackert noch – und tief unten wartet etwas, das einmal ein Mensch war.',
    size: { w: 120, h: 120 }, unlockLevel: 8, radioUnlock: 3, difficulty: 4, raidDuration: 1800, startHour: 22,
    palette: {
      ground: '#2f3638', road: '#262b2e', roadLine: '#6fa8b0', grass: '#26402f',
      wallA: '#8a9496', wallB: '#5e6a70', roofA: '#3c4a52', roofB: '#56636b', roofC: '#2f3c44',
      floor: '#4a5254', water: '#183038', fog: 'rgba(30,62,52,0.34)', ambient: 0.75,
    },
    layout: 'campus',
    buildings: [
      { type: 'lab', count: [4, 6], w: [10, 14], h: [9, 12], lootTier: 2,
        containers: ['lab_cabinet', 'desk', 'medcabinet', 'server_rack'], containerCount: [3, 5] },
      { type: 'office', count: [2, 3], w: [9, 12], h: [8, 10], lootTier: 1,
        containers: ['desk', 'safe', 'locker'], containerCount: [3, 4] },
      { type: 'security', count: [1, 2], w: [8, 10], h: [7, 9], lootTier: 2,
        containers: ['locker', 'weapon_rack', 'desk', 'safe'], containerCount: [3, 4] },
      { type: 'server', count: [1, 2], w: [8, 11], h: [7, 9], lootTier: 2,
        containers: ['server_rack', 'desk'], containerCount: [3, 5] },
      { type: 'medical', count: [1, 2], w: [9, 12], h: [8, 10], lootTier: 2,
        containers: ['medcabinet', 'lab_cabinet', 'body'], containerCount: [3, 5] },
      { type: 'storage', count: [2, 4], w: [6, 9], h: [6, 8], lootTier: 1,
        containers: ['crate', 'locker', 'lab_cabinet'], containerCount: [2, 3] },
      { type: 'hq', count: [1, 1], w: [12, 15], h: [10, 12], lootTier: 2,
        containers: ['desk', 'safe', 'server_rack'], containerCount: [4, 5] },
      { type: 'bunker', count: [1, 2], w: [8, 11], h: [7, 9], lootTier: 3,
        containers: ['military_crate', 'lab_cabinet', 'safe'], containerCount: [2, 4] },
    ],
    props: { tree: 30, bench: 14, car: 10, barrel: 8, crate: 10, barricade: 10, antenna: 4, tank: 4, pipe: 6 },
    zombies: { count: 60, weights: { walker: 0.3, runner: 0.25, toxic: 0.15, stalker: 0.15, armored: 0.1, screamer: 0.05 }, maxAlive: 80 },
    boss: 'boss', toxicZones: 2,
    extractions: [
      { id: 'res_main', name: 'Haupttor', kind: 'always', requires: null, duration: 12, window: null, hazard: null },
      { id: 'res_emergency', name: 'Notausgang Labor', kind: 'key', requires: 'key_research_exit', duration: 5, window: null, hazard: null },
      { id: 'res_power', name: 'Lüftungsschacht (Strom nötig)', kind: 'power', requires: null, duration: 8, window: null, hazard: null },
    ],
    lootTierBase: 3, lights: 'campus',
  },
};

const MAP_LIST = Object.values(MAPS);
const MAP_ORDER = ['city', 'industrial', 'military', 'research'];

const CONTAINER_NAMES = {
  crate: 'Kiste',
  locker: 'Spind',
  fridge: 'Kühlschrank',
  desk: 'Schreibtisch',
  medcabinet: 'Medikamentenschrank',
  safe: 'Tresor',
  military_crate: 'Militärkiste',
  toolbox: 'Werkzeugkiste',
  weapon_rack: 'Waffenständer',
  server_rack: 'Serverschrank',
  lab_cabinet: 'Laborschrank',
  body: 'Leiche',
};

const BUILDING_NAMES = {
  house: 'Wohnhaus',
  apartment: 'Wohnblock',
  shop: 'Laden',
  supermarket: 'Supermarkt',
  pharmacy: 'Apotheke',
  garage: 'Garage',
  barracks: 'Kaserne',
  armory: 'Waffenkammer',
  warehouse: 'Lagerhalle',
  checkpoint: 'Kontrollpunkt',
  hq: 'Hauptquartier',
  factory: 'Fabrikhalle',
  workshop: 'Werkstatt',
  storage: 'Lagerschuppen',
  office: 'Bürogebäude',
  lab: 'Labor',
  security: 'Sicherheitszentrale',
  medical: 'Krankenstation',
  server: 'Rechenzentrum',
  bunker: 'Bunker',
};
