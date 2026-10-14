using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Draw rules of the bow (GDD 03 6.1): damage and speed by draw time, hip shot, hold cost, trembling.</summary>
    public sealed class BowDrawTests
    {
        [Test]
        public void FullDraw_After08Seconds_Gives100PercentAnd70MetresPerSecond()
        {
            var bow = new BowDraw();
            Assert.That(bow.BeginDraw(), Is.True);
            bow.Tick(0.8f);
            Assert.That(bow.Draw01, Is.EqualTo(1f).Within(0.0001f));

            BowShot shot = bow.Release();
            Assert.That(shot.DamageMultiplier, Is.EqualTo(1f).Within(0.0001f));
            Assert.That(shot.Speed, Is.EqualTo(70f).Within(0.001f));
            Assert.That(shot.IsHipShot, Is.False);
            Assert.That(bow.Phase, Is.EqualTo(BowPhase.Idle));
        }

        [Test]
        public void BarelyDrawn_Gives40PercentAnd35MetresPerSecond()
        {
            var bow = new BowDraw();
            bow.BeginDraw();
            BowShot shot = bow.Release();
            Assert.That(shot.DamageMultiplier, Is.EqualTo(0.4f).Within(0.0001f));
            Assert.That(shot.Speed, Is.EqualTo(35f).Within(0.001f));
        }

        [Test]
        public void HalfDrawn_IsLinearBetween()
        {
            var bow = new BowDraw();
            bow.BeginDraw();
            bow.Tick(0.4f);
            BowShot shot = bow.Release();
            Assert.That(shot.DamageMultiplier, Is.EqualTo(0.7f).Within(0.0001f));
            Assert.That(shot.Speed, Is.EqualTo(52.5f).Within(0.001f));
        }

        [Test]
        public void HipShot_IsReadyAfter045Seconds_WithHalfDamage()
        {
            var bow = new BowDraw();
            Assert.That(bow.BeginHipShot(), Is.True);
            bow.Tick(0.4f);
            Assert.That(bow.HipShotReady, Is.False);
            bow.Tick(0.05f);
            Assert.That(bow.HipShotReady, Is.True);

            BowShot shot = bow.Release();
            Assert.That(shot.IsHipShot, Is.True);
            Assert.That(shot.DamageMultiplier, Is.EqualTo(0.5f).Within(0.0001f));
        }

        [Test]
        public void HoldingTheDraw_CostsStaminaOnlyAfter15Seconds()
        {
            var bow = new BowDraw();
            bow.BeginDraw();
            Assert.That(bow.Tick(1.5f), Is.EqualTo(0f));
            Assert.That(bow.Tick(1f), Is.EqualTo(5f).Within(0.0001f));

            var straddle = new BowDraw();
            straddle.BeginDraw();
            straddle.Tick(1.2f);
            // 1.2 → 1.8 s: only the 0.3 s after 1.5 s cost.
            Assert.That(straddle.Tick(0.6f), Is.EqualTo(1.5f).Within(0.0001f));
        }

        [Test]
        public void LongFullDraw_Trembles()
        {
            var bow = new BowDraw();
            bow.BeginDraw();
            bow.Tick(2.5f);
            Assert.That(bow.Release().SpreadDegrees, Is.EqualTo(0f));

            bow.BeginDraw();
            bow.Tick(3.5f);
            Assert.That(bow.Release().SpreadDegrees, Is.EqualTo(0.5f).Within(0.0001f));
        }

        [Test]
        public void OneArrowAtATime_CancelTakesItOff()
        {
            var bow = new BowDraw();
            Assert.That(bow.BeginDraw(), Is.True);
            Assert.That(bow.BeginHipShot(), Is.False);
            Assert.That(bow.BeginDraw(), Is.False);
            bow.Tick(0.5f);
            bow.Cancel();
            Assert.That(bow.IsBusy, Is.False);
            Assert.That(bow.Draw01, Is.EqualTo(0f));
            Assert.That(bow.Tick(5f), Is.EqualTo(0f), "idle bows cost nothing");
        }
    }
}
