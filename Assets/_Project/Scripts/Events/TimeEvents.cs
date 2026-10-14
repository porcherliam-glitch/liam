// Global events of the game clock (architecture 4.3, event #9). Several event structs of one area may share a file
// (architecture 15.2, rule 18). Sender: the game clock of Aetherfall.GameTime (later step, architecture 4.6); until it
// exists, tests and debug tools send this event.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The game time advanced by one game minute (every 2 s of real time at the default day length; one event per skipped
    /// hour while resting). Receivers: NPC schedules, audio, condition watcher, quests ("Warte bis Tageszeit").
    /// </summary>
    public readonly struct TimeOfDayChanged : IGameEvent
    {
        /// <summary>Game day (0 = first day).</summary>
        public readonly int Day;

        /// <summary>Hour 0-23.</summary>
        public readonly int Hour;

        /// <summary>Minute 0-59.</summary>
        public readonly int Minute;

        /// <summary>Part of the day.</summary>
        public readonly DayPhase Phase;

        /// <summary>Creates the event.</summary>
        /// <param name="day">Game day.</param>
        /// <param name="hour">Hour.</param>
        /// <param name="minute">Minute.</param>
        /// <param name="phase">Part of the day.</param>
        public TimeOfDayChanged(int day, int hour, int minute, DayPhase phase)
        {
            Day = day;
            Hour = hour;
            Minute = minute;
            Phase = phase;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "TimeOfDayChanged(day " + Day + ", " + Hour.ToString("00") + ":" + Minute.ToString("00") + ", " + Phase + ")";
        }
    }
}
