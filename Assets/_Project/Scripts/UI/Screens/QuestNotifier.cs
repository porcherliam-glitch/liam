using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Turns quest and level events into on-screen messages (GDD 02 7.5, GDD 05 1.7), pure logic: new main quest and
    /// completed or failed quests as P0 banners; new quests, objective progress (at most one per quest every 2 s, the newest
    /// count is shown when the 2 s are over), finished objectives, new stages, bonus objectives and the hint "Im Questlog
    /// verfolgen" as P1. A level-up shows the P0 banner plus once a P1 hint to the new points.
    /// </summary>
    /// <remarks>
    /// <see cref="UIRoot"/> forwards the events and calls <see cref="Update"/> every frame. While <see cref="Enabled"/> is
    /// false (loading, main menu) events are ignored: a loaded game recounts its objectives without messages. Rewards are
    /// announced by their own events (experience, gold, items as P2).
    /// </remarks>
    public sealed class QuestNotifier
    {
        /// <summary>Minimum time between two progress messages of the same quest (s, GDD 02 7.5).</summary>
        public const double ProgressIntervalSeconds = 2d;

        /// <summary>Minimum time between two hints to new points (s): several level-ups at once give one hint.</summary>
        public const double PointsHintIntervalSeconds = 10d;

        /// <summary>Accent of quest messages (USS <c>af-toast--quest</c>).</summary>
        public const string QuestAccent = "quest";

        /// <summary>Accent of failed quests (USS <c>af-toast--quest-failed</c>).</summary>
        public const string FailedAccent = "quest-failed";

        private readonly IQuestService _quests;
        private readonly Action<Notification> _show;
        private readonly Dictionary<string, double> _lastProgress = new Dictionary<string, double>(StringComparer.Ordinal);
        private readonly Dictionary<string, string> _pending = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly List<string> _flush = new List<string>();
        private double _lastPointsHint = double.NegativeInfinity;

        /// <summary>Creates the notifier.</summary>
        /// <param name="quests">Quest service (titles, objective texts, tracking).</param>
        /// <param name="show">Receives the messages (UI manager <c>ShowToast</c>).</param>
        public QuestNotifier(IQuestService quests, Action<Notification> show)
        {
            _quests = quests ?? throw new ArgumentNullException(nameof(quests));
            _show = show ?? throw new ArgumentNullException(nameof(show));
        }

        /// <summary>False while loading or in the main menu: events are ignored.</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>Number of progress messages that wait for their 2 s.</summary>
        public int PendingCount => _pending.Count;

        /// <summary>QuestStarted: "Neue Hauptquest: …" (P0) or "Neue Quest: …" (P1).</summary>
        /// <param name="questId">Quest id.</param>
        public void OnQuestStarted(string questId)
        {
            if (!Enabled || !_quests.Catalog.TryGet(questId, out QuestSpec spec))
            {
                return;
            }

            if (spec.Category == QuestCategory.Main)
            {
                _show(Notification.Message(NotificationPriority.Milestone, UiTexts.Format(UiTextKeys.NoteQuestMain, TitleOf(spec)), QuestAccent));
            }
            else
            {
                _show(Notification.Message(NotificationPriority.Progress, UiTexts.Format(UiTextKeys.NoteQuestNew, TitleOf(spec)), QuestAccent));
            }
        }

        /// <summary>
        /// QuestStageChanged: the first stage of a quest that is not tracked gives "Im Questlog verfolgen: …" (the limit of 3 is
        /// reached, GDD 02 7.2); every later stage with an open objective gives "{Titel}: {neues Ziel}" (P1).
        /// </summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">New stage.</param>
        /// <param name="previousStageId">Previous stage (empty at the start).</param>
        public void OnStageChanged(string questId, string stageId, string previousStageId)
        {
            if (!Enabled || !_quests.Catalog.TryGet(questId, out QuestSpec spec) || !_quests.TryGetInstance(questId, out QuestInstance instance) ||
                !instance.IsActive)
            {
                return;
            }

            if (string.IsNullOrEmpty(previousStageId))
            {
                // Auto tracking runs after QuestStarted, so it is checked here, at the first stage.
                if (!_quests.IsTracked(questId))
                {
                    _show(Notification.Message(NotificationPriority.Progress, UiTexts.Format(UiTextKeys.NoteQuestUntracked, TitleOf(spec)), QuestAccent));
                }

                return;
            }

            if (!spec.TryGetStage(stageId, out StageDefinition stage) || stage.IsEndStage)
            {
                return;
            }

            string objective = FirstOpenObjective(spec, instance, stage);
            if (objective.Length > 0)
            {
                _pending.Remove(questId);
                _show(Notification.Message(NotificationPriority.Progress, UiTexts.Format(UiTextKeys.NoteQuestStage, TitleOf(spec), objective), QuestAccent));
            }
        }

        /// <summary>ObjectiveProgressed: progress "{Ziel} (n/m)", "Erledigt: {Ziel}" or "Bonus: {Ziel}" (P1).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveKey">Stage-qualified objective id (<c>s10.o1</c>).</param>
        /// <param name="current">Progress.</param>
        /// <param name="required">Required progress.</param>
        /// <param name="now">Time in seconds (unscaled).</param>
        public void OnObjectiveProgressed(string questId, string objectiveKey, int current, int required, double now)
        {
            if (!Enabled || !_quests.Catalog.TryGet(questId, out QuestSpec spec) ||
                !QuestLogRules.TrySplitObjectiveKey(objectiveKey, out string stageId, out string objectiveId) ||
                !QuestLogRules.TryGetObjective(spec, stageId, objectiveId, out QuestObjective objective))
            {
                return;
            }

            if (_quests.TryGetInstance(questId, out QuestInstance instance) && instance.IsActive && instance.StageId == stageId &&
                !_quests.IsObjectiveVisible(questId, objectiveId))
            {
                return;
            }

            string text = QuestLogRules.ObjectiveText(objective);
            bool done = current >= required;
            if (done)
            {
                string key = objective.IsOptional ? UiTextKeys.NoteQuestBonus : required > 1 ? UiTextKeys.NoteQuestProgress : UiTextKeys.NoteQuestObjectiveDone;
                string message = required > 1 && !objective.IsOptional
                    ? UiTexts.Format(key, text, Number(current), Number(required))
                    : UiTexts.Format(key, text);
                _pending.Remove(questId);
                _lastProgress[questId] = now;
                _show(Notification.Message(NotificationPriority.Progress, message, QuestAccent));
                return;
            }

            string progress = UiTexts.Format(UiTextKeys.NoteQuestProgress, text, Number(current), Number(required));
            if (_lastProgress.TryGetValue(questId, out double last) && now - last < ProgressIntervalSeconds)
            {
                _pending[questId] = progress;
                return;
            }

            _lastProgress[questId] = now;
            _show(Notification.Message(NotificationPriority.Progress, progress, QuestAccent));
        }

        /// <summary>QuestCompleted: "Quest abgeschlossen: …" (P0).</summary>
        /// <param name="questId">Quest id.</param>
        public void OnQuestCompleted(string questId)
        {
            _pending.Remove(questId ?? string.Empty);
            if (!Enabled || !_quests.Catalog.TryGet(questId, out QuestSpec spec))
            {
                return;
            }

            _show(Notification.Message(NotificationPriority.Milestone, UiTexts.Format(UiTextKeys.NoteQuestCompleted, TitleOf(spec)), QuestAccent));
        }

        /// <summary>QuestFailed: "Quest gescheitert: …" (P0).</summary>
        /// <param name="questId">Quest id.</param>
        public void OnQuestFailed(string questId)
        {
            _pending.Remove(questId ?? string.Empty);
            if (!Enabled || !_quests.Catalog.TryGet(questId, out QuestSpec spec))
            {
                return;
            }

            // TODO (failure reasons): GDD 02 7.5 adds the reason in one line once the reasons have German texts.
            _show(Notification.Message(NotificationPriority.Milestone, UiTexts.Format(UiTextKeys.NoteQuestFailed, TitleOf(spec)), FailedAccent));
        }

        /// <summary>LevelUp: the banner "Stufe n erreicht!" (P0) and, at most every 10 s, the hint to the new points (P1).</summary>
        /// <param name="newLevel">New level.</param>
        /// <param name="now">Time in seconds (unscaled).</param>
        public void OnLevelUp(int newLevel, double now)
        {
            if (!Enabled)
            {
                return;
            }

            _show(Notification.LevelUp(newLevel));
            if (now - _lastPointsHint >= PointsHintIntervalSeconds)
            {
                _lastPointsHint = now;
                _show(Notification.Message(NotificationPriority.Progress, UiTexts.Get(UiTextKeys.NoteLevelUpPoints), "levelup"));
            }
        }

        /// <summary>Shows progress messages whose 2 s are over.</summary>
        /// <param name="now">Time in seconds (unscaled).</param>
        public void Update(double now)
        {
            if (_pending.Count == 0)
            {
                return;
            }

            _flush.Clear();
            foreach (KeyValuePair<string, string> pair in _pending)
            {
                if (!_lastProgress.TryGetValue(pair.Key, out double last) || now - last >= ProgressIntervalSeconds)
                {
                    _flush.Add(pair.Key);
                }
            }

            for (int i = 0; i < _flush.Count; i++)
            {
                string questId = _flush[i];
                string text = _pending[questId];
                _pending.Remove(questId);
                _lastProgress[questId] = now;
                if (Enabled)
                {
                    _show(Notification.Message(NotificationPriority.Progress, text, QuestAccent));
                }
            }
        }

        /// <summary>Forgets waiting messages and timers (new or loaded game, main menu).</summary>
        public void Reset()
        {
            _pending.Clear();
            _lastProgress.Clear();
            _lastPointsHint = double.NegativeInfinity;
        }

        private string FirstOpenObjective(QuestSpec spec, QuestInstance instance, StageDefinition stage)
        {
            IReadOnlyList<ObjectiveState> states = instance.Objectives;
            for (int i = 0; i < states.Count; i++)
            {
                int index = stage.IndexOfObjective(states[i].ObjectiveId);
                QuestObjective objective = index >= 0 ? stage.Objectives[index] : null;
                if (objective != null && !states[i].Done && !objective.IsOptional && _quests.IsObjectiveVisible(spec.Id, states[i].ObjectiveId))
                {
                    return QuestLogRules.ObjectiveText(objective);
                }
            }

            return string.Empty;
        }

        private static string TitleOf(QuestSpec spec)
        {
            return spec.Title.Length > 0 ? spec.Title : spec.Id;
        }

        private static string Number(int value)
        {
            return value.ToString(CultureInfo.InvariantCulture);
        }
    }
}
