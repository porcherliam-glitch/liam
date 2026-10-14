using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// The objective "Treffe Ziel" (<see cref="HitTargetObjective"/>, used by the trial quest of the test ground): counts
    /// <c>DamageDealt</c> on the target ids (groups with <c>*</c>) by the player only, unless another attacker is set, and
    /// validates its parameters.
    /// </summary>
    [TestFixture]
    public sealed class HitTargetObjectiveTests
    {
        private const string QuestId = "quest.side.test.treffen";

        private QuestTestEnvironment _env;

        [TearDown]
        public void TearDown()
        {
            if (_env != null)
            {
                _env.Dispose();
                _env = null;
            }
        }

        [Test]
        public void CountsHitsOfThePlayerOnTheTarget()
        {
            ObjectiveState state = Run(new HitTargetObjective("o1", 3, "trainingspuppe"));

            Hit("player", "trainingspuppe");
            Hit("wolf_1", "trainingspuppe");
            Hit("player", "wolf_1");
            Assert.That(state.Progress, Is.EqualTo(1));

            Hit("player", "trainingspuppe");
            Hit("player", "trainingspuppe");
            Assert.That(state.Done, Is.True);
        }

        [Test]
        public void GroupAndAnyAttacker()
        {
            var objective = new HitTargetObjective("o1", 2, "puppe_*");
            Assert.That(objective.Matches("puppe_links"), Is.True);
            Assert.That(objective.Matches("trainingspuppe"), Is.False);
            Assert.That(objective.Matches(string.Empty), Is.False);
            Assert.That(objective.AttackerId, Is.EqualTo("player"));
        }

        [Test]
        public void Validation()
        {
            var report = new ValidationReport();
            new HitTargetObjective("o1", 1).Validate(report);
            new HitTargetObjective("o1", 0, "trainingspuppe").Validate(report);
            Assert.That(report.ErrorCount, Is.EqualTo(2), report.ToText());

            var valid = new ValidationReport();
            new HitTargetObjective("o1", 3, "trainingspuppe").Validate(valid);
            Assert.That(valid.ErrorCount + valid.WarningCount, Is.EqualTo(0), valid.ToText());
            Assert.That(valid.References.Count, Is.EqualTo(0), "combatant ids are no content ids");
        }

        private ObjectiveState Run(QuestObjective objective)
        {
            QuestSpec quest = new QuestSpecBuilder(QuestId)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(objective)
                    .Objective(new TalkToObjective("o9", "npc.eichental.niemand"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
            _env = new QuestTestEnvironment(new FlagRegistry(), quest);
            Assert.That(_env.Quests.TryStart(QuestId, "test"), Is.True);
            Assert.That(_env.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
            return instance.Objectives[0];
        }

        private void Hit(string attacker, string target)
        {
            _env.Publish(new DamageDealt(attacker, target, 3, default(DamageType), false, default(HitZone)));
        }
    }
}
