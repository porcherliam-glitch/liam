using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Save section <c>quests</c> (architecture 9.1, 9.2, load order 100): quest states with the objective states of the
    /// active stage (progress, timer, distinct ids, bonus given), visited stages, fulfilled objectives of earlier stages,
    /// decisions, ledger, tracking and focus survive a JSON round trip; loading sends no quest events and runs no actions;
    /// after <c>OnAfterLoad</c> objectives, fail rules and availability work again; "Sammle" reconciles with the inventory;
    /// unknown quests are kept; changed objectives are matched by id; a running quest whose saved stage no longer exists
    /// continues at a stage that exists (never stuck without objectives).
    /// </summary>
    [TestFixture]
    public sealed class QuestSaveTests
    {
        private const string QuestId = "quest.side.test.speichern";
        private const string Flag = "flag.eichental.test_schalter";
        private const string Wolf = "enemy.wolf.grauwolf";

        [Test]
        public void KeyOrderAndDto()
        {
            using (var env = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                Assert.That(env.QuestSaveable.SaveKey, Is.EqualTo("quests"));
                Assert.That(env.QuestSaveable.LoadOrder, Is.EqualTo(100));
                Assert.That(env.QuestSaveable.DataType, Is.EqualTo(typeof(QuestsDto)));
                Assert.That(SaveDtoValidator.Validate(typeof(QuestsDto), out string problem), Is.True, problem);
            }
        }

        [Test]
        public void RoundTrip_InTheMiddleOfAStage_KeepsEverything()
        {
            using (var source = new QuestTestEnvironment(Flags(), CreateQuest()))
            using (var target = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                source.Clock.PlaytimeSeconds = 600.0;
                source.Quests.TryStart(QuestId, "test");
                source.Publish(new ChoiceMade(QuestId + ".s10.o1", "b"));
                Assert.That(source.StageOf(QuestId), Is.EqualTo("s20"));
                KillWolf(source);
                source.Publish(new ClueInspected("clue.test.a"));
                source.Quests.Tick(20f);
                source.Quests.TrySetFocus(QuestId);

                using (var started = new EventRecorder<QuestStarted>(target.Bus))
                using (var stages = new EventRecorder<QuestStageChanged>(target.Bus))
                {
                    source.SaveAndLoadInto(target);

                    Assert.That(started.Count + stages.Count, Is.EqualTo(0), "loading sends no quest events (architecture 9.1)");
                }

                Assert.That(target.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
                Assert.That(instance.Status, Is.EqualTo(QuestStatus.Active));
                Assert.That(instance.StageId, Is.EqualTo("s20"));
                Assert.That(instance.StartedAtPlaytime, Is.EqualTo(600.0));
                Assert.That(instance.VisitedStages, Is.EqualTo(new[] { "s10", "s20" }));
                Assert.That(instance.Objectives[0].Progress, Is.EqualTo(1), "kills");
                Assert.That(instance.Objectives[1].Extra, Is.EqualTo("clue.test.a"), "inspected clues");
                Assert.That(instance.Objectives[2].TimerRemaining, Is.EqualTo(100f), "timer of the optional run");
                Assert.That(instance.Objectives[3].Done, Is.True, "optional condition objective");
                Assert.That(instance.BonusGivenObjectives, Is.EquivalentTo(new[] { "s20.o4" }), "bonus of the optional objective already paid");
                Assert.That(instance.LedgerEntries, Is.EqualTo(new[] { "ledger.c1" }));
                Assert.That(target.Quests.TryGetChoice(QuestId, "s10.o1", out string option) && option == "b", Is.True);
                Assert.That(target.Quests.IsObjectiveDone(QuestId, "s10", "o1"), Is.True, "objective of an earlier stage");
                Assert.That(target.Quests.IsTracked(QuestId), Is.True);
                Assert.That(target.Quests.FocusQuestId, Is.EqualTo(QuestId));
                Assert.That(target.Actions.Entries, Is.Empty, "no stage or bonus actions while loading");
            }
        }

        [Test]
        public void AfterLoad_ObjectivesTimersAndFailRulesWorkAgain()
        {
            using (var source = new QuestTestEnvironment(Flags(), CreateQuest()))
            using (var target = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                source.Quests.TryStart(QuestId, "test");
                source.Publish(new ChoiceMade(QuestId + ".s10.o1", "a"));
                source.SaveAndLoadInto(target);

                KillWolf(target);
                KillWolf(target);
                Assert.That(target.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
                Assert.That(instance.Objectives[0].Done, Is.True, "router subscribed again");

                target.Quests.Tick(121f);
                Assert.That(instance.Objectives[2].Failed, Is.True, "timer runs again");

                target.World.SetBool(Flag, true, "test");
                target.Settle();
                Assert.That(instance.Status, Is.EqualTo(QuestStatus.Failed), "quest fail rule watched again");
            }
        }

        [Test]
        public void Collect_ReconcilesWithTheInventoryAfterLoading()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.side.test.sammeln")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(new CollectObjective("o1", "item.herb.blutwurz", 5)).Next("s20"))
                .Stage(new StageBuilder("s20").Objective(new TalkToObjective("o1", "npc.eichental.alwine")).EndSuccess())
                .Build();
            using (var source = new QuestTestEnvironment(Flags(), quest))
            using (var target = new QuestTestEnvironment(Flags(), quest))
            {
                source.Inventory.Add("item.herb.blutwurz", 2);
                source.Quests.TryStart("quest.side.test.sammeln", "test");
                target.Inventory.Add("item.herb.blutwurz", 5);

                source.SaveAndLoadInto(target);

                Assert.That(target.StageOf("quest.side.test.sammeln"), Is.EqualTo("s20"), "the inventory (loaded before) already holds 5");
            }
        }

        [Test]
        public void FinishedQuest_RoundTrip_KeepsOutcomeCountAndCooldown()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.bounty.test.woelfe")
                .Giver("npc.eichental.hauptmann")
                .Repeat(QuestRepeatMode.Cooldown, 2f)
                .Stage(new StageBuilder("s10").Objective(new KillObjective("o1", Wolf, 1)).EndSuccess())
                .Build();
            using (var source = new QuestTestEnvironment(Flags(), quest))
            using (var target = new QuestTestEnvironment(Flags(), quest))
            {
                source.Clock.PlaytimeSeconds = 3600.0;
                source.Quests.TryStart("quest.bounty.test.woelfe", "test");
                KillWolf(source);

                source.SaveAndLoadInto(target);

                Assert.That(target.Quests.TryGetInstance("quest.bounty.test.woelfe", out QuestInstance instance), Is.True);
                Assert.That(instance.Status, Is.EqualTo(QuestStatus.Completed));
                Assert.That(instance.EndStageId, Is.EqualTo("s10"));
                Assert.That(instance.CompletionCount, Is.EqualTo(1));
                Assert.That(instance.AvailableAgainAtPlaytime, Is.EqualTo(3600.0 + 7200.0));
                Assert.That(target.StatusOf("quest.bounty.test.woelfe"), Is.EqualTo(QuestStatus.Completed), "cool-down still running");

                target.Clock.AdvanceHours(2.5);
                target.Quests.Tick(1.1f);
                target.Settle();
                Assert.That(target.StatusOf("quest.bounty.test.woelfe"), Is.EqualTo(QuestStatus.Available));
            }
        }

        [Test]
        public void UnknownQuestInTheSave_IsKeptAndSavedAgain()
        {
            using (var env = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                var dto = new QuestsDto();
                dto.Instances.Add(new QuestInstanceDto { QuestId = "quest.side.entfernt.alt", Status = QuestStatusIds.Completed, StageId = "s50" });
                dto.Instances.Add(new QuestInstanceDto { QuestId = QuestId, Status = "unbekannt_kaputt", StageId = "s10" });

                env.QuestSaveable.Load(dto, QuestTestEnvironment.LoadedGame);
                env.QuestSaveable.OnAfterLoad(QuestTestEnvironment.LoadedGame);

                Assert.That(env.QuestSaveable.OrphanCount, Is.EqualTo(2));
                Assert.That(env.Quests.Instances, Is.Empty);
                var saved = (QuestsDto)env.QuestSaveable.Save();
                Assert.That(saved.Instances.ConvertAll(i => i.QuestId), Is.EquivalentTo(new[] { "quest.side.entfernt.alt", QuestId }));
            }
        }

        [Test]
        public void ChangedStage_ObjectivesAreMatchedById()
        {
            using (var env = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                var dto = new QuestsDto();
                var entry = new QuestInstanceDto { QuestId = QuestId, Status = QuestStatusIds.Active, StageId = "s20" };
                entry.Objectives.Add(new ObjectiveStateDto { Id = "o2", Progress = 1, Extra = "clue.test.b" });
                entry.Objectives.Add(new ObjectiveStateDto { Id = "o7", Progress = 5, Done = true });
                dto.Instances.Add(entry);

                env.QuestSaveable.Load(dto, QuestTestEnvironment.LoadedGame);
                env.QuestSaveable.OnAfterLoad(QuestTestEnvironment.LoadedGame);

                Assert.That(env.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
                Assert.That(instance.Objectives.Count, Is.EqualTo(4), "the objectives of the current data");
                Assert.That(instance.Objectives[0].Progress, Is.EqualTo(0), "o1 not in the save: starts at 0");
                Assert.That(instance.Objectives[1].Extra, Is.EqualTo("clue.test.b"));
                Assert.That(instance.Objectives[2].TimerRemaining, Is.EqualTo(120f), "new timer objective starts full");
            }
        }

        [Test]
        public void LostStage_ContinuesAfterTheLastExistingVisitedStage_WithBoundObjectives()
        {
            using (var env = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                var dto = new QuestsDto { FocusQuestId = QuestId };
                var entry = new QuestInstanceDto { QuestId = QuestId, Status = QuestStatusIds.Active, StageId = "s99", Tracked = true };
                entry.VisitedStages.Add("s10");
                entry.VisitedStages.Add("s99");
                entry.CompletedObjectives.Add("s10.o1");
                entry.Choices["s10.o1"] = "a";
                entry.Objectives.Add(new ObjectiveStateDto { Id = "o1", Progress = 1 });
                dto.Instances.Add(entry);

                env.QuestSaveable.Load(dto, QuestTestEnvironment.LoadedGame);
                env.QuestSaveable.OnAfterLoad(QuestTestEnvironment.LoadedGame);
                env.Settle();

                Assert.That(env.QuestSaveable.OrphanCount, Is.EqualTo(0));
                Assert.That(env.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
                Assert.That(instance.Status, Is.EqualTo(QuestStatus.Active));
                Assert.That(instance.StageId, Is.EqualTo("s20"), "s10 is the last visited stage that still exists, its exit is s20");
                Assert.That(instance.VisitedStages, Is.EqualTo(new[] { "s10", "s99", "s20" }));
                Assert.That(instance.Objectives.Count, Is.EqualTo(4), "the objectives of s20");
                Assert.That(instance.Objectives[0].Progress, Is.EqualTo(0), "states saved for the lost stage are not applied");
                Assert.That(instance.Objectives[2].TimerRemaining, Is.EqualTo(120f), "fresh timer");
                Assert.That(env.Quests.IsTracked(QuestId), Is.True);
                Assert.That(env.LogCapture.Sink.Contains(LogLevel.Warning, "no longer exists"), Is.True, env.LogCapture.Sink.Dump());

                KillWolf(env);
                KillWolf(env);
                Assert.That(instance.Objectives[0].Done, Is.True, "the objectives of the fallback stage are bound");
                env.Publish(new ClueInspected("clue.test.a"));
                env.Publish(new ClueInspected("clue.test.b"));
                Assert.That(env.StageOf(QuestId), Is.EqualTo("s30"), "the quest goes on to its end");
            }
        }

        [Test]
        public void LostStage_BranchOfTheLastStage_SeesTheLoadedDecision()
        {
            QuestSpec quest = new QuestSpecBuilder("quest.side.test.weg")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new ChooseObjective("o1", new ChoiceOption("a", "A"), new ChoiceOption("b", "B")))
                    .Branch(new QuestChoiceIs(string.Empty, "s10", "o1", "b"), "s20_b")
                    .Next("s20_a"))
                .Stage(new StageBuilder("s20_a").Objective(new TalkToObjective("o1", "npc.eichental.alwine")).EndSuccess())
                .Stage(new StageBuilder("s20_b").Objective(new TalkToObjective("o1", "npc.eichental.bauer_hollmann")).EndSuccess())
                .Build();
            using (var env = new QuestTestEnvironment(Flags(), quest))
            {
                var dto = new QuestsDto();
                var entry = new QuestInstanceDto { QuestId = "quest.side.test.weg", Status = QuestStatusIds.Active, StageId = "s20_zweiter_weg" };
                entry.VisitedStages.Add("s10");
                entry.VisitedStages.Add("s20_zweiter_weg");
                entry.CompletedObjectives.Add("s10.o1");
                entry.Choices["s10.o1"] = "b";
                dto.Instances.Add(entry);

                env.QuestSaveable.Load(dto, QuestTestEnvironment.LoadedGame);
                env.QuestSaveable.OnAfterLoad(QuestTestEnvironment.LoadedGame);

                Assert.That(env.StageOf("quest.side.test.weg"), Is.EqualTo("s20_b"), "the branch is evaluated after the quest state is loaded");
            }
        }

        [Test]
        public void LostStage_WithoutAnyExistingVisitedStage_RestartsAtTheStartStage()
        {
            using (var env = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                var dto = new QuestsDto();
                var entry = new QuestInstanceDto { QuestId = QuestId, Status = QuestStatusIds.Active, StageId = "s99" };
                entry.VisitedStages.Add("s05_alt");
                entry.VisitedStages.Add("s99");
                dto.Instances.Add(entry);

                env.QuestSaveable.Load(dto, QuestTestEnvironment.LoadedGame);
                env.QuestSaveable.OnAfterLoad(QuestTestEnvironment.LoadedGame);
                env.Settle();

                Assert.That(env.StageOf(QuestId), Is.EqualTo("s10"));
                Assert.That(env.StatusOf(QuestId), Is.EqualTo(QuestStatus.Active));
                env.Publish(new ChoiceMade(QuestId + ".s10.o1", "b"));
                Assert.That(env.StageOf(QuestId), Is.EqualTo("s20"), "the objective of the start stage is bound");
            }
        }

        [Test]
        public void NewGame_ClearsAllQuests()
        {
            using (var env = new QuestTestEnvironment(Flags(), CreateQuest()))
            {
                env.Quests.TryStart(QuestId, "test");

                env.QuestSaveable.Load(null, LoadContext.NewGame);
                env.QuestSaveable.OnAfterLoad(LoadContext.NewGame);

                Assert.That(env.Quests.Instances, Is.Empty);
                Assert.That(env.Quests.TrackedQuestIds, Is.Empty);
                Assert.That(env.StatusOf(QuestId), Is.EqualTo(QuestStatus.Unknown));
                Assert.That(env.Bus.GetSubscriberCount<EnemyKilled>(), Is.LessThanOrEqualTo(1), "no bindings of the old game deliver events");
                KillWolf(env);
                Assert.That(env.Quests.Instances, Is.Empty);
            }
        }

        private static FlagRegistry Flags()
        {
            return FlagRegistry.FromSpecs(FlagSpec.Bool(Flag), FlagSpec.Bool("flag.eichental.test_bonus"));
        }

        private static QuestSpec CreateQuest()
        {
            return new QuestSpecBuilder(QuestId)
                .Title("Speichertest")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .CanFail()
                .FailWhen(new FlagIs(Flag, 1), string.Empty, "schalter")
                .Stage(new StageBuilder("s10")
                    .Objective(new ChooseObjective("o1", new ChoiceOption("a", "A"), new ChoiceOption("b", "B")))
                    .OnComplete(new AddLedgerEntry(string.Empty, "ledger.c1"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20")
                    .Objective(new KillObjective("o1", Wolf, 2))
                    .Objective(new InspectCluesObjective("o2", 2, "clue.test.a", "clue.test.b"))
                    .Optional(new ReachInTimeObjective("o3", "loc.eichental.tor", 120f))
                    .Optional(new ConditionObjective("o4", new Always()), new SetFlag("flag.eichental.test_bonus", 1))
                    .Next("s30"))
                .Stage(new StageBuilder("s30").Objective(new TalkToObjective("o1", "npc.eichental.bauer_hollmann")).EndSuccess())
                .LedgerEntry("ledger.c1", "Du hast gewählt.")
                .Build();
        }

        private static void KillWolf(QuestTestEnvironment env)
        {
            env.Publish(new EnemyKilled(Wolf, string.Empty, string.Empty, SubjectIds.Player, string.Empty, string.Empty, 1, default(Vector3)));
        }
    }
}
