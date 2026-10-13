using UnityEngine.Scripting;

namespace Aetherfall.Inventory
{
    /// <summary>Save form of an affix roll (GDD 04 4.9: <c>{ "id": "affix.lodernd", "tier": 3, "value": 11 }</c>).</summary>
    [Preserve]
    public sealed class AffixRollDto
    {
        /// <summary>Affix id.</summary>
        public string Id;

        /// <summary>Tier 1–6.</summary>
        public int Tier;

        /// <summary>Value in display units.</summary>
        public float Value;
    }
}
