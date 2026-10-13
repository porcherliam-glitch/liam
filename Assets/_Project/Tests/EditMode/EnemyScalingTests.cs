using Aetherfall.AI;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Enemy scaling (GDD 03 10.6): health +15 %, damage and armor +12 %, poise +2.5 % per level above 1. Example grey
    /// wolf level 8: 144 health, bite 46, armor 28, poise 35.
    /// </summary>
    [TestFixture]
    public sealed class EnemyScalingTests
    {
        [Test]
        public void GreyWolfLevelEight_MatchesTheGddExample()
        {
            Assert.That(EnemyScaling.Health(70f, 1f, 8), Is.EqualTo(144f));
            Assert.That(EnemyScaling.Damage(25f, 1f, 8), Is.EqualTo(46f));
            Assert.That(EnemyScaling.Armor(15f, 8), Is.EqualTo(28f));
            Assert.That(EnemyScaling.Poise(30f, 1f, 8), Is.EqualTo(35f));
        }

        [Test]
        public void LevelOne_IsTheBaseValue()
        {
            Assert.That(EnemyScaling.Health(70f, 1f, 1), Is.EqualTo(70f));
            Assert.That(EnemyScaling.Damage(25f, 1f, 1), Is.EqualTo(25f));
            Assert.That(EnemyScaling.Armor(15f, 1), Is.EqualTo(15f));
            Assert.That(EnemyScaling.Poise(30f, 1f, 0), Is.EqualTo(30f), "Levels below 1 count as 1.");
        }

        [Test]
        public void VariantFactor_Multiplies()
        {
            Assert.That(EnemyScaling.Health(70f, 1.5f, 1), Is.EqualTo(105f));
            Assert.That(EnemyScaling.Damage(25f, 1.25f, 1), Is.EqualTo(31f));
        }
    }
}
