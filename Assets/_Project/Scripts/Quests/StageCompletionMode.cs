namespace Aetherfall.Quests
{
    /// <summary>
    /// When a stage is done (GDD 02, 4.2 "Modus: alle / eines", proposal "n von m"). Only required (not optional) objectives
    /// count. Values are stored in assets: never renumber.
    /// </summary>
    public enum StageCompletionMode
    {
        /// <summary>All required objectives (German "alle").</summary>
        All = 0,

        /// <summary>One required objective (German "eines").</summary>
        Any = 1,

        /// <summary>At least n required objectives (German "n von m").</summary>
        AtLeast = 2
    }
}
