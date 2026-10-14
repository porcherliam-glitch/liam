using System;
using System.Collections.Generic;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Fills <see cref="QuestDetails"/> and objective lines from the quest service (pure logic). Running quests show the text
    /// of the active stage, its visible objectives and "Bisher" (texts of earlier stages and decisions); finished quests show
    /// the text of the end stage as "Ausgang" (or "Gescheitert") and their decisions (GDD 02 6.4, 7.1).
    /// </summary>
    public static class QuestDetailsBuilder
    {
        /// <summary>Fills the details of a quest.</summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="questId">Quest id.</param>
        /// <param name="details">Target (cleared first).</param>
        /// <returns>False if the quest is unknown or not started (details stay empty).</returns>
        public static bool Fill(IQuestService quests, string questId, QuestDetails details)
        {
            if (details == null)
            {
                throw new ArgumentNullException(nameof(details));
            }

            details.Clear();
            if (quests == null || string.IsNullOrEmpty(questId) || !quests.Catalog.TryGet(questId, out QuestSpec spec) ||
                !quests.TryGetInstance(questId, out QuestInstance instance) || !QuestLogRules.IsListed(instance))
            {
                return false;
            }

            details.QuestId = spec.Id;
            details.Title = spec.Title.Length > 0 ? spec.Title : spec.Id;
            details.Meta = UiTexts.Format(UiTextKeys.QuestMeta, QuestLogRules.CategoryName(spec.Category), QuestLogRules.LevelText(spec.RecommendedLevel));
            details.Description = spec.Description;

            bool finished = instance.IsFinished;
            string currentStage = finished && instance.EndStageId.Length > 0 ? instance.EndStageId : instance.StageId;
            if (spec.TryGetStage(currentStage, out StageDefinition stage))
            {
                details.CurrentText = stage.JournalText;
            }

            if (!finished)
            {
                details.CurrentTitle = UiTexts.Get(UiTextKeys.QuestSectionCurrent);
                CollectObjectives(quests, spec, instance, details.Objectives);
                IReadOnlyList<string> visited = instance.VisitedStages;
                for (int i = 0; i < visited.Count; i++)
                {
                    if (visited[i] != currentStage && spec.TryGetStage(visited[i], out StageDefinition earlier) && earlier.JournalText.Length > 0)
                    {
                        details.History.Add(new QuestDetailLine(earlier.JournalText, QuestDetailLineKind.Stage));
                    }
                }
            }
            else
            {
                details.CurrentTitle = UiTexts.Get(instance.Status == QuestStatus.Failed ? UiTextKeys.QuestSectionFailed : UiTextKeys.QuestSectionOutcome);
            }

            List<QuestLedgerLine> ledger = quests.GetLedger(spec.Id);
            for (int i = 0; i < ledger.Count; i++)
            {
                details.History.Add(new QuestDetailLine(ledger[i].Text, ledger[i].IsConsequence ? QuestDetailLineKind.Consequence : QuestDetailLineKind.Decision));
            }

            if (details.History.Count > 0)
            {
                details.HistoryTitle = UiTexts.Get(finished ? UiTextKeys.QuestSectionDecisions : UiTextKeys.QuestSectionHistory);
            }

            if (details.CurrentText.Length == 0 && details.Objectives.Count == 0)
            {
                details.CurrentTitle = string.Empty;
            }

            return true;
        }

        /// <summary>
        /// The visible objectives of the active stage of a running quest in stage order (hidden objectives are left out; done
        /// ones stay, ticked off).
        /// </summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="spec">Quest data.</param>
        /// <param name="instance">Quest state.</param>
        /// <param name="results">Cleared and filled.</param>
        /// <returns>Number of lines.</returns>
        public static int CollectObjectives(IQuestService quests, QuestSpec spec, QuestInstance instance, List<QuestObjectiveLine> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            results.Clear();
            if (quests == null || spec == null || instance == null || !instance.IsActive || !spec.TryGetStage(instance.StageId, out StageDefinition stage))
            {
                return 0;
            }

            IReadOnlyList<ObjectiveState> states = instance.Objectives;
            for (int i = 0; i < states.Count; i++)
            {
                ObjectiveState state = states[i];
                int index = stage.IndexOfObjective(state.ObjectiveId);
                QuestObjective objective = index >= 0 ? stage.Objectives[index] : null;
                if (objective == null || !quests.IsObjectiveVisible(spec.Id, state.ObjectiveId))
                {
                    continue;
                }

                results.Add(new QuestObjectiveLine(QuestIds.StageObjectiveKey(stage.Id, state.ObjectiveId), QuestLogRules.ObjectiveText(objective),
                    state.Progress, state.Required, state.Done, state.Failed, objective.IsOptional));
            }

            return results.Count;
        }
    }
}
