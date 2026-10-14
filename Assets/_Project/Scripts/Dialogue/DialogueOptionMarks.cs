using System;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Markings of a player option (GDD 02, 12.4). They are derived from the checks and actions of the option and its target
    /// node, never typed by authors (architecture 11.8); only "irreversible" and the lock reason are data of the option.
    /// <see cref="DialogueOptionFormatter"/> turns them into the visible tag and symbol.
    /// </summary>
    [Flags]
    public enum DialogueOptionMarks
    {
        /// <summary>No marking.</summary>
        None = 0,

        /// <summary>Leads to a skill check: "[Ueberzeugen 12]" in the attribute colour.</summary>
        Check = 1 << 0,

        /// <summary>Costs gold (bribe): "[80 Gold]", grey without enough gold.</summary>
        Bribe = 1 << 1,

        /// <summary>Locked by a selectable condition with a reason: "[Magier]".</summary>
        Requirement = 1 << 2,

        /// <summary>Advances a quest (diamond in the quest colour).</summary>
        QuestProgress = 1 << 3,

        /// <summary>Completes a quest (star).</summary>
        QuestComplete = 1 << 4,

        /// <summary>Starts a new quest ("!").</summary>
        NewQuest = 1 << 5,

        /// <summary>Starts a fight: "[Angriff]" in red.</summary>
        Combat = 1 << 6,

        /// <summary>Kills or cannot be undone: "[Toeten]" in red, hold to confirm.</summary>
        Kill = 1 << 7,

        /// <summary>Ends with the trade screen: "[Handel]".</summary>
        Trade = 1 << 8,

        /// <summary>Ends the conversation: "[Ende]", always at the bottom, B / Circle / Esc.</summary>
        End = 1 << 9,

        /// <summary>Was chosen before (60 % opacity, stays selectable).</summary>
        AlreadyChosen = 1 << 10,

        /// <summary>A one-time option that was used (greyed, not selectable).</summary>
        Spent = 1 << 11,

        /// <summary>
        /// Leads to an end that returns to the dialogue that jumped here (jump with return, follow-up "Gameplay"): no tag, the
        /// conversation goes on; B / Circle / Esc chooses it like "[Ende]" (GDD 02, 12.2: the last option is "Ende" or "Zurueck").
        /// </summary>
        Return = 1 << 12
    }
}
