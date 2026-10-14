using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// One exit of a stage (GDD 02, 4.2 "Verzweigungen"): "condition → next stage". Branches are checked top-down when the
    /// stage is done; the first that holds wins, otherwise the stage's default exit is used.
    /// </summary>
    [Serializable]
    public sealed class StageBranch
    {
        [Tooltip("Bedingung, z. B. „Quest/Ziel erfüllt (o2)“. Leer = immer.")]
        [SerializeReference] private Condition condition;

        [Tooltip("Lokale ID der nächsten Stage, z. B. s50_zerstoert.")]
        [SerializeField] private string targetStageId = string.Empty;

        [Tooltip("Optionale Beschriftung für Editor und Graph, z. B. „Splitter zerstört“.")]
        [SerializeField] private string label = string.Empty;

        /// <summary>Creates an empty branch.</summary>
        public StageBranch()
        {
        }

        /// <summary>Creates a branch.</summary>
        /// <param name="condition">Condition (null = always).</param>
        /// <param name="targetStageId">Next stage.</param>
        /// <param name="label">Optional label.</param>
        public StageBranch(Condition condition, string targetStageId, string label = "")
        {
            this.condition = condition;
            this.targetStageId = targetStageId ?? string.Empty;
            this.label = label ?? string.Empty;
        }

        /// <summary>Condition (null = always).</summary>
        public Condition Condition => condition;

        /// <summary>Next stage.</summary>
        public string TargetStageId => targetStageId ?? string.Empty;

        /// <summary>Label.</summary>
        public string Label => label ?? string.Empty;

        /// <inheritdoc />
        public override string ToString()
        {
            return (condition != null ? condition.Describe() : "immer") + " → " + TargetStageId;
        }
    }
}
