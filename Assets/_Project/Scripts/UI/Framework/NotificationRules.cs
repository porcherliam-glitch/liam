using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>The numbers of GDD 05 1.7 (queue rules of on-screen messages). Pure constants and formulas.</summary>
    public static class NotificationRules
    {
        /// <summary>Messages of the same item, currency or experience within this window are merged (s).</summary>
        public const double MergeWindowSeconds = 3d;

        /// <summary>Maximum queued messages; on overflow loot messages are condensed into one summary.</summary>
        public const int MaxQueued = 30;

        /// <summary>Number of messages kept for the history (system tab).</summary>
        public const int HistorySize = 50;

        /// <summary>Buffered loot messages older than this are condensed when shown (s).</summary>
        public const double StaleLootSeconds = 30d;

        /// <summary>Deferred milestones appear this long after the end of combat (s).</summary>
        public const double AfterCombatDelaySeconds = 3d;

        /// <summary>Reading time: 1.0 s plus this per character (GDD 05 1.7 "Lesezeit").</summary>
        public const float SecondsPerCharacter = 0.06f;

        /// <summary>Base of the reading time formula.</summary>
        public const float ReadingBaseSeconds = 1f;

        /// <summary>Messages on screen at the same time per class: P0 1, P1 2, P2 5.</summary>
        /// <param name="priority">Class.</param>
        public static int MaxVisible(NotificationPriority priority)
        {
            switch (priority)
            {
                case NotificationPriority.Milestone: return 1;
                case NotificationPriority.Progress: return 2;
                default: return 5;
            }
        }

        /// <summary>Base display duration: P0 4.0 s (level-up 3.0 s), P1 3.0 s, P2 2.5 s.</summary>
        /// <param name="priority">Class.</param>
        /// <param name="kind">Kind.</param>
        public static float BaseDuration(NotificationPriority priority, NotificationKind kind)
        {
            switch (priority)
            {
                case NotificationPriority.Milestone: return kind == NotificationKind.LevelUp ? 3f : 4f;
                case NotificationPriority.Progress: return 3f;
                default: return 2.5f;
            }
        }

        /// <summary>Display duration = max(base duration; 1.0 s + 0.06 s per character) × duration factor.</summary>
        /// <param name="priority">Class.</param>
        /// <param name="kind">Kind.</param>
        /// <param name="textLength">Number of characters shown.</param>
        /// <param name="durationFactor">Option 1 / 1.5 / 2 (values below 0.5 count as 1).</param>
        public static float Duration(NotificationPriority priority, NotificationKind kind, int textLength, float durationFactor)
        {
            float reading = ReadingBaseSeconds + SecondsPerCharacter * Math.Max(0, textLength);
            float factor = float.IsNaN(durationFactor) || durationFactor < 0.5f ? 1f : durationFactor;
            return Math.Max(BaseDuration(priority, kind), reading) * factor;
        }

        /// <summary>True if the filter shows messages of this class.</summary>
        /// <param name="filter">Filter option.</param>
        /// <param name="priority">Class.</param>
        public static bool Passes(NotificationFilter filter, NotificationPriority priority)
        {
            switch (filter)
            {
                case NotificationFilter.Minimal: return priority == NotificationPriority.Milestone;
                case NotificationFilter.Important: return priority != NotificationPriority.Loot;
                default: return true;
            }
        }

        /// <summary>True if the kind is merged by its merge key (items, currencies, experience).</summary>
        /// <param name="kind">Kind.</param>
        public static bool IsMergeable(NotificationKind kind)
        {
            return kind == NotificationKind.Item || kind == NotificationKind.Currency || kind == NotificationKind.Experience;
        }

        /// <summary>True if a milestone is shown immediately during combat (level-up and warnings, GDD 05 1.7).</summary>
        /// <param name="kind">Kind.</param>
        public static bool ShowsDuringCombat(NotificationKind kind)
        {
            return kind == NotificationKind.LevelUp || kind == NotificationKind.Warning;
        }

        /// <summary>The text shown for a message (formats from <see cref="UiTexts"/>).</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="baseText">Base text.</param>
        /// <param name="amount">Amount.</param>
        public static string FormatText(NotificationKind kind, string baseText, int amount)
        {
            string text = baseText ?? string.Empty;
            switch (kind)
            {
                case NotificationKind.Item:
                    return amount > 1 ? UiTexts.Format(UiTextKeys.NoteItemCount, text, amount.ToString(System.Globalization.CultureInfo.InvariantCulture)) : text;
                case NotificationKind.Currency:
                    return UiTexts.Format(amount >= 0 ? UiTextKeys.NoteCurrencyGain : UiTextKeys.NoteCurrencyLoss,
                        Math.Abs(amount).ToString(System.Globalization.CultureInfo.InvariantCulture), text);
                case NotificationKind.Experience:
                    return UiTexts.Format(UiTextKeys.NoteExperience, amount.ToString(System.Globalization.CultureInfo.InvariantCulture));
                case NotificationKind.LevelUp:
                    return UiTexts.Format(UiTextKeys.NoteLevelUp, amount.ToString(System.Globalization.CultureInfo.InvariantCulture));
                case NotificationKind.Summary:
                    return UiTexts.Format(UiTextKeys.NoteSummary, amount.ToString(System.Globalization.CultureInfo.InvariantCulture));
                default:
                    return text;
            }
        }
    }
}
