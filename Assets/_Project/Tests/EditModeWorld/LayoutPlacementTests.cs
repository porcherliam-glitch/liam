using System.Collections.Generic;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Derived positions: enemies on the spawner ring and the crystal shards of the rift (same as the Python twin).</summary>
    [TestFixture]
    public sealed class LayoutPlacementTests
    {
        private RegionLayout _layout;

        [OneTimeSetUp]
        public void LoadLayout()
        {
            _layout = LayoutTestFiles.LoadEichental();
        }

        [Test]
        public void SingleEnemyStandsInTheCentre()
        {
            LayoutSpawner spawner = Spawner("spawn.eichental.riss_streuner");

            List<PlacedPoint> points = LayoutPlacement.SpawnerPositions(spawner);

            Assert.That(points.Count, Is.EqualTo(1));
            Assert.That(points[0].X, Is.EqualTo(spawner.Center.X).Within(1e-12));
            Assert.That(points[0].Z, Is.EqualTo(spawner.Center.Z).Within(1e-12));
        }

        [TestCaseSource(typeof(EichentalPreviewReference), nameof(EichentalPreviewReference.SpawnerPositions))]
        public void EnemiesStandLikeInThePreview(string spawnerId, int index, double x, double z, double yaw)
        {
            List<PlacedPoint> points = LayoutPlacement.SpawnerPositions(Spawner(spawnerId));

            Assert.That(points[index].X, Is.EqualTo(x).Within(1e-9));
            Assert.That(points[index].Z, Is.EqualTo(z).Within(1e-9));
            Assert.That(points[index].Yaw, Is.EqualTo(yaw).Within(1e-9));
        }

        [Test]
        public void CrystalsLieInTheCraterLikeInThePreview()
        {
            LayoutRift rift = _layout.Rift;

            List<RiftCrystal> crystals = LayoutPlacement.RiftCrystals(rift);

            Assert.That(crystals.Count, Is.EqualTo(rift.Crystals));
            Assert.That(crystals.Count, Is.EqualTo(EichentalPreviewReference.Crystals.Length));
            for (int i = 0; i < crystals.Count; i++)
            {
                var expected = (object[])EichentalPreviewReference.Crystals[i];
                Assert.That(crystals[i].X, Is.EqualTo((double)expected[0]).Within(1e-9));
                Assert.That(crystals[i].Z, Is.EqualTo((double)expected[1]).Within(1e-9));
                Assert.That(crystals[i].Height, Is.EqualTo((double)expected[2]).Within(1e-9));
                Assert.That(crystals[i].TiltX, Is.EqualTo((double)expected[3]).Within(1e-9));
                Assert.That(crystals[i].TiltZ, Is.EqualTo((double)expected[4]).Within(1e-9));
                Assert.That(crystals[i].Yaw, Is.EqualTo((double)expected[5]).Within(1e-9));
            }

            foreach (RiftCrystal crystal in crystals)
            {
                Assert.That(rift.Center.DistanceTo(new LayoutPoint(crystal.X, crystal.Z)), Is.LessThanOrEqualTo(rift.Radius + 1e-9));
            }
        }

        private LayoutSpawner Spawner(string id)
        {
            foreach (LayoutSpawner spawner in _layout.Spawners)
            {
                if (spawner.Id == id)
                {
                    return spawner;
                }
            }

            Assert.Fail("Spawner missing: " + id);
            return null;
        }
    }
}
