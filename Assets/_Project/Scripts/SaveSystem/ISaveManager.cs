using System.Collections.Generic;
using System.Threading;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// The save system (architecture 4.7 and 9): registry of all <see cref="ISaveable"/>s, saving and loading of slots,
    /// save locks, autosave, migration. Knows no other system.
    /// </summary>
    /// <remarks>
    /// Saveables register in their installer, in <c>PostInitialize</c> or (scene objects) in <c>Start</c>, and unregister
    /// when they go away. All members are main thread only; serialization and file access of the async methods run on a
    /// background thread.
    /// </remarks>
    public interface ISaveManager
    {
        /// <summary>Current character folder (until character creation: <c>char_01</c>).</summary>
        string CharacterId { get; }

        /// <summary>Folder of the current character's saves (for "Speicherordner oeffnen", GDD 05 5.6).</summary>
        string SaveDirectory { get; }

        /// <summary>True while a save or load runs.</summary>
        bool IsBusy { get; }

        /// <summary>Result of the last save attempt (also refused ones); <see cref="SaveResult.HasValue"/> is false before the first.</summary>
        SaveResult LastSaveResult { get; }

        /// <summary>Result of the last load attempt; <see cref="LoadResult.HasValue"/> is false before the first.</summary>
        LoadResult LastLoadResult { get; }

        /// <summary>Registers a saveable. Its <see cref="ISaveable.SaveKey"/> must be unique and its DTO type valid.</summary>
        /// <param name="saveable">Saveable.</param>
        /// <exception cref="System.ArgumentException">Key empty, DTO type invalid (see <see cref="SaveDtoValidator"/>).</exception>
        /// <exception cref="System.InvalidOperationException">Another saveable already uses the key.</exception>
        void Register(ISaveable saveable);

        /// <summary>Removes a saveable (scene object destroyed, session ended).</summary>
        /// <param name="saveable">Saveable.</param>
        void Unregister(ISaveable saveable);

        /// <summary>Registers a contributor to the save header (architecture 9.3).</summary>
        /// <param name="contributor">Contributor.</param>
        void RegisterHeaderContributor(ISaveHeaderContributor contributor);

        /// <summary>Removes a header contributor.</summary>
        /// <param name="contributor">Contributor.</param>
        void UnregisterHeaderContributor(ISaveHeaderContributor contributor);

        /// <summary>
        /// Saves: snapshot on the main thread, then JSON, compression and atomic write in the background. Never throws for
        /// save errors; check <see cref="SaveResult.Success"/>. Refused if <see cref="IsSaveAllowed"/> is false.
        /// </summary>
        /// <param name="request">Kind and slot.</param>
        /// <param name="ct">Cancels before the file is replaced.</param>
        Awaitable<SaveResult> SaveAsync(SaveRequest request, CancellationToken ct);

        /// <summary>
        /// Loads a slot: read, verify (checksum, backup on damage), migrate and deserialize in the background, then
        /// game state Loading, <see cref="ISaveable.Load"/> in load order, <see cref="IPostLoad.OnAfterLoad"/>,
        /// event <see cref="GameLoaded"/>, game state Playing. Nothing changes if the file cannot be read.
        /// </summary>
        /// <param name="slotId">Slot id, e.g. <c>char_01/quick_0</c>.</param>
        /// <param name="ct">Cancels before the state is applied.</param>
        Awaitable<LoadResult> LoadAsync(string slotId, CancellationToken ct);

        /// <summary>Starts a new game: every saveable receives null (defaults), then <see cref="IPostLoad.OnAfterLoad"/>.</summary>
        /// <param name="settings">New game settings.</param>
        /// <param name="ct">Cancellation (checked before applying).</param>
        Awaitable<LoadResult> NewGameAsync(NewGameSettings settings, CancellationToken ct);

        /// <summary>Lists the slots of a character (reads only the header files), newest first.</summary>
        /// <param name="characterId">Character folder; null = current character.</param>
        IReadOnlyList<SaveSlotInfo> ListSlots(string characterId);

        /// <summary>Finds the newest readable slot of the current character.</summary>
        /// <param name="kind">Only this kind, or null for any kind ("Fortsetzen", GDD 05 5.1).</param>
        /// <param name="slot">Newest slot or null.</param>
        /// <returns>True if one exists.</returns>
        bool TryGetLatestSlot(SaveKind? kind, out SaveSlotInfo slot);

        /// <summary>
        /// True if saving is allowed now (architecture 9.8): no save/load running, game state allows it (table 4.4) and no
        /// blocker is active.
        /// </summary>
        /// <param name="reasonKey">Localization key of the first reason against saving, or empty.</param>
        bool IsSaveAllowed(out string reasonKey);

        /// <summary>Adds (or updates) a save lock, e.g. Player while falling, World in a boss arena.</summary>
        /// <param name="blockerId">Id of the lock (unique per owner).</param>
        /// <param name="reasonKey">Localization key of the reason shown to the player.</param>
        void AddBlocker(string blockerId, string reasonKey);

        /// <summary>Removes a save lock.</summary>
        /// <param name="blockerId">Id passed to <see cref="AddBlocker"/>.</param>
        void RemoveBlocker(string blockerId);
    }
}
