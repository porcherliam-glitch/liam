using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// The modifier formula of GDD 03 10.4 / architecture 11.5 as a pure function:
    /// <c>Value = (Base + Σ Flat) × (1 + Σ PercentAdd) × Π (1 + PercentMult_i)</c>, then soft cap, then clamp to min/max.
    /// </summary>
    public static class StatCalculator
    {
        /// <summary>
        /// At most this many multiplicative modifiers count per value (GDD 03 10.4: "hoechstens 3 multiplikative Quellen je
        /// Wert gleichzeitig"). Further ones are ignored until one of the first three is removed.
        /// </summary>
        public const int MaxMultiplicativeModifiers = 3;

        /// <summary>Computes a stat value. Allocation-free.</summary>
        /// <param name="baseValue">Base value (allocated points, formula result or type data).</param>
        /// <param name="modifiers">
        /// Modifiers of this stat, sorted by <see cref="StatModifier.Order"/> (stable). Only the first
        /// <see cref="MaxMultiplicativeModifiers"/> multiplicative ones count. Null = none.
        /// </param>
        /// <param name="rule">Soft cap and limits.</param>
        public static float Compute(float baseValue, IReadOnlyList<StatModifier> modifiers, in StatRule rule)
        {
            double flat = 0.0;
            double percentAdd = 0.0;
            double product = 1.0;
            int multiplicativeCount = 0;
            if (modifiers != null)
            {
                for (int i = 0; i < modifiers.Count; i++)
                {
                    StatModifier modifier = modifiers[i];
                    switch (modifier.Kind)
                    {
                        case StatModifierKind.Flat:
                            flat += modifier.Value;
                            break;
                        case StatModifierKind.PercentAdd:
                            percentAdd += modifier.Value;
                            break;
                        case StatModifierKind.PercentMult:
                            if (multiplicativeCount < MaxMultiplicativeModifiers)
                            {
                                product *= 1.0 + modifier.Value;
                                multiplicativeCount++;
                            }

                            break;
                    }
                }
            }

            double value = (baseValue + flat) * (1.0 + percentAdd) * product;
            return rule.Apply((float)value);
        }

        /// <summary>Number of multiplicative modifiers that are ignored because of <see cref="MaxMultiplicativeModifiers"/>.</summary>
        /// <param name="modifiers">Modifiers of one stat.</param>
        public static int CountIgnoredMultiplicative(IReadOnlyList<StatModifier> modifiers)
        {
            if (modifiers == null)
            {
                return 0;
            }

            int count = 0;
            for (int i = 0; i < modifiers.Count; i++)
            {
                if (modifiers[i].Kind == StatModifierKind.PercentMult)
                {
                    count++;
                }
            }

            return count > MaxMultiplicativeModifiers ? count - MaxMultiplicativeModifiers : 0;
        }
    }
}
