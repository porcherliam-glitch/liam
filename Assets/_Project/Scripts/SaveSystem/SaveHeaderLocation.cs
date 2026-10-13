using UnityEngine.Scripting;

namespace Aetherfall.SaveSystem
{
    /// <summary>Location part of the save header (GDD 05 5.5 preview: "Goldkueste › Velmara").</summary>
    [Preserve]
    public sealed class SaveHeaderLocation
    {
        /// <summary>Region id, e.g. <c>region.goldkueste</c>.</summary>
        public string RegionId = string.Empty;

        /// <summary>Location id, e.g. <c>loc.goldkueste.velmara</c>.</summary>
        public string LocationId = string.Empty;
    }
}
