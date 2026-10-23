using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Quest markers of compass and map (S60) with the real quest service: the focus quest gives large markers at its open
    /// targets, other tracked quests small ones, more than three targets a search area, a trail its next node; done objectives,
    /// untracked quests and targets that are not loaded give nothing.
    /// </summary>
    [TestFixture]
    public sealed class QuestMarkerModelTests
    {
        private const string Talk = "quest.side.test.kompass_reden";
        private const string Targets = "quest.side.test.kompass_ziele";
        private const string Trail = "quest.side.test.kompass_spur";
        private const string Mixed = "quest.side.test.kompass_gemischt";
        private const string Dungeon = "quest.side.test.kompass_dungeon";

        private readonly List<GameObject> _objects = new List<GameObject>();
        private readonly List<CompassCandidate> _result = new List<CompassCandidate>();
        private UiQuestEnvironment _env;
        private WorldMarkerRegistry _registry;
        private QuestMarkerModel _model;

        [SetUp]
        public void SetUp()
        {
            _env = new UiQuestEnvironment(TalkQuest(), TargetsQuest(), TrailQuest(), MixedQuest(), DungeonQuest());
            _registry = new WorldMarkerRegistry();
            _model = new QuestMarkerModel(_env.Quests, null, _registry);
            _result.Clear();
        }

        [TearDown]
        public void TearDown()
        {
            foreach (GameObject go in _objects)
            {
                if (go != null)
                {
                    Object.DestroyImmediate(go);
                }
            }

            _objects.Clear();
            _env.Dispose();
        }

        [Test]
        public void FocusQuest_MarksItsOpenTargets_DoneOnesDisappear()
        {
            Place("npc.test.kompass_corvin", new Vector3(0f, 0f, 50f));
            Place("loc.test.kompass_lager", new Vector3(100f, 2f, 0f));
            Start(Talk);
            Assert.That(_env.Quests.TrySetFocus(Talk), Is.True);

            _model.Collect(_result);
            Assert.That(_result.Count, Is.EqualTo(2));
            Assert.That(_result.TrueForAll(c => c.Kind == CompassMarkerKind.FocusQuest), Is.True);
            Assert.That(_result[0].Label, Is.EqualTo("Kompass reden"), "the quest title");

            _env.Publish(new AreaEntered("loc.test.kompass_lager"));
            _result.Clear();
            _model.Collect(_result);
            Assert.That(_result.Count, Is.EqualTo(1), "the camp is reached");
            Assert.That(_result[0].Z, Is.EqualTo(50f));
        }

        [Test]
        public void PositionsAreReadEveryTime_NpcsWalk()
        {
            Transform corvin = Place("npc.test.kompass_corvin", new Vector3(0f, 0f, 50f));
            Start(Talk);
            _env.Quests.TrySetFocus(Talk);
            _model.Collect(_result);

            corvin.position = new Vector3(-20f, 0f, 70f);
            _result.Clear();
            _model.Collect(_result);

            Assert.That(_result[0].X, Is.EqualTo(-20f));
        }

        [Test]
        public void OtherTrackedQuest_GivesSmallMarkers_UntrackedNone()
        {
            Place("npc.test.kompass_corvin", new Vector3(0f, 0f, 50f));
            Place("obj.test.kompass_ziel_1", new Vector3(10f, 0f, 10f));
            Start(Talk);
            Start(Targets);
            _env.Quests.TrySetFocus(Talk);
            Assert.That(_env.Quests.TrySetTracked(Targets, true), Is.True);

            _model.Collect(_result);
            Assert.That(_result.Exists(c => c.Kind == CompassMarkerKind.TrackedQuest), Is.True);

            _env.Quests.TrySetTracked(Targets, false);
            _result.Clear();
            _model.Collect(_result);
            Assert.That(_result.Exists(c => c.Kind == CompassMarkerKind.TrackedQuest), Is.False);
        }

        [Test]
        public void FocusQuestWithMoreThanThreeTargets_BecomesAFocusAreaAroundTheirMiddle()
        {
            Place("obj.test.kompass_ziel_1", new Vector3(0f, 0f, 0f));
            Place("obj.test.kompass_ziel_2", new Vector3(20f, 0f, 0f));
            Place("obj.test.kompass_ziel_3", new Vector3(0f, 0f, 20f));
            Place("obj.test.kompass_ziel_4", new Vector3(20f, 0f, 20f));
            Start(Targets);
            _env.Quests.TrySetFocus(Targets);

            _model.Collect(_result);

            Assert.That(_result.Count, Is.EqualTo(1));
            Assert.That(_result[0].Kind, Is.EqualTo(CompassMarkerKind.FocusQuest), "the focus quest's area keeps the focus behaviour");
            Assert.That(_result[0].X, Is.EqualTo(10f).Within(0.001f));
            Assert.That(_result[0].Z, Is.EqualTo(10f).Within(0.001f));
            Assert.That(_result[0].Radius, Is.EqualTo(50f), "at least the stage's search radius (GDD 02 7.3: 50–150 m)");
        }

        [Test]
        public void TrackedQuestWithMoreThanThreeTargets_BecomesASearchArea()
        {
            Place("npc.test.kompass_corvin", new Vector3(0f, 0f, 50f));
            for (int i = 0; i < 4; i++)
            {
                Place("obj.test.kompass_ziel_" + (i + 1), new Vector3(i * 40f, 0f, 0f));
            }

            Start(Talk);
            Start(Targets);
            _env.Quests.TrySetFocus(Talk);
            _env.Quests.TrySetTracked(Targets, true);

            _model.Collect(_result);

            CompassCandidate area = _result.Find(c => c.Kind == CompassMarkerKind.SearchArea);
            Assert.That(area.Radius, Is.EqualTo(60f + QuestMarkerModel.SearchAreaMargin).Within(0.01f), "spread 60 m plus margin");
            Assert.That(area.X, Is.EqualTo(60f).Within(0.001f));
        }

        [Test]
        public void TheLimitOfThreeCountsPerObjective_NotPerQuest()
        {
            Place("npc.test.kompass_corvin", new Vector3(0f, 0f, 50f));
            Place("loc.test.kompass_lager", new Vector3(100f, 0f, 0f));
            Place("obj.test.kompass_ziel_1", new Vector3(10f, 0f, 10f));
            Place("obj.test.kompass_ziel_2", new Vector3(30f, 0f, 10f));
            Start(Mixed);
            _env.Quests.TrySetFocus(Mixed);

            _model.Collect(_result);

            Assert.That(_result.Count, Is.EqualTo(4), "talk + go to + two objects: four markers, no area");
            Assert.That(_result.TrueForAll(c => c.Kind == CompassMarkerKind.FocusQuest && c.Radius == 0f), Is.True);
        }

        [Test]
        public void CountedObjectsOfAGroupDropOutOneByOne()
        {
            Place("obj.test.kompass_ziel_1", new Vector3(0f, 0f, 0f));
            Place("obj.test.kompass_ziel_2", new Vector3(50f, 0f, 0f));
            Place("obj.test.kompass_ziel_3", new Vector3(100f, 0f, 0f));
            Start(Targets);
            _env.Quests.TrySetFocus(Targets);
            _model.Collect(_result);
            Assert.That(_result.Count, Is.EqualTo(3));

            _env.Publish(new Interacted("obj.test.kompass_ziel_2", InteractionVerbs.Use));
            _result.Clear();
            _model.Collect(_result);

            Assert.That(_result.Count, Is.EqualTo(2));
            Assert.That(_result.Exists(c => c.X == 50f), Is.False, "the used object has no marker any more");
        }

        [Test]
        public void TransformsOfOneTargetCloseTogether_CountOnce()
        {
            Place("obj.test.kompass_ziel_1", new Vector3(0f, 0f, 0f));
            Place("obj.test.kompass_ziel_1", new Vector3(1f, 0f, 0.5f));
            Start(Targets);
            _env.Quests.TrySetFocus(Targets);

            _model.Collect(_result);

            Assert.That(_result.Count, Is.EqualTo(1), "two halves of one splinter are one target");
        }

        [Test]
        public void CandidatesCarryTheToneOfTheQuestCategory()
        {
            Place("npc.test.kompass_corvin", new Vector3(0f, 0f, 50f));
            Start(Talk);
            _env.Quests.TrySetFocus(Talk);

            _model.Collect(_result);

            Assert.That(_result[0].Tone, Is.EqualTo("side"));
            Assert.That(QuestMarkerModel.ToneOf(QuestCategory.Main), Is.EqualTo("main"));
            Assert.That(QuestMarkerModel.ToneOf(QuestCategory.Bounty), Is.EqualTo("bounty"));
            Assert.That(QuestMarkerModel.ToneOf(QuestCategory.Daily), Is.EqualTo("repeatable"));
        }

        [Test]
        public void StageMarkers_PointAtTheDungeonEntranceWhileTheTargetsAreElsewhere()
        {
            Place("obj.test.kompass_eingang", new Vector3(-80f, 0f, 20f));
            Start(Dungeon);
            _env.Quests.TrySetFocus(Dungeon);

            _model.Collect(_result);

            Assert.That(_result.Count, Is.EqualTo(1), "the boss is in another scene: only the entrance");
            Assert.That(_result[0].X, Is.EqualTo(-80f));
        }

        [Test]
        public void Trail_FollowsTheNextNode()
        {
            Place("spur.test.kompass#0", new Vector3(0f, 0f, 10f));
            Place("spur.test.kompass#1", new Vector3(0f, 0f, 20f));
            Place("spur.test.kompass#2", new Vector3(0f, 0f, 30f));
            Start(Trail);
            _env.Quests.TrySetFocus(Trail);
            _model.Collect(_result);
            Assert.That(_result[0].Z, Is.EqualTo(10f));

            _env.Publish(new TrailNodeReached("spur.test.kompass", 0));
            _result.Clear();
            _model.Collect(_result);

            Assert.That(_result.Count, Is.EqualTo(1));
            Assert.That(_result[0].Z, Is.EqualTo(20f));
        }

        [Test]
        public void TargetNotLoaded_GivesNoMarker()
        {
            Start(Talk);
            _env.Quests.TrySetFocus(Talk);

            _model.Collect(_result);

            Assert.That(_result, Is.Empty);
        }

        private void Start(string questId)
        {
            Assert.That(_env.Quests.TryStart(questId, "test"), Is.True, questId);
        }

        private Transform Place(string id, Vector3 position)
        {
            var go = new GameObject(id);
            go.transform.position = position;
            _objects.Add(go);
            _registry.Register(id, go.transform);
            return go.transform;
        }

        private static QuestSpec TalkQuest()
        {
            return new QuestSpecBuilder(Talk)
                .Title("Kompass reden", "Test.")
                .Category(QuestCategory.Side)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new TalkToObjective("o1", "npc.test.kompass_corvin"))
                    .Objective(new GoToObjective("o2", "loc.test.kompass_lager"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
        }

        private static QuestSpec TargetsQuest()
        {
            return new QuestSpecBuilder(Targets)
                .Title("Kompass Ziele", "Test.")
                .Category(QuestCategory.Side)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new InteractObjective("o1", 4, "obj.test.kompass_ziel_*"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
        }

        private static QuestSpec MixedQuest()
        {
            return new QuestSpecBuilder(Mixed)
                .Title("Kompass gemischt", "Test.")
                .Category(QuestCategory.Side)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new TalkToObjective("o1", "npc.test.kompass_corvin"))
                    .Objective(new GoToObjective("o2", "loc.test.kompass_lager"))
                    .Objective(new InteractObjective("o3", 2, "obj.test.kompass_ziel_1", "obj.test.kompass_ziel_2"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
        }

        private static QuestSpec DungeonQuest()
        {
            return new QuestSpecBuilder(Dungeon)
                .Title("Kompass Dungeon", "Test.")
                .Category(QuestCategory.Dungeon)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Text("Der Boss wartet unten.", "Der Eingang liegt im Westen.")
                    .Markers(50f, "obj.test.kompass_eingang")
                    .Objective(new KillSpecificObjective("o1", "boss.test.kompass_unten"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
        }

        private static QuestSpec TrailQuest()
        {
            return new QuestSpecBuilder(Trail)
                .Title("Kompass Spur", "Test.")
                .Category(QuestCategory.Side)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new FollowTrailObjective("o1", "spur.test.kompass", 3))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
        }
    }
}
