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
    }
}
