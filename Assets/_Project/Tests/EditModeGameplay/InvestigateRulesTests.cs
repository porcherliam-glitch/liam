using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Detective mode after GDD 02 5.1 and GDD 03 (<see cref="InvestigateRules"/>): investigating lights clues and trails up
    /// within 5 m, Aether sight within 40 m and only Aether sight shows hidden paths; R3 with a lock-on target is lock-on.
    /// </summary>
    [TestFixture]
    public sealed class InvestigateRulesTests
    {
        [TestCase(InvestigateKind.Clue, false, 4.9f, true)]
        [TestCase(InvestigateKind.Clue, false, 5.1f, false)]
        [TestCase(InvestigateKind.Clue, true, 39f, true)]
        [TestCase(InvestigateKind.Clue, true, 41f, false)]
        [TestCase(InvestigateKind.Trail, false, 3f, true)]
        [TestCase(InvestigateKind.Trail, true, 30f, true)]
        [TestCase(InvestigateKind.AetherOnly, false, 1f, false)]
        [TestCase(InvestigateKind.AetherOnly, true, 35f, true)]
        public void RevealsByModeAndDistance(InvestigateKind kind, bool aetherSight, float distance, bool revealed)
        {
            Assert.That(InvestigateRules.Reveals(kind, aetherSight, distance), Is.EqualTo(revealed));
        }

        [Test]
        public void RadiusIsFiveMetresOrFortyInAetherSight()
        {
            Assert.That(InvestigateRules.Radius(false), Is.EqualTo(5f));
            Assert.That(InvestigateRules.Radius(true), Is.EqualTo(40f));
        }

        [TestCase(true, false, true, true)]
        [TestCase(true, true, true, false)]
        [TestCase(true, false, false, false)]
        [TestCase(false, false, true, false)]
        public void HoldingInvestigatesOnlyWithoutLockOnWhilePlaying(bool held, bool lockedOn, bool playing, bool active)
        {
            Assert.That(InvestigateRules.IsActive(held, lockedOn, playing), Is.EqualTo(active));
        }

        [Test]
        public void InvestigatingStartsAfterAShortHold()
        {
            var hold = new InvestigateHold();

            Assert.That(hold.Update(true, false, 0.016f), Is.False, "first frame");
            Assert.That(hold.Update(true, false, 0.1f), Is.False);
            Assert.That(hold.Update(true, false, 0.12f), Is.True, "0.22 s held");
            Assert.That(hold.Update(false, false, 0.016f), Is.False, "let go");
        }

        [Test]
        public void AHoldThatTouchedTheLockOnNeverInvestigates()
        {
            var hold = new InvestigateHold();

            // R3 pressed while a target is held (releasing the lock-on), then kept held.
            Assert.That(hold.Update(true, true, 0.016f), Is.False);
            Assert.That(hold.Update(true, false, 0.5f), Is.False, "still the same press");
            Assert.That(hold.Update(false, false, 0.016f), Is.False);
            Assert.That(hold.Update(true, false, 0.016f), Is.False);
            Assert.That(hold.Update(true, false, 0.3f), Is.True, "a new press investigates again");
        }
    }
}
