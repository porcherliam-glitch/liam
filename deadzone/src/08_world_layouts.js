// 08_world_layouts.js — the four map layouts (SPEC §9.1): wgLayoutCity, wgLayoutCompound, wgLayoutIndustrial, wgLayoutCampus.
// Each receives g = {world, rng, map, missionDefs}, paints ground/roads/fences/rails/toxic pools into world tiles
// (raw writes via world.put) and returns {blocks:[{tx,ty,w,h,zone,i,j}], roads:[{tx,ty,w,h,dir}], yards:[...],
// bossArena:{tx,ty,w,h}|null, margin, special:{...}}.
// Shared helper: wgl_grid builds a road grid with blocks between road bands.
// Dependencies: 00_util.js, 08_world.js (T). Runtime only; no DOM.

function wgl_fill(world, x, y, w, h, t) {
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) world.put(tx, ty, t);
}

// Splits [start, end) into alternating road bands and blocks; returns band start positions.
function wgl_bands(rng, start, end, band, bmin, bmax) {
  const total = end - start;
  const avg = (bmin + bmax) / 2;
  let n = Math.max(2, Math.floor((total - band) / (avg + band)));
  let avail = total - band * (n + 1);
  while (n > 2 && avail / n < bmin) { n--; avail = total - band * (n + 1); }
  const sizes = [];
  const base = Math.floor(avail / n);
  for (let i = 0; i < n; i++) sizes.push(base);
  let rest = avail - base * n;
  for (let i = 0; rest > 0; i = (i + 1) % n, rest--) sizes[i]++;
  // jitter pairwise, preserving the sum and the bounds
  for (let i = 0; i + 1 < n; i++) {
    const d = rng.int(-3, 3);
    if (sizes[i] + d >= bmin && sizes[i + 1] - d >= bmin && sizes[i] + d <= bmax + 4 && sizes[i + 1] - d <= bmax + 4) {
      sizes[i] += d; sizes[i + 1] -= d;
    }
  }
  const bands = [];
  let cur = start;
  for (let i = 0; i < n; i++) { bands.push(cur); cur += band + sizes[i]; }
  bands.push(cur);
  return { bands, sizes };
}

// Generic grid: opt = {margin, roadW, sidewalk, roadTile, lineTile, blockMin, blockMax, blockTile(i,j)}.
function wgl_grid(g, opt) {
  const { world } = g;
  const W = world.w, H = world.h;
  const m = opt.margin;
  const sw = opt.sidewalk ? 1 : 0;
  const band = opt.roadW + sw * 2;
  const bx = wgl_bands(g.rng, m, W - m, band, opt.blockMin, opt.blockMax);
  const by = wgl_bands(g.rng, m, H - m, band, opt.blockMin, opt.blockMax);
  const roads = [];
  const blocks = [];
  const lastX = bx.bands[bx.bands.length - 1] + band, lastY = by.bands[by.bands.length - 1] + band;
  // blocks
  for (let j = 0; j < by.sizes.length; j++) {
    for (let i = 0; i < bx.sizes.length; i++) {
      const b = { tx: bx.bands[i] + band, ty: by.bands[j] + band, w: bx.sizes[i], h: by.sizes[j], zone: null, i, j };
      blocks.push(b);
      wgl_fill(world, b.tx, b.ty, b.w, b.h, opt.blockTile ? opt.blockTile(i, j) : T.GROUND);
    }
  }
  // vertical road bands
  for (const x of bx.bands) {
    const r = { tx: x + sw, ty: m, w: opt.roadW, h: lastY - m, dir: 'v' };
    roads.push(r);
    if (sw) { wgl_fill(world, x, m, 1, r.h, T.SIDEWALK); wgl_fill(world, x + band - 1, m, 1, r.h, T.SIDEWALK); }
    wgl_fill(world, r.tx, r.ty, r.w, r.h, opt.roadTile);
  }
  for (const y of by.bands) {
    const r = { tx: m, ty: y + sw, w: lastX - m, h: opt.roadW, dir: 'h' };
    roads.push(r);
    if (sw) { wgl_fill(world, m, y, r.w, 1, T.SIDEWALK); wgl_fill(world, m, y + band - 1, r.w, 1, T.SIDEWALK); }
    wgl_fill(world, r.tx, r.ty, r.w, r.h, opt.roadTile);
  }
  // re-paint intersections as plain road and sidewalks crossing as road
  for (const x of bx.bands) for (const y of by.bands) wgl_fill(world, x, y, band, band, opt.roadTile);
  // dashed centre lines
  if (opt.lineTile && opt.roadW % 2 === 1) {
    const c = (opt.roadW - 1) / 2;
    for (const r of roads) {
      if (r.dir === 'v') {
        for (let y = r.ty; y < r.ty + r.h; y++) {
          if (y % 4 < 2 && !wgl_inBands(y, by.bands, band)) world.put(r.tx + c, y, opt.lineTile);
        }
      } else {
        for (let x = r.tx; x < r.tx + r.w; x++) {
          if (x % 4 < 2 && !wgl_inBands(x, bx.bands, band)) world.put(x, r.ty + c, opt.lineTile);
        }
      }
    }
  }
  return { roads, blocks, bands: { x: bx.bands, y: by.bands, band } };
}

function wgl_inBands(v, bands, band) {
  for (const b of bands) if (v >= b && v < b + band) return true;
  return false;
}

function wgl_base(g, groundTile, borderTile) {
  const { world } = g;
  const W = world.w, H = world.h;
  wgl_fill(world, 0, 0, W, H, T.VOID);
  wgl_fill(world, 2, 2, W - 4, H - 4, borderTile);
  wgl_fill(world, 3, 3, W - 6, H - 6, groundTile);
}

function wgl_blob(world, rng, cx, cy, r, tile, onlyOn) {
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, y - cy) + rng.float(-0.6, 0.6);
      if (d <= r && (!onlyOn || onlyOn.includes(world.tile(x, y)))) world.put(x, y, tile);
    }
  }
}

function wgLayoutCity(g) {
  const { world, rng } = g;
  const margin = 8;
  wgl_base(g, T.GRASS, T.FENCE);
  // margin band: mostly ground with grass patches
  wgl_fill(world, 3, 3, world.w - 6, world.h - 6, T.GROUND);
  const grid = wgl_grid(g, { margin, roadW: 3, sidewalk: true, roadTile: T.ROAD, lineTile: T.ROAD_LINE, blockMin: 14, blockMax: 20,
    blockTile: () => T.GRASS });
  const cx = world.w / 2, cy = world.h / 2;
  const maxD = Math.hypot(cx, cy);
  const inner = grid.blocks.filter(b => b.i > 0 && b.j > 0 && b.i < Math.max(...grid.blocks.map(q => q.i)) && b.j < Math.max(...grid.blocks.map(q => q.j)));
  const plaza = rng.pick(inner.length ? inner : grid.blocks);
  const yards = [];
  for (const b of grid.blocks) {
    const d = Math.hypot(b.tx + b.w / 2 - cx, b.ty + b.h / 2 - cy) / maxD;
    if (b === plaza) {
      b.zone = 'plaza';
      wgl_fill(world, b.tx, b.ty, b.w, b.h, T.SIDEWALK);
      wgl_fill(world, b.tx + 2, b.ty + 2, b.w - 4, b.h - 4, T.GRASS);
      // cross paths and a fountain
      const mx = b.tx + (b.w >> 1), my = b.ty + (b.h >> 1);
      wgl_fill(world, mx - 1, b.ty, 2, b.h, T.SIDEWALK);
      wgl_fill(world, b.tx, my - 1, b.w, 2, T.SIDEWALK);
      wgl_fill(world, mx - 2, my - 2, 4, 4, T.SIDEWALK);
      wgl_fill(world, mx - 1, my - 1, 2, 2, T.WATER);
      yards.push({ tx: b.tx, ty: b.ty, w: b.w, h: b.h, kind: 'plaza' });
    } else {
      b.zone = d < 0.36 ? 'commercial' : 'residential';
      if (b.zone === 'commercial') wgl_fill(world, b.tx, b.ty, b.w, b.h, T.GROUND);
    }
  }
  // ensure at least two commercial blocks (supermarket + pharmacy need them)
  const commercial = grid.blocks.filter(b => b.zone === 'commercial');
  if (commercial.length < 3) {
    const sorted = grid.blocks.filter(b => b.zone === 'residential')
      .sort((a, b) => Math.hypot(a.tx - cx, a.ty - cy) - Math.hypot(b.tx - cx, b.ty - cy));
    for (let k = 0; k < 3 - commercial.length && k < sorted.length; k++) { sorted[k].zone = 'commercial'; wgl_fill(world, sorted[k].tx, sorted[k].ty, sorted[k].w, sorted[k].h, T.GROUND); }
  }
  // rubble patches on roads (collapsed facades)
  for (let k = 0; k < 18; k++) {
    const r = rng.pick(grid.roads);
    const x = r.tx + rng.int(0, Math.max(0, r.w - 1)), y = r.ty + rng.int(0, Math.max(0, r.h - 1));
    wgl_blob(world, rng, x, y, rng.int(1, 2), T.RUBBLE, [T.ROAD, T.ROAD_LINE, T.SIDEWALK]);
  }
  return { blocks: grid.blocks.filter(b => b.zone !== 'plaza'), roads: grid.roads, yards, bossArena: null, margin, bands: grid.bands, special: { plaza } };
}

function wgLayoutCompound(g) {
  const { world, rng } = g;
  const margin = 9;
  wgl_base(g, T.GROUND, T.FENCE);
  const grid = wgl_grid(g, { margin, roadW: 4, sidewalk: false, roadTile: T.ROAD, lineTile: null, blockMin: 16, blockMax: 22,
    blockTile: () => T.GRAVEL });
  const W = world.w, H = world.h;
  // inner perimeter fence one tile outside the first road band, with four gates
  const f0 = margin - 2, f1x = W - margin + 1, f1y = H - margin + 1;
  for (let x = f0; x <= f1x; x++) { world.put(x, f0, T.FENCE); world.put(x, f1y, T.FENCE); }
  for (let y = f0; y <= f1y; y++) { world.put(f0, y, T.FENCE); world.put(f1x, y, T.FENCE); }
  const gates = [];
  const gx = grid.bands.x[Math.floor(grid.bands.x.length / 2)], gy = grid.bands.y[Math.floor(grid.bands.y.length / 2)];
  const gateW = 4;
  for (let k = 0; k < gateW; k++) {
    world.put(gx + k, f0, T.GRAVEL); world.put(gx + k, f1y, T.GRAVEL);
    world.put(f0, gy + k, T.GRAVEL); world.put(f1x, gy + k, T.GRAVEL);
  }
  gates.push({ tx: gx, ty: f0, dir: 'n' }, { tx: gx, ty: f1y, dir: 's' }, { tx: f0, ty: gy, dir: 'w' }, { tx: f1x, ty: gy, dir: 'e' });
  // roads leading from gates to the outer ground
  for (let k = 0; k < gateW; k++) {
    for (let y = 3; y < f0; y++) world.put(gx + k, y, T.ROAD);
    for (let y = f1y + 1; y < H - 3; y++) world.put(gx + k, y, T.ROAD);
    for (let x = 3; x < f0; x++) world.put(x, gy + k, T.ROAD);
    for (let x = f1x + 1; x < W - 3; x++) world.put(x, gy + k, T.ROAD);
  }
  // parade ground in the most central block
  const cx = W / 2, cy = H / 2;
  const sorted = grid.blocks.slice().sort((a, b) => Math.hypot(a.tx + a.w / 2 - cx, a.ty + a.h / 2 - cy) - Math.hypot(b.tx + b.w / 2 - cx, b.ty + b.h / 2 - cy));
  const parade = sorted[0];
  const yards = [];
  for (const b of grid.blocks) b.zone = b === parade ? 'parade' : 'military';
  wgl_fill(world, parade.tx, parade.ty, parade.w, parade.h, T.GRAVEL);
  wgl_fill(world, parade.tx + 2, parade.ty + 2, parade.w - 4, parade.h - 4, T.ROAD);
  yards.push({ tx: parade.tx, ty: parade.ty, w: parade.w, h: parade.h, kind: 'parade' });
  // a few blocks get partial fences (secured zones) with an opening
  for (const b of grid.blocks) {
    if (b === parade || !rng.chance(0.3)) continue;
    const open = rng.int(b.tx + 3, b.tx + b.w - 5);
    for (let x = b.tx; x < b.tx + b.w; x++) if (x < open || x > open + 2) { world.put(x, b.ty, T.FENCE); world.put(x, b.ty + b.h - 1, T.FENCE); }
    b.fenced = true;
    b.ty += 1; b.h -= 2;
  }
  return { blocks: grid.blocks.filter(b => b.zone !== 'parade'), roads: grid.roads, yards, bossArena: null, margin, bands: grid.bands,
    special: { gates, parade, fence: { x0: f0, y0: f0, x1: f1x, y1: f1y } } };
}

function wgLayoutIndustrial(g) {
  const { world, rng, map } = g;
  const margin = 9;
  wgl_base(g, T.GRAVEL, T.FENCE);
  const grid = wgl_grid(g, { margin, roadW: 4, sidewalk: false, roadTile: T.ROAD, lineTile: null, blockMin: 22, blockMax: 30,
    blockTile: () => T.GRAVEL });
  const W = world.w, H = world.h;
  // rail line along the south margin
  const railY = H - 6;
  wgl_fill(world, 3, railY - 1, W - 6, 3, T.GRAVEL);
  world.rails.push({ tx: 3, ty: railY, w: W - 6, h: 1, dir: 'h' });
  const yards = [];
  const blocks = grid.blocks;
  for (const b of blocks) b.zone = 'industrial';
  // one or two blocks become tank farms / dump yards
  const yardCount = Math.max(1, Math.round(blocks.length / 8));
  const shuffled = rng.shuffle(blocks.slice());
  for (let k = 0; k < yardCount && k < shuffled.length; k++) {
    const b = shuffled[k];
    b.zone = 'yard';
    yards.push({ tx: b.tx, ty: b.ty, w: b.w, h: b.h, kind: 'tankfarm' });
  }
  // toxic pools inside yards / margins
  const pools = [];
  const nPools = Number.isFinite(map && map.toxicZones) ? map.toxicZones : 4;
  for (let k = 0; k < nPools; k++) {
    const src = yards.length && k < yards.length * 2 ? yards[k % yards.length] : rng.pick(blocks);
    const r = rng.int(2, 4);
    const x = src.tx + rng.int(r + 1, Math.max(r + 1, src.w - r - 2)), y = src.ty + rng.int(r + 1, Math.max(r + 1, src.h - r - 2));
    pools.push({ tx: x, ty: y, r });
  }
  // mud/rubble patches on the gravel
  for (let k = 0; k < 24; k++) {
    const b = rng.pick(blocks);
    wgl_blob(world, rng, b.tx + rng.int(0, b.w - 1), b.ty + rng.int(0, b.h - 1), rng.int(1, 2), T.RUBBLE, [T.GRAVEL]);
  }
  return { blocks: blocks.filter(b => b.zone !== 'yard'), roads: grid.roads, yards, bossArena: null, margin, bands: grid.bands,
    special: { pools, railY } };
}

function wgLayoutCampus(g) {
  const { world, rng } = g;
  const margin = 9;
  wgl_base(g, T.GRASS, T.WALL);
  const grid = wgl_grid(g, { margin, roadW: 2, sidewalk: true, roadTile: T.ROAD, lineTile: null, blockMin: 19, blockMax: 25,
    blockTile: () => T.GRASS });
  const blocks = grid.blocks;
  const nx = Math.max(...blocks.map(b => b.i)) + 1, ny = Math.max(...blocks.map(b => b.j)) + 1;
  // quad: the most central block becomes a lawn with cross paths
  const cx = world.w / 2, cy = world.h / 2;
  const quad = blocks.slice().sort((a, b) => Math.hypot(a.tx + a.w / 2 - cx, a.ty + a.h / 2 - cy) - Math.hypot(b.tx + b.w / 2 - cx, b.ty + b.h / 2 - cy))[0];
  quad.zone = 'quad';
  const yards = [{ tx: quad.tx, ty: quad.ty, w: quad.w, h: quad.h, kind: 'quad' }];
  const mx = quad.tx + (quad.w >> 1), my = quad.ty + (quad.h >> 1);
  wgl_fill(world, mx - 1, quad.ty, 2, quad.h, T.SIDEWALK);
  wgl_fill(world, quad.tx, my - 1, quad.w, 2, T.SIDEWALK);
  for (let a = 0; a < Math.PI * 2; a += 0.05) world.put(Math.round(mx + Math.cos(a) * 5), Math.round(my + Math.sin(a) * 5), T.SIDEWALK);
  // boss arena: merge the two blocks of a corner row (pick the corner farthest from the quad)
  const corners = [
    { i: nx - 2, j: ny - 1 }, { i: 0, j: ny - 1 }, { i: nx - 2, j: 0 }, { i: 0, j: 0 },
  ];
  const corner = rng.pick(corners);
  const a = blocks.find(b => b.i === corner.i && b.j === corner.j);
  const bb = blocks.find(b => b.i === corner.i + 1 && b.j === corner.j);
  let bossArena = null;
  if (a && bb && a !== quad && bb !== quad) {
    bossArena = { tx: a.tx, ty: a.ty, w: bb.tx + bb.w - a.tx, h: Math.min(a.h, bb.h) };
    a.zone = 'arena'; bb.zone = 'arena';
    wgl_fill(world, bossArena.tx, bossArena.ty, bossArena.w, bossArena.h, T.GRAVEL);
  }
  for (const b of blocks) if (!b.zone) b.zone = 'lab';
  // sparse rubble: signs of the outbreak
  for (let k = 0; k < 10; k++) {
    const r = rng.pick(grid.roads);
    wgl_blob(world, rng, r.tx + rng.int(0, r.w - 1), r.ty + rng.int(0, r.h - 1), 1, T.RUBBLE, [T.ROAD, T.SIDEWALK]);
  }
  return { blocks: blocks.filter(b => b.zone === 'lab'), roads: grid.roads, yards, bossArena, margin, bands: grid.bands, special: { quad } };
}
