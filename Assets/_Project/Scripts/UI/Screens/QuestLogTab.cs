namespace Aetherfall.UI.Screens
{
    /// <summary>The 7 tabs of the quest log in display order (GDD 05 1.3, category mapping GDD 02 7.1).</summary>
    public enum QuestLogTab
    {
        /// <summary>"Haupt": main quests.</summary>
        Main = 0,

        /// <summary>"Fraktion": faction quests.</summary>
        Faction = 1,

        /// <summary>"Region": region quests and chain continuations.</summary>
        Region = 2,

        /// <summary>"Neben": side, treasure, dungeon, crafting, puzzle and legendary quests.</summary>
        Side = 3,

        /// <summary>"Begleiter": companion quests.</summary>
        Companion = 4,

        /// <summary>"Auftraege": bounties, procedural, daily and weekly tasks, world events.</summary>
        Contracts = 5,

        /// <summary>"Abgeschlossen": all completed and failed quests with their decisions.</summary>
        Completed = 6
    }
}
