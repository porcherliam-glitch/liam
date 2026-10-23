using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    /// <summary>One item stack (port of the item instance objects of the HTML version).</summary>
    public sealed class ItemInst
    {
        public string uid, id, ammoId;
        public int count = 1;
        public double? durability;
        public int? mag;
        public bool raidFound;
        /// <summary>Runtime weapon state during a raid (never saved).</summary>
        public WeaponRt rt;
        public ItemDef Def => Items.Def(id);
    }

    public static class Items
    {
        public static readonly string[] CatOrder = { "weapon", "grenade", "ammo", "armor", "backpack", "medical", "food", "water", "key", "mission", "collectible", "electronics", "tool", "material" };
        public static readonly ItemDef[] List = DataTables.ITEMS.Values.ToArray();

        public static ItemDef Def(string id) => id != null && DataTables.ITEMS.TryGetValue(id, out var d) ? d : null;
        public static ItemDef Def(ItemInst inst) => inst == null ? null : Def(inst.id);

        public static ItemInst Create(string id, int count = 1)
        {
            var def = Def(id);
            if (def == null) { Log.Warn("Items.create: unknown item id " + id); return null; }
            int stack = Math.Max(1, def.stack);
            var inst = new ItemInst { uid = Uid.Next(), id = def.id, count = M.Clamp(count < 1 ? 1 : count, 1, stack) };
            if (def.durabilityMax > 0) inst.durability = def.durabilityMax;
            if (def.weapon != null && def.weapon.@class != "melee" && def.weapon.ammo != null)
            {
                inst.mag = def.weapon.magSize;
                inst.ammoId = StandardAmmoFor(def.weapon.ammo);
            }
            return inst;
        }

        public static ItemInst Clone(ItemInst inst)
        {
            if (inst == null) return null;
            return new ItemInst { uid = Uid.Next(), id = inst.id, count = inst.count, durability = inst.durability, mag = inst.mag, ammoId = inst.ammoId, raidFound = inst.raidFound };
        }

        public static bool CanStack(ItemInst a, ItemInst b)
        {
            if (a == null || b == null || a.id != b.id) return false;
            var def = Def(a);
            if (def == null || Math.Max(1, def.stack) <= 1) return false;
            return !a.durability.HasValue && !b.durability.HasValue;
        }

        public static int StackMax(ItemInst inst) { var d = Def(inst); return d != null ? Math.Max(1, d.stack) : 1; }
        public static double Weight(ItemInst inst) { var d = Def(inst); return d != null ? d.weight * inst.count : 0; }

        public static double Value(ItemInst inst)
        {
            var d = Def(inst);
            if (d == null) return 0;
            double v = d.value * (double)inst.count;
            if (inst.durability.HasValue && d.durabilityMax > 0) v *= 0.4 + 0.6 * M.Clamp(inst.durability.Value / d.durabilityMax, 0, 1);
            return v;
        }

        public static RarityDef Rarity(ItemInst inst)
        {
            var d = Def(inst);
            return d != null && d.rarity != null && DataTables.RARITY.TryGetValue(d.rarity, out var r) ? r : DataTables.RARITY["common"];
        }

        public static bool IsWeapon(ItemInst i) => Def(i)?.weapon != null;
        public static bool IsArmor(ItemInst i) => Def(i)?.armor != null;
        public static bool IsUsable(ItemInst i) { var d = Def(i); return d != null && (d.medical != null || d.food != null || d.water != null); }
        public static bool IsAmmo(ItemInst i) => Def(i)?.ammo != null;
        public static bool IsGrenade(ItemInst i) { var d = Def(i); return d != null && (d.grenade != null || d.cat == "grenade"); }

        private static readonly Dictionary<string, string> AmmoCache = new Dictionary<string, string>();
        public static string StandardAmmoFor(string caliber)
        {
            if (caliber == null) return null;
            lock (AmmoCache)
            {
                if (AmmoCache.TryGetValue(caliber, out var cached)) return cached;
                string fallback = null, found = null;
                foreach (var d in List)
                {
                    if (d.ammo == null || d.ammo.caliber != caliber) continue;
                    if (d.ammo.label == "Standard") { found = d.id; break; }
                    if (fallback == null) fallback = d.id;
                }
                return AmmoCache[caliber] = found ?? fallback;
            }
        }

        public static string WeaponClassName(string cls)
        {
            switch (cls)
            {
                case "pistol": return "Pistole";
                case "smg": return "Maschinenpistole";
                case "rifle": return "Sturmgewehr";
                case "shotgun": return "Schrotflinte";
                case "sniper": return "Präzisionsgewehr";
                case "lmg": return "Leichtes MG";
                case "melee": return "Nahkampfwaffe";
            }
            return cls;
        }

        public static string CategoryName(string cat) => cat != null && DataTables.CATEGORY_NAMES.TryGetValue(cat, out var n) ? n : cat;

        /// <summary>German tooltip lines.</summary>
        public static List<string> Describe(ItemInst inst)
        {
            var d = Def(inst);
            var L = new List<string>();
            if (d == null) return L;
            const int TILE = World.TILE;
            if (d.weapon != null)
            {
                var w = d.weapon;
                L.Add("Typ: " + WeaponClassName(w.@class));
                if (w.@class == "melee")
                {
                    L.Add("Schaden: " + M.Num1(w.damage));
                    L.Add("Reichweite: " + M.Num1((w.meleeRange > 0 ? w.meleeRange : 60) / TILE) + " m");
                    L.Add("Schlagzeit: " + M.Num1(w.swingTime > 0 ? w.swingTime : 0.5) + " s");
                }
                else
                {
                    int pellets = Math.Max(1, w.pellets);
                    L.Add("Schaden: " + M.Num1(w.damage) + (pellets > 1 ? " × " + pellets : ""));
                    L.Add("Feuerrate: " + M.Num1(w.fireRate) + " /s" + (w.auto ? " (Automatik)" : " (Einzelfeuer)"));
                    L.Add("DPS: " + M.Round(w.damage * pellets * w.fireRate));
                    L.Add("Magazin: " + w.magSize + " · Nachladen " + M.Num1(w.reloadTime) + " s");
                    L.Add("Reichweite: " + M.Round(w.range / TILE) + " m · Streuung " + M.Num1(w.spread * 57.3) + "°");
                    L.Add("Rückstoß: " + M.Pct(w.recoil) + " · Lautstärke: " + M.Round(w.noise / TILE) + " m");
                    if (w.ammo != null && DataTables.AMMO_CALIBERS.TryGetValue(w.ammo, out var cal)) L.Add("Munition: " + cal);
                    if (inst != null && inst.mag.HasValue)
                    {
                        var ad = Def(inst.ammoId);
                        L.Add("Geladen: " + inst.mag.Value + (ad != null ? " × " + ad.name : ""));
                    }
                }
                L.Add("Durchschlag: " + Math.Max(1, w.penetration));
            }
            if (d.ammo != null)
            {
                var a = d.ammo;
                L.Add("Kaliber: " + (DataTables.AMMO_CALIBERS.TryGetValue(a.caliber ?? "", out var cal) ? cal : a.caliber));
                L.Add("Art: " + a.label);
                L.Add("Schaden ×" + M.Num1(a.dmgMul > 0 ? a.dmgMul : 1) + " · Durchschlag ×" + M.Num1(a.penMul > 0 ? a.penMul : 1) + " · Lärm ×" + M.Num1(a.noiseMul > 0 ? a.noiseMul : 1));
            }
            if (d.medical != null)
            {
                var m = d.medical;
                if (m.heal > 0) L.Add("Heilt sofort " + M.Num1(m.heal) + " LP");
                if (m.overTime > 0) L.Add("Heilt " + M.Num1(m.overTime) + " LP über " + M.Num1(m.duration > 0 ? m.duration : 20) + " s");
                if (m.stopBleed) L.Add("Stoppt Blutungen");
                if (m.cureToxic) L.Add("Heilt Vergiftungen");
                if (m.stamina > 0) L.Add("Füllt Ausdauer auf" + (d.id == "med_adrenaline" ? ", +Tempo" : ""));
                L.Add("Anwendung: " + M.Num1(m.useTime > 0 ? m.useTime : 2) + " s");
            }
            if (d.food != null) L.Add("Sättigung +" + M.Num1(d.food.hunger) + " · " + M.Num1(d.food.useTime > 0 ? d.food.useTime : 2) + " s");
            if (d.water != null) L.Add("Durst +" + M.Num1(d.water.thirst) + " · " + M.Num1(d.water.useTime > 0 ? d.water.useTime : 1.5) + " s");
            if (d.armor != null)
            {
                L.Add((d.armor.slot == "head" ? "Kopfschutz" : "Körperschutz") + ": " + M.Pct(d.armor.protection));
                if (d.armor.speedMul > 0 && d.armor.speedMul < 1) L.Add("Tempo: −" + M.Pct(1 - d.armor.speedMul));
            }
            if (d.backpack != null) L.Add("Plätze: " + d.backpack.slots + " · Traglast +" + M.Num1(d.backpack.weightBonus) + " kg");
            if (d.grenade != null)
            {
                var g = d.grenade;
                string kind = g.kind == "frag" ? "Splitter" : g.kind == "molotov" ? "Brand" : g.kind == "flash" ? "Blendung" : g.kind;
                L.Add("Art: " + kind + " · Radius " + M.Round(g.radius / TILE) + " m");
                if (g.damage > 0) L.Add("Schaden: " + M.Num1(g.damage));
                L.Add("Zünder: " + M.Num1(g.fuse) + " s");
            }
            if (d.key != null) L.Add("Öffnet: " + d.key.unlocks);
            if (inst != null && inst.durability.HasValue && d.durabilityMax > 0) L.Add("Zustand: " + M.Round(inst.durability.Value / d.durabilityMax * 100) + " %");
            return L;
        }

        // ---- serialization (JSON tree objects: Dictionary<string, object>)
        public static Dictionary<string, object> Serialize(ItemInst inst)
        {
            if (inst == null) return null;
            var o = new Dictionary<string, object> { ["uid"] = inst.uid, ["id"] = inst.id, ["count"] = inst.count };
            if (inst.durability.HasValue) o["durability"] = inst.durability.Value;
            if (inst.mag.HasValue) o["mag"] = inst.mag.Value;
            if (inst.ammoId != null) o["ammoId"] = inst.ammoId;
            return o;
        }

        public static ItemInst Deserialize(object raw)
        {
            if (!(raw is Dictionary<string, object> obj)) return null;
            var d = Def(Json.Str(obj, "id"));
            if (d == null) return null;
            string uid = Json.Str(obj, "uid");
            var inst = new ItemInst { uid = string.IsNullOrEmpty(uid) ? Uid.Next() : uid, id = d.id, count = M.Clamp((int)Math.Floor(Json.Num(obj, "count", 1)), 1, Math.Max(1, d.stack)) };
            if (d.durabilityMax > 0) inst.durability = M.Clamp(Json.Num(obj, "durability", d.durabilityMax), 0, d.durabilityMax);
            if (d.weapon != null && d.weapon.@class != "melee" && d.weapon.ammo != null)
            {
                inst.mag = M.Clamp((int)Math.Floor(Json.Num(obj, "mag", 0)), 0, d.weapon.magSize);
                var ad = Def(Json.Str(obj, "ammoId"));
                inst.ammoId = ad != null && ad.ammo != null && ad.ammo.caliber == d.weapon.ammo ? ad.id : StandardAmmoFor(d.weapon.ammo);
            }
            return inst;
        }
    }

    public sealed class AddResult { public bool ok; public ItemInst remaining; }

    /// <summary>Slot inventory (port of class Inventory).</summary>
    public sealed class Inventory
    {
        public int slots;
        public ItemInst[] items;

        public Inventory(int slots)
        {
            this.slots = Math.Max(0, slots);
            items = new ItemInst[this.slots];
        }

        public List<ItemInst> SetSlots(int n)
        {
            n = Math.Max(0, n);
            var overflow = new List<ItemInst>();
            if (n < slots)
            {
                var all = All();
                items = new ItemInst[n];
                slots = n;
                foreach (var it in all) { var r = Add(it); if (r.remaining != null) overflow.Add(r.remaining); }
            }
            else
            {
                Array.Resize(ref items, n);
                slots = n;
            }
            return overflow;
        }

        public bool CanAdd(ItemInst inst)
        {
            if (inst == null) return false;
            int need = Math.Max(1, inst.count);
            int max = Items.StackMax(inst);
            foreach (var it in items)
            {
                if (it == null) need -= max;
                else if (Items.CanStack(it, inst)) need -= max - it.count;
                if (need <= 0) return true;
            }
            return need <= 0;
        }

        public AddResult Add(ItemInst inst)
        {
            if (inst == null) return new AddResult();
            int max = Items.StackMax(inst);
            if (inst.count < 1) inst.count = 1;
            for (int i = 0; i < slots && inst.count > 0; i++)
            {
                var it = items[i];
                if (it != null && it != inst && Items.CanStack(it, inst) && it.count < max)
                {
                    int mv = Math.Min(max - it.count, inst.count);
                    it.count += mv; inst.count -= mv;
                    if (inst.raidFound) it.raidFound = true;
                }
            }
            for (int i = 0; i < slots && inst.count > 0; i++)
            {
                if (items[i] != null) continue;
                if (inst.count <= max) { items[i] = inst; return new AddResult { ok = true }; }
                var part = Items.Clone(inst);
                part.count = max; inst.count -= max;
                items[i] = part;
            }
            if (inst.count <= 0) return new AddResult { ok = true };
            return new AddResult { ok = false, remaining = inst };
        }

        public List<ItemInst> AddMany(IEnumerable<ItemInst> list)
        {
            var rem = new List<ItemInst>();
            if (list == null) return rem;
            foreach (var inst in list.ToList()) { var r = Add(inst); if (r.remaining != null) rem.Add(r.remaining); }
            return rem;
        }

        public ItemInst Remove(string uid, int count = int.MaxValue)
        {
            int i = IndexOf(uid);
            if (i < 0) return null;
            var it = items[i];
            if (count >= it.count) { items[i] = null; return it; }
            int n = Math.Max(1, count);
            var part = Items.Clone(it);
            part.count = n; it.count -= n;
            return part;
        }

        public int RemoveById(string id, int count = int.MaxValue)
        {
            int need = count, removed = 0;
            for (int i = slots - 1; i >= 0 && need > 0; i--)
            {
                var it = items[i];
                if (it == null || it.id != id) continue;
                int take = Math.Min(need, it.count);
                it.count -= take; need -= take; removed += take;
                if (it.count <= 0) items[i] = null;
            }
            return removed;
        }

        public int Count(string id) { int n = 0; foreach (var it in items) if (it != null && it.id == id) n += it.count; return n; }
        public bool Has(string id, int count = 1) => Count(id) >= count;
        public ItemInst Get(int idx) => idx >= 0 && idx < slots ? items[idx] : null;
        public void Set(int idx, ItemInst inst) { if (idx >= 0 && idx < slots) items[idx] = inst; }
        public int IndexOf(string uid) { for (int i = 0; i < slots; i++) if (items[i] != null && items[i].uid == uid) return i; return -1; }

        public bool Move(int from, int to)
        {
            if (from == to || from < 0 || to < 0 || from >= slots || to >= slots) return false;
            var a = items[from]; var b = items[to];
            if (a == null) return false;
            if (b != null && Items.CanStack(a, b))
            {
                int max = Items.StackMax(b);
                int mv = Math.Min(a.count, max - b.count);
                if (mv <= 0) { items[from] = b; items[to] = a; return true; }
                b.count += mv; a.count -= mv;
                if (a.count <= 0) items[from] = null;
                return true;
            }
            items[from] = b; items[to] = a;
            return true;
        }

        public bool Transfer(int idx, Inventory other, int toIdx = -1)
        {
            if (other == null || idx < 0 || idx >= slots) return false;
            var a = items[idx];
            if (a == null) return false;
            if (other == this) return toIdx >= 0 && Move(idx, toIdx);
            if (toIdx < 0)
            {
                int before = a.count;
                items[idx] = null;
                var r = other.Add(a);
                if (r.remaining != null) { items[idx] = r.remaining; return r.remaining.count < before; }
                return true;
            }
            if (toIdx >= other.slots) return false;
            var b = other.items[toIdx];
            if (b == null) { other.items[toIdx] = a; items[idx] = null; return true; }
            if (Items.CanStack(a, b))
            {
                int max = Items.StackMax(b);
                int mv = Math.Min(a.count, max - b.count);
                if (mv <= 0) return false;
                b.count += mv; a.count -= mv;
                if (a.count <= 0) items[idx] = null;
                return true;
            }
            other.items[toIdx] = a; items[idx] = b;
            return true;
        }

        public bool Split(int idx, int count)
        {
            var it = Get(idx);
            if (it == null || count < 1 || count > it.count - 1) return false;
            int free = Array.IndexOf(items, null);
            if (free < 0) return false;
            var part = Items.Clone(it);
            part.count = count; it.count -= count;
            items[free] = part;
            return true;
        }

        public void Sort()
        {
            var merged = new List<ItemInst>();
            foreach (var it in All())
            {
                var tgt = merged.FirstOrDefault(m => Items.CanStack(m, it) && m.count < Items.StackMax(m));
                if (tgt != null)
                {
                    int mv = Math.Min(it.count, Items.StackMax(tgt) - tgt.count);
                    tgt.count += mv; it.count -= mv;
                    if (it.count > 0) merged.Add(it);
                }
                else merged.Add(it);
            }
            var de = CultureInfo.GetCultureInfo("de-DE").CompareInfo;
            var sorted = merged.OrderBy(a => Array.IndexOf(Items.CatOrder, Items.Def(a)?.cat ?? ""))
                .ThenByDescending(a => Items.Rarity(a).order)
                .ThenBy(a => Items.Def(a)?.name ?? "", Comparer<string>.Create((x, y) => de.Compare(x, y)))
                .ToList();
            items = new ItemInst[slots];
            for (int i = 0; i < sorted.Count && i < slots; i++) items[i] = sorted[i];
        }

        public List<ItemInst> All() => items.Where(i => i != null).ToList();
        public int FreeSlots() { int n = 0; foreach (var it in items) if (it == null) n++; return n; }
        public bool IsFull() => FreeSlots() == 0;
        public double Weight() { double w = 0; foreach (var it in items) if (it != null) w += Items.Weight(it); return w; }
        public double TotalValue() { double v = 0; foreach (var it in items) if (it != null) v += Items.Value(it); return v; }
        public void Clear() { items = new ItemInst[slots]; }

        public Dictionary<string, object> Serialize() => new Dictionary<string, object>
        {
            ["slots"] = slots,
            ["items"] = items.Select(it => (object)Items.Serialize(it)).ToList(),
        };

        public static Inventory Deserialize(object raw, int fallbackSlots)
        {
            int fb = Math.Max(0, fallbackSlots);
            if (!(raw is Dictionary<string, object> obj)) return new Inventory(fb);
            double s = Json.Num(obj, "slots", -1);
            int slots = s >= 0 && s <= 400 ? (int)Math.Floor(s) : fb;
            var inv = new Inventory(slots);
            var overflow = new List<ItemInst>();
            var list = Json.List(obj, "items");
            for (int i = 0; i < list.Count; i++)
            {
                var inst = Items.Deserialize(list[i]);
                if (inst == null) continue;
                if (i < slots && inv.items[i] == null) inv.items[i] = inst; else overflow.Add(inst);
            }
            foreach (var it in overflow) inv.Add(it);
            return inv;
        }
    }

    public sealed class EquipResult { public bool ok; public ItemInst replaced; }

    /// <summary>Equipment slots (port of class Equipment).</summary>
    public sealed class Equipment
    {
        public static readonly string[] Slots = DataTables.EQUIP_SLOTS;
        private readonly Dictionary<string, ItemInst> _slots = new Dictionary<string, ItemInst>();

        public Equipment() { foreach (var s in Slots) _slots[s] = null; }

        public ItemInst this[string slot]
        {
            get => slot != null && _slots.TryGetValue(slot, out var v) ? v : null;
            set { if (slot != null && _slots.ContainsKey(slot)) _slots[slot] = value; }
        }

        public ItemInst primary => this["primary"];
        public ItemInst secondary => this["secondary"];
        public ItemInst melee => this["melee"];
        public ItemInst grenade => this["grenade"];
        public ItemInst armorBody => this["armorBody"];
        public ItemInst armorHead => this["armorHead"];
        public ItemInst backpack => this["backpack"];

        public static string SlotName(string slot) => slot != null && DataTables.EQUIP_SLOT_NAMES.TryGetValue(slot, out var n) ? n : slot;

        public static string SlotFor(ItemInst inst)
        {
            var d = Items.Def(inst);
            if (d == null) return null;
            if (d.weapon != null)
            {
                string c = d.weapon.@class;
                if (c == "melee") return "melee";
                if (c == "pistol" || c == "smg") return "secondary";
                return "primary";
            }
            if (d.grenade != null || d.cat == "grenade") return "grenade";
            if (d.armor != null) return d.armor.slot == "head" ? "armorHead" : "armorBody";
            if (d.backpack != null) return "backpack";
            return null;
        }

        public static bool Accepts(string slot, ItemInst inst)
        {
            if (Items.Def(inst) == null) return false;
            string natural = SlotFor(inst);
            if (slot == natural) return true;
            if (slot == "primary" && natural == "secondary") return true;
            return false;
        }

        public bool CanEquip(ItemInst inst) => SlotFor(inst) != null;

        public EquipResult Equip(ItemInst inst, string slot = null)
        {
            slot = slot ?? SlotFor(inst);
            if (inst == null || slot == null || !_slots.ContainsKey(slot) || !Accepts(slot, inst)) return new EquipResult();
            var replaced = _slots[slot];
            _slots[slot] = inst;
            return new EquipResult { ok = true, replaced = replaced };
        }

        public ItemInst Unequip(string slot)
        {
            if (slot == null || !_slots.ContainsKey(slot)) return null;
            var it = _slots[slot];
            _slots[slot] = null;
            return it;
        }

        public string SlotOf(string uid) { foreach (var s in Slots) if (_slots[s] != null && _slots[s].uid == uid) return s; return null; }
        public List<ItemInst> All() => Slots.Select(s => _slots[s]).Where(i => i != null).ToList();
        public double Weight() { double w = 0; foreach (var s in Slots) if (_slots[s] != null) w += Items.Weight(_slots[s]); return w; }

        private static double Prot(ItemInst inst)
        {
            if (inst == null || !inst.durability.HasValue || inst.durability.Value <= 0) return 0;
            var d = Items.Def(inst);
            return d?.armor != null ? d.armor.protection : 0;
        }

        public double ProtectionBody => Prot(armorBody);
        public double ProtectionHead => Prot(armorHead);

        public double SpeedMul()
        {
            double m = 1;
            foreach (var s in new[] { "armorBody", "armorHead" }) { var d = Items.Def(_slots[s]); if (d?.armor != null && d.armor.speedMul > 0) m *= d.armor.speedMul; }
            return m;
        }

        public double CarryBonus() { var d = Items.Def(backpack); return d?.backpack != null ? d.backpack.weightBonus : 0; }
        public int BackpackSlots() { var d = Items.Def(backpack); return d?.backpack != null && d.backpack.slots > 0 ? d.backpack.slots : 6; }

        public Dictionary<string, object> Serialize()
        {
            var o = new Dictionary<string, object>();
            foreach (var s in Slots) o[s] = Items.Serialize(_slots[s]);
            return o;
        }

        public static Equipment Deserialize(object raw)
        {
            var e = new Equipment();
            if (!(raw is Dictionary<string, object> obj)) return e;
            foreach (var s in Slots)
            {
                obj.TryGetValue(s, out var v);
                var inst = Items.Deserialize(v);
                if (inst != null && Accepts(s, inst)) e._slots[s] = inst;
            }
            return e;
        }
    }
}
