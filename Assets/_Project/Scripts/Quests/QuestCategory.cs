namespace Aetherfall.Quests
{
    /// <summary>
    /// Category of a quest (GDD 02, 2.2): decides the journal tab, the giver symbol, the reward band and the budget. Exactly
    /// one per quest; traits like "versteckt" are <see cref="QuestTraits"/>. Values are stored in assets: never renumber.
    /// </summary>
    public enum QuestCategory
    {
        /// <summary>Main quest (<c>main</c>).</summary>
        Main = 0,

        /// <summary>Faction quest (<c>faction</c>).</summary>
        Faction = 1,

        /// <summary>Region quest (<c>region</c>).</summary>
        Region = 2,

        /// <summary>Side quest (<c>side</c>).</summary>
        Side = 3,

        /// <summary>Companion quest (<c>companion</c>).</summary>
        Companion = 4,

        /// <summary>Hand-made bounty (<c>bounty</c>).</summary>
        Bounty = 5,

        /// <summary>Treasure hunt (<c>treasure</c>).</summary>
        Treasure = 6,

        /// <summary>Dungeon quest (<c>dungeon</c>).</summary>
        Dungeon = 7,

        /// <summary>Crafting quest (<c>craft</c>).</summary>
        Craft = 8,

        /// <summary>Puzzle quest (<c>puzzle</c>).</summary>
        Puzzle = 9,

        /// <summary>Legendary quest (<c>legendary</c>).</summary>
        Legendary = 10,

        /// <summary>Daily task (<c>daily</c>, systemic).</summary>
        Daily = 11,

        /// <summary>Weekly task (<c>weekly</c>, systemic).</summary>
        Weekly = 12,

        /// <summary>Procedural task (<c>proc</c>, systemic).</summary>
        Procedural = 13,

        /// <summary>World event quest (<c>event</c>, systemic).</summary>
        WorldEvent = 14
    }
}
