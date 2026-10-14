using System;
using System.Globalization;
using Aetherfall.Events;

namespace Aetherfall.UI.Framework
{
    /// <summary>Texts of a save slot in the load lists (GDD 05 5.5: kind, date and time, playtime). Pure logic.</summary>
    public static class SaveSlotText
    {
        /// <summary>German name of a save kind.</summary>
        /// <param name="kind">Kind.</param>
        public static string KindName(SaveKind kind)
        {
            switch (kind)
            {
                case SaveKind.Auto: return UiTexts.Get(UiTextKeys.SlotKindAuto);
                case SaveKind.Quick: return UiTexts.Get(UiTextKeys.SlotKindQuick);
                case SaveKind.Milestone: return UiTexts.Get(UiTextKeys.SlotKindMilestone);
                default: return UiTexts.Get(UiTextKeys.SlotKindManual);
            }
        }

        /// <summary>Playtime as hours and minutes, e.g. "23:41 h" (GDD 05 5.5).</summary>
        /// <param name="seconds">Playtime in seconds.</param>
        public static string Playtime(double seconds)
        {
            long totalMinutes = double.IsNaN(seconds) || seconds <= 0d ? 0L : (long)Math.Floor(seconds / 60d);
            long hours = totalMinutes / 60L;
            long minutes = totalMinutes % 60L;
            return UiTexts.Format(UiTextKeys.Playtime, hours.ToString(CultureInfo.InvariantCulture), minutes.ToString("00", CultureInfo.InvariantCulture));
        }

        /// <summary>
        /// Local date and time of a save, e.g. "12.10.2026, 21:14" (GDD 05 5.5). Returns an empty string for an unreadable value.
        /// </summary>
        /// <param name="createdUtcIso">Creation time as ISO 8601 UTC text (save header).</param>
        /// <param name="toLocal">Conversion to local time (tests pass a fixed offset); null = the machine's time zone.</param>
        public static string DateTime(string createdUtcIso, Func<System.DateTime, System.DateTime> toLocal = null)
        {
            if (string.IsNullOrEmpty(createdUtcIso) ||
                !System.DateTime.TryParse(createdUtcIso, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out System.DateTime utc))
            {
                return string.Empty;
            }

            System.DateTime local = toLocal != null ? toLocal(utc) : utc.ToLocalTime();
            return local.ToString("dd.MM.yyyy, HH:mm", CultureInfo.InvariantCulture);
        }

        /// <summary>Second line of a slot entry: "Spielzeit 0:23 h".</summary>
        /// <param name="playtimeSeconds">Playtime in seconds.</param>
        public static string PlaytimeLine(double playtimeSeconds)
        {
            return UiTexts.Format(UiTextKeys.SlotPlaytime, Playtime(playtimeSeconds));
        }
    }
}
