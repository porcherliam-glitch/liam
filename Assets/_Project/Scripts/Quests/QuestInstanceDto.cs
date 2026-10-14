using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Saved state of one quest (architecture 9.3: <c>{ "questId", "status": "active", "stageId": "s20" }</c> plus objective
    /// states, visited stages, ledger, decisions, times and repeat data).
    /// </summary>
    [Preserve]
    public sealed class QuestInstanceDto
    {
        /// <summary>Quest id.</summary>
        public string QuestId = string.Empty;

        /// <summary>Status as text (<c>active</c>, <c>completed</c>, <c>failed</c>, <c>locked</c>).</summary>
        public string Status = string.Empty;

        /// <summary>Active (or last) stage.</summary>
        public string StageId = string.Empty;

        /// <summary>Objective states of the active stage.</summary>
        public List<ObjectiveStateDto> Objectives = new List<ObjectiveStateDto>();

        /// <summary>Visited stages in order.</summary>
        public List<string> VisitedStages = new List<string>();

        /// <summary>Fulfilled objectives of all stages (<c>s40.o4</c>).</summary>
        public List<string> CompletedObjectives = new List<string>();

        /// <summary>Objectives whose completion actions (bonus) already ran in this run (<c>s30.o2</c>).</summary>
        public List<string> BonusGiven = new List<string>();

        /// <summary>Ledger entries in order (<c>ledger.c1</c>).</summary>
        public List<string> Ledger = new List<string>();

        /// <summary>Decisions: <c>s35.o1</c> → option id.</summary>
        public Dictionary<string, string> Choices = new Dictionary<string, string>();

        /// <summary>Active playtime when started (seconds).</summary>
        public double StartedAt;

        /// <summary>Active playtime when finished (seconds, 0 while running).</summary>
        public double FinishedAt;

        /// <summary>End stage of the last run.</summary>
        public string EndStageId = string.Empty;

        /// <summary>Reason id of a failure.</summary>
        public string FailReason = string.Empty;

        /// <summary>Number of successful runs.</summary>
        public int CompletionCount;

        /// <summary>Playtime from which a repeatable quest can start again (seconds).</summary>
        public double AvailableAgainAt;

        /// <summary>True if tracked.</summary>
        public bool Tracked;
    }
}
