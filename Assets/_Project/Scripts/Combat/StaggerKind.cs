namespace Aetherfall.Combat
{
    /// <summary>Reaction of a combatant to poise damage or a broken guard (GDD 03 4.3, 4.9).</summary>
    public enum StaggerKind
    {
        /// <summary>No reaction.</summary>
        None = 0,

        /// <summary>Staggered: player 0.5 s.</summary>
        Stagger = 1,

        /// <summary>Knocked down: player 1.2 s (one hit of at least twice the stability).</summary>
        Knockdown = 2,

        /// <summary>Guard broken by a blocked hit that emptied the stamina: 1.0 s.</summary>
        GuardBreak = 3
    }
}
