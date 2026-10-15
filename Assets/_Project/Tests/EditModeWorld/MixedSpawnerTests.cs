using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Mixed enemy groups (GDD 01 11.1) and the area level of a spawner: reading, order of the members, checks.</summary>
    [TestFixture]
    public sealed class MixedSpawnerTests
    {
        private static string Spawner(int count, string members, int level)
        {
            return "\"spawners\": [{ \"id\": \"spawn.test.banditen\", \"enemyTypeId\": \"enemy.bandit.schlaeger\", \"count\": " + count + ", " +
                   "\"members\": " + members + ", \"level\": " + level + ", " +
                   "\"center\": [20, -20], \"radius\": 5, \"activation\": \"always\", \"locationId\": \"loc.test.platz\" }]";
        }

        private const string Bandits = "[ { \"enemyTypeId\": \"enemy.bandit.schlaeger\", \"count\": 2 }, " +
                                       "{ \"enemyTypeId\": \"enemy.bandit.armbrustschuetze\", \"variant\": \"normal\", \"count\": 1 }, " +
                                       "{ \"enemyTypeId\": \"enemy.bandit.schlaeger\", \"variant\": \"elite\", \"count\": 1 } ]";

        [Test]
        public void MixedGroupIsReadInOrder()
        {
            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(extra: Spawner(4, Bandits, 4)), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFiles.Describe(report));
            LayoutSpawner spawner = layout.Spawners[0];
            Assert.That(spawner.Level, Is.EqualTo(4));
            Assert.That(spawner.Members.Count, Is.EqualTo(3));
            Assert.That(spawner.MemberAt(0, out string v0), Is.EqualTo("enemy.bandit.schlaeger"));
            Assert.That(v0, Is.EqualTo("normal"));
            Assert.That(spawner.MemberAt(1, out _), Is.EqualTo("enemy.bandit.schlaeger"));
            Assert.That(spawner.MemberAt(2, out string v2), Is.EqualTo("enemy.bandit.armbrustschuetze"));
            Assert.That(v2, Is.EqualTo("normal"));
            Assert.That(spawner.MemberAt(3, out string v3), Is.EqualTo("enemy.bandit.schlaeger"));
            Assert.That(v3, Is.EqualTo("elite"));
        }

        [Test]
        public void GroupWithoutMembersUsesTheMainType()
        {
            const string spawner = "\"spawners\": [{ \"id\": \"spawn.test.woelfe\", \"enemyTypeId\": \"enemy.wolf.grauwolf\", \"variant\": \"elite\", " +
                                   "\"count\": 2, \"center\": [20, -20], \"radius\": 5, \"activation\": \"always\", \"locationId\": \"loc.test.platz\" }]";

            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(extra: spawner), out LayoutReport report);

            Assert.That(report.Issues, Is.Empty, LayoutTestFiles.Describe(report));
            Assert.That(layout.Spawners[0].Level, Is.EqualTo(0), "Ohne Angabe gilt die Stufe der Region.");
            Assert.That(layout.Spawners[0].MemberAt(1, out string variant), Is.EqualTo("enemy.wolf.grauwolf"));
            Assert.That(variant, Is.EqualTo("elite"));
        }

        [Test]
        public void MembersMustAddUpToTheCount()
        {
            TestLayouts.Load(TestLayouts.Build(extra: Spawner(5, Bandits, 4)), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "die Teile ergeben 4 Gegner"), Is.True, LayoutTestFiles.Describe(report));
        }

        [Test]
        public void LevelAbove80IsAnError()
        {
            TestLayouts.Load(TestLayouts.Build(extra: Spawner(4, Bandits, 81)), out LayoutReport report);

            Assert.That(TestLayouts.Has(report, LayoutIssueSeverity.Error, "Gebietsstufe"), Is.True, LayoutTestFiles.Describe(report));
        }
    }
}
