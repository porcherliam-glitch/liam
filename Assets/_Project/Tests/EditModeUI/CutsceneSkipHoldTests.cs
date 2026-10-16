using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Holding the skip button during a cutscene (S58, GDD 03 1.5).</summary>
    [TestFixture]
    public sealed class CutsceneSkipHoldTests
    {
        [Test]
        public void FreshPressHeldForTheDuration_CompletesExactlyOnce()
        {
            var hold = new CutsceneSkipHold(1f);
            hold.Update(false, false, 0.1f);

            Assert.That(hold.Update(true, true, 0.1f), Is.EqualTo(HoldStep.Progressed));
            int completed = 0;
            for (int i = 0; i < 30; i++)
            {
                if (hold.Update(false, true, 0.05f) == HoldStep.Completed)
                {
                    completed++;
                }
            }

            Assert.That(completed, Is.EqualTo(1));
            Assert.That(hold.IsHolding, Is.False, "still held after completing: no second skip without a new press");
        }

        [Test]
        public void ReleasingEarly_CancelsAndResetsTheBar()
        {
            var hold = new CutsceneSkipHold(1f);
            hold.Update(false, false, 0.1f);
            hold.Update(true, true, 0f);
            for (int i = 0; i < 6; i++)
            {
                hold.Update(false, true, 0.1f);
            }

            Assert.That(hold.Progress, Is.EqualTo(0.6f).Within(1e-4));
            Assert.That(hold.Update(false, false, 0.1f), Is.EqualTo(HoldStep.Cancelled));
            Assert.That(hold.Progress, Is.Zero);
        }

        [Test]
        public void ButtonHeldFromBeforeTheScreenOpened_NeverStartsAHold()
        {
            var hold = new CutsceneSkipHold(1f);
            hold.Reset();
            for (int i = 0; i < 40; i++)
            {
                Assert.That(hold.Update(false, true, 0.05f), Is.EqualTo(HoldStep.Idle));
            }
        }

        [Test]
        public void PressInTheOpeningFrame_IsIgnored()
        {
            var hold = new CutsceneSkipHold(1f);
            hold.Reset();

            Assert.That(hold.Update(true, true, 0.016f), Is.EqualTo(HoldStep.Idle));
            Assert.That(hold.IsHolding, Is.False);
        }

        [TestCase(0.4f, 0.5f)]
        [TestCase(1.0f, 1.0f)]
        [TestCase(2.0f, 1.5f)]
        public void Duration_IsClampedToTheOptionRange(float wanted, float expected)
        {
            var hold = new CutsceneSkipHold { Duration = wanted };

            Assert.That(hold.Duration, Is.EqualTo(expected));
        }
    }
}
