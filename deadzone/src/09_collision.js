// 09_collision.js — Physics (tile collision, raycasts), SpatialHash, Nav (flow field + A*) (SPEC §10).
// Decisions: the flow field uses integer costs orth 2 / diag 3 (≈ √2), ×2 on RUBBLE/TOXIC, ×4 on closed doors;
//   locked doors are impassable for navigation (zombies never open them, so routing through them would
//   strand zombies). dirAt() steers toward the centre of the next tile (smoother than the raw direction).
// Dependencies: 00_util.js, 08_world.js (T, tile predicates).

const NAV_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NAV_DY = [0, 0, 1, -1, 1, -1, 1, -1];

class Physics {
  static _circleBlocked(world, x, y, r) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!world.blocksMove(tx, ty)) continue;
        if (circleRectOverlap(x, y, r, tx * TILE, ty * TILE, TILE, TILE)) return true;
      }
    }
    return false;
  }

  static moveCircle(world, x, y, r, dx, dy) {
    if (!world || !Number.isFinite(dx) || !Number.isFinite(dy)) return { x, y, collided: false };
    const dmax = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.min(8, Math.max(1, Math.ceil(dmax / Math.max(2, r * 0.45))));
    const sx = dx / steps, sy = dy / steps;
    let collided = false;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0) {
        const nx = x + sx;
        if (!Physics._circleBlocked(world, nx, y, r)) x = nx;
        else {
          collided = true;
          // Approach the wall in two halving steps to minimise the visible gap.
          let part = sx * 0.5;
          for (let k = 0; k < 2; k++) {
            if (!Physics._circleBlocked(world, x + part, y, r)) x += part;
            part *= 0.5;
          }
        }
      }
      if (sy !== 0) {
        const ny = y + sy;
        if (!Physics._circleBlocked(world, x, ny, r)) y = ny;
        else {
          collided = true;
          let part = sy * 0.5;
          for (let k = 0; k < 2; k++) {
            if (!Physics._circleBlocked(world, x, y + part, r)) y += part;
            part *= 0.5;
          }
        }
      }
    }
    return { x, y, collided };
  }

  // Amanatides–Woo grid traversal. Ignores the start tile.
  static raycastTiles(world, x0, y0, x1, y1, blockFn = tileBlocksBullets) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
    const ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
    if (len < 1e-6) return { hit: false, x: x1, y: y1, tx: ex, ty: ey, dist: 0, tile: world.tile(ex, ey) };
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx !== 0 ? ((stepX > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx)) : Infinity;
    let tMaxY = dy !== 0 ? ((stepY > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy)) : Infinity;
    let guard = 0;
    while ((tx !== ex || ty !== ey) && guard++ < 512) {
      let t;
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; }
      else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
      if (t > 1) break;
      const tile = world.tile(tx, ty);
      if (blockFn(tile)) {
        const hx = x0 + dx * t, hy = y0 + dy * t;
        return { hit: true, x: hx, y: hy, tx, ty, dist: len * t, tile };
      }
    }
    return { hit: false, x: x1, y: y1, tx: ex, ty: ey, dist: len, tile: world.tile(ex, ey) };
  }

  static lineOfSight(world, x0, y0, x1, y1) {
    if (!world) return false;
    return !Physics.raycastTiles(world, x0, y0, x1, y1, tileBlocksSight).hit;
  }

  static circleHit(ax, ay, ar, bx, by, br) {
    const r = ar + br;
    return dist2(ax, ay, bx, by) <= r * r;
  }

  static segmentCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0, dy = y1 - y0;
    const fx = x0 - cx, fy = y0 - cy;
    const a = dx * dx + dy * dy;
    const c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    if (a < 1e-9) return -1;
    const b = 2 * (fx * dx + fy * dy);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    const t = (-b - sq) / (2 * a);
    if (t >= 0 && t <= 1) return t;
    return -1;
  }

  static resolveCircles(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const r = (a.radius || 0) + (b.radius || 0);
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    let d = Math.sqrt(d2);
    let nx, ny;
    if (d < 1e-4) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
    const push = (r - d) * 0.5;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
    return true;
  }
}

class SpatialHash {
  constructor(cellSize = 96) {
    this.cell = cellSize;
    this.buckets = new Map();
    this.used = [];
  }
  _key(cx, cy) { return (cx + 1024) * 4096 + (cy + 1024); }
  clear() {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
  }
  insert(e) {
    if (!e) return;
    const cx = Math.floor(e.x / this.cell), cy = Math.floor(e.y / this.cell);
    const k = this._key(cx, cy);
    let b = this.buckets.get(k);
    if (!b) { b = []; this.buckets.set(k, b); }
    if (b.length === 0) this.used.push(b);
    b.push(e);
    e._hashKey = k;
  }
  remove(e) {
    if (!e || e._hashKey === undefined) return;
    const b = this.buckets.get(e._hashKey);
    if (b) { const i = b.indexOf(e); if (i >= 0) b.splice(i, 1); }
    e._hashKey = undefined;
  }
  update(e) {
    const k = this._key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    if (k !== e._hashKey) { this.remove(e); this.insert(e); }
  }
  queryRect(x, y, w, h, out) {
    const res = out || [];
    const cx0 = Math.floor(x / this.cell), cx1 = Math.floor((x + w) / this.cell);
    const cy0 = Math.floor(y / this.cell), cy1 = Math.floor((y + h) / this.cell);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const b = this.buckets.get(this._key(cx, cy));
      if (b) for (let i = 0; i < b.length; i++) res.push(b[i]);
    }
    return res;
  }
  query(x, y, r, out) { return this.queryRect(x - r, y - r, r * 2, r * 2, out); }
  forEachNear(x, y, r, fn) {
    const list = this.query(x, y, r);
    for (const e of list) fn(e);
  }
}

class Nav {
  constructor(world) {
    this.world = world;
    const n = world ? world.w * world.h : 1;
    this.dist = new Int32Array(n).fill(-1);
    this.dir = new Uint8Array(n);
    this.touched = new Int32Array(n);
    this.touchedCount = 0;
    this.lastTarget = -1;
    this.gScore = new Float64Array(n);
    this.cameFrom = new Int32Array(n);
    this.stamp = new Uint16Array(n);
    this.closedStamp = new Uint16Array(n);
    this.gen = 0;
    this.heap = new Int32Array(n + 16);
    this.heapF = new Float64Array(n + 16);
    this.heapSize = 0;
    this.buckets = [];
    for (let i = 0; i < 16; i++) this.buckets.push([]);
  }

  _stepCost(t) {
    if (t === T.DOOR_CLOSED) return 4;
    if (t === T.RUBBLE || t === T.TOXIC) return 2;
    return 1;
  }
  _navPassable(t) { return WD_MOVE[t] !== 1 || t === T.DOOR_CLOSED; }

  rebuild(targetX, targetY, maxRadiusTiles = 60) {
    const world = this.world;
    if (!world) return;
    const w = world.w, h = world.h;
    const ttx = clamp(Math.floor(targetX / TILE), 0, w - 1), tty = clamp(Math.floor(targetY / TILE), 0, h - 1);
    const target = tty * w + ttx;
    if (target === this.lastTarget && this.lastVersion === world.version) return;
    this.lastTarget = target; this.lastVersion = world.version;
    // reset only touched cells
    for (let i = 0; i < this.touchedCount; i++) { const c = this.touched[i]; this.dist[c] = -1; this.dir[c] = 0; }
    this.touchedCount = 0;
    const tiles = world.tiles;
    const R = maxRadiusTiles;
    const buckets = this.buckets;
    for (const b of buckets) b.length = 0;
    const NB = buckets.length;
    this.dist[target] = 0;
    this.touched[this.touchedCount++] = target;
    buckets[0].push(target);
    let cur = 0, pending = 1, guard = 0;
    const cap = (2 * R + 1) * (2 * R + 1) * 4;
    while (pending > 0 && guard++ < cap) {
      const bucket = buckets[cur % NB];
      if (bucket.length === 0) { cur++; continue; }
      const i = bucket.pop(); pending--;
      const d = this.dist[i];
      if (d !== cur) continue; // stale entry
      const x = i % w, y = (i - x) / w;
      for (let k = 0; k < 8; k++) {
        const nx = x + NAV_DX[k], ny = y + NAV_DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (Math.abs(nx - ttx) > R || Math.abs(ny - tty) > R) continue;
        const j = ny * w + nx;
        const t = tiles[j];
        if (!this._navPassable(t)) continue;
        if (k >= 4) { // no corner cutting
          if (!this._navPassable(tiles[y * w + nx]) || !this._navPassable(tiles[ny * w + x])) continue;
          if (tiles[y * w + nx] === T.DOOR_CLOSED || tiles[ny * w + x] === T.DOOR_CLOSED) continue;
        }
        const nd = d + (k >= 4 ? 3 : 2) * this._stepCost(t);
        const old = this.dist[j];
        if (old === -1 || nd < old) {
          if (old === -1) this.touched[this.touchedCount++] = j;
          this.dist[j] = nd;
          this.dir[j] = 0;
          buckets[nd % NB].push(j);
          pending++;
        }
      }
    }
    if (guard >= cap) Log.warn('Nav.rebuild: iteration cap reached');
    // direction pass
    for (let n = 0; n < this.touchedCount; n++) {
      const i = this.touched[n];
      const d = this.dist[i];
      if (d <= 0) continue;
      const x = i % w, y = (i - x) / w;
      let best = -1, bestD = d;
      for (let k = 0; k < 8; k++) {
        const nx = x + NAV_DX[k], ny = y + NAV_DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const dj = this.dist[j];
        if (dj < 0 || dj >= bestD) continue;
        if (k >= 4) {
          if (!this._navPassable(tiles[y * w + nx]) || !this._navPassable(tiles[ny * w + x])) continue;
          if (tiles[y * w + nx] === T.DOOR_CLOSED || tiles[ny * w + x] === T.DOOR_CLOSED) continue;
        }
        bestD = dj; best = k;
      }
      this.dir[i] = best + 1;
    }
  }

  dirAt(x, y) {
    const world = this.world;
    if (!world) return null;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!world.inBounds(tx, ty)) return null;
    const i = ty * world.w + tx;
    if (this.dist[i] < 0) return null;
    const k = this.dir[i] - 1;
    if (k < 0) return null;
    const cx = (tx + NAV_DX[k] + 0.5) * TILE, cy = (ty + NAV_DY[k] + 0.5) * TILE;
    let dx = cx - x, dy = cy - y;
    let l = Math.hypot(dx, dy);
    if (l < 2) { dx = NAV_DX[k]; dy = NAV_DY[k]; l = Math.hypot(dx, dy); }
    return { dx: dx / l, dy: dy / l };
  }

  distAt(x, y) {
    const world = this.world;
    if (!world) return Infinity;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!world.inBounds(tx, ty)) return Infinity;
    const d = this.dist[ty * world.w + tx];
    return d < 0 ? Infinity : d;
  }

  _heapPush(i, f) {
    let n = this.heapSize++;
    const H = this.heap, F = this.heapF;
    H[n] = i; F[n] = f;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (F[p] <= F[n]) break;
      const ti = H[p]; H[p] = H[n]; H[n] = ti;
      const tf = F[p]; F[p] = F[n]; F[n] = tf;
      n = p;
    }
  }
  _heapPop() {
    const H = this.heap, F = this.heapF;
    const top = H[0];
    const last = --this.heapSize;
    if (last > 0) {
      H[0] = H[last]; F[0] = F[last];
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n;
        if (l < last && F[l] < F[m]) m = l;
        if (r < last && F[r] < F[m]) m = r;
        if (m === n) break;
        const ti = H[m]; H[m] = H[n]; H[n] = ti;
        const tf = F[m]; F[m] = F[n]; F[n] = tf;
        n = m;
      }
    }
    return top;
  }

  findPath(x0, y0, x1, y1, maxNodes = 4000) {
    const world = this.world;
    if (!world) return null;
    const w = world.w, h = world.h;
    const sx = Math.floor(x0 / TILE), sy = Math.floor(y0 / TILE);
    const gx = Math.floor(x1 / TILE), gy = Math.floor(y1 / TILE);
    if (!world.inBounds(sx, sy) || !world.inBounds(gx, gy)) return null;
    const tiles = world.tiles;
    const goal = gy * w + gx;
    if (!this._navPassable(tiles[goal]) && tiles[goal] !== T.DOOR_LOCKED) return null;
    this.gen = (this.gen + 1) & 0xffff;
    if (this.gen === 0) { this.stamp.fill(0); this.closedStamp.fill(0); this.gen = 1; }
    const gen = this.gen;
    const start = sy * w + sx;
    this.heapSize = 0;
    this.stamp[start] = gen; this.gScore[start] = 0; this.cameFrom[start] = -1;
    const hfn = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    this._heapPush(start, hfn(sx, sy));
    let expanded = 0;
    while (this.heapSize > 0) {
      const i = this._heapPop();
      if (this.closedStamp[i] === gen) continue;
      this.closedStamp[i] = gen;
      if (i === goal) {
        const out = [];
        let c = i, guard = 0;
        while (c !== start && c >= 0 && guard++ < 100000) {
          const cx = c % w, cy = (c - cx) / w;
          out.push({ x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE });
          c = this.cameFrom[c];
        }
        out.reverse();
        return out;
      }
      if (++expanded > maxNodes) return null;
      const x = i % w, y = (i - x) / w;
      const g = this.gScore[i];
      for (let k = 0; k < 8; k++) {
        const nx = x + NAV_DX[k], ny = y + NAV_DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const t = tiles[j];
        if (!this._navPassable(t) && !(j === goal && t === T.DOOR_LOCKED)) continue;
        if (k >= 4) {
          if (WD_MOVE[tiles[y * w + nx]] === 1 || WD_MOVE[tiles[ny * w + x]] === 1) continue;
        }
        const step = (k >= 4 ? 1.4142 : 1) * (t === T.DOOR_CLOSED ? 3 : (t === T.RUBBLE || t === T.TOXIC) ? 2 : 1);
        const ng = g + step;
        if (this.stamp[j] !== gen || ng < this.gScore[j]) {
          this.stamp[j] = gen; this.gScore[j] = ng; this.cameFrom[j] = i;
          this._heapPush(j, ng + hfn(nx, ny));
        }
      }
    }
    return null;
  }

  randomWalkable(rng, nearX, nearY, radiusTiles) {
    const world = this.world;
    if (!world || !rng) return null;
    const cx = Math.floor(nearX / TILE), cy = Math.floor(nearY / TILE);
    for (let i = 0; i < 20; i++) {
      const tx = cx + rng.int(-radiusTiles, radiusTiles), ty = cy + rng.int(-radiusTiles, radiusTiles);
      if (world.isWalkable(tx, ty)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return null;
  }
}
