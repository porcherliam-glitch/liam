using System;
using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// Formula for the base value of a derived stat (architecture 11.5: "StatFormula als [SerializeReference] in
    /// StatFormulaSet"). The result is the base value; modifiers of the derived stat (equipment, buffs) apply on top.
    /// </summary>
    /// <remarks>
    /// Serializable so that a later balancing asset can hold formulas as <c>[SerializeReference]</c>. Implementations must be
    /// pure (no side effects, no Unity calls) and list every stat they read in <see cref="CollectDependencies"/>, so the
    /// collection knows which derived values become dirty.
    /// </remarks>
    [Serializable]
    public abstract class StatFormula
    {
        /// <summary>Computes the base value of the derived stat.</summary>
        /// <param name="stats">Final values of the other stats.</param>
        public abstract float Evaluate(IStatReader stats);

        /// <summary>Adds every stat read by <see cref="Evaluate"/> to <paramref name="dependencies"/>.</summary>
        /// <param name="dependencies">List to append to.</param>
        public abstract void CollectDependencies(List<StatId> dependencies);
    }
}
