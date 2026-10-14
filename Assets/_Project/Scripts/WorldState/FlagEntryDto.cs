using UnityEngine.Scripting;

namespace Aetherfall.WorldState
{
    /// <summary>One saved flag: id, value and playtime of the last change (architecture 9.3 section <c>worldstate</c>).</summary>
    [Preserve]
    public sealed class FlagEntryDto
    {
        /// <summary>Flag id.</summary>
        public string Id = string.Empty;

        /// <summary>Value (bools 0/1).</summary>
        public int Value;

        /// <summary>Active playtime in seconds of the last change.</summary>
        public double ChangedAt;
    }
}
