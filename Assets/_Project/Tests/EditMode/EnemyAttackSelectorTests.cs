using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Attack choice of enemies: weighted among ready attacks, attacks in range first, cooldowns.</summary>
    [TestFixture]
    public sealed class EnemyAttackSelectorTests
    {
        private static EnemyAttackOption[] WolfAttacks()
        {
            return new[]
            {
                new EnemyAttackOption { Attack = AttackSpec.Create("biss", 0.45f, 0.15f, 0.45f), MaxRange = 2.2f, Cooldown = 1.5f, Weight = 1f },
                new EnemyAttackOption
                {
                    Attack = AttackSpec.Create("sprung", 0.65f, 0.3f, 0.95f), MinRange = 3f, MaxRange = 6f, Cooldown = 4f, Weight = 1f
                }
            };
        }

        [Test]
        public void PrefersAttacksInRange()
        {
            var selector = new EnemyAttackSelector(WolfAttacks(), new SequenceRandom(0.99f));

            Assert.That(selector.Choose(1.5f), Is.EqualTo(0), "Only the bite reaches 1.5 m.");
            Assert.That(selector.Choose(5f), Is.EqualTo(1), "Only the pounce reaches 5 m.");
        }

        [Test]
        public void NothingInRange_PicksAnyReadyAttackByWeight()
        {
            var selector = new EnemyAttackSelector(WolfAttacks(), new SequenceRandom(0.25f, 0.75f));

            Assert.That(selector.Choose(10f), Is.EqualTo(0));
            Assert.That(selector.Choose(10f), Is.EqualTo(1));
        }

        [Test]
        public void Cooldown_BlocksTheAttackUntilItRunsOut()
        {
            var selector = new EnemyAttackSelector(WolfAttacks(), new SequenceRandom(0f));
            selector.StartCooldown(0);

            Assert.That(selector.CooldownOf(0), Is.EqualTo(1.5f));
            Assert.That(selector.Choose(1.5f), Is.EqualTo(1), "Bite on cooldown: the wolf goes for the pounce.");

            selector.StartCooldown(1);
            Assert.That(selector.Choose(1.5f), Is.EqualTo(-1));

            selector.Tick(1.5f);
            Assert.That(selector.Choose(1.5f), Is.EqualTo(0));
        }

        [Test]
        public void Reset_ClearsCooldowns()
        {
            var selector = new EnemyAttackSelector(WolfAttacks(), new SequenceRandom(0f));
            selector.StartCooldown(0);
            selector.StartCooldown(1);

            selector.Reset();

            Assert.That(selector.CooldownOf(0), Is.EqualTo(0f));
            Assert.That(selector.Choose(1f), Is.EqualTo(0));
        }
    }
}
