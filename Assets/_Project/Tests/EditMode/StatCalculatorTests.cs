using System.Collections.Generic;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Modifier order and caps of GDD 03 10.4/10.5 (<see cref="StatCalculator"/>, <see cref="StatRule"/>).</summary>
    [TestFixture]
    public sealed class StatCalculatorTests
    {
        private static readonly StatRule NoLimits = StatRule.Unbounded;

        [Test]
        public void ArmorExample_From_GDD03_10_4_Is103Point95()
        {
            // Pieces 60 + ring "+10" = 70, × (1 + 0.15 + 0.20) = 94.5, × 1.10 set bonus = 103.95.
            var modifiers = new List<StatModifier>
            {
                StatModifier.Flat(StatId.Armor, 10f, StatSourceIds.Item("ring")),
                StatModifier.PercentAdd(StatId.Armor, 0.15f, StatSourceIds.Skill("eiserne_haut_3")),
                StatModifier.PercentAdd(StatId.Armor, 0.20f, StatSourceIds.Buff("spott")),
                StatModifier.PercentMult(StatId.Armor, 0.10f, StatSourceIds.Item("set"))
            };

            Assert.That(StatCalculator.Compute(60f, modifiers, NoLimits), Is.EqualTo(103.95f).Within(1e-3f));
        }

        [Test]
        public void FlatComesBeforePercent_PercentAddIsSummed_PercentMultIsMultiplied()
        {
            var modifiers = new List<StatModifier>
            {
                StatModifier.PercentAdd(StatId.Armor, 0.5f, "a"),
                StatModifier.PercentAdd(StatId.Armor, 0.5f, "b"),
                StatModifier.PercentMult(StatId.Armor, 0.5f, "c"),
                StatModifier.PercentMult(StatId.Armor, 0.5f, "d"),
                StatModifier.Flat(StatId.Armor, 10f, "e")
            };

            // (10 + 10) × (1 + 1.0) × 1.5 × 1.5 = 90
            Assert.That(StatCalculator.Compute(10f, modifiers, NoLimits), Is.EqualTo(90f).Within(1e-4f));
        }

        [Test]
        public void AtMostThreeMultiplicativeModifiersCount_LowestOrderFirst()
        {
            var modifiers = new List<StatModifier>
            {
                StatModifier.PercentMult(StatId.Armor, 1f, "a", order: 0),
                StatModifier.PercentMult(StatId.Armor, 1f, "b", order: 1),
                StatModifier.PercentMult(StatId.Armor, 1f, "c", order: 2),
                StatModifier.PercentMult(StatId.Armor, 1f, "d", order: 3)
            };

            Assert.That(StatCalculator.Compute(1f, modifiers, NoLimits), Is.EqualTo(8f), "2 × 2 × 2, the fourth is ignored");
            Assert.That(StatCalculator.CountIgnoredMultiplicative(modifiers), Is.EqualTo(1));
        }

        [Test]
        public void SoftCapHalvesTheExcess_ThenTheHardCapClamps()
        {
            var critRule = new StatRule(0f, 0.75f, 0.5f);

            Assert.That(critRule.Apply(0.4f), Is.EqualTo(0.4f).Within(1e-6f), "below the soft cap");
            Assert.That(critRule.Apply(0.6f), Is.EqualTo(0.55f).Within(1e-6f), "50 % + half of 10 %");
            Assert.That(critRule.Apply(1.5f), Is.EqualTo(0.75f).Within(1e-6f), "hard cap 75 %");
            Assert.That(critRule.Apply(-0.2f), Is.EqualTo(0f), "minimum");
        }
    }
}
