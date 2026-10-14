using System.ComponentModel;
using Newtonsoft.Json;
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

        /// <summary>
        /// World space the player was in, e.g. <c>worldspace.eichental.gruft</c> (written by the player location). Read before
        /// loading to open the right scene; empty in saves from before this field (then the default gameplay scene is used).
        /// Only written when set, so saves without a world space keep their exact format (golden saves, architecture 9.9).
        /// </summary>
        [DefaultValue("")]
        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public string WorldSpaceId = string.Empty;
    }
}
