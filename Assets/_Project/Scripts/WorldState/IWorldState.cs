namespace Aetherfall.WorldState
{
    /// <summary>
    /// The world state (architecture 8, §6.5): one central store of flags and numbers that every system may read and write,
    /// e.g. <c>flag.eichental.dorf_zerstoert = 1</c> or <c>stat.global.banditen_getoetet = 37</c>. Values are <c>int</c>
    /// (bools as 0/1); unchanged entries cost nothing (sparse storage of non-default values). Every real change sends
    /// <c>FlagChanged</c>. Saved completely (section <c>worldstate</c>). Registered by <see cref="WorldStateInstaller"/>.
    /// </summary>
    /// <remarks>
    /// Ids should be defined by <see cref="FlagDefinition"/> assets (typo protection, architecture 8.2). Writing an undefined
    /// id works but logs a warning once per id. Code that needs a fixed flag holds the id in a serialized field with
    /// <c>[IdRef("flag.")]</c>, never as a string literal. Main thread only.
    /// </remarks>
    public interface IWorldState
    {
        /// <summary>Counter that grows with every change (cheap "did anything change" check for views).</summary>
        int Revision { get; }

        /// <summary>True if the value is not 0.</summary>
        /// <param name="flagId">Flag id.</param>
        bool GetBool(string flagId);

        /// <summary>Current value (the start value of the definition if never written, 0 for unknown ids).</summary>
        /// <param name="flagId">Flag id.</param>
        int GetInt(string flagId);

        /// <summary>Sets a bool flag (stored as 0/1).</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="value">New value.</param>
        /// <param name="sourceId">Writer for the write log: quest id, dialogue id, <c>console</c>.</param>
        void SetBool(string flagId, bool value, string sourceId);

        /// <summary>Sets a value; clamped to the range of the definition (architecture 8.3).</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="value">New value.</param>
        /// <param name="sourceId">Writer.</param>
        void SetInt(string flagId, int value, string sourceId);

        /// <summary>Adds to a value (counters); returns the new, clamped value.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="delta">Change.</param>
        /// <param name="sourceId">Writer.</param>
        int Add(string flagId, int delta, string sourceId);

        /// <summary>Active playtime in seconds of the last change (0 if never changed in this game).</summary>
        /// <param name="flagId">Flag id.</param>
        double LastChangedPlaytime(string flagId);

        /// <summary>
        /// Active playtime in seconds since the last change (since the game start if never changed). Basis of the condition
        /// <c>FlagAge</c> for delayed consequences (GDD 02, 6.3).
        /// </summary>
        /// <param name="flagId">Flag id.</param>
        double SecondsSinceChange(string flagId);

        /// <summary>True if a <see cref="FlagDefinition"/> exists for the id.</summary>
        /// <param name="flagId">Flag id.</param>
        bool IsDefined(string flagId);

        /// <summary>Finds the definition of a flag.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="spec">Spec or null.</param>
        bool TryGetDefinition(string flagId, out FlagSpec spec);

        /// <summary>
        /// Sets every stored entry whose id starts with the prefix back to its start value (sends <c>FlagChanged</c> each).
        /// Used for the quest-local helper flags <c>&lt;quest-id&gt;.lokal.*</c> at the end of a quest (GDD 02, 2.3).
        /// </summary>
        /// <param name="prefix">Id prefix (not empty).</param>
        /// <param name="sourceId">Writer.</param>
        /// <returns>Number of reset entries.</returns>
        int ResetPrefix(string prefix, string sourceId);
    }
}
