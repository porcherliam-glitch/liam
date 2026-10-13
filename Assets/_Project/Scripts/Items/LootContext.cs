namespace Aetherfall.Items
{
    /// <summary>
    /// Everything a loot roll needs to know about its source (GDD 04 5.4 step 2, 5.11 "LootContext"): source id and level,
    /// item level delta, loot quality (night already applied), luck, world tier, difficulty and event bonus, extra rolls.
    /// </summary>
    public readonly struct LootContext
    {
        /// <summary>Id of the source (enemy unique id, chest id, quest id); also the <c>SourceId</c> of picked up items.</summary>
        public readonly string SourceId;

        /// <summary>Level of the source (enemy level incl. variant bonus, area level of a chest).</summary>
        public readonly int SourceLevel;

        /// <summary>Δ of the item level (GDD 04 4.1: bosses +1/+2, ornate chest +1, secret chest +2).</summary>
        public readonly int ItemLevelDelta;

        /// <summary>Loot quality 0–6 of the source (GDD 04 5.2), night bonus included.</summary>
        public readonly int LootQuality;

        /// <summary>Luck of the player (stat <c>Luck</c>: 0.5 × E(Cha) + equipment + buffs).</summary>
        public readonly float Luck;

        /// <summary>World tier 0–10.</summary>
        public readonly int WorldTier;

        /// <summary>B_Schwierigkeit: hard +5, nightmare +10 (GDD 03 9.7).</summary>
        public readonly float DifficultyBonus;

        /// <summary>B_Ereignis: freshness bonus +10, rift favour (GDD 04 5.3).</summary>
        public readonly float EventBonus;

        /// <summary>Additional rolls (elite +1, GDD 01 11.2).</summary>
        public readonly int ExtraRolls;

        /// <summary>Creates the context.</summary>
        /// <param name="sourceId">Source id.</param>
        /// <param name="sourceLevel">Source level.</param>
        /// <param name="lootQuality">Loot quality 0–6.</param>
        /// <param name="luck">Luck of the player.</param>
        /// <param name="itemLevelDelta">Item level delta.</param>
        /// <param name="worldTier">World tier.</param>
        /// <param name="difficultyBonus">Difficulty bonus.</param>
        /// <param name="eventBonus">Event bonus.</param>
        /// <param name="extraRolls">Extra rolls.</param>
        public LootContext(string sourceId, int sourceLevel, int lootQuality, float luck, int itemLevelDelta = 0, int worldTier = 0,
            float difficultyBonus = 0f, float eventBonus = 0f, int extraRolls = 0)
        {
            SourceId = sourceId ?? string.Empty;
            SourceLevel = sourceLevel;
            ItemLevelDelta = itemLevelDelta;
            LootQuality = LootQualityRules.Clamp(lootQuality);
            Luck = luck;
            WorldTier = worldTier < 0 ? 0 : worldTier;
            DifficultyBonus = difficultyBonus;
            EventBonus = eventBonus;
            ExtraRolls = extraRolls < 0 ? 0 : extraRolls;
        }

        /// <summary>Copy with another loot quality (table override).</summary>
        /// <param name="lootQuality">Loot quality 0–6.</param>
        public LootContext WithLootQuality(int lootQuality)
        {
            return new LootContext(SourceId, SourceLevel, lootQuality, Luck, ItemLevelDelta, WorldTier, DifficultyBonus, EventBonus, ExtraRolls);
        }
    }
}
