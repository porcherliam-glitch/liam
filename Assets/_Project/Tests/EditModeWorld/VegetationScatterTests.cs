using System.Collections.Generic;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Vegetation scatter: deterministic, same result as the Python twin (counts per group and the first plants), and nothing
    /// grows on paths, in brooks, in buildings or in clearings.
    /// </summary>
    [TestFixture]
    public sealed class VegetationScatterTests
    {
        private RegionLayout _layout;
        private List<VegetationInstance> _plants;

        [OneTimeSetUp]
        public void Scatter()
        {
            _layout = LayoutTestFiles.LoadEichental();
            _plants = VegetationScatter.Scatter(_layout);
        }

        [Test]
        public void IsDeterministic()
        {
            List<VegetationInstance> again = VegetationScatter.Scatter(_layout);

            Assert.That(again.Count, Is.EqualTo(_plants.Count));
            for (int i = 0; i < again.Count; i++)
            {
                Assert.That(again[i].X, Is.EqualTo(_plants[i].X));
                Assert.That(again[i].Z, Is.EqualTo(_plants[i].Z));
            }
        }

        [TestCaseSource(typeof(EichentalPreviewReference), nameof(EichentalPreviewReference.GroupCounts))]
        public void CountsMatchThePythonPreview(string group, int expected)
        {
            int count = 0;
            for (int i = 0; i < _plants.Count; i++)
            {
                if (_plants[i].GroupId == group)
                {
                    count++;
                }
            }

            Assert.That(count, Is.EqualTo(expected));
        }

        [Test]
        public void TotalMatchesThePythonPreview()
        {
            Assert.That(_plants.Count, Is.EqualTo(EichentalPreviewReference.PlantCount));
        }

        [TestCaseSource(typeof(EichentalPreviewReference), nameof(EichentalPreviewReference.FirstPlants))]
        public void FirstPlantMatchesThePythonPreview(string group, string kind, double x, double z, double scale, double yaw)
        {
            VegetationInstance plant = First(group);

            Assert.That(plant.Kind.ToString().ToLowerInvariant(), Is.EqualTo(kind));
            Assert.That(plant.X, Is.EqualTo(x).Within(1e-9));
            Assert.That(plant.Z, Is.EqualTo(z).Within(1e-9));
            Assert.That(plant.Scale, Is.EqualTo(scale).Within(1e-9));
            Assert.That(plant.Yaw, Is.EqualTo(yaw).Within(1e-9));
        }

        [Test]
        public void LandmarkTreesComeLast()
        {
            int trees = _layout.Vegetation.Trees.Count;
            Assert.That(_plants[_plants.Count - trees].GroupId, Is.EqualTo(_layout.Vegetation.Trees[0].Id));
            Assert.That(_plants[_plants.Count - 1].GroupId, Is.EqualTo(_layout.Vegetation.Trees[trees - 1].Id));
        }

        [Test]
        public void NothingGrowsInBuildingsBrooksPathsOrClearings()
        {
            int scattered = _plants.Count - _layout.Vegetation.Trees.Count;
            for (int i = 0; i < scattered; i++)
            {
                VegetationInstance p = _plants[i];
                Assert.That(VegetationScatter.IsExcluded(_layout, p.X, p.Z), Is.False, p.GroupId + " at " + p.X + " / " + p.Z);
                foreach (LayoutBuilding b in _layout.Buildings)
                {
                    Assert.That(LayoutGeometry.RectExcess(p.X, p.Z, b.Position, b.Width, b.Depth, b.Yaw), Is.GreaterThan(0.0), b.Id);
                }

                foreach (LayoutRiver r in _layout.Rivers)
                {
                    Assert.That(LayoutGeometry.Nearest(p.X, p.Z, r.Points).Distance, Is.GreaterThan(r.Width * 0.5), r.Id);
                }
            }
        }

        private VegetationInstance First(string group)
        {
            foreach (VegetationInstance plant in _plants)
            {
                if (plant.GroupId == group)
                {
                    return plant;
                }
            }

            Assert.Fail("No plant in " + group);
            return default;
        }
    }
}
