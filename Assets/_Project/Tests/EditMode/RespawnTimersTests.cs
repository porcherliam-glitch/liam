using Aetherfall.AI;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Automatic respawn of the test arena (<see cref="RespawnTimers"/>): dead enemies come back after the delay.</summary>
    [TestFixture]
    public sealed class RespawnTimersTests
    {
        [Test]
        public void DeadEnemy_RespawnsAfterTheDelay()
        {
            var timers = new RespawnTimers();

            Assert.That(timers.Advance(0, true, 10f, 30f), Is.False);
            Assert.That(timers.Advance(0, true, 10f, 30f), Is.False);
            Assert.That(timers.Advance(0, true, 10f, 30f), Is.True);
            Assert.That(timers.Advance(0, true, 10f, 30f), Is.False, "the timer starts over");
        }

        [Test]
        public void LivingEnemy_ResetsItsTimer()
        {
            var timers = new RespawnTimers();
            timers.Advance(1, true, 25f, 30f);

            Assert.That(timers.Advance(1, false, 1f, 30f), Is.False);
            Assert.That(timers.Advance(1, true, 25f, 30f), Is.False);
            Assert.That(timers.Count, Is.EqualTo(2));
        }

        [Test]
        public void Clear_ForgetsAllTimers()
        {
            var timers = new RespawnTimers();
            timers.EnsureCount(3);
            timers.Advance(2, true, 29f, 30f);
            timers.Clear();

            Assert.That(timers.Advance(2, true, 2f, 30f), Is.False);
        }
    }
}
