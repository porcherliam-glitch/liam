// 08_world.js — tile codes, tile predicates, class World and the reachability BFS (SPEC §9, §9.1).
// Public API: T, tileBlocksMove, tileBlocksSight, tileBlocksBullets, tileSpeedMul, class World, wgReachability.
// Decisions: containers stand on walkable FLOOR tiles (they are interactive objects, not obstacles), so they
//   can never cut a room in two. World keeps a per-tile building index (buildingGrid) for O(1) buildingAt().
// Dependencies: 00_util.js (TILE, dist2), 03_data_maps.js (MAPS, read at runtime).

const T = {
  VOID: 0, GROUND: 1, ROAD: 2, FLOOR: 3, WALL: 4, DOOR_CLOSED: 5, DOOR_OPEN: 6, WINDOW: 7, WATER: 8,
  RUBBLE: 9, GRASS: 10, TOXIC: 11, FENCE: 12, BARRICADE: 13, PROP_SOLID: 14, PROP_LOW: 15,
  ROAD_LINE: 16, SIDEWALK: 17, DOOR_LOCKED: 18, GRAVEL: 19,
};

const WD_MOVE = new Uint8Array(32);
const WD_SIGHT = new Uint8Array(32);
const WD_BULLET = new Uint8Array(32);
const WD_SPEED = new Float32Array(32).fill(1);
for (const t of [T.VOID, T.WALL, T.DOOR_CLOSED, T.DOOR_LOCKED, T.WINDOW, T.WATER, T.FENCE, T.BARRICADE, T.PROP_SOLID, T.PROP_LOW]) WD_MOVE[t] = 1;
for (const t of [T.VOID, T.WALL, T.DOOR_CLOSED, T.DOOR_LOCKED, T.BARRICADE, T.PROP_SOLID]) { WD_SIGHT[t] = 1; WD_BULLET[t] = 1; }
WD_SPEED[T.RUBBLE] = 0.6; WD_SPEED[T.TOXIC] = 0.6;

function tileBlocksMove(t) { return WD_MOVE[t] === 1; }
function tileBlocksSight(t) { return WD_SIGHT[t] === 1; }
function tileBlocksBullets(t) { return WD_BULLET[t] === 1; }
function tileSpeedMul(t) { return WD_SPEED[t] || 1; }
function tileIsDoor(t) { return t === T.DOOR_CLOSED || t === T.DOOR_OPEN || t === T.DOOR_LOCKED; }

class World {
  constructor(mapId, seed, w, h) {
    this.mapId = mapId;
    this.map = (typeof MAPS !== 'undefined' && MAPS[mapId]) || null;
    this.seed = seed;
    this.w = w | 0; this.h = h | 0;
    this.tiles = new Uint8Array(this.w * this.h);
    this.tileVariant = new Uint8Array(this.w * this.h);
    this.buildingGrid = new Int16Array(this.w * this.h).fill(-1);
    this.buildings = [];
    this.props = [];
    this.containers = [];
    this.floorLoot = [];
    this.playerSpawn = { x: 0, y: 0 };
    this.zombieSpawns = [];
    this.extractions = [];
    this.pois = [];
    this.lights = [];
    this.toxicZones = [];
    this.bossArena = null;
    this.roads = [];
    this.rails = [];
    this.version = 0;
    this.dirtyChunks = new Set();
  }
  get pixelW() { return this.w * TILE; }
  get pixelH() { return this.h * TILE; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.VOID;
    return this.tiles[ty * this.w + tx];
  }
  setTile(tx, ty, code) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const i = ty * this.w + tx;
    if (this.tiles[i] === code) return;
    this.tiles[i] = code;
    this.version++;
    this.dirtyChunks.add((tx >> 4) + ',' + (ty >> 4));
  }
  // Raw write without versioning (generator only).
  put(tx, ty, code) { if (tx >= 0 && ty >= 0 && tx < this.w && ty < this.h) this.tiles[ty * this.w + tx] = code; }
  blocksMove(tx, ty) { return WD_MOVE[this.tile(tx, ty)] === 1; }
  blocksSight(tx, ty) { return WD_SIGHT[this.tile(tx, ty)] === 1; }
  blocksBullets(tx, ty) { return WD_BULLET[this.tile(tx, ty)] === 1; }
  speedMul(tx, ty) { return WD_SPEED[this.tile(tx, ty)] || 1; }
  isWalkable(tx, ty) { return WD_MOVE[this.tile(tx, ty)] !== 1; }
  buildingIndexAtTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1;
    return this.buildingGrid[ty * this.w + tx];
  }
  buildingAt(x, y) {
    const i = this.buildingIndexAtTile(Math.floor(x / TILE), Math.floor(y / TILE));
    return i >= 0 ? this.buildings[i] || null : null;
  }
  isIndoor(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return this.tile(tx, ty) === T.FLOOR || this.buildingIndexAtTile(tx, ty) >= 0;
  }
  indexBuilding(b, idx) {
    for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) {
      if (this.inBounds(x, y)) this.buildingGrid[y * this.w + x] = idx;
    }
  }
  containerAt(x, y, r) {
    let best = null, bd = r * r;
    for (const c of this.containers) {
      const d = dist2(x, y, c.x, c.y);
      if (d <= bd) { bd = d; best = c; }
    }
    return best;
  }
  serializeDoors() {
    const out = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === T.DOOR_OPEN) out.push(i);
    return out;
  }
}

// BFS over walkable tiles; closed and locked doors count as walkable (SPEC §9 item 10).
function wgReachability(world, fromTx, fromTy) {
  const w = world.w, h = world.h, n = w * h;
  const seen = new Uint8Array(n);
  if (fromTx < 0 || fromTy < 0 || fromTx >= w || fromTy >= h) return seen;
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const start = fromTy * w + fromTx;
  seen[start] = 1; queue[tail++] = start;
  const tiles = world.tiles;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i - x) / w;
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
      const ny = k === 2 ? y + 1 : k === 3 ? y - 1 : y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j]) continue;
      const t = tiles[j];
      if (WD_MOVE[t] === 1 && t !== T.DOOR_CLOSED && t !== T.DOOR_LOCKED) continue;
      seen[j] = 1; queue[tail++] = j;
    }
  }
  return seen;
}
