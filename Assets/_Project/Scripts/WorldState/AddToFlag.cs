using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Action "Weltzustand-Flag erhoehen" (architecture 7.7 <c>AddToFlag</c>): adds to a counter or story number, e.g.
    /// <c>Stat+(stat.global.banditen_getoetet, 1)</c>. The result is clamped to the range of the definition.
    /// </summary>
    [Serializable]
    [TypeMenu("Welt/Flag erhöhen", 1)]
    public sealed class AddToFlag : GameAction
    {
        [Tooltip("Flag-ID (Zähler oder Story-Zahl).")]
        [IdRef("flag.")] [SerializeField] private string flagId = string.Empty;

        [Tooltip("Änderung (negativ = verringern).")]
        [SerializeField] private int delta = 1;

        /// <summary>Creates an empty action.</summary>
        public AddToFlag()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="delta">Change.</param>
        public AddToFlag(string flagId, int delta)
        {
            this.flagId = flagId ?? string.Empty;
            this.delta = delta;
        }

        /// <summary>Flag id.</summary>
        public string FlagId => flagId;

        /// <summary>Change.</summary>
        public int Delta => delta;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<IWorldState>().Add(flagId, delta, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Flag " + (flagId.Length > 0 ? flagId : "?") + (delta >= 0 ? " + " : " − ") + Math.Abs(delta);
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Flag-ID ist leer.");
                return;
            }

            if (delta == 0)
            {
                report.Warning(ValidationReportExtensions.InvalidParameterCode, "Änderung 0 hat keine Wirkung.");
            }

            report.WritesFlag(flagId, 0, false);
        }
    }
}
