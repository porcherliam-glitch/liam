using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using NUnit.Framework;

namespace DeadZone.Tests
{
    /// <summary>Scripted input for simulation tests.</summary>
    public sealed class ScriptedInput : IPlayerInput
    {
        public Vec2 move;
        public double aim = double.NaN;
        public bool fire;
        public readonly HashSet<string> down = new HashSet<string>();
        public readonly HashSet<string> pressedOnce = new HashSet<string>();
        public Vec2 MoveAxis() => move;
        public bool Pressed(string action) => pressedOnce.Remove(action);
        public bool IsDown(string action) => down.Contains(action);
        public double AimAngle(double px, double py) => aim;
        public bool WantsFire() => fire;
    }

    public class SimTests
    {
        private const double DT = 1.0 / 60;

        private static GameCore NewCore(MemoryStorage storage = null)
        {
            var core = new GameCore(storage ?? new MemoryStorage(), new NullFeedback(), 42);
            core.NewGame();
            return core;
        }

        private static void Step(Raid raid, int n) { for (int i = 0; i < n && !raid.ended; i++) raid.Update(DT); }

        [Test]
        public void MissionDataIsValid()
        {
            CollectionAssert.IsEmpty(MissionSystem.Validate());
        }

        [Test]
        public void NewGameHasStarterKit()
        {
            var core = NewCore();
            var p = core.Profile;
            Assert.AreEqual(800, p.credits);
            Assert.AreEqual("pistol_m9", p.equipment.secondary.id);
            Assert.AreEqual("melee_knife", p.equipment.melee.id);
            Assert.AreEqual(30, p.loadout.Count("ammo_9mm"));
            Assert.Greater(p.traderStock.Count, 10);
        }

        [Test]
        public void RaidRunsOnAllMapsWithoutErrors()
        {
            foreach (var mapId in DataTables.MAP_ORDER)
            {
                var core = NewCore();
                var input = new ScriptedInput();
                var raid = core.StartRaid(mapId, new List<string>(), 7u, input);
                raid.player.god = true;
                int errors = Log.ErrorCount;
                var sw = Stopwatch.StartNew();
                var rng = new Rng(5);
                for (int s = 0; s < 60 * 90 && !raid.ended; s++)
                {
                    if (s % 90 == 0) { double a = rng.Float(-Math.PI, Math.PI); input.move = new Vec2(Math.Cos(a), Math.Sin(a)); input.aim = a; }
                    input.fire = s % 40 < 3;
                    raid.Update(DT);
                }
                sw.Stop();
                Assert.AreEqual(errors, Log.ErrorCount, mapId + ": errors logged");
                Assert.IsFalse(raid.ended, mapId + " ended unexpectedly: " + raid.result?.outcome);
                Assert.Greater(raid.zombies.AliveCount(), 10, mapId);
                Assert.Less(sw.Elapsed.TotalMilliseconds / (60 * 90), 4.0, mapId + ": simulation step too slow");
            }
        }

        [Test]
        public void ShootingKillsZombieAndCountsMission()
        {
            var core = NewCore();
            Assert.IsTrue(core.missions.Accept(core.Profile, "city_01").ok);
            var input = new ScriptedInput();
            var raid = core.StartRaid("city", null, 11u, input);
            var p = raid.player;
            p.god = true;
            raid.zombies.directorEnabled = false;
            foreach (var z0 in raid.zombies.zombies) raid.zombies.Kill(z0, true);
            // find an open spot east of the player
            double zx = p.x + 90, zy = p.y;
            for (int k = 0; k < 40 && !raid.world.IsWalkable(M.Floor(zx / 32), M.Floor(zy / 32)); k++) zx -= 4;
            Assume.That(Physics.LineOfSight(raid.world, p.x, p.y, zx, zy), "needs a free line of fire");
            var z = raid.zombies.Spawn("walker", zx, zy);
            p.activeSlot = 1;
            input.aim = M.AngleTo(p.x, p.y, z.x, z.y);
            for (int s = 0; s < 600 && !z.dead; s++)
            {
                input.aim = M.AngleTo(p.x, p.y, z.x, z.y);
                input.fire = s % 20 < 2;
                raid.Update(DT);
            }
            Assert.IsTrue(z.dead, "walker should die");
            Assert.GreaterOrEqual(p.stats.kills, 1);
            var kill = raid.missionStates[0].optional.First(o => o.def.type == "kill");
            Assert.GreaterOrEqual(kill.progress, 1);
            Assert.Greater(p.stats.shotsHit, 0);
        }

        [Test]
        public void ExtractionMovesLootToStashAndCompletesMission()
        {
            var core = NewCore();
            Assert.IsTrue(core.missions.Accept(core.Profile, "city_01").ok);
            var input = new ScriptedInput();
            var raid = core.StartRaid("city", null, 3u, input);
            raid.player.god = true;
            raid.zombies.directorEnabled = false;
            foreach (var z in raid.zombies.zombies) raid.zombies.Kill(z, true);
            // search three house containers
            var houses = raid.world.containers.Where(c => c.buildingType == "house").Take(3).ToList();
            Assume.That(houses.Count, Is.EqualTo(3));
            foreach (var c in houses) raid.OpenContainer(c);
            var watch = Items.Create("col_watch", 1);
            watch.raidFound = true;
            raid.player.inventory.Add(watch);
            var ex = raid.extraction.points.First(e => e.id == "city_edge");
            raid.player.x = ex.x; raid.player.y = ex.y;
            Step(raid, (int)(ex.duration * 60) + 30);
            Assert.IsTrue(raid.ended);
            Assert.AreEqual("extracted", raid.result.outcome);
            Assert.AreEqual(1, raid.result.missionsCompleted.Count, "city_01 completed");
            Assert.Contains("city_01", core.Profile.missions.completed);
            Assert.GreaterOrEqual(core.Profile.stash.Count("col_watch"), 1);
            Assert.Greater(core.Profile.xp, 0);
            Assert.IsNull(core.Profile.raidInProgress);
        }

        [Test]
        public void DeathLosesGearButKeepsSecureContainer()
        {
            var core = NewCore();
            var cash = Items.Create("col_watch", 1);
            core.Profile.secure.Add(cash);
            var input = new ScriptedInput();
            var raid = core.StartRaid("city", null, 5u, input);
            raid.player.TakeDamage(1000, "Test");
            Assert.IsTrue(raid.ended);
            Assert.AreEqual("death", raid.result.outcome);
            var p = core.Profile;
            Assert.IsNull(p.equipment.secondary, "pistol lost");
            Assert.AreEqual(0, p.loadout.All().Count);
            Assert.AreEqual(1, p.stash.Count("col_watch"), "secure item kept");
            Assert.AreEqual(35, p.hp);
            Assert.AreEqual(1, p.Stat("deaths"));
        }

        [Test]
        public void ReloadDuringRaidCountsAsMissingInAction()
        {
            var storage = new MemoryStorage();
            var core = NewCore(storage);
            core.StartRaid("city", null, 9u, new ScriptedInput());
            // the game is closed mid-raid: a new session loads the save
            var core2 = new GameCore(storage, new NullFeedback(), 1);
            var r = core2.Continue();
            Assert.IsTrue(r.ok);
            Assert.IsTrue(r.mia);
            Assert.IsNull(core2.Profile.equipment.secondary);
            Assert.AreEqual(1, core2.Profile.Stat("mia"));
            Assert.IsNull(core2.Profile.raidInProgress);
        }

        [Test]
        public void SaveRoundTripKeepsProfile()
        {
            var storage = new MemoryStorage();
            var core = NewCore(storage);
            core.Profile.credits = 1234;
            core.Profile.upgrades["stash"] = 1;
            core.Profile.stash.SetSlots(36);
            core.Profile.stash.Add(Items.Create("rifle_ak", 1));
            core.missions.Accept(core.Profile, "city_01");
            Assert.IsTrue(core.save.Save(core.Profile));
            var core2 = new GameCore(storage, new NullFeedback(), 1);
            var r = core2.Continue();
            Assert.IsTrue(r.ok, r.error);
            Assert.IsFalse(r.mia);
            Assert.AreEqual(1234, core2.Profile.credits);
            Assert.AreEqual(36, core2.Profile.stash.slots);
            Assert.AreEqual(1, core2.Profile.stash.Count("rifle_ak"));
            Assert.Contains("city_01", core2.Profile.missions.active);
            Assert.AreEqual("pistol_m9", core2.Profile.equipment.secondary.id);
        }

        [Test]
        public void CorruptSaveFallsBackToBackup()
        {
            var storage = new MemoryStorage();
            var core = NewCore(storage);
            core.Profile.credits = 777;
            core.save.Save(core.Profile);
            core.save.Save(core.Profile);
            storage.Data[SaveSystem.KEY] = "{kaputt";
            var r = new GameCore(storage, new NullFeedback(), 1).Continue();
            Assert.IsTrue(r.ok);
            Assert.That(r.repaired[0], Does.Contain("Sicherung"));
        }

        [Test]
        public void TraderCraftingAndUpgrades()
        {
            var core = NewCore();
            var pm = core.profileMgr;
            var p = core.Profile;
            p.credits = 100000;
            int idx = p.traderStock.FindIndex(o => o.id == "ammo_9mm");
            Assert.GreaterOrEqual(idx, 0);
            int before = p.stash.Count("ammo_9mm");
            Assert.IsTrue(pm.Buy(idx, 10).ok);
            Assert.AreEqual(before + 10, p.stash.Count("ammo_9mm"));
            var watch = Items.Create("col_watch", 1);
            p.stash.Add(watch);
            var sell = pm.Sell(watch.uid);
            Assert.IsTrue(sell.ok);
            Assert.Greater(sell.credits, 0);
            p.stash.Add(Items.Create("mat_scrap", 10));
            Assert.IsTrue(pm.Craft("rc_steel").ok);
            Assert.AreEqual(1, p.stash.Count("mat_steel"));
            p.stash.Add(Items.Create("mat_wood", 4));
            Assert.IsTrue(pm.Upgrade("stash").ok);
            Assert.AreEqual(36, p.stash.slots);
            Assert.AreEqual(1, p.upgrades["stash"]);
        }

        [Test]
        public void LockedHallNeedsKeyCardAndGeneratorPowersExtraction()
        {
            var core = NewCore();
            core.Profile.xp = 100000;
            var input = new ScriptedInput();
            var raid = core.StartRaid("research", new List<string>(), 4u, input);
            raid.player.god = true;
            raid.zombies.directorEnabled = false;
            foreach (var z in raid.zombies.zombies) raid.zombies.Kill(z, true);
            var hall = raid.world.buildings.First(b => b.hall);
            var door = hall.doors[0];
            Assert.AreEqual(T.DOOR_LOCKED, raid.world.Tile(door.tx, door.ty));
            var it = new Interactable { kind = "door", tx = door.tx, ty = door.ty, x = (door.tx + 0.5) * 32, y = (door.ty + 0.5) * 32 };
            raid.Interact(it);
            Assert.AreEqual(T.DOOR_LOCKED, raid.world.Tile(door.tx, door.ty), "still locked without card");
            raid.player.inventory.Add(Items.Create("key_lab_card"));
            raid.Interact(it);
            Assert.AreEqual(T.DOOR_OPEN, raid.world.Tile(door.tx, door.ty));
            var gen = raid.world.pois.First(q => q.type == "generator");
            raid.player.x = gen.x + 30; raid.player.y = gen.y;
            if (!raid.world.IsWalkable(M.Floor(raid.player.x / 32), M.Floor(raid.player.y / 32))) { raid.player.x = gen.x - 30; }
            input.down.Add("interact");
            Step(raid, 60 * 5);
            Assert.IsTrue(raid.generatorOn, "generator started by holding E");
            var power = raid.extraction.points.First(e => e.kind == "power");
            input.down.Clear();
            Step(raid, 2);
            Assert.IsTrue(power.active);
        }

        [Test]
        public void GrenadeDamagesZombies()
        {
            var core = NewCore();
            core.Profile.equipment.Equip(Items.Create("grenade_frag", 2), "grenade");
            var input = new ScriptedInput();
            var raid = core.StartRaid("city", null, 13u, input);
            raid.player.god = true;
            raid.zombies.directorEnabled = false;
            foreach (var z0 in raid.zombies.zombies) raid.zombies.Kill(z0, true);
            var p = raid.player;
            double a = 0;
            for (; a < Math.PI * 2; a += 0.3)
                if (!Physics.RaycastTiles(raid.world, p.x, p.y, p.x + Math.Cos(a) * 480, p.y + Math.Sin(a) * 480).hit) break;
            p.angle = a; input.aim = a;
            var z = raid.zombies.Spawn("brute", p.x + Math.Cos(a) * 330, p.y + Math.Sin(a) * 330);
            z.state = "stunned"; z.stunTimer = 10;
            Assert.IsTrue(p.ThrowGrenade());
            Step(raid, 60 * 4);
            Assert.Less(z.hp, z.hpMax, "brute took explosion damage");
        }

        [Test]
        public void InventoryStacksAndSorts()
        {
            var inv = new Inventory(4);
            Assert.IsTrue(inv.Add(Items.Create("ammo_9mm", 50)).ok);
            Assert.IsTrue(inv.Add(Items.Create("ammo_9mm", 50)).ok);
            Assert.AreEqual(100, inv.Count("ammo_9mm"));
            Assert.AreEqual(2, inv.All().Count);
            inv.Add(Items.Create("med_bandage", 2));
            inv.Add(Items.Create("pistol_m9"));
            inv.Sort();
            Assert.AreEqual("pistol_m9", inv.items[0].id);
            Assert.IsFalse(inv.Add(Items.Create("rifle_ak")).ok, "full");
        }
    }
}
