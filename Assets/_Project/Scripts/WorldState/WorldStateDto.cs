using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Save section <c>worldstate</c> (architecture 9.2, load order 20): only entries that differ from their start value,
    /// sorted by id, including entries without definition (kept, architecture 8.3).
    /// </summary>
    /// <remarks>
    /// Format note: architecture 9.3 sketches the entries as arrays <c>[id, wert, changedAtPlaytime]</c>. The save system
    /// only allows typed DTO classes (no <c>object</c>, <see cref="Aetherfall.SaveSystem.SaveDtoValidator"/>), so each entry is
    /// an object <c>{ "id", "value", "changedAt" }</c> with the same content.
    /// </remarks>
    [Preserve]
    public sealed class WorldStateDto
    {
        /// <summary>Stored entries.</summary>
        public List<FlagEntryDto> Flags = new List<FlagEntryDto>();
    }
}
