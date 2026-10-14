using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// One entry of the decision ledger of a quest (GDD 02, 6.4): a short German sentence that the journal shows under the
    /// finished quest once a stage or an action wrote it. Consequence entries ("Folgen bisher") are added later by other
    /// quests; hidden consequences appear only when their visibility condition holds.
    /// </summary>
    [Serializable]
    public sealed class LedgerEntryDefinition
    {
        [Tooltip("Lokale ID, z. B. ledger.c1 (global: <quest-id>.ledger.c1).")]
        [SerializeField] private string id = "ledger.c1";

        [Tooltip("Text in 2. Person, Perfekt, höchstens 120 Zeichen. TODO: später LocalizedString (DE/EN).")]
        [TextArea(2, 3)] [SerializeField] private string text = string.Empty;

        [Tooltip("Folgen-Eintrag (verzögerte Konsequenz) statt Entscheidung.")]
        [SerializeField] private bool isConsequence;

        [Tooltip("Sichtbar erst, wenn diese Bedingung erfüllt ist (versteckte Konsequenz). Leer = sofort sichtbar.")]
        [SerializeReference] private Condition visibleCondition;

        /// <summary>Creates an empty entry.</summary>
        public LedgerEntryDefinition()
        {
        }

        /// <summary>Creates an entry.</summary>
        /// <param name="id">Local id (<c>ledger.c1</c>).</param>
        /// <param name="text">German text.</param>
        /// <param name="isConsequence">True for a consequence entry.</param>
        /// <param name="visibleCondition">Visibility condition (null = always visible).</param>
        public LedgerEntryDefinition(string id, string text, bool isConsequence = false, Condition visibleCondition = null)
        {
            this.id = id ?? string.Empty;
            this.text = text ?? string.Empty;
            this.isConsequence = isConsequence;
            this.visibleCondition = visibleCondition;
        }

        /// <summary>Local id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>German text.</summary>
        public string Text => text ?? string.Empty;

        /// <summary>True for a consequence entry.</summary>
        public bool IsConsequence => isConsequence;

        /// <summary>Visibility condition (null = always visible).</summary>
        public Condition VisibleCondition => visibleCondition;
    }
}
