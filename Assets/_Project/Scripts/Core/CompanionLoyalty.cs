using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// Loyalty of a companion (GDD 01 10.3, pure logic): scale 0–100; at 20 a warning talk, at 10 or below the companion
    /// leaves; the word of the bar (Abweisend, Kühl, Kollegial, Vertraut, Verbunden) and the flag ids of a companion
    /// (<c>npc.begleiter.maren_falkenried</c> → <c>stat.begleiter.maren.loyalitaet</c>, <c>flag.begleiter.maren.in_gruppe</c> …).
    /// </summary>
    public static class CompanionLoyalty
    {
        /// <summary>Highest loyalty.</summary>
        public const int Max = 100;

        /// <summary>At or below this the companion warns once.</summary>
        public const int WarningAt = 20;

        /// <summary>At or below this the companion leaves the group.</summary>
        public const int LeaveAt = 10;

        /// <summary>Clamps a value into 0–100.</summary>
        /// <param name="value">Wanted value.</param>
        public static int Clamp(int value)
        {
            return Math.Max(0, Math.Min(Max, value));
        }

        /// <summary>Word of the loyalty bar (GDD 01 10.3, no number shown).</summary>
        /// <param name="loyalty">Loyalty 0–100.</param>
        public static string TierWord(int loyalty)
        {
            if (loyalty < 20)
            {
                return "Abweisend";
            }

            if (loyalty < 40)
            {
                return "Kühl";
            }

            if (loyalty < 60)
            {
                return "Kollegial";
            }

            return loyalty < 80 ? "Vertraut" : "Verbunden";
        }

        /// <summary>Short name of a companion id: <c>npc.begleiter.maren_falkenried</c> → <c>maren</c>.</summary>
        /// <param name="companionId">Companion id.</param>
        public static string ShortName(string companionId)
        {
            if (string.IsNullOrEmpty(companionId))
            {
                return string.Empty;
            }

            string name = companionId;
            int dot = name.LastIndexOf('.');
            if (dot >= 0)
            {
                name = name.Substring(dot + 1);
            }

            int underscore = name.IndexOf('_');
            return underscore > 0 ? name.Substring(0, underscore) : name;
        }

        /// <summary>Name for notices: <c>npc.begleiter.maren_falkenried</c> → <c>Maren</c>.</summary>
        /// <param name="companionId">Companion id.</param>
        public static string DisplayName(string companionId)
        {
            string name = ShortName(companionId);
            return name.Length == 0 ? string.Empty : char.ToUpperInvariant(name[0]) + name.Substring(1);
        }

        /// <summary>World value of the loyalty (0–100).</summary>
        /// <param name="companionId">Companion id.</param>
        public static string LoyaltyFlag(string companionId)
        {
            return "stat.begleiter." + ShortName(companionId) + ".loyalitaet";
        }

        /// <summary>World flag: 1 while the companion is in the group.</summary>
        /// <param name="companionId">Companion id.</param>
        public static string InPartyFlag(string companionId)
        {
            return "flag.begleiter." + ShortName(companionId) + ".in_gruppe";
        }

        /// <summary>World flag: 1 after the warning talk at 20.</summary>
        /// <param name="companionId">Companion id.</param>
        public static string WarnedFlag(string companionId)
        {
            return "flag.begleiter." + ShortName(companionId) + ".gewarnt";
        }

        /// <summary>World flag: 1 after the companion left the group at 10 or below.</summary>
        /// <param name="companionId">Companion id.</param>
        public static string LeftFlag(string companionId)
        {
            return "flag.begleiter." + ShortName(companionId) + ".verlassen";
        }

        /// <summary>World value of the combat mode (0 aggressive, 1 defensive, 2 supportive, 3 passive).</summary>
        /// <param name="companionId">Companion id.</param>
        public static string ModeFlag(string companionId)
        {
            return "stat.begleiter." + ShortName(companionId) + ".kampfmodus";
        }

        /// <summary>What a change of loyalty leads to.</summary>
        /// <param name="before">Loyalty before.</param>
        /// <param name="after">Loyalty after.</param>
        /// <param name="alreadyWarned">True if the warning talk happened.</param>
        public static CompanionLoyaltyStep StepFor(int before, int after, bool alreadyWarned)
        {
            if (after <= LeaveAt && before > LeaveAt)
            {
                return CompanionLoyaltyStep.Leaves;
            }

            if (after <= WarningAt && !alreadyWarned && after > LeaveAt)
            {
                return CompanionLoyaltyStep.Warns;
            }

            return CompanionLoyaltyStep.None;
        }
    }

    /// <summary>Consequence of a loyalty change.</summary>
    public enum CompanionLoyaltyStep
    {
        /// <summary>Nothing happens.</summary>
        None = 0,

        /// <summary>The companion warns (once, at 20).</summary>
        Warns = 1,

        /// <summary>The companion leaves the group (10 or below).</summary>
        Leaves = 2
    }
}
