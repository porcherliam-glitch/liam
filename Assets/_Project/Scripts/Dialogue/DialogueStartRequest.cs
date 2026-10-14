namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Request to start a conversation (<see cref="IDialogueService.TryStart"/>): which dialogue, with which NPC, optionally at a
    /// node other than the start node, and the source for logs (NPC interaction, quest action, debug).
    /// </summary>
    public readonly struct DialogueStartRequest
    {
        /// <summary>Dialogue id.</summary>
        public readonly string DialogueId;

        /// <summary>Conversation partner (NPC id); empty for dialogues without a partner.</summary>
        public readonly string NpcId;

        /// <summary>Start node; empty = start node of the dialogue.</summary>
        public readonly string StartNodeId;

        /// <summary>Who started it (e.g. <c>interaction</c>, a quest id, <c>debug</c>).</summary>
        public readonly string SourceId;

        /// <summary>Creates the request.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="startNodeId">Start node or empty.</param>
        /// <param name="sourceId">Source for logs.</param>
        public DialogueStartRequest(string dialogueId, string npcId, string startNodeId = "", string sourceId = "")
        {
            DialogueId = dialogueId ?? string.Empty;
            NpcId = npcId ?? string.Empty;
            StartNodeId = startNodeId ?? string.Empty;
            SourceId = sourceId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DialogueStartRequest(" + DialogueId + " with '" + NpcId + "'" + (StartNodeId.Length > 0 ? " at " + StartNodeId : string.Empty) + ")";
        }
    }
}
