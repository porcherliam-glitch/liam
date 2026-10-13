using System;
using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// Healing and mana regeneration factor (GDD 03 10.2/10.3): <c>1 + 0.02 × E(Wis)</c>.
    /// </summary>
    [Serializable]
    public sealed class WisdomFactorFormula : StatFormula
    {
        /// <inheritdoc />
        public override float Evaluate(IStatReader stats)
        {
            return StatFormulas.WisdomFactor(stats.Get(StatId.Wisdom));
        }

        /// <inheritdoc />
        public override void CollectDependencies(List<StatId> dependencies)
        {
            dependencies.Add(StatId.Wisdom);
        }
    }
}
