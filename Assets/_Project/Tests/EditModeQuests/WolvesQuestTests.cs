using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.Tests.Shared;
using NUnit.Framework;
using UnityEngine;
using F = Aetherfall.Tests.EditMode.Quests.NordhangQuestFixture;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// "Die Woelfe vom Nordhang" (GDD 02, 11.2) played through completely with artificial events, once per solution way
    /// (fight, destroy the splinter, recover the splinter), plus save and load in the middle of the quest and the validator
    /// (automatic path tests, GDD 02 10.3). The events are the ones the game systems send later: <c>ClueInspected</c>,
    /// <c>Interacted</c>, <c>TrailNodeReached</c>, <c>AreaEntered</c>, <c>EnemyKilled</c>, <c>BossDefeated</c>,
    /// <c>AbilityUsedAt</c>, <c>NPCTalkedTo</c>, <c>TimeOfDayChanged</c>.
    /// </summary>
    [TestFixture]
    public sealed class WolvesQuestTests
    {
        private QuestTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = new QuestTestEnvironment(F.CreateFlags(), F.CreateAll());
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        [Test]
        public void Fixture_PassesTheValidator_WithoutErrors()
        {
            var lookup = new QuestValidationLookup(null, F.CreateFlags());
            ValidationReport report = new QuestValidator(lookup).Validate(F.CreateAll());

            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
        }

        [Test]
        public void StartCondition_WolvesBecomeAvailableAtHollmann_AfterThePrologue()
        {
            using (var availability = new EventRecorder<QuestAvailabilityChanged>(_env.Bus))
            {
                Assert.That(_env.StatusOf(F.WolvesId), Is.EqualTo(QuestStatus.Unknown));
                Assert.That(_env.Quests.TryStart(F.WolvesId, "dlg.eichental.hollmann_schafe"), Is.False, "prologue not done yet");

                CompletePrologue();

                Assert.That(_env.StatusOf(F.WolvesId), Is.EqualTo(QuestStatus.Available));
                Assert.That(availability.Events, Has.Some.Matches<QuestAvailabilityChanged>(e => e.QuestId == F.WolvesId && e.GiverId == F.Hollmann && e.Available));
                Assert.That(_env.StatusOf(F.HerbId), Is.EqualTo(QuestStatus.Unknown), "the herb quest also needs the wolves");
            }
        }

        [Test]
        public void WayOfTheFight_KillGlutfang_EndsAtS50Kampf()
        {
            using (var stages = new EventRecorder<QuestStageChanged>(_env.Bus))
            using (var completed = new EventRecorder<QuestCompleted>(_env.Bus))
            {
                PlayToTheDen();

                _env.SetHour(22);
                _env.Publish(new Interacted(F.Pup, "use"));
                Assert.That(_env.World.GetBool(F.FlagPupSaved), Is.False, "at night Glutfang is awake: the pup objective is hidden");

                _env.Publish(new BossDefeated(F.Glutfang));
                Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s50_kampf"));

                _env.Publish(new NPCTalkedTo(F.Hollmann, "dlg.eichental.hollmann_schafe"));

                Assert.That(_env.StatusOf(F.WolvesId), Is.EqualTo(QuestStatus.Completed));
                Assert.That(completed.Last.QuestId, Is.EqualTo(F.WolvesId));
                Assert.That(completed.Last.EndStageId, Is.EqualTo("s50_kampf"));
                Assert.That(StageIds(stages, F.WolvesId), Is.EqualTo(new[] { "s10", "s20", "s30", "s40", "s50_kampf" }));
                Assert.That(_env.World.GetInt(F.FlagOutcome), Is.EqualTo(1));
                Assert.That(_env.World.GetBool(F.FlagPimFever), Is.True);
                Assert.That(_env.World.GetBool(F.FlagAetherActive), Is.False);
                Assert.That(_env.Inventory.Gold, Is.EqualTo(20 + 60), "20 from the prologue, 60 from Hollmann");
                Assert.That(Ledger(F.WolvesId), Is.EqualTo(new[] { "ledger.c1" }));
                Assert.That(_env.Actions.CountContaining(F.WolvesId + ": GiveXp 0.5 Lv"), Is.EqualTo(1), "quest reward once");
                Assert.That(_env.StatusOf(F.HerbId), Is.EqualTo(QuestStatus.Available), "follow-up quest offered at Alwine");
                Assert.That(_env.Quests.IsTracked(F.WolvesId), Is.False, "finished quests are no longer tracked");
            }
        }

        [Test]
        public void WayOfStealth_DestroyTheSplinterByDay_SavesThePup_AndEndsAtS50Zerstoert()
        {
            PlayToTheDen();

            _env.SetHour(10);
            _env.Publish(new Interacted(F.Pup, "use"));
            Assert.That(_env.World.GetBool(F.FlagPupSaved), Is.True, "bonus action of the optional objective o4");
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s40"), "optional objectives do not finish the stage");

            _env.Publish(new AbilityUsedAt(F.AetherPush, "obj.eichental.anderer_fels", default(Vector3)));
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s40"), "wrong target");

            _env.Publish(new AbilityUsedAt(F.AetherPush, F.Splinter, default(Vector3)));
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s50_zerstoert"));

            _env.Publish(new NPCTalkedTo(F.Hollmann, string.Empty));

            Assert.That(_env.Quests.TryGetInstance(F.WolvesId, out QuestInstance wolves), Is.True);
            Assert.That(wolves.Status, Is.EqualTo(QuestStatus.Completed));
            Assert.That(wolves.EndStageId, Is.EqualTo("s50_zerstoert"));
            Assert.That(_env.World.GetInt(F.FlagOutcome), Is.EqualTo(2));
            Assert.That(_env.Inventory.CountOf(F.Cheese), Is.EqualTo(3));
            Assert.That(_env.Actions.CountContaining("Beziehung npc.eichental.bauer_hollmann +10"), Is.EqualTo(1));
            Assert.That(Ledger(F.WolvesId), Is.EqualTo(new[] { "ledger.c2" }));
        }

        [Test]
        public void WayOfGreed_RecoverTheSplinter_GoesThroughS45_AndSetsTheAetherFlag()
        {
            PlayToTheDen();

            _env.Publish(new Interacted(F.Splinter, "use"));
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s45_geborgen"), "o3 has no branch: default exit");
            Assert.That(_env.Inventory.CountOf(F.SplinterItem), Is.EqualTo(1));
            Assert.That(_env.Actions.CountContaining("Gegner+ spawn.eichental.bau_wut"), Is.EqualTo(1));

            _env.Publish(new BossDefeated(F.Glutfang));
            KillAetherWolves(2);
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s45_geborgen"), "mode 'all': two of three wolves are not enough");
            KillAetherWolves(1);
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s50_geborgen"));

            _env.Publish(new NPCTalkedTo(F.Hollmann, string.Empty));

            Assert.That(_env.StatusOf(F.WolvesId), Is.EqualTo(QuestStatus.Completed));
            Assert.That(_env.World.GetInt(F.FlagOutcome), Is.EqualTo(3));
            Assert.That(_env.World.GetBool(F.FlagAetherActive), Is.True);
            Assert.That(Ledger(F.WolvesId), Is.EqualTo(new[] { "ledger.c3" }));
            Assert.That(_env.Quests.IsStageReached(F.WolvesId, "s45_geborgen"), Is.True);
            Assert.That(_env.Quests.IsStageReached(F.WolvesId, "s50_kampf"), Is.False);
        }

        [Test]
        public void FollowUp_HerbQuest_ReadsTheConsequenceOfTheWolves()
        {
            PlayToTheDen();
            _env.Publish(new Interacted(F.Splinter, "use"));
            _env.Publish(new BossDefeated(F.Glutfang));
            KillAetherWolves(3);
            _env.Publish(new NPCTalkedTo(F.Hollmann, string.Empty));

            _env.Inventory.Add(F.RiftMoss, 2);
            Assert.That(_env.Quests.TryStart(F.HerbId, "dlg.eichental.alwine_kraeuter"), Is.True);
            Assert.That(_env.Quests.TryGetInstance(F.HerbId, out QuestInstance herb), Is.True);
            Assert.That(herb.Objectives[0].Progress, Is.EqualTo(2), "owned items count at once (GDD 02 5.2)");

            _env.Inventory.Add(F.RiftMoss, 1);
            Assert.That(_env.StageOf(F.HerbId), Is.EqualTo("s20"));
            _env.Publish(new NPCTalkedTo(F.Alwine, string.Empty));

            Assert.That(_env.StatusOf(F.HerbId), Is.EqualTo(QuestStatus.Completed));
            Assert.That(herb.EndStageId, Is.EqualTo("s30_unruhig"), "branch reads flag.eichental.nordhang_aether_aktiv");
        }

        [Test]
        public void ObjectivesCountEachClueOnce_AndOptionalBonusesRunOnce()
        {
            CompletePrologue();
            using (var progress = new EventRecorder<ObjectiveProgressed>(_env.Bus))
            {
                Assert.That(_env.Quests.TryStart(F.WolvesId, "dlg.eichental.hollmann_schafe"), Is.True);
                Assert.That(_env.Inventory.CountOf(F.Bow), Is.EqualTo(1), "start actions of s10");
                Assert.That(_env.Inventory.CountOf(F.Arrow), Is.EqualTo(30));

                _env.Publish(new Interacted("obj.eichental.strohziel_1", "use"));
                _env.Publish(new Interacted("obj.eichental.strohziel_1", "use"));
                _env.Publish(new Interacted("obj.eichental.strohziel_2", "use"));
                _env.Publish(new Interacted("obj.eichental.scheunentor", "use"));
                _env.Publish(new Interacted("obj.eichental.strohziel_3", "use"));
                Assert.That(_env.Inventory.CountOf(F.Arrow), Is.EqualTo(40), "bonus +10 arrows once");

                _env.Publish(new ClueInspected(F.ClueSheep));
                _env.Publish(new ClueInspected(F.ClueSheep));
                _env.Publish(new ClueInspected("clue.eichental.anderswo"));
                _env.Publish(new ClueInspected(F.CluePaws));
                Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s10"));
                Assert.That(progress.Last.ObjectiveId, Is.EqualTo("s10.o1"));
                Assert.That(progress.Last.Current, Is.EqualTo(2));
                Assert.That(progress.Last.Required, Is.EqualTo(3));

                _env.Publish(new ClueInspected(F.ClueSaliva));
                Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s20"));
                Assert.That(_env.Actions.CountContaining("Gegner+ spawn.eichental.nordhang_rudel"), Is.EqualTo(1));
            }
        }

        [Test]
        public void SaveAndLoad_InTheMiddleOfTheTrail_ContinuesWithTheSameProgress()
        {
            CompletePrologue();
            _env.Quests.TryStart(F.WolvesId, "dlg.eichental.hollmann_schafe");
            InspectAllClues();
            _env.Publish(new TrailNodeReached(F.Trail, 0));
            _env.Publish(new Interacted(F.PostRider, "use"));
            Assert.That(_env.Actions.CountContaining("StartQuest quest.side.eichental.brief_der_nie_ankam"), Is.EqualTo(1));
            _env.Clock.AdvanceHours(1.5);

            using (var loaded = new QuestTestEnvironment(F.CreateFlags(), F.CreateAll()))
            {
                _env.SaveAndLoadInto(loaded);

                Assert.That(loaded.StatusOf(F.AscheId), Is.EqualTo(QuestStatus.Completed));
                Assert.That(loaded.StatusOf(F.WolvesId), Is.EqualTo(QuestStatus.Active));
                Assert.That(loaded.StageOf(F.WolvesId), Is.EqualTo("s20"));
                Assert.That(loaded.Quests.TryGetInstance(F.WolvesId, out QuestInstance wolves), Is.True);
                Assert.That(wolves.Objectives[0].Progress, Is.EqualTo(1), "one of three trail nodes");
                Assert.That(wolves.Objectives[1].Done, Is.True, "optional post rider");
                Assert.That(wolves.VisitedStages, Is.EqualTo(new[] { "s10", "s20" }));
                Assert.That(loaded.Quests.IsTracked(F.WolvesId), Is.True);
                Assert.That(loaded.World.GetBool(F.FlagVillageDestroyed), Is.True, "world state of the prologue");
                Assert.That(loaded.Actions.Entries, Is.Empty, "loading runs no stage actions again (architecture 9.1)");

                loaded.Publish(new Interacted(F.PostRider, "use"));
                loaded.Publish(new TrailNodeReached(F.Trail, 1));
                loaded.Publish(new TrailNodeReached(F.Trail, 2));
                Assert.That(loaded.StageOf(F.WolvesId), Is.EqualTo("s30"));
                Assert.That(loaded.Actions.CountContaining("brief_der_nie_ankam"), Is.EqualTo(0), "bonus of o2 not given twice");

                loaded.Publish(new AreaEntered(F.Den));
                loaded.SetHour(14);
                loaded.Publish(new AbilityUsedAt(F.AetherPush, F.Splinter, default(Vector3)));
                loaded.Publish(new NPCTalkedTo(F.Hollmann, string.Empty));

                Assert.That(loaded.StatusOf(F.WolvesId), Is.EqualTo(QuestStatus.Completed));
                Assert.That(loaded.World.GetInt(F.FlagOutcome), Is.EqualTo(2));
                Assert.That(loaded.StatusOf(F.HerbId), Is.EqualTo(QuestStatus.Available));
            }
        }

        [Test]
        public void SaveAndLoad_AfterTheDecision_KeepsOutcomeLedgerAndAvailability()
        {
            PlayToTheDen();
            _env.Publish(new BossDefeated(F.Glutfang));
            _env.Publish(new NPCTalkedTo(F.Hollmann, string.Empty));

            using (var loaded = new QuestTestEnvironment(F.CreateFlags(), F.CreateAll()))
            {
                _env.SaveAndLoadInto(loaded);

                Assert.That(loaded.Quests.TryGetInstance(F.WolvesId, out QuestInstance wolves), Is.True);
                Assert.That(wolves.Status, Is.EqualTo(QuestStatus.Completed));
                Assert.That(wolves.EndStageId, Is.EqualTo("s50_kampf"));
                Assert.That(loaded.Quests.GetLedger(F.WolvesId), Has.Count.EqualTo(1));
                Assert.That(loaded.Quests.GetLedger(F.WolvesId)[0].Text, Does.Contain("Glutfang"));
                Assert.That(loaded.World.GetInt(F.FlagOutcome), Is.EqualTo(1));
                Assert.That(loaded.StatusOf(F.HerbId), Is.EqualTo(QuestStatus.Available));
                Assert.That(loaded.Quests.TryStart(F.WolvesId, "debug"), Is.False, "not repeatable");
            }
        }

        private static List<string> StageIds(EventRecorder<QuestStageChanged> recorder, string questId)
        {
            var result = new List<string>();
            for (int i = 0; i < recorder.Count; i++)
            {
                if (recorder.Events[i].QuestId == questId)
                {
                    result.Add(recorder.Events[i].StageId);
                }
            }

            return result;
        }

        private List<string> Ledger(string questId)
        {
            Assert.That(_env.Quests.TryGetInstance(questId, out QuestInstance instance), Is.True);
            return new List<string>(instance.LedgerEntries);
        }

        private void CompletePrologue()
        {
            Assert.That(_env.Quests.TryStart(F.AscheId, "new_game"), Is.True);
            Assert.That(_env.World.GetBool(F.FlagVillageDestroyed), Is.True);
            _env.Publish(new AreaEntered("loc.eichental.dorfplatz"));
            _env.Publish(new NPCTalkedTo(F.Hedda, string.Empty));
            Assert.That(_env.StatusOf(F.AscheId), Is.EqualTo(QuestStatus.Completed));
        }

        private void InspectAllClues()
        {
            _env.Publish(new ClueInspected(F.ClueSheep));
            _env.Publish(new ClueInspected(F.CluePaws));
            _env.Publish(new ClueInspected(F.ClueSaliva));
        }

        private void KillAetherWolves(int count)
        {
            for (int i = 0; i < count; i++)
            {
                _env.Publish(new EnemyKilled(F.GreyWolf, F.AetherVariant, "rt.000000000000000" + i, SubjectIds.Player, "region.eichental",
                                             "loot.wolf", 3, default(Vector3)));
            }
        }

        private void PlayToTheDen()
        {
            CompletePrologue();
            Assert.That(_env.Quests.TryStart(F.WolvesId, "dlg.eichental.hollmann_schafe"), Is.True);
            Assert.That(_env.Quests.IsTracked(F.WolvesId), Is.True, "new quests are tracked while fewer than 3 are tracked");

            InspectAllClues();
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s20"));

            for (int i = 0; i < F.TrailNodes; i++)
            {
                _env.Publish(new TrailNodeReached(F.Trail, i));
            }

            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s30"));
            KillAetherWolves(3);
            Assert.That(_env.Inventory.CountOf(F.AetherFur), Is.EqualTo(3), "bonus of the optional kill objective");
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s30"), "optional kills do not finish the stage");

            _env.Publish(new AreaEntered(F.Den));
            Assert.That(_env.StageOf(F.WolvesId), Is.EqualTo("s40"));
            Assert.That(_env.Actions.CountContaining("Gegner+ spawn.eichental.glutfang"), Is.EqualTo(1));
        }
    }
}
