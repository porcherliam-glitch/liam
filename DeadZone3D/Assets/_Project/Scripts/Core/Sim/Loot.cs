using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    /// <summary>Loot rolls (port of 11_loot.js).</summary>
    public sealed class LootSystem
    {
        private static readonly Dictionary<string, Dictionary<string, double>> MapBias = new Dictionary<string, Dictionary<string, double>>
        {
            ["military"] = new Dictionary<string, double> { ["ammo"] = 1.5, ["armor"] = 1.5, ["weapon"] = 1.4, ["grenade"] = 1.5 },
            ["research"] = new Dictionary<string, double> { ["medical"] = 1.5, ["electronics"] = 1.5, ["collectible"] = 1.2 },
            ["industrial"] = new Dictionary<string, double> { ["material"] = 1.4, ["tool"] = 1.4, ["electronics"] = 1.3 },
            ["city"] = new Dictionary<string, double> { ["food"] = 1.3, ["water"] = 1.3, ["collectible"] = 1.2 },
        };
        private static readonly double[] T1 = { 70, 25, 5, 0, 0 };
        private static readonly double[] T5 = { 20, 30, 30, 15, 5 };
        private static readonly string[] Rarities = { "common", "uncommon", "rare", "epic", "legendary" };

        public readonly Rng rng;
        public readonly string mapId;

        public LootSystem(Rng raidRng, string mapId)
        {
            rng = (raidRng ?? new Rng(1234)).Fork("loot");
            this.mapId = mapId;
        }

        public Dictionary<string, double> RarityWeights(int tier)
        {
            double t = M.Clamp((Math.Max(1, tier) - 1) / 4.0, 0, 1);
            var outp = new Dictionary<string, double>();
            for (int i = 0; i < Rarities.Length; i++) outp[Rarities[i]] = M.Lerp(T1[i], T5[i], t);
            return outp;
        }

        private static bool Rollable(ItemDef def) => def != null && def.cat != "key" && def.cat != "mission";

        private sealed class W<TItem> { public TItem v; public double w; }

        public ItemDef PickByCategory(string cat, int tier)
        {
            var rw = RarityWeights(tier);
            var list = new List<W<ItemDef>>();
            foreach (var d in Items.List)
            {
                if (d.cat != cat || !Rollable(d)) continue;
                double w = rw.TryGetValue(d.rarity ?? "", out var rv) ? rv : 0;
                if (d.weapon != null && d.weapon.tier > 0) w *= d.weapon.tier <= Math.Max(1, tier) + 1 ? 1 : 0.25;
                if (w > 0) list.Add(new W<ItemDef> { v = d, w = w });
            }
            var pick = rng.Weighted(list, e => e.w);
            return pick?.v;
        }

        private ItemInst InstFor(ItemDef def, int[] countRange)
        {
            int count = 1;
            if (Math.Max(1, def.stack) > 1)
            {
                if (countRange != null && countRange.Length > 0)
                {
                    int a = countRange[0] != 0 ? countRange[0] : 1;
                    int b = countRange.Length > 1 && countRange[1] != 0 ? countRange[1] : a;
                    count = rng.Int(a, b);
                }
                else if (def.ammo != null) count = rng.Int(5, 30);
                count = M.Clamp(count, 1, def.stack);
            }
            var inst = Items.Create(def.id, count);
            if (inst == null) return null;
            if (def.durabilityMax > 0) inst.durability = M.Round(rng.Float(35, 95) / 100 * def.durabilityMax);
            if (def.weapon != null && inst.mag.HasValue) inst.mag = rng.Int(0, def.weapon.magSize);
            inst.raidFound = true;
            return inst;
        }

        private sealed class TableEntry { public string id, cat; public double w; public int[] count; public int minTier; }

        private List<ItemInst> RollTable(IEnumerable<TableEntry> table, int tier, int rolls)
        {
            var outp = new List<ItemInst>();
            if (table == null) return outp;
            MapBias.TryGetValue(mapId ?? "", out var bias);
            var rw = RarityWeights(tier);
            var entries = new List<W<TableEntry>>();
            foreach (var e in table)
            {
                if (e.minTier != 0 && e.minTier > tier) continue;
                double w = e.w;
                string cat = e.cat;
                if (e.id != null)
                {
                    var d = Items.Def(e.id);
                    if (!Rollable(d)) continue;
                    cat = d.cat;
                    w *= 0.35 + (rw.TryGetValue(d.rarity ?? "", out var rv) ? rv : 0) / 50;
                }
                if (bias != null && cat != null && bias.TryGetValue(cat, out var bm)) w *= bm;
                if (w > 0) entries.Add(new W<TableEntry> { v = e, w = w });
            }
            for (int i = 0; i < rolls; i++)
            {
                var pick = rng.Weighted(entries, x => x.w);
                if (pick == null) break;
                var e = pick.v;
                var def = e.id != null ? Items.Def(e.id) : PickByCategory(e.cat, tier);
                if (!Rollable(def)) continue;
                var inst = InstFor(def, e.count);
                if (inst != null) outp.Add(inst);
            }
            return outp;
        }

        private static IEnumerable<TableEntry> Entries(LootTable t) => t?.entries?.Select(e => new TableEntry { id = e.id, cat = e.cat, w = e.w, count = e.count, minTier = e.minTier });
        private static IEnumerable<TableEntry> Entries(DropEntry[] t) => t?.Select(e => new TableEntry { id = e.id, cat = e.cat, w = e.w, count = e.count });

        public static List<ItemInst> Merge(List<ItemInst> list)
        {
            var outp = new List<ItemInst>();
            foreach (var inst in list)
            {
                var tgt = outp.FirstOrDefault(o => Items.CanStack(o, inst) && o.count < Items.StackMax(o));
                if (tgt != null)
                {
                    int mv = Math.Min(inst.count, Items.StackMax(tgt) - tgt.count);
                    tgt.count += mv; inst.count -= mv;
                    if (inst.count > 0) outp.Add(inst);
                }
                else outp.Add(inst);
            }
            return outp;
        }

        public List<ItemInst> RollContainer(Container container)
        {
            if (container == null) return new List<ItemInst>();
            if (container.items != null) return container.items;
            DataTables.LOOT_TABLES.TryGetValue(container.type ?? "", out var table);
            if (table == null) DataTables.LOOT_TABLES.TryGetValue("crate", out table);
            int tier = M.Clamp(container.tier, 1, 5);
            var items = new List<ItemInst>();
            if (table != null && !rng.Chance(0.1))
            {
                var r = table.rolls != null && table.rolls.Length >= 2 ? table.rolls : new[] { 1, 3 };
                int rolls = rng.Int(r[0], r[1]) + (tier >= 4 ? 1 : 0);
                items = RollTable(Entries(table), tier, rolls);
            }
            items = Merge(items);
            foreach (var p in container.preset) if (p != null) { p.raidFound = true; items.Add(p); }
            container.preset = new List<ItemInst>();
            container.items = items.Take(12).ToList();
            return container.items;
        }

        public List<ItemInst> RollZombieDrop(ZombieDef type)
        {
            if (type == null) return new List<ItemInst>();
            if (type.id == "boss")
            {
                int n = rng.Int(3, 5);
                DataTables.LOOT_TABLES.TryGetValue("safe", out var table);
                return Merge(RollTable(Entries(table), 5, n));
            }
            if (!rng.Chance(type.lootChance)) return new List<ItemInst>();
            int tier = M.Clamp(type.tier, 1, 5);
            var drops = type.dropTable != null && type.dropTable.Length > 0 ? Entries(type.dropTable) : Entries(DataTables.LOOT_TABLES["zombie"]);
            return RollTable(drops, tier, type.tier >= 3 ? 2 : 1);
        }

        public ItemInst RollFloorLoot(int tier)
        {
            var r = RollTable(Entries(DataTables.LOOT_TABLES["floor"]), M.Clamp(tier, 1, 5), 1);
            return r.Count > 0 ? r[0] : null;
        }
    }
}
