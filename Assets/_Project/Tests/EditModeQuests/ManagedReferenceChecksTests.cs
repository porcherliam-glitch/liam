using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.EditorTools.Narrative;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Checks of the stored <c>[SerializeReference]</c> data behind "Aetherfall > Quests pruefen" and the type picker: a
    /// missing class becomes a V14 error naming class, namespace and assembly at the quest (the result window pings the asset),
    /// and every later place that shares an object with an earlier one is found - not only the direct predecessor - and
    /// reported as R01 with readable paths.
    /// </summary>
    [TestFixture]
    public sealed class ManagedReferenceChecksTests
    {
        private const string QuestId = "quest.side.eichental.woelfe_vom_nordhang";

        [Test]
        public void FindShared_FindsEveryLaterPlace_NotOnlyTheDirectPredecessor()
        {
            var places = new List<KeyValuePair<string, long>>
            {
                Place("stages.Array.data[0].objectives.Array.data[0]", 7),
                Place("stages.Array.data[0].objectives.Array.data[1]", 7),
                Place("stages.Array.data[0].objectives.Array.data[2]", 7),
                Place("startCondition", ManagedReferenceChecks.NullId),
                Place("failRules.Array.data[0].condition", ManagedReferenceChecks.NullId),
                Place("stages.Array.data[1].branches.Array.data[0].condition", ManagedReferenceChecks.UnknownId),
                Place("stages.Array.data[1].branches.Array.data[1].condition", ManagedReferenceChecks.UnknownId),
                Place("stages.Array.data[1].onStart.Array.data[0]", 9)
            };

            List<SharedManagedReference> shared = ManagedReferenceChecks.FindShared(places);

            Assert.That(shared.Count, Is.EqualTo(2), "[A, A, A]: the 2nd and the 3rd place share A; empty and unknown ids are no objects");
            Assert.That(shared[0].Path, Is.EqualTo("stages.Array.data[0].objectives.Array.data[1]"));
            Assert.That(shared[1].Path, Is.EqualTo("stages.Array.data[0].objectives.Array.data[2]"));
            Assert.That(shared[1].FirstPath, Is.EqualTo("stages.Array.data[0].objectives.Array.data[0]"), "compared with the first place, not with the predecessor");
            Assert.That(shared[1].ReferenceId, Is.EqualTo(7));
            Assert.That(ManagedReferenceChecks.FindShared(null), Is.Empty);
        }

        [Test]
        public void MissingTypes_AreV14Errors_WithClassNamespaceAndAssembly_AtTheQuest()
        {
            var report = new ValidationReport();
            var missing = new List<MissingManagedType>
            {
                new MissingManagedType("Aetherfall.Quests", "Aetherfall.Quests", "QuestStageReachedAlt", 4711),
                new MissingManagedType("Aetherfall.Tests.EditMode.Quests", "Aetherfall.Tests.EditMode.Quests", "GiveTestItem", 4712)
            };

            ManagedReferenceChecks.ReportMissingTypes(report, QuestId, missing);

            Assert.That(report.ErrorCount, Is.EqualTo(2));
            Assert.That(report.CountOf("V14"), Is.EqualTo(2));
            Assert.That(report.Issues[0].Message, Does.Contain("QuestStageReachedAlt").And.Contain("Aetherfall.Quests"));
            Assert.That(report.Issues[1].Message, Does.Contain("GiveTestItem").And.Contain("Aetherfall.Tests.EditMode.Quests"));
            Assert.That(missing[0].FullName, Is.EqualTo("Aetherfall.Quests.QuestStageReachedAlt"));

            var result = new QuestValidationResult(report, new Dictionary<string, string> { { QuestId, "Assets/_Project/Data/Quests/Quest_Woelfe.asset" } }, 1, false);
            Assert.That(result.AssetPathOf(report.Issues[0]), Is.EqualTo("Assets/_Project/Data/Quests/Quest_Woelfe.asset"), "a click pings the quest asset");
            Assert.That(result.Summary, Does.Contain("2 Fehler"));
        }

        [Test]
        public void SharedReferences_AreR01Warnings_WithReadablePaths()
        {
            var report = new ValidationReport();
            var shared = new List<SharedManagedReference>
            {
                new SharedManagedReference(7, "stages.Array.data[0].objectives.Array.data[0]", "stages.Array.data[1].objectives.Array.data[0]")
            };

            ManagedReferenceChecks.ReportSharedReferences(report, QuestId, shared);

            Assert.That(report.WarningCount, Is.EqualTo(1));
            Assert.That(report.ErrorCount, Is.EqualTo(0));
            Assert.That(report.Contains(ManagedReferenceChecks.SharedReferenceCode), Is.True);
            Assert.That(report.Issues[0].Message, Does.Contain("stages[1].objectives[0]").And.Contain("stages[0].objectives[0]"));
            Assert.That(report.Issues[0].Location, Is.EqualTo(QuestId));
        }

        [Test]
        public void ReferenceIds_NullAndUnknownAreNoObjects()
        {
            Assert.That(ManagedReferenceChecks.IsReferenceId(ManagedReferenceChecks.NullId), Is.False);
            Assert.That(ManagedReferenceChecks.IsReferenceId(ManagedReferenceChecks.UnknownId), Is.False);
            Assert.That(ManagedReferenceChecks.IsReferenceId(0), Is.True);
            Assert.That(ManagedReferenceChecks.IsReferenceId(8_123_456_789_012_345_678L), Is.True);
        }

        private static KeyValuePair<string, long> Place(string path, long id)
        {
            return new KeyValuePair<string, long>(path, id);
        }
    }
}
