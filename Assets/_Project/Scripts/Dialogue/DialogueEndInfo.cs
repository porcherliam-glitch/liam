namespace Aetherfall.Dialogue
{
    /// <summary>
    /// How a conversation ended (<see cref="IDialogueService.Ended"/>): dialogue, partner, exit id (empty if cancelled) and the
    /// follow-up (open trade, begin a fight). The global event <c>DialogOutcome</c> carries the same ids.
    /// </summary>
    public readonly struct DialogueEndInfo
    {
        /// <summary>Started dialogue.</summary>
        public readonly string DialogueId;

        /// <summary>Conversation partner.</summary>
        public readonly string NpcId;

        /// <summary>Exit id; empty if cancelled.</summary>
        public readonly string ExitId;

        /// <summary>Follow-up.</summary>
        public readonly DialogueFollowUp FollowUp;

        /// <summary>True if the conversation was cancelled (B / Esc, load, error).</summary>
        public readonly bool Cancelled;

        /// <summary>Creates the info.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="exitId">Exit id.</param>
        /// <param name="followUp">Follow-up.</param>
        /// <param name="cancelled">True if cancelled.</param>
        public DialogueEndInfo(string dialogueId, string npcId, string exitId, DialogueFollowUp followUp, bool cancelled)
        {
            DialogueId = dialogueId ?? string.Empty;
            NpcId = npcId ?? string.Empty;
            ExitId = exitId ?? string.Empty;
            FollowUp = followUp;
            Cancelled = cancelled;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DialogueEnd(" + DialogueId + " with '" + NpcId + "': " + (Cancelled ? "cancelled" : "'" + ExitId + "'") +
                   (FollowUp != DialogueFollowUp.Gameplay ? ", " + FollowUp : string.Empty) + ")";
        }
    }
}
