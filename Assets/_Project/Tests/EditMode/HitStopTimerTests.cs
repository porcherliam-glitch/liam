using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Local hitstop (architecture 4.4, GDD 03 4.11): freezes only the local time of one combatant, never more than 150 ms
    /// within 0.5 s; requests do not stack beyond the longest one.
    /// </summary>
    [TestFixture]
    public sealed class HitStopTimerTests
    {
        [Test]
        public void Request_FreezesLocalTime()
        {
            var timer = new HitStopTimer();

            Assert.That(timer.Request(0.06f), Is.EqualTo(0.06f).Within(1e-6f));
            Assert.That(timer.IsFrozen, Is.True);
            Assert.That(timer.TimeScale, Is.EqualTo(0f));
            Assert.That(timer.Tick(0.05f), Is.EqualTo(0f));
        }

        [Test]
        public void FrameCrossingTheEnd_ReturnsTheRest()
        {
            var timer = new HitStopTimer();
            timer.Request(0.06f);
            timer.Tick(0.05f);

            Assert.That(timer.Tick(0.05f), Is.EqualTo(0.04f).Within(1e-5f));
            Assert.That(timer.IsFrozen, Is.False);
            Assert.That(timer.Tick(0.02f), Is.EqualTo(0.02f).Within(1e-6f));
        }

        [Test]
        public void Requests_AreCappedAtOneHundredFiftyMillisecondsPerHalfSecond()
        {
            var timer = new HitStopTimer();

            float total = timer.Request(0.12f);
            timer.Tick(0.12f);
            total += timer.Request(0.12f);

            Assert.That(total, Is.EqualTo(0.15f).Within(1e-5f));
            timer.Tick(0.03f);
            Assert.That(timer.Request(0.1f), Is.EqualTo(0f), "Budget used up within the window.");

            timer.Tick(0.5f);
            Assert.That(timer.Request(0.1f), Is.EqualTo(0.1f).Within(1e-5f), "The window has passed.");
        }

        [Test]
        public void OverlappingRequests_DoNotStack()
        {
            var timer = new HitStopTimer();
            timer.Request(0.08f);

            Assert.That(timer.Request(0.06f), Is.EqualTo(0f));
            Assert.That(timer.Remaining, Is.EqualTo(0.08f).Within(1e-6f));
            Assert.That(timer.Request(0.1f), Is.EqualTo(0.02f).Within(1e-5f), "Only the difference to the longer request.");
        }

        [Test]
        public void Clear_EndsTheFreeze()
        {
            var timer = new HitStopTimer();
            timer.Request(0.1f);

            timer.Clear();

            Assert.That(timer.IsFrozen, Is.False);
            Assert.That(timer.Tick(0.016f), Is.EqualTo(0.016f).Within(1e-6f));
        }
    }
}
