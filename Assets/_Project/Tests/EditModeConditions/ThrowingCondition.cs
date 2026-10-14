using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Tests.EditMode.Conditions
{
    /// <summary>Condition that always throws.</summary>
    [Serializable]
    public sealed class ThrowingCondition : Condition
    {
        public override bool Evaluate(in ConditionContext ctx)
        {
            throw new InvalidOperationException("boom");
        }

        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.On<SwitchFlipped>();
        }
    }
}
