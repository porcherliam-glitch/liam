using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// The quest validator (GDD 02 10.2, menu "Aetherfall > Quests pruefen"): one test per rule with a minimal broken quest,
    /// plus a clean quest without findings. Codes: V01 duplicates, V02 id schema, V03 stage without objectives, V04 broken
    /// references (with spelling suggestion), V05 unreachable, V06 dead end, V07 cycle, V08 no success end, V09 no default
    /// exit, V10 missing texts from "Fertig", V11 cannot start, V13 invalid parameters, V14 empty entries, V15 repeatable with
    /// lasting flag, V16 flag only read / only written, V17 enum value, V18 contradicting start condition, W01 no reward,
    /// W04 text too long, W05 markers without hint, W07 decision without ledger, W10 short deadline, W12 consequence budget.
    /// </summary>
    [TestFixture]
    public sealed class QuestValidatorTests
    {
        private const string Npc = "npc.eichental.bauer_hollmann";
        private const string Outcome = "flag.eichental.test_ausgang";

        [Test]
        public void CleanQuest_HasNoFindings()
        {
            ValidationReport report = Validate(Clean("quest.side.test.sauber").Build());

            Assert.That(report.Issues, Is.Empty, report.ToText());
        }

        [Test]
        public void V01_DuplicateIds()
        {
            QuestSpec quest = Clean("quest.side.test.a")
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).Objective(Talk("o1")).EndSuccess())
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).EndSuccess())
                .LedgerEntry("ledger.c1", "Eins.")
                .LedgerEntry("ledger.c1", "Zwei.")
                .Build();

            ValidationReport report = Validate(quest, Clean("quest.side.test.a").Build());

            Assert.That(report.CountOf("V01"), Is.EqualTo(4), report.ToText());
        }

        [Test]
        public void V02_IdSchema()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.Side.Wölfe")
                .Title("Test")
                .Giver(Npc)
                .Rewards(new SetFlag(Outcome, 1))
                .Stage(new StageBuilder("stage10").Objective(new TalkToObjective("ziel1", Npc)).EndSuccess())
                .LedgerEntry("c1", "Text.")
                .Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.CountOf("V02"), Is.EqualTo(4), report.ToText());
        }

        [Test]
        public void V03_StageWithoutObjectives()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10").Next("s20"))
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).EndSuccess())
                .Build();

            Assert.That(Validate(quest).CountOf("V03"), Is.EqualTo(1));
        }

        [Test]
        public void V04_BrokenReferences_WithSuggestion()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .StartCondition(new QuestStatusIs("quest.side.test.saubr", QuestStatus.Completed))
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).Branch(new QuestObjectiveDone("o7"), "s20").Next("s99").Ledger("ledger.c5"))
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).EndSuccess())
                .FollowUp("quest.side.test.gibt_es_nicht", FollowUpMode.Offer)
                .Build();
            var lookup = new QuestValidationLookup(new[] { Npc }, Flags());

            ValidationReport report = new QuestValidator(lookup).Validate(new[] { quest, Clean("quest.side.test.sauber").Build() });

            Assert.That(report.CountOf("V04"), Is.EqualTo(5), report.ToText());
            Assert.That(report.ToText(), Does.Contain("Meintest du 'quest.side.test.sauber'?"));
        }

        [Test]
        public void V04_UnknownContentId_WhenTheContentListIsKnown()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10").Objective(new TalkToObjective("o1", "npc.eichental.bauer_holman")).EndSuccess())
                .Build();
            var lookup = new QuestValidationLookup(new[] { Npc }, Flags());

            ValidationReport report = new QuestValidator(lookup).Validate(quest);

            Assert.That(report.CountOf("V04"), Is.EqualTo(1), report.ToText());
            Assert.That(report.ToText(), Does.Contain("Meintest du '" + Npc + "'?"));
        }

        [Test]
        public void V05_V06_V08_UnreachableDeadEndAndNoSuccess()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).Next("s20"))
                .Stage(new StageBuilder("s20").Objective(Talk("o1")))
                .Stage(new StageBuilder("s30").Objective(Talk("o1")).EndSuccess())
                .Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.Contains("V05"), Is.True, "s30 unreachable");
            Assert.That(report.Contains("V06"), Is.True, "s20 dead end");
            Assert.That(report.Contains("V08"), Is.True, "no reachable success end");
        }

        [Test]
        public void V07_CycleWithoutExit()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).Branch(new FlagIs(Outcome, 1), "s20").Next("s30"))
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).Next("s25"))
                .Stage(new StageBuilder("s25").Objective(Talk("o1")).Next("s20"))
                .Stage(new StageBuilder("s30").Objective(Talk("o1")).EndSuccess())
                .Build();

            Assert.That(Validate(quest).CountOf("V07"), Is.EqualTo(2), "s20 and s25");
        }

        [Test]
        public void V09_BranchesWithoutDefaultExit_UnlessTheyCoverEveryObjective()
        {
            QuestSpec open = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).Branch(new FlagIs(Outcome, 1), "s20"))
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).EndSuccess())
                .Build();
            QuestSpec covered = Clean("quest.side.test.b", false)
                .Stage(new StageBuilder("s40")
                    .Objective(Talk("o1"))
                    .Objective(new TalkToObjective("o2", "npc.eichental.wirt_ulf"))
                    .AnyObjective()
                    .Branch(new QuestObjectiveDone("o1"), "s50_a")
                    .Branch(new QuestObjectiveDone("o2"), "s50_b"))
                .Stage(new StageBuilder("s50_a").Objective(Talk("o1")).EndSuccess())
                .Stage(new StageBuilder("s50_b").Objective(Talk("o1")).EndSuccess())
                .Build();

            Assert.That(Validate(open).CountOf("V09"), Is.EqualTo(1));
            Assert.That(Validate(covered).CountOf("V09"), Is.EqualTo(0), "o1 and o2 cover mode 'one'");
        }

        [Test]
        public void V10_TextsAreRequiredFromStatusDone()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.side.test.a")
                .Giver(Npc)
                .Rewards(new SetFlag(Outcome, 1))
                .Production(ContentStatus.Done)
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).EndSuccess())
                .Build();

            Assert.That(Validate(quest).CountOf("V10"), Is.EqualTo(3), "title, description, stage text");
        }

        [Test]
        public void V11_NoGiverAndNoTrigger()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.side.test.a")
                .Title("Test")
                .Rewards(new SetFlag(Outcome, 1))
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).EndSuccess())
                .Build();

            Assert.That(Validate(quest).CountOf("V11"), Is.EqualTo(1));
        }

        [Test]
        public void V13_V14_InvalidParametersAndEmptyEntries()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10")
                    .Objective(new KillObjective("o1", "enemy.wolf.grauwolf", 0))
                    .Objective(null)
                    .OnStart(new GameAction[] { null })
                    .Branch(new AllOf((Condition)null), "s20")
                    .Next("s20"))
                .Stage(new StageBuilder("s20").Objective(Talk("o1")).EndSuccess())
                .Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.CountOf("V13"), Is.EqualTo(1), report.ToText());
            Assert.That(report.CountOf("V14"), Is.EqualTo(3), report.ToText());
        }

        [Test]
        public void V15_RepeatableQuestWithALastingFlag()
        {
            QuestSpec quest = Clean("quest.bounty.test.a", false)
                .Repeat(QuestRepeatMode.Daily)
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).OnComplete(new SetFlag(Outcome, 1), new AddToFlag("stat.global.test_zaehler", 1)).EndSuccess())
                .Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.CountOf("V15"), Is.EqualTo(1), report.ToText());
            Assert.That(report.ToText(), Does.Contain(Outcome));
            Assert.That(report.ToText(), Does.Not.Contain("dauerhaft stat.global"), "counters may grow with every repeat");
        }

        [Test]
        public void V16_FlagOnlyReadOrOnlyWritten_V17_EnumValue_V04_UndefinedFlag()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .StartCondition(new FlagIs("flag.eichental.test_gelesen", 1))
                .Stage(new StageBuilder("s10").Objective(Talk("o1")).OnComplete(new SetFlag(Outcome, 7), new SetFlag("flag.eichental.tipfehler", 1)).EndSuccess())
                .Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.CountOf("V17"), Is.EqualTo(1), "value 7 of an enum with 3 values");
            Assert.That(report.CountOf("V04"), Is.EqualTo(1), "flag.eichental.tipfehler has no definition");
            Assert.That(report.CountOf("V16"), Is.EqualTo(3), report.ToText());
        }

        [Test]
        public void V18_ContradictingStartConditions()
        {
            QuestSpec never = Clean("quest.side.test.a").StartCondition(new Never()).Build();
            QuestSpec both = Clean("quest.side.test.b")
                .StartCondition(new AllOf(new QuestStatusIs("quest.side.test.a", QuestStatus.Active), new QuestStatusIs("quest.side.test.a", QuestStatus.Completed)))
                .Build();

            Assert.That(Validate(never).CountOf("V18"), Is.EqualTo(1));
            Assert.That(Validate(both, Clean("quest.side.test.a").Build()).CountOf("V18"), Is.EqualTo(1));
        }

        [Test]
        public void Warnings_NoRewardLongTextsMarkersDecisionDeadlineBudget()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.side.test.a")
                .Title(new string('T', 40), "Beschreibung.")
                .Giver(Npc)
                .Category(QuestCategory.Side, QuestTraits.TimeLimited)
                .Deadline(20f)
                .Stage(new StageBuilder("s10")
                    .Text("Kurz.")
                    .Objective(new ChooseObjective("o1", new ChoiceOption("a", "A"), new ChoiceOption("b", "B")))
                    .Markers(50f, "obj.eichental.marker")
                    .OnComplete(new SetFlag("flag.eichental.w1", 1), new SetFlag("flag.eichental.w2", 1), new SetFlag("flag.eichental.w3", 1),
                                new SetFlag("flag.eichental.w4", 1))
                    .EndSuccess())
                .Build();

            ValidationReport report = new QuestValidator().Validate(quest);

            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
            Assert.That(report.Contains("W01"), Is.True, "no reward");
            Assert.That(report.Contains("W04"), Is.True, "title longer than 32");
            Assert.That(report.Contains("W05"), Is.True, "markers without hint");
            Assert.That(report.Contains("W07"), Is.True, "decision without ledger");
            Assert.That(report.Contains("W10"), Is.True, "deadline below 2 game days");
            Assert.That(report.Contains("W12"), Is.True, "4 lasting flags");
        }

        [Test]
        public void ConditionWithoutTrigger_IsReportedAsHint()
        {
            QuestSpec quest = Clean("quest.side.test.a").FailWhen(new PolledTestCondition(), string.Empty, "x").Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.Contains("C01"), Is.True);
            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
        }

        [Test]
        public void ConditionWithoutTrigger_InsideAnAnd_IsReportedAsHint()
        {
            QuestSpec quest = Clean("quest.side.test.a").FailWhen(new AllOf(new FlagIs(Outcome, 1), new PolledTestCondition()), string.Empty, "x").Build();

            ValidationReport report = Validate(quest);

            Assert.That(report.CountOf("C01"), Is.EqualTo(1), report.ToText());
            Assert.That(report.ToText(), Does.Contain("enthält eine Bedingung ohne Auslöser"));
        }

        [Test]
        public void Locations_NameQuestStageAndObjective()
        {
            QuestSpec quest = Clean("quest.side.test.a", false)
                .Stage(new StageBuilder("s10").Objective(new KillObjective("o3", "enemy.wolf.grauwolf", 0)).EndSuccess())
                .Build();

            ValidationReport report = Validate(quest);
            var locations = new List<string>();
            for (int i = 0; i < report.Issues.Count; i++)
            {
                locations.Add(report.Issues[i].Location);
            }

            Assert.That(locations, Has.Some.EqualTo("quest.side.test.a / s10 / o3"));
        }

        private static ValidationReport Validate(params QuestSpec[] quests)
        {
            return new QuestValidator(new QuestValidationLookup(null, Flags())).Validate(quests);
        }

        private static FlagRegistry Flags()
        {
            return FlagRegistry.FromSpecs(
                FlagSpec.Enum(Outcome, "unbekannt", "eins", "zwei"),
                FlagSpec.Bool("flag.eichental.test_gelesen"),
                FlagSpec.Counter("stat.global.test_zaehler"));
        }

        private static TalkToObjective Talk(string objectiveId)
        {
            return new TalkToObjective(objectiveId, Npc);
        }

        private static QuestSpecBuilder Clean(string questId, bool withStages = true)
        {
            QuestSpecBuilder builder = new QuestSpecBuilder(questId)
                .Title("Test", "Beschreibung.")
                .Giver(Npc)
                .StartTrigger(QuestStartTriggerKind.Dialogue, "dlg.eichental.test")
                .Rewards(new RecordAction("GiveXp 0.3 Lv"));
            if (withStages)
            {
                builder.Stage(new StageBuilder("s10")
                    .Text("Sprich mit Hollmann.")
                    .Objective(Talk("o1"))
                    .Branch(new FlagIs(Outcome, 1), "s20_eins")
                    .Next("s20_sonst"));
                builder.Stage(new StageBuilder("s20_eins").Text("Eins.").Objective(Talk("o1")).OnComplete(new SetFlag(Outcome, 2)).EndSuccess());
                builder.Stage(new StageBuilder("s20_sonst").Text("Sonst.").Objective(Talk("o1")).EndSuccess());
            }

            return builder;
        }
    }
}
