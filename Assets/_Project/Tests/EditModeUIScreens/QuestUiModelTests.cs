using System.Collections.Generic;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Quests;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for the pure quest UI models with the real quest service and the test quests of the test ground:
    /// <see cref="QuestLogModel"/> (tabs, order, badges), <see cref="QuestDetailsBuilder"/> (current stage, objectives,
    /// history, outcome with decisions), <see cref="QuestTrackerModel"/> (focus first, at most 3) and <see cref="QuestLogRules"/>.
    /// </summary>
    [TestFixture]
    public sealed class QuestUiModelTests
    {
        private const string WolfTitle = "Wolfsjagd im Testgelände";
        private const string AlphaId = "quest.side.test.alpha";
        private const string BetaId = "quest.side.test.beta";
        private const string MainId = "quest.main.test.anfang";

        private UiQuestEnvironment _env;
        private readonly List<QuestLogEntry> _rows = new List<QuestLogEntry>();

        [SetUp]
        public void SetUp()
        {
            _env = new UiQuestEnvironment(
                UiQuestEnvironment.SimpleQuest(AlphaId, "Alpha", QuestCategory.Side),
                UiQuestEnvironment.SimpleQuest(BetaId, "Beta", QuestCategory.Treasure),
                UiQuestEnvironment.SimpleQuest(MainId, "Der Anfang", QuestCategory.Main));
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        [Test]
        public void NothingStarted_AllTabsEmpty_DefaultTabIsMain()
        {
            for (int tab = 0; tab < QuestLogRules.TabCount; tab++)
            {
                Assert.That(QuestLogModel.Collect(_env.Quests, (QuestLogTab)tab, _rows), Is.EqualTo(0));
            }

            Assert.That(QuestLogModel.DefaultTab(_env.Quests), Is.EqualTo(QuestLogTab.Main));
            Assert.That(QuestLogModel.Collect(null, QuestLogTab.Side, _rows), Is.EqualTo(0), "no quest service: empty, no exception");
        }

        [Test]
        public void StartedSideQuest_IsInTheSideTab_WithFocusBadgeAndLevel()
        {
            _env.ReadBoard();

            Assert.That(QuestLogModel.Collect(_env.Quests, QuestLogTab.Side, _rows), Is.EqualTo(1));
            QuestLogEntry row = _rows[0];
            Assert.That(row.QuestId, Is.EqualTo(TestGroundQuestLibrary.WolfHuntId));
            Assert.That(row.Title, Is.EqualTo(WolfTitle));
            Assert.That(row.Info, Is.EqualTo("Nebenquest · Stufe 10"), "recommended level of the test quests = start level of the test ground");
            Assert.That(row.Badge, Is.EqualTo("Fokus"), "the first tracked quest becomes the focus quest");
            Assert.That(row.CategoryClass, Is.EqualTo("af-cat--side"));
            Assert.That(row.Tracked && row.Focus && !row.Finished, Is.True);
            Assert.That(QuestLogModel.DefaultTab(_env.Quests), Is.EqualTo(QuestLogTab.Side));
            Assert.That(QuestLogModel.Count(_env.Quests, QuestLogTab.Main), Is.EqualTo(0));
        }

        [Test]
        public void ActiveTabs_FocusFirst_ThenTracked_ThenUntracked()
        {
            Assert.That(_env.Quests.TryStart(AlphaId, "test"), Is.True);
            Assert.That(_env.Quests.TryStart(BetaId, "test"), Is.True);
            _env.ReadBoard();
            Assert.That(_env.Quests.TrySetTracked(BetaId, false), Is.True);

            QuestLogModel.Collect(_env.Quests, QuestLogTab.Side, _rows);

            Assert.That(Titles(), Is.EqualTo(new[] { "Alpha", WolfTitle, "Beta" }), "treasure hunts belong to the side tab (GDD 02 7.1)");
            Assert.That(_rows[0].Badge, Is.EqualTo("Fokus"));
            Assert.That(_rows[1].Badge, Is.EqualTo("Verfolgt"));
            Assert.That(_rows[2].Badge, Is.Empty);
            Assert.That(_rows[2].Info, Is.EqualTo("Schatzsuche · Stufe 1"));
        }

        [Test]
        public void MainQuest_BecomesFocus_AndTheDefaultTab()
        {
            _env.ReadBoard();
            Assert.That(_env.Quests.TryStart(MainId, "test"), Is.True);

            Assert.That(QuestLogModel.DefaultTab(_env.Quests), Is.EqualTo(QuestLogTab.Main));
            QuestLogModel.Collect(_env.Quests, QuestLogTab.Main, _rows);
            Assert.That(_rows.Count, Is.EqualTo(1));
            Assert.That(_rows[0].Badge, Is.EqualTo("Fokus"));
            Assert.That(_rows[0].CategoryClass, Is.EqualTo("af-cat--main"));
        }

        [Test]
        public void FinishedQuest_MovesToCompleted_NewestFirst()
        {
            _env.FinishWolfHunt();
            Assert.That(_env.Quests.TryStart(AlphaId, "test"), Is.True);
            _env.KillRat("rat_1");
            _env.KillRat("rat_2");
            Assert.That(_env.Quests.GetStatus(AlphaId), Is.EqualTo(QuestStatus.Completed), "precondition");

            Assert.That(QuestLogModel.Count(_env.Quests, QuestLogTab.Side), Is.EqualTo(0));
            QuestLogModel.Collect(_env.Quests, QuestLogTab.Completed, _rows);
            Assert.That(Titles(), Is.EqualTo(new[] { "Alpha", WolfTitle }));
            Assert.That(_rows[1].Badge, Is.EqualTo("Abgeschlossen"));
            Assert.That(_rows[1].Info, Is.EqualTo("Nebenquest"));
            Assert.That(_rows[1].Finished && !_rows[1].Tracked && !_rows[1].Focus, Is.True);
        }

        [Test]
        public void Details_ActiveQuest_ShowStageTextAndObjectiveCounter()
        {
            _env.ReadBoard();
            var details = new QuestDetails();

            Assert.That(QuestDetailsBuilder.Fill(_env.Quests, TestGroundQuestLibrary.WolfHuntId, details), Is.True);
            Assert.That(details.Title, Is.EqualTo(WolfTitle));
            Assert.That(details.Meta, Is.EqualTo("Nebenquest · empfohlen ab Stufe 10"));
            Assert.That(details.Description, Does.StartWith("Ein Aushang an der Anschlagtafel"));
            Assert.That(details.CurrentTitle, Is.EqualTo("Aktueller Stand"));
            Assert.That(details.CurrentText, Does.StartWith("Drei Wölfe streifen"));
            Assert.That(details.Objectives.Count, Is.EqualTo(1));
            Assert.That(details.Objectives[0].Text, Is.EqualTo("Wölfe besiegen"));
            Assert.That(details.Objectives[0].CountText, Is.EqualTo("0/3"));
            Assert.That(details.Objectives[0].Key, Is.EqualTo("s10.o1"));
            Assert.That(details.History, Is.Empty);
            Assert.That(details.HistoryTitle, Is.Empty);

            _env.KillWolf("wolf_1");
            QuestDetailsBuilder.Fill(_env.Quests, TestGroundQuestLibrary.WolfHuntId, details);
            Assert.That(details.Objectives[0].CountText, Is.EqualTo("1/3"));
            Assert.That(details.Objectives[0].Done, Is.False);
        }

        [Test]
        public void Details_NextStage_ListsTheEarlierStageUnderBisher()
        {
            _env.ReadBoard();
            _env.KillWolf("wolf_1");
            _env.KillWolf("wolf_2");
            _env.KillWolf("wolf_3");
            var details = new QuestDetails();

            QuestDetailsBuilder.Fill(_env.Quests, TestGroundQuestLibrary.WolfHuntId, details);

            Assert.That(details.CurrentText, Does.StartWith("Die Wölfe sind besiegt"));
            Assert.That(details.Objectives[0].Text, Is.EqualTo("Wolfsfell aufheben"));
            Assert.That(details.Objectives[0].ShowsCount, Is.False, "single-step objectives show no counter");
            Assert.That(details.HistoryTitle, Is.EqualTo("Bisher"));
            Assert.That(details.History.Count, Is.EqualTo(1));
            Assert.That(details.History[0].Kind, Is.EqualTo(QuestDetailLineKind.Stage));
            Assert.That(details.History[0].Text, Does.StartWith("Drei Wölfe streifen"));
        }

        [Test]
        public void Details_FinishedQuest_ShowOutcomeAndDecisions()
        {
            _env.FinishWolfHunt();
            var details = new QuestDetails();

            QuestDetailsBuilder.Fill(_env.Quests, TestGroundQuestLibrary.WolfHuntId, details);

            Assert.That(details.CurrentTitle, Is.EqualTo("Ausgang"));
            Assert.That(details.CurrentText, Does.StartWith("Du hast das Wolfsfell an der Anschlagtafel abgegeben"));
            Assert.That(details.Objectives, Is.Empty);
            Assert.That(details.HistoryTitle, Is.EqualTo("Entscheidungen"));
            Assert.That(details.History.Count, Is.EqualTo(1));
            Assert.That(details.History[0].Kind, Is.EqualTo(QuestDetailLineKind.Decision));
            Assert.That(details.History[0].StyleClass, Is.EqualTo("is-decision"));
        }

        [Test]
        public void Details_UnknownOrNotStarted_StayEmpty()
        {
            var details = new QuestDetails();
            Assert.That(QuestDetailsBuilder.Fill(_env.Quests, TestGroundQuestLibrary.TrialId, details), Is.False);
            Assert.That(details.HasQuest, Is.False);
            Assert.That(QuestDetailsBuilder.Fill(_env.Quests, "quest.side.gibt_es_nicht", details), Is.False);
            Assert.That(QuestDetailsBuilder.Fill(null, TestGroundQuestLibrary.WolfHuntId, details), Is.False);
        }

        [Test]
        public void Tracker_ShowsFocusFirst_AtMostThree_WithObjectives()
        {
            var entries = new List<TrackedQuestEntry>();
            Assert.That(QuestTrackerModel.Collect(_env.Quests, entries), Is.EqualTo(0));

            _env.ReadBoard();
            _env.Quests.TryStart(AlphaId, "test");
            _env.Quests.TryStart(MainId, "test");
            _env.Quests.TryStart(BetaId, "test");

            Assert.That(QuestTrackerModel.Collect(_env.Quests, entries), Is.EqualTo(3), "Beta is not tracked automatically: limit 3");
            Assert.That(entries[0].QuestId, Is.EqualTo(MainId), "the main quest took the focus");
            Assert.That(entries[0].IsFocus, Is.True);
            Assert.That(entries[1].QuestId, Is.EqualTo(TestGroundQuestLibrary.WolfHuntId));
            Assert.That(entries[1].IsFocus, Is.False);
            Assert.That(entries[1].Objectives[0].Text, Is.EqualTo("Wölfe besiegen"));
            Assert.That(entries[2].QuestId, Is.EqualTo(AlphaId));

            _env.KillRat("rat_1");
            _env.KillRat("rat_2");
            Assert.That(QuestTrackerModel.Collect(_env.Quests, entries), Is.EqualTo(1), "both rat quests are done; Beta was never tracked");
            Assert.That(entries[0].QuestId, Is.EqualTo(TestGroundQuestLibrary.WolfHuntId));
        }

        [TestCase(QuestCategory.Main, QuestLogTab.Main)]
        [TestCase(QuestCategory.Faction, QuestLogTab.Faction)]
        [TestCase(QuestCategory.Region, QuestLogTab.Region)]
        [TestCase(QuestCategory.Side, QuestLogTab.Side)]
        [TestCase(QuestCategory.Dungeon, QuestLogTab.Side)]
        [TestCase(QuestCategory.Legendary, QuestLogTab.Side)]
        [TestCase(QuestCategory.Companion, QuestLogTab.Companion)]
        [TestCase(QuestCategory.Bounty, QuestLogTab.Contracts)]
        [TestCase(QuestCategory.Daily, QuestLogTab.Contracts)]
        [TestCase(QuestCategory.WorldEvent, QuestLogTab.Contracts)]
        public void Rules_MapEveryCategoryToItsTab(QuestCategory category, QuestLogTab tab)
        {
            Assert.That(QuestLogRules.TabOf(category), Is.EqualTo(tab));
        }

        [Test]
        public void Rules_EveryCategoryHasAGermanNameAndAColourClass()
        {
            foreach (QuestCategory category in System.Enum.GetValues(typeof(QuestCategory)))
            {
                string name = QuestLogRules.CategoryName(category);
                Assert.That(name, Does.Not.StartWith("quest-category-"), "missing text for " + category);
                Assert.That(QuestLogRules.AllCategoryClasses, Does.Contain(QuestLogRules.CategoryClass(category)));
            }
        }

        [Test]
        public void Rules_SplitTheStageQualifiedObjectiveId()
        {
            Assert.That(QuestLogRules.TrySplitObjectiveKey("s40_belohnung.o2", out string stage, out string objective), Is.True);
            Assert.That(stage, Is.EqualTo("s40_belohnung"));
            Assert.That(objective, Is.EqualTo("o2"));
            Assert.That(QuestLogRules.TrySplitObjectiveKey("o1", out _, out _), Is.False);
            Assert.That(QuestLogRules.TrySplitObjectiveKey("s10.", out _, out _), Is.False);
            Assert.That(QuestLogRules.TrySplitObjectiveKey(null, out _, out _), Is.False);
        }

        private string[] Titles()
        {
            var titles = new string[_rows.Count];
            for (int i = 0; i < _rows.Count; i++)
            {
                titles[i] = _rows[i].Title;
            }

            return titles;
        }
    }
}
