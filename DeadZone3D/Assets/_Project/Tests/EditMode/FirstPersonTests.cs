using System.Collections.Generic;
using System.Linq;
using DeadZone.Core;
using NUnit.Framework;

namespace DeadZone.Tests
{
    /// <summary>Simulation hooks used by the first-person view: look-based interaction, throw strength and the new settings.</summary>
    public class FirstPersonTests
    {
        private static Raid QuietRaid(uint seed)
        {
            var core = new GameCore(new MemoryStorage(), new NullFeedback(), 42);
            core.NewGame();
            var raid = core.StartRaid("city", null, seed, new ScriptedInput());
            raid.player.god = true;
            raid.zombies.directorEnabled = false;
            foreach (var z in raid.zombies.zombies) raid.zombies.Kill(z, true);
            return raid;
        }

        /// <summary>An open outdoor spot with nothing interactable within 120 px.</summary>
        private static (double x, double y) EmptySpot(Raid raid)
        {
            var w = raid.world;
            for (int ty = 4; ty < w.h - 4; ty++)
                for (int tx = 4; tx < w.w - 4; tx++)
                {
                    bool open = true;
                    for (int dy = -3; dy <= 3 && open; dy++)
                        for (int dx = -3; dx <= 3 && open; dx++)
                        {
                            int t = w.Tile(tx + dx, ty + dy);
                            if (!w.IsWalkable(tx + dx, ty + dy) || T.IsDoor(t) || w.BuildingIndexAtTile(tx + dx, ty + dy) >= 0) open = false;
                        }
                    if (!open) continue;
                    double x = (tx + 0.5) * World.TILE, y = (ty + 0.5) * World.TILE;
                    if (w.containers.Any(c => M.Dist(x, y, c.x, c.y) < 120)) continue;
                    if (w.floorLoot.Any(f => M.Dist(x, y, f.x, f.y) < 120)) continue;
                    if (w.pois.Any(p => M.Dist(x, y, p.x, p.y) < 120)) continue;
                    if (raid.extraction.points.Any(e => M.Dist(x, y, e.x, e.y) < e.radius + 60)) continue;
                    return (x, y);
                }
            Assert.Inconclusive("no empty spot on this map");
            return (0, 0);
        }

        private static FloorLoot Drop(Raid raid, string id, double x, double y)
        {
            var fl = new FloorLoot { uid = Uid.Next(), inst = Items.Create(id, 1), x = x, y = y };
            raid.world.floorLoot.Add(fl);
            return fl;
        }

        [Test]
        public void LookingAtAnItemPicksItOverACloserOneBehind()
        {
            var raid = QuietRaid(12u);
            var (x, y) = EmptySpot(raid);
            var behind = Drop(raid, "med_bandage", x - 30, y);
            var ahead = Drop(raid, "col_watch", x + 45, y);
            Assert.AreSame(behind, raid.FindInteractable(x, y).reference, "top-down: the nearest wins");
            Assert.AreSame(ahead, raid.FindInteractable(x, y, 56, 0).reference, "first person facing east: what is in view wins");
            Assert.AreSame(behind, raid.FindInteractable(x, y, 56, System.Math.PI).reference, "facing west");
            Assert.IsNull(raid.FindInteractable(x, y, 56, -System.Math.PI / 2), "facing north: both are to the side or behind");
        }

        [Test]
        public void ItemsAtTheFeetStayUsableWhateverTheView()
        {
            var raid = QuietRaid(12u);
            var (x, y) = EmptySpot(raid);
            var feet = Drop(raid, "med_bandage", x - 12, y);
            Assert.AreSame(feet, raid.FindInteractable(x, y, 56, 0).reference);
        }

        [Test]
        public void PlayerUsesLookDirectionOnlyWhenAsked()
        {
            var raid = QuietRaid(12u);
            var (x, y) = EmptySpot(raid);
            var p = raid.player;
            p.x = x; p.y = y; p.angle = 0;
            var behind = Drop(raid, "med_bandage", x - 30, y);
            var ahead = Drop(raid, "col_watch", x + 45, y);
            raid.Update(1.0 / 60);
            Assert.AreSame(behind, p.interactTarget?.reference);
            p.interactByLook = true;
            raid.Update(1.0 / 60);
            Assert.AreSame(ahead, p.interactTarget?.reference);
        }

        [Test]
        public void ThrowPowerChangesGrenadeSpeed()
        {
            double Speed(double power)
            {
                var raid = QuietRaid(14u);
                var p = raid.player;
                p.equipment["grenade"] = Items.Create("grenade_frag", 2);
                p.throwPower = power;
                Assert.IsTrue(p.ThrowGrenade());
                var g = raid.grenades.Last();
                return M.Hypot(g.vx, g.vy);
            }
            double normal = Speed(1), far = Speed(1.45), near = Speed(0.5);
            Assert.AreEqual(420, normal, 1e-6);
            Assert.Greater(far, normal);
            Assert.Less(near, normal);
        }

        [Test]
        public void ViewSettingsRoundTripAndDefaultForOldSaves()
        {
            var s = new Settings { view = "topdown", mouseSens = 0.8, invertY = true, fov = 85 };
            var back = Settings.FromJson(Json.Parse(Json.Write(s.ToJson())));
            Assert.AreEqual("topdown", back.view);
            Assert.AreEqual(0.8, back.mouseSens, 1e-9);
            Assert.IsTrue(back.invertY);
            Assert.AreEqual(85, back.fov, 1e-9);

            // settings saved by the previous version: first person with default values
            var old = Settings.FromJson(new Dictionary<string, object> { ["master"] = 0.5, ["quality"] = "low" });
            Assert.AreEqual("fps", old.view);
            Assert.AreEqual(0.35, old.mouseSens, 1e-9);
            Assert.IsFalse(old.invertY);
            Assert.AreEqual(70, old.fov, 1e-9);

            var wild = Settings.FromJson(new Dictionary<string, object> { ["view"] = "orbit", ["fov"] = 300.0, ["mouseSens"] = -2.0 });
            Assert.AreEqual("fps", wild.view);
            Assert.AreEqual(90, wild.fov, 1e-9);
            Assert.AreEqual(0, wild.mouseSens, 1e-9);
        }
    }
}
