using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.WorldState;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The two test quests of the test ground (guide 09) played through with the real services, exactly like the game would
    /// send the events: notice board, kills in the arena, picking up the wolf fur, back to the board with and without fur,
    /// rewards (experience with level-up, gold, potions), the flag that unlocks the second quest, both branches of the trial
    /// (chest or dummy) with ledger entries, saving in the middle of a quest, and the validator (0 errors, 0 warnings).
    /// </summary>
    [TestFixture]
    public sealed class TestGroundQuestTests
    {
        private TestGroundQuestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = new TestGroundQuestEnvironment();
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        [Test]
        public void Validator_AcceptsBothQuestsWithoutFindings()
        {
            var ids = new List<string> { TestGroundQuestLibrary.WolfFurId, TestGroundQuestLibrary.PotionId, TestGroundQuestLibrary.WolfTypeId };
            var lookup = new QuestValidationLookup(ids, FlagRegistry.FromSpecs(TestGroundQuestLibrary.CreateFlags()));

            ValidationReport report = new QuestValidator(lookup).Validate(TestGroundQuestLibrary.CreateQuests());

            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToText());
            Assert.That(report.WarningCount, Is.EqualTo(0), report.ToText());
        }

        [Test]
        public void Library_BuildsFreshObjectsOnEveryCall()
        {
            QuestSpec first = TestGroundQuestLibrary.CreateWolfHunt();
            QuestSpec second = TestGroundQuestLibrary.CreateWolfHunt();

            Assert.That(first.Stages[0], Is.Not.SameAs(second.Stages[0]));
            Assert.That(first.Stages[0].Objectives[0], Is.Not.SameAs(second.Stages[0].Objectives[0]));
            Assert.That(first.Rewards[0], Is.Not.SameAs(second.Rewards[0]));
        }

        [Test]
        public void WolfHunt_FullPath()
        {
            Assert.That(QuestBoardRules.FindOffer(_env.Quests, TestGroundQuestLibrary.BoardId, new List<string>()), Is.EqualTo(TestGroundQuestLibrary.WolfHuntId));

            Assert.That(_env.ReadBoard(), Is.EqualTo(TestGroundQuestLibrary.WolfHuntId));
            Assert.That(_env.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s10"));
            Assert.That(_env.Quests.IsTracked(TestGroundQuestLibrary.WolfHuntId), Is.True, "new quests are tracked automatically");

            KillWolf("wolf_1");
            KillWolf("wolf_2", "aether_verderbt");
            Assert.That(_env.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s10"));
            KillWolf("wolf_3");
            Assert.That(_env.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s20"));
            Assert.That(_env.Progression.TotalXp, Is.EqualTo(60), "3 kills of level 8 wolves at level 1: 3 × 20");

            PickUpFur();
            Assert.That(_env.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s30"));
            Assert.That(QuestBoardRules.FindTurnIn(_env.Quests, TestGroundQuestLibrary.BoardId), Is.EqualTo(TestGroundQuestLibrary.WolfHuntId));

            _env.ReadBoard();

            Assert.That(_env.Quests.GetStatus(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo(QuestStatus.Completed));
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, TestGroundQuestLibrary.WolfFurId), Is.EqualTo(0), "the fur was handed in");
            Assert.That(_env.Inventory.CountOf(InventoryOwners.Player, TestGroundQuestLibrary.PotionId), Is.EqualTo(2));
            Assert.That(_env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(50));
            Assert.That(_env.Progression.TotalXp, Is.EqualTo(260), "60 kill XP + 0.5 × XP_next(2) = 200");
            Assert.That(_env.Progression.Level, Is.EqualTo(2));
            Assert.That(_env.World.GetInt(TestGroundQuestLibrary.FlagWolfHuntDone), Is.EqualTo(1));
            Assert.That(_env.Quests.GetLedger(TestGroundQuestLibrary.WolfHuntId).Count, Is.EqualTo(1));
            Assert.That(QuestBoardRules.FindTurnIn(_env.Quests, TestGroundQuestLibrary.BoardId), Is.Empty);
            Assert.That(QuestBoardRules.FindOffer(_env.Quests, TestGroundQuestLibrary.BoardId, new List<string>()), Is.EqualTo(TestGroundQuestLibrary.TrialId),
                "the flag unlocks the second quest");
        }

        [Test]
        public void WolfHunt_WithoutFurAtTheBoard_GoesBackToCollecting()
        {
            _env.ReadBoard();
            KillWolf("wolf_1");
            KillWolf("wolf_2");
            KillWolf("wolf_3");
            PickUpFur();
            Assert.That(_env.Inventory.TryRemove(InventoryOwners.Player, TestGroundQuestLibrary.WolfFurId, 1, "sold"), Is.True);

            _env.ReadBoard();

            Assert.That(_env.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s20"));
            Assert.That(_env.Quests.GetStatus(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo(QuestStatus.Active));

            PickUpFur();
            _env.ReadBoard();
            Assert.That(_env.Quests.GetStatus(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo(QuestStatus.Completed));
        }

        [Test]
        public void WolfHunt_KillsBeforeAcceptingDoNotCount()
        {
            KillWolf("wolf_1");
            _env.ReadBoard();

            Assert.That(_env.Quests.TryGetInstance(TestGroundQuestLibrary.WolfHuntId, out QuestInstance instance), Is.True);
            Assert.That(instance.Objectives[0].Progress, Is.EqualTo(0));
        }

        [Test]
        public void Trial_IsLockedUntilTheWolfHuntIsDone()
        {
            Assert.That(_env.Quests.CanStart(TestGroundQuestLibrary.TrialId, out string reason), Is.False);
            Assert.That(reason, Is.Not.Empty);
        }

        [Test]
        public void Trial_ChestBranch()
        {
            FinishWolfHunt();
            Assert.That(_env.ReadBoard(), Is.EqualTo(TestGroundQuestLibrary.TrialId));
            _env.Publish(new AreaEntered("loc.test.anderswo"));
            Assert.That(_env.StageOf(TestGroundQuestLibrary.TrialId), Is.EqualTo("s10"));

            _env.Publish(new AreaEntered(TestGroundQuestLibrary.TrainingGroundId));
            Assert.That(_env.StageOf(TestGroundQuestLibrary.TrialId), Is.EqualTo("s20"));

            _env.Publish(new Interacted("obj.test.truhe_eisen", InteractionVerbs.Open));

            Assert.That(_env.Quests.GetStatus(TestGroundQuestLibrary.TrialId), Is.EqualTo(QuestStatus.Completed));
            Assert.That(_env.Quests.TryGetInstance(TestGroundQuestLibrary.TrialId, out QuestInstance instance), Is.True);
            Assert.That(instance.EndStageId, Is.EqualTo("s30_truhe"));
            Assert.That(_env.World.GetInt(TestGroundQuestLibrary.FlagTrialPath), Is.EqualTo(1));
            Assert.That(_env.Inventory.GetCurrency(InventoryOwners.Player, CurrencyIds.Gold), Is.EqualTo(50 + 25 + 20));
            List<QuestLedgerLine> ledger = _env.Quests.GetLedger(TestGroundQuestLibrary.TrialId);
            Assert.That(ledger.Count, Is.EqualTo(1));
            Assert.That(ledger[0].Text, Does.Contain("Truhe"));
        }

        [Test]
        public void Trial_DummyBranch()
        {
            FinishWolfHunt();
            _env.ReadBoard();
            _env.Publish(new AreaEntered(TestGroundQuestLibrary.TrainingGroundId));
            int xpBefore = _env.Progression.TotalXp;

            Hit("player", TestGroundQuestLibrary.DummyId);
            Hit("enemy_wolf_1", TestGroundQuestLibrary.DummyId);
            Hit("player", "wolf_1");
            Hit("player", TestGroundQuestLibrary.DummyId);
            Assert.That(_env.StageOf(TestGroundQuestLibrary.TrialId), Is.EqualTo("s20"));
            Hit("player", TestGroundQuestLibrary.DummyId);

            Assert.That(_env.Quests.TryGetInstance(TestGroundQuestLibrary.TrialId, out QuestInstance instance), Is.True);
            Assert.That(instance.EndStageId, Is.EqualTo("s30_puppe"));
            Assert.That(_env.World.GetInt(TestGroundQuestLibrary.FlagTrialPath), Is.EqualTo(2));
            Assert.That(_env.Progression.TotalXp - xpBefore, Is.EqualTo(60 + 120), "60 for the dummy path + 0.3 × 400");
            List<QuestLedgerLine> ledger = _env.Quests.GetLedger(TestGroundQuestLibrary.TrialId);
            Assert.That(ledger.Count, Is.EqualTo(1));
            Assert.That(ledger[0].Text, Does.Contain("Trainingspuppe"));
        }

        [Test]
        public void SaveInTheMiddle_ContinuesAfterLoading()
        {
            _env.ReadBoard();
            KillWolf("wolf_1");
            KillWolf("wolf_2");

            var serializer = new NewtonsoftJsonSerializer();
            string world = serializer.Serialize(new WorldStateSaveable(_env.World).Save(), false);
            string quests = serializer.Serialize(new QuestSaveable(_env.Quests).Save(), false);
            string progression = serializer.Serialize(new ProgressionSaveable(_env.Progression).Save(), false);

            using (var loaded = new TestGroundQuestEnvironment())
            {
                var worldSaveable = new WorldStateSaveable(loaded.World);
                var questSaveable = new QuestSaveable(loaded.Quests);
                var progressionSaveable = new ProgressionSaveable(loaded.Progression);
                worldSaveable.Load(serializer.Deserialize(world, worldSaveable.DataType), TestGroundQuestEnvironment.LoadedGame);
                progressionSaveable.Load(serializer.Deserialize(progression, progressionSaveable.DataType), TestGroundQuestEnvironment.LoadedGame);
                questSaveable.Load(serializer.Deserialize(quests, questSaveable.DataType), TestGroundQuestEnvironment.LoadedGame);
                questSaveable.OnAfterLoad(TestGroundQuestEnvironment.LoadedGame);
                loaded.Settle();

                Assert.That(loaded.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s10"));
                Assert.That(loaded.Progression.TotalXp, Is.EqualTo(40));
                loaded.Publish(new EnemyKilled(TestGroundQuestLibrary.WolfTypeId, "normal", "wolf_3", "player", string.Empty, string.Empty, 8, default(Vector3)));
                Assert.That(loaded.StageOf(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo("s20"));
            }
        }

        private void FinishWolfHunt()
        {
            _env.ReadBoard();
            KillWolf("wolf_1");
            KillWolf("wolf_2");
            KillWolf("wolf_3");
            PickUpFur();
            _env.ReadBoard();
            Assert.That(_env.Quests.GetStatus(TestGroundQuestLibrary.WolfHuntId), Is.EqualTo(QuestStatus.Completed));
        }

        private void KillWolf(string uniqueId, string variant = "normal")
        {
            _env.Publish(new EnemyKilled(TestGroundQuestLibrary.WolfTypeId, variant, uniqueId, "player", string.Empty, "loot.enemy.wolf.grauwolf", 8,
                default(Vector3)));
        }

        private void PickUpFur()
        {
            Assert.That(_env.Inventory.TryAddNew(InventoryOwners.Player, TestGroundQuestLibrary.WolfFurId, 1, "loot.enemy.wolf.grauwolf"), Is.True);
            _env.Settle();
        }

        private void Hit(string attacker, string target)
        {
            _env.Publish(new DamageDealt(attacker, target, 5, default(DamageType), false, default(HitZone)));
        }
    }
}
