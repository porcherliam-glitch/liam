using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Save section <c>worldstate</c> (architecture 8.3, 9.2, load order 20): only values that differ from their start value
    /// with the playtime of the change, JSON round trip, new game, no events while loading, normalization against the
    /// definitions and orphans (saved ids without definition are kept and saved again).
    /// </summary>
    [TestFixture]
    public sealed class WorldStateSaveableTests
    {
        private const string Burned = "flag.eichental.dorf_zerstoert";
        private const string Bandits = "stat.global.banditen_getoetet";
        private const string Resonance = "stat.player.leere_resonanz";

        private LogCapture _log;
        private EventBus _bus;
        private FakePlaytimeClock _clock;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _clock = new FakePlaytimeClock();
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void KeyOrderAndDto()
        {
            var saveable = new WorldStateSaveable(CreateWorld());

            Assert.That(saveable.SaveKey, Is.EqualTo("worldstate"));
            Assert.That(saveable.LoadOrder, Is.EqualTo(20));
            Assert.That(saveable.DataType, Is.EqualTo(typeof(WorldStateDto)));
            Assert.That(SaveDtoValidator.Validate(typeof(WorldStateDto), out string problem), Is.True, problem);
        }

        [Test]
        public void RoundTrip_KeepsChangedValuesAndTimes_Only()
        {
            WorldStateService source = CreateWorld();
            _clock.PlaytimeSeconds = 120.0;
            source.SetBool(Burned, true, "test");
            source.Add(Bandits, 37, "test");
            source.SetInt(Resonance, 50, "test");
            source.SetInt(Resonance, 0, "test");
            source.SetBool("flag.eichental.waise", true, "test");

            WorldStateDto saved = RoundTrip((WorldStateDto)new WorldStateSaveable(source).Save());
            Assert.That(saved.Flags.Count, Is.EqualTo(3), "start values are not saved");

            WorldStateService target = CreateWorld();
            using (var changes = new EventRecorder<FlagChanged>(_bus))
            {
                new WorldStateSaveable(target).Load(saved, QuestTestEnvironment.LoadedGame);
                Assert.That(changes.Count, Is.EqualTo(0), "loading sends no events (architecture 9.1)");
            }

            Assert.That(target.GetBool(Burned), Is.True);
            Assert.That(target.GetInt(Bandits), Is.EqualTo(37));
            Assert.That(target.GetInt(Resonance), Is.EqualTo(0));
            Assert.That(target.LastChangedPlaytime(Burned), Is.EqualTo(120.0));
            Assert.That(target.GetBool("flag.eichental.waise"), Is.True, "orphan kept");
            Assert.That(target.UndefinedFlagIds, Does.Contain("flag.eichental.waise"));
            Assert.That(((WorldStateDto)new WorldStateSaveable(target).Save()).Flags.Count, Is.EqualTo(3), "orphan saved again");
        }

        [Test]
        public void NewGame_StartsWithTheStartValues()
        {
            WorldStateService world = CreateWorld();
            world.SetBool(Burned, true, "test");

            new WorldStateSaveable(world).Load(null, LoadContext.NewGame);

            Assert.That(world.GetBool(Burned), Is.False);
            Assert.That(world.StoredCount, Is.EqualTo(0));
            Assert.That(world.GetRecentChanges(), Is.Empty, "history starts empty");
        }

        [Test]
        public void Load_NormalizesValuesAgainstTheDefinitions()
        {
            var dto = new WorldStateDto();
            dto.Flags.Add(new FlagEntryDto { Id = Resonance, Value = 400, ChangedAt = 1.0 });
            dto.Flags.Add(new FlagEntryDto { Id = Bandits, Value = -4, ChangedAt = 1.0 });
            dto.Flags.Add(new FlagEntryDto { Id = string.Empty, Value = 1 });
            dto.Flags.Add(null);
            WorldStateService world = CreateWorld();

            new WorldStateSaveable(world).Load(dto, QuestTestEnvironment.LoadedGame);

            Assert.That(world.GetInt(Resonance), Is.EqualTo(100), "clamped to the range of the story number");
            Assert.That(world.GetInt(Bandits), Is.EqualTo(0));
            Assert.That(world.StoredCount, Is.EqualTo(1), "counter -4 becomes the start value 0 and is dropped");
        }

        private static WorldStateDto RoundTrip(WorldStateDto dto)
        {
            var serializer = new NewtonsoftJsonSerializer();
            string json = serializer.Serialize(dto, false);
            Assert.That(json, Does.Contain("\"changedAt\""), "camelCase like every save section");
            return serializer.Deserialize<WorldStateDto>(json);
        }

        private WorldStateService CreateWorld()
        {
            FlagRegistry flags = FlagRegistry.FromSpecs(FlagSpec.Bool(Burned), FlagSpec.Counter(Bandits), FlagSpec.StoryNumber(Resonance, 0, 100, 0));
            return new WorldStateService(_bus, flags, _clock);
        }
    }
}
