namespace Aetherfall.UI.Framework
{
    /// <summary>What a message is about; decides merging (GDD 05 1.7 "Zusammenfassen") and the text format.</summary>
    public enum NotificationKind
    {
        /// <summary>Free text.</summary>
        Message = 0,

        /// <summary>An item was picked up ("Eisenerz ×3"); the same item within 3 s is merged.</summary>
        Item = 1,

        /// <summary>Gold or another currency ("+23 Gold"); summed within 3 s.</summary>
        Currency = 2,

        /// <summary>Experience points ("+50 EP"); summed within 3 s.</summary>
        Experience = 3,

        /// <summary>Level-up (milestone, shorter base duration of 3 s).</summary>
        LevelUp = 4,

        /// <summary>Critical warning (shown at once even in combat).</summary>
        Warning = 5,

        /// <summary>Overflow summary of loot messages ("+12 Gegenstaende").</summary>
        Summary = 6
    }
}
