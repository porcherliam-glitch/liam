using System.Collections.Generic;
using Aetherfall.Events;

namespace Aetherfall.World
{
    /// <summary>
    /// Pure choice of a bark (GDD 01 7.4): a line that fits the part of the day and was not heard in the last 10 minutes (the
    /// same line at most every 10 min); among those the one heard longest ago, so the lines take turns.
    /// </summary>
    public static class NpcBarkRules
    {
        /// <summary>The same line is said again at the earliest after this many real seconds (GDD: 10 min).</summary>
        public const float LineCooldownSeconds = 600f;

        /// <summary>Picks a line, or −1 if none may be said now.</summary>
        /// <param name="lines">Lines of the NPC.</param>
        /// <param name="phase">Current part of the day.</param>
        /// <param name="lastSaid">Real time each line was said last (missing or below 0 = never); same order as the lines.</param>
        /// <param name="now">Current real time in seconds.</param>
        public static int Pick(IReadOnlyList<NpcBarkLine> lines, DayPhase phase, IReadOnlyList<float> lastSaid, float now)
        {
            if (lines == null)
            {
                return -1;
            }

            int best = -1;
            double oldest = double.MaxValue;
            for (int i = 0; i < lines.Count; i++)
            {
                NpcBarkLine line = lines[i];
                if (line == null || line.Text.Length == 0 || !line.Fits(phase))
                {
                    continue;
                }

                float said = lastSaid != null && i < lastSaid.Count ? lastSaid[i] : -1f;
                if (said >= 0f && now - said < LineCooldownSeconds)
                {
                    continue;
                }

                // Never said: before every said line, in list order.
                double order = said < 0f ? -1e12 + i : said;
                if (order < oldest)
                {
                    oldest = order;
                    best = i;
                }
            }

            return best;
        }
    }
}
