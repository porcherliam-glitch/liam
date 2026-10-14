using System;
using Aetherfall.Conditions;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>Condition without <c>[TypeMenu]</c>: the type picker lists it under "Sonstige". Always holds.</summary>
    [Serializable]
    public sealed class UnlabeledCondition : Condition
    {
        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return true;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.Constant();
        }
    }
}
