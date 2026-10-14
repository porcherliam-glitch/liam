using System.Collections.Generic;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Query and edit API of the world state for the debug console (architecture 14.2: <c>set_flag</c>, <c>get_flag</c>,
    /// <c>list_flags</c>) and the debug window (architecture 8.4). Implemented by <see cref="WorldStateService"/> next to
    /// <see cref="IWorldState"/>; gameplay code uses <see cref="IWorldState"/> only.
    /// </summary>
    public interface IWorldStateDebug
    {
        /// <summary>Ids that were written or loaded although no definition exists (typos, removed content).</summary>
        IReadOnlyCollection<string> UndefinedFlagIds { get; }

        /// <summary>
        /// All flags whose id starts with the prefix (empty = all): every definition plus undefined stored entries, sorted by
        /// id (<c>list_flags &lt;praefix&gt;</c>).
        /// </summary>
        /// <param name="prefix">Id prefix or empty.</param>
        /// <param name="onlyChanged">True: only entries that differ from their start value.</param>
        List<FlagSnapshot> Query(string prefix, bool onlyChanged);

        /// <summary>One flag (<c>get_flag &lt;id&gt;</c>).</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="snapshot">Snapshot.</param>
        /// <returns>False if the id is neither defined nor stored.</returns>
        bool TryGetSnapshot(string flagId, out FlagSnapshot snapshot);

        /// <summary>
        /// Sets a flag from console text (<c>set_flag &lt;id&gt; &lt;wert&gt;</c>): number, bool word or enum name.
        /// </summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="valueText">Value text.</param>
        /// <param name="sourceId">Writer (usually <c>console</c>).</param>
        /// <param name="message">German result text for the console.</param>
        /// <returns>True if the value was understood and set.</returns>
        bool TrySetFromText(string flagId, string valueText, string sourceId, out string message);

        /// <summary>The last changes (at most 200), oldest first.</summary>
        List<FlagChangeRecord> GetRecentChanges();

        /// <summary>Ids written by a source in this session (write log, for "Quest zuruecksetzen", GDD 02 10.3).</summary>
        /// <param name="sourceId">Writer.</param>
        List<string> GetFlagsWrittenBy(string sourceId);

        /// <summary>Sets one flag back to its start value.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="sourceId">Writer.</param>
        /// <returns>True if the value changed.</returns>
        bool ResetToDefault(string flagId, string sourceId);

        /// <summary>Sets every flag written by a source back to its start value ("Quest zuruecksetzen").</summary>
        /// <param name="writerSourceId">Source whose writes are undone.</param>
        /// <param name="sourceId">Writer of the reset (e.g. <c>debug</c>).</param>
        /// <returns>Number of changed flags.</returns>
        int ResetFlagsWrittenBy(string writerSourceId, string sourceId);
    }
}
