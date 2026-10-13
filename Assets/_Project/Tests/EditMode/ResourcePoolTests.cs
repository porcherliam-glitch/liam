using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="ResourcePool"/> with the stamina rules of GDD 03 4.3 (spend while above 0, never below 0, exhausted for
    /// 1.2 s at 0, 25 per second after 0.8 s) and the health regeneration of 10.3 (1 % per second after 8 s).
    /// </summary>
    [TestFixture]
    public sealed class ResourcePoolTests
    {
        private static void Run(ResourcePool pool, float seconds, float dt = 0.02f)
        {
            int steps = (int)System.Math.Round(seconds / dt);
            for (int i = 0; i < steps; i++)
            {
                pool.Tick(dt);
            }
        }

        [Test]
        public void StartsFull()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            Assert.That(pool.Current, Is.EqualTo(100f));
            Assert.That(pool.IsFull, Is.True);
            Assert.That(pool.Normalized, Is.EqualTo(1f));
        }

        [Test]
        public void TrySpend_IsAllowedWhileAboveZero_AndNeverGoesBelowZero()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.SetCurrent(5f);

            Assert.That(pool.TrySpend(10f), Is.True, "allowed with 5 left");
            Assert.That(pool.Current, Is.EqualTo(0f), "clamped at 0");
            Assert.That(pool.TrySpend(10f), Is.False, "refused at 0");
            Assert.That(pool.Current, Is.EqualTo(0f));
        }

        [Test]
        public void ReachingZero_StartsTheExhaustionLockFor1Point2Seconds()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.Spend(100f);

            Assert.That(pool.IsExhausted, Is.True);
            Run(pool, 1.1f);
            Assert.That(pool.IsExhausted, Is.True, "still exhausted after 1.1 s");
            Run(pool, 0.12f);
            Assert.That(pool.IsExhausted, Is.False, "free after 1.2 s");
        }

        [Test]
        public void Regeneration_Starts0Point8SecondsAfterSpending_With25PerSecond()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.Spend(50f);

            Run(pool, 0.8f);
            Assert.That(pool.Current, Is.EqualTo(50f).Within(1e-3f), "no regeneration during the delay");

            Run(pool, 1f);
            Assert.That(pool.Current, Is.EqualTo(75f).Within(0.01f), "25 per second");

            Run(pool, 2f);
            Assert.That(pool.Current, Is.EqualTo(100f), "stops at the maximum");
        }

        [TestCase(0.005f)]
        [TestCase(0.05f)]
        [TestCase(0.3f)]
        public void Regeneration_DoesNotDependOnTheFrameRate(float dt)
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.Spend(80f);

            Run(pool, 1.8f, dt);

            Assert.That(pool.Current, Is.EqualTo(45f).Within(0.05f), "20 + 25 × (1.8 − 0.8)");
        }

        [Test]
        public void SpendingAgain_RestartsTheDelay()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.Spend(10f);
            Run(pool, 0.6f);
            pool.Spend(10f);
            Run(pool, 0.6f);

            Assert.That(pool.Current, Is.EqualTo(80f).Within(1e-3f));
        }

        [Test]
        public void HealthRegeneration_IsOnePercentPerSecondAfter8Seconds_AndOffWithMultiplierZero()
        {
            var pool = new ResourcePool(200f, ResourcePoolSettings.Health);
            pool.Spend(100f);

            Run(pool, 8f, 0.1f);
            Assert.That(pool.Current, Is.EqualTo(100f).Within(1e-3f));
            Run(pool, 5f, 0.1f);
            Assert.That(pool.Current, Is.EqualTo(110f).Within(0.01f), "2 per second (1 % of 200)");

            pool.RegenMultiplier = 0f; // in combat
            Run(pool, 5f, 0.1f);
            Assert.That(pool.Current, Is.EqualTo(110f).Within(0.01f));
        }

        [Test]
        public void MaxFromStat_FollowsModifiers_AndCapsTheCurrentValue()
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Constitution, 10f);
            stats.SetBase(StatId.Level, 1f);
            var pool = new ResourcePool(stats, StatId.MaxStamina, ResourcePoolSettings.Stamina, StatId.StaminaRegen);
            Assert.That(pool.Max, Is.EqualTo(100f));

            stats.AddModifier(StatModifier.Flat(StatId.MaxStamina, 30f, "skill:kampfgeist"));
            Assert.That(pool.Max, Is.EqualTo(130f));
            Assert.That(pool.Current, Is.EqualTo(100f), "a higher maximum does not fill up");

            stats.RemoveAllFromSource("skill:kampfgeist");
            stats.AddModifier(StatModifier.Flat(StatId.MaxStamina, -40f, "debuff"));
            Assert.That(pool.Current, Is.EqualTo(60f), "capped at the lower maximum");

            stats.AddModifier(StatModifier.PercentAdd(StatId.StaminaRegen, -0.25f, "effect:effect.ueberladen"));
            Assert.That(pool.RegenPerSecond, Is.EqualTo(18.75f).Within(1e-4f), "overloaded: −25 % regeneration");
        }

        [Test]
        public void SetCurrent_ClampsAndClearsExhaustionAndDelay()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.Spend(100f);
            pool.SetCurrent(150f);

            Assert.That(pool.Current, Is.EqualTo(100f));
            Assert.That(pool.IsExhausted, Is.False);
            Assert.That(float.IsPositiveInfinity(pool.TimeSinceSpend), Is.True);
        }

        [Test]
        public void Changed_IsRaisedOnlyWhenTheValueChanges()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            int calls = 0;
            pool.Changed += _ => calls++;

            pool.Restore(10f); // already full
            pool.Spend(0f);
            Assert.That(calls, Is.EqualTo(0));

            pool.Spend(10f);
            pool.Restore(5f);
            Assert.That(calls, Is.EqualTo(2));
        }

        [Test]
        public void HasAtLeast_ChecksTheSprintMinimum()
        {
            var pool = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            pool.SetCurrent(9.9f);
            Assert.That(pool.HasAtLeast(10f), Is.False);
            pool.SetCurrent(10f);
            Assert.That(pool.HasAtLeast(10f), Is.True);
        }
    }
}
