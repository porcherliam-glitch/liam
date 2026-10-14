using System;
using System.Collections.Generic;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Screens;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>Game flow for tests of <see cref="UiStateDirector"/>: records the calls, changes no game state.</summary>
    public sealed class FakeGameFlow : IGameFlow
    {
        /// <inheritdoc />
        public bool IsBusy { get; set; }

        /// <inheritdoc />
        public bool IsFlowRunning { get; set; }

        /// <summary>The newest save, or null for none.</summary>
        public SaveSlotInfo Latest { get; set; }

        /// <summary>Slot ids passed to <see cref="LoadSlot"/>.</summary>
        public List<string> LoadedSlots { get; } = new List<string>();

        /// <summary>Number of <see cref="RespawnAtSpawnPoint"/> calls.</summary>
        public int Respawns { get; private set; }

        /// <inheritdoc />
        public event Action<string> Failed
        {
            add { }
            remove { }
        }

        /// <inheritdoc />
        public bool TryGetLatestSave(out SaveSlotInfo slot)
        {
            slot = Latest;
            return slot != null;
        }

        /// <inheritdoc />
        public IReadOnlyList<SaveSlotInfo> ListSaves()
        {
            return Latest != null ? new[] { Latest } : Array.Empty<SaveSlotInfo>();
        }

        /// <inheritdoc />
        public void StartNewGame()
        {
        }

        /// <inheritdoc />
        public void ContinueLatest()
        {
        }

        /// <inheritdoc />
        public void LoadSlot(string slotId)
        {
            LoadedSlots.Add(slotId);
        }

        /// <inheritdoc />
        public void QuickSave(Action<SaveResult> completed)
        {
        }

        /// <inheritdoc />
        public void ReturnToMainMenu()
        {
        }

        /// <inheritdoc />
        public void RespawnAtSpawnPoint()
        {
            Respawns++;
        }

        /// <inheritdoc />
        public void QuitGame()
        {
        }
    }
}
