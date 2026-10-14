using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// <see cref="ISaveManager"/> that only records save blockers (save lock of time-critical stages, GDD 05 5.2) and
    /// registered saveables. Saving and loading are not supported here; quest save tests call the saveables directly.
    /// </summary>
    public sealed class FakeSaveLocks : ISaveManager
    {
        private readonly Dictionary<string, string> _blockers = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly List<ISaveable> _saveables = new List<ISaveable>();

        /// <summary>Active blockers: id → reason key.</summary>
        public IReadOnlyDictionary<string, string> Blockers => _blockers;

        /// <summary>Registered saveables.</summary>
        public IReadOnlyList<ISaveable> Saveables => _saveables;

        /// <inheritdoc />
        public string CharacterId => "char_test";

        /// <inheritdoc />
        public string SaveDirectory => string.Empty;

        /// <inheritdoc />
        public bool IsBusy => false;

        /// <inheritdoc />
        public SaveResult LastSaveResult => default;

        /// <inheritdoc />
        public LoadResult LastLoadResult => default;

        /// <inheritdoc />
        public void Register(ISaveable saveable)
        {
            _saveables.Add(saveable);
        }

        /// <inheritdoc />
        public void Unregister(ISaveable saveable)
        {
            _saveables.Remove(saveable);
        }

        /// <inheritdoc />
        public void CarryOver(ISaveable saveable)
        {
            Unregister(saveable);
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
            throw new NotSupportedException("FakeSaveLocks does not save.");
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> LoadAsync(string slotId, CancellationToken ct)
        {
            throw new NotSupportedException("FakeSaveLocks does not load.");
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> NewGameAsync(NewGameSettings settings, CancellationToken ct)
        {
            throw new NotSupportedException("FakeSaveLocks does not start games.");
        }

        /// <inheritdoc />
        public IReadOnlyList<SaveSlotInfo> ListSlots(string characterId)
        {
            return Array.Empty<SaveSlotInfo>();
        }

        /// <inheritdoc />
        public bool TryGetLatestSlot(SaveKind? kind, out SaveSlotInfo slot)
        {
            slot = null;
            return false;
        }

        /// <inheritdoc />
        public bool IsSaveAllowed(out string reasonKey)
        {
            foreach (string reason in _blockers.Values)
            {
                reasonKey = reason;
                return false;
            }

            reasonKey = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public void AddBlocker(string blockerId, string reasonKey)
        {
            _blockers[blockerId] = reasonKey;
        }

        /// <inheritdoc />
        public void RemoveBlocker(string blockerId)
        {
            _blockers.Remove(blockerId);
        }
    }
}
