using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// "In combat" rule of GDD 05 5.2: an enemy is engaged with the player, or damage was dealt or taken in the last 5 s.
    /// </summary>
    [TestFixture]
    public sealed class CombatStateTrackerTests
    {
        [Test]
        public void EngagedEnemy_StartsAndEndsCombat()
        {
            var tracker = new CombatStateTracker();
            var changes = new System.Collections.Generic.List<bool>();
            tracker.Changed += changes.Add;
            object wolf = new object();

            tracker.SetEngaged(wolf, true);
            Assert.That(tracker.InCombat, Is.True);

            tracker.SetEngaged(wolf, false);
            Assert.That(tracker.InCombat, Is.False);
            Assert.That(changes, Is.EqualTo(new[] { true, false }));
        }

        [Test]
        public void DamageExchange_KeepsCombatForFiveSeconds()
        {
            var tracker = new CombatStateTracker();

            tracker.NotifyDamageExchange();
            tracker.Tick(4.9f);
            Assert.That(tracker.InCombat, Is.True);

            tracker.Tick(0.2f);
            Assert.That(tracker.InCombat, Is.False);
        }

        [Test]
        public void SeveralEnemies_CombatEndsWithTheLast()
        {
            var tracker = new CombatStateTracker();
            object first = new object();
            object second = new object();
            tracker.SetEngaged(first, true);
            tracker.SetEngaged(second, true);
            tracker.SetEngaged(first, true);

            tracker.SetEngaged(first, false);
            Assert.That(tracker.InCombat, Is.True);
            Assert.That(tracker.EngagedCount, Is.EqualTo(1));

            tracker.SetEngaged(second, false);
            Assert.That(tracker.InCombat, Is.False);
        }

        [Test]
        public void Reset_EndsCombatAtOnce()
        {
            var tracker = new CombatStateTracker();
            tracker.SetEngaged(new object(), true);
            tracker.NotifyDamageExchange();

            tracker.Reset();

            Assert.That(tracker.InCombat, Is.False);
            Assert.That(tracker.EngagedCount, Is.EqualTo(0));
        }

        [Test]
        public void NoChange_RaisesNoEvent()
        {
            var tracker = new CombatStateTracker();
            int count = 0;
            tracker.Changed += inCombat => count++;

            tracker.Tick(1f);
            tracker.SetEngaged(null, true);

            Assert.That(count, Is.EqualTo(0));
        }
    }
}
