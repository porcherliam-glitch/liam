using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// One answer of a <see cref="ChoiceNode"/> (GDD 02, 12.2 and 12.4): text (at most 60 characters), visibility and
    /// selectability conditions, "einmalig" (greyed after it was chosen once), "unumkehrbar" (hold to confirm, "[Toeten]"),
    /// actions on choosing and the target node. Tags such as "[Ueberzeugen 12]", "[80 Gold]" or the quest diamond are derived
    /// from the target node and the actions (<see cref="DialogueOptionAnalyzer"/>); authors never type them.
    /// </summary>
    [Serializable]
    public sealed class DialogueOption
    {
        /// <summary>Longest option text in German (GDD 02, 12.7 and 13.2).</summary>
        public const int MaxLength = 60;

        [Tooltip("Options-ID im Knoten: a, b, c …")]
        [SerializeField] private string id = "a";

        [Tooltip("Text der Antwort (Deutsch), höchstens 60 Zeichen, ohne Kennzeichen wie [Überzeugen 12] (die entstehen automatisch).")]
        [SerializeField] private string text = string.Empty;

        [Tooltip("Ziel-Knoten nach der Wahl.")]
        [SerializeField] private string targetNodeId = string.Empty;

        [Tooltip("Sichtbarkeits-Bedingung. Leer = immer sichtbar. Unsichtbare Optionen erscheinen gar nicht.")]
        [SerializeReference] private Condition visibleIf;

        [Tooltip("Wählbarkeits-Bedingung. Leer = immer wählbar. Sonst grau mit dem Grund unten (z. B. „Magier“).")]
        [SerializeReference] private Condition selectableIf;

        [Tooltip("Grund, der bei nicht erfüllter Wählbarkeit in eckigen Klammern erscheint, z. B. Magier oder Tributbuch. Leer = nur grau.")]
        [SerializeField] private string lockedReason = string.Empty;

        [Tooltip("Einmalig: nach der ersten Wahl ausgegraut und nicht mehr wählbar.")]
        [SerializeField] private bool once;

        [Tooltip("Unumkehrbar (z. B. töten): rot „[Töten]“, Bestätigung durch Halten (GDD 05, 1.4).")]
        [SerializeField] private bool irreversible;

        [Tooltip("Aktionen bei der Wahl (vor dem Sprung zum Ziel-Knoten).")]
        [SerializeReference] private List<GameAction> actions = new List<GameAction>();

        [Tooltip("Wahl-ID für das Ereignis ChoiceMade (Quest-Ziel „Wähle“). Leer = <dialog>.<knoten>.")]
        [SerializeField] private string choiceId = string.Empty;

        [Tooltip("Options-ID für ChoiceMade. Leer = die Options-ID oben.")]
        [SerializeField] private string choiceOptionId = string.Empty;

        /// <summary>Creates an empty option (inspector).</summary>
        public DialogueOption()
        {
        }

        /// <summary>Creates an option.</summary>
        /// <param name="id">Option id, e.g. <c>a</c>.</param>
        /// <param name="text">German text without tags.</param>
        /// <param name="targetNodeId">Target node.</param>
        public DialogueOption(string id, string text, string targetNodeId)
        {
            this.id = id ?? string.Empty;
            this.text = text ?? string.Empty;
            this.targetNodeId = targetNodeId ?? string.Empty;
        }

        /// <summary>Option id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>German text without tags.</summary>
        public string Text => text ?? string.Empty;

        /// <summary>Target node.</summary>
        public string TargetNodeId => targetNodeId ?? string.Empty;

        /// <summary>Visibility condition (null = visible).</summary>
        public Condition VisibleIf => visibleIf;

        /// <summary>Selectability condition (null = selectable).</summary>
        public Condition SelectableIf => selectableIf;

        /// <summary>Lock reason shown as <c>[reason]</c>.</summary>
        public string LockedReason => lockedReason ?? string.Empty;

        /// <summary>True if the option can be chosen only once.</summary>
        public bool Once => once;

        /// <summary>True if the option cannot be undone (hold to confirm).</summary>
        public bool Irreversible => irreversible;

        /// <summary>Actions on choosing.</summary>
        public IReadOnlyList<GameAction> Actions => actions;

        /// <summary>Choice id override for <c>ChoiceMade</c>; empty = node key.</summary>
        public string ChoiceIdOverride => choiceId ?? string.Empty;

        /// <summary>Option id override for <c>ChoiceMade</c>; empty = <see cref="Id"/>.</summary>
        public string ChoiceOptionIdOverride => choiceOptionId ?? string.Empty;

        /// <summary>Sets the visibility condition (chainable).</summary>
        /// <param name="condition">Condition.</param>
        public DialogueOption VisibleWhen(Condition condition)
        {
            visibleIf = condition;
            return this;
        }

        /// <summary>Sets the selectability condition and the reason shown while it fails (chainable).</summary>
        /// <param name="condition">Condition.</param>
        /// <param name="reason">Reason, e.g. <c>Magier</c>; empty = only greyed.</param>
        public DialogueOption SelectableWhen(Condition condition, string reason = "")
        {
            selectableIf = condition;
            lockedReason = reason ?? string.Empty;
            return this;
        }

        /// <summary>Makes the option one-time (chainable).</summary>
        public DialogueOption OnlyOnce()
        {
            once = true;
            return this;
        }

        /// <summary>Marks the option as irreversible (chainable).</summary>
        public DialogueOption CannotBeUndone()
        {
            irreversible = true;
            return this;
        }

        /// <summary>Adds actions that run on choosing (chainable).</summary>
        /// <param name="optionActions">Actions.</param>
        public DialogueOption Do(params GameAction[] optionActions)
        {
            if (optionActions != null)
            {
                actions.AddRange(optionActions);
            }

            return this;
        }

        /// <summary>Reports the choice to a quest objective "Waehle" (chainable).</summary>
        /// <param name="questChoiceId">Choice id, e.g. <c>quest.side.eichental.banditen_am_muehlbach.s35_gnade.o1</c>.</param>
        /// <param name="questOptionId">Option id of the objective, e.g. <c>b</c>.</param>
        public DialogueOption ReportsChoice(string questChoiceId, string questOptionId)
        {
            choiceId = questChoiceId ?? string.Empty;
            choiceOptionId = questOptionId ?? string.Empty;
            return this;
        }
    }
}
