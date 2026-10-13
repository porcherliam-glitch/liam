using Aetherfall.Combat;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Hit feel table (GDD 03 4.11): hitstop and camera shake by hit kind, and the classification of hits.</summary>
    [TestFixture]
    public sealed class HitFeedbackTableTests
    {
        [Test]
        public void Table_HasGddValues()
        {
            var table = new HitFeedbackTable();

            Assert.That(table.HitStopOf(HitFeedbackKind.LightHit), Is.EqualTo(0.06f).Within(1e-6f));
            Assert.That(table.HitStopOf(HitFeedbackKind.HeavyHit), Is.EqualTo(0.09f).Within(1e-6f));
            Assert.That(table.HitStopOf(HitFeedbackKind.PerfectParry), Is.EqualTo(0.12f).Within(1e-6f));
            Assert.That(table.HitStopOf(HitFeedbackKind.PlayerHitLight), Is.EqualTo(0.04f).Within(1e-6f));
            Assert.That(table.ShakeAmplitudeOf(HitFeedbackKind.LightHit), Is.EqualTo(0f));
            Assert.That(table.ShakeAmplitudeOf(HitFeedbackKind.PoiseBreak), Is.GreaterThan(0f));
            Assert.That(table.HitStopOf(HitFeedbackKind.None), Is.EqualTo(0f));
        }

        [Test]
        public void HitStop_NeverExceedsTheCap()
        {
            var table = new HitFeedbackTable();
            for (int i = 0; i <= (int)HitFeedbackKind.PlayerHitHeavy; i++)
            {
                Assert.That(table.HitStopOf((HitFeedbackKind)i), Is.LessThanOrEqualTo(0.15f), ((HitFeedbackKind)i).ToString());
            }
        }

        [Test]
        public void Set_OverridesValues()
        {
            var table = new HitFeedbackTable();

            table.Set(HitFeedbackKind.LightHit, 0.1f, 0.2f, 0.3f);
            table.Set(HitFeedbackKind.None, 1f, 1f, 1f);

            Assert.That(table.HitStopOf(HitFeedbackKind.LightHit), Is.EqualTo(0.1f).Within(1e-6f));
            Assert.That(table.ShakeDurationOf(HitFeedbackKind.LightHit), Is.EqualTo(0.3f).Within(1e-6f));
            Assert.That(table.HitStopOf(HitFeedbackKind.None), Is.EqualTo(0f));
        }

        [Test]
        public void Classify_DefenseOutcomes()
        {
            AttackSpec light = AttackSpec.Create("leicht", 0.2f, 0.1f, 0.3f);

            Assert.That(Classify(light, DefenseOutcome.Evaded), Is.EqualTo(HitFeedbackKind.None));
            Assert.That(Classify(light, DefenseOutcome.Parried), Is.EqualTo(HitFeedbackKind.PerfectParry));
            Assert.That(Classify(light, DefenseOutcome.Blocked), Is.EqualTo(HitFeedbackKind.Blocked));
            Assert.That(HitFeedbackTable.Classify(light, DefenseOutcome.Blocked, false, false, true, false, false),
                Is.EqualTo(HitFeedbackKind.GuardBreak));
        }

        [Test]
        public void Classify_AttackKinds()
        {
            AttackSpec light = AttackSpec.Create("leicht", 0.2f, 0.1f, 0.3f);
            AttackSpec heavy = light.Clone();
            heavy.Kind = AttackKind.Heavy;
            AttackSpec charged = heavy.Clone();
            charged.ChargeLevel = 2;
            AttackSpec comboEnd = light.Clone();
            comboEnd.Kind = AttackKind.ComboFinisher;
            AttackSpec finisher = light.Clone();
            finisher.Kind = AttackKind.Finisher;

            Assert.That(Classify(light, DefenseOutcome.Hit), Is.EqualTo(HitFeedbackKind.LightHit));
            Assert.That(Classify(heavy, DefenseOutcome.Hit), Is.EqualTo(HitFeedbackKind.HeavyHit));
            Assert.That(Classify(charged, DefenseOutcome.Hit), Is.EqualTo(HitFeedbackKind.CriticalHit));
            Assert.That(Classify(comboEnd, DefenseOutcome.Hit), Is.EqualTo(HitFeedbackKind.ComboFinisher));
            Assert.That(Classify(finisher, DefenseOutcome.Hit), Is.EqualTo(HitFeedbackKind.Finisher));
            Assert.That(HitFeedbackTable.Classify(light, DefenseOutcome.Hit, true, false, false, false, false),
                Is.EqualTo(HitFeedbackKind.CriticalHit));
            Assert.That(HitFeedbackTable.Classify(light, DefenseOutcome.Hit, false, true, false, false, false),
                Is.EqualTo(HitFeedbackKind.PoiseBreak));
        }

        [Test]
        public void Classify_HitsOnThePlayer()
        {
            AttackSpec bite = AttackSpec.Create("biss", 0.45f, 0.15f, 0.45f);

            Assert.That(HitFeedbackTable.Classify(bite, DefenseOutcome.Hit, false, false, false, true, false),
                Is.EqualTo(HitFeedbackKind.PlayerHitLight));
            Assert.That(HitFeedbackTable.Classify(bite, DefenseOutcome.Hit, false, false, false, true, true),
                Is.EqualTo(HitFeedbackKind.PlayerHitHeavy));
        }

        private static HitFeedbackKind Classify(AttackSpec attack, DefenseOutcome defense)
        {
            return HitFeedbackTable.Classify(attack, defense, false, false, false, false, false);
        }
    }
}
