using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Trails ("Folge der Spur", JSON <c>trails</c>) and NPC markers with quest stages: reading, at least two nodes, nodes not in a
    /// brook or building, several markers of one NPC per phase only with different stages, markers not hidden in walls unless
    /// <c>insideBuilding</c> says so.
    /// </summary>
    [TestFixture]
    public sealed class TrailAndNpcMarkerValidationTests
    {
        private const string Trail = "{ \"id\": \"spur.test.spur\", \"name\": \"Spur\", \"quest\": \"quest.test.suche\", \"radius\": 3, " +
                                     "\"nodes\": [[0, -40], [20, -40], [40, -40]] }";

        private static string Marker(string stage, string position = "[10, -40]", string extra = "")
        {
            return "{ \"npcId\": \"npc.test.hedda\", \"name\": \"Hedda\", \"phase\": \"prolog\"" + (stage != null ? ", \"stage\": \"" + stage + "\"" : string.Empty) +
                   extra + ", \"locationId\": \"loc.test.platz\", \"position\": " + position + ", \"yaw\": 0 }";
        }

        [Test]
        public void TrailIsRead()
        {
            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(extra: "\"trails\": [" + Trail + "]"), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFiles.Describe(report));
            Assert.That(layout.Trails.Count, Is.EqualTo(1));
            LayoutTrail trail = layout.Trails[0];
            Assert.That(trail.Id, Is.EqualTo("spur.test.spur"));
            Assert.That(trail.QuestId, Is.EqualTo("quest.test.suche"));
            Assert.That(trail.Radius, Is.EqualTo(3.0));
            Assert.That(trail.Nodes.Count, Is.EqualTo(3));
            Assert.That(trail.Nodes[2].X, Is.EqualTo(40.0));
        }

        [Test]
        public void TrailNeedsTwoNodes()
        {
            string trail = Trail.Replace("[[0, -40], [20, -40], [40, -40]]", "[[0, -40]]");

            TestLayouts.Load(TestLayouts.Build(extra: "\"trails\": [" + trail + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "mindestens 2 Knoten"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void TrailNeedsTheSpurPrefixAndAQuest()
        {
            string trail = Trail.Replace("spur.test.spur", "weg.test.spur").Replace("\"quest\": \"quest.test.suche\", ", string.Empty);

            TestLayouts.Load(TestLayouts.Build(extra: "\"trails\": [" + trail + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "muss mit „spur.“ beginnen"), Is.True, LayoutTestFiles.Describe(report));
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "weg.test.spur.quest"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void TrailNodeInTheBrookIsAnError()
        {
            string trail = Trail.Replace("[40, -40]", "[40, 30]");

            TestLayouts.Load(TestLayouts.Build(rivers: "[" + TestLayouts.Brook + "]", extra: "\"trails\": [" + trail + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Spur-Knoten liegt im Bach"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void TrailNodeInABuildingIsAnError()
        {
            string trail = Trail.Replace("[20, -40]", "[1, 1]");

            TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + "]", extra: "\"trails\": [" + trail + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Spur-Knoten liegt in einem Gebäude"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void TrailRadiusMustBeSensible()
        {
            string trail = Trail.Replace("\"radius\": 3", "\"radius\": 40");

            TestLayouts.Load(TestLayouts.Build(extra: "\"trails\": [" + trail + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Radius der Knoten"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void TwoMarkersOfOneNpcInOnePhaseNeedDifferentStages()
        {
            TestLayouts.Load(TestLayouts.Build(extra: "\"npcMarkers\": [" + Marker(null) + ", " + Marker(null, "[20, -40]") + "]"), out LayoutReport same);
            Assert.That(TestLayouts.Has(same, LayoutIssueSeverity.Error, "doppelt für dieselbe Phase"), Is.True, LayoutTestFiles.Describe(same));

            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(extra: "\"npcMarkers\": [" + Marker("s20") + ", " + Marker("s25", "[20, -40]") + "]"),
                out LayoutReport staged);
            Assert.That(staged.Issues, Is.Empty, LayoutTestFiles.Describe(staged));
            Assert.That(layout.NpcMarkers[1].Stage, Is.EqualTo("s25"));
        }

        [Test]
        public void StageMustLookLikeAStageId()
        {
            TestLayouts.Load(TestLayouts.Build(extra: "\"npcMarkers\": [" + Marker("Stufe 2") + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Stufen-ID"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void MarkerInsideABuildingIsAnErrorUnlessIntended()
        {
            string inside = Marker("s25", "[1, 1]");
            TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + "]", extra: "\"npcMarkers\": [" + inside + "]"), out LayoutReport hidden);
            Assert.That(TestLayouts.Has(hidden, LayoutIssueSeverity.Error, "steht in einem Gebäude"), Is.True, LayoutTestFiles.Describe(hidden));

            string intended = Marker("s25", "[1, 1]", ", \"insideBuilding\": true");
            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(buildings: "[" + TestLayouts.House + "]", extra: "\"npcMarkers\": [" + intended + "]"),
                out LayoutReport ok);
            Assert.That(ok.Issues, Is.Empty, LayoutTestFiles.Describe(ok));
            Assert.That(layout.NpcMarkers[0].InsideBuilding, Is.True);
        }

        [Test]
        public void InsideBuildingFlagWithoutBuildingIsAWarning()
        {
            TestLayouts.Load(TestLayouts.Build(extra: "\"npcMarkers\": [" + Marker("s25", "[10, -40]", ", \"insideBuilding\": true") + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Warning, "in keinem Gebäude"), Is.True, LayoutTestFiles.Describe(report));
        }
    }
}
