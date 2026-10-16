using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Reading and checking the layout list <c>harvestNodes</c> (S30).</summary>
    [TestFixture]
    public sealed class HarvestNodeLayoutTests
    {
        private const string Rift = "\"rift\": { \"id\": \"obj.test.riss\", \"center\": [50, 50], \"radius\": 10, \"depth\": 3, \"rimWidth\": 5, " +
                                    "\"tearHeight\": 8, \"tearWidth\": 2, \"crystalSeed\": 1 }";

        [Test]
        public void ReadsANode_WithDefaultYield_AndAlwaysActive()
        {
            RegionLayout layout = Load(Nodes(Node("obj.test.kraut_1", "bloodroot", "item.herb.blutwurz", "[-30, -20]")), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFilesDescribe(report));
            Assert.That(layout.HarvestNodes, Has.Count.EqualTo(1));
            LayoutHarvestNode node = layout.HarvestNodes[0];
            Assert.That(node.Kind, Is.EqualTo(HarvestNodeKind.Bloodroot));
            Assert.That(node.ItemId, Is.EqualTo("item.herb.blutwurz"));
            Assert.That(node.RespawnDays, Is.EqualTo(1d));
            Assert.That(node.MinYield, Is.EqualTo(1));
            Assert.That(node.MaxYield, Is.EqualTo(3));
            Assert.That(node.ActiveFrom, Is.EqualTo(node.ActiveTo), "equal hours: always");
        }

        [Test]
        public void ReadsActiveHoursAndYield()
        {
            string node = Node("obj.test.nacht_1", "nightshade", "item.herb.nachtschattenbluete", "[-30, -20]", ", \"respawnDays\": 3, \"yield\": [2, 4], \"activeHours\": [22, 4]");

            RegionLayout layout = Load(Nodes(node), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFilesDescribe(report));
            LayoutHarvestNode h = layout.HarvestNodes[0];
            Assert.That(h.Kind, Is.EqualTo(HarvestNodeKind.Nightshade));
            Assert.That(h.RespawnDays, Is.EqualTo(3d));
            Assert.That(h.MinYield, Is.EqualTo(2));
            Assert.That(h.MaxYield, Is.EqualTo(4));
            Assert.That(h.ActiveFrom, Is.EqualTo(22d));
            Assert.That(h.ActiveTo, Is.EqualTo(4d));
        }

        [Test]
        public void UnknownKind_IsAnError()
        {
            Load(Nodes(Node("obj.test.kraut_1", "mushroom", "item.herb.pilz", "[-30, -20]")), out LayoutReport report);

            Assert.That(report.HasErrors, Is.True);
        }

        [Test]
        public void BadId_BadItem_AndUnknownLocation_AreErrors()
        {
            string node = "{ \"id\": \"kraut_1\", \"name\": \"Kraut\", \"kind\": \"bloodroot\", \"itemId\": \"herb.blutwurz\", \"position\": [-30, -20], " +
                          "\"locationId\": \"loc.test.fehlt\" }";

            Load(Nodes(node), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "muss mit „obj.“ beginnen"), Is.True, LayoutTestFilesDescribe(report));
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "itemId"), Is.True);
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "loc.test.fehlt"), Is.True);
        }

        [Test]
        public void NodeInABrook_OrOutsideTheBounds_IsAnError()
        {
            string brook = Node("obj.test.kraut_bach", "bloodroot", "item.herb.blutwurz", "[10, 30]");
            string outside = Node("obj.test.kraut_aussen", "bloodroot", "item.herb.blutwurz", "[150, 0]");

            Load(TestLayouts.Build(rivers: "[" + TestLayouts.Brook + "]", extra: "\"harvestNodes\": [" + brook + ", " + outside + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Bach"), Is.True);
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "obj.test.kraut_aussen"), Is.True);
        }

        [TestCase(", \"respawnDays\": 0", "Nachwachsen")]
        [TestCase(", \"respawnDays\": 31", "Nachwachsen")]
        [TestCase(", \"yield\": [3, 1]", "Ertrag")]
        [TestCase(", \"yield\": [0, 2]", "Ertrag")]
        [TestCase(", \"yield\": [1.5, 3]", "Ganze Zahl")]
        [TestCase(", \"activeHours\": [25, 4]", "Tageszeit")]
        public void BadRespawnYieldOrHours_AreErrors(string extra, string expected)
        {
            Load(Nodes(Node("obj.test.kraut_1", "bloodroot", "item.herb.blutwurz", "[-30, -20]", extra)), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, expected), Is.True, LayoutTestFilesDescribe(report));
        }

        [Test]
        public void RiftMoss_GrowsOnlyAtTheRim()
        {
            string rim = Node("obj.test.moos_rand", "rift_moss", "item.herb.rissmoos", "[50, 64]");
            string crater = Node("obj.test.moos_krater", "rift_moss", "item.herb.rissmoos", "[50, 55]");
            string far = Node("obj.test.moos_weit", "rift_moss", "item.herb.rissmoos", "[50, 90]");

            Load(TestLayouts.Build(extra: Rift + ", \"harvestNodes\": [" + rim + ", " + crater + ", " + far + "]"), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "obj.test.moos_rand"), Is.False, LayoutTestFilesDescribe(report));
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Riss-Krater"), Is.True);
            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "obj.test.moos_weit"), Is.True);
        }

        [Test]
        public void RiftMoss_WithoutARift_IsAnError()
        {
            Load(Nodes(Node("obj.test.moos", "rift_moss", "item.herb.rissmoos", "[-30, -20]")), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Rissmoos"), Is.True);
        }

        [Test]
        public void NodesOfOneKind_ShareItemRespawnAndHours()
        {
            string first = Node("obj.test.kraut_1", "bloodroot", "item.herb.blutwurz", "[-30, -20]");
            string other = Node("obj.test.kraut_2", "bloodroot", "item.herb.silberblatt", "[-20, -20]", ", \"respawnDays\": 2");

            Load(Nodes(first + ", " + other), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "einer Art"), Is.True);
        }

        [Test]
        public void NodesCloserThanTwoMetres_AreAnError()
        {
            string first = Node("obj.test.kraut_1", "bloodroot", "item.herb.blutwurz", "[-30, -20]");
            string second = Node("obj.test.kraut_2", "bloodroot", "item.herb.blutwurz", "[-29, -20]");

            Load(Nodes(first + ", " + second), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "zu dicht"), Is.True);
        }

        private static string Node(string id, string kind, string item, string position, string extra = "")
        {
            return "{ \"id\": \"" + id + "\", \"name\": \"Kraut\", \"kind\": \"" + kind + "\", \"itemId\": \"" + item + "\", \"position\": " + position +
                   ", \"locationId\": \"loc.test.platz\"" + extra + " }";
        }

        private static string Nodes(string nodes)
        {
            return TestLayouts.Build(extra: "\"harvestNodes\": [" + nodes + "]");
        }

        private static RegionLayout Load(string json, out LayoutReport report)
        {
            return TestLayouts.Load(json, out report);
        }

        private static string LayoutTestFilesDescribe(LayoutReport report)
        {
            return LayoutTestFiles.Describe(report);
        }
    }
}
