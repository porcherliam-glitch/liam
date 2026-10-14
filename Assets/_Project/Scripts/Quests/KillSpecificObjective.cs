using System;
using Aetherfall.Conditions;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Toete einen bestimmten Gegner" (GDD 02 5.1 type 2, short code <c>ToeteBestimmten</c>): fulfilled by
    /// <c>EnemyKilled</c> with this unique id (or a boss type id), by <c>BossDefeated</c> with this boss id and, if allowed,
    /// by <c>EnemyDefeated</c> (beaten alive).
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Töte bestimmten Gegner", 1)]
    public sealed class KillSpecificObjective : QuestObjective, IObjectiveListener<EnemyKilled>, IObjectiveListener<BossDefeated>,
                                                IObjectiveListener<EnemyDefeated>
    {
        [Tooltip("Boss-, Spawner- oder Gegner-ID, z. B. boss.eichental.glutfang.")]
        [SerializeField] private string targetId = string.Empty;

        [Tooltip("Auch „bezwingen“ (lebend besiegen, Ereignis EnemyDefeated) erfüllt das Ziel.")]
        [SerializeField] private bool allowDefeat;

        /// <summary>Creates an empty objective.</summary>
        public KillSpecificObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="targetId">Boss, spawner or enemy id.</param>
        /// <param name="allowDefeat">True if beating alive counts too.</param>
        public KillSpecificObjective(string id, string targetId, bool allowDefeat = false) : base(id)
        {
            this.targetId = targetId ?? string.Empty;
            this.allowDefeat = allowDefeat;
        }

        /// <summary>Target id.</summary>
        public string TargetId => targetId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => 1;

        /// <inheritdoc />
        public override string ShortCode => "TöteBestimmten";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<EnemyKilled>(this);
            registry.Listen<BossDefeated>(this);
            if (allowDefeat)
            {
                registry.Listen<EnemyDefeated>(this);
            }
        }

        /// <inheritdoc />
        public void Handle(in EnemyKilled evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (TargetId.Length > 0 && (evt.UniqueId == TargetId || evt.EnemyTypeId == TargetId))
            {
                rt.Complete();
            }
        }

        /// <inheritdoc />
        public void Handle(in BossDefeated evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (TargetId.Length > 0 && evt.BossId == TargetId)
            {
                rt.Complete();
            }
        }

        /// <inheritdoc />
        public void Handle(in EnemyDefeated evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (allowDefeat && TargetId.Length > 0 && (evt.UniqueId == TargetId || evt.EnemyTypeId == TargetId))
            {
                rt.Complete();
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + TargetId + (allowDefeat ? ", bezwingen erlaubt" : string.Empty) + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(targetId, string.Empty, "Ziel-Gegner");
        }
    }
}
