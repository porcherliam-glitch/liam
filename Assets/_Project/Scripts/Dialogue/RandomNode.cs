using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Random node (GDD 02, 12.2 "Zufall"): weighted variety, e.g. three greetings. The roll is fixed per NPC and game day
    /// (seed = hash of NPC, day, dialogue and node; architecture 11.8), so reloading does not change it.
    /// </summary>
    [Serializable]
    [TypeMenu("Knoten/Zufall", 5)]
    public sealed class RandomNode : DialogueNode
    {
        [Tooltip("Ausgänge mit Gewicht.")]
        [SerializeField] private List<RandomOutcome> outcomes = new List<RandomOutcome>();

        /// <summary>Creates an empty node (inspector).</summary>
        public RandomNode()
        {
        }

        /// <summary>Creates a random node.</summary>
        /// <param name="id">Node id.</param>
        public RandomNode(string id) : base(id)
        {
        }

        /// <inheritdoc />
        public override DialogueNodeKind Kind => DialogueNodeKind.Random;

        /// <summary>Weighted exits.</summary>
        public IReadOnlyList<RandomOutcome> Outcomes => outcomes;

        /// <summary>Sum of all positive weights.</summary>
        public int TotalWeight
        {
            get
            {
                int total = 0;
                for (int i = 0; i < outcomes.Count; i++)
                {
                    if (outcomes[i] != null && outcomes[i].Weight > 0)
                    {
                        total += outcomes[i].Weight;
                    }
                }

                return total;
            }
        }

        /// <summary>Adds a weighted exit (chainable).</summary>
        /// <param name="weight">Weight.</param>
        /// <param name="targetNodeId">Target node.</param>
        public RandomNode Add(int weight, string targetNodeId)
        {
            outcomes.Add(new RandomOutcome(weight, targetNodeId));
            return this;
        }

        /// <summary>Picks the exit for a roll in <c>0 .. TotalWeight - 1</c>; empty if there is none.</summary>
        /// <param name="roll">Roll.</param>
        public string Pick(int roll)
        {
            int remaining = roll;
            for (int i = 0; i < outcomes.Count; i++)
            {
                RandomOutcome outcome = outcomes[i];
                if (outcome == null || outcome.Weight <= 0)
                {
                    continue;
                }

                if (remaining < outcome.Weight)
                {
                    return outcome.TargetNodeId;
                }

                remaining -= outcome.Weight;
            }

            return string.Empty;
        }

        /// <inheritdoc />
        public override void CollectTargets(List<string> targets)
        {
            for (int i = 0; i < outcomes.Count; i++)
            {
                if (outcomes[i] != null)
                {
                    AddTarget(targets, outcomes[i].TargetNodeId);
                }
            }
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (outcomes.Count == 0 || TotalWeight <= 0)
            {
                report.Error(DialogueValidator.DeadEndCode, "Der Zufalls-Knoten hat keinen Ausgang mit Gewicht.");
            }

            for (int i = 0; i < outcomes.Count; i++)
            {
                using (report.Scope("Ausgang " + (i + 1)))
                {
                    RandomOutcome outcome = outcomes[i];
                    if (outcome == null)
                    {
                        report.Error(ValidationReportExtensions.MissingTypeCode, "Leerer Ausgang.");
                        continue;
                    }

                    report.RequirePositive(outcome.Weight, "Gewicht");
                    if (outcome.TargetNodeId.Length == 0)
                    {
                        report.Error(DialogueValidator.DeadEndCode, "Der Ausgang hat keinen Ziel-Knoten.");
                    }
                }
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return Id + " Zufall (" + outcomes.Count + " Ausgänge)";
        }
    }
}
