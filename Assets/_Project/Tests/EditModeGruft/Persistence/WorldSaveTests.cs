using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.World.Gameplay;
using Aetherfall.World.Puzzles;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.GruftSave
{
    /// <summary>
    /// Saving the crypt (architecture 9.2/9.7, section <c>worldobjects</c>): the saveable round trip including JSON, a new game
    /// clears everything, the autosave bridge (checkpoint, no saving in the boss fight, autosave after the victory), the
    /// conditions and the action of the world objects and the trap damage.
    /// </summary>
    [TestFixture]
    public sealed class WorldSaveTests
    {
        [Test]
        public void SaveableRoundTripKeepsSolvedPuzzlesBeatenBossAndMirrors()
        {
            var store = new WorldObjectStateStore();
            store.SetState("puzzle.eichental.gruft_grabplatten", WorldObjectStates.Done);
            store.SetState("boss.eichental.wachender_ritter", WorldObjectStates.Done);
            store.SetState("obj.eichental.gruft_spiegel_1", WorldObjectStates.FromDirection(GridDirection.East));
            var saveable = new WorldObjectsSaveable(store);

            var dto = (WorldObjectsDto)saveable.Save();
            string json = new NewtonsoftJsonSerializer().Serialize(dto, false);
            var back = new NewtonsoftJsonSerializer().Deserialize<WorldObjectsDto>(json);
            var loaded = new WorldObjectStateStore();
            new WorldObjectsSaveable(loaded).Load(back, new LoadContext("slot", 1, false, false, null));

            Assert.That(saveable.SaveKey, Is.EqualTo("worldobjects"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(85), "architecture 9.2");
            Assert.That(loaded.GetState("puzzle.eichental.gruft_grabplatten"), Is.EqualTo(WorldObjectStates.Done));
            Assert.That(loaded.GetState("boss.eichental.wachender_ritter"), Is.EqualTo(WorldObjectStates.Done), "besiegt bleibt besiegt");
            Assert.That(WorldObjectStates.TryGetDirection(loaded.GetState("obj.eichental.gruft_spiegel_1"), out GridDirection mirror), Is.True);
            Assert.That(mirror, Is.EqualTo(GridDirection.East));
        }

        [Test]
        public void NewGameClearsTheStates()
        {
            var store = new WorldObjectStateStore();
            store.SetState("door.eichental.gruft_tor", WorldObjectStates.Done);
            int replaced = 0;
            store.StatesReplaced += () => replaced++;

            new WorldObjectsSaveable(store).Load(null, LoadContext.NewGame);

            Assert.That(store.Count, Is.EqualTo(0));
            Assert.That(replaced, Is.EqualTo(1), "the scene objects re-apply their start state");
        }

        [Test]
        public void DtoFollowsTheSaveRules()
        {
            Assert.That(SaveDtoValidator.Validate(typeof(WorldObjectsDto), out string problem), Is.True, problem);
        }

        [Test]
        public void BossFightBlocksSavingAndTheVictorySaves()
        {
            using (var bus = new EventBus())
            {
                var saves = new FakeWorldSaveManager();
                var bridge = new WorldSaveBridge(saves, bus);
                bridge.PostInitialize();

                var started = new BossEncounterStarted("boss.eichental.wachender_ritter");
                bus.Publish(in started);
                Assert.That(saves.Blockers.ContainsKey(WorldSaveBridge.BossBlockerId), Is.True, "GDD 05 5.3: not in the arena");
                bridge.RequestAutosave("checkpoint.gruft.vorkammer");
                Assert.That(saves.Saves, Is.EqualTo(0), "skipped while blocked");

                var ended = new BossEncounterEnded("boss.eichental.wachender_ritter", true);
                bus.Publish(in ended);
                Assert.That(saves.Blockers.Count, Is.EqualTo(0));
                Assert.That(saves.Saves, Is.EqualTo(1), "autosave after the victory");

                bridge.Dispose();
            }
        }

        [Test]
        public void LostBossFightOnlyLiftsTheBlocker()
        {
            using (var bus = new EventBus())
            {
                var saves = new FakeWorldSaveManager();
                var bridge = new WorldSaveBridge(saves, bus);
                bridge.PostInitialize();
                var started = new BossEncounterStarted("boss.a");
                bus.Publish(in started);
                var ended = new BossEncounterEnded("boss.a", false);
                bus.Publish(in ended);

                Assert.That(saves.Blockers.Count, Is.EqualTo(0));
                Assert.That(saves.Saves, Is.EqualTo(0));
                bridge.RequestAutosave("checkpoint");
                Assert.That(saves.Saves, Is.EqualTo(1));
                Assert.That(bridge.RequestedSaves, Is.EqualTo(1));
            }
        }

        [Test]
        public void ConditionsReadTheWorldObjectStates()
        {
            var store = new WorldObjectStateStore();
            var locator = new ServiceLocator();
            locator.Register<IWorldObjectStateStore>(store);
            ConditionContext ctx = ConditionContext.ForPlayer(locator, "quest.dungeon.eichental.vergessene_gruft");
            var solved = new PuzzleIsSolved("puzzle.eichental.gruft_spiegel");
            var freed = new WorldObjectStateIs("obj.eichental.gruft_kaefig", WorldObjectStates.Done);

            Assert.That(solved.Evaluate(ctx), Is.False);
            Assert.That(freed.Evaluate(ctx), Is.False);

            store.SetState("puzzle.eichental.gruft_spiegel", WorldObjectStates.Done);
            new SetWorldObjectState("obj.eichental.gruft_kaefig", WorldObjectStates.Done).Execute(ctx.ToActionContext());

            Assert.That(solved.Evaluate(ctx), Is.True);
            Assert.That(freed.Evaluate(ctx), Is.True);
            Assert.That(solved.Describe(), Does.Contain("puzzle.eichental.gruft_spiegel"));
        }

        [Test]
        public void ConditionsReEvaluateOnWorldObjectChanges()
        {
            var triggers = new RecordingTriggers();

            new PuzzleIsSolved("puzzle.x").CollectTriggers(triggers);
            new WorldObjectStateIs("obj.x", 1).CollectTriggers(triggers);

            Assert.That(triggers.Types, Does.Contain(typeof(PuzzleSolved)));
            Assert.That(triggers.Types, Does.Contain(typeof(WorldObjectStateChanged)));
        }

        [Test]
        public void TrapTakesTenPercentOfTheMaximumHealth()
        {
            Assert.That(TrapDamage.Amount(200f, 0.1f), Is.EqualTo(20f).Within(0.001f), "GDD 02 11.7: 10 % LP");
            Assert.That(TrapDamage.Amount(5f, 0.1f), Is.EqualTo(1f), "at least 1");
            Assert.That(TrapDamage.Amount(100f, 0f), Is.EqualTo(0f));
            Assert.That(TrapDamage.Amount(100f, 3f), Is.EqualTo(100f).Within(0.001f), "never more than the maximum");
        }

        private sealed class RecordingTriggers : ITriggerCollector
        {
            public List<System.Type> Types { get; } = new List<System.Type>();

            public void On<T>() where T : struct, IGameEvent
            {
                Types.Add(typeof(T));
            }

            public void OnFlag(string flagId)
            {
            }

            public void OnGameHour()
            {
            }

            public void Constant()
            {
            }

            public void Poll()
            {
            }
        }
    }
}
