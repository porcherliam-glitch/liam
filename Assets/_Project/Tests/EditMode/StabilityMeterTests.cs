using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Stability of the player (GDD 03 4.9): poise damage within 3 s summed up; reaching the stability = stagger, a single
    /// hit of at least twice the stability = knockdown; hyper armor raises the threshold.
    /// </summary>
    [TestFixture]
    public sealed class StabilityMeterTests
    {
        [Test]
        public void SumWithinWindow_Staggers()
        {
            var meter = new StabilityMeter(20f);

            Assert.That(meter.Apply(12f), Is.EqualTo(StaggerKind.None));
            meter.Tick(1f);
            Assert.That(meter.Apply(9f), Is.EqualTo(StaggerKind.Stagger));
            Assert.That(meter.RecentSum, Is.EqualTo(0f), "Cleared after a stagger.");
        }

        [Test]
        public void OldDamage_LeavesTheWindow()
        {
            var meter = new StabilityMeter(20f);
            meter.Apply(12f);

            meter.Tick(3.1f);

            Assert.That(meter.Apply(9f), Is.EqualTo(StaggerKind.None));
            Assert.That(meter.RecentSum, Is.EqualTo(9f));
        }

        [Test]
        public void SingleHitOfTwiceStability_KnocksDown()
        {
            var meter = new StabilityMeter(20f);

            Assert.That(meter.Apply(40f), Is.EqualTo(StaggerKind.Knockdown));
        }

        [Test]
        public void HyperArmor_RaisesThreshold()
        {
            var meter = new StabilityMeter(20f);

            Assert.That(meter.Apply(25f, 1.5f), Is.EqualTo(StaggerKind.None));
            Assert.That(meter.Apply(6f, 1.5f), Is.EqualTo(StaggerKind.Stagger));
        }

        [Test]
        public void ZeroDamage_IsIgnored()
        {
            var meter = new StabilityMeter(1f);

            Assert.That(meter.Apply(0f), Is.EqualTo(StaggerKind.None));
            Assert.That(meter.RecentSum, Is.EqualTo(0f));
        }
    }
}
