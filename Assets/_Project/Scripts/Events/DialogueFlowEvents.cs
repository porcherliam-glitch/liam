// Global events of the conversation flow (architecture 4.3, area "Dialog": DialogueStarted, SkillCheckResolved) and the
// proposed TopicUnlocked. NPCTalkedTo, DialogOutcome and ChoiceMade live in DialogueEvents.cs. Several event structs of one
// area may share a file (architecture 15.2, rule 18). Sender of all of them: Aetherfall.Dialogue.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A conversation started (after <c>NPCTalkedTo</c>). Receivers: UI (dialogue screen), camera (dialogue camera in the full
    /// mode), audio (ducking), telemetry.
    /// </summary>
    public readonly struct DialogueStarted : IGameEvent
    {
        /// <summary>Dialogue id, e.g. <c>dlg.eichental.harrik_verhandlung</c>.</summary>
        public readonly string DialogueId;

        /// <summary>Conversation partner (NPC id); empty for dialogues without a partner (e.g. a letter).</summary>
        public readonly string NpcId;

        /// <summary>Full or short mode (GDD 02, 12.1).</summary>
        public readonly DialogueMode Mode;

        /// <summary>Creates the event.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="npcId">NPC id or empty.</param>
        /// <param name="mode">Conversation mode.</param>
        public DialogueStarted(string dialogueId, string npcId, DialogueMode mode)
        {
            DialogueId = dialogueId ?? string.Empty;
            NpcId = npcId ?? string.Empty;
            Mode = mode;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DialogueStarted(" + DialogueId + " with '" + NpcId + "', " + Mode + ")";
        }
    }

    /// <summary>
    /// A skill check of a dialogue was decided (GDD 02, 12.3: persuade, intimidate, lie). Receivers: telemetry, companion
    /// reactions, achievements later.
    /// </summary>
    public readonly struct SkillCheckResolved : IGameEvent
    {
        /// <summary>Dialogue id.</summary>
        public readonly string DialogueId;

        /// <summary>Kind of the check.</summary>
        public readonly SkillCheckType CheckType;

        /// <summary>True if the check succeeded.</summary>
        public readonly bool Success;

        /// <summary>Creates the event.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="checkType">Kind of the check.</param>
        /// <param name="success">True on success.</param>
        public SkillCheckResolved(string dialogueId, SkillCheckType checkType, bool success)
        {
            DialogueId = dialogueId ?? string.Empty;
            CheckType = checkType;
            Success = success;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "SkillCheckResolved(" + DialogueId + ": " + CheckType + " " + (Success ? "success" : "failure") + ")";
        }
    }

    /// <summary>
    /// A conversation topic became known (GDD 02, 12.9, e.g. <c>thema.grimmbart</c>). Proposal beyond the list of architecture
    /// 4.3: lets the condition "Dialog/Thema bekannt" be re-evaluated by the condition watcher. Receivers: condition watcher,
    /// UI (codex later). Not sent when a save is loaded.
    /// </summary>
    public readonly struct TopicUnlocked : IGameEvent
    {
        /// <summary>Topic id, e.g. <c>thema.grimmbart</c>.</summary>
        public readonly string TopicId;

        /// <summary>Creates the event.</summary>
        /// <param name="topicId">Topic id.</param>
        public TopicUnlocked(string topicId)
        {
            TopicId = topicId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "TopicUnlocked(" + TopicId + ")";
        }
    }
}
