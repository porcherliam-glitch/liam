using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>The formulas of GDD 03 section 10 with the examples given there (<see cref="StatFormulas"/>).</summary>
    [TestFixture]
    public sealed class StatFormulasTests
    {
        private const float Tolerance = 1e-4f;

        // GDD 03 8.4 test 21 and 10.1.
        [TestCase(8f, -2f)]
        [TestCase(10f, 0f)]
        [TestCase(20f, 10f)]
        [TestCase(40f, 30f)]
        [TestCase(41f, 30.5f)]
        [TestCase(60f, 40f)]
        public void EffectivePoints_HalvesAboveTheSoftCap(float attribute, float expected)
        {
            Assert.That(StatFormulas.EffectivePoints(attribute), Is.EqualTo(expected).Within(Tolerance));
        }

        [TestCase(15f, 1f, 175f)]  // warrior level 1
        [TestCase(18f, 10f, 328f)] // warrior level 10
        [TestCase(10f, 1f, 100f)]  // mage level 1
        public void MaxHealth_MatchesTheGddExamples(float constitution, float level, float expected)
        {
            Assert.That(StatFormulas.MaxHealth(constitution, level), Is.EqualTo(expected).Within(Tolerance));
        }

        [Test]
        public void MaxStamina_WarriorLevel10_Is120Point5()
        {
            Assert.That(StatFormulas.MaxStamina(18f, 10f), Is.EqualTo(120.5f).Within(Tolerance));
        }

        [TestCase(15f, 75f)] // mage level 1
        [TestCase(8f, 40f)]  // warrior level 1
        public void MaxMana_MatchesTheGddExamples(float intelligence, float expected)
        {
            Assert.That(StatFormulas.MaxMana(intelligence, 1f), Is.EqualTo(expected).Within(Tolerance));
        }

        [TestCase(1f, 10f)]
        [TestCase(10f, 20.8f)]
        [TestCase(40f, 56.8f)]
        [TestCase(80f, 104.8f)]
        public void SpellPowerWithoutWeapon_MatchesTheGddExamples(float level, float expected)
        {
            Assert.That(StatFormulas.SpellPowerWithoutWeapon(level, 10f), Is.EqualTo(expected).Within(1e-3f));
        }

        [Test]
        public void DerivedValues_MatchTheGddExamples()
        {
            Assert.That(StatFormulas.StatusResistance(20f), Is.EqualTo(15f).Within(Tolerance), "wisdom 20");
            Assert.That(StatFormulas.CritChance(40f), Is.EqualTo(0.125f).Within(Tolerance), "dexterity 40: 12.5 %");
            Assert.That(StatFormulas.CarryCapacity(40f), Is.EqualTo(120f).Within(Tolerance), "strength 40: 120 kg");
            Assert.That(StatFormulas.Poise(15f, 18f), Is.EqualTo(39f).Within(Tolerance), "medium armor, constitution 18");
            Assert.That(StatFormulas.Luck(30f), Is.EqualTo(10f).Within(Tolerance));
            Assert.That(StatFormulas.WisdomFactor(20f), Is.EqualTo(1.2f).Within(Tolerance));
        }

        [Test]
        public void AttackDisplay_WarriorLevel10WithLongsword_Is57Point5()
        {
            // GDD 03 10.3 / 8.3: strength 20, dexterity 10, one-handed sword 0.6/0.4, weapon damage 50.
            float weighted = 0.6f * StatFormulas.EffectivePoints(20f) + 0.4f * StatFormulas.EffectivePoints(10f);
            Assert.That(StatFormulas.AttackDisplay(50f, weighted), Is.EqualTo(57.5f).Within(Tolerance));
        }

        [Test]
        public void ManaAndHealthRegeneration_FollowTheCombatState()
        {
            Assert.That(StatFormulas.ManaRegenPerSecond(100f, 10f, false), Is.EqualTo(6f).Within(Tolerance));
            Assert.That(StatFormulas.ManaRegenPerSecond(100f, 10f, true), Is.EqualTo(2.5f).Within(Tolerance));
            Assert.That(StatFormulas.ManaRegenPerSecond(100f, 20f, false), Is.EqualTo(7.2f).Within(Tolerance), "wisdom +20 %");
            Assert.That(StatFormulas.HealthRegenPerSecond(200f, false), Is.EqualTo(2f).Within(Tolerance));
            Assert.That(StatFormulas.HealthRegenPerSecond(200f, true), Is.EqualTo(0f));
        }

        [TestCase(10f, 1f)]
        [TestCase(30f, 0.8f)]
        [TestCase(60f, 0.7f)] // capped at -30 %
        [TestCase(5f, 1f)]    // negative effective points never raise the cost
        public void RollCostFactor_IsCappedAt30Percent(float dexterity, float expected)
        {
            Assert.That(StatFormulas.RollCostFactor(dexterity), Is.EqualTo(expected).Within(Tolerance));
        }
    }
}
