using System;

namespace Aetherfall.Player
{
    /// <summary>Why fast travel is not possible right now (GDD 03 3.4 / S50).</summary>
    public enum FastTravelBlock
    {
        /// <summary>Travel is possible.</summary>
        None = 0,

        /// <summary>The scene has no world map (crypt, interiors).</summary>
        NoMap = 1,

        /// <summary>The target is not a travel point or not unlocked yet.</summary>
        NotUnlocked = 2,

        /// <summary>In combat.</summary>
        InCombat = 3,

        /// <summary>Carrying more than allowed (overloaded).</summary>
        Overloaded = 4,

        /// <summary>A save lock holds (falling, climbing, timed quest stage, boss fight, dialogue).</summary>
        SaveLocked = 5,

        /// <summary>The player already stands there.</summary>
        AlreadyThere = 6
    }

    /// <summary>The situation a fast travel request is checked against.</summary>
    public readonly struct FastTravelContext
    {
        /// <summary>Creates the context.</summary>
        /// <param name="hasMap">The scene has a world map.</param>
        /// <param name="targetUnlocked">The target is an unlocked travel point of that map.</param>
        /// <param name="inCombat">The player is in combat.</param>
        /// <param name="overloaded">The player carries more than allowed.</param>
        /// <param name="saveLocked">A save lock other than "a save is being written" holds.</param>
        /// <param name="distance">Horizontal distance to the arrival point in metres.</param>
        public FastTravelContext(bool hasMap, bool targetUnlocked, bool inCombat, bool overloaded, bool saveLocked, float distance)
        {
            HasMap = hasMap;
            TargetUnlocked = targetUnlocked;
            InCombat = inCombat;
            Overloaded = overloaded;
            SaveLocked = saveLocked;
            Distance = distance;
        }

        /// <summary>The scene has a world map.</summary>
        public bool HasMap { get; }

        /// <summary>The target is unlocked.</summary>
        public bool TargetUnlocked { get; }

        /// <summary>In combat.</summary>
        public bool InCombat { get; }

        /// <summary>Overloaded.</summary>
        public bool Overloaded { get; }

        /// <summary>A save lock holds.</summary>
        public bool SaveLocked { get; }

        /// <summary>Distance to the arrival point.</summary>
        public float Distance { get; }
    }

    /// <summary>
    /// Fast travel (S50, GDD 03 3.4, GDD 01 6.6): from anywhere in a region with a map to every discovered travel point —
    /// settlements and places with a waypoint, activated viewpoints — never in combat, overloaded or while a save lock holds
    /// (falling, climbing, boss fight, timed quest stage). The time passes as if the player had ridden there: distance at
    /// mount speed, scaled like the game clock. Pure logic.
    /// </summary>
    public static class FastTravelRules
    {
        /// <summary>Speed of the ride the travel time is based on (m/s, GDD 03 mount gallop).</summary>
        public const float MountSpeed = 13f;

        /// <summary>Closer than this, the player is already there (metres).</summary>
        public const float ArrivedDistance = 15f;

        /// <summary>Checks a travel request; the first reason that applies wins.</summary>
        /// <param name="context">The situation.</param>
        public static FastTravelBlock Check(in FastTravelContext context)
        {
            if (!context.HasMap)
            {
                return FastTravelBlock.NoMap;
            }

            if (!context.TargetUnlocked)
            {
                return FastTravelBlock.NotUnlocked;
            }

            if (context.InCombat)
            {
                return FastTravelBlock.InCombat;
            }

            if (context.Overloaded)
            {
                return FastTravelBlock.Overloaded;
            }

            if (context.SaveLocked)
            {
                return FastTravelBlock.SaveLocked;
            }

            return context.Distance < ArrivedDistance ? FastTravelBlock.AlreadyThere : FastTravelBlock.None;
        }

        /// <summary>
        /// Game hours the travel takes: the ride at <see cref="MountSpeed"/> in real seconds, turned into game time with the
        /// length of a game day (default 2880 s per day = 30 game minutes per real minute).
        /// </summary>
        /// <param name="distance">Distance in metres.</param>
        /// <param name="realSecondsPerGameDay">Real seconds of one game day.</param>
        public static double TravelHours(float distance, double realSecondsPerGameDay)
        {
            if (!(distance > 0f) || !(realSecondsPerGameDay > 0.0))
            {
                return 0.0;
            }

            double rideSeconds = distance / MountSpeed;
            return rideSeconds * 24.0 / realSecondsPerGameDay;
        }

        /// <summary>Travel time as German text: "3 Min.", "1 Std. 5 Min.".</summary>
        /// <param name="hours">Game hours.</param>
        public static string Describe(double hours)
        {
            int minutes = Math.Max(1, (int)Math.Round(hours * 60.0));
            int fullHours = minutes / 60;
            int rest = minutes % 60;
            if (fullHours == 0)
            {
                return minutes + " Min.";
            }

            return rest == 0 ? fullHours + " Std." : fullHours + " Std. " + rest + " Min.";
        }
    }
}
