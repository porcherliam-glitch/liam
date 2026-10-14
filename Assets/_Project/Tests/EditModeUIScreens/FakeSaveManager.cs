using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// <see cref="ISaveManager"/> test double that switches the game state like the real save manager (Loading → Playing)
    /// and returns configurable results synchronously.
    /// </summary>
    public sealed class FakeSaveManager : ISaveManager
    {
        private readonly IGameStateService _gameState;
        private readonly IEventBus _bus;
        private readonly List<SaveSlotInfo> _slots = new List<SaveSlotInfo>();

        /// <summary>Creates the fake.</summary>
        /// <param name="gameState">Game state service.</param>
        /// <param name="bus">Bus for GameLoaded.</param>
        public FakeSaveManager(IGameStateService gameState, IEventBus bus)
        {
            _gameState = gameState;
            _bus = bus;
        }

        /// <summary>True: loads fail before the state changes (unreadable file).</summary>
        public bool FailLoads { get; set; }

        /// <summary>Slot ids passed to LoadAsync.</summary>
        public List<string> Loaded { get; } = new List<string>();

        /// <summary>Number of new games.</summary>
        public int NewGames { get; private set; }

        /// <summary>Number of saves.</summary>
        public int Saves { get; private set; }

        /// <inheritdoc />
        public string CharacterId => "char_01";

        /// <inheritdoc />
        public string SaveDirectory => "saves/char_01";

        /// <inheritdoc />
        /// <remarks>Set by tests to simulate a save that is being written (autosave, F5).</remarks>
        public bool IsBusy { get; set; }

        /// <inheritdoc />
        public SaveResult LastSaveResult { get; private set; }

        /// <inheritdoc />
        public LoadResult LastLoadResult { get; private set; }

        /// <summary>Adds a slot to the list.</summary>
        /// <param name="slotName">Slot name, e.g. quick_0.</param>
        public void AddSlot(string slotName)
        {
            var header = new SaveHeader { Kind = "quick", CreatedUtc = "2026-10-13T10:00:00Z", PlaytimeSeconds = 600, SaveSequence = _slots.Count + 1 };
            _slots.Insert(0, new SaveSlotInfo(CharacterId, slotName, header, false));
        }

        /// <inheritdoc />
        public void Register(ISaveable saveable)
        {
        }

        /// <inheritdoc />
        public void Unregister(ISaveable saveable)
        {
        }

        /// <inheritdoc />
        public void RegisterHeaderContributor(ISaveHeaderContributor contributor)
        {
        }

        /// <inheritdoc />
        public void UnregisterHeaderContributor(ISaveHeaderContributor contributor)
        {
        }

        /// <inheritdoc />
        public Awaitable<SaveResult> SaveAsync(SaveRequest request, CancellationToken ct)
        {
            Saves++;
            LastSaveResult = new SaveResult(true, CharacterId + "/quick_0", request.Kind, string.Empty, string.Empty, DateTime.UtcNow);
            return Completed(LastSaveResult);
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> LoadAsync(string slotId, CancellationToken ct)
        {
            Loaded.Add(slotId);
            if (FailLoads)
            {
                LastLoadResult = new LoadResult(false, slotId, 0, false, SaveReasonKeys.Corrupt, "broken", DateTime.UtcNow);
                return Completed(LastLoadResult);
            }

            return Completed(Apply(slotId));
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> NewGameAsync(NewGameSettings settings, CancellationToken ct)
        {
            NewGames++;
            return Completed(Apply(string.Empty));
        }

        /// <inheritdoc />
        public IReadOnlyList<SaveSlotInfo> ListSlots(string characterId)
        {
            return _slots;
        }

        /// <inheritdoc />
        public bool TryGetLatestSlot(SaveKind? kind, out SaveSlotInfo slot)
        {
            slot = _slots.Count > 0 ? _slots[0] : null;
            return slot != null;
        }

        /// <inheritdoc />
        public bool IsSaveAllowed(out string reasonKey)
        {
            reasonKey = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public void AddBlocker(string blockerId, string reasonKey)
        {
        }

        /// <inheritdoc />
        public void RemoveBlocker(string blockerId)
        {
        }

        private LoadResult Apply(string slotId)
        {
            if (_gameState.Current != GameState.Loading)
            {
                _gameState.SwitchBase(GameState.Loading, "Fake load");
            }

            var loaded = new GameLoaded(slotId, 1);
            _bus.Publish(in loaded);
            _gameState.SwitchBase(GameState.Playing, "Fake load");
            LastLoadResult = new LoadResult(true, slotId, 1, false, string.Empty, string.Empty, DateTime.UtcNow);
            return LastLoadResult;
        }

        private static Awaitable<T> Completed<T>(T value)
        {
            var source = new AwaitableCompletionSource<T>();
            source.SetResult(value);
            return source.Awaitable;
        }
    }
}
