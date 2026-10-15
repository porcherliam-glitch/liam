using System.ComponentModel;
using Newtonsoft.Json;
using UnityEngine.Scripting;

namespace Aetherfall.Player
{
    /// <summary>
    /// Save section <c>stats.player</c> (architecture 9.2, load order 45): current health, stamina and mana. Maximum values
    /// and modifiers are not saved; they follow from attributes, level and equipment (architecture 11.5). Timed effects
    /// with remaining time follow with the status effects.
    /// </summary>
    [Preserve]
    public sealed class PlayerResourcesDto
    {
        /// <summary>Current health.</summary>
        public float Health;

        /// <summary>Current stamina.</summary>
        public float Stamina;

        /// <summary>Current mana.</summary>
        public float Mana;

        /// <summary>
        /// Aether corruption bar 0–100 (GDD 01 A3); missing in old saves = 0. Only written when above 0, so saves without
        /// corruption keep their exact format (golden saves, architecture 9.9).
        /// </summary>
        [DefaultValue(0f)]
        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public float Corruption;
    }
}
