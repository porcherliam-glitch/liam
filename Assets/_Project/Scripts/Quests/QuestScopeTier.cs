namespace Aetherfall.Quests
{
    /// <summary>Scope tier of a quest (GDD 00 / GDD 02 4.1 "Umfangsstufe A / B / C"). Stored in assets: never renumber.</summary>
    public enum QuestScopeTier
    {
        /// <summary>Tier A (vertical slice).</summary>
        A = 0,

        /// <summary>Tier B.</summary>
        B = 1,

        /// <summary>Tier C (full game).</summary>
        C = 2
    }
}
