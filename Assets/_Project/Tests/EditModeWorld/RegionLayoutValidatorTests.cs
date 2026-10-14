using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Semantic checks: unique ids, prefixes, bounds, no building in a brook or on another building, references.</summary>
    [TestFixture]
    public sealed class RegionLayoutValidatorTests
    {
        [Test]
        public void BuildingInTheBrookIsAnError()
        {
            string house = TestLayouts.House.Replace("\"position\": [0, 0]", "\"position\": [0, 25]");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]", rivers: "[" + TestLayouts.Brook + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "steht im Bach"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void BuildingBesideTheBrookIsFine()
        {
            TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + "]", rivers: "[" + TestLayouts.Brook + "]"), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void RotatedBuildingCornerInTheBrookIsFound()
        {
            // 8 x 10 m turned by 45 degrees: the corner reaches 6.4 m from the centre; centre 22 m south of the brook axis (z = 30),
            // water edge at 28, needed gap 2 + 1 m.
            string house = TestLayouts.House.Replace("\"position\": [0, 0], \"yaw\": 0", "\"position\": [0, 22], \"yaw\": 45");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]", rivers: "[" + TestLayouts.Brook + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "steht im Bach"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void OverlappingBuildingsAreAnError()
        {
            string second = TestLayouts.House.Replace("obj.test.haus", "obj.test.haus_2").Replace("\"position\": [0, 0]", "\"position\": [5, 3]");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + ", " + second + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "überlappt"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void DuplicateIdIsAnError()
        {
            TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + ", " + TestLayouts.House.Replace("[0, 0]", "[40, 0]") + "]"),
                out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "doppelt"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void BuildingOutsideThePlayableBoundsIsAnError()
        {
            string house = TestLayouts.House.Replace("\"position\": [0, 0]", "\"position\": [98, 0]");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + house + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "begehbaren Bereich"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void WrongPrefixIsAnError()
        {
            string location = TestLayouts.Location.Replace("loc.test.platz", "ort.test.platz");

            TestLayouts.Load(TestLayouts.Build(locations: "[" + location + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "muss mit „loc.“ beginnen"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void UmlautInIdIsAnError()
        {
            string location = TestLayouts.Location.Replace("loc.test.platz", "loc.test.mühle");

            TestLayouts.Load(TestLayouts.Build(locations: "[" + location + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "ID-Format"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void UnknownLocationReferenceIsAnError()
        {
            const string chest = "\"chests\": [{ \"id\": \"obj.test.truhe\", \"tier\": \"wooden\", \"position\": [10, 10], \"locationId\": \"loc.test.fehlt\" }]";

            TestLayouts.Load(TestLayouts.Build(extra: chest), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "loc.test.fehlt"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void ChestInTheBrookIsAnError()
        {
            const string chest = "\"chests\": [{ \"id\": \"obj.test.truhe\", \"tier\": \"iron\", \"position\": [10, 30], \"locationId\": \"loc.test.platz\" }]";

            TestLayouts.Load(TestLayouts.Build(rivers: "[" + TestLayouts.Brook + "]", extra: chest), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Truhe steht im Bach"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void PlayerStartInABuildingIsAnError()
        {
            TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + "]", playerStart: "[1, 1]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Spieler-Start liegt in einem Gebäude"), Is.True,
                LayoutTestFiles.Describe(report));
        }

        [Test]
        public void QuestSpawnerNeedsAQuest()
        {
            const string spawner = "\"spawners\": [{ \"id\": \"spawn.test.woelfe\", \"enemyTypeId\": \"enemy.wolf.grauwolf\", \"count\": 2, " +
                                   "\"center\": [20, -20], \"radius\": 5, \"activation\": \"quest\", \"locationId\": \"loc.test.platz\" }]";

            TestLayouts.Load(TestLayouts.Build(extra: spawner), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "spawn.test.woelfe.quest"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void TerrainHigherThanTheVolumeIsAnError()
        {
            const string features = "[{ \"id\": \"gelaende.berg\", \"kind\": \"hill\", \"center\": [0, 0], \"radius\": 50, \"height\": 60 }]";

            TestLayouts.Load(TestLayouts.Build(features: features), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "maxHeight erhöhen"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void BridgeWithoutBrookIsAWarning()
        {
            const string bridge = "\"bridges\": [{ \"id\": \"obj.test.bruecke\", \"kind\": \"wood\", \"position\": [50, -50], \"yaw\": 0, \"length\": 8, \"width\": 3 }]";

            TestLayouts.Load(TestLayouts.Build(rivers: "[" + TestLayouts.Brook + "]", extra: bridge), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Warning, "über keinem Bach"), Is.True, LayoutTestFiles.Describe(report));
            Assert.That(report.HasErrors, Is.False, LayoutTestFiles.Describe(report));
        }
    }
}
