using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using NUnit.Framework;

namespace DeadZone.Tests
{
    public class WorldTests
    {
        [Test]
        public void RngMatchesHtmlVersion()
        {
            // Reference values from the HTML version: new RNG(12345).next() x3 and hashString('city:1').
            var r = new Rng(12345);
            Assert.AreEqual(0.36338094831444323, r.Next(), 1e-15);
            Assert.AreEqual(0.05711905122734606, r.Next(), 1e-15);
            Assert.AreEqual(0.8184052056167275, r.Next(), 1e-15);
        }

        [Test]
        public void AllMapsGenerateValidWorlds()
        {
            foreach (var mapId in DataTables.MAP_ORDER)
            {
                var missions = DataTables.MISSIONS.Where(m => m.mapId == mapId).ToList();
                for (uint seed = 1; seed <= 8; seed++)
                {
                    var w = WorldGenerator.Generate(mapId, seed, missions);
                    var v = WorldGenerator.Validate(w, missions);
                    Assert.IsTrue(v.ok, mapId + " seed " + seed + ": " + v.unreachable.Count + " unreachable, missing " + string.Join(",", v.missingObjectives));
                    Assert.Greater(w.buildings.Count, 5, mapId);
                    Assert.Greater(w.containers.Count, 20, mapId);
                    Assert.Greater(w.extractions.Count, 1, mapId);
                    Assert.Greater(w.zombieSpawns.Count, 5, mapId);
                }
            }
        }

        // Tile hash, building/container/prop/light/spawn counts and spawn point of the HTML version for seed 3 (no missions).
        [TestCase("city", 229924289u, 38, 133, 282, 146, 16, 176, 2544)]
        [TestCase("industrial", 3744274588u, 24, 118, 239, 101, 18, 1712, 4304)]
        [TestCase("military", 1686590137u, 18, 89, 247, 90, 14, 3984, 1488)]
        [TestCase("research", 1151294098u, 20, 84, 180, 72, 18, 2256, 176)]
        public void GeneratorMatchesHtmlVersion(string mapId, uint tileHash, int buildings, int containers, int props, int lights, int spawns, int sx, int sy)
        {
            var w = WorldGenerator.Generate(mapId, 3u);
            uint h = 0x811c9dc5u;
            unchecked { foreach (byte t in w.tiles) { h ^= t; h *= 0x01000193u; } }
            Assert.AreEqual(tileHash, h, "tiles");
            Assert.AreEqual(buildings, w.buildings.Count, "buildings");
            Assert.AreEqual(containers, w.containers.Count, "containers");
            Assert.AreEqual(props, w.props.Count, "props");
            Assert.AreEqual(lights, w.lights.Count, "lights");
            Assert.AreEqual(spawns, w.zombieSpawns.Count, "spawns");
            Assert.AreEqual(sx, M.Round(w.spawnX), "spawn x");
            Assert.AreEqual(sy, M.Round(w.spawnY), "spawn y");
        }

        [Test]
        public void GenerationIsDeterministic()
        {
            var a = WorldGenerator.Generate("industrial", 77u);
            var b = WorldGenerator.Generate("industrial", 77u);
            CollectionAssert.AreEqual(a.tiles, b.tiles);
            Assert.AreEqual(a.containers.Count, b.containers.Count);
        }
    }
}

namespace DeadZone.Tests
{
    public class AudioTests
    {
        [Test]
        public void AllSoundsAreFiniteAndNormalized()
        {
            foreach (var name in SoundBank.Names)
            {
                var s = SoundBank.Make(name);
                Assert.Greater(s.Length, 100, name);
                float max = 0;
                foreach (var v in s) { Assert.IsFalse(float.IsNaN(v) || float.IsInfinity(v), name); max = System.Math.Max(max, System.Math.Abs(v)); }
                Assert.LessOrEqual(max, 1.0f, name);
                Assert.Greater(max, 0.1f, name);
            }
            foreach (var map in DataTables.MAP_ORDER)
            {
                var a = SoundBank.Ambient(map);
                Assert.Greater(a.Length, SoundBank.Rate * 5, map);
            }
        }

        [Test]
        public void EverySoundHasItsOwnSynthesis()
        {
            // 45 original sounds and 12 surface footsteps (6 surfaces, walking and running)
            Assert.AreEqual(57, SoundBank.Names.Length);
            Assert.AreEqual(SoundBank.Names.Length, SoundBank.Names.Distinct().Count(), "duplicate names");
            var fallback = SoundBank.Make("__no_such_sound__");
            foreach (var name in SoundBank.Names) CollectionAssert.AreNotEqual(fallback, SoundBank.Make(name), name + " falls back to the beep");
        }

        [Test]
        public void FootstepsExistForEverySurfaceAndSoundDifferent()
        {
            Assert.AreEqual("footstep", SoundBank.Footstep(StepSurface.Concrete, false));
            Assert.AreEqual("footstep_run", SoundBank.Footstep(StepSurface.Concrete, true));
            var names = new System.Collections.Generic.List<string>();
            foreach (StepSurface s in System.Enum.GetValues(typeof(StepSurface)))
                foreach (bool run in new[] { false, true })
                {
                    string n = SoundBank.Footstep(s, run);
                    CollectionAssert.Contains(SoundBank.Names, n, s + (run ? " run" : " walk"));
                    names.Add(n);
                }
            Assert.AreEqual(names.Count, names.Distinct().Count(), "every surface needs its own clips");
            var concrete = SoundBank.Make("footstep");
            foreach (StepSurface s in System.Enum.GetValues(typeof(StepSurface)))
                if (s != StepSurface.Concrete) CollectionAssert.AreNotEqual(concrete, SoundBank.Make(SoundBank.Footstep(s, false)), s.ToString());
        }

        // ------------------------------------------------------------------ acoustics on a hand-built world
        private static double C(double t) => (t + 0.5) * World.TILE;

        private static World Flat(int w = 48, int h = 32)
        {
            var world = new World("city", 1u, w, h);
            for (int ty = 0; ty < h; ty++)
                for (int tx = 0; tx < w; tx++) world.Put(tx, ty, T.GROUND);
            return world;
        }

        /// <summary>A walled building with one room inside.</summary>
        private static Building AddBuilding(World world, string type, int tx, int ty, int w, int h, bool hall = false)
        {
            var b = new Building { id = "b" + world.buildings.Count, type = type, tx = tx, ty = ty, w = w, h = h, hall = hall };
            for (int y = ty; y < ty + h; y++)
                for (int x = tx; x < tx + w; x++)
                    world.Put(x, y, x == tx || y == ty || x == tx + w - 1 || y == ty + h - 1 ? T.WALL : T.FLOOR);
            b.rooms.Add(new RectI(tx + 1, ty + 1, w - 2, h - 2));
            world.buildings.Add(b);
            world.IndexBuilding(b, world.buildings.Count - 1);
            return b;
        }

        [Test]
        public void FootstepSurfaceMatchesTheFloorTheViewShows()
        {
            var w = Flat();
            Assert.AreEqual(StepSurface.Dirt, Acoustics.SurfaceAt(w, C(40), C(28)));
            var outdoor = new (byte tile, StepSurface surface)[]
            {
                (T.ROAD, StepSurface.Concrete), (T.ROAD_LINE, StepSurface.Concrete), (T.SIDEWALK, StepSurface.Concrete), (T.GRASS, StepSurface.Dirt),
                (T.GRAVEL, StepSurface.Gravel), (T.RUBBLE, StepSurface.Gravel), (T.TOXIC, StepSurface.Water),
            };
            for (int i = 0; i < outdoor.Length; i++)
            {
                w.Put(40 + i, 24, outdoor[i].tile);
                Assert.AreEqual(outdoor[i].surface, Acoustics.SurfaceAt(w, C(40 + i), C(24)), "tile " + outdoor[i].tile);
            }
            // homes have boards, every third one (by position, like WorldView) tiles
            AddBuilding(w, "house", 2, 2, 6, 6);
            AddBuilding(w, "house", 12, 3, 6, 6);
            AddBuilding(w, "office", 2, 12, 6, 6);
            AddBuilding(w, "shop", 12, 12, 6, 6);
            AddBuilding(w, "warehouse", 22, 2, 12, 12);
            Assert.AreEqual(StepSurface.Wood, Acoustics.SurfaceAt(w, C(4), C(4)), "house");
            Assert.AreEqual(StepSurface.Tile, Acoustics.SurfaceAt(w, C(14), C(5)), "tiled house");
            Assert.AreEqual(StepSurface.Wood, Acoustics.SurfaceAt(w, C(4), C(14)), "office");
            Assert.AreEqual(StepSurface.Tile, Acoustics.SurfaceAt(w, C(14), C(14)), "shop");
            Assert.AreEqual(StepSurface.Concrete, Acoustics.SurfaceAt(w, C(27), C(7)), "warehouse");
            // doorways: a steel threshold in concrete halls, the floor of the room elsewhere
            w.Put(27, 2, T.DOOR_OPEN);
            w.Put(4, 2, T.DOOR_OPEN);
            Assert.AreEqual(StepSurface.Metal, Acoustics.SurfaceAt(w, C(27), C(2)), "warehouse door");
            Assert.AreEqual(StepSurface.Wood, Acoustics.SurfaceAt(w, C(4), C(2)), "house door");
            // a free-standing gate in a road sounds like the road (the ground beside it, as WorldView draws it)
            w.Put(40, 30, T.ROAD); w.Put(41, 30, T.DOOR_OPEN); w.Put(42, 30, T.ROAD);
            Assert.AreEqual(StepSurface.Concrete, Acoustics.SurfaceAt(w, C(41), C(30)), "gate");
            Assert.AreEqual(StepSurface.Concrete, Acoustics.SurfaceAt(null, 0, 0));
        }

        [Test]
        public void RoomReverbGrowsWithTheRoomAndHallsRingLongest()
        {
            var w = Flat(80, 40);
            AddBuilding(w, "house", 2, 2, 6, 6);
            AddBuilding(w, "warehouse", 12, 2, 16, 16);
            AddBuilding(w, "bunker", 32, 2, 26, 20, true);
            var outside = Acoustics.RoomAt(w, C(70), C(35));
            var house = Acoustics.RoomAt(w, C(4), C(4));
            var hall = Acoustics.RoomAt(w, C(20), C(10));
            var boss = Acoustics.RoomAt(w, C(45), C(12));
            Assert.AreEqual(0, outside.wet);
            Assert.AreEqual(1, house.wet);
            Assert.Less(house.decay, hall.decay);
            Assert.Less(hall.decay, boss.decay);
            Assert.GreaterOrEqual(boss.decay, 4.0);
            Assert.Less(house.hardness, hall.hardness, "furnished wooden rooms damp the highs");
            Assert.Less(house.size, hall.size);
            Assert.AreEqual(0, Acoustics.RoomAt(null, 0, 0).wet);
            Acoustics.Echo("city", out double cityDelay, out double cityGain);
            Acoustics.Echo("military", out double openDelay, out double openGain);
            Assert.Less(cityDelay, openDelay, "open fields answer later than dense streets");
            Assert.That(cityGain, Is.InRange(0.05, 0.4));
            Assert.That(openGain, Is.InRange(0.05, 0.4));
        }

        [Test]
        public void WallsMuffleSoundsAndDoorFramesLetSomeThrough()
        {
            var w = Flat();
            Assert.AreEqual(0, Acoustics.Occlusion(w, C(5), C(15), C(15), C(15)), "open ground");
            for (int ty = 0; ty < w.h; ty++) w.Put(20, ty, T.WALL);
            Assert.AreEqual(1, Acoustics.Occlusion(w, C(15), C(15), C(26), C(15)), "solid wall");
            // an opening in the wall: straight through it is free, just beside it the sound comes partly around the frame
            w.Put(20, 15, T.DOOR_OPEN);
            Assert.AreEqual(0, Acoustics.Occlusion(w, C(15), C(15), C(26), C(15)), "through the doorway");
            double side = Acoustics.Occlusion(w, 600, 470, C(26), C(15));
            Assert.That(side, Is.GreaterThan(0).And.LessThan(1), "beside the doorway");
            w.Put(20, 15, T.DOOR_CLOSED);
            Assert.AreEqual(1, Acoustics.Occlusion(w, 600, 470, C(26), C(15)), "closed door");
            Assert.AreEqual(0, Acoustics.Occlusion(w, C(15), C(15), C(15) + 4, C(15)), "right next to the listener");
            Assert.AreEqual(0, Acoustics.Occlusion(null, 0, 0, 100, 100));
        }
    }
}
