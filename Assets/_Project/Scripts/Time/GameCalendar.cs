using System;
using Aetherfall.Events;

namespace Aetherfall.GameTime
{
    /// <summary>
    /// Calendar of Aetherfall (GDD 01 6.1, pure logic): a game day has 1440 game minutes and lasts 48 min of real time by
    /// default; phases Morgen 5–8, Tag 8–18, Abend 18–21, Nacht 21–5; a week of 7 days (Erdtag … Ruhetag); the moon goes
    /// round in 8 days (Vollmond on day 1, Neumond on day 5). The game starts on day 1 at 10:00 (Erntefest, prologue).
    /// </summary>
    public static class GameCalendar
    {
        /// <summary>Game minutes per game day.</summary>
        public const int MinutesPerDay = 1440;

        /// <summary>Real seconds per game day by default (48 min, architecture 4.6).</summary>
        public const float DefaultRealSecondsPerDay = 2880f;

        /// <summary>Shortest day length the options allow (24 min).</summary>
        public const float MinRealSecondsPerDay = 1440f;

        /// <summary>Longest day length the options allow (96 min).</summary>
        public const float MaxRealSecondsPerDay = 5760f;

        /// <summary>Game minutes at the start of a new game: day 1, 10:00.</summary>
        public const double StartMinutes = 10 * 60;

        /// <summary>Days of the moon cycle.</summary>
        public const int MoonCycleDays = 8;

        private static readonly string[] WeekdayNames = { "Erdtag", "Wassertag", "Windtag", "Feuertag", "Aethertag", "Markttag", "Ruhetag" };

        private static readonly string[] MoonNames =
        {
            "Vollmond", "abnehmender Mond", "Halbmond (abnehmend)", "abnehmende Sichel", "Neumond", "zunehmende Sichel", "Halbmond (zunehmend)",
            "zunehmender Mond"
        };

        /// <summary>Phase of the day at an hour.</summary>
        /// <param name="hour">Hour 0 … 23.</param>
        public static DayPhase PhaseOf(int hour)
        {
            if (hour >= 5 && hour < 8)
            {
                return DayPhase.Morning;
            }

            if (hour >= 8 && hour < 18)
            {
                return DayPhase.Day;
            }

            return hour >= 18 && hour < 21 ? DayPhase.Evening : DayPhase.Night;
        }

        /// <summary>German name of a weekday (0 = Erdtag).</summary>
        /// <param name="weekday">Weekday 0 … 6.</param>
        public static string WeekdayName(int weekday)
        {
            return WeekdayNames[((weekday % 7) + 7) % 7];
        }

        /// <summary>German name of the moon phase (0 = Vollmond, 4 = Neumond).</summary>
        /// <param name="moonDay">Day of the moon cycle 0 … 7.</param>
        public static string MoonName(int moonDay)
        {
            return MoonNames[((moonDay % MoonCycleDays) + MoonCycleDays) % MoonCycleDays];
        }

        /// <summary>Game minutes that pass in <paramref name="realSeconds"/> at a day length.</summary>
        /// <param name="realSeconds">Real seconds.</param>
        /// <param name="realSecondsPerDay">Real seconds per game day.</param>
        public static double GameMinutesFor(double realSeconds, float realSecondsPerDay)
        {
            float day = ClampDayLength(realSecondsPerDay);
            return realSeconds * MinutesPerDay / day;
        }

        /// <summary>Keeps a day length inside the options range (24–96 min).</summary>
        /// <param name="realSecondsPerDay">Wanted value.</param>
        public static float ClampDayLength(float realSecondsPerDay)
        {
            if (!(realSecondsPerDay > 0f) || float.IsInfinity(realSecondsPerDay))
            {
                return DefaultRealSecondsPerDay;
            }

            return Math.Max(MinRealSecondsPerDay, Math.Min(MaxRealSecondsPerDay, realSecondsPerDay));
        }

        /// <summary>
        /// Game minutes from <paramref name="totalMinutes"/> until the clock next shows <paramref name="hour"/>:00 (0 if it is
        /// exactly that time; at most one day).
        /// </summary>
        /// <param name="totalMinutes">Current total game minutes.</param>
        /// <param name="hour">Wanted hour 0 … 23.</param>
        public static double MinutesUntil(double totalMinutes, int hour)
        {
            double inDay = ((totalMinutes % MinutesPerDay) + MinutesPerDay) % MinutesPerDay;
            double target = (((hour % 24) + 24) % 24) * 60.0;
            double wait = target - inDay;
            return wait < 0.0 ? wait + MinutesPerDay : wait;
        }

        /// <summary>True if <paramref name="hour"/> lies in the window from <paramref name="from"/> to <paramref name="to"/> (crossing midnight allowed).</summary>
        /// <param name="hour">Hour with fraction (e.g. 7.5 = 7:30).</param>
        /// <param name="from">Start hour (inclusive).</param>
        /// <param name="to">End hour (exclusive); smaller than <paramref name="from"/> = over midnight; equal = all day.</param>
        public static bool InWindow(double hour, double from, double to)
        {
            if (Math.Abs(from - to) < 1e-6)
            {
                return true;
            }

            return from < to ? hour >= from && hour < to : hour >= from || hour < to;
        }
    }
}
