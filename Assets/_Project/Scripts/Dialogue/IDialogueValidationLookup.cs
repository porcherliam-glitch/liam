namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Known content for the dialogue validator (rule V04, broken references): other dialogues (jumps) and NPC ids (speakers).
    /// Built from the project assets by the menu "Aetherfall > Dialoge pruefen"; tests build it from specs.
    /// </summary>
    public interface IDialogueValidationLookup
    {
        /// <summary>True if NPC ids can be checked (false = no NPC data, speakers are not checked).</summary>
        bool HasNpcData { get; }

        /// <summary>True if the NPC exists.</summary>
        /// <param name="npcId">NPC id.</param>
        bool NpcExists(string npcId);

        /// <summary>Returns a dialogue.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="spec">The dialogue.</param>
        bool TryGetDialogue(string dialogueId, out DialogueSpec spec);
    }
}
