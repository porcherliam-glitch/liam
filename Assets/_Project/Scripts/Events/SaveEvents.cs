// Global events of the save system (architecture 4.3, events #6 and #7). Several event structs of one area may share a
// file (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A save attempt finished (written or failed while writing). Receivers: UI (save indicator, error message),
    /// telemetry. Saves refused because saving is blocked do not send this event.
    /// </summary>
    public readonly struct GameSaved : IGameEvent
    {
        /// <summary>Slot id, e.g. <c>char_01/quick_0</c>.</summary>
        public readonly string SlotId;

        /// <summary>Kind of save.</summary>
        public readonly SaveKind Kind;

        /// <summary>True if the file was written and verified.</summary>
        public readonly bool Success;

        /// <summary>Creates the event.</summary>
        /// <param name="slotId">Slot id.</param>
        /// <param name="kind">Kind of save.</param>
        /// <param name="success">True if the save succeeded.</param>
        public GameSaved(string slotId, SaveKind kind, bool success)
        {
            SlotId = slotId;
            Kind = kind;
            Success = success;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "GameSaved(" + SlotId + ", " + Kind + ", success=" + Success + ")";
        }
    }

    /// <summary>
    /// A save was loaded and every system has its state (sent after <c>OnAfterLoad</c>, before the game state returns to
    /// Playing). Receivers: UI, all run-time caches.
    /// </summary>
    public readonly struct GameLoaded : IGameEvent
    {
        /// <summary>Slot id of the loaded save.</summary>
        public readonly string SlotId;

        /// <summary>Format version of the file before migration.</summary>
        public readonly int SaveVersion;

        /// <summary>Creates the event.</summary>
        /// <param name="slotId">Slot id.</param>
        /// <param name="saveVersion">Format version of the file.</param>
        public GameLoaded(string slotId, int saveVersion)
        {
            SlotId = slotId;
            SaveVersion = saveVersion;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "GameLoaded(" + SlotId + ", v" + SaveVersion + ")";
        }
    }
}
