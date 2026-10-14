using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// The objective types of GDD 02 5.1 with their triggering events (architecture 4.3): every objective counts only the
    /// events that match its parameters (type, variant, region, unique id, item, NPC, dialogue, object group, verb, trail,
    /// clue, ability target, time window), "Sammle" counts the inventory and can sink, bonus actions run once, and the
    /// validation catches invalid parameters (V13). Each test runs one stage with the objective plus a blocking second
    /// objective, so the progress stays visible.
    /// </summary>
    [TestFixture]
    public sealed class QuestObjectiveTests
    {
        private const string QuestId = "quest.side.test.ziele";
        private const string Wolf = "enemy.wolf.grauwolf";

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
        public void Kill_FiltersTypeVariantAndRegion()
        {
            ObjectiveState state = Run(new KillObjective("o1", Wolf, 5, "aether_verderbt", "region.eichental"));

            Kill("enemy.wolf.schattenwolf", "aether_verderbt", "region.eichental", string.Empty);
            Kill(Wolf, string.Empty, "region.eichental", string.Empty);
            Kill(Wolf, "aether_verderbt", "region.goldkueste", string.Empty);
            Kill(Wolf, "aether_verderbt", "region.eichental", string.Empty);

            Assert.That(state.Progress, Is.EqualTo(1));
        }

        [Test]
        public void KillSpecific_ByUniqueIdOrBossEvent_DefeatOnlyIfAllowed()
        {
            ObjectiveState byUid = Run(new KillSpecificObjective("o1", "spawn.eichental.grimmbart"));
            Kill("enemy.bandit.anfuehrer", string.Empty, string.Empty, "spawn.eichental.anderer");
            Assert.That(byUid.Done, Is.False);
            Kill("enemy.bandit.anfuehrer", string.Empty, string.Empty, "spawn.eichental.grimmbart");
            Assert.That(byUid.Done, Is.True);
            TearDown();

            ObjectiveState boss = Run(new KillSpecificObjective("o1", "boss.eichental.glutfang"));
            _env.Publish(new BossDefeated("boss.eichental.glutfang"));
            Assert.That(boss.Done, Is.True);
            TearDown();

            ObjectiveState noDefeat = Run(new KillSpecificObjective("o1", "spawn.eichental.grimmbart"));
            _env.Publish(new EnemyDefeated("enemy.bandit.anfuehrer", "spawn.eichental.grimmbart", "region.eichental"));
            Assert.That(noDefeat.Done, Is.False, "alive defeat counts only if allowed");
            TearDown();

            ObjectiveState defeat = Run(new KillSpecificObjective("o1", "spawn.eichental.grimmbart", true));
            _env.Publish(new EnemyDefeated("enemy.bandit.anfuehrer", "spawn.eichental.grimmbart", "region.eichental"));
            Assert.That(defeat.Done, Is.True);
        }

        [Test]
        public void Collect_CountsTheInventory_CanSink_BonusOnlyOnce()
        {
            BuildEnv(new CollectObjective("o1", "item.herb.blutwurz", 5).WithCompletionActions(new AddToFlag("stat.global.test_bonus", 1)));
            _env.Inventory.Add("item.herb.blutwurz", 3);
            ObjectiveState state = StartAndGetState();
            Assert.That(state.Progress, Is.EqualTo(3), "owned items count at once");

            _env.Inventory.Add("item.herb.blutwurz", 2);
            Assert.That(state.Done, Is.True);
            _env.Inventory.Add("item.herb.blutwurz", -1);
            Assert.That(state.Done, Is.False, "sold one: the counter sinks (GDD 02 5.2)");
            Assert.That(state.Progress, Is.EqualTo(4));
            _env.Inventory.Add("item.herb.blutwurz", 1);

            Assert.That(state.Done, Is.True);
            Assert.That(_env.World.GetInt("stat.global.test_bonus"), Is.EqualTo(1), "bonus once");
        }

        [Test]
        public void Collect_IgnoresOtherOwners()
        {
            ObjectiveState state = Run(new CollectObjective("o1", "item.herb.blutwurz", 5));

            _env.Publish(new InventoryChanged("chest.obj.auto.0000000000000001", "item.herb.blutwurz", 9, 9));

            Assert.That(state.Progress, Is.EqualTo(0));
        }

        [Test]
        public void Deliver_AddsTheAmounts_ForTheRightNpcOnly()
        {
            ObjectiveState state = Run(new DeliverItemObjective("o1", "item.quest.brief_jannik", 2, "npc.eichental.liese_brenner"));

            _env.Publish(new ItemDelivered("item.quest.brief_jannik", 1, "npc.eichental.wirt_ulf"));
            _env.Publish(new ItemDelivered("item.quest.brief_jannik", 1, "npc.eichental.liese_brenner"));
            Assert.That(state.Progress, Is.EqualTo(1));
            _env.Publish(new ItemDelivered("item.quest.brief_jannik", 3, "npc.eichental.liese_brenner"));

            Assert.That(state.Done, Is.True);
            Assert.That(state.Progress, Is.EqualTo(2), "clamped to the required amount");
        }

        [Test]
        public void TalkTo_WithOptionalDialogueFilter()
        {
            ObjectiveState any = Run(new TalkToObjective("o1", "npc.eichental.bauer_hollmann"));
            _env.Publish(new NPCTalkedTo("npc.eichental.wirt_ulf", string.Empty));
            Assert.That(any.Done, Is.False);
            _env.Publish(new NPCTalkedTo("npc.eichental.bauer_hollmann", "dlg.eichental.irgendwas"));
            Assert.That(any.Done, Is.True);
            TearDown();

            ObjectiveState dialogue = Run(new TalkToObjective("o1", "npc.eichental.bauer_hollmann", "dlg.eichental.hollmann_schafe"));
            _env.Publish(new NPCTalkedTo("npc.eichental.bauer_hollmann", "dlg.eichental.irgendwas"));
            Assert.That(dialogue.Done, Is.False);
            _env.Publish(new NPCTalkedTo("npc.eichental.bauer_hollmann", "dlg.eichental.hollmann_schafe"));
            Assert.That(dialogue.Done, Is.True);
        }

        [Test]
        public void GoTo_CompletesOnTheArea()
        {
            ObjectiveState state = Run(new GoToObjective("o1", "loc.eichental.wolfsbau_nordhang", 10f));

            _env.Publish(new AreaEntered("loc.eichental.dorfplatz"));
            Assert.That(state.Done, Is.False);
            _env.Publish(new AreaEntered("loc.eichental.wolfsbau_nordhang"));

            Assert.That(state.Done, Is.True);
        }

        [Test]
        public void Interact_GroupPatternVerbAndDistinctObjects()
        {
            ObjectiveState state = Run(new InteractObjective("o1", 2, "obj.eichental.strohziel_*").WithVerb("use"));

            _env.Publish(new Interacted("obj.eichental.strohziel_1", "open"));
            _env.Publish(new Interacted("obj.eichental.strohziel_1", "use"));
            _env.Publish(new Interacted("obj.eichental.strohziel_1", "use"));
            Assert.That(state.Progress, Is.EqualTo(1), "same object counts once, other verb not at all");
            _env.Publish(new Interacted("obj.eichental.strohziel_7", "use"));

            Assert.That(state.Done, Is.True);
            Assert.That(state.Extra, Is.EqualTo("obj.eichental.strohziel_1;obj.eichental.strohziel_7"));
        }

        [Test]
        public void FollowTrail_CountsTheFurthestNode()
        {
            ObjectiveState state = Run(new FollowTrailObjective("o1", "spur.eichental.wolfsspur", 4));

            _env.Publish(new TrailNodeReached("spur.eichental.andere", 3));
            _env.Publish(new TrailNodeReached("spur.eichental.wolfsspur", 1));
            Assert.That(state.Progress, Is.EqualTo(2));
            _env.Publish(new TrailNodeReached("spur.eichental.wolfsspur", 0));
            Assert.That(state.Progress, Is.EqualTo(2), "going back changes nothing");
            _env.Publish(new TrailNodeReached("spur.eichental.wolfsspur", 3));

            Assert.That(state.Done, Is.True);
        }

        [Test]
        public void InspectClues_CountsListedCluesOnce()
        {
            ObjectiveState state = Run(new InspectCluesObjective("o1", 2, "clue.eichental.weide_1", "clue.eichental.weide_2", "clue.eichental.weide_3"));

            _env.Publish(new ClueInspected("clue.eichental.weide_2"));
            _env.Publish(new ClueInspected("clue.eichental.weide_2"));
            _env.Publish(new ClueInspected("clue.eichental.fremd"));
            Assert.That(state.Progress, Is.EqualTo(1));
            _env.Publish(new ClueInspected("clue.eichental.weide_3"));

            Assert.That(state.Done, Is.True);
        }

        [Test]
        public void UseAbility_NeedsAbilityAndTarget()
        {
            ObjectiveState state = Run(new UseAbilityObjective("o1", "ability.aether.aether_stoss", "obj.eichental.aethersplitter_bau"));

            _env.Publish(new AbilityUsedAt("ability.aether.aether_stoss", "obj.eichental.felsen", default(Vector3)));
            _env.Publish(new AbilityUsedAt("ability.krieger.wirbel", "obj.eichental.aethersplitter_bau", default(Vector3)));
            Assert.That(state.Done, Is.False);
            _env.Publish(new AbilityUsedAt("ability.aether.aether_stoss", "obj.eichental.aethersplitter_bau", default(Vector3)));

            Assert.That(state.Done, Is.True);
        }

        [Test]
        public void ReachInTime_DoneBeforeTheTimer_StopsTheTimer()
        {
            ObjectiveState state = Run(new ReachInTimeObjective("o1", "loc.eichental.tuer_haus_wenna", 120f));
            _env.Quests.Tick(30f);

            _env.Publish(new AreaEntered("loc.eichental.tuer_haus_wenna"));
            _env.Quests.Tick(200f);

            Assert.That(state.Done, Is.True);
            Assert.That(state.Failed, Is.False);
            Assert.That(state.TimerRemaining, Is.EqualTo(0f));
        }

        [Test]
        public void WaitUntilTime_CompletesInTheWindow_AlsoOverMidnight()
        {
            ObjectiveState state = Run(new WaitUntilTimeObjective("o1", 22, 4));

            _env.SetHour(12);
            _env.SetHour(21);
            Assert.That(state.Done, Is.False);
            _env.SetHour(23);
            Assert.That(state.Done, Is.True);

            var window = new WaitUntilTimeObjective("o1", 6, 20);
            Assert.That(window.IsInWindow(6), Is.True);
            Assert.That(window.IsInWindow(20), Is.False);
            Assert.That(new WaitUntilTimeObjective("o1", 22, 4).IsInWindow(3), Is.True);
        }

        [Test]
        public void HiddenObjective_IgnoresEventsWhileItsConditionFails()
        {
            ObjectiveState state = Run(new InteractObjective("o1", 1, "obj.eichental.kriegshorn").VisibleWhen(new FlagIs("flag.eichental.test_bekannt", 1)));

            _env.Publish(new Interacted("obj.eichental.kriegshorn", "use"));
            Assert.That(state.Done, Is.False);
            _env.World.SetBool("flag.eichental.test_bekannt", true, "test");
            _env.Publish(new Interacted("obj.eichental.kriegshorn", "use"));

            Assert.That(state.Done, Is.True);
        }

        [Test]
        public void Describe_UsesTheGddNotation()
        {
            Assert.That(new KillObjective("o1", Wolf, 3, "aether_verderbt").Describe(), Is.EqualTo("Töte(enemy.wolf.grauwolf[aether_verderbt], 3)"));
            Assert.That(new GoToObjective("o1", "loc.eichental.wolfsbau_nordhang", 10f).Describe(), Is.EqualTo("GeheZu(loc.eichental.wolfsbau_nordhang, r=10)"));
            Assert.That(new TalkToObjective("o1", "npc.eichental.bauer_hollmann").Describe(), Is.EqualTo("Rede(npc.eichental.bauer_hollmann)"));
        }

        [Test]
        public void Validate_InvalidParameters_AreV13()
        {
            Assert.That(CountV13(new KillObjective("o1", Wolf, 0)), Is.EqualTo(1), "count 0");
            Assert.That(CountV13(new GoToObjective("o1", "loc.eichental.x", 0f)), Is.EqualTo(1), "radius 0");
            Assert.That(CountV13(new InteractObjective("o1", 1)), Is.EqualTo(1), "no object");
            Assert.That(CountV13(new InteractObjective("o1", 3, "obj.eichental.a", "obj.eichental.b")), Is.EqualTo(1), "3 of 2 objects");
            Assert.That(CountV13(new InspectCluesObjective("o1", 2, "clue.eichental.a")), Is.EqualTo(1), "2 of 1 clue");
            Assert.That(CountV13(new ChooseObjective("o1", new ChoiceOption("a", "Ja"))), Is.EqualTo(1), "one option");
            Assert.That(CountV13(new KillObjective("o1", string.Empty, 1)), Is.EqualTo(1), "empty enemy type");
            Assert.That(CountV13(new KillObjective("o1", Wolf, 3)), Is.EqualTo(0));
        }

        [Test]
        public void Validate_JournalTextLongerThan50_IsW04()
        {
            var report = new ValidationReport();
            new TalkToObjective("o1", "npc.eichental.bauer_hollmann").WithJournalText(new string('x', 51)).Validate(report);

            Assert.That(report.Contains("W04"), Is.True);
        }

        private static int CountV13(QuestObjective objective)
        {
            var report = new ValidationReport();
            objective.Validate(report);
            return report.CountOf(ValidationReportExtensions.InvalidParameterCode);
        }

        private ObjectiveState Run(QuestObjective objective)
        {
            BuildEnv(objective);
            return StartAndGetState();
        }

        private void BuildEnv(QuestObjective objective)
        {
            QuestSpec quest = new QuestSpecBuilder(QuestId)
                .StartTrigger(QuestStartTriggerKind.Automatic)
                .Stage(new StageBuilder("s10")
                    .Objective(objective)
                    .Objective(new TalkToObjective("o9", "npc.eichental.niemand"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").ActionOnly().EndSuccess())
                .Build();
            _env = new QuestTestEnvironment(FlagRegistry.FromSpecs(FlagSpec.Counter("stat.global.test_bonus"), FlagSpec.Bool("flag.eichental.test_bekannt")), quest);
        }

        private ObjectiveState StartAndGetState()
        {
            Assert.That(_env.Quests.TryStart(QuestId, "test"), Is.True);
            Assert.That(_env.Quests.TryGetInstance(QuestId, out QuestInstance instance), Is.True);
            return instance.Objectives[0];
        }

        private void Kill(string type, string variant, string region, string uniqueId)
        {
            _env.Publish(new EnemyKilled(type, variant, uniqueId, SubjectIds.Player, region, string.Empty, 1, default(Vector3)));
        }
    }
}
