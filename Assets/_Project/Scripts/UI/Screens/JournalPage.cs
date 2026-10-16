namespace Aetherfall.UI.Screens
{
    /// <summary>Pages of the journal screen (hub tabs "Questlog", "Charakter" and "Fähigkeiten", GDD 05 1.3); argument of opening it.</summary>
    public enum JournalPage
    {
        /// <summary>Quest log.</summary>
        Quests = 0,

        /// <summary>Character page (level, experience, attributes).</summary>
        Character = 1,

        /// <summary>Skill tree of the class (GDD 03 11; key K).</summary>
        Skills = 2,

        /// <summary>World map (first hub tab, M; S63).</summary>
        Map = 3
    }
}
