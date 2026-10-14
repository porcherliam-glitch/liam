// Global events of the quest system (architecture 4.3, events #19-#22 and "ObjectiveProgressed",
// "QuestAvailabilityChanged" of the quests area). Several event structs of one area may share a file (architecture 15.2,
// rule 18). Sender of all of them: Aetherfall.Quests.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>A quest was started (accepted or started automatically). Receivers: UI, telemetry, condition watcher.</summary>
    public readonly struct QuestStarted : IGameEvent
    {
        /// <summary>Quest id, e.g. <c>quest.side.eichental.woelfe_vom_nordhang</c>.</summary>
        public readonly string QuestId;

        /// <summary>Creates the event.</summary>
        /// <param name="questId">Quest id.</param>
        public QuestStarted(string questId)
        {
            QuestId = questId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "QuestStarted(" + QuestId + ")";
        }
    }

    /// <summary>
    /// An active quest entered a stage (also the start stage). Receivers: UI (journal, notification), autosave, condition
    /// watcher.
    /// </summary>
    public readonly struct QuestStageChanged : IGameEvent
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Local id of the new stage, e.g. <c>s20</c>.</summary>
        public readonly string StageId;

        /// <summary>Local id of the previous stage; empty for the start stage.</summary>
        public readonly string PreviousStageId;

        /// <summary>Creates the event.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">New stage.</param>
        /// <param name="previousStageId">Previous stage or empty.</param>
        public QuestStageChanged(string questId, string stageId, string previousStageId)
        {
            QuestId = questId ?? string.Empty;
            StageId = stageId ?? string.Empty;
            PreviousStageId = previousStageId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "QuestStageChanged(" + QuestId + ": " + (PreviousStageId.Length > 0 ? PreviousStageId : "-") + " -> " + StageId + ")";
        }
    }

    /// <summary>A quest ended successfully. Receivers: UI, autosave, telemetry, condition watcher.</summary>
    public readonly struct QuestCompleted : IGameEvent
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Local id of the end stage that finished the quest (the outcome, e.g. <c>s50_zerstoert</c>).</summary>
        public readonly string EndStageId;

        /// <summary>Creates the event.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="endStageId">End stage.</param>
        public QuestCompleted(string questId, string endStageId)
        {
            QuestId = questId ?? string.Empty;
            EndStageId = endStageId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "QuestCompleted(" + QuestId + " at " + EndStageId + ")";
        }
    }

    /// <summary>A quest failed. Receivers: UI, telemetry, condition watcher.</summary>
    public readonly struct QuestFailed : IGameEvent
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Reason id (fail rule, failure end stage or <c>debug</c>).</summary>
        public readonly string ReasonId;

        /// <summary>Creates the event.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="reasonId">Reason id.</param>
        public QuestFailed(string questId, string reasonId)
        {
            QuestId = questId ?? string.Empty;
            ReasonId = reasonId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "QuestFailed(" + QuestId + ", " + ReasonId + ")";
        }
    }

    /// <summary>
    /// The progress of an objective of an active stage changed (counter, done, failed). Receivers: UI (notification
    /// "{Ziel} ({n}/{m})", HUD tracker), condition watcher.
    /// </summary>
    public readonly struct ObjectiveProgressed : IGameEvent
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Stage-qualified objective id <c>&lt;stage&gt;.&lt;objective&gt;</c>, e.g. <c>s20.o1</c> (GDD 02, 2.3).</summary>
        public readonly string ObjectiveId;

        /// <summary>Current progress.</summary>
        public readonly int Current;

        /// <summary>Progress needed to be done.</summary>
        public readonly int Required;

        /// <summary>Creates the event.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="objectiveId">Stage-qualified objective id.</param>
        /// <param name="current">Current progress.</param>
        /// <param name="required">Required progress.</param>
        public ObjectiveProgressed(string questId, string objectiveId, int current, int required)
        {
            QuestId = questId ?? string.Empty;
            ObjectiveId = objectiveId ?? string.Empty;
            Current = current;
            Required = required;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ObjectiveProgressed(" + QuestId + " " + ObjectiveId + ": " + Current + "/" + Required + ")";
        }
    }

    /// <summary>
    /// Whether a not yet started quest can be accepted changed (its start conditions became true or false). Receivers: NPC
    /// quest giver symbols, UI. Not sent for hidden quests (GDD 02, 7.6).
    /// </summary>
    public readonly struct QuestAvailabilityChanged : IGameEvent
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Quest giver (NPC or object id); empty if the quest has none.</summary>
        public readonly string GiverId;

        /// <summary>True if the quest can be accepted now.</summary>
        public readonly bool Available;

        /// <summary>Creates the event.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="giverId">Giver id.</param>
        /// <param name="available">True if available.</param>
        public QuestAvailabilityChanged(string questId, string giverId, bool available)
        {
            QuestId = questId ?? string.Empty;
            GiverId = giverId ?? string.Empty;
            Available = available;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "QuestAvailabilityChanged(" + QuestId + " at '" + GiverId + "': " + Available + ")";
        }
    }
}
