using System;

namespace Aetherfall.Conditions
{
    /// <summary>Always holds (architecture 7.2: placeholder, tests, "otherwise" branches).</summary>
    [Serializable]
    [TypeMenu("Logik/Immer", 10)]
    public sealed class Always : Condition
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

        /// <inheritdoc />
        public override string Describe()
        {
            return "immer";
        }
    }
}
