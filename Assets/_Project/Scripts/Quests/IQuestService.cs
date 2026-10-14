using System;
using System.Collections.Generic;

namespace Aetherfall.Quests
{
    /// <summary>
    /// The quest system (§16, architecture 11.7): starts quests (with start conditions), routes events to the objectives of
    /// active stages, changes stages (branches), ends quests with rewards or failure, handles repeatable quests and follow-up
    /// quests, tracks up to 3 quests (one focus quest) and keeps the decision ledger. Registered by <see cref="QuestInstaller"/>.
    /// </summary>
    /// <remarks>
    /// Global events: <c>QuestStarted</c>, <c>QuestStageChanged</c>, <c>ObjectiveProgressed</c>, <c>QuestCompleted</c>,
    /// <c>QuestFailed</c>, <c>QuestAvailabilityChanged</c>. The local C# event <see cref="Changed"/> is for UI views (journal,
    /// HUD tracker). The methods marked "debug" are the test functions of GDD 02 10.3 for the debug console and editor tools.
    /// Main thread only.
    /// </remarks>
    public interface IQuestService
    {
        /// <summary>Raised after every change of quest state, tracking or ledger (also after loading).</summary>
        event Action Changed;

        /// <summary>Counter that grows with every change.</summary>
        int Revision { get; }

        /// <summary>All quest data.</summary>
        QuestCatalog Catalog { get; }

        /// <summary>All quests with state (active, finished) in start order.</summary>
        IReadOnlyList<QuestInstance> Instances { get; }

        /// <summary>Tracked quests (at most <see cref="QuestService.MaxTrackedQuests"/>) in tracking order.</summary>
        IReadOnlyList<string> TrackedQuestIds { get; }

        /// <summary>The focus quest (big compass marker), empty if none.</summary>
        string FocusQuestId { get; }

        /// <summary>
        /// Life cycle status (unknown, available, active, completed, failed; GDD 02 4.3). A finished repeatable quest reads
        /// "available" again once its cool-down is over and its giver offers it.
        /// </summary>
        /// <param name="questId">Quest id.</param>
        QuestStatus GetStatus(string questId);

        /// <summary>
        /// The quests a giver offers now (available and not hidden), sorted by id - the pull side of the giver symbols ("!").
        /// Symbols read it when they become active (<c>OnEnable</c>, a streamed-in cell) and after <c>GameLoaded</c>, and follow
        /// <c>QuestAvailabilityChanged</c> only for changes: after a load only differences are announced.
        /// </summary>
        /// <param name="giverId">NPC or object id of the giver; empty = all givers.</param>
        /// <param name="results">Cleared and filled with quest ids (no allocation if the list is reused).</param>
        /// <returns>Number of quests.</returns>
        int GetAvailableQuestIds(string giverId, List<string> results);

        /// <summary>Finds the state of a quest that was started at least once.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="instance">Instance or null.</param>
        bool TryGetInstance(string questId, out QuestInstance instance);

        /// <summary>True if the quest can be started now (exists, not running, not finished unless repeatable, conditions hold).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="reason">German reason if not.</param>
        bool CanStart(string questId, out string reason);

        /// <summary>Starts a quest if <see cref="CanStart"/> allows it.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="sourceId">Who starts it (dialogue, item, quest, <c>console</c>) for logs.</param>
        bool TryStart(string questId, string sourceId);

        /// <summary>Debug: starts a quest even if its start conditions do not hold ("Startbedingungen erzwingen").</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="sourceId">Source for logs.</param>
        bool TryStartForced(string questId, string sourceId);

        /// <summary>Jumps an active quest to a stage (action <c>SetQuestStage</c>, debug "Zu Stage springen").</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">Local stage id.</param>
        /// <param name="sourceId">Source for logs.</param>
        bool TrySetStage(string questId, string stageId, string sourceId);

        /// <summary>Ends an active quest successfully at its current stage (action <c>CompleteQuest</c>).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="sourceId">Source for logs.</param>
        bool TryComplete(string questId, string sourceId);

        /// <summary>Lets an active quest fail (action <c>FailQuest</c>).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="reasonId">Reason id.</param>
        bool TryFail(string questId, string reasonId);

        /// <summary>Debug: fulfils an objective of the active stage ("Ziel erfuellen").</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveId">Local objective id.</param>
        bool TryCompleteObjective(string questId, string objectiveId);

        /// <summary>Debug: sets the counter of an objective of the active stage.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveId">Local objective id.</param>
        /// <param name="progress">New progress.</param>
        bool TrySetObjectiveProgress(string questId, string objectiveId, int progress);

        /// <summary>Debug: forgets a quest and resets the flags it wrote ("Quest zuruecksetzen").</summary>
        /// <param name="questId">Quest id.</param>
        bool ResetQuest(string questId);

        /// <summary>True if the quest has visited the stage.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">Local stage id.</param>
        bool IsStageReached(string questId, string stageId);

        /// <summary>True if an objective is fulfilled (empty stage = the active stage).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">Local stage id or empty.</param>
        /// <param name="objectiveId">Local objective id.</param>
        bool IsObjectiveDone(string questId, string stageId, string objectiveId);

        /// <summary>
        /// True if an objective of the active stage is shown to the player: it exists and its visibility condition holds
        /// (hidden objectives such as an optional bonus that appears later are not shown in the journal and the HUD).
        /// </summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveId">Local objective id.</param>
        bool IsObjectiveVisible(string questId, string objectiveId);

        /// <summary>Reads a decision of a choose objective.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageObjectiveKey">Stage-qualified objective id (<c>s35_gnade.o1</c>).</param>
        /// <param name="optionId">Chosen option.</param>
        bool TryGetChoice(string questId, string stageObjectiveKey, out string optionId);

        /// <summary>Writes a ledger entry (action <c>AddLedgerEntry</c>; also for finished quests: consequence entries).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="entryId">Local ledger id.</param>
        bool AddLedgerEntry(string questId, string entryId);

        /// <summary>Visible ledger lines of a quest (entries whose visibility condition holds).</summary>
        /// <param name="questId">Quest id.</param>
        List<QuestLedgerLine> GetLedger(string questId);

        /// <summary>True if the quest is tracked.</summary>
        /// <param name="questId">Quest id.</param>
        bool IsTracked(string questId);

        /// <summary>Tracks or untracks an active quest (at most 3 tracked).</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="tracked">True to track.</param>
        /// <returns>False if the quest is not active or the limit is reached.</returns>
        bool TrySetTracked(string questId, bool tracked);

        /// <summary>Makes a tracked (or trackable) active quest the focus quest.</summary>
        /// <param name="questId">Quest id.</param>
        bool TrySetFocus(string questId);
    }
}
