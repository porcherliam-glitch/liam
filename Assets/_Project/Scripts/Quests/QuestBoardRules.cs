using System.Collections.Generic;

namespace Aetherfall.Quests
{
    /// <summary>
    /// What a quest giver object (notice board, letter, sign; <see cref="QuestBoard"/>) can do now: the first quest it offers
    /// and the active quest that waits for an interaction with it (turn-in, "zur Tafel zurueck"). Pure logic on top of
    /// <see cref="IQuestService"/>.
    /// </summary>
    public static class QuestBoardRules
    {
        /// <summary>The first quest the giver offers now (available, not hidden, sorted by id), or empty.</summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="giverId">Object id of the giver.</param>
        /// <param name="scratch">Reused list (cleared).</param>
        public static string FindOffer(IQuestService quests, string giverId, List<string> scratch)
        {
            if (quests == null || string.IsNullOrEmpty(giverId))
            {
                return string.Empty;
            }

            scratch.Clear();
            return quests.GetAvailableQuestIds(giverId, scratch) > 0 ? scratch[0] : string.Empty;
        }

        /// <summary>
        /// The first active quest whose active stage has an unfulfilled "Interagiere mit Objekt" objective for this object, or
        /// empty.
        /// </summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="objectId">Object id of the giver.</param>
        public static string FindTurnIn(IQuestService quests, string objectId)
        {
            if (quests == null || string.IsNullOrEmpty(objectId))
            {
                return string.Empty;
            }

            IReadOnlyList<QuestInstance> instances = quests.Instances;
            for (int i = 0; i < instances.Count; i++)
            {
                QuestInstance instance = instances[i];
                if (!instance.IsActive || !quests.Catalog.TryGet(instance.QuestId, out QuestSpec spec) ||
                    !spec.TryGetStage(instance.StageId, out StageDefinition stage))
                {
                    continue;
                }

                for (int o = 0; o < stage.Objectives.Count; o++)
                {
                    if (stage.Objectives[o] is InteractObjective interact && interact.Matches(objectId) &&
                        (!instance.TryGetObjective(interact.Id, out ObjectiveState state) || !state.Done))
                    {
                        return instance.QuestId;
                    }
                }
            }

            return string.Empty;
        }

        /// <summary>Title of a quest, or its id if it has none.</summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="questId">Quest id.</param>
        public static string TitleOf(IQuestService quests, string questId)
        {
            return quests != null && quests.Catalog.TryGet(questId, out QuestSpec spec) && spec.Title.Length > 0 ? spec.Title : questId ?? string.Empty;
        }
    }
}
