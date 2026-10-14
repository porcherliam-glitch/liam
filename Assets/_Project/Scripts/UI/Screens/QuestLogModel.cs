using System;
using System.Collections.Generic;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Builds the rows of a quest log tab from the quest service (pure logic, testable without Unity). Running quests: the
    /// focus quest first, then the other tracked quests in tracking order, then the rest in start order. "Abgeschlossen":
    /// newest end first (GDD 02 7.1).
    /// </summary>
    /// <remarks>
    /// TODO (later steps): sorting by act, faction, region or distance and the filter chips of GDD 02 7.1 need the map and
    /// faction data; timed quests at the top with an hourglass follow with deadlines.
    /// </remarks>
    public static class QuestLogModel
    {
        /// <summary>Fills the rows of a tab.</summary>
        /// <param name="quests">Quest service (null = no rows).</param>
        /// <param name="tab">Tab.</param>
        /// <param name="results">Cleared and filled.</param>
        /// <returns>Number of rows.</returns>
        public static int Collect(IQuestService quests, QuestLogTab tab, List<QuestLogEntry> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            results.Clear();
            if (quests == null)
            {
                return 0;
            }

            var listed = new List<QuestInstance>();
            IReadOnlyList<QuestInstance> instances = quests.Instances;
            for (int i = 0; i < instances.Count; i++)
            {
                QuestInstance instance = instances[i];
                if (QuestLogRules.IsListed(instance) && quests.Catalog.TryGet(instance.QuestId, out QuestSpec spec) &&
                    QuestLogRules.TabOf(spec, instance) == tab)
                {
                    listed.Add(instance);
                }
            }

            if (tab == QuestLogTab.Completed)
            {
                // Stable: equal end times keep the start order, newest end first.
                var order = new List<KeyValuePair<int, QuestInstance>>(listed.Count);
                for (int i = 0; i < listed.Count; i++)
                {
                    order.Add(new KeyValuePair<int, QuestInstance>(i, listed[i]));
                }

                order.Sort((a, b) =>
                {
                    int byTime = b.Value.FinishedAtPlaytime.CompareTo(a.Value.FinishedAtPlaytime);
                    return byTime != 0 ? byTime : b.Key.CompareTo(a.Key);
                });
                for (int i = 0; i < order.Count; i++)
                {
                    results.Add(CreateEntry(quests, order[i].Value));
                }

                return results.Count;
            }

            AddIf(quests, listed, results, id => id == quests.FocusQuestId);
            IReadOnlyList<string> tracked = quests.TrackedQuestIds;
            for (int t = 0; t < tracked.Count; t++)
            {
                string trackedId = tracked[t];
                AddIf(quests, listed, results, id => id == trackedId && id != quests.FocusQuestId);
            }

            AddIf(quests, listed, results, id => !quests.IsTracked(id) && id != quests.FocusQuestId);
            return results.Count;
        }

        /// <summary>Number of rows of a tab.</summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="tab">Tab.</param>
        public static int Count(IQuestService quests, QuestLogTab tab)
        {
            if (quests == null)
            {
                return 0;
            }

            int count = 0;
            IReadOnlyList<QuestInstance> instances = quests.Instances;
            for (int i = 0; i < instances.Count; i++)
            {
                QuestInstance instance = instances[i];
                if (QuestLogRules.IsListed(instance) && quests.Catalog.TryGet(instance.QuestId, out QuestSpec spec) &&
                    QuestLogRules.TabOf(spec, instance) == tab)
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>
        /// The tab the quest log opens with: the tab of the focus quest, otherwise the first tab with a running quest, otherwise
        /// "Abgeschlossen" if something is finished, otherwise "Haupt".
        /// </summary>
        /// <param name="quests">Quest service.</param>
        public static QuestLogTab DefaultTab(IQuestService quests)
        {
            if (quests == null)
            {
                return QuestLogTab.Main;
            }

            if (quests.FocusQuestId.Length > 0 && quests.TryGetInstance(quests.FocusQuestId, out QuestInstance focus) && focus.IsActive &&
                quests.Catalog.TryGet(focus.QuestId, out QuestSpec focusSpec))
            {
                return QuestLogRules.TabOf(focusSpec, focus);
            }

            for (int tab = 0; tab < QuestLogRules.TabCount; tab++)
            {
                if (Count(quests, (QuestLogTab)tab) > 0)
                {
                    return (QuestLogTab)tab;
                }
            }

            return QuestLogTab.Main;
        }

        /// <summary>Creates the row of a listed quest.</summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="instance">Quest state.</param>
        public static QuestLogEntry CreateEntry(IQuestService quests, QuestInstance instance)
        {
            if (quests == null || instance == null || !quests.Catalog.TryGet(instance.QuestId, out QuestSpec spec))
            {
                return new QuestLogEntry(instance != null ? instance.QuestId : string.Empty, instance != null ? instance.QuestId : string.Empty,
                    string.Empty, string.Empty, QuestLogRules.CategoryClass(QuestCategory.Side), false, false, false, false);
            }

            bool finished = instance.IsFinished;
            bool failed = instance.Status == QuestStatus.Failed;
            bool tracked = !finished && quests.IsTracked(spec.Id);
            bool focus = !finished && spec.Id == quests.FocusQuestId;
            string category = QuestLogRules.CategoryName(spec.Category);
            string info = finished ? category : UiTexts.Format(UiTextKeys.QuestRowInfo, category, QuestLogRules.LevelText(spec.RecommendedLevel));
            string badge = failed ? UiTexts.Get(UiTextKeys.QuestBadgeFailed)
                : finished ? UiTexts.Get(UiTextKeys.QuestBadgeDone)
                : focus ? UiTexts.Get(UiTextKeys.QuestBadgeFocus)
                : tracked ? UiTexts.Get(UiTextKeys.QuestBadgeTracked)
                : string.Empty;
            string title = spec.Title.Length > 0 ? spec.Title : spec.Id;
            return new QuestLogEntry(spec.Id, title, info, badge, QuestLogRules.CategoryClass(spec.Category), tracked, focus, finished, failed);
        }

        private static void AddIf(IQuestService quests, List<QuestInstance> listed, List<QuestLogEntry> results, Func<string, bool> predicate)
        {
            for (int i = 0; i < listed.Count; i++)
            {
                QuestInstance instance = listed[i];
                if (instance != null && predicate(instance.QuestId))
                {
                    results.Add(CreateEntry(quests, instance));
                    listed[i] = null;
                }
            }
        }
    }
}
