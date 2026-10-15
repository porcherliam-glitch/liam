using System;
using Aetherfall.Events;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// A moment of the game clock (architecture 4.6): day (from 1), hour and minute; weekday, moon and phase of the day are
    /// derived (GDD 01 6.1).
    /// </summary>
    public readonly struct GameDateTime : IEquatable<GameDateTime>
    {
        /// <summary>Creates a moment.</summary>
        /// <param name="day">Day from 1.</param>
        /// <param name="hour">Hour 0 … 23.</param>
        /// <param name="minute">Minute 0 … 59.</param>
        public GameDateTime(int day, int hour, int minute)
        {
            Day = Math.Max(1, day);
            Hour = ((hour % 24) + 24) % 24;
            Minute = ((minute % 60) + 60) % 60;
        }

        /// <summary>Day from 1 (day 1 = Erntefest, the prologue).</summary>
        public int Day { get; }

        /// <summary>Hour 0 … 23.</summary>
        public int Hour { get; }

        /// <summary>Minute 0 … 59.</summary>
        public int Minute { get; }

        /// <summary>Weekday 0 … 6 (0 = Erdtag; day 1 is an Erdtag).</summary>
        public int Weekday => (Day - 1) % 7;

        /// <summary>Day of the moon cycle 0 … 7 (0 = Vollmond on day 1, 4 = Neumond).</summary>
        public int MoonDay => (Day - 1) % GameCalendar.MoonCycleDays;

        /// <summary>Phase of the day.</summary>
        public DayPhase Phase => GameCalendar.PhaseOf(Hour);

        /// <summary>Hour with the minutes as fraction (7:30 = 7.5).</summary>
        public double HourOfDay => Hour + Minute / 60.0;

        /// <summary>Total game minutes of this moment (day 1, 0:00 = 0).</summary>
        public double TotalMinutes => (Day - 1) * (double)GameCalendar.MinutesPerDay + Hour * 60 + Minute;

        /// <summary>The moment of a total of game minutes (fractions are cut off).</summary>
        /// <param name="totalMinutes">Total game minutes (day 1, 0:00 = 0); below 0 counts as 0.</param>
        public static GameDateTime FromTotalMinutes(double totalMinutes)
        {
            long minutes = (long)Math.Floor(Math.Max(0.0, totalMinutes));
            int day = (int)(minutes / GameCalendar.MinutesPerDay) + 1;
            int inDay = (int)(minutes % GameCalendar.MinutesPerDay);
            return new GameDateTime(day, inDay / 60, inDay % 60);
        }

        /// <summary>Clock text, e.g. "10:05".</summary>
        public string ClockText => Hour.ToString("00") + ":" + Minute.ToString("00");

        /// <inheritdoc />
        public bool Equals(GameDateTime other)
        {
            return Day == other.Day && Hour == other.Hour && Minute == other.Minute;
        }

        /// <inheritdoc />
        public override bool Equals(object obj)
        {
            return obj is GameDateTime other && Equals(other);
        }

        /// <inheritdoc />
        public override int GetHashCode()
        {
            return (Day * 397) ^ (Hour * 61) ^ Minute;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "Tag " + Day + " (" + GameCalendar.WeekdayName(Weekday) + "), " + ClockText;
        }
    }
}
