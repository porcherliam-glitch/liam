using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Choice of the interaction target (<see cref="InteractionSelector"/>): only available objects within the range (2 m) and
    /// in front of the player (±70°, very close objects in any direction), higher priority first, then distance weighted by
    /// the angle.
    /// </summary>
    [TestFixture]
    public sealed class InteractionSelectorTests
    {
        private static int Select(float yaw, params InteractionCandidate[] candidates)
        {
            var list = new List<InteractionCandidate>(candidates);
            return InteractionSelector.SelectBest(list, list.Count, 0f, 0f, 0f, yaw, InteractionSelector.DefaultRange, InteractionSelector.DefaultHalfAngle);
        }

        [Test]
        public void NothingInRange_GivesMinusOne()
        {
            Assert.That(Select(0f, new InteractionCandidate(0f, 0f, 2.5f, 0, true)), Is.EqualTo(-1));
            Assert.That(Select(0f), Is.EqualTo(-1));
            Assert.That(InteractionSelector.SelectBest(null, 0, 0f, 0f, 0f, 0f, 2f, 70f), Is.EqualTo(-1));
        }

        [Test]
        public void ObjectBehindThePlayer_IsIgnored_UnlessItIsVeryClose()
        {
            Assert.That(Select(0f, new InteractionCandidate(0f, 0f, -1.5f, 0, true)), Is.EqualTo(-1));
            Assert.That(Select(0f, new InteractionCandidate(0f, 0f, -0.5f, 0, true)), Is.EqualTo(0));
        }

        [Test]
        public void FacingYaw_TurnsTheCone()
        {
            // Yaw 90° looks along +X.
            Assert.That(Select(90f, new InteractionCandidate(1.5f, 0f, 0f, 0, true), new InteractionCandidate(0f, 0f, 1.5f, 0, true)), Is.EqualTo(0));
            Assert.That(Select(0f, new InteractionCandidate(1.5f, 0f, 0f, 0, true), new InteractionCandidate(0f, 0f, 1.5f, 0, true)), Is.EqualTo(1));
        }

        [Test]
        public void HigherPriority_WinsOverACloserObject()
        {
            var pickup = new InteractionCandidate(0f, 0f, 0.6f, 0, true);
            var chest = new InteractionCandidate(0f, 0f, 1.8f, 10, true);

            Assert.That(Select(0f, pickup, chest), Is.EqualTo(1));
        }

        [Test]
        public void SamePriority_PrefersTheCloserAndStraighterObject()
        {
            var near = new InteractionCandidate(0f, 0f, 1f, 0, true);
            var far = new InteractionCandidate(0f, 0f, 1.6f, 0, true);
            var side = new InteractionCandidate(0.9f, 0f, 0.5f, 0, true);

            Assert.That(Select(0f, far, near), Is.EqualTo(1));
            Assert.That(Select(0f, side, far), Is.EqualTo(1), "1.03 m at 61° costs 1.73, 1.6 m straight ahead costs 1.6");
            Assert.That(Select(0f, side, near), Is.EqualTo(1));
        }

        [Test]
        public void UnavailableObjects_AreSkipped()
        {
            var opened = new InteractionCandidate(0f, 0f, 1f, 10, false);
            var pickup = new InteractionCandidate(0f, 0f, 1.5f, 0, true);

            Assert.That(Select(0f, opened, pickup), Is.EqualTo(1));
        }

        [Test]
        public void HorizontalAngle_IgnoresHeight()
        {
            Assert.That(InteractionSelector.HorizontalAngle(0f, 1f, 0f, 1f), Is.EqualTo(0f).Within(1e-3f));
            Assert.That(InteractionSelector.HorizontalAngle(1f, 0f, 0f, 1f), Is.EqualTo(90f).Within(1e-3f));
            Assert.That(InteractionSelector.HorizontalAngle(0f, -1f, 0f, 1f), Is.EqualTo(180f).Within(1e-3f));
            Assert.That(InteractionSelector.HorizontalAngle(0f, 0f, 0f, 1f), Is.EqualTo(0f));
        }
    }
}
