using System.Linq;
using Aetherfall.Conditions;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Quests that start without a person (GDD 02 4.1): "Automatic" after every load or new game (the prologue), "AreaEntered"
    /// when the player enters the named location (the crypt without its quest giver). Plus the quest data of the mini slice:
    /// the validator accepts the three quests.
    /// </summary>
    [TestFixture]
    public sealed class QuestAutoStarterTests
    {
        private const string Flag = "flag.eichental.test_schalter";
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
        public void Automatic_StartsAfterGameLoaded_OnlyOnce_AndRespectsTheStartCondition()
        {
            Use(Quest("quest.main.test.prolog", QuestStartTriggerKind.Automatic, string.Empty),
                Quest("quest.side.test.spaeter", QuestStartTriggerKind.Automatic, string.Empty, new FlagIs(Flag, 1)),
                Quest("quest.side.test.dialog", QuestStartTriggerKind.Dialogue, "dlg.eichental.test"));
            Assert.That(_env.Quests.GetStatus("quest.main.test.prolog"), Is.Not.EqualTo(QuestStatus.Active), "nothing before the load");

            _env.Publish(new GameLoaded(string.Empty, 1));

            Assert.That(_env.Quests.GetStatus("quest.main.test.prolog"), Is.EqualTo(QuestStatus.Active));
            Assert.That(_env.Quests.GetStatus("quest.side.test.spaeter"), Is.Not.EqualTo(QuestStatus.Active), "start condition not met");
            Assert.That(_env.Quests.GetStatus("quest.side.test.dialog"), Is.Not.EqualTo(QuestStatus.Active), "dialogue quests wait for their dialogue");

            Assert.That(_env.Quests.TryComplete("quest.main.test.prolog", "test"), Is.True);
            _env.World.SetBool(Flag, true, "test");
            _env.Publish(new GameLoaded("char_test/quick_0", 1));

            Assert.That(_env.Quests.GetStatus("quest.main.test.prolog"), Is.EqualTo(QuestStatus.Completed), "a completed quest never restarts");
            Assert.That(_env.Quests.GetStatus("quest.side.test.spaeter"), Is.EqualTo(QuestStatus.Active));
        }

        [Test]
        public void AreaEntered_StartsTheQuestOfThatLocationOnly()
        {
            Use(Quest("quest.dungeon.test.gruft", QuestStartTriggerKind.AreaEntered, "loc.eichental.vergessene_gruft"),
                Quest("quest.side.test.anderswo", QuestStartTriggerKind.AreaEntered, "loc.eichental.nordhang"));

            _env.Publish(new AreaEntered("loc.eichental.dorfplatz"));
            Assert.That(_env.Quests.GetStatus("quest.dungeon.test.gruft"), Is.Not.EqualTo(QuestStatus.Active));

            _env.Publish(new AreaEntered("loc.eichental.vergessene_gruft"));
            Assert.That(_env.Quests.GetStatus("quest.dungeon.test.gruft"), Is.EqualTo(QuestStatus.Active));
            Assert.That(_env.Quests.GetStatus("quest.side.test.anderswo"), Is.Not.EqualTo(QuestStatus.Active));
        }

        [Test]
        public void MiniSliceQuests_PassTheValidator_AndStartTheRightWay()
        {
            QuestSpec[] quests = MiniSliceQuestLibrary.CreateQuests();
            ValidationReport report = new QuestValidator().Validate(quests);

            Assert.That(report.ErrorCount, Is.EqualTo(0), string.Join("\n", report.Issues.Select(i => i.Code + " " + i.Location + ": " + i.Message)));
            Assert.That(quests.Single(q => q.Id == MiniSliceQuestLibrary.Prologue).StartTriggerKind, Is.EqualTo(QuestStartTriggerKind.Automatic));
            Assert.That(quests.Single(q => q.Id == MiniSliceQuestLibrary.Crypt).StartTriggerId, Is.EqualTo("loc.eichental.vergessene_gruft"));
            Assert.That(MiniSliceQuestLibrary.CreateFlags().Select(f => f.Id), Is.Unique);
        }

        private void Use(params QuestSpec[] quests)
        {
            _env = new QuestTestEnvironment(FlagRegistry.FromSpecs(FlagSpec.Bool(Flag)), quests);
        }

        private static QuestSpec Quest(string id, QuestStartTriggerKind trigger, string triggerId, Condition startCondition = null)
        {
            QuestSpecBuilder builder = new QuestSpecBuilder(id)
                .Title("Test")
                .StartTrigger(trigger, triggerId)
                .Stage(new StageBuilder("s10").Objective(new TalkToObjective("o1", "npc.eichental.niemand")).EndSuccess());
            if (startCondition != null)
            {
                builder.StartCondition(startCondition);
            }

            return builder.Build();
        }
    }
}
