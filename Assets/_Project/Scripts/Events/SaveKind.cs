namespace Aetherfall.Events
{
    /// <summary>
    /// Kind of a save (GDD 05 5.1). Part of the event <see cref="GameSaved"/>; the save header stores it as text
    /// (<c>manual</c>, <c>auto</c>, <c>quick</c>, <c>milestone</c>). Never renumber.
    /// </summary>
    public enum SaveKind
    {
        /// <summary>Manual save (up to 99 per character, 1 backup each).</summary>
        Manual = 0,

        /// <summary>Autosave (3 rotating slots per character).</summary>
        Auto = 1,

        /// <summary>Quick save, F5 (3 rotating slots per character).</summary>
        Quick = 2,

        /// <summary>Milestone save before points of no return (kept forever).</summary>
        Milestone = 3
    }
}
