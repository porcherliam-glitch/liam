using System.Collections.Generic;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>Helpers for <see cref="SetupStatus"/>: aggregation of a step's checklist and the display symbols. Pure logic.</summary>
    public static class SetupStatuses
    {
        /// <summary>Symbol for <see cref="SetupStatus.Done"/>.</summary>
        public const string DoneSymbol = "✓";

        /// <summary>Symbol for <see cref="SetupStatus.Open"/>.</summary>
        public const string OpenSymbol = "✗";

        /// <summary>Symbol for <see cref="SetupStatus.Unknown"/>.</summary>
        public const string UnknownSymbol = "–";

        /// <summary>
        /// Combines the items of one step: <see cref="SetupStatus.Open"/> if any item is open, otherwise
        /// <see cref="SetupStatus.Done"/> if at least one item is done, otherwise <see cref="SetupStatus.Unknown"/>.
        /// Unknown items are hints and do not make a step open.
        /// </summary>
        /// <param name="items">Checklist of one step; null or empty yields <see cref="SetupStatus.Unknown"/>.</param>
        public static SetupStatus Combine(IReadOnlyList<SetupCheckItem> items)
        {
            if (items == null || items.Count == 0)
            {
                return SetupStatus.Unknown;
            }

            bool anyDone = false;
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i] == null)
                {
                    continue;
                }

                if (items[i].Status == SetupStatus.Open)
                {
                    return SetupStatus.Open;
                }

                if (items[i].Status == SetupStatus.Done)
                {
                    anyDone = true;
                }
            }

            return anyDone ? SetupStatus.Done : SetupStatus.Unknown;
        }

        /// <summary>Returns the display symbol of a status ("✓", "✗" or "–").</summary>
        /// <param name="status">Status to display.</param>
        public static string Symbol(SetupStatus status)
        {
            switch (status)
            {
                case SetupStatus.Done:
                    return DoneSymbol;
                case SetupStatus.Open:
                    return OpenSymbol;
                default:
                    return UnknownSymbol;
            }
        }
    }
}
