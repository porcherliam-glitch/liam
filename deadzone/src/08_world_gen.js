// 08_world_gen.js — WorldGenerator: buildings with rooms/doors/windows, containers, props, extractions,
// spawns, POIs, lights, mission placement, connectivity validation + repair, attempt loop (SPEC §9, §0.3).
// Public API: class WorldGenerator { static generate(mapId, seed, missionDefs), static validate(world, missionDefs) }.
// Decisions: building types are matched to layout block zones through WG_ZONE_TYPES; containers get deterministic
//   uids ('c1', 'c2', …); mission items/keys are put into `container.preset` (merged by LootSystem.rollContainer)
//   or `world.floorLoot`; mission placement never changes tiles, so tiles depend only on (mapId, seed).
// Dependencies: 00_util.js, 01–04 data, 08_world.js, 08_world_layouts.js, 10_items_inventory.js (Items, runtime).

const WG_ZONE_TYPES = {
  residential: ['house', 'apartment', 'garage', 'shop'],
  commercial: ['shop', 'supermarket', 'pharmacy', 'garage', 'office', 'apartment'],
  military: ['barracks', 'armory', 'warehouse', 'checkpoint', 'hq', 'storage', 'garage', 'medical', 'bunker', 'office'],
  industrial: ['factory', 'warehouse', 'workshop', 'storage', 'garage', 'office'],
  lab: ['lab', 'security', 'medical', 'server', 'office', 'storage', 'bunker'],
};

const WG_DEFAULT_CONTAINERS = {
  house: ['crate', 'fridge', 'desk', 'locker'], apartment: ['fridge', 'desk', 'locker', 'crate', 'safe'],
  shop: ['crate', 'desk', 'locker'], supermarket: ['crate', 'fridge', 'crate', 'locker'], pharmacy: ['medcabinet', 'medcabinet', 'desk'],
  garage: ['toolbox', 'crate', 'locker'], barracks: ['locker', 'military_crate', 'crate', 'locker'],
  armory: ['weapon_rack', 'military_crate', 'military_crate', 'safe'], warehouse: ['crate', 'crate', 'military_crate', 'toolbox'],
  checkpoint: ['military_crate', 'locker', 'desk'], hq: ['desk', 'safe', 'military_crate', 'locker'], factory: ['toolbox', 'crate', 'locker'],
  workshop: ['toolbox', 'toolbox', 'crate'], storage: ['crate', 'crate', 'locker'], office: ['desk', 'desk', 'safe', 'locker'],
  lab: ['lab_cabinet', 'lab_cabinet', 'medcabinet', 'desk'], security: ['locker', 'safe', 'desk', 'weapon_rack'],
  medical: ['medcabinet', 'medcabinet', 'lab_cabinet'], server: ['server_rack', 'server_rack', 'desk'],
  bunker: ['military_crate', 'weapon_rack', 'safe', 'lab_cabinet'],
};

const WG_FALLBACK_NAMES = {
  house: 'Wohnhaus', apartment: 'Mehrfamilienhaus', shop: 'Laden', supermarket: 'Supermarkt', pharmacy: 'Apotheke',
  garage: 'Werkstatt-Garage', barracks: 'Kaserne', armory: 'Waffenkammer', warehouse: 'Lagerhalle', checkpoint: 'Kontrollpunkt',
  hq: 'Kommandozentrale', factory: 'Fabrikhalle', workshop: 'Werkstatt', storage: 'Lager', office: 'Bürogebäude', lab: 'Labor',
  security: 'Sicherheitszentrale', medical: 'Medizinischer Trakt', server: 'Serverraum', bunker: 'Bunker',
};

const WG_STREETS = ['Lindenstraße', 'Marktplatz', 'Bahnhofstraße', 'Kirchweg', 'Am Park', 'Hafenstraße', 'Schillerstraße', 'Gartenweg',
  'Mühlenweg', 'Rosenstraße', 'Nordring', 'Südallee', 'Ulmenweg', 'Brunnengasse', 'Feldstraße', 'Ahornweg'];

const WG_DEFAULT_BUILDINGS = {
  city: [
    { type: 'house', count: [18, 24], w: [5, 8], h: [5, 8], lootTier: 1 },
    { type: 'apartment', count: [4, 6], w: [8, 12], h: [8, 12], lootTier: 2 },
    { type: 'shop', count: [5, 8], w: [6, 9], h: [6, 8], lootTier: 1 },
    { type: 'supermarket', count: [1, 1], w: [12, 16], h: [10, 14], lootTier: 2 },
    { type: 'pharmacy', count: [1, 2], w: [6, 8], h: [6, 8], lootTier: 3 },
    { type: 'garage', count: [2, 3], w: [6, 8], h: [5, 7], lootTier: 1 },
    { type: 'office', count: [1, 3], w: [8, 11], h: [8, 10], lootTier: 2 },
  ],
  compound: [
    { type: 'barracks', count: [5, 8], w: [10, 14], h: [6, 8], lootTier: 2 },
    { type: 'warehouse', count: [2, 4], w: [12, 16], h: [10, 14], lootTier: 2 },
    { type: 'armory', count: [1, 2], w: [8, 10], h: [7, 9], lootTier: 4 },
    { type: 'checkpoint', count: [2, 3], w: [5, 6], h: [5, 6], lootTier: 2 },
    { type: 'hq', count: [1, 1], w: [12, 14], h: [10, 12], lootTier: 3 },
    { type: 'medical', count: [1, 1], w: [8, 10], h: [7, 9], lootTier: 3 },
    { type: 'garage', count: [1, 3], w: [8, 10], h: [6, 8], lootTier: 2 },
  ],
  industrial: [
    { type: 'factory', count: [3, 5], w: [14, 20], h: [12, 18], lootTier: 2 },
    { type: 'warehouse', count: [3, 5], w: [12, 18], h: [10, 14], lootTier: 2 },
    { type: 'workshop', count: [3, 5], w: [7, 10], h: [6, 9], lootTier: 2 },
    { type: 'storage', count: [3, 6], w: [6, 9], h: [6, 8], lootTier: 1 },
    { type: 'office', count: [1, 2], w: [8, 10], h: [7, 9], lootTier: 2 },
    { type: 'garage', count: [1, 3], w: [7, 9], h: [6, 8], lootTier: 1 },
  ],
  campus: [
    { type: 'lab', count: [5, 8], w: [10, 15], h: [9, 13], lootTier: 3 },
    { type: 'security', count: [1, 2], w: [7, 9], h: [7, 9], lootTier: 3 },
    { type: 'medical', count: [2, 3], w: [8, 12], h: [8, 10], lootTier: 3 },
    { type: 'server', count: [1, 2], w: [7, 9], h: [7, 9], lootTier: 3 },
    { type: 'office', count: [2, 4], w: [8, 11], h: [8, 10], lootTier: 2 },
    { type: 'storage', count: [1, 3], w: [6, 8], h: [6, 8], lootTier: 2 },
  ],
};

const WG_RETRIEVE_HOSTS = {
  mis_datapack: ['office', 'server', 'lab', 'hq', 'security'],
  mis_generator_part: ['workshop', 'factory', 'garage', 'warehouse', 'storage'],
  mis_sample_case: ['lab', 'medical', 'pharmacy', 'bunker'],
};

const WG_LAYOUT_FN = { city: 'wgLayoutCity', compound: 'wgLayoutCompound', industrial: 'wgLayoutIndustrial', campus: 'wgLayoutCampus' };

function wg_range(v, def) {
  if (Array.isArray(v) && v.length >= 2) return [Number(v[0]) || def[0], Number(v[1]) || def[1]];
  if (Number.isFinite(v)) return [v, v];
  return def.slice();
}

function wg_makeItem(id, count) {
  if (typeof Items !== 'undefined' && Items.create) return Items.create(id, count);
  return { uid: Uid.next(), id, count };
}

class WorldGenerator {
  static generate(mapId, seed, missionDefs = []) {
    const map = (typeof MAPS !== 'undefined' && MAPS[mapId]) || (typeof MAPS !== 'undefined' && MAPS.city);
    if (!map) throw new Error('No map definitions loaded');
    const defs = Array.isArray(missionDefs) ? missionDefs.filter(Boolean) : [];
    const baseSeed = (typeof seed === 'number' && Number.isFinite(seed)) ? seed >>> 0 : hashString(String(seed));
    let world = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      world = WorldGenerator._attempt(map, map.id || mapId, baseSeed, (baseSeed + attempt) >>> 0, defs);
      let v = WorldGenerator.validate(world, defs);
      for (let pass = 0; !v.ok && v.unreachable.length && pass < 4; pass++) {
        Log.warn('WorldGenerator: repairing ' + v.unreachable.length + ' unreachable targets (' + mapId + ', seed ' + baseSeed + ')');
        WorldGenerator._repair(world, v.unreachable);
        v = WorldGenerator.validate(world, defs);
      }
      if (v.ok) break;
      if (attempt < 5) Log.warn('WorldGenerator: attempt ' + (attempt + 1) + ' failed for ' + mapId + ' seed ' + baseSeed + ', retrying');
      else Log.warn('WorldGenerator: accepting last attempt with problems for ' + mapId);
    }
    world.seed = baseSeed;
    world.version = 0;
    world.dirtyChunks.clear();
    return world;
  }

  static validate(world, missionDefs = []) {
    const unreachable = [];
    const missingObjectives = [];
    if (!world) return { ok: false, unreachable: [{ kind: 'world', id: null, tx: 0, ty: 0 }], missingObjectives };
    const sx = Math.floor(world.playerSpawn.x / TILE), sy = Math.floor(world.playerSpawn.y / TILE);
    const reach = wgReachability(world, sx, sy);
    const R = (tx, ty) => tx >= 0 && ty >= 0 && tx < world.w && ty < world.h && reach[ty * world.w + tx] === 1;
    const near = (tx, ty) => {
      if (R(tx, ty)) return true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (R(tx + dx, ty + dy)) return true;
      return false;
    };
    if (!world.isWalkable(sx, sy)) unreachable.push({ kind: 'spawn', id: 'spawn', tx: sx, ty: sy });
    for (const e of world.extractions) {
      const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
      if (!R(tx, ty)) unreachable.push({ kind: 'extraction', id: e.id, tx, ty });
    }
    for (const p of world.pois) {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      if (!near(tx, ty)) unreachable.push({ kind: 'poi', id: p.id, tx, ty });
    }
    for (const c of world.containers) {
      if (!near(c.tx, c.ty)) unreachable.push({ kind: 'container', id: c.uid, tx: c.tx, ty: c.ty });
    }
    for (const fl of world.floorLoot) {
      const tx = Math.floor(fl.x / TILE), ty = Math.floor(fl.y / TILE);
      if (!near(tx, ty)) unreachable.push({ kind: 'loot', id: fl.uid, tx, ty });
    }
    for (let i = 0; i < world.zombieSpawns.length; i++) {
      const z = world.zombieSpawns[i];
      const tx = Math.floor(z.x / TILE), ty = Math.floor(z.y / TILE);
      if (!R(tx, ty)) unreachable.push({ kind: 'zombie', id: 'z' + i, tx, ty });
    }
    // mission objectives
    const hasItem = (id) => {
      if (world.floorLoot.some(fl => fl.inst && fl.inst.id === id)) return true;
      for (const c of world.containers) {
        if (c.preset && c.preset.some(i => i && i.id === id)) return true;
        if (Array.isArray(c.items) && c.items.some(i => i && i.id === id)) return true;
      }
      return false;
    };
    for (const m of missionDefs || []) {
      if (!m) continue;
      for (const o of [...(m.objectives || []), ...(m.optional || [])]) {
        let ok = true;
        if (o.type === 'retrieve' || o.type === 'find_key') ok = hasItem(o.target);
        else if (o.type === 'investigate') ok = world.pois.some(p => p.type === o.target);
        else if (o.type === 'generator') ok = world.pois.some(p => p.type === 'generator');
        else if (o.type === 'kill_boss') ok = !!world.bossArena && world.zombieSpawns.some(z => (z.types || []).includes('boss'));
        else if (o.type === 'extract_at') ok = world.extractions.some(e => e.id === o.target);
        if (!ok) missingObjectives.push(o.id);
      }
    }
    return { ok: unreachable.length === 0 && missingObjectives.length === 0, unreachable, missingObjectives };
  }

  // Carves a 4-connected corridor from the nearest reachable tile to each unreachable target.
  static _repair(world, unreachable) {
    const sx = Math.floor(world.playerSpawn.x / TILE), sy = Math.floor(world.playerSpawn.y / TILE);
    for (const u of unreachable.slice(0, 40)) {
      const reach = wgReachability(world, sx, sy);
      let best = -1, bd = Infinity;
      for (let i = 0; i < reach.length; i++) {
        if (!reach[i]) continue;
        const x = i % world.w, y = (i - x) / world.w;
        const d = (x - u.tx) * (x - u.tx) + (y - u.ty) * (y - u.ty);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) continue;
      let x = best % world.w, y = (best - x) / world.w;
      let guard = 0;
      while ((x !== u.tx || y !== u.ty) && guard++ < 600) {
        if (Math.abs(u.tx - x) >= Math.abs(u.ty - y)) x += Math.sign(u.tx - x); else y += Math.sign(u.ty - y);
        if (x < 3 || y < 3 || x >= world.w - 3 || y >= world.h - 3) break;
        const t = world.tile(x, y);
        if (!tileBlocksMove(t) || t === T.DOOR_CLOSED || t === T.DOOR_LOCKED) continue;
        const inside = world.buildingIndexAtTile(x, y) >= 0;
        if (t === T.WALL || t === T.WINDOW) world.put(x, y, T.DOOR_CLOSED);
        else world.put(x, y, inside ? T.FLOOR : T.GROUND);
      }
    }
    // drop props whose tiles were carved away
    world.props = world.props.filter(p => {
      if (!p.solid) return true;
      for (let y = p.ty; y < p.ty + p.h; y++) for (let x = p.tx; x < p.tx + p.w; x++) if (!tileBlocksMove(world.tile(x, y))) return false;
      return true;
    });
  }

  static _attempt(map, mapId, seed, attemptSeed, missionDefs) {
    const rng = new RNG(hashString(mapId + ':' + attemptSeed));
    const size = map.size || { w: 150, h: 150 };
    const world = new World(mapId, seed, size.w || 150, size.h || 150);
    const g = { world, rng, map, missionDefs };
    const fnName = WG_LAYOUT_FN[map.layout] || 'wgLayoutCity';
    const layoutFns = { wgLayoutCity, wgLayoutCompound, wgLayoutIndustrial, wgLayoutCampus };
    const layout = layoutFns[fnName](g);
    const ctx = {
      world, rng, map, layout,
      reserved: new Uint8Array(world.w * world.h),
      containerSeq: 0, propSeq: 0, poiSeq: 0,
      outdoor: [],
    };
    world.blocks = layout.blocks;
    world.roads = layout.roads;
    world.yards = layout.yards;
    WorldGenerator._placeBuildings(ctx);
    if (layout.bossArena) WorldGenerator._bossHall(ctx, layout.bossArena);
    WorldGenerator._layoutFeatures(ctx);
    for (let i = 0; i < world.tileVariant.length; i++) world.tileVariant[i] = rng.int(0, 3);
    WorldGenerator._playerSpawn(ctx);
    WorldGenerator._extractions(ctx);
    WorldGenerator._generator(ctx);
    WorldGenerator._props(ctx);
    WorldGenerator._lights(ctx);
    WorldGenerator._zombies(ctx);
    WorldGenerator._missionPlacement(ctx, rng.fork('missions'), missionDefs);
    return world;
  }

  // ---------------- buildings ----------------
  static _normDefs(map) {
    const raw = Array.isArray(map.buildings) && map.buildings.length ? map.buildings : (WG_DEFAULT_BUILDINGS[map.layout] || WG_DEFAULT_BUILDINGS.city);
    return raw.filter(d => d && d.type).map(d => ({
      type: d.type,
      count: wg_range(d.count, [1, 2]),
      w: wg_range(d.w, [5, 8]).map(v => Math.max(5, v)),
      h: wg_range(d.h, [5, 8]).map(v => Math.max(5, v)),
      lootTier: Number.isFinite(d.lootTier) ? d.lootTier : 1,
      containers: Array.isArray(d.containers) && d.containers.length ? d.containers : (WG_DEFAULT_CONTAINERS[d.type] || ['crate']),
      containerCount: wg_range(d.containerCount, [2, 4]),
      placed: 0,
      target: 0,
    }));
  }

  static _zoneAllows(zone, type) {
    const list = WG_ZONE_TYPES[zone];
    return !!list && list.includes(type);
  }

  static _placeBuildings(ctx) {
    const { rng, layout, map } = ctx;
    const defs = WorldGenerator._normDefs(map);
    for (const d of defs) d.target = rng.int(d.count[0], d.count[1]);
    // every def needs at least one zone that allows it; otherwise allow everywhere
    const zones = new Set(layout.blocks.map(b => b.zone));
    for (const d of defs) d.anyZone = ![...zones].some(z => WorldGenerator._zoneAllows(z, d.type));
    const allows = (zone, d) => d.anyZone || WorldGenerator._zoneAllows(zone, d.type);
    const blocks = rng.shuffle(layout.blocks.slice());
    const large = defs.filter(d => d.w[0] >= 10 || d.h[0] >= 10).sort((a, b) => b.w[0] * b.h[0] - a.w[0] * a.h[0]);
    const freeRects = [];
    for (const block of blocks) {
      let rects = [{ tx: block.tx, ty: block.ty, w: block.w, h: block.h }];
      // one large building per block when a large def still needs placing
      const cand = large.filter(d => d.placed < d.target && allows(block.zone, d) && d.w[0] + 2 <= block.w && d.h[0] + 2 <= block.h);
      const pickLarge = cand.length ? cand.sort((a, b) => (a.placed / a.target) - (b.placed / b.target))[0] : null;
      if (pickLarge && rng.chance(0.85)) {
        const bw = rng.int(pickLarge.w[0], Math.min(pickLarge.w[1], block.w - 2));
        const bh = rng.int(pickLarge.h[0], Math.min(pickLarge.h[1], block.h - 2));
        const lotW = bw + 2, lotH = bh + 2;
        const right = rng.chance(0.5), bottom = rng.chance(0.5);
        const lx = right ? block.tx + block.w - lotW : block.tx;
        const ly = bottom ? block.ty + block.h - lotH : block.ty;
        WorldGenerator._building(ctx, pickLarge, lx + 1, ly + 1, bw, bh, block);
        pickLarge.placed++;
        rects = [];
        // remaining L-shape: a full-height strip beside the lot and a strip above/below it
        const sideW = block.w - lotW;
        if (sideW >= 7) rects.push({ tx: right ? block.tx : block.tx + lotW, ty: block.ty, w: sideW, h: block.h });
        else if (sideW > 0) freeRects.push({ tx: right ? block.tx : block.tx + lotW, ty: block.ty, w: sideW, h: block.h });
        const capH = block.h - lotH;
        if (capH >= 7) rects.push({ tx: lx, ty: bottom ? block.ty : block.ty + lotH, w: lotW, h: capH });
        else if (capH > 0) freeRects.push({ tx: lx, ty: bottom ? block.ty : block.ty + lotH, w: lotW, h: capH });
      }
      for (const r of rects) {
        for (const lot of WorldGenerator._splitLots(rng, r, 0)) {
          const fits = defs.filter(d => allows(block.zone, d) && d.w[0] + 2 <= lot.w && d.h[0] + 2 <= lot.h);
          let total = 0;
          const weights = fits.map(d => {
            let w = d.placed < d.count[0] ? 6 : d.placed < d.target ? 2 : 0;
            // prefer defs whose size range uses the lot well
            if (w > 0 && d.w[1] + 2 < lot.w * 0.55 && d.h[1] + 2 < lot.h * 0.55) w *= 0.5;
            total += w;
            return w;
          });
          if (total <= 0 || (rng.chance(0.12) && defs.every(d => d.placed >= d.count[0]))) { freeRects.push(lot); continue; }
          let roll = rng.next() * total, pick = fits[fits.length - 1];
          for (let i = 0; i < fits.length; i++) { roll -= weights[i]; if (roll < 0) { pick = fits[i]; break; } }
          const bw = rng.int(pick.w[0], Math.max(pick.w[0], Math.min(pick.w[1], lot.w - 2)));
          const bh = rng.int(pick.h[0], Math.max(pick.h[0], Math.min(pick.h[1], lot.h - 2)));
          const ox = lot.tx + 1 + rng.int(0, Math.max(0, lot.w - 2 - bw));
          const oy = lot.ty + 1 + rng.int(0, Math.max(0, lot.h - 2 - bh));
          WorldGenerator._building(ctx, pick, ox, oy, bw, bh, block);
          pick.placed++;
          // the rest of the lot is yard space
          freeRects.push(lot);
        }
      }
    }
    ctx.outdoor.push(...freeRects, ...layout.yards);
  }

  static _splitLots(rng, r, depth) {
    const out = [];
    const canV = r.w >= 14, canH = r.h >= 14;
    const big = r.w > 16 || r.h > 16;
    if (depth < 6 && (canV || canH) && (big || rng.chance(0.55))) {
      const vertical = canV && (!canH || r.w >= r.h);
      if (vertical) {
        const s = rng.int(7, r.w - 7);
        out.push(...WorldGenerator._splitLots(rng, { tx: r.tx, ty: r.ty, w: s, h: r.h }, depth + 1));
        out.push(...WorldGenerator._splitLots(rng, { tx: r.tx + s, ty: r.ty, w: r.w - s, h: r.h }, depth + 1));
      } else {
        const s = rng.int(7, r.h - 7);
        out.push(...WorldGenerator._splitLots(rng, { tx: r.tx, ty: r.ty, w: r.w, h: s }, depth + 1));
        out.push(...WorldGenerator._splitLots(rng, { tx: r.tx, ty: r.ty + s, w: r.w, h: r.h - s }, depth + 1));
      }
    } else if (r.w >= 7 && r.h >= 7) out.push(r);
    return out;
  }

  static _buildingName(ctx, type, index) {
    const names = (typeof BUILDING_NAMES !== 'undefined' && BUILDING_NAMES) || WG_FALLBACK_NAMES;
    const base = names[type] || WG_FALLBACK_NAMES[type] || type;
    if (ctx.map.layout === 'city') return base + ' ' + WG_STREETS[(index * 7 + ctx.world.buildings.length) % WG_STREETS.length];
    const letter = String.fromCharCode(65 + (index % 6));
    return base + ' ' + letter + (1 + Math.floor(index / 6));
  }

  static _building(ctx, def, bx, by, bw, bh, block, opts = {}) {
    const { world, rng, map } = ctx;
    const pal = map.palette || {};
    const id = 'b' + world.buildings.length;
    const typeCount = world.buildings.filter(b => b.type === def.type).length;
    const roofs = [pal.roofA || '#4a3b33', pal.roofB || '#3b3f46', pal.roofC || '#55463a'];
    const walls = [pal.wallA || '#6b6259', pal.wallB || '#5a5550'];
    const b = {
      id, type: def.type, name: opts.name || WorldGenerator._buildingName(ctx, def.type, typeCount), tx: bx, ty: by, w: bw, h: bh,
      roofColor: rng.pick(roofs), wallColor: rng.pick(walls), floorColor: pal.floor || '#4a4440',
      doors: [], rooms: [], lootTier: def.lootTier || 1, locked: !!opts.locked, containers: [], zone: block ? block.zone : null,
    };
    const idx = world.buildings.length;
    world.buildings.push(b);
    world.indexBuilding(b, idx);
    // reserve footprint + 1 ring
    for (let y = by - 1; y <= by + bh; y++) for (let x = bx - 1; x <= bx + bw; x++) if (world.inBounds(x, y)) ctx.reserved[y * world.w + x] = 1;
    // walls + floor
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1;
      world.put(x, y, edge ? T.WALL : T.FLOOR);
    }
    // rooms
    const rooms = [];
    if (opts.singleRoom) rooms.push({ tx: bx + 1, ty: by + 1, w: bw - 2, h: bh - 2 });
    else WorldGenerator._splitRooms(ctx, bx + 1, by + 1, bw - 2, bh - 2, 0, rooms);
    b.rooms = rooms;
    // exterior doors
    const area = bw * bh;
    const nDoors = opts.doors || (area < 60 ? 1 : area < 150 ? 2 : 3);
    WorldGenerator._exteriorDoors(ctx, b, nDoors, opts.locked ? T.DOOR_LOCKED : T.DOOR_CLOSED, block);
    // windows
    if (!opts.noWindows) WorldGenerator._windows(ctx, b);
    // containers
    const tier = clamp((map.lootTierBase || 1) + (b.lootTier || 1) - 1 + (opts.tierBonus || 0), 1, 5);
    let n = rng.int(def.containerCount[0], def.containerCount[1]) + Math.floor(area / 90);
    if (opts.containerCount) n = opts.containerCount;
    WorldGenerator._containers(ctx, b, def.containers, n, tier);
    // ceiling lights in 30 % of the rooms
    for (const r of rooms) {
      if (rng.chance(0.3)) world.lights.push({ x: (r.tx + r.w / 2) * TILE, y: (r.ty + r.h / 2) * TILE, radius: clamp(Math.max(r.w, r.h) * 18, 90, 220), color: '#ffdcae', flicker: rng.chance(0.25), indoor: true });
    }
    return b;
  }

  static _isDoorAt(world, x, y) { return tileIsDoor(world.tile(x, y)); }

  static _splitRooms(ctx, rx, ry, rw, rh, depth, out) {
    const { world, rng } = ctx;
    const vertical = rw >= rh;
    const len = vertical ? rw : rh;
    if (depth >= 3 || len < 7 || (len < 10 && rng.chance(0.45)) || (rw * rh < 30)) { out.push({ tx: rx, ty: ry, w: rw, h: rh }); return; }
    const cands = [];
    for (let p = 3; p <= len - 4; p++) cands.push(p);
    rng.shuffle(cands);
    let pos = -1;
    for (const p of cands) {
      if (vertical) {
        const x = rx + p;
        if (WorldGenerator._isDoorAt(world, x, ry - 1) || WorldGenerator._isDoorAt(world, x, ry + rh)) continue;
      } else {
        const y = ry + p;
        if (WorldGenerator._isDoorAt(world, rx - 1, y) || WorldGenerator._isDoorAt(world, rx + rw, y)) continue;
      }
      pos = p; break;
    }
    if (pos < 0) { out.push({ tx: rx, ty: ry, w: rw, h: rh }); return; }
    if (vertical) {
      const x = rx + pos;
      for (let y = ry; y < ry + rh; y++) world.put(x, y, T.WALL);
      const dy = ry + rng.int(0, rh - 1);
      world.put(x, dy, T.DOOR_CLOSED);
      WorldGenerator._splitRooms(ctx, rx, ry, pos, rh, depth + 1, out);
      WorldGenerator._splitRooms(ctx, x + 1, ry, rw - pos - 1, rh, depth + 1, out);
    } else {
      const y = ry + pos;
      for (let x = rx; x < rx + rw; x++) world.put(x, y, T.WALL);
      const dx = rx + rng.int(0, rw - 1);
      world.put(dx, y, T.DOOR_CLOSED);
      WorldGenerator._splitRooms(ctx, rx, ry, rw, pos, depth + 1, out);
      WorldGenerator._splitRooms(ctx, rx, y + 1, rw, rh - pos - 1, depth + 1, out);
    }
  }

  static _exteriorDoors(ctx, b, n, doorTile, block) {
    const { world, rng } = ctx;
    const sides = [
      { name: 'n', len: b.w, at: i => ({ x: b.tx + i, y: b.ty, ix: b.tx + i, iy: b.ty + 1, ox: b.tx + i, oy: b.ty - 1 }) },
      { name: 's', len: b.w, at: i => ({ x: b.tx + i, y: b.ty + b.h - 1, ix: b.tx + i, iy: b.ty + b.h - 2, ox: b.tx + i, oy: b.ty + b.h }) },
      { name: 'w', len: b.h, at: i => ({ x: b.tx, y: b.ty + i, ix: b.tx + 1, iy: b.ty + i, ox: b.tx - 1, oy: b.ty + i }) },
      { name: 'e', len: b.h, at: i => ({ x: b.tx + b.w - 1, y: b.ty + i, ix: b.tx + b.w - 2, iy: b.ty + i, ox: b.tx + b.w, oy: b.ty + i }) },
    ];
    // prefer the sides closest to the block edge (= toward a road)
    if (block) {
      const dist = { n: b.ty - block.ty, s: block.ty + block.h - (b.ty + b.h), w: b.tx - block.tx, e: block.tx + block.w - (b.tx + b.w) };
      sides.sort((a, c) => dist[a.name] - dist[c.name] + rng.float(-0.5, 0.5));
    } else rng.shuffle(sides);
    let placed = 0;
    for (let s = 0; s < sides.length && placed < n; s++) {
      const side = sides[s];
      const idxs = [];
      for (let i = 2; i <= side.len - 3; i++) idxs.push(i);
      if (!idxs.length) for (let i = 1; i <= side.len - 2; i++) idxs.push(i);
      rng.shuffle(idxs);
      for (const i of idxs) {
        const p = side.at(i);
        if (world.tile(p.ix, p.iy) !== T.FLOOR) continue;
        const ot = world.tile(p.ox, p.oy);
        if (tileBlocksMove(ot) || world.buildingIndexAtTile(p.ox, p.oy) >= 0) continue;
        world.put(p.x, p.y, doorTile);
        b.doors.push({ tx: p.x, ty: p.y, ox: p.ox, oy: p.oy, side: side.name });
        // reserve the approach (2 tiles out + sides) so no prop ever blocks a door
        const dx = p.ox - p.x, dy = p.oy - p.y;
        for (let k = 1; k <= 3; k++) for (let q = -1; q <= 1; q++) {
          const rx = p.x + dx * k + (dy !== 0 ? q : 0), ry = p.y + dy * k + (dx !== 0 ? q : 0);
          if (world.inBounds(rx, ry)) ctx.reserved[ry * world.w + rx] = 2;
        }
        placed++;
        break;
      }
    }
    if (placed === 0) {
      // fallback: force one door on any side with a walkable outside tile
      for (const side of sides) {
        for (let i = 1; i <= side.len - 2 && placed === 0; i++) {
          const p = side.at(i);
          if (tileBlocksMove(world.tile(p.ox, p.oy))) continue;
          world.put(p.x, p.y, doorTile);
          if (world.tile(p.ix, p.iy) !== T.FLOOR) world.put(p.ix, p.iy, T.FLOOR);
          b.doors.push({ tx: p.x, ty: p.y, ox: p.ox, oy: p.oy, side: side.name });
          placed++;
        }
        if (placed) break;
      }
    }
  }

  static _windows(ctx, b) {
    const { world, rng } = ctx;
    const tryWin = (x, y, ix, iy, ox, oy) => {
      if (world.tile(x, y) !== T.WALL || world.tile(ix, iy) !== T.FLOOR) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileIsDoor(world.tile(x + dx, y + dy))) return false;
      if (world.buildingIndexAtTile(ox, oy) >= 0) return false;
      world.put(x, y, T.WINDOW);
      return true;
    };
    for (let i = 2; i < b.w - 2; i += rng.int(3, 5)) {
      tryWin(b.tx + i, b.ty, b.tx + i, b.ty + 1, b.tx + i, b.ty - 1);
      tryWin(b.tx + i, b.ty + b.h - 1, b.tx + i, b.ty + b.h - 2, b.tx + i, b.ty + b.h);
    }
    for (let i = 2; i < b.h - 2; i += rng.int(3, 5)) {
      tryWin(b.tx, b.ty + i, b.tx + 1, b.ty + i, b.tx - 1, b.ty + i);
      tryWin(b.tx + b.w - 1, b.ty + i, b.tx + b.w - 2, b.ty + i, b.tx + b.w, b.ty + i);
    }
  }

  static _containers(ctx, b, types, n, tier) {
    const { world, rng } = ctx;
    const cands = [];
    for (let y = b.ty + 1; y < b.ty + b.h - 1; y++) {
      for (let x = b.tx + 1; x < b.tx + b.w - 1; x++) {
        if (world.tile(x, y) !== T.FLOOR) continue;
        let wall = false, doorNear = false;
        for (let k = 0; k < 4; k++) {
          const t = world.tile(x + NAV_DX[k], y + NAV_DY[k]);
          if (t === T.WALL || t === T.WINDOW) wall = true;
        }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileIsDoor(world.tile(x + dx, y + dy))) doorNear = true;
        if (wall && !doorNear) cands.push({ x, y });
      }
    }
    rng.shuffle(cands);
    const used = new Set();
    let placed = 0;
    for (const c of cands) {
      if (placed >= n) break;
      const key = c.x + ',' + c.y;
      if (used.has(key)) continue;
      // keep containers apart
      let crowded = false;
      for (let dy = -1; dy <= 1 && !crowded; dy++) for (let dx = -1; dx <= 1; dx++) if (used.has((c.x + dx) + ',' + (c.y + dy))) { crowded = true; break; }
      if (crowded) continue;
      used.add(key);
      const type = rng.pick(types) || 'crate';
      const cont = {
        uid: 'c' + (++ctx.containerSeq), type, tx: c.x, ty: c.y, x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE,
        tier, buildingId: b.id, buildingType: b.type, items: null, opened: false, locked: false, preset: [],
      };
      world.containers.push(cont);
      b.containers.push(cont.uid);
      placed++;
    }
  }

  static _bossHall(ctx, arena) {
    const { world, rng, map } = ctx;
    const hw = clamp(arena.w - 4, 20, 30), hh = clamp(arena.h - 4, 16, 22);
    const bx = arena.tx + Math.floor((arena.w - hw) / 2), by = arena.ty + Math.floor((arena.h - hh) / 2);
    const def = { type: 'bunker', lootTier: 3, containers: ['lab_cabinet', 'safe', 'military_crate', 'weapon_rack'], containerCount: [4, 6] };
    const b = WorldGenerator._building(ctx, def, bx, by, hw, hh, { tx: arena.tx, ty: arena.ty, w: arena.w, h: arena.h, zone: 'arena' },
      { singleRoom: true, locked: true, doors: 1, noWindows: true, name: 'Sektor U – Versuchshalle', tierBonus: 1, containerCount: 5 });
    b.hall = true;
    // concrete pillars for cover
    for (let k = 0; k < 6; k++) {
      const x = bx + 3 + rng.int(0, hw - 7), y = by + 3 + rng.int(0, hh - 7);
      if (Math.abs(x - (bx + hw / 2)) < 3 && Math.abs(y - (by + hh / 2)) < 3) continue;
      if (world.tile(x, y) === T.FLOOR && world.tile(x + 1, y) === T.FLOOR) {
        world.put(x, y, T.PROP_SOLID);
        world.props.push({ id: 'p' + (++ctx.propSeq), type: 'pillar', tx: x, ty: y, w: 1, h: 1, rot: 0, color: '#5b6066', solid: true });
      }
    }
    world.bossArena = { x: (bx + hw / 2) * TILE, y: (by + hh / 2) * TILE, r: Math.min(hw, hh) * TILE / 2, buildingId: b.id };
    world.pois.push({ id: 'poi' + (++ctx.poiSeq), type: 'boss_arena', x: world.bossArena.x, y: world.bossArena.y, radius: 64, buildingId: b.id, used: false, timer: 0 });
    const door = b.doors[0];
    if (door) {
      world.pois.push({ id: 'poi' + (++ctx.poiSeq), type: 'lab_entrance', x: (door.ox + 0.5) * TILE, y: (door.oy + 0.5) * TILE, radius: 64, buildingId: b.id, used: false, timer: 0 });
      world.lights.push({ x: (door.ox + 0.5) * TILE, y: (door.oy + 0.5) * TILE, radius: 140, color: '#ff4a3a', flicker: true });
    }
    for (let k = 0; k < 3; k++) world.lights.push({ x: (bx + hw * (k + 1) / 4) * TILE, y: (by + hh / 2) * TILE, radius: 200, color: '#9fd0ff', flicker: k === 1 });
  }

  // decorative features coming from the layout (tank farms, toxic pools, gate checkpoints, plaza benches)
  static _layoutFeatures(ctx) {
    const { world, rng, layout, map } = ctx;
    const sp = layout.special || {};
    if (sp.pools) {
      for (const p of sp.pools) {
        let ok = true;
        for (let y = p.ty - p.r; y <= p.ty + p.r && ok; y++) for (let x = p.tx - p.r; x <= p.tx + p.r; x++) if (world.buildingIndexAtTile(x, y) >= 0) { ok = false; break; }
        if (!ok) continue;
        wgl_blob(world, rng, p.tx, p.ty, p.r, T.TOXIC, [T.GRAVEL, T.GROUND, T.RUBBLE, T.GRASS]);
        world.toxicZones.push({ x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE, r: (p.r + 0.5) * TILE });
      }
    }
    if (map.layout === 'campus' && !sp.pools) {
      const n = Number.isFinite(map.toxicZones) ? map.toxicZones : 0;
      for (let k = 0; k < n; k++) {
        const y = rng.pick(ctx.outdoor);
        if (!y || y.w < 8 || y.h < 8) continue;
        const cx = y.tx + rng.int(3, y.w - 4), cy = y.ty + rng.int(3, y.h - 4);
        wgl_blob(world, rng, cx, cy, 2, T.TOXIC, [T.GRASS, T.GROUND, T.GRAVEL]);
        world.toxicZones.push({ x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, r: 2.5 * TILE });
      }
    }
    if (sp.gates) {
      for (const gte of sp.gates) {
        const horiz = gte.dir === 'n' || gte.dir === 's';
        // sandbag nests either side of each gate
        for (const off of [-3, 5]) {
          const x = horiz ? gte.tx + off : gte.tx + (gte.dir === 'w' ? 1 : -1);
          const y = horiz ? gte.ty + (gte.dir === 'n' ? 1 : -1) : gte.ty + off;
          WorldGenerator._tryProp(ctx, horiz ? 'sandbag' : 'sandbag', x, y, horiz ? 2 : 1, horiz ? 1 : 2, T.PROP_LOW, false);
        }
      }
      const f = sp.fence;
      for (const [x, y] of [[f.x0 + 1, f.y0 + 1], [f.x1 - 2, f.y0 + 1], [f.x0 + 1, f.y1 - 2], [f.x1 - 2, f.y1 - 2]]) {
        WorldGenerator._tryProp(ctx, 'tower', x, y, 2, 2, T.PROP_SOLID, true, true);
        world.lights.push({ x: (x + 1) * TILE, y: (y + 1) * TILE, radius: 240, color: '#fff2c8', flicker: false });
      }
    }
    for (const y of layout.yards) {
      if (y.kind === 'tankfarm') {
        for (let k = 0; k < 5; k++) WorldGenerator._tryProp(ctx, 'tank', y.tx + rng.int(1, y.w - 5), y.ty + rng.int(1, y.h - 5), 3, 3, T.PROP_SOLID, true);
        for (let k = 0; k < 4; k++) {
          const vertical = rng.chance(0.5);
          const len = rng.int(4, 8);
          WorldGenerator._tryProp(ctx, 'pipe', y.tx + rng.int(1, y.w - 2), y.ty + rng.int(1, y.h - 2), vertical ? 1 : len, vertical ? len : 1, T.PROP_LOW, false);
        }
      } else if (y.kind === 'plaza' || y.kind === 'quad') {
        for (let k = 0; k < 6; k++) WorldGenerator._tryProp(ctx, 'bench', y.tx + rng.int(2, y.w - 4), y.ty + rng.int(2, y.h - 3), 2, 1, T.PROP_LOW, false);
      } else if (y.kind === 'parade') {
        WorldGenerator._tryProp(ctx, 'antenna', y.tx + (y.w >> 1), y.ty + (y.h >> 1), 1, 1, T.PROP_SOLID, true);
      }
    }
  }

  // ---------------- spawn / extraction ----------------
  static _edgeSpot(ctx, edge, along) {
    const { world, layout } = ctx;
    const m = Math.max(5, Math.floor((layout.margin || 8) / 2) + 1);
    const W = world.w, H = world.h;
    let tx, ty;
    if (edge === 0) { tx = Math.round(along * W); ty = m; }
    else if (edge === 1) { tx = Math.round(along * W); ty = H - 1 - m; }
    else if (edge === 2) { tx = m; ty = Math.round(along * H); }
    else { tx = W - 1 - m; ty = Math.round(along * H); }
    return { tx: clamp(tx, 4, W - 5), ty: clamp(ty, 4, H - 5) };
  }

  static _nearestWalkable(world, tx, ty, maxR = 8, avoidIndoor = true) {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (!world.isWalkable(x, y)) continue;
        if (avoidIndoor && world.buildingIndexAtTile(x, y) >= 0) continue;
        if (world.tile(x, y) === T.TOXIC) continue;
        return { tx: x, ty: y };
      }
    }
    return null;
  }

  static _playerSpawn(ctx) {
    const { world, rng } = ctx;
    let edge = rng.int(0, 3);
    if (world.bossArena) {
      const ax = world.bossArena.x / world.pixelW, ay = world.bossArena.y / world.pixelH;
      const scores = [ay, 1 - ay, ax, 1 - ax]; // distance of arena to edges n, s, w, e
      edge = scores.indexOf(Math.max(...scores)) === 0 ? 1 : scores.indexOf(Math.max(...scores)) === 1 ? 0 : scores.indexOf(Math.max(...scores)) === 2 ? 3 : 2;
      // choose the edge farthest from the arena: arena near north (ay small) -> spawn south, etc.
      const far = [1 - ay, ay, 1 - ax, ax];
      edge = far.indexOf(Math.max(...far));
      // far[0] = distance from north edge... map to the edge index whose distance to the arena is maximal
      edge = [0, 1, 2, 3].sort((a, b) => WorldGenerator._edgeDist(world, b) - WorldGenerator._edgeDist(world, a))[0];
    }
    const s = WorldGenerator._edgeSpot(ctx, edge, rng.float(0.3, 0.7));
    const p = WorldGenerator._nearestWalkable(world, s.tx, s.ty, 12) || s;
    world.playerSpawn = { x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE, edge };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = p.tx + dx, y = p.ty + dy;
      if (world.inBounds(x, y) && !ctx.reserved[y * world.w + x]) ctx.reserved[y * world.w + x] = 4;
    }
  }

  static _edgeDist(world, edge) {
    const a = world.bossArena;
    if (!a) return 0;
    const ax = a.x / TILE, ay = a.y / TILE;
    return edge === 0 ? ay : edge === 1 ? world.h - ay : edge === 2 ? ax : world.w - ax;
  }

  static _extractions(ctx) {
    const { world, rng, map } = ctx;
    const defs = Array.isArray(map.extractions) ? map.extractions : [];
    const cands = [];
    for (let edge = 0; edge < 4; edge++) {
      for (let a = 0.12; a <= 0.88; a += 0.04) {
        const s = WorldGenerator._edgeSpot(ctx, edge, a);
        const p = WorldGenerator._nearestWalkable(world, s.tx, s.ty, 4);
        if (p) cands.push({ tx: p.tx, ty: p.ty, edge });
      }
    }
    const sp = { tx: world.playerSpawn.x / TILE, ty: world.playerSpawn.y / TILE };
    const diag = Math.hypot(world.w, world.h);
    const chosen = [];
    const order = defs.slice().sort((a, b) => (a.kind === 'always' ? -1 : 0) - (b.kind === 'always' ? -1 : 0));
    for (const def of order) {
      let best = null, bs = -Infinity;
      for (const c of cands) {
        const ds = Math.hypot(c.tx - sp.tx, c.ty - sp.ty);
        let score;
        if (def.kind === 'always') score = ds + rng.float(0, 6);
        else {
          if (ds < diag * 0.3) continue;
          let md = Infinity;
          for (const o of chosen) md = Math.min(md, Math.hypot(c.tx - o.tx, c.ty - o.ty));
          if (md < 30) continue;
          score = Math.min(md, ds) + (chosen.some(o => o.edge === c.edge) ? -20 : 0) + rng.float(0, 8);
        }
        if (score > bs) { bs = score; best = c; }
      }
      if (!best) best = cands.length ? cands[rng.int(0, cands.length - 1)] : { tx: 6, ty: 6, edge: 0 };
      chosen.push({ ...best, def });
    }
    for (const c of chosen) {
      const def = c.def;
      // clear pad
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 6) continue;
        const x = c.tx + dx, y = c.ty + dy;
        if (world.buildingIndexAtTile(x, y) >= 0) continue;
        const t = world.tile(x, y);
        if (t === T.VOID || t === T.FENCE || (t === T.WALL && world.buildingIndexAtTile(x, y) < 0 && (x <= 2 || y <= 2 || x >= world.w - 3 || y >= world.h - 3))) continue;
        world.put(x, y, T.GRAVEL);
      }
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = c.tx + dx, y = c.ty + dy;
        if (world.inBounds(x, y) && !ctx.reserved[y * world.w + x]) ctx.reserved[y * world.w + x] = 3;
      }
      world.extractions.push({
        id: def.id, name: def.name, kind: def.kind || 'always', requires: def.requires || null, duration: def.duration || 10,
        window: def.window || null, hazard: def.hazard || null, x: (c.tx + 0.5) * TILE, y: (c.ty + 0.5) * TILE, radius: 72,
      });
      world.props.push({ id: 'p' + (++ctx.propSeq), type: 'lamp', tx: c.tx + 2, ty: c.ty - 2, w: 1, h: 1, rot: 0, color: '#3ddc84', solid: false, extraction: def.id });
      world.lights.push({ x: (c.tx + 0.5) * TILE, y: (c.ty + 0.5) * TILE, radius: 150, color: '#59ff9c', flicker: false, extraction: def.id });
    }
  }

  static _generator(ctx) {
    const { world, rng } = ctx;
    const prefs = ['warehouse', 'factory', 'hq', 'garage', 'storage', 'workshop', 'security', 'office'];
    const sorted = world.buildings.filter(b => !b.hall).sort((a, b) => {
      const pa = prefs.indexOf(a.type), pb = prefs.indexOf(b.type);
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    });
    const sp = world.playerSpawn;
    for (const b of sorted.slice(0, 12)) {
      // outside tiles adjacent to the wall, away from doors
      const cands = [];
      for (let x = b.tx + 1; x < b.tx + b.w - 1; x++) { cands.push([x, b.ty - 1]); cands.push([x, b.ty + b.h]); }
      for (let y = b.ty + 1; y < b.ty + b.h - 1; y++) { cands.push([b.tx - 1, y]); cands.push([b.tx + b.w, y]); }
      rng.shuffle(cands);
      for (const [x, y] of cands) {
        if (!world.inBounds(x, y)) continue;
        const r = ctx.reserved[y * world.w + x];
        if (r >= 2) continue;
        if (!world.isWalkable(x, y) || world.buildingIndexAtTile(x, y) >= 0) continue;
        // keep both perpendicular neighbours walkable so the 2-tile gap between buildings stays passable
        let open = 0;
        for (let k = 0; k < 8; k++) if (world.isWalkable(x + NAV_DX[k], y + NAV_DY[k])) open++;
        if (open < 5) continue;
        if (Math.hypot(x * TILE - sp.x, y * TILE - sp.y) < 20 * TILE) continue;
        world.put(x, y, T.PROP_SOLID);
        ctx.reserved[y * world.w + x] = 5;
        world.props.push({ id: 'p' + (++ctx.propSeq), type: 'generator', tx: x, ty: y, w: 1, h: 1, rot: 0, color: '#c49a2c', solid: true });
        world.pois.push({ id: 'poi' + (++ctx.poiSeq), type: 'generator', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 64, buildingId: b.id, used: false, timer: 0 });
        world.lights.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 90, color: '#ffb347', flicker: true });
        return;
      }
    }
    // fallback: any open outdoor tile
    for (let k = 0; k < 400; k++) {
      const o = rng.pick(ctx.outdoor);
      if (!o) break;
      const x = o.tx + rng.int(1, Math.max(1, o.w - 2)), y = o.ty + rng.int(1, Math.max(1, o.h - 2));
      if (!world.isWalkable(x, y) || world.buildingIndexAtTile(x, y) >= 0 || ctx.reserved[y * world.w + x]) continue;
      world.put(x, y, T.PROP_SOLID);
      world.props.push({ id: 'p' + (++ctx.propSeq), type: 'generator', tx: x, ty: y, w: 1, h: 1, rot: 0, color: '#c49a2c', solid: true });
      world.pois.push({ id: 'poi' + (++ctx.poiSeq), type: 'generator', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 64, buildingId: null, used: false, timer: 0 });
      return;
    }
  }

  // ---------------- props ----------------
  static _tryProp(ctx, type, tx, ty, w, h, tile, solid, ignoreRing = false, color = null) {
    const { world } = ctx;
    if (tx < 3 || ty < 3 || tx + w > world.w - 3 || ty + h > world.h - 3) return false;
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (ctx.reserved[y * world.w + x]) return false;
      const t = world.tile(x, y);
      if (tileBlocksMove(t) || t === T.TOXIC || t === T.WATER) return false;
      if (world.buildingIndexAtTile(x, y) >= 0) return false;
    }
    if (!ignoreRing) {
      // keep a free ring so props never close a corridor
      for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
        if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
        const t = world.tile(x, y);
        if (t === T.PROP_SOLID || t === T.PROP_LOW || t === T.BARRICADE || t === T.WALL || t === T.WINDOW || tileIsDoor(t)) return false;
      }
    }
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) { world.put(x, y, tile); ctx.reserved[y * world.w + x] = 5; }
    world.props.push({ id: 'p' + (++ctx.propSeq), type, tx, ty, w, h, rot: w > h ? Math.PI / 2 : 0, color, solid });
    return true;
  }

  static _roadSpot(ctx, r, len, across) {
    // returns a spot inside road r away from intersections
    const { world, rng, layout } = ctx;
    const bands = layout.bands;
    for (let k = 0; k < 12; k++) {
      if (r.dir === 'v') {
        const y = r.ty + rng.int(0, Math.max(0, r.h - len));
        if (wgl_inBands(y - 2, bands.y, bands.band) || wgl_inBands(y + len + 1, bands.y, bands.band)) continue;
        const lane = rng.chance(0.5) ? r.tx : r.tx + r.w - across;
        return { tx: lane, ty: y, w: across, h: len };
      }
      const x = r.tx + rng.int(0, Math.max(0, r.w - len));
      if (wgl_inBands(x - 2, bands.x, bands.band) || wgl_inBands(x + len + 1, bands.x, bands.band)) continue;
      const lane = rng.chance(0.5) ? r.ty : r.ty + r.h - across;
      return { tx: x, ty: lane, w: len, h: across };
    }
    return null;
  }

  static _props(ctx) {
    const { world, rng, map, layout } = ctx;
    const props = map.props || {};
    const palette = map.palette || {};
    const carColors = ['#7a2b2b', '#2b4a7a', '#4a4a4a', '#8a8a7a', '#2f5d3a', '#6d5a2a', '#3b3b55'];
    const outdoorSpot = () => {
      const o = rng.pick(ctx.outdoor);
      if (!o) return null;
      return { tx: o.tx + rng.int(0, Math.max(0, o.w - 1)), ty: o.ty + rng.int(0, Math.max(0, o.h - 1)) };
    };
    const marginSpot = () => {
      const m = layout.margin || 8;
      const edge = rng.int(0, 3);
      const a = rng.int(4, (edge < 2 ? world.w : world.h) - 5);
      const d = rng.int(3, m - 2);
      if (edge === 0) return { tx: a, ty: d };
      if (edge === 1) return { tx: a, ty: world.h - 1 - d };
      if (edge === 2) return { tx: d, ty: a };
      return { tx: world.w - 1 - d, ty: a };
    };
    const anySpot = () => (rng.chance(0.7) ? outdoorSpot() : marginSpot());
    const roads = layout.roads || [];
    for (const [type, rawCount] of Object.entries(props)) {
      const count = Math.max(0, Math.round(Number(rawCount) || 0));
      let placed = 0;
      for (let tries = 0; placed < count && tries < count * 25; tries++) {
        let ok = false;
        if (type === 'car' || type === 'truck') {
          const r = rng.pick(roads);
          if (!r) break;
          const len = type === 'car' ? 4 : 5;
          const across = 2;
          if ((r.dir === 'v' ? r.w : r.h) < 3) continue;
          const s = WorldGenerator._roadSpot(ctx, r, len, across);
          if (!s) continue;
          ok = WorldGenerator._tryProp(ctx, type, s.tx, s.ty, s.w, s.h, T.PROP_SOLID, true, false, rng.pick(carColors));
        } else if (type === 'barricade') {
          const r = rng.pick(roads);
          if (!r) break;
          const s = WorldGenerator._roadSpot(ctx, r, 1, 2);
          if (!s) continue;
          ok = WorldGenerator._tryProp(ctx, 'barricade', s.tx, s.ty, r.dir === 'v' ? 2 : 1, r.dir === 'v' ? 1 : 2, T.BARRICADE, true, true, '#6b5a3a');
        } else {
          const s = anySpot();
          if (!s) continue;
          if (type === 'tree') ok = WorldGenerator._tryProp(ctx, 'tree', s.tx, s.ty, 1, 1, T.PROP_SOLID, true, false, palette.grass || '#2f4a2c');
          else if (type === 'dumpster') ok = WorldGenerator._tryProp(ctx, 'dumpster', s.tx, s.ty, 2, 1, T.PROP_SOLID, true, false, '#2f5144');
          else if (type === 'bench') ok = WorldGenerator._tryProp(ctx, 'bench', s.tx, s.ty, 2, 1, T.PROP_LOW, false, false, '#5a4632');
          else if (type === 'barrel') ok = WorldGenerator._tryProp(ctx, 'barrel', s.tx, s.ty, 1, 1, T.PROP_LOW, false, false, rng.pick(['#7a3b22', '#3b5a7a', '#5a6a2a']));
          else if (type === 'crate' || type === 'pallet') ok = WorldGenerator._tryProp(ctx, type, s.tx, s.ty, 1, 1, T.PROP_LOW, false, false, '#7a5f3a');
          else if (type === 'sandbag') ok = WorldGenerator._tryProp(ctx, 'sandbag', s.tx, s.ty, rng.chance(0.5) ? 3 : 1, rng.chance(0.5) ? 1 : 3, T.PROP_LOW, false, false, '#8a7a55');
          else if (type === 'tank') ok = WorldGenerator._tryProp(ctx, 'tank', s.tx, s.ty, 3, 3, T.PROP_SOLID, true, false, '#6a6e72');
          else if (type === 'pipe') { const v = rng.chance(0.5), l = rng.int(3, 7); ok = WorldGenerator._tryProp(ctx, 'pipe', s.tx, s.ty, v ? 1 : l, v ? l : 1, T.PROP_LOW, false, false, '#7a6a5a'); }
          else if (type === 'tower') ok = WorldGenerator._tryProp(ctx, 'tower', s.tx, s.ty, 2, 2, T.PROP_SOLID, true, false, '#5a5040');
          else if (type === 'antenna') ok = WorldGenerator._tryProp(ctx, 'antenna', s.tx, s.ty, 1, 1, T.PROP_SOLID, true, false, '#888');
          else if (type === 'generator') ok = true; // generator handled separately
          else ok = WorldGenerator._tryProp(ctx, type, s.tx, s.ty, 1, 1, T.PROP_LOW, false, false, '#666');
        }
        if (ok) placed++;
      }
    }
    // dead bodies to search ("body" containers) in the streets
    const bodies = map.layout === 'campus' ? 8 : 10;
    for (let k = 0, tries = 0; k < bodies && tries < 200; tries++) {
      const s = anySpot();
      if (!s || !world.isWalkable(s.tx, s.ty) || world.buildingIndexAtTile(s.tx, s.ty) >= 0 || ctx.reserved[s.ty * world.w + s.tx]) continue;
      world.containers.push({
        uid: 'c' + (++ctx.containerSeq), type: 'body', tx: s.tx, ty: s.ty, x: (s.tx + 0.5) * TILE, y: (s.ty + 0.5) * TILE,
        tier: clamp((map.lootTierBase || 1), 1, 5), buildingId: null, buildingType: null, items: null, opened: false, locked: false, preset: [],
      });
      ctx.reserved[s.ty * world.w + s.tx] = 5;
      k++;
    }
  }

  static _lights(ctx) {
    const { world, rng, map, layout } = ctx;
    const street = map.lights !== 'none';
    if (street) {
      for (const r of layout.roads || []) {
        const step = 10;
        if (r.dir === 'v') {
          for (let y = r.ty + 3; y < r.ty + r.h - 2; y += step) {
            const x = r.tx - 1;
            if (!world.isWalkable(x, y)) continue;
            world.props.push({ id: 'p' + (++ctx.propSeq), type: 'lamp', tx: x, ty: y, w: 1, h: 1, rot: 0, color: '#bbb', solid: false });
            if (rng.chance(0.75)) world.lights.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 170, color: map.layout === 'campus' ? '#d6ecff' : '#ffd79a', flicker: rng.chance(0.2) });
          }
        } else {
          for (let x = r.tx + 3; x < r.tx + r.w - 2; x += step) {
            const y = r.ty - 1;
            if (!world.isWalkable(x, y)) continue;
            world.props.push({ id: 'p' + (++ctx.propSeq), type: 'lamp', tx: x, ty: y, w: 1, h: 1, rot: 0, color: '#bbb', solid: false });
            if (rng.chance(0.75)) world.lights.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 170, color: map.layout === 'campus' ? '#d6ecff' : '#ffd79a', flicker: rng.chance(0.2) });
          }
        }
      }
    }
    for (const z of world.toxicZones) world.lights.push({ x: z.x, y: z.y, radius: z.r * 1.6, color: '#7dff5a', flicker: true, toxic: true });
    // bucket lights by chunk for the renderer
    world.lightBuckets = new Map();
    for (const l of world.lights) {
      const k = Math.floor(l.x / (TILE * 16)) + ',' + Math.floor(l.y / (TILE * 16));
      if (!world.lightBuckets.has(k)) world.lightBuckets.set(k, []);
      world.lightBuckets.get(k).push(l);
    }
  }

  // ---------------- zombies ----------------
  static _zombies(ctx) {
    const { world, rng, map } = ctx;
    const zdef = map.zombies || { count: 60, weights: { walker: 1 } };
    const weights = Object.entries(zdef.weights || { walker: 1 }).filter(([t]) => t !== 'boss' && (typeof ZOMBIE_TYPES === 'undefined' || ZOMBIE_TYPES[t])).map(([id, w]) => ({ id, w }));
    if (!weights.length) weights.push({ id: 'walker', w: 1 });
    const sp = world.playerSpawn;
    const minD = 28 * TILE;
    let remaining = Math.max(0, zdef.count | 0);
    const floorTiles = [];
    for (const b of world.buildings) if (!b.hall) for (const r of b.rooms) floorTiles.push(r);
    let guard = 0;
    while (remaining > 0 && guard++ < 2000) {
      const n = Math.min(remaining, rng.int(2, 6));
      let spot = null;
      const indoor = floorTiles.length && rng.chance(0.35);
      for (let k = 0; k < 30 && !spot; k++) {
        let tx, ty;
        if (indoor) { const r = rng.pick(floorTiles); tx = r.tx + rng.int(0, r.w - 1); ty = r.ty + rng.int(0, r.h - 1); }
        else { tx = rng.int(4, world.w - 5); ty = rng.int(4, world.h - 5); }
        if (!world.isWalkable(tx, ty) || world.tile(tx, ty) === T.TOXIC) continue;
        const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
        if (Math.hypot(x - sp.x, y - sp.y) < minD) continue;
        if (world.extractions.some(e => Math.hypot(e.x - x, e.y - y) < 6 * TILE)) continue;
        if (world.bossArena && world.buildingIndexAtTile(tx, ty) >= 0 && world.buildings[world.buildingIndexAtTile(tx, ty)].hall) continue;
        spot = { x, y };
      }
      if (!spot) continue;
      const types = [];
      for (let i = 0; i < n; i++) types.push((rng.weighted(weights) || weights[0]).id);
      if (indoor) {
        const special = weights.filter(w => w.id === 'stalker' || w.id === 'screamer');
        if (special.length && rng.chance(0.5)) types[0] = rng.pick(special).id;
      }
      world.zombieSpawns.push({ x: spot.x, y: spot.y, count: n, types, indoor: !!indoor });
      remaining -= n;
    }
    if (map.boss && world.bossArena) {
      world.zombieSpawns.push({ x: world.bossArena.x, y: world.bossArena.y, count: 5, types: [map.boss, 'walker', 'walker', 'walker', 'walker'], boss: true });
    }
  }

  // ---------------- missions (never changes tiles) ----------------
  static _missionPlacement(ctx, mrng, missionDefs) {
    const { world, map } = ctx;
    const containersByType = (types, minTier = 1) => world.containers.filter(c => c.type !== 'body' && c.tier >= minTier && (!types || types.includes(c.buildingType)));
    const putInContainer = (id, count, types, minTier = 2) => {
      let list = containersByType(types, minTier);
      if (!list.length) list = containersByType(null, minTier);
      if (!list.length) list = containersByType(null, 1);
      if (!list.length) return false;
      const c = mrng.pick(list);
      const inst = wg_makeItem(id, count);
      if (!inst) return false;
      c.preset.push(inst);
      return true;
    };
    const outdoorPoint = (minFromSpawn) => {
      const sp = world.playerSpawn;
      for (let k = 0; k < 200; k++) {
        const o = mrng.pick(ctx.outdoor);
        if (!o) break;
        const tx = o.tx + mrng.int(0, Math.max(0, o.w - 1)), ty = o.ty + mrng.int(0, Math.max(0, o.h - 1));
        if (!world.isWalkable(tx, ty) || world.buildingIndexAtTile(tx, ty) >= 0 || world.tile(tx, ty) === T.TOXIC) continue;
        const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
        if (Math.hypot(x - sp.x, y - sp.y) < minFromSpawn) continue;
        if (world.pois.some(p => Math.hypot(p.x - x, p.y - y) < 8 * TILE)) continue;
        return { x, y };
      }
      for (let k = 0; k < 400; k++) {
        const tx = mrng.int(5, world.w - 6), ty = mrng.int(5, world.h - 6);
        if (world.isWalkable(tx, ty) && world.buildingIndexAtTile(tx, ty) < 0) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
      return { x: world.playerSpawn.x, y: world.playerSpawn.y };
    };
    const indoorPoint = (types) => {
      const bl = world.buildings.filter(b => !b.hall && (!types || types.includes(b.type)));
      const b = bl.length ? mrng.pick(bl) : null;
      if (!b || !b.rooms.length) return null;
      const r = mrng.pick(b.rooms);
      for (let k = 0; k < 20; k++) {
        const tx = r.tx + mrng.int(0, r.w - 1), ty = r.ty + mrng.int(0, r.h - 1);
        if (world.tile(tx, ty) === T.FLOOR) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, buildingId: b.id };
      }
      return null;
    };
    const addPoi = (type) => {
      let p = null;
      if (type === 'server_room') p = indoorPoint(['server', 'lab', 'office', 'hq']);
      else if (type === 'lab_entrance') p = indoorPoint(['lab', 'medical', 'bunker']);
      else if (type === 'checkpoint') {
        const cp = world.buildings.find(b => b.type === 'checkpoint');
        if (cp && cp.doors[0]) p = { x: (cp.doors[0].ox + 0.5) * TILE, y: (cp.doors[0].oy + 0.5) * TILE, buildingId: cp.id };
      } else if (type === 'boss_arena' && world.bossArena) p = { x: world.bossArena.x, y: world.bossArena.y, buildingId: world.bossArena.buildingId };
      if (!p) p = outdoorPoint(30 * TILE);
      const poi = { id: 'poi' + (++ctx.poiSeq), type, x: p.x, y: p.y, radius: 64, buildingId: p.buildingId || null, used: false, timer: 0 };
      world.pois.push(poi);
      return poi;
    };
    for (const m of missionDefs) {
      for (const o of [...(m.objectives || []), ...(m.optional || [])]) {
        if (o.type === 'investigate') {
          if (!world.pois.some(p => p.type === o.target)) addPoi(o.target);
        } else if (o.type === 'retrieve') {
          const id = o.target;
          if (world.floorLoot.some(f => f.inst && f.inst.id === id) || world.containers.some(c => c.preset.some(i => i.id === id))) continue;
          const count = Math.max(1, o.count || 1);
          if (id === 'mis_supply_package' || !WG_RETRIEVE_HOSTS[id]) {
            const poi = world.pois.find(p => p.type === 'supply_drop') || addPoi('supply_drop');
            for (let k = 0; k < count; k++) {
              const inst = wg_makeItem(id, 1);
              if (inst) world.floorLoot.push({ uid: 'fl' + world.floorLoot.length, inst, x: poi.x + mrng.float(-14, 14), y: poi.y + mrng.float(-14, 14) });
            }
          } else {
            for (let k = 0; k < count; k++) putInContainer(id, 1, WG_RETRIEVE_HOSTS[id], 1);
          }
        } else if (o.type === 'find_key') {
          if (!world.containers.some(c => c.preset.some(i => i.id === o.target))) putInContainer(o.target, 1, ['security', 'hq', 'office', 'checkpoint', 'armory', 'workshop', 'garage', 'apartment'], 2);
        }
      }
    }
    // keys for key-extractions
    for (const e of world.extractions) {
      if (e.kind !== 'key' || !e.requires) continue;
      if (world.containers.some(c => c.preset.some(i => i.id === e.requires))) continue;
      putInContainer(e.requires, 1, null, 2);
    }
    // lab key card for the locked hall
    if (world.buildings.some(b => b.locked) && !world.containers.some(c => c.preset.some(i => i.id === 'key_lab_card'))) {
      putInContainer('key_lab_card', 1, ['security'], 1) || putInContainer('key_lab_card', 1, ['lab', 'office', 'medical'], 2);
    }
    // fuel cans for fuel extractions (one guaranteed)
    for (const e of world.extractions) {
      if (e.kind === 'fuel' && e.requires && !world.containers.some(c => c.preset.some(i => i.id === e.requires))) putInContainer(e.requires, 1, ['garage', 'workshop', 'factory', 'warehouse', 'storage'], 1);
    }
  }
}
