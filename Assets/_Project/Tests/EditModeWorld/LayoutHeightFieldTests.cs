using System;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Terrain heights: the single features on a synthetic frame, river levels that only fall, and the real Eichental layout
    /// compared with the Python twin (Tools/Preview/eichental_layout.py), so the Blender preview shows the same terrain.
    /// </summary>
    [TestFixture]
    public sealed class LayoutHeightFieldTests
    {
        private const double PythonTolerance = 1e-6;

        [Test]
        public void FlatFrameHasTheBaseHeight()
        {
            var field = new LayoutHeightField(TestLayouts.Load(TestLayouts.Build(), out _));

            Assert.That(field.Height(0.0, 0.0), Is.EqualTo(5.0).Within(1e-12));
            Assert.That(field.Height(-70.0, 33.0), Is.EqualTo(5.0).Within(1e-12));
        }

        [Test]
        public void HillPeaksInTheCentreAndEndsAtItsRadius()
        {
            const string features = "[{ \"id\": \"gelaende.h\", \"kind\": \"hill\", \"center\": [10, 0], \"radius\": 20, \"height\": 6 }]";
            var field = new LayoutHeightField(TestLayouts.Load(TestLayouts.Build(features: features), out _));

            Assert.That(field.Height(10.0, 0.0), Is.EqualTo(11.0).Within(1e-12));
            Assert.That(field.Height(20.0, 0.0), Is.EqualTo(5.0 + 6.0 * (1.0 - 0.5)).Within(1e-12)); // smoothstep(0.5) = 0.5
            Assert.That(field.Height(30.0, 0.0), Is.EqualTo(5.0).Within(1e-12));
        }

        [Test]
        public void SlopeRisesAlongItsDirection()
        {
            const string features = "[{ \"id\": \"gelaende.s\", \"kind\": \"slope\", \"origin\": [0, 0], \"direction\": [0, 1], \"start\": 0, \"end\": 40, \"height\": 8 }]";
            var field = new LayoutHeightField(TestLayouts.Load(TestLayouts.Build(features: features), out _));

            Assert.That(field.Height(0.0, -10.0), Is.EqualTo(5.0).Within(1e-12));
            Assert.That(field.Height(0.0, 20.0), Is.EqualTo(9.0).Within(1e-12));
            Assert.That(field.Height(50.0, 60.0), Is.EqualTo(13.0).Within(1e-12));
        }

        [Test]
        public void FlattenBlendsToTheCentreHeight()
        {
            const string features = "[{ \"id\": \"gelaende.s\", \"kind\": \"slope\", \"origin\": [0, 0], \"direction\": [1, 0], \"start\": -50, \"end\": 50, \"height\": 10 }," +
                                    " { \"id\": \"gelaende.f\", \"kind\": \"flatten\", \"center\": [0, 0], \"innerRadius\": 10, \"outerRadius\": 20 }]";
            var field = new LayoutHeightField(TestLayouts.Load(TestLayouts.Build(features: features), out _));
            double centre = field.Raw(0.0, 0.0);

            Assert.That(field.Height(8.0, 0.0), Is.EqualTo(centre).Within(1e-12));
            Assert.That(field.Height(-8.0, 3.0), Is.EqualTo(centre).Within(1e-12));
            Assert.That(field.Height(30.0, 0.0), Is.EqualTo(field.Raw(30.0, 0.0)).Within(1e-12));
        }

        [Test]
        public void RiverBedLiesBelowTheWaterAndTheBanks()
        {
            var field = new LayoutHeightField(TestLayouts.Load(TestLayouts.Build(rivers: "[" + TestLayouts.Brook + "]"), out _));

            double bed = field.Height(0.0, 30.0);
            double water = field.WaterLevel(0, 0, 0.5);
            Assert.That(water, Is.EqualTo(5.0 - 1.2 + 0.5).Within(1e-12));
            Assert.That(bed, Is.EqualTo(water - 0.5).Within(1e-12));
            Assert.That(field.Height(0.0, 30.0 + 2.0 + 2.0 + 0.01), Is.EqualTo(5.0).Within(1e-12));
            Assert.That(field.Height(0.0, 33.0), Is.GreaterThan(bed).And.LessThan(5.0));
        }

        [TestCaseSource(typeof(EichentalPreviewReference), nameof(EichentalPreviewReference.RiverLevels))]
        public void RiverLevelsMatchThePythonPreview(int river, int vertex, double expected)
        {
            var field = new LayoutHeightField(LayoutTestFiles.LoadEichental());

            Assert.That(field.WaterLevelAtVertex(river, vertex), Is.EqualTo(expected).Within(PythonTolerance));
        }

        [Test]
        public void RiverLevelsNeverRiseDownstream()
        {
            RegionLayout layout = LayoutTestFiles.LoadEichental();
            var field = new LayoutHeightField(layout);

            for (int r = 0; r < layout.Rivers.Count; r++)
            {
                for (int i = 1; i < layout.Rivers[r].Points.Count; i++)
                {
                    Assert.That(field.WaterLevelAtVertex(r, i), Is.LessThanOrEqualTo(field.WaterLevelAtVertex(r, i - 1)), layout.Rivers[r].Id + " " + i);
                }
            }
        }

        [TestCaseSource(typeof(EichentalPreviewReference), nameof(EichentalPreviewReference.Heights))]
        public void EichentalMatchesThePythonPreview(double x, double z, double expected)
        {
            var field = new LayoutHeightField(LayoutTestFiles.LoadEichental());

            Assert.That(field.Height(x, z), Is.EqualTo(expected).Within(PythonTolerance));
        }

        [Test]
        public void EichentalHeightmapFitsTheTerrainVolume()
        {
            RegionLayout layout = LayoutTestFiles.LoadEichental();
            float[,] heights = new LayoutHeightField(layout).SampleNormalizedHeights();

            Assert.That(heights.GetLength(0), Is.EqualTo(513));
            Assert.That(heights.GetLength(1), Is.EqualTo(513));
            float min = float.MaxValue;
            float max = float.MinValue;
            foreach (float h in heights)
            {
                min = Math.Min(min, h);
                max = Math.Max(max, h);
            }

            Assert.That(min, Is.GreaterThan(0f));
            Assert.That(max, Is.LessThan(1f));
            // Row = z, column = x: the north-east corner lies in the border hills, the village in the middle is low.
            Assert.That(heights[512, 512], Is.GreaterThan(heights[256 - 30, 256 + 40]));
        }
    }
}
