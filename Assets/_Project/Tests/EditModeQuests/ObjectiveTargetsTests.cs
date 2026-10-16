using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// What quest markers point at (S60): the target an objective type implies, the designer's own marker ids first, the next
    /// node of a trail, nothing for objectives without a place and nothing once an objective is done.
    /// </summary>
    [TestFixture]
    public sealed class ObjectiveTargetsTests
    {
        private const string QuestId = "quest.side.test.marker";

        private readonly List<string> _ids = new List<string>();
        private QuestTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _ids.Clear();
        }

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
        public void EachTypePointsAtItsTarget()
        {
            Collect(new GoToObjective("o1", "loc.eichental.dorfplatz"));
            Collect(new TalkToObjective("o2", "npc.eichental.gelehrter_corvin"));
            Collect(new InteractObjective("o3", 2, "obj.eichental.balken_tobold", "obj.eichental.leiche_postreiter"));
            Collect(new InspectCluesObjective("o4", 1, "clue.eichental.weide_schaf"));
            Collect(new KillSpecificObjective("o5", "boss.eichental.glutfang"));

            Assert.That(_ids, Is.EqualTo(new[]
            {
                "loc.eichental.dorfplatz", "npc.eichental.gelehrter_corvin", "obj.eichental.balken_tobold", "obj.eichental.leiche_postreiter",
                "clue.eichental.weide_schaf", "boss.eichental.glutfang"
            }));
        }

        [Test]
        public void OwnMarkerIds_ReplaceTheImpliedTarget()
        {
            Collect(new TalkToObjective("o1", "npc.eichental.hauptmann_dorn").WithMarkers("loc.eichental.dorfrand"));

            Assert.That(_ids, Is.EqualTo(new[] { "loc.eichental.dorfrand" }));
        }

        [Test]
        public void KillByType_GivesNoPoint_TheSearchAreaCoversIt()
        {
            Collect(new KillObjective("o1", "enemy.wolf.grauwolf", 5));

            Assert.That(_ids, Is.Empty);
        }

        [Test]
        public void SameTargetTwice_IsListedOnce()
        {
            Collect(new TalkToObjective("o1", "npc.eichental.gelehrter_corvin"));
            Collect(new TalkToObjective("o2", "npc.eichental.gelehrter_corvin"));

            Assert.That(_ids.Count, Is.EqualTo(1));
        }

        [Test]
        public void Trail_PointsAtTheNextNode()
        {
            ObjectiveState state = Run(new FollowTrailObjective("o1", "spur.eichental.wolfsspur", 4));
            ObjectiveTargets.Collect(Objective(), state, _ids);
            Assert.That(_ids, Is.EqualTo(new[] { "spur.eichental.wolfsspur#0" }));

            _env.Publish(new TrailNodeReached("spur.eichental.wolfsspur", 1));
            _ids.Clear();
            ObjectiveTargets.Collect(Objective(), state, _ids);
            Assert.That(_ids, Is.EqualTo(new[] { "spur.eichental.wolfsspur#2" }), "skipped nodes count as reached");
        }

        [Test]
        public void InspectedCluesDropOutOneByOne()
        {
            ObjectiveState state = Run(new InspectCluesObjective("o1", 3, "clue.eichental.weide_schaf", "clue.eichental.weide_pfoten",
                "clue.eichental.weide_aetherspeichel"));
            _env.Publish(new ClueInspected("clue.eichental.weide_pfoten"));

            ObjectiveTargets.Collect(Objective(), state, _ids);
            var counted = new HashSet<string>();
            ObjectiveTargets.CollectCounted(state, counted);

            Assert.That(_ids, Is.EqualTo(new[] { "clue.eichental.weide_schaf", "clue.eichental.weide_aetherspeichel" }));
            Assert.That(counted, Is.EquivalentTo(new[] { "clue.eichental.weide_pfoten" }));
        }

        [Test]
        public void DoneObjective_GivesNothing()
        {
            ObjectiveState state = Run(new GoToObjective("o1", "loc.eichental.dorfplatz"));
            _env.Publish(new AreaEntered("loc.eichental.dorfplatz"));
            Assert.That(state.Done, Is.True);

            ObjectiveTargets.Collect(Objective(), state, _ids);

            Assert.That(_ids, Is.Empty);
        }

        private void Collect(QuestObjective objective)
        {
            ObjectiveTargets.Collect(objective, new ObjectiveState(objective.Id, objective.RequiredCount), _ids);
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
            _env = new QuestTestEnvironment(FlagRegistry.FromSpecs(), quest);
            Assert.That(_env.Quests.TryStart(QuestId, "test"), Is.True);
            Assert.That(_env.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
            return instance.Objectives[0];
        }

        private QuestObjective Objective()
        {
            Assert.That(_env.Quests.Catalog.TryGet(QuestId, out QuestSpec spec), Is.True);
            Assert.That(spec.TryGetStage("s10", out StageDefinition stage), Is.True);
            return stage.Objectives[0];
        }
    }
}
