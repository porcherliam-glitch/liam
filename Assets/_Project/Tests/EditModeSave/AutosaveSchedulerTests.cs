using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>Autosave timing (GDD 05 5.3, architecture 9.6, <see cref="AutosaveScheduler"/>).</summary>
    [TestFixture]
    public sealed class AutosaveSchedulerTests
    {
        private static AutosaveDecision Run(AutosaveScheduler scheduler, float seconds, bool playtimeRunning, bool allowed, float dt = 1f)
        {
            AutosaveDecision last = AutosaveDecision.None;
            for (float t = 0f; t < seconds - 1e-4f; t += dt)
            {
                AutosaveDecision decision = scheduler.Tick(dt, playtimeRunning, allowed);
                if (decision != AutosaveDecision.None)
                {
                    return decision;
                }
            }

            return last;
        }

        [Test]
        public void Interval_CountsOnlyWhileThePlaytimeRuns()
        {
            var scheduler = new AutosaveScheduler(600f);

            Assert.That(Run(scheduler, 599f, true, true), Is.EqualTo(AutosaveDecision.None));
            Assert.That(Run(scheduler, 300f, false, true), Is.EqualTo(AutosaveDecision.None), "paused: no progress");
            Assert.That(scheduler.Tick(1f, true, true), Is.EqualTo(AutosaveDecision.SaveNow), "after 600 s of playtime");
        }

        [Test]
        public void AnySave_ResetsTheInterval()
        {
            var scheduler = new AutosaveScheduler(600f);
            Run(scheduler, 500f, true, true);

            scheduler.NotifySaved();

            Assert.That(scheduler.IntervalElapsed, Is.EqualTo(0f));
            Assert.That(Run(scheduler, 599f, true, true), Is.EqualTo(AutosaveDecision.None));
        }

        [Test]
        public void AtMostOneAutosavePer60Seconds()
        {
            var scheduler = new AutosaveScheduler(0f);
            scheduler.NotifySaved();
            scheduler.Request();

            Assert.That(Run(scheduler, 59f, true, true), Is.EqualTo(AutosaveDecision.None), "waits for the gap");
            Assert.That(scheduler.IsPending, Is.True);
            Assert.That(scheduler.Tick(1f, true, true), Is.EqualTo(AutosaveDecision.SaveNow));
        }

        [Test]
        public void LockedRequest_WaitsUpTo120Seconds_ThenIsDropped()
        {
            var scheduler = new AutosaveScheduler(0f);
            scheduler.Request();

            Assert.That(Run(scheduler, 120f, true, false), Is.EqualTo(AutosaveDecision.None));
            Assert.That(scheduler.Tick(1f, true, false), Is.EqualTo(AutosaveDecision.Discarded));
            Assert.That(scheduler.IsPending, Is.False);
        }

        [Test]
        public void LockedRequest_IsSavedAsSoonAsSavingIsAllowedAgain()
        {
            var scheduler = new AutosaveScheduler(0f);
            scheduler.Request();
            Run(scheduler, 30f, true, false);

            Assert.That(scheduler.Tick(1f, true, true), Is.EqualTo(AutosaveDecision.SaveNow));
        }

        [Test]
        public void SeveralRequests_CollapseIntoOne_AndDisabledDoesNothing()
        {
            var scheduler = new AutosaveScheduler(0f);
            scheduler.Request();
            scheduler.Request();
            Assert.That(scheduler.Tick(1f, true, true), Is.EqualTo(AutosaveDecision.SaveNow));
            Assert.That(scheduler.Tick(1f, true, true), Is.EqualTo(AutosaveDecision.None));

            scheduler.Enabled = false;
            scheduler.Request();
            Assert.That(Run(scheduler, 200f, true, true), Is.EqualTo(AutosaveDecision.None));
        }
    }
}
