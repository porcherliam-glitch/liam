// 11_loot.js — LootSystem: rarity weighting by tier, container rolls, zombie drops, floor loot (SPEC §12).
// Decisions: map bias multiplies table entry weights (military: ammo/armor/weapon ×1.5, research: medical/electronics ×1.5,
//   industrial: material/tool/electronics ×1.4); container.preset items (mission items, keys) are appended after rolling.
// Dependencies: 00_util.js, 01/02/04 data, 10_items_inventory.js.

const LOOT_MAP_BIAS = {
  military: { ammo: 1.5, armor: 1.5, weapon: 1.4, grenade: 1.5 },
  research: { medical: 1.5, electronics: 1.5, collectible: 1.2 },
  industrial: { material: 1.4, tool: 1.4, electronics: 1.3 },
  city: { food: 1.3, water: 1.3, collectible: 1.2 },
};
const LOOT_T1 = [70, 25, 5, 0, 0];
const LOOT_T5 = [20, 30, 30, 15, 5];
const LOOT_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

class LootSystem {
  constructor(raid) {
    this.raid = raid || null;
    const base = raid && raid.rng && typeof raid.rng.fork === 'function' ? raid.rng : new RNG(1234);
    this.rng = base.fork('loot');
    this.mapId = raid && (raid.mapId || (raid.map && raid.map.id)) || null;
  }

  rarityWeights(tier) {
    const t = clamp(((Number(tier) || 1) - 1) / 4, 0, 1);
    const out = {};
    LOOT_RARITIES.forEach((r, i) => { out[r] = lerp(LOOT_T1[i], LOOT_T5[i], t); });
    return out;
  }

  _rollable(def) { return def && def.cat !== 'key' && def.cat !== 'mission'; }

  pickByCategory(cat, tier) {
    if (typeof ITEMS === 'undefined') return null;
    const rw = this.rarityWeights(tier);
    const list = [];
    for (const d of Object.values(ITEMS)) {
      if (d.cat !== cat || !this._rollable(d)) continue;
      let w = rw[d.rarity] || 0;
      // weapon tiers: prefer weapons within reach of the area tier
      if (d.weapon && d.weapon.tier) w *= d.weapon.tier <= (tier || 1) + 1 ? 1 : 0.25;
      if (w > 0) list.push({ d, w });
    }
    const pick = this.rng.weighted(list);
    return pick ? pick.d : null;
  }

  _instFor(def, countRange, tier) {
    let count = 1;
    if ((def.stack || 1) > 1) {
      if (Array.isArray(countRange)) count = this.rng.int(countRange[0] || 1, countRange[1] || countRange[0] || 1);
      else if (def.ammo) count = this.rng.int(5, 30);
      else count = 1;
      count = clamp(count, 1, def.stack);
    }
    const inst = Items.create(def.id, count);
    if (!inst) return null;
    if (def.durabilityMax) inst.durability = Math.round(this.rng.float(35, 95) / 100 * def.durabilityMax);
    if (def.weapon && inst.mag !== undefined) inst.mag = this.rng.int(0, def.weapon.magSize || 0);
    inst.raidFound = true;
    return inst;
  }

  _rollTable(table, tier, rolls) {
    const out = [];
    if (!table || !Array.isArray(table.entries)) return out;
    const bias = LOOT_MAP_BIAS[this.mapId] || {};
    const rw = this.rarityWeights(tier);
    const entries = table.entries.filter(e => !e.minTier || e.minTier <= tier).map(e => {
      let w = Number(e.w) || 0;
      let cat = e.cat;
      if (e.id) {
        const d = Items.def(e.id);
        if (!this._rollable(d)) return null;
        cat = d.cat;
        // single items still follow the rarity curve of the area
        w *= 0.35 + (rw[d.rarity] || 0) / 50;
      }
      w *= bias[cat] || 1;
      return { e, w };
    }).filter(x => x && x.w > 0);
    for (let i = 0; i < rolls; i++) {
      const pick = this.rng.weighted(entries);
      if (!pick) break;
      const e = pick.e;
      const def = e.id ? Items.def(e.id) : this.pickByCategory(e.cat, tier);
      if (!this._rollable(def)) continue;
      const inst = this._instFor(def, e.count, tier);
      if (inst) out.push(inst);
    }
    return out;
  }

  _merge(list) {
    const out = [];
    for (const inst of list) {
      const tgt = out.find(o => Items.canStack(o, inst) && o.count < Items.stackMax(o));
      if (tgt) {
        const mv = Math.min(inst.count, Items.stackMax(tgt) - tgt.count);
        tgt.count += mv; inst.count -= mv;
        if (inst.count > 0) out.push(inst);
      } else out.push(inst);
    }
    return out;
  }

  rollContainer(container, world) {
    if (!container) return [];
    if (Array.isArray(container.items)) return container.items;
    const tables = typeof LOOT_TABLES !== 'undefined' ? LOOT_TABLES : {};
    const table = tables[container.type] || tables.crate || null;
    const tier = clamp(container.tier || 1, 1, 5);
    let items = [];
    if (table && !this.rng.chance(0.1)) {
      const r = Array.isArray(table.rolls) ? table.rolls : [1, 3];
      const rolls = this.rng.int(r[0], r[1]) + (tier >= 4 ? 1 : 0);
      items = this._rollTable(table, tier, rolls);
    }
    items = this._merge(items);
    for (const p of container.preset || []) { if (p) { p.raidFound = true; items.push(p); } }
    container.preset = [];
    container.items = items.slice(0, 12);
    return container.items;
  }

  rollZombieDrop(zombie) {
    const type = zombie && zombie.type;
    if (!type) return [];
    if (type.id === 'boss') {
      const out = [];
      const n = this.rng.int(3, 5);
      const table = (typeof LOOT_TABLES !== 'undefined' && (LOOT_TABLES.safe || LOOT_TABLES.military_crate)) || null;
      out.push(...this._rollTable(table, 5, n));
      return this._merge(out);
    }
    if (!this.rng.chance(type.lootChance ?? 0.25)) return [];
    const tier = clamp(type.tier || 1, 1, 5);
    const drops = Array.isArray(type.dropTable) && type.dropTable.length ? { entries: type.dropTable } : (typeof LOOT_TABLES !== 'undefined' ? LOOT_TABLES.zombie : null);
    return this._rollTable(drops, tier, type.tier >= 3 ? 2 : 1);
  }

  rollFloorLoot(tier) {
    const table = typeof LOOT_TABLES !== 'undefined' ? LOOT_TABLES.floor : null;
    const r = this._rollTable(table, clamp(tier || 1, 1, 5), 1);
    return r[0] || null;
  }
}
