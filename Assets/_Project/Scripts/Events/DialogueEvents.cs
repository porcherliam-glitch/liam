// Global events of conversations and decisions (architecture 4.3, events #23-#25). Several event structs of one area may
// share a file (architecture 15.2, rule 18). The dialogue system (Aetherfall.Dialogue, later step) sends them; until it
// exists, tests and debug tools send them to drive quest objectives.

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>The player talked to an NPC (a conversation started). Receivers: quests ("Rede mit NPC").</summary>
    public readonly struct NPCTalkedTo : IGameEvent
    {
        /// <summary>NPC id, e.g. <c>npc.eichental.bauer_hollmann</c>.</summary>
        public readonly string NpcId;

        /// <summary>Dialogue id, e.g. <c>dlg.eichental.hollmann_schafe</c>; empty for barks without a dialogue.</summary>
        public readonly string DialogueId;

        /// <summary>Creates the event.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="dialogueId">Dialogue id or empty.</param>
        public NPCTalkedTo(string npcId, string dialogueId)
        {
            NpcId = npcId ?? string.Empty;
            DialogueId = dialogueId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "NPCTalkedTo(" + NpcId + ", " + DialogueId + ")";
        }
    }

    /// <summary>A conversation ended. Receivers: quests ("Ueberzeuge NPC" via the exit id).</summary>
    public readonly struct DialogOutcome : IGameEvent
    {
        /// <summary>Dialogue id.</summary>
        public readonly string DialogueId;

        /// <summary>NPC id.</summary>
        public readonly string NpcId;

        /// <summary>Id of the end node that was reached; empty if the conversation was cancelled.</summary>
        public readonly string ExitId;

        /// <summary>Creates the event.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="exitId">Exit id or empty.</param>
        public DialogOutcome(string dialogueId, string npcId, string exitId)
        {
            DialogueId = dialogueId ?? string.Empty;
            NpcId = npcId ?? string.Empty;
            ExitId = exitId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DialogOutcome(" + DialogueId + " with " + NpcId + ": '" + ExitId + "')";
        }
    }

    /// <summary>
    /// The player made a decision (dialogue option or world action). Receivers: quests ("Waehle eine Seite", decision ledger),
    /// telemetry.
    /// </summary>
    public readonly struct ChoiceMade : IGameEvent
    {
        /// <summary>
        /// Choice id: the global id of the choose objective, e.g.
        /// <c>quest.side.eichental.banditen_am_muehlbach.s35_gnade.o1</c> (GDD 02, 2.3).
        /// </summary>
        public readonly string ChoiceId;

        /// <summary>Chosen option, e.g. <c>a</c> or <c>b</c>.</summary>
        public readonly string OptionId;

        /// <summary>Creates the event.</summary>
        /// <param name="choiceId">Choice id.</param>
        /// <param name="optionId">Option id.</param>
        public ChoiceMade(string choiceId, string optionId)
        {
            ChoiceId = choiceId ?? string.Empty;
            OptionId = optionId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ChoiceMade(" + ChoiceId + " = " + OptionId + ")";
        }
    }
}
