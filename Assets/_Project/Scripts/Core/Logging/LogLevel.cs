namespace Aetherfall.Core
{
    /// <summary>
    /// Severity of a log message. Higher values are more severe.
    /// Values are serialized by Unity (e.g. in <c>LogSettings</c>) and must never be renumbered.
    /// </summary>
    public enum LogLevel
    {
        /// <summary>Very detailed diagnostic output (stripped from release builds).</summary>
        Trace = 0,

        /// <summary>Diagnostic output for developers (stripped from release builds).</summary>
        Debug = 1,

        /// <summary>Normal operational messages, e.g. boot steps or state changes.</summary>
        Info = 2,

        /// <summary>Something unexpected happened, the game can continue.</summary>
        Warning = 3,

        /// <summary>An operation failed; the game continues in a degraded way.</summary>
        Error = 4,

        /// <summary>The game cannot continue safely (e.g. boot failure).</summary>
        Fatal = 5,

        /// <summary>Used only as a minimum level: suppresses every message.</summary>
        Off = 6
    }
}
