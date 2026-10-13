using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.GameTime;
using Aetherfall.Player;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// Golden save test (architecture 9.5): <c>Tests/TestData/Saves/v1/golden_v1.sav.json</c> is decoded into the real DTOs of
    /// the game, loaded into the real saveables and saved again; the result must be byte-identical. The old format
    /// (<c>v0/golden_v0.sav.json</c>) must end up as exactly the same file after migration.
    /// </summary>
    /// <remarks>
    /// If this test fails after a change to a DTO, the save format changed: add a migration step, keep the old golden
    /// file as the next <c>vN</c> and write a new current one (see <c>Tests/TestData/Saves/README.md</c>).
    /// </remarks>
    [TestFixture]
    public sealed class GoldenSaveTests
    {
        private const string GoldenV1 = "Saves/v1/golden_v1.sav.json";
        private const string GoldenV0 = "Saves/v0/golden_v0.sav.json";
        private const string GoldenSlotName = "quick_0";

        private static readonly DateTime GoldenTime = new DateTime(2026, 10, 13, 18, 30, 0, DateTimeKind.Utc);

        private static readonly Dictionary<string, Type> SectionTypes = new Dictionary<string, Type>
        {
            { PlaytimeClock.Key, typeof(PlaytimeDto) },
            { PlayerResourcesSaveable.Key, typeof(PlayerResourcesDto) },
            { PlayerLocationSaveable.Key, typeof(PlayerLocationDto) }
        };

        private LogCapture _log;
        private EventBus _bus;
        private GameStateService _gameState;
        private string _root;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _gameState = new GameStateService(_bus, new FakeTimeScaleService());
            _gameState.SwitchBase(GameState.MainMenu, "test");
            _gameState.SwitchBase(GameState.Loading, "test");
            _gameState.SwitchBase(GameState.Playing, "test");
            _root = Path.Combine(Path.GetTempPath(), "aetherfall-golden-" + Guid.NewGuid().ToString("N"));
        }

        [TearDown]
        public void TearDown()
        {
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, true);
            }

            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void GoldenV1_DecodesIntoTheRealDtos()
        {
            var codec = new SaveDocumentCodec();

            SaveSnapshot snapshot = codec.Decode(TestDataFiles.ReadAllBytes(GoldenV1), SectionTypes);

            Assert.That(snapshot.Header.SlotId, Is.EqualTo("char_01/quick_0"));
            Assert.That(snapshot.Header.PlaytimeSeconds, Is.EqualTo(754.5));
            Assert.That(snapshot.TryGet(PlaytimeClock.Key, out object time), Is.True);
            Assert.That(((PlaytimeDto)time).PlaytimeSeconds, Is.EqualTo(754.5));
            Assert.That(snapshot.TryGet(PlayerResourcesSaveable.Key, out object resources), Is.True);
            Assert.That(((PlayerResourcesDto)resources).Health, Is.EqualTo(98.5f));
            Assert.That(((PlayerResourcesDto)resources).Stamina, Is.EqualTo(64.25f));
            Assert.That(snapshot.TryGet(PlayerLocationSaveable.Key, out object location), Is.True);
            var dto = (PlayerLocationDto)location;
            Assert.That(dto.CellZ, Is.EqualTo(-1));
            Assert.That(dto.LocalZ, Is.EqualTo(500f));
            Assert.That(dto.WorldSpaceId, Is.EqualTo("worldspace.test.testgelaende"));
        }

        [Test]
        public void GoldenV1_ReEncodesByteIdentical()
        {
            var codec = new SaveDocumentCodec();
            string golden = TestDataFiles.ReadAllText(GoldenV1);

            SaveSnapshot snapshot = codec.Decode(Encoding.UTF8.GetBytes(golden), SectionTypes);
            string again = codec.EncodeToText(snapshot, true);

            Assert.That(again, Is.EqualTo(golden));
        }

        [Test]
        public void GoldenV0_AfterMigration_EncodesExactlyAsGoldenV1()
        {
            var codec = new SaveDocumentCodec();
            JObject root = codec.ParseDocument(TestDataFiles.ReadAllBytes(GoldenV0));

            MigrationOutcome outcome = SaveMigrationChain.CreateDefault().Migrate(root, "char_01/quick_0");
            string migrated = codec.EncodeToText(codec.ToSnapshot(root, SectionTypes), true);

            Assert.That(outcome.Status, Is.EqualTo(MigrationStatus.Migrated), outcome.Message);
            Assert.That(migrated, Is.EqualTo(TestDataFiles.ReadAllText(GoldenV1)));
        }

        [TestCase(GoldenV1)]
        [TestCase(GoldenV0)]
        public void Golden_LoadedThroughTheSaveManager_AndQuickSavedAgain_IsTheSameFile(string goldenFile)
        {
            string golden = TestDataFiles.ReadAllText(GoldenV1);
            var files = new SystemFileStore();
            string characterDirectory = Path.Combine(_root, SaveFormat.DefaultCharacterId);
            Directory.CreateDirectory(characterDirectory);
            string saveFile = Path.Combine(characterDirectory, GoldenSlotName + SaveFormat.SaveExtension);
            File.WriteAllBytes(saveFile, TestDataFiles.ReadAllBytes(goldenFile));

            var placement = new FakePlayerPlacement(new PlayerPose(0f, 0f, 0f, 0f), "worldspace.unknown");
            var health = new Health(100f, ResourcePoolSettings.Health, "player");
            var stamina = new ResourcePool(100f, ResourcePoolSettings.Stamina);
            var mana = new ResourcePool(100f, ResourcePoolSettings.Mana);
            var clock = new PlaytimeClock(_gameState);
            var manager = new SaveManager(_bus, _gameState, files, new FixedSaveLocation(_root), new SaveManagerSettings
            {
                UseBackgroundThread = false,
                GameVersion = "0.1.0",
                UtcNow = () => GoldenTime
            });
            manager.Register(clock);
            manager.RegisterHeaderContributor(clock);
            manager.Register(new PlayerResourcesSaveable(health, stamina, mana));
            manager.Register(new PlayerLocationSaveable(placement, _bus));

            LoadResult loaded = manager.Load("char_01/" + GoldenSlotName);

            Assert.That(loaded.Success, Is.True, loaded.ToString());
            Assert.That(_gameState.Current, Is.EqualTo(GameState.Playing));
            Assert.That(clock.PlaytimeSeconds, Is.EqualTo(754.5));
            Assert.That(health.Current, Is.EqualTo(98.5f));
            Assert.That(stamina.Current, Is.EqualTo(64.25f));
            Assert.That(mana.Current, Is.EqualTo(55f));
            Assert.That(placement.WorldSpaceId, Is.EqualTo("worldspace.test.testgelaende"));
            Assert.That(placement.CurrentPose.X, Is.EqualTo(12.5f));
            Assert.That(placement.CurrentPose.Y, Is.EqualTo(1.25f));
            Assert.That(placement.CurrentPose.Z, Is.EqualTo(-12f));
            Assert.That(placement.CurrentPose.Yaw, Is.EqualTo(90f));

            // Free the slot again, so the quick save rotation writes quick_0 (the slot id is part of the header).
            File.Delete(saveFile);
            SaveResult saved = manager.Save(SaveRequest.Quick());

            Assert.That(saved.Success, Is.True, saved.ToString());
            Assert.That(saved.SlotId, Is.EqualTo("char_01/" + GoldenSlotName));
            byte[] written = File.ReadAllBytes(saveFile);
            Assert.That(Encoding.UTF8.GetString(written), Is.EqualTo(golden));
            string head = File.ReadAllText(Path.Combine(characterDirectory, GoldenSlotName + SaveFormat.HeadExtension));
            Assert.That(head, Does.Contain(SaveChecksum.Sha256Hex(written)), "the header file carries the checksum of the save");
            manager.Dispose();
        }
    }
}
