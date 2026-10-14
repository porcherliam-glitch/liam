namespace Aetherfall.Quests
{
    /// <summary>
    /// Run-time state of one objective of the active stage (architecture 11.7 "ObjectiveState { objectiveId, progress, done,
    /// timerRemaining, extra }"), part of <see cref="QuestInstance"/> and the save. Changed only through
    /// <see cref="ObjectiveRuntime"/> and the quest service; the objective objects of the asset never hold state.
    /// </summary>
    public sealed class ObjectiveState
    {
        /// <summary>Creates the state.</summary>
        /// <param name="objectiveId">Local objective id.</param>
        /// <param name="required">Required progress.</param>
        public ObjectiveState(string objectiveId, int required)
        {
            ObjectiveId = objectiveId ?? string.Empty;
            Required = required < 1 ? 1 : required;
        }

        /// <summary>Local objective id (<c>o1</c>).</summary>
        public string ObjectiveId { get; }

        /// <summary>Required progress (from the objective; at least 1).</summary>
        public int Required { get; internal set; }

        /// <summary>Current progress.</summary>
        public int Progress { get; internal set; }

        /// <summary>True if the objective is fulfilled.</summary>
        public bool Done { get; internal set; }

        /// <summary>True if the objective can no longer be fulfilled (timer ran out, detected …).</summary>
        public bool Failed { get; internal set; }

        /// <summary>Remaining seconds of a time limit (0 = none or expired).</summary>
        public float TimerRemaining { get; internal set; }

        /// <summary>Free text state of the objective (inspected clue ids, chosen option …).</summary>
        public string Extra { get; internal set; } = string.Empty;

        /// <summary>True once the completion actions (bonus) ran; they run only once even if the objective regresses.</summary>
        public bool BonusGiven { get; internal set; }

        /// <inheritdoc />
        public override string ToString()
        {
            return ObjectiveId + " " + Progress + "/" + Required + (Done ? " erfüllt" : string.Empty) + (Failed ? " gescheitert" : string.Empty);
        }
    }
}
