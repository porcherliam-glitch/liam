// 18_profile.js — ProfileManager: profile lifecycle, progression, loadout, base economy (trader, repair, crafting,
// healing, upgrades), loss rules, MIA rule, validation/migration (SPEC §19).
// Runtime vs saved form: profile.stash/loadout/secure are live Inventory instances and profile.equipment a live
//   Equipment while the game runs; serialize() returns the plain JSON-safe shape, setProfile(plain) hydrates it.
// Decisions: quickPack() is an extra convenience (Ausrüstung „Schnell packen“); upgrade effects follow the
//   SPEC formulas (stash +12 slots/level, medbay +10 HP/level, defense +1 secure slot and +5 kg/level, insurance at 3).
// Dependencies: 00_util.js, 01–04 data, 10_items_inventory.js, 19_progression.js.

const DEFAULT_SETTINGS = { master: 0.8, sfx: 1.0, music: 0.6, screenShake: true, showFps: false, touchControls: 'auto',
  quality: 'high', aimAssist: true, minimap: true, damageNumbers: true };

const PM_STATS_DEFAULT = { raids: 0, extractions: 0, deaths: 0, mia: 0, kills: 0, killsByType: {}, shotsFired: 0, shotsHit: 0, lootValue: 0,
  creditsEarned: 0, creditsSpent: 0, missionsCompleted: 0, missionsFailed: 0, playTime: 0, bestRaidValue: 0, containersOpened: 0, distance: 0,
  itemsCrafted: 0, upgradesBought: 0, achievements: [] };
const PM_UPGRADE_AREAS = ['stash', 'workshop', 'medbay', 'radio', 'defense', 'trader'];
const PM_AREA_NAMES = { stash: 'Lager', workshop: 'Werkstatt', medbay: 'Krankenstation', radio: 'Funkstation', defense: 'Verteidigungsanlage', trader: 'Händler' };

class ProfileManager {
  constructor(game) {
    this.game = game || null;
    this.profile = null;
  }

  // ---------------- accessors ----------------
  get stash() { return this.profile ? this.profile.stash : null; }
  get loadoutInventory() { return this.profile ? this.profile.loadout : null; }
  get equipment() { return this.profile ? this.profile.equipment : null; }
  get secureInv() { return this.profile ? this.profile.secure : null; }
  get stats() { return this.profile ? this.profile.stats : null; }
  _up(area) { return (this.profile && this.profile.upgrades && this.profile.upgrades[area]) || 0; }
  _rng() { return (this.game && this.game.rng) || (this._fallbackRng || (this._fallbackRng = new RNG(4242))); }
  _audio(n) { const a = this.game && this.game.audio; if (a) a.play(n); }
  _emit(name, data) { if (this.game && this.game.events) this.game.events.emit(name, data); }
  stashSlotsFor(level) { return STASH_SLOTS_BASE + 12 * (level || 0); }

  newProfile() {
    const eq = new Equipment();
    eq.secondary = Items.create('pistol_m9');
    if (eq.secondary) { eq.secondary.mag = Items.def('pistol_m9').weapon.magSize; eq.secondary.ammoId = 'ammo_9mm'; }
    eq.melee = Items.create('melee_knife');
    eq.backpack = Items.create('pack_small');
    const loadout = new Inventory(eq.backpackSlots());
    loadout.add(Items.create('ammo_9mm', 30));
    loadout.add(Items.create('med_bandage', 2));
    const stash = new Inventory(STASH_SLOTS_BASE);
    for (const [id, n] of [['ammo_9mm', 30], ['med_bandage', 2], ['food_beans', 2], ['water_bottle', 2]]) stash.add(Items.create(id, n));
    this.profile = {
      version: SAVE_VERSION, createdAt: Date.now(), name: 'Überlebender', credits: START_CREDITS, xp: 0, level: 1, hp: 100, hunger: 100, thirst: 100,
      stash, loadout, equipment: eq, secure: new Inventory(SECURE_SLOTS_BASE),
      upgrades: { stash: 0, workshop: 0, medbay: 0, radio: 0, defense: 0, trader: 0 },
      unlockedMaps: ['city'],
      missions: { active: [], completed: [], progress: {} },
      trader: { stock: [], restocks: 0 },
      stats: deepClone(PM_STATS_DEFAULT),
      raidInProgress: null, lastSaved: null,
    };
    this.unlockedMaps();
    this.restockTrader();
    this._emit('profileChanged');
    return this.profile;
  }

  setProfile(plain) {
    const v = ProfileManager.validate(plain);
    if (!v.ok) return false;
    const p = v.profile;
    const live = Object.assign({}, p);
    live.stash = Inventory.deserialize(p.stash, this.stashSlotsFor(p.upgrades.stash));
    if (live.stash.slots < this.stashSlotsFor(p.upgrades.stash)) live.stash.setSlots(this.stashSlotsFor(p.upgrades.stash));
    live.equipment = Equipment.deserialize(p.equipment);
    live.loadout = Inventory.deserialize(p.loadout, live.equipment.backpackSlots());
    live.secure = Inventory.deserialize(p.secure, SECURE_SLOTS_BASE + (p.upgrades.defense || 0));
    this.profile = live;
    // slots must follow the equipment / upgrades
    const over = live.loadout.setSlots(live.equipment.backpackSlots());
    for (const it of over) live.stash.add(it);
    const over2 = live.secure.setSlots(this.secureSlots());
    for (const it of over2) live.stash.add(it);
    this.unlockedMaps();
    this._emit('profileChanged');
    return true;
  }

  serialize() {
    const p = this.profile;
    if (!p) return null;
    const out = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === 'stash' || k === 'loadout' || k === 'secure' || k === 'equipment') out[k] = v && typeof v.serialize === 'function' ? v.serialize() : v;
      else out[k] = deepClone(v);
    }
    out.version = SAVE_VERSION;
    out.level = this.level();
    return out;
  }

  // ---------------- progression ----------------
  addXp(n) {
    const p = this.profile;
    if (!p || !(n > 0)) return { leveledUp: false, newLevel: this.level(), unlockedMaps: [] };
    const before = this.level();
    const mapsBefore = this.unlockedMaps().slice();
    p.xp = Math.round((p.xp || 0) + n);
    const after = this.level();
    p.level = after;
    const maps = this.unlockedMaps();
    const fresh = maps.filter(m => !mapsBefore.includes(m));
    if (after > before) {
      this._emit('levelUp', { level: after, unlockedMaps: fresh });
      this._audio('level_up');
    }
    return { leveledUp: after > before, newLevel: after, unlockedMaps: fresh };
  }
  level() { return this.profile ? Progression.levelFromXp(this.profile.xp || 0) : 1; }
  xp() { return this.profile ? this.profile.xp || 0 : 0; }
  xpProgress() { return Progression.progress(this.xp()); }
  unlockedMaps() {
    if (!this.profile) return ['city'];
    const ids = Progression.unlockedMapsFor(this.level(), this._up('radio'));
    this.profile.unlockedMaps = ids;
    return ids;
  }
  isMapUnlocked(mapId) { return this.unlockedMaps().includes(mapId); }

  // ---------------- loadout ----------------
  secureSlots() { return SECURE_SLOTS_BASE + this._up('defense'); }
  carryLimit() { return CARRY_BASE + (this.equipment ? this.equipment.carryBonus() : 0) + 5 * this._up('defense'); }
  hpMax() { return 100 + 10 * this._up('medbay'); }
  loadoutWeight() {
    if (!this.profile) return 0;
    return this.profile.loadout.weight() + this.profile.equipment.weight() + this.profile.secure.weight();
  }

  buildLoadout() {
    const p = this.profile;
    const equipment = Equipment.deserialize(p.equipment.serialize());
    const inv = Inventory.deserialize(p.loadout.serialize(), equipment.backpackSlots());
    const over = inv.setSlots(equipment.backpackSlots());
    for (const it of over) p.stash.add(it);
    const secure = Inventory.deserialize(p.secure.serialize(), this.secureSlots());
    secure.setSlots(this.secureSlots());
    return { equipment, inventory: inv, secure, hp: p.hp, hpMax: this.hpMax(), hunger: p.hunger, thirst: p.thirst };
  }

  loadoutWarnings() {
    const p = this.profile;
    if (!p) return [];
    const W = [];
    const eq = p.equipment;
    const guns = [eq.primary, eq.secondary].filter(Boolean);
    if (!guns.length && !eq.melee) W.push('Keine Waffe ausgerüstet');
    else if (!guns.length) W.push('Nur eine Nahkampfwaffe ausgerüstet');
    for (const g of guns) {
      const d = Items.def(g);
      if (!d || !d.weapon) continue;
      const cal = d.weapon.ammo;
      const reserve = [...p.loadout.all(), ...p.secure.all()].reduce((n, it) => { const ad = Items.def(it); return n + (ad && ad.ammo && ad.ammo.caliber === cal ? it.count : 0); }, 0);
      if (reserve === 0) W.push('Keine Ersatzmunition für ' + d.name);
    }
    if (![...p.loadout.all(), ...p.secure.all()].some(it => { const d = Items.def(it); return d && d.medical; })) W.push('Keine Medizin dabei');
    if (this.loadoutWeight() > this.carryLimit()) W.push('Überladen: ' + formatWeight(this.loadoutWeight()) + ' / ' + formatWeight(this.carryLimit()));
    if (p.hp < this.hpMax() * 0.6) W.push('Verletzt (' + Math.round(p.hp) + '/' + this.hpMax() + ') – Krankenstation aufsuchen');
    if ((p.hunger ?? 100) < 40 || (p.thirst ?? 100) < 40) W.push('Hunger/Durst niedrig – Nahrung/Wasser einpacken');
    for (const g of guns) if (g.durability !== undefined && g.durability < 25) W.push((Items.def(g) || {}).name + ' ist stark beschädigt');
    return W;
  }

  _fixLoadoutSlots() {
    const p = this.profile;
    const over = p.loadout.setSlots(p.equipment.backpackSlots());
    for (const it of over) { const r = p.stash.add(it); if (r.remaining) { /* no space anywhere: keep it in loadout by growing temporarily is not possible */ } }
  }

  moveStashToLoadout(uid, count = Infinity) {
    const p = this.profile;
    if (!p) return false;
    const inst = p.stash.remove(uid, count);
    if (!inst) return false;
    const r = p.loadout.add(inst);
    if (r.remaining) p.stash.add(r.remaining);
    return !r.remaining || r.remaining.count < (inst.count || 0) + 1;
  }
  moveLoadoutToStash(uid, count = Infinity) {
    const p = this.profile;
    if (!p) return false;
    let src = p.loadout;
    if (src.indexOf(uid) < 0) src = p.secure;
    const inst = src.remove(uid, count);
    if (!inst) return false;
    const r = p.stash.add(inst);
    if (r.remaining) src.add(r.remaining);
    return !r.remaining;
  }
  moveToSecure(uid, fromLoadout = false) {
    const p = this.profile;
    const src = fromLoadout ? p.loadout : p.stash;
    const inst = src.remove(uid);
    if (!inst) return false;
    const r = p.secure.add(inst);
    if (r.remaining) src.add(r.remaining);
    return !r.remaining;
  }
  _equipFrom(inv, uid, slot) {
    const p = this.profile;
    const idx = inv.indexOf(uid);
    if (idx < 0) return { ok: false, reason: 'Gegenstand nicht gefunden' };
    const inst = inv.items[idx];
    const s = slot || Equipment.slotFor(inst);
    if (!s || !Equipment.accepts(s, inst)) return { ok: false, reason: 'Kann nicht ausgerüstet werden' };
    inv.items[idx] = null;
    const r = p.equipment.equip(inst, s);
    if (!r.ok) { inv.items[idx] = inst; return { ok: false, reason: 'Kann nicht ausgerüstet werden' }; }
    if (r.replaced) {
      const back = inv.add(r.replaced);
      if (back.remaining) { const s2 = p.stash.add(back.remaining); if (s2.remaining) { p.equipment.equip(r.replaced, s); inv.items[idx] = inst; return { ok: false, reason: 'Kein Platz für den alten Gegenstand' }; } }
    }
    if (s === 'backpack') this._fixLoadoutSlots();
    return { ok: true };
  }
  equipFromStash(uid, slot) { return this.profile ? this._equipFrom(this.profile.stash, uid, slot) : { ok: false }; }
  equipFromLoadout(uid, slot) { return this.profile ? this._equipFrom(this.profile.loadout, uid, slot) : { ok: false }; }
  unequipToStash(slot) {
    const p = this.profile;
    if (!p) return false;
    const inst = p.equipment.get(slot);
    if (!inst || !p.stash.canAdd(inst)) return false;
    p.equipment.unequip(slot);
    p.stash.add(inst);
    if (slot === 'backpack') this._fixLoadoutSlots();
    return true;
  }

  // Convenience: pack ammo for the equipped guns, two meds, food and water from the stash.
  quickPack() {
    const p = this.profile;
    if (!p) return 0;
    let moved = 0;
    const take = (pred, amount) => {
      let need = amount;
      for (const it of p.stash.all()) {
        if (need <= 0) break;
        if (!pred(it)) continue;
        const n = Math.min(need, it.count);
        if (this.moveStashToLoadout(it.uid, n)) { moved++; need -= n; }
      }
    };
    for (const g of [p.equipment.primary, p.equipment.secondary].filter(Boolean)) {
      const d = Items.def(g);
      if (!d || !d.weapon || !d.weapon.ammo) continue;
      const have = p.loadout.all().reduce((n, it) => { const ad = Items.def(it); return n + (ad && ad.ammo && ad.ammo.caliber === d.weapon.ammo ? it.count : 0); }, 0);
      const want = d.weapon.magSize * 3 - have;
      if (want > 0) take(it => { const ad = Items.def(it); return ad && ad.ammo && ad.ammo.caliber === d.weapon.ammo; }, want);
    }
    const count = pred => p.loadout.all().filter(pred).reduce((n, it) => n + it.count, 0);
    const isMed = it => { const d = Items.def(it); return d && d.medical && (d.medical.heal || d.medical.stopBleed); };
    if (count(isMed) < 2) take(isMed, 2 - count(isMed));
    const isFood = it => { const d = Items.def(it); return d && d.food; };
    const isWater = it => { const d = Items.def(it); return d && d.water; };
    if (count(isFood) < 1) take(isFood, 1);
    if (count(isWater) < 1) take(isWater, 1);
    return moved;
  }

  // ---------------- economy ----------------
  sellPrice(inst, count = inst ? inst.count : 1) {
    if (!inst) return 0;
    const unit = Items.value(inst) / Math.max(1, inst.count || 1);
    return Math.max(1, Math.round(unit * count * ECONOMY.sellMul * (1 + this._up('trader') * ECONOMY.traderSellBonus)));
  }
  buyPrice(def) {
    if (!def) return 0;
    return Math.max(1, Math.round((def.value || 1) * ECONOMY.buyMul * (1 - this._up('trader') * ECONOMY.traderBuyDiscount)));
  }
  sell(uid, count = Infinity) {
    const p = this.profile;
    if (!p) return { ok: false, credits: 0 };
    const idx = p.stash.indexOf(uid);
    if (idx < 0) return { ok: false, credits: 0 };
    const it = p.stash.items[idx];
    const n = Math.min(it.count, Number.isFinite(count) ? Math.max(1, Math.floor(count)) : it.count);
    const credits = this.sellPrice(it, n);
    p.stash.remove(uid, n);
    p.credits += credits;
    p.stats.creditsEarned += credits;
    this._audio('sell');
    return { ok: true, credits };
  }
  restockTrader() {
    const p = this.profile;
    if (!p) return;
    const lvl = this._up('trader');
    const rng = this._rng();
    const stock = [];
    for (const line of TRADER_STOCK) {
      if ((line.minLevel || 0) > lvl) continue;
      if ((line.minLevel || 0) > 0 && !rng.chance(line.chance ?? 1)) continue;
      const def = Items.def(line.id);
      if (!def) continue;
      const range = Array.isArray(line.stock) ? line.stock : [1, 3];
      let count = rng.int(range[0], range[1]);
      if (def.ammo && (line.minLevel || 0) === 0) count = Math.max(20, count);
      if ((line.minLevel || 0) === 0) count = Math.max(1, count);
      const price = line.basePrice ? Math.round(line.basePrice * (1 - lvl * ECONOMY.traderBuyDiscount)) : this.buyPrice(def);
      stock.push({ id: def.id, price, count });
    }
    p.trader = { stock, restocks: ((p.trader && p.trader.restocks) || 0) + 1 };
  }
  buy(stockIndex, count = 1) {
    const p = this.profile;
    if (!p || !p.trader) return { ok: false, reason: 'Kein Händler' };
    const line = p.trader.stock[stockIndex];
    if (!line) return { ok: false, reason: 'Nicht im Angebot' };
    const n = Math.min(line.count, Math.max(1, Math.floor(count)));
    if (n <= 0) return { ok: false, reason: 'Ausverkauft' };
    const cost = line.price * n;
    if (p.credits < cost) return { ok: false, reason: 'Nicht genug Credits' };
    const def = Items.def(line.id);
    const stack = Math.max(1, def.stack || 1);
    // build instances and check space first
    const test = new Inventory(p.stash.slots);
    test.items = p.stash.items.map(it => (it ? Items.clone(it) : null));
    const insts = [];
    for (let left = n; left > 0;) { const c = Math.min(stack, left); const inst = Items.create(line.id, c); insts.push(inst); left -= c; }
    for (const inst of insts) { const r = test.add(Items.clone(inst)); if (r.remaining) return { ok: false, reason: 'Lager voll' }; }
    for (const inst of insts) p.stash.add(inst);
    p.credits -= cost;
    p.stats.creditsSpent += cost;
    line.count -= n;
    this._audio('buy');
    return { ok: true, reason: null, cost };
  }
  findItem(uid) {
    const p = this.profile;
    if (!p) return null;
    for (const inv of [p.stash, p.loadout, p.secure]) { const i = inv.indexOf(uid); if (i >= 0) return { inst: inv.items[i], inv }; }
    const slot = p.equipment.slotOf(uid);
    if (slot) return { inst: p.equipment[slot], slot };
    return null;
  }
  repairCost(inst) {
    const d = Items.def(inst);
    if (!d || !d.durabilityMax || inst.durability === undefined) return 0;
    const missing = (d.durabilityMax - inst.durability) / d.durabilityMax;
    if (missing <= 0) return 0;
    return Math.max(1, Math.round(missing * (d.value || 0) * ECONOMY.repairCostMul * (1 - 0.15 * this._up('workshop'))));
  }
  repair(uid) {
    const p = this.profile;
    const f = this.findItem(uid);
    if (!f) return { ok: false, reason: 'Gegenstand nicht gefunden' };
    const cost = this.repairCost(f.inst);
    if (cost <= 0) return { ok: false, reason: 'Nicht beschädigt' };
    if (p.credits < cost) return { ok: false, reason: 'Nicht genug Credits' };
    p.credits -= cost;
    p.stats.creditsSpent += cost;
    f.inst.durability = Items.def(f.inst).durabilityMax;
    this._audio('craft');
    return { ok: true, cost };
  }
  stationLevel(station) { return station === 'medbay' ? this._up('medbay') : this._up('workshop'); }
  recipesFor(station) {
    const lvl = this.stationLevel(station);
    return RECIPES.filter(r => r.station === station).map(r => ({ recipe: r, unlocked: (r.requiresLevel || 0) <= lvl, can: this.canCraft(r.id).ok }));
  }
  canCraft(recipeId) {
    const p = this.profile;
    const r = RECIPES.find(x => x.id === recipeId);
    if (!p || !r) return { ok: false, reason: 'Unbekanntes Rezept' };
    if ((r.requiresLevel || 0) > this.stationLevel(r.station)) return { ok: false, reason: 'Ausbaustufe ' + r.requiresLevel + ' nötig' };
    for (const i of r.inputs) if (p.stash.count(i.id) < i.count) return { ok: false, reason: 'Material fehlt: ' + ((Items.def(i.id) || {}).name || i.id) };
    const out = Items.create(r.output.id, r.output.count || 1);
    if (!out) return { ok: false, reason: 'Ungültiges Rezept' };
    return { ok: true, reason: null };
  }
  craft(recipeId) {
    const c = this.canCraft(recipeId);
    if (!c.ok) return c;
    const p = this.profile;
    const r = RECIPES.find(x => x.id === recipeId);
    const removed = [];
    for (const i of r.inputs) { p.stash.removeById(i.id, i.count); removed.push(i); }
    const out = Items.create(r.output.id, r.output.count || 1);
    const res = p.stash.add(out);
    if (res.remaining) {
      // no space: refund the inputs
      p.stash.removeById(r.output.id, (r.output.count || 1) - res.remaining.count);
      for (const i of removed) p.stash.add(Items.create(i.id, i.count));
      return { ok: false, reason: 'Lager voll' };
    }
    p.stats.itemsCrafted++;
    this._audio('craft');
    return { ok: true, reason: null };
  }
  healCost() {
    const p = this.profile;
    if (!p) return 0;
    if (this._up('medbay') >= 3) return 0;
    return Math.max(0, Math.ceil((this.hpMax() - p.hp) * ECONOMY.healCostPerHp));
  }
  heal() {
    const p = this.profile;
    if (!p) return { ok: false, reason: 'Kein Spielstand' };
    const cost = this.healCost();
    if (p.hp >= this.hpMax() && p.hunger >= 100 && p.thirst >= 100) return { ok: false, reason: 'Du bist bereits fit' };
    if (p.credits < cost) return { ok: false, reason: 'Nicht genug Credits' };
    p.credits -= cost;
    p.stats.creditsSpent += cost;
    p.hp = this.hpMax();
    p.hunger = 100; p.thirst = 100;
    this._audio('heal');
    return { ok: true, cost };
  }
  useMedicalFromStash(uid) { return this.useFromStash(uid); }
  useFromStash(uid) {
    const p = this.profile;
    const idx = p ? p.stash.indexOf(uid) : -1;
    if (idx < 0) return { ok: false, reason: 'Nicht gefunden' };
    const d = Items.def(p.stash.items[idx]);
    if (!d || !(d.medical || d.food || d.water)) return { ok: false, reason: 'Nicht benutzbar' };
    if (d.medical) p.hp = Math.min(this.hpMax(), p.hp + (d.medical.heal || 0) + (d.medical.overTime || 0));
    if (d.food) p.hunger = clamp(p.hunger + (d.food.hunger || 0), 0, 100);
    if (d.water) p.thirst = clamp(p.thirst + (d.water.thirst || 0), 0, 100);
    p.stash.remove(uid, 1);
    this._audio(d.medical ? 'heal' : 'eat');
    return { ok: true };
  }
  canUpgrade(area) {
    const p = this.profile;
    if (!p || !PM_UPGRADE_AREAS.includes(area)) return { ok: false, reason: 'Unbekannter Bereich' };
    const lvl = this._up(area);
    if (lvl >= 3) return { ok: false, reason: 'Maximale Stufe erreicht' };
    const info = upgradeInfo(area, lvl + 1);
    if (!info) return { ok: false, reason: 'Keine weitere Stufe' };
    const cost = info.cost || {};
    if (p.credits < (cost.credits || 0)) return { ok: false, reason: 'Nicht genug Credits' };
    for (const it of cost.items || []) if (p.stash.count(it.id) < it.count) return { ok: false, reason: 'Material fehlt: ' + ((Items.def(it.id) || {}).name || it.id) + ' ×' + it.count };
    if (info.requiresLevel && this.level() < info.requiresLevel) return { ok: false, reason: 'Ab Stufe ' + info.requiresLevel };
    return { ok: true, reason: null, info };
  }
  upgrade(area) {
    const c = this.canUpgrade(area);
    if (!c.ok) return c;
    const p = this.profile;
    const cost = c.info.cost || {};
    p.credits -= cost.credits || 0;
    p.stats.creditsSpent += cost.credits || 0;
    for (const it of cost.items || []) p.stash.removeById(it.id, it.count);
    p.upgrades[area] = this._up(area) + 1;
    if (area === 'stash') p.stash.setSlots(this.stashSlotsFor(p.upgrades.stash));
    if (area === 'defense') p.secure.setSlots(this.secureSlots());
    if (area === 'radio') this.unlockedMaps();
    if (area === 'trader') this.restockTrader();
    p.stats.upgradesBought++;
    this._audio('craft');
    return { ok: true, reason: null };
  }

  // ---------------- loss rules ----------------
  recordStat(key, n = 1) { if (this.profile && this.profile.stats) this.profile.stats[key] = (this.profile.stats[key] || 0) + n; }

  _mergeRaidStats(st) {
    const s = this.profile.stats;
    for (const k of ['kills', 'shotsFired', 'shotsHit', 'containersOpened']) s[k] = (s[k] || 0) + (st[k] || 0);
    s.distance = (s.distance || 0) + Math.round((st.distance || 0) / TILE);
    s.killsByType = s.killsByType || {};
    for (const [k, v] of Object.entries(st.killsByType || {})) s.killsByType[k] = (s.killsByType[k] || 0) + v;
  }

  applyRaidResult(result, player, raid) {
    const p = this.profile;
    if (!p || !player) return result;
    const rng = this._rng();
    const strip = (inst) => { if (inst) delete inst.rt; return inst; };
    this._mergeRaidStats(player.stats || {});
    p.stats.raids++;
    if (result.outcome === 'extracted') {
      p.equipment = player.equipment;
      for (const s of EQUIP_SLOTS) strip(p.equipment[s]);
      let lootValue = 0;
      const kept = [], sold = [];
      for (const inv of [player.inventory, player.secure]) {
        for (const it of inv.all()) {
          strip(it);
          if (it.raidFound) lootValue += Items.value(it);
          const copy = Items.clone(it);
          const r = p.stash.add(it);
          if (r.remaining) {
            const credits = Math.max(1, Math.round(Items.value(r.remaining) * ECONOMY.overflowSellMul));
            p.credits += credits;
            p.stats.creditsEarned += credits;
            result.creditsGained += credits;
            sold.push({ inst: Items.clone(r.remaining), credits });
            if (copy.count > r.remaining.count) { copy.count -= r.remaining.count; kept.push({ inst: copy }); }
          } else kept.push({ inst: copy });
        }
      }
      for (const s of EQUIP_SLOTS) if (p.equipment[s]) kept.push({ inst: Items.clone(p.equipment[s]), equipped: true });
      result.itemsKept = kept;
      result.itemsSold = sold;
      result.lootValue = Math.round(lootValue);
      p.loadout = new Inventory(p.equipment.backpackSlots());
      p.secure = new Inventory(this.secureSlots());
      p.hp = clamp(Math.round(player.hp), 1, this.hpMax());
      p.hunger = clamp(player.hunger, 0, 100);
      p.thirst = clamp(player.thirst, 0, 100);
      const xp = Math.round((raid ? raid.xp : 0) + XP_REWARDS.extraction + lootValue * XP_REWARDS.perLootValue);
      result.xpGained = xp;
      this.addXp(xp);
      p.stats.extractions++;
      p.stats.lootValue += Math.round(lootValue);
      p.stats.bestRaidValue = Math.max(p.stats.bestRaidValue || 0, Math.round(lootValue));
    } else {
      const lost = [], insured = [];
      const insurance = this._up('defense') >= 3 ? 0.5 : 0;
      const newEq = new Equipment();
      for (const s of EQUIP_SLOTS) {
        const it = player.equipment[s];
        if (!it) continue;
        strip(it);
        if (insurance > 0 && rng.chance(insurance)) { newEq[s] = it; insured.push(Items.clone(it)); }
        else lost.push({ inst: Items.clone(it), equipped: true });
      }
      for (const it of player.inventory.all()) lost.push({ inst: Items.clone(it) });
      const kept = [];
      for (const it of player.secure.all()) {
        strip(it);
        const copy = Items.clone(it);
        const r = p.stash.add(it);
        if (r.remaining) {
          const credits = Math.max(1, Math.round(Items.value(r.remaining) * ECONOMY.overflowSellMul));
          p.credits += credits; result.creditsGained += credits;
          result.itemsSold.push({ inst: Items.clone(r.remaining), credits });
        }
        kept.push({ inst: copy, secure: true });
      }
      p.equipment = newEq;
      p.loadout = new Inventory(newEq.backpackSlots());
      p.secure = new Inventory(this.secureSlots());
      p.hp = 35;
      p.hunger = 60; p.thirst = 60;
      result.itemsLost = lost;
      result.itemsKept = kept;
      result.insuranceReturned = insured;
      const xp = Math.round(raid ? raid.xp : 0);
      result.xpGained = xp;
      this.addXp(xp);
      if (result.outcome === 'mia') p.stats.mia++; else p.stats.deaths++;
    }
    p.raidInProgress = null;
    this.restockTrader();
    return result;
  }

  applyMiaOnReload() {
    const p = this.profile;
    const res = { lost: [], insured: [] };
    if (!p) return res;
    const rng = this._rng();
    const insurance = this._up('defense') >= 3 ? 0.5 : 0;
    const newEq = new Equipment();
    for (const s of EQUIP_SLOTS) {
      const it = p.equipment[s];
      if (!it) continue;
      if (insurance > 0 && rng.chance(insurance)) { newEq[s] = it; res.insured.push(it); } else res.lost.push(it);
    }
    for (const it of p.loadout.all()) res.lost.push(it);
    for (const it of p.secure.all()) p.stash.add(it);
    p.equipment = newEq;
    p.loadout = new Inventory(newEq.backpackSlots());
    p.secure = new Inventory(this.secureSlots());
    p.hp = 35; p.hunger = 60; p.thirst = 60;
    p.stats.mia++; p.stats.raids++;
    p.raidInProgress = null;
    this.restockTrader();
    return res;
  }

  // ---------------- validation ----------------
  static migrate(obj) {
    switch (obj.version) {
      case 0:
        obj.version = 1;
      // falls through
      default:
        obj.version = SAVE_VERSION;
    }
    return obj;
  }

  static validate(obj) {
    const repaired = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, profile: null, repaired, error: 'Kein gültiger Spielstand' };
    if (typeof obj.version !== 'number' || !Number.isFinite(obj.version)) return { ok: false, profile: null, repaired, error: 'Versionsangabe fehlt' };
    if (obj.version > SAVE_VERSION) return { ok: false, profile: null, repaired, error: 'Spielstand stammt aus einer neueren Version' };
    let src = obj;
    // accept a live profile (instances) as well
    const plainify = (v) => (v && typeof v.serialize === 'function' ? v.serialize() : v);
    src = Object.assign({}, src, { stash: plainify(src.stash), loadout: plainify(src.loadout), secure: plainify(src.secure), equipment: plainify(src.equipment) });
    try { src = JSON.parse(JSON.stringify(src)); } catch (e) { return { ok: false, profile: null, repaired, error: 'Spielstand nicht lesbar' }; }
    if (src.version < SAVE_VERSION) { ProfileManager.migrate(src); repaired.push('Spielstand auf Version ' + SAVE_VERSION + ' aktualisiert'); }
    const num = (v, d, name, min = -Infinity, max = Infinity) => {
      if (typeof v === 'number' && Number.isFinite(v)) return clamp(v, min, max);
      repaired.push(name + ' zurückgesetzt');
      return d;
    };
    const out = { version: SAVE_VERSION };
    out.createdAt = num(src.createdAt, 0, 'Erstellungsdatum');
    out.name = typeof src.name === 'string' && src.name.length < 40 ? src.name : 'Überlebender';
    out.credits = Math.round(num(src.credits, START_CREDITS, 'Credits', 0, 1e9));
    out.xp = Math.round(num(src.xp, 0, 'Erfahrung', 0, 1e9));
    out.level = Progression.levelFromXp(out.xp);
    out.upgrades = {};
    const up = src.upgrades && typeof src.upgrades === 'object' ? src.upgrades : (repaired.push('Ausbaustufen zurückgesetzt'), {});
    for (const a of PM_UPGRADE_AREAS) out.upgrades[a] = Math.round(clamp(Number.isFinite(up[a]) ? up[a] : 0, 0, 3));
    const hpMax = 100 + 10 * out.upgrades.medbay;
    out.hp = num(src.hp, hpMax, 'Lebenspunkte', 1, hpMax);
    out.hunger = num(src.hunger, 100, 'Hunger', 0, 100);
    out.thirst = num(src.thirst, 100, 'Durst', 0, 100);
    const invCheck = (v, slots, name) => {
      if (!v || typeof v !== 'object') { repaired.push(name + ' war beschädigt und wurde geleert'); return new Inventory(slots).serialize(); }
      const before = Array.isArray(v.items) ? v.items.filter(Boolean).length : 0;
      const inv = Inventory.deserialize(v, slots);
      if (inv.slots < slots) inv.setSlots(slots);
      const after = inv.all().length;
      if (after < before) repaired.push(name + ': ' + (before - after) + ' unbekannte Gegenstände entfernt');
      return inv.serialize();
    };
    out.stash = invCheck(src.stash, STASH_SLOTS_BASE + 12 * out.upgrades.stash, 'Lager');
    let eq;
    if (!src.equipment || typeof src.equipment !== 'object') { repaired.push('Ausrüstung zurückgesetzt'); eq = new Equipment(); }
    else eq = Equipment.deserialize(src.equipment);
    out.equipment = eq.serialize();
    out.loadout = invCheck(src.loadout, eq.backpackSlots(), 'Rucksack');
    out.secure = invCheck(src.secure, SECURE_SLOTS_BASE + out.upgrades.defense, 'Sicherer Behälter');
    const maps = Array.isArray(src.unlockedMaps) ? src.unlockedMaps.filter(id => typeof MAPS !== 'undefined' && MAPS[id]) : [];
    out.unlockedMaps = maps.length ? maps : ['city'];
    const ms = src.missions && typeof src.missions === 'object' ? src.missions : (repaired.push('Aufträge zurückgesetzt'), {});
    const okId = id => typeof id === 'string' && typeof MISSION_BY_ID !== 'undefined' && !!MISSION_BY_ID[id];
    out.missions = {
      active: Array.isArray(ms.active) ? ms.active.filter(okId) : [],
      completed: Array.isArray(ms.completed) ? ms.completed.filter(okId) : [],
      progress: {},
    };
    if (ms.progress && typeof ms.progress === 'object') {
      for (const [id, pr] of Object.entries(ms.progress)) {
        if (!okId(id) || !pr || typeof pr !== 'object') continue;
        out.missions.progress[id] = {};
        for (const [k, v] of Object.entries(pr)) if (Number.isFinite(v)) out.missions.progress[id][k] = v;
      }
    }
    const tr = src.trader && typeof src.trader === 'object' ? src.trader : {};
    out.trader = {
      stock: Array.isArray(tr.stock) ? tr.stock.filter(l => l && typeof ITEMS !== 'undefined' && ITEMS[l.id] && Number.isFinite(l.price) && Number.isFinite(l.count)).map(l => ({ id: l.id, price: Math.max(1, Math.round(l.price)), count: Math.max(0, Math.round(l.count)) })) : [],
      restocks: Number.isFinite(tr.restocks) ? tr.restocks : 0,
    };
    const st = src.stats && typeof src.stats === 'object' ? src.stats : (repaired.push('Statistiken zurückgesetzt'), {});
    out.stats = deepClone(PM_STATS_DEFAULT);
    for (const k of Object.keys(PM_STATS_DEFAULT)) {
      if (k === 'killsByType') { if (st.killsByType && typeof st.killsByType === 'object') for (const [t, v] of Object.entries(st.killsByType)) if (Number.isFinite(v)) out.stats.killsByType[t] = v; }
      else if (k === 'achievements') { if (Array.isArray(st.achievements)) out.stats.achievements = st.achievements.filter(a => typeof a === 'string'); }
      else if (Number.isFinite(st[k])) out.stats[k] = st[k];
    }
    const rip = src.raidInProgress;
    out.raidInProgress = rip && typeof rip === 'object' && typeof rip.mapId === 'string' ? { mapId: rip.mapId, missionIds: Array.isArray(rip.missionIds) ? rip.missionIds.filter(okId) : [], seed: Number.isFinite(rip.seed) ? rip.seed : 0, startedAt: Number.isFinite(rip.startedAt) ? rip.startedAt : 0 } : null;
    out.lastSaved = Number.isFinite(src.lastSaved) ? src.lastSaved : null;
    return { ok: true, profile: out, repaired };
  }
}
