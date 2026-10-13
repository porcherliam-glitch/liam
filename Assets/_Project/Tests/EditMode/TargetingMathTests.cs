using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Lock-on target choice (GDD 03 2.3): cone ±30 degrees, 25 m, score from angle (60 %) and distance (40 %); switching
    /// picks the nearest target on the flicked side; the lock-on camera distance grows with target size and distance.
    /// </summary>
    [TestFixture]
    public sealed class TargetingMathTests
    {
        [Test]
        public void Score_OutsideConeOrRange_IsNegative()
        {
            Assert.That(TargetingMath.Score(31f, 5f, 30f, 25f), Is.LessThan(0f));
            Assert.That(TargetingMath.Score(0f, 26f, 30f, 25f), Is.LessThan(0f));
            Assert.That(TargetingMath.Score(-30f, 25f, 30f, 25f), Is.EqualTo(1f).Within(1e-5f));
            Assert.That(TargetingMath.Score(0f, 0f, 30f, 25f), Is.EqualTo(0f));
        }

        [Test]
        public void SelectBest_PrefersCentredTargets()
        {
            // Wolf A: 20 degrees, 5 m -> 0.6*0.667 + 0.4*0.2 = 0.48; wolf B: 2 degrees, 12 m -> 0.04 + 0.192 = 0.232.
            float[] bearings = { 20f, 2f, 60f };
            float[] distances = { 5f, 12f, 2f };

            Assert.That(TargetingMath.SelectBest(bearings, distances, 3, 30f, 25f), Is.EqualTo(1));
        }

        [Test]
        public void SelectBest_WithoutCandidateInCone_ReturnsMinusOne()
        {
            float[] bearings = { 60f, -45f };
            float[] distances = { 3f, 3f };

            Assert.That(TargetingMath.SelectBest(bearings, distances, 2, 30f, 25f), Is.EqualTo(-1));
            Assert.That(TargetingMath.SelectBest(bearings, distances, 0, 30f, 25f), Is.EqualTo(-1));
        }

        [Test]
        public void SelectSwitch_PicksNearestOnFlickedSide()
        {
            float[] bearings = { -40f, 15f, 50f, -5f };

            Assert.That(TargetingMath.SelectSwitch(0f, bearings, 4, 1f), Is.EqualTo(1));
            Assert.That(TargetingMath.SelectSwitch(0f, bearings, 4, -1f), Is.EqualTo(3));
            Assert.That(TargetingMath.SelectSwitch(60f, bearings, 4, 1f), Is.EqualTo(-1), "Nothing further right.");
            Assert.That(TargetingMath.SelectSwitch(0f, bearings, 4, 0f), Is.EqualTo(-1));
        }

        [Test]
        public void LockOnCameraDistance_IsClampedBetweenFourAndAHalfAndSeven()
        {
            Assert.That(TargetingMath.LockOnCameraDistance(1f, 3f), Is.EqualTo(5.05f).Within(1e-4f));
            Assert.That(TargetingMath.LockOnCameraDistance(0f, 0f), Is.EqualTo(4.5f).Within(1e-4f));
            Assert.That(TargetingMath.LockOnCameraDistance(10f, 20f), Is.EqualTo(7f).Within(1e-4f));
        }
    }
}
