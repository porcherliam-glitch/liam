namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Kind of the bracket tag in front of an answer (GDD 02, 12.4); selects the colour class of the tag (attribute colour for
    /// checks, red for fight and kill).
    /// </summary>
    public enum DialogueScreenTag
    {
        /// <summary>No tag.</summary>
        None = 0,

        /// <summary>Skill check, e.g. "[Ueberzeugen 12]" in the attribute colour.</summary>
        Check = 1,

        /// <summary>Bribe, e.g. "[80 Gold]".</summary>
        Bribe = 2,

        /// <summary>Requirement, e.g. "[Magier]".</summary>
        Requirement = 3,

        /// <summary>Fight: "[Angriff]" in red.</summary>
        Combat = 4,

        /// <summary>Kill / irreversible: "[Toeten]" in red, hold to confirm.</summary>
        Kill = 5,

        /// <summary>Trade: "[Handel]".</summary>
        Trade = 6,

        /// <summary>End of the conversation: "[Ende]" (B / Circle / Esc).</summary>
        End = 7
    }
}
