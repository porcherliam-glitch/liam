using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.GruftSave
{
    /// <summary>
    /// Save manager double for the world save bridge: records saves and blockers, refuses saving while blocked (also the combat
    /// lock of the real save manager, <see cref="SetInCombat"/>).
    /// </summary>
    public sealed class FakeWorldSaveManager : ISaveManager
    {
        private readonly Dictionary<string, string> _blockers = new Dictionary<string, string>();

        /// <summary>Registered saveables.</summary>
        public List<ISaveable> Saveables { get; } = new List<ISaveable>();

        /// <summary>Number of started saves.</summary>
        public int Saves { get; private set; }

        /// <summary>Active blockers by id.</summary>
        public IReadOnlyDictionary<string, string> Blockers => _blockers;

        /// <inheritdoc />
        public string CharacterId => "char_01";

        /// <inheritdoc />
        public string SaveDirectory => "saves/char_01";

        /// <inheritdoc />
        public bool IsBusy => false;

        /// <inheritdoc />
        public SaveResult LastSaveResult { get; private set; }

        /// <inheritdoc />
        public LoadResult LastLoadResult { get; private set; }

        /// <inheritdoc />
        public void Register(ISaveable saveable)
        {
            Saveables.Add(saveable);
        }

        /// <inheritdoc />
        public void Unregister(ISaveable saveable)
        {
            Saveables.Remove(saveable);
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
            Saves++;
            LastSaveResult = new SaveResult(true, CharacterId + "/auto_0", request.Kind, string.Empty, string.Empty, DateTime.UtcNow);
            var source = new AwaitableCompletionSource<SaveResult>();
            source.SetResult(LastSaveResult);
            return source.Awaitable;
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> LoadAsync(string slotId, CancellationToken ct)
        {
            throw new NotSupportedException();
        }

        /// <inheritdoc />
        public Awaitable<LoadResult> NewGameAsync(NewGameSettings settings, CancellationToken ct)
        {
            throw new NotSupportedException();
        }

        /// <inheritdoc />
        public IReadOnlyList<SaveSlotInfo> ListSlots(string characterId)
        {
            return new List<SaveSlotInfo>();
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
            foreach (KeyValuePair<string, string> blocker in _blockers)
            {
                reasonKey = blocker.Value;
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

        /// <summary>
        /// Like the real save manager on <c>CombatStateChanged</c>: the combat lock (the player dealt or took damage in the last
        /// 5 s, GDD 05 5.2) blocks saving.
        /// </summary>
        /// <param name="inCombat">True while in combat.</param>
        public void SetInCombat(bool inCombat)
        {
            if (inCombat)
            {
                AddBlocker(SaveManager.CombatBlockerId, SaveReasonKeys.Combat);
            }
            else
            {
                RemoveBlocker(SaveManager.CombatBlockerId);
            }
        }
    }
}
