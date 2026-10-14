using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Objective "Toete X Gegner vom Typ Y" (GDD 02 5.1 type 1, short code <c>Toete</c>): counts <c>EnemyKilled</c> of a type,
    /// optionally of one variant (<c>enemy.wolf.grauwolf[aether_verderbt]</c>) and region. Kills by companions or the
    /// environment count too (GDD 02 5.2); the counter never goes down.
    /// </summary>
    [Serializable]
    [TypeMenu("Ziele/Töte Gegner (Anzahl)", 0)]
    public sealed class KillObjective : QuestObjective, IObjectiveListener<EnemyKilled>
    {
        [Tooltip("Gegnertyp-ID, z. B. enemy.wolf.grauwolf.")]
        [IdRef("enemy.")] [SerializeField] private string enemyTypeId = string.Empty;

        [Tooltip("Variante (optional), z. B. aether_verderbt. Leer = jede Variante.")]
        [SerializeField] private string variantId = string.Empty;

        [Tooltip("Anzahl.")]
        [Min(1)] [SerializeField] private int count = 1;

        [Tooltip("Gebiet (optional): nur Kills in dieser Region zählen. Leer = überall.")]
        [IdRef("region.")] [SerializeField] private string regionId = string.Empty;

        /// <summary>Creates an empty objective.</summary>
        public KillObjective()
        {
        }

        /// <summary>Creates the objective.</summary>
        /// <param name="id">Local id.</param>
        /// <param name="enemyTypeId">Enemy type id.</param>
        /// <param name="count">Number of kills.</param>
        /// <param name="variantId">Variant id or empty.</param>
        /// <param name="regionId">Region id or empty.</param>
        public KillObjective(string id, string enemyTypeId, int count, string variantId = "", string regionId = "") : base(id)
        {
            this.enemyTypeId = enemyTypeId ?? string.Empty;
            this.count = count;
            this.variantId = variantId ?? string.Empty;
            this.regionId = regionId ?? string.Empty;
        }

        /// <summary>Enemy type id.</summary>
        public string EnemyTypeId => enemyTypeId ?? string.Empty;

        /// <summary>Variant id or empty.</summary>
        public string VariantId => variantId ?? string.Empty;

        /// <inheritdoc />
        public override int RequiredCount => count;

        /// <inheritdoc />
        public override string ShortCode => "Töte";

        /// <inheritdoc />
        public override void RegisterListeners(IObjectiveEventRegistry registry)
        {
            registry.Listen<EnemyKilled>(this);
        }

        /// <inheritdoc />
        public void Handle(in EnemyKilled evt, ObjectiveRuntime rt, in QuestContext ctx)
        {
            if (evt.EnemyTypeId != EnemyTypeId)
            {
                return;
            }

            if (VariantId.Length > 0 && evt.VariantId != VariantId)
            {
                return;
            }

            if (!string.IsNullOrEmpty(regionId) && evt.RegionId != regionId)
            {
                return;
            }

            rt.Add(1);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return ShortCode + "(" + EnemyTypeId + (VariantId.Length > 0 ? "[" + VariantId + "]" : string.Empty) + ", " + count + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            base.Validate(report);
            report.RequireId(enemyTypeId, "enemy.", "Gegnertyp");
            if (!string.IsNullOrEmpty(regionId))
            {
                report.Mentions(regionId, "region.");
            }
        }
    }
}
