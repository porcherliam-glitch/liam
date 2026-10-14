using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// The quest service (§16, architecture 11.7, GDD 02 4.3) with small code-built quests: start with start conditions and
    /// start stages, completion modes (all / one / at least n), optional objectives with bonus actions, actions on start and
    /// on completion, branches (first true wins, default exit), failing (fail rules of quest and stage, failure end stage,
    /// failed required objective, actions), repeatable quests with cool-down, follow-up quests, tracking (at most 3, focus),
    /// ledger, decisions, quest-local flags, save lock, debug functions and re-entrancy.
    /// </summary>
    [TestFixture]
    public sealed class QuestServiceTests
    {
        private const string Wolf = "enemy.wolf.grauwolf";
        private const string Npc = "npc.eichental.bauer_hollmann";
        private const string Flag = "flag.eichental.test_schalter";
        private const string Counter = "stat.global.test_zaehler";

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
        public void Start_UnknownQuest_OrUnmetStartCondition_IsRefused()
        {
            Use(Simple("quest.side.test.a").StartCondition(new FlagIs(Flag, 1)).Build());

            Assert.That(_env.Quests.TryStart("quest.side.test.gibt_es_nicht", "test"), Is.False);
            Assert.That(_env.Quests.CanStart("quest.side.test.a", out string reason), Is.False);
            Assert.That(reason, Is.EqualTo("Startbedingungen nicht erfüllt"));
            Assert.That(_env.Quests.TryStart("quest.side.test.a", "test"), Is.False);

            _env.World.SetBool(Flag, true, "test");
            Assert.That(_env.Quests.TryStart("quest.side.test.a", "test"), Is.True);
            Assert.That(_env.Quests.TryStart("quest.side.test.a", "test"), Is.False, "already running");
            Assert.That(_env.Quests.CanStart("quest.side.test.a", out reason), Is.False);
            Assert.That(reason, Is.EqualTo("läuft bereits"));
        }

        [Test]
        public void TryStartForced_IgnoresTheStartConditions()
        {
            Use(Simple("quest.side.test.a").StartCondition(new Never()).Build());

            Assert.That(_env.Quests.TryStartForced("quest.side.test.a", "console"), Is.True);
            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Active));
        }

        [Test]
        public void Start_PublishesQuestStartedAndTheFirstStage_AndRunsStartActions()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .Title("Test")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).OnStart(new SetFlag(Flag, 1)).Next("s20"))
                .Stage(new StageBuilder("s20").Objective(Kill("o1", 1)).EndSuccess())
                .Build());
            using (var started = new EventRecorder<QuestStarted>(_env.Bus))
            using (var stages = new EventRecorder<QuestStageChanged>(_env.Bus))
            {
                _env.Quests.TryStart("quest.side.test.a", "test");

                Assert.That(started.Count, Is.EqualTo(1));
                Assert.That(stages.Last.StageId, Is.EqualTo("s10"));
                Assert.That(stages.Last.PreviousStageId, Is.EqualTo(string.Empty));
                Assert.That(_env.World.GetBool(Flag), Is.True);
            }
        }

        [Test]
        public void StartBranches_PickTheStartStage()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .StartBranch(new FlagIs(Flag, 1), "s20")
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).Next("s20"))
                .Stage(new StageBuilder("s20").Objective(Kill("o1", 1)).EndSuccess())
                .Build());
            _env.World.SetBool(Flag, true, "test");

            _env.Quests.TryStart("quest.side.test.a", "test");

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
        }

        [Test]
        public void ModeAll_NeedsEveryRequiredObjective()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 2)).Objective(new TalkToObjective("o2", Npc)).Next("s20"))
                .Stage(Final("s20"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            KillWolves(2);
            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s10"));
            _env.Publish(new NPCTalkedTo(Npc, string.Empty));

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
        }

        [Test]
        public void ModeAny_OneObjectiveIsEnough()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 2)).Objective(new TalkToObjective("o2", Npc)).AnyObjective().Next("s20"))
                .Stage(Final("s20"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            _env.Publish(new NPCTalkedTo(Npc, string.Empty));

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
        }

        [Test]
        public void ModeAtLeast_TwoOfThreeClues()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(new InspectCluesObjective("o1", 1, "clue.test.a"))
                    .Objective(new InspectCluesObjective("o2", 1, "clue.test.b"))
                    .Objective(new InspectCluesObjective("o3", 1, "clue.test.c"))
                    .AtLeast(2)
                    .Next("s20"))
                .Stage(Final("s20"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            _env.Publish(new ClueInspected("clue.test.c"));
            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s10"));
            _env.Publish(new ClueInspected("clue.test.a"));

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
        }

        [Test]
        public void OnComplete_RunsBeforeTheBranches_FirstTrueBranchWins()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(Kill("o1", 1))
                    .OnComplete(new AddToFlag(Counter, 5))
                    .Branch(new FlagIs(Counter, FlagComparison.GreaterOrEqual, 10), "s20_viel")
                    .Branch(new FlagIs(Counter, FlagComparison.GreaterOrEqual, 5), "s20_mittel")
                    .Branch(new Always(), "s20_immer")
                    .Next("s20_standard"))
                .Stage(Final("s20_viel"))
                .Stage(Final("s20_mittel"))
                .Stage(Final("s20_immer"))
                .Stage(Final("s20_standard"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            KillWolves(1);

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20_mittel"));
        }

        [Test]
        public void NoBranchApplies_DefaultExitIsUsed()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).Branch(new FlagIs(Flag, 1), "s20_flag").Next("s20_standard"))
                .Stage(Final("s20_flag"))
                .Stage(Final("s20_standard"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            KillWolves(1);

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20_standard"));
        }

        [Test]
        public void SuccessEnd_RunsRewardsOnce_AndPublishesQuestCompleted()
        {
            Use(Simple("quest.side.test.a").Rewards(new GiveTestGold(60), new RecordAction("GiveXp")).Build());
            using (var completed = new EventRecorder<QuestCompleted>(_env.Bus))
            {
                _env.Quests.TryStart("quest.side.test.a", "test");
                KillWolves(3);

                Assert.That(completed.Count, Is.EqualTo(1));
                Assert.That(completed.Last.EndStageId, Is.EqualTo("s10"));
                Assert.That(_env.Inventory.Gold, Is.EqualTo(60));
                Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Completed));
                Assert.That(_env.Quests.TryStart("quest.side.test.a", "test"), Is.False, "not repeatable");
            }
        }

        [Test]
        public void FailureEndStage_FailsTheQuest_WithoutRewards()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Rewards(new GiveTestGold(60))
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).Branch(new FlagIs(Flag, 1), "s90_gescheitert").Next("s20"))
                .Stage(Final("s20"))
                .Stage(new StageBuilder("s90_gescheitert").Text("Zu spät.").ActionOnly().EndFailure())
                .Build());
            _env.World.SetBool(Flag, true, "test");
            using (var failed = new EventRecorder<QuestFailed>(_env.Bus))
            {
                _env.Quests.TryStart("quest.side.test.a", "test");
                KillWolves(1);

                Assert.That(failed.Count, Is.EqualTo(1));
                Assert.That(failed.Last.ReasonId, Is.EqualTo("s90_gescheitert"));
                Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Failed));
                Assert.That(_env.Inventory.Gold, Is.EqualTo(0));
            }
        }

        [Test]
        public void QuestFailRule_WatchesItsCondition_AndFailsAtOnce()
        {
            Use(Simple("quest.side.test.a").CanFail().FailWhen(new FlagIs(Flag, 1), string.Empty, "hollmann_tot").Build());
            using (var failed = new EventRecorder<QuestFailed>(_env.Bus))
            {
                _env.Quests.TryStart("quest.side.test.a", "test");
                KillWolves(1);
                Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Active));

                _env.World.SetBool(Flag, true, "test");
                _env.Settle();

                Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Failed));
                Assert.That(failed.Last.ReasonId, Is.EqualTo("hollmann_tot"));
                Assert.That(_env.Watcher.WatchCount, Is.EqualTo(0), "all watches of the quest released");
            }
        }

        [Test]
        public void QuestFailRule_AlreadyTrueAtStart_FailsAtOnce()
        {
            Use(Simple("quest.side.test.a").FailWhen(new FlagIs(Flag, 1), string.Empty, "zu_spaet").Build());
            _env.World.SetBool(Flag, true, "test");

            _env.Quests.TryStart("quest.side.test.a", "test");

            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Failed));
        }

        [Test]
        public void StageFailRule_OnlyWhileTheStageRuns_AndCanJumpToAFailureStage()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).FailWhen(new FlagIs(Flag, 1), "s90_gescheitert", "eskorte_tot").Next("s20"))
                .Stage(new StageBuilder("s20").Objective(new TalkToObjective("o1", Npc)).Next("s30"))
                .Stage(Final("s30"))
                .Stage(new StageBuilder("s90_gescheitert").ActionOnly().EndFailure())
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");
            KillWolves(1);

            _env.World.SetBool(Flag, true, "test");
            _env.Settle();
            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Active), "rule of s10 ends with s10");

            _env.Quests.TrySetStage("quest.side.test.a", "s10", "debug");
            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Failed), "rule already true when s10 starts again");
            Assert.That(_env.Quests.IsStageReached("quest.side.test.a", "s90_gescheitert"), Is.True);
        }

        [Test]
        public void TimeLimit_RunningOut_FailsARequiredObjective_AndTheQuest()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(new ReachInTimeObjective("o1", "loc.eichental.tuer_haus_wenna", 120f)).Next("s20"))
                .Stage(Final("s20"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");
            _env.Quests.TryGetInstance("quest.side.test.a", out QuestInstance instance);

            _env.Quests.Tick(100f);
            Assert.That(instance.Objectives[0].TimerRemaining, Is.EqualTo(20f));
            _env.Quests.Tick(25f);

            Assert.That(instance.Objectives[0].Failed, Is.True);
            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Failed));
            Assert.That(instance.FailReasonId, Is.EqualTo(QuestService.ObjectiveFailedReason));
        }

        [Test]
        public void TimeLimit_OptionalObjective_FailsAlone_StageContinues()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s25")
                    .Objective(new GoToObjective("o1", "loc.eichental.dorfrand", 10f))
                    .Optional(new ReachInTimeObjective("o3", "loc.eichental.tuer_haus_wenna", 120f), new SetFlag(Flag, 1))
                    .Next("s30"))
                .Stage(Final("s30"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            _env.Quests.Tick(121f);
            _env.Publish(new AreaEntered("loc.eichental.tuer_haus_wenna"));
            _env.Publish(new AreaEntered("loc.eichental.dorfrand"));

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s30"));
            Assert.That(_env.World.GetBool(Flag), Is.False, "too late: no bonus");
        }

        [Test]
        public void Actions_StartQuest_SetQuestStage_CompleteQuest_FailQuest()
        {
            Use(Simple("quest.side.test.a").Build(), Simple("quest.side.test.b").Build(), Simple("quest.side.test.c").Build(),
                new QuestSpecBuilder("quest.side.test.d")
                    .StartTrigger(QuestStartTriggerKind.Automatic)
                    .Stage(new StageBuilder("s10").Objective(Kill("o1", 9)).Next("s20"))
                    .Stage(new StageBuilder("s20").Objective(Kill("o1", 9)).Next("s30"))
                    .Stage(Final("s30"))
                    .Build());
            ActionContext ctx = ActionContext.ForPlayer(_env.Services, "dlg.test");

            new StartQuest("quest.side.test.a").Execute(ctx);
            new StartQuest("quest.side.test.b").Execute(ctx);
            new StartQuest("quest.side.test.d").Execute(ctx);
            new CompleteQuest("quest.side.test.a").Execute(ctx);
            new FailQuest("quest.side.test.b", "verraten").Execute(ctx);
            new SetQuestStage("quest.side.test.d", "s20").Execute(ctx);

            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Completed));
            Assert.That(_env.StatusOf("quest.side.test.b"), Is.EqualTo(QuestStatus.Failed));
            Assert.That(_env.Quests.TryGetInstance("quest.side.test.b", out QuestInstance b) && b.FailReasonId == "verraten", Is.True);
            Assert.That(_env.StageOf("quest.side.test.d"), Is.EqualTo("s20"));
            Assert.That(_env.StatusOf("quest.side.test.c"), Is.EqualTo(QuestStatus.Unknown));
            Assert.That(_env.Quests.TryComplete("quest.side.test.c", "test"), Is.False, "not active");
        }

        [Test]
        public void Repeatable_WithCooldown_CanStartAgainAfterThePause()
        {
            Use(Simple("quest.bounty.test.woelfe").Giver(Npc).Repeat(QuestRepeatMode.Cooldown, 2f).Build());
            Assert.That(_env.StatusOf("quest.bounty.test.woelfe"), Is.EqualTo(QuestStatus.Available));

            _env.Quests.TryStart("quest.bounty.test.woelfe", "test");
            KillWolves(3);
            Assert.That(_env.StatusOf("quest.bounty.test.woelfe"), Is.EqualTo(QuestStatus.Completed));
            Assert.That(_env.Quests.CanStart("quest.bounty.test.woelfe", out string reason), Is.False);
            Assert.That(reason, Is.EqualTo("Abklingzeit läuft"));

            _env.Clock.AdvanceHours(2.1);
            _env.Quests.Tick(1.1f);
            _env.Settle();
            Assert.That(_env.StatusOf("quest.bounty.test.woelfe"), Is.EqualTo(QuestStatus.Available), "offered again at the giver");

            Assert.That(_env.Quests.TryStart("quest.bounty.test.woelfe", "test"), Is.True);
            KillWolves(3);
            Assert.That(_env.Quests.TryGetInstance("quest.bounty.test.woelfe", out QuestInstance instance), Is.True);
            Assert.That(instance.CompletionCount, Is.EqualTo(2));
        }

        [Test]
        public void FollowUp_AutoStart_StartsTheNextQuest()
        {
            Use(Simple("quest.main.test.teil1").FollowUp("quest.main.test.teil2", FollowUpMode.AutoStart).Build(),
                Simple("quest.main.test.teil2").Build());

            _env.Quests.TryStart("quest.main.test.teil1", "test");
            KillWolves(3);

            Assert.That(_env.StatusOf("quest.main.test.teil1"), Is.EqualTo(QuestStatus.Completed));
            Assert.That(_env.StatusOf("quest.main.test.teil2"), Is.EqualTo(QuestStatus.Active));
        }

        [Test]
        public void Tracking_AtMostThree_MainQuestBecomesFocus()
        {
            Use(Simple("quest.side.test.a").Build(), Simple("quest.side.test.b").Build(), Simple("quest.side.test.c").Build(),
                Simple("quest.side.test.d").Build(), Simple("quest.main.test.haupt").Category(QuestCategory.Main).Build());

            _env.Quests.TryStart("quest.side.test.a", "test");
            _env.Quests.TryStart("quest.side.test.b", "test");
            _env.Quests.TryStart("quest.side.test.c", "test");
            _env.Quests.TryStart("quest.side.test.d", "test");

            Assert.That(_env.Quests.TrackedQuestIds, Is.EqualTo(new[] { "quest.side.test.a", "quest.side.test.b", "quest.side.test.c" }));
            Assert.That(_env.Quests.FocusQuestId, Is.EqualTo("quest.side.test.a"));
            Assert.That(_env.Quests.TrySetTracked("quest.side.test.d", true), Is.False, "limit of 3 (§16.6)");

            Assert.That(_env.Quests.TrySetTracked("quest.side.test.b", false), Is.True);
            _env.Quests.TryStart("quest.main.test.haupt", "test");
            Assert.That(_env.Quests.FocusQuestId, Is.EqualTo("quest.main.test.haupt"), "a new main quest becomes the focus");

            Assert.That(_env.Quests.TrySetFocus("quest.side.test.c"), Is.True);
            Assert.That(_env.Quests.TrySetTracked("quest.side.test.c", false), Is.True);
            Assert.That(_env.Quests.FocusQuestId, Is.EqualTo("quest.main.test.haupt"), "next focus by category priority");
        }

        [Test]
        public void Ledger_EntriesOnceInOrder_WithVisibilityCondition()
        {
            Use(Simple("quest.side.test.a")
                .LedgerEntry("ledger.c1", "Du hast verhandelt.")
                .LedgerEntry("ledger.c2", "Folge: Harrik hat dir geholfen.", true, new FlagIs(Flag, 1))
                .Build());
            ActionContext ctx = ActionContext.ForPlayer(_env.Services, "quest.side.test.a");
            _env.Quests.TryStart("quest.side.test.a", "test");

            new AddLedgerEntry(string.Empty, "ledger.c1").Execute(ctx);
            new AddLedgerEntry(string.Empty, "ledger.c1").Execute(ctx);
            new AddLedgerEntry("quest.side.test.a", "ledger.c2").Execute(ctx);
            Assert.That(_env.Quests.AddLedgerEntry("quest.side.test.a", "ledger.c9"), Is.False, "undefined entry");

            Assert.That(_env.Quests.GetLedger("quest.side.test.a").ConvertAll(l => l.Id), Is.EqualTo(new[] { "ledger.c1" }), "c2 hidden until discovered");
            _env.World.SetBool(Flag, true, "test");
            List<QuestLedgerLine> lines = _env.Quests.GetLedger("quest.side.test.a");
            Assert.That(lines.ConvertAll(l => l.Id), Is.EqualTo(new[] { "ledger.c1", "ledger.c2" }));
            Assert.That(lines[1].IsConsequence, Is.True);
        }

        [Test]
        public void Choice_IsRecorded_AndDrivesTheBranch()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s35_gnade")
                    .Objective(new ChooseObjective("o1", new ChoiceOption("a", "verschonen"), new ChoiceOption("b", "töten")))
                    .Branch(new QuestChoiceIs(string.Empty, "s35_gnade", "o1", "a"), "s40_verschont")
                    .Next("s40_getoetet")
                    .Ledger("ledger.c1"))
                .Stage(Final("s40_verschont"))
                .Stage(Final("s40_getoetet"))
                .LedgerEntry("ledger.c1", "Du hast entschieden.")
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            _env.Publish(new ChoiceMade("quest.side.test.a.s35_gnade.o1", "x"));
            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s35_gnade"), "unknown option");
            _env.Publish(new ChoiceMade("quest.side.test.a.s35_gnade.o1", "a"));

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s40_verschont"));
            Assert.That(_env.Quests.TryGetChoice("quest.side.test.a", "s35_gnade.o1", out string option), Is.True);
            Assert.That(option, Is.EqualTo("a"));
        }

        [Test]
        public void ConditionObjective_FollowsTheWorldState()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(new ConditionObjective("o1", new FlagIs(Counter, FlagComparison.GreaterOrEqual, 3))).Next("s20"))
                .Stage(Final("s20"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            _env.World.Add(Counter, 2, "test");
            _env.Settle();
            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s10"));
            _env.World.Add(Counter, 1, "test");
            _env.Settle();

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
        }

        [Test]
        public void ConditionObjective_AlreadyTrue_IsDoneAtOnce()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(new ConditionObjective("o1", new FlagIs(Flag, 1))).Next("s20"))
                .Stage(Final("s20"))
                .Build());
            _env.World.SetBool(Flag, true, "test");

            _env.Quests.TryStart("quest.side.test.a", "test");

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
        }

        [Test]
        public void OneEvent_FinishesOnlyOneStage()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).Next("s20"))
                .Stage(new StageBuilder("s20").Objective(Kill("o1", 1)).Next("s30"))
                .Stage(Final("s30"))
                .Build());
            _env.Quests.TryStart("quest.side.test.a", "test");

            KillWolves(1);
            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"), "the kill that finished s10 is not counted in s20");
            KillWolves(1);

            Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s30"));
        }

        [Test]
        public void StageCompletionThatStartsAnotherQuest_IsProcessedInOrder()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                    .StartTrigger(QuestStartTriggerKind.Automatic)
                    .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).OnComplete(new StartQuest("quest.side.test.b")).Next("s20"))
                    .Stage(Final("s20"))
                    .Build(),
                Simple("quest.side.test.b").Build());
            using (var stages = new EventRecorder<QuestStageChanged>(_env.Bus))
            {
                _env.Quests.TryStart("quest.side.test.a", "test");
                KillWolves(1);

                Assert.That(_env.StageOf("quest.side.test.a"), Is.EqualTo("s20"));
                Assert.That(_env.StatusOf("quest.side.test.b"), Is.EqualTo(QuestStatus.Active));
                Assert.That(_env.Quests.TryGetInstance("quest.side.test.b", out QuestInstance b), Is.True);
                Assert.That(b.Objectives[0].Progress, Is.EqualTo(0), "the kill happened before b started");
                Assert.That(stages.Count, Is.EqualTo(3));
            }
        }

        [Test]
        public void QuestLocalFlags_AreResetAtTheEnd()
        {
            Use(Simple("quest.side.test.a").Build());
            _env.Quests.TryStart("quest.side.test.a", "test");
            _env.World.SetInt("quest.side.test.a.lokal.versuche", 2, "quest.side.test.a");

            KillWolves(3);

            Assert.That(_env.World.GetInt("quest.side.test.a.lokal.versuche"), Is.EqualTo(0));
        }

        [Test]
        public void SaveLockStage_BlocksSavingWhileItRuns()
        {
            Use(new QuestSpecBuilder("quest.side.test.a")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 1)).SaveLock().Next("s20"))
                .Stage(Final("s20"))
                .Build());

            _env.Quests.TryStart("quest.side.test.a", "test");
            Assert.That(_env.SaveLocks.IsSaveAllowed(out string reason), Is.False);
            Assert.That(reason, Is.EqualTo(QuestService.SaveLockReasonKey));

            KillWolves(1);
            Assert.That(_env.SaveLocks.IsSaveAllowed(out _), Is.True);
        }

        [Test]
        public void Debug_CompleteObjective_SetProgress_AndResetQuest()
        {
            Use(Simple("quest.side.test.a").Build());
            _env.Quests.TryStart("quest.side.test.a", "test");
            _env.Quests.TryGetInstance("quest.side.test.a", out QuestInstance instance);

            Assert.That(_env.Quests.TrySetObjectiveProgress("quest.side.test.a", "o1", 2), Is.True);
            Assert.That(instance.Objectives[0].Progress, Is.EqualTo(2));
            Assert.That(_env.Quests.TryCompleteObjective("quest.side.test.a", "o9"), Is.False);

            _env.World.SetBool(Flag, true, "quest.side.test.a");
            Assert.That(_env.Quests.ResetQuest("quest.side.test.a"), Is.True);

            Assert.That(_env.StatusOf("quest.side.test.a"), Is.EqualTo(QuestStatus.Unknown));
            Assert.That(_env.World.GetBool(Flag), Is.False, "flags written by the quest are reset (GDD 02 10.3)");
            Assert.That(_env.Quests.TryStart("quest.side.test.a", "test"), Is.True, "can be played again");
        }

        [Test]
        public void ChangedEvent_IsRaisedOncePerOperation()
        {
            Use(Simple("quest.side.test.a").Build());
            int changed = 0;
            _env.Quests.Changed += () => changed++;

            _env.Quests.TryStart("quest.side.test.a", "test");
            Assert.That(changed, Is.EqualTo(1));

            KillWolves(1);
            Assert.That(changed, Is.EqualTo(2));
        }

        [Test]
        public void ObjectiveProgressed_CarriesStageObjectiveIdAndCounter()
        {
            Use(Simple("quest.side.test.a").Build());
            using (var progress = new EventRecorder<ObjectiveProgressed>(_env.Bus))
            {
                _env.Quests.TryStart("quest.side.test.a", "test");
                KillWolves(2);

                Assert.That(progress.Count, Is.EqualTo(2));
                Assert.That(progress.Last.QuestId, Is.EqualTo("quest.side.test.a"));
                Assert.That(progress.Last.ObjectiveId, Is.EqualTo("s10.o1"));
                Assert.That(progress.Last.Current, Is.EqualTo(2));
                Assert.That(progress.Last.Required, Is.EqualTo(3));
            }
        }

        [Test]
        public void Dispose_UnsubscribesTheRouter()
        {
            Use(Simple("quest.side.test.a").Build());
            _env.Quests.TryStart("quest.side.test.a", "test");
            Assert.That(_env.Bus.GetSubscriberCount<EnemyKilled>(), Is.EqualTo(1), "each event type once");

            _env.Quests.Dispose();

            Assert.That(_env.Bus.GetSubscriberCount<EnemyKilled>(), Is.EqualTo(0));
        }

        private static QuestSpecBuilder Simple(string questId)
        {
            return new QuestSpecBuilder(questId)
                .Title("Test")
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10").Objective(Kill("o1", 3)).EndSuccess());
        }

        private static StageBuilder Final(string stageId)
        {
            return new StageBuilder(stageId).Objective(new TalkToObjective("o1", "npc.eichental.niemand")).EndSuccess();
        }

        private static KillObjective Kill(string objectiveId, int count)
        {
            return new KillObjective(objectiveId, Wolf, count);
        }

        private void Use(params QuestSpec[] quests)
        {
            FlagRegistry flags = FlagRegistry.FromSpecs(FlagSpec.Bool(Flag), FlagSpec.Counter(Counter));
            _env = new QuestTestEnvironment(flags, quests);
        }

        private void KillWolves(int count)
        {
            for (int i = 0; i < count; i++)
            {
                _env.Publish(new EnemyKilled(Wolf, string.Empty, string.Empty, SubjectIds.Player, "region.eichental", string.Empty, 1, default(Vector3)));
            }
        }
    }
}
