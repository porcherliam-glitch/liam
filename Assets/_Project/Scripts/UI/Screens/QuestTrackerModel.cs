using System;
using System.Collections.Generic;
using Aetherfall.Quests;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The tracked quests of the HUD (pure logic): at most <see cref="QuestService.MaxTrackedQuests"/> running quests, the
    /// focus quest first, then the others in tracking order (GDD 02 7.2). Entries are reused between calls.
    /// </summary>
    public static class QuestTrackerModel
    {
        /// <summary>Fills the entries.</summary>
        /// <param name="quests">Quest service (null = none).</param>
        /// <param name="results">Reused entries; resized to the number of tracked quests.</param>
        /// <returns>Number of entries.</returns>
        public static int Collect(IQuestService quests, List<TrackedQuestEntry> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            int count = 0;
            if (quests != null)
            {
                string focus = quests.FocusQuestId ?? string.Empty;
                if (focus.Length > 0 && quests.IsTracked(focus))
                {
                    count = TryAdd(quests, focus, true, results, count);
                }

                IReadOnlyList<string> tracked = quests.TrackedQuestIds;
                for (int i = 0; i < tracked.Count && count < QuestService.MaxTrackedQuests; i++)
                {
                    if (tracked[i] != focus)
                    {
                        count = TryAdd(quests, tracked[i], false, results, count);
                    }
                }
            }

            if (results.Count > count)
            {
                results.RemoveRange(count, results.Count - count);
            }

            return count;
        }

        private static int TryAdd(IQuestService quests, string questId, bool focus, List<TrackedQuestEntry> results, int count)
        {
            if (!quests.TryGetInstance(questId, out QuestInstance instance) || !instance.IsActive || !quests.Catalog.TryGet(questId, out QuestSpec spec))
            {
                return count;
            }

            if (results.Count <= count)
            {
                results.Add(new TrackedQuestEntry());
            }

            TrackedQuestEntry entry = results[count];
            entry.QuestId = spec.Id;
            entry.Title = spec.Title.Length > 0 ? spec.Title : spec.Id;
            entry.CategoryClass = QuestLogRules.CategoryClass(spec.Category);
            entry.IsFocus = focus;
            QuestDetailsBuilder.CollectObjectives(quests, spec, instance, entry.Objectives);
            return count + 1;
        }
    }
}
