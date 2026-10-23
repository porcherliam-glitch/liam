using System.Collections.Generic;
using System.Linq;
using DeadZone.Core;
using NUnit.Framework;

namespace DeadZone.Tests
{
    /// <summary>Regression tests for the inventory, loot and reload fixes from the second audit.</summary>
    public class FixTests
    {
        private const double DT = 1.0 / 60;

        private static GameCore NewCore()
        {
            var core = new GameCore(new MemoryStorage(), new NullFeedback(), 42);
            core.NewGame();
            return core;
        }

        private static Raid QuietRaid(GameCore core, uint seed)
        {
            var raid = core.StartRaid("city", null, seed, new ScriptedInput());
            raid.player.god = true;
            raid.zombies.directorEnabled = false;
            foreach (var z in raid.zombies.zombies) raid.zombies.Kill(z, true);
            return raid;
        }

        private static void FillStash(Profile p, int leaveFree)
        {
            int n = 0;
            while (p.stash.FreeSlots() > leaveFree && n++ < 500) p.stash.Add(Items.Create("pistol_m9"));
        }

        [Test]
        public void CorpseFlashFadesAfterDeath()
        {
            var core = NewCore();
            var raid = QuietRaid(core, 4u);
            var z = raid.zombies.Spawn("walker", raid.player.x + 200, raid.player.y);
            z.flash = 0.12;
            raid.zombies.Kill(z, true);
            for (int i = 0; i < 30; i++) raid.Update(DT);
            Assert.AreEqual(0, z.flash, 1e-9, "a corpse must not keep the white hit flash");
            Assert.Greater(z.deathTimer, 0.4);
        }

        [Test]
        public void UnequippingBackpackIsRefusedWhenStashCannotHoldItsContents()
        {
            var core = NewCore();
            var p = core.Profile;
            var pm = core.profileMgr;
            p.equipment.Equip(Items.Create("pack_large"), "backpack");
            pm.FixLoadoutSlots();
            while (p.loadout.All().Count < 10) p.loadout.Add(Items.Create("pistol_m9"));
            FillStash(p, 2);
            int before = p.stash.All().Count + p.loadout.All().Count;

            Assert.IsFalse(pm.UnequipToStash("backpack"), "10 stacks cannot shrink into 6 slots plus 2 stash slots");
            Assert.AreEqual("pack_large", p.equipment.backpack.id);
            Assert.AreEqual(before, p.stash.All().Count + p.loadout.All().Count, "nothing lost");
        }

        [Test]
        public void SwappingToSmallerBackpackIsUndoneWhenOverflowDoesNotFit()
        {
            var core = NewCore();
            var p = core.Profile;
            var pm = core.profileMgr;
            p.equipment.Equip(Items.Create("pack_large"), "backpack");
            pm.FixLoadoutSlots();
            while (p.loadout.All().Count < 14) p.loadout.Add(Items.Create("pistol_m9"));
            p.stash.Add(Items.Create("pack_small")); // 12 slots: 2 stacks overflow, the stash has only 1 free slot
            FillStash(p, 1);
            int credits = p.credits;
            var uid = p.stash.All().First(i => i.id == "pack_small").uid;

            var r = pm.EquipFromStash(uid);
            Assert.IsFalse(r.ok);
            Assert.AreEqual("pack_large", p.equipment.backpack.id, "the swap is undone");
            Assert.AreEqual(14, p.loadout.All().Count, "backpack contents untouched");
            Assert.AreEqual(1, p.stash.Count("pack_small"));
            Assert.AreEqual(credits, p.credits, "nothing was sold");
        }

        [Test]
        public void TryBackpackChangeKeepsChangesThatFit()
        {
            var core = NewCore();
            var p = core.Profile;
            var pm = core.profileMgr;
            p.stash.Add(Items.Create("pack_medium"));
            var uid = p.stash.All().First(i => i.id == "pack_medium").uid;
            Assert.IsTrue(pm.EquipFromStash(uid).ok);
            Assert.AreEqual("pack_medium", p.equipment.backpack.id);
            Assert.AreEqual(p.equipment.BackpackSlots(), p.loadout.slots);
            Assert.IsTrue(pm.UnequipToStash("backpack"));
            Assert.IsNull(p.equipment.backpack);
            Assert.AreEqual(6, p.loadout.slots);
        }

        [Test]
        public void LootCanBeTakenStraightIntoSecureContainer()
        {
            var core = NewCore();
            var raid = QuietRaid(core, 6u);
            var c = raid.world.containers.First(k => !k.locked);
            raid.OpenContainer(c);
            c.items.Clear();
            var watch = Items.Create("col_watch", 1);
            watch.raidFound = true;
            c.items.Add(watch);
            var r = raid.TakeFromContainer(c, 0, int.MaxValue, raid.player.secure);
            Assert.IsTrue(r.ok);
            Assert.AreEqual(1, raid.player.secure.Count("col_watch"));
            Assert.AreEqual(0, raid.player.inventory.Count("col_watch"));
            Assert.IsNull(c.items[0]);
        }

        [Test]
        public void PutIntoContainerReusesEmptySlots()
        {
            var core = NewCore();
            var raid = QuietRaid(core, 6u);
            var c = raid.world.containers.First(k => !k.locked);
            raid.OpenContainer(c);
            int count = c.items.Count;
            for (int i = 0; i < 20; i++)
            {
                int idx = c.items.FindIndex(it => it != null);
                if (idx < 0) break;
                var inst = c.items[idx];
                raid.TakeFromContainer(c, idx);
                var back = raid.player.inventory.All().FirstOrDefault(it => it.uid == inst.uid) ?? raid.player.inventory.All().Last();
                int slot = raid.player.inventory.IndexOf(back.uid);
                if (raid.PutIntoContainer(c, back)) raid.player.inventory.items[slot] = null;
            }
            Assert.LessOrEqual(c.items.Count, System.Math.Max(count, 12), "the container list must not grow");
        }

        [Test]
        public void CarriedGearIsNotCountedAsRaidLoot()
        {
            var core = NewCore();
            var p = core.Profile;
            p.loadout.Add(Items.Create("col_watch", 1));
            var raid = QuietRaid(core, 3u);
            var ex = raid.extraction.points.First(e => e.id == "city_edge");
            raid.player.x = ex.x; raid.player.y = ex.y;
            for (int i = 0; i < (int)(ex.duration * 60) + 30 && !raid.ended; i++) raid.Update(DT);
            Assert.AreEqual("extracted", raid.result.outcome);
            Assert.AreEqual(0, raid.result.lootValue, 1e-9, "the watch was brought in, not found");
            Assert.IsTrue(p.stash.All().Concat(p.loadout.All()).All(it => !it.raidFound), "raid flags are cleared after the raid");
        }

        [Test]
        public void SwitchingAmmoOnLmgReturnsTheWholeBelt()
        {
            var core = NewCore();
            var raid = QuietRaid(core, 8u);
            var inv = new Inventory(10);
            var lmg = Items.Create("lmg_pkm");
            lmg.ammoId = "ammo_762";
            lmg.mag = 90;
            inv.Add(Items.Create("ammo_762_ap", 60));
            raid.weapons.FinishReload(lmg, inv, "ammo_762_ap");
            Assert.AreEqual(90, inv.Count("ammo_762"), "all 90 standard rounds come back");
            Assert.AreEqual("ammo_762_ap", lmg.ammoId);
            Assert.AreEqual(60, lmg.mag);
        }

        [Test]
        public void QuickPackReportsOnlyRealMoves()
        {
            var core = NewCore();
            var p = core.Profile;
            var pm = core.profileMgr;
            while (!p.loadout.IsFull()) p.loadout.Add(Items.Create("pistol_m9"));
            p.stash.Add(Items.Create("rifle_ak"));
            var uid = p.stash.All().First(i => i.id == "rifle_ak").uid;
            int idx = p.stash.IndexOf(uid);
            Assert.IsFalse(pm.MoveStashToLoadout(uid), "a full backpack takes nothing");
            Assert.AreEqual(idx, p.stash.IndexOf(uid), "the item stays where it was");
        }
    }
}
