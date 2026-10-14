using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Save section <c>spawners</c> (architecture 9.2, load order 88): activated and defeated quest groups survive a JSON round
    /// trip, a new game clears them.
    /// </summary>
    [TestFixture]
    public sealed class SpawnGroupSaveableTests
    {
        private const string Pack = "spawn.eichental.nordhang_rudel";
        private const string Boss = "spawn.eichental.glutfang";

        [Test]
        public void KeyOrderAndDto()
        {
            var saveable = new SpawnGroupSaveable(new SpawnGroupRegistry());

            Assert.That(saveable.SaveKey, Is.EqualTo("spawners"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(88));
            Assert.That(saveable.DataType, Is.EqualTo(typeof(SpawnGroupsDto)));
            Assert.That(SaveDtoValidator.Validate(typeof(SpawnGroupsDto), out string problem), Is.True, problem);
        }

        [Test]
        public void RoundTripKeepsActivatedAndDefeatedGroups()
        {
            var source = new SpawnGroupRegistry();
            source.Activate(Pack);
            source.Activate(Boss);
            source.MarkCleared(Pack);

            var dto = (SpawnGroupsDto)new SpawnGroupSaveable(source).Save();
            var serializer = new NewtonsoftJsonSerializer();
            string json = serializer.Serialize(dto, false);
            Assert.That(json, Does.Contain("\"activated\""), "camelCase like every save section");

            var target = new SpawnGroupRegistry();
            new SpawnGroupSaveable(target).Load(serializer.Deserialize<SpawnGroupsDto>(json), QuestTestEnvironment.LoadedGame);

            Assert.That(target.IsActivated(Pack), Is.True);
            Assert.That(target.IsActivated(Boss), Is.True);
            Assert.That(target.IsCleared(Pack), Is.True);
            Assert.That(target.IsCleared(Boss), Is.False);
        }

        [Test]
        public void NewGameClearsTheState()
        {
            var registry = new SpawnGroupRegistry();
            registry.Activate(Pack);

            new SpawnGroupSaveable(registry).Load(null, LoadContext.NewGame);

            Assert.That(registry.ActivatedIds, Is.Empty);
            Assert.That(registry.ClearedIds, Is.Empty);
        }
    }
}
