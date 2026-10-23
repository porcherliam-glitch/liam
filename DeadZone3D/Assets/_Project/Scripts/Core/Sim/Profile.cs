using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public sealed class MissionProgress
    {
        public List<string> active = new List<string>(), completed = new List<string>();
        public Dictionary<string, Dictionary<string, int>> progress = new Dictionary<string, Dictionary<string, int>>();
    }

    public sealed class TraderOffer { public string id; public int price, count; }
    public sealed class RaidMarker { public string mapId; public List<string> missionIds = new List<string>(); public uint seed; public double startedAt; }

    /// <summary>The player's save state between raids (live form; see <see cref="ProfileManager.Serialize"/>).</summary>
    public sealed class Profile
    {
        public const int SAVE_VERSION = 1;
        public static readonly string[] StatKeys = { "raids", "extractions", "deaths", "mia", "kills", "shotsFired", "shotsHit", "lootValue", "creditsEarned", "creditsSpent",
            "missionsCompleted", "missionsFailed", "playTime", "bestRaidValue", "containersOpened", "distance", "itemsCrafted", "upgradesBought" };
        public static readonly string[] UpgradeAreas = { "stash", "workshop", "medbay", "radio", "defense", "trader" };

        public int version = SAVE_VERSION, credits, xp;
        public double createdAt, hp = 100, hunger = 100, thirst = 100;
        public double? lastSaved;
        public string name = "Überlebender";
        public Inventory stash, loadout, secure;
        public Equipment equipment;
        public Dictionary<string, int> upgrades = UpgradeAreas.ToDictionary(a => a, a => 0);
        public List<string> unlockedMaps = new List<string> { "city" };
        public MissionProgress missions = new MissionProgress();
        public List<TraderOffer> traderStock = new List<TraderOffer>();
        public int traderRestocks;
        public Dictionary<string, double> stats = StatKeys.ToDictionary(k => k, k => 0.0);
        public Dictionary<string, int> killsByType = new Dictionary<string, int>();
        public List<string> achievements = new List<string>();
        public RaidMarker raidInProgress;

        public int Up(string area) => upgrades.TryGetValue(area, out var v) ? v : 0;
        public double Stat(string key) => stats.TryGetValue(key, out var v) ? v : 0;
        public void AddStat(string key, double n) => stats[key] = Stat(key) + n;
    }

    public sealed class Result { public bool ok; public string reason; public int cost; public Result(bool ok, string reason = null, int cost = 0) { this.ok = ok; this.reason = reason; this.cost = cost; } }

    /// <summary>Profile lifecycle, base economy, upgrades, loss rules, validation (port of 18_profile.js).</summary>
    public sealed class ProfileManager
    {
        public const int SECURE_SLOTS_BASE = 1, CARRY_BASE = 30, STASH_SLOTS_BASE = 24, START_CREDITS = 800;
        public static readonly Dictionary<string, string> AreaNames = new Dictionary<string, string>
        { ["stash"] = "Lager", ["workshop"] = "Werkstatt", ["medbay"] = "Krankenstation", ["radio"] = "Funkstation", ["defense"] = "Verteidigungsanlage", ["trader"] = "Händler" };

        private readonly GameCore _game;
        public Profile profile;

        public ProfileManager(GameCore game) { _game = game; }

        private Rng Rng => _game.rng;
        private void Sfx(string n) => _game.fb.Sfx(n);
        private int Up(string area) => profile?.Up(area) ?? 0;
        public static int StashSlotsFor(int level) => STASH_SLOTS_BASE + 12 * level;

        public Profile NewProfile()
        {
            var eq = new Equipment();
            var pistol = Items.Create("pistol_m9");
            pistol.mag = Items.Def("pistol_m9").weapon.magSize; pistol.ammoId = "ammo_9mm";
            eq.Equip(pistol, "secondary");
            eq.Equip(Items.Create("melee_knife"), "melee");
            eq.Equip(Items.Create("pack_small"), "backpack");
            var loadout = new Inventory(eq.BackpackSlots());
            loadout.Add(Items.Create("ammo_9mm", 30));
            loadout.Add(Items.Create("med_bandage", 2));
            var stash = new Inventory(STASH_SLOTS_BASE);
            foreach (var (id, n) in new[] { ("ammo_9mm", 30), ("med_bandage", 2), ("food_beans", 2), ("water_bottle", 2) }) stash.Add(Items.Create(id, n));
            profile = new Profile
            {
                createdAt = NowMs(), credits = START_CREDITS, stash = stash, loadout = loadout, equipment = eq, secure = new Inventory(SECURE_SLOTS_BASE),
            };
            UnlockedMaps();
            RestockTrader();
            _game.events.Emit("profileChanged");
            return profile;
        }

        public static double NowMs() => (DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;

        // ------------------------------------------------------------------ progression
        public (bool leveledUp, int newLevel, List<string> unlockedMaps) AddXp(int n)
        {
            var p = profile;
            if (p == null || n <= 0) return (false, Level(), new List<string>());
            int before = Level();
            var mapsBefore = UnlockedMaps().ToList();
            p.xp += n;
            int after = Level();
            var fresh = UnlockedMaps().Where(m => !mapsBefore.Contains(m)).ToList();
            if (after > before)
            {
                _game.events.Emit(new SimEvent("levelUp") { value = after, data = fresh });
                Sfx("level_up");
            }
            return (after > before, after, fresh);
        }

        public int Level() => profile != null ? Progression.LevelFromXp(profile.xp) : 1;
        public int Xp() => profile?.xp ?? 0;

        public List<string> UnlockedMaps()
        {
            if (profile == null) return new List<string> { "city" };
            var ids = Progression.UnlockedMapsFor(Level(), Up("radio"));
            profile.unlockedMaps = ids;
            return ids;
        }

        public bool IsMapUnlocked(string mapId) => UnlockedMaps().Contains(mapId);

        // ------------------------------------------------------------------ loadout
        public int SecureSlots() => SECURE_SLOTS_BASE + Up("defense");
        public double CarryLimit() => CARRY_BASE + (profile?.equipment?.CarryBonus() ?? 0) + 5 * Up("defense");
        public int HpMax() => 100 + 10 * Up("medbay");
        public double LoadoutWeight() => profile == null ? 0 : profile.loadout.Weight() + profile.equipment.Weight() + profile.secure.Weight();

        public Loadout BuildLoadout()
        {
            var p = profile;
            var equipment = Equipment.Deserialize(p.equipment.Serialize());
            var inv = Inventory.Deserialize(p.loadout.Serialize(), equipment.BackpackSlots());
            foreach (var it in inv.SetSlots(equipment.BackpackSlots())) p.stash.Add(it);
            var secure = Inventory.Deserialize(p.secure.Serialize(), SecureSlots());
            secure.SetSlots(SecureSlots());
            return new Loadout { equipment = equipment, inventory = inv, secure = secure, hp = p.hp, hpMax = HpMax(), hunger = p.hunger, thirst = p.thirst, carryLimit = CarryLimit() };
        }

        private static IEnumerable<ItemInst> Carried(Profile p) => p.loadout.All().Concat(p.secure.All());

        public List<string> LoadoutWarnings()
        {
            var p = profile;
            var W = new List<string>();
            if (p == null) return W;
            var eq = p.equipment;
            var guns = new[] { eq.primary, eq.secondary }.Where(g => g != null).ToList();
            if (guns.Count == 0 && eq.melee == null) W.Add("Keine Waffe ausgerüstet");
            else if (guns.Count == 0) W.Add("Nur eine Nahkampfwaffe ausgerüstet");
            foreach (var g in guns)
            {
                var d = Items.Def(g);
                if (d?.weapon == null) continue;
                int reserve = Carried(p).Where(it => Items.Def(it)?.ammo?.caliber == d.weapon.ammo).Sum(it => it.count);
                if (reserve == 0) W.Add("Keine Ersatzmunition für " + d.name);
            }
            if (!Carried(p).Any(it => Items.Def(it)?.medical != null)) W.Add("Keine Medizin dabei");
            if (LoadoutWeight() > CarryLimit()) W.Add("Überladen: " + M.FormatWeight(LoadoutWeight()) + " / " + M.FormatWeight(CarryLimit()));
            if (p.hp < HpMax() * 0.6) W.Add("Verletzt (" + M.Round(p.hp) + "/" + HpMax() + ") – Krankenstation aufsuchen");
            if (p.hunger < 40 || p.thirst < 40) W.Add("Hunger/Durst niedrig – Nahrung/Wasser einpacken");
            foreach (var g in guns) if (g.durability.HasValue && g.durability.Value < 25) W.Add(Items.Def(g)?.name + " ist stark beschädigt");
            return W;
        }

        private void FixLoadoutSlots()
        {
            var p = profile;
            foreach (var it in p.loadout.SetSlots(p.equipment.BackpackSlots())) p.stash.Add(it);
        }

        public bool MoveStashToLoadout(string uid, int count = int.MaxValue)
        {
            var p = profile;
            if (p == null) return false;
            var inst = p.stash.Remove(uid, count);
            if (inst == null) return false;
            int n = inst.count;
            var r = p.loadout.Add(inst);
            if (r.remaining != null) p.stash.Add(r.remaining);
            return r.remaining == null || r.remaining.count < n + 1;
        }

        public bool MoveLoadoutToStash(string uid, int count = int.MaxValue)
        {
            var p = profile;
            if (p == null) return false;
            var src = p.loadout.IndexOf(uid) >= 0 ? p.loadout : p.secure;
            var inst = src.Remove(uid, count);
            if (inst == null) return false;
            var r = p.stash.Add(inst);
            if (r.remaining != null) src.Add(r.remaining);
            return r.remaining == null;
        }

        public bool MoveToSecure(string uid, bool fromLoadout = false)
        {
            var p = profile;
            var src = fromLoadout ? p.loadout : p.stash;
            var inst = src.Remove(uid);
            if (inst == null) return false;
            var r = p.secure.Add(inst);
            if (r.remaining != null) src.Add(r.remaining);
            return r.remaining == null;
        }

        private Result EquipFrom(Inventory inv, string uid, string slot)
        {
            var p = profile;
            int idx = inv.IndexOf(uid);
            if (idx < 0) return new Result(false, "Gegenstand nicht gefunden");
            var inst = inv.items[idx];
            string s = slot ?? Equipment.SlotFor(inst);
            if (s == null || !Equipment.Accepts(s, inst)) return new Result(false, "Kann nicht ausgerüstet werden");
            inv.items[idx] = null;
            var r = p.equipment.Equip(inst, s);
            if (!r.ok) { inv.items[idx] = inst; return new Result(false, "Kann nicht ausgerüstet werden"); }
            if (r.replaced != null)
            {
                var back = inv.Add(r.replaced);
                if (back.remaining != null)
                {
                    var s2 = p.stash.Add(back.remaining);
                    if (s2.remaining != null) { p.equipment.Equip(r.replaced, s); inv.items[idx] = inst; return new Result(false, "Kein Platz für den alten Gegenstand"); }
                }
            }
            if (s == "backpack") FixLoadoutSlots();
            return new Result(true);
        }

        public Result EquipFromStash(string uid, string slot = null) => profile != null ? EquipFrom(profile.stash, uid, slot) : new Result(false);
        public Result EquipFromLoadout(string uid, string slot = null) => profile != null ? EquipFrom(profile.loadout, uid, slot) : new Result(false);

        public bool UnequipToStash(string slot)
        {
            var p = profile;
            var inst = p?.equipment[slot];
            if (inst == null || !p.stash.CanAdd(inst)) return false;
            p.equipment.Unequip(slot);
            p.stash.Add(inst);
            if (slot == "backpack") FixLoadoutSlots();
            return true;
        }

        public int QuickPack()
        {
            var p = profile;
            if (p == null) return 0;
            int moved = 0;
            void Take(Func<ItemInst, bool> pred, int amount)
            {
                int need = amount;
                foreach (var it in p.stash.All())
                {
                    if (need <= 0) break;
                    if (!pred(it)) continue;
                    int n = Math.Min(need, it.count);
                    if (MoveStashToLoadout(it.uid, n)) { moved++; need -= n; }
                }
            }
            foreach (var g in new[] { p.equipment.primary, p.equipment.secondary }.Where(g => g != null))
            {
                var d = Items.Def(g);
                if (d?.weapon?.ammo == null) continue;
                bool IsCal(ItemInst it) => Items.Def(it)?.ammo?.caliber == d.weapon.ammo;
                int have = p.loadout.All().Where(IsCal).Sum(it => it.count);
                int want = d.weapon.magSize * 3 - have;
                if (want > 0) Take(IsCal, want);
            }
            int Count(Func<ItemInst, bool> pred) => p.loadout.All().Where(pred).Sum(it => it.count);
            bool IsMed(ItemInst it) { var d = Items.Def(it); return d?.medical != null && (d.medical.heal > 0 || d.medical.stopBleed); }
            bool IsFood(ItemInst it) => Items.Def(it)?.food != null;
            bool IsWater(ItemInst it) => Items.Def(it)?.water != null;
            if (Count(IsMed) < 2) Take(IsMed, 2 - Count(IsMed));
            if (Count(IsFood) < 1) Take(IsFood, 1);
            if (Count(IsWater) < 1) Take(IsWater, 1);
            return moved;
        }

        // ------------------------------------------------------------------ economy
        public int SellPrice(ItemInst inst, int count = -1)
        {
            if (inst == null) return 0;
            if (count < 0) count = inst.count;
            double unit = Items.Value(inst) / Math.Max(1, inst.count);
            var e = DataTables.ECONOMY;
            return Math.Max(1, M.Round(unit * count * e.sellMul * (1 + Up("trader") * e.traderSellBonus)));
        }

        public int BuyPrice(ItemDef def)
        {
            if (def == null) return 0;
            var e = DataTables.ECONOMY;
            return Math.Max(1, M.Round((def.value > 0 ? def.value : 1) * e.buyMul * (1 - Up("trader") * e.traderBuyDiscount)));
        }

        public (bool ok, int credits) Sell(string uid, int count = int.MaxValue)
        {
            var p = profile;
            if (p == null) return (false, 0);
            int idx = p.stash.IndexOf(uid);
            if (idx < 0) return (false, 0);
            var it = p.stash.items[idx];
            int n = Math.Min(it.count, Math.Max(1, count));
            int credits = SellPrice(it, n);
            p.stash.Remove(uid, n);
            p.credits += credits;
            p.AddStat("creditsEarned", credits);
            Sfx("sell");
            return (true, credits);
        }

        public void RestockTrader()
        {
            var p = profile;
            if (p == null) return;
            int lvl = Up("trader");
            var stock = new List<TraderOffer>();
            foreach (var line in DataTables.TRADER_STOCK)
            {
                if (line.minLevel > lvl) continue;
                if (line.minLevel > 0 && !Rng.Chance(line.chance)) continue;
                var def = Items.Def(line.id);
                if (def == null) continue;
                var range = line.stock != null && line.stock.Length >= 2 ? line.stock : new[] { 1, 3 };
                int count = Rng.Int(range[0], range[1]);
                if (def.ammo != null && line.minLevel == 0) count = Math.Max(20, count);
                if (line.minLevel == 0) count = Math.Max(1, count);
                stock.Add(new TraderOffer { id = def.id, price = BuyPrice(def), count = count });
            }
            p.traderStock = stock;
            p.traderRestocks++;
        }

        public Result Buy(int stockIndex, int count = 1)
        {
            var p = profile;
            if (p == null) return new Result(false, "Kein Händler");
            if (stockIndex < 0 || stockIndex >= p.traderStock.Count) return new Result(false, "Nicht im Angebot");
            var line = p.traderStock[stockIndex];
            int n = Math.Min(line.count, Math.Max(1, count));
            if (n <= 0) return new Result(false, "Ausverkauft");
            int cost = line.price * n;
            if (p.credits < cost) return new Result(false, "Nicht genug Credits");
            var def = Items.Def(line.id);
            int stack = Math.Max(1, def.stack);
            var test = new Inventory(p.stash.slots) { items = p.stash.items.Select(Items.Clone).ToArray() };
            var insts = new List<ItemInst>();
            for (int left = n; left > 0;) { int c = Math.Min(stack, left); insts.Add(Items.Create(line.id, c)); left -= c; }
            foreach (var inst in insts) if (test.Add(Items.Clone(inst)).remaining != null) return new Result(false, "Lager voll");
            foreach (var inst in insts) p.stash.Add(inst);
            p.credits -= cost;
            p.AddStat("creditsSpent", cost);
            line.count -= n;
            Sfx("buy");
            return new Result(true, null, cost);
        }

        public ItemInst FindItem(string uid)
        {
            var p = profile;
            if (p == null) return null;
            foreach (var inv in new[] { p.stash, p.loadout, p.secure }) { int i = inv.IndexOf(uid); if (i >= 0) return inv.items[i]; }
            string slot = p.equipment.SlotOf(uid);
            return slot != null ? p.equipment[slot] : null;
        }

        public int RepairCost(ItemInst inst)
        {
            var d = Items.Def(inst);
            if (d == null || d.durabilityMax <= 0 || !inst.durability.HasValue) return 0;
            double missing = (d.durabilityMax - inst.durability.Value) / d.durabilityMax;
            if (missing <= 0) return 0;
            return Math.Max(1, M.Round(missing * d.value * DataTables.ECONOMY.repairCostMul * (1 - 0.15 * Up("workshop"))));
        }

        public Result Repair(string uid)
        {
            var p = profile;
            var inst = FindItem(uid);
            if (inst == null) return new Result(false, "Gegenstand nicht gefunden");
            int cost = RepairCost(inst);
            if (cost <= 0) return new Result(false, "Nicht beschädigt");
            if (p.credits < cost) return new Result(false, "Nicht genug Credits");
            p.credits -= cost;
            p.AddStat("creditsSpent", cost);
            inst.durability = Items.Def(inst).durabilityMax;
            Sfx("craft");
            return new Result(true, null, cost);
        }

        public int StationLevel(string station) => station == "medbay" ? Up("medbay") : Up("workshop");

        public List<(RecipeDef recipe, bool unlocked, bool can)> RecipesFor(string station)
        {
            int lvl = StationLevel(station);
            return DataTables.RECIPES.Where(r => r.station == station).Select(r => (r, r.requiresLevel <= lvl, CanCraft(r.id).ok)).ToList();
        }

        public Result CanCraft(string recipeId)
        {
            var p = profile;
            var r = DataTables.RECIPES.FirstOrDefault(x => x.id == recipeId);
            if (p == null || r == null) return new Result(false, "Unbekanntes Rezept");
            if (r.requiresLevel > StationLevel(r.station)) return new Result(false, "Ausbaustufe " + r.requiresLevel + " nötig");
            foreach (var i in r.inputs) if (p.stash.Count(i.id) < i.count) return new Result(false, "Material fehlt: " + (Items.Def(i.id)?.name ?? i.id));
            if (Items.Def(r.output.id) == null) return new Result(false, "Ungültiges Rezept");
            return new Result(true);
        }

        public Result Craft(string recipeId)
        {
            var c = CanCraft(recipeId);
            if (!c.ok) return c;
            var p = profile;
            var r = DataTables.RECIPES.First(x => x.id == recipeId);
            foreach (var i in r.inputs) p.stash.RemoveById(i.id, i.count);
            int outCount = Math.Max(1, r.output.count);
            var res = p.stash.Add(Items.Create(r.output.id, outCount));
            if (res.remaining != null)
            {
                p.stash.RemoveById(r.output.id, outCount - res.remaining.count);
                foreach (var i in r.inputs) p.stash.Add(Items.Create(i.id, i.count));
                return new Result(false, "Lager voll");
            }
            p.AddStat("itemsCrafted", 1);
            Sfx("craft");
            return new Result(true);
        }

        public int HealCost()
        {
            var p = profile;
            if (p == null || Up("medbay") >= 3) return 0;
            return Math.Max(0, M.Ceil((HpMax() - p.hp) * DataTables.ECONOMY.healCostPerHp));
        }

        public Result Heal()
        {
            var p = profile;
            if (p == null) return new Result(false, "Kein Spielstand");
            int cost = HealCost();
            if (p.hp >= HpMax() && p.hunger >= 100 && p.thirst >= 100) return new Result(false, "Du bist bereits fit");
            if (p.credits < cost) return new Result(false, "Nicht genug Credits");
            p.credits -= cost;
            p.AddStat("creditsSpent", cost);
            p.hp = HpMax(); p.hunger = 100; p.thirst = 100;
            Sfx("heal");
            return new Result(true, null, cost);
        }

        public Result UseFromStash(string uid)
        {
            var p = profile;
            int idx = p?.stash.IndexOf(uid) ?? -1;
            if (idx < 0) return new Result(false, "Nicht gefunden");
            var d = Items.Def(p.stash.items[idx]);
            if (d == null || (d.medical == null && d.food == null && d.water == null)) return new Result(false, "Nicht benutzbar");
            if (d.medical != null) p.hp = Math.Min(HpMax(), p.hp + d.medical.heal + d.medical.overTime);
            if (d.food != null) p.hunger = M.Clamp(p.hunger + d.food.hunger, 0, 100);
            if (d.water != null) p.thirst = M.Clamp(p.thirst + d.water.thirst, 0, 100);
            p.stash.Remove(uid, 1);
            Sfx(d.medical != null ? "heal" : "eat");
            return new Result(true);
        }

        public static UpgradeLevel UpgradeInfo(string area, int level)
        {
            if (area == null || !DataTables.UPGRADES.TryGetValue(area, out var list)) return null;
            return level >= 1 && level <= list.Length ? list[level - 1] : null;
        }

        public (bool ok, string reason, UpgradeLevel info) CanUpgrade(string area)
        {
            var p = profile;
            if (p == null || !Profile.UpgradeAreas.Contains(area)) return (false, "Unbekannter Bereich", null);
            int lvl = Up(area);
            if (lvl >= 3) return (false, "Maximale Stufe erreicht", null);
            var info = UpgradeInfo(area, lvl + 1);
            if (info == null) return (false, "Keine weitere Stufe", null);
            var cost = info.cost ?? new CostDef();
            if (p.credits < cost.credits) return (false, "Nicht genug Credits", info);
            foreach (var it in cost.items ?? new ItemCount[0])
                if (p.stash.Count(it.id) < it.count) return (false, "Material fehlt: " + (Items.Def(it.id)?.name ?? it.id) + " ×" + it.count, info);
            return (true, null, info);
        }

        public Result Upgrade(string area)
        {
            var c = CanUpgrade(area);
            if (!c.ok) return new Result(false, c.reason);
            var p = profile;
            var cost = c.info.cost ?? new CostDef();
            p.credits -= cost.credits;
            p.AddStat("creditsSpent", cost.credits);
            foreach (var it in cost.items ?? new ItemCount[0]) p.stash.RemoveById(it.id, it.count);
            p.upgrades[area] = Up(area) + 1;
            if (area == "stash") p.stash.SetSlots(StashSlotsFor(p.upgrades["stash"]));
            if (area == "defense") p.secure.SetSlots(SecureSlots());
            if (area == "radio") UnlockedMaps();
            if (area == "trader") RestockTrader();
            p.AddStat("upgradesBought", 1);
            Sfx("craft");
            return new Result(true);
        }

        // ------------------------------------------------------------------ loss rules
        private void MergeRaidStats(PlayerStats st)
        {
            var p = profile;
            p.AddStat("kills", st.kills); p.AddStat("shotsFired", st.shotsFired); p.AddStat("shotsHit", st.shotsHit); p.AddStat("containersOpened", st.containersOpened);
            p.AddStat("distance", M.Round(st.distance / World.TILE));
            foreach (var kv in st.killsByType) p.killsByType[kv.Key] = (p.killsByType.TryGetValue(kv.Key, out var v) ? v : 0) + kv.Value;
        }

        private static ItemInst Strip(ItemInst inst) { if (inst != null) inst.rt = null; return inst; }

        public RaidResult ApplyRaidResult(RaidResult result, Player player, Raid raid)
        {
            var p = profile;
            if (p == null || player == null) return result;
            var e = DataTables.ECONOMY;
            MergeRaidStats(player.stats);
            p.AddStat("raids", 1);
            if (result.outcome == "extracted")
            {
                p.equipment = player.equipment;
                foreach (var s in Equipment.Slots) Strip(p.equipment[s]);
                double lootValue = 0;
                foreach (var inv in new[] { player.inventory, player.secure })
                {
                    foreach (var it in inv.All())
                    {
                        Strip(it);
                        if (it.raidFound) lootValue += Items.Value(it);
                        var copy = Items.Clone(it);
                        var r = p.stash.Add(it);
                        if (r.remaining != null)
                        {
                            int credits = Math.Max(1, M.Round(Items.Value(r.remaining) * e.overflowSellMul));
                            p.credits += credits;
                            p.AddStat("creditsEarned", credits);
                            result.creditsGained += credits;
                            result.itemsSold.Add(new ItemLine { inst = Items.Clone(r.remaining), credits = credits });
                            if (copy.count > r.remaining.count) { copy.count -= r.remaining.count; result.itemsKept.Add(new ItemLine { inst = copy }); }
                        }
                        else result.itemsKept.Add(new ItemLine { inst = copy });
                    }
                }
                foreach (var s in Equipment.Slots) if (p.equipment[s] != null) result.itemsKept.Add(new ItemLine { inst = Items.Clone(p.equipment[s]), equipped = true });
                result.lootValue = M.Round(lootValue);
                p.loadout = new Inventory(p.equipment.BackpackSlots());
                p.secure = new Inventory(SecureSlots());
                p.hp = M.Clamp(M.Round(player.hp), 1, HpMax());
                p.hunger = M.Clamp(player.hunger, 0, 100);
                p.thirst = M.Clamp(player.thirst, 0, 100);
                int xp = M.Round((raid?.xp ?? 0) + DataTables.XP_REWARDS.extraction + lootValue * DataTables.XP_REWARDS.perLootValue);
                result.xpGained = xp;
                AddXp(xp);
                p.AddStat("extractions", 1);
                p.AddStat("lootValue", M.Round(lootValue));
                p.stats["bestRaidValue"] = Math.Max(p.Stat("bestRaidValue"), M.Round(lootValue));
            }
            else
            {
                double insurance = Up("defense") >= 3 ? 0.5 : 0;
                var newEq = new Equipment();
                foreach (var s in Equipment.Slots)
                {
                    var it = player.equipment[s];
                    if (it == null) continue;
                    Strip(it);
                    if (insurance > 0 && Rng.Chance(insurance)) { newEq[s] = it; result.insuranceReturned.Add(Items.Clone(it)); }
                    else result.itemsLost.Add(new ItemLine { inst = Items.Clone(it), equipped = true });
                }
                foreach (var it in player.inventory.All()) result.itemsLost.Add(new ItemLine { inst = Items.Clone(it) });
                foreach (var it in player.secure.All())
                {
                    Strip(it);
                    var copy = Items.Clone(it);
                    var r = p.stash.Add(it);
                    if (r.remaining != null)
                    {
                        int credits = Math.Max(1, M.Round(Items.Value(r.remaining) * e.overflowSellMul));
                        p.credits += credits; result.creditsGained += credits;
                        result.itemsSold.Add(new ItemLine { inst = Items.Clone(r.remaining), credits = credits });
                    }
                    result.itemsKept.Add(new ItemLine { inst = copy, secure = true });
                }
                p.equipment = newEq;
                p.loadout = new Inventory(newEq.BackpackSlots());
                p.secure = new Inventory(SecureSlots());
                p.hp = 35; p.hunger = 60; p.thirst = 60;
                int xp = raid?.xp ?? 0;
                result.xpGained = xp;
                AddXp(xp);
                p.AddStat(result.outcome == "mia" ? "mia" : "deaths", 1);
            }
            p.raidInProgress = null;
            RestockTrader();
            return result;
        }

        public (List<ItemInst> lost, List<ItemInst> insured) ApplyMiaOnReload()
        {
            var lost = new List<ItemInst>(); var insured = new List<ItemInst>();
            var p = profile;
            if (p == null) return (lost, insured);
            double insurance = Up("defense") >= 3 ? 0.5 : 0;
            var newEq = new Equipment();
            foreach (var s in Equipment.Slots)
            {
                var it = p.equipment[s];
                if (it == null) continue;
                if (insurance > 0 && Rng.Chance(insurance)) { newEq[s] = it; insured.Add(it); } else lost.Add(it);
            }
            lost.AddRange(p.loadout.All());
            foreach (var it in p.secure.All()) p.stash.Add(it);
            p.equipment = newEq;
            p.loadout = new Inventory(newEq.BackpackSlots());
            p.secure = new Inventory(SecureSlots());
            p.hp = 35; p.hunger = 60; p.thirst = 60;
            p.AddStat("mia", 1); p.AddStat("raids", 1);
            p.raidInProgress = null;
            RestockTrader();
            return (lost, insured);
        }

        // ------------------------------------------------------------------ serialization + validation
        public static Dictionary<string, object> Serialize(Profile p)
        {
            var o = new Dictionary<string, object>
            {
                ["version"] = Profile.SAVE_VERSION, ["createdAt"] = p.createdAt, ["name"] = p.name, ["credits"] = p.credits, ["xp"] = p.xp,
                ["level"] = Progression.LevelFromXp(p.xp), ["hp"] = p.hp, ["hunger"] = p.hunger, ["thirst"] = p.thirst,
                ["stash"] = p.stash.Serialize(), ["loadout"] = p.loadout.Serialize(), ["equipment"] = p.equipment.Serialize(), ["secure"] = p.secure.Serialize(),
                ["upgrades"] = p.upgrades.ToDictionary(kv => kv.Key, kv => (object)kv.Value),
                ["unlockedMaps"] = p.unlockedMaps.Cast<object>().ToList(),
                ["missions"] = new Dictionary<string, object>
                {
                    ["active"] = p.missions.active.Cast<object>().ToList(),
                    ["completed"] = p.missions.completed.Cast<object>().ToList(),
                    ["progress"] = p.missions.progress.ToDictionary(kv => kv.Key, kv => (object)kv.Value.ToDictionary(x => x.Key, x => (object)x.Value)),
                },
                ["trader"] = new Dictionary<string, object>
                {
                    ["stock"] = p.traderStock.Select(l => (object)new Dictionary<string, object> { ["id"] = l.id, ["price"] = l.price, ["count"] = l.count }).ToList(),
                    ["restocks"] = p.traderRestocks,
                },
                ["raidInProgress"] = p.raidInProgress == null ? null : new Dictionary<string, object>
                {
                    ["mapId"] = p.raidInProgress.mapId, ["missionIds"] = p.raidInProgress.missionIds.Cast<object>().ToList(),
                    ["seed"] = (double)p.raidInProgress.seed, ["startedAt"] = p.raidInProgress.startedAt,
                },
                ["lastSaved"] = p.lastSaved,
            };
            var stats = p.stats.ToDictionary(kv => kv.Key, kv => (object)kv.Value);
            stats["killsByType"] = p.killsByType.ToDictionary(kv => kv.Key, kv => (object)kv.Value);
            stats["achievements"] = p.achievements.Cast<object>().ToList();
            o["stats"] = stats;
            return o;
        }

        public sealed class Validation { public bool ok; public Profile profile; public List<string> repaired = new List<string>(); public string error; }

        public static Validation Validate(object raw)
        {
            var v = new Validation();
            if (!(raw is Dictionary<string, object> src)) { v.error = "Kein gültiger Spielstand"; return v; }
            if (!src.TryGetValue("version", out var ver) || !(ver is double version)) { v.error = "Versionsangabe fehlt"; return v; }
            if (version > Profile.SAVE_VERSION) { v.error = "Spielstand stammt aus einer neueren Version"; return v; }
            if (version < Profile.SAVE_VERSION) v.repaired.Add("Spielstand auf Version " + Profile.SAVE_VERSION + " aktualisiert");
            double Num(string key, double d, string name, double min = double.NegativeInfinity, double max = double.PositiveInfinity)
            {
                if (src.TryGetValue(key, out var x) && x is double n && !double.IsNaN(n) && !double.IsInfinity(n)) return M.Clamp(n, min, max);
                v.repaired.Add(name + " zurückgesetzt");
                return d;
            }
            var p = new Profile
            {
                createdAt = Num("createdAt", 0, "Erstellungsdatum"),
                credits = M.Round(Num("credits", START_CREDITS, "Credits", 0, 1e9)),
                xp = M.Round(Num("xp", 0, "Erfahrung", 0, 1e9)),
            };
            string nm = Json.Str(src, "name");
            p.name = nm != null && nm.Length < 40 ? nm : "Überlebender";
            var up = Json.Obj(src, "upgrades");
            if (up == null) v.repaired.Add("Ausbaustufen zurückgesetzt");
            foreach (var a in Profile.UpgradeAreas) p.upgrades[a] = M.Round(M.Clamp(Json.Num(up, a, 0), 0, 3));
            int hpMax = 100 + 10 * p.upgrades["medbay"];
            p.hp = Num("hp", hpMax, "Lebenspunkte", 1, hpMax);
            p.hunger = Num("hunger", 100, "Hunger", 0, 100);
            p.thirst = Num("thirst", 100, "Durst", 0, 100);
            Inventory InvCheck(string key, int slots, string name)
            {
                var o = Json.Obj(src, key);
                if (o == null) { v.repaired.Add(name + " war beschädigt und wurde geleert"); return new Inventory(slots); }
                int before = Json.List(o, "items").Count(x => x != null);
                var inv = Inventory.Deserialize(o, slots);
                if (inv.slots < slots) inv.SetSlots(slots);
                int after = inv.All().Count;
                if (after < before) v.repaired.Add(name + ": " + (before - after) + " unbekannte Gegenstände entfernt");
                return inv;
            }
            p.stash = InvCheck("stash", StashSlotsFor(p.upgrades["stash"]), "Lager");
            var eqo = Json.Obj(src, "equipment");
            if (eqo == null) v.repaired.Add("Ausrüstung zurückgesetzt");
            p.equipment = Equipment.Deserialize(eqo);
            p.loadout = InvCheck("loadout", p.equipment.BackpackSlots(), "Rucksack");
            p.secure = InvCheck("secure", SECURE_SLOTS_BASE + p.upgrades["defense"], "Sicherer Behälter");
            var maps = Json.List(src, "unlockedMaps").OfType<string>().Where(DataTables.MAPS.ContainsKey).ToList();
            p.unlockedMaps = maps.Count > 0 ? maps : new List<string> { "city" };
            var ms = Json.Obj(src, "missions");
            if (ms == null) v.repaired.Add("Aufträge zurückgesetzt");
            p.missions.active = Json.List(ms, "active").OfType<string>().Where(MissionSystem.ById.ContainsKey).ToList();
            p.missions.completed = Json.List(ms, "completed").OfType<string>().Where(MissionSystem.ById.ContainsKey).ToList();
            var pr = Json.Obj(ms, "progress");
            if (pr != null)
                foreach (var kv in pr)
                {
                    if (!MissionSystem.ById.ContainsKey(kv.Key) || !(kv.Value is Dictionary<string, object> po)) continue;
                    var d = new Dictionary<string, int>();
                    foreach (var x in po) if (x.Value is double dv) d[x.Key] = (int)dv;
                    p.missions.progress[kv.Key] = d;
                }
            var tr = Json.Obj(src, "trader");
            foreach (var l in Json.List(tr, "stock").OfType<Dictionary<string, object>>())
            {
                string id = Json.Str(l, "id");
                if (Items.Def(id) == null || !Json.Has(l, "price") || !Json.Has(l, "count")) continue;
                p.traderStock.Add(new TraderOffer { id = id, price = Math.Max(1, M.Round(Json.Num(l, "price"))), count = Math.Max(0, M.Round(Json.Num(l, "count"))) });
            }
            p.traderRestocks = (int)Json.Num(tr, "restocks", 0);
            var st = Json.Obj(src, "stats");
            if (st == null) v.repaired.Add("Statistiken zurückgesetzt");
            foreach (var k in Profile.StatKeys) p.stats[k] = Json.Num(st, k, 0);
            var kbt = Json.Obj(st, "killsByType");
            if (kbt != null) foreach (var kv in kbt) if (kv.Value is double dv) p.killsByType[kv.Key] = (int)dv;
            p.achievements = Json.List(st, "achievements").OfType<string>().ToList();
            var rip = Json.Obj(src, "raidInProgress");
            if (rip != null && Json.Str(rip, "mapId") != null)
                p.raidInProgress = new RaidMarker
                {
                    mapId = Json.Str(rip, "mapId"), missionIds = Json.List(rip, "missionIds").OfType<string>().Where(MissionSystem.ById.ContainsKey).ToList(),
                    seed = (uint)Json.Num(rip, "seed", 0), startedAt = Json.Num(rip, "startedAt", 0),
                };
            if (src.TryGetValue("lastSaved", out var ls) && ls is double lsd) p.lastSaved = lsd;
            v.ok = true;
            v.profile = p;
            return v;
        }

        public bool SetProfile(object raw)
        {
            var v = Validate(raw);
            if (!v.ok) return false;
            SetProfile(v.profile);
            return true;
        }

        public void SetProfile(Profile p)
        {
            profile = p;
            if (p.stash.slots < StashSlotsFor(p.Up("stash"))) p.stash.SetSlots(StashSlotsFor(p.Up("stash")));
            foreach (var it in p.loadout.SetSlots(p.equipment.BackpackSlots())) p.stash.Add(it);
            foreach (var it in p.secure.SetSlots(SecureSlots())) p.stash.Add(it);
            UnlockedMaps();
            _game.events.Emit("profileChanged");
        }
    }
}
