using System.Collections.Generic;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for <see cref="NotificationQueue"/> and <see cref="NotificationRules"/> (GDD 05 1.7).</summary>
    [TestFixture]
    public sealed class NotificationQueueTests
    {
        private NotificationQueue _queue;
        private double _now;

        [SetUp]
        public void SetUp()
        {
            _queue = new NotificationQueue();
            _now = 10d;
        }

        [Test]
        public void Rules_MaxVisibleAndBaseDurations()
        {
            Assert.That(NotificationRules.MaxVisible(NotificationPriority.Milestone), Is.EqualTo(1));
            Assert.That(NotificationRules.MaxVisible(NotificationPriority.Progress), Is.EqualTo(2));
            Assert.That(NotificationRules.MaxVisible(NotificationPriority.Loot), Is.EqualTo(5));
            Assert.That(NotificationRules.BaseDuration(NotificationPriority.Milestone, NotificationKind.Message), Is.EqualTo(4f));
            Assert.That(NotificationRules.BaseDuration(NotificationPriority.Milestone, NotificationKind.LevelUp), Is.EqualTo(3f));
            Assert.That(NotificationRules.BaseDuration(NotificationPriority.Progress, NotificationKind.Message), Is.EqualTo(3f));
            Assert.That(NotificationRules.BaseDuration(NotificationPriority.Loot, NotificationKind.Item), Is.EqualTo(2.5f));
        }

        [Test]
        public void Rules_ReadingTimeAndFactor()
        {
            // 60 characters: 1.0 + 3.6 = 4.6 s > 2.5 s base.
            Assert.That(NotificationRules.Duration(NotificationPriority.Loot, NotificationKind.Item, 60, 1f), Is.EqualTo(4.6f).Within(0.001f));
            Assert.That(NotificationRules.Duration(NotificationPriority.Loot, NotificationKind.Item, 5, 1f), Is.EqualTo(2.5f));
            Assert.That(NotificationRules.Duration(NotificationPriority.Loot, NotificationKind.Item, 5, 2f), Is.EqualTo(5f));
            Assert.That(NotificationRules.Duration(NotificationPriority.Loot, NotificationKind.Item, 5, 0f), Is.EqualTo(2.5f));
        }

        [Test]
        public void Rules_TextsFromTheTable()
        {
            Assert.That(NotificationRules.FormatText(NotificationKind.Item, "Eisenerz", 3), Is.EqualTo("Eisenerz ×3"));
            Assert.That(NotificationRules.FormatText(NotificationKind.Item, "Eisenerz", 1), Is.EqualTo("Eisenerz"));
            Assert.That(NotificationRules.FormatText(NotificationKind.Currency, "Gold", 23), Is.EqualTo("+23 Gold"));
            Assert.That(NotificationRules.FormatText(NotificationKind.Currency, "Gold", -5), Is.EqualTo("−5 Gold"));
            Assert.That(NotificationRules.FormatText(NotificationKind.Experience, string.Empty, 50), Is.EqualTo("+50 EP"));
            Assert.That(NotificationRules.FormatText(NotificationKind.LevelUp, string.Empty, 4), Is.EqualTo("Stufe 4 erreicht!"));
            Assert.That(NotificationRules.FormatText(NotificationKind.Summary, string.Empty, 12), Is.EqualTo("+12 Gegenstände"));
        }

        [Test]
        public void Messages_AppearInTheirClass_UpToTheMaximum()
        {
            for (int i = 0; i < 7; i++)
            {
                _queue.Enqueue(Notification.Item("Item " + i, "item." + i, 1, string.Empty), _now);
            }

            _queue.Update(_now, 0f);

            Assert.That(_queue.Visible(NotificationPriority.Loot).Count, Is.EqualTo(5));
            Assert.That(_queue.PendingCount, Is.EqualTo(2));
            Assert.That(_queue.Visible(NotificationPriority.Loot)[0].DisplayText, Is.EqualTo("Item 0"), "oldest first, newest at the bottom");
        }

        [Test]
        public void Messages_ExpireAfterTheirDuration_AndWaitingOnesFollow()
        {
            _queue.Enqueue(Notification.Message(NotificationPriority.Milestone, "Erste"), _now);
            _queue.Enqueue(Notification.Message(NotificationPriority.Milestone, "Zweite"), _now);
            _queue.Update(_now, 0f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone)[0].DisplayText, Is.EqualTo("Erste"));

            _queue.Update(_now + 3.9, 3.9f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone)[0].DisplayText, Is.EqualTo("Erste"));
            _queue.Update(_now + 4.1, 0.2f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone)[0].DisplayText, Is.EqualTo("Zweite"));
        }

        [Test]
        public void SameItemWithinThreeSeconds_IsMerged_AndTheTimerRestarts()
        {
            _queue.Enqueue(Notification.Item("Eisenerz", "item.eisenerz", 1, string.Empty), _now);
            _queue.Update(_now, 0f);
            _queue.Update(_now + 2, 2f);
            int revision = _queue.Revision;

            _queue.Enqueue(Notification.Item("Eisenerz", "item.eisenerz", 2, string.Empty), _now + 2);

            IReadOnlyList<ActiveNotification> visible = _queue.Visible(NotificationPriority.Loot);
            Assert.That(visible.Count, Is.EqualTo(1));
            Assert.That(visible[0].DisplayText, Is.EqualTo("Eisenerz ×3"));
            Assert.That(visible[0].Remaining, Is.EqualTo(visible[0].Duration), "timer restarts");
            Assert.That(_queue.Revision, Is.GreaterThan(revision));
        }

        [Test]
        public void SameItemAfterMoreThanThreeSeconds_IsANewMessage()
        {
            _queue.Enqueue(Notification.Item("Eisenerz", "item.eisenerz", 1, string.Empty), _now);
            _queue.Update(_now, 0f);
            _queue.Enqueue(Notification.Item("Eisenerz", "item.eisenerz", 1, string.Empty), _now + 3.5);
            _queue.Update(_now + 3.5, 3.5f);
            Assert.That(_queue.Visible(NotificationPriority.Loot).Count, Is.EqualTo(1), "the first one expired after 2.5 s");
            Assert.That(_queue.Visible(NotificationPriority.Loot)[0].DisplayText, Is.EqualTo("Eisenerz"));
        }

        [Test]
        public void GoldAndExperienceAreSummed()
        {
            _queue.Enqueue(Notification.Currency("Gold", "currency.gold", 10), _now);
            _queue.Enqueue(Notification.Currency("Gold", "currency.gold", 13), _now + 1);
            _queue.Enqueue(Notification.Experience(20), _now + 1);
            _queue.Enqueue(Notification.Experience(30), _now + 2);
            _queue.Update(_now + 2, 0f);

            IReadOnlyList<ActiveNotification> visible = _queue.Visible(NotificationPriority.Loot);
            Assert.That(visible.Count, Is.EqualTo(2));
            Assert.That(visible[0].DisplayText, Is.EqualTo("+23 Gold"));
            Assert.That(visible[1].DisplayText, Is.EqualTo("+50 EP"));
        }

        [Test]
        public void Overflow_CondensesLootButNeverDropsMilestonesOrProgress()
        {
            _queue.SetSuppressed(true);
            for (int i = 0; i < 5; i++)
            {
                _queue.Enqueue(Notification.Message(NotificationPriority.Milestone, "Quest " + i), _now);
                _queue.Enqueue(Notification.Message(NotificationPriority.Progress, "Fortschritt " + i), _now);
            }

            for (int i = 0; i < 25; i++)
            {
                _queue.Enqueue(Notification.Item("Item " + i, "item." + i, 1, string.Empty), _now);
            }

            Assert.That(_queue.PendingCount, Is.LessThanOrEqualTo(NotificationRules.MaxQueued));
            _queue.SetSuppressed(false);
            _queue.Update(_now, 0f);
            IReadOnlyList<ActiveNotification> loot = _queue.Visible(NotificationPriority.Loot);
            Assert.That(loot[0].Kind, Is.EqualTo(NotificationKind.Summary));
            Assert.That(loot[0].DisplayText, Does.StartWith("+"));
            Assert.That(_queue.Visible(NotificationPriority.Milestone)[0].DisplayText, Is.EqualTo("Quest 0"));
            Assert.That(_queue.PendingCount, Is.GreaterThanOrEqualTo(4 + 3), "the remaining milestones and progress messages wait");
        }

        [Test]
        public void Suppressed_BuffersUntilReleased()
        {
            _queue.SetSuppressed(true);
            _queue.Enqueue(Notification.Message(NotificationPriority.Progress, "Gespeichert"), _now);
            _queue.Update(_now, 0.1f);
            Assert.That(_queue.Visible(NotificationPriority.Progress).Count, Is.EqualTo(0));

            _queue.SetSuppressed(false);
            _queue.Update(_now + 1, 0.1f);
            Assert.That(_queue.Visible(NotificationPriority.Progress).Count, Is.EqualTo(1));
        }

        [Test]
        public void BufferedLootOlderThanThirtySeconds_IsCondensed()
        {
            _queue.SetSuppressed(true);
            _queue.Enqueue(Notification.Item("Alt", "item.alt", 2, string.Empty), _now);
            _queue.Enqueue(Notification.Item("Neu", "item.neu", 1, string.Empty), _now + 40);
            _queue.SetSuppressed(false);
            _queue.Update(_now + 41, 0f);

            IReadOnlyList<ActiveNotification> loot = _queue.Visible(NotificationPriority.Loot);
            Assert.That(loot.Count, Is.EqualTo(2));
            Assert.That(loot[0].DisplayText, Is.EqualTo("+2 Gegenstände"));
            Assert.That(loot[1].DisplayText, Is.EqualTo("Neu"));
        }

        [Test]
        public void InCombat_MilestonesWait_ExceptLevelUpAndWarnings()
        {
            _queue.SetInCombat(true, _now);
            _queue.Enqueue(Notification.Message(NotificationPriority.Milestone, "Quest abgeschlossen"), _now);
            _queue.Update(_now, 0f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone).Count, Is.EqualTo(0));

            _queue.Enqueue(Notification.LevelUp(5), _now);
            _queue.Update(_now, 0f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone)[0].Kind, Is.EqualTo(NotificationKind.LevelUp));

            _queue.Update(_now + 3.5, 3.5f);
            _queue.SetInCombat(false, _now + 3.5);
            _queue.Update(_now + 5, 0f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone).Count, Is.EqualTo(0), "3 s after combat end not reached");
            _queue.Update(_now + 7, 0f);
            Assert.That(_queue.Visible(NotificationPriority.Milestone)[0].DisplayText, Is.EqualTo("Quest abgeschlossen"));
        }

        [Test]
        public void Filter_HidesClasses_ButKeepsTheHistory()
        {
            _queue.Filter = NotificationFilter.Minimal;
            _queue.Enqueue(Notification.Item("Fell", "item.fell", 1, string.Empty), _now);
            _queue.Enqueue(Notification.Message(NotificationPriority.Progress, "Fortschritt"), _now);
            _queue.Enqueue(Notification.LevelUp(2), _now);
            _queue.Update(_now, 0f);

            Assert.That(_queue.Visible(NotificationPriority.Loot).Count, Is.EqualTo(0));
            Assert.That(_queue.Visible(NotificationPriority.Progress).Count, Is.EqualTo(0));
            Assert.That(_queue.Visible(NotificationPriority.Milestone).Count, Is.EqualTo(1));
            Assert.That(new List<string>(_queue.History).Count, Is.EqualTo(3));
        }

        [Test]
        public void History_KeepsTheLastFifty()
        {
            for (int i = 0; i < 60; i++)
            {
                _queue.Enqueue(Notification.Message(NotificationPriority.Progress, "M" + i), _now);
            }

            var history = new List<string>(_queue.History);
            Assert.That(history.Count, Is.EqualTo(NotificationRules.HistorySize));
            Assert.That(history[0], Is.EqualTo("M10"));
        }

        [Test]
        public void Clear_RemovesWaitingAndVisible()
        {
            _queue.Enqueue(Notification.Message(NotificationPriority.Progress, "A"), _now);
            _queue.Update(_now, 0f);
            _queue.Enqueue(Notification.Message(NotificationPriority.Progress, "B"), _now);
            _queue.Clear();
            Assert.That(_queue.PendingCount, Is.EqualTo(0));
            Assert.That(_queue.Visible(NotificationPriority.Progress).Count, Is.EqualTo(0));
        }
    }
}
