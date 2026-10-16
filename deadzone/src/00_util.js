// 00_util.js — constants, RNG, math helpers, EventBus, Log, rarity/category tables.
// Public API: TILE, FIXED_DT, GAME_VERSION, SAVE_VERSION, RNG, hashString, clamp, lerp, dist, dist2,
// angleTo, normAngle, angleDiff, lerpAngle, deepClone, formatTime, formatCredits, formatWeight,
// circleRectOverlap, aabbOverlap, Uid, EventBus, Log, RARITY, CATEGORY_NAMES.
// Dependencies: none.

const TILE = 32;
const FIXED_DT = 1 / 60;
const GAME_VERSION = '1.0.0';
const SAVE_VERSION = 1;

function hashString(str) {
  // FNV-1a 32 bit
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class RNG {
  constructor(seed) {
    let s;
    if (typeof seed === 'number' && Number.isFinite(seed)) s = seed >>> 0;
    else s = hashString(seed === undefined || seed === null ? 'seed' : String(seed));
    this._seed = s;
    // sfc32 state from the seed via splitmix-ish scrambling
    let a = s ^ 0x9e3779b9, b = (s * 0x85ebca6b) >>> 0, c = (s * 0xc2b2ae35) >>> 0, d = s | 1;
    this.a = a >>> 0; this.b = b >>> 0; this.c = c >>> 0; this.d = d >>> 0;
    for (let i = 0; i < 12; i++) this.next();
  }
  get seed() { return this._seed; }
  next() {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a >>> 0; this.b = b >>> 0; this.c = c >>> 0; this.d = d >>> 0;
    return (t >>> 0) / 4294967296;
  }
  float(min, max) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr && arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }
  weighted(arr, weightKey = 'w') {
    if (!arr || !arr.length) return undefined;
    let total = 0;
    for (const e of arr) { const w = Number(e[weightKey]) || 0; if (w > 0) total += w; }
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const e of arr) {
      const w = Number(e[weightKey]) || 0;
      if (w <= 0) continue;
      r -= w;
      if (r < 0) return e;
    }
    for (let i = arr.length - 1; i >= 0; i--) if ((Number(arr[i][weightKey]) || 0) > 0) return arr[i];
    return undefined;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  fork(label) {
    const v = Math.floor(this.next() * 4294967296) >>> 0;
    return new RNG((v ^ hashString(label === undefined ? 'fork' : label)) >>> 0);
  }
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function normAngle(a) {
  a = a % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  else if (a > Math.PI) a -= Math.PI * 2;
  return a;
}
function angleDiff(a, b) { return normAngle(b - a); }
function lerpAngle(a, b, t) { return a + angleDiff(a, b) * t; }
function deepClone(obj) { return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)); }
function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return (m < 10 ? '0' + m : String(m)) + ':' + (s < 10 ? '0' + s : String(s));
}
function formatCredits(n) {
  n = Math.round(Number(n) || 0);
  const neg = n < 0; let s = String(Math.abs(n));
  let out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (neg ? '-' : '') + s + out + ' CR';
}
function formatWeight(kg) {
  const v = Math.round((Number(kg) || 0) * 10) / 10;
  return String(v.toFixed(1)).replace('.', ',') + ' kg';
}
function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

const Uid = {
  _counter: 0,
  next() {
    this._counter++;
    return 'u' + Date.now().toString(36) + '_' + this._counter.toString(36);
  },
};

class EventBus {
  constructor() { this._map = new Map(); }
  on(name, fn) {
    if (!this._map.has(name)) this._map.set(name, []);
    this._map.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const list = this._map.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  once(name, fn) {
    const wrap = (data) => { this.off(name, wrap); fn(data); };
    return this.on(name, wrap);
  }
  emit(name, data) {
    const list = this._map.get(name);
    if (!list || !list.length) return;
    for (const fn of list.slice()) {
      try { fn(data); } catch (e) { Log.error('EventBus listener for "' + name + '" failed:', e && e.message ? e.message : e); }
    }
  }
  clear() { this._map.clear(); }
}

const Log = {
  entries: [],
  errors: [],
  _push(level, args) {
    const msg = args.map(a => (typeof a === 'string' ? a : (a && a.message) ? a.message : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })())).join(' ');
    this.entries.push({ level, msg, time: Date.now() });
    if (this.entries.length > 300) this.entries.splice(0, this.entries.length - 300);
    return msg;
  },
  info(...a) { this._push('info', a); if (typeof console !== 'undefined') console.log('[DZ]', ...a); },
  warn(...a) { this._push('warn', a); if (typeof console !== 'undefined') console.warn('[DZ]', ...a); },
  error(...a) {
    const msg = this._push('error', a);
    this.errors.push(msg);
    if (this.errors.length > 100) this.errors.splice(0, this.errors.length - 100);
    if (typeof console !== 'undefined') console.error('[DZ]', ...a);
  },
};

const RARITY = {
  common:    { id: 'common',    name: 'Gewöhnlich',   color: '#9aa4ad', order: 0, mult: 1.0 },
  uncommon:  { id: 'uncommon',  name: 'Ungewöhnlich', color: '#4fbf5a', order: 1, mult: 1.6 },
  rare:      { id: 'rare',      name: 'Selten',       color: '#3f9dff', order: 2, mult: 2.8 },
  epic:      { id: 'epic',      name: 'Episch',       color: '#b86bff', order: 3, mult: 5.0 },
  legendary: { id: 'legendary', name: 'Legendär',     color: '#ffb12b', order: 4, mult: 9.0 },
};

const CATEGORY_NAMES = {
  weapon: 'Waffe', ammo: 'Munition', medical: 'Medizin', food: 'Nahrung', water: 'Wasser',
  material: 'Material', electronics: 'Elektronik', tool: 'Werkzeug', armor: 'Rüstung',
  backpack: 'Rucksack', key: 'Schlüssel', mission: 'Missionsgegenstand', collectible: 'Sammlerstück',
  grenade: 'Granate',
};
