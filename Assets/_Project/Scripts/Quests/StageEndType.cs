namespace Aetherfall.Quests
{
    /// <summary>
    /// End stage type (GDD 02, 4.2 proposal "Endstage-Typ"): finishing such a stage ends the quest. Values are stored in
    /// assets: never renumber.
    /// </summary>
    public enum StageEndType
    {
        /// <summary>Normal stage (German "keiner").</summary>
        None = 0,

        /// <summary>The quest succeeds (German "Erfolg").</summary>
        Success = 1,

        /// <summary>The quest fails (German "Misserfolg").</summary>
        Failure = 2
    }
}
