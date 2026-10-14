using System;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>One weighted exit of a <see cref="RandomNode"/>.</summary>
    [Serializable]
    public sealed class RandomOutcome
    {
        [Tooltip("Gewicht (mindestens 1). Doppeltes Gewicht = doppelt so oft.")]
        [Min(1)] [SerializeField] private int weight = 1;

        [Tooltip("Ziel-Knoten.")]
        [SerializeField] private string targetNodeId = string.Empty;

        /// <summary>Creates an empty outcome (inspector).</summary>
        public RandomOutcome()
        {
        }

        /// <summary>Creates an outcome.</summary>
        /// <param name="weight">Weight (at least 1).</param>
        /// <param name="targetNodeId">Target node.</param>
        public RandomOutcome(int weight, string targetNodeId)
        {
            this.weight = weight;
            this.targetNodeId = targetNodeId ?? string.Empty;
        }

        /// <summary>Weight.</summary>
        public int Weight => weight;

        /// <summary>Target node.</summary>
        public string TargetNodeId => targetNodeId ?? string.Empty;
    }
}
