namespace Aetherfall.Stats
{
    /// <summary>
    /// Builds the source ids of <see cref="StatModifier"/>s (architecture 11.5, GDD §10.3): <c>item:&lt;instanceId&gt;</c>,
    /// <c>effect:&lt;id&gt;</c>, <c>skill:&lt;node id&gt;</c>, <c>buff:&lt;id&gt;</c>. Use these helpers instead of string literals,
    /// so <see cref="StatCollection.RemoveAllFromSource"/> always finds what a source added.
    /// </summary>
    public static class StatSourceIds
    {
        /// <summary>Prefix of equipment sources.</summary>
        public const string ItemPrefix = "item:";

        /// <summary>Prefix of status effect sources.</summary>
        public const string EffectPrefix = "effect:";

        /// <summary>Prefix of skill tree node sources.</summary>
        public const string SkillPrefix = "skill:";

        /// <summary>Prefix of buff sources (potions, food, shrines).</summary>
        public const string BuffPrefix = "buff:";

        /// <summary>Source id of an equipped item instance.</summary>
        /// <param name="instanceId">Item instance id.</param>
        public static string Item(string instanceId)
        {
            return ItemPrefix + instanceId;
        }

        /// <summary>Source id of a status effect.</summary>
        /// <param name="effectId">Effect id, e.g. <c>effect.gift</c>.</param>
        public static string Effect(string effectId)
        {
            return EffectPrefix + effectId;
        }

        /// <summary>Source id of a skill tree node.</summary>
        /// <param name="nodeId">Node id.</param>
        public static string Skill(string nodeId)
        {
            return SkillPrefix + nodeId;
        }

        /// <summary>Source id of a buff.</summary>
        /// <param name="buffId">Buff id.</param>
        public static string Buff(string buffId)
        {
            return BuffPrefix + buffId;
        }
    }
}
