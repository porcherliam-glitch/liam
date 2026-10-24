using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using NUnit.Framework;

namespace DeadZone.Tests
{
    /// <summary>First-person ballistics (shots follow the view pitch, head shots, floor hits) and solid zombies.</summary>
    public class BallisticsTests
    {
        private const double DT = 1.0 / 60;
        private const double M10 = 10 * Player.PxPerMetre, M15 = 15 * Player.PxPerMetre;

        /// <summary>Records effects and the hit height the weapon system reports with them.</summary>
        private sealed class FxLog : IFeedback
        {
            public WeaponSystem weapons;
            public readonly List<(Fx kind, double x, double y, double height, string text)> effects = new List<(Fx, double, double, double, string)>();
            public void Sfx(string name, double x = double.NaN, double y = double.NaN, double volume = 1, double pitch = 1) { }
            public void Toast(string text, string kind = "info", double ms = 2500) { }
            public void Shake(double strength) { }
            public void Effect(Fx kind, double x, double y, double a = 0, double b = 0, string text = null, string color = null)
                => effects.Add((kind, x, y, weapons?.fxHeight ?? double.NaN, text));
        }

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

        /// <summary>Puts the player at the west end of an open, roofless lane (12 tiles long, one tile clear on each side), facing east.</summary>
        private static FxLog ShootingRange(Raid raid)
        {
            var w = raid.world;
            const int len = 12;
            for (int ty = 4; ty < w.h - 4; ty++)
                for (int tx = 4; tx < w.w - len - 4; tx++)
                {
                    bool open = true;
                    for (int dx = -1; dx <= len && open; dx++)
                        for (int dy = -1; dy <= 1 && open; dy++)
                            if (!w.IsWalkable(tx + dx, ty + dy) || w.BuildingIndexAtTile(tx + dx, ty + dy) >= 0) open = false;
                    if (!open) continue;
                    var p = raid.player;
                    p.x = (tx + 0.5) * World.TILE; p.y = (ty + 0.5) * World.TILE; p.angle = 0;
                    var log = new FxLog { weapons = raid.weapons };
                    raid.fb = log;
                    return log;
                }
            Assert.Inconclusive("no open lane on this map");
            return null;
        }

        /// <summary>A zombie straight east of the player, facing them and standing still until it is hit.</summary>
        private static Zombie Target(Raid raid, string type, double dist)
        {
            var p = raid.player;
            var z = raid.zombies.Spawn(type, p.x + dist, p.y);
            z.angle = Math.PI;
            z.state = "stunned"; z.stunTimer = 999;
            return z;
        }

        /// <summary>One shot due east at the given view pitch (radians, positive = down; NaN = flat), then the raid runs until the bullet is gone.</summary>
        private static void Shoot(Raid raid, double pitch, string weapon = "sniper_bolt")
        {
            var p = raid.player;
            p.aimPitch = pitch;
            Assert.IsTrue(raid.weapons.TryFire(Items.Create(weapon), p, 0).fired);
            for (int s = 0; s < 150 && raid.weapons.projectiles.Count > 0; s++) raid.Update(DT);
            Assert.AreEqual(0, raid.weapons.projectiles.Count, "the bullet should be gone");
        }

        /// <summary>View pitch that puts the crosshair at the given height (m) over the given distance (px).</summary>
        private static double PitchAt(Player p, double heightM, double dist) => Math.Atan((p.eyeHeightPx - heightM * Player.PxPerMetre) / dist);

        [Test]
        public void WithoutPitchShotsStayFlat()
        {
            // the same raid twice: the second player has an absurd eye height, which must not matter for flat shots
            (int kills, int hits, double dealt, string rng, double x, double y) Fight(bool weirdEye)
            {
                var core = new GameCore(new MemoryStorage(), new NullFeedback(), 42);
                core.NewGame();
                var input = new ScriptedInput();
                var raid = core.StartRaid("city", null, 7u, input);
                var p = raid.player;
                p.god = true;
                Assert.IsTrue(double.IsNaN(p.aimPitch), "flat shots are the default");
                Assert.IsFalse(p.blockedByZombies, "walking through zombies is the default");
                if (weirdEye) p.eyeHeightPx = 1e6;
                p.activeSlot = 1;
                for (int k = 0; k < 6; k++)
                {
                    double zx = p.x + Math.Cos(k * Math.PI / 3) * 220, zy = p.y + Math.Sin(k * Math.PI / 3) * 220;
                    if (raid.world.IsWalkable(M.Floor(zx / World.TILE), M.Floor(zy / World.TILE))) raid.zombies.Spawn("walker", zx, zy);
                }
                var rng = new Rng(5);
                for (int s = 0; s < 60 * 40 && !raid.ended; s++)
                {
                    var z = raid.zombies.Nearest(p.x, p.y, 500);
                    if (s % 90 == 0) { double a = rng.Float(-Math.PI, Math.PI); input.move = new Vec2(Math.Cos(a) * 0.5, Math.Sin(a) * 0.5); }
                    input.aim = z != null ? M.AngleTo(p.x, p.y, z.x, z.y) : 0;
                    input.fire = z != null && s % 20 < 2;
                    if (s % 300 == 299) p.inventory.Add(Items.Create("ammo_9mm", 30));
                    raid.Update(DT);
                    foreach (var pr in raid.weapons.projectiles) Assert.IsFalse(pr.Aimed);
                }
                return (p.stats.kills, p.stats.shotsHit, p.stats.damageDealt, raid.weapons.rng.State + "|" + raid.zombies.rng.State, p.x, p.y);
            }
            var normal = Fight(false);
            Assert.Greater(normal.hits, 0, "the scripted fight should hit something");
            Assert.AreEqual(normal, Fight(true));

            // a flat shot draws two random numbers per pellet, exactly as before
            string Draws(bool fire)
            {
                var raid = QuietRaid(31u);
                ShootingRange(raid);
                if (fire) Assert.IsTrue(raid.weapons.TryFire(Items.Create("shotgun_pump"), raid.player, 0).fired);
                else for (int i = 0; i < 16; i++) raid.weapons.rng.Next();
                return raid.weapons.rng.State;
            }
            Assert.AreEqual(Draws(false), Draws(true));

            // and hits whatever it crosses with the plain damage, never a head shot
            var r2 = QuietRaid(21u);
            ShootingRange(r2);
            r2.player.eyeHeightPx = 1e6;
            var brute = Target(r2, "brute", M10);
            Shoot(r2, double.NaN);
            Assert.AreEqual(brute.hpMax - 150, brute.hp, 1e-9, "one plain sniper hit");
            Assert.AreEqual(0, r2.player.stats.headShots);
        }

        [Test]
        public void LevelAimHitsAZombieTenMetresAway()
        {
            var raid = QuietRaid(21u);
            var log = ShootingRange(raid);
            var p = raid.player;
            var z = Target(raid, "brute", M10);
            Shoot(raid, 0);
            Assert.Less(z.hp, z.hpMax, "level aim hits");
            Assert.AreEqual(1, p.stats.shotsHit);
            // eye level (1.62 m) is below the brute's head (its face starts at about 1.7 m): blood at about that height
            var blood = log.effects.First(e => e.kind == Fx.Blood);
            Assert.AreEqual(1.62, blood.height, 0.1);
            Assert.AreEqual(0, p.stats.headShots);
        }

        [Test]
        public void EyeLevelIsAWalkersHead()
        {
            var raid = QuietRaid(21u);
            var log = ShootingRange(raid);
            var z = Target(raid, "walker", M10);
            Shoot(raid, 0);
            Assert.IsTrue(z.dead);
            Assert.AreEqual(1, raid.player.stats.headShots, "a 1.8 m zombie has its head at the shooter's eye level");
            Assert.IsTrue(log.effects.Any(e => e.kind == Fx.FloatingText && e.text != null && e.text.StartsWith("Kopftreffer!")));
        }

        [Test]
        public void AimingFarDownHitsTheFloorFirst()
        {
            var raid = QuietRaid(21u);
            var log = ShootingRange(raid);
            var p = raid.player;
            var z = Target(raid, "walker", M15);
            double floorAt = 5 * Player.PxPerMetre;
            Shoot(raid, PitchAt(p, 0, floorAt));
            Assert.AreEqual(z.hpMax, z.hp, "the zombie 15 m away is not touched");
            var impact = log.effects.Where(e => e.kind == Fx.Impact).ToList();
            Assert.AreEqual(1, impact.Count, "one impact on the floor");
            Assert.AreEqual(p.x + floorAt, impact[0].x, 4, "about 5 m ahead");
            Assert.Less(impact[0].height, 0.1, "at floor height");
        }

        [Test]
        public void HeadShotDoesMoreDamageThanABodyHit()
        {
            (double loss, int heads) Hit(double heightM)
            {
                var raid = QuietRaid(21u);
                ShootingRange(raid);
                var z = Target(raid, "brute", M10);
                Shoot(raid, PitchAt(raid.player, heightM, M10));
                return (z.hpMax - z.hp, raid.player.stats.headShots);
            }
            var body = Hit(1.2);
            var head = Hit(1.95); // the brute's eyes
            Assert.Greater(body.loss, 0, "the body hit lands");
            Assert.AreEqual(0, body.heads);
            Assert.AreEqual(1, head.heads);
            Assert.AreEqual(body.loss * 1.75, head.loss, 1e-6, "head shots do 1.75 times the damage");

            // helmets: an armoured zombie takes less extra damage from a head shot (the sniper goes through its armour)
            var raid2 = QuietRaid(21u);
            ShootingRange(raid2);
            var armored = Target(raid2, "armored", M10);
            armored.hp = armored.hpMax = 1000; // survives the shot, so the whole damage shows
            Shoot(raid2, PitchAt(raid2.player, 1.95, M10));
            Assert.AreEqual(150 * 1.35, armored.hpMax - armored.hp, 1e-6);
        }

        [Test]
        public void HeadBandsMatchTheModels()
        {
            // the head band of an aimed shot runs from HeadShare x HeightPx up to HeightPx plus the 3 px graze (WeaponSystem.HeadGrazePx)
            const double graze = 3 / Player.PxPerMetre;
            double TopM(string type, string state) => ZombieAI.HeightPx(new Zombie { id = type, type = DataTables.ZOMBIE_TYPES[type], state = state }) / Player.PxPerMetre;

            // the hunched brute and boss carry their heads lower than 1.8 m x 1.25, a sprinting or striking stalker lower still
            Assert.AreEqual(2.05, TopM("brute", "chase"), 1e-9);
            Assert.AreEqual(1.9, TopM("boss", "chase"), 1e-9);
            Assert.AreEqual(1.5, TopM("stalker", "chase"), 1e-9);
            Assert.AreEqual(1.5, TopM("stalker", "attack"), 1e-9);
            Assert.AreEqual(1.71, TopM("stalker", "lurk"), 1e-9);
            Assert.AreEqual(1.8, TopM("walker", "chase"), 1e-9);
            Assert.AreEqual(1.62, TopM("runner", "chase"), 1e-9);
            Assert.AreEqual(2.07, TopM("armored", "idle"), 1e-9);

            // visible head of the 3D model in that state (chin, eyes, top of the skull or helmet, metres; from ZombieLook and
            // the PoseAlive posture: hunch, sprint lean and knee bend)
            var heads = new (string type, string state, double chin, double eyes, double skull)[]
            {
                ("walker", "idle", 1.57, 1.74, 1.87), ("walker", "chase", 1.55, 1.72, 1.85),
                ("runner", "idle", 1.48, 1.62, 1.73), ("runner", "chase", 1.35, 1.48, 1.61),
                ("brute", "idle", 1.64, 1.89, 2.08), ("brute", "chase", 1.60, 1.86, 2.05),
                ("screamer", "idle", 1.56, 1.71, 1.83), ("toxic", "idle", 1.61, 1.79, 1.93), ("armored", "idle", 1.75, 1.95, 2.15),
                ("stalker", "lurk", 1.43, 1.57, 1.68), ("stalker", "chase", 1.22, 1.36, 1.48), ("stalker", "attack", 1.29, 1.43, 1.55),
                ("boss", "idle", 1.55, 1.78, 1.93), ("boss", "chase", 1.50, 1.73, 1.88),
            };
            foreach (var h in heads)
            {
                double top = TopM(h.type, h.state), from = ZombieAI.HeadShare * top, to = top + graze;
                string at = h.type + " (" + h.state + ")";
                Assert.LessOrEqual(from, h.eyes - 0.08, at + ": a shot at the eyes is a head shot");
                Assert.GreaterOrEqual(from, h.chin - 0.15, at + ": the neck and the chest are not the head");
                Assert.GreaterOrEqual(to, h.skull, at + ": the whole skull counts");
                Assert.LessOrEqual(to, h.skull + 0.3, at + ": a shot well over the head does not hit");
            }
        }

        [Test]
        public void AimingFarUpMisses()
        {
            var raid = QuietRaid(21u);
            ShootingRange(raid);
            var z = Target(raid, "brute", M10);
            Shoot(raid, -0.3);
            Assert.AreEqual(z.hpMax, z.hp, "the shot flies over the head");
            Assert.AreEqual(0, raid.player.stats.shotsHit);
        }

        [Test]
        public void ShotgunPelletsFollowTheSameRule()
        {
            var raid = QuietRaid(21u);
            var log = ShootingRange(raid);
            var p = raid.player;
            var z = Target(raid, "brute", 6 * Player.PxPerMetre);
            // every pellet hits the floor 2 m ahead, none reaches the brute 6 m away
            Shoot(raid, PitchAt(p, 0, 2 * Player.PxPerMetre), "shotgun_pump");
            Assert.AreEqual(z.hpMax, z.hp);
            Assert.AreEqual(8, log.effects.Count(e => e.kind == Fx.Impact && e.height < 0.1));
        }

        [Test]
        public void SolidZombiesBlockThePlayer()
        {
            // a zombie that stands still with its back to a wall, the player walks straight into it
            double Gap(bool blocked)
            {
                var raid = QuietRaid(12u);
                var w = raid.world;
                for (int ty = 4; ty < w.h - 4; ty++)
                    for (int tx = 8; tx < w.w - 4; tx++)
                    {
                        if (w.Tile(tx, ty) != T.WALL) continue;
                        bool open = true;
                        for (int dx = 1; dx <= 5 && open; dx++)
                            for (int dy = -1; dy <= 1 && open; dy++)
                                if (!w.IsWalkable(tx - dx, ty + dy) || T.IsDoor(w.Tile(tx - dx, ty + dy))) open = false;
                        if (!open || !T.BlocksMove(w.Tile(tx, ty - 1)) || !T.BlocksMove(w.Tile(tx, ty + 1))) continue;
                        double y = (ty + 0.5) * World.TILE;
                        var z = raid.zombies.Spawn("walker", tx * World.TILE - 13.5, y);
                        z.state = "stunned"; z.stunTimer = 999;
                        var p = raid.player;
                        p.x = z.x - 70; p.y = y; p.angle = 0;
                        p.blockedByZombies = blocked;
                        var input = (ScriptedInput)raid.input;
                        input.move = new Vec2(1, 0);
                        for (int s = 0; s < 120; s++) raid.Update(DT);
                        Assert.AreEqual(tx * World.TILE - 13.5, z.x, 1e-9, "only the player is moved");
                        return M.Dist(p.x, p.y, z.x, z.y) - (p.radius + z.radius);
                    }
                Assert.Inconclusive("no straight wall on this map");
                return 0;
            }
            Assert.Less(Gap(false), -10, "by default the player walks into the zombie");
            Assert.GreaterOrEqual(Gap(true), -0.5, "solid: the player stops at the zombie");
        }
    }
}
