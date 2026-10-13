using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>German overlay texts of the enemy AI states.</summary>
    [TestFixture]
    public sealed class EnemyStateTextTests
    {
        [Test]
        public void Describe_GuardStunnedAndDead()
        {
            var settings = new EnemyBrainSettings
            {
                Guard = true,
                Attacks = new[] { new EnemyAttackOption { Attack = AttackSpec.Create("biss", 0.45f, 0.15f, 0.45f) } }
            };
            var brain = new EnemyBrain(settings, new AttackTokenService(), "wolf_1", new SequenceRandom(0f), new FlatPoint(0f, 0f));

            Assert.That(EnemyStateText.Describe(null), Does.StartWith("startet"));
            Assert.That(EnemyStateText.Describe(brain), Is.EqualTo("Wache (Entdeckung 0)"));

            brain.NotifyStunned(3f, true);
            Assert.That(EnemyStateText.Describe(brain), Does.Contain("Finisher möglich"));

            brain.Kill();
            Assert.That(EnemyStateText.Describe(brain), Is.EqualTo("Tot"));
        }
    }
}
