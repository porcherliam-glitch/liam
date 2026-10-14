using System;
using System.Collections.Generic;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Run-time state of one quest in one save (architecture 5.1 "QuestInstance { questId, status, stageId,
    /// objectiveStates[], startedAtPlaytime, visitedStages[], ledgerEntries[], tracked }"): status, active stage with its
    /// objective states, visited stages, fulfilled objectives of earlier stages, decisions, ledger entries, times and repeat
    /// data. Read-only for other systems; changed only by the <see cref="QuestService"/>. Saved by <see cref="QuestSaveable"/>.
    /// </summary>
    public sealed class QuestInstance
    {
        private readonly List<ObjectiveState> _objectives = new List<ObjectiveState>();
        private readonly List<string> _visitedStages = new List<string>();
        private readonly List<string> _ledger = new List<string>();
        private readonly Dictionary<string, string> _choices = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly HashSet<string> _completedObjectives = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Creates an instance (status unknown until started or loaded).</summary>
        /// <param name="questId">Quest id.</param>
        public QuestInstance(string questId)
        {
            QuestId = questId ?? string.Empty;
        }

        /// <summary>Quest id.</summary>
        public string QuestId { get; }

        /// <summary>Status.</summary>
        public QuestStatus Status { get; internal set; }

        /// <summary>Local id of the active stage (the last stage after the end).</summary>
        public string StageId { get; internal set; } = string.Empty;

        /// <summary>Objective states of the active stage (same order as the objectives of the stage).</summary>
        public IReadOnlyList<ObjectiveState> Objectives => _objectives;

        /// <summary>Visited stages in order (for "stage reached" and path coverage).</summary>
        public IReadOnlyList<string> VisitedStages => _visitedStages;

        /// <summary>Written ledger entries (local ids) in order.</summary>
        public IReadOnlyList<string> LedgerEntries => _ledger;

        /// <summary>Decisions: stage-qualified objective id (<c>s35.o1</c>) → option id.</summary>
        public IReadOnlyDictionary<string, string> Choices => _choices;

        /// <summary>Fulfilled objectives of all stages as stage-qualified ids (<c>s40.o4</c>).</summary>
        public IReadOnlyCollection<string> CompletedObjectives => _completedObjectives;

        /// <summary>Active playtime in seconds when the quest was started.</summary>
        public double StartedAtPlaytime { get; internal set; }

        /// <summary>Active playtime in seconds when the quest ended (0 while running).</summary>
        public double FinishedAtPlaytime { get; internal set; }

        /// <summary>End stage of the last run (outcome), empty while running.</summary>
        public string EndStageId { get; internal set; } = string.Empty;

        /// <summary>Reason id of a failure, empty otherwise.</summary>
        public string FailReasonId { get; internal set; } = string.Empty;

        /// <summary>Number of successful runs (repeatable quests).</summary>
        public int CompletionCount { get; internal set; }

        /// <summary>Playtime in seconds from which a repeatable quest can start again.</summary>
        public double AvailableAgainAtPlaytime { get; internal set; }

        /// <summary>Counts every stage change (detects stage changes made by actions).</summary>
        internal int Epoch { get; private set; }

        /// <summary>True while a stage check is queued in the quest service.</summary>
        internal bool CheckQueued { get; set; }

        /// <summary>True while the quest is active.</summary>
        public bool IsActive => Status == QuestStatus.Active;

        /// <summary>True after a successful or failed end.</summary>
        public bool IsFinished => Status == QuestStatus.Completed || Status == QuestStatus.Failed;

        /// <summary>Finds the state of an objective of the active stage.</summary>
        /// <param name="objectiveId">Local objective id.</param>
        /// <param name="state">State or null.</param>
        public bool TryGetObjective(string objectiveId, out ObjectiveState state)
        {
            for (int i = 0; i < _objectives.Count; i++)
            {
                if (_objectives[i].ObjectiveId == objectiveId)
                {
                    state = _objectives[i];
                    return true;
                }
            }

            state = null;
            return false;
        }

        /// <summary>True if the stage was visited in the current or an earlier run of this instance.</summary>
        /// <param name="stageId">Local stage id.</param>
        public bool HasVisited(string stageId)
        {
            return _visitedStages.Contains(stageId);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return QuestId + " (" + Status + ", " + StageId + ")";
        }

        internal void ResetForStart(double playtime)
        {
            Status = QuestStatus.Active;
            StageId = string.Empty;
            _objectives.Clear();
            _visitedStages.Clear();
            _ledger.Clear();
            _choices.Clear();
            _completedObjectives.Clear();
            StartedAtPlaytime = playtime;
            FinishedAtPlaytime = 0.0;
            EndStageId = string.Empty;
            FailReasonId = string.Empty;
            Epoch++;
        }

        internal void EnterStage(StageDefinition stage)
        {
            StageId = stage.Id;
            Epoch++;
            if (!_visitedStages.Contains(stage.Id))
            {
                _visitedStages.Add(stage.Id);
            }

            _objectives.Clear();
            IReadOnlyList<QuestObjective> objectives = stage.Objectives;
            for (int i = 0; i < objectives.Count; i++)
            {
                QuestObjective objective = objectives[i];
                var state = new ObjectiveState(objective != null ? objective.Id : "?" + i, objective != null ? objective.RequiredCount : 1);
                if (objective != null && objective.TimeLimitSeconds > 0f)
                {
                    state.TimerRemaining = objective.TimeLimitSeconds;
                }

                _objectives.Add(state);
            }
        }

        internal void Finish(QuestStatus status, string endStageId, string reasonId, double playtime)
        {
            Status = status;
            EndStageId = endStageId ?? string.Empty;
            FailReasonId = reasonId ?? string.Empty;
            FinishedAtPlaytime = playtime;
            Epoch++;
        }

        internal void SetObjectiveCompleted(string stageObjectiveKey, bool completed)
        {
            if (completed)
            {
                _completedObjectives.Add(stageObjectiveKey);
            }
            else
            {
                _completedObjectives.Remove(stageObjectiveKey);
            }
        }

        internal void SetChoice(string stageObjectiveKey, string optionId)
        {
            _choices[stageObjectiveKey] = optionId ?? string.Empty;
        }

        internal bool AddLedgerEntry(string entryId)
        {
            if (string.IsNullOrEmpty(entryId) || _ledger.Contains(entryId))
            {
                return false;
            }

            _ledger.Add(entryId);
            return true;
        }

        internal void LoadState(QuestStatus status, string stageId, IList<ObjectiveState> objectives, IList<string> visited, IList<string> ledger,
                                IDictionary<string, string> choices, IList<string> completedObjectives)
        {
            Status = status;
            StageId = stageId ?? string.Empty;
            Epoch++;
            _objectives.Clear();
            _visitedStages.Clear();
            _ledger.Clear();
            _choices.Clear();
            _completedObjectives.Clear();
            if (objectives != null)
            {
                _objectives.AddRange(objectives);
            }

            if (visited != null)
            {
                _visitedStages.AddRange(visited);
            }

            if (ledger != null)
            {
                _ledger.AddRange(ledger);
            }

            if (choices != null)
            {
                foreach (KeyValuePair<string, string> pair in choices)
                {
                    _choices[pair.Key] = pair.Value ?? string.Empty;
                }
            }

            if (completedObjectives != null)
            {
                for (int i = 0; i < completedObjectives.Count; i++)
                {
                    _completedObjectives.Add(completedObjectives[i]);
                }
            }
        }
    }
}
