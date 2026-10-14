using System.Collections.Generic;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for <see cref="QuestNotifier"/> with the real quest service (GDD 02 7.5): new quest, progress at most every
    /// 2 s per quest (the newest count follows), finished objectives and new stages at once, completion as P0 banner, the
    /// hint "Im Questlog verfolgen" at the tracking limit, level-up with one points hint, and silence while disabled.
    /// </summary>
    [TestFixture]
    public sealed class QuestNotifierTests
    {
        private const string WolfTitle = "Wolfsjagd im Testgelände";

        private UiQuestEnvironment _env;
        private QuestNotifier _notifier;
        private readonly List<Notification> _shown = new List<Notification>();
        private double _now;

        [SetUp]
        public void SetUp()
        {
            _env = new UiQuestEnvironment(
                UiQuestEnvironment.SimpleQuest("quest.side.test.a", "A", QuestCategory.Side),
                UiQuestEnvironment.SimpleQuest("quest.side.test.b", "B", QuestCategory.Side),
                UiQuestEnvironment.SimpleQuest("quest.side.test.c", "C", QuestCategory.Side),
                UiQuestEnvironment.SimpleQuest("quest.main.test.m", "Der Anfang", QuestCategory.Main));
            _shown.Clear();
            _now = 0d;
            _notifier = new QuestNotifier(_env.Quests, n => _shown.Add(n));
            _env.Bus.Subscribe<QuestStarted>(OnStarted);
            _env.Bus.Subscribe<QuestStageChanged>(OnStage);
            _env.Bus.Subscribe<ObjectiveProgressed>(OnProgress);
            _env.Bus.Subscribe<QuestCompleted>(OnCompleted);
            _env.Bus.Subscribe<QuestFailed>(OnFailed);
        }

        [TearDown]
        public void TearDown()
        {
            _env.Bus.Unsubscribe<QuestStarted>(OnStarted);
            _env.Bus.Unsubscribe<QuestStageChanged>(OnStage);
            _env.Bus.Unsubscribe<ObjectiveProgressed>(OnProgress);
            _env.Bus.Unsubscribe<QuestCompleted>(OnCompleted);
            _env.Bus.Unsubscribe<QuestFailed>(OnFailed);
            _env.Dispose();
        }

        [Test]
        public void WolfHunt_FullRun_GivesTheMessagesOfGdd02_7_5()
        {
            _env.ReadBoard();
            Assert.That(Texts(), Is.EqualTo(new[] { "Neue Quest: " + WolfTitle }));
            Assert.That(_shown[0].Priority, Is.EqualTo(NotificationPriority.Progress));
            Assert.That(_shown[0].Accent, Is.EqualTo(QuestNotifier.QuestAccent));

            _shown.Clear();
            _env.KillWolf("wolf_1");
            Assert.That(Texts(), Is.EqualTo(new[] { "Wölfe besiegen (1/3)" }));

            _shown.Clear();
            _now = 0.5d;
            _env.KillWolf("wolf_2");
            Assert.That(_shown, Is.Empty, "at most one progress message per quest every 2 s");
            Assert.That(_notifier.PendingCount, Is.EqualTo(1));
            _notifier.Update(1.5d);
            Assert.That(_shown, Is.Empty);
            _notifier.Update(2.1d);
            Assert.That(Texts(), Is.EqualTo(new[] { "Wölfe besiegen (2/3)" }), "the waiting count follows after 2 s");

            _shown.Clear();
            _now = 2.2d;
            _env.KillWolf("wolf_3");
            Assert.That(Texts(), Is.EqualTo(new[] { "Wölfe besiegen (3/3)", WolfTitle + ": Wolfsfell aufheben" }),
                "a finished objective and the new stage come at once");

            _shown.Clear();
            _env.PickUpFur();
            Assert.That(Texts(), Is.EqualTo(new[] { "Erledigt: Wolfsfell aufheben", WolfTitle + ": An der Anschlagtafel melden" }));

            _shown.Clear();
            _env.ReadBoard();
            Assert.That(Texts(), Is.EqualTo(new[] { "Erledigt: An der Anschlagtafel melden", "Quest abgeschlossen: " + WolfTitle }));
            Assert.That(_shown[1].Priority, Is.EqualTo(NotificationPriority.Milestone));
        }

        [Test]
        public void FinishedObjective_DropsAWaitingProgressMessage()
        {
            _env.ReadBoard();
            _env.KillWolf("wolf_1");
            _now = 0.5d;
            _env.KillWolf("wolf_2");
            _now = 0.8d;
            _env.KillWolf("wolf_3");
            _shown.Clear();

            _notifier.Update(5d);

            Assert.That(_shown, Is.Empty, "2/3 is outdated once 3/3 was shown");
        }

        [Test]
        public void MainQuest_IsAMilestone()
        {
            _env.Quests.TryStart("quest.main.test.m", "test");

            Assert.That(_shown.Count, Is.EqualTo(1));
            Assert.That(_shown[0].Text, Is.EqualTo("Neue Hauptquest: Der Anfang"));
            Assert.That(_shown[0].Priority, Is.EqualTo(NotificationPriority.Milestone));
        }

        [Test]
        public void FourthQuest_IsNotTracked_AndGetsTheHint()
        {
            _env.Quests.TryStart("quest.side.test.a", "test");
            _env.Quests.TryStart("quest.side.test.b", "test");
            _env.Quests.TryStart("quest.side.test.c", "test");
            _shown.Clear();

            _env.ReadBoard();

            Assert.That(Texts(), Is.EqualTo(new[] { "Neue Quest: " + WolfTitle, "Im Questlog verfolgen: " + WolfTitle }));
        }

        [Test]
        public void Disabled_ShowsNothing()
        {
            _notifier.Enabled = false;
            _env.ReadBoard();
            _env.KillWolf("wolf_1");
            Assert.That(_shown, Is.Empty);
            Assert.That(_notifier.PendingCount, Is.EqualTo(0));

            _notifier.Enabled = true;
            _env.KillWolf("wolf_2");
            Assert.That(Texts(), Is.EqualTo(new[] { "Wölfe besiegen (2/3)" }));
        }

        [Test]
        public void Reset_ForgetsWaitingMessages()
        {
            _env.ReadBoard();
            _env.KillWolf("wolf_1");
            _now = 0.5d;
            _env.KillWolf("wolf_2");
            Assert.That(_notifier.PendingCount, Is.EqualTo(1));
            _shown.Clear();

            _notifier.Reset();
            _notifier.Update(10d);

            Assert.That(_notifier.PendingCount, Is.EqualTo(0));
            Assert.That(_shown, Is.Empty);
        }

        [Test]
        public void LevelUp_ShowsTheBanner_AndOnePointsHintForSeveralLevels()
        {
            _notifier.OnLevelUp(2, 0d);
            _notifier.OnLevelUp(3, 0.1d);

            Assert.That(_shown.Count, Is.EqualTo(3));
            Assert.That(_shown[0].Kind, Is.EqualTo(NotificationKind.LevelUp));
            Assert.That(_shown[0].Amount, Is.EqualTo(2));
            Assert.That(_shown[1].Text, Is.EqualTo("Neue Punkte – im Charakter-Menü verteilen"));
            Assert.That(_shown[2].Kind, Is.EqualTo(NotificationKind.LevelUp));

            _notifier.OnLevelUp(4, 20d);
            Assert.That(_shown.Count, Is.EqualTo(5), "a later level-up gets its hint again");
        }

        private string[] Texts()
        {
            var texts = new string[_shown.Count];
            for (int i = 0; i < _shown.Count; i++)
            {
                texts[i] = _shown[i].Text;
            }

            return texts;
        }

        private void OnStarted(QuestStarted evt)
        {
            _notifier.OnQuestStarted(evt.QuestId);
        }

        private void OnStage(QuestStageChanged evt)
        {
            _notifier.OnStageChanged(evt.QuestId, evt.StageId, evt.PreviousStageId);
        }

        private void OnProgress(ObjectiveProgressed evt)
        {
            _notifier.OnObjectiveProgressed(evt.QuestId, evt.ObjectiveId, evt.Current, evt.Required, _now);
        }

        private void OnCompleted(QuestCompleted evt)
        {
            _notifier.OnQuestCompleted(evt.QuestId);
        }

        private void OnFailed(QuestFailed evt)
        {
            _notifier.OnQuestFailed(evt.QuestId);
        }
    }
}
