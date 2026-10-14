using Aetherfall.Stats;

namespace Aetherfall.Progression
{
    /// <summary>The fixed numbers of GDD 03 10.1 and 12.1 for levels and points. Pure constants.</summary>
    public static class ProgressionRules
    {
        /// <summary>Attribute points per level-up (§11.3, GDD 03 12.1).</summary>
        public const int AttributePointsPerLevel = 1;

        /// <summary>Skill points per level-up (§11.3, GDD 03 12.1).</summary>
        public const int SkillPointsPerLevel = 1;

        /// <summary>Hard cap of an attribute (GDD 03 10.1: base value plus distributed points never above 60).</summary>
        public const int AttributeHardCap = 60;

        /// <summary>Stat source of the distributed attribute points (<c>progression:attributes</c>, architecture 11.5).</summary>
        public static readonly string AttributeSourceId = StatSourceIds.Progression("attributes");

        /// <summary>Source id of experience given by the debug tools.</summary>
        public const string DebugSourceId = "debug";
    }
}
