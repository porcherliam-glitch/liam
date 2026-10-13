using System;
using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// Spell power without magic weapon (GDD 03 10.3): <c>10 × (1 + 0.12 × (Level − 1)) × (1 + 0.025 × E(Int))</c> –
    /// half the spell power of a common staff of the same level. A magic weapon replaces it later
    /// (<see cref="StatFormulas.SpellPower"/>).
    /// </summary>
    [Serializable]
    public sealed class SpellPowerFormula : StatFormula
    {
        /// <inheritdoc />
        public override float Evaluate(IStatReader stats)
        {
            return StatFormulas.SpellPowerWithoutWeapon(stats.Get(StatId.Level), stats.Get(StatId.Intelligence));
        }

        /// <inheritdoc />
        public override void CollectDependencies(List<StatId> dependencies)
        {
            dependencies.Add(StatId.Level);
            dependencies.Add(StatId.Intelligence);
        }
    }
}
