using System;
using System.Collections.Generic;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The tracked quests of the HUD (GDD 05 1.2 "Verfolgte Quests", top right): up to 3 quests with title, category colour,
    /// focus mark and objectives with counters ("Woelfe besiegen 1/3"). A fulfilled objective is ticked off with a short
    /// animation and stays visible for 1.5 s even if its stage ended in the same frame (<see cref="RecentObjectiveList"/>).
    /// </summary>
    /// <remarks>
    /// Rebuilds only when the quest revision changes or a lingering objective expires; the elements (TrackedQuest.uxml,
    /// ObjectiveRow.uxml) are reused, so the USS transition of the check mark plays. Visibility comes from
    /// <see cref="HudVisibilityRules.ShowQuests"/> via <see cref="HudView"/>.
    /// </remarks>
    public sealed class QuestTrackerView
    {
        private const int MaxShown = QuestService.MaxTrackedQuests + 1;

        private readonly VisualElement _container;
        private readonly VisualTreeAsset _trackedAsset;
        private readonly VisualTreeAsset _objectiveAsset;
        private readonly IQuestService _quests;
        private readonly List<TrackedQuestEntry> _entries = new List<TrackedQuestEntry>();
        private readonly List<string> _lingeringQuests = new List<string>();
        private readonly ObjectiveCheckTracker _checks = new ObjectiveCheckTracker();
        private readonly RecentObjectiveList _recent = new RecentObjectiveList();
        private int _revision = -1;
        private bool _dirty = true;

        /// <summary>Binds the view to the HUD element <c>hud-quests</c>.</summary>
        /// <param name="container">Element <c>hud-quests</c>.</param>
        /// <param name="trackedAsset">TrackedQuest.uxml.</param>
        /// <param name="objectiveAsset">ObjectiveRow.uxml.</param>
        /// <param name="quests">Quest service.</param>
        public QuestTrackerView(VisualElement container, VisualTreeAsset trackedAsset, VisualTreeAsset objectiveAsset, IQuestService quests)
        {
            _container = container ?? throw new ArgumentNullException(nameof(container));
            if (trackedAsset == null || objectiveAsset == null)
            {
                throw new ArgumentNullException(trackedAsset == null ? nameof(trackedAsset) : nameof(objectiveAsset));
            }

            _trackedAsset = trackedAsset;
            _objectiveAsset = objectiveAsset;
            _quests = quests ?? throw new ArgumentNullException(nameof(quests));
            UiElementUtility.SetDisplayed(_container, false);
        }

        /// <summary>Number of shown quests (after the last update).</summary>
        public int Count => _entries.Count;

        /// <summary>
        /// Lower edge of the tracker in panel coordinates, or 0 while hidden; the P1 messages move below it (GDD 05 1.7:
        /// "rechts unter der Questanzeige").
        /// </summary>
        public float BottomEdge
        {
            get
            {
                if (_entries.Count == 0 || _container.resolvedStyle.display == DisplayStyle.None)
                {
                    return 0f;
                }

                float bottom = _container.worldBound.yMax;
                return float.IsNaN(bottom) ? 0f : bottom;
            }
        }

        /// <summary>An objective changed (ObjectiveProgressed): a fulfilled one lingers ticked off for a moment.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveKey">Stage-qualified objective id.</param>
        /// <param name="current">Progress.</param>
        /// <param name="required">Required progress.</param>
        public void OnObjectiveProgressed(string questId, string objectiveKey, int current, int required)
        {
            if (current < required || !_quests.Catalog.TryGet(questId, out QuestSpec spec) ||
                !QuestLogRules.TrySplitObjectiveKey(objectiveKey, out string stageId, out string objectiveId) ||
                !QuestLogRules.TryGetObjective(spec, stageId, objectiveId, out QuestObjective objective))
            {
                return;
            }

            if (!_quests.IsTracked(questId) && !IsInEntries(questId))
            {
                return;
            }

            _recent.Add(questId, new QuestObjectiveLine(objectiveKey, QuestLogRules.ObjectiveText(objective), current, required, true, false, objective.IsOptional));
            _dirty = true;
        }

        /// <summary>Forgets shown states and lingering objectives (new or loaded game): nothing animates.</summary>
        public void Reset()
        {
            _checks.Forget();
            _recent.Clear();
            _dirty = true;
        }

        /// <summary>Updates the tracker.</summary>
        /// <param name="deltaTime">Unscaled frame time.</param>
        /// <param name="visible">True if the HUD rules show the tracker now.</param>
        public void Tick(float deltaTime, bool visible)
        {
            if (_recent.Tick(deltaTime))
            {
                _dirty = true;
            }

            bool flashEnded = _checks.Tick(deltaTime);
            if (_dirty || _quests.Revision != _revision)
            {
                _dirty = false;
                _revision = _quests.Revision;
                Rebuild();
            }
            else if (flashEnded)
            {
                ApplyFlashes();
            }

            UiElementUtility.SetDisplayed(_container, visible && _entries.Count > 0);
        }

        private void Rebuild()
        {
            QuestTrackerModel.Collect(_quests, _entries);
            for (int i = 0; i < _entries.Count; i++)
            {
                _recent.InsertMissing(_entries[i].QuestId, _entries[i].Objectives);
            }

            // A quest that just ended stays for the linger time with its last objective ticked off.
            _recent.CollectQuestIds(_lingeringQuests);
            for (int i = 0; i < _lingeringQuests.Count && _entries.Count < MaxShown; i++)
            {
                string questId = _lingeringQuests[i];
                if (IsInEntries(questId) || !_quests.Catalog.TryGet(questId, out QuestSpec spec))
                {
                    continue;
                }

                var entry = new TrackedQuestEntry
                {
                    QuestId = spec.Id, Title = spec.Title.Length > 0 ? spec.Title : spec.Id, CategoryClass = QuestLogRules.CategoryClass(spec.Category), IsFocus = false
                };
                _recent.InsertMissing(questId, entry.Objectives);
                _entries.Add(entry);
            }

            while (_container.childCount < _entries.Count)
            {
                _trackedAsset.CloneTree(_container);
            }

            for (int i = 0; i < _container.childCount; i++)
            {
                VisualElement element = _container[i];
                bool used = i < _entries.Count;
                UiElementUtility.SetDisplayed(element, used);
                if (used)
                {
                    Bind(element, _entries[i]);
                }
            }
        }

        private void Bind(VisualElement element, TrackedQuestEntry entry)
        {
            UiElementUtility.SetText(element.Q<Label>("tracked-title"), entry.Title);
            element.EnableInClassList("is-focus", entry.IsFocus);
            VisualElement marker = element.Q<VisualElement>("tracked-marker");
            if (marker != null)
            {
                for (int c = 0; c < QuestLogRules.AllCategoryClasses.Length; c++)
                {
                    marker.EnableInClassList(QuestLogRules.AllCategoryClasses[c], QuestLogRules.AllCategoryClasses[c] == entry.CategoryClass);
                }
            }

            VisualElement objectives = element.Q<VisualElement>("tracked-objectives");
            ObjectiveRowView.EnsureRows(objectives, _objectiveAsset, entry.Objectives.Count);
            for (int o = 0; o < entry.Objectives.Count; o++)
            {
                QuestObjectiveLine line = entry.Objectives[o];
                string key = ObjectiveCheckTracker.KeyOf(entry.QuestId, line.Key);
                _checks.Observe(key, line.Done);
                ObjectiveRowView.Bind(objectives[o], line, _checks.IsFlashing(key));
            }
        }

        private void ApplyFlashes()
        {
            for (int i = 0; i < _entries.Count && i < _container.childCount; i++)
            {
                VisualElement objectives = _container[i].Q<VisualElement>("tracked-objectives");
                List<QuestObjectiveLine> lines = _entries[i].Objectives;
                for (int o = 0; o < lines.Count && objectives != null && o < objectives.childCount; o++)
                {
                    objectives[o].EnableInClassList("is-just-done", _checks.IsFlashing(ObjectiveCheckTracker.KeyOf(_entries[i].QuestId, lines[o].Key)));
                }
            }
        }

        private bool IsInEntries(string questId)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].QuestId == questId)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
