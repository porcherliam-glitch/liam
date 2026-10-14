using System;
using Aetherfall.Conditions;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// A fail condition and its consequence (GDD 02, 4.1 "Kann scheitern + wodurch", 4.2 "Fehlschlag-Bedingungen"), on the
    /// quest (watched while the quest runs) or on a stage (watched while the stage runs). When the condition becomes true,
    /// the quest jumps to <see cref="TargetStageId"/> (e.g. <c>s90_gescheitert</c>) or, without a target, fails at once.
    /// </summary>
    [Serializable]
    public sealed class QuestFailRule
    {
        [Tooltip("Fehlschlag-Bedingung, z. B. „NPC tot“ oder „Flag …“.")]
        [SerializeReference] private Condition condition;

        [Tooltip("Stage, in die gesprungen wird (z. B. s90_gescheitert). Leer = Quest scheitert sofort.")]
        [SerializeField] private string targetStageId = string.Empty;

        [Tooltip("Grund-ID für das Questlog und QuestFailed, z. B. frist_abgelaufen oder npc_tot.")]
        [SerializeField] private string reasonId = string.Empty;

        /// <summary>Creates an empty rule.</summary>
        public QuestFailRule()
        {
        }

        /// <summary>Creates a rule.</summary>
        /// <param name="condition">Fail condition.</param>
        /// <param name="targetStageId">Stage to jump to, or empty to fail at once.</param>
        /// <param name="reasonId">Reason id.</param>
        public QuestFailRule(Condition condition, string targetStageId, string reasonId)
        {
            this.condition = condition;
            this.targetStageId = targetStageId ?? string.Empty;
            this.reasonId = reasonId ?? string.Empty;
        }

        /// <summary>Fail condition.</summary>
        public Condition Condition => condition;

        /// <summary>Stage to jump to, or empty.</summary>
        public string TargetStageId => targetStageId ?? string.Empty;

        /// <summary>Reason id.</summary>
        public string ReasonId => reasonId ?? string.Empty;

        /// <inheritdoc />
        public override string ToString()
        {
            return (condition != null ? condition.Describe() : "?") + " → " + (TargetStageId.Length > 0 ? TargetStageId : "gescheitert");
        }
    }
}
