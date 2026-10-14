using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.SaveSystem;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Saves and restores the section <c>quests</c> (architecture 9.2, load order 100, after every system the quests read):
    /// quest states with the objective states of the active stage, visited stages, ledger, decisions, tracking and focus.
    /// <see cref="ISaveable.Load"/> only sets state; the objectives are bound again in <see cref="OnAfterLoad"/>.
    /// </summary>
    /// <remarks>
    /// Saved quests whose definition no longer exists are kept unchanged and written again (no data loss while content is
    /// missing). If the objectives of a stage changed since the save, they are matched by id: new objectives start at 0.
    /// </remarks>
    public sealed class QuestSaveable : Saveable<QuestsDto>, IPostLoad
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "quests";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 100;

        private readonly QuestService _service;
        private readonly List<QuestInstanceDto> _orphans = new List<QuestInstanceDto>();

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Quest service.</param>
        public QuestSaveable(QuestService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <summary>Number of kept saved quests without definition.</summary>
        public int OrphanCount => _orphans.Count;

        /// <inheritdoc />
        public void OnAfterLoad(in LoadContext ctx)
        {
            _service.CompleteLoad();
        }

        /// <inheritdoc />
        protected override QuestsDto Capture()
        {
            var dto = new QuestsDto { FocusQuestId = _service.FocusQuestId };
            IReadOnlyList<QuestInstance> instances = _service.Instances;
            for (int i = 0; i < instances.Count; i++)
            {
                dto.Instances.Add(ToDto(instances[i], _service.IsTracked(instances[i].QuestId)));
            }

            dto.Instances.AddRange(_orphans);
            return dto;
        }

        /// <inheritdoc />
        protected override void Restore(QuestsDto data, in LoadContext ctx)
        {
            _service.ClearState();
            _orphans.Clear();
            if (data == null || data.Instances == null)
            {
                return;
            }

            for (int i = 0; i < data.Instances.Count; i++)
            {
                QuestInstanceDto entry = data.Instances[i];
                if (entry == null || string.IsNullOrEmpty(entry.QuestId))
                {
                    continue;
                }

                if (!_service.Catalog.TryGet(entry.QuestId, out QuestSpec spec))
                {
                    Log.Warning(LogCategory.Save, "Quests: saved quest '" + entry.QuestId + "' has no definition and is kept unchanged.");
                    _orphans.Add(entry);
                    continue;
                }

                if (!QuestStatusIds.TryParse(entry.Status, out QuestStatus status))
                {
                    Log.Warning(LogCategory.Save, "Quests: unknown status '" + entry.Status + "' of '" + entry.QuestId + "'; the entry is kept unchanged.");
                    _orphans.Add(entry);
                    continue;
                }

                _service.RestoreInstance(FromDto(entry, spec, status), entry.Tracked);
            }

            _service.RestoreFocus(data.FocusQuestId);
        }

        private static QuestInstanceDto ToDto(QuestInstance instance, bool tracked)
        {
            var dto = new QuestInstanceDto
            {
                QuestId = instance.QuestId,
                Status = QuestStatusIds.ToId(instance.Status),
                StageId = instance.StageId,
                StartedAt = instance.StartedAtPlaytime,
                FinishedAt = instance.FinishedAtPlaytime,
                EndStageId = instance.EndStageId,
                FailReason = instance.FailReasonId,
                CompletionCount = instance.CompletionCount,
                AvailableAgainAt = instance.AvailableAgainAtPlaytime,
                Tracked = tracked
            };

            IReadOnlyList<ObjectiveState> objectives = instance.Objectives;
            for (int i = 0; i < objectives.Count; i++)
            {
                ObjectiveState state = objectives[i];
                dto.Objectives.Add(new ObjectiveStateDto
                {
                    Id = state.ObjectiveId,
                    Progress = state.Progress,
                    Done = state.Done,
                    Failed = state.Failed,
                    TimerRemaining = state.TimerRemaining,
                    Extra = state.Extra,
                    BonusGiven = state.BonusGiven
                });
            }

            dto.VisitedStages.AddRange(instance.VisitedStages);
            dto.Ledger.AddRange(instance.LedgerEntries);
            foreach (string key in instance.CompletedObjectives)
            {
                dto.CompletedObjectives.Add(key);
            }

            dto.CompletedObjectives.Sort(string.CompareOrdinal);
            foreach (KeyValuePair<string, string> pair in instance.Choices)
            {
                dto.Choices[pair.Key] = pair.Value;
            }

            return dto;
        }

        private static QuestInstance FromDto(QuestInstanceDto dto, QuestSpec spec, QuestStatus status)
        {
            var instance = new QuestInstance(dto.QuestId);
            List<ObjectiveState> objectives = BuildObjectiveStates(dto, spec, status);
            instance.LoadState(status, dto.StageId, objectives, dto.VisitedStages, dto.Ledger, dto.Choices, dto.CompletedObjectives);
            instance.StartedAtPlaytime = dto.StartedAt;
            instance.FinishedAtPlaytime = dto.FinishedAt;
            instance.EndStageId = dto.EndStageId ?? string.Empty;
            instance.FailReasonId = dto.FailReason ?? string.Empty;
            instance.CompletionCount = dto.CompletionCount;
            instance.AvailableAgainAtPlaytime = dto.AvailableAgainAt;
            return instance;
        }

        private static List<ObjectiveState> BuildObjectiveStates(QuestInstanceDto dto, QuestSpec spec, QuestStatus status)
        {
            var result = new List<ObjectiveState>();
            List<ObjectiveStateDto> saved = dto.Objectives ?? new List<ObjectiveStateDto>();
            if (status == QuestStatus.Active && spec.TryGetStage(dto.StageId, out StageDefinition stage))
            {
                IReadOnlyList<QuestObjective> objectives = stage.Objectives;
                for (int i = 0; i < objectives.Count; i++)
                {
                    QuestObjective objective = objectives[i];
                    string id = objective != null ? objective.Id : "?" + i;
                    var state = new ObjectiveState(id, objective != null ? objective.RequiredCount : 1);
                    ObjectiveStateDto match = Find(saved, id);
                    if (match != null)
                    {
                        Apply(state, match);
                    }
                    else if (objective != null && objective.TimeLimitSeconds > 0f)
                    {
                        state.TimerRemaining = objective.TimeLimitSeconds;
                    }

                    result.Add(state);
                }

                return result;
            }

            for (int i = 0; i < saved.Count; i++)
            {
                if (saved[i] == null)
                {
                    continue;
                }

                var state = new ObjectiveState(saved[i].Id, Math.Max(1, saved[i].Progress));
                Apply(state, saved[i]);
                result.Add(state);
            }

            return result;
        }

        private static void Apply(ObjectiveState state, ObjectiveStateDto dto)
        {
            state.Progress = Math.Max(0, Math.Min(state.Required, dto.Progress));
            state.Done = dto.Done;
            state.Failed = dto.Failed && !dto.Done;
            state.TimerRemaining = Math.Max(0f, dto.TimerRemaining);
            state.Extra = dto.Extra ?? string.Empty;
            state.BonusGiven = dto.BonusGiven;
        }

        private static ObjectiveStateDto Find(List<ObjectiveStateDto> saved, string id)
        {
            for (int i = 0; i < saved.Count; i++)
            {
                if (saved[i] != null && saved[i].Id == id)
                {
                    return saved[i];
                }
            }

            return null;
        }
    }
}
