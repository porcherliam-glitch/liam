using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Folge einer Spur" (GDD 02 5.1 type 17, short code <c>Folge</c>): progress is the highest reached node of the
    /// trail (<c>TrailNodeReached</c>); fulfilled at the last node. Skipping nodes is allowed.
    /// </summary>
    /// <remarks>TODO (NPC step): following an NPC (<c>NPCArrived</c>, distance warning) as a second mode.</remarks>
    [Serializable]
    [TypeMenu("Ziele/Folge einer Spur", 10)]
    public sealed class FollowTrailObjective : QuestObjective, IObjectiveListener<TrailNodeReached>
    {
        [Tooltip("Spur-ID, z. B. spur.eichental.wolfsspur.")]
        [SerializeField] private string trailId = string.Empty;

        [Tooltip("Anzahl der Knoten der Spur (der letzte Knoten erfüllt das Ziel).")]
        [Min(1)] [SerializeField] private int nodeCount = 1;

        /// <summary>Creates an empty objective.</summary>
        public FollowTrailObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="trailId">Trail id.</param>
        /// <param name="nodeCount">Number of nodes.</param>
        public FollowTrailObjective(string id, string trailId, int nodeCount) : base(id)
        {
            this.trailId = trailId ?? string.Empty;
            this.nodeCount = nodeCount;
        }

        /// <summary>Trail id.</summary>
        public string TrailId => trailId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => nodeCount;

        /// <inheritdoc />
        public override string ShortCode => "Folge";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<TrailNodeReached>(this);
        }

        /// <inheritdoc />
        public void Handle(in TrailNodeReached evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.TrailId != TrailId)
            {
                return;
            }

            int reached = evt.Index + 1;
            if (reached > rt.Progress)
            {
                rt.Add(reached - rt.Progress);
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + TrailId + ", " + nodeCount + " Knoten)";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(trailId, "spur.", "Spur");
        }
    }
}
