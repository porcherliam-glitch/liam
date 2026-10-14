using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Player choice (GDD 02, 12.2 "Spieler-Auswahl"): 2-6 answers (recommended 4); a hub with topics may hold up to 9 and
    /// scrolls. The last option should end the conversation or go back (B / Circle / Esc).
    /// </summary>
    [Serializable]
    [TypeMenu("Knoten/Spieler-Auswahl", 1)]
    public sealed class ChoiceNode : DialogueNode
    {
        /// <summary>Most options of a normal choice.</summary>
        public const int MaxOptions = 6;

        /// <summary>Most options of a hub.</summary>
        public const int MaxHubOptions = 9;

        [Tooltip("Themen-Hub: bis zu 9 Optionen (sonst höchstens 6).")]
        [SerializeField] private bool hub;

        [Tooltip("Antworten in Anzeigereihenfolge. Die letzte sollte „[Ende]“ oder „Zurück“ sein.")]
        [SerializeField] private List<DialogueOption> options = new List<DialogueOption>();

        /// <summary>Creates an empty choice (inspector).</summary>
        public ChoiceNode()
        {
        }

        /// <summary>Creates a choice.</summary>
        /// <param name="id">Node id.</param>
        /// <param name="isHub">True for a topic hub (up to 9 options).</param>
        public ChoiceNode(string id, bool isHub = false) : base(id)
        {
            hub = isHub;
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Choice;

        /// <summary>True for a topic hub.</summary>
        public bool IsHub => hub;

        /// <summary>Options in display order.</summary>
        public IReadOnlyList<DialogueOption> Options => options;

        /// <summary>Adds an option (chainable).</summary>
        /// <param name="option">Option.</param>
        public ChoiceNode Add(DialogueOption option)
        {
            options.Add(option);
            return this;
        }

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
            for (int i = 0; i < options.Count; i++)
            {
                if (options[i] != null)
                {
                    AddTarget(targets, options[i].TargetNodeId);
                }
            }
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            int limit = hub ? MaxHubOptions : MaxOptions;
            if (options.Count == 0)
            {
                report.Error(DialogueValidator.DeadEndCode, "Die Auswahl hat keine Optionen.");
                return;
            }

            if (options.Count > limit)
            {
                report.Warning(DialogueValidator.TooManyOptionsCode, options.Count + " Optionen (höchstens " + limit + (hub ? " im Hub" : ", Hub bis 9") + ").");
            }

            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < options.Count; i++)
            {
                DialogueOption option = options[i];
                using (report.Scope("Option " + (option != null && option.Id.Length > 0 ? option.Id : "[" + i + "]")))
                {
                    if (option == null)
                    {
                        report.Error(ValidationReportExtensions.MissingTypeCode, "Leere Option.");
                        continue;
                    }

                    if (!DialogueIds.IsValidOptionId(option.Id))
                    {
                        report.Error(DialogueValidator.IdSchemaCode, "Options-ID '" + option.Id + "' ist ungültig (a–z, 0–9, _).");
                    }
                    else if (!ids.Add(option.Id))
                    {
                        report.Error(DialogueValidator.DuplicateCode, "Options-ID '" + option.Id + "' gibt es in diesem Knoten zweimal.");
                    }

                    if (option.Text.Trim().Length == 0)
                    {
                        report.Error(DialogueValidator.MissingTextCode, "Die Option hat keinen Text.");
                    }
                    else if (option.Text.Length > DialogueOption.MaxLength)
                    {
                        report.Warning(DialogueValidator.TextLengthCode, "Option hat " + option.Text.Length + " Zeichen (höchstens " + DialogueOption.MaxLength + ").");
                    }

                    if (option.TargetNodeId.Length == 0)
                    {
                        report.Error(DialogueValidator.DeadEndCode, "Die Option hat keinen Ziel-Knoten.");
                    }

                    report.ValidateOptional(option.VisibleIf, "Sichtbar wenn");
                    report.ValidateOptional(option.SelectableIf, "Wählbar wenn");
                    report.ValidateActions(option.Actions, "Aktionen");
                }
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Auswahl (" + options.Count + " Optionen" + (hub ? ", Hub" : string.Empty) + ")";
        }
    }
}
