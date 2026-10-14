using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Gehe zu Ort" (GDD 02 5.1 type 6, short code <c>GeheZu</c>): fulfilled by <c>AreaEntered</c> with the
    /// location id. The radius is data for the trigger volume and the compass (world step).
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Gehe zu Ort", 5)]
    public sealed class GoToObjective : QuestObjective, IObjectiveListener<AreaEntered>
    {
        [Tooltip("Orts-ID, z. B. loc.eichental.wolfsbau_nordhang.")]
        [IdRef("loc.", true)] [SerializeField] private string locationId = string.Empty;

        [Tooltip("Radius in Metern (Trigger-Zone und Kompass).")]
        [Min(0f)] [SerializeField] private float radius = 10f;

        /// <summary>Creates an empty objective.</summary>
        public GoToObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="locationId">Location id.</param>
        /// <param name="radius">Radius in meters.</param>
        public GoToObjective(string id, string locationId, float radius = 10f) : base(id)
        {
            this.locationId = locationId ?? string.Empty;
            this.radius = radius;
        }

        /// <summary>Location id.</summary>
        public string LocationId => locationId ?? string.Empty;

        /// <summary>Radius in meters.</summary>
        public float Radius => radius;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "GeheZu";

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
            return ShortCode + "(" + LocationId + ", r=" + radius + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(locationId, "loc.", "Ort");
            if (radius <= 0f)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "GeheZu: Radius " + radius + " (muss größer als 0 sein).");
            }
        }
    }
}
