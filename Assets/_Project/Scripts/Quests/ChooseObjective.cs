using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Waehle eine Seite (Entscheidung)" (GDD 02 5.1 type 23, short code <c>Waehle</c>): fulfilled by
    /// <c>ChoiceMade</c> with this choice id and one of the options. The choice id is the global objective id
    /// (<c>&lt;quest&gt;.&lt;stage&gt;.&lt;objective&gt;</c>, GDD 02 2.3) unless set explicitly. The chosen option is kept in
    /// the quest (decision ledger) and can be read with the condition "Quest/Entscheidung ist".
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Wähle eine Seite (Entscheidung)", 7)]
    public sealed class ChooseObjective : QuestObjective, IObjectiveListener<ChoiceMade>
    {
        [Tooltip("Optionen a, b, c … mit Kurztext.")]
        [SerializeField] private List<ChoiceOption> options = new List<ChoiceOption>();

        [Tooltip("Eigene Wahl-ID (optional). Leer = globale Ziel-ID <quest>.<stage>.<ziel>.")]
        [SerializeField] private string choiceId = string.Empty;

        /// <summary>Creates an empty objective.</summary>
        public ChooseObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="options">Options.</param>
        public ChooseObjective(string id, params ChoiceOption[] options) : base(id)
        {
            if (options != null)
            {
                this.options.AddRange(options);
            }
        }

        /// <summary>Options.</summary>
        public IReadOnlyList<ChoiceOption> Options => options;

        /// <summary>Explicit choice id or empty.</summary>
        public string ChoiceId => choiceId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "Wähle";

        /// <inheritdoc />
        public override bool RecordsChoice => true;

        /// <summary>Uses an explicit choice id (code-built quests).</summary>
        /// <param name="id">Choice id.</param>
        public ChooseObjective WithChoiceId(string id)
        {
            choiceId = id ?? string.Empty;
            return this;
        }

        /// <summary>The choice id the objective listens to in the given context.</summary>
        /// <param name="ctx">Quest context.</param>
        public string ResolveChoiceId(in QuestContext ctx)
        {
            return ChoiceId.Length > 0 ? ChoiceId : ctx.GlobalObjectiveId(Id);
        }

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<ChoiceMade>(this);
        }

        /// <inheritdoc />
        public void Handle(in ChoiceMade evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.ChoiceId != ResolveChoiceId(ctx) || !HasOption(evt.OptionId))
            {
                return;
            }

            rt.SetExtra(evt.OptionId);
            rt.Complete();
        }

        /// <summary>True if the option exists.</summary>
        /// <param name="optionId">Option id.</param>
        public bool HasOption(string optionId)
        {
            for (int i = 0; i < options.Count; i++)
            {
                if (options[i] != null && options[i].Id == optionId)
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public override string Describe()
        {
            var ids = new List<string>(options.Count);
            for (int i = 0; i < options.Count; i++)
            {
                ids.Add(options[i] != null ? options[i].Id : "?");
            }

            return ShortCode + "(" + string.Join("/", ids) + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            if (options.Count < 2)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Wähle: mindestens 2 Optionen nötig.");
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < options.Count; i++)
            {
                if (options[i] == null || options[i].Id.Length == 0)
                {
                    report.Error(ValidationReportExtensions.InvalidParameterCode, "Wähle: Option " + i + " ohne ID.");
                    continue;
                }

                if (!seen.Add(options[i].Id))
                {
                    report.Error("V01", "Wähle: Option '" + options[i].Id + "' gibt es zweimal.");
                }
            }
        }
    }
}
