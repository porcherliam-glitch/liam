namespace Aetherfall.Events
{
    /// <summary>
    /// Kind of a dialogue skill check (GDD 02, 12.3; architecture 4.3 payload <c>CheckType</c> of
    /// <see cref="SkillCheckResolved"/>). Values may be stored in content assets and saves: never renumber.
    /// </summary>
    public enum SkillCheckType
    {
        /// <summary>Persuade (German "Ueberzeugen"): Charisma.</summary>
        Persuade = 0,

        /// <summary>Intimidate (German "Einschuechtern"): the higher of Charisma and Strength.</summary>
        Intimidate = 1,

        /// <summary>Lie (German "Luegen"): Charisma.</summary>
        Lie = 2
    }
}
