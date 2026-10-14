using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Erreiche Ort innerhalb einer Zeit" (GDD 02 5.1 type 16, short code <c>ZeitLauf</c>): fulfilled by
    /// <c>AreaEntered</c> with the location before the stage timer (counted by the quest service, scaled game time) runs out;
    /// afterwards the objective has failed (e.g. "Hol Wenna aus dem Haus", 120 s).
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Erreiche Ort in Zeit", 12)]
    public sealed class ReachInTimeObjective : QuestObjective, IObjectiveListener<AreaEntered>
    {
        [Tooltip("Orts- oder Objekt-ID.")]
        [IdRef("loc.", true)] [SerializeField] private string locationId = string.Empty;

        [Tooltip("Zeit in Sekunden (sichtbarer Countdown).")]
        [Min(1f)] [SerializeField] private float seconds = 60f;

        /// <summary>Creates an empty objective.</summary>
        public ReachInTimeObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="locationId">Location id.</param>
        /// <param name="seconds">Time limit in seconds.</param>
        public ReachInTimeObjective(string id, string locationId, float seconds) : base(id)
        {
            this.locationId = locationId ?? string.Empty;
            this.seconds = seconds;
        }

        /// <summary>Location id.</summary>
        public string LocationId => locationId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "ZeitLauf";

        /// <inheritdoc />
        public override float TimeLimitSeconds => seconds;

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<AreaEntered>(this);
        }

        /// <inheritdoc />
        public void Handle(in AreaEntered evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.AreaId == LocationId)
            {
                rt.Complete();
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + LocationId + ", " + seconds + " s)";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(locationId, string.Empty, "Ort");
            if (seconds <= 0f)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "ZeitLauf: Zeit " + seconds + " s (muss größer als 0 sein).");
            }
        }
    }
}
