using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Quests
{
    /// <summary>
    /// What a quest marker points at for an open objective (S60 compass, S63 map; GDD 02 7.3): its own marker ids if the
    /// designer set some, otherwise the target the objective type implies — the place of "Gehe zu", the NPC of "Rede mit" and
    /// "Bringe", the objects of "Interagiere" and "Treffe", the clues of "Untersuche", the enemy or boss of "Töte bestimmten",
    /// the next node of "Folge der Spur" (<see cref="WorldMarkerIds.TrailNode"/>). Objects and clues the objective has counted
    /// already drop out one by one. Objectives without a place ("Töte 5 Wölfe", "Sammle") give nothing. Pure logic.
    /// </summary>
    public static class ObjectiveTargets
    {
        /// <summary>Adds the target ids of an objective (nothing if it is done or failed).</summary>
        /// <param name="objective">Objective definition.</param>
        /// <param name="state">Its progress in the running quest (null: not started).</param>
        /// <param name="result">Receives the ids.</param>
        public static void Collect(QuestObjective objective, ObjectiveState state, List<string> result)
        {
            if (objective == null || result == null || (state != null && (state.Done || state.Failed)))
            {
                return;
            }

            if (objective.MarkerIds != null && objective.MarkerIds.Count > 0)
            {
                AddAll(objective.MarkerIds, result, null);
                return;
            }

            switch (objective)
            {
                case GoToObjective goTo:
                    Add(goTo.LocationId, result, null);
                    break;
                case ReachInTimeObjective reach:
                    Add(reach.LocationId, result, null);
                    break;
                case TalkToObjective talk:
                    Add(talk.NpcId, result, null);
                    break;
                case DeliverItemObjective deliver:
                    Add(deliver.NpcId, result, null);
                    break;
                case InteractObjective interact:
                    AddAll(interact.ObjectIds, result, state);
                    break;
                case HitTargetObjective hit:
                    AddAll(hit.TargetIds, result, null);
                    break;
                case InspectCluesObjective clues:
                    AddAll(clues.ClueIds, result, state);
                    break;
                case KillSpecificObjective kill:
                    Add(kill.TargetId, result, null);
                    break;
                case FollowTrailObjective trail:
                    // Progress counts the reached nodes (index + 1), so the next node has the index Progress.
                    Add(WorldMarkerIds.TrailNode(trail.TrailId, state != null ? state.Progress : 0), result, null);
                    break;
            }
        }

        /// <summary>
        /// Adds the ids an objective has counted already ("Untersuche", "Interagiere": every object counts once), so markers of
        /// a group such as <c>obj.eichental.strohziel_*</c> can leave out the ones that are done.
        /// </summary>
        /// <param name="state">Progress of the objective (null: nothing).</param>
        /// <param name="result">Receives the ids.</param>
        public static void CollectCounted(ObjectiveState state, ICollection<string> result)
        {
            if (state == null || result == null || string.IsNullOrEmpty(state.Extra))
            {
                return;
            }

            string[] parts = state.Extra.Split(ObjectiveRuntime.ListSeparator);
            for (int i = 0; i < parts.Length; i++)
            {
                if (parts[i].Length > 0)
                {
                    result.Add(parts[i]);
                }
            }
        }

        private static void AddAll(IReadOnlyList<string> ids, List<string> result, ObjectiveState countedIn)
        {
            if (ids == null)
            {
                return;
            }

            for (int i = 0; i < ids.Count; i++)
            {
                Add(ids[i], result, countedIn);
            }
        }

        private static void Add(string id, List<string> result, ObjectiveState countedIn)
        {
            if (string.IsNullOrEmpty(id) || result.Contains(id) || IsCounted(countedIn, id))
            {
                return;
            }

            result.Add(id);
        }

        private static bool IsCounted(ObjectiveState state, string id)
        {
            if (state == null || string.IsNullOrEmpty(state.Extra))
            {
                return false;
            }

            string extra = state.Extra;
            int start = 0;
            while (start <= extra.Length)
            {
                int end = extra.IndexOf(ObjectiveRuntime.ListSeparator, start);
                if (end < 0)
                {
                    end = extra.Length;
                }

                if (end - start == id.Length && string.CompareOrdinal(extra, start, id, 0, id.Length) == 0)
                {
                    return true;
                }

                start = end + 1;
            }

            return false;
        }
    }
}
