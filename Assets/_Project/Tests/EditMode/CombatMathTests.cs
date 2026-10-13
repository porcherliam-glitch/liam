using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Angle and distance helpers of the combat logic (yaw 0 = +Z, 90 = +X, like Unity).</summary>
    [TestFixture]
    public sealed class CombatMathTests
    {
        [TestCase(0f, 0f)]
        [TestCase(360f, 0f)]
        [TestCase(-90f, 270f)]
        [TestCase(725f, 5f)]
        public void NormalizeAngle_MapsToZeroTo360(float angle, float expected)
        {
            Assert.That(CombatMath.NormalizeAngle(angle), Is.EqualTo(expected).Within(1e-4f));
        }

        [TestCase(350f, 10f, 20f)]
        [TestCase(10f, 350f, -20f)]
        [TestCase(0f, 180f, 180f)]
        [TestCase(90f, 45f, -45f)]
        public void DeltaAngle_IsShortestSignedDifference(float current, float target, float expected)
        {
            Assert.That(CombatMath.DeltaAngle(current, target), Is.EqualTo(expected).Within(1e-4f));
        }

        [Test]
        public void YawOf_FollowsUnityConvention()
        {
            Assert.That(CombatMath.YawOf(0f, 1f), Is.EqualTo(0f).Within(1e-4f));
            Assert.That(CombatMath.YawOf(1f, 0f), Is.EqualTo(90f).Within(1e-4f));
            Assert.That(CombatMath.YawOf(0f, -1f), Is.EqualTo(180f).Within(1e-4f));
            Assert.That(CombatMath.YawOf(-1f, 0f), Is.EqualTo(270f).Within(1e-4f));
        }

        [Test]
        public void BearingTo_IsRelativeToViewerYaw()
        {
            // Viewer at the origin looking along +X (yaw 90): a point on +Z lies 90 degrees to the left.
            Assert.That(CombatMath.BearingTo(0f, 0f, 90f, 0f, 5f), Is.EqualTo(-90f).Within(1e-3f));
            Assert.That(CombatMath.BearingTo(0f, 0f, 90f, 5f, 0f), Is.EqualTo(0f).Within(1e-3f));
            Assert.That(CombatMath.BearingTo(0f, 0f, 0f, 1f, 1f), Is.EqualTo(45f).Within(1e-3f));
            Assert.That(CombatMath.BearingTo(2f, 2f, 0f, 2f, 2f), Is.EqualTo(0f), "Same position counts as in front.");
        }

        [Test]
        public void PlanarDistance_IgnoresHeight()
        {
            Assert.That(CombatMath.PlanarDistance(0f, 0f, 3f, 4f), Is.EqualTo(5f).Within(1e-5f));
        }

        [Test]
        public void MoveTowardsAngle_TurnsTheShortWayAndClamps()
        {
            Assert.That(CombatMath.MoveTowardsAngle(350f, 20f, 10f), Is.EqualTo(0f).Within(1e-4f));
            Assert.That(CombatMath.MoveTowardsAngle(350f, 20f, 90f), Is.EqualTo(20f).Within(1e-4f));
            Assert.That(CombatMath.ClampTurn(0f, 90f, 45f), Is.EqualTo(45f).Within(1e-4f));
            Assert.That(CombatMath.ClampTurn(0f, 90f, -5f), Is.EqualTo(0f).Within(1e-4f));
        }
    }
}
