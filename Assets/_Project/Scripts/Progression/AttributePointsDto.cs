using UnityEngine.Scripting;

namespace Aetherfall.Progression
{
    /// <summary>Distributed points of one attribute in the save section <c>progression</c>.</summary>
    [Preserve]
    public sealed class AttributePointsDto
    {
        /// <summary>Attribute as name of <c>Aetherfall.Stats.StatId</c>, e.g. <c>Strength</c> (never the number, architecture 11.5).</summary>
        public string Attribute = string.Empty;

        /// <summary>Distributed points.</summary>
        public int Points;
    }
}
