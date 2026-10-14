using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Conditions of the quest system (architecture 7.7): <c>QuestStatusIs</c>, <c>QuestStageReached</c>,
    /// <c>QuestObjectiveDone</c> and <c>QuestChoiceIs</c> read the quest service through the context, empty quest ids mean
    /// "the own quest" (source of the context), they declare the quest events as triggers, so a watcher re-evaluates them
    /// (e.g. the start condition "prologue completed" of a follow-up quest).
    /// </summary>
    [TestFixture]
    public sealed class QuestConditionTests
    {
        private const string First = "quest.main.test.erste";
        private const string Second = "quest.side.test.zweite";

        private QuestTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            QuestSpec first = new QuestSpecBuilder(First)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new ChooseObjective("o1", new ChoiceOption("a", "A"), new ChoiceOption("b", "B")))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").Objective(new TalkToObjective("o1", "npc.eichental.hedda")).EndSuccess())
                .Build();
            QuestSpec second = new QuestSpecBuilder(Second)
                .Giver("npc.eichental.bauer_hollmann")
                .StartCondition(new QuestStatusIs(First, QuestStatus.Completed))
                .Stage(new StageBuilder("s10").Objective(new TalkToObjective("o1", "npc.eichental.bauer_hollmann")).EndSuccess())
                .Build();
            _env = new QuestTestEnvironment(new FlagRegistry(), first, second);
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        [Test]
        public void QuestStatusIs_FollowsTheLifeCycle()
        {
            ConditionContext ctx = ConditionContext.ForPlayer(_env.Services, "dlg.test");

            Assert.That(new QuestStatusIs(First, QuestStatus.Unknown).Evaluate(ctx), Is.True);
            _env.Quests.TryStart(First, "test");
            Assert.That(new QuestStatusIs(First, QuestStatus.Active).Evaluate(ctx), Is.True);
            Assert.That(new QuestStatusIs(Second, QuestStatus.Available).Evaluate(ctx), Is.False);

            FinishFirst("a");

            Assert.That(new QuestStatusIs(First, QuestStatus.Completed).Evaluate(ctx), Is.True);
            Assert.That(new QuestStatusIs(Second, QuestStatus.Available).Evaluate(ctx), Is.True, "start condition watched");
        }

        [Test]
        public void StageReached_ObjectiveDone_AndChoice_ReadTheInstance()
        {
            ConditionContext own = ConditionContext.ForPlayer(_env.Services, First);
            _env.Quests.TryStart(First, "test");
            Assert.That(new QuestStageReached(First, "s20").Evaluate(own), Is.False);
            Assert.That(new QuestObjectiveDone("o1").Evaluate(own), Is.False);

            _env.Publish(new ChoiceMade(First + ".s10.o1", "b"));

            Assert.That(new QuestStageReached(First, "s20").Evaluate(own), Is.True);
            Assert.That(new QuestObjectiveDone(string.Empty, "s10", "o1").Evaluate(own), Is.True, "empty quest id = own quest");
            Assert.That(new QuestObjectiveDone(First, string.Empty, "o1").Evaluate(own), Is.False, "o1 of the active stage s20");
            Assert.That(new QuestChoiceIs(First, "s10", "o1", "b").Evaluate(own), Is.True);
            Assert.That(new QuestChoiceIs(First, "s10", "o1", "a").Evaluate(own), Is.False);
        }

        [Test]
        public void Watcher_ReEvaluatesQuestConditions_OnQuestEvents()
        {
            var changes = new System.Collections.Generic.List<bool>();
            _env.Watcher.Watch(new QuestStageReached(First, "s20"), ConditionContext.ForPlayer(_env.Services, "test"), changes.Add);
            _env.Quests.TryStart(First, "test");
            _env.Settle();
            Assert.That(changes, Is.Empty);

            _env.Publish(new ChoiceMade(First + ".s10.o1", "a"));

            Assert.That(changes, Is.EqualTo(new[] { true }));
        }

        [Test]
        public void Triggers_AreTheQuestEvents()
        {
            TriggerSet status = TriggerSet.Of(new QuestStatusIs(First, QuestStatus.Completed));
            TriggerSet stage = TriggerSet.Of(new QuestStageReached(First, "s20"));
            TriggerSet objective = TriggerSet.Of(new QuestObjectiveDone("o1"));

            Assert.That(status.Contains<QuestCompleted>() && status.Contains<QuestStarted>() && status.Contains<QuestFailed>(), Is.True);
            Assert.That(stage.Contains<QuestStageChanged>(), Is.True);
            Assert.That(objective.Contains<ObjectiveProgressed>(), Is.True);
        }

        [Test]
        public void Describe_AndValidate()
        {
            var report = new ValidationReport();
            new QuestStatusIs(string.Empty, QuestStatus.Completed).Validate(report);
            new QuestObjectiveDone(string.Empty).Validate(report);

            Assert.That(report.CountOf(ValidationReportExtensions.InvalidParameterCode), Is.EqualTo(2));
            Assert.That(new QuestStatusIs(First, QuestStatus.Completed).Describe(), Does.Contain(First));
            Assert.That(new StartQuest(Second).Describe(), Is.EqualTo("Starte Quest " + Second));
        }

        private void FinishFirst(string option)
        {
            _env.Publish(new ChoiceMade(First + ".s10.o1", option));
            _env.Publish(new NPCTalkedTo("npc.eichental.hedda", string.Empty));
        }
    }
}
