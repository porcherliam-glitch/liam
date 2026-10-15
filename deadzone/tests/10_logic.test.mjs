// Unit tests for pure logic, run in Node via tests/node_env.mjs (no browser).
import { loadGameEnv } from './node_env.mjs';
import { assert, assertEq, runTests } from './harness.mjs';

export default async function () {
  const env = loadGameEnv();
  const g = name => env.get(name);

  return runTests({
    async 'RNG is deterministic and in range'() {
      const RNG = g('RNG');
      const a = new RNG(12345), b = new RNG(12345);
      for (let i = 0; i < 1000; i++) {
        const x = a.next(), y = b.next();
        assertEq(x, y, 'same seed → same sequence');
        assert(x >= 0 && x < 1, 'next() in [0,1)');
      }
      const c = new RNG(7);
      for (let i = 0; i < 1000; i++) { const v = c.int(3, 9); assert(v >= 3 && v <= 9 && Number.isInteger(v), 'int range'); }
      assert(new RNG('abc').next() === new RNG('abc').next(), 'string seeds hashed deterministically');
      assert(new RNG(1).next() !== new RNG(2).next(), 'different seeds differ');
      const w = new RNG(3).weighted([{ w: 0, id: 'a' }, { w: 5, id: 'b' }]);
      assertEq(w.id, 'b', 'weighted picks only positive weights');
      const f1 = new RNG(9).fork('x'), f2 = new RNG(9).fork('x');
      assertEq(f1.next(), f2.next(), 'fork deterministic');
    },

    async 'Items: create, unknown id, weapon magazine'() {
      const Items = g('Items'), ITEMS = g('ITEMS');
      assert(Object.keys(ITEMS).length >= 90, `≥ 90 item definitions (got ${Object.keys(ITEMS).length})`);
      assertEq(Items.create('does_not_exist'), null, 'unknown id → null');
      const w = Items.create('pistol_m9');
      assert(w && w.uid && w.id === 'pistol_m9' && w.count === 1, 'weapon instance');
      assert(typeof w.mag === 'number' && w.mag > 0, 'weapon starts loaded');
      assert(typeof w.durability === 'number', 'weapon has durability');
      assert(w.ammoId && ITEMS[w.ammoId] && ITEMS[w.ammoId].ammo, 'weapon has a loaded ammo id');
      const ammo = Items.create('ammo_9mm', 30);
      assertEq(ammo.count, 30, 'stack count');
      assert(Items.weight(ammo) > 0 && Items.value(ammo) > 0, 'weight/value');
      for (const def of Object.values(ITEMS)) {
        assert(def.id && def.name && def.cat && def.rarity && def.desc, `item ${def.id} has required fields`);
        assert(typeof def.value === 'number' && typeof def.weight === 'number' && typeof def.stack === 'number', `item ${def.id} numeric fields`);
        assert(g('RARITY')[def.rarity], `item ${def.id} rarity valid`);
        assert(g('CATEGORY_NAMES')[def.cat], `item ${def.id} category '${def.cat}' known`);
        if (def.weapon) {
          assert(def.weapon.damage > 0 && def.weapon.fireRate > 0, `weapon ${def.id} damage/fireRate`);
          if (def.weapon.class !== 'melee') {
            assert(def.weapon.magSize > 0 && def.weapon.reloadTime > 0 && def.weapon.ammo, `weapon ${def.id} mag/reload/ammo`);
            assert(Items.standardAmmoFor(def.weapon.ammo), `weapon ${def.id}: standard ammo for caliber ${def.weapon.ammo}`);
          }
        }
        if (def.ammo) assert(g('AMMO_CALIBERS')[def.ammo.caliber], `ammo ${def.id} caliber`);
      }
      const round = Items.deserialize(Items.serialize(w));
      assertEq(round.id, w.id, 'serialize roundtrip id'); assertEq(round.mag, w.mag, 'serialize roundtrip mag');
    },

    async 'Inventory: stacking, split, move, transfer, weight, serialize'() {
      const Inventory = g('Inventory'), Items = g('Items');
      const inv = new Inventory(4);
      let r = inv.add(Items.create('ammo_9mm', 40));
      assert(r.ok && r.remaining === null, 'add fits');
      r = inv.add(Items.create('ammo_9mm', 40));
      assert(r.ok, 'second stack merges then overflows into next slot');
      assertEq(inv.count('ammo_9mm'), 80, 'count sums stacks');
      assert(inv.all().length === 2, 'two slots used (stack 60 + 20)');
      assert(inv.split(1, 10), 'split 20 → 10 + 10');
      assertEq(inv.all().length, 3, 'three stacks after split');
      assert(inv.move(2, 1), 'move merges stacks back');
      assertEq(inv.all().length, 2, 'two stacks after merge');
      inv.add(Items.create('pistol_m9'));
      inv.add(Items.create('melee_knife'));
      assert(inv.isFull(), 'inventory full with 4 slots');
      const r2 = inv.add(Items.create('med_bandage'));
      assert(!r2.ok && r2.remaining && r2.remaining.count === 1, 'full inventory rejects new item');
      assert(!inv.canAdd(Items.create('pistol_p45')), 'canAdd false when full');
      assert(inv.canAdd(Items.create('ammo_9mm', 20)), 'canAdd true when it can merge into an existing stack');
      const other = new Inventory(2);
      assert(inv.transfer(0, other), 'transfer to other inventory');
      assertEq(other.all().length, 1, 'other has item');
      assert(inv.weight() > 0, 'weight positive');
      const ser = inv.serialize();
      const back = Inventory.deserialize(ser, 4);
      assertEq(back.all().length, inv.all().length, 'deserialize keeps items');
      assertEq(back.slots, 4, 'deserialize keeps slots');
      const overflow = back.setSlots(1);
      assert(Array.isArray(overflow) && overflow.length >= 1, 'shrinking returns overflow');
    },

    async 'Equipment: slots and equip rules'() {
      const Equipment = g('Equipment'), Items = g('Items');
      const eq = new Equipment();
      assertEq(Equipment.slotFor(Items.create('rifle_ak')), 'primary', 'rifle → primary');
      assertEq(Equipment.slotFor(Items.create('pistol_m9')), 'secondary', 'pistol → secondary');
      assertEq(Equipment.slotFor(Items.create('melee_knife')), 'melee', 'knife → melee');
      assertEq(Equipment.slotFor(Items.create('armor_vest_light')), 'armorBody', 'vest → armorBody');
      assertEq(Equipment.slotFor(Items.create('pack_small')), 'backpack', 'pack → backpack');
      assertEq(Equipment.slotFor(Items.create('ammo_9mm')), null, 'ammo not equippable');
      const r = eq.equip(Items.create('pistol_m9'));
      assert(r.ok && r.replaced === null, 'equip pistol');
      const r2 = eq.equip(Items.create('pistol_p45'));
      assert(r2.ok && r2.replaced && r2.replaced.id === 'pistol_m9', 'equip replaces');
      assert(eq.equip(Items.create('pack_medium')).ok && eq.backpackSlots() === 20, 'backpack slots');
      assert(eq.carryBonus() > 0, 'carry bonus from backpack');
      const back = Equipment.deserialize(eq.serialize());
      assertEq(back.secondary.id, 'pistol_p45', 'equipment roundtrip');
    },

    async 'Data integrity: missions, loot tables, recipes, trader, zombies'() {
      const ITEMS = g('ITEMS'), MISSIONS = g('MISSIONS'), MAPS = g('MAPS'), LOOT_TABLES = g('LOOT_TABLES');
      const RECIPES = g('RECIPES'), TRADER_STOCK = g('TRADER_STOCK'), ZOMBIE_TYPES = g('ZOMBIE_TYPES'), UPGRADES = g('UPGRADES');
      const types = new Set(['collect', 'search', 'kill', 'kill_boss', 'retrieve', 'find_key', 'rescue_medical', 'investigate', 'generator', 'extract_at']);
      assert(MISSIONS.length >= 24, `≥ 24 missions (got ${MISSIONS.length})`);
      const ids = new Set();
      for (const m of MISSIONS) {
        assert(!ids.has(m.id), `duplicate mission id ${m.id}`); ids.add(m.id);
        assert(MAPS[m.mapId], `mission ${m.id} map ${m.mapId}`);
        assert(m.title && m.desc && m.rewards && typeof m.rewards.credits === 'number', `mission ${m.id} fields`);
        assert(Array.isArray(m.objectives) && m.objectives.length >= 1, `mission ${m.id} objectives`);
        for (const o of [...m.objectives, ...(m.optional || [])]) {
          assert(types.has(o.type), `mission ${m.id} objective type ${o.type}`);
          assert(o.text && o.id, `mission ${m.id} objective text/id`);
          if (['collect', 'retrieve', 'find_key'].includes(o.type)) assert(ITEMS[o.target], `mission ${m.id}: item ${o.target} exists`);
          if (o.type === 'kill' && o.target !== 'any') assert(ZOMBIE_TYPES[o.target], `mission ${m.id}: zombie ${o.target}`);
          if (o.type === 'extract_at') assert(MAPS[m.mapId].extractions.some(e => e.id === o.target), `mission ${m.id}: extraction ${o.target}`);
          if (o.type === 'kill_boss') assert(MAPS[m.mapId].boss, `mission ${m.id}: map has boss`);
        }
        for (const u of m.unlockedBy || []) assert(ids.has(u) || MISSIONS.some(x => x.id === u), `mission ${m.id} unlockedBy ${u}`);
        for (const it of m.rewards.items || []) assert(ITEMS[it.id], `mission ${m.id} reward item ${it.id}`);
      }
      for (const [k, t] of Object.entries(LOOT_TABLES)) {
        assert(Array.isArray(t.entries) && t.entries.length, `loot table ${k} entries`);
        for (const e of t.entries) {
          if (e.id) assert(ITEMS[e.id], `loot table ${k}: item ${e.id}`);
          if (e.cat) assert(g('CATEGORY_NAMES')[e.cat], `loot table ${k}: cat ${e.cat}`);
          assert(e.id || e.cat, `loot table ${k}: entry needs id or cat`);
        }
      }
      assert(RECIPES.length >= 16, `≥ 16 recipes (got ${RECIPES.length})`);
      for (const r of RECIPES) {
        for (const i of r.inputs) assert(ITEMS[i.id], `recipe ${r.id} input ${i.id}`);
        assert(ITEMS[r.output.id], `recipe ${r.id} output ${r.output.id}`);
        assert(['workshop', 'armory', 'medbay'].includes(r.station), `recipe ${r.id} station`);
      }
      assert(TRADER_STOCK.length >= 30, `≥ 30 trader lines (got ${TRADER_STOCK.length})`);
      for (const s of TRADER_STOCK) assert(ITEMS[s.id], `trader stock ${s.id}`);
      for (const z of Object.values(ZOMBIE_TYPES)) {
        assert(z.hp > 0 && z.speed > 0 && z.damage > 0 && z.radius > 0, `zombie ${z.id} stats`);
        for (const e of z.dropTable || []) if (e.id) assert(ITEMS[e.id], `zombie ${z.id} drop ${e.id}`);
      }
      for (const [area, levels] of Object.entries(UPGRADES)) {
        assertEq(levels.length, 3, `${area} has 3 upgrade levels`);
        for (const l of levels) for (const it of (l.cost.items || [])) assert(ITEMS[it.id], `upgrade ${area} cost item ${it.id}`);
      }
      for (const map of Object.values(MAPS)) {
        assert(map.extractions.length >= 3, `${map.id} has ≥ 3 extraction points`);
        assert(map.extractions.some(e => e.kind === 'always'), `${map.id} has an always-available extraction`);
        for (const e of map.extractions) if (e.requires) assert(ITEMS[e.requires], `${map.id} extraction ${e.id} requires ${e.requires}`);
        const sum = Object.values(map.zombies.weights).reduce((a, b) => a + b, 0);
        assert(Math.abs(sum - 1) < 0.05, `${map.id} zombie weights sum ≈ 1 (${sum})`);
        for (const t of Object.keys(map.zombies.weights)) assert(ZOMBIE_TYPES[t], `${map.id} zombie type ${t}`);
      }
    },

    async 'WorldGenerator: every map × seeds 1..20 is valid and reachable'() {
      const WorldGenerator = g('WorldGenerator'), MAPS = g('MAPS'), MISSIONS = g('MISSIONS');
      for (const mapId of Object.keys(MAPS)) {
        const defs = MISSIONS.filter(m => m.mapId === mapId);
        let total = 0;
        for (let seed = 1; seed <= 20; seed++) {
          const t0 = Date.now();
          const w = WorldGenerator.generate(mapId, seed, defs);
          total += Date.now() - t0;
          const v = WorldGenerator.validate(w);
          assert(v.ok, `${mapId} seed ${seed}: unreachable ${JSON.stringify(v.unreachable).slice(0, 300)}`);
          assert(w.extractions.length >= 3, `${mapId} seed ${seed}: extractions`);
          assert(w.buildings.length >= 8, `${mapId} seed ${seed}: buildings (${w.buildings.length})`);
          assert(w.containers.length >= 25, `${mapId} seed ${seed}: containers (${w.containers.length})`);
          assert(w.zombieSpawns.length >= 5, `${mapId} seed ${seed}: zombie spawns`);
          assert(w.pois.some(p => p.type === 'generator'), `${mapId} seed ${seed}: generator poi`);
          const ps = w.playerSpawn;
          assert(w.isWalkable(Math.floor(ps.x / 32), Math.floor(ps.y / 32)), `${mapId} seed ${seed}: player spawn walkable`);
          for (const e of w.extractions) assert(w.isWalkable(Math.floor(e.x / 32), Math.floor(e.y / 32)), `${mapId} seed ${seed}: extraction ${e.id} walkable`);
          for (const b of w.buildings) assert(b.doors.length >= 1, `${mapId} seed ${seed}: building ${b.id} has a door`);
          if (MAPS[mapId].boss) assert(w.bossArena, `${mapId}: boss arena`);
          // determinism
          if (seed === 1) {
            const w2 = WorldGenerator.generate(mapId, seed, defs);
            let same = w.tiles.length === w2.tiles.length;
            for (let i = 0; same && i < w.tiles.length; i++) same = w.tiles[i] === w2.tiles[i];
            assert(same, `${mapId}: generation deterministic for same seed`);
          }
        }
        assert(total / 20 < 1500, `${mapId}: average generation time ${(total / 20).toFixed(0)} ms < 1500 ms (Node)`);
      }
    },

    async 'Progression and profile validation'() {
      const xpForLevel = g('xpForLevel'), levelFromXp = g('levelFromXp'), ProfileManager = g('ProfileManager');
      let prev = -1;
      for (let l = 1; l <= 30; l++) { const v = xpForLevel(l); assert(v > prev, 'xpForLevel monotonic'); prev = v; }
      assertEq(levelFromXp(0), 1, 'level 1 at 0 xp');
      assertEq(levelFromXp(xpForLevel(5)), 5, 'levelFromXp inverse');
      const bad = ProfileManager.validate({ credits: 'abc', stash: 42, missions: null, version: 1 });
      assert(bad && bad.ok && bad.profile && typeof bad.profile.credits === 'number', 'validate repairs garbage into a usable profile');
      assert(!ProfileManager.validate(null).ok, 'validate(null) not ok');
      assert(!ProfileManager.validate('string').ok, 'validate(string) not ok');
    },
  });
}
