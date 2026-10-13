using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// <see cref="SaveManager"/> end to end on in-memory files (architecture 9): registry, round trip, load order, events,
    /// game state, locks, rotation, backups, damaged files, versions, autosave.
    /// </summary>
    [TestFixture]
    public sealed class SaveManagerTests
    {
        private SaveTestEnvironment _env;
        private List<string> _journal;
        private SaveManager _manager;
        private CounterSaveable _early;
        private CounterSaveable _late;
        private EventRecorder<GameSaved> _saved;
        private EventRecorder<GameLoaded> _loaded;
        private EventRecorder<GameStateChanged> _states;

        [SetUp]
        public void SetUp()
        {
            _env = new SaveTestEnvironment();
            _journal = new List<string>();
            _manager = _env.CreateManager();
            _late = new CounterSaveable("late", 100, _journal);
            _early = new CounterSaveable("early", 10, _journal);
            _manager.Register(_late);
            _manager.Register(_early);
            _saved = new EventRecorder<GameSaved>(_env.Bus);
            _loaded = new EventRecorder<GameLoaded>(_env.Bus);
            _states = new EventRecorder<GameStateChanged>(_env.Bus);
        }

        [TearDown]
        public void TearDown()
        {
            _states.Dispose();
            _loaded.Dispose();
            _saved.Dispose();
            _manager.Dispose();
            _env.Dispose();
        }

        [Test]
        public void Register_SortsByLoadOrder_AndRejectsDuplicateKeysAndInvalidDtos()
        {
            Assert.That(_manager.Saveables.Select(s => s.SaveKey), Is.EqualTo(new[] { "early", "late" }));
            _manager.Register(_early);
            Assert.That(_manager.Saveables.Count, Is.EqualTo(2), "registering the same instance twice is ignored");

            Assert.Throws<InvalidOperationException>(() => _manager.Register(new CounterSaveable("early", 5)));
            Assert.Throws<ArgumentException>(() => _manager.Register(new InvalidSaveable()));
            Assert.Throws<ArgumentNullException>(() => _manager.Register(null));
        }

        [Test]
        public void SaveThenLoad_RestoresTheState_InLoadOrder_ThenOnAfterLoad()
        {
            _early.Value = 3;
            _late.Value = 42;
            _late.Name = "Liara";
            SaveResult saved = _manager.Save(SaveRequest.Quick());
            Assert.That(saved.Success, Is.True, saved.ToString());
            Assert.That(saved.SlotId, Is.EqualTo("char_01/quick_0"));

            _early.Value = 0;
            _late.Value = 0;
            _journal.Clear();
            LoadResult loaded = _manager.Load(saved.SlotId);

            Assert.That(loaded.Success, Is.True, loaded.ToString());
            Assert.That(_early.Value, Is.EqualTo(3));
            Assert.That(_late.Value, Is.EqualTo(42));
            Assert.That(_late.Name, Is.EqualTo("Liara"));
            Assert.That(_journal, Is.EqualTo(new[] { "load:early", "load:late", "after:early", "after:late" }));
            Assert.That(_late.LastContext.SlotId, Is.EqualTo("char_01/quick_0"));
            Assert.That(_late.LastContext.IsNewGame, Is.False);
            Assert.That(_late.LastContext.Header.Kind, Is.EqualTo("quick"));
        }

        [Test]
        public void Save_WritesSaveAndHeader_AndPublishesGameSaved()
        {
            var contributor = new PlaytimeContributor(3600.5);
            _manager.RegisterHeaderContributor(contributor);

            SaveResult result = _manager.Save(SaveRequest.Quick());

            Assert.That(result.Success, Is.True);
            Assert.That(_env.Files.FileExists(SaveTestEnvironment.SlotFile("quick_0", ".sav")), Is.True);
            Assert.That(_env.Files.FileExists(SaveTestEnvironment.SlotFile("quick_0", ".head.json")), Is.True);
            Assert.That(_saved.Count, Is.EqualTo(1));
            Assert.That(_saved.Last.Success, Is.True);
            Assert.That(_saved.Last.Kind, Is.EqualTo(SaveKind.Quick));
            Assert.That(_manager.LastSaveResult.SlotId, Is.EqualTo("char_01/quick_0"));

            SaveSlotInfo slot = _manager.ListSlots(null).Single();
            Assert.That(slot.Header.CreatedUtc, Is.EqualTo("2026-10-13T18:30:00Z"));
            Assert.That(slot.Header.GameVersion, Is.EqualTo("0.1.0"));
            Assert.That(slot.Header.SaveVersion, Is.EqualTo(SaveFormat.CurrentVersion));
            Assert.That(slot.Header.PlaytimeSeconds, Is.EqualTo(3600.5), "header contributor");
            Assert.That(slot.Header.Sha256, Has.Length.EqualTo(64));
            Assert.That(SaveChecksum.Sha256Hex(_env.Files.Get(SaveTestEnvironment.SlotFile("quick_0", ".sav"))), Is.EqualTo(slot.Header.Sha256));
            string json = Encoding.UTF8.GetString(_env.Files.Get(SaveTestEnvironment.SlotFile("quick_0", ".sav")));
            Assert.That(json, Does.Contain("\"early\": {").And.Contain("\"late\": {"), "readable, indented JSON in dev builds");
        }

        [Test]
        public void Load_SwitchesPlayingLoadingPlaying_AndPublishesGameLoaded()
        {
            _manager.Save(SaveRequest.Quick());
            _states.Clear();

            _manager.Load("char_01/quick_0");

            Assert.That(_states.Events.Select(e => e.Current), Is.EqualTo(new[] { GameState.Loading, GameState.Playing }));
            Assert.That(_loaded.Count, Is.EqualTo(1));
            Assert.That(_loaded.Last.SlotId, Is.EqualTo("char_01/quick_0"));
            Assert.That(_loaded.Last.SaveVersion, Is.EqualTo(SaveFormat.CurrentVersion));
            Assert.That(_env.StateService.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void LoadFromPause_EndsInPlaying()
        {
            _manager.Save(SaveRequest.Quick());
            _env.StateService.Push(GameState.Paused, "test");

            Assert.That(_manager.Load("char_01/quick_0").Success, Is.True);
            Assert.That(_env.StateService.Current, Is.EqualTo(GameState.Playing));
        }

        [Test]
        public void QuickSaves_RotateThroughThreeSlots_TheFourthOverwritesTheOldest()
        {
            for (int i = 0; i < 4; i++)
            {
                _early.Value = i;
                _env.Advance(60);
                Assert.That(_manager.Save(SaveRequest.Quick()).Success, Is.True);
            }

            Assert.That(_manager.LastSaveResult.SlotId, Is.EqualTo("char_01/quick_0"), "4th save overwrote the oldest");
            IReadOnlyList<SaveSlotInfo> slots = _manager.ListSlots(null);
            Assert.That(slots.Select(s => s.SlotName), Is.EqualTo(new[] { "quick_0", "quick_2", "quick_1" }), "newest first");
            Assert.That(slots[0].HasBackup, Is.True, "the overwritten version is the backup");
            Assert.That(_manager.TryGetLatestSlot(SaveKind.Quick, out SaveSlotInfo latest), Is.True);
            Assert.That(latest.SlotName, Is.EqualTo("quick_0"));

            _manager.Load(latest.SlotId);
            Assert.That(_early.Value, Is.EqualTo(3));
        }

        [Test]
        public void ManualSaves_AreNumbered()
        {
            Assert.That(_manager.Save(SaveRequest.Manual()).SlotId, Is.EqualTo("char_01/manual_001"));
            _env.Advance(1);
            Assert.That(_manager.Save(SaveRequest.Manual()).SlotId, Is.EqualTo("char_01/manual_002"));
            Assert.That(_manager.Save(SaveRequest.Manual("vor_dem_boss")).SlotId, Is.EqualTo("char_01/vor_dem_boss"));
            Assert.That(_manager.Save(SaveRequest.Manual("Bad Name")).ReasonKey, Is.EqualTo(SaveReasonKeys.InvalidSlot));
        }

        [Test]
        public void SavingIsBlocked_InDialogue_ByBlockers_AndInCombat()
        {
            Assert.That(_manager.IsSaveAllowed(out _), Is.True);

            _env.StateService.Push(GameState.Dialogue, "test");
            Assert.That(_manager.IsSaveAllowed(out string reason), Is.False);
            Assert.That(reason, Is.EqualTo("save.blocked.state.dialogue"));
            _env.StateService.Pop(GameState.Dialogue);

            _env.StateService.Push(GameState.Paused, "test");
            Assert.That(_manager.IsSaveAllowed(out _), Is.True, "pause menu allows saving");
            _env.StateService.Pop(GameState.Paused);

            _manager.AddBlocker("player.falling", "save.blocked.falling");
            Assert.That(_manager.IsSaveAllowed(out reason), Is.False);
            Assert.That(reason, Is.EqualTo("save.blocked.falling"));
            _manager.RemoveBlocker("player.falling");

            _manager.PostInitialize();
            var combat = new CombatStateChanged(true);
            _env.Bus.Publish(in combat);
            Assert.That(_manager.IsSaveAllowed(out reason), Is.False);
            Assert.That(reason, Is.EqualTo(SaveReasonKeys.Combat));
            var peace = new CombatStateChanged(false);
            _env.Bus.Publish(in peace);
            Assert.That(_manager.IsSaveAllowed(out _), Is.True);
        }

        [Test]
        public void BlockedSave_WritesNothing_AndReportsTheReason()
        {
            _manager.AddBlocker("world.arena", "save.blocked.arena");

            SaveResult result = _manager.Save(SaveRequest.Quick());

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo("save.blocked.arena"));
            Assert.That(_env.Files.Paths, Is.Empty);
            Assert.That(_saved.Count, Is.EqualTo(0), "refused saves send no GameSaved");
            Assert.That(_manager.LastSaveResult.ReasonKey, Is.EqualTo("save.blocked.arena"));
        }

        [Test]
        public void FailingSnapshot_FailsTheSave_WithoutFiles()
        {
            _late.ThrowOnSave = true;

            SaveResult result = _manager.Save(SaveRequest.Quick());

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.CaptureFailed));
            Assert.That(_env.Files.Paths, Is.Empty);
            Assert.That(_saved.Count, Is.EqualTo(1));
            Assert.That(_saved.Last.Success, Is.False);
            Assert.That(_manager.IsBusy, Is.False);
        }

        [Test]
        public void FailingWrite_KeepsThePreviousSave()
        {
            _early.Value = 1;
            _manager.Save(SaveRequest.Manual("slot"));
            _early.Value = 2;
            _env.Files.FailNextWrite = true;

            SaveResult result = _manager.Save(SaveRequest.Manual("slot"));

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.WriteFailed));
            Assert.That(_saved.Last.Success, Is.False);
            _manager.Load("char_01/slot");
            Assert.That(_early.Value, Is.EqualTo(1), "the previous state is unchanged");
        }

        [Test]
        public void DamagedSave_LoadsTheBackup_AndMovesTheDamagedFileAway()
        {
            _early.Value = 1;
            _manager.Save(SaveRequest.Manual("slot"));
            _early.Value = 2;
            _env.Advance(60);
            _manager.Save(SaveRequest.Manual("slot"));
            _env.Files.Put(SaveTestEnvironment.SlotFile("slot", ".sav"), Encoding.UTF8.GetBytes("{ broken"));

            LoadResult result = _manager.Load("char_01/slot");

            Assert.That(result.Success, Is.True, result.ToString());
            Assert.That(result.LoadedFromBackup, Is.True);
            Assert.That(_early.Value, Is.EqualTo(1), "state of the backup");
            Assert.That(_env.Files.Paths.Any(p => p.Contains("/Beschaedigt/slot_")), Is.True, "damaged file kept for error reports");
            Assert.That(_late.LastContext.LoadedFromBackup, Is.True);
        }

        [Test]
        public void ChecksumMismatch_IsTreatedAsDamage()
        {
            _early.Value = 1;
            _manager.Save(SaveRequest.Manual("slot"));
            _env.Advance(60);
            _early.Value = 2;
            _manager.Save(SaveRequest.Manual("slot"));
            string path = SaveTestEnvironment.SlotFile("slot", ".sav");
            string json = Encoding.UTF8.GetString(_env.Files.Get(path)).Replace("\"value\": 2", "\"value\": 999");
            _env.Files.Put(path, Encoding.UTF8.GetBytes(json));

            LoadResult result = _manager.Load("char_01/slot");

            Assert.That(result.LoadedFromBackup, Is.True, "manipulated file is not trusted");
            Assert.That(_early.Value, Is.EqualTo(1));
        }

        [Test]
        public void OutdatedHeaderFile_IsAccepted()
        {
            // Crash between writing the .sav and its header: the header still describes the older save.
            _manager.Save(SaveRequest.Manual("slot"));
            byte[] oldHead = _env.Files.Get(SaveTestEnvironment.SlotFile("slot", ".head.json"));
            _env.Advance(60);
            _early.Value = 5;
            _manager.Save(SaveRequest.Manual("slot"));
            _env.Files.Put(SaveTestEnvironment.SlotFile("slot", ".head.json"), oldHead);

            LoadResult result = _manager.Load("char_01/slot");

            Assert.That(result.Success, Is.True, result.ToString());
            Assert.That(result.LoadedFromBackup, Is.False);
            Assert.That(_early.Value, Is.EqualTo(5));
            Assert.That(result.Message, Does.Contain("outdated"));
        }

        [Test]
        public void DamagedSaveWithoutBackup_FailsAndChangesNothing()
        {
            _env.Files.Put(SaveTestEnvironment.SlotFile("slot", ".sav"), Encoding.UTF8.GetBytes("not json"));
            _early.Value = 7;
            _states.Clear();

            LoadResult result = _manager.Load("char_01/slot");

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.Corrupt));
            Assert.That(_early.Value, Is.EqualTo(7));
            Assert.That(_states.Count, Is.EqualTo(0), "no game state change");
            Assert.That(_manager.IsBusy, Is.False);
        }

        [Test]
        public void NewerSave_IsRefused_AndNothingChanges()
        {
            const string json = "{ \"header\": { \"saveVersion\": 99 }, \"sections\": { \"early\": { \"value\": 5 } } }";
            _env.Files.Put(SaveTestEnvironment.SlotFile("future", ".sav"), Encoding.UTF8.GetBytes(json));

            LoadResult result = _manager.Load("char_01/future");

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.NewerVersion));
            Assert.That(_early.LoadCount, Is.EqualTo(0));
            Assert.That(SaveReasonKeys.ToGermanText(result.ReasonKey), Does.Contain("neuere Spielversion"));
        }

        [Test]
        public void MissingSection_LoadsDefaults_UnknownSectionIsIgnored()
        {
            const string json = "{ \"header\": { \"saveVersion\": 1 }, \"sections\": { \"early\": { \"value\": 5 }, \"housing\": { \"rooms\": 2 } } }";
            _env.Files.Put(SaveTestEnvironment.SlotFile("partial", ".sav"), Encoding.UTF8.GetBytes(json));
            _late.Value = 9;

            LoadResult result = _manager.Load("char_01/partial");

            Assert.That(result.Success, Is.True, result.ToString());
            Assert.That(_early.Value, Is.EqualTo(5));
            Assert.That(_late.LoadCount, Is.EqualTo(1), "a saveable without section still loads (defaults)");
            Assert.That(_late.LastLoaded, Is.Null);
            Assert.That(_late.Value, Is.EqualTo(0));
            Assert.That(result.Message, Does.Contain("housing"));
        }

        [Test]
        public void LoadRefusals_NotFoundInvalidSlotAndWrongState()
        {
            Assert.That(_manager.Load("char_01/nothing").ReasonKey, Is.EqualTo(SaveReasonKeys.NotFound));
            Assert.That(_manager.Load("../../etc/passwd").ReasonKey, Is.EqualTo(SaveReasonKeys.InvalidSlot));

            _manager.Save(SaveRequest.Quick());
            _env.StateService.Push(GameState.Dialogue, "test");
            Assert.That(_manager.Load("char_01/quick_0").ReasonKey, Is.EqualTo(SaveReasonKeys.LoadState));
        }

        [Test]
        public void CompressedSaves_AreWrittenAsGZip_AndLoad()
        {
            SaveManager manager = _env.CreateManager(settings => settings.Compress = true);
            var counter = new CounterSaveable("counter", 1) { Value = 11 };
            manager.Register(counter);

            manager.Save(SaveRequest.Quick());
            counter.Value = 0;
            manager.Load("char_01/quick_0");

            Assert.That(SaveCompression.IsGZip(_env.Files.Get(SaveTestEnvironment.SlotFile("quick_0", ".sav"))), Is.True);
            Assert.That(counter.Value, Is.EqualTo(11));
            Assert.That(manager.ListSlots(null)[0].Header.Compressed, Is.True);
            manager.Dispose();
        }

        [Test]
        public void AsyncApi_CompletesWithTheResults()
        {
            _early.Value = 4;
            var saveAwaiter = _manager.SaveAsync(SaveRequest.Quick(), CancellationToken.None).GetAwaiter();
            Assert.That(saveAwaiter.IsCompleted, Is.True, "synchronous without background thread");
            Assert.That(saveAwaiter.GetResult().Success, Is.True);

            _early.Value = 0;
            var loadAwaiter = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter();
            Assert.That(loadAwaiter.GetResult().Success, Is.True);
            Assert.That(_early.Value, Is.EqualTo(4));

            var newGameAwaiter = _manager.NewGameAsync(default, CancellationToken.None).GetAwaiter();
            Assert.That(newGameAwaiter.GetResult().Success, Is.True);
        }

        [Test]
        public void QuickLoad_WithoutQuickSave_Fails()
        {
            LoadResult result = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter().GetResult();

            Assert.That(result.Success, Is.False);
            Assert.That(result.ReasonKey, Is.EqualTo(SaveReasonKeys.NoQuickSave));
        }

        [Test]
        public void NewGame_LoadsDefaultsIntoEverySaveable()
        {
            _early.Value = 3;
            _states.Clear();

            LoadResult result = _manager.NewGame(new NewGameSettings("char_02"));

            Assert.That(result.Success, Is.True);
            Assert.That(_early.LastLoaded, Is.Null);
            Assert.That(_early.LastContext.IsNewGame, Is.True);
            Assert.That(_early.Value, Is.EqualTo(0));
            Assert.That(_manager.CharacterId, Is.EqualTo("char_02"));
            Assert.That(_states.Events.Select(e => e.Current), Is.EqualTo(new[] { GameState.Loading, GameState.Playing }));
        }

        [Test]
        public void PostInitialize_DeletesOrphanedTempFiles()
        {
            _env.Files.Put(SaveTestEnvironment.SlotFile("quick_0", ".sav.tmp"), new byte[] { 1 });

            _manager.PostInitialize();

            Assert.That(_env.Files.Paths, Is.Empty);
        }

        [Test]
        public void Autosave_RunsAfterTheIntervalOfPlaytime_NotWhilePaused()
        {
            SaveManager manager = _env.CreateManager(settings => settings.AutosaveIntervalSeconds = 120f);
            manager.Register(new CounterSaveable("counter", 1));

            _env.StateService.Push(GameState.Paused, "test");
            for (int i = 0; i < 200; i++)
            {
                manager.Tick(1f);
            }

            Assert.That(manager.ListSlots(null), Is.Empty, "the playtime does not run in the pause menu");
            _env.StateService.Pop(GameState.Paused);
            for (int i = 0; i < 120; i++)
            {
                manager.Tick(1f);
            }

            Assert.That(manager.ListSlots(null).Select(s => s.SlotName), Is.EqualTo(new[] { "auto_0" }));
            Assert.That(manager.LastSaveResult.Kind, Is.EqualTo(SaveKind.Auto));
            manager.Dispose();
        }

        [Test]
        public void Constructor_RejectsAnIncompleteMigrationChain()
        {
            Assert.Throws<ArgumentException>(() => _env.CreateManager(settings =>
                settings.Migrations = new SaveMigrationChain(2, new ISaveMigration[] { new SaveMigrationV0ToV1() })));
            Assert.Throws<ArgumentException>(() => _env.CreateManager(settings => settings.CharacterId = "Bad Id"));
        }

        [Test]
        public void SaveDirectory_IsTheCharacterFolder()
        {
            Assert.That(InMemoryFileStore.Normalize(_manager.SaveDirectory), Is.EqualTo("/saves/char_01"));
        }

        [Test]
        public void SectionWithoutSaveable_IsKeptUnchangedByLaterSaves()
        {
            var housing = new CounterSaveable("housing", 90) { Value = 5, Name = "Garten" };
            _manager.Register(housing);
            _manager.Save(SaveRequest.Manual("slot"));
            string original = SectionText(SlotText("slot.sav"), "housing");
            _manager.Unregister(housing);

            _env.Advance(10);
            LoadResult loaded = _manager.Load("char_01/slot");
            _env.Advance(10);
            _manager.Save(SaveRequest.Manual("slot"));
            _env.Advance(10);
            _manager.Save(SaveRequest.Manual("slot"));

            Assert.That(loaded.Success, Is.True, loaded.ToString());
            Assert.That(loaded.Message, Does.Contain("housing"));
            Assert.That(SectionText(SlotText("slot.sav"), "housing"), Is.EqualTo(original), "byte-identical after load and two saves");
            Assert.That(SectionText(SlotText("slot.sav.bak"), "housing"), Is.EqualTo(original), "the backup has it as well");
        }

        [Test]
        public void LateRegisteredSaveable_ReceivesItsSectionOfTheLastLoad()
        {
            var housing = new CounterSaveable("housing", 90, _journal) { Value = 5, Name = "Garten" };
            _manager.Register(housing);
            _manager.Save(SaveRequest.Manual("slot"));
            _manager.Unregister(housing);
            _env.Advance(10);
            _manager.Load("char_01/slot");
            _journal.Clear();

            // Like a scene object that registers in Start after the load (architecture 9.2: scenes load after Load()).
            var late = new CounterSaveable("housing", 90, _journal);
            _manager.Register(late);

            Assert.That(late.Value, Is.EqualTo(5));
            Assert.That(late.Name, Is.EqualTo("Garten"));
            Assert.That(late.LastContext.SlotId, Is.EqualTo("char_01/slot"));
            Assert.That(late.LastContext.IsNewGame, Is.False);
            Assert.That(_journal, Is.EqualTo(new[] { "load:housing", "after:housing" }));

            late.Value = 6;
            _env.Advance(10);
            _manager.Save(SaveRequest.Manual("slot"));
            Assert.That(SectionText(SlotText("slot.sav"), "housing"), Does.Contain("\"value\": 6"), "now saved by the saveable itself");

            _manager.Unregister(late);
            _manager.Register(late);
            Assert.That(late.LoadCount, Is.EqualTo(1), "a kept section is handed over only once");
        }

        [Test]
        public void NewGame_DropsTheKeptSections()
        {
            var housing = new CounterSaveable("housing", 90) { Value = 5 };
            _manager.Register(housing);
            _manager.Save(SaveRequest.Manual("slot"));
            _manager.Unregister(housing);
            _manager.Load("char_01/slot");

            _manager.NewGame(default);
            _env.Advance(10);
            _manager.Save(SaveRequest.Manual("fresh"));
            var late = new CounterSaveable("housing", 90);
            _manager.Register(late);

            Assert.That(SlotText("fresh.sav"), Does.Not.Contain("\"housing\""));
            Assert.That(late.LoadCount, Is.EqualTo(0));
        }

        [Test]
        public void TwoQuickSavesInTheSameSecond_QuickLoadTakesTheNewer()
        {
            _early.Value = 1;
            _manager.Save(SaveRequest.Quick());
            _env.Advance(0.4);
            _early.Value = 2;
            _manager.Save(SaveRequest.Quick());
            _early.Value = 0;

            LoadResult result = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter().GetResult();

            Assert.That(result.SlotId, Is.EqualTo("char_01/quick_1"));
            Assert.That(_early.Value, Is.EqualTo(2), "F9 loads the newest (guide 04, 7.3)");
            IReadOnlyList<SaveSlotInfo> slots = _manager.ListSlots(null);
            Assert.That(slots.Select(s => s.SlotName), Is.EqualTo(new[] { "quick_1", "quick_0" }), "newest first");
            Assert.That(slots.Select(s => s.Header.SaveSequence), Is.EqualTo(new[] { 1L, 0L }));
            Assert.That(slots[0].CreatedUtc, Is.EqualTo(slots[1].CreatedUtc), "same second");
            Assert.That(SlotText("quick_1.head.json"), Does.Contain("\"saveSequence\": 1"));
            Assert.That(SlotText("quick_0.head.json"), Does.Not.Contain("saveSequence"), "0 is not written (older files stay byte-identical)");

            _env.Advance(0.4);
            Assert.That(_manager.Save(SaveRequest.Quick()).SlotId, Is.EqualTo("char_01/quick_2"));
            _env.Advance(0.1);
            Assert.That(_manager.Save(SaveRequest.Quick()).SlotId, Is.EqualTo("char_01/quick_0"), "the oldest of the same second is overwritten");
        }

        [Test]
        public void DamagedQuickSaveWithoutBackup_IsSkippedByTheNextQuickLoad()
        {
            _early.Value = 1;
            _manager.Save(SaveRequest.Quick());
            _env.Advance(5);
            _early.Value = 2;
            _manager.Save(SaveRequest.Quick());
            string path = SaveTestEnvironment.SlotFile("quick_1", ".sav");
            byte[] bytes = _env.Files.Get(path);
            bytes[bytes.Length / 2] = (byte)'#';
            _env.Files.Put(path, bytes);

            LoadResult first = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter().GetResult();
            LoadResult second = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter().GetResult();

            Assert.That(first.SlotId, Is.EqualTo("char_01/quick_1"));
            Assert.That(first.ReasonKey, Is.EqualTo(SaveReasonKeys.Corrupt));
            Assert.That(second.Success, Is.True, second.ToString());
            Assert.That(second.SlotId, Is.EqualTo("char_01/quick_0"), "the newest valid quick save (GDD 05 5.1)");
            Assert.That(_early.Value, Is.EqualTo(1));
            SaveSlotInfo damaged = _manager.ListSlots(null).Single(slot => slot.SlotName == "quick_1");
            Assert.That(damaged.IsDamaged, Is.True, "listed with the warning (GDD 05 5.6)");
            Assert.That(damaged.HasSave, Is.False);
            Assert.That(_env.Files.Paths.Any(p => p.Contains("/Beschaedigt/quick_1_")), Is.True);
        }

        [Test]
        public void SlotDeletedOutsideTheGame_QuickLoadRecoversAtTheNextPress()
        {
            _early.Value = 1;
            _manager.Save(SaveRequest.Quick());
            _env.Advance(5);
            _early.Value = 2;
            _manager.Save(SaveRequest.Quick());
            _env.Files.Delete(SaveTestEnvironment.SlotFile("quick_1", ".sav"));
            _env.Files.Delete(SaveTestEnvironment.SlotFile("quick_1", ".head.json"));

            LoadResult first = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter().GetResult();
            LoadResult second = _manager.QuickLoadAsync(CancellationToken.None).GetAwaiter().GetResult();

            Assert.That(first.ReasonKey, Is.EqualTo(SaveReasonKeys.NotFound));
            Assert.That(second.Success, Is.True, second.ToString());
            Assert.That(second.SlotId, Is.EqualTo("char_01/quick_0"));
        }

        [Test]
        public void SavingAndQuickLoading_ReadNoHeaderFiles_AfterTheFirstUse()
        {
            _manager.PostInitialize();
            for (int i = 0; i < 3; i++)
            {
                _env.Advance(60);
                _manager.Save(SaveRequest.Quick());
            }

            _env.Files.ReadLog.Clear();
            _env.Advance(60);
            SaveResult saved = _manager.Save(SaveRequest.Quick());
            bool found = _manager.TryGetLatestSlot(SaveKind.Quick, out SaveSlotInfo latest);
            _env.Advance(60);
            _manager.Save(SaveRequest.Auto());

            Assert.That(saved.SlotId, Is.EqualTo("char_01/quick_0"), "rotation from the slot list kept in memory");
            Assert.That(found, Is.True);
            Assert.That(latest.SlotName, Is.EqualTo("quick_0"));
            Assert.That(latest.HasBackup, Is.True, "the overwritten version became the backup");
            Assert.That(_env.Files.ReadLog.Where(p => !p.EndsWith(SaveFormat.TempSuffix, StringComparison.Ordinal)), Is.Empty,
                "only the check of the written temp files reads (architecture 9.3: no header files on the main thread)");
            Assert.That(_manager.ListSlots(null).Select(slot => slot.SlotName), Is.EqualTo(new[] { "auto_0", "quick_0", "quick_2", "quick_1" }));
        }

        [Test]
        public void Tick_WhileTheGameStateLocksSaving_DoesNotAllocate()
        {
            _env.StateService.Push(GameState.Dialogue, "test");
            for (int i = 0; i < 50; i++)
            {
                _manager.Tick(0.016f);
            }

            long probeBefore = GC.GetAllocatedBytesForCurrentThread();
            var probe = new object[8];
            long probeAfter = GC.GetAllocatedBytesForCurrentThread();
            GC.KeepAlive(probe);
            if (probeAfter == probeBefore)
            {
                Assert.Inconclusive("GC.GetAllocatedBytesForCurrentThread does not count allocations on this runtime.");
            }

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 1000; i++)
            {
                _manager.Tick(0.016f);
            }

            long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
            Assert.That(allocated, Is.EqualTo(0), "architecture 13.2: no allocation per frame");
            Assert.That(_manager.IsSaveAllowed(out string reason), Is.False);
            Assert.That(reason, Is.EqualTo("save.blocked.state.dialogue"));
        }

        private string SlotText(string fileName)
        {
            return Encoding.UTF8.GetString(_env.Files.Get(SaveTestEnvironment.SlotFile(fileName, string.Empty)));
        }

        private static string SectionText(string json, string key)
        {
            // Indented JSON: a section starts with '    "key": {' and ends with the next line '    }'.
            int start = json.IndexOf("\"" + key + "\": {", StringComparison.Ordinal);
            Assert.That(start, Is.GreaterThanOrEqualTo(0), "section '" + key + "' missing");
            int end = json.IndexOf("\n    }", start, StringComparison.Ordinal);
            return json.Substring(start, end + 6 - start);
        }

        private sealed class PlaytimeContributor : ISaveHeaderContributor
        {
            private readonly double _seconds;

            public PlaytimeContributor(double seconds)
            {
                _seconds = seconds;
            }

            public void Contribute(SaveHeader header)
            {
                header.PlaytimeSeconds = _seconds;
            }
        }

        private sealed class InvalidSaveable : ISaveable
        {
            public string SaveKey => "invalid";

            public int LoadOrder => 0;

            public Type DataType => typeof(Dictionary<string, object>);

            public object Save()
            {
                return null;
            }

            public void Load(object data, in LoadContext ctx)
            {
            }
        }
    }
}
