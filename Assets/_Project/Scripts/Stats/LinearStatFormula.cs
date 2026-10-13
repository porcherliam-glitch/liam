using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Stats
{
    /// <summary>
    /// <c>Constant + PerEffectivePoint × E(Attribute) + PerLevel × (Level − 1)</c> – the shape of most derived values of
    /// GDD 03 10.3 (max health, stamina, mana, critical chance, status resistance, carry capacity, poise, luck).
    /// With <see cref="StatId.None"/> as attribute and 0 per level it is a constant.
    /// </summary>
    [Serializable]
    public sealed class LinearStatFormula : StatFormula
    {
        [Tooltip("Grundwert der Formel.")]
        [SerializeField] private float constant;

        [Tooltip("Attribut, dessen effektive Punkte E(x) eingehen (None = keines).")]
        [SerializeField] private StatId attribute;

        [Tooltip("Zuwachs je effektivem Attributpunkt E(x).")]
        [SerializeField] private float perEffectivePoint;

        [Tooltip("Zuwachs je Stufe über 1.")]
        [SerializeField] private float perLevel;

        /// <summary>Creates a formula with the constant 0 (for the Unity serializer and the inspector).</summary>
        public LinearStatFormula()
        {
        }

        /// <summary>Creates the formula.</summary>
        /// <param name="constant">Constant part.</param>
        /// <param name="attribute">Attribute whose effective points count, or <see cref="StatId.None"/>.</param>
        /// <param name="perEffectivePoint">Factor per effective attribute point.</param>
        /// <param name="perLevel">Factor per level above 1.</param>
        public LinearStatFormula(float constant, StatId attribute = StatId.None, float perEffectivePoint = 0f, float perLevel = 0f)
        {
            this.constant = constant;
            this.attribute = attribute;
            this.perEffectivePoint = perEffectivePoint;
            this.perLevel = perLevel;
        }

        /// <summary>Creates a constant formula.</summary>
        /// <param name="value">Constant value.</param>
        public static LinearStatFormula Constant(float value)
        {
            return new LinearStatFormula(value);
        }

        /// <inheritdoc />
        public override float Evaluate(IStatReader stats)
        {
            float result = constant;
            if (attribute != StatId.None && perEffectivePoint != 0f)
            {
                result += perEffectivePoint * StatFormulas.EffectivePoints(stats.Get(attribute));
            }

            if (perLevel != 0f)
            {
                result += perLevel * (stats.Get(StatId.Level) - 1f);
            }

            return result;
        }

        /// <inheritdoc />
        public override void CollectDependencies(List<StatId> dependencies)
        {
            if (attribute != StatId.None && perEffectivePoint != 0f)
            {
                dependencies.Add(attribute);
            }

            if (perLevel != 0f)
            {
                dependencies.Add(StatId.Level);
            }
        }
    }
}
