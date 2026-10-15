using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>Pure rules of NPC daily routines (GDD 01 7.1): which block applies at an hour, and time windows over midnight.</summary>
    public static class NpcScheduleRules
    {
        /// <summary>True if <paramref name="hour"/> lies in the window <paramref name="from"/>–<paramref name="to"/> (end exclusive, over midnight allowed; equal = all day).</summary>
        /// <param name="hour">Hour with fraction.</param>
        /// <param name="from">Start hour.</param>
        /// <param name="to">End hour.</param>
        public static bool InWindow(double hour, double from, double to)
        {
            if (Math.Abs(from - to) < 1e-6)
            {
                return true;
            }

            return from < to ? hour >= from && hour < to : hour >= from || hour < to;
        }

        /// <summary>Index of the first block that contains <paramref name="hour"/>, or −1 if none does.</summary>
        /// <param name="entries">Blocks of the routine (the first match wins).</param>
        /// <param name="hour">Hour with fraction (0 ≤ hour &lt; 24).</param>
        public static int EntryAt(IReadOnlyList<NpcScheduleEntry> entries, double hour)
        {
            if (entries == null)
            {
                return -1;
            }

            for (int i = 0; i < entries.Count; i++)
            {
                NpcScheduleEntry entry = entries[i];
                if (entry != null && InWindow(hour, entry.FromHour, entry.ToHour))
                {
                    return i;
                }
            }

            return -1;
        }

        /// <summary>
        /// Checks a routine: every hour of the day must be covered by a block (an NPC is always somewhere).
        /// </summary>
        /// <param name="entries">Blocks.</param>
        /// <returns>Empty if valid, otherwise an English problem text.</returns>
        public static string Validate(IReadOnlyList<NpcScheduleEntry> entries)
        {
            if (entries == null || entries.Count == 0)
            {
                return "A daily routine needs at least one block.";
            }

            for (int quarter = 0; quarter < 96; quarter++)
            {
                double hour = quarter / 4.0;
                if (EntryAt(entries, hour) < 0)
                {
                    return "No block covers " + ((int)hour).ToString("00") + ":" + ((quarter % 4) * 15).ToString("00") + ".";
                }
            }

            return string.Empty;
        }
    }
}
