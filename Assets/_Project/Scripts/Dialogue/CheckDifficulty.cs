namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Difficulty tier of a skill check (GDD 02, 12.3: "In den Daten steht die Stufe, nicht die Zahl"). The threshold of each
    /// tier comes from <see cref="SkillCheckRules.ThresholdOf"/>, so changing the attribute scale moves all checks at once.
    /// Values are stored in assets: never renumber.
    /// </summary>
    public enum CheckDifficulty
    {
        /// <summary>Easy (German "Leicht"), 10: Eichental, farmers, frightened NPCs.</summary>
        Easy = 0,

        /// <summary>Easy+ (German "Leicht+"), 12: Eichental residents with something to lose (Ole, Brenner, Harrik, Alwine).</summary>
        EasyPlus = 1,

        /// <summary>Medium (German "Mittel"), 14: bandit leaders, traders.</summary>
        Medium = 2,

        /// <summary>Medium+ (German "Mittel+"), 16: officials (Dorn).</summary>
        MediumPlus = 3,

        /// <summary>Hard (German "Schwer"), 18: captains, guild masters.</summary>
        Hard = 4,

        /// <summary>Very hard (German "Sehr schwer"), 24: faction leaders, suspicious informants.</summary>
        VeryHard = 5,

        /// <summary>Legendary (German "Legendaer"), 30: story turning points, endgame.</summary>
        Legendary = 6
    }
}
