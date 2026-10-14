using Aetherfall.Progression;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>Experience for kills (GDD 03 12.7): base formula, variants, level difference, night and who counts.</summary>
    [TestFixture]
    public sealed class KillXpRulesTests
    {
        private readonly KillXpRules _rules = new KillXpRules();

        [Test]
        public void GreyWolfLevel8_Gives16AtTheSameLevel()
        {
            // GDD 03 12.7: "Beispiel Grauwolf L8 = 16 XP".
            Assert.That(_rules.Compute(8, "normal", 8, false), Is.EqualTo(16));
        }

        [Test]
        public void PrologueExamples_MatchTheGdd()
        {
            // "~6 Risslinge (je ~6 XP) und die Prolog-Rissbrut (Champion L2, 56 XP)".
            Assert.That(_rules.Compute(1, "normal", 1, false), Is.EqualTo(6));
            Assert.That(_rules.Compute(2, "champion", 2, false), Is.EqualTo(56));
        }

        [TestCase("normal", 1f)]
        [TestCase("", 1f)]
        [TestCase("elite", 3f)]
        [TestCase("champion", 8f)]
        [TestCase("miniboss", 15f)]
        [TestCase("dungeon_boss", 30f)]
        [TestCase("world_boss", 60f)]
        [TestCase("aether_verderbt", 1f)]
        [TestCase("unbekannt", 1f)]
        public void VariantFactors(string variant, float expected)
        {
            Assert.That(KillXpRules.VariantFactor(variant), Is.EqualTo(expected));
        }

        [TestCase(10, 10, 1f)]
        [TestCase(13, 8, 1f)]
        [TestCase(14, 8, 0.8f)]
        [TestCase(15, 8, 0.6f)]
        [TestCase(17, 8, 0.2f)]
        [TestCase(18, 8, 0.1f)]
        [TestCase(40, 8, 0.1f)]
        [TestCase(1, 2, 1.05f)]
        [TestCase(1, 6, 1.25f)]
        [TestCase(1, 8, 1.25f)]
        public void LevelDifference(int player, int enemy, float expected)
        {
            Assert.That(KillXpRules.LevelDifferenceFactor(player, enemy), Is.EqualTo(expected).Within(0.0001f));
        }

        [Test]
        public void HigherEnemy_GivesUpTo25PercentMore()
        {
            // Grey wolf level 8 against a level 1 player: 16 × 1.25 = 20.
            Assert.That(_rules.Compute(8, "normal", 1, false), Is.EqualTo(20));
        }

        [Test]
        public void Night_GivesAQuarterMore()
        {
            Assert.That(_rules.Compute(8, "normal", 8, true), Is.EqualTo(20));
        }

        [Test]
        public void FarLowerEnemy_StillGivesAtLeastOne()
        {
            Assert.That(_rules.Compute(1, "normal", 80, false), Is.EqualTo(1));
        }

        [TestCase("player", true)]
        [TestCase("companion.maren", true)]
        [TestCase("summon.wolf", true)]
        [TestCase("", false)]
        [TestCase(null, false)]
        [TestCase("enemy.wolf.grauwolf", false)]
        [TestCase("trainingspuppe", false)]
        public void OnlyKillsOfThePlayerSideCount(string killer, bool expected)
        {
            Assert.That(KillXpRules.CountsForPlayer(killer), Is.EqualTo(expected));
        }

        [Test]
        public void Parameters_ChangeTheBase()
        {
            var rules = new KillXpRules(10f, 0f);

            Assert.That(rules.Compute(50, "elite", 50, false), Is.EqualTo(30));
        }
    }
}
