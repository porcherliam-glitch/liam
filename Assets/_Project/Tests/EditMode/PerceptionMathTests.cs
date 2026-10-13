using Aetherfall.AI;
using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Perception (GDD 03 9.2): main cone ±50 degrees up to 22 m, periphery ±80 degrees up to 10 m at half rate, 2.5 m all
    /// around; rate 100 × (1 − distance ÷ range) × light × stance × cover × variant; noise radii by stance.
    /// </summary>
    [TestFixture]
    public sealed class PerceptionMathTests
    {
        private static readonly PerceptionSettings Settings = PerceptionSettings.Default;

        [TestCase(10f, 0f, true)]
        [TestCase(21.9f, 49f, true)]
        [TestCase(10f, 51f, true)]
        [TestCase(12f, 51f, false)]
        [TestCase(9f, 79f, true)]
        [TestCase(9f, 81f, false)]
        [TestCase(2.4f, 180f, true)]
        [TestCase(23f, 0f, false)]
        public void IsInSight_ConeAndRanges(float distance, float bearing, bool expected)
        {
            Assert.That(PerceptionMath.IsInSight(distance, bearing, Settings), Is.EqualTo(expected));
            Assert.That(PerceptionMath.IsInSight(distance, -bearing, Settings), Is.EqualTo(expected), "Cone is symmetric.");
        }

        [Test]
        public void SightRate_GddExampleSneakingAtFiveMetres()
        {
            // GDD 03 9.2: 100 × 0.77 × 1 × 0.5 = 38 per second -> suspicious after 0.8 s, combat after 2.6 s.
            float rate = PerceptionMath.SightRate(5f, 0f, Settings, PerceptionStance.Sneak);

            Assert.That(rate, Is.EqualTo(38.6f).Within(0.1f));
            Assert.That(PerceptionMath.SuspiciousThreshold / rate, Is.EqualTo(0.78f).Within(0.02f));
            Assert.That(PerceptionMath.CombatThreshold / rate, Is.EqualTo(2.59f).Within(0.02f));
        }

        [Test]
        public void SightRate_PeripheryIsHalfRate()
        {
            float main = PerceptionMath.SightRate(8f, 40f, Settings, PerceptionStance.Walk);
            float periphery = PerceptionMath.SightRate(8f, 70f, Settings, PerceptionStance.Walk);

            Assert.That(periphery, Is.EqualTo(main * 0.5f).Within(1e-3f));
        }

        [Test]
        public void SightRate_OutsideIsZero()
        {
            Assert.That(PerceptionMath.SightRate(15f, 120f, Settings, PerceptionStance.Sprint), Is.EqualTo(0f));
            Assert.That(PerceptionMath.SightRate(30f, 0f, Settings, PerceptionStance.Sprint), Is.EqualTo(0f));
        }

        [Test]
        public void SightRate_LightCoverAndWildAnimalFactor()
        {
            var wolf = new PerceptionSettings(50f, 22f, 80f, 10f, 2.5f, 1.5f, 1f);
            float day = PerceptionMath.SightRate(11f, 0f, Settings, PerceptionStance.Run);

            Assert.That(day, Is.EqualTo(50f).Within(1e-3f));
            Assert.That(PerceptionMath.SightRate(11f, 0f, Settings, PerceptionStance.Run, 0.4f), Is.EqualTo(20f).Within(1e-3f));
            Assert.That(PerceptionMath.SightRate(11f, 0f, Settings, PerceptionStance.Run, 1f, 0.5f), Is.EqualTo(25f).Within(1e-3f));
            Assert.That(PerceptionMath.SightRate(11f, 0f, wolf, PerceptionStance.Run), Is.EqualTo(75f).Within(1e-3f));
        }

        [Test]
        public void StanceFactors_FollowTheGdd()
        {
            Assert.That(PerceptionMath.StanceFactor(PerceptionStance.Sneak), Is.EqualTo(0.5f));
            Assert.That(PerceptionMath.StanceFactor(PerceptionStance.Walk), Is.EqualTo(0.8f));
            Assert.That(PerceptionMath.StanceFactor(PerceptionStance.Run), Is.EqualTo(1.0f));
            Assert.That(PerceptionMath.StanceFactor(PerceptionStance.Sprint), Is.EqualTo(1.3f));
            Assert.That(PerceptionMath.StanceFactor(PerceptionStance.Combat), Is.EqualTo(1.5f));
        }

        [Test]
        public void InstantDetection_RunningClose_ButNotSneaking()
        {
            Assert.That(PerceptionMath.IsInstantDetection(2f, Settings, PerceptionStance.Run), Is.True);
            Assert.That(PerceptionMath.IsInstantDetection(2f, Settings, PerceptionStance.Sprint), Is.True);
            Assert.That(PerceptionMath.IsInstantDetection(2f, Settings, PerceptionStance.Sneak), Is.False);
            Assert.That(PerceptionMath.IsInstantDetection(3f, Settings, PerceptionStance.Sprint), Is.False);
        }

        [Test]
        public void NoiseRadii_FollowTheGdd()
        {
            Assert.That(PerceptionMath.NoiseRadius(PerceptionStance.Still), Is.EqualTo(0f));
            Assert.That(PerceptionMath.NoiseRadius(PerceptionStance.Sneak), Is.EqualTo(2f));
            Assert.That(PerceptionMath.NoiseRadius(PerceptionStance.Walk), Is.EqualTo(5f));
            Assert.That(PerceptionMath.NoiseRadius(PerceptionStance.Run), Is.EqualTo(10f));
            Assert.That(PerceptionMath.NoiseRadius(PerceptionStance.Sprint), Is.EqualTo(15f));
            Assert.That(PerceptionMath.NoiseRadius(PerceptionStance.Combat), Is.EqualTo(25f));
        }

        [Test]
        public void Noise_SetsAtLeastFortyAndSeventyInTheInnerHalf()
        {
            Assert.That(PerceptionMath.NoiseDetection(12f, 15f), Is.EqualTo(40f));
            Assert.That(PerceptionMath.NoiseDetection(7f, 15f), Is.EqualTo(70f));
            Assert.That(PerceptionMath.NoiseDetection(16f, 15f), Is.EqualTo(0f));
            Assert.That(PerceptionMath.NoiseDetection(1f, 0f), Is.EqualTo(0f));
        }
    }
}
