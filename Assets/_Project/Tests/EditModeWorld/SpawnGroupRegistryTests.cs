using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Enemy groups that quests switch on (review of the Eichental generator): the marker registers instead of being searched,
    /// a quest group stays off until <c>Gegner+(spawn-id)</c>, activation before the scene is loaded still counts, defeated groups
    /// stay away after loading, wildlife groups are never touched, and the action <see cref="SpawnEncounter"/> uses the registry.
    /// </summary>
    [TestFixture]
    public sealed class SpawnGroupRegistryTests
    {
        private const string Pack = "spawn.eichental.nordhang_rudel";
        private const string Wild = "spawn.eichental.nordhang_woelfe";

        [Test]
        public void QuestGroupStaysOffUntilActivated()
        {
            var registry = new SpawnGroupRegistry();
            var pack = new FakeGroup(Pack, SpawnActivation.Quest, true);

            registry.Register(pack);
            Assert.That(pack.Active, Is.False, "registering applies the saved state: not activated yet");

            Assert.That(registry.Activate(Pack), Is.True);
            Assert.That(pack.Active, Is.True);
            Assert.That(registry.IsActivated(Pack), Is.True);
            Assert.That(registry.ActivatedIds, Is.EqualTo(new[] { Pack }));
        }

        [Test]
        public void ActivationBeforeTheSceneIsLoadedCounts()
        {
            var registry = new SpawnGroupRegistry();
            Assert.That(registry.Activate(Pack), Is.False, "no group registered yet");

            var pack = new FakeGroup(Pack, SpawnActivation.Quest, false);
            registry.Register(pack);
            Assert.That(pack.Active, Is.True);
        }

        [Test]
        public void WildlifeGroupsAreNeverTouched()
        {
            var registry = new SpawnGroupRegistry();
            var wild = new FakeGroup(Wild, SpawnActivation.Always, true);
            registry.Register(wild);
            registry.Restore(null, new[] { Wild });

            Assert.That(wild.Active, Is.True);
            Assert.That(wild.Calls, Is.EqualTo(0));
        }

        [Test]
        public void DefeatedGroupStaysAwayAfterLoading()
        {
            var registry = new SpawnGroupRegistry();
            var pack = new FakeGroup(Pack, SpawnActivation.Quest, false);
            registry.Register(pack);
            registry.Activate(Pack);
            registry.MarkCleared(Pack);
            Assert.That(pack.Active, Is.True, "the dead wolves stay where they fell until the next load");

            List<string> activated = new List<string>(registry.ActivatedIds);
            List<string> cleared = new List<string>(registry.ClearedIds);
            var loaded = new SpawnGroupRegistry();
            loaded.Restore(activated, cleared);
            var again = new FakeGroup(Pack, SpawnActivation.Quest, true);
            loaded.Register(again);

            Assert.That(again.Active, Is.False);
            Assert.That(loaded.IsCleared(Pack), Is.True);
        }

        [Test]
        public void LoadingAMidQuestSaveBringsThePackBack()
        {
            var registry = new SpawnGroupRegistry();
            var pack = new FakeGroup(Pack, SpawnActivation.Quest, false);
            registry.Register(pack);

            registry.Restore(new[] { Pack }, null);
            Assert.That(pack.Active, Is.True, "quest 2 stage s20 was running when the game was saved");

            registry.Restore(null, null);
            Assert.That(pack.Active, Is.False, "new game");
            Assert.That(registry.ActivatedIds, Is.Empty);
        }

        [Test]
        public void UnregisteredGroupsAreNoLongerTouched()
        {
            var registry = new SpawnGroupRegistry();
            var pack = new FakeGroup(Pack, SpawnActivation.Quest, false);
            registry.Register(pack);
            registry.Register(pack);
            Assert.That(registry.RegisteredCount, Is.EqualTo(1));

            registry.Unregister(pack);
            int calls = pack.Calls;
            registry.Activate(Pack);
            Assert.That(pack.Calls, Is.EqualTo(calls));
            Assert.That(registry.RegisteredCount, Is.EqualTo(0));
        }

        [Test]
        public void SpawnEncounterActivatesTheGroup()
        {
            var registry = new SpawnGroupRegistry();
            var pack = new FakeGroup(Pack, SpawnActivation.Quest, false);
            registry.Register(pack);
            var services = new ServiceLocator();
            services.Register<ISpawnGroupRegistry>(registry);

            var action = new SpawnEncounter(Pack);
            action.Execute(new ActionContext(services, null, null, "quest.side.eichental.woelfe_vom_nordhang"));

            Assert.That(pack.Active, Is.True);
            Assert.That(action.Describe(), Is.EqualTo("Gegner+(" + Pack + ")"));
        }

        private sealed class FakeGroup : ISpawnGroup
        {
            public FakeGroup(string spawnId, SpawnActivation activation, bool active)
            {
                SpawnId = spawnId;
                Activation = activation;
                Active = active;
            }

            public string SpawnId { get; }

            public SpawnActivation Activation { get; }

            public bool Active { get; private set; }

            public int Calls { get; private set; }

            public void SetGroupActive(bool active)
            {
                Active = active;
                Calls++;
            }
        }
    }
}
