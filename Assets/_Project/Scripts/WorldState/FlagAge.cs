using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Condition "Flag seit mindestens n Stunden" (architecture 7.7 proposal <c>FlagAge</c>, GDD 02 6.3): holds if a flag is
    /// set (not at its start value) and its last change is at least <see cref="MinHours"/> hours of active playtime ago.
    /// Makes delayed consequences independent of the travel speed (e.g. <c>FlagAlter(harrik_verschont) ≥ 15 h</c>).
    /// </summary>
    /// <remarks>
    /// Re-evaluated on <c>FlagChanged</c> of the flag and every new game hour (<c>TimeOfDayChanged</c>). Until the game clock
    /// sends <c>TimeOfDayChanged</c> (game clock step, architecture 4.6), the condition watcher polls it once per second
    /// instead (<see cref="Aetherfall.Conditions.ConditionWatcher.HasGameClock"/>).
    /// </remarks>
    [Serializable]
    [TypeMenu("Welt/Flag seit mindestens n Stunden", 1)]
    public sealed class FlagAge : Condition
    {
        [Tooltip("Flag-ID.")]
        [IdRef("flag.")] [SerializeField] private string flagId = string.Empty;

        [Tooltip("Mindestalter der letzten Änderung in Stunden aktiver Spielzeit.")]
        [Min(0f)] [SerializeField] private float minHours = 1f;

        /// <summary>Creates an empty condition.</summary>
        public FlagAge()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="minHours">Minimum age in hours of active playtime.</param>
        public FlagAge(string flagId, float minHours)
        {
            this.flagId = flagId ?? string.Empty;
            this.minHours = minHours;
        }

        /// <summary>Flag id.</summary>
        public string FlagId => flagId;

        /// <summary>Minimum age in hours.</summary>
        public float MinHours => minHours;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            IWorldState world = ctx.Get<IWorldState>();
            int start = world.TryGetDefinition(flagId, out FlagSpec spec) ? spec.DefaultValue : 0;
            if (world.GetInt(flagId) == start)
            {
                return false;
            }

            return world.SecondsSinceChange(flagId) >= minHours * 3600.0;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.OnFlag(flagId);
            triggers.OnGameHour();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Flag " + (flagId.Length > 0 ? flagId : "?") + " seit ≥ " + minHours + " h";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Flag-ID ist leer.");
                return;
            }

            report.AddReference(flagId, "flag.", ReferenceUse.Read, 0, false);
        }
    }
}
