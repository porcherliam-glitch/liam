using System.Collections.Generic;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for the small list helpers of the journal and the tracker: <see cref="ListWindow"/> (scrolling),
    /// <see cref="ObjectiveCheckTracker"/> (flash when an objective is ticked off) and <see cref="RecentObjectiveList"/>
    /// (fulfilled objectives linger after their stage ended).
    /// </summary>
    [TestFixture]
    public sealed class UiListLogicTests
    {
        [Test]
        public void ListWindow_FollowsTheFocus_AndShowsMoreMarks()
        {
            var window = new ListWindow(5);
            window.SetCount(3);
            Assert.That(window.HasMoreAbove || window.HasMoreBelow, Is.False);
            Assert.That(window.IsVisible(2), Is.True);

            window.SetCount(8);
            Assert.That(window.HasMoreBelow, Is.True);
            Assert.That(window.EnsureVisible(6), Is.True);
            Assert.That(window.First, Is.EqualTo(2));
            Assert.That(window.IsVisible(1), Is.False);
            Assert.That(window.IsVisible(6), Is.True);
            Assert.That(window.HasMoreAbove && window.HasMoreBelow, Is.True);

            Assert.That(window.EnsureVisible(4), Is.False, "already visible: no jump");
            window.EnsureVisible(0);
            Assert.That(window.First, Is.EqualTo(0));

            window.EnsureVisible(7);
            window.SetCount(4);
            Assert.That(window.First, Is.EqualTo(0), "a shorter list pulls the window back");
            Assert.That(window.EnsureVisible(9), Is.False, "outside the list");
        }

        [Test]
        public void CheckTracker_FlashesOnlyWhenAShownObjectiveGetsDone()
        {
            var tracker = new ObjectiveCheckTracker();
            string key = ObjectiveCheckTracker.KeyOf("quest.side.test", "s10.o1");

            Assert.That(tracker.Observe(key, true), Is.False, "first sight: no flash (journal opened, game loaded)");
            Assert.That(tracker.IsFlashing(key), Is.False);

            string other = ObjectiveCheckTracker.KeyOf("quest.side.test", "s20.o1");
            Assert.That(tracker.Observe(other, false), Is.False);
            Assert.That(tracker.Observe(other, true), Is.True);
            Assert.That(tracker.IsFlashing(other), Is.True);
            Assert.That(tracker.Observe(other, true), Is.False, "stays done: no second flash");

            Assert.That(tracker.Tick(ObjectiveCheckTracker.FlashSeconds - 0.1f), Is.False);
            Assert.That(tracker.IsFlashing(other), Is.True);
            Assert.That(tracker.Tick(0.2f), Is.True);
            Assert.That(tracker.IsFlashing(other), Is.False);

            tracker.Forget();
            Assert.That(tracker.Observe(other, true), Is.False);
        }

        [Test]
        public void RecentObjectives_LingerInFront_UntilTheirTimeIsOver()
        {
            var recent = new RecentObjectiveList();
            var done = new QuestObjectiveLine("s10.o1", "Wölfe besiegen", 3, 3, true, false, false);
            recent.Add("quest.side.test", done);

            var lines = new List<QuestObjectiveLine> { new QuestObjectiveLine("s20.o1", "Wolfsfell aufheben", 0, 1, false, false, false) };
            Assert.That(recent.InsertMissing("quest.side.test", lines), Is.EqualTo(1));
            Assert.That(lines[0].Key, Is.EqualTo("s10.o1"));
            Assert.That(lines[0].Done, Is.True);
            Assert.That(recent.InsertMissing("quest.side.test", lines), Is.EqualTo(0), "already in the list");
            Assert.That(recent.InsertMissing("quest.other", new List<QuestObjectiveLine>()), Is.EqualTo(0));

            var ids = new List<string>();
            recent.CollectQuestIds(ids);
            Assert.That(ids, Is.EqualTo(new[] { "quest.side.test" }));

            Assert.That(recent.Tick(RecentObjectiveList.LingerSeconds - 0.1f), Is.False);
            Assert.That(recent.Tick(0.2f), Is.True);
            Assert.That(recent.Count, Is.EqualTo(0));
        }
    }
}
