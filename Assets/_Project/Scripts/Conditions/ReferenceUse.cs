namespace Aetherfall.Conditions
{
    /// <summary>How a condition, action or objective uses a referenced id (for the reader/writer lists of flags, V16).</summary>
    public enum ReferenceUse
    {
        /// <summary>Only mentions the id (NPC, item, location …).</summary>
        Mention = 0,

        /// <summary>Reads the value (conditions on flags).</summary>
        Read = 1,

        /// <summary>Writes the value (actions on flags).</summary>
        Write = 2
    }
}
