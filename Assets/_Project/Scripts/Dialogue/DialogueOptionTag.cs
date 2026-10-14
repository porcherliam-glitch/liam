namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The one bracket tag shown in front of an option (GDD 02, 12.4), chosen by priority from the
    /// <see cref="DialogueOptionMarks"/>: Kill, Combat, Check, Bribe, Requirement, Trade, End.
    /// </summary>
    public enum DialogueOptionTag
    {
        /// <summary>No tag.</summary>
        None = 0,

        /// <summary>"[Ueberzeugen 12]" (met) or "[Ueberzeugen 12 · dein Wert 9]" (not met) or "[Ueberzeugen · 65 %]" (dice).</summary>
        Check = 1,

        /// <summary>"[80 Gold]".</summary>
        Bribe = 2,

        /// <summary>"[Grund]", e.g. "[Magier]".</summary>
        Requirement = 3,

        /// <summary>"[Angriff]".</summary>
        Combat = 4,

        /// <summary>"[Toeten]".</summary>
        Kill = 5,

        /// <summary>"[Handel]".</summary>
        Trade = 6,

        /// <summary>"[Ende]".</summary>
        End = 7
    }
}
