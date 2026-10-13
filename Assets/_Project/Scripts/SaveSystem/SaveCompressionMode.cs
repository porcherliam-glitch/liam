namespace Aetherfall.SaveSystem
{
    /// <summary>When save files are GZip-compressed (architecture 9.3). Stored in the installer asset: never renumber.</summary>
    public enum SaveCompressionMode
    {
        /// <summary>Editor and development builds: readable JSON; release builds: GZip (recommended default).</summary>
        ReadableInDevelopment = 0,

        /// <summary>Always GZip.</summary>
        Always = 1,

        /// <summary>Never compress (readable everywhere).</summary>
        Never = 2
    }
}
