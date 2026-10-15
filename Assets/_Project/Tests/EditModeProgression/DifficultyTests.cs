using Aetherfall.Core;
using Aetherfall.Difficulty;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// Difficulty levels (GDD 03 9.7): the table of factors, changing the level at any time and keeping the level of the
    /// options for a new game.
    /// </summary>
    [TestFixture]
    public sealed class DifficultyTests
    {
        [TestCase(DifficultyLevel.Story, 0.5f, 0.7f, 0.25f, 1, 1.5f)]
        [TestCase(DifficultyLevel.Normal, 1f, 1f, 0.15f, 2, 1f)]
        [TestCase(DifficultyLevel.Hard, 1.35f, 1.25f, 0.12f, 3, 1f)]
        [TestCase(DifficultyLevel.Nightmare, 1.8f, 1.6f, 0.1f, 3, 0.8f)]
        public void Settings_FollowTheGddTable(DifficultyLevel level, float damage, float health, float parry, int meleeTokens, float healing)
        {
            DifficultySettings settings = DifficultySettings.For(level);

            Assert.That(settings.Level, Is.EqualTo(level));
            Assert.That(settings.EnemyDamage, Is.EqualTo(damage));
            Assert.That(settings.EnemyHealth, Is.EqualTo(health));
            Assert.That(settings.ParryWindowSeconds, Is.EqualTo(parry));
            Assert.That(settings.MeleeTokens, Is.EqualTo(meleeTokens));
            Assert.That(settings.HealingFactor, Is.EqualTo(healing));
        }

        [Test]
        public void StoryGivesMoreTime_NightmareLess()
        {
            Assert.That(DifficultySettings.For(DifficultyLevel.Story).TelegraphFactor, Is.EqualTo(1.5f));
            Assert.That(DifficultySettings.For(DifficultyLevel.Story).RollIFrameBonus, Is.EqualTo(0.1f));
            Assert.That(DifficultySettings.For(DifficultyLevel.Nightmare).TelegraphFactor, Is.EqualTo(0.9f));
            Assert.That(DifficultySettings.For(DifficultyLevel.Nightmare).RollIFrameBonus, Is.EqualTo(-0.05f));
            Assert.That(DifficultySettings.For(DifficultyLevel.Hard).LootRarityBonus, Is.EqualTo(5));
        }

        [Test]
        public void Service_ChangesTheLevel_AndReportsIt()
        {
            var service = new DifficultyService();
            DifficultyLevel reported = DifficultyLevel.Normal;
            int calls = 0;
            service.Changed += level =>
            {
                reported = level;
                calls++;
            };

            service.SetLevel(DifficultyLevel.Hard);
            service.SetLevel(DifficultyLevel.Hard);
            service.SetLevel((DifficultyLevel)7);

            Assert.That(service.Level, Is.EqualTo(DifficultyLevel.Hard));
            Assert.That(service.Settings.EnemyDamage, Is.EqualTo(1.35f));
            Assert.That(reported, Is.EqualTo(DifficultyLevel.Hard));
            Assert.That(calls, Is.EqualTo(1), "the same level and unknown values change nothing");
        }
    }
}
