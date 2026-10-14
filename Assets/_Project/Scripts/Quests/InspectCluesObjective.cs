using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Untersuche Hinweise" (GDD 02 5.1 type 18, short code <c>Untersuche</c>, detective mode): counts
    /// <c>ClueInspected</c> of the listed clues, each clue once. With fewer required than listed it is "n of m clues".
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Untersuche Hinweise", 9)]
    public sealed class InspectCluesObjective : QuestObjective, IObjectiveListener<ClueInspected>
    {
        [Tooltip("Hinweis-IDs, z. B. clue.eichental.weide_pfoten.")]
        [SerializeField] private List<string> clueIds = new List<string>();

        [Tooltip("Benötigte Anzahl (höchstens die Zahl der Hinweise).")]
        [Min(1)] [SerializeField] private int count = 1;

        /// <summary>Creates an empty objective.</summary>
        public InspectCluesObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="count">Required number.</param>
        /// <param name="clueIds">Clue ids.</param>
        public InspectCluesObjective(string id, int count, params string[] clueIds) : base(id)
        {
            this.count = count;
            if (clueIds != null)
            {
                this.clueIds.AddRange(clueIds);
            }
        }

        /// <summary>Clue ids.</summary>
        public IReadOnlyList<string> ClueIds => clueIds;

        /// <inheritdoc />
        public override int RequiredCount => count;

        /// <inheritdoc />
        public override string ShortCode => "Untersuche";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<ClueInspected>(this);
        }

        /// <inheritdoc />
        public void Handle(in ClueInspected evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (!clueIds.Contains(evt.ClueId))
            {
                return;
            }

            if (rt.AddDistinct(evt.ClueId))
            {
                rt.Add(1);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + string.Join(", ", clueIds) + "; " + count + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            if (clueIds.Count == 0)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Untersuche: leere Hinweisliste.");
                return;
            }

            if (count > clueIds.Count)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Untersuche: Anzahl " + count + ", aber nur " + clueIds.Count + " Hinweis(e).");
            }

            for (int i = 0; i < clueIds.Count; i++)
            {
                report.RequireId(clueIds[i], "clue.", "Hinweis " + i);
            }
        }
    }
}
