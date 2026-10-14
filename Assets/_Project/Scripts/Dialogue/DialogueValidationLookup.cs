using System;
using System.Collections.Generic;

namespace Aetherfall.Dialogue
{
    /// <summary>Default <see cref="IDialogueValidationLookup"/>: a dialogue catalog plus an optional set of NPC ids.</summary>
    public sealed class DialogueValidationLookup : IDialogueValidationLookup
    {
        private readonly DialogueCatalog _dialogues;
        private readonly HashSet<string> _npcs;

        /// <summary>Creates the lookup.</summary>
        /// <param name="dialogues">Known dialogues (null = none).</param>
        /// <param name="npcIds">Known NPC ids; null = NPCs are not checked.</param>
        public DialogueValidationLookup(DialogueCatalog dialogues, IEnumerable<string> npcIds)
        {
            _dialogues = dialogues ?? new DialogueCatalog();
            if (npcIds != null)
            {
                _npcs = new HashSet<string>(npcIds, StringComparer.Ordinal);
            }
        }

        /// <inheritdoc />
        public bool HasNpcData => _npcs != null;

        /// <inheritdoc />
        public bool NpcExists(string npcId)
        {
            return _npcs == null || (npcId != null && _npcs.Contains(npcId));
        }

        /// <inheritdoc />
        public bool TryGetDialogue(string dialogueId, out DialogueSpec spec)
        {
            return _dialogues.TryGet(dialogueId, out spec);
        }
    }
}
