using System;

namespace Aetherfall.Conditions
{
    /// <summary>Never holds (architecture 7.2: placeholder, tests, temporarily disabled content).</summary>
    [Serializable]
    [TypeMenu("Logik/Nie", 11)]
    public sealed class Never : Condition
    {
        /// <inheritdoc />
        public override bool Evaluate(in ConditionContext ctx)
        {
            return false;
        }

        /// <inheritdoc />
        public override void CollectTriggers(ITriggerCollector triggers)
        {
            triggers.Constant();
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "nie";
        }
    }
}
