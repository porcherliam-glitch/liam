using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Action "Weltzustand-Flag setzen" (architecture 7.7 <c>SetFlag</c>, §6.4): sets a flag to a value. Bool flags: 1 = set,
    /// 0 = not set. The source (quest, dialogue) goes into the write log of the world state.
    /// </summary>
    [Serializable]
    [TypeMenu("Welt/Flag setzen", 0)]
    public sealed class SetFlag : GameAction
    {
        [Tooltip("Flag-ID.")]
        [IdRef("flag.")] [SerializeField] private string flagId = string.Empty;

        [Tooltip("Neuer Wert. Bool: 1 = gesetzt, 0 = nicht gesetzt. Enum: Wert aus der Werteliste.")]
        [SerializeField] private int value = 1;

        /// <summary>Creates an empty action.</summary>
        public SetFlag()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="value">Value.</param>
        public SetFlag(string flagId, int value)
        {
            this.flagId = flagId ?? string.Empty;
            this.value = value;
        }

        /// <summary>Flag id.</summary>
        public string FlagId => flagId;

        /// <summary>Value.</summary>
        public int Value => value;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IWorldState>().SetInt(flagId, value, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Setze Flag " + (flagId.Length > 0 ? flagId : "?") + " = " + value;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Flag-ID ist leer.");
                return;
            }

            report.WritesFlag(flagId, value, true);
        }
    }
}
