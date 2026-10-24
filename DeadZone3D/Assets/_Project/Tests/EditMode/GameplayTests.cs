using System;
using System.Collections.Generic;
using DeadZone.Core;
using NUnit.Framework;

namespace DeadZone.Tests
{
    /// <summary>First-person feel hooks: walking tempo, aiming, forward-only sprint and the spread shown by the crosshair.</summary>
    public class GameplayTests
    {
        private const double DT = 1.0 / 60;

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

        private static ScriptedInput Input(Raid raid) => (ScriptedInput)raid.input;

        /// <summary>Centre of a 9x9 tile area that is walkable, has no doors or buildings and the same ground everywhere.</summary>
        private static (double x, double y) OpenSpot(Raid raid)
        {
            var w = raid.world;
            for (int ty = 6; ty < w.h - 6; ty++)
                for (int tx = 6; tx < w.w - 6; tx++)
                {
                    bool open = true;
                    double ground = w.SpeedMul(tx, ty);
                    for (int dy = -4; dy <= 4 && open; dy++)
                        for (int dx = -4; dx <= 4 && open; dx++)
                        {
                            int t = w.Tile(tx + dx, ty + dy);
                            if (!w.IsWalkable(tx + dx, ty + dy) || T.IsDoor(t) || w.BuildingIndexAtTile(tx + dx, ty + dy) >= 0 || w.SpeedMul(tx + dx, ty + dy) != ground) open = false;
                        }
                    if (open) return ((tx + 0.5) * World.TILE, (ty + 0.5) * World.TILE);
                }
            Assert.Inconclusive("no open 9x9 area on this map");
            return (0, 0);
        }

        /// <summary>A walkable tile at least minDist away (outside the zombies' active radius).</summary>
        private static (double x, double y) FarTile(Raid raid, double x, double y, double minDist)
        {
            var w = raid.world;
            for (int ty = 4; ty < w.h - 4; ty++)
                for (int tx = 4; tx < w.w - 4; tx++)
                {
                    double cx = (tx + 0.5) * World.TILE, cy = (ty + 0.5) * World.TILE;
                    if (w.IsWalkable(tx, ty) && M.Dist(cx, cy, x, y) >= minDist) return (cx, cy);
                }
            Assert.Inconclusive("map too small");
            return (0, 0);
        }

        /// <summary>Distance the player walks in n steps with the given input set-up.</summary>
        private static double PlayerWalk(double moveScale, Vec2 move, bool sprint = false, bool aiming = false, int n = 20)
        {
            var raid = QuietRaid(31u);
            var (x, y) = OpenSpot(raid);
            var p = raid.player;
            p.x = x; p.y = y; p.angle = 0;
            p.aiming = aiming;
            raid.moveScale = moveScale;
            var input = Input(raid);
            input.move = move;
            if (sprint) input.down.Add("sprint");
            for (int i = 0; i < n; i++) raid.Update(DT);
            return M.Dist(x, y, p.x, p.y);
        }

        [Test]
        public void MoveScaleSlowsThePlayer()
        {
            var east = new Vec2(1, 0);
            double normal = PlayerWalk(1, east), calm = PlayerWalk(0.65, east);
            Assert.Greater(normal, 40, "walked about 150 px/s");
            Assert.AreEqual(0.65, calm / normal, 1e-9);
            double sprint = PlayerWalk(1, east, true), calmSprint = PlayerWalk(0.65, east, true);
            Assert.Greater(sprint, normal * 1.5);
            Assert.AreEqual(0.65, calmSprint / sprint, 1e-9);
        }

        /// <summary>Path length a zombie covers in n steps (sum of the per-step moves).</summary>
        private static double ZombiePath(double moveScale, string typeId, Action<Raid, Zombie> setup, bool playerFar = false, int n = 20)
        {
            var raid = QuietRaid(33u);
            var (x, y) = OpenSpot(raid);
            var p = raid.player;
            if (playerFar) (p.x, p.y) = FarTile(raid, x, y, 1700);
            else { p.x = x - 80; p.y = y; }
            raid.nav.Rebuild(p.x, p.y, 60);
            raid.moveScale = moveScale;
            var z = raid.zombies.Spawn(typeId, x, y);
            Assert.IsNotNull(z);
            setup(raid, z);
            double path = 0;
            for (int i = 0; i < n; i++)
            {
                double ox = z.x, oy = z.y;
                raid.Update(DT);
                path += M.Dist(ox, oy, z.x, z.y);
            }
            return path;
        }

        [Test]
        public void MoveScaleSlowsChasingWanderingAndChargingZombies()
        {
            Action<Raid, Zombie> chase = (raid, z) => { z.state = "chase"; z.alert = 1; z.lastSeen = new Vec2(raid.player.x, raid.player.y); };
            double normal = ZombiePath(1, "walker", chase), calm = ZombiePath(0.65, "walker", chase);
            Assert.Greater(normal, 5, "the walker moved towards the player");
            Assert.AreEqual(0.65, calm / normal, 1e-6);

            // far from the player zombies move in coarse 0.5 s steps
            Action<Raid, Zombie> investigate = (raid, z) => { z.state = "investigate"; z.target = new Vec2(z.x + 120, z.y); };
            double far = ZombiePath(1, "walker", investigate, true, 70), farCalm = ZombiePath(0.65, "walker", investigate, true, 70);
            Assert.Greater(far, 5, "the far walker moved");
            Assert.AreEqual(0.65, farCalm / far, 1e-6);

            // boss charge (south, past the player in the west): the dash is slower too, its duration stays the same
            Action<Raid, Zombie> charge = (raid, z) => { z.state = "ability"; z.ability = new BossAbility { kind = "charge", t = 0, total = 0.5, dash = 0.9, vx = 0, vy = 1 }; };
            double dash = ZombiePath(1, "boss", charge, false, 6), dashCalm = ZombiePath(0.65, "boss", charge, false, 6);
            Assert.AreEqual(420 * DT * 6, dash, 1e-6);
            Assert.AreEqual(0.65, dashCalm / dash, 1e-6);
        }

        [Test]
        public void AimingTightensSpreadSlowsWalkingAndBlocksSprint()
        {
            var raid = QuietRaid(31u);
            var p = raid.player;
            double still = p.SpreadMul();
            p.aiming = true;
            Assert.AreEqual(still * 0.65, p.SpreadMul(), 1e-12);
            p.crouching = true;
            Assert.AreEqual(0.6 * 0.65, p.SpreadMul(), 1e-12, "stacks with crouching");

            var east = new Vec2(1, 0);
            Assert.AreEqual(0.75, PlayerWalk(1, east, false, true) / PlayerWalk(1, east), 1e-9);
            // holding sprint while aiming: aiming wins, it is the normal aiming walk
            Assert.AreEqual(PlayerWalk(1, east, false, true), PlayerWalk(1, east, true, true), 1e-9);

            raid = QuietRaid(31u);
            var (x, y) = OpenSpot(raid);
            p = raid.player;
            p.x = x; p.y = y;
            var input = Input(raid);
            input.move = east;
            input.down.Add("sprint");
            raid.Update(DT);
            Assert.IsTrue(p.sprinting);
            p.aiming = true;
            raid.Update(DT);
            Assert.IsFalse(p.sprinting);
        }

        [Test]
        public void SprintForwardOnlyBlocksSidewaysAndBackwardSprint()
        {
            bool Sprints(Vec2 move, bool forwardOnly)
            {
                var raid = QuietRaid(31u);
                var (x, y) = OpenSpot(raid);
                var p = raid.player;
                p.x = x; p.y = y; p.angle = 0; // facing east
                p.sprintForwardOnly = forwardOnly;
                var input = Input(raid);
                input.move = move;
                input.down.Add("sprint");
                raid.Update(DT);
                return p.sprinting;
            }
            double d = Math.Sqrt(0.5);
            Assert.IsTrue(Sprints(new Vec2(1, 0), true), "straight ahead");
            Assert.IsTrue(Sprints(new Vec2(d, d), true), "45° to the right is still forward");
            Assert.IsFalse(Sprints(new Vec2(0, 1), true), "sideways");
            Assert.IsFalse(Sprints(new Vec2(-1, 0), true), "backwards");
            Assert.IsFalse(Sprints(new Vec2(0.4, -0.9165), true), "about 66° to the left");
            Assert.IsTrue(Sprints(new Vec2(0, 1), false), "top-down: sprint in any direction");
            Assert.IsTrue(Sprints(new Vec2(-1, 0), false));
        }

        /// <summary>Projectile directions of a fixed shot sequence (pistol in several stances, shotgun with shot and slug).</summary>
        private static List<double> FireSequence()
        {
            var raid = QuietRaid(21u);
            var p = raid.player;
            var ws = raid.weapons;
            var pistol = Items.Create("pistol_m9");
            var shotgun = Items.Create("shotgun_pump");
            var outp = new List<double>();
            void Shot(ItemInst inst, double aim)
            {
                int before = ws.projectiles.Count;
                WeaponSystem.Rt(inst).cooldown = 0;
                var r = ws.TryFire(inst, p, aim);
                Assert.IsTrue(r.fired, r.reason);
                for (int i = before; i < ws.projectiles.Count; i++) outp.Add(Math.Atan2(ws.projectiles[i].vy, ws.projectiles[i].vx));
            }
            Shot(pistol, 0.3);
            p.crouching = true; Shot(pistol, 0.3); p.crouching = false;
            p.moving = true; Shot(pistol, -1.2); p.moving = false;
            Shot(pistol, 2.0); // with the bloom of the previous shots
            Shot(shotgun, 0.7);
            shotgun.ammoId = "ammo_12g_slug"; Shot(shotgun, 0.7);
            return outp;
        }

        [Test]
        public void ShotsAreExactlyTheSameAsBeforeCurrentSpreadExisted()
        {
            // recorded with the code before WeaponSystem.CurrentSpread was introduced
            double[] expected =
            {
                0.3480950446682982, 0.31163217767636525, -1.2656365690549136, 2.0315213025984122,
                0.6963994336314498, 0.6332439323375001, 0.6731232458446175, 0.6719844809826463,
                0.8098121555801481, 0.5659602121775971, 0.6986507741408423, 0.7947854881500823,
                0.760116945213126,
            };
            var got = FireSequence();
            Assert.AreEqual(expected.Length, got.Count);
            for (int i = 0; i < expected.Length; i++) Assert.AreEqual(expected[i], got[i], 1e-12, "projectile " + i);
        }

        [Test]
        public void TryFireUsesCurrentSpread()
        {
            // two identical raids: b only tells which random numbers a's next shot will draw
            var a = QuietRaid(23u);
            var b = QuietRaid(23u);
            Assert.AreEqual(a.weapons.rng.State, b.weapons.rng.State);
            var p = a.player;
            var gun = Items.Create("rifle_ak");
            var stances = new Action[] { () => { }, () => p.crouching = true, () => { p.crouching = false; p.aiming = true; }, () => { p.aiming = false; p.moving = true; } };
            const double aim = 0.4;
            foreach (var stance in stances)
            {
                stance();
                double spread = WeaponSystem.CurrentSpread(gun, p);
                double r1 = b.weapons.rng.Next(), r2 = b.weapons.rng.Next();
                WeaponSystem.Rt(gun).cooldown = 0;
                int before = a.weapons.projectiles.Count;
                Assert.IsTrue(a.weapons.TryFire(gun, p, aim).fired);
                var pr = a.weapons.projectiles[before];
                Assert.AreEqual((r1 + r2 - 1) * spread, Math.Atan2(pr.vy, pr.vx) - aim, 1e-9);
                Assert.AreEqual(b.weapons.rng.State, a.weapons.rng.State, "one shot draws exactly two numbers");
            }
            Assert.Greater(gun.rt.bloom, 0, "bloom grew and was part of the spread");
        }

        [Test]
        public void CurrentSpreadDrawsNoRandomNumbersAndKnowsTheWeapon()
        {
            var raid = QuietRaid(23u);
            var p = raid.player;
            var ws = raid.weapons;
            var pistol = Items.Create("pistol_m9");
            string state = ws.rng.State;
            double s0 = 0;
            for (int i = 0; i < 50; i++) s0 = WeaponSystem.CurrentSpread(pistol, p);
            Assert.AreEqual(state, ws.rng.State);
            Assert.IsNull(pistol.rt, "only reading: no runtime state is created");
            Assert.AreEqual(0.05, s0, 1e-12, "M9 standing still");
            p.aiming = true;
            Assert.AreEqual(0.05 * 0.65, WeaponSystem.CurrentSpread(pistol, p), 1e-12);
            Assert.AreEqual(0, WeaponSystem.CurrentSpread(Items.Create("melee_knife"), p));
            Assert.AreEqual(0, WeaponSystem.CurrentSpread(null, p));
            var slug = Items.Create("shotgun_pump");
            double shot = WeaponSystem.CurrentSpread(slug, p);
            slug.ammoId = "ammo_12g_slug";
            Assert.AreEqual(shot * 0.35, WeaponSystem.CurrentSpread(slug, p), 1e-12);
        }

        [Test]
        public void TempoSettingRoundTripAndDefault()
        {
            Assert.AreEqual("calm", new Settings().tempo);
            var back = Settings.FromJson(Json.Parse(Json.Write(new Settings { tempo = "original" }.ToJson())));
            Assert.AreEqual("original", back.tempo);
            Assert.AreEqual("calm", Settings.FromJson(Json.Parse(Json.Write(new Settings().ToJson()))).tempo);
            Assert.AreEqual("calm", Settings.FromJson(new Dictionary<string, object> { ["fov"] = 80.0 }).tempo, "settings from older versions");
            Assert.AreEqual("calm", Settings.FromJson(new Dictionary<string, object> { ["tempo"] = "turbo" }).tempo);
            Assert.AreEqual("calm", Settings.FromJson(new Dictionary<string, object> { ["tempo"] = 3.0 }).tempo);

            Assert.AreEqual(0.65, new Settings().MoveScale(true), 1e-12);
            Assert.AreEqual(1, new Settings().MoveScale(false), 1e-12, "top-down keeps the original speed");
            Assert.AreEqual(1, new Settings { tempo = "original" }.MoveScale(true), 1e-12);
            Assert.AreEqual(1, new Raid(null).moveScale, "a raid starts at the original tempo");
        }
    }
}
