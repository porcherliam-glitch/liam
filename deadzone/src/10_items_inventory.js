// 10_items_inventory.js — Items (instances, stats text, serialization), Inventory (grid slots), Equipment (SPEC §11).
// Decisions: Items.describe returns German tooltip lines; Inventory.sort keeps stacks merged; Equipment.protection()
//   reports {body, head} protection of non-broken armor (Player combines them, §14).
// Dependencies: 00_util.js, 01_data_items.js (ITEMS, RARITY, CATEGORY_NAMES), all at runtime.

const INV_CAT_ORDER = ['weapon', 'grenade', 'ammo', 'armor', 'backpack', 'medical', 'food', 'water', 'key', 'mission', 'collectible', 'electronics', 'tool', 'material'];

class Items {
  static def(instOrId) {
    if (!instOrId || typeof ITEMS === 'undefined') return null;
    const id = typeof instOrId === 'string' ? instOrId : instOrId.id;
    return (id && ITEMS[id]) || null;
  }
  static create(id, count = 1) {
    const def = Items.def(id);
    if (!def) { Log.warn('Items.create: unknown item id', id); return null; }
    const stack = Math.max(1, def.stack || 1);
    const n = clamp(Math.floor(Number(count) || 1), 1, stack);
    const inst = { uid: Uid.next(), id: def.id, count: n };
    if (def.durabilityMax) inst.durability = def.durabilityMax;
    if (def.weapon && def.weapon.class !== 'melee' && def.weapon.ammo) {
      inst.mag = def.weapon.magSize || 0;
      inst.ammoId = Items.standardAmmoFor(def.weapon.ammo);
    }
    return inst;
  }
  static clone(inst) {
    if (!inst) return null;
    const c = { uid: Uid.next(), id: inst.id, count: inst.count };
    if (inst.durability !== undefined) c.durability = inst.durability;
    if (inst.mag !== undefined) c.mag = inst.mag;
    if (inst.ammoId !== undefined) c.ammoId = inst.ammoId;
    if (inst.raidFound) c.raidFound = true;
    return c;
  }
  static canStack(a, b) {
    if (!a || !b || a.id !== b.id) return false;
    const def = Items.def(a);
    if (!def || (def.stack || 1) <= 1) return false;
    return a.durability === undefined && b.durability === undefined;
  }
  static stackMax(inst) { const d = Items.def(inst); return d ? Math.max(1, d.stack || 1) : 1; }
  static weight(inst) { const d = Items.def(inst); return d ? (d.weight || 0) * (inst.count || 1) : 0; }
  static value(inst) {
    const d = Items.def(inst);
    if (!d) return 0;
    let v = (d.value || 0) * (inst.count || 1);
    if (inst.durability !== undefined && d.durabilityMax) v *= 0.4 + 0.6 * clamp(inst.durability / d.durabilityMax, 0, 1);
    return v;
  }
  static rarity(inst) { const d = Items.def(inst); return (d && typeof RARITY !== 'undefined' && RARITY[d.rarity]) || (typeof RARITY !== 'undefined' ? RARITY.common : { id: 'common', color: '#9aa4ad', name: 'Gewöhnlich', order: 0 }); }
  static isWeapon(inst) { const d = Items.def(inst); return !!(d && d.weapon); }
  static isArmor(inst) { const d = Items.def(inst); return !!(d && d.armor); }
  static isUsable(inst) { const d = Items.def(inst); return !!(d && (d.medical || d.food || d.water)); }
  static isAmmo(inst) { const d = Items.def(inst); return !!(d && d.ammo); }
  static isGrenade(inst) { const d = Items.def(inst); return !!(d && (d.grenade || d.cat === 'grenade')); }
  static standardAmmoFor(caliber) {
    if (!caliber || typeof ITEMS === 'undefined') return null;
    let fallback = null;
    for (const d of Object.values(ITEMS)) {
      if (!d.ammo || d.ammo.caliber !== caliber) continue;
      if (d.ammo.label === 'Standard') return d.id;
      if (!fallback) fallback = d.id;
    }
    return fallback;
  }
  static weaponClassName(cls) {
    return { pistol: 'Pistole', smg: 'Maschinenpistole', rifle: 'Sturmgewehr', shotgun: 'Schrotflinte', sniper: 'Präzisionsgewehr', lmg: 'Leichtes MG', melee: 'Nahkampfwaffe' }[cls] || cls;
  }
  static describe(inst) {
    const d = Items.def(inst);
    if (!d) return [];
    const L = [];
    const pct = v => Math.round(v * 100) + ' %';
    const num = v => String(Math.round(v * 10) / 10).replace('.', ',');
    if (d.weapon) {
      const w = d.weapon;
      L.push('Typ: ' + Items.weaponClassName(w.class));
      if (w.class === 'melee') {
        L.push('Schaden: ' + w.damage);
        L.push('Reichweite: ' + Math.round((w.meleeRange || 60) / TILE * 10) / 10 + ' m');
        L.push('Schlagzeit: ' + num(w.swingTime || 0.5) + ' s');
      } else {
        L.push('Schaden: ' + w.damage + ((w.pellets || 1) > 1 ? ' × ' + w.pellets : ''));
        L.push('Feuerrate: ' + num(w.fireRate) + ' /s' + (w.auto ? ' (Automatik)' : ' (Einzelfeuer)'));
        L.push('DPS: ' + Math.round(w.damage * (w.pellets || 1) * w.fireRate));
        L.push('Magazin: ' + w.magSize + ' · Nachladen ' + num(w.reloadTime) + ' s');
        L.push('Reichweite: ' + Math.round(w.range / TILE) + ' m · Streuung ' + num(w.spread * 57.3) + '°');
        L.push('Rückstoß: ' + pct(w.recoil || 0) + ' · Lautstärke: ' + Math.round(w.noise / TILE) + ' m');
        if (typeof AMMO_CALIBERS !== 'undefined' && AMMO_CALIBERS[w.ammo]) L.push('Munition: ' + AMMO_CALIBERS[w.ammo]);
        if (inst && inst.mag !== undefined) {
          const ad = Items.def(inst.ammoId);
          L.push('Geladen: ' + inst.mag + (ad ? ' × ' + ad.name : ''));
        }
      }
      L.push('Durchschlag: ' + (w.penetration || 1));
    }
    if (d.ammo) {
      const a = d.ammo;
      if (typeof AMMO_CALIBERS !== 'undefined') L.push('Kaliber: ' + (AMMO_CALIBERS[a.caliber] || a.caliber));
      L.push('Art: ' + a.label);
      L.push('Schaden ×' + num(a.dmgMul || 1) + ' · Durchschlag ×' + num(a.penMul || 1) + ' · Lärm ×' + num(a.noiseMul || 1));
    }
    if (d.medical) {
      const m = d.medical;
      if (m.heal) L.push('Heilt sofort ' + m.heal + ' LP');
      if (m.overTime) L.push('Heilt ' + m.overTime + ' LP über ' + (m.duration || 20) + ' s');
      if (m.stopBleed) L.push('Stoppt Blutungen');
      if (m.cureToxic) L.push('Heilt Vergiftungen');
      if (m.stamina) L.push('Füllt Ausdauer auf' + (m.speed || d.id === 'med_adrenaline' ? ', +Tempo' : ''));
      L.push('Anwendung: ' + num(m.useTime || 2) + ' s');
    }
    if (d.food) L.push('Sättigung +' + d.food.hunger + ' · ' + num(d.food.useTime || 2) + ' s');
    if (d.water) L.push('Durst +' + d.water.thirst + ' · ' + num(d.water.useTime || 1.5) + ' s');
    if (d.armor) {
      L.push((d.armor.slot === 'head' ? 'Kopfschutz' : 'Körperschutz') + ': ' + pct(d.armor.protection));
      if (d.armor.speedMul && d.armor.speedMul < 1) L.push('Tempo: −' + pct(1 - d.armor.speedMul));
    }
    if (d.backpack) L.push('Plätze: ' + d.backpack.slots + ' · Traglast +' + d.backpack.weightBonus + ' kg');
    if (d.grenade) {
      const g = d.grenade;
      const kind = { frag: 'Splitter', molotov: 'Brand', flash: 'Blendung' }[g.kind] || g.kind;
      L.push('Art: ' + kind + ' · Radius ' + Math.round(g.radius / TILE) + ' m');
      if (g.damage) L.push('Schaden: ' + g.damage);
      L.push('Zünder: ' + num(g.fuse || 0) + ' s');
    }
    if (d.key) L.push('Öffnet: ' + (d.key.label || d.key.unlocks));
    if (inst && inst.durability !== undefined && d.durabilityMax) L.push('Zustand: ' + Math.round(inst.durability / d.durabilityMax * 100) + ' %');
    return L;
  }
  static serialize(inst) {
    if (!inst) return null;
    const o = { uid: inst.uid, id: inst.id, count: inst.count };
    if (inst.durability !== undefined) o.durability = inst.durability;
    if (inst.mag !== undefined) o.mag = inst.mag;
    if (inst.ammoId !== undefined) o.ammoId = inst.ammoId;
    return o;
  }
  static deserialize(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const d = Items.def(obj.id);
    if (!d) return null;
    const inst = { uid: typeof obj.uid === 'string' && obj.uid ? obj.uid : Uid.next(), id: d.id, count: clamp(Math.floor(Number(obj.count) || 1), 1, Math.max(1, d.stack || 1)) };
    if (d.durabilityMax) inst.durability = clamp(Number.isFinite(obj.durability) ? obj.durability : d.durabilityMax, 0, d.durabilityMax);
    if (d.weapon && d.weapon.class !== 'melee' && d.weapon.ammo) {
      inst.mag = clamp(Math.floor(Number.isFinite(obj.mag) ? obj.mag : 0), 0, d.weapon.magSize || 0);
      const ad = Items.def(obj.ammoId);
      inst.ammoId = ad && ad.ammo && ad.ammo.caliber === d.weapon.ammo ? ad.id : Items.standardAmmoFor(d.weapon.ammo);
    }
    return inst;
  }
}

class Inventory {
  constructor(slots) {
    this.slots = Math.max(0, Math.floor(Number(slots) || 0));
    this.items = new Array(this.slots).fill(null);
  }
  setSlots(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    const overflow = [];
    if (n < this.slots) {
      // compact first so as few items as possible overflow
      const all = this.all();
      this.items = new Array(n).fill(null);
      this.slots = n;
      for (const it of all) { const r = this.add(it); if (r.remaining) overflow.push(r.remaining); }
    } else {
      while (this.items.length < n) this.items.push(null);
      this.slots = n;
    }
    return overflow;
  }
  canAdd(inst) {
    if (!inst) return false;
    let need = inst.count || 1;
    const max = Items.stackMax(inst);
    for (const it of this.items) {
      if (!it) { need -= max; }
      else if (Items.canStack(it, inst)) need -= (max - it.count);
      if (need <= 0) return true;
    }
    return need <= 0;
  }
  add(inst) {
    if (!inst) return { ok: false, remaining: null };
    const max = Items.stackMax(inst);
    if (!inst.count || inst.count < 1) inst.count = 1;
    // merge into existing stacks
    for (let i = 0; i < this.slots && inst.count > 0; i++) {
      const it = this.items[i];
      if (it && it !== inst && Items.canStack(it, inst) && it.count < max) {
        const mv = Math.min(max - it.count, inst.count);
        it.count += mv; inst.count -= mv;
        if (inst.raidFound) it.raidFound = true;
      }
    }
    // empty slots
    for (let i = 0; i < this.slots && inst.count > 0; i++) {
      if (this.items[i]) continue;
      if (inst.count <= max) { this.items[i] = inst; return { ok: true, remaining: null }; }
      const part = Items.clone(inst);
      part.count = max; inst.count -= max;
      this.items[i] = part;
    }
    if (inst.count <= 0) return { ok: true, remaining: null };
    return { ok: false, remaining: inst };
  }
  addMany(list) {
    const rem = [];
    for (const inst of list || []) { const r = this.add(inst); if (r.remaining) rem.push(r.remaining); }
    return rem;
  }
  remove(uid, count = Infinity) {
    const i = this.indexOf(uid);
    if (i < 0) return null;
    const it = this.items[i];
    if (count >= it.count) { this.items[i] = null; return it; }
    const n = Math.max(1, Math.floor(count));
    const part = Items.clone(it);
    part.count = n; it.count -= n;
    return part;
  }
  removeById(id, count) {
    let need = Number.isFinite(count) ? count : Infinity, removed = 0;
    for (let i = this.slots - 1; i >= 0 && need > 0; i--) {
      const it = this.items[i];
      if (!it || it.id !== id) continue;
      const take = Math.min(need, it.count);
      it.count -= take; need -= take; removed += take;
      if (it.count <= 0) this.items[i] = null;
    }
    return removed;
  }
  count(id) { let n = 0; for (const it of this.items) if (it && it.id === id) n += it.count; return n; }
  has(id, count = 1) { return this.count(id) >= count; }
  get(idx) { return this.items[idx] || null; }
  set(idx, inst) { if (idx >= 0 && idx < this.slots) this.items[idx] = inst || null; }
  indexOf(uid) { for (let i = 0; i < this.slots; i++) if (this.items[i] && this.items[i].uid === uid) return i; return -1; }
  move(from, to) {
    if (from === to || from < 0 || to < 0 || from >= this.slots || to >= this.slots) return false;
    const a = this.items[from], b = this.items[to];
    if (!a) return false;
    if (b && Items.canStack(a, b)) {
      const max = Items.stackMax(b);
      const mv = Math.min(a.count, max - b.count);
      if (mv <= 0) { this.items[from] = b; this.items[to] = a; return true; }
      b.count += mv; a.count -= mv;
      if (a.count <= 0) this.items[from] = null;
      return true;
    }
    this.items[from] = b; this.items[to] = a;
    return true;
  }
  transfer(idx, other, toIdx = -1) {
    if (!other || idx < 0 || idx >= this.slots) return false;
    const a = this.items[idx];
    if (!a) return false;
    if (other === this) return toIdx >= 0 ? this.move(idx, toIdx) : false;
    if (toIdx < 0) {
      const before = a.count;
      this.items[idx] = null;
      const r = other.add(a);
      if (r.remaining) { this.items[idx] = r.remaining; return r.remaining.count < before; }
      return true;
    }
    if (toIdx >= other.slots) return false;
    const b = other.items[toIdx];
    if (!b) { other.items[toIdx] = a; this.items[idx] = null; return true; }
    if (Items.canStack(a, b)) {
      const max = Items.stackMax(b);
      const mv = Math.min(a.count, max - b.count);
      if (mv <= 0) return false;
      b.count += mv; a.count -= mv;
      if (a.count <= 0) this.items[idx] = null;
      return true;
    }
    other.items[toIdx] = a; this.items[idx] = b;
    return true;
  }
  split(idx, count) {
    const it = this.items[idx];
    if (!it) return false;
    count = Math.floor(Number(count));
    if (!(count >= 1 && count <= it.count - 1)) return false;
    const free = this.items.indexOf(null);
    if (free < 0) return false;
    const part = Items.clone(it);
    part.count = count; it.count -= count;
    this.items[free] = part;
    return true;
  }
  sort() {
    const all = this.all();
    // merge stacks
    const merged = [];
    for (const it of all) {
      const tgt = merged.find(m => Items.canStack(m, it) && m.count < Items.stackMax(m));
      if (tgt) {
        const mv = Math.min(it.count, Items.stackMax(tgt) - tgt.count);
        tgt.count += mv; it.count -= mv;
        if (it.count > 0) merged.push(it);
      } else merged.push(it);
    }
    merged.sort((a, b) => {
      const da = Items.def(a), db = Items.def(b);
      const ca = INV_CAT_ORDER.indexOf(da ? da.cat : ''), cb = INV_CAT_ORDER.indexOf(db ? db.cat : '');
      if (ca !== cb) return ca - cb;
      const ra = Items.rarity(a).order || 0, rb = Items.rarity(b).order || 0;
      if (ra !== rb) return rb - ra;
      return String(da ? da.name : '').localeCompare(String(db ? db.name : ''), 'de');
    });
    this.items = new Array(this.slots).fill(null);
    merged.slice(0, this.slots).forEach((it, i) => { this.items[i] = it; });
  }
  all() { return this.items.filter(Boolean); }
  freeSlots() { let n = 0; for (const it of this.items) if (!it) n++; return n; }
  isFull() { return this.freeSlots() === 0; }
  weight() { let w = 0; for (const it of this.items) if (it) w += Items.weight(it); return w; }
  totalValue() { let v = 0; for (const it of this.items) if (it) v += Items.value(it); return v; }
  clear() { this.items = new Array(this.slots).fill(null); }
  serialize() { return { slots: this.slots, items: this.items.map(it => (it ? Items.serialize(it) : null)) }; }
  static deserialize(obj, fallbackSlots) {
    const fb = Math.max(0, Math.floor(Number(fallbackSlots) || 0));
    if (!obj || typeof obj !== 'object') return new Inventory(fb);
    const slots = Number.isFinite(obj.slots) && obj.slots >= 0 && obj.slots <= 400 ? Math.floor(obj.slots) : fb;
    const inv = new Inventory(slots);
    const list = Array.isArray(obj.items) ? obj.items : [];
    const overflow = [];
    for (let i = 0; i < list.length; i++) {
      const inst = Items.deserialize(list[i]);
      if (!inst) continue;
      if (i < slots && !inv.items[i]) inv.items[i] = inst; else overflow.push(inst);
    }
    for (const it of overflow) inv.add(it);
    return inv;
  }
}

const EQUIP_SLOTS = ['primary', 'secondary', 'melee', 'grenade', 'armorBody', 'armorHead', 'backpack'];
const EQUIP_SLOT_NAMES = { primary: 'Primärwaffe', secondary: 'Sekundärwaffe', melee: 'Nahkampf', grenade: 'Granate', armorBody: 'Weste', armorHead: 'Helm', backpack: 'Rucksack' };

class Equipment {
  constructor() {
    for (const s of EQUIP_SLOTS) this[s] = null;
  }
  static slotFor(inst) {
    const d = Items.def(inst);
    if (!d) return null;
    if (d.weapon) {
      const c = d.weapon.class;
      if (c === 'melee') return 'melee';
      if (c === 'pistol' || c === 'smg') return 'secondary';
      return 'primary';
    }
    if (d.grenade || d.cat === 'grenade') return 'grenade';
    if (d.armor) return d.armor.slot === 'head' ? 'armorHead' : 'armorBody';
    if (d.backpack) return 'backpack';
    return null;
  }
  static accepts(slot, inst) {
    const d = Items.def(inst);
    if (!d) return false;
    const natural = Equipment.slotFor(inst);
    if (slot === natural) return true;
    if (slot === 'primary' && natural === 'secondary') return true;   // pistols/SMGs may go into primary
    return false;
  }
  canEquip(inst) { return !!Equipment.slotFor(inst); }
  equip(inst, slot = Equipment.slotFor(inst)) {
    if (!inst || !slot || !EQUIP_SLOTS.includes(slot) || !Equipment.accepts(slot, inst)) return { ok: false, replaced: null };
    const replaced = this[slot] || null;
    this[slot] = inst;
    return { ok: true, replaced };
  }
  unequip(slot) {
    if (!EQUIP_SLOTS.includes(slot)) return null;
    const it = this[slot] || null;
    this[slot] = null;
    return it;
  }
  get(slot) { return EQUIP_SLOTS.includes(slot) ? this[slot] || null : null; }
  slotOf(uid) { for (const s of EQUIP_SLOTS) if (this[s] && this[s].uid === uid) return s; return null; }
  weaponSlots() { return [this.primary, this.secondary, this.melee]; }
  all() { return EQUIP_SLOTS.map(s => this[s]).filter(Boolean); }
  weight() { let w = 0; for (const s of EQUIP_SLOTS) if (this[s]) w += Items.weight(this[s]); return w; }
  protection() {
    const p = (inst) => {
      if (!inst || inst.durability === undefined || inst.durability <= 0) return 0;
      const d = Items.def(inst);
      return d && d.armor ? d.armor.protection || 0 : 0;
    };
    return { body: p(this.armorBody), head: p(this.armorHead) };
  }
  speedMul() {
    let m = 1;
    for (const s of ['armorBody', 'armorHead']) { const d = Items.def(this[s]); if (d && d.armor && d.armor.speedMul) m *= d.armor.speedMul; }
    return m;
  }
  carryBonus() { const d = Items.def(this.backpack); return d && d.backpack ? d.backpack.weightBonus || 0 : 0; }
  backpackSlots() { const d = Items.def(this.backpack); return d && d.backpack ? d.backpack.slots || 6 : 6; }
  serialize() { const o = {}; for (const s of EQUIP_SLOTS) o[s] = this[s] ? Items.serialize(this[s]) : null; return o; }
  static deserialize(obj) {
    const e = new Equipment();
    if (!obj || typeof obj !== 'object') return e;
    for (const s of EQUIP_SLOTS) {
      const inst = Items.deserialize(obj[s]);
      if (inst && Equipment.accepts(s, inst)) e[s] = inst;
    }
    return e;
  }
}
