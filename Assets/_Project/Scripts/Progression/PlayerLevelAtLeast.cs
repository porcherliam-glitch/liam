using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Condition "Spieler hat Level X" (architecture 7.7 <c>PlayerLevelAtLeast</c>, §6.4): true from the given level on, e.g.
    /// a start condition "ab Level 5". Re-evaluated on <c>LevelUp</c> (after loading the watcher checks everything once).
    /// </summary>
    [Serializable]
    [TypeMenu("Spieler/Level mindestens", 0)]
    public sealed class PlayerLevelAtLeast : Condition
    {
        [Tooltip("Mindest-Level (1–80).")]
        [Range(1, 80)] [SerializeField] private int level = 1;

        /// <summary>Creates an empty condition (level 1).</summary>
        public PlayerLevelAtLeast()
        {
        }

        /// <summary>Creates the condition.</summary>
        /// <param name="level">Minimum level.</param>
        public PlayerLevelAtLeast(int level)
        {
            this.level = level;
        }

        /// <summary>Minimum level.</summary>
        public int Level => level;

        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return ctx.Get<IProgressionService>().Level >= level;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<LevelUp>();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Level ≥ " + level;
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            if (level < 1 || level > XpCurve.DefaultMaxLevel)
            {
                report.Error(ValidationReportExtensions.InvalidParameterCode, "Level " + level + " liegt nicht zwischen 1 und " + XpCurve.DefaultMaxLevel + ".");
            }
        }
    }
}
