using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// The save manager (architecture 4.7, 9): registry of <see cref="ISaveable"/>s and header contributors, saving into
    /// slots with rotation and backups, loading with checksum check, backup fallback and migration, save locks,
    /// autosave interval. Knows no other system; talks to Core (game state, events) only.
    /// </summary>
    /// <remarks>
    /// <para><b>Threads:</b> snapshots (<see cref="ISaveable.Save"/>) and loading (<see cref="ISaveable.Load"/>) run on the main
    /// thread; JSON, compression, checksum and file access of <see cref="SaveAsync"/>/<see cref="LoadAsync"/> run on a
    /// background thread (<see cref="SaveManagerSettings.UseBackgroundThread"/>). Only one save or load runs at a time.</para>
    /// <para><b>Load order of steps:</b> the file is read, verified, migrated and deserialized first; only if that succeeds,
    /// the game state switches to Loading, the saveables load, <see cref="GameLoaded"/> is sent and the game returns to
    /// Playing. A damaged or too new file therefore changes nothing (GDD 05 5.6).</para>
    /// <para>The synchronous <see cref="Save"/>, <see cref="Load"/> and <see cref="NewGame"/> do the same on the calling thread
    /// (tests, editor tools).</para>
    /// <para><b>Sections without saveable:</b> sections of the loaded save whose system is not registered (yet) are kept as raw
    /// JSON and written unchanged into every following save, so no data is lost. A saveable that registers later (scene
    /// objects in <c>Start</c>, systems of a scene loaded after the save) receives its section at once:
    /// <see cref="ISaveable.Load"/> and <see cref="IPostLoad.OnAfterLoad"/> with the context of that load.</para>
    /// <para><b>Slot list:</b> the slots of the current character are read once (<see cref="PostInitialize"/> or first use)
    /// and kept in memory; every save updates its entry, every load re-reads the loaded slot in the background. Quick
    /// save, autosave and quick load therefore read no header files on the main thread (architecture 9.3, 13.2).
    /// <see cref="ListSlots"/> always reads the files and refreshes the list (files changed by hand while the game runs).</para>
    /// </remarks>
    public sealed class SaveManager : ISaveManager, IPostInitializable, IUnscaledTickable, IDisposable
    {
        /// <summary>Blocker id used while the player is in combat.</summary>
        public const string CombatBlockerId = "save.combat";

        private const string LoadReason = "Load save";

        private readonly IEventBus _eventBus;
        private readonly IGameStateService _gameState;
        private readonly SaveManagerSettings _settings;
        private readonly SaveSlotStorage _storage;
        private readonly SaveDocumentCodec _codec = new SaveDocumentCodec();
        private readonly SaveDocumentCodec _mainThreadCodec = new SaveDocumentCodec();
        private readonly List<KeyValuePair<string, JToken>> _carriedSections = new List<KeyValuePair<string, JToken>>();
        private readonly List<ISaveable> _saveables = new List<ISaveable>();
        private readonly List<ISaveHeaderContributor> _contributors = new List<ISaveHeaderContributor>();
        private readonly SaveBlockerSet _blockers = new SaveBlockerSet();
        private readonly AutosaveScheduler _autosave;
        private LoadContext _carriedContext = LoadContext.NewGame;
        private List<SaveSlotInfo> _knownSlots;
        private string _knownSlotsCharacter;
        private bool _busy;
        private bool _subscribed;
        private bool _disposed;

        /// <summary>Creates the manager.</summary>
        /// <param name="eventBus">Global event bus (GameSaved, GameLoaded, CombatStateChanged).</param>
        /// <param name="gameState">Game state service (save permission, Loading/Playing switch).</param>
        /// <param name="files">File access.</param>
        /// <param name="location">Save root folder.</param>
        /// <param name="settings">Settings; null = defaults.</param>
        /// <exception cref="ArgumentException">Invalid character id or incomplete migration chain.</exception>
        public SaveManager(IEventBus eventBus, IGameStateService gameState, IFileStore files, ISaveLocation location, SaveManagerSettings settings = null)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
            if (files == null)
            {
                throw new ArgumentNullException(nameof(files));
            }

            if (location == null)
            {
                throw new ArgumentNullException(nameof(location));
            }

            _settings = settings ?? new SaveManagerSettings();
            if (!SaveSlotId.IsValidName(_settings.CharacterId))
            {
                throw new ArgumentException("Invalid character id '" + _settings.CharacterId + "' (a-z, 0-9, _ and - only).", nameof(settings));
            }

            string problem = "missing";
            if (_settings.Migrations == null || !_settings.Migrations.Validate(out problem))
            {
                throw new ArgumentException("Save migration chain is invalid: " + problem, nameof(settings));
            }

            _storage = new SaveSlotStorage(files, new SavePaths(location.RootDirectory));
            _autosave = new AutosaveScheduler(_settings.AutosaveIntervalSeconds) { Enabled = _settings.AutosaveEnabled };
        }

        /// <inheritdoc />
        public string CharacterId => _settings.CharacterId;

        /// <inheritdoc />
        public string SaveDirectory => _storage.Paths.CharacterDirectory(CharacterId);

        /// <summary>Folder that contains all character folders.</summary>
        public string RootDirectory => _storage.Paths.Root;

        /// <inheritdoc />
        public bool IsBusy => _busy;

        /// <inheritdoc />
        public SaveResult LastSaveResult { get; private set; }

        /// <inheritdoc />
        public LoadResult LastLoadResult { get; private set; }

        /// <summary>Autosave timing (interval, gap, deferral).</summary>
        public AutosaveScheduler Autosave => _autosave;

        /// <summary>Registered saveables in load order.</summary>
        public IReadOnlyList<ISaveable> Saveables => _saveables;

        /// <summary>The settings in use.</summary>
        public SaveManagerSettings Settings => _settings;

        /// <inheritdoc />
        public void Register(ISaveable saveable)
        {
            if (saveable == null)
            {
                throw new ArgumentNullException(nameof(saveable));
            }

            if (string.IsNullOrEmpty(saveable.SaveKey))
            {
                throw new ArgumentException(saveable.GetType().Name + " has no save key.", nameof(saveable));
            }

            string problem = "none";
            if (saveable.DataType == null || !SaveDtoValidator.Validate(saveable.DataType, out problem))
            {
                throw new ArgumentException("Saveable '" + saveable.SaveKey + "' has an invalid DTO type: " + problem, nameof(saveable));
            }

            int insertAt = _saveables.Count;
            for (int i = 0; i < _saveables.Count; i++)
            {
                ISaveable existing = _saveables[i];
                if (ReferenceEquals(existing, saveable))
                {
                    return;
                }

                if (string.Equals(existing.SaveKey, saveable.SaveKey, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("Save key '" + saveable.SaveKey + "' is already registered by " + existing.GetType().Name + ".");
                }

                if (insertAt == _saveables.Count && existing.LoadOrder > saveable.LoadOrder)
                {
                    insertAt = i;
                }
            }

            _saveables.Insert(insertAt, saveable);
            DeliverCarriedSection(saveable);
        }

        /// <inheritdoc />
        public void Unregister(ISaveable saveable)
        {
            _saveables.Remove(saveable);
        }

        /// <inheritdoc />
        public void CarryOver(ISaveable saveable)
        {
            if (saveable == null || !_saveables.Remove(saveable))
            {
                return;
            }

            JToken json;
            try
            {
                object data = saveable.Save();
                json = _mainThreadCodec.ToSectionJson(data);
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "Saveable '" + saveable.SaveKey + "' could not be carried over; its state is lost.");
                return;
            }

            for (int i = _carriedSections.Count - 1; i >= 0; i--)
            {
                if (string.Equals(_carriedSections[i].Key, saveable.SaveKey, StringComparison.Ordinal))
                {
                    _carriedSections.RemoveAt(i);
                }
            }

            _carriedSections.Add(new KeyValuePair<string, JToken>(saveable.SaveKey, json));
            Log.Info(LogCategory.Save, "Section '" + saveable.SaveKey + "' carried over to the next registration.");
        }

        /// <inheritdoc />
        public void RegisterHeaderContributor(ISaveHeaderContributor contributor)
        {
            if (contributor != null && !_contributors.Contains(contributor))
            {
                _contributors.Add(contributor);
            }
        }

        /// <inheritdoc />
        public void UnregisterHeaderContributor(ISaveHeaderContributor contributor)
        {
            _contributors.Remove(contributor);
        }

        /// <inheritdoc />
        public bool IsSaveAllowed(out string reasonKey)
        {
            if (_busy)
            {
                reasonKey = SaveReasonKeys.Busy;
                return false;
            }

            GameState state = _gameState.Current;
            if (!SavePermissionRules.IsSaveAllowedInState(state))
            {
                reasonKey = SaveReasonKeys.ForState(state);
                return false;
            }

            if (_blockers.TryGetFirstReason(out reasonKey))
            {
                return false;
            }

            reasonKey = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public void AddBlocker(string blockerId, string reasonKey)
        {
            _blockers.Add(blockerId, reasonKey);
        }

        /// <inheritdoc />
        public void RemoveBlocker(string blockerId)
        {
            _blockers.Remove(blockerId);
        }

        /// <inheritdoc />
        /// <remarks>Reads the files (main thread; for menus) and refreshes the slot list kept in memory.</remarks>
        public IReadOnlyList<SaveSlotInfo> ListSlots(string characterId)
        {
            string character = string.IsNullOrEmpty(characterId) ? CharacterId : characterId;
            if (!SaveSlotId.IsValidName(character))
            {
                return new List<SaveSlotInfo>();
            }

            List<SaveSlotInfo> result = ReadSlots(character, _mainThreadCodec);
            if (string.Equals(character, CharacterId, StringComparison.Ordinal))
            {
                _knownSlots = new List<SaveSlotInfo>(result);
                _knownSlotsCharacter = character;
            }

            return result;
        }

        /// <inheritdoc />
        /// <remarks>Uses the slot list kept in memory (no file access after the first use).</remarks>
        public bool TryGetLatestSlot(SaveKind? kind, out SaveSlotInfo slot)
        {
            slot = SaveSlotRotation.FindLatest(KnownSlots(CharacterId), kind);
            return slot != null;
        }

        /// <inheritdoc />
        public async Awaitable<SaveResult> SaveAsync(SaveRequest request, CancellationToken ct)
        {
            if (!TryBeginSave(request, out PreparedSave prepared, out SaveResult refused))
            {
                return refused;
            }

            bool background = _settings.UseBackgroundThread;
            SaveResult result;
            try
            {
                if (background)
                {
                    await Awaitable.BackgroundThreadAsync();
                }

                result = ct.IsCancellationRequested
                    ? Failure(prepared, SaveReasonKeys.Cancelled, "Cancelled before writing.")
                    : Write(prepared);
            }
            catch (Exception exception)
            {
                result = Failure(prepared, SaveReasonKeys.SerializeFailed, exception.GetType().Name + ": " + exception.Message);
            }

            if (background)
            {
                await Awaitable.MainThreadAsync();
            }

            return FinishSave(prepared, result);
        }

        /// <summary>Saves synchronously on the calling (main) thread. Same rules as <see cref="SaveAsync"/>.</summary>
        /// <param name="request">Kind and slot.</param>
        public SaveResult Save(in SaveRequest request)
        {
            if (!TryBeginSave(request, out PreparedSave prepared, out SaveResult refused))
            {
                return refused;
            }

            SaveResult result;
            try
            {
                result = Write(prepared);
            }
            catch (Exception exception)
            {
                result = Failure(prepared, SaveReasonKeys.SerializeFailed, exception.GetType().Name + ": " + exception.Message);
            }

            return FinishSave(prepared, result);
        }

        /// <inheritdoc />
        public async Awaitable<LoadResult> LoadAsync(string slotId, CancellationToken ct)
        {
            if (!TryBeginLoad(slotId, out LoadJob job, out LoadResult refused))
            {
                return refused;
            }

            bool background = _settings.UseBackgroundThread;
            PreparedLoad prepared;
            try
            {
                if (background)
                {
                    await Awaitable.BackgroundThreadAsync();
                }

                prepared = Prepare(job);
                ReadSlotAfterLoad(job);
            }
            catch (Exception exception)
            {
                prepared = PreparedLoad.Failed(SaveReasonKeys.Corrupt, exception.GetType().Name + ": " + exception.Message);
            }

            if (background)
            {
                await Awaitable.MainThreadAsync();
            }

            if (ct.IsCancellationRequested && prepared.Success)
            {
                prepared = PreparedLoad.Failed(SaveReasonKeys.Cancelled, "Cancelled before applying.");
            }

            return FinishLoad(job, prepared);
        }

        /// <summary>Loads synchronously on the calling (main) thread. Same rules as <see cref="LoadAsync"/>.</summary>
        /// <param name="slotId">Slot id.</param>
        public LoadResult Load(string slotId)
        {
            if (!TryBeginLoad(slotId, out LoadJob job, out LoadResult refused))
            {
                return refused;
            }

            PreparedLoad prepared;
            try
            {
                prepared = Prepare(job);
                ReadSlotAfterLoad(job);
            }
            catch (Exception exception)
            {
                prepared = PreparedLoad.Failed(SaveReasonKeys.Corrupt, exception.GetType().Name + ": " + exception.Message);
            }

            return FinishLoad(job, prepared);
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> NewGameAsync(NewGameSettings settings, CancellationToken ct)
        {
            var source = new AwaitableCompletionSource<LoadResult>();
            source.SetResult(ct.IsCancellationRequested
                ? new LoadResult(false, string.Empty, SaveFormat.CurrentVersion, false, SaveReasonKeys.Cancelled, "Cancelled.", Now())
                : NewGame(settings));
            return source.Awaitable;
        }

        /// <summary>Starts a new game synchronously: every saveable receives null.</summary>
        /// <param name="settings">New game settings.</param>
        public LoadResult NewGame(NewGameSettings settings)
        {
            if (_busy)
            {
                return CompleteLoad(new LoadResult(false, string.Empty, SaveFormat.CurrentVersion, false, SaveReasonKeys.Busy, "A save or load is running.", Now()));
            }

            if (!string.IsNullOrEmpty(settings.CharacterId))
            {
                if (!SaveSlotId.IsValidName(settings.CharacterId))
                {
                    return CompleteLoad(new LoadResult(false, string.Empty, SaveFormat.CurrentVersion, false, SaveReasonKeys.InvalidSlot,
                        "Invalid character id '" + settings.CharacterId + "'.", Now()));
                }

                _settings.CharacterId = settings.CharacterId;
            }

            if (_settings.ManageGameState && !SavePermissionRules.CanStartLoad(_gameState.Current))
            {
                return CompleteLoad(new LoadResult(false, string.Empty, SaveFormat.CurrentVersion, false, SaveReasonKeys.LoadState,
                    "Cannot start a new game in state " + _gameState.Current + ".", Now()));
            }

            _busy = true;
            _blockers.Clear();
            LoadResult result = Apply(string.Empty, LoadContext.NewGame, null);
            return CompleteLoad(result);
        }

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (!_subscribed && !_disposed)
            {
                _eventBus.Subscribe<CombatStateChanged>(OnCombatStateChanged);
                _subscribed = true;
            }

            try
            {
                int deleted = _storage.DeleteOrphanedTempFiles();
                if (deleted > 0)
                {
                    Log.Info(LogCategory.Save, "Deleted " + deleted + " orphaned temp file(s) of an interrupted save.");
                }
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                Log.Warning(LogCategory.Save, "Could not clean up temp files in '" + RootDirectory + "': " + exception.Message);
            }

            try
            {
                // Read the slot list once at boot, so saving and quick load need no file access on the main thread later.
                KnownSlots(CharacterId);
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                Log.Warning(LogCategory.Save, "Could not read the slot list of '" + SaveDirectory + "': " + exception.Message);
            }

            Log.Info(LogCategory.Save, "Save folder: " + SaveDirectory + " (" + _saveables.Count + " saveable(s) registered, " +
                                       (_settings.Compress ? "GZip" : "readable JSON") + ").");
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            // IUnscaledTickable: deltaTime is real time, so the interval also counts in paused hub menus (table 4.4).
            if (_disposed || _busy)
            {
                return;
            }

            bool allowed = IsSaveAllowed(out _);
            AutosaveDecision decision = _autosave.Tick(deltaTime, GameStateRules.IsPlaytimeRunning(_gameState.Current), allowed);
            if (decision == AutosaveDecision.SaveNow)
            {
                RunAutosave();
            }
            else if (decision == AutosaveDecision.Discarded)
            {
                Log.Info(LogCategory.Save, "Autosave dropped: saving was locked for more than " + _autosave.DeferLimitSeconds + " s.");
            }
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            if (_subscribed)
            {
                _eventBus.Unsubscribe<CombatStateChanged>(OnCombatStateChanged);
                _subscribed = false;
            }
        }

        private async void RunAutosave()
        {
            // Fire-and-forget entry point of the tick (no caller to await); SaveAsync reports errors in its result.
            try
            {
                SaveResult result = await SaveAsync(SaveRequest.Auto(), CancellationToken.None);
                if (!result.Success)
                {
                    Log.Warning(LogCategory.Save, "Autosave failed: " + result);
                }
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "Autosave failed.");
            }
        }

        private void OnCombatStateChanged(CombatStateChanged evt)
        {
            if (evt.InCombat)
            {
                _blockers.Add(CombatBlockerId, SaveReasonKeys.Combat);
            }
            else
            {
                _blockers.Remove(CombatBlockerId);
            }
        }

        private bool TryBeginSave(in SaveRequest request, out PreparedSave prepared, out SaveResult refused)
        {
            prepared = null;
            if (!IsSaveAllowed(out string reason))
            {
                refused = CompleteSave(new SaveResult(false, string.Empty, request.Kind, reason, "Saving is not allowed right now.", Now()), false);
                return false;
            }

            string characterId = string.IsNullOrEmpty(request.CharacterId) ? CharacterId : request.CharacterId;
            if (!SaveSlotId.IsValidName(characterId))
            {
                refused = CompleteSave(new SaveResult(false, string.Empty, request.Kind, SaveReasonKeys.InvalidSlot,
                    "Invalid character id '" + characterId + "'.", Now()), false);
                return false;
            }

            IReadOnlyList<SaveSlotInfo> existing = KnownSlots(characterId);
            string slotName = SaveSlotRotation.ChooseSlot(request, existing);
            if (slotName == null)
            {
                bool invalidName = request.Kind == SaveKind.Manual && !string.IsNullOrEmpty(request.SlotName);
                refused = CompleteSave(new SaveResult(false, string.Empty, request.Kind, invalidName ? SaveReasonKeys.InvalidSlot : SaveReasonKeys.SlotsFull,
                    invalidName ? "Invalid slot name '" + request.SlotName + "'." : "No free slot.", Now()), false);
                return false;
            }

            string slotId = SaveSlotId.Compose(characterId, slotName);
            DateTime now = Now();
            var header = new SaveHeader
            {
                SaveVersion = _settings.Migrations.CurrentVersion,
                ContentVersion = _settings.ContentVersion,
                GameVersion = _settings.GameVersion ?? string.Empty,
                SlotId = slotId,
                Kind = SaveKindIds.ToId(request.Kind),
                CreatedUtc = now.ToString(SaveFormat.TimestampFormat, CultureInfo.InvariantCulture),
                Compressed = _settings.Compress,
                SaveSequence = SaveSlotRotation.NextSequence(existing)
            };

            for (int i = 0; i < _contributors.Count; i++)
            {
                try
                {
                    _contributors[i].Contribute(header);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Save, exception, "Header contributor " + _contributors[i].GetType().Name + " failed (" + slotId + ").");
                }
            }

            var snapshot = new SaveSnapshot(header);
            for (int i = 0; i < _saveables.Count; i++)
            {
                ISaveable saveable = _saveables[i];
                try
                {
                    object data = saveable.Save();
                    if (data != null && data.GetType() != saveable.DataType)
                    {
                        throw new InvalidOperationException("Save() returned " + data.GetType().Name + " instead of " + saveable.DataType.Name + ".");
                    }

                    snapshot.Add(saveable.SaveKey, data);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Save, exception, "Saveable '" + saveable.SaveKey + "' failed to take its snapshot (" + slotId + ").");
                    refused = CompleteSave(new SaveResult(false, slotId, request.Kind, SaveReasonKeys.CaptureFailed,
                        "Section '" + saveable.SaveKey + "': " + exception.Message, now), true);
                    return false;
                }
            }

            // Sections of the loaded save whose system is not registered: keep them unchanged (no silent data loss).
            for (int i = 0; i < _carriedSections.Count; i++)
            {
                if (!IsRegistered(_carriedSections[i].Key))
                {
                    snapshot.AddRaw(_carriedSections[i].Key, _carriedSections[i].Value);
                }
            }

            prepared = new PreparedSave(characterId, slotName, slotId, request.Kind, snapshot);
            _busy = true;
            refused = default;
            return true;
        }

        private SaveResult Write(PreparedSave prepared)
        {
            bool compress = _settings.Compress;
            byte[] saveBytes = _codec.Encode(prepared.Snapshot, compress, !compress);
            SaveHeader header = prepared.Snapshot.Header;
            header.Sha256 = SaveChecksum.Sha256Hex(saveBytes);
            byte[] headBytes = _codec.EncodeHeader(header);
            StorageWriteResult written = _storage.WriteSlot(prepared.CharacterId, prepared.SlotName, saveBytes, headBytes);
            return new SaveResult(written.Success, prepared.SlotId, prepared.Kind, written.Success ? string.Empty : written.ReasonKey, written.Message, Now());
        }

        private SaveResult Failure(PreparedSave prepared, string reasonKey, string message)
        {
            return new SaveResult(false, prepared.SlotId, prepared.Kind, reasonKey, message, Now());
        }

        private SaveResult FinishSave(PreparedSave prepared, SaveResult result)
        {
            _busy = false;
            if (result.Success)
            {
                _autosave.NotifySaved();
                RememberWrittenSlot(prepared);
            }

            return CompleteSave(result, true);
        }

        private SaveResult CompleteSave(SaveResult result, bool attempted)
        {
            LastSaveResult = result;
            if (result.Success)
            {
                Log.Info(LogCategory.Save, result.ToString());
            }
            else if (attempted)
            {
                Log.Error(LogCategory.Save, result.ToString());
            }
            else
            {
                Log.Info(LogCategory.Save, result.ToString());
            }

            if (attempted)
            {
                var evt = new GameSaved(result.SlotId, result.Kind, result.Success);
                _eventBus.Publish(in evt);
            }

            return result;
        }

        private bool TryBeginLoad(string slotId, out LoadJob job, out LoadResult refused)
        {
            job = null;
            if (_busy)
            {
                refused = CompleteLoad(new LoadResult(false, slotId, 0, false, SaveReasonKeys.Busy, "A save or load is running.", Now()));
                return false;
            }

            if (!SaveSlotId.TryParse(slotId, out string characterId, out string slotName))
            {
                refused = CompleteLoad(new LoadResult(false, slotId, 0, false, SaveReasonKeys.InvalidSlot, "Invalid slot id '" + slotId + "'.", Now()));
                return false;
            }

            if (_settings.ManageGameState && !SavePermissionRules.CanStartLoad(_gameState.Current))
            {
                refused = CompleteLoad(new LoadResult(false, slotId, 0, false, SaveReasonKeys.LoadState,
                    "Cannot load in game state " + _gameState.Current + ".", Now()));
                return false;
            }

            if (!_storage.HasSave(characterId, slotName) && !_storage.HasBackup(characterId, slotName))
            {
                // Cheap without a .sav (at most the small header file): drops a slot that vanished from the kept list.
                UpdateKnownSlot(characterId, slotName, ReadSlot(characterId, slotName, _mainThreadCodec));
                refused = CompleteLoad(new LoadResult(false, slotId, 0, false, SaveReasonKeys.NotFound, "No save '" + slotId + "'.", Now()));
                return false;
            }

            var types = new Dictionary<string, Type>(StringComparer.Ordinal);
            for (int i = 0; i < _saveables.Count; i++)
            {
                types[_saveables[i].SaveKey] = _saveables[i].DataType;
            }

            job = new LoadJob(slotId, characterId, slotName, types);
            _busy = true;
            refused = default;
            return true;
        }

        private PreparedLoad Prepare(LoadJob job)
        {
            var notes = new List<string>();
            SaveHeader head = null;
            if (_storage.TryReadHead(job.CharacterId, job.SlotName, out byte[] headBytes))
            {
                try
                {
                    head = _codec.DecodeHeader(headBytes);
                }
                catch (InvalidDataException exception)
                {
                    notes.Add("header file unreadable (" + exception.Message + ")");
                }
            }

            bool fromBackup = false;
            JObject root = null;
            string problem = "main file missing";
            if (_storage.TryReadSave(job.CharacterId, job.SlotName, out byte[] saveBytes))
            {
                root = ParseVerified(saveBytes, head, notes, out problem);
                if (root == null)
                {
                    string stamp = Now().ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
                    string moved = _storage.Quarantine(job.CharacterId, job.SlotName, stamp);
                    notes.Add("damaged main file (" + problem + ")" + (moved != null ? " moved to " + moved : string.Empty));
                }
            }

            if (root == null)
            {
                if (_storage.TryReadBackup(job.CharacterId, job.SlotName, out byte[] backupBytes))
                {
                    try
                    {
                        root = _codec.ParseDocument(backupBytes);
                        fromBackup = true;
                        notes.Add("loaded the backup");
                    }
                    catch (InvalidDataException exception)
                    {
                        problem += "; backup damaged too (" + exception.Message + ")";
                    }
                }

                if (root == null)
                {
                    return PreparedLoad.Failed(SaveReasonKeys.Corrupt, problem + (notes.Count > 0 ? " | " + string.Join("; ", notes) : string.Empty));
                }
            }

            int originalVersion = SaveMigrationChain.ReadVersion(root);
            MigrationOutcome migration = _settings.Migrations.Migrate(root, job.SlotId);
            switch (migration.Status)
            {
                case MigrationStatus.NewerVersion:
                    return PreparedLoad.Failed(SaveReasonKeys.NewerVersion, migration.Message);
                case MigrationStatus.TooOld:
                    return PreparedLoad.Failed(SaveReasonKeys.TooOld, migration.Message);
                case MigrationStatus.Failed:
                    return PreparedLoad.Failed(SaveReasonKeys.MigrationFailed, migration.Message);
                case MigrationStatus.Migrated:
                    notes.Add("migrated v" + migration.FromVersion + " -> v" + migration.ToVersion + " (" + migration.Message + ")");
                    break;
            }

            var unknown = new List<string>();
            SaveSnapshot snapshot;
            try
            {
                snapshot = _codec.ToSnapshot(root, job.SectionTypes, unknown);
            }
            catch (InvalidDataException exception)
            {
                return PreparedLoad.Failed(SaveReasonKeys.Corrupt, exception.Message);
            }

            var carried = new List<KeyValuePair<string, JToken>>(unknown.Count);
            if (unknown.Count > 0)
            {
                JObject sections = root[SaveFormat.SectionsKey] as JObject;
                for (int i = 0; i < unknown.Count; i++)
                {
                    JToken token = sections != null ? sections[unknown[i]] : null;
                    if (token != null)
                    {
                        // Copy without parent, so the rest of the document can be freed.
                        carried.Add(new KeyValuePair<string, JToken>(unknown[i], token.DeepClone()));
                    }
                }

                notes.Add("sections without saveable kept for later: " + string.Join(", ", unknown));
            }

            return PreparedLoad.Succeeded(snapshot, originalVersion, fromBackup, string.Join("; ", notes), carried);
        }

        private JObject ParseVerified(byte[] bytes, SaveHeader head, List<string> notes, out string problem)
        {
            JObject root;
            try
            {
                root = _codec.ParseDocument(bytes);
            }
            catch (InvalidDataException exception)
            {
                problem = exception.Message;
                return null;
            }

            problem = string.Empty;
            if (head == null || string.IsNullOrEmpty(head.Sha256))
            {
                return root;
            }

            if (string.Equals(SaveChecksum.Sha256Hex(bytes), head.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                return root;
            }

            // A crash between writing the .sav and its header file leaves an outdated header: then the creation times differ.
            string fileCreated = root[SaveFormat.HeaderKey] is JObject fileHeader ? (string)fileHeader["createdUtc"] : null;
            if (!string.Equals(fileCreated, head.CreatedUtc, StringComparison.Ordinal))
            {
                notes.Add("header file outdated (checksum of an older save), file accepted");
                return root;
            }

            problem = "checksum mismatch";
            return null;
        }

        private LoadResult FinishLoad(LoadJob job, PreparedLoad prepared)
        {
            if (job.SlotAfterLoadRead)
            {
                UpdateKnownSlot(job.CharacterId, job.SlotName, job.SlotAfterLoad);
            }
            else
            {
                // Unknown state of the slot (read error): read the list again at the next use.
                _knownSlots = null;
            }

            if (!prepared.Success)
            {
                _busy = false;
                return CompleteLoad(new LoadResult(false, job.SlotId, 0, false, prepared.ReasonKey, prepared.Message, Now()));
            }

            var context = new LoadContext(job.SlotId, prepared.OriginalVersion, false, prepared.FromBackup, prepared.Snapshot.Header);
            LoadResult result = Apply(job.SlotId, context, prepared);
            return CompleteLoad(result);
        }

        private LoadResult Apply(string slotId, in LoadContext context, PreparedLoad prepared)
        {
            if (_settings.ManageGameState && _gameState.Current != GameState.Loading && !_gameState.SwitchBase(GameState.Loading, LoadReason))
            {
                _busy = false;
                return new LoadResult(false, slotId, context.SaveVersion, context.LoadedFromBackup, SaveReasonKeys.LoadState,
                    "The game state refused the switch to Loading (" + _gameState.Current + ").", Now());
            }

            _carriedSections.Clear();
            if (prepared != null)
            {
                _carriedSections.AddRange(prepared.CarriedSections);
            }

            _carriedContext = context;
            ISaveable[] targets = _saveables.ToArray();
            var failedSections = new List<string>();
            for (int i = 0; i < targets.Length; i++)
            {
                try
                {
                    object data = null;
                    if (prepared != null && !prepared.Snapshot.TryGet(targets[i].SaveKey, out data))
                    {
                        // Registered while the file was read in the background: its section was kept as raw JSON.
                        TryTakeCarriedSection(targets[i], out data);
                    }

                    targets[i].Load(data, context);
                }
                catch (Exception exception)
                {
                    failedSections.Add(targets[i].SaveKey);
                    Log.Exception(LogCategory.Save, exception, "Saveable '" + targets[i].SaveKey + "' failed to load (" + slotId + ").");
                }
            }

            for (int i = 0; i < targets.Length; i++)
            {
                if (!(targets[i] is IPostLoad postLoad))
                {
                    continue;
                }

                try
                {
                    postLoad.OnAfterLoad(context);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Save, exception, "OnAfterLoad of '" + targets[i].SaveKey + "' failed (" + slotId + ").");
                }
            }

            _autosave.ResetInterval();
            _busy = false;
            var loaded = new GameLoaded(slotId, context.SaveVersion);
            _eventBus.Publish(in loaded);
            if (_settings.ManageGameState && _gameState.Current == GameState.Loading)
            {
                _gameState.SwitchBase(GameState.Playing, LoadReason);
            }

            string message = prepared != null ? prepared.Message : "new game";
            if (failedSections.Count > 0)
            {
                return new LoadResult(false, slotId, context.SaveVersion, context.LoadedFromBackup, SaveReasonKeys.SectionFailed,
                    "Sections failed: " + string.Join(", ", failedSections) + (message.Length > 0 ? " | " + message : string.Empty), Now());
            }

            return new LoadResult(true, slotId, context.SaveVersion, context.LoadedFromBackup, string.Empty, message, Now());
        }

        private LoadResult CompleteLoad(LoadResult result)
        {
            LastLoadResult = result;
            if (result.Success)
            {
                Log.Info(LogCategory.Save, result.ToString());
            }
            else
            {
                Log.Error(LogCategory.Save, result.ToString());
            }

            return result;
        }

        private bool IsRegistered(string saveKey)
        {
            for (int i = 0; i < _saveables.Count; i++)
            {
                if (string.Equals(_saveables[i].SaveKey, saveKey, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        private void DeliverCarriedSection(ISaveable saveable)
        {
            // Late registration (scene object in Start, scene loaded after the save): load the kept section at once.
            LoadContext context = _carriedContext;
            try
            {
                if (!TryTakeCarriedSection(saveable, out object data))
                {
                    return;
                }

                saveable.Load(data, context);
                if (saveable is IPostLoad postLoad)
                {
                    postLoad.OnAfterLoad(context);
                }

                Log.Info(LogCategory.Save, "Section '" + saveable.SaveKey + "' of '" + context.SlotId + "' loaded into the late registered " +
                                           saveable.GetType().Name + ".");
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Save, exception, "Saveable '" + saveable.SaveKey + "' failed to load its kept section (" + context.SlotId + ").");
            }
        }

        private bool TryTakeCarriedSection(ISaveable saveable, out object data)
        {
            data = null;
            for (int i = 0; i < _carriedSections.Count; i++)
            {
                if (!string.Equals(_carriedSections[i].Key, saveable.SaveKey, StringComparison.Ordinal))
                {
                    continue;
                }

                JToken json = _carriedSections[i].Value;
                _carriedSections.RemoveAt(i);
                data = _mainThreadCodec.ToSectionData(saveable.SaveKey, json, saveable.DataType);
                return true;
            }

            return false;
        }

        private IReadOnlyList<SaveSlotInfo> KnownSlots(string characterId)
        {
            if (!string.Equals(characterId, CharacterId, StringComparison.Ordinal))
            {
                return ReadSlots(characterId, _mainThreadCodec);
            }

            if (_knownSlots == null || !string.Equals(_knownSlotsCharacter, characterId, StringComparison.Ordinal))
            {
                _knownSlots = ReadSlots(characterId, _mainThreadCodec);
                _knownSlotsCharacter = characterId;
            }

            return _knownSlots;
        }

        private List<SaveSlotInfo> ReadSlots(string characterId, SaveDocumentCodec codec)
        {
            var result = new List<SaveSlotInfo>();
            IReadOnlyList<string> names = _storage.ListSlotNames(characterId);
            for (int i = 0; i < names.Count; i++)
            {
                result.Add(new SaveSlotInfo(characterId, names[i], ReadHeader(characterId, names[i], codec),
                    _storage.HasBackup(characterId, names[i]), _storage.HasSave(characterId, names[i])));
            }

            result.Sort(NewestFirst);
            return result;
        }

        private SaveSlotInfo ReadSlot(string characterId, string slotName, SaveDocumentCodec codec)
        {
            // Same rule as SaveSlotStorage.ListSlotNames: a slot exists if its header file or its main file exists.
            bool hasSave = _storage.HasSave(characterId, slotName);
            if (!hasSave && !_storage.HasHead(characterId, slotName))
            {
                return null;
            }

            return new SaveSlotInfo(characterId, slotName, ReadHeader(characterId, slotName, codec), _storage.HasBackup(characterId, slotName), hasSave);
        }

        private void ReadSlotAfterLoad(LoadJob job)
        {
            // Runs next to Prepare (background thread): the load may have moved a damaged file to Beschaedigt/.
            try
            {
                job.SlotAfterLoad = ReadSlot(job.CharacterId, job.SlotName, _codec);
                job.SlotAfterLoadRead = true;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                job.SlotAfterLoadRead = false;
            }
        }

        private void RememberWrittenSlot(PreparedSave prepared)
        {
            if (_knownSlots == null || !string.Equals(_knownSlotsCharacter, prepared.CharacterId, StringComparison.Ordinal))
            {
                return;
            }

            int index = IndexOfKnownSlot(prepared.SlotName);
            SaveSlotInfo previous = index >= 0 ? _knownSlots[index] : null;

            // Replacing an existing main file turns it into the backup; an older backup stays when there was none.
            bool hasBackup = previous != null && (previous.HasSave || previous.HasBackup);
            UpdateKnownSlot(prepared.CharacterId, prepared.SlotName,
                new SaveSlotInfo(prepared.CharacterId, prepared.SlotName, prepared.Snapshot.Header, hasBackup, true));
        }

        private void UpdateKnownSlot(string characterId, string slotName, SaveSlotInfo slot)
        {
            if (_knownSlots == null || !string.Equals(_knownSlotsCharacter, characterId, StringComparison.Ordinal))
            {
                return;
            }

            int index = IndexOfKnownSlot(slotName);
            if (slot == null)
            {
                if (index >= 0)
                {
                    _knownSlots.RemoveAt(index);
                }

                return;
            }

            if (index >= 0)
            {
                _knownSlots[index] = slot;
            }
            else
            {
                _knownSlots.Add(slot);
            }

            _knownSlots.Sort(NewestFirst);
        }

        private int IndexOfKnownSlot(string slotName)
        {
            for (int i = 0; i < _knownSlots.Count; i++)
            {
                if (string.Equals(_knownSlots[i].SlotName, slotName, StringComparison.Ordinal))
                {
                    return i;
                }
            }

            return -1;
        }

        private static int NewestFirst(SaveSlotInfo a, SaveSlotInfo b)
        {
            return SaveSlotRotation.CompareCreation(b, a);
        }

        // codec: _codec on the background thread, _mainThreadCodec on the main thread (one operation per codec at a time).
        private SaveHeader ReadHeader(string characterId, string slotName, SaveDocumentCodec codec)
        {
            if (_storage.TryReadHead(characterId, slotName, out byte[] headBytes))
            {
                try
                {
                    return codec.DecodeHeader(headBytes);
                }
                catch (InvalidDataException)
                {
                    return null;
                }
            }

            // No header file (e.g. its write failed): read the header from the save itself.
            if (_storage.TryReadSave(characterId, slotName, out byte[] saveBytes))
            {
                try
                {
                    return codec.ReadHeader(codec.ParseDocument(saveBytes));
                }
                catch (InvalidDataException)
                {
                    return null;
                }
            }

            return null;
        }

        private DateTime Now()
        {
            Func<DateTime> clock = _settings.UtcNow;
            return clock != null ? clock() : DateTime.UtcNow;
        }

        private sealed class PreparedSave
        {
            public PreparedSave(string characterId, string slotName, string slotId, SaveKind kind, SaveSnapshot snapshot)
            {
                CharacterId = characterId;
                SlotName = slotName;
                SlotId = slotId;
                Kind = kind;
                Snapshot = snapshot;
            }

            public string CharacterId { get; }

            public string SlotName { get; }

            public string SlotId { get; }

            public SaveKind Kind { get; }

            public SaveSnapshot Snapshot { get; }
        }

        private sealed class LoadJob
        {
            public LoadJob(string slotId, string characterId, string slotName, Dictionary<string, Type> sectionTypes)
            {
                SlotId = slotId;
                CharacterId = characterId;
                SlotName = slotName;
                SectionTypes = sectionTypes;
            }

            public string SlotId { get; }

            public string CharacterId { get; }

            public string SlotName { get; }

            public Dictionary<string, Type> SectionTypes { get; }

            /// <summary>The slot as found on disk after the load attempt (null = gone).</summary>
            public SaveSlotInfo SlotAfterLoad { get; set; }

            /// <summary>True if <see cref="SlotAfterLoad"/> could be read.</summary>
            public bool SlotAfterLoadRead { get; set; }
        }

        private sealed class PreparedLoad
        {
            private PreparedLoad(bool success, SaveSnapshot snapshot, int originalVersion, bool fromBackup, string reasonKey, string message,
                IReadOnlyList<KeyValuePair<string, JToken>> carriedSections)
            {
                Success = success;
                Snapshot = snapshot;
                OriginalVersion = originalVersion;
                FromBackup = fromBackup;
                ReasonKey = reasonKey;
                Message = message ?? string.Empty;
                CarriedSections = carriedSections ?? Array.Empty<KeyValuePair<string, JToken>>();
            }

            public bool Success { get; }

            public SaveSnapshot Snapshot { get; }

            public int OriginalVersion { get; }

            public bool FromBackup { get; }

            public string ReasonKey { get; }

            public string Message { get; }

            /// <summary>Raw sections without registered saveable (kept for later saves and late registrations).</summary>
            public IReadOnlyList<KeyValuePair<string, JToken>> CarriedSections { get; }

            public static PreparedLoad Succeeded(SaveSnapshot snapshot, int originalVersion, bool fromBackup, string message,
                IReadOnlyList<KeyValuePair<string, JToken>> carriedSections)
            {
                return new PreparedLoad(true, snapshot, originalVersion, fromBackup, string.Empty, message, carriedSections);
            }

            public static PreparedLoad Failed(string reasonKey, string message)
            {
                return new PreparedLoad(false, null, 0, false, reasonKey, message, null);
            }
        }
    }
}
