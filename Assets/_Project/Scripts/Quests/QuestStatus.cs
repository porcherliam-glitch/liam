namespace Aetherfall.Quests
{
    /// <summary>
    /// Life cycle state of a quest (GDD 02, 4.3). Stored in saves as text (<see cref="QuestStatusIds"/>), in assets as number:
    /// never renumber.
    /// </summary>
    public enum QuestStatus
    {
        /// <summary>Not started, start conditions not met (German "Unbekannt").</summary>
        Unknown = 0,

        /// <summary>Not started, start conditions met (German "Verfuegbar").</summary>
        Available = 1,

        /// <summary>Running (German "Aktiv").</summary>
        Active = 2,

        /// <summary>Ended successfully (German "Abgeschlossen").</summary>
        Completed = 3,

        /// <summary>Failed (German "Gescheitert").</summary>
        Failed = 4,

        /// <summary>Can never start any more (German "Gesperrt"; e.g. faction exclusion). TODO: detection follows with factions.</summary>
        Locked = 5
    }
}
