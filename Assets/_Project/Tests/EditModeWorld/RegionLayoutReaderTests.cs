using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Reading layouts: a valid frame has no findings; structural mistakes are named with their JSON path.</summary>
    [TestFixture]
    public sealed class RegionLayoutReaderTests
    {
        [Test]
        public void ValidFrameHasNoFindings()
        {
            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + "]"), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFiles.Describe(report));
            Assert.That(layout.Buildings.Count, Is.EqualTo(1));
            Assert.That(layout.Buildings[0].Kind, Is.EqualTo(BuildingKind.House));
            Assert.That(layout.Buildings[0].Width, Is.EqualTo(8.0));
            Assert.That(layout.Buildings[0].WallHeight, Is.EqualTo(4.0));
            Assert.That(layout.Buildings[0].Depth, Is.EqualTo(10.0));
            Assert.That(layout.Terrain.PlayableBounds.Width, Is.EqualTo(200.0));
            Assert.That(layout.Palette.TryGet("ember", out LayoutColor ember), Is.True);
            Assert.That(ember.ToHex(), Is.EqualTo("#808080"));
        }

        [Test]
        public void UnknownSchemaVersionStopsReading()
        {
            var report = new LayoutReport();

            RegionLayout layout = RegionLayoutReader.Read(TestLayouts.Build(schemaVersion: 2), report);

            Assert.That(layout, Is.Null);
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "schemaVersion"), Is.True);
        }

        [Test]
        public void InvalidJsonBecomesAnError()
        {
            var report = new LayoutReport();

            Assert.That(RegionLayoutReader.Read("{ \"schemaVersion\": 1, ", report), Is.Null);
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Kein gültiges JSON"), Is.True);
        }

        [Test]
        public void MissingRequiredFieldNamesThePath()
        {
            string house = TestLayouts.House.Replace("\"size\": [8, 4, 10], ", string.Empty);

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "buildings[0].size"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void UnknownTokenListsTheAllowedValues()
        {
            string house = TestLayouts.House.Replace("\"house\"", "\"castle\"");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Erlaubt: house, smithy"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void UnknownKeyIsAWarning()
        {
            string house = TestLayouts.House.Replace("\"roof\"", "\"raduis\": 3, \"roof\"");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Warning, "raduis"), Is.True, LayoutTestFiles.Describe(report));
            Assert.That(report.HasErrors, Is.False);
        }

        [Test]
        public void PointNeedsTwoNumbers()
        {
            string house = TestLayouts.House.Replace("\"position\": [0, 0]", "\"position\": [0, 0, 0]");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "buildings[0].position"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void FlattenWithoutHeightUsesTheCentre()
        {
            const string features = "[{ \"id\": \"gelaende.platz\", \"kind\": \"flatten\", \"center\": [0, 0], \"innerRadius\": 5, \"outerRadius\": 10 }]";

            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(features: features), out LayoutReport report);

            Assert.That(report.HasErrors, Is.False, LayoutTestFiles.Describe(report));
            Assert.That(layout.Terrain.Features[0].Kind, Is.EqualTo(TerrainFeatureKind.Flatten));
            Assert.That(layout.Terrain.Features[0].HasHeight, Is.False);
        }

        [Test]
        public void ColourParsesHex()
        {
            Assert.That(LayoutColor.TryParse("#D9481E", out LayoutColor ember), Is.True);
            Assert.That(ember.R, Is.EqualTo(0xD9 / 255.0).Within(1e-12));
            Assert.That(ember.G, Is.EqualTo(0x48 / 255.0).Within(1e-12));
            Assert.That(ember.B, Is.EqualTo(0x1E / 255.0).Within(1e-12));
            Assert.That(LayoutColor.TryParse("#12345", out _), Is.False);
            Assert.That(LayoutColor.TryParse("türkis", out _), Is.False);
        }
    }
}
