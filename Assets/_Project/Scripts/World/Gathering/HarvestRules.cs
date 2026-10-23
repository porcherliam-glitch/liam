using System;

namespace Aetherfall.World
{
    /// <summary>What a harvest node shows.</summary>
    public enum HarvestVisual
    {
        /// <summary>Ripe and gatherable.</summary>
        Ripe = 0,

        /// <summary>Not harvested, but outside its time of day (Nachtschatten by day: the closed bud).</summary>
        Waiting = 1,

        /// <summary>Harvested: nothing until it grows back.</summary>
        Hidden = 2
    }

    /// <summary>
    /// Rules of harvest nodes (S30, GDD 04 6.10): a harvested node grows back after its respawn time in game days, but never in
    /// view – only when the player is at least 50 m away or when the scene is loaded; some plants are gatherable only at certain
    /// hours (Nachtschattenblüte 22–4 Uhr). The harvest time is stored in the world object store as
    /// <c>⌊game minutes⌋ + 1</c>, so 0 means "ripe" and is never saved. Pure logic; the only place that encodes and decodes it.
    /// </summary>
    public static class HarvestRules
    {
        /// <summary>Game minutes of one game day (the same as <c>GameCalendar.MinutesPerDay</c>; World cannot see GameTime).</summary>
        public const double MinutesPerGameDay = 1440d;

        /// <summary>A node grows back only this far from the player (metres; GDD 04 6.10 "nicht im Blickfeld").</summary>
        public const float RegrowDistance = 50f;

        /// <summary>The stored state of a node harvested at a moment.</summary>
        /// <param name="gameMinutes">Total game minutes of the harvest.</param>
        public static int EncodeHarvested(double gameMinutes)
        {
            double minutes = Math.Floor(Math.Max(0d, double.IsNaN(gameMinutes) ? 0d : gameMinutes));
            return minutes >= int.MaxValue - 1 ? int.MaxValue : (int)minutes + 1;
        }

        /// <summary>Reads a stored state; false for 0 ("ripe") and invalid values.</summary>
        /// <param name="state">Stored state.</param>
        /// <param name="harvestedAt">Game minutes of the harvest.</param>
        public static bool TryDecodeHarvested(int state, out double harvestedAt)
        {
            harvestedAt = state >= 1 ? state - 1 : 0d;
            return state >= 1;
        }

        /// <summary>Game minutes of a respawn time in game days.</summary>
        /// <param name="days">Game days.</param>
        public static double RespawnMinutes(double days)
        {
            return Math.Max(0d, days) * MinutesPerGameDay;
        }

        /// <summary>True if a node harvested at <paramref name="harvestedAt"/> may grow back at <paramref name="now"/>.</summary>
        /// <param name="harvestedAt">Game minutes of the harvest.</param>
        /// <param name="now">Game minutes now.</param>
        /// <param name="respawnMinutes">Respawn time in game minutes.</param>
        public static bool IsRespawnDue(double harvestedAt, double now, double respawnMinutes)
        {
            return now >= harvestedAt && now - harvestedAt >= respawnMinutes;
        }

        /// <summary>True if a due node may grow back now: unseen (scene loaded) or the player at least 50 m away.</summary>
        /// <param name="unseen">True on loading (the cell was not visible).</param>
        /// <param name="distance">Horizontal distance to the player in metres.</param>
        public static bool MayRegrow(bool unseen, float distance)
        {
            return unseen || distance >= RegrowDistance;
        }

        /// <summary>True if the plant can be gathered at this hour (from–to, over midnight allowed; equal = always).</summary>
        /// <param name="hour">Hour of the day with fraction.</param>
        /// <param name="from">First hour.</param>
        /// <param name="to">End hour (exclusive).</param>
        public static bool IsActiveAt(double hour, double from, double to)
        {
            return NpcScheduleRules.InWindow(hour, from, to);
        }

        /// <summary>What a node shows.</summary>
        /// <param name="harvested">True if harvested.</param>
        /// <param name="activeNow">True inside its time of day.</param>
        public static HarvestVisual Visual(bool harvested, bool activeNow)
        {
            return harvested ? HarvestVisual.Hidden : activeNow ? HarvestVisual.Ripe : HarvestVisual.Waiting;
        }
    }
}
