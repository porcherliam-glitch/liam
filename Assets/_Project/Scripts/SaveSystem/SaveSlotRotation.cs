using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Events;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Chooses the slot of a save (GDD 05 5.1, architecture 9.4): quick saves and autosaves rotate through 3 slots
    /// (<c>quick_0..2</c>, <c>auto_0..2</c>: a free one first, otherwise the oldest), manual saves get the next number up to
    /// 99 (<c>manual_001</c>), milestones the next number and are never overwritten. Pure logic.
    /// </summary>
    public static class SaveSlotRotation
    {
        /// <summary>Number of rotating slots for quick saves and autosaves.</summary>
        public const int RotatingSlotCount = 3;

        /// <summary>Highest number of manual saves per character (GDD 05 5.1).</summary>
        public const int MaxManualSlots = 99;

        /// <summary>Chooses the slot name for a request.</summary>
        /// <param name="request">Save request.</param>
        /// <param name="existing">Existing slots of the character.</param>
        /// <returns>Slot name, or null if no slot is free (manual limit reached) or the requested name is invalid.</returns>
        public static string ChooseSlot(in SaveRequest request, IReadOnlyList<SaveSlotInfo> existing)
        {
            switch (request.Kind)
            {
                case SaveKind.Quick:
                case SaveKind.Auto:
                    return ChooseRotating(request.Kind, existing);
                case SaveKind.Milestone:
                    return NextNumbered(SaveKind.Milestone, existing, int.MaxValue);
                default:
                    if (!string.IsNullOrEmpty(request.SlotName))
                    {
                        return SaveSlotId.IsValidName(request.SlotName) ? request.SlotName : null;
                    }

                    return NextNumbered(SaveKind.Manual, existing, MaxManualSlots);
            }
        }

        /// <summary>The rotating slot to write next: the first missing index, otherwise the slot with the oldest save.</summary>
        /// <param name="kind">Quick or Auto.</param>
        /// <param name="existing">Existing slots.</param>
        public static string ChooseRotating(SaveKind kind, IReadOnlyList<SaveSlotInfo> existing)
        {
            string prefix = SaveKindIds.SlotPrefix(kind);
            SaveSlotInfo oldest = null;
            for (int index = 0; index < RotatingSlotCount; index++)
            {
                string name = prefix + index.ToString(CultureInfo.InvariantCulture);
                SaveSlotInfo slot = Find(existing, name);
                if (slot == null)
                {
                    return name;
                }

                // Damaged slots count as oldest, so a broken slot is overwritten first.
                if (oldest == null || (slot.IsDamaged && !oldest.IsDamaged) ||
                    (slot.IsDamaged == oldest.IsDamaged && CompareCreation(slot, oldest) < 0))
                {
                    oldest = slot;
                }
            }

            return oldest.SlotName;
        }

        /// <summary>The newest slot (by creation time and save number), optionally of one kind; damaged slots are skipped.</summary>
        /// <param name="slots">Slots.</param>
        /// <param name="kind">Kind or null for any.</param>
        public static SaveSlotInfo FindLatest(IReadOnlyList<SaveSlotInfo> slots, SaveKind? kind)
        {
            SaveSlotInfo latest = null;
            if (slots == null)
            {
                return null;
            }

            for (int i = 0; i < slots.Count; i++)
            {
                SaveSlotInfo slot = slots[i];
                if (slot.IsDamaged || (kind.HasValue && slot.Kind != kind.Value))
                {
                    continue;
                }

                if (latest == null || CompareCreation(slot, latest) > 0)
                {
                    latest = slot;
                }
            }

            return latest;
        }

        /// <summary>
        /// Orders slots by age: creation time (whole seconds), then <see cref="SaveHeader.SaveSequence"/> for saves of the
        /// same second. Negative if <paramref name="a"/> is older.
        /// </summary>
        /// <param name="a">First slot.</param>
        /// <param name="b">Second slot.</param>
        public static int CompareCreation(SaveSlotInfo a, SaveSlotInfo b)
        {
            int byTime = string.CompareOrdinal(a.CreatedUtc, b.CreatedUtc);
            return byTime != 0 ? byTime : a.Sequence.CompareTo(b.Sequence);
        }

        /// <summary>Save number for the next save of a character: one more than the highest existing one, 0 for the first.</summary>
        /// <param name="existing">Existing slots of the character.</param>
        public static long NextSequence(IReadOnlyList<SaveSlotInfo> existing)
        {
            long next = 0;
            if (existing == null)
            {
                return next;
            }

            for (int i = 0; i < existing.Count; i++)
            {
                long sequence = existing[i].Sequence;
                if (sequence >= next)
                {
                    next = sequence + 1;
                }
            }

            return next;
        }

        private static string NextNumbered(SaveKind kind, IReadOnlyList<SaveSlotInfo> existing, int max)
        {
            string prefix = SaveKindIds.SlotPrefix(kind);
            int highest = 0;
            int count = 0;
            if (existing != null)
            {
                for (int i = 0; i < existing.Count; i++)
                {
                    string name = existing[i].SlotName;
                    if (!name.StartsWith(prefix, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    count++;
                    if (int.TryParse(name.Substring(prefix.Length), NumberStyles.None, CultureInfo.InvariantCulture, out int number) && number > highest)
                    {
                        highest = number;
                    }
                }
            }

            if (count >= max)
            {
                return null;
            }

            return prefix + (highest + 1).ToString("000", CultureInfo.InvariantCulture);
        }

        private static SaveSlotInfo Find(IReadOnlyList<SaveSlotInfo> slots, string slotName)
        {
            if (slots == null)
            {
                return null;
            }

            for (int i = 0; i < slots.Count; i++)
            {
                if (string.Equals(slots[i].SlotName, slotName, StringComparison.Ordinal))
                {
                    return slots[i];
                }
            }

            return null;
        }
    }
}
